/* Structured authoring for the recovered Riff DNA lesson format. */
(function (root) {
    'use strict';
    const fieldIds = {
        overview: 'dnaOverviewInput', formula: 'dnaFormulaInput', law: 'dnaLawInput', insight: 'dnaInsightInput'
    };
    const rows = () => Array.from(document.querySelectorAll('#segmentRows .segment-row'));
    const value = id => document.getElementById(id).value.trim();
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
    function addAtom(atom = {}) {
        const card = document.createElement('div');
        card.className = 'dna-admin-grid';
        card.style.cssText = 'border:1px solid #50546a;border-radius:8px;padding:12px;margin-bottom:12px';
        card._original = atom;
        const segmentRows = rows();
        let index = Number.isInteger(atom.segmentIndex) ? atom.segmentIndex : 0;
        if (Number.isFinite(atom.time) && !Number.isInteger(atom.segmentIndex)) {
            index = segmentRows.findIndex(row => atom.time >= Number(row.querySelector('.start').value) && atom.time < Number(row.querySelector('.end').value));
        }
        card.appendChild(input('Type', 'type', atom.type || 'Pulse'));
        card.appendChild(input('Название', 'label', atom.label || ''));
        card.appendChild(input('Подсказка', 'tip', atom.tip || ''));
        const selected = segmentRows[index];
        const segmentField = input('Сегмент', 'segment', selected ? selected.dataset.editorId : 'missing',
            [['missing', 'Выберите сегмент'], ...segmentRows.map(row => [row.dataset.editorId, row.querySelector('.name').value])]);
        card.appendChild(segmentField);
        card.appendChild(input('Ракурс', 'view', atom.view || 'split', [['left','Left hand'],['right','Right hand'],['split','Split']]));
        card.appendChild(input('Скорость', 'speed', atom.speed || 0.5, [[0.25,'×0.25'],[0.5,'×0.5'],[0.75,'×0.75'],[1,'×1']]));
        const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'btn btn-secondary btn-small';
        remove.textContent = 'Удалить Atom'; remove.onclick = () => card.remove(); card.appendChild(remove);
        document.getElementById('dnaAtomsEditor').appendChild(card);
    }
    function refreshSegments() {
        document.querySelectorAll('#dnaAtomsEditor [data-field="segment"]').forEach(select => {
            const selected = select.value;
            select.replaceChildren();
            [['missing','Выберите сегмент'], ...rows().map(row => [row.dataset.editorId, row.querySelector('.name').value])].forEach(([v,text]) => {
                const option = document.createElement('option'); option.value = v; option.textContent = text; select.appendChild(option);
            });
            select.value = Array.from(select.options).some(o => o.value === selected) ? selected : 'missing';
        });
    }
    function load(riff) {
        const dna = riff.dna || {};
        Object.entries(fieldIds).forEach(([key,id]) => { document.getElementById(id).value = dna[key] || ''; });
        document.getElementById('dnaStructureInput').value = (dna.structure || []).join(', ');
        const mutation = dna.mutation || {};
        document.getElementById('dnaMutationTitleInput').value = mutation.title || '';
        document.getElementById('dnaMutationDescriptionInput').value = mutation.description || '';
        document.getElementById('dnaMutationStepsInput').value = (mutation.steps || []).join('\n');
        document.getElementById('dnaAtomsEditor').replaceChildren();
        (dna.atoms || []).forEach(addAtom);
    }
    function read(original = {}) {
        const dna = Object.assign({}, original || {});
        Object.entries(fieldIds).forEach(([key,id]) => { dna[key] = value(id); });
        dna.structure = value('dnaStructureInput').split(',').map(s => s.trim()).filter(Boolean);
        dna.mutation = Object.assign({}, dna.mutation || {}, {
            title: value('dnaMutationTitleInput'), description: value('dnaMutationDescriptionInput'),
            steps: value('dnaMutationStepsInput').split('\n').map(s => s.trim()).filter(Boolean)
        });
        const segmentRows = rows();
        dna.atoms = Array.from(document.querySelectorAll('#dnaAtomsEditor > div')).map((card, index) => {
            const get = key => card.querySelector('[data-field="'+key+'"]').value.trim();
            const segmentIndex = segmentRows.findIndex(row => row.dataset.editorId === get('segment'));
            if (segmentIndex < 0) throw new Error('Atom ' + (index + 1) + ': выберите существующий сегмент.');
            return Object.assign({}, card._original, {
                type: get('type'), label: get('label'), tip: get('tip'), view: get('view'), speed: Number(get('speed')), segmentIndex
            });
        });
        return dna;
    }
    document.addEventListener('DOMContentLoaded', () => {
        document.getElementById('dnaAddAtom').onclick = () => addAtom();
        new MutationObserver(refreshSegments).observe(document.getElementById('segmentRows'), {childList:true});
        document.getElementById('segmentRows').addEventListener('change', refreshSegments);
    });
    root.RiffDNAEditor = {load, read};
})(window);
