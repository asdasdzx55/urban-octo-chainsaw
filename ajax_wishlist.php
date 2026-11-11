<?php
require_once 'config.php';
require_once __DIR__ . '/storefront_helpers.php';

header('Content-Type: application/json');

$product_id = isset($_POST['product_id']) ? (int)$_POST['product_id'] : 0;
if ($product_id <= 0) {
    echo json_encode(['status' => 'error', 'message' => 'Invalid product ID']);
    exit;
}

// التأكد من وجود المنتج في قاعدة البيانات
$stmt = $pdo->prepare("SELECT COUNT(*) FROM products WHERE id = ? AND " . storefrontVisibleProductSql());
$stmt->execute([$product_id]);
if ($stmt->fetchColumn() == 0) {
    echo json_encode(['status' => 'error', 'message' => 'Product not found']);
    exit;
}

$action = '';

if (isset($_SESSION['user_id'])) {
    // المستخدم مسجل دخول -> الحفظ في قاعدة البيانات
    $user_id = $_SESSION['user_id'];
    
    $check = $pdo->prepare("SELECT id FROM wishlist WHERE user_id = ? AND product_id = ?");
    $check->execute([$user_id, $product_id]);
    $wishlist_item = $check->fetch();
    
    if ($wishlist_item) {
        // موجود بالفعل -> نقوم بحذفه
        $pdo->prepare("DELETE FROM wishlist WHERE id = ?")->execute([$wishlist_item['id']]);
        $action = 'removed';
    } else {
        // غير موجود -> نقوم بإضافته
        $pdo->prepare("INSERT INTO wishlist (user_id, product_id) VALUES (?, ?)")->execute([$user_id, $product_id]);
        $action = 'added';
    }
} else {
    // زائر غير مسجل -> الحفظ في الجلسة (Session)
    if (!isset($_SESSION['wishlist'])) {
        $_SESSION['wishlist'] = [];
    }
    
    if (in_array($product_id, $_SESSION['wishlist'])) {
        // موجود -> نحذفه
        $_SESSION['wishlist'] = array_diff($_SESSION['wishlist'], [$product_id]);
        $_SESSION['wishlist'] = array_values($_SESSION['wishlist']); // إعادة ترتيب المفاتيح
        $action = 'removed';
    } else {
        // غير موجود -> نضيفه
        $_SESSION['wishlist'][] = $product_id;
        $action = 'added';
    }
}

echo json_encode(['status' => 'success', 'action' => $action]);
exit;
?>
