/**
 * Единая логика кликов по навигации шапки и бургер-меню.
 * Подключать после site-header.js, patreon-config и auth-manager (если есть).
 */
(function () {
    function currentPageKind() {
        var p = (window.location.pathname || '').toLowerCase();
        if (p.indexOf('practice.html') !== -1) return 'practice';
        if (p.indexOf('profile.html') !== -1) return 'profile';
        if (p.indexOf('billing.html') !== -1) return 'billing';
        return 'other';
    }

    function practiceRiffId() {
        var id = 1;
        try {
            var saved = localStorage.getItem('riffKillerState');
            if (saved) {
                var st = JSON.parse(saved);
                if (st && st.currentRiffId) id = st.currentRiffId;
            }
        } catch (e) {}
        return id;
    }

    function navigateToPage(page) {
        var here = currentPageKind();
        if (page === 'profile' && here === 'profile') {
            document.body.style.opacity = '1';
            return;
        }
        if (page === 'practice' && here === 'practice') {
            return;
        }
        if (page === 'plans' && here === 'billing') {
            return;
        }

        document.body.style.opacity = '0.7';
        setTimeout(function () {
            switch (page) {
                case 'riffs':
                    window.location.href = 'index.html';
                    break;
                case 'practice':
                    window.location.href = 'practice.html?riff=' + practiceRiffId();
                    break;
                case 'profile':
                    window.location.href = 'profile.html';
                    break;
                case 'plans':
                    window.location.href = 'billing.html';
                    break;
                default:
                    window.location.href = 'index.html';
            }
        }, 200);
    }

    function setBurgerOpen(open) {
        var burger = document.getElementById('burgerMenu');
        if (!burger) return;
        burger.classList.toggle('is-open', !!open);
        burger.setAttribute('aria-expanded', open ? 'true' : 'false');
        burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    }

    /** Слот в шапке (или .topbar-actions без обёртки в старой вёрстке) */
    function getBurgerAnchor() {
        var wrap = document.querySelector('.burger-anchor');
        if (wrap) return wrap;
        var burger = document.getElementById('burgerMenu');
        if (burger && burger.parentElement) return burger.parentElement;
        return null;
    }

    /** Снимает inline-позицию после «плавания» над оверлеем */
    function clearBurgerFloatStyles(burger) {
        if (!burger) return;
        burger.style.position = '';
        burger.style.top = '';
        burger.style.left = '';
        burger.style.width = '';
        burger.style.height = '';
        burger.style.right = '';
        burger.style.margin = '';
    }

    /**
     * Вынести бургер в body поверх оверлея и зафиксировать в тех же пикселях, что и в шапке
     * (иначе CSS top/right не совпадают с flex-центрированием в .burger-anchor — «прыжок»).
     */
    function floatBurgerAboveOverlay() {
        var burger = document.getElementById('burgerMenu');
        if (!burger || burger.parentNode === document.body) return;
        var r = burger.getBoundingClientRect();
        document.body.appendChild(burger);
        burger.style.position = 'fixed';
        burger.style.top = r.top + 'px';
        burger.style.left = r.left + 'px';
        burger.style.width = r.width + 'px';
        burger.style.height = r.height + 'px';
        burger.style.right = 'auto';
        burger.style.margin = '0';
    }

    /** Пересчёт позиции при resize, пока меню открыто (бургер на body, якорь в шапке пустой). */
    function repositionFloatedBurger() {
        var burger = document.getElementById('burgerMenu');
        var anchor = getBurgerAnchor();
        if (!burger || !anchor || burger.parentNode !== document.body) return;
        var a = anchor.getBoundingClientRect();
        var bw = burger.offsetWidth || 26;
        var bh = burger.offsetHeight || 18;
        burger.style.top = a.top + (a.height - bh) / 2 + 'px';
        burger.style.left = a.left + (a.width - bw) / 2 + 'px';
        burger.style.width = bw + 'px';
        burger.style.height = bh + 'px';
    }

    var rkBurgerResizeBound = false;
    function onBurgerViewportResize() {
        repositionFloatedBurger();
    }
    function bindBurgerResize() {
        if (rkBurgerResizeBound) return;
        rkBurgerResizeBound = true;
        window.addEventListener('resize', onBurgerViewportResize);
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', onBurgerViewportResize);
        }
    }
    function unbindBurgerResize() {
        if (!rkBurgerResizeBound) return;
        rkBurgerResizeBound = false;
        window.removeEventListener('resize', onBurgerViewportResize);
        if (window.visualViewport) {
            window.visualViewport.removeEventListener('resize', onBurgerViewportResize);
        }
    }

    function dockBurgerInHeader() {
        var burger = document.getElementById('burgerMenu');
        var anchor = getBurgerAnchor();
        if (!burger || !anchor || burger.parentNode === anchor) return;
        if (burger.parentNode === document.body) {
            unbindBurgerResize();
            clearBurgerFloatStyles(burger);
            anchor.appendChild(burger);
        }
    }

    /** Состояние анимации закрытия (общее с closeMobileMenu / initMobileMenu) */
    var rkMenuGen = 0;
    var rkMenuCloseTimer = null;
    var rkMenuPanelEl = null;
    var rkMenuTransitionEndHandler = null;

    function cancelPendingMobileMenuClose() {
        if (rkMenuCloseTimer !== null) {
            clearTimeout(rkMenuCloseTimer);
            rkMenuCloseTimer = null;
        }
        if (rkMenuPanelEl && rkMenuTransitionEndHandler) {
            rkMenuPanelEl.removeEventListener('transitionend', rkMenuTransitionEndHandler);
            rkMenuTransitionEndHandler = null;
        }
    }

    /** Только возврат кнопки в шапку после анимации панели (иконка уже «бургер» с момента shutMenu). */
    function finishMobileMenuClose(expectedGen) {
        if (expectedGen !== rkMenuGen) return;
        dockBurgerInHeader();
    }

    /**
     * Мгновенное закрытие (переход по пункту меню и т.п.) — без ожидания анимации.
     */
    function closeMobileMenu() {
        rkMenuGen++;
        cancelPendingMobileMenuClose();
        var overlay = document.getElementById('mobileMenuOverlay');
        if (overlay) {
            overlay.classList.remove('active');
            overlay.setAttribute('aria-hidden', 'true');
        }
        document.body.style.overflow = '';
        dockBurgerInHeader();
        setBurgerOpen(false);
    }

    function initNavigation() {
        document.querySelectorAll('.topbar-link-btn[data-page], .mobile-nav-item[data-page]').forEach(function (item) {
            item.addEventListener('click', function () {
                var page = item.getAttribute('data-page');
                if (!page) return;
                navigateToPage(page);
                closeMobileMenu();
            });
        });
    }

    function initMobileMenu() {
        var burger = document.getElementById('burgerMenu');
        var overlay = document.getElementById('mobileMenuOverlay');
        var menuPanel = overlay ? overlay.querySelector('.mobile-menu') : null;

        if (!burger || !overlay || !menuPanel) {
            return;
        }

        rkMenuPanelEl = menuPanel;

        function openMenu() {
            rkMenuGen++;
            cancelPendingMobileMenuClose();
            /* Сброс возможных inline-стилей после прерванной анимации */
            menuPanel.style.transition = '';
            menuPanel.style.transform = '';
            /*
             * Форсируем старт с translateX(100%), иначе браузер часто не рисует кадр «закрыто»
             * и transition панели/оверлея не проигрывается.
             */
            menuPanel.style.transition = 'none';
            menuPanel.style.transform = 'translateX(100%)';
            overlay.classList.add('active');
            overlay.setAttribute('aria-hidden', 'false');
            document.body.style.overflow = 'hidden';
            void menuPanel.offsetHeight;
            menuPanel.style.transition = '';
            menuPanel.style.transform = '';
            requestAnimationFrame(function () {
                floatBurgerAboveOverlay();
                bindBurgerResize();
                /* Крестик после кадра с открытым оверлеем — линии бургера успевают анимироваться */
                requestAnimationFrame(function () {
                    setBurgerOpen(true);
                });
            });
        }

        /**
         * Снимаем .active — панель уезжает; иконка крестик→бургер сразу (параллельно шторке).
         * Dock в DOM шапки только после transitionend: иначе reflow срывает transition панели.
         */
        function shutMenu() {
            if (!overlay.classList.contains('active')) return;
            var genSnapshot = rkMenuGen;
            cancelPendingMobileMenuClose();
            setBurgerOpen(false);
            menuPanel.style.transition = '';
            menuPanel.style.transform = '';
            overlay.classList.remove('active');
            overlay.setAttribute('aria-hidden', 'true');
            document.body.style.overflow = '';

            rkMenuTransitionEndHandler = function onPanelTransitionEnd(ev) {
                if (ev.target !== menuPanel || ev.propertyName !== 'transform') return;
                if (rkMenuTransitionEndHandler) {
                    menuPanel.removeEventListener('transitionend', rkMenuTransitionEndHandler);
                    rkMenuTransitionEndHandler = null;
                }
                if (rkMenuCloseTimer !== null) {
                    clearTimeout(rkMenuCloseTimer);
                    rkMenuCloseTimer = null;
                }
                finishMobileMenuClose(genSnapshot);
            };

            menuPanel.addEventListener('transitionend', rkMenuTransitionEndHandler);
            rkMenuCloseTimer = setTimeout(function () {
                rkMenuCloseTimer = null;
                if (rkMenuTransitionEndHandler) {
                    menuPanel.removeEventListener('transitionend', rkMenuTransitionEndHandler);
                    rkMenuTransitionEndHandler = null;
                }
                finishMobileMenuClose(genSnapshot);
            }, 480);
        }

        burger.addEventListener('click', function () {
            if (overlay.classList.contains('active')) {
                shutMenu();
            } else {
                openMenu();
            }
        });

        overlay.addEventListener('click', function (e) {
            if (!menuPanel.contains(e.target) && !burger.contains(e.target)) {
                shutMenu();
            }
        });

        menuPanel.querySelectorAll('a.mobile-nav-link, a.mobile-nav-anchor').forEach(function (a) {
            a.addEventListener('click', function () {
                shutMenu();
            });
        });

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && overlay.classList.contains('active')) {
                shutMenu();
            }
        });
    }

    /** Лендинг: одна кнопка → модалка с Log in / Sign up + Patreon / Google / email */
    function initLandingAuth() {
        document.querySelectorAll('.js-landing-auth-modal').forEach(function (btn) {
            btn.addEventListener('click', function (e) {
                e.preventDefault();
                if (window.patreonAuth && typeof window.patreonAuth.login === 'function') {
                    window.patreonAuth.login('login');
                } else {
                    alert('Auth is loading. Refresh the page or open the app from index.html.');
                }
            });
        });
    }

    function run() {
        initNavigation();
        initMobileMenu();
        initLandingAuth();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', run);
    } else {
        run();
    }
})();
