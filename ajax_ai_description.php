<?php
/**
 * Syrian Home Supermarket - AI Product Description Controller
 * Endpoints for single generation, auto-fill, and batch generation.
 */
require_once 'config.php';
require_once __DIR__ . '/storefront_helpers.php';
require_once __DIR__ . '/ai_helpers.php';

header('Content-Type: application/json; charset=utf-8');

// Check authentication: either Admin session or valid API token
$is_auth = false;
if (function_exists('isAdmin') && isAdmin()) {
    $is_auth = true;
} else {
    $token = $_SERVER['HTTP_X_API_KEY'] ?? $_REQUEST['token'] ?? '';
    if ($token === 'syrian_home_pos_secret_token_2026') {
        $is_auth = true;
    }
}

if (!$is_auth) {
    http_response_code(403);
    echo json_encode(['success' => false, 'error' => 'غير مصرح بالوصول (يجب تسجيل الدخول كمسؤول)'], JSON_UNESCAPED_UNICODE);
    exit;
}

$action = trim($_POST['action'] ?? $_GET['action'] ?? 'generate_single');

try {
    switch ($action) {
        // 1. توليد وصف لمنتج واحد بناءً على الاسم والقسم (للنموذج الفوري في admin_edit_product)
        case 'generate_single':
            $name = trim($_POST['name'] ?? $_GET['name'] ?? '');
            $category = trim($_POST['category'] ?? $_GET['category'] ?? '');
            $sub_category = trim($_POST['sub_category'] ?? $_GET['sub_category'] ?? '');
            $is_weight_based = !empty($_POST['is_weight_based']) || !empty($_GET['is_weight_based']);
            $price = (float)($_POST['price'] ?? $_GET['price'] ?? 0);

            if ($name === '') {
                echo json_encode(['success' => false, 'error' => 'يرجى كتابة اسم المنتج أولاً.'], JSON_UNESCAPED_UNICODE);
                exit;
            }

            $res = generateAiProductDescription($name, $category, $sub_category, $price, $is_weight_based);
            echo json_encode($res, JSON_UNESCAPED_UNICODE);
            break;

        // 2. توليد وحفظ الوصف لمنتج محدد بالمعرف (ID)
        case 'generate_for_product_id':
            $id = (int)($_POST['product_id'] ?? $_GET['product_id'] ?? 0);
            if ($id <= 0) {
                echo json_encode(['success' => false, 'error' => 'معرف المنتج غير صحيح'], JSON_UNESCAPED_UNICODE);
                exit;
            }

            $stmt = $pdo->prepare("SELECT id, name, category, sub_category, price, is_weight_based, description FROM products WHERE id = ?");
            $stmt->execute([$id]);
            $p = $stmt->fetch(PDO::FETCH_ASSOC);

            if (!$p) {
                echo json_encode(['success' => false, 'error' => 'المنتج غير موجود'], JSON_UNESCAPED_UNICODE);
                exit;
            }

            $res = generateAiProductDescription(
                $p['name'],
                $p['category'] ?? '',
                $p['sub_category'] ?? '',
                (float)$p['price'],
                !empty($p['is_weight_based'])
            );

            if ($res['success'] && !empty($res['description'])) {
                $upd = $pdo->prepare("UPDATE products SET description = ? WHERE id = ?");
                $upd->execute([$res['description'], $id]);
            }

            echo json_encode($res, JSON_UNESCAPED_UNICODE);
            break;

        // 3. إحصائيات الأوصاف للمتجر
        case 'batch_stats':
            $total = (int)$pdo->query("SELECT COUNT(*) FROM products WHERE COALESCE(is_pos_visible, 1) = 1")->fetchColumn();
            $empty = (int)$pdo->query("SELECT COUNT(*) FROM products WHERE COALESCE(is_pos_visible, 1) = 1 AND (description IS NULL OR TRIM(description) = '')")->fetchColumn();
            $filled = $total - $empty;
            $percent = $total > 0 ? round(($filled / $total) * 100, 1) : 0;

            echo json_encode([
                'success' => true,
                'total' => $total,
                'filled' => $filled,
                'empty' => $empty,
                'percent' => $percent
            ], JSON_UNESCAPED_UNICODE);
            break;

        // 4. توليد دفعة (Batch Step) - يولد لـ N منتج دفعة واحدة بنموذج JSON السريع
        case 'batch_step':
            $limit = max(1, min(10, (int)($_POST['limit'] ?? $_GET['limit'] ?? 5)));
            // Prioritize in-stock and items with real images first, then rest
            $stmt = $pdo->prepare("
                SELECT id, name, category, sub_category, price, is_weight_based 
                FROM products 
                WHERE COALESCE(is_pos_visible, 1) = 1 
                  AND (description IS NULL OR TRIM(description) = '')
                ORDER BY 
                    (CASE WHEN stock > 0 THEN 0 ELSE 1 END) ASC,
                    (CASE WHEN image_url IS NOT NULL AND TRIM(image_url) <> '' AND image_url NOT LIKE '%placeholder%' THEN 0 ELSE 1 END) ASC,
                    id ASC
                LIMIT ?
            ");
            $stmt->bindValue(1, $limit, PDO::PARAM_INT);
            $stmt->execute();
            $items = $stmt->fetchAll(PDO::FETCH_ASSOC);

            if (empty($items)) {
                echo json_encode([
                    'success' => true,
                    'done' => true,
                    'processed_count' => 0,
                    'message' => 'تم توليد الأوصاف لجميع المنتجات بنجاح!'
                ], JSON_UNESCAPED_UNICODE);
                exit;
            }

            $batchRes = generateAiProductDescriptionBatch($items);
            $processed = [];
            $errors = [];

            if ($batchRes['success'] && !empty($batchRes['results'])) {
                $updStmt = $pdo->prepare("UPDATE products SET description = ? WHERE id = ?");
                foreach ($items as $it) {
                    $pid = (int)$it['id'];
                    if (isset($batchRes['results'][$pid])) {
                        $descText = $batchRes['results'][$pid];
                        $updStmt->execute([$descText, $pid]);
                        $processed[] = [
                            'id' => $pid,
                            'name' => $it['name'],
                            'category' => $it['category'],
                            'description' => $descText
                        ];
                    } else {
                        // Fallback to single item generation
                        $single = generateAiProductDescription($it['name'], $it['category'] ?? '', $it['sub_category'] ?? '');
                        if ($single['success'] && !empty($single['description'])) {
                            $updStmt->execute([$single['description'], $pid]);
                            $processed[] = [
                                'id' => $pid,
                                'name' => $it['name'],
                                'category' => $it['category'],
                                'description' => $single['description']
                            ];
                        } else {
                            $errors[] = ['id' => $pid, 'name' => $it['name'], 'error' => $single['error'] ?? 'فشل التوليد'];
                        }
                    }
                }
            } else {
                // Fallback to single item generation if batch had error
                $updStmt = $pdo->prepare("UPDATE products SET description = ? WHERE id = ?");
                foreach ($items as $it) {
                    $pid = (int)$it['id'];
                    $single = generateAiProductDescription($it['name'], $it['category'] ?? '', $it['sub_category'] ?? '');
                    if ($single['success'] && !empty($single['description'])) {
                        $updStmt->execute([$single['description'], $pid]);
                        $processed[] = [
                            'id' => $pid,
                            'name' => $it['name'],
                            'category' => $it['category'],
                            'description' => $single['description']
                        ];
                    } else {
                        $errors[] = ['id' => $pid, 'name' => $it['name'], 'error' => $single['error'] ?? 'فشل التوليد'];
                    }
                }
            }

            // Recalculate remaining
            $rem = (int)$pdo->query("SELECT COUNT(*) FROM products WHERE COALESCE(is_pos_visible, 1) = 1 AND (description IS NULL OR TRIM(description) = '')")->fetchColumn();
            $total = (int)$pdo->query("SELECT COUNT(*) FROM products WHERE COALESCE(is_pos_visible, 1) = 1")->fetchColumn();

            echo json_encode([
                'success' => true,
                'done' => $rem === 0,
                'processed_count' => count($processed),
                'remaining_count' => $rem,
                'total_count' => $total,
                'processed' => $processed,
                'errors' => $errors
            ], JSON_UNESCAPED_UNICODE);
            break;

        default:
            echo json_encode(['success' => false, 'error' => 'إجراء غير معروف'], JSON_UNESCAPED_UNICODE);
            break;
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'خطأ في الخادم: ' . $e->getMessage()], JSON_UNESCAPED_UNICODE);
}
