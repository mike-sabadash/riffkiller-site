<?php
/**
 * Checks the wallet for USDT payments and charges due Robokassa and YooKassa renewals.
 * Run from cron (CLI only), every minute:
 *   php /var/www/riffkiller/config/billing-renew.php
 * The deploy installs it as /etc/cron.d/riffkiller-billing.
 */
if (PHP_SAPI !== 'cli') { http_response_code(404); exit(); }
$_SERVER['SCRIPT_FILENAME'] = __FILE__;
require_once __DIR__ . '/billing.php';

foreach (array_merge(usdt_check_payments(), billing_run_renewals()) as $row) {
    echo date('c') . ' ' . implode(' ', $row) . "\n";
}
