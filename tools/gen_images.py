#!/usr/bin/env python3
"""Generate the scene photographs and the analyst keyframes with the OpenAI image API.

    OPENAI_API_KEY=... python3 tools/gen_images.py                 # everything in assets/img/prompts.json
    OPENAI_API_KEY=... python3 tools/gen_images.py --only castle,figure --quality medium
    OPENAI_API_KEY=... python3 tools/gen_images.py --candidates 2   # two variants each, into candidates/ folders
    python3 tools/gen_images.py --dry-run                           # show the plan, call nothing

Runs in the "Generate scene images" GitHub Actions workflow with the key kept as a
repository secret; it can equally run on a laptop.  Scenes with a 'reference' image use
the edits endpoint so the composition of the drawn scene (and the hotspots that depend
on it) survives; the analyst keyframes use the original portrait as the reference so she
stays the same person.  Outputs are JPEGs kept under ~900 KB.
"""
from __future__ import annotations

import argparse
import base64
import concurrent.futures as cf
import io
import json
import os
import re
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
API = "https://api.openai.com/v1"
MAX_BYTES = 900_000


def log(msg: str) -> None:
    print(msg, flush=True)


def headers(key: str) -> dict:
    return {"Authorization": f"Bearer {key}"}


def pick_model(key: str, wanted: str, requests) -> str:
    if wanted != "auto":
        return wanted
    try:
        r = requests.get(f"{API}/models", headers=headers(key), timeout=60)
        r.raise_for_status()
        ids = [m["id"] for m in r.json().get("data", [])]
    except Exception as exc:  # noqa: BLE001
        log(f"model list unavailable ({exc}); using gpt-image-1")
        return "gpt-image-1"
    candidates = [i for i in ids if i.startswith("gpt-image-") and "mini" not in i and not re.search(r"-\d{4}-\d{2}-\d{2}$", i)]
    def version(i: str):
        m = re.search(r"gpt-image-(\d+(?:\.\d+)?)", i)
        return float(m.group(1)) if m else 0.0
    candidates.sort(key=version, reverse=True)
    chosen = candidates[0] if candidates else "gpt-image-1"
    log(f"image model: {chosen}  (available: {', '.join(candidates) or 'none listed'})")
    return chosen


def call_with_retry(fn, what: str, attempts: int = 5):
    delay = 8
    for i in range(1, attempts + 1):
        try:
            return fn()
        except Exception as exc:  # noqa: BLE001
            status = getattr(getattr(exc, "response", None), "status_code", None)
            body = ""
            try:
                body = exc.response.text[:300]  # type: ignore[attr-defined]
            except Exception:  # noqa: BLE001
                pass
            if i == attempts or (status and status < 500 and status != 429):
                raise RuntimeError(f"{what}: {exc} {body}") from exc
            log(f"{what}: attempt {i} failed ({status or exc}); retrying in {delay}s")
            time.sleep(delay)
            delay = min(delay * 2, 90)


def generate(key: str, model: str, prompt: str, size: str, quality: str, requests) -> bytes:
    def go():
        r = requests.post(f"{API}/images/generations", headers=headers(key), timeout=300, json={
            "model": model, "prompt": prompt, "size": size, "quality": quality, "n": 1,
            "output_format": "jpeg", "output_compression": 90,
        })
        r.raise_for_status()
        return base64.b64decode(r.json()["data"][0]["b64_json"])
    return call_with_retry(go, "generation")


def edit(key: str, model: str, prompt: str, size: str, quality: str, reference: Path, requests) -> bytes:
    def go():
        mime = "image/png" if reference.suffix.lower() == ".png" else "image/jpeg"
        with reference.open("rb") as fh:
            r = requests.post(f"{API}/images/edits", headers=headers(key), timeout=300,
                              data={"model": model, "prompt": prompt, "size": size, "quality": quality, "n": "1",
                                    "output_format": "jpeg", "output_compression": "90", "input_fidelity": "high"},
                              files={"image[]": (reference.name, fh, mime)})
        if r.status_code == 400 and "input_fidelity" in r.text:
            with reference.open("rb") as fh2:
                r = requests.post(f"{API}/images/edits", headers=headers(key), timeout=300,
                                  data={"model": model, "prompt": prompt, "size": size, "quality": quality, "n": "1",
                                        "output_format": "jpeg", "output_compression": "90"},
                                  files={"image[]": (reference.name, fh2, mime)})
        r.raise_for_status()
        return base64.b64decode(r.json()["data"][0]["b64_json"])
    return call_with_retry(go, f"edit of {reference.name}")


