<?php
/**
 * Tab from a screenshot (admin only). Nothing is saved to the riff here: the editor fills the alphaTex box and the
 * admin saves after checking it.
 * POST JSON { "pass": "read", "image": data URL, "riff": { song, artist }, "notes": "" }
 *        or { "pass": "check", ...the same, "tex": typed tab, "listing": tab read back, "problems": [...] }
 *   → { success, job } right away; the model is asked after the response is sent.
 * GET ?job=<id> → { success, status: "pending" } | { success, status: "done", model, tex, doubts, changes } | { success: false, error }
 */
error_reporting(0);
ini_set('display_errors', 0);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

require_once dirname(__DIR__, 2) . '/config/admin-auth.php';
require_admin_api();
require_once dirname(__DIR__, 2) . '/config/tab-ai.php';
require_once dirname(__DIR__, 2) . '/config/rate-limit.php';

function tab_draft_fail($status, $error) {
    http_response_code($status);
    echo json_encode(['success' => false, 'error' => $error], JSON_UNESCAPED_UNICODE);
    exit();
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $job = dna_ai_job_read((string)($_GET['job'] ?? ''));
    if ($job === null || ($job['kind'] ?? '') !== 'tab') tab_draft_fail(404, 'Распознавание не найдено. Запустите его ещё раз.');
    if (($job['status'] ?? '') === 'error') {
        http_response_code((int)($job['code'] ?? 502));
        echo json_encode(['success' => false, 'error' => (string)$job['error'], 'raw' => (string)($job['raw'] ?? ''), 'model' => (string)($job['model'] ?? '')], JSON_UNESCAPED_UNICODE);
        exit();
    }
    if (($job['status'] ?? '') === 'pending' && time() - (int)($job['started'] ?? 0) > 230) {
        tab_draft_fail(504, 'Модель так и не ответила. Попробуйте ещё раз.');
    }
    unset($job['kind']);
    echo json_encode(['success' => true] + $job, JSON_UNESCAPED_UNICODE);
    exit();
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') tab_draft_fail(405, 'Method not allowed');

$body = json_decode((string)file_get_contents('php://input'), true);
if (!is_array($body)) tab_draft_fail(400, 'Нет данных.');
$pass = (string)($body['pass'] ?? 'read');
if (!in_array($pass, ['read', 'check'], true)) tab_draft_fail(400, 'Неизвестный шаг.');
$image = tab_ai_image($body['image'] ?? '');
if ($image === null) tab_draft_fail(400, 'Нужна картинка PNG, JPEG или WebP до 8 МБ.');
$riff = is_array($body['riff'] ?? null) ? $body['riff'] : [];
$notes = (string)($body['notes'] ?? '');
if (mb_strlen($notes) > 1500) tab_draft_fail(400, 'Пояснение слишком длинное: до 1500 символов.');
$tex = trim((string)($body['tex'] ?? ''));
if ($pass === 'check' && ($tex === '' || mb_strlen($tex) > 20000)) tab_draft_fail(400, 'Нет таба для проверки.');
$listing = (string)($body['listing'] ?? '');
$problems = array_values(array_filter(array_map('strval', is_array($body['problems'] ?? null) ? $body['problems'] : [])));
if (dna_ai_env('OPENROUTER_API_KEY') === '') tab_draft_fail(503, 'ИИ не подключён: на сервере в .env нет OPENROUTER_API_KEY.');
if (!rate_limit_check('tab_ai_draft', 40, 3600)) tab_draft_fail(429, 'Не больше 40 запросов к ИИ по табам в час. Попробуйте позже.');

$id = dna_ai_job_create();
if ($id === null) tab_draft_fail(500, 'Не удалось начать: папка data недоступна для записи.');
dna_ai_job_write($id, ['status' => 'pending', 'kind' => 'tab']);

// Answer now, keep working after the browser has its job id.
ignore_user_abort(true);
set_time_limit(240);
$reply = json_encode(['success' => true, 'job' => $id]);
if (function_exists('fastcgi_finish_request')) {
    echo $reply;
    session_write_close();
    fastcgi_finish_request();
}

$result = $pass === 'read' ? tab_ai_read($image, $riff, $notes) : tab_ai_check($image, $riff, $notes, $tex, $listing, $problems);
if (isset($result['error'])) {
    dna_ai_job_write($id, ['status' => 'error', 'kind' => 'tab', 'code' => $result['status'], 'error' => $result['error'], 'raw' => $result['raw'] ?? '', 'model' => $result['model'] ?? '']);
} else {
    dna_ai_job_write($id, ['status' => 'done', 'kind' => 'tab', 'model' => $result['model'], 'tex' => $result['tex'],
        'doubts' => $result['doubts'], 'changes' => $result['changes']]);
}

// Without PHP-FPM (local php -S) the reply goes out only now; the browser polls the finished job.
if (!function_exists('fastcgi_finish_request')) echo $reply;
