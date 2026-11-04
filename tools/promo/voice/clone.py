import sys, time, torch, soundfile as sf
from qwen_tts import Qwen3TTSModel
torch.set_num_threads(2)
MODEL = sys.argv[1]; REF = sys.argv[2]; TAG = sys.argv[3]
REFS = {
 'en01': ('src/01.wav', "Hi, I'm Mike. I break down famous guitar riffs, one short part at a time."),
 'ru03': ('src/03.wav', "Привет, это Майк. Я играю на гитаре и разбираю известные риффы по частям. Сначала медленно, потом в темпе, как в оригинале. Многие смотрят мои ролики и спрашивают, как это сыграть самим. Поэтому я сделал Riff Killer. Там каждый рифф разрезан на короткие кусочки, их можно зациклить, замедлить и посмотреть обе руки. Попробуй сам. Paranoid и Black Dog бесплатно."),
}
LINES = [
 ("l1", "Watched my breakdown? Still can't play it?"),
 ("l2", "Loop one shot. Slow it down. See both hands."),
 ("l3", "Kill every riff, one shot at a time."),
]
t = time.time()
m = Qwen3TTSModel.from_pretrained(MODEL, device_map="cpu", dtype=(torch.bfloat16 if "1.7B" in MODEL else torch.float32))
print('load', round(time.time() - t, 1), flush=True)
ra, rt = REFS[REF]
prompt = m.create_voice_clone_prompt(ref_audio=ra, ref_text=rt)
for name, text in LINES:
    t = time.time()
    wavs, sr = m.generate_voice_clone(text=text, language="English", voice_clone_prompt=prompt)
    sf.write(f'out/{TAG}_{REF}_{name}.wav', wavs[0], sr)
    print(name, 'audio %.1fs, took %.1fs' % (len(wavs[0]) / sr, time.time() - t), flush=True)
