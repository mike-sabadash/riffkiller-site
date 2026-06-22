<?php
error_reporting(0);
ini_set('display_errors', 0);

$projectRoot = dirname(__DIR__, 2);
require_once $projectRoot . '/config/load-env.php';
require_once $projectRoot . '/config/site-url.php';
require_once $projectRoot . '/config/session-start.php';
require_once $projectRoot . '/config/user-store.php';

if (!function_exists('riffkiller_debug_log_google')) {
    function riffkiller_debug_log_google($hypothesisId, $message, array $data = []) { /* no-op unless debug path set */ }
}

$code = isset($_GET['code']) ? trim($_GET['code']) : '';

// Try to read Google credentials from multiple sources (env, constants, parsed .env),
// mirroring the logic in google-login.php
$clientId = getenv('GOOGLE_CLIENT_ID') ?: (isset($_ENV['GOOGLE_CLIENT_ID']) ? $_ENV['GOOGLE_CLIENT_ID'] : '');
if ($clientId === '' && defined('GOOGLE_CLIENT_ID')) {
    $clientId = GOOGLE_CLIENT_ID;
}
if ($clientId === '' && !empty($GLOBALS['RIFFKILLER_ENV']['GOOGLE_CLIENT_ID'])) {
    $clientId = $GLOBALS['RIFFKILLER_ENV']['GOOGLE_CLIENT_ID'];
}
if ($clientId === '') {
    $envFile = $projectRoot . DIRECTORY_SEPARATOR . '.env';
    if (is_file($envFile)) {
        $raw = @file_get_contents($envFile);
        if ($raw && preg_match('/^\s*GOOGLE_CLIENT_ID\s*=\s*([^\s#]+)/m', $raw, $m)) {
            $clientId = trim($m[1], " \t\"'");
        }
    }
}

$clientSecret = getenv('GOOGLE_CLIENT_SECRET') ?: (isset($_ENV['GOOGLE_CLIENT_SECRET']) ? $_ENV['GOOGLE_CLIENT_SECRET'] : '');
if ($clientSecret === '' && defined('GOOGLE_CLIENT_SECRET')) {
    $clientSecret = GOOGLE_CLIENT_SECRET;
}
if ($clientSecret === '' && !empty($GLOBALS['RIFFKILLER_ENV']['GOOGLE_CLIENT_SECRET'])) {
    $clientSecret = $GLOBALS['RIFFKILLER_ENV']['GOOGLE_CLIENT_SECRET'];
}
if ($clientSecret === '') {
    $envFile = $projectRoot . DIRECTORY_SEPARATOR . '.env';
    if (is_file($envFile)) {
        $raw = @file_get_contents($envFile);
        if ($raw && preg_match('/^\s*GOOGLE_CLIENT_SECRET\s*=\s*([^\s#]+)/m', $raw, $m)) {
            $clientSecret = trim($m[1], " \t\"'");
        }
    }
}

$baseUrl = get_site_base_url();
$redirectUri = $baseUrl . '/api/auth/google-callback.php';

riffkiller_debug_log_google('H1', 'initial_params', [
    'code_present'          => $code !== '',
    'client_id_present'     => $clientId !== '',
    'client_secret_present' => $clientSecret !== '',
]);

if ($code === '' || $clientId === '' || $clientSecret === '') {
    riffkiller_debug_log_google('H1', 'missing_required_param_branch', [
        'code_present'          => $code !== '',
        'client_id_present'     => $clientId !== '',
        'client_secret_present' => $clientSecret !== '',
    ]);
    $q = http_build_query([
        'auth'  => 'error',
        'src'   => 'google',
        'step'  => 'params',
        'code'  => $code !== '' ? '1' : '0',
        'cid'   => $clientId !== '' ? '1' : '0',
        'csec'  => $clientSecret !== '' ? '1' : '0',
    ]);
    header('Location: ' . $baseUrl . '/?' . $q);
    exit();
}

$tokenRes = @file_get_contents('https://oauth2.googleapis.com/token', false, stream_context_create([
    'http' => [
        'method'  => 'POST',
        'header'  => "Content-Type: application/x-www-form-urlencoded\r\n",
        'content' => http_build_query([
            'code'          => $code,
            'client_id'     => $clientId,
            'client_secret' => $clientSecret,
            'redirect_uri'  => $redirectUri,
            'grant_type'    => 'authorization_code',
        ]),
    ],
]));
$tokenData = $tokenRes ? json_decode($tokenRes, true) : null;
$accessToken = $tokenData['access_token'] ?? null;

riffkiller_debug_log_google('H2', 'token_response', [
    'token_res_present'   => (bool)$tokenRes,
    'token_json_ok'       => is_array($tokenData),
    'access_token_present'=> $accessToken !== null,
]);

if (!$accessToken) {
    riffkiller_debug_log_google('H2', 'no_access_token_branch', [
        'token_res_present'    => (bool)$tokenRes,
        'token_json_ok'        => is_array($tokenData),
        'access_token_present' => $accessToken !== null,
    ]);
    $q = http_build_query([
        'auth'   => 'error',
        'src'    => 'google',
        'step'   => 'token',
        't_res'  => $tokenRes ? '1' : '0',
        't_json' => is_array($tokenData) ? '1' : '0',
    ]);
    header('Location: ' . $baseUrl . '/?' . $q);
    exit();
}

$userRes = @file_get_contents('https://www.googleapis.com/oauth2/v2/userinfo?access_token=' . urlencode($accessToken));
$userInfo = $userRes ? json_decode($userRes, true) : null;

riffkiller_debug_log_google('H3', 'userinfo_response', [
    'user_res_present'  => (bool)$userRes,
    'userinfo_json_ok'  => is_array($userInfo),
    'user_id_present'   => $userInfo && !empty($userInfo['id']),
]);

if (!$userInfo || empty($userInfo['id'])) {
    riffkiller_debug_log_google('H3', 'invalid_userinfo_branch', [
        'user_res_present' => (bool)$userRes,
        'userinfo_json_ok' => is_array($userInfo),
        'user_id_present'  => $userInfo && !empty($userInfo['id']),
    ]);
    $q = http_build_query([
        'auth'    => 'error',
        'src'     => 'google',
        'step'    => 'userinfo',
        'u_res'   => $userRes ? '1' : '0',
        'u_json'  => is_array($userInfo) ? '1' : '0',
        'u_id_ok' => $userInfo && !empty($userInfo['id']) ? '1' : '0',
    ]);
    header('Location: ' . $baseUrl . '/?' . $q);
    exit();
}

$user = user_find_or_create('google', (string)$userInfo['id'], $userInfo['email'] ?? '', $userInfo['name'] ?? '', $userInfo['picture'] ?? '');
if ($user) $_SESSION['user_id'] = $user['id'];
// Редирект в приложение, а не в профиль — чтобы пользователь с промокодом не попадал на заглушку
header('Location: ' . $baseUrl . '/app.html');
exit();
