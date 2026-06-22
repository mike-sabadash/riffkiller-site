<?php
/**
 * Landing waitlist: accept email and send to owner.
 * Optional: set LANDING_WAITLIST_EMAIL in .env or config; default lostvoxmusic@gmail.com
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
    echo json_encode(['success' => false, 'message' => 'Method not allowed']);
    exit;
}

$raw = file_get_contents('php://input');
$data = json_decode($raw, true);
$email = isset($data['email']) ? trim($data['email']) : '';

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Invalid email']);
    exit;
}

$to = 'lostvoxmusic@gmail.com';
if (file_exists(__DIR__ . '/../config/load-env.php')) {
    require_once __DIR__ . '/../config/load-env.php';
    if (!empty($_ENV['LANDING_WAITLIST_EMAIL'])) {
        $to = $_ENV['LANDING_WAITLIST_EMAIL'];
    }
}

$subject = 'Riff Killer waitlist: ' . $email;
$body = "New waitlist signup:\n\nEmail: " . $email . "\n\nTime: " . date('Y-m-d H:i:s') . " UTC";
$headers = "From: noreply@" . ($_SERVER['HTTP_HOST'] ?? 'riffkiller.fun') . "\r\n" .
           "Reply-To: " . $email . "\r\n" .
           "Content-Type: text/plain; charset=utf-8\r\n";

$sent = @mail($to, $subject, $body, $headers);

if ($sent) {
    echo json_encode(['success' => true]);
} else {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Could not send. Try again or use the Patreon link.']);
}
