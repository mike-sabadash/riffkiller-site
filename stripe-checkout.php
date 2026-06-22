<?php
error_reporting(0);
ini_set('display_errors', 0);
@ini_set('log_errors', 1);
while (ob_get_level()) { @ob_end_clean(); }

function stripeCheckoutJsonError($message, $code = 500) {
    header('Content-Type: application/json; charset=utf-8');
    if ($code >= 200 && $code < 300) {
        http_response_code($code);
    } else {
        http_response_code(500);
    }
    echo json_encode(['success' => false, 'error' => $message]);
    exit();
}

try {
    require_once __DIR__ . '/config/load-env.php';
} catch (Throwable $e) {
    stripeCheckoutJsonError('Server configuration error. Please try again.');
}

// ==========================================================================
// Stripe Checkout Session - Riff Killer
// Creates a Checkout Session (subscription). plan=monthly ($9) or yearly ($90).
// success_url / cancel_url default to https://riffkiller.fun/...
// ==========================================================================

$logFile = __DIR__ . '/stripe-checkout.log';
function checkoutLog($msg, $context = []) {
    global $logFile;
    @file_put_contents($logFile, date('c') . ' ' . $msg . ' ' . json_encode($context) . "\n", FILE_APPEND | LOCK_EX);
}

$origin = isset($_SERVER['HTTP_ORIGIN']) ? $_SERVER['HTTP_ORIGIN'] : '';
$allowOrigin = 'https://riffkiller.fun';
if (preg_match('#^https://riffkiller\.fun$#', $origin) || preg_match('#^http://(localhost|127\.0\.0\.1)(:\d+)?$#', $origin)) {
    $allowOrigin = $origin;
}
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: ' . $allowOrigin);
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    echo json_encode(['ok' => true]);
    exit();
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit();
}

$input = json_decode(file_get_contents('php://input'), true) ?: [];
$plan = isset($input['plan']) && in_array($input['plan'], ['monthly', 'yearly'], true) ? $input['plan'] : 'monthly';
$userId = isset($input['userId']) ? (string) $input['userId'] : '';
$successUrl = isset($input['success_url']) ? trim((string) $input['success_url']) : '';
$cancelUrl = isset($input['cancel_url']) ? trim((string) $input['cancel_url']) : '';

$baseUrl = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? 'https' : 'http') . '://' . ($_SERVER['HTTP_HOST'] ?? '');
if ($successUrl === '') {
    $successUrl = 'https://riffkiller.fun/stripe-success.html';
}
if ($cancelUrl === '') {
    $cancelUrl = 'https://riffkiller.fun/stripe-cancel.html';
}
if ($baseUrl !== 'https://riffkiller.fun' && strpos($successUrl, 'riffkiller.fun') === false) {
    $successUrl = $baseUrl . '/stripe-success.html';
    $cancelUrl = $baseUrl . '/stripe-cancel.html';
}

$successUrl = $successUrl . (strpos($successUrl, '?') !== false ? '&' : '?') . 'session_id={CHECKOUT_SESSION_ID}';

// Secret key: .env via getenv, $_ENV, or $GLOBALS['RIFFKILLER_ENV'] (backup on some hosts)
$stripeSecretKey = getenv('STRIPE_SECRET_KEY') ?: '';
if ($stripeSecretKey === '' && isset($_ENV['STRIPE_SECRET_KEY'])) {
    $stripeSecretKey = (string) $_ENV['STRIPE_SECRET_KEY'];
}
if ($stripeSecretKey === '' && isset($GLOBALS['RIFFKILLER_ENV']['STRIPE_SECRET_KEY']) && $GLOBALS['RIFFKILLER_ENV']['STRIPE_SECRET_KEY'] !== '') {
    $stripeSecretKey = (string) $GLOBALS['RIFFKILLER_ENV']['STRIPE_SECRET_KEY'];
}
// Fallback: read .env directly (same dir as this script) when load-env didn't populate on some hosts
if ($stripeSecretKey === '' || strpos($stripeSecretKey, 'sk_') !== 0) {
    $directEnv = __DIR__ . '/.env';
    if (is_file($directEnv)) {
        $raw = @file_get_contents($directEnv);
        if ($raw !== false && preg_match('/^\s*STRIPE_SECRET_KEY\s*=\s*(\S+)/m', $raw, $m)) {
            $stripeSecretKey = trim($m[1], "\"' \t\r\n");
        }
    }
}
$isLocalhost = (isset($_SERVER['HTTP_HOST']) && preg_match('#^(localhost|127\.0\.0\.1)(:\d+)?$#', $_SERVER['HTTP_HOST']));
if ($stripeSecretKey === '' && $isLocalhost) {
    $stripeSecretKey = 'sk_test_51T4o0EE03IBQosTILuq8ia4zaT935XdDeuA3ZYIiYQ88O9WpuHneUGlJA0SYY1ogUZwpq7voy6iuQpBdZIXQol7X000zRW05ib';
}

