# CTA plate in Mike's plate style, covers the old small text block (x418–1021, y260–630). Generous padding.
from PIL import Image, ImageDraw, ImageFont
S = 2; W, H = 1440, 2560
F = '/usr/share/fonts/opentype/inter/Inter-SemiBold.otf'; FB = '/usr/share/fonts/opentype/inter/Inter-Bold.otf'
PAD_X, PAD_Y = 80, 70
items = [('t', 'Full breakdown + tabs', 52, F, (140, 140, 140, 255), 46),
         ('t', 'Play it slow →', 82, FB, (255, 255, 255, 255), 54),
         ('y', 'riffkiller.fun', 72, FB, (0, 0, 0, 255), 48),
         ('t', 'Link in bio', 46, F, (255, 255, 255, 255), 0)]
tmp = ImageDraw.Draw(Image.new('L', (10, 10)))
def box(s, size, fnt):
    f = ImageFont.truetype(fnt, size * S); bb = tmp.textbbox((0, 0), s, font=f); return f, bb
YP_X, YP_Y = 40, 26
rows = []
for kind, s, size, fnt, col, gap in items:
    f, bb = box(s, size, fnt); tw, th = (bb[2] - bb[0]) / S, (bb[3] - bb[1]) / S
    # use cap-height style box: digits/caps height for consistent rhythm
    _, cb = box('Hb', size, fnt); ch = (cb[3] - cb[1]) / S
    bw, bh = (tw + 2 * YP_X, ch + 2 * YP_Y) if kind == 'y' else (tw, ch)
    rows.append((kind, s, f, bb, col, gap, tw, ch, bw, bh, cb))
w = max(r[8] for r in rows) + 2 * PAD_X; h = sum(r[9] + r[5] for r in rows) + 2 * PAD_Y
x0, y0 = 720 - w / 2, 190
im = Image.new('RGBA', (W * S, H * S), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
d.rounded_rectangle([x0 * S, y0 * S, (x0 + w) * S, (y0 + h) * S], radius=40 * S, fill=(0, 0, 0, 255))
y = y0 + PAD_Y
for kind, s, f, bb, col, gap, tw, ch, bw, bh, cb in rows:
    if kind == 'y':
        d.rectangle([(720 - bw / 2) * S, y * S, (720 + bw / 2) * S, (y + bh) * S], fill=(243, 193, 26, 255)); ty = y + YP_Y
    else: ty = y
    d.text(((720 - tw / 2) * S - bb[0], ty * S - cb[1]), s, font=f, fill=col)
    y += bh + gap
print('plate', round(x0), round(y0), round(w), round(h))
im.resize((W, H), Image.LANCZOS).save('/root/promo/t1/out/cta.png')
