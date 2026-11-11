<?php
/**
 * Automated Deployer: copies files from git clone to live pos/ and api_sync.php
 */
error_reporting(E_ALL);
ini_set('display_errors', 1);

$token = $_GET['token'] ?? $_POST['token'] ?? '';
if ($token !== 'syrian_home_pos_secret_token_2026') {
    http_response_code(403);
    die(json_encode(['error' => 'Unauthorized']));
}

$sourceDir = __DIR__;
$targetRoot = dirname(__DIR__); // public_html

$copied = [];
$errors = [];

// 1. Copy api_sync.php
$apiSyncSrc = $sourceDir . '/api_sync.php';
$apiSyncDst = $targetRoot . '/api_sync.php';
if (file_exists($apiSyncSrc)) {
    if (copy($apiSyncSrc, $apiSyncDst)) {
        $copied[] = 'api_sync.php';
    } else {
        $errors[] = 'Failed to copy api_sync.php';
    }
}

// 2. Recursively copy pos/ directory
function copyFolder($src, $dst, &$copied, &$errors) {
    if (!is_dir($dst)) {
        mkdir($dst, 0755, true);
    }
    $dir = opendir($src);
    while (false !== ($file = readdir($dir))) {
        if ($file != '.' && $file != '..' && $file != '.git') {
            if (is_dir($src . '/' . $file)) {
                copyFolder($src . '/' . $file, $dst . '/' . $file, $copied, $errors);
            } else {
                if (copy($src . '/' . $file, $dst . '/' . $file)) {
                    $copied[] = $dst . '/' . $file;
                } else {
                    $errors[] = 'Failed to copy ' . $file;
                }
            }
        }
    }
    closedir($dir);
}

$rootPhpFiles = [
    'storefront_helpers.php',
    'index.php',
    'shop.php',
    'product.php',
    'wishlist.php',
    'ajax_wishlist.php',
    'ajax_chat.php',
    'admin_products.php',
    'admin_edit_product.php',
    'api_barcode.php',
];
foreach ($rootPhpFiles as $rootFile) {
    $srcPath = $sourceDir . '/' . $rootFile;
    $dstPath = $targetRoot . '/' . $rootFile;
    if (file_exists($srcPath)) {
        if (copy($srcPath, $dstPath)) {
            if (function_exists('opcache_invalidate')) {
                @opcache_invalidate($dstPath, true);
            }
            $copied[] = $rootFile;
        } else {
            $errors[] = 'Failed to copy ' . $rootFile;
        }
    }
}
if (file_exists($apiSyncDst) && function_exists('opcache_invalidate')) {
    @opcache_invalidate($apiSyncDst, true);
}

$posSrc = $sourceDir . '/pos';
$posDst = $targetRoot . '/pos';
if (is_dir($posSrc)) {
    copyFolder($posSrc, $posDst, $copied, $errors);
}

echo json_encode([
    'success' => count($errors) === 0,
    'copied_count' => count($copied),
    'copied' => $copied,
    'errors' => $errors
], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
