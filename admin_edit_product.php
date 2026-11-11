<?php
require_once 'config.php';
require_once __DIR__ . '/storefront_helpers.php';

// التحقق من رتبة المدير
if (!isAdmin()) {
    header("Location: login.php");
    exit;
}

$is_edit = isset($_GET['id']);
$product = ['name'=>'', 'category'=>'', 'price'=>'', 'old_price'=>'', 'description'=>'', 'image_url'=>''];
$product_gallery = [];
$product_variants = [];
$prod_id = 0;

if ($is_edit) {
    $prod_id = (int)$_GET['id'];
    $stmt = $pdo->prepare("SELECT * FROM products WHERE id = ?");
    $stmt->execute([$prod_id]);
    $product = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$product) {
        die("المنتج غير موجود.");
    }
    
    // جلب صور المعرض
    $gal_stmt = $pdo->prepare("SELECT * FROM product_images WHERE product_id = ? ORDER BY is_main DESC, id ASC");
    $gal_stmt->execute([$prod_id]);
    $product_gallery = $gal_stmt->fetchAll(PDO::FETCH_ASSOC);

    // جلب خيارات ومواصفات المنتج (Variants)
    $var_stmt = $pdo->prepare("SELECT * FROM product_variants WHERE product_id = ? ORDER BY id ASC");
    $var_stmt->execute([$prod_id]);
    $product_variants = $var_stmt->fetchAll(PDO::FETCH_ASSOC);
}

// دالة مساعدة لحفظ خيارات ومواصفات المنتج
function saveProductVariantsHelper($pdo, $target_prod_id) {
    $pdo->prepare("DELETE FROM product_variants WHERE product_id = ?")->execute([$target_prod_id]);
    if (isset($_POST['variant_name']) && is_array($_POST['variant_name'])) {
        $stmt_var = $pdo->prepare("INSERT INTO product_variants (product_id, variant_type, variant_name, color_code, price_modifier, stock) VALUES (?, ?, ?, ?, ?, ?)");
        
        $types = $_POST['variant_type'] ?? [];
        $names = $_POST['variant_name'] ?? [];
        $colors = $_POST['variant_color'] ?? [];
        $prices = $_POST['variant_price'] ?? [];
        $stocks = $_POST['variant_stock'] ?? [];

        foreach ($names as $idx => $v_name) {
            $v_name = trim($v_name);
            if (!empty($v_name)) {
                $v_type = trim($types[$idx] ?? 'الخيارات');
                if (empty($v_type)) $v_type = 'الخيارات';
                $v_color = !empty($colors[$idx]) ? trim($colors[$idx]) : null;
                $v_price = (float)($prices[$idx] ?? 0.00);
                $v_stock = !empty($stocks[$idx]) ? (int)$stocks[$idx] : 999;
                $stmt_var->execute([$target_prod_id, $v_type, $v_name, $v_color, $v_price, $v_stock]);
            }
        }
    }
}

// 1. تعيين الصورة الرئيسية
if (isset($_GET['action']) && $_GET['action'] == 'set_main_image' && $is_edit) {
    $img_id = (int)$_GET['img_id'];
    $pdo->prepare("UPDATE product_images SET is_main = 0 WHERE product_id = ?")->execute([$prod_id]);
    $pdo->prepare("UPDATE product_images SET is_main = 1 WHERE id = ?")->execute([$img_id]);
    
    $imgPath = $pdo->prepare("SELECT image_path FROM product_images WHERE id = ?");
    $imgPath->execute([$img_id]);
    $path = $imgPath->fetchColumn();
    
    $pdo->prepare("UPDATE products SET image_url = ? WHERE id = ?")->execute([$path, $prod_id]);
    header("Location: admin_edit_product.php?id=$prod_id&msg=main_updated");
    exit;
}

// 2. حذف صورة من المعرض
if (isset($_GET['action']) && $_GET['action'] == 'clear_legacy_image' && $is_edit) {
    if (!empty($product['image_url']) && isRealProductImage($product['image_url'])) {
        safeUnlinkProductImageFile($product['image_url'], __DIR__);
    }
    $pdo->prepare("DELETE FROM product_images WHERE product_id = ? AND (image_path = ? OR LOWER(image_path) LIKE '%placeholder.php%')")->execute([$prod_id, $product['image_url'] ?? '']);
    $pdo->prepare("UPDATE products SET image_url = '' WHERE id = ?")->execute([$prod_id]);
    syncProductPrimaryImage($pdo, $prod_id);
    header("Location: admin_edit_product.php?id=$prod_id&msg=img_deleted");
    exit;
}

if (isset($_GET['action']) && $_GET['action'] == 'delete_gallery_image' && $is_edit) {
    $img_id = (int)$_GET['img_id'];
    $stmt = $pdo->prepare("SELECT image_path, is_main FROM product_images WHERE id = ? AND product_id = ?");
    $stmt->execute([$img_id, $prod_id]);
    $img_data = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($img_data) {
        if (!empty($img_data['image_path']) && isRealProductImage($img_data['image_path'])) {
            safeUnlinkProductImageFile($img_data['image_path'], __DIR__);
        }
        $pdo->prepare("DELETE FROM product_images WHERE id = ?")->execute([$img_id]);
        if (($product['image_url'] ?? '') === ($img_data['image_path'] ?? '')) {
            $pdo->prepare("UPDATE products SET image_url = '' WHERE id = ?")->execute([$prod_id]);
        }
        $first_img = $pdo->query("SELECT id, image_path FROM product_images WHERE product_id = $prod_id ORDER BY is_main DESC, id ASC LIMIT 1")->fetch(PDO::FETCH_ASSOC);
        if ($first_img) {
            $pdo->prepare("UPDATE product_images SET is_main = 1 WHERE id = ?")->execute([$first_img['id']]);
        }
        syncProductPrimaryImage($pdo, $prod_id);
        header("Location: admin_edit_product.php?id=$prod_id&msg=img_deleted");
        exit;
    }
}


