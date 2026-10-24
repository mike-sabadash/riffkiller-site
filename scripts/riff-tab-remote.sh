#!/usr/bin/env bash
# Agent tool, runs on the server over SSH (see .github/workflows/riff-tab.yml).
#   riff-tab-remote.sh riffs              → data/riffs.json on stdout
#   riff-tab-remote.sh audio <video path> → mono 22050 Hz WAV of that video on stdout
#   riff-tab-remote.sh apply <patch.json> → writes the tab and sync into the riff (backup first)
#   riff-tab-remote.sh loopdebug           → last lines of data/loop-debug.log (practice.html?debug=loop)
#   riff-tab-remote.sh probe <video path>  → stream timing of a video (start times, durations, edit lists)
#   riff-tab-remote.sh rekey <riff id>      → re-encodes the riff's videos with a keyframe at every part start and
#                                             every 0.2 s (sound copied as is), originals backed up first
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
fail() { echo "::error::$*" >&2; exit 1; }

find_root() {
  if [ -n "${RIFFKILLER_ROOT:-}" ]; then echo "$RIFFKILLER_ROOT"; return; fi
  local found
  found="$(find /var/www /srv -maxdepth 3 -name practice.html -not -path '*backup*' -not -path '*release*' 2>/dev/null | xargs -r -n1 dirname | sort -u)"
  [ "$(printf '%s\n' "$found" | grep -c .)" = 1 ] || fail "Document root not unique: $(echo ${found:-none}). Set RIFFKILLER_ROOT."
  echo "$found"
}
root="$(find_root)"

case "${1:-}" in
  riffs) cat "$root/data/riffs.json" ;;
  audio)
    video="${2:-}"
    [[ "$video" =~ ^assets/video/[A-Za-z0-9._/-]+$ && "$video" != *..* ]] || fail "bad video path: $video"
    [ -f "$root/$video" ] || fail "video not found: $video"
    ffmpeg="$(command -v ffmpeg || true)"; [ -n "$ffmpeg" ] || fail "ffmpeg is not installed on the server"
    "$ffmpeg" -nostdin -v error -i "$root/$video" -vn -ac 1 -ar 22050 -c:a pcm_s16le -f wav - ;;
  loopdebug) tail -n "${2:-200}" "$root/data/loop-debug.log" 2>/dev/null || echo "no loop-debug.log yet" ;;
  probe)
    video="${2:-}"
    [[ "$video" =~ ^assets/video/[A-Za-z0-9._/-]+$ && "$video" != *..* ]] || fail "bad video path: $video"
    [ -f "$root/$video" ] || fail "video not found: $video"
    ffprobe -v error -show_entries format=start_time,duration:stream=index,codec_type,codec_name,start_time,start_pts,duration,time_base,r_frame_rate,nb_frames,sample_rate:stream_side_data -of compact "$root/$video"
    # Edit lists: Safari honours them, Chrome may not, so they can shift the sound against the picture on an iPhone.
    ffprobe -v trace "$root/$video" 2>&1 | grep -iE "elst|edit list|skip_samples|start_pad|priming" | head -20 || true
    # Keyframes in the first seconds (seek precision).
    ffprobe -v error -select_streams v:0 -skip_frame nokey -show_entries frame=pts_time -of csv=p=0 -read_intervals "%+20" "$root/$video" | tr '\n' ' ' | head -c 600; echo ;;
  rekey)
    id="${2:-}"; [[ "$id" =~ ^[0-9]+$ ]] || fail "bad riff id: $id"
    command -v ffmpeg >/dev/null || fail "ffmpeg is not installed on the server"
    # Videos of the riff and its part starts, from data/riffs.json.
    plan="$(php -r '$l=json_decode(file_get_contents($argv[1]),true); $l=isset($l["riffs"])?$l["riffs"]:$l;
      foreach($l as $r){ if((string)($r["id"]??"")!==$argv[2]) continue;
        $t=[]; foreach(($r["segments"]??[]) as $s){ if(is_numeric($s["start"]??null)) $t[]=round((float)$s["start"],3); }
        echo implode(",",array_unique($t)),"\n";
        foreach(array_unique(array_filter([$r["videoFile"]??"",$r["videoFileRight"]??""])) as $v) echo $v,"\n"; exit(0);} exit(2);' "$root/data/riffs.json" "$id")" || fail "riff $id not found"
    starts="$(printf '%s\n' "$plan" | head -1)"
    backup="${RIFFKILLER_VIDEO_BACKUPS:-/var/backups/riffkiller-video}/$(date -u +%Y%m%d-%H%M%S)-riff$id"
    install -d -m 750 "$backup"
    printf '%s\n' "$plan" | tail -n +2 | while read -r video; do
      [[ "$video" =~ ^assets/video/[A-Za-z0-9._/-]+$ && "$video" != *..* ]] || fail "bad video path: $video"
      src="$root/$video"; [ -f "$src" ] || fail "video not found: $video"
      duration="$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$src")"
      # Keyframes: every part start, and every 0.2 s so any other seek decodes at most 6 frames. No B-frames:
      # they add an edit list (picture shifted by two frames) and make a phone decode more per seek.
      keys="$(php -r '$k=array_filter(explode(",",$argv[1]),"strlen"); for($t=0;$t<(float)$argv[2];$t+=0.2) $k[]=round($t,3); $k=array_unique(array_map("floatval",$k)); sort($k); echo implode(",",$k);' "$starts" "$duration")"
      tmp="$(dirname "$src")/.rekey-$$-$(basename "$src")"
      ffmpeg -nostdin -v error -y -i "$src" -map 0:v:0 -map '0:a?' -c:v libx264 -preset slow -crf 16 -bf 0 -pix_fmt yuv420p \
        -force_key_frames "$keys" -c:a copy -movflags +faststart "$tmp"
      newdur="$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$tmp")"
      php -r 'exit(abs((float)$argv[1]-(float)$argv[2])<0.1?0:1);' "$duration" "$newdur" || { rm -f "$tmp"; fail "duration changed for $video: $duration → $newdur"; }
      install -d "$backup/$(dirname "$video")"; cp -p "$src" "$backup/$video"
      chown --reference="$src" "$tmp"; chmod --reference="$src" "$tmp"; mv -f "$tmp" "$src"
      echo "$video: $(stat -c %s "$backup/$video") → $(stat -c %s "$src") bytes, keyframes at part starts: $starts"
    done
    echo "backup: $backup" ;;
  apply)
    php "$here/riff-tab-apply.php" "$root" "${2:?patch}" "${RIFFKILLER_DATA_BACKUPS:-/var/backups/riffkiller-data}" ;;
  *) fail "usage: riff-tab-remote.sh riffs|audio <video>|apply <patch>|loopdebug [lines]|probe <video>|rekey <riff id>" ;;
esac
