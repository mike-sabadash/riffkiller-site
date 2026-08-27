<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$checks = [
    'php' => PHP_VERSION,
    'data_readable' => is_readable(__DIR__ . '/data'),
    'data_writable' => is_writable(__DIR__ . '/data'),
];

$ok = $checks['data_readable'] && $checks['data_writable'];
http_response_code($ok ? 200 : 503);
echo json_encode(['ok' => $ok, 'checks' => $checks], JSON_UNESCAPED_SLASHES);
