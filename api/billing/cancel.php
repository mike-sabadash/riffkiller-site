<?php
/**
 * POST: turns off auto-renewal for the signed-in user. Premium stays until the paid period ends.
 */
require __DIR__ . '/_common.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') billing_reply(405, ['success' => false, 'error' => 'Method not allowed']);
$user = billing_session_user();
if (!$user) billing_reply(401, ['success' => false, 'error' => 'Sign in first']);
$r = billing_renewal_get($user['id']);
if (!$r || empty($r['auto'])) billing_reply(200, ['success' => true, 'alreadyOff' => true]);

if ($r['provider'] === 'lava' && !lava_cancel($r)) {
    billing_reply(502, ['success' => false, 'error' => 'Could not cancel on lava.top, try again later']);
}
billing_stop_renewal($user['id'], 'cancelled by user');
billing_reply(200, ['success' => true, 'paidUntil' => $r['paid_until'] ?? null]);
