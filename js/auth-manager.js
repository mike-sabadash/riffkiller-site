// ==========================================================================
// Auth Manager - Unified subscription (Patreon, Stripe, Cryptomus)
// Replaces patreon-auth.js; keeps backward compatibility via window.patreonAuth
// ==========================================================================

const BILLING_URLS = {
    patreon: 'https://www.patreon.com/cw/MikeSabadash?vanity=MikeSabadash',
    stripe: 'https://billing.stripe.com/p/login/placeholder', // Replace with your Stripe customer portal
    cryptomus: 'https://cryptomus.com/dashboard'             // Replace with your Cryptomus billing link
};

function normalizeEpochMs(ts) {
    if (ts == null) return null;
    const n = (typeof ts === 'number') ? ts : parseInt(ts, 10);
    if (!Number.isFinite(n) || n <= 0) return null;
    // backend stores seconds; JS compares milliseconds
    return n < 1000000000000 ? n * 1000 : n;
}

function normalizeSubscription(data, source) {
    if (!data || typeof data !== 'object') return null;
    const src = (source === 'patreon' || source === 'stripe' || source === 'cryptomus' || source === 'promo' || source === 'test') ? source : 'patreon';
    let status = 'active';
    if (data.status === 'expired' || data.status === 'cancelled') status = data.status;
    else if (data.status === 'inactive') status = 'cancelled';
    else if (data.status === 'active') status = 'active';
    const expiresAt = normalizeEpochMs(data.expiresAt);
    const nextBillingDate = normalizeEpochMs(data.nextBillingDate);
    const plan = (data.plan === 'yearly') ? 'yearly' : 'monthly';
    return { source: src, status, expiresAt: expiresAt || null, nextBillingDate: nextBillingDate || null, plan };
}

function migrateSubscription(oldSub) {
    if (!oldSub || typeof oldSub !== 'object') return null;
    const source = (oldSub.source === 'stripe' || oldSub.source === 'cryptomus' || oldSub.source === 'promo' || oldSub.source === 'test') ? oldSub.source : 'patreon';
    let status = 'active';
    if (oldSub.status === 'expired' || oldSub.status === 'cancelled') status = oldSub.status;
    else if (oldSub.status === 'inactive') status = 'cancelled';
    else if (oldSub.status === 'active') status = 'active';
    const expiresAt = normalizeEpochMs(oldSub.expiresAt);
    const nextBillingDate = normalizeEpochMs(oldSub.nextBillingDate);
    const plan = oldSub.plan === 'yearly' ? 'yearly' : 'monthly';
    return { source, status, expiresAt: expiresAt || null, nextBillingDate: nextBillingDate || null, plan };
}

function getApiBase() {
    if (typeof window === 'undefined' || !window.location) return '';
    return window.location.origin || '';
}

