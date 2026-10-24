/* One clock for both camera angles. Switching the visible angle never changes time. */
(function (root) {
    'use strict';
    // Small drift is pulled in by nudging the follower's speed; a seek stalls the decoder
    // (back to the last keyframe), and repeated seeks on every frame of drift read as stutter.
    const NUDGE_FROM = 0.02, SEEK_FROM = 0.25, SEEK_COOLDOWN_MS = 1500, MAX_NUDGE = 0.1;
    class PracticeTransport {
        constructor(left, right, options = {}) {
            this.left = left;
            this.right = right;
            this.videos = [left, right];
            this.options = options;
            this.intendedPlaying = false;
            this.buffering = false;
            this.pending = false;
            this.revision = 0;
            this.rate = 1;
            this.lastSyncSeek = -Infinity;
            // Media time advanced per check: on a phone checks are sparse (30 fps, throttled rAF).
            this.step = 0;
            this.lastTime = null;
            // Where the clock camera was at a known moment: the next part's start can then be met by a timer,
            // not by polling currentTime, which phones update in coarse steps.
            this.anchor = null;
            if (left.requestVideoFrameCallback) {
                const onFrame = (now, meta) => {
                    if (meta && Number.isFinite(meta.mediaTime)) this.anchor = { media: meta.mediaTime, wall: meta.expectedDisplayTime || now };
                    this.videoFrame = left.requestVideoFrameCallback(onFrame);
                };
                this.videoFrame = left.requestVideoFrameCallback(onFrame);
            }
            this.listeners = [];
            const listen = (video, event, fn) => {
                video.addEventListener(event, fn);
                this.listeners.push(() => video.removeEventListener(event, fn));
            };
            this.videos.forEach(video => {
                listen(video, 'waiting', () => {
                    if (!this.intendedPlaying || video.readyState >= 3) return;
                    // The part's own sound leads: a camera catching up after a seek must not stop it
                    // (on a phone every loop jump would cut the sound for half a second).
                    if (this.voice) return;
                    ++this.revision;
                    this.pending = false;
                    this.buffering = true;
                    this.videos.forEach(v => v.pause());
                });
                const resume = () => {
                    if (this.buffering && this.intendedPlaying &&
                        this.videos.every(v => v.readyState >= 3 && !v.seeking)) {
                        this.buffering = false;
                        this.play();
                    }
                };
                listen(video, 'canplay', resume);
                listen(video, 'seeked', resume);
            });
            listen(left, 'timeupdate', () => this.tick());
            listen(left, 'ended', () => {
                if (!this.intendedPlaying) return;
                if (options.onEnded) options.onEnded();
            });
            const frame = () => {
                this.tick();
                this.frame = root.requestAnimationFrame(frame);
            };
            if (options.autoTick !== false && root.requestAnimationFrame) {
                this.frame = root.requestAnimationFrame(frame);
            }
        }
        get time() { return this.left.currentTime || 0; }
        now() { return root.performance ? root.performance.now() : Date.now(); }
        // Best guess of the clock camera's time right now, never behind what it reports.
        estimate() {
            const t = this.time, a = this.anchor;
            if (!a || !this.intendedPlaying || this.left.paused || this.left.seeking) return t;
            const age = (this.now() - a.wall) / 1000;
            if (age < 0 || age > 0.3) return t;
            // A frame from before a seek (Safari can report one after the seek lands) says nothing about now.
            if (Math.abs(a.media - t) > 0.5) return t;
            return Math.max(t, a.media + age * (this.left.playbackRate || this.rate));
        }
        // Calls fn when the clock camera reaches media time `time` (once; a later call replaces it).
        // Only arms within half a second, so a seek or a pause in between cannot fire a stale jump.
        at(time, fn) {
            clearTimeout(this.timer);
            this.timer = null;
            const wait = (time - this.estimate()) / (this.left.playbackRate || this.rate || 1);
            if (wait > 0.5) return;
            this.timer = setTimeout(() => { this.timer = null; fn(); }, Math.max(0, wait * 1000));
        }
        get duration() { return Number.isFinite(this.left.duration) ? this.left.duration : 0; }
        setRate(rate) {
            if (!Number.isFinite(rate) || rate <= 0) return;
            this.rate = rate;
            this.videos.forEach(v => { v.playbackRate = rate; });
            if (this.voice) this.voice.audio.playbackRate = rate;
        }
        // The sound of a looped part from its own file (js/part-audio.js): it ends exactly where the part
        // ends, so nothing of the next part can sound however late the jump back is. The file loops on its own
        // and is the clock while it plays: the cameras (silent) follow it. A phone needs half a second to seek
        // a video; re-seeking the sound to wherever the picture is would chop it into pieces.
        setVoice(audio, start, end) {
            this.clearVoice(true);
            this.voice = { audio, start, end, lastFix: -Infinity };
            this.left.muted = true;
            audio.loop = true;
            audio.playbackRate = this.rate;
            if (this.intendedPlaying) this.syncVoice(true);
        }
        clearVoice(keepMuted) {
            const v = this.voice;
            if (!v) return;
            this.voice = null;
            v.audio.pause();
            this.left.playbackRate = this.rate;
            if (!keepMuted) this.left.muted = false;
        }
        // Where the picture should be inside the part, by the sound.
        voiceOffset() {
            const v = this.voice, len = v.end - v.start, at = v.audio.currentTime || 0;
            return Math.max(0, Math.min(len, at));
        }
        // starting: place the sound where the picture is and start it (play, a user seek).
        // Otherwise only the picture is corrected, and only when it is clearly off.
        syncVoice(starting) {
            const v = this.voice;
            if (!v) return;
            const a = v.audio, len = v.end - v.start, t = this.time - v.start;
            if (starting) {
                if (t >= 0 && t < len) a.currentTime = t;
                else a.currentTime = 0;
                if (this.intendedPlaying && a.paused) {
                    const p = a.play();
                    // Sound refused (autoplay rules): the clock camera carries it again.
                    if (p && p.catch) p.catch(() => { if (this.voice === v) this.clearVoice(); });
                }
                return;
            }
            if (this.left.seeking || this.pending) return;
            // Stopped by the system (another sound, a route change): it is the clock, so it starts again.
            if (a.paused) {
                if (this.intendedPlaying && !this.left.paused) {
                    const p = a.play();
                    if (p && p.catch) p.catch(() => {});
                    if (this.options.onVoice) this.options.onVoice('restart');
                }
                return;
            }
            let drift = t - this.voiceOffset();
            if (drift > len / 2) drift -= len;
            if (drift < -len / 2) drift += len;
            // Small drift: the clock camera runs a little faster or slower (no seek: a phone stalls the
            // picture for half a second on every seek). Only a big gap is closed by a seek.
            const nudge = Math.abs(drift) < 0.04 ? 0 : Math.max(-0.08, Math.min(0.08, drift));
            const rate = Math.round(this.rate * (1 - nudge) * 1000) / 1000;
            if (this.left.playbackRate !== rate) this.left.playbackRate = rate;
            const now = this.now();
            if (Math.abs(drift) < 0.8 || now - v.lastFix < 3000) return;
            v.lastFix = now;
            if (this.options.onVoice) this.options.onVoice('resync', drift);
            this.left.playbackRate = this.rate;
            this.seekVideos(v.start + this.voiceOffset());
        }
        seekVideos(target) {
            clearTimeout(this.timer);
            this.anchor = null;
            this.lastTime = null;
            this.videos.forEach(video => { video.currentTime = target; });
            if (this.options.onTick) this.options.onTick(target);
            return target;
        }
        follow() {
            const drift = this.right.currentTime - this.time;
            const now = root.performance ? root.performance.now() : Date.now();
            if (Math.abs(drift) >= SEEK_FROM && now - this.lastSyncSeek >= SEEK_COOLDOWN_MS) {
                this.lastSyncSeek = now;
                this.right.playbackRate = this.rate;
                this.right.currentTime = this.time;
                return;
            }
            const nudge = Math.abs(drift) < NUDGE_FROM ? 0 : Math.max(-MAX_NUDGE, Math.min(MAX_NUDGE, drift));
            const target = Math.round(this.rate * (1 - nudge) * 1000) / 1000;
            if (this.right.playbackRate !== target) this.right.playbackRate = target;
        }
        seek(time) {
            if (!Number.isFinite(time)) return this.time;
            const target = Math.max(0, this.duration ? Math.min(time, this.duration) : time);
            clearTimeout(this.timer);
            this.anchor = null;
            this.videos.forEach(v => { v.currentTime = target; });
            if (this.voice) {
                const t = target - this.voice.start;
                if (t >= 0 && t < this.voice.end - this.voice.start) this.voice.audio.currentTime = t;
                this.voice.lastFix = this.now();
            }
            if (this.options.onTick) this.options.onTick(target);
            return target;
        }
        // Jumping back to the start of a looped part. Phones keep playing the old audio until
        // the seek lands, so the clock camera is silent for that moment.
        // hard: stop both cameras first, seek, and start again once the seek has landed. Pausing is the one
        // thing that silences a phone at once (iOS keeps sounding while it seeks); costs a short gap.
        loopTo(time, hard) {
            clearTimeout(this.timer);
            this.anchor = null;
            if (hard && this.intendedPlaying && !this.pending) {
                const revision = ++this.revision;
                this.pending = true;
                this.videos.forEach(v => v.pause());
                this.lastTime = null;
                const target = this.seek(time);
                const landed = v => new Promise(resolve => {
                    if (!v.seeking) return resolve();
                    const done = () => { v.removeEventListener('seeked', done); clearTimeout(timer); resolve(); };
                    const timer = setTimeout(done, 1500);
                    v.addEventListener('seeked', done);
                });
                Promise.all(this.videos.map(landed)).then(() => {
                    if (revision !== this.revision) return;
                    this.pending = false;
                    this.play();
                });
                return target;
            }
            if (this.voice) {
                // The sound has looped by itself (or is about to): the picture goes to where the sound is.
                const v = this.voice, len = v.end - v.start, at = this.voiceOffset();
                v.lastFix = this.now();
                return this.seekVideos(time + (at < len / 2 ? at : 0));
            }
            const left = this.left;
            if (!left.muted && !this.silenced) {
                this.silenced = true;
                left.muted = true;
                const restore = () => {
                    left.removeEventListener('seeked', restore);
                    clearTimeout(timer);
                    if (this.silenced) { this.silenced = false; if (!this.voice) left.muted = false; }
                };
                const timer = setTimeout(restore, 1000);
                left.addEventListener('seeked', restore);
                this.unsilence = restore;
            }
            this.lastTime = null;
            return this.seek(time);
        }
        async play() {
            const revision = ++this.revision;
            this.intendedPlaying = true;
            this.buffering = false;
            this.pending = true;
            if (Math.abs(this.right.currentTime - this.time) > 0.04) this.right.currentTime = this.time;
            this.setRate(this.rate);
            // Inside the same user activation as the cameras, so Safari lets the part's sound start.
            if (this.voice) this.syncVoice(true);
            try {
                // Call both play() methods within the same user activation (mobile browsers).
                await Promise.all(this.videos.map(v => v.play()));
                if (revision !== this.revision) return false;
                this.pending = false;
                if (this.options.onState) this.options.onState(true);
                return true;
            } catch (error) {
                if (revision !== this.revision) return false;
                this.pause();
                if (this.options.onError) this.options.onError(error);
                return false;
            }
        }
        pause() {
            ++this.revision;
            clearTimeout(this.timer);
            this.intendedPlaying = false;
            this.pending = false;
            this.buffering = false;
            this.videos.forEach(v => v.pause());
            if (this.voice) this.voice.audio.pause();
            if (this.options.onState) this.options.onState(false);
        }
        tick() {
            // The left camera is the clock: a catch-up seek of the right one must not stop the loop check.
            if (this.pending || this.buffering || this.left.seeking) return;
            const now = this.time;
            // Without frame callbacks the moment currentTime changes is the best anchor there is.
            if (now !== this.lastTime && this.intendedPlaying && !this.left.paused && !this.left.requestVideoFrameCallback) {
                this.anchor = { media: now, wall: this.now() };
            }
            if (this.intendedPlaying && !this.left.paused && this.lastTime != null) {
                const d = now - this.lastTime;
                if (d > 0 && d < 0.3) this.step = this.step ? this.step * 0.8 + d * 0.2 : d;
            }
            this.lastTime = now;
            if (this.intendedPlaying && !this.left.paused && !this.right.paused && !this.right.seeking) this.follow();
            if (this.voice && this.intendedPlaying && !this.left.paused) this.syncVoice();
            if (this.options.onTick) this.options.onTick(this.time);
        }
        destroy() {
            this.pause();
            if (this.unsilence) this.unsilence();
            this.clearVoice(true);
            if (this.videoFrame != null && this.left.cancelVideoFrameCallback) this.left.cancelVideoFrameCallback(this.videoFrame);
            this.listeners.forEach(remove => remove());
            if (this.frame != null) root.cancelAnimationFrame(this.frame);
        }
    }
    root.PracticeTransport = PracticeTransport;
    if (typeof module !== 'undefined' && module.exports) module.exports = PracticeTransport;
})(typeof window !== 'undefined' ? window : globalThis);
