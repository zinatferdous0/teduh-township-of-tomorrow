#!/usr/bin/env python3
"""Draw two ILLUSTRATIVE (computer-generated, not real) young-tree images used to
demo the photo check-in. Requires Pillow."""
import random, pathlib
from PIL import Image, ImageDraw, ImageFilter, ImageFont
out = pathlib.Path(__file__).resolve().parent.parent / "assets"
def tree(path, healthy, seed):
    random.seed(seed)
    W, H = 640, 480
    im = Image.new("RGB", (W, H), (196, 222, 240))
    d = ImageDraw.Draw(im)
    d.rectangle([0, 330, W, H], fill=(150, 160, 120))
    d.rectangle([0, 370, W, H], fill=(170, 170, 165))
    d.polygon([(305, 380), (335, 380), (328, 200), (312, 200)], fill=(110, 80, 55))
    greens = [(34, 120, 50), (46, 140, 60), (60, 160, 70), (28, 100, 45), (80, 170, 80)]
    stressed = [(170, 150, 60), (150, 110, 50), (120, 95, 50), (190, 170, 80), (90, 120, 55)]
    n = 1400 if healthy else 520
    for _ in range(n):
        x = random.gauss(320, 95); y = random.gauss(170, 65)
        r = random.randint(6, 16)
        c = random.choice(greens if healthy else stressed)
        d.ellipse([x - r, y - r, x + r, y + r], fill=c)
    im = im.filter(ImageFilter.GaussianBlur(0.8))
    d = ImageDraw.Draw(im)
    d.rectangle([0, H - 30, W, H], fill=(0, 0, 0))
    d.text((10, H - 24), "ILLUSTRATION ONLY. Computer-generated sample, not a real photo.", fill=(255, 255, 255))
    im.save(path, quality=90)
tree(out / "sample_tree_healthy.jpg", True, 1)
tree(out / "sample_tree_stressed.jpg", False, 2)
print("ok")
