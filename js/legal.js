/**
 * Legal pages: English is the main text, Russian is a full version of it. The page shows the one that matches
 * the site language (Spanish readers get English) and the switch at the top flips between them.
 */
(function () {
    'use strict';
    function show(lang) {
        var want = lang === 'ru' ? 'ru' : 'en';
        document.querySelectorAll('.legal-doc').forEach(function (d) { d.hidden = d.getAttribute('data-lang') !== want; });
        document.querySelectorAll('.legal-lang button').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-show') === want ? 'true' : 'false'); });
        document.documentElement.lang = want;
    }
    var i18n = window.RK_I18N;
    var first = /[?&]lang=ru\b/.test(location.search) ? 'ru' : (i18n && i18n.lang) || 'en';
    show(first);
    document.querySelectorAll('.legal-lang button').forEach(function (b) {
        b.addEventListener('click', function () { show(b.getAttribute('data-show')); });
    });
})();
