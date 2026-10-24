<?php
/**
 * GET: the signed-in user's premium and auto-renewal state, for the billing page and profile.
 * GET ?order=usdt-…: also checks the wallet (at most every 15 s) and returns that order's state.
 */
require __DIR__ . '/_common.php';

$user = billing_session_user();
if (!$user) billing_reply(200, ['success' => true, 'signedIn' => false]);
$usdt = null;
if (isset($_GET['order'])) {
    usdt_check_payments(null, 15);
    $usdt = usdt_order_state((string)$_GET['order'], $user['id']);
}
$sub = get_subscription($user['id']);
$r = billing_renewal_get($user['id']);
billing_reply(200, [
    'success' => true,
    'signedIn' => true,
    'subscription' => $sub ? ['status' => $sub['status'], 'plan' => $sub['plan'], 'source' => $sub['source'], 'expiresAt' => $sub['expires']] : null,
    'usdt' => $usdt,
    'renewal' => $r ? ['provider' => $r['provider'], 'plan' => $r['plan'] ?? 'monthly', 'auto' => !empty($r['auto']), 'paidUntil' => $r['paid_until'] ?? null] : null,
]);
