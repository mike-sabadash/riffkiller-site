<?php
/**
 * One-click “stop these emails” from the weekly practice summary (config/progress-digest.php).
 * Opening the link (GET) or the mail client's List-Unsubscribe-Post (POST) turns the summary off; the page says so
 * in the language the student uses on the site.
 */
error_reporting(0);
ini_set('display_errors', 0);
require_once dirname(__DIR__) . '/config/progress-digest.php';

$id = (string)($_GET['u'] ?? '');
$token = (string)($_GET['t'] ?? '');
$valid = $id !== '' && $token !== '' && hash_equals(digest_stop_token($id), $token);

function off_page($title, $text, $code = 200) {
    http_response_code($code);
    header('Content-Type: text/html; charset=utf-8');
    echo '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">'
        . '<title>Riff Killer</title></head><body style="margin:0;font-family:Arial,Helvetica,sans-serif;background:#0f0f12;color:#e8e8ef;">'
        . '<div style="max-width:480px;margin:0 auto;padding:48px 20px;"><h1 style="font-size:20px;margin:0 0 12px;color:#fff;">' . htmlspecialchars($title) . '</h1>'
        . '<p style="font-size:15px;line-height:1.55;margin:0 0 20px;">' . $text . '</p></div></body></html>';
    exit;
}

$texts = [
    'en' => ['bad' => 'This link doesn’t work', 'off' => 'Weekly summary turned off', 'profile' => 'profile',
        'bad_text' => 'You can turn the weekly summary off in your %s.', 'off_text' => 'You won’t get these emails any more. You can turn them back on in your %s.'],
    'ru' => ['bad' => 'Ссылка не работает', 'off' => 'Недельные итоги отключены', 'profile' => 'профиле',
        'bad_text' => 'Отключить недельные итоги можно в %s.', 'off_text' => 'Эти письма больше не придут. Включить их снова можно в %s.'],
    'es' => ['bad' => 'Este enlace no funciona', 'off' => 'Resumen semanal desactivado', 'profile' => 'perfil',
        'bad_text' => 'Puedes desactivar el resumen semanal en tu %s.', 'off_text' => 'Ya no recibirás estos emails. Puedes volver a activarlos en tu %s.'],
];
$path = $valid ? digest_progress_file($id) : '';
$progress = $valid ? digest_load_json($path, null) : null;
$t = $texts[is_array($progress) ? (string)($progress['lang'] ?? 'en') : 'en'] ?? $texts['en'];
$link = '<a style="color:#b28cf0" href="/profile.html">' . htmlspecialchars($t['profile']) . '</a>';

if (!$valid) off_page($t['bad'], sprintf($t['bad_text'], $link), 400);
if (is_array($progress) && !empty($progress['email'])) {
    $progress['email'] = false;
    $progress['emailAt'] = (int)round(microtime(true) * 1000);
    digest_save_json($path, $progress);
}
off_page($t['off'], sprintf($t['off_text'], $link));
