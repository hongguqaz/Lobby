#!/usr/bin/env python3
"""Match the exposure and colour of the analyst's keyframes to her resting portrait.

    python3 tools/match_frames.py            # rewrites fin-lab/assets/frames/*.jpg in place
    python3 tools/match_frames.py --dry-run  # report the fitted gains and offsets only

Each keyframe is a separate render, so its overall brightness and white balance drift a
little from the portrait; played one after another that drift reads as a flicker.  This
fits one gain and offset per colour channel that maps a keyframe onto the portrait, using
only the pixels the two have in common (the room, not the moving figure: pixels whose
residual stays small are kept and the fit is repeated), and applies it to the whole frame.
Run it before tools/morph_frames.py.  Needs opencv-python-headless and numpy.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FRAMES = ROOT / "fin-lab" / "assets" / "frames"
BASE = ROOT / "fin-lab" / "assets" / "analyst.jpg"


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--quality", type=int, default=93)
    args = ap.parse_args(argv)
    try:
        import cv2
        import numpy as np
    except ImportError as exc:
        print(f"error: {exc}. pip install opencv-python-headless numpy"); return 1

    base = cv2.imread(str(BASE))
    if base is None:
        print(f"error: {BASE} missing"); return 1
    small_base = cv2.resize(base, (256, 384), interpolation=cv2.INTER_AREA).astype(np.float32)

    def fit(frame):
        """Per-channel gain/offset frame -> base over the pixels both share."""
        f = cv2.resize(frame, (256, 384), interpolation=cv2.INTER_AREA).astype(np.float32)
        keep = np.ones(f.shape[:2], bool)
        gains = np.ones(3); offs = np.zeros(3)
        for thresh in (60, 30, 18, 12):
            for c in range(3):
                x, y = f[..., c][keep], small_base[..., c][keep]
                A = np.stack([x, np.ones_like(x)], 1)
                (g, o), *_ = np.linalg.lstsq(A, y, rcond=None)
                gains[c], offs[c] = g, o
            mapped = f * gains + offs
            resid = np.abs(mapped - small_base).max(axis=2)
            resid = cv2.GaussianBlur(resid, (0, 0), 2)
            keep = resid < thresh
            if keep.mean() < 0.08:          # never fit on almost nothing
                break
        return gains, offs, keep.mean()

    for p in sorted(FRAMES.glob("*.jpg")):
        if p.stem.endswith(("-in", "-out")):
            continue          # a clip's own first/last frame must stay identical to the clip
        frame = cv2.imread(str(p))
        if frame is None or abs(frame.shape[1] / frame.shape[0] - base.shape[1] / base.shape[0]) > 0.01:
            print(f"skip {p.name}: aspect ratio differs from the portrait"); continue
        gains, offs, share = fit(frame)
        lum_gain = float(np.dot(gains, [0.114, 0.587, 0.299]))
        print(f"{p.stem:7s} gain B/G/R = {gains[0]:.3f}/{gains[1]:.3f}/{gains[2]:.3f}  offset = {offs[0]:+.1f}/{offs[1]:+.1f}/{offs[2]:+.1f}"
              f"  (fitted on {share:.0%} of the frame, luminance x{lum_gain:.3f})")
        if args.dry_run:
            continue
        out = np.clip(frame.astype(np.float32) * gains + offs, 0, 255).astype(np.uint8)
        cv2.imwrite(str(p), out, [cv2.IMWRITE_JPEG_QUALITY, args.quality, cv2.IMWRITE_JPEG_PROGRESSIVE, 1])
    return 0


if __name__ == "__main__":
    sys.exit(main())
