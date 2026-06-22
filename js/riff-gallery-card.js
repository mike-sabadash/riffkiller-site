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

    var DIFF_LABELS = { beginner: 'beginner', intermediate: 'intermediate', advanced: 'advanced' };

    var FAVORITE_SVG =
        '<svg class="favorite-icon" viewBox="0 0 16 16" fill="none"><path d="M8 2L9.79611 5.52786L13.6574 6.21885L10.8287 9.16714L11.4721 13L8 11.1279L4.52786 13L5.17127 9.16714L2.3426 6.21885L6.20389 5.52786L8 2Z" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    /**
     * @param {object} riff
     * @param {object} hooks
     * @param {function} [hooks.onNavigate] — клик по карточке (кроме звезды)
     * @param {function} [hooks.onFavoriteClick] — (e, favBtn, riff)
     * @param {string} [hooks.extraMetaHtml] — HTML под artist (mastery на profile)
     */
    function createCard(riff, hooks) {
        hooks = hooks || {};

        var stack = document.createElement('div');
        stack.className = 'riff-card-stack' + (riff.isFree ? ' riff-card-stack--free' : '');
        stack.dataset.riffId = String(riff.id);

        var card = document.createElement('div');
        card.className = 'riff-card' + (riff.isFree ? ' riff-card-free' : '');
        card.dataset.id = String(riff.id);

        var diffKey = ['beginner', 'intermediate', 'advanced'].indexOf(riff.difficulty) >= 0 ? riff.difficulty : 'intermediate';
        var difficultyBadge =
            '<div class="riff-difficulty riff-difficulty--' + diffKey + '">' + DIFF_LABELS[diffKey] + '</div>';
        var freeTag = riff.isFree ? '<div class="riff-free-tag">FREE</div>' : '';
        var isFav = !!riff.isFavorite;

        card.innerHTML =
            '<div class="riff-image-container" style="position:relative; width:100%; height:100%;">' +
            '<div class="riff-image-preloader" style="position:absolute; top:0; left:0; right:0; bottom:0; background: #1a1f33; display:flex; align-items:center; justify-content:center; z-index:1;">' +
            '<div class="riff-preloader-spinner" style="width:40px; height:40px; border:4px solid rgba(255,255,255,0.2); border-radius:50%; border-top-color: #9355E5; border-left-color: #6B3DA6; animation: spin 0.8s linear infinite;"></div>' +
            '</div>' +
            '<img src="' +
            String(riff.thumbnail || '').replace(/"/g, '') +
            '" alt="' +
            esc(riff.song) +
            '" class="riff-image" style="opacity:0; transition:opacity 0.3s ease; width:100%; height:100%; object-fit:cover; position:absolute; top:0; left:0;" ' +
            'onload="this.style.opacity=\'1\'; this.parentElement.querySelector(\'.riff-image-preloader\').style.display=\'none\';" ' +
            'onerror="this.src=\'https://via.placeholder.com/214x180/2a2d42/ffffff?text=' +
            encodeURIComponent(riff.song || '') +
            '\'; this.style.opacity=\'1\'; this.parentElement.querySelector(\'.riff-image-preloader\').style.display=\'none\';">' +
            '</div>' +
            '<div class="riff-overlay riff-overlay--hub" aria-hidden="true"></div>' +
            difficultyBadge +
            '<button type="button" class="riff-favorite-btn' +
            (isFav ? ' active' : '') +
            '" aria-label="' +
            (isFav ? 'Remove from favorites' : 'Add to favorites') +
            '">' +
            FAVORITE_SVG +
            '</button>' +
            freeTag;

        var meta = document.createElement('div');
        meta.className = 'riff-meta-below';
        meta.innerHTML =
            '<div class="riff-song">' +
            esc(riff.song) +
            '</div><div class="riff-artist">' +
            esc(riff.artist) +
            '</div>' +
            (hooks.extraMetaHtml || '');

        stack.appendChild(card);
        stack.appendChild(meta);

        var favBtn = card.querySelector('.riff-favorite-btn');
        favBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            if (hooks.onFavoriteClick) {
                hooks.onFavoriteClick(e, favBtn, riff);
            } else if (global.window.patreonAuth && global.window.patreonAuth.isAuthenticated) {
                favBtn.classList.toggle('active');
                riff.isFavorite = favBtn.classList.contains('active');
                favBtn.setAttribute(
                    'aria-label',
                    riff.isFavorite ? 'Remove from favorites' : 'Add to favorites'
                );
            } else if (typeof global.showFavoritesLoginModal === 'function') {
                global.showFavoritesLoginModal();
            }
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

    global.RiffKillerRiffGallery = { createCard: createCard };
})(typeof window !== 'undefined' ? window : this);
