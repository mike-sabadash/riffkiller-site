(function (global) {
    'use strict';

    var activeRiff = null;
    var activeStage = 'scan';
    var currentSegmentIndex = 0;

    var STAGES = {
        scan: { kicker: '01 / SCAN', title: 'Hear the organism' },
        split: { kicker: '02 / SPLIT', title: 'See the molecules' },
        isolate: { kicker: '03 / ISOLATE', title: 'Find the atoms' },
        decode: { kicker: '04 / DECODE', title: 'Reveal the hidden law' },
        mutate: { kicker: '05 / MUTATE', title: 'Keep the law. Change the notes.' }
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
                overview: 'Black Dog is a two-molecule organism: a displaced statement and a resolving answer.',
                formula: '5/8 STATEMENT + 4/4 ANSWER + QUARTER-TONE ATTITUDE',
                structure: ['A', 'B', 'A', 'B', 'A', 'B'],
                law: 'The statement compresses the pulse; the answer restores the ground. Their alternation creates the hook.',
                insight: 'The phrase sounds free, but the asymmetry is organized.',
                atoms: [],
                mutation: { title: 'Build a related riff', description: 'Keep the asymmetrical relationship and change the notes.', steps: ['Write a short 5/8 statement.', 'Answer it in 4/4.', 'Change only the final return.'] }
            };
        }
        var segments = riff && Array.isArray(riff.segments) ? riff.segments : [];
        if (!Array.isArray(dna.structure) || !dna.structure.length) {
            dna.structure = segments.map(function (s, i) { return s.molecule || String(i + 1); }).slice(0, 8);
        }
        if (!dna.formula) dna.formula = 'PULSE + SHAPE + TOUCH';
        if (!dna.overview) dna.overview = 'Break the performance into playable molecules, then use the three synchronized views to remove the guesswork.';
        if (!dna.law) dna.law = 'The pattern becomes recognizable through repetition; its character appears where that repetition changes.';
        if (!dna.insight) dna.insight = 'Listen for the relationship between timing, movement and articulation — not only the fret numbers.';
        if (!Array.isArray(dna.atoms)) dna.atoms = [];
        if (!dna.mutation) dna.mutation = { title: 'Build a related riff', description: 'Preserve the central rule and change one musical dimension at a time.', steps: ['Keep the rhythm.', 'Change the pitch shape.', 'Restore the original ending.'] };
        return dna;
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
                    title: segment.moleculeName || segment.name || ('Molecule ' + id),
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

    function renderStructure() {
        var el = document.getElementById('dnaStructure');
        if (!el || !activeRiff) return;
        var dna = getDNA(activeRiff);
        var colors = {};
        moleculeMap().forEach(function (m) { colors[m.id] = m.color; });
        el.innerHTML = dna.structure.map(function (id) {
            return '<span class="dna-structure-chip" style="--molecule-color:' + esc(colors[id] || '#9355E5') + '">' + esc(id) + '</span>';
        }).join('<span aria-hidden="true" style="color:rgba(255,255,255,.24);align-self:center">→</span>');
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
            '<p class="dna-copy-note">Start with the complete performance. Do not solve the fingers yet — first hear the shape, the pulse and the moment the phrase returns.</p>' +
            '<button type="button" class="dna-action" data-dna-action="play-all">Play the complete riff</button>';
    }

    function renderSplit() {
        var cards = moleculeMap().map(function (m) {
            return '<article class="dna-molecule-card" style="--molecule-color:' + esc(m.color) + '">' +
                '<span class="dna-card-label">Molecule ' + esc(m.id) + ' · ' + m.count + ' passes</span>' +
                '<strong class="dna-card-title">' + esc(m.title) + '</strong>' +
                '<p class="dna-card-desc">' + esc(m.description) + '</p>' +
                '<button type="button" class="dna-card-button" style="--molecule-color:' + esc(m.color) + '" data-dna-segment="' + m.firstIndex + '">Loop molecule ' + esc(m.id) + '</button>' +
                '</article>';
        }).join('');
        return '<div class="dna-card-grid">' + cards + '</div>';
    }

    function renderIsolate(dna) {
        if (!dna.atoms.length) {
            return '<p class="dna-copy-lead">This riff has not been atomized yet.</p><p class="dna-copy-note">You can still use Left hand, Right hand, Tabs and the segment loops above.</p>';
        }
        return '<p class="dna-copy-note" style="margin-top:0;margin-bottom:16px">Select an atom. RiffKiller will open the most useful camera, slow the phrase down and loop the correct molecule.</p>' +
            '<div class="dna-atom-list">' + dna.atoms.map(function (atom, index) {
                return '<button type="button" class="dna-atom-card" data-dna-atom="' + index + '">' +
                    '<span class="dna-atom-type">' + esc(atom.type || 'Atom') + '</span>' +
                    '<strong>' + esc(atom.label || 'Musical event') + '</strong>' +
                    '<small>' + esc(atom.tip || 'Watch how this event connects to the pulse.') + '</small>' +
                '</button>';
            }).join('') + '</div>';
    }

    function renderDecode(dna) {
        var parts = String(dna.formula).split('+');
        var formula = parts.map(function (part) { return '<b>' + esc(part.trim()) + '</b>'; }).join('<span>+</span>');
        return '<div class="dna-decode-grid">' +
            '<article class="dna-decode-card"><span class="dna-card-label">DNA CODE</span><div class="dna-formula">' + formula + '</div><p class="dna-law">' + esc(dna.law) + '</p></article>' +
            '<article class="dna-decode-card"><span class="dna-card-label">THE FINGERPRINT</span><div class="dna-fingerprint" aria-label="Riff fingerprint"><i style="--h:40%"></i><i style="--h:72%"></i><i style="--h:52%"></i><i style="--h:28%"></i><i style="--h:40%"></i><i style="--h:72%"></i><i class="break" style="--h:86%"></i><i style="--h:40%"></i></div><p class="dna-insight">' + esc(dna.insight) + '</p></article>' +
        '</div>';
    }

    function renderMutate(dna) {
        var mutation = dna.mutation || {};
        return '<article class="dna-mutation-card"><span class="dna-card-label">SAME DNA · NEW RIFF</span>' +
            '<strong class="dna-card-title">' + esc(mutation.title || 'Build a mutation') + '</strong>' +
            '<p class="dna-card-desc">' + esc(mutation.description || '') + '</p>' +
            '<ol class="dna-mutation-steps">' + (mutation.steps || []).map(function (step) { return '<li>' + esc(step) + '</li>'; }).join('') + '</ol>' +
            '<button type="button" class="dna-action" data-dna-stage-jump="split">Return to the molecules</button></article>';
    }

    function renderStage(stage) {
        if (!activeRiff || !STAGES[stage]) return;
        activeStage = stage;
        var dna = getDNA(activeRiff);
        var meta = STAGES[stage];
        var kicker = document.getElementById('dnaStageKicker');
        var title = document.getElementById('dnaStageTitle');
        var content = document.getElementById('dnaStageContent');
        if (kicker) kicker.textContent = meta.kicker;
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
            if (name && segment.molecule) name.insertAdjacentHTML('beforeend', '<span class="dna-molecule-badge">' + esc(segment.molecule) + '</span>');
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
                if (!segment.moleculeName) segment.moleculeName = index % 2 === 0 ? 'The statement' : 'The answer';
                if (!segment.relation) segment.relation = index < 2 ? (index === 0 ? 'Core cell' : 'Resolution') : 'Repeat';
            });
        }
        var dna = getDNA(riff);
        var formula = document.getElementById('dnaCompactFormula');
        var overview = document.getElementById('dnaOverviewText');
        if (formula) formula.textContent = dna.formula;
        if (overview) overview.textContent = dna.overview;
        renderStructure();
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
        document.querySelectorAll('.dna-structure-chip').forEach(function(el) {
            var segment = activeRiff && activeRiff.segments[currentSegmentIndex];
            el.classList.toggle('active', !!segment && el.textContent === segment.molecule);
        });
    }

    global.RiffDNA = { init: init, renderStage: renderStage, segmentChanged: segmentChanged, decorateSegmentControls: decorateSegmentControls };
})(window);

