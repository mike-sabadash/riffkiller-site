#!/usr/bin/env node
/**
 * Agent tool: syncs a riff's tab to the sound of its video, the same way the admin button does.
 *   node tools/tab-sync-cli.cjs --riffs riffs.json --id 1 --tex black-dog.tex --wav audio.wav --out patch.json
 * audio.wav: mono 16-bit PCM at 22050 Hz of the riff's video (ffmpeg -vn -ac 1 -ar 22050 -f wav).
 *   --atoms add (default): techniques from the tab are added next to the ones already on the parts.
 *   --atoms replace: on every synced part the techniques become exactly the tab's (a matching one keeps its tip).
 * Writes a patch for scripts/riff-tab-apply.php and prints a report (Markdown).
 */
'use strict';
const fs = require('node:fs');
const alphaTab = require('../js/vendor/alphatab/alphaTab.min.js');
const { summarize, formatBars } = require('../js/tab-live.js').TabLive;
const { features, syncPart, syncWhole, RATE } = require('../js/tab-sync.js').TabSync;
globalThis.TabLive = require('../js/tab-live.js').TabLive; // tab-atoms places a technique at the heard note through it
const TabAtoms = require('../js/tab-atoms.js').TabAtoms;
const Vocab = require('../js/riff-dna-vocab.js').RiffDNAVocab;

const SURE = 0.05; // same threshold as the admin (js/admin-tabs.js)
const ON_ATTACK = 0.8; // share of the tab's notes heard as attacks for the whole take to count as played in one go

function args(argv) {
    const out = {};
    for (let i = 2; i < argv.length; i += 2) out[argv[i].replace(/^--/, '')] = argv[i + 1];
    return out;
}

/** Samples of a mono 16-bit PCM WAV at 22050 Hz. */
function readWav(file) {
    const b = fs.readFileSync(file);
    if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE') throw new Error('not a WAV file');
    let at = 12, fmt = null;
    while (at + 8 <= b.length) {
        const id = b.toString('ascii', at, at + 4);
        let size = b.readUInt32LE(at + 4);
        if (id === 'fmt ') fmt = { channels: b.readUInt16LE(at + 10), rate: b.readUInt32LE(at + 12), bits: b.readUInt16LE(at + 22) };
        if (id === 'data') {
            if (!fmt || fmt.channels !== 1 || fmt.rate !== RATE || fmt.bits !== 16) throw new Error('need mono 16-bit ' + RATE + ' Hz, got ' + JSON.stringify(fmt));
            // ffmpeg writing to a pipe cannot seek back, so the size may be a placeholder.
            if (size === 0 || size === 0xffffffff || at + 8 + size > b.length) size = b.length - at - 8;
            const n = Math.floor(size / 2), out = new Float32Array(n);
            for (let i = 0; i < n; i++) out[i] = b.readInt16LE(at + 8 + i * 2) / 32768;
            return out;
        }
        at += 8 + size + (size & 1);
    }
    throw new Error('no audio data in WAV');
}

