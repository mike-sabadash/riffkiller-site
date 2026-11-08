<?php
/**
 * Agent tool, runs on the server over SSH (.github/workflows/funnel-report.yml):
 *   php funnel-report.php <site root>  → JSON on stdout with AGGREGATE numbers only (no emails, names, IPs, ids).
 * Sources: data/users.json, data/progress/*, data/drops.json, data/subscriptions*, data/stats/ (own page counters)
 * and the nginx access logs of riffkiller.fun (visitors = IP + user agent, kept in memory only, never printed).
 */
error_reporting(E_ALL & ~E_DEPRECATED & ~E_NOTICE & ~E_WARNING);
$root = rtrim($argv[1] ?? '', '/');
if ($root === '') {
    $found = array_values(array_filter(array_merge(glob('/var/www/*/practice.html') ?: [], glob('/var/www/*/*/practice.html') ?: [], glob('/srv/*/practice.html') ?: [], glob('/srv/*/*/practice.html') ?: []),
        function ($f) { return !preg_match('/backup|release/', $f); }));
    if (count($found) === 1) $root = dirname($found[0]);
}
if ($root === '' || !is_file("$root/practice.html")) { fwrite(STDERR, "bad root\n"); exit(1); }
$out = ['generatedAt' => gmdate('c')];

function jload($f) { $d = json_decode((string)@file_get_contents($f), true); return is_array($d) ? $d : null; }
function day_of($ts) { return $ts ? gmdate('Y-m-d', is_numeric($ts) ? (int)($ts > 2e10 ? $ts / 1000 : $ts) : strtotime((string)$ts)) : ''; }
function tsec($ts) { if (!$ts) return 0; return is_numeric($ts) ? (int)($ts > 2e10 ? $ts / 1000 : $ts) : (int)strtotime((string)$ts); }

/* ---------- Accounts ---------- */
$users = jload("$root/data/users.json") ?? [];
if (isset($users['users']) && is_array($users['users'])) $users = $users['users'];
$admins = [];
foreach (['ADMIN_EMAILS', 'ADMIN_EMAIL'] as $k) foreach (preg_split('/[\s,;]+/', (string)getenv($k)) as $e) if ($e) $admins[strtolower($e)] = 1;
$acc = ['total' => 0, 'byProvider' => [], 'byWeek' => [], 'byDay' => [], 'consentHow' => [], 'withPassword' => 0,
        'fieldsSeen' => [], 'practiced' => 0, 'practiceDays1' => 0, 'practiceDays2plus' => 0, 'returnedAfterSignupDay' => 0,
        'active7d' => 0, 'active30d' => 0, 'noProgressFile' => 0, 'favorites' => 0, 'emailOptIn' => 0, 'goalSet' => 0,
        'testLike' => 0, 'createdLast7d' => 0, 'createdLast30d' => 0];
