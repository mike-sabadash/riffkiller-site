// ==========================================================================
// Profile Page JavaScript - С РЕАЛЬНЫМИ ДАННЫМИ
// ==========================================================================

if (typeof getApiBase === 'undefined') {
    window.getApiBase = function () { return (typeof window !== 'undefined' && window.location && window.location.origin) ? window.location.origin : ''; };
}

let recentPage = 1;
let favoritesPage = 1;
const ITEMS_PER_PAGE = 10;
let allRecentRiffs = [];
let allFavoriteRiffs = [];

// Track when profile page loaded (for grace period before redirect)
const PROFILE_LOAD_TIME = Date.now();
const AUTH_GRACE_MS = 2500;
const REDIRECT_LOG = '[Profile redirect]';

function isSessionInLocalStorage() {
    try {
        const raw = localStorage.getItem('riffKillerAuth');
        if (!raw) return false;
        const data = JSON.parse(raw);
        return !!(data && data.isAuthenticated);
    } catch (e) {
        return false;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    console.log('Profile page initialized');

    // Defensive: ensure patreonAuth is available
    if (!window.patreonAuth) {
        console.warn(REDIRECT_LOG, 'window.patreonAuth missing; waiting briefly then checking localStorage');
        setTimeout(() => {
            if (isSessionInLocalStorage()) {
                console.log(REDIRECT_LOG, 'Session in localStorage but patreonAuth missing; reload to restore auth.');
                window.location.reload();
                return;
            }
            console.log(REDIRECT_LOG, 'Redirecting to index (no patreonAuth, no session)');
            window.location.href = 'index.html';
        }, 500);
        return;
    }
    if (typeof window.patreonAuth.addListener !== 'function') {
        console.warn(REDIRECT_LOG, 'patreonAuth.addListener not a function');
    }


    // Load profile (may show Loading if userData not yet available)
    loadUserProfile();
    updateSubscriptionDetailsCard();

    // Refresh unified subscription from server so profile shows correct Stripe/Cryptomus/Patreon status
    if (window.patreonAuth && window.patreonAuth.userData && window.patreonAuth.userData.id && typeof window.patreonAuth.fetchSubscriptionFromServer === 'function') {
        window.patreonAuth.fetchSubscriptionFromServer(window.patreonAuth.userData.id).then(function() {
            updateSubscriptionDetailsCard();
        });
    }

    // Retry loading profile when userData arrives (covers slow api/me or race conditions)
    const retryLoad = () => {
        const nameEl = document.getElementById('profileName');
        if (window.patreonAuth && window.patreonAuth.userData && nameEl && (nameEl.textContent === 'Loading...' || (window.RK_I18N && nameEl.textContent === window.RK_I18N.t('Loading...')) || !nameEl.textContent.trim())) {
            loadUserProfile();
            updateSubscriptionDetailsCard();
        }
    };
    setTimeout(retryLoad, 200);
    setTimeout(retryLoad, 600);
    setTimeout(retryLoad, 1500);

    // Success toast for Stripe/Cryptomus
    var p = new URLSearchParams(window.location.search);
    var success = p.get('success');
    if (success === 'stripe' || success === 'cryptomus') {
        setTimeout(function() {
            var el = document.getElementById('subscriptionStatus');
            if (el) {
                var wrap = document.createElement('div');
                wrap.className = 'success-toast';
                wrap.style.cssText = 'margin-top:8px;padding:8px 12px;background:rgba(76,175,80,0.2);border-radius:8px;color:#4CAF50;font-size:14px;';
                wrap.textContent = 'Thank you! Your subscription is active.';
                el.appendChild(wrap);
                setTimeout(function() { wrap.remove(); }, 5000);
            }
        }, 300);
        try { history.replaceState({}, '', window.location.pathname); } catch (e) {}
    }

    loadUserRiffs();
    if (window.RKFavorites) window.RKFavorites.onChange(function () { favoritesPage = 1; loadUserRiffs(); });
    document.addEventListener('click', function (e) {
        const star = e.target.closest && e.target.closest('.fav-collection-star');
        if (!star) return;
        e.preventDefault();
        window.RKFavorites.toggle('collection', star.getAttribute('data-fav-key').slice(2));
    });
    fetch('/api/collections/list.php').then(function (r) { return r.ok ? r.json() : null; })
        .then(function (cols) { if (Array.isArray(cols)) { liveCollections = cols; renderFavoriteCollections(); } })
        .catch(function () {});
    // Riffs deleted or hidden in the admin drop out of recent and favorites once the live list arrives.
    fetch('/api/riffs/list.php').then(function (r) { if (!r.ok) throw new Error('list'); return r.json(); })
        .then(function (list) {
            if (!Array.isArray(list)) return;
            liveRiffList = list;
            loadUserRiffs();
            if (window.ProfileProgress) window.ProfileProgress.setRiffs(list);
        })
        .catch(function () {});
    if (window.ProfileProgress) window.ProfileProgress.init(document.getElementById('profileProgress'));

    // Auth listener: refresh profile when userData arrives, or redirect when logged out
    window.patreonAuth.addListener((state) => {
        if (state.isAuthenticated && state.userData) {
            loadUserProfile();
            updateSubscriptionDetailsCard();
            return;
        }
        if (state.isAuthenticated) return;
        if (typeof window.patreonAuth.hasActiveSubscription === 'function' && window.patreonAuth.hasActiveSubscription()) return;
        if (Date.now() - PROFILE_LOAD_TIME < AUTH_GRACE_MS) {
            console.log(REDIRECT_LOG, 'Within grace period; skipping redirect');
            return;
        }
        if (isSessionInLocalStorage()) {
            console.log(REDIRECT_LOG, 'Session still in localStorage; skipping redirect (state may be stale)');
            return;
        }
        console.log(REDIRECT_LOG, 'Redirecting to index.html (not authenticated)');
        window.location.href = 'index.html';
    });

    initLoadMoreButtons();

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            window.patreonAuth.logout();
        });
    }

    initProfileEditor();

    // After grace period, redirect if still not authenticated and no active subscription
    setTimeout(() => {
        if (window.patreonAuth.isAuthenticated || isSessionInLocalStorage()) return;
        if (typeof window.patreonAuth.hasActiveSubscription === 'function' && window.patreonAuth.hasActiveSubscription()) return;
        console.log(REDIRECT_LOG, 'Initial check after grace: not authenticated, redirecting to index');
        window.location.href = 'index.html';
    }, AUTH_GRACE_MS);

    /** Скролл так, чтобы элемент оказался под фикс. шапкой + gap (12–20px) сверху заголовка */
    function rkScrollToElementWithTopGap(el, gapAbovePx) {
        if (!el || typeof el.getBoundingClientRect !== 'function') return;
        var gap = typeof gapAbovePx === 'number' ? gapAbovePx : 16;
        var header = document.querySelector('header.topbar');
        var belowHeader = 0;
        if (header) {
            belowHeader = header.getBoundingClientRect().bottom;
        } else {
            belowHeader = 64;
        }
        var elTop = el.getBoundingClientRect().top + window.pageYOffset;
        var y = elTop - belowHeader - gap;
        window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
    }

    // Redeem promocode: к заголовку секции (не к плашке), затем фокус в поле
    var promoPill = document.querySelector('.profile-promo-pill');
    if (promoPill) {
        promoPill.addEventListener('click', function () {
            var titleEl = document.getElementById('profilePromoTitle');
            if (titleEl) {
                rkScrollToElementWithTopGap(titleEl, 16);
            } else {
                var targetSel = promoPill.getAttribute('data-scroll-target') || '#profilePromoSection';
                var target = document.querySelector(targetSel);
                if (target && typeof target.scrollIntoView === 'function') {
                    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            }
            var promoInput = document.getElementById('profilePromoInput');
            if (promoInput) {
                setTimeout(function () { promoInput.focus(); }, 450);
            }
        });
    }

    // Иконка settings: к заголовку «Redeem promo code» (промокоды), с отступом под шапкой
    var settingsBtn = document.getElementById('profileSettingsBtn');
    if (settingsBtn) {
        settingsBtn.addEventListener('click', function () {
            var titleEl = document.getElementById('profilePromoTitle');
            rkScrollToElementWithTopGap(titleEl, 16);
            var promoInput = document.getElementById('profilePromoInput');
            if (promoInput) {
                setTimeout(function () { promoInput.focus(); }, 450);
            }
        });
    }

});