// 3. إضافة منتج جديد
// 3. إضافة منتج جديد
if (isset($_POST['add_product'])) {
    $name = trim($_POST['name']);
    $category = trim($_POST['category']);
    $sub_category = !empty($_POST['sub_category']) ? trim($_POST['sub_category']) : null;
    $description = trim($_POST['description']);
    $price = (float)$_POST['price'];
    $old_price = !empty($_POST['old_price']) ? (float)$_POST['old_price'] : null;

    $is_weight_based = isset($_POST['is_weight_based']) ? 1 : 0;
    $weight_unit = trim($_POST['weight_unit'] ?? 'كيلو');
    $weight_options_arr = [];
    if (!empty($_POST['weight_val']) && is_array($_POST['weight_val'])) {
        foreach ($_POST['weight_val'] as $w_idx => $w_val) {
            $w_num = (float)$w_val;
            $w_lbl = trim($_POST['weight_lbl'][$w_idx] ?? '');
            if ($w_num > 0 && !empty($w_lbl)) {
                $weight_options_arr[] = ['weight' => $w_num, 'label' => $w_lbl];
            }
        }
    }
    if (empty($weight_options_arr) && $is_weight_based) {
        $weight_options_arr = [
            ['weight' => 0.25, 'label' => 'ربع كيلو (250 غرام)'],
            ['weight' => 0.50, 'label' => 'نصف كيلو (500 غرام)'],
            ['weight' => 0.75, 'label' => '3/4 كيلو (750 غرام)'],
            ['weight' => 1.00, 'label' => 'كيلو كامل (1000 غرام)']
        ];
    }
    $weight_options_json = !empty($weight_options_arr) ? json_encode($weight_options_arr, JSON_UNESCAPED_UNICODE) : null;

    $barcode = trim($_POST['barcode'] ?? '');
    $local_code = trim($_POST['local_code'] ?? '');
    $stock = isset($_POST['stock']) && $_POST['stock'] !== '' ? (float)$_POST['stock'] : 0.0;
    $cost = isset($_POST['cost']) && $_POST['cost'] !== '' ? (float)$_POST['cost'] : 0.0;
    $all_barcodes_val = $barcode !== '' ? $barcode : null;
    $pdo->prepare("INSERT INTO products (name, category, sub_category, description, price, old_price, cost, stock, barcode, local_code, all_barcodes, is_weight_based, weight_unit, weight_options, image_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '')")
        ->execute([$name, $category, $sub_category, $description, $price, $old_price, $cost, $stock, $barcode !== '' ? $barcode : null, $local_code !== '' ? $local_code : null, $all_barcodes_val, $is_weight_based, $weight_unit, $weight_options_json]);
    $new_prod_id = $pdo->lastInsertId();

    // حفظ خيارات ومواصفات المنتج
    saveProductVariantsHelper($pdo, $new_prod_id);

    $images = uploadMultipleImages($_FILES['gallery_images']);
    $main_image = '';
    
    if (!empty($images)) {
        $main_image = $images[0];
        foreach ($images as $index => $img) {
            $is_main = ($index == 0) ? 1 : 0;
            $pdo->prepare("INSERT INTO product_images (product_id, image_path, is_main) VALUES (?, ?, ?)")
                ->execute([$new_prod_id, $img, $is_main]);
        }
    }
    
    $pdo->prepare("UPDATE products SET image_url = ? WHERE id = ?")->execute([$main_image, $new_prod_id]);
    header("Location: admin_products.php?msg=added");
    exit;
}

// 4. تعديل المنتج
if (isset($_POST['edit_product'])) {
    $name = trim($_POST['name']);
    $category = trim($_POST['category']);
    $sub_category = !empty($_POST['sub_category']) ? trim($_POST['sub_category']) : null;
    $description = trim($_POST['description']);
    $price = (float)$_POST['price'];
    $old_price = !empty($_POST['old_price']) ? (float)$_POST['old_price'] : null;

    $is_weight_based = isset($_POST['is_weight_based']) ? 1 : 0;
    $weight_unit = trim($_POST['weight_unit'] ?? 'كيلو');
    $weight_options_arr = [];
    if (!empty($_POST['weight_val']) && is_array($_POST['weight_val'])) {
        foreach ($_POST['weight_val'] as $w_idx => $w_val) {
            $w_num = (float)$w_val;
            $w_lbl = trim($_POST['weight_lbl'][$w_idx] ?? '');
            if ($w_num > 0 && !empty($w_lbl)) {
                $weight_options_arr[] = ['weight' => $w_num, 'label' => $w_lbl];
            }
        }
    }
    if (empty($weight_options_arr) && $is_weight_based) {
        $weight_options_arr = [
            ['weight' => 0.25, 'label' => 'ربع كيلو (250 غرام)'],
            ['weight' => 0.50, 'label' => 'نصف كيلو (500 غرام)'],
            ['weight' => 0.75, 'label' => '3/4 كيلو (750 غرام)'],
            ['weight' => 1.00, 'label' => 'كيلو كامل (1000 غرام)']
        ];
    }
    $weight_options_json = !empty($weight_options_arr) ? json_encode($weight_options_arr, JSON_UNESCAPED_UNICODE) : null;

    $barcode = trim($_POST['barcode'] ?? ($product['barcode'] ?? ''));
    $local_code = trim($_POST['local_code'] ?? ($product['local_code'] ?? ''));
    $new_stock = isset($_POST['stock']) && $_POST['stock'] !== '' ? (float)$_POST['stock'] : (float)($product['stock'] ?? 0);
    $new_cost = isset($_POST['cost']) && $_POST['cost'] !== '' ? (float)$_POST['cost'] : (float)($product['cost'] ?? 0);
    $old_stock_val = (float)($product['stock'] ?? 0);
    $existing_all_bc = trim((string)($product['all_barcodes'] ?? ''));
    if ($barcode !== '' && stripos($existing_all_bc, $barcode) === false) {
        $existing_all_bc = trim($barcode . ($existing_all_bc !== '' ? ',' . $existing_all_bc : ''), ',');
    }
    $pdo->prepare("UPDATE products SET name=?, category=?, sub_category=?, description=?, price=?, old_price=?, cost=?, stock=?, barcode=?, local_code=?, all_barcodes=?, is_weight_based=?, weight_unit=?, weight_options=? WHERE id=?")
        ->execute([$name, $category, $sub_category, $description, $price, $old_price, $new_cost, $new_stock, ($barcode !== '' ? $barcode : null), ($local_code !== '' ? $local_code : null), ($existing_all_bc !== '' ? $existing_all_bc : null), $is_weight_based, $weight_unit, $weight_options_json, $prod_id]);
    if (abs($new_stock - $old_stock_val) >= 0.0005) {
        applyInventoryAdjustment($pdo, $product, $new_stock, [
            'old_stock' => $old_stock_val,
            'cost' => $new_cost,
            'price' => $price,
            'reason_code' => $_POST['adjustment_reason'] ?? '',
            'cash_amount' => $_POST['adjustment_cash_amount'] ?? null,
            'note' => trim((string)($_POST['adjustment_note'] ?? 'تعديل رصيد من لوحة الإدارة')),
            'cashier_name' => 'أدمن الموقع',
            'update_product_stock' => false,
        ]);
    }

    // حفظ خيارات ومواصفات المنتج
    saveProductVariantsHelper($pdo, $prod_id);

    $newImages = uploadMultipleImages($_FILES['gallery_images']);
    if (!empty($newImages)) {
        $pdo->prepare("DELETE FROM product_images WHERE product_id = ? AND (LOWER(image_path) LIKE '%placeholder.php%' OR TRIM(COALESCE(image_path,'')) = '')")->execute([$prod_id]);
        $has_main = $pdo->query("SELECT COUNT(*) FROM product_images WHERE product_id = $prod_id AND is_main = 1")->fetchColumn();
        foreach ($newImages as $index => $img) {
            $is_main = (!$has_main && $index == 0) ? 1 : 0;
            $pdo->prepare("INSERT INTO product_images (product_id, image_path, is_main) VALUES (?, ?, ?)")
                ->execute([$prod_id, $img, $is_main]);
        }
        if ((!$has_main || !isRealProductImage($product['image_url'] ?? '')) && !empty($newImages)) {
            $pdo->prepare("UPDATE products SET image_url = ? WHERE id = ?")->execute([$newImages[0], $prod_id]);
        }
    }
    header("Location: admin_edit_product.php?id=$prod_id&msg=edited");
    exit;
}

