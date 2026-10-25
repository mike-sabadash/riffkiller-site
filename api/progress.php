<?php
/**
 * Practice progress of the signed-in student (js/rk-progress.js decides what it means).
 * GET  → { authenticated, progress|null }
 * POST { progress } → stores it. The browser merges with the stored copy first (GET), so nothing is lost.
 * Stored per account in data/progress/<hash of user id>.json, outside the deployed tree.
 */
error_reporting(0);
ini_set('display_errors', 0);

require_once dirname(__DIR__) . '/config/session-start.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$userId = isset($_SESSION['user_id']) ? (string)$_SESSION['user_id'] : '';
// Nothing else needs the session; release it so parallel requests are not queued behind this one.
session_write_close();

if ($method !== 'GET' && $method !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit();
}

if ($userId === '') {
    if ($method === 'GET') {
        echo json_encode(['success' => true, 'authenticated' => false]);
    } else {
        http_response_code(401);
        echo json_encode(['success' => false, 'error' => 'Not authenticated']);
    }
    exit();
}

$dir = dirname(__DIR__) . '/data/progress';
$file = $dir . '/' . hash('sha256', $userId) . '.json';

if ($method === 'GET') {
    $data = is_file($file) ? json_decode((string)file_get_contents($file), true) : null;
    echo json_encode(['success' => true, 'authenticated' => true, 'progress' => is_array($data) ? $data : null]);
    exit();
}

$raw = (string)file_get_contents('php://input');
if (strlen($raw) > 512 * 1024) {
    http_response_code(413);
    echo json_encode(['success' => false, 'error' => 'Progress is too large']);
    exit();
}
$body = json_decode($raw, true);
$progress = is_array($body) && isset($body['progress']) && is_array($body['progress']) ? $body['progress'] : null;
if ($progress === null || (int)($progress['v'] ?? 0) !== 2 || !isset($progress['riffs'], $progress['days']) ||
    !is_array($progress['riffs']) || !is_array($progress['days'])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'progress object required']);
    exit();
}

if (!is_dir($dir)) @mkdir($dir, 0755, true);
$tmp = $file . '.' . bin2hex(random_bytes(4)) . '.tmp';
if (@file_put_contents($tmp, json_encode($progress, JSON_UNESCAPED_UNICODE)) === false || !@rename($tmp, $file)) {
    @unlink($tmp);
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Could not save progress']);
    exit();
}
echo json_encode(['success' => true]);
