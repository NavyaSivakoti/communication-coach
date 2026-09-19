#!/usr/bin/env python3
"""Generate the PWA icons. No image libraries needed.

Draws a speech bubble with a microphone on the app's dark background and
writes plain RGBA PNGs. Run:  python3 tools/make-icons.py
"""
import struct, zlib, os

BG     = (18, 19, 26, 255)     # --bg
ACCENT = (110, 168, 254, 255)  # --accent
INK    = (18, 19, 26, 255)

def png(path, w, h, pixels):
    raw = b''.join(b'\x00' + bytes(v for px in row for v in px) for row in pixels)
    def chunk(tag, data):
        c = tag + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)
    out = (b'\x89PNG\r\n\x1a\n'
           + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0))
           + chunk(b'IDAT', zlib.compress(raw, 9))
           + chunk(b'IEND', b''))
    open(path, 'wb').write(out)

def blend(dst, src):
    a = src[3] / 255.0
    return tuple(int(src[i] * a + dst[i] * (1 - a)) for i in range(3)) + (255,)

def make(size, maskable=False):
    # A maskable icon must keep its art inside the middle 80%, because
    # Android crops the corners into whatever shape the launcher uses.
    pad = size * 0.14 if maskable else size * 0.06
    px = [[BG for _ in range(size)] for _ in range(size)]

    inner = size - 2 * pad
    bx0, by0 = pad, pad + inner * 0.06
    bx1, by1 = pad + inner, pad + inner * 0.76
    radius = inner * 0.18

    def in_bubble(x, y):
        # rounded rectangle
        if bx0 <= x <= bx1 and by0 + radius <= y <= by1 - radius: return True
        if bx0 + radius <= x <= bx1 - radius and by0 <= y <= by1: return True
        for cx, cy in ((bx0+radius, by0+radius), (bx1-radius, by0+radius),
                       (bx0+radius, by1-radius), (bx1-radius, by1-radius)):
            if (x-cx)**2 + (y-cy)**2 <= radius**2: return True
        # the tail, pointing down-left
        tx, ty = bx0 + inner * 0.24, by1
        if ty <= y <= ty + inner * 0.17:
            k = (y - ty) / (inner * 0.17)
            if tx <= x <= tx + inner * 0.20 * (1 - k): return True
        return False

    # microphone, centred in the bubble
    mcx = (bx0 + bx1) / 2
    mcy = (by0 + by1) / 2
    mw, mh = inner * 0.155, inner * 0.30
    mr = mw / 2

    def in_mic(x, y):
        top, bot = mcy - mh / 2, mcy + mh / 2 - mr * 0.6
        if abs(x - mcx) <= mr and top + mr <= y <= bot: return True
        if (x - mcx)**2 + (y - (top + mr))**2 <= mr**2: return True
        if (x - mcx)**2 + (y - bot)**2 <= mr**2: return True
        # the stand: an arc under the capsule plus a stem
        d = ((x - mcx)**2 + (y - mcy)**2) ** 0.5
        arc_r = mh * 0.46
        if abs(d - arc_r) <= inner * 0.022 and y > mcy: return True
        if abs(x - mcx) <= inner * 0.022 and mcy + arc_r <= y <= mcy + arc_r + inner * 0.06: return True
        return False

    for y in range(size):
        for x in range(size):
            fx, fy = x + 0.5, y + 0.5
            if in_bubble(fx, fy):
                px[y][x] = blend(px[y][x], ACCENT)
                if in_mic(fx, fy):
                    px[y][x] = blend(px[y][x], INK)
    return px

os.makedirs('icons', exist_ok=True)
png('icons/icon-192.png', 192, 192, make(192))
png('icons/icon-512.png', 512, 512, make(512))
png('icons/icon-maskable-512.png', 512, 512, make(512, maskable=True))
print('wrote icons/icon-192.png, icons/icon-512.png, icons/icon-maskable-512.png')
