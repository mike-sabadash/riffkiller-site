<?php
/**
 * Unified admin panel: Riffs | Promo codes (+ future sections).
 * Password protected via ADMIN_PASSWORD.
 */
error_reporting(0);
ini_set('display_errors', 0);

$projectRoot = dirname(__DIR__);
require_once $projectRoot . '/config/load-env.php';
require_once $projectRoot . '/config/session-start.php';
require_once $projectRoot . '/config/promo-store.php';
require_once $projectRoot . '/config/payments-log.php';
require_once $projectRoot . '/config/user-store.php';
require_once $projectRoot . '/config/subscription-store.php';
require_once $projectRoot . '/config/email-subscriptions.php';
require_once $projectRoot . '/config/email-campaigns.php';
require_once $projectRoot . '/config/email-templates.php';
require_once $projectRoot . '/config/test-accounts.php';

$adminPass = getenv('ADMIN_PASSWORD') ?: (isset($_ENV['ADMIN_PASSWORD']) ? $_ENV['ADMIN_PASSWORD'] : '');
if ($adminPass === '' && defined('ADMIN_PASSWORD')) $adminPass = ADMIN_PASSWORD;
if ($adminPass === '' && !empty($GLOBALS['RIFFKILLER_ENV']['ADMIN_PASSWORD'])) $adminPass = $GLOBALS['RIFFKILLER_ENV']['ADMIN_PASSWORD'];
if ($adminPass === '') {
    $envFile = $projectRoot . DIRECTORY_SEPARATOR . '.env';
    if (is_file($envFile)) {
        $raw = @file_get_contents($envFile);
        if ($raw && preg_match('/^\s*ADMIN_PASSWORD\s*=\s*([^\s#]+)/m', $raw, $m)) $adminPass = trim($m[1], " \t\"'");
    }
}

$adminSecret = getenv('ADMIN_SECRET') ?: (isset($_ENV['ADMIN_SECRET']) ? $_ENV['ADMIN_SECRET'] : '');
if ($adminSecret === '' && defined('ADMIN_SECRET')) $adminSecret = ADMIN_SECRET;
if ($adminSecret === '' && !empty($GLOBALS['RIFFKILLER_ENV']['ADMIN_SECRET'])) $adminSecret = $GLOBALS['RIFFKILLER_ENV']['ADMIN_SECRET'];
if ($adminSecret === '') {
    $envFile = $projectRoot . DIRECTORY_SEPARATOR . '.env';
    if (is_file($envFile)) {
        $raw = @file_get_contents($envFile);
        if ($raw && preg_match('/^\s*ADMIN_SECRET\s*=\s*([^\s#]+)/m', $raw, $m)) $adminSecret = trim($m[1], " \t\"'");
    }
}

$baseUrl = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? 'https' : 'http') . '://' . ($_SERVER['HTTP_HOST'] ?? 'localhost');

if ($adminPass === '') {
    die('Admin not configured. Set ADMIN_PASSWORD in .env');
}

$loggedIn = isset($_SESSION['admin_promo_logged']) && $_SESSION['admin_promo_logged'] === true;

// POST actions
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action = $_POST['action'] ?? '';
    if ($action === 'login') {
        if (hash_equals($adminPass, $_POST['password'] ?? '')) {
            $_SESSION['admin_promo_logged'] = true;
            $loggedIn = true;
        } else {
            $loginError = 'Invalid password.';
        }
    } elseif ($action === 'logout') {
        unset($_SESSION['admin_promo_logged']);
        header('Location: index.php');
        exit;
    } elseif ($loggedIn && $action === 'generate_promo') {
        $days = isset($_POST['expires_days']) ? (int)$_POST['expires_days'] : 0;
        $domain = trim($_POST['domain_limit'] ?? '') ?: null;
        $result = promo_create($days > 0 ? $days : null, $domain);
        if ($result) {
            $newCode = $result['code'];
        }
        $adminBase = dirname($_SERVER['SCRIPT_NAME'] ?? '/admin/index.php');
        if ($adminBase === '/' || $adminBase === '\\') $adminBase = '';
        header('Location: ' . $adminBase . '/index.php?section=promo' . (isset($newCode) ? '&new=' . urlencode($newCode) : ''));
        exit;
    } elseif ($loggedIn && $action === 'revoke') {
        $hash = $_POST['hash'] ?? '';
        if ($hash) promo_revoke($hash);
        $adminBase = dirname($_SERVER['SCRIPT_NAME'] ?? '/admin/index.php');
        if ($adminBase === '/' || $adminBase === '\\') $adminBase = '';
        header('Location: ' . $adminBase . '/index.php?section=promo');
        exit;
    } elseif ($loggedIn && $action === 'create_test') {
        $acc = test_account_create();
        if ($acc) {
            $loginUrl = $baseUrl . '/test-login.html?token=' . urlencode($acc['token']);
            header('Content-Type: application/json');
            echo json_encode(['success' => true, 'login_url' => $loginUrl]);
        } else {
            header('Content-Type: application/json');
            echo json_encode(['success' => false, 'error' => 'Failed to create']);
        }
        exit;
    } elseif ($loggedIn && $action === 'update_comment') {
        header('Content-Type: application/json');
        $hash = $_POST['hash'] ?? '';
        $comment = $_POST['comment'] ?? '';
        if ($hash && promo_update_comment($hash, $comment)) {
            echo json_encode(['success' => true]);
        } else {
            echo json_encode(['success' => false, 'error' => 'Update failed']);
        }
        exit;
    } elseif ($loggedIn && $action === 'save_email_template') {
        $tplKey = trim((string)($_POST['template_key'] ?? ''));
        $tplName = trim((string)($_POST['template_name'] ?? ''));
        $tplSubject = (string)($_POST['template_subject'] ?? '');
        $tplText = (string)($_POST['template_text'] ?? '');
        $tplHtml = (string)($_POST['template_html'] ?? '');
        $saved = email_template_upsert($tplName, $tplSubject, $tplText, $tplHtml, $tplKey !== '' ? $tplKey : null);
        $adminBase = dirname($_SERVER['SCRIPT_NAME'] ?? '/admin/index.php');
        if ($adminBase === '/' || $adminBase === '\\') $adminBase = '';
        header('Location: ' . $adminBase . '/index.php?section=emails' . ($saved ? '&tpl=' . urlencode($saved['key']) : ''));
        exit;
    } elseif ($loggedIn && $action === 'delete_email_template') {
        $tplKey = trim((string)($_POST['template_key'] ?? ''));
        if ($tplKey !== '') email_template_delete($tplKey);
        $adminBase = dirname($_SERVER['SCRIPT_NAME'] ?? '/admin/index.php');
        if ($adminBase === '/' || $adminBase === '\\') $adminBase = '';
        header('Location: ' . $adminBase . '/index.php?section=emails');
        exit;
    } elseif ($loggedIn && $action === 'import_email_template') {
        $rawJson = trim((string)($_POST['template_json'] ?? ''));
        $dec = $rawJson !== '' ? json_decode($rawJson, true) : null;
        if (is_array($dec)) {
            $tplKey = isset($dec['key']) ? (string)$dec['key'] : null;
            $tplName = (string)($dec['name'] ?? ($tplKey ?: 'template'));
            $tplSubject = (string)($dec['subject'] ?? '');
            $tplText = (string)($dec['text'] ?? '');
            $tplHtml = (string)($dec['html'] ?? '');
            $saved = email_template_upsert($tplName, $tplSubject, $tplText, $tplHtml, $tplKey);
        } else {
            $saved = null;
        }
        $adminBase = dirname($_SERVER['SCRIPT_NAME'] ?? '/admin/index.php');
        if ($adminBase === '/' || $adminBase === '\\') $adminBase = '';
        header('Location: ' . $adminBase . '/index.php?section=emails' . ($saved ? '&tpl=' . urlencode($saved['key']) : ''));
        exit;
    }
}

