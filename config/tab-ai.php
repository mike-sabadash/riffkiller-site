<?php
/**
 * Tab from a screenshot via OpenRouter: the same rules Claude follows in chat (config/tab-ai-rules.txt),
 * Black Dog's tab as the example of the house style, one model chosen for this job only.
 *   TAB_AI_MODEL in .env picks the model (default below); OPENROUTER_API_KEY is shared with the Riff DNA draft.
 * Two passes: read the screenshot, then check the typed tab against it with the tab read back bar by bar.
 */
require_once __DIR__ . '/riff-dna-ai.php';

// A vision model that reads dense screenshots; the free router changes model on every call and misreads frets.
const TAB_AI_DEFAULT_MODEL = 'anthropic/claude-opus-5.5';
const TAB_AI_EXAMPLE = 'content/tabs/led-zeppelin/black-dog.tex';

function tab_ai_model() {
    return dna_ai_env('TAB_AI_MODEL', TAB_AI_DEFAULT_MODEL);
}

function tab_ai_system_prompt() {
    $root = dirname(__DIR__);
    $rules = trim(preg_replace('/<!--.*?-->/s', '', (string)@file_get_contents(__DIR__ . '/tab-ai-rules.txt')));
    $example = trim((string)@file_get_contents($root . '/' . TAB_AI_EXAMPLE));
    if ($example !== '') {
        $rules .= "\n\n## Example of the house style\n\nBlack Dog (Led Zeppelin), typed from its screenshot and checked against the recording:\n\n```alphatex\n" . $example . "\n```\n";
    }
    return $rules;
}

/** A screenshot as a data URL the model accepts, or null: PNG, JPEG or WebP, up to 8 MB. */
function tab_ai_image($dataUrl) {
    $dataUrl = (string)$dataUrl;
    if (!preg_match('#^data:image/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$#', $dataUrl, $m)) return null;
    if (strlen($m[2]) > 8 * 1024 * 1024 * 4 / 3) return null;
    $bytes = base64_decode($m[2], true);
    if ($bytes === false || strlen($bytes) < 100) return null;
    $info = @getimagesizefromstring($bytes);
    if (!$info || !in_array($info['mime'] ?? '', ['image/png', 'image/jpeg', 'image/webp'], true)) return null;
    return $dataUrl;
}

function tab_ai_context(array $riff, $notes) {
    $lines = [];
    $title = trim((string)($riff['artist'] ?? '') . ' — ' . (string)($riff['song'] ?? ''), ' —');
    if ($title !== '') $lines[] = 'Riff: ' . dna_ai_text($title, 200) . '.';
    $notes = trim((string)$notes);
    if ($notes !== '') $lines[] = 'Note from the author about this screenshot: ' . dna_ai_text($notes, 1500);
    return implode("\n", $lines);
}

/** First pass: the screenshot → alphaTex. */
function tab_ai_read($image, array $riff, $notes) {
    $text = trim(tab_ai_context($riff, $notes) . "\n\nType the tab in this screenshot as alphaTex, following the rules.");
    return tab_ai_ask([['type' => 'text', 'text' => $text], ['type' => 'image_url', 'image_url' => ['url' => $image]]]);
}

/** Second pass: the typed tab, how it reads back and what the parser found, checked against the screenshot again. */
function tab_ai_check($image, array $riff, $notes, $tex, $listing, array $problems) {
    $text = trim(tab_ai_context($riff, $notes)) . "\n\nCheck the tab you typed from this screenshot.\n\n"
        . "Your alphaTex:\n```alphatex\n" . dna_ai_text($tex, 20000) . "\n```\n\n";
    $text .= $listing !== '' ? "It reads back like this:\n" . dna_ai_text($listing, 20000) . "\n\n" : '';
    $text .= $problems ? "Problems found when reading it:\n- " . implode("\n- ", array_map(fn($p) => dna_ai_text($p, 300), array_slice($problems, 0, 40))) . "\n\n" : '';
    $text .= 'Compare it with the screenshot note by note and answer in the check format from the rules.';
    return tab_ai_ask([['type' => 'text', 'text' => $text], ['type' => 'image_url', 'image_url' => ['url' => $image]]]);
}

/** Calls the tab model and splits its answer. Returns ['tex', 'doubts', 'changes', 'model'] or ['error', 'status', 'raw'?]. */
function tab_ai_ask(array $content) {
    $key = dna_ai_env('OPENROUTER_API_KEY');
    if ($key === '') return ['status' => 503, 'error' => 'ИИ не подключён: на сервере в .env нет OPENROUTER_API_KEY.'];
    $base = rtrim(dna_ai_env('OPENROUTER_BASE_URL', 'https://openrouter.ai/api/v1'), '/');
    $model = tab_ai_model();
    $payload = [
        'model' => $model,
        'messages' => [['role' => 'system', 'content' => tab_ai_system_prompt()], ['role' => 'user', 'content' => $content]],
        'temperature' => 0,
        'max_tokens' => 8000,
        'reasoning' => ['exclude' => true],
    ];
    $result = dna_ai_post($base . '/chat/completions', $key, $payload);
    $data = json_decode($result['body'], true);
    if ($result['status'] !== 200 || !is_array($data)) {
        $detail = is_array($data) ? (string)($data['error']['message'] ?? '') : '';
        if ($result['status'] === 404 && stripos($detail, 'image') !== false) {
            return ['status' => 502, 'error' => 'Модель ' . $model . ' не принимает картинки. Укажите в TAB_AI_MODEL модель с поддержкой изображений.'];
        }
        return ['status' => 502, 'error' => dna_ai_error_message($result['status'], $detail)];
    }
    $text = $data['choices'][0]['message']['content'] ?? '';
    if (is_array($text)) $text = implode('', array_map(fn($part) => is_array($part) ? (string)($part['text'] ?? '') : (string)$part, $text));
    $answer = tab_ai_parse((string)$text);
    $used = (string)($data['model'] ?? $model);
    if ($answer === null) {
        return ['status' => 502, 'error' => 'Модель не вернула таб в alphaTex.', 'raw' => mb_substr((string)$text, 0, 3000), 'model' => $used];
    }
    return $answer + ['model' => $used];
}

/** The alphaTex block and the DOUBTS / CHANGES lines of an answer, or null when there is no tab in it. */
function tab_ai_parse($text) {
    $text = preg_replace('/<think>.*?<\/think>/s', '', $text);
    if (!preg_match('/```[ \t]*(?:alphatex|tex)?[ \t]*\r?\n(.*?)```/si', $text, $m)) return null;
    $tex = trim($m[1]);
    if ($tex === '' || strpos($tex, '|') === false) return null;
    $rest = substr($text, strpos($text, $m[0]) + strlen($m[0]));
    return ['tex' => $tex, 'changes' => tab_ai_list($rest, 'CHANGES'), 'doubts' => tab_ai_list($rest, 'DOUBTS')];
}

function tab_ai_list($text, $label) {
    if (!preg_match('/' . $label . ':[ \t]*(.*?)(?=\n[ \t]*(?:CHANGES|DOUBTS):|\z)/s', $text, $m)) return [];
    $items = [];
    foreach (preg_split('/\r?\n/', trim($m[1])) as $line) {
        $line = trim(preg_replace('/^[-*•\d.)\s]+/u', '', $line));
        if ($line === '' || preg_match('/^(none|нет)\.?$/i', $line)) continue;
        $items[] = dna_ai_text($line, 400);
        if (count($items) >= 30) break;
    }
    return $items;
}
