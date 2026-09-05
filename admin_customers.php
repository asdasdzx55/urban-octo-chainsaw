<?php
require_once 'config.php';

if (!isAdmin()) {
    header('Location: login.php');
    exit;
}

// ضمان وجود جدول العملاء
try {
    $pdo->exec("CREATE TABLE IF NOT EXISTS customers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(150) NOT NULL,
        phone VARCHAR(50) NOT NULL UNIQUE,
        phone2 VARCHAR(50) DEFAULT NULL,
        address TEXT DEFAULT NULL,
        governorate VARCHAR(100) DEFAULT NULL,
        delivery_lat VARCHAR(50) DEFAULT NULL,
        delivery_lng VARCHAR(50) DEFAULT NULL,
        delivery_distance_km DECIMAL(10,2) DEFAULT NULL,
        email VARCHAR(255) DEFAULT NULL,
        notes TEXT DEFAULT NULL,
        total_orders INT DEFAULT 0,
        total_spent DECIMAL(10,2) DEFAULT 0.00,
        last_order_date DATETIME DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
} catch (Exception $e) {
    try {
        $pdo->exec("CREATE TABLE IF NOT EXISTS customers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name VARCHAR(150) NOT NULL,
            phone VARCHAR(50) NOT NULL UNIQUE,
            phone2 VARCHAR(50) DEFAULT NULL,
            address TEXT DEFAULT NULL,
            governorate VARCHAR(100) DEFAULT NULL,
            delivery_lat VARCHAR(50) DEFAULT NULL,
            delivery_lng VARCHAR(50) DEFAULT NULL,
            delivery_distance_km DECIMAL(10,2) DEFAULT NULL,
            email VARCHAR(255) DEFAULT NULL,
            notes TEXT DEFAULT NULL,
            total_orders INTEGER DEFAULT 0,
            total_spent DECIMAL(10,2) DEFAULT 0.00,
            last_order_date VARCHAR(50) DEFAULT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )");
    } catch (Exception $e2) {}
}

$msg = '';
$err = '';

// زر مزامنة واستخراج كافة العملاء من الطلبات السابقة
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['sync_from_orders'])) {
    try {
        try { $pdo->exec("ALTER TABLE orders ADD COLUMN governorate VARCHAR(100) DEFAULT 'القاهرة'"); } catch (Exception $e) {}
        try { $pdo->exec("ALTER TABLE orders ADD COLUMN customer_address TEXT DEFAULT NULL"); } catch (Exception $e) {}
        try { $pdo->exec("ALTER TABLE orders ADD COLUMN customer_email VARCHAR(255) DEFAULT NULL"); } catch (Exception $e) {}
        try { $pdo->exec("ALTER TABLE orders ADD COLUMN delivery_lat VARCHAR(50) DEFAULT NULL"); } catch (Exception $e) {}
        try { $pdo->exec("ALTER TABLE orders ADD COLUMN delivery_lng VARCHAR(50) DEFAULT NULL"); } catch (Exception $e) {}
        try { $pdo->exec("ALTER TABLE orders ADD COLUMN delivery_distance_km DECIMAL(10,2) DEFAULT NULL"); } catch (Exception $e) {}

        $orders_groups = $pdo->query("
            SELECT customer_phone, COUNT(id) as total_orders, COALESCE(SUM(total_price), 0) as total_spent, MAX(created_at) as last_order_date
            FROM orders
            WHERE customer_phone IS NOT NULL AND TRIM(customer_phone) != ''
            GROUP BY customer_phone
        ")->fetchAll(PDO::FETCH_ASSOC);

        $imported = 0;
        $updated = 0;

        foreach ($orders_groups as $og) {
            $ph = trim($og['customer_phone']);
            if (empty($ph)) continue;

            $last_o_stmt = $pdo->prepare("SELECT * FROM orders WHERE customer_phone = ? ORDER BY id DESC LIMIT 1");
            $last_o_stmt->execute([$ph]);
            $last_o = $last_o_stmt->fetch(PDO::FETCH_ASSOC);

            // فحص هل العميل مسجل
            $chk = $pdo->prepare("SELECT id, name, address, governorate, delivery_lat, delivery_lng, total_orders, total_spent FROM customers WHERE phone = ? LIMIT 1");
            $chk->execute([$ph]);
            $exist = $chk->fetch(PDO::FETCH_ASSOC);

            $name = !empty($exist['name']) ? $exist['name'] : ($last_o['customer_name'] ?? 'عميل متجر');
            $addr = !empty($exist['address']) ? $exist['address'] : ($last_o['customer_address'] ?? '');
            $gov = !empty($exist['governorate']) ? $exist['governorate'] : ($last_o['governorate'] ?? 'القاهرة');
            $lat = !empty($exist['delivery_lat']) ? $exist['delivery_lat'] : ($last_o['delivery_lat'] ?? null);
            $lng = !empty($exist['delivery_lng']) ? $exist['delivery_lng'] : ($last_o['delivery_lng'] ?? null);
            $dist = !empty($last_o['delivery_distance_km']) ? (float)$last_o['delivery_distance_km'] : null;
            $email = $last_o['customer_email'] ?? null;
            $tot_orders = max((int)($exist['total_orders'] ?? 0), (int)$og['total_orders']);
            $tot_spent = max((float)($exist['total_spent'] ?? 0), (float)$og['total_spent']);
            $last_date = $og['last_order_date'];

            if ($exist) {
                $pdo->prepare("UPDATE customers SET name = ?, address = ?, governorate = ?, email = COALESCE(NULLIF(?, ''), email), delivery_lat = COALESCE(NULLIF(?, ''), delivery_lat), delivery_lng = COALESCE(NULLIF(?, ''), delivery_lng), delivery_distance_km = COALESCE(?, delivery_distance_km), total_orders = ?, total_spent = ?, last_order_date = ? WHERE id = ?")
                    ->execute([$name, $addr, $gov, $email, $lat, $lng, $dist, $tot_orders, $tot_spent, $last_date, $exist['id']]);
                $updated++;
            } else {
                $pdo->prepare("INSERT INTO customers (name, phone, address, governorate, email, delivery_lat, delivery_lng, delivery_distance_km, total_orders, total_spent, last_order_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
                    ->execute([$name, $ph, $addr, $gov, $email, $lat, $lng, $dist, $tot_orders, $tot_spent, $last_date]);
                $imported++;
            }
        }
        $msg = "تمت المزامنة بنجاح! تم إضافة ({$imported}) عميل جديد وتحديث بيانات ({$updated}) عميل من أرشيف الطلبات.";
    } catch (Exception $e) {
        $err = "خطأ أثناء المزامنة: " . $e->getMessage();
    }
}

// إضافة عميل يدوياً
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['add_customer'])) {
    $name = trim($_POST['name'] ?? '');
    $phone = trim($_POST['phone'] ?? '');
    $phone2 = trim($_POST['phone2'] ?? '');
    $address = trim($_POST['address'] ?? '');
    $governorate = trim($_POST['governorate'] ?? 'القاهرة');
    $delivery_lat = trim($_POST['delivery_lat'] ?? '');
    $delivery_lng = trim($_POST['delivery_lng'] ?? '');
    $notes = trim($_POST['notes'] ?? '');

    if (!empty($name) && !empty($phone)) {
        try {
            $ins = $pdo->prepare("INSERT INTO customers (name, phone, phone2, address, governorate, delivery_lat, delivery_lng, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
            $ins->execute([$name, $phone, $phone2, $address, $governorate, $delivery_lat, $delivery_lng, $notes]);
            $msg = 'تمت إضافة العميل بنجاح!';
        } catch (Exception $e) {
            $err = 'رقم الهاتف مسجل بالفعل لعميل آخر!';
        }
    } else {
        $err = 'الاسم ورقم الهاتف مطلوبان!';
    }
}

// تعديل بيانات عميل
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['edit_customer'])) {
    $id = (int)($_POST['customer_id'] ?? 0);
    $name = trim($_POST['name'] ?? '');
    $phone = trim($_POST['phone'] ?? '');
    $phone2 = trim($_POST['phone2'] ?? '');
    $address = trim($_POST['address'] ?? '');
    $governorate = trim($_POST['governorate'] ?? 'القاهرة');
    $delivery_lat = trim($_POST['delivery_lat'] ?? '');
    $delivery_lng = trim($_POST['delivery_lng'] ?? '');
    $notes = trim($_POST['notes'] ?? '');

    if ($id > 0 && !empty($name) && !empty($phone)) {
        try {
            $upd = $pdo->prepare("UPDATE customers SET name = ?, phone = ?, phone2 = ?, address = ?, governorate = ?, delivery_lat = ?, delivery_lng = ?, notes = ? WHERE id = ?");
            $upd->execute([$name, $phone, $phone2, $address, $governorate, $delivery_lat, $delivery_lng, $notes, $id]);
            $msg = 'تم تحديث بيانات العميل بنجاح!';
        } catch (Exception $e) {
            $err = 'حدث خطأ: ' . $e->getMessage();
        }
    }
}

