<?php
// Local PHP preview: serve MP4 byte ranges just as Nginx does in production.
$url = rawurldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH));
if (preg_match('#^/(?:data|config|tests|tools|node_modules|backups)/#', $url) || preg_match('#(?:^|/)\.#', $url)) {
    http_response_code(404);
    exit;
}
if (str_ends_with(strtolower($url), '.mp4')) {
    $_GET['file'] = ltrim($url, '/');
    require __DIR__ . '/video.php';
    return true;
}
return false;
