const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const D = require('../js/riff-difficulty.js');

test('difficulty: six scores give one of five levels', () => {
    const s = (a) => Object.fromEntries(D.CRITERIA.map((c, i) => [c.key, a[i]]));
    assert.equal(D.keyOf({ difficultyScore: s([0, 0, 0, 1, 1, 0]) }), 'beginner');
    assert.equal(D.keyOf({ difficultyScore: s([1, 1, 1, 1, 1, 0]) }), 'beginner-plus');
    assert.equal(D.keyOf({ difficultyScore: s([1, 1, 1, 2, 1, 1]) }), 'intermediate');
    assert.equal(D.keyOf({ difficultyScore: s([3, 1, 1, 1, 1, 2]) }), 'intermediate-plus');
    assert.equal(D.keyOf({ difficultyScore: s([2, 2, 1, 3, 1, 1]) }), 'advanced');
    assert.equal(D.keyOf({ difficulty: 'beginner' }), 'beginner', 'no scores: the stored level');
    assert.equal(D.keyOf({ difficulty: 'expert' }), 'intermediate', 'unknown level: the default');
    assert.ok(D.order('beginner') < D.order('beginner-plus') && D.order('intermediate-plus') < D.order('advanced'));
});

test('difficulty: the server accepts the same levels and checks the level against the scores', () => {
    const php = `require '${path.join(__dirname, '../config/riff-difficulty.php')}';
        $s = ['tempo'=>2,'leftHand'=>2,'rightHand'=>1,'rhythm'=>3,'fretboard'=>1,'stamina'=>1];
        echo json_encode([
            riff_difficulty_error(['difficulty'=>'advanced','difficultyScore'=>$s]),
            riff_difficulty_error(['difficulty'=>'beginner','difficultyScore'=>$s]),
            riff_difficulty_error(['difficulty'=>'beginner-plus']),
            riff_difficulty_error(['difficulty'=>'expert']),
            riff_difficulty_error(['difficultyScore'=>['tempo'=>5]]),
        ]);`;
    const out = JSON.parse(execFileSync('php', ['-r', php]).toString());
    assert.equal(out[0], null);
    assert.match(out[1], /does not match/);
    assert.equal(out[2], null);
    assert.match(out[3], /must be one of/);
    assert.match(out[4], /required|0–3/);
});
