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
        card.appendChild(input('Приём (Atom)', 'technique', known, V.techniques.map(t => [t.key, t.label])));
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
                const byTime = segmentRows.findIndex(row => time >= Number(row.querySelector('.start').value) && time < Number(row.querySelector('.end').value));
                if (byTime < 0) throw new Error('Приём ' + (index + 1) + ': время ' + time + ' с не попадает ни в один сегмент.');
                segmentIndex = byTime;
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

    document.addEventListener('DOMContentLoaded', () => {
        document.getElementById('dnaAddAtom').onclick = () => {
            const v = video();
            addAtom(v && v.currentTime ? { time: Math.round(v.currentTime * 100) / 100 } : {});
            if (typeof root.segmentEditorRenderStrip === 'function') root.segmentEditorRenderStrip();
        };
        new MutationObserver(refreshSegments).observe(document.getElementById('segmentRows'), {childList:true});
        document.getElementById('segmentRows').addEventListener('change', refreshSegments);
    });
    root.RiffDNAEditor = {load, read, atomTimes};
})(window);
