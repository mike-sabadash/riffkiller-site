<?php
/**
 * Monday summary email of a student's practice week (opt-in on the profile, js/rk-progress.js state.email).
 * config/progress-digest-cli.php runs it every hour from cron; a student gets it once, on Monday from 8:00 in
 * their own time zone, about the week that just ended. After two weeks without playing, one last email says
 * the summaries pause, and nothing more is sent until they play again.
 * Sends through Resend (RESEND_API_KEY, RESEND_FROM_EMAIL in .env); without them nothing is sent.
 */
require_once __DIR__ . '/load-env.php';
require_once __DIR__ . '/user-store.php';

const DIGEST_DAY_SECONDS = 300;
const DIGEST_HOUR = 8;

function digest_root() { return dirname(__DIR__); }

function digest_progress_file($userId) {
    return digest_root() . '/data/progress/' . hash('sha256', (string)$userId) . '.json';
}

function digest_load_json($path, $default) {
    if (!is_file($path)) return $default;
    $data = json_decode((string)@file_get_contents($path), true);
    return is_array($data) ? $data : $default;
}

function digest_save_json($path, $data) {
    $dir = dirname($path);
    if (!is_dir($dir)) @mkdir($dir, 0755, true);
    $tmp = $path . '.' . bin2hex(random_bytes(4)) . '.tmp';
    return @file_put_contents($tmp, json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT)) !== false && @rename($tmp, $path);
}

/** Secret for the one-click “stop these emails” links: ADMIN_SECRET, or a random key kept in data/. */
function digest_secret() {
    $s = getenv('ADMIN_SECRET') ?: ($_ENV['ADMIN_SECRET'] ?? '');
    if ($s !== '') return $s;
    $path = digest_root() . '/data/progress-digest.key';
    if (!is_file($path)) {
        if (!is_dir(dirname($path))) @mkdir(dirname($path), 0755, true);
        @file_put_contents($path, bin2hex(random_bytes(32)));
        @chmod($path, 0600);
        // Created by root (a manual --test run): hand it to the owner of data/, the user the cron runs as.
        if (function_exists('posix_getuid') && posix_getuid() === 0) @chown($path, fileowner(dirname($path)));
    }
    return trim((string)@file_get_contents($path));
}

/** Site address for links in the email; cron has no request host, so SITE_URL from .env or the live domain. */
function digest_base_url() {
    $u = getenv('SITE_URL') ?: ($_ENV['SITE_URL'] ?? ($GLOBALS['RIFFKILLER_ENV']['SITE_URL'] ?? ''));
    return rtrim($u !== '' ? $u : 'https://riffkiller.fun', '/');
}

function digest_stop_token($userId) {
    return hash_hmac('sha256', 'progress-digest|' . $userId, digest_secret());
}

function digest_tz($progress) {
    $tz = is_string($progress['tz'] ?? null) ? $progress['tz'] : '';
    try { return new DateTimeZone($tz !== '' ? $tz : 'UTC'); } catch (Exception $e) { return new DateTimeZone('UTC'); }
}

/** Monday 00:00 of the week before $now, in the student's zone, and the matching ISO week key. */
function digest_last_week($progress, $nowTs) {
    $now = (new DateTimeImmutable('@' . $nowTs))->setTimezone(digest_tz($progress));
    $thisMonday = $now->setTime(0, 0)->modify('-' . (((int)$now->format('N')) - 1) . ' days');
    $start = $thisMonday->modify('-7 days');
    return ['start' => $start, 'end' => $thisMonday, 'key' => $start->format('o-\WW'), 'now' => $now];
}

/** Is it Monday from 8:00 in the student's zone and has this week's email not gone out yet? */
function digest_due($progress, $log, $nowTs) {
    if (empty($progress['email'])) return false;
    $w = digest_last_week($progress, $nowTs);
    if ((int)$w['now']->format('N') !== 1 || (int)$w['now']->format('G') < DIGEST_HOUR) return false;
    return ($log['lastWeek'] ?? '') !== $w['key'];
}

