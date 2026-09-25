# Prepares the Jewellery: Olympus artwork from the concept asset pack: crops each PNG to its content,
# squares it, upscales it (Lanczos + light sharpening) and saves the small WebP files the game imports.
# The topaz is cut to a hexagon so its outline differs from the round ruby; the round medallions are cut to
# clean discs because the pack's crops are clipped at the lower right. Needs Pillow.
# Usage (from the repo root): python3 scripts/olympus-assets.py <unzipped asset pack dir>
import math, sys
from PIL import Image, ImageDraw, ImageFilter
P=sys.argv[1].rstrip('/')+'/'; O='src/games/jewels/assets/'
def load(n):
    im=Image.open(P+n+'.png').convert('RGBA'); return im.crop(im.getchannel('A').getbbox())
def square(im, pad=0.04):
    s=int(max(im.size)*(1+pad*2)); c=Image.new('RGBA',(s,s),(0,0,0,0))
    c.alpha_composite(im,((s-im.width)//2,(s-im.height)//2)); return c
def out(im,name,size,q=88):
    im=im.resize((size,size),Image.LANCZOS).filter(ImageFilter.UnsharpMask(1.2,60,2))
    im.save(O+name+'.webp','WEBP',quality=q,method=6)
def mask_poly(im, pts, rim=None):
    S=4; w,h=im.size
    m=Image.new('L',(w*S,h*S),0); d=ImageDraw.Draw(m); d.polygon([(x*S,y*S) for x,y in pts],fill=255)
    m=m.resize((w,h),Image.LANCZOS)
    a=Image.new('RGBA',(w,h),(0,0,0,0)); a.paste(im,(0,0),m)
    if rim:
        r=Image.new('RGBA',(w*S,h*S),(0,0,0,0)); ImageDraw.Draw(r).line([(x*S,y*S) for x,y in pts+[pts[0]]],fill=rim,width=int(2.2*S),joint='curve')
        a.alpha_composite(r.resize((w,h),Image.LANCZOS))
    return a
def mask_circle(im, frac):
    w,h=im.size; cx,cy=w/2,h/2; r=min(w,h)/2*frac
    pts=[(cx+r*math.cos(t/90*math.pi),cy+r*math.sin(t/90*math.pi)) for t in range(180)]
    return mask_poly(im,pts)
gems={0:'gem_diamond_celestial',1:'gem_emerald_divine',2:'gem_ruby_fire',3:'gem_sapphire_poseidon',4:'gem_amethyst_alt'}
for k,n in gems.items(): out(square(load(n)),f'gem{k}',160)
# Golden topaz: cut to a flat-topped hexagon so its outline differs from the round ruby.
t=square(load('gem_topaz_golden'),0); w=t.width; cx=cy=w/2; r=w*0.47
hexa=[(cx+r*math.cos(math.radians(a)),cy+r*0.9*math.sin(math.radians(a))) for a in range(0,360,60)]
out(square(mask_poly(t,hexa,rim=(120,70,8,255))),'gem5',160)
out(square(load('special_lightning')),'lightning',112)
out(square(load('special_greek_temple')),'temple',112)
out(square(load('special_trident_2')),'trident',160)
# Round medallions: the pack's crops are clipped at the lower right; cut them to a clean disc (the UI draws the rim).
def disc(n, frac, name, size, shift=(0,0)):
    im=Image.open(P+n+'.png').convert('RGBA'); bb=im.getchannel('A').getbbox()
    x0,y0,x1,y1=bb; s=max(x1-x0,y1-y0); cx=(x0+x1)/2+shift[0]; cy=(y0+y1)/2+shift[1]
    c=im.crop((int(cx-s/2),int(cy-s/2),int(cx+s/2),int(cy+s/2)))
    out(mask_circle(c,frac),name,size)
disc('avatar_zeus',0.9,'zeus',192)
disc('powerup_hammer',0.74,'pw-hammer',128,(-6,-6))
for b in ['lightning','shuffle','olympus']: disc('powerup_'+b,0.84,'pw-'+b,128)
Image.open(P+'background_olympus_panorama.png').convert('RGB').save(O+'panorama.webp','WEBP',quality=82,method=6)
