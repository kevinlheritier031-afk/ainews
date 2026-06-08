"""
Génère le logo NEXUS pour l'app AI News.
Thème : terminal d'interception de signaux IA, fond noir, accents cyan.
"""
from PIL import Image, ImageDraw, ImageFilter
import math, sys

SIZE   = 1024
CX, CY = SIZE // 2, SIZE // 2
CYAN   = (0, 229, 255)
PURPLE = (176, 111, 255)
DARK   = (0, 2, 10)


def diamond_points(cx, cy, r):
    return [(cx, cy - r), (cx + r, cy), (cx, cy + r), (cx - r, cy)]


def draw_diamond(draw, cx, cy, r, color, width=6):
    pts = diamond_points(cx, cy, r)
    draw.polygon(pts, outline=color, width=width)


def glow_layer(size, cx, cy, r, color, alpha_max=80):
    """Crée un calque avec diamant flou pour effet glow."""
    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    pts = diamond_points(cx, cy, r)
    d.polygon(pts, outline=(*color, alpha_max), width=20)
    return layer.filter(ImageFilter.GaussianBlur(18))


def make_icon(path="icon.png"):
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))

    # ── Fond arrondi ──────────────────────────────────────────────────────────
    bg = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    bg_draw = ImageDraw.Draw(bg)
    bg_draw.rounded_rectangle([0, 0, SIZE, SIZE], radius=200, fill=(*DARK, 255))
    img = Image.alpha_composite(img, bg)

    # ── Glows des diamants ────────────────────────────────────────────────────
    for r, color, alpha in [(360, CYAN, 50), (260, CYAN, 70), (160, PURPLE, 60)]:
        glow = glow_layer(SIZE, CX, CY, r, color, alpha)
        img = Image.alpha_composite(img, glow)

    # ── Contour fond (circuit board) ──────────────────────────────────────────
    lines = ImageDraw.Draw(img)

    # Lignes de circuit horizontales/verticales très discrètes
    for offset in [-200, -120, 120, 200]:
        lines.line([(CX + offset, 80), (CX + offset, 180)],
                   fill=(*CYAN, 20), width=1)
        lines.line([(80, CY + offset), (180, CY + offset)],
                   fill=(*CYAN, 20), width=1)

    # ── Diamants concentriques ────────────────────────────────────────────────
    draw = ImageDraw.Draw(img)

    # Diamant externe (très transparent)
    draw_diamond(draw, CX, CY, 370, (*CYAN, 25), 2)

    # Diamant milieu-externe
    draw_diamond(draw, CX, CY, 300, (*CYAN, 80), 3)

    # Diamant milieu-interne
    draw_diamond(draw, CX, CY, 220, (*CYAN, 160), 5)

    # Diamant interne (plein)
    draw_diamond(draw, CX, CY, 145, (*CYAN, 230), 8)

    # Petits traits aux coins du diamant interne (style crosshair)
    pts = diamond_points(CX, CY, 145)
    for px, py in pts:
        dx, dy = px - CX, py - CY
        length = 40
        draw.line(
            [(px, py), (px + int(dx / abs(dx + 0.001) * length) if dx != 0 else px,
              py + int(dy / abs(dy + 0.001) * length) if dy != 0 else py)],
            fill=(*CYAN, 180), width=3
        )

    # ── Centre : nœud principal ───────────────────────────────────────────────
    # Cercle glow
    for r, alpha in [(55, 30), (40, 60), (28, 120), (16, 220)]:
        draw.ellipse([CX - r, CY - r, CX + r, CY + r],
                     fill=(*CYAN, alpha))

    # Point central pur
    draw.ellipse([CX - 10, CY - 10, CX + 10, CY + 10], fill=(*CYAN, 255))

    # ── Texte "NX" style monospace ────────────────────────────────────────────
    # 4 petits pixels en carré pour simuler un texte minimal (safe sans font)
    tick_y = CY + 195
    tick_size = 7
    for i, (ox, oy) in enumerate([
        (-14, -8), (-14, 0), (-14, 8), (-14, 16),  # N gauche vertical
        (-6, -8),  # N diagonale
        (2, -8), (2, 0), (2, 8), (2, 16),           # N droite vertical
        (18, -8), (26, -4), (26, 4), (18, 8),        # X haut-gauche + bas-droite
        (18, -8), (26, 8),                            # X
        (18, 8), (26, -8),                            # X croisé
    ]):
        x, y = CX + ox, tick_y + oy
        draw.rectangle([x, y, x + tick_size - 1, y + tick_size - 1],
                       fill=(*CYAN, 140))

    # ── Léger blur global pour adoucir ───────────────────────────────────────
    img = img.filter(ImageFilter.GaussianBlur(0.8))

    img.save(path)
    print(f"Icon saved: {path} ({SIZE}x{SIZE})")
    return img


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "icon.png"
    make_icon(out)
