<?php
/** Server side of js/riff-difficulty.js: the same five levels and six criteria (0–3 each). */
const RIFF_DIFFICULTY_LEVELS = ['beginner' => 0, 'beginner-plus' => 4, 'intermediate' => 6, 'intermediate-plus' => 8, 'advanced' => 10];
const RIFF_DIFFICULTY_CRITERIA = ['tempo', 'leftHand', 'rightHand', 'rhythm', 'fretboard', 'stamina'];

function riff_difficulty_level_for_total(int $sum): string {
    $found = 'beginner';
    foreach (RIFF_DIFFICULTY_LEVELS as $key => $min) if ($sum >= $min) $found = $key;
    return $found;
}

/** Error text, or null when `difficulty` / `difficultyScore` are fine (both optional). */
function riff_difficulty_error(array $riff): ?string {
    if (isset($riff['difficulty']) && !array_key_exists((string)$riff['difficulty'], RIFF_DIFFICULTY_LEVELS)) {
        return 'difficulty must be one of: ' . implode(', ', array_keys(RIFF_DIFFICULTY_LEVELS));
    }
    if (!isset($riff['difficultyScore']) || $riff['difficultyScore'] === null) return null;
    $score = $riff['difficultyScore'];
    if (!is_array($score)) return 'difficultyScore must be an object';
    $sum = 0;
    foreach (RIFF_DIFFICULTY_CRITERIA as $c) {
        if (!isset($score[$c])) return "difficultyScore.$c required (0–3)";
        if (!is_int($score[$c]) || $score[$c] < 0 || $score[$c] > 3) return "difficultyScore.$c must be 0–3";
        $sum += $score[$c];
    }
    if (isset($riff['difficulty']) && $riff['difficulty'] !== riff_difficulty_level_for_total($sum)) {
        return 'difficulty does not match difficultyScore (' . $sum . ' → ' . riff_difficulty_level_for_total($sum) . ')';
    }
    return null;
}
