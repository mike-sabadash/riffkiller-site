# Voice-over v2: fewer, longer conversational lines; two references (EN read / EN + natural RU), picks best take.
import json, re, difflib, torch, numpy as np, soundfile as sf, librosa
from qwen_tts import Qwen3TTSModel
from faster_whisper import WhisperModel
from resemblyzer import VoiceEncoder, preprocess_wav
torch.set_num_threads(2)
LINES = [  # start, slot end, text
 (0.15, 2.95, "Watched my breakdown, and still can't play it?"),
 (3.15, 6.35, "So practice it here. Just loop one short part."),
 (6.55, 9.85, "Slow it down, watch both hands, and follow the tab."),
 (10.70, 14.30, "Then bring it back up to full speed. Clean? Three stars."),
 (15.20, 18.70, "Kill every riff, one shot at a time."),
 (19.60, 22.90, "Paranoid and Black Dog are free. Link's in my bio."),
]
REFS = {
 'en': ('src/01.wav', "Hi, I'm Mike. I break down famous guitar riffs, one short part at a time."),
 'combo': ('src/combo.wav', "Hi, I'm Mike. I break down famous guitar riffs, one short part at a time. Привет, это Майк. Я играю на гитаре и разбираю известные риффы по частям. Сначала медленно, потом в темпе, как в оригинале. Многие смотрят мои ролики и спрашивают, как это сыграть самим. Поэтому я сделал Riff Killer."),
}
m = Qwen3TTSModel.from_pretrained("Qwen/Qwen3-TTS-12Hz-1.7B-Base", device_map="cpu", dtype=torch.bfloat16)
prompts = {k: m.create_voice_clone_prompt(ref_audio=a, ref_text=t) for k, (a, t) in REFS.items()}
wm = WhisperModel("small", device="cpu", compute_type="int8"); enc = VoiceEncoder(verbose=False)
real = enc.embed_utterance(preprocess_wav('src/02.wav'))
norm = lambda s: re.sub(r'[^a-z ]', '', s.lower().replace("link's", 'links').replace('3', 'three'))
def lively(y, sr):
    y = librosa.resample(y, orig_sr=sr, target_sr=16000); f0 = librosa.yin(y, fmin=70, fmax=300, sr=16000); v = f0[(f0 > 70) & (f0 < 300)]
    return float(np.std(12 * np.log2(v / np.median(v)))) if len(v) > 10 else 0.0
out = []
for i, (t0, t1, text) in enumerate(LINES):
    best = None
    for ref in ('en', 'combo'):
        for k in range(2):
            torch.manual_seed(7000 + 100 * i + 10 * k + (ref == 'combo'))
            w, sr = m.generate_voice_clone(text=text, language="English", voice_clone_prompt=prompts[ref], temperature=1.0, subtalker_temperature=0.9)
            a = np.asarray(w[0], np.float32)
            _, idx = librosa.effects.trim(a, top_db=35); a = a[max(0, idx[0] - int(.03 * sr)): idx[1] + int(.08 * sr)]
            fn = f'vo2/l{i}_{ref}{k}.wav'; sf.write(fn, a, sr)
            heard = ' '.join(s.text for s in wm.transcribe(librosa.resample(a, orig_sr=sr, target_sr=16000), language='en', beam_size=5)[0]).strip()
            match = difflib.SequenceMatcher(None, norm(text), norm(heard)).ratio()
            sim = float(enc.embed_utterance(preprocess_wav(fn)) @ real); lv = lively(a, sr)
            dur = len(a) / sr; fits = dur <= (t1 - t0) * 1.1
            score = 2.5 * match + 1.5 * sim + 0.08 * lv + (0.4 if fits else 0)
            print(f'l{i} {ref}{k} dur {dur:.2f}/{t1 - t0:.2f} match {match:.2f} sim {sim:.3f} lively {lv:.2f} score {score:.2f} | {heard}', flush=True)
            if not best or score > best['score']: best = dict(fn=fn, score=score, dur=dur, match=match, sim=sim, lively=lv, heard=heard, ref=ref)
    out.append(dict(t0=t0, t1=t1, text=text, **best))
json.dump(out, open('vo2/pick.json', 'w'), indent=1)
print('DONE')
