/* Riff markup editor: video, timeline with draggable boundaries and technique markers, parts list.
 * Parts stay as #segmentRows .segment-row with .start .end .name .role .function inputs:
 * admin-dna.js and admin-dna-ai.js read and write them directly.
 * Keys follow video editors: Space play, S split at the playhead (Premiere/Descript), I/O set in/out,
 * L loop, arrows step frames or move between parts, Cmd/Ctrl+Z undo. */
(function (root) {
    'use strict';
    var V = root.RiffDNAVocab;
    var MIN = 0.05;        // shortest part, seconds
    var JOIN_GAP = 0.06;   // boundaries closer than this move together (roll edit)
    var FRAME = 1 / 30;
    var SNAP_PX = 7;

    var COLORS = [
        { name: 'По умолчанию', hex: '#9355E5' }, { name: 'Синий', hex: '#2196F3' }, { name: 'Зелёный', hex: '#4CAF50' },
        { name: 'Оранжевый', hex: '#FF9800' }, { name: 'Красный', hex: '#F44336' }, { name: 'Жёлтый', hex: '#FFC107' },
        { name: 'Голубой', hex: '#00BCD4' }, { name: 'Розовый', hex: '#E91E63' }, { name: 'Бирюзовый', hex: '#009688' }
    ];

    // Admin wording for the method's roles. The English hints in riff-dna-vocab.js are what students see.
    var ROLE_RU = {
        call: ['открывает фразу', 'Первая мысль фразы. Задаёт материал, на который дальше будет ответ.'],
        launch: ['врывается, часто после паузы', 'Резкий вход: гитара влетает после паузы, вокала или другого инструмента.'],
        push: ['толкает вперёд', 'Добавляет движение и энергию, тянет к следующей части.'],
        repeat: ['повторяет короткую клетку', 'Повтор короткого мотива, чтобы ухо за него зацепилось.'],
        climb: ['поднимается, растит напряжение', 'Движение вверх по нотам или регистру, напряжение растёт.'],
        fall: ['спускается, отпускает', 'Движение вниз, напряжение уходит.'],
        hang: ['зависает без разрешения', 'Держит звук или мотив и оставляет фразу незавершённой.'],
        turn: ['разворачивает к дому', 'Меняет направление и ведёт фразу обратно к тонике.'],
        answer: ['отвечает на предыдущую часть', 'Реплика в ответ на Call: похожий ритм или регистр, но закрывает мысль.'],
        land: ['приземляется на тонику', 'Фраза приходит домой, на опорную ноту.'],
        reset: ['готовит следующий круг', 'Связка, после которой фраза начинается заново.'],
        space: ['пауза, вокал, другой инструмент', 'Тишина или чужая партия, которая тоже часть риффа.']
    };
    var GROUP_RU = { start: 'Начало фразы', tension: 'Напряжение', turn: 'Поворот', home: 'Дом', space: 'Пространство' };

    var el = function (id) { return document.getElementById(id); };
    var container = function () { return el('segmentRows'); };
    var rows = function () { return Array.prototype.slice.call(document.querySelectorAll('#segmentRows .segment-row')); };
    var video = function () { return el('segmentEditorVideo'); };
    var num = function (v) { var n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
    var round3 = function (v) { return Math.round(num(v) * 1000) / 1000; };
    var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };

    var selected = -1, looping = false, zoom = 1, nextId = 0;
    var undoStack = [], redoStack = [], pendingSnapshot = null;

    function fmt(t) {
        t = Math.max(0, num(t));
        var m = Math.floor(t / 60), s = t - m * 60;
        return m + ':' + (s < 10 ? '0' : '') + s.toFixed(2);
    }

    function dirty() { if (typeof root.RiffEditorDirty === 'function') root.RiffEditorDirty(); }

    function toast(text) {
        var t = el('edToast');
        if (!t) { t = document.createElement('div'); t.id = 'edToast'; t.className = 'ed-toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
        t.textContent = text;
        t.classList.add('on');
        clearTimeout(t._h);
        t._h = setTimeout(function () { t.classList.remove('on'); }, 2200);
    }

    // ----- Data -----
    function readRow(row) {
        var colSel = row.querySelector('.color-select'), colHex = row.querySelector('.color-hex');
        var color = colSel.value === 'custom' ? (colHex.value || '').trim() : colSel.value;
        if (!/^#[0-9A-Fa-f]{6}$/.test(color)) color = COLORS[0].hex;
        return {
            start: round3(row.querySelector('.start').value), end: round3(row.querySelector('.end').value),
            name: row.querySelector('.name').value, role: row.querySelector('.role').value,
            fn: row.querySelector('.function').value, tab: row.querySelector('.tab-image').value,
            color: color, row: row
        };
    }
    function segs() { return rows().map(readRow); }

    function videoDuration() {
        var v = video();
        if (!v || !v.getAttribute('src')) return 0;
        return Number.isFinite(v.duration) && v.duration > 0 ? v.duration : 0;
    }
    function total() {
        var maxEnd = segs().reduce(function (m, s) { return Math.max(m, s.end); }, 0);
        return Math.max(videoDuration(), maxEnd, 1);
    }
    function now() { var v = video(); return v && Number.isFinite(v.currentTime) ? v.currentTime : 0; }

    // ----- Rows -----
    function roleOptions() {
        var html = '<option value="">Без роли — только упражнение</option>';
        Object.keys(GROUP_RU).forEach(function (g) {
            var list = V.roles.filter(function (r) { return r.group === g; });
            if (!list.length) return;
            html += '<optgroup label="' + GROUP_RU[g] + '">' + list.map(function (r) {
                return '<option value="' + r.key + '">' + r.label + ' — ' + (ROLE_RU[r.key] ? ROLE_RU[r.key][0] : r.hint) + '</option>';
            }).join('') + '</optgroup>';
        });
        return html;
    }

    function makeRow(d) {
        var row = document.createElement('div');
        row.className = 'segment-row';
        row._segmentData = Object.assign({}, d.data || {});
        row.dataset.editorId = String(d.editorId || ++nextId);
        if (d.editorId) nextId = Math.max(nextId, Number(d.editorId) || 0);
        var color = d.color || COLORS[0].hex;
        var custom = !COLORS.some(function (c) { return c.hex.toLowerCase() === String(color).toLowerCase(); });
        if (custom) row.classList.add('color-custom');
        row.innerHTML =
            '<div class="seg-line">' +
                '<span class="seg-swatch"></span><span class="seg-num"></span>' +
                '<div class="seg-main"><select class="role" aria-label="Роль части во фразе">' + roleOptions() + '</select><span class="seg-sub"></span></div>' +
                '<span class="seg-time"></span>' +
            '</div>' +
            '<div class="seg-body">' +
                '<div class="seg-role-help"></div>' +
                '<label class="ed-field"><span>Что делает эта часть в этом риффе</span><input type="text" class="function" placeholder="Например: влетает после паузы и крутится вокруг 7 лада"><small>Своё для каждого риффа. Ученик видит это в панели Riff DNA под названием части.</small></label>' +
                '<div class="ed-row2"><label class="ed-field"><span>Начало, сек</span><input type="number" class="start" step="0.01" min="0"></label>' +
                '<label class="ed-field"><span>Конец, сек</span><input type="number" class="end" step="0.01" min="0"></label></div>' +
                '<label class="ed-field"><span>Подпись кнопки в плеере</span><input type="text" class="name"></label>' +
                '<label class="ed-field"><span>Картинка табов</span><input type="text" class="tab-image" placeholder="assets/tabs/artist/song/1.png"></label>' +
                '<div class="ed-field"><span>Цвет кнопки в плеере</span><div class="seg-colors">' +
                    COLORS.map(function (c) { return '<button type="button" data-hex="' + c.hex + '" title="' + c.name + '" style="background:' + c.hex + '"></button>'; }).join('') +
                    '<button type="button" data-hex="custom" title="Свой цвет" style="background:conic-gradient(#f44336,#ffc107,#4caf50,#2196f3,#9355e5,#f44336)"></button>' +
                    '<select class="color-select" tabindex="-1" aria-hidden="true">' + COLORS.map(function (c) { return '<option value="' + c.hex + '">' + c.name + '</option>'; }).join('') + '<option value="custom">Свой</option></select>' +
                    '<input type="text" class="color-hex ed-input" maxlength="7" placeholder="#hex">' +
                '</div></div>' +
                '<div class="seg-actions"><button type="button" class="ed-btn danger rm-seg">Удалить часть</button><button type="button" class="ed-btn seg-merge">Склеить со следующей</button></div>' +
            '</div>';
        row.querySelector('.role').value = d.role || '';
        row.querySelector('.start').value = round3(d.start);
        row.querySelector('.end').value = round3(d.end);
        row.querySelector('.name').value = d.name || '';
        row.querySelector('.function').value = d.fn || '';
        row.querySelector('.tab-image').value = d.tab || '';
        row.querySelector('.color-select').value = custom ? 'custom' : COLORS.filter(function (c) { return c.hex.toLowerCase() === String(color).toLowerCase(); })[0].hex;
        row.querySelector('.color-hex').value = custom ? color : '';
        return row;
    }

    function rowState(row) {
        var s = readRow(row);
        return { data: Object.assign({}, row._segmentData), editorId: row.dataset.editorId, start: s.start, end: s.end, name: s.name, role: s.role, fn: s.fn, tab: s.tab, color: s.color };
    }

    function insertRow(index, d) {
        var row = makeRow(d), list = rows();
        if (index >= list.length) container().appendChild(row); else container().insertBefore(row, list[index]);
        return row;
    }

    // Default "Shot N" names follow the order; names the admin typed are kept.
    function renumber() {
        rows().forEach(function (row, i) {
            var name = row.querySelector('.name');
            if (!name.value.trim() || /^Shot \d+$/.test(name.value.trim())) name.value = 'Shot ' + (i + 1);
            name.placeholder = 'Shot ' + (i + 1);
        });
    }

    // ----- History -----
    function snapshot() { return { rows: rows().map(rowState), selected: selected }; }
    function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
    function checkpoint(snap) {
        snap = snap || snapshot();
        if (undoStack.length && same(undoStack[undoStack.length - 1], snap)) return;
        undoStack.push(snap);
        if (undoStack.length > 100) undoStack.shift();
        redoStack = [];
    }
    function restore(snap) {
        container().replaceChildren();
        snap.rows.forEach(function (d) { container().appendChild(makeRow(d)); });
        selected = Math.min(snap.selected, snap.rows.length - 1);
        afterChange();
    }
    function undo() {
        if (!undoStack.length) { toast('Нечего отменять'); return; }
        redoStack.push(snapshot());
        restore(undoStack.pop());
        toast('Отменено');
    }
    function redo() {
        if (!redoStack.length) return;
        undoStack.push(snapshot());
        restore(redoStack.pop());
    }

    function afterChange() {
        validate(true);
        render();
        dirty();
        // admin-dna.js refreshes its segment pickers on change.
        container().dispatchEvent(new Event('change', { bubbles: true }));
    }

    // ----- Editing operations -----
    function select(i, seek) {
        var list = rows();
        selected = list.length ? Math.max(0, Math.min(i, list.length - 1)) : -1;
        if (seek && selected >= 0) {
            var v = video();
            if (v && v.getAttribute('src')) { v.currentTime = readRow(list[selected]).start; }
        }
        render();
        var row = list[selected];
        if (row) {
            var box = container();
            var top = row.offsetTop - box.offsetTop;
            if (top < box.scrollTop || top + 40 > box.scrollTop + box.clientHeight) box.scrollTop = Math.max(0, top - 8);
        }
    }

    function split() {
        var t = round3(now()), list = segs();
        if (!videoDuration()) { toast('Сначала нужно видео'); return; }
        var inside = list.findIndex(function (s) { return t > s.start + MIN && t < s.end - MIN; });
        checkpoint();
        if (inside >= 0) {
            var s = list[inside];
            s.row.querySelector('.end').value = t;
            insertRow(inside + 1, { start: t, end: s.end, color: s.color });
            selected = inside + 1;
        } else {
            if (list.some(function (s) { return t >= s.start - 0.001 && t <= s.end + 0.001; })) { undoStack.pop(); toast('Слишком близко к границе'); return; }
            var prevEnd = list.reduce(function (m, s) { return s.end <= t ? Math.max(m, s.end) : m; }, 0);
            if (t - prevEnd < MIN) { undoStack.pop(); toast('Слишком близко к границе'); return; }
            var at = list.filter(function (s) { return s.end <= t; }).length;
            insertRow(at, { start: prevEnd, end: t });
            selected = at;
        }
        renumber();
        afterChange();
    }

    function setEdge(side) {
        var list = segs(), s = list[selected];
        if (!s) { toast('Выберите часть в списке или на таймлайне'); return; }
        var t = round3(now()), prev = list[selected - 1], next = list[selected + 1];
        checkpoint();
        if (side === 'start') {
            var lo = prev ? prev.end : 0;
            t = Math.max(lo, Math.min(t, s.end - MIN));
            s.row.querySelector('.start').value = round3(t);
        } else {
            var hi = next ? next.start : total();
            t = Math.min(hi, Math.max(t, s.start + MIN));
            s.row.querySelector('.end').value = round3(t);
        }
        afterChange();
    }

    function removeSelected() {
        var list = rows();
        if (!list[selected]) return;
        checkpoint();
        list[selected].remove();
        selected = Math.min(selected, rows().length - 1);
        renumber();
        afterChange();
        toast('Часть удалена. Cmd/Ctrl+Z — вернуть');
    }

    function mergeNext(i) {
        var list = segs();
        if (!list[i] || !list[i + 1]) { toast('Это последняя часть'); return; }
        checkpoint();
        list[i].row.querySelector('.end').value = list[i + 1].end;
        list[i + 1].row.remove();
        selected = i;
        renumber();
        afterChange();
    }

    function toggleLoop() {
        if (selected < 0) { toast('Выберите часть, которую повторять'); return; }
        looping = !looping;
        var btn = el('segmentEditorLoop');
        if (btn) btn.classList.toggle('on', looping);
        if (looping) {
            var v = video(), s = segs()[selected];
            if (v && s && (now() < s.start || now() >= s.end)) v.currentTime = s.start;
            if (v && v.paused) v.play().catch(function () {});
        }
        render();
    }

    function togglePlay() {
        var v = video();
        if (!v || !v.getAttribute('src')) return;
        if (v.paused) v.play().catch(function () {}); else v.pause();
    }

    function step(dt) {
        var v = video();
        if (!v || !v.getAttribute('src')) return;
        v.pause();
        v.currentTime = Math.max(0, Math.min(total(), now() + dt));
    }

    function addAtom() {
        var btn = el('dnaAddAtom');
        if (!btn) return;
        btn.click();
        toast('Приём добавлен на ' + fmt(now()) + '. Заполните его ниже, в Riff DNA');
    }

    function validate(mark) {
        var list = segs(), bad = -1;
        list.forEach(function (s, i) {
            var badBounds = s.start < 0 || s.end <= s.start;
            var overlap = i > 0 && s.start < list[i - 1].end - 0.0005;
            if (mark) {
                s.row.querySelector('.start').setAttribute('aria-invalid', s.start < 0 ? 'true' : 'false');
                s.row.querySelector('.end').setAttribute('aria-invalid', s.end <= s.start ? 'true' : 'false');
                s.row.classList.toggle('overlap', overlap);
            }
            if (bad < 0 && (badBounds || overlap || (videoDuration() > 0 && s.end > videoDuration() + 0.05))) bad = i;
        });
        return bad;
    }

    // ----- Rendering -----
    function pps() {
        var scroll = el('tlScroll');
        return Math.max(1, (scroll ? scroll.clientWidth : 600) * zoom / total());
    }

    function renderRuler(content, width, T) {
        var ruler = el('tlRuler');
        ruler.replaceChildren();
        var px = width / T, steps = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60];
        var major = steps.find(function (s) { return s * px >= 64; }) || 60;
        var minor = major / (major === 0.25 || major === 2.5 ? 5 : (String(major)[0] === '2' ? 4 : 5));
        if (minor * px < 8) minor = major;
        var count = Math.floor(T / minor);
        for (var i = 0; i <= count && i < 2000; i++) {
            var t = i * minor, isMajor = Math.abs(t / major - Math.round(t / major)) < 1e-6;
            var tick = document.createElement('i');
            tick.className = 'tl-tick' + (isMajor ? ' major' : '');
            tick.style.left = (t * px) + 'px';
            if (isMajor) { var b = document.createElement('b'); b.textContent = fmt(t).replace(/\.00$/, ''); tick.appendChild(b); }
            ruler.appendChild(tick);
        }
    }

    function render() {
        var content = el('tlContent');
        if (!content) return;
        var T = total(), scroll = el('tlScroll');
        var width = Math.max(scroll.clientWidth, Math.round(scroll.clientWidth * zoom));
        content.style.width = width + 'px';
        var px = width / T;
        renderRuler(content, width, T);

        var list = segs();
        var track = el('tlSegments');
        track.replaceChildren();
        if (!list.length) {
            var empty = document.createElement('div');
            empty.className = 'tl-empty';
            empty.textContent = videoDuration() ? 'Включите видео и нажимайте S в конце каждой части' : 'Загрузите видео, чтобы размечать';
            track.appendChild(empty);
        }
        list.forEach(function (s, i) {
            var role = V.role(s.role);
            var b = document.createElement('div');
            b.className = 'tl-seg' + (role ? '' : ' norole') + (i === selected ? ' sel' : '') + (looping && i === selected ? ' loop' : '');
            b.dataset.index = i;
            b.style.left = (s.start * px) + 'px';
            b.style.width = Math.max(4, (s.end - s.start) * px) + 'px';
            if (role) b.style.background = role.color;
            b.title = (i + 1) + '. ' + (role ? role.label : 'Без роли') + ' · ' + fmt(s.start) + '–' + fmt(s.end);
            b.innerHTML = '<span class="tl-seg-label">' + (i + 1) + ' ' + esc(role ? role.label : 'Без роли') + '<small>' + esc(s.fn || s.name) + '</small></span>' +
                '<span class="tl-edge l" data-edge="start"></span><span class="tl-edge r" data-edge="end"></span>';
            track.appendChild(b);
        });

        var atomsTrack = el('tlAtoms');
        atomsTrack.replaceChildren();
        atomCards().forEach(function (card, i) {
            var t = parseFloat(card.querySelector('[data-field="time"]').value);
            if (!Number.isFinite(t)) return;
            var tech = V.technique(card.querySelector('[data-field="technique"]').value);
            var a = document.createElement('div');
            a.className = 'tl-atom';
            a.dataset.atom = i;
            a.style.left = (t * px) + 'px';
            a.title = (tech ? tech.label : 'Приём') + ' · ' + fmt(t) + ' — тяните, чтобы сдвинуть';
            atomsTrack.appendChild(a);
        });
        if (!atomsTrack.children.length) {
            var label = document.createElement('span');
            label.className = 'tl-track-label';
            label.textContent = 'Приёмы: клавиша A ставит приём в текущий момент';
            atomsTrack.appendChild(label);
        }

        // Parts list
        list.forEach(function (s, i) {
            var role = V.role(s.role), row = s.row;
            row.classList.toggle('sel', i === selected);
            row.querySelector('.seg-num').textContent = i + 1;
            row.querySelector('.seg-swatch').style.background = role ? role.color : '#3a4160';
            row.querySelector('.seg-time').textContent = fmt(s.start) + '–' + fmt(s.end);
            row.querySelector('.seg-sub').textContent = s.fn || s.name;
            var help = row.querySelector('.seg-role-help');
            help.innerHTML = role
                ? '<b>' + role.label + '</b> — ' + esc(ROLE_RU[role.key] ? ROLE_RU[role.key][1] : role.hint) + ' Роль общая для всех риффов, цвет части на сайте берётся из неё.'
                : '<b>Без роли.</b> Часть останется кнопкой для отработки в плеере, но не войдёт во фразу Riff DNA.';
            help.style.borderLeftColor = role ? role.color : '';
            var colorBtns = row.querySelectorAll('.seg-colors button');
            var sel = row.querySelector('.color-select').value;
            colorBtns.forEach(function (btn) { btn.classList.toggle('on', btn.dataset.hex === sel); });
        });
        var count = el('segCount');
        if (count) count.textContent = list.length ? list.length + ' ' + plural(list.length, 'часть', 'части', 'частей') + ' · ' + fmt(T) : '';
        var emptyList = el('segEmpty');
        if (emptyList) emptyList.hidden = list.length > 0;
        renderPlayhead();
    }

    function plural(n, one, few, many) {
        var m10 = n % 10, m100 = n % 100;
        if (m10 === 1 && m100 !== 11) return one;
        if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
        return many;
    }

    function renderPlayhead() {
        var ph = el('tlPlayhead');
        if (!ph) return;
        var t = now(), px = pps();
        ph.style.left = (t * px) + 'px';
        var tc = el('segmentEditorTime');
        if (tc) tc.innerHTML = fmt(t) + ' <span>/ ' + fmt(videoDuration() || total()) + '</span>';
        var v = video(), scroll = el('tlScroll');
        if (v && !v.paused && zoom > 1 && scroll) {
            var x = t * px;
            if (x < scroll.scrollLeft || x > scroll.scrollLeft + scroll.clientWidth - 40) scroll.scrollLeft = x - 40;
        }
    }

    function atomCards() { return Array.prototype.slice.call(document.querySelectorAll('#dnaAtomsEditor > div')); }

    // ----- Pointer on the timeline -----
    function timeAt(clientX) {
        var r = el('tlContent').getBoundingClientRect();
        return Math.max(0, Math.min(total(), (clientX - r.left) / pps()));
    }

    function snapTo(t, skip) {
        var px = pps(), best = null, bestD = SNAP_PX / px;
        var cands = [now()];
        segs().forEach(function (s, i) { if (!skip || skip.indexOf(i) < 0) cands.push(s.start, s.end); });
        atomCards().forEach(function (c) { var a = parseFloat(c.querySelector('[data-field="time"]').value); if (Number.isFinite(a)) cands.push(a); });
        cands.forEach(function (c) { var d = Math.abs(c - t); if (d < bestD) { bestD = d; best = c; } });
        var line = el('tlSnap');
        if (best !== null) { line.style.left = (best * px) + 'px'; line.style.display = 'block'; return best; }
        line.style.display = 'none';
        return t;
    }

    var drag = null;
    function onDown(e) {
        if (e.button !== 0) return;
        var edge = e.target.closest('.tl-edge'), atom = e.target.closest('.tl-atom'), seg = e.target.closest('.tl-seg');
        var v = video();
        if (edge && seg) {
            var i = Number(seg.dataset.index), list = segs(), side = edge.dataset.edge;
            var neighbour = side === 'start' ? list[i - 1] : list[i + 1];
            var linked = !e.altKey && neighbour && Math.abs(side === 'start' ? list[i].start - neighbour.end : neighbour.start - list[i].end) < JOIN_GAP;
            drag = { kind: 'edge', index: i, side: side, linked: linked, before: snapshot() };
            selected = i;
        } else if (atom) {
            drag = { kind: 'atom', index: Number(atom.dataset.atom) };
            atom.classList.add('sel');
        } else if (seg) {
            var idx = Number(seg.dataset.index);
            selected = idx;
            if (v && v.getAttribute('src') && (v.paused || looping)) v.currentTime = segs()[idx].start;
            render();
            select(idx, false);
            return;
        } else {
            drag = { kind: 'scrub' };
            if (v && v.getAttribute('src')) v.currentTime = timeAt(e.clientX);
        }
        e.preventDefault();
        el('tlContent').setPointerCapture(e.pointerId);
        render();
    }

    function onMove(e) {
        if (!drag) return;
        var t = timeAt(e.clientX), v = video();
        if (drag.kind === 'scrub') {
            if (v && v.getAttribute('src')) v.currentTime = t;
            renderPlayhead();
            return;
        }
        if (drag.kind === 'atom') {
            var card = atomCards()[drag.index];
            if (!card) return;
            t = snapTo(t, null);
            card.querySelector('[data-field="time"]').value = Math.round(t * 100) / 100;
            drag.moved = true;
            render();
            return;
        }
        var list = segs(), s = list[drag.index], prev = list[drag.index - 1], next = list[drag.index + 1];
        t = snapTo(t, drag.linked ? [drag.index, drag.index + (drag.side === 'start' ? -1 : 1)] : [drag.index]);
        if (drag.side === 'start') {
            var lo = prev ? (drag.linked ? prev.start + MIN : prev.end) : 0;
            t = Math.max(lo, Math.min(t, s.end - MIN));
            s.row.querySelector('.start').value = round3(t);
            if (drag.linked) prev.row.querySelector('.end').value = round3(t);
        } else {
            var hi = next ? (drag.linked ? next.end - MIN : next.start) : total();
            t = Math.min(hi, Math.max(t, s.start + MIN));
            s.row.querySelector('.end').value = round3(t);
            if (drag.linked) next.row.querySelector('.start').value = round3(t);
        }
        // Show the frame under the boundary while trimming, like a trim monitor.
        if (v && v.getAttribute('src') && v.paused) v.currentTime = t;
        drag.moved = true;
        render();
    }

    function onUp() {
        if (!drag) return;
        el('tlSnap').style.display = 'none';
        if (drag.kind === 'edge' && drag.moved) {
            checkpoint(drag.before);
            afterChange();
        }
        if (drag.kind === 'atom' && drag.moved) {
            var card = atomCards()[drag.index];
            if (card) card.querySelector('[data-field="time"]').dispatchEvent(new Event('change', { bubbles: true }));
            dirty();
        }
        drag = null;
        render();
    }

    // ----- Keyboard -----
    function typing(target) {
        return target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
    }
    function onKey(e) {
        var pane = el('tabEdit');
        if (!pane || !pane.classList.contains('active')) return;
        if (document.querySelector('dialog[open]')) return;
        if (typing(e.target)) {
            if (e.key === 'Escape') e.target.blur();
            return;
        }
        var mod = e.metaKey || e.ctrlKey, k = e.key;
        if (mod && (k === 'z' || k === 'Z' || k === 'я' || k === 'Я')) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
        if (mod && (k === 'y' || k === 'н')) { e.preventDefault(); redo(); return; }
        if (mod || e.altKey) return;
        var code = e.code;
        var map = {
            Space: togglePlay, KeyS: split, KeyI: function () { setEdge('start'); }, KeyO: function () { setEdge('end'); },
            KeyL: toggleLoop, KeyA: addAtom,
            ArrowLeft: function () { step(e.shiftKey ? -1 : -FRAME); }, ArrowRight: function () { step(e.shiftKey ? 1 : FRAME); },
            ArrowUp: function () { select(selected - 1, true); }, ArrowDown: function () { select(selected + 1, true); },
            Delete: removeSelected, Backspace: removeSelected,
            Equal: function () { setZoom(zoom * 1.5); }, NumpadAdd: function () { setZoom(zoom * 1.5); },
            Minus: function () { setZoom(zoom / 1.5); }, NumpadSubtract: function () { setZoom(zoom / 1.5); },
            Home: function () { var v = video(); if (v) v.currentTime = 0; }, End: function () { var v = video(); if (v) v.currentTime = total(); }
        };
        if (k === '?') { toggleKeys(); e.preventDefault(); return; }
        if (map[code]) { e.preventDefault(); map[code](); renderPlayhead(); }
    }

    function toggleKeys() { var k = el('edKeys'); if (k) k.hidden = !k.hidden; }

    function setZoom(z) {
        var scroll = el('tlScroll'), t = now(), px0 = pps();
        var offset = t * px0 - scroll.scrollLeft;
        zoom = Math.max(1, Math.min(40, z));
        render();
        scroll.scrollLeft = Math.max(0, t * pps() - offset);
    }

    // ----- Video -----
    function setVideo(path) {
        var v = video(), src = el('segmentEditorVideoSrc'), empty = el('edVideoEmpty');
        path = (path || '').trim();
        looping = false;
        if (!path) {
            v.removeAttribute('src');
            v.load();
            if (src) src.textContent = '';
            if (empty) empty.hidden = false;
            render();
            return;
        }
        // video.php serves byte ranges, which seeking needs.
        v.src = /^(https?|blob):/.test(path) ? path : '../video.php?file=' + encodeURIComponent(path.replace(/^\//, ''));
        v.load();
        if (src) src.textContent = /^blob:/.test(path) ? 'Выбранный файл (загрузится при сохранении)' : path;
        if (empty) empty.hidden = true;
    }

    var raf = null;
    function tick() {
        var v = video();
        if (looping && selected >= 0 && v && !v.paused && !v.seeking) {
            var s = segs()[selected];
            if (s && (v.currentTime >= s.end - 0.01 || v.currentTime < s.start - 0.25)) v.currentTime = s.start;
        }
        renderPlayhead();
        raf = v && !v.paused ? requestAnimationFrame(tick) : null;
    }

    // ----- Public -----
    function load(riff) {
        container().replaceChildren();
        nextId = 0;
        (riff.segments || []).forEach(function (s, i) {
            container().appendChild(makeRow({
                data: s, start: s.start, end: s.end, name: s.name || ('Shot ' + (i + 1)), role: V.roleFromLegacy(s),
                fn: s.function || '', color: s.color,
                tab: s.tabImage || (riff.videoFile || '').replace('/video/', '/tabs/').replace(/[^/]+$/, (i + 1) + '.png')
            }));
        });
        selected = (riff.segments || []).length ? 0 : -1;
        undoStack = []; redoStack = []; looping = false; zoom = 1;
        var loop = el('segmentEditorLoop');
        if (loop) loop.classList.remove('on');
        validate(true);
        setVideo(riff.videoFile || riff.videoFileRight || '');
        render();
    }

    function collect() {
        return rows().map(function (row, i) {
            var s = readRow(row), data = Object.assign({}, row._segmentData || {}), n = s.name.trim();
            delete data.molecule; delete data.moleculeName; delete data.relation;
            return Object.assign(data, {
                tabImage: s.tab.trim(), role: s.role, function: s.fn.trim(),
                displayName: (row._segmentData || {}).name === n ? ((row._segmentData || {}).displayName || n) : n,
                start: s.start, end: s.end, name: n || ('Shot ' + (i + 1)), color: s.color
            });
        });
    }

    function init() {
        var v = video(), content = el('tlContent');
        content.addEventListener('pointerdown', onDown);
        content.addEventListener('pointermove', onMove);
        content.addEventListener('pointerup', onUp);
        content.addEventListener('pointercancel', onUp);
        el('tlScroll').addEventListener('wheel', function (e) {
            if (!(e.ctrlKey || e.metaKey)) return;
            e.preventDefault();
            setZoom(zoom * (e.deltaY < 0 ? 1.25 : 0.8));
        }, { passive: false });
        document.addEventListener('keydown', onKey);
        ['loadedmetadata', 'durationchange'].forEach(function (n) { v.addEventListener(n, render); });
        v.addEventListener('seeked', renderPlayhead);
        v.addEventListener('timeupdate', renderPlayhead);
        v.addEventListener('play', function () { var b = el('segmentEditorPlayPause'); if (b) b.innerHTML = 'Пауза <kbd>Space</kbd>'; if (!raf) raf = requestAnimationFrame(tick); });
        v.addEventListener('pause', function () { var b = el('segmentEditorPlayPause'); if (b) b.innerHTML = 'Play <kbd>Space</kbd>'; renderPlayhead(); });
        v.addEventListener('ended', function () {
            if (looping && selected >= 0) { v.currentTime = segs()[selected].start; v.play().catch(function () {}); }
        });

        var bind = function (id, fn) { var b = el(id); if (b) b.addEventListener('click', function (e) { e.preventDefault(); fn(); b.blur(); }); };
        bind('segmentEditorPlayPause', togglePlay);
        bind('segmentSplit', split);
        bind('segmentSetStart', function () { setEdge('start'); });
        bind('segmentSetEnd', function () { setEdge('end'); });
        bind('segmentEditorLoop', toggleLoop);
        bind('segmentAddAtom', addAtom);
        bind('segmentUndo', undo);
        bind('segmentRedo', redo);
        bind('tlZoomIn', function () { setZoom(zoom * 1.5); });
        bind('tlZoomOut', function () { setZoom(zoom / 1.5); });
        bind('edKeysToggle', toggleKeys);
        var speed = el('segmentSpeed');
        if (speed) speed.addEventListener('change', function () { v.playbackRate = Number(speed.value) || 1; v.defaultPlaybackRate = v.playbackRate; speed.blur(); });

        var box = container();
        box.addEventListener('click', function (e) {
            var row = e.target.closest('.segment-row');
            if (!row) return;
            var i = rows().indexOf(row);
            if (e.target.closest('.rm-seg')) { selected = i; removeSelected(); return; }
            if (e.target.closest('.seg-merge')) { mergeNext(i); return; }
            var colorBtn = e.target.closest('.seg-colors button');
            if (colorBtn) {
                checkpoint();
                var sel = row.querySelector('.color-select');
                sel.value = colorBtn.dataset.hex;
                row.classList.toggle('color-custom', sel.value === 'custom');
                if (sel.value === 'custom' && !row.querySelector('.color-hex').value) row.querySelector('.color-hex').value = '#9355E5';
                afterChange();
                return;
            }
            if (e.target.closest('.seg-line') && i !== selected) select(i, true);
        });
        box.addEventListener('focusin', function (e) {
            var row = e.target.closest('.segment-row');
            pendingSnapshot = snapshot();
            if (row && rows().indexOf(row) !== selected && e.target.classList.contains('role')) { selected = rows().indexOf(row); render(); }
        });
        box.addEventListener('input', function () { validate(true); render(); dirty(); });
        box.addEventListener('change', function (e) {
            if (e.target === box) return; // our own refresh signal for admin-dna.js
            if (pendingSnapshot) { checkpoint(pendingSnapshot); pendingSnapshot = null; }
            if (e.target.matches('.start, .end')) e.target.value = round3(e.target.value);
            validate(true);
            render();
            dirty();
        });
        // Technique edits in the DNA section move the markers.
        var atoms = el('dnaAtomsEditor');
        if (atoms) {
            atoms.addEventListener('change', render);
            new MutationObserver(render).observe(atoms, { childList: true });
        }
        var guide = el('markupGuide'), guideKey = 'rkEditorGuideClosed';
        var closed = false;
        try { closed = localStorage.getItem(guideKey) === '1'; } catch (err) {}
        if (guide) guide.hidden = closed;
        bind('markupGuideToggle', function () { guide.hidden = !guide.hidden; });
        bind('markupGuideClose', function () { guide.hidden = true; try { localStorage.setItem(guideKey, '1'); } catch (err) {} });
        var legend = el('rolesLegend');
        if (legend) legend.innerHTML = V.roles.map(function (r) {
            return '<div><i style="background:' + V.groupColors[r.group] + '"></i><span><b>' + r.label + '</b> — ' + esc(ROLE_RU[r.key] ? ROLE_RU[r.key][0] : r.hint) + '</span></div>';
        }).join('');
        window.addEventListener('resize', render);
        render();
    }

    root.SegmentEditor = {
        init: init, load: load, collect: collect, setVideo: setVideo, render: render,
        validate: function () { return validate(true); }, duration: videoDuration, split: split, undo: undo,
        selected: function () { return selected; }, select: select
    };
    // Older hooks used by admin-dna.js and the DNA assistant.
    root.segmentEditorRenderStrip = render;
    root.segmentEditorGetDuration = videoDuration;
})(window);
