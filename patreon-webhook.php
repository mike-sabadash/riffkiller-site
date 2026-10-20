<?php
error_reporting(0);
ini_set('display_errors', 0);

// ==========================================================================
// Patreon Webhook - Riff Killer
// Patreon → Creator → Developer portal → Webhooks: point to
// https://riffkiller.fun/patreon-webhook.php and enable members:create,
// members:update, members:delete, members:pledge:create/update/delete.
// The secret shown there goes to PATREON_WEBHOOK_SECRET in .env.
// ==========================================================================

require_once __DIR__ . '/config/patreon.php';
require_once __DIR__ . '/config/user-store.php';
require_once __DIR__ . '/config/subscription-store.php';
require_once __DIR__ . '/config/payments-log.php';

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit();
}

$rawBody = $GLOBALS['WEBHOOK_RAW_BODY'] ?? file_get_contents('php://input');
if (!patreon_webhook_signature_valid($rawBody, $_SERVER['HTTP_X_PATREON_SIGNATURE'] ?? '')) {
    patreon_log('webhook_bad_signature', ['event' => $_SERVER['HTTP_X_PATREON_EVENT'] ?? '']);
    http_response_code(401);
    echo json_encode(['error' => 'Invalid signature']);
    exit();
}

$payload = json_decode((string)$rawBody, true);
$member = is_array($payload) ? ($payload['data'] ?? null) : null;
$event = (string)($_SERVER['HTTP_X_PATREON_EVENT'] ?? '');
$patreonUserId = (string)($member['relationships']['user']['data']['id'] ?? '');

$subscription = patreon_member_subscription($member);
// A deleted membership keeps access only until the paid period ends.
if (in_array($event, ['members:delete', 'members:pledge:delete'], true) && $subscription['status'] === 'active') {
    $subscription['reason'] = 'deleted_until_period_end';
}

$user = $patreonUserId !== '' ? user_find_by_provider('patreon', $patreonUserId) : null;
if ($user) {
    $current = get_subscription($user['id']);
    $otherSourceActive = $current && ($current['source'] ?? '') !== 'patreon' && subscription_is_effectively_active($current);
    if (!$otherSourceActive) {
        save_subscription($user['id'], ['status' => $subscription['status'], 'source' => 'patreon', 'expires' => $subscription['expires']]);
    }
}

payments_log_write('patreon.webhook', [
    'source' => 'patreon',
    'user_id' => $user['id'] ?? null,
    'status' => $subscription['status'],
    'note' => $event . ' ' . $subscription['reason'] . ($user ? '' : ' (patron has not signed in yet)'),
]);

http_response_code(200);
echo json_encode(['ok' => true]);
