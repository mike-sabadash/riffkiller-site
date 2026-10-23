/* Riff DNA authoring: segment roles live in the segment rows, techniques (Atoms) and the rule live here. */
(function (root) {
    'use strict';
    const V = root.RiffDNAVocab;
    const fieldIds = {
        overview: 'dnaOverviewInput', rule: 'dnaRuleInput', law: 'dnaLawInput', failure: 'dnaFailureInput'
    };
    const listIds = { preserve: 'dnaPreserveInput', change: 'dnaChangeInput' };
    const rows = () => Array.from(document.querySelectorAll('#segmentRows .segment-row'));
    const value = id => document.getElementById(id).value.trim();
    const splitLines = text => text.split('\n').map(s => s.trim()).filter(Boolean);
    const video = () => document.getElementById('segmentEditorVideo');
    // Russian names and explanations come from the site's own translation (js/i18n/ru.js), so both say the same.
    const ru = text => (root.RK_RU && root.RK_RU[text]) || '';
    const techName = t => t.label + (ru(t.label) && ru(t.label) !== t.label ? ' — ' + ru(t.label) : '');
    const techOption = t => (t.short ? t.short + '  ·  ' : '') + techName(t);

    function input(label, key, data, options) {
        const wrap = document.createElement('label');
        wrap.textContent = label;
        const el = document.createElement(options ? 'select' : 'input');
        el.dataset.field = key;
        if (options) options.forEach(([v, text]) => {
            const opt = document.createElement('option'); opt.value = v; opt.textContent = text; el.appendChild(opt);
        });
        el.value = data == null ? '' : String(data);
        wrap.appendChild(el);
        return wrap;
    }

    function segmentOptions() {
        return [['missing', 'Выберите сегмент'], ...rows().map((row, i) => {
            const role = V.role(row.querySelector('.role') && row.querySelector('.role').value);
            return [row.dataset.editorId, (i + 1) + '. ' + row.querySelector('.name').value + (role ? ' — ' + role.label : '')];
        })];
    }

    function segmentForTime(time) {
        return rows().find(row => time >= Number(row.querySelector('.start').value) && time < Number(row.querySelector('.end').value));
    }

    function addAtom(atom = {}) {
        const card = document.createElement('div');
        card.className = 'dna-admin-grid dna-atom-row';
        card._original = atom;
        const segmentRows = rows();
        let index = Number.isInteger(atom.segmentIndex) ? atom.segmentIndex : 0;
        if (Number.isFinite(atom.time)) {
            const found = segmentRows.findIndex(row => atom.time >= Number(row.querySelector('.start').value) && atom.time < Number(row.querySelector('.end').value));
            if (found >= 0) index = found;
        }
        const known = V.technique(atom.technique) ? atom.technique : 'other';
        card.appendChild(input('Приём (Atom)', 'technique', known, V.techniques.map(t => [t.key, t.key === 'other' ? t.label : techOption(t)])));
        // For "Other" and for older entries the label of the technique itself is kept here.
        card.appendChild(input('Название, если «Other»', 'type', known === 'other' ? (atom.type || '') : ''));
        card.appendChild(input('Где: лад, струна, ноты', 'label', atom.label || ''));
        card.appendChild(input('Что делать (подсказка ученику)', 'tip', atom.tip || ''));

        const timeWrap = input('Время в видео, сек', 'time', Number.isFinite(atom.time) ? atom.time : '');
        const timeEl = timeWrap.querySelector('input');
        timeEl.type = 'number'; timeEl.step = '0.01'; timeEl.min = '0';
        const now = document.createElement('button');
        now.type = 'button'; now.className = 'btn btn-secondary btn-small dna-atom-now'; now.textContent = 'Взять время из видео';
        timeWrap.appendChild(now);
        card.appendChild(timeWrap);

        const selected = segmentRows[index];
        const segmentField = input('Сегмент', 'segment', selected ? selected.dataset.editorId : 'missing', segmentOptions());
        card.appendChild(segmentField);
        card.appendChild(input('Ракурс', 'view', atom.view || 'split', [['left','Left hand'],['right','Right hand'],['split','Split']]));
        card.appendChild(input('Скорость', 'speed', atom.speed || 0.5, [[0.25,'×0.25'],[0.5,'×0.5'],[0.75,'×0.75'],[1,'×1']]));

        const syncSegment = () => {
            const t = parseFloat(timeEl.value);
            const row = Number.isFinite(t) ? segmentForTime(t) : null;
            if (row) segmentField.querySelector('select').value = row.dataset.editorId;
            if (typeof root.segmentEditorRenderStrip === 'function') root.segmentEditorRenderStrip();
        };
        timeEl.addEventListener('change', syncSegment);
        now.onclick = () => {
            const v = video();
            if (!v) return;
            timeEl.value = Math.round((v.currentTime || 0) * 100) / 100;
            syncSegment();
        };
        const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'btn btn-secondary btn-small';
        remove.textContent = 'Удалить приём';
        remove.onclick = () => { card.remove(); if (typeof root.segmentEditorRenderStrip === 'function') root.segmentEditorRenderStrip(); };
        card.appendChild(remove);
        document.getElementById('dnaAtomsEditor').appendChild(card);
    }

    function refreshSegments() {
        document.querySelectorAll('#dnaAtomsEditor [data-field="segment"]').forEach(select => {
            const selected = select.value;
            select.replaceChildren();
            segmentOptions().forEach(([v, text]) => {
                const option = document.createElement('option'); option.value = v; option.textContent = text; select.appendChild(option);
            });
            select.value = Array.from(select.options).some(o => o.value === selected) ? selected : 'missing';
        });
    }

    // Atom times for the segment strip in the video editor.
    function atomTimes() {
        return Array.from(document.querySelectorAll('#dnaAtomsEditor > div')).map(card => {
            const t = parseFloat(card.querySelector('[data-field="time"]').value);
            const tech = V.technique(card.querySelector('[data-field="technique"]').value);
            return Number.isFinite(t) ? { time: t, label: tech ? tech.label : '' } : null;
        }).filter(Boolean);
    }

    // A technique between two shots (after a boundary was moved) belongs to the closest one.
    function nearestSegment(segmentRows, time) {
        let best = -1, bestGap = Infinity;
        segmentRows.forEach((row, i) => {
            const start = Number(row.querySelector('.start').value), end = Number(row.querySelector('.end').value);
            const gap = time < start ? start - time : (time >= end ? time - end : 0);
            if (gap < bestGap) { bestGap = gap; best = i; }
        });
        return best;
    }

    function load(riff) {
        const dna = riff.dna || {};
        Object.entries(fieldIds).forEach(([key, id]) => {
            let v = dna[key] || '';
            // Older lessons kept the one-line idea in "formula".
            if (key === 'rule' && !v && dna.formula) v = dna.formula;
            document.getElementById(id).value = v;
        });
        Object.entries(listIds).forEach(([key, id]) => {
            document.getElementById(id).value = (Array.isArray(dna[key]) ? dna[key] : []).join('\n');
        });
        const mutation = dna.mutation || {};
        document.getElementById('dnaMutationTitleInput').value = mutation.title || '';
        document.getElementById('dnaMutationDescriptionInput').value = mutation.description || '';
        document.getElementById('dnaMutationStepsInput').value = (mutation.steps || []).join('\n');
        document.getElementById('dnaAtomsEditor').replaceChildren();
        (dna.atoms || []).forEach(addAtom);
    }

    function read(original = {}) {
        const dna = Object.assign({}, original || {});
        Object.entries(fieldIds).forEach(([key, id]) => { dna[key] = value(id); });
        Object.entries(listIds).forEach(([key, id]) => { dna[key] = splitLines(value(id)); });
        // The rule replaces the old formula/structure fields; drop them so the site has one source.
        delete dna.formula; delete dna.structure; delete dna.insight;
        dna.mutation = Object.assign({}, dna.mutation || {}, {
            title: value('dnaMutationTitleInput'), description: value('dnaMutationDescriptionInput'),
            steps: splitLines(value('dnaMutationStepsInput'))
        });
        const segmentRows = rows();
        dna.atoms = Array.from(document.querySelectorAll('#dnaAtomsEditor > div')).map((card, index) => {
            const get = key => card.querySelector('[data-field="' + key + '"]').value.trim();
            const time = parseFloat(get('time'));
            let segmentIndex = segmentRows.findIndex(row => row.dataset.editorId === get('segment'));
            if (Number.isFinite(time)) {
                segmentIndex = nearestSegment(segmentRows, time);
            }
            if (segmentIndex < 0) throw new Error('Приём ' + (index + 1) + ': укажите время или выберите сегмент.');
            const technique = get('technique');
            const atom = Object.assign({}, card._original, {
                technique, label: get('label'), tip: get('tip'), view: get('view'), speed: Number(get('speed')), segmentIndex
            });
            atom.type = technique === 'other' ? get('type') : V.technique(technique).label;
            if (Number.isFinite(time)) atom.time = time; else delete atom.time;
            return atom;
        });
        return dna;
    }

    // Techniques of each part, right in its row: pick one and it is added to the list below for that part
    // (without a time; a time can be set there later). The list below stays the one place they are kept.
    function cardsOf(row) {
        const start = Number(row.querySelector('.start').value), end = Number(row.querySelector('.end').value);
        return Array.from(document.querySelectorAll('#dnaAtomsEditor > div')).filter(card => {
            const t = parseFloat(card.querySelector('[data-field="time"]').value);
            if (Number.isFinite(t)) return t >= start && t < end;
            return card.querySelector('[data-field="segment"]').value === row.dataset.editorId;
        });
    }
    let drawing = 0;
    function drawRowAtoms() {
        cancelAnimationFrame(drawing);
        drawing = requestAnimationFrame(() => rows().forEach((row, index) => {
            const body = row.querySelector('.seg-body');
            if (!body) return;
            let box = body.querySelector('.seg-atoms');
            if (!box) {
                box = document.createElement('div');
                box.className = 'ed-field seg-atoms';
                const help = body.querySelector('.seg-role-help');
                body.insertBefore(box, help ? help.nextSibling : body.firstChild);
            }
            box.replaceChildren();
            const used = [];
            const title = document.createElement('span'); title.textContent = 'Приёмы в этой части';
            const chips = document.createElement('div'); chips.className = 'seg-atom-chips';
            cardsOf(row).forEach(card => {
                const tech = V.technique(card.querySelector('[data-field="technique"]').value);
                const chip = document.createElement('span'); chip.className = 'seg-atom-chip';
                const isKnown = tech && tech.key !== 'other';
                if (isKnown && tech.short) {
                    const abbr = document.createElement('span'); abbr.className = 'seg-atom-short'; abbr.textContent = tech.short;
                    chip.appendChild(abbr);
                }
                chip.appendChild(document.createTextNode(isKnown ? tech.label : (card.querySelector('[data-field="type"]').value || 'Other')));
                if (isKnown) {
                    chip.title = ru(tech.hint) || tech.hint;
                    if (!used.includes(tech)) used.push(tech);
                }
                const x = document.createElement('button'); x.type = 'button'; x.textContent = '×'; x.title = 'Убрать приём';
                x.onclick = () => { card.remove(); if (typeof root.segmentEditorRenderStrip === 'function') root.segmentEditorRenderStrip(); };
                chip.appendChild(x); chips.appendChild(chip);
            });
            const pick = document.createElement('select'); pick.className = 'seg-atom-add'; pick.setAttribute('aria-label', 'Добавить приём в эту часть');
            [['', '+ Добавить приём'], ...V.techniques.filter(t => t.key !== 'other').map(t => [t.key, techOption(t)])].forEach(([v, text]) => {
                const o = document.createElement('option'); o.value = v; o.textContent = text; pick.appendChild(o);
            });
            pick.onchange = () => { if (pick.value) addAtom({ technique: pick.value, segmentIndex: index }); };
            chips.appendChild(pick);
            box.append(title, chips);
            // What each chosen technique means, in the same words the student sees on the site.
            if (used.length) {
                const help = document.createElement('div'); help.className = 'seg-atom-help';
                used.forEach(t => {
                    const line = document.createElement('p');
                    const b = document.createElement('b'); b.textContent = techName(t);
                    line.append(b, ' — ' + (ru(t.hint) || t.hint));
                    help.appendChild(line);
                });
                box.appendChild(help);
            }
        }));
    }

    // Reference for every technique: shorthand on the part buttons, name, how it is played.
    function drawLegend() {
        const list = document.getElementById('atomLegendList');
        if (!list) return;
        list.replaceChildren(...V.techniques.filter(t => t.key !== 'other').map(t => {
            const row = document.createElement('div'); row.className = 'atom-legend-row';
            const abbr = document.createElement('span'); abbr.className = 'seg-atom-short'; abbr.textContent = t.short || '';
            const text = document.createElement('div');
            const b = document.createElement('b'); b.textContent = techName(t);
            const p = document.createElement('p'); p.textContent = ru(t.hint) || t.hint;
            text.append(b, p); row.append(abbr, text);
            return row;
        }));
    }

    document.addEventListener('DOMContentLoaded', () => {
        drawLegend();
        const atomsBox = document.getElementById('dnaAtomsEditor');
        new MutationObserver(drawRowAtoms).observe(atomsBox, {childList: true});
        atomsBox.addEventListener('change', drawRowAtoms);
        new MutationObserver(drawRowAtoms).observe(document.getElementById('segmentRows'), {childList: true});
        document.getElementById('segmentRows').addEventListener('change', e => { if (!e.target.closest('.seg-atoms')) drawRowAtoms(); });
        document.getElementById('dnaAddAtom').onclick = () => {
            const v = video();
            addAtom(v && v.currentTime ? { time: Math.round(v.currentTime * 100) / 100 } : {});
            if (typeof root.segmentEditorRenderStrip === 'function') root.segmentEditorRenderStrip();
        };
        new MutationObserver(refreshSegments).observe(document.getElementById('segmentRows'), {childList:true});
        document.getElementById('segmentRows').addEventListener('change', refreshSegments);
    });
    // Technique and time of every atom in the list, to skip suggestions that are already there.
    function list() {
        return Array.from(document.querySelectorAll('#dnaAtomsEditor > div')).map(card => ({
            technique: card.querySelector('[data-field="technique"]').value,
            time: parseFloat(card.querySelector('[data-field="time"]').value)
        }));
    }

    root.RiffDNAEditor = {load, read, atomTimes, add: addAtom, list};
})(window);