function loadUserProfile() {
    const userData = window.patreonAuth.userData;
    const subscription = window.patreonAuth.subscription;
    
    if (!userData) return;
    
    const profileName = document.getElementById('profileName');
    const profileEmail = document.getElementById('profileEmail');
    const profileProvider = document.getElementById('profileProvider');
    const avatarImg = document.getElementById('avatarImg');
    const subscriptionStatus = document.getElementById('subscriptionStatus');
    const manageBtn = document.getElementById('manageSubscriptionBtn');
    
    if (profileName) {
        profileName.textContent = userData.full_name || 'User';
    }
    
    if (profileEmail) {
        profileEmail.textContent = userData.email || '';
    }
    
    if (profileProvider) {
        var provider = (userData.provider || '').toLowerCase();
        var label = provider === 'google' ? 'Signed in with Google' : provider === 'yandex' ? 'Signed in with Yandex' : provider === 'patreon' ? 'Signed in with Patreon' : provider === 'email' ? 'Signed in with email' : '';
        profileProvider.textContent = label;
        profileProvider.style.display = label ? 'block' : 'none';
    }

    // Строка «Reset password» ведёт в настройки Patreon — показываем её только тем, кто вошёл через Patreon.
    var passwordRow = document.querySelector('.profile-field-column--password');
    if (passwordRow) {
        passwordRow.style.display = (userData.provider || '').toLowerCase() === 'patreon' ? '' : 'none';
    }
    
    if (avatarImg) {
        avatarImg.src = userData.image_url || 'assets/icons/default-avatar.svg';
    }
    
    var auth = window.patreonAuth || window.authManager;
    var hasActive = auth && typeof auth.hasActiveSubscription === 'function' && auth.hasActiveSubscription();
    var sub = subscription || (auth && auth.subscription);
    var subExpiresSec = null;
    if (sub && sub.expiresAt != null) {
        var rawExpires = Number(sub.expiresAt);
        if (!isNaN(rawExpires) && rawExpires > 0) {
            subExpiresSec = rawExpires > 1000000000000 ? Math.floor(rawExpires / 1000) : Math.floor(rawExpires);
        }
    }
    var subscriptionMeta = document.getElementById('subscriptionMeta');
    var billingMessage = document.getElementById('billingMessage');

    if (subscriptionStatus) {
        var statusLabel = 'No active subscription';
        var badgeClass = 'status-inactive';
        if (hasActive && sub) {
            statusLabel = sub.status === 'active' ? 'Active' : (subExpiresSec && subExpiresSec > Date.now() / 1000 ? 'Active' : 'Expired');
            badgeClass = (statusLabel === 'Active') ? 'status-active' : 'status-inactive';
        }
        subscriptionStatus.innerHTML = '<div class="status-badge ' + badgeClass + '"><span class="status-text">' + statusLabel + (statusLabel === 'Active' ? ' Premium' : '') + '</span></div>';
    }

    if (subscriptionMeta && sub) {
        var sourceLabel = paymentSourceLabel(sub.source);
        var nextBilling = '';
        // Card subscriptions keep a few grace days in expiresAt; their real renewal date comes from the billing status below.
        if (subExpiresSec && ['lava', 'robokassa', 'yookassa'].indexOf(sub.source) === -1) {
            var d = new Date(subExpiresSec * 1000);
            nextBilling = (sub.source === 'usdt' ? ' · Paid until: ' : ' · Next billing: ') + d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
        }
        subscriptionMeta.textContent = 'Payment: ' + sourceLabel + (nextBilling || '');
        subscriptionMeta.style.display = '';
    } else if (subscriptionMeta) {
        subscriptionMeta.textContent = '';
        subscriptionMeta.style.display = 'none';
    }

    if (manageBtn) {
        if (!hasActive || !sub) {
            manageBtn.textContent = 'Upgrade to Premium';
            manageBtn.href = 'billing.html';
            manageBtn.removeAttribute('target');
            if (billingMessage) { billingMessage.style.display = 'none'; billingMessage.textContent = ''; }
        } else {
            manageBtn.textContent = 'Manage Billing';
            manageBtn.setAttribute('target', '_blank');
            manageBtn.setAttribute('rel', 'noopener noreferrer');
            var src = sub.source || 'patreon';
            if (src === 'promo' || src === 'test') {
                manageBtn.textContent = 'Active (Gift/Promo)';
                manageBtn.href = 'profile.html';
                manageBtn.removeAttribute('target');
                manageBtn.onclick = null;
                if (billingMessage) { billingMessage.style.display = 'none'; }
            } else if (CARD_BILLING_SOURCES.indexOf(src) !== -1) {
                manageBtn.removeAttribute('target');
                setupCardRenewalControls(manageBtn, billingMessage);
            } else if (src === 'cryptomus') {
                manageBtn.href = '#';
                manageBtn.onclick = function(e) { e.preventDefault(); };
                if (billingMessage) {
                    billingMessage.textContent = 'Cryptomus payments cannot be managed in a portal. Contact support if you need to change or cancel.';
                    billingMessage.style.display = 'block';
                }
            } else {
                manageBtn.onclick = null;
                var url = auth.getBillingUrl ? auth.getBillingUrl(src) : (src === 'stripe' ? 'https://billing.stripe.com/p/login/placeholder' : (typeof PATREON_CONFIG !== 'undefined' && PATREON_CONFIG.campaignUrl ? PATREON_CONFIG.campaignUrl : 'https://www.patreon.com/cw/MikeSabadash?vanity=MikeSabadash'));
                manageBtn.href = url;
                if (billingMessage) { billingMessage.style.display = 'none'; billingMessage.textContent = ''; }
            }
        }
    }
}

