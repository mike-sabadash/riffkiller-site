#!/usr/bin/env node
/**
 * Agent tool: what the sound of a riff plays, to look into a poor tab sync.
 *   node tools/audio-notes.cjs audio.wav [from] [to]
 * Prints each heard note start with the best matching single notes, and the pitch classes of the whole clip.
 */
'use strict';
const { features, RATE } = require('../js/tab-sync.js').TabSync;
const { readWav } = require('./tab-sync-cli.cjs');

const LOW = 36, BINS = 61, NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const name = m => NAMES[m % 12] + (Math.floor(m / 12) - 1);

function template(m) {
    const t = new Float32Array(BINS);
    [[0, 1], [12, 0.7], [19, 0.5], [24, 0.35], [28, 0.25]].forEach(([d, w]) => { if (m + d - LOW < BINS) t[m + d - LOW] += w; });
    const n = Math.hypot(...t);
    return t.map(v => v / n);
}

const [file, from = '0', to = '1e9'] = process.argv.slice(2);
const samples = readWav(file);
const t0 = Number(from), t1 = Math.min(Number(to), samples.length / RATE);
const feat = features(samples.subarray(Math.floor(t0 * RATE), Math.ceil(t1 * RATE)), t0);
const tpl = [];
for (let m = 40; m <= 84; m++) tpl.push([m, template(m)]);
const chroma = new Float64Array(12);
const rows = [];
for (let f = 1; f < feat.frames - 1; f++) {
    const o = feat.onset[f];
    for (let b = 0; b < BINS; b++) chroma[(b + LOW) % 12] += feat.pitch[f * BINS + b] ** 2;
    if (o < 0.3 || o < feat.onset[f - 1] || o < feat.onset[f + 1]) continue;
    const avg = new Float32Array(BINS);
    for (let g = f + 2; g <= Math.min(feat.frames - 1, f + 8); g++) for (let b = 0; b < BINS; b++) avg[b] += feat.pitch[g * BINS + b];
    const best = tpl.map(([m, t]) => [m, t.reduce((s, v, b) => s + v * avg[b], 0)]).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const top = best[0][1] || 1;
    rows.push((t0 + f * 0.01).toFixed(2) + ' s  onset ' + o.toFixed(2) + '  ' + best.map(([m, s]) => name(m) + ' ' + (s / top).toFixed(2)).join('  '));
}
console.log('Pitch classes: ' + [...chroma].map((v, i) => [NAMES[i], v]).sort((a, b) => b[1] - a[1]).map(([n, v]) => n + ' ' + (v / Math.max(...chroma)).toFixed(2)).join(', '));
console.log(rows.join('\n'));
