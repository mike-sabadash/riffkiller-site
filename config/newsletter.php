<?php
/**
 * Newsletter to signed-up students (Mike's decision 08.11.2026, docs/NEWSLETTER.md).
 *
 * Pattern: Steam wishlist emails (one email on release day, a cooldown, every type switched off on its own),
 * Patreon's per-type switches, and a frequency cap from the Baymard / Litmus surveys (people like "no more than
 * once a week" and call more than three a week too many).
 *
 *   topics    drops     — new riffs and the "Free this week" riff: one email on release day (Friday);
 *             headsup   — a heads-up 2 days before a scheduled riff comes out;
 *             community — votes and challenges (a block in the Friday email, or an email from the admin);
 *             offers    — offers and new products, at most one in NL_OFFERS_GAP_DAYS days.
 *   consent   only an explicit, separate opt-in (sign-up box, the card for older accounts, the profile, the emails
 *             page). The consent to the Terms/Privacy at sign-up does not count. Nothing is pre-ticked.
 *   cap       one email a day and at most NL_WEEK_CAP a week (Monday–Sunday in the reader's zone), of which at most
 *             one is not a release-day email; whatever does not fit is dropped, like Steam drops a late wishlist email.
 *             A week with an offer on Monday therefore loses its Wednesday heads-up, never its Friday email.
 *   timing    from NL_HOUR in the reader's own time zone (the zone the practice progress keeps), on the day or the
 *             day after; never later.
 *   release   a riff with the «Soon» padlock and a release date opens by itself that day at NL_RELEASE_HOUR Moscow
 *             time if it is ready (video, parts, cover); otherwise it stays closed, no email goes, and an alert is
 *             written for Mike (admin page, Funnel report, alert email if set).
 *   counting  our own totals only (config/site-stats.php, data/newsletter-sent.json): sent, clicks through
 *             api/newsletter/go.php, unsubscribes, complaints. No pixels, no open tracking, no third-party trackers.
 *
 * Files in data/ (never in git):
 *   newsletter.json            { userId: { topics:{...}, consent:{at,how,version}, asked, updatedAt } }
 *   newsletter-log.json        { userId: [ { k, d (local date), at, topic, skip? } ] }  — last 60 days
 *   newsletter-sent.json       { key: { subject, topic, sent, failed, skipped, unsub, clicks, firstAt } }
 *   newsletter-campaigns.json  [ { id, topic, date, subject, text, button, url, createdAt } ]  (admin)
 *   newsletter-polls.json      { polls: [ { id, question, options[], from, until } ], votes: { id: { hash: index } } }
 *   newsletter-alerts.json     [ { at, key, kind, text } ]
 *   newsletter-settings.json   { alertEmail }
 */
require_once __DIR__ . '/progress-digest.php';
require_once __DIR__ . '/legal.php';
require_once __DIR__ . '/site-stats.php';
require_once __DIR__ . '/riff-access.php';
require_once __DIR__ . '/email-layout.php';
require_once __DIR__ . '/subscription-store.php';

const NL_TOPICS = ['drops', 'headsup', 'community', 'offers'];
const NL_HOUR = 18;
const NL_RELEASE_HOUR = 10;          // Moscow time
const NL_RELEASE_TZ = 'Europe/Moscow';
const NL_HEADSUP_DAYS = 2;
const NL_READY_CHECK_DAYS = 3;
const NL_WEEK_CAP = 2;               // all newsletter emails in one week
const NL_WEEK_EXTRA = 1;             // of them, emails that are not the release-day one
const NL_OFFERS_GAP_DAYS = 30;
const NL_START = '2026-11-09';        // accounts that agreed to older documents are asked once with a card on the site
const NL_UNSUB_ALERT_RATE = 0.02;

function nl_file($name) { return digest_root() . '/data/' . $name; }
function nl_load($name, $default) { return digest_load_json(nl_file($name), $default); }
function nl_save($name, $data) { return digest_save_json(nl_file($name), $data); }

function nl_token($userId) { return hash_hmac('sha256', 'newsletter|' . $userId, digest_secret()); }
function nl_token_ok($userId, $token) {
    return (string)$userId !== '' && (string)$token !== '' && hash_equals(nl_token((string)$userId), (string)$token);
}

function nl_count($event) { site_stats_count($event); }

/** Stats-safe form of a letter key ("drop-2026-11-13", "soon-10-2026-11-13", "c-ab12cd"). */
function nl_key_stat($key) {
    $key = strtolower(preg_replace('/[^a-z0-9_.-]+/i', '-', (string)$key));
    return substr(trim($key, '-'), 0, 29);
}

/* ---------- preferences ---------- */

function nl_empty_topics() { return array_fill_keys(NL_TOPICS, false); }

function nl_prefs($userId) {
    $all = nl_load('newsletter.json', []);
    $row = is_array($all[(string)$userId] ?? null) ? $all[(string)$userId] : [];
    $topics = nl_empty_topics();
    foreach (NL_TOPICS as $t) $topics[$t] = !empty($row['topics'][$t]);
    return ['topics' => $topics, 'consent' => $row['consent'] ?? null, 'asked' => (string)($row['asked'] ?? ''),
        'updatedAt' => $row['updatedAt'] ?? null];
}

function nl_any($prefs) { foreach (NL_TOPICS as $t) if (!empty($prefs['topics'][$t])) return true; return false; }

