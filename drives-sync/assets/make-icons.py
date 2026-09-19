"""Draw the Drives Sync icons (PNG) without any imaging library.

A rounded blue tile with two white arrows chasing each other in a circle: one-way
synchronisation, going round.  Run from anywhere:  python3 drives-sync/assets/make-icons.py
"""
from __future__ import annotations

import math
import struct
import zlib
from pathlib import Path

HERE = Path(__file__).resolve().parent
BLUE = (42, 120, 214)
WHITE = (255, 255, 255)


def png(width: int, height: int, rows: list[bytes]) -> bytes:
    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    raw = b"".join(b"\x00" + r for r in rows)
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))


def coverage(fn, x: float, y: float, ss: int = 4) -> float:
    """Super-sampled coverage of a boolean shape function at pixel (x, y)."""
    hits = 0
    for i in range(ss):
        for j in range(ss):
            if fn(x + (i + 0.5) / ss, y + (j + 0.5) / ss):
                hits += 1
    return hits / (ss * ss)


def make(size: int, padding: float, out: Path, background: bool = True) -> None:
    c = size / 2
    r_tile = size * 0.22
    ring_r = size * (0.5 - padding) * 0.62
    ring_w = size * (0.5 - padding) * 0.19
    head = ring_w * 1.9

    def in_tile(x: float, y: float) -> bool:
        if not background:
            return True
        dx = max(abs(x - c) - (c - r_tile), 0)
        dy = max(abs(y - c) - (c - r_tile), 0)
        return dx * dx + dy * dy <= r_tile * r_tile

    def arc(x: float, y: float, a0: float, a1: float) -> bool:
        dx, dy = x - c, y - c
        d = math.hypot(dx, dy)
        if abs(d - ring_r) > ring_w / 2:
            return False
        a = math.degrees(math.atan2(dy, dx)) % 360
        return a0 <= a <= a1

    def arrow_head(x: float, y: float, angle_deg: float, clockwise: bool) -> bool:
        # a triangle whose base sits on the ring at `angle_deg`, pointing along the ring
        a = math.radians(angle_deg)
        px, py = c + ring_r * math.cos(a), c + ring_r * math.sin(a)
        tx, ty = -math.sin(a), math.cos(a)          # tangent (increasing angle)
        if not clockwise:
            tx, ty = -tx, -ty
        nx, ny = math.cos(a), math.sin(a)           # radial
        # local coords: t along tangent, n along radial
        dx, dy = x - px, y - py
        t = dx * tx + dy * ty
        n = dx * nx + dy * ny
        if t < 0 or t > head:
            return False
        half = (1 - t / head) * head * 0.62
        return abs(n) <= half

    def glyph(x: float, y: float) -> bool:
        return (arc(x, y, 200, 330) or arc(x, y, 20, 150)
                or arrow_head(x, y, 330, True) or arrow_head(x, y, 150, True))

    rows = []
    for yy in range(size):
        row = bytearray()
        for xx in range(size):
            t = coverage(in_tile, xx, yy) if background else 1.0
            g = coverage(glyph, xx, yy)
            if background:
                rr = BLUE[0] * (1 - g) + WHITE[0] * g
                gg = BLUE[1] * (1 - g) + WHITE[1] * g
                bb = BLUE[2] * (1 - g) + WHITE[2] * g
                row += bytes((int(rr), int(gg), int(bb), int(255 * t)))
            else:
                row += bytes((WHITE[0], WHITE[1], WHITE[2], int(255 * g)))
        rows.append(bytes(row))
    out.write_bytes(png(size, size, rows))
    print("wrote", out.relative_to(HERE.parent.parent), size)


if __name__ == "__main__":
    make(192, 0.10, HERE / "icon-192.png")
    make(512, 0.10, HERE / "icon-512.png")
    make(512, 0.22, HERE / "icon-maskable-512.png")
    make(180, 0.10, HERE / "apple-touch-icon.png")
