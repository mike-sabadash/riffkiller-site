/**
 * Синхронно до первого кадра: читает rk-theme из localStorage и ставит data-theme на <html>.
 * Подключать в <head> без defer/async (сразу после charset).
 */
(function () {
    try {
        var stored = localStorage.getItem('rk-theme');
        var theme = stored === 'light' || stored === 'dark' ? stored : 'dark';
        document.documentElement.setAttribute('data-theme', theme);
        var meta = document.getElementById('rk-theme-color');
        if (meta) {
            meta.setAttribute('content', theme === 'light' ? '#f4f4f8' : '#0a0a0a');
        }
    } catch (e) {
        document.documentElement.setAttribute('data-theme', 'dark');
    }
})();
