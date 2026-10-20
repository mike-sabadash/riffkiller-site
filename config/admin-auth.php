<?php
/**
 * Admin-only API guard: the admin signs in at /admin/ (ADMIN_PASSWORD), which sets
 * $_SESSION['admin_promo_logged']. The riffs/collections editors run inside that page.
 */
require_once __DIR__ . '/session-start.php';

function require_admin_api() {
    if (!isset($_SESSION['admin_promo_logged']) || $_SESSION['admin_promo_logged'] !== true) {
        http_response_code(403);
        echo json_encode(['success' => false, 'error' => 'Admin sign-in required: open /admin/ and log in.']);
        exit();
    }
}
