// ==========================================================================
// Favorites Page JavaScript - Логика для страницы избранных
// ==========================================================================

// Загрузка состояния приложения
function loadAppState() {
    const savedState = localStorage.getItem('riffKillerState');
    if (savedState) {
        try {
            const parsedState = JSON.parse(savedState);
            return parsedState;
        } catch (e) {
            console.error('Error loading app state:', e);
            return {};
        }
    }
    return {};
}

// Сохранение состояния приложения
function saveAppState(state) {
    try {
        localStorage.setItem('riffKillerState', JSON.stringify(state));
        console.log('App state saved');
    } catch (e) {
        console.error('Error saving app state:', e);
    }
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    console.log('Favorites page initialized');
    
    // Загружаем состояние
    const appState = loadAppState();
    
    // Инициализация кнопок авторизации
    initAuthButtons();
    
    // Загрузка и отображение избранных риффов
    loadAndDisplayFavorites(appState);
});

// Инициализация кнопок авторизации
function initAuthButtons() {
    const loginText = document.querySelector('.login-text');
    const signupButton = document.querySelector('.btn-signup');
    
    if (loginText) {
        loginText.addEventListener('click', () => {
            console.log('Login clicked');
        });
    }
    
    if (signupButton) {
        signupButton.addEventListener('click', () => {
            console.log('Sign up clicked');
        });
    }
}

// Загрузка и отображение избранных риффов
function loadAndDisplayFavorites(appState) {
    const favoritesGrid = document.getElementById('favoritesGrid');
    const noFavoritesMessage = document.getElementById('noFavoritesMessage');
    
    if (!favoritesGrid) return;
    
    // Очищаем сетку
    favoritesGrid.innerHTML = '';
    
    // Проверяем есть ли данные о риффах
    if (!appState.riffsDatabase || appState.riffsDatabase.length === 0) {
        // Показываем сообщение "нет избранных"
        if (noFavoritesMessage) {
            noFavoritesMessage.style.display = 'block';
        }
        return;
    }
    
    // Получаем избранные риффы
    const favoriteRiffs = appState.riffsDatabase.filter(riff => riff.isFavorite);
    
    if (favoriteRiffs.length === 0) {
        // Показываем сообщение "нет избранных"
        if (noFavoritesMessage) {
            noFavoritesMessage.style.display = 'block';
        }
        return;
    }
    
    // Скрываем сообщение "нет избранных"
    if (noFavoritesMessage) {
        noFavoritesMessage.style.display = 'none';
    }
    
    // Создаем карточки избранных риффов
    favoriteRiffs.forEach(riff => {
        const riffCard = createRiffCard(riff, appState);
        favoritesGrid.appendChild(riffCard);
    });
}

// Создание карточки риффа (как на главной — riff-gallery-card.js)
function createRiffCard(riff, appState) {
    if (!window.RiffKillerRiffGallery || typeof window.RiffKillerRiffGallery.createCard !== 'function') {
        console.error('RiffKillerRiffGallery missing; include js/riff-gallery-card.js before favorites.js');
        return document.createElement('div');
    }
    const riffFor = Object.assign({}, riff, { isFavorite: true });
    return window.RiffKillerRiffGallery.createCard(riffFor, {
        onFavoriteClick: function (e, favBtn) {
            e.stopPropagation();
            toggleRiffFavorite(favBtn, riff.id, appState);
        },
        onNavigate: function () {
            const newState = Object.assign({}, appState, { currentRiffId: riff.id });
            saveAppState(newState);
            document.body.style.opacity = '0.7';
            setTimeout(function () {
                window.location.href = 'practice.html?riff=' + riff.id;
            }, 200);
        }
    });
}

// Переключение избранного для риффа
function toggleRiffFavorite(button, riffId, appState) {
    // Находим рифф в базе данных
    if (!appState.riffsDatabase) return;
    
    const riffIndex = appState.riffsDatabase.findIndex(r => r.id === riffId);
    if (riffIndex === -1) return;
    
    // Переключаем состояние избранного
    appState.riffsDatabase[riffIndex].isFavorite = !appState.riffsDatabase[riffIndex].isFavorite;
    
    // Обновляем отображение
    if (!appState.riffsDatabase[riffIndex].isFavorite) {
        // Удаляем карточку со страницы
        var stack = button.closest('.riff-card-stack');
        var cardOnly = button.closest('.riff-card');
        if (stack) {
            stack.remove();
        } else if (cardOnly) {
            cardOnly.remove();
        }
        
        // Проверяем остались ли еще избранные риффы
        const favoritesGrid = document.getElementById('favoritesGrid');
        const noFavoritesMessage = document.getElementById('noFavoritesMessage');
        
        if (favoritesGrid.children.length === 0 && noFavoritesMessage) {
            noFavoritesMessage.style.display = 'block';
        }
    }
    
    // Обновляем состояние приложения
    saveAppState(appState);
    
    console.log(`Riff ${riffId} favorite toggled: ${appState.riffsDatabase[riffIndex].isFavorite}`);
}