include 'header.php';
include 'admin_nav.php';
?>

<div class="container mx-auto px-4 md:px-8 py-10 max-w-4xl animate-fade-in">
    <div class="flex justify-between items-center mb-6">
        <div>
            <h2 class="text-2xl font-serif font-bold text-royal-dark">
                <?php echo $is_edit ? 'تعديل المنتج والمعرض' : 'إضافة منتج جديد'; ?>
            </h2>
            <p class="text-xs text-gray-400 mt-1 font-light">راجعي تفاصيل وبيانات المنتج وصور العرض الخاصة به.</p>
        </div>
        <a href="admin_products.php" class="text-xs font-bold text-gray-500 hover:text-royal-gold flex items-center gap-1"><i class="fa-solid fa-arrow-right"></i> العودة للمنتجات</a>
    </div>

    <!-- رسائل التنبيه -->
    <?php if(isset($_GET['msg'])): ?>
        <div class="bg-green-50 text-green-700 p-4 mb-6 rounded-xl border border-green-200 text-xs font-bold">
            <i class="fa-solid fa-circle-check mr-1 text-sm"></i>
            <?php 
            if($_GET['msg'] == 'edited') echo 'تم تعديل تفاصيل المنتج بنجاح!';
            elseif($_GET['msg'] == 'main_updated') echo 'تم تغيير الصورة الرئيسية للمنتج بنجاح!';
            elseif($_GET['msg'] == 'img_deleted') echo 'تم حذف صورة المعرض المحددة بنجاح!';
            ?>
        </div>
    <?php endif; ?>

    <?php if(isset($_GET['error'])): ?>
        <div class="bg-red-50 text-red-700 p-4 mb-6 rounded-xl border border-red-200 text-xs font-bold">
            <i class="fa-solid fa-circle-exclamation mr-1 text-sm"></i>
            <?php 
            if($_GET['error'] == 'cannot_delete_last_image') echo 'لا يمكن حذف هذه الصورة؛ يجب أن يحتوي المنتج على صورة واحدة على الأقل.';
            ?>
        </div>
    <?php endif; ?>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        <!-- نموذج إضافة/تعديل البيانات (يسار) -->
        <div class="lg:col-span-2 bg-white p-8 border border-royal-gold/10 shadow-sm rounded-2xl">
            <form method="POST" action="" enctype="multipart/form-data" class="space-y-6">
                
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label class="block text-xs font-bold mb-2 text-gray-600">اسم المنتج *</label>
                        <input type="text" name="name" value="<?php echo htmlspecialchars($product['name']); ?>" required class="w-full p-3 border border-gray-200 outline-none focus:border-royal-gold bg-royal-cream/30 focus:bg-white transition rounded-xl text-sm font-semibold">
                    </div>
                    <div>
                        <label class="block text-xs font-bold mb-2 text-gray-600">القسم الرئيسي (الفئة الأساسية) *</label>
                        <select name="category" id="main-cat-select" required class="w-full p-3 border border-gray-200 outline-none focus:border-royal-gold bg-royal-cream/30 focus:bg-white transition rounded-xl text-sm font-semibold">
                            <option value="">-- اختر القسم الرئيسي --</option>
                            <?php 
                            $main_cats = $pdo->query("SELECT * FROM categories WHERE parent_id IS NULL ORDER BY name ASC")->fetchAll(PDO::FETCH_ASSOC);
                            foreach($main_cats as $mc): 
                            ?>
                                <option value="<?php echo htmlspecialchars($mc['name']); ?>" <?php echo $product['category'] == $mc['name'] ? 'selected' : ''; ?>><?php echo htmlspecialchars($mc['name']); ?></option>
                            <?php endforeach; ?>
                            <?php
                            $cat_names_list = array_column($main_cats, 'name');
                            if (!empty($product['category']) && !in_array($product['category'], $cat_names_list, true)):
                            ?>
                                <option value="<?php echo htmlspecialchars($product['category']); ?>" selected><?php echo htmlspecialchars($product['category']); ?></option>
                            <?php endif; ?>
                        </select>
                    </div>
                    <div>
                        <label class="block text-xs font-bold mb-2 text-gray-600">القسم الفرعي (الفئة الفرعية)</label>
                        <select name="sub_category" id="sub-cat-select" class="w-full p-3 border border-gray-200 outline-none focus:border-royal-gold bg-royal-cream/30 focus:bg-white transition rounded-xl text-sm font-semibold">
                            <option value="">-- بدون قسم فرعي --</option>
                            <?php 
                            $sub_cats = $pdo->query("SELECT s.*, p.name as parent_name FROM categories s JOIN categories p ON s.parent_id = p.id WHERE s.parent_id IS NOT NULL ORDER BY s.name ASC")->fetchAll(PDO::FETCH_ASSOC);
                            foreach($sub_cats as $sc): 
                            ?>
                                <option value="<?php echo htmlspecialchars($sc['name']); ?>" data-parent-name="<?php echo htmlspecialchars($sc['parent_name']); ?>" <?php echo ($product['sub_category'] ?? '') == $sc['name'] ? 'selected' : ''; ?>><?php echo htmlspecialchars($sc['name']); ?></option>
                            <?php endforeach; ?>
                        </select>
                    </div>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-6 bg-royal-sand/35 p-5 border border-royal-gold/10 rounded-2xl">
                    <div>
                        <label class="block text-xs font-bold mb-2 text-royal-darkgold">سعر البيع الحالي (للكيلو أو للقطعة) *</label>
                        <input type="number" step="0.01" name="price" id="prod-price-input" value="<?php echo htmlspecialchars($product['price']); ?>" required class="w-full p-3 border border-gray-200 outline-none focus:border-royal-gold bg-white transition rounded-xl font-serif font-bold text-sm" oninput="updateWeightPricesPreview()">
                    </div>
                    <div>
                        <label class="block text-xs font-bold mb-2 text-gray-500">السعر القديم (لإظهار شارة الخصم - اختياري)</label>
                        <input type="number" step="0.01" name="old_price" value="<?php echo htmlspecialchars($product['old_price'] ?? ''); ?>" class="w-full p-3 border border-gray-200 outline-none focus:border-royal-gold bg-white transition rounded-xl font-serif font-bold text-sm">
                    </div>
                    <div>
                        <label class="block text-xs font-bold mb-2 text-gray-600">سعر التكلفة (الشراء)</label>
                        <input type="number" step="0.01" name="cost" value="<?php echo htmlspecialchars($product['cost'] ?? '0'); ?>" class="w-full p-3 border border-gray-200 outline-none focus:border-royal-gold bg-white transition rounded-xl font-mono font-bold text-sm" dir="ltr">
                    </div>
                    <div>
                        <label class="block text-xs font-bold mb-2 text-gray-600">الباركود (Barcode)</label>
                        <input type="text" name="barcode" id="prod-barcode-input" value="<?php echo htmlspecialchars($product['barcode'] ?? ''); ?>" placeholder="امسح أو اكتب الباركود..." class="w-full p-3 border border-gray-200 outline-none focus:border-royal-gold bg-white transition rounded-xl font-mono font-bold text-sm" dir="ltr">
                    </div>
                    <div>
                        <label class="block text-xs font-bold mb-2 text-gray-600">كود السيستم / ERP (Local Code)</label>
                        <input type="text" name="local_code" value="<?php echo htmlspecialchars($product['local_code'] ?? ''); ?>" class="w-full p-3 border border-gray-200 outline-none focus:border-royal-gold bg-white transition rounded-xl font-mono font-bold text-sm" dir="ltr">
                    </div>
                    <div class="md:col-span-2">
                        <label class="block text-xs font-bold mb-2 text-gray-600">رصيد المخزون الحالي (الكمية)</label>
                        <input type="number" step="0.001" name="stock" id="prod-stock-input" data-orig-stock="<?php echo htmlspecialchars((string)($product['stock'] ?? 0)); ?>" value="<?php echo htmlspecialchars($product['stock'] ?? 0); ?>" class="w-full p-3 border border-gray-200 outline-none focus:border-royal-gold bg-white transition rounded-xl font-mono font-bold text-sm" dir="ltr" oninput="toggleAdminStockReasonBox()">
                        <?php if ($is_edit): ?>
                        <div id="admin-stock-reason-box" class="hidden mt-3 p-4 rounded-xl bg-amber-50 border border-amber-200 space-y-2.5">
                            <p class="text-xs font-bold text-amber-900">تم تعديل الكمية — اختر سبب تسوية الجرد لحفظ توازن الصندوق والحسابات:</p>
                            <select name="adjustment_reason" id="admin-stock-reason-select" class="w-full p-2.5 bg-white border border-amber-300 rounded-lg text-xs font-bold text-gray-800">
                                <option value="shortage_loss">نقص: عجز / تالف جرد (خسائر غير نقدية - لا يمس الصندوق)</option>
                                <option value="unrecorded_sale">نقص: مبيعات نقدية غير مسجلة (+ دخول كاش للصندوق)</option>
                                <option value="shortage_cash_expense">نقص: خصم عجز نقدي من عهدة الصندوق (- صرف كاش)</option>
                                <option value="surplus_gain">زيادة: فائض جرد طبيعي (زيادة رصيد - لا يمس الصندوق)</option>
                                <option value="surplus_cash_purchase">زيادة: بضاعة مشتراة نقداً من الصندوق (- صرف كاش)</option>
                                <option value="count_only">تصحيح رصيد دفتري / افتتاحي فقط</option>
                            </select>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
                                <input type="number" step="0.01" name="adjustment_cash_amount" placeholder="مبلغ نقدي مخصص بالصندوق (اتركه فارغاً للحساب التلقائي)" class="p-2 bg-white border border-amber-200 rounded-lg text-xs">
                                <input type="text" name="adjustment_note" placeholder="ملاحظة التسوية (اختياري)..." class="p-2 bg-white border border-amber-200 rounded-lg text-xs">
                            </div>
                        </div>
                        <script>
                        function toggleAdminStockReasonBox() {
                            const inp = document.getElementById('prod-stock-input');
                            const box = document.getElementById('admin-stock-reason-box');
                            const sel = document.getElementById('admin-stock-reason-select');
                            if (!inp || !box || !sel) return;
                            const orig = parseFloat(inp.getAttribute('data-orig-stock') || '0') || 0;
                            const cur = parseFloat(inp.value || '0') || 0;
                            const diff = cur - orig;
                            if (Math.abs(diff) < 0.0005) { box.classList.add('hidden'); return; }
                            box.classList.remove('hidden');
                            if (diff < 0 && !['shortage_loss','unrecorded_sale','shortage_cash_expense','count_only'].includes(sel.value)) {
                                sel.value = 'shortage_loss';
                            } else if (diff > 0 && !['surplus_gain','surplus_cash_purchase','count_only'].includes(sel.value)) {
                                sel.value = 'surplus_gain';
                            }
                        }
                        </script>
                        <?php endif; ?>
                    </div>
                </div>

                <!-- قسم منتجات الوزن التفاعلي (Weight-Based Supermarket Selling) -->
                <div class="bg-gradient-to-br from-amber-500/10 via-amber-100/30 to-royal-sand/40 p-6 border-2 border-dashed border-amber-500/30 rounded-2xl space-y-4 shadow-xs">
                    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-amber-300/40 pb-3.5">
                        <div>
                            <h4 class="text-sm font-bold text-royal-dark flex items-center gap-2">
                                <span class="w-7 h-7 bg-amber-600 text-white rounded-lg flex items-center justify-center text-xs shadow-sm"><i class="fa-solid fa-scale-balanced"></i></span>
                                نظام بيع المنتج بالوزن (أجبان، مخللات، بهارات، مكسرات، بن، لحوم...)
                            </h4>
                            <p class="text-[11px] text-gray-500 mt-1">عند التفعيل، سيظهر للزبائن في المتجر زر "⚖️ اختر الوزن" بدلاً من "اشتري الآن"، مع خيارات الأوزان (ربع، نصف، 3/4، كيلو) وحساب الأسعار تلقائياً.</p>
                        </div>
                        
                        <!-- Toggle Switch -->
                        <label class="relative inline-flex items-center cursor-pointer select-none shrink-0">
                            <input type="checkbox" name="is_weight_based" id="toggle-weight-based" value="1" <?php echo !empty($product['is_weight_based']) ? 'checked' : ''; ?> class="sr-only peer" onchange="toggleWeightSection(this.checked)">
                            <div class="w-13 h-7 bg-gray-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-amber-600 shadow-inner"></div>
                            <span class="ms-3 text-xs font-bold text-royal-dark">تفعيل البيع بالوزن</span>
                        </label>
                    </div>

                    <!-- إعدادات الأوزان وتخصيص الخيارات -->
                    <div id="weight-settings-container" class="<?php echo empty($product['is_weight_based']) ? 'hidden' : ''; ?> space-y-4 pt-1">
                        <div class="bg-white/90 p-4 rounded-xl border border-amber-200 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                            <div>
                                <span class="text-xs font-bold text-gray-800 block">سعر الكيلو المدخل: <span id="weight-base-price-disp" class="text-amber-700 font-bold font-serif text-sm"><?php echo htmlspecialchars($product['price'] ?: '0'); ?></span> <?php echo htmlspecialchars($settings['store_currency'] ?? 'ج.م'); ?></span>
                                <span class="text-[10px] text-gray-400">يتم حساب أسعار الكسور (ربع، نصف، إلخ) آلياً كنسبة من سعر الكيلو.</span>
                            </div>
                            <div class="flex flex-wrap items-center gap-1.5">
                                <button type="button" onclick="loadDefaultSupermarketWeights()" class="bg-amber-100 text-amber-900 hover:bg-amber-200 text-[10px] font-bold px-3 py-1.5 rounded-lg transition border border-amber-300 shadow-2xs">
                                    <i class="fa-solid fa-rotate-left mr-1"></i> الأوزان القياسية (ربع/نصف/3-4/كيلو)
                                </button>
                                <button type="button" onclick="addWeightOptionRow(0.125, 'ثمن كيلو (125 غرام)')" class="bg-white hover:bg-amber-50 text-gray-700 text-[10px] font-bold px-2.5 py-1.5 rounded-lg transition border border-gray-200">+ ثمن كيلو</button>
                                <button type="button" onclick="addWeightOptionRow(1.5, 'كيلو ونصف (1500 غرام)')" class="bg-white hover:bg-amber-50 text-gray-700 text-[10px] font-bold px-2.5 py-1.5 rounded-lg transition border border-gray-200">+ 1.5 كجم</button>
                                <button type="button" onclick="addWeightOptionRow(2.0, '2 كيلو (2000 غرام)')" class="bg-white hover:bg-amber-50 text-gray-700 text-[10px] font-bold px-2.5 py-1.5 rounded-lg transition border border-gray-200">+ 2 كجم</button>
                                <button type="button" onclick="addWeightOptionRow('', '')" class="bg-royal-charcoal text-white hover:bg-amber-600 text-[10px] font-bold px-3 py-1.5 rounded-lg transition shadow-xs flex items-center gap-1">
                                    <i class="fa-solid fa-plus"></i> وزن مخصص
                                </button>
                            </div>
                        </div>

                        <!-- جدول خيارات الأوزان -->
                        <div class="overflow-x-auto bg-white rounded-xl border border-amber-200 shadow-xs">
                            <table class="w-full text-right text-xs">
                                <thead class="bg-amber-500/10 text-gray-700 text-[10px] border-b border-amber-200">
                                    <tr>
                                        <th class="p-3 font-bold w-1/4">قيمة الوزن (بالكيلوغرام)</th>
                                        <th class="p-3 font-bold w-2/5">اسم الخيار الظاهر للعميل في المتجر</th>
                                        <th class="p-3 font-bold w-1/4 text-center">السعر المحسوب للعميل</th>
                                        <th class="p-3 font-bold w-12 text-center">حذف</th>
                                    </tr>
                                </thead>
                                <tbody id="weight-options-tbody" class="divide-y divide-amber-100">
                                    <!-- سيتم توليد الصفوف عبر JavaScript -->
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <!-- خيارات ومواصفات المنتج المتعددة (الألوان، المقاسات، السعات) -->
                <div class="bg-gradient-to-br from-royal-sand/40 to-royal-cream/60 p-6 border border-royal-gold/20 rounded-2xl space-y-4">
                    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-royal-gold/15 pb-3">
                        <div>
                            <h4 class="text-xs font-bold text-royal-dark flex items-center gap-2">
                                <i class="fa-solid fa-layer-group text-royal-darkgold"></i> خيارات ومواصفات المنتج (Product Variants)
                            </h4>
                            <p class="text-[10px] text-gray-500 mt-0.5">أضف خيارات المقاسات أو الألوان أو السعات مع تحديد السعر والمخزون لكل خيار.</p>
                        </div>
                        <div class="flex flex-wrap items-center gap-1.5">
                            <button type="button" onclick="addVariantPreset('sizes')" class="bg-white border border-gray-200 hover:border-royal-gold text-[10px] font-bold text-gray-700 px-2.5 py-1 rounded-lg transition shadow-sm">+ مقاسات ملابس</button>
                            <button type="button" onclick="addVariantPreset('storage')" class="bg-white border border-gray-200 hover:border-royal-gold text-[10px] font-bold text-gray-700 px-2.5 py-1 rounded-lg transition shadow-sm">+ سعات تخزين</button>
                            <button type="button" onclick="addVariantPreset('colors')" class="bg-white border border-gray-200 hover:border-royal-gold text-[10px] font-bold text-gray-700 px-2.5 py-1 rounded-lg transition shadow-sm">+ ألوان</button>
                            <button type="button" onclick="addVariantRow('', '', 0, 100)" class="bg-royal-charcoal text-white hover:bg-royal-gold hover:text-royal-charcoal text-[10px] font-bold px-3 py-1 rounded-lg transition shadow-sm flex items-center gap-1">
                                <i class="fa-solid fa-plus"></i> إضافة خيار
                            </button>
                        </div>
                    </div>

                    <!-- جدول الخيارات التفاعلي -->
                    <div class="overflow-x-auto">
                        <table class="w-full text-right text-xs">
                            <thead class="text-gray-500 text-[10px] border-b border-royal-gold/10">
                                <tr>
                                    <th class="pb-2 font-bold w-1/5">نوع الخيار</th>
                                    <th class="pb-2 font-bold w-1/4">اسم الخيار / القيمة</th>
                                    <th class="pb-2 font-bold w-1/4 text-center">كود / درجة اللون (Color Swatch)</th>
                                    <th class="pb-2 font-bold w-1/5">فرق السعر (+ الإضافي)</th>
                                    <th class="pb-2 font-bold w-16 text-center">المخزون</th>
                                    <th class="pb-2 font-bold w-10 text-center">حذف</th>
                                </tr>
                            </thead>
                            <tbody id="variants-tbody" class="divide-y divide-royal-gold/10">
                                <!-- سيتم تعبئة الصفوف ديناميكياً بواسطة JavaScript -->
                            </tbody>
                        </table>
                        <div id="no-variants-msg" class="hidden text-center py-6 text-gray-400 text-xs">
                            لا توجد خيارات مضافة بعد لهذا المنتج (سيُباع بالخيارات والمواصفات القياسية الافتراضية).
                        </div>
                    </div>
                </div>

                <div>
                    <label class="block text-xs font-bold mb-2 text-gray-600">وصف وتفاصيل المنتج (اختياري)</label>
                    <textarea name="description" rows="4" class="w-full p-4 border border-gray-200 outline-none focus:border-royal-gold bg-royal-cream/30 focus:bg-white transition rounded-xl text-sm leading-relaxed" placeholder="اكتب مواصفات المنتج، الألوان والمقاسات، والخامات أو المزايا بالتفصيل..."><?php echo htmlspecialchars($product['description'] ?? ''); ?></textarea>
                </div>

                <div>
                    <label class="block text-xs font-bold mb-2 text-gray-600">رفع صور إضافية للمعرض</label>
                    <input type="file" name="gallery_images[]" multiple accept="image/*" class="w-full text-xs text-gray-500 bg-royal-cream/30 p-3.5 border border-dashed border-royal-gold/25 rounded-xl cursor-pointer">
                    <p class="text-[10px] text-gray-400 mt-2">💡 يمكنك تحديد عدة صور لرفعها دفعة واحدة (المقاس الموصى به: 800 × 1000 px).</p>
                </div>

                <div class="flex gap-3.5 pt-4">
                    <button type="submit" name="<?php echo $is_edit ? 'edit_product' : 'add_product'; ?>" class="flex-grow bg-royal-charcoal text-white hover:bg-royal-gold hover:text-royal-charcoal font-bold py-3.5 tracking-widest uppercase rounded-xl shadow-md btn-shine text-xs transition-all">
                        <?php echo $is_edit ? 'حفظ التعديلات' : 'إضافة المنتج'; ?>
                    </button>
                    <a href="admin_products.php" class="bg-gray-200 text-gray-700 px-8 py-3.5 font-bold uppercase tracking-widest text-xs rounded-xl hover:bg-gray-300 transition-colors flex items-center justify-center">إلغاء</a>
                </div>
            </form>
        </div>

        <!-- معرض الصور الحالي (يمين - يظهر فقط في حالة التعديل) -->
        <div class="lg:col-span-1">
            <?php if ($is_edit): ?>
                <div class="bg-white p-6 border border-royal-gold/10 shadow-sm rounded-2xl sticky top-28">
                    <h3 class="font-serif font-bold text-sm text-royal-dark mb-4 border-b pb-2 flex items-center gap-2">
                        <i class="fa-regular fa-images text-royal-darkgold"></i> معرض الصور الحالي
                    </h3>
                    <?php
                    $real_gallery_rows = array_values(array_filter($product_gallery, function($g) { return isRealProductImage($g['image_path'] ?? ''); }));
                    $resolved_legacy = resolveProductDisplayImage($pdo, $product);
                    $is_store_visible = !empty($real_gallery_rows) || ($resolved_legacy !== '');
                    ?>
                    <div class="mb-4 px-3 py-2 rounded-xl text-xs font-bold flex items-center justify-between <?php echo $is_store_visible ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-800 border border-amber-200'; ?>">
                        <span><?php echo $is_store_visible ? '✅ منشور وظاهر بالمتجر الإلكتروني' : '⚠️ مخفي عن المتجر (بانتظار رفع صورة)'; ?></span>
                    </div>
                    <div class="grid grid-cols-2 gap-4">
                        <?php foreach($real_gallery_rows as $img): ?>
                            <div class="relative bg-gray-50 rounded-xl overflow-hidden border border-royal-gold/5 p-1 flex flex-col justify-between">
                                <img src="<?php echo htmlspecialchars($img['image_path']); ?>" class="w-full aspect-[4/5] object-cover rounded-lg shadow-inner bg-gray-100">
                                
                                <div class="mt-3 flex justify-between items-center gap-1.5">
                                    <?php if($img['is_main'] == 1): ?>
                                        <span class="text-[9px] bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-md font-bold w-full text-center">الرئيسية ✓</span>
                                        <a href="admin_edit_product.php?id=<?php echo $prod_id; ?>&action=delete_gallery_image&img_id=<?php echo $img['id']; ?>" onclick="return confirm('حذف الصورة؟ إذا كانت آخر صورة سيتم إخفاء المنتج عن المتجر حتى رفع صورة جديدة.')" class="text-red-500 hover:text-red-700 text-sm p-1" title="حذف الصورة"><i class="fa-solid fa-trash-can"></i></a>
                                    <?php else: ?>
                                        <a href="admin_edit_product.php?id=<?php echo $prod_id; ?>&action=set_main_image&img_id=<?php echo $img['id']; ?>" class="text-[9px] bg-royal-sand text-royal-darkgold hover:bg-royal-gold hover:text-white px-2 py-0.5 rounded-md transition-all font-bold w-full text-center">جعلها رئيسية</a>
                                        <a href="admin_edit_product.php?id=<?php echo $prod_id; ?>&action=delete_gallery_image&img_id=<?php echo $img['id']; ?>" onclick="return confirm('حذف الصورة؟')" class="text-red-500 hover:text-red-700 text-sm p-1" title="حذف الصورة"><i class="fa-solid fa-trash-can"></i></a>
                                    <?php endif; ?>
                                </div>
                            </div>
                        <?php endforeach; ?>
                        <?php if (empty($real_gallery_rows) && $resolved_legacy !== ''): ?>
                            <div class="col-span-2 relative bg-gray-50 rounded-xl overflow-hidden border border-royal-gold/15 p-2 flex flex-col justify-between">
                                <img src="<?php echo htmlspecialchars($resolved_legacy); ?>" class="w-full aspect-[4/5] object-cover rounded-lg shadow-inner bg-gray-100">
                                <div class="mt-3 flex justify-between items-center gap-2">
                                    <span class="text-[10px] bg-green-50 text-green-700 border border-green-200 px-2 py-1 rounded-md font-bold flex-1 text-center">صورة المنتج الحالية ✓</span>
                                    <a href="admin_edit_product.php?id=<?php echo $prod_id; ?>&action=clear_legacy_image" onclick="return confirm('حذف صورة المنتج وإخفاؤه من واجهة المتجر؟')" class="text-red-500 hover:text-red-700 text-sm p-1.5" title="حذف الصورة"><i class="fa-solid fa-trash-can"></i></a>
                                </div>
                            </div>
                        <?php elseif (empty($real_gallery_rows) && $resolved_legacy === ''): ?>
                            <div class="col-span-2 py-8 text-center text-xs text-gray-400">لا توجد صور مرفوعة بعد لهذا المنتج.</div>
                        <?php endif; ?>
                    </div>
                </div>
            <?php else: ?>
                <div class="bg-royal-sand/30 p-6 border border-dashed border-royal-gold/25 rounded-2xl text-center text-gray-400">
                    <i class="fa-solid fa-cloud-arrow-up text-5xl mb-4 text-royal-gold/40"></i>
                    <p class="text-xs font-semibold leading-relaxed">عند إضافة المنتج الجديد، يرجى رفع الصور المخصصة له. أول صورة سيتم رفعها ستعتبر تلقائياً هي الصورة المعروضة في المتجر.</p>
                </div>
            <?php endif; ?>
        </div>

    </div>
