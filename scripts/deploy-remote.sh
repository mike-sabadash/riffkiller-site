#!/usr/bin/env bash
# Runs on the production server (uploaded by .github/workflows/deploy.yml).
# Usage: deploy-remote.sh preflight|apply <release.tgz> <sha>
#        deploy-remote.sh rollback <backup-dir>
#        deploy-remote.sh verify   (checks the live vhost through local nginx, bypassing any CDN)
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

# Earlier rollbacks left the document root at 0700 (unreadable for nginx); put it back.
repair_root_mode() {
  if [ "$(stat -c %a "$1")" = 700 ]; then chmod 755 "$1"; note "Repaired document root mode 700 -> 755"; fi
}

restore() {
  local root="$1" backup="$2"
  if [ -f "$backup/new-files" ]; then
    while IFS= read -r f; do [ -n "$f" ] && rm -f "$root/$f"; done < "$backup/new-files"
  fi
  # tar keeps existing directories' modes; `cp -a files/. root/` copied the backup
  # directory's 0700 onto the document root and took the whole site down.
  tar -C "$backup/files" -cf - . | tar -C "$root" -xpf - --no-overwrite-dir
  note "Rolled back from $backup"
}

if [ "$mode" = verify ]; then
  site="${RIFFKILLER_SITE:-riffkiller.fun}"
  conf="/etc/nginx/sites-available/$site"
  [ -f "$conf" ] && note "nginx $site: $(grep -nE '^\s*(listen|server_name|root|fastcgi_pass)\b' "$conf" | sed 's/  */ /g' | tr '\n' '|' | head -c 900)"
  body="$(mktemp)"
  # Candidate ways to reach the vhost: plain DNS, then every local address on 443 and 80.
  transports=("https://$site|")
  if [ -n "${RIFFKILLER_VERIFY_BASE:-}" ]; then transports=("$RIFFKILLER_VERIFY_BASE|"); fi
  for ip in 127.0.0.1 $(hostname -I 2>/dev/null) $(grep -hoE 'listen\s+[0-9.]+' "$conf" 2>/dev/null | awk '{print $2}'); do
    host="$ip"; [[ "$ip" == *:* ]] && host="[$ip]"
    transports+=("https://$site|--resolve $site:443:$host" "http://$host|-H Host:$site")
  done
  fetch() { local url="${1%%|*}" extra="${1#*|}"; curl -s --max-time 15 $extra -o "$3" -w '%{http_code}' "$url/$2" || true; }
  chosen=""; tried=""
  for t in "${transports[@]}"; do
    c="$(fetch "$t" api/me.php "$body")"
    extra="${t#*|}"; tried="$tried ${t%%|*}${extra:+ ($extra)}=$c"
    if [ "$c" = 200 ] && grep -q '^[[{]' "$body"; then chosen="$t"; break; fi
  done
  note "Transports tried:$tried"
  [ -n "$chosen" ] || { echo "::error::api/me.php returned no JSON over any transport; last body: $(head -c 200 "$body" | tr '\n' ' ')" >&2; rm -f "$body"; exit 1; }
  ok=1
  c="$(fetch "$chosen" api/riffs/list.php "$body")"
  if [ "$c" = 200 ] && grep -q '"song"' "$body"; then note "api/riffs/list.php: 200 JSON"; else echo "::error::api/riffs/list.php: HTTP $c" >&2; ok=0; fi
  c="$(fetch "$chosen" "api/test-login.php?token=verify" "$body")"
  if [ "$c" = 200 ] && grep -q '"success":false' "$body" && [ "$(fetch "$chosen" test-login.html "$body")" = 200 ]; then note "test login: page and API answer"
  else echo "::error::test-login.html or api/test-login.php is not served (api HTTP $c)" >&2; ok=0; fi
  for p in "video.php?file=.env" "video.php?file=data/users.json" test.php env-check.php patreon-secrets.php; do
    c="$(fetch "$chosen" "$p" "$body")"
    if [ "$c" = 200 ]; then echo "::error::$p returned 200" >&2; ok=0; else note "$p: $c"; fi
  done
  exposed=""
  for p in .env data/users.json data/subscriptions/ patreon-validate.log; do
    [ "$(fetch "$chosen" "$p" "$body")" = 200 ] && exposed="$exposed $p"
  done
  [ -n "$exposed" ] && echo "::warning::Publicly readable:$exposed (add deploy/nginx-riffkiller-security.conf to nginx)"
  # Google sign-in (informational): the start page must send to Google with our callback,
  # and Google must accept the client id/secret (a made-up code then fails as invalid_grant, not invalid_client).
  url="${chosen%%|*}" extra="${chosen#*|}"
  loc="$(curl -s --max-time 15 $extra -o /dev/null -D - "$url/api/auth/google-login.php" | tr -d '\r' | sed -n 's/^[Ll]ocation: //p' | head -n1 || true)"
  callback="https://$site/api/auth/google-callback.php"
  if [[ "$loc" == https://accounts.google.com/* && "$loc" == *"redirect_uri=$(printf %s "$callback" | sed 's/:/%3A/g; s#/#%2F#g')"* ]]; then
    note "Google sign-in: redirects to Google with $callback"
  else echo "::warning::Google sign-in start does not reach Google: ${loc:-no redirect}" >&2; fi
  env_value() { sed -n "s/^[[:space:]]*$1[[:space:]]*=[[:space:]]*//p" "$(find_root)/.env" 2>/dev/null | tail -n1 | sed "s/^[\"']//; s/[\"'][[:space:]]*$//; s/[[:space:]]*$//"; }
  gid="$(env_value GOOGLE_CLIENT_ID || true)" gsec="$(env_value GOOGLE_CLIENT_SECRET || true)"
  if [ -n "$gid" ] && [ -n "$gsec" ]; then
    gerr="$(printf 'client_id=%s&client_secret=%s&code=verify&grant_type=authorization_code&redirect_uri=%s' "$gid" "$gsec" "$callback" \
      | curl -s --max-time 15 -d @- https://oauth2.googleapis.com/token | grep -o '"error": *"[a-z_]*"' | grep -o '[a-z_]*"$' | tr -d '"' || true)"
    case "$gerr" in
      invalid_grant) note "Google client: id and secret accepted" ;;
      *) echo "::warning::Google client check: ${gerr:-no answer} (invalid_client means GOOGLE_CLIENT_ID/SECRET in .env do not match)" >&2 ;;
    esac
  else echo "::warning::Google client: GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is empty in .env" >&2; fi
  unset gsec
  rm -f "$body"
  [ "$ok" = 1 ]
  exit