def finish(data: bytes, out: Path, crop: str | None) -> None:
    """Crop to the requested aspect ratio if asked, and keep the JPEG under MAX_BYTES."""
    from PIL import Image
    im = Image.open(io.BytesIO(data)).convert("RGB")
    if crop:
        w_ratio, h_ratio = (int(x) for x in crop.split(":"))
        target = w_ratio / h_ratio
        w, h = im.size
        if w / h > target:
            nw = int(h * target); x0 = (w - nw) // 2; im = im.crop((x0, 0, x0 + nw, h))
        else:
            nh = int(w / target); y0 = (h - nh) // 2; im = im.crop((0, y0, w, y0 + nh))
    out.parent.mkdir(parents=True, exist_ok=True)
    quality = 90
    while True:
        buf = io.BytesIO()
        im.save(buf, "JPEG", quality=quality, optimize=True, progressive=True)
        if buf.tell() <= MAX_BYTES or quality <= 60:
            break
        quality -= 6
    out.write_bytes(buf.getvalue())
    log(f"wrote {out.relative_to(ROOT)}  {im.size[0]}x{im.size[1]}  {buf.tell() // 1024} KB  (q{quality})")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--config", type=Path, default=ROOT / "assets" / "img" / "prompts.json")
    ap.add_argument("--only", default="all", help="comma-separated scene ids and/or 'figure' (default: all)")
    ap.add_argument("--quality", default=None, help="override quality for everything: low | medium | high")
    ap.add_argument("--model", default=None, help="override the model id (default: prompts.json, 'auto' picks the newest gpt-image)")
    ap.add_argument("--workers", type=int, default=3)
    ap.add_argument("--candidates", type=int, default=1, help="variants per item; >1 writes to a candidates/ folder next to the final path instead of the final path")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args(argv)

    cfg = json.loads(args.config.read_text(encoding="utf-8"))
    only = None if args.only in ("", "all") else {s.strip() for s in args.only.split(",") if s.strip()}
    style = cfg.get("style", "")

    n_cand = max(1, args.candidates)

    def outputs(final: Path) -> list[Path]:
        if n_cand == 1:
            return [final]
        return [final.parent / "candidates" / f"{final.stem}-{k}{final.suffix}" for k in range(1, n_cand + 1)]

    jobs = []
    for scene in cfg.get("scenes", []):
        if only and scene["id"] not in only:
            continue
        ref = ROOT / scene["reference"] if scene.get("reference") else None
        for k, out in enumerate(outputs(ROOT / scene["out"]), start=1):
            jobs.append({"what": scene["id"] + (f" #{k}" if n_cand > 1 else ""), "out": out, "size": scene["size"],
                         "quality": args.quality or scene.get("quality", "high"), "crop": scene.get("crop"),
                         "prompt": scene["prompt"] + " " + style, "reference": ref})
    fig = cfg.get("figure")
    if fig and (not only or "figure" in only):
        ref = ROOT / fig["reference"]
        for frame in fig["frames"]:
            for k, out in enumerate(outputs(ROOT / fig["out_dir"] / f"{frame['id']}.jpg"), start=1):
                jobs.append({"what": f"figure/{frame['id']}" + (f" #{k}" if n_cand > 1 else ""), "out": out,
                             "size": fig["size"], "quality": args.quality or fig.get("quality", "high"), "crop": None,
                             "prompt": fig["base_prompt"] + frame["prompt"], "reference": ref})
    if not jobs:
        log("nothing selected"); return 2

    for j in jobs:
        kind = f"edit of {j['reference'].relative_to(ROOT)}" if j["reference"] else "generation"
        log(f"- {j['what']}: {kind}, {j['size']}, {j['quality']} -> {j['out'].relative_to(ROOT)}")
        if j["reference"] and not j["reference"].exists():
            log(f"  ERROR: reference {j['reference']} is missing"); return 2
    if args.dry_run:
        return 0

    key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not key:
        log("error: OPENAI_API_KEY is not set (add it as a repository secret or export it locally)"); return 1
    import requests  # noqa: WPS433  (installed by the workflow / requirements)

    model = pick_model(key, args.model or cfg.get("model", "auto"), requests)

    def run(j):
        started = time.time()
        if j["reference"]:
            data = edit(key, model, j["prompt"], j["size"], j["quality"], j["reference"], requests)
        else:
            data = generate(key, model, j["prompt"], j["size"], j["quality"], requests)
        finish(data, j["out"], j["crop"])
        return j["what"], time.time() - started

    failures = 0
    with cf.ThreadPoolExecutor(max_workers=max(1, args.workers)) as pool:
        for future in cf.as_completed([pool.submit(run, j) for j in jobs]):
            try:
                what, secs = future.result()
                log(f"done {what} in {secs:.0f}s")
            except Exception as exc:  # noqa: BLE001
                failures += 1
                log(f"FAILED: {exc}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
