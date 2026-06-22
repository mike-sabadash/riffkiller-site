<?php
/**
 * POST JSON body: { "order": [id1, id2, id3, ...] } — reorder riffs by id list
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
$order = isset($body['order']) && is_array($body['order']) ? $body['order'] : [];

if (empty($order)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'order array required']);
    exit();
}

$base = dirname(__DIR__, 2);
$file = $base . '/data/riffs.json';
if (!is_file($file)) {
    echo json_encode(['success' => true]);
    exit();
}

$list = json_decode(file_get_contents($file), true);
if (!is_array($list)) {
    echo json_encode(['success' => true]);
    exit();
}

$byId = [];
foreach ($list as $r) {
    if (isset($r['id'])) $byId[(int)$r['id']] = $r;
}

$newList = [];
foreach ($order as $id) {
    $id = (int) $id;
    if (isset($byId[$id])) {
        $newList[] = $byId[$id];
    }
}
foreach ($list as $r) {
    if (isset($r['id']) && !in_array((int)$r['id'], array_map('intval', $order))) {
        $newList[] = $r;
    }
}

$encoded = json_encode($newList, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
if (file_put_contents($file, $encoded) === false) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Failed to write file']);
    exit();
}

echo json_encode(['success' => true]);
