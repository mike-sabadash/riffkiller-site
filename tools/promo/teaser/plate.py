# Intro plate in Mike's style (black rounded plate, gray title, white tab) — RGBA 1440x2560.
from PIL import Image, ImageDraw, ImageFont
S = 2
W, H = 1440, 2560
F = '/usr/share/fonts/opentype/inter/Inter-SemiBold.otf'
FB = '/usr/share/fonts/opentype/inter/Inter-Bold.otf'
im = Image.new('RGBA', (W * S, H * S), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
x0, y0, w, h = 164, 110, 707, 556
d.rounded_rectangle([x0 * S, y0 * S, (x0 + w) * S, (y0 + h) * S], radius=40 * S, fill=(0, 0, 0, 255))
t = ImageFont.truetype(F, 112 * S)
d.text((220 * S, (y0 + 34) * S), 'Intro', font=t, fill=(132, 132, 132, 255))
# tab: 6 strings, numbers on D (4th) and low E (6th)
L0, SP, lx0, lx1 = y0 + 310, 38, 220, 815
ys = [L0 + i * SP for i in range(6)]
for y in ys: d.line([lx0 * S, y * S, lx1 * S, y * S], fill=(110, 110, 110, 255), width=3 * S)
n = ImageFont.truetype(FB, 66 * S)
def num(x, y, s):
    bb = d.textbbox((0, 0), s, font=n); tw, th = bb[2] - bb[0], bb[3] - bb[1]
    d.rectangle([(x - 8) * S - tw / 2, (y - 20) * S, (x + 9) * S + tw / 2, (y + 20) * S], fill=(0, 0, 0, 255))
    d.text((x * S - tw / 2 - bb[0], y * S - th / 2 - bb[1]), s, font=n, fill=(255, 255, 255, 255))
nx = 330
num(nx, ys[5], '0')
# bend arrow from the low-E note up past the top string, label 1½
import math
pts = []
sx, sy, ex, ey = nx + 34, ys[5] - 4, nx + 150, ys[0] - 24
for i in range(41):
    u = i / 40; x = sx + (ex - sx) * (1 - (1 - u) ** 2); y = sy + (ey - sy) * (u ** 1.6)
    pts.append((x * S, y * S))
d.line(pts, fill=(255, 255, 255, 255), width=6 * S, joint='curve')
ah = 22
d.polygon([(ex * S, (ey - ah) * S), ((ex - ah * 0.75) * S, (ey + 4) * S), ((ex + ah * 0.75) * S, (ey + 4) * S)], fill=(255, 255, 255, 255))
lab = ImageFont.truetype(FB, 64 * S)
d.text(((ex + 28) * S, (ey - 66) * S), 'full + ½', font=lab, fill=(255, 255, 255, 255))
im = im.resize((W, H), Image.LANCZOS); im.save('/root/promo/t1/out/intro_plate.png')
print('ok')
