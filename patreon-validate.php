<?php
error_reporting(0);
ini_set('display_errors', 0);
if (ob_get_level()) ob_clean();

require_once __DIR__ . '/config/load-env.php';

// ==========================================================================
// Patreon Token Validation - РЕАЛЬНАЯ ПРОВЕРКА
// Optional: use identity proxy when PATREON_PROXY_URL is set (avoids Cloudflare block)
// ==========================================================================

$logFile = __DIR__ . '/patreon-validate.log';

function validateLog($msg, $context = []) {
    global $logFile;
    @file_put_contents($logFile, date('c') . ' ' . $msg . ' ' . json_encode($context) . "\n", FILE_APPEND | LOCK_EX);
}

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: https://riffkiller.fun');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    echo json_encode(['ok' => true]);
    exit();
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit();
}

$input = json_decode(file_get_contents('php://input'), true);
$accessToken = $input['token'] ?? '';
$userId = isset($input['user_id']) ? trim((string) $input['user_id']) : '';

if (!$accessToken) {
    http_response_code(400);
    echo json_encode(['error' => 'No token provided']);
    exit();
}

require_once __DIR__ . '/config/subscription-store.php';

$tokenPrefix = substr($accessToken, 0, 12) . '...';

// Optional: validate via proxy (same region as exchange, avoids Cloudflare block)
$proxyBase = getenv('PATREON_PROXY_URL') ?: (defined('PATREON_PROXY_URL') ? PATREON_PROXY_URL : '');
$proxyBase = rtrim($proxyBase, '/');
$identityUrl = null;
if ($proxyBase !== '') {
    $identityUrl = preg_replace('#/api/exchange$#', '/api/identity', $proxyBase);
    if ($identityUrl === $proxyBase) {
        $identityUrl = $proxyBase . '/api/identity';
    }
}

$subscriptionStatus = 'inactive';
$valid = false;

if ($identityUrl !== null && $identityUrl !== '') {
    // Validate via proxy (GET with Bearer)
    $ch = curl_init($identityUrl);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Authorization: Bearer ' . $accessToken,
        'User-Agent: Riff Killer App'
    ]);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlError = curl_error($ch);
    curl_close($ch);
    validateLog('identity_proxy', ['url' => $identityUrl, 'http' => $httpCode, 'curl_error' => $curlError ?: null, 'token_prefix' => $tokenPrefix]);
    if (!$curlError && $httpCode === 200) {
        $userData = json_decode($response, true);
        if (isset($userData['included']) && is_array($userData['included'])) {
            foreach ($userData['included'] as $included) {
                if (($included['type'] ?? '') === 'member') {
                    $status = $included['attributes']['patron_status'] ?? 'inactive';
                    $subscriptionStatus = $status === 'active_patron' ? 'active' : 'inactive';
                    break;
                }
            }
        }
        $valid = true;
    } else {
        echo json_encode(['valid' => false, 'error' => 'Token invalid', 'debug' => ['source' => 'proxy', 'httpCode' => $httpCode, 'curlError' => $curlError]]);
        exit();
    }
} else {
    // Direct request to Patreon
    $ch = curl_init('https://www.patreon.com/api/oauth2/v2/identity?include=memberships&fields[user]=full_name');
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Authorization: Bearer ' . $accessToken,
        'User-Agent: Riff Killer App'
    ]);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlError = curl_error($ch);
    curl_close($ch);

    validateLog('identity_direct', ['http' => $httpCode, 'curl_error' => $curlError ?: null, 'token_prefix' => $tokenPrefix]);

    if ($curlError || $httpCode !== 200) {
        echo json_encode(['valid' => false, 'error' => 'Token invalid', 'debug' => ['httpCode' => $httpCode, 'curlError' => $curlError]]);
        exit();
    }

    $userData = json_decode($response, true);
    if (isset($userData['included']) && is_array($userData['included'])) {
        foreach ($userData['included'] as $included) {
            if (($included['type'] ?? '') === 'member') {
                $attrs = $included['attributes'] ?? [];
                $status = $attrs['patron_status'] ?? 'inactive';
                $subscriptionStatus = $status === 'active_patron' ? 'active' : 'inactive';
                break;
            }
        }
    }
    $valid = true;
}

if ($valid && $userId !== '' && $subscriptionStatus) {
    save_subscription($userId, ['status' => $subscriptionStatus, 'source' => 'patreon']);
}

echo json_encode([
    'valid' => $valid,
    'subscription' => [
        'status' => $subscriptionStatus
    ]
]);