</div>

<script>
const existingVariants = <?php echo json_encode($product_variants, JSON_UNESCAPED_UNICODE); ?>;
const existingWeightOptions = <?php echo json_encode(!empty($product['weight_options']) ? getProductWeightOptions($product) : [], JSON_UNESCAPED_UNICODE); ?>;
const isWeightBasedInitial = <?php echo !empty($product['is_weight_based']) ? 'true' : 'false'; ?>;

function toggleWeightSection(isChecked) {
    const container = document.getElementById('weight-settings-container');
    if (container) {
        if (isChecked) {
            container.classList.remove('hidden');
            const tbody = document.getElementById('weight-options-tbody');
            if (tbody && tbody.children.length === 0) {
                loadDefaultSupermarketWeights();
            }
        } else {
            container.classList.add('hidden');
        }
    }
}

function updateWeightPricesPreview() {
    const priceInput = document.getElementById('prod-price-input');
    const basePrice = parseFloat(priceInput ? priceInput.value : 0) || 0;
    const baseDisp = document.getElementById('weight-base-price-disp');
    if (baseDisp) baseDisp.textContent = basePrice.toFixed(2);

    const rows = document.querySelectorAll('#weight-options-tbody tr');
    rows.forEach(tr => {
        const valInput = tr.querySelector('input[name="weight_val[]"]');
        const priceSpan = tr.querySelector('.calc-weight-price');
        if (valInput && priceSpan) {
            const wVal = parseFloat(valInput.value) || 0;
            priceSpan.textContent = (basePrice * wVal).toFixed(2);
        }
    });
}

