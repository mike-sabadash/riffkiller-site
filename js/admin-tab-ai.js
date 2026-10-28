/**
 * Admin: tab from a screenshot. The same steps Claude takes in chat (docs/TAB_AGENT.md), in the browser:
 *   1. the model types the screenshot as alphaTex by config/tab-ai-rules.txt (api/riffs/tab-draft.php, pass "read");
 *   2. the site reads the tab back bar by bar (TabListing) and the model checks it against the screenshot ("check");
 *      one more check if the tab still does not read or a bar does not add up;
 *   3. the tab goes into the alphaTex box and is synced to the video's sound (TabEditor.syncAudio).
 * Nothing is saved: the admin looks at the tab and the report, then presses Save.
 */
(function (root) {
    'use strict';

    var MAX_SIDE = 2000, MAX_BYTES = 1.2 * 1024 * 1024, POLL_MS = 2500, POLL_LIMIT = 240000;
    var busy = false;
    function el(id) { return document.getElementById(id); }
    function bars(n) {
        var m10 = n % 10, m100 = n % 100;
        return n + (m10 === 1 && m100 !== 11 ? ' такт' : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? ' такта' : ' тактов');
    }

    function status(text, bad) {
        var s = el('tabAiStatus');
        s.textContent = text || '';
        s.classList.toggle('bad', !!bad);
    }

    function showList(title, items) {
        var box = el('tabAiNotes');
        if (!items || !items.length) return;
        var h = document.createElement('p');
        h.className = 'ed-tab-ai-title';
        h.textContent = title;
        var ul = document.createElement('ul');
        items.forEach(function (t) { var li = document.createElement('li'); li.textContent = t; ul.appendChild(li); });
        box.appendChild(h);
        box.appendChild(ul);
        box.hidden = false;
    }

    /** The screenshot as a data URL small enough for one request: PNG when it fits, else JPEG on white. */
    function encode(file) {
        return new Promise(function (resolve, reject) {
            var url = URL.createObjectURL(file), img = new Image();
            img.onload = function () {
                URL.revokeObjectURL(url);
                var scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
                var canvas = document.createElement('canvas');
                canvas.width = Math.round(img.naturalWidth * scale);
                canvas.height = Math.round(img.naturalHeight * scale);
                var ctx = canvas.getContext('2d');
                ctx.fillStyle = '#fff';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                var png = canvas.toDataURL('image/png');
                if (png.length * 0.75 <= MAX_BYTES) return resolve(png);
                var q = 0.92, jpg;
                do { jpg = canvas.toDataURL('image/jpeg', q); q -= 0.08; } while (jpg.length * 0.75 > MAX_BYTES && q > 0.5);
                resolve(jpg);
            };
            img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Не получилось прочитать картинку.')); };
            img.src = url;
        });
    }

    function ask(body) {
        return fetch('../api/riffs/tab-draft.php', {
            method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
        }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); }).then(function (res) {
            if (!res.ok || !res.data.success) throw new Error((res.data && res.data.error) || 'Сервер не принял запрос.');
            return poll(res.data.job, Date.now());
        });
    }

    function poll(job, started) {
        return new Promise(function (resolve) { setTimeout(resolve, POLL_MS); }).then(function () {
            return fetch('../api/riffs/tab-draft.php?job=' + encodeURIComponent(job), { credentials: 'same-origin' });
        }).then(function (r) { return r.json(); }).then(function (d) {
            if (!d.success) {
                var err = new Error(d.error || 'Модель не ответила.');
                err.raw = d.raw;
                throw err;
            }
            if (d.status === 'done') return d;
            if (Date.now() - started > POLL_LIMIT) throw new Error('Модель так и не ответила. Попробуйте ещё раз.');
            return poll(job, started);
        });
    }

    function readBack(score) {
        return score ? TabListing.describe(score, TabEditor.track()) : { text: '', problems: [], bars: 0 };
    }

    function riffInfo() {
        var song = el('song'), artist = el('artist');
        return { song: song ? song.value : '', artist: artist ? artist.value : '' };
    }

    function run() {
        if (busy) return;
        var file = el('tabAiImage').files[0];
        if (!file) { status('Выберите скриншот таба.', true); return; }
        var current = el('tabTex').value.trim() || el('tabFile').value.trim();
        if (current && !confirm('У риффа уже есть табы. Заменить их тем, что распознается со скриншота? До сохранения ничего не меняется.')) return;
        busy = true;
        el('tabAiRun').disabled = true;
        el('tabAiNotes').textContent = '';
        el('tabAiNotes').hidden = true;
        var notes = el('tabAiHint').value.trim(), riff = riffInfo(), image = null, model = '', tex = '';
        status('Готовлю картинку…');
        encode(file).then(function (dataUrl) {
            image = dataUrl;
            status('Шаг 1 из 3: модель читает скриншот… Обычно это 20–60 секунд.');
            return ask({ pass: 'read', image: image, riff: riff, notes: notes });
        }).then(function (first) {
            model = first.model;
            tex = first.tex;
            var doubts = first.doubts || [];
            return TabEditor.setTex(tex).then(function (score) {
                return check(score, 1, doubts, []);
            });
        }).then(function (result) {
            showList('Модель не уверена:', result.doubts);
            showList('Исправлено при проверке:', result.changes);
            var back = readBack(TabEditor.score());
            if (!TabEditor.score()) throw new Error('Таб так и не читается. Посмотрите текст в поле alphaTex или распознайте ещё раз.');
            if (back.problems.length) showList('Не сходится по длине такта:', back.problems);
            var video = el('segmentEditorVideo'), hasParts = SegmentEditor.parts().length > 0;
            if (!video || !(video.currentSrc || video.src) || !hasParts) {
                status('Таб распознан и проверен (' + model + '): ' + bars(back.bars) + '. Разметьте части на видео и нажмите «Синхронизировать по звуку», затем сохраните.');
                return;
            }
            status('Шаг 3 из 3: синхронизирую с звуком видео…');
            return Promise.resolve(TabEditor.syncAudio()).then(function () {
                status('Таб распознан и проверен (' + model + ', ' + bars(back.bars) + '). Что вышло со звуком, написано ниже, под полем табов. Проверьте курсор в плеере и сохраните.');
            });
        }).catch(function (err) {
            status((err && err.message) || String(err), true);
            if (err && err.raw) showList('Ответ модели:', [String(err.raw).slice(0, 600)]);
        }).then(function () {
            busy = false;
            el('tabAiRun').disabled = false;
        });

        // The check pass: the model sees its tab read back and the parser's complaints; a second check only
        // when the tab still does not read or a bar does not add up.
        function check(score, round, doubts, changes) {
            var back = readBack(score);
            var problems = score ? back.problems : ['The alphaTex did not read: ' + (el('tabStatus').textContent || 'syntax error')];
            status('Шаг 2 из 3: модель сверяет таб со скриншотом' + (round > 1 ? ' ещё раз' : '') + '…');
            return ask({ pass: 'check', image: image, riff: riff, notes: notes, tex: tex, listing: back.text, problems: problems }).then(function (res) {
                model = res.model || model;
                var allChanges = changes.concat(res.changes || []);
                var allDoubts = res.doubts || []; // the check sees the final tab: its doubts replace the first pass's
                var next = res.tex && res.tex.trim() !== tex.trim() ? res.tex : null;
                var after = next ? TabEditor.setTex(tex = next) : Promise.resolve(score);
                return after.then(function (fixed) {
                    var still = !fixed || readBack(fixed).problems.length;
                    if (still && round < 2) return check(fixed, round + 1, allDoubts, allChanges);
                    return { doubts: allDoubts, changes: allChanges };
                });
            });
        }
    }

    function init() {
        if (!el('tabAiRun')) return;
        el('tabAiRun').addEventListener('click', function (e) { e.preventDefault(); run(); });
    }

    root.TabAI = { init: init };
})(window);
