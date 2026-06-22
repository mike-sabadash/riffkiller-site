# Riff Killer – Setup instructions

This guide covers environment variables, Stripe and Cryptomus webhooks, and file permissions.

---

## 1. Environment variables (.env)

All secrets live in a `.env` file at the project root. **Do not commit `.env` to git.**

### Create .env

The project includes a `.env` file with Stripe keys pre-filled and Cryptomus placeholders (`CHANGE_ME`).  
To start from scratch: copy `cp .env.example .env` and fill in the variables below.

### Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `STRIPE_PUBLISHABLE_KEY` | Yes (for Stripe) | Publishable key from [Stripe Dashboard → API keys](https://dashboard.stripe.com/apikeys). Safe for frontend. |
| `STRIPE_SECRET_KEY` | Yes (for Stripe) | Secret key from same page. **Server-side only.** |
| `STRIPE_WEBHOOK_SECRET` | Yes (for webhooks) | Signing secret from Stripe Dashboard → Webhooks → your endpoint → “Signing secret”. |
| `CRYPTOMUS_MERCHANT_ID` | Yes (for Cryptomus) | From [Cryptomus](https://cryptomus.com) dashboard. |
| `CRYPTOMUS_API_KEY` | Yes (for Cryptomus) | API key from Cryptomus. Used for webhook signature verification. |
| `PATREON_PROXY_URL` | Optional | If using Vercel proxy for Patreon (e.g. `https://your-project.vercel.app/api/exchange`). |
| `SUBSCRIPTION_UPDATE_SECRET` | Optional | If set, `api/subscription/update.php` requires header `X-Api-Key` with this value for POST requests. |

- PHP loads `.env` via `config/load-env.php` (included by checkout, webhooks, session, and API scripts).
- The frontend gets **only** `STRIPE_PUBLISHABLE_KEY` via `config/env-config.php` (sets `window.ENV`). No other secrets are exposed to the client.

---

## 2. Stripe webhooks

1. In [Stripe Dashboard → Webhooks](https://dashboard.stripe.com/webhooks), click **Add endpoint**.
2. **Endpoint URL:** `https://your-domain.com/stripe-webhook.php` (e.g. `https://riffkiller.fun/stripe-webhook.php`).
3. **Events to send:**  
   - `checkout.session.completed`  
   - `invoice.paid` (optional, for renewal updates)  
   - `customer.subscription.deleted` (optional)
4. After creating the endpoint, open it and reveal **Signing secret** (starts with `whsec_`).
5. Put that value in `.env` as `STRIPE_WEBHOOK_SECRET`.

Stripe will send a signature in the `Stripe-Signature` header. `stripe-webhook.php` uses `STRIPE_WEBHOOK_SECRET` to verify it; if the secret is missing or wrong, the script returns 500 and does not process the event.

---

## 3. Cryptomus keys and webhook

1. Log in at [Cryptomus](https://cryptomus.com).
2. In the dashboard, find **Merchant ID** and **API key**.
3. Set them in `.env` as `CRYPTOMUS_MERCHANT_ID` and `CRYPTOMUS_API_KEY`.
4. In Cryptomus, set the **Callback (webhook) URL** to:  
   `https://your-domain.com/cryptomus-webhook.php`

Cryptomus signs the callback body; `cryptomus-webhook.php` verifies the signature using `CRYPTOMUS_API_KEY`. If the key is wrong or missing, verification fails.

---

## 4. Unified subscription system

- **Storage:** One JSON file per user: `data/subscriptions/{userId}.json`.
- **Format:** `{ "status": "active", "plan": "monthly", "source": "stripe", "expires": 1234567890 }`.
- **Writes:** Stripe and Cryptomus webhooks call `save_subscription()` (from `config/subscription-store.php`) so all payment methods update the same store.
- **Reads:**  
  - Frontend: `GET /api/subscription/get.php?user_id=xxx` (and optionally `?session_id=xxx` for Stripe success).  
  - Auth-manager loads session from localStorage and then fetches from `get.php` to keep subscription in sync.  
  - Profile page shows Plan, Status, Payment method (Stripe/Cryptomus/Patreon), and next billing date from this data.

---

## 5. File permissions

The server must be able to create and write files in:

- `data/subscriptions/` – per-user subscription JSON files (created by webhooks and `api/subscription/update.php`).
- Optional log files (if used): e.g. `stripe-checkout.log`, `stripe-webhook.log` in the project root.

Suggested (run from project root):

```bash
mkdir -p data/subscriptions
chmod 755 data
chmod 755 data/subscriptions
# Web server user (e.g. www-data for Apache/Nginx) must be able to write here
chown -R www-data:www-data data
# Or, if your PHP runs as a different user, use that user instead of www-data
```

Ensure the PHP process user can write to `data/subscriptions`. If you see “permission denied” or missing files after a payment, fix these permissions.

---

## 6. Quick checklist

- [ ] `.env` exists with `STRIPE_*` keys set (Cryptomus: replace `CHANGE_ME` when used).
- [ ] `.env` in `.gitignore` (do not commit it).
- [ ] Stripe webhook endpoint added and `STRIPE_WEBHOOK_SECRET` in `.env`.
- [ ] Cryptomus callback URL set and Cryptomus keys in `.env`.
- [ ] `data/subscriptions` exists and is writable by the web server.
- [ ] Pages that use Stripe (billing, stripe-success, billing-stripe) load `config/env-config.php` before `stripe-config.js` so `window.ENV.STRIPE_PUBLISHABLE_KEY` is set.

After that, subscription status from Stripe, Cryptomus, and Patreon is stored in one place and shown correctly in the profile.
