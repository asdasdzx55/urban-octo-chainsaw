<?php
require_once 'config.php';
require_once __DIR__ . '/storefront_helpers.php';

if (!isAdmin()) {
    header("Location: login.php");
    exit;
}

// 1. رفع صورة سريعة ومباشرة لأي منتج من صفحة الإدارة (بدون مغادرة البحث)
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['quick_upload_product_id'])) {
    $target_id = (int)$_POST['quick_upload_product_id'];
    $ret_q = trim($_POST['return_q'] ?? '');
    $ret_filter = trim($_POST['return_filter'] ?? 'all');
    $ret_page = max(1, (int)($_POST['return_page'] ?? 1));

    $redir_params = http_build_query(array_filter([
        'q' => $ret_q !== '' ? $ret_q : null,
        'filter' => $ret_filter !== 'all' ? $ret_filter : null,
        'page' => $ret_page > 1 ? $ret_page : null,
    ]));

    if ($target_id > 0 && !empty($_FILES['quick_image']) && $_FILES['quick_image']['error'] === UPLOAD_ERR_OK) {
        $uploaded_path = uploadImage($_FILES['quick_image']);
        if ($uploaded_path && isRealProductImage($uploaded_path)) {
            $pdo->prepare("DELETE FROM product_images WHERE product_id = ? AND (LOWER(image_path) LIKE '%placeholder.php%' OR TRIM(COALESCE(image_path,'')) = '')")->execute([$target_id]);
            $has_main = (int)$pdo->query("SELECT COUNT(*) FROM product_images WHERE product_id = {$target_id} AND is_main = 1")->fetchColumn();
            $is_main = $has_main > 0 ? 0 : 1;
            $pdo->prepare("INSERT INTO product_images (product_id, image_path, is_main) VALUES (?, ?, ?)")->execute([$target_id, $uploaded_path, $is_main]);

            $cur_img = $pdo->prepare("SELECT image_url FROM products WHERE id = ? LIMIT 1");
            $cur_img->execute([$target_id]);
            $cur_val = (string)($cur_img->fetchColumn() ?: '');
            if ($is_main === 1 || !isRealProductImage($cur_val)) {
                $pdo->prepare("UPDATE products SET image_url = ? WHERE id = ?")->execute([$uploaded_path, $target_id]);
            }
            header("Location: admin_products.php?" . ($redir_params ? $redir_params . '&' : '') . "msg=img_uploaded");
            exit;
        }
    }
    header("Location: admin_products.php?" . ($redir_params ? $redir_params . '&' : '') . "error=upload_failed");
    exit;
}

// 2. حذف صورة أو إخفاء المنتج عن المتجر سريعاً
if (isset($_GET['clear_image'])) {
    $cid = (int)$_GET['clear_image'];
    if ($cid > 0) {
        $gal_rows = $pdo->prepare("SELECT id, image_path FROM product_images WHERE product_id = ?");
        $gal_rows->execute([$cid]);
        foreach ($gal_rows->fetchAll(PDO::FETCH_ASSOC) as $gr) {
            if (isRealProductImage($gr['image_path'] ?? '')) {
                safeUnlinkProductImageFile($gr['image_path'], __DIR__);
            }
        }
        $cur_stmt = $pdo->prepare("SELECT image_url FROM products WHERE id = ?");
        $cur_stmt->execute([$cid]);
        $cur_url = (string)($cur_stmt->fetchColumn() ?: '');
        if (isRealProductImage($cur_url)) {
            safeUnlinkProductImageFile($cur_url, __DIR__);
        }
        $pdo->prepare("DELETE FROM product_images WHERE product_id = ?")->execute([$cid]);
        $pdo->prepare("UPDATE products SET image_url = '' WHERE id = ?")->execute([$cid]);
    }
    $back_qs = $_GET;
    unset($back_qs['clear_image']);
    $back_qs['msg'] = 'img_cleared';
    header("Location: admin_products.php?" . http_build_query($back_qs));
    exit;
}

