// ==========================================================================
// Main JavaScript - С ИНТЕГРАЦИЕЙ PATREON (ПОЛНАЯ ВЕРСИЯ)
// ==========================================================================

// База данных риффов
const riffsDatabase = [
    {
        id: 1,
        song: "Black Dog",
        artist: "Led Zeppelin",
        videoFile: "assets/video/led-zeppelin/black-dog/black-dog-left.mp4",
        videoFileRight: "assets/video/led-zeppelin/black-dog/black-dog-right.mp4",
        thumbnail: "assets/img/riff-1.png",
        duration: 15,
        difficulty: "intermediate",
        genre: "rock",
        isFree: true,
        segments: [
            { start: 0, end: 3, name: "Shot 1" },
            { start: 3, end: 7, name: "Shot 2" },
            { start: 7, end: 11, name: "Shot 3" },
            { start: 11, end: 15, name: "Shot 4" }
        ],
        isFavorite: true,
        lastPracticed: null
    },
    {
        id: 2,
        song: "Sweet Child O' Mine",
        artist: "Guns N' Roses",
        videoFile: "assets/video/led-zeppelin/black-dog/black-dog-left.mp4",
        videoFileRight: "assets/video/led-zeppelin/black-dog/black-dog-right.mp4",
        thumbnail: "assets/img/riff-2.png",
        duration: 18,
        difficulty: "advanced",
        genre: "rock",
        segments: [
            { start: 0, end: 4, name: "Intro" },
            { start: 4, end: 9, name: "Main Riff" },
            { start: 9, end: 14, name: "Bridge" },
            { start: 14, end: 18, name: "Outro" }
        ],
        isFavorite: false,
        lastPracticed: "2024-01-15"
    },
    {
        id: 3,
        song: "Smoke on the Water",
        artist: "Deep Purple",
        videoFile: "assets/video/led-zeppelin/black-dog/black-dog-left.mp4",
        videoFileRight: "assets/video/led-zeppelin/black-dog/black-dog-right.mp4",
        thumbnail: "assets/img/riff-3.png",
        duration: 12,
        difficulty: "beginner",
        genre: "rock",
        segments: [
            { start: 0, end: 3, name: "Intro" },
            { start: 3, end: 7, name: "Main Riff" },
            { start: 7, end: 12, name: "Variation" }
        ],
        isFavorite: true,
        lastPracticed: "2024-01-10"
    },
    {
        id: 4,
        song: "Back in Black",
        artist: "AC/DC",
        videoFile: "assets/video/led-zeppelin/black-dog/black-dog-left.mp4",
        videoFileRight: "assets/video/led-zeppelin/black-dog/black-dog-right.mp4",
        thumbnail: "assets/img/riff-4.png",
        duration: 14,
        difficulty: "intermediate",
        genre: "rock",
        segments: [
            { start: 0, end: 3, name: "Intro" },
            { start: 3, end: 7, name: "Verse Riff" },
            { start: 7, end: 11, name: "Chorus Riff" },
            { start: 11, end: 14, name: "Ending" }
        ],
        isFavorite: false,
        lastPracticed: null
    },
    {
        id: 5,
        song: "Sunshine of Your Love",
        artist: "Cream",
        videoFile: "assets/video/led-zeppelin/black-dog/black-dog-left.mp4",
        videoFileRight: "assets/video/led-zeppelin/black-dog/black-dog-right.mp4",
        thumbnail: "assets/img/riff-5.png",
        duration: 16,
        difficulty: "intermediate",
        genre: "blues",
        segments: [
            { start: 0, end: 4, name: "Intro" },
            { start: 4, end: 9, name: "Main Riff" },
            { start: 9, end: 13, name: "Bridge" },
            { start: 13, end: 16, name: "Outro" }
        ],
        isFavorite: false,
        lastPracticed: "2024-01-05"
    },
    {
        id: 6,
        song: "Purple Haze",
        artist: "Jimi Hendrix",
        videoFile: "assets/video/led-zeppelin/black-dog/black-dog-left.mp4",
        videoFileRight: "assets/video/led-zeppelin/black-dog/black-dog-right.mp4",
        thumbnail: "assets/img/riff-6.png",
        duration: 20,
        difficulty: "advanced",
        genre: "rock",
        segments: [
            { start: 0, end: 5, name: "Intro" },
            { start: 5, end: 10, name: "Main Riff" },
            { start: 10, end: 15, name: "Solo Part" },
            { start: 15, end: 20, name: "Outro" }
        ],
        isFavorite: true,
        lastPracticed: "2024-01-12"
    },
    {
        id: 7,
        song: "Iron Man",
        artist: "Black Sabbath",
        videoFile: "assets/video/led-zeppelin/black-dog/black-dog-left.mp4",
        videoFileRight: "assets/video/led-zeppelin/black-dog/black-dog-right.mp4",
        thumbnail: "assets/img/riff-7.png",
        duration: 13,
        difficulty: "intermediate",
        genre: "metal",
        segments: [
            { start: 0, end: 3, name: "Intro" },
            { start: 3, end: 7, name: "Main Riff" },
            { start: 7, end: 10, name: "Breakdown" },
            { start: 10, end: 13, name: "Ending" }
        ],
        isFavorite: false,
        lastPracticed: null
    },
    {
        id: 8,
        song: "Enter Sandman",
        artist: "Metallica",
        videoFile: "assets/video/led-zeppelin/black-dog/black-dog-left.mp4",
        videoFileRight: "assets/video/led-zeppelin/black-dog/black-dog-right.mp4",
        thumbnail: "assets/img/riff-8.png",
        duration: 17,
        difficulty: "advanced",
        genre: "metal",
        segments: [
            { start: 0, end: 4, name: "Intro" },
            { start: 4, end: 9, name: "Verse Riff" },
            { start: 9, end: 13, name: "Chorus Riff" },
            { start: 13, end: 17, name: "Outro" }
        ],
        isFavorite: false,
        lastPracticed: "2024-01-08"
    },
    {
        id: 9,
        song: "Whole Lotta Love",
        artist: "Led Zeppelin",
        videoFile: "assets/video/led-zeppelin/black-dog/black-dog-left.mp4",
        videoFileRight: "assets/video/led-zeppelin/black-dog/black-dog-right.mp4",
        thumbnail: "assets/img/riff-9.png",
        duration: 14,
        difficulty: "intermediate",
        genre: "rock",
        segments: [
            { start: 0, end: 3, name: "Intro" },
            { start: 3, end: 7, name: "Main Riff" },
            { start: 7, end: 11, name: "Bridge" },
            { start: 11, end: 14, name: "Outro" }
        ],
        isFavorite: true,
        lastPracticed: "2024-01-18"
    },
    {
        id: 10,
        song: "Johnny B. Goode",
        artist: "Chuck Berry",
        videoFile: "assets/video/led-zeppelin/black-dog/black-dog-left.mp4",
        videoFileRight: "assets/video/led-zeppelin/black-dog/black-dog-right.mp4",
        thumbnail: "assets/img/riff-10.png",
        duration: 16,
        difficulty: "beginner",
        genre: "rock",
        segments: [
            { start: 0, end: 4, name: "Intro" },
            { start: 4, end: 8, name: "Main Riff" },
            { start: 8, end: 12, name: "Solo" },
            { start: 12, end: 16, name: "Outro" }
        ],
        isFavorite: false,
        lastPracticed: null
    }
];

