<?php
/**
 * Public endpoint: returns crypto wallet address and network for "Pay to wallet" on billing.
 * Configure CRYPTO_WALLET_ADDRESS and CRYPTO_WALLET_NETWORK in .env.
 */
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');

$projectRoot = dirname(__DIR__);
require_once $projectRoot . '/config/load-env.php';

$address = getenv('CRYPTO_WALLET_ADDRESS') ?: (isset($_ENV['CRYPTO_WALLET_ADDRESS']) ? $_ENV['CRYPTO_WALLET_ADDRESS'] : '');
if ($address === '' && !empty($GLOBALS['RIFFKILLER_ENV']['CRYPTO_WALLET_ADDRESS'])) {
    $address = $GLOBALS['RIFFKILLER_ENV']['CRYPTO_WALLET_ADDRESS'];
}
$network = getenv('CRYPTO_WALLET_NETWORK') ?: (isset($_ENV['CRYPTO_WALLET_NETWORK']) ? $_ENV['CRYPTO_WALLET_NETWORK'] : '');
if ($network === '' && !empty($GLOBALS['RIFFKILLER_ENV']['CRYPTO_WALLET_NETWORK'])) {
    $network = $GLOBALS['RIFFKILLER_ENV']['CRYPTO_WALLET_NETWORK'];
}
$address = trim($address);
$network = trim($network);

$amountMonthly = getenv('CRYPTO_WALLET_AMOUNT_MONTHLY') ?: (isset($_ENV['CRYPTO_WALLET_AMOUNT_MONTHLY']) ? $_ENV['CRYPTO_WALLET_AMOUNT_MONTHLY'] : '');
$amountYearly  = getenv('CRYPTO_WALLET_AMOUNT_YEARLY') ?: (isset($_ENV['CRYPTO_WALLET_AMOUNT_YEARLY']) ? $_ENV['CRYPTO_WALLET_AMOUNT_YEARLY'] : '');
if ($amountMonthly === '' && !empty($GLOBALS['RIFFKILLER_ENV']['CRYPTO_WALLET_AMOUNT_MONTHLY'])) $amountMonthly = $GLOBALS['RIFFKILLER_ENV']['CRYPTO_WALLET_AMOUNT_MONTHLY'];
if ($amountYearly === '' && !empty($GLOBALS['RIFFKILLER_ENV']['CRYPTO_WALLET_AMOUNT_YEARLY'])) $amountYearly = $GLOBALS['RIFFKILLER_ENV']['CRYPTO_WALLET_AMOUNT_YEARLY'];

if ($address === '') {
    echo json_encode(['success' => false]);
    exit;
}

echo json_encode([
    'success' => true,
    'address' => $address,
    'network' => $network !== '' ? $network : '—',
    'amountMonthly' => $amountMonthly !== '' ? trim($amountMonthly) : null,
    'amountYearly'  => $amountYearly !== '' ? trim($amountYearly) : null,
]);
