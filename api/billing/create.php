<?php
/**
 * POST {provider: lava|robokassa|yookassa|usdt, plan: monthly|yearly, email?, lang?}
 * Creates a payment for the signed-in user and returns {paymentUrl} to redirect to,
 * or for USDT {usdt: {orderId, address, amount, expiresAt}} to show on the page.
 */
require __DIR__ . '/_common.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') billing_reply(405, ['success' => false, 'error' => 'Method not allowed']);
$user = billing_session_user();
if (!$user) billing_reply(401, ['success' => false, 'error' => 'Sign in first']);

$input = json_decode((string)file_get_contents('php://input'), true) ?: [];
$provider = (string)($input['provider'] ?? '');
$plan = billing_plan((string)($input['plan'] ?? 'monthly'));
if (!in_array($provider, BILLING_PROVIDERS, true) || !billing_enabled($provider)) {
    billing_reply(400, ['success' => false, 'error' => 'This payment method is not available']);
}

$current = get_subscription($user['id']);
$renewal = billing_renewal_get($user['id']);
if ($current && subscription_is_effectively_active($current) && $renewal && !empty($renewal['auto'])) {
    billing_reply(409, ['success' => false, 'error' => 'You already have an active subscription']);
}

if ($provider === 'usdt') {
    $order = usdt_create_order($user['id'], $plan);
    if (!empty($order['error'])) billing_reply(503, ['success' => false, 'error' => 'Too many payments at once, try again in a few minutes']);
    payments_log_write('usdt.created', ['source' => 'usdt', 'user_id' => $user['id'], 'plan' => $plan, 'amount' => $order['amount'], 'currency' => 'USDT', 'reference' => $order['orderId']]);
    billing_reply(200, ['success' => true, 'usdt' => usdt_order_state($order['orderId'], $user['id'])]);
}

$email = trim((string)($user['email'] ?? ''));
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) $email = trim((string)($input['email'] ?? ''));
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    // lava.top needs an email for the receipt and subscription; the others send the receipt there too.
    billing_reply(400, ['success' => false, 'error' => 'Email required', 'needEmail' => true]);
}

$lang = (string)($input['lang'] ?? 'en');
if ($provider === 'lava') $result = lava_create_invoice($user['id'], $plan, $email, $lang);
elseif ($provider === 'robokassa') $result = robokassa_create_payment($user['id'], $plan, $email);
else $result = yookassa_create_payment($user['id'], $plan, $email);

if (!empty($result['error'])) {
    payments_log_write($provider . '.create.failed', ['source' => $provider, 'user_id' => $user['id'], 'plan' => $plan, 'note' => $result['error']]);
    billing_reply(502, ['success' => false, 'error' => 'Payment service is not responding, try again later']);
}
payments_log_write($provider . '.created', ['source' => $provider, 'user_id' => $user['id'], 'plan' => $plan, 'reference' => $result['orderId']]);
billing_reply(200, ['success' => true, 'paymentUrl' => $result['paymentUrl']]);