// حذف عميل
if (isset($_GET['delete'])) {
    $del_id = (int)$_GET['delete'];
    if ($del_id > 0) {
        $pdo->prepare("DELETE FROM customers WHERE id = ?")->execute([$del_id]);
        $msg = 'تم حذف العميل بنجاح!';
    }
}

// جلب العملاء مع البحث والتصفح
$search = trim($_GET['search'] ?? '');
$params = [];
$where_sql = '';
if (!empty($search)) {
    $where_sql = "WHERE name LIKE ? OR phone LIKE ? OR phone2 LIKE ? OR address LIKE ? OR governorate LIKE ?";
    $s_term = "%$search%";
    $params = [$s_term, $s_term, $s_term, $s_term, $s_term];
}

$count_stmt = $pdo->prepare("SELECT COUNT(*) FROM customers $where_sql");
$count_stmt->execute($params);
$total_customers = (int)$count_stmt->fetchColumn();

$limit = 50;
$page = max(1, (int)($_GET['page'] ?? 1));
$offset = ($page - 1) * $limit;
$total_pages = ceil($total_customers / $limit) ?: 1;

$list_stmt = $pdo->prepare("SELECT * FROM customers $where_sql ORDER BY total_orders DESC, id DESC LIMIT $limit OFFSET $offset");
$list_stmt->execute($params);
$customers = $list_stmt->fetchAll(PDO::FETCH_ASSOC);

