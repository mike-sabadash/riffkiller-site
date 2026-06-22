<?php
$projectRoot = __DIR__;
require_once $projectRoot . '/config/load-env.php';
if (!defined('PATREON_PROXY_URL')) {
    define('PATREON_PROXY_URL', 'https://patreon-proxy-vercel.vercel.app/api/exchange');
}

error_reporting(E_ALL);
ini_set('display_errors', 0);
ini_set('log_errors', 1);
if (ob_get_level()) ob_clean();

// ==========================================================================
// Patreon OAuth Token Exchange - Riff Killer (https://riffkiller.fun + localhost)
// ==========================================================================
// Deployment: place in site root; chmod 644. Ensure client_secret matches Patreon app.

// CORS: allow request origin so browser doesn't block (fixes 403/CORS when testing on localhost)
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

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    echo json_encode(['ok' => true]);
    exit();
}

require_once __DIR__ . '/config/session-start.php';
require_once __DIR__ . '/config/user-store.php';
require_once __DIR__ . '/config/subscription-store.php';

// Test endpoint: GET or POST with no code (or ?test=1) to verify script is reachable
$input = [];
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $rawInput = file_get_contents('php://input');
    $input = $rawInput ? (json_decode($rawInput, true) ?: []) : [];
}
$testMode = isset($_GET['test']) || ($_SERVER['REQUEST_METHOD'] === 'GET');
$code = $input['code'] ?? '';

if ($testMode && !$code) {
    http_response_code(200);
    echo json_encode(['ok' => true, 'message' => 'patreon-exchange.php is reachable']);
    exit();
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit();
}

if (!$code) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'No code provided']);
    exit();
}

// Patreon app credentials – from .env, same robust loading as Google/Yandex callbacks
$clientId = getenv('PATREON_CLIENT_ID') ?: (isset($_ENV['PATREON_CLIENT_ID']) ? $_ENV['PATREON_CLIENT_ID'] : '');
if ($clientId === '' && defined('PATREON_CLIENT_ID')) {
    $clientId = PATREON_CLIENT_ID;
}
if ($clientId === '' && !empty($GLOBALS['RIFFKILLER_ENV']['PATREON_CLIENT_ID'])) {
    $clientId = $GLOBALS['RIFFKILLER_ENV']['PATREON_CLIENT_ID'];
}
if ($clientId === '') {
    $envFile = $projectRoot . DIRECTORY_SEPARATOR . '.env';
    if (is_file($envFile)) {
        $raw = @file_get_contents($envFile);
        if ($raw && preg_match('/^\s*PATREON_CLIENT_ID\s*=\s*([^\s#]+)/m', $raw, $m)) {
            $clientId = trim($m[1], " \t\"'");
        }
    }
}

$clientSecret = getenv('PATREON_CLIENT_SECRET') ?: (isset($_ENV['PATREON_CLIENT_SECRET']) ? $_ENV['PATREON_CLIENT_SECRET'] : '');
if ($clientSecret === '' && defined('PATREON_CLIENT_SECRET')) {
    $clientSecret = PATREON_CLIENT_SECRET;
}
if ($clientSecret === '' && !empty($GLOBALS['RIFFKILLER_ENV']['PATREON_CLIENT_SECRET'])) {
    $clientSecret = $GLOBALS['RIFFKILLER_ENV']['PATREON_CLIENT_SECRET'];
}
if ($clientSecret === '') {
    $envFile = $projectRoot . DIRECTORY_SEPARATOR . '.env';
    if (is_file($envFile)) {
        $raw = @file_get_contents($envFile);
        if ($raw && preg_match('/^\s*PATREON_CLIENT_SECRET\s*=\s*([^\s#]+)/m', $raw, $m)) {
            $clientSecret = trim($m[1], " \t\"'");
        }
    }
}

if ($clientId === '' || $clientSecret === '') {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Patreon OAuth not configured (set PATREON_CLIENT_ID and PATREON_CLIENT_SECRET in .env)']);
    exit();
}

