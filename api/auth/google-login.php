<?php
require_once dirname(__DIR__, 2) . '/config/google-oauth.php';
$credentials = google_oauth_credentials();
if ($credentials['client_id'] === '' || $credentials['client_secret'] === '') google_oauth_error('configuration');

$state = bin2hex(random_bytes(32));
$verifier = rtrim(strtr(base64_encode(random_bytes(48)), '+/', '-_'), '=');
$redirectUri = get_site_base_url() . '/api/auth/google-callback.php';
$_SESSION['google_oauth'] = [
    'state' => $state, 'started' => time(), 'verifier' => $verifier, 'redirect_uri' => $redirectUri
];
$params = [
    'client_id' => $credentials['client_id'], 'redirect_uri' => $redirectUri,
    'response_type' => 'code', 'scope' => 'openid email profile', 'access_type' => 'online',
    'state' => $state, 'code_challenge_method' => 'S256',
    'code_challenge' => rtrim(strtr(base64_encode(hash('sha256', $verifier, true)), '+/', '-_'), '=')
];
header('Cache-Control: no-store');
header('Location: https://accounts.google.com/o/oauth2/v2/auth?' . http_build_query($params));
exit();
