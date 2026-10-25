/**
 * Student progress: parts of a riff, practice days and the weekly goal. Pure rules plus a small store.
 *
 * A part (one segment of the riff) goes new → working → at tempo → locked in:
 *   working   — looped at least once; `best` is the fastest speed the student said they played cleanly;
 *   at tempo  — the student said “clean” at ×1 (Speed Trainer asks after three loops at full speed);
 *   locked in — said “clean” at ×1 again on a review, 3 days later. Next reviews come after 10 and 30 days.
 * A riff is learned when every part is at tempo and the whole riff was played cleanly at ×1 once.
 * A practice day is 5 minutes of the video actually playing. The weekly goal is 3, 5 or 7 such days.
 *
 * Parts are stored with their bounds, not only their number, so progress follows a part when the admin
 * retrims or adds parts (matched by overlap).
 */
(function (global) {
    'use strict';

    var KEY = 'rkProgressV2';
    var DAY = 86400000;
    var REVIEW_DAYS = [3, 10, 30];
    var DAY_SECONDS = 300;
    var GOALS = [3, 5, 7];
    var LEARNED_IN_RIFFS = 3;

    function empty() {
        return { v: 2, goal: 0, goalAt: 0, days: {}, riffs: {}, updatedAt: 0 };
    }

    function num(x) { x = Number(x); return isFinite(x) && x > 0 ? x : 0; }

    function pad(n) { return n < 10 ? '0' + n : String(n); }
    /** Local calendar day, so a late-evening session counts for the day the student sees. */
    function dayKey(ts) {
        var d = new Date(ts);
        return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    }
    function dayStart(ts) { var d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); }
    /** Monday 00:00 of the week that holds ts. */
    function weekStart(ts) {
        var d = new Date(dayStart(ts));
        var back = (d.getDay() + 6) % 7;
        d.setDate(d.getDate() - back);
        return d.getTime();
    }
    function addDays(ts, n) { var d = new Date(ts); d.setDate(d.getDate() + n); return d.getTime(); }

    function cleanPart(p) {
        p = p && typeof p === 'object' ? p : {};
        var a = Number(p.a), b = Number(p.b);
        return {
            a: isFinite(a) ? a : 0,
            b: isFinite(b) && b > a ? b : (isFinite(a) ? a : 0),
            best: Math.min(1, num(p.best)),
            loops: Math.floor(num(p.loops)),
            tempoAt: num(p.tempoAt),
            reviews: Math.min(REVIEW_DAYS.length, Math.floor(num(p.reviews))),
            nextReview: num(p.nextReview),
            lastAt: num(p.lastAt)
        };
    }

    /** Accepts anything (old browser data, a server answer) and returns a valid state. */
    function normalize(s) {
        var out = empty();
        if (!s || typeof s !== 'object') return out;
        out.goal = GOALS.indexOf(Number(s.goal)) >= 0 ? Number(s.goal) : 0;
        out.goalAt = num(s.goalAt);
        out.updatedAt = num(s.updatedAt);
        if (s.days && typeof s.days === 'object') {
            Object.keys(s.days).forEach(function (k) {
                if (!/^\d{4}-\d\d-\d\d$/.test(k)) return;
                var d = s.days[k] || {};
                var riffs = {};
                if (d.riffs && typeof d.riffs === 'object') Object.keys(d.riffs).forEach(function (id) { riffs[id] = 1; });
                out.days[k] = { sec: Math.round(num(d.sec)), riffs: riffs };
            });
        }
        if (s.riffs && typeof s.riffs === 'object') {
            Object.keys(s.riffs).forEach(function (id) {
                var r = s.riffs[id] || {};
                out.riffs[id] = {
                    parts: Array.isArray(r.parts) ? r.parts.map(cleanPart) : [],
                    wholeAt: num(r.wholeAt),
                    lastAt: num(r.lastAt)
                };
            });
        }
        return out;
    }

    function riffState(state, riffId) {
        var id = String(riffId);
        if (!state.riffs[id]) state.riffs[id] = { parts: [], wholeAt: 0, lastAt: 0 };
        return state.riffs[id];
    }

    function bounds(seg) {
        var a = Number(seg && seg.start) || 0, b = Number(seg && seg.end) || 0;
        return [a, b > a ? b : a];
    }

    function overlap(p, a, b) {
        var len = Math.min(p.b - p.a, b - a);
        if (len <= 0) return p.a === a ? 1 : 0;
        return Math.max(0, Math.min(p.b, b) - Math.max(p.a, a)) / len;
    }

    /** The stored record for each current segment (or null), matched by how much the bounds overlap. */
    function align(r, segments) {
        var taken = [];
        return (segments || []).map(function (seg) {
            var ab = bounds(seg), best = -1, score = 0;
            r.parts.forEach(function (p, i) {
                if (taken.indexOf(i) >= 0) return;
                var o = overlap(p, ab[0], ab[1]);
                if (o >= 0.5 && o > score) { score = o; best = i; }
            });
            if (best < 0) return null;
            taken.push(best);
            return r.parts[best];
        });
    }

    function partRecord(state, riffId, segments, index) {
        var r = riffState(state, riffId);
        var rec = align(r, segments)[index];
        var ab = bounds(segments[index]);
        if (!rec) {
            rec = cleanPart({ a: ab[0], b: ab[1] });
            r.parts.push(rec);
        } else {
            rec.a = ab[0];
            rec.b = ab[1];
        }
        return rec;
    }

    function touch(state, riffId, now) {
        riffState(state, riffId).lastAt = now;
        state.updatedAt = now;
    }

    /** One full loop of a part (any speed, any mode). */
    function recordLoop(state, riffId, segments, index, now) {
        if (!segments || !segments[index]) return null;
        var rec = partRecord(state, riffId, segments, index);
        rec.loops += 1;
        rec.lastAt = now;
        touch(state, riffId, now);
        return rec;
    }

    function partStatus(rec, now) {
        if (!rec || (!rec.loops && !rec.best && !rec.tempoAt)) return { key: 'new', best: 0, due: false };
        var due = !!(rec.tempoAt && rec.nextReview && rec.nextReview <= now);
        if (rec.tempoAt && rec.reviews > 0) return { key: 'locked', best: 1, due: due };
        if (rec.tempoAt) return { key: 'tempo', best: 1, due: due };
        return { key: 'working', best: rec.best, due: false };
    }

    /**
     * The student said the part was clean at this speed. At ×1 the part reaches tempo, or passes its review.
     * Returns what changed: { before, after } statuses.
     */
    function markClean(state, riffId, segments, index, speed, now) {
        if (!segments || !segments[index]) return null;
        var rec = partRecord(state, riffId, segments, index);
        var before = partStatus(rec, now);
        speed = Math.min(1, num(speed));
        if (speed > rec.best) rec.best = speed;
        if (speed >= 1) {
            if (!rec.tempoAt) {
                rec.tempoAt = now;
                rec.nextReview = addDays(dayStart(now), REVIEW_DAYS[0]);
            } else if (rec.nextReview && rec.nextReview <= now) {
                rec.reviews = Math.min(REVIEW_DAYS.length, rec.reviews + 1);
                rec.nextReview = rec.reviews >= REVIEW_DAYS.length ? 0 : addDays(dayStart(now), REVIEW_DAYS[rec.reviews]);
            }
        }
        rec.lastAt = now;
        touch(state, riffId, now);
        return { before: before, after: partStatus(rec, now) };
    }

    /** “Not yet” on a review: the part stays at tempo and asks again in 3 days. Nothing is taken away twice. */
    function reviewMissed(state, riffId, segments, index, now) {
        if (!segments || !segments[index]) return null;
        var rec = partRecord(state, riffId, segments, index);
        if (!rec.tempoAt || !rec.nextReview || rec.nextReview > now) return partStatus(rec, now);
        rec.reviews = 0;
        rec.nextReview = addDays(dayStart(now), REVIEW_DAYS[0]);
        touch(state, riffId, now);
        return partStatus(rec, now);
    }

    function markWhole(state, riffId, now) {
        var r = riffState(state, riffId);
        if (!r.wholeAt) r.wholeAt = now;
        touch(state, riffId, now);
    }

    /** Status of every part of a riff and the riff as a whole. */
    function riffSummary(state, riff, now) {
        var segs = (riff && riff.segments) || [];
        var r = state.riffs[String(riff && riff.id)];
        var recs = r ? align(r, segs) : segs.map(function () { return null; });
        var parts = recs.map(function (rec) { return partStatus(rec, now); });
        var atTempo = parts.filter(function (p) { return p.key === 'tempo' || p.key === 'locked'; }).length;
        var started = parts.filter(function (p) { return p.key !== 'new'; }).length;
        var due = [];
        parts.forEach(function (p, i) { if (p.due) due.push(i); });
        var next = -1;
        for (var i = 0; i < parts.length; i++) if (parts[i].key === 'new' || parts[i].key === 'working') { next = i; break; }
        return {
            parts: parts,
            total: parts.length,
            started: started,
            atTempo: atTempo,
            locked: parts.filter(function (p) { return p.key === 'locked'; }).length,
            due: due,
            next: next,
            allAtTempo: parts.length > 0 && atTempo === parts.length,
            whole: !!(r && r.wholeAt),
            learned: parts.length > 0 && atTempo === parts.length && !!(r && r.wholeAt),
            lastAt: r ? r.lastAt : 0
        };
    }

    /** Seconds of real playing, counted toward today’s practice day. */
    function addPlayTime(state, riffId, seconds, now) {
        seconds = num(seconds);
        if (!seconds) return;
        var k = dayKey(now);
        var d = state.days[k] || (state.days[k] = { sec: 0, riffs: {} });
        d.sec = Math.round(d.sec + seconds);
        if (riffId != null) d.riffs[String(riffId)] = 1;
        state.updatedAt = now;
    }

    function practiced(state, ts) {
        var d = state.days[dayKey(ts)];
        return !!(d && d.sec >= DAY_SECONDS);
    }

    function setGoal(state, days, now) {
        if (GOALS.indexOf(Number(days)) < 0) return false;
        state.goal = Number(days);
        state.goalAt = now;
        state.updatedAt = now;
        return true;
    }

    /** This week (Monday first), the goal and how many weeks in a row it was met. */
    function weekSummary(state, now) {
        var start = weekStart(now);
        var days = [];
        for (var i = 0; i < 7; i++) {
            var ts = addDays(start, i);
            var d = state.days[dayKey(ts)];
            days.push({ key: dayKey(ts), done: practiced(state, ts), sec: d ? d.sec : 0, today: dayKey(ts) === dayKey(now), future: ts > now });
        }
        var count = days.filter(function (d) { return d.done; }).length;
        var goal = state.goal || 0;
        var met = goal > 0 && count >= goal;
        // Weeks in a row: past weeks that met the goal, plus this one once it is met. An unmet current week
        // does not break the run until it is over.
        var streak = met ? 1 : 0;
        if (goal > 0) {
            for (var w = 1; w < 520; w++) {
                var ws = addDays(start, -7 * w), n = 0;
                for (var j = 0; j < 7; j++) if (practiced(state, addDays(ws, j))) n++;
                if (n >= goal) streak++;
                else break;
            }
        }
        var minutes = Math.round(days.reduce(function (s, d) { return s + d.sec; }, 0) / 60);
        return { days: days, count: count, goal: goal, met: met, weeksInRow: streak, minutes: minutes };
    }

    /** Practice days for the last `weeks` weeks, oldest week first, Monday first in each week. */
    function calendar(state, now, weeks) {
        weeks = weeks || 12;
        var start = addDays(weekStart(now), -7 * (weeks - 1));
        var out = [];
        for (var w = 0; w < weeks; w++) {
            var row = [];
            for (var i = 0; i < 7; i++) {
                var ts = addDays(start, w * 7 + i);
                var d = state.days[dayKey(ts)];
                row.push({ key: dayKey(ts), done: practiced(state, ts), sec: d ? d.sec : 0, future: ts > now });
            }
            out.push(row);
        }
        return out;
    }

    /**
     * Techniques (Riff DNA atoms) the student plays at tempo: in how many parts and riffs.
     * A technique is learned once it is at tempo in three different riffs.
     */
    function techniques(state, riffs, now) {
        var map = {};
        (riffs || []).forEach(function (riff) {
            var atoms = riff && riff.dna && Array.isArray(riff.dna.atoms) ? riff.dna.atoms : [];
            if (!atoms.length) return;
            var sum = riffSummary(state, riff, now);
            atoms.forEach(function (a) {
                var t = String(a && a.technique || '').trim();
                if (!t || t === 'other') return;
                var e = map[t] || (map[t] = { technique: t, parts: {}, riffs: {}, seen: {} });
                e.seen[riff.id] = 1;
                var i = a.segmentIndex;
                if (typeof i !== 'number' || !sum.parts[i]) return;
                var k = sum.parts[i].key;
                if (k === 'tempo' || k === 'locked') {
                    e.parts[riff.id + ':' + i] = 1;
                    e.riffs[riff.id] = 1;
                }
            });
        });
        return Object.keys(map).map(function (t) {
            var e = map[t];
            var parts = Object.keys(e.parts).length, riffCount = Object.keys(e.riffs).length;
            return { technique: t, parts: parts, riffs: riffCount, inRiffs: Object.keys(e.seen).length, learned: riffCount >= LEARNED_IN_RIFFS };
        }).sort(function (x, y) { return (y.riffs - x.riffs) || (y.parts - x.parts) || (x.technique < y.technique ? -1 : 1); });
    }

    function riffTechniques(riff) {
        var out = {};
        var atoms = riff && riff.dna && Array.isArray(riff.dna.atoms) ? riff.dna.atoms : [];
        atoms.forEach(function (a) { var t = a && a.technique; if (t && t !== 'other') out[t] = 1; });
        return Object.keys(out);
    }

    /**
     * One suggestion of what to play next:
     *   review   — a part at tempo whose review is due (oldest first);
     *   continue — the riff practiced most recently that is not learned yet, at its next part;
     *   whole    — every part is at tempo, play the whole riff at ×1;
     *   new      — a riff not started yet whose techniques are mostly familiar, with at most a couple new.
     */
    function nextStep(state, riffs, now) {
        riffs = (riffs || []).filter(function (r) { return r && Array.isArray(r.segments) && r.segments.length; });
        var due = null;
        riffs.forEach(function (riff) {
            var r = state.riffs[String(riff.id)];
            if (!r) return;
            align(r, riff.segments).forEach(function (rec, i) {
                var st = partStatus(rec, now);
                if (st.due && (!due || rec.nextReview < due.at)) due = { kind: 'review', riff: riff, part: i, at: rec.nextReview };
            });
        });
        if (due) return due;
        var open = riffs.map(function (riff) { return { riff: riff, sum: riffSummary(state, riff, now) }; })
            .filter(function (x) { return x.sum.started > 0 && !x.sum.learned; })
            .sort(function (x, y) { return y.sum.lastAt - x.sum.lastAt; });
        if (open.length) {
            var o = open[0];
            if (o.sum.allAtTempo) return { kind: 'whole', riff: o.riff, part: -1 };
            return { kind: 'continue', riff: o.riff, part: o.sum.next };
        }
        var known = {};
        techniques(state, riffs, now).forEach(function (t) { if (t.parts > 0) known[t.technique] = 1; });
        var fresh = riffs.filter(function (riff) { return riffSummary(state, riff, now).started === 0; });
        if (!fresh.length) return null;
        var scored = fresh.map(function (riff, i) {
            var ts = riffTechniques(riff);
            var unknown = ts.filter(function (t) { return !known[t]; });
            // One new technique is ideal; none is fine; many new ones push the riff down the list.
            var score = unknown.length === 1 ? 0 : unknown.length === 0 ? 1 : unknown.length + 1;
            return { riff: riff, score: score, newTechniques: unknown, order: i };
        }).sort(function (x, y) { return (x.score - y.score) || (x.order - y.order); });
        return { kind: 'new', riff: scored[0].riff, part: 0, newTechniques: scored[0].newTechniques };
    }

    /** What changed in one riff during a session: parts that moved up, best speeds, time played. */
    function sessionDiff(before, after) {
        var moved = [];
        (after.parts || []).forEach(function (p, i) {
            var b = before.parts && before.parts[i] || { key: 'new', best: 0 };
            var rank = { new: 0, working: 1, tempo: 2, locked: 3 };
            if (rank[p.key] > rank[b.key] || p.best > b.best) moved.push({ part: i, from: b, to: p });
        });
        return moved;
    }

    function maxNum(a, b) { return Math.max(num(a), num(b)); }
    function minSet(a, b) { a = num(a); b = num(b); return a && b ? Math.min(a, b) : (a || b); }

    function mergePart(x, y) {
        var reviews = Math.max(x.reviews, y.reviews);
        var tempoAt = minSet(x.tempoAt, y.tempoAt);
        var nextReview = x.reviews === y.reviews ? maxNum(x.nextReview, y.nextReview) : (x.reviews > y.reviews ? x.nextReview : y.nextReview);
        var newer = x.lastAt >= y.lastAt ? x : y;
        return cleanPart({ a: newer.a, b: newer.b, best: maxNum(x.best, y.best), loops: maxNum(x.loops, y.loops), tempoAt: tempoAt, reviews: reviews, nextReview: tempoAt ? nextReview : 0, lastAt: maxNum(x.lastAt, y.lastAt) });
    }

    /** Combines two copies (this browser and the account): nothing either side earned is lost. */
    function merge(a, b) {
        a = normalize(a);
        b = normalize(b);
        var out = empty();
        var goalFrom = a.goalAt >= b.goalAt ? a : b;
        out.goal = goalFrom.goal || a.goal || b.goal;
        out.goalAt = goalFrom.goalAt;
        out.updatedAt = Math.max(a.updatedAt, b.updatedAt);
        Object.keys(a.days).concat(Object.keys(b.days)).forEach(function (k) {
            var x = a.days[k] || { sec: 0, riffs: {} }, y = b.days[k] || { sec: 0, riffs: {} };
            var riffs = {};
            Object.keys(x.riffs).concat(Object.keys(y.riffs)).forEach(function (id) { riffs[id] = 1; });
            out.days[k] = { sec: Math.max(x.sec, y.sec), riffs: riffs };
        });
        Object.keys(a.riffs).concat(Object.keys(b.riffs)).forEach(function (id) {
            if (out.riffs[id]) return;
            var x = a.riffs[id], y = b.riffs[id];
            if (!x || !y) { out.riffs[id] = normalize({ riffs: { r: x || y } }).riffs.r; return; }
            var parts = x.parts.map(function (p) { return cleanPart(p); });
            y.parts.forEach(function (p) {
                var hit = -1, score = 0;
                parts.forEach(function (q, i) { var o = overlap(q, p.a, p.b); if (o >= 0.5 && o > score) { score = o; hit = i; } });
                if (hit >= 0) parts[hit] = mergePart(parts[hit], p);
                else parts.push(cleanPart(p));
            });
            out.riffs[id] = { parts: parts, wholeAt: minSet(x.wholeAt, y.wholeAt), lastAt: maxNum(x.lastAt, y.lastAt) };
        });
        return out;
    }

    // ---- store: this browser, plus the account when signed in (api/progress.php)
    var listeners = [];
    var cache = null;
    var syncTimer = null;
    var signedIn = false;
    var dirty = false;

    function storage() { try { return global.localStorage || null; } catch (e) { return null; } }

    function load() {
        if (cache) return cache;
        var raw = null, ls = storage();
        try { raw = ls ? ls.getItem(KEY) : null; } catch (e) { raw = null; }
        try { cache = normalize(raw ? JSON.parse(raw) : null); } catch (e) { cache = empty(); }
        return cache;
    }

    function emit() { listeners.forEach(function (fn) { try { fn(cache); } catch (e) {} }); }

    function save(opts) {
        var ls = storage();
        try { if (ls) ls.setItem(KEY, JSON.stringify(cache)); } catch (e) {}
        if (!(opts && opts.quiet)) emit();
        if (signedIn) {
            dirty = true;
            clearTimeout(syncTimer);
            syncTimer = setTimeout(push, opts && opts.soon ? 500 : 8000);
        }
    }

    function update(fn, opts) {
        var s = load();
        var result = fn(s, Date.now());
        save(opts);
        return result;
    }

    function request(method, body) {
        if (typeof fetch !== 'function') return Promise.reject(new Error('no fetch'));
        return fetch('api/progress.php', {
            method: method,
            credentials: 'same-origin',
            headers: body ? { 'Content-Type': 'application/json' } : undefined,
            body: body ? JSON.stringify(body) : undefined,
            keepalive: method === 'POST'
        }).then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)); });
    }

    /** Merges this browser’s copy with the account’s and stores the result in both places. */
    function sync() {
        return request('GET').then(function (res) {
            if (!res || !res.authenticated) { signedIn = false; return false; }
            signedIn = true;
            clearTimeout(syncTimer);
            cache = merge(load(), res.progress || null);
            save({ quiet: !res.progress });
            clearTimeout(syncTimer);
            dirty = false;
            return request('POST', { progress: cache }).then(function () { return true; });
        }).catch(function () { return false; });
    }
    var push = sync;

    /** Sends pending changes now (page hide). */
    function flush() {
        if (!signedIn || !cache || !dirty) return;
        clearTimeout(syncTimer);
        dirty = false;
        request('POST', { progress: cache }).catch(function () {});
    }

    function onChange(fn) { listeners.push(fn); }

    var api = {
        KEY: KEY, DAY_SECONDS: DAY_SECONDS, GOALS: GOALS, REVIEW_DAYS: REVIEW_DAYS,
        empty: empty, normalize: normalize, dayKey: dayKey, weekStart: weekStart,
        recordLoop: recordLoop, markClean: markClean, reviewMissed: reviewMissed, markWhole: markWhole,
        partStatus: partStatus, riffSummary: riffSummary, addPlayTime: addPlayTime, setGoal: setGoal,
        weekSummary: weekSummary, calendar: calendar, techniques: techniques, nextStep: nextStep,
        sessionDiff: sessionDiff, merge: merge,
        load: load, update: update, save: save, sync: sync, flush: flush, onChange: onChange
    };
    global.RKProgress = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