/**
 * Changes the switches given in $topics (others stay). $how: signup, card, profile, page, unsubscribe, complaint.
 * The first switch turned on keeps a consent record {at, how, version}; turning everything off keeps when.
 */
function nl_set_prefs($userId, $topics, $how, $asked = null) {
    $userId = (string)$userId;
    if ($userId === '') return null;
    $how = preg_match('/^[a-z_]{2,20}$/', (string)$how) ? (string)$how : 'other';
    $file = nl_file('newsletter.json');
    if (!is_dir(dirname($file))) @mkdir(dirname($file), 0755, true);
    $lock = @fopen($file . '.lock', 'c');
    if ($lock) flock($lock, LOCK_EX);
    $all = nl_load('newsletter.json', []);
    $before = nl_prefs($userId);
    $row = is_array($all[$userId] ?? null) ? $all[$userId] : [];
    $now = nl_empty_topics();
    foreach (NL_TOPICS as $t) $now[$t] = array_key_exists($t, (array)$topics) ? !empty($topics[$t]) : $before['topics'][$t];
    $row['topics'] = $now;
    $on = in_array(true, $now, true);
    if ($on && !nl_any($before)) {
        $row['consent'] = ['at' => date('c'), 'how' => $how, 'version' => LEGAL_VERSION];
        unset($row['withdrawnAt']);
        nl_count('mail_optin:' . $how);
    } elseif (!$on && nl_any($before)) {
        $row['withdrawnAt'] = date('c');
        nl_count('mail_optout:' . $how);
    }
    if ($asked !== null) $row['asked'] = (string)$asked;
    $row['updatedAt'] = date('c');
    $all[$userId] = $row;
    nl_save('newsletter.json', $all);
    if ($lock) { flock($lock, LOCK_UN); fclose($lock); }
    return nl_prefs($userId);
}

/** Should the site ask this account once with the card? Older accounts only; new ones had the box at sign-up. */
function nl_should_ask($user, $prefs) {
    if (!is_array($user) || nl_any($prefs) || $prefs['asked'] !== '') return false;
    // New accounts agree to the documents of 2026-11-09 or later and saw the newsletter box at sign-up.
    $version = (string)($user['consent']['version'] ?? '');
    return $version === '' || $version < NL_START;
}

/** Removes everything the newsletter keeps about an account (config/legal.php legal_delete_account). */
function nl_forget($userId) {
    $userId = (string)$userId;
    foreach (['newsletter.json', 'newsletter-log.json'] as $name) {
        $d = nl_load($name, []);
        if (isset($d[$userId])) { unset($d[$userId]); nl_save($name, $d); }
    }
    $polls = nl_load('newsletter-polls.json', []);
    $h = nl_voter($userId);
    $changed = false;
    foreach (($polls['votes'] ?? []) as $pid => $votes) if (isset($votes[$h])) { unset($polls['votes'][$pid][$h]); $changed = true; }
    if ($changed) nl_save('newsletter-polls.json', $polls);
}

function nl_voter($userId) { return substr(hash_hmac('sha256', 'voter|' . $userId, digest_secret()), 0, 20); }

/* ---------- riffs, release and readiness ---------- */

function nl_riffs() {
    $list = digest_load_json(digest_root() . '/data/riffs.json', []);
    return array_values(array_filter($list, 'is_array'));
}

function nl_song($riff) { return trim(preg_replace('/\s+/', ' ', (string)($riff['song'] ?? ''))); }
function nl_artist($riff) { return trim(preg_replace('/\s+/', ' ', (string)($riff['artist'] ?? ''))); }

/** What still keeps a riff from going out: [] when ready. A missing tab is only a warning (see nl_riff_warnings). */
function nl_riff_missing($riff) {
    $out = [];
    if (trim((string)($riff['videoFile'] ?? '')) === '') $out[] = 'нет видео';
    if (count(is_array($riff['segments'] ?? null) ? $riff['segments'] : []) < 2) $out[] = 'нет частей';
    $thumb = trim((string)($riff['thumbnail'] ?? ''));
    if ($thumb === '' || $thumb === 'assets/img/riff-1.png') $out[] = 'общая обложка';
    if (!empty($riff['hidden'])) $out[] = 'скрыт с сайта';
    return $out;
}

function nl_riff_warnings($riff) {
    $segs = is_array($riff['segments'] ?? null) ? $riff['segments'] : [];
    $hasTab = !empty($riff['tab']['file']) || !empty($riff['tab']['tex']);
    foreach ($segs as $s) if (!empty($s['tab'])) $hasTab = true;
    return $hasTab ? [] : ['нет таба'];
}

function nl_date_add($date, $days) { return gmdate('Y-m-d', strtotime($date . ' ' . ($days >= 0 ? '+' : '') . (int)$days . ' days UTC')); }

/** Riffs with the padlock and a release date: they open by themselves on that date. */
function nl_is_scheduled($riff) {
    return riff_lock($riff) === 'soon' && riff_date_normalize($riff['releasedAt'] ?? '') !== '';
}