// Use redirect_uri from client so it exactly matches the authorization request (avoids proxy/host issues)
$redirectUri = isset($input['redirect_uri']) && is_string($input['redirect_uri']) ? trim($input['redirect_uri']) : '';
if ($redirectUri === '') {
    $protocol = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on') ? 'https' : 'http';
    $host = $_SERVER['HTTP_HOST'] ?? '';
    if ($host === 'localhost:8000' || $host === '127.0.0.1:8000') {
        $redirectUri = 'http://localhost:8000/patreon-callback.html';
    } else {
        $redirectUri = 'https://riffkiller.fun/patreon-callback.html';
    }
}

// Optional: use proxy when production server IP is blocked by Patreon/Cloudflare (error 1009 = country/region banned)
// Set PATREON_PROXY_URL to your serverless proxy URL (e.g. Vercel) so the token request runs from an allowed region.
$proxyUrl = getenv('PATREON_PROXY_URL') ?: (defined('PATREON_PROXY_URL') ? PATREON_PROXY_URL : '');
if ($proxyUrl !== '') {
    $proxyUrl = rtrim($proxyUrl, '/');
    $ch = curl_init($proxyUrl);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode(['code' => $code, 'redirect_uri' => $redirectUri]));
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 35);
    $proxyResponse = curl_exec($ch);
    $proxyCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($proxyCode === 200 && $proxyResponse !== false) {
        $out = json_decode($proxyResponse, true);
        if (is_array($out) && array_key_exists('success', $out) && !empty($out['success'])) {
            // Proxy returned success but we must create session on our server (proxy can't set our PHP session)
            $pu = $out['user'] ?? [];
            $patreonId = (string)($pu['id'] ?? '');
            $email = $pu['email'] ?? '';
            $name = trim((string)($pu['full_name'] ?? '')) ?: 'User';
            $picture = $pu['image_url'] ?? 'assets/icons/default-avatar.svg';
            if ($patreonId !== '') {
                $user = user_find_or_create('patreon', $patreonId, $email, $name, $picture);
                if ($user) {
                    $_SESSION['user_id'] = $user['id'];
                    $out['user'] = array_merge($pu, ['id' => $user['id'], 'full_name' => $user['name'] ?: $name, 'provider' => 'patreon']);
                    $subStatus = isset($out['subscription']['status']) ? $out['subscription']['status'] : 'inactive';
                    save_subscription($user['id'], ['status' => $subStatus, 'source' => 'patreon']);
                }
            }
            echo json_encode($out);
            exit();
        }
    }
    $logFile = __DIR__ . '/patreon-exchange.log';
    @file_put_contents($logFile, date('c') . ' proxy_fail url=' . $proxyUrl . ' http=' . $proxyCode . ' body=' . substr($proxyResponse, 0, 300) . "\n", FILE_APPEND | LOCK_EX);
    // Fall through to direct Patreon call (will likely fail with 1009 again)
}

// Обмениваем код на токен
$ch = curl_init('https://www.patreon.com/api/oauth2/token');
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query([
    'code' => $code,
    'grant_type' => 'authorization_code',
    'client_id' => $clientId,
    'client_secret' => $clientSecret,
    'redirect_uri' => $redirectUri
]));
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'User-Agent: RiffKiller/1.0 (https://riffkiller.fun)',
    'Accept: application/json'
]);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 30);

$tokenResponse = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlError = curl_error($ch);
curl_close($ch);

if ($curlError) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Curl error: ' . $curlError]);
    exit();
}

