<?php
/**
 * Card payments for premium: lava.top (cards worldwide, USD), Robokassa and YooKassa (RUB).
 *
 * A provider is enabled once its keys are in .env. Every paid order is stored in
 * data/billing/orders.json; the user's auto-renewal state lives in data/billing/renewals.json.
 * lava.top renews subscriptions on its side and reports each charge by webhook;
 * Robokassa and YooKassa are charged by us from config/billing-renew.php (cron).
 */
require_once __DIR__ . '/load-env.php';
require_once __DIR__ . '/subscription-store.php';
require_once __DIR__ . '/payments-log.php';

const BILLING_PROVIDERS = ['lava', 'robokassa', 'yookassa'];
const BILLING_PERIOD_DAYS = ['monthly' => 30, 'yearly' => 365];
// Premium stays on this long past the paid period while a renewal is retried.
const BILLING_GRACE_DAYS = 3;

function billing_env($key, $default = '') {
    $v = getenv($key);
    if ($v === false || $v === '') $v = isset($_ENV[$key]) ? $_ENV[$key] : '';
    $v = trim((string)$v);
    return ($v === '' || $v === 'CHANGE_ME') ? $default : $v;
}

function billing_plan($plan) {
    return $plan === 'yearly' ? 'yearly' : 'monthly';
}

/** Price in RUB for Robokassa and YooKassa: BILLING_RUB_MONTHLY / BILLING_RUB_YEARLY. */
function billing_rub_price($plan) {
    $v = billing_env(billing_plan($plan) === 'yearly' ? 'BILLING_RUB_YEARLY' : 'BILLING_RUB_MONTHLY');
    return preg_match('/^\d+(\.\d{1,2})?$/', $v) && (float)$v > 0 ? number_format((float)$v, 2, '.', '') : null;
}

function billing_enabled($provider) {
    switch ($provider) {
        case 'lava':
            return billing_env('LAVA_API_KEY') !== '' && billing_env('LAVA_OFFER_ID') !== '' && billing_env('LAVA_WEBHOOK_SECRET') !== '';
        case 'robokassa':
            return billing_env('ROBOKASSA_LOGIN') !== '' && billing_env('ROBOKASSA_PASSWORD1') !== '' && billing_env('ROBOKASSA_PASSWORD2') !== ''
                && billing_rub_price('monthly') !== null && billing_rub_price('yearly') !== null;
        case 'yookassa':
            return billing_env('YOOKASSA_SHOP_ID') !== '' && billing_env('YOOKASSA_SECRET_KEY') !== ''
                && billing_rub_price('monthly') !== null && billing_rub_price('yearly') !== null;
    }
    return false;
}

function billing_public_options() {
    $out = [];
    foreach (BILLING_PROVIDERS as $p) $out[$p] = billing_enabled($p);
    // Older integrations, shown only while their keys are configured.
    $out['stripe'] = (bool)preg_match('/^sk_(live|test)_(?!xxxx$)/', billing_env('STRIPE_SECRET_KEY'));
    $out['cryptomus'] = billing_env('CRYPTOMUS_MERCHANT_ID') !== '' && billing_env('CRYPTOMUS_API_KEY') !== '';
    $out['rub'] = ['monthly' => billing_rub_price('monthly'), 'yearly' => billing_rub_price('yearly')];
    return $out;
}

// --------------------------------------------------------------------------
// Storage
// --------------------------------------------------------------------------

function billing_dir() {
    $dir = dirname(__DIR__) . '/data/billing';
    if (!is_dir($dir)) @mkdir($dir, 0750, true);
    return $dir;
}

