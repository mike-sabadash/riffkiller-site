<?php
/**
 * GET: return all riffs from data/riffs.json
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

echo json_encode($data);
