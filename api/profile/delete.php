<?php
/**
 * POST { "confirm": "DELETE" }: deletes the signed-in account (config/legal.php) and signs out.
 * An active card subscription is cancelled first, so no charge follows; if lava.top does not answer, nothing is deleted.
 */
require dirname(__DIR__) . '/billing/_common.php';
require_once dirname(__DIR__, 2) . '/config/legal.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') billing_reply(405, ['success' => false, 'error' => 'Method not allowed']);
$user = billing_session_user();
if (!$user) billing_reply(401, ['success' => false, 'error' => 'Sign in first']);
$body = json_decode((string)file_get_contents('php://input'), true);
if (!is_array($body) || ($body['confirm'] ?? '') !== 'DELETE') billing_reply(400, ['success' => false, 'error' => 'Type DELETE to confirm']);

$r = billing_renewal_get($user['id']);
if ($r && !empty($r['auto'])) {
    if (($r['provider'] ?? '') === 'lava' && !lava_cancel($r)) {
        billing_reply(502, ['success' => false, 'error' => 'Could not cancel your subscription on lava.top. Nothing was deleted; try again in a few minutes.']);
    }
    billing_stop_renewal($user['id'], 'account deleted');
}
if (!legal_delete_account($user['id'])) billing_reply(500, ['success' => false, 'error' => 'Could not delete the account. Write to support@riffkiller.fun.']);

$_SESSION = [];
if (session_status() === PHP_SESSION_ACTIVE) session_destroy();
setcookie('RIFFKILLER_SID', '', ['expires' => time() - 3600, 'path' => '/', 'httponly' => true, 'samesite' => 'Lax']);
billing_reply(200, ['success' => true]);
