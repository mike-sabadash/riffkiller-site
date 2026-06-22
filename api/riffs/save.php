<?php
/**
 * POST JSON body: { "riff": { id?, song, artist, videoFile, videoFileRight, thumbnail, duration, difficulty, genre, isFree, segments[] } }
 * If riff.id exists and matches existing → update; else → append with new id.
 */
error_reporting(0);
ini_set('display_errors', 0);

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

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
$file = $base . '/data/riffs.json';
$dir = dirname($file);
if (!is_dir($dir)) {
    mkdir($dir, 0755, true);
}

$list = [];
if (is_file($file)) {
    $list = json_decode(file_get_contents($file), true);
    if (!is_array($list)) $list = [];
}

$id = isset($riff['id']) ? (int) $riff['id'] : 0;
$idx = null;
if ($id > 0) {
    foreach ($list as $i => $r) {
        if (isset($r['id']) && (int) $r['id'] === $id) { $idx = $i; break; }
    }
}

$normalizeCollectionIds = function ($rawIds) {
    if (!is_array($rawIds)) {
        return [];
    }
    return array_values(array_unique(array_filter(array_map('intval', $rawIds), function ($n) {
        return $n > 0;
    })));
};

if (array_key_exists('collectionIds', $riff)) {
    $riff['collectionIds'] = $normalizeCollectionIds($riff['collectionIds']);
} elseif ($idx !== null && isset($list[$idx]['collectionIds']) && is_array($list[$idx]['collectionIds'])) {
    $riff['collectionIds'] = $normalizeCollectionIds($list[$idx]['collectionIds']);
} else {
    $riff['collectionIds'] = [];
}

if ($id > 0) {
    if ($idx !== null) {
        $list[$idx] = $riff;
    } else {
        $riff['id'] = $id;
        $list[] = $riff;
    }
} else {
    $maxId = 0;
    foreach ($list as $r) {
        if (isset($r['id']) && (int) $r['id'] > $maxId) $maxId = (int) $r['id'];
    }
    $riff['id'] = $maxId + 1;
    $riff['isFavorite'] = isset($riff['isFavorite']) ? (bool) $riff['isFavorite'] : false;
    $riff['lastPracticed'] = isset($riff['lastPracticed']) ? $riff['lastPracticed'] : null;
    $list[] = $riff;
}

$encoded = json_encode($list, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
if (file_put_contents($file, $encoded) === false) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Failed to write file']);
    exit();
}

echo json_encode(['success' => true, 'riff' => $riff]);
