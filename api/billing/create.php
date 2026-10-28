<?php
/**
 * POST {provider: lava|robokassa|yookassa|usdt, plan: monthly|quarterly|yearly, email?, lang?}
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
// Robokassa and YooKassa sell a plan only when its RUB price is set.
if (in_array($provider, ['robokassa', 'yookassa'], true) && billing_rub_price($plan) === null) {
    billing_reply(400, ['success' => false, 'error' => 'This payment method is not available']);
}

// A subscriber is never sold what they already have: see billing_account_state() for the cases.
$state = billing_account_state($user['id']);
if ($state['kind'] === 'external') {
    billing_reply(409, ['success' => false, 'error' => $state['source'] === 'patreon'
        ? 'Your premium comes from Patreon: manage it there.'
        : 'You already have premium access.']);
}
if ($state['kind'] === 'gift') billing_reply(409, ['success' => false, 'error' => 'You already have premium access.']);
if ($state['kind'] === 'renewing') {
    if ($provider !== $state['source']) {
        billing_reply(409, ['success' => false, 'error' => 'Your card subscription renews automatically. To pay another way, turn off auto-renewal in your profile first.']);
    }
    if ($plan === $state['plan']) billing_reply(409, ['success' => false, 'error' => 'This is your current plan.']);
    // A different plan is a switch: the new period starts after the paid one and the old subscription stops (billing_apply_payment).
}

if ($provider === 'usdt') {
    $order = usdt_create_order($user['id'], $plan);
    if (!empty($order['error'])) billing_reply(503, ['success' => false, 'error' => 'Too many payments at once, try again in a few minutes']);
    payments_log_write('usdt.created', ['source' => 'usdt', 'user_id' => $user['id'], 'plan' => $plan, 'amount' => $order['amount'], 'currency' => 'USDT', 'reference' => $order['orderId']]);
    billing_reply(200, ['success' => true, 'usdt' => usdt_order_state($order['orderId'], $user['id'])]);
}

// An email typed on the billing page wins: it is how a buyer gets past an address lava.top refused.
$email = trim((string)($input['email'] ?? ''));
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) $email = trim((string)($user['email'] ?? ''));
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
    // lava.top refuses some addresses, e.g. the seller's own email: ask the buyer for another one.
    if ($provider === 'lava' && stripos($result['error'], 'email') !== false) {
        // Name the refused address and say the purchase stays on this account: the buyer is signed in already.
        $typed = filter_var(trim((string)($input['email'] ?? '')), FILTER_VALIDATE_EMAIL) ? true : false;
        $msg = $typed
            ? 'lava.top did not accept ' . $email . '. Try another email.'
            : 'lava.top, our card payment service, did not accept your account email ' . $email . '. Enter another email for the receipt: premium still goes to the account you are signed in with.';
        billing_reply(400, ['success' => false, 'error' => $msg, 'needEmail' => true, 'refusedEmail' => $email]);
    }
    billing_reply(502, ['success' => false, 'error' => 'Payment service is not responding, try again later']);
}
payments_log_write($provider . '.created', ['source' => $provider, 'user_id' => $user['id'], 'plan' => $plan, 'reference' => $result['orderId']]);
billing_reply(200, ['success' => true, 'paymentUrl' => $result['paymentUrl']]);
