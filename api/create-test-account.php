<?php
/**
 * Create test account - only from localhost or with ADMIN_SECRET key.
 * GET ?admin_key=xxx or from localhost
 * Returns one-time login URL.
 */
error_reporting(0);
ini_set('display_errors', 0);

require_once dirname(__DIR__) . '/config/load-env.php';
require_once dirname(__DIR__) . '/config/session-start.php';
require_once dirname(__DIR__) . '/config/subscription-store.php';
require_once dirname(__DIR__) . '/config/test-accounts.php';

$origin = isset($_SERVER['HTTP_ORIGIN']) ? $_SERVER['HTTP_ORIGIN'] : '';
$allowOrigin = 'https://riffkiller.fun';
if (preg_match('#^https://riffkiller\.fun$#', $origin) || preg_match('#^http://(localhost|127\.0\.0\.1)(:\d+)?$#', $origin)) {
    $allowOrigin = $origin;
}
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: ' . $allowOrigin);
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$allowed = false;
$host = $_SERVER['HTTP_HOST'] ?? '';
if (preg_match('/^(localhost|127\.0\.0\.1)(:\d+)?$/', $host)) {
    $allowed = true;
}
$adminKey = getenv('ADMIN_SECRET') ?: (isset($_ENV['ADMIN_SECRET']) ? $_ENV['ADMIN_SECRET'] : '');
if ($adminKey === '' && defined('ADMIN_SECRET')) $adminKey = ADMIN_SECRET;
if ($adminKey !== '' && isset($_GET['admin_key']) && hash_equals($adminKey, trim((string)$_GET['admin_key']))) {
    $allowed = true;
}

if (!$allowed) {
    http_response_code(403);
    echo json_encode(['success' => false, 'error' => 'Access denied.']);
    exit();
}

$acc = test_account_create();
if (!$acc) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Failed to create test account.']);
    exit();
}

$protocol = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on') ? 'https' : 'http';
$base = $protocol . '://' . $host;
$loginUrl = $base . '/test-login.html?token=' . urlencode($acc['token']);

echo json_encode([
    'success' => true,
    'id' => $acc['id'],
    'login_url' => $loginUrl,
    'message' => 'One-time login link. Copy and use within a few minutes.',
]);