/** Read-modify-write a JSON file under an exclusive lock. $fn receives the array and returns the new one, or null to leave the file as it is. */
function billing_update_json($name, callable $fn) {
    $path = billing_dir() . '/' . $name;
    $fh = @fopen($path, 'c+');
    if (!$fh) return null;
    flock($fh, LOCK_EX);
    $raw = stream_get_contents($fh);
    $data = $raw ? json_decode($raw, true) : [];
    if (!is_array($data)) $data = [];
    $result = $fn($data);
    if (is_array($result)) {
        ftruncate($fh, 0);
        rewind($fh);
        fwrite($fh, json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
        fflush($fh);
        $data = $result;
    }
    flock($fh, LOCK_UN);
    fclose($fh);
    return $data;
}

function billing_read_json($name) {
    return billing_update_json($name, function () { return null; }) ?: [];
}

function billing_order_save($id, array $fields) {
    $id = (string)$id;
    $all = billing_update_json('orders.json', function ($orders) use ($id, $fields) {
        $orders[$id] = array_merge(isset($orders[$id]) ? $orders[$id] : ['created' => time()], $fields);
        return $orders;
    });
    return $all[$id] ?? null;
}

function billing_order_get($id) {
    $orders = billing_read_json('orders.json');
    return isset($orders[(string)$id]) ? $orders[(string)$id] : null;
}

function billing_renewal_get($userId) {
    $all = billing_read_json('renewals.json');
    return isset($all[(string)$userId]) ? $all[(string)$userId] : null;
}

function billing_renewal_save($userId, $fields) {
    $userId = (string)$userId;
    $all = billing_update_json('renewals.json', function ($all) use ($userId, $fields) {
        if ($fields === null) unset($all[$userId]);
        else $all[$userId] = array_merge(isset($all[$userId]) ? $all[$userId] : [], $fields);
        return $all;
    });
    return $all[$userId] ?? null;
}

function billing_renewals_all() {
    return billing_read_json('renewals.json');
}

/** Next sequential Robokassa InvId (Robokassa wants an integer up to 2^31). */
function billing_next_inv_id() {
    $n = 0;
    billing_update_json('counter.json', function ($c) use (&$n) {
        $n = max((int)($c['inv'] ?? 0), 1000) + 1;
        $c['inv'] = $n;
        return $c;
    });
    return $n;
}

/**
 * Marks an order paid exactly once and extends the user's premium by the plan period.
 * Returns the subscription expiry, or null if the order was already applied.
 */
function billing_apply_payment($orderId, $note = '') {
    $applied = false;
    $order = null;
    billing_update_json('orders.json', function ($orders) use ($orderId, &$applied, &$order) {
        if (!isset($orders[$orderId]) || !empty($orders[$orderId]['paid'])) return null;
        $orders[$orderId]['paid'] = time();
        $applied = true;
        $order = $orders[$orderId];
        return $orders;
    });
    if (!$applied) return null;
    $userId = (string)$order['user_id'];
    $plan = billing_plan($order['plan'] ?? 'monthly');
    // Extend from the end of the paid period, not from today, so early renewals are not lost.
    $base = time();
    $previous = billing_renewal_get($userId);
    if ($previous && ($previous['provider'] ?? '') === $order['provider'] && (int)($previous['paid_until'] ?? 0) > $base) {
        $base = (int)$previous['paid_until'];
    }
    $paidUntil = $base + BILLING_PERIOD_DAYS[$plan] * 86400;
    $expires = $paidUntil + BILLING_GRACE_DAYS * 86400;
    save_subscription($userId, ['status' => 'active', 'plan' => $plan, 'source' => $order['provider'], 'expires' => $expires]);
    billing_renewal_save($userId, array_filter([
        'provider' => $order['provider'],
        'plan' => $plan,
        'auto' => true,
        'paid_until' => $paidUntil,
        'attempts' => 0,
        'last_error' => null,
        'contract' => $order['contract'] ?? null,
        'token' => $order['token'] ?? null,
        'email' => $order['email'] ?? null,
    ], function ($v, $k) { return $v !== null || $k === 'last_error'; }, ARRAY_FILTER_USE_BOTH));
    payments_log_write($order['provider'] . '.paid', [
        'source' => $order['provider'], 'user_id' => $userId, 'status' => 'active', 'plan' => $plan,
        'amount' => $order['amount'] ?? null, 'currency' => $order['currency'] ?? null,
        'reference' => $orderId, 'note' => $note,
    ]);
    return $expires;
}

/** Stops further charges; premium stays until the end of the paid period. */
function billing_stop_renewal($userId, $reason) {
    $r = billing_renewal_get($userId);
    if (!$r || empty($r['auto'])) return false;
    billing_renewal_save($userId, ['auto' => false, 'stopped' => time(), 'stop_reason' => $reason]);
    payments_log_write($r['provider'] . '.renewal.stopped', [
        'source' => $r['provider'], 'user_id' => $userId, 'plan' => $r['plan'] ?? null, 'note' => $reason,
    ]);
    return true;
}

// --------------------------------------------------------------------------
// HTTP
// --------------------------------------------------------------------------

/** JSON request to a provider API. Returns [status, decoded body]. */
function billing_http($method, $url, array $headers, $body = null, $auth = null) {
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 20);
    if ($auth !== null) curl_setopt($ch, CURLOPT_USERPWD, $auth);
    if ($body !== null) {
        $headers[] = 'Content-Type: application/json';
        curl_setopt($ch, CURLOPT_POSTFIELDS, is_string($body) ? $body : json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    }
    $headers[] = 'Accept: application/json';
    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    $raw = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    $data = is_string($raw) ? json_decode($raw, true) : null;
    return [$code, is_array($data) ? $data : ['raw' => is_string($raw) ? substr($raw, 0, 300) : null]];
}

function billing_site_url($path) {
    require_once __DIR__ . '/site-url.php';
    return get_site_base_url() . '/' . ltrim($path, '/');
}

// --------------------------------------------------------------------------
// lava.top — https://gate.lava.top/docs
// --------------------------------------------------------------------------

function lava_api_base() {
    return rtrim(billing_env('LAVA_API_BASE', 'https://gate.lava.top'), '/');
}

function lava_offer_id($plan) {
    return billing_plan($plan) === 'yearly' ? billing_env('LAVA_OFFER_ID_YEARLY', billing_env('LAVA_OFFER_ID')) : billing_env('LAVA_OFFER_ID');
}

function lava_create_invoice($userId, $plan, $email, $lang) {
    $plan = billing_plan($plan);
    $lang = strtoupper((string)$lang);
    $body = [
        'email' => $email,
        'offerId' => lava_offer_id($plan),
        'currency' => billing_env('LAVA_CURRENCY', 'USD'),
        'periodicity' => $plan === 'yearly' ? 'PERIOD_YEAR' : 'MONTHLY',
        'buyerLanguage' => in_array($lang, ['EN', 'RU', 'ES'], true) ? $lang : 'EN',
        'clientUtm' => ['utm_source' => 'riffkiller', 'utm_content' => 'u:' . $userId],
        'successful_return_url' => billing_site_url('billing.html?paid=lava'),
        'failure_return_url' => billing_site_url('billing.html?failed=lava'),
        'cancel_return_url' => billing_site_url('billing.html'),
    ];
    list($code, $data) = billing_http('POST', lava_api_base() . '/api/v3/invoice', ['X-Api-Key: ' . billing_env('LAVA_API_KEY')], $body);
    if ($code < 200 || $code >= 300 || empty($data['id']) || empty($data['paymentUrl'])) {
        return ['error' => 'lava.top: ' . ($data['error'] ?? $data['message'] ?? ('HTTP ' . $code))];
    }
    billing_order_save($data['id'], [
        'provider' => 'lava', 'user_id' => (string)$userId, 'plan' => $plan, 'email' => $email,
        'contract' => $data['id'], 'amount' => $data['amountTotal']['amount'] ?? null, 'currency' => $data['amountTotal']['currency'] ?? $body['currency'],
    ]);
    return ['paymentUrl' => $data['paymentUrl'], 'orderId' => $data['id']];
}

/** lava.top sends the secret from its webhook settings in X-Api-Key, or as HTTP Basic auth. */
function lava_webhook_authorized(array $server) {
    $secret = billing_env('LAVA_WEBHOOK_SECRET');
    if ($secret === '') return false;
    $key = isset($server['HTTP_X_API_KEY']) ? (string)$server['HTTP_X_API_KEY'] : '';
    if ($key !== '' && hash_equals($secret, $key)) return true;
    $auth = isset($server['HTTP_AUTHORIZATION']) ? (string)$server['HTTP_AUTHORIZATION'] : '';
    if (stripos($auth, 'Basic ') === 0) {
        $pair = explode(':', (string)base64_decode(substr($auth, 6)), 2);
        return isset($pair[1]) && hash_equals($secret, $pair[1]);
    }
    return false;
}

function lava_invoice_completed($contractId) {
    list($code, $data) = billing_http('GET', lava_api_base() . '/api/v2/invoices/' . rawurlencode($contractId), ['X-Api-Key: ' . billing_env('LAVA_API_KEY')]);
    return $code === 200 && strtoupper((string)($data['status'] ?? '')) === 'COMPLETED';
}

function lava_handle_webhook(array $event) {
    $type = (string)($event['eventType'] ?? '');
    $contract = (string)($event['contractId'] ?? '');
    $parent = (string)($event['parentContractId'] ?? '');
    switch ($type) {
        case 'payment.success':
            $order = $contract !== '' ? billing_order_get($contract) : null;
            if (!$order || $order['provider'] !== 'lava') return 'unknown contract';
            // The webhook secret is the gate; the invoice lookup confirms the payment with lava.top itself.
            if (!lava_invoice_completed($contract)) return 'not completed';
            billing_apply_payment($contract, 'payment.success');
            return 'paid';
        case 'subscription.recurring.payment.success':
            $first = $parent !== '' ? billing_order_get($parent) : null;
            if (!$first || $first['provider'] !== 'lava' || $contract === '') return 'unknown contract';
            if (billing_order_get($contract)) return 'duplicate';
            billing_order_save($contract, [
                'provider' => 'lava', 'user_id' => $first['user_id'], 'plan' => $first['plan'], 'email' => $first['email'] ?? null,
                'contract' => $parent, 'amount' => isset($event['amount']) ? (string)$event['amount'] : null, 'currency' => $event['currency'] ?? null,
            ]);
            billing_apply_payment($contract, 'recurring');
            return 'renewed';
        case 'subscription.cancelled':
            // lava.top names either the first contract or the latest charge here.
            $order = billing_order_get($parent !== '' ? $parent : $contract);
            if ($order && $order['provider'] === 'lava') {
                billing_stop_renewal($order['user_id'], 'cancelled on lava.top');
                return 'cancelled';
            }
            return 'unknown contract';
        case 'subscription.recurring.payment.failed':
            $first = $parent !== '' ? billing_order_get($parent) : null;
            if ($first) payments_log_write('lava.recurring.failed', ['source' => 'lava', 'user_id' => $first['user_id'], 'reference' => $contract, 'note' => (string)($event['errorMessage'] ?? '')]);
            return 'logged';
    }
    return 'ignored';
}

function lava_cancel($renewal) {
    if (empty($renewal['contract']) || empty($renewal['email'])) return false;
    $url = lava_api_base() . '/api/v1/subscriptions?' . http_build_query(['contractId' => $renewal['contract'], 'email' => $renewal['email']]);
    list($code) = billing_http('DELETE', $url, ['X-Api-Key: ' . billing_env('LAVA_API_KEY')]);
    return $code === 204 || $code === 200 || $code === 404;
}

// --------------------------------------------------------------------------
// Robokassa — https://docs.robokassa.ru
// --------------------------------------------------------------------------

function robokassa_hash($s) {
    $algo = strtolower(billing_env('ROBOKASSA_HASH', 'md5'));
    return hash(in_array($algo, ['md5', 'sha1', 'sha256', 'sha384', 'sha512'], true) ? $algo : 'md5', $s);
}

function robokassa_is_test() {
    return billing_env('ROBOKASSA_TEST') === '1';
}

/** Shp_ parameters go into the signature sorted by name, as "Shp_name=value". */
function robokassa_shp_string(array $shp) {
    ksort($shp);
    $parts = [];
    foreach ($shp as $k => $v) $parts[] = $k . '=' . $v;
    return $parts ? ':' . implode(':', $parts) : '';
}

function robokassa_create_payment($userId, $plan, $email) {
    $plan = billing_plan($plan);
    $sum = billing_rub_price($plan);
    $invId = billing_next_inv_id();
    $login = billing_env('ROBOKASSA_LOGIN');
    $shp = ['Shp_plan' => $plan, 'Shp_user' => (string)$userId];
    $desc = $plan === 'yearly' ? 'Riff Killer Premium, 1 year' : 'Riff Killer Premium, 1 month';
    $params = [
        'MerchantLogin' => $login,
        'OutSum' => $sum,
        'InvId' => $invId,
        'Description' => $desc,
        'Recurring' => 'true',
        'Culture' => 'ru',
        'SignatureValue' => robokassa_hash($login . ':' . $sum . ':' . $invId . ':' . billing_env('ROBOKASSA_PASSWORD1') . robokassa_shp_string($shp)),
    ];
    if ($email !== '') $params['Email'] = $email;
    if (robokassa_is_test()) $params['IsTest'] = '1';
    billing_order_save('rk' . $invId, [
        'provider' => 'robokassa', 'user_id' => (string)$userId, 'plan' => $plan, 'email' => $email,
        'token' => (string)$invId, 'amount' => $sum, 'currency' => 'RUB',
    ]);
    return ['paymentUrl' => 'https://auth.robokassa.ru/Merchant/Index.aspx?' . http_build_query($params + $shp), 'orderId' => 'rk' . $invId];
}

/** ResultURL: OutSum:InvId:Password2[:Shp_...]. Returns the body Robokassa expects ("OK<InvId>") or null. */
function robokassa_handle_result(array $req) {
    $sum = (string)($req['OutSum'] ?? '');
    $invId = (string)($req['InvId'] ?? '');
    $sig = strtolower((string)($req['SignatureValue'] ?? ''));
    $shp = [];
    foreach ($req as $k => $v) if (strpos($k, 'Shp_') === 0) $shp[$k] = (string)$v;
    $expected = robokassa_hash($sum . ':' . $invId . ':' . billing_env('ROBOKASSA_PASSWORD2') . robokassa_shp_string($shp));
    if ($sig === '' || !hash_equals($expected, $sig)) return null;
    $order = billing_order_get('rk' . $invId);
    if (!$order || $order['provider'] !== 'robokassa') return null;
    if (abs((float)$sum - (float)$order['amount']) > 0.009) return null;
    billing_apply_payment('rk' . $invId, 'ResultURL');
    return 'OK' . $invId;
}

/** Charges a saved card: a new InvId referencing the first payment. The result arrives on ResultURL. */
function robokassa_charge($userId, $renewal) {
    $plan = billing_plan($renewal['plan'] ?? 'monthly');
    $sum = billing_rub_price($plan);
    $invId = billing_next_inv_id();
    $login = billing_env('ROBOKASSA_LOGIN');
    $shp = ['Shp_plan' => $plan, 'Shp_user' => (string)$userId];
    billing_order_save('rk' . $invId, [
        'provider' => 'robokassa', 'user_id' => (string)$userId, 'plan' => $plan, 'email' => $renewal['email'] ?? '',
        'token' => (string)$renewal['token'], 'amount' => $sum, 'currency' => 'RUB', 'renewal' => true,
    ]);
    $form = [
        'MerchantLogin' => $login,
        'InvoiceID' => $invId,
        'PreviousInvoiceID' => $renewal['token'],
        'OutSum' => $sum,
        'Description' => 'Riff Killer Premium renewal',
        'SignatureValue' => robokassa_hash($login . ':' . $sum . ':' . $invId . ':' . billing_env('ROBOKASSA_PASSWORD1') . robokassa_shp_string($shp)),
    ] + $shp;
    $ch = curl_init(billing_env('ROBOKASSA_RECURRING_URL', 'https://auth.robokassa.ru/Merchant/Recurring'));
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($form));
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);
    $raw = (string)curl_exec($ch);
    curl_close($ch);
    // Robokassa answers "OK<InvId>" when it accepted the charge; the money is confirmed on ResultURL.
    return strpos($raw, 'OK' . $invId) === 0;
}

