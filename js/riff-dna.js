/**
 * Riff DNA panel on the practice page.
 * A riff is a phrase: each segment has a job in it (its Molecule role: Call, Climb, Turn, Land…),
 * and Atoms are the techniques used at exact moments (bend, slide, palm mute…).
 * Both come from the admin editor; the panel follows the video as it plays.
 */
(function (global) {
    'use strict';

    var V = global.RiffDNAVocab;
    var activeRiff = null;
    var activeStage = 'scan';
    var currentSegmentIndex = 0;
    var liveTimer = null;

    var STAGES = {
        scan: { title: 'Hear the whole phrase first' },
        split: { title: 'The parts and their jobs' },
        isolate: { title: 'Techniques to watch' },
        decode: { title: 'Why it sounds like this' },
        mutate: { title: 'Write your own on the same idea' }
    };

    function esc(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }

    function fmtTime(sec) {
        sec = Math.max(0, Number(sec) || 0);
        var m = Math.floor(sec / 60);
        var s = (sec - m * 60).toFixed(1);
        return m + ':' + (s < 10 ? '0' : '') + s;
    }

    // Stored formulas are written in caps ("5/8 STATEMENT + ..."); show them as a sentence.
    function sentenceCase(text) {
        var t = String(text || '').trim();
        if (t && t === t.toUpperCase()) t = t.toLowerCase();
        return t.replace(/^./, function (c) { return c.toUpperCase(); });
    }

    function lines(value) {
        if (Array.isArray(value)) return value.filter(Boolean);
        return String(value || '').split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
    }

    function dnaOf(riff) {
        return riff && riff.dna && typeof riff.dna === 'object' ? riff.dna : {};
    }

    function segments() {
        var list = activeRiff && Array.isArray(activeRiff.segments) ? activeRiff.segments : [];
        return list.map(function (s, i) {
            var key = V.roleFromLegacy(s);
            return {
                index: i,
                start: Number(s.start) || 0,
                end: Number(s.end) || 0,
                name: s.displayName || s.name || ('Shot ' + (i + 1)),
                role: V.role(key),
                note: s.function || ''
            };
        });
    }

    function segmentAt(segs, time) {
        for (var i = 0; i < segs.length; i++) if (time >= segs[i].start && time < segs[i].end) return segs[i];
        return null;
    }

    function atoms() {
        var segs = segments();
        var list = Array.isArray(dnaOf(activeRiff).atoms) ? dnaOf(activeRiff).atoms : [];
        return list.map(function (a, i) {
            var hasTime = typeof a.time === 'number' && isFinite(a.time);
            var seg = hasTime ? segmentAt(segs, a.time) : null;
            if (!seg && typeof a.segmentIndex === 'number') seg = segs[a.segmentIndex] || null;
            var tech = V.technique(a.technique);
            return {
                index: i,
                time: hasTime ? a.time : (seg ? seg.start : 0),
                segment: seg,
                name: tech && tech.key !== 'other' ? tech.label : (a.type || 'Technique'),
                label: a.label || '',
                tip: a.tip || '',
                view: a.view,
                speed: a.speed
            };
        }).sort(function (x, y) { return x.time - y.time; });
    }

    function hasDNA(riff) {
        var dna = dnaOf(riff);
        var segs = riff && Array.isArray(riff.segments) ? riff.segments : [];
        return segs.some(function (s) { return !!V.roleFromLegacy(s); }) ||
            (Array.isArray(dna.atoms) && dna.atoms.length > 0) || !!(dna.rule || dna.law || dna.overview);
    }

    // Roles in playing order with neighbours merged; a repeated cycle is shown once with its count.
    function phrase() {
        var seq = [];
        segments().forEach(function (s) {
            if (s.role && (!seq.length || seq[seq.length - 1].key !== s.role.key)) seq.push(s.role);
        });
        for (var size = 1; size <= seq.length / 2; size++) {
            if (seq.length % size) continue;
            var ok = true;
            for (var i = size; i < seq.length && ok; i++) ok = seq[i].key === seq[i % size].key;
            if (ok) return { unit: seq.slice(0, size), times: seq.length / size };
        }
        return { unit: seq, times: 1 };
    }

    function roleWord(role) {
        return '<span class="dna-role-word" style="--role:' + role.color + '">' + esc(role.label) + '</span>';
    }

    function playWholeRiff() {
        var button = document.querySelector('.segment-btn.all-riff');
        if (button) button.click();
    }

    function focusSegment(index) {
        if (typeof global.playPracticeSegment === 'function') global.playPracticeSegment(index);
    }

    function focusAtom(index) {
        var atom = atoms().filter(function (a) { return a.index === index; })[0];
        if (!atom) return;
        var segIndex = atom.segment ? atom.segment.index : 0;
        if (typeof global.playPracticeSegment === 'function') {
            global.playPracticeSegment(segIndex, { view: atom.view, speed: atom.speed || 0.5 });
        }
        document.querySelectorAll('[data-dna-atom]').forEach(function (el) {
            el.classList.toggle('active', Number(el.dataset.dnaAtom) === index);
        });
    }

    /* ---------- stages ---------- */

    function renderScan(dna) {
        var p = phrase();
        var sentence = p.unit.length
            ? '<p class="dna-phrase" aria-label="Riff phrase">' + p.unit.map(roleWord).join('<span class="dna-phrase-sep" aria-hidden="true">→</span>') +
                (p.times > 1 ? '<span class="dna-phrase-times">×' + p.times + '</span>' : '') + '</p>'
            : '';
        var overview = dna.overview ? '<p class="dna-copy-lead">' + esc(dna.overview) + '</p>' : '';
        return sentence + overview +
            '<p class="dna-copy-note">Play it once without watching the hands. Listen for where each part starts and where the phrase comes home.</p>' +
            '<button type="button" class="dna-action" data-dna-action="play-all">Play full riff</button>';
    }

    function renderMap() {
        var segs = segments();
        if (!segs.length) return '';
        var total = segs[segs.length - 1].end || 1;
        var blocks = segs.map(function (s) {
            var left = (s.start / total) * 100;
            var width = Math.max(((s.end - s.start) / total) * 100, 1.2);
            var color = s.role ? s.role.color : 'transparent';
            var label = s.role ? s.role.label : '';
            return '<button type="button" class="dna-map-block' + (s.role ? '' : ' dna-map-block--plain') + '" data-dna-segment="' + s.index + '"' +
                ' style="left:' + left + '%;width:' + width + '%;--role:' + color + '"' +
                ' title="' + esc((label ? label + ' · ' : '') + s.name + ' · ' + fmtTime(s.start) + '–' + fmtTime(s.end)) + '"' +
                ' aria-label="Loop ' + esc(s.name + (label ? ', ' + label : '')) + '"><span>' + (width >= 14 ? esc(label) : '') + '</span></button>';
        }).join('');
        var marks = atoms().map(function (a) {
            return '<button type="button" class="dna-map-atom" data-dna-atom="' + a.index + '" style="left:' + (a.time / total) * 100 + '%"' +
                ' title="' + esc(a.name + ' · ' + fmtTime(a.time)) + '" aria-label="' + esc(a.name + ' at ' + fmtTime(a.time)) + '"></button>';
        }).join('');
        return '<div class="dna-map" id="dnaMap" data-total="' + total + '">' +
            '<div class="dna-map-track">' + blocks + '<i class="dna-map-playhead" id="dnaMapPlayhead" aria-hidden="true"></i></div>' +
            (marks ? '<div class="dna-map-atoms">' + marks + '</div>' : '') +
            '<div class="dna-map-axis"><span>0:00</span><span>' + fmtTime(total) + '</span></div>' +
            '</div>';
    }

    function renderSplit() {
        var segs = segments();
        var byRole = [];
        segs.forEach(function (s) {
            if (!s.role) return;
            var item = byRole.filter(function (r) { return r.role.key === s.role.key; })[0];
            if (!item) byRole.push(item = { role: s.role, first: s.index, count: 0, note: s.note });
            if (!item.note && s.note) item.note = s.note;
            item.count += 1;
        });
        var intro = '<p class="dna-copy-note" style="margin:0 0 12px">Each block is one shot of the video, coloured by its job in the phrase. Tap a block to loop it; dots below are techniques.</p>';
        var rows = byRole.map(function (r) {
            return '<li class="dna-part">' +
                '<span class="dna-part-dot" style="--role:' + r.role.color + '" aria-hidden="true"></span>' +
                '<div><strong>' + esc(r.role.label) + '</strong>' +
                '<p>' + esc(r.note || r.role.hint) + '</p>' +
                '<span class="dna-part-meta">' + (r.count === 1 ? 'One shot' : r.count + ' shots') + '</span></div>' +
                '<button type="button" class="dna-part-loop" data-dna-segment="' + r.first + '" aria-label="Loop ' + esc(r.role.label) + '">Loop</button>' +
                '</li>';
        }).join('');
        var empty = byRole.length ? '' : '<p class="dna-copy-note">The parts of this riff haven’t been labeled yet. You can still loop any shot above.</p>';
        return intro + renderMap() + (rows ? '<ul class="dna-list dna-list--parts">' + rows + '</ul>' : empty);
    }

    function renderIsolate() {
        var list = atoms();
        if (!list.length) {
            return '<p class="dna-copy-lead">No techniques marked for this riff yet.</p><p class="dna-copy-note">Use the left and right hand cameras and the slow-down on the left.</p>';
        }
        return '<p class="dna-copy-note" style="margin:0 0 6px">Tap one to loop it slowly from the best camera. While the riff plays, the current one lights up.</p>' +
            '<ul class="dna-list">' + list.map(function (a) {
                var where = a.segment && a.segment.role ? ' · in ' + a.segment.role.label : '';
                return '<li><button type="button" class="dna-detail dna-atom-card" data-dna-atom="' + a.index + '" data-time="' + a.time + '">' +
                    '<span class="dna-detail-type">' + fmtTime(a.time) + where + '</span>' +
                    '<strong>' + esc(a.name) + (a.label ? ' <em>' + esc(a.label) + '</em>' : '') + '</strong>' +
                    (a.tip ? '<small>' + esc(a.tip) + '</small>' : '') +
                '</button></li>';
            }).join('') + '</ul>';
    }

    function renderDecode(dna) {
        var rule = dna.rule || sentenceCase(dna.formula);
        var keep = lines(dna.preserve), change = lines(dna.change);
        var list = function (title, items) {
            return items.length ? '<div class="dna-test"><span>' + title + '</span><ul>' + items.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>' : '';
        };
        var test = list('Keep', keep) + list('Change freely', change) +
            (dna.failure ? '<div class="dna-test"><span>It stops sounding like the riff if</span><p>' + esc(dna.failure) + '</p></div>' : '');
        if (!rule && !dna.law && !test) return '<p class="dna-copy-lead">The rule of this riff hasn’t been written up yet.</p><p class="dna-copy-note">Start with the parts and techniques: they already show how it is built.</p>';
        return (rule ? '<p class="dna-rule">' + esc(rule) + '</p>' : '') +
            (dna.law ? '<p class="dna-law">' + esc(dna.law) + '</p>' : '') +
            (test ? '<div class="dna-tests">' + test + '</div>' : '');
    }

    function renderMutate(dna) {
        var m = dna.mutation || {};
        var steps = lines(m.steps);
        if (!steps.length) {
            steps = ['Keep the rhythm of the first part.', 'Change the notes, stay in the same position.', 'Bring back the original ending.'];
        }
        return '<strong class="dna-mutation-title">' + esc(m.title || 'Write a riff of your own') + '</strong>' +
            (m.description ? '<p class="dna-copy-note">' + esc(m.description) + '</p>' : '') +
            '<ol class="dna-mutation-steps">' + steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>' +
            '<button type="button" class="dna-action dna-action--text" data-dna-stage-jump="split">← Back to the parts</button>';
    }

    function renderStage(stage) {
        if (!activeRiff || !STAGES[stage]) return;
        activeStage = stage;
        var dna = dnaOf(activeRiff);
        var title = document.getElementById('dnaStageTitle');
        var content = document.getElementById('dnaStageContent');
        if (title) title.textContent = STAGES[stage].title;
        document.querySelectorAll('.dna-stage').forEach(function (button) {
            var selected = button.dataset.dnaStage === stage;
            button.classList.toggle('active', selected);
            button.setAttribute('aria-selected', String(selected));
            button.tabIndex = selected ? 0 : -1;
        });
        var panel = document.getElementById('dnaStagePanel');
        if (panel) panel.setAttribute('aria-labelledby', 'dna-tab-' + stage);
        if (!content) return;
        if (stage === 'scan') content.innerHTML = renderScan(dna);
        if (stage === 'split') content.innerHTML = renderSplit();
        if (stage === 'isolate') content.innerHTML = renderIsolate();
        if (stage === 'decode') content.innerHTML = renderDecode(dna);
        if (stage === 'mutate') content.innerHTML = renderMutate(dna);
        bindStageActions();
        tick();
    }

    function bindStageActions() {
        document.querySelectorAll('#dnaLab [data-dna-action="play-all"]').forEach(function (el) { el.onclick = playWholeRiff; });
        document.querySelectorAll('#dnaLab [data-dna-segment]').forEach(function (el) { el.onclick = function () { focusSegment(Number(this.dataset.dnaSegment)); }; });
        document.querySelectorAll('#dnaLab [data-dna-atom]').forEach(function (el) { el.onclick = function () { focusAtom(Number(this.dataset.dnaAtom)); }; });
        document.querySelectorAll('#dnaLab [data-dna-stage-jump]').forEach(function (el) { el.onclick = function () { renderStage(this.dataset.dnaStageJump); }; });
    }

    /* ---------- live sync with the video ---------- */

    function videoState() {
        var v = typeof leftVideo !== 'undefined' ? leftVideo : null; // eslint-disable-line no-undef
        return v ? { time: v.currentTime || 0, playing: !v.paused } : null;
    }

    function tick() {
        if (!activeRiff) return;
        var state = videoState();
        if (!state) return;
        var segs = segments();
        var seg = segmentAt(segs, state.time);
        var map = document.getElementById('dnaMap');
        if (map) {
            var total = Number(map.dataset.total) || 1;
            var head = document.getElementById('dnaMapPlayhead');
            if (head) head.style.left = Math.min(100, (state.time / total) * 100) + '%';
            map.querySelectorAll('.dna-map-block').forEach(function (el) {
                el.classList.toggle('active', !!seg && Number(el.dataset.dnaSegment) === seg.index);
            });
        }
        var list = atoms();
        var now = null, next = null;
        list.forEach(function (a) {
            if (state.time >= a.time - 0.15 && state.time < a.time + 0.7) now = a;
            if (!next && a.time > state.time + 0.05) next = a;
        });
        document.querySelectorAll('#dnaLab [data-dna-atom]').forEach(function (el) {
            el.classList.toggle('now', state.playing && !!now && Number(el.dataset.dnaAtom) === now.index);
        });
        var live = document.getElementById('dnaLive');
        if (!live) return;
        if (!state.playing || (!seg && !now)) { live.hidden = true; return; }
        var parts = [];
        if (seg && seg.role) parts.push('<span class="dna-live-role" style="--role:' + seg.role.color + '">' + esc(seg.role.label) + '</span>');
        if (now) parts.push('<strong>' + esc(now.name) + '</strong>' + (now.label ? ' ' + esc(now.label) : ''));
        else if (next) parts.push('Next: ' + esc(next.name) + ' at ' + fmtTime(next.time));
        live.innerHTML = parts.join('<span class="dna-live-sep" aria-hidden="true">·</span>');
        live.hidden = !parts.length;
    }

    /* ---------- segment buttons under the video ---------- */

    function decorateSegmentControls() {
        if (!activeRiff || !Array.isArray(activeRiff.segments)) return;
        var buttons = document.querySelectorAll('.segment-btn:not(.all-riff)');
        buttons.forEach(function (button, index) {
            var segment = activeRiff.segments[index];
            if (!segment || button.querySelector('.dna-segment-role')) return;
            var name = button.querySelector('.segment-name');
            if (name && segment.displayName) name.textContent = segment.displayName;
            var role = V.role(V.roleFromLegacy(segment));
            if (!role || (name && name.textContent.toLowerCase().indexOf(role.label.toLowerCase()) >= 0)) return;
            var tag = document.createElement('span');
            tag.className = 'dna-segment-role';
            tag.style.setProperty('--role', role.color);
            tag.textContent = role.label;
            button.appendChild(tag);
        });
    }

    function init(riff) {
        activeRiff = riff;
        var lab = document.getElementById('dnaLab');
        var ready = hasDNA(riff);
        if (lab) lab.classList.toggle('dna-lab--empty', !ready);
        var empty = document.getElementById('dnaEmpty');
        if (empty) empty.hidden = ready;
        decorateSegmentControls();
        document.querySelectorAll('.dna-stage').forEach(function (button) {
            button.onclick = function () { renderStage(button.dataset.dnaStage); };
            button.onkeydown = function (event) {
                var stages = Object.keys(STAGES);
                var index = stages.indexOf(button.dataset.dnaStage);
                if (event.key === 'ArrowRight') index = (index + 1) % stages.length;
                else if (event.key === 'ArrowLeft') index = (index + stages.length - 1) % stages.length;
                else if (event.key === 'Home') index = 0;
                else if (event.key === 'End') index = stages.length - 1;
                else return;
                event.preventDefault();
                renderStage(stages[index]);
                document.getElementById('dna-tab-' + stages[index]).focus();
            };
        });
        var requested = new URLSearchParams(location.search).get('stage');
        renderStage(STAGES[requested] ? requested : 'scan');
        if (!liveTimer) liveTimer = setInterval(tick, 150);
    }

    function segmentChanged(index) {
        currentSegmentIndex = Number(index) || 0;
        tick();
    }

    global.RiffDNA = { init: init, renderStage: renderStage, segmentChanged: segmentChanged, decorateSegmentControls: decorateSegmentControls };
})(window);
