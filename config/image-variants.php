<?php
/**
 * Light WebP copies of cover pictures, so a card downloads a picture its own size.
 * "assets/img/riffs/a.jpg" gets "assets/img/riffs/a.w400.webp", "a.w800.webp"… next to it (never bigger than
 * the original). The lists add a srcset built from the copies that exist; a missing copy just means the
 * browser takes the original.
 */

const IMAGE_CARD_WIDTHS = [400, 800, 1200];
const IMAGE_BANNER_WIDTHS = [800, 1200, 2400];

function image_root() {
    return dirname(__DIR__);
}

/** A picture path under assets/ the variants can be made for, or null. */
function image_clean_path($path) {
    $path = ltrim(trim((string)$path), '/');
    if ($path === '' || strpos($path, '..') !== false) return null;
    if (!preg_match('#^assets/[a-zA-Z0-9/_\-]+(\.w\d+)?\.(png|jpe?g|webp)$#i', $path)) return null;
    if (preg_match('#\.w\d+\.webp$#i', $path)) return null;
    return $path;
}

function image_variant_base($path) {
    return substr($path, 0, strrpos($path, '.'));
}

function image_ffmpeg() {
    foreach (['/usr/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/opt/homebrew/bin/ffmpeg'] as $bin) {
        if (is_executable($bin)) return $bin;
    }
    $found = trim((string)@shell_exec('command -v ffmpeg 2>/dev/null'));
    return $found !== '' ? $found : null;
}

/**
 * Makes the missing WebP copies of one picture. Returns the number written; 0 when there was nothing to do
 * or ffmpeg can't (the site then keeps showing the original).
 */
function image_make_variants($path, array $widths) {
    $path = image_clean_path($path);
    if (!$path) return 0;
    $root = image_root();
    $src = $root . '/' . $path;
    if (!is_file($src)) return 0;
    $size = @getimagesize($src);
    if (!$size || $size[0] < 1) return 0;
    $ffmpeg = image_ffmpeg();
    if (!$ffmpeg) return 0;
    $made = 0;
    $targets = [];
    foreach ($widths as $w) $targets[min((int)$w, (int)$size[0])] = true;
    foreach (array_keys($targets) as $w) {
        $out = $root . '/' . image_variant_base($path) . '.w' . $w . '.webp';
        if (is_file($out) && filemtime($out) >= filemtime($src)) continue;
        $tmp = $out . '.tmp.webp';
        $cmd = escapeshellarg($ffmpeg) . ' -nostdin -v error -y -i ' . escapeshellarg($src)
            . ' -vf ' . escapeshellarg('scale=' . $w . ':-2:flags=lanczos')
            . ' -frames:v 1 -c:v libwebp -quality 82 -compression_level 6 ' . escapeshellarg($tmp) . ' 2>&1';
        exec($cmd, $output, $code);
        if ($code === 0 && is_file($tmp) && filesize($tmp) > 0) {
            rename($tmp, $out);
            @chmod($out, 0664);
            $made++;
        } else {
            @unlink($tmp);
        }
    }
    return $made;
}

/** "a.w400.webp 400w, a.w800.webp 800w" from the copies on disk, or "" when there are none. */
function image_srcset($path) {
    $path = image_clean_path($path);
    if (!$path) return '';
    $root = image_root();
    $base = image_variant_base($path);
    $files = glob($root . '/' . $base . '.w*.webp') ?: [];
    $items = [];
    foreach ($files as $file) {
        if (preg_match('#\.w(\d+)\.webp$#', $file, $m)) $items[(int)$m[1]] = $base . '.w' . $m[1] . '.webp ' . $m[1] . 'w';
    }
    ksort($items);
    return implode(', ', $items);
}
