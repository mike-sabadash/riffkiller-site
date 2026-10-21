<?php
/**
 * Riff DNA draft via OpenRouter: builds the prompt from config/riff-dna-ai-rules.txt and the shared
 * vocabulary in js/riff-dna-vocab.js, calls the model and cleans its answer into the riff data format.
 * The key lives only in .env (OPENROUTER_API_KEY); OPENROUTER_MODEL picks the model.
 */
require_once __DIR__ . '/load-env.php';

const DNA_AI_DEFAULT_MODEL = 'openrouter/free';

function dna_ai_env($key, $default = '') {
    $v = $_ENV[$key] ?? getenv($key);
    return ($v === false || $v === null || $v === '') ? $default : (string)$v;
}

/** Roles and techniques straight from the JS vocabulary, so the admin, the site and the model share one list. */
function dna_ai_vocab() {
    static $vocab = null;
    if ($vocab !== null) return $vocab;
    $js = (string)@file_get_contents(dirname(__DIR__) . '/js/riff-dna-vocab.js');
    $vocab = ['roles' => [], 'techniques' => []];
    if (preg_match('/var ROLES = \[(.*?)\];/s', $js, $m)) {
        preg_match_all("/key: '([a-z]+)', label: '([^']+)', group: '[a-z]+', hint: '([^']+)'/", $m[1], $rows, PREG_SET_ORDER);
        foreach ($rows as $r) $vocab['roles'][$r[1]] = ['label' => $r[2], 'hint' => $r[3]];
    }
    if (preg_match('/var TECHNIQUES = \[(.*?)\];/s', $js, $m)) {
        preg_match_all("/key: '([a-z]+)', label: '([^']+)'/", $m[1], $rows, PREG_SET_ORDER);
        foreach ($rows as $r) $vocab['techniques'][$r[1]] = $r[2];
    }
    return $vocab;
}

function dna_ai_system_prompt() {
    $rules = (string)@file_get_contents(__DIR__ . '/riff-dna-ai-rules.txt');
    $rules = trim(preg_replace('/<!--.*?-->/s', '', $rules));
    $vocab = dna_ai_vocab();
    $roles = [];
    foreach ($vocab['roles'] as $key => $r) $roles[] = '- ' . $key . ' (' . $r['label'] . '): ' . $r['hint'];
    $techniques = [];
    foreach ($vocab['techniques'] as $key => $label) $techniques[] = '- ' . $key . ': ' . $label;
    return $rules . "\n\n## Vocabulary\n\nRole keys:\n" . implode("\n", $roles)
        . "\n\nTechnique keys:\n" . implode("\n", $techniques) . "\n";
}

function dna_ai_user_prompt(array $riff, $notes) {
    $segments = [];
    foreach (array_values($riff['segments'] ?? []) as $i => $s) {
        $segments[] = [
            'index' => $i,
            'start' => round((float)($s['start'] ?? 0), 2),
            'end' => round((float)($s['end'] ?? 0), 2),
            'name' => (string)($s['name'] ?? ''),
            'role' => (string)($s['role'] ?? ''),
            'function' => (string)($s['function'] ?? ''),
        ];
    }
    $context = [
        'song' => (string)($riff['song'] ?? ''),
        'artist' => (string)($riff['artist'] ?? ''),
        'durationSeconds' => round((float)($riff['duration'] ?? 0), 2),
        'segments' => $segments,
        'currentDna' => $riff['dna'] ?? new stdClass(),
    ];
    return "Riff data (JSON):\n" . json_encode($context, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT)
        . "\n\nAuthor's description:\n" . trim((string)$notes)
        . "\n\nReturn the JSON draft now.";
}

/** Models sometimes wrap JSON in prose or ``` fences; take the outermost object. */
function dna_ai_extract_json($text) {
    $text = trim((string)$text);
    $text = preg_replace('/^```(?:json)?\s*|\s*```$/i', '', $text);
    $start = strpos($text, '{');
    $end = strrpos($text, '}');
    if ($start === false || $end === false || $end < $start) return null;
    $data = json_decode(substr($text, $start, $end - $start + 1), true);
    return is_array($data) ? $data : null;
}

function dna_ai_text($v, $max) {
    if (!is_scalar($v)) return '';
    $v = trim(preg_replace('/\s+/u', ' ', (string)$v));
    return mb_strlen($v) > $max ? rtrim(mb_substr($v, 0, $max - 1)) . '…' : $v;
}