$now = time();
foreach ($users as $u) {
    if (!is_array($u)) continue;
    $email = strtolower((string)($u['email'] ?? ''));
    if (preg_match('/(^test|\+test|example\.|@test\.|riffkiller\.fun$)/', $email)) { $acc['testLike']++; }
    foreach (array_keys($u) as $f) $acc['fieldsSeen'][$f] = ($acc['fieldsSeen'][$f] ?? 0) + 1;
    $acc['total']++;
    $p = (string)($u['provider'] ?? 'email'); $p = $p === '' ? 'email' : $p;
    $acc['byProvider'][$p] = ($acc['byProvider'][$p] ?? 0) + 1;
    if (!empty($u['password']) || !empty($u['password_hash'])) $acc['withPassword']++;
    $created = tsec($u['created_at'] ?? $u['createdAt'] ?? $u['created'] ?? 0);
    if ($created) {
        $w = gmdate('o-\WW', $created); $acc['byWeek'][$w] = ($acc['byWeek'][$w] ?? 0) + 1;
        if ($now - $created < 45 * 86400) { $d = gmdate('Y-m-d', $created); $acc['byDay'][$d] = ($acc['byDay'][$d] ?? 0) + 1; }
        if ($now - $created < 7 * 86400) $acc['createdLast7d']++;
        if ($now - $created < 30 * 86400) $acc['createdLast30d']++;
    }
    $how = is_array($u['consent'] ?? null) ? (string)($u['consent']['how'] ?? '?') . '@' . (string)($u['consent']['version'] ?? '?') : 'none';
    $acc['consentHow'][$how] = ($acc['consentHow'][$how] ?? 0) + 1;
    // Progress (data/progress/<sha256(id)>.json)
    $pf = "$root/data/progress/" . hash('sha256', (string)($u['id'] ?? '')) . '.json';
    $pr = is_file($pf) ? jload($pf) : null;
    if (!$pr) { $acc['noProgressFile']++; continue; }
    $doc = isset($pr['progress']) && is_array($pr['progress']) ? $pr['progress'] : $pr;
    $days = [];
    foreach ((array)($doc['days'] ?? []) as $k => $d) if ((float)($d['sec'] ?? 0) > 0) $days[] = (string)$k;
    if ($days) $acc['practiced']++;
    if (count($days) === 1) $acc['practiceDays1']++;
    if (count($days) >= 2) $acc['practiceDays2plus']++;
    $signupDay = $created ? gmdate('Y-m-d', $created) : '';
    $later = array_filter($days, function ($d) use ($signupDay) { return $signupDay !== '' && $d > $signupDay; });
    $upd = tsec($doc['updatedAt'] ?? 0) ?: filemtime($pf);
    if ($later || ($created && $upd - $created > 86400)) $acc['returnedAfterSignupDay']++;
    if ($now - $upd < 7 * 86400) $acc['active7d']++;
    if ($now - $upd < 30 * 86400) $acc['active30d']++;
    if (!empty($doc['fav']) && count(array_filter((array)$doc['fav'])) > 0) $acc['favorites']++;
    if (!empty($doc['email'])) $acc['emailOptIn']++;
    if (!empty($doc['goal'])) $acc['goalSet']++;
}
ksort($acc['byWeek']); ksort($acc['byDay']);
$acc['adminConfigured'] = count($admins);
$out['accounts'] = $acc;

/* ---------- Subscriptions (counts only) ---------- */
$subs = [];
foreach (glob("$root/data/subscriptions/*.json") ?: [] as $f) {
    $row = jload($f); if (!$row) continue;
    $exp = tsec($row['expires_at'] ?? $row['expiresAt'] ?? $row['current_period_end'] ?? $row['until'] ?? 0);
    $src = (string)($row['source'] ?? $row['provider'] ?? $row['method'] ?? '?');
    $k = $src . ($exp > $now || ($row['status'] ?? '') === 'active' ? ':active' : ':inactive');
    $subs[$k] = ($subs[$k] ?? 0) + 1;
}
$out['subscriptions'] = $subs;
$out['waitlist'] = is_file("$root/data/landing-waitlist.json") ? count((array)jload("$root/data/landing-waitlist.json")) : null;

/* ---------- Teaser links ---------- */
$riffs = jload("$root/data/riffs.json") ?? [];
$keyToSong = [];
foreach ($riffs as $r) if (is_array($r) && !empty($r['dropKey'])) $keyToSong[strtolower($r['dropKey'])] = ($r['song'] ?? '?') . ' #' . ($r['id'] ?? '?');
$drops = jload("$root/data/drops.json") ?? [];
$dr = [];
foreach ($drops as $k => $row) $dr[] = ['riff' => $keyToSong[$k] ?? '(old key)', 'opens' => (int)($row['opens'] ?? 0), 'signups' => (int)($row['signups'] ?? 0), 'lastOpen' => $row['lastOpen'] ?? null];
$out['drops'] = $dr;
$out['riffs'] = array_values(array_map(function ($r) { return ['id' => $r['id'] ?? null, 'song' => $r['song'] ?? '', 'free' => !empty($r['isFree']), 'lock' => $r['lock'] ?? '', 'hidden' => !empty($r['hidden']), 'drop' => !empty($r['dropKey']), 'parts' => count((array)($r['segments'] ?? []))]; }, array_filter((array)$riffs, 'is_array')));