function nl_alert($key, $kind, $text) {
    $alerts = nl_load('newsletter-alerts.json', []);
    foreach ($alerts as $a) if (($a['key'] ?? '') === $key) return false;
    $alerts[] = ['at' => date('c'), 'key' => $key, 'kind' => $kind, 'text' => $text];
    nl_save('newsletter-alerts.json', array_slice($alerts, -50));
    $to = trim((string)(nl_load('newsletter-settings.json', [])['alertEmail'] ?? ''));
    if ($to !== '' && filter_var($to, FILTER_VALIDATE_EMAIL) && empty($GLOBALS['NL_NO_ALERT_MAIL'])) {
        $mail = ['subject' => 'Riff Killer: ' . $text, 'text' => $text . "\n\nhttps://riffkiller.fun/admin/newsletter.html", 'html' => '<p>' . htmlspecialchars($text) . '</p><p><a href="' . digest_base_url() . '/admin/newsletter.html">Рассылка в админке</a></p>'];
        nl_send_resend($to, $mail, null, 'alert');
    }
    return true;
}

/**
 * Opens scheduled riffs at NL_RELEASE_HOUR Moscow time on their date (or the day after, if the cron missed it),
 * and warns NL_READY_CHECK_DAYS ahead when a scheduled riff is not ready. Returns log lines.
 */
function nl_release_pass($nowTs) {
    $out = [];
    $msk = (new DateTimeImmutable('@' . $nowTs))->setTimezone(new DateTimeZone(NL_RELEASE_TZ));
    $today = $msk->format('Y-m-d');
    $hour = (int)$msk->format('G');
    $file = digest_root() . '/data/riffs.json';
    if (!is_file($file)) return $out;
    $lock = @fopen($file . '.lock', 'c');
    if (!$lock || !flock($lock, LOCK_EX)) return ['newsletter: riff store busy'];
    $list = json_decode((string)@file_get_contents($file), true);
    $changed = false;
    if (is_array($list)) {
        foreach ($list as $i => $riff) {
            if (!is_array($riff) || !nl_is_scheduled($riff)) continue;
            $date = riff_date_normalize($riff['releasedAt']);
            $song = nl_song($riff);
            $missing = nl_riff_missing($riff);
            $warn = nl_riff_warnings($riff);
            if ($today >= nl_date_add($date, -NL_READY_CHECK_DAYS) && $today < $date && ($missing || $warn)) {
                nl_alert('ready-' . ($riff['id'] ?? '') . '-' . $date, 'not_ready', $song . ' выходит ' . $date . ', но не готов: ' . implode(', ', array_merge($missing, $warn))
                    . ($missing ? '. Пока это не исправлено, рифф сам не откроется и анонс не уйдёт.' : '. Рифф выйдет, но без таба.'));
            }
            $due = ($today === $date && $hour >= NL_RELEASE_HOUR) || $today === nl_date_add($date, 1);
            if (!$due) continue;
            if ($missing) {
                nl_alert('hold-' . ($riff['id'] ?? '') . '-' . $date, 'held', $song . ' не открыт в дату выхода ' . $date . ': ' . implode(', ', $missing) . '. Письма о выходе не ушли.');
                continue;
            }
            $list[$i]['lock'] = '';
            $changed = true;
            $out[] = 'newsletter: opened ' . $song . ' (release ' . $date . ')';
        }
    }
    if ($changed) {
        $temp = @tempnam(dirname($file), '.riffs-');
        if ($temp && file_put_contents($temp, json_encode($list, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)) !== false) { @chmod($temp, 0644); rename($temp, $file); }
    }
    flock($lock, LOCK_UN);
    fclose($lock);
    return $out;
}

/* ---------- which letters a date has ---------- */

function nl_campaigns() { $c = nl_load('newsletter-campaigns.json', []); return is_array($c) ? array_values(array_filter($c, 'is_array')) : []; }
function nl_polls() { $p = nl_load('newsletter-polls.json', []); return ['polls' => array_values(array_filter((array)($p['polls'] ?? []), 'is_array')), 'votes' => (array)($p['votes'] ?? [])]; }

function nl_open_poll($date) {
    foreach (nl_polls()['polls'] as $p) {
        if (($p['from'] ?? '') <= $date && ($p['until'] ?? '') >= $date && count((array)($p['options'] ?? [])) >= 2) return $p;
    }
    return null;
}

const NL_PRIORITY = ['drops' => 3, 'offers' => 2, 'community' => 2, 'headsup' => 1];

/**
 * The letters for one date: [ key => { key, topic, kind, date, ... } ].
 *   soon  — heads-up for a scheduled, ready riff out NL_HEADSUP_DAYS later;
 *   drop  — riffs released that day (open, visible) and/or the riff whose free week starts that day;
 *   campaign — written in the admin for that date.
 */
function nl_letters_for($date, $riffs) {
    $out = [];
    $released = []; $free = null; $next = null;
    foreach ($riffs as $r) {
        if (!empty($r['hidden']) || !empty($r['noMail'])) continue;
        $rd = riff_date_normalize($r['releasedAt'] ?? '');
        if ($rd === '') continue;
        if (nl_is_scheduled($r) && $rd === nl_date_add($date, NL_HEADSUP_DAYS) && !nl_riff_missing($r)) {
            $k = 'soon-' . ($r['id'] ?? '') . '-' . $rd;
            $out[$k] = ['key' => $k, 'topic' => 'headsup', 'kind' => 'soon', 'date' => $date, 'riff' => $r];
        }
        if (riff_lock($r) !== '') continue;
        if ($rd === $date && empty($r['isFree']) && empty($r['freeWithAccount'])) $released[] = $r;
        $week = riff_free_week($r);
        if ($week && $week['from'] === $date) $free = $r;
        if ($week && $week['from'] === nl_date_add($date, 7)) $next = $r;
    }
    if ($released || $free) {
        $k = 'drop-' . $date;
        $out[$k] = ['key' => $k, 'topic' => 'drops', 'kind' => 'drop', 'date' => $date, 'released' => $released, 'free' => $free,
            'next' => $next, 'poll' => nl_open_poll($date)];
    }
    foreach (nl_campaigns() as $c) {
        if (($c['date'] ?? '') !== $date || !in_array($c['topic'] ?? '', NL_TOPICS, true)) continue;
        $k = 'c-' . ($c['id'] ?? '');
        $out[$k] = ['key' => $k, 'topic' => $c['topic'], 'kind' => 'campaign', 'date' => $date, 'campaign' => $c];
    }
    return $out;
}