function dna_ai_lines($v, $maxItems, $maxLen) {
    if (is_string($v)) $v = preg_split('/\n+/', $v);
    if (!is_array($v)) return [];
    $out = [];
    foreach ($v as $line) {
        $line = dna_ai_text($line, $maxLen);
        if ($line !== '') $out[] = $line;
        if (count($out) >= $maxItems) break;
    }
    return $out;
}

/** Keep only what the editor understands: known roles/techniques, times inside the video, one entry per segment. */
function dna_ai_normalize(array $raw, array $segments, $duration) {
    $vocab = dna_ai_vocab();
    $segments = array_values($segments);
    $count = count($segments);
    $outSegments = [];
    foreach (($raw['segments'] ?? []) as $s) {
        if (!is_array($s)) continue;
        $i = filter_var($s['index'] ?? null, FILTER_VALIDATE_INT);
        if ($i === false || $i < 0 || $i >= $count || isset($outSegments[$i])) continue;
        $role = strtolower(trim((string)($s['role'] ?? '')));
        $outSegments[$i] = [
            'index' => $i,
            'role' => isset($vocab['roles'][$role]) ? $role : '',
            'function' => dna_ai_text($s['function'] ?? '', 140),
        ];
    }
    ksort($outSegments);

    $dna = is_array($raw['dna'] ?? null) ? $raw['dna'] : [];
    $atoms = [];
    foreach (($dna['atoms'] ?? []) as $a) {
        if (!is_array($a) || count($atoms) >= 12) continue;
        $technique = strtolower(trim((string)($a['technique'] ?? '')));
        if (!isset($vocab['techniques'][$technique])) $technique = 'other';
        $atom = [
            'technique' => $technique,
            'type' => $technique === 'other' ? dna_ai_text($a['type'] ?? '', 40) : $vocab['techniques'][$technique],
            'label' => dna_ai_text($a['label'] ?? '', 60),
            'tip' => dna_ai_text($a['tip'] ?? '', 180),
            'view' => in_array($a['view'] ?? '', ['left', 'right', 'split'], true) ? $a['view'] : 'split',
            'speed' => in_array((float)($a['speed'] ?? 0.5), [0.25, 0.5, 0.75, 1.0], true) ? (float)$a['speed'] : 0.5,
        ];
        $index = filter_var($a['segmentIndex'] ?? null, FILTER_VALIDATE_INT);
        $time = is_numeric($a['time'] ?? null) ? round((float)$a['time'], 2) : null;
        if ($time !== null && ($time < 0 || ($duration > 0 && $time > $duration))) $time = null;
        if ($time !== null) {
            // The time decides the segment, as in the editor.
            foreach ($segments as $si => $seg) {
                if ($time >= (float)$seg['start'] && $time < (float)$seg['end']) { $index = $si; break; }
            }
        }
        if ($index === false || $index === null || $index < 0 || $index >= $count) {
            if ($time === null) continue;
            $index = 0;
        }
        $atom['segmentIndex'] = $index;
        if ($time !== null) $atom['time'] = $time;
        if ($atom['label'] === '' && $atom['tip'] === '') continue;
        $atoms[] = $atom;
    }

    $mutation = is_array($dna['mutation'] ?? null) ? $dna['mutation'] : [];
    return [
        'segments' => array_values($outSegments),
        'dna' => [
            'overview' => dna_ai_text($dna['overview'] ?? '', 400),
            'rule' => dna_ai_text($dna['rule'] ?? '', 120),
            'law' => dna_ai_text($dna['law'] ?? '', 600),
            'preserve' => dna_ai_lines($dna['preserve'] ?? [], 6, 120),
            'change' => dna_ai_lines($dna['change'] ?? [], 6, 120),
            'failure' => dna_ai_text($dna['failure'] ?? '', 240),
            'atoms' => $atoms,
            'mutation' => [
                'title' => dna_ai_text($mutation['title'] ?? '', 80),
                'description' => dna_ai_text($mutation['description'] ?? '', 300),
                'steps' => dna_ai_lines($mutation['steps'] ?? [], 6, 200),
            ],
        ],
        'notes' => dna_ai_lines($raw['notes'] ?? [], 5, 300),
    ];
}

/** Drafts run after the HTTP reply (see api/riffs/dna-draft.php); the browser polls this small file store. */
function dna_ai_job_dir() {
    return dirname(__DIR__) . '/data/dna-ai-jobs';
}

function dna_ai_job_path($id) {
    return preg_match('/^[a-f0-9]{24}$/', (string)$id) ? dna_ai_job_dir() . '/' . $id . '.json' : null;
}

