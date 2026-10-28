/**
 * Progress on the practice page (rules in js/rk-progress.js):
 *  - each part button shows the part’s best clean speed, a check at tempo, a filled check when locked in;
 *  - a line under the parts: how many are at tempo, reviews due;
 *  - after three loops of a part at one speed, a small card asks whether it was clean (only the student
 *    can hear it); at ×1 that puts the part at tempo, or passes its review;
 *  - playing time counts toward today’s practice day; after a pause, a short summary of the session.
 *  - every part shows its stars (★ ×0.5, ★★ ×0.75, ★★★ ×1); a new star or tempo says so in a short toast;
 *  - the whole riff heard once marks Scan; a killed riff opens the kill screen with a card to share.
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

    var STAR = '<svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true" focusable="false"><path d="M6 1.2l1.45 3.05 3.3.4-2.43 2.28.62 3.27L6 8.6 3.06 10.2l.62-3.27L1.25 4.65l3.3-.4z" fill="currentColor"/></svg>';
    function starsHtml(n) {
        var out = '';
        for (var i = 0; i < 3; i++) out += '<i class="part-star' + (i < n ? ' on' : '') + '">' + STAR + '</i>';
        return '<span class="part-stars" aria-hidden="true">' + out + '</span>';
    }
    function markHtml(p) {
        if (p.due) return '<span class="part-progress-review">Review</span>';
        if (p.key === 'locked') return CHECK_FILLED + starsHtml(3);
        if (p.key === 'tempo' || p.key === 'working') return starsHtml(p.stars);
        return '';
    }
    function markTitle(p) {
        if (p.due) return 'Time to review: play it at ×1 once more';
        if (p.key === 'locked') return 'Locked in: three stars and a passed review';
        if (p.key === 'tempo') return 'Three stars: clean at ×1';
        if (p.key === 'working' && p.stars === 2) return 'Two stars: clean at ×0.75. Next: ×1';
        if (p.key === 'working' && p.stars === 1) return 'One star: clean at ×0.5. Next: ×0.75';
        if (p.key === 'working') return 'In progress. First star: clean at ×0.5';
        return '';
    }
    function starLine(n) { return n === 3 ? '★★★' : n === 2 ? '★★' : '★'; }

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

    var HOW = 'Each part earns stars by its best clean speed: one at ×0.5, two at ×0.75, three at ×1. Pick the speed, loop the part three times and say whether it was clean. ' +
        'Three stars on every part and the whole riff once at ×1 kill the riff. In 3 days a part asks to be played once more, and a clean take locks it in.';

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
        var main = sum.killed ? 'Riff killed' : sum.stars + ' of ' + sum.maxStars + ' stars';
        var extra = '';
        if (!sum.killed && !sum.allAtTempo) extra = '<span class="parts-progress-kill">' + (sum.toKill === 1 ? '1 shot to kill' : sum.toKill + ' shots to kill') + '</span>';
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
                    else if (after && after.key === 'tempo' && res.before.key !== 'tempo') ctx.notify('★★★ ' + partName(index) + ': at tempo. We’ll ask you to review it in 3 days.');
                    else if (after && after.stars > res.before.stars) ctx.notify(starLine(after.stars) + ' ' + partName(index) + ': clean at ' + speedLabel(speed) + '.');
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

    /** All Riff reached the end once: that is Scan. At ×1 with every part at tempo, ask about the whole riff. */
    function wholePass() {
        if (!ctx || !ctx.riff) return;
        var speed = Number(ctx.getSpeed()) || 1;
        var scanned = P.update(function (s, now) { return P.markStage(s, ctx.riff.id, 'scan', now); }, { soon: true });
        if (scanned) { ctx.notify('Scan done: you heard the whole riff. Next: Split it into parts.'); changed(); }
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
                    var rankBefore = global.RKProgress.rank(P.load(), allRiffs(), Date.now());
                    P.update(function (s, now) { P.markWhole(s, ctx.riff.id, now); }, { soon: true });
                    changed();
                    showKill(rankBefore);
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
            var to = m.to.key === 'locked' ? 'locked in' : m.to.stars ? starLine(m.to.stars) : 'started';
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

    // ---- the catalog, for ranks (one request, only when a riff is killed or the page asks)
    var catalog = null;
    function loadCatalog() {
        if (catalog) return Promise.resolve(catalog);
        return fetch('api/riffs/list.php', { credentials: 'same-origin' }).then(function (r) { return r.json(); })
            .then(function (list) { catalog = Array.isArray(list) ? list : []; return catalog; })
            .catch(function () { return []; });
    }
    function allRiffs() {
        var list = (catalog || []).slice();
        if (ctx && ctx.riff && !list.some(function (r) { return String(r.id) === String(ctx.riff.id); })) list.push(ctx.riff);
        return list;
    }

    /** The share card: a 1080×1350 picture of the kill, the way Reels and stories crop it. */
    function tr(text) { return global.RK_I18N && global.RK_I18N.t ? global.RK_I18N.t(text) : text; }
    /** Text that fits 900px: the font shrinks a step at a time. */
    function fitText(g, text, weight, size, family, x, y) {
        do { g.font = weight + ' ' + size + 'px ' + family; size -= 2; } while (g.measureText(text).width > 900 && size > 20);
        g.fillText(text, x, y);
    }

    function drawCard(riff, sum) {
        var c = document.createElement('canvas');
        c.width = 1080; c.height = 1350;
        var g = c.getContext('2d');
        var bg = g.createLinearGradient(0, 0, 1080, 1350);
        bg.addColorStop(0, '#1b1030'); bg.addColorStop(0.6, '#0d0d12'); bg.addColorStop(1, '#0a0a0a');
        g.fillStyle = bg; g.fillRect(0, 0, 1080, 1350);
        g.fillStyle = 'rgba(147,85,229,0.35)';
        g.beginPath(); g.arc(880, 220, 340, 0, Math.PI * 2); g.fill();
        var sans = 'Inter, "Helvetica Neue", Arial, sans-serif';
        g.fillStyle = '#c4b5fc'; fitText(g, tr('Riff killed').toUpperCase(), '700', 44, sans, 90, 200);
        g.fillStyle = '#ffffff'; g.font = '800 118px ' + sans;
        var words = String(riff.song || '').split(' '), lineText = '', y = 360;
        words.forEach(function (w) {
            var test = lineText ? lineText + ' ' + w : w;
            if (g.measureText(test).width > 900 && lineText) { g.fillText(lineText, 90, y); y += 128; lineText = w; } else lineText = test;
        });
        g.fillText(lineText, 90, y);
        g.fillStyle = 'rgba(255,255,255,0.7)'; g.font = '500 54px ' + sans; g.fillText(String(riff.artist || ''), 90, y + 90);
        g.fillStyle = '#facc15'; g.font = '700 96px ' + sans; g.fillText('★ ★ ★', 90, 900);
        g.fillStyle = '#ffffff';
        fitText(g, tr(sum.total + ' shots · ' + sum.maxStars + ' stars · every part at full speed'), '600', 50, sans, 90, 1000);
        g.fillStyle = 'rgba(255,255,255,0.55)'; g.font = '500 40px ' + sans;
        var locale = (document.documentElement.lang || 'en').slice(0, 2);
        g.fillText(new Date().toLocaleDateString(locale === 'es' ? 'es-419' : locale === 'ru' ? 'ru-RU' : 'en-US', { month: 'long', day: 'numeric', year: 'numeric' }), 90, 1070);
        g.fillStyle = '#ffffff'; g.font = '700 46px ' + sans; g.fillText('riffkiller.fun', 90, 1250);
        g.fillStyle = 'rgba(255,255,255,0.55)'; fitText(g, tr('Kill every riff. One shot at a time.'), '500', 34, sans, 90, 1300);
        return c;
    }

    function share(riff, sum) {
        var canvas = drawCard(riff, sum);
        canvas.toBlob(function (blob) {
            if (!blob) return;
            var name = 'riffkiller-' + String(riff.song || 'riff').toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.png';
            var file = typeof File === 'function' ? new File([blob], name, { type: 'image/png' }) : null;
            var text = tr('I killed ' + (riff.song || 'a riff') + ' on Riff Killer. riffkiller.fun');
            if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
                navigator.share({ files: [file], text: text }).catch(function () {});
                return;
            }
            var a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = name;
            document.body.appendChild(a);
            a.click();
            setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
            ctx.notify('Card saved. Post it with #riffkiller.');
        }, 'image/png');
    }

    /** The moment the riff is killed: what it took, the rank, and what is left of its DNA. */
    function showKill(rankBefore) {
        var riff = ctx.riff;
        loadCatalog().then(function () {
            var state = P.load(), now = Date.now();
            var sum = P.riffSummary(state, riff, now);
            var rankNow = P.rank(state, allRiffs(), now);
            var days = Object.keys(state.days).filter(function (k) { return state.days[k].riffs && state.days[k].riffs[String(riff.id)]; }).length;
            var old = document.getElementById('killScreen');
            if (old) old.remove();
            var box = document.createElement('div');
            box.id = 'killScreen';
            box.className = 'kill-screen';
            box.setAttribute('role', 'dialog');
            box.setAttribute('aria-modal', 'true');
            box.setAttribute('aria-labelledby', 'killTitle');
            var rankLine = rankBefore && rankNow.index > rankBefore.index
                ? '<p class="kill-rank is-new">New rank: <b>' + esc(rankNow.label) + '</b></p>'
                : rankNow.next ? '<p class="kill-rank">' + (rankNow.next.toGo === 1 ? '1 more kill to ' : rankNow.next.toGo + ' more kills to ') + esc(rankNow.next.label) + '</p>' : '';
            var dnaLine = sum.stageNext === 'decode' ? 'Finish its DNA: read the rule that holds it together, then turn it into your own riff.'
                : sum.stageNext === 'mutate' ? 'Finish its DNA: change one thing and keep the riff recognisable.' : '';
            box.innerHTML = '<div class="kill-card">' +
                '<p class="kill-kicker">Riff killed</p>' +
                '<h2 class="kill-title" id="killTitle" translate="no">' + esc(riff.song || '') + '</h2>' +
                '<p class="kill-artist" translate="no">' + esc(riff.artist || '') + '</p>' +
                '<p class="kill-stars" aria-hidden="true">★ ★ ★</p>' +
                '<ul class="kill-stats"><li>' + (sum.total === 1 ? '1 shot' : sum.total + ' shots') + ' at ×1</li>' +
                (days > 0 ? '<li>' + (days === 1 ? 'Practised on 1 day' : 'Practised on ' + days + ' days') + '</li>' : '') + '</ul>' +
                rankLine + (dnaLine ? '<p class="kill-dna">' + esc(dnaLine) + '</p>' : '') +
                '<div class="kill-actions">' +
                '<button type="button" class="progress-card-btn primary" id="killShare">Share card</button>' +
                (sum.stageNext === 'decode' || sum.stageNext === 'mutate'
                    ? '<button type="button" class="progress-card-btn" id="killDna">' + (sum.stageNext === 'decode' ? 'Decode the rule' : 'Mutate it') + '</button>'
                    : '<a class="progress-card-btn" href="profile.html#progress">Next riff</a>') +
                '<button type="button" class="progress-card-btn" id="killClose">Close</button></div></div>';
            document.body.appendChild(box);
            var close = function () { box.remove(); document.removeEventListener('keydown', onKey); };
            var onKey = function (e) { if (e.key === 'Escape') close(); };
            document.addEventListener('keydown', onKey);
            box.addEventListener('click', function (e) { if (e.target === box) close(); });
            box.querySelector('#killClose').addEventListener('click', close);
            box.querySelector('#killShare').addEventListener('click', function () { share(riff, sum); });
            var dna = box.querySelector('#killDna');
            if (dna) dna.addEventListener('click', function () {
                close();
                var tab = document.querySelector('.dna-stage[data-dna-stage="' + sum.stageNext + '"]');
                if (tab) { tab.click(); tab.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
            });
            box.querySelector('#killShare').focus();
        });
    }

    function init(options) {
        ctx = options;
        run = null;
        asked = {};
        played = 0; unsaved = 0; paused = 0; summaryShown = false; changedSinceSummary = false;
        closeCard();
        baseline = summary();
        refresh();
        loadCatalog();
        P.sync().then(function () { baseline = summary(); refresh(); });
        if (bound) return;
        bound = true;
        P.onChange(refresh);
        var flush = function () { save(true); P.flush(); };
        document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flush(); });
        global.addEventListener('pagehide', flush);
    }

    /** Decode or Mutate marked from the Riff DNA panel (js/riff-dna.js). */
    function markStage(stage) {
        if (!ctx || !ctx.riff) return false;
        var first = P.update(function (s, now) { return P.markStage(s, ctx.riff.id, stage, now); }, { soon: true });
        if (first) {
            ctx.notify(stage === 'decode' ? 'Decode done: you know the rule of this riff.' : 'Mutate done: the riff’s DNA is complete.');
            changed();
        }
        return first;
    }

    global.PracticeProgress = { init: init, loop: loop, wholePass: wholePass, tick: tick, refresh: refresh, showSummary: showSummary,
        markStage: markStage, showKill: showKill, drawCard: drawCard };
})(typeof window !== 'undefined' ? window : this);
