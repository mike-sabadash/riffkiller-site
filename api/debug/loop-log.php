<?php
/**
 * ?debug=loop on the practice page sends one line per loop pass here, so a loop problem on a phone
 * can be read on the server (data/loop-debug.log, not served: see deploy/nginx-riffkiller-security.conf).
 * Diagnostics only: timings and the browser, no account data. The file is cut back when it grows.
 */
header('Content-Type: application/json; charset=utf-8');
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); echo '{"ok":false}'; exit; }
$raw = file_get_contents('php://input', false, null, 0, 8192);
$data = json_decode((string)$raw, true);
if (!is_array($data) || ($data['debug'] ?? '') !== 'loop') { http_response_code(400); echo '{"ok":false}'; exit; }
$line = json_encode([
    'at' => gmdate('c'),
    'ua' => substr((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 200),
    'data' => $data
], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
$file = dirname(__DIR__, 2) . '/data/loop-debug.log';
if (is_file($file) && filesize($file) > 1024 * 1024) {
    $keep = substr((string)file_get_contents($file), -256 * 1024);
    file_put_contents($file, substr($keep, strpos($keep, "\n") + 1), LOCK_EX);
}
file_put_contents($file, $line . "\n", FILE_APPEND | LOCK_EX);
echo '{"ok":true}';
