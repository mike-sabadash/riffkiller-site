# Audio v2: first 5.9 s only Mike's guitar (reel 0–5.9), then the reel's band section (reel 9.96→) — never two music tracks at once.
# Music stays loud between phrases and is lowered ~6 dB under the voice with soft ramps. Video is copied.
import json, subprocess, sys, numpy as np, soundfile as sf
video, out, pickf = sys.argv[1], sys.argv[2], sys.argv[3]
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
# end fade
fo = int(1.4 * SR); end = cut + len(bseg); bed[end - fo:end] *= np.linspace(1, 0, fo)[:, None]; bed[end:] = 0
# voice track
pick = json.load(open(pickf)); vo = np.zeros(len(bed), np.float32); spans = []
for p in pick:
    slot = p['t1'] - p['t0']; tempo = min(1.12, p['dur'] / slot) if p['dur'] > slot else 1.0
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', p['fn'], '-af', f'aresample={SR},atempo={tempo:.3f}', '-ac', '1', '-f', 'f32le', '-'], capture_output=True).stdout
    y = np.frombuffer(raw, np.float32); s = int(p['t0'] * SR); y = y[: len(vo) - s]; vo[s:s + len(y)] += y
    spans.append((p['t0'], p['t0'] + len(y) / SR))
# ducking envelope: -6 dB under the voice, 0.15 s attack before, 0.35 s release after
t = np.arange(len(bed)) / SR; g = np.ones(len(bed), np.float32); duck = 10 ** (-5 / 20)
for s0, s1 in spans:
    k = np.clip(np.minimum((t - (s0 - 0.15)) / 0.15, ((s1 + 0.35) - t) / 0.35), 0, 1)
    g = np.minimum(g, 1 - (1 - duck) * k)
bed *= g[:, None]
sf.write('/tmp/bed.wav', bed, SR); sf.write('/tmp/vo.wav', vo, SR)
fc = ('[1:a]loudnorm=I=-15:TP=-2:LRA=11,aresample=48000,apad,atrim=0:23.6[m];'
      '[2:a]highpass=f=85,equalizer=f=3200:t=q:w=1.2:g=2.5,acompressor=threshold=-22dB:ratio=3:attack=5:release=120:makeup=3,loudnorm=I=-15:TP=-2,aresample=48000,pan=stereo|c0=c0|c1=c0,apad,atrim=0:23.6[v];'
      '[m][v]amix=inputs=2:normalize=0:duration=first,loudnorm=I=-14:TP=-1:LRA=11[a]')
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', video, '-i', '/tmp/bed.wav', '-i', '/tmp/vo.wav', '-filter_complex', fc,
                '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-movflags', '+faststart', '-t', str(T), out], check=True)
print('ok', out, spans)
