# Renders the composition: python3 rv2.py stills <hook> t1 t2 ... | python3 rv2.py scene <hook> <t0> <t1> <out.mp4>
import sys, io, os, subprocess, numpy as np
from PIL import Image
from playwright.sync_api import sync_playwright
FPS = 30
mode, hook = sys.argv[1], sys.argv[2]
with sync_playwright() as p:
    b = p.chromium.launch(args=['--allow-file-access-from-files'])
    pg = b.new_page(viewport={'width': 1080, 'height': 1920}, device_scale_factor=1)
    pg.on('console', lambda m: print('console', m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: print('PAGEERR', e))
    pg.goto('file://' + os.path.abspath('comp3.html'))
    pg.evaluate('window.ready')
    stage = pg.locator('#stage')
    def shot(t):
        pg.evaluate(f'renderFrame({t:.5f})')
        return Image.open(io.BytesIO(pg.screenshot(type='jpeg', quality=95, clip={'x': 0, 'y': 0, 'width': 1080, 'height': 1920}))).convert('RGB')
    def frame(t):
        S = pg.evaluate(f'samplesAt({t:.5f})')
        if S == 1: return np.asarray(shot(t))
        acc = np.zeros((1920, 1080, 3), np.float32)
        for k in range(S):
            acc += np.asarray(shot(t + (k / (S - 1) - 0.5) * 0.6 / FPS), np.float32)
        return (acc / S).round().astype(np.uint8)
    if mode == 'stills':
        os.makedirs('stills', exist_ok=True)
        for ts in sys.argv[3:]:
            Image.fromarray(frame(float(ts))).save(f'stills/{hook}_{ts}.jpg', quality=92)
    else:
        t0, t1, out = float(sys.argv[3]), float(sys.argv[4]), sys.argv[5]
        tmp = out[:-4] + '.part.mp4'
        enc = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', '1080x1920', '-r', '30', '-i', '-',
            '-c:v', 'libx264', '-preset', 'medium', '-crf', '15', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-r', '30', tmp], stdin=subprocess.PIPE)
        n0, n1 = round(t0 * FPS), round(t1 * FPS)
        for n in range(n0, n1):
            enc.stdin.write(frame(n / FPS).tobytes())
        enc.stdin.close()
        if enc.wait() == 0: os.replace(tmp, out); print('ok', out, n1 - n0)
    b.close()