$section = isset($_GET['section']) ? $_GET['section'] : 'promo';
if (!in_array($section, ['riffs', 'collections', 'promo', 'payments', 'users', 'emails'], true)) {
    $section = 'promo';
}
$newCode = isset($_GET['new']) ? $_GET['new'] : '';
$payments = payments_log_read(300);
$users = user_list_all();
$subsByUser = subscription_list_all();
$emailPrefs = email_subscriptions_load();
$emailCampaigns = email_campaigns_log_read(250);
$emailTemplates = email_templates_load();
$activeTpl = isset($_GET['tpl']) ? trim((string)$_GET['tpl']) : '';
$activeTemplate = ($activeTpl !== '' && isset($emailTemplates[$activeTpl])) ? $emailTemplates[$activeTpl] : null;
if ($section === 'emails' && isset($_GET['download_template'])) {
    $dlKey = trim((string)$_GET['download_template']);
    $tpl = email_template_get($dlKey);
    if (!$tpl) {
        http_response_code(404);
        header('Content-Type: text/plain; charset=utf-8');
        echo 'Template not found';
        exit;
    }
    header('Content-Type: application/json; charset=utf-8');
    header('Content-Disposition: attachment; filename="email-template-' . preg_replace('/[^a-z0-9_\-]/i', '_', $tpl['key']) . '.json"');
    echo json_encode($tpl, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    exit;
}

// Payments filters/export
$paySource = isset($_GET['pay_source']) ? trim((string)$_GET['pay_source']) : '';
$payStatus = isset($_GET['pay_status']) ? trim((string)$_GET['pay_status']) : '';
$payFrom = isset($_GET['pay_from']) ? trim((string)$_GET['pay_from']) : '';
$payTo = isset($_GET['pay_to']) ? trim((string)$_GET['pay_to']) : '';
$payQ = isset($_GET['pay_q']) ? trim((string)$_GET['pay_q']) : '';
$paySort = isset($_GET['pay_sort']) ? trim((string)$_GET['pay_sort']) : 'ts';
$payDir = isset($_GET['pay_dir']) ? strtolower(trim((string)$_GET['pay_dir'])) : 'desc';
$allowedSort = ['ts','event','source','user_id','plan','status','amount','currency','reference'];
if (!in_array($paySort, $allowedSort, true)) $paySort = 'ts';
if (!in_array($payDir, ['asc','desc'], true)) $payDir = 'desc';

$paymentsFiltered = array_values(array_filter($payments, function ($p) use ($paySource, $payStatus, $payFrom, $payTo, $payQ) {
    $src = strtolower((string)($p['source'] ?? ''));
    $status = strtolower((string)($p['status'] ?? ''));
    $ts = (string)($p['ts'] ?? '');
    $rowDate = substr($ts, 0, 10);

    if ($paySource !== '' && $src !== strtolower($paySource)) return false;
    if ($payStatus !== '' && $status !== strtolower($payStatus)) return false;
    if ($payFrom !== '' && $rowDate !== '' && $rowDate < $payFrom) return false;
    if ($payTo !== '' && $rowDate !== '' && $rowDate > $payTo) return false;
    if ($payQ !== '') {
        $hay = strtolower(json_encode($p, JSON_UNESCAPED_UNICODE));
        if (strpos($hay, strtolower($payQ)) === false) return false;
    }
    return true;
}));

usort($paymentsFiltered, function ($a, $b) use ($paySort, $payDir) {
    $av = isset($a[$paySort]) ? (string)$a[$paySort] : '';
    $bv = isset($b[$paySort]) ? (string)$b[$paySort] : '';
    if ($paySort === 'amount') {
        $af = is_numeric($av) ? (float)$av : 0.0;
        $bf = is_numeric($bv) ? (float)$bv : 0.0;
        $cmp = $af <=> $bf;
    } else {
        $cmp = strnatcasecmp($av, $bv);
    }
    return $payDir === 'asc' ? $cmp : -$cmp;
});

if ($section === 'payments' && isset($_GET['export']) && $_GET['export'] === 'csv') {
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="payments-' . date('Ymd-His') . '.csv"');
    $out = fopen('php://output', 'w');
    fputcsv($out, ['ts', 'event', 'source', 'user_id', 'plan', 'status', 'amount', 'currency', 'reference', 'note']);
    foreach ($paymentsFiltered as $p) {
        fputcsv($out, [
            $p['ts'] ?? '',
            $p['event'] ?? '',
            $p['source'] ?? '',
            $p['user_id'] ?? '',
            $p['plan'] ?? '',
            $p['status'] ?? '',
            $p['amount'] ?? '',
            $p['currency'] ?? '',
            $p['reference'] ?? '',
            $p['note'] ?? '',
        ]);
    }
    fclose($out);
    exit;
}

if (!$loggedIn) {
    ?>
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <title>Admin — Riff Killer</title>
    <link rel="icon" type="image/svg+xml" href="../assets/icons/favicon.svg">
    <style>
        * { box-sizing: border-box; }
        body { background: #111629; color: #fff; font-family: Roboto, sans-serif; min-height: 100vh; min-height: 100dvh; margin: 0; display: flex; align-items: center; justify-content: center; padding: 20px; padding-bottom: calc(20px + env(safe-area-inset-bottom, 0px) + 52px); }
        .login-box { width: 100%; max-width: 360px; padding: 32px; background: rgba(255,255,255,0.03); border-radius: 16px; border: 1px solid rgba(255,255,255,0.1); }
        h1 { font-size: 20px; margin: 0 0 24px; }
        input[type="password"] { width: 100%; padding: 12px 16px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.05); color: #fff; font-size: 16px; margin-bottom: 16px; }
        button { width: 100%; padding: 12px; background: #9355E5; color: #fff; border: none; border-radius: 8px; font-size: 16px; cursor: pointer; }
        .err { color: #F44336; margin-top: 12px; font-size: 14px; }
    </style>
</head>
<body>
    <div class="login-box">
        <h1>Вход в админку</h1>
        <form method="post">
            <input type="hidden" name="action" value="login">
            <input type="password" name="password" placeholder="Пароль" required autofocus>
            <button type="submit">Войти</button>
        </form>
        <?php if (!empty($loginError)) echo '<p class="err">' . htmlspecialchars($loginError) . '</p>'; ?>
    </div>
</body>
</html>
    <?php
    exit;
}

$codes = promo_list_all();
?>
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <title>Админка — Riff Killer</title>
    <link rel="icon" type="image/svg+xml" href="../assets/icons/favicon.svg">
    <style>
        * { box-sizing: border-box; }
        body { background: #111629; color: #fff; font-family: Roboto, sans-serif; margin: 0; padding: 0; min-height: 100vh; min-height: 100dvh; padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 52px); }
        .admin-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 24px; border-bottom: 1px solid rgba(255,255,255,0.1); flex-wrap: wrap; gap: 12px; }
        .admin-header h1 { font-size: 20px; margin: 0; }
        .admin-nav { display: flex; gap: 4px; }
        .admin-nav a { padding: 8px 16px; border-radius: 8px; color: rgba(255,255,255,0.7); text-decoration: none; font-size: 14px; }
        .admin-nav a:hover { color: #fff; background: rgba(255,255,255,0.05); }
        .admin-nav a.active { color: #fff; background: rgba(147,85,229,0.3); }
        .admin-content { padding: 24px; }
        .admin-content iframe { width: 100%; min-height: calc(100vh - 100px); min-height: calc(100dvh - 100px); border: none; border-radius: 8px; }
        .btn { display: inline-block; padding: 10px 20px; background: transparent; color: #fff; border: 1px solid rgba(255,255,255,0.3); border-radius: 8px; cursor: pointer; font-size: 14px; text-decoration: none; }
        .btn:hover { background: rgba(255,255,255,0.05); }
        a { color: #9355E5; text-decoration: none; }
        a:hover { text-decoration: underline; }
        section { margin-bottom: 32px; }
        section h2 { font-size: 18px; margin: 0 0 16px; }
        .card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 20px; overflow-x: auto; }
        table { width: 100%; border-collapse: collapse; font-size: 14px; }
        th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid rgba(255,255,255,0.08); }
        th { color: rgba(255,255,255,0.6); font-weight: 500; }
        .status-active { color: #4CAF50; }
        .status-used { color: rgba(255,255,255,0.5); }
        .status-revoked { color: #F44336; }
        .new-code { margin-top: 16px; padding: 16px; background: rgba(147,85,229,0.2); border-radius: 8px; word-break: break-all; font-family: monospace; }
        .form-row { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin-bottom: 12px; }
        .form-row label { min-width: 100px; }
        .form-row input { padding: 8px 12px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.05); color: #fff; width: 120px; }
        .btn-primary { background: #9355E5; border-color: #9355E5; }
        .btn-primary:hover { background: #7B3FC7; }
        .code-cell, .comment-cell { display: flex; align-items: center; gap: 6px; }
        .code-cell code { font-family: monospace; font-size: 13px; }
        .btn-copy { padding: 4px 8px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); border-radius: 6px; cursor: pointer; color: #fff; font-size: 14px; }
        .btn-copy:hover { background: rgba(147,85,229,0.4); }
        .btn-copy.copied { background: rgba(76,175,80,0.4); }
        .new-code .btn-copy { margin-left: 8px; vertical-align: middle; }
        .no-copy { color: rgba(255,255,255,0.4); font-size: 12px; }
        .comment-text { flex: 1; min-width: 80px; font-size: 13px; color: rgba(255,255,255,0.8); }
        .comment-edit { display: flex; gap: 6px; align-items: center; }
        .comment-edit .comment-input { flex: 1; min-width: 120px; padding: 6px 10px; font-size: 13px; }
        .btn-edit-comment, .btn-save-comment, .btn-cancel-comment { padding: 4px 8px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); border-radius: 6px; cursor: pointer; color: #fff; font-size: 12px; }
        .btn-edit-comment:hover, .btn-save-comment:hover { background: rgba(147,85,229,0.4); }
        .payments-filters { display: grid; grid-template-columns: repeat(6, minmax(120px, 1fr)); gap: 10px; margin-bottom: 14px; }
        .payments-filters input, .payments-filters select { width: 100%; padding: 8px 10px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.05); color: #fff; }
        .payments-actions { display: flex; gap: 10px; align-items: center; margin-bottom: 10px; flex-wrap: wrap; }
        .payments-summary { color: rgba(255,255,255,0.7); font-size: 13px; margin-bottom: 8px; }
        .th-sort { color: rgba(255,255,255,0.7); text-decoration: none; display: inline-flex; gap: 4px; align-items: center; }
        .th-sort:hover { color: #fff; text-decoration: none; }
        .th-sort .arrow { opacity: 0.6; font-size: 11px; }
        .th-sort.active { color: #fff; }
        .muted { color: rgba(255,255,255,0.55); }
        @media (max-width: 1100px) { .payments-filters { grid-template-columns: repeat(3, minmax(120px, 1fr)); } }
        @media (max-width: 680px) { .payments-filters { grid-template-columns: 1fr 1fr; } }
    </style>
</head>
<body>
    <div class="admin-header">
        <h1>Админка Riff Killer</h1>
        <nav class="admin-nav">
            <a href="?section=riffs" class="<?php echo $section === 'riffs' ? 'active' : ''; ?>">Риффы</a>
            <a href="?section=collections" class="<?php echo $section === 'collections' ? 'active' : ''; ?>">Коллекции</a>
            <a href="?section=promo" class="<?php echo $section === 'promo' ? 'active' : ''; ?>">Промокоды</a>
            <a href="?section=payments" class="<?php echo $section === 'payments' ? 'active' : ''; ?>">Платежи</a>
            <a href="?section=users" class="<?php echo $section === 'users' ? 'active' : ''; ?>">Пользователи</a>
            <a href="?section=emails" class="<?php echo $section === 'emails' ? 'active' : ''; ?>">Рассылки</a>
        </nav>
        <form method="post" style="display:inline;">
            <input type="hidden" name="action" value="logout">
            <button type="submit" class="btn">Выйти</button>
        </form>
    </div>

    <div class="admin-content">
        <?php if ($section === 'riffs'): ?>
        <iframe src="/admin/riffs.html" title="Риффы"></iframe>
        <?php elseif ($section === 'collections'): ?>
        <iframe src="/admin/collections.html" title="Коллекции"></iframe>
        <?php elseif ($section === 'payments'): ?>
        <section>
            <h2>Платежные события (единый лог)</h2>
            <div class="card">
                <form method="get" class="payments-actions">
                    <input type="hidden" name="section" value="payments">
                    <div class="payments-filters">
                        <select name="pay_source">
                            <option value="">Источник: все</option>
                            <?php foreach (['stripe','cryptomus','patreon','promo','test'] as $srcOpt): ?>
                            <option value="<?php echo $srcOpt; ?>" <?php echo $paySource === $srcOpt ? 'selected' : ''; ?>><?php echo strtoupper($srcOpt); ?></option>
                            <?php endforeach; ?>
                        </select>
                        <select name="pay_status">
                            <option value="">Статус: все</option>
                            <?php foreach (['active','cancelled','expired','used','received'] as $stOpt): ?>
                            <option value="<?php echo $stOpt; ?>" <?php echo $payStatus === $stOpt ? 'selected' : ''; ?>><?php echo $stOpt; ?></option>
                            <?php endforeach; ?>
                        </select>
                        <input type="date" name="pay_from" value="<?php echo htmlspecialchars($payFrom); ?>" title="От даты">
                        <input type="date" name="pay_to" value="<?php echo htmlspecialchars($payTo); ?>" title="До даты">
                        <input type="text" name="pay_q" value="<?php echo htmlspecialchars($payQ); ?>" placeholder="Поиск: user/ref/event">
                    </div>
                    <input type="hidden" name="pay_sort" value="<?php echo htmlspecialchars($paySort); ?>">
                    <input type="hidden" name="pay_dir" value="<?php echo htmlspecialchars($payDir); ?>">
                    <button type="submit" class="btn btn-primary">Применить</button>
                    <a class="btn" href="?section=payments">Сбросить</a>
                    <a class="btn" href="?section=payments&export=csv&pay_source=<?php echo urlencode($paySource); ?>&pay_status=<?php echo urlencode($payStatus); ?>&pay_from=<?php echo urlencode($payFrom); ?>&pay_to=<?php echo urlencode($payTo); ?>&pay_q=<?php echo urlencode($payQ); ?>&pay_sort=<?php echo urlencode($paySort); ?>&pay_dir=<?php echo urlencode($payDir); ?>">Экспорт CSV</a>
                </form>
                <div class="payments-summary">Показано: <?php echo count($paymentsFiltered); ?> из <?php echo count($payments); ?></div>
                <table>
                    <thead>
                        <tr>
                            <?php
                            $baseQs = 'section=payments&pay_source=' . urlencode($paySource) . '&pay_status=' . urlencode($payStatus) . '&pay_from=' . urlencode($payFrom) . '&pay_to=' . urlencode($payTo) . '&pay_q=' . urlencode($payQ);
                            $sortLink = function($key, $label) use ($paySort, $payDir, $baseQs) {
                                $nextDir = ($paySort === $key && $payDir === 'asc') ? 'desc' : 'asc';
                                $active = $paySort === $key;
                                $arrow = $active ? ($payDir === 'asc' ? '▲' : '▼') : '↕';
                                $cls = 'th-sort' . ($active ? ' active' : '');
                                return '<a class="' . $cls . '" href="?' . $baseQs . '&pay_sort=' . urlencode($key) . '&pay_dir=' . $nextDir . '">' . htmlspecialchars($label) . '<span class="arrow">' . $arrow . '</span></a>';
                            };
                            ?>
                            <th><?php echo $sortLink('ts', 'Время'); ?></th>
                            <th><?php echo $sortLink('event', 'Событие'); ?></th>
                            <th><?php echo $sortLink('source', 'Источник'); ?></th>
                            <th><?php echo $sortLink('user_id', 'User ID'); ?></th>
                            <th><?php echo $sortLink('plan', 'План'); ?></th>
                            <th><?php echo $sortLink('status', 'Статус'); ?></th>
                            <th><?php echo $sortLink('amount', 'Сумма'); ?></th>
                            <th><?php echo $sortLink('reference', 'Ref'); ?></th>
                            <th>Примечание</th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php foreach ($paymentsFiltered as $p): ?>
                        <tr>
                            <td><?php echo htmlspecialchars($p['ts'] ?? '-'); ?></td>
                            <td><?php echo htmlspecialchars($p['event'] ?? '-'); ?></td>
                            <td><?php echo htmlspecialchars($p['source'] ?? '-'); ?></td>
                            <td><code><?php echo htmlspecialchars($p['user_id'] ?? '-'); ?></code></td>
                            <td><?php echo htmlspecialchars($p['plan'] ?? '-'); ?></td>
                            <td><?php echo htmlspecialchars($p['status'] ?? '-'); ?></td>
                            <td><?php echo htmlspecialchars(trim(($p['amount'] ?? '') . ' ' . ($p['currency'] ?? '')) ?: '-'); ?></td>
                            <td><code><?php echo htmlspecialchars($p['reference'] ?? '-'); ?></code></td>
                            <td><?php echo htmlspecialchars($p['note'] ?? '-'); ?></td>
                        </tr>
                        <?php endforeach; ?>
                        <?php if (empty($paymentsFiltered)): ?>
                        <tr><td colspan="9">Пока нет событий в payments.log</td></tr>
                        <?php endif; ?>
                    </tbody>
                </table>
            </div>
        </section>
        <?php elseif ($section === 'users'): ?>
        <section>
            <h2>Пользователи</h2>
            <div class="card">
                <table>
                    <thead>
                        <tr>
                            <th>User ID</th>
                            <th>Email</th>
                            <th>Имя</th>
                            <th>Провайдер</th>
                            <th>Подписка</th>
                            <th>План</th>
                            <th>Источник оплаты</th>
                            <th>Created</th>
                            <th>Updated</th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php foreach (array_reverse($users) as $u):
                            $uid = (string)($u['id'] ?? '');
                            $sub = ($uid !== '' && isset($subsByUser[$uid])) ? $subsByUser[$uid] : null;
                            $subActive = $sub ? subscription_is_effectively_active($sub) : false;
                            $pref = isset($emailPrefs[strtolower((string)($u['email'] ?? ''))]) ? $emailPrefs[strtolower((string)($u['email'] ?? ''))] : null;
                        ?>
                        <tr>
                            <td><code><?php echo htmlspecialchars($uid ?: '-'); ?></code></td>
                            <td>
                                <?php echo htmlspecialchars($u['email'] ?? '-'); ?>
                                <div class="muted" style="font-size:12px;">
                                    marketing: <?php echo ($pref && array_key_exists('marketing_consent', $pref) && !$pref['marketing_consent']) ? 'unsubscribed' : 'subscribed'; ?>
                                </div>
                            </td>
                            <td><?php echo htmlspecialchars($u['name'] ?? '-'); ?></td>
                            <td><?php echo htmlspecialchars($u['provider'] ?? '-'); ?></td>
                            <td><?php echo $subActive ? '<span class="status-active">active</span>' : '<span class="muted">inactive</span>'; ?></td>
                            <td><?php echo htmlspecialchars($sub['plan'] ?? '-'); ?></td>
                            <td><?php echo htmlspecialchars($sub['source'] ?? '-'); ?></td>
                            <td><?php echo htmlspecialchars($u['created_at'] ?? '-'); ?></td>
                            <td><?php echo htmlspecialchars($u['updated_at'] ?? '-'); ?></td>
                        </tr>
                        <?php endforeach; ?>
                        <?php if (empty($users)): ?>
                        <tr><td colspan="9">Пользователей пока нет.</td></tr>
                        <?php endif; ?>
                    </tbody>
                </table>
            </div>
        </section>
        <?php elseif ($section === 'emails'): ?>
        <section>
            <h2>Email-рассылки</h2>
            <div class="card" style="margin-bottom:16px;">
                <h3 style="margin:0 0 12px;">Шаблоны писем (HTML/TXT)</h3>
                <form method="post">
                    <input type="hidden" name="action" value="save_email_template">
                    <div class="form-row">
                        <label>Template key</label>
                        <input name="template_key" id="templateKey" type="text" placeholder="welcome_campaign" value="<?php echo htmlspecialchars($activeTemplate['key'] ?? ''); ?>" style="width:260px;max-width:100%;">
                        <span class="muted" style="font-size:12px;">латиница/цифры/_</span>
                    </div>
                    <div class="form-row">
                        <label>Название</label>
                        <input name="template_name" id="templateName" type="text" placeholder="Welcome campaign" value="<?php echo htmlspecialchars($activeTemplate['name'] ?? ''); ?>" style="width:320px;max-width:100%;">
                    </div>
                    <div class="form-row">
                        <label>Subject</label>
                        <input name="template_subject" id="templateSubject" type="text" placeholder="Subject with {{user_name}}" value="<?php echo htmlspecialchars($activeTemplate['subject'] ?? ''); ?>" style="width:520px;max-width:100%;">
                    </div>
                    <div class="form-row" style="align-items:flex-start;">
                        <label>TXT</label>
                        <textarea name="template_text" id="templateText" rows="5" placeholder="Hello {{user_name}} ... {{unsubscribe_url}}" style="width:640px;max-width:100%;padding:10px 12px;border-radius:6px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.05);color:#fff;"><?php echo htmlspecialchars($activeTemplate['text'] ?? ''); ?></textarea>
                    </div>
                    <div class="form-row" style="align-items:flex-start;">
                        <label>HTML</label>
                        <textarea name="template_html" id="templateHtml" rows="8" placeholder="<h2>{{subject}}</h2><p>{{text_html}}</p><a href='{{unsubscribe_url}}'>Unsubscribe</a>" style="width:640px;max-width:100%;padding:10px 12px;border-radius:6px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.05);color:#fff;"><?php echo htmlspecialchars($activeTemplate['html'] ?? ''); ?></textarea>
                    </div>
                    <button type="submit" class="btn btn-primary">Сохранить шаблон</button>
                </form>
                <?php if ($activeTemplate): ?>
                <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">
                    <a class="btn" href="?section=emails&download_template=<?php echo urlencode($activeTemplate['key']); ?>">Экспорт JSON</a>
                    <form method="post" onsubmit="return confirm('Удалить шаблон?');" style="display:inline;">
                        <input type="hidden" name="action" value="delete_email_template">
                        <input type="hidden" name="template_key" value="<?php echo htmlspecialchars($activeTemplate['key']); ?>">
                        <button type="submit" class="btn">Удалить шаблон</button>
                    </form>
                </div>
                <?php endif; ?>
                <div style="margin-top:12px;border-top:1px solid rgba(255,255,255,0.1);padding-top:12px;">
                    <details>
                        <summary style="cursor:pointer;color:rgba(255,255,255,0.8);">Импорт шаблона из JSON</summary>
                        <form method="post" style="margin-top:10px;">
                            <input type="hidden" name="action" value="import_email_template">
                            <textarea name="template_json" rows="8" placeholder='{"key":"welcome","name":"Welcome","subject":"...","text":"...","html":"..."}' style="width:640px;max-width:100%;padding:10px 12px;border-radius:6px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.05);color:#fff;"></textarea>
                            <div style="margin-top:8px;"><button type="submit" class="btn">Импортировать</button></div>
                        </form>
                    </details>
                </div>
                <?php if (!empty($emailTemplates)): ?>
                <div style="margin-top:10px;">
                    <span class="muted">Готовые шаблоны:</span>
                    <?php foreach ($emailTemplates as $tk => $tv): ?>
                        <a href="?section=emails&tpl=<?php echo urlencode($tk); ?>" style="margin-left:8px;"><?php echo htmlspecialchars($tv['name'] ?: $tk); ?></a>
                    <?php endforeach; ?>
                </div>
                <?php endif; ?>
                <div class="muted" style="margin-top:10px;font-size:12px;">
                    Переменные: {{email}}, {{user_name}}, {{subject}}, {{text}}, {{text_html}}, {{unsubscribe_url}}, {{campaign_id}}, {{segment}}
                </div>
            </div>
            <div class="card" style="margin-bottom:16px;">
                <div class="form-row">
                    <label>Сегмент</label>
                    <select id="campaignSegment" style="padding:8px 12px;border-radius:6px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.05);color:#fff;">
                        <option value="all">all users</option>
                        <option value="active">active subscribers</option>
                        <option value="inactive">inactive users</option>
                    </select>
                </div>
                <div class="form-row">
                    <label>Шаблон</label>
                    <select id="campaignTemplate" style="padding:8px 12px;border-radius:6px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.05);color:#fff;">
                        <option value="">(без шаблона)</option>
                        <?php foreach ($emailTemplates as $tk => $tv): ?>
                        <option value="<?php echo htmlspecialchars($tk); ?>" <?php echo ($activeTemplate && ($activeTemplate['key'] ?? '') === $tk) ? 'selected' : ''; ?>><?php echo htmlspecialchars(($tv['name'] ?? '') !== '' ? $tv['name'] : $tk); ?></option>
                        <?php endforeach; ?>
                    </select>
                </div>
                <div class="form-row">
                    <label>Тема</label>
                    <input id="campaignSubject" type="text" placeholder="Subject" value="<?php echo htmlspecialchars($activeTemplate['subject'] ?? ''); ?>" style="width:420px;max-width:100%;">
                </div>
                <div class="form-row" style="align-items:flex-start;">
                    <label>Текст</label>
                    <textarea id="campaignText" rows="7" placeholder="Message text..." style="width:640px;max-width:100%;padding:10px 12px;border-radius:6px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.05);color:#fff;"><?php echo htmlspecialchars($activeTemplate['text'] ?? ''); ?></textarea>
                </div>
                <button type="button" class="btn btn-primary" id="btnSendCampaign">Отправить кампанию</button>
                <div id="campaignResult" class="muted" style="margin-top:10px;"></div>
                <div class="muted" style="margin-top:10px;font-size:12px;">
                    Требуются ENV: RESEND_API_KEY, RESEND_FROM_EMAIL.
                </div>
            </div>

            <div class="card">
                <h3 style="margin:0 0 12px;">Лог email-кампаний</h3>
                <table>
                    <thead>
                        <tr>
                            <th>Время</th>
                            <th>Событие</th>
                            <th>Campaign ID</th>
                            <th>Email</th>
                            <th>Segment</th>
                            <th>Status</th>
                            <th>Provider</th>
                            <th>Note</th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php foreach ($emailCampaigns as $e): ?>
                        <tr>
                            <td><?php echo htmlspecialchars($e['ts'] ?? '-'); ?></td>
                            <td><?php echo htmlspecialchars($e['event'] ?? '-'); ?></td>
                            <td><code><?php echo htmlspecialchars($e['campaign_id'] ?? '-'); ?></code></td>
                            <td><?php echo htmlspecialchars($e['email'] ?? '-'); ?></td>
                            <td><?php echo htmlspecialchars($e['segment'] ?? '-'); ?></td>
                            <td><?php echo htmlspecialchars($e['status'] ?? '-'); ?></td>
                            <td><?php echo htmlspecialchars($e['provider'] ?? '-'); ?></td>
                            <td><?php echo htmlspecialchars($e['note'] ?? '-'); ?></td>
                        </tr>
                        <?php endforeach; ?>
                        <?php if (empty($emailCampaigns)): ?>
                        <tr><td colspan="8">Пока нет событий email-кампаний.</td></tr>
                        <?php endif; ?>
                    </tbody>
                </table>
            </div>
        </section>
        <?php else: ?>
        <section>
            <h2>Создать промокод</h2>
            <div class="card">
                <form method="post">
                    <input type="hidden" name="action" value="generate_promo">
                    <div class="form-row">
                        <label>Срок (дней)</label>
                        <input type="number" name="expires_days" value="0" min="0" placeholder="0 = бессрочно">
                    </div>
                    <div class="form-row">
                        <label>Ограничение домена</label>
                        <input type="text" name="domain_limit" placeholder="gmail.com, yandex.ru">
                    </div>
                    <button type="submit" class="btn btn-primary">Создать</button>
                </form>
                <?php if ($newCode): ?>
                <div class="new-code">
                    Код: <strong id="newCodeText"><?php echo htmlspecialchars($newCode); ?></strong>
                    <button type="button" class="btn-copy" data-code="<?php echo htmlspecialchars($newCode); ?>" onclick="copyPromo(this.dataset.code, this)" title="Скопировать">📋</button>
                    — Скопируйте сейчас, в списке ниже тоже можно копировать.
                </div>
                <?php endif; ?>
            </div>
        </section>

        <section>
            <h2>Промокоды</h2>
            <div class="card">
                <table>
                    <thead>
                        <tr>
                            <th>Код</th>
                            <th>Комментарий</th>
                            <th>Создан</th>
                            <th>Истекает</th>
                            <th>Использован</th>
                            <th>Статус</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php foreach (array_reverse($codes) as $c):
                            $fullCode = $c['code'] ?? null;
                            $displayCode = $fullCode ?: ('RK-****' . ($c['suffix'] ?? ''));
                            $canCopy = (bool)$fullCode;
                        ?>
                        <tr data-hash="<?php echo htmlspecialchars($c['hash'] ?? ''); ?>">
                            <td class="code-cell">
                                <code><?php echo htmlspecialchars($displayCode); ?></code>
                                <?php if ($canCopy): ?>
                                <button type="button" class="btn-copy" data-code="<?php echo htmlspecialchars($fullCode); ?>" onclick="copyPromo(this.dataset.code, this)" title="Скопировать">📋</button>
                                <?php else: ?>
                                <span class="no-copy" title="Старый код, полное значение не сохранено">—</span>
                                <?php endif; ?>
                            </td>
                            <td class="comment-cell">
                                <span class="comment-text"><?php echo htmlspecialchars($c['comment'] ?? ''); ?></span>
                                <button type="button" class="btn-edit-comment" onclick="editComment(this)" title="Редактировать">✏️</button>
                                <span class="comment-edit" style="display:none;">
                                    <input type="text" class="comment-input" placeholder="Кому, для чего…" value="<?php echo htmlspecialchars($c['comment'] ?? ''); ?>">
                                    <button type="button" class="btn-save-comment" onclick="saveComment(this)">✓</button>
                                    <button type="button" class="btn-cancel-comment" onclick="cancelComment(this)">✕</button>
                                </span>
                            </td>
                            <td><?php echo htmlspecialchars($c['created_at'] ?? '-'); ?></td>
                            <td><?php echo isset($c['expires_at']) && $c['expires_at'] ? date('Y-m-d', $c['expires_at']) : 'Никогда'; ?></td>
                            <td><?php echo htmlspecialchars($c['used_by_email'] ?? $c['used_by'] ?? '-'); ?></td>
                            <td><span class="status-<?php echo $c['status'] ?? 'active'; ?>"><?php echo htmlspecialchars($c['status'] ?? 'active'); ?></span></td>
                            <td>
                                <?php if (($c['status'] ?? '') === 'active'): ?>
                                <form method="post" style="display:inline;">
                                    <input type="hidden" name="action" value="revoke">
                                    <input type="hidden" name="hash" value="<?php echo htmlspecialchars($c['hash'] ?? ''); ?>">
                                    <button type="submit" class="btn" onclick="return confirm('Отозвать код?');">Отозвать</button>
                                </form>
                                <?php endif; ?>
                            </td>
                        </tr>
                        <?php endforeach; ?>
                        <?php if (empty($codes)): ?>
                        <tr><td colspan="7">Промокодов пока нет.</td></tr>
                        <?php endif; ?>
                    </tbody>
                </table>
            </div>
        </section>

        <section>
            <h2>Тестовый доступ</h2>
            <div class="card">
                <p style="margin:0 0 12px;">Одноразовая ссылка для полного премиум-доступа (без Patreon/Stripe).</p>
                <button type="button" class="btn btn-primary" id="btnTestAccount">Создать тестовую ссылку</button>
                <div id="testLinkResult" style="margin-top:16px;padding:16px;background:rgba(147,85,229,0.2);border-radius:8px;display:none;word-break:break-all;"></div>
            </div>
        </section>

        <script>
            function copyPromo(code, btn) {
                navigator.clipboard.writeText(code).then(function() {
                    if (btn) { btn.textContent = '✓'; btn.classList.add('copied'); setTimeout(function(){ btn.textContent = '📋'; btn.classList.remove('copied'); }, 1500); }
                });
            }
            function editComment(btn) {
                var cell = btn.closest('.comment-cell');
                cell.querySelector('.comment-text').style.display = 'none';
                btn.style.display = 'none';
                cell.querySelector('.comment-edit').style.display = 'flex';
                cell.querySelector('.comment-input').focus();
            }
            function cancelComment(btn) {
                var cell = btn.closest('.comment-cell');
                cell.querySelector('.comment-edit').style.display = 'none';
                cell.querySelector('.comment-text').style.display = '';
                cell.querySelector('.btn-edit-comment').style.display = '';
                cell.querySelector('.comment-input').value = cell.querySelector('.comment-text').textContent;
            }
            function saveComment(btn) {
                var row = btn.closest('tr');
                var hash = row.dataset.hash;
                var input = row.querySelector('.comment-input');
                var val = input.value.trim();
                var textEl = row.querySelector('.comment-text');
                var formData = new FormData();
                formData.set('action', 'update_comment');
                formData.set('hash', hash);
                formData.set('comment', val);
                fetch('index.php', { method: 'POST', body: formData })
                    .then(function(r){ return r.json(); })
                    .then(function(d){
                        if (d.success) {
                            textEl.textContent = val;
                            textEl.style.display = '';
                            row.querySelector('.btn-edit-comment').style.display = '';
                            row.querySelector('.comment-edit').style.display = 'none';
                        }
                    });
            }
            document.getElementById('btnTestAccount').addEventListener('click', function() {
                const btn = this;
                btn.disabled = true;
                const formData = new FormData();
                formData.set('action', 'create_test');
                fetch('index.php', { method: 'POST', body: formData })
                    .then(r => r.json())
                    .then(data => {
                        btn.disabled = false;
                        const el = document.getElementById('testLinkResult');
                        if (data.success) {
                            el.innerHTML = '<strong>Ссылка:</strong><br><a href="' + data.login_url + '" target="_blank">' + data.login_url + '</a>';
                            el.style.display = 'block';
                        } else {
                            el.innerHTML = 'Ошибка: ' + (data.error || 'Unknown');
                            el.style.display = 'block';
                        }
                    })
                    .catch(e => {
                        btn.disabled = false;
                        document.getElementById('testLinkResult').innerHTML = 'Ошибка сети';
                        document.getElementById('testLinkResult').style.display = 'block';
                    });
            });

            var sendBtn = document.getElementById('btnSendCampaign');
            if (sendBtn) {
                sendBtn.addEventListener('click', function() {
                    var segment = (document.getElementById('campaignSegment') || {}).value || 'all';
                    var templateKey = (document.getElementById('campaignTemplate') || {}).value || '';
                    var subject = (document.getElementById('campaignSubject') || {}).value || '';
                    var text = (document.getElementById('campaignText') || {}).value || '';
                    var out = document.getElementById('campaignResult');
                    sendBtn.disabled = true;
                    if (out) out.textContent = 'Sending...';
                    fetch('/api/admin/send-campaign.php', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ segment: segment, template_key: templateKey, subject: subject, text: text })
                    })
                    .then(function(r){ return r.json(); })
                    .then(function(d){
                        sendBtn.disabled = false;
                        if (out) {
                            if (d.success) out.textContent = 'Campaign ' + d.campaign_id + ': sent=' + d.sent + ', failed=' + d.failed + ', skipped=' + d.skipped + ' (targets=' + d.targets + ')';
                            else out.textContent = 'Error: ' + (d.error || 'unknown');
                        }
                    })
                    .catch(function(){
                        sendBtn.disabled = false;
                        if (out) out.textContent = 'Network error.';
                    });
                });
            }
        </script>
        <?php endif; ?>
    </div>
</body>
</html>
