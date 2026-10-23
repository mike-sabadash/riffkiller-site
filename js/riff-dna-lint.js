/**
 * Checks a riff's DNA markup before saving: the mistakes that are easy to miss in the editor.
 * Pure function, shared by the admin (confirm before save) and the tests.
 * Returns [{ text, segment? }]; segment is the 0-based part the warning points at.
 */
(function (global) {
    'use strict';
    const V = global.RiffDNAVocab || (typeof require === 'function' ? require('./riff-dna-vocab.js').RiffDNAVocab : null);
    const GAP = 0.5;

    // "Answer · Pass 2" → 'answer': the role a button caption names by its first word, as older lessons did.
    const NAME_WORDS = { statement: 'call', response: 'answer' };
    function nameRole(name) {
        const m = /^\s*(?:the\s+)?([a-z]+)\b/i.exec(name || '');
        if (!m) return '';
        const word = m[1].toLowerCase();
        return V.role(word) ? word : (NAME_WORDS[word] || '');
    }

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
                const said = nameRole(s.displayName || s.name);
                if (said && roleOf(s) && said !== s.role) {
                    out.push({ segment: i, text: n(i) + ': подпись кнопки «' + (s.displayName || s.name) + '» называет роль ' + V.role(said).label + ', а выбрана ' + roleOf(s).label + '. На сайте останется только ' + roleOf(s).label + ' — проверьте, какая роль верна.' });
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

    // How the author names techniques in a free description (Russian or English), by the start of the word.
    const WORDS = {
        bend: ['бенд', 'подтяж', 'bend'], qbend: ['четвертьтон', 'четверть тона', 'quarter'], release: ['release', 'отпуск'],
        vibrato: ['вибрато', 'vibrato'], slide: ['слайд', 'slide', 'скольж', 'глиссанд'],
        hammer: ['хаммер', 'хамер', 'hammer'], pull: ['пулл', 'пул-', 'пулоф', 'pull'], legato: ['легато', 'legato'], trill: ['трел', 'trill'],
        palm: ['palm', 'палм', 'глушение ладон', 'ладонью глуш', 'pm(?![a-zа-яё])'], rake: ['рейк', 'rake'], accent: ['акцент', 'accent'],
        ghost: ['призрачн', 'ghost'], double: ['дабл', 'двойн', 'double'], harmonic: ['флажолет', 'harmonic'],
        open: ['открыт', 'open string'], tremolo: ['тремоло', 'tremolo'], gap: ['пауз', 'тишин', 'pause'],
        anchor: ['опорн', 'home note', 'возвращается на', 'садится на'], prebend: ['пребенд', 'пре-бенд', 'pre-bend', 'prebend'],
        unison: ['унисон', 'unison'], grace: ['форшлаг', 'grace'], tap: ['тэппинг', 'теппинг', 'tapping'], sweep: ['свип', 'sweep'],
        alternate: ['переменн', 'alternate'], economy: ['экономн', 'economy'], hybrid: ['гибридн', 'hybrid'],
        skip: ['перескок', 'skipping'], pinch: ['искусственн', 'pinch'], mute: ['левой рукой глуш', 'глушение левой', 'fretting-hand mute'],
        dead: ['мертв', 'мёртв', 'dead note'], power: ['пауэр', 'power chord', 'квинт'], chord: ['аккорд', 'chord'],
        octave: ['октав', 'octave'], ring: ['let ring', 'дать звучать', 'не глуш'], staccato: ['стаккато', 'staccato'],
        whammy: ['рычаг', 'whammy']
    };
    // Close techniques count as one for the check: "легато" in the text covers a hammer-on in the tab.
    const FAMILY = { hammer: 'legato', pull: 'legato', trill: 'legato', qbend: 'bend', release: 'bend', prebend: 'bend', unison: 'bend',
        power: 'double', chord: 'double', octave: 'double', pinch: 'harmonic', dead: 'ghost', mute: 'ghost' };
    const family = key => FAMILY[key] || key;
    const PATTERNS = Object.keys(WORDS).map(key => [key, new RegExp('(^|[^a-zа-яё])(' + WORDS[key].join('|') + ')', 'i')]);

    /** Technique keys a free description mentions. */
    function mentions(text) {
        text = String(text || '');
        return PATTERNS.filter(([, re]) => re.test(text)).map(([key]) => key);
    }

    /**
     * The author's description against the techniques on the parts, by family.
     * Returns { both, textOnly, atomsOnly }: lists of technique keys (the family's own key).
     */
    function compareNotes(text, atoms) {
        const said = new Set(mentions(text).map(family));
        const set = new Set((atoms || []).map(a => a && a.technique).filter(k => k && k !== 'other' && V.technique(k)).map(family));
        // The home note and pauses are about the phrase; the tab does not mark them, so a description may name them freely.
        ['anchor', 'gap', 'open'].forEach(k => { if (!set.has(k)) said.delete(k); });
        return {
            both: [...said].filter(k => set.has(k)),
            textOnly: [...said].filter(k => !set.has(k)),
            atomsOnly: [...set].filter(k => !said.has(k))
        };
    }

    const api = { check, mentions, compareNotes };
    global.RiffDNALint = api;
    if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
