// ==========================================================================
// Practice Page JavaScript - ИСПРАВЛЕННАЯ ВЕРСИЯ ДЛЯ СЕРВЕРА
// ==========================================================================

// Fallback при недоступности API — сегменты должны совпадать с data/riffs.json (те же start/end до долей секунды)
const riffsDatabase = [
    {
        id: 1,
        song: "Black Dog",
        artist: "Led Zeppelin",
        videoFile: "assets/video/led-zeppelin/black-dog/black-dog-left.mp4",
        videoFileRight: "assets/video/led-zeppelin/black-dog/black-dog-right.mp4",
        thumbnail: "assets/img/riff-1.png",
        duration: 16.5,
        difficulty: "intermediate",
        genre: "rock",
        isFree: true,
        segments: [
            { start: 0, end: 1.17, name: "Shot 1" },
            { start: 1.2, end: 3.12, name: "Shot 2" },
            { start: 3.18, end: 5.17, name: "Shot 3" },
            { start: 6, end: 7.18, name: "Shot 4" },
            { start: 7.21, end: 9.09, name: "Shot 5" },
            { start: 9.12, end: 10.3, name: "Shot 6" },
            { start: 10.3, end: 13.15, name: "Shot 7" },
            { start: 11.18, end: 15.07, name: "Shot 8" },
            { start: 15.17, end: 17, name: "Shot 9" }
        ],
        isFavorite: true,
        lastPracticed: null
    }
];

let currentRiff = null;
let leftVideo = null;
let rightVideo = null;
let isPlaying = false;
let currentMode = 'left';
let playbackSpeed = 1;
let currentSegment = 0;
let loopActive = false;
let loopAllRiff = false;
let isInitialized = false;
let tabsVisible = false;
let tabsOverlay = null;
let tabsImage = null;
let videosFullyLoaded = false;
let lessonModeActive = false;
let lessonVideoEl = null;
/** Debounce segment taps on mobile so touch + click don't fire twice or hit wrong target */
let lastSegmentTapTime = 0;
const SEGMENT_TAP_DEBOUNCE_MS = 220;
let pendingSegmentIndex = null;
/** Таймер частой проверки конца сегмента в лупе — чтобы не обрезать фразу раньше end */
let _segmentLoopPollId = null;
/** После перемотки на начало сегмента не считать «конец» 0.5 с — иначе из-за задержки currentTime луп срабатывает сразу и обрывает первую ноту */
var _lastSegmentLoopSeekAt = 0;
const SEGMENT_LOOP_DEBOUNCE_MS = 500;

// Riff Killer 2.0: per-riff progress + practice modes
const RK_PROGRESS_KEY = 'riffKillerProgressV1';
let practiceMode = 'normal'; // normal | speed
let _speedTrainerState = { active: false, segIndex: -1, speedIdx: 0, loopsAtSpeed: 0 };
const SPEED_TRAINER_SPEEDS = [0.5, 0.75, 1];
/** Сколько полных повторов сегмента на каждой скорости перед переходом к следующей */
const SPEED_TRAINER_LOOPS_PER_SPEED = 3;
const RK_SPEED_TRAINER_INTRO_KEY = 'rkSpeedTrainerIntroSeen';

function formatSpeedTrainerLabel(speed) {
    const s = Number(speed);
    if (isNaN(s)) return '×1';
    if (Math.abs(s - 1) < 0.001) return '×1';
    const t = String(s);
    return '×' + (t.indexOf('.') === -1 ? t : t.replace(/\.?0+$/, ''));
}

/** Крупная скорость над активной полоской сегмента (Speed Trainer) */
function updateSpeedTrainerTimelineLabel() {
    document.querySelectorAll('.segment-trainer-speed').forEach((el) => {
        el.textContent = '';
        el.hidden = true;
    });
    if (practiceMode !== 'speed' || currentSegment < 0 || !currentRiff) return;
    const segs = document.querySelectorAll('#timelineSegments .segment');
    const segEl = segs[currentSegment];
    if (!segEl) return;
    const lbl = segEl.querySelector('.segment-trainer-speed');
    if (!lbl) return;
    lbl.textContent = formatSpeedTrainerLabel(playbackSpeed);
    lbl.hidden = false;
}

function syncRiffTimelineSpeedTrainerClass() {
    const tl = document.getElementById('riffTimeline');
    if (tl) tl.classList.toggle('speed-trainer-active', practiceMode === 'speed');
}

function rkLoadProgress() {
    try {
        const raw = localStorage.getItem(RK_PROGRESS_KEY);
        return raw ? (JSON.parse(raw) || {}) : {};
    } catch (e) {
        return {};
    }
}

function rkSaveProgress(all) {
    try { localStorage.setItem(RK_PROGRESS_KEY, JSON.stringify(all || {})); } catch (e) {}
}

function rkGetRiffProgress(riffId) {
    const all = rkLoadProgress();
    const key = String(riffId || '');
    const p = all[key] || {};
    const learned = Array.isArray(p.learned) ? p.learned.filter(n => typeof n === 'number' && n >= 0) : [];
    return {
        learned: learned,
        lastPracticedAt: p.lastPracticedAt || null,
        learnedAtSlowSpeed: !!p.learnedAtSlowSpeed
    };
}

function rkSetRiffProgress(riffId, patch) {
    const all = rkLoadProgress();
    const key = String(riffId || '');
    const prev = all[key] && typeof all[key] === 'object' ? all[key] : {};
    all[key] = { ...prev, ...patch };
    rkSaveProgress(all);
}

function rkMarkLastPracticed(riffId) {
    rkSetRiffProgress(riffId, { lastPracticedAt: Date.now() });
}

function rkIsSegmentLearned(riffId, segIndex) {
    const p = rkGetRiffProgress(riffId);
    return p.learned.indexOf(segIndex) !== -1;
}

function rkToggleSegmentLearned(riffId, segIndex) {
    const p = rkGetRiffProgress(riffId);
    const learned = p.learned.slice();
    const i = learned.indexOf(segIndex);
    const wasLearned = i !== -1;
    if (i === -1) learned.push(segIndex);
    else learned.splice(i, 1);
    learned.sort((a, b) => a - b);
    const patch = { learned: learned, lastPracticedAt: Date.now() };
    // Speed Demon metric: learned at 0.5x
    if (!wasLearned && Math.abs((playbackSpeed || 1) - 0.5) < 0.001) {
        patch.learnedAtSlowSpeed = true;
    }
    rkSetRiffProgress(riffId, patch);
    return learned.indexOf(segIndex) !== -1;
}

function updatePracticeProgressUI() {
    if (!currentRiff || !currentRiff.segments) return;
    const pill = document.getElementById('practiceProgressPill');
    if (!pill) return;
    const p = rkGetRiffProgress(currentRiff.id);
    const total = currentRiff.segments.length || 0;
    const learnedCount = (p.learned || []).filter(i => i >= 0 && i < total).length;
    pill.textContent = learnedCount + '/' + total + ' learned';
    pill.style.display = total > 0 ? 'inline-flex' : 'none';

    // Mark learned button больше не отображается на practice-странице;
    // прогресс показывается только в профиле.
}

function setPlaybackSpeedUI(speed) {
    playbackSpeed = speed;
    if (leftVideo) leftVideo.playbackRate = speed;
    if (rightVideo) rightVideo.playbackRate = speed;
    document.querySelectorAll('.speed-btn').forEach(function(b) {
        const s = parseFloat(b.dataset.speed);
        b.classList.toggle('active', !isNaN(s) && Math.abs(s - speed) < 0.001);
    });
    updateSpeedTrainerTimelineLabel();
}

