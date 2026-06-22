<?php
error_reporting(0);
ini_set('display_errors', 0);

// ==========================================================================
// Patreon Webhook - Riff Killer (placeholder)
// For future: receive Patreon membership/campaign webhooks.
// Payload has 'data' and 'included'. Verify signature and update subscription.
// ==========================================================================

// Optional: verify Patreon webhook signature if they provide one.
// Update subscription in data/ or DB when membership changes.

$dataDir = __DIR__ . '/data';
if (!is_dir($dataDir)) {
    @mkdir($dataDir, 0755, true);
}

require_once __DIR__ . '/config/payments-log.php';
$rawBody = file_get_contents('php://input');
$payload = json_decode($rawBody, true);
$memberId = null;
if (is_array($payload) && isset($payload['data']['id'])) {
    $memberId = (string)$payload['data']['id'];
}
payments_log_write('patreon.webhook.received', [
    'source' => 'patreon',
    'user_id' => $memberId,
    'status' => 'received',
    'note' => 'Webhook received (placeholder handler)',
]);

// Placeholder: when you add DB or API, update subscription here.
// Example: persist by user id from payload, then notify client (e.g. polling or push).

http_response_code(200);
echo json_encode(['state' => 0]);
