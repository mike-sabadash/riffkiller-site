/**
 * Interface languages: English (source), Russian, Latin American Spanish (es-419).
 * Load in <head> right after rk-theme-init.js, without defer/async:
 *   <script src="js/i18n.js?v=..."></script>
 * English stays in the markup and in the scripts. For RU/ES this file pulls js/i18n/<lang>.js and translates
 * text nodes and the attributes below by their English text, including anything scripts insert later.
 * Admin content and other text that must stay as typed: put it inside translate="no" or data-i18n-skip.
 * Strings that never reach the DOM (alert, confirm): RK_I18N.t('English text').
 */
(function () {
    'use strict';

    var LANGS = [
        { code: 'en', short: 'EN', name: 'English', html: 'en' },
        { code: 'ru', short: 'RU', name: 'Русский', html: 'ru' },
        { code: 'es', short: 'ES', name: 'Español', html: 'es-419' }
    ];
    var STORE = 'rk-lang';
    var VERSION = 'i2';
    var ATTRS = ['title', 'alt', 'placeholder', 'aria-label', 'data-tip', 'data-tooltip'];

    function known(code) {
        for (var i = 0; i < LANGS.length; i++) if (LANGS[i].code === code) return LANGS[i];
        return null;
    }

    // ?lang=ru in a link wins and is remembered; then the saved choice; English otherwise.
    var lang = 'en';
    try {
        var fromUrl = (new URLSearchParams(window.location.search).get('lang') || '').toLowerCase();
        if (known(fromUrl)) localStorage.setItem(STORE, fromUrl);
        var saved = localStorage.getItem(STORE);
        if (known(saved)) lang = saved;
    } catch (e) {}

    var exact = {};
    var patterns = [];
    var missing = {};

    function norm(s) {
        return String(s).replace(/\s+/g, ' ').trim();
    }

    // A part of a pattern match (a technique name, a plan) translated when we know it, kept as is otherwise.
    function part(text) {
        var key = norm(text);
        return Object.prototype.hasOwnProperty.call(exact, key) ? exact[key] : text;
    }

    function lookup(text) {
        var key = norm(text);
        if (!key || !/[A-Za-z]/.test(key)) return null;
        if (Object.prototype.hasOwnProperty.call(exact, key)) return exact[key];
        for (var i = 0; i < patterns.length; i++) {
            var m = key.match(patterns[i][0]);
            if (m) {
                var out = patterns[i][1];
                return typeof out === 'function' ? out(m, part) : out.replace(/\$(\d)/g, function (_, n) { return m[n] || ''; });
            }
        }
        missing[key] = true;
        return null;
    }

    // Keeps the whitespace around the text so inline layout does not shift.
    function swap(text) {
        var found = lookup(text);
        if (found === null) return null;
        var lead = text.match(/^\s*/)[0];
        var tail = text.match(/\s*$/)[0];
        var next = lead + found + tail;
        return next === text ? null : next;
    }

    function skipped(el) {
        for (; el && el.nodeType === 1; el = el.parentNode) {
            var tag = el.nodeName;
            if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'TEXTAREA' || tag === 'CODE') return true;
            if (el.getAttribute('translate') === 'no' || el.hasAttribute('data-i18n-skip')) return true;
        }
        return false;
    }

    // Last value we wrote, per node/attribute, so our own writes are not translated twice.
    var written = typeof WeakMap === 'function' ? new WeakMap() : null;

    function textNode(node) {
        if (written && written.get(node) === node.nodeValue) return;
        if (skipped(node.parentNode)) return;
        var next = swap(node.nodeValue);
        if (next === null) return;
        node.nodeValue = next;
        if (written) written.set(node, next);
    }

    function attrs(el) {
        if (skipped(el)) return;
        var memo = written && written.get(el);
        for (var i = 0; i < ATTRS.length; i++) {
            var name = ATTRS[i];
            var value = el.getAttribute(name);
            if (!value || (memo && memo[name] === value)) continue;
            var next = swap(value);
            if (next === null) continue;
            el.setAttribute(name, next);
            if (written) {
                memo = memo || {};
                memo[name] = next;
                written.set(el, memo);
            }
        }
        if (el.nodeName === 'INPUT' && (el.type === 'submit' || el.type === 'button') && el.value) {
            var v = swap(el.value);
            if (v !== null) el.value = v;
        }
    }

    function walk(root) {
        if (!root) return;
        if (root.nodeType === 3) return textNode(root);
        if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
        if (root.nodeType === 1) {
            if (skipped(root)) return;
            attrs(root);
        }
        var tw = document.createTreeWalker(root, 5 /* elements + text */, null, false);
        var node;
        while ((node = tw.nextNode())) {
            if (node.nodeType === 3) textNode(node);
            else attrs(node);
        }
    }

    function start() {
        walk(document.documentElement);
        new MutationObserver(function (records) {
            for (var i = 0; i < records.length; i++) {
                var r = records[i];
                if (r.type === 'characterData') textNode(r.target);
                else if (r.type === 'attributes') attrs(r.target);
                else for (var j = 0; j < r.addedNodes.length; j++) walk(r.addedNodes[j]);
            }
        }).observe(document.documentElement, {
            subtree: true,
            childList: true,
            characterData: true,
            attributes: true,
            attributeFilter: ATTRS.concat(['value'])
        });
        document.addEventListener('DOMContentLoaded', function () { walk(document.documentElement); });
    }

    var api = {
        languages: LANGS,
        lang: lang,
        /** English text → current language (unchanged when there is no translation). */
        t: function (text) {
            if (lang === 'en') return text;
            var next = swap(String(text));
            return next === null ? text : next;
        },
        set: function (code) {
            if (!known(code) || code === lang) return;
            try {
                localStorage.setItem(STORE, code);
            } catch (e) {}
            var url = new URL(window.location.href);
            if (url.searchParams.has('lang')) {
                url.searchParams.delete('lang');
                window.location.replace(url.toString());
            } else {
                window.location.reload();
            }
        },
        /** Called by js/i18n/<lang>.js: { exact: {en: text}, patterns: [[RegExp, '$1 text' | fn(match, part)]] }. */
        register: function (dict) {
            var e = dict.exact || {};
            for (var k in e) if (Object.prototype.hasOwnProperty.call(e, k)) exact[norm(k)] = e[k];
            patterns = patterns.concat(dict.patterns || []);
            start();
        },
        /** English strings seen on this page without a translation (for checking coverage). */
        missing: function () { return Object.keys(missing); }
    };
    window.RK_I18N = api;

    var info = known(lang);
    document.documentElement.setAttribute('lang', info.html);
    if (lang !== 'en') {
        document.write('<script src="js/i18n/' + lang + '.js?v=' + VERSION + '"><\/script>');
    }
})();
