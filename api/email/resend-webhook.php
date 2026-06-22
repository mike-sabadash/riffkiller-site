<?php
error_reporting(0);
ini_set('display_errors', 0);

require_once dirname(__DIR__, 2) . '/config/load-env.php';
require_once dirname(__DIR__, 2) . '/config/email-campaigns.php';

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit;
}

$secret = getenv('RESEND_WEBHOOK_SECRET') ?: (isset($_ENV['RESEND_WEBHOOK_SECRET']) ? $_ENV['RESEND_WEBHOOK_SECRET'] : '');
$sig = isset($_SERVER['HTTP_RESEND_SIGNATURE']) ? (string)$_SERVER['HTTP_RESEND_SIGNATURE'] : '';
if ($secret !== '' && !hash_equals($secret, $sig)) {
    http_response_code(403);
    echo json_encode(['success' => false, 'error' => 'Forbidden']);
    exit;
}

$raw = file_get_contents('php://input') ?: '{}';
$body = json_decode($raw, true);
if (!is_array($body)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Invalid JSON']);
    exit;
}

$type = (string)($body['type'] ?? $body['event'] ?? 'resend.webhook');
$data = isset($body['data']) && is_array($body['data']) ? $body['data'] : $body;
$email = '';
if (isset($data['to'])) {
    if (is_array($data['to']) && !empty($data['to'][0])) $email = (string)$data['to'][0];
    elseif (is_string($data['to'])) $email = $data['to'];
}
$campaignId = null;
$segment = null;
if (isset($data['tags']) && is_array($data['tags'])) {
    foreach ($data['tags'] as $tag) {
        $name = (string)($tag['name'] ?? '');
        $value = (string)($tag['value'] ?? '');
        if ($name === 'campaign_id') $campaignId = $value;
        if ($name === 'segment') $segment = $value;
    }
}

email_campaigns_log_write('resend.' . $type, [
    'campaign_id' => $campaignId,
    'email' => $email,
    'segment' => $segment,
    'status' => (string)($data['status'] ?? $type),
    'provider' => 'resend',
    'note' => isset($data['id']) ? ('message_id: ' . $data['id']) : null,
]);

echo json_encode(['success' => true]);