function digest_played_since($progress, $fromTs, $tz) {
    $sec = 0;
    $from = (new DateTimeImmutable('@' . $fromTs))->setTimezone($tz)->format('Y-m-d');
    foreach (($progress['days'] ?? []) as $day => $d) {
        if (is_string($day) && $day >= $from) $sec += (int)($d['sec'] ?? 0);
    }
    return $sec;
}

/** What the email says, as plain facts; null when there is nothing to send (paused after a quiet stretch). */
function digest_facts($progress, $riffs, $log, $nowTs) {
    $w = digest_last_week($progress, $nowTs);
    $tz = digest_tz($progress);
    $days = 0; $minutes = 0;
    for ($i = 0; $i < 7; $i++) {
        $key = $w['start']->modify('+' . $i . ' days')->format('Y-m-d');
        $sec = (int)($progress['days'][$key]['sec'] ?? 0);
        $minutes += $sec;
        if ($sec >= DIGEST_DAY_SECONDS) $days++;
    }
    $minutes = (int)round($minutes / 60);
    $quiet = digest_played_since($progress, $nowTs - 14 * 86400, $tz) === 0;
    if ($quiet && !empty($log['paused'])) return null;

    $byId = [];
    foreach ($riffs as $r) if (isset($r['id'])) $byId[(string)$r['id']] = $r;
    $startMs = $w['start']->getTimestamp() * 1000; $endMs = $w['end']->getTimestamp() * 1000; $nowMs = $nowTs * 1000;
    $reachedTempo = []; $due = 0; $open = null; $kills = [];
    foreach (($progress['riffs'] ?? []) as $id => $r) {
        $riff = $byId[(string)$id] ?? null;
        if (!$riff) continue;
        $atTempo = 0; $stars = 0;
        foreach (($r['parts'] ?? []) as $p) {
            $t = (float)($p['tempoAt'] ?? 0);
            if ($t > 0) $atTempo++;
            $stars += digest_part_stars($p);
            if ($t >= $startMs && $t < $endMs) $reachedTempo[(string)$id] = ($reachedTempo[(string)$id] ?? 0) + 1;
            if ($t > 0 && ($p['nextReview'] ?? 0) > 0 && $p['nextReview'] <= $nowMs) $due++;
        }
        $total = is_array($riff['segments'] ?? null) ? count($riff['segments']) : 0;
        if ($total === 0) continue;
        $atTempo = min($atTempo, $total);
        $learned = $atTempo >= $total && !empty($r['wholeAt']);
        $wk = (float)($r['wholeAt'] ?? 0);
        if ($learned && $wk >= $startMs && $wk < $endMs) $kills[] = (string)($riff['song'] ?? '');
        if ($learned) continue;
        // The closest kill: fewest shots left (parts below tempo, plus the whole riff once), then the latest played.
        $toKill = $total - $atTempo + 1;
        $cand = ['song' => (string)($riff['song'] ?? ''), 'id' => (string)$id, 'atTempo' => $atTempo, 'total' => $total,
            'toKill' => $toKill, 'stars' => min($stars, $total * 3), 'maxStars' => $total * 3, 'lastAt' => (float)($r['lastAt'] ?? 0)];
        if (!$open || $toKill < $open['toKill'] || ($toKill === $open['toKill'] && $cand['lastAt'] > $open['lastAt'])) $open = $cand;
    }
    // Stars earned this week, from the wins log (js/rk-progress.js state.wins).
    $starsWeek = 0;
    foreach (($progress['wins'] ?? []) as $w) {
        if (!is_array($w) || ($w['t'] ?? '') !== 'star') continue;
        $at = (float)($w['at'] ?? 0);
        if ($at >= $startMs && $at < $endMs) $starsWeek++;
    }
    $tempo = [];
    foreach ($reachedTempo as $id => $n) $tempo[] = ['song' => (string)($byId[$id]['song'] ?? ''), 'parts' => $n];
    return [
        'week' => $w['key'], 'days' => $days, 'goal' => (int)($progress['goal'] ?? 0), 'minutes' => $minutes,
        'tempo' => $tempo, 'due' => $due, 'open' => $open, 'pausing' => $quiet,
        'stars' => $starsWeek, 'kills' => $kills,
    ];
}

