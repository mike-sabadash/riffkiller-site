<?php
/**
 * Yandex OAuth callback: exchange code, get user, find_or_create, set session, redirect.
 */
error_reporting(0);
ini_set('display_errors', 0);

$projectRoot = dirname(__DIR__, 2);
require_once $projectRoot . '/config/load-env.php';
require_once $projectRoot . '/config/site-url.php';
require_once $projectRoot . '/config/session-start.php';
require_once $projectRoot . '/config/user-store.php';

$code = isset($_GET['code']) ? trim($_GET['code']) : '';

// Resolve Yandex OAuth credentials similarly to yandex-login.php
$clientId = getenv('YANDEX_CLIENT_ID') ?: (isset($_ENV['YANDEX_CLIENT_ID']) ? $_ENV['YANDEX_CLIENT_ID'] : '');
if ($clientId === '' && defined('YANDEX_CLIENT_ID')) {
    $clientId = YANDEX_CLIENT_ID;
}
if ($clientId === '' && !empty($GLOBALS['RIFFKILLER_ENV']['YANDEX_CLIENT_ID'])) {
    $clientId = $GLOBALS['RIFFKILLER_ENV']['YANDEX_CLIENT_ID'];
}
if ($clientId === '') {
    $envFile = $projectRoot . DIRECTORY_SEPARATOR . '.env';
    if (is_file($envFile)) {
        $raw = @file_get_contents($envFile);
        if ($raw && preg_match('/^\s*YANDEX_CLIENT_ID\s*=\s*([^\s#]+)/m', $raw, $m)) {
            $clientId = trim($m[1], " \t\"'");
        }
    }
}

$clientSecret = getenv('YANDEX_CLIENT_SECRET') ?: (isset($_ENV['YANDEX_CLIENT_SECRET']) ? $_ENV['YANDEX_CLIENT_SECRET'] : '');
if ($clientSecret === '' && defined('YANDEX_CLIENT_SECRET')) {
    $clientSecret = YANDEX_CLIENT_SECRET;
}
if ($clientSecret === '' && !empty($GLOBALS['RIFFKILLER_ENV']['YANDEX_CLIENT_SECRET'])) {
    $clientSecret = $GLOBALS['RIFFKILLER_ENV']['YANDEX_CLIENT_SECRET'];
}
if ($clientSecret === '') {
    $envFile = $projectRoot . DIRECTORY_SEPARATOR . '.env';
    if (is_file($envFile)) {
        $raw = @file_get_contents($envFile);
        if ($raw && preg_match('/^\s*YANDEX_CLIENT_SECRET\s*=\s*([^\s#]+)/m', $raw, $m)) {
            $clientSecret = trim($m[1], " \t\"'");
        }
    }
}

$baseUrl = get_site_base_url();
$redirectUri = $baseUrl . '/api/auth/yandex-callback.php';

if ($code === '' || $clientId === '' || $clientSecret === '') {
    $q = http_build_query([
        'auth'  => 'error',
        'src'   => 'yandex',
        'step'  => 'params',
        'code'  => $code !== '' ? '1' : '0',
        'cid'   => $clientId !== '' ? '1' : '0',
        'csec'  => $clientSecret !== '' ? '1' : '0',
    ]);
    header('Location: ' . $baseUrl . '/?' . $q);
    exit();
}

$tokenUrl = 'https://oauth.yandex.ru/token';
$body = http_build_query([
    'grant_type' => 'authorization_code',
    'code' => $code,
    'client_id' => $clientId,
    'client_secret' => $clientSecret,
]);
$ctx = stream_context_create([
    'http' => [
        'method' => 'POST',
        'header' => "Content-Type: application/x-www-form-urlencoded\r\n",
        'content' => $body,
    ]
]);
$tokenRes = @file_get_contents($tokenUrl, false, $ctx);
$tokenData = $tokenRes ? json_decode($tokenRes, true) : null;
$accessToken = $tokenData['access_token'] ?? null;
if (!$accessToken) {
    $q = http_build_query([
        'auth'   => 'error',
        'src'    => 'yandex',
        'step'   => 'token',
        't_res'  => $tokenRes ? '1' : '0',
        't_json' => is_array($tokenData) ? '1' : '0',
    ]);
    header('Location: ' . $baseUrl . '/?' . $q);
    exit();
}

$userInfoUrl = 'https://login.yandex.ru/info?format=json';
$ctx = stream_context_create([
    'http' => [
        'header' => 'Authorization: OAuth ' . $accessToken . "\r\n",
    ]
]);
$userRes = @file_get_contents($userInfoUrl, false, $ctx);
$userInfo = $userRes ? json_decode($userRes, true) : null;
if (!$userInfo || empty($userInfo['id'])) {
    $q = http_build_query([
        'auth'    => 'error',
        'src'     => 'yandex',
        'step'    => 'userinfo',
        'u_res'   => $userRes ? '1' : '0',
        'u_json'  => is_array($userInfo) ? '1' : '0',
        'u_id_ok' => $userInfo && !empty($userInfo['id']) ? '1' : '0',
    ]);
    header('Location: ' . $baseUrl . '/?' . $q);
    exit();
}

// Name: Yandex returns real_name, display_name, or first_name+last_name depending on app scope
$yandexName = trim((string)($userInfo['real_name'] ?? '') ?: (string)($userInfo['display_name'] ?? ''));
if ($yandexName === '') {
    $first = trim((string)($userInfo['first_name'] ?? ''));
    $last = trim((string)($userInfo['last_name'] ?? ''));
    $yandexName = trim($first . ' ' . $last) ?: (string)($userInfo['login'] ?? '');
}
$user = user_find_or_create(
    'yandex',
    (string)$userInfo['id'],
    $userInfo['default_email'] ?? ($userInfo['emails'][0] ?? ''),
    $yandexName !== '' ? $yandexName : 'User',
    !empty($userInfo['default_avatar_id'])
        ? 'https://avatars.yandex.net/get-yapic/' . $userInfo['default_avatar_id'] . '/islands-200'
        : ''
);
if ($user) {
    $_SESSION['user_id'] = $user['id'];
}
// Редирект в приложение, а не в профиль — чтобы пользователь с промокодом не попадал на заглушку (profile мог редиректить до подхвата сессии)
header('Location: ' . $baseUrl . '/app.html');
exit();