// --------------------------------------------------------------------------
// YooKassa — https://yookassa.ru/developers/api
// --------------------------------------------------------------------------

function yookassa_api_base() {
    return rtrim(billing_env('YOOKASSA_API_BASE', 'https://api.yookassa.ru'), '/');
}

function yookassa_auth() {
    return billing_env('YOOKASSA_SHOP_ID') . ':' . billing_env('YOOKASSA_SECRET_KEY');
}

function yookassa_payment_body($userId, $plan, $email) {
    $plan = billing_plan($plan);
    $body = [
        'amount' => ['value' => billing_rub_price($plan), 'currency' => 'RUB'],
        'capture' => true,
        'description' => $plan === 'yearly' ? 'Riff Killer Premium, 1 year' : 'Riff Killer Premium, 1 month',
        'metadata' => ['user_id' => (string)$userId, 'plan' => $plan],
    ];
    // Self-employed shops get receipts from YooKassa automatically; a 54-FZ shop sets YOOKASSA_RECEIPT=1.
    if ($email !== '' && billing_env('YOOKASSA_RECEIPT') === '1') $body['receipt'] = ['customer' => ['email' => $email], 'items' => [[
        'description' => $body['description'], 'quantity' => '1.00', 'amount' => $body['amount'],
        'vat_code' => 1, 'payment_mode' => 'full_payment', 'payment_subject' => 'service',
    ]]];
    return $body;
}

