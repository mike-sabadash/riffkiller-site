<?php
/**
 * A riff is on the site only when it has a video and the admin has not ticked «Скрыть с сайта».
 * Drafts (name, cover, collections, no video yet) stay in data/riffs.json for the admin only.
 */
function riff_is_public($riff) {
    return is_array($riff) && empty($riff['hidden']) && trim((string)($riff['videoFile'] ?? '')) !== '';
}

/** @return array<int, array<string,mixed>> */
function riff_public_list($riffs) {
    return array_values(array_filter(is_array($riffs) ? $riffs : [], 'riff_is_public'));
}
