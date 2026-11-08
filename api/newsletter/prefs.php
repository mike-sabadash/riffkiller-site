<?php
/**
 * Newsletter switches of one account (config/newsletter.php).
 * Who: the signed-in account, or the signed link from an email (u + t, emails.html) — no sign-in needed there.
 *   GET  → { topics: {drops, headsup, community, offers}, ask, email (masked) }
 *   POST { topics: {...}, how: signup|card|profile|page, asked?: "yes"|"no" } → the same
 */
error_reporting(0);
ini_set('display_errors', 0);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
require_once dirname(__DIR__, 2) . '/config/session-start.php';
require_once dirname(__DIR__, 2) . '/config/newsletter.php';

$body = [];
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $body = json_decode((string)file_get_contents('php://input', false, null, 0, 4096), true);
    if (!is_array($body)) $body = [];
} elseif ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['success' => false]);
    exit;
}

$u = (string)($_GET['u'] ?? $body['u'] ?? '');
$t = (string)($_GET['t'] ?? $body['t'] ?? '');
$userId = '';
if ($u !== '' || $t !== '') {
    if (!nl_token_ok($u, $t)) { http_response_code(403); echo json_encode(['success' => false, 'error' => 'This link doesn’t work']); exit; }
    $userId = $u;
} else {
    // A form or text/plain post from another site cannot carry this header without a CORS preflight we never allow.
    if ($_SERVER['REQUEST_METHOD'] === 'POST' && stripos((string)($_SERVER['CONTENT_TYPE'] ?? ''), 'application/json') !== 0) {
        http_response_code(415); echo json_encode(['success' => false]); exit;
    }
    $userId = isset($_SESSION['user_id']) ? (string)$_SESSION['user_id'] : '';
}
$user = $userId !== '' ? user_find_by_id($userId) : null;
if (!$user) { http_response_code(401); echo json_encode(['success' => false, 'error' => 'Sign in first']); exit; }

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $topics = [];
    foreach (NL_TOPICS as $topic) if (isset($body['topics']) && is_array($body['topics']) && array_key_exists($topic, $body['topics'])) $topics[$topic] = !empty($body['topics'][$topic]);
    $how = in_array($body['how'] ?? '', ['signup', 'card', 'profile', 'page'], true) ? $body['how'] : 'profile';
    $asked = in_array($body['asked'] ?? '', ['yes', 'no'], true) ? $body['asked'] : null;
    nl_set_prefs($userId, $topics, $how, $asked);
}

$prefs = nl_prefs($userId);
$email = (string)($user['email'] ?? '');
$at = strpos($email, '@');
$masked = $at > 1 ? substr($email, 0, 1) . str_repeat('•', min(6, $at - 1)) . substr($email, $at) : $email;
echo json_encode(['success' => true, 'topics' => $prefs['topics'], 'ask' => nl_should_ask($user, $prefs), 'email' => $masked], JSON_UNESCAPED_UNICODE);
