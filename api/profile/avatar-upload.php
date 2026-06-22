<?php
/**
 * POST multipart/form-data: upload avatar image.
 * Field: avatar (file).
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

if (empty($_FILES['avatar']) || !is_uploaded_file($_FILES['avatar']['tmp_name'])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'No file uploaded']);
    exit();
}

$file = $_FILES['avatar'];
if ($file['error'] !== UPLOAD_ERR_OK) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Upload error']);
    exit();
}

// Limit size to ~2MB
if ($file['size'] > 2 * 1024 * 1024) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'File too large (max 2MB)']);
    exit();
}

$finfo = finfo_open(FILEINFO_MIME_TYPE);
$mime = finfo_file($finfo, $file['tmp_name']);
finfo_close($finfo);

$ext = '';
if ($mime === 'image/jpeg') $ext = '.jpg';
elseif ($mime === 'image/png') $ext = '.png';
elseif ($mime === 'image/webp') $ext = '.webp';
else {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Unsupported image type']);
    exit();
}

$userId = preg_replace('/[^a-zA-Z0-9_]/', '', (string)$_SESSION['user_id']);
$uploadDir = dirname(__DIR__, 2) . '/uploads/avatars';
if (!is_dir($uploadDir)) {
    mkdir($uploadDir, 0755, true);
}

$filename = 'avatar_' . $userId . '_' . time() . $ext;
$targetPath = $uploadDir . '/' . $filename;

if (!move_uploaded_file($file['tmp_name'], $targetPath)) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Could not save file']);
    exit();
}

// Public URL (relative path from web root)
$publicUrl = '/uploads/avatars/' . $filename;

$user = user_find_by_id($_SESSION['user_id']);
if ($user) {
    $old = isset($user['picture']) ? $user['picture'] : '';
    // Optionally delete old avatar if it is in our uploads folder
    if (is_string($old) && strpos($old, '/uploads/avatars/') === 0) {
        $oldPath = dirname(__DIR__, 2) . $old;
        if (is_file($oldPath)) {
            @unlink($oldPath);
        }
    }
    user_update($_SESSION['user_id'], ['picture' => $publicUrl]);
}

echo json_encode([
    'success' => true,
    'image_url' => $publicUrl,
]);

