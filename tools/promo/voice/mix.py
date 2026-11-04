# Lays the picked voice lines on the promo: VO bus (EQ + compression), music ducked under the voice, loudness -14 LUFS, video copied.
import json, subprocess, soundfile as sf, sys
pick = json.load(open('vo/pick.json')); video = sys.argv[1]; out = sys.argv[2]
inputs = ['-i', video]; parts = []
for k, p in enumerate(pick):
    dur, slot = p['dur'], p['t1'] - p['t0']
    tempo = min(1.12, dur / slot) if dur > slot else 1.0
    inputs += ['-i', p['fn']]
    parts.append(f"[{k+1}:a]aresample=48000,aformat=channel_layouts=mono,atempo={tempo:.3f},adelay={int(p['t0']*1000)}:all=1[v{k}]")
n = len(pick)
fc = ';'.join(parts) + ';' + ''.join(f'[v{k}]' for k in range(n)) + f'amix=inputs={n}:normalize=0:duration=longest,' \
     'highpass=f=85,equalizer=f=3200:t=q:w=1.2:g=2.5,acompressor=threshold=-20dB:ratio=3:attack=5:release=120:makeup=4,' \
     'pan=stereo|c0=c0|c1=c0,asplit=2[vo][key];' \
     '[0:a]aresample=48000,volume=-3dB[mus];[mus][key]sidechaincompress=threshold=0.03:ratio=8:attack=15:release=350:makeup=1[duck];' \
     '[duck][vo]amix=inputs=2:normalize=0:duration=first,loudnorm=I=-14:TP=-1:LRA=9[a]'
subprocess.run(['ffmpeg', '-v', 'error', '-y', *inputs, '-filter_complex', fc, '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-movflags', '+faststart', out], check=True)
print('ok', out)
