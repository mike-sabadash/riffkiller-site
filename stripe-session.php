<?php
error_reporting(0);
ini_set('display_errors', 0);
if (ob_get_level()) ob_clean();

require_once __DIR__ . '/config/load-env.php';
require_once __DIR__ . '/config/subscription-store.php';

// ==========================================================================
// Stripe Session Lookup - Riff Killer
// GET ?session_id=cs_xxx - returns subscription for success page (unified store or Stripe API)
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

$sessionId = isset($_GET['session_id']) ? trim($_GET['session_id']) : '';
if ($sessionId === '' || strpos($sessionId, 'cs_') !== 0) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Invalid session_id']);
    exit();
}

$unifiedKey = 'stripe_' . preg_replace('/[^a-zA-Z0-9_]/', '', $sessionId);
$unifiedSub = get_subscription($unifiedKey);
if ($unifiedSub !== null) {
    echo json_encode([
        'success' => true,
        'subscription' => [
            'source' => 'stripe',
            'status' => $unifiedSub['status'],
            'expiresAt' => $unifiedSub['expires'],
            'plan' => $unifiedSub['plan'],
        ],
    ]);
    exit();
}

$stripeSecretKey = getenv('STRIPE_SECRET_KEY') ?: (isset($_ENV['STRIPE_SECRET_KEY']) ? $_ENV['STRIPE_SECRET_KEY'] : '');
if (strpos($stripeSecretKey, 'sk_') !== 0) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Stripe not configured']);
    exit();
}

$ch = curl_init('https://api.stripe.com/v1/checkout/sessions/' . $sessionId . '?expand[]=subscription');
curl_setopt($ch, CURLOPT_HTTPGET, true);
curl_setopt($ch, CURLOPT_USERPWD, $stripeSecretKey . ':');
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 10);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

$data = json_decode($response, true);
if ($httpCode !== 200 || !isset($data['id'])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Session not found']);
    exit();
}

$sub = $data['subscription'] ?? null;
$status = ($data['payment_status'] ?? '') === 'paid' ? 'active' : 'active'; // checkout completed = paid
$clientRef = $data['client_reference_id'] ?? '';

// If we have server-side store from webhook, prefer it for expiresAt/plan
$storeFile = __DIR__ . '/data/stripe-subscriptions.json';
if (is_file($storeFile)) {
    $store = json_decode(file_get_contents($storeFile), true) ?: [];
    foreach ($store as $ref => $rec) {
        if ($ref === $clientRef || (isset($rec['session_id']) && $rec['session_id'] === $sessionId)) {
            $expiresAt = isset($rec['expires_at']) ? (int) $rec['expires_at'] : null;
            $plan = isset($rec['plan']) && $rec['plan'] === 'yearly' ? 'yearly' : 'monthly';
            echo json_encode([
                'success' => true,
                'subscription' => [
                    'source' => 'stripe',
                    'status' => $rec['status'] ?? 'active',
                    'expiresAt' => $expiresAt,
                    'plan' => $plan,
                ],
            ]);
            exit();
        }
    }
}

// Fallback: derive from Stripe subscription object (session expanded with subscription)
$plan = 'monthly';
$expiresAt = null;
if (is_array($sub)) {
    if (isset($sub['current_period_end'])) {
        $expiresAt = (int) $sub['current_period_end'];
    }
    $interval = isset($sub['items']['data'][0]['plan']['interval']) ? $sub['items']['data'][0]['plan']['interval'] : 'month';
    $plan = ($interval === 'year') ? 'yearly' : 'monthly';
}

echo json_encode([
    'success' => true,
    'subscription' => [
        'source' => 'stripe',
        'status' => 'active',
        'expiresAt' => $expiresAt,
        'plan' => $plan,
    ],
]);
