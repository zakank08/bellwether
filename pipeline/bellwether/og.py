"""Social-share image (web/public/og.png, 1200x630) with today's headline
numbers, redrawn on every forecast run."""
from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

FONTS = Path(__file__).resolve().parents[2] / "data" / "fonts"
C = {"bg": "#faf9f6", "ink": "#1a1916", "muted": "#5f5b53", "line": "#e3e0d8", "d": "#1f4f94", "r": "#9b2b24",
     "dl": "#4d7dc3", "rl": "#d05a4c", "dle": "#a3c0e6", "rle": "#eea79d", "t": "#d8d2c4"}
BUCKET = {"d-safe": "d", "d-likely": "dl", "d-lean": "dle", "tossup": "t", "r-lean": "rle", "r-likely": "rl", "r-safe": "r",
          "i-safe": "d", "i-likely": "dl", "i-lean": "dle"}


def _f(name, size):
    return ImageFont.truetype(str(FONTS / name), size)


def _arc(draw, cx, cy, radius, colors, dot, rows=5):
    n = len(colors)
    radii = [radius * (0.45 + 0.55 * i / (rows - 1)) for i in range(rows)]
    tot = sum(radii)
    counts = [round(n * r / tot) for r in radii]
    counts[-1] += n - sum(counts)
    pts = []
    for r, k in zip(radii, counts):
        for j in range(k):
            a = math.pi - (j / max(k - 1, 1)) * math.pi
            pts.append((a, r))
    pts.sort(key=lambda p: (-p[0], p[1]))
    for (a, r), col in zip(pts, colors):
        x, y = cx + r * math.cos(a), cy - r * math.sin(a)
        draw.ellipse([x - dot, y - dot, x + dot, y + dot], fill=C[col])


def make_og(summary: dict, races: list[dict], out: Path, version: str = "fundamentals"):
    W, H = 1200, 630
    im = Image.new("RGB", (W, H), C["bg"])
    d = ImageDraw.Draw(im)
    d.text((60, 52), "2026 MIDTERM FORECAST", font=_f("IBMPlexSans-SemiBold.ttf", 24), fill=C["muted"])
    d.text((60, 86), "Who will control Congress?", font=_f("Newsreader-SemiBold.ttf", 58), fill=C["ink"])
    ch = summary["chambers"][version]
    for i, (name, key, x) in enumerate([("Senate", "senate", 60), ("House", "house", 630)]):
        p = ch[key]["p_control"]
        lead = "D" if p["D"] >= p["R"] else "R"
        n = round(max(p["D"], p["R"]) * 100)
        d.text((x, 190), name.upper(), font=_f("IBMPlexSans-SemiBold.ttf", 22), fill=C["muted"])
        d.text((x, 214), f"{n}", font=_f("Newsreader-SemiBold.ttf", 110), fill=C["d" if lead == "D" else "r"])
        wbig = d.textlength(f"{n}", font=_f("Newsreader-SemiBold.ttf", 110))
        d.text((x + wbig + 10, 272), "in 100", font=_f("Newsreader-SemiBold.ttf", 40), fill=C["muted"])
        d.text((x, 350), f"{'Democrats' if lead == 'D' else 'Republicans'} win the {name}", font=_f("IBMPlexSans-Regular.ttf", 26), fill=C["ink"])
        rs = [r for r in races if r["office"] == key]
        def dshare(r):
            p = r["p"][version]
            return (p if r["dside"]["party"] == "D" else 0) + (1 - p if r["rside"]["party"] == "D" else 0)
        rs.sort(key=lambda r: -dshare(r))
        cols = [BUCKET.get(r["rating"][version], "t") for r in rs]
        if key == "senate":
            nu = ch["senate"]["not_up"]
            cols = ["dle"] * (nu["D"] + nu["I_caucus_D"]) + cols + ["rle"] * nu["R"]
        _arc(d, x + 240, 590, 195, cols, 9 if key == "senate" else 4.6, rows=5 if key == "senate" else 11)
    d.text((W - 250, 56), "Bellwether", font=_f("Newsreader-SemiBold.ttf", 34), fill=C["ink"])
    im.save(out, "PNG", optimize=True)
