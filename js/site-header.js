/**
 * ЕДИНСТВЕННОЕ место разметки шапки (лендинг + приложение).
 * Лендинг: <body data-rk-header="landing" data-logo-href="#">
 * Приложение: <body data-rk-header="app" data-logo-href="index.html" data-nav-active="riffs|practice|profile|billing">
 *
 * <div id="site-header-mount"></div>
 * <script src="js/site-header.js"></script>
 */
(function () {
    var mount = document.getElementById('site-header-mount');
    if (!mount) return;

    var variant = (document.body.getAttribute('data-rk-header') || 'app').toLowerCase();
    var active = (document.body.getAttribute('data-nav-active') || 'riffs').toLowerCase();
    var logoHref = document.body.getAttribute('data-logo-href') || 'index.html';

    function appNavCls(page) {
        return active === page ? 'topbar-link-btn active' : 'topbar-link-btn';
    }
    function mCls(page) {
        return active === page ? 'mobile-nav-item active' : 'mobile-nav-item';
    }

    var headerClass = variant === 'landing' ? 'topbar topbar--landing' : 'topbar';

    var themeIcons =
        '<svg class="rk-theme-icon-sun" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42"/></svg>' +
        '<svg class="rk-theme-icon-moon" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>';
    var themeToggleHeader =
        '<button type="button" class="rk-theme-toggle rk-theme-toggle--header" aria-pressed="false">' + themeIcons + '</button>';
    var themeToggleMobile =
        '<button type="button" class="rk-theme-toggle rk-theme-toggle--mobile" aria-pressed="false">' +
        themeIcons +
        '<span class="rk-theme-toggle-label">Тема</span></button>';

    var open =
        '<header class="' +
        headerClass +
        '">' +
        '<div class="container topbar-inner">' +
        '<a href="' +
        logoHref +
        '" class="topbar-logo-wrap" aria-label="Riff Killer home">' +
        '<img src="assets/logo.svg" alt="" class="topbar-logo topbar-logo--dark" width="127" height="16" decoding="async">' +
        '<img src="assets/logo-main.svg" alt="" class="topbar-logo topbar-logo--light" width="137" height="18" decoding="async">' +
        '</a>';

    var middle = '';
    var close = '';
    var mobile = '';

    if (variant === 'landing') {
        middle =
            '<nav class="topbar-links" aria-label="Main">' +
            '<a href="index.html">Riffs</a>' +
            '<a href="practice.html">Practice</a>' +
            '<a href="#plans">Plans</a>' +
            '</nav>';
        close =
            '<div class="topbar-actions">' +
            themeToggleHeader +
            '<div class="topbar-landing-desktop-auth">' +
            '<button type="button" class="btn btn-primary js-landing-auth-modal">Sign in</button>' +
            '</div>' +
            '<span class="burger-anchor"><button type="button" class="burger-menu" id="burgerMenu" aria-label="Open menu" aria-expanded="false" aria-controls="mobileMenu"></button></span></div></div></header>';
        mobile =
            '<div class="mobile-menu-overlay" id="mobileMenuOverlay" aria-hidden="true">' +
            '<div class="mobile-menu mobile-menu--landing" id="mobileMenu" role="dialog" aria-modal="true" aria-labelledby="mobileMenuLandingTitle">' +
            '<p class="visually-hidden" id="mobileMenuLandingTitle">Site menu</p>' +
            themeToggleMobile +
            '<div class="mobile-menu-landing-auth">' +
            '<button type="button" class="btn btn-primary mobile-landing-btn js-landing-auth-modal">Sign in</button>' +
            '</div>' +
            '<nav class="mobile-nav mobile-nav--landing" aria-label="Main mobile">' +
            '<a href="index.html" class="mobile-nav-link">Riffs</a>' +
            '<a href="practice.html" class="mobile-nav-link">Practice</a>' +
            '<a href="#plans" class="mobile-nav-link mobile-nav-anchor">Plans</a>' +
            '</nav></div></div>';
    } else {
        middle =
            '<nav class="topbar-links" aria-label="Main">' +
            '<button type="button" class="' +
            appNavCls('riffs') +
            '" data-page="riffs">Riffs</button>' +
            '<button type="button" class="' +
            appNavCls('practice') +
            '" data-page="practice">Practice</button>' +
            '<button type="button" class="' +
            appNavCls('profile') +
            '" data-page="profile">Profile</button>' +
            '</nav>';
        close =
            '<div class="topbar-actions">' +
            themeToggleHeader +
            '<div class="auth-buttons" id="authButtons">' +
            '<span class="login-text">Log in</span>' +
            '<button type="button" class="btn btn-primary btn-signup">Sign up</button>' +
            '</div>' +
            '<span class="burger-anchor"><button type="button" class="burger-menu" id="burgerMenu" aria-label="Open menu" aria-expanded="false" aria-controls="mobileMenu"></button></span></div></div></header>';
        mobile =
            '<div class="mobile-menu-overlay" id="mobileMenuOverlay">' +
            '<div class="mobile-menu" id="mobileMenu">' +
            themeToggleMobile +
            '<nav class="mobile-nav" aria-label="Main mobile">' +
            '<button type="button" class="' +
            mCls('riffs') +
            '" data-page="riffs">Riffs</button>' +
            '<button type="button" class="' +
            mCls('practice') +
            '" data-page="practice">Practice</button>' +
            '<button type="button" class="' +
            mCls('profile') +
            '" data-page="profile">Profile</button>' +
            '<button type="button" class="mobile-nav-item mobile-plans-link" id="mobilePlansLink" data-page="plans">Plans</button>' +
            '</nav>' +
            '<div class="mobile-auth">' +
            '<button type="button" class="mobile-login-btn">Log in</button>' +
            '<button type="button" class="btn btn-primary mobile-signup-btn">Sign up</button>' +
            '</div></div></div>';
    }

    var html = open + middle + close + mobile;

    var wrap = document.createElement('div');
    wrap.innerHTML = html.trim();
    var frag = document.createDocumentFragment();
    while (wrap.firstChild) {
        frag.appendChild(wrap.firstChild);
    }
    var parent = mount.parentNode;
    var next = mount.nextSibling;
    parent.removeChild(mount);
    while (frag.firstChild) {
        parent.insertBefore(frag.firstChild, next);
    }
})();
