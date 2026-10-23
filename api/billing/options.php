<?php
/**
 * GET: which card payment providers are enabled, RUB prices, and whether the visitor is signed in.
 */
require __DIR__ . '/_common.php';

$user = billing_session_user();
billing_reply(200, [
    'success' => true,
    'providers' => billing_public_options(),
    'signedIn' => $user !== null,
    'hasEmail' => $user !== null && filter_var($user['email'] ?? '', FILTER_VALIDATE_EMAIL) !== false,
]);
