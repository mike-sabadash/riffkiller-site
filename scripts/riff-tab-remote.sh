#!/usr/bin/env bash
# Agent tool, runs on the server over SSH (see .github/workflows/riff-tab.yml).
#   riff-tab-remote.sh riffs              → data/riffs.json on stdout
#   riff-tab-remote.sh audio <video path> → mono 22050 Hz WAV of that video on stdout
#   riff-tab-remote.sh apply <patch.json> → writes the tab and sync into the riff (backup first)
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
  apply)
    php "$here/riff-tab-apply.php" "$root" "${2:?patch}" "${RIFFKILLER_DATA_BACKUPS:-/var/backups/riffkiller-data}" ;;
  *) fail "usage: riff-tab-remote.sh riffs|audio <video>|apply <patch>" ;;
esac
