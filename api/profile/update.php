<?php
/**
 * POST: update profile (display name).
 * Body: { "full_name": "..." }
 */
error_reporting(0);
ini_set('display_errors', 0);

require_once dirname(__DIR__, 2) . '/config/session-start.php';
require_once dirname(__DIR__, 2) . '/config/user-store.php';

$origin = isset($_SERVER['HTTP_ORIGIN']) ? $_SERVER['HTTP_ORIGIN'] : '';
$allowOrigin = 'https://riffkiller.fun';
if (preg_match('#^https://riffkiller\.fun$#', $origin) || preg_match('#^http://(localhost|127\.0\.0\.1)(:\d+)?$#', $origin)) {
    $allowOrigin = $origin;
}
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: ' . $allowOrigin);
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit();
}

if (empty($_SESSION['user_id'])) {
    http_response_code(401);
    echo json_encode(['success' => false, 'error' => 'Not authenticated']);
    exit();
}

$raw = file_get_contents('php://input');
$body = $raw ? json_decode($raw, true) : [];
$fullName = isset($body['full_name']) ? trim((string)$body['full_name']) : '';
$fullName = mb_substr($fullName, 0, 80);

// Basic sanitization
$fullName = preg_replace('/[\r\n]+/', ' ', $fullName);

$userId = $_SESSION['user_id'];
$user = user_find_by_id($userId);
if (!$user) {
    http_response_code(404);
    echo json_encode(['success' => false, 'error' => 'User not found']);
    exit();
}

if ($fullName === '') {
    $fullName = $user['name'] ?: 'User';
}

$updated = user_update($userId, ['name' => $fullName]);
if (!$updated) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Could not update profile']);
    exit();
}

echo json_encode([
    'success' => true,
    'user' => [
        'id' => $updated['id'],
        'email' => $updated['email'],
        'full_name' => $updated['name'],
        'image_url' => $updated['picture'],
        'provider' => $updated['provider'],
    ],
]);

