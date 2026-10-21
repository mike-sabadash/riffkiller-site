/**
 * Checks a riff's DNA markup before saving: the mistakes that are easy to miss in the editor.
 * Pure function, shared by the admin (confirm before save) and the tests.
 * Returns [{ text, segment? }]; segment is the 0-based part the warning points at.
 */
(function (global) {
    'use strict';
    const V = global.RiffDNAVocab || (typeof require === 'function' ? require('./riff-dna-vocab.js').RiffDNAVocab : null);
    const GAP = 0.5;

    function check(riff) {
        const segments = (riff.segments || []).map(s => Object.assign({}, s, { start: Number(s.start), end: Number(s.end) }));
        const dna = riff.dna || {};
        const atoms = dna.atoms || [];
        const out = [];
        const n = i => 'Часть ' + (i + 1);
        const roleOf = s => V.role(s.role);
        const withRole = segments.map((s, i) => roleOf(s) ? i : -1).filter(i => i >= 0);

        segments.forEach((s, i) => {
            const next = segments[i + 1];
            if (next && next.start - s.end > GAP) {
                out.push({ segment: i, text: 'Между частями ' + (i + 1) + ' и ' + (i + 2) + ' пропуск ' + (next.start - s.end).toFixed(1) + ' с: этот кусок видео не попадёт ни в одну часть.' });
            }
        });

        if (!withRole.length) {
            if (dna.rule || dna.overview || atoms.length) out.push({ text: 'Ни у одной части нет роли: на сайте не соберётся фраза риффа.' });
        } else {
            const first = withRole[0], last = withRole[withRole.length - 1];
            segments.forEach((s, i) => {
                if (!roleOf(s) && i > first && i < last && !(s.function || '').trim()) {
                    out.push({ segment: i, text: n(i) + ' без роли посреди фразы: это упражнение или роль забыта? Если упражнение, напишите в описании, что в ней отрабатывается.' });
                }
                if (roleOf(s) && !(s.function || '').trim()) out.push({ segment: i, text: n(i) + ' (' + roleOf(s).label + ') без описания: ученик не увидит, что делает эта часть.' });
            });
            if (!withRole.some(i => roleOf(segments[i]).group === 'home')) {
                out.push({ text: 'Фраза не приходит домой: нет ни Land, ни Reset. Где рифф возвращается?' });
            }
            const roles = new Set(withRole.map(i => segments[i].role));
            if (withRole.length >= 3 && roles.size === 1) {
                out.push({ text: 'У всех частей одна роль (' + roleOf(segments[first]).label + '): фраза не читается как предложение.' });
            }
        }

        atoms.forEach((a, k) => {
            const name = 'Приём ' + (k + 1) + (V.technique(a.technique) ? ' (' + V.technique(a.technique).label + ')' : '');
            const t = Number(a.time);
            if (a.time == null || a.time === '' || !Number.isFinite(t)) {
                out.push({ segment: a.segmentIndex, text: name + ' без времени: на сайте он не подсветится в нужный момент.' });
            } else if (!segments.some(s => t >= s.start && t < s.end)) {
                out.push({ text: name + ' на ' + t.toFixed(2) + ' с не попадает ни в одну часть.' });
            }
        });

        if (withRole.length) {
            const rule = (dna.rule || '').trim();
            if (!rule) out.push({ text: 'Нет правила риффа (DNA Rule): ученику не на что опереться.' });
            else if (rule.length > 90) out.push({ text: 'Правило риффа длиннее 90 знаков (' + rule.length + '): обычно это пересказ, а не правило.' });
            if (!((dna.mutation || {}).steps || []).length) out.push({ text: 'Нет шагов упражнения: в методологии у каждого разбора должно быть действие для рук.' });
        }
        return out;
    }

    const api = { check };
    global.RiffDNALint = api;
    if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
