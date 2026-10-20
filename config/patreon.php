<?php
/**
 * Patreon membership checks shared by the OAuth exchange, token validation and webhook.
 * Premium is granted only for an active, paying membership in OUR campaign
 * (PATREON_CAMPAIGN_ID), optionally limited to PATREON_TIER_IDS.
 */
require_once __DIR__ . '/load-env.php';

if (!function_exists('patreon_env')) {
    function patreon_env($key, $default = '') {
        $value = getenv($key);
        if ($value === false || $value === '') $value = $_ENV[$key] ?? ($GLOBALS['RIFFKILLER_ENV'][$key] ?? '');
        $value = trim((string)$value);
        return $value !== '' ? $value : $default;
    }
}

// Default proxy: the production server is blocked by Patreon's Cloudflare (error 1009).
const PATREON_DEFAULT_PROXY_URL = 'https://patreon-proxy-vercel.vercel.app/api/exchange';

/** Fields the membership decision needs; the identity proxy forwards this query unchanged. */
function patreon_identity_query() {
    return http_build_query([
        'include' => 'memberships,memberships.campaign,memberships.currently_entitled_tiers',
        'fields[user]' => 'full_name,first_name,last_name,email,is_email_verified,image_url',
        'fields[member]' => 'patron_status,currently_entitled_amount_cents,next_charge_date,last_charge_status',
    ]);
}

function patreon_proxy_url() {
    $url = patreon_env('PATREON_PROXY_URL', PATREON_DEFAULT_PROXY_URL);
    return strtolower($url) === 'off' ? '' : rtrim($url, '/');
}

function patreon_log($event, $context = []) {
    $dir = dirname(__DIR__) . '/data/logs';
    if (!is_dir($dir)) @mkdir($dir, 0750, true);
    @file_put_contents($dir . '/patreon.log', date('c') . ' ' . $event . ' ' . json_encode($context) . "\n", FILE_APPEND | LOCK_EX);
}

function patreon_http($url, $options = []) {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_TIMEOUT => 30,
        CURLOPT_HTTPHEADER => array_merge(['User-Agent: RiffKiller/1.0 (https://riffkiller.fun)', 'Accept: application/json'], $options['headers'] ?? []),
    ]);
    if (isset($options['post'])) {
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $options['post']);
    }
    $body = curl_exec($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);
    $json = is_string($body) ? json_decode($body, true) : null;
    return ['status' => $status, 'error' => $error, 'json' => is_array($json) ? $json : null];
}

/** Exchange an OAuth code for an access token (through the proxy when configured). */
function patreon_exchange_code($code, $redirectUri) {
    $proxy = patreon_proxy_url();
    if ($proxy !== '') {
        $res = patreon_http($proxy, [
            'headers' => ['Content-Type: application/json'],
            'post' => json_encode(['code' => $code, 'redirect_uri' => $redirectUri]),
        ]);
        $token = $res['json']['token']['access_token'] ?? null;
        if ($res['status'] === 200 && !empty($res['json']['success']) && is_string($token) && $token !== '') {
            return ['access_token' => $token, 'refresh_token' => $res['json']['token']['refresh_token'] ?? null, 'expires_in' => $res['json']['token']['expires_in'] ?? 3600];
        }
        patreon_log('proxy_exchange_fail', ['http' => $res['status'], 'error' => $res['json']['error'] ?? $res['error']]);
        return ['error' => $res['json']['error'] ?? 'Patreon proxy exchange failed'];
    }
    $clientId = patreon_env('PATREON_CLIENT_ID');
    $clientSecret = patreon_env('PATREON_CLIENT_SECRET');
    if ($clientId === '' || $clientSecret === '') return ['error' => 'Patreon OAuth not configured (set PATREON_CLIENT_ID and PATREON_CLIENT_SECRET in .env)'];
    $res = patreon_http('https://www.patreon.com/api/oauth2/token', [
        'post' => http_build_query([
            'code' => $code, 'grant_type' => 'authorization_code',
            'client_id' => $clientId, 'client_secret' => $clientSecret, 'redirect_uri' => $redirectUri,
        ]),
    ]);
    if ($res['status'] !== 200 || empty($res['json']['access_token'])) {
        patreon_log('token_fail', ['http' => $res['status'], 'error' => $res['json']['error'] ?? $res['error']]);
        $desc = $res['json']['error_description'] ?? '';
        return ['error' => ($res['json']['error'] ?? '') === 'invalid_grant' ? 'Redirect URI mismatch or code expired.' : ($desc ?: 'Failed to get token from Patreon.')];
    }
    return $res['json'];
}