/* ---------- Own page counters (data/stats/, added 2026-11) ---------- */
$st = [];
foreach (glob("$root/data/stats/*.json") ?: [] as $f) { $st[basename($f, '.json')] = jload($f); }
ksort($st);
$out['ownCounters'] = $st;

/* ---------- nginx access logs ---------- */
$logFiles = []; $confHits = [];
foreach (array_merge(glob('/etc/nginx/sites-enabled/*') ?: [], glob('/etc/nginx/conf.d/*.conf') ?: []) as $cf) {
    $c = (string)@file_get_contents($cf);
    if (stripos($c, 'riffkiller.fun') === false) continue;
    if (preg_match_all('/access_log\s+([^\s;]+)/', $c, $m)) foreach ($m[1] as $p) if ($p !== 'off') $confHits[$p] = basename($cf);
}
foreach (array_keys($confHits) as $p) foreach (glob($p . '*') ?: [] as $f) $logFiles[$f] = 1;
$sharedLog = false;
if (getenv('FUNNEL_LOGS')) foreach (glob(getenv('FUNNEL_LOGS')) ?: [] as $f) $logFiles[$f] = 1;
if (!$logFiles) { foreach (glob('/var/log/nginx/access.log*') ?: [] as $f) $logFiles[$f] = 1; $sharedLog = true; }
$logFiles = array_keys($logFiles);
$out['logs'] = ['configured' => $confHits, 'files' => array_map('basename', $logFiles), 'sharedDefaultLog' => $sharedLog];

