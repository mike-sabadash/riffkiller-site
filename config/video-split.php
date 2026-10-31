<?php
/**
 * Split view as one video. A phone (iPhone 11) cannot play and seek the two camera videos at once smoothly: in Split
 * the picture stuttered and the hands drifted apart. So each riff also gets one video with the left camera in full
 * and the right camera in a window at the top left, as the phone's Split showed it; a phone plays that one file.
 *
 *   <left video without .mp4>-split.mp4 next to the camera videos (served like them).
 * Built in the background (config/video-split-cli.php) when a riff is saved and once for all riffs on deploy
 * (data migration). The list API offers it (videoFileSplit) only while it matches the current camera videos.
 */
require_once __DIR__ . '/video-tools.php';
require_once __DIR__ . '/video-rekey.php';

// 1: left 1280 px wide, right 556 px window top left with a 2 px dark edge, crf 23, keyframes like the cameras.
const VIDEO_SPLIT_VERSION = 1;

/** Path of a riff's Split video (whether or not it exists yet), or null without two different cameras. */
function video_split_path($riff) {
    $left = video_clean_path($riff['videoFile'] ?? '');
    $right = video_clean_path($riff['videoFileRight'] ?? '');
    if (!$left || !$right || $left === $right) return null;
    return preg_replace('/\.[a-z0-9]+$/i', '', $left) . '-split.mp4';
}

function video_split_marker($path) {
    return video_work_dir('split') . '/' . sha1($path) . '.json';
}

/** Sizes of the two camera videos, which change whenever either is replaced or re-keyed. */
function video_split_sources($riff) {
    $root = video_root();
    $left = video_clean_path($riff['videoFile'] ?? '');
    $right = video_clean_path($riff['videoFileRight'] ?? '');
    return ['left' => $left, 'right' => $right,
        'leftSize' => $left ? @filesize($root . '/' . $left) : false, 'rightSize' => $right ? @filesize($root . '/' . $right) : false];
}

/** The Split video exists and was built from the current camera videos with the current recipe. */
function video_split_ready($riff) {
    $path = video_split_path($riff);
    if (!$path || !is_file(video_root() . '/' . $path)) return false;
    $done = json_decode((string)@file_get_contents(video_split_marker($path)), true);
    $now = video_split_sources($riff);
    return is_array($done) && ($done['version'] ?? 0) === VIDEO_SPLIT_VERSION
        && ($done['left'] ?? null) === $now['left'] && ($done['right'] ?? null) === $now['right']
        && ($done['leftSize'] ?? null) === $now['leftSize'] && ($done['rightSize'] ?? null) === $now['rightSize']
        && ($done['size'] ?? null) === @filesize(video_root() . '/' . $path);
}

/** Adds videoFileSplit to a riff for the page when its Split video is ready. */
function video_split_offer($riff) {
    if (is_array($riff) && video_split_ready($riff)) $riff['videoFileSplit'] = video_split_path($riff);
    return $riff;
}

/** Starts a background build for the riff (or every riff: null) when needed; returns whether one was started. */
function video_split_schedule($riffId = null) {
    require_once __DIR__ . '/load-env.php';
    if (strtolower((string)($_ENV['VIDEO_REKEY'] ?? getenv('VIDEO_REKEY') ?: '')) === 'off') return false;
    $php = video_binary('php') ?: (defined('PHP_BINARY') && PHP_BINARY ? PHP_BINARY : null);
    if (!$php || !video_binary('ffmpeg')) return false;
    $log = video_work_dir('split') . '/build.log';
    $args = $riffId === null ? '--all' : '--riff ' . escapeshellarg((string)$riffId);
    // nice: the server is shared with other sites; the build may take a minute per riff.
    exec('nohup nice -n 10 ' . escapeshellarg($php) . ' ' . escapeshellarg(video_root() . '/config/video-split-cli.php') . ' ' . $args
        . ' < /dev/null >> ' . escapeshellarg($log) . ' 2>&1 &');
    return true;
}

/** Builds one riff's Split video now (after its cameras got their keyframes). Returns a line for the log. */
function video_split_run($riff) {
    $root = video_root();
    $path = video_split_path($riff);
    if (!$path) return '#' . ($riff['id'] ?? '?') . ': no two camera videos';
    $src = video_split_sources($riff);
    if (!is_file($root . '/' . $src['left']) || !is_file($root . '/' . $src['right'])) return $path . ': camera video missing';
    // Keyframes first: the cameras may be re-encoded right after a save, which would make this build stale at once.
    $starts = video_rekey_starts($riff);
    if ($starts) foreach (video_rekey_videos($riff) as $video) {
        try { video_rekey_run($video, $starts); } catch (Throwable $e) { /* the cameras stay as they are */ }
    }
    $lock = fopen(video_work_dir('split') . '/' . sha1($path) . '.lock', 'c');
    if (!$lock || !flock($lock, LOCK_EX)) throw new RuntimeException('could not lock ' . $path);
    try {
        clearstatcache();
        if (video_split_ready($riff)) return $path . ': up to date';
        $src = video_split_sources($riff);
        $info = video_probe($root . '/' . $src['left']);
        $ffmpeg = video_binary('ffmpeg');
        if (!$ffmpeg || !$info || $info['duration'] <= 0) throw new RuntimeException('cannot read ' . $src['left']);
        $keys = $starts;
        for ($t = 0; $t < $info['duration']; $t += 0.5) $keys[] = round($t, 3);
        $keys = array_values(array_unique(array_map('floatval', $keys)));
        sort($keys);
        $tmp = dirname($root . '/' . $path) . '/.split-' . getmypid() . '-' . basename($path);
        $filter = '[0:v]scale=1280:-2:flags=lanczos[b];[1:v]scale=556:-2:flags=lanczos,pad=iw+2:ih+2:0:0:color=0x111111[p];'
            . '[b][p]overlay=0:0:shortest=1[v]';
        $cmd = escapeshellarg($ffmpeg) . ' -nostdin -v error -y -i ' . escapeshellarg($root . '/' . $src['left'])
            . ' -i ' . escapeshellarg($root . '/' . $src['right']) . ' -filter_complex ' . escapeshellarg($filter)
            . ' -map "[v]" -map "0:a?" -c:v libx264 -preset fast -crf 23 -bf 0 -pix_fmt yuv420p -force_key_frames '
            . escapeshellarg(implode(',', $keys)) . ' -c:a copy -movflags +faststart ' . escapeshellarg($tmp) . ' 2>&1';
        exec($cmd, $out, $code);
        $after = $code === 0 ? video_probe($tmp) : null;
        if (!$after || abs($after['duration'] - $info['duration']) > 0.1) {
            @unlink($tmp);
            throw new RuntimeException('split build failed for ' . $path . ': ' . implode(' ', array_slice($out, -3)));
        }
        @chmod($tmp, fileperms($root . '/' . $src['left']) & 0777);
        if (!rename($tmp, $root . '/' . $path)) { @unlink($tmp); throw new RuntimeException('could not write ' . $path); }
        clearstatcache();
        file_put_contents(video_split_marker($path), json_encode($src + ['version' => VIDEO_SPLIT_VERSION,
            'size' => filesize($root . '/' . $path), 'at' => gmdate('c')]));
        return $path . ': built, ' . filesize($root . '/' . $path) . ' bytes';
    } finally {
        flock($lock, LOCK_UN);
        fclose($lock);
    }
}
