/**
 * Progress on the practice page (rules in js/rk-progress.js):
 *  - each part button shows the part’s best clean speed, a check at tempo, a filled check when locked in;
 *  - a line under the parts: how many are at tempo, reviews due;
 *  - after three loops of a part at one speed, a small card asks whether it was clean (only the student
 *    can hear it); at ×1 that puts the part at tempo, or passes its review;
 *  - playing time counts toward today’s practice day; after a pause, a short summary of the session.
 * practice.js calls init(), loop(), wholePass() and tick(); everything else lives here.
 */
(function (global) {
    'use strict';

    var P = global.RKProgress;
    var LOOPS_TO_ASK = 3;
    var ASK_AGAIN_AFTER = 6;
    var SUMMARY_AFTER_PAUSE = 45;
    var SUMMARY_MIN_PLAYED = 120;

    var ctx = null;      // { riff, getSpeed(), getMode(), playPart(index), notify(text) }
    var run = null;      // consecutive loops of one part at one speed
    var asked = {};      // 'index@speed' → loops count when asked
    var card = null;
    var line = null;
    var baseline = null;
    var bound = false;
    var played = 0, unsaved = 0, paused = 0, summaryShown = false, changedSinceSummary = false;

    function esc(v) {
        return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function speedLabel(s) { s = Number(s) || 1; return s >= 1 ? '×1' : '×' + String(s).replace(/^0/, '0'); }
    function segments() { return (ctx && ctx.riff && ctx.riff.segments) || []; }
    function partName(i) {
        var s = segments()[i] || {};
        return s.displayName || s.name || ('Shot ' + (i + 1));
    }
    function summary() { return P.riffSummary(P.load(), ctx.riff, Date.now()); }

    var CHECK = '<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" focusable="false"><circle cx="6" cy="6" r="5.25" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M3.6 6.2l1.7 1.7 3.2-3.4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    var CHECK_FILLED = '<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" focusable="false"><circle cx="6" cy="6" r="6" fill="currentColor"/><path d="M3.6 6.2l1.7 1.7 3.2-3.4" fill="none" stroke="var(--rk-progress-knockout, #141417)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    function markHtml(p) {
        if (p.due) return '<span class="part-progress-review">Review</span>';
        if (p.key === 'locked') return CHECK_FILLED + '<span translate="no">×1</span>';
        if (p.key === 'tempo') return CHECK + '<span translate="no">×1</span>';
        if (p.key === 'working' && p.best > 0) return '<span translate="no">' + speedLabel(p.best) + '</span>';
        return '';
    }
    function markTitle(p) {
        if (p.due) return 'Time to review: play it at ×1 once more';
        if (p.key === 'locked') return 'Locked in';
        if (p.key === 'tempo') return 'At tempo';
        if (p.key === 'working' && p.best > 0) return 'Best clean speed';
        if (p.key === 'working') return 'In progress';
        return '';
    }

    function paintButtons(sum) {
        var buttons = document.querySelectorAll('#segmentControls .segment-btn:not(.all-riff)');
        buttons.forEach(function (btn, i) {
            var p = sum.parts[i];
            if (!p) return;
            var el = btn.querySelector('.part-progress');
            if (!el) {
                el = document.createElement('span');
                el.className = 'part-progress';
                var name = btn.querySelector('.segment-name');
                if (name && name.nextSibling) btn.insertBefore(el, name.nextSibling);
                else btn.appendChild(el);
            }
            var html = markHtml(p);
            if (el.innerHTML !== html) el.innerHTML = html;
            el.hidden = !html;
            el.dataset.state = p.key + (p.due ? ' due' : '');
            var title = markTitle(p);
            if (title) el.setAttribute('data-tip', title); else el.removeAttribute('data-tip');
        });
    }

    var HOW = 'A part is at tempo when you play it cleanly at ×1: Speed Trainer asks after three loops at full speed. ' +
        'In 3 days it asks you to play it once more, and a second clean take locks it in. More reviews after 10 and 30 days.';

    function paintLine(sum) {
        if (!line) {
            var host = document.querySelector('.segment-controls-container');
            if (!host) return;
            line = document.createElement('div');
            line.className = 'parts-progress';
            line.id = 'partsProgress';
            host.appendChild(line);
        }
        if (!sum.total) { line.hidden = true; return; }
        line.hidden = false;
        var main = sum.learned ? 'Riff learned' : sum.atTempo + ' of ' + sum.total + ' parts at tempo';
        var extra = '';
        if (sum.due.length) extra = '<span class="parts-progress-due">' + (sum.due.length === 1 ? '1 part to review' : sum.due.length + ' parts to review') + '</span>';
        else if (sum.allAtTempo && !sum.whole) extra = '<span class="parts-progress-due">Play All Riff at ×1 to finish</span>';
        var hint = global.RKHint && global.RKHint.icon ? global.RKHint.icon(HOW, 'at tempo') : '';
        var html = '<span class="parts-progress-main">' + esc(main) + '</span>' + extra + hint;
        if (line.innerHTML !== html) line.innerHTML = html;
    }

    function refresh() {
        if (!ctx || !ctx.riff) return;
        var sum = summary();
        paintButtons(sum);
        paintLine(sum);
    }

    function closeCard() {
        if (card) card.remove();
        card = null;
    }

    function showCard(opts) {
        closeCard();
        var host = document.querySelector('.segment-controls-container');
        if (!host) return;
        card = document.createElement('div');
        card.className = 'progress-card' + (opts.className ? ' ' + opts.className : '');
        card.setAttribute('role', 'status');
        card.innerHTML =
            '<button type="button" class="progress-card-close" aria-label="Close">' +
            '<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></button>' +
            (opts.kicker ? '<p class="progress-card-kicker" translate="no">' + esc(opts.kicker) + '</p>' : '') +
            '<h3 class="progress-card-title">' + esc(opts.title) + '</h3>' +
            (opts.body || '') +
            (opts.text ? '<p class="progress-card-text">' + esc(opts.text) + '</p>' : '') +
            '<div class="progress-card-actions"></div>';
        var actions = card.querySelector('.progress-card-actions');
        (opts.actions || []).forEach(function (a) {
            var b = document.createElement('button');
            b.type = 'button';
            b.className = 'progress-card-btn' + (a.primary ? ' primary' : '');
            b.textContent = a.label;
            if (a.id) b.id = a.id;
            b.addEventListener('click', function () { closeCard(); a.onClick && a.onClick(); });
            actions.appendChild(b);
        });
        card.querySelector('.progress-card-close').addEventListener('click', function () { closeCard(); opts.onClose && opts.onClose(); });
        host.insertBefore(card, host.firstChild);
    }

    function changed() {
        changedSinceSummary = true;
        refresh();
    }

    function askClean(index, speed) {
        var full = speed >= 1;
        var st = summary().parts[index];
        var review = full && st.due;
        var key = index + '@' + speed;
        showCard({
            className: 'progress-card--ask',
            kicker: partName(index) + ' · ' + speedLabel(speed),
            title: review ? 'Review: still clean at full speed?' : full ? 'Three loops at full speed. Clean?' : 'Three loops at this speed. Clean?',
            text: review ? 'You got this part to tempo a few days ago. Yes locks it in.'
                : full ? 'Only you can hear it. Yes puts this part at tempo, and in 3 days we’ll ask you to play it once more.'
                : 'Only you can hear it. Yes saves this as your best clean speed for the part.',
            actions: [
                { label: 'Yes, clean', primary: true, id: 'progressCleanYes', onClick: function () {
                    var res = P.update(function (s, now) { return P.markClean(s, ctx.riff.id, segments(), index, speed, now); }, { soon: true });
                    var after = res && res.after;
                    if (after && after.key === 'locked' && res.before.key !== 'locked') ctx.notify('Locked in. Next review in 10 days.');
                    else if (after && after.key === 'locked') ctx.notify('Still clean. Next review in 30 days.');
                    else if (after && after.key === 'tempo' && res.before.key !== 'tempo') ctx.notify('At tempo. We’ll ask you to review it in 3 days.');
                    else ctx.notify('Best speed saved.');
                    changed();
                } },
                { label: 'Not yet', id: 'progressCleanNo', onClick: function () {
                    asked[key] = { at: (run && run.loops) || 0, again: true };
                    if (review) {
                        P.update(function (s, now) { return P.reviewMissed(s, ctx.riff.id, segments(), index, now); });
                        ctx.notify('It stays at tempo. We’ll ask again in 3 days.');
                        changed();
                    }
                } }
            ],
            onClose: function () { asked[key] = { at: (run && run.loops) || 0, again: true }; }
        });
    }

    /** Should three (or more) loops at this speed open the question? */
    function shouldAsk(index, speed, loops) {
        var st = summary().parts[index];
        if (!st) return false;
        var mode = ctx.getMode();
        var full = speed >= 1;
        if (full) {
            if (st.key === 'tempo' || st.key === 'locked') { if (!st.due) return false; }
        } else {
            // Speed Trainer moves on by itself below ×1; asking there would interrupt every step.
            if (mode === 'speed') return false;
            if (st.key === 'tempo' || st.key === 'locked' || speed <= st.best) return false;
        }
        var key = index + '@' + speed;
        var a = asked[key];
        if (!a) return loops >= LOOPS_TO_ASK;
        if (a.again && loops >= a.at + ASK_AGAIN_AFTER) { asked[key] = { at: loops, again: false }; return true; }
        return false;
    }

    /** One full loop of a part finished. */
    function loop(index) {
        if (!ctx || !ctx.riff || index == null || index < 0) return;
        var speed = Math.min(1, Number(ctx.getSpeed()) || 1);
        if (!run || run.index !== index || run.speed !== speed) run = { index: index, speed: speed, loops: 0 };
        run.loops += 1;
        var before = summary().parts[index];
        P.update(function (s, now) { return P.recordLoop(s, ctx.riff.id, segments(), index, now); }, { quiet: true });
        if (before && before.key === 'new') changed();
        if (shouldAsk(index, speed, run.loops)) {
            asked[index + '@' + speed] = asked[index + '@' + speed] || { at: run.loops, again: false };
            askClean(index, speed);
        }
    }

    /** All Riff reached the end once. At ×1 with every part at tempo, ask about the whole riff. */
    function wholePass() {
        if (!ctx || !ctx.riff) return;
        var speed = Number(ctx.getSpeed()) || 1;
        var sum = summary();
        if (speed < 1 || !sum.allAtTempo || sum.whole || asked.whole) return;
        asked.whole = true;
        showCard({
            className: 'progress-card--ask',
            kicker: (ctx.riff.song || '') + ' · ×1',
            title: 'The whole riff at full speed. Clean?',
            text: 'Every part is at tempo. Yes marks the riff as learned.',
            actions: [
                { label: 'Yes, clean', primary: true, onClick: function () {
                    P.update(function (s, now) { P.markWhole(s, ctx.riff.id, now); }, { soon: true });
                    ctx.notify('Riff learned.');
                    changed();
                } },
                { label: 'Not yet', onClick: function () { asked.whole = false; } }
            ]
        });
    }

    function weekLine() {
        var w = P.weekSummary(P.load(), Date.now());
        if (!w.goal) return '';
        return '<p class="progress-card-week">This week: ' + w.count + ' of ' + w.goal + ' days</p>';
    }

    function goalPicker() {
        return '<div class="progress-goal"><p class="progress-card-text">How many days a week do you want to play? A day counts after 5 minutes of playing; missed days don’t reset the week.</p>' +
            '<div class="progress-goal-options" role="group" aria-label="Weekly goal">' +
            P.GOALS.map(function (g) { return '<button type="button" class="progress-goal-btn" data-goal="' + g + '">' + g + ' days</button>'; }).join('') +
            '</div></div>';
    }

    function bindGoal(root) {
        if (!root) return;
        root.querySelectorAll('.progress-goal-btn').forEach(function (b) {
            b.addEventListener('click', function () {
                var g = Number(b.dataset.goal);
                P.update(function (s, now) { P.setGoal(s, g, now); }, { soon: true });
                var box = b.closest('.progress-goal');
                if (box) box.outerHTML = weekLine();
            });
        });
    }

    function showSummary() {
        var sum = summary();
        var moved = baseline ? P.sessionDiff(baseline, sum) : [];
        var rows = moved.slice(0, 4).map(function (m) {
            var to = m.to.key === 'locked' ? 'locked in' : m.to.key === 'tempo' ? 'at tempo' : m.to.best ? 'best ' + speedLabel(m.to.best) : 'started';
            return '<li><span translate="no">' + esc(partName(m.part)) + '</span><b>' + esc(to) + '</b></li>';
        }).join('');
        var w = P.weekSummary(P.load(), Date.now());
        var minutes = Math.max(1, Math.round(played / 60));
        var nextIndex = sum.next;
        var actions = [];
        if (nextIndex >= 0) actions.push({ label: 'Next part', primary: true, onClick: function () { ctx.playPart(nextIndex); } });
        actions.push({ label: 'Done for today' });
        showCard({
            className: 'progress-card--summary',
            kicker: (ctx.riff.song || '') ,
            title: 'This session: ' + minutes + ' min',
            body: (rows ? '<ul class="progress-card-list">' + rows + '</ul>' : '') + (w.goal ? weekLine() : goalPicker()),
            actions: actions
        });
        bindGoal(card);
        summaryShown = true;
        changedSinceSummary = false;
    }

    function save(force) {
        if (!unsaved || (!force && unsaved < 15)) return;
        var sec = unsaved;
        unsaved = 0;
        P.update(function (s, now) { P.addPlayTime(s, ctx.riff.id, sec, now); }, { quiet: true });
    }

    /** Called every second with whether the video is really playing. */
    function tick(playing) {
        if (!ctx || !ctx.riff) return;
        if (playing && document.visibilityState !== 'hidden') {
            played += 1;
            unsaved += 1;
            paused = 0;
            save(false);
            return;
        }
        save(true);
        paused += 1;
        if (paused === SUMMARY_AFTER_PAUSE && played >= SUMMARY_MIN_PLAYED && (!summaryShown || changedSinceSummary) &&
            !(card && card.classList.contains('progress-card--ask'))) {
            showSummary();
        }
    }

    function init(options) {
        ctx = options;
        run = null;
        asked = {};
        played = 0; unsaved = 0; paused = 0; summaryShown = false; changedSinceSummary = false;
        closeCard();
        baseline = summary();
        refresh();
        P.sync().then(function () { baseline = summary(); refresh(); });
        if (bound) return;
        bound = true;
        P.onChange(refresh);
        var flush = function () { save(true); P.flush(); };
        document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flush(); });
        global.addEventListener('pagehide', flush);
    }

    global.PracticeProgress = { init: init, loop: loop, wholePass: wholePass, tick: tick, refresh: refresh, showSummary: showSummary };
})(typeof window !== 'undefined' ? window : this);