/* ---------- writing the letters ---------- */

function nl_first_name($user) {
    $name = trim((string)($user['name'] ?? ''));
    if ($name === '') {
        $local = preg_replace('/[._\-+0-9]+/', ' ', explode('@', (string)($user['email'] ?? ''))[0]);
        $name = trim((string)$local);
    }
    $first = trim(explode(' ', $name)[0]);
    return $first !== '' && mb_strlen($first) <= 20 ? mb_convert_case($first, MB_CASE_TITLE, 'UTF-8') : '';
}

function nl_day($date, $fmt = 'l, M j') { return gmdate($fmt, strtotime($date . ' 12:00 UTC')); }

function nl_difficulty_label($riff) {
    $labels = ['beginner' => 'beginner level', 'beginner-plus' => 'beginner+', 'intermediate' => 'intermediate',
        'intermediate-plus' => 'intermediate+', 'advanced' => 'advanced'];
    return $labels[(string)($riff['difficulty'] ?? '')] ?? '';
}

function nl_parts($riff) { return count(is_array($riff['segments'] ?? null) ? $riff['segments'] : []); }

/** Link through api/newsletter/go.php: counts the click for the letter, then opens the page on our site. */
function nl_link($base, $key, $path) {
    return rtrim($base, '/') . '/api/newsletter/go.php?m=' . rawurlencode($key) . '&to=' . rawurlencode($path);
}

function nl_user_links($base, $userId, $key, $lang) {
    $q = 'u=' . rawurlencode((string)$userId) . '&t=' . nl_token($userId) . '&m=' . rawurlencode($key) . ($lang && $lang !== 'en' ? '&lang=' . $lang : '');
    return [
        'prefs' => rtrim($base, '/') . '/emails.html?' . $q,
        'unsub' => rtrim($base, '/') . '/api/newsletter/unsubscribe.php?' . $q,
    ];
}

/**
 * Subject, plain text and HTML in the common Riff Killer look (config/email-layout.php). Blocks as there.
 */
function nl_render($subject, $blocks, $why, $links, $preheader = '') {
    $base = digest_base_url();
    $mail = rk_email_layout(['base' => $base, 'lang' => 'en', 'preheader' => $preheader, 'blocks' => $blocks, 'why' => $why,
        'links' => [['Choose what we send', $links['prefs']], ['Unsubscribe from all', $links['unsub']]]]);
    return ['subject' => $subject, 'text' => $mail['text'], 'html' => $mail['html']];
}

const NL_WHY = [
    'drops' => 'You get this because you asked for new-riff emails on Riff Killer.',
    'headsup' => 'You get this because you asked for a heads-up before new riffs on Riff Killer.',
    'community' => 'You get this because you asked for challenges and votes on Riff Killer.',
    'offers' => 'You get this because you asked for offers and new products from Riff Killer.',
];

/** The riff's cover as an absolute address for an email, or '' when it has only the shared placeholder. */
function nl_cover($riff, $base) {
    $t = trim((string)($riff['thumbnail'] ?? ''));
    if ($t === '' || $t === 'assets/img/riff-1.png') return '';
    return preg_match('#^https?://#', $t) ? $t : rtrim($base, '/') . '/' . ltrim($t, '/');
}

/** "Black Sabbath · 23 parts · Intermediate" — the facts a guitarist checks first. */
function nl_spec($riff) {
    $bits = [nl_artist($riff)];
    if (nl_parts($riff) >= 2) $bits[] = nl_parts($riff) . ' parts';
    if (nl_difficulty_label($riff) !== '') $bits[] = ucfirst(nl_difficulty_label($riff));
    return implode(' · ', array_filter($bits));
}

