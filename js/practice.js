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
        duration: 17.136,
        difficulty: "intermediate",
        genre: "rock",
        isFree: true,
        segments: [
    {
        "start": 0,
        "end": 1.6,
        "name": "Shot 1",
        "color": "#9355E5"
    },
    {
        "start": 1.7,
        "end": 3.44,
        "name": "Shot 2",
        "color": "#9355E5"
    },
    {
        "start": 3.64,
        "end": 5.56,
        "name": "Shot 3",
        "color": "#9355E5"
    },
    {
        "start": 5.992,
        "end": 7.42,
        "name": "Shot 4",
        "color": "#9355E5"
    },
    {
        "start": 7.588,
        "end": 9.1,
        "name": "Shot 5",
        "color": "#9355E5"
    },
    {
        "start": 9.212,
        "end": 10.836,
        "name": "Shot 6",
        "color": "#9355E5"
    },
    {
        "start": 11.06,
        "end": 11.816,
        "name": "Shot 7",
        "color": "#9355E5"
    },
    {
        "start": 11.817,
        "end": 13.44,
        "name": "Shot 8",
        "color": "#9355E5"
    },
    {
        "start": 13.441,
        "end": 15.316,
        "name": "Shot 9",
        "color": "#9355E5"
    },
    {
        "start": 15.456,
        "end": 17.136,
        "name": "Shot 10",
        "color": "#9355E5"
    }
],
        isFavorite: true,
        lastPracticed: null
    }
];

let currentRiff = null;
let leftVideo = null;
let practiceTransport = null;
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
// Riff Killer 2.0: per-riff progress + practice modes
const RK_PROGRESS_KEY = 'riffKillerProgressV1';
let practiceMode = 'normal'; // normal | speed
let normalPracticeSettings = null;
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
    if (practiceTransport) practiceTransport.setRate(speed);
    document.querySelectorAll('.speed-btn').forEach(function(b) {
        const s = parseFloat(b.dataset.speed);
        const active = !isNaN(s) && Math.abs(s - speed) < 0.001;
        b.classList.toggle('active', active);
        b.setAttribute('aria-pressed', String(active));
    });
    updateSpeedTrainerTimelineLabel();
}

function setPracticeMode(mode) {
    const nextMode = mode === 'speed' ? 'speed' : 'normal';
    if (nextMode === practiceMode) return;
    if (nextMode === 'speed') {
        normalPracticeSettings = { speed: playbackSpeed, loop: loopActive, all: loopAllRiff };
        // The ladder operates on the current segment, including after All Riff.
        loopAllRiff = false;
    }
    practiceMode = nextMode;
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
        if (normalPracticeSettings) {
            setPlaybackSpeedUI(normalPracticeSettings.speed);
            loopActive = normalPracticeSettings.loop;
            loopAllRiff = normalPracticeSettings.all;
            normalPracticeSettings = null;
        }
    }
    const loopButton = document.getElementById('loopButton');
    if (loopButton) {
        loopButton.classList.toggle('active', loopActive);
        loopButton.setAttribute('aria-pressed', String(loopActive));
    }
    updateSegmentButtons();
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

