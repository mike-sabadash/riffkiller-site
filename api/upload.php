<?php
/**
 * POST multipart: field "file", optional "path" (e.g. assets/video/artist/song/left.mp4).
 * Saves under document root. Returns { "success": true, "path": "assets/..." } or error.
 */
error_reporting(0);
ini_set('display_errors', 0);

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once dirname(__DIR__, 1) . '/config/admin-auth.php';
require_admin_api();

if ($_SERVER['REQUEST_METHOD'] !== 'POST' || !isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'No file or upload error']);
    exit();
}

$path = isset($_POST['path']) ? trim((string) $_POST['path']) : '';
// Media only, inside assets/: never scripts, HTML or SVG anywhere under the web root.
if ($path === '' || strpos($path, '..') !== false || !preg_match('#^assets/[a-zA-Z0-9/_.\-]+\.(mp4|webm|mov|png|jpe?g|webp|gif)$#i', $path)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Invalid path']);
    exit();
}

$root = dirname(__DIR__);
$fullPath = $root . '/' . $path;
$dir = dirname($fullPath);

if (!is_dir($dir)) {
    if (!mkdir($dir, 0755, true)) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Could not create directory']);
        exit();
    }
}

$tmp = $_FILES['file']['tmp_name'];
if (!move_uploaded_file($tmp, $fullPath)) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Could not save file']);
    exit();
}

echo json_encode(['success' => true, 'path' => $path]);
