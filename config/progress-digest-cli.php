<?php
/**
 * Monday practice summaries (config/progress-digest.php). Run from cron (CLI only), every hour:
 *   php /var/www/riffkiller/config/progress-digest-cli.php
 * The deploy installs it as /etc/cron.d/riffkiller-progress-digest.
 * --test EMAIL sends one marked test email to that address now (.github/workflows/progress-digest-test.yml).
 */
if (PHP_SAPI !== 'cli') { http_response_code(404); exit(); }
require_once __DIR__ . '/progress-digest.php';

if (($argv[1] ?? '') === '--test') {
    $line = digest_send_test((string)($argv[2] ?? ''));
    echo date('c') . ' ' . $line . "\n";
    exit(strpos($line, ', sent') !== false ? 0 : 1);
}

foreach (digest_run() as $line) echo date('c') . ' ' . $line . "\n";
