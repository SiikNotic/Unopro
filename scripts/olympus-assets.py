# Prepares the Jewellery: Olympus artwork from the asset pack (generated with Gemini by the project owner).
#
# 1. Upscale every PNG of the pack 4x with Real-ESRGAN (x4plus), e.g. with spandrel + torch:
#      python3 scripts/olympus-assets.py upscale <pack dir> <hd dir> <RealESRGAN_x4plus.pth>
#    The panorama gets a second pass (it becomes the full-screen background):
#      python3 scripts/olympus-assets.py upscale <hd dir> <hd2 dir> <model> background_olympus_panorama.png
# 2. Build the game's WebP files from the HD images (optionally with the cleaned second backgrounds):
#      python3 scripts/olympus-assets.py build <hd dir> <hd2 dir> [<bg2 dir> [<ui2 dir>]]
#
# The build crops each image to its content, squares it and sizes it for the screen (gems 320 px, which is
# sharp up to 4K cells), cuts the topaz to a hexagon (so its outline differs from the round ruby) and the
# round medallions to clean discs (the pack's crops are clipped at the lower right), makes the marble seals
# from the pack's marble and gold, and composes the portrait and landscape backgrounds from the panorama.
import math
import os
import sys

from PIL import Image, ImageDraw, ImageFilter

OUT = 'src/games/jewels/assets/'


def upscale(src, dst, weights, names):
    import numpy as np
    import torch
    from spandrel import ModelLoader

    model = ModelLoader().load_from_file(weights).model.eval()
    os.makedirs(dst, exist_ok=True)
    names = names or sorted(f for f in os.listdir(src) if f.endswith('.png'))

    def up(arr):
        # Tiles keep memory bounded on big images.
        h, w, _ = arr.shape
        tile, pad = 256, 16
        out = np.zeros((h * 4, w * 4, 3), np.float32)
        for y in range(0, h, tile):
            for x in range(0, w, tile):
                y0, x0 = max(0, y - pad), max(0, x - pad)
                y1, x1 = min(h, y + tile + pad), min(w, x + tile + pad)
                t = torch.from_numpy(arr[y0:y1, x0:x1]).permute(2, 0, 1)[None].float()
                with torch.no_grad():
                    o = model(t)[0].permute(1, 2, 0).clamp(0, 1).numpy()
                oy, ox = (y - y0) * 4, (x - x0) * 4
                th, tw = min(tile, h - y) * 4, min(tile, w - x) * 4
                out[y * 4:y * 4 + th, x * 4:x * 4 + tw] = o[oy:oy + th, ox:ox + tw]
        return out

    for n in names:
        im = Image.open(os.path.join(src, n)).convert('RGBA')
        a = np.asarray(im).astype(np.float32) / 255
        rgb = up(a[..., :3])
        al = up(np.repeat(a[..., 3:4], 3, axis=2))[..., :1]
        res = np.concatenate([rgb, al], axis=2)
        Image.fromarray((res * 255).round().astype(np.uint8), 'RGBA').save(os.path.join(dst, n))
        print(n, im.size, '->', res.shape[1::-1], flush=True)


# ------------------------------------------------------------------------------------------------ build

def load(hd, n):
    im = Image.open(os.path.join(hd, n + '.png')).convert('RGBA')
    return im.crop(im.getchannel('A').point(lambda v: 255 if v > 24 else 0).getbbox())


