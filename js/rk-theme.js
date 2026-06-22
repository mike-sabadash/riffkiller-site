/**
 * Переключатель темы: кнопки .rk-theme-toggle (шапка + моб. меню).
 * Состояние: data-theme на <html>, localStorage rk-theme.
 */
(function () {
    'use strict';

    var KEY = 'rk-theme';

    function currentTheme() {
        var t = document.documentElement.getAttribute('data-theme');
        return t === 'light' ? 'light' : 'dark';
    }

    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        try {
            localStorage.setItem(KEY, theme);
        } catch (e) {}
        var isLight = theme === 'light';
        var meta = document.getElementById('rk-theme-color');
        if (meta) {
            meta.setAttribute('content', isLight ? '#f4f4f8' : '#0a0a0a');
        }
        document.querySelectorAll('.rk-theme-toggle').forEach(function (btn) {
            btn.setAttribute('aria-pressed', isLight ? 'true' : 'false');
            btn.setAttribute('aria-label', isLight ? 'Включить тёмную тему' : 'Включить светлую тему');
            btn.setAttribute('title', isLight ? 'Тёмная тема' : 'Светлая тема');
        });
    }

    function bind() {
        document.querySelectorAll('.rk-theme-toggle').forEach(function (btn) {
            btn.addEventListener('click', function () {
                applyTheme(currentTheme() === 'dark' ? 'light' : 'dark');
            });
        });
        applyTheme(currentTheme());
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bind);
    } else {
        bind();
    }
})();