function addWeightOptionRow(weightVal = 0.25, label = 'ربع كيلو (250 غرام)') {
    const tbody = document.getElementById('weight-options-tbody');
    if (!tbody) return;

    const priceInput = document.getElementById('prod-price-input');
    const basePrice = parseFloat(priceInput ? priceInput.value : 0) || 0;
    const calcPrice = (basePrice * (parseFloat(weightVal) || 0)).toFixed(2);

    const tr = document.createElement('tr');
    tr.className = 'hover:bg-amber-50/60 transition-colors';
    tr.innerHTML = `
        <td class="p-2.5">
            <div class="flex items-center gap-1.5">
                <input type="number" step="0.001" min="0.01" name="weight_val[]" value="${weightVal}" required class="w-24 p-2 border border-gray-200 bg-white rounded-lg text-xs outline-none focus:border-amber-500 font-mono font-bold text-center" oninput="updateWeightPricesPreview()">
                <span class="text-[10px] text-gray-500 font-bold">كجم</span>
            </div>
        </td>
        <td class="p-2.5">
            <input type="text" name="weight_lbl[]" value="${escapeHtml(label)}" required placeholder="مثال: ربع كيلو (250 غرام)" class="w-full p-2 border border-gray-200 bg-white rounded-lg text-xs outline-none focus:border-amber-500 font-bold text-gray-800">
        </td>
        <td class="p-2.5 text-center font-serif">
            <span class="bg-amber-100/70 text-amber-900 px-2.5 py-1 rounded-md font-bold text-xs border border-amber-200/80 inline-block">
                <span class="calc-weight-price">${calcPrice}</span> <?php echo htmlspecialchars($settings['store_currency'] ?? 'ج.م'); ?>
            </span>
        </td>
        <td class="p-2.5 text-center">
            <button type="button" onclick="this.closest('tr').remove()" class="text-red-500 hover:text-red-700 transition p-1 rounded-lg hover:bg-red-50" title="حذف هذا الوزن">
                <i class="fa-solid fa-trash-can text-xs"></i>
            </button>
        </td>
    `;
    tbody.appendChild(tr);
}

