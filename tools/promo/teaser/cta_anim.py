# Animated CTA plate (same design as t1/cta.py), eased motion-design entrance. Writes PNG frames in 1440-space region.
import math
from PIL import Image, ImageDraw, ImageFont
S = 2
F = '/usr/share/fonts/opentype/inter/Inter-SemiBold.otf'; FB = '/usr/share/fonts/opentype/inter/Inter-Bold.otf'
PAD_X, PAD_Y = 80, 70
items = [('t', 'Full breakdown + tabs', 52, F, (140, 140, 140, 255), 46),
         ('t', 'Play it slow →', 82, FB, (255, 255, 255, 255), 54),
         ('y', 'riffkiller.fun', 72, FB, (0, 0, 0, 255), 48),
         ('t', 'Link in bio', 46, F, (255, 255, 255, 255), 0)]
YP_X, YP_Y = 40, 26
tmp = ImageDraw.Draw(Image.new('L', (10, 10)))
rows = []
for kind, s, size, fnt, col, gap in items:
    f = ImageFont.truetype(fnt, size * S); bb = tmp.textbbox((0, 0), s, font=f); cb = tmp.textbbox((0, 0), 'Hb', font=f)
    tw, ch = (bb[2] - bb[0]) / S, (cb[3] - cb[1]) / S
    bw, bh = (tw + 2 * YP_X, ch + 2 * YP_Y) if kind == 'y' else (tw, ch)
    rows.append(dict(kind=kind, s=s, f=f, bb=bb, cb=cb, col=col, gap=gap, tw=tw, ch=ch, bw=bw, bh=bh))
w = max(r['bw'] for r in rows) + 2 * PAD_X; h = sum(r['bh'] + r['gap'] for r in rows) + 2 * PAD_Y
RX, RY, RW, RH = 300, 140, 840, 640           # output region in 1440 space
cx, x0, y0 = 720, 720 - w / 2, 190
def text_layer(r):
    pad = 20; im = Image.new('RGBA', (int((r['tw'] + 2 * pad) * S), int((r['ch'] + 2 * pad) * S)), (0, 0, 0, 0))
    ImageDraw.Draw(im).text((pad * S - r['bb'][0], pad * S - r['cb'][1]), r['s'], font=r['f'], fill=r['col']); return im, pad
y = y0 + PAD_Y
for r in rows:
    r['y'] = y; r['img'], r['pad'] = text_layer(r); y += r['bh'] + r['gap']
clamp = lambda x: max(0.0, min(1.0, x))
outExpo = lambda x: 1 if x >= 1 else 1 - 2 ** (-10 * x)
outCubic = lambda x: 1 - (1 - x) ** 3
def outBack(x, c1=1.25): c3 = c1 + 1; return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2
seg = lambda t, a, b, e: e(clamp((t - a) / (b - a)))
def frame(t):
    big = Image.new('RGBA', (RW * S, RH * S), (0, 0, 0, 0))
    # plate: grows from 0.9 with a soft overshoot, rises 36 px, fades in
    k = seg(t, 0, 0.55, outBack); a = seg(t, 0, 0.3, outCubic); dy = 36 * (1 - seg(t, 0, 0.6, outExpo))
    sc = 0.9 + 0.1 * k
    pw, ph = w * sc, h * sc; px, py = cx - pw / 2, y0 + h / 2 - ph / 2 + dy
    pl = Image.new('RGBA', (RW * S, RH * S), (0, 0, 0, 0)); d = ImageDraw.Draw(pl)
    d.rounded_rectangle([(px - RX) * S, (py - RY) * S, (px + pw - RX) * S, (py + ph - RY) * S], radius=40 * sc * S, fill=(0, 0, 0, int(255 * a)))
    big.alpha_composite(pl)
    for i, r in enumerate(rows):
        t0 = 0.16 + 0.075 * i
        ka = seg(t, t0, t0 + 0.3, outCubic); ky = 1 - seg(t, t0, t0 + 0.55, outExpo)
        yoff = 30 * ky + dy * 0.6
        if r['kind'] == 'y':
            kx = seg(t, t0 - 0.04, t0 + 0.5, outExpo); bw = r['bw'] * kx
            if bw > 1:
                yl = Image.new('RGBA', (RW * S, RH * S), (0, 0, 0, 0))
                ImageDraw.Draw(yl).rectangle([(cx - bw / 2 - RX) * S, (r['y'] + yoff - RY) * S, (cx + bw / 2 - RX) * S, (r['y'] + r['bh'] + yoff - RY) * S], fill=(243, 193, 26, int(255 * min(1, kx * 3))))
                big.alpha_composite(yl)
            ka = seg(t, t0 + 0.14, t0 + 0.42, outCubic); ty = r['y'] + YP_Y
        else: ty = r['y']
        if ka <= 0: continue
        im = r['img'].copy(); im.putalpha(im.getchannel('A').point(lambda v: int(v * ka)))
        big.alpha_composite(im, (int((cx - r['tw'] / 2 - r['pad'] - RX) * S), int((ty + yoff - r['pad'] - RY) * S)))
    return big.resize((RW, RH), Image.LANCZOS)
N = 50  # 1.0 s at 50 fps, last frame is the resting state
for n in range(N): frame(n / 50).save(f'/root/promo/t2/cta/{n:03d}.png')
print('ok', w, h)
