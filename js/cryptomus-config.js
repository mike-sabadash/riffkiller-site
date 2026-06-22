// ==========================================================================
// Cryptomus Configuration - Riff Killer (international / crypto payments)
// Load before billing-cryptomus.html and cryptomus-success.html
// Wallet (USDT TRC-20) is configured in Cryptomus dashboard, not here.
// ==========================================================================

const CRYPTOMUS_CONFIG = {
    // Merchant UUID from Cryptomus dashboard (do not put API key here - client is public)
    merchantId: '[INSERT]',

    // API endpoints (same origin)
    createPaymentUrl: '/cryptomus-create.php',
    statusUrl: '/cryptomus-status.php'
};

if (typeof window !== 'undefined') {
    window.CRYPTOMUS_CONFIG = CRYPTOMUS_CONFIG;
}
