<?php
/**
 * One-time debug: open https://riffkiller.fun/env-check.php in browser
 * to see if .env is found and keys loaded. DELETE this file after fixing.
 */
header('Content-Type: text/plain; charset=utf-8');
require_once __DIR__ . '/config/load-env.php';

$paths = [
    'script_dir' => isset($_SERVER['SCRIPT_FILENAME']) ? dirname($_SERVER['SCRIPT_FILENAME']) . '/.env' : '(not set)',
    'config_parent' => dirname(__DIR__) . '/.env',
    'document_root' => !empty($_SERVER['DOCUMENT_ROOT']) ? rtrim($_SERVER['DOCUMENT_ROOT'], '/') . '/.env' : '(not set)',
];

echo "Paths checked for .env:\n";
foreach ($paths as $name => $p) {
    $exists = ($p !== '(not set)' && is_file($p)) ? 'YES' : 'no';
    echo "  $name: $exists  ($p)\n";
}

$keySet = isset($_ENV['STRIPE_SECRET_KEY']) && $_ENV['STRIPE_SECRET_KEY'] !== '' && strpos($_ENV['STRIPE_SECRET_KEY'], 'sk_') === 0;
echo "\nSTRIPE_SECRET_KEY loaded and valid: " . ($keySet ? 'YES' : 'no') . "\n";
echo "getenv('STRIPE_SECRET_KEY'): " . (getenv('STRIPE_SECRET_KEY') !== false ? 'set' : 'empty') . "\n";
