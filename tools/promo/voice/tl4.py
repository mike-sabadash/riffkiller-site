import json, librosa, sys
from faster_whisper import WhisperModel
pick = {p['id']: p for p in json.load(open('vo4/pick.json'))}
if len(sys.argv) > 1: pick['k']['fn'] = sys.argv[1]
wm = WhisperModel("small", device="cpu", compute_type="int8")
def words(fn):
    y, sr = librosa.load(fn, sr=16000); segs, _ = wm.transcribe(y, language='en', word_timestamps=True)
    return [(w.word.strip().lower().strip('.,?!'), w.start, w.end) for s in segs for w in s.words], len(y) / sr
h, f, k = pick['h'], pick['f'], pick['k']
hw, hd = words(h['fn']); fw, fd = words(f['fn']); kw, kd = words(k['fn'])
print(hw, fw, kw, sep='\n')
h0 = 0.12; f0 = max(2.3, h0 + hd + 0.95)
st = lambda ws, key: next(s for w, s, e in ws if w.startswith(key))
app = f0 + st(fw, 'loop') - 0.08; slow = f0 + st(fw, 'slow') - 0.06; tab = f0 + st(fw, 'follow') - 0.06; full = f0 + st(fw, 'then') - 0.04
kill = max(full + 1.7, f0 + fd + 0.35); k0 = kill - 0.04
its = next((s for w, s, e in kw if w.startswith('it')), kd * 0.45)
pack = k0 + its - 0.05; end = max(pack + 2.3, k0 + kd + 1.0)
TL = dict(app=round(app, 3), slow=round(slow, 3), tab=round(tab, 3), full=round(full, 3), kill=round(kill, 3), pack=round(pack, 3), end=round(end, 2))
print(TL)
open('/root/promo/v2/tl.js', 'w').write('window.TL=' + json.dumps(TL) + ';\n')
json.dump([dict(id='h', fn=h['fn'], t0=h0, t1=h0 + hd + 0.5, dur=hd), dict(id='f', fn=f['fn'], t0=f0, t1=f0 + fd + 0.5, dur=fd), dict(id='k', fn=k['fn'], t0=k0, t1=k0 + kd + 0.5, dur=kd)], open('vo4/place.json', 'w'), indent=1)
