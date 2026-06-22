<?php
/**
 * Promo code store: data/promo_codes.json
 * Codes are stored with hash (never plain text). Traceable: used_by, used_at.
 */
if (!function_exists('promo_store_path')) {
    function promo_store_path() {
        return dirname(__DIR__) . '/data/promo_codes.json';
    }
}

function promo_store_load() {
    $path = promo_store_path();
    if (!is_file($path)) return [];
    $raw = @file_get_contents($path);
    $data = $raw ? json_decode($raw, true) : null;
    return is_array($data) ? $data : [];
}

function promo_store_save($items) {
    $path = promo_store_path();
    $dir = dirname($path);
    if (!is_dir($dir)) @mkdir($dir, 0755, true);
    return @file_put_contents($path, json_encode($items, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE), LOCK_EX) !== false;
}

function promo_hash($code) {
    return hash('sha256', strtoupper(trim((string) $code)));
}

function promo_generate_code() {
    $chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    $part = '';
    for ($i = 0; $i < 8; $i++) {
        $part .= $chars[random_int(0, strlen($chars) - 1)];
    }
    return 'RK-' . $part;
}

function promo_create($expiresDays = null, $domainLimit = null) {
    $items = promo_store_load();
    do {
        $code = promo_generate_code();
        $hash = promo_hash($code);
        $exists = false;
        foreach ($items as $p) {
            if (($p['hash'] ?? '') === $hash) { $exists = true; break; }
        }
    } while ($exists);

    $expires = null;
    if ($expiresDays !== null && $expiresDays > 0) {
        $expires = time() + (int)$expiresDays * 86400;
    }

    $item = [
        'hash' => $hash,
        'code' => $code,
        'suffix' => substr($code, -4),
        'created_at' => date('c'),
        'expires_at' => $expires,
        'domain_limit' => $domainLimit ? trim((string)$domainLimit) : null,
        'status' => 'active',
        'used_by' => null,
        'used_by_email' => null,
        'used_at' => null,
        'comment' => null,
    ];
    $items[] = $item;
    if (!promo_store_save($items)) return null;
    return ['code' => $code, 'item' => $item];
}

function promo_find_by_hash($hash) {
    $items = promo_store_load();
    foreach ($items as $i => $p) {
        if (($p['hash'] ?? '') === $hash) return ['index' => $i, 'item' => $p];
    }
    return null;
}

function promo_mark_used($hash, $userId, $email) {
    $items = promo_store_load();
    foreach ($items as $i => $p) {
        if (($p['hash'] ?? '') === $hash) {
            $items[$i]['status'] = 'used';
            $items[$i]['used_by'] = $userId;
            $items[$i]['used_by_email'] = $email;
            $items[$i]['used_at'] = date('c');
            return promo_store_save($items);
        }
    }
    return false;
}

function promo_update_comment($hash, $comment) {
    $items = promo_store_load();
    foreach ($items as $i => $p) {
        if (($p['hash'] ?? '') === $hash) {
            $items[$i]['comment'] = $comment !== null && $comment !== '' ? trim((string)$comment) : null;
            return promo_store_save($items);
        }
    }
    return false;
}

function promo_revoke($hash) {
    $items = promo_store_load();
    foreach ($items as $i => $p) {
        if (($p['hash'] ?? '') === $hash) {
            if (($p['status'] ?? '') === 'used') return false;
            $items[$i]['status'] = 'revoked';
            return promo_store_save($items);
        }
    }
    return false;
}

function promo_list_all() {
    return promo_store_load();
}
