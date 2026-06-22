<?php
error_reporting(0);
ini_set('display_errors', 0);
require_once dirname(__DIR__, 2) . '/config/session-start.php';
require_once dirname(__DIR__, 2) . '/config/user-store.php';
require_once dirname(__DIR__, 2) . '/config/magic-tokens.php';

$token = isset($_GET['token']) ? trim($_GET['token']) : '';
if ($token === '') {
    header('Location: /');
    exit();
}
$email = magic_token_consume($token);
if (!$email) {
    header('Location: /?magic=expired');
    exit();
}
$user = user_find_by_email($email);
if (!$user) {
    $user = user_create(['email' => $email, 'name' => '', 'picture' => '', 'provider' => 'email', 'provider_id' => '']);
}
if (!$user) {
    header('Location: /?magic=error');
    exit();
}
$_SESSION['user_id'] = $user['id'];
$protocol = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on') ? 'https' : 'http';
$host = $_SERVER['HTTP_HOST'] ?? 'riffkiller.fun';
header('Location: ' . $protocol . '://' . $host . '/profile.html');
exit();
