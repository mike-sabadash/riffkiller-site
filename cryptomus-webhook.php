<?php
error_reporting(0);
ini_set('display_errors', 0);

require_once __DIR__ . '/config/load-env.php';
require_once __DIR__ . '/config/subscription-store.php';
require_once __DIR__ . '/config/payments-log.php';

// ==========================================================================
// Cryptomus Webhook - Riff Killer
// Receives payment status; verifies signature with CRYPTOMUS_API_KEY;
// updates unified store via save_subscription(). CRYPTOMUS_MERCHANT_ID for logging.
// ==========================================================================

$rawBody = isset($GLOBALS['WEBHOOK_RAW_BODY']) ? $GLOBALS['WEBHOOK_RAW_BODY'] : file_get_contents('php://input');
$data = json_decode($rawBody, true);

if (!is_array($data)) {
    http_response_code(400);
    exit();
}

$incomingSign = isset($data['sign']) ? $data['sign'] : '';
unset($data['sign']);

$apiKey = getenv('CRYPTOMUS_API_KEY') ?: (isset($_ENV['CRYPTOMUS_API_KEY']) ? $_ENV['CRYPTOMUS_API_KEY'] : '');
$merchantId = getenv('CRYPTOMUS_MERCHANT_ID') ?: (isset($_ENV['CRYPTOMUS_MERCHANT_ID']) ? $_ENV['CRYPTOMUS_MERCHANT_ID'] : '');
if ($apiKey === 'CHANGE_ME') $apiKey = '';
if ($merchantId === 'CHANGE_ME') $merchantId = '';
if ($apiKey === '') {
    http_response_code(500);
    exit();
}

// Re-encode as Cryptomus does (PHP escapes slashes in JSON)
$bodyWithoutSign = json_encode($data, JSON_UNESCAPED_UNICODE);
$expectedSign = md5(base64_encode($bodyWithoutSign) . $apiKey);

if (!hash_equals($expectedSign, $incomingSign)) {
    http_response_code(400);
    exit();
}

$status = isset($data['status']) ? (string) $data['status'] : '';
$orderId = isset($data['order_id']) ? (string) $data['order_id'] : '';
$additionalData = isset($data['additional_data']) ? (string) $data['additional_data'] : '';

if ($status !== 'paid' || $orderId === '') {
    http_response_code(200);
    echo json_encode(['state' => 0]);
    exit();
}

$plan = in_array($additionalData, ['monthly', 'yearly'], true) ? $additionalData : 'monthly';
$expiresAt = time() + ($plan === 'yearly' ? 365 * 86400 : 30 * 86400);

// Parse additional_data for user_id if sent as "plan|userId" or JSON
$userId = $orderId;
if (preg_match('/^(.+)\|([a-zA-Z0-9_-]+)$/', $additionalData, $m)) {
    $plan = in_array($m[1], ['monthly', 'yearly'], true) ? $m[1] : 'monthly';
    $userId = $m[2];
} elseif ($additionalData !== '' && $additionalData[0] === '{') {
    $dec = json_decode($additionalData, true);
    if (is_array($dec) && isset($dec['user_id'])) {
        $userId = (string) $dec['user_id'];
    }
    if (is_array($dec) && isset($dec['plan'])) {
        $plan = $dec['plan'] === 'yearly' ? 'yearly' : 'monthly';
    }
}

save_subscription($userId, [
    'status' => 'active',
    'plan' => $plan,
    'source' => 'cryptomus',
    'expires' => $expiresAt,
]);
payments_log_write('cryptomus.payment.paid', [
    'source' => 'cryptomus',
    'user_id' => $userId,
    'status' => 'active',
    'plan' => $plan,
    'amount' => isset($data['amount']) ? (string)$data['amount'] : null,
    'currency' => isset($data['currency']) ? (string)$data['currency'] : 'USD',
    'reference' => $orderId,
    'note' => 'Cryptomus webhook paid',
]);

// Keep per-order store for success page polling (cryptomus-status.php)
$storeFile = __DIR__ . '/data/cryptomus-subscriptions.json';
$store = [];
if (is_file($storeFile)) {
    $dec = json_decode(@file_get_contents($storeFile), true);
    if (is_array($dec)) $store = $dec;
}
$store[$orderId] = [
    'user_id' => $userId,
    'status' => 'active',
    'plan' => $plan,
    'source' => 'cryptomus',
    'expires_at' => $expiresAt,
    'paid_at' => date('c'),
];
@file_put_contents($storeFile, json_encode($store, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE), LOCK_EX);

http_response_code(200);
echo json_encode(['state' => 0]);
