<?php
require_once 'config.php';
require_once __DIR__ . '/storefront_helpers.php';

if (!isAdmin()) {
    header("Location: login.php");
    exit;
}

$filterQuery = buildInvoiceSearchQuery($_GET);
$where_sql = $filterQuery['where_sql'];
$params = $filterQuery['params'];
$order_by = $filterQuery['order_by'];
$f = $filterQuery['filters'];

// تصدير النتائج المفلترة إلى CSV
if (($_GET['export'] ?? '') === 'csv') {
    if (ob_get_level()) {
        ob_end_clean();
    }
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="Filtered_Invoices_' . date('Y-m-d_H-i') . '.csv"');
    $out = fopen('php://output', 'w');
    fwrite($out, "\xEF\xBB\xBF");
    fputcsv($out, [
        'رقم الفاتورة', 'الرقم الداخلي', 'التاريخ', 'العميل', 'الهاتف', 'العنوان',
        'النوع', 'المصدر', 'طريقة الدفع', 'الكاشير', 'الأصناف', 'الخصم', 'الشحن', 'الإجمالي', 'الحالة'
    ]);

    $exp_stmt = $pdo->prepare("SELECT id, invoice_barcode, created_at, customer_name, customer_phone, customer_address, order_type, source, payment_method, cashier_name, items_json, order_details, discount_amount, delivery_fee, total_price, status FROM orders WHERE {$where_sql} ORDER BY {$order_by} LIMIT 5000");
    $exp_stmt->execute($params);
    while ($row = $exp_stmt->fetch(PDO::FETCH_ASSOC)) {
        $items = parseOrderItemsForDisplay($row);
        $items_txt = !empty($items)
            ? implode(' | ', array_map(static function ($it) {
                return trim(($it['name'] ?? '') . ' × ' . ($it['qty'] ?? 1) . ' = ' . ($it['total'] ?? 0));
            }, $items))
            : str_replace(["\r", "\n"], ' | ', trim((string)($row['order_details'] ?? '')));

        fputcsv($out, [
            $row['invoice_barcode'] ?: ('INV-' . $row['id']),
            '#' . $row['id'],
            $row['created_at'],
            $row['customer_name'] ?: 'عميل نقدي',
            $row['customer_phone'] ?: '',
            $row['customer_address'] ?: '',
            $row['order_type'] ?: 'hall',
            $row['source'] ?: 'dreamsoft',
            $row['payment_method'] ?: 'كاش',
            $row['cashier_name'] ?: '',
            $items_txt,
            $row['discount_amount'] ?? 0,
            $row['delivery_fee'] ?? 0,
            $row['total_price'] ?? 0,
            $row['status'] ?: 'completed'
        ]);
    }
    fclose($out);
    exit;
}

$page = max(1, (int)($_GET['page'] ?? 1));
$per_page = 50;
$offset = ($page - 1) * $per_page;

$cnt_stmt = $pdo->prepare("SELECT COUNT(*) FROM orders WHERE {$where_sql}");
$cnt_stmt->execute($params);
$total_count = (int)$cnt_stmt->fetchColumn();

$sum_stmt = $pdo->prepare("SELECT COALESCE(SUM(total_price), 0) FROM orders WHERE {$where_sql}");
$sum_stmt->execute($params);
$total_sales = (float)$sum_stmt->fetchColumn();
$avg_invoice = $total_count > 0 ? ($total_sales / $total_count) : 0.0;
$total_pages = max(1, (int)ceil($total_count / $per_page));
if ($page > $total_pages) {
    $page = $total_pages;
    $offset = ($page - 1) * $per_page;
}

$list_stmt = $pdo->prepare("SELECT id, invoice_barcode, customer_name, customer_phone, customer_address, total_price, discount_amount, delivery_fee, payment_method, status, cashier_name, delivery_person, created_at, order_type, source, items_json, order_details FROM orders WHERE {$where_sql} ORDER BY {$order_by} LIMIT {$offset}, {$per_page}");
$list_stmt->execute($params);
$invoices = $list_stmt->fetchAll(PDO::FETCH_ASSOC);

$currency = htmlspecialchars($settings['store_currency'] ?? 'ج.م', ENT_QUOTES, 'UTF-8');
$store_name = htmlspecialchars($settings['store_name'] ?? 'سوبر ماركت المنزل السوري', ENT_QUOTES, 'UTF-8');

