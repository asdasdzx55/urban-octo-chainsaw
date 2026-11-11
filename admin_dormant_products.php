<?php
require_once 'config.php';
require_once __DIR__ . '/storefront_helpers.php';

if (!isAdmin()) {
    header("Location: login.php");
    exit;
}

ensureProductCleanupQueueSchema($pdo);

$tab = trim($_GET['tab'] ?? 'dormant');
if (!in_array($tab, ['dormant', 'archived', 'queue'], true)) {
    $tab = 'dormant';
}
$range = trim($_GET['range'] ?? 'no_recent_tx');
if (!in_array($range, ['no_recent_tx', 'zero_only', 'negative_only'], true)) {
    $range = 'no_recent_tx';
}
$q = trim($_GET['q'] ?? '');
$page = max(1, (int)($_GET['page'] ?? 1));
$per_page = 50;

// 1. تنفيذ إجراء فردي أو جماعي (أرشفة / حذف آمن / استرجاع)
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['bulk_action'])) {
    $action = trim($_POST['bulk_action']);
    $ids = $_POST['product_ids'] ?? [];
    if (!is_array($ids)) {
        $ids = [$ids];
    }
    $ids = array_values(array_unique(array_filter(array_map('intval', $ids))));

    if (in_array($action, ['archive', 'delete', 'restore'], true) && !empty($ids)) {
        $ph = implode(',', array_fill(0, count($ids), '?'));
        $stmt = $pdo->prepare("SELECT id, name, barcode, local_code FROM products WHERE id IN ({$ph})");
        $stmt->execute($ids);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $queued = 0;
        $reason_map = [
            'archive' => 'أرشفة وإخفاء من إدارة الأصناف الراكدة',
            'delete' => 'حذف آمن أو أرشفة تلقائية (يتزامن مع دريم سوفت)',
            'restore' => 'استرجاع وإعادة تفعيل الصنف في الكاشير ودريم سوفت',
        ];
        foreach ($rows as $row) {
            if (queueProductCleanupAction($pdo, $row, $action, $reason_map[$action])) {
                $queued++;
            }
        }
        $redir_tab = ($action === 'restore') ? 'archived' : $tab;
        header("Location: admin_dormant_products.php?tab=" . urlencode($redir_tab) . "&range=" . urlencode($range) . "&msg=" . urlencode($action) . "&cnt=" . $queued);
        exit;
    }
}

