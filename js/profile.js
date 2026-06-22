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

function rkLoadProgress() {
    try {
        const raw = localStorage.getItem('riffKillerProgressV1');
        return raw ? (JSON.parse(raw) || {}) : {};
    } catch (e) {
        return {};
    }
}

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
        if (window.patreonAuth && window.patreonAuth.userData && nameEl && (nameEl.textContent === 'Loading...' || !nameEl.textContent.trim())) {
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
    updatePracticeStats();
    updateGameDashboard();

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

    // Achievements: View all (expand grid)
    var viewAllLink = document.querySelector('.view-all-link');
    if (viewAllLink) {
        viewAllLink.addEventListener('click', function (e) {
            e.preventDefault();
            var grid = document.getElementById('achievementsGrid');
            if (!grid) return;
            if (!window.__rkAchievementsWithStatus || !window.__rkAchievementsWithStatus.length) return;
            grid.innerHTML = window.__rkAchievementsWithStatus.map(function (it) { return it.html; }).join('');
            viewAllLink.style.display = 'none';
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
        var sourceLabel = (sub.source === 'stripe') ? 'Stripe' : (sub.source === 'cryptomus') ? 'Cryptomus' : (sub.source === 'promo') ? 'Promo' : (sub.source === 'test') ? 'Test' : 'Patreon';
        var nextBilling = '';
        if (subExpiresSec) {
            var d = new Date(subExpiresSec * 1000);
            nextBilling = ' · Next billing: ' + d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
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
        var planLabel = (sub.source === 'patreon') ? 'Riff Killer' : ((sub.plan === 'yearly') ? 'Yearly' : 'Monthly');
        var statusLabel = (sub.status === 'active') ? 'Active' : (sub.status === 'expired') ? 'Expired' : (sub.status === 'cancelled') ? 'Cancelled' : sub.status || '—';
        var statusClass = (sub.status === 'active') ? 'status-active' : (sub.status === 'expired' || sub.status === 'cancelled') ? 'status-' + sub.status : '';
        var sourceLabel = (sub.source === 'stripe') ? 'Stripe' : (sub.source === 'cryptomus') ? 'Cryptomus' : (sub.source === 'patreon') ? 'Patreon' : (sub.source || '—');

        var nextBillingTs = sub.nextBillingDate != null ? sub.nextBillingDate : (sub.expiresAt != null ? sub.expiresAt : null);
        var nextBillingText = '—';
        if (nextBillingTs != null) {
            var ts = nextBillingTs;
            if (ts < 1e12) ts = ts * 1000;
            nextBillingText = new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
        }

        var manageHtml = '';
        if (hasActive && sub.source !== 'cryptomus' && auth.getBillingUrl) {
            manageHtml = '<a href="' + (auth.getBillingUrl(sub.source) || '#') + '" class="btn btn-primary btn-manage" target="_blank" rel="noopener noreferrer">Manage</a>';
        } else if (!hasActive) {
            manageHtml = '<a href="billing.html" class="btn btn-primary btn-manage">View Plans</a>';
        }
        contentEl.innerHTML =
            '<div class="subscription-detail-row"><span class="subscription-detail-label">Plan</span><span class="subscription-detail-value">' + planLabel + '</span></div>' +
            '<div class="subscription-detail-row"><span class="subscription-detail-label">Status</span><span class="subscription-detail-value ' + statusClass + '">' + statusLabel + '</span></div>' +
            '<div class="subscription-detail-row"><span class="subscription-detail-label">Payment method</span><span class="subscription-detail-value">' + sourceLabel + '</span></div>' +
            '<div class="subscription-detail-row"><span class="subscription-detail-label">Next billing date</span><span class="subscription-detail-value">' + nextBillingText + '</span></div>' +
            (manageHtml ? '<div class="subscription-details-actions">' + manageHtml + '</div>' : '');
        contentEl.style.display = 'block';
    } else {
        emptyEl.style.display = 'block';
    }
}

// Модальное окно «Войдите в Patreon, чтобы сохранять избранное» (для профиля)
function showFavoritesLoginModal() {
    if (document.getElementById('favoritesLoginModal')) return;
    const backdrop = document.createElement('div');
    backdrop.id = 'favoritesLoginBackdrop';
    backdrop.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0, 0, 0, 0.8); z-index: 9999; backdrop-filter: blur(5px);';
    const modal = document.createElement('div');
    modal.id = 'favoritesLoginModal';
    modal.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: #1a1f33; border-radius: 24px; padding: 40px; width: min(360px, 90vw); z-index: 10000; text-align: center; border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 20px 60px rgba(0,0,0,0.5);';
    modal.innerHTML = `
        <p style="color: rgba(255,255,255,0.95); margin-bottom: 24px; line-height: 1.5;">Sign in with Patreon to save favorites.</p>
        <button id="favoritesLoginPatreonBtn" style="width: 100%; padding: 14px; background: #FF424D; color: white; border: none; border-radius: 12px; font-size: 16px; font-weight: 600; cursor: pointer; margin-bottom: 12px;">Sign in with Patreon</button>
        <button id="favoritesLoginCloseBtn" style="background: transparent; border: none; color: rgba(255,255,255,0.6); cursor: pointer; font-size: 14px;">Cancel</button>
    `;
    document.body.appendChild(backdrop);
    document.body.appendChild(modal);
    const closeModal = () => { backdrop.remove(); modal.remove(); };
    document.getElementById('favoritesLoginPatreonBtn').addEventListener('click', () => {
        closeModal();
        if (window.patreonAuth && typeof window.patreonAuth.login === 'function') window.patreonAuth.login();
    });
    document.getElementById('favoritesLoginCloseBtn').addEventListener('click', closeModal);
    backdrop.addEventListener('click', closeModal);
}

// Загрузка риффов пользователя ТОЛЬКО из localStorage (без демо-данных)
function loadUserRiffs() {
    try {
        const savedState = localStorage.getItem('riffKillerState');
        const appState = savedState ? JSON.parse(savedState) : {};

        const riffsDb = appState.riffsDatabase || [];

        // Недавно практикованные — только из localStorage; добавляем isFavorite из riffsDatabase для звёздочки
        const rawRecent = (appState.recentlyPracticed && Array.isArray(appState.recentlyPracticed))
            ? appState.recentlyPracticed
            : [];
        allRecentRiffs = rawRecent.map(r => ({
            ...r,
            isFavorite: !!(riffsDb.find(db => db.id === r.id) || {}).isFavorite
        }));

        // Избранные — из appState.riffsDatabase (isFavorite) + метаданные риффов для отображения
        const metadata = getRiffsMetadata();
        allFavoriteRiffs = metadata
            .filter(meta => (riffsDb.find(r => r.id === meta.id) || {}).isFavorite)
            .map(r => ({ ...r, isFavorite: true }));

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

// ========= PRACTICE STATS / CHALLENGE =========
function updatePracticeStats() {
    var totalLearned = 0;
    var riffsWithProgress = 0;
    var daysSet = new Set();
    var masteredRiffs = 0;
    var learnedAtSlowSpeed = false;

    try {
        var raw = localStorage.getItem('riffKillerProgressV1');
        var all = raw ? JSON.parse(raw) : {};
        if (all && typeof all === 'object') {
            Object.keys(all).forEach(function (riffId) {
                var p = all[riffId] || {};
                var learned = Array.isArray(p.learned) ? p.learned : [];
                if (learned.length) {
                    riffsWithProgress += 1;
                    totalLearned += learned.length;
                }
                if (p && p.learnedAtSlowSpeed) learnedAtSlowSpeed = true;
                if (p.lastPracticedAt) {
                    var d = new Date(p.lastPracticedAt);
                    if (!isNaN(d.getTime())) {
                        var key = d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
                        daysSet.add(key);
                    }
                }
            });
        }
    } catch (e) {
        console.error('Error reading practice stats:', e);
    }

    // Streaks: based on daysSet of practice days
    var streaks = computeStreaksFromDays(daysSet);
    var currentStreak = streaks.current;
    var bestStreak = streaks.best;

    var totalLearnedEl = document.getElementById('statTotalLearned');
    var riffsWithProgressEl = document.getElementById('statRiffsWithProgress');
    var currentStreakEl = document.getElementById('statCurrentStreak');
    var bestStreakEl = document.getElementById('statBestStreak');
    var challengeFillEl = document.getElementById('challengeProgressFill');
    var challengeTextEl = document.getElementById('challengeProgressText');
    var challengeMetaEl = document.getElementById('challengeMeta');

    if (totalLearnedEl) totalLearnedEl.textContent = totalLearned.toString();
    if (riffsWithProgressEl) riffsWithProgressEl.textContent = riffsWithProgress.toString();
    if (currentStreakEl) currentStreakEl.textContent = currentStreak + (currentStreak === 1 ? ' day' : ' days');
    if (bestStreakEl) bestStreakEl.textContent = bestStreak + (bestStreak === 1 ? ' day' : ' days');

    // Simple weekly challenge: 20 segments per rolling 7 days
    var weeklyLearned = estimateWeeklyLearned(all);
    var weeklyGoal = 20;
    var ratio = weeklyGoal > 0 ? Math.min(1, weeklyLearned / weeklyGoal) : 0;

    if (challengeFillEl) {
        challengeFillEl.style.width = (ratio * 100).toFixed(0) + '%';
    }
    if (challengeTextEl) {
        challengeTextEl.textContent = weeklyLearned + ' / ' + weeklyGoal + ' segments';
    }
    if (challengeMetaEl) {
        if (ratio >= 1) {
            challengeMetaEl.textContent = 'Weekly challenge completed – keep your streak going!';
        } else {
            challengeMetaEl.textContent = 'Learn 20 segments this week.';
        }
    }

    // Gamification
    try {
        var stats = getAggregatedStats(all, {
            totalLearned: totalLearned,
            riffsWithProgress: riffsWithProgress,
            currentStreak: currentStreak,
            bestStreak: bestStreak,
            weeklyLearned: weeklyLearned,
            weeklyGoal: weeklyGoal,
            learnedAtSlowSpeed: learnedAtSlowSpeed
        });
        renderAchievements(stats);
        updateGameDashboard(stats);
    } catch (e) {}
}

function getPracticeDaysSet(allProgress) {
    var daysSet = new Set();
    if (!allProgress || typeof allProgress !== 'object') return daysSet;
    Object.keys(allProgress).forEach(function (riffId) {
        var p = allProgress[riffId] || {};
        if (!p.lastPracticedAt) return;
        var d = new Date(p.lastPracticedAt);
        if (isNaN(d.getTime())) return;
        var key = d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
        daysSet.add(key);
    });
    return daysSet;
}

function getNextMilestone(currentStreak) {
    var milestones = [7, 30, 100];
    var next = milestones.find(function (m) { return m > currentStreak; }) || 100;
    var prev = milestones.slice().reverse().find(function (m) { return m <= currentStreak; }) || 0;
    var denom = Math.max(1, (next - prev));
    var percent = Math.max(0, Math.min(100, Math.round(((currentStreak - prev) / denom) * 100)));
    return { next: next, prev: prev, percent: percent };
}

function updateStreakCard(stats) {
    var current = (stats && stats.currentStreak) || 0;
    var nextData = getNextMilestone(current);
    var numEl = document.getElementById('streakNumber');
    var goalEl = document.getElementById('streakGoal');
    var fillEl = document.getElementById('streakProgressFill');
    var rewardEl = document.getElementById('streakRewardBadge');
    var streakHintEl = document.getElementById('streakProgressHint');
    if (numEl) numEl.textContent = String(current);
    if (goalEl) goalEl.textContent = String(nextData.next);
    if (fillEl) fillEl.style.width = String(nextData.percent) + '%';
    if (streakHintEl) {
        streakHintEl.textContent = 'Progress to ' + String(nextData.next) + '-day milestone';
    }
    if (rewardEl) rewardEl.textContent = nextData.next === 7 ? 'Double XP' : (nextData.next === 30 ? 'Streak Shield' : 'Legend Badge');

    var chips = document.querySelectorAll('#streakMilestones .chip');
    chips.forEach(function (chip) {
        var m = parseInt(chip.dataset.milestone || '0', 10);
        if (current >= m) chip.classList.add('achieved');
        else chip.classList.remove('achieved');
    });
}

function getMondayDate() {
    var d = new Date();
    var day = d.getDay(); // 0=Sun..6=Sat
    var diff = (day === 0 ? -6 : 1 - day); // to Monday
    d.setDate(d.getDate() + diff);
    return d.toISOString().split('T')[0];
}

function getAverageDailySegments() {
    const progress = rkLoadProgress();
    const now = Date.now();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    const segmentsByDay = {};

    Object.values(progress).forEach(function (riff) {
        if (!riff || !riff.lastPracticedAt || !Array.isArray(riff.learned)) return;
        var ts = new Date(riff.lastPracticedAt).getTime();
        if (isNaN(ts) || (now - ts) > sevenDays) return;
        var date = new Date(ts).toISOString().split('T')[0];
        segmentsByDay[date] = (segmentsByDay[date] || 0) + riff.learned.length;
    });

    const daysWithActivity = Object.keys(segmentsByDay).length;
    const totalSegments = Object.values(segmentsByDay).reduce(function (a, b) { return a + b; }, 0);
    return daysWithActivity > 0 ? totalSegments / daysWithActivity : 0;
}

function getWeeklyChallengeData(prefilledProgress) {
    var progressAll = rkLoadProgress();
    var progress = typeof prefilledProgress === 'number' ? prefilledProgress : estimateWeeklyLearned(progressAll);
    var avg = getAverageDailySegments();
    var computedGoal = Math.min(100, Math.max(15, Math.round(avg * 5)));
    var monday = getMondayDate();
    var today = new Date().toISOString().split('T')[0];

    var weeklyData = {};
    try { weeklyData = JSON.parse(localStorage.getItem('riffKillerWeekly') || '{}') || {}; } catch (e) { weeklyData = {}; }

    if (weeklyData.lastResetDate !== monday) {
        weeklyData.goal = computedGoal;
        weeklyData.lastResetDate = monday;
        weeklyData.progress = 0;
    }

    var goal = weeklyData.goal || computedGoal;
    weeklyData.progress = progress;

    var isCompleted = progress >= goal;
    if (isCompleted && weeklyData.lastCompletedDate !== today) {
        weeklyData.completions = (weeklyData.completions || 0) + 1;
        weeklyData.lastCompletedDate = today;
    }

    try { localStorage.setItem('riffKillerWeekly', JSON.stringify(weeklyData)); } catch (e2) {}
    return {
        progress: progress,
        goal: goal,
        isCompleted: isCompleted,
        completions: weeklyData.completions || 0
    };
}

function updateWeeklyChallengeCard(stats) {
    var weekly = getWeeklyChallengeData(stats && typeof stats.weeklyLearned === 'number' ? stats.weeklyLearned : undefined);
    var progressEl = document.getElementById('challengeProgress');
    var goalEl = document.getElementById('challengeGoal');
    var fillEl = document.getElementById('challengeProgressFill');
    var footerEl = document.getElementById('challengeFooter');
    var rewardEl = document.getElementById('challengeRewardBadge');

    if (progressEl) progressEl.textContent = String(weekly.progress);
    if (goalEl) goalEl.textContent = String(weekly.goal);
    if (fillEl) fillEl.style.width = Math.max(0, Math.min(100, Math.round((weekly.progress / Math.max(1, weekly.goal)) * 100))) + '%';
    if (rewardEl) rewardEl.textContent = weekly.isCompleted ? 'Done' : '2× XP';

    if (footerEl) {
        if (weekly.isCompleted) {
            footerEl.innerHTML = '<span class="completed-chip" id="challengeStatus"><span class="chip-icon">✨</span><span>Completed</span></span>';
        } else {
            footerEl.innerHTML = '<span class="chip dynamic-chip" id="challengeStatus"><span class="chip-icon">🎯</span><span>based on your pace</span></span>';
        }
    }
}

function updateGameDashboard(stats) {
    var progressAll = rkLoadProgress();
    var daysSet = getPracticeDaysSet(progressAll);
    var streaks = computeStreaksFromDays(daysSet);
    var s = stats || getAggregatedStats(progressAll, {
        totalLearned: 0,
        riffsWithProgress: 0,
        currentStreak: streaks.current,
        bestStreak: streaks.best,
        weeklyLearned: estimateWeeklyLearned(progressAll),
        weeklyGoal: 20,
        learnedAtSlowSpeed: false
    });
    updateStreakCard(s);
    updateWeeklyChallengeCard(s);
}

function getAggregatedStats(progressAll, base) {
    var progress = progressAll || rkLoadProgress();
    var out = Object.assign({
        totalLearned: 0,
        riffsWithProgress: 0,
        currentStreak: 0,
        bestStreak: 0,
        weeklyLearned: 0,
        weeklyGoal: 20,
        learnedAtSlowSpeed: false,
        weeklyCompletions: 0,
        masteredRiffs: 0
    }, base || {});

    out.masteredRiffs = countMasteredRiffsFromKnownTotals(progress);
    var weekly = getWeeklyChallengeData(out.weeklyLearned);
    out.weeklyCompletions = weekly.completions;
    Object.keys(progress).forEach(function (riffId) {
        var p = progress[riffId] || {};
        if (p.learnedAtSlowSpeed) out.learnedAtSlowSpeed = true;
    });
    return out;
}

function updateStreakDashboard(currentStreak) {
    var numEl = document.getElementById('streakNumber');
    var flameEl = document.getElementById('streakFlame');
    var nextEl = document.getElementById('streakNext');
    var milestonesWrap = document.getElementById('streakMilestones');
    if (!numEl || !flameEl || !nextEl || !milestonesWrap) return;

    numEl.textContent = String(currentStreak || 0);
    var lvl = (currentStreak >= 30) ? 3 : (currentStreak >= 7) ? 2 : 1;
    flameEl.setAttribute('data-level', String(lvl));
    flameEl.setAttribute('data-tooltip', 'Current streak: ' + String(currentStreak || 0) + ' day(s)');

    var milestones = [7, 30, 100];
    var next = null;
    for (var i = 0; i < milestones.length; i++) {
        if ((currentStreak || 0) < milestones[i]) { next = milestones[i]; break; }
    }
    if (next == null) {
        nextEl.textContent = 'Maxed: 100+ days';
    } else {
        var reward = next === 7 ? 'Double XP' : next === 30 ? 'Streak Shield' : 'Legend Badge';
        nextEl.innerHTML = 'Next: <span class="milestone-days">' + next + '</span> days → <span class="milestone-reward">' + reward + '</span>';
    }

    var ms = milestonesWrap.querySelectorAll('.milestone');
    ms.forEach(function (el) {
        var d = parseInt(el.getAttribute('data-days') || '0', 10);
        if ((currentStreak || 0) >= d) el.classList.add('achieved'); else el.classList.remove('achieved');
    });
}

function getKnownTotalSegmentsByRiffId(progressAll) {
    var map = {};
    // 1) From loaded riffs on profile (best)
    try {
        (allRecentRiffs || []).forEach(function (r) {
            if (r && r.id != null && Array.isArray(r.segments) && r.segments.length) map[String(r.id)] = r.segments.length;
        });
        (allFavoriteRiffs || []).forEach(function (r) {
            if (r && r.id != null && Array.isArray(r.segments) && r.segments.length) map[String(r.id)] = r.segments.length;
        });
    } catch (e) {}
    // 2) From saved state riffsDatabase if present
    try {
        var savedState = localStorage.getItem('riffKillerState');
        var appState = savedState ? JSON.parse(savedState) : {};
        var db = appState && Array.isArray(appState.riffsDatabase) ? appState.riffsDatabase : [];
        db.forEach(function (r) {
            if (r && r.id != null && Array.isArray(r.segments) && r.segments.length) map[String(r.id)] = r.segments.length;
        });
    } catch (e2) {}
    // 3) From per-riff progress totalSegments (fallback)
    try {
        if (progressAll && typeof progressAll === 'object') {
            Object.keys(progressAll).forEach(function (id) {
                var p = progressAll[id] || {};
                if (typeof p.totalSegments === 'number' && p.totalSegments > 0) map[String(id)] = p.totalSegments;
            });
        }
    } catch (e3) {}
    return map;
}

function countMasteredRiffsFromKnownTotals(progressAll) {
    if (!progressAll || typeof progressAll !== 'object') return 0;
    var totals = getKnownTotalSegmentsByRiffId(progressAll);
    var cnt = 0;
    Object.keys(progressAll).forEach(function (riffId) {
        var p = progressAll[riffId] || {};
        var learned = Array.isArray(p.learned) ? p.learned : [];
        var total = totals[String(riffId)] || 0;
        if (total > 0 && learned.length >= total) cnt += 1;
    });
    return cnt;
}

function getIsoWeekKey(d) {
    // ISO week: https://en.wikipedia.org/wiki/ISO_week_date
    var date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    var dayNum = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    var yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    var weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
    return date.getUTCFullYear() + '-W' + String(weekNo).padStart(2, '0');
}

function updateWeeklyCompletions(weeklyLearned, weeklyGoal) {
    var now = new Date();
    var key = getIsoWeekKey(now);
    var data = {};
    try { data = JSON.parse(localStorage.getItem('riffKillerWeekly') || '{}') || {}; } catch (e) { data = {}; }
    var completions = typeof data.completions === 'number' ? data.completions : 0;
    var lastCompletedKey = data.lastCompletedKey || '';
    var completedNow = weeklyGoal > 0 && weeklyLearned >= weeklyGoal;
    if (completedNow && lastCompletedKey !== key) {
        completions += 1;
        data.completions = completions;
        data.lastCompletedKey = key;
        try { localStorage.setItem('riffKillerWeekly', JSON.stringify(data)); } catch (e2) {}
    }
    return completions;
}

const achievements = [
    {
        id: 'first_kill',
        name: 'First Blood',
        description: 'Learn your first segment',
        icon: '🎸',
        condition: (stats) => (stats.totalLearned || 0) >= 1,
        getProgress: (stats) => Math.min(1, (stats.totalLearned || 0) / 1),
        maxProgress: 1
    },
    {
        id: 'speed_demon',
        name: 'Speed Demon',
        description: 'Learn a segment at 0.5x speed',
        icon: '⚡',
        condition: (stats) => stats.learnedAtSlowSpeed || false,
        getProgress: (stats) => (stats.learnedAtSlowSpeed ? 1 : 0),
        maxProgress: 1
    },
    {
        id: 'weekly_warrior',
        name: 'Weekly Warrior',
        description: 'Complete weekly challenge',
        icon: '⚔️',
        condition: (stats) => (stats.weeklyCompletions || 0) >= 5,
        getProgress: (stats) => Math.min(5, (stats.weeklyCompletions || 0)),
        maxProgress: 5,
        showProgress: true
    },
    {
        id: 'perfectionist',
        name: 'Perfectionist',
        description: 'Master a riff (all segments)',
        icon: '🏆',
        condition: (stats) => (stats.masteredRiffs || 0) >= 10,
        getProgress: (stats) => Math.min(10, (stats.masteredRiffs || 0)),
        maxProgress: 10,
        showProgress: true
    }
];

function renderAchievements(stats) {
    var grid = document.getElementById('achievementsGrid');
    if (!grid) return;
    var items = achievements.map(function (a) {
        var current = 0;
        try { current = typeof a.getProgress === 'function' ? a.getProgress(stats) : 0; } catch (e) { current = 0; }
        var earned = current >= a.maxProgress;
        var progressPct = a.maxProgress ? Math.min(100, Math.round((current / a.maxProgress) * 100)) : (earned ? 100 : 0);
        return { a: a, earned: earned, current: current, progressPct: progressPct };
    });

    items.sort(function (x, y) {
        if (x.earned !== y.earned) return x.earned ? -1 : 1;
        return (y.progressPct || 0) - (x.progressPct || 0);
    });

    var htmlItems = items.map(function (it) {
        var a = it.a;
        var earnedClass = it.earned ? 'earned' : '';
        var showProgress = !!a.showProgress;
        var progressHtml = '';
        if (showProgress) {
            progressHtml =
                '<div class="achievement-progress">' +
                '<div class="progress-bar"><div style="width:' + it.progressPct + '%"></div></div>' +
                '<span>' + Math.round(it.current) + '/' + a.maxProgress + '</span>' +
                '</div>';
        }
        var cardHtml = (
            '<div class="achievement-card ' + earnedClass + '" data-id="' + a.id + '">' +
            '<div class="achievement-icon">' + a.icon + '</div>' +
            '<div class="achievement-name">' + a.name + '</div>' +
            '<div class="achievement-desc">' + a.description + '</div>' +
            progressHtml +
            '</div>'
        );
        return { id: a.id, html: cardHtml };
    });

    // cache for View all
    window.__rkAchievementsWithStatus = htmlItems;

    grid.innerHTML = htmlItems.slice(0, 4).map(function (x) { return x.html; }).join('');
}

function calculateMastery(riff) {
    var learnedCount = 0;
    var total = 0;
    try {
        var raw = localStorage.getItem('riffKillerProgressV1');
        var all = raw ? JSON.parse(raw) : {};
        var p = all && all[String(riff.id)] ? all[String(riff.id)] : null;
        var learned = p && Array.isArray(p.learned) ? p.learned : [];
        total = riff && riff.segments && riff.segments.length ? riff.segments.length : 0;
        if (total > 0) {
            learnedCount = learned.filter(function (i) { return typeof i === 'number' && i >= 0 && i < total; }).length;
        }
    } catch (e) {}

    var pct = total > 0 ? Math.round((learnedCount / total) * 100) : 0;
    var stars = 0;
    if (pct >= 100) stars = 5;
    else if (pct >= 81) stars = 4;
    else if (pct >= 61) stars = 3;
    else if (pct >= 41) stars = 2;
    else if (pct >= 21) stars = 1;
    else stars = 0;

    var label = stars === 0 ? 'Warm up' : stars === 1 ? 'Getting there' : stars === 2 ? 'Killing it!' : stars === 3 ? 'On fire' : stars === 4 ? 'Almost killed' : 'KILLED';
    return { pct: pct, stars: stars, label: label, learned: learnedCount, total: total };
}

function computeStreaksFromDays(daysSet) {
    if (!daysSet || daysSet.size === 0) {
        return { current: 0, best: 0 };
    }
    // Convert to sorted array of timestamps (midnight UTC)
    var timestamps = Array.from(daysSet).map(function (key) {
        var parts = key.split('-');
        var y = parseInt(parts[0], 10);
        var m = parseInt(parts[1], 10) - 1;
        var d = parseInt(parts[2], 10);
        return Date.UTC(y, m, d);
    }).sort(function (a, b) { return a - b; });

    var ONE_DAY = 24 * 60 * 60 * 1000;
    var best = 1;
    var current = 1;

    for (var i = 1; i < timestamps.length; i++) {
        if (timestamps[i] - timestamps[i - 1] === ONE_DAY) {
            current += 1;
        } else {
            if (current > best) best = current;
            current = 1;
        }
    }
    if (current > best) best = current;

    // Current streak relative to today
    var today = new Date();
    var todayUTC = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
    var yesterdayUTC = todayUTC - ONE_DAY;
    var lastDay = timestamps[timestamps.length - 1];

    var currentStreak = 0;
    if (lastDay === todayUTC || lastDay === yesterdayUTC) {
        // Walk backwards from lastDay while consecutive
        currentStreak = 1;
        for (var j = timestamps.length - 2; j >= 0; j--) {
            if (lastDay - timestamps[j] === ONE_DAY) {
                currentStreak += 1;
                lastDay = timestamps[j];
            } else {
                break;
            }
        }
    }

    return { current: currentStreak, best: best };
}

function estimateWeeklyLearned(allProgress) {
    if (!allProgress || typeof allProgress !== 'object') return 0;
    var now = Date.now();
    var SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
    var cutoff = now - SEVEN_DAYS;
    var total = 0;
    Object.keys(allProgress).forEach(function (riffId) {
        var p = allProgress[riffId] || {};
        if (!p.lastPracticedAt) return;
        var t = p.lastPracticedAt;
        if (typeof t === 'string' || typeof t === 'number') {
            var n = new Date(t).getTime();
            if (!isNaN(n) && n >= cutoff) {
                var learned = Array.isArray(p.learned) ? p.learned : [];
                total += learned.length;
            }
        }
    });
    return total;
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
        grid.innerHTML = '<p class="profile-empty-state">No favorites yet. Add some from the main page by clicking the star on any riff!</p>';
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

    const isFavorite = type === 'favorite' ? true : !!riff.isFavorite;
    const riffForCard = Object.assign({}, riff, { isFavorite: isFavorite });

    var mastery = calculateMastery(riff);
    var masteryStarsHtml = '';
    if (mastery && mastery.total > 0) {
        var stars = mastery.stars || 0;
        var filled = Math.max(0, Math.min(5, stars));
        var empty = 5 - filled;
        var tooltip = mastery.pct + '% (' + mastery.learned + '/' + mastery.total + ')';
        var starsHtml = '';
        for (var s = 0; s < filled; s++) starsHtml += '<span class="star filled">★</span>';
        for (var e = 0; e < empty; e++) starsHtml += '<span class="star empty">☆</span>';
        masteryStarsHtml =
            '<div class="riff-mastery">' +
            '<div class="mastery-stars" data-mastery="' +
            filled +
            '" data-tooltip="' +
            tooltip +
            '">' +
            starsHtml +
            (filled === 5 ? '<span class="killed-badge">KILLED</span>' : '') +
            '</div>' +
            '<span class="mastery-label">' +
            (mastery.label || '') +
            '</span>' +
            '</div>';
    }

    return window.RiffKillerRiffGallery.createCard(riffForCard, {
        extraMetaHtml: masteryStarsHtml,
        onFavoriteClick: function (e, favBtn) {
            e.stopPropagation();
            if (!window.patreonAuth || !window.patreonAuth.isAuthenticated) {
                showFavoritesLoginModal();
                return;
            }
            toggleRiffFavorite(favBtn, riff.id, type);
        },
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

// Переключение избранного для риффа (только для авторизованных)
function toggleRiffFavorite(button, riffId, type) {
    button.classList.toggle('active');
    const isNowFavorite = button.classList.contains('active');
    button.setAttribute('aria-label', isNowFavorite ? 'Remove from favorites' : 'Add to favorites');
    
    try {
        const savedState = localStorage.getItem('riffKillerState');
        const appState = savedState ? JSON.parse(savedState) : { currentRiffId: null, recentlyPracticed: [], trialRiffId: null, riffsDatabase: [] };
        if (!appState.riffsDatabase) appState.riffsDatabase = [];
        
        const riffIndex = appState.riffsDatabase.findIndex(r => r.id === riffId);
        if (riffIndex !== -1) {
            appState.riffsDatabase[riffIndex].isFavorite = isNowFavorite;
        } else {
            appState.riffsDatabase.push({ id: riffId, isFavorite: isNowFavorite });
        }
        
        localStorage.setItem('riffKillerState', JSON.stringify(appState));
        
        if (type === 'favorite' && !isNowFavorite) {
            allFavoriteRiffs = allFavoriteRiffs.filter(r => r.id !== riffId);
            favoritesPage = 1;
            displayFavoriteRiffs(1);
        }
    } catch (e) {
        console.error('Error toggling favorite:', e);
    }
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