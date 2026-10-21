/**
 * Riff DNA vocabulary shared by the practice page and the admin editor.
 * Molecule = a segment's job in the phrase (verb from the method's Phrase Grammar).
 * Atom = a technique used at one moment of the riff.
 * Colours follow the method: start = yellow, tension = magenta, turn = cyan, home = green, environment = grey.
 */
(function (global) {
    'use strict';

    var GROUP_COLORS = {
        start: '#F2D94E',
        tension: '#E35DF0',
        turn: '#4FD8E8',
        home: '#B8F05A',
        space: '#7A7A85'
    };

    var ROLES = [
        { key: 'call', label: 'Call', group: 'start', hint: 'Opens the phrase and sets up what comes next' },
        { key: 'launch', label: 'Launch', group: 'start', hint: 'Jumps in, often right after a pause' },
        { key: 'push', label: 'Push', group: 'tension', hint: 'Drives forward and adds momentum' },
        { key: 'repeat', label: 'Repeat', group: 'tension', hint: 'Repeats a short cell so the ear locks onto it' },
        { key: 'climb', label: 'Climb', group: 'tension', hint: 'Moves up and builds tension' },
        { key: 'fall', label: 'Fall', group: 'tension', hint: 'Moves down and lets the tension out' },
        { key: 'hang', label: 'Hang', group: 'tension', hint: 'Holds on and leaves the phrase unresolved' },
        { key: 'turn', label: 'Turn', group: 'turn', hint: 'Changes direction and starts heading home' },
        { key: 'answer', label: 'Answer', group: 'turn', hint: 'Replies to the phrase before it' },
        { key: 'land', label: 'Land', group: 'home', hint: 'Arrives home on the root' },
        { key: 'reset', label: 'Reset', group: 'home', hint: 'Gets ready for the next cycle' },
        { key: 'space', label: 'Space', group: 'space', hint: 'Silence, vocal or another instrument that is part of the riff' }
    ];

    var TECHNIQUES = [
        { key: 'bend', label: 'Bend' },
        { key: 'qbend', label: 'Quarter-tone bend' },
        { key: 'release', label: 'Bend release' },
        { key: 'vibrato', label: 'Vibrato' },
        { key: 'slide', label: 'Slide' },
        { key: 'hammer', label: 'Hammer-on' },
        { key: 'pull', label: 'Pull-off' },
        { key: 'legato', label: 'Legato run' },
        { key: 'trill', label: 'Trill' },
        { key: 'palm', label: 'Palm mute' },
        { key: 'rake', label: 'Rake' },
        { key: 'accent', label: 'Accent' },
        { key: 'ghost', label: 'Ghost note' },
        { key: 'double', label: 'Double stop' },
        { key: 'harmonic', label: 'Harmonic' },
        { key: 'open', label: 'Open string' },
        { key: 'tremolo', label: 'Tremolo picking' },
        { key: 'gap', label: 'Pause' },
        { key: 'anchor', label: 'Home note' },
        { key: 'other', label: 'Other' }
    ];

    function find(list, key) {
        key = String(key || '').toLowerCase();
        for (var i = 0; i < list.length; i++) if (list[i].key === key) return list[i];
        return null;
    }

    function role(key) {
        var r = find(ROLES, key);
        return r ? { key: r.key, label: r.label, group: r.group, hint: r.hint, color: GROUP_COLORS[r.group] } : null;
    }

    function technique(key) {
        return find(TECHNIQUES, key);
    }

    // Older lessons named parts freely ("The statement", molecule "A"). Map a name to a role when it is one of our verbs.
    var LEGACY_NAMES = { statement: 'call', call: 'call', answer: 'answer', response: 'answer', 'return': 'land' };
    function roleFromLegacy(segment) {
        if (!segment) return '';
        if (segment.role !== undefined) return find(ROLES, segment.role) ? segment.role : '';
        var name = String(segment.moleculeName || '').toLowerCase().replace(/^the\s+/, '').trim();
        if (find(ROLES, name)) return name;
        return LEGACY_NAMES[name] || '';
    }

    global.RiffDNAVocab = {
        roles: ROLES,
        techniques: TECHNIQUES,
        groupColors: GROUP_COLORS,
        role: role,
        technique: technique,
        roleFromLegacy: roleFromLegacy
    };
})(typeof window !== 'undefined' ? window : this);
