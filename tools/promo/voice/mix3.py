# Audio v3: louder music, voice sits inside the mix (light duck, room, glue), no long gaps, no fade to silence-black.
import json, subprocess, sys, numpy as np, soundfile as sf
video, out, pickf = sys.argv[1], sys.argv[2], sys.argv[3]
MUS_I = float(sys.argv[4]) if len(sys.argv) > 4 else -11.5   # music loudness
VO_I = float(sys.argv[5]) if len(sys.argv) > 5 else -14.0    # voice loudness
DUCK = float(sys.argv[6]) if len(sys.argv) > 6 else -3.0     # dB under the voice
SR, T = 48000, 23.6
def load(src, ss, dur):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-ss', str(ss), '-t', str(dur), '-i', src, '-vn', '-ac', '2', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True).stdout
    return np.frombuffer(raw, np.float32).reshape(-1, 2).copy()
REEL = '/root/promo/src/reels.mov'
a = load(REEL, 0, 5.9 + 0.05); b = load(REEL, 9.96, 30)
bed = np.zeros((int(T * SR), 2), np.float32)
cut = int(5.9 * SR); xf = int(0.05 * SR)
a = a[:cut + xf]; a[cut:cut + xf] *= np.linspace(1, 0, xf)[:, None]
bed[:len(a)] += a
bseg = b[: len(bed) - cut]; bseg[:xf] *= np.linspace(0, 1, xf)[:, None]; bed[cut:cut + len(bseg)] += bseg
fo = int(0.7 * SR); bed[-fo:] *= np.linspace(1, 0.0, fo)[:, None]
pick = json.load(open(pickf)); vo = np.zeros(len(bed), np.float32); spans = []
for p in pick:
    slot = p['t1'] - p['t0']; tempo = min(1.1, p['dur'] / slot) if p['dur'] > slot else 1.0
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', p['fn'], '-af', f'aresample={SR},atempo={tempo:.3f}', '-ac', '1', '-f', 'f32le', '-'], capture_output=True).stdout
    y = np.frombuffer(raw, np.float32); s = int(p['t0'] * SR); y = y[: len(vo) - s]; vo[s:s + len(y)] += y
    spans.append((round(p['t0'], 2), round(p['t0'] + len(y) / SR, 2)))
t = np.arange(len(bed)) / SR; g = np.ones(len(bed), np.float32); duck = 10 ** (DUCK / 20)
for s0, s1 in spans:
    k = np.clip(np.minimum((t - (s0 - 0.12)) / 0.12, ((s1 + 0.25) - t) / 0.25), 0, 1)
    g = np.minimum(g, 1 - (1 - duck) * k)
sf.write('/tmp/bed3.wav', bed, SR); sf.write('/tmp/vo3.wav', vo, SR); sf.write('/tmp/duck3.wav', g, SR)
fc = (f'[1:a]loudnorm=I={MUS_I}:TP=-1.5:LRA=9,aresample=48000,apad,atrim=0:23.6[m0];'
      '[m0][3:a]amultiply[m];'
      '[2:a]highpass=f=95,lowpass=f=12000,equalizer=f=250:t=q:w=1:g=-2,equalizer=f=3000:t=q:w=1.4:g=1.5,'
      'acompressor=threshold=-24dB:ratio=4:attack=4:release=90:makeup=4,'
      f'aecho=0.85:0.5:38|71:0.10|0.06,loudnorm=I={VO_I}:TP=-2,aresample=48000,pan=stereo|c0=c0|c1=c0,apad,atrim=0:23.6[v];'
      '[m][v]amix=inputs=2:normalize=0:duration=first,acompressor=threshold=-14dB:ratio=2:attack=15:release=200:makeup=1,'
      'loudnorm=I=-10:TP=-1:LRA=8,aresample=48000,alimiter=limit=0.89:level=false[a]')
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', video, '-i', '/tmp/bed3.wav', '-i', '/tmp/vo3.wav', '-i', '/tmp/duck3.wav', '-filter_complex', fc,
                '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-movflags', '+faststart', '-t', str(T), out], check=True)
print('ok', out, spans)
