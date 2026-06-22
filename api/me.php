<?php
/**
 * GET: current user from session (for unified auth). Requires credentials (cookies).
 */
error_reporting(0);
ini_set('display_errors', 0);

require_once dirname(__DIR__) . '/config/session-start.php';
require_once dirname(__DIR__) . '/config/user-store.php';

$origin = isset($_SERVER['HTTP_ORIGIN']) ? $_SERVER['HTTP_ORIGIN'] : '';
$allowOrigin = 'https://riffkiller.fun';
if (preg_match('#^https://riffkiller\.fun$#', $origin) || preg_match('#^http://(localhost|127\.0\.0\.1)(:\d+)?$#', $origin)) {
    $allowOrigin = $origin;
}
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: ' . $allowOrigin);
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit();
}

$userId = isset($_SESSION['user_id']) ? $_SESSION['user_id'] : null;
if (!$userId) {
    http_response_code(200);
    echo json_encode(['success' => true, 'authenticated' => false]);
    exit();
}

$user = user_find_by_id($userId);
if (!$user) {
    if (strpos((string)$userId, 'test_') === 0) {
        $user = [
            'id' => $userId,
            'email' => '',
            'name' => 'Test User',
            'picture' => '',
            'provider' => 'test',
        ];
    } else {
        unset($_SESSION['user_id']);
        http_response_code(200);
        echo json_encode(['success' => true, 'authenticated' => false]);
        exit();
    }
}

echo json_encode([
    'success' => true,
    'authenticated' => true,
    'user' => [
        'id' => $user['id'],
        'email' => $user['email'] ?? '',
        'full_name' => $user['name'] ?? 'User',
        'image_url' => $user['picture'] ?? '',
        'provider' => $user['provider'] ?? 'email',
    ]
]);
