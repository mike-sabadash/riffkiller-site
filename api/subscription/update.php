<?php
/**
 * Unified subscription update - called by webhooks or internal services.
 * POST body: user_id, status, plan, source, expires
 * Optional header X-Api-Key = SUBSCRIPTION_UPDATE_SECRET for server-to-server.
 */
error_reporting(0);
ini_set('display_errors', 0);

require_once dirname(__DIR__, 2) . '/config/load-env.php';
require_once dirname(__DIR__, 2) . '/config/subscription-store.php';
require_once dirname(__DIR__, 2) . '/config/payments-log.php';

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit();
}

$secret = getenv('SUBSCRIPTION_UPDATE_SECRET');
$key = isset($_SERVER['HTTP_X_API_KEY']) ? $_SERVER['HTTP_X_API_KEY'] : '';
if ($secret !== '' && $secret !== false) {
    if (!hash_equals((string) $secret, (string) $key)) {
        http_response_code(403);
        echo json_encode(['success' => false, 'error' => 'Forbidden']);
        exit();
    }
}

$input = json_decode(file_get_contents('php://input'), true) ?: [];
$userId = isset($input['user_id']) ? (string) $input['user_id'] : '';
if ($userId === '') {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'user_id required']);
    exit();
}

$data = [
    'status' => isset($input['status']) ? (string) $input['status'] : 'active',
    'plan' => isset($input['plan']) && $input['plan'] === 'yearly' ? 'yearly' : 'monthly',
    'source' => isset($input['source']) && in_array($input['source'], ['stripe', 'cryptomus', 'patreon'], true) ? $input['source'] : 'stripe',
    'expires' => isset($input['expires']) ? (int) $input['expires'] : (isset($input['expires_at']) ? (int) $input['expires_at'] : null),
];

if (save_subscription($userId, $data)) {
    payments_log_write('subscription.manual.update', [
        'source' => $data['source'],
        'user_id' => $userId,
        'status' => $data['status'],
        'plan' => $data['plan'],
        'reference' => isset($input['reference']) ? (string)$input['reference'] : null,
        'note' => 'api/subscription/update',
    ]);
    echo json_encode(['success' => true]);
} else {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Save failed']);
}
