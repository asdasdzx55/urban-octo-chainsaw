<?php
require_once 'config.php';

if (!isAdmin()) {
    header('Location: login.php');
    exit;
}

// إنشاء الجدول إن لم يكن موجوداً
try {
    $pdo->exec("CREATE TABLE IF NOT EXISTS suppliers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        phone VARCHAR(50) DEFAULT NULL,
        balance DECIMAL(12, 2) DEFAULT 0.00,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
} catch (Exception $e) {}

$msg = '';
$err = '';

// إضافة مورد جديد
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['add_supplier'])) {
    $name = trim($_POST['name'] ?? '');
    $phone = trim($_POST['phone'] ?? '');
    $balance = (float)($_POST['balance'] ?? 0);

    if (!empty($name)) {
        $ins = $pdo->prepare("INSERT INTO suppliers (name, phone, balance) VALUES (?, ?, ?)");
        $ins->execute([$name, $phone, $balance]);
        $msg = 'تمت إضافة المورد بنجاح!';
    } else {
        $err = 'اسم المورد مطلوب!';
    }
}

// سداد دفعة للمورد
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['pay_supplier'])) {
    $sup_id = (int)($_POST['supplier_id'] ?? 0);
    $amount = (float)($_POST['amount'] ?? 0);
    if ($sup_id > 0 && $amount > 0) {
        $upd = $pdo->prepare("UPDATE suppliers SET balance = GREATEST(0, balance - ?) WHERE id = ?");
        $upd->execute([$amount, $sup_id]);
        $sup_name = $pdo->query("SELECT name FROM suppliers WHERE id = {$sup_id}")->fetchColumn() ?: 'مورد';
        $full_note = "[سداد مورد: {$sup_name}] سداد من لوحة إدارة الموردين";
        $stmt = $pdo->prepare("INSERT INTO expenses (category, amount, note, date, supplier_id, payment_method, synced) VALUES ('سداد موردين', ?, ?, NOW(), ?, 'كاش', 0)");
        $stmt->execute([$amount, $full_note, $sup_id]);
        $msg = "تم سداد مبلغ {$amount} ج.م للمورد ({$sup_name}) بنجاح!";
    }
}

// مقبوض من مورد (سند قبض)
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['receive_supplier'])) {
    $sup_id = (int)($_POST['supplier_id'] ?? 0);
    $amount = (float)($_POST['amount'] ?? 0);
    $note = trim($_POST['note'] ?? 'مقبوض من مورد عبر لوحة الإدارة');
    if ($sup_id > 0 && $amount > 0) {
        $sup_info = $pdo->query("SELECT name, supplier_code FROM suppliers WHERE id = {$sup_id}")->fetch(PDO::FETCH_ASSOC);
        $s_name = $sup_info['name'] ?? 'مورد عام';
        $s_code = $sup_info['supplier_code'] ?? null;
        
        $upd = $pdo->prepare("UPDATE suppliers SET balance = balance + ? WHERE id = ?");
        $upd->execute([$amount, $sup_id]);
        
        $ins = $pdo->prepare("INSERT INTO supplier_receipts (supplier_id, supplier_code, supplier_name, amount, payment_method, note, date, created_at, synced) VALUES (?, ?, ?, ?, 'كاش', ?, NOW(), NOW(), 0)");
        $ins->execute([$sup_id, $s_code, $s_name, $amount, $note]);
        $msg = "تم تسجيل مقبوض من المورد ({$s_name}) بمبلغ {$amount} ج.م بنجاح!";
    }
}

// جلب الموردين
$search = trim($_GET['search'] ?? '');
if (!empty($search)) {
    $stmt = $pdo->prepare("SELECT * FROM suppliers WHERE name LIKE ? OR phone LIKE ? ORDER BY name ASC");
    $stmt->execute(["%$search%", "%$search%"]);
} else {
    $stmt = $pdo->query("SELECT * FROM suppliers ORDER BY balance DESC, name ASC");
}
$suppliers = $stmt->fetchAll(PDO::FETCH_ASSOC);

$total_debt = $pdo->query("SELECT COALESCE(SUM(balance), 0) FROM suppliers")->fetchColumn() ?: 0;
$suppliers_count = count($suppliers);

include 'header.php';
include 'admin_nav.php';
?>