function yookassa_create_payment($userId, $plan, $email) {
    $body = yookassa_payment_body($userId, $plan, $email);
    $body['save_payment_method'] = true;
    $body['confirmation'] = ['type' => 'redirect', 'return_url' => billing_site_url('billing.html?paid=yookassa')];
    list($code, $data) = billing_http('POST', yookassa_api_base() . '/v3/payments', ['Idempotence-Key: ' . bin2hex(random_bytes(16))], $body, yookassa_auth());
    if ($code !== 200 || empty($data['id']) || empty($data['confirmation']['confirmation_url'])) {
        return ['error' => 'YooKassa: ' . ($data['description'] ?? ('HTTP ' . $code))];
    }
    billing_order_save('yk' . $data['id'], [
        'provider' => 'yookassa', 'user_id' => (string)$userId, 'plan' => billing_plan($plan), 'email' => $email,
        'amount' => $body['amount']['value'], 'currency' => 'RUB',
    ]);
    return ['paymentUrl' => $data['confirmation']['confirmation_url'], 'orderId' => 'yk' . $data['id']];
}

function yookassa_get_payment($id) {
    list($code, $data) = billing_http('GET', yookassa_api_base() . '/v3/payments/' . rawurlencode($id), [], null, yookassa_auth());
    return $code === 200 ? $data : null;
}

