(function (global) {
    'use strict';

    var activeRiff = null;
    var activeStage = 'scan';
    var currentSegmentIndex = 0;

    var STAGES = {
        scan: { title: 'Listen to the whole riff first' },
        split: { title: 'Break it into parts' },
        isolate: { title: 'What to watch for' },
        decode: { title: 'Why it sounds like this' },
        mutate: { title: 'Write your own on the same idea' }
    };

    function esc(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }

    function getDNA(riff) {
        var dna = riff && riff.dna ? riff.dna : {};
        if (riff && Number(riff.id) === 1 && !riff.dna) {
            dna = {
                overview: 'Black Dog sounds like one long, wandering line. It is really two short phrases taking turns: a tight one that pulls against the beat and one that brings it back.',
                formula: '5/8 statement + 4/4 answer + a quarter-tone bend',
                structure: ['A', 'B', 'A', 'B', 'A', 'B'],
                law: 'The first phrase squeezes the beat, the second one puts it back. Going back and forth between them is the hook.',
                insight: 'It sounds loose, but every bar is counted.',
                atoms: [],
                mutation: { title: 'Write a riff in the same spirit', description: 'Keep the uneven back-and-forth, change the notes.', steps: ['Write a short phrase in 5/8.', 'Answer it in 4/4.', 'Change only the last answer.'] }
            };
        }
        var segments = riff && Array.isArray(riff.segments) ? riff.segments : [];
        if (!Array.isArray(dna.structure) || !dna.structure.length) {
            dna.structure = segments.map(function (s, i) { return s.molecule || String(i + 1); }).slice(0, 8);
        }
        if (!dna.formula) dna.formula = 'Rhythm + shape + touch';
        if (!dna.overview) dna.overview = 'Play it through once and get the feel before you work on the hands.';
        if (!dna.law) dna.law = 'You recognise a riff by what repeats. Its character is in the spot where the repeat changes.';
        if (!dna.insight) dna.insight = 'Listen to timing, hand movement and pick attack together, not just the fret numbers.';
        if (!Array.isArray(dna.atoms)) dna.atoms = [];
        if (!dna.mutation) dna.mutation = { title: 'Write a riff of your own', description: 'Keep the rhythm idea and change one thing at a time.', steps: ['Keep the rhythm.', 'Change the notes.', 'Bring back the original ending.'] };
        return dna;
    }

    // Data still says "The statement"; a list row reads better as "Statement".
    function plainName(name) {
        return String(name).replace(/^the\s+/i, '').replace(/^./, function (c) { return c.toUpperCase(); });
    }

    // Stored formulas are written in caps ("5/8 STATEMENT + ..."); show them as a sentence.
    function sentenceCase(text) {
        var t = String(text || '').trim();
        if (t === t.toUpperCase()) t = t.toLowerCase();
        return t.replace(/^./, function (c) { return c.toUpperCase(); });
    }

    function moleculeMap() {
        var segments = activeRiff && Array.isArray(activeRiff.segments) ? activeRiff.segments : [];
        var map = [];
        segments.forEach(function (segment, index) {
            var id = segment.molecule || String(index + 1);
            var item = map.find(function (m) { return m.id === id; });
            if (!item) {
                item = {
                    id: id,
                    title: plainName(segment.moleculeName || segment.name || ('Part ' + id)),
                    description: segment.function || 'A playable phrase inside the complete riff.',
                    color: segment.color || '#9355E5',
                    firstIndex: index,
                    count: 0
                };
                map.push(item);
            }
            item.count += 1;
        });
        return map;
    }

    function playWholeRiff() {
        var button = document.querySelector('.segment-btn.all-riff');
        if (button) button.click();
    }

    function focusSegment(index) {
        if (typeof global.playPracticeSegment === 'function') global.playPracticeSegment(index);
    }

    function focusAtom(index) {
        var dna = getDNA(activeRiff);
        var atom = dna.atoms[index];
        if (!atom) return;
        var segments = activeRiff.segments || [];
        var segmentIndex = 0;
        if (typeof atom.segmentIndex === 'number') segmentIndex = atom.segmentIndex;
        else if (typeof atom.time === 'number') {
            var found = segments.findIndex(function (s) { return atom.time >= Number(s.start) && atom.time <= Number(s.end); });
            if (found >= 0) segmentIndex = found;
        }
        if (typeof global.playPracticeSegment === 'function') {
            global.playPracticeSegment(segmentIndex, {view: atom.view, speed: atom.speed || .5});
        }
        document.querySelectorAll('.dna-atom-card').forEach(function (el, i) { el.classList.toggle('active', i === index); });
    }

    function renderScan(dna) {
        return '<p class="dna-copy-lead">' + esc(dna.overview) + '</p>' +
            '<p class="dna-copy-note">Don’t think about the fingers yet. Listen for the pulse and for the moment the phrase comes back around.</p>' +
            '<button type="button" class="dna-action" data-dna-action="play-all">Play full riff</button>';
    }

    function timesLabel(count) {
        return count === 1 ? 'Plays once' : 'Plays ' + count + ' times';
    }

    function renderSplit() {
        var rows = moleculeMap().map(function (m) {
            return '<li class="dna-part">' +
                '<span class="dna-part-letter" aria-hidden="true">' + esc(m.id) + '</span>' +
                '<div><strong>' + esc(m.title) + '</strong>' +
                '<p>' + esc(m.description) + '</p>' +
                '<span class="dna-part-meta">' + timesLabel(m.count) + '</span></div>' +
                '<button type="button" class="dna-part-loop" data-dna-segment="' + m.firstIndex + '" aria-label="Loop ' + esc(m.title) + '">Loop</button>' +
                '</li>';
        }).join('');
        return '<ul class="dna-list">' + rows + '</ul>';
    }

    function renderIsolate(dna) {
        if (!dna.atoms.length) {
            return '<p class="dna-copy-lead">No details written for this riff yet.</p><p class="dna-copy-note">Use the left and right hand cameras, the tabs and the loops on the left.</p>';
        }
        return '<p class="dna-copy-note" style="margin:0 0 6px">Tap one to loop it slowly from the best camera angle.</p>' +
            '<ul class="dna-list">' + dna.atoms.map(function (atom, index) {
                return '<li><button type="button" class="dna-detail dna-atom-card" data-dna-atom="' + index + '">' +
                    '<span class="dna-detail-type">' + esc(atom.type || 'Detail') + '</span>' +
                    '<strong>' + esc(atom.label || 'Detail') + '</strong>' +
                    '<small>' + esc(atom.tip || 'Watch how this lines up with the beat.') + '</small>' +
                '</button></li>';
            }).join('') + '</ul>';
    }

    function renderDecode(dna) {
        return '<p class="dna-formula">' + esc(sentenceCase(dna.formula)) + '</p>' +
            '<p class="dna-law">' + esc(dna.law) + '</p>' +
            '<p class="dna-insight">' + esc(dna.insight) + '</p>';
    }

    function renderMutate(dna) {
        var mutation = dna.mutation || {};
        return '<strong class="dna-mutation-title">' + esc(mutation.title || 'Write a riff of your own') + '</strong>' +
            (mutation.description ? '<p class="dna-copy-note">' + esc(mutation.description) + '</p>' : '') +
            '<ol class="dna-mutation-steps">' + (mutation.steps || []).map(function (step) { return '<li>' + esc(step) + '</li>'; }).join('') + '</ol>' +
            '<button type="button" class="dna-action dna-action--text" data-dna-stage-jump="split">← Back to the parts</button>';
    }

    function renderStage(stage) {
        if (!activeRiff || !STAGES[stage]) return;
        activeStage = stage;
        var dna = getDNA(activeRiff);
        var meta = STAGES[stage];
        var title = document.getElementById('dnaStageTitle');
        var content = document.getElementById('dnaStageContent');
        if (title) title.textContent = meta.title;
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
        if (stage === 'isolate') content.innerHTML = renderIsolate(dna);
        if (stage === 'decode') content.innerHTML = renderDecode(dna);
        if (stage === 'mutate') content.innerHTML = renderMutate(dna);
        bindStageActions();
    }

    function bindStageActions() {
        document.querySelectorAll('[data-dna-action="play-all"]').forEach(function (el) { el.onclick = playWholeRiff; });
        document.querySelectorAll('[data-dna-segment]').forEach(function (el) { el.onclick = function () { focusSegment(Number(this.dataset.dnaSegment)); }; });
        document.querySelectorAll('[data-dna-atom]').forEach(function (el) { el.onclick = function () { focusAtom(Number(this.dataset.dnaAtom)); }; });
        document.querySelectorAll('[data-dna-stage-jump]').forEach(function (el) { el.onclick = function () { renderStage(this.dataset.dnaStageJump); }; });
    }

    function decorateSegmentControls() {
        if (!activeRiff || !Array.isArray(activeRiff.segments)) return;
        var buttons = document.querySelectorAll('.segment-btn:not(.all-riff)');
        buttons.forEach(function (button, index) {
            var segment = activeRiff.segments[index];
            if (!segment || button.querySelector('.dna-segment-meta')) return;
            var name = button.querySelector('.segment-name');
            if (name && segment.displayName) name.textContent = segment.displayName;
            var meta = document.createElement('span');
            meta.className = 'dna-segment-meta';
            meta.textContent = segment.relation || segment.function || 'Practice segment';
            button.appendChild(meta);
        });
    }

    function init(riff) {
        activeRiff = riff;
        if (Number(riff && riff.id) === 1 && Array.isArray(riff.segments)) {
            riff.segments.forEach(function (segment, index) {
                if (!segment.molecule) segment.molecule = index % 2 === 0 ? 'A' : 'B';
                if (!segment.moleculeName) segment.moleculeName = index % 2 === 0 ? 'Statement' : 'Answer';
                if (!segment.relation) segment.relation = index < 2 ? (index === 0 ? 'Core cell' : 'Resolution') : 'Repeat';
            });
        }
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
    }

    function segmentChanged(index) {
        currentSegmentIndex = Number(index) || 0;
    }

    global.RiffDNA = { init: init, renderStage: renderStage, segmentChanged: segmentChanged, decorateSegmentControls: decorateSegmentControls };
})(window);

