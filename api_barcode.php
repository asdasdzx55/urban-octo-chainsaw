<?php
/**
 * Syrian Home Supermarket - Barcode & QR Code REST API
 * واجهة برمجية للبحث والاستعلام عن المنتجات عبر الباركود ورمز الاستجابة السريع
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, X-API-KEY');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once 'config.php';
require_once __DIR__ . '/storefront_helpers.php';

$action = $_REQUEST['action'] ?? 'lookup';
$raw_input = file_get_contents('php://input');
$json_payload = json_decode($raw_input, true) ?: [];

try {
    switch ($action) {
        // 1. الاستعلام عن باركود منتج معين
        case 'lookup':
        case 'search':
            $barcode = trim($_REQUEST['barcode'] ?? $json_payload['barcode'] ?? $_REQUEST['q'] ?? '');
            
            if (empty($barcode)) {
                echo json_encode([
                    'success' => false,
                    'error' => 'يرجى إدخال أو مسح الباركود للبحث.',
                    'barcode' => ''
                ], JSON_UNESCAPED_UNICODE);
                exit;
            }

            // البحث بالباركود المباشر أو الكود الداخلي أو قائمة الباركودات أو المعرف
            $stmt = $pdo->prepare("
                SELECT id, name, category, sub_category, price, old_price, cost, stock, barcode, barcode2, barcode3, local_code, all_barcodes, image_url, image_url AS image, category AS category_name, description, has_pack, pack_name, pack_barcode, pack_price, pack_qty, is_weight_based, unit_type
                FROM products 
                WHERE barcode = ? 
                   OR local_code = ? 
                   OR barcode2 = ? OR barcode3 = ? OR pack_barcode = ? OR all_barcodes LIKE ?
                   OR id = ?
                LIMIT 1
            ");
            $like_barcode = '%' . $barcode . '%';
            $stmt->execute([$barcode, $barcode, $barcode, $barcode, $barcode, $like_barcode, is_numeric($barcode) ? (int)$barcode : 0]);
            $product = $stmt->fetch(PDO::FETCH_ASSOC);

            if ($product) {
                $product['id'] = (int)$product['id'];
                $product['price'] = (float)$product['price'];
                $product['cost'] = (float)($product['cost'] ?? 0);
                $product['stock'] = (float)($product['stock'] ?? 0);
                $product['image_url'] = resolveProductDisplayImage($pdo, $product);
                $product['image'] = $product['image_url'];
                $product['has_real_image'] = ($product['image_url'] !== '');
                $product['is_active'] = 1;
                
                echo json_encode([
                    'success' => true,
                    'found' => true,
                    'message' => 'تم العثور على المنتج بنجاح',
                    'product' => $product
                ], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
            } else {
                echo json_encode([
                    'success' => true,
                    'found' => false,
                    'message' => 'لم يتم العثور على منتج مطابق لهذا الباركود',
                    'scanned_code' => $barcode
                ], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
            }
            break;

        // 2. فحص متعدد لمجموعة باركودات (Batch Lookup)
        case 'batch_lookup':
            $barcodes = $json_payload['barcodes'] ?? (isset($_REQUEST['barcodes']) ? explode(',', $_REQUEST['barcodes']) : []);
            if (empty($barcodes) || !is_array($barcodes)) {
                echo json_encode(['success' => false, 'error' => 'مصفوفة الباركودات فارغة'], JSON_UNESCAPED_UNICODE);
                exit;
            }

            $results = [];
            $stmt = $pdo->prepare("SELECT id, name, category, sub_category, price, old_price, cost, stock, barcode, barcode2, barcode3, local_code, all_barcodes, image_url, image_url AS image, category AS category_name, description, has_pack, pack_name, pack_barcode, pack_price, pack_qty, is_weight_based, unit_type FROM products WHERE barcode = ? OR barcode2 = ? OR barcode3 = ? OR pack_barcode = ? OR local_code = ? OR all_barcodes LIKE ? LIMIT 1");

            foreach ($barcodes as $code) {
                $code = trim($code);
                if (empty($code)) continue;
                $like_c = '%' . $code . '%';
                $stmt->execute([$code, $code, $code, $code, $code, $like_c]);
                $prod = $stmt->fetch(PDO::FETCH_ASSOC);
                if ($prod) {
                    $prod['image_url'] = resolveProductDisplayImage($pdo, $prod);
                    $prod['image'] = $prod['image_url'];
                    $prod['has_real_image'] = ($prod['image_url'] !== '');
                }
                $results[$code] = $prod ?: null;
            }

            echo json_encode([
                'success' => true,
                'count' => count($results),
                'items' => $results
            ], JSON_UNESCAPED_UNICODE);
            break;

        // 3. فحص حالة الـ API
        case 'ping':
        default:
            echo json_encode([
                'success' => true,
                'status' => 'online',
                'service' => 'Syrian Home Barcode & Scanner API',
                'version' => '1.0.0',
                'time' => date('Y-m-d H:i:s'),
                'endpoints' => [
                    'lookup' => 'api_barcode.php?action=lookup&barcode={CODE}',
                    'batch_lookup' => 'POST api_barcode.php?action=batch_lookup with JSON {barcodes: [...]}'
                ]
            ], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
            break;
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'خطأ في معالجة طلب الباركود: ' . $e->getMessage()
    ], JSON_UNESCAPED_UNICODE);
}
