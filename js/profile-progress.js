/**
 * "Your progress" on the profile (rules in js/rk-progress.js), built on "Kill every riff. One shot at a time":
 *   - your rank (by riffs killed) and the one next step;
 *   - the current riff: the Riff DNA method stage by stage and every shot with its stars;
 *   - this week against the goal; the latest wins; achievements with how far along they are;
 *   - techniques (learned at tempo in three riffs, and where to train them next) and every riff played.
 * Every number says how it is counted; nothing is scored in points.
 */
(function (global) {
    'use strict';

    var P = global.RKProgress;
    var riffs = [];
    var root = null;
    var editingGoal = false;

    var STAGE_TEXT = {
        scan: ['Scan', 'Hear it whole'],
        split: ['Split', 'Play every part'],
        isolate: ['Isolate', 'Every part ★★★'],
        decode: ['Decode', 'Get the rule'],
        mutate: ['Mutate', 'Make it yours']
    };
    var STAR = '<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" focusable="false"><path d="M6 1.2l1.45 3.05 3.3.4-2.43 2.28.62 3.27L6 8.6 3.06 10.2l.62-3.27L1.25 4.65l3.3-.4z" fill="currentColor"/></svg>';

    /** Narrow weekday names, Monday first, in the page language (М, Т, С… in Russian). */
    function dayLetters() {
        var lang = document.documentElement.getAttribute('lang') || 'en';
        var monday = new Date(2024, 0, 1);
        var out = [];
        for (var i = 0; i < 7; i++) {
            var d = new Date(monday.getTime());
            d.setDate(monday.getDate() + i);
            try { out.push(d.toLocaleDateString(lang, { weekday: 'narrow' }).toUpperCase()); } catch (e) { out.push('MTWTFSS'[i]); }
        }
        return out;
    }

    function esc(v) {
        return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function hint(text, label) { return global.RKHint && global.RKHint.icon ? global.RKHint.icon(text, label) : ''; }
    function techniqueLabel(key) {
        var t = global.RiffDNAVocab && global.RiffDNAVocab.technique(key);
        return t ? t.label : key;
    }
    function partName(riff, i) {
        var s = riff && riff.segments && riff.segments[i] || {};
        return s.displayName || s.name || ('Shot ' + (i + 1));
    }
    function practiceUrl(riff, part) {
        return 'practice.html?riff=' + encodeURIComponent(riff.id) + (part >= 0 ? '&part=' + (part + 1) : '');
    }
    function riffById(id) {
        for (var i = 0; i < riffs.length; i++) if (String(riffs[i].id) === String(id)) return riffs[i];
        return null;
    }
    function stars(n) {
        var out = '';
        for (var i = 0; i < 3; i++) out += '<i class="pp-star' + (i < n ? ' on' : '') + '">' + STAR + '</i>';
        return '<span class="pp-stars" aria-hidden="true">' + out + '</span>';
    }
    function bar(value, target) {
        var pct = target > 0 ? Math.max(0, Math.min(100, Math.round(value / target * 100))) : 0;
        return '<span class="pp-bar" aria-hidden="true"><i style="width:' + pct + '%"></i></span>';
    }
    function when(ts, now) {
        var day = P.dayKey(ts), today = P.dayKey(now), yesterday = P.dayKey(now - 86400000);
        if (day === today) return 'Today';
        if (day === yesterday) return 'Yesterday';
        var lang = document.documentElement.getAttribute('lang') || 'en';
        try { return new Date(ts).toLocaleDateString(lang, { month: 'short', day: 'numeric' }); } catch (e) { return day; }
    }

    function goalPicker(current) {
        return '<div class="pp-goal-options" role="group" aria-label="Weekly goal">' +
            P.GOALS.map(function (g) {
                return '<button type="button" class="pp-goal-btn' + (g === current ? ' active' : '') + '" data-goal="' + g + '" aria-pressed="' + (g === current) + '">' + g + ' days</button>';
            }).join('') + '</div>';
    }

    // ---- rank and the next step

    function nextStep(state, now) {
        var n = P.nextStep(state, riffs, now);
        if (!n) return { title: 'Pick a riff to start', text: 'Open any riff and play it once from start to end: that is Scan, the first stage.', label: 'Open riffs', url: 'index.html' };
        if (n.kind === 'review') return { title: 'Review: ' + n.riff.song, text: partName(n.riff, n.part) + ' reached tempo a few days ago. Play it once at ×1 to lock it in.', label: 'Review', url: practiceUrl(n.riff, n.part) };
        if (n.kind === 'continue') return { title: 'Continue ' + n.riff.song, text: 'Next part: ' + partName(n.riff, n.part) + '.', label: 'Continue', url: practiceUrl(n.riff, n.part) };
        if (n.kind === 'whole') return { title: 'Finish ' + n.riff.song, text: 'Every part is at tempo. Play All Riff once at ×1 to kill it.', label: 'Play the riff', url: practiceUrl(n.riff, -1) };
        if (n.kind === 'decode') return { title: 'Decode ' + n.riff.song, text: 'You killed it. Now read its rule: what keeps it recognisable.', label: 'Open the rule', url: practiceUrl(n.riff, -1) };
        if (n.kind === 'mutate') return { title: 'Mutate ' + n.riff.song, text: 'Change one thing, keep the rule: your own riff on its DNA.', label: 'Mutate it', url: practiceUrl(n.riff, -1) };
        var nt = (n.newTechniques || []).map(techniqueLabel);
        return {
            title: 'Try ' + n.riff.song,
            text: nt.length === 1 ? 'One new technique: ' + nt[0] + '. The rest you already play.'
                : nt.length === 0 ? 'Uses techniques you already play.' : 'New techniques: ' + nt.join(', ') + '.',
            label: 'Start', url: practiceUrl(n.riff, 0)
        };
    }

    function heroHtml(state, now) {
        var r = P.rank(state, riffs, now);
        var learnedTech = P.techniques(state, riffs, now).filter(function (t) { return t.learned; }).length;
        var n = nextStep(state, now);
        var toNext = r.next ? (r.next.toGo === 1 ? '1 more kill to ' + r.next.label : r.next.toGo + ' more kills to ' + r.next.label) : 'Top rank';
        return '<section class="pp-card pp-hero">' +
            '<div class="pp-rank">' +
            '<p class="pp-title">Your rank ' + hint('Your rank counts the riffs you killed: every part at ×1, then the whole riff once at ×1. Rookie, then Riff Hunter at 1 kill, Riff Killer at 3, Riff Slayer at 6, Riff Legend at 10.', 'rank') + '</p>' +
            '<p class="pp-rank-name" translate="no">' + esc(r.label) + '</p>' +
            '<p class="pp-meta">' + esc(r.kills === 1 ? '1 riff killed' : r.kills + ' riffs killed') + ' · ' +
            esc(learnedTech === 1 ? '1 technique learned' : learnedTech + ' techniques learned') + '</p>' +
            bar(r.share, 1) + '<p class="pp-rank-next">' + esc(toNext) + '</p>' +
            '</div>' +
            '<div class="pp-next">' +
            '<p class="pp-title">Next</p>' +
            '<p class="pp-next-title">' + esc(n.title) + '</p><p class="pp-text">' + esc(n.text) + '</p>' +
            '<a class="pp-btn" href="' + esc(n.url) + '">' + esc(n.label) + '</a>' +
            '</div></section>';
    }

    // ---- the current riff: method and shots

    function currentRiff(state, now) {
        var playable = riffs.filter(function (r) { return r.segments && r.segments.length; });
        var rows = playable.map(function (r) { return { riff: r, sum: P.riffSummary(state, r, now) }; });
        var open = rows.filter(function (x) { return (x.sum.started > 0 || x.sum.stages.scan) && x.sum.stagesDone < P.STAGES.length; })
            .sort(function (a, b) { return b.sum.lastAt - a.sum.lastAt; });
        if (open.length) return open[0];
        var n = P.nextStep(state, riffs, now);
        if (n && n.riff) return { riff: n.riff, sum: P.riffSummary(state, n.riff, now) };
        return rows[0] || null;
    }

    function currentHtml(state, now) {
        var c = currentRiff(state, now);
        if (!c) return '';
        var s = c.sum, riff = c.riff;
        var steps = P.STAGES.map(function (st) {
            var cls = s.stages[st] ? 'done' : st === s.stageNext ? 'current' : '';
            return '<li class="pp-step ' + cls + '"><span class="pp-step-mark" aria-hidden="true">' + (s.stages[st] ? '✓' : '') + '</span>' +
                '<span class="pp-step-name" translate="no">' + STAGE_TEXT[st][0] + '</span><span class="pp-step-sub">' + esc(STAGE_TEXT[st][1]) + '</span>' +
                '<span class="pp-sr">' + (s.stages[st] ? 'Done' : 'Not yet') + '</span></li>';
        }).join('');
        var shots = s.parts.map(function (p, i) {
            var state = p.due ? 'due' : p.key;
            return '<li class="pp-shot ' + state + '"><a href="' + esc(practiceUrl(riff, i)) + '" title="' + esc(partName(riff, i)) + '">' +
                '<span class="pp-shot-name" translate="no">' + esc(partName(riff, i)) + '</span>' + stars(p.stars) +
                (p.due ? '<span class="pp-shot-tag">Review</span>' : p.key === 'locked' ? '<span class="pp-shot-tag">Locked in</span>' : '') + '</a></li>';
        }).join('');
        var status = s.killed
            ? '<span class="pp-killed">Killed</span>' + (s.lockedIn ? '<span class="pp-killed is-locked">Locked in</span>' : '')
            : '<span class="pp-count">' + esc(s.stars + ' of ' + s.maxStars + ' stars') + '</span>' +
              (s.allAtTempo ? '<span class="pp-meta">Play All Riff once at ×1 to kill it</span>' : '<span class="pp-meta">' + esc(s.toKill === 1 ? '1 shot to kill' : s.toKill + ' shots to kill') + '</span>');
        var empty = !s.started && !s.stages.scan
            ? '<p class="pp-text">Start with Scan: play the whole riff once and listen for where each part starts and where the phrase comes home. Then every part earns stars: one at ×0.5, two at ×0.75, three at ×1.</p>' : '';
        return '<section class="pp-card pp-current">' +
            '<div class="pp-current-head"><div><p class="pp-title">Current riff ' + hint('A riff walks the Riff DNA method: Scan (hear it whole), Split (play every part), Isolate (every part at ×1), Decode (get the rule) and Mutate (make your own on its DNA). Killed means every part at ×1 and the whole riff once at ×1.', 'Riff DNA method') + '</p>' +
            '<p class="pp-current-name" translate="no">' + esc(riff.song) + '</p><p class="pp-meta" translate="no">' + esc(riff.artist || '') + '</p></div>' +
            '<div class="pp-current-status">' + status + '</div></div>' +
            '<ol class="pp-steps" aria-label="Riff DNA method">' + steps + '</ol>' + empty +
            (s.parts.length ? '<p class="pp-label">Shots</p><ul class="pp-shots">' + shots + '</ul>' : '') +
            '</section>';
    }

    // ---- the week

    function weekHtml(state, now) {
        var w = P.weekSummary(state, now);
        var letters = dayLetters();
        var days = w.days.map(function (d, i) {
            var cls = 'pp-day' + (d.done ? ' done' : '') + (d.today ? ' today' : '') + (d.future ? ' future' : '');
            var mins = Math.round(d.sec / 60);
            return '<span class="' + cls + '" title="' + esc(d.key) + (mins ? ' · ' + mins + ' min' : '') + '"><span translate="no">' + esc(letters[i]) + '</span></span>';
        }).join('');
        var head;
        if (!w.goal || editingGoal) {
            head = '<p class="pp-text">How many days a week do you want to play? A day counts after 5 minutes of playing; missed days don’t reset the week.</p>' + goalPicker(w.goal);
        } else {
            var left = Math.max(0, w.goal - w.count);
            head = '<div class="pp-week-figures">' +
                '<p class="pp-big"><span class="pp-big-num">' + w.count + '</span><span class="pp-big-of"> of ' + w.goal + ' days</span></p>' +
                '<p class="pp-meta">' + esc(w.minutes + ' min played') + '</p>' +
                '<p class="pp-week-left">' + esc(w.met ? 'Goal met. Every extra day still counts.' : left === 1 ? '1 more day to reach your goal' : left + ' more days to reach your goal') + '</p>' +
                '</div>' +
                '<dl class="pp-facts"><div><dt>Weeks in a row</dt><dd>' + w.weeksInRow + '</dd></div>' +
                '<div><dt>Goal</dt><dd>' + w.goal + ' days a week <button type="button" class="pp-link" id="ppChangeGoal">Change</button></dd></div></dl>';
        }
        // The 12-week map only once there is something to see: an empty grid reads as failure.
        var played = Object.keys(state.days).filter(function (k) { return state.days[k].sec > 0; }).sort();
        var calHtml = '';
        if (played.length && P.weekStart(new Date(played[0] + 'T12:00:00').getTime()) < P.weekStart(now)) {
            var cal = P.calendar(state, now, 12);
            calHtml = '<p class="pp-label">Last 12 weeks</p><div class="pp-calendar" aria-label="Practice days, last 12 weeks">' + cal.map(function (week) {
                return '<span class="pp-cal-week">' + week.map(function (d) {
                    return '<i class="' + (d.done ? 'done' : d.sec > 0 ? 'some' : '') + (d.future ? ' future' : '') + '" title="' + esc(d.key) + '"></i>';
                }).join('') + '</span>';
            }).join('') + '</div>' +
                '<p class="pp-legend"><i class="some"></i><span>Played</span><i class="done"></i><span>5+ min: a practice day</span></p>';
        }
        return '<section class="pp-card pp-week">' +
            '<h3 class="pp-title">This week ' + hint('A practice day is 5 minutes of the video actually playing on the practice page. The week starts on Monday. Weeks in a row counts weeks that met your goal; the current week joins the run once it is met.', 'practice day') + '</h3>' +
            '<div class="pp-days">' + days + '</div>' + head + calHtml +
            '<label class="pp-email"><input type="checkbox" id="ppEmail"' + (state.email ? ' checked' : '') + '>' +
            '<span>Email me a short summary of my week every Monday<small>One email a week. It stops by itself after two quiet weeks.</small></span></label>' +
            '</section>';
    }

    // ---- wins

    var WIN_LABEL = { tempo: 'At full speed', locked: 'Locked in', kill: 'Riff killed', scan: 'Scan done', decode: 'Rule decoded', mutate: 'Mutation played', goal: 'Weekly goal met' };
    function winsHtml(state, now) {
        // One line per part and day for stars: the highest star of that day, not every step to it.
        var seen = {}, top = {}, all = P.recentWins(state, 40);
        function key(w) { return (w.r || '') + ':' + (w.p == null ? '' : w.p) + ':' + P.dayKey(w.at); }
        all.forEach(function (w) {
            if (w.t !== 'star' && w.t !== 'tempo') return;
            var n = w.t === 'tempo' ? 3 : (w.n || 1), k = key(w);
            if (!top[k] || n > top[k]) top[k] = n;
        });
        var list = all.filter(function (w) {
            if (w.t !== 'star' && w.t !== 'tempo') return true;
            var k = key(w);
            if (seen[k]) return false;
            seen[k] = 1;
            return true;
        }).map(function (w) {
            if (w.t !== 'star' && w.t !== 'tempo') return w;
            return { t: 'star', n: top[key(w)], r: w.r, p: w.p, at: w.at };
        }).slice(0, 7);
        var body;
        if (!list.length) body = '<p class="pp-text">Your wins show up here: every star, every part at full speed, every riff you kill.</p>';
        else body = '<ul class="pp-wins">' + list.map(function (w) {
            var riff = w.r != null ? riffById(w.r) : null;
            var what = w.t === 'star' ? (w.n === 3 ? 'Three stars' : w.n === 2 ? 'Two stars' : 'One star') : WIN_LABEL[w.t];
            var detail = riff ? (w.p != null ? partName(riff, w.p) + ' · ' : '') + (riff.song || '') : '';
            var icon = w.t === 'star' ? stars(w.n) : '<span class="pp-win-icon ' + w.t + '" aria-hidden="true">' + (w.t === 'kill' ? '✕' : '✓') + '</span>';
            return '<li class="pp-win ' + w.t + '">' + icon + '<span class="pp-win-text"><b>' + esc(what) + '</b>' +
                (detail ? '<span translate="no">' + esc(detail) + '</span>' : '') + '</span><span class="pp-win-when">' + esc(when(w.at, now)) + '</span></li>';
        }).join('') + '</ul>';
        return '<section class="pp-card pp-wins-card"><h3 class="pp-title">Recent wins</h3>' + body + '</section>';
    }

    // ---- achievements

    function achievementsHtml(state, now) {
        var list = P.achievements(state, riffs, now);
        var done = list.filter(function (a) { return a.done; }).length;
        // Closest to done first, then the rest; the unlocked ones go last with their check.
        var order = list.slice().sort(function (a, b) {
            if (a.done !== b.done) return a.done ? 1 : -1;
            return (b.value / b.target) - (a.value / a.target);
        });
        return '<section class="pp-card pp-ach"><h3 class="pp-title">Achievements <span class="pp-count-small">' + esc(done + ' of ' + list.length + ' unlocked') + '</span></h3>' +
            '<ul class="pp-ach-list">' + order.map(function (a) {
                return '<li class="' + (a.done ? 'done' : a.value > 0 ? 'going' : '') + '"><span class="pp-mile-mark" aria-hidden="true">' + (a.done ? '✓' : '') + '</span>' +
                    '<span class="pp-ach-body"><span class="pp-ach-name">' + esc(a.label) + '</span><span class="pp-ach-how">' + esc(a.how) + '</span>' +
                    (a.done ? '' : bar(a.value, a.target)) + '</span>' +
                    '<span class="pp-ach-num" translate="no">' + (a.done ? '' : esc(a.value + '/' + a.target)) + '</span>' +
                    '<span class="pp-sr">' + (a.done ? 'Done' : 'Not yet') + '</span></li>';
            }).join('') + '</ul></section>';
    }

    // ---- techniques and riffs

    function techniquesHtml(state, now) {
        var list = P.techniques(state, riffs, now);
        var body;
        if (!list.length) body = '<p class="pp-text">Techniques of the riffs you play show up here once their parts reach tempo.</p>';
        else body = '<ul class="pp-tech">' + list.map(function (t) {
            var dots = '';
            for (var i = 0; i < t.need; i++) dots += '<i class="' + (i < t.riffs ? 'on' : '') + '"></i>';
            var train = t.trainIn && riffById(t.trainIn);
            var detail = t.learned ? 'Learned in ' + t.riffs + ' riffs' : t.riffs + ' of ' + t.need + ' riffs';
            var sub = t.learned ? '' : train ? '<span class="pp-tech-sub">Train it in <a href="' + esc(practiceUrl(train, -1)) + '" translate="no">' + esc(train.song) + '</a></span>' : '';
            return '<li class="' + (t.learned ? 'learned' : t.riffs ? '' : 'none') + '"><span class="pp-tech-main"><span>' + esc(techniqueLabel(t.technique)) + '</span>' + sub + '</span>' +
                '<span class="pp-tech-detail"><span class="pp-dots" aria-hidden="true">' + dots + '</span>' + esc(detail) + '</span></li>';
        }).join('') + '</ul>' +
            (list.some(function (t) { return !t.learned && !t.reachable; }) ? '<p class="pp-label">A technique is learned in three riffs that use it; more riffs are coming to the library.</p>' : '');
        return '<section class="pp-card pp-tech-card"><h3 class="pp-title">Techniques ' +
            hint('A technique counts in a riff when a part that uses it is at ×1. It is learned once you play it at tempo in three different riffs.', 'Techniques') + '</h3>' + body + '</section>';
    }

    function riffsHtml(state, now) {
        var rows = riffs.map(function (riff) { return { riff: riff, sum: P.riffSummary(state, riff, now) }; })
            .filter(function (x) { return x.sum.started > 0 || x.sum.stages.scan; })
            .sort(function (a, b) { return (a.sum.killed - b.sum.killed) || (b.sum.lastAt - a.sum.lastAt); });
        var body;
        if (!rows.length) body = '<p class="pp-text">Riffs you practice show up here with their stars and Riff DNA stages.</p>';
        else body = '<ul class="pp-riffs">' + rows.map(function (x) {
            var s = x.sum;
            var status = s.killed ? 'Killed' : s.stars + ' of ' + s.maxStars + ' stars';
            var extra = s.due.length ? '<span class="pp-due">' + (s.due.length === 1 ? '1 part to review' : s.due.length + ' parts to review') + '</span>'
                : '<span class="pp-due">' + esc('Riff DNA ' + s.stagesDone + '/5') + '</span>';
            return '<li><a href="' + esc(practiceUrl(x.riff, s.next)) + '"><span class="pp-riff-name" translate="no">' + esc(x.riff.song) + '</span>' +
                '<span class="pp-riff-artist" translate="no">' + esc(x.riff.artist || '') + '</span>' +
                '<span class="pp-riff-status">' + esc(status) + extra + '</span>' + bar(s.stars, s.maxStars) + '</a></li>';
        }).join('') + '</ul>';
        return '<section class="pp-card pp-riffs-card"><h3 class="pp-title">Riffs ' +
            hint('Each part earns stars by its best clean speed: one at ×0.5, two at ×0.75, three at ×1. A riff is killed when every part has three stars and you played the whole riff cleanly at ×1 once.', 'Riffs') + '</h3>' + body + '</section>';
    }

    function render() {
        if (!root) return;
        var state = P.load(), now = Date.now();
        root.innerHTML = '<div class="pp-grid">' + heroHtml(state, now) + currentHtml(state, now) + weekHtml(state, now) + winsHtml(state, now) +
            achievementsHtml(state, now) + techniquesHtml(state, now) + riffsHtml(state, now) + '</div>';
        root.querySelectorAll('.pp-goal-btn').forEach(function (b) {
            b.addEventListener('click', function () {
                editingGoal = false;
                P.update(function (s, t) { P.setGoal(s, Number(b.dataset.goal), t); }, { soon: true });
            });
        });
        var email = root.querySelector('#ppEmail');
        if (email) email.addEventListener('change', function () {
            P.update(function (s, t) { P.setEmail(s, email.checked, t); }, { soon: true });
        });
        var change = root.querySelector('#ppChangeGoal');
        if (change) change.addEventListener('click', function () { editingGoal = true; render(); });
    }

    function setRiffs(list) {
        riffs = Array.isArray(list) ? list.filter(function (r) { return r && Array.isArray(r.segments); }) : [];
        render();
    }

    function init(el) {
        root = el;
        if (!root) return;
        P.onChange(render);
        if (global.RK_I18N && global.RK_I18N.onChange) global.RK_I18N.onChange(function () { render(); });
        render();
        P.sync().then(render);
    }

    global.ProfileProgress = { init: init, setRiffs: setRiffs, render: render };
})(typeof window !== 'undefined' ? window : this);
