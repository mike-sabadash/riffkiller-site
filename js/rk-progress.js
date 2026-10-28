/**
 * Student progress: parts of a riff, practice days and the weekly goal. Pure rules plus a small store.
 *
 * A part (one segment of the riff) goes new → working → at tempo → locked in:
 *   working   — looped at least once; `best` is the fastest speed the student said they played cleanly;
 *   at tempo  — the student said “clean” at ×1 (Speed Trainer asks after three loops at full speed);
 *   locked in — said “clean” at ×1 again on a review, 3 days later. Next reviews come after 10 and 30 days.
 * A riff is learned (killed) when every part is at tempo and the whole riff was played cleanly at ×1 once.
 *
 * Every part (a "shot") earns stars by its best clean speed: ★ at ×0.5, ★★ at ×0.75, ★★★ at ×1, so the
 * way to tempo is visible from the first session. A riff also walks the Riff DNA method, stage by stage:
 *   Scan (heard whole) → Split (every shot played) → Isolate (every shot ★★★) → Decode (rule understood)
 *   → Mutate (own variation played). Decode and Mutate are the student's own word, like "clean".
 * Ranks count killed riffs only. Wins (stars, tempo, lock-ins, kills, stages, weekly goals) are kept in a short
 * log for the profile, the kill screen and the Monday email. Nothing is scored in points.
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
    var STAR_SPEEDS = [0.5, 0.75, 1];
    var STAGES = ['scan', 'split', 'isolate', 'decode', 'mutate'];
    var RANKS = [
        { key: 'rookie', label: 'Rookie', kills: 0 },
        { key: 'hunter', label: 'Riff Hunter', kills: 1 },
        { key: 'killer', label: 'Riff Killer', kills: 3 },
        { key: 'slayer', label: 'Riff Slayer', kills: 6 },
        { key: 'legend', label: 'Riff Legend', kills: 10 }
    ];
    var WINS_KEPT = 80;

    function empty() {
        return { v: 2, goal: 0, goalAt: 0, email: false, emailAt: 0, tz: '', lang: '', days: {}, riffs: {}, wins: [], updatedAt: 0 };
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
        out.email = s.email === true;
        out.emailAt = num(s.emailAt);
        out.tz = typeof s.tz === 'string' && /^[A-Za-z0-9_+\-\/]{1,64}$/.test(s.tz) ? s.tz : '';
        out.lang = s.lang === 'ru' || s.lang === 'es' || s.lang === 'en' ? s.lang : '';
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
                    scanAt: num(r.scanAt),
                    decodeAt: num(r.decodeAt),
                    mutateAt: num(r.mutateAt),
                    lastAt: num(r.lastAt)
                };
            });
        }
        if (Array.isArray(s.wins)) out.wins = s.wins.map(cleanWin).filter(Boolean).slice(-WINS_KEPT);
        return out;
    }

    var WIN_TYPES = ['star', 'tempo', 'locked', 'kill', 'scan', 'decode', 'mutate', 'goal'];
    function cleanWin(w) {
        if (!w || WIN_TYPES.indexOf(w.t) < 0 || !num(w.at)) return null;
        var out = { t: w.t, at: num(w.at) };
        if (w.r != null && /^[A-Za-z0-9_-]{1,40}$/.test(String(w.r))) out.r = String(w.r);
        if (typeof w.p === 'number' && w.p >= 0 && w.p < 500) out.p = Math.floor(w.p);
        if (typeof w.n === 'number' && w.n >= 1 && w.n <= 3) out.n = Math.floor(w.n);
        if (typeof w.w === 'string' && /^\d{4}-\d\d-\d\d$/.test(w.w)) out.w = w.w;
        return out;
    }
    function winKey(w) { return [w.t, w.r || '', w.p == null ? '' : w.p, w.n || '', w.w || ''].join('|'); }
    /** Adds a win once: the same star of the same part, the same kill, the same week's goal count only the first time. */
    function addWin(state, win) {
        var w = cleanWin(win);
        if (!w) return false;
        var key = winKey(w);
        if (state.wins.some(function (x) { return winKey(x) === key; })) return false;
        state.wins.push(w);
        if (state.wins.length > WINS_KEPT) state.wins = state.wins.slice(-WINS_KEPT);
        return true;
    }

    /** Stars of a part from its best clean speed: 0 to 3. */
    function starsFor(best, atTempo) {
        if (atTempo) return 3;
        var n = 0;
        STAR_SPEEDS.forEach(function (sp) { if (num(best) >= sp - 1e-6) n++; });
        return n;
    }

    function riffState(state, riffId) {
        var id = String(riffId);
        if (!state.riffs[id]) state.riffs[id] = { parts: [], wholeAt: 0, scanAt: 0, decodeAt: 0, mutateAt: 0, lastAt: 0 };
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
        if (!rec || (!rec.loops && !rec.best && !rec.tempoAt)) return { key: 'new', best: 0, stars: 0, due: false };
        var due = !!(rec.tempoAt && rec.nextReview && rec.nextReview <= now);
        if (rec.tempoAt && rec.reviews > 0) return { key: 'locked', best: 1, stars: 3, due: due };
        if (rec.tempoAt) return { key: 'tempo', best: 1, stars: 3, due: due };
        return { key: 'working', best: rec.best, stars: starsFor(rec.best, false), due: false };
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
        var after = partStatus(rec, now);
        var id = String(riffId);
        for (var n = before.stars + 1; n <= after.stars; n++) addWin(state, { t: 'star', r: id, p: index, n: n, at: now });
        if (before.key !== 'tempo' && before.key !== 'locked' && (after.key === 'tempo' || after.key === 'locked')) addWin(state, { t: 'tempo', r: id, p: index, at: now });
        if (before.key !== 'locked' && after.key === 'locked') addWin(state, { t: 'locked', r: id, p: index, at: now });
        return { before: before, after: after };
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
        if (!r.scanAt) r.scanAt = now;
        touch(state, riffId, now);
        addWin(state, { t: 'kill', r: String(riffId), at: now });
    }

    /**
     * A stage of the method the student marks: scan (the whole riff heard once), decode (the rule understood),
     * mutate (an own variation played). Returns true the first time.
     */
    function markStage(state, riffId, stage, now) {
        var field = { scan: 'scanAt', decode: 'decodeAt', mutate: 'mutateAt' }[stage];
        if (!field) return false;
        var r = riffState(state, riffId);
        if (r[field]) return false;
        r[field] = now;
        touch(state, riffId, now);
        addWin(state, { t: stage, r: String(riffId), at: now });
        return true;
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
        var stars = parts.reduce(function (n, p) { return n + p.stars; }, 0);
        var allAtTempo = parts.length > 0 && atTempo === parts.length;
        var learned = allAtTempo && !!(r && r.wholeAt);
        var done = {
            scan: !!(r && (r.scanAt || r.wholeAt)),
            split: parts.length > 0 && started === parts.length,
            isolate: allAtTempo,
            decode: !!(r && r.decodeAt),
            mutate: !!(r && r.mutateAt)
        };
        var stageNext = null;
        for (var k = 0; k < STAGES.length; k++) if (!done[STAGES[k]]) { stageNext = STAGES[k]; break; }
        return {
            stars: stars,
            maxStars: parts.length * 3,
            stages: done,
            stagesDone: STAGES.filter(function (st) { return done[st]; }).length,
            stageNext: stageNext,
            toKill: parts.length - atTempo + (allAtTempo && !learned ? 1 : 0),
            killed: learned,
            lockedIn: learned && parts.length > 0 && parts.every(function (p) { return p.key === 'locked'; }),
            parts: parts,
            total: parts.length,
            started: started,
            atTempo: atTempo,
            locked: parts.filter(function (p) { return p.key === 'locked'; }).length,
            due: due,
            next: next,
            allAtTempo: allAtTempo,
            whole: !!(r && r.wholeAt),
            learned: learned,
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
        var w = weekSummary(state, now);
        if (w.met) addWin(state, { t: 'goal', w: dayKey(weekStart(now)), at: now });
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

    /** The weekly summary email (sent on Monday morning in the student’s time zone): opt-in. */
    function setEmail(state, on, now) {
        state.email = !!on;
        state.emailAt = now;
        state.updatedAt = now;
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
            // Where to train it next: a riff that uses it and where it is not at tempo yet.
            var trainIn = null;
            Object.keys(e.seen).forEach(function (id) { if (!trainIn && !e.riffs[id]) trainIn = id; });
            return { technique: t, parts: parts, riffs: riffCount, inRiffs: Object.keys(e.seen).length, need: LEARNED_IN_RIFFS,
                learned: riffCount >= LEARNED_IN_RIFFS, reachable: Object.keys(e.seen).length >= LEARNED_IN_RIFFS, trainIn: trainIn };
        }).sort(function (x, y) { return (y.riffs - x.riffs) || (y.parts - x.parts) || (x.technique < y.technique ? -1 : 1); });
    }

    /** The rank by killed riffs, with the next one and how many kills it takes. */
    function rank(state, riffs, now) {
        var kills = (riffs || []).filter(function (r) { return r && Array.isArray(r.segments) && r.segments.length && riffSummary(state, r, now).killed; }).length;
        var i = 0;
        for (var k = 0; k < RANKS.length; k++) if (kills >= RANKS[k].kills) i = k;
        var next = RANKS[i + 1] || null;
        var from = RANKS[i].kills;
        return {
            key: RANKS[i].key, label: RANKS[i].label, index: i, kills: kills,
            next: next ? { key: next.key, label: next.label, kills: next.kills, toGo: next.kills - kills } : null,
            share: next ? (kills - from) / (next.kills - from) : 1
        };
    }

    /**
     * Achievements with their progress: only the ones the current catalog makes possible (three riffs to kill need
     * three riffs cut into parts). value/target fill the bar; done when value reaches target.
     */
    function achievements(state, riffs, now) {
        var playable = (riffs || []).filter(function (r) { return r && Array.isArray(r.segments) && r.segments.length; });
        var sums = playable.map(function (r) { return riffSummary(state, r, now); });
        var max = function (fn) { return sums.reduce(function (m, x) { return Math.max(m, fn(x)); }, 0); };
        var techs = techniques(state, playable, now);
        var w = weekSummary(state, now);
        var kills = sums.filter(function (x) { return x.killed; }).length;
        var list = [
            { key: 'first-star', label: 'First star', how: 'Play a part cleanly at ×0.5.', value: Math.min(1, max(function (x) { return x.stars; })), target: 1 },
            { key: 'first-tempo', label: 'First shot at full speed', how: 'Play a part cleanly at ×1.', value: Math.min(1, max(function (x) { return x.atTempo; })), target: 1 },
            { key: 'all-stars', label: 'Every star of a riff', how: 'Three stars on every part of one riff.', value: max(function (x) { return x.stars; }), target: Math.max(3, max(function (x) { return x.maxStars; })) },
            { key: 'first-kill', label: 'First riff killed', how: 'Every part at ×1, then the whole riff once at ×1.', value: Math.min(1, kills), target: 1 },
            { key: 'full-dna', label: 'Full Riff DNA', how: 'All five stages on one riff: Scan, Split, Isolate, Decode, Mutate.', value: max(function (x) { return x.stagesDone; }), target: STAGES.length },
            { key: 'locked-riff', label: 'Riff locked in', how: 'Every part of a killed riff passes its review.', value: max(function (x) { return x.killed ? x.locked : 0; }), target: Math.max(1, max(function (x) { return x.total; })) },
            { key: 'goal-week', label: 'Weekly goal met', how: 'Reach your days this week.', value: Math.min(w.count, w.goal || 1), target: w.goal || 1 },
            { key: 'goal-4', label: 'Four weeks in a row', how: 'Meet your weekly goal four weeks running.', value: Math.min(4, w.weeksInRow), target: 4 }
        ];
        if (playable.length >= 3) list.push({ key: 'three-kills', label: 'Three riffs killed', how: 'Kill three different riffs.', value: Math.min(3, kills), target: 3 });
        var reachable = techs.filter(function (t) { return t.reachable; });
        if (reachable.length) {
            var bestT = reachable.reduce(function (m, t) { return t.riffs > m ? t.riffs : m; }, 0);
            list.push({ key: 'technique', label: 'Technique learned', how: 'One technique at tempo in three riffs.', value: Math.min(LEARNED_IN_RIFFS, bestT), target: LEARNED_IN_RIFFS });
        }
        list.forEach(function (a) { a.done = a.value >= a.target; });
        return list;
    }

    /** The latest wins, newest first. */
    function recentWins(state, limit) {
        return (state.wins || []).slice().sort(function (a, b) { return b.at - a.at; }).slice(0, limit || 8);
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
     *   decode / mutate — a killed riff whose rule or own variation is still open;
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
        // A killed riff whose rule or own variation is still open: the method is not finished.
        var unfinished = riffs.map(function (riff) { return { riff: riff, sum: riffSummary(state, riff, now) }; })
            .filter(function (x) {
                var dna = x.riff.dna || {};
                // Decode needs a rule written up for the riff; Mutate always has steps to follow.
                return x.sum.killed && (x.sum.stageNext === 'decode' ? !!(dna.rule || dna.formula || dna.law) : x.sum.stageNext === 'mutate');
            })
            .sort(function (x, y) { return y.sum.lastAt - x.sum.lastAt; });
        if (unfinished.length) return { kind: unfinished[0].sum.stageNext, riff: unfinished[0].riff, part: -1 };
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

    /** One quiet line for a riff card: “Learned” or “3/10 parts at tempo”; empty before the first loop. */
    function cardNote(riff) {
        if (!riff || !Array.isArray(riff.segments) || !riff.segments.length) return '';
        var sum = riffSummary(load(), riff, Date.now());
        if (!sum.started) return '';
        return sum.killed ? 'Killed' : sum.stars + '/' + sum.maxStars + ' ★';
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
        var emailFrom = a.emailAt >= b.emailAt ? a : b;
        out.email = emailFrom.email;
        out.emailAt = emailFrom.emailAt;
        var newer = a.updatedAt >= b.updatedAt ? a : b, older = newer === a ? b : a;
        out.tz = newer.tz || older.tz;
        out.lang = newer.lang || older.lang;
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
            out.riffs[id] = { parts: parts, wholeAt: minSet(x.wholeAt, y.wholeAt), scanAt: minSet(x.scanAt, y.scanAt),
                decodeAt: minSet(x.decodeAt, y.decodeAt), mutateAt: minSet(x.mutateAt, y.mutateAt), lastAt: maxNum(x.lastAt, y.lastAt) };
        });
        // Wins from both copies, each once, the earliest time kept.
        var seen = {};
        a.wins.concat(b.wins).forEach(function (w) {
            var k = winKey(w);
            if (!seen[k] || w.at < seen[k].at) seen[k] = w;
        });
        out.wins = Object.keys(seen).map(function (k) { return seen[k]; }).sort(function (x, y) { return x.at - y.at; }).slice(-WINS_KEPT);
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
            // Where and in which language the Monday email should arrive.
            try { cache.tz = Intl.DateTimeFormat().resolvedOptions().timeZone || cache.tz; } catch (e) {}
            try { var l = global.localStorage && global.localStorage.getItem('rk-lang'); if (l === 'ru' || l === 'es' || l === 'en') cache.lang = l; } catch (e) {}
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
        KEY: KEY, DAY_SECONDS: DAY_SECONDS, GOALS: GOALS, REVIEW_DAYS: REVIEW_DAYS, STAGES: STAGES, RANKS: RANKS, STAR_SPEEDS: STAR_SPEEDS,
        markStage: markStage, rank: rank, achievements: achievements, recentWins: recentWins, starsFor: starsFor,
        empty: empty, normalize: normalize, dayKey: dayKey, weekStart: weekStart,
        recordLoop: recordLoop, markClean: markClean, reviewMissed: reviewMissed, markWhole: markWhole,
        partStatus: partStatus, riffSummary: riffSummary, addPlayTime: addPlayTime, setGoal: setGoal, setEmail: setEmail,
        weekSummary: weekSummary, calendar: calendar, techniques: techniques, nextStep: nextStep,
        sessionDiff: sessionDiff, merge: merge, cardNote: cardNote,
        load: load, update: update, save: save, sync: sync, flush: flush, onChange: onChange
    };
    global.RKProgress = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
