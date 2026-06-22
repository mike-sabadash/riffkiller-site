<?php
error_reporting(0);
ini_set('display_errors', 0);
if (ob_get_level()) ob_clean();

// ==========================================================================
// Central Webhook Router - Riff Killer
// Single endpoint: POST /webhook.php
// Detects source by payload structure and routes to Stripe / Cryptomus / Patreon handlers.
// Configure payment providers to send webhooks to this URL.
// Each handler updates subscription state (data/*.json now; add DB or API call later).
// ==========================================================================

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(200);
    echo json_encode(['ok' => true]);
    exit();
}

$rawBody = file_get_contents('php://input');
$payload = json_decode($rawBody, true);

$source = null;

if (is_array($payload)) {
    if (isset($payload['type']) && isset($payload['data']['object'])) {
        $source = 'stripe';
    } elseif (isset($payload['order_id']) && (isset($payload['payment_status']) || isset($payload['status']))) {
        $source = 'cryptomus';
    } elseif (isset($payload['data']) && isset($payload['included'])) {
        $source = 'patreon';
    }
}

$GLOBALS['WEBHOOK_RAW_BODY'] = $rawBody;

if ($source === 'stripe') {
    require __DIR__ . '/stripe-webhook.php';
    exit();
}

if ($source === 'cryptomus') {
    require __DIR__ . '/cryptomus-webhook.php';
    exit();
}

if ($source === 'patreon') {
    require __DIR__ . '/patreon-webhook.php';
    exit();
}

http_response_code(200);
echo json_encode(['ok' => true]);
