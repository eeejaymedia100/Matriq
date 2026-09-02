#!/usr/bin/env python3
"""Generate Matriq's brand share/brand images.

Produces:
  waitlist/assets/og-image.png       1200x630 Open Graph / Twitter card share image
  waitlist/apple-touch-icon.png      180x180 touch icon (Safari home screen, site root)

Run:  python3 scripts/generate-og-assets.py
Requires Pillow (pip install pillow). Deterministic — safe to re-run and commit
the outputs.
"""

import math
import os

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, "waitlist", "assets")
os.makedirs(ASSETS, exist_ok=True)

# Brand palette (design-system.md: deep purple + electric lime).
BG_TOP = (26, 15, 61)
BG_BOTTOM = (11, 4, 23)
VIOLET = (108, 59, 170)
PURPLE_500 = (123, 75, 196)
LIME = (198, 255, 61)
ACCENT = (192, 132, 252)
TEXT_DIM = (185, 168, 217)
TEXT_MUTED = (139, 122, 174)
WHITE = (248, 246, 252)

FONT_DIRS = [
    "/usr/share/fonts/truetype/liberation",
    "/usr/share/fonts/truetype/dejavu",
]


def find_font(name):
    for d in FONT_DIRS:
        p = os.path.join(d, name)
        if os.path.exists(p):
            return p
    raise SystemExit(f"font not found: {name}")


def font(size, bold=True):
    name = "LiberationSans-Bold.ttf" if bold else "LiberationSans-Regular.ttf"
    return ImageFont.truetype(find_font(name), size)


def vertical_gradient(w, h, top, bottom):
    base = Image.new("RGB", (w, h))
    d = ImageDraw.Draw(base)
    for y in range(h):
        t = y / max(1, h - 1)
        c = tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
        d.line([(0, y), (w, y)], fill=c)
    return base


def radial_glow(w, h, cx, cy, radius, color, peak_alpha):
    """Soft radial glow via concentric ellipses (alpha fades with distance)."""
    layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    steps = 48
    for i in range(steps, 0, -1):
        r = radius * (i / steps)
        a = int(peak_alpha * (i / steps) ** 2.2)
        d.ellipse(
            [cx - r, cy - r * 0.86, cx + r, cy + r * 0.86],
            fill=color + (a,),
        )
    return layer


def rounded_gradient_mark(size, radius, img_w, img_h):
    """Brand 'M' tile: rounded square with vertical brand gradient + white M."""
    tile = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    grad = Image.new("RGB", (size, size))
    gd = ImageDraw.Draw(grad)
    for y in range(size):
        t = y / max(1, size - 1)
        f = t if t <= 0.5 else 1 - (t - 0.5) * 2  # peak in the middle
        c = tuple(round(PURPLE_500[i] + (VIOLET[i] - PURPLE_500[i]) * f) for i in range(3))
        gd.line([(0, y), (size, y)], fill=c)
    tile.paste(grad, (0, 0), Image.new("L", (size, size), 255))
    mask = Image.new("L", (size, size), 0)
    md = ImageDraw.Draw(mask)
    md.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(tile, (0, 0), mask)
    d = ImageDraw.Draw(out)
    m_font = font(int(size * 0.58), bold=True)
    bbox = d.textbbox((0, 0), "M", font=m_font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    d.text(
        ((size - tw) / 2 - bbox[0], (size - th) / 2 - bbox[1] - size * 0.02),
        "M",
        font=m_font,
        fill=WHITE,
    )
    # thin inner border
    d.rounded_rectangle([1, 1, size - 2, size - 2], radius=radius, outline=(255, 255, 255, 36), width=2)
    return out


def char_w(d, text, f):
    bbox = d.textbbox((0, 0), text, font=f)
    return bbox[2] - bbox[0]


def draw_centered(d, cx, cy, text, f, fill):
    w = char_w(d, text, f)
    bbox = d.textbbox((0, 0), text, font=f)
    d.text((cx - w / 2 - bbox[0], cy - bbox[1] - (bbox[3] - bbox[1]) / 2), text, font=f, fill=fill)


def build_og_image():
    W, H = 1200, 630
    img = vertical_gradient(W, H, BG_TOP, BG_BOTTOM).convert("RGBA")

    # Ambient glows (brand colors blooming behind the mark).
    img = Image.alpha_composite(img, radial_glow(W, H, 985, 120, 430, LIME, 34))
    img = Image.alpha_composite(img, radial_glow(W, H, 150, 545, 470, (107, 59, 170), 96))
    img = Image.alpha_composite(img, radial_glow(W, H, 620, 320, 560, (76, 29, 149), 70))
    d = ImageDraw.Draw(img)

    # Center composition.
    cx = W / 2
    mark_size = 150
    mark = rounded_gradient_mark(mark_size, int(mark_size * 0.28), W, H)
    img.alpha_composite(mark, (int(cx - mark_size / 2), 52))

    f_name = font(88, bold=True)
    draw_centered(d, cx, 302, "Matriq", f_name, WHITE)

    f_sub = font(42, bold=True)
    draw_centered(d, cx, 398, "The Smart Way to Get Through Semester", f_sub, ACCENT)

    f_tag = font(25, bold=False)
    draw_centered(d, cx, 476, "PAST QUESTIONS  ·  OFFLINE AI  ·  STUDY TOOLS", f_tag, TEXT_DIM)

    # URL pill.
    pill_w, pill_h = 470, 62
    px0, py0 = cx - pill_w / 2, 514
    pill = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    pd = ImageDraw.Draw(pill)
    pd.rounded_rectangle(
        [px0, py0, px0 + pill_w, py0 + pill_h],
        radius=pill_h / 2,
        outline=(198, 255, 61, 210),
        width=3,
    )
    f_url = font(27, bold=True)
    draw_centered(pd, cx, py0 + pill_h / 2 + 2, "matriq.com.ng — join the waitlist", f_url, LIME)
    img = Image.alpha_composite(img, pill)

    out = os.path.join(ASSETS, "og-image.png")
    img.convert("RGB").save(out, "PNG", optimize=True)
    print(f"wrote {out} ({img.width}x{img.height})")


def build_touch_icon():
    S = 180
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    mark = rounded_gradient_mark(S, int(S * 0.24), S, S)
    img = Image.alpha_composite(img, mark)
    out = os.path.join(ROOT, "waitlist", "apple-touch-icon.png")
    img.convert("RGB").save(out, "PNG", optimize=True)
    print(f"wrote {out} ({img.width}x{img.height})")


if __name__ == "__main__":
    build_og_image()
    build_touch_icon()