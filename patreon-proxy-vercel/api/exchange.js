/**
 * Patreon OAuth token exchange proxy – run on Vercel (US region) to avoid
 * Cloudflare error 1009 when your production server IP is blocked.
 *
 * Set PATREON_CLIENT_ID and PATREON_CLIENT_SECRET in Vercel Environment Variables.
 * Deploy, then set PATREON_PROXY_URL on your server to: https://your-project.vercel.app/api/exchange
 */

const ALLOW_ORIGIN = 'https://riffkiller.fun';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': ALLOW_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json; charset=utf-8',
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: corsHeaders(),
  });
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const method = request.method;

    // OPTIONS preflight (CORS)
    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    // GET ?test=1 – health check
    if (method === 'GET' && url.searchParams.get('test') === '1') {
      return jsonResponse({ ok: true, message: 'proxy is reachable' });
    }

    // Only POST for token exchange
    if (method !== 'POST') {
      return jsonResponse({ success: false, error: 'Method not allowed' }, 405);
    }

    let body = {};
    try {
      const raw = await request.text();
      body = raw ? JSON.parse(raw) : {};
    } catch (e) {
      return jsonResponse({ success: false, error: 'Invalid JSON body' }, 400);
    }

    const code = body.code;
    const redirectUri = body.redirect_uri || 'https://riffkiller.fun/patreon-callback.html';

    if (!code) {
      return jsonResponse({ success: false, error: 'No code provided' }, 400);
    }

    const clientId = process.env.PATREON_CLIENT_ID;
    const clientSecret = process.env.PATREON_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return jsonResponse({
        success: false,
        error: 'Proxy misconfigured: missing PATREON_CLIENT_ID or PATREON_CLIENT_SECRET',
      }, 500);
    }

    // 1) Token exchange with Patreon
    const tokenRes = await fetch('https://www.patreon.com/api/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'RiffKiller/1.0 (https://riffkiller.fun)',
        Accept: 'application/json',
      },
      body: new URLSearchParams({
        code,
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
      }).toString(),
    });

    const tokenText = await tokenRes.text();
    let tokenData = {};
    try {
      tokenData = tokenText ? JSON.parse(tokenText) : {};
    } catch (e) {
      tokenData = {};
    }

    if (tokenRes.status !== 200) {
      const errDesc = tokenData.error_description || tokenData.error || tokenText || 'Unknown';
      return jsonResponse({
        success: false,
        error: tokenData.error === 'invalid_grant' ? 'Redirect URI mismatch or code expired.' : errDesc,
        patreon_error: tokenData.error,
        patreon_description: tokenData.error_description,
        http_code: tokenRes.status,
      });
    }

    const accessToken = tokenData.access_token;
    if (!accessToken) {
      return jsonResponse({ success: false, error: 'No access token received' }, 400);
    }

    // 2) Identity
    const identityRes = await fetch(
      'https://www.patreon.com/api/oauth2/v2/identity?include=memberships&fields[user]=full_name,email,image_url',
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'User-Agent': 'RiffKiller/1.0 (https://riffkiller.fun)',
        },
      }
    );
    const userData = await identityRes.json().catch(() => ({}));

    if (identityRes.status !== 200) {
      return jsonResponse(
        { success: false, error: 'Failed to get user data', details: userData },
        identityRes.status
      );
    }

    let subscriptionStatus = 'inactive';
    const included = userData.included || [];
    for (const inc of included) {
      if (inc.type === 'member') {
        const status = inc.attributes?.patron_status || 'inactive';
        subscriptionStatus = status === 'active_patron' ? 'active' : 'inactive';
        break;
      }
    }

    const out = {
      success: true,
      token: {
        access_token: accessToken,
        refresh_token: tokenData.refresh_token || null,
        expires_in: tokenData.expires_in || 3600,
      },
      user: {
        id: userData.data?.id ?? null,
        full_name: userData.data?.attributes?.full_name ?? 'User',
        email: userData.data?.attributes?.email ?? '',
        image_url: userData.data?.attributes?.image_url ?? 'assets/icons/default-avatar.svg',
      },
      subscription: { status: subscriptionStatus },
    };

    return jsonResponse(out);
  },
};