function loadDefaultSupermarketWeights() {
    const tbody = document.getElementById('weight-options-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    const defaults = [
        { weight: 0.25, label: 'ربع كيلو (250 غرام)' },
        { weight: 0.50, label: 'نصف كيلو (500 غرام)' },
        { weight: 0.75, label: '3/4 كيلو (750 غرام)' },
        { weight: 1.00, label: 'كيلو كامل (1000 غرام)' }
    ];
    defaults.forEach(d => addWeightOptionRow(d.weight, d.label));
}

function checkVariantsEmpty() {
    const tbody = document.getElementById('variants-tbody');
    const noMsg = document.getElementById('no-variants-msg');
    if (tbody && noMsg) {
        if (tbody.children.length === 0) {
            noMsg.classList.remove('hidden');
        } else {
            noMsg.classList.add('hidden');
        }
    }
}

function addVariantRow(type = 'اللون', name = '', color = '', price = 0, stock = 100) {
    const tbody = document.getElementById('variants-tbody');
    if (!tbody) return;

    const tr = document.createElement('tr');
    tr.className = 'hover:bg-royal-sand/20 transition-colors';

    const typesList = ['اللون', 'المقاس', 'السعة', 'الذاكرة', 'الحجم', 'الخامة', 'النوع', 'أخرى'];
    let typeOptions = '';
    typesList.forEach(t => {
        const isSel = (t === type) ? 'selected' : '';
        typeOptions += `<option value="${t}" ${isSel}>${t}</option>`;
    });

    const defaultColor = color ? color : (type === 'اللون' ? '#111827' : '');
    const colorVisibility = (type === 'اللون' || color) ? '' : 'opacity-40 grayscale';

    tr.innerHTML = `
        <td class="py-2.5 pr-1">
            <select name="variant_type[]" onchange="handleVariantTypeChange(this)" class="w-full p-2 border border-gray-200 bg-white rounded-lg text-xs outline-none focus:border-royal-gold font-bold">
                ${typeOptions}
            </select>
        </td>
        <td class="py-2.5 px-2">
            <input type="text" name="variant_name[]" value="${escapeHtml(name)}" required placeholder="مثال: أسود كربوني / 256GB / XL" class="w-full p-2 border border-gray-200 bg-white rounded-lg text-xs outline-none focus:border-royal-gold font-semibold">
        </td>
        <td class="py-2.5 px-2 text-center">
            <div class="color-picker-box flex items-center justify-center gap-1.5 ${colorVisibility} transition-all">
                <input type="color" value="${defaultColor || '#111827'}" oninput="syncColorInput(this, 'picker')" class="w-7 h-7 rounded-lg cursor-pointer border border-gray-200 p-0 bg-transparent shrink-0">
                <input type="text" name="variant_color[]" value="${escapeHtml(color)}" oninput="syncColorInput(this, 'text')" placeholder="#HEX" class="w-20 p-1.5 border border-gray-200 bg-white rounded-lg text-[10px] font-mono text-center outline-none focus:border-royal-gold uppercase font-bold" dir="ltr">
            </div>
        </td>
        <td class="py-2.5 px-2">
            <div class="flex items-center gap-1">
                <span class="text-[10px] text-gray-400 font-bold">+</span>
                <input type="number" step="0.01" name="variant_price[]" value="${parseFloat(price) || 0}" placeholder="0.00" class="w-full p-2 border border-gray-200 bg-white rounded-lg text-xs outline-none focus:border-royal-gold font-mono font-bold">
            </div>
        </td>
        <td class="py-2.5 px-2 text-center">
            <input type="number" name="variant_stock[]" value="${parseInt(stock) || 100}" min="0" class="w-16 p-2 border border-gray-200 bg-white rounded-lg text-xs outline-none focus:border-royal-gold font-mono text-center font-bold">
        </td>
        <td class="py-2.5 pl-1 text-center">
            <button type="button" onclick="removeVariantRow(this)" class="text-red-500 hover:text-red-700 transition p-1.5 rounded-lg hover:bg-red-50" title="حذف هذا الخيار">
                <i class="fa-solid fa-trash-can text-sm"></i>
            </button>
        </td>
    `;

    tbody.appendChild(tr);
    checkVariantsEmpty();
}

function syncColorInput(el, source) {
    const parent = el.closest('.color-picker-box');
    if (!parent) return;
    const picker = parent.querySelector('input[type="color"]');
    const text = parent.querySelector('input[name="variant_color[]"]');

    if (source === 'picker') {
        text.value = picker.value.toUpperCase();
    } else if (source === 'text') {
        let val = text.value.trim();
        if (val && !val.startsWith('#')) {
            val = '#' + val;
            text.value = val;
        }
        if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
            picker.value = val;
        }
    }
}

function handleVariantTypeChange(selectEl) {
    const tr = selectEl.closest('tr');
    if (!tr) return;
    const colorBox = tr.querySelector('.color-picker-box');
    const colorInput = tr.querySelector('input[name="variant_color[]"]');
    if (selectEl.value === 'اللون') {
        colorBox.classList.remove('opacity-40', 'grayscale');
        if (!colorInput.value) {
            colorInput.value = '#111827';
        }
    } else {
        colorBox.classList.add('opacity-40', 'grayscale');
    }
}

function removeVariantRow(btn) {
    const tr = btn.closest('tr');
    if (tr) {
        tr.remove();
        checkVariantsEmpty();
    }
}

function addVariantPreset(preset) {
    if (preset === 'sizes') {
        const sizes = ['S (صغير)', 'M (متوسط)', 'L (كبير)', 'XL (كبير جداً)', 'XXL'];
        sizes.forEach(s => addVariantRow('المقاس', s, '', 0, 50));
    } else if (preset === 'storage') {
        addVariantRow('السعة', '128 GB', '', 0, 50);
        addVariantRow('السعة', '256 GB', '', 200, 30);
        addVariantRow('السعة', '512 GB', '', 500, 15);
        addVariantRow('السعة', '1 TB', '', 900, 10);
    } else if (preset === 'colors') {
        const luxuryColors = [
            { name: 'أسود كربوني', hex: '#111827' },
            { name: 'أبيض عاجي', hex: '#FFFFFF' },
            { name: 'أزرق ملكي كحلي', hex: '#1E3A8A' },
            { name: 'ذهبي ملكي', hex: '#D4AF37' },
            { name: 'فضي تيتانيوم', hex: '#94A3B8' },
            { name: 'عنابي / كستنائي', hex: '#7F1D1D' },
            { name: 'أخضر زمردي', hex: '#047857' }
        ];
        luxuryColors.forEach(c => addVariantRow('اللون', c.name, c.hex, 0, 50));
    }
}

