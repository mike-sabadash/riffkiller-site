<?php
error_reporting(0);
ini_set('display_errors', 0);
if (ob_get_level()) ob_clean();

// ==========================================================================
// Cryptomus Order Status - Riff Killer
// GET ?order_id=xxx - returns subscription for success page (update localStorage).
// ==========================================================================

$origin = isset($_SERVER['HTTP_ORIGIN']) ? $_SERVER['HTTP_ORIGIN'] : '';
$allowOrigin = 'https://riffkiller.fun';
if (preg_match('#^https://riffkiller\.fun$#', $origin) || preg_match('#^http://(localhost|127\.0\.0\.1)(:\d+)?$#', $origin)) {
    $allowOrigin = $origin;
}
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: ' . $allowOrigin);
header('Access-Control-Allow-Methods: GET, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$orderId = isset($_GET['order_id']) ? (string) $_GET['order_id'] : '';
if ($orderId === '') {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Missing order_id']);
    exit();
}

$storeFile = __DIR__ . '/data/cryptomus-subscriptions.json';
if (!is_file($storeFile)) {
    http_response_code(404);
    echo json_encode(['success' => false, 'error' => 'Order not found']);
    exit();
}

$store = json_decode(file_get_contents($storeFile), true);
if (!is_array($store) || !isset($store[$orderId])) {
    http_response_code(404);
    echo json_encode(['success' => false, 'error' => 'Order not found']);
    exit();
}

$rec = $store[$orderId];
$plan = isset($rec['plan']) && $rec['plan'] === 'yearly' ? 'yearly' : 'monthly';
$expiresAt = isset($rec['expires_at']) ? (int) $rec['expires_at'] : null;
$status = isset($rec['status']) ? $rec['status'] : 'active';

echo json_encode([
    'success' => true,
    'subscription' => [
        'source' => 'cryptomus',
        'status' => $status,
        'expiresAt' => $expiresAt,
        'plan' => $plan,
    ],
]);