function main() {
    const a = args(process.argv);
    const list = JSON.parse(fs.readFileSync(a.riffs, 'utf8'));
    const riffs = Array.isArray(list) ? list : Object.values(list);
    const riff = riffs.find(r => Number(r.id) === Number(a.id));
    if (!riff) throw new Error('riff ' + a.id + ' not found');
    const tex = fs.readFileSync(a.tex, 'utf8').trim();
    const track = Number(a.track || 0);
    const score = alphaTab.importer.ScoreLoader.loadAlphaTex(tex);
    const bars = summarize(score);
    const samples = readWav(a.wav);
    const parts = riff.segments || [];
    const t0 = Math.max(0, Math.min(...parts.map(p => p.start)) - 1);
    const t1 = Math.max(...parts.map(p => p.end)) + 1;
    const feat = features(samples.subarray(Math.floor(t0 * RATE), Math.ceil(t1 * RATE)), t0);

    const segments = {}, rows = [];
    // First the whole take at once: parts are often cut by phrase, not by bar line.
    const whole = syncWhole(score, track, bars, feat, parts);
    const wholeSure = whole && whole.contrast >= SURE && whole.precision >= ON_ATTACK;
    if (wholeSure) {
        parts.forEach((p, i) => {
            const r = whole.parts[i];
            if (r) segments[i] = { tabBars: r.bars, tabSync: r.anchors };
            rows.push('| ' + (i + 1) + ' | ' + (p.role || 'drill') + ' | ' + p.start.toFixed(2) + '–' + p.end.toFixed(2) + ' | ' +
                (r ? formatBars(r.bars) : '—') + ' | ' + (r ? r.notes : 0) + ' | ' + (r ? 'yes' : 'no notes heard') + ' |');
        });
    } else parts.forEach((p, i) => {
        const r = syncPart(score, track, bars, feat, { start: p.start, end: p.end, bars: Array.isArray(p.tabBars) ? p.tabBars : null }, false);
        const sure = r && r.contrast >= SURE;
        if (sure) segments[i] = { tabBars: r.bars, tabSync: r.anchors };
        rows.push('| ' + (i + 1) + ' | ' + (p.role || 'drill') + ' | ' + p.start.toFixed(2) + '–' + p.end.toFixed(2) + ' | ' +
            (r ? formatBars(r.bars) : '—') + ' | ' + (r ? r.contrast.toFixed(2) : '—') + ' | ' + (sure ? 'yes' : 'left as is') + ' |');
    });
    // Techniques written in the tab go onto the parts with the tab, the same as «Приёмы из табов» in the admin.
    const placedParts = parts.map((p, i) => {
        const s = segments[i];
        return { start: p.start, end: p.end, bars: s ? s.tabBars : (Array.isArray(p.tabBars) ? p.tabBars : null), sync: s ? s.tabSync : p.tabSync };
    });
    const existing = riff.dna && Array.isArray(riff.dna.atoms) ? riff.dna.atoms : [];
    const placed = TabAtoms.place(TabAtoms.extract(score, track), bars, placedParts);
    const replace = a.atoms === 'replace';
    const atoms = (replace ? placed.atoms : TabAtoms.fresh(placed.atoms, existing)).map(a => {
        const t = Vocab.technique(a.technique);
        return Object.assign(a, { type: t ? t.label : a.technique, source: 'tab' });
    });
    const patch = {
        id: riff.id,
        tab: Object.assign({ tex }, track ? { track } : {}),
        // The server refuses the patch if the parts were changed since this was computed.
        expect: parts.map(p => [p.start, p.end]),
        segments,
        atoms,
        atomsMode: replace ? 'replace' : 'add'
    };
    // Which part an atom is on: the part playing at its time, else the part it was saved with.
    const partOf = at => {
        const t = Number(at.time);
        const i = parts.findIndex(p => t >= p.start && t < p.end);
        return i >= 0 ? i : (Number.isInteger(at.segmentIndex) ? at.segmentIndex : -1);
    };
    const same = (x, y) => x.technique === y.technique && Math.abs(Number(x.time) - Number(y.time)) < 0.25;
    const dropped = replace ? existing.filter(e => segments[partOf(e)] && !atoms.some(t => same(t, e))) : [];
    const atomLine = list => list.length ? list.map(x => x.technique + ' @' + Number(x.time).toFixed(2) + ' (part ' + (partOf(x) + 1) + (x.source ? ', ' + x.source : '') + ')').join(', ') : 'none';
    fs.writeFileSync(a.out, JSON.stringify(patch));
    // For the workflow's "write only if every part is synced" mode.
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, 'all_synced=' + (parts.length > 0 && Object.keys(segments).length === parts.length) + '\n');
    const sigs = [...new Set(bars.map(b => b.ts))].join(', ');
    console.log([
        '### ' + (riff.artist || '') + ' — ' + (riff.song || riff.title || ('riff ' + riff.id)),
        '',
        'Tab: ' + bars.length + ' bars (' + sigs + '), tempo ' + Math.round(score.tempo) + '. Audio: ' + (samples.length / RATE).toFixed(1) + ' s.',
        '',
        whole ? 'Whole take: pitch match ' + whole.contrast.toFixed(2) + ', notes on an attack ' + Math.round(whole.precision * 100) + '%, attacks explained ' + Math.round(whole.recall * 100) + '%' +
            (wholeSure ? '.' : ' (too low, each part on its own instead).') : 'Whole take: no match.',
        '',
        '| Part | Role | Video, s | Bars | ' + (wholeSure ? 'Notes' : 'Pitch match') + ' | Synced |',
        '|---|---|---|---|---|---|',
        ...rows,
        '',
        'Synced ' + Object.keys(segments).length + ' of ' + parts.length + ' parts (pitch match ≥ ' + SURE + ').',
        '',
        'Techniques on the parts now: ' + atomLine(existing) + '.',
        '',
        replace ? 'Techniques from the tab (replace the ones on synced parts): ' + atomLine(atoms) + '. Removed: ' + atomLine(dropped) + '.' :
        'Techniques from the tab: ' + atoms.length + ' new' + (placed.atoms.length - atoms.length ? ', ' + (placed.atoms.length - atoms.length) + ' already on the parts' : '') +
            (placed.unplaced ? ', ' + placed.unplaced + ' in bars no part plays' : '') + '.' +
            (atoms.length ? ' ' + atoms.map(a => a.technique + ' @' + a.time.toFixed(2) + ' (part ' + (a.segmentIndex + 1) + ')').join(', ') : '')
    ].join('\n'));
}

module.exports = { readWav };

if (require.main === module) {
    try { main(); } catch (e) { console.error('::error::' + e.message); process.exit(1); }
}