// إحصائيات عامة
$stat_orders = (int)$pdo->query("SELECT COALESCE(SUM(total_orders), 0) FROM customers")->fetchColumn();
$stat_spent = (float)$pdo->query("SELECT COALESCE(SUM(total_spent), 0) FROM customers")->fetchColumn();
$stat_gps = (int)$pdo->query("SELECT COUNT(*) FROM customers WHERE delivery_lat IS NOT NULL AND delivery_lat != ''")->fetchColumn();

require_once 'header.php';
?>

<div class="bg-gray-50 min-h-screen pb-16">
    <?php require_once 'admin_nav.php'; ?>

    <div class="container mx-auto max-w-7xl px-4 py-8">
        
        <!-- عنوان الصفحة والأزرار العلوية -->
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div>
                <h1 class="text-2xl md:text-3xl font-black text-gray-800 flex items-center gap-2.5">
                    <span class="w-10 h-10 rounded-xl bg-cyan-100 text-cyan-600 flex items-center justify-center text-xl shadow-sm">
                        <i class="fa-solid fa-users"></i>
                    </span>
                    دليل وقاعدة بيانات العملاء
                </h1>
                <p class="text-sm text-gray-500 mt-1">فهرس مركزي لبيانات وعناوين ومواقع العملاء المتصل تلقائياً مع الكاشير الويب والمتجر</p>
            </div>

            <div class="flex flex-wrap items-center gap-2">
                <form method="POST" onsubmit="return confirm('هل تريد استخراج وتجميع بيانات العملاء من كافة طلبات المتجر السابقة وتحديث السجلات؟');">
                    <button type="submit" name="sync_from_orders" class="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-bold px-4 py-2.5 rounded-xl shadow-md transition flex items-center gap-2 text-xs md:text-sm">
                        <i class="fa-solid fa-rotate text-amber-200"></i>
                        ⚡ استخراج العملاء من أرشيف الطلبات
                    </button>
                </form>

                <a href="https://asdasdzx55.github.io/urban-octo-chainsaw/pos/" target="_blank" class="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2.5 rounded-xl shadow-md transition flex items-center gap-2 text-xs md:text-sm">
                    <i class="fa-solid fa-cash-register text-amber-300"></i>
                    كاشير الويب (POS)
                </a>

                <button onclick="document.getElementById('addModal').classList.remove('hidden')" class="bg-royal-charcoal hover:bg-black text-white font-bold px-4 py-2.5 rounded-xl shadow-md transition flex items-center gap-2 text-xs md:text-sm">
                    <i class="fa-solid fa-plus text-royal-gold"></i>
                    إضافة عميل جديد
                </button>
            </div>
        </div>

        <?php if (!empty($msg)): ?>
            <div class="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-2xl mb-6 flex items-center gap-3 text-sm font-bold shadow-sm">
                <i class="fa-solid fa-circle-check text-emerald-500 text-lg"></i>
                <?php echo htmlspecialchars($msg); ?>
            </div>
        <?php endif; ?>

        <?php if (!empty($err)): ?>
            <div class="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-2xl mb-6 flex items-center gap-3 text-sm font-bold shadow-sm">
                <i class="fa-solid fa-circle-exclamation text-red-500 text-lg"></i>
                <?php echo htmlspecialchars($err); ?>
            </div>
        <?php endif; ?>

        <!-- بطاقات الإحصائيات -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div class="bg-white p-5 rounded-2xl border border-gray-200/80 shadow-sm flex items-center gap-4">
                <div class="w-12 h-12 rounded-xl bg-cyan-50 text-cyan-600 flex items-center justify-center text-2xl">
                    <i class="fa-solid fa-user-group"></i>
                </div>
                <div>
                    <div class="text-xs text-gray-400 font-bold">إجمالي العملاء</div>
                    <div class="text-2xl font-black text-gray-800"><?php echo number_format($total_customers); ?></div>
                </div>
            </div>

            <div class="bg-white p-5 rounded-2xl border border-gray-200/80 shadow-sm flex items-center gap-4">
                <div class="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-2xl">
                    <i class="fa-solid fa-bag-shopping"></i>
                </div>
                <div>
                    <div class="text-xs text-gray-400 font-bold">طلبات العملاء</div>
                    <div class="text-2xl font-black text-gray-800"><?php echo number_format($stat_orders); ?></div>
                </div>
            </div>

            <div class="bg-white p-5 rounded-2xl border border-gray-200/80 shadow-sm flex items-center gap-4">
                <div class="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center text-2xl">
                    <i class="fa-solid fa-sack-dollar"></i>
                </div>
                <div>
                    <div class="text-xs text-gray-400 font-bold">إجمالي مبيعات العملاء</div>
                    <div class="text-2xl font-black text-amber-600"><?php echo number_format($stat_spent, 2); ?> <span class="text-xs">ج.م</span></div>
                </div>
            </div>

            <div class="bg-white p-5 rounded-2xl border border-gray-200/80 shadow-sm flex items-center gap-4">
                <div class="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center text-2xl">
                    <i class="fa-solid fa-location-dot"></i>
                </div>
                <div>
                    <div class="text-xs text-gray-400 font-bold">محدد لوكيشن GPS</div>
                    <div class="text-2xl font-black text-blue-600"><?php echo number_format($stat_gps); ?></div>
                </div>
            </div>
        </div>

        <!-- شريط البحث -->
        <div class="bg-white p-4 rounded-2xl border border-gray-200/80 shadow-sm mb-6">
            <form method="GET" class="flex flex-col sm:flex-row gap-3">
                <div class="relative flex-1">
                    <i class="fa-solid fa-magnifying-glass absolute right-4 top-1/2 -translate-y-1/2 text-gray-400"></i>
                    <input type="text" name="search" value="<?php echo htmlspecialchars($search); ?>" placeholder="ابحث باسم العميل أو رقم الهاتف أو العنوان..." class="w-full pr-11 pl-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:border-royal-gold focus:ring-1 focus:ring-royal-gold outline-none">
                </div>
                <div class="flex gap-2">
                    <button type="submit" class="bg-royal-charcoal hover:bg-black text-white font-bold px-5 py-2.5 rounded-xl text-sm transition">
                        بحث
                    </button>
                    <?php if (!empty($search)): ?>
                        <a href="admin_customers.php" class="bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold px-4 py-2.5 rounded-xl text-sm transition flex items-center justify-center">
                            إلغاء
                        </a>
                    <?php endif; ?>
                </div>
            </form>
        </div>

        <!-- جدول العملاء -->
        <div class="bg-white rounded-2xl border border-gray-200/80 shadow-sm overflow-hidden">
            <div class="overflow-x-auto">
                <table class="w-full text-right text-xs md:text-sm">
                    <thead>
                        <tr class="bg-gray-50/80 border-b border-gray-200/80 text-gray-500 font-bold">
                            <th class="py-3.5 px-4">#</th>
                            <th class="py-3.5 px-4">العميل</th>
                            <th class="py-3.5 px-4">الهاتف والتواصل</th>
                            <th class="py-3.5 px-4">العنوان والمحافظة</th>
                            <th class="py-3.5 px-4">موقع الخريطة (GPS)</th>
                            <th class="py-3.5 px-4 text-center">الطلبات</th>
                            <th class="py-3.5 px-4 text-center">إجمالي المشتريات</th>
                            <th class="py-3.5 px-4">آخر طلب</th>
                            <th class="py-3.5 px-4 text-center">إجراءات</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-100 font-medium text-gray-700">
                        <?php if (empty($customers)): ?>
                            <tr>
                                <td colspan="9" class="py-12 text-center text-gray-400">
                                    <i class="fa-solid fa-user-slash text-4xl block mb-2 text-gray-300"></i>
                                    لا يوجد عملاء مسجلين حالياً تطابق بحثك.
                                </td>
                            </tr>
                        <?php else: ?>
                            <?php foreach ($customers as $c): ?>
                                <tr class="hover:bg-gray-50/60 transition">
                                    <td class="py-3.5 px-4 text-gray-400 font-mono">#<?php echo $c['id']; ?></td>
                                    <td class="py-3.5 px-4">
                                        <div class="font-bold text-gray-900"><?php echo htmlspecialchars($c['name']); ?></div>
                                        <?php if (!empty($c['email'])): ?>
                                            <div class="text-[11px] text-gray-400"><?php echo htmlspecialchars($c['email']); ?></div>
                                        <?php endif; ?>
                                        <?php if (!empty($c['notes'])): ?>
                                            <div class="text-[11px] text-amber-600 bg-amber-50 px-2 py-0.5 rounded mt-1 inline-block">
                                                <i class="fa-solid fa-note-sticky text-[10px]"></i> <?php echo htmlspecialchars($c['notes']); ?>
                                            </div>
                                        <?php endif; ?>
                                    </td>
                                    <td class="py-3.5 px-4">
                                        <div class="flex items-center gap-1.5 font-mono text-gray-800 font-bold">
                                            <a href="tel:<?php echo htmlspecialchars($c['phone']); ?>" class="hover:text-cyan-600">
                                                <?php echo htmlspecialchars($c['phone']); ?>
                                            </a>
                                            <?php 
                                            $wa_phone = preg_replace('/[^\d]/', '', $c['phone']);
                                            if (strpos($wa_phone, '0') === 0) $wa_phone = '2' . $wa_phone;
                                            ?>
                                            <a href="https://wa.me/<?php echo $wa_phone; ?>" target="_blank" class="w-6 h-6 rounded-full bg-emerald-100 text-emerald-600 hover:bg-emerald-200 flex items-center justify-center text-xs" title="مراسلة واتساب">
                                                <i class="fa-brands fa-whatsapp"></i>
                                            </a>
                                        </div>
                                        <?php if (!empty($c['phone2'])): ?>
                                            <div class="text-[11px] text-gray-400 font-mono mt-0.5">
                                                إضافي: <?php echo htmlspecialchars($c['phone2']); ?>
                                            </div>
                                        <?php endif; ?>
                                    </td>
                                    <td class="py-3.5 px-4">
                                        <span class="inline-block bg-gray-100 text-gray-700 text-[11px] px-2 py-0.5 rounded-full font-bold mb-0.5">
                                            <?php echo htmlspecialchars($c['governorate'] ?? 'القاهرة'); ?>
                                        </span>
                                        <div class="text-xs text-gray-600 max-w-xs truncate" title="<?php echo htmlspecialchars($c['address'] ?? ''); ?>">
                                            <?php echo htmlspecialchars($c['address'] ?? '—'); ?>
                                        </div>
                                    </td>
                                    <td class="py-3.5 px-4">
                                        <?php if (!empty($c['delivery_lat']) && !empty($c['delivery_lng'])): ?>
                                            <a href="https://www.google.com/maps?q=<?php echo $c['delivery_lat']; ?>,<?php echo $c['delivery_lng']; ?>" target="_blank" class="inline-flex items-center gap-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200/80 px-2.5 py-1 rounded-lg text-xs font-bold transition shadow-xs">
                                                <i class="fa-solid fa-map-location-dot text-blue-500"></i>
                                                عرض الخريطة
                                            </a>
                                            <?php if (!empty($c['delivery_distance_km'])): ?>
                                                <div class="text-[10px] text-gray-400 mt-0.5 font-mono">
                                                    <?php echo number_format($c['delivery_distance_km'], 1); ?> كم
                                                </div>
                                            <?php endif; ?>
                                        <?php else: ?>
                                            <span class="text-gray-400 text-xs">—</span>
                                        <?php endif; ?>
                                    </td>
                                    <td class="py-3.5 px-4 text-center font-bold">
                                        <span class="bg-cyan-50 text-cyan-700 px-2.5 py-1 rounded-lg text-xs font-mono font-black">
                                            <?php echo (int)$c['total_orders']; ?>
                                        </span>
                                    </td>
                                    <td class="py-3.5 px-4 text-center font-bold font-mono text-emerald-600">
                                        <?php echo number_format((float)$c['total_spent'], 2); ?> <span class="text-[10px]">ج.م</span>
                                    </td>
                                    <td class="py-3.5 px-4 text-gray-400 text-xs font-mono">
                                        <?php echo !empty($c['last_order_date']) ? date('Y/m/d', strtotime($c['last_order_date'])) : '—'; ?>
                                    </td>
                                    <td class="py-3.5 px-4 text-center">
                                        <div class="flex items-center justify-center gap-1.5">
                                            <button onclick='openEditModal(<?php echo json_encode($c, JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_HEX_AMP); ?>)' class="w-8 h-8 rounded-lg bg-gray-100 hover:bg-cyan-50 text-gray-600 hover:text-cyan-600 flex items-center justify-center transition" title="تعديل العميل">
                                                <i class="fa-solid fa-pen-to-square"></i>
                                            </button>
                                            <a href="admin_customers.php?delete=<?php echo $c['id']; ?>" onclick="return confirm('هل أنت متأكد من حذف هذا العميل نهائياً؟');" class="w-8 h-8 rounded-lg bg-gray-100 hover:bg-red-50 text-gray-600 hover:text-red-600 flex items-center justify-center transition" title="حذف العميل">
                                                <i class="fa-solid fa-trash-can"></i>
                                            </a>
                                        </div>
                                    </td>
                                </tr>
                            <?php endforeach; ?>
                        <?php endif; ?>
                    </tbody>
                </table>
            </div>

            <!-- التصفح Pagination -->
            <?php if ($total_pages > 1): ?>
                <div class="bg-gray-50/80 px-4 py-3 border-t border-gray-200/80 flex items-center justify-between text-xs font-bold text-gray-500">
                    <div>صفحة <?php echo $page; ?> من <?php echo $total_pages; ?> (إجمالي <?php echo number_format($total_customers); ?> عميل)</div>
                    <div class="flex gap-1">
                        <?php for ($i = 1; $i <= $total_pages; $i++): ?>
                            <a href="admin_customers.php?page=<?php echo $i; ?>&search=<?php echo urlencode($search); ?>" class="px-3 py-1.5 rounded-lg border <?php echo $i == $page ? 'bg-royal-charcoal text-white border-royal-charcoal' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-100'; ?>">
                                <?php echo $i; ?>
                            </a>
                        <?php endfor; ?>
                    </div>
                </div>
            <?php endif; ?>
        </div>

    </div>
