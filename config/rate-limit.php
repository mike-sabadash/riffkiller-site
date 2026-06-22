<?php
/**
 * Simple file-based rate limiting (for promo code attempts, etc.)
 * Returns true if request is allowed, false if rate limit exceeded.
 */
function rate_limit_check($key, $maxAttempts = 5, $windowSeconds = 3600) {
    $dir = dirname(__DIR__) . '/data/rate_limit';
    if (!is_dir($dir)) @mkdir($dir, 0755, true);
    $file = $dir . '/' . preg_replace('/[^a-zA-Z0-9_-]/', '', $key) . '.json';
    $now = time();
    $data = ['attempts' => [], 'count' => 0];
    if (is_file($file)) {
        $raw = @file_get_contents($file);
        if ($raw) {
            $dec = json_decode($raw, true);
            if (is_array($dec)) $data = $dec;
        }
    }
    $cutoff = $now - $windowSeconds;
    $data['attempts'] = array_filter($data['attempts'] ?? [], function ($t) use ($cutoff) { return (int)$t > $cutoff; });
    if (count($data['attempts']) >= $maxAttempts) {
        return false;
    }
    $data['attempts'][] = $now;
    @file_put_contents($file, json_encode($data), LOCK_EX);
    return true;
}