/** One letter for one reader. $prefs decides the optional blocks (the vote goes only to community readers). */
function nl_compose($letter, $user, $prefs, $base) {
    $id = (string)($user['id'] ?? 'test');
    $key = $letter['key'];
    $name = nl_first_name($user);
    $hey = $name !== '' ? 'Hey ' . $name . ',' : 'Hey,';
    $links = nl_user_links($base, $id, $key, (string)($user['lang'] ?? ''));
    $why = NL_WHY[$letter['topic']] ?? NL_WHY['drops'];
    $play = function ($r) use ($base, $key) { return nl_link($base, $key, '/practice.html?riff=' . (int)($r['id'] ?? 0)); };
    $b = [];
    $pre = '';
    if ($letter['kind'] === 'soon') {
        $r = $letter['riff'];
        $rd = riff_date_normalize($r['releasedAt']);
        $week = riff_free_week($r);
        $subject = nl_day($rd, 'l') . ': ' . nl_song($r);
        $pre = nl_song($r) . ' lands on Riff Killer ' . nl_day($rd) . '.';
        $b[] = ['eyebrow', 'Coming ' . nl_day($rd)];
        $b[] = ['h1', nl_song($r) . ' drops ' . nl_day($rd, 'l')];
        $b[] = ['spec', nl_spec($r)];
        if (nl_cover($r, $base) !== '') $b[] = ['cover', nl_cover($r, $base), nl_link($base, $key, '/'), nl_song($r)];
        $b[] = ['p', $hey];
        $b[] = ['p', 'Heads-up: ' . nl_song($r) . ' by ' . nl_artist($r) . ' lands on Riff Killer on ' . nl_day($rd) . '.'];
        $n = nl_parts($r);
        if ($n >= 2) $b[] = ['p', 'I split it into ' . $n . ' parts, so you can take it one piece at a time and put it together when you’re ready.'];
        $b[] = ['p', 'Premium members and Riff Killer patrons get it on release day.' . ($week ? ' On a free account it opens for you for a week from ' . nl_day($week['from'], 'M j') . '.' : '')];
        $b[] = ['btn', 'See what’s in the library', nl_link($base, $key, '/')];
        $b[] = ['sign', 'See you ' . nl_day($rd, 'l') . ",\nMike"];
    } elseif ($letter['kind'] === 'drop') {
        $rel = $letter['released']; $free = $letter['free'];
        $names = array_map('nl_song', $rel);
        if ($rel && $free) $subject = 'New: ' . implode(' + ', $names) . ' · Free this week: ' . nl_song($free);
        elseif ($rel) $subject = count($rel) === 1 ? $names[0] . ' is out' : 'New riffs: ' . implode(' and ', $names);
        else $subject = 'Free this week: ' . nl_song($free);
        foreach ($rel as $i => $r) {
            if ($i === 0) array_unshift($b, ['eyebrow', 'New riff · ' . nl_day($letter['date'], 'M j')], ['h1', nl_song($r) . ' is out'], ['spec', nl_spec($r)]);
            else { $b[] = ['divider']; $b[] = ['b', nl_song($r) . ' is out too']; $b[] = ['spec', nl_spec($r)]; }
            if (nl_cover($r, $base) !== '') $b[] = ['cover', nl_cover($r, $base), $play($r), nl_song($r)];
            $week = riff_free_week($r);
            $b[] = ['p', nl_song($r) . ' by ' . nl_artist($r) . ' is out today. It’s open now for Premium members and Riff Killer patrons.' . ($week ? ' Free accounts get it for a week from ' . nl_day($week['from'], 'M j') . '.' : '')];
            $b[] = ['btn', 'Play ' . nl_song($r), $play($r)];
            if ($i === 0) $pre = nl_song($r) . ' by ' . nl_artist($r) . ' is out today.';
        }
        if ($free) {
            $week = riff_free_week($free);
            if ($rel) {
                $b[] = ['divider'];
                $b[] = ['eyebrow', 'Free this week · until ' . nl_day($week['until'], 'D, M j')];
                $b[] = ['mini', nl_cover($free, $base) ?: rtrim($base, '/') . '/assets/email/logo.png', $play($free), nl_song($free) . ' by ' . nl_artist($free),
                    'It’s open with your free account until ' . nl_day($week['until']) . '. After that it goes back to Premium.'];
                $b[] = ['btn', 'Play ' . nl_song($free), $play($free)];
            } else {
                array_unshift($b, ['eyebrow', 'Free this week · until ' . nl_day($week['until'], 'D, M j')], ['h1', nl_song($free) . ' is free this week'], ['spec', nl_spec($free)]);
                if (nl_cover($free, $base) !== '') $b[] = ['cover', nl_cover($free, $base), $play($free), nl_song($free)];
                $b[] = ['p', 'It’s open with your free account until ' . nl_day($week['until']) . '. After that it goes back to Premium.'];
                $b[] = ['btn', 'Play ' . nl_song($free), $play($free)];
                $pre = nl_song($free) . ' is free with your account until ' . nl_day($week['until'], 'M j') . '.';
            }
        }
        if (!empty($letter['next'])) $b[] = ['p', 'Next week’s free one: ' . nl_song($letter['next']) . '.'];
        $poll = $letter['poll'] ?? null;
        if ($poll && !empty($prefs['topics']['community'])) {
            $b[] = ['divider'];
            $b[] = ['eyebrow', 'Your vote'];
            $b[] = ['b', (string)$poll['question']];
            $opts = [];
            foreach (array_values((array)$poll['options']) as $i => $o) {
                $opts[] = [(string)$o, rtrim($base, '/') . '/api/newsletter/vote.php?p=' . rawurlencode((string)$poll['id']) . '&o=' . $i . '&u=' . rawurlencode($id) . '&t=' . nl_token($id) . '&m=' . rawurlencode($key)];
            }
            $b[] = ['p', 'One tap is a vote:'];
            $b[] = ['links', $opts];
        }
        $b[] = ['sign', '— Mike'];
        // The greeting goes under the opening picture (or the headline when there is none).
        $at = 0;
        foreach ($b as $i => $blk) { if ($blk[0] === 'cover') { $at = $i + 1; break; } if (in_array($blk[0], ['h1', 'spec'], true)) $at = $i + 1; if ($blk[0] === 'p') break; }
        array_splice($b, $at, 0, [['p', $hey]]);
    } else {
        $c = $letter['campaign'];
        $subject = (string)$c['subject'];
        $eyebrow = ['offers' => 'For you', 'community' => 'Challenge', 'drops' => 'New on Riff Killer', 'headsup' => 'Coming up'][$c['topic']] ?? '';
        if (trim((string)($c['eyebrow'] ?? '')) !== '') $eyebrow = trim($c['eyebrow']);
        if ($eyebrow !== '') $b[] = ['eyebrow', $eyebrow];
        $b[] = ['h1', trim((string)($c['headline'] ?? '')) !== '' ? trim($c['headline']) : $subject];
        $text = str_replace(['{name}', '{{name}}'], $name !== '' ? $name : 'there', (string)$c['text']);
        $paras = array_values(array_filter(array_map('trim', preg_split('/\n\s*\n/', trim($text))), 'strlen'));
        $hasButton = trim((string)($c['button'] ?? '')) !== '' && trim((string)($c['url'] ?? '')) !== '';
        // The sign-off (last paragraph starting with a dash or "Mike") goes after the button.
        $sign = $paras && preg_match('/^(—|–|-|Mike\b|Cheers|See you)/u', end($paras)) ? array_pop($paras) : '';
        foreach ($paras as $para) $b[] = ['p', $para];
        if ($hasButton) $b[] = ['btn', trim($c['button']), nl_link($base, $key, nl_site_path($c['url']))];
        if ($sign !== '') $b[] = ['sign', $sign];
        // Inbox preview: the first paragraph that is not the greeting.
        foreach ($paras as $para) if (!preg_match('/^(hey|hi|hello)\b[^.!?]{0,30},$/iu', $para)) { $pre = mb_substr(preg_replace('/\s+/', ' ', $para), 0, 110); break; }
    }
    $mail = nl_render($subject, $b, $why, $links, $pre);
    $mail['unsub'] = $links['unsub'];
    return $mail;
}