/** Applies a payment after re-reading it from the API: notifications themselves are not signed. */
function yookassa_sync_payment($id) {
    $order = billing_order_get('yk' . $id);
    if (!$order || $order['provider'] !== 'yookassa') return 'unknown payment';
    $p = yookassa_get_payment($id);
    if (!$p) return 'lookup failed';
    if (($p['status'] ?? '') === 'canceled') {
        if (!empty($order['renewal'])) billing_renewal_failed($order['user_id'], 'yookassa: ' . ($p['cancellation_details']['reason'] ?? 'canceled'));
        return 'canceled';
    }
    if (($p['status'] ?? '') !== 'succeeded' || empty($p['paid'])) return 'pending';
    if ((string)($p['amount']['value'] ?? '') !== (string)$order['amount'] || ($p['metadata']['user_id'] ?? '') !== $order['user_id']) return 'mismatch';
    $method = $p['payment_method'] ?? [];
    if (!empty($method['saved']) && !empty($method['id'])) billing_order_save('yk' . $id, ['token' => $method['id']]);
    elseif (!empty($order['renewal'])) billing_order_save('yk' . $id, ['token' => $order['token'] ?? null]);
    billing_apply_payment('yk' . $id, 'payment.succeeded');
    return 'paid';
}

function yookassa_charge($userId, $renewal) {
    $body = yookassa_payment_body($userId, $renewal['plan'] ?? 'monthly', $renewal['email'] ?? '');
    $body['payment_method_id'] = $renewal['token'];
    list($code, $data) = billing_http('POST', yookassa_api_base() . '/v3/payments', ['Idempotence-Key: renew-' . $userId . '-' . (int)$renewal['paid_until']], $body, yookassa_auth());
    if ($code !== 200 || empty($data['id'])) return false;
    billing_order_save('yk' . $data['id'], [
        'provider' => 'yookassa', 'user_id' => (string)$userId, 'plan' => billing_plan($renewal['plan'] ?? 'monthly'),
        'email' => $renewal['email'] ?? '', 'token' => $renewal['token'], 'amount' => $body['amount']['value'], 'currency' => 'RUB', 'renewal' => true,
    ]);
    // A declined charge is recorded by yookassa_sync_payment(); this only reports whether the API took the request.
    yookassa_sync_payment($data['id']);
    return true;
}

