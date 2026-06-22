<?php
error_reporting(0);
ini_set('display_errors', 0);

require_once __DIR__ . '/config/load-env.php';
require_once __DIR__ . '/config/subscription-store.php';
require_once __DIR__ . '/config/payments-log.php';

// ==========================================================================
// Stripe Webhook - Riff Killer
// Handles: checkout.session.completed, invoice.paid, customer.subscription.deleted
// Verifies signature with STRIPE_WEBHOOK_SECRET; updates unified store via save_subscription().
// ==========================================================================

$logFile = __DIR__ . '/stripe-webhook.log';
function webhookLog($msg, $context = []) {
    global $logFile;
    @file_put_contents($logFile, date('c') . ' ' . $msg . ' ' . json_encode($context) . "\n", FILE_APPEND | LOCK_EX);
}

$rawBody = isset($GLOBALS['WEBHOOK_RAW_BODY']) ? $GLOBALS['WEBHOOK_RAW_BODY'] : file_get_contents('php://input');
$sigHeader = isset($_SERVER['HTTP_STRIPE_SIGNATURE']) ? $_SERVER['HTTP_STRIPE_SIGNATURE'] : '';

$stripeSecretKey = getenv('STRIPE_SECRET_KEY') ?: (isset($_ENV['STRIPE_SECRET_KEY']) ? $_ENV['STRIPE_SECRET_KEY'] : '');
$webhookSecret = getenv('STRIPE_WEBHOOK_SECRET') ?: (isset($_ENV['STRIPE_WEBHOOK_SECRET']) ? $_ENV['STRIPE_WEBHOOK_SECRET'] : '');
if ($webhookSecret === '' || strpos($webhookSecret, 'whsec_') !== 0) {
    webhookLog('reject', ['reason' => 'STRIPE_WEBHOOK_SECRET not set or invalid']);
    http_response_code(500);
    exit();
}

// Verify signature: Stripe sends t=timestamp,v1=hex_sig. Payload to sign = t + '.' + body.
$timestamp = null;
$v1 = null;
foreach (explode(',', $sigHeader) as $part) {
    $part = trim($part);
    if (strpos($part, 't=') === 0) {
        $timestamp = substr($part, 2);
    } elseif (strpos($part, 'v1=') === 0) {
        $v1 = substr($part, 3);
    }
}
if ($timestamp === null || $v1 === null) {
    http_response_code(400);
    exit();
}
$signedPayload = $timestamp . '.' . $rawBody;
$expected = hash_hmac('sha256', $signedPayload, $webhookSecret);
if (!hash_equals($expected, $v1)) {
    webhookLog('invalid_signature', []);
    http_response_code(400);
    exit();
}

$event = json_decode($rawBody, true);
if (!isset($event['type']) || !isset($event['data']['object'])) {
    webhookLog('invalid_payload', ['type' => isset($event['type']) ? $event['type'] : null]);
    http_response_code(200);
    exit();
}
webhookLog('event', ['type' => $event['type'], 'id' => $event['id'] ?? null]);

$dataDir = __DIR__ . '/data';
if (!is_dir($dataDir)) {
    @mkdir($dataDir, 0755, true);
}
$storeFile = $dataDir . '/stripe-subscriptions.json';
$store = is_file($storeFile) ? json_decode(file_get_contents($storeFile), true) : [];
if (!is_array($store)) {
    $store = [];
}

$type = $event['type'];
$obj = $event['data']['object'];

if ($type === 'checkout.session.completed') {
    $sessionId = $obj['id'] ?? '';
    $clientRef = $obj['client_reference_id'] ?? '';
    $subId = $obj['subscription'] ?? null;
    if ($sessionId && ($clientRef !== '' || $subId)) {
        $plan = 'monthly';
        $expiresAt = null;
        if ($subId && $stripeSecretKey !== '') {
            $ch = curl_init('https://api.stripe.com/v1/subscriptions/' . $subId);
            curl_setopt($ch, CURLOPT_HTTPGET, true);
            curl_setopt($ch, CURLOPT_USERPWD, $stripeSecretKey . ':');
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_TIMEOUT, 5);
            $subResp = curl_exec($ch);
            curl_close($ch);
            if ($subResp) {
                $subData = json_decode($subResp, true);
                if (isset($subData['current_period_end'])) {
                    $expiresAt = (int) $subData['current_period_end'];
                }
                $interval = isset($subData['items']['data'][0]['plan']['interval']) ? $subData['items']['data'][0]['plan']['interval'] : 'month';
                $plan = ($interval === 'year') ? 'yearly' : 'monthly';
            }
        }
        $key = $clientRef !== '' ? $clientRef : ('stripe_' . preg_replace('/[^a-zA-Z0-9_]/', '', $sessionId));
        $store[$key] = [
            'session_id' => $sessionId,
            'subscription_id' => $subId,
            'status' => 'active',
            'plan' => $plan,
            'expires_at' => $expiresAt,
            'source' => 'stripe',
        ];
        save_subscription($key, [
            'status' => 'active',
            'plan' => $plan,
            'source' => 'stripe',
            'expires' => $expiresAt,
        ]);
        payments_log_write('stripe.checkout.completed', [
            'source' => 'stripe',
            'user_id' => $key,
            'status' => 'active',
            'plan' => $plan,
            'currency' => 'USD',
            'reference' => $sessionId,
            'note' => 'checkout.session.completed',
        ]);
        webhookLog('checkout_completed', ['session_id' => $sessionId, 'plan' => $plan, 'key' => $key]);
    }
}

if ($type === 'invoice.paid') {
    $subId = $obj['subscription'] ?? null;
    if ($subId) {
        $newExpires = isset($obj['lines']['data'][0]['period']['end']) ? (int) $obj['lines']['data'][0]['period']['end'] : null;
        foreach ($store as $k => $rec) {
            if (isset($rec['subscription_id']) && $rec['subscription_id'] === $subId) {
                $store[$k]['status'] = 'active';
                if ($newExpires !== null) $store[$k]['expires_at'] = $newExpires;
                save_subscription($k, ['status' => 'active', 'plan' => $rec['plan'] ?? 'monthly', 'source' => 'stripe', 'expires' => $newExpires ?? $rec['expires_at'] ?? null]);
                payments_log_write('stripe.invoice.paid', [
                    'source' => 'stripe',
                    'user_id' => $k,
                    'status' => 'active',
                    'plan' => $rec['plan'] ?? 'monthly',
                    'currency' => 'USD',
                    'reference' => $subId,
                    'note' => 'invoice.paid',
                ]);
                break;
            }
        }
    }
}

if ($type === 'customer.subscription.deleted') {
    $subId = $obj['id'] ?? '';
    if ($subId) {
        foreach ($store as $k => $rec) {
            if (isset($rec['subscription_id']) && $rec['subscription_id'] === $subId) {
                $store[$k]['status'] = 'cancelled';
                save_subscription($k, ['status' => 'cancelled', 'plan' => $rec['plan'] ?? 'monthly', 'source' => 'stripe', 'expires' => $rec['expires_at'] ?? null]);
                payments_log_write('stripe.subscription.cancelled', [
                    'source' => 'stripe',
                    'user_id' => $k,
                    'status' => 'cancelled',
                    'plan' => $rec['plan'] ?? 'monthly',
                    'currency' => 'USD',
                    'reference' => $subId,
                    'note' => 'customer.subscription.deleted',
                ]);
                break;
            }
        }
    }
}

@file_put_contents($storeFile, json_encode($store, JSON_PRETTY_PRINT), LOCK_EX);

http_response_code(200);
echo '{"received":true}';