// 3. حذف المنتج بالكامل
if (isset($_GET['delete'])) {
    $prod_id = (int)$_GET['delete'];
    $images_stmt = $pdo->prepare("SELECT image_path FROM product_images WHERE product_id = ?");
    $images_stmt->execute([$prod_id]);
    foreach ($images_stmt->fetchAll(PDO::FETCH_COLUMN) as $img_path) {
        if ($img_path && isRealProductImage($img_path)) {
            safeUnlinkProductImageFile($img_path, __DIR__);
        }
    }
    $cur_stmt = $pdo->prepare("SELECT image_url FROM products WHERE id = ?");
    $cur_stmt->execute([$prod_id]);
    $cur_url = (string)($cur_stmt->fetchColumn() ?: '');
    if (isRealProductImage($cur_url)) {
        safeUnlinkProductImageFile($cur_url, __DIR__);
    }
    $pdo->prepare("DELETE FROM product_images WHERE product_id = ?")->execute([$prod_id]);
    $pdo->prepare("DELETE FROM products WHERE id = ?")->execute([$prod_id]);
    header("Location: admin_products.php?msg=deleted");
    exit;
}

// 4. فلاتر البحث والباركود والترقيم (Pagination)
$q = trim($_GET['q'] ?? '');
$filter = trim($_GET['filter'] ?? 'all');
if (!in_array($filter, ['all', 'with_image', 'without_image'], true)) {
    $filter = 'all';
}
$per_page = 50;
$page = max(1, (int)($_GET['page'] ?? 1));

$vis_sql = storefrontVisibleProductSql();
$total_all = (int)$pdo->query("SELECT COUNT(*) FROM products WHERE COALESCE(is_pos_visible, 1) = 1")->fetchColumn();
$total_with_img = (int)$pdo->query("SELECT COUNT(*) FROM products WHERE {$vis_sql}")->fetchColumn();
$total_without_img = max(0, $total_all - $total_with_img);

$where_parts = ["COALESCE(is_pos_visible, 1) = 1"];
$params = [];

if ($filter === 'with_image') {
    $where_parts[] = $vis_sql;
} elseif ($filter === 'without_image') {
    $where_parts[] = "NOT ({$vis_sql})";
}

if ($q !== '') {
    $like = '%' . $q . '%';
    $q_id = is_numeric($q) ? (int)$q : 0;
    $where_parts[] = "(
        barcode = ?
        OR barcode2 = ?
        OR barcode3 = ?
        OR pack_barcode = ?
        OR local_code = ?
        OR id = ?
        OR name LIKE ?
        OR all_barcodes LIKE ?
        OR category LIKE ?
    )";
    array_push($params, $q, $q, $q, $q, $q, $q_id, $like, $like, $like);
}

$where_sql = implode(' AND ', $where_parts);

$stmt_count = $pdo->prepare("SELECT COUNT(*) FROM products WHERE {$where_sql}");
$stmt_count->execute($params);
$matched_count = (int)$stmt_count->fetchColumn();
$total_pages = max(1, (int)ceil($matched_count / $per_page));
if ($page > $total_pages) {
    $page = $total_pages;
}
$offset = ($page - 1) * $per_page;

$order_sql = "ORDER BY id DESC";
if ($q !== '') {
    // إعطاء الأولوية القصوى للتطابق المباشر بالباركود أو الكود الداخلي
    $order_sql = "ORDER BY (CASE WHEN barcode = ? OR barcode2 = ? OR barcode3 = ? OR pack_barcode = ? OR local_code = ? THEN 0 WHEN name LIKE ? THEN 1 ELSE 2 END), id DESC";
}

$sql = "SELECT * FROM products WHERE {$where_sql} {$order_sql} LIMIT {$per_page} OFFSET {$offset}";
$stmt_rows = $pdo->prepare($sql);
if ($q !== '') {
    $exec_params = array_merge($params, [$q, $q, $q, $q, $q, $q . '%']);
    $stmt_rows->execute($exec_params);
} else {
    $stmt_rows->execute($params);
}
$products = $stmt_rows->fetchAll(PDO::FETCH_ASSOC);

include 'header.php';
include 'admin_nav.php';
?>

