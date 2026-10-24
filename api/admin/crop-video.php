<?php
/**
 * Two cameras from one recording. Both crops come out of one ffmpeg run over the same
 * input, so the left- and right-hand videos keep identical timing and stay in sync.
 *
 * POST JSON { source: "assets/video/...", song, left: {x,y,w,h}, right: {x,y,w,h} }
 *   (boxes in source pixels, as the browser shows the frame) → { success, job }
 * GET ?job=<id> → { success, state: running|done|error, progress: 0..1, outputs?: {left, right}, error? }
 * Existing files are never overwritten: outputs get a free name next to the source.
 */
error_reporting(0);
ini_set('display_errors', 0);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

require_once dirname(__DIR__, 2) . '/config/admin-auth.php';
require_admin_api();
require_once dirname(__DIR__, 2) . '/config/video-tools.php';

$root = video_root();

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $id = (string)($_GET['job'] ?? '');
    if (!preg_match('/^[a-f0-9]{16}$/', $id)) video_json(['success' => false, 'error' => 'Unknown job'], 404);
    $dir = video_work_dir('crop') . '/' . $id;
    $job = is_file($dir . '/job.json') ? json_decode(file_get_contents($dir . '/job.json'), true) : null;
    if (!is_array($job)) video_json(['success' => false, 'error' => 'Unknown job'], 404);
    if (!empty($job['outputs'])) video_json(['success' => true, 'state' => 'done', 'progress' => 1, 'outputs' => $job['outputs']]);

    $exit = is_file($dir . '/exit') ? trim(file_get_contents($dir . '/exit')) : null;
    if ($exit === null) {
        $progress = 0;
        $text = is_file($dir . '/progress') ? file_get_contents($dir . '/progress') : '';
        if (preg_match_all('/out_time_(?:us|ms)=(\d+)/', $text, $m) && $job['duration'] > 0) {
            $progress = min(0.99, end($m[1]) / 1000000 / $job['duration']);
        }
        video_json(['success' => true, 'state' => 'running', 'progress' => round($progress, 3)]);
    }
    if ($exit !== '0' || !is_file($dir . '/left.mp4') || !is_file($dir . '/right.mp4')) {
        $log = is_file($dir . '/log') ? trim(substr(file_get_contents($dir . '/log'), -600)) : '';
        video_json(['success' => true, 'state' => 'error', 'error' => 'ffmpeg failed (' . $exit . ')' . ($log !== '' ? ': ' . $log : '')]);
    }
    $outputs = [];
    foreach (['left', 'right'] as $side) {
        $target = video_unique_path($job['base'] . '-' . $side . '.mp4');
        if (!is_dir(dirname($root . '/' . $target))) mkdir(dirname($root . '/' . $target), 0755, true);
        if (!rename($dir . '/' . $side . '.mp4', $root . '/' . $target)) {
            video_json(['success' => true, 'state' => 'error', 'error' => 'Could not move the ' . $side . ' video into assets'], 500);
        }
        @chmod($root . '/' . $target, 0644);
        $outputs[$side] = $target;
    }
    $job['outputs'] = $outputs;
    file_put_contents($dir . '/job.json', json_encode($job));
    video_json(['success' => true, 'state' => 'done', 'progress' => 1, 'outputs' => $outputs]);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') video_json(['success' => false, 'error' => 'Method not allowed'], 405);

$body = json_decode(file_get_contents('php://input'), true);
$source = video_clean_path($body['source'] ?? '');
if ($source === null || !is_file($root . '/' . $source)) video_json(['success' => false, 'error' => 'Source video not found'], 400);

$ffmpeg = video_binary('ffmpeg');
if (!$ffmpeg) video_json(['success' => false, 'error' => 'ffmpeg is not installed on the server'], 500);
$info = video_probe($root . '/' . $source);
if (!$info) video_json(['success' => false, 'error' => 'Could not read the source video'], 400);

$boxes = [];
foreach (['left', 'right'] as $side) {
    $boxes[$side] = video_crop_box($body[$side] ?? null, $info['width'], $info['height']);
    if (!$boxes[$side]) video_json(['success' => false, 'error' => 'The ' . $side . ' frame is outside the video or too small'], 400);
}

$id = bin2hex(random_bytes(8));
$dir = video_work_dir('crop') . '/' . $id;
mkdir($dir, 0750, true);
$song = video_slug($body['song'] ?? pathinfo($source, PATHINFO_FILENAME));
$job = [
    'source' => $source, 'boxes' => $boxes, 'duration' => $info['duration'],
    'base' => dirname($source) . '/' . $song, 'created' => gmdate('c')
];
file_put_contents($dir . '/job.json', json_encode($job));

$crop = function ($b) { return 'crop=' . $b['w'] . ':' . $b['h'] . ':' . $b['x'] . ':' . $b['y']; };
// A keyframe every 0.2 s: a phone decodes from the keyframe before the target on every loop jump, part jump
// and camera re-sync, and at 0.5 s or more that stalls the picture for half a second (iPhone).
$encode = '-c:v libx264 -preset veryfast -crf 18 -pix_fmt yuv420p -force_key_frames ' . escapeshellarg('expr:gte(t,n_forced*0.2)')
    . ' -c:a aac -b:a 160k -movflags +faststart';
$cmd = escapeshellarg($ffmpeg) . ' -y -hide_banner -nostdin -nostats -i ' . escapeshellarg($root . '/' . $source)
    . ' -filter_complex ' . escapeshellarg('[0:v]split=2[a][b];[a]' . $crop($boxes['left']) . '[l];[b]' . $crop($boxes['right']) . '[r]')
    . ' -map "[l]" -map "0:a?" ' . $encode . ' ' . escapeshellarg($dir . '/left.mp4')
    . ' -map "[r]" -map "0:a?" ' . $encode . ' ' . escapeshellarg($dir . '/right.mp4')
    . ' -progress ' . escapeshellarg($dir . '/progress');
$script = $cmd . ' 2> ' . escapeshellarg($dir . '/log') . '; echo $? > ' . escapeshellarg($dir . '/exit');
exec('nohup sh -c ' . escapeshellarg($script) . ' > /dev/null 2>&1 &');

video_json(['success' => true, 'job' => $id, 'width' => $info['width'], 'height' => $info['height']]);
