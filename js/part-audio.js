/**
 * Sound of one looped part as its own short file.
 * Safari keeps playing a video's sound for a moment after a seek is asked for, so a part looped on the
 * video itself lets a few notes of the next part through, differently each pass. A file that holds
 * exactly the part cannot sound past its end: the riff's sound is decoded once, the part is cut out
 * sample-exact and played by an <audio> element (speed changes keep the pitch, as on the video).
 */
(function (root) {
    'use strict';
    const FADE = 0.004; // s, so the cut does not click

    // Mono or stereo 16-bit WAV of [start, end) seconds of a decoded buffer.
    function wav(buffer, start, end) {
        const rate = buffer.sampleRate, channels = Math.min(2, buffer.numberOfChannels);
        const from = Math.max(0, Math.round(start * rate)), to = Math.min(buffer.length, Math.round(end * rate));
        const n = Math.max(0, to - from), fade = Math.round(FADE * rate);
        const out = new DataView(new ArrayBuffer(44 + n * channels * 2));
        const text = (at, s) => { for (let i = 0; i < s.length; i++) out.setUint8(at + i, s.charCodeAt(i)); };
        text(0, 'RIFF'); out.setUint32(4, 36 + n * channels * 2, true); text(8, 'WAVE');
        text(12, 'fmt '); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, channels, true);
        out.setUint32(24, rate, true); out.setUint32(28, rate * channels * 2, true); out.setUint16(32, channels * 2, true); out.setUint16(34, 16, true);
        text(36, 'data'); out.setUint32(40, n * channels * 2, true);
        const data = [];
        for (let c = 0; c < channels; c++) data.push(buffer.getChannelData(c));
        let at = 44;
        for (let i = 0; i < n; i++) {
            const gain = Math.min(1, i / fade, (n - 1 - i) / fade);
            for (let c = 0; c < channels; c++) {
                const v = Math.max(-1, Math.min(1, data[c][from + i] * gain));
                out.setInt16(at, v < 0 ? v * 0x8000 : v * 0x7fff, true);
                at += 2;
            }
        }
        return new Blob([out.buffer], { type: 'audio/wav' });
    }

    class PartAudio {
        constructor() {
            this.decoded = null; // { src, promise }
            this.clips = new Map();
        }
        // Decodes the sound of a (downloaded) video once per source.
        decode(src) {
            if (this.decoded && this.decoded.src === src) return this.decoded.promise;
            this.clips.forEach(url => URL.revokeObjectURL(url));
            this.clips.clear();
            const promise = fetch(src).then(r => r.arrayBuffer()).then(data => {
                const Ctx = root.AudioContext || root.webkitAudioContext;
                if (!Ctx) throw new Error('no Web Audio');
                const ctx = new Ctx();
                return new Promise((resolve, reject) => {
                    // Callback form: older Safari has no promise from decodeAudioData.
                    const done = buffer => { if (ctx.close) ctx.close(); resolve(buffer); };
                    const fail = error => { if (ctx.close) ctx.close(); reject(error || new Error('decode failed')); };
                    const p = ctx.decodeAudioData(data, done, fail);
                    if (p && p.catch) p.catch(fail);
                });
            });
            this.decoded = { src, promise };
            return promise;
        }
        // Object URL of the part's sound; null when the video's sound cannot be decoded here.
        clip(src, start, end) {
            const key = src + '|' + start + '|' + end;
            if (this.clips.has(key)) return Promise.resolve(this.clips.get(key));
            return this.decode(src).then(buffer => {
                if (!buffer || !(end > start)) return null;
                const url = URL.createObjectURL(wav(buffer, start, end));
                this.clips.set(key, url);
                return url;
            }).catch(() => null);
        }
    }

    PartAudio.wav = wav;
    root.PartAudio = PartAudio;
    if (typeof module !== 'undefined' && module.exports) module.exports = PartAudio;
})(typeof window !== 'undefined' ? window : globalThis);
