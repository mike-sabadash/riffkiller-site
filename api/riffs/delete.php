<?php
/**
 * POST JSON body: { "id": 1 } — remove riff with that id from data/riffs.json
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
$id = isset($body['id']) ? (int) $body['id'] : 0;

if ($id <= 0) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'id required']);
    exit();
}

$base = dirname(__DIR__, 2);
$file = $base . '/data/riffs.json';
if (!is_file($file)) {
    echo json_encode(['success' => true, 'deleted' => true]);
    exit();
}

$list = json_decode(file_get_contents($file), true);
if (!is_array($list)) {
    echo json_encode(['success' => true, 'deleted' => true]);
    exit();
}

$newList = array_values(array_filter($list, function ($r) use ($id) {
    return !isset($r['id']) || (int) $r['id'] !== $id;
}));

$encoded = json_encode($newList, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
if (file_put_contents($file, $encoded) === false) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Failed to write file']);
    exit();
}

echo json_encode(['success' => true, 'deleted' => true]);
