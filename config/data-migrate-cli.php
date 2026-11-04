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


/** "5–7–5 лад, струна G", "лады 2 и 0, струны D, A, 3 ноты" → "frets 5–7–5, G string", "frets 2 and 0, D, A strings, 3 notes". Other text is kept. */
function atom_label_en($label) {
    if (!preg_match('/^(?:(?:лады (\d+) и (\d+)|([\d–]+) лад), )?(струна|струны) ((?:[A-Ga-g]#?, )*[A-Ga-g]#?)((?:, [^,]+)*)$/u', $label, $m)) return $label;
    $words = ['на четверть тона' => 'quarter tone', 'на полтона' => 'half step', 'на три четверти тона' => 'three-quarter tone', 'на тон' => 'whole step', 'на полтора тона' => 'one and a half steps', 'на два тона' => 'two steps'];
    $parts = [];
    if (($m[1] ?? '') !== '') $parts[] = 'frets ' . $m[1] . ' and ' . $m[2];
    elseif (($m[3] ?? '') !== '') $parts[] = (strpos($m[3], '–') !== false ? 'frets ' : 'fret ') . $m[3];
    $parts[] = $m[5] . (strpos($m[5], ',') !== false ? ' strings' : ' string');
    if (($m[6] ?? '') !== '') foreach (explode(', ', substr($m[6], 2)) as $x) {
        if (preg_match('/^(\d+) (нота|ноты|нот)$/u', $x, $n)) $parts[] = $n[1] . ((int)$n[1] === 1 ? ' note' : ' notes');
        else $parts[] = $words[$x] ?? $x;
    }
    return implode(', ', $parts);
}

$migrations = [
    // 05.11.2026, Mike: technique details from the tab were Russian on the English site. They are English now
    // (js/tab-atoms.js) and the interface translates them; this rewrites the ones already saved.
    '2026-11-05-atom-labels-en' => function ($root) {
        return migrate_riffs($root, '2026-11-05-atom-labels-en', function ($riff) {
            if (!isset($riff['dna']['atoms']) || !is_array($riff['dna']['atoms'])) return $riff;
            foreach ($riff['dna']['atoms'] as $i => $atom) {
                if (is_array($atom) && isset($atom['label']) && is_string($atom['label'])) $riff['dna']['atoms'][$i]['label'] = atom_label_en($atom['label']);
            }
            return $riff;
        });
    },
    // 02.11.2026: a light copy of each left camera for the admin editor (config/video-edit.php), with the part videos.
    '2026-11-02-editor-videos' => function ($root) {
        require_once $root . '/config/video-parts.php';
        return video_parts_schedule(null) ? 'build started in the background (data/video-work/parts/build.log)' : 'ffmpeg or php not found, skipped';
    },
    // 01.11.2026: each part as its own video with the sound inside, for phones (config/video-parts.php).
    '2026-11-01-part-videos' => function ($root) {
        require_once $root . '/config/video-parts.php';
        return video_parts_schedule(null) ? 'build started in the background (data/video-work/parts/build.log)' : 'ffmpeg or php not found, skipped';
    },
    // 31.10.2026: Split as one video for phones (config/video-split.php), built for every riff in the background.
    '2026-10-31-split-videos' => function ($root) {
        require_once $root . '/config/video-split.php';
        return video_split_schedule(null) ? 'build started in the background (data/video-work/split/build.log)' : 'ffmpeg or php not found, skipped';
    },
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