<div class="container mx-auto max-w-6xl px-4 py-8">
    <div class="flex flex-col md:flex-row justify-between items-center gap-4 mb-6 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <div>
            <h1 class="text-2xl font-black text-royal-charcoal flex items-center gap-2">
                <i class="fa-solid fa-handshake text-blue-600"></i> إدارة حسابات وديون الموردين
            </h1>
            <p class="text-gray-500 text-sm mt-1">مزامنة مركزية لحظية مع برنامج الكاشير المحلي وكافة الفواتير</p>
        </div>
        <div class="flex gap-4">
            <div class="bg-blue-50 border border-blue-100 rounded-xl p-3 text-center min-w-[120px]">
                <span class="text-xs text-blue-600 font-bold block">عدد الموردين</span>
                <span class="text-xl font-black text-blue-900"><?php echo $suppliers_count; ?></span>
            </div>
            <div class="bg-red-50 border border-red-100 rounded-xl p-3 text-center min-w-[140px]">
                <span class="text-xs text-red-600 font-bold block">إجمالي الديون للموردين</span>
                <span class="text-xl font-black text-red-700"><?php echo number_format($total_debt, 2); ?> ج.م</span>
            </div>
        </div>
    </div>

    <?php if ($msg): ?>
        <div class="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-xl mb-4 font-bold">
            <i class="fa-solid fa-circle-check"></i> <?php echo htmlspecialchars($msg); ?>
        </div>
    <?php endif; ?>

    <?php if ($err): ?>
        <div class="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-xl mb-4 font-bold">
            <i class="fa-solid fa-triangle-exclamation"></i> <?php echo htmlspecialchars($err); ?>
        </div>
    <?php endif; ?>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div class="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 h-fit">
            <h2 class="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                <i class="fa-solid fa-user-plus text-emerald-600"></i> إضافة مورد جديد
            </h2>
            <form method="POST" class="space-y-4">
                <div>
                    <label class="block text-xs font-bold text-gray-600 mb-1">اسم المورد / الشركة *</label>
                    <input type="text" name="name" required class="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500" placeholder="مثال: شركة المراعي">
                </div>
                <div>
                    <label class="block text-xs font-bold text-gray-600 mb-1">رقم الهاتف</label>
                    <input type="text" name="phone" class="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500" placeholder="01xxxxxxxxx">
                </div>
                <div>
                    <label class="block text-xs font-bold text-gray-600 mb-1">الرصيد الافتتاحي (مديونية حالية)</label>
                    <input type="number" step="0.01" name="balance" value="0" class="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500">
                </div>
                <button type="submit" name="add_supplier" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-xl shadow-md transition-all">
                    ➕ حفظ المورد
                </button>
            </form>
        </div>

        <div class="lg:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
            <div class="flex flex-col sm:flex-row justify-between items-center gap-3 mb-4">
                <h2 class="text-lg font-bold text-gray-800 flex items-center gap-2">
                    <i class="fa-solid fa-list-check text-blue-600"></i> قائمة الموردين والأرصدة
                </h2>
                <form method="GET" class="flex gap-2 w-full sm:w-auto">
                    <input type="text" name="search" value="<?php echo htmlspecialchars($search); ?>" placeholder="بحث باسم المورد..." class="border rounded-xl px-3 py-1.5 text-xs w-full sm:w-48">
                    <button type="submit" class="bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-xl text-xs font-bold">بحث</button>
                </form>
            </div>

            <div class="overflow-x-auto">
                <table class="w-full text-right text-xs">
                    <thead class="bg-gray-50 text-gray-500 font-bold border-b">
                        <tr>
                            <th class="py-3 px-3">#</th>
                            <th class="py-3 px-3">اسم المورد</th>
                            <th class="py-3 px-3">الهاتف</th>
                            <th class="py-3 px-3">الرصيد / المديونية</th>
                            <th class="py-3 px-3 text-center">سداد دفعة</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-100">
                        <?php if (empty($suppliers)): ?>
                            <tr><td colspan="5" class="text-center py-6 text-gray-400">لا يوجد موردين مسجلين بعد.</td></tr>
                        <?php else: ?>
                            <?php foreach ($suppliers as $s): ?>
                                <tr class="hover:bg-gray-50/80 transition-colors">
                                    <td class="py-3 px-3 font-bold text-gray-400"><?php echo $s['id']; ?></td>
                                    <td class="py-3 px-3 font-black text-gray-800"><?php echo htmlspecialchars($s['name']); ?></td>
                                    <td class="py-3 px-3 text-gray-500"><?php echo htmlspecialchars($s['phone'] ?: '-'); ?></td>
                                    <td class="py-3 px-3 font-black <?php echo $s['balance'] > 0 ? 'text-red-600' : 'text-emerald-600'; ?>">
                                        <?php echo number_format($s['balance'], 2); ?> ج.م
                                    </td>
                                    <td class="py-3 px-3 text-center">
                                        <form method="POST" class="inline-flex gap-1 items-center">
                                            <input type="hidden" name="supplier_id" value="<?php echo $s['id']; ?>">
                                            <input type="number" step="0.01" name="amount" placeholder="المبلغ" required class="w-20 border rounded-lg px-2 py-1 text-xs font-bold">
                                            <button type="submit" name="pay_supplier" class="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-2.5 py-1 rounded-lg text-xs" title="صرف وسداد دفعة للمورد">
                                                سداد
                                            </button>
                                            <button type="submit" name="receive_supplier" class="bg-sky-600 hover:bg-sky-700 text-white font-bold px-2.5 py-1 rounded-lg text-xs" title="قبض مبالغ من المورد وتوريدها للخزينة">
                                                قبض
                                            </button>
                                        </form>
                                    </td>
                                </tr>
                            <?php endforeach; ?>
                        <?php endif; ?>
                    </tbody>
                </table>
            </div>
        </div>
    </div>
</div>

<?php include 'footer.php'; ?>
