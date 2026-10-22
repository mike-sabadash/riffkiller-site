/**
 * Admin: the riff's tab file. One Guitar Pro / MusicXML file or alphaTex text per riff;
 * each part of the markup points at its bars ("Такты в файле табов"), which the button fills in.
 * Uncompressed MusicXML is converted to Guitar Pro in the browser: XML is never stored under the web root.
 */
(function (root) {
    'use strict';

    var state = { bars: [], score: null, pending: null, readToken: 0 };
    function el(id) { return document.getElementById(id); }

    function status(text, bad) {
        var s = el('tabStatus');
        s.textContent = text || '';
        s.classList.toggle('bad', !!bad);
    }

    function pluralBars(n) {
        var m10 = n % 10, m100 = n % 100;
        return n + (m10 === 1 && m100 !== 11 ? ' такт' : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? ' такта' : ' тактов');
    }

    function describe(score) {
        var select = el('tabTrack'), keep = select.value;
        select.replaceChildren();
        score.tracks.forEach(function (t, i) {
            var o = document.createElement('option');
            o.value = String(i);
            o.textContent = (i + 1) + '. ' + (t.name || 'Дорожка');
            select.appendChild(o);
        });
        select.value = keep && Number(keep) < score.tracks.length ? keep : '0';
        var sigs = [];
        state.bars.forEach(function (b) { if (sigs.indexOf(b.ts) < 0) sigs.push(b.ts); });
        status('Прочитано: ' + pluralBars(state.bars.length) + ', размер ' + sigs.join(', ') + ', темп ' + Math.round(score.tempo) + '.');
    }

    function read(source) {
        var token = ++state.readToken;
        status('Читаю табы…');
        return TabLive.readScore(source).then(function (score) {
            if (token !== state.readToken) return null;
            state.bars = TabLive.summarize(score);
            state.score = score;
            describe(score);
            return score;
        }).catch(function (err) {
            if (token !== state.readToken) return null;
            state.bars = [];
            state.score = null;
            status('Не удалось прочитать табы: ' + (err && err.message ? err.message : err), true);
            return null;
        });
    }

    function load(riff) {
        var tab = (riff && riff.tab) || {};
        state.pending = null;
        state.bars = [];
        state.score = null;
        el('tabFile').value = tab.file || '';
        el('tabTex').value = tab.tex || '';
        el('tabFileUpload').value = '';
        el('tabTrack').replaceChildren();
        if (tab.track != null) {
            var o = document.createElement('option');
            o.value = String(tab.track);
            o.textContent = String(Number(tab.track) + 1);
            el('tabTrack').appendChild(o);
        }
        el('tabTexBox').open = !!tab.tex;
        status('');
        if (tab.tex) read({ tex: tab.tex });
        else if (tab.file) read({ file: tab.file });
    }

    function pickFile(file) {
        if (!file) return;
        var ext = (file.name.split('.').pop() || '').toLowerCase();
        file.arrayBuffer().then(function (bytes) {
            return read({ bytes: bytes }).then(function (score) {
                if (!score) return;
                if (ext === 'xml' || ext === 'musicxml') {
                    var gp = new alphaTab.exporter.Gp7Exporter().export(score);
                    state.pending = { blob: new Blob([gp], { type: 'application/octet-stream' }), ext: 'gp' };
                } else {
                    state.pending = { blob: file, ext: ext };
                }
                el('tabTex').value = '';
                el('tabFile').value = '';
                el('tabFile').placeholder = 'Загрузится при сохранении: ' + file.name;
            });
        });
    }

    function autoMap() {
        if (!state.bars.length) { status('Сначала добавьте файл табов или alphaTex.', true); return; }
        var parts = SegmentEditor.parts();
        var filled = parts.some(function (p) { return p.bars; });
        if (filled && !confirm('Такты у частей уже заполнены. Расставить заново?')) return;
        var map = TabLive.autoMap(parts, state.bars);
        SegmentEditor.setTabBars(map);
        var empty = map.filter(function (m) { return !m; }).length;
        status('Такты расставлены по ролям и длине частей. Проверьте в плеере' +
            (empty ? '; частям без роли и тем, кому не хватило тактов, укажите вручную (' + empty + ').' : '.'));
    }

    function atomStatus(text, bad) {
        var s = el('dnaTabAtomsStatus');
        s.textContent = text || '';
        s.classList.toggle('bad', !!bad);
    }

    /** Adds Riff DNA atoms for the techniques written in the tab, at their moments in the video. */
    function suggestAtoms() {
        if (!state.score) { atomStatus('Сначала добавьте табы в блоке «Табы».', true); return; }
        var parts = SegmentEditor.parts().map(function (p) { return { start: p.start, end: p.end, bars: TabLive.parseBars(p.bars), sync: p.sync }; });
        if (!parts.some(function (p) { return p.bars; })) { atomStatus('У частей не указаны такты: нажмите «Расставить такты по частям».', true); return; }
        var events = TabAtoms.extract(state.score, Number(el('tabTrack').value) || 0);
        if (!events.length) { atomStatus('В табах нет приёмов: бендов, легато, слайдов, вибрато, palm mute.', true); return; }
        var placed = TabAtoms.place(events, state.bars, parts);
        var added = TabAtoms.fresh(placed.atoms, RiffDNAEditor.list());
        added.forEach(RiffDNAEditor.add);
        if (root.segmentEditorRenderStrip) root.segmentEditorRenderStrip();
        if (added.length && root.RiffEditorDirty) root.RiffEditorDirty();
        var notes = [];
        if (placed.atoms.length - added.length) notes.push('уже в списке: ' + (placed.atoms.length - added.length));
        if (placed.unplaced) notes.push('в тактах без части: ' + placed.unplaced);
        atomStatus((added.length ? 'Добавлено приёмов: ' + added.length + '. Проверьте подписи и время, допишите подсказки.' : 'Новых приёмов нет.') +
            (notes.length ? ' Пропущено ' + notes.join(', ') + '.' : ''));
    }

    var SURE = 0.05; // pitch match above chance (see TabSync.align) below which a part is left as it is
    var later = function (fn) { return new Promise(function (resolve) { setTimeout(function () { resolve(fn()); }, 0); }); };

    /** Finds each part's bars and note times in the video's sound. */
    function syncAudio() {
        if (!state.score) { status('Сначала добавьте файл табов или alphaTex.', true); return; }
        var video = el('segmentEditorVideo'), src = video && (video.currentSrc || video.src);
        var parts = SegmentEditor.parts();
        if (!src) { status('Сначала выберите видео риффа.', true); return; }
        if (!parts.length) { status('Сначала разметьте части на видео.', true); return; }
        var button = el('tabSyncAudio'), track = Number(el('tabTrack').value) || 0, score = state.score, bars = state.bars;
        button.disabled = true;
        status('Загружаю звук видео…');
        TabSync.decode(src).then(function (samples) {
            status('Слушаю звук…');
            var t0 = Math.max(0, Math.min.apply(null, parts.map(function (p) { return p.start; })) - 1);
            var t1 = Math.max.apply(null, parts.map(function (p) { return p.end; })) + 1;
            return later(function () {
                return TabSync.features(samples.subarray(Math.floor(t0 * TabSync.RATE), Math.ceil(t1 * TabSync.RATE)), t0);
            });
        }).then(function (feat) {
            var results = [];
            return parts.reduce(function (chain, p, i) {
                return chain.then(function () {
                    status('Ищу ноты в части ' + (i + 1) + ' из ' + parts.length + '…');
                    return later(function () {
                        var r = TabSync.syncPart(score, track, bars, feat, { start: p.start, end: p.end, bars: TabLive.parseBars(p.bars) }, false);
                        results.push(r && r.contrast >= SURE ? r : null);
                    });
                });
            }, Promise.resolve()).then(function () { return results; });
        }).then(function (results) {
            SegmentEditor.setTabSync(results);
            var done = results.filter(Boolean).length, unsure = [];
            results.forEach(function (r, i) { if (!r) unsure.push(i + 1); });
            status('По звуку синхронизировано частей: ' + done + ' из ' + results.length + '.' +
                (unsure.length ? ' Не нашёл уверенно ноты в частях ' + unsure.join(', ') + ': там такты остались прежними, проверьте их.' : '') +
                ' Сохраните и проверьте курсор в плеере.', !done);
        }).catch(function (err) {
            status('Не удалось прочитать звук видео: ' + (err && err.message ? err.message : err), true);
        }).then(function () { button.disabled = false; });
    }

    /** The tab to save: uploads a picked file first. upload(blob, path) → Promise<savedPath>. */
    function collect(upload, folder) {
        var tex = el('tabTex').value.trim(), file = el('tabFile').value.trim();
        var track = el('tabTrack').value ? Number(el('tabTrack').value) : 0;
        var withTrack = function (tab) { if (track) tab.track = track; return tab; };
        if (state.pending) {
            var slug = folder.replace(/\/$/, '').split('/').pop() || 'riff';
            return upload(state.pending.blob, folder + slug + '.' + state.pending.ext).then(function (saved) {
                state.pending = null;
                return withTrack({ file: saved });
            });
        }
        if (tex) return Promise.resolve(withTrack({ tex: tex }));
        if (file) return Promise.resolve(withTrack({ file: file }));
        return Promise.resolve(null);
    }

    function init() {
        el('tabFileUpload').addEventListener('change', function () { pickFile(this.files[0]); });
        el('tabFile').addEventListener('change', function () { state.pending = null; if (this.value.trim()) read({ file: this.value.trim() }); });
        var timer = null;
        el('tabTex').addEventListener('input', function () {
            var tex = this.value.trim();
            clearTimeout(timer);
            if (!tex) return;
            state.pending = null;
            timer = setTimeout(function () { read({ tex: tex }); }, 500);
        });
        el('tabAutoMap').addEventListener('click', function (e) { e.preventDefault(); autoMap(); });
        el('tabSyncAudio').addEventListener('click', function (e) { e.preventDefault(); syncAudio(); });
        el('dnaTabAtoms').addEventListener('click', function (e) { e.preventDefault(); suggestAtoms(); });
    }

    root.TabEditor = { init: init, load: load, collect: collect, autoMap: autoMap, suggestAtoms: suggestAtoms, syncAudio: syncAudio };
})(window);