/** A path on our own site from what the admin typed ("/billing.html", "https://riffkiller.fun/x"); '/' otherwise. */
function nl_site_path($url) {
    $url = trim((string)$url);
    if (preg_match('#^https?://(www\.)?riffkiller\.fun(/.*)?$#i', $url, $m)) $url = $m[2] ?? '/';
    if ($url === '' || $url[0] !== '/' || substr($url, 0, 2) === '//' || preg_match('/[\s\\\\]/', $url)) return '/';
    return $url;
}

/* ---------- sending ---------- */

function nl_send_resend($to, $mail, $unsubUrl, $key) {
    $apiKey = getenv('RESEND_API_KEY') ?: ($_ENV['RESEND_API_KEY'] ?? '');
    $from = getenv('RESEND_FROM_EMAIL') ?: ($_ENV['RESEND_FROM_EMAIL'] ?? '');
    if ($apiKey === '' || $from === '') return 'not configured';
    $payload = ['from' => $from, 'to' => [$to], 'subject' => $mail['subject'], 'text' => $mail['text'], 'html' => $mail['html'],
        'tags' => [['name' => 'kind', 'value' => 'newsletter'], ['name' => 'letter', 'value' => nl_key_stat($key) ?: 'x']]];
    if ($unsubUrl) $payload['headers'] = ['List-Unsubscribe' => '<' . $unsubUrl . '>', 'List-Unsubscribe-Post' => 'List-Unsubscribe=One-Click'];
    $ch = curl_init('https://api.resend.com/emails');
    curl_setopt_array($ch, [
        CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 15,
        CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $apiKey, 'Content-Type: application/json'],
        CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_UNICODE),
    ]);
    $resp = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);
    usleep(600000); // Resend allows about two requests a second
    if ($err) return 'curl: ' . $err;
    return ($code >= 200 && $code < 300) ? null : 'http ' . $code . ' ' . substr((string)$resp, 0, 200);
}

function nl_sent_bump($key, $fields, $meta = []) {
    $file = nl_file('newsletter-sent.json');
    $lock = @fopen($file . '.lock', 'c');
    if ($lock) flock($lock, LOCK_EX);
    $all = nl_load('newsletter-sent.json', []);
    $row = is_array($all[$key] ?? null) ? $all[$key] : ['firstAt' => date('c')];
    foreach ($meta as $k => $v) if (!isset($row[$k])) $row[$k] = $v;
    foreach ($fields as $f => $n) $row[$f] = (int)($row[$f] ?? 0) + $n;
    $all[$key] = $row;
    nl_save('newsletter-sent.json', $all);
    if ($lock) { flock($lock, LOCK_UN); fclose($lock); }
    return $row;
}

/** An unsubscribe that came from a letter: counted for it, and an alert when too many leave after one letter. */
function nl_unsub_from_letter($key) {
    if ($key === '' || !preg_match('/^[a-z0-9_.-]{1,60}$/i', $key) || !isset(nl_load('newsletter-sent.json', [])[$key])) return;
    $row = nl_sent_bump($key, ['unsub' => 1]);
    $sent = (int)($row['sent'] ?? 0);
    if ($sent > 0 && (int)$row['unsub'] >= 2 && $row['unsub'] / $sent > NL_UNSUB_ALERT_RATE) {
        nl_alert('unsub-' . $key, 'unsub', 'После письма «' . ($row['subject'] ?? $key) . '» отписались ' . $row['unsub'] . ' из ' . $sent . ' (больше 2%).');
    }
}

/**
 * One pass, run every hour by config/newsletter-cli.php. $send($to, $mail, $unsubUrl, $key) → null or error text;
 * injectable for tests. Returns log lines.
 */
