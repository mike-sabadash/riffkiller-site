/* One clock for both camera angles. Switching the visible angle never changes time. */
(function (root) {
    'use strict';
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
            this.listeners = [];
            const listen = (video, event, fn) => {
                video.addEventListener(event, fn);
                this.listeners.push(() => video.removeEventListener(event, fn));
            };
            this.videos.forEach(video => {
                listen(video, 'waiting', () => {
                    if (!this.intendedPlaying || video.readyState >= 3) return;
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
        get duration() { return Number.isFinite(this.left.duration) ? this.left.duration : 0; }
        setRate(rate) {
            if (!Number.isFinite(rate) || rate <= 0) return;
            this.rate = rate;
            this.videos.forEach(v => { v.playbackRate = rate; });
        }
        seek(time) {
            if (!Number.isFinite(time)) return this.time;
            const target = Math.max(0, this.duration ? Math.min(time, this.duration) : time);
            this.videos.forEach(v => { v.currentTime = target; });
            if (this.options.onTick) this.options.onTick(target);
            return target;
        }
        async play() {
            const revision = ++this.revision;
            this.intendedPlaying = true;
            this.buffering = false;
            this.pending = true;
            if (Math.abs(this.right.currentTime - this.time) > 0.04) this.right.currentTime = this.time;
            this.setRate(this.rate);
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
            this.intendedPlaying = false;
            this.pending = false;
            this.buffering = false;
            this.videos.forEach(v => v.pause());
            if (this.options.onState) this.options.onState(false);
        }
        tick() {
            if (this.pending || this.buffering || this.videos.some(v => v.seeking)) return;
            if (this.intendedPlaying && !this.left.paused && !this.right.paused &&
                Math.abs(this.right.currentTime - this.time) > 0.08) {
                this.right.currentTime = this.time;
            }
            if (this.options.onTick) this.options.onTick(this.time);
        }
        destroy() {
            this.pause();
            this.listeners.forEach(remove => remove());
            if (this.frame != null) root.cancelAnimationFrame(this.frame);
        }
    }
    root.PracticeTransport = PracticeTransport;
    if (typeof module !== 'undefined' && module.exports) module.exports = PracticeTransport;
})(typeof window !== 'undefined' ? window : globalThis);
