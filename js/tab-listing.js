/**
 * A tab read back as plain text, bar by bar, in the alphaTex terms it was written in: what the AI tab reader
 * compares with the screenshot on its second pass, and the bars whose notes do not fill the time signature.
 *   TabListing.describe(score, track) → { text, problems: [string], bars }
 * Works in the browser (window.TabListing) and in Node (require) with an alphaTab score.
 */
(function (root, factory) {
    var api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.TabListing = api;
})(typeof window !== 'undefined' ? window : this, function () {
    'use strict';

    var LENGTH = { 1: 'whole', 2: 'half', 4: 'quarter', 8: 'eighth', 16: '16th', 32: '32nd', 64: '64th' };

    function noteText(note, strings) {
        var s = strings - note.string + 1; // alphaTab counts strings from the lowest, alphaTex from the highest
        var marks = [];
        if (note.isDead) return 'x.' + s;
        if (note.hasBend) marks.push('bend');
        if (note.isHammerPullOrigin) marks.push('hammer/pull');
        if (note.slideOutType) marks.push('slide');
        if (note.vibrato) marks.push('vibrato');
        if (note.isPalmMute) marks.push('P.M.');
        if (note.isGhost) marks.push('ghost');
        if (note.accentuated) marks.push('accent');
        if (note.isTrill) marks.push('trill');
        if (note.harmonicType && note.harmonicType !== 0) marks.push('harmonic');
        if (note.isTieDestination) marks.push('tied');
        return note.fret + '.' + s + (marks.length ? ' (' + marks.join(', ') + ')' : '');
    }

    function beatText(beat, strings) {
        var len = LENGTH[beat.duration] || ('1/' + beat.duration);
        if (beat.dots) len = (beat.dots > 1 ? 'double-' : '') + 'dotted ' + len;
        if (beat.tupletNumerator > 0 && beat.tupletDenominator > 0 && beat.tupletNumerator !== beat.tupletDenominator) {
            len += ' (' + beat.tupletNumerator + ':' + beat.tupletDenominator + ' tuplet)';
        }
        if (beat.isRest || !beat.notes.length) return 'rest ' + len;
        if (beat.isTremolo) len += ' tremolo';
        var notes = beat.notes.slice().sort(function (a, b) { return b.string - a.string; }).map(function (n) { return noteText(n, strings); });
        return (notes.length > 1 ? 'chord [' + notes.join(' + ') + ']' : notes[0]) + ' ' + len;
    }

    function describe(score, trackIndex) {
        var track = score.tracks[trackIndex || 0];
        var staff = track && track.staves[0];
        if (!staff) return { text: '', problems: ['The tab has no guitar track.'], bars: 0 };
        var strings = staff.tuning.length || 6, lines = [], problems = [];
        lines.push('Tempo ' + Math.round(score.tempo) + ', ' + staff.bars.length + ' bars, ' + strings + ' strings (string 1 = highest).');
        staff.bars.forEach(function (bar, i) {
            var mb = score.masterBars[i];
            var ts = mb.timeSignatureNumerator + '/' + mb.timeSignatureDenominator;
            var beats = [], filled = 0;
            bar.voices.forEach(function (v, vi) {
                if (vi > 0 && v.isEmpty) return;
                v.beats.forEach(function (b) {
                    if (vi === 0) filled += b.playbackDuration;
                    beats.push(beatText(b, strings));
                });
            });
            lines.push('Bar ' + (i + 1) + ' (' + ts + '): ' + beats.join(', '));
            var want = mb.calculateDuration();
            if (Math.abs(filled - want) > 1) {
                problems.push('Bar ' + (i + 1) + ' (' + ts + ') holds ' + (filled / 480).toFixed(2) + ' eighths of ' + (want / 480).toFixed(2) + '.');
            }
        });
        return { text: lines.join('\n'), problems: problems, bars: staff.bars.length };
    }

    return { describe: describe };
});