function nl_run($nowTs = null, $send = 'nl_send_resend') {
    $nowTs = $nowTs ?: time();
    $out = nl_release_pass($nowTs);
    $configured = (getenv('RESEND_API_KEY') ?: ($_ENV['RESEND_API_KEY'] ?? '')) !== '' && (getenv('RESEND_FROM_EMAIL') ?: ($_ENV['RESEND_FROM_EMAIL'] ?? '')) !== '';
    if ($send === 'nl_send_resend' && !$configured) { $out[] = 'newsletter: RESEND_API_KEY / RESEND_FROM_EMAIL not set, nothing sent'; return $out; }
    $riffs = nl_riffs();
    $all = nl_load('newsletter.json', []);
    $log = nl_load('newsletter-log.json', []);
    $base = digest_base_url();
    $byDate = [];
    $failures = 0;
    $subs = subscription_list_all();
    foreach (user_list_all() as $u) {
        $id = (string)($u['id'] ?? '');
        $email = trim((string)($u['email'] ?? ''));
        if ($id === '' || !isset($all[$id]) || !filter_var($email, FILTER_VALIDATE_EMAIL)) continue;
        $prefs = nl_prefs($id);
        if (!nl_any($prefs)) continue;
        $progress = digest_load_json(digest_progress_file($id), []);
        $local = (new DateTimeImmutable('@' . $nowTs))->setTimezone(digest_tz($progress));
        $today = $local->format('Y-m-d');
        $dates = (int)$local->format('G') >= NL_HOUR ? [$today, nl_date_add($today, -1)] : [nl_date_add($today, -1)];
        $entries = array_values(array_filter((array)($log[$id] ?? []), function ($e) use ($today) { return ($e['d'] ?? '') >= nl_date_add($today, -60); }));
        $done = array_column($entries, 'k');
        if (in_array($today, array_column(array_filter($entries, function ($e) { return empty($e['skip']); }), 'd'), true)) { $log[$id] = $entries; continue; }
        $cands = [];
        // Offers are not sold to people who already pay (Premium on the site or the Riff Killer tier on Patreon).
        $paying = isset($subs[$id]) && subscription_is_effectively_active($subs[$id]);
        foreach ($dates as $d) {
            if (!isset($byDate[$d])) $byDate[$d] = nl_letters_for($d, $riffs);
            foreach ($byDate[$d] as $letter) {
                if ($letter['topic'] === 'offers' && $paying) continue;
                if (!empty($prefs['topics'][$letter['topic']]) && !in_array($letter['key'], $done, true)) $cands[] = $letter;
            }
        }
        usort($cands, function ($a, $b) { return [NL_PRIORITY[$b['topic']], $b['date']] <=> [NL_PRIORITY[$a['topic']], $a['date']]; });
        $monday = $local->setTime(0, 0)->modify('-' . (((int)$local->format('N')) - 1) . ' days')->format('Y-m-d');
        $week = array_filter($entries, function ($e) use ($monday) { return empty($e['skip']) && ($e['d'] ?? '') >= $monday; });
        $weekAll = count($week);
        $weekExtra = count(array_filter($week, function ($e) { return ($e['topic'] ?? '') !== 'drops'; }));
        $offers30 = count(array_filter($entries, function ($e) use ($today) { return empty($e['skip']) && ($e['topic'] ?? '') === 'offers' && ($e['d'] ?? '') > nl_date_add($today, -NL_OFFERS_GAP_DAYS); }));
        foreach ($cands as $letter) {
            $blocked = $weekAll >= NL_WEEK_CAP || ($letter['topic'] !== 'drops' && $weekExtra >= NL_WEEK_EXTRA)
                || ($letter['topic'] === 'offers' && $offers30 > 0);
            if ($blocked) {
                $entries[] = ['k' => $letter['key'], 'd' => $today, 'at' => date('c', $nowTs), 'topic' => $letter['topic'], 'skip' => 1];
                nl_sent_bump($letter['key'], ['skipped' => 1], ['topic' => $letter['topic']]);
                $out[] = 'newsletter: ' . $letter['key'] . ' skipped for ' . $id . ' (cap)';
                continue;
            }
            $user = $u + ['lang' => (string)($progress['lang'] ?? '')];
            $mail = nl_compose($letter, $user, $prefs, $base);
            $err = call_user_func($send, $email, $mail, $mail['unsub'], $letter['key']);
            if ($err !== null) {
                $failures++;
                nl_sent_bump($letter['key'], ['failed' => 1], ['subject' => $mail['subject'], 'topic' => $letter['topic']]);
                $out[] = 'newsletter: ' . $letter['key'] . ' to ' . $id . ' failed: ' . $err;
                break;
            }
            $entries[] = ['k' => $letter['key'], 'd' => $today, 'at' => date('c', $nowTs), 'topic' => $letter['topic']];
            nl_sent_bump($letter['key'], ['sent' => 1], ['subject' => $mail['subject'], 'topic' => $letter['topic']]);
            nl_count('mail_sent:' . nl_key_stat($letter['key']));
            $out[] = 'newsletter: sent ' . $letter['key'] . ' to ' . $id;
            break; // one email a day
        }
        $log[$id] = $entries;
    }
    nl_save('newsletter-log.json', $log);
    if ($failures > 0) nl_alert('fail-' . gmdate('Y-m-d', $nowTs), 'failed', 'Рассылка: ' . $failures . ' писем не ушли (' . gmdate('Y-m-d H:i', $nowTs) . ' UTC). Подробности — журнал cron riffkiller-newsletter.');
    return $out;
}

