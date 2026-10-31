<?php
/**
 * Split view as one video (config/video-split.php), from the command line.
 *   php config/video-split-cli.php --riff <id>   one riff (what saving a riff starts)
 *   php config/video-split-cli.php --all         every riff (once on deploy)
 */
if (PHP_SAPI !== 'cli') exit(1);
require_once __DIR__ . '/video-split.php';

$args = array_slice($argv, 1);
if (!in_array($args[0] ?? '', ['--riff', '--all'], true)) {
    fwrite(STDERR, "usage: video-split-cli.php --riff <id> | --all\n");
    exit(1);
}
// One run at a time: a deploy and a save can both ask; the second waits and then finds the work done.
$queue = fopen(video_work_dir('split') . '/queue.lock', 'c');
if ($queue) flock($queue, LOCK_EX);
$list = json_decode((string)@file_get_contents(video_root() . '/data/riffs.json'), true);
if (!is_array($list)) { fwrite(STDERR, "data/riffs.json is unreadable\n"); exit(1); }
$failed = 0;
foreach ($list as $riff) {
    if (!is_array($riff) || !video_split_path($riff)) continue;
    if ($args[0] === '--riff' && (string)($riff['id'] ?? '') !== (string)($args[1] ?? '')) continue;
    try {
        echo gmdate('c'), ' ', video_split_run($riff), "\n";
    } catch (Throwable $e) {
        $failed++;
        echo gmdate('c'), ' ERROR ', $e->getMessage(), "\n";
    }
}
exit($failed ? 1 : 0);
