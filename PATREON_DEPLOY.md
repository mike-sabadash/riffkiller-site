# Patreon auth – production deployment

## 1. Files on server

- **patreon-exchange.php** – must be in the **site root** (same level as `index.html`).
- **patreon-callback.html** – in site root.
- **js/patreon-config.js** – must use production redirect URI (see below).

**Permissions:** `chmod 644 patreon-exchange.php` (readable by web server, writable only for log file if you use it).

## 2. Redirect URI (critical)

- **Production:** `https://riffkiller.fun/patreon-callback.html` (no trailing slash)
- In **Patreon Developer Portal** → your app → **Redirect URIs**, list exactly:
  - `https://riffkiller.fun/patreon-callback.html`
  - `http://localhost:8000/patreon-callback.html` (for local dev)
- **If users land on index.html instead of patreon-callback.html:** Remove any other redirect URIs from the Patreon app (e.g. `https://riffkiller.fun/` or `https://riffkiller.fun/index.html`). Patreon may use the first/default URI when the one we send doesn’t match; keep only the two callback URLs above.
- The auth request always sends `redirect_uri` explicitly; the app’s list must contain that exact URL.

## 3. Client secret

- In **patreon-exchange.php**, `$clientSecret` must match the **Client Secret** in the Patreon app.
- If you rotate the secret in Patreon, update it in `patreon-exchange.php` (and in `patreon-secrets.php` if you use that file).

## 4. Test that the script is reachable

```bash
curl -s "https://riffkiller.fun/patreon-exchange.php?test=1"
# Expected: {"ok":true,"message":"patreon-exchange.php is reachable"}
```

Or open in browser: `https://riffkiller.fun/patreon-exchange.php?test=1`

## 5. Error logging

- On token failure, the script appends one line to **patreon-exchange.log** in the same directory as `patreon-exchange.php`.
- Ensure the directory is writable by the web server (e.g. `chmod 755 .` and create the file once so it’s writable, or rely on PHP creating it).
- Check **PHP error log** (e.g. `error_log` in php.ini or your host’s log dashboard) for PHP errors when `patreon-exchange.php` runs.

## 6. Common “Failed to get token from Patreon” causes

| Cause | What to check |
|-------|----------------|
| Redirect URI mismatch | Patreon app Redirect URIs must include exactly `https://riffkiller.fun/patreon-callback.html`. |
| Wrong client secret | Copy Client Secret from Patreon app into `patreon-exchange.php`. |
| Code already used / expired | Auth codes are one-time and short-lived; user must try “Login with Patreon” again. |
| Script not found | Confirm `patreon-exchange.php` is in site root and URL is `https://riffkiller.fun/patreon-exchange.php`. |
| PHP/CURL errors | Check `patreon-exchange.log` and the PHP error log. |

## Error 1009 (HTTP 403) – Access Denied: Country or region banned

**Cause:** Patreon (or Cloudflare) blocks requests from your production server's IP by region. Error 1009 is Cloudflare. Localhost works because your dev machine IP is not blocked.

**Fix:** Use the proxy so the token request runs from an allowed region (e.g. Vercel in US):

1. Deploy the Patreon proxy from `patreon-proxy-vercel` – see `patreon-proxy-vercel/README.md`.
2. Set **PATREON_PROXY_URL** on your server to the proxy URL (e.g. `https://your-project.vercel.app/api/exchange`): env var or `define('PATREON_PROXY_URL', '...');` in `patreon-exchange.php`.
3. PHP will then forward code + redirect_uri to the proxy; the proxy calls Patreon from Vercel and returns the same JSON.

## Callback redirect to index.html – audit

If Patreon sends the user to `patreon-callback.html?code=...` but they end up on `index.html`, the cause is one of these code paths in `patreon-callback.html`:

- **Redirect to `index.html` (no query):** Only when `if (!code)` runs → `setTimeout(..., 4000)`. So **`code` is missing from the URL** when the script runs. Often the server is redirecting the callback URL and stripping the query (e.g. SPA fallback or clean URLs). Check server/hosting redirect rules.
- **Redirect to `index.html?auth=error`:** Either `if (error)` (Patreon sent `?error=...`) or the `catch` block (fetch failed or response not JSON, or exchange returned `success: false`).

**Logging:** Open DevTools → Console before login. You'll see `[Patreon callback] REDIRECT SOURCE: ...` showing which branch ran. If you see `no code in URL`, the server is stripping the query string. **Auth-manager:** `logout()` no longer redirects when the path contains `patreon-callback`.