// 2. إحصائيات عامة للكتالوج
$active_count = (int)$pdo->query("SELECT COUNT(*) FROM products WHERE COALESCE(is_pos_visible, 1) = 1")->fetchColumn();
$archived_count = (int)$pdo->query("SELECT COUNT(*) FROM products WHERE COALESCE(is_pos_visible, 1) = 0")->fetchColumn();
$zero_idle_count = (int)$pdo->query("
    SELECT COUNT(*) FROM products p
    WHERE COALESCE(p.is_pos_visible, 1) = 1
      AND p.stock <= 0
      AND NOT EXISTS (SELECT 1 FROM purchase_items pi WHERE pi.product_id = p.id)
      AND NOT EXISTS (SELECT 1 FROM inventory_adjustments ia WHERE ia.product_id = p.id)
")->fetchColumn();
$pending_queue_count = (int)$pdo->query("SELECT COUNT(*) FROM product_cleanup_queue WHERE status = 'pending'")->fetchColumn();

// 3. تجهيز قائمة العرض حسب التبويب المختار
$rows = [];
$matched_count = 0;
$total_pages = 1;

if ($tab === 'queue') {
    $matched_count = (int)$pdo->query("SELECT COUNT(*) FROM product_cleanup_queue")->fetchColumn();
    $total_pages = max(1, (int)ceil($matched_count / $per_page));
    $page = min($page, $total_pages);
    $offset = ($page - 1) * $per_page;
    $rows = $pdo->query("SELECT * FROM product_cleanup_queue ORDER BY id DESC LIMIT {$per_page} OFFSET {$offset}")->fetchAll(PDO::FETCH_ASSOC);
} else {
    $where_parts = [];
    $params = [];

    if ($tab === 'archived') {
        $where_parts[] = "COALESCE(p.is_pos_visible, 1) = 0";
    } else {
        $where_parts[] = "COALESCE(p.is_pos_visible, 1) = 1";
        if ($range === 'zero_only') {
            $where_parts[] = "p.stock = 0";
        } elseif ($range === 'negative_only') {
            $where_parts[] = "p.stock < 0";
        } else {
            $where_parts[] = "p.stock <= 0";
            $where_parts[] = "NOT EXISTS (SELECT 1 FROM purchase_items pi WHERE pi.product_id = p.id)";
            $where_parts[] = "NOT EXISTS (SELECT 1 FROM inventory_adjustments ia WHERE ia.product_id = p.id)";
        }
    }

    if ($q !== '') {
        $like = '%' . $q . '%';
        $q_id = is_numeric($q) ? (int)$q : 0;
        $where_parts[] = "(p.barcode = ? OR p.local_code = ? OR p.id = ? OR p.name LIKE ? OR p.category LIKE ?)";
        array_push($params, $q, $q, $q_id, $like, $like);
    }

    $where_sql = implode(' AND ', $where_parts);
    $stmt_cnt = $pdo->prepare("SELECT COUNT(*) FROM products p WHERE {$where_sql}");
    $stmt_cnt->execute($params);
    $matched_count = (int)$stmt_cnt->fetchColumn();
    $total_pages = max(1, (int)ceil($matched_count / $per_page));
    $page = min($page, $total_pages);
    $offset = ($page - 1) * $per_page;

    $stmt_list = $pdo->prepare("
        SELECT p.*,
               (SELECT COUNT(*) FROM purchase_items pi WHERE pi.product_id = p.id) AS purch_cnt,
               (SELECT status FROM product_cleanup_queue q WHERE q.product_id = p.id ORDER BY q.id DESC LIMIT 1) AS queue_status,
               (SELECT action_type FROM product_cleanup_queue q WHERE q.product_id = p.id ORDER BY q.id DESC LIMIT 1) AS queue_action
        FROM products p
        WHERE {$where_sql}
        ORDER BY p.stock ASC, p.id ASC
        LIMIT {$per_page} OFFSET {$offset}
    ");
    $stmt_list->execute($params);
    $rows = $stmt_list->fetchAll(PDO::FETCH_ASSOC);
}

include 'header.php';
include 'admin_nav.php';
?>

<div class="container mx-auto px-4 md:px-8 py-8 max-w-7xl animate-fade-in">
    <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
            <h2 class="text-2xl font-serif font-bold text-royal-dark">🧹 إدارة الأصناف الراكدة والأرشيف</h2>
            <p class="text-xs text-gray-500 mt-1">
                حذف آمن للأصناف المصفّرة بدون حركات من الكاشير ودريم سوفت مع أرشفة تلقائية للأصناف ذات الفواتير، مع إمكانية الاسترجاع الفوري في أي وقت.
            </p>
        </div>
        <div class="flex flex-wrap gap-2">
            <a href="admin_products.php" class="bg-white border border-royal-gold/30 text-royal-dark hover:bg-royal-cream font-bold py-2.5 px-4 text-xs rounded-xl shadow-xs flex items-center gap-2 transition">
                <i class="fa-solid fa-box-open"></i> العودة لقائمة المنتجات
            </a>
        </div>
    </div>

    <div class="bg-blue-50 border border-blue-200 text-blue-900 rounded-2xl p-4 mb-6 text-xs leading-relaxed">
        <div class="font-bold mb-1"><i class="fa-solid fa-shield-halved ml-1"></i> حماية النسخ الاحتياطي والاسترجاع:</div>
        عند اختيار <strong>حذف آمن</strong>: يُفحص الصنف أولاً في DreamSoft عبر <code>ItemName_Delete</code> ويُؤخذ له Snapshot محلي قبل التنفيذ. إذا لم يكن عليه فواتير قديمة يُحذف من النظامين، وإن كان عليه فواتير يتحول تلقائياً إلى <strong>الأرشيف</strong> (مخفي من الكاشير والمتجر وموقوف في DreamSoft) حتى لا تتأثر أي فاتورة تاريخية — ويمكنك استرجاع أي صنف من تبويب <strong>الأرشيف</strong> بضغطة واحدة.
    </div>

    <?php if (isset($_GET['msg'])): ?>
        <div class="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 mb-5 text-xs font-bold rounded-xl shadow-xs">
            <?php
            $cnt = (int)($_GET['cnt'] ?? 0);
            if ($_GET['msg'] === 'archive') echo "✅ تم أرشفة وإخفاء {$cnt} صنفاً فوراً من الكاشير والمتجر وإرسال إيقاف التعامل لدريم سوفت.";
            elseif ($_GET['msg'] === 'delete') echo "🗑️ تم جدولة الحذف الآمن لـ {$cnt} صنفاً (يُحذف في دريم سوفت خلال ثوانٍ إذا خلا من الفواتير، أو يُؤرشف تلقائياً).";
            elseif ($_GET['msg'] === 'restore') echo "♻️ تم استرجاع وتفعيل {$cnt} صنفاً في الكاشير وإعادة فتحه في دريم سوفت.";
            else echo "✅ تم تنفيذ العملية بنجاح.";
            ?>
        </div>
    <?php endif; ?>

    <!-- بطاقات الإحصائيات والتنقل بين التبويبات -->
    <div class="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
        <div class="p-4 rounded-2xl border border-royal-gold/15 bg-white shadow-xs">
            <p class="text-[11px] font-bold text-gray-400">الأصناف النشطة في الكاشير</p>
            <p class="text-2xl font-serif font-bold text-royal-dark mt-0.5"><?php echo number_format($active_count); ?></p>
        </div>
        <a href="admin_dormant_products.php?tab=dormant" class="p-4 rounded-2xl border transition shadow-xs block <?php echo $tab === 'dormant' ? 'bg-amber-600 text-white border-amber-600 shadow-md' : 'bg-white text-amber-800 border-amber-200 hover:border-amber-400'; ?>">
            <p class="text-[11px] font-bold <?php echo $tab === 'dormant' ? 'text-amber-100' : 'text-amber-600'; ?>">مرشحة للتنظيف (رصيد &le; 0 بلا توريد)</p>
            <p class="text-2xl font-serif font-bold mt-0.5"><?php echo number_format($zero_idle_count); ?></p>
        </a>
        <a href="admin_dormant_products.php?tab=archived" class="p-4 rounded-2xl border transition shadow-xs block <?php echo $tab === 'archived' ? 'bg-royal-charcoal text-white border-royal-charcoal shadow-md' : 'bg-white text-slate-800 border-slate-200 hover:border-royal-gold'; ?>">
            <p class="text-[11px] font-bold <?php echo $tab === 'archived' ? 'text-royal-gold' : 'text-slate-500'; ?>">الأرشيف (موقوف / مخفي)</p>
            <p class="text-2xl font-serif font-bold mt-0.5"><?php echo number_format($archived_count); ?></p>
        </a>
        <a href="admin_dormant_products.php?tab=queue" class="p-4 rounded-2xl border transition shadow-xs block <?php echo $tab === 'queue' ? 'bg-indigo-700 text-white border-indigo-700 shadow-md' : 'bg-white text-indigo-900 border-indigo-200 hover:border-indigo-400'; ?>">
            <p class="text-[11px] font-bold <?php echo $tab === 'queue' ? 'text-indigo-100' : 'text-indigo-600'; ?>">طابور مزامنة دريم سوفت</p>
            <p class="text-2xl font-serif font-bold mt-0.5"><?php echo number_format($pending_queue_count); ?> <span class="text-xs font-normal">معلّق</span></p>
        </a>
    </div>

    <?php if ($tab !== 'queue'): ?>
        <!-- شريط البحث والفلترة -->
        <div class="bg-white p-4 rounded-2xl border border-royal-gold/15 shadow-sm mb-5">
            <form method="GET" action="admin_dormant_products.php" class="flex flex-col md:flex-row gap-3 items-stretch md:items-center">
                <input type="hidden" name="tab" value="<?php echo htmlspecialchars($tab); ?>">
                <?php if ($tab === 'dormant'): ?>
                    <select name="range" onchange="this.form.submit()" class="px-4 py-2.5 bg-royal-cream/40 border border-royal-gold/25 rounded-xl text-xs font-bold text-royal-dark">
                        <option value="no_recent_tx" <?php echo $range === 'no_recent_tx' ? 'selected' : ''; ?>>رصيد &le; 0 وبدون فواتير مشتريات/جرد</option>
                        <option value="zero_only" <?php echo $range === 'zero_only' ? 'selected' : ''; ?>>الرصيد = 0 بالضبط</option>
                        <option value="negative_only" <?php echo $range === 'negative_only' ? 'selected' : ''; ?>>الأرصدة السالبة (&lt; 0)</option>
                    </select>
                <?php endif; ?>
                <input type="text" name="q" value="<?php echo htmlspecialchars($q); ?>" placeholder="ابحث بالاسم أو الباركود أو الكود المحلي..." class="flex-1 px-4 py-2.5 bg-royal-cream/35 border border-royal-gold/25 rounded-xl text-sm font-semibold focus:outline-none focus:border-royal-gold">
                <button type="submit" class="px-6 py-2.5 bg-royal-charcoal text-royal-gold font-bold text-xs rounded-xl hover:bg-royal-gold hover:text-royal-charcoal transition cursor-pointer">
                    <i class="fa-solid fa-magnifying-glass ml-1"></i> بحث
                </button>
            </form>
        </div>

        <form method="POST" action="admin_dormant_products.php?tab=<?php echo urlencode($tab); ?>&range=<?php echo urlencode($range); ?>" onsubmit="return confirmBulkCleanupAction(event)">
            <div class="bg-white border border-royal-gold/15 rounded-2xl shadow-sm overflow-hidden">
                <div class="p-4 bg-royal-cream/40 border-b border-royal-gold/15 flex flex-wrap items-center justify-between gap-3">
                    <label class="inline-flex items-center gap-2 text-xs font-bold text-royal-dark cursor-pointer">
                        <input type="checkbox" id="chk-select-all" onchange="document.querySelectorAll('.chk-prod').forEach(c => c.checked = this.checked)" class="w-4 h-4 accent-amber-600 rounded">
                        <span>تحديد جميع المعروضين في هذه الصفحة (<?php echo count($rows); ?>)</span>
                    </label>
                    <div class="flex flex-wrap gap-2">
                        <?php if ($tab === 'archived'): ?>
                            <button type="submit" name="bulk_action" value="restore" class="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs cursor-pointer transition">
                                <i class="fa-solid fa-rotate-left ml-1"></i> استرجاع وإعادة تفعيل المحدد
                            </button>
                            <button type="submit" name="bulk_action" value="delete" class="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl shadow-xs cursor-pointer transition">
                                <i class="fa-solid fa-trash ml-1"></i> حذف آمن للمحدد (إن خلا من الفواتير)
                            </button>
                        <?php else: ?>
                            <button type="submit" name="bulk_action" value="archive" class="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-xl shadow-xs cursor-pointer transition">
                                <i class="fa-solid fa-box-archive ml-1"></i> أرشفة وإخفاء المحدد فقط
                            </button>
                            <button type="submit" name="bulk_action" value="delete" class="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl shadow-xs cursor-pointer transition">
                                <i class="fa-solid fa-broom ml-1"></i> حذف آمن للمحدد (مع أرشفة التلقائي لذوي الفواتير)
                            </button>
                        <?php endif; ?>
                    </div>
                </div>

                <div class="overflow-x-auto">
                    <table class="w-full text-right border-collapse text-xs">
                        <thead>
                            <tr class="bg-gray-50 border-b text-gray-500">
                                <th class="p-3 w-10 text-center">#</th>
                                <th class="p-3">الصنف</th>
                                <th class="p-3">الكود / الباركود</th>
                                <th class="p-3">القسم</th>
                                <th class="p-3">السعر</th>
                                <th class="p-3">الرصيد</th>
                                <th class="p-3">المزامنة</th>
                                <th class="p-3 text-center">إجراء سريع</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-100">
                            <?php if (empty($rows)): ?>
                                <tr><td colspan="8" class="p-10 text-center text-gray-400 font-bold">لا توجد أصناف مطابقة لهذا الفلتر.</td></tr>
                            <?php else: ?>
                                <?php foreach ($rows as $row): ?>
                                    <tr class="hover:bg-royal-cream/25 transition">
                                        <td class="p-3 text-center">
                                            <input type="checkbox" name="product_ids[]" value="<?php echo (int)$row['id']; ?>" class="chk-prod w-4 h-4 accent-amber-600 rounded">
                                        </td>
                                        <td class="p-3 font-bold text-royal-dark">
                                            <?php echo htmlspecialchars($row['name'] ?? ''); ?>
                                            <?php if (isRealProductImage($row['image_url'] ?? '')): ?>
                                                <span class="mr-1 px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] rounded-full">له صورة</span>
                                            <?php endif; ?>
                                        </td>
                                        <td class="p-3 font-mono text-[11px] text-gray-600">
                                            <div>كود: <?php echo htmlspecialchars($row['local_code'] ?: $row['id']); ?></div>
                                            <?php if (!empty($row['barcode'])): ?><div><?php echo htmlspecialchars($row['barcode']); ?></div><?php endif; ?>
                                        </td>
                                        <td class="p-3 text-gray-600"><?php echo htmlspecialchars($row['category'] ?? 'عام'); ?></td>
                                        <td class="p-3 font-bold"><?php echo number_format((float)$row['price'], 2); ?> ج.م</td>
                                        <td class="p-3 font-bold <?php echo ((float)$row['stock']) < 0 ? 'text-red-600' : 'text-gray-700'; ?>">
                                            <?php echo (float)$row['stock']; ?>
                                        </td>
                                        <td class="p-3">
                                            <?php if (($row['queue_status'] ?? '') === 'pending'): ?>
                                                <span class="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold text-[10px]">بانتظار دريم سوفت (<?php echo htmlspecialchars($row['queue_action']); ?>)</span>
                                            <?php elseif (($row['queue_status'] ?? '') === 'done'): ?>
                                                <span class="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-bold text-[10px]">مكتمل</span>
                                            <?php else: ?>
                                                <span class="text-gray-400">—</span>
                                            <?php endif; ?>
                                        </td>
                                        <td class="p-3 text-center">
                                            <a href="admin_edit_product.php?id=<?php echo (int)$row['id']; ?>" class="px-2.5 py-1 bg-gray-100 hover:bg-gray-200 rounded-lg text-[11px] font-bold text-gray-700">تعديل</a>
                                        </td>
                                    </tr>
                                <?php endforeach; ?>
                            <?php endif; ?>
                        </tbody>
                    </table>
                </div>
            </div>
        </form>
    <?php else: ?>
        <div class="bg-white border border-royal-gold/15 rounded-2xl shadow-sm overflow-x-auto">
            <table class="w-full text-right border-collapse text-xs">
                <thead>
                    <tr class="bg-gray-50 border-b text-gray-500">
                        <th class="p-3">#</th>
                        <th class="p-3">كود الصنف</th>
                        <th class="p-3">الاسم</th>
                        <th class="p-3">الإجراء</th>
                        <th class="p-3">الحالة</th>
                        <th class="p-3">النتيجة في DreamSoft</th>
                        <th class="p-3">التاريخ</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-100">
                    <?php if (empty($rows)): ?>
                        <tr><td colspan="7" class="p-10 text-center text-gray-400 font-bold">سجل العمليات فارغ حتى الآن.</td></tr>
                    <?php else: ?>
                        <?php foreach ($rows as $qrow): ?>
                            <tr>
                                <td class="p-3 font-mono"><?php echo (int)$qrow['id']; ?></td>
                                <td class="p-3 font-mono"><?php echo htmlspecialchars($qrow['local_code'] ?: $qrow['product_id']); ?></td>
                                <td class="p-3 font-bold"><?php echo htmlspecialchars($qrow['product_name'] ?? ''); ?></td>
                                <td class="p-3 font-bold"><?php echo htmlspecialchars($qrow['action_type']); ?></td>
                                <td class="p-3">
                                    <span class="px-2 py-0.5 rounded-full text-[10px] font-bold <?php echo $qrow['status'] === 'done' ? 'bg-emerald-100 text-emerald-700' : ($qrow['status'] === 'failed' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'); ?>">
                                        <?php echo htmlspecialchars($qrow['status']); ?>
                                    </span>
                                </td>
                                <td class="p-3 text-gray-600"><?php echo htmlspecialchars($qrow['result_note'] ?: ($qrow['reason'] ?? '')); ?></td>
                                <td class="p-3 font-mono text-[11px] text-gray-500"><?php echo htmlspecialchars($qrow['created_at']); ?></td>
                            </tr>
                        <?php endforeach; ?>
                    <?php endif; ?>
                </tbody>
            </table>
        </div>
    <?php endif; ?>

    <?php if ($total_pages > 1): ?>
        <div class="mt-5 flex justify-center gap-2 flex-wrap">
            <?php for ($p_i = max(1, $page - 4); $p_i <= min($total_pages, $page + 4); $p_i++): ?>
                <a href="admin_dormant_products.php?tab=<?php echo urlencode($tab); ?>&range=<?php echo urlencode($range); ?>&q=<?php echo urlencode($q); ?>&page=<?php echo $p_i; ?>"
                   class="px-3.5 py-2 rounded-xl text-xs font-bold border <?php echo $p_i === $page ? 'bg-royal-charcoal text-royal-gold border-royal-charcoal' : 'bg-white text-gray-600 border-gray-200 hover:border-royal-gold'; ?>">
                    <?php echo $p_i; ?>
                </a>
            <?php endfor; ?>
        </div>
    <?php endif; ?>
</div>

<script>
function confirmBulkCleanupAction(e) {
    const checked = document.querySelectorAll('.chk-prod:checked').length;
    if (checked === 0) {
        alert('يرجى تحديد صنف واحد على الأقل أولاً.');
        e.preventDefault();
        return false;
    }
    const submitter = e.submitter;
    const actionVal = submitter ? submitter.value : '';
    if (actionVal === 'delete') {
        return confirm(`سيتم فحص ${checked} صنفاً: الأصناف التي ليس عليها فواتير ستُحذف نهائياً من النظامين (مع نسخة Snapshot احتياطية)، والأصناف ذات الفواتير ستُؤرشف وتُخفى حفاظاً على الحسابات. هل تريد المتابعة؟`);
    }
    if (actionVal === 'archive') {
        return confirm(`سيتم أرشفة وإخفاء ${checked} صنفاً عن الكاشير والمتجر وإيقاف التعامل معها في دريم سوفت مع إمكانية الاسترجاع لاحقاً. تأكيد؟`);
    }
    if (actionVal === 'restore') {
        return confirm(`إعادة تفعيل واسترجاع ${checked} صنفاً إلى الكاشير ودريم سوفت؟`);
    }
    return true;
}
</script>

<?php include 'footer.php'; ?>
