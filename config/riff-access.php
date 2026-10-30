<?php
/**
 * Access on top of price (isFree): a riff can carry a lock with a reason, and a teaser link (dropKey).
 *   lock: ''      — open, as before
 *         'soon'  — in the library with a padlock and «Soon», practice does not open it
 *   dropKey: short slug for the Instagram teaser link riffkiller.fun/drop/?r=<dropKey>.
 *            The link opens that one riff in full (even locked or paid) in a focus mode without site navigation.
 * The admin signed in at /admin/ sees and opens everything (list.php marks the riffs with adminView).
 */

const RIFF_LOCKS = ['soon'];

function riff_lock($riff) {
    $lock = is_array($riff) ? (string)($riff['lock'] ?? '') : '';
    return in_array($lock, RIFF_LOCKS, true) ? $lock : '';
}

/** Lower-case latin letters, digits and dashes, 2–40 characters; '' when absent. */
function riff_drop_key_normalize($key) {
    $key = strtolower(trim((string)$key));
    return preg_match('/^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/', $key) && strlen($key) >= 2 ? $key : '';
}

/** @return array|null the riff whose teaser link this is */
function riff_by_drop_key($riffs, $key) {
    $key = riff_drop_key_normalize($key);
    if ($key === '' || !is_array($riffs)) return null;
    foreach ($riffs as $riff) {
        if (is_array($riff) && riff_is_public_for_drop($riff) && riff_drop_key_normalize($riff['dropKey'] ?? '') === $key) return $riff;
    }
    return null;
}

/** A hidden draft has no working link: the teaser goes out once the riff is on the site. */
function riff_is_public_for_drop($riff) {
    return empty($riff['hidden']) && !empty($riff['videoFile']);
}

/** Error text, or null. Keeps the lock reason known and the teaser link unique. */
function riff_access_error($riff, $others) {
    if (isset($riff['lock']) && $riff['lock'] !== '' && riff_lock($riff) === '') return 'Unknown lock reason';
    $raw = trim((string)($riff['dropKey'] ?? ''));
    if ($raw === '') return null;
    $key = riff_drop_key_normalize($raw);
    if ($key === '') return 'Teaser link: latin letters, digits and dashes, 2–40 characters';
    foreach (is_array($others) ? $others : [] as $other) {
        if (!is_array($other) || (int)($other['id'] ?? 0) === (int)($riff['id'] ?? 0)) continue;
        if (riff_drop_key_normalize($other['dropKey'] ?? '') === $key) return 'Teaser link «' . $key . '» is already used by ' . ($other['song'] ?? 'another riff');
    }
    return null;
}

/** Visit and sign-up counts per teaser link: data/drops.json { key: { opens, signups, lastOpen } }. */
function riff_drop_stats_file() {
    return dirname(__DIR__) . '/data/drops.json';
}

function riff_drop_stats() {
    $data = json_decode((string)@file_get_contents(riff_drop_stats_file()), true);
    return is_array($data) ? $data : [];
}

function riff_drop_count($key, $field) {
    $key = riff_drop_key_normalize($key);
    if ($key === '' || !in_array($field, ['opens', 'signups'], true)) return;
    $file = riff_drop_stats_file();
    $lock = @fopen($file . '.lock', 'c');
    if (!$lock || !flock($lock, LOCK_EX)) return;
    $data = riff_drop_stats();
    $row = isset($data[$key]) && is_array($data[$key]) ? $data[$key] : [];
    $row[$field] = (int)($row[$field] ?? 0) + 1;
    if ($field === 'opens') $row['lastOpen'] = gmdate('c');
    $data[$key] = $row;
    $temp = @tempnam(dirname($file), '.drops-');
    if ($temp && file_put_contents($temp, json_encode($data, JSON_PRETTY_PRINT)) !== false) rename($temp, $file);
    flock($lock, LOCK_UN);
    fclose($lock);
}
