// ==========================================================================
// Collection Page JavaScript - С ИНТЕГРАЦИЕЙ PATREON
// ==========================================================================

function getUrlParameter(name) {
    name = name.replace(/[\[\]]/g, '\\$&');
    const regex = new RegExp('[?&]' + name + '(=([^&#]*)|&|#|$)');
    const results = regex.exec(window.location.href);
    if (!results) return null;
    if (!results[2]) return '';
    return decodeURIComponent(results[2].replace(/\+/g, ' '));
}

let riffsDatabase = [
    {
        id: 1,
        song: "Black Dog",
        artist: "Led Zeppelin",
        videoFile: "assets/video/led-zeppelin/black-dog/black-dog-left.mp4",
        thumbnail: "assets/img/riff-1.png",
        duration: 15,
        difficulty: "intermediate",
        genre: "rock",
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

let collectionsData = [
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

function loadAppState() {
    try {
        const saved = localStorage.getItem('riffKillerState');
        if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed.riffsDatabase) {
                parsed.riffsDatabase.forEach(savedRiff => {
                    const riff = riffsDatabase.find(r => r.id === savedRiff.id);
                    if (riff) riff.isFavorite = savedRiff.isFavorite;
                });
            }
        }
    } catch (e) {
        console.error('Error loading state:', e);
    }
}

function saveAppState() {
    try {
        const state = {
            riffsDatabase: riffsDatabase.map(r => ({
                id: r.id,
                isFavorite: r.isFavorite
            }))
        };
        localStorage.setItem('riffKillerState', JSON.stringify(state));
    } catch (e) {
        console.error('Error saving state:', e);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    console.log('Collection page initialized');

    function applyApiData(list, cols) {
        if (Array.isArray(list) && list.length > 0) {
            riffsDatabase = list.map(r => ({ ...r, isFavorite: r.isFavorite || false }));
        }
        if (Array.isArray(cols) && cols.length > 0) {
            collectionsData = cols.map(c => {
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
    }

    Promise.all([
        fetch('/api/riffs/list.php').then(r => r.json()).catch(() => null),
        fetch('/api/collections/list.php').then(r => r.json()).catch(() => null)
    ]).then(([list, cols]) => {
        applyApiData(list, cols);
        loadAppState();
        const collectionId = parseInt(getUrlParameter('id'), 10) || 1;
        loadCollection(collectionId);
    }).catch(() => {
        loadAppState();
        const collectionId = parseInt(getUrlParameter('id'), 10) || 1;
        loadCollection(collectionId);
    });
});

function loadCollection(collectionId) {
    const collection = collectionsData.find(c => c.id === collectionId);
    if (!collection) {
        window.location.href = 'index.html';
        return;
    }
    
    const title = document.getElementById('collectionTitle');
    const banner = document.getElementById('collectionBanner');
    const count = document.getElementById('collectionRiffsCount');
    const grid = document.getElementById('collectionRiffsGrid');
    const empty = document.getElementById('emptyCollectionMessage');
    
    if (title) title.textContent = collection.name;
    
    if (banner) {
        banner.innerHTML = `
            <img src="${collection.imageUrl}" alt="${collection.name}" class="collection-banner-image" 
                 onerror="this.src='https://via.placeholder.com/1200x200/2a2d42/ffffff?text=${encodeURIComponent(collection.name)}'">
            <div class="collection-banner-overlay"></div>
        `;
    }
    
    const collectionRiffs = riffsDatabase.filter(r => collection.riffs.includes(r.id));
    
    if (count) {
        count.textContent = `Riffs in Collection (${collectionRiffs.length})`;
    }
    
    if (grid) grid.innerHTML = '';
    
    if (collectionRiffs.length === 0) {
        if (empty) empty.style.display = 'block';
        return;
    }
    
    if (empty) empty.style.display = 'none';
    
    collectionRiffs.forEach(riff => {
        grid.appendChild(createRiffCard(riff));
    });
}

function createRiffCard(riff) {
    if (!window.RiffKillerRiffGallery || typeof window.RiffKillerRiffGallery.createCard !== 'function') {
        console.error('RiffKillerRiffGallery missing');
        return document.createElement('div');
    }
    return window.RiffKillerRiffGallery.createCard(riff, {
        onFavoriteClick(e, favBtn) {
            e.stopPropagation();
            favBtn.classList.toggle('active');
            riff.isFavorite = favBtn.classList.contains('active');
            favBtn.setAttribute('aria-label', riff.isFavorite ? 'Remove from favorites' : 'Add to favorites');
            saveAppState();
        },
        onNavigate() {
            const saved = localStorage.getItem('riffKillerState');
            let state = {};
            if (saved) {
                try {
                    state = JSON.parse(saved);
                } catch (err) {}
            }
            state.currentRiffId = riff.id;
            localStorage.setItem('riffKillerState', JSON.stringify(state));
            document.body.style.opacity = '0.7';
            setTimeout(() => {
                window.location.href = `practice.html?riff=${riff.id}`;
            }, 200);
        }
    });
}