function setPracticeMode(mode) {
    practiceMode = (mode === 'speed') ? 'speed' : 'normal';
    const n = document.getElementById('modeNormalBtn');
    const s = document.getElementById('modeSpeedBtn');
    if (n) {
        n.classList.toggle('active', practiceMode === 'normal');
        n.setAttribute('aria-pressed', practiceMode === 'normal' ? 'true' : 'false');
    }
    if (s) {
        s.classList.toggle('active', practiceMode === 'speed');
        s.setAttribute('aria-pressed', practiceMode === 'speed' ? 'true' : 'false');
    }

    if (practiceMode === 'speed') {
        _speedTrainerState = { active: true, segIndex: currentSegment, speedIdx: 0, loopsAtSpeed: 0 };
        setPlaybackSpeedUI(SPEED_TRAINER_SPEEDS[0]);
        loopActive = true;
        const loopBtn = document.getElementById('loopButton');
        if (loopBtn) loopBtn.classList.add('active');
    } else {
        _speedTrainerState = { active: false, segIndex: -1, speedIdx: 0, loopsAtSpeed: 0 };
    }
    syncRiffTimelineSpeedTrainerClass();
    updateSpeedTrainerTimelineLabel();
}

function speedTrainerOnLoop(segIndex) {
    if (practiceMode !== 'speed') return;
    if (!_speedTrainerState.active) return;
    if (segIndex == null || segIndex < 0) return;
    if (_speedTrainerState.segIndex !== segIndex) {
        _speedTrainerState.segIndex = segIndex;
        _speedTrainerState.speedIdx = 0;
        _speedTrainerState.loopsAtSpeed = 0;
        setPlaybackSpeedUI(SPEED_TRAINER_SPEEDS[0]);
    }
    _speedTrainerState.loopsAtSpeed += 1;
    if (_speedTrainerState.loopsAtSpeed >= SPEED_TRAINER_LOOPS_PER_SPEED) {
        _speedTrainerState.loopsAtSpeed = 0;
        if (_speedTrainerState.speedIdx < SPEED_TRAINER_SPEEDS.length - 1) {
            _speedTrainerState.speedIdx += 1;
            const nextSp = SPEED_TRAINER_SPEEDS[_speedTrainerState.speedIdx];
            setPlaybackSpeedUI(nextSp);
            if (Math.abs(nextSp - 1) < 0.001) {
                showNotification(
                    'Speed Trainer: full speed ×1 — segment keeps repeating here. Tap another segment to start again from ×0.5.'
                );
            } else {
                showNotification(
                    'Speed Trainer: now ' +
                        formatSpeedTrainerLabel(nextSp) +
                        ' — ' +
                        SPEED_TRAINER_LOOPS_PER_SPEED +
                        ' loops, then faster.'
                );
            }
        }
    }
}

/** Границы сегментов: те же, что в админке (raw start/end), без смещений — цепочка таймингов идентична. */
function getSegmentStartRaw(seg) { return Number(seg.start) || 0; }
function getSegmentEndRaw(seg) { return Number(seg.end) || 0; }

/** Duration for timeline/segment layout: video duration when available, else riff duration (so segments match video exactly) */
function getTimelineDuration() {
    if (currentRiff && leftVideo && leftVideo.readyState >= 1 && !isNaN(leftVideo.duration) && leftVideo.duration > 0) {
        return leftVideo.duration;
    }
    return currentRiff ? currentRiff.duration : 0;
}

// Ожидание загрузки метаданных обоих видео (достаточно для сегментов и таймлайна)
function waitForVideosReady() {
    return new Promise((resolve, reject) => {
        if (!leftVideo || !rightVideo) return reject(new Error('No videos'));
        const timeout = setTimeout(() => reject(new Error('Video load timeout')), 30000);
        const check = () => {
            if (leftVideo.readyState >= 1 && rightVideo.readyState >= 1) {
                clearTimeout(timeout);
                resolve(true);
            } else {
                setTimeout(check, 150);
            }
        };
        if (leftVideo.readyState >= 1 && rightVideo.readyState >= 1) {
            clearTimeout(timeout);
            resolve(true);
        } else {
            leftVideo.addEventListener('loadedmetadata', check, { once: true });
            rightVideo.addEventListener('loadedmetadata', check, { once: true });
            leftVideo.addEventListener('error', () => { clearTimeout(timeout); reject(new Error('Video error')); }, { once: true });
            rightVideo.addEventListener('error', () => { clearTimeout(timeout); reject(new Error('Video error')); }, { once: true });
            setTimeout(check, 200);
        }
    });
}

function showVideoLoadingPlaceholder() {
    const wrapper = document.getElementById('videoWrapper');
    const placeholder = document.getElementById('videoLoadingPlaceholder');
    const progressBar = document.getElementById('videoLoadingProgress');
    const errorEl = document.getElementById('videoErrorState');
    const overlay = document.getElementById('videoOverlay');
    if (placeholder) placeholder.style.display = 'flex';
    if (progressBar) progressBar.style.width = '0%';
    if (errorEl) errorEl.style.display = 'none';
    if (overlay) overlay.classList.add('hidden');
    if (wrapper) {
        wrapper.classList.add('video-loading');
        if (currentRiff && currentRiff.thumbnail) {
            wrapper.style.backgroundImage = 'url(' + currentRiff.thumbnail + ')';
            wrapper.style.backgroundSize = 'cover';
            wrapper.style.backgroundPosition = 'center';
        } else {
            wrapper.style.backgroundImage = '';
            wrapper.style.background = '#1a1f33';
        }
    }
    startVideoLoadProgress();
}

function startVideoLoadProgress() {
    var progressBar = document.getElementById('videoLoadingProgress');
    if (!progressBar || (!leftVideo && !rightVideo)) return;
    function updateBar() {
        var v = leftVideo || rightVideo;
        if (!v) return;
        if (v.readyState >= 3) { progressBar.style.width = '100%'; return; }
        var buffered = v.buffered;
        if (buffered && buffered.length > 0 && v.duration > 0) {
            var end = buffered.end(buffered.length - 1);
            var pct = Math.min(100, Math.round((end / v.duration) * 100));
            progressBar.style.width = pct + '%';
        }
    }
    [leftVideo, rightVideo].forEach(function(v) {
        if (v) v.addEventListener('progress', updateBar);
    });
    var iv = setInterval(updateBar, 300);
    setTimeout(function() {
        clearInterval(iv);
        [leftVideo, rightVideo].forEach(function(v) {
            if (v) v.removeEventListener('progress', updateBar);
        });
    }, 32000);
}

function hideVideoLoadingPlaceholder() {
    const placeholder = document.getElementById('videoLoadingPlaceholder');
    const wrapper = document.getElementById('videoWrapper');
    const overlay = document.getElementById('videoOverlay');
    if (placeholder) placeholder.style.display = 'none';
    if (wrapper) {
        wrapper.classList.remove('video-loading');
        wrapper.style.backgroundImage = '';
        wrapper.style.background = '';
    }
    if (overlay) overlay.classList.remove('hidden');
}

function showVideoErrorState() {
    const placeholder = document.getElementById('videoLoadingPlaceholder');
    const errorEl = document.getElementById('videoErrorState');
    if (placeholder) placeholder.style.display = 'none';
    if (errorEl) errorEl.style.display = 'flex';
}

function hideVideoErrorState() {
    const errorEl = document.getElementById('videoErrorState');
    if (errorEl) errorEl.style.display = 'none';
}

// Controls are always clickable; this flag gates actual video-seeking logic
function enableControls(enable) {
    videosFullyLoaded = enable;
}


// Построение URL для видео: через video.php (Range/seek) или прямой путь (fallback)
function buildVideoSrc(path, time) {
    if (!path) return '';
    var url = 'video.php?file=' + encodeURIComponent(path);
    if (typeof time === 'number' && !isNaN(time) && time > 0) {
        url += '#t=' + time.toFixed(3);
    }
    return url;
}

// Прямой URL к файлу (fallback, если video.php не отдаёт видео на сервере)
function buildVideoSrcDirect(path, time) {
    if (!path) return '';
    var url = path;
    if (typeof time === 'number' && !isNaN(time) && time > 0) {
        url += '#t=' + time.toFixed(3);
    }
    return url;
}

// Загрузка состояния
function loadAppState() {
    try {
        const saved = localStorage.getItem('riffKillerState');
        if (saved) {
            return JSON.parse(saved);
        }
    } catch (e) {
        console.error('Error loading state:', e);
    }
    return { recentlyPracticed: [], riffsDatabase: [] };
}

// Сохранение состояния
function saveAppState(state) {
    try {
        localStorage.setItem('riffKillerState', JSON.stringify(state));
    } catch (e) {
        console.error('Error saving state:', e);
    }
}

