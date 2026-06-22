<?php
/**
 * User submitted "I've sent crypto payment" with their email (and optional note/tx hash).
 * Sends notification to owner (lostvoxmusic@gmail.com) so they can send a promo code.
 */
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit;
}

$projectRoot = dirname(__DIR__);
require_once $projectRoot . '/config/load-env.php';

$raw = file_get_contents('php://input');
$data = json_decode($raw, true) ?: [];
$email = isset($data['email']) ? trim((string) $data['email']) : '';
$plan = isset($data['plan']) && in_array($data['plan'], ['monthly', 'yearly'], true) ? $data['plan'] : 'monthly';
$note = isset($data['note']) ? trim((string) $data['note']) : '';

if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Valid email required']);
    exit;
}

$to = 'lostvoxmusic@gmail.com';
if (getenv('CRYPTO_WALLET_NOTIFY_EMAIL')) {
    $to = trim(getenv('CRYPTO_WALLET_NOTIFY_EMAIL'));
} elseif (!empty($_ENV['CRYPTO_WALLET_NOTIFY_EMAIL'])) {
    $to = trim($_ENV['CRYPTO_WALLET_NOTIFY_EMAIL']);
} elseif (!empty($GLOBALS['RIFFKILLER_ENV']['CRYPTO_WALLET_NOTIFY_EMAIL'])) {
    $to = trim($GLOBALS['RIFFKILLER_ENV']['CRYPTO_WALLET_NOTIFY_EMAIL']);
}

$planLabel = $plan === 'yearly' ? 'Yearly ($90)' : 'Monthly ($9)';
$subject = 'Riff Killer: crypto payment — ' . $email;
$body = "A user reported a crypto payment. Send them a promo code to activate access.\n\n";
$body .= "Email: " . $email . "\n";
$body .= "Plan: " . $planLabel . "\n";
$body .= "Time: " . date('Y-m-d H:i:s') . " UTC\n";
if ($note !== '') {
    $body .= "\nNote / Transaction hash:\n" . $note . "\n";
}
$headers = "From: noreply@" . ($_SERVER['HTTP_HOST'] ?? 'riffkiller.fun') . "\r\n" .
           "Reply-To: " . $email . "\r\n" .
           "Content-Type: text/plain; charset=utf-8\r\n";

$sent = @mail($to, $subject, $body, $headers);

if ($sent) {
    echo json_encode(['success' => true]);
} else {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Could not send. Try again or contact us directly.']);
}
