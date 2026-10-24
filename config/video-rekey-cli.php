<?php
/**
 * Keyframes at part starts (config/video-rekey.php), from the command line.
 *   php config/video-rekey-cli.php <video path> <start,start,...>   one video (what saving a riff starts)
 *   php config/video-rekey-cli.php --riff <id>                        both videos of a riff
 *   php config/video-rekey-cli.php --all                              every riff
 */
if (PHP_SAPI !== 'cli') exit(1);
require_once __DIR__ . '/video-rekey.php';

$args = array_slice($argv, 1);
$jobs = [];
if (($args[0] ?? '') === '--riff' || ($args[0] ?? '') === '--all') {
    $list = json_decode((string)@file_get_contents(video_root() . '/data/riffs.json'), true);
    if (!is_array($list)) { fwrite(STDERR, "data/riffs.json is unreadable\n"); exit(1); }
    foreach ($list as $riff) {
        if ($args[0] === '--riff' && (string)($riff['id'] ?? '') !== (string)($args[1] ?? '')) continue;
        $starts = video_rekey_starts($riff);
        if (!$starts) continue;
        foreach (video_rekey_videos($riff) as $path) $jobs[] = [$path, $starts];
    }
    if (!$jobs) { fwrite(STDERR, "no riff videos with parts found\n"); exit(2); }
} elseif (count($args) === 2) {
    $starts = array_map(function ($t) { return round((float)$t, 3); }, array_filter(explode(',', $args[1]), 'is_numeric'));
    $jobs[] = [$args[0], $starts];
} else {
    fwrite(STDERR, "usage: video-rekey-cli.php <video> <starts> | --riff <id> | --all\n");
    exit(1);
}

$failed = 0;
foreach ($jobs as [$path, $starts]) {
    try {
        echo gmdate('c'), ' ', video_rekey_run($path, $starts), "\n";
    } catch (Throwable $e) {
        $failed++;
        echo gmdate('c'), ' ERROR ', $e->getMessage(), "\n";
    }
}
exit($failed ? 1 : 0);
