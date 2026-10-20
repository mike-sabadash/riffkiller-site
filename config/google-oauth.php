<?php
/** Google web-server OAuth. Credentials remain in the server environment. */
require_once __DIR__ . '/load-env.php';
require_once __DIR__ . '/site-url.php';
require_once __DIR__ . '/session-start.php';

function google_oauth_credentials() {
    $read = function ($key) {
        return trim((string)(getenv($key) ?: ($_ENV[$key] ?? ($GLOBALS['RIFFKILLER_ENV'][$key] ?? ''))));
    };
    return ['client_id' => $read('GOOGLE_CLIENT_ID'), 'client_secret' => $read('GOOGLE_CLIENT_SECRET')];
}
function google_oauth_error($reason) {
    header('Cache-Control: no-store');
    header('Location: ' . get_site_base_url() . '/app.html?' . http_build_query([
        'auth' => 'error', 'src' => 'google', 'reason' => $reason
    ]));
    exit();
}
function google_oauth_json($url, $options = []) {
    $options += ['timeout' => 15, 'ignore_errors' => true];
    $raw = @file_get_contents($url, false, stream_context_create(['http' => $options]));
    $data = $raw === false ? null : json_decode($raw, true);
    return is_array($data) && empty($data['error']) ? $data : null;
}
