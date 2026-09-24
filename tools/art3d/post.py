# Finishes the raw renders: drop shadow, glow for neon/ember, gloss on SPIN caps, trim, WebP.
import json, os, sys
from PIL import Image, ImageFilter, ImageChops
src = sys.argv[1]; dst = sys.argv[2]
specs = {f"{x['machine']}/{x['symbol']}": x for x in json.load(open('symbols.json'))}
GLOW = {'ember': '#ff5a0a', 'neon': None}
def hexrgb(h): h = h.lstrip('#'); return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))
def layer(alpha, color, blur, opacity, offset=(0, 0), size=None):
    a = alpha.filter(ImageFilter.GaussianBlur(blur)).point(lambda v: int(min(255, v * opacity)))
    im = Image.new('RGBA', alpha.size, color + (0,)); im.putalpha(a)
    if offset != (0, 0):
        moved = Image.new('RGBA', alpha.size, (0, 0, 0, 0)); moved.paste(im, offset); im = moved
    return im
def dress(im, glow=None, shadow=True):
    a = im.getchannel('A'); out = Image.new('RGBA', im.size, (0, 0, 0, 0))
    if shadow: out.alpha_composite(layer(a, (0, 0, 0), max(3, im.width // 60), 0.55, (0, im.width // 64)))
    if glow:
        out.alpha_composite(layer(a, hexrgb(glow), im.width // 22, 1.3))
        out.alpha_composite(layer(a, hexrgb(glow), im.width // 60, 0.9))
    out.alpha_composite(im); return out
def pad(im, p, cut=6):
    box = im.getchannel('A').point(lambda v: 255 if v > cut else 0).getbbox()
    im = im.crop(box); out = Image.new('RGBA', (im.width + 2 * p, im.height + 2 * p), (0, 0, 0, 0)); out.paste(im, (p, p)); return out
def save(im, path, q=88):
    os.makedirs(os.path.dirname(path), exist_ok=True); im.save(path, 'WEBP', quality=q, method=6)
for m in sorted(os.listdir(src)):
    for f in sorted(os.listdir(os.path.join(src, m))):
        name = f[:-4]; im = Image.open(os.path.join(src, m, f)).convert('RGBA')
        if name == 'logo':
            g = {'inferno': '#ff5a0a', 'cosmic': '#35e0ff', 'lucky7s': '#ff2a3d'}.get(m)
            im = pad(im, 0); im = pad(dress(pad(im, im.width // 6), g), 6, 2); im.thumbnail((880, 220), Image.LANCZOS); save(im, f'{dst}/{m}/logo.webp', 90)
        elif name == 'spin':
            if m != 'pirates':
                # glossy cap: a soft highlight across the top of the dome, like a lit arcade button
                from PIL import ImageDraw
                w, h = im.size; hl = Image.new('L', im.size, 0); d = ImageDraw.Draw(hl)
                d.ellipse((w * 0.28, h * 0.2, w * 0.72, h * 0.44), fill=120)
                hl = hl.filter(ImageFilter.GaussianBlur(w // 28))
                cap = Image.new('RGBA', im.size, (255, 255, 255, 0)); cap.putalpha(ImageChops.multiply(hl, im.getchannel('A')))
                im = Image.alpha_composite(im, cap)
            g = {'inferno': '#ff5a0a', 'cosmic': '#ff3dcb'}.get(m)
            im = pad(im, 0); im = pad(dress(pad(im, im.width // 5), g), 4, 2); im.thumbnail((240, 240), Image.LANCZOS); save(im, f'{dst}/{m}/spin.webp', 90)
        elif name == 'frame':
            save(im, f'{dst}/{m}/frame.webp', 90)
            a = im.getchannel('A'); y = im.height // 2; xs = [x for x in range(im.width) if a.getpixel((x, y)) > 20]
            run = 0
            for x in range(xs[0], im.width):
                if a.getpixel((x, y)) > 20: run += 1
                else: break
            print(m, 'frame', im.size, 'left edge', xs[0], 'ring', run)
        else:
            sp = specs[f'{m}/{name}']
            g = '#ff5a0a' if sp['style'] == 'ember' else (sp['c1'] if sp['style'] == 'neon' else None)
            if sp['style'] == 'neon' and sp['c1'] == '#ffffff': g = '#35e0ff'
            im = dress(im, g)
            # trim to the art and square it, so every symbol fills its reel cell
            c = pad(im, 0, 10); side = int(max(c.size) * 1.04)
            sq = Image.new('RGBA', (side, side), (0, 0, 0, 0)); sq.paste(c, ((side - c.width) // 2, (side - c.height) // 2))
            save(sq.resize((256, 256), Image.LANCZOS), f'{dst}/{m}/{name}.webp')