if ($httpCode !== 200) {
    $details = json_decode($tokenResponse, true);
    $patreonError = isset($details['error']) ? $details['error'] : '';
    $patreonDesc = isset($details['error_description']) ? $details['error_description'] : '';
    $message = 'Failed to get token from Patreon.';
    if ($patreonError === 'invalid_grant' || (is_string($patreonDesc) && strpos($patreonDesc, 'redirect') !== false)) {
        $message = 'Redirect URI mismatch. Ensure Patreon app redirect URI matches this page (e.g. ' . $redirectUri . ').';
    } elseif ($patreonDesc) {
        $message = is_string($patreonDesc) ? $patreonDesc : json_encode($patreonDesc);
    }
    // Log for server debugging (create patreon-exchange.log in same directory; ensure writable)
    $logFile = __DIR__ . '/patreon-exchange.log';
    $logLine = date('c') . ' token_fail http=' . $httpCode . ' redirect_uri=' . $redirectUri . ' error=' . $patreonError . ' desc=' . (is_string($patreonDesc) ? $patreonDesc : json_encode($patreonDesc)) . ' body=' . substr($tokenResponse, 0, 500) . "\n";
    @file_put_contents($logFile, $logLine, FILE_APPEND | LOCK_EX);
    http_response_code(200);
    echo json_encode([
        'success' => false,
        'error' => $message,
        'patreon_error' => $patreonError,
        'patreon_description' => $patreonDesc,
        'http_code' => $httpCode
    ]);
    exit();
}

$tokenData = json_decode($tokenResponse, true);
$accessToken = $tokenData['access_token'] ?? null;

if (!$accessToken) {
    http_response_code(400);
    echo json_encode(['error' => 'No access token received']);
    exit();
}

// Получаем данные пользователя (first_name, last_name для fallback имени)
$ch = curl_init('https://www.patreon.com/api/oauth2/v2/identity?include=memberships&fields[user]=full_name,first_name,last_name,email,image_url');
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Authorization: Bearer ' . $accessToken,
    'User-Agent: Riff Killer App'
]);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 30);

$userResponse = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlError = curl_error($ch);
curl_close($ch);

if ($curlError) {
    http_response_code(500);
    echo json_encode(['error' => 'Curl error: ' . $curlError]);
    exit();
}

if ($httpCode !== 200) {
    http_response_code($httpCode);
    echo json_encode([
        'error' => 'Failed to get user data',
        'details' => json_decode($userResponse, true)
    ]);
    exit();
}

$userData = json_decode($userResponse, true);

// Проверяем статус подписки
$subscriptionStatus = 'inactive';
if (isset($userData['included']) && is_array($userData['included'])) {
    foreach ($userData['included'] as $included) {
        if (($included['type'] ?? '') === 'member') {
            $attrs = $included['attributes'] ?? [];
            $status = $attrs['patron_status'] ?? 'inactive';
            $subscriptionStatus = $status === 'active_patron' ? 'active' : 'inactive';
            break;
        }
    }
}

// Единая база пользователей: создаём/обновляем и ставим сессию
$patreonId = (string)($userData['data']['id'] ?? '');
$email = $userData['data']['attributes']['email'] ?? '';
$attrs = $userData['data']['attributes'] ?? [];
// Имя: full_name или first_name+last_name, как у Yandex/Google
$name = trim((string)($attrs['full_name'] ?? ''));
if ($name === '') {
    $first = trim((string)($attrs['first_name'] ?? ''));
    $last = trim((string)($attrs['last_name'] ?? ''));
    $name = trim($first . ' ' . $last) ?: 'User';
}
$picture = $attrs['image_url'] ?? 'assets/icons/default-avatar.svg';
$user = user_find_or_create('patreon', $patreonId, $email, $name, $picture);
if ($user) {
    $_SESSION['user_id'] = $user['id'];
    save_subscription($user['id'], ['status' => $subscriptionStatus, 'source' => 'patreon']);
}

// Формируем ответ (id — наш внутренний для подписок и api/me)
$response = [
    'success' => true,
    'token' => [
        'access_token' => $accessToken,
        'refresh_token' => $tokenData['refresh_token'] ?? null,
        'expires_in' => $tokenData['expires_in'] ?? 3600
    ],
    'user' => [
        'id' => $user ? $user['id'] : ($userData['data']['id'] ?? null),
        'full_name' => $name,
        'email' => $email,
        'image_url' => $picture,
        'provider' => 'patreon'
    ],
    'subscription' => [
        'status' => $subscriptionStatus
    ]
];

echo json_encode($response);