function escapeHtml(str) {
    if (!str) return '';
    return str.toString()
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

document.addEventListener("DOMContentLoaded", function() {
    // تعبئة خيارات الوزن إن وجدت
    if (isWeightBasedInitial) {
        if (existingWeightOptions && existingWeightOptions.length > 0) {
            existingWeightOptions.forEach(w => {
                addWeightOptionRow(w.weight, w.label);
            });
        } else {
            loadDefaultSupermarketWeights();
        }
    }

    // تعبئة الخيارات الحالية
    if (existingVariants && existingVariants.length > 0) {
        existingVariants.forEach(v => {
            addVariantRow(v.variant_type, v.variant_name, v.color_code || '', v.price_modifier, v.stock);
        });
    }
    checkVariantsEmpty();

    const mainSelect = document.getElementById("main-cat-select");
    const subSelect = document.getElementById("sub-cat-select");
    if (mainSelect && subSelect) {
        const subOptions = Array.from(subSelect.options);
        const initialSubVal = "<?php echo htmlspecialchars($product['sub_category'] ?? ''); ?>";
        
        function filterSubCategories(keepSelection) {
            const selectedMainName = mainSelect.value;
            const currentSelectedVal = keepSelection ? (subSelect.value || initialSubVal) : "";
            
            subSelect.innerHTML = "";
            subSelect.appendChild(subOptions[0]);
            
            if (selectedMainName) {
                subOptions.forEach(opt => {
                    if (opt.value && opt.getAttribute("data-parent-name") === selectedMainName) {
                        const clonedOpt = opt.cloneNode(true);
                        if (clonedOpt.value === currentSelectedVal) {
                            clonedOpt.selected = true;
                        }
                        subSelect.appendChild(clonedOpt);
                    }
                });
            }
            
            if (keepSelection && currentSelectedVal) {
                subSelect.value = currentSelectedVal;
            }
        }
        
        mainSelect.addEventListener("change", function() {
            filterSubCategories(false);
        });
        
        filterSubCategories(true);
    }
});
</script>

<?php
include 'footer.php';
?>
