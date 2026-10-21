/* Two cameras from one recording: the admin frames the left and the right hand on one video,
 * the server crops both in a single ffmpeg pass (api/admin/crop-video.php), so they stay in sync.
 * Also the chunked uploader for every video in the editor (PHP takes 2 MB per request). */
(function (root) {
    'use strict';
    var CHUNK = 1536 * 1024;
    var SPLIT_ASPECT = 8 / 9;   // each half of the 16:9 player in Split view
    var el = function (id) { return document.getElementById(id); };
    var opts = {}, source = null, boxes = null, aspect = 16 / 9, vw = 0, vh = 0, raf = null, uploading = null, polling = null;

    function hex(n) {
        var a = new Uint8Array(n);
        (root.crypto || root.msCrypto).getRandomValues(a);
        return Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
    }

    function upload(file, path, onProgress, state) {
        var id = hex(16), total = Math.max(1, Math.ceil(file.size / CHUNK)), index = 0;
        state = state || {};
        function send(attempt) {
            if (state.cancelled) return Promise.reject(new Error('Загрузка отменена'));
            var form = new FormData();
            form.append('uploadId', id);
            form.append('index', index);
            form.append('total', total);
            form.append('path', path);
            form.append('chunk', file.slice(index * CHUNK, (index + 1) * CHUNK), 'chunk');
            return fetch('/api/admin/upload-chunk.php', { method: 'POST', body: form })
                .then(function (r) { return r.json().then(function (d) { if (!r.ok || !d.success) throw new Error(d.error || ('HTTP ' + r.status)); return d; }); })
                .catch(function (err) {
                    if (attempt < 3 && !/order|Invalid|Admin/.test(err.message)) return new Promise(function (res) { setTimeout(res, 800 * (attempt + 1)); }).then(function () { return send(attempt + 1); });
                    throw err;
                })
                .then(function (d) {
                    index++;
                    if (onProgress) onProgress(index / total);
                    return d.done ? d.path : send(0);
                });
        }
        return send(0);
    }

    function fmt(t) { t = Math.max(0, t || 0); var m = Math.floor(t / 60), s = t - m * 60; return m + ':' + (s < 10 ? '0' : '') + s.toFixed(2); }
    function status(text, isError) { var s = el('cutStatus'); s.textContent = text; s.classList.toggle('err', !!isError); }

    // ----- Geometry: source pixels <-> stage pixels (video is letterboxed with object-fit: contain) -----
    function view() {
        var r = el('cutStage').getBoundingClientRect();
        var scale = Math.min(r.width / vw, r.height / vh);
        return { left: r.left, top: r.top, scale: scale, ox: (r.width - vw * scale) / 2, oy: (r.height - vh * scale) / 2, w: r.width, h: r.height };
    }

    function defaults() {
        var w = Math.round(vw / 2), h = Math.round(Math.min(vh, w / aspect || vh));
        if (aspect && h === vh) w = Math.round(h * aspect);
        var y = Math.round((vh - h) / 2);
        return { left: { x: 0, y: y, w: w, h: h }, right: { x: vw - w, y: y, w: w, h: h } };
    }

    function clamp(b) {
        b.w = Math.max(32, Math.min(b.w, vw));
        b.h = Math.max(32, Math.min(b.h, vh));
        b.x = Math.max(0, Math.min(b.x, vw - b.w));
        b.y = Math.max(0, Math.min(b.y, vh - b.h));
        return b;
    }

    function draw() {
        if (!vw) return;
        var v = view(), shade = 'M0 0H' + v.w + 'V' + v.h + 'H0Z';
        ['left', 'right'].forEach(function (side) {
            var b = boxes[side], f = document.querySelector('.cut-frame.' + side);
            var x = v.ox + b.x * v.scale, y = v.oy + b.y * v.scale, w = b.w * v.scale, h = b.h * v.scale;
            f.style.left = x + 'px'; f.style.top = y + 'px'; f.style.width = w + 'px'; f.style.height = h + 'px';
            var guide = f.querySelector('.split-guide'), gw = h * SPLIT_ASPECT;
            guide.style.display = gw < w - 2 ? '' : 'none';
            guide.style.left = (w - gw) / 2 - 2 + 'px'; guide.style.width = gw + 'px';
            shade += 'M' + x + ' ' + y + 'h' + w + 'v' + h + 'h' + (-w) + 'Z';
            el(side === 'left' ? 'cutSizeLeft' : 'cutSizeRight').textContent = Math.round(b.w) + '×' + Math.round(b.h) + ' px' + (b.h < 360 ? ' · мало пикселей' : '');
        });
        el('cutShade').innerHTML = '<path d="' + shade + '" fill="rgba(0,0,0,0.55)" fill-rule="evenodd"/>';
    }

    function paint() {
        var video = el('cutVideo');
        if (video.readyState >= 2 && boxes) {
            [['left', 'cutPrevLeft'], ['right', 'cutPrevRight']].forEach(function (p) {
                var b = boxes[p[0]], c = el(p[1]), ctx = c.getContext('2d');
                var cw = 320, ch = Math.round(320 * b.h / b.w);
                if (c.width !== cw || c.height !== ch) { c.width = cw; c.height = ch; c.style.aspectRatio = cw + ' / ' + ch; }
                ctx.drawImage(video, b.x, b.y, b.w, b.h, 0, 0, cw, ch);
            });
            el('cutTime').textContent = fmt(video.currentTime);
            if (!el('cutSeek').matches(':active')) el('cutSeek').value = video.currentTime;
        }
        raf = el('cutter').open ? requestAnimationFrame(paint) : null;
    }

    // ----- Dragging frames -----
    var drag = null;
    function onDown(e) {
        var frame = e.target.closest('.cut-frame');
        if (!frame || !boxes) return;
        e.preventDefault();
        var side = frame.dataset.side, handle = e.target.closest('.cut-handle');
        drag = { side: side, handle: handle ? handle.dataset.h : null, x: e.clientX, y: e.clientY, start: Object.assign({}, boxes[side]) };
        el('cutStage').setPointerCapture(e.pointerId);
    }
    function onMove(e) {
        if (!drag) return;
        var v = view(), dx = (e.clientX - drag.x) / v.scale, dy = (e.clientY - drag.y) / v.scale, s = drag.start, b;
        if (!drag.handle) {
            b = clamp({ x: s.x + dx, y: s.y + dy, w: s.w, h: s.h });
        } else {
            var h = drag.handle, west = h.indexOf('w') >= 0, north = h.indexOf('n') >= 0;
            // The opposite corner stays where it is.
            var ax = west ? s.x + s.w : s.x, ay = north ? s.y + s.h : s.y;
            var w = Math.max(32, west ? s.w - dx : s.w + dx), hh = Math.max(32, north ? s.h - dy : s.h + dy);
            var maxW = west ? ax : vw - ax, maxH = north ? ay : vh - ay;
            if (aspect) {
                w = Math.min(w, maxW, maxH * aspect);
                hh = w / aspect;
            } else {
                w = Math.min(w, maxW); hh = Math.min(hh, maxH);
            }
            b = { x: west ? ax - w : ax, y: north ? ay - hh : ay, w: w, h: hh };
        }
        boxes[drag.side] = b;
        draw();
    }
    function onUp() { drag = null; }

    function setAspect(a) {
        aspect = a;
        document.querySelectorAll('.cut-seg button').forEach(function (b) { b.classList.toggle('on', Number(b.dataset.aspect) === a); });
        document.querySelectorAll('.cut-frame').forEach(function (f) { f.classList.toggle('free', !a); });
        if (a && boxes) ['left', 'right'].forEach(function (side) {
            var b = boxes[side], cx = b.x + b.w / 2, cy = b.y + b.h / 2;
            var h = Math.min(b.h, vh, vw / a), w = h * a;
            boxes[side] = clamp({ x: cx - w / 2, y: cy - h / 2, w: w, h: h });
        });
        draw();
    }

    // ----- Source -----
    function showWork(on) { el('cutDrop').hidden = on; el('cutWork').hidden = !on; }

    function openSource(src, path, savedBoxes) {
        var video = el('cutVideo');
        source = path || null;
        showWork(true);
        el('cutSourceName').textContent = path ? 'Исходник: ' + path : 'Исходник загружается…';
        vw = 0;
        video.src = src;
        video.onloadedmetadata = function () {
            vw = video.videoWidth; vh = video.videoHeight;
            el('cutSeek').max = video.duration || 1;
            var bothFit = savedBoxes && ['left', 'right'].every(function (s) { var b = savedBoxes[s]; return b && b.x + b.w <= vw + 1 && b.y + b.h <= vh + 1; });
            boxes = bothFit ? { left: Object.assign({}, savedBoxes.left), right: Object.assign({}, savedBoxes.right) } : defaults();
            if (bothFit) setAspect(Math.abs(boxes.left.w / boxes.left.h - 16 / 9) < 0.02 ? 16 / 9 : 0); else draw();
            video.currentTime = Math.min(1, (video.duration || 2) / 2);
            refreshRun();
        };
        video.onerror = function () { status('Видео не открывается в браузере. Нужен MP4 (H.264) или MOV.', true); showWork(false); };
    }

    function fromFile(file) {
        if (!file) return;
        var ext = (file.name.split('.').pop() || 'mp4').toLowerCase();
        if (['mp4', 'mov', 'm4v', 'webm'].indexOf(ext) < 0) { status('Нужен файл .mp4, .mov, .m4v или .webm', true); return; }
        var path = opts.base() + slug(opts.song()) + '-source.' + ext;
        openSource(URL.createObjectURL(file), null, null);
        var bar = el('cutUploadBar');
        el('cutWork').appendChild(bar);
        bar.hidden = false;
        status('Загружаю исходник на сервер… Рамки можно ставить уже сейчас.');
        uploading = { cancelled: false };
        var state = uploading;
        upload(file, path, function (p) { bar.firstElementChild.style.width = Math.round(p * 100) + '%'; status('Загружаю исходник… ' + Math.round(p * 100) + '%'); }, state)
            .then(function (saved) {
                if (state.cancelled) return;
                source = saved; uploading = null; bar.hidden = true;
                el('cutSourceName').textContent = 'Исходник: ' + saved;
                status('Исходник загружен. Поставьте рамки и нажмите «Нарезать два видео».');
                refreshRun();
            })
            .catch(function (err) { if (!state.cancelled) { uploading = null; bar.hidden = true; status('Не загрузилось: ' + err.message, true); } });
    }

    function slug(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'riff'; }

    function refreshRun() { el('cutRun').disabled = !(source && boxes && vw && !polling); }

    function run() {
        var payload = { source: source, song: opts.song(), left: round(boxes.left), right: round(boxes.right) };
        polling = true; refreshRun();
        status('Нарезаю… 0%');
        fetch('/api/admin/crop-video.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
            .then(function (r) { return r.json(); })
            .then(function (d) {
                if (!d.success) throw new Error(d.error || 'Сервер не принял задачу');
                return new Promise(function (resolve, reject) {
                    (function poll() {
                        fetch('/api/admin/crop-video.php?job=' + d.job, { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (s) {
                            if (s.state === 'running') { status('Нарезаю… ' + Math.round((s.progress || 0) * 100) + '%'); setTimeout(poll, 700); }
                            else if (s.state === 'done') resolve(s.outputs);
                            else reject(new Error(s.error || 'Ошибка нарезки'));
                        }).catch(reject);
                    })();
                });
            })
            .then(function (outputs) {
                polling = null;
                status('');
                opts.done({ left: outputs.left, right: outputs.right, source: source, boxes: payload });
                close();
            })
            .catch(function (err) { polling = null; refreshRun(); status(err.message, true); });
    }
    function round(b) { return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h) }; }

    function open() {
        if (opts.ready && !opts.ready()) return;
        status('');
        var dlg = el('cutter');
        dlg.showModal();
        var current = opts.current && opts.current();
        if (current && current.file && !source) {
            el('cutPath').value = current.file;
            openSource('../video.php?file=' + encodeURIComponent(current.file), current.file, current);
        } else if (!source) showWork(false);
        if (!raf) raf = requestAnimationFrame(paint);
        setTimeout(draw, 0);
    }
    function close() {
        var dlg = el('cutter');
        if (uploading && !confirm('Исходник ещё загружается. Прервать загрузку?')) return;
        if (uploading) { uploading.cancelled = true; uploading = null; source = null; el('cutUploadBar').hidden = true; }
        el('cutVideo').pause();
        if (dlg.open) dlg.close();
    }

    function init(o) {
        opts = o || {};
        el('openCutter').addEventListener('click', open);
        el('cutClose').addEventListener('click', close);
        el('cutCancel').addEventListener('click', close);
        el('cutter').addEventListener('cancel', function (e) { e.preventDefault(); close(); });
        el('cutRun').addEventListener('click', run);
        el('cutSwap').addEventListener('click', function () { if (boxes) { boxes = { left: boxes.right, right: boxes.left }; draw(); } });
        el('cutFile').addEventListener('change', function () { fromFile(this.files[0]); this.value = ''; });
        el('cutPathOpen').addEventListener('click', function () {
            var p = el('cutPath').value.trim().replace(/^\//, '');
            if (!/^assets\/video\/.+\.(mp4|mov|m4v|webm)$/i.test(p)) { status('Путь должен начинаться с assets/video/ и заканчиваться на .mp4 или .mov', true); return; }
            status('');
            openSource('../video.php?file=' + encodeURIComponent(p), p, null);
        });
        var drop = el('cutDrop');
        drop.addEventListener('dragover', function (e) { e.preventDefault(); drop.classList.add('over'); });
        drop.addEventListener('dragleave', function () { drop.classList.remove('over'); });
        drop.addEventListener('drop', function (e) { e.preventDefault(); drop.classList.remove('over'); fromFile(e.dataTransfer.files[0]); });
        var stage = el('cutStage');
        stage.addEventListener('pointerdown', onDown);
        stage.addEventListener('pointermove', onMove);
        stage.addEventListener('pointerup', onUp);
        stage.addEventListener('pointercancel', onUp);
        document.querySelectorAll('.cut-seg button').forEach(function (b) { b.addEventListener('click', function () { setAspect(Number(b.dataset.aspect)); }); });
        var video = el('cutVideo');
        el('cutPlay').addEventListener('click', function () { if (video.paused) video.play().catch(function () {}); else video.pause(); });
        video.addEventListener('play', function () { el('cutPlay').textContent = 'Пауза'; });
        video.addEventListener('pause', function () { el('cutPlay').textContent = 'Play'; });
        el('cutSeek').addEventListener('input', function () { video.currentTime = Number(this.value); });
        window.addEventListener('resize', function () { if (el('cutter').open) draw(); });
    }

    root.RiffCutter = { init: init, upload: upload, open: open };
})(window);
