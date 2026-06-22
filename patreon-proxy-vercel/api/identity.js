/**
 * Patreon identity/validate proxy – forwards Bearer token to Patreon identity API.
 * Used by patreon-validate.php when PATREON_PROXY_URL is set (avoids Cloudflare block).
 *
 * GET or POST with header: Authorization: Bearer <access_token>
 * Returns Patreon identity JSON (same as calling Patreon directly).
 */

const PATREON_IDENTITY_URL = 'https://www.patreon.com/api/oauth2/v2/identity?include=memberships&fields[user]=full_name,email,image_url';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': 'https://riffkiller.fun',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json; charset=utf-8',
  };
}

export default {
  async fetch(request) {
    const method = request.method;

    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (method !== 'GET' && method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: corsHeaders(),
      });
    }

    let token = null;
    const auth = request.headers.get('Authorization');
    if (auth && auth.startsWith('Bearer ')) {
      token = auth.slice(7).trim();
    }
    if (!token && method === 'POST') {
      try {
        const body = await request.json();
        token = body.token || body.access_token || null;
      } catch (e) {
        // ignore
      }
    }

    if (!token) {
      return new Response(
        JSON.stringify({ valid: false, error: 'No token provided' }),
        { status: 401, headers: corsHeaders() }
      );
    }

    const identityRes = await fetch(PATREON_IDENTITY_URL, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': 'RiffKiller/1.0 (https://riffkiller.fun)',
      },
    });

    const body = await identityRes.text();
    let data = {};
    try {
      data = body ? JSON.parse(body) : {};
    } catch (e) {
      data = { error: 'Invalid JSON from Patreon' };
    }

    return new Response(JSON.stringify(data), {
      status: identityRes.status,
      headers: corsHeaders(),
    });
  },
};
