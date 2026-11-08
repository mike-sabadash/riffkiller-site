<?php
/**
 * POST { e: "auth_open:drop" } or { e: ["view:practice", "view:practice:inapp"] } → counts the events for today
 * (config/site-stats.php). No cookie is read or set, nothing about the visitor is kept: only daily totals.
 */
error_reporting(0);
ini_set('display_errors', 0);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
require_once dirname(__DIR__, 2) . '/config/site-stats.php';

// Names the pages send (js/auth-manager.js rkCount); anything else is ignored.
const SITE_STATS_EVENTS = ['view', 'auth_open', 'auth_tab', 'signup_click', 'login_click', 'consent_missing', 'auth_error',
    'star_prompt', 'patreon_back', 'inapp_hint', 'auth_done', 'gate'];

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false]);
    exit;
}
$raw = (string)file_get_contents('php://input', false, null, 0, 2048);
$body = json_decode($raw, true);
$events = is_array($body) ? ($body['e'] ?? []) : [];
if (!is_array($events)) $events = [$events];
$n = 0;
foreach (array_slice($events, 0, 4) as $event) {
    $event = site_stats_normalize($event);
    if ($event === '' || !in_array(explode(':', $event)[0], SITE_STATS_EVENTS, true)) continue;
    if (site_stats_count($event)) $n++;
}
echo json_encode(['success' => true, 'counted' => $n]);
