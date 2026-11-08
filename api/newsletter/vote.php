<?php
/**
 * One-tap vote from the Friday email (config/newsletter.php, poll in data/newsletter-polls.json).
 * GET p=<poll>&o=<option>&u&t — a vote per account; tapping another option changes it. Only a keyed hash of the
 * account is kept next to the vote, and it is erased with the account.
 */
error_reporting(0);
ini_set('display_errors', 0);
require_once dirname(__DIR__, 2) . '/config/newsletter.php';

$u = (string)($_GET['u'] ?? '');
$t = (string)($_GET['t'] ?? '');
$pid = (string)($_GET['p'] ?? '');
$o = (int)($_GET['o'] ?? -1);
if (!nl_token_ok($u, $t) || !user_find_by_id($u)) nl_page('This link doesn’t work', '<p>Votes open again in the next Friday email.</p>', 400);

$file = nl_file('newsletter-polls.json');
$lock = @fopen($file . '.lock', 'c');
if ($lock) flock($lock, LOCK_EX);
$data = nl_load('newsletter-polls.json', []);
$poll = null;
foreach ((array)($data['polls'] ?? []) as $p) if (is_array($p) && (string)($p['id'] ?? '') === $pid) $poll = $p;
$today = gmdate('Y-m-d');
$open = $poll && ($poll['until'] ?? '') >= nl_date_add($today, -1) && $o >= 0 && $o < count((array)$poll['options']);
if ($open) {
    $h = nl_voter($u);
    $first = !isset($data['votes'][$pid][$h]);
    $data['votes'][$pid][$h] = $o;
    nl_save('newsletter-polls.json', $data);
    if ($first) nl_count('mail_vote:' . nl_key_stat($pid));
}
if ($lock) { flock($lock, LOCK_UN); fclose($lock); }
if (!$poll) nl_page('This vote is over', '<p>Watch for the next one in the Friday email.</p>', 404);
if (!$open) nl_page('This vote is over', '<p>Thanks anyway! The next one comes in a Friday email.</p>');
nl_page('Got it — thanks for voting', '<p translate="no"><strong>' . htmlspecialchars((string)$poll['options'][$o]) . '</strong></p>'
    . '<p>Tapped the wrong one? Just tap another option in the email. The winner shows up in a Friday email.</p>'
    . '<p><a href="/">Back to Riff Killer</a></p>');