if (strpos($stripeSecretKey, 'sk_') !== 0) {
    $envPaths = [
        __DIR__ . '/.env',
        isset($_SERVER['SCRIPT_FILENAME']) ? dirname($_SERVER['SCRIPT_FILENAME']) . '/.env' : '',
        isset($_SERVER['DOCUMENT_ROOT']) ? rtrim($_SERVER['DOCUMENT_ROOT'], '/') . '/.env' : '',
    ];
    $envExists = array_filter($envPaths, function ($p) { return $p !== '' && is_file($p); });
    $envFileFound = count($envExists) > 0;
    $envKeyLoaded = (isset($GLOBALS['RIFFKILLER_ENV']['STRIPE_SECRET_KEY']) && $GLOBALS['RIFFKILLER_ENV']['STRIPE_SECRET_KEY'] !== '') || (isset($_ENV['STRIPE_SECRET_KEY']) && $_ENV['STRIPE_SECRET_KEY'] !== '');
    checkoutLog('error', [
        'reason' => 'Stripe not configured',
        'env_found' => array_values($envExists),
        'has_env_stripe' => $envKeyLoaded,
    ]);
    $fromGlobal = isset($GLOBALS['RIFFKILLER_ENV']) ? $GLOBALS['RIFFKILLER_ENV'] : [];
    $envKeyNames = array_keys(array_filter($fromGlobal, function ($v, $k) { return (stripos($k, 'STRIPE') !== false || stripos($k, 'CRYPTOMUS') !== false); }, ARRAY_FILTER_USE_BOTH));
    $debugHint = ' [.env file: ' . ($envFileFound ? 'yes' : 'no') . ', STRIPE_SECRET_KEY loaded: ' . ($envKeyLoaded ? 'yes' : 'no') . ']';
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Stripe is not configured. On the server, add a .env file in the site root with STRIPE_SECRET_KEY=sk_test_... (or sk_live_...)' . $debugHint,
        'debug' => [
            'env_file_found' => $envFileFound,
            'stripe_key_loaded' => $envKeyLoaded,
            'env_keys_from_file' => $envKeyNames,
        ]
    ]);
    exit();
}

$interval = $plan === 'yearly' ? 'year' : 'month';
$unitAmount = $plan === 'yearly' ? 9000 : 900;
$description = $plan === 'yearly' ? 'Yearly subscription ($90/year)' : 'Monthly subscription ($9/month)';

$params = [
    'mode' => 'subscription',
    'success_url' => $successUrl,
    'cancel_url' => $cancelUrl,
    'line_items[0][quantity]' => 1,
    'line_items[0][price_data][currency]' => 'usd',
    'line_items[0][price_data][product_data][name]' => 'Riff Killer Premium',
    'line_items[0][price_data][product_data][description]' => $description,
    'line_items[0][price_data][recurring][interval]' => $interval,
    'line_items[0][price_data][unit_amount]' => $unitAmount,
    'metadata[plan]' => $plan,
];
if ($userId !== '') {
    $params['client_reference_id'] = $userId;
    $params['metadata[user_id]'] = $userId;
}

$ch = curl_init('https://api.stripe.com/v1/checkout/sessions');
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($params));
curl_setopt($ch, CURLOPT_USERPWD, $stripeSecretKey . ':');
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 15);
curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/x-www-form-urlencoded']);

$response = curl_exec($ch);
$code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlErr = curl_error($ch);
curl_close($ch);

if ($response === false || $curlErr !== '') {
    checkoutLog('curl_error', ['err' => $curlErr]);
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Could not reach Stripe. Please try again.']);
    exit();
}

$data = [];
$trimmed = trim($response);
if (isset($trimmed[0]) && $trimmed[0] === '{') {
    $decoded = json_decode($response, true);
    $data = is_array($decoded) ? $decoded : [];
    if (isset($decoded['error']['message'])) {
        $data['error'] = ['message' => $decoded['error']['message']];
    }
} else {
    parse_str($response, $data);
}

$url = isset($data['url']) ? (string) $data['url'] : '';
$sessionId = isset($data['id']) ? (string) $data['id'] : '';

if (($url === '' && $sessionId === '') || isset($data['error'])) {
    $errMsg = 'Stripe returned an error';
    if (isset($data['error']['message']) && (string) $data['error']['message'] !== '') {
        $errMsg = (string) $data['error']['message'];
    } elseif (isset($data['error']) && is_string($data['error'])) {
        $errMsg = $data['error'];
    } elseif (isset($data['error']) && is_array($data['error'])) {
        $errMsg = isset($data['error']['message']) ? (string) $data['error']['message'] : json_encode($data['error']);
    }
    checkoutLog('stripe_error', ['http_code' => $code, 'body' => substr($response, 0, 1000), 'parsed_error' => $errMsg]);
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $errMsg]);
    exit();
}

echo json_encode([
    'success' => true,
    'url' => $url,
    'sessionId' => $sessionId,
]);
