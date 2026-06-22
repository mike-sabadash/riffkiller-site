<?php
$projectRoot = dirname(__DIR__, 2);
require_once $projectRoot . '/config/load-env.php';
require_once $projectRoot . '/config/site-url.php';
$clientId = getenv('YANDEX_CLIENT_ID') ?: (isset($_ENV['YANDEX_CLIENT_ID']) ? $_ENV['YANDEX_CLIENT_ID'] : '');
if ($clientId === '' && defined('YANDEX_CLIENT_ID')) $clientId = YANDEX_CLIENT_ID;
if ($clientId === '' && !empty($GLOBALS['RIFFKILLER_ENV']['YANDEX_CLIENT_ID'])) $clientId = $GLOBALS['RIFFKILLER_ENV']['YANDEX_CLIENT_ID'];
if ($clientId === '') {
    $envFile = $projectRoot . DIRECTORY_SEPARATOR . '.env';
    if (is_file($envFile)) {
        $raw = @file_get_contents($envFile);
        if ($raw && preg_match('/^\s*YANDEX_CLIENT_ID\s*=\s*([^\s#]+)/m', $raw, $m)) $clientId = trim($m[1], " \t\"'");
    }
}
if ($clientId === '') {
    http_response_code(500);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Yandex OAuth not configured (set YANDEX_CLIENT_ID in .env)';
    exit();
}
$siteUrl = get_site_base_url();
$redirectUri = $siteUrl . '/api/auth/yandex-callback.php';
$params = ['client_id' => $clientId, 'redirect_uri' => $redirectUri, 'response_type' => 'code'];
if (!empty($_GET['state'])) $params['state'] = $_GET['state'];
header('Location: https://oauth.yandex.ru/authorize?' . http_build_query($params));
exit();
