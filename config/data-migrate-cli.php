<?php
/**
 * One-time changes to the live data/ (the deploy never copies data/ from git). Each deploy runs
 *   php config/data-migrate-cli.php
 * as the web user; a migration runs once, its name is recorded in data/migrations.json and
 * the file it changes is copied to data/backups/ first.
 */
if (PHP_SAPI !== 'cli') exit(1);
$root = $argv[1] ?? dirname(__DIR__);
$doneFile = $root . '/data/migrations.json';
$done = json_decode((string)@file_get_contents($doneFile), true);
if (!is_array($done)) $done = [];

function migrate_riffs($root, $name, callable $change) {
    $file = $root . '/data/riffs.json';
    $list = json_decode((string)@file_get_contents($file), true);
    if (!is_array($list)) throw new RuntimeException('data/riffs.json is unreadable');
    @mkdir($root . '/data/backups', 0750, true);
    if (!copy($file, $root . '/data/backups/riffs-' . gmdate('Ymd\THis\Z') . '-' . $name . '.json')) throw new RuntimeException('backup failed');
    $lines = [];
    foreach ($list as $i => $riff) {
        if (!is_array($riff)) continue;
        $before = json_encode($riff);
        $list[$i] = $change($riff);
        if (json_encode($list[$i]) !== $before) $lines[] = ($riff['song'] ?? '#' . ($riff['id'] ?? '?'));
    }
    $temp = tempnam(dirname($file), '.riffs-');
    if (file_put_contents($temp, json_encode($list, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)) === false || !rename($temp, $file)) {
        throw new RuntimeException('write failed');
    }
    return 'changed: ' . ($lines ? implode(', ', $lines) : 'none');
}

$migrations = [
    // 30.10.2026, Mike: every riff except Black Dog gets the padlock «Soon» and is no longer free.
    '2026-10-30-lock-soon' => function ($root) {
        return migrate_riffs($root, '2026-10-30-lock-soon', function ($riff) {
            if (strcasecmp(trim((string)($riff['song'] ?? '')), 'Black Dog') === 0) {
                $riff['lock'] = '';
                return $riff;
            }
            $riff['lock'] = 'soon';
            $riff['isFree'] = false;
            return $riff;
        });
    },
];

$status = 0;
foreach ($migrations as $name => $run) {
    if (isset($done[$name])) continue;
    try {
        $result = $run($root);
        $done[$name] = gmdate('c');
        echo "Data migration $name: $result\n";
    } catch (Throwable $e) {
        echo "Data migration $name failed: " . $e->getMessage() . "\n";
        $status = 1;
        break;
    }
}
file_put_contents($doneFile, json_encode($done, JSON_PRETTY_PRINT));
if (!$done && !$migrations) echo "Data migrations: none\n";
exit($status);