def square(im, pad=0.03):
    s = int(max(im.size) * (1 + pad * 2))
    c = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    c.alpha_composite(im, ((s - im.width) // 2, (s - im.height) // 2))
    return c


def save(im, name, size=None, q=88):
    if size:
        im = im.resize((size, size) if isinstance(size, int) else size, Image.LANCZOS)
    if im.mode == 'RGBA' and im.getchannel('A').getextrema()[0] == 255:
        im = im.convert('RGB')
    im.save(OUT + name + '.webp', 'WEBP', quality=q, method=6)
    print(name, im.size, os.path.getsize(OUT + name + '.webp') // 1024, 'KB')


def mask_poly(im, pts, rim=None, rim_w=6):
    s = 3
    w, h = im.size
    m = Image.new('L', (w * s, h * s), 0)
    ImageDraw.Draw(m).polygon([(x * s, y * s) for x, y in pts], fill=255)
    m = m.resize((w, h), Image.LANCZOS)
    a = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    a.paste(im, (0, 0), Image.composite(im.getchannel('A'), Image.new('L', (w, h), 0), m))
    if rim:
        r = Image.new('RGBA', (w * s, h * s), (0, 0, 0, 0))
        ImageDraw.Draw(r).line([(x * s, y * s) for x, y in pts + [pts[0]]], fill=rim, width=rim_w * s, joint='curve')
        a.alpha_composite(r.resize((w, h), Image.LANCZOS))
    return a


def disc(hd, n, frac, shift=(0, 0)):
    im = Image.open(os.path.join(hd, n + '.png')).convert('RGBA')
    x0, y0, x1, y1 = im.getchannel('A').point(lambda v: 255 if v > 24 else 0).getbbox()
    s = max(x1 - x0, y1 - y0)
    cx, cy = (x0 + x1) / 2 + shift[0] * s, (y0 + y1) / 2 + shift[1] * s
    c = im.crop((int(cx - s / 2), int(cy - s / 2), int(cx + s / 2), int(cy + s / 2)))
    r = s / 2 * frac
    pts = [(s / 2 + r * math.cos(t / 90 * math.pi), s / 2 + r * math.sin(t / 90 * math.pi)) for t in range(180)]
    return mask_poly(c, pts)


def stone(hd, cracked):
    """A marble seal: a rounded marble tile with a gold inlay, cracked after the first hit."""
    size = 320
    # White Olympian marble with soft grey veins (drawn: the pack's marble only exists on columns).
    import random
    rnd = random.Random(31 if not cracked else 77)
    tile = Image.new('RGB', (size, size), (240, 236, 228))
    td = ImageDraw.Draw(tile)
    for _ in range(14):
        x, y = rnd.uniform(0, size), -10
        pts = [(x, y)]
        while y < size + 10:
            x += rnd.uniform(-40, 40)
            y += rnd.uniform(20, 45)
            pts.append((x, y))
        g = rnd.randint(150, 200)
        td.line(pts, fill=(g, g - 4, g - 12), width=rnd.randint(1, 4), joint='curve')
    tile = tile.filter(ImageFilter.GaussianBlur(1.6))
    shade = Image.new('L', (size, size))
    ImageDraw.Draw(shade).rectangle((0, 0, size, size), fill=0)
    grad = Image.linear_gradient('L').resize((size, size)).rotate(45, expand=False)
    tile = Image.composite(tile, Image.new('RGB', (size, size), (205, 198, 184)), grad.point(lambda v: 255 - v // 3))
    base = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    mask = Image.new('L', (size * 3, size * 3), 0)
    ImageDraw.Draw(mask).rounded_rectangle((18, 18, size * 3 - 18, size * 3 - 18), radius=70, fill=255)
    mask = mask.resize((size, size), Image.LANCZOS)
    base.paste(tile.convert('RGBA'), (0, 0), mask)
    d = ImageDraw.Draw(base)
    # Soft bevel: light top-left, shade bottom-right.
    bevel = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    bd = ImageDraw.Draw(bevel)
    bd.rounded_rectangle((8, 8, size - 8, size - 8), radius=24, outline=(255, 255, 255, 120), width=6)
    bevel = bevel.filter(ImageFilter.GaussianBlur(3))
    base.alpha_composite(Image.composite(bevel, Image.new('RGBA', (size, size), (0, 0, 0, 0)), mask))
    d.rounded_rectangle((34, 34, size - 34, size - 34), radius=16, outline=(201, 154, 58, 255), width=9)
    d.rounded_rectangle((30, 30, size - 30, size - 30), radius=18, outline=(255, 238, 190, 200), width=3)
    d.rounded_rectangle((5, 5, size - 5, size - 5), radius=24, outline=(110, 98, 80, 255), width=5)
    if cracked:
        pts = [(160, 6), (146, 88), (184, 140), (130, 188), (170, 246), (150, 314)]
        d.line(pts, fill=(55, 46, 36, 255), width=9, joint='curve')
        d.line([(184, 140), (262, 162)], fill=(55, 46, 36, 255), width=7)
        d.line([(146, 88), (76, 104)], fill=(55, 46, 36, 255), width=7)
        d.line([(p[0] + 4, p[1] + 2) for p in pts], fill=(255, 255, 255, 110), width=3, joint='curve')
    return base


def background(hd2):
    pano = Image.open(os.path.join(hd2, 'background_olympus_panorama.png')).convert('RGB')
    W, H = pano.size
    # Landscape: the whole panorama, a little sky added above so the columns breathe.
    land = pano.resize((3200, int(H * 3200 / W)), Image.LANCZOS)
    sky_h = int(land.height * 0.08)
    wide = Image.new('RGB', (3200, land.height + sky_h), (60, 120, 210))
    top = land.crop((0, 0, 3200, 8)).resize((3200, sky_h), Image.LANCZOS).filter(ImageFilter.GaussianBlur(20))
    wide.paste(top, (0, 0))
    wide.paste(land, (0, sky_h))
    save(wide.resize((2560, int(wide.height * 2560 / 3200)), Image.LANCZOS), 'bg-landscape', q=82)
    # Portrait: the temple gate and its stairway, full height (the golden doorway sits behind the board's
    # upper half, the colonnade above it around the HUD).
    gate = 0.68  # x of the doorway in the panorama
    cw = int(H * 0.5)
    x0 = int(W * gate - cw / 2)
    tall = pano.crop((x0, 0, x0 + cw, H))
    save(tall.resize((1320, int(tall.height * 1320 / cw)), Image.LANCZOS), 'bg-portrait', q=82)


def backgrounds_v2(src):
    """The owner's second backgrounds (ChatGPT, cleaned: the sheet's grey edges cropped, downscaled 3x, then
    upscaled 4x with Real-ESRGAN into <src>: bg_mobile.png, bg_desktop.png)."""
    m = Image.open(os.path.join(src, 'bg_mobile.png')).convert('RGB')
    save(m, 'bg-portrait', q=82)
    d = Image.open(os.path.join(src, 'bg_desktop.png')).convert('RGB')
    save(d.resize((2560, int(d.height * 2560 / d.width)), Image.LANCZOS), 'bg-landscape', q=82)


def plain_button(im):
    """A pill button whose middle can stretch: the centre ornaments are covered by a plain slice of the pill
    (feathered into the ends), so CSS border-image can widen it without distorting anything."""
    w, h = im.size
    slice_ = im.crop((int(w * 0.245), 0, int(w * 0.265), h))
    mid0, mid1 = int(w * 0.25), int(w * 0.75)
    fill = slice_.resize((mid1 - mid0, h), Image.LANCZOS)
    ramp = Image.linear_gradient('L').rotate(90).resize((mid1 - mid0, h))  # 0 → 255 left to right
    fw = int((mid1 - mid0) * 0.12)
    mask = Image.new('L', (mid1 - mid0, h), 255)
    for x in range(fw):
        v = int(255 * x / fw)
        mask.paste(v, (x, 0, x + 1, h))
        mask.paste(v, (mid1 - mid0 - 1 - x, 0, mid1 - mid0 - x, h))
    out = im.copy()
    region = out.crop((mid0, 0, mid1, h))
    out.paste(Image.composite(fill, region, mask), (mid0, 0))
    return out


def ui_v2(src):
    """The owner's end-of-level UI set (ChatGPT, generated one by one, real transparency)."""
    def load2(n):
        im = Image.open(os.path.join(src, n + '.png')).convert('RGBA')
        return im.crop(im.getchannel('A').point(lambda v: 255 if v > 24 else 0).getbbox())
    for n, name, width in [('panel_level_complete', 'ui-card', 760), ('ribbon_title', 'ui-ribbon', 900), ('plaque_score', 'ui-plaque', 800)]:
        im = load2(n)
        save(im, name, (width, int(im.height * width / im.width)))
    for n, name in [('button_green', 'ui-btn-green'), ('button_blue', 'ui-btn-blue')]:
        im = plain_button(load2(n))
        save(im, name, (720, int(im.height * 720 / im.width)))
    save(square(load2('star_gold'), 0.02), 'star-on', 256)
    save(square(load2('star_empty'), 0.02), 'star-off', 256)


def build(hd, hd2, bg2=None, ui2=None):
    gems = ['gem_diamond_celestial', 'gem_emerald_divine', 'gem_ruby_fire', 'gem_sapphire_poseidon', 'gem_amethyst_alt']
    for k, n in enumerate(gems):
        save(square(load(hd, n)), f'gem{k}', 320)
    t = square(load(hd, 'gem_topaz_golden'), 0)
    w = t.width
    r = w * 0.47
    hexa = [(w / 2 + r * math.cos(math.radians(a)), w / 2 + r * 0.9 * math.sin(math.radians(a))) for a in range(0, 360, 60)]
    save(square(mask_poly(t, hexa, rim=(120, 70, 8, 255), rim_w=8)), 'gem5', 320)
    save(square(load(hd, 'special_lightning')), 'lightning', 256)
    save(square(load(hd, 'special_greek_temple')), 'temple', 256)
    save(square(load(hd, 'special_trident_2')), 'trident', 320)
    save(stone(hd, False), 'stone2')
    save(stone(hd, True), 'stone1')
    save(disc(hd, 'avatar_zeus', 0.92), 'zeus', 256)
    save(disc(hd, 'powerup_hammer', 0.76, (-0.03, -0.03)), 'pw-hammer', 192)
    for b in ['lightning', 'shuffle', 'olympus']:
        save(disc(hd, 'powerup_' + b, 0.84), 'pw-' + b, 192)
    for n, name in [('effect_lightning', 'fx-lightning'), ('effect_gold_burst', 'fx-burst'), ('effect_gold_ring', 'fx-ring'), ('effect_blue_portal', 'fx-portal'), ('effect_spark', 'fx-spark'), ('effect_divine_streak', 'fx-streak')]:
        save(square(load(hd, n), 0.02), name, 256)
    # UI: the board frame and the plaques, kept at their shape (used as CSS border-images / backgrounds).
    # Sub-boxes (fractions of the HD image) where a pack image holds more than one element.
    boxes = {'frame_small_bar_2': (0, 0.2, 1, 1), 'panel_header': (0.07, 0, 1, 0.86), 'panel_stars': (0, 0, 1, 1), 'panel_pause': (0, 0, 1, 1), 'bar_score_gold': (0, 0, 1, 1), 'frame_vertical_panel': (0, 0, 1, 1)}
    for n, name, width in [('frame_vertical_panel', 'ui-board-frame', 560), ('panel_header', 'ui-panel-header', 640), ('frame_small_bar_2', 'ui-bar', 640), ('bar_score_gold', 'ui-score-bar', 640), ('panel_stars', 'ui-panel-stars', 560), ('panel_pause', 'ui-panel', 720)]:
        im = Image.open(os.path.join(hd, n + '.png')).convert('RGBA')
        bx = boxes[n]
        im = im.crop((int(im.width * bx[0]), int(im.height * bx[1]), int(im.width * bx[2]), int(im.height * bx[3])))
        im = im.crop(im.getchannel('A').point(lambda v: 255 if v > 24 else 0).getbbox())
        save(im, name, (width, int(im.height * width / im.width)))
    for n in ['settings', 'sound', 'music', 'home', 'help', 'star', 'trophy', 'plus', 'crown']:
        save(disc(hd, 'icon_' + n, 0.86), 'ic-' + n, 128)
    if ui2:
        ui_v2(ui2)
    if bg2:
        backgrounds_v2(bg2)
    else:
        background(hd2)


if __name__ == '__main__':
    if sys.argv[1] == 'upscale':
        upscale(sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5:])
    else:
        os.makedirs(OUT, exist_ok=True)
        build(sys.argv[2], sys.argv[3], *(sys.argv[4:6]))
