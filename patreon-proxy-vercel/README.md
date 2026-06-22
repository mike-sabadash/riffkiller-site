# Patreon token exchange proxy (Vercel)

Use this when your **production server** gets **Patreon/Cloudflare error 1009** (403 – Access Denied: Country or region banned). The request from your server to Patreon is blocked by region; this proxy runs on Vercel (US) so the request to Patreon comes from an allowed IP.

## Deploy on Vercel

1. **Install Vercel CLI** (if needed): `npm i -g vercel`

2. **Create a new Vercel project** from this folder:
   ```bash
   cd patreon-proxy-vercel
   vercel
   ```
   Or link an existing project: `vercel link`

3. **Set environment variables** in Vercel dashboard (Project → Settings → Environment Variables):
   - `PATREON_CLIENT_ID` – your Patreon app Client ID
   - `PATREON_CLIENT_SECRET` – your Patreon app Client Secret

4. **Redeploy** after setting env vars: `vercel --prod`

5. **Copy the function URL**, e.g. `https://your-project.vercel.app/api/exchange`

**Test:**
- GET with `?test=1`: `curl -s "https://your-project.vercel.app/api/exchange?test=1"` → `{"ok":true,"message":"proxy is reachable"}`
- POST (with a real or test code): `curl -X POST "https://your-project.vercel.app/api/exchange" -H "Content-Type: application/json" -d '{"code":"test","redirect_uri":"https://riffkiller.fun/patreon-callback.html"}'` → Patreon response (error or success)

## Use the proxy on your server

On the **production server** (where `patreon-exchange.php` runs), set the proxy URL so PHP forwards the token request to Vercel instead of calling Patreon directly:

**Option A – environment variable (recommended)**  
In your server config (e.g. Apache `SetEnv`, Nginx `fastcgi_param`, or `.env` if you load it in PHP):
```text
PATREON_PROXY_URL=https://your-project.vercel.app/api/exchange
```

**Option B – constant in PHP**  
At the top of `patreon-exchange.php` (after `<?php`), before any logic:
```php
define('PATREON_PROXY_URL', 'https://your-project.vercel.app/api/exchange');
```

Then leave the rest of the flow as is: the user still hits your site → Patreon → your `patreon-callback.html` → your `patreon-exchange.php`. PHP will POST `code` and `redirect_uri` to the proxy; the proxy calls Patreon from Vercel and returns the same JSON shape, and PHP forwards it to the client.

## Identity/validate endpoint

The proxy also exposes **`/api/identity`** for token validation. When `PATREON_PROXY_URL` is set on your server, `patreon-validate.php` will call `https://your-project.vercel.app/api/identity` (derived from the exchange URL) with the Bearer token instead of calling Patreon directly. That avoids Cloudflare block (error 1009) on validation too. Use the same `PATREON_PROXY_URL` (env or define) as for exchange; no extra config needed.

## CORS

The proxy allows origin `https://riffkiller.fun`. If you use another domain, change `ALLOW_ORIGIN` in `api/exchange.js` and `api/identity.js`.
