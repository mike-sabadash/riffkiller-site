<?php
/**
 * Teaser links (config/riff-access.php).
 *   GET  ?k=<key>              → { success, riffId } when the link belongs to a riff on the site
 *   POST { k, event:'signup' } → counts a sign-up that came from the link (practice.html calls it once per browser)
 *   GET  ?stats=1              → { success, stats } — only for the admin signed in at /admin/
 */
error_reporting(0);
ini_set('display_errors', 0);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$base = dirname(__DIR__, 2);
require_once $base . '/config/riff-visibility.php';
require_once $base . '/config/riff-access.php';

if (isset($_GET['stats'])) {
    require_once $base . '/config/admin-auth.php';
    require_admin_api();
    echo json_encode(['success' => true, 'stats' => (object)riff_drop_stats()]);
    exit;
}

$riffs = json_decode((string)@file_get_contents($base . '/data/riffs.json'), true);

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $body = json_decode((string)file_get_contents('php://input'), true);
    $key = is_array($body) ? ($body['k'] ?? '') : '';
    if (!is_array($body) || ($body['event'] ?? '') !== 'signup' || !riff_by_drop_key($riffs, $key)) {
        http_response_code(400);
        echo json_encode(['success' => false]);
        exit;
    }
    riff_drop_count($key, 'signups');
    echo json_encode(['success' => true]);
    exit;
}

$riff = riff_by_drop_key($riffs, $_GET['k'] ?? '');
if (!$riff) {
    http_response_code(404);
    echo json_encode(['success' => false, 'error' => 'Link not found']);
    exit;
}
echo json_encode(['success' => true, 'riffId' => (int)$riff['id']]);
