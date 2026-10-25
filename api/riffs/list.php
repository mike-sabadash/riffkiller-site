<?php
/**
 * GET: riffs from data/riffs.json that are on the site; ?raw=1 from the admin also returns drafts and hidden ones
 */
error_reporting(0);
ini_set('display_errors', 0);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate');
header('Pragma: no-cache');
header('Expires: 0');

$base = dirname(__DIR__, 2);
$file = $base . '/data/riffs.json';

if (!is_file($file)) {
    echo json_encode([]);
    exit;
}

$raw = file_get_contents($file);
$data = json_decode($raw, true);
if (!is_array($data)) {
    echo json_encode([]);
    exit;
}

// Drafts and hidden riffs go only to a signed-in admin asking for the raw list.
require_once $base . '/config/riff-visibility.php';
$isAdmin = false;
if (isset($_GET['raw'])) {
    require_once $base . '/config/session-start.php';
    $isAdmin = isset($_SESSION['admin_promo_logged']) && $_SESSION['admin_promo_logged'] === true;
}
if (!$isAdmin) $data = riff_public_list($data);

// Light WebP copies of each cover for the cards. The admin asks for the raw list (?raw=1): it saves riffs back
// and compares them with the stored ones.
if (!isset($_GET['raw'])) {
    require_once $base . '/config/image-variants.php';
    foreach ($data as $i => $riff) {
        if (!is_array($riff) || empty($riff['thumbnail'])) continue;
        $srcset = image_srcset($riff['thumbnail']);
        if ($srcset !== '') $data[$i]['thumbnailSrcset'] = $srcset;
    }
}

echo json_encode($data);