/** Stars of a part, as in js/rk-progress.js: ★ at ×0.5, ★★ at ×0.75, ★★★ at ×1 (tempo). */
function digest_part_stars($p) {
    if (!is_array($p)) return 0;
    if ((float)($p['tempoAt'] ?? 0) > 0) return 3;
    $best = (float)($p['best'] ?? 0);
    $n = 0;
    foreach ([0.5, 0.75, 1] as $sp) if ($best >= $sp - 1e-6) $n++;
    return $n;
}

function digest_strings($lang) {
    $all = [
        'en' => [
            'subject' => 'Your week: %d of %d days', 'subject_nogoal' => 'Your week: %d practice days', 'subject_pause' => 'Pausing your weekly summary',
            'days' => 'Last week you played %d of %d days (%d min).', 'days_nogoal' => 'Last week you played %d days (%d min).',
            'tempo' => '%s: %d part(s) reached tempo.', 'due' => '%d part(s) are due for a review: play each once at ×1 to lock it in.',
            'open' => 'Closest kill: %s — %d shot(s) left, %d of %d ★.', 'stars' => 'Stars earned this week: %d ★.',
            'kill' => 'Riff killed: %s.', 'cta' => 'Open your progress',
            'pause' => 'You haven’t played for two weeks, so we’ll stop these summaries. They start again by themselves the next time you practice.',
            'stop' => 'Don’t want these emails? Turn them off', 'why' => 'You get this because you turned on the weekly summary in your Riff Killer profile.',
        ],
        'ru' => [
            'subject' => 'Твоя неделя: %d из %d дней', 'subject_nogoal' => 'Твоя неделя: дней практики — %d', 'subject_pause' => 'Ставим недельные итоги на паузу',
            'days' => 'Прошлая неделя: %d из %d дней практики (%d мин).', 'days_nogoal' => 'Прошлая неделя: дней практики — %d (%d мин).',
            'tempo' => '%s: частей вышло на темп — %d.', 'due' => 'Частей ждут повтора: %d. Сыграй каждую один раз на ×1, чтобы закрепить.',
            'open' => 'Ближе всего к kill: %s — осталось шагов: %d, звёзд %d из %d ★.', 'stars' => 'Звёзд за неделю: %d ★.',
            'kill' => 'Рифф убит: %s.', 'cta' => 'Открыть прогресс',
            'pause' => 'Две недели без практики, поэтому мы приостанавливаем эти письма. Они вернутся сами после следующего занятия.',
            'stop' => 'Не хочешь получать эти письма? Отключить', 'why' => 'Это письмо пришло, потому что в твоём профиле Riff Killer включены недельные итоги.',
        ],
        'es' => [
            'subject' => 'Tu semana: %d de %d días', 'subject_nogoal' => 'Tu semana: %d días de práctica', 'subject_pause' => 'Pausamos tu resumen semanal',
            'days' => 'La semana pasada tocaste %d de %d días (%d min).', 'days_nogoal' => 'La semana pasada tocaste %d días (%d min).',
            'tempo' => '%s: %d parte(s) llegaron a tempo.', 'due' => '%d parte(s) esperan repaso: toca cada una una vez a ×1 para afianzarla.',
            'open' => 'Más cerca del kill: %s — quedan %d paso(s), %d de %d ★.', 'stars' => 'Estrellas de la semana: %d ★.',
            'kill' => 'Riff eliminado: %s.', 'cta' => 'Ver tu progreso',
            'pause' => 'Llevas dos semanas sin tocar, así que pausamos estos resúmenes. Volverán solos la próxima vez que practiques.',
            'stop' => '¿No quieres estos emails? Desactívalos', 'why' => 'Recibes esto porque activaste el resumen semanal en tu perfil de Riff Killer.',
        ],
    ];
    return $all[$lang] ?? $all['en'];
}

