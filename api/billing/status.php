<?php
/**
 * GET: the signed-in user's premium and auto-renewal state, for the billing page and profile.
 */
require __DIR__ . '/_common.php';

$user = billing_session_user();
if (!$user) billing_reply(200, ['success' => true, 'signedIn' => false]);
$sub = get_subscription($user['id']);
$r = billing_renewal_get($user['id']);
billing_reply(200, [
    'success' => true,
    'signedIn' => true,
    'subscription' => $sub ? ['status' => $sub['status'], 'plan' => $sub['plan'], 'source' => $sub['source'], 'expiresAt' => $sub['expires']] : null,
    'renewal' => $r ? ['provider' => $r['provider'], 'plan' => $r['plan'] ?? 'monthly', 'auto' => !empty($r['auto']), 'paidUntil' => $r['paid_until'] ?? null] : null,
]);
