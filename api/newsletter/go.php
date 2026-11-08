<?php
/**
 * A link from a newsletter email: counts one click for that letter (daily totals, no visitor data) and opens the page.
 * Only paths on this site are followed. ?m=<letter key>&to=/practice.html?riff=10
 */
error_reporting(0);
ini_set('display_errors', 0);
require_once dirname(__DIR__, 2) . '/config/newsletter.php';

$to = nl_site_path((string)($_GET['to'] ?? '/'));
$m = (string)($_GET['m'] ?? '');
if (preg_match('/^[a-z0-9_.-]{1,60}$/i', $m) && isset(nl_load('newsletter-sent.json', [])[$m])) {
    nl_count('mail_click:' . nl_key_stat($m));
    nl_sent_bump($m, ['clicks' => 1]);
}
header('Cache-Control: no-store');
header('Location: ' . $to, true, 302);
