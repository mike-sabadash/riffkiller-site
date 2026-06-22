// ==========================================================================
// Patreon Configuration - Works with both localhost and production
// ==========================================================================
// Load this file before patreon-auth.js on all pages.
// Patreon app must list EXACT redirect URIs: https://riffkiller.fun/patreon-callback.html and http://localhost:8000/patreon-callback.html (no trailing slash)

const PATREON_PRODUCTION_CALLBACK = 'https://riffkiller.fun/patreon-callback.html';
const PATREON_LOCALHOST_CALLBACK = 'http://localhost:8000/patreon-callback.html';

function getPatreonRedirectUri() {
    const host = typeof window !== 'undefined' ? window.location.hostname : '';
    if (host === 'localhost' || host === '127.0.0.1') return PATREON_LOCALHOST_CALLBACK;
    return PATREON_PRODUCTION_CALLBACK;
}

// Главная страница кампании Patreon — здесь пользователь выбирает план "Riff Killer" и подписывается
const PATREON_CAMPAIGN_URL = 'https://www.patreon.com/cw/MikeSabadash?vanity=MikeSabadash';

const PATREON_CONFIG = {
    clientId: '5LA_sQVFkho7zdC6d798d-rYBeBOa2h5r2vUO44p3LCKfE5rNLQfzKq6kY0mz6r2',
    redirectUri: getPatreonRedirectUri(),
    apiBase: 'https://www.patreon.com',
    responseType: 'code',
    scope: 'identity identity[email] identity.memberships campaigns',
    campaignUrl: typeof PATREON_CAMPAIGN_URL !== 'undefined' ? PATREON_CAMPAIGN_URL : 'https://www.patreon.com/cw/MikeSabadash?vanity=MikeSabadash'
};

console.log('Patreon redirect URI:', PATREON_CONFIG.redirectUri);