function dna_ai_job_create() {
    $dir = dna_ai_job_dir();
    if (!is_dir($dir) && !@mkdir($dir, 0755, true)) return null;
    foreach (glob($dir . '/*.json') ?: [] as $old) {
        if (filemtime($old) < time() - 86400) @unlink($old);
    }
    $id = bin2hex(random_bytes(12));
    return dna_ai_job_write($id, ['status' => 'pending']) ? $id : null;
}

function dna_ai_job_write($id, array $job) {
    $path = dna_ai_job_path($id);
    if ($path === null) return false;
    $job['started'] = $job['started'] ?? (is_file($path) ? (int)(json_decode((string)file_get_contents($path), true)['started'] ?? time()) : time());
    $tmp = $path . '.tmp';
    return @file_put_contents($tmp, json_encode($job, JSON_UNESCAPED_UNICODE)) !== false && @rename($tmp, $path);
}

function dna_ai_job_read($id) {
    $path = dna_ai_job_path($id);
    if ($path === null || !is_file($path)) return null;
    $job = json_decode((string)file_get_contents($path), true);
    return is_array($job) ? $job : null;
}

/** Calls OpenRouter. Returns ['text' => ..., 'model' => ...] or ['error' => message for the admin, 'status' => http]. */
function dna_ai_complete($system, $user) {
    $key = dna_ai_env('OPENROUTER_API_KEY');
    if ($key === '') {
        return ['status' => 503, 'error' => 'ИИ не подключён: на сервере в .env нет OPENROUTER_API_KEY.'];
    }
    $base = rtrim(dna_ai_env('OPENROUTER_BASE_URL', 'https://openrouter.ai/api/v1'), '/');
    $payload = [
        'model' => dna_ai_env('OPENROUTER_MODEL', DNA_AI_DEFAULT_MODEL),
        'messages' => [['role' => 'system', 'content' => $system], ['role' => 'user', 'content' => $user]],
        'temperature' => 0.3,
        'max_tokens' => 3000,
        'response_format' => ['type' => 'json_object'],
    ];
    $result = dna_ai_post($base . '/chat/completions', $key, $payload);
    // Not every free model accepts response_format; the rules already ask for bare JSON.
    if (in_array($result['status'], [400, 404], true) && stripos($result['body'], 'data policy') === false) {
        unset($payload['response_format']);
        $result = dna_ai_post($base . '/chat/completions', $key, $payload);
    }
    $data = json_decode($result['body'], true);
    if ($result['status'] !== 200 || !is_array($data)) {
        $detail = is_array($data) ? (string)($data['error']['message'] ?? '') : '';
        return ['status' => 502, 'error' => dna_ai_error_message($result['status'], $detail)];
    }
    $text = $data['choices'][0]['message']['content'] ?? '';
    if (!is_string($text) || trim($text) === '') {
        return ['status' => 502, 'error' => 'Модель вернула пустой ответ. Попробуйте ещё раз.'];
    }
    return ['text' => $text, 'model' => (string)($data['model'] ?? $payload['model'])];
}

function dna_ai_post($url, $key, array $payload) {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT => 180,
        CURLOPT_HTTPHEADER => [
            'Authorization: Bearer ' . $key,
            'Content-Type: application/json',
            'HTTP-Referer: https://riffkiller.fun',
            'X-Title: RiffKiller admin',
        ],
        CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_UNICODE),
    ]);
    $body = curl_exec($ch);
    $status = $body === false ? 0 : (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return ['status' => $status, 'body' => $body === false ? '' : (string)$body];
}

function dna_ai_error_message($status, $detail) {
    if ($status === 0) return 'OpenRouter не ответил вовремя. Попробуйте ещё раз.';
    if ($status === 401) return 'OpenRouter не принял ключ: проверьте OPENROUTER_API_KEY в .env.';
    if ($status === 402) return 'На OpenRouter нет баланса для этой модели. Пополните баланс или верните бесплатную модель (OPENROUTER_MODEL).';
    if ($status === 429) return 'Лимит бесплатных запросов OpenRouter исчерпан. Подождите или пополните баланс.';
    if (stripos($detail, 'data policy') !== false || stripos($detail, 'privacy') !== false) {
        return 'OpenRouter не пускает к бесплатным моделям: включите их в openrouter.ai/settings/privacy.';
    }
    return 'OpenRouter вернул ошибку ' . $status . ($detail !== '' ? ': ' . dna_ai_text($detail, 200) : '.');
}
