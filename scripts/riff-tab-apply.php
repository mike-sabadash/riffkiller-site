<?php
/**
 * Agent tool, runs on the server: writes a tab and its sound sync into one riff of data/riffs.json.
 *   php riff-tab-apply.php <document root> <patch.json> <backup dir>
 * patch: { id, tab: { tex, track? }, expect: [[start, end] per part], segments: { index: { tabBars, tabSync } }, atoms?: [...] }
 * atoms: Riff DNA techniques read from the tab; added to riff.dna.atoms unless the same technique is already within 0.25 s.
 * Same lock and atomic replace as api/riffs/save.php; the file keeps its owner and mode.
 */
if (PHP_SAPI !== 'cli') exit(1);
[$self, $root, $patchFile, $backupDir] = array_pad($argv, 4, null);
function fail($m) { fwrite(STDERR, "::error::$m\n"); exit(1); }
if (!$root || !$patchFile || !$backupDir) fail('usage: riff-tab-apply.php <root> <patch.json> <backup dir>');
$file = rtrim($root, '/') . '/data/riffs.json';
$patch = json_decode((string)file_get_contents($patchFile), true);
if (!is_array($patch) || empty($patch['id']) || empty($patch['tab']['tex'])) fail('bad patch');

$lock = fopen($file . '.lock', 'c');
if (!$lock || !flock($lock, LOCK_EX)) fail('could not lock riff store');
$raw = file_get_contents($file);
$list = json_decode($raw, true);
if (!is_array($list)) fail('riff store is unreadable');
$idx = null;
foreach ($list as $i => $r) if ((int)($r['id'] ?? 0) === (int)$patch['id']) { $idx = $i; break; }
if ($idx === null) fail('riff ' . $patch['id'] . ' not found');
$riff = $list[$idx];
$segs = $riff['segments'] ?? [];
$expect = $patch['expect'] ?? [];
if (count($segs) !== count($expect)) fail('parts changed since the sync was computed');
foreach ($segs as $i => $s) {
    if (abs((float)$s['start'] - (float)$expect[$i][0]) > 0.001 || abs((float)$s['end'] - (float)$expect[$i][1]) > 0.001) fail('part ' . ($i + 1) . ' moved since the sync was computed');
}

if (!is_dir($backupDir)) mkdir($backupDir, 0700, true);
$backup = rtrim($backupDir, '/') . '/riffs-' . gmdate('Ymd\THis\Z') . '.json';
if (file_put_contents($backup, $raw) === false) fail('could not write backup');

$riff['tab'] = ['tex' => (string)$patch['tab']['tex']];
if (!empty($patch['tab']['track'])) $riff['tab']['track'] = (int)$patch['tab']['track'];
foreach (($patch['segments'] ?? []) as $i => $s) {
    $i = (int)$i;
    if (!isset($segs[$i])) continue;
    $segs[$i]['tabBars'] = array_map('intval', $s['tabBars']);
    $segs[$i]['tabSync'] = array_map(function ($a) { return [(int)$a[0], (int)$a[1], round((float)$a[2], 3)]; }, $s['tabSync']);
}
$riff['segments'] = $segs;
$added = 0;
if (!empty($patch['atoms']) && is_array($patch['atoms'])) {
    $dna = is_array($riff['dna'] ?? null) ? $riff['dna'] : [];
    $have = is_array($dna['atoms'] ?? null) ? $dna['atoms'] : [];
    foreach ($patch['atoms'] as $a) {
        if (!is_array($a) || !preg_match('/^[a-z]+$/', (string)($a['technique'] ?? '')) || !is_numeric($a['time'] ?? null)) continue;
        $index = (int)($a['segmentIndex'] ?? -1);
        if (!isset($segs[$index])) continue;
        $dup = false;
        foreach ($have as $e) if (($e['technique'] ?? '') === $a['technique'] && isset($e['time']) && abs((float)$e['time'] - (float)$a['time']) < 0.25) { $dup = true; break; }
        if ($dup) continue;
        $have[] = [
            'technique' => $a['technique'], 'type' => (string)($a['type'] ?? $a['technique']), 'label' => (string)($a['label'] ?? ''),
            'tip' => '', 'view' => ($a['view'] ?? '') === 'right' ? 'right' : 'left', 'speed' => (float)($a['speed'] ?? 0.5),
            'segmentIndex' => $index, 'time' => round((float)$a['time'], 2), 'source' => 'tab'
        ];
        $added++;
    }
    $dna['atoms'] = $have;
    $riff['dna'] = $dna;
}
$list[$idx] = $riff;

$encoded = json_encode($list, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
$temp = tempnam(dirname($file), '.riffs-');
if ($encoded === false || file_put_contents($temp, $encoded) === false) { @unlink($temp); fail('could not write riff store'); }
$stat = stat($file);
chmod($temp, $stat['mode'] & 0777);
if (function_exists('posix_getuid') && posix_getuid() === 0) { chown($temp, $stat['uid']); chgrp($temp, $stat['gid']); }
if (!rename($temp, $file)) { @unlink($temp); fail('could not replace riff store'); }
flock($lock, LOCK_UN);
echo "::notice::Riff {$patch['id']}: tab saved, " . count($patch['segments'] ?? []) . " parts synced, $added techniques added. Backup: $backup\n";
