/* One clock for both camera angles. Switching the visible angle never changes time.
 * solo (phones): with one hand on screen only that camera plays and is the clock; the hidden one waits,
 * paused. An iPhone playing and seeking two videos at once falls behind and stalls both (iPhone 11:
 * seeks of 0.2–0.8 s, the picture a second behind the sound). In Split both play, the left one leads. */
(function (root) {
    'use strict';
    // Small drift is pulled in by nudging the follower's speed; a seek stalls the decoder
    // (back to the last keyframe), and repeated seeks on every frame of drift read as stutter.
    // A phone reports currentTime in whole frames and each camera on its own beat, so the measured drift
    // jitters by a frame or two. Every playbackRate change makes a phone (iPhone above all) re-time its
    // decoder, so following that jitter frame by frame made the visible camera stutter. The drift is
    // therefore smoothed, the speed has only three values (slower, exact, faster) with a gap between
    // starting and stopping a correction, and it changes at most a few times a second.
    const SEEK_FROM = 0.25, SEEK_COOLDOWN_MS = 2500;
    const DRIFT_SMOOTH = 0.2, NUDGE_START = 0.06, NUDGE_STOP = 0.02, NUDGE_STEP = 0.05, RATE_HOLD_MS = 400;
    class DriftNudge {
        constructor() { this.reset(); }
        reset() { this.drift = null; this.dir = 0; this.changed = -Infinity; }
        // drift > 0: the video is ahead and should run slower. Returns -1, 0 or 1 (slower, exact, faster).
        update(drift, now) {
            this.drift = this.drift == null ? drift : this.drift + (drift - this.drift) * DRIFT_SMOOTH;
            const d = this.drift, size = Math.abs(d);
            let dir = this.dir;
            if (dir === 0) { if (size >= NUDGE_START) dir = -Math.sign(d); }
            // Pulled in (or past the other way): back to the exact speed, or the other way if clearly off.
            else if (size <= NUDGE_STOP || Math.sign(d) === dir) dir = size >= NUDGE_START ? -Math.sign(d) : 0;
            if (dir !== this.dir && now - this.changed >= RATE_HOLD_MS) { this.dir = dir; this.changed = now; }
            return this.dir;
        }
        rate(base) { return Math.round(base * (1 + this.dir * NUDGE_STEP) * 1000) / 1000; }
    }
    class PracticeTransport {
        constructor(left, right, options = {}) {
            this.left = left;
            this.right = right;
            this.videos = [left, right];
            this.options = options;
            this.solo = !!options.solo;
            this.view = options.view || 'left';
            this.clock = this.solo && this.view === 'right' ? right : left;
            this.intendedPlaying = false;
            this.buffering = false;
            this.pending = false;
            this.revision = 0;
            this.rate = 1;
            this.lastSyncSeek = -Infinity;
            this.followNudge = new DriftNudge();
            // Counted for ?debug=loop: how often each camera's speed changed and the right one was re-seeked.
            this.counts = { syncSeeks: 0, rightRate: 0, leftRate: 0 };
            // How long the right camera takes to land a sync seek (seconds), learnt from the last ones.
            this.syncSeekLead = 0;
            this.syncSeekAt = null;
            // The same for the clock camera jumping to where a part's sound is.
            this.loopSeekLead = 0;
            this.loopSeekAt = null;
            // Media time advanced per check: on a phone checks are sparse (30 fps, throttled rAF).
            this.step = 0;
            this.lastTime = null;
            // Where the clock camera was at a known moment: the next part's start can then be met by a timer,
            // not by polling currentTime, which phones update in coarse steps.
            this.anchor = null;
            this.videoFrames = new Map();
            this.videos.forEach(video => {
                if (!video.requestVideoFrameCallback) return;
                const onFrame = (now, meta) => {
                    if (video === this.clock && meta && Number.isFinite(meta.mediaTime)) this.anchor = { media: meta.mediaTime, wall: meta.expectedDisplayTime || now };
                    this.videoFrames.set(video, video.requestVideoFrameCallback(onFrame));
                };
                this.videoFrames.set(video, video.requestVideoFrameCallback(onFrame));
            });
            this.listeners = [];
            const listen = (video, event, fn) => {
                video.addEventListener(event, fn);
                this.listeners.push(() => video.removeEventListener(event, fn));
            };
            this.videos.forEach(video => {
                listen(video, 'waiting', () => {
                    if (!this.intendedPlaying || video.readyState >= 3) return;
                    // A camera that waits off screen (solo) has nothing to stall.
                    if (!this.active().includes(video)) return;
                    // The right camera catching up after its own sync seek: the clock camera and the sound
                    // keep going (stopping both made the left camera stall too on every re-sync).
                    if (video !== this.clock && this.now() - this.lastSyncSeek < SEEK_COOLDOWN_MS) return;
                    // The part's own sound leads: a camera catching up after a seek must not stop it
                    // (on a phone every loop jump would cut the sound for half a second).
                    if (this.voice) return;
                    ++this.revision;
                    this.pending = false;
                    this.buffering = true;
                    this.active().forEach(v => v.pause());
                });
                const resume = () => {
                    if (this.buffering && this.intendedPlaying &&
                        this.active().every(v => v.readyState >= 3 && !v.seeking)) {
                        this.buffering = false;
                        this.play();
                    }
                };
                listen(video, 'canplay', resume);
                listen(video, 'seeked', resume);
                listen(video, 'seeked', () => {
                    if (video === this.clock) this.landed('loop');
                    else this.landed('sync');
                });
                listen(video, 'timeupdate', () => { if (video === this.clock) this.tick(); });
                listen(video, 'ended', () => {
                    if (video !== this.clock || !this.intendedPlaying) return;
                    if (options.onEnded) options.onEnded();
                });
            });
            const frame = () => {
                this.tick();
                this.frame = root.requestAnimationFrame(frame);
            };
            if (options.autoTick !== false && root.requestAnimationFrame) {
                this.frame = root.requestAnimationFrame(frame);
            }
        }
        // How long a seek took to land, learnt from the last ones: 'loop' for the clock camera, 'sync' for the follower.
        landed(kind) {
            const key = kind + 'SeekAt', lead = kind + 'SeekLead';
            if (this[key] == null) return;
            const took = (this.now() - this[key]) / 1000;
            this[key] = null;
            if (took > 0 && took < 1.5) this[lead] = this[lead] ? this[lead] * 0.5 + took * 0.5 : took;
        }
        // The cameras that play: in solo with one hand on screen only the clock.
        active() { return this.solo && this.view !== 'both' ? [this.clock] : this.videos; }
        // The camera that follows the clock, when two play.
        get follower() { return this.active().length > 1 ? this.videos.find(v => v !== this.clock) : null; }
        // Which hand is on screen: 'left', 'right' or 'both'. In solo the shown camera becomes the clock; the
        // other one is paused and is brought to the clock's time only when it is shown again.
        setView(view) {
            this.view = view === 'right' || view === 'both' ? view : 'left';
            const next = this.solo && this.view === 'right' ? this.right : this.left;
            const lead = (this.loopSeekLead || this.syncSeekLead || 0.15) * (this.clock.playbackRate || this.rate);
            if (next !== this.clock) {
                const prev = this.clock;
                const time = prev.currentTime || 0;
                this.clock = next;
                this.anchor = null;
                this.lastTime = null;
                this.followNudge.reset();
                if (this.voice) this.voice.nudge.reset();
                next.playbackRate = this.rate;
                if (this.intendedPlaying) {
                    this.loopSeekAt = this.now();
                    next.currentTime = time + lead;
                    const p = next.play();
                    if (p && p.catch) p.catch(() => {});
                } else next.currentTime = time;
            }
            const follower = this.follower;
            if (follower && this.intendedPlaying && follower.paused) {
                // Split again: the other camera starts where the clock will be once it has landed.
                this.lastSyncSeek = this.now();
                this.syncSeekAt = this.now();
                follower.playbackRate = this.clock.playbackRate || this.rate;
                follower.currentTime = this.time + lead;
                const p = follower.play();
                if (p && p.catch) p.catch(() => {});
            }
            this.videos.forEach(v => { if (!this.active().includes(v) && !v.paused) v.pause(); });
            this.applyVoice();
        }
        // In a looped part the sound loops by itself: the picture's jump back starts this much before the part's
        // end, so it lands on the part's first frame as the sound starts it again.
        loopLead() { return this.voice ? Math.min(0.5, this.loopSeekLead) * this.rate : 0; }
        get time() { return this.clock.currentTime || 0; }
        now() { return root.performance ? root.performance.now() : Date.now(); }
        // Best guess of the clock camera's time right now, never behind what it reports.
        estimate() {
            const t = this.time, a = this.anchor;
            if (!a || !this.intendedPlaying || this.clock.paused || this.clock.seeking) return t;
            const age = (this.now() - a.wall) / 1000;
            if (age < 0 || age > 0.3) return t;
            // A frame from before a seek (Safari can report one after the seek lands) says nothing about now.
            if (Math.abs(a.media - t) > 0.5) return t;
            return Math.max(t, a.media + age * (this.clock.playbackRate || this.rate));
        }
        // Calls fn when the clock camera reaches media time `time` (once; a later call replaces it).
        // Only arms within half a second, so a seek or a pause in between cannot fire a stale jump.
        at(time, fn) {
            clearTimeout(this.timer);
            this.timer = null;
            const wait = (time - this.estimate()) / (this.clock.playbackRate || this.rate || 1);
            if (wait > 0.5) return;
            this.timer = setTimeout(() => { this.timer = null; fn(); }, Math.max(0, wait * 1000));
        }
        get duration() { return Number.isFinite(this.clock.duration) ? this.clock.duration : 0; }
        setRate(rate) {
            if (!Number.isFinite(rate) || rate <= 0) return;
            this.rate = rate;
            this.followNudge.reset();
            if (this.voice) this.voice.nudge.reset();
            this.videos.forEach(v => { if (v.playbackRate !== rate) v.playbackRate = rate; });
            if (this.voice) this.voice.audio.playbackRate = rate;
        }
        // The sound of a looped part from its own file (js/part-audio.js): it ends exactly where the part
        // ends, so nothing of the next part can sound however late the jump back is. The file loops on its own
        // and is the clock while it plays: the cameras (silent) follow it. A phone needs half a second to seek
        // a video; re-seeking the sound to wherever the picture is would chop it into pieces.
        setVoice(audio, start, end) {
            this.clearVoice(true);
            this.voice = { audio, start, end, lastFix: -Infinity, nudge: new DriftNudge() };
            this.clock.muted = true;
            audio.loop = true;
            audio.playbackRate = this.rate;
            if (this.intendedPlaying) this.syncVoice(true);
        }
        // One voice at a time: the part's file while it plays, otherwise the left camera (the clock);
        // the right camera is always silent. A view change must not unmute the left camera over the part file.
        applyVoice() {
            this.videos.forEach(v => { v.muted = v !== this.clock || !!(this.voice || this.silenced); });
        }
        clearVoice(keepMuted) {
            const v = this.voice;
            if (!v) return;
            this.voice = null;
            v.audio.pause();
            this.clock.playbackRate = this.rate;
            if (!keepMuted) this.clock.muted = false;
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
            if (this.clock.seeking || this.pending) return;
            // Stopped by the system (another sound, a route change): it is the clock, so it starts again.
            if (a.paused) {
                if (this.intendedPlaying && !this.clock.paused) {
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
            const now = this.now();
            // A phone (solo) never gets its speed nudged: on an iPhone each playbackRate change stalls the
            // picture for a moment, which put it a second behind the sound within one pass. Every pass starts
            // on the part's first frame anyway, so a small drift lasts one pass at most.
            if (!this.solo) {
                v.nudge.update(drift, now);
                const rate = v.nudge.rate(this.rate);
                if (this.clock.playbackRate !== rate) { this.clock.playbackRate = rate; this.counts.leftRate++; }
            }
            if (Math.abs(drift) < 0.8 || now - v.lastFix < 3000) return;
            // Close to the part's end the jump back is about to fix it: a seek now would only add a stall.
            if (len - this.voiceOffset() < 1.5 * this.rate) return;
            v.lastFix = now;
            if (this.options.onVoice) this.options.onVoice('resync', drift);
            v.nudge.reset();
            this.clock.playbackRate = this.rate;
            this.seekVideos(v.start + this.voiceOffset());
        }
        seekVideos(target) {
            clearTimeout(this.timer);
            this.followNudge.reset();
            this.syncSeekAt = null;
            this.loopSeekAt = this.now();
            this.anchor = null;
            this.lastTime = null;
            this.active().forEach(video => { video.currentTime = target; });
            if (this.options.onTick) this.options.onTick(target);
            return target;
        }
        // The right camera follows the clock camera at the clock's own current speed: while the clock is
        // nudged to keep up with a part's sound (×1.05), a follower held to the base speed could never catch up
        // and was re-seeked every few seconds, a visible jerk whenever the right camera is on screen.
        follow() {
            const f = this.follower;
            if (!f) return;
            const drift = f.currentTime - this.time;
            const now = this.now();
            const base = this.clock.playbackRate || this.rate;
            if (Math.abs(drift) >= SEEK_FROM) {
                if (now - this.lastSyncSeek >= SEEK_COOLDOWN_MS) {
                    this.lastSyncSeek = now;
                    this.followNudge.reset();
                    if (f.playbackRate !== base) f.playbackRate = base;
                    this.counts.syncSeeks++;
                    // A phone needs a moment to land a seek while the clock keeps going: aim where it will be.
                    this.syncSeekAt = now;
                    f.currentTime = this.time + this.syncSeekLead * base;
                    return;
                }
            }
            if (this.solo) return; // see syncVoice: no speed changes on a phone
            this.followNudge.update(drift, now);
            const target = this.followNudge.rate(base);
            if (f.playbackRate !== target) { f.playbackRate = target; this.counts.rightRate++; }
        }
        seek(time) {
            if (!Number.isFinite(time)) return this.time;
            const target = Math.max(0, this.duration ? Math.min(time, this.duration) : time);
            clearTimeout(this.timer);
            this.followNudge.reset();
            this.syncSeekAt = null;
            this.loopSeekAt = null;
            if (this.voice) this.voice.nudge.reset();
            this.anchor = null;
            this.active().forEach(v => { v.currentTime = target; });
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
                this.active().forEach(v => v.pause());
                this.lastTime = null;
                const target = this.seek(time);
                const landed = v => new Promise(resolve => {
                    if (!v.seeking) return resolve();
                    const done = () => { v.removeEventListener('seeked', done); clearTimeout(timer); resolve(); };
                    const timer = setTimeout(done, 1500);
                    v.addEventListener('seeked', done);
                });
                Promise.all(this.active().map(landed)).then(() => {
                    if (revision !== this.revision) return;
                    this.pending = false;
                    this.play();
                });
                return target;
            }
            if (this.voice) {
                // The jump starts loopLead() before the part's end (the sound is about to loop): the picture goes
                // to the part's first frame, a keyframe, which a phone lands fastest, as the sound starts again.
                // Only a picture that fell behind (the sound already looped) goes to where the sound will be.
                const v = this.voice, len = v.end - v.start, at = this.voiceOffset();
                v.lastFix = this.now();
                const ahead = at < len / 2 && at > 0.1 * this.rate ? at + this.loopSeekLead * this.rate : 0;
                return this.seekVideos(time + Math.min(ahead, len / 2));
            }
            const left = this.clock;
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
            const f = this.follower;
            if (f && Math.abs(f.currentTime - this.time) > 0.04) f.currentTime = this.time;
            this.setRate(this.rate);
            // Inside the same user activation as the cameras, so Safari lets the part's sound start.
            if (this.voice) this.syncVoice(true);
            try {
                // Call both play() methods within the same user activation (mobile browsers).
                await Promise.all(this.active().map(v => v.play()));
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
            if (this.pending || this.buffering || this.clock.seeking) return;
            const now = this.time;
            // Without frame callbacks the moment currentTime changes is the best anchor there is.
            if (now !== this.lastTime && this.intendedPlaying && !this.clock.paused && !this.clock.requestVideoFrameCallback) {
                this.anchor = { media: now, wall: this.now() };
            }
            if (this.intendedPlaying && !this.clock.paused && this.lastTime != null) {
                const d = now - this.lastTime;
                if (d > 0 && d < 0.3) this.step = this.step ? this.step * 0.8 + d * 0.2 : d;
            }
            this.lastTime = now;
            const f = this.follower;
            if (f && this.intendedPlaying && !this.clock.paused && !f.paused && !f.seeking) this.follow();
            if (this.voice && this.intendedPlaying && !this.clock.paused) this.syncVoice();
            if (this.options.onTick) this.options.onTick(this.time);
        }
        destroy() {
            this.pause();
            if (this.unsilence) this.unsilence();
            this.clearVoice(true);
            this.videoFrames.forEach((handle, video) => { if (video.cancelVideoFrameCallback) video.cancelVideoFrameCallback(handle); });
            this.listeners.forEach(remove => remove());
            if (this.frame != null) root.cancelAnimationFrame(this.frame);
        }
    }
    // Shown by ?debug=loop, so a screenshot tells which build the phone ran (Safari can keep an old page).
    PracticeTransport.version = 13;
    root.PracticeTransport = PracticeTransport;
    if (typeof module !== 'undefined' && module.exports) module.exports = PracticeTransport;
})(typeof window !== 'undefined' ? window : globalThis);
