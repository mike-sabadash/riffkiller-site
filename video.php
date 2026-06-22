<?php
// Simple PHP video range handler to make MP4 files seekable.
// Usage: video.php?file=relative/path/to/video.mp4

// Get requested file relative to this script (or document root on some hosts)
$file = isset($_GET['file']) ? (string) $_GET['file'] : '';
if ($file === '' || strpos($file, '..') !== false) {
    http_response_code(404);
    exit;
}
$path = __DIR__ . '/' . $file;
if (!is_file($path) && !empty($_SERVER['DOCUMENT_ROOT'])) {
    $path = rtrim($_SERVER['DOCUMENT_ROOT'], '/') . '/' . $file;
}
if (!is_file($path)) {
    http_response_code(404);
    exit;
}

$size  = filesize($path);
$start = 0;
$end   = $size - 1;

// Basic headers
header('Content-Type: video/mp4');
header('Accept-Ranges: bytes');

// Handle HTTP Range header for seeking
if (isset($_SERVER['HTTP_RANGE'])) {
    if (preg_match('/bytes=(\d*)-(\d*)/', $_SERVER['HTTP_RANGE'], $matches)) {
        if ($matches[1] !== '') {
            $start = (int)$matches[1];
        }
        if ($matches[2] !== '') {
            $end = (int)$matches[2];
        }

        if ($start > $end || $start > $size - 1) {
            // Invalid range, respond with 416
            header('HTTP/1.1 416 Requested Range Not Satisfiable');
            header("Content-Range: bytes */$size");
            exit;
        }

        if ($end >= $size) {
            $end = $size - 1;
        }

        header('HTTP/1.1 206 Partial Content');
        header("Content-Range: bytes $start-$end/$size");
    }
}

$length = $end - $start + 1;
header("Content-Length: $length");

// Stream the requested range
$fp = fopen($path, 'rb');
if ($fp === false) {
    http_response_code(500);
    exit;
}

fseek($fp, $start);

$chunkSize = 8192;
while (!feof($fp) && $length > 0) {
    $readLength = ($length > $chunkSize) ? $chunkSize : $length;
    $buffer = fread($fp, $readLength);
    if ($buffer === false) {
        break;
    }
    echo $buffer;
    flush();
    $length -= $readLength;
}

fclose($fp);

