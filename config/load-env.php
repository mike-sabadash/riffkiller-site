<?php
/**
 * Load .env file into $_ENV and define() constants for easy access.
 * Include this at the top of any PHP file that needs environment variables.
 * .env is loaded from project root (parent of config/).
 */
if (function_exists('riffkiller_loaded_env')) {
    return;
}

$envPath = null;
$tried = [];
// 1) Directory of the script that was requested (e.g. stripe-checkout.php) — most reliable on shared hosting
if (!empty($_SERVER['SCRIPT_FILENAME'])) {
    $tried[] = dirname($_SERVER['SCRIPT_FILENAME']) . '/.env';
}
$tried[] = dirname(__DIR__) . '/.env';
// When included from api/auth/*, __DIR__ is config/ — so project root is dirname(__DIR__)
$configDir = __DIR__;
if (strpos($configDir, DIRECTORY_SEPARATOR . 'config') !== false) {
    $tried[] = dirname($configDir) . DIRECTORY_SEPARATOR . '.env';
}
if (!empty($_SERVER['DOCUMENT_ROOT'])) {
    $tried[] = rtrim($_SERVER['DOCUMENT_ROOT'], '/') . '/.env';
}
foreach ($tried as $p) {
    if (is_file($p)) {
        $envPath = $p;
        break;
    }
}
if ($envPath === null) {
    return;
}

$lines = @file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
if (!is_array($lines)) {
    $raw = @file_get_contents($envPath);
    $lines = $raw !== false ? preg_split('/\r\n|\r|\n/', $raw, -1, PREG_SPLIT_NO_EMPTY) : [];
}
if (empty($lines)) {
    return;
}

$GLOBALS['RIFFKILLER_ENV'] = isset($GLOBALS['RIFFKILLER_ENV']) ? $GLOBALS['RIFFKILLER_ENV'] : [];

foreach ($lines as $line) {
    $line = trim($line);
    if (isset($line[0]) && ord($line[0]) === 0xEF && isset($line[1]) && ord($line[1]) === 0xBB && isset($line[2]) && ord($line[2]) === 0xBF) {
        $line = substr($line, 3);
    }
    if ($line === '' || strpos($line, '#') === 0) {
        continue;
    }
    $line = preg_replace('/^\s*export\s+/i', '', $line);
    if (strpos($line, '=') === false) {
        continue;
    }
    $eq = strpos($line, '=');
    $key = trim(substr($line, 0, $eq));
    $key = preg_replace('/^\xEF\xBB\xBF/', '', $key);
    $key = trim($key, " \t\r\n");
    $value = trim(substr($line, $eq + 1));
    if ($key === '') {
        continue;
    }
    if ((substr($value, 0, 1) === '"' && substr($value, -1) === '"') || (substr($value, 0, 1) === "'" && substr($value, -1) === "'")) {
        $value = substr($value, 1, -1);
    }
    $_ENV[$key] = $value;
    $GLOBALS['RIFFKILLER_ENV'][$key] = $value;
    @putenv($key . '=' . $value);
    if (!defined($key)) {
        define($key, $value);
    }
}

function riffkiller_loaded_env() {
    return true;
}
