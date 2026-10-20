<?php
error_reporting(0);
ini_set('display_errors', 0);
if (ob_get_level()) ob_clean();

// ==========================================================================
// Patreon Token Validation - refreshes premium for the signed-in user only.
// The token must belong to the Patreon account linked to the session user.
// ==========================================================================

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: https://riffkiller.fun');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Cache-Control: no-store');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    echo json_encode(['ok' => true]);
    exit();
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit();
}

require_once __DIR__ . '/config/patreon.php';
require_once __DIR__ . '/config/session-start.php';
require_once __DIR__ . '/config/user-store.php';
require_once __DIR__ . '/config/subscription-store.php';

$input = json_decode((string)file_get_contents('php://input'), true) ?: [];
$accessToken = isset($input['token']) && is_string($input['token']) ? $input['token'] : '';
if ($accessToken === '') {
    http_response_code(400);
    echo json_encode(['error' => 'No token provided']);
    exit();
}

$identity = patreon_fetch_identity($accessToken);
if ($identity === null) {
    echo json_encode(['valid' => false, 'error' => 'Token invalid']);
    exit();
}
$profile = patreon_identity_profile($identity);
$subscription = patreon_identity_subscription($identity);

$sessionUser = isset($_SESSION['user_id']) ? user_find_by_id($_SESSION['user_id']) : null;
$patreonUser = $profile['id'] !== '' ? user_find_by_provider('patreon', $profile['id']) : null;
$linked = $sessionUser && $patreonUser && $patreonUser['id'] === $sessionUser['id'];
if ($linked) {
    $current = get_subscription($sessionUser['id']);
    $otherSourceActive = $current && ($current['source'] ?? '') !== 'patreon' && subscription_is_effectively_active($current);
    if (!$otherSourceActive) {
        save_subscription($sessionUser['id'], ['status' => $subscription['status'], 'source' => 'patreon', 'expires' => $subscription['expires']]);
    }
}

echo json_encode([
    'valid' => true,
    'subscription' => [
        'status' => $subscription['status'],
        'expiresAt' => $subscription['expires'] ? $subscription['expires'] * 1000 : null,
    ],
]);
