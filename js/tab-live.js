/**
 * Live tab: renders a riff's tab file (Guitar Pro, MusicXML or alphaTex) with alphaTab as a horizontal
 * strip and moves a cursor in step with the video.
 *
 * Data: riff.tab = { file: 'assets/tabs/.../riff.gp' } or { tex: '...alphaTex...' }, optional track (0-based).
 *       segment.tabBars = [from, to], 1-based bar numbers of the file the shot plays.
 * The video is a set of shots, not one take, so each shot is mapped to its own bars and the bars'
 * musical length is stretched over the shot's length in the video.
 */
(function (global) {
    'use strict';

    var QUARTER = 960; // alphaTab ticks per quarter note
    // Paths are resolved from this script, so the admin (one folder down) loads the same files.
    var script = typeof document !== 'undefined' && document.currentScript;
    var BASE = script && script.src ? script.src.replace(/js\/tab-live\.js.*$/, '') : '';
    var LIB = BASE + 'js/vendor/alphatab/alphaTab.min.js?v=1.6.3';
    var FONTS = BASE + 'js/vendor/alphatab/font/';

    // ---- Timing (pure, unit-tested) ----

    /** Length of every master bar in milliseconds, carrying tempo changes forward. */
    function barDurations(masterBars, scoreTempo) {
        var bpm = scoreTempo || 120;
        return masterBars.map(function (mb) {
            var auto = mb.tempoAutomations && mb.tempoAutomations.length ? mb.tempoAutomations[0] : mb.tempoAutomation;
            if (auto && auto.value > 0) bpm = auto.value;
            var ticks = typeof mb.calculateDuration === 'function' ? mb.calculateDuration() : mb.ticks;
            return { ticks: ticks, ms: ticks / QUARTER * 60000 / bpm };
        });
    }

    /**
     * Where the cursor is at video time t inside a shot.
     * bars: [{ ticks, ms, x0, x1, beats: [{ start, x }] }] for the shot's bars in order.
     * Returns { bar, beat, x } with bar/beat as indices into the arrays given.
     */
    function cursorAt(bars, segStart, segEnd, t) {
        if (!bars.length) return null;
        var total = bars.reduce(function (s, b) { return s + b.ms; }, 0);
        var span = Math.max(0.001, segEnd - segStart);
        var ms = Math.min(1, Math.max(0, (t - segStart) / span)) * total;
        var i = 0;
        while (i < bars.length - 1 && ms >= bars[i].ms) { ms -= bars[i].ms; i++; }
        var bar = bars[i];
        var tick = Math.min(bar.ticks, (bar.ms ? ms / bar.ms : 0) * bar.ticks);
        var beat = beatAt(bar, tick);
        return { bar: i, beat: beat.k, x: beat.x };
    }

    // Cursor x at a tick inside a laid-out bar: between the beats around it.
    function beatAt(bar, tick) {
        var beats = bar.beats || [];
        if (!beats.length) return { k: -1, x: bar.x0 + (bar.x1 - bar.x0) * tick / (bar.ticks || 1) };
        var k = 0;
        while (k < beats.length - 1 && beats[k + 1].start <= tick) k++;
        var from = beats[k], nextStart = k + 1 < beats.length ? beats[k + 1].start : bar.ticks;
        var nextX = k + 1 < beats.length ? beats[k + 1].x : bar.x1;
        if (tick < from.start) return { k: -1, x: bar.x0 + (from.x - bar.x0) * tick / (from.start || 1) };
        var f = nextStart > from.start ? (tick - from.start) / (nextStart - from.start) : 0;
        return { k: k, x: from.x + (nextX - from.x) * f };
    }

    function xAtTick(bar, tick) { return beatAt(bar, tick).x; }

    /**
     * Suggests bars for every shot. Shots with the same role play the same bars; a new role takes the next
     * bars of the file, as many as best fill the shot's length. Practice-only shots (no role) stay empty.
     * segments: [{ start, end, role }], bars: [{ ms }]. Returns [[from, to] | null], 1-based.
     */
    function autoMap(segments, bars) {
        var next = 0, byRole = {};
        return segments.map(function (s) {
            if (!s.role) return null;
            if (byRole[s.role]) return byRole[s.role].slice();
            if (next >= bars.length) return null;
            var want = Math.max(0, s.end - s.start) * 1000, sum = 0, best = next, bestErr = Infinity;
            for (var k = next; k < bars.length; k++) {
                sum += bars[k].ms;
                var err = Math.abs(sum - want);
                if (err < bestErr) { bestErr = err; best = k; }
                if (sum > want) break;
            }
            byRole[s.role] = [next + 1, best + 1];
            next = best + 1;
            return byRole[s.role].slice();
        });
    }

    /** "1-2", "3", "1–2" → [from, to]; empty or invalid → null. */
    function parseBars(text) {
        var m = String(text || '').trim().match(/^(\d+)\s*(?:[-–—]\s*(\d+))?$/);
        if (!m) return null;
        var from = Number(m[1]), to = m[2] ? Number(m[2]) : from;
        return from >= 1 && to >= from ? [from, to] : null;
    }

    function formatBars(range) {
        return Array.isArray(range) && range.length ? (range[0] === range[1] || range[1] == null ? String(range[0]) : range[0] + '–' + range[1]) : '';
    }

    /** Bar list of a loaded score for the admin: length and time signature of every bar. */
    function summarize(score) {
        return barDurations(score.masterBars, score.tempo).map(function (d, i) {
            var mb = score.masterBars[i];
            return { ms: d.ms, ticks: d.ticks, ts: mb.timeSignatureNumerator + '/' + mb.timeSignatureDenominator };
        });
    }

    /** Reads a tab without drawing it: { tex } or { bytes } or { file } (site path). */
    function readScore(source) {
        return loadLib().then(function (at) {
            if (source.tex) return at.importer.ScoreLoader.loadAlphaTex(source.tex);
            var bytes = source.bytes ? Promise.resolve(source.bytes) : fetch(BASE + source.file).then(function (r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.arrayBuffer();
            });
            return bytes.then(function (b) { return at.importer.ScoreLoader.loadScoreFromBytes(new Uint8Array(b)); });
        });
    }

    /** Bars of a shot: its own tabBars, clamped to the file. */
    function barsOf(segment, barCount) {
        var r = segment && segment.tabBars;
        if (!Array.isArray(r) || r.length < 1) return null;
        var from = Math.max(1, Math.min(barCount, Math.round(Number(r[0]) || 1)));
        var to = Math.max(from, Math.min(barCount, Math.round(Number(r[1] != null ? r[1] : r[0]) || from)));
        return { from: from, to: to };
    }

    // ---- Shots synced to the sound (segment.tabSync, written by js/tab-sync.js in the admin) ----

    /**
     * Where the music is at video time t for a part synced to the sound.
     * anchors: [[bar, tick, seconds]]; layout: [{ ticks }] for bars from..; returns { bar: index into layout, tick }.
     * Before the first note the cursor runs from the part start, after the last note to the end of the bars.
     */
    function positionAt(anchors, from, layout, segStart, segEnd, t) {
        if (!anchors || !anchors.length || !layout.length) return null;
        var startOf = [], acc = 0;
        layout.forEach(function (b) { startOf.push(acc); acc += b.ticks; });
        var pos = function (a) { var i = a[0] - from; return i >= 0 && i < layout.length ? startOf[i] + a[1] : null; };
        var pts = [[segStart, 0]];
        anchors.forEach(function (a) {
            var p = pos(a);
            if (p == null || a[2] <= pts[pts.length - 1][0] || p < pts[pts.length - 1][1]) return;
            pts.push([a[2], p]);
        });
        if (segEnd > pts[pts.length - 1][0]) pts.push([segEnd, acc]);
        var at;
        if (t <= pts[0][0]) at = 0;
        else if (t >= pts[pts.length - 1][0]) at = pts[pts.length - 1][1];
        else {
            var k = 0;
            while (k < pts.length - 2 && pts[k + 1][0] <= t) k++;
            var p0 = pts[k], p1 = pts[k + 1];
            at = p0[1] + (p1[1] - p0[1]) * (t - p0[0]) / (p1[0] - p0[0]);
        }
        at = Math.min(acc, Math.max(0, at));
        var bar = 0;
        while (bar < layout.length - 1 && at >= startOf[bar + 1]) bar++;
        return { bar: bar, tick: at - startOf[bar] };
    }

    /** Video time of a bar/tick in a synced part (inverse of positionAt between anchors), or null. */
    function timeOf(anchors, bar, tick) {
        if (!anchors || !anchors.length) return null;
        var key = function (a) { return a[0] * 1e6 + a[1]; }, want = bar * 1e6 + tick;
        for (var i = 0; i < anchors.length; i++) {
            if (key(anchors[i]) === want) return anchors[i][2];
            if (key(anchors[i]) > want) {
                if (!i) return anchors[0][2];
                var a = anchors[i - 1], b = anchors[i];
                // Same bar: ticks are proportional; across bars use the order only.
                var f = a[0] === b[0] ? (tick - a[1]) / ((b[1] - a[1]) || 1) : 0.5;
                return Math.round((a[2] + (b[2] - a[2]) * f) * 100) / 100;
            }
        }
        return anchors[anchors.length - 1][2];
    }

    /** A shot's sync anchors when they still fit its bars and its place in the video, otherwise null. */
    function syncOf(segment) {
        var a = segment && segment.tabSync, r = segment && segment.tabBars;
        if (!Array.isArray(a) || !a.length || !Array.isArray(r)) return null;
        var from = r[0], to = r[1] != null ? r[1] : r[0];
        var ok = a.every(function (x) {
            return Array.isArray(x) && x[0] >= from && x[0] <= to && x[2] >= segment.start - 0.3 && x[2] <= segment.end + 0.3;
        });
        return ok ? a : null;
    }

    // ---- Browser part ----

    var libPromise = null;
    function loadLib() {
        if (global.alphaTab && global.alphaTab.AlphaTabApi) return Promise.resolve(global.alphaTab);
        if (libPromise) return libPromise;
        libPromise = new Promise(function (resolve, reject) {
            var s = document.createElement('script');
            s.src = LIB;
            s.onload = function () { global.alphaTab ? resolve(global.alphaTab) : reject(new Error('alphaTab missing')); };
            s.onerror = function () { libPromise = null; reject(new Error('alphaTab failed to load')); };
            document.head.appendChild(s);
        });
        return libPromise;
    }

    function hasTab(riff) {
        return !!(riff && riff.tab && (riff.tab.file || riff.tab.tex) &&
            (riff.segments || []).some(function (s) { return Array.isArray(s.tabBars); }));
    }

    /**
     * Creates the live strip inside host. Returns a controller:
     *   showSegment(index) - render that shot's bars (false when the shot has no bars)
     *   update(time)       - move the cursor to video time
     */
    function create(host, riff) {
        var api = null, score = null, durations = [], current = -1, fitted = -1, layout = [], ready = null;
        var canvas = document.createElement('div');
        canvas.className = 'tab-live-score';
        var cursor = document.createElement('div');
        cursor.className = 'tab-live-cursor';
        host.appendChild(canvas);
        host.appendChild(cursor);

        ready = loadLib().then(function (at) {
            var track = Number(riff.tab.track) || 0;
            api = new at.AlphaTabApi(canvas, {
                core: { fontDirectory: FONTS, useWorkers: false, engine: 'svg', enableLazyLoading: false, tracks: [track] },
                display: {
                    layoutMode: at.LayoutMode.Horizontal,
                    staveProfile: at.StaveProfile.Tab,
                    scale: 1,
                    padding: [8, 4, 8, 4],
                    firstSystemPaddingTop: 0,
                    systemPaddingTop: 0,
                    startBar: 1,
                    barCount: 1,
                    resources: {
                        mainGlyphColor: '#F4F4F6',
                        secondaryGlyphColor: 'rgba(244,244,246,0.55)',
                        staffLineColor: 'rgba(244,244,246,0.32)',
                        barSeparatorColor: 'rgba(244,244,246,0.45)',
                        barNumberColor: 'rgba(244,244,246,0.45)',
                        scoreInfoColor: '#F4F4F6'
                    }
                },
                notation: { elements: { effectTempo: false, effectDynamics: false, scoreTitle: false, scoreSubTitle: false, scoreArtist: false } },
                player: { playerMode: at.PlayerMode.Disabled }
            });
            return new Promise(function (resolve, reject) {
                api.scoreLoaded.on(function (s) {
                    score = s;
                    durations = barDurations(s.masterBars, s.tempo);
                    resolve();
                });
                api.error.on(function (e) { reject(e); });
                api.renderFinished.on(measure);
                if (riff.tab.tex) api.tex(riff.tab.tex, [track]);
                else api.load(BASE + riff.tab.file, [track]);
            });
        });

        function trackStaff() {
            var t = score && score.tracks[Number(riff.tab.track) || 0];
            return t && t.staves[0];
        }

        function measure() {
            var range = barsOf(riff.segments[current], durations.length);
            var staff = trackStaff(), lookup = api && api.renderer && api.renderer.boundsLookup;
            layout = [];
            if (!range || !staff || !lookup) return;
            for (var n = range.from; n <= range.to; n++) {
                var bar = staff.bars[n - 1];
                var mbb = lookup.findMasterBarByIndex(n - 1);
                if (!bar || !mbb) continue;
                var beats = [];
                (bar.voices[0] ? bar.voices[0].beats : []).forEach(function (beat) {
                    var b = lookup.findBeat(beat);
                    if (b) beats.push({ start: beat.playbackStart, x: b.onNotesX || b.visualBounds.x });
                });
                layout.push({
                    ticks: durations[n - 1].ticks, ms: durations[n - 1].ms, beats: beats,
                    x0: mbb.realBounds.x, x1: mbb.realBounds.x + mbb.realBounds.w
                });
            }
            host.classList.toggle('is-ready', layout.length > 0);
            fitWidth();
        }

        // A shot shows one or two bars: scale them to fill the strip so fret numbers stay readable on phones.
        function fitWidth() {
            if (!layout.length || fitted === current) return;
            fitted = current;
            var system = api.renderer.boundsLookup.staffSystems[0];
            var width = host.clientWidth, used = layout[layout.length - 1].x1;
            var tall = system ? system.realBounds.y + system.realBounds.h : canvas.offsetHeight;
            if (!width || !used) return;
            var s = api.settings.display.scale;
            var maxHeight = parseFloat(getComputedStyle(host).getPropertyValue('--tab-live-max-h')) || 160;
            var scale = Math.max(0.8, Math.min(2.2, s * (width - 8) / used, tall ? s * maxHeight / tall : 2.2));
            if (Math.abs(scale - api.settings.display.scale) < 0.05) return;
            api.settings.display.scale = scale;
            api.updateSettings();
            api.render();
        }

        function showSegment(index) {
            return ready.then(function () {
                var range = barsOf(riff.segments[index], durations.length);
                if (!range) { current = index; layout = []; host.classList.remove('is-ready'); return false; }
                if (index === current && layout.length) return true;
                current = index;
                api.settings.display.startBar = range.from;
                api.settings.display.barCount = range.to - range.from + 1;
                api.updateSettings();
                api.render();
                return true;
            });
        }

        function update(time) {
            var seg = riff.segments[current];
            if (!seg || !layout.length) return;
            var sync = syncOf(seg), at;
            if (sync) {
                var p = positionAt(sync, barsOf(seg, durations.length).from, layout, seg.start, seg.end, time);
                at = p && { x: xAtTick(layout[p.bar], p.tick) };
            } else {
                at = cursorAt(layout, seg.start, seg.end, time);
            }
            if (at) cursor.style.transform = 'translateX(' + at.x.toFixed(1) + 'px)';
        }

        function destroy() {
            if (api) api.destroy();
            host.innerHTML = '';
        }

        return { ready: ready, showSegment: showSegment, update: update, destroy: destroy };
    }

    global.TabLive = {
        barDurations: barDurations, cursorAt: cursorAt, barsOf: barsOf, autoMap: autoMap, parseBars: parseBars, formatBars: formatBars,
        hasTab: hasTab, create: create, readScore: readScore, summarize: summarize,
        positionAt: positionAt, timeOf: timeOf, syncOf: syncOf, xAtTick: xAtTick
    };
})(typeof window !== 'undefined' ? window : this);
