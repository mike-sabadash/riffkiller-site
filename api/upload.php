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
// Media only, inside assets/: never scripts, HTML, SVG or XML anywhere under the web root.
// Tab files (Guitar Pro, compressed MusicXML) only under assets/tabs/.
$media = '#^assets/[a-zA-Z0-9/_.\-]+\.(mp4|webm|mov|png|jpe?g|webp|gif)$#i';
$tabs = '#^assets/tabs/[a-zA-Z0-9/_.\-]+\.(gp|gp3|gp4|gp5|gpx|mxl)$#i';
if ($path === '' || strpos($path, '..') !== false || !(preg_match($media, $path) || preg_match($tabs, $path))) {
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

// Covers: light WebP copies for the cards and the collection banner (config/image-variants.php).
$variants = isset($_POST['variants']) ? (string) $_POST['variants'] : '';
if (($variants === 'card' || $variants === 'banner') && preg_match('#^assets/img/#', $path)) {
    require_once $root . '/config/image-variants.php';
    @chmod($fullPath, 0664);
    image_make_variants($path, $variants === 'banner' ? IMAGE_BANNER_WIDTHS : IMAGE_CARD_WIDTHS);
    echo json_encode(['success' => true, 'path' => $path, 'srcset' => image_srcset($path)]);
    exit();
}

echo json_encode(['success' => true, 'path' => $path]);