/** Subject, plain text and HTML of the email. */
function digest_compose($facts, $lang, $baseUrl, $stopUrl) {
    $t = digest_strings($lang);
    $lines = [];
    if ($facts['pausing']) {
        $subject = $t['subject_pause'];
        $lines[] = $t['pause'];
    } else {
        $subject = $facts['goal'] ? sprintf($t['subject'], $facts['days'], $facts['goal']) : sprintf($t['subject_nogoal'], $facts['days']);
        $lines[] = $facts['goal'] ? sprintf($t['days'], $facts['days'], $facts['goal'], $facts['minutes']) : sprintf($t['days_nogoal'], $facts['days'], $facts['minutes']);
        if (!empty($facts['stars'])) $lines[] = sprintf($t['stars'], $facts['stars']);
        foreach (($facts['kills'] ?? []) as $song) $lines[] = sprintf($t['kill'], $song);
        foreach ($facts['tempo'] as $r) $lines[] = sprintf($t['tempo'], $r['song'], $r['parts']);
        if ($facts['due']) $lines[] = sprintf($t['due'], $facts['due']);
        $o = $facts['open'];
        if ($o) $lines[] = sprintf($t['open'], $o['song'], $o['toKill'] ?? ($o['total'] - $o['atTempo'] + 1), $o['stars'] ?? $o['atTempo'] * 3, $o['maxStars'] ?? $o['total'] * 3);
    }
    $link = rtrim($baseUrl, '/') . '/profile.html';
    $text = implode("\n\n", $lines) . "\n\n" . $t['cta'] . ': ' . $link . "\n\n---\n" . $t['why'] . "\n" . $t['stop'] . ': ' . $stopUrl;
    $p = '';
    foreach ($lines as $l) $p .= '<p style="margin:0 0 12px;font-size:15px;line-height:1.55;color:#e8e8ef;">' . htmlspecialchars($l, ENT_QUOTES, 'UTF-8') . '</p>';
    $html = '<!doctype html><html><body style="margin:0;padding:0;background:#0f0f12;font-family:Arial,Helvetica,sans-serif;">'
        . '<div style="max-width:560px;margin:0 auto;padding:28px 20px;">'
        . '<p style="margin:0 0 18px;font-size:13px;color:#8d8d9a;">Riff Killer</p>'
        . '<h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;color:#ffffff;font-weight:600;">' . htmlspecialchars($subject, ENT_QUOTES, 'UTF-8') . '</h1>'
        . $p
        . '<p style="margin:20px 0 28px;"><a href="' . htmlspecialchars($link, ENT_QUOTES, 'UTF-8') . '" style="display:inline-block;padding:11px 18px;border-radius:10px;background:#9355e5;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;">' . htmlspecialchars($t['cta'], ENT_QUOTES, 'UTF-8') . '</a></p>'
        . '<p style="margin:0 0 6px;font-size:12px;line-height:1.5;color:#8d8d9a;">' . htmlspecialchars($t['why'], ENT_QUOTES, 'UTF-8') . '</p>'
        . '<p style="margin:0;font-size:12px;"><a href="' . htmlspecialchars($stopUrl, ENT_QUOTES, 'UTF-8') . '" style="color:#b28cf0;">' . htmlspecialchars($t['stop'], ENT_QUOTES, 'UTF-8') . '</a></p>'
        . '</div></body></html>';
    return ['subject' => $subject, 'text' => $text, 'html' => $html];
}

function digest_send_resend($to, $mail, $stopUrl) {
    $key = getenv('RESEND_API_KEY') ?: ($_ENV['RESEND_API_KEY'] ?? '');
    $from = getenv('RESEND_FROM_EMAIL') ?: ($_ENV['RESEND_FROM_EMAIL'] ?? '');
    if ($key === '' || $from === '') return 'not configured';
    $ch = curl_init('https://api.resend.com/emails');
    curl_setopt_array($ch, [
        CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 15,
        CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $key, 'Content-Type: application/json'],
        CURLOPT_POSTFIELDS => json_encode([
            'from' => $from, 'to' => [$to], 'subject' => $mail['subject'], 'text' => $mail['text'], 'html' => $mail['html'],
            'headers' => ['List-Unsubscribe' => '<' . $stopUrl . '>', 'List-Unsubscribe-Post' => 'List-Unsubscribe=One-Click'],
            'tags' => [['name' => 'kind', 'value' => 'progress_digest']],
        ], JSON_UNESCAPED_UNICODE),
    ]);
    $resp = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);
    if ($err) return 'curl: ' . $err;
    return ($code >= 200 && $code < 300) ? null : 'http ' . $code . ' ' . substr((string)$resp, 0, 200);
}

