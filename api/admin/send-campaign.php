<?php
error_reporting(0);
ini_set('display_errors', 0);

require_once dirname(__DIR__, 2) . '/config/load-env.php';
require_once dirname(__DIR__, 2) . '/config/session-start.php';
require_once dirname(__DIR__, 2) . '/config/user-store.php';
require_once dirname(__DIR__, 2) . '/config/subscription-store.php';
require_once dirname(__DIR__, 2) . '/config/email-subscriptions.php';
require_once dirname(__DIR__, 2) . '/config/email-campaigns.php';
require_once dirname(__DIR__, 2) . '/config/email-templates.php';

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit;
}

if (!isset($_SESSION['admin_promo_logged']) || $_SESSION['admin_promo_logged'] !== true) {
    http_response_code(403);
    echo json_encode(['success' => false, 'error' => 'Forbidden']);
    exit;
}

$body = json_decode(file_get_contents('php://input') ?: '{}', true) ?: [];
$segment = isset($body['segment']) ? (string)$body['segment'] : 'all';
$subject = trim((string)($body['subject'] ?? ''));
$text = trim((string)($body['text'] ?? ''));
$templateKey = isset($body['template_key']) ? trim((string)$body['template_key']) : '';
$variables = isset($body['variables']) && is_array($body['variables']) ? $body['variables'] : [];
$template = null;
if ($templateKey !== '') {
    $template = email_template_get($templateKey);
    if (!$template) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Template not found']);
        exit;
    }
    if ($subject === '' && !empty($template['subject'])) $subject = (string)$template['subject'];
    if ($text === '' && !empty($template['text'])) $text = (string)$template['text'];
}

if ($subject === '' || $text === '') {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'subject and text are required']);
    exit;
}

$users = user_list_all();
$subs = subscription_list_all();

$emails = [];
foreach ($users as $u) {
    $email = strtolower(trim((string)($u['email'] ?? '')));
    if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) continue;
    $uid = (string)($u['id'] ?? '');
    $sub = $uid !== '' && isset($subs[$uid]) ? $subs[$uid] : null;
    $isActive = subscription_is_effectively_active($sub);

    if ($segment === 'active' && !$isActive) continue;
    if ($segment === 'inactive' && $isActive) continue;
    $emails[$email] = $u;
}

$apiKey = getenv('RESEND_API_KEY') ?: (isset($_ENV['RESEND_API_KEY']) ? $_ENV['RESEND_API_KEY'] : '');
$from = getenv('RESEND_FROM_EMAIL') ?: (isset($_ENV['RESEND_FROM_EMAIL']) ? $_ENV['RESEND_FROM_EMAIL'] : '');
if ($apiKey === '' || $from === '') {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'RESEND_API_KEY or RESEND_FROM_EMAIL is not configured']);
    exit;
}

$campaignId = 'cmp_' . date('Ymd_His') . '_' . substr(bin2hex(random_bytes(4)), 0, 8);
$baseUrl = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? 'https' : 'http') . '://' . ($_SERVER['HTTP_HOST'] ?? 'localhost');

if ($template) {
    email_campaigns_log_write('campaign.template.used', [
        'campaign_id' => $campaignId,
        'segment' => $segment,
        'status' => 'template',
        'note' => 'template_key: ' . ($template['key'] ?? $templateKey),
    ]);
}

$sent = 0; $failed = 0; $skipped = 0;
foreach ($emails as $email => $user) {
    $pref = email_subscription_get($email);
    if ($pref && isset($pref['marketing_consent']) && $pref['marketing_consent'] === false) {
        $skipped++;
        email_campaigns_log_write('campaign.skipped.unsubscribed', ['campaign_id' => $campaignId, 'email' => $email, 'segment' => $segment, 'status' => 'skipped']);
        continue;
    }
    if (!$pref) {
        email_subscription_set($email, true, 'auto-default');
        $pref = email_subscription_get($email);
    }
    $token = $pref['unsubscribe_token'] ?? '';
    $unsubscribeUrl = $baseUrl . '/api/unsubscribe.php?token=' . urlencode($token);
    $safeText = htmlspecialchars($text, ENT_QUOTES, 'UTF-8');
    $safeTextHtml = nl2br($safeText);
    $safeSubject = htmlspecialchars($subject, ENT_QUOTES, 'UTF-8');
    $defaultHtml = '<!doctype html><html><body style="margin:0;padding:0;background:#111629;font-family:Arial,sans-serif;">'
        . '<div style="max-width:640px;margin:0 auto;padding:24px;color:#ffffff;">'
        . '<div style="padding:20px 24px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.12);border-radius:12px;">'
        . '<h2 style="margin:0 0 14px 0;font-size:20px;font-weight:600;">' . $safeSubject . '</h2>'
        . '<div style="font-size:15px;line-height:1.6;color:rgba(255,255,255,0.9);">{{text_html}}</div>'
        . '</div>'
        . '<p style="margin:14px 2px 0;color:rgba(255,255,255,0.6);font-size:12px;">Riff Killer newsletter</p>'
        . '<p style="margin:8px 2px 0;color:rgba(255,255,255,0.65);font-size:12px;">If you do not want to receive marketing emails, <a href="{{unsubscribe_url}}" style="color:#B38BFF;">unsubscribe</a>.</p>'
        . '</div></body></html>';
    $htmlTpl = $template && !empty($template['html']) ? (string)$template['html'] : $defaultHtml;
    $textTpl = $template && !empty($template['text']) ? (string)$template['text'] : ($text . "\n\n---\nUnsubscribe: {{unsubscribe_url}}");

    $merge = array_merge($variables, [
        'email' => $email,
        'user_name' => (string)($user['name'] ?? ''),
        'subject' => $subject,
        'text' => $text,
        'text_html' => $safeTextHtml,
        'unsubscribe_url' => $unsubscribeUrl,
        'campaign_id' => $campaignId,
        'segment' => $segment,
    ]);
    $replace = function($tpl) use ($merge) {
        $out = (string)$tpl;
        foreach ($merge as $k => $v) {
            $out = str_replace('{{' . $k . '}}', (string)$v, $out);
        }
        return $out;
    };
    $html = $replace($htmlTpl);
    $textBody = $replace($textTpl);

    $payload = [
        'from' => $from,
        'to' => [$email],
        'subject' => $subject,
        'text' => $textBody,
        'html' => $html,
        'tags' => [
            ['name' => 'campaign_id', 'value' => $campaignId],
            ['name' => 'segment', 'value' => $segment],
        ],
    ];

    $ch = curl_init('https://api.resend.com/emails');
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 15);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Authorization: Bearer ' . $apiKey,
        'Content-Type: application/json'
    ]);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload, JSON_UNESCAPED_UNICODE));
    $resp = curl_exec($ch);
    $http = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);

    if ($err || $http < 200 || $http >= 300) {
        $failed++;
        email_campaigns_log_write('campaign.send.failed', [
            'campaign_id' => $campaignId,
            'email' => $email,
            'segment' => $segment,
            'status' => 'failed',
            'note' => $err ? ('curl: ' . $err) : ('http: ' . $http . ' ' . substr((string)$resp, 0, 240)),
        ]);
        continue;
    }
    $sent++;
    email_campaigns_log_write('campaign.send.sent', [
        'campaign_id' => $campaignId,
        'email' => $email,
        'segment' => $segment,
        'status' => 'sent',
    ]);
}

echo json_encode([
    'success' => true,
    'campaign_id' => $campaignId,
    'segment' => $segment,
    'targets' => count($emails),
    'sent' => $sent,
    'failed' => $failed,
    'skipped' => $skipped,
]);

