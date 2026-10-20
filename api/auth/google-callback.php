<?php
error_reporting(0);
ini_set('display_errors', 0);
require_once dirname(__DIR__, 2) . '/config/google-oauth.php';
require_once dirname(__DIR__, 2) . '/config/user-store.php';

$attempt = $_SESSION['google_oauth'] ?? null;
unset($_SESSION['google_oauth']);
$state = $_GET['state'] ?? '';
if (!is_array($attempt) || !is_string($state) || $state === '' ||
    !hash_equals((string)$attempt['state'], $state) ||
    time() - (int)$attempt['started'] > 600) google_oauth_error('state');
if (!empty($_GET['error'])) google_oauth_error('cancelled');
$code = $_GET['code'] ?? '';
if (!is_string($code) || $code === '') google_oauth_error('response');
$credentials = google_oauth_credentials();
if ($credentials['client_id'] === '' || $credentials['client_secret'] === '') google_oauth_error('configuration');

$token = google_oauth_json('https://oauth2.googleapis.com/token', [
    'method' => 'POST', 'header' => "Content-Type: application/x-www-form-urlencoded\r\n",
    'content' => http_build_query($credentials + [
        'code' => $code, 'redirect_uri' => $attempt['redirect_uri'],
        'grant_type' => 'authorization_code', 'code_verifier' => $attempt['verifier']
    ])
]);
if (empty($token['access_token']) || !is_string($token['access_token'])) google_oauth_error('token');
$info = google_oauth_json('https://openidconnect.googleapis.com/v1/userinfo', [
    'header' => 'Authorization: Bearer ' . $token['access_token'] . "\r\n"
]);
if (empty($info['sub']) || !is_string($info['sub']) ||
    ($info['email_verified'] ?? false) !== true ||
    !filter_var($info['email'] ?? '', FILTER_VALIDATE_EMAIL)) google_oauth_error('identity');
$user = user_find_or_create('google', $info['sub'], $info['email'], $info['name'] ?? '', $info['picture'] ?? '');
if (!$user) google_oauth_error('storage');
session_regenerate_id(true);
$_SESSION['user_id'] = $user['id'];
header('Cache-Control: no-store');
header('Location: ' . get_site_base_url() . '/app.html');
exit();
