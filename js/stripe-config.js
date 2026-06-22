// ==========================================================================
// Stripe Configuration - Riff Killer
// Publishable key from window.ENV (injected by config/env-config.php) or fallback on localhost.
// Secret key is server-side only (.env or localhost fallback in stripe-checkout.php).
// ==========================================================================

var _stripePk = (typeof window !== 'undefined' && window.ENV && window.ENV.STRIPE_PUBLISHABLE_KEY) || '';
if (_stripePk === '' && typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    _stripePk = 'pk_test_51T4o0EE03IBQosTIlzQEQvSWKysRjXwNnmhQC9nVq7fqTePNFxM69VgV9LXyASRB7dNmI1xryPdKQCXltPCLT3UA006dlHcFUU';
}
const STRIPE_CONFIG = {
    publishableKey: _stripePk,
    createCheckoutUrl: '/stripe-checkout.php',
    getSessionUrl: '/stripe-session.php'
};

if (typeof window !== 'undefined') {
    window.STRIPE_CONFIG = STRIPE_CONFIG;
}
