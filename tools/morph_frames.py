#!/usr/bin/env python3
"""Build the in-between frames that let the Fin Lab analyst move smoothly.

    python3 tools/morph_frames.py            # every pair in PAIRS that has both keyframes
    python3 tools/morph_frames.py --k 8      # more in-betweens per transition

For each pair of poses (the resting portrait and the keyframes in fin-lab/assets/frames/)
this computes optical flow between the two photographs and synthesises K frames that warp
and dissolve one into the other, so a blink closes gradually, a head tilt turns, and a
hand rises into view instead of appearing.  Where something new enters the picture (a
raised hand) the flow has nothing to track, so that region is revealed with a soft wipe
from the bottom up while it slides into place.

Output: fin-lab/assets/frames/morph/<a>-<b>.webp, a horizontal strip of the K in-betweens
(played left to right for a -> b, right to left for b -> a), plus morph/manifest.json and
manifest.js (the page loads the latter).
Needs opencv-python-headless, numpy and pillow.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FRAMES = ROOT / "fin-lab" / "assets" / "frames"
BASE = ROOT / "fin-lab" / "assets" / "analyst.jpg"
OUT = FRAMES / "morph"
W, H = 512, 768
PAIRS = [   # every transition the page plays; b -> a is the same strip played backwards
    ("base", "look"), ("base", "blink"), ("base", "listen"), ("base", "wave"), ("base", "point"),
    ("look", "talk"), ("look", "wave"), ("look", "point"), ("look", "blink"), ("look", "listen"),
]
RAISED = {"wave", "point"}   # poses where a hand is up: it rises into view, or sinks out of it


def smoothstep(t: float) -> float:
    return t * t * (3 - 2 * t)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--k", type=int, default=6, help="in-between frames per transition")
    ap.add_argument("--quality", type=int, default=80, help="WebP quality")
    args = ap.parse_args(argv)
    try:
        import cv2
        import numpy as np
        from PIL import Image
    except ImportError as exc:
        print(f"error: {exc}. pip install opencv-python-headless numpy pillow"); return 1

    def path(pose: str) -> Path:
        return BASE if pose == "base" else FRAMES / f"{pose}.jpg"

    def load(pose: str):
        im = cv2.imread(str(path(pose)))
        return cv2.resize(im, (W, H), interpolation=cv2.INTER_AREA)

    def flow(a, b):
        dis = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM)
        dis.setUseSpatialPropagation(True)
        return dis.calc(cv2.cvtColor(a, cv2.COLOR_BGR2GRAY), cv2.cvtColor(b, cv2.COLOR_BGR2GRAY), None)

    def appearance_mask(a, b, fab):
        """Where b shows something that is not in a at all (a hand coming up).  A head turn or a
        blink is explained by the flow, so warping a onto b leaves little residual there; a new
        object leaves a large blob of residual.  Returns a feathered float mask in [0,1] and its
        bounding box, or None."""
        ys, xs = np.mgrid[0:H, 0:W].astype(np.float32)
        warped = cv2.remap(a, xs - fab[..., 0], ys - fab[..., 1], cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
        diff = cv2.absdiff(cv2.cvtColor(warped, cv2.COLOR_BGR2GRAY), cv2.cvtColor(b, cv2.COLOR_BGR2GRAY))
        diff = cv2.GaussianBlur(diff, (0, 0), 3)
        mask = (diff > 28).astype(np.uint8)
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((7, 7), np.uint8))
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((31, 31), np.uint8))
        mask = cv2.dilate(mask, np.ones((21, 21), np.uint8))
        n, labels, stats, _ = cv2.connectedComponentsWithStats(mask)
        keep = np.zeros_like(mask)
        for i in range(1, n):
            if stats[i, cv2.CC_STAT_AREA] > 0.012 * W * H:
                keep[labels == i] = 1
        if not keep.any():
            return None, None
        ys, xs = np.where(keep)
        box = (xs.min(), ys.min(), xs.max(), ys.max())
        feather = cv2.GaussianBlur(keep.astype(np.float32), (0, 0), 8)
        return np.clip(feather / max(feather.max(), 1e-6), 0, 1), box

    def inbetweens(a, b, k, rise):
        """rise: 'b' when b brings a hand up, 'a' when a's raised hand goes down (built as the
        reverse of the rising sequence), None for flow-only transitions."""
        if rise == "a":
            frames, wiped = inbetweens(b, a, k, "b")
            return frames[::-1], wiped
        fab, fba = flow(a, b), flow(b, a)
        mask, box = appearance_mask(a, b, fab) if rise == "b" else (None, None)
        ys, xs = np.mgrid[0:H, 0:W].astype(np.float32)
        frames = []
        for i in range(1, k + 1):
            te = smoothstep(i / (k + 1))
            wa = cv2.remap(a, xs - te * fab[..., 0], ys - te * fab[..., 1], cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
            wb = cv2.remap(b, xs - (1 - te) * fba[..., 0], ys - (1 - te) * fba[..., 1], cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
            out = cv2.addWeighted(wa, 1 - te, wb, te, 0).astype(np.float32)
            if mask is not None:
                # The new thing slides up into place while a soft wipe uncovers it from below.
                x0, y0, x1, y1 = box
                rise = int(0.10 * H * (1 - te))
                shifted = np.roll(b, rise, axis=0).astype(np.float32)
                if rise:
                    shifted[:rise] = b[:rise]
                line = y1 - (y1 - y0 + 40) * min(1.0, te * 1.25)          # wipe front, moving up
                wipe = np.clip((ys - line) / 28.0 + 0.5, 0, 1)             # 1 below the front, 0 above
                alpha = (mask * wipe)[..., None]
                out = out * (1 - alpha) + shifted * alpha
            frames.append(np.clip(out, 0, 255).astype(np.uint8))
        return frames, mask is not None

    OUT.mkdir(parents=True, exist_ok=True)
    wanted = {f"{a}-{b}.webp" for a, b in PAIRS}
    for stale in OUT.glob("*.webp"):
        if stale.name not in wanted:
            stale.unlink(); print(f"removed stale {stale.relative_to(ROOT)}")
    manifest = {"width": W, "height": H, "frames": args.k, "pairs": []}
    for a_id, b_id in PAIRS:
        if not (path(a_id).exists() and path(b_id).exists()):
            print(f"skip {a_id}-{b_id}: keyframe missing"); continue
        a, b = load(a_id), load(b_id)
        rise = "b" if (b_id in RAISED and a_id not in RAISED) else "a" if (a_id in RAISED and b_id not in RAISED) else None
        frames, wiped = inbetweens(a, b, args.k, rise)
        strip = cv2.cvtColor(cv2.hconcat(frames), cv2.COLOR_BGR2RGB)
        out = OUT / f"{a_id}-{b_id}.webp"
        Image.fromarray(strip).save(out, "WEBP", quality=args.quality, method=6)
        manifest["pairs"].append(f"{a_id}-{b_id}")
        print(f"wrote {out.relative_to(ROOT)}  {strip.shape[1]}x{strip.shape[0]}  {out.stat().st_size // 1024} KB" + ("  (rise wipe)" if wiped else ""))
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=1) + "\n")
    # the page reads it as a script so it also works from file:// and without fetch
    (OUT / "manifest.js").write_text("window.LOBBY_MORPH = " + json.dumps(manifest) + ";\n")
    print(f"manifest: {len(manifest['pairs'])} transitions, {args.k} frames each")
    return 0


if __name__ == "__main__":
    sys.exit(main())