/**
 * One pass over every account. $send is injectable for tests: fn($to, $mail, $stopUrl) → null on success, or an error.
 * Returns log lines.
 */
function digest_run($nowTs = null, $send = 'digest_send_resend') {
    $nowTs = $nowTs ?: time();
    $out = [];
    $configured = (getenv('RESEND_API_KEY') ?: ($_ENV['RESEND_API_KEY'] ?? '')) !== '' && (getenv('RESEND_FROM_EMAIL') ?: ($_ENV['RESEND_FROM_EMAIL'] ?? '')) !== '';
    if ($send === 'digest_send_resend' && !$configured) return ['progress-digest: RESEND_API_KEY / RESEND_FROM_EMAIL not set, nothing sent'];
    $logPath = digest_root() . '/data/progress-digest-log.json';
    $log = digest_load_json($logPath, []);
    $riffs = digest_load_json(digest_root() . '/data/riffs.json', []);
    $base = digest_base_url();
    foreach (user_list_all() as $u) {
        $id = (string)($u['id'] ?? '');
        $email = trim((string)($u['email'] ?? ''));
        if ($id === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) continue;
        $progress = digest_load_json(digest_progress_file($id), null);
        if (!$progress) continue;
        $entry = $log[$id] ?? [];
        if (!digest_due($progress, $entry, $nowTs)) continue;
        $facts = digest_facts($progress, $riffs, $entry, $nowTs);
        $entry['lastWeek'] = digest_last_week($progress, $nowTs)['key'];
        if ($facts === null) { $log[$id] = $entry; continue; }
        $stopUrl = rtrim($base, '/') . '/api/progress-email-off.php?u=' . rawurlencode($id) . '&t=' . digest_stop_token($id);
        $mail = digest_compose($facts, (string)($progress['lang'] ?? 'en'), $base, $stopUrl);
        $err = call_user_func($send, $email, $mail, $stopUrl);
        if ($err !== null) { $out[] = 'progress-digest: ' . $id . ' failed: ' . $err; continue; }
        $entry['paused'] = $facts['pausing'];
        $entry['sentAt'] = date('c', $nowTs);
        $log[$id] = $entry;
        $out[] = 'progress-digest: sent ' . $entry['lastWeek'] . ' to ' . $id . ($facts['pausing'] ? ' (pause notice)' : '');
    }
    digest_save_json($logPath, $log);
    return $out;
}

/**
 * One test email to $to right now, marked “[Test]”: that account's own week if it has progress, sample numbers
 * otherwise. Touches no log or progress file. Returns a log line.
 */
function digest_send_test($to, $send = 'digest_send_resend') {
    if (!filter_var($to, FILTER_VALIDATE_EMAIL)) return 'progress-digest test: not an email address';
    $user = null;
    foreach (user_list_all() as $u) {
        if (strcasecmp(trim((string)($u['email'] ?? '')), $to) === 0) { $user = $u; break; }
    }
    $progress = $user ? digest_load_json(digest_progress_file((string)$user['id']), null) : null;
    $facts = is_array($progress) ? digest_facts($progress, digest_load_json(digest_root() . '/data/riffs.json', []), [], time()) : null;
    if (!$facts) $facts = ['week' => 'test', 'days' => 3, 'goal' => 5, 'minutes' => 42, 'tempo' => [], 'due' => 1, 'open' => null, 'stars' => 4, 'kills' => []];
    $facts['pausing'] = false;
    $id = $user ? (string)$user['id'] : 'test';
    $base = digest_base_url();
    $stopUrl = $base . '/api/progress-email-off.php?u=' . rawurlencode($id) . '&t=' . digest_stop_token($id);
    $mail = digest_compose($facts, (string)(($progress['lang'] ?? '') ?: 'ru'), $base, $stopUrl);
    $mail['subject'] = '[Test] ' . $mail['subject'];
    $err = call_user_func($send, $to, $mail, $stopUrl);
    return 'progress-digest test: ' . ($user ? 'account found' : 'no account, sample numbers') . ', subject "' . $mail['subject'] . '", '
        . ($err === null ? 'sent' : 'failed: ' . $err);
}
