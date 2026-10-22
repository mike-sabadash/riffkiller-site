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
        var beats = bar.beats || [];
        if (!beats.length) return { bar: i, beat: -1, x: bar.x0 + (bar.x1 - bar.x0) * tick / (bar.ticks || 1) };
        var k = 0;
        while (k < beats.length - 1 && beats[k + 1].start <= tick) k++;
        var from = beats[k], nextStart = k + 1 < beats.length ? beats[k + 1].start : bar.ticks;
        var nextX = k + 1 < beats.length ? beats[k + 1].x : bar.x1;
        if (tick < from.start) return { bar: i, beat: -1, x: bar.x0 + (from.x - bar.x0) * tick / (from.start || 1) };
        var f = nextStart > from.start ? (tick - from.start) / (nextStart - from.start) : 0;
        return { bar: i, beat: k, x: from.x + (nextX - from.x) * f };
    }

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
            var at = cursorAt(layout, seg.start, seg.end, time);
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
        hasTab: hasTab, create: create, readScore: readScore, summarize: summarize
    };
})(typeof window !== 'undefined' ? window : this);
