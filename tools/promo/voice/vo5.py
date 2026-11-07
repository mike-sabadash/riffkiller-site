import torch, numpy as np, soundfile as sf, librosa
from qwen_tts import Qwen3TTSModel
from faster_whisper import WhisperModel
torch.set_num_threads(2)
REFS = {'en': ('src/01.wav', "Hi, I'm Mike. I break down famous guitar riffs, one short part at a time."),
 'combo': ('src/combo.wav', open('combo_text.txt').read().strip())}
m = Qwen3TTSModel.from_pretrained("Qwen/Qwen3-TTS-12Hz-1.7B-Base", device_map="cpu", dtype=torch.bfloat16)
pr = {k: m.create_voice_clone_prompt(ref_audio=a, ref_text=t) for k, (a, t) in REFS.items()}
wm = WhisperModel("small", device="cpu", compute_type="int8")
for ti, text in enumerate(["Kill every riff!", "Kill every rif!", "Go kill every riff!", "Kill every riff, man!"]):
    for ref in pr:
        for k in range(3):
            torch.manual_seed(500 + 10 * ti + k + (ref == 'en'))
            w, sr = m.generate_voice_clone(text=text, language="English", voice_clone_prompt=pr[ref], temperature=1.05, subtalker_temperature=0.9)
            a = np.asarray(w[0], np.float32); _, idx = librosa.effects.trim(a, top_db=35); a = a[max(0, idx[0] - int(.03 * sr)): idx[1] + int(.08 * sr)]
            fn = f'vo5/kill_t{ti}_{ref}{k}.wav'; sf.write(fn, a, sr)
            segs, _ = wm.transcribe(librosa.resample(a, orig_sr=sr, target_sr=16000), language='en', word_timestamps=True, beam_size=5)
            ws = [(x.word.strip(), round(x.probability, 2)) for s in segs for x in s.words]
            print(fn, round(len(a) / sr, 2), ws, flush=True)
print('DONE')