/** Путь к статике от каталога сайта (работает из подпапок и при другом base href). */
function resolveRkStaticAsset(relPath) {
    if (typeof document === 'undefined') return relPath;
    var scripts = document.getElementsByTagName('script');
    for (var i = scripts.length - 1; i >= 0; i--) {
        var src = scripts[i].src;
        if (!src) continue;
        var m = src.match(/^(.*\/)js\/auth-manager\.js(?:\?|$)/i);
        if (m) return m[1] + String(relPath).replace(/^\//, '');
    }
    return relPath;
}

class AuthManager {
    constructor() {
        this.isAuthenticated = false;
        this.userData = null;
        this.subscription = null;
        this.token = null;
        this.listeners = [];
        this._loadSessionFromStorage();
        this.loadSession();
    }

    loadSession() {
        const self = this;
        fetch(getApiBase() + '/api/me.php', { method: 'GET', credentials: 'include' })
            .then(function (r) { return r.json().then(function (data) { return { ok: r.ok, data: data }; }); })
            .then(function (result) {
                if (result.ok && result.data.success && result.data.authenticated && result.data.user) {
                    const u = result.data.user;
                    self.isAuthenticated = true;
                    self.userData = {
                        id: u.id,
                        full_name: u.full_name || u.name || 'User',
                        image_url: u.image_url || '',
                        email: u.email || '',
                        provider: u.provider || 'email'
                    };
                    self.token = null;
                    self.saveSession();
                    self.notifyListeners();
                    self.updateAllAuthButtons();
                    if (u.id) self.fetchSubscriptionFromServer(u.id);
                    return;
                }
                if (result.data && result.data.authenticated === false) {
                    try { localStorage.removeItem('riffKillerAuth'); } catch (e) {}
                }
                self._loadSessionFromStorage();
            })
            .catch(function () {
                self._loadSessionFromStorage();
            });
    }

    _loadSessionFromStorage() {
        try {
            const session = localStorage.getItem('riffKillerAuth');
            if (session) {
                const data = JSON.parse(session);
                this.isAuthenticated = data.isAuthenticated || false;
                this.userData = data.userData || null;
                const raw = data.subscription || null;
                this.subscription = raw ? migrateSubscription(raw) : null;
                this.token = data.token || null;
                const isStripeOnly = this.userData && this.userData.source === 'stripe';
                const SKIP_VALIDATION_ON_LOAD = false;
                if (this.token && !SKIP_VALIDATION_ON_LOAD && !isStripeOnly) {
                    this.validateToken();
                }
                if (this.userData && this.userData.id) {
                    this.fetchSubscriptionFromServer(this.userData.id);
                }
            }
            this.notifyListeners();
            this.updateAllAuthButtons();
        } catch (e) {
            console.error('Error loading auth session:', e);
        }
    }

    /** Fetch unified subscription from API and merge into localStorage (Stripe/Cryptomus/Patreon). */
    fetchSubscriptionFromServer(userId) {
        if (!userId) return Promise.resolve();
        const url = '/api/subscription/get.php?user_id=' + encodeURIComponent(userId);
        return fetch(url)
            .then(r => r.json())
            .then(data => {
                if (data.success && data.subscription && data.subscription.status) {
                    const sub = data.subscription;
                    this.subscription = normalizeSubscription({
                        status: sub.status,
                        plan: sub.plan,
                        source: sub.source,
                        expiresAt: sub.expiresAt
                    }, sub.source || 'stripe');
                    this.saveSession();
                    this.notifyListeners();
                    this.updateAllAuthButtons();
                }
            })
            .catch(e => console.warn('Subscription fetch failed', e));
    }

    saveSession() {
        try {
            const session = {
                isAuthenticated: this.isAuthenticated,
                userData: this.userData,
                subscription: this.subscription,
                token: this.token,
                timestamp: Date.now()
            };
            localStorage.setItem('riffKillerAuth', JSON.stringify(session));
        } catch (e) {
            console.error('Error saving auth session:', e);
        }
    }

    clearSessionOnly() {
        this.isAuthenticated = false;
        this.userData = null;
        this.subscription = null;
        this.token = null;
        localStorage.removeItem('riffKillerAuth');
        this.notifyListeners();
        this.updateAllAuthButtons();
    }

    logout() {
        const self = this;
        fetch(getApiBase() + '/api/logout.php', { method: 'POST', credentials: 'include' })
            .then(function () { self.clearSessionOnly(); })
            .catch(function () { self.clearSessionOnly(); });
        var path = window.location.pathname || '';
        var isCallback = path.indexOf('patreon-callback') !== -1;
        if (isCallback) return;
        if (!path.includes('index.html')) {
            window.location.href = 'index.html';
        }
    }

    addListener(callback) {
        this.listeners.push(callback);
    }

    notifyListeners() {
        this.listeners.forEach(cb => {
            try {
                cb({
                    isAuthenticated: this.isAuthenticated,
                    userData: this.userData,
                    subscription: this.subscription
                });
            } catch (e) {
                console.error('Error in listener:', e);
            }
        });
    }

    getAuthUrl(options) {
        // redirect_uri MUST be non-empty and exactly match Patreon app; never send empty (Patreon may then use wrong default)
        const redirectUri = (typeof PATREON_CONFIG !== 'undefined' && PATREON_CONFIG.redirectUri)
            ? PATREON_CONFIG.redirectUri
            : 'https://riffkiller.fun/patreon-callback.html';
        const params = new URLSearchParams({
            response_type: 'code',
            client_id: typeof PATREON_CONFIG !== 'undefined' ? PATREON_CONFIG.clientId : '',
            redirect_uri: redirectUri,
            scope: typeof PATREON_CONFIG !== 'undefined' ? PATREON_CONFIG.scope : 'identity identity[email] identity.memberships campaigns',
            state: this.generateState(options)
        });
        return `https://www.patreon.com/oauth2/authorize?${params.toString()}`;
    }

    generateState(options) {
        const token = Math.random().toString(36).substring(2, 15);
        const state = (options && options.afterAuth === 'campaign') ? token + '|campaign' : token;
        localStorage.setItem('patreonState', state);
        if (options && options.afterAuth === 'campaign') {
            localStorage.setItem('patreonRedirectAfterAuth', 'campaign');
        }
        return state;
    }

    verifyState(state) {
        const savedState = localStorage.getItem('patreonState');
        localStorage.removeItem('patreonState');
        return savedState === state;
    }

    login(tab) {
        this.showAuthModal(tab);
    }

    loginPatreon(options) {
        const authUrl = this.getAuthUrl(options || {});
        const redirectUri = (typeof PATREON_CONFIG !== 'undefined' && PATREON_CONFIG.redirectUri)
            ? PATREON_CONFIG.redirectUri
            : 'https://riffkiller.fun/patreon-callback.html';
        console.log('Patreon login: redirect_uri in request =', redirectUri);
        window.location.href = authUrl;
    }

    loginGoogle() {
        window.location.href = getApiBase() + '/api/auth/google-login.php';
    }

    loginYandex() {
        window.location.href = getApiBase() + '/api/auth/yandex-login.php';
    }

    loginWithPassword(email, password) {
        const self = this;
        fetch(getApiBase() + '/api/auth/email-login.php', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: String(email).trim(), password: String(password) })
        })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (data.success && data.user) {
                    self.isAuthenticated = true;
                    self.userData = { id: data.user.id, full_name: data.user.full_name || 'User', image_url: data.user.image_url || '', email: data.user.email || '', provider: 'email' };
                    self.token = null;
                    self.saveSession();
                    self.notifyListeners();
                    self.updateAllAuthButtons();
                    var back = document.getElementById('riffKillerAuthModalBackdrop');
                    if (back && back.parentNode) back.parentNode.removeChild(back);
                    return;
                }
                if (self._authModalEmailMessage) {
                    self._authModalEmailMessage.textContent = data.error || 'Invalid email or password.';
                    self._authModalEmailMessage.style.display = 'block';
                }
            })
            .catch(function () {
                if (self._authModalEmailMessage) {
                    self._authModalEmailMessage.textContent = 'Network error. Try again.';
                    self._authModalEmailMessage.style.display = 'block';
                }
            });
    }

    registerWithPassword(email, password, name) {
        const self = this;
        fetch(getApiBase() + '/api/auth/email-register.php', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: String(email).trim(), password: String(password), name: String(name || '').trim() })
        })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (data.success && data.user) {
                    self.isAuthenticated = true;
                    self.userData = { id: data.user.id, full_name: data.user.full_name || name || 'User', image_url: data.user.image_url || '', email: data.user.email || '', provider: 'email' };
                    self.token = null;
                    self.saveSession();
                    self.notifyListeners();
                    self.updateAllAuthButtons();
                    var back = document.getElementById('riffKillerAuthModalBackdrop');
                    if (back && back.parentNode) back.parentNode.removeChild(back);
                    return;
                }
                if (self._authModalEmailMessage) {
                    self._authModalEmailMessage.textContent = data.error || 'Registration failed.';
                    self._authModalEmailMessage.style.display = 'block';
                }
            })
            .catch(function () {
                if (self._authModalEmailMessage) {
                    self._authModalEmailMessage.textContent = 'Network error. Try again.';
                    self._authModalEmailMessage.style.display = 'block';
                }
            });
    }

    showAuthModal(initialTab) {
        if (document.getElementById('riffKillerAuthModal')) return;
        const authMgr = this;
        const backdrop = document.createElement('div');
        backdrop.id = 'riffKillerAuthModalBackdrop';
        backdrop.className = 'auth-modal-backdrop';
        const modal = document.createElement('div');
        modal.id = 'riffKillerAuthModal';
        modal.className = 'auth-modal';
        const base = getApiBase();
        modal.innerHTML = '<div class="auth-modal-header">' +
            '<h2 class="auth-modal-title">Sign in</h2>' +
            '<button type="button" class="auth-modal-close" aria-label="Close">' +
            '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">' +
            '<path d="M18 6L6 18M6 6l12 12"/></svg></button>' +
            '</div>' +
            '<div class="auth-modal-body">' +
            '<p class="auth-modal-subtitle">Sign in or create an account to save progress and manage subscription.</p>' +
            '<div class="auth-modal-segment-wrap">' +
            '<div class="auth-email-toggle" role="tablist" aria-label="Account">' +
            '<button type="button" class="auth-toggle-btn active" id="authTabLogin" role="tab">Log in</button>' +
            '<button type="button" class="auth-toggle-btn" id="authTabSignup" role="tab">Sign up</button>' +
            '</div></div>' +
            '<div class="auth-modal-fields">' +
            '<input type="text" class="auth-email-input" id="authModalNameInput" placeholder="Your name" autocomplete="name" style="display:none;">' +
            '<input type="email" class="auth-email-input" id="authModalEmailInput" placeholder="your@email.com" autocomplete="email" autocapitalize="off" autocorrect="off">' +
            '<input type="password" class="auth-email-input" id="authModalPasswordInput" placeholder="Password" autocomplete="current-password">' +
            '<button type="button" class="auth-btn auth-btn-email" id="authModalEmailBtn">Log in</button>' +
            '</div>' +
            '<p class="auth-email-message" id="authModalEmailMessage" style="display:none;"></p>' +
            '<div class="auth-divider"><span>or</span></div>' +
            '<div class="auth-social-row">' +
            '<button type="button" class="auth-social-btn" id="authModalGoogle" aria-label="Continue with Google"><svg viewBox="0 0 24 24" width="22" height="22"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg></button>' +
            '<button type="button" class="auth-social-btn auth-social-btn-patreon" id="authModalPatreon" aria-label="Continue with Patreon"><svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M4.5 3C3.11929 3 2 4.11929 2 5.5V18.5C2 19.8807 3.11929 21 4.5 21H7V3H4.5Z"/><circle cx="15" cy="9" r="5" fill="currentColor"/></svg></button>' +
            '</div>' +
            '<div class="auth-promo-block">' +
            '<button type="button" class="auth-promo-toggle" id="authModalPromoToggle">Have a promo code?</button>' +
            '<div class="auth-promo-inputs" id="authModalPromoInputs" style="display:none;">' +
            '<input type="text" class="auth-email-input" id="authModalPromoInput" placeholder="Enter promo code" autocomplete="off">' +
            '<button type="button" class="auth-btn auth-btn-outline auth-btn-promo" id="authModalPromoBtn">Apply</button>' +
            '<p class="auth-email-message" id="authModalPromoMessage" style="display:none;"></p>' +
            '</div></div>' +
            '</div></div>';
        backdrop.appendChild(modal);
        document.body.appendChild(backdrop);
        this._authModalEmailMessage = document.getElementById('authModalEmailMessage');

        function closeModal() {
            if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
        }
        modal.querySelector('.auth-modal-close').addEventListener('click', closeModal);
        backdrop.addEventListener('click', function (e) {
            if (e.target === backdrop) closeModal();
        });
        document.getElementById('authModalPatreon').addEventListener('click', function () { this.loginPatreon(); }.bind(this));
        document.getElementById('authModalGoogle').addEventListener('click', function () { this.loginGoogle(); }.bind(this));
        document.getElementById('authModalPromoToggle').addEventListener('click', function () {
            var el = document.getElementById('authModalPromoInputs');
            el.style.display = el.style.display === 'none' ? 'flex' : 'none';
            if (el.style.display === 'flex') document.getElementById('authModalPromoInput').focus();
        });
        document.getElementById('authModalPromoBtn').addEventListener('click', function () {
            var code = (document.getElementById('authModalPromoInput').value || '').trim().toUpperCase();
            var msg = document.getElementById('authModalPromoMessage');
            if (!code) { msg.textContent = 'Enter your promo code.'; msg.style.display = 'block'; return; }
            msg.style.display = 'none';
            fetch(getApiBase() + '/api/apply-promo.php', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: code })
            }).then(function (r) {
                if (r.status === 401) {
                    var loginTab = document.getElementById('authTabLogin');
                    if (loginTab && !loginTab.classList.contains('active')) loginTab.click();
                    return { success: false, error: 'Sign in or create an account first. Then apply the promo code here or in Profile.' };
                }
                return r.json();
            }).then(function (data) {
                if (data.success) {
                    authMgr.updateSubscription('promo', data.subscription || { status: 'active' });
                    authMgr.notifyListeners();
                    authMgr.updateAllAuthButtons();
                    msg.style.color = 'var(--color-accent-gold,#4CAF50)';
                    msg.textContent = data.message || 'Promo applied!';
                    msg.style.display = 'block';
                    setTimeout(function () {
                        var back = document.getElementById('riffKillerAuthModalBackdrop');
                        if (back && back.parentNode) back.parentNode.removeChild(back);
                    }, 1500);
                } else {
                    msg.style.color = '';
                    msg.textContent = data.error || 'Invalid promo code.';
                    msg.style.display = 'block';
                }
            }).catch(function () {
                msg.style.color = '';
                msg.textContent = 'Network error. Try again.';
                msg.style.display = 'block';
            });
        });
        var self = this;
        document.getElementById('authTabLogin').addEventListener('click', function () {
            document.getElementById('authModalNameInput').style.display = 'none';
            document.getElementById('authModalEmailBtn').textContent = 'Log in';
            document.querySelectorAll('.auth-toggle-btn').forEach(function (t) { t.classList.remove('active'); });
            this.classList.add('active');
        });
        document.getElementById('authTabSignup').addEventListener('click', function () {
            document.getElementById('authModalNameInput').style.display = 'block';
            document.getElementById('authModalEmailBtn').textContent = 'Sign up';
            document.querySelectorAll('.auth-toggle-btn').forEach(function (t) { t.classList.remove('active'); });
            this.classList.add('active');
        });
        if (initialTab === 'signup') {
            document.getElementById('authTabSignup').click();
        }
        var promoFromUrl = (typeof window !== 'undefined' && window.location && window.location.search)
            ? new URLSearchParams(window.location.search).get('promo')
            : '';
        if (promoFromUrl) {
            var promoInputEl = document.getElementById('authModalPromoInput');
            var promoInputsEl = document.getElementById('authModalPromoInputs');
            if (promoInputEl) promoInputEl.value = promoFromUrl.trim();
            if (promoInputsEl) promoInputsEl.style.display = 'flex';
        }
        [document.getElementById('authModalEmailInput'), document.getElementById('authModalPasswordInput')].forEach(function (el) {
            if (el) el.addEventListener('input', function () { el.classList.remove('auth-input-error'); });
        });
        document.getElementById('authModalEmailBtn').addEventListener('click', function () {
            var emailEl = document.getElementById('authModalEmailInput');
            var passEl = document.getElementById('authModalPasswordInput');
            var nameEl = document.getElementById('authModalNameInput');
            var email = emailEl && emailEl.value ? emailEl.value.trim() : '';
            var password = passEl ? passEl.value : '';
            var isSignup = document.getElementById('authTabSignup') && document.getElementById('authTabSignup').classList.contains('active');
            if (!email) {
                emailEl.placeholder = 'Enter your email';
                emailEl.classList.add('auth-input-error');
                if (passEl) passEl.classList.remove('auth-input-error');
                if (self._authModalEmailMessage) self._authModalEmailMessage.style.display = 'none';
                return;
            }
            if (!password) {
                passEl.placeholder = 'Enter your password';
                passEl.classList.add('auth-input-error');
                emailEl.classList.remove('auth-input-error');
                emailEl.placeholder = 'your@email.com';
                if (self._authModalEmailMessage) self._authModalEmailMessage.style.display = 'none';
                return;
            }
            if (isSignup && password.length < 6) {
                passEl.placeholder = 'At least 6 characters';
                passEl.classList.add('auth-input-error');
                if (self._authModalEmailMessage) self._authModalEmailMessage.style.display = 'none';
                return;
            }
            emailEl.classList.remove('auth-input-error');
            if (passEl) passEl.classList.remove('auth-input-error');
            emailEl.placeholder = 'your@email.com';
            passEl.placeholder = 'Password';
            if (self._authModalEmailMessage) self._authModalEmailMessage.style.display = 'none';
            if (isSignup) {
                self.registerWithPassword(email, password, nameEl && nameEl.value ? nameEl.value.trim() : '');
            } else {
                self.loginWithPassword(email, password);
            }
        });

        if (!document.getElementById('auth-modal-styles')) {
            const link = document.createElement('link');
            link.id = 'auth-modal-styles';
            link.rel = 'stylesheet';
            link.href = resolveRkStaticAsset('css/auth-modal.css');
            document.head.appendChild(link);
        }
    }

    async handleCallback(code, state) {
        if (!this.verifyState(state)) {
            console.error('State verification failed');
            return false;
        }
        try {
            const redirectUri = typeof PATREON_CONFIG !== 'undefined' ? PATREON_CONFIG.redirectUri : 'https://riffkiller.fun/patreon-callback.html';
            const response = await fetch(getApiBase() + '/patreon-exchange.php', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code, redirect_uri: redirectUri })
            });
            const data = await response.json();
            if (data.success) {
                this.token = data.token;
                this.userData = data.user;
                this.subscription = normalizeSubscription(data.subscription || { status: data.subscription && data.subscription.status || 'active' }, 'patreon');
                this.isAuthenticated = true;
                this.saveSession();
                this.notifyListeners();
                this.updateAllAuthButtons();
                window.location.href = 'profile.html';
                return true;
            }
            console.error('Auth failed:', data.error);
            return false;
        } catch (e) {
            console.error('Error in callback:', e);
            return false;
        }
    }

    async validateToken() {
        if (!this.token) return false;
        const RECENT_MS = 60 * 60 * 1000; // 1 hour: trust session when validation fails (e.g. server blocked by Patreon/Cloudflare)
        const isSessionRecent = () => {
            try {
                const raw = localStorage.getItem('riffKillerAuth');
                if (!raw) return false;
                const session = JSON.parse(raw);
                return !!(session.timestamp && (Date.now() - session.timestamp < RECENT_MS));
            } catch (_) {
                return false;
            }
        };
        try {
            const response = await fetch('/patreon-validate.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: this.token.access_token, user_id: this.userData && this.userData.id ? this.userData.id : null })
            });
            let data = {};
            try {
                data = await response.json();
            } catch (_) {
                console.warn('[Patreon auth] validateToken: response was not JSON', response.status);
            }
            if (data.valid) {
                this.subscription = normalizeSubscription(data.subscription || { status: 'active' }, 'patreon');
                this.saveSession();
                return true;
            }
            // Validation failed: don't clear session if it's still recent (user stays logged in across pages)
            if (isSessionRecent()) {
                console.warn('[Patreon auth] Validate failed but session is recent (< 1h); keeping session.', { status: response.status, data });
                return false;
            }
            console.warn('[Patreon auth] Validate failed and session is old; clearing.', { status: response.status, data });
            this.clearSessionOnly();
            return false;
        } catch (e) {
            console.error('Error validating token:', e);
            if (isSessionRecent()) {
                console.warn('[Patreon auth] Validate threw; session is recent; keeping session.');
                return false;
            }
            this.clearSessionOnly();
            return false;
        }
    }

    hasActiveSubscription() {
        if (!this.subscription) return false;
        if (this.subscription.expiresAt != null && this.subscription.expiresAt <= Date.now()) return false;
        if (this.subscription.status === 'active') return true;
        if (this.subscription.expiresAt != null && this.subscription.expiresAt > Date.now()) return true;
        return false;
    }

    async checkSubscription() {
        if (!this.subscription) return false;
        const src = this.subscription.source || 'patreon';
        if (src === 'patreon') {
            return this.token ? this.validateToken() : false;
        }
        if (src === 'stripe' || src === 'cryptomus' || src === 'promo' || src === 'test') {
            return this.hasActiveSubscription();
        }
        return this.hasActiveSubscription();
    }

    updateSubscription(source, data) {
        this.subscription = normalizeSubscription(data, source);
        this.saveSession();
        this.notifyListeners();
        this.updateAllAuthButtons();
    }

    /** After Stripe success: if user is not logged in via Patreon, "log in" as Stripe subscriber so header shows profile and premium. */
    setStripeOnlySession(sessionId, subscriptionData) {
        this.subscription = normalizeSubscription(subscriptionData, 'stripe');
        if (!this.isAuthenticated || !this.userData || !this.userData.id) {
            const key = (sessionId && String(sessionId).replace(/[^a-zA-Z0-9_]/g, '')) ? 'stripe_' + String(sessionId).replace(/[^a-zA-Z0-9_]/g, '').slice(0, 32) : 'stripe_subscriber';
            this.isAuthenticated = true;
            this.userData = { id: key, full_name: 'Premium Member', image_url: null, source: 'stripe' };
        }
        this.token = null; // no Patreon token — avoid validateToken() clearing session on profile load
        this.saveSession();
        this.notifyListeners();
        this.updateAllAuthButtons();
    }

    getBillingUrl(source) {
        const src = (source === 'patreon' || source === 'stripe' || source === 'cryptomus' || source === 'promo' || source === 'test') ? source : (this.subscription && this.subscription.source) || 'patreon';
        return BILLING_URLS[src] || BILLING_URLS.patreon;
    }

    updateAuthButtons() {
        const authButtons = document.querySelector('.auth-buttons');
        const mobileAuth = document.querySelector('.mobile-auth');
        if (!authButtons && !mobileAuth) return;
        const hasActive = typeof this.hasActiveSubscription === 'function' && this.hasActiveSubscription();
        // Always show Plans link (billing): "Plans" for non-subscribers, "Plans" for subscribers (manage)
        const plansLink = `<a href="billing.html" class="btn-plans-nav">Plans</a>`;
        const mobilePlans = `<a href="billing.html" class="btn-plans-nav mobile-plans-btn">Plans</a>`;

        if (this.isAuthenticated && this.userData) {
            const firstName = (this.userData.full_name || '').split(' ')[0] || 'User';
            const avatarUrl = this.userData.image_url || 'assets/icons/default-avatar.svg';
            if (authButtons) {
                authButtons.innerHTML = plansLink + `
                    <a href="profile.html" class="profile-mini">
                        <span class="profile-mini-name">${firstName}</span>
                        <div class="profile-mini-avatar">
                            <img src="${avatarUrl}" alt="Avatar" class="mini-avatar-img">
                        </div>
                    </a>
                `;
            }
            if (mobileAuth) {
                mobileAuth.innerHTML = mobilePlans + `
                    <a href="profile.html" class="mobile-profile-link">
                        <span class="mobile-profile-name">${this.userData.full_name}</span>
                        <button class="btn btn-primary mobile-logout-btn" id="mobileLogoutBtn">Log out</button>
                    </a>
                `;
                const mobileLogout = document.getElementById('mobileLogoutBtn');
                if (mobileLogout) {
                    mobileLogout.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        this.logout();
                    });
                }
            }
        } else {
            // Not authenticated: show Plans + Log in (outline) + Sign up (filled)
            if (authButtons) {
                authButtons.innerHTML = plansLink + `
                    <button class="btn btn-outline auth-header-btn" id="authLoginBtn">Log in</button>
                    <button class="btn btn-primary auth-header-btn" id="authSignupBtn">Sign up</button>
                `;
                const loginBtn = document.getElementById('authLoginBtn');
                const signupBtn = document.getElementById('authSignupBtn');
                if (loginBtn) loginBtn.addEventListener('click', (e) => { e.preventDefault(); this.login('login'); });
                if (signupBtn) signupBtn.addEventListener('click', (e) => { e.preventDefault(); this.login('signup'); });
            }
            if (mobileAuth) {
                mobileAuth.innerHTML = mobilePlans + `
                    <button class="btn btn-outline mobile-signup-btn" id="mobileAuthLoginBtn">Log in</button>
                    <button class="btn btn-primary mobile-signup-btn" id="mobileAuthSignupBtn">Sign up</button>
                `;
                const mobileLoginBtn = document.getElementById('mobileAuthLoginBtn');
                const mobileSignupBtn = document.getElementById('mobileAuthSignupBtn');
                if (mobileLoginBtn) mobileLoginBtn.addEventListener('click', (e) => { e.preventDefault(); this.login('login'); });
                if (mobileSignupBtn) mobileSignupBtn.addEventListener('click', (e) => { e.preventDefault(); this.login('signup'); });
            }
        }
        const mobilePlansEl = document.getElementById('mobilePlansLink');
        if (mobilePlansEl) mobilePlansEl.style.display = '';
    }

    updateAllAuthButtons() {
        this.updateAuthButtons();
    }

    addProfileStyles() {
        if (document.getElementById('profile-mini-styles')) return;
        const style = document.createElement('style');
        style.id = 'profile-mini-styles';
        style.textContent = `
            .auth-buttons { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; justify-content: flex-end; font-family: Inter, system-ui, sans-serif; }
            .btn-plans-nav { display: inline-flex; align-items: center; justify-content: center; background: #9355E5; color: #fff; border-radius: 12px; padding: 12px 24px; min-height: 44px; text-decoration: none; font-size: 0.875rem; font-weight: 500; line-height: 1.25rem; transition: background 0.2s, border-color 0.2s, box-shadow 0.2s; border: none; box-sizing: border-box; box-shadow: 0 8px 20px rgba(147, 85, 229, 0.28); font-family: Inter, system-ui, sans-serif; }
            .btn-plans-nav:hover { background: #7c45c7; color: #fff; box-shadow: 0 10px 24px rgba(147, 85, 229, 0.35); }
            .auth-header-btn, .auth-buttons .btn { min-height: 44px; padding: 12px 24px; border-radius: 12px; font-size: 0.875rem; font-weight: 500; line-height: 1.25rem; box-sizing: border-box; font-family: Inter, system-ui, sans-serif; }
            .auth-buttons .btn-primary { background: #9355E5; color: #fff; border: none; box-shadow: 0 8px 20px rgba(147, 85, 229, 0.28); }
            .auth-buttons .btn-primary:hover { background: #7c45c7; color: #fff; transform: translateY(-2px); box-shadow: 0 10px 24px rgba(147, 85, 229, 0.35); }
            .auth-buttons .btn-outline { background: rgba(255,255,255,0.03); color: #eef2ff; border: 1px solid rgba(255,255,255,0.2); }
            .auth-buttons .btn-outline:hover { background: rgba(255,255,255,0.08); border-color: rgba(255,255,255,0.4); color: #fff; }
            .mobile-plans-btn { display: block; width: 100%; text-align: center; margin-bottom: 8px; box-sizing: border-box; min-height: 38px; padding: 10px 20px; }
            .profile-mini { display: flex; align-items: center; gap: 10px; cursor: pointer; transition: opacity 0.2s; text-decoration: none; color: #ffffff; }
            .profile-mini:hover { opacity: 0.8; }
            .profile-mini-name { font-family: Inter, system-ui, sans-serif; font-size: 14px; font-weight: 500; line-height: 20px; letter-spacing: 0.4px; }
            .profile-mini-avatar { width: 32px; height: 32px; border-radius: 16px; overflow: hidden; border: 2px solid rgba(255,255,255,0.1); }
            .mini-avatar-img { width: 100%; height: 100%; object-fit: cover; }
            .mobile-subscribe-btn { width: 100%; margin-bottom: 8px; text-align: center; text-decoration: none; display: inline-block; }
            .mobile-profile-link { display: flex; flex-direction: column; gap: 15px; text-decoration: none; }
            .mobile-profile-name { font-family: 'Roboto', sans-serif; font-size: 16px; color: #ffffff; padding: 12px 0; border-bottom: 1px solid rgba(255,255,255,0.1); }
            .mobile-logout-btn { width: 100%; }
        `;
        document.head.appendChild(style);
    }
}

const authManager = new AuthManager();
window.authManager = authManager;
window.patreonAuth = authManager;

document.addEventListener('DOMContentLoaded', () => {
    authManager.addProfileStyles();
    authManager.updateAuthButtons();
});
