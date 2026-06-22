<?php
/**
 * Apply promo code - requires user to be logged in.
 * POST { "code": "RK-XXXXXXXX" }
 */
error_reporting(0);
ini_set('display_errors', 0);

require_once dirname(__DIR__) . '/config/load-env.php';
require_once dirname(__DIR__) . '/config/session-start.php';
require_once dirname(__DIR__) . '/config/user-store.php';
require_once dirname(__DIR__) . '/config/subscription-store.php';
require_once dirname(__DIR__) . '/config/promo-store.php';
require_once dirname(__DIR__) . '/config/payments-log.php';
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

$userId = isset($_SESSION['user_id']) ? $_SESSION['user_id'] : null;
if (!$userId) {
    http_response_code(401);
    echo json_encode(['success' => false, 'error' => 'You must be logged in to apply a promo code.']);
    exit();
}

$ip = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
if (!rate_limit_check('promo_' . $ip, 15, 3600)) {
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

$user = user_find_by_id($userId);
if (!$user) {
    echo json_encode(['success' => false, 'error' => 'User not found.']);
    exit();
}

$existing = get_subscription($userId);
if ($existing && subscription_is_effectively_active($existing)) {
    echo json_encode(['success' => false, 'error' => 'You already have premium access.']);
    exit();
}

$domainLimit = $item['domain_limit'] ?? null;
if ($domainLimit !== null && $domainLimit !== '') {
    $email = $user['email'] ?? '';
    $emailDomain = strtolower(substr(strrchr($email, '@') ?: '', 1));
    $allowed = array_map('trim', array_map('strtolower', explode(',', $domainLimit)));
    if ($emailDomain === '' || !in_array($emailDomain, $allowed)) {
        echo json_encode(['success' => false, 'error' => 'This promo code is not valid for your email domain.']);
        exit();
    }
}

promo_mark_used($hash, $userId, $user['email'] ?? '');
save_subscription($userId, [
    'status' => 'active',
    'plan' => 'yearly',
    'source' => 'promo',
    'expires' => null,
]);
payments_log_write('promo.applied', [
    'source' => 'promo',
    'user_id' => $userId,
    'status' => 'active',
    'plan' => 'yearly',
    'reference' => $item['suffix'] ?? null,
    'note' => 'Promo activated for user',
]);

echo json_encode([
    'success' => true,
    'message' => 'Promo code applied. You now have full premium access!',
    'subscription' => [
        'status' => 'active',
        'plan' => 'yearly',
        'source' => 'promo',
        'expiresAt' => null,
    ],
]);
