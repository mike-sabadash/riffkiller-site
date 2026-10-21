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
        { key: 'call', label: 'Call', group: 'start', hint: 'The first idea of the phrase. It sets up the material that the next part answers.' },
        { key: 'launch', label: 'Launch', group: 'start', hint: 'A sharp entry: the guitar jumps in after a pause, the vocal or another instrument.' },
        { key: 'push', label: 'Push', group: 'tension', hint: 'Adds movement and energy and pulls toward the next part.' },
        { key: 'repeat', label: 'Repeat', group: 'tension', hint: 'Repeats a short motif so the ear locks onto it.' },
        { key: 'climb', label: 'Climb', group: 'tension', hint: 'Moves up in pitch or register, and the tension grows.' },
        { key: 'fall', label: 'Fall', group: 'tension', hint: 'Moves down, and the tension goes away.' },
        { key: 'hang', label: 'Hang', group: 'tension', hint: 'Holds a note or a motif and leaves the phrase unresolved.' },
        { key: 'turn', label: 'Turn', group: 'turn', hint: 'Changes direction and leads the phrase back to the root.' },
        { key: 'answer', label: 'Answer', group: 'turn', hint: 'Replies to the Call: similar rhythm or register, but it closes the thought.' },
        { key: 'land', label: 'Land', group: 'home', hint: 'The phrase comes home, onto the root note.' },
        { key: 'reset', label: 'Reset', group: 'home', hint: 'A link after which the phrase starts again.' },
        { key: 'space', label: 'Space', group: 'space', hint: 'Silence or another part, like the vocal, that is still part of the riff.' }
    ];

    var TECHNIQUES = [
        { key: 'bend', label: 'Bend', hint: 'Push the string across the fret to raise the pitch.' },
        { key: 'qbend', label: 'Quarter-tone bend', hint: 'A small bend, about a quarter tone: the note just goes sour, blues style.' },
        { key: 'release', label: 'Bend release', hint: 'Let a bent string come back down to its normal pitch while it still rings.' },
        { key: 'vibrato', label: 'Vibrato', hint: 'Shake the pitch of a held note up and down to make it sing.' },
        { key: 'slide', label: 'Slide', hint: 'Move to another fret without lifting the finger, so the pitch glides.' },
        { key: 'hammer', label: 'Hammer-on', hint: 'Sound a higher note by hitting the string with a fretting finger, no pick.' },
        { key: 'pull', label: 'Pull-off', hint: 'Pull a fretting finger off the string so a lower note sounds, no pick.' },
        { key: 'legato', label: 'Legato run', hint: 'Several notes in a row played with hammer-ons and pull-offs, picked once.' },
        { key: 'trill', label: 'Trill', hint: 'Fast alternation between two notes with hammer-ons and pull-offs.' },
        { key: 'palm', label: 'Palm mute', hint: 'Rest the picking hand on the strings by the bridge for a tight, muted sound.' },
        { key: 'rake', label: 'Rake', hint: 'Drag the pick across muted strings into the target note.' },
        { key: 'accent', label: 'Accent', hint: 'Play this note harder than the ones around it.' },
        { key: 'ghost', label: 'Ghost note', hint: 'A barely heard, muted note that keeps the rhythm going.' },
        { key: 'double', label: 'Double stop', hint: 'Two notes on neighbouring strings played together.' },
        { key: 'harmonic', label: 'Harmonic', hint: 'A bell-like overtone: touch the string lightly over the fret instead of pressing it.' },
        { key: 'open', label: 'Open string', hint: 'An open string rings under or between the fretted notes.' },
        { key: 'tremolo', label: 'Tremolo picking', hint: 'Pick one note as fast and evenly as you can.' },
        { key: 'gap', label: 'Pause', hint: 'A planned pause. The silence is part of the rhythm.' },
        { key: 'anchor', label: 'Home note', hint: 'The note the riff keeps coming back to.' },
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

    // A part with no role is a drill shot: it stays a loop button but is not part of the phrase.
    var PRACTICE = { key: '', label: 'Drill', hint: 'A shot for practice only. It is not part of the phrase.', color: GROUP_COLORS.space };

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

    // Shortest block that repeats through the whole riff, with neighbouring shots of one role merged.
    // Works for any block length: Call → Answer ×4, Launch → Push → Land ×2, a 5-part phrase played once.
    // keys: role keys in playing order (practice-only shots left out). Returns { unit: [keys], times }.
    function merge(list) {
        return list.filter(function (k, i) { return i === 0 || k !== list[i - 1]; });
    }
    function cycle(list) {
        for (var size = 1; size <= list.length / 2; size++) {
            if (list.length % size) continue;
            var ok = true;
            for (var i = size; i < list.length && ok; i++) ok = list[i] === list[i % size];
            if (ok) return { unit: list.slice(0, size), times: list.length / size };
        }
        return null;
    }
    function phrase(keys) {
        keys = (keys || []).filter(Boolean);
        // Shot by shot first, so a block that starts and ends on the same role (Call → Push → Call) is not glued
        // to the next pass; then with neighbours merged, for passes cut into a different number of shots.
        var found = cycle(keys);
        if (found && merge(found.unit).length > 1) return { unit: merge(found.unit), times: found.times };
        var merged = merge(keys);
        return cycle(merged) || { unit: merged, times: 1 };
    }

    global.RiffDNAVocab = {
        phrase: phrase,
        roles: ROLES,
        techniques: TECHNIQUES,
        groupColors: GROUP_COLORS,
        practice: PRACTICE,
        role: role,
        technique: technique,
        roleFromLegacy: roleFromLegacy
    };
})(typeof window !== 'undefined' ? window : this);