$bot = '/bot|crawl|spider|slurp|preview|facebookexternalhit|meta-externalagent|curl|wget|python|go-http|httpclient|headless|lighthouse|monitor|uptime|scan|okhttp|java\/|node-fetch|axios|libwww|feed|whatsapp|telegrambot|vkshare|yandex(?!browser)|bingpreview|petalbot|semrush|ahrefs|mj12|dotbot|gptbot|claude|ccbot|bytespider|applebot|discordbot|twitterbot|linkedinbot|skypeuri|zgrab|masscan|nuclei|github-actions/i';
$V = []; // visitor key => info
$daily = [];
$minT = PHP_INT_MAX; $maxT = 0; $lines = 0; $parsed = 0; $hostOk = 0;
$re = '/^(\S+) \S+ \S+ \[([^\]]+)\] "(\S+) (\S+) [^"]*" (\d{3}) \S+ "([^"]*)" "([^"]*)"(?: "?([^" ]*)"?)?/';
foreach ($logFiles as $f) {
    $h = substr($f, -3) === '.gz' ? gzopen($f, 'r') : fopen($f, 'r');
    if (!$h) continue;
    while (($line = (substr($f, -3) === '.gz' ? gzgets($h) : fgets($h))) !== false) {
        $lines++;
        if (!preg_match($re, $line, $m)) continue;
        [$all, $ip, $date, $meth, $url, $status, $ref, $ua] = $m;
        $parsed++;
        $path = strtolower(parse_url($url, PHP_URL_PATH) ?: '/');
        $q = (string)parse_url($url, PHP_URL_QUERY);
        if (preg_match($bot, $ua) || $ua === '-' || $ua === '') continue;
        if (strpos($path, '/admin') === 0 || strpos($path, '/api/admin') === 0) { $V[sha1($ip . '|' . $ua)]['admin'] = 1; continue; }
        $t = strtotime(str_replace('/', ' ', preg_replace('/:/', ' ', $date, 1)));
        if (!$t) continue;
        $minT = min($minT, $t); $maxT = max($maxT, $t);
        $d = gmdate('Y-m-d', $t);
        $key = sha1($ip . '|' . $ua);
        $v = &$V[$key];
        if (!isset($v['first'])) { $v['first'] = $t; $v['days'] = []; $v['dev'] = preg_match('/iphone|ipad/i', $ua) ? 'ios' : (preg_match('/android/i', $ua) ? 'android' : 'desktop'); $v['inapp'] = preg_match('/instagram|fban|fbav|fb_iab/i', $ua) ? 1 : 0; }
        $v['first'] = min($v['first'], $t);
        $ok = $status < 400;
        $page = null;
        // The log is shared by every site on the server and has no host: "/" may be another site. The library counts
        // when its page script asks for the riff list (referer = riffkiller.fun page), which also leaves bots out.
        $refHost = strtolower((string)parse_url($ref, PHP_URL_HOST));
        $refPath = strtolower((string)parse_url($ref, PHP_URL_PATH) ?: '/');
        if ($meth === 'GET' && $ok && $path === '/api/riffs/list.php' && preg_match('/(^|\.)riffkiller\.fun$/', $refHost)) {
            if ($refPath === '/' || $refPath === '/index.html' || $refPath === '/app.html') $page = 'library';
        } elseif ($meth === 'GET' && $ok) {
            if ($path === '/' || $path === '/index.html' || $path === '/app.html') $page = null;
            elseif ($path === '/landing.html') $page = 'landing';
            elseif ($path === '/practice.html') $page = strpos($q, 'drop=') !== false ? 'practiceDrop' : 'practice';
            elseif (strpos($path, '/drop') === 0) $page = 'drop';
            elseif ($path === '/collection.html') $page = 'collection';
            elseif ($path === '/profile.html') $page = 'profile';
            elseif (strpos($path, '/billing') === 0) $page = 'billing';
            elseif (in_array($path, ['/terms.html', '/privacy.html', '/consent.html'], true)) $page = 'legal';
            elseif (strpos($path, '/assets/video/') === 0 || $path === '/video.php') $page = 'video';
        }
        if (strpos($path, '/api/auth/email-register.php') === 0 && $meth === 'POST') $page = $ok ? 'regEmailOk' : 'regEmailFail';
        elseif (strpos($path, '/api/auth/email-login.php') === 0 && $meth === 'POST') $page = $ok ? 'loginEmailOk' : 'loginEmailFail';
        elseif (strpos($path, '/api/auth/magic-request.php') === 0) $page = 'magicRequest';
        elseif (strpos($path, '/api/auth/magic-verify.php') === 0) $page = 'magicVerify';
        elseif (strpos($path, '/api/auth/google-login.php') === 0) $page = 'googleStart';
        elseif (strpos($path, '/api/auth/google-callback.php') === 0) $page = 'googleBack';
        elseif (strpos($path, '/api/auth/yandex-login.php') === 0) $page = 'yandexStart';
        elseif (strpos($path, '/api/auth/yandex-callback.php') === 0) $page = 'yandexBack';
        elseif (strpos($path, '/patreon-callback.html') === 0) $page = 'patreonBack';
        elseif (strpos($path, '/patreon-exchange.php') === 0) $page = 'patreonExchange';
        elseif (strpos($path, '/api/progress.php') === 0 && $meth === 'POST' && $ok) $page = 'progressSave';
        elseif (strpos($path, '/api/riffs/drop.php') === 0 && $meth === 'POST') $page = 'dropSignupPing';
        elseif (strpos($path, '/api/me.php') === 0) $page = 'me';
        if ($ref !== '-' && $refHost !== '' && strpos($refHost, 'riffkiller.fun') === false && !isset($v['extref'])) $v['extref'] = $refHost;
        if ($page === null) continue;
        $v['days'][$d] = 1;
        $v['p'][$page] = ($v['p'][$page] ?? 0) + 1;
        $v['pd'][$page][$d] = 1;
        if (in_array($page, ['library', 'landing', 'practice', 'practiceDrop', 'drop'], true)) {
            if (!isset($v['entry'])) { $v['entry'] = $page; $v['entryT'] = $t; }
            elseif ($t < $v['entryT']) { $v['entry'] = $page; $v['entryT'] = $t; }
            $hst = $refHost !== '' && strpos($refHost, 'riffkiller.fun') === false ? $refHost : (string)($v['extref'] ?? '');
            if ($hst !== '' && !isset($v['ref'])) {
                $v['ref'] = preg_match('/instagram/', $hst) ? 'instagram' : (preg_match('/facebook|fb\.com/', $hst) ? 'facebook' : (preg_match('/youtube|youtu\.be/', $hst) ? 'youtube' : (preg_match('/patreon/', $hst) ? 'patreon' : (preg_match('/google\./', $hst) ? 'google' : (preg_match('/tiktok/', $hst) ? 'tiktok' : (preg_match('/t\.co$|twitter|x\.com/', $hst) ? 'x' : 'other'))))));
            }
        }
        $daily[$d][$page][$key] = 1;
        unset($v);
    }
    unset($v);
    substr($f, -3) === '.gz' ? gzclose($h) : fclose($h);
}
$range = $maxT ? ['from' => gmdate('c', $minT), 'to' => gmdate('c', $maxT)] : null;
$visitors = array_filter($V, function ($v) { return empty($v['admin']) && !empty($v['p']); });
$has = function ($v, ...$pages) { foreach ($pages as $p) if (!empty($v['p'][$p])) return true; return false; };
$sum = ['visitors' => count($visitors), 'byDevice' => [], 'inAppBrowser' => 0, 'byEntry' => [], 'byRef' => [], 'pages' => [], 'funnel' => [], 'byEntryFunnel' => []];
foreach ($visitors as $v) {
    $sum['byDevice'][$v['dev']] = ($sum['byDevice'][$v['dev']] ?? 0) + 1;
    $sum['inAppBrowser'] += $v['inapp'];
    $e = $v['entry'] ?? 'apiOnly'; $sum['byEntry'][$e] = ($sum['byEntry'][$e] ?? 0) + 1;
    $r = $v['ref'] ?? 'direct/none'; $sum['byRef'][$r] = ($sum['byRef'][$r] ?? 0) + 1;
    foreach ($v['p'] as $p => $n) { $sum['pages'][$p]['visitors'] = ($sum['pages'][$p]['visitors'] ?? 0) + 1; $sum['pages'][$p]['hits'] = ($sum['pages'][$p]['hits'] ?? 0) + $n; }
    $steps = [
        'any page' => $has($v, 'library', 'landing', 'practice', 'practiceDrop', 'drop'),
        'practice opened' => $has($v, 'practice', 'practiceDrop'),
        'video loaded' => $has($v, 'video'),
        'auth started' => $has($v, 'regEmailOk', 'regEmailFail', 'loginEmailOk', 'loginEmailFail', 'magicRequest', 'googleStart', 'yandexStart', 'patreonBack'),
        'registered/logged in' => $has($v, 'regEmailOk', 'loginEmailOk', 'magicVerify', 'googleBack', 'yandexBack', 'patreonExchange'),
        'progress saved (signed in)' => $has($v, 'progressSave'),
        'came back another day' => count($v['days']) >= 2,
    ];
    foreach ($steps as $s => $yes) if ($yes) $sum['funnel'][$s] = ($sum['funnel'][$s] ?? 0) + 1;
    foreach ($steps as $s => $yes) if ($yes) $sum['byEntryFunnel'][$e][$s] = ($sum['byEntryFunnel'][$e][$s] ?? 0) + 1;
    $dev = $v['dev']; foreach ($steps as $s => $yes) if ($yes) $sum['byDeviceFunnel'][$dev][$s] = ($sum['byDeviceFunnel'][$dev][$s] ?? 0) + 1;
    if (!empty($v['inapp'])) foreach ($steps as $s => $yes) if ($yes) $sum['inAppFunnel'][$s] = ($sum['inAppFunnel'][$s] ?? 0) + 1;
}
arsort($sum['byRef']); arsort($sum['byEntry']);
ksort($daily);
$adminKeys = array_filter($V, function ($v) { return !empty($v['admin']); });
$dd = [];
foreach ($daily as $d => $pages) foreach ($pages as $p => $ks) $dd[$d][$p] = count(array_diff_key($ks, $adminKeys));
$out['access'] = ['range' => $range, 'lines' => $lines, 'parsed' => $parsed, 'summary' => $sum, 'dailyUniqueVisitors' => $dd];
echo json_encode($out, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), "\n";
