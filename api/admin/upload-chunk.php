<?php
/**
 * Chunked video upload for the riff editor (PHP on the server accepts only 2 MB per request).
 * POST multipart: uploadId (hex), index (0-based), total, path (assets/video/...), chunk (file).
 * Chunks must arrive in order; the last one moves the file to a free name next to `path`.
 * Returns { success, done, path? }.
 */
error_reporting(0);
ini_set('display_errors', 0);
header('Content-Type: application/json; charset=utf-8');

require_once dirname(__DIR__, 2) . '/config/admin-auth.php';
require_admin_api();
require_once dirname(__DIR__, 2) . '/config/video-tools.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') video_json(['success' => false, 'error' => 'Method not allowed'], 405);

$id = (string)($_POST['uploadId'] ?? '');
$index = (int)($_POST['index'] ?? -1);
$total = (int)($_POST['total'] ?? 0);
$path = video_clean_path($_POST['path'] ?? '');
if (!preg_match('/^[a-f0-9]{16,64}$/', $id) || $index < 0 || $total < 1 || $total > 600 || $index >= $total) {
    video_json(['success' => false, 'error' => 'Bad chunk'], 400);
}
if ($path === null) video_json(['success' => false, 'error' => 'Invalid path'], 400);
if (!isset($_FILES['chunk']) || $_FILES['chunk']['error'] !== UPLOAD_ERR_OK) {
    video_json(['success' => false, 'error' => 'Chunk upload failed'], 400);
}

$dir = video_work_dir('uploads');
$part = $dir . '/' . $id . '.part';
$metaFile = $dir . '/' . $id . '.json';
$meta = is_file($metaFile) ? json_decode(file_get_contents($metaFile), true) : null;
if ($index === 0) {
    $meta = ['next' => 0, 'total' => $total, 'path' => $path];
    @unlink($part);
}
if (!is_array($meta) || $meta['next'] !== $index || $meta['total'] !== $total || $meta['path'] !== $path) {
    video_json(['success' => false, 'error' => 'Chunks out of order; start the upload again'], 409);
}

$in = fopen($_FILES['chunk']['tmp_name'], 'rb');
$out = fopen($part, 'ab');
if (!$in || !$out || stream_copy_to_stream($in, $out) === false) {
    video_json(['success' => false, 'error' => 'Could not store chunk'], 500);
}
fclose($in);
fclose($out);

$meta['next'] = $index + 1;
if ($meta['next'] < $total) {
    file_put_contents($metaFile, json_encode($meta));
    video_json(['success' => true, 'done' => false]);
}

$final = video_unique_path($path);
$full = video_root() . '/' . $final;
if (!is_dir(dirname($full)) && !mkdir(dirname($full), 0755, true)) {
    video_json(['success' => false, 'error' => 'Could not create directory'], 500);
}
if (!rename($part, $full)) video_json(['success' => false, 'error' => 'Could not save file'], 500);
@chmod($full, 0644);
@unlink($metaFile);
video_json(['success' => true, 'done' => true, 'path' => $final]);