// --------------------------------------------------------------------------
// Renewals (Robokassa, YooKassa)
// --------------------------------------------------------------------------

const BILLING_MAX_RENEW_ATTEMPTS = 3;

function billing_renewal_failed($userId, $reason) {
    $r = billing_renewal_get($userId);
    if (!$r) return;
    billing_renewal_save($userId, ['last_error' => $reason]);
    payments_log_write($r['provider'] . '.renewal.failed', ['source' => $r['provider'], 'user_id' => $userId, 'note' => $reason]);
}

/**
 * Charges every auto-renewing Robokassa/YooKassa subscription whose paid period ends within a day.
 * One attempt per subscription per 12 hours; after three unpaid attempts auto-renewal stops
 * (a successful payment resets the count). Returns a list of [userId, provider, result].
 */
function billing_run_renewals($now = null) {
    $now = $now === null ? time() : (int)$now;
    $done = [];
    foreach (billing_renewals_all() as $userId => $r) {
        if (empty($r['auto']) || empty($r['token']) || !in_array($r['provider'] ?? '', ['robokassa', 'yookassa'], true)) continue;
        if ((int)($r['paid_until'] ?? 0) - 86400 > $now) continue;
        if ((int)($r['last_attempt'] ?? 0) > $now - 12 * 3600) continue;
        if (!billing_enabled($r['provider'])) continue;
        if ((int)($r['attempts'] ?? 0) >= BILLING_MAX_RENEW_ATTEMPTS) {
            billing_stop_renewal($userId, 'renewal was not paid after ' . BILLING_MAX_RENEW_ATTEMPTS . ' attempts');
            $done[] = [(string)$userId, $r['provider'], 'stopped'];
            continue;
        }
        billing_renewal_save($userId, ['last_attempt' => $now, 'attempts' => (int)($r['attempts'] ?? 0) + 1]);
        $ok = $r['provider'] === 'robokassa' ? robokassa_charge($userId, $r) : yookassa_charge($userId, $r);
        if (!$ok) billing_renewal_failed($userId, $r['provider'] . ': charge was not accepted');
        $done[] = [(string)$userId, $r['provider'], $ok ? 'charged' : 'failed'];
    }
    return $done;
}