function initProfileEditor() {
    const auth = window.patreonAuth || window.authManager;
    if (!auth || !auth.userData) return;

    const getBase = typeof getApiBase !== 'undefined' ? getApiBase : window.getApiBase || function () { return (window.location && window.location.origin) || ''; };
    const nameInput = document.getElementById('displayNameInput');
    const saveBtn = document.getElementById('saveProfileBtn');
    const avatarInput = document.getElementById('avatarFileInput');
    const avatarImg = document.getElementById('avatarImg');
    const profileAvatarEl = document.getElementById('profileAvatar');

    if (nameInput) {
        nameInput.value = auth.userData.full_name || '';
    }

    if (saveBtn && nameInput) {
        saveBtn.addEventListener('click', function () {
            const fullName = nameInput.value.trim();
            fetch(getBase() + '/api/profile/update.php', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ full_name: fullName })
            })
                .then(function (r) { return r.json(); })
                .then(function (data) {
                    if (!data.success || !data.user) return;
                    auth.userData.full_name = data.user.full_name || fullName || 'User';
                    if (data.user.email) auth.userData.email = data.user.email;
                    if (typeof auth.saveSession === 'function') auth.saveSession();
                    loadUserProfile();
                })
                .catch(function (e) {
                    console.error('Profile update failed', e);
                });
        });
    }

    if (avatarInput && avatarImg) {
        avatarInput.addEventListener('change', function () {
            if (!avatarInput.files || !avatarInput.files[0]) return;
            const file = avatarInput.files[0];
            const formData = new FormData();
            formData.append('avatar', file);
            fetch(getBase() + '/api/profile/avatar-upload.php', {
                method: 'POST',
                credentials: 'include',
                body: formData
            })
                .then(function (r) { return r.json(); })
                .then(function (data) {
                    if (!data.success || !data.image_url) return;
                    auth.userData.image_url = data.image_url;
                    avatarImg.src = data.image_url;
                    if (typeof auth.saveSession === 'function') auth.saveSession();
                })
                .catch(function (e) {
                    console.error('Avatar upload failed', e);
                });
        });
    }

    if (profileAvatarEl && avatarInput) {
        profileAvatarEl.setAttribute('role', 'button');
        profileAvatarEl.setAttribute('aria-label', 'Change avatar');
        profileAvatarEl.addEventListener('click', function () {
            avatarInput.click();
        });
    }

    var promoInput = document.getElementById('profilePromoInput');
    var promoBtn = document.getElementById('profilePromoBtn');
    var promoMsg = document.getElementById('profilePromoMessage');
    if (promoBtn && promoInput && promoMsg) {
        promoBtn.addEventListener('click', function () {
            var code = promoInput.value.trim().toUpperCase();
            if (!code) { promoMsg.textContent = 'Enter your promo code.'; promoMsg.className = 'profile-promo-message error'; promoMsg.style.display = 'block'; return; }
            promoMsg.style.display = 'none';
            var getBase = typeof getApiBase !== 'undefined' ? getApiBase : window.getApiBase || function () { return (window.location && window.location.origin) || ''; };
            fetch(getBase() + '/api/apply-promo.php', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: code })
            }).then(function (r) {
                if (r.status === 401) return { success: false, error: 'Please sign in first.' };
                return r.json();
            }).then(function (data) {
                promoMsg.style.display = 'block';
                if (data.success) {
                    promoMsg.className = 'profile-promo-message success';
                    promoMsg.textContent = data.message || 'Promo applied!';
                    promoInput.value = '';
                    if (window.patreonAuth) {
                        window.patreonAuth.updateSubscription('promo', data.subscription || { status: 'active' });
                        window.patreonAuth.saveSession();
                        window.patreonAuth.notifyListeners();
                        window.patreonAuth.updateAllAuthButtons();
                    }
                    loadUserProfile();
                    updateSubscriptionDetailsCard();
                } else {
                    promoMsg.className = 'profile-promo-message error';
                    promoMsg.textContent = data.error || 'Invalid promo code.';
                }
            }).catch(function () {
                promoMsg.className = 'profile-promo-message error';
                promoMsg.textContent = 'Network error. Try again.';
                promoMsg.style.display = 'block';
            });
        });
    }
}

