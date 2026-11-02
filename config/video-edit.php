<?php
/**
 * A light copy of the left camera for the admin riff editor (js/admin-segments.js).
 *
 * Why: the editor downloads its video whole before it plays (streamed from far away it played in one-second
 * bursts). The camera is ~15 MB at 1512 px; for matching parts to the sound 854 px is enough and weighs ~6 times
 * less. Same frames and timestamps (-fps_mode passthrough), the sound copied as it is, so every time on the
 * timeline is the same as in the camera video.
 *
 *   <left video without .mp4>-edit/<hash>.mp4   hash of the camera path, its size and VIDEO_EDIT_VERSION
 * The camera's size changes on every replacement or re-key, so a stale copy is never offered (editVideo in the
 * list API). Built in the background with the part videos (config/video-parts-cli.php).
 */
require_once __DIR__ . '/video-tools.php';

// 1: max 854 px wide, crf 27, keyframes every 0.25 s, sound copied.
const VIDEO_EDIT_VERSION = 1;

/** Path of the editor copy for the riff's left camera as it is now, or null without a camera video. */
function video_edit_path($riff) {
    $left = video_clean_path($riff['videoFile'] ?? '');
    if (!$left) return null;
    $size = @filesize(video_root() . '/' . $left);
    if ($size === false) return null;
    return preg_replace('/\.[a-z0-9]+$/i', '', $left) . '-edit/' . substr(sha1(json_encode([$left, $size, VIDEO_EDIT_VERSION])), 0, 12) . '.mp4';
}

/** The editor copy when it is built for the camera as it is now, else null. */
function video_edit_ready($riff) {
    $path = video_edit_path($riff);
    return $path && is_file(video_root() . '/' . $path) ? $path : null;
}

/** Adds editVideo to a riff when its editor copy is ready. */
function video_edit_offer($riff) {
    if (!is_array($riff)) return $riff;
    $path = video_edit_ready($riff);
    if ($path) $riff['editVideo'] = $path;
    return $riff;
}

function video_edit_frames($ffprobe, $file) {
    return (int)trim((string)shell_exec(escapeshellarg($ffprobe) . ' -v error -count_frames -select_streams v:0 -show_entries stream=nb_read_frames -of csv=p=0 '
        . escapeshellarg($file) . ' 2>/dev/null'));
}

/** Builds the editor copy now. Returns a line for the log. */
function video_edit_run($riff) {
    $root = video_root();
    $path = video_edit_path($riff);
    if (!$path) return '#' . ($riff['id'] ?? '?') . ': no camera video for the editor copy';
    if (is_file($root . '/' . $path)) return $path . ': up to date';
    $ffmpeg = video_binary('ffmpeg');
    $ffprobe = video_binary('ffprobe');
    if (!$ffmpeg || !$ffprobe) throw new RuntimeException('ffmpeg or ffprobe not found');
    $source = $root . '/' . video_clean_path($riff['videoFile']);
    $dir = dirname($root . '/' . $path);
    if (!is_dir($dir)) mkdir($dir, 0755, true);
    $tmp = $dir . '/.part-' . getmypid() . '-' . basename($path);
    $cmd = escapeshellarg($ffmpeg) . ' -nostdin -v error -y -i ' . escapeshellarg($source)
        . ' -map 0:v:0 -map 0:a:0? -vf ' . escapeshellarg("scale='min(854,iw)':-2:flags=lanczos")
        . ' -fps_mode passthrough -c:v libx264 -preset veryfast -crf 27 -pix_fmt yuv420p -force_key_frames "expr:gte(t,n_forced*0.25)"'
        . ' -c:a copy -movflags +faststart -f mp4 ' . escapeshellarg($tmp) . ' 2>&1';
    exec($cmd, $lines, $code);
    // A copy with frames missing or added would put the part edges in the wrong place: never offer one.
    $want = video_edit_frames($ffprobe, $source);
    $got = $code === 0 && is_file($tmp) ? video_edit_frames($ffprobe, $tmp) : 0;
    if ($want <= 0 || $got !== $want) {
        @unlink($tmp);
        throw new RuntimeException('editor copy failed for ' . $path . ' (' . $got . ' of ' . $want . ' frames): ' . implode(' ', array_slice($lines, -3)));
    }
    @chmod($tmp, fileperms($source) & 0777);
    if (!rename($tmp, $root . '/' . $path)) { @unlink($tmp); throw new RuntimeException('could not write ' . $path); }
    // Copies of an older camera are no longer offered: remove them.
    foreach ((array)glob($dir . '/*.mp4') as $old) {
        if (basename($old) !== basename($path)) @unlink($old);
    }
    return $path . ': built';
}
