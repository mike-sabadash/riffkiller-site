<?php
/**
 * Keyframes at part starts. A looped part jumps back to its start on every pass; a phone (iPhone) decodes
 * from the keyframe before the target, and with keyframes 0.5 s or more apart the picture stalls for half a
 * second each time. A riff's two camera videos are re-encoded with a keyframe at every part start and every
 * 0.2 s; sound is copied unchanged, so the part sound cut from it stays the same.
 *
 * Saving a riff schedules this in the background when its part starts changed (scripts/video-rekey.php).
 * The first original of each video is kept in data/video-work/originals (never served).
 */
require_once __DIR__ . '/video-tools.php';

const VIDEO_REKEY_VERSION = 1;

/** Part starts of a riff, rounded to milliseconds, sorted and unique. */
function video_rekey_starts($riff) {
    $starts = [];
    foreach (($riff['segments'] ?? []) as $segment) {
        if (isset($segment['start']) && is_numeric($segment['start'])) $starts[] = round((float)$segment['start'], 3);
    }
    $starts = array_values(array_unique($starts));
    sort($starts);
    return $starts;
}

/** Both camera videos of a riff (one when they are the same file). */
function video_rekey_videos($riff) {
    $videos = [];
    foreach (['videoFile', 'videoFileRight'] as $key) {
        $path = video_clean_path($riff[$key] ?? '');
        if ($path && !in_array($path, $videos, true)) $videos[] = $path;
    }
    return $videos;
}

function video_rekey_marker($path) {
    return video_work_dir('rekey') . '/' . sha1($path) . '.json';
}

/** Whether the video still needs keyframes at these starts (not keyed yet, or the parts moved). */
function video_rekey_needed($path, $starts) {
    $marker = video_rekey_marker($path);
    $done = is_file($marker) ? json_decode((string)file_get_contents($marker), true) : null;
    return !is_array($done) || ($done['version'] ?? 0) !== VIDEO_REKEY_VERSION || array_map('floatval', (array)($done['starts'] ?? [])) !== $starts
        || ($done['size'] ?? null) !== @filesize(video_root() . '/' . $path);
}

/** Starts a background re-encode for each video of the riff that needs one; returns their paths. */
function video_rekey_schedule($riff) {
    require_once __DIR__ . '/load-env.php';
    // VIDEO_REKEY=off in .env: the test site never re-encodes its fixture videos behind a running test.
    if (strtolower((string)($_ENV['VIDEO_REKEY'] ?? getenv('VIDEO_REKEY') ?: '')) === 'off') return [];
    $starts = video_rekey_starts($riff);
    $php = video_binary('php') ?: (defined('PHP_BINARY') && PHP_BINARY ? PHP_BINARY : null);
    if (!$starts || !$php || !video_binary('ffmpeg')) return [];
    $scheduled = [];
    foreach (video_rekey_videos($riff) as $path) {
        if (!is_file(video_root() . '/' . $path) || !video_rekey_needed($path, $starts)) continue;
        $log = video_work_dir('rekey') . '/' . sha1($path) . '.log';
        $cmd = escapeshellarg($php) . ' ' . escapeshellarg(video_root() . '/scripts/video-rekey.php') . ' '
            . escapeshellarg($path) . ' ' . escapeshellarg(implode(',', $starts));
        exec('nohup ' . $cmd . ' >> ' . escapeshellarg($log) . ' 2>&1 &');
        $scheduled[] = $path;
    }
    return $scheduled;
}

/**
 * Re-encodes one video now (waits for a run already going on the same file). Returns a line for the log.
 * Throws when the result is not usable; the original then stays in place.
 */
function video_rekey_run($path, $starts) {
    $root = video_root();
    $path = video_clean_path($path);
    if (!$path || !is_file($root . '/' . $path)) throw new RuntimeException('video not found: ' . $path);
    $lock = fopen(video_work_dir('rekey') . '/' . sha1($path) . '.lock', 'c');
    if (!$lock || !flock($lock, LOCK_EX)) throw new RuntimeException('could not lock ' . $path);
    try {
        if (!video_rekey_needed($path, $starts)) return $path . ': already keyed at ' . implode(',', $starts);
        $ffmpeg = video_binary('ffmpeg');
        $src = $root . '/' . $path;
        $info = video_probe($src);
        if (!$ffmpeg || !$info || $info['duration'] <= 0) throw new RuntimeException('cannot read ' . $path);
        // Every part start, and every 0.2 s so any other seek decodes at most 6 frames.
        $keys = $starts;
        for ($t = 0; $t < $info['duration']; $t += 0.2) $keys[] = round($t, 3);
        $keys = array_values(array_unique(array_map('floatval', $keys)));
        sort($keys);
        $tmp = dirname($src) . '/.rekey-' . getmypid() . '-' . basename($src);
        // No B-frames: they add an edit list (picture shifted by two frames) and make a phone decode more per seek.
        $cmd = escapeshellarg($ffmpeg) . ' -nostdin -v error -y -i ' . escapeshellarg($src)
            . ' -map 0:v:0 -map "0:a?" -c:v libx264 -preset slow -crf 16 -bf 0 -pix_fmt yuv420p -force_key_frames '
            . escapeshellarg(implode(',', $keys)) . ' -c:a copy -movflags +faststart ' . escapeshellarg($tmp) . ' 2>&1';
        exec($cmd, $out, $code);
        $after = $code === 0 ? video_probe($tmp) : null;
        if (!$after || abs($after['duration'] - $info['duration']) > 0.1) {
            @unlink($tmp);
            throw new RuntimeException('re-encode failed for ' . $path . ': ' . implode(' ', array_slice($out, -3)));
        }
        $original = video_work_dir('originals') . '/' . $path;
        if (!is_file($original)) {
            if (!is_dir(dirname($original))) mkdir(dirname($original), 0750, true);
            copy($src, $original);
        }
        @chmod($tmp, fileperms($src) & 0777);
        if (function_exists('posix_geteuid') && posix_geteuid() === 0) { @chown($tmp, fileowner($src)); @chgrp($tmp, filegroup($src)); }
        $before = filesize($src);
        if (!rename($tmp, $src)) { @unlink($tmp); throw new RuntimeException('could not replace ' . $path); }
        clearstatcache();
        file_put_contents(video_rekey_marker($path), json_encode(['version' => VIDEO_REKEY_VERSION, 'starts' => $starts,
            'size' => filesize($src), 'at' => gmdate('c')]));
        return $path . ': ' . $before . ' → ' . filesize($src) . ' bytes, keyframes at part starts ' . implode(',', $starts);
    } finally {
        flock($lock, LOCK_UN);
        fclose($lock);
    }
}
