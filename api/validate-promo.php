<?php
/**
 * Validate promo code without login (e.g. for stub/landing).
 * POST { "code": "RK-XXXXXXXX" } → { "success": true } or { "success": false, "error": "..." }
 * Does not apply or mark the code as used.
 */
error_reporting(0);
ini_set('display_errors', 0);

require_once dirname(__DIR__) . '/config/load-env.php';
require_once dirname(__DIR__) . '/config/promo-store.php';
require_once dirname(__DIR__) . '/config/rate-limit.php';

$origin = isset($_SERVER['HTTP_ORIGIN']) ? $_SERVER['HTTP_ORIGIN'] : '';
$allowOrigin = 'https://riffkiller.fun';
if (preg_match('#^https://riffkiller\.fun$#', $origin) || preg_match('#^http://(localhost|127\.0\.0\.1)(:\d+)?$#', $origin)) {
    $allowOrigin = $origin;
}
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: ' . $allowOrigin);
header('Access-Control-Allow-Credentials: true');
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

$ip = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
if (!rate_limit_check('validate_promo_' . $ip, 30, 3600)) {
    http_response_code(429);
    echo json_encode(['success' => false, 'error' => 'Too many attempts. Try again later.']);
    exit();
}

$input = json_decode(file_get_contents('php://input') ?: '{}', true) ?: [];
$code = isset($input['code']) ? trim((string)$input['code']) : '';
if ($code === '') {
    echo json_encode(['success' => false, 'error' => 'Promo code is required.']);
    exit();
}

$hash = promo_hash($code);
$found = promo_find_by_hash($hash);
if (!$found) {
    echo json_encode(['success' => false, 'error' => 'Invalid or expired promo code.']);
    exit();
}

$item = $found['item'];
if (($item['status'] ?? '') !== 'active') {
    echo json_encode(['success' => false, 'error' => 'This promo code has already been used or revoked.']);
    exit();
}

$expires = $item['expires_at'] ?? null;
if ($expires !== null && (int)$expires < time()) {
    echo json_encode(['success' => false, 'error' => 'This promo code has expired.']);
    exit();
}

echo json_encode(['success' => true, 'message' => 'Code is valid. Enter the app to activate it.']);
