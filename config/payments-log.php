<?php
/**
 * Unified payments/audit log (JSON Lines).
 * Each line is one JSON object for easy append and parsing.
 */

if (!function_exists('payments_log_path')) {
    function payments_log_path() {
        return dirname(__DIR__) . '/data/payments.log';
    }
}

if (!function_exists('payments_log_write')) {
    function payments_log_write($event, $payload = []) {
        $path = payments_log_path();
        $dir = dirname($path);
        if (!is_dir($dir)) @mkdir($dir, 0755, true);

        $row = [
            'ts' => date('c'),
            'event' => (string)$event,
            'source' => isset($payload['source']) ? (string)$payload['source'] : null,
            'user_id' => isset($payload['user_id']) ? (string)$payload['user_id'] : null,
            'status' => isset($payload['status']) ? (string)$payload['status'] : null,
            'plan' => isset($payload['plan']) ? (string)$payload['plan'] : null,
            'amount' => isset($payload['amount']) ? (string)$payload['amount'] : null,
            'currency' => isset($payload['currency']) ? (string)$payload['currency'] : null,
            'reference' => isset($payload['reference']) ? (string)$payload['reference'] : null,
            'note' => isset($payload['note']) ? (string)$payload['note'] : null,
        ];

        $line = json_encode($row, JSON_UNESCAPED_UNICODE) . "\n";
        return @file_put_contents($path, $line, FILE_APPEND | LOCK_EX) !== false;
    }
}

if (!function_exists('payments_log_read')) {
    function payments_log_read($limit = 200) {
        $path = payments_log_path();
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

