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

    // assets/logo.svg встроен строкой: отдельный запрос на медленной сети приходил на несколько секунд позже шапки.
    // При смене логотипа обновить и этот data URI.
    var LOGO_DARK = "data:image/svg+xml,%3Csvg width='103' height='13' viewBox='0 0 103 13' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M5.49853e-06 12.8701V0.000116587H10.782C12.114 0.000116587 13.146 0.336117 13.878 1.00812C14.622 1.68012 14.994 2.70012 14.994 4.06812C14.994 5.23212 14.724 6.14412 14.184 6.80412C13.644 7.46412 12.876 7.87812 11.88 8.04612L14.85 12.8701H11.574L8.82001 8.13612H2.88001V12.8701H5.49853e-06ZM10.44 2.34012H2.88001V5.77812L10.44 5.79612C10.968 5.79612 11.37 5.66412 11.646 5.40012C11.934 5.13612 12.078 4.69212 12.078 4.06812C12.078 3.43212 11.934 2.98812 11.646 2.73612C11.37 2.47212 10.968 2.34012 10.44 2.34012ZM16.8863 12.8701V3.60012H19.4963V12.8701H16.8863ZM16.8683 2.07012V0.0361161H19.5143V2.07012H16.8683ZM23.5261 12.8701V5.67012H20.8441V3.60012H23.5261V2.88012C23.5261 2.02812 23.7721 1.34412 24.2641 0.828117C24.7561 0.300116 25.5241 0.0361161 26.5681 0.0361161H30.4921V2.10612H27.2161C26.4961 2.10612 26.1361 2.47212 26.1361 3.20412V3.60012H29.9881V5.67012H26.1361V12.8701H23.5261ZM33.7215 12.8701V5.67012H31.0395V3.60012H33.7215V2.88012C33.7215 2.02812 33.9675 1.34412 34.4595 0.828117C34.9515 0.300116 35.7195 0.0361161 36.7635 0.0361161H40.6875V2.10612H37.4115C36.6915 2.10612 36.3315 2.47212 36.3315 3.20412V3.60012H40.1835V5.67012H36.3315V12.8701H33.7215ZM48.4277 12.8701V0.0361161H51.3077V5.27412H55.5917L59.8217 0.0361161H63.4037L58.1117 6.44412L63.4037 12.8701H59.8217L55.5737 7.61412H51.3077V12.8701H48.4277ZM64.5757 12.8701V3.60012H67.1857V12.8701H64.5757ZM64.5577 2.07012V0.0361161H67.2037V2.07012H64.5577ZM69.1636 12.8701V0.000116587H71.7736V12.8701H69.1636ZM73.7515 12.8701V0.000116587H76.3615V12.8701H73.7515ZM83.0914 12.9601C81.4834 12.9601 80.2294 12.5641 79.3294 11.7721C78.4294 10.9681 77.9794 9.79212 77.9794 8.24412C77.9794 6.68412 78.4294 5.50812 79.3294 4.71612C80.2294 3.91212 81.4834 3.51012 83.0914 3.51012H87.5914C88.6474 3.51012 89.4514 3.76212 90.0034 4.26612C90.5674 4.75812 90.8494 5.46612 90.8494 6.39012C90.8494 8.27412 89.7634 9.21612 87.5914 9.21612H80.7874C81.0394 10.3321 81.8074 10.8901 83.0914 10.8901H90.3814V12.9601H83.0914ZM83.0914 5.58012C81.8554 5.58012 81.0934 6.10212 80.8054 7.14612H87.4654C87.7054 7.14612 87.8914 7.07412 88.0234 6.93012C88.1674 6.78612 88.2394 6.58812 88.2394 6.33612C88.2394 5.83212 87.9814 5.58012 87.4654 5.58012H83.0914ZM92.4722 12.8701V3.60012H99.5642C100.608 3.60012 101.376 3.86412 101.868 4.39212C102.36 4.90812 102.606 5.59212 102.606 6.44412V8.37012H99.9602V6.76812C99.9602 6.04812 99.6002 5.68812 98.8802 5.68812H95.1182V12.8701H92.4722Z' fill='white'/%3E%3C/svg%3E";

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

    // Language switcher (js/i18n.js). Names stay in their own language, so they are marked translate="no".
    var i18n = window.RK_I18N;
    var langHeader = '';
    var langMobile = '';
    if (i18n) {
        var cur = i18n.lang;
        var curShort = 'EN';
        var items = '';
        var row = '';
        i18n.languages.forEach(function (l) {
            if (l.code === cur) curShort = l.short;
            var on = l.code === cur;
            items +=
                '<li role="none"><button type="button" role="menuitemradio" aria-checked="' + on + '" class="rk-lang-option" data-lang="' +
                l.code + '" lang="' + l.html + '">' + l.name + '</button></li>';
            row +=
                '<button type="button" class="rk-lang-chip' + (on ? ' is-active' : '') + '" aria-pressed="' + on + '" data-lang="' +
                l.code + '" lang="' + l.html + '" title="' + l.name + '">' + l.short + '</button>';
        });
        langHeader =
            '<div class="rk-lang" translate="no">' +
            '<button type="button" class="rk-lang-toggle" aria-haspopup="true" aria-expanded="false" aria-label="Language"><span class="rk-lang-code">' + curShort + '</span>' +
            '<svg width="8" height="6" viewBox="0 0 8 6" fill="none" aria-hidden="true"><path d="M1 1.5L4 4.5L7 1.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
            '</button><ul class="rk-lang-menu" role="menu" hidden>' + items + '</ul></div>';
        langMobile = '<div class="rk-lang-row" role="group" aria-label="Language" translate="no">' + row + '</div>';
    }

    // TEMPORARY_LIGHT_THEME: restore via RK_FEATURES.lightTheme in rk-theme-init.js.
    if (!window.RK_FEATURES || !window.RK_FEATURES.lightTheme) {
        themeToggleHeader = '';
        themeToggleMobile = '';
    }

    var open =
        '<header class="' +
        headerClass +
        '">' +
        '<div class="container topbar-inner">' +
        '<a href="' +
        logoHref +
        '" class="topbar-logo-wrap" aria-label="Riff Killer home">' +
        '<img src="' + LOGO_DARK + '" alt="" class="topbar-logo topbar-logo--dark" width="127" height="16" decoding="async">' +
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
            langHeader +
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
            '</nav>' +
            langMobile +
            '</div></div>';
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
            langHeader +
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
            langMobile +
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
    if (i18n) {
        var langButtons = Array.prototype.slice.call(frag.querySelectorAll('[data-lang]'));
        var langCode = frag.querySelector('.rk-lang-code');
        // Marks the choice right away; the page text follows as soon as the dictionary is in.
        var showLang = function (code) {
            langButtons.forEach(function (b) {
                var on = b.getAttribute('data-lang') === code;
                if (b.classList.contains('rk-lang-chip')) {
                    b.classList.toggle('is-active', on);
                    b.setAttribute('aria-pressed', on ? 'true' : 'false');
                } else {
                    b.setAttribute('aria-checked', on ? 'true' : 'false');
                }
            });
            i18n.languages.forEach(function (l) {
                if (l.code === code && langCode) langCode.textContent = l.short;
            });
        };
        i18n.onChange(showLang);
        var langBox = frag.querySelector('.rk-lang');
        langButtons.forEach(function (btn) {
            btn.addEventListener('click', function () {
                var code = btn.getAttribute('data-lang');
                showLang(code);
                if (langBox && langBox.contains(btn)) {
                    langBox.querySelector('.rk-lang-menu').hidden = true;
                    langBox.querySelector('.rk-lang-toggle').setAttribute('aria-expanded', 'false');
                }
                i18n.set(code);
            });
        });
        if (langBox) {
            var toggle = langBox.querySelector('.rk-lang-toggle');
            var menu = langBox.querySelector('.rk-lang-menu');
            var setOpen = function (open) {
                menu.hidden = !open;
                toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
            };
            toggle.addEventListener('click', function (e) {
                e.stopPropagation();
                setOpen(menu.hidden);
                if (!menu.hidden) {
                    var checked = menu.querySelector('[aria-checked="true"]');
                    if (checked) checked.focus();
                }
            });
            document.addEventListener('click', function (e) {
                if (!langBox.contains(e.target)) setOpen(false);
            });
            document.addEventListener('keydown', function (e) {
                if (e.key === 'Escape' && !menu.hidden) {
                    setOpen(false);
                    toggle.focus();
                }
            });
        }
    }

    var parent = mount.parentNode;
    var next = mount.nextSibling;
    parent.removeChild(mount);
    while (frag.firstChild) {
        parent.insertBefore(frag.firstChild, next);
    }
})();