/** A test copy right now to $to, marked "[Test]", for any letter the admin can preview. Returns error or null. */
function nl_send_test($to, $letter, $send = 'nl_send_resend') {
    if (!filter_var($to, FILTER_VALIDATE_EMAIL)) return 'not an email address';
    $user = ['id' => 'test', 'email' => $to, 'name' => ''];
    foreach (user_list_all() as $u) if (strcasecmp(trim((string)($u['email'] ?? '')), $to) === 0) { $user = $u; break; }
    $mail = nl_compose($letter, $user, ['topics' => array_fill_keys(NL_TOPICS, true)], digest_base_url());
    $mail['subject'] = '[Test] ' . $mail['subject'];
    return call_user_func($send, $to, $mail, $mail['unsub'], 'test');
}

/** The automatic and planned letters of the next $days days (Moscow dates) for the admin page and the report. */
function nl_upcoming($days = 35, $nowTs = null) {
    $nowTs = $nowTs ?: time();
    $today = (new DateTimeImmutable('@' . $nowTs))->setTimezone(new DateTimeZone(NL_RELEASE_TZ))->format('Y-m-d');
    $riffs = nl_riffs();
    // Riffs that will open by themselves are treated as open on their date, so their release-day letter shows up.
    $future = array_map(function ($r) { if (nl_is_scheduled($r) && !nl_riff_missing($r)) $r['lock'] = ''; return $r; }, $riffs);
    $out = [];
    for ($i = 0; $i <= $days; $i++) {
        $d = nl_date_add($today, $i);
        $letters = nl_letters_for($d, $riffs);
        foreach (nl_letters_for($d, $future) as $k => $l) if ($l['kind'] === 'drop') $letters[$k] = $l;
        foreach ($letters as $l) {
            $row = ['date' => $d, 'key' => $l['key'], 'topic' => $l['topic'], 'kind' => $l['kind']];
            if ($l['kind'] === 'soon') $row['title'] = 'Анонс: ' . nl_song($l['riff']) . ' (выход ' . $l['riff']['releasedAt'] . ')';
            elseif ($l['kind'] === 'drop') $row['title'] = trim(($l['released'] ? 'Вышел: ' . implode(', ', array_map('nl_song', $l['released'])) : '') . ($l['free'] ? ' · Free this week: ' . nl_song($l['free']) : '') . ($l['poll'] ? ' · голосование' : ''), ' ·');
            else $row['title'] = (string)$l['campaign']['subject'];
            $out[] = $row;
        }
    }
    $sched = [];
    foreach ($riffs as $r) {
        if (!nl_is_scheduled($r) || riff_date_normalize($r['releasedAt']) < $today) continue;
        $sched[] = ['id' => $r['id'] ?? null, 'song' => nl_song($r), 'releasedAt' => $r['releasedAt'], 'missing' => nl_riff_missing($r), 'warnings' => nl_riff_warnings($r), 'noMail' => !empty($r['noMail'])];
    }
    return ['letters' => $out, 'scheduled' => $sched];
}

/** Totals for the admin page and the Funnel report: no emails, no ids. */
function nl_summary() {
    $all = nl_load('newsletter.json', []);
    $s = ['accounts' => 0, 'any' => 0, 'byTopic' => array_fill_keys(NL_TOPICS, 0), 'consentHow' => [], 'asked' => ['yes' => 0, 'no' => 0]];
    foreach ($all as $id => $row) {
        $s['accounts']++;
        $p = nl_prefs($id);
        if (nl_any($p)) { $s['any']++; $how = (string)($p['consent']['how'] ?? '?'); $s['consentHow'][$how] = ($s['consentHow'][$how] ?? 0) + 1; }
        foreach (NL_TOPICS as $t) if ($p['topics'][$t]) $s['byTopic'][$t]++;
        if ($p['asked'] === 'yes' || $p['asked'] === 'no') $s['asked'][$p['asked']]++;
    }
    return $s;
}

/* ---------- small pages for links from the emails (translated on the page by js/i18n.js) ---------- */

const NL_I18N_V = 'cw1';

function nl_page($title, $inner, $code = 200) {
    http_response_code($code);
    header('Content-Type: text/html; charset=utf-8');
    header('Cache-Control: no-store');
    echo '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">'
        // js/i18n.js loads its dictionaries by a relative path (js/i18n/ru.js): the base makes that the site root.
        . '<base href="/"><script src="/js/i18n.js?v=' . NL_I18N_V . '"></script><title>Riff Killer</title>'
        . '<style>body{margin:0;font-family:Arial,Helvetica,sans-serif;background:#0f0f12;color:#e8e8ef}main{max-width:480px;margin:0 auto;padding:48px 20px}'
        . 'h1{font-size:20px;margin:0 0 12px;color:#fff}p{font-size:15px;line-height:1.55;margin:0 0 18px}a{color:#b28cf0}'
        . 'button{font:inherit;font-weight:600;font-size:15px;padding:11px 18px;border-radius:10px;border:0;background:#9355e5;color:#fff;cursor:pointer}</style></head>'
        . '<body><main><p style="font-size:13px;color:#8d8d9a" translate="no">Riff Killer</p><h1>' . htmlspecialchars($title) . '</h1>' . $inner . '</main></body></html>';
    exit;
}
