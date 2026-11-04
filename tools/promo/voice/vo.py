# Generates the promo voice-over in Mike's cloned voice: several takes per line, picks the best by Whisper text match + voice similarity.
import json, re, time, difflib, torch, numpy as np, soundfile as sf, librosa
from qwen_tts import Qwen3TTSModel
from faster_whisper import WhisperModel
from resemblyzer import VoiceEncoder, preprocess_wav
torch.set_num_threads(2)
LINES = [  # start (s, promo time), slot end, text
 (0.15, 2.95, "Watched my breakdown? Still can't play it?"),
 (3.15, 4.45, "Now practice it."),
 (4.60, 6.40, "Loop one shot."),
 (6.55, 7.85, "Slow it down."),
 (8.00, 8.95, "See both hands."),
 (9.00, 9.95, "Follow the tab."),
 (10.70, 12.15, "Speed trainer."),
 (12.25, 12.85, "Clean?"),
 (12.95, 14.30, "Three stars."),
 (15.20, 18.60, "Kill every riff. One shot at a time."),
 (19.60, 22.90, "Paranoid and Black Dog are free. Link in bio."),
]
TAKES = 3
m = Qwen3TTSModel.from_pretrained("Qwen/Qwen3-TTS-12Hz-1.7B-Base", device_map="cpu", dtype=torch.bfloat16)
prompt = m.create_voice_clone_prompt(ref_audio='src/01.wav', ref_text="Hi, I'm Mike. I break down famous guitar riffs, one short part at a time.")
wm = WhisperModel("small", device="cpu", compute_type="int8"); enc = VoiceEncoder(verbose=False)
real = enc.embed_utterance(preprocess_wav('src/02.wav'))
norm = lambda s: re.sub(r'[^a-z ]', '', s.lower().replace('3', 'three'))
out = []
for i, (t0, t1, text) in enumerate(LINES):
    best = None
    for k in range(TAKES):
        torch.manual_seed(1000 * i + k)
        w, sr = m.generate_voice_clone(text=text, language="English", voice_clone_prompt=prompt)
        a = np.asarray(w[0], np.float32)
        # trim leading/trailing silence
        yt, idx = librosa.effects.trim(a, top_db=35); a = a[max(0, idx[0] - int(.03 * sr)): idx[1] + int(.06 * sr)]
        fn = f'vo/l{i:02d}_t{k}.wav'; sf.write(fn, a, sr)
        heard = ' '.join(s.text for s in wm.transcribe(librosa.resample(a, orig_sr=sr, target_sr=16000), language='en', beam_size=5)[0])
        match = difflib.SequenceMatcher(None, norm(text), norm(heard)).ratio()
        sim = float(enc.embed_utterance(preprocess_wav(fn)) @ real)
        dur = len(a) / sr; fits = dur <= (t1 - t0) * 1.12
        score = match * 2 + sim + (0.3 if fits else 0)
        print(f'l{i} t{k} dur {dur:.2f}/{t1 - t0:.2f} match {match:.2f} sim {sim:.3f} | {heard.strip()}', flush=True)
        if not best or score > best['score']: best = dict(fn=fn, score=score, dur=dur, match=match, sim=sim, heard=heard.strip())
    out.append(dict(t0=t0, t1=t1, text=text, **best))
json.dump(out, open('vo/pick.json', 'w'), indent=1)
