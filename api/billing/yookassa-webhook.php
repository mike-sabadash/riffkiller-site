<?php
/**
 * YooKassa HTTP notifications (payment.succeeded, payment.canceled).
 * Notifications are not signed, so the payment is re-read from the YooKassa API before it counts.
 */
error_reporting(0);
ini_set('display_errors', 0);
require_once dirname(__DIR__, 2) . '/config/billing.php';

header('Content-Type: application/json; charset=utf-8');
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); exit(); }
if (!billing_enabled('yookassa')) { http_response_code(503); exit(); }
$event = json_decode((string)file_get_contents('php://input'), true);
$id = is_array($event) ? (string)($event['object']['id'] ?? '') : '';
if ($id === '' || !preg_match('/^[a-zA-Z0-9-]{8,64}$/', $id)) { http_response_code(400); exit(); }
$result = yookassa_sync_payment($id);
// Ask YooKassa to deliver again when its API could not be reached.
http_response_code($result === 'lookup failed' ? 503 : 200);
echo json_encode(['ok' => true, 'result' => $result]);
