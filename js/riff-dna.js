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
        scan: { title: 'Hear the whole phrase first', hint: 'A riff is a phrase, like a sentence. The coloured words are its parts in playing order, and ×N is how many times the phrase repeats.' },
        split: { title: 'The parts and their jobs', hint: 'Each part of the riff has a job in the phrase: it opens it, builds tension, turns or comes home. The job is the same idea in every riff, the notes are this riff\'s own.' },
        isolate: { title: 'Techniques to watch', hint: 'Techniques are what the hands do at an exact moment: a bend, a slide, a palm mute. Each one is marked at its time in the video.' },
        decode: { title: 'Why it sounds like this', hint: 'The rule is what makes this riff recognisable. Keep it and you can change the rest.' },
        mutate: { title: 'Write your own on the same idea', hint: 'Keep the rule, change the notes, and you get a riff of your own built the same way.' }
    };

    function hint(text, label) {
        return global.RKHint ? global.RKHint.icon(text, label) : '';
    }

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
                known: !!(tech && tech.key !== 'other'),
                short: tech && tech.short ? tech.short : '',
                key: tech ? tech.key : '',
                label: a.label || '',
                tip: a.tip || '',
                hint: tech && tech.hint ? tech.hint : '',
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

    // The riff's phrase: the repeating block of roles and how many times it plays (see RiffDNAVocab.phrase).
    function phrase() {
        var p = V.phrase(segments().map(function (s) { return s.role ? s.role.key : ''; }));
        return { unit: p.unit.map(V.role), times: p.times };
    }

    function roleWord(role, withHint) {
        return '<span class="dna-role-word" style="--role:' + role.color + '">' + esc(role.label) +
            (withHint ? hint(role.hint, role.label) : '') + '</span>';
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
        var seen = {};
        var sentence = p.unit.length
            ? '<p class="dna-phrase" aria-label="Riff phrase">' + p.unit.map(function (role) {
                var first = !seen[role.key];
                seen[role.key] = true;
                return roleWord(role, first);
            }).join('<span class="dna-phrase-sep" aria-hidden="true">→</span>') +
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
        // Dots are the techniques on the part buttons; free-form notes ("other") are only in the Techniques tab.
        var marks = atoms().filter(function (a) { return a.known; }).map(function (a) {
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
                '<div><strong>' + esc(r.role.label) + hint(r.role.hint, r.role.label) + '</strong>' +
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
                return '<li class="dna-atom-item"><button type="button" class="dna-detail dna-atom-card" data-dna-atom="' + a.index + '" data-time="' + a.time + '">' +
                    '<span class="dna-detail-type">' + fmtTime(a.time) + where + '</span>' +
                    '<strong>' + esc(a.name) + (a.label ? ' <em>' + esc(a.label) + '</em>' : '') + '</strong>' +
                    (a.tip ? '<small>' + esc(a.tip) + '</small>' : '') +
                '</button>' + hint(a.hint, a.name) + '</li>';
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
        if (title) title.innerHTML = esc(STAGES[stage].title) + hint(STAGES[stage].hint, STAGES[stage].title);
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
        if (seg && seg.role) parts.push('<span class="dna-live-role" style="--role:' + seg.role.color + '" data-tip="' + esc(seg.role.hint) + '">' + esc(seg.role.label) + '</span>');
        if (now) parts.push('<strong>' + esc(now.name) + '</strong>' + (now.label ? ' ' + esc(now.label) : ''));
        else if (next) parts.push('Next: ' + esc(next.name) + ' at ' + fmtTime(next.time));
        live.innerHTML = parts.join('<span class="dna-live-sep" aria-hidden="true">·</span>');
        live.hidden = !parts.length;
    }

    /* ---------- segment buttons under the video ---------- */

    // Older lessons named the buttons after their half of the riff ("Statement · Pass 1", "Answer · Detail").
    // Once a part has a role, that word only competes with the coloured role, so the button keeps the rest of the name.
    var LEGACY_WORDS = ['statement', 'response', 'a', 'b'];
    function nameWithoutRoleWord(name) {
        var m = /^\s*(?:the\s+)?([a-z]+)\s*[·:\-–—]\s*(.+)$/i.exec(name || '');
        if (!m) return name;
        var word = m[1].toLowerCase();
        return V.role(word) || LEGACY_WORDS.indexOf(word) >= 0 ? m[2] : name;
    }

    function segmentRole(segment) {
        var role = V.role(V.roleFromLegacy(segment));
        if (role) return role;
        // An empty role saved in the editor means a drill shot; a riff with no DNA at all gets no labels.
        return segment && segment.role === '' && hasDNA(activeRiff) ? V.practice : null;
    }

    function segmentKey(roles, techniques) {
        var guide = techniques ? '<button type="button" class="segment-key-guide" data-dna-guide aria-haspopup="dialog">' +
            '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">' +
            '<circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" stroke-width="1.3"/>' +
            '<circle cx="8" cy="4.9" r="0.95" fill="currentColor"/>' +
            '<path d="M8 7.2v4.6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>' +
            '<span>Techniques</span></button>' : '';
        if (!roles.length) return guide;
        return '<span class="segment-key-title">Part roles' +
            hint('The coloured word on a part is its job in the phrase. It is the same set of jobs in every riff.', 'part roles') + '</span>' +
            roles.map(function (role) {
                return '<span class="segment-key-item" style="--role:' + role.color + '">' + esc(role.label) + hint(role.hint, role.label) + '</span>';
            }).join('') + guide;
    }

    // Every technique explained in one place: a popup on a wide screen, a sheet from the bottom on a phone.
    // The ones heard in this riff come first, the whole list stays one tap away.
    function techniqueRow(t) {
        return '<li class="dna-guide-row"><span class="dna-guide-short" translate="no">' + esc(t.short || '') + '</span>' +
            '<span class="dna-guide-text"><b>' + esc(t.label) + '</b><span>' + esc(t.hint || '') + '</span></span></li>';
    }
    function openTechniqueGuide() {
        var used = [];
        atoms().forEach(function (a) {
            if (a.known && used.indexOf(a.key) < 0) used.push(a.key);
        });
        var all = V.techniques.filter(function (t) { return t.key !== 'other'; });
        var mine = used.map(function (k) { return V.technique(k); });
        var rest = all.filter(function (t) { return used.indexOf(t.key) < 0; });
        var dialog = document.getElementById('dnaGuide');
        if (!dialog) {
            dialog = document.createElement('dialog');
            dialog.id = 'dnaGuide';
            dialog.className = 'dna-guide';
            dialog.setAttribute('aria-labelledby', 'dnaGuideTitle');
            document.body.appendChild(dialog);
            // A tap on the dimmed backdrop closes it, like Esc.
            dialog.addEventListener('click', function (event) { if (event.target === dialog) dialog.close(); });
        }
        dialog.innerHTML =
            '<div class="dna-guide-head"><h2 id="dnaGuideTitle">Techniques</h2>' +
            '<button type="button" class="dna-guide-close" aria-label="Close" data-dna-guide-close>' +
            '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></button></div>' +
            '<div class="dna-guide-body">' +
            (mine.length ? '<h3>In this riff</h3><ul class="dna-guide-list">' + mine.map(techniqueRow).join('') + '</ul>' : '') +
            (mine.length
                ? '<details class="dna-guide-all"><summary>All techniques</summary><ul class="dna-guide-list">' + rest.map(techniqueRow).join('') + '</ul></details>'
                : '<ul class="dna-guide-list">' + all.map(techniqueRow).join('') + '</ul>') +
            '</div>';
        dialog.querySelector('[data-dna-guide-close]').onclick = function () { dialog.close(); };
        if (dialog.showModal) dialog.showModal(); else dialog.setAttribute('open', '');
    }
    document.addEventListener('click', function (event) {
        var button = event.target && event.target.closest ? event.target.closest('[data-dna-guide]') : null;
        if (button) openTechniqueGuide();
    });

    function decorateSegmentControls() {
        if (!activeRiff || !Array.isArray(activeRiff.segments)) return;
        var container = document.getElementById('segmentControls');
        var used = [];
        var buttons = document.querySelectorAll('.segment-btn:not(.all-riff)');
        // Techniques heard in each part, once each, in playing order. Only the method's own techniques: their
        // names are translated, free-form names from the admin are not and would mix languages on the button.
        var techniques = {};
        atoms().forEach(function (a) {
            if (!a.segment || !a.known) return;
            var list = techniques[a.segment.index] = techniques[a.segment.index] || [];
            if (!list.some(function (t) { return t.name === a.name; })) list.push(a);
        });
        buttons.forEach(function (button, index) {
            var segment = activeRiff.segments[index];
            if (!segment) return;
            var name = button.querySelector('.segment-name');
            var role = segmentRole(segment);
            var old = button.querySelector('.dna-segment-role');
            if (old) old.remove();
            var oldAtoms = button.querySelector('.dna-segment-atoms');
            if (oldAtoms) oldAtoms.remove();
            if (techniques[index]) {
                var box = document.createElement('span');
                box.className = 'dna-segment-atoms';
                techniques[index].forEach(function (a) {
                    var chip = document.createElement('span');
                    chip.className = 'dna-segment-atom';
                    // Full name on wide screens, tab shorthand (b, PM, ~) on a phone, where the button is short.
                    chip.innerHTML = '<span class="dna-atom-full">' + esc(a.name) + '</span>' +
                        '<span class="dna-atom-short" translate="no">' + esc(a.short || a.name) + '</span>';
                    if (a.hint) chip.setAttribute('data-tip', a.hint);
                    box.appendChild(chip);
                });
                button.appendChild(box);
            }
            if (name) name.textContent = role ? nameWithoutRoleWord(segment.displayName || segment.name || name.textContent) : (segment.displayName || name.textContent);
            if (!role) return;
            // The role's colour on the part's piece of the timeline, like the role word on its button.
            var piece = document.querySelector('.segment[data-index="' + index + '"]');
            if (piece) piece.style.setProperty('--segment-color', role.color);
            if (used.indexOf(role) < 0 && !used.some(function (r) { return r.key === role.key; })) used.push(role);
            var tag = document.createElement('span');
            tag.className = 'dna-segment-role' + (role.key ? '' : ' dna-segment-role--drill');
            tag.style.setProperty('--role', role.color);
            tag.setAttribute('data-tip', role.hint);
            tag.textContent = role.label;
            button.appendChild(tag);
        });
        if (!container || !container.parentNode) return;
        var key = document.getElementById('segmentKey');
        if (!key) {
            key = document.createElement('div');
            key.id = 'segmentKey';
            key.className = 'segment-key';
            container.parentNode.insertBefore(key, container);
        }
        // Key in the order roles go in the method (start → tension → turn → home), drill last.
        var order = V.roles.map(function (r) { return r.key; });
        used.sort(function (x, y) { return (x.key ? order.indexOf(x.key) : 99) - (y.key ? order.indexOf(y.key) : 99); });
        var anyTechnique = Object.keys(techniques).length > 0;
        key.innerHTML = segmentKey(used, anyTechnique);
        key.hidden = !used.length && !anyTechnique;
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
