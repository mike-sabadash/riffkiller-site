<?php
/**
 * Magic link tokens: data/magic_tokens.json (token, email, expires_at).
 */
function magic_tokens_path() {
    return dirname(__DIR__) . '/data/magic_tokens.json';
}

function magic_tokens_load() {
    $path = magic_tokens_path();
    if (!is_file($path)) return [];
    $raw = @file_get_contents($path);
    $data = $raw ? json_decode($raw, true) : null;
    return is_array($data) ? $data : [];
}

function magic_tokens_save($tokens) {
    $path = magic_tokens_path();
    $dir = dirname($path);
    if (!is_dir($dir)) mkdir($dir, 0755, true);
    return file_put_contents($path, json_encode($tokens, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)) !== false;
}

function magic_token_create($email, $ttlSeconds = 900) {
    $email = trim($email);
    if ($email === '') return null;
    $tokens = magic_tokens_load();
    $now = time();
    $tokens = array_values(array_filter($tokens, function ($t) use ($now) {
        return isset($t['expires_at']) && (int)$t['expires_at'] > $now;
    }));
    $token = bin2hex(random_bytes(24));
    $tokens[] = ['token' => $token, 'email' => $email, 'expires_at' => $now + $ttlSeconds];
    if (!magic_tokens_save($tokens)) return null;
    return $token;
}

function magic_token_consume($token) {
    $token = trim($token);
    if ($token === '') return null;
    $tokens = magic_tokens_load();
    $now = time();
    $found = null;
    $tokens = array_values(array_filter($tokens, function ($t) use ($now, $token, &$found) {
        if (isset($t['token']) && $t['token'] === $token && isset($t['expires_at']) && (int)$t['expires_at'] > $now) {
            $found = $t;
            return false;
        }
        return isset($t['expires_at']) && (int)$t['expires_at'] > $now;
    }));
    if ($found !== null) {
        magic_tokens_save($tokens);
        return $found['email'] ?? null;
    }
    return null;
}
