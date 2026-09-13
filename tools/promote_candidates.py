#!/usr/bin/env python3
"""Choose the final scene images from the numbered candidates.

    python3 tools/promote_candidates.py --list                       # what candidates exist
    python3 tools/promote_candidates.py --sheet /tmp/sheet.jpg       # contact sheet of every candidate, for review
    python3 tools/promote_candidates.py castle=2 fin-lab=1 look=2    # copy the picks to their final paths
    python3 tools/promote_candidates.py --first                      # take candidate 1 of everything
    python3 tools/promote_candidates.py --clean                      # delete the candidates/ folders

`tools/gen_images.py --candidates N` writes assets/img/candidates/<scene>-<k>.jpg and
fin-lab/assets/frames/candidates/<frame>-<k>.jpg.  This script copies the chosen variant of
each to assets/img/<scene>.jpg or fin-lab/assets/frames/<frame>.jpg and, with --clean,
removes the candidates folders so only the final images ship.
"""
from __future__ import annotations

import argparse
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FOLDERS = [ROOT / "assets" / "img", ROOT / "fin-lab" / "assets" / "frames"]
NAME = re.compile(r"^(?P<stem>.+)-(?P<k>\d+)\.(?P<ext>jpe?g|png|webp)$", re.I)


def candidates() -> dict[str, dict[int, Path]]:
    found: dict[str, dict[int, Path]] = {}
    for folder in FOLDERS:
        cdir = folder / "candidates"
        if not cdir.is_dir():
            continue
        for path in sorted(cdir.iterdir()):
            m = NAME.match(path.name)
            if m:
                found.setdefault(m["stem"], {})[int(m["k"])] = path
    return found


def final_path(path: Path) -> Path:
    stem = NAME.match(path.name)["stem"]
    return path.parent.parent / f"{stem}{path.suffix.lower().replace('.jpeg', '.jpg')}"


def contact_sheet(found: dict[str, dict[int, Path]], out: Path, thumb_w: int = 480) -> None:
    from PIL import Image, ImageDraw
    rows = []
    for stem, variants in found.items():
        thumbs = []
        for k in sorted(variants):
            im = Image.open(variants[k]).convert("RGB")
            h = round(im.height * thumb_w / im.width)
            thumbs.append((k, im.resize((thumb_w, h))))
        rows.append((stem, thumbs))
    if not rows:
        raise SystemExit("no candidates found")
    pad, label_h = 12, 28
    width = pad + max(len(t) for _, t in rows) * (thumb_w + pad)
    height = sum(label_h + max(im.height for _, im in t) + pad for _, t in rows) + pad
    sheet = Image.new("RGB", (width, height), (24, 24, 28))
    draw = ImageDraw.Draw(sheet)
    y = pad
    for stem, thumbs in rows:
        draw.text((pad, y), stem, fill=(235, 235, 240))
        y += label_h
        x = pad
        for k, im in thumbs:
            sheet.paste(im, (x, y))
            draw.rectangle((x, y, x + 34, y + 22), fill=(0, 0, 0))
            draw.text((x + 8, y + 5), f"#{k}", fill=(255, 220, 120))
            x += thumb_w + pad
        y += max(im.height for _, im in thumbs) + pad
    out.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out, quality=85)
    print(f"wrote {out}  {sheet.width}x{sheet.height}")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("picks", nargs="*", help="stem=k pairs, e.g. castle=2 look=1")
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--sheet", type=Path, help="write a contact sheet of all candidates to this path")
    ap.add_argument("--first", action="store_true", help="promote candidate 1 of every stem that has no explicit pick")
    ap.add_argument("--clean", action="store_true", help="delete the candidates/ folders afterwards")
    args = ap.parse_args(argv)

    found = candidates()
    if args.list or not (args.picks or args.first or args.sheet or args.clean):
        if not found:
            print("no candidates (run tools/gen_images.py --candidates 2 first)")
        for stem, variants in found.items():
            print(f"{stem}: " + ", ".join(f"#{k} {variants[k].relative_to(ROOT)}" for k in sorted(variants)))
        if not (args.picks or args.first or args.sheet or args.clean):
            return 0

    if args.sheet:
        contact_sheet(found, args.sheet)

    picks: dict[str, int] = {}
    for item in args.picks:
        if "=" not in item:
            print(f"error: expected stem=k, got {item!r}"); return 2
        stem, k = item.split("=", 1)
        picks[stem.strip()] = int(k)
    if args.first:
        for stem in found:
            picks.setdefault(stem, 1)

    failures = 0
    for stem, k in picks.items():
        variants = found.get(stem)
        if not variants or k not in variants:
            have = ", ".join(f"#{n}" for n in sorted(variants)) if variants else "nothing"
            print(f"error: no candidate #{k} for {stem!r} (have {have})"); failures += 1; continue
        src = variants[k]
        dst = final_path(src)
        shutil.copyfile(src, dst)
        print(f"{stem}: candidate #{k} -> {dst.relative_to(ROOT)}  ({dst.stat().st_size // 1024} KB)")

    if args.clean and not failures:
        for folder in FOLDERS:
            cdir = folder / "candidates"
            if cdir.is_dir():
                shutil.rmtree(cdir)
                print(f"removed {cdir.relative_to(ROOT)}/")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
