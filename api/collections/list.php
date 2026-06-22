<?php
/**
 * GET: коллекции с полем riffs[] и videoCount — собирается из collectionIds у риффов.
 */
error_reporting(0);
ini_set('display_errors', 0);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate');
header('Pragma: no-cache');
header('Expires: 0');

require_once dirname(__DIR__, 2) . '/config/collections-lib.php';

echo json_encode(rk_collections_build_list());
