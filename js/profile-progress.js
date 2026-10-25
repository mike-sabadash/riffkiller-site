/**
 * “Your progress” on the profile (rules in js/rk-progress.js): this week against the goal, the last 12 weeks,
 * what to play next, riffs in progress and learned, techniques played at tempo, and a few milestones.
 * Every number says how it is counted; nothing is scored in points.
 */
(function (global) {
    'use strict';

    var P = global.RKProgress;
    var riffs = [];
    var root = null;
    var editingGoal = false;
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

    function goalPicker(current) {
        return '<div class="pp-goal-options" role="group" aria-label="Weekly goal">' +
            P.GOALS.map(function (g) {
                return '<button type="button" class="pp-goal-btn' + (g === current ? ' active' : '') + '" data-goal="' + g + '" aria-pressed="' + (g === current) + '">' + g + ' days</button>';
            }).join('') + '</div>';
    }

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
            head = '<div class="pp-week-figures">' +
                '<p class="pp-big"><span class="pp-big-num">' + w.count + '</span><span class="pp-big-of"> of ' + w.goal + ' days</span></p>' +
                '<p class="pp-meta">' + (w.met ? 'Goal met this week' : 'This week') + ' · ' + w.minutes + ' min</p>' +
                '</div>' +
                '<dl class="pp-facts"><div><dt>Weeks in a row</dt><dd>' + w.weeksInRow + '</dd></div>' +
                '<div><dt>Goal</dt><dd>' + w.goal + ' days a week <button type="button" class="pp-link" id="ppChangeGoal">Change</button></dd></div></dl>';
        }
        var cal = P.calendar(state, now, 12);
        var calHtml = '<div class="pp-calendar" aria-label="Practice days, last 12 weeks">' + cal.map(function (week) {
            return '<span class="pp-cal-week">' + week.map(function (d) {
                return '<i class="' + (d.done ? 'done' : d.sec > 0 ? 'some' : '') + (d.future ? ' future' : '') + '" title="' + esc(d.key) + '"></i>';
            }).join('') + '</span>';
        }).join('') + '</div>';
        return '<section class="pp-card pp-week">' +
            '<h3 class="pp-title">This week ' + hint('A practice day is 5 minutes of the video actually playing on the practice page. The week starts on Monday. Weeks in a row counts weeks that met your goal; the current week joins the run once it is met.', 'practice day') + '</h3>' +
            '<div class="pp-days">' + days + '</div>' + head +
            '<p class="pp-label">Last 12 weeks</p>' + calHtml + '</section>';
    }

    function nextHtml(state, now) {
        var n = P.nextStep(state, riffs, now);
        var title, text, label, url;
        if (!n) {
            title = 'Pick a riff to start';
            text = 'Open any riff, loop a part and Speed Trainer will bring it up to speed.';
            label = 'Open riffs'; url = 'index.html';
        } else if (n.kind === 'review') {
            title = 'Review: ' + n.riff.song;
            text = partName(n.riff, n.part) + ' reached tempo a few days ago. Play it once at ×1 to lock it in.';
            label = 'Review'; url = practiceUrl(n.riff, n.part);
        } else if (n.kind === 'continue') {
            title = 'Continue ' + n.riff.song;
            text = 'Next part: ' + partName(n.riff, n.part) + '.';
            label = 'Continue'; url = practiceUrl(n.riff, n.part);
        } else if (n.kind === 'whole') {
            title = 'Finish ' + n.riff.song;
            text = 'Every part is at tempo. Play All Riff once at ×1.';
            label = 'Play the riff'; url = practiceUrl(n.riff, -1);
        } else {
            title = 'Try ' + n.riff.song;
            var nt = (n.newTechniques || []).map(techniqueLabel);
            text = nt.length === 1 ? 'One new technique: ' + nt[0] + '. The rest you already play.'
                : nt.length === 0 ? 'Uses techniques you already play.' : 'New techniques: ' + nt.join(', ') + '.';
            label = 'Start'; url = practiceUrl(n.riff, 0);
        }
        return '<section class="pp-card pp-next"><h3 class="pp-title">Next</h3>' +
            '<p class="pp-next-title">' + esc(title) + '</p><p class="pp-text">' + esc(text) + '</p>' +
            '<a class="pp-btn" href="' + esc(url) + '">' + esc(label) + '</a></section>';
    }

    function riffsHtml(state, now) {
        var rows = riffs.map(function (riff) { return { riff: riff, sum: P.riffSummary(state, riff, now) }; })
            .filter(function (x) { return x.sum.started > 0; })
            .sort(function (a, b) { return (a.sum.learned - b.sum.learned) || (b.sum.lastAt - a.sum.lastAt); });
        var body;
        if (!rows.length) body = '<p class="pp-text">Riffs you practice show up here with how many parts are at tempo.</p>';
        else body = '<ul class="pp-riffs">' + rows.map(function (x) {
            var s = x.sum;
            var status = s.learned ? 'Learned' : s.atTempo + ' of ' + s.total + ' parts at tempo';
            var extra = s.due.length ? '<span class="pp-due">' + (s.due.length === 1 ? '1 part to review' : s.due.length + ' parts to review') + '</span>' : '';
            var pct = s.total ? Math.round(s.atTempo / s.total * 100) : 0;
            return '<li><a href="' + esc(practiceUrl(x.riff, s.next)) + '"><span class="pp-riff-name" translate="no">' + esc(x.riff.song) + '</span>' +
                '<span class="pp-riff-artist" translate="no">' + esc(x.riff.artist || '') + '</span>' +
                '<span class="pp-riff-status">' + esc(status) + extra + '</span>' +
                '<span class="pp-bar" aria-hidden="true"><i style="width:' + pct + '%"></i></span></a></li>';
        }).join('') + '</ul>';
        return '<section class="pp-card pp-riffs-card"><h3 class="pp-title">Riffs ' +
            hint('A part is at tempo when you play it cleanly at ×1. A riff is learned when every part is at tempo and you played the whole riff cleanly at ×1 once.', 'Riffs') + '</h3>' + body + '</section>';
    }

    function techniquesHtml(state, now) {
        var list = P.techniques(state, riffs, now);
        var body;
        if (!list.length) body = '<p class="pp-text">Techniques of the riffs you play show up here once their parts reach tempo.</p>';
        else body = '<ul class="pp-tech">' + list.map(function (t) {
            var detail = t.learned ? 'Learned · ' + t.riffs + ' riffs'
                : t.parts ? (t.parts === 1 ? '1 part' : t.parts + ' parts') + ' · ' + (t.riffs === 1 ? '1 riff' : t.riffs + ' riffs')
                : 'Not yet';
            return '<li class="' + (t.learned ? 'learned' : t.parts ? '' : 'none') + '"><span>' + esc(techniqueLabel(t.technique)) + '</span><span class="pp-tech-detail">' + esc(detail) + '</span></li>';
        }).join('') + '</ul>';
        return '<section class="pp-card pp-tech-card"><h3 class="pp-title">Techniques ' +
            hint('A technique counts when a part that uses it is at tempo. It is learned once you play it at tempo in three different riffs.', 'Techniques') + '</h3>' + body + '</section>';
    }

    function milestonesHtml(state, now) {
        var sums = riffs.map(function (r) { return P.riffSummary(state, r, now); });
        var anyTempo = sums.some(function (s) { return s.atTempo > 0; });
        var anyLearned = sums.some(function (s) { return s.learned; });
        var techLearned = P.techniques(state, riffs, now).some(function (t) { return t.learned; });
        var w = P.weekSummary(state, now);
        var items = [
            ['First part at tempo', anyTempo],
            ['First riff learned', anyLearned],
            ['First technique learned in three riffs', techLearned],
            ['Weekly goal met 4 weeks in a row', w.weeksInRow >= 4]
        ];
        return '<section class="pp-card pp-miles"><h3 class="pp-title">Milestones</h3><ul class="pp-miles-list">' + items.map(function (m) {
            return '<li class="' + (m[1] ? 'done' : '') + '"><span class="pp-mile-mark" aria-hidden="true"></span><span>' + esc(m[0]) + '</span>' +
                '<span class="pp-sr">' + (m[1] ? 'Done' : 'Not yet') + '</span></li>';
        }).join('') + '</ul></section>';
    }

    function render() {
        if (!root) return;
        var state = P.load(), now = Date.now();
        root.innerHTML = '<div class="pp-grid">' + nextHtml(state, now) + weekHtml(state, now) + milestonesHtml(state, now) +
            riffsHtml(state, now) + techniquesHtml(state, now) + '</div>';
        root.querySelectorAll('.pp-goal-btn').forEach(function (b) {
            b.addEventListener('click', function () {
                editingGoal = false;
                P.update(function (s, t) { P.setGoal(s, Number(b.dataset.goal), t); }, { soon: true });
            });
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
