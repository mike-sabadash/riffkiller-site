<?php
/**
 * Our own visit and sign-up counters, without cookies or third parties.
 * data/stats/YYYY-MM-DD.json holds plain daily totals { "event[:detail]": count } — no IP, no user id, no browser id.
 * The page sends an event with api/stats/event.php; the server adds account events itself (user_create, me.php).
 * Read by scripts/funnel-report.php (workflow Funnel report).
 */

const SITE_STATS_MAX_KEYS = 400; // per day: a flood of made-up names cannot grow the file without end

function site_stats_dir() {
    return dirname(__DIR__) . '/data/stats';
}

/** "auth_open:drop", "signup_click:google:inapp" — lower-case words, up to two details. '' when not valid. */
function site_stats_normalize($event) {
    $event = strtolower(trim((string)$event));
    return preg_match('/^[a-z][a-z_]{1,29}(?::[a-z0-9][a-z0-9_.-]{0,29}){0,2}$/', $event) ? $event : '';
}

function site_stats_count($event, $n = 1) {
    $event = site_stats_normalize($event);
    if ($event === '') return false;
    $dir = site_stats_dir();
    if (!is_dir($dir) && !@mkdir($dir, 0755, true)) return false;
    $file = $dir . '/' . gmdate('Y-m-d') . '.json';
    $lock = @fopen($dir . '/.lock', 'c');
    if (!$lock || !flock($lock, LOCK_EX)) return false;
    $data = json_decode((string)@file_get_contents($file), true);
    if (!is_array($data)) $data = [];
    $ok = false;
    if (isset($data[$event]) || count($data) < SITE_STATS_MAX_KEYS) {
        $data[$event] = (int)($data[$event] ?? 0) + max(1, (int)$n);
        ksort($data);
        $temp = @tempnam($dir, '.stats-');
        if ($temp && file_put_contents($temp, json_encode($data, JSON_PRETTY_PRINT)) !== false) { @chmod($temp, 0644); $ok = rename($temp, $file); }
    }
    flock($lock, LOCK_UN);
    fclose($lock);
    return $ok;
}

/**
 * A signed-in visit (api/me.php): once a day per account it keeps the date (last_seen, a day only) and counts
 * active_user, plus returning_user when the account was made on an earlier day.
 */
function site_stats_seen($user) {
    if (!is_array($user) || empty($user['id']) || !function_exists('user_touch_seen')) return;
    $today = gmdate('Y-m-d');
    if (($user['last_seen'] ?? '') === $today) return;
    if (!user_touch_seen($user['id'], $today)) return;
    site_stats_count('active_user');
    $created = !empty($user['created_at']) ? gmdate('Y-m-d', strtotime((string)$user['created_at'])) : '';
    if ($created !== '' && $created < $today) site_stats_count('returning_user');
}
