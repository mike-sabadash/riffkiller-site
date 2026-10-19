/* Download both short practice recordings before enabling transport.
 * Blob URLs keep every loop/seek local; percentages describe downloaded bytes.
 */
(function (root) {
    'use strict';
    class PracticeMediaLoader {
        constructor(options = {}) {
            this.options = options;
            this.controllers = [];
            this.urls = [];
            this.cancelled = false;
        }
        report() {
            if (this.cancelled) return;
            const items = this.items.map(item => ({...item}));
            const loaded = items.reduce((sum, item) => sum + item.loaded, 0);
            const total = items.every(item => item.total > 0) ? items.reduce((sum, item) => sum + item.total, 0) : 0;
            if (this.options.onProgress) this.options.onProgress({items, loaded, total});
        }
        async download(item) {
            const controller = new AbortController();
            this.controllers.push(controller);
            let timer;
            const touch = () => {
                clearTimeout(timer);
                timer = setTimeout(() => controller.abort(), this.options.idleTimeout || 45000);
            };
            try {
                for (const url of item.sources) {
                    try {
                        item.loaded = 0; item.total = 0; item.done = false;
                        touch();
                        const response = await fetch(url, {signal: controller.signal, cache: 'default'});
                        if (!response.ok) throw new Error('HTTP ' + response.status);
                        const length = Number(response.headers.get('Content-Length'));
                        // Compressed responses count decoded bytes; do not invent a percentage.
                        item.total = response.headers.get('Content-Encoding') ? 0 : (length > 0 ? length : 0);
                        const chunks = [];
                        if (response.body && response.body.getReader) {
                            const reader = response.body.getReader();
                            while (true) {
                                const {done, value} = await reader.read();
                                if (done) break;
                                chunks.push(value); item.loaded += value.byteLength;
                                touch(); this.report();
                            }
                        } else {
                            const bytes = await response.arrayBuffer();
                            chunks.push(bytes); item.loaded = bytes.byteLength;
                        }
                        if (!item.loaded) throw new Error('Empty recording');
                        if (this.cancelled) throw new Error('Cancelled');
                        const blob = new Blob(chunks, {type: 'video/mp4'});
                        const local = URL.createObjectURL(blob);
                        this.urls.push(local);
                        item.total = item.loaded; item.done = true;
                        this.report();
                        return local;
                    } catch (error) {
                        if (controller.signal.aborted || this.cancelled) throw error;
                        if (url === item.sources[item.sources.length - 1]) throw error;
                    }
                }
            } finally { clearTimeout(timer); }
        }
        async load(recordings) {
            // A lesson that reuses the same source should download it only once.
            this.items = recordings.filter((item, i) => recordings.findIndex(other => other.sources[0] === item.sources[0]) === i)
                .map(item => ({...item, loaded: 0, total: 0, done: false}));
            this.report();
            try {
                const urls = await Promise.all(this.items.map(item => this.download(item)));
                return recordings.map(item => urls[this.items.findIndex(other => other.sources[0] === item.sources[0])]);
            } catch (error) {
                this.destroy();
                throw error;
            }
        }
        destroy() {
            this.cancelled = true;
            this.controllers.forEach(controller => controller.abort());
            this.urls.forEach(url => URL.revokeObjectURL(url));
            this.urls = [];
        }
    }
    root.PracticeMediaLoader = PracticeMediaLoader;
    if (typeof module !== 'undefined' && module.exports) module.exports = PracticeMediaLoader;
})(typeof window !== 'undefined' ? window : globalThis);
