/* Riff DNA draft from a short description: the server asks the model (rules in config/riff-dna-ai-rules.txt),
   the admin reviews the draft here and applies the parts they want to the form. Nothing is saved until "Сохранить". */
(function (root) {
    'use strict';
    const V = root.RiffDNAVocab;
    const $ = id => document.getElementById(id);
    let draft = null;

    // The only two places that know the segment row markup (shared with the segment editor).
    function readSegments() {
        return Array.from(document.querySelectorAll('#segmentRows .segment-row')).map(row => ({
            start: Number(row.querySelector('.start').value),
            end: Number(row.querySelector('.end').value),
            name: row.querySelector('.name').value.trim(),
            role: row.querySelector('.role').value,
            function: row.querySelector('.function').value.trim()
        }));
    }
    function applySegment(index, values) {
        const row = document.querySelectorAll('#segmentRows .segment-row')[index];
        if (!row) return;
        row.querySelector('.role').value = values.role;
        row.querySelector('.function').value = values.function;
        row.querySelector('.role').dispatchEvent(new Event('change', { bubbles: true }));
    }

    function currentDna() {
        try { return root.RiffDNAEditor.read(root.editingRiff && root.editingRiff.dna); }
        catch (err) { return {}; }
    }

    function duration() {
        const fromVideo = typeof root.segmentEditorGetDuration === 'function' ? root.segmentEditorGetDuration() : 0;
        return fromVideo || parseFloat($('duration').value) || 0;
    }

    function status(text, isError) {
        const el = $('dnaAiStatus');
        el.textContent = text;
        el.classList.toggle('error', !!isError);
    }

    function el(tag, text, className) {
        const node = document.createElement(tag);
        if (text != null) node.textContent = text;
        if (className) node.className = className;
        return node;
    }

    function roleLabel(key) {
        const r = V.role(key);
        return r ? r.label : 'без роли';
    }

    function formatTime(t) {
        return Number.isFinite(t) ? t.toFixed(2) + ' c' : 'время не указано';
    }

    function checkbox(id, text, checked) {
        const label = el('label');
        const input = el('input');
        input.type = 'checkbox'; input.id = id; input.checked = checked;
        label.append(input, text);
        return label;
    }

    function render(data, model) {
        const box = $('dnaAiResult');
        box.replaceChildren();
        const segments = readSegments();
        const dna = data.dna;

        box.appendChild(el('h3', 'Роли сегментов'));
        const table = el('table');
        data.segments.forEach(s => {
            const before = segments[s.index] || {};
            const tr = el('tr');
            tr.appendChild(el('td', String(s.index + 1)));
            const td = el('td');
            if (before.role !== s.role) td.appendChild(el('span', roleLabel(before.role), 'was'));
            td.appendChild(el('b', roleLabel(s.role)));
            if (s.function) td.append(' · ' + s.function);
            if (before.role === s.role && before.function === s.function) td.appendChild(el('span', ' (без изменений)', 'same'));
            tr.appendChild(td);
            table.appendChild(tr);
        });
        box.appendChild(table);

        box.appendChild(el('h3', 'Приёмы (Atoms)'));
        if (dna.atoms.length) {
            const list = el('ul');
            dna.atoms.forEach(a => {
                const name = a.technique === 'other' ? (a.type || 'Other') : V.technique(a.technique).label;
                list.appendChild(el('li', name + ' — ' + [a.label, 'сегмент ' + (a.segmentIndex + 1), formatTime(a.time)].filter(Boolean).join(', ') + (a.tip ? '. ' + a.tip : '')));
            });
            box.appendChild(list);
        } else {
            box.appendChild(el('p', 'ИИ не нашёл приёмов в описании.', 'same'));
        }

        box.appendChild(el('h3', 'Тексты DNA'));
        const dl = el('dl');
        [['Organism', dna.overview], ['DNA Rule', dna.rule], ['Почему работает', dna.law],
            ['Что сохранить', dna.preserve.join('\n')], ['Что менять', dna.change.join('\n')],
            ['Ломается, если', dna.failure], ['Упражнение', [dna.mutation.title, dna.mutation.description].filter(Boolean).join('. ')],
            ['Шаги', dna.mutation.steps.map((s, i) => (i + 1) + '. ' + s).join('\n')]
        ].forEach(([k, v]) => { dl.appendChild(el('dt', k)); dl.appendChild(el('dd', v || '—')); });
        box.appendChild(dl);

        if (data.notes.length) {
            box.appendChild(el('h3', 'Вопросы и сомнения ИИ'));
            const notes = el('ul');
            data.notes.forEach(n => notes.appendChild(el('li', n)));
            box.appendChild(notes);
        }

        const existingAtoms = (currentDna().atoms || []).length;
        const pick = el('div', null, 'dna-ai-pick');
        pick.append(
            checkbox('dnaAiPickRoles', 'Роли и описания сегментов', true),
            checkbox('dnaAiPickAtoms', existingAtoms ? 'Приёмы (заменят текущие: ' + existingAtoms + ')' : 'Приёмы', dna.atoms.length > 0 && !existingAtoms),
            checkbox('dnaAiPickText', 'Тексты DNA и упражнение', true)
        );
        box.appendChild(pick);

        const actions = el('div', null, 'dna-ai-actions');
        const apply = el('button', 'Применить к форме', 'btn btn-primary btn-small');
        apply.type = 'button'; apply.id = 'dnaAiApply';
        apply.onclick = applyDraft;
        const discard = el('button', 'Отклонить', 'btn btn-secondary btn-small');
        discard.type = 'button';
        discard.onclick = () => { draft = null; box.hidden = true; box.replaceChildren(); status(''); };
        actions.append(apply, discard);
        box.appendChild(actions);
        box.appendChild(el('p', 'Модель: ' + model, 'dna-ai-model'));
        box.hidden = false;
    }

    function applyDraft() {
        if (!draft) return;
        const roles = $('dnaAiPickRoles').checked, atoms = $('dnaAiPickAtoms').checked, text = $('dnaAiPickText').checked;
        if (roles) draft.segments.forEach(s => applySegment(s.index, s));
        if (atoms || text) {
            const dna = currentDna();
            if (text) {
                ['overview', 'rule', 'law', 'preserve', 'change', 'failure'].forEach(k => { dna[k] = draft.dna[k]; });
                dna.mutation = Object.assign({}, dna.mutation, draft.dna.mutation);
            }
            if (atoms) dna.atoms = draft.dna.atoms;
            root.RiffDNAEditor.load({ dna });
            if (typeof root.segmentEditorRenderStrip === 'function') root.segmentEditorRenderStrip();
        }
        draft = null;
        $('dnaAiResult').hidden = true;
        status('Черновик перенесён в форму. Проверьте поля и нажмите «Сохранить».');
    }

    async function run() {
        const notes = $('dnaAiNotes').value.trim();
        const segments = readSegments();
        if (!segments.length) { status('Сначала разбейте видео на сегменты.', true); return; }
        if (notes.length < 10) { status('Опишите рифф хотя бы одной фразой.', true); return; }
        const button = $('dnaAiRun');
        button.disabled = true;
        status('ИИ составляет черновик, обычно 10–60 секунд…');
        try {
            const response = await fetch('/api/riffs/dna-draft.php', {
                method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    notes,
                    riff: { song: $('song').value.trim(), artist: $('artist').value.trim(), duration: duration(), segments, dna: currentDna() }
                })
            });
            const data = await response.json().catch(() => ({ error: 'Сервер ответил не JSON (' + response.status + ').' }));
            if (!response.ok || !data.success) throw new Error(data.error || 'Ошибка ' + response.status);
            draft = data.draft;
            render(draft, data.model);
            status('Черновик готов. Проверьте его ниже.');
        } catch (err) {
            status(err.message, true);
        } finally {
            button.disabled = false;
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        if ($('dnaAiRun')) $('dnaAiRun').onclick = run;
    });
    root.RiffDNAAI = { readSegments, applySegment };
})(window);
