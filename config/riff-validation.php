<?php
/** Saved seconds are used unchanged by the editor, both cameras and the tabs. */
function riff_validation_error($riff) {
    if (!is_array($riff) || empty(trim((string)($riff['song'] ?? ''))) || empty(trim((string)($riff['artist'] ?? '')))) {
        return 'riff.song and riff.artist required';
    }
    if (!isset($riff['segments']) || !is_array($riff['segments'])) return 'segments array required';
    $previousEnd = 0;
    foreach ($riff['segments'] as $i => $segment) {
        if (!is_array($segment) || !isset($segment['start'], $segment['end']) ||
            !is_numeric($segment['start']) || !is_numeric($segment['end'])) return 'Segment ' . ($i + 1) . ': start and end required';
        $start = (float)$segment['start'];
        $end = (float)$segment['end'];
        if (!is_finite($start) || !is_finite($end) || $start < 0 || $end <= $start || ($i > 0 && $start < $previousEnd)) {
            return 'Segment ' . ($i + 1) . ': invalid or overlapping bounds';
        }
        $previousEnd = $end;
    }
    if (isset($riff['dna']['atoms'])) {
        if (!is_array($riff['dna']['atoms'])) return 'DNA atoms must be an array';
        foreach ($riff['dna']['atoms'] as $atom) {
            if (isset($atom['segmentIndex']) && (!is_int($atom['segmentIndex']) || $atom['segmentIndex'] < 0 || $atom['segmentIndex'] >= count($riff['segments']))) {
                return 'Atom references a missing segment';
            }
        }
    }
    return null;
}
