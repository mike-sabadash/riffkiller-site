/**
 * Newsletter switches on the site (config/newsletter.php, docs/NEWSLETTER.md).
 *   #rkNewsPrefs            — the four switches: profile (signed in) and emails.html (signed link from an email, ?u=&t=).
 *   the "new riff" card     — accounts made before the newsletter started are asked once, in the library
 *                             (the server says when: prefs.php → ask). New accounts had the box at sign-up.
 * English in the markup; js/i18n.js translates it (tools/i18n/strings.py).
 */
(function () {
    'use strict';

    var TOPICS = [
        ['drops', 'New riffs and free weeks', 'One email on release day, usually Friday.'],
        ['headsup', 'A heads-up 2 days before a new riff', 'So you can clear some time for it.'],
        ['community', 'Challenges and votes', 'Vote for the next riff, join the monthly challenge.'],
        ['offers', 'Offers and new products', 'No more than one a month.']
    ];

    function api() { return (typeof getApiBase === 'function' ? getApiBase() : '') + '/api/newsletter/prefs.php'; }

    function linkAuth() {
        var q = new URLSearchParams(location.search);
        return q.get('u') && q.get('t') ? { u: q.get('u'), t: q.get('t') } : null;
    }

    function request(body, auth) {
        var url = api();
        var opts = { credentials: 'include', headers: { 'Content-Type': 'application/json' } };
        if (body) { opts.method = 'POST'; opts.body = JSON.stringify(Object.assign({}, body, auth || {})); }
        else if (auth) url += '?u=' + encodeURIComponent(auth.u) + '&t=' + encodeURIComponent(auth.t);
        return fetch(url, opts).then(function (r) { return r.json().then(function (d) { d.status = r.status; return d; }); });
    }

    function styles() {
        if (document.getElementById('rk-news-styles')) return;
        var css = '.rk-news{display:flex;flex-direction:column;gap:12px}' +
            '.rk-news label{display:flex;gap:12px;align-items:flex-start;cursor:pointer;font-size:15px;line-height:1.4;color:var(--color-text-primary,#fff)}' +
            '.rk-news input{width:18px;height:18px;margin:2px 0 0;flex-shrink:0;accent-color:#9355e5;cursor:pointer}' +
            '.rk-news small{display:block;font-size:13px;color:var(--color-text-secondary,rgba(255,255,255,.7));opacity:.75;margin-top:2px}' +
            '.rk-news-note{font-size:13px;line-height:1.5;color:var(--color-text-secondary,rgba(255,255,255,.7));opacity:.75;margin:4px 0 0}' +
            '.rk-news-saved{font-size:13px;color:#b28cf0;min-height:1em}' +
            '.rk-news-card{position:fixed;left:16px;right:16px;bottom:16px;z-index:900;max-width:420px;margin:0 auto;padding:16px 18px;border-radius:14px;' +
            'background:#1b1b24;border:1px solid rgba(147,85,229,.45);box-shadow:0 12px 40px rgba(0,0,0,.45);color:#fff}' +
            '.rk-news-card h3{margin:0 0 6px;font-size:16px;line-height:1.3}' +
            '.rk-news-card p{margin:0 0 12px;font-size:13.5px;line-height:1.45;color:rgba(255,255,255,.72)}' +
            '.rk-news-card .rk-news-actions{display:flex;gap:10px;flex-wrap:wrap}' +
            '.rk-news-card button{font:inherit;font-size:14px;font-weight:600;padding:10px 16px;border-radius:10px;cursor:pointer;border:1px solid rgba(255,255,255,.2);background:transparent;color:#fff}' +
            '.rk-news-card button.rk-news-yes{background:#9355e5;border-color:#9355e5}';
        var el = document.createElement('style');
        el.id = 'rk-news-styles';
        el.textContent = css;
        document.head.appendChild(el);
    }

    /** The four switches; every change is saved at once. */
    function renderPrefs(box, auth, how) {
        styles();
        request(null, auth).then(function (d) {
            if (!d.success) {
                box.innerHTML = '<p class="rk-news-note">' + (d.status === 403 ? 'This link doesn’t work. Sign in and change your emails in your profile.' : 'Sign in to choose your emails.') + '</p>';
                return;
            }
            var html = '<div class="rk-news">';
            TOPICS.forEach(function (t) {
                html += '<label><input type="checkbox" data-topic="' + t[0] + '"' + (d.topics[t[0]] ? ' checked' : '') + '><span>' + t[1] + '<small>' + t[2] + '</small></span></label>';
            });
            html += '<p class="rk-news-note">Never more than 2 of these a week. Every email has a one-click unsubscribe. The weekly practice summary has its own switch in your profile.</p>' +
                '<div class="rk-news-saved" aria-live="polite"></div></div>';
            box.innerHTML = html;
            var saved = box.querySelector('.rk-news-saved');
            box.querySelectorAll('input[data-topic]').forEach(function (input) {
                input.addEventListener('change', function () {
                    var topics = {};
                    topics[input.getAttribute('data-topic')] = input.checked;
                    saved.textContent = '';
                    request({ topics: topics, how: how }, auth).then(function (r) {
                        saved.textContent = r.success ? 'Saved' : 'Could not save. Try again.';
                    }, function () { saved.textContent = 'Could not save. Try again.'; });
                });
            });
        }, function () { box.innerHTML = '<p class="rk-news-note">Could not connect. Check your connection and try again.</p>'; });
    }

    function count(e) { if (typeof window.rkCount === 'function') window.rkCount(e); }

    /** Older accounts: asked once, never again after Yes or No thanks. */
    function maybeAsk() {
        if (document.getElementById('rkNewsCard') || document.documentElement.classList.contains('rk-drop')) return;
        request(null, null).then(function (d) {
            if (!d.success || !d.ask) return;
            styles();
            var card = document.createElement('div');
            card.className = 'rk-news-card';
            card.id = 'rkNewsCard';
            card.setAttribute('role', 'dialog');
            card.innerHTML = '<h3>Want an email when a new riff drops?</h3>' +
                '<p>About once a week, on release day. One click to unsubscribe.</p>' +
                '<div class="rk-news-actions"><button type="button" class="rk-news-yes">Yes, email me</button><button type="button" class="rk-news-no">No thanks</button></div>';
            document.body.appendChild(card);
            count('mail_ask:shown');
            var answer = function (yes) {
                count('mail_ask:' + (yes ? 'yes' : 'no'));
                request({ topics: yes ? { drops: true } : {}, how: 'card', asked: yes ? 'yes' : 'no' }, null);
                if (!yes) { card.remove(); return; }
                card.innerHTML = '<h3>Done</h3><p>You’ll get an email when a new riff is out. More options are in your profile.</p>';
                setTimeout(function () { card.remove(); }, 4000);
            };
            card.querySelector('.rk-news-yes').addEventListener('click', function () { answer(true); });
            card.querySelector('.rk-news-no').addEventListener('click', function () { answer(false); });
        }, function () {});
    }

    function onAuth(cb) {
        var am = window.authManager;
        if (!am) return;
        var done = false;
        var fire = function () { if (!done && am.isAuthenticated) { done = true; cb(); } };
        am.addListener(fire);
        if (am.ready && am.ready.then) am.ready.then(fire, function () {});
    }

    function init() {
        var box = document.getElementById('rkNewsPrefs');
        var auth = linkAuth();
        if (box && auth) renderPrefs(box, auth, 'page');
        else if (box) onAuth(function () {
            var section = box.closest('[data-news-section]');
            if (section) section.hidden = false;
            renderPrefs(box, null, 'profile');
        });
        if (document.body && document.body.hasAttribute('data-news-ask')) onAuth(function () { setTimeout(maybeAsk, 1500); });
    }

    window.RKNewsletter = { renderPrefs: renderPrefs, maybeAsk: maybeAsk };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