</div>

<!-- نافذة إضافة عميل جديد -->
<div id="addModal" class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 hidden backdrop-blur-xs">
    <div class="bg-white w-full max-w-lg rounded-3xl shadow-2xl p-6 relative animate-scale-up text-right">
        <button onclick="document.getElementById('addModal').classList.add('hidden')" class="absolute top-5 left-5 text-gray-400 hover:text-gray-600 text-lg">
            <i class="fa-solid fa-xmark"></i>
        </button>
        <h2 class="text-xl font-black text-gray-800 mb-4 flex items-center gap-2">
            <i class="fa-solid fa-user-plus text-royal-gold"></i>
            إضافة عميل جديد
        </h2>
        <form method="POST" class="space-y-3.5 text-xs md:text-sm">
            <div>
                <label class="block text-gray-600 font-bold mb-1">اسم العميل *</label>
                <input type="text" name="name" required placeholder="مثال: أحمد الحلبي" class="w-full px-3.5 py-2 rounded-xl border border-gray-200 outline-none focus:border-royal-gold">
            </div>
            <div class="grid grid-cols-2 gap-3">
                <div>
                    <label class="block text-gray-600 font-bold mb-1">رقم الهاتف الأساسي *</label>
                    <input type="tel" name="phone" required placeholder="010xxxxxxxx" class="w-full px-3.5 py-2 rounded-xl border border-gray-200 outline-none focus:border-royal-gold text-left font-mono">
                </div>
                <div>
                    <label class="block text-gray-600 font-bold mb-1">رقم هاتف إضافي</label>
                    <input type="tel" name="phone2" placeholder="اختياري" class="w-full px-3.5 py-2 rounded-xl border border-gray-200 outline-none focus:border-royal-gold text-left font-mono">
                </div>
            </div>
            <div>
                <label class="block text-gray-600 font-bold mb-1">المحافظة</label>
                <input type="text" name="governorate" value="القاهرة" class="w-full px-3.5 py-2 rounded-xl border border-gray-200 outline-none focus:border-royal-gold">
            </div>
            <div>
                <label class="block text-gray-600 font-bold mb-1">العنوان بالتفصيل</label>
                <textarea name="address" rows="2" placeholder="المنطقة، اسم الشارع، رقم العمارة، الدور، الشقة، علامة مميزة..." class="w-full px-3.5 py-2 rounded-xl border border-gray-200 outline-none focus:border-royal-gold"></textarea>
            </div>
            <div class="grid grid-cols-2 gap-3">
                <div>
                    <label class="block text-gray-600 font-bold mb-1">إحداثيات خط العرض (Lat)</label>
                    <input type="text" name="delivery_lat" placeholder="30.0444" class="w-full px-3.5 py-2 rounded-xl border border-gray-200 outline-none focus:border-royal-gold text-left font-mono">
                </div>
                <div>
                    <label class="block text-gray-600 font-bold mb-1">إحداثيات خط الطول (Lng)</label>
                    <input type="text" name="delivery_lng" placeholder="31.2357" class="w-full px-3.5 py-2 rounded-xl border border-gray-200 outline-none focus:border-royal-gold text-left font-mono">
                </div>
            </div>
            <div>
                <label class="block text-gray-600 font-bold mb-1">ملاحظات خاصة بالعميل</label>
                <input type="text" name="notes" placeholder="مثال: يفضل الاتصال قبل الوصول بـ 15 دقيقة" class="w-full px-3.5 py-2 rounded-xl border border-gray-200 outline-none focus:border-royal-gold">
            </div>
            <div class="pt-3 flex gap-2">
                <button type="submit" name="add_customer" class="flex-1 bg-royal-charcoal hover:bg-black text-white font-bold py-2.5 rounded-xl transition">
                    حفظ العميل
                </button>
                <button type="button" onclick="document.getElementById('addModal').classList.add('hidden')" class="bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold px-4 py-2.5 rounded-xl transition">
                    إلغاء
                </button>
            </div>
        </form>
    </div>
