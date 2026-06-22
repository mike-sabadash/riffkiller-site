<?php
/**
 * Показывает точные redirect_uri. Если в .env задан OAUTH_REDIRECT_BASE — используй эти строки в кабинетах.
 */
$projectRoot = dirname(__DIR__, 2);
require_once $projectRoot . '/config/load-env.php';
require_once $projectRoot . '/config/site-url.php';

$base = get_site_base_url();
$yandex = $base . '/api/auth/yandex-callback.php';
$google  = $base . '/api/auth/google-callback.php';

$oauthBase = getenv('OAUTH_REDIRECT_BASE') ?: (isset($_ENV['OAUTH_REDIRECT_BASE']) ? $_ENV['OAUTH_REDIRECT_BASE'] : '');
if ($oauthBase === '' && !empty($GLOBALS['RIFFKILLER_ENV']['OAUTH_REDIRECT_BASE'])) $oauthBase = $GLOBALS['RIFFKILLER_ENV']['OAUTH_REDIRECT_BASE'];
if ($oauthBase === '') {
    $envFile = dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . '.env';
    if (is_file($envFile) && ($raw = @file_get_contents($envFile)) && preg_match('/^\s*OAUTH_REDIRECT_BASE\s*=\s*([^\s#]+)/m', $raw, $m)) {
        $oauthBase = trim($m[1], " \t\"'");
    }
}
$hasOverride = $oauthBase !== '';
$currentHost = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on') ? 'https' : 'http';
$currentHost .= '://' . ($_SERVER['HTTP_HOST'] ?? '');
header('Content-Type: text/html; charset=utf-8');
?>
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>OAuth Redirect URIs</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 680px; margin: 2rem auto; padding: 0 1rem; }
    h1 { font-size: 1.25rem; }
    .uri { background: #f0f0f0; padding: 0.5rem 0.75rem; margin: 0.5rem 0; word-break: break-all; font-size: 14px; }
    label { display: block; margin-top: 1rem; font-weight: 600; font-size: 14px; }
    small { color: #666; font-size: 13px; }
    .box { background: #fff8e6; border: 1px solid #e6c200; padding: 0.75rem 1rem; margin: 1rem 0; border-radius: 6px; font-size: 13px; }
    .box code { background: #fff; padding: 0 4px; }
  </style>
</head>
<body>
  <h1>Redirect URI для OAuth</h1>
  <p><small>Скопируй строки <strong>целиком</strong> в настройки приложений Яндекс и Google (Callback URI / Authorized redirect URIs).</small></p>

  <label>Яндекс OAuth → Callback URI:</label>
  <div class="uri" id="yandex"><?php echo htmlspecialchars($yandex); ?></div>
  <button type="button" onclick="copy('yandex')">Копировать</button>

  <label style="margin-top: 1.5rem;">Google OAuth → Authorized redirect URIs:</label>
  <div class="uri" id="google"><?php echo htmlspecialchars($google); ?></div>
  <button type="button" onclick="copy('google')">Копировать</button>

  <p style="margin-top: 1.5rem;"><small>Base URL: <code><?php echo htmlspecialchars($base); ?></code></small></p>

  <?php if (!$hasOverride): ?>
  <div class="box">
    <strong>Если Google/Яндекс всё равно пишет redirect_uri_mismatch:</strong><br>
    1. В корне проекта открой <code>.env</code>.<br>
    2. Добавь строку (подставь свой хост и порт, <strong>как в адресной строке</strong> при открытии приложения):<br>
    <code>OAUTH_REDIRECT_BASE=<?php echo htmlspecialchars($currentHost); ?></code><br>
    3. Сохрани, перезапусти сервер. Обнови эту страницу — скопируй новые URI и заново добавь их в Google и Яндекс (можно оставить старые).
  </div>
  <?php else: ?>
  <p style="margin-top: 1rem;"><small>Сейчас используется <code>OAUTH_REDIRECT_BASE</code> из .env.</small></p>
  <?php endif; ?>

  <script>
    function copy(id) {
      var el = document.getElementById(id);
      var text = el.textContent.trim();
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function() { alert('Скопировано'); });
      } else {
        var ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        alert('Скопировано');
      }
    }
  </script>
</body>
</html>