// Данные коллекций
const collectionsData = [
    {
        id: 1,
        name: "Led Zeppelin",
        videoCount: 2,
        isFavorite: false,
        imageUrl: "assets/img/collections-1.png",
        riffs: [1, 9]
    },
    {
        id: 2,
        name: "Classic Rock",
        videoCount: 6,
        isFavorite: true,
        imageUrl: "assets/img/collections-2.png",
        riffs: [1, 2, 3, 4, 9, 10]
    },
    {
        id: 3,
        name: "Blues Masters",
        videoCount: 2,
        isFavorite: false,
        imageUrl: "assets/img/collections-3.png",
        riffs: [5, 6]
    },
    {
        id: 4,
        name: "Metal Giants",
        videoCount: 2,
        isFavorite: false,
        imageUrl: "assets/img/collections-4.png",
        riffs: [7, 8]
    }
];

// Глобальное состояние
let appState = {
    currentRiffId: null,
    recentlyPracticed: [],
    riffsDatabase: JSON.parse(JSON.stringify(riffsDatabase)),
    collectionsData: JSON.parse(JSON.stringify(collectionsData)),
    trialRiffId: null
};

// Загрузка состояния
function loadAppState() {
    try {
        const saved = localStorage.getItem('riffKillerState');
        if (saved) {
            const parsed = JSON.parse(saved);
            appState.recentlyPracticed = parsed.recentlyPracticed || [];
            appState.currentRiffId = parsed.currentRiffId || null;
            appState.trialRiffId = parsed.trialRiffId != null ? parsed.trialRiffId : null;
            
            // Восстанавливаем избранное
            if (parsed.riffsDatabase) {
                parsed.riffsDatabase.forEach(savedRiff => {
                    const riff = appState.riffsDatabase.find(r => r.id === savedRiff.id);
                    if (riff) riff.isFavorite = savedRiff.isFavorite;
                });
            }
        }
    } catch (e) {
        console.error('Error loading state:', e);
    }
}