</div>

<!-- نافذة تعديل بيانات العميل -->
<div id="editModal" class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 hidden backdrop-blur-xs">
    <div class="bg-white w-full max-w-lg rounded-3xl shadow-2xl p-6 relative animate-scale-up text-right">
        <button onclick="document.getElementById('editModal').classList.add('hidden')" class="absolute top-5 left-5 text-gray-400 hover:text-gray-600 text-lg">
            <i class="fa-solid fa-xmark"></i>
        </button>
        <h2 class="text-xl font-black text-gray-800 mb-4 flex items-center gap-2">
            <i class="fa-solid fa-user-pen text-royal-gold"></i>
            تعديل بيانات العميل
        </h2>
        <form method="POST" class="space-y-3.5 text-xs md:text-sm">
            <input type="hidden" name="customer_id" id="edit_customer_id" value="">
            <div>
                <label class="block text-gray-600 font-bold mb-1">اسم العميل *</label>
                <input type="text" name="name" id="edit_name" required class="w-full px-3.5 py-2 rounded-xl border border-gray-200 outline-none focus:border-royal-gold">
            </div>
            <div class="grid grid-cols-2 gap-3">
                <div>
                    <label class="block text-gray-600 font-bold mb-1">رقم الهاتف الأساسي *</label>
                    <input type="tel" name="phone" id="edit_phone" required class="w-full px-3.5 py-2 rounded-xl border border-gray-200 outline-none focus:border-royal-gold text-left font-mono">
                </div>
                <div>
                    <label class="block text-gray-600 font-bold mb-1">رقم هاتف إضافي</label>
                    <input type="tel" name="phone2" id="edit_phone2" class="w-full px-3.5 py-2 rounded-xl border border-gray-200 outline-none focus:border-royal-gold text-left font-mono">
                </div>
            </div>
            <div>
                <label class="block text-gray-600 font-bold mb-1">المحافظة</label>
                <input type="text" name="governorate" id="edit_governorate" class="w-full px-3.5 py-2 rounded-xl border border-gray-200 outline-none focus:border-royal-gold">
            </div>
            <div>
                <label class="block text-gray-600 font-bold mb-1">العنوان بالتفصيل</label>
                <textarea name="address" id="edit_address" rows="2" class="w-full px-3.5 py-2 rounded-xl border border-gray-200 outline-none focus:border-royal-gold"></textarea>
            </div>
            <div class="grid grid-cols-2 gap-3">
                <div>
                    <label class="block text-gray-600 font-bold mb-1">إحداثيات خط العرض (Lat)</label>
                    <input type="text" name="delivery_lat" id="edit_delivery_lat" class="w-full px-3.5 py-2 rounded-xl border border-gray-200 outline-none focus:border-royal-gold text-left font-mono">
                </div>
                <div>
                    <label class="block text-gray-600 font-bold mb-1">إحداثيات خط الطول (Lng)</label>
                    <input type="text" name="delivery_lng" id="edit_delivery_lng" class="w-full px-3.5 py-2 rounded-xl border border-gray-200 outline-none focus:border-royal-gold text-left font-mono">
                </div>
            </div>
            <div>
                <label class="block text-gray-600 font-bold mb-1">ملاحظات خاصة بالعميل</label>
                <input type="text" name="notes" id="edit_notes" class="w-full px-3.5 py-2 rounded-xl border border-gray-200 outline-none focus:border-royal-gold">
            </div>
            <div class="pt-3 flex gap-2">
                <button type="submit" name="edit_customer" class="flex-1 bg-royal-charcoal hover:bg-black text-white font-bold py-2.5 rounded-xl transition">
                    تحديث البيانات
                </button>
                <button type="button" onclick="document.getElementById('editModal').classList.add('hidden')" class="bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold px-4 py-2.5 rounded-xl transition">
                    إلغاء
                </button>
            </div>
        </form>
    </div>
</div>

<script>
function openEditModal(c) {
    document.getElementById('edit_customer_id').value = c.id || '';
    document.getElementById('edit_name').value = c.name || '';
    document.getElementById('edit_phone').value = c.phone || '';
    document.getElementById('edit_phone2').value = c.phone2 || '';
    document.getElementById('edit_governorate').value = c.governorate || 'القاهرة';
    document.getElementById('edit_address').value = c.address || '';
    document.getElementById('edit_delivery_lat').value = c.delivery_lat || '';
    document.getElementById('edit_delivery_lng').value = c.delivery_lng || '';
    document.getElementById('edit_notes').value = c.notes || '';
    document.getElementById('editModal').classList.remove('hidden');
}
</script>

<?php require_once 'footer.php'; ?>
