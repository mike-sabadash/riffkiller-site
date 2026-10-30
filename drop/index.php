<?php
/**
 * The link from an Instagram teaser: riffkiller.fun/drop/?r=<key> (config/riff-access.php).
 * Counts the visit and opens that riff in the focus mode of practice.html. An unknown link goes to the library.
 */
error_reporting(0);
ini_set('display_errors', 0);
header('Cache-Control: no-store');
$base = dirname(__DIR__);
require_once $base . '/config/riff-visibility.php';
require_once $base . '/config/riff-access.php';

$key = $_GET['r'] ?? '';
if ($key === '' && !empty($_SERVER['QUERY_STRING']) && strpos($_SERVER['QUERY_STRING'], '=') === false) $key = $_SERVER['QUERY_STRING'];
$riffs = json_decode((string)@file_get_contents($base . '/data/riffs.json'), true);
$riff = riff_by_drop_key($riffs, $key);
if (!$riff) {
    header('Location: /index.html', true, 302);
    exit;
}
$key = riff_drop_key_normalize($key);
riff_drop_count($key, 'opens');
header('Location: /practice.html?riff=' . (int)$riff['id'] . '&drop=' . rawurlencode($key), true, 302);