// Сохранение состояния
function saveAppState() {
    try {
        const state = {
            currentRiffId: appState.currentRiffId,
            recentlyPracticed: appState.recentlyPracticed,
            trialRiffId: appState.trialRiffId,
            riffsDatabase: appState.riffsDatabase.map(r => ({
                id: r.id,
                isFavorite: r.isFavorite
            }))
        };
        localStorage.setItem('riffKillerState', JSON.stringify(state));
    } catch (e) {
        console.error('Error saving state:', e);
    }
}

// Функция для показа нотификаций
function showNotification(message) {
    // Удаляем предыдущую нотификацию если есть
    const existing = document.querySelector('.notification');
    if (existing) existing.remove();
    
    const note = document.createElement('div');
    note.className = 'notification';
    note.textContent = message;
    document.body.appendChild(note);
    
    requestAnimationFrame(() => note.classList.add('show'));
    
    setTimeout(() => {
        note.classList.remove('show');
        setTimeout(() => note.remove(), 300);
    }, 5000);
}

// Модальное окно для апгрейда (все способы оплаты)
function showPatreonUpgradeModal() {
    if (document.getElementById('patreonUpgradeModal')) return;
    
    const backdrop = document.createElement('div');
    backdrop.id = 'patreonUpgradeBackdrop';
    backdrop.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0, 0, 0, 0.8); z-index: 9999; backdrop-filter: blur(5px);';
    
    const modal = document.createElement('div');
    modal.id = 'patreonUpgradeModal';
    modal.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: #1a1f33; border-radius: 24px; padding: 40px; width: min(400px, 90vw); z-index: 10000; text-align: center; border: 1px solid rgba(255, 255, 255, 0.1); box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);';
    
    modal.innerHTML = `
        <h2 style="font-size: 28px; margin-bottom: 10px; color: #fff;">🎸 Riff Killer</h2>
        <p style="color: rgba(255,255,255,0.9); margin-bottom: 24px; line-height: 1.6;">
            Get full access to all riffs, tabs and practice tools. Card, crypto, or Patreon.
        </p>
        <ul style="text-align: left; margin-bottom: 24px; color: rgba(255,255,255,0.8); list-style: none; padding: 0;">
            <li style="margin-bottom: 8px;">✅ Full access to all riffs & tabs</li>
            <li style="margin-bottom: 8px;">✅ Slow-motion practice</li>
            <li style="margin-bottom: 8px;">✅ Card, crypto, or Patreon</li>
        </ul>
        <button id="upgradePatreonBtn" style="width: 100%; padding: 14px; background: #FF424D; color: white; border: none; border-radius: 12px; font-size: 16px; font-weight: 600; cursor: pointer; margin-bottom: 12px;">Choose plan</button>
        <button id="patreonCloseBtn" style="background: transparent; border: none; color: rgba(255,255,255,0.6); cursor: pointer; font-size: 14px; padding: 8px 20px;">Maybe later</button>
    `;
    
    document.body.appendChild(backdrop);
    document.body.appendChild(modal);
    
    const closeModal = () => { backdrop.remove(); modal.remove(); };
    
    document.getElementById('upgradePatreonBtn').addEventListener('click', () => {
        closeModal();
        window.location.href = 'billing.html';
    });
    document.getElementById('patreonCloseBtn').addEventListener('click', closeModal);
    backdrop.addEventListener('click', closeModal);
}

