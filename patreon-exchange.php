<?php
error_reporting(E_ALL);
ini_set('display_errors', 0);
ini_set('log_errors', 1);
if (ob_get_level()) ob_clean();

// ==========================================================================
// Patreon OAuth Token Exchange - Riff Killer (https://riffkiller.fun + localhost)
// Exchanges the code, signs the user in and grants premium only for an active
// paid membership in our campaign (see config/patreon.php).
// ==========================================================================

$origin = isset($_SERVER['HTTP_ORIGIN']) ? $_SERVER['HTTP_ORIGIN'] : '';
$allowOrigin = 'https://riffkiller.fun';
if (preg_match('#^https://riffkiller\.fun$#', $origin) || preg_match('#^http://(localhost|127\.0\.0\.1)(:\d+)?$#', $origin)) {
    $allowOrigin = $origin;
}
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: ' . $allowOrigin);
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Access-Control-Allow-Credentials: true');
header('Cache-Control: no-store');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    echo json_encode(['ok' => true]);
    exit();
}

require_once __DIR__ . '/config/patreon.php';
require_once __DIR__ . '/config/site-url.php';
require_once __DIR__ . '/config/session-start.php';
require_once __DIR__ . '/config/user-store.php';
require_once __DIR__ . '/config/subscription-store.php';

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    echo json_encode(['ok' => true, 'message' => 'patreon-exchange.php is reachable']);
    exit();
}
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit();
}

$input = json_decode((string)file_get_contents('php://input'), true) ?: [];
$code = isset($input['code']) && is_string($input['code']) ? trim($input['code']) : '';
if ($code === '') {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'No code provided']);
    exit();
}

// redirect_uri must match the authorize request exactly; accept only our own callback URLs.
$allowedRedirects = [
    get_site_base_url() . '/patreon-callback.html',
    'https://riffkiller.fun/patreon-callback.html',
    'http://localhost:8000/patreon-callback.html',
];
$redirectUri = isset($input['redirect_uri']) && is_string($input['redirect_uri']) ? trim($input['redirect_uri']) : '';
if (!in_array($redirectUri, $allowedRedirects, true)) $redirectUri = 'https://riffkiller.fun/patreon-callback.html';

$token = patreon_exchange_code($code, $redirectUri);
if (empty($token['access_token'])) {
    echo json_encode(['success' => false, 'error' => $token['error'] ?? 'Failed to get token from Patreon.']);
    exit();
}

$identity = patreon_fetch_identity($token['access_token']);
if ($identity === null) {
    echo json_encode(['success' => false, 'error' => 'Failed to get user data from Patreon.']);
    exit();
}

$profile = patreon_identity_profile($identity);
$subscription = patreon_identity_subscription($identity);
$user = user_find_or_create('patreon', $profile['id'], $profile['email'], $profile['name'], $profile['picture']);
if (!$user) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Could not save user.']);
    exit();
}
session_regenerate_id(true);
$_SESSION['user_id'] = $user['id'];

// Never downgrade a subscription that came from another source (promo, test).
$current = get_subscription($user['id']);
$otherSourceActive = $current && ($current['source'] ?? '') !== 'patreon' && subscription_is_effectively_active($current);
if (!$otherSourceActive) {
    save_subscription($user['id'], ['status' => $subscription['status'], 'source' => 'patreon', 'expires' => $subscription['expires']]);
}
patreon_log('login', ['user_id' => $user['id'], 'patreon_id' => $profile['id'], 'status' => $subscription['status'], 'reason' => $subscription['reason']]);

echo json_encode([
    'success' => true,
    'token' => [
        'access_token' => $token['access_token'],
        'refresh_token' => $token['refresh_token'] ?? null,
        'expires_in' => $token['expires_in'] ?? 3600,
    ],
    'user' => [
        'id' => $user['id'],
        'full_name' => $user['name'] ?: $profile['name'],
        'email' => $user['email'] ?? '',
        'image_url' => $user['picture'] ?? $profile['picture'],
        'provider' => 'patreon',
    ],
    'subscription' => $otherSourceActive
        ? ['status' => $current['status'], 'source' => $current['source'], 'expiresAt' => $current['expires'] ? $current['expires'] * 1000 : null]
        : ['status' => $subscription['status'], 'source' => 'patreon', 'expiresAt' => $subscription['expires'] ? $subscription['expires'] * 1000 : null],
]);
