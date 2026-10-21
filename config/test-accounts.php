<?php
/**
 * Test accounts store: data/test_accounts.json
 * Developer test accounts - full premium, never expire.
 * Login links are one-time and expire after TEST_LOGIN_TTL seconds.
 */
if (!defined('TEST_LOGIN_TTL')) define('TEST_LOGIN_TTL', 24 * 3600);
if (!function_exists('test_accounts_path')) {
    function test_accounts_path() {
        return dirname(__DIR__) . '/data/test_accounts.json';
    }
}

function test_accounts_load() {
    $path = test_accounts_path();
    if (!is_file($path)) return [];
    $raw = @file_get_contents($path);
    $data = $raw ? json_decode($raw, true) : null;
    return is_array($data) ? $data : [];
}

function test_accounts_save($items) {
    $path = test_accounts_path();
    $dir = dirname($path);
    if (!is_dir($dir)) @mkdir($dir, 0755, true);
    return @file_put_contents($path, json_encode($items, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE), LOCK_EX) !== false;
}

function test_account_create() {
    $id = 'test_' . bin2hex(random_bytes(6));
    $token = bin2hex(random_bytes(24));
    $items = test_accounts_load();
    $items[] = [
        'id' => $id,
        'token' => $token,
        'created_at' => date('c'),
    ];
    if (!test_accounts_save($items)) return null;
    return ['id' => $id, 'token' => $token];
}

function test_account_find_by_token($token) {
    $items = test_accounts_load();
    foreach ($items as $t) {
        if (!hash_equals($t['token'] ?? '', $token)) continue;
        $created = strtotime($t['created_at'] ?? '');
        return ($created && time() - $created <= TEST_LOGIN_TTL) ? $t : null;
    }
    return null;
}

function test_account_consume_token($token) {
    $items = test_accounts_load();
    foreach ($items as $i => $t) {
        if (hash_equals($t['token'] ?? '', $token)) {
            unset($items[$i]['token']);
            $items[$i]['used_at'] = date('c');
            return test_accounts_save(array_values($items));
        }
    }
    return false;
}