// Payments made on billing.html (config/billing.php): auto-renewal is switched off here, not in a portal.
// USDT is a one-off transfer, so it only gets an "Extend premium" link.
var CARD_BILLING_SOURCES = ['lava', 'robokassa', 'yookassa', 'usdt'];

function paymentSourceLabel(source) {
    var labels = { stripe: 'Stripe', cryptomus: 'Cryptomus', promo: 'Promo', test: 'Test', patreon: 'Patreon', lava: 'Card', robokassa: 'Robokassa', yookassa: 'YooKassa', usdt: 'USDT' };
    return labels[source] || 'Patreon';
}

function formatBillingDate(sec) {
    return new Date(sec * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function setupCardRenewalControls(button, message) {
    function showMessage(text) {
        if (!message) return;
        message.textContent = text;
        message.style.display = text ? 'block' : 'none';
    }
    button.href = '#';
    button.textContent = 'Cancel auto-renewal';
    button.onclick = function (e) { e.preventDefault(); };
    fetch('api/billing/status.php', { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (st) {
        var renewal = st && st.renewal;
        var until = renewal && renewal.paidUntil ? formatBillingDate(renewal.paidUntil) : '';
        if (renewal && renewal.provider === 'usdt' && !renewal.auto) {
            button.textContent = 'Extend premium';
            button.href = 'billing.html';
            button.onclick = null;
            showMessage(until ? 'Paid until ' + until + '. USDT payments do not renew by themselves.' : '');
            return;
        }
        if (!renewal || !renewal.auto) {
            button.textContent = 'Renew subscription';
            button.href = 'billing.html';
            button.onclick = null;
            showMessage(until ? 'Auto-renewal is off. Premium stays on until ' + until + '.' : '');
            return;
        }
        showMessage(until ? 'Renews automatically on ' + until + '.' : '');
        button.onclick = function (e) {
            e.preventDefault();
            var question = 'Turn off auto-renewal? Premium stays on until the end of the paid period.';
            if (!window.confirm(window.RK_I18N ? window.RK_I18N.t(question) : question)) return;
            button.textContent = 'Cancelling\u2026';
            fetch('api/billing/cancel.php', { method: 'POST', credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (res) {
                if (res && res.success) { setupCardRenewalControls(button, message); return; }
                button.textContent = 'Cancel auto-renewal';
                showMessage((res && res.error) || 'Could not cancel, try again later.');
            }).catch(function () {
                button.textContent = 'Cancel auto-renewal';
                showMessage('Could not reach the server, try again later.');
            });
        };
    }).catch(function () {});
}

function updateSubscriptionDetailsCard() {
    var loadingEl = document.getElementById('subscriptionDetailsLoading');
    var contentEl = document.getElementById('subscriptionDetailsContent');
    var emptyEl = document.getElementById('subscriptionDetailsEmpty');
    if (!loadingEl || !contentEl || !emptyEl) return;

    var auth = window.patreonAuth || window.authManager;
    var sub = auth && auth.subscription;
    var hasActive = auth && typeof auth.hasActiveSubscription === 'function' && auth.hasActiveSubscription();

    loadingEl.style.display = 'none';
    contentEl.style.display = 'none';
    emptyEl.style.display = 'none';

    if (sub && (sub.plan || sub.source || sub.status)) {
        var planLabel = (sub.source === 'patreon') ? 'Riff Killer' : ((sub.plan === 'yearly') ? 'Yearly' : (sub.plan === 'quarterly') ? '3 months' : 'Monthly');
        var statusLabel = (sub.status === 'active') ? 'Active' : (sub.status === 'expired') ? 'Expired' : (sub.status === 'cancelled') ? 'Cancelled' : sub.status || '—';
        var statusClass = (sub.status === 'active') ? 'status-active' : (sub.status === 'expired' || sub.status === 'cancelled') ? 'status-' + sub.status : '';
        var sourceLabel = paymentSourceLabel(sub.source);

        var nextBillingTs = sub.nextBillingDate != null ? sub.nextBillingDate : (sub.expiresAt != null ? sub.expiresAt : null);
        var nextBillingText = '—';
        if (nextBillingTs != null) {
            var ts = nextBillingTs;
            if (ts < 1e12) ts = ts * 1000;
            nextBillingText = new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
        }

        var manageHtml = '';
        if (hasActive && CARD_BILLING_SOURCES.indexOf(sub.source) !== -1) {
            manageHtml = '';
        } else if (hasActive && sub.source !== 'cryptomus' && auth.getBillingUrl) {
            manageHtml = '<a href="' + (auth.getBillingUrl(sub.source) || '#') + '" class="btn btn-primary btn-manage" target="_blank" rel="noopener noreferrer">Manage</a>';
        } else if (!hasActive) {
            manageHtml = '<a href="billing.html" class="btn btn-primary btn-manage">View Plans</a>';
        }
        contentEl.innerHTML =
            '<div class="subscription-detail-row"><span class="subscription-detail-label">Plan</span><span class="subscription-detail-value">' + planLabel + '</span></div>' +
            '<div class="subscription-detail-row"><span class="subscription-detail-label">Status</span><span class="subscription-detail-value ' + statusClass + '">' + statusLabel + '</span></div>' +
            '<div class="subscription-detail-row"><span class="subscription-detail-label">Payment method</span><span class="subscription-detail-value">' + sourceLabel + '</span></div>' +
            '<div class="subscription-detail-row"><span class="subscription-detail-label">' + (sub.source === 'usdt' ? 'Paid until' : 'Next billing date') + '</span><span class="subscription-detail-value">' + nextBillingText + '</span></div>' +
            (manageHtml ? '<div class="subscription-details-actions">' + manageHtml + '</div>' : '');
        contentEl.style.display = 'block';
    } else {
        emptyEl.style.display = 'flex';
    }
}

// Загрузка риффов пользователя ТОЛЬКО из localStorage (без демо-данных)
let liveRiffList = null;
function loadUserRiffs() {
    try {
        const savedState = localStorage.getItem('riffKillerState');
        const appState = savedState ? JSON.parse(savedState) : {};


        // Недавно практикованные — только из localStorage; добавляем isFavorite из riffsDatabase для звёздочки
        const rawRecent = (appState.recentlyPracticed && Array.isArray(appState.recentlyPracticed))
            ? appState.recentlyPracticed
            : [];
        const live = liveRiffList ? new Map(liveRiffList.map(r => [String(r.id), r])) : null;
        allRecentRiffs = rawRecent
            .filter(r => !live || live.has(String(r.id)))
            .map(r => ({
                ...r,
                ...(live ? { song: live.get(String(r.id)).song || r.song, artist: live.get(String(r.id)).artist || r.artist, thumbnail: live.get(String(r.id)).thumbnail || r.thumbnail } : {}),
            }));

        // Избранные — общий список RKFavorites (js/riff-gallery-card.js), последние добавленные первыми
        const metadata = liveRiffList || getRiffsMetadata();
        const byId = new Map(metadata.map(r => [String(r.id), r]));
        const favIds = window.RKFavorites ? window.RKFavorites.list('riff') : [];
        allFavoriteRiffs = favIds.filter(id => byId.has(id)).map(id => byId.get(id));
        renderFavoriteCollections();

        displayRecentRiffs(1);
        displayFavoriteRiffs(1);
    } catch (e) {
        console.error('Error loading user riffs:', e);
        allRecentRiffs = [];
        allFavoriteRiffs = [];
        displayRecentRiffs(1);
        displayFavoriteRiffs(1);
    }
}

// Избранные коллекции: строка ссылок над риффами
let liveCollections = null;
function renderFavoriteCollections() {
    const box = document.getElementById('favoriteCollections');
    if (!box) return;
    const ids = window.RKFavorites ? window.RKFavorites.list('collection') : [];
    const byId = new Map((liveCollections || []).map(c => [String(c.id), c]));
    const list = ids.filter(id => byId.has(id)).map(id => byId.get(id));
    box.hidden = list.length === 0;
    box.innerHTML = list.map(c => {
        const n = Array.isArray(c.riffs) ? c.riffs.length : 0;
        const name = String(c.name || 'Collection').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
        return '<li class="fav-collection"><a href="collection.html?id=' + encodeURIComponent(c.id) + '"><span class="fav-collection-name" translate="no">' + name +
            '</span><span class="fav-collection-count">' + (n === 1 ? '1 riff' : n + ' riffs') + '</span></a>' +
            window.RKFavorites.button('collection', c.id, 'fav-collection-star') + '</li>';
    }).join('');
}

// Метаданные риффов для отображения (id, song, artist, thumbnail, difficulty). isFavorite берётся из localStorage.
function getRiffsMetadata() {
    return [
        { id: 1, song: "Black Dog", artist: "Led Zeppelin", thumbnail: "assets/img/riff-1.png", difficulty: "intermediate" },
        { id: 2, song: "Sweet Child O' Mine", artist: "Guns N' Roses", thumbnail: "assets/img/riff-2.png", difficulty: "advanced" },
        { id: 3, song: "Smoke on the Water", artist: "Deep Purple", thumbnail: "assets/img/riff-3.png", difficulty: "beginner" },
        { id: 4, song: "Back in Black", artist: "AC/DC", thumbnail: "assets/img/riff-4.png", difficulty: "intermediate" },
        { id: 5, song: "Sunshine of Your Love", artist: "Cream", thumbnail: "assets/img/riff-5.png", difficulty: "intermediate" },
        { id: 6, song: "Purple Haze", artist: "Jimi Hendrix", thumbnail: "assets/img/riff-6.png", difficulty: "advanced" },
        { id: 7, song: "Iron Man", artist: "Black Sabbath", thumbnail: "assets/img/riff-7.png", difficulty: "intermediate" },
        { id: 8, song: "Enter Sandman", artist: "Metallica", thumbnail: "assets/img/riff-8.png", difficulty: "advanced" },
        { id: 9, song: "Whole Lotta Love", artist: "Led Zeppelin", thumbnail: "assets/img/riff-9.png", difficulty: "intermediate" },
        { id: 10, song: "Johnny B. Goode", artist: "Chuck Berry", thumbnail: "assets/img/riff-10.png", difficulty: "beginner" }
    ];
}

// Отображение недавних риффов
function displayRecentRiffs(page) {
    const grid = document.getElementById('recentRiffsGrid');
    if (!grid) return;
    
    if (page === 1) {
        grid.innerHTML = '';
    }
    
    if (allRecentRiffs.length === 0 && page === 1) {
        grid.innerHTML = '<p class="profile-empty-state">No recent practices yet. Open a riff from the main page to practice!</p>';
        const loadMoreContainer = document.getElementById('recentLoadMore');
        if (loadMoreContainer) loadMoreContainer.style.display = 'none';
        return;
    }
    
    const start = (page - 1) * ITEMS_PER_PAGE;
    const end = start + ITEMS_PER_PAGE;
    const pageRiffs = allRecentRiffs.slice(start, end);
    
    pageRiffs.forEach(riff => {
        const card = createRiffCard(riff, 'recent');
        grid.appendChild(card);
    });
    
    const loadMoreContainer = document.getElementById('recentLoadMore');
    if (loadMoreContainer) {
        loadMoreContainer.style.display = (end < allRecentRiffs.length) ? 'block' : 'none';
    }
}

// Отображение избранных риффов
function displayFavoriteRiffs(page) {
    const grid = document.getElementById('favoritesRiffsGrid');
    if (!grid) return;
    
    if (page === 1) {
        grid.innerHTML = '';
    }
    
    if (allFavoriteRiffs.length === 0 && page === 1) {
        grid.innerHTML = '<p class="profile-empty-state">No favorites yet. Tap the star on any riff or collection to keep it here. <a href="index.html">Browse riffs</a></p>';
        const loadMoreContainer = document.getElementById('favoritesLoadMore');
        if (loadMoreContainer) loadMoreContainer.style.display = 'none';
        return;
    }
    
    const start = (page - 1) * ITEMS_PER_PAGE;
    const end = start + ITEMS_PER_PAGE;
    const pageRiffs = allFavoriteRiffs.slice(start, end);
    
    pageRiffs.forEach(riff => {
        const card = createRiffCard(riff, 'favorite');
        grid.appendChild(card);
    });
    
    const loadMoreContainer = document.getElementById('favoritesLoadMore');
    if (loadMoreContainer) {
        loadMoreContainer.style.display = (end < allFavoriteRiffs.length) ? 'block' : 'none';
    }
}

// Создание карточки риффа (как Most killed — js/riff-gallery-card.js + css/riffs-hub .rk-riff-gallery)
function createRiffCard(riff, type) {
    if (!window.RiffKillerRiffGallery || typeof window.RiffKillerRiffGallery.createCard !== 'function') {
        console.error('RiffKillerRiffGallery missing; include js/riff-gallery-card.js before profile.js');
        return document.createElement('div');
    }

    return window.RiffKillerRiffGallery.createCard(riff, {
        onNavigate: function () {
            try {
                const savedState = localStorage.getItem('riffKillerState');
                let appState = savedState ? JSON.parse(savedState) : {};
                appState.currentRiffId = riff.id;
                localStorage.setItem('riffKillerState', JSON.stringify(appState));
            } catch (e) {
                console.error('Error saving state:', e);
            }
            document.body.style.opacity = '0.7';
            setTimeout(function () {
                window.location.href = 'practice.html?riff=' + riff.id;
            }, 200);
        }
    });
}

// Инициализация кнопок Load More
function initLoadMoreButtons() {
    const recentLoadMore = document.getElementById('recentLoadMore');
    const favoritesLoadMore = document.getElementById('favoritesLoadMore');
    
    if (recentLoadMore) {
        const btn = recentLoadMore.querySelector('.load-more-btn');
        if (btn) {
            btn.addEventListener('click', () => {
                recentPage++;
                displayRecentRiffs(recentPage);
            });
        }
    }
    
    if (favoritesLoadMore) {
        const btn = favoritesLoadMore.querySelector('.load-more-btn');
        if (btn) {
            btn.addEventListener('click', () => {
                favoritesPage++;
                displayFavoriteRiffs(favoritesPage);
            });
        }
    }
}

// Periodic auth check (don't redirect if session still in localStorage)
setInterval(() => {
    if (!window.patreonAuth) return;
    if (window.patreonAuth.isAuthenticated) return;
    if (isSessionInLocalStorage()) return;
    console.log(REDIRECT_LOG, 'Periodic check: redirecting to index (logged out)');
    window.location.href = 'index.html';
}, 60000);