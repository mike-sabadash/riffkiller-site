<?php
/**
 * POST JSON: { "collection": { id?, name, imageUrl, isFavorite? } }
 * Состав риффов задаётся в админке риффа (collectionIds), не здесь.
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

require_once dirname(__DIR__, 2) . '/config/collections-lib.php';

$raw = file_get_contents('php://input');
$body = json_decode($raw, true);
$collection = isset($body['collection']) && is_array($body['collection']) ? $body['collection'] : null;

if (!$collection || empty(trim((string)($collection['name'] ?? '')))) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'collection.name required']);
    exit();
}

$imageUrl = trim((string)($collection['imageUrl'] ?? ''));
if ($imageUrl === '') {
    $imageUrl = 'assets/img/collections-1.png';
}

$list = rk_collections_load_meta();
$file = rk_collections_meta_path();
$dir = dirname($file);
if (!is_dir($dir)) {
    mkdir($dir, 0755, true);
}

$out = [
    'name' => trim((string)$collection['name']),
    'imageUrl' => $imageUrl,
    'isFavorite' => !empty($collection['isFavorite']),
];

$id = isset($collection['id']) ? (int) $collection['id'] : 0;
if ($id > 0) {
    $idx = null;
    foreach ($list as $i => $c) {
        if (isset($c['id']) && (int) $c['id'] === $id) {
            $idx = $i;
            break;
        }
    }
    $out['id'] = $id;
    if ($idx !== null) {
        $list[$idx] = $out;
    } else {
        $list[] = $out;
    }
} else {
    $maxId = 0;
    foreach ($list as $c) {
        if (isset($c['id']) && (int) $c['id'] > $maxId) {
            $maxId = (int) $c['id'];
        }
    }
    $out['id'] = $maxId + 1;
    $list[] = $out;
}

$encoded = json_encode($list, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
if (file_put_contents($file, $encoded) === false) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Failed to write file']);
    exit();
}

$built = rk_collections_build_list();
$full = null;
foreach ($built as $row) {
    if ((int)($row['id'] ?? 0) === (int)$out['id']) {
        $full = $row;
        break;
    }
}

echo json_encode(['success' => true, 'collection' => $full ?: array_merge($out, ['riffs' => [], 'videoCount' => 0])]);
