#!/usr/bin/env bash
# Agent tool, runs on the server over SSH (see .github/workflows/riff-tab.yml).
#   riff-tab-remote.sh riffs              → data/riffs.json on stdout
#   riff-tab-remote.sh audio <video path> → mono 22050 Hz WAV of that video on stdout
#   riff-tab-remote.sh apply <patch.json> → writes the tab and sync into the riff (backup first)
#   riff-tab-remote.sh loopdebug           → last lines of data/loop-debug.log (practice.html?debug=loop)
#   riff-tab-remote.sh probe <video path>  → stream timing of a video (start times, durations, edit lists)
#   riff-tab-remote.sh media <request.json>  → puts a riff's videos (files next to this script) in place and writes
#                                             its parts, DNA and tab (scripts/riff-media-apply.php, backups first)
#   riff-tab-remote.sh rekey <riff id|all>  → re-encodes the riff's videos with a keyframe at every part start and
#                                             every 0.2 s (sound copied as is), first original kept in data/video-work
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
    # Same code as saving a riff in the admin (config/video-rekey.php); "all" does every riff.
    id="${2:-}"; [[ "$id" =~ ^([0-9]+|all)$ ]] || fail "bad riff id: $id"
    command -v ffmpeg >/dev/null || fail "ffmpeg is not installed on the server"
    if [ "$id" = all ]; then php "$root/config/video-rekey-cli.php" --all; else php "$root/config/video-rekey-cli.php" --riff "$id"; fi
    # Run over SSH as another user than the web server: let the site keep writing its work files.
    chown -R --reference="$root/data" "$root/data/video-work" 2>/dev/null || true ;;
  media)
    php "$here/riff-media-apply.php" "$root" "${2:?request}" "$here" "${RIFFKILLER_MEDIA_BACKUPS:-/var/backups/riffkiller-data}"
    # Same owner as the site's other videos and data, so the admin can still replace them.
    chown -R --reference="$root/assets/video" "$root/assets/video" 2>/dev/null || true
    chown --reference="$root/data" "$root/data/riffs.json" 2>/dev/null || true ;;
  apply)
    php "$here/riff-tab-apply.php" "$root" "${2:?patch}" "${RIFFKILLER_DATA_BACKUPS:-/var/backups/riffkiller-data}" ;;
  *) fail "usage: riff-tab-remote.sh riffs|audio <video>|apply <patch>|media <request>|loopdebug [lines]|probe <video>|rekey <riff id|all>" ;;
esac