// Readiness means both fully downloaded recordings can decode, not metadata alone.
let practiceMediaLoader = null;
let mediaPreparation = null;
function waitForVideosReady() {
    return new Promise((resolve, reject) => {
        const videos = [leftVideo, rightVideo];
        const cleanup = () => {
            clearTimeout(timeout);
            videos.forEach(v => { v.removeEventListener('canplay', check); v.removeEventListener('error', fail); });
        };
        const check = () => {
            if (videos.every(v => v.readyState >= 3)) { cleanup(); resolve(true); }
        };
        const fail = () => { cleanup(); reject(new Error('Recording could not be decoded')); };
        const timeout = setTimeout(fail, 30000);
        videos.forEach(v => { v.addEventListener('canplay', check); v.addEventListener('error', fail); });
        check();
    });
}
function showVideoLoadingPlaceholder() {
    enableControls(false);
    const wrapper = document.getElementById('videoWrapper');
    const placeholder = document.getElementById('videoLoadingPlaceholder');
    if (placeholder) { placeholder.style.display = 'flex'; placeholder.setAttribute('aria-hidden', 'false'); }
    document.getElementById('videoLoadingProgress').style.width = '0%';
    document.getElementById('videoLoadingText').textContent = 'Preparing both cameras…';
    document.getElementById('videoLoadingDetail').textContent = 'Downloading the full riff for smooth loops and seeking.';
    document.getElementById('videoErrorState').style.display = 'none';
    document.getElementById('videoOverlay').classList.add('hidden');
    if (wrapper) { wrapper.classList.add('video-loading'); wrapper.setAttribute('aria-busy', 'true'); }
}
function updateMediaLoadProgress(state) {
    const percent = state.total ? Math.min(100, Math.floor(state.loaded / state.total * 100)) : null;
    const mb = bytes => (bytes / 1048576).toFixed(1) + ' MB';
    const complete = state.items.every(item => item.done);
    const text = complete ? 'Preparing playback…' : 'Downloading both cameras' + (percent === null ? '…' : ' · ' + percent + '%');
    document.getElementById('videoLoadingText').textContent = text;
    document.getElementById('videoLoadingProgress').style.width = (percent === null ? 0 : percent) + '%';
    document.getElementById('videoLoadingDetail').textContent = state.items.map(item =>
        item.label + ': ' + (item.done ? 'downloaded' : mb(item.loaded) + (item.total ? ' / ' + mb(item.total) : ''))
    ).join(' · ');
    const progress = document.getElementById('videoLoadMeter');
    if (percent === null) progress.removeAttribute('aria-valuenow');
    else progress.setAttribute('aria-valuenow', String(percent));
}
async function preparePracticeMedia() {
    if (practiceMediaLoader) practiceMediaLoader.destroy();
    practiceMediaLoader = new PracticeMediaLoader({onProgress: updateMediaLoadProgress});
    const right = currentRiff.videoFileRight || currentRiff.videoFile;
    const paths = [currentRiff.videoFile, right];
    const urls = await practiceMediaLoader.load(paths.map((path, i) => ({
        label: i ? 'Right hand' : 'Left hand',
        sources: [buildVideoSrcDirect(path), buildVideoSrc(path)]
    })));
    [leftVideo, rightVideo].forEach((video, i) => { video.src = urls[i]; video.load(); });
    await waitForVideosReady();
    document.getElementById('practiceMediaStatus').textContent = 'Both cameras ready · full riff downloaded';
}

function hideVideoLoadingPlaceholder() {
    const placeholder = document.getElementById('videoLoadingPlaceholder');
    const wrapper = document.getElementById('videoWrapper');
    const overlay = document.getElementById('videoOverlay');
    if (placeholder) { placeholder.style.display = 'none'; placeholder.setAttribute('aria-hidden', 'true'); }
    if (wrapper) {
        wrapper.classList.remove('video-loading');
        wrapper.setAttribute('aria-busy', 'false');
        wrapper.style.backgroundImage = '';
        wrapper.style.background = '';
    }
    if (overlay) overlay.classList.remove('hidden');
}

function showVideoErrorState() {
    const placeholder = document.getElementById('videoLoadingPlaceholder');
    const errorEl = document.getElementById('videoErrorState');
    if (placeholder) placeholder.style.display = 'none';
    if (errorEl) { errorEl.style.display = 'flex'; errorEl.setAttribute('aria-hidden', 'false'); }
    document.getElementById('videoWrapper')?.setAttribute('aria-busy', 'false');
    const status = document.getElementById('practiceMediaStatus');
    if (status) status.textContent = 'Download interrupted · Retry to prepare both cameras';
}

function hideVideoErrorState() {
    const errorEl = document.getElementById('videoErrorState');
    if (errorEl) { errorEl.style.display = 'none'; errorEl.setAttribute('aria-hidden', 'true'); }
}

// Controls are always clickable; this flag gates actual video-seeking logic
function enableControls(enable) {
    videosFullyLoaded = enable;
    document.querySelectorAll('#playButton, .control-btn, .speed-btn, .practice-mode-btn').forEach(button => { button.disabled = !enable; });
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
            currentRiff = null;
        }
        if (!currentRiff) {
            var el = document.querySelector('.breadcrumb-current');
            if (el) el.textContent = 'Riff not found';
            showVideoErrorState();
            return;
        }
        if (currentRiff.segments && currentRiff.segments.length) {
            console.log('[RiffKiller] SEGMENTS_FROM_DATA (admin timing):', JSON.stringify(currentRiff.segments.map(function(s, i) { return (i + 1) + ': ' + Number(s.start) + '-' + Number(s.end); })));
        }
        addToRecentlyPracticed(currentRiff);
        rkMarkLastPracticed(currentRiff.id);
        updateTitle();
        videosFullyLoaded = false;
        // The tab library goes ahead of the two video downloads that start next.
        if (window.TabLive && TabLive.hasTab(currentRiff)) TabLive.preload();
        initVideoPlayers();
        showVideoLoadingPlaceholder();
        initControls();
        initSpeedControls();
        initPracticeTools();
        initLessonMode();
        initTabsToggle();
        loadRecentlyPracticedRiffs();
        mediaPreparation
            .then(function() {
                videosFullyLoaded = true;
                initTimeline();
                initSegmentControls();
                if (window.RiffDNA) window.RiffDNA.init(currentRiff);
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
                if (practiceTransport) practiceTransport.pause();
                videosFullyLoaded = false;
                preparePracticeMedia()
                    .then(function() {
                        videosFullyLoaded = true;
                        initTimeline();
                        initSegmentControls();
                        if (window.RiffDNA) window.RiffDNA.init(currentRiff);
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
        if (!currentRiff.isFree && !hasPremiumAccess) {
            showPatreonUpgradeModal();
        }
    }

    Promise.resolve(window.authManager && window.authManager.ready).then(function() {
        return fetch('/api/riffs/list.php').then(function(r) { if (!r.ok) throw new Error('Riff list unavailable'); return r.json(); });
    }).then(function(list) {
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
        // Пустой span показывает заглушку-полоску (components.css), а не текст «Loading...»
        currentElement.textContent = '';
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
    
    if (practiceTransport) practiceTransport.destroy();
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
        lessonVideoEl.setAttribute('preload', 'none');
        lessonVideoEl.muted = false;
        lessonVideoEl.style.display = 'none';
        lessonVideoEl.addEventListener('ended', function() {
            if (lessonModeActive) { isPlaying = false; updatePlayButtonState(); }
        });
        videoWrapper.appendChild(lessonVideoEl);
    } else {
        lessonVideoEl = null;
    }
    
    // Begin after the loading UI is attached; both recordings remain in local blobs.
    mediaPreparation = Promise.resolve().then(preparePracticeMedia);
    if (lessonVideoEl) lessonVideoEl.src = buildVideoSrcDirect(currentRiff.lessonVideo);
    isInitialized = true;

    practiceTransport = new PracticeTransport(leftVideo, rightVideo, {
        onTick: updateVideoProgress,
        onEnded: handleVideoEnd,
        onState: function(playing) {
            isPlaying = playing;
            updatePlayButtonState();
            updateSegmentButtons();
        },
        onError: function() { showNotification('Playback could not start. Please press Play again.'); },
        onVoice: function(kind, drift) { if (loopDebug) loopDebug.voice(kind, drift); }
    });
    practiceTransport.setRate(playbackSpeed);


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
        ['left', 'right', 'split'].forEach(view => videoWrapper.classList.toggle(view + '-mode', view === mode));
    }

    // Sound always comes from the left camera (the clock); both angles are crops of one take.
    // Moving audio between elements on every switch restarts the audio clock and makes the pair drift.
    const show = {left: [1, 0], right: [0, 1], split: [1, 1]}[mode] || [1, 0];
    [leftVideo, rightVideo].forEach((video, i) => {
        video.style.opacity = String(show[i]);
        video.style.pointerEvents = show[i] ? 'auto' : 'none';
    });
    leftVideo.muted = false;
    rightVideo.muted = true;
}

// Сообщение при попытке использовать управление в lesson mode
const LESSON_MODE_MSG = 'В режиме Lesson mode управление риффом недоступно. Отожмите кнопку Lesson mode.';

// Переключение воспроизведения
function togglePlayback() {
    if (lessonModeActive && lessonVideoEl) {
        if (lessonVideoEl.paused) {
            lessonVideoEl.play().then(() => { isPlaying = true; updatePlayButtonState(); })
                .catch(() => { isPlaying = false; updatePlayButtonState(); });
        } else {
            lessonVideoEl.pause();
            isPlaying = false;
        }
        updatePlayButtonState();
        return;
    }
    if (!practiceTransport || !videosFullyLoaded) return;
    if (practiceTransport.intendedPlaying) practiceTransport.pause();
    else practiceTransport.play();

}

// Обновление кнопки play
function updatePlayButtonState() {
    const playControl = document.getElementById('playControl');
    const overlay = document.getElementById('videoOverlay');
    const wrapper = document.getElementById('videoWrapper');
    
    if (playControl) {
        playControl.setAttribute('aria-label', isPlaying ? 'Pause' : 'Play');
        playControl.setAttribute('data-tip', isPlaying ? 'Pause' : 'Play');
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
    if (!practiceTransport) return;
    practiceTransport.seek(practiceTransport.time + seconds);
    updateCurrentSegmentFromTime();
}

// A looped part sounds from its own short file cut from the riff's sound (js/part-audio.js), so Safari,
// which keeps playing a video's sound for a moment after a seek, cannot let the next part through.
const partAudio = typeof PartAudio !== 'undefined' ? new PartAudio() : null;
let partVoice = null, partVoiceKey = '', partVoiceTransport = null, partVoiceUnlocked = false;
function syncPartVoice() {
    if (!partAudio || !practiceTransport || !leftVideo || !leftVideo.src) return;
    if (partVoiceTransport !== practiceTransport) { partVoiceTransport = practiceTransport; partVoiceKey = ''; }
    const segment = currentRiff && currentSegment >= 0 ? currentRiff.segments[currentSegment] : null;
    if (!segment || !loopActive || loopAllRiff || lessonModeActive) {
        if (partVoiceKey) { partVoiceKey = ''; practiceTransport.clearVoice(); }
        return;
    }
    const start = getSegmentStartRaw(segment), end = getSegmentEndRaw(segment);
    const key = leftVideo.src + '|' + start + '|' + end;
    if (key === partVoiceKey) return;
    partVoiceKey = key;
    // The video carries the sound until the part's file is ready (a few ms once the riff is decoded).
    practiceTransport.clearVoice();
    partAudio.clip(leftVideo.src, start, end).then(url => {
        if (partVoiceKey !== key || !url) return;
        if (!partVoice) partVoice = makePartVoice();
        partVoice.src = url;
        practiceTransport.setVoice(partVoice, start, end);
    });
}
function makePartVoice() {
    const audio = new Audio();
    audio.preload = 'auto';
    audio.setAttribute('playsinline', '');
    // With ?debug=loop: when the part's sound stops or stalls, and when it plays again.
    ['pause', 'playing', 'waiting', 'stalled'].forEach(type => audio.addEventListener(type, () => {
        if (loopDebug && practiceTransport && practiceTransport.voice && practiceTransport.voice.audio === audio) loopDebug.voice(type);
    }));
    return audio;
}
// Safari lets an element play sound on its own only after it has played once from a tap or a key.
function unlockPartVoice() {
    if (!partAudio) return;
    // A refused start (the voice was dropped) is tried again after this gesture.
    if (practiceTransport && !practiceTransport.voice) partVoiceKey = '';
    if (partVoiceUnlocked) return;
    if (!partVoice) partVoice = makePartVoice();
    if (partVoice.src) { partVoiceUnlocked = true; return; }
    const silent = PartAudio.wav({ sampleRate: 8000, numberOfChannels: 1, length: 80, getChannelData: () => new Float32Array(80) }, 0, 0.01);
    partVoice.src = URL.createObjectURL(silent);
    const p = partVoice.play();
    if (p && p.then) p.then(() => { partVoiceUnlocked = true; if (!practiceTransport || !practiceTransport.voice) partVoice.pause(); }, () => {});
}
['pointerdown', 'touchend', 'keydown'].forEach(type => document.addEventListener(type, unlockPartVoice, true));

// Left camera is the clock in every display mode; tabs follow it in All Riff too.
function updateVideoProgress() {
    syncPartVoice();
    if (!leftVideo || !rightVideo || !currentRiff || lessonModeActive) return;
    const time = leftVideo.currentTime;
    updateTimelineProgress(time);
    if (!window._jumpToSegmentInProgress && !(loopActive && !loopAllRiff)) {
        updateCurrentSegmentFromTime();
    }
    checkSegmentBoundary();
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
    if (!currentRiff || index < 0 || index >= currentRiff.segments.length) return;
    if (!videosFullyLoaded || !practiceTransport) {
        pendingSegmentIndex = index;
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
    window._jumpToSegmentInProgress = true;
    practiceTransport.seek(getSegmentStartRaw(currentRiff.segments[index]));
    window._jumpToSegmentInProgress = false;
    updateSegmentButtons();
}

// Shared action for segment buttons, Molecules and Atoms (never toggles a playing atom off).
function playPracticeSegment(index, options) {
    options = options || {};
    if (lessonModeActive) { showNotification(LESSON_MODE_MSG); return; }
    if (options.view) setVideoMode(options.view);
    if (options.speed) { setPracticeMode('normal'); setPlaybackSpeedUI(options.speed); }
    jumpToSegment(index);
    loopActive = true;
    loopAllRiff = false;
    var button = document.getElementById('loopButton');
    if (button) button.classList.add('active');
    if (practiceTransport && videosFullyLoaded) practiceTransport.play();
}

// Обновление текущего сегмента
function updateCurrentSegmentFromTime() {
    if (!currentRiff || !leftVideo || window._jumpToSegmentInProgress) return;
    
    const currentTime = leftVideo.currentTime;
    
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
// Stopping before the seek did not help on iPhone and added a long gap, so every device seeks while playing.
const HARD_LOOP = false;
function loopSegmentEnd() {
    if (!currentRiff || !practiceTransport || !practiceTransport.intendedPlaying ||
        practiceTransport.pending || practiceTransport.buffering ||
        leftVideo.seeking || leftVideo.paused || !loopActive || loopAllRiff || currentSegment < 0) return null;
    const segment = currentRiff.segments[currentSegment];
    // One frame early, so the first note of the next part never starts before the jump.
    return segment ? getSegmentEndRaw(segment) - 0.02 * (practiceTransport.rate || 1) : null;
}
function loopBack(byTimer) {
    if (loopSegmentEnd() == null) return;
    const segment = currentRiff.segments[currentSegment];
    if (loopDebug) loopDebug.jump(segment, byTimer === true);
    speedTrainerOnLoop(currentSegment);
    practiceTransport.loopTo(getSegmentStartRaw(segment), HARD_LOOP);
}

// ?debug=loop: what the loop sees on this device, one line per pass, to compare with what is heard.
const LOOP_DEBUG = new URLSearchParams(location.search).get('debug') === 'loop';
let loopDebug = null;
function makeLoopDebug() {
    const box = document.createElement('pre');
    box.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:99999;margin:0;padding:6px 8px;max-height:45vh;overflow:auto;' +
        'background:rgba(0,0,0,.85);color:#b8f05a;font:11px/1.35 ui-monospace,Menlo,monospace;white-space:pre-wrap;pointer-events:none';
    document.body.appendChild(box);
    const lines = [], ticks = [];
    let last = 0, n = 0, seekAt = 0, pending = null, maxPast = 0;
    // How often currentTime itself moves on this device (wall ms between changes).
    let seenTime = -1, seenAt = 0;
    const gaps = [];
    const session = Math.random().toString(36).slice(2, 8);
    const send = (kind, data) => {
        const body = JSON.stringify(Object.assign({ debug: 'loop', kind, session, riff: currentRiff && currentRiff.id, part: currentSegment }, data));
        try {
            if (!(navigator.sendBeacon && navigator.sendBeacon('api/debug/loop-log.php', new Blob([body], { type: 'application/json' }))))
                fetch('api/debug/loop-log.php', { method: 'POST', body, headers: { 'Content-Type': 'application/json' }, keepalive: true }).catch(() => {});
        } catch (e) {}
    };
    const stats = () => {
        const avg = list => list.length ? Math.round(list.reduce((a, b) => a + b, 0) / list.length) : 0;
        return { checkMs: avg(ticks), timeStepMs: avg(gaps), timeStepMaxMs: gaps.length ? Math.round(Math.max(...gaps)) : 0,
            rVFC: !!leftVideo.requestVideoFrameCallback, rate: practiceTransport ? practiceTransport.rate : 1,
            leftMuted: leftVideo.muted, rightMuted: rightVideo.muted, mode: currentMode, sound: soundSource(),
            video: currentRiff ? [currentRiff.videoFile, currentRiff.videoFileRight] : [], duration: [leftVideo.duration, rightVideo.duration] };
    };
    // Where the sound comes from: the part's own file, the video, or nowhere (file not ready, play refused).
    const soundSource = () => {
        const v = practiceTransport && practiceTransport.voice;
        if (v) return v.audio.paused ? 'part file (paused)' : 'part file';
        return leftVideo.muted ? 'none' : 'video';
    };
    const env = 'rVFC ' + (leftVideo.requestVideoFrameCallback ? 'yes' : 'no') + ' · ' + navigator.userAgent.replace(/^.*?\(([^)]*)\).*$/, '$1').slice(0, 40);
    const show = () => {
        const avg = ticks.length ? ticks.reduce((a, b) => a + b, 0) / ticks.length : 0;
        box.textContent = env + ' · check every ' + avg.toFixed(0) + ' ms · sound: ' + soundSource() +
            ' · rate ' + (practiceTransport ? practiceTransport.rate : 1) + '\n' + lines.join('\n');
    };
    setInterval(() => {
        // Furthest the clock camera got past the part's end while playing: should stay 0.
        if (!currentRiff || currentSegment < 0 || !loopActive || loopAllRiff || leftVideo.paused || leftVideo.seeking) return;
        const seg = currentRiff.segments[currentSegment];
        if (seg) maxPast = Math.max(maxPast, leftVideo.currentTime - seg.end);
        const t = leftVideo.currentTime, now = performance.now();
        if (t !== seenTime) {
            if (seenAt && t > seenTime && t - seenTime < 0.5) { gaps.push(now - seenAt); if (gaps.length > 60) gaps.shift(); }
            seenTime = t; seenAt = now;
        }
    }, 5);
    send('start', stats());
    leftVideo.addEventListener('seeking', () => { seekAt = performance.now(); });
    leftVideo.addEventListener('seeked', () => {
        if (!pending) return;
        pending.seek = performance.now() - seekAt;
        pending.landed = leftVideo.currentTime;
        send('pass', Object.assign({ n: pending.n, end: pending.end, start: pending.start, jumpAt: pending.at, estimate: pending.est, by: pending.by,
            pastEnd: pending.past, seekMs: Math.round(pending.seek), landed: pending.landed, rightAt: rightVideo.currentTime,
            soundAt: practiceTransport && practiceTransport.voice ? practiceTransport.voice.audio.currentTime : null }, stats()));
        setTimeout(() => { if (!pending) return; const p = pending; pending = null;
            lines.unshift('#' + p.n + ' end ' + p.end.toFixed(3) + ' jump at ' + p.at.toFixed(3) + ' (' + ((p.at - p.end) * 1000).toFixed(0) + ' ms) by ' + p.by +
                ' · past end ' + (p.past * 1000).toFixed(0) + ' ms · seek ' + p.seek.toFixed(0) + ' ms → ' + p.landed.toFixed(3) + ' (start ' + p.start.toFixed(3) + ')');
            lines.length = Math.min(lines.length, 12); show(); }, 0);
    });
    return {
        tick() { const now = performance.now(); if (last) { ticks.push(now - last); if (ticks.length > 60) ticks.shift(); } last = now; },
        jump(seg, byTimer) {
            pending = { n: ++n, end: seg.end, start: seg.start, at: leftVideo.currentTime, est: practiceTransport.estimate(), by: byTimer ? 'timer' : 'check', past: Math.max(0, maxPast) };
            maxPast = 0;
            show();
        },
        voice(kind, drift) {
            const v = practiceTransport && practiceTransport.voice;
            send('voice', Object.assign({ event: kind, drift: drift == null ? null : Math.round(drift * 1000),
                soundAt: v ? v.audio.currentTime : null, videoAt: leftVideo.currentTime }, stats()));
            lines.unshift('sound ' + kind + (drift == null ? '' : ' · drift ' + Math.round(drift * 1000) + ' ms') + ' · video ' + leftVideo.currentTime.toFixed(3));
            lines.length = Math.min(lines.length, 12); show();
        }
    };
}
function checkSegmentBoundary() {
    const end = loopSegmentEnd();
    if (end == null) return;
    // The check runs once a frame (or once per coarse time update on a phone); between checks a timer
    // set from the last known frame meets the boundary on time.
    if (LOOP_DEBUG && !loopDebug && leftVideo) loopDebug = makeLoopDebug();
    if (loopDebug) loopDebug.tick();
    if (practiceTransport.estimate() >= end) loopBack(false);
    else practiceTransport.at(end, () => loopBack(true));
}

// Переключение лупа
function toggleLoop() {
    if (lessonModeActive) { showNotification(LESSON_MODE_MSG); return; }
    const nextLoop = !loopActive;
    if (practiceMode === 'speed') {
        setPracticeMode('normal');
        showNotification('Speed Trainer off — loop turned off.');
    }
    loopActive = nextLoop;
    const loopBtn = document.getElementById('loopButton');
    if (loopBtn) {
        loopBtn.classList.toggle('active', loopActive);
        loopBtn.setAttribute('aria-pressed', String(loopActive));
    }
}

// Обработка окончания видео
function handleVideoEnd() {
    if (!practiceTransport || lessonModeActive) return;
    if (loopActive) {
        const segment = currentRiff.segments[currentSegment];
        if (!loopAllRiff && segment) speedTrainerOnLoop(currentSegment);
        practiceTransport.seek(loopAllRiff || !segment ? 0 : getSegmentStartRaw(segment));
        practiceTransport.play();
    } else practiceTransport.pause();
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
    if (window.RiffDNA) window.RiffDNA.segmentChanged(currentSegment);
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
        
        if (practiceMode === 'speed') setPracticeMode('normal');
        loopAllRiff = true;
        if (leftVideo && rightVideo) {
            practiceTransport.seek(0);
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
                practiceTransport.play();
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
            if (practiceMode === 'speed') {
                _speedTrainerState.active = false;
                setPracticeMode('normal');
            }
            setPlaybackSpeedUI(speed);
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
            if (practiceTransport) practiceTransport.pause();
            if (leftVideo) leftVideo.style.display = 'none';
            if (rightVideo) rightVideo.style.display = 'none';
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
            var label = toggleBtn.querySelector('.tab-text');
            if (label) label.textContent = 'Hide Tabs';
            if (tabsOverlay) {
                tabsOverlay.classList.remove('hidden');
            }
        } else {
            toggleBtn.classList.remove('active');
            var label = toggleBtn.querySelector('.tab-text');
            if (label) label.textContent = 'Show Tabs';
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
        const frame = document.createElement('div');
        frame.className = 'tabs-frame';
        tabsImage = document.createElement('img');
        tabsImage.alt = 'Guitar Tabs';
        tabsImage.className = 'tabs-image';
        frame.appendChild(tabsImage);
        tabsOverlay.appendChild(frame);
    }
    placeTabsStrip();
    if (!placeTabsStrip.bound && window.matchMedia) {
        placeTabsStrip.bound = true;
        const query = window.matchMedia(TABS_BELOW_VIDEO);
        if (query.addEventListener) query.addEventListener('change', placeTabsStrip);
    }
    
    return tabsOverlay;
}

// Phones in portrait have room under the video, so the strip sits there and keeps the hands visible.
const TABS_BELOW_VIDEO = '(max-width: 760px) and (orientation: portrait)';
function placeTabsStrip() {
    const videoWrapper = document.getElementById('videoWrapper');
    if (!tabsOverlay || !videoWrapper) return;
    const below = !!(window.matchMedia && window.matchMedia(TABS_BELOW_VIDEO).matches);
    tabsOverlay.classList.toggle('below-video', below);
    if (below && tabsOverlay.parentElement === videoWrapper) videoWrapper.after(tabsOverlay);
    else if (!below && tabsOverlay.parentElement !== videoWrapper) videoWrapper.appendChild(tabsOverlay);
}

// Построение пути к табам для текущего сегмента
function getTabsImagePathForSegment(index) {
    if (!currentRiff || !currentRiff.videoFile) return null;
    
    const segment = currentRiff.segments[index];
    if (segment && segment.tabImage) return segment.tabImage;
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

// Live tab (alphaTab) for riffs that have a tab file; pictures stay the fallback.
let tabLive = null;
let tabLiveRiff = null;
let tabLiveFailed = false;
let tabLiveRaf = 0;

function liveTabForCurrentRiff(overlay) {
    if (!window.TabLive || !TabLive.hasTab(currentRiff) || tabLiveFailed) return null;
    if (tabLive && tabLiveRiff === currentRiff) return tabLive;
    if (tabLive) tabLive.destroy();
    let host = overlay.querySelector('.tab-live');
    if (!host) {
        host = document.createElement('div');
        host.className = 'tab-live';
        overlay.appendChild(host);
    }
    tabLiveRiff = currentRiff;
    tabLive = TabLive.create(host, currentRiff);
    tabLive.ready.catch(() => {
        tabLiveFailed = true;
        overlay.classList.remove('is-live');
        if (tabsVisible) updateTabsForCurrentSegment();
    });
    return tabLive;
}

function tabLiveTick() {
    if (!tabsVisible || !tabLive || !leftVideo) { tabLiveRaf = 0; return; }
    tabLive.update(leftVideo.currentTime);
    tabLiveRaf = requestAnimationFrame(tabLiveTick);
}

// Обновление картинки табов под текущий сегмент
function updateTabsForCurrentSegment() {
    const overlay = ensureTabsOverlay();
    if (!overlay || !currentRiff) return false;
    const live = liveTabForCurrentRiff(overlay);
    overlay.classList.toggle('is-live', !!live);
    if (live) {
        const index = currentSegment || 0;
        live.showSegment(index).then(shown => {
            if (index === (currentSegment || 0)) overlay.classList.toggle('is-idle', !shown);
        }).catch(() => {});
        if (!tabLiveRaf) tabLiveRaf = requestAnimationFrame(tabLiveTick);
        return true;
    }
    if (!tabsImage) {
        tabsImage = overlay.querySelector('.tabs-image');
        if (!tabsImage) return false;
    }
    
    const path = getTabsImagePathForSegment(currentSegment || 0);
    if (!path) return false;
    
    if (tabsImage.getAttribute('src') === path) return true;
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
    
    tabsImage.onload = () => { if (window.TabStrip) TabStrip.apply(tabsImage); };
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



window.addEventListener('pagehide', event => { if (!event.persisted && practiceMediaLoader) practiceMediaLoader.destroy(); });

// Пробел — play/pause, как в любом плеере. Иначе браузер «нажимает» последнюю кликнутую кнопку
// и оставляет на ней focus-ring. Поля ввода, редактируемый текст и открытые окна не трогаем.
(function bindSpaceToPlay() {
    function isTyping(el) {
        if (!el || !el.tagName) return false;
        if (el.isContentEditable) return true;
        if (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true;
        if (el.tagName === 'INPUT') return !/^(button|checkbox|radio|submit|reset|range)$/i.test(el.type);
        return false;
    }
    function modalOpen() {
        if (document.querySelector('.auth-modal-backdrop')) return true;
        var intro = document.getElementById('speedTrainerIntroModal');
        return !!(intro && intro.style.display !== 'none');
    }
    function isSpace(e) { return e.code === 'Space' || e.key === ' '; }
    function keyboardFocused(el) {
        try { return el && el.tagName === 'BUTTON' && el.matches(':focus-visible'); } catch (err) { return false; }
    }
    document.addEventListener('keydown', function (e) {
        if (!isSpace(e) || e.altKey || e.ctrlKey || e.metaKey || isTyping(e.target) || modalOpen()) return;
        // Вне плеера и частей кнопка, до которой дошли Tab'ом, пробелом нажимается как обычно; Enter работает везде.
        if (keyboardFocused(e.target) && !e.target.closest('.practice-player, .practice-parts')) return;
        var play = document.getElementById('playControl');
        if (!play || play.disabled || !play.offsetParent) return;
        e.preventDefault();
        if (e.repeat) return;
        var focused = document.activeElement;
        if (focused && focused.tagName === 'BUTTON') focused.blur();
        play.click();
    });
    // Кнопка срабатывает и по keyup пробела — гасим, чтобы не было второго нажатия.
    document.addEventListener('keyup', function (e) {
        if (isSpace(e) && !isTyping(e.target) && !modalOpen() && e.target && e.target.tagName === 'BUTTON'
            && !(keyboardFocused(e.target) && !e.target.closest('.practice-player, .practice-parts'))) e.preventDefault();
    });
})();
