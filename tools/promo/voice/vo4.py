# Voice-over v3: continuous chunks (no gaps between phrases), punchy final line picked by energy.
import json, re, difflib, sys, torch, numpy as np, soundfile as sf, librosa
from qwen_tts import Qwen3TTSModel
from faster_whisper import WhisperModel
from resemblyzer import VoiceEncoder, preprocess_wav
torch.set_num_threads(2)
CHUNKS = [  # id, start, max end, takes, temperature, mode, texts
 ('h', 0.10, 1.9, 3, 1.05, 'natural', ["Want to play this riff?", "So, you want to play this riff?"]),
 ('f', 2.35, 8.4, 2, 1.0, 'natural', ["Loop any part, slow it down, follow the tab, then play it at full speed."]),
 ('k', 9.0, 12.6, 3, 1.15, 'punch', ["Kill every riff! It's free, link in bio.", "Now go kill every riff! It's free, link in bio.", "Kill. Every. Riff! It's free, link in bio."]),
]
only = sys.argv[1:]  # optional chunk ids
REFS = {
 'en': ('src/01.wav', "Hi, I'm Mike. I break down famous guitar riffs, one short part at a time."),
 'combo': ('src/combo.wav', "Hi, I'm Mike. I break down famous guitar riffs, one short part at a time. Привет, это Майк. Я играю на гитаре и разбираю известные риффы по частям. Сначала медленно, потом в темпе, как в оригинале. Многие смотрят мои ролики и спрашивают, как это сыграть самим. Поэтому я сделал Riff Killer."),
}
m = Qwen3TTSModel.from_pretrained("Qwen/Qwen3-TTS-12Hz-1.7B-Base", device_map="cpu", dtype=torch.bfloat16)
prompts = {k: m.create_voice_clone_prompt(ref_audio=a, ref_text=t) for k, (a, t) in REFS.items()}
wm = WhisperModel("small", device="cpu", compute_type="int8"); enc = VoiceEncoder(verbose=False)
real = enc.embed_utterance(preprocess_wav('src/02.wav'))
norm = lambda s: re.sub(r'[^a-z ]', '', s.lower().replace("link's", 'links').replace('3', 'three').replace('.', ' '))
def feats(y, sr):
    y16 = librosa.resample(y, orig_sr=sr, target_sr=16000); f0 = librosa.yin(y16, fmin=70, fmax=320, sr=16000); v = f0[(f0 > 70) & (f0 < 320)]
    st = float(np.std(12 * np.log2(v / np.median(v)))) if len(v) > 10 else 0.0
    med = float(np.median(v)) if len(v) else 0.0
    rms = librosa.feature.rms(y=y16)[0]; act = rms[rms > 0.02]
    crest = float(np.percentile(act, 95) / (np.median(act) + 1e-6)) if len(act) else 1.0
    return st, med, crest
base = json.load(open('vo4/pick.json')) if only else []
out = [p for p in base if p['id'] not in only]
for cid, t0, t1, takes, temp, mode, texts in CHUNKS:
    if only and cid not in only: continue
    best = None
    for ti, text in enumerate(texts):
        for ref in ('combo', 'en'):
            for k in range(takes):
                torch.manual_seed(9100 + 1000 * ti + 10 * k + (ref == 'en') + hash(cid) % 97)
                w, sr = m.generate_voice_clone(text=text, language="English", voice_clone_prompt=prompts[ref], temperature=temp, subtalker_temperature=0.9)
                a = np.asarray(w[0], np.float32)
                _, idx = librosa.effects.trim(a, top_db=35); a = a[max(0, idx[0] - int(.03 * sr)): idx[1] + int(.08 * sr)]
                fn = f'vo4/{cid}_t{ti}_{ref}{k}.wav'; sf.write(fn, a, sr)
                heard = ' '.join(s.text for s in wm.transcribe(librosa.resample(a, orig_sr=sr, target_sr=16000), language='en', beam_size=5)[0]).strip()
                match = difflib.SequenceMatcher(None, norm(text), norm(heard)).ratio()
                sim = float(enc.embed_utterance(preprocess_wav(fn)) @ real); st, med, crest = feats(a, sr)
                dur = len(a) / sr; fits = dur <= (t1 - t0) * 1.08
                # long internal silences make it sound broken
                iv = librosa.effects.split(a, top_db=32); gaps = [(iv[j + 1][0] - iv[j][1]) / sr for j in range(len(iv) - 1)]; maxgap = max(gaps) if gaps else 0
                score = 2.5 * match + 1.5 * sim + (0.4 if fits else -0.6) - 1.0 * max(0, maxgap - 0.45)
                if mode == 'punch': score += 0.15 * st + 0.004 * med + 0.35 * crest - 0.15 * max(0, dur - 3.2)
                else: score += 0.06 * st
                print(f'{cid} t{ti} {ref}{k} dur {dur:.2f}/{t1 - t0:.2f} gap {maxgap:.2f} match {match:.2f} sim {sim:.3f} st {st:.2f} f0 {med:.0f} crest {crest:.2f} score {score:.2f} | {heard}', flush=True)
                if not best or score > best['score']: best = dict(fn=fn, score=score, dur=dur, match=match, sim=sim, st=st, f0=med, heard=heard, ref=ref, text=text)
    out.append(dict(id=cid, t0=t0, t1=t1, **best))
out.sort(key=lambda p: p['t0'])
json.dump(out, open('vo4/pick.json', 'w'), indent=1)
print('DONE')
