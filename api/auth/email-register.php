<?php
error_reporting(0);
ini_set('display_errors', 0);
require_once dirname(__DIR__, 2) . '/config/load-env.php';
require_once dirname(__DIR__, 2) . '/config/session-start.php';
require_once dirname(__DIR__, 2) . '/config/user-store.php';

$origin = isset($_SERVER['HTTP_ORIGIN']) ? $_SERVER['HTTP_ORIGIN'] : '';
$allowOrigin = (preg_match('#^https://riffkiller\.fun$#', $origin) || preg_match('#^http://(localhost|127\.0\.0\.1)(:\d+)?$#', $origin)) ? $origin : 'https://riffkiller.fun';
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: ' . $allowOrigin);
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit(); }
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); echo json_encode(['success' => false, 'error' => 'Method not allowed']); exit(); }

$raw = file_get_contents('php://input');
$body = $raw ? json_decode($raw, true) : [];
$email = isset($body['email']) ? trim((string)$body['email']) : '';
$password = isset($body['password']) ? (string)$body['password'] : '';
$name = isset($body['name']) ? trim((string)$body['name']) : '';

if (!$email || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Valid email required']);
    exit();
}
if (strlen($password) < 6) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Password at least 6 characters']);
    exit();
}
if (user_find_by_email($email)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Email already registered. Use Log in.']);
    exit();
}

$user = user_create(['email' => $email, 'name' => $name, 'picture' => '', 'provider' => 'email', 'provider_id' => '', 'password' => $password]);
if (!$user) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Registration failed']);
    exit();
}
$_SESSION['user_id'] = $user['id'];
echo json_encode(['success' => true, 'user' => ['id' => $user['id'], 'email' => $user['email'], 'full_name' => $user['name'] ?: 'User', 'image_url' => $user['picture'] ?? '', 'provider' => 'email']]);
