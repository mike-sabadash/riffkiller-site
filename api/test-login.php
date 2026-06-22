<?php
error_reporting(0);
ini_set('display_errors', 0);
require_once dirname(__DIR__) . '/config/session-start.php';
require_once dirname(__DIR__) . '/config/subscription-store.php';
require_once dirname(__DIR__) . '/config/test-accounts.php';
header('Content-Type: application/json; charset=utf-8');
$token = isset($_GET['token']) ? trim((string)$_GET['token']) : '';
if ($token === '') {
    echo json_encode(['success' => false, 'error' => 'Missing token.']);
    exit();
}
$acc = test_account_find_by_token($token);
if (!$acc) {
    echo json_encode(['success' => false, 'error' => 'Invalid or expired test link.']);
    exit();
}
$id = $acc['id'] ?? '';
if ($id === '') {
    echo json_encode(['success' => false, 'error' => 'Invalid test account.']);
    exit();
}
$_SESSION['user_id'] = $id;
test_account_consume_token($token);
save_subscription($id, ['status' => 'active', 'plan' => 'yearly', 'source' => 'test', 'expires' => null]);
echo json_encode([
    'success' => true,
    'user' => ['id' => $id, 'full_name' => 'Test User', 'email' => '', 'image_url' => '', 'provider' => 'test'],
    'subscription' => ['status' => 'active', 'plan' => 'yearly', 'source' => 'test', 'expiresAt' => null],
]);
