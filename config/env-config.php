<?php
/**
 * Outputs JavaScript that sets window.ENV with safe public config (Stripe publishable key).
 * Use: <script src="/config/env-config.php"></script> before stripe-config.js
 */
require_once __DIR__ . '/load-env.php';

header('Content-Type: application/javascript; charset=utf-8');
header('Cache-Control: public, max-age=300');

$publishable = isset($_ENV['STRIPE_PUBLISHABLE_KEY']) ? $_ENV['STRIPE_PUBLISHABLE_KEY'] : '';
echo 'window.ENV=' . json_encode(['STRIPE_PUBLISHABLE_KEY' => $publishable]) . ';';