// Добавление в недавно практикованные
function addToRecentlyPracticed(riff) {
    const state = loadAppState();
    
    if (!state.recentlyPracticed) {
        state.recentlyPracticed = [];
    }
    
    state.recentlyPracticed = state.recentlyPracticed.filter(r => r.id !== riff.id);
    state.recentlyPracticed.unshift({
        id: riff.id,
        song: riff.song,
        artist: riff.artist,
        thumbnail: riff.thumbnail,
        difficulty: riff.difficulty,
        lastPracticed: new Date().toISOString().split('T')[0]
    });
    
    if (state.recentlyPracticed.length > 20) {
        state.recentlyPracticed = state.recentlyPracticed.slice(0, 20);
    }
    
    saveAppState(state);
}

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
    initPracticePage();
});

// Онбординг Practice: один раз на устройство
function initPracticeOnboarding() {
    try {
        if (localStorage.getItem('riffKillerOnboardingSeen') === '1') return;
    } catch (e) {
        // если localStorage не доступен — просто не показываем
        return;
    }
    var overlay = document.getElementById('practiceOnboarding');
    if (!overlay) return;
    var skipBtn = document.getElementById('onboardingSkipBtn');
    var nextBtn = document.getElementById('onboardingNextBtn');
    overlay.style.display = 'flex';

    function closeOnboarding() {
        overlay.style.display = 'none';
        try { localStorage.setItem('riffKillerOnboardingSeen', '1'); } catch (e) {}
    }

    if (skipBtn) skipBtn.addEventListener('click', closeOnboarding);
    if (nextBtn) nextBtn.addEventListener('click', closeOnboarding);

    // клик по фону вне карточки — тоже закрывает
    overlay.addEventListener('click', function(e) {
        if (e.target === overlay) closeOnboarding();
    });
}


function initPracticePage() {
    document.body.style.opacity = '1';
    var urlParams = new URLSearchParams(window.location.search);
    var riffId = parseInt(urlParams.get('riff')) || 1;
    var state = loadAppState();
    // Fallback только полные риффы (riffsDatabase): в state.riffsDatabase только id/isFavorite — нет song, artist, videoFile
    var fallbackRiffs = riffsDatabase;

    function isFullRiff(r) {
        if (!r || !r.videoFile) return false;
        var hasName = (r.song != null && r.song !== '') || (r.title != null && r.title !== '') || (r.name != null && r.name !== '');
        return !!hasName;
    }

    function runWithRiffs(riffs) {
        if (!Array.isArray(riffs) || riffs.length === 0) riffs = fallbackRiffs;
        var found = riffs.find(function(r) { return r && (r.id === riffId || (r.id != null && parseInt(r.id, 10) === riffId)); });
        if (found && isFullRiff(found)) {
            currentRiff = found;
        } else {
            currentRiff = riffs.find(isFullRiff) || null;
        }
        if (!currentRiff) {
            var el = document.querySelector('.breadcrumb-current');
            if (el) el.textContent = 'Riff not found';
            return;
        }
        if (currentRiff.segments && currentRiff.segments.length) {
            console.log('[RiffKiller] SEGMENTS_FROM_DATA (admin timing):', JSON.stringify(currentRiff.segments.map(function(s, i) { return (i + 1) + ': ' + Number(s.start) + '-' + Number(s.end); })));
        }
        addToRecentlyPracticed(currentRiff);
        rkMarkLastPracticed(currentRiff.id);
        updateTitle();
        videosFullyLoaded = false;
        initVideoPlayers();
        showVideoLoadingPlaceholder();
        initControls();
        initSpeedControls();
        initPracticeTools();
        initLessonMode();
        initTabsToggle();
        loadRecentlyPracticedRiffs();
        waitForVideosReady()
            .then(function() {
                videosFullyLoaded = true;
                initTimeline();
                initSegmentControls();
                enableControls(true);
                hideVideoLoadingPlaceholder();
                setVideoMode(currentMode);
                updateCurrentSegmentFromTime();
                updatePlayButtonState();
                initPracticeOnboarding();
                updatePracticeProgressUI();
                if (typeof pendingSegmentIndex === 'number' && pendingSegmentIndex !== null) {
                    var idx = pendingSegmentIndex;
                    pendingSegmentIndex = null;
                    jumpToSegment(idx);
                }
            })
            .catch(function() { showVideoErrorState(); });
        document.getElementById('videoRetryBtn')?.addEventListener('click', function() {
            hideVideoErrorState();
            showVideoLoadingPlaceholder();
            if (leftVideo && rightVideo && currentRiff) {
                leftVideo.dataset.fallbackTried = '';
                rightVideo.dataset.fallbackTried = '';
                leftVideo.src = buildVideoSrcDirect(currentRiff.videoFile);
                rightVideo.src = buildVideoSrcDirect(currentRiff.videoFileRight || currentRiff.videoFile);
                leftVideo.load();
                rightVideo.load();
                waitForVideosReady()
                    .then(function() {
                        videosFullyLoaded = true;
                        initTimeline();
                        initSegmentControls();
                        enableControls(true);
                        hideVideoLoadingPlaceholder();
                        setVideoMode(currentMode);
                        updateCurrentSegmentFromTime();
                        updatePlayButtonState();
                        if (typeof pendingSegmentIndex === 'number' && pendingSegmentIndex !== null) {
                            var idx = pendingSegmentIndex;
                            pendingSegmentIndex = null;
                            jumpToSegment(idx);
                        }
                    })
                    .catch(function() { showVideoErrorState(); });
            }
        });
        var hasPremiumAccess = window.patreonAuth &&
            typeof window.patreonAuth.hasActiveSubscription === 'function' &&
            window.patreonAuth.hasActiveSubscription();
        if (currentRiff.id === 1) {
            showNotification('🔥 Free Riff: Try it out! Subscribe ($9/month) to unlock all riffs with tabs and slow-mo.');
        } else if (!hasPremiumAccess) {
            showPatreonUpgradeModal();
        }
    }

    fetch('/api/riffs/list.php').then(function(r) { return r.json(); }).then(function(list) {
        var riffs = (Array.isArray(list) && list.length > 0) ? list : fallbackRiffs;
        runWithRiffs(riffs);
    }).catch(function() { runWithRiffs(fallbackRiffs); });
}

function openSpeedTrainerIntroModal() {
    const m = document.getElementById('speedTrainerIntroModal');
    if (!m) {
        setPracticeMode('speed');
        return;
    }
    m.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    const cta = document.getElementById('speedTrainerIntroBtn');
    if (cta) cta.focus();
}

function closeSpeedTrainerIntroModal() {
    const m = document.getElementById('speedTrainerIntroModal');
    if (m) m.style.display = 'none';
    document.body.style.overflow = '';
}

function refreshSpeedTrainerIntroCopy() {
    const ul = document.querySelector('#speedTrainerIntroModal .speed-trainer-intro-list');
    if (!ul) return;
    const n = SPEED_TRAINER_LOOPS_PER_SPEED;
    ul.innerHTML =
        '<li><span class="speed-trainer-intro-kicker">×0.5</span> — ' +
        n +
        ' full loops at half speed</li>' +
        '<li><span class="speed-trainer-intro-kicker">×0.75</span> — ' +
        n +
        ' loops</li>' +
        '<li><span class="speed-trainer-intro-kicker">×1</span> — then the segment keeps looping at ×1 (no automatic slow-down). Pick another segment to run the ladder again from ×0.5.</li>';
}

function initSpeedTrainerIntroModal() {
    refreshSpeedTrainerIntroCopy();
    const m = document.getElementById('speedTrainerIntroModal');
    const cta = document.getElementById('speedTrainerIntroBtn');
    if (cta) {
        cta.addEventListener('click', function () {
            try {
                localStorage.setItem(RK_SPEED_TRAINER_INTRO_KEY, '1');
            } catch (e) {}
            closeSpeedTrainerIntroModal();
            setPracticeMode('speed');
        });
    }
    if (m) {
        m.addEventListener('click', function (e) {
            if (e.target === m) closeSpeedTrainerIntroModal();
        });
    }
    document.addEventListener('keydown', function speedIntroEsc(e) {
        if (e.key !== 'Escape') return;
        if (!m || m.style.display !== 'flex') return;
        closeSpeedTrainerIntroModal();
    });
}

