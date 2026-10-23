<?php
/**
 * Robokassa ResultURL (POST). Set in the Robokassa shop settings, method POST.
 */
error_reporting(0);
ini_set('display_errors', 0);
require_once dirname(__DIR__, 2) . '/config/billing.php';

header('Content-Type: text/plain; charset=utf-8');
if (!billing_enabled('robokassa')) { http_response_code(503); echo 'disabled'; exit(); }
$answer = robokassa_handle_result($_POST ?: $_GET);
if ($answer === null) {
    payments_log_write('robokassa.result.rejected', ['source' => 'robokassa', 'reference' => (string)($_POST['InvId'] ?? $_GET['InvId'] ?? '')]);
    http_response_code(400);
    echo 'bad sign';
    exit();
}
echo $answer;
