/**
 * Practice page tour: dims the page, lights up one control at a time with a short note and Next.
 * Runs once on the first visit (localStorage rkPracticeTourSeen); the "?" next to Tabs starts it again.
 * Steps whose control is hidden (no DNA for this riff, a narrow screen) are skipped.
 */
(function (global) {
    'use strict';

    var KEY = 'rkPracticeTourSeen';
    var STEPS = [
        { target: '.practice-parts', title: 'Riff parts', text: 'The riff is cut into short parts. Tap one and it keeps repeating while you learn it.' },
        { target: '#riffTimeline', title: 'Parts on the video', text: 'The bars on the video are the same parts. They show where you are now.' },
        { target: '.hand-controls', title: 'Cameras', text: 'Watch the left hand, the right hand or both at once.' },
        { target: '.speed-controls', title: 'Speed', text: 'Can’t keep up? Slow it down to ×0.75 or ×0.5.' },
        { target: '.practice-speed-mode', title: 'Speed Trainer', text: 'The speed goes up by itself: ×0.5, ×0.75, ×1. The “i” explains how.' },
        { target: '#dnaLab', title: 'Riff DNA', text: 'What the riff is made of and which techniques it uses. Go through the tabs from left to right.' },
        { target: '#practiceHelp', title: 'Help', text: 'Open this tour again here any time.' }
    ];
    var ARROW = '<svg class="tour-arrow" viewBox="0 0 44 34" width="44" height="34" aria-hidden="true" focusable="false">' +
        '<path d="M4 30c7-1.5 17-6 24-13.5 3.2-3.4 5.6-7.4 7.4-11.6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>' +
        '<path d="M28.8 8.6c2.3-1.4 4.6-3.3 6.6-4.8.7 2.7 1.1 5.3 1.9 8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    var root = null, spot = null, card = null, steps = [], index = 0, raf = 0, onKey = null;

    function seen() {
        try { return localStorage.getItem(KEY) === '1'; } catch (e) { return true; }
    }
    function markSeen() {
        try { localStorage.setItem(KEY, '1'); } catch (e) {}
    }
    function visible(el) {
        if (!el || !el.getClientRects().length) return false;
        var r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
    }

    function build() {
        root = document.createElement('div');
        root.className = 'tour';
        root.innerHTML = '<div class="tour-shade"></div><div class="tour-spot"></div>' +
            '<div class="tour-card" role="dialog" aria-modal="true" aria-labelledby="tourTitle" aria-describedby="tourText">' + ARROW +
            '<h2 class="tour-title" id="tourTitle"></h2><p class="tour-text" id="tourText"></p>' +
            '<div class="tour-foot"><span class="tour-count"></span><button type="button" class="tour-skip">Skip</button>' +
            '<button type="button" class="tour-next"></button></div></div>';
        document.body.appendChild(root);
        spot = root.querySelector('.tour-spot');
        card = root.querySelector('.tour-card');
        root.querySelector('.tour-skip').addEventListener('click', finish);
        root.querySelector('.tour-next').addEventListener('click', next);
        // A tap on the dimmed page moves on, so the tour never feels stuck.
        root.querySelector('.tour-shade').addEventListener('click', next);
        onKey = function (e) {
            if (e.key === 'Escape') { e.preventDefault(); finish(); }
            else if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
        };
        document.addEventListener('keydown', onKey, true);
        global.addEventListener('resize', schedule);
        global.addEventListener('scroll', schedule, true);
    }

    function schedule() {
        if (raf) return;
        raf = requestAnimationFrame(function () { raf = 0; place(); });
    }

    // Lights up the step's control and puts the note under it, over it, or (phone, tall controls) at the bottom.
    function place() {
        if (!root) return;
        var el = steps[index] && document.querySelector(steps[index].target);
        if (!el) return;
        var r = el.getBoundingClientRect(), vw = global.innerWidth, vh = global.innerHeight, pad = 6;
        var top = Math.max(r.top - pad, 8), bottom = Math.min(r.bottom + pad, vh - 8);
        spot.style.left = (r.left - pad) + 'px';
        spot.style.top = top + 'px';
        spot.style.width = (r.width + pad * 2) + 'px';
        spot.style.height = Math.max(bottom - top, 0) + 'px';
        var cw = card.offsetWidth, ch = card.offsetHeight, gap = 18, x, y, below;
        if (vh - bottom >= ch + gap + 8) { y = bottom + gap; below = true; }
        else if (top >= ch + gap + 8) { y = top - gap - ch; below = false; }
        else { y = vh - ch - 12; below = null; }
        x = Math.min(Math.max(r.left, 16), vw - cw - 16);
        card.style.left = x + 'px';
        card.style.top = y + 'px';
        card.dataset.side = below === true ? 'below' : below === false ? 'above' : 'over';
        // The drawn arrow leans toward the control's middle.
        var arrowX = Math.min(Math.max(r.left + r.width / 2 - x - 22, 12), cw - 56);
        card.style.setProperty('--arrow-x', arrowX + 'px');
    }

    function show(i) {
        index = i;
        var step = steps[i], el = document.querySelector(step.target);
        root.querySelector('.tour-title').textContent = step.title; // js/i18n.js translates new text in place
        root.querySelector('.tour-text').textContent = step.text;
        root.querySelector('.tour-count').textContent = (i + 1) + ' / ' + steps.length;
        root.querySelector('.tour-next').textContent = i === steps.length - 1 ? 'Done' : 'Next';
        var r = el.getBoundingClientRect();
        // Bring the control into view, leaving room for the note below it.
        if (r.top < 70 || r.bottom > global.innerHeight - 180) {
            el.scrollIntoView({ block: r.height > global.innerHeight * 0.5 ? 'start' : 'center' });
        }
        place();
        root.querySelector('.tour-next').focus({ preventScroll: true });
    }

    function next() {
        if (index < steps.length - 1) show(index + 1); else finish();
    }

    function finish() {
        markSeen();
        if (!root) return;
        document.removeEventListener('keydown', onKey, true);
        global.removeEventListener('resize', schedule);
        global.removeEventListener('scroll', schedule, true);
        root.remove();
        root = spot = card = null;
    }

    function start() {
        if (root) return;
        steps = STEPS.filter(function (s) { return visible(document.querySelector(s.target)); });
        if (!steps.length) return;
        build();
        show(0);
    }

    function init() {
        var help = document.getElementById('practiceHelp');
        if (help) help.addEventListener('click', start);
        if (!seen()) start();
    }

    global.PracticeTour = { init: init, start: start, isOpen: function () { return !!root; } };
})(window);
