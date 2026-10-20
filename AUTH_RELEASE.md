# Google and email authentication — 2026-10-20

Based on production player release `f12338fb7520443925c959d010e980de5c0541b5`.
The live server also has the manually repaired `.env` loader and `.env` permissions
from the Patreon setup. Preserve those server files and all runtime data.

## Behavior

- Email/password login and registration share pending/error handling. Enter submits;
  duplicate submissions and tab changes are disabled during a request. Successful
  login restores the server session and fetches the existing subscription.
- Google uses server-generated, single-use state, a ten-minute attempt lifetime,
  PKCE and a server-side code exchange. Only a verified Google email is accepted.
  Tokens and secrets are not put in browser URLs or logs. Successful login rotates
  the PHP session ID and returns to `app.html`.
- Linked provider identities preserve the legacy Patreon ID and the existing user
  ID, password and subscription when Google is used for the same email.
- The pending Patreon return-to-app fix from PR #4 is included.
- The repository `.env` loader now declares its guard function conditionally.
  PHP registers unconditional functions before execution, which made the old guard
  return before reading `.env`. The already repaired production loader is retained.

## Server configuration

The 2026-10-20 read-only server checks found Patreon and SITE_URL configured, but
neither Google variable. The scoped RiffKiller backup search found no usable Google
credentials. The code is ready; real Google sign-in remains blocked until these
server-only settings are supplied from the Google Web application OAuth JSON:

```
GOOGLE_CLIENT_ID=<web.client_id>
GOOGLE_CLIENT_SECRET=<web.client_secret>
```

Authorized redirect URI: `https://riffkiller.fun/api/auth/google-callback.php`.
Keep `.env` owned by root:www-data with mode 0640. Do not commit credentials.
When credentials are missing, Google returns to the login dialog with an actionable
message and email/Patreon remain available.

Reference: https://developers.google.com/identity/protocols/oauth2/web-server

## Validation and deployment scope

The isolated Google provider fixture exercises the real PHP login/callback/session
flow without a real Google account. It checks rejection/replay/expiry/cancellation,
PKCE exchange, verified identity, stable user ID and Patreon/email preservation.
Browser scenarios cover email signup/login/reload/logout, Enter, pending requests,
wrong-password recovery, Google configuration errors and Patreon return to app.
The existing player/editor tests remain part of CI.

Deployment installs only Google login/callback/helper, provider-store code,
auth-manager.js and patreon-callback.html. It validates previous and new hashes,
backs up replaced code, keeps `.env`, the repaired loader, users, subscriptions,
catalog and player/media files intact, and checks public endpoints.
