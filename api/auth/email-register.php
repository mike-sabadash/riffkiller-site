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
// The form asks only for email and password: the name shown in the header comes from the email ("jimmy.page@…" → "Jimmy").
if ($name === '' && isset($body['email'])) {
    $local = preg_split('/[._+\-0-9]+/', strstr((string)$body['email'], '@', true) ?: '', -1, PREG_SPLIT_NO_EMPTY);
    $name = $local ? (function_exists('mb_convert_case') ? mb_convert_case(mb_substr($local[0], 0, 40), MB_CASE_TITLE, 'UTF-8') : ucfirst(substr($local[0], 0, 40))) : '';
}

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
if (($body['consent'] ?? false) !== true) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Please accept the Terms and the Privacy Policy to create an account.']);
    exit();
}
if (user_find_by_email($email)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Email already registered. Use Log in.']);
    exit();
}

$user = user_create(['email' => $email, 'name' => $name, 'picture' => '', 'provider' => 'email', 'provider_id' => '', 'password' => $password, 'consent' => legal_consent('checkbox')]);
if (!$user) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Registration failed']);
    exit();
}
session_regenerate_id(true);
$_SESSION['user_id'] = $user['id'];
echo json_encode(['success' => true, 'user' => ['id' => $user['id'], 'email' => $user['email'], 'full_name' => $user['name'] ?: 'User', 'image_url' => $user['picture'] ?? '', 'provider' => 'email']]);

