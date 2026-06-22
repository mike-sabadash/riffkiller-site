<?php
/**
 * Email campaigns event log (JSON Lines): data/email_campaigns.log
 */

if (!function_exists('email_campaigns_log_path')) {
    function email_campaigns_log_path() {
        return dirname(__DIR__) . '/data/email_campaigns.log';
    }
}

if (!function_exists('email_campaigns_log_write')) {
    function email_campaigns_log_write($event, $payload = []) {
        $path = email_campaigns_log_path();
        $dir = dirname($path);
        if (!is_dir($dir)) @mkdir($dir, 0755, true);
        $line = json_encode([
            'ts' => date('c'),
            'event' => (string)$event,
            'campaign_id' => $payload['campaign_id'] ?? null,
            'email' => $payload['email'] ?? null,
            'segment' => $payload['segment'] ?? null,
            'status' => $payload['status'] ?? null,
            'provider' => $payload['provider'] ?? 'resend',
            'note' => $payload['note'] ?? null,
        ], JSON_UNESCAPED_UNICODE) . "\n";
        return @file_put_contents($path, $line, FILE_APPEND | LOCK_EX) !== false;
    }
}

if (!function_exists('email_campaigns_log_read')) {
    function email_campaigns_log_read($limit = 300) {
        $path = email_campaigns_log_path();
        if (!is_file($path)) return [];
        $lines = @file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        if (!is_array($lines)) return [];
        $lines = array_slice($lines, -1 * max(1, (int)$limit));
        $out = [];
        foreach (array_reverse($lines) as $line) {
            $row = json_decode($line, true);
            if (is_array($row)) $out[] = $row;
        }
        return $out;
    }
}