function initPracticeTools() {
    const normalBtn = document.getElementById('modeNormalBtn');
    const speedBtn = document.getElementById('modeSpeedBtn');
    if (normalBtn) normalBtn.addEventListener('click', function () { setPracticeMode('normal'); });
    if (speedBtn) {
        speedBtn.addEventListener('click', function () {
            try {
                if (localStorage.getItem(RK_SPEED_TRAINER_INTRO_KEY) === '1') {
                    setPracticeMode('speed');
                } else {
                    openSpeedTrainerIntroModal();
                }
            } catch (e) {
                setPracticeMode('speed');
            }
        });
    }
    initSpeedTrainerIntroModal();
}

// Обновление заголовка (устойчиво к отсутствующим полям и разным именам в API)
function updateTitle() {
    const titleElement = document.getElementById('practiceTitle');
    if (!titleElement) return;
    const currentElement = titleElement.querySelector('.breadcrumb-current');
    if (!currentElement) return;
    if (!currentRiff) {
        currentElement.textContent = 'Loading...';
        return;
    }
    var song = (currentRiff.song != null && currentRiff.song !== '') ? currentRiff.song : (currentRiff.title || currentRiff.name || 'Song');
    var artist = (currentRiff.artist != null && currentRiff.artist !== '') ? currentRiff.artist : (currentRiff.artistName || 'Artist');
    currentElement.textContent = song + ' - ' + artist;
}

// Инициализация видео
function initVideoPlayers() {
    const videoWrapper = document.getElementById('videoWrapper');
    if (!videoWrapper) return;
    
    // Удаляем старые видео, если есть
    const oldVideos = videoWrapper.querySelectorAll('.video-element');
    oldVideos.forEach(v => v.remove());
    
    leftVideo = document.createElement('video');
    leftVideo.id = 'leftVideo';
    leftVideo.className = 'video-element left-hand';
    leftVideo.setAttribute('playsinline', '');
    leftVideo.setAttribute('preload', 'auto'); // обязательно
    leftVideo.muted = false;
    
    rightVideo = document.createElement('video');
    rightVideo.id = 'rightVideo';
    rightVideo.className = 'video-element right-hand';
    rightVideo.setAttribute('playsinline', '');
    rightVideo.setAttribute('preload', 'auto');
    rightVideo.muted = true;
    
    videoWrapper.appendChild(leftVideo);
    videoWrapper.appendChild(rightVideo);
    
    if (currentRiff && currentRiff.lessonVideo) {
        lessonVideoEl = document.createElement('video');
        lessonVideoEl.className = 'video-element lesson-video';
        lessonVideoEl.setAttribute('playsinline', '');
        lessonVideoEl.setAttribute('preload', 'auto');
        lessonVideoEl.muted = false;
        lessonVideoEl.style.display = 'none';
        lessonVideoEl.addEventListener('ended', function() {
            if (lessonModeActive) { isPlaying = false; updatePlayButtonState(); }
        });
        videoWrapper.appendChild(lessonVideoEl);
    } else {
        lessonVideoEl = null;
    }
    
    if (currentRiff) {
        // Прямой путь к файлу — видео грузятся без video.php (если файлы есть в assets/video/...)
        leftVideo.src = buildVideoSrcDirect(currentRiff.videoFile);
        rightVideo.src = buildVideoSrcDirect(currentRiff.videoFileRight || currentRiff.videoFile);
        if (lessonVideoEl && currentRiff.lessonVideo) {
            lessonVideoEl.src = buildVideoSrcDirect(currentRiff.lessonVideo);
            lessonVideoEl.load();
        }
    }

    function tryVideoPhpOnce(videoEl, path, label) {
        if (!path || videoEl.dataset.fallbackTried === '1') return;
        videoEl.dataset.fallbackTried = '1';
        videoEl.src = buildVideoSrc(path);
        videoEl.load();
    }

    leftVideo.addEventListener('error', function onLeftError() {
        if (currentRiff && currentRiff.videoFile) tryVideoPhpOnce(leftVideo, currentRiff.videoFile, 'left');
    });
    rightVideo.addEventListener('error', function onRightError() {
        if (currentRiff) tryVideoPhpOnce(rightVideo, currentRiff.videoFileRight || currentRiff.videoFile, 'right');
    });

    // Принудительно начинаем загрузку
    leftVideo.load();
    rightVideo.load();

    // Сразу убираем обложку с контейнера, чтобы не мелькала при воспроизведении
    var clearWrapperCover = function() {
        var w = document.getElementById('videoWrapper');
        if (w) {
            w.classList.remove('video-loading');
            w.style.backgroundImage = '';
            w.style.background = '';
        }
    };
    leftVideo.addEventListener('loadedmetadata', function() {
        clearWrapperCover();
        isInitialized = true;
        setVideoMode(currentMode);
    });
    rightVideo.addEventListener('loadedmetadata', clearWrapperCover);
    leftVideo.addEventListener('canplay', clearWrapperCover);
    rightVideo.addEventListener('canplay', clearWrapperCover);
    
    leftVideo.addEventListener('timeupdate', updateVideoProgress);
    leftVideo.addEventListener('ended', handleVideoEnd);
    rightVideo.addEventListener('ended', handleVideoEnd);

    const onVideoError = () => {
        if (typeof showVideoErrorState === 'function') showVideoErrorState();
    };
    leftVideo.addEventListener('error', onVideoError);
    rightVideo.addEventListener('error', onVideoError);
}

// Установка режима видео
function setVideoMode(mode) {
    if (lessonModeActive) return;
    if (!leftVideo || !rightVideo) return;
    
    currentMode = mode;
    
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.mode === mode) btn.classList.add('active');
    });
    
    const videoWrapper = document.getElementById('videoWrapper');
    if (videoWrapper) {
        videoWrapper.className = 'video-wrapper ' + mode + '-mode';
    }

    // При смене режима автоматически выключаем табы
    if (tabsVisible) {
        tabsVisible = false;
        const toggleBtn = document.getElementById('toggleTabs');
        if (toggleBtn) {
            toggleBtn.classList.remove('active');
        }
        if (tabsOverlay) {
            tabsOverlay.classList.add('hidden');
        }
    }
    
    const currentTime = leftVideo.currentTime;
    
    switch(mode) {
        case 'left':
            leftVideo.style.opacity = '1';
            leftVideo.style.pointerEvents = 'auto';
            leftVideo.muted = false;
            rightVideo.style.opacity = '0';
            rightVideo.style.pointerEvents = 'none';
            rightVideo.muted = true;
            rightVideo.currentTime = currentTime;
            break;
            
        case 'right':
            leftVideo.style.opacity = '0';
            leftVideo.style.pointerEvents = 'none';
            leftVideo.muted = true;
            rightVideo.style.opacity = '1';
            rightVideo.style.pointerEvents = 'auto';
            rightVideo.muted = false;
            leftVideo.currentTime = rightVideo.currentTime;
            break;
            
        case 'split':
            leftVideo.style.opacity = '1';
            leftVideo.style.pointerEvents = 'auto';
            leftVideo.muted = true;
            rightVideo.style.opacity = '1';
            rightVideo.style.pointerEvents = 'auto';
            rightVideo.muted = false;
            rightVideo.currentTime = currentTime;
            break;
    }
    
    if (isPlaying) {
        leftVideo.play().catch(() => {});
        rightVideo.play().catch(() => {});
    }
}

// Сообщение при попытке использовать управление в lesson mode
const LESSON_MODE_MSG = 'В режиме Lesson mode управление риффом недоступно. Отожмите кнопку Lesson mode.';

// Переключение воспроизведения
function togglePlayback() {
    if (lessonModeActive && lessonVideoEl) {
        if (lessonVideoEl.paused) {
            lessonVideoEl.play().catch(() => {});
            isPlaying = true;
        } else {
            lessonVideoEl.pause();
            isPlaying = false;
        }
        updatePlayButtonState();
        return;
    }
    if (!leftVideo || !rightVideo) return;
    
    if (isPlaying) {
        leftVideo.pause();
        rightVideo.pause();
        isPlaying = false;
    } else {
        leftVideo.play().catch(() => {});
        rightVideo.play().catch(() => {});
        isPlaying = true;
    }
    
    updatePlayButtonState();
}

// Обновление кнопки play
function updatePlayButtonState() {
    const playControl = document.getElementById('playControl');
    const overlay = document.getElementById('videoOverlay');
    const wrapper = document.getElementById('videoWrapper');
    
    if (playControl) {
        const playIcon = playControl.querySelector('.play-icon');
        const stopIcon = playControl.querySelector('.stop-icon');
        
        if (isPlaying) {
            playControl.classList.add('active');
            if (playIcon) playIcon.style.display = 'none';
            if (stopIcon) stopIcon.style.display = 'block';
        } else {
            playControl.classList.remove('active');
            if (playIcon) playIcon.style.display = 'block';
            if (stopIcon) stopIcon.style.display = 'none';
        }
    }
    
    if (wrapper) {
        wrapper.classList.toggle('playing', isPlaying);
    }
}

// Перемотка
function rewindVideo(seconds) {
    if (lessonModeActive) { showNotification(LESSON_MODE_MSG); return; }
    if (!leftVideo || !rightVideo) return;
    
    const currentTime = currentMode === 'right' ? rightVideo.currentTime : leftVideo.currentTime;
    const newTime = Math.max(0, Math.min(currentTime + seconds, currentRiff.duration));
    
    leftVideo.currentTime = newTime;
    rightVideo.currentTime = newTime;
    
    updateCurrentSegmentFromTime();
}

// Обновление прогресса видео
function updateVideoProgress() {
    if (!leftVideo || !rightVideo || !currentRiff) return;
    
    const currentTime = currentMode === 'right' ? rightVideo.currentTime : leftVideo.currentTime;
    
    // Обновляем прогресс на таймлайне
    updateTimelineProgress(currentTime);
    
    // Не переопределяем currentSegment во время перехода по клику (seek ещё не применился)
    if (!window._jumpToSegmentInProgress && !loopAllRiff && !loopActive) {
        for (let i = 0; i < currentRiff.segments.length; i++) {
            const seg = currentRiff.segments[i];
            const start = getSegmentStartRaw(seg);
            const end = getSegmentEndRaw(seg);
            if (currentTime >= start && currentTime < end) {
                if (i !== currentSegment) {
                    currentSegment = i;
                    updateSegmentButtons();
                }
                break;
            }
        }
    }
    
    if (loopActive && !loopAllRiff && currentSegment >= 0) {
        const segment = currentRiff.segments[currentSegment];
        if (segment) {
            const start = getSegmentStartRaw(segment);
            const end = getSegmentEndRaw(segment);
            if (currentTime >= end && (Date.now() - _lastSegmentLoopSeekAt) > SEGMENT_LOOP_DEBOUNCE_MS) {
                if (_segmentLoopPollId) { clearInterval(_segmentLoopPollId); _segmentLoopPollId = null; }
                _lastSegmentLoopSeekAt = Date.now();
                console.log('[RiffKiller] LOOP timeupdate: segmentIndex=' + currentSegment + ' videoTime=' + currentTime.toFixed(3) + ' effectiveEnd=' + end.toFixed(3));
                speedTrainerOnLoop(currentSegment);
                leftVideo.currentTime = start;
                rightVideo.currentTime = start;
            } else if (currentTime >= end - 0.12) {
                if (!_segmentLoopPollId) {
                    _segmentLoopPollId = setInterval(function() {
                        if (!leftVideo || !rightVideo || !currentRiff || currentSegment < 0) {
                            if (_segmentLoopPollId) { clearInterval(_segmentLoopPollId); _segmentLoopPollId = null; }
                            return;
                        }
                        var seg = currentRiff.segments[currentSegment];
                        if (!seg) { if (_segmentLoopPollId) { clearInterval(_segmentLoopPollId); _segmentLoopPollId = null; } return; }
                        var t = currentMode === 'right' ? rightVideo.currentTime : leftVideo.currentTime;
                        var e = getSegmentEndRaw(seg);
                        if (t >= e && (Date.now() - _lastSegmentLoopSeekAt) > SEGMENT_LOOP_DEBOUNCE_MS) {
                            if (_segmentLoopPollId) { clearInterval(_segmentLoopPollId); _segmentLoopPollId = null; }
                            _lastSegmentLoopSeekAt = Date.now();
                            console.log('[RiffKiller] LOOP poll: segmentIndex=' + currentSegment + ' videoTime=' + t.toFixed(3) + ' effectiveEnd=' + e.toFixed(3));
                            speedTrainerOnLoop(currentSegment);
                            var segStart = getSegmentStartRaw(seg);
                            leftVideo.currentTime = segStart;
                            rightVideo.currentTime = segStart;
                        }
                    }, 25);
                }
            } else {
                if (_segmentLoopPollId) { clearInterval(_segmentLoopPollId); _segmentLoopPollId = null; }
            }
        } else {
            if (_segmentLoopPollId) { clearInterval(_segmentLoopPollId); _segmentLoopPollId = null; }
        }
    } else {
        if (_segmentLoopPollId) { clearInterval(_segmentLoopPollId); _segmentLoopPollId = null; }
    }
}

// Обновление прогресса на таймлайне
function updateTimelineProgress(currentTime) {
    if (!currentRiff) return;
    
    // Сбрасываем все заполнения
    document.querySelectorAll('.segment-fill').forEach(fill => fill.style.width = '0%');
    
    if (loopAllRiff) {
        // Для всего риффа показываем прогресс относительно всего риффа
        const totalDuration = getTimelineDuration();
        const progress = totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0;
        
        currentRiff.segments.forEach((segment, index) => {
            const fill = document.getElementById(`segment-fill-${index}`);
            if (!fill) return;
            const start = getSegmentStartRaw(segment);
            const end = getSegmentEndRaw(segment);
            if (currentTime >= start) {
                if (currentTime < end) {
                    const segLen = end - start;
                    fill.style.width = segLen > 0 ? `${((currentTime - start) / segLen) * 100}%` : '0%';
                } else {
                    fill.style.width = '100%';
                }
            } else {
                fill.style.width = '0%';
            }
        });
    } else if (currentSegment >= 0 && currentSegment < currentRiff.segments.length) {
        const segment = currentRiff.segments[currentSegment];
        if (segment) {
            const start = getSegmentStartRaw(segment);
            const end = getSegmentEndRaw(segment);
            const fill = document.getElementById(`segment-fill-${currentSegment}`);
            if (fill && currentTime >= start) {
                const segLen = end - start;
                const progress = segLen > 0 ? Math.min((currentTime - start) / segLen, 1) : 1;
                fill.style.width = `${progress * 100}%`;
            }
        }
    }
}

