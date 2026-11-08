<?php
/**
 * "Unsubscribe from all" from a newsletter email (config/newsletter.php).
 *   POST (the mail app's one-click button, RFC 8058, or the button on this page) — turns off every newsletter topic
 *        and the weekly practice summary at once.
 *   GET  — a page with one button: link checkers in mailboxes open links by themselves, so a plain visit changes nothing.
 * u + t sign the link; m is the letter it came from (counted, and an alert goes out when too many leave after one).
 */
error_reporting(0);
ini_set('display_errors', 0);
require_once dirname(__DIR__, 2) . '/config/newsletter.php';

$u = (string)($_GET['u'] ?? $_POST['u'] ?? '');
$t = (string)($_GET['t'] ?? $_POST['t'] ?? '');
$m = (string)($_GET['m'] ?? $_POST['m'] ?? '');
$m = preg_match('/^[a-z0-9_.-]{1,60}$/i', $m) ? $m : '';
$valid = nl_token_ok($u, $t) && user_find_by_id($u);
$prefsUrl = '/emails.html?u=' . rawurlencode($u) . '&t=' . rawurlencode($t);

if (!$valid) {
    if ($_SERVER['REQUEST_METHOD'] === 'POST') { http_response_code(400); exit; }
    nl_page('This link doesn’t work', '<p>You can turn the emails off in your profile.</p><p><a href="/profile.html">Open your profile</a></p>', 400);
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $was = nl_any(nl_prefs($u));
    nl_set_prefs($u, nl_empty_topics(), 'unsubscribe');
    $path = digest_progress_file($u);
    $progress = digest_load_json($path, null);
    if (is_array($progress) && !empty($progress['email'])) {
        $progress['email'] = false;
        $progress['emailAt'] = (int)round(microtime(true) * 1000);
        digest_save_json($path, $progress);
    }
    if ($was) {
        nl_count('mail_unsub:all');
        if ($m !== '') { nl_count('mail_unsub:' . nl_key_stat($m)); nl_unsub_from_letter($m); }
    }
    if (trim((string)file_get_contents('php://input')) === 'List-Unsubscribe=One-Click' || ($_POST['List-Unsubscribe'] ?? '') === 'One-Click') {
        header('Content-Type: text/plain; charset=utf-8');
        echo 'unsubscribed';
        exit;
    }
    nl_page('You’re unsubscribed', '<p>No more emails from Riff Killer, including the weekly practice summary.</p>'
        . '<p>Changed your mind? You can turn some of them back on.</p><p><a href="' . htmlspecialchars($prefsUrl) . '">Choose what we send</a></p>');
}

nl_page('Stop all Riff Killer emails?', '<p>New riffs, free weeks, heads-ups, challenges, offers and the weekly practice summary — all of them.</p>'
    . '<form method="post"><input type="hidden" name="u" value="' . htmlspecialchars($u) . '"><input type="hidden" name="t" value="' . htmlspecialchars($t) . '">'
    . '<input type="hidden" name="m" value="' . htmlspecialchars($m) . '"><p><button type="submit">Unsubscribe from all</button></p></form>'
    . '<p><a href="' . htmlspecialchars($prefsUrl) . '">Or choose what we send</a></p>');
