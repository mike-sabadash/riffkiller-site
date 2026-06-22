<?php
/**
 * Marketing email consent storage: data/email_subscriptions.json
 * Keyed by lowercased email.
 */

if (!function_exists('email_subscriptions_path')) {
    function email_subscriptions_path() {
        return dirname(__DIR__) . '/data/email_subscriptions.json';
    }
}

if (!function_exists('email_subscriptions_load')) {
    function email_subscriptions_load() {
        $path = email_subscriptions_path();
        if (!is_file($path)) return [];
        $raw = @file_get_contents($path);
        $data = $raw ? json_decode($raw, true) : null;
        return is_array($data) ? $data : [];
    }
}

if (!function_exists('email_subscriptions_save')) {
    function email_subscriptions_save($items) {
        $path = email_subscriptions_path();
        $dir = dirname($path);
        if (!is_dir($dir)) @mkdir($dir, 0755, true);
        return @file_put_contents($path, json_encode($items, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE), LOCK_EX) !== false;
    }
}

if (!function_exists('email_subscription_set')) {
    function email_subscription_set($email, $consent, $source = 'system') {
        $email = strtolower(trim((string)$email));
        if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) return false;
        $items = email_subscriptions_load();
        $token = hash('sha256', $email . '|' . (getenv('ADMIN_SECRET') ?: 'riffkiller'));
        $items[$email] = [
            'email' => $email,
            'marketing_consent' => $consent ? true : false,
            'consent_source' => (string)$source,
            'updated_at' => date('c'),
            'unsubscribe_token' => $token,
        ];
        return email_subscriptions_save($items);
    }
}

if (!function_exists('email_subscription_get')) {
    function email_subscription_get($email) {
        $email = strtolower(trim((string)$email));
        if ($email === '') return null;
        $items = email_subscriptions_load();
        return isset($items[$email]) ? $items[$email] : null;
    }
}

if (!function_exists('email_subscription_find_by_token')) {
    function email_subscription_find_by_token($token) {
        $token = trim((string)$token);
        if ($token === '') return null;
        $items = email_subscriptions_load();
        foreach ($items as $row) {
            if (($row['unsubscribe_token'] ?? '') === $token) return $row;
        }
        return null;
    }
}

