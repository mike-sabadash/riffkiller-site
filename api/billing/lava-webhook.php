<?php
/**
 * lava.top webhook (set in lava.top → API → webhooks, with LAVA_WEBHOOK_SECRET as the API key).
 */
error_reporting(0);
ini_set('display_errors', 0);
require_once dirname(__DIR__, 2) . '/config/billing.php';

header('Content-Type: application/json; charset=utf-8');
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); exit(); }
if (!billing_enabled('lava') || !lava_webhook_authorized($_SERVER)) { http_response_code(401); echo '{"ok":false}'; exit(); }

$event = json_decode((string)file_get_contents('php://input'), true);
if (!is_array($event)) { http_response_code(400); exit(); }
$result = lava_handle_webhook($event);
// A payment lava.top has not confirmed yet is retried by lava.top later.
http_response_code($result === 'not completed' ? 409 : 200);
echo json_encode(['ok' => true, 'result' => $result]);
