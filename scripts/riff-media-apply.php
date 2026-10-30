<?php
/**
 * Agent tool, runs on the server: puts a riff's camera videos in place and writes its parts, Riff DNA and tab
 * (used when Claude builds a whole riff from Mike's video, e.g. Paranoid on 31.10.2026).
 *   php riff-media-apply.php <document root> <request.json> <dir with the video files> <backup dir>
 * request: { id, song, videos: { "assets/video/<artist>/<song>/<file>.mp4": "<file name in the dir>" },
 *            riff: { videoFile?, videoFileRight?, duration?, segments?, dna?, tab? } }
 * Only those riff fields change; `song` must match the riff (guards against a wrong id). data/riffs.json and any
 * video it replaces are backed up first. Same lock and atomic replace as api/riffs/save.php.
 */
if (PHP_SAPI !== 'cli') exit(1);
[$self, $root, $requestFile, $srcDir, $backupDir] = array_pad($argv, 5, null);
function fail($m) { fwrite(STDERR, "::error::$m\n"); exit(1); }
if (!$root || !$requestFile || !$srcDir || !$backupDir) fail('usage: riff-media-apply.php <root> <request.json> <src dir> <backup dir>');
$root = rtrim($root, '/');
require_once $root . '/config/riff-validation.php';
$req = json_decode((string)file_get_contents($requestFile), true);
if (!is_array($req) || empty($req['id']) || empty($req['song']) || !is_array($req['riff'] ?? null)) fail('bad request');
$allowed = ['videoFile', 'videoFileRight', 'duration', 'segments', 'dna', 'tab'];
foreach (array_keys($req['riff']) as $k) if (!in_array($k, $allowed, true)) fail("field not allowed: $k");

$stamp = gmdate('Ymd\THis\Z');
if (!is_dir($backupDir)) mkdir($backupDir, 0700, true);

// Videos first: a riff that points to a missing file would break the practice page.
foreach (($req['videos'] ?? []) as $dest => $name) {
    if (!preg_match('#^assets/video/[A-Za-z0-9._/-]+\.mp4$#', $dest) || strpos($dest, '..') !== false) fail("bad video path: $dest");
    if (!preg_match('#^[A-Za-z0-9._-]+$#', $name)) fail("bad file name: $name");
    $src = rtrim($srcDir, '/') . '/' . $name;
    if (!is_file($src) || filesize($src) < 100000) fail("video missing or too small: $name");
    $target = $root . '/' . $dest;
    if (!is_dir(dirname($target)) && !mkdir(dirname($target), 0755, true)) fail('could not create ' . dirname($dest));
    if (is_file($target)) {
        if (!copy($target, rtrim($backupDir, '/') . '/' . $stamp . '-' . basename($dest))) fail("could not back up $dest");
    }
    $temp = $target . '.part';
    if (!copy($src, $temp) || !rename($temp, $target)) fail("could not write $dest");
    chmod($target, 0644);
    echo "video: $dest (" . round(filesize($target) / 1048576, 1) . " MB)\n";
}

$file = $root . '/data/riffs.json';
$lock = fopen($file . '.lock', 'c');
if (!$lock || !flock($lock, LOCK_EX)) fail('could not lock riff store');
$raw = file_get_contents($file);
$list = json_decode($raw, true);
if (!is_array($list)) fail('riff store is unreadable');
$idx = null;
foreach ($list as $i => $r) if ((int)($r['id'] ?? 0) === (int)$req['id']) { $idx = $i; break; }
if ($idx === null) fail('riff ' . $req['id'] . ' not found');
if (strcasecmp(trim((string)$list[$idx]['song']), trim((string)$req['song'])) !== 0) fail('riff ' . $req['id'] . ' is «' . $list[$idx]['song'] . '», not «' . $req['song'] . '»');
foreach ([$req['riff']['videoFile'] ?? null, $req['riff']['videoFileRight'] ?? null] as $v) {
    if ($v !== null && $v !== '' && !is_file($root . '/' . $v)) fail("video not on the server: $v");
}
if (file_put_contents(rtrim($backupDir, '/') . '/riffs-' . $stamp . '.json', $raw) === false) fail('could not write backup');
$riff = array_replace($list[$idx], $req['riff']);
$error = riff_validation_error($riff);
if ($error !== null) fail($error);
$list[$idx] = $riff;
$temp = tempnam(dirname($file), '.riffs-');
$encoded = json_encode($list, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
$stat = stat($file);
if ($encoded === false || file_put_contents($temp, $encoded) === false) fail('write failed');
@chmod($temp, $stat['mode'] & 0777);
@chown($temp, $stat['uid']);
@chgrp($temp, $stat['gid']);
if (!rename($temp, $file)) fail('write failed');
flock($lock, LOCK_UN);
echo 'riff ' . $req['id'] . ' «' . $riff['song'] . '»: ' . implode(', ', array_keys($req['riff'])) . ' written, ' . count($riff['segments'] ?? []) . " parts; backup $backupDir/riffs-$stamp.json\n";
