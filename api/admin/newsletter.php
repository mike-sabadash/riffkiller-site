<?php
/**
 * Admin of the newsletter (admin/newsletter.html, config/newsletter.php). Admin session only.
 *   GET                                  → summary, upcoming letters, scheduled riffs, campaigns, polls with results,
 *                                          sent letters, alerts, settings
 *   POST {action:'campaign_save', campaign:{id?, topic, date, subject, text, button, url}}
 *   POST {action:'campaign_delete', id}
 *   POST {action:'poll_save', poll:{id?, question, options[], from, until}}
 *   POST {action:'poll_delete', id}
 *   POST {action:'preview', letter:{kind:'campaign', campaign:{...}} | {kind:'date', date}} → {letters:[{key, subject, html}]}
 *   POST {action:'test', to, letter:{...same as preview}}  → sends "[Test]" copies now
 *   POST {action:'settings', alertEmail}
 *   POST {action:'alerts_clear'}
 */
error_reporting(0);
ini_set('display_errors', 0);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
require_once dirname(__DIR__, 2) . '/config/session-start.php';
require_once dirname(__DIR__, 2) . '/config/admin-auth.php';
require_admin_api();
require_once dirname(__DIR__, 2) . '/config/newsletter.php';

function nl_admin_fail($msg, $code = 400) { http_response_code($code); echo json_encode(['success' => false, 'error' => $msg], JSON_UNESCAPED_UNICODE); exit; }

function nl_admin_state() {
    $polls = nl_polls();
    $withVotes = [];
    foreach ($polls['polls'] as $p) {
        $counts = array_fill(0, count((array)$p['options']), 0);
        foreach ((array)($polls['votes'][$p['id']] ?? []) as $o) if (isset($counts[$o])) $counts[$o]++;
        $p['votes'] = $counts;
        $withVotes[] = $p;
    }
    $sent = nl_load('newsletter-sent.json', []);
    uasort($sent, function ($a, $b) { return strcmp((string)($b['firstAt'] ?? ''), (string)($a['firstAt'] ?? '')); });
    $configured = (getenv('RESEND_API_KEY') ?: ($_ENV['RESEND_API_KEY'] ?? '')) !== '' && (getenv('RESEND_FROM_EMAIL') ?: ($_ENV['RESEND_FROM_EMAIL'] ?? '')) !== '';
    return ['success' => true, 'summary' => nl_summary(), 'upcoming' => nl_upcoming(35), 'campaigns' => nl_campaigns(), 'polls' => $withVotes,
        'sent' => array_slice($sent, 0, 40, true), 'alerts' => array_reverse(nl_load('newsletter-alerts.json', [])),
        'settings' => ['alertEmail' => (string)(nl_load('newsletter-settings.json', [])['alertEmail'] ?? '')], 'resend' => $configured,
        'topics' => NL_TOPICS, 'weekCap' => NL_WEEK_CAP, 'hour' => NL_HOUR, 'releaseHour' => NL_RELEASE_HOUR];
}

function nl_admin_letters($spec) {
    $spec = is_array($spec) ? $spec : [];
    if (($spec['kind'] ?? '') === 'campaign') {
        $c = nl_admin_clean_campaign($spec['campaign'] ?? [], false);
        if (is_string($c)) nl_admin_fail($c);
        $c['id'] = $c['id'] ?: 'preview';
        return [['key' => 'c-' . $c['id'], 'topic' => $c['topic'], 'kind' => 'campaign', 'date' => $c['date'], 'campaign' => $c]];
    }
    $date = riff_date_normalize($spec['date'] ?? '');
    if ($date === '') nl_admin_fail('Дата: ГГГГ-ММ-ДД');
    $riffs = array_map(function ($r) { if (nl_is_scheduled($r) && !nl_riff_missing($r)) $r['lock'] = ''; return $r; }, nl_riffs());
    $letters = nl_letters_for($date, nl_riffs());
    foreach (nl_letters_for($date, $riffs) as $k => $l) if ($l['kind'] === 'drop') $letters[$k] = $l;
    return array_values($letters);
}

function nl_admin_clean_campaign($c, $strict = true) {
    $c = is_array($c) ? $c : [];
    $out = [
        'id' => preg_match('/^[a-z0-9]{6,12}$/', (string)($c['id'] ?? '')) ? (string)$c['id'] : '',
        'topic' => in_array($c['topic'] ?? '', NL_TOPICS, true) ? $c['topic'] : '',
        'date' => riff_date_normalize($c['date'] ?? ''),
        'subject' => trim(mb_substr((string)($c['subject'] ?? ''), 0, 120)),
        'text' => trim(mb_substr(str_replace("\r", '', (string)($c['text'] ?? '')), 0, 4000)),
        'button' => trim(mb_substr((string)($c['button'] ?? ''), 0, 40)),
        'url' => trim(mb_substr((string)($c['url'] ?? ''), 0, 300)),
    ];
    if ($out['topic'] === '') return 'Выбери тему письма';
    if ($out['date'] === '') return 'Дата отправки: ГГГГ-ММ-ДД';
    if ($out['subject'] === '' || $out['text'] === '') return 'Нужны тема (Subject) и текст';
    if ($out['button'] !== '' && $out['url'] !== '' && nl_site_path($out['url']) === '/' && !in_array(trim($out['url']), ['/', 'https://riffkiller.fun', 'https://riffkiller.fun/'], true)) return 'Ссылка кнопки — только на страницу riffkiller.fun, например /billing.html';
    if ($strict && $out['date'] < gmdate('Y-m-d')) return 'Дата уже прошла';
    return $out;
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') { echo json_encode(nl_admin_state(), JSON_UNESCAPED_UNICODE); exit; }
if ($_SERVER['REQUEST_METHOD'] !== 'POST') nl_admin_fail('Method not allowed', 405);
$body = json_decode((string)file_get_contents('php://input'), true);
if (!is_array($body)) nl_admin_fail('Invalid JSON');
$action = (string)($body['action'] ?? '');

if ($action === 'campaign_save') {
    $c = nl_admin_clean_campaign($body['campaign'] ?? []);
    if (is_string($c)) nl_admin_fail($c);
    $list = nl_campaigns();
    if ($c['id'] === '') { $c['id'] = substr(bin2hex(random_bytes(4)), 0, 8); $c['createdAt'] = date('c'); $list[] = $c; }
    else {
        $found = false;
        foreach ($list as $i => $x) if (($x['id'] ?? '') === $c['id']) { $list[$i] = $c + ['createdAt' => $x['createdAt'] ?? date('c')]; $found = true; }
        if (!$found) nl_admin_fail('Письмо не найдено');
        if (isset(nl_load('newsletter-sent.json', [])['c-' . $c['id']])) nl_admin_fail('Это письмо уже начало уходить — его нельзя менять');
    }
    nl_save('newsletter-campaigns.json', array_values($list));
} elseif ($action === 'campaign_delete') {
    $id = (string)($body['id'] ?? '');
    nl_save('newsletter-campaigns.json', array_values(array_filter(nl_campaigns(), function ($x) use ($id) { return ($x['id'] ?? '') !== $id; })));
} elseif ($action === 'poll_save') {
    $p = is_array($body['poll'] ?? null) ? $body['poll'] : [];
    $opts = array_values(array_filter(array_map(function ($o) { return trim(mb_substr((string)$o, 0, 60)); }, (array)($p['options'] ?? [])), 'strlen'));
    $poll = ['id' => preg_match('/^[a-z0-9]{6,12}$/', (string)($p['id'] ?? '')) ? $p['id'] : substr(bin2hex(random_bytes(4)), 0, 8),
        'question' => trim(mb_substr((string)($p['question'] ?? ''), 0, 140)), 'options' => array_slice($opts, 0, 4),
        'from' => riff_date_normalize($p['from'] ?? ''), 'until' => riff_date_normalize($p['until'] ?? '')];
    if ($poll['question'] === '' || count($poll['options']) < 2) nl_admin_fail('Нужны вопрос и 2–4 варианта');
    if ($poll['from'] === '' || $poll['until'] === '' || $poll['until'] < $poll['from']) nl_admin_fail('Даты голосования: с … по …');
    $data = nl_load('newsletter-polls.json', []);
    $polls = array_values(array_filter((array)($data['polls'] ?? []), function ($x) use ($poll) { return is_array($x) && ($x['id'] ?? '') !== $poll['id']; }));
    $polls[] = $poll;
    $data['polls'] = $polls;
    nl_save('newsletter-polls.json', $data);
} elseif ($action === 'poll_delete') {
    $id = (string)($body['id'] ?? '');
    $data = nl_load('newsletter-polls.json', []);
    $data['polls'] = array_values(array_filter((array)($data['polls'] ?? []), function ($x) use ($id) { return is_array($x) && ($x['id'] ?? '') !== $id; }));
    unset($data['votes'][$id]);
    nl_save('newsletter-polls.json', $data);
} elseif ($action === 'preview' || $action === 'test') {
    $letters = nl_admin_letters($body['letter'] ?? []);
    if (!$letters) nl_admin_fail('На эту дату писем нет');
    if ($action === 'test') {
        $to = trim((string)($body['to'] ?? ''));
        $errors = [];
        foreach ($letters as $l) { $e = nl_send_test($to, $l); if ($e !== null) $errors[] = $e; }
        if ($errors) nl_admin_fail('Не ушло: ' . implode('; ', $errors), 502);
        echo json_encode(['success' => true, 'sent' => count($letters)]);
        exit;
    }
    $out = [];
    foreach ($letters as $l) {
        $m = nl_compose($l, ['id' => 'preview', 'email' => 'jimmy.page@example.com', 'name' => 'Jimmy'], ['topics' => array_fill_keys(NL_TOPICS, true)], digest_base_url());
        $out[] = ['key' => $l['key'], 'topic' => $l['topic'], 'subject' => $m['subject'], 'html' => $m['html']];
    }
    echo json_encode(['success' => true, 'letters' => $out], JSON_UNESCAPED_UNICODE);
    exit;
} elseif ($action === 'settings') {
    $email = trim((string)($body['alertEmail'] ?? ''));
    if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) nl_admin_fail('Неверный email');
    nl_save('newsletter-settings.json', ['alertEmail' => $email]);
} elseif ($action === 'alerts_clear') {
    // Marked as read, not deleted: the key still stops the same alert from coming back every hour.
    nl_save('newsletter-alerts.json', array_map(function ($a) { $a['done'] = true; return $a; }, nl_load('newsletter-alerts.json', [])));
} else {
    nl_admin_fail('Unknown action');
}
echo json_encode(nl_admin_state(), JSON_UNESCAPED_UNICODE);