// Переход к сегменту — логика как в рабочем бэкапе (currentTime + fallback с #t=)
function jumpToSegment(index) {
    if (lessonModeActive) { showNotification(LESSON_MODE_MSG); return; }
    if (!currentRiff) return;

    if (index < 0 || index >= currentRiff.segments.length) return;

    if (!videosFullyLoaded || !leftVideo || !rightVideo) {
        pendingSegmentIndex = index;
        currentSegment = index;
        updateSegmentButtons();
        return;
    }

    const segment = currentRiff.segments[index];
    const targetTime = getSegmentStartRaw(segment);
    if (isNaN(targetTime) || targetTime < 0) return;

    if (window._jumpToSegmentInProgress && window._fallbackTimer) {
        clearTimeout(window._fallbackTimer);
        window._fallbackTimer = null;
    }
    window._jumpToSegmentInProgress = true;

    const wasPlaying = isPlaying;
    if (wasPlaying) {
        leftVideo.pause();
        rightVideo.pause();
    }

    try {
        leftVideo.currentTime = targetTime;
        rightVideo.currentTime = targetTime;
    } catch (e) {
        window._jumpToSegmentInProgress = false;
        return;
    }

    loopAllRiff = false;
    currentSegment = index;
    if (practiceMode === 'speed') {
        _speedTrainerState.segIndex = index;
        _speedTrainerState.speedIdx = 0;
        _speedTrainerState.loopsAtSpeed = 0;
        setPlaybackSpeedUI(SPEED_TRAINER_SPEEDS[0]);
    }
    updateTimelineProgress(targetTime);
    updateSegmentButtons();
    updatePracticeProgressUI();

    var safePlay = function(videoElement) {
        if (!videoElement || videoElement.readyState === 0) return Promise.resolve();
        return videoElement.play().catch(function(err) {
            if (err.name !== 'AbortError') console.error(err);
        });
    };

    if (wasPlaying) {
        setTimeout(function() {
            safePlay(leftVideo);
            safePlay(rightVideo);
            isPlaying = true;
            updatePlayButtonState();
        }, 50);
    } else {
        updatePlayButtonState();
    }

    if (window._fallbackTimer) clearTimeout(window._fallbackTimer);
    window._fallbackTimer = setTimeout(function() {
        if (!window._jumpToSegmentInProgress) return;

        var appliedTime = leftVideo.currentTime;
        if (targetTime > 0 && Math.abs(appliedTime - targetTime) > 0.1) {
            var leftPath = currentRiff.videoFile;
            var rightPath = currentRiff.videoFileRight || currentRiff.videoFile;
            leftVideo.src = buildVideoSrc(leftPath, targetTime);
            rightVideo.src = buildVideoSrc(rightPath, targetTime);
            leftVideo.load();
            rightVideo.load();
            if (wasPlaying) {
                leftVideo.addEventListener('loadedmetadata', function onL() {
                    leftVideo.removeEventListener('loadedmetadata', onL);
                    safePlay(leftVideo);
                    isPlaying = true;
                    updatePlayButtonState();
                }, { once: true });
                rightVideo.addEventListener('loadedmetadata', function onR() {
                    rightVideo.removeEventListener('loadedmetadata', onR);
                    safePlay(rightVideo);
                    isPlaying = true;
                    updatePlayButtonState();
                }, { once: true });
            }
        }
        window._jumpToSegmentInProgress = false;
        window._fallbackTimer = null;
    }, 150);
}

// Обновление текущего сегмента
function updateCurrentSegmentFromTime() {
    if (!currentRiff || !leftVideo || window._jumpToSegmentInProgress) return;
    
    const currentTime = currentMode === 'right' ? rightVideo.currentTime : leftVideo.currentTime;
    
    for (let i = 0; i < currentRiff.segments.length; i++) {
        const seg = currentRiff.segments[i];
        const start = getSegmentStartRaw(seg);
        const end = getSegmentEndRaw(seg);
        if (currentTime >= start && currentTime < end) {
            if (i !== currentSegment) {
                currentSegment = i;
                updateSegmentButtons();
            }
            return;
        }
    }
}

// Проверка границ сегмента для лупа
function checkSegmentBoundary() {
    if (!currentRiff || !leftVideo || !isPlaying || !loopActive || loopAllRiff) return;
    
    const currentTime = currentMode === 'right' ? rightVideo.currentTime : leftVideo.currentTime;
    
    if (currentSegment >= 0) {
        const segment = currentRiff.segments[currentSegment];
        if (segment) {
            const start = getSegmentStartRaw(segment);
            const end = getSegmentEndRaw(segment);
            if (currentTime >= end && (Date.now() - _lastSegmentLoopSeekAt) > SEGMENT_LOOP_DEBOUNCE_MS) {
                _lastSegmentLoopSeekAt = Date.now();
                speedTrainerOnLoop(currentSegment);
                leftVideo.currentTime = start;
                rightVideo.currentTime = start;
                updateTimelineProgress(start);
            }
        }
    }
}

// Переключение лупа
function toggleLoop() {
    if (lessonModeActive) { showNotification(LESSON_MODE_MSG); return; }
    loopActive = !loopActive;
    if (!loopActive && practiceMode === 'speed') {
        setPracticeMode('normal');
        showNotification('Speed Trainer off — loop turned off.');
    }
    if (!loopActive && _segmentLoopPollId) { clearInterval(_segmentLoopPollId); _segmentLoopPollId = null; }
    const loopBtn = document.getElementById('loopButton');
    if (loopBtn) {
        loopBtn.classList.toggle('active', loopActive);
    }
}

// Обработка окончания видео
function handleVideoEnd() {
    if (loopActive) {
        if (loopAllRiff) {
            leftVideo.currentTime = 0;
            rightVideo.currentTime = 0;
            currentSegment = 0;
            updateSegmentButtons();
            if (isPlaying) {
                leftVideo.play().catch(() => {});
                rightVideo.play().catch(() => {});
            }
        } else if (currentSegment >= 0) {
            const segment = currentRiff.segments[currentSegment];
            if (segment) {
                const start = getSegmentStartRaw(segment);
                speedTrainerOnLoop(currentSegment);
                leftVideo.currentTime = start;
                rightVideo.currentTime = start;
                if (isPlaying) {
                    leftVideo.play().catch(() => {});
                    rightVideo.play().catch(() => {});
                }
            }
        }
    } else {
        leftVideo.pause();
        rightVideo.pause();
        isPlaying = false;
        updatePlayButtonState();
    }
}

// Обновление кнопок сегментов - ИСПРАВЛЕННАЯ ВЕРСИЯ
function updateSegmentButtons() {
    // Сначала убираем активный класс со всех кнопок
    document.querySelectorAll('.segment-btn').forEach(btn => {
        btn.classList.remove('active');
        const playIcon = btn.querySelector('.play-icon');
        const stopIcon = btn.querySelector('.stop-icon');
        if (playIcon) playIcon.style.display = 'block';
        if (stopIcon) stopIcon.style.display = 'none';
    });
    
    // Убираем активный класс со всех сегментов таймлайна
    document.querySelectorAll('.segment').forEach(segment => {
        segment.classList.remove('active');
    });
    
    if (loopAllRiff) {
        const allRiffBtn = document.querySelector('.segment-btn.all-riff');
        if (allRiffBtn) {
            allRiffBtn.classList.add('active');
            const playIcon = allRiffBtn.querySelector('.play-icon');
            const stopIcon = allRiffBtn.querySelector('.stop-icon');
            if (playIcon) playIcon.style.display = isPlaying ? 'none' : 'block';
            if (stopIcon) stopIcon.style.display = isPlaying ? 'block' : 'none';
        }
    } else if (currentSegment >= 0 && currentRiff && currentSegment < currentRiff.segments.length) {
        // Активируем кнопку сегмента; Стоп показываем только когда сегмент воспроизводится
        const segmentBtns = document.querySelectorAll('.segment-btn:not(.all-riff)');
        if (segmentBtns[currentSegment]) {
            segmentBtns[currentSegment].classList.add('active');
            const playIcon = segmentBtns[currentSegment].querySelector('.play-icon');
            const stopIcon = segmentBtns[currentSegment].querySelector('.stop-icon');
            if (playIcon) playIcon.style.display = isPlaying ? 'none' : 'block';
            if (stopIcon) stopIcon.style.display = isPlaying ? 'block' : 'none';
        }
        
        // Активируем сегмент на таймлайне
        const timelineSegments = document.querySelectorAll('.segment');
        if (timelineSegments[currentSegment]) {
            timelineSegments[currentSegment].classList.add('active');
        }
    }

    // Если табы включены, обновляем картинку под текущий сегмент
    if (tabsVisible) {
        updateTabsForCurrentSegment();
    }

    updatePracticeProgressUI();
    updateSpeedTrainerTimelineLabel();
}

