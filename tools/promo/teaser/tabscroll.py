# Scrolling Iron Man tab (white on black, used with screen blend) for the full-speed part. Writes raw RGB to stdout.
import sys, numpy as np
from PIL import Image, ImageDraw, ImageFont
W, HS, FPS, DUR = 1440, 360, 50, 24.19
B0, BEAT, T_ON = 11.24, 0.832, 11.30
PX, PH = 520, 300            # px per second, playhead x
LY = [40 + i * 43 for i in range(6)]   # e B G D A E (strip coords)
FB = ImageFont.truetype('/usr/share/fonts/opentype/inter/Inter-Bold.otf', 44)
FS = ImageFont.truetype('/usr/share/fonts/opentype/inter/Inter-SemiBold.otf', 36)
# one riff cycle (8 beats): beat, low-E fret, A fret, slide-to-next ('u'/'d'/None), ghost
CYC = [(0, 7, 9, 'u'), (1, 10, 12, None), (2, 10, 12, 'u'), (2.5, 12, 14, None), (3, 12, 14, None),
       (4, 15, 17, 'd'), (4.25, 14, 16, None), (4.5, 15, 17, 'd'), (4.75, 14, 16, 'u'), (5, 15, 17, 'd'), (5.5, 10, 12, None),
       (6, 10, 12, 'u'), (6.5, 12, 14, None), (7, 12, 14, None), (7.5, None, 17, 'g')]
NOTES = []
for k in range(3):
    for b, e, a, m in CYC: NOTES.append((B0 + (8 * k + b) * BEAT, e, a, m))
xs = np.ones(W, np.float32); xs[:200] = np.linspace(0, 1, 200) ** 1.5; xs[-220:] = np.linspace(1, 0, 220) ** 1.5
mask = xs[None, :, None]
out = sys.stdout.buffer
def lerp(a, b, k): return tuple(int(a[i] + (b[i] - a[i]) * k) for i in range(3))
for f in range(int(round(DUR * FPS))):
    t = f / FPS
    im = Image.new('RGB', (W, HS), 0)
    if t >= T_ON - 0.02:
        d = ImageDraw.Draw(im); on = min(1, (t - T_ON) / 0.3)
        lc = int(150 * on)
        for y in LY: d.line([0, y, W, y], fill=(lc, lc, lc), width=3)
        # playhead
        pc = int(210 * on); d.line([PH, LY[0], PH, LY[-1]], fill=(pc, pc, pc), width=3)
        pos = [(PH + (nt - t) * PX, e, a, m, nt) for nt, e, a, m in NOTES]
        # slides first (under the numbers)
        for i, (x, e, a, m, nt) in enumerate(pos[:-1]):
            if m in ('u', 'd'):
                x2 = pos[i + 1][0]
                if -60 < x < W + 60:
                    mx = (x + x2) / 2
                    for yy in (LY[4], LY[5]):
                        dy = 10 if m == 'u' else -10
                        d.line([mx - 13, yy + dy, mx + 13, yy - dy], fill=(int(220 * on),) * 3, width=4)
        for x, e, a, m, nt in pos:
            if x < -60 or x > W + 60: continue
            dt = t - nt; hit = max(0.0, 1 - dt / 0.35) if dt >= 0 else 0.0
            col = lerp((255, 255, 255), (255, 212, 0), hit); col = tuple(int(c * on) for c in col)
            for s, yy in ((e, LY[5]), (a, LY[4])):
                if s is None: continue
                txt = f'({s})' if m == 'g' else str(s); fnt = FS if m == 'g' else FB
                bb = d.textbbox((0, 0), txt, font=fnt); tw, th = bb[2] - bb[0], bb[3] - bb[1]
                d.rectangle([x - tw / 2 - 8, yy - 17, x + tw / 2 + 8, yy + 17], fill=0)
                d.text((x - tw / 2 - bb[0], yy - th / 2 - bb[1]), txt, font=fnt, fill=col)
            if hit > 0:   # soft glow at the playhead on the hit
                g = int(90 * hit * on)
                for r, a_ in ((34, 0.35), (24, 0.6)):
                    pass
    a = (np.asarray(im, np.float32) * mask).astype(np.uint8)
    out.write(a.tobytes())