$preset = trim((string)($_GET['preset'] ?? ''));
$today_str = date('Y-m-d');
$yesterday_str = date('Y-m-d', strtotime('-1 day'));
$week_str = date('Y-m-d', strtotime('-7 days'));
$month_start_str = date('Y-m-01');
$last_month_start = date('Y-m-01', strtotime('first day of last month'));
$last_month_end = date('Y-m-t', strtotime('last month'));

$base_query = $_GET;
unset($base_query['page'], $base_query['export']);

include 'header.php';
include 'admin_nav.php';
?>

<div class="container mx-auto px-4 md:px-8 py-8 max-w-7xl animate-fade-in">
    <!-- Title & Export -->
    <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
            <h2 class="text-2xl font-serif font-bold text-royal-dark flex items-center gap-2">
                <i class="fa-solid fa-file-invoice text-royal-darkgold"></i>
                <span>البحث وفلترة الفواتير القديمة</span>
            </h2>
            <p class="text-xs text-gray-500 mt-1">
                ابحث في جميع الفواتير (دريم سوفت + الكاشير + الأونلاين) برقم الفاتورة، العميل، الهاتف، التاريخ، طريقة الدفع، المبلغ، أو اسم الصنف داخل الفاتورة.
            </p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
            <a href="admin_invoices.php?<?php echo htmlspecialchars(http_build_query(array_merge($base_query, ['export' => 'csv'])), ENT_QUOTES, 'UTF-8'); ?>" class="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-2.5 px-4 rounded-xl shadow-xs transition flex items-center gap-2">
                <i class="fa-solid fa-file-csv"></i>
                <span>تصدير النتائج (Excel)</span>
            </a>
            <a href="/pos/" target="_blank" class="bg-royal-charcoal hover:bg-royal-gold hover:text-royal-charcoal text-white text-xs font-bold py-2.5 px-4 rounded-xl shadow-xs transition flex items-center gap-2">
                <i class="fa-solid fa-cash-register"></i>
                <span>فتح كاشير الويب</span>
            </a>
        </div>
    </div>

    <!-- KPI Cards -->
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div class="bg-white border border-royal-gold/15 rounded-2xl p-4 shadow-xs flex items-center justify-between">
            <div>
                <p class="text-xs font-bold text-gray-500">إجمالي الفواتير المطابقة</p>
                <p class="text-2xl font-black text-royal-dark mt-1"><?php echo number_format($total_count); ?> <span class="text-xs font-normal text-gray-400">فاتورة</span></p>
            </div>
            <div class="w-11 h-11 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center text-lg">
                <i class="fa-solid fa-receipt"></i>
            </div>
        </div>
        <div class="bg-white border border-royal-gold/15 rounded-2xl p-4 shadow-xs flex items-center justify-between">
            <div>
                <p class="text-xs font-bold text-gray-500">إجمالي قيمة النتائج</p>
                <p class="text-2xl font-black text-emerald-700 mt-1"><?php echo number_format($total_sales, 2); ?> <span class="text-xs font-normal text-gray-400"><?php echo $currency; ?></span></p>
            </div>
            <div class="w-11 h-11 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-lg">
                <i class="fa-solid fa-coins"></i>
            </div>
        </div>
        <div class="bg-white border border-royal-gold/15 rounded-2xl p-4 shadow-xs flex items-center justify-between">
            <div>
                <p class="text-xs font-bold text-gray-500">متوسط قيمة الفاتورة</p>
                <p class="text-2xl font-black text-royal-darkgold mt-1"><?php echo number_format($avg_invoice, 2); ?> <span class="text-xs font-normal text-gray-400"><?php echo $currency; ?></span></p>
            </div>
            <div class="w-11 h-11 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center text-lg">
                <i class="fa-solid fa-chart-simple"></i>
            </div>
        </div>
    </div>

    <!-- Filter Form Card -->
    <div class="bg-white border border-royal-gold/15 rounded-2xl p-5 shadow-xs mb-6 space-y-4">
        <!-- Quick Period Presets -->
        <div class="flex flex-wrap items-center gap-2 pb-3 border-b border-gray-100">
            <span class="text-xs font-bold text-gray-500 ml-1"><i class="fa-regular fa-calendar"></i> فترة سريعة:</span>
            <?php
            $presets = [
                'all' => ['label' => 'الكل', 'from' => '', 'to' => ''],
                'today' => ['label' => 'اليوم', 'from' => $today_str, 'to' => $today_str],
                'yesterday' => ['label' => 'أمس', 'from' => $yesterday_str, 'to' => $yesterday_str],
                'week' => ['label' => 'آخر 7 أيام', 'from' => $week_str, 'to' => $today_str],
                'month' => ['label' => 'هذا الشهر', 'from' => $month_start_str, 'to' => $today_str],
                'last_month' => ['label' => 'الشهر السابق', 'from' => $last_month_start, 'to' => $last_month_end],
            ];
            foreach ($presets as $p_key => $p_info):
                $q_arr = $base_query;
                $q_arr['preset'] = $p_key;
                if ($p_key === 'all') {
                    unset($q_arr['from_date'], $q_arr['to_date']);
                } else {
                    $q_arr['from_date'] = $p_info['from'];
                    $q_arr['to_date'] = $p_info['to'];
                }
                $is_active = ($preset === $p_key) || ($p_key === 'all' && $preset === '' && $f['from_date'] === '' && $f['to_date'] === '');
            ?>
                <a href="admin_invoices.php?<?php echo htmlspecialchars(http_build_query($q_arr), ENT_QUOTES, 'UTF-8'); ?>"
                   class="px-3 py-1.5 rounded-xl text-xs font-bold transition <?php echo $is_active ? 'bg-royal-charcoal text-white shadow-xs' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'; ?>">
                    <?php echo $p_info['label']; ?>
                </a>
            <?php endforeach; ?>
        </div>

        <form method="GET" action="admin_invoices.php" class="space-y-3">
            <div class="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div class="md:col-span-2">
                    <label class="block text-[11px] font-bold text-gray-500 mb-1">بحث (رقم الفاتورة / العميل / الهاتف / اسم الصنف / الباركود)</label>
                    <input type="text" name="search" value="<?php echo htmlspecialchars($f['search'], ENT_QUOTES, 'UTF-8'); ?>" placeholder="مثال: INV-12845 أو اسم العميل أو الهاتف أو اسم المنتج..." class="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-royal-gold">
                </div>
                <div>
                    <label class="block text-[11px] font-bold text-gray-500 mb-1">من تاريخ</label>
                    <input type="date" name="from_date" value="<?php echo htmlspecialchars($f['from_date'], ENT_QUOTES, 'UTF-8'); ?>" class="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-royal-gold">
                </div>
                <div>
                    <label class="block text-[11px] font-bold text-gray-500 mb-1">إلى تاريخ</label>
                    <input type="date" name="to_date" value="<?php echo htmlspecialchars($f['to_date'], ENT_QUOTES, 'UTF-8'); ?>" class="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-royal-gold">
                </div>
            </div>

            <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
                <div>
                    <label class="block text-[11px] font-bold text-gray-500 mb-1">طريقة الدفع</label>
                    <select name="payment_type" class="w-full border border-gray-200 rounded-xl px-2.5 py-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-royal-gold">
                        <option value="all" <?php echo $f['payment_type'] === '' || $f['payment_type'] === 'all' ? 'selected' : ''; ?>>الكل</option>
                        <option value="cash" <?php echo $f['payment_type'] === 'cash' ? 'selected' : ''; ?>>نقدي / كاش</option>
                        <option value="credit" <?php echo $f['payment_type'] === 'credit' ? 'selected' : ''; ?>>آجل / حساب عميل</option>
                        <option value="instapay" <?php echo $f['payment_type'] === 'instapay' ? 'selected' : ''; ?>>إنستاباي / مسبق</option>
                        <option value="card" <?php echo $f['payment_type'] === 'card' ? 'selected' : ''; ?>>فيزا / بطاقة</option>
                    </select>
                </div>
                <div>
                    <label class="block text-[11px] font-bold text-gray-500 mb-1">نوع الطلب</label>
                    <select name="order_type" class="w-full border border-gray-200 rounded-xl px-2.5 py-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-royal-gold">
                        <option value="all" <?php echo $f['order_type'] === '' || $f['order_type'] === 'all' ? 'selected' : ''; ?>>الكل</option>
                        <option value="hall" <?php echo $f['order_type'] === 'hall' ? 'selected' : ''; ?>>مبيعات المحل</option>
                        <option value="delivery" <?php echo $f['order_type'] === 'delivery' ? 'selected' : ''; ?>>دليفري / توصيل</option>
                    </select>
                </div>
                <div>
                    <label class="block text-[11px] font-bold text-gray-500 mb-1">المصدر</label>
                    <select name="source" class="w-full border border-gray-200 rounded-xl px-2.5 py-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-royal-gold">
                        <option value="all" <?php echo $f['source'] === '' || $f['source'] === 'all' ? 'selected' : ''; ?>>الكل</option>
                        <option value="dreamsoft" <?php echo $f['source'] === 'dreamsoft' ? 'selected' : ''; ?>>دريم سوفت</option>
                        <option value="desktop_pos" <?php echo $f['source'] === 'desktop_pos' ? 'selected' : ''; ?>>كاشير الكمبيوتر</option>
                        <option value="phone_pos" <?php echo $f['source'] === 'phone_pos' ? 'selected' : ''; ?>>كاشير الموبايل</option>
                        <option value="web" <?php echo $f['source'] === 'web' ? 'selected' : ''; ?>>أونلاين / ويب</option>
                    </select>
                </div>
                <div>
                    <label class="block text-[11px] font-bold text-gray-500 mb-1">أقل مبلغ</label>
                    <input type="number" step="any" min="0" name="min_total" value="<?php echo htmlspecialchars($f['min_total'], ENT_QUOTES, 'UTF-8'); ?>" placeholder="0" class="w-full border border-gray-200 rounded-xl px-2.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-royal-gold">
                </div>
                <div>
                    <label class="block text-[11px] font-bold text-gray-500 mb-1">أعلى مبلغ</label>
                    <input type="number" step="any" min="0" name="max_total" value="<?php echo htmlspecialchars($f['max_total'], ENT_QUOTES, 'UTF-8'); ?>" placeholder="..." class="w-full border border-gray-200 rounded-xl px-2.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-royal-gold">
                </div>
                <div>
                    <label class="block text-[11px] font-bold text-gray-500 mb-1">الحالة</label>
                    <select name="status" class="w-full border border-gray-200 rounded-xl px-2.5 py-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-royal-gold">
                        <option value="" <?php echo $f['status'] === '' ? 'selected' : ''; ?>>النشطة (بدون الملغية)</option>
                        <option value="completed" <?php echo $f['status'] === 'completed' ? 'selected' : ''; ?>>مكتمل فقط</option>
                        <option value="all" <?php echo $f['status'] === 'all' ? 'selected' : ''; ?>>الكل (شاملة الملغية)</option>
                        <option value="cancelled" <?php echo $f['status'] === 'cancelled' ? 'selected' : ''; ?>>الملغية فقط</option>
                    </select>
                </div>
                <div>
                    <label class="block text-[11px] font-bold text-gray-500 mb-1">الترتيب</label>
                    <select name="sort_by" class="w-full border border-gray-200 rounded-xl px-2.5 py-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-royal-gold">
                        <option value="newest" <?php echo $f['sort_by'] === 'newest' ? 'selected' : ''; ?>>الأحدث أولاً</option>
                        <option value="oldest" <?php echo $f['sort_by'] === 'oldest' ? 'selected' : ''; ?>>الأقدم أولاً</option>
                        <option value="highest" <?php echo $f['sort_by'] === 'highest' ? 'selected' : ''; ?>>الأعلى مبلغاً</option>
                        <option value="lowest" <?php echo $f['sort_by'] === 'lowest' ? 'selected' : ''; ?>>الأقل مبلغاً</option>
                    </select>
                </div>
            </div>

            <div class="flex flex-wrap items-center justify-between gap-2 pt-2">
                <div class="w-full sm:w-56">
                    <input type="text" name="cashier" value="<?php echo htmlspecialchars($f['cashier'], ENT_QUOTES, 'UTF-8'); ?>" placeholder="فلتر باسم الكاشير (اختياري)..." class="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-royal-gold">
                </div>
                <div class="flex items-center gap-2">
                    <a href="admin_invoices.php" class="px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold transition">
                        <i class="fa-solid fa-rotate-left"></i> مسح الفلاتر
                    </a>
                    <button type="submit" class="px-6 py-2 rounded-xl bg-royal-charcoal hover:bg-royal-gold hover:text-royal-charcoal text-white text-xs font-bold shadow-xs transition cursor-pointer flex items-center gap-1.5">
                        <i class="fa-solid fa-magnifying-glass"></i> بحث وفلترة
                    </button>
                </div>
            </div>
        </form>
    </div>

    <!-- Results Table -->
    <div class="bg-white border border-royal-gold/15 rounded-2xl shadow-xs overflow-hidden">
        <div class="overflow-x-auto">
            <table class="w-full text-right text-xs">
                <thead class="bg-royal-sand/40 text-gray-600 border-b border-royal-gold/10 font-bold">
                    <tr>
                        <th class="p-4">رقم الفاتورة</th>
                        <th class="p-4">التاريخ والوقت</th>
                        <th class="p-4">العميل / الهاتف</th>
                        <th class="p-4">الأصناف</th>
                        <th class="p-4">الدفع والنوع</th>
                        <th class="p-4 text-center">الإجمالي</th>
                        <th class="p-4 text-center">الإجراءات</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-100">
                    <?php if (empty($invoices)): ?>
                        <tr>
                            <td colspan="7" class="p-10 text-center text-gray-400 font-bold">
                                لا توجد فواتير مطابقة لمعايير البحث الحالية. جرّب توسيع الفترة أو مسح الفلاتر.
                            </td>
                        </tr>
                    <?php else: ?>
                        <?php foreach ($invoices as $inv): ?>
                            <?php
                            $inv_no = $inv['invoice_barcode'] ?: ('INV-' . $inv['id']);
                            $items = parseOrderItemsForDisplay($inv);
                            $items_count = count($items);
                            $preview_names = [];
                            foreach (array_slice($items, 0, 2) as $it) {
                                $preview_names[] = ($it['name'] ?? '') . ' (' . ($it['qty'] ?? 1) . ')';
                            }
                            $items_preview = !empty($preview_names)
                                ? implode('، ', $preview_names) . ($items_count > 2 ? ' +' . ($items_count - 2) . ' أصناف' : '')
                                : mb_strimwidth(str_replace(["\r", "\n"], ' ', (string)($inv['order_details'] ?? '')), 0, 60, '...');
                            if ($items_preview === '') {
                                $items_preview = '—';
                            }

                            $modal_payload = [
                                'id' => (int)$inv['id'],
                                'invoice_no' => $inv_no,
                                'created_at' => $inv['created_at'],
                                'customer_name' => $inv['customer_name'] ?: 'عميل نقدي',
                                'customer_phone' => $inv['customer_phone'] ?: '',
                                'customer_address' => $inv['customer_address'] ?: '',
                                'payment_method' => $inv['payment_method'] ?: 'كاش',
                                'order_type' => $inv['order_type'] ?: 'hall',
                                'source' => $inv['source'] ?: 'dreamsoft',
                                'cashier' => $inv['cashier_name'] ?: '',
                                'discount' => (float)($inv['discount_amount'] ?? 0),
                                'delivery_fee' => (float)($inv['delivery_fee'] ?? 0),
                                'total' => (float)($inv['total_price'] ?? 0),
                                'status' => $inv['status'] ?: 'completed',
                                'items' => $items,
                                'details' => (string)($inv['order_details'] ?? ''),
                            ];
                            $json_attr = htmlspecialchars(json_encode($modal_payload, JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_HEX_AMP | JSON_UNESCAPED_UNICODE), ENT_QUOTES, 'UTF-8');
                            ?>
                            <tr class="hover:bg-royal-cream/35 transition">
                                <td class="p-4">
                                    <span class="font-mono font-bold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-lg inline-block"><?php echo htmlspecialchars($inv_no, ENT_QUOTES, 'UTF-8'); ?></span>
                                    <div class="text-[10px] text-gray-400 mt-1">#<?php echo (int)$inv['id']; ?> • <?php echo htmlspecialchars($inv['source'] ?: 'dreamsoft', ENT_QUOTES, 'UTF-8'); ?></div>
                                </td>
                                <td class="p-4 text-[11px] text-gray-600 font-mono" dir="ltr">
                                    <?php echo date('Y-m-d h:i A', strtotime($inv['created_at'])); ?>
                                </td>
                                <td class="p-4">
                                    <div class="font-bold text-royal-dark"><?php echo htmlspecialchars($inv['customer_name'] ?: 'عميل نقدي', ENT_QUOTES, 'UTF-8'); ?></div>
                                    <?php if (!empty($inv['customer_phone'])): ?>
                                        <div class="text-[11px] text-gray-500 font-mono" dir="ltr"><?php echo htmlspecialchars($inv['customer_phone'], ENT_QUOTES, 'UTF-8'); ?></div>
                                    <?php endif; ?>
                                </td>
                                <td class="p-4 max-w-xs">
                                    <div class="text-[11px] text-gray-700 leading-relaxed"><?php echo htmlspecialchars($items_preview, ENT_QUOTES, 'UTF-8'); ?></div>
                                    <?php if (!empty($inv['cashier_name'])): ?>
                                        <div class="text-[10px] text-gray-400 mt-0.5">كاشير: <?php echo htmlspecialchars($inv['cashier_name'], ENT_QUOTES, 'UTF-8'); ?></div>
                                    <?php endif; ?>
                                </td>
                                <td class="p-4">
                                    <span class="inline-block px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200/70 text-[10px] font-bold">
                                        <?php echo htmlspecialchars($inv['payment_method'] ?: 'كاش', ENT_QUOTES, 'UTF-8'); ?>
                                    </span>
                                    <span class="inline-block px-2 py-0.5 rounded-md <?php echo ($inv['order_type'] === 'delivery') ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600'; ?> text-[10px] font-bold mt-1">
                                        <?php echo ($inv['order_type'] === 'delivery') ? 'دليفري' : 'محل'; ?>
                                    </span>
                                    <?php if ($inv['status'] === 'ملغي'): ?>
                                        <span class="inline-block px-2 py-0.5 rounded-md bg-red-100 text-red-700 text-[10px] font-bold mt-1">ملغي</span>
                                    <?php endif; ?>
                                </td>
                                <td class="p-4 text-center font-black text-emerald-700 font-mono text-sm">
                                    <?php echo number_format((float)$inv['total_price'], 2); ?> <span class="text-[10px] font-normal text-gray-500"><?php echo $currency; ?></span>
                                </td>
                                <td class="p-4 text-center">
                                    <div class="flex items-center justify-center gap-1.5 flex-wrap">
                                        <button type="button" onclick="openAdminInvoiceModal(this)" data-invoice="<?php echo $json_attr; ?>" class="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold transition cursor-pointer">
                                            <i class="fa-solid fa-eye"></i> عرض وطباعة
                                        </button>
                                        <a href="admin_order_details.php?id=<?php echo (int)$inv['id']; ?>" class="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-royal-gold hover:text-royal-charcoal text-gray-700 text-[11px] font-bold transition">
                                            التفاصيل
                                        </a>
                                    </div>
                                </td>
                            </tr>
                        <?php endforeach; ?>
                    <?php endif; ?>
                </tbody>
            </table>
        </div>

        <!-- Pagination -->
        <?php if ($total_pages > 1): ?>
            <div class="p-4 bg-gray-50 border-t border-gray-100 flex flex-wrap items-center justify-between gap-3 text-xs font-bold">
                <div class="text-gray-500">
                    صفحة <?php echo $page; ?> من <?php echo $total_pages; ?> (إجمالي <?php echo number_format($total_count); ?> فاتورة)
                </div>
                <div class="flex items-center gap-1.5">
                    <?php if ($page > 1): ?>
                        <a href="admin_invoices.php?<?php echo htmlspecialchars(http_build_query(array_merge($base_query, ['page' => $page - 1])), ENT_QUOTES, 'UTF-8'); ?>" class="px-3 py-1.5 rounded-lg bg-white border border-gray-200 hover:bg-gray-100 text-gray-700">السابق</a>
                    <?php endif; ?>
                    <?php if ($page < $total_pages): ?>
                        <a href="admin_invoices.php?<?php echo htmlspecialchars(http_build_query(array_merge($base_query, ['page' => $page + 1])), ENT_QUOTES, 'UTF-8'); ?>" class="px-3 py-1.5 rounded-lg bg-royal-charcoal text-white hover:bg-royal-gold hover:text-royal-charcoal">التالي</a>
                    <?php endif; ?>
                </div>
            </div>
        <?php endif; ?>
    </div>