// Инициализация таймлайна
function initTimeline() {
    const timelineSegments = document.getElementById('timelineSegments');
    
    if (!timelineSegments || !currentRiff) {
        return;
    }
    
    timelineSegments.innerHTML = '';
    
    const totalDuration = getTimelineDuration();
    if (!totalDuration || !currentRiff.segments.length) return;
    
    // Эффективные границы (как при воспроизведении) для всех сегментов — таймлайн рисуем в том же масштабе
    var effectiveDurations = currentRiff.segments.map(function(seg) {
        var s = getSegmentStartRaw(seg);
        var e = getSegmentEndRaw(seg);
        return Math.max(0, e - s);
    });
    var totalEffective = effectiveDurations.reduce(function(a, b) { return a + b; }, 0);
    
    currentRiff.segments.forEach((segment, index) => {
        const startEffective = getSegmentStartRaw(segment);
        const endEffective = getSegmentEndRaw(segment);
        const segmentDuration = Math.max(0, endEffective - startEffective);
        const segmentWidth = totalEffective > 0 ? (segmentDuration / totalEffective) * 100 : 0;
        let segColor = '#9355E5';
        if (segment.color && typeof segment.color === 'string') {
            const c = segment.color.trim();
            if (/^#[0-9A-Fa-f]{6}$/.test(c)) segColor = c;
            else if (/^[0-9A-Fa-f]{6}$/.test(c)) segColor = '#' + c;
        }
        
        const segmentElement = document.createElement('div');
        segmentElement.className = 'segment';
        segmentElement.dataset.index = String(index);
        segmentElement.style.width = `${segmentWidth}%`;
        segmentElement.style.setProperty('--segment-color', segColor);
        
        const segmentFill = document.createElement('div');
        segmentFill.className = 'segment-fill';
        segmentFill.id = `segment-fill-${index}`;

        const trainerSpeed = document.createElement('span');
        trainerSpeed.className = 'segment-trainer-speed';
        trainerSpeed.setAttribute('aria-hidden', 'true');
        trainerSpeed.hidden = true;

        segmentElement.appendChild(segmentFill);
        segmentElement.appendChild(trainerSpeed);
        timelineSegments.appendChild(segmentElement);
        
        segmentElement.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            const now = Date.now();
            if (now - lastSegmentTapTime < SEGMENT_TAP_DEBOUNCE_MS) return;
            lastSegmentTapTime = now;
            const idx = parseInt(e.currentTarget.dataset.index, 10);
            if (!isNaN(idx) && idx >= 0) jumpToSegment(idx);
        });
    });

    syncRiffTimelineSpeedTrainerClass();
    updateSpeedTrainerTimelineLabel();
}

// Инициализация кнопок сегментов
function initSegmentControls() {
    const container = document.getElementById('segmentControls');
    if (!container || !currentRiff) return;
    
    container.innerHTML = '';
    
    const allBtn = document.createElement('button');
    allBtn.className = 'segment-btn all-riff';
    allBtn.dataset.segment = 'all';
    allBtn.innerHTML = `
        <img src="assets/icons/play-16.svg" alt="Play" class="segment-icon play-icon">
        <img src="assets/icons/stop-16.svg" alt="Stop" class="segment-icon stop-icon" style="display: none;">
        <span class="segment-name">All Riff</span>
    `;
    
    allBtn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        const now = Date.now();
        if (now - lastSegmentTapTime < SEGMENT_TAP_DEBOUNCE_MS) return;
        lastSegmentTapTime = now;
        
        document.querySelectorAll('.segment-btn').forEach(btn => {
            btn.classList.remove('active');
            const playIcon = btn.querySelector('.play-icon');
            const stopIcon = btn.querySelector('.stop-icon');
            if (playIcon) playIcon.style.display = 'block';
            if (stopIcon) stopIcon.style.display = 'none';
        });
        
        allBtn.classList.add('active');
        const playIcon = allBtn.querySelector('.play-icon');
        const stopIcon = allBtn.querySelector('.stop-icon');
        if (playIcon) playIcon.style.display = 'none';
        if (stopIcon) stopIcon.style.display = 'block';
        
        loopAllRiff = true;
        if (practiceMode === 'speed') {
            setPracticeMode('normal');
        }
        if (leftVideo && rightVideo) {
            leftVideo.currentTime = 0;
            rightVideo.currentTime = 0;
        }
        if (!isPlaying) togglePlayback();
        updateSegmentButtons();
    });
    
    container.appendChild(allBtn);
    
    currentRiff.segments.forEach((segment, index) => {
        const segmentNumber = index + 1;
        const segmentName = segment.name || `Shot ${segmentNumber}`;
        let segColor = '#9355E5';
        if (segment.color && typeof segment.color === 'string') {
            const c = segment.color.trim();
            if (/^#[0-9A-Fa-f]{6}$/.test(c)) segColor = c;
            else if (/^[0-9A-Fa-f]{6}$/.test(c)) segColor = '#' + c;
        }
        
        const btn = document.createElement('button');
        btn.className = 'segment-btn';
        btn.dataset.segment = segmentNumber;
        btn.dataset.index = index;
        btn.style.setProperty('--segment-color', segColor);
        btn.innerHTML = `
            <img src="assets/icons/play-16.svg" alt="Play" class="segment-icon play-icon">
            <img src="assets/icons/stop-16.svg" alt="Stop" class="segment-icon stop-icon" style="display: none;">
            <span class="segment-name">${segmentName}</span>
        `;
        
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            const now = Date.now();
            if (now - lastSegmentTapTime < SEGMENT_TAP_DEBOUNCE_MS) return;
            lastSegmentTapTime = now;
            var target = e.currentTarget || btn;
            const idx = parseInt(target.dataset.index, 10);
            if (isNaN(idx) || idx < 0) return;
            // Если уже воспроизводится этот сегмент — кнопка работает как Стоп
            if (isPlaying && currentSegment === idx) {
                togglePlayback();
                updateSegmentButtons();
                return;
            }
            loopAllRiff = false;
            jumpToSegment(idx);
            // Сразу запускаем воспроизведение сегмента и включаем луп
            if (!isPlaying && leftVideo && rightVideo) {
                leftVideo.play().catch(function() {});
                rightVideo.play().catch(function() {});
                isPlaying = true;
                updatePlayButtonState();
            }
            loopActive = true;
            var loopBtn = document.getElementById('loopButton');
            if (loopBtn) loopBtn.classList.add('active');
            updateSegmentButtons();
        });
        
        container.appendChild(btn);
    });
}

// Инициализация контролов скорости
function initSpeedControls() {
    document.querySelectorAll('.speed-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            if (lessonModeActive) { showNotification(LESSON_MODE_MSG); return; }
            document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            
            const speed = parseFloat(this.dataset.speed);
            setPlaybackSpeedUI(speed);
            if (practiceMode === 'speed') {
                _speedTrainerState.active = false;
                setPracticeMode('normal');
            }
        });
    });
}

// Инициализация основных контролов
function initControls() {
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            if (lessonModeActive) { showNotification(LESSON_MODE_MSG); return; }
            setVideoMode(this.dataset.mode);
        });
    });
    
    const playBtn = document.getElementById('playButton');
    const playControl = document.getElementById('playControl');
    
    [playBtn, playControl].forEach(btn => {
        if (btn) {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                togglePlayback();
            });
        }
    });
    
    const videoWrapper = document.getElementById('videoWrapper');
    if (videoWrapper) {
        videoWrapper.addEventListener('click', (e) => {
            if (e.target === videoWrapper || e.target.classList.contains('video-element')) {
                togglePlayback();
            }
        });
    }
    
    const rewindBack = document.getElementById('rewindBack');
    const rewindForward = document.getElementById('rewindForward');
    
    if (rewindBack) {
        rewindBack.addEventListener('click', () => rewindVideo(-2));
    }
    
    if (rewindForward) {
        rewindForward.addEventListener('click', () => rewindVideo(2));
    }
    
    const loopBtn = document.getElementById('loopButton');
    if (loopBtn) {
        loopBtn.addEventListener('click', toggleLoop);
    }
}

