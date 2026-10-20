#!/usr/bin/env bash
# Runs on the production server (uploaded by .github/workflows/deploy.yml).
# Usage: deploy-remote.sh preflight|apply <release.tgz> <sha>
#        deploy-remote.sh rollback <backup-dir>
#
# The document root is not a git checkout and holds live state (.env, data/,
# uploaded media). Only code from the release is installed: data/, .env and
# assets/video are never touched, existing assets are never overwritten, and
# every replaced or retired file is moved to a dated backup first.
set -euo pipefail

mode="${1:?mode required}"
backup_base="${RIFFKILLER_BACKUP_DIR:-/var/backups/riffkiller}"
[ "$(id -u)" = 0 ] || backup_base="${RIFFKILLER_BACKUP_DIR:-$HOME/riffkiller-backups}"
note() { echo "::notice::$*"; }
fail() { echo "::error::$*" >&2; exit 1; }

find_root() {
  if [ -n "${RIFFKILLER_ROOT:-}" ]; then echo "$RIFFKILLER_ROOT"; return; fi
  local found
  found="$(find /var/www /srv -maxdepth 3 -name practice.html -not -path '*backup*' -not -path '*release*' 2>/dev/null | xargs -r -n1 dirname | sort -u)"
  [ "$(printf '%s\n' "$found" | grep -c .)" = 1 ] || fail "Document root not unique: $(echo ${found:-none}). Set RIFFKILLER_ROOT."
  echo "$found"
}

# Files the release replaced in the past or that must never be public.
retired_files() {
  local root="$1"
  for f in test.php env-check.php patreon-secrets.php server.cjs.save \
           js/patreon-auth.js.save js/patreon-config.js.save patreon-proxy-vercel.zip; do
    [ -e "$root/$f" ] && echo "$f"
  done
  [ -d "$root/patreon-proxy-vercel" ] && echo "patreon-proxy-vercel"
  (cd "$root" && find . -maxdepth 1 -type f -name '*.log' -printf '%P\n')
}

restore() {
  local root="$1" backup="$2"
  if [ -f "$backup/new-files" ]; then
    while IFS= read -r f; do [ -n "$f" ] && rm -f "$root/$f"; done < "$backup/new-files"
  fi
  cp -a "$backup/files/." "$root/"
  note "Rolled back from $backup"
}

if [ "$mode" = rollback ]; then
  backup="${2:?backup dir required}"
  restore "$(cat "$backup/root")" "$backup"
  exit 0
fi

release="${2:?release tarball required}"
sha="${3:?sha required}"
root="$(find_root)"
stage="$(mktemp -d)"
trap 'rm -rf "$stage"' EXIT
tar -xzf "$release" -C "$stage"

changed=(); added=()
while IFS= read -r f; do
  case "$f" in
    data/*|.env*|assets/video/*|.github/*|.claude/*|tests/*|tools/*|docs/*|deploy/*|scripts/*|*.md|.cursorrules|.gitignore) continue ;;
    # Server-managed loader (repaired in place) and local-only development/test helpers.
    config/load-env.php|package.json|package-lock.json|server.cjs|dev-router.php|test-login.html|api/test-login.php|api/create-test-account.php|*.log) continue ;;
  esac
  if [ ! -e "$root/$f" ]; then added+=("$f")
  elif [[ "$f" == assets/* ]]; then continue
  elif ! cmp -s "$stage/$f" "$root/$f"; then changed+=("$f")
  fi
done < <(cd "$stage" && find . -type f -printf '%P\n' | sort)
mapfile -t retired < <(retired_files "$root")

note "Root: $root (owner $(stat -c %U:%G "$root")), running as $(id -un), release $sha"
note "Web server: $(ps -eo comm= | grep -E '^(nginx|apache2|httpd|caddy|php-fpm)' | sort -u | tr '\n' ' ')config: $(grep -rlI 'riffkiller' /etc/nginx /etc/apache2 /etc/caddy 2>/dev/null | tr '\n' ' ')"
note "Changed ${#changed[@]}: ${changed[*]:-none}"
note "Added ${#added[@]}: ${added[*]:-none}"
note "Retired ${#retired[@]}: ${retired[*]:-none}"
env_set=(); env_missing=()
for key in PATREON_CLIENT_ID PATREON_CLIENT_SECRET PATREON_CAMPAIGN_ID PATREON_TIER_IDS PATREON_WEBHOOK_SECRET PATREON_PROXY_URL GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET ADMIN_PASSWORD SITE_URL; do
  if grep -Eq "^\s*${key}\s*=\s*\S" "$root/.env" 2>/dev/null; then env_set+=("$key"); else env_missing+=("$key"); fi
done
note ".env set: ${env_set[*]:-none}; missing: ${env_missing[*]:-none}"

[ "$mode" = preflight ] && exit 0
[ "$mode" = apply ] || fail "Unknown mode $mode"

backup="$backup_base/$(date -u +%Y%m%dT%H%M%SZ)-${sha:0:7}"
install -d -m 700 "$backup/files"
echo "$root" > "$backup/root"
printf '%s\n' "${added[@]}" > "$backup/new-files"
for f in "${changed[@]}" "${retired[@]}"; do
  (cd "$root" && cp -a --parents "$f" "$backup/files/")
done

owner="$(stat -c %u:%g "$root")"
install_release() {
  local f
  for f in "${changed[@]}"; do cat "$stage/$f" > "$root/$f" || return 1; done
  for f in "${added[@]}"; do
    install -D -m 644 "$stage/$f" "$root/$f" || return 1
    if [ "$(id -u)" = 0 ]; then chown "$owner" "$root/$f" || return 1; fi
  done
  for f in "${retired[@]}"; do rm -rf "${root:?}/$f" || return 1; done
  install -d -m 750 "$root/data/logs" || return 1
  if [ "$(id -u)" = 0 ]; then chown "$(stat -c %u:%g "$root/data")" "$root/data/logs" || return 1; fi
  for f in "${changed[@]}" "${added[@]}"; do
    if [[ "$f" == *.php ]]; then php -l "$root/$f" >/dev/null || return 1; fi
  done
}
install_release || { restore "$root" "$backup"; fail "Install failed; restored previous files"; }

ln -sfn "$backup" "$backup_base/last"
note "Deployed $sha; backup $backup"
echo "BACKUP_DIR=$backup"