fi

if [ "$mode" = rollback ]; then
  backup="${2:?backup dir required}"
  restore "$(cat "$backup/root")" "$backup"
  repair_root_mode "$(cat "$backup/root")"
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
    # Server-managed loader (repaired in place) and local-only development helpers.
    # test-login.html and api/test-login.php ship: the admin's test-account links open them.
    config/load-env.php|package.json|package-lock.json|server.cjs|dev-router.php|api/create-test-account.php|*.log) continue ;;
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
for key in PATREON_CLIENT_ID PATREON_CLIENT_SECRET PATREON_CAMPAIGN_ID PATREON_TIER_IDS PATREON_WEBHOOK_SECRET PATREON_PROXY_URL GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET ADMIN_PASSWORD SITE_URL OPENROUTER_API_KEY LAVA_API_KEY LAVA_OFFER_ID LAVA_WEBHOOK_SECRET ROBOKASSA_LOGIN ROBOKASSA_PASSWORD1 ROBOKASSA_PASSWORD2 YOOKASSA_SHOP_ID YOOKASSA_SECRET_KEY BILLING_RUB_MONTHLY BILLING_RUB_YEARLY USDT_TRC20_ADDRESS TRONGRID_API_KEY; do
  if grep -Eq "^\s*${key}\s*=\s*\S" "$root/.env" 2>/dev/null; then env_set+=("$key"); else env_missing+=("$key"); fi
done
note ".env set: ${env_set[*]:-none}; missing: ${env_missing[*]:-none}"
ff="$(command -v ffmpeg || true)"
note "ffmpeg: ${ff:-missing}${ff:+ ($("$ff" -hide_banner -version 2>/dev/null | head -n1 | cut -c1-60))}"
fpm_ini="$(ls /etc/php/*/fpm/php.ini 2>/dev/null | tail -n1 || true)"
note "php-fpm ini: ${fpm_ini:-none}; disable_functions: $(grep -hE '^\s*disable_functions' "$fpm_ini" /etc/php/*/fpm/pool.d/*.conf 2>/dev/null | tr '\n' ' ' | cut -c1-300); upload_max_filesize: $(grep -hE '^\s*(upload_max_filesize|post_max_size|max_execution_time)' "$fpm_ini" 2>/dev/null | tr '\n' ' ')"