// Lesson Mode
function initLessonMode() {
    const btn = document.getElementById('lessonModeBtn');
    if (!btn) return;
    
    if (!currentRiff || !currentRiff.lessonVideo) {
        btn.style.display = 'none';
        return;
    }
    btn.style.display = 'flex';
    
    btn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        lessonModeActive = !lessonModeActive;
        btn.classList.toggle('active', lessonModeActive);
        
        const wrapper = document.getElementById('videoWrapper');
        const timeline = document.querySelector('.riff-timeline');
        const segmentCtrls = document.querySelector('.segment-controls-container');
        const videoTopCtrls = document.querySelector('.video-top-controls');
        const videoBelowCtrls = document.querySelector('.video-controls-below');
        
        if (lessonModeActive) {
            wrapper.classList.add('lesson-mode');
            if (leftVideo) { leftVideo.style.display = 'none'; leftVideo.pause(); }
            if (rightVideo) { rightVideo.style.display = 'none'; rightVideo.pause(); }
            if (lessonVideoEl) {
                lessonVideoEl.style.display = 'block';
                lessonVideoEl.style.opacity = '1';
                lessonVideoEl.currentTime = 0;
                isPlaying = true;
                updatePlayButtonState();
                lessonVideoEl.play().catch(function() {
                    isPlaying = false;
                    updatePlayButtonState();
                });
            }
            if (timeline) timeline.style.display = 'none';
            if (segmentCtrls) segmentCtrls.style.display = 'none';
            if (videoTopCtrls) videoTopCtrls.style.display = 'none';
            if (videoBelowCtrls) videoBelowCtrls.style.display = 'none';
        } else {
            wrapper.classList.remove('lesson-mode');
            if (leftVideo) leftVideo.style.display = '';
            if (rightVideo) rightVideo.style.display = '';
            if (lessonVideoEl) {
                lessonVideoEl.style.display = 'none';
                lessonVideoEl.pause();
            }
            if (timeline) timeline.style.display = '';
            if (segmentCtrls) segmentCtrls.style.display = '';
            if (videoTopCtrls) videoTopCtrls.style.display = '';
            if (videoBelowCtrls) videoBelowCtrls.style.display = '';
            isPlaying = false;
            updatePlayButtonState();
        }
    });
}

// Инициализация кнопки табов
function initTabsToggle() {
    const toggleBtn = document.getElementById('toggleTabs');
    if (!toggleBtn) return;
    
    ensureTabsOverlay();
    
    toggleBtn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        if (lessonModeActive) { showNotification(LESSON_MODE_MSG); return; }
        
        tabsVisible = !tabsVisible;
        
        if (tabsVisible) {
            // При включении пытаемся загрузить табы для текущего сегмента
            const updated = updateTabsForCurrentSegment();
            if (!updated) {
                tabsVisible = false;
                showNotification('Tab not available');
                return;
            }
            toggleBtn.classList.add('active');
            if (tabsOverlay) {
                tabsOverlay.classList.remove('hidden');
            }
        } else {
            toggleBtn.classList.remove('active');
            if (tabsOverlay) {
                tabsOverlay.classList.add('hidden');
            }
        }
    });
}

// Создание/поиск оверлея для табов
function ensureTabsOverlay() {
    if (tabsOverlay && tabsImage) return tabsOverlay;
    
    const videoWrapper = document.getElementById('videoWrapper');
    if (!videoWrapper) return null;
    
    tabsOverlay = document.querySelector('.tabs-overlay');
    if (!tabsOverlay) {
        tabsOverlay = document.createElement('div');
        tabsOverlay.className = 'tabs-overlay hidden';
        videoWrapper.appendChild(tabsOverlay);
    }
    
    tabsImage = tabsOverlay.querySelector('.tabs-image');
    if (!tabsImage) {
        tabsImage = document.createElement('img');
        tabsImage.alt = 'Guitar Tabs';
        tabsImage.className = 'tabs-image';
        tabsOverlay.appendChild(tabsImage);
    }
    
    return tabsOverlay;
}

// Построение пути к табам для текущего сегмента
function getTabsImagePathForSegment(index) {
    if (!currentRiff || !currentRiff.videoFile) return null;
    
    const videoPath = currentRiff.videoFile; // например: assets/video/led-zeppelin/black-dog/black-dog-left.mp4
    const parts = videoPath.split('/');
    if (parts.length < 4) return null;
    
    // Заменяем video -> tabs
    if (parts[1] === 'video') {
        parts[1] = 'tabs';
    } else {
        // На случай другой структуры
        const videoIndex = parts.indexOf('video');
        if (videoIndex !== -1) {
            parts[videoIndex] = 'tabs';
        }
    }
    
    // Имя файла: {segmentIndex+1}.png
    const segmentNumber = (typeof index === 'number' ? index : 0) + 1;
    parts[parts.length - 1] = segmentNumber + '.png';
    
    return parts.join('/');
}

// Обновление картинки табов под текущий сегмент
function updateTabsForCurrentSegment() {
    const overlay = ensureTabsOverlay();
    if (!overlay || !currentRiff) return false;
    if (!tabsImage) {
        tabsImage = overlay.querySelector('.tabs-image');
        if (!tabsImage) return false;
    }
    
    const path = getTabsImagePathForSegment(currentSegment || 0);
    if (!path) return false;
    
    // Сбрасываем предыдущие обработчики
    tabsImage.onload = null;
    tabsImage.onerror = null;
    
    tabsImage.onerror = () => {
        showNotification('Tab not available');
        tabsVisible = false;
        const toggleBtn = document.getElementById('toggleTabs');
        if (toggleBtn) {
            toggleBtn.classList.remove('active');
        }
        if (tabsOverlay) {
            tabsOverlay.classList.add('hidden');
        }
    };
    
    tabsImage.src = path;
    return true;
}

// Показ всплывающей нотификации
function showNotification(message) {
    try {
        const existing = document.querySelector('.notification');
        if (existing) {
            existing.remove();
        }
        
        const note = document.createElement('div');
        note.className = 'notification';
        note.textContent = message;
        document.body.appendChild(note);
        
        // Анимация появления
        requestAnimationFrame(() => {
            note.classList.add('show');
        });
        
        // Авто-скрытие
        setTimeout(() => {
            note.classList.remove('show');
            setTimeout(() => {
                note.remove();
            }, 300);
        }, 2500);
    } catch (e) {
        console.error('Error showing notification:', e);
    }
}

// Загрузка недавних риффов
function loadRecentlyPracticedRiffs() {
    const grid = document.getElementById('recentRiffsGrid');
    if (!grid) return;
    
    try {
        const state = loadAppState();
        
        if (state.recentlyPracticed && state.recentlyPracticed.length > 0) {
            grid.innerHTML = '';
            state.recentlyPracticed.slice(0, 4).forEach(function (rp) {
                var cat = riffsDatabase.find(function (r) { return r.id === rp.id; });
                var merged = Object.assign({}, rp, cat ? { isFree: !!cat.isFree } : {});
                var favEntry = (state.riffsDatabase || []).find(function (r) { return r.id === rp.id; });
                if (favEntry && typeof favEntry.isFavorite === 'boolean') {
                    merged.isFavorite = favEntry.isFavorite;
                }
                grid.appendChild(createRecentlyPracticedCard(merged));
            });
        }
    } catch (e) {
        console.error('Error loading recent riffs:', e);
    }
}

// Создание карточки недавнего риффа (та же галерея, что на app.html)
function createRecentlyPracticedCard(riffData) {
    if (!window.RiffKillerRiffGallery || typeof window.RiffKillerRiffGallery.createCard !== 'function') {
        console.error('RiffKillerRiffGallery missing; include js/riff-gallery-card.js before practice.js');
        return document.createElement('div');
    }
    return window.RiffKillerRiffGallery.createCard(riffData, {
        onNavigate: function () {
            document.body.style.opacity = '0.7';
            setTimeout(function () {
                window.location.href = 'practice.html?riff=' + riffData.id;
            }, 200);
        },
        onFavoriteClick: function (e, favBtn, riff) {
            e.stopPropagation();
            if (!window.patreonAuth || !window.patreonAuth.isAuthenticated) {
                if (typeof showFavoritesLoginModal === 'function') showFavoritesLoginModal();
                return;
            }
            favBtn.classList.toggle('active');
            riff.isFavorite = favBtn.classList.contains('active');
            favBtn.setAttribute(
                'aria-label',
                riff.isFavorite ? 'Remove from favorites' : 'Add to favorites'
            );
            var st = loadAppState();
            if (!st.riffsDatabase) st.riffsDatabase = [];
            var idx = st.riffsDatabase.findIndex(function (r) { return r.id === riff.id; });
            if (idx !== -1) st.riffsDatabase[idx].isFavorite = riff.isFavorite;
            else st.riffsDatabase.push({ id: riff.id, isFavorite: riff.isFavorite });
            saveAppState(st);
        }
    });
}
