/**
 * Tab-to-audio sync: finds the moment every note of the tab is played in the riff's video.
 * The notes are known from the tab, so this is alignment, not transcription: the sound is reduced to
 * note attacks (onsets) and a semitone spectrum, and each part's notes are matched to them in order
 * with dynamic programming. The result per part is a list of anchors [bar, tick, seconds] that the
 * player and the Riff DNA atoms use instead of stretching the bars evenly over the part.
 */
(function (global) {
    'use strict';

    var RATE = 22050;
    var HOP = 220;            // ~10 ms per frame
    var N_ONSET = 1024;
    var N_PITCH = 4096;
    var LOW = 36, HIGH = 96;  // semitone range of the spectrum (C2..C7)
    var BINS = HIGH - LOW + 1;
    // A frame's sound is reported at the middle of the onset window; the flux peaks ~10 ms before the attack.
    var LATENCY = N_ONSET / 2 / RATE + 0.01;

    // ---- Signal processing (pure) ----

    function fft(re, im) {
        var n = re.length, i, j, k, len, half, step, ang, wr, wi, tr, ti, cr, ci;
        for (i = 1, j = 0; i < n; i++) {
            var bit = n >> 1;
            for (; j & bit; bit >>= 1) j ^= bit;
            j ^= bit;
            if (i < j) { tr = re[i]; re[i] = re[j]; re[j] = tr; tr = im[i]; im[i] = im[j]; im[j] = tr; }
        }
        for (len = 2; len <= n; len <<= 1) {
            half = len >> 1; ang = -2 * Math.PI / len;
            step = { r: Math.cos(ang), i: Math.sin(ang) };
            for (i = 0; i < n; i += len) {
                wr = 1; wi = 0;
                for (k = 0; k < half; k++) {
                    var a = i + k, b = a + half;
                    tr = re[b] * wr - im[b] * wi; ti = re[b] * wi + im[b] * wr;
                    re[b] = re[a] - tr; im[b] = im[a] - ti;
                    re[a] += tr; im[a] += ti;
                    cr = wr * step.r - wi * step.i; ci = wr * step.i + wi * step.r;
                    wr = cr; wi = ci;
                }
            }
        }
    }

    function hann(n) {
        var w = new Float32Array(n);
        for (var i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1));
        return w;
    }

    function spectrum(samples, start, n, win, re, im) {
        for (var i = 0; i < n; i++) {
            var s = start + i;
            re[i] = s >= 0 && s < samples.length ? samples[s] * win[i] : 0;
            im[i] = 0;
        }
        fft(re, im);
    }

    /**
     * Onset strength and semitone spectrum of mono samples at 22050 Hz, one frame per 10 ms.
     * t0: video time of the first sample. Returns { t0, frames, onset: Float32Array(frames) in 0..1, pitch: Float32Array(frames * BINS) (L2 per frame) }.
     */
    function features(samples, t0) {
        var frames = Math.max(0, Math.floor((samples.length - 1) / HOP) + 1);
        var onset = new Float32Array(frames), pitch = new Float32Array(frames * BINS);
        var wo = hann(N_ONSET), wp = hann(N_PITCH);
        var ro = new Float32Array(N_ONSET), io = new Float32Array(N_ONSET);
        var rp = new Float32Array(N_PITCH), ip = new Float32Array(N_PITCH);
        var prev = new Float32Array(N_ONSET / 2), cur = new Float32Array(N_ONSET / 2);
        // FFT bin → semitone bin for the pitch spectrum.
        var map = new Int16Array(N_PITCH / 2);
        for (var b = 0; b < N_PITCH / 2; b++) {
            var f = b * RATE / N_PITCH;
            var m = f > 0 ? Math.round(69 + 12 * Math.log(f / 440) / Math.LN2) : -1;
            map[b] = m >= LOW && m <= HIGH ? m - LOW : -1;
        }
        for (var fr = 0; fr < frames; fr++) {
            var at = fr * HOP;
            spectrum(samples, at, N_ONSET, wo, ro, io);
            var flux = 0;
            for (var k = 1; k < N_ONSET / 2; k++) {
                cur[k] = Math.log(1 + 100 * Math.sqrt(ro[k] * ro[k] + io[k] * io[k]));
                var d = cur[k] - prev[k];
                if (d > 0 && fr > 0) flux += d;
            }
            onset[fr] = flux;
            var t = prev; prev = cur; cur = t;
            // The pitch window is centred on the same moment as the onset window.
            spectrum(samples, at + N_ONSET / 2 - N_PITCH / 2, N_PITCH, wp, rp, ip);
            var base = fr * BINS, norm = 0;
            for (var q = 1; q < N_PITCH / 2; q++) {
                if (map[q] < 0) continue;
                pitch[base + map[q]] += Math.sqrt(rp[q] * rp[q] + ip[q] * ip[q]);
            }
            for (var p = 0; p < BINS; p++) { var v = Math.log(1 + pitch[base + p]); pitch[base + p] = v; norm += v * v; }
            norm = Math.sqrt(norm) || 1;
            for (p = 0; p < BINS; p++) pitch[base + p] /= norm;
        }
        normaliseOnset(onset);
        return { t0: t0 || 0, frames: frames, onset: onset, pitch: pitch };
    }

    // Removes the slowly changing level (strumming noise, room) and scales peaks to about 1.
    function normaliseOnset(onset) {
        var n = onset.length, radius = 10, out = new Float32Array(n);
        for (var i = 0; i < n; i++) {
            var sum = 0, c = 0;
            for (var j = Math.max(0, i - radius); j <= Math.min(n - 1, i + radius); j++) { sum += onset[j]; c++; }
            out[i] = Math.max(0, onset[i] - sum / c);
        }
        var sorted = Array.prototype.slice.call(out).filter(function (v) { return v > 0; }).sort(function (a, b) { return a - b; });
        var top = sorted.length ? sorted[Math.floor(sorted.length * 0.98)] || sorted[sorted.length - 1] : 1;
        for (i = 0; i < n; i++) onset[i] = Math.min(1, out[i] / (top || 1));
    }

    // Expected spectrum of a chord: each note with a few harmonics.
    function template(midis) {
        var t = new Float32Array(BINS), norm = 0;
        [[0, 1], [12, 0.7], [19, 0.5], [24, 0.35], [28, 0.25]].forEach(function (h) {
            midis.forEach(function (m) {
                var k = m + h[0] - LOW;
                if (k >= 0 && k < BINS) t[k] += h[1];
            });
        });
        for (var i = 0; i < BINS; i++) norm += t[i] * t[i];
        norm = Math.sqrt(norm) || 1;
        for (i = 0; i < BINS; i++) t[i] /= norm;
        return t;
    }

    // ---- Alignment (pure) ----

    /**
     * Notes the tab plays in bars from..to (1-based) of one track, one event per beat that starts a sound.
     * durations: [{ ticks, ms }] per master bar. Returns [{ bar, tick, ms, midis }] with ms from the range start.
     */
    function events(score, trackIndex, from, to, durations) {
        var track = score.tracks[trackIndex || 0], staff = track && track.staves[0], out = [], offset = 0;
        if (!staff) return out;
        for (var n = from; n <= to; n++) {
            var bar = staff.bars[n - 1], d = durations[n - 1];
            if (!bar || !d) break;
            var beats = [];
            bar.voices.forEach(function (v) { v.beats.forEach(function (b) { beats.push(b); }); });
            beats.sort(function (a, b) { return a.playbackStart - b.playbackStart; });
            var seen = {};
            beats.forEach(function (beat) {
                var midis = beat.notes.filter(function (x) { return !x.isDead && !x.isTieDestination; })
                    .map(function (x) { return x.realValue; });
                if (!midis.length || seen[beat.playbackStart]) return;
                seen[beat.playbackStart] = 1;
                out.push({ bar: n, tick: beat.playbackStart, ms: offset + beat.playbackStart / (d.ticks || 1) * d.ms, midis: midis });
            });
            offset += d.ms;
        }
        return out;
    }

    function tabLength(from, to, durations) {
        var ms = 0;
        for (var n = from; n <= to; n++) ms += durations[n - 1] ? durations[n - 1].ms : 0;
        return ms;
    }

    /**
     * Matches the events of one part to the sound between t0 and t1 (seconds).
     * Every note gets one frame, in order; a note scores for an attack at its frame and for its pitches
     * sounding just after it, and a gap scores less the more it differs from the tab's rhythm.
     * Returns { anchors: [[bar, tick, seconds]], score, contrast, recall } or null: score is about 0..2 per note,
     * contrast is how much better the pitches match than the same notes anywhere in the part.
     */
    function align(evs, totalMs, feat, t0, t1) {
        if (!evs.length || !(t1 > t0)) return null;
        var shift = feat.t0 || 0;
        var fps = RATE / HOP;
        var f0 = Math.max(0, Math.floor((t0 - shift - LATENCY - 0.08) * fps));
        var f1 = Math.min(feat.frames - 1, Math.ceil((t1 - shift - LATENCY) * fps));
        var F = f1 - f0 + 1, E = evs.length;
        if (F < E) return null;
        var span = (t1 - t0) * fps, scale = span / (totalMs || 1); // frames per tab millisecond
        // Local score of note i at frame f.
        var local = new Float32Array(E * F), tone = new Float32Array(E * F), templates = evs.map(function (e) { return template(e.midis); });
        for (var f = 0; f < F; f++) {
            var abs = f0 + f, on = feat.onset[abs];
            var avg = new Float32Array(BINS), c = 0;
            for (var k = abs + 2; k <= Math.min(feat.frames - 1, abs + 8); k++, c++) {
                for (var b = 0; b < BINS; b++) avg[b] += feat.pitch[k * BINS + b];
            }
            var norm = 0;
            for (b = 0; b < BINS; b++) norm += avg[b] * avg[b];
            norm = Math.sqrt(norm) || 1;
            for (var i = 0; i < E; i++) {
                var dot = 0, tp = templates[i];
                for (b = 0; b < BINS; b++) dot += tp[b] * avg[b];
                tone[i * F + f] = dot / norm;
                local[i * F + f] = on + dot / norm;
            }
        }
        // How well the pitches match compared to the same notes anywhere in the part.
        var base = 0;
        for (var q = 0; q < tone.length; q++) base += tone[q];
        base /= tone.length;
        var NEG = -1e9, best = new Float32Array(E * F).fill(NEG), from = new Int32Array(E * F).fill(-1);
        var lambda = 0.2, drift = 0.8;
        var expected = function (i) { return (t0 - shift - LATENCY) * fps - f0 + evs[i].ms * scale; };
        for (f = 0; f < F; f++) best[f] = local[f] - drift * Math.abs(f - expected(0)) / Math.max(span, 1) * 4;
        for (i = 1; i < E; i++) {
            var gap = Math.max(1, (evs[i].ms - evs[i - 1].ms) * scale);
            var lo = Math.max(1, Math.floor(gap * 0.3)), hi = Math.max(lo + 1, Math.ceil(gap * 1.8));
            for (f = i; f < F; f++) {
                var top = NEG, arg = -1;
                for (var g = lo; g <= hi && f - g >= 0; g++) {
                    var p = best[(i - 1) * F + f - g];
                    if (p <= NEG) continue;
                    var s = p - lambda * Math.abs(Math.log(g / gap));
                    if (s > top) { top = s; arg = f - g; }
                }
                if (arg < 0) continue;
                best[i * F + f] = top + local[i * F + f] - drift * Math.abs(f - expected(i)) / Math.max(span, 1);
                from[i * F + f] = arg;
            }
        }
        var end = -1, endScore = NEG;
        for (f = 0; f < F; f++) if (best[(E - 1) * F + f] > endScore) { endScore = best[(E - 1) * F + f]; end = f; }
        if (end < 0) return null;
        var path = new Array(E);
        for (i = E - 1, f = end; i >= 0; i--) { path[i] = f; f = from[i * F + f]; }
        var hit = 0, pitchHit = 0;
        var anchors = evs.map(function (e, n) {
            hit += local[n * F + path[n]];
            pitchHit += tone[n * F + path[n]];
            return [e.bar, e.tick, Math.round(((f0 + path[n]) / fps + LATENCY + shift) * 1000) / 1000];
        });
        // Share of the clear attacks inside the part that some note explains: a range that covers only
        // part of what is played can match its own notes well and still leave most attacks unexplained.
        var lo0 = Math.max(0, Math.round((t0 - shift - LATENCY) * fps) - f0), hi0 = Math.min(F - 1, Math.round((t1 - shift - LATENCY) * fps) - f0);
        var taken = new Uint8Array(F), peaks = 0, heard = 0;
        path.forEach(function (p) { for (var d = -3; d <= 3; d++) if (p + d >= 0 && p + d < F) taken[p + d] = 1; });
        for (f = Math.max(1, lo0); f <= Math.min(F - 2, hi0); f++) {
            var o = feat.onset[f0 + f];
            if (o < 0.3 || o < feat.onset[f0 + f - 1] || o < feat.onset[f0 + f + 1]) continue;
            peaks++;
            if (taken[f]) heard++;
        }
        // Share of the notes that land on an attack: a tab with bars the take skips puts notes on nothing.
        var attacked = 0;
        path.forEach(function (p) {
            var top = 0;
            for (var d = -2; d <= 2; d++) if (p + d >= 0 && p + d < F) top = Math.max(top, feat.onset[f0 + p + d]);
            if (top >= 0.2) attacked++;
        });
        return { anchors: anchors, score: hit / E, contrast: pitchHit / E - base, recall: peaks ? heard / peaks : 1, precision: attacked / E };
    }

    /**
     * Syncs one part. With fixed bars only the timing is found; otherwise every bar range whose tab length
     * fits the part is tried and the best match wins (a tie keeps the bars the part already had).
     * part: { start, end, bars: [from, to] | null }. Returns { bars, anchors, score } or null.
     */
    function syncPart(score, trackIndex, durations, feat, part, fixed) {
        var len = Math.max(0.01, part.end - part.start) * 1000, ranges = [];
        if (fixed && part.bars) ranges.push(part.bars);
        else {
            for (var a = 1; a <= durations.length; a++) {
                for (var b = a; b <= durations.length; b++) {
                    var ratio = tabLength(a, b, durations) / len;
                    if (ratio > 1.7) break;
                    if (ratio >= 0.55) ranges.push([a, b]);
                }
            }
        }
        var best = null;
        ranges.forEach(function (r) {
            var evs = events(score, trackIndex, r[0], r[1], durations);
            var m = align(evs, tabLength(r[0], r[1], durations), feat, part.start, part.end);
            if (!m) return;
            var keep = part.bars && part.bars[0] === r[0] && part.bars[1] === r[1];
            var value = m.score + m.recall + (keep ? 0.03 : 0);
            if (!best || value > best.value) best = { bars: r, anchors: m.anchors, score: m.score, contrast: m.contrast, value: value };
        });
        if (best) delete best.value;
        return best;
    }

    /**
     * Syncs the whole tab to the whole take at once, for parts cut by phrase rather than by bar line.
     * The tab is matched once from the first part's start to the last part's end (its length may differ by ±25%),
     * then each part gets the bars it covers and the notes heard inside it, plus its start and end as places in the tab.
     * parts: [{ start, end }]. Returns { parts: [{ bars, anchors, notes } | null], score, contrast, recall } or null.
     */
    function syncWhole(score, trackIndex, durations, feat, parts) {
        if (!parts.length || !durations.length) return null;
        var evs = events(score, trackIndex, 1, durations.length, durations), total = tabLength(1, durations.length, durations);
        var t0 = Math.min.apply(null, parts.map(function (p) { return p.start; }));
        var t1 = Math.max.apply(null, parts.map(function (p) { return p.end; }));
        // The whole tab has to be about as long as the take; a short tab repeated in the video is synced part by part.
        var ratio = total / ((t1 - t0) * 1000 || 1);
        if (ratio < 0.6 || ratio > 1.6) return null;
        var best = null;
        for (var k = 0.75; k <= 1.25001; k += 0.05) {
            var m = align(evs, total, feat, t0, t0 + (t1 - t0) * k);
            if (m && (!best || m.score + m.recall > best.score + best.recall)) best = m;
        }
        if (!best) return null;
        var heard = best.anchors.map(function (a, i) { return { t: a[2], ms: evs[i].ms }; });
        best.parts = parts.map(function (p) {
            var inside = best.anchors.filter(function (a) { return a[2] >= p.start && a[2] < p.end; });
            if (!inside.length) return null;
            var first = placeAt(heard, durations, p.start), last = placeAt(heard, durations, p.end);
            // A part that ends right on a bar line does not show the next bar.
            if (last.tick === 0 && last.bar > first.bar) { last.bar--; last.tick = durations[last.bar - 1].ticks; }
            var anchors = [[first.bar, first.tick, p.start]].concat(inside, [[last.bar, last.tick, p.end]]);
            return { bars: [first.bar, last.bar], anchors: anchors, notes: inside.length };
        });
        return best;
    }

    // Place in the tab (1-based bar, tick) heard at video time t: between heard notes in proportion, and
    // before the first or after the last one at the pace of the nearest two.
    function placeAt(heard, durations, t) {
        var n = heard.length, i = 0, ms;
        if (n === 1) ms = heard[0].ms;
        else {
            while (i < n - 2 && heard[i + 1].t <= t) i++;
            var a = heard[i], b = heard[i + 1];
            ms = a.ms + (b.ms - a.ms) * (t - a.t) / ((b.t - a.t) || 1);
        }
        var total = tabLength(1, durations.length, durations);
        ms = Math.max(0, Math.min(total, ms));
        for (var bar = 1, acc = 0; bar <= durations.length; bar++) {
            var d = durations[bar - 1];
            if (ms < acc + d.ms || bar === durations.length) {
                return { bar: bar, tick: Math.round(Math.min(1, (ms - acc) / (d.ms || 1)) * d.ticks) };
            }
            acc += d.ms;
        }
    }

    // ---- Browser: the video's sound ----

    /** Mono samples at 22050 Hz from a media URL. */
    function decode(url) {
        return fetch(url).then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.arrayBuffer();
        }).then(function (buf) {
            var Ctx = global.OfflineAudioContext || global.webkitOfflineAudioContext;
            var ctx = new Ctx(1, 1, RATE);
            return new Promise(function (resolve, reject) { ctx.decodeAudioData(buf, resolve, reject); });
        }).then(function (audio) {
            if (audio.numberOfChannels === 1) return audio.getChannelData(0);
            var a = audio.getChannelData(0), b = audio.getChannelData(1), out = new Float32Array(a.length);
            for (var i = 0; i < a.length; i++) out[i] = (a[i] + b[i]) / 2;
            return out;
        });
    }

    global.TabSync = {
        RATE: RATE, features: features, events: events, align: align, syncPart: syncPart, syncWhole: syncWhole,
        decode: decode, tabLength: tabLength
    };
})(typeof window !== 'undefined' ? window : this);
