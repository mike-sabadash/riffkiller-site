/**
 * Riff difficulty: one scale for the site, the admin editor and the agents (decided with Mike on 05.11.2026).
 * Six criteria, 0–3 points each; the sum (0–18) gives one of five levels. The scores are kept with the riff
 * (`difficultyScore`), so a level can always be explained and recalculated. Rubric: docs/RIFF_DIFFICULTY.md.
 */
(function (global) {
    'use strict';
    // Five levels; the order is the sort order. Rough guitar-exam equivalents (Rockschool / RSL grades) in `grade`.
    var LEVELS = [
        { key: 'beginner', label: 'Beginner', min: 0, grade: 'Debut–1' },
        { key: 'beginner-plus', label: 'Beginner+', min: 4, grade: '2–3' },
        { key: 'intermediate', label: 'Intermediate', min: 6, grade: '4–5' },
        { key: 'intermediate-plus', label: 'Intermediate+', min: 8, grade: '6' },
        { key: 'advanced', label: 'Advanced', min: 10, grade: '7–8' }
    ];
    var CRITERIA = [
        { key: 'tempo', label: 'Tempo', hint: 'Notes per second at full speed: under 2.5 → 0, 2.5–4 → 1, 4–5.5 → 2, over 5.5 → 3.' },
        { key: 'leftHand', label: 'Fretting hand', hint: 'Bends (to an exact pitch), legato, slides, vibrato, stretches.' },
        { key: 'rightHand', label: 'Picking hand', hint: 'Muting, string skipping, alternate picking, muted strums.' },
        { key: 'rhythm', label: 'Rhythm', hint: 'Syncopation, triplets, odd meters like 5/8, a phrase that shifts against the beat.' },
        { key: 'fretboard', label: 'Fretboard', hint: 'Position shifts, chord shapes, octaves.' },
        { key: 'stamina', label: 'Stamina', hint: 'Long fast stretches without a break, e.g. down-picked eighths.' }
    ];
    var DEFAULT = 'intermediate';

    function level(key) {
        for (var i = 0; i < LEVELS.length; i++) if (LEVELS[i].key === key) return LEVELS[i];
        return null;
    }
    /** Sum of the six scores (each clamped to 0–3); null when no score is set. */
    function total(score) {
        if (!score || typeof score !== 'object') return null;
        var sum = 0, any = false;
        CRITERIA.forEach(function (c) {
            var v = Number(score[c.key]);
            if (isFinite(v)) { any = true; sum += Math.max(0, Math.min(3, Math.round(v))); }
        });
        return any ? sum : null;
    }
    function levelForTotal(sum) {
        var found = LEVELS[0];
        LEVELS.forEach(function (l) { if (sum >= l.min) found = l; });
        return found.key;
    }
    /** The level to show: from the scores when the riff has them, otherwise the stored level. */
    function keyOf(riff) {
        var sum = riff ? total(riff.difficultyScore) : null;
        if (sum !== null) return levelForTotal(sum);
        return riff && level(riff.difficulty) ? riff.difficulty : DEFAULT;
    }
    function order(key) {
        for (var i = 0; i < LEVELS.length; i++) if (LEVELS[i].key === key) return i;
        return 2;
    }

    var api = { LEVELS: LEVELS, CRITERIA: CRITERIA, DEFAULT: DEFAULT, level: level, total: total, levelForTotal: levelForTotal, keyOf: keyOf, order: order };
    global.RiffDifficulty = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