<div class="container mx-auto px-4 md:px-8 py-8 max-w-7xl animate-fade-in">
    <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
            <h2 class="text-2xl font-serif font-bold text-royal-dark">إدارة المنتجات وتجهيز صور المتجر</h2>
            <p class="text-xs text-gray-500 mt-1">ابحث بالاسم أو امسح الباركود لإضافة صورة ونشر المنتج على المتجر الإلكتروني فوراً (المنتجات بدون صورة تبقى مخفية عن العملاء).</p>
        </div>
        <div class="flex flex-wrap gap-2">
            <button type="button" onclick="openAiBatchModal()" class="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-bold py-2.5 px-4 text-xs transition rounded-xl shadow-xs flex items-center gap-2 cursor-pointer">
                <i class="fa-solid fa-wand-magic-sparkles"></i>
                <span>توليد الأوصاف بالذكاء الاصطناعي (AI)</span>
            </button>
            <a href="admin_dormant_products.php"  class="bg-amber-50 border border-amber-300 text-amber-900 hover:bg-amber-600 hover:text-white font-bold py-2.5 px-4 text-xs transition rounded-xl shadow-xs flex items-center gap-2">
                <i class="fa-solid fa-broom"></i> الأصناف الراكدة والأرشيف
            </a>
            <a href="admin_edit_product.php" class="bg-royal-charcoal text-royal-gold hover:bg-royal-gold hover:text-royal-charcoal font-bold py-2.5 px-5 text-xs uppercase tracking-wider transition rounded-xl shadow-sm flex items-center gap-2">
                <i class="fa-solid fa-plus"></i> إضافة منتج جديد
            </a>
        </div>
    </div>

    <?php if(isset($_GET['msg'])): ?>
        <div class="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 mb-5 text-xs font-bold rounded-xl shadow-xs flex items-center justify-between">
            <span>
                <?php
                if ($_GET['msg'] === 'img_uploaded') echo '✅ تم رفع الصورة بنجاح ونُشر المنتج الآن في واجهة المتجر الإلكتروني!';
                elseif ($_GET['msg'] === 'img_cleared') echo '⚠️ تم حذف الصورة وإخفاء المنتج عن واجهة المتجر الإلكتروني (ما زال موجوداً في الكاشير).';
                elseif ($_GET['msg'] === 'deleted') echo '🗑️ تم حذف المنتج نهائياً.';
                elseif ($_GET['msg'] === 'added') echo '✅ تم إضافة المنتج بنجاح.';
                else echo '✅ تم تنفيذ العملية بنجاح.';
                ?>
            </span>
        </div>
    <?php elseif(isset($_GET['error']) && $_GET['error'] === 'upload_failed'): ?>
        <div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 mb-5 text-xs font-bold rounded-xl">
            ❌ تعذّر رفع الصورة. تأكد من اختيار ملف صورة صالح (JPG / PNG / WEBP).
        </div>
    <?php endif; ?>

    <!-- شريط الإحصائيات والفلترة السريعة -->
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <a href="admin_products.php?filter=all<?php echo $q !== '' ? '&q=' . urlencode($q) : ''; ?>" class="p-4 rounded-2xl border transition shadow-xs flex items-center justify-between <?php echo $filter === 'all' ? 'bg-royal-charcoal text-white border-royal-charcoal shadow-md' : 'bg-white text-royal-dark border-royal-gold/15 hover:border-royal-gold'; ?>">
            <div>
                <p class="text-[11px] font-bold <?php echo $filter === 'all' ? 'text-royal-gold' : 'text-gray-400'; ?>">إجمالي أصناف النظام والـ ERP</p>
                <p class="text-2xl font-serif font-bold mt-0.5"><?php echo number_format($total_all); ?></p>
            </div>
            <i class="fa-solid fa-boxes-stacked text-2xl opacity-75"></i>
        </a>
        <a href="admin_products.php?filter=with_image<?php echo $q !== '' ? '&q=' . urlencode($q) : ''; ?>" class="p-4 rounded-2xl border transition shadow-xs flex items-center justify-between <?php echo $filter === 'with_image' ? 'bg-emerald-700 text-white border-emerald-700 shadow-md' : 'bg-white text-emerald-800 border-emerald-200 hover:border-emerald-400'; ?>">
            <div>
                <p class="text-[11px] font-bold <?php echo $filter === 'with_image' ? 'text-emerald-100' : 'text-emerald-600'; ?>">منشور بالمتجر الإلكتروني (بصورة ✅)</p>
                <p class="text-2xl font-serif font-bold mt-0.5"><?php echo number_format($total_with_img); ?></p>
            </div>
            <i class="fa-solid fa-globe text-2xl opacity-80"></i>
        </a>
        <a href="admin_products.php?filter=without_image<?php echo $q !== '' ? '&q=' . urlencode($q) : ''; ?>" class="p-4 rounded-2xl border transition shadow-xs flex items-center justify-between <?php echo $filter === 'without_image' ? 'bg-amber-600 text-white border-amber-600 shadow-md' : 'bg-white text-amber-800 border-amber-200 hover:border-amber-400'; ?>">
            <div>
                <p class="text-[11px] font-bold <?php echo $filter === 'without_image' ? 'text-amber-100' : 'text-amber-600'; ?>">بانتظار رفع صورة (مخفي عن المتجر)</p>
                <p class="text-2xl font-serif font-bold mt-0.5"><?php echo number_format($total_without_img); ?></p>
            </div>
            <i class="fa-regular fa-image text-2xl opacity-80"></i>
        </a>
    </div>

    <!-- أداة البحث السريع بالاسم والباركود + كاميرا الماسح -->
    <div class="bg-white p-5 rounded-2xl border border-royal-gold/15 shadow-sm mb-6">
        <form method="GET" action="admin_products.php" id="admin-search-form" class="flex flex-col md:flex-row gap-3 items-stretch md:items-center">
            <input type="hidden" name="filter" value="<?php echo htmlspecialchars($filter); ?>">
            <div class="relative flex-1">
                <span class="absolute right-4 top-1/2 -translate-y-1/2 text-royal-darkgold"><i class="fa-solid fa-barcode text-lg"></i></span>
                <input
                    type="text"
                    name="q"
                    id="admin-prod-search-input"
                    value="<?php echo htmlspecialchars($q); ?>"
                    autofocus
                    autocomplete="off"
                    placeholder="امسح الباركود بجهاز الإسكانر أو اكتب اسم الصنف / الكود الداخلي..."
                    class="w-full pr-12 pl-4 py-3.5 bg-royal-cream/35 border border-royal-gold/25 rounded-xl text-sm font-semibold focus:outline-none focus:border-royal-gold focus:bg-white transition"
                >
            </div>
            <div class="flex gap-2">
                <button type="submit" class="bg-royal-charcoal text-royal-gold hover:bg-royal-gold hover:text-royal-charcoal px-6 py-3.5 rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-2">
                    <i class="fa-solid fa-magnifying-glass"></i> بحث
                </button>
                <button type="button" onclick="openCameraBarcodeScanner()" class="bg-royal-sand text-royal-darkgold hover:bg-royal-gold hover:text-royal-charcoal border border-royal-gold/25 px-4 py-3.5 rounded-xl text-xs font-bold transition flex items-center gap-2">
                    <i class="fa-solid fa-camera"></i> مسح بالكاميرا
                </button>
                <?php if ($q !== '' || $filter !== 'all'): ?>
                    <a href="admin_products.php" class="bg-gray-100 text-gray-600 hover:bg-gray-200 px-4 py-3.5 rounded-xl text-xs font-bold transition flex items-center">إعادة ضبط</a>
                <?php endif; ?>
            </div>
        </form>
        <div id="camera-scanner-box" class="hidden mt-4 p-4 bg-royal-cream/50 rounded-xl border border-royal-gold/25">
            <div class="flex justify-between items-center mb-2">
                <span class="text-xs font-bold text-royal-dark">📷 وجّه الكاميرا نحو باركود المنتج:</span>
                <button type="button" onclick="closeCameraBarcodeScanner()" class="text-xs font-bold text-red-600 hover:underline">إغلاق الكاميرا</button>
            </div>
            <div id="qr-reader" class="max-w-sm mx-auto rounded-xl overflow-hidden bg-black"></div>
            <p id="camera-scanner-status" class="text-[11px] text-gray-500 text-center mt-2"></p>
        </div>
        <div class="flex flex-wrap justify-between items-center gap-2 mt-3 text-[11px] text-gray-500 font-semibold">
            <span>نتائج البحث: <b class="text-royal-dark"><?php echo number_format($matched_count); ?></b> منتج (صفحة <?php echo $page; ?> من <?php echo $total_pages; ?>)</span>
            <span>💡 نصيحة: اضغط زر <b>«📷 رفع صورة فورية»</b> بجانب أي منتج لرفع صورته ونشره بالمتجر فوراً.</span>
        </div>
    </div>

    <?php if (empty($products)): ?>
        <div class="bg-white rounded-2xl border border-royal-gold/15 p-12 text-center shadow-xs">
            <i class="fa-solid fa-box-open text-4xl text-royal-gold/50 mb-3"></i>
            <h3 class="text-lg font-bold text-royal-dark">لا توجد منتجات مطابقة لبحثك</h3>
            <p class="text-xs text-gray-500 mt-1 mb-5">جرب البحث بكلمة أخرى أو اضغط «إضافة منتج جديد».</p>
            <a href="admin_products.php" class="bg-royal-charcoal text-royal-gold px-6 py-2.5 rounded-xl text-xs font-bold inline-block">عرض كل المنتجات</a>
        </div>
    <?php else: ?>
        <!-- جدول عرض سطح المكتب -->
        <div class="hidden md:block bg-white border border-royal-gold/10 rounded-2xl overflow-hidden shadow-sm">
            <table class="w-full text-right text-sm">
                <thead class="bg-royal-sand/60 border-b border-royal-gold/10 text-gray-500 uppercase text-[10px] tracking-wider">
                    <tr>
                        <th class="py-3.5 px-4">الصورة والحالة بالمتجر</th>
                        <th class="py-3.5 px-4">المنتج والباركود</th>
                        <th class="py-3.5 px-4">القسم</th>
                        <th class="py-3.5 px-4">السعر والمخزون</th>
                        <th class="py-3.5 px-4 text-center">إضافة صورة / تعديل</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-royal-gold/10">
                    <?php foreach($products as $p):
                        $real_img = resolveProductDisplayImage($pdo, $p);
                        $has_img = ($real_img !== '');
                    ?>
                    <tr class="hover:bg-royal-cream/25 transition-colors">
                        <td class="py-3 px-4 w-44">
                            <div class="flex items-center gap-3">
                                <?php if ($has_img): ?>
                                    <img src="<?php echo htmlspecialchars($real_img); ?>" class="w-12 h-14 object-cover rounded-lg border border-emerald-200 bg-gray-50 shrink-0" loading="lazy">
                                    <span class="text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-1 rounded-lg">منشور بالمتجر ✅</span>
                                <?php else: ?>
                                    <div class="w-12 h-14 rounded-lg border border-dashed border-amber-300 bg-amber-50/70 text-amber-600 flex items-center justify-center shrink-0">
                                        <i class="fa-regular fa-image text-lg"></i>
                                    </div>
                                    <span class="text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200 px-2 py-1 rounded-lg">بدون صورة (مخفي)</span>
                                <?php endif; ?>
                            </div>
                        </td>
                        <td class="py-3 px-4">
                            <div class="font-bold text-royal-dark"><?php echo htmlspecialchars($p['name']); ?></div>
                            <div class="flex flex-wrap gap-2 mt-1 text-[10px] font-mono text-gray-500">
                                <span>#<?php echo (int)$p['id']; ?></span>
                                <?php if (!empty($p['barcode'])): ?>
                                    <span class="bg-gray-100 px-2 py-0.5 rounded text-gray-700">باركود: <?php echo htmlspecialchars($p['barcode']); ?></span>
                                <?php endif; ?>
                                <?php if (!empty($p['local_code'])): ?>
                                    <span class="bg-blue-50 px-2 py-0.5 rounded text-blue-700">ERP: <?php echo htmlspecialchars($p['local_code']); ?></span>
                                <?php endif; ?>
                            </div>
                        </td>
                        <td class="py-3 px-4 text-xs">
                            <span class="font-semibold text-gray-700"><?php echo htmlspecialchars($p['category'] ?: 'عام'); ?></span>
                            <?php if (!empty($p['sub_category'])): ?>
                                <div class="text-[10px] text-gray-400 mt-0.5"><?php echo htmlspecialchars($p['sub_category']); ?></div>
                            <?php endif; ?>
                        </td>
                        <td class="py-3 px-4 text-xs">
                            <div class="font-serif font-bold text-royal-darkgold text-sm"><?php echo number_format((float)$p['price'], 2); ?> <?php echo htmlspecialchars($settings['store_currency'] ?? 'ج.م'); ?></div>
                            <div class="text-[11px] font-mono mt-0.5 <?php echo ((float)$p['stock'] > 0) ? 'text-emerald-700' : 'text-rose-600'; ?>">
                                المخزون: <?php echo rtrim(rtrim(number_format((float)$p['stock'], 3, '.', ''), '0'), '.') ?: '0'; ?>
                            </div>
                        </td>
                        <td class="py-3 px-4">
                            <div class="flex flex-wrap items-center justify-center gap-2">
                                <form method="POST" action="admin_products.php" enctype="multipart/form-data" class="inline-block">
                                    <input type="hidden" name="quick_upload_product_id" value="<?php echo (int)$p['id']; ?>">
                                    <input type="hidden" name="return_q" value="<?php echo htmlspecialchars($q); ?>">
                                    <input type="hidden" name="return_filter" value="<?php echo htmlspecialchars($filter); ?>">
                                    <input type="hidden" name="return_page" value="<?php echo (int)$page; ?>">
                                    <label class="cursor-pointer bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-[11px] font-bold transition shadow-xs inline-flex items-center gap-1.5">
                                        <i class="fa-solid fa-camera"></i> <?php echo $has_img ? 'صورة إضافية' : 'رفع صورة ونشر'; ?>
                                        <input type="file" name="quick_image" accept="image/*" capture="environment" class="hidden" onchange="this.form.submit()">
                                    </label>
                                </form>
                                <a href="admin_edit_product.php?id=<?php echo (int)$p['id']; ?>" class="bg-blue-50 text-blue-700 hover:bg-blue-100 px-3 py-1.5 rounded-lg text-[11px] font-bold transition">تعديل</a>
                                <?php if ($has_img): ?>
                                    <a href="admin_products.php?<?php echo http_build_query(array_filter(['q' => $q ?: null, 'filter' => $filter !== 'all' ? $filter : null, 'page' => $page > 1 ? $page : null, 'clear_image' => (int)$p['id']])); ?>" onclick="return confirm('إخفاء هذا المنتج عن المتجر وحذف صوره؟ (سيبقى موجوداً في الكاشير)')" class="bg-amber-50 text-amber-700 hover:bg-amber-100 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition" title="إخفاء عن المتجر وحذف الصور">إخفاء</a>
                                <?php endif; ?>
                                <a href="admin_products.php?delete=<?php echo (int)$p['id']; ?>" onclick="return confirm('هل أنت متأكد من حذف هذا المنتج نهائياً؟')" class="bg-red-50 text-red-600 hover:bg-red-100 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition" title="حذف"><i class="fa-solid fa-trash-can"></i></a>
                            </div>
                        </td>
                    </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        </div>

        <!-- عرض البطاقات للهواتف -->
        <div class="grid grid-cols-1 gap-4 md:hidden">
            <?php foreach($products as $p):
                $real_img = resolveProductDisplayImage($pdo, $p);
                $has_img = ($real_img !== '');
            ?>
            <div class="bg-white border border-royal-gold/15 rounded-2xl p-4 shadow-xs space-y-3">
                <div class="flex gap-3">
                    <?php if ($has_img): ?>
                        <img src="<?php echo htmlspecialchars($real_img); ?>" class="w-16 h-20 object-cover rounded-xl border border-emerald-200 shrink-0">
                    <?php else: ?>
                        <div class="w-16 h-20 rounded-xl border border-dashed border-amber-300 bg-amber-50 flex items-center justify-center text-amber-500 shrink-0"><i class="fa-regular fa-image text-xl"></i></div>
                    <?php endif; ?>
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center justify-between gap-2">
                            <span class="text-[10px] font-bold px-2 py-0.5 rounded-full <?php echo $has_img ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'; ?>">
                                <?php echo $has_img ? 'منشور ✅' : 'بدون صورة ⚠️'; ?>
                            </span>
                            <span class="font-serif font-bold text-sm text-royal-darkgold"><?php echo number_format((float)$p['price'], 2); ?> ج.م</span>
                        </div>
                        <h4 class="font-bold text-sm text-royal-dark mt-1 truncate"><?php echo htmlspecialchars($p['name']); ?></h4>
                        <p class="text-[10px] font-mono text-gray-500 mt-1">
                            باركود: <?php echo htmlspecialchars($p['barcode'] ?: ($p['local_code'] ?: '—')); ?> | مخزون: <?php echo (float)$p['stock']; ?>
                        </p>
                    </div>
                </div>
                <div class="flex flex-wrap gap-2 pt-2 border-t border-royal-gold/10">
                    <form method="POST" action="admin_products.php" enctype="multipart/form-data" class="flex-1">
                        <input type="hidden" name="quick_upload_product_id" value="<?php echo (int)$p['id']; ?>">
                        <input type="hidden" name="return_q" value="<?php echo htmlspecialchars($q); ?>">
                        <input type="hidden" name="return_filter" value="<?php echo htmlspecialchars($filter); ?>">
                        <input type="hidden" name="return_page" value="<?php echo (int)$page; ?>">
                        <label class="w-full cursor-pointer bg-emerald-600 text-white py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5">
                            <i class="fa-solid fa-camera"></i> <?php echo $has_img ? 'تحديث الصورة' : 'التقاط / رفع صورة'; ?>
                            <input type="file" name="quick_image" accept="image/*" capture="environment" class="hidden" onchange="this.form.submit()">
                        </label>
                    </form>
                    <a href="admin_edit_product.php?id=<?php echo (int)$p['id']; ?>" class="bg-blue-50 text-blue-700 py-2 px-4 rounded-xl text-xs font-bold">تعديل</a>
                </div>
            </div>
            <?php endforeach; ?>
        </div>

        <!-- شريط ترقيم الصفحات (Pagination) -->
        <?php if ($total_pages > 1): ?>
            <div class="mt-8 flex flex-wrap items-center justify-center gap-2">
                <?php
                $renderAdminPage = function(int $pNum, string $label, bool $active = false) use ($q, $filter): string {
                    $url = 'admin_products.php?' . http_build_query(array_filter([
                        'q' => $q !== '' ? $q : null,
                        'filter' => $filter !== 'all' ? $filter : null,
                        'page' => $pNum,
                    ]));
                    $cls = $active
                        ? 'bg-royal-charcoal text-royal-gold border-royal-charcoal font-bold'
                        : 'bg-white text-gray-700 hover:bg-royal-sand border-royal-gold/20';
                    return '<a href="' . htmlspecialchars($url) . '" class="px-3.5 py-2 rounded-xl border text-xs transition ' . $cls . '">' . $label . '</a>';
                };
                if ($page > 1) echo $renderAdminPage($page - 1, 'السابق');
                $sP = max(1, $page - 3);
                $eP = min($total_pages, $page + 3);
                for ($i = $sP; $i <= $eP; $i++) {
                    echo $renderAdminPage($i, (string)$i, $i === $page);
                }
                if ($page < $total_pages) echo $renderAdminPage($page + 1, 'التالي');
                ?>
            </div>
        <?php endif; ?>
    <?php endif; ?>
