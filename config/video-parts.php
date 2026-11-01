<?php
/**
 * Each part of a riff as its own short video WITH the sound inside, for phones.
 *
 * Why: on an iPhone the looped part used to play as a silent camera video plus a separate sound file
 * (js/part-audio.js). Two media clocks drift apart, and every loop jump makes the phone seek the video
 * (0.2–0.8 s), so after a few passes the fingers no longer matched the sound. A file that holds exactly one
 * part, picture and sound together, is looped by the browser itself (video.loop): one element, one clock,
 * the phone keeps picture and sound together by itself and nothing of the next part can sound.
 *
 *   <left video without .mp4>-parts/<view>-<n>-<hash>.mp4   view: left, right, split (right camera in a window)
 * Sound in every view is the left camera's (both cameras are crops of one take). Cuts are on frame edges and
 * the sound is cut to exactly the same length, so a pass is as long in picture as in sound.
 * Built in the background (config/video-parts-cli.php) when a riff is saved and once for all riffs on deploy.
 * The list API offers them (partClips) only while they match the current cameras and part times.
 */
require_once __DIR__ . '/video-tools.php';
require_once __DIR__ . '/video-rekey.php';

// 1: max 1280 px wide, crf 23, keyframes every 0.25 s, AAC 160k.
const VIDEO_PARTS_VERSION = 1;
const VIDEO_PARTS_VIEWS = ['left', 'right', 'split'];

/** Folder of a riff's part videos, or null without a left camera video. */
function video_parts_dir($riff) {
    $left = video_clean_path($riff['videoFile'] ?? '');
    if (!$left) return null;
    return preg_replace('/\.[a-z0-9]+$/i', '', $left) . '-parts';
}

/** [start, end] of each part, rounded to ms; null when a part has no usable times. */
function video_parts_times($riff) {
    $times = [];
    foreach (($riff['segments'] ?? []) as $segment) {
        $start = $segment['start'] ?? null;
        $end = $segment['end'] ?? null;
        if (!is_numeric($start) || !is_numeric($end) || (float)$end <= (float)$start) return null;
        $times[] = [round((float)$start, 3), round((float)$end, 3)];
    }
    return $times ?: null;
}

function video_parts_marker($dir) {
    return video_work_dir('parts') . '/' . sha1($dir) . '.json';
}

/** What the part videos are built from: both cameras (sizes change on every replacement or re-key) and the times. */
function video_parts_sources($riff) {
    $root = video_root();
    $left = video_clean_path($riff['videoFile'] ?? '');
    $right = video_clean_path($riff['videoFileRight'] ?? '') ?: $left;
    return ['left' => $left, 'right' => $right,
        'leftSize' => $left ? @filesize($root . '/' . $left) : false, 'rightSize' => $right ? @filesize($root . '/' . $right) : false,
        'times' => video_parts_times($riff), 'version' => VIDEO_PARTS_VERSION];
}

/** The built files ({left:[...], right:[...], split:[...]}) when they match the riff as it is now, else null. */
function video_parts_ready($riff) {
    $dir = video_parts_dir($riff);
    if (!$dir || !video_parts_times($riff)) return null;
    $done = json_decode((string)@file_get_contents(video_parts_marker($dir)), true);
    if (!is_array($done) || !is_array($done['files'] ?? null)) return null;
    $now = video_parts_sources($riff);
    // Compared as JSON: a time of 0.0 reads back from the marker as 0.
    foreach ($now as $key => $value) {
        if (json_encode($done[$key] ?? null) !== json_encode($value)) return null;
    }
    $root = video_root();
    foreach ($done['files'] as $list) {
        foreach ((array)$list as $file) {
            if (!is_string($file) || !is_file($root . '/' . $file)) return null;
        }
    }
    return $done['files'];
}

/** Adds partClips to a riff for the page when its part videos are ready. */
function video_parts_offer($riff) {
    if (!is_array($riff)) return $riff;
    $files = video_parts_ready($riff);
    if ($files) $riff['partClips'] = $files;
    return $riff;
}

/** Starts a background build for the riff (or every riff: null); returns whether one was started. */
function video_parts_schedule($riffId = null) {
    require_once __DIR__ . '/load-env.php';
    if (strtolower((string)($_ENV['VIDEO_REKEY'] ?? getenv('VIDEO_REKEY') ?: '')) === 'off') return false;
    $php = video_binary('php') ?: (defined('PHP_BINARY') && PHP_BINARY ? PHP_BINARY : null);
    if (!$php || !video_binary('ffmpeg')) return false;
    $log = video_work_dir('parts') . '/build.log';
    $args = $riffId === null ? '--all' : '--riff ' . escapeshellarg((string)$riffId);
    // nice: the server is shared with other sites.
    exec('nohup nice -n 10 ' . escapeshellarg($php) . ' ' . escapeshellarg(video_root() . '/config/video-parts-cli.php') . ' ' . $args
        . ' < /dev/null >> ' . escapeshellarg($log) . ' 2>&1 &');
    return true;
}