</div>

<!-- Invoice Quick View & Print Modal -->
<div id="admin-invoice-modal" class="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs hidden items-center justify-center p-4" onclick="if(event.target === this) closeAdminInvoiceModal()">
    <div class="bg-white rounded-3xl max-w-lg w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        <div class="p-4 border-b border-gray-100 flex items-center justify-between bg-royal-sand/30">
            <h3 id="modal-inv-title" class="font-bold text-base text-royal-dark">تفاصيل الفاتورة</h3>
            <button type="button" onclick="closeAdminInvoiceModal()" class="w-8 h-8 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600 flex items-center justify-center cursor-pointer">
                <i class="fa-solid fa-xmark"></i>
            </button>
        </div>
        <div id="modal-inv-body" class="p-5 overflow-y-auto text-xs space-y-3"></div>
        <div class="p-4 border-t border-gray-100 flex items-center justify-between gap-2 bg-gray-50">
            <a id="modal-inv-details-link" href="#" class="px-4 py-2 rounded-xl bg-gray-200 hover:bg-gray-300 text-gray-800 text-xs font-bold">فتح صفحة الطلب</a>
            <button type="button" onclick="printAdminInvoiceModal()" class="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer flex items-center gap-1.5">
                <i class="fa-solid fa-print"></i> طباعة الفاتورة
            </button>
        </div>
    </div>
