<?php
error_reporting(0);
ini_set('display_errors', 0);
if (ob_get_level()) ob_clean();

require_once __DIR__ . '/config/load-env.php';

// ==========================================================================
// Cryptomus Create Payment - Riff Killer
// Creates invoice; returns payment URL. Amount in USD, optional USDT TRC-20.
// ==========================================================================

$origin = isset($_SERVER['HTTP_ORIGIN']) ? $_SERVER['HTTP_ORIGIN'] : '';
$allowOrigin = 'https://riffkiller.fun';
if (preg_match('#^https://riffkiller\.fun$#', $origin) || preg_match('#^http://(localhost|127\.0\.0\.1)(:\d+)?$#', $origin)) {
    $allowOrigin = $origin;
}
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: ' . $allowOrigin);
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    echo json_encode(['ok' => true]);
    exit();
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit();
}

$input = json_decode(file_get_contents('php://input'), true) ?: [];
$plan = isset($input['plan']) && in_array($input['plan'], ['monthly', 'yearly'], true) ? $input['plan'] : 'monthly';
$userId = isset($input['userId']) ? preg_replace('/[^a-zA-Z0-9_-]/', '', (string) $input['userId']) : '';

$amount = $plan === 'yearly' ? '60' : '6';
$orderId = 'rk_cryptomus_' . $plan . '_' . uniqid('', true);
$orderId = preg_replace('/[^a-zA-Z0-9_-]/', '_', $orderId);

$baseUrl = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? 'https' : 'http') . '://' . ($_SERVER['HTTP_HOST'] ?? '');
$basePath = rtrim(dirname($_SERVER['SCRIPT_NAME'] ?? ''), '/');
$urlSuccess = $baseUrl . $basePath . '/cryptomus-success.html?order_id=' . urlencode($orderId);
$urlCallback = $baseUrl . $basePath . '/cryptomus-webhook.php';
$urlReturn = $baseUrl . $basePath . '/billing-cryptomus.html';

$merchantId = getenv('CRYPTOMUS_MERCHANT_ID') ?: (isset($_ENV['CRYPTOMUS_MERCHANT_ID']) ? $_ENV['CRYPTOMUS_MERCHANT_ID'] : '');
$apiKey = getenv('CRYPTOMUS_API_KEY') ?: (isset($_ENV['CRYPTOMUS_API_KEY']) ? $_ENV['CRYPTOMUS_API_KEY'] : '');
if ($merchantId === 'CHANGE_ME') $merchantId = '';
if ($apiKey === 'CHANGE_ME') $apiKey = '';

if ($merchantId === '' || $apiKey === '') {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Cryptomus is not configured']);
    exit();
}

$additionalData = ($userId !== '') ? ($plan . '|' . $userId) : $plan;
$body = [
    'amount' => $amount,
    'currency' => 'USD',
    'order_id' => $orderId,
    'url_success' => $urlSuccess,
    'url_callback' => $urlCallback,
    'url_return' => $urlReturn,
    'additional_data' => $additionalData,
    'to_currency' => 'USDT',
    'network' => 'tron',
];

$jsonBody = json_encode($body, JSON_UNESCAPED_UNICODE);
$sign = md5(base64_encode($jsonBody) . $apiKey);

$ch = curl_init('https://api.cryptomus.com/v1/payment');
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Content-Type: application/json',
    'merchant: ' . $merchantId,
    'sign: ' . $sign,
]);
curl_setopt($ch, CURLOPT_POSTFIELDS, $jsonBody);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 30);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlErr = curl_error($ch);
curl_close($ch);

if ($curlErr) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Request failed']);
    exit();
}

$data = json_decode($response, true);

if (isset($data['state']) && $data['state'] === 0 && isset($data['result']['url'])) {
    echo json_encode([
        'success' => true,
        'paymentUrl' => $data['result']['url'],
        'orderId' => $orderId,
    ]);
    exit();
}

$errMsg = isset($data['message']) ? $data['message'] : (isset($data['errors']) ? json_encode($data['errors']) : 'Could not create payment');
http_response_code(400);
echo json_encode(['success' => false, 'error' => $errMsg]);
