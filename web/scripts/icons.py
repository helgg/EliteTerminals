"""Draws the home-screen icons (our own art: the FSD ring of the FLIGHT screen) into web/public/.

Run: python -I app/web/scripts/icons.py   (needs Pillow). Re-run after changing the design.
"""
import math
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

VOID = (11, 7, 5)
PANEL = (21, 16, 11)
HUD = (255, 122, 24)
HUD_HI = (255, 181, 69)
RULE = (61, 36, 4)
SCALE = 4  # draw big, shrink: cheap anti-aliasing


def ring(draw, c, r0, r1, segments, color, gap_deg=2.2):
    for i in range(segments):
        a0 = math.radians(i / segments * 360 - 90 + gap_deg / 2)
        a1 = math.radians((i + 1) / segments * 360 - 90 - gap_deg / 2)
        steps = 6
        outer = [(c + r1 * math.cos(a0 + (a1 - a0) * k / steps), c + r1 * math.sin(a0 + (a1 - a0) * k / steps)) for k in range(steps + 1)]
        inner = [(c + r0 * math.cos(a1 - (a1 - a0) * k / steps), c + r0 * math.sin(a1 - (a1 - a0) * k / steps)) for k in range(steps + 1)]
        draw.polygon(outer + inner, fill=color)


def icon(size: int, content: float) -> Image.Image:
    """`content` is the share of the side the ring may use (maskable icons need a safe margin)."""
    s = size * SCALE
    img = Image.new('RGB', (s, s), VOID)
    d = ImageDraw.Draw(img)
    c = s / 2
    r = s * content / 2

    # soft orange halo behind the ring
    glow = Image.new('RGB', (s, s), VOID)
    ImageDraw.Draw(glow).ellipse([c - r * 1.02, c - r * 1.02, c + r * 1.02, c + r * 1.02], outline=HUD, width=int(r * 0.16))
    img = Image.blend(img, glow.filter(ImageFilter.GaussianBlur(r * 0.12)), 0.45)
    d = ImageDraw.Draw(img)

    ring(d, c, r * 0.74, r * 0.96, 24, HUD)
    d.ellipse([c - r * 0.66, c - r * 0.66, c + r * 0.66, c + r * 0.66], fill=PANEL, outline=RULE, width=max(1, int(r * 0.02)))
    # chevrons pointing up: the jump
    w = r * 0.34
    for k, color in ((0, HUD_HI), (1, HUD)):
        y = c + r * 0.05 + k * r * 0.24
        d.line([(c - w, y + w * 0.55), (c, y - w * 0.15), (c + w, y + w * 0.55)], fill=color, width=int(r * 0.11), joint='curve')
    # hairlines left and right, like the instrument
    for x0, x1 in ((c - r * 0.96, c - r * 0.8), (c + r * 0.8, c + r * 0.96)):
        d.line([(x0, c), (x1, c)], fill=HUD_HI, width=max(1, int(r * 0.025)))
    return img.resize((size, size), Image.LANCZOS)


def main(out: Path):
    out.mkdir(parents=True, exist_ok=True)
    icon(180, 0.84).save(out / 'apple-touch-icon.png')  # iOS adds its own rounded mask
    icon(192, 0.84).save(out / 'icon-192.png')
    icon(512, 0.84).save(out / 'icon-512.png')
    icon(512, 0.62).save(out / 'icon-maskable-512.png')  # Android may crop to a circle: keep to the safe zone
    print('icons written to', out)


if __name__ == '__main__':
    main(Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent / 'public')
