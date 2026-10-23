<?php
/**
 * Shared setup for the browser-facing billing endpoints: JSON headers, CORS for the site,
 * the signed-in user from the session.
 */
error_reporting(0);
ini_set('display_errors', 0);

require_once dirname(__DIR__, 2) . '/config/session-start.php';
require_once dirname(__DIR__, 2) . '/config/user-store.php';
require_once dirname(__DIR__, 2) . '/config/billing.php';

$origin = isset($_SERVER['HTTP_ORIGIN']) ? $_SERVER['HTTP_ORIGIN'] : '';
$allowOrigin = (preg_match('#^https://riffkiller\.fun$#', $origin) || preg_match('#^http://(localhost|127\.0\.0\.1)(:\d+)?$#', $origin)) ? $origin : 'https://riffkiller.fun';
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('Access-Control-Allow-Origin: ' . $allowOrigin);
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit(); }

function billing_reply($status, array $body) {
    http_response_code($status);
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit();
}

/** The signed-in user, or null. */
function billing_session_user() {
    $id = isset($_SESSION['user_id']) ? (string)$_SESSION['user_id'] : '';
    if ($id === '') return null;
    $user = user_find_by_id($id);
    return $user ?: null;
}
