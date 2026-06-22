// ==========================================================================
// Patreon Authentication - ЕДИНАЯ СИСТЕМА ДЛЯ ВСЕХ СТРАНИЦ
// ==========================================================================

class PatreonAuth {
    constructor() {
        this.isAuthenticated = false;
        this.userData = null;
        this.subscription = null;
        this.token = null;
        this.listeners = [];
        this.loadSession();
    }

    // Загрузка сессии из localStorage
    loadSession() {
        try {
            const session = localStorage.getItem('riffKillerAuth');
            if (session) {
                const data = JSON.parse(session);
                this.isAuthenticated = data.isAuthenticated || false;
                this.userData = data.userData || null;
                this.subscription = data.subscription || null;
                this.token = data.token || null;
                
                // Если есть токен, проверяем его валидность
                if (this.token) {
                    this.validateToken();
                }
            }
        } catch (e) {
            console.error('Error loading auth session:', e);
        }
    }

    // Сохранение сессии
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

    // Очистка сессии без редиректа (при невалидном токене на загрузке страницы)
    clearSessionOnly() {
        this.isAuthenticated = false;
        this.userData = null;
        this.subscription = null;
        this.token = null;
        localStorage.removeItem('riffKillerAuth');
        this.notifyListeners();
        this.updateAllAuthButtons();
    }

    // Очистка сессии (выход) с редиректом на главную
    logout() {
        this.clearSessionOnly();
        if (!window.location.pathname.includes('index.html')) {
            window.location.href = 'index.html';
        }
    }

    // Добавление слушателя
    addListener(callback) {
        this.listeners.push(callback);
    }

    // Уведомление слушателей
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

    // Получение URL для авторизации Patreon

    getAuthUrl() {
    const params = new URLSearchParams({
        response_type: 'code',
        client_id: PATREON_CONFIG.clientId,
        redirect_uri: PATREON_CONFIG.redirectUri,
        scope: PATREON_CONFIG.scope,
        state: this.generateState()
    });
    
    const authUrl = `https://www.patreon.com/oauth2/authorize?${params.toString()}`;
    console.log('Auth URL:', authUrl);
    return authUrl;
}

    // Генерация state для безопасности
    generateState() {
        const state = Math.random().toString(36).substring(2, 15);
        localStorage.setItem('patreonState', state);
        return state;
    }

    // Проверка state при возврате
    verifyState(state) {
        const savedState = localStorage.getItem('patreonState');
        localStorage.removeItem('patreonState');
        return savedState === state;
    }

    // Начало авторизации
    login() {
        window.location.href = this.getAuthUrl();
    }

    // Обработка callback (вызывается из patreon-callback.html)
    async handleCallback(code, state) {
        if (!this.verifyState(state)) {
            console.error('State verification failed');
            return false;
        }

        try {
            // Отправляем код на сервер для обмена на токен
            const response = await fetch('/patreon-exchange.php', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ code })
            });

            const data = await response.json();
            
            if (data.success) {
                this.token = data.token;
                this.userData = data.user;
                this.subscription = data.subscription;
                this.isAuthenticated = true;
                
                this.saveSession();
                this.notifyListeners();
                this.updateAllAuthButtons();
                
                // Перенаправляем в профиль
                window.location.href = 'profile.html';
                return true;
            } else {
                console.error('Auth failed:', data.error);
                return false;
            }
        } catch (e) {
            console.error('Error in callback:', e);
            return false;
        }
    }

    // Проверка токена
    async validateToken() {
        if (!this.token) return false;
        
        try {
            const response = await fetch('/patreon-validate.php', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ token: this.token.access_token })
            });
            
            const data = await response.json();
            
            if (data.valid) {
                this.subscription = data.subscription;
                this.saveSession();
                return true;
            } else {
                // Токен невалиден - очищаем сессию без редиректа, чтобы пользователь остался на текущей странице
                this.clearSessionOnly();
                return false;
            }
        } catch (e) {
            console.error('Error validating token:', e);
            return false;
        }
    }

    // Проверка активной подписки
    hasActiveSubscription() {
        return this.subscription && this.subscription.status === 'active';
    }

// Обновление кнопок авторизации на ТЕКУЩЕЙ странице
updateAuthButtons() {
    const authButtons = document.querySelector('.auth-buttons');
    const mobileAuth = document.querySelector('.mobile-auth');
    
    if (!authButtons && !mobileAuth) return;

    if (this.isAuthenticated && this.userData) {
        // Авторизован - показываем аватар
        const firstName = this.userData.full_name.split(' ')[0] || 'User';
        const avatarUrl = this.userData.image_url || 'assets/icons/default-avatar.svg';
        
        if (authButtons) {
            authButtons.innerHTML = `
                <a href="profile.html" class="profile-mini">
                    <span class="profile-mini-name">${firstName}</span>
                    <div class="profile-mini-avatar">
                        <img src="${avatarUrl}" alt="Avatar" class="mini-avatar-img">
                    </div>
                </a>
            `;
        }
        
        if (mobileAuth) {
            mobileAuth.innerHTML = `
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
        // НЕ АВТОРИЗОВАН - ПОКАЗЫВАЕМ ОДНУ КНОПКУ LOGIN WITH PATREON
        if (authButtons) {
            authButtons.innerHTML = `
                <button class="btn btn-primary" id="patreonLoginBtn" style="min-width: 180px;">Login with Patreon</button>
            `;
            
            const patreonBtn = document.getElementById('patreonLoginBtn');
            if (patreonBtn) {
                patreonBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.login();
                });
            }
        }
        
        if (mobileAuth) {
            mobileAuth.innerHTML = `
                <button class="btn btn-primary mobile-signup-btn" id="mobilePatreonLoginBtn">Login with Patreon</button>
            `;
            
            const mobilePatreonBtn = document.getElementById('mobilePatreonLoginBtn');
            if (mobilePatreonBtn) {
                mobilePatreonBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.login();
                });
            }
        }
    }
}

    // Обновление кнопок на ВСЕХ страницах (для iframe)
    updateAllAuthButtons() {
        this.updateAuthButtons();
    }

    // Добавление стилей для мини-профиля
    addProfileStyles() {
        if (document.getElementById('profile-mini-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'profile-mini-styles';
        style.textContent = `
            .profile-mini {
                display: flex;
                align-items: center;
                gap: 10px;
                cursor: pointer;
                transition: opacity 0.2s;
                text-decoration: none;
                color: #ffffff;
            }
            .profile-mini:hover {
                opacity: 0.8;
            }
            .profile-mini-name {
                font-family: 'Roboto', sans-serif;
                font-size: 14px;
                font-weight: 500;
            }
            .profile-mini-avatar {
                width: 32px;
                height: 32px;
                border-radius: 16px;
                overflow: hidden;
                border: 2px solid rgba(255,255,255,0.1);
            }
            .mini-avatar-img {
                width: 100%;
                height: 100%;
                object-fit: cover;
            }
            .mobile-profile-link {
                display: flex;
                flex-direction: column;
                gap: 15px;
                text-decoration: none;
            }
            .mobile-profile-name {
                font-family: 'Roboto', sans-serif;
                font-size: 16px;
                color: #ffffff;
                padding: 12px 0;
                border-bottom: 1px solid rgba(255,255,255,0.1);
            }
            .mobile-logout-btn {
                width: 100%;
            }
        `;
        document.head.appendChild(style);
    }
}

// Создаем глобальный экземпляр
window.patreonAuth = new PatreonAuth();

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    window.patreonAuth.addProfileStyles();
    window.patreonAuth.updateAuthButtons();
});