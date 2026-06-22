<?php
/**
 * POST { "email": "..." }: create magic token, send email, return success.
 */
error_reporting(0);
ini_set('display_errors', 0);

require_once dirname(__DIR__, 2) . '/config/load-env.php';
require_once dirname(__DIR__, 2) . '/config/user-store.php';
require_once dirname(__DIR__, 2) . '/config/magic-tokens.php';

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

$raw = file_get_contents('php://input');
$body = $raw ? json_decode($raw, true) : [];
$email = isset($body['email']) ? trim((string)$body['email']) : '';
if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Valid email required']);
    exit();
}

$token = magic_token_create($email);
if (!$token) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Could not create link']);
    exit();
}

$protocol = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on') ? 'https' : 'http';
$host = $_SERVER['HTTP_HOST'] ?? 'riffkiller.fun';
$baseUrl = $protocol . '://' . $host;
$link = $baseUrl . '/api/auth/magic-verify.php?token=' . urlencode($token);

$subject = 'Riff Killer – sign in link';
$message = "Click to sign in: " . $link . "\n\nLink is valid for 15 minutes.\n— Riff Killer";
$headers = 'From: Riff Killer <noreply@' . (preg_match('/^[^.]+\./', $host) ? $host : 'riffkiller.fun') . '>' . "\r\n" . 'Content-Type: text/plain; charset=utf-8';
@mail($email, $subject, $message, $headers);

echo json_encode(['success' => true, 'message' => 'Check your email for the sign-in link']);