// Модальное окно «Войдите в Patreon, чтобы сохранять избранное»
function showFavoritesLoginModal() {
    if (document.getElementById('favoritesLoginModal')) return;
    const backdrop = document.createElement('div');
    backdrop.id = 'favoritesLoginBackdrop';
    backdrop.style.cssText = `position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0, 0, 0, 0.8); z-index: 9999; backdrop-filter: blur(5px);`;
    const modal = document.createElement('div');
    modal.id = 'favoritesLoginModal';
    modal.style.cssText = `position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: #1a1f33; border-radius: 24px; padding: 40px; width: min(360px, 90vw); z-index: 10000; text-align: center; border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 20px 60px rgba(0,0,0,0.5);`;
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

// Инициализация: риффы и коллекции из API (data/*.json), иначе встроенные константы в appState
document.addEventListener('DOMContentLoaded', () => {
    console.log('Main page initialized');
    function runInit() {
        loadAppState();
        initCollections();
        initFilters();
        initNavigationArrows();
        initRiffs();
    }
    function applyCollectionsFromApi(cols) {
        if (!Array.isArray(cols) || cols.length === 0) return;
        appState.collectionsData = cols.map(c => {
            const riffs = Array.isArray(c.riffs)
                ? c.riffs.map(x => parseInt(x, 10)).filter(n => !isNaN(n) && n > 0)
                : [];
            return {
                id: parseInt(c.id, 10),
                name: c.name || 'Collection',
                imageUrl: c.imageUrl || c.image || 'assets/img/collections-1.png',
                riffs,
                videoCount: riffs.length,
                isFavorite: !!c.isFavorite
            };
        });
    }
    Promise.all([
        fetch('/api/riffs/list.php').then(r => r.json()).catch(() => null),
        fetch('/api/collections/list.php').then(r => r.json()).catch(() => null)
    ]).then(([list, cols]) => {
        if (Array.isArray(list) && list.length > 0) {
            var normalized = list.map(function(r, i) {
                var item = { ...r, isFavorite: r.isFavorite || false };
                if (item.id == null || item.id === '') {
                    var maxId = list.reduce(function(m, x) { var id = x.id; return (id != null && !isNaN(id)) ? Math.max(m, parseInt(id, 10)) : m; }, 0);
                    item.id = maxId + i + 1;
                }
                return item;
            });
            var usedIds = new Set();
            var nextId = 1 + normalized.reduce(function(m, r) { var x = r.id; return (x != null && !isNaN(x)) ? Math.max(m, parseInt(x, 10)) : m; }, 0);
            normalized = normalized.map(function(r) {
                var id = r.id;
                if (id != null && usedIds.has(id)) {
                    id = nextId++;
                    r = { ...r, id: id };
                }
                if (id != null) usedIds.add(id);
                return r;
            });
            appState.riffsDatabase = normalized;
        }
        applyCollectionsFromApi(cols);
        runInit();
    }).catch(() => { runInit(); });
    
    // Инициализация Patreon кнопок
    if (window.patreonAuth) {
        window.patreonAuth.addListener(() => {
            // Обновляем кнопки при изменении авторизации
        });
    }
    
    // Если practice потребовал авторизацию, открываем модальное окно
    try {
        const params = new URLSearchParams(window.location.search);
        if (params.get('auth') === 'required' && window.firebaseAuthManager) {
            window.firebaseAuthManager.openLoginModal();
        }
    } catch (e) {
        console.error('Error handling auth=required param:', e);
    }
});

// Коллекции
function initCollections() {
    const grid = document.getElementById('collectionsGrid');
    if (!grid) return;
    
    grid.innerHTML = '';
    appState.collectionsData.forEach(collection => {
        grid.appendChild(createCollectionCard(collection));
    });
}

function createCollectionCard(collection) {
    const card = document.createElement('div');
    card.className = 'collection-card';
    card.dataset.id = collection.id;
    
    const cameraIcon = `<svg class="camera-icon" viewBox="0 0 12 12" fill="none"><path d="M11 9.5C11 10.0523 10.5523 10.5 10 10.5H2C1.44772 10.5 1 10.0523 1 9.5V4C1 3.44772 1.44772 3 2 3H3.5L4.5 1.5H7.5L8.5 3H10C10.5523 3 11 3.44772 11 4V9.5Z" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/><circle cx="6" cy="6.5" r="2" stroke="currentColor"/></svg>`;
    const favoriteIcon = `<svg class="favorite-icon" viewBox="0 0 16 16" fill="none"><path d="M8 2L9.79611 5.52786L13.6574 6.21885L10.8287 9.16714L11.4721 13L8 11.1279L4.52786 13L5.17127 9.16714L2.3426 6.21885L6.20389 5.52786L8 2Z" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    
    card.innerHTML = `
        <img src="${collection.imageUrl}" alt="${collection.name}" class="collection-image" 
             onerror="this.src='https://via.placeholder.com/300x180/2a2d42/ffffff?text=${encodeURIComponent(collection.name)}'">
        <div class="collection-overlay"></div>
        <div class="collection-content">
            <div class="collection-video-info">
                ${cameraIcon}
                <span class="video-count">${collection.videoCount}</span>
            </div>
            <span class="collection-name">${collection.name}</span>
            <button class="favorite-btn ${collection.isFavorite ? 'active' : ''}" 
                    aria-label="${collection.isFavorite ? 'Remove from favorites' : 'Add to favorites'}">
                ${favoriteIcon}
            </button>
        </div>
    `;
    
    const favBtn = card.querySelector('.favorite-btn');
    favBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        favBtn.classList.toggle('active');
        collection.isFavorite = favBtn.classList.contains('active');
        favBtn.setAttribute('aria-label', collection.isFavorite ? 'Remove from favorites' : 'Add to favorites');
    });
    
    card.addEventListener('click', () => {
        document.body.style.opacity = '0.7';
        setTimeout(() => {
            window.location.href = `collection.html?id=${collection.id}`;
        }, 200);
    });
    
    return card;
}

// Фильтры
function initFilters() {
    const difficulty = document.getElementById('difficultyFilter');
    const genre = document.getElementById('genreFilter');
    
    if (difficulty) {
        difficulty.addEventListener('change', () => initRiffs());
    }
    if (genre) {
        genre.addEventListener('change', () => initRiffs());
    }
}

function getFilteredRiffs() {
    const difficulty = document.getElementById('difficultyFilter')?.value || 'all';
    const genre = document.getElementById('genreFilter')?.value || 'all';
    
    return appState.riffsDatabase.filter(riff => {
        if (difficulty !== 'all' && riff.difficulty !== difficulty) return false;
        if (genre !== 'all' && riff.genre !== genre) return false;
        return true;
    });
}

// Риффы
function initRiffs() {
    const grid = document.getElementById('riffsGrid');
    if (!grid) return;
    
    grid.innerHTML = '';
    
    const filtered = getFilteredRiffs();
    // Порядок строго как в API (админка): без сортировки по isFavorite, чтобы free-рифф не уходил в конец
    const sorted = [...filtered].sort((a, b) => filtered.indexOf(a) - filtered.indexOf(b));
    sorted.slice(0, 10).forEach(riff => {
        grid.appendChild(createRiffCard(riff));
    });
}

// Создание карточки риффа — общая разметка: js/riff-gallery-card.js
function createRiffCard(riff) {
    if (!window.RiffKillerRiffGallery || typeof window.RiffKillerRiffGallery.createCard !== 'function') {
        console.error('RiffKillerRiffGallery missing; include js/riff-gallery-card.js before main.js');
        return document.createElement('div');
    }
    return window.RiffKillerRiffGallery.createCard(riff, {
        onFavoriteClick(e, favBtn) {
            e.stopPropagation();
            if (!window.patreonAuth || !window.patreonAuth.isAuthenticated) {
                if (typeof showFavoritesLoginModal === 'function') showFavoritesLoginModal();
                return;
            }
            favBtn.classList.toggle('active');
            riff.isFavorite = favBtn.classList.contains('active');
            favBtn.setAttribute('aria-label', riff.isFavorite ? 'Remove from favorites' : 'Add to favorites');
            saveAppState();
        },
        onNavigate() {
            if (riff.isFree) {
                appState.currentRiffId = riff.id;
                saveAppState();
                document.body.style.opacity = '0.7';
                setTimeout(() => { window.location.href = `practice.html?riff=${riff.id}`; }, 200);
                return;
            }
            const hasSubscription =
                window.patreonAuth &&
                typeof window.patreonAuth.hasActiveSubscription === 'function' &&
                window.patreonAuth.hasActiveSubscription();
            if (hasSubscription) {
                appState.currentRiffId = riff.id;
                saveAppState();
                document.body.style.opacity = '0.7';
                setTimeout(() => { window.location.href = `practice.html?riff=${riff.id}`; }, 200);
                return;
            }
            window.location.href = 'billing.html';
        }
    });
}

// Стрелки навигации — сдвиг по одной карточке (левый край карточки к левому краю дорожки)
function initNavigationArrows() {
    const prev = document.querySelector('.nav-arrow-prev');
    const next = document.querySelector('.nav-arrow-next');
    const wrapper = document.querySelector('.collections-grid-wrapper');
    
    if (!prev || !next || !wrapper) return;
    
    const getCards = () =>
        Array.from(wrapper.querySelectorAll('.collections-grid .collection-card'));
    
    /** Индекс карточки, у которой левый край ещё не правее левого края viewport (без «+N px» — иначе в gap между карточками ломается шаг). */
    const getLeadingCardIndex = (cards, scrollLeft) => {
        let idx = 0;
        for (let i = 0; i < cards.length; i++) {
            if (cards[i].offsetLeft <= scrollLeft) idx = i;
            else break;
        }
        return idx;
    };
    
    const scrollToOffset = (targetLeft) => {
        const maxScroll = Math.max(0, wrapper.scrollWidth - wrapper.clientWidth);
        const left = Math.max(0, Math.min(Math.round(targetLeft), maxScroll));
        wrapper.scrollTo({ left, behavior: 'smooth' });
    };
    
    const updateArrows = () => {
        const scrollLeft = wrapper.scrollLeft;
        const scrollWidth = wrapper.scrollWidth;
        const clientWidth = wrapper.clientWidth;
        const maxScroll = Math.max(0, scrollWidth - clientWidth);
        
        prev.disabled = scrollLeft <= 10;
        next.disabled = scrollLeft >= maxScroll - 10;
        
        prev.style.opacity = prev.disabled ? '0.5' : '1';
        next.style.opacity = next.disabled ? '0.5' : '1';
        prev.style.cursor = prev.disabled ? 'not-allowed' : 'pointer';
        next.style.cursor = next.disabled ? 'not-allowed' : 'pointer';
    };
    
    prev.addEventListener('click', () => {
        if (prev.disabled) return;
        const cards = getCards();
        if (!cards.length) return;
        const idx = getLeadingCardIndex(cards, wrapper.scrollLeft);
        const prevIdx = Math.max(0, idx - 1);
        scrollToOffset(cards[prevIdx].offsetLeft);
    });
    
    next.addEventListener('click', () => {
        if (next.disabled) return;
        const cards = getCards();
        if (!cards.length) return;
        const idx = getLeadingCardIndex(cards, wrapper.scrollLeft);
        const maxScroll = Math.max(0, wrapper.scrollWidth - wrapper.clientWidth);
        if (idx >= cards.length - 1) {
            scrollToOffset(maxScroll);
            return;
        }
        const target = cards[idx + 1].offsetLeft;
        scrollToOffset(Math.min(target, maxScroll));
    });
    
    wrapper.addEventListener('scroll', updateArrows);
    window.addEventListener('resize', updateArrows);
    setTimeout(updateArrows, 100);
}