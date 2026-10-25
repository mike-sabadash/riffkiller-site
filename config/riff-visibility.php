<?php
/**
 * A riff is on the site unless the admin ticked «Скрыть с сайта». New riffs start hidden; one without a video
 * may still be shown (its card is in the library, practice says the video is coming soon).
 */
function riff_is_public($riff) {
    return is_array($riff) && empty($riff['hidden']);
}

/** @return array<int, array<string,mixed>> */
function riff_public_list($riffs) {
    return array_values(array_filter(is_array($riffs) ? $riffs : [], 'riff_is_public'));
}
