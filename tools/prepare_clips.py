#!/usr/bin/env python3
"""Fit the analyst's video clips to her photographs.

    python3 tools/prepare_clips.py                 # every clip in fin-lab/assets/clips/src/
    python3 tools/prepare_clips.py --only greet    # one clip
    python3 tools/prepare_clips.py --ffmpeg /path/to/ffmpeg

Each clip in fin-lab/assets/clips/src/<name>.mp4 was generated separately, so its framing
(how far the camera stands) and exposure drift from the photographs the page rests on. For
each clip this

  1. finds the crop of the clip that matches the photograph its first frame resembles
     (an affine alignment of the first frame against the photo, so the clip is re-framed
     the way the photo is framed),
  2. fits one gain and offset per colour channel on the pixels the two share and applies it,
  3. re-encodes to 768x1152 as an H.264 MP4 and a VP9 WebM (both with the audio) into
     fin-lab/assets/clips/; the page offers both and the browser takes the one it plays,
  4. writes the processed clip's first and last frames to fin-lab/assets/frames/<name>-in.jpg
     and <name>-out.jpg, which tools/morph_frames.py joins to the photographs.

CLIPS below says which photograph each clip starts from and ends at.  Needs ffmpeg on PATH
(or --ffmpeg), opencv-python-headless and numpy.
"""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FIN = ROOT / "fin-lab" / "assets"
SRC = FIN / "clips" / "src"
OUT = FIN / "clips"
FRAMES = FIN / "frames"
W, H = 768, 1152
# name -> (pose the clip starts from, pose it ends at); 'base' is analyst.jpg, 'mid' analyst-mid.jpg
CLIPS = {
    "greet": ("base", "mid"),   # she looks up from the screen, waves and says hello
    "ack": ("mid", "mid"),      # "yes, understood"
    "work": ("base", "base"),   # turns to the screen and works, smiling
    "bye": ("mid", "base"),     # "see you again", then back to work
}
PHOTOS = {"base": FIN / "analyst.jpg", "mid": FIN / "analyst-mid.jpg"}


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--only", default="", help="comma-separated clip names")
    ap.add_argument("--ffmpeg", default=shutil.which("ffmpeg") or "ffmpeg")
    ap.add_argument("--crf", type=int, default=20)
    args = ap.parse_args(argv)
    try:
        import cv2
        import numpy as np
    except ImportError as exc:
        print(f"error: {exc}. pip install opencv-python-headless numpy"); return 1

    def cover(im):
        """Resize and centre-crop to W x H, the way object-fit: cover shows the clip."""
        ih, iw = im.shape[:2]
        s = max(W / iw, H / ih)
        r = cv2.resize(im, (round(iw * s), round(ih * s)), interpolation=cv2.INTER_AREA)
        y0, x0 = (r.shape[0] - H) // 2, (r.shape[1] - W) // 2
        return r[y0:y0 + H, x0:x0 + W]

    def first_frame(path):
        cap = cv2.VideoCapture(str(path))
        ok, fr = cap.read()
        cap.release()
        if not ok:
            raise SystemExit(f"cannot read {path}")
        return fr

    def align(photo, frame):
        """Affine (scale + shift) taking photo coordinates to frame coordinates, both W x H."""
        g1 = cv2.cvtColor(cv2.resize(photo, (W // 2, H // 2)), cv2.COLOR_BGR2GRAY).astype(np.float32) / 255
        g2 = cv2.cvtColor(cv2.resize(frame, (W // 2, H // 2)), cv2.COLOR_BGR2GRAY).astype(np.float32) / 255
        warp = np.eye(2, 3, dtype=np.float32)
        cc, warp = cv2.findTransformECC(g1, g2, warp, cv2.MOTION_AFFINE,
                                        (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 300, 1e-6), None, 5)
        sx = float(np.hypot(warp[0, 0], warp[1, 0])); sy = float(np.hypot(warp[0, 1], warp[1, 1]))
        scale = (sx + sy) / 2
        tx, ty = float(warp[0, 2]) * 2, float(warp[1, 2]) * 2
        return cc, scale, tx, ty

    def colour_fit(photo, frame):
        """Per-channel gain/offset frame -> photo over the pixels they share (iteratively reweighted)."""
        f = cv2.resize(frame, (256, 384), interpolation=cv2.INTER_AREA).astype(np.float32)
        p = cv2.resize(photo, (256, 384), interpolation=cv2.INTER_AREA).astype(np.float32)
        keep = np.ones(f.shape[:2], bool)
        gains, offs = np.ones(3), np.zeros(3)
        for thresh in (60, 30, 18, 12):
            for c in range(3):
                x, y = f[..., c][keep], p[..., c][keep]
                (g, o), *_ = np.linalg.lstsq(np.stack([x, np.ones_like(x)], 1), y, rcond=None)
                gains[c], offs[c] = g, o
            resid = cv2.GaussianBlur(np.abs(f * gains + offs - p).max(axis=2), (0, 0), 2)
            keep = resid < thresh
            if keep.mean() < 0.08:
                break
        return gains, offs, float(keep.mean())

    wanted = {s.strip() for s in args.only.split(",") if s.strip()}
    OUT.mkdir(parents=True, exist_ok=True); FRAMES.mkdir(parents=True, exist_ok=True)
    report = {}
    for name, (start, end) in CLIPS.items():
        src = SRC / f"{name}.mp4"
        if wanted and name not in wanted:
            continue
        if not src.exists():
            print(f"skip {name}: {src.relative_to(ROOT)} missing"); continue
        photo = cv2.imread(str(PHOTOS[start]))
        raw = first_frame(src)
        frame = cover(raw)
        cc, scale, tx, ty = align(photo, frame)
        # The photo's view is the window [tx, tx + scale*W] x [ty, ty + scale*H] of the covered clip.
        # Only re-frame when the difference is real; a couple of percent is left to the morph.
        reframe = abs(scale - 1) > 0.04 or abs(tx) > 25 or abs(ty) > 25
        crop_w, crop_h = scale * W, scale * H
        x0, y0 = tx, ty
        # keep the window inside the frame
        x0 = min(max(0.0, x0), W - crop_w) if crop_w <= W else 0.0
        y0 = min(max(0.0, y0), H - crop_h) if crop_h <= H else 0.0
        if crop_w > W or crop_h > H:
            reframe = False
        # colour fit on the re-framed first frame
        if reframe:
            M = np.float32([[1 / scale, 0, -x0 / scale], [0, 1 / scale, -y0 / scale]])
            framed = cv2.warpAffine(frame, M, (W, H), flags=cv2.INTER_LINEAR)
        else:
            framed = frame
        gains, offs, share = colour_fit(photo, framed)
        lum = float(np.dot(gains, [0.114, 0.587, 0.299]))
        print(f"{name:6s} start={start} end={end} align cc={cc:.3f} scale={scale:.3f} shift=({tx:+.0f},{ty:+.0f})"
              f" reframe={'yes' if reframe else 'no'} gain B/G/R={gains[0]:.3f}/{gains[1]:.3f}/{gains[2]:.3f}"
              f" offset={offs[0]:+.1f}/{offs[1]:+.1f}/{offs[2]:+.1f} (on {share:.0%}, luminance x{lum:.3f})")

        # ---- ffmpeg filter chain: cover -> crop -> scale -> per-channel affine colour -> 768x1152
        ih, iw = raw.shape[:2]
        s = max(W / iw, H / ih)
        cw, ch = round(iw * s), round(ih * s)
        vf = [f"scale={cw}:{ch}:flags=lanczos", f"crop={W}:{H}:{(cw - W) // 2}:{(ch - H) // 2}"]
        if reframe:
            vf.append(f"crop={crop_w:.0f}:{crop_h:.0f}:{x0:.0f}:{y0:.0f}")
            vf.append(f"scale={W}:{H}:flags=lanczos")
        # lutrgb works in RGB order; our gains are BGR
        def lut(g, o):
            return f"clip(val*{g:.4f}+{o:.2f},0,255)"
        vf.append("format=rgb24")
        vf.append(f"lutrgb=r='{lut(gains[2], offs[2])}':g='{lut(gains[1], offs[1])}':b='{lut(gains[0], offs[0])}'")
        vf.append("format=yuv420p")
        out = OUT / f"{name}.mp4"
        cmd = [args.ffmpeg, "-y", "-hide_banner", "-loglevel", "error", "-i", str(src), "-map", "0:v:0", "-map", "0:a?",
               "-vf", ",".join(vf), "-c:v", "libx264", "-preset", "slow", "-crf", str(args.crf), "-profile:v", "high",
               "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-c:a", "aac", "-b:a", "128k", str(out)]
        subprocess.run(cmd, check=True)
        webm = OUT / f"{name}.webm"
        cmd_webm = [args.ffmpeg, "-y", "-hide_banner", "-loglevel", "error", "-i", str(src), "-map", "0:v:0", "-map", "0:a?",
                    "-vf", ",".join(vf), "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", str(args.crf + 12), "-deadline", "good",
                    "-cpu-used", "2", "-row-mt", "1", "-pix_fmt", "yuv420p", "-c:a", "libopus", "-b:a", "96k", str(webm)]
        subprocess.run(cmd_webm, check=True)
        # ---- endpoints from the processed clip
        cap = cv2.VideoCapture(str(out))
        first = last = None
        while True:
            ok, fr = cap.read()
            if not ok:
                break
            if first is None:
                first = fr
            last = fr
        cap.release()
        for tag, fr in (("in", first), ("out", last)):
            p = FRAMES / f"{name}-{tag}.jpg"
            cv2.imwrite(str(p), fr, [cv2.IMWRITE_JPEG_QUALITY, 93, cv2.IMWRITE_JPEG_PROGRESSIVE, 1])
        report[name] = {"start": start, "end": end, "reframe": reframe, "scale": round(scale, 3), "shift": [round(tx), round(ty)],
                        "luminance_gain": round(lum, 3), "mp4_kb": out.stat().st_size // 1024, "webm_kb": webm.stat().st_size // 1024}
        print(f"       -> {out.relative_to(ROOT)} {out.stat().st_size // 1024} KB, {webm.name} {webm.stat().st_size // 1024} KB, {name}-in.jpg / {name}-out.jpg")
    (OUT / "clips.json").write_text(json.dumps({"clips": report}, indent=1) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
