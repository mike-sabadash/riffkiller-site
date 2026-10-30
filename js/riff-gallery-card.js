/**
 * Единая карточка риффа для галерей (как Most killed на app.html).
 * Разметка: .riff-card-stack > .riff-card + .riff-meta-below
 */
(function (global) {
    'use strict';

    function esc(s) {
        if (s == null) return '';
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    var DIFF_LABELS = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' };

    var FAVORITE_SVG =
        '<svg class="favorite-icon" viewBox="0 0 16 16" fill="none"><path d="M8 2L9.79611 5.52786L13.6574 6.21885L10.8287 9.16714L11.4721 13L8 11.1279L4.52786 13L5.17127 9.16714L2.3426 6.21885L6.20389 5.52786L8 2Z" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    /**
     * Favorites: one store for every page, kept in the practice progress (js/rk-progress.js, state.fav), so they
     * reach the account and other devices with it. Guests keep them in this browser until they sign in.
     *   RKFavorites.has(kind, id), toggle(kind, id) → on, list(kind) → ids (latest first), onChange(fn)
     *   kind: 'riff' or 'collection'. Every star with data-fav-key repaints itself when favorites change.
     */
    var Fav = (function () {
        var synced = false, listeners = [], hooked = false;
        function P() { return global.RKProgress || null; }
        function key(kind, id) { return (kind === 'collection' ? 'c' : 'r') + ':' + id; }
        // Stars saved before favorites moved here (riffKillerState.riffsDatabase), once per browser.
        function migrate() {
            var ls;
            try { ls = global.localStorage; if (!ls || ls.getItem('rkFavMoved')) return; ls.setItem('rkFavMoved', '1'); } catch (e) { return; }
            var ids = [];
            try {
                var st = JSON.parse(ls.getItem('riffKillerState') || '{}');
                (st.riffsDatabase || []).forEach(function (r) { if (r && r.isFavorite === true && r.id != null) ids.push(String(r.id)); });
            } catch (e) { return; }
            // When the riff list did not load, the old page saved its built-in demo flags (riffs 1, 3, 6, 9): not the student's.
            if (!ids.length || ids.slice().sort().join(',') === '1,3,6,9') return;
            P().update(function (s, now) { ids.forEach(function (id, i) { if (!P().isFavorite(s, 'riff', id)) P().setFavorite(s, 'riff', id, true, now - i); }); }, { quiet: true });
        }
        function ready() {
            var p = P();
            if (!p) return null;
            if (!hooked) {
                hooked = true;
                migrate();
                p.onChange(function () { paint(); listeners.forEach(function (fn) { try { fn(); } catch (e) {} }); });
            }
            if (!synced && p.sync) { synced = true; p.sync(); }
            return p;
        }
        function has(kind, id) { var p = ready(); return !!(p && p.isFavorite(p.load(), kind, id)); }
        function list(kind) { var p = ready(); return p ? p.favorites(p.load(), kind) : []; }
        function toggle(kind, id) {
            var p = ready();
            if (!p) return false;
            var on = p.update(function (s, now) { return p.setFavorite(s, kind, id, !p.isFavorite(s, kind, id), now); }, { soon: true });
            toast(on, kind);
            return on;
        }
        function label(on) { return on ? 'Remove from favorites' : 'Add to favorites'; }
        function paint() {
            var p = P();
            if (!p || !global.document) return;
            var s = p.load();
            global.document.querySelectorAll('[data-fav-key]').forEach(function (btn) {
                var k = btn.getAttribute('data-fav-key').split(':');
                var on = p.isFavorite(s, k[0] === 'c' ? 'collection' : 'riff', k.slice(1).join(':'));
                btn.classList.toggle('active', on);
                btn.setAttribute('aria-pressed', on ? 'true' : 'false');
                btn.setAttribute('aria-label', label(on));
            });
        }
        function signedIn() { var a = global.authManager || global.patreonAuth; return !!(a && a.isAuthenticated); }
        var toastTimer = null;
        function toast(on, kind) {
            var d = global.document;
            if (!d || !d.body) return;
            var el = d.getElementById('rkFavToast');
            if (!el) {
                el = d.createElement('div');
                el.id = 'rkFavToast';
                el.className = 'rk-fav-toast';
                el.setAttribute('role', 'status');
                d.body.appendChild(el);
            }
            var onProfile = /profile\.html/.test(global.location.pathname);
            var text = on ? (kind === 'collection' ? 'Collection added to favorites' : 'Added to favorites') : 'Removed from favorites';
            var extra = on && !signedIn() ? '<span class="rk-fav-toast-sub">Saved on this device. Sign in to keep favorites everywhere.</span>' : '';
            el.innerHTML = '<span class="rk-fav-toast-text">' + esc(text) + extra + '</span>' +
                (on && !onProfile ? '<a class="rk-fav-toast-link" href="profile.html#favorites">See all</a>' : '');
            el.classList.add('show');
            clearTimeout(toastTimer);
            toastTimer = setTimeout(function () { el.classList.remove('show'); }, on && !signedIn() ? 5000 : 3000);
        }
        function button(kind, id, extraClass) {
            var on = has(kind, id);
            return '<button type="button" class="' + extraClass + (on ? ' active' : '') + '" data-fav-key="' + esc(key(kind, id)) +
                '" aria-pressed="' + on + '" aria-label="' + label(on) + '">' + FAVORITE_SVG + '</button>';
        }
        function onChange(fn) { ready(); listeners.push(fn); }
        // Same toast for any short message (a locked riff: «Coming soon»).
        function notice(text, sub) {
            var d = global.document;
            if (!d || !d.body) return;
            toast(true, 'riff');
            var el = d.getElementById('rkFavToast');
            el.innerHTML = '<span class="rk-fav-toast-text">' + esc(text) + (sub ? '<span class="rk-fav-toast-sub">' + esc(sub) + '</span>' : '') + '</span>';
        }
        return { has: has, toggle: toggle, list: list, onChange: onChange, button: button, paint: paint, notice: notice };
    })();
    global.RKFavorites = Fav;

    /**
     * @param {object} riff
     * @param {object} hooks
     * @param {function} [hooks.onNavigate] — клик по карточке (кроме звезды)
     * @param {string} [hooks.extraMetaHtml] — HTML под artist; по умолчанию — прогресс риффа
     */
    // “3/10 parts at tempo” or “Learned” under the artist, once the student has started the riff (js/rk-progress.js).
    function progressNote(riff) {
        var note = global.RKProgress && global.RKProgress.cardNote ? global.RKProgress.cardNote(riff) : '';
        return note ? '<div class="riff-progress-note">' + esc(note) + '</div>' : '';
    }

    /**
     * Access on top of price (config/riff-access.php): riff.lock 'soon' — padlock «Soon», the riff does not open.
     * The admin signed in at /admin/ gets riff.adminView from the API and opens everything.
     */
    var LOCK_ICON = '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="1.5" stroke="currentColor" stroke-width="1.5"/><path d="M5.5 7V5a2.5 2.5 0 015 0v2" stroke="currentColor" stroke-width="1.5"/></svg>';
    function lockOf(riff) {
        if (!riff || riff.adminView) return '';
        return riff.lock === 'soon' ? 'soon' : '';
    }

    function createCard(riff, hooks) {
        hooks = hooks || {};
        var lock = lockOf(riff);
        if (lock) {
            // Locked riff: no Free/Premium mark, the padlock tells why; a click explains instead of opening.
            riff = Object.assign({}, riff, { isFree: false });
            hooks = Object.assign({}, hooks, { locked: false, onNavigate: function () { Fav.notice('Coming soon', 'This breakdown is on its way.'); } });
        }

        var stack = document.createElement('div');
        stack.className = 'riff-card-stack' + (riff.isFree ? ' riff-card-stack--free' : '');
        stack.dataset.riffId = String(riff.id);

        var card = document.createElement('div');
        card.className = 'riff-card' + (riff.isFree ? ' riff-card-free' : '');
        card.dataset.id = String(riff.id);

        var diffKey = ['beginner', 'intermediate', 'advanced'].indexOf(riff.difficulty) >= 0 ? riff.difficulty : 'intermediate';
        // Сложность — текстом под названием, на обложке остаётся только метка доступа
        var levelHtml = '<span class="riff-level riff-level--' + diffKey + '"> · ' + DIFF_LABELS[diffKey] + '</span>';
        var freeTag = riff.isFree ? '<div class="riff-free-tag">Free</div>' : '';
        // hooks.locked: платный рифф для гостя/без подписки — замок заранее, а не сюрприз-редирект на оплату
        var lockTag = hooks.locked
            ? '<div class="riff-lock-tag" title="Premium"><svg viewBox="0 0 16 16" width="12" height="12" fill="none" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="1.5" stroke="currentColor" stroke-width="1.5"/><path d="M5.5 7V5a2.5 2.5 0 015 0v2" stroke="currentColor" stroke-width="1.5"/></svg>Premium</div>'
            : '';
        if (hooks.locked) card.className += ' riff-card--locked';
        if (lock === 'soon') {
            lockTag = '<div class="riff-lock-tag riff-soon-tag" title="Coming soon">' + LOCK_ICON + 'Soon</div>';
            card.className += ' riff-card--soon';
        } else if (riff.adminView && riff.lock === 'soon') {
            // The admin sees which riffs are closed for everyone else.
            lockTag = '<div class="riff-lock-tag riff-soon-tag riff-soon-tag--admin" title="Locked for students: Soon">' + LOCK_ICON + 'Soon · admin</div>';
        }

        card.innerHTML =
            '<div class="riff-image-container" style="position:relative; width:100%; height:100%;">' +
            '<div class="riff-image-preloader" style="position:absolute; top:0; left:0; right:0; bottom:0; background: #1a1f33; display:flex; align-items:center; justify-content:center; z-index:1;">' +
            '<div class="riff-preloader-spinner" style="width:40px; height:40px; border:4px solid rgba(255,255,255,0.2); border-radius:50%; border-top-color: #9355E5; border-left-color: #6B3DA6; animation: spin 0.8s linear infinite;"></div>' +
            '</div>' +
            '<img src="' +
            String(riff.thumbnail || '').replace(/"/g, '') +
            // Light WebP copies from the API: a 220 px card downloads ~400–800 px, not the full upload.
            (riff.thumbnailSrcset
                ? '" srcset="' + String(riff.thumbnailSrcset).replace(/"/g, '') + '" sizes="(max-width: 600px) 50vw, 240px'
                : '') +
            '" alt="' +
            esc(riff.song) +
            '" class="riff-image" style="opacity:0; transition:opacity 0.3s ease; width:100%; height:100%; object-fit:cover; position:absolute; top:0; left:0;" ' +
            'onload="this.style.opacity=\'1\'; this.parentElement.querySelector(\'.riff-image-preloader\').style.display=\'none\';" ' +
            'onerror="this.onerror=null; this.style.visibility=\'hidden\'; this.parentElement.querySelector(\'.riff-image-preloader\').style.display=\'none\';">' +
            '</div>' +
            '<div class="riff-overlay riff-overlay--hub" aria-hidden="true"></div>' +
            Fav.button('riff', riff.id, 'riff-favorite-btn') +
            freeTag +
            lockTag;

        var meta = document.createElement('div');
        meta.className = 'riff-meta-below';
        meta.innerHTML =
            '<div class="riff-song">' +
            esc(riff.song) +
            '</div><div class="riff-artist">' +
            esc(riff.artist) +
            levelHtml +
            '</div>' +
            (hooks.extraMetaHtml != null ? hooks.extraMetaHtml : progressNote(riff));

        stack.appendChild(card);
        stack.appendChild(meta);

        var favBtn = card.querySelector('.riff-favorite-btn');
        favBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            e.preventDefault();
            Fav.toggle('riff', riff.id);
        });

        stack.addEventListener('click', function (e) {
            if (e.target.closest && e.target.closest('.riff-favorite-btn')) return;
            if (hooks.onNavigate) {
                hooks.onNavigate(riff, e);
                return;
            }
            try {
                var raw = global.localStorage.getItem('riffKillerState');
                var st = raw ? JSON.parse(raw) : {};
                st.currentRiffId = riff.id;
                global.localStorage.setItem('riffKillerState', JSON.stringify(st));
            } catch (err) {}
            global.document.body.style.opacity = '0.7';
            global.setTimeout(function () {
                global.location.href = 'practice.html?riff=' + riff.id;
            }, 200);
        });

        return stack;
    }

    global.RiffKillerRiffGallery = { createCard: createCard, lockOf: lockOf };
})(typeof window !== 'undefined' ? window : this);
