/**
 * Riff DNA atoms from the riff's tab: bends, hammer-ons, pull-offs, slides, vibrato, palm mute and the rest
 * are read from the notes, then placed at the moment of the video where the part that plays the bar sounds.
 * Only suggestions: the admin adds them to the atom list and the author edits or deletes them before saving.
 */
(function (global) {
    'use strict';

    var NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    // Techniques that runs of notes share are one atom per run, not one per note.
    var RUNS = { palm: 1, tremolo: 1, ghost: 1, accent: 1, double: 1, vibrato: 1 };
    var RIGHT_HAND = { palm: 1, tremolo: 1, accent: 1, ghost: 1 };
    var STEP_WORDS = { 1: 'на четверть тона', 2: 'на полтона', 3: 'на три четверти тона', 4: 'на тон', 6: 'на полтора тона', 8: 'на два тона' };

    /** Names of the strings, 1 = lowest. The highest string gets a small letter when it repeats the lowest (E … e). */
    function stringNames(tunings) {
        var low = tunings.slice().reverse().map(function (m) { return NAMES[((m % 12) + 12) % 12]; });
        return low.map(function (n, i) { return i > 0 && low.indexOf(n) < i ? n.toLowerCase() : n; });
    }

    function frets(list) { return list.join('–') + ' лад'; }
    function strings(list) {
        var seen = [];
        list.forEach(function (s) { if (s && seen.indexOf(s) < 0) seen.push(s); });
        return (seen.length > 1 ? 'струны ' : 'струна ') + seen.join(', ');
    }

    function bendWords(points) {
        var max = 0;
        points.forEach(function (p) { if (p.value > max) max = p.value; });
        return STEP_WORDS[max] || '';
    }

    /**
     * Every technique in one track of a loaded alphaTab score, in playing order.
     * Returns [{ bar, tick, technique, label }] with bar as a 0-based master bar index and tick inside the bar.
     */
    function extract(score, trackIndex) {
        var track = score && score.tracks && score.tracks[trackIndex || 0];
        var staff = track && track.staves[0];
        if (!staff) return [];
        var names = stringNames(staff.stringTuning ? staff.stringTuning.tunings : staff.tuning || []);
        var str = function (n) { return names[n.string - 1] || ''; };
        var out = [], open = {};

        function add(bar, tick, technique, label, run) {
            if (run && open[technique]) { open[technique].count++; return; }
            var ev = { bar: bar, tick: tick, technique: technique, label: label };
            out.push(ev);
            if (run) { ev.count = 1; open[technique] = ev; }
        }

        staff.bars.forEach(function (bar, bi) {
            var beats = [];
            bar.voices.forEach(function (v) { v.beats.forEach(function (b) { if (b.notes.length) beats.push(b); }); });
            beats.sort(function (a, b) { return a.playbackStart - b.playbackStart; });
            beats.forEach(function (beat) {
                var notes = beat.notes.filter(function (n) { return !n.isDead; }), seen = {};
                var mark = function (technique, label) { seen[technique] = 1; add(bi, beat.playbackStart, technique, label, RUNS[technique]); };
                if (notes.length === 2) mark('double', 'лады ' + notes[0].fret + ' и ' + notes[1].fret + ', ' + strings([str(notes[0]), str(notes[1])]));
                notes.forEach(function (n) {
                    var where = frets([n.fret]) + ', ' + strings([str(n)]);
                    if (n.bendPoints && n.bendPoints.length > 1) {
                        var pts = n.bendPoints, first = pts[0].value, last = pts[pts.length - 1].value;
                        var words = bendWords(pts);
                        var key = first > 0 && last < first ? 'release' : (words === STEP_WORDS[1] ? 'qbend' : 'bend');
                        mark(key, where + (words && key !== 'qbend' ? ', ' + words : ''));
                    }
                    // A hammer-on/pull-off chain is read from its first note.
                    if (n.isHammerPullOrigin && !n.isHammerPullDestination && n.hammerPullDestination) {
                        var chain = [n];
                        while (chain[chain.length - 1].hammerPullDestination && chain.length < 32) chain.push(chain[chain.length - 1].hammerPullDestination);
                        var label = frets(chain.map(function (c) { return c.fret; })) + ', ' + strings(chain.map(str));
                        mark(chain.length > 2 ? 'legato' : (chain[1].fret > n.fret ? 'hammer' : 'pull'), label);
                    }
                    if (n.slideOutType || n.slideInType) {
                        var to = n.slideTarget ? [n.fret, n.slideTarget.fret] : [n.fret];
                        mark('slide', frets(to) + ', ' + strings([str(n)]));
                    }
                    if (n.vibrato || beat.vibrato) mark('vibrato', where);
                    if (n.isPalmMute) mark('palm', strings([str(n)]));
                    if (n.harmonicType) mark('harmonic', where);
                    if (n.trillValue >= 0) mark('trill', frets([n.fret, n.trillFret != null ? n.trillFret : n.trillValue]) + ', ' + strings([str(n)]));
                    if (n.isGhost) mark('ghost', where);
                    if (n.accentuated) mark('accent', where);
                });
                if (beat.tremoloSpeed) mark('tremolo', notes.length ? frets([notes[0].fret]) + ', ' + strings([str(notes[0])]) : '');
                // A run ends on the first played beat without that technique.
                Object.keys(open).forEach(function (t) { if (!seen[t]) delete open[t]; });
            });
        });
        out.forEach(function (ev) {
            if (ev.count > 1) ev.label = (ev.label ? ev.label + ', ' : '') + ev.count + ' ' + notesWord(ev.count);
            delete ev.count;
        });
        return out;
    }

    function notesWord(n) {
        var m10 = n % 10, m100 = n % 100;
        return m10 === 1 && m100 !== 11 ? 'нота' : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? 'ноты' : 'нот';
    }

    /**
     * Places techniques in the video. A bar can be played by several parts (repeated roles share bars);
     * the technique goes to the first of them. Time inside the part is the bar's place in the part's bars,
     * stretched over the part the same way the practice cursor moves.
     * events: from extract(); bars: [{ ms, ticks }]; parts: [{ start, end, bars: [from, to] }] (1-based).
     * Returns { atoms: [{ technique, label, time, segmentIndex, view, speed }], unplaced: n }.
     */
    function place(events, bars, parts) {
        var atoms = [], unplaced = 0;
        events.forEach(function (ev) {
            var bar = ev.bar + 1, index = -1;
            for (var i = 0; i < parts.length; i++) {
                var r = parts[i].bars;
                if (r && bar >= r[0] && bar <= r[1]) { index = i; break; }
            }
            if (index < 0 || !bars[ev.bar]) { unplaced++; return; }
            var part = parts[index], r2 = part.bars, total = 0, before = 0;
            for (var k = r2[0] - 1; k < r2[1] && k < bars.length; k++) {
                if (k < ev.bar) before += bars[k].ms;
                total += bars[k].ms;
            }
            var b = bars[ev.bar];
            before += b.ticks ? Math.min(1, ev.tick / b.ticks) * b.ms : 0;
            var time = part.start + (total ? before / total : 0) * Math.max(0, part.end - part.start);
            atoms.push({
                technique: ev.technique, label: ev.label, time: Math.round(time * 100) / 100, segmentIndex: index,
                view: RIGHT_HAND[ev.technique] ? 'right' : 'left', speed: 0.5
            });
        });
        return { atoms: atoms, unplaced: unplaced };
    }

    /** Drops suggestions that repeat an atom already in the list (same technique within a quarter second). */
    function fresh(suggested, existing) {
        return suggested.filter(function (a) {
            return !existing.some(function (e) { return e.technique === a.technique && Math.abs(e.time - a.time) < 0.25; });
        });
    }

    global.TabAtoms = { extract: extract, place: place, fresh: fresh, stringNames: stringNames };
})(typeof window !== 'undefined' ? window : this);
