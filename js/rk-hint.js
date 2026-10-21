/**
 * Small dark hints for terms on the site (Riff DNA roles, techniques, stages).
 * Markup: any element with data-tip="English text" shows the hint on hover or focus;
 * the round "i" button from RKHint.icon() also opens it on tap, for touch screens.
 * The text is read from data-tip each time the hint opens, so a translated attribute is picked up.
 */
(function (global) {
    'use strict';

    var tip = null;
    var owner = null;
    var pinned = false;
    var MARGIN = 12;

    function esc(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }

    // label: what the hint is about, for screen readers ("Call").
    function icon(text, label) {
        if (!text) return '';
        return '<button type="button" class="rk-hint" data-tip="' + esc(text) + '" aria-label="' + esc(label ? 'What is ' + label : 'More info') + '">' +
            '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">' +
            '<circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" stroke-width="1.3"/>' +
            '<circle cx="8" cy="4.9" r="0.95" fill="currentColor"/>' +
            '<path d="M8 7.2v4.6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></button>';
    }

    function ensure() {
        if (tip) return tip;
        tip = document.createElement('div');
        tip.className = 'rk-tip';
        tip.id = 'rkTip';
        tip.setAttribute('role', 'tooltip');
        tip.hidden = true;
        document.body.appendChild(tip);
        return tip;
    }

    function place(el) {
        var r = el.getBoundingClientRect();
        var w = tip.offsetWidth, h = tip.offsetHeight;
        var vw = document.documentElement.clientWidth;
        var left = Math.min(Math.max(MARGIN, r.left + r.width / 2 - w / 2), vw - w - MARGIN);
        var above = r.top - h - 8;
        var below = above < MARGIN;
        var top = below ? r.bottom + 8 : above;
        tip.classList.toggle('rk-tip--below', below);
        tip.style.left = Math.round(left + global.scrollX) + 'px';
        tip.style.top = Math.round(top + global.scrollY) + 'px';
        tip.style.setProperty('--arrow', Math.round(r.left + r.width / 2 - left) + 'px');
    }

    function show(el, pin) {
        var text = el.getAttribute('data-tip');
        if (!text) return;
        ensure();
        if (owner && owner !== el) owner.removeAttribute('aria-describedby');
        owner = el;
        pinned = !!pin;
        tip.textContent = text;
        tip.hidden = false;
        el.setAttribute('aria-describedby', 'rkTip');
        if (el.classList.contains('rk-hint')) el.setAttribute('aria-expanded', 'true');
        place(el);
    }

    function hide() {
        if (!tip || tip.hidden) return;
        tip.hidden = true;
        if (owner) {
            owner.removeAttribute('aria-describedby');
            if (owner.classList.contains('rk-hint')) owner.setAttribute('aria-expanded', 'false');
        }
        owner = null;
        pinned = false;
    }

    function target(event) {
        return event.target && event.target.closest ? event.target.closest('[data-tip]') : null;
    }

    // Hover only with a mouse: on touch screens a tap on a part button must just play it.
    document.addEventListener('pointerover', function (event) {
        if (event.pointerType !== 'mouse') return;
        var el = target(event);
        if (el && el !== owner) show(el, false);
    });
    document.addEventListener('pointerout', function (event) {
        if (event.pointerType !== 'mouse') return;
        var el = target(event);
        if (el && el === owner && !pinned && !el.contains(event.relatedTarget)) hide();
    });
    document.addEventListener('focusin', function (event) {
        var el = target(event);
        if (el) show(el, false);
    });
    document.addEventListener('focusout', function (event) {
        if (target(event) === owner && !pinned) hide();
    });
    // Tap on the "i": open and keep it until the next tap anywhere. It never triggers the control around it.
    document.addEventListener('click', function (event) {
        var hint = event.target && event.target.closest ? event.target.closest('.rk-hint') : null;
        if (hint) {
            event.preventDefault();
            event.stopPropagation();
            if (owner === hint && pinned) hide(); else show(hint, true);
            return;
        }
        if (pinned) hide();
    }, true);
    document.addEventListener('keydown', function (event) { if (event.key === 'Escape') hide(); });
    global.addEventListener('scroll', function () { if (owner && !tip.hidden) place(owner); }, { passive: true });
    global.addEventListener('resize', hide);

    global.RKHint = { icon: icon, show: show, hide: hide };
})(window);
