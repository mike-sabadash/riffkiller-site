<?php
/**
 * Newsletter (config/newsletter.php). Run from cron (CLI only), every hour:
 *   php /var/www/riffkiller/config/newsletter-cli.php
 * The deploy installs it as /etc/cron.d/riffkiller-newsletter. Each run opens scheduled riffs on their date and sends
 * the emails that are due in each reader's time zone.
 */
if (PHP_SAPI !== 'cli') { http_response_code(404); exit(); }
require_once __DIR__ . '/newsletter.php';

foreach (nl_run() as $line) echo date('c') . ' ' . $line . "\n";
