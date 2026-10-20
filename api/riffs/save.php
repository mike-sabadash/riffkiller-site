<?php
/**
 * POST JSON body: { "riff": { id?, song, artist, videoFile, videoFileRight, thumbnail, duration, difficulty, genre, isFree, segments[] } }
 * If riff.id exists and matches existing → update; else → append with new id.
 */
error_reporting(0);
ini_set('display_errors', 0);

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once dirname(__DIR__, 2) . '/config/admin-auth.php';
require_admin_api();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit();
}

$raw = file_get_contents('php://input');
$body = json_decode($raw, true);
$riff = isset($body['riff']) && is_array($body['riff']) ? $body['riff'] : null;

if (!$riff || empty($riff['song']) || empty($riff['artist'])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'riff.song and riff.artist required']);
    exit();
}

$base = dirname(__DIR__, 2);
require_once $base . '/config/riff-validation.php';
$error = riff_validation_error($riff);
if ($error !== null) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => $error]);
    exit();
}
$file = $base . '/data/riffs.json';
if (!is_dir(dirname($file))) mkdir(dirname($file), 0755, true);
// Serialize editor saves and replace the JSON atomically so readers never see half a file.
$lock = fopen($file . '.lock', 'c');
if (!$lock || !flock($lock, LOCK_EX)) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Could not lock riff store']);
    exit();
}
$list = is_file($file) ? json_decode(file_get_contents($file), true) : [];
if (!is_array($list)) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Riff store is unreadable; no changes saved']);
    exit();
}
$id = (int)($riff['id'] ?? 0);
$idx = null;
foreach ($list as $i => $existing) {
    if ($id > 0 && (int)($existing['id'] ?? 0) === $id) { $idx = $i; break; }
}
if ($idx !== null) {
    if (isset($body['expectedRiff']) && $body['expectedRiff'] != $list[$idx]) {
        http_response_code(409);
        echo json_encode(['success' => false, 'error' => 'This riff was changed elsewhere. Reload it before saving.']);
        exit();
    }
    $riff = array_replace($list[$idx], $riff);
} elseif ($id > 0) {
    http_response_code(409);
    echo json_encode(['success' => false, 'error' => 'This riff no longer exists. Reload the list.']);
    exit();
} else {
    $id = 1;
    foreach ($list as $existing) $id = max($id, (int)($existing['id'] ?? 0) + 1);
    $riff['id'] = $id;
}
$riff['collectionIds'] = array_values(array_unique(array_filter(array_map('intval', $riff['collectionIds'] ?? []), function($n) { return $n > 0; })));
$riff['duration'] = max((float)($riff['duration'] ?? 0), count($riff['segments']) ? (float)end($riff['segments'])['end'] : 0);
if ($idx !== null) $list[$idx] = $riff;
else $list[] = $riff;
$temp = tempnam(dirname($file), '.riffs-');
$encoded = json_encode($list, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
if ($encoded === false || file_put_contents($temp, $encoded) === false || !rename($temp, $file)) {
    if (is_file($temp)) unlink($temp);
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Failed to save riff']);
    exit();
}
flock($lock, LOCK_UN);
fclose($lock);
echo json_encode(['success' => true, 'riff' => $riff]);
