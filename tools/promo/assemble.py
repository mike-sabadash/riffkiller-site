# raw/<name> -> clips/<name>.mp4 (30 fps CFR, frames held until the next one, audio aligned by wall clock)
import json, sys, subprocess, os
name = sys.argv[1]; d = f'raw/{name}'
j = json.load(open(f'{d}/frames.json')); fr = j['frames']; t0 = j['t0']
lst = open(f'{d}/list.txt', 'w')
for a, b in zip(fr, fr[1:] + [None]):
    dur = (b['ts'] - a['ts']) if b else 0.1
    lst.write(f"file '{os.path.basename(a['fn'])}'\nduration {dur:.4f}\n")
lst.write(f"file '{os.path.basename(fr[-1]['fn'])}'\n"); lst.close()
off = fr[0]['ts'] - t0  # audio started at t0, first frame later -> skip that much audio
os.makedirs('clips', exist_ok=True)
subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-f','concat','-safe','0','-i',f'{d}/list.txt',
  '-ss',f'{max(off,0):.3f}','-i',f'{d}/audio.wav','-map','0:v','-map','1:a','-vf','fps=30,scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p',
  '-c:v','libx264','-crf','14','-preset','medium','-c:a','aac','-b:a','256k','-shortest',f'clips/{name}.mp4'], check=True)
print('ok', name, f'audio offset {off:.3f}s')
