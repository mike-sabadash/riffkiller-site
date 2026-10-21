<?php
/**
 * POST JSON body: { "riff": { song, artist, duration, segments[], dna }, "notes": "short description by the author" }
 *   → { success, job } right away; the model is asked after the response is sent (free models often take
 *     longer than the web server waits for one request).
 * GET ?job=<id> → { success, status: "pending" } | { success, status: "done", model, draft } | { success: false, error }
 * Admin only. Nothing is saved to the riff here — the editor shows the draft for review.
 */
error_reporting(0);
ini_set('display_errors', 0);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

require_once dirname(__DIR__, 2) . '/config/admin-auth.php';
require_admin_api();
require_once dirname(__DIR__, 2) . '/config/riff-dna-ai.php';
require_once dirname(__DIR__, 2) . '/config/rate-limit.php';

function dna_draft_fail($status, $error) {
    http_response_code($status);
    echo json_encode(['success' => false, 'error' => $error], JSON_UNESCAPED_UNICODE);
    exit();
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $job = dna_ai_job_read((string)($_GET['job'] ?? ''));
    if ($job === null) dna_draft_fail(404, 'Черновик не найден. Нажмите «Составить черновик» ещё раз.');
    if (($job['status'] ?? '') === 'error') {
        http_response_code((int)($job['code'] ?? 502));
        echo json_encode(['success' => false, 'error' => (string)$job['error'], 'raw' => (string)($job['raw'] ?? ''), 'model' => (string)($job['model'] ?? '')], JSON_UNESCAPED_UNICODE);
        exit();
    }
    if (($job['status'] ?? '') === 'pending' && time() - (int)($job['started'] ?? 0) > 200) {
        dna_draft_fail(504, 'Модель так и не ответила. Попробуйте ещё раз.');
    }
    echo json_encode(['success' => true] + $job, JSON_UNESCAPED_UNICODE);
    exit();
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') dna_draft_fail(405, 'Method not allowed');

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
if (dna_ai_env('OPENROUTER_API_KEY') === '') dna_draft_fail(503, 'ИИ не подключён: на сервере в .env нет OPENROUTER_API_KEY.');
if (!rate_limit_check('dna_ai_draft', 30, 3600)) dna_draft_fail(429, 'Не больше 30 черновиков в час. Попробуйте позже.');

$id = dna_ai_job_create();
if ($id === null) dna_draft_fail(500, 'Не удалось начать черновик: папка data недоступна для записи.');

// Answer now, keep working after the browser has its job id.
ignore_user_abort(true);
set_time_limit(240);
$reply = json_encode(['success' => true, 'job' => $id]);
if (function_exists('fastcgi_finish_request')) {
    echo $reply;
    session_write_close();
    fastcgi_finish_request();
}

$result = dna_ai_draft(dna_ai_system_prompt(), dna_ai_user_prompt($riff, $notes, dna_ai_reference_riffs((int)($riff['id'] ?? 0))));
if (isset($result['error'])) {
    dna_ai_job_write($id, ['status' => 'error', 'code' => $result['status'], 'error' => $result['error'], 'raw' => $result['raw'] ?? '', 'model' => $result['model'] ?? '']);
} else {
    dna_ai_job_write($id, ['status' => 'done', 'model' => $result['model'],
        'draft' => dna_ai_normalize($result['data'], $riff['segments'], (float)($riff['duration'] ?? 0))]);
}

// Without PHP-FPM (local php -S) the reply goes out only now; the browser polls the finished job.
if (!function_exists('fastcgi_finish_request')) echo $reply;
