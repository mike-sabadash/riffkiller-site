<?php
/**
 * Monday practice summaries (config/progress-digest.php). Run from cron (CLI only), every hour:
 *   php /var/www/riffkiller/config/progress-digest-cli.php
 * The deploy installs it as /etc/cron.d/riffkiller-progress-digest.
 */
if (PHP_SAPI !== 'cli') { http_response_code(404); exit(); }
require_once __DIR__ . '/progress-digest.php';

foreach (digest_run() as $line) echo date('c') . ' ' . $line . "\n";
