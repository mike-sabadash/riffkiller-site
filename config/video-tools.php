<?php
/**
 * Helpers for the admin video tools: chunked uploads and cropping one recording into two cameras.
 * Work files live in data/video-work (never served); finished media goes under assets/video.
 */

function video_root() {
    return dirname(__DIR__);
}

function video_work_dir($sub) {
    $dir = video_root() . '/data/video-work/' . $sub;
    if (!is_dir($dir)) mkdir($dir, 0750, true);
    return $dir;
}

/** A media path under assets/video with a video extension, or null. */
function video_clean_path($path) {
    $path = ltrim(trim((string)$path), '/');
    if ($path === '' || strpos($path, '..') !== false) return null;
    if (!preg_match('#^assets/video/[a-zA-Z0-9/_.\-]+\.(mp4|webm|mov|m4v)$#i', $path)) return null;
    return $path;
}

/** Slug for folder and file names: "Led Zeppelin" -> "led-zeppelin". */
function video_slug($text) {
    $slug = strtolower(preg_replace('/[^a-zA-Z0-9]+/', '-', (string)$text));
    $slug = trim($slug, '-');
    return $slug === '' ? 'riff' : substr($slug, 0, 60);
}

/** Keeps existing media: "left.mp4" becomes "left-2.mp4" when the name is taken. */
function video_unique_path($path) {
    $root = video_root();
    if (!file_exists($root . '/' . $path)) return $path;
    $dot = strrpos($path, '.');
    $base = substr($path, 0, $dot);
    $ext = substr($path, $dot);
    for ($i = 2; $i < 1000; $i++) {
        $candidate = $base . '-' . $i . $ext;
        if (!file_exists($root . '/' . $candidate)) return $candidate;
    }
    return $base . '-' . bin2hex(random_bytes(3)) . $ext;
}

function video_binary($name) {
    foreach (['/usr/bin/', '/usr/local/bin/', '/opt/homebrew/bin/'] as $dir) {
        if (is_executable($dir . $name)) return $dir . $name;
    }
    $found = trim((string)@shell_exec('command -v ' . escapeshellarg($name) . ' 2>/dev/null'));
    return $found !== '' ? $found : null;
}

/** Width, height and duration of the first video stream as the browser shows it (rotation applied). */
function video_probe($file) {
    $ffprobe = video_binary('ffprobe');
    if (!$ffprobe) return null;
    $cmd = escapeshellarg($ffprobe) . ' -v error -select_streams v:0 -show_entries stream=width,height:stream_side_data=rotation:stream_tags=rotate:format=duration -of json ' . escapeshellarg($file) . ' 2>/dev/null';
    $info = json_decode((string)shell_exec($cmd), true);
    $stream = $info['streams'][0] ?? null;
    if (!$stream || empty($stream['width']) || empty($stream['height'])) return null;
    $rotation = (int)($stream['tags']['rotate'] ?? 0);
    foreach ($stream['side_data_list'] ?? [] as $side) {
        if (isset($side['rotation'])) $rotation = (int)$side['rotation'];
    }
    $w = (int)$stream['width'];
    $h = (int)$stream['height'];
    if (abs($rotation) % 180 === 90) { $t = $w; $w = $h; $h = $t; }
    return ['width' => $w, 'height' => $h, 'duration' => (float)($info['format']['duration'] ?? 0)];
}

/** Integer crop box inside the frame with even sides (H.264 needs them), or null. */
function video_crop_box($box, $width, $height) {
    if (!is_array($box)) return null;
    foreach (['x', 'y', 'w', 'h'] as $k) {
        if (!isset($box[$k]) || !is_numeric($box[$k])) return null;
    }
    $x = max(0, (int)round($box['x']));
    $y = max(0, (int)round($box['y']));
    $w = (int)round($box['w']);
    $h = (int)round($box['h']);
    $w = min($w, $width - $x);
    $h = min($h, $height - $y);
    $w -= $w % 2;
    $h -= $h % 2;
    if ($w < 16 || $h < 16) return null;
    return ['x' => $x, 'y' => $y, 'w' => $w, 'h' => $h];
}

function video_json($data, $status = 200) {
    http_response_code($status);
    echo json_encode($data);
    exit();
}
