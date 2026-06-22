<?php
/**
 * Base URL for OAuth redirect_uri and post-login redirects.
 * Если задан OAUTH_REDIRECT_BASE в .env — используется он (чтобы совпадал с кабинетами Яндекс/Google).
 * Локально иначе берём хост из запроса; на проде — SITE_URL из .env.
 */
if (!function_exists('get_site_base_url')) {
    function get_site_base_url() {
        $override = getenv('OAUTH_REDIRECT_BASE') ?: (isset($_ENV['OAUTH_REDIRECT_BASE']) ? $_ENV['OAUTH_REDIRECT_BASE'] : '');
        if ($override === '' && !empty($GLOBALS['RIFFKILLER_ENV']['OAUTH_REDIRECT_BASE'])) {
            $override = $GLOBALS['RIFFKILLER_ENV']['OAUTH_REDIRECT_BASE'];
        }
        if ($override === '') {
            $envFile = dirname(__DIR__) . DIRECTORY_SEPARATOR . '.env';
            if (is_file($envFile) && ($raw = @file_get_contents($envFile)) && preg_match('/^\s*OAUTH_REDIRECT_BASE\s*=\s*([^\s#]+)/m', $raw, $m)) {
                $override = trim($m[1], " \t\"'");
            }
        }
        if ($override !== '') {
            return rtrim($override, '/');
        }

        $protocol = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on') ? 'https' : 'http';
        $host = $_SERVER['HTTP_HOST'] ?? '';
        $requestOrigin = rtrim($protocol . '://' . $host, '/');

        $isLocal = (
            $host === 'localhost'
            || strpos($host, 'localhost:') === 0
            || strpos($host, '127.0.0.1') !== false
            || preg_match('/\.local$/i', $host)
        );
        if ($isLocal) {
            return $requestOrigin;
        }

        $siteUrl = getenv('SITE_URL') ?: (isset($_ENV['SITE_URL']) ? $_ENV['SITE_URL'] : '');
        if ($siteUrl === '' && !empty($GLOBALS['RIFFKILLER_ENV']['SITE_URL'])) {
            $siteUrl = $GLOBALS['RIFFKILLER_ENV']['SITE_URL'];
        }
        if ($siteUrl === '') {
            $envFile = dirname(__DIR__) . DIRECTORY_SEPARATOR . '.env';
            if (is_file($envFile) && ($raw = @file_get_contents($envFile)) && preg_match('/^\s*SITE_URL\s*=\s*([^\s#]+)/m', $raw, $m)) {
                $siteUrl = trim($m[1], " \t\"'");
            }
        }
        $siteUrl = $siteUrl !== '' ? rtrim($siteUrl, '/') : $requestOrigin;
        return $siteUrl;
    }
}