</div>

<script>
const ADMIN_STORE_NAME = <?php echo json_encode($store_name, JSON_UNESCAPED_UNICODE); ?>;
const ADMIN_CURRENCY = <?php echo json_encode($currency, JSON_UNESCAPED_UNICODE); ?>;
let currentModalInvoice = null;

function escapeHtmlAdmin(str) {
    return String(str ?? '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
}

function openAdminInvoiceModal(btn) {
    try {
        currentModalInvoice = JSON.parse(btn.getAttribute('data-invoice') || '{}');
    } catch (e) {
        alert('تعذر قراءة بيانات الفاتورة');
        return;
    }
    const inv = currentModalInvoice;
    document.getElementById('modal-inv-title').textContent = `فاتورة ${inv.invoice_no || ('#' + inv.id)}`;
    document.getElementById('modal-inv-details-link').href = `admin_order_details.php?id=${inv.id}`;

    let itemsHtml = '';
    if (Array.isArray(inv.items) && inv.items.length > 0) {
        itemsHtml = `<table class="w-full text-right border-collapse">
            <thead>
                <tr class="border-b border-gray-200 text-gray-500">
                    <th class="py-1.5">الصنف</th>
                    <th class="py-1.5 text-center">الكمية</th>
                    <th class="py-1.5 text-center">السعر</th>
                    <th class="py-1.5 text-left">الإجمالي</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">`;
        inv.items.forEach(it => {
            itemsHtml += `<tr>
                <td class="py-2 font-bold text-gray-800">${escapeHtmlAdmin(it.name || '')}</td>
                <td class="py-2 text-center font-mono">${escapeHtmlAdmin(it.qty ?? 1)}</td>
                <td class="py-2 text-center font-mono">${Number(it.price || 0).toFixed(2)}</td>
                <td class="py-2 text-left font-mono font-bold">${Number(it.total || 0).toFixed(2)}</td>
            </tr>`;
        });
        itemsHtml += `</tbody></table>`;
    } else if (inv.details) {
        itemsHtml = `<pre class="whitespace-pre-wrap bg-gray-50 p-3 rounded-xl text-[11px] font-sans text-gray-700">${escapeHtmlAdmin(inv.details)}</pre>`;
    } else {
        itemsHtml = `<p class="text-gray-400">لا توجد تفاصيل أصناف مسجلة.</p>`;
    }

    document.getElementById('modal-inv-body').innerHTML = `
        <div class="grid grid-cols-2 gap-2 bg-gray-50 p-3 rounded-2xl border border-gray-100">
            <div><span class="text-gray-400">التاريخ:</span> <span class="font-mono font-bold" dir="ltr">${escapeHtmlAdmin(inv.created_at)}</span></div>
            <div><span class="text-gray-400">العميل:</span> <span class="font-bold">${escapeHtmlAdmin(inv.customer_name)}</span></div>
            <div><span class="text-gray-400">الهاتف:</span> <span class="font-mono">${escapeHtmlAdmin(inv.customer_phone || '—')}</span></div>
            <div><span class="text-gray-400">الدفع:</span> <span class="font-bold text-amber-700">${escapeHtmlAdmin(inv.payment_method)}</span></div>
            <div><span class="text-gray-400">الكاشير:</span> <span>${escapeHtmlAdmin(inv.cashier || '—')}</span></div>
            <div><span class="text-gray-400">المصدر:</span> <span>${escapeHtmlAdmin(inv.source)}</span></div>
        </div>
        <div>${itemsHtml}</div>
        <div class="border-t border-gray-200 pt-3 flex items-center justify-between text-sm font-black">
            <span>الإجمالي النهائي</span>
            <span class="text-emerald-700 font-mono">${Number(inv.total || 0).toFixed(2)} ${escapeHtmlAdmin(ADMIN_CURRENCY)}</span>
        </div>
    `;

    const m = document.getElementById('admin-invoice-modal');
    m.classList.remove('hidden');
    m.classList.add('flex');
}

function closeAdminInvoiceModal() {
    const m = document.getElementById('admin-invoice-modal');
    m.classList.add('hidden');
    m.classList.remove('flex');
}

function printAdminInvoiceModal() {
    if (!currentModalInvoice) return;
    const inv = currentModalInvoice;
    const w = window.open('', '_blank', 'width=420,height=680');
    if (!w) {
        alert('يرجى السماح بالنوافذ المنبثقة للطباعة');
        return;
    }
    const rows = (inv.items || []).map(it =>
        `<tr>
            <td>${escapeHtmlAdmin(it.name || '')}</td>
            <td style="text-align:center">${escapeHtmlAdmin(it.qty ?? 1)}</td>
            <td style="text-align:left">${Number(it.total || 0).toFixed(2)}</td>
        </tr>`
    ).join('') || `<tr><td colspan="3" style="white-space:pre-wrap">${escapeHtmlAdmin(inv.details || '')}</td></tr>`;

    w.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>${escapeHtmlAdmin(inv.invoice_no)}</title>
        <style>
            body { font-family: Tahoma, Arial, sans-serif; font-size: 12px; width: 76mm; margin: 0 auto; padding: 8px; }
            h2 { text-align: center; margin: 4px 0; font-size: 15px; }
            .meta { font-size: 11px; border-bottom: 1px dashed #333; padding-bottom: 6px; margin-bottom: 6px; }
            table { width: 100%; border-collapse: collapse; font-size: 11px; }
            th, td { padding: 3px 2px; border-bottom: 1px dotted #ccc; }
            .tot { margin-top: 8px; border-top: 1px dashed #333; padding-top: 6px; font-weight: bold; font-size: 14px; display: flex; justify-content: space-between; }
        </style></head><body>
        <h2>${escapeHtmlAdmin(ADMIN_STORE_NAME)}</h2>
        <div class="meta">
            <div>فاتورة: <b>${escapeHtmlAdmin(inv.invoice_no)}</b></div>
            <div>التاريخ: ${escapeHtmlAdmin(inv.created_at)}</div>
            <div>العميل: ${escapeHtmlAdmin(inv.customer_name)} ${inv.customer_phone ? '(' + escapeHtmlAdmin(inv.customer_phone) + ')' : ''}</div>
            <div>الدفع: ${escapeHtmlAdmin(inv.payment_method)}</div>
        </div>
        <table><thead><tr><th style="text-align:right">الصنف</th><th>الكمية</th><th style="text-align:left">الإجمالي</th></tr></thead><tbody>${rows}</tbody></table>
        <div class="tot"><span>الإجمالي</span><span>${Number(inv.total || 0).toFixed(2)} ${escapeHtmlAdmin(ADMIN_CURRENCY)}</span></div>
        <script>window.onload = function(){ window.print(); };<\/script></body></html>`);
    w.document.close();
}
</script>

<?php include 'footer.php'; ?>
