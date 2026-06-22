<?php
/**
 * Email template store: data/email-templates/*.json
 * One file per template. Backward compatible with legacy data/email_templates.json.
 */

if (!function_exists('email_templates_dir')) {
    function email_templates_dir() {
        return dirname(__DIR__) . '/data/email-templates';
    }
}

if (!function_exists('email_templates_load')) {
    function email_templates_load() {
        $dir = email_templates_dir();
        $out = [];
        if (is_dir($dir)) {
            $files = @glob($dir . '/*.json');
            if (is_array($files)) {
                foreach ($files as $f) {
                    $raw = @file_get_contents($f);
                    $row = $raw ? json_decode($raw, true) : null;
                    if (!is_array($row)) continue;
                    $key = isset($row['key']) ? email_template_key($row['key']) : email_template_key(basename($f, '.json'));
                    if ($key === '') continue;
                    $row['key'] = $key;
                    $out[$key] = $row;
                }
            }
        }

        // Legacy fallback (old single-file store) with transparent one-time migration.
        $legacy = dirname(__DIR__) . '/data/email_templates.json';
        if (empty($out) && is_file($legacy)) {
            $raw = @file_get_contents($legacy);
            $data = $raw ? json_decode($raw, true) : null;
            if (is_array($data)) {
                foreach ($data as $k => $v) {
                    if (!is_array($v)) continue;
                    $key = email_template_key(isset($v['key']) ? $v['key'] : $k);
                    if ($key === '') continue;
                    $v['key'] = $key;
                    $out[$key] = $v;
                }
                if (!empty($out)) {
                    email_templates_save_all($out);
                }
            }
        }
        return $out;
    }
}

if (!function_exists('email_templates_save_all')) {
    function email_templates_save_all($items) {
        $dir = email_templates_dir();
        if (!is_dir($dir)) @mkdir($dir, 0755, true);
        if (!is_array($items)) return false;
        // Rewrite current set
        $existing = @glob($dir . '/*.json');
        if (is_array($existing)) {
            foreach ($existing as $f) @unlink($f);
        }
        foreach ($items as $k => $v) {
            $key = email_template_key(isset($v['key']) ? $v['key'] : $k);
            if ($key === '') continue;
            $v['key'] = $key;
            $ok = @file_put_contents($dir . '/' . $key . '.json', json_encode($v, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE), LOCK_EX);
            if ($ok === false) return false;
        }
        return true;
    }
}

if (!function_exists('email_template_key')) {
    function email_template_key($name) {
        $name = strtolower(trim((string)$name));
        $name = preg_replace('/[^a-z0-9_\-]+/', '_', $name);
        $name = trim($name, '_');
        return $name !== '' ? $name : 'template_' . substr(bin2hex(random_bytes(3)), 0, 6);
    }
}

if (!function_exists('email_template_get')) {
    function email_template_get($key) {
        $all = email_templates_load();
        return isset($all[$key]) && is_array($all[$key]) ? $all[$key] : null;
    }
}

if (!function_exists('email_template_delete')) {
    function email_template_delete($key) {
        $key = email_template_key($key);
        if ($key === '') return false;
        $path = email_templates_dir() . '/' . $key . '.json';
        if (!is_file($path)) return false;
        return @unlink($path);
    }
}

if (!function_exists('email_template_upsert')) {
    function email_template_upsert($name, $subject, $text, $html, $key = null) {
        $tplKey = $key ? email_template_key($key) : email_template_key($name);
        $row = [
            'key' => $tplKey,
            'name' => trim((string)$name) !== '' ? trim((string)$name) : $tplKey,
            'subject' => (string)$subject,
            'text' => (string)$text,
            'html' => (string)$html,
            'updated_at' => date('c'),
        ];
        $dir = email_templates_dir();
        if (!is_dir($dir)) @mkdir($dir, 0755, true);
        $ok = @file_put_contents($dir . '/' . $tplKey . '.json', json_encode($row, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE), LOCK_EX);
        if ($ok === false) return null;
        return $row;
    }
}