</div>

<script src="https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js" defer></script>
<script>
let adminQrScanner = null;

function openCameraBarcodeScanner() {
    const box = document.getElementById('camera-scanner-box');
    const statusEl = document.getElementById('camera-scanner-status');
    if (!box) return;
    box.classList.remove('hidden');

    if (typeof Html5Qrcode === 'undefined') {
        if (statusEl) statusEl.textContent = '⚠️ مكتبة الكاميرا قيد التحميل أو غير متوفرة حالياً — يمكنك كتابة/مسح الباركود في الخانة أعلاه.';
        return;
    }
    if (statusEl) statusEl.textContent = 'جاري تشغيل الكاميرا...';
    adminQrScanner = new Html5Qrcode('qr-reader');
    adminQrScanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 260, height: 140 } },
        (decodedText) => {
            const inp = document.getElementById('admin-prod-search-input');
            if (inp) inp.value = decodedText.trim();
            closeCameraBarcodeScanner();
            const form = document.getElementById('admin-search-form');
            if (form) form.submit();
        },
        () => {}
    ).catch((err) => {
        if (statusEl) statusEl.textContent = '⚠️ تعذر فتح الكاميرا: ' + (err && err.message ? err.message : err);
    });
}

function closeCameraBarcodeScanner() {
    const box = document.getElementById('camera-scanner-box');
    if (adminQrScanner) {
        adminQrScanner.stop().catch(() => {}).finally(() => {
            adminQrScanner = null;
        });
    }
    if (box) box.classList.add('hidden');
}
</script>

<?php include 'footer.php'; ?>
