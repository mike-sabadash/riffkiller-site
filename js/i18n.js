/**
 * Interface languages: English (source), Russian, Latin American Spanish (es-419).
 * Load in <head> right after rk-theme-init.js, without defer/async:
 *   <script src="js/i18n.js?v=..."></script>
 * English stays in the markup and in the scripts. For RU/ES this file pulls js/i18n/<lang>.js and translates
 * text nodes and the attributes below by their English text, including anything scripts insert later.
 * Switching language re-translates the page in place, without a reload: each node remembers its English text.
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
    var VERSION = 'i17';
    var ATTRS = ['title', 'alt', 'placeholder', 'aria-label', 'data-tip', 'data-tooltip', 'data-short'];

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

    var dicts = { en: { exact: {}, patterns: [] } };
    var dict = dicts.en;
    var loadingLang = null;
    var missing = {};
    var listeners = [];

    function norm(s) {
        return String(s).replace(/\s+/g, ' ').trim();
    }

    // A part of a pattern match (a technique name, a plan) translated when we know it, kept as is otherwise.
    function part(text) {
        var key = norm(text);
        return Object.prototype.hasOwnProperty.call(dict.exact, key) ? dict.exact[key] : text;
    }

    function lookup(text) {
        var key = norm(text);
        if (!key || !/[A-Za-z]/.test(key)) return null;
        if (Object.prototype.hasOwnProperty.call(dict.exact, key)) return dict.exact[key];
        for (var i = 0; i < dict.patterns.length; i++) {
            var m = key.match(dict.patterns[i][0]);
            if (m) {
                var out = dict.patterns[i][1];
                return typeof out === 'function' ? out(m, part) : out.replace(/\$(\d)/g, function (_, n) { return m[n] || ''; });
            }
        }
        missing[key] = true;
        return null;
    }

    // English → current language, keeping the whitespace around the text so inline layout does not shift.
    function render(english) {
        if (lang === 'en') return english;
        var found = lookup(english);
        if (found === null) return english;
        return english.match(/^\s*/)[0] + found + english.match(/\s*$/)[0];
    }

    function skipped(el) {
        for (; el && el.nodeType === 1; el = el.parentNode) {
            var tag = el.nodeName;
            if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'TEXTAREA' || tag === 'CODE') return true;
            if (el.getAttribute('translate') === 'no' || el.hasAttribute('data-i18n-skip')) return true;
        }
        return false;
    }

    // Per node and attribute: the English source and the last value we wrote. A value that differs from what we
    // wrote came from the page's own scripts and is the new English source.
    var memo = new WeakMap();

    function textNode(node) {
        if (skipped(node.parentNode)) return;
        var m = memo.get(node);
        var source = m && m.out === node.nodeValue ? m.src : node.nodeValue;
        var out = render(source);
        if (out !== node.nodeValue) node.nodeValue = out;
        if (out !== source || m) memo.set(node, { src: source, out: out });
    }

    function attrs(el) {
        if (skipped(el)) return;
        var all = memo.get(el);
        for (var i = 0; i < ATTRS.length; i++) {
            var name = ATTRS[i];
            var value = el.getAttribute(name);
            if (!value) continue;
            var m = all && all[name];
            var source = m && m.out === value ? m.src : value;
            var out = render(source);
            if (out !== value) el.setAttribute(name, out);
            if (out !== source || m) {
                all = all || {};
                all[name] = { src: source, out: out };
                memo.set(el, all);
            }
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

    var observing = false;
    function observe() {
        if (observing) return;
        observing = true;
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
            attributeFilter: ATTRS
        });
        document.addEventListener('DOMContentLoaded', function () { walk(document.documentElement); });
    }

    function apply(code) {
        lang = code;
        api.lang = code;
        dict = dicts[code];
        missing = {};
        document.documentElement.setAttribute('lang', known(code).html);
        walk(document.documentElement);
        for (var i = 0; i < listeners.length; i++) {
            try { listeners[i](code); } catch (e) {}
        }
    }

    var api = {
        languages: LANGS,
        lang: lang,
        /** English text → current language (unchanged when there is no translation). */
        t: function (text) {
            return render(String(text));
        },
        /** Switches the page in place; the dictionary loads in the background the first time. */
        set: function (code) {
            if (!known(code)) return;
            try {
                localStorage.setItem(STORE, code);
            } catch (e) {}
            try {
                var url = new URL(window.location.href);
                if (url.searchParams.has('lang')) {
                    url.searchParams.delete('lang');
                    history.replaceState(history.state, '', url.toString());
                }
            } catch (e) {}
            loadingLang = code;
            if (dicts[code]) return apply(code);
            var s = document.createElement('script');
            s.src = 'js/i18n/' + code + '.js?v=' + VERSION;
            s.onload = function () {
                if (loadingLang === code && dicts[code]) apply(code);
            };
            s.onerror = function () {
                window.location.reload();
            };
            document.head.appendChild(s);
        },
        /** fn(code) runs after every switch. */
        onChange: function (fn) {
            listeners.push(fn);
        },
        /** Called by js/i18n/<lang>.js: { exact: {en: text}, patterns: [[RegExp, '$1 text' | fn(match, part)]] }. */
        register: function (d) {
            var code = loadingLang || lang;
            var exact = {};
            var e = d.exact || {};
            for (var k in e) if (Object.prototype.hasOwnProperty.call(e, k)) exact[norm(k)] = e[k];
            dicts[code] = { exact: exact, patterns: d.patterns || [] };
            if (!loadingLang) {
                // First paint: the dictionary was written into the page right after this script.
                dict = dicts[code];
                observe();
                walk(document.documentElement);
            }
        },
        /** English strings seen on this page without a translation (for checking coverage). */
        missing: function () { return Object.keys(missing); }
    };
    window.RK_I18N = api;

    // The observer runs in English too, so a later switch finds every node with its English source.
    observe();
    document.documentElement.setAttribute('lang', known(lang).html);
    if (lang !== 'en') {
        document.write('<script src="js/i18n/' + lang + '.js?v=' + VERSION + '"><\/script>');
    }
})();