/** Fetch identity + memberships for an access token. Returns the decoded JSON:API document or null. */
function patreon_fetch_identity($accessToken) {
    $proxy = patreon_proxy_url();
    $base = $proxy !== '' ? preg_replace('#/api/exchange$#', '', $proxy) . '/api/identity' : 'https://www.patreon.com/api/oauth2/v2/identity';
    $res = patreon_http($base . '?' . patreon_identity_query(), ['headers' => ['Authorization: Bearer ' . $accessToken]]);
    if ($res['status'] !== 200 || !is_array($res['json']) || empty($res['json']['data']['id'])) {
        patreon_log('identity_fail', ['http' => $res['status'], 'via_proxy' => $proxy !== '', 'error' => $res['error'] ?: null]);
        return null;
    }
    return $res['json'];
}

/**
 * Decide premium from one Patreon member resource.
 * @return array ['status' => 'active'|'inactive', 'expires' => int|null, 'reason' => string]
 */
function patreon_member_subscription($member, $now = null) {
    $now = $now ?? time();
    $campaignId = patreon_env('PATREON_CAMPAIGN_ID');
    if ($campaignId === '') return ['status' => 'inactive', 'expires' => null, 'reason' => 'campaign_not_configured'];
    if (!is_array($member) || ($member['type'] ?? '') !== 'member') return ['status' => 'inactive', 'expires' => null, 'reason' => 'no_membership'];
    $memberCampaign = (string)($member['relationships']['campaign']['data']['id'] ?? '');
    if ($memberCampaign !== $campaignId) return ['status' => 'inactive', 'expires' => null, 'reason' => 'other_campaign'];
    $attrs = $member['attributes'] ?? [];
    if (($attrs['patron_status'] ?? '') !== 'active_patron') return ['status' => 'inactive', 'expires' => null, 'reason' => 'not_active_patron'];

    $allowedTiers = array_values(array_filter(array_map('trim', explode(',', patreon_env('PATREON_TIER_IDS')))));
    $tiers = array_map(function ($t) { return (string)($t['id'] ?? ''); }, $member['relationships']['currently_entitled_tiers']['data'] ?? []);
    if ($allowedTiers) {
        if (!array_intersect($allowedTiers, $tiers)) return ['status' => 'inactive', 'expires' => null, 'reason' => 'tier_not_allowed'];
    } elseif ((int)($attrs['currently_entitled_amount_cents'] ?? 0) <= 0) {
        return ['status' => 'inactive', 'expires' => null, 'reason' => 'free_membership'];
    }

    // Access lasts until the next charge plus a short grace period; webhooks and re-login refresh it.
    $next = !empty($attrs['next_charge_date']) ? strtotime((string)$attrs['next_charge_date']) : false;
    $expires = ($next && $next > $now) ? $next + 3 * 86400 : $now + 32 * 86400;
    return ['status' => 'active', 'expires' => $expires, 'reason' => 'active'];
}

/** Find our campaign's membership in an identity document and decide premium. */
function patreon_identity_subscription($identity) {
    $best = ['status' => 'inactive', 'expires' => null, 'reason' => 'no_membership'];
    foreach (($identity['included'] ?? []) as $item) {
        if (($item['type'] ?? '') !== 'member') continue;
        $result = patreon_member_subscription($item);
        if ($result['status'] === 'active') return $result;
        if ($best['reason'] === 'no_membership' || $result['reason'] !== 'other_campaign') $best = $result;
    }
    return $best;
}

/** Normalized profile; email is used for account linking only when Patreon verified it. */
function patreon_identity_profile($identity) {
    $attrs = $identity['data']['attributes'] ?? [];
    $name = trim((string)($attrs['full_name'] ?? ''));
    if ($name === '') $name = trim(trim((string)($attrs['first_name'] ?? '')) . ' ' . trim((string)($attrs['last_name'] ?? ''))) ?: 'User';
    $email = (string)($attrs['email'] ?? '');
    return [
        'id' => (string)($identity['data']['id'] ?? ''),
        'name' => $name,
        'email' => !empty($attrs['is_email_verified']) && filter_var($email, FILTER_VALIDATE_EMAIL) ? $email : '',
        'picture' => (string)($attrs['image_url'] ?? '') ?: 'assets/icons/default-avatar.svg',
    ];
}

/** Verify X-Patreon-Signature (hex HMAC-MD5 of the raw body with the webhook secret). */
function patreon_webhook_signature_valid($rawBody, $signature) {
    $secret = patreon_env('PATREON_WEBHOOK_SECRET');
    if ($secret === '' || !is_string($signature) || $signature === '') return false;
    return hash_equals(hash_hmac('md5', (string)$rawBody, $secret), strtolower(trim($signature)));
}
