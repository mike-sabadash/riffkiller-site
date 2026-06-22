<?php
error_reporting(0);
ini_set('display_errors', 0);

require_once dirname(__DIR__) . '/config/load-env.php';
require_once dirname(__DIR__) . '/config/email-subscriptions.php';

$token = isset($_GET['token']) ? trim((string)$_GET['token']) : '';
$row = email_subscription_find_by_token($token);

header('Content-Type: text/html; charset=utf-8');
if (!$row || empty($row['email'])) {
    http_response_code(400);
    echo '<!doctype html><html><body style="font-family:Arial;background:#111629;color:#fff;padding:24px"><h2>Invalid unsubscribe link</h2></body></html>';
    exit;
}

email_subscription_set($row['email'], false, 'unsubscribe-link');
echo '<!doctype html><html><body style="font-family:Arial;background:#111629;color:#fff;padding:24px"><h2>You have been unsubscribed</h2><p>Email: ' . htmlspecialchars($row['email']) . '</p></body></html>';