/** Frame rate of a video's picture as ffmpeg writes it ("30/1", "30000/1001"); "30/1" when it cannot be read. */
function video_parts_rate($file) {
    $ffprobe = video_binary('ffprobe');
    $rate = $ffprobe ? trim((string)shell_exec(escapeshellarg($ffprobe) . ' -v error -select_streams v:0 -show_entries stream=avg_frame_rate -of csv=p=0 '
        . escapeshellarg($file) . ' 2>/dev/null')) : '';
    return preg_match('#^[1-9]\d*/[1-9]\d*$#', $rate) ? $rate : '30/1';
}

/** Frames per second of a video's picture (30 when it cannot be read). */
function video_parts_fps($file) {
    $ffprobe = video_binary('ffprobe');
    $rate = $ffprobe ? trim((string)shell_exec(escapeshellarg($ffprobe) . ' -v error -select_streams v:0 -show_entries stream=avg_frame_rate -of csv=p=0 '
        . escapeshellarg($file) . ' 2>/dev/null')) : '';
    if (preg_match('#^(\d+)/(\d+)$#', $rate, $m) && (int)$m[2] > 0 && (int)$m[1] > 0) return (int)$m[1] / (int)$m[2];
    if (is_numeric($rate) && (float)$rate > 0) return (float)$rate;
    return 30.0;
}

/** Whether a video has a sound track. */
function video_parts_has_audio($file) {
    $ffprobe = video_binary('ffprobe');
    if (!$ffprobe) return false;
    return trim((string)shell_exec(escapeshellarg($ffprobe) . ' -v error -select_streams a:0 -show_entries stream=index -of csv=p=0 '
        . escapeshellarg($file) . ' 2>/dev/null')) !== '';
}

/**
 * Builds one part video: frames [first, last) of the picture and the left camera's sound over exactly the same
 * time. The input is opened a few seconds early with its own timestamps kept (-copyts) and cut by trim filters
 * in the file's own time: cutting by input -ss/-t gave a different number of frames in different ffmpeg
 * versions (ffmpeg 7: 33 of 39 by input -t; 25 fps out of trimmed frames without -r), a picture shorter than its sound.
 */
function video_parts_encode($ffmpeg, $leftFile, $rightFile, $view, $first, $last, $fps, $rate, $audio, $out) {
    $from = $first / $fps;
    $to = $last / $fps;
    $open = ' -ss ' . sprintf('%.6f', max(0, $from - 3)) . ' -copyts -i ';
    // Half a frame early on both edges: frame k (at k/fps) is in when first <= k < last, whatever the rounding.
    $vtrim = sprintf('trim=start=%.6f:end=%.6f,setpts=PTS-STARTPTS', ($first - 0.5) / $fps, ($last - 0.5) / $fps);
    $atrim = sprintf('atrim=start=%.6f:end=%.6f,asetpts=PTS-STARTPTS,apad=whole_dur=%.6f', $from, $to, $to - $from);
    $scale = "scale='min(1280,iw)':-2:flags=lanczos";
    $inputs = $open . escapeshellarg($leftFile);
    if ($view === 'left') $video = '[0:v]' . $vtrim . ',' . $scale . '[v]';
    else {
        $inputs .= $open . escapeshellarg($rightFile);
        $video = $view === 'right' ? '[1:v]' . $vtrim . ',' . $scale . '[v]'
            // As config/video-split.php: left camera in full, right camera in a window top left.
            : '[0:v]' . $vtrim . ',scale=1280:-2:flags=lanczos[b];[1:v]' . $vtrim . ',scale=556:-2:flags=lanczos,pad=iw+2:ih+2:0:0:color=0x111111[p];'
                . '[b][p]overlay=0:0:shortest=1[v]';
    }
    // The sound exactly as long as the picture (padded with silence if the track is a hair short).
    $filter = $video . ($audio ? ';[0:a]' . $atrim . '[a]' : '');
    $cmd = escapeshellarg($ffmpeg) . ' -nostdin -v error -y' . $inputs . ' -filter_complex ' . escapeshellarg($filter)
        // -r: the camera's own frame rate (ffmpeg 7 otherwise writes 25 fps out of trimmed frames and drops some).
        . ' -map "[v]"' . ($audio ? ' -map "[a]" -c:a aac -b:a 160k' : '') . ' -r ' . escapeshellarg($rate) . ' -frames:v ' . (int)($last - $first)
        . ' -c:v libx264 -preset fast -crf 23 -bf 0 -pix_fmt yuv420p -force_key_frames "expr:gte(t,n_forced*0.25)"'
        . ' -movflags +faststart ' . escapeshellarg($out) . ' 2>&1';
    exec($cmd, $lines, $code);
    $got = $code === 0 && is_file($out) ? (int)trim((string)shell_exec(escapeshellarg(video_binary('ffprobe') ?: 'ffprobe')
        . ' -v error -count_frames -select_streams v:0 -show_entries stream=nb_read_frames -of csv=p=0 ' . escapeshellarg($out) . ' 2>/dev/null')) : 0;
    // A part video with frames missing would run ahead of its sound on every pass: never offer one.
    if ($got !== $last - $first) {
        @unlink($out);
        throw new RuntimeException('part build failed for ' . basename($out) . ' (' . $got . ' of ' . ($last - $first) . ' frames): '
            . implode(' ', array_slice($lines, -3)));
    }
}

/** Builds every part video of one riff now. Returns a line for the log. */
function video_parts_run($riff) {
    $root = video_root();
    $dir = video_parts_dir($riff);
    $times = video_parts_times($riff);
    if (!$dir || !$times) return '#' . ($riff['id'] ?? '?') . ': no camera video or no part times';
    $src = video_parts_sources($riff);
    if (!is_file($root . '/' . $src['left']) || !is_file($root . '/' . $src['right'])) return $dir . ': camera video missing';
    // Keyframes first: the cameras may be re-encoded right after a save, which would make this build stale at once.
    $starts = video_rekey_starts($riff);
    if ($starts) foreach (video_rekey_videos($riff) as $video) {
        try { video_rekey_run($video, $starts); } catch (Throwable $e) { /* the cameras stay as they are */ }
    }
    $lock = fopen(video_work_dir('parts') . '/' . sha1($dir) . '.lock', 'c');
    if (!$lock || !flock($lock, LOCK_EX)) throw new RuntimeException('could not lock ' . $dir);
    try {
        clearstatcache();
        if (video_parts_ready($riff)) return $dir . ': up to date';
        $src = video_parts_sources($riff);
        $ffmpeg = video_binary('ffmpeg');
        $leftFile = $root . '/' . $src['left'];
        $rightFile = $root . '/' . $src['right'];
        $info = video_probe($leftFile);
        if (!$ffmpeg || !$info || $info['duration'] <= 0) throw new RuntimeException('cannot read ' . $src['left']);
        $fps = video_parts_fps($leftFile);
        $rate = video_parts_rate($leftFile);
        $audio = video_parts_has_audio($leftFile);
        $views = $src['left'] === $src['right'] ? ['left'] : VIDEO_PARTS_VIEWS;
        if (!is_dir($root . '/' . $dir)) mkdir($root . '/' . $dir, 0755, true);
        $files = [];
        foreach ($times as $i => [$start, $end]) {
            $first = (int)round($start * $fps);
            $last = (int)round(min($end, $info['duration']) * $fps);
            if ($last <= $first) $last = $first + 1;
            $hash = substr(sha1(json_encode([$src['left'], $src['right'], $src['leftSize'], $src['rightSize'], $start, $end, VIDEO_PARTS_VERSION])), 0, 10);
            foreach ($views as $view) {
                $file = $dir . '/' . $view . '-' . ($i + 1) . '-' . $hash . '.mp4';
                $files[$view][$i] = $file;
                if (is_file($root . '/' . $file)) continue;
                $tmp = $root . '/' . $dir . '/.part-' . getmypid() . '-' . basename($file);
                video_parts_encode($ffmpeg, $leftFile, $rightFile, $view, $first, $last, $fps, $rate, $audio, $tmp);
                @chmod($tmp, fileperms($leftFile) & 0777);
                if (!rename($tmp, $root . '/' . $file)) { @unlink($tmp); throw new RuntimeException('could not write ' . $file); }
            }
        }
        // One camera: every view shows the same picture.
        if (!isset($files['right'])) $files['right'] = $files['left'];
        if (!isset($files['split'])) $files['split'] = $files['left'];
        // Files of older part times or cameras are no longer offered: remove them.
        $keep = [];
        foreach ($files as $list) foreach ($list as $file) $keep[basename($file)] = true;
        foreach ((array)glob($root . '/' . $dir . '/*.mp4') as $old) {
            if (!isset($keep[basename($old)])) @unlink($old);
        }
        clearstatcache();
        file_put_contents(video_parts_marker($dir), json_encode($src + ['files' => $files, 'fps' => $fps, 'at' => gmdate('c')]));
        return $dir . ': built ' . count($times) . ' parts × ' . count($views) . ' views';
    } finally {
        flock($lock, LOCK_UN);
        fclose($lock);
    }
}
