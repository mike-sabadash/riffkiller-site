<?php
/**
 * Unified subscription storage: read/write JSON files in data/subscriptions/{userId}.json
 * Format: { "status": "active", "plan": "monthly", "source": "stripe", "expires": timestamp }
 */

function subscription_store_dir() {
    $dir = dirname(__DIR__) . '/data/subscriptions';
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
    return $dir;
}

function subscription_sanitize_user_id($userId) {
    return preg_replace('/[^a-zA-Z0-9_\-]/', '', (string) $userId);
}

/**
 * Save subscription for a user. Merges with existing if needed.
 * @param string $userId - Patreon id, stripe client_reference_id, or cryptomus order_id
 * @param array $data - status, plan, source, expires (unix timestamp)
 */
function save_subscription($userId, $data) {
    $userId = subscription_sanitize_user_id($userId);
    if ($userId === '') {
        return false;
    }
    $dir = subscription_store_dir();
    $path = $dir . '/' . $userId . '.json';
    $out = [
        'status' => isset($data['status']) ? (string) $data['status'] : 'active',
        'plan' => isset($data['plan']) && $data['plan'] === 'yearly' ? 'yearly' : 'monthly',
        'source' => isset($data['source']) && in_array($data['source'], ['stripe', 'cryptomus', 'patreon', 'promo', 'test'], true) ? $data['source'] : 'stripe',
        'expires' => isset($data['expires']) ? (int) $data['expires'] : (isset($data['expires_at']) ? (int) $data['expires_at'] : null),
    ];
    return @file_put_contents($path, json_encode($out, JSON_PRETTY_PRINT), LOCK_EX) !== false;
}

function subscription_is_effectively_active($sub, $now = null) {
    if (!is_array($sub)) return false;
    $status = isset($sub['status']) ? (string)$sub['status'] : 'active';
    if ($status === 'cancelled' || $status === 'expired' || $status === 'inactive') return false;
    $tsNow = $now !== null ? (int)$now : time();
    $expires = isset($sub['expires']) ? (int)$sub['expires'] : (isset($sub['expires_at']) ? (int)$sub['expires_at'] : null);
    if ($expires !== null && $expires > 0 && $expires <= $tsNow) return false;
    return true;
}

/**
 * Get subscription for a user (or by session_id / order_id if stored under that key).
 * @return array|null { status, plan, source, expires } or null
 */
function get_subscription($userId) {
    $userId = subscription_sanitize_user_id($userId);
    if ($userId === '') {
        return null;
    }
    $path = subscription_store_dir() . '/' . $userId . '.json';
    if (!is_file($path)) {
        return null;
    }
    $raw = @file_get_contents($path);
    if ($raw === false) {
        return null;
    }
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        return null;
    }
    $status = isset($data['status']) ? $data['status'] : 'active';
    $expires = isset($data['expires']) ? (int)$data['expires'] : null;
    if ($expires !== null && $expires > 0 && $expires <= time() && $status === 'active') {
        $status = 'expired';
    }
    return [
        'status' => $status,
        'plan' => isset($data['plan']) && $data['plan'] === 'yearly' ? 'yearly' : 'monthly',
        'source' => isset($data['source']) ? $data['source'] : 'stripe',
        'expires' => $expires,
    ];
}

function subscription_list_all() {
    $dir = subscription_store_dir();
    $files = @glob($dir . '/*.json');
    if (!is_array($files)) return [];
    $out = [];
    foreach ($files as $f) {
        $id = basename($f, '.json');
        $sub = get_subscription($id);
        if ($sub !== null) $out[$id] = $sub;
    }
    return $out;
}
