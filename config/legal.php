<?php
/**
 * Legal documents (terms.html, privacy.html, consent.html) and what follows from them in code:
 *   LEGAL_VERSION — the version a new account agrees to, kept on the user as consent {version, at, how};
 *   legal_delete_account() — erases an account and everything tied to it except payment records (tax law).
 */
require_once __DIR__ . '/user-store.php';

const LEGAL_VERSION = '2026-10-29';

/** Consent record for a new account. $how: 'checkbox' (email sign-up), 'continue' (Google, Yandex, Patreon, email link). */
function legal_consent($how) {
    return ['version' => LEGAL_VERSION, 'at' => date('c'), 'how' => $how === 'checkbox' ? 'checkbox' : 'continue'];
}

/**
 * Deletes the account: the user record, practice progress, avatar files, subscription state, email preferences
 * and digest log. Payment orders and renewal records stay (they are needed for receipts and tax records).
 * Returns true when the user record is gone.
 */
function legal_delete_account($userId) {
    $userId = (string)$userId;
    if ($userId === '') return false;
    $root = dirname(__DIR__);
    $user = user_find_by_id($userId);
    if (!$user) return false;

    @unlink($root . '/data/progress/' . hash('sha256', $userId) . '.json');
    $safe = preg_replace('/[^a-zA-Z0-9_]/', '', $userId);
    if ($safe !== '') {
        foreach (glob($root . '/uploads/avatars/avatar_' . $safe . '_*') ?: [] as $f) @unlink($f);
        @unlink($root . '/data/subscriptions/' . $safe . '.json');
    }
    // Weekly digest log and email preferences.
    $log = $root . '/data/progress-digest-log.json';
    if (is_file($log)) {
        $d = json_decode((string)@file_get_contents($log), true);
        if (is_array($d) && isset($d[$userId])) { unset($d[$userId]); @file_put_contents($log, json_encode($d, JSON_PRETTY_PRINT)); }
    }
    $email = strtolower(trim((string)($user['email'] ?? '')));
    $subs = $root . '/data/email_subscriptions.json';
    if ($email !== '' && is_file($subs)) {
        $d = json_decode((string)@file_get_contents($subs), true);
        if (is_array($d) && isset($d[$email])) { unset($d[$email]); @file_put_contents($subs, json_encode($d, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)); }
    }

    $users = array_values(array_filter(user_store_load(), function ($u) use ($userId) { return (string)($u['id'] ?? '') !== $userId; }));
    return user_store_save($users);
}
