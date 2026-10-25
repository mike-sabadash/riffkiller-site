<?php
/**
 * Light WebP copies (config/image-variants.php) for every cover the site shows, from the command line.
 * Each deploy runs it, so pictures added before this existed, or by hand, get their copies too.
 *   php config/image-variants-cli.php --all
 */
if (PHP_SAPI !== 'cli') exit(1);
require_once __DIR__ . '/image-variants.php';
if (($argv[1] ?? '') !== '--all') { fwrite(STDERR, "usage: image-variants-cli.php --all\n"); exit(1); }

$jobs = [];
$riffs = json_decode((string)@file_get_contents(image_root() . '/data/riffs.json'), true);
foreach (is_array($riffs) ? $riffs : [] as $riff) {
    if (!empty($riff['thumbnail'])) $jobs[$riff['thumbnail']] = IMAGE_CARD_WIDTHS;
}
$collections = json_decode((string)@file_get_contents(image_root() . '/data/collections.json'), true);
foreach (is_array($collections) ? $collections : [] as $c) {
    if (!empty($c['imageUrl'])) $jobs[$c['imageUrl']] = IMAGE_CARD_WIDTHS;
    if (!empty($c['bannerUrl'])) $jobs[$c['bannerUrl']] = IMAGE_BANNER_WIDTHS;
}
$made = 0; $missing = 0;
foreach ($jobs as $path => $widths) {
    $made += image_make_variants($path, $widths);
    if (image_srcset($path) === '') $missing++;
}
echo 'Cover pictures: ' . count($jobs) . ', WebP copies written: ' . $made . ', without copies: ' . $missing . "\n";
