#!/usr/bin/env python3
"""Build the in-between frames that let the Fin Lab analyst move smoothly.

    python3 tools/morph_frames.py            # every pair in PAIRS that has both keyframes
    python3 tools/morph_frames.py --k 12     # more in-betweens per transition

For each pair of poses (the portraits analyst.jpg and analyst-mid.jpg, the keyframes and the
clip end frames in fin-lab/assets/frames/)
this computes optical flow between the two photographs and synthesises K frames that warp
and dissolve one into the other, so a blink closes gradually, a head tilt turns, and a
hand rises into view instead of appearing.  Where something new enters the picture (a
raised hand) the flow has nothing to track, so the hand is cut out of the target frame and
travels from where it starts (the lower hand pose, or below its place) to where it ends,
gaining opacity on the way.

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
    # with the mid-rise keyframes present, the hand travels in two legs instead of appearing
    ("base", "wave-mid"), ("look", "wave-mid"), ("wave-mid", "wave"),
    ("base", "point-mid"), ("look", "point-mid"), ("point-mid", "point"),
    # the attentive pose she keeps between clips; the clips' own pairs come from clips.json
    ("base", "mid"), ("mid", "blink"),
]
CLIPS_JSON = ROOT / "fin-lab" / "assets" / "clips" / "clips.json"


def clip_pairs():
    """Transitions the page plays around the clips: into each clip from the pose it starts
    from, out of it to the attentive pose, and from every acknowledgement straight into
    every piece of work."""
    if not CLIPS_JSON.exists():
        return []
    clips = json.loads(CLIPS_JSON.read_text())["clips"]
    by_kind = {}
    for name, c in clips.items():
        by_kind.setdefault(c["kind"], []).append(name)
    pairs = []
    for name, c in clips.items():
        k = c["kind"]
        if k == "greet":
            pairs += [("base", f"{name}-in"), (f"{name}-out", "mid")]
        elif k == "ack":
            pairs += [("mid", f"{name}-in"), (f"{name}-out", "mid")]
            pairs += [(f"{name}-out", f"{w}-in") for w in by_kind.get("work", [])]
        elif k == "work":
            pairs += [("mid", f"{name}-in"), (f"{name}-out", "mid")]
        elif k == "bye":
            pairs += [("mid", f"{name}-in"), (f"{name}-out", "base")]
    return pairs
PHOTOS = {"base": "analyst.jpg", "mid": "analyst-mid.jpg"}   # poses that are photographs, not keyframes
VIA = {"wave": "wave-mid", "point": "point-mid"}   # pose -> the mid pose to pass through when it exists
RAISED = {"wave", "point", "wave-mid", "point-mid"}   # poses with a hand up: it rises into view, or sinks out
RAISED_ORDER = {"wave-mid": 1, "wave": 2, "point-mid": 1, "point": 2}   # higher = hand higher


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--k", type=int, default=8, help="in-between frames per transition")
    ap.add_argument("--quality", type=int, default=80, help="WebP quality")
    ap.add_argument("--force", action="store_true", help="rebuild strips even when they are newer than their poses")
    args = ap.parse_args(argv)
    try:
        import cv2
        import numpy as np
        from PIL import Image
    except ImportError as exc:
        print(f"error: {exc}. pip install opencv-python-headless numpy pillow"); return 1

    def path(pose: str) -> Path:
        return FRAMES.parent / PHOTOS[pose] if pose in PHOTOS else FRAMES / f"{pose}.jpg"

    def load(pose: str):
        im = cv2.imread(str(path(pose)))
        return cv2.resize(im, (W, H), interpolation=cv2.INTER_AREA)

    def flow(a, b):
        dis = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM)
        dis.setUseSpatialPropagation(True)
        return dis.calc(cv2.cvtColor(a, cv2.COLOR_BGR2GRAY), cv2.cvtColor(b, cv2.COLOR_BGR2GRAY), None)

    def appearance_mask(a, b, fab):
        """The region of b that a cannot account for (a hand that is up in b): warping a onto b
        with the flow leaves a large blob of residual there, while a head turn or a blink is
        explained by the flow.  Returns a feathered float mask in [0,1] and its centroid (y, x),
        or (None, None)."""
        ys, xs = np.mgrid[0:H, 0:W].astype(np.float32)
        warped = cv2.remap(a, xs - fab[..., 0], ys - fab[..., 1], cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
        diff = cv2.absdiff(cv2.cvtColor(warped, cv2.COLOR_BGR2GRAY), cv2.cvtColor(b, cv2.COLOR_BGR2GRAY))
        diff = cv2.GaussianBlur(diff, (0, 0), 3)
        mask = (diff > 28).astype(np.uint8)
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((7, 7), np.uint8))
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((31, 31), np.uint8))
        mask = cv2.dilate(mask, np.ones((17, 17), np.uint8))
        n, labels, stats, cents = cv2.connectedComponentsWithStats(mask)
        if n < 2:
            return None, None
        # the hand is the largest blob; smaller differences (a sleeve on the desk) are left to the dissolve
        big = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
        if stats[big, cv2.CC_STAT_AREA] < 0.012 * W * H:
            return None, None
        keep = (labels == big).astype(np.uint8)
        # only the hand travels: the dark sleeve stays with the dissolve, so it never smears
        # across the desk on its way up
        ycc = cv2.cvtColor(b, cv2.COLOR_BGR2YCrCb)
        skin = ((ycc[..., 1] > 133) & (ycc[..., 1] < 178) & (ycc[..., 2] > 80) & (ycc[..., 2] < 135) & (ycc[..., 0] > 60)).astype(np.uint8)
        skin = cv2.morphologyEx(skin, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
        skin = cv2.dilate(skin, np.ones((7, 7), np.uint8))
        hand = keep & skin
        if hand.sum() > 0.004 * W * H:
            keep = hand
        ys_k, xs_k = np.where(keep)
        feather = cv2.GaussianBlur(keep.astype(np.float32), (0, 0), 6)
        return np.clip(feather / max(feather.max(), 1e-6), 0, 1), (float(ys_k.mean()), float(xs_k.mean()))

    def shift(img, dy, dx):
        M = np.float32([[1, 0, dx], [0, 1, dy]])
        return cv2.warpAffine(img, M, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)

    def inbetweens(a, b, k, rise):
        """rise: 'b' when b's hand is higher than a's (or a has none), 'a' for the reverse (built
        as the reverse of the rising sequence), None for flow-only transitions."""
        if rise == "a":
            frames, wiped = inbetweens(b, a, k, "b")
            return frames[::-1], wiped
        fab, fba = flow(a, b), flow(b, a)
        mask, cent = appearance_mask(a, b, fab) if rise == "b" else (None, None)
        travel = None
        if mask is not None:
            # Where does the hand start?  At a's hand if a has one up, otherwise below its place.
            mask_a, cent_a = appearance_mask(b, a, fba)
            if mask_a is not None and cent_a[0] > cent[0]:
                travel = (cent_a[0] - cent[0], cent_a[1] - cent[1])
            else:
                travel = (0.32 * H, 0.0)     # from the lap: it enters over the bottom edge
        ys, xs = np.mgrid[0:H, 0:W].astype(np.float32)
        frames = []
        for i in range(1, k + 1):
            te = i / (k + 1)                 # evenly spaced; the page applies the easing
            wa = cv2.remap(a, xs - te * fab[..., 0], ys - te * fab[..., 1], cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
            wb = cv2.remap(b, xs - (1 - te) * fba[..., 0], ys - (1 - te) * fba[..., 1], cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
            out = cv2.addWeighted(wa, 1 - te, wb, te, 0).astype(np.float32)
            if mask is not None:
                # The hand itself travels from where it starts to where it ends, gaining opacity
                # on the way, drawn over the dissolve of everything else.
                dy, dx = travel[0] * (1 - te), travel[1] * (1 - te)
                hand = shift(b, dy, dx).astype(np.float32)
                alpha = (shift(mask, dy, dx) * min(1.0, 0.45 + te * 2.2))[..., None]
                out = out * (1 - alpha) + hand * alpha
            frames.append(np.clip(out, 0, 255).astype(np.uint8))
        return frames, mask is not None

    OUT.mkdir(parents=True, exist_ok=True)
    pairs = PAIRS + [pr for pr in clip_pairs() if pr not in PAIRS]
    wanted = {f"{a}-{b}.webp" for a, b in pairs}
    for stale in OUT.glob("*.webp"):
        if stale.name not in wanted:
            stale.unlink(); print(f"removed stale {stale.relative_to(ROOT)}")
    manifest = {"width": W, "height": H, "frames": args.k, "pairs": [], "via": {}}
    for a_id, b_id in pairs:
        if not (path(a_id).exists() and path(b_id).exists()):
            print(f"skip {a_id}-{b_id}: keyframe missing"); continue
        out = OUT / f"{a_id}-{b_id}.webp"
        if out.exists() and not args.force and out.stat().st_mtime > max(path(a_id).stat().st_mtime, path(b_id).stat().st_mtime):
            manifest["pairs"].append(f"{a_id}-{b_id}"); continue
        a, b = load(a_id), load(b_id)
        ra, rb = RAISED_ORDER.get(a_id, 0), RAISED_ORDER.get(b_id, 0)
        rise = "b" if rb > ra else "a" if ra > rb else None
        frames, wiped = inbetweens(a, b, args.k, rise)
        strip = cv2.cvtColor(cv2.hconcat(frames), cv2.COLOR_BGR2RGB)
        Image.fromarray(strip).save(out, "WEBP", quality=args.quality, method=6)
        manifest["pairs"].append(f"{a_id}-{b_id}")
        print(f"wrote {out.relative_to(ROOT)}  {strip.shape[1]}x{strip.shape[0]}  {out.stat().st_size // 1024} KB" + ("  (hand travel)" if wiped else ""))
    for pose, mid in VIA.items():
        if path(mid).exists() and path(pose).exists():
            manifest["via"][pose] = mid
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=1) + "\n")
    # the page reads it as a script so it also works from file:// and without fetch
    (OUT / "manifest.js").write_text("window.LOBBY_MORPH = " + json.dumps(manifest) + ";\n")
    print(f"manifest: {len(manifest['pairs'])} transitions, {args.k} frames each")
    return 0


if __name__ == "__main__":
    sys.exit(main())
