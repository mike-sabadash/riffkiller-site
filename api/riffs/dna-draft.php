<?php
/**
 * POST JSON body: { "riff": { song, artist, duration, segments[], dna }, "notes": "short description by the author" }
 * Admin only. Asks the model for a Riff DNA draft; nothing is saved here — the editor shows it for review.
 */
error_reporting(0);
ini_set('display_errors', 0);
set_time_limit(150);

header('Content-Type: application/json; charset=utf-8');

require_once dirname(__DIR__, 2) . '/config/admin-auth.php';
require_admin_api();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit();
}

require_once dirname(__DIR__, 2) . '/config/riff-dna-ai.php';
require_once dirname(__DIR__, 2) . '/config/rate-limit.php';

function dna_draft_fail($status, $error) {
    http_response_code($status);
    echo json_encode(['success' => false, 'error' => $error], JSON_UNESCAPED_UNICODE);
    exit();
}

$body = json_decode((string)file_get_contents('php://input'), true);
$riff = is_array($body['riff'] ?? null) ? $body['riff'] : null;
$notes = trim((string)($body['notes'] ?? ''));
if (!$riff || !is_array($riff['segments'] ?? null)) dna_draft_fail(400, 'Нет данных риффа.');
if (count($riff['segments']) === 0) dna_draft_fail(400, 'Сначала разбейте видео на сегменты: ИИ раздаёт роли именно им.');
if (count($riff['segments']) > 60) dna_draft_fail(400, 'Слишком много сегментов (больше 60).');
if (mb_strlen($notes) < 10) dna_draft_fail(400, 'Опишите рифф хотя бы одной фразой.');
if (mb_strlen($notes) > 4000) dna_draft_fail(400, 'Описание слишком длинное: до 4000 символов.');
foreach ($riff['segments'] as $s) {
    if (!is_array($s) || !is_numeric($s['start'] ?? null) || !is_numeric($s['end'] ?? null)) dna_draft_fail(400, 'У сегментов должны быть начало и конец.');
}
if (!rate_limit_check('dna_ai_draft', 30, 3600)) dna_draft_fail(429, 'Не больше 30 черновиков в час. Попробуйте позже.');

$result = dna_ai_complete(dna_ai_system_prompt(), dna_ai_user_prompt($riff, $notes));
if (isset($result['error'])) dna_draft_fail($result['status'], $result['error']);

$raw = dna_ai_extract_json($result['text']);
if ($raw === null) dna_draft_fail(502, 'Модель ответила не в формате JSON. Нажмите ещё раз или смените модель.');

$draft = dna_ai_normalize($raw, $riff['segments'], (float)($riff['duration'] ?? 0));
echo json_encode(['success' => true, 'model' => $result['model'], 'draft' => $draft], JSON_UNESCAPED_UNICODE);