note "Upload limits: pool $(grep -hE '^\s*php(_admin)?_value\[(upload_max_filesize|post_max_size|max_execution_time)' /etc/php/*/fpm/pool.d/*.conf 2>/dev/null | tr '\n' ' '); user.ini $(cat "$root/.user.ini" 2>/dev/null | tr '\n' ' '); nginx $(grep -rhE 'client_max_body_size|fastcgi_read_timeout' /etc/nginx/nginx.conf /etc/nginx/conf.d /etc/nginx/sites-enabled 2>/dev/null | tr -s ' ' | tr '\n' ' ')"
web_user="$(ps -eo user=,comm= | awk '$2 ~ /php-fpm/ && $1 != "root" {print $1; exit}')"
note "Media folders: assets/video $(stat -c '%a %U:%G' "$root/assets/video" 2>/dev/null || echo missing), assets/img $(stat -c '%a %U:%G' "$root/assets/img" 2>/dev/null || echo missing), assets/tabs $(stat -c '%a %U:%G' "$root/assets/tabs" 2>/dev/null || echo missing); web user ${web_user:-unknown}"
[ "$mode" = preflight ] && exit 0
[ "$mode" = apply ] || fail "Unknown mode $mode"
repair_root_mode "$root"

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
  # The admin uploads and cuts videos as the web user: media folders are group-writable for it
  # (setgid keeps the group on new artist/song folders). Nothing is moved or deleted.
  if [ "$(id -u)" = 0 ] && [ -n "$web_user" ]; then
    for d in assets/video assets/img assets/tabs; do
      install -d -m 2775 "$root/$d" || return 1
      chgrp -R "$web_user" "$root/$d" && chmod -R g+rwX "$root/$d" && find "$root/$d" -type d -exec chmod g+s {} + || return 1
    done
  fi
  if [ "$(id -u)" = 0 ]; then chown "$(stat -c %u:%g "$root/data")" "$root/data/logs" || return 1; fi
  for f in "${changed[@]}" "${added[@]}"; do
    if [[ "$f" == *.php ]]; then php -l "$root/$f" >/dev/null || return 1; fi
  done
}
install_release || { restore "$root" "$backup"; fail "Install failed; restored previous files"; }

# Light WebP copies of the cover pictures (config/image-variants.php), written as the web user like admin uploads.
# Only adds files next to the originals; a failure here never fails the deploy.
if [ -f "$root/config/image-variants-cli.php" ] && command -v php >/dev/null; then
  if [ "$(id -u)" = 0 ] && [ -n "$web_user" ]; then
    covers="$(timeout 300 runuser -u "$web_user" -- php "$root/config/image-variants-cli.php" --all 2>&1 | tail -1 || true)"
  else
    covers="$(timeout 300 php "$root/config/image-variants-cli.php" --all 2>&1 | tail -1 || true)"
  fi
  note "${covers:-Cover pictures: no output}"
fi

# USDT payments are checked and Robokassa/YooKassa renewals charged by the site itself, as the web user that writes data/.
php_bin="$(command -v php || true)"
if [ "$(id -u)" = 0 ] && [ -n "$web_user" ] && [ -n "$php_bin" ] && [ -f "$root/config/billing-renew.php" ]; then
  printf '# Installed by riffkiller deploy-remote.sh\n* * * * * %s %s %s/config/billing-renew.php 2>&1 | logger -t riffkiller-billing\n' \
    "$web_user" "$php_bin" "$root" > /etc/cron.d/riffkiller-billing
  chmod 644 /etc/cron.d/riffkiller-billing
  note "Billing cron (USDT check, renewals): /etc/cron.d/riffkiller-billing (every minute as $web_user)"
else
  echo "::warning::Billing renewals cron not installed (uid $(id -u), web user ${web_user:-unknown}, php ${php_bin:-missing})"
fi

# Monday practice summaries (opt-in on the profile): hourly, each student gets theirs on Monday from 8:00 their time.
if [ "$(id -u)" = 0 ] && [ -n "$web_user" ] && [ -n "$php_bin" ] && [ -f "$root/config/progress-digest-cli.php" ]; then
  printf '# Installed by riffkiller deploy-remote.sh\n7 * * * * %s %s %s/config/progress-digest-cli.php 2>&1 | logger -t riffkiller-progress-digest\n' \
    "$web_user" "$php_bin" "$root" > /etc/cron.d/riffkiller-progress-digest
  chmod 644 /etc/cron.d/riffkiller-progress-digest
  note "Practice summary cron: /etc/cron.d/riffkiller-progress-digest (hourly as $web_user)"
fi

ln -sfn "$backup" "$backup_base/last"
note "Deployed $sha; backup $backup"
echo "BACKUP_DIR=$backup"
