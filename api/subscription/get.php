<?php
/**
 * Get unified subscription for a user. Called by frontend after login.
 * GET ?user_id=xxx (or ?session_id=xxx for Stripe success page fallback)
 */
error_reporting(0);
ini_set('display_errors', 0);

require_once dirname(__DIR__, 2) . '/config/load-env.php';
require_once dirname(__DIR__, 2) . '/config/subscription-store.php';

$origin = isset($_SERVER['HTTP_ORIGIN']) ? $_SERVER['HTTP_ORIGIN'] : '';
$allowOrigin = 'https://riffkiller.fun';
if (preg_match('#^https://riffkiller\.fun$#', $origin) || preg_match('#^http://(localhost|127\.0\.0\.1)(:\d+)?$#', $origin)) {
    $allowOrigin = $origin;
}
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: ' . $allowOrigin);
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$userId = isset($_GET['user_id']) ? trim((string) $_GET['user_id']) : '';
$sessionId = isset($_GET['session_id']) ? trim((string) $_GET['session_id']) : '';

if ($userId === '' && $sessionId === '') {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'user_id or session_id required']);
    exit();
}

if ($userId === '' && $sessionId !== '') {
    $userId = 'stripe_' . preg_replace('/[^a-zA-Z0-9_]/', '', $sessionId);
}

$sub = get_subscription($userId);
if ($sub === null) {
    echo json_encode(['success' => true, 'subscription' => null]);
    exit();
}

echo json_encode([
    'success' => true,
    'subscription' => [
        'status' => $sub['status'],
        'plan' => $sub['plan'],
        'source' => $sub['source'],
        'expiresAt' => $sub['expires'],
    ],
]);
