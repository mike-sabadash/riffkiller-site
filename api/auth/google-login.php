<?php
$projectRoot = dirname(__DIR__, 2);
require_once $projectRoot . '/config/load-env.php';
require_once $projectRoot . '/config/site-url.php';
$clientId = getenv('GOOGLE_CLIENT_ID') ?: (isset($_ENV['GOOGLE_CLIENT_ID']) ? $_ENV['GOOGLE_CLIENT_ID'] : '');
if ($clientId === '' && defined('GOOGLE_CLIENT_ID')) $clientId = GOOGLE_CLIENT_ID;
if ($clientId === '' && !empty($GLOBALS['RIFFKILLER_ENV']['GOOGLE_CLIENT_ID'])) $clientId = $GLOBALS['RIFFKILLER_ENV']['GOOGLE_CLIENT_ID'];
if ($clientId === '') {
    $envFile = $projectRoot . DIRECTORY_SEPARATOR . '.env';
    if (is_file($envFile)) {
        $raw = @file_get_contents($envFile);
        if ($raw && preg_match('/^\s*GOOGLE_CLIENT_ID\s*=\s*([^\s#]+)/m', $raw, $m)) $clientId = trim($m[1], " \t\"'");
    }
}
if ($clientId === '') {
    http_response_code(500);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Google OAuth not configured (set GOOGLE_CLIENT_ID in .env)';
    exit();
}
$siteUrl = get_site_base_url();
$redirectUri = $siteUrl . '/api/auth/google-callback.php';
$params = array('client_id' => $clientId, 'redirect_uri' => $redirectUri, 'response_type' => 'code', 'scope' => 'openid email profile', 'access_type' => 'online');
if (!empty($_GET['state'])) $params['state'] = $_GET['state'];
header('Location: https://accounts.google.com/o/oauth2/v2/auth?' . http_build_query($params));
exit();
