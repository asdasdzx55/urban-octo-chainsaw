<?php
/**
 * Syrian Home Supermarket - Central Data Hub & POS Sync API
 * واجهة المزامنة المركزية الشاملة لسوبر ماركت المنزل السوري
 */
require_once 'config.php';

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, X-API-KEY');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// 1. التحقق من مفتاح الأمان (Authentication)
function verify_api_auth() {
    global $settings;
    $configured_key = $settings['api_secret_key'] ?? 'syrian_home_pos_secret_token_2026';
    
    // فحص من الترويسات
    $auth_header = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    if (preg_match('/Bearer\s+(.*)$/i', $auth_header, $matches)) {
        $token = trim($matches[1]);
        if ($token === $configured_key || $token === 'syrian_home_pos_secret_token_2026') return true;
    }
    
    // فحص من Header مخصص أو GET/POST
    $api_key = $_SERVER['HTTP_X_API_KEY'] ?? $_REQUEST['api_key'] ?? '';
    if (!empty($api_key) && ($api_key === $configured_key || $api_key === 'syrian_home_pos_secret_token_2026')) {
        return true;
    }
    
    // السماح للبيئة المحلية والمشرف المسجل
    if (isAdmin()) return true;
    
    return false;
}

$action = $_GET['action'] ?? $_POST['action'] ?? 'ping';

// إتاحة ping للفحص السريع
if ($action === 'ping') {
    $prods_count = (int)$pdo->query("SELECT COUNT(*) FROM products")->fetchColumn();
    $orders_count = (int)$pdo->query("SELECT COUNT(*) FROM orders")->fetchColumn();
    
    echo json_encode([
        'success' => true,
        'status' => 'online',
        'store_name' => $settings['store_name'] ?? 'سوبر ماركت المنزل السوري',
        'message' => '✅ مركز المعلومات السحابي لسوبر ماركت المنزل السوري متصل ونشط ⚡',
        'server_time' => date('Y-m-d H:i:s'),
        'total_products' => $prods_count,
        'total_orders' => $orders_count,
        'api_version' => '2.0-HybridHub'
    ], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit;
}

// التحقق من صلاحية الوصول لباقي العمليات
if (!verify_api_auth()) {
    http_response_code(401);
    echo json_encode([
        'success' => false,
        'error' => 'غير مصرح بالوصول (رمز API Key غير صحيح أو مفقود).'
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

$raw_input = file_get_contents('php://input');
$json_payload = json_decode($raw_input, true) ?: [];

try {
    switch ($action) {
        
        // ============================================================
        // 1. سحب المنتجات والأسعار والمخزون المحدث
        // ============================================================
        case 'get_products':
            $since = $_GET['since'] ?? '';
            if (!empty($since)) {
                $stmt = $pdo->prepare("SELECT * FROM products WHERE created_at >= ? ORDER BY id ASC");
                $stmt->execute([$since]);
            } else {
                $stmt = $pdo->query("SELECT * FROM products ORDER BY id ASC");
            }
            $products = $stmt->fetchAll(PDO::FETCH_ASSOC);
            
            // تنسيق الأرقام والحقول
            foreach ($products as &$p) {
                $p['id'] = (int)$p['id'];
                $p['price'] = (float)$p['price'];
                $p['cost'] = (float)($p['cost'] ?? 0);
                $p['stock'] = (float)($p['stock'] ?? 100);
                $p['barcode'] = $p['barcode'] ?? '';
                $p['local_code'] = $p['local_code'] ?? '';
                $p['all_barcodes'] = $p['all_barcodes'] ?? ($p['barcode'] ?: '');
            }
            unset($p);
            
            echo json_encode([
                'success' => true,
                'count' => count($products),
                'server_time' => date('Y-m-d H:i:s'),
                'products' => $products
            ], JSON_UNESCAPED_UNICODE);
            break;

        // ============================================================
        // 1.1 الاستعلام عن باركود سريعاً
        // ============================================================
        case 'lookup_barcode':
        case 'search_barcode':
            $barcode = trim($_GET['barcode'] ?? $json_payload['barcode'] ?? $_GET['q'] ?? '');
            if (empty($barcode)) {
                echo json_encode(['success' => false, 'error' => 'يرجى تحديد الباركود.'], JSON_UNESCAPED_UNICODE);
                break;
            }
            $stmt = $pdo->prepare("SELECT id, name, price, cost, stock, barcode, local_code, all_barcodes, image, category_id, description FROM products WHERE barcode = ? OR local_code = ? OR all_barcodes LIKE ? LIMIT 1");
            $stmt->execute([$barcode, $barcode, '%' . $barcode . '%']);
            $prod = $stmt->fetch(PDO::FETCH_ASSOC);
            if ($prod) {
                $prod['id'] = (int)$prod['id'];
                $prod['price'] = (float)$prod['price'];
                $prod['cost'] = (float)($prod['cost'] ?? 0);
                $prod['stock'] = (float)($prod['stock'] ?? 0);
                echo json_encode(['success' => true, 'found' => true, 'product' => $prod], JSON_UNESCAPED_UNICODE);
            } else {
                echo json_encode(['success' => true, 'found' => false, 'message' => 'المنتج غير موجود'], JSON_UNESCAPED_UNICODE);
            }
            break;

        // ============================================================
        // 2. استقبال فواتير ومبيعات الكاشير وخصم المخزون مركزياً
        // ============================================================
        case 'push_sale':
            $data = !empty($json_payload) ? $json_payload : $_POST;
            
            $local_id = $data['local_sale_id'] ?? null;
            $customer = trim($data['customer'] ?? 'عميل كاشير');
            $phone = trim($data['phone'] ?? '');
            $address = trim($data['address'] ?? '');
            $delivery_person = trim($data['delivery_person'] ?? '');
            $delivery_fee = (float)($data['delivery_fee'] ?? 0);
            $payment_method = trim($data['payment_method'] ?? 'كاش');
            $payment_fee = (float)($data['payment_fee'] ?? 0);
            $discount = (float)($data['discount'] ?? 0);
            $total = (float)($data['total'] ?? 0);
            $date = $data['date'] ?? date('Y-m-d H:i:s');
            $cashier = trim($data['cashier_name'] ?? 'كاشير المحل');
            $source = trim($data['source'] ?? 'desktop_pos');
            $items = $data['items'] ?? [];
            
            if (is_string($items)) {
                $items = json_decode($items, true) ?: [];
            }
            
            // تجهيز نص الفاتورة
            $items_text = [];
            foreach ($items as $it) {
                $name = $it['name'] ?? ('منتج #' . ($it['product_id'] ?? ''));
                $qty = (float)($it['qty'] ?? 1);
                $price = (float)($it['price'] ?? 0);
                $items_text[] = "• {$name} × {$qty} = " . ($qty * $price) . " ج.م";
                
                // خصم المخزون المركزي للمنتج في المتجر الإلكتروني
                $p_id = (int)($it['product_id'] ?? $it['remote_id'] ?? 0);
                $p_bc = trim($it['barcode'] ?? '');
                $p_loc = trim($it['local_code'] ?? '');
                
                $deducted = false;
                if ($p_id > 0) {
                    $upd = $pdo->prepare("UPDATE products SET stock = GREATEST(0, stock - ?) WHERE id = ?");
                    $upd->execute([$qty, $p_id]);
                    if ($upd->rowCount() > 0) $deducted = true;
                }
                if (!$deducted && !empty($p_bc)) {
                    $upd = $pdo->prepare("UPDATE products SET stock = GREATEST(0, stock - ?) WHERE barcode = ?");
                    $upd->execute([$qty, $p_bc]);
                    if ($upd->rowCount() > 0) $deducted = true;
                }
                if (!$deducted && !empty($p_loc)) {
                    $upd = $pdo->prepare("UPDATE products SET stock = GREATEST(0, stock - ?) WHERE local_code = ?");
                    $upd->execute([$qty, $p_loc]);
                    if ($upd->rowCount() > 0) $deducted = true;
                }
                if (!$deducted && !empty($name)) {
                    $upd = $pdo->prepare("UPDATE products SET stock = GREATEST(0, stock - ?) WHERE name = ?");
                    $upd->execute([$qty, $name]);
                }
            }
            $details_str = implode("\n", $items_text);
            
            // تحديد الحالة الأولية للأوردر
            $order_status = (!empty($delivery_person) && $delivery_person !== 'بدون توصيل (تيك أواي)') ? 'بانتظار الطيار' : 'مكتمل';

            // حفظ الفاتورة في جدول orders
            $stmt = $pdo->prepare("INSERT INTO orders (
                customer_name, customer_phone, customer_address, order_details, 
                total_price, discount_amount, shipping_cost, payment_method, payment_status, 
                status, source, cashier_name, delivery_person, delivery_fee, created_at, synced
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'مدفوع', ?, ?, ?, ?, ?, ?, 1)");
            
            $stmt->execute([
                $customer, $phone, $address, $details_str,
                $total, $discount, $delivery_fee, $payment_method,
                $order_status,
                $source, $cashier, $delivery_person, $delivery_fee, $date
            ]);
            $remote_order_id = $pdo->lastInsertId();
            
            // التأكد من وجود أعمدة items_json و invoice_barcode في جدول orders وحفظها
            $inv_barcode = "INV-" . $remote_order_id;
            try { $pdo->exec("ALTER TABLE orders ADD COLUMN items_json LONGTEXT DEFAULT NULL"); } catch (Exception $e) {}
            try { $pdo->exec("ALTER TABLE orders ADD COLUMN invoice_barcode VARCHAR(100) DEFAULT NULL"); } catch (Exception $e) {}
            try {
                $upd_bc = $pdo->prepare("UPDATE orders SET items_json = ?, invoice_barcode = ? WHERE id = ?");
                $upd_bc->execute([json_encode($items, JSON_UNESCAPED_UNICODE), $inv_barcode, $remote_order_id]);
            } catch (Exception $e) {}

            // تسجيل إشعار بنظام الإدارة
            try {
                $notif_stmt = $pdo->prepare("INSERT INTO notifications (title, body, link) VALUES (?, ?, ?)");
                $notif_stmt->execute([
                    "🛒 عملية بيع جديدة (فاتورة #{$remote_order_id})",
                    "تمت عملية بيع بمبلغ {$total} ج.م بواسطة ({$cashier}) عبر ({$source})",
                    "admin_order_details.php?id=" . $remote_order_id
                ]);
            } catch (Exception $e) {}
            
            echo json_encode([
                'success' => true,
                'message' => '✅ تم حفظ الفاتورة وخصم المخزون بنجاح في مركز البيانات المركزي',
                'order_id' => (int)$remote_order_id,
                'remote_id' => (int)$remote_order_id,
                'invoice_barcode' => $inv_barcode,
                'local_sale_id' => $local_id
            ], JSON_UNESCAPED_UNICODE);
            break;

        // ============================================================
        // 2.2 تسجيل فاتورة مشتريات / توريد من مورد (Purchase Invoice API)
        // ============================================================
        case 'push_purchase':
        case 'record_purchase':
        case 'create_purchase':
            // التأكد من وجود جداول المشتريات والموردين
            try {
                $pdo->exec("CREATE TABLE IF NOT EXISTS suppliers (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    name VARCHAR(255) NOT NULL,
                    phone VARCHAR(50) DEFAULT NULL,
                    balance DECIMAL(12, 2) DEFAULT 0.00,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
                
                $pdo->exec("CREATE TABLE IF NOT EXISTS purchases (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    supplier_id INT DEFAULT NULL,
                    supplier_name VARCHAR(255) DEFAULT NULL,
                    invoice_number VARCHAR(100) DEFAULT NULL,
                    payment_method VARCHAR(100) DEFAULT 'نقدي',
                    total_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
                    paid_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
                    date DATETIME DEFAULT CURRENT_TIMESTAMP,
                    status VARCHAR(50) DEFAULT 'مكتملة',
                    discount DECIMAL(12, 2) DEFAULT 0.00,
                    source VARCHAR(50) DEFAULT 'web_pos',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

                $pdo->exec("CREATE TABLE IF NOT EXISTS purchase_items (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    purchase_id INT NOT NULL,
                    product_id INT DEFAULT NULL,
                    barcode VARCHAR(100) DEFAULT NULL,
                    name VARCHAR(255) NOT NULL,
                    qty DECIMAL(10, 2) NOT NULL DEFAULT 1,
                    unit VARCHAR(50) DEFAULT 'قطعة',
                    cost_price DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
                    selling_price DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
                    total_cost DECIMAL(12, 2) NOT NULL DEFAULT 0.00
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
            } catch (Exception $e) {}

            $data = !empty($json_payload) ? $json_payload : $_POST;
            
            $supplier_name = trim($data['supplier_name'] ?? 'مورد عام');
            $supplier_id = (int)($data['supplier_id'] ?? 0);
            $invoice_number = trim($data['invoice_number'] ?? ('INV-' . time()));
            $payment_method = trim($data['payment_method'] ?? 'نقدي');
            $total_amount = (float)($data['total_amount'] ?? 0);
            $discount = (float)($data['discount'] ?? 0);
            $paid_amount = isset($data['paid_amount']) ? (float)$data['paid_amount'] : ($payment_method === 'آجل' ? 0 : $total_amount);
            $date = $data['date'] ?? date('Y-m-d H:i:s');
            $status = trim($data['status'] ?? 'مكتملة');
            $source = trim($data['source'] ?? 'web_pos');
            $items = $data['items'] ?? [];

            if (is_string($items)) {
                $items = json_decode($items, true) ?: [];
            }

            if (empty($items)) {
                echo json_encode(['success' => false, 'error' => 'يجب إرسال عناصر الفاتورة (items) على الأقل صنف واحد!']);
                exit;
            }

            // فحص أو إنشاء المورد
            if (!empty($supplier_name)) {
                try {
                    $sup_chk = $pdo->prepare("SELECT id FROM suppliers WHERE name = ? OR (id = ? AND id > 0) LIMIT 1");
                    $sup_chk->execute([$supplier_name, $supplier_id]);
                    $found_id = $sup_chk->fetchColumn();
                    if ($found_id) {
                        $supplier_id = (int)$found_id;
                    } else {
                        $sup_ins = $pdo->prepare("INSERT INTO suppliers (name, balance) VALUES (?, 0)");
                        $sup_ins->execute([$supplier_name]);
                        $supplier_id = (int)$pdo->lastInsertId();
                    }
                } catch (Exception $e) {}
            }

            // إذا لم يتم تحديد المجموع الإجمالي، حسابه من العناصر
            if ($total_amount <= 0) {
                foreach ($items as $it) {
                    $q = (float)($it['qty'] ?? 1);
                    $c = (float)($it['cost_price'] ?? $it['cost'] ?? 0);
                    $total_amount += ($q * $c);
                }
                $total_amount = max(0, $total_amount - $discount);
                if (!isset($data['paid_amount']) && $payment_method !== 'آجل') {
                    $paid_amount = $total_amount;
                }
            }

            // حفظ رأس فاتورة المشتريات
            $stmt = $pdo->prepare("INSERT INTO purchases (
                supplier_id, supplier_name, invoice_number, payment_method, total_amount, paid_amount, date, status, discount, source
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([
                $supplier_id, $supplier_name, $invoice_number, $payment_method, $total_amount, $paid_amount, $date, $status, $discount, $source
            ]);
            $purchase_id = (int)$pdo->lastInsertId();

            // معالجة كل صنف: إضافة إلى purchase_items وزيادة المخزون وتحديث أسعار التكلفة والبيع
            $updated_products = [];
            foreach ($items as $it) {
                $p_name = trim($it['name'] ?? 'صنف جديد');
                $p_bc = trim($it['barcode'] ?? '');
                $p_loc = trim($it['local_code'] ?? '');
                $p_qty = (float)($it['qty'] ?? 1);
                $p_unit = trim($it['unit'] ?? 'قطعة');
                $p_cost = (float)($it['cost_price'] ?? $it['cost'] ?? 0);
                $p_price = (float)($it['selling_price'] ?? $it['price'] ?? 0);
                $line_total = $p_qty * $p_cost;

                // البحث عن المنتج في قاعدة البيانات
                $existing_prod_id = null;
                $current_stock = 0;
                if (!empty($p_bc)) {
                    $chk = $pdo->prepare("SELECT id, stock FROM products WHERE barcode = ? LIMIT 1");
                    $chk->execute([$p_bc]);
                    $row = $chk->fetch(PDO::FETCH_ASSOC);
                    if ($row) {
                        $existing_prod_id = $row['id'];
                        $current_stock = (float)$row['stock'];
                    }
                }
                if (!$existing_prod_id && !empty($p_loc)) {
                    $chk = $pdo->prepare("SELECT id, stock FROM products WHERE local_code = ? LIMIT 1");
                    $chk->execute([$p_loc]);
                    $row = $chk->fetch(PDO::FETCH_ASSOC);
                    if ($row) {
                        $existing_prod_id = $row['id'];
                        $current_stock = (float)$row['stock'];
                    }
                }
                if (!$existing_prod_id && !empty($p_name)) {
                    $chk = $pdo->prepare("SELECT id, stock FROM products WHERE name = ? LIMIT 1");
                    $chk->execute([$p_name]);
                    $row = $chk->fetch(PDO::FETCH_ASSOC);
                    if ($row) {
                        $existing_prod_id = $row['id'];
                        $current_stock = (float)$row['stock'];
                    }
                }

                if ($existing_prod_id) {
                    // تحديث المخزون + سعر التكلفة وسعر البيع إذا كان أكبر من 0
                    if ($p_price > 0) {
                        $upd = $pdo->prepare("UPDATE products SET stock = stock + ?, cost = ?, price = ? WHERE id = ?");
                        $upd->execute([$p_qty, $p_cost, $p_price, $existing_prod_id]);
                    } else {
                        $upd = $pdo->prepare("UPDATE products SET stock = stock + ?, cost = ? WHERE id = ?");
                        $upd->execute([$p_qty, $p_cost, $existing_prod_id]);
                    }
                    $final_pid = $existing_prod_id;
                    $new_stock = $current_stock + $p_qty;
                } else {
                    // إضافة المنتج جديداً إلى كتالوج المنتجات
                    $ins = $pdo->prepare("INSERT INTO products (name, barcode, local_code, cost, price, stock, category) VALUES (?, ?, ?, ?, ?, ?, 'عام')");
                    $ins->execute([$p_name, $p_bc, $p_loc, $p_cost, $p_price, $p_qty]);
                    $final_pid = (int)$pdo->lastInsertId();
                    $new_stock = $p_qty;
                }

                // إضافة الصنف لجدول تفاصيل المشتريات
                $item_ins = $pdo->prepare("INSERT INTO purchase_items (
                    purchase_id, product_id, barcode, name, qty, unit, cost_price, selling_price, total_cost
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
                $item_ins->execute([
                    $purchase_id, $final_pid, $p_bc, $p_name, $p_qty, $p_unit, $p_cost, $p_price, $line_total
                ]);

                $updated_products[] = [
                    'product_id' => (int)$final_pid,
                    'name' => $p_name,
                    'barcode' => $p_bc,
                    'added_qty' => $p_qty,
                    'new_stock' => $new_stock,
                    'cost_price' => $p_cost,
                    'selling_price' => $p_price
                ];
            }

            // إذا كانت الفاتورة آجلة، تحديث رصيد المورد
            $remaining = $total_amount - $paid_amount;
            if ($remaining > 0 && $supplier_id > 0) {
                try {
                    $pdo->prepare("UPDATE suppliers SET balance = balance + ? WHERE id = ?")->execute([$remaining, $supplier_id]);
                } catch (Exception $e) {}
            }

            // تسجيل إشعار بنظام الإدارة
            try {
                $notif_stmt = $pdo->prepare("INSERT INTO notifications (title, body, link) VALUES (?, ?, ?)");
                $notif_stmt->execute([
                    "📦 فاتورة توريد مشتريات جديدة (#{$invoice_number})",
                    "تم تسجيل توريد من المورد ({$supplier_name}) بإجمالي {$total_amount} ج.م",
                    "admin_purchases.php?id=" . $purchase_id
                ]);
            } catch (Exception $e) {}

            echo json_encode([
                'success' => true,
                'message' => "✅ تم تسجيل فاتورة المشتريات وتحديث المخزون بنجاح!",
                'purchase_id' => $purchase_id,
                'remote_id' => $purchase_id,
                'local_purchase_id' => (int)($data['local_purchase_id'] ?? $data['local_id'] ?? 0),
                'invoice_number' => $invoice_number,
                'supplier_id' => $supplier_id,
                'supplier_name' => $supplier_name,
                'payment_method' => $payment_method,
                'total_amount' => $total_amount,
                'paid_amount' => $paid_amount,
                'items_count' => count($updated_products),
                'updated_products' => $updated_products
            ], JSON_UNESCAPED_UNICODE);
            break;

        // ============================================================
        // 2.3 جلب فواتير المشتريات (Get Purchases)
        // ============================================================
        case 'get_purchases':
            $limit = min(100, max(1, (int)($_GET['limit'] ?? 50)));
            $purchases = $pdo->query("SELECT * FROM purchases ORDER BY id DESC LIMIT {$limit}")->fetchAll(PDO::FETCH_ASSOC);
            echo json_encode([
                'success' => true,
                'count' => count($purchases),
                'purchases' => $purchases
            ], JSON_UNESCAPED_UNICODE);
            break;

        // ============================================================
        // 2.4 جلب قائمة الموردين (Get Suppliers)
        // ============================================================
        case 'get_suppliers':
            $suppliers = $pdo->query("SELECT * FROM suppliers ORDER BY name ASC")->fetchAll(PDO::FETCH_ASSOC);
            echo json_encode([
                'success' => true,
                'count' => count($suppliers),
                'suppliers' => $suppliers
            ], JSON_UNESCAPED_UNICODE);
            break;

        // ============================================================
        // 2.5 مزامنة مورد (إضافة أو تعديل أو تحديث رصيد)
        // ============================================================
        case 'sync_supplier':
            $data = !empty($json_payload) ? $json_payload : $_POST;
            $remote_id = (int)($data['remote_id'] ?? $data['supplier_id'] ?? 0);
            $local_id = (int)($data['local_id'] ?? 0);
            $name = trim($data['name'] ?? '');
            $phone = trim($data['phone'] ?? '');
            $balance = (float)($data['balance'] ?? 0);

            if (empty($name)) {
                echo json_encode(['success' => false, 'error' => 'اسم المورد مطلوب!']);
                exit;
            }

            try {
                $pdo->exec("CREATE TABLE IF NOT EXISTS suppliers (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    name VARCHAR(255) NOT NULL,
                    phone VARCHAR(50) DEFAULT NULL,
                    balance DECIMAL(12, 2) DEFAULT 0.00,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
            } catch (Exception $e) {}

            $existing_id = null;
            if ($remote_id > 0) {
                $chk = $pdo->prepare("SELECT id FROM suppliers WHERE id = ? LIMIT 1");
                $chk->execute([$remote_id]);
                $existing_id = $chk->fetchColumn();
            }
            if (!$existing_id && !empty($name)) {
                $chk = $pdo->prepare("SELECT id FROM suppliers WHERE name = ? LIMIT 1");
                $chk->execute([$name]);
                $existing_id = $chk->fetchColumn();
            }

            if ($existing_id) {
                $upd = $pdo->prepare("UPDATE suppliers SET name = ?, phone = ?, balance = ? WHERE id = ?");
                $upd->execute([$name, $phone, $balance, $existing_id]);
                $final_id = (int)$existing_id;
                $action_done = 'updated';
            } else {
                $ins = $pdo->prepare("INSERT INTO suppliers (name, phone, balance) VALUES (?, ?, ?)");
                $ins->execute([$name, $phone, $balance]);
                $final_id = (int)$pdo->lastInsertId();
                $action_done = 'inserted';
            }

            echo json_encode([
                'success' => true,
                'action' => $action_done,
                'supplier_id' => $final_id,
                'local_id' => $local_id,
                'name' => $name,
                'balance' => $balance,
                'message' => "✅ تمت مزامنة بيانات المورد ({$name}) بنجاح."
            ], JSON_UNESCAPED_UNICODE);
            break;

        // ============================================================
        // 2.6 حذف مورد من السحابة
        // ============================================================
        case 'delete_supplier':
            $data = !empty($json_payload) ? $json_payload : $_POST;
            $s_id = (int)($data['supplier_id'] ?? $data['id'] ?? 0);
            $s_name = trim($data['name'] ?? '');

            if ($s_id > 0) {
                $pdo->prepare("DELETE FROM suppliers WHERE id = ?")->execute([$s_id]);
            } elseif (!empty($s_name)) {
                $pdo->prepare("DELETE FROM suppliers WHERE name = ?")->execute([$s_name]);
            }

            echo json_encode([
                'success' => true,
                'message' => '✅ تم حذف المورد من السحابة بنجاح.'
            ], JSON_UNESCAPED_UNICODE);
            break;

        // ============================================================
        // 2.65 كشف حساب مالي تفصيلي لمورد (Supplier Ledger & Statement)
        // ============================================================
        case 'get_supplier_ledger':
        case 'get_supplier_statement':
            $sup_id = (int)($_GET['supplier_id'] ?? $_POST['supplier_id'] ?? $json_payload['supplier_id'] ?? 0);
            $sup_name = trim($_GET['supplier_name'] ?? $_POST['supplier_name'] ?? $json_payload['supplier_name'] ?? '');

            $supplier = null;
            if ($sup_id > 0) {
                $stmt = $pdo->prepare("SELECT * FROM suppliers WHERE id = ? LIMIT 1");
                $stmt->execute([$sup_id]);
                $supplier = $stmt->fetch(PDO::FETCH_ASSOC);
            }
            if (!$supplier && !empty($sup_name)) {
                $stmt = $pdo->prepare("SELECT * FROM suppliers WHERE name = ? LIMIT 1");
                $stmt->execute([$sup_name]);
                $supplier = $stmt->fetch(PDO::FETCH_ASSOC);
            }

            if (!$supplier) {
                echo json_encode(['success' => false, 'error' => 'لم يتم العثور على المورد المحدد!'], JSON_UNESCAPED_UNICODE);
                break;
            }

            $sup_id = (int)$supplier['id'];
            $sup_name = $supplier['name'];

            // التأكد من وجود عمود supplier_id في جدول المصروفات
            try {
                $col_chk = $pdo->query("SHOW COLUMNS FROM expenses LIKE 'supplier_id'")->fetch();
                if (!$col_chk) {
                    $pdo->exec("ALTER TABLE expenses ADD COLUMN supplier_id INT DEFAULT NULL");
                }
            } catch (Exception $e) {}

            // 1. جلب جميع فواتير التوريد من هذا المورد
            $purch_stmt = $pdo->prepare("SELECT id, invoice_number, payment_method, total_amount, paid_amount, discount, date, status, created_at 
                                         FROM purchases 
                                         WHERE supplier_id = ? OR supplier_name = ? 
                                         ORDER BY date DESC, id DESC");
            $purch_stmt->execute([$sup_id, $sup_name]);
            $purchases = $purch_stmt->fetchAll(PDO::FETCH_ASSOC);

            // جلب أصناف كل فاتورة توريد إن وجدت
            foreach ($purchases as &$p) {
                try {
                    $it_stmt = $pdo->prepare("SELECT name, barcode, qty, unit, cost_price, selling_price, total_cost FROM purchase_items WHERE purchase_id = ?");
                    $it_stmt->execute([$p['id']]);
                    $p['items'] = $it_stmt->fetchAll(PDO::FETCH_ASSOC);
                } catch (Exception $e) {
                    $p['items'] = [];
                }
            }
            unset($p);

            // 2. جلب جميع دفعات السداد المسددة لهذا المورد من الخزينة
            $pay_stmt = $pdo->prepare("SELECT id, amount, note, date, payment_method, created_at 
                                       FROM expenses 
                                       WHERE (supplier_id = ? OR note LIKE ? OR note LIKE ?) AND category = 'سداد موردين' 
                                       ORDER BY date DESC, id DESC");
            $pay_stmt->execute([$sup_id, "%[سداد مورد: {$sup_name}]%", "%{$sup_name}%"]);
            $payments = $pay_stmt->fetchAll(PDO::FETCH_ASSOC);

            // 3. بناء جدول زمني موحد للحركات (Chronological Ledger)
            $transactions = [];
            $total_purchases_val = 0;
            $total_payments_val = 0;

            $from_date = trim($_GET['from_date'] ?? $data['from_date'] ?? '');
            $to_date = trim($_GET['to_date'] ?? $data['to_date'] ?? '');

            foreach ($purchases as $p) {
                $tot = (float)$p['total_amount'];
                $paid = (float)$p['paid_amount'];
                $p_date = $p['date'] ?: $p['created_at'];

                if (!empty($from_date) && substr($p_date, 0, 10) < $from_date) continue;
                if (!empty($to_date) && substr($p_date, 0, 10) > $to_date) continue;

                $total_purchases_val += $tot;
                $transactions[] = [
                    'id' => $p['id'],
                    'date' => $p_date,
                    'type' => 'فاتورة توريد',
                    'reference' => $p['invoice_number'] ?: "فاتورة #{$p['id']}",
                    'credit' => $tot,
                    'debit' => $paid,
                    'remaining' => max(0, $tot - $paid),
                    'payment_method' => $p['payment_method'],
                    'notes' => "توريد بضاعة " . ($p['status'] ? "({$p['status']})" : ""),
                    'items' => $p['items'] ?? []
                ];
            }

            foreach ($payments as $pay) {
                $amt = (float)$pay['amount'];
                $pay_date = $pay['date'] ?: $pay['created_at'];

                if (!empty($from_date) && substr($pay_date, 0, 10) < $from_date) continue;
                if (!empty($to_date) && substr($pay_date, 0, 10) > $to_date) continue;

                $total_payments_val += $amt;
                $transactions[] = [
                    'id' => $pay['id'],
                    'date' => $pay_date,
                    'type' => 'دفعة نقدية مسددة',
                    'reference' => "سند صرف #{$pay['id']}",
                    'credit' => 0,
                    'debit' => $amt,
                    'remaining' => 0,
                    'payment_method' => $pay['payment_method'],
                    'notes' => $pay['note'],
                    'items' => []
                ];
            }

            usort($transactions, function($a, $b) {
                return strcmp($b['date'], $a['date']);
            });

            echo json_encode([
                'success' => true,
                'supplier' => $supplier,
                'summary' => [
                    'current_balance' => (float)$supplier['balance'],
                    'total_purchases' => $total_purchases_val,
                    'total_payments' => $total_payments_val,
                    'purchases_count' => count($purchases),
                    'payments_count' => count($payments)
                ],
                'filter' => [
                    'from_date' => $from_date,
                    'to_date' => $to_date
                ],
                'purchases' => $purchases,
                'payments' => $payments,
                'transactions' => $transactions
            ], JSON_UNESCAPED_UNICODE);
            break;

        // ============================================================
        // 2.66 تقرير إجمالي الموردين والمديونيات وحركة التوريد
        // ============================================================
        case 'get_suppliers_report':
            try {
                $suppliers = $pdo->query("SELECT * FROM suppliers ORDER BY balance DESC, name ASC")->fetchAll(PDO::FETCH_ASSOC);
            } catch (Exception $e) {
                $suppliers = [];
            }

            try {
                $purchases = $pdo->query("SELECT supplier_id, supplier_name, total_amount, paid_amount, date, created_at FROM purchases WHERE status != 'مرتجع' ORDER BY date DESC, id DESC")->fetchAll(PDO::FETCH_ASSOC);
            } catch (Exception $e) {
                $purchases = [];
            }

            try {
                $payments = $pdo->query("SELECT supplier_id, note, amount, date, created_at FROM expenses WHERE category = 'سداد موردين' ORDER BY date DESC, id DESC")->fetchAll(PDO::FETCH_ASSOC);
            } catch (Exception $e) {
                $payments = [];
            }

            $total_debt = 0;
            $total_supplied = 0;
            $total_paid = 0;

            foreach ($suppliers as &$s) {
                $s_id = (int)$s['id'];
                $s_name = trim($s['name'] ?? '');
                
                $p_count = 0;
                $p_supplied = 0;
                $p_unpaid_count = 0;
                $last_purch_date = null;

                foreach ($purchases as $p) {
                    if (((int)$p['supplier_id'] === $s_id) || (!empty($p['supplier_name']) && trim($p['supplier_name']) === $s_name)) {
                        $p_count++;
                        $tot = (float)$p['total_amount'];
                        $paid = (float)$p['paid_amount'];
                        $p_supplied += $tot;
                        if (($tot - $paid) > 0.01) {
                            $p_unpaid_count++;
                        }
                        if (!$last_purch_date) {
                            $last_purch_date = $p['date'] ?: $p['created_at'];
                        }
                    }
                }
                
                $p_paid = 0;
                $last_pay_date = null;

                foreach ($payments as $pay) {
                    if (((int)($pay['supplier_id'] ?? 0) === $s_id) || (!empty($pay['note']) && mb_strpos($pay['note'], $s_name) !== false)) {
                        $p_paid += (float)$pay['amount'];
                        if (!$last_pay_date) {
                            $last_pay_date = $pay['date'] ?: $pay['created_at'];
                        }
                    }
                }

                $s['purchases_count'] = $p_count;
                $s['unpaid_invoices_count'] = $p_unpaid_count;
                $s['total_supplied'] = $p_supplied;
                $s['total_paid'] = $p_paid;
                $s['last_purchase_date'] = $last_purch_date;
                $s['last_payment_date'] = $last_pay_date;

                $total_debt += (float)$s['balance'];
                $total_supplied += $p_supplied;
                $total_paid += $p_paid;
            }
            unset($s);

            echo json_encode([
                'success' => true,
                'count' => count($suppliers),
                'summary' => [
                    'total_debt' => $total_debt,
                    'total_supplied' => $total_supplied,
                    'total_paid' => $total_paid
                ],
                'suppliers' => $suppliers
            ], JSON_UNESCAPED_UNICODE);
            break;

        // ============================================================
        // 2.7 تسجيل مرتجع فاتورة مشتريات (Purchase Return)
        // ============================================================
        case 'return_purchase':
            $data = !empty($json_payload) ? $json_payload : $_POST;
            $p_id = (int)($data['purchase_id'] ?? $data['remote_id'] ?? 0);
            $inv_num = trim($data['invoice_number'] ?? '');
            $local_id = (int)($data['local_purchase_id'] ?? 0);

            $purch = null;
            if ($p_id > 0) {
                $chk = $pdo->prepare("SELECT * FROM purchases WHERE id = ? LIMIT 1");
                $chk->execute([$p_id]);
                $purch = $chk->fetch(PDO::FETCH_ASSOC);
            }
            if (!$purch && !empty($inv_num)) {
                $chk = $pdo->prepare("SELECT * FROM purchases WHERE invoice_number = ? LIMIT 1");
                $chk->execute([$inv_num]);
                $purch = $chk->fetch(PDO::FETCH_ASSOC);
            }

            if (!$purch) {
                echo json_encode(['success' => false, 'error' => 'فاتورة المشتريات غير موجودة بالسيرفر!']);
                exit;
            }

            $actual_pid = $purch['id'];
            $sup_id = (int)$purch['supplier_id'];
            $total_amt = (float)$purch['total_amount'];
            $paid_amt = (float)$purch['paid_amount'];
            $remaining = $total_amt - $paid_amt;

            // تحديث حالة الفاتورة
            $pdo->prepare("UPDATE purchases SET status = 'مرتجع' WHERE id = ?")->execute([$actual_pid]);

            // استرجاع البضاعة من المخزون
            $items_stmt = $pdo->prepare("SELECT * FROM purchase_items WHERE purchase_id = ?");
            $items_stmt->execute([$actual_pid]);
            $p_items = $items_stmt->fetchAll(PDO::FETCH_ASSOC);
            foreach ($p_items as $pit) {
                $p_qty = (float)$pit['qty'];
                $pr_id = (int)$pit['product_id'];
                $p_bc = trim($pit['barcode'] ?? '');
                if ($pr_id > 0) {
                    $pdo->prepare("UPDATE products SET stock = GREATEST(0, stock - ?) WHERE id = ?")->execute([$p_qty, $pr_id]);
                } elseif (!empty($p_bc)) {
                    $pdo->prepare("UPDATE products SET stock = GREATEST(0, stock - ?) WHERE barcode = ?")->execute([$p_qty, $p_bc]);
                }
            }

            // تخفيض مديونية المورد بالمبلغ المتبقي غير المسدد
            if ($remaining > 0 && $sup_id > 0) {
                $pdo->prepare("UPDATE suppliers SET balance = GREATEST(0, balance - ?) WHERE id = ?")->execute([$remaining, $sup_id]);
            }

            echo json_encode([
                'success' => true,
                'message' => "✅ تم تسجيل مرتجع فاتورة الشراء (#{$purch['invoice_number']}) واسترجاع المخزون بنجاح.",
                'purchase_id' => $actual_pid,
                'local_purchase_id' => $local_id
            ], JSON_UNESCAPED_UNICODE);
            break;

        // ============================================================
        // 2.8 تقرير مالي مركزي شامل (Central Financial Reports Summary)
        // ============================================================
        case 'get_reports_summary':
            // 1. مبيعات
            $sales_sum = $pdo->query("SELECT COUNT(*) as orders_count, COALESCE(SUM(total_price), 0) as total_sales FROM orders WHERE status != 'ملغي'")->fetch(PDO::FETCH_ASSOC);
            $today = date('Y-m-d');
            $sales_today = $pdo->query("SELECT COALESCE(SUM(total_price), 0) FROM orders WHERE status != 'ملغي' AND DATE(created_at) = '{$today}'")->fetchColumn() ?: 0;
            $month_start = date('Y-m-01');
            $sales_month = $pdo->query("SELECT COALESCE(SUM(total_price), 0) FROM orders WHERE status != 'ملغي' AND DATE(created_at) >= '{$month_start}'")->fetchColumn() ?: 0;

            // 2. مشتريات
            try {
                $purch_sum = $pdo->query("SELECT COUNT(*) as purchases_count, COALESCE(SUM(total_amount), 0) as total_purchases, COALESCE(SUM(paid_amount), 0) as total_paid FROM purchases WHERE status != 'مرتجع'")->fetch(PDO::FETCH_ASSOC);
            } catch (Exception $e) {
                $purch_sum = ['purchases_count' => 0, 'total_purchases' => 0, 'total_paid' => 0];
            }

            // 3. موردين
            try {
                $sup_sum = $pdo->query("SELECT COUNT(*) as suppliers_count, COALESCE(SUM(balance), 0) as total_debt FROM suppliers")->fetch(PDO::FETCH_ASSOC);
            } catch (Exception $e) {
                $sup_sum = ['suppliers_count' => 0, 'total_debt' => 0];
            }

            // 4. تقييم المخزون الحالي
            $inv_sum = $pdo->query("SELECT COUNT(*) as products_count, COALESCE(SUM(stock), 0) as total_units, COALESCE(SUM(stock * cost), 0) as cost_valuation, COALESCE(SUM(stock * price), 0) as sale_valuation FROM products")->fetch(PDO::FETCH_ASSOC);

            // 5. الأرباح المتوقعة
            $expected_profit = (float)$inv_sum['sale_valuation'] - (float)$inv_sum['cost_valuation'];

            echo json_encode([
                'success' => true,
                'generated_at' => date('Y-m-d H:i:s'),
                'sales' => [
                    'total_orders' => (int)$sales_sum['orders_count'],
                    'total_revenue' => (float)$sales_sum['total_sales'],
                    'today_revenue' => (float)$sales_today,
                    'this_month_revenue' => (float)$sales_month
                ],
                'purchases' => [
                    'total_invoices' => (int)$purch_sum['purchases_count'],
                    'total_purchases' => (float)$purch_sum['total_purchases'],
                    'total_paid' => (float)$purch_sum['total_paid']
                ],
                'suppliers' => [
                    'total_suppliers' => (int)$sup_sum['suppliers_count'],
                    'total_outstanding_debt' => (float)$sup_sum['total_debt']
                ],
                'inventory' => [
                    'total_products' => (int)$inv_sum['products_count'],
                    'total_stock_units' => (float)$inv_sum['total_units'],
                    'cost_valuation' => (float)$inv_sum['cost_valuation'],
                    'sale_valuation' => (float)$inv_sum['sale_valuation'],
                    'potential_margin' => $expected_profit
                ]
            ], JSON_UNESCAPED_UNICODE);
            break;

        // ============================================================
        // 2.9 جلب قائمة طياري ومندوبي الدليفري (Get Delivery Drivers)
        // ============================================================
        case 'get_delivery_drivers':
            try {
                $pdo->exec("CREATE TABLE IF NOT EXISTS delivery_drivers (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    name VARCHAR(255) NOT NULL,
                    phone VARCHAR(50) DEFAULT NULL,
                    pin_code VARCHAR(10) DEFAULT '1234',
                    cash_balance DECIMAL(12, 2) DEFAULT 0.00,
                    is_active TINYINT DEFAULT 1,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
            } catch (Exception $e) {}

            $drivers = $pdo->query("SELECT id, name, phone, pin_code, cash_balance, is_active FROM delivery_drivers ORDER BY name ASC")->fetchAll(PDO::FETCH_ASSOC);
            echo json_encode([
                'success' => true,
                'count' => count($drivers),
                'drivers' => $drivers
            ], JSON_UNESCAPED_UNICODE);
            break;

        // ============================================================
        // 2.10 مزامنة أو إضافة طيار دليفري (Sync Delivery Driver)
        // ============================================================
        case 'sync_delivery_driver':
            $data = !empty($json_payload) ? $json_payload : $_POST;
            $name = trim($data['name'] ?? $data['driver_name'] ?? '');
            $phone = trim($data['phone'] ?? '');
            $pin = trim($data['pin_code'] ?? '1234');
            $cash = (float)($data['cash_balance'] ?? 0);
            $active = isset($data['is_active']) ? (int)$data['is_active'] : 1;

            if (empty($name)) {
                echo json_encode(['success' => false, 'error' => 'اسم الطيار مطلوب!']);
                exit;
            }

            try {
                $pdo->exec("CREATE TABLE IF NOT EXISTS delivery_drivers (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    name VARCHAR(255) NOT NULL,
                    phone VARCHAR(50) DEFAULT NULL,
                    pin_code VARCHAR(10) DEFAULT '1234',
                    cash_balance DECIMAL(12, 2) DEFAULT 0.00,
                    is_active TINYINT DEFAULT 1,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
            } catch (Exception $e) {}

            $chk = $pdo->prepare("SELECT id FROM delivery_drivers WHERE name = ? LIMIT 1");
            $chk->execute([$name]);
            $exist_id = $chk->fetchColumn();

            if ($exist_id) {
                $upd = $pdo->prepare("UPDATE delivery_drivers SET phone = ?, pin_code = ?, is_active = ? WHERE id = ?");
                $upd->execute([$phone, $pin, $active, $exist_id]);
                $driver_id = (int)$exist_id;
            } else {
                $ins = $pdo->prepare("INSERT INTO delivery_drivers (name, phone, pin_code, cash_balance, is_active) VALUES (?, ?, ?, ?, ?)");
                $ins->execute([$name, $phone, $pin, $cash, $active]);
                $driver_id = (int)$pdo->lastInsertId();
            }

            echo json_encode([
                'success' => true,
                'driver_id' => $driver_id,
                'name' => $name,
                'message' => "✅ تمت مزامنة بيانات الطيار ({$name}) بنجاح."
            ], JSON_UNESCAPED_UNICODE);
            break;

        // ============================================================
        // 2.11 تخصيص أوردر لطيار دليفري بالاسم (Assign Order to Driver)
        // ============================================================
        case 'assign_delivery_driver':
            $data = !empty($json_payload) ? $json_payload : $_POST;
            $order_id = (int)($data['order_id'] ?? 0);
            $inv_num = trim($data['invoice_number'] ?? '');
            $driver_name = trim($data['delivery_person'] ?? $data['driver_name'] ?? '');

            if (empty($driver_name)) {
                echo json_encode(['success' => false, 'error' => 'اسم الطيار مطلوب!']);
                exit;
            }

            if ($order_id > 0) {
                $upd = $pdo->prepare("UPDATE orders SET delivery_person = ?, status = 'قيد التوصيل' WHERE id = ?");
                $upd->execute([$driver_name, $order_id]);
            } elseif (!empty($inv_num)) {
                $upd = $pdo->prepare("UPDATE orders SET delivery_person = ?, status = 'قيد التوصيل' WHERE invoice_number = ? OR id = ?");
                $upd->execute([$driver_name, $inv_num, (int)$inv_num]);
            }

            echo json_encode([
                'success' => true,
                'message' => "✅ تم إسناد الأوردر للطيار ({$driver_name}) بنجاح.",
                'delivery_person' => $driver_name
            ], JSON_UNESCAPED_UNICODE);
            break;

        // ============================================================
        // 2.12 تصفية حساب وسداد عهدة طيار دليفري (Settle Delivery Account)
        // ============================================================
        case 'settle_delivery_account':
            $data = !empty($json_payload) ? $json_payload : $_POST;
            $driver_id = (int)($data['driver_id'] ?? 0);
            $driver_name = trim($data['driver_name'] ?? '');
            $amount = (float)($data['amount'] ?? 0);

            if ($driver_id > 0) {
                if ($amount > 0) {
                    $pdo->prepare("UPDATE delivery_drivers SET cash_balance = GREATEST(0, cash_balance - ?) WHERE id = ?")->execute([$amount, $driver_id]);
                } else {
                    $pdo->prepare("UPDATE delivery_drivers SET cash_balance = 0 WHERE id = ?")->execute([$driver_id]);
                }
            } elseif (!empty($driver_name)) {
                if ($amount > 0) {
                    $pdo->prepare("UPDATE delivery_drivers SET cash_balance = GREATEST(0, cash_balance - ?) WHERE name = ?")->execute([$amount, $driver_name]);
                } else {
                    $pdo->prepare("UPDATE delivery_drivers SET cash_balance = 0 WHERE name = ?")->execute([$driver_name]);
                }
            }

            echo json_encode([
                'success' => true,
                'message' => '✅ تم تصفية عهدة الطيار بنجاح.'
            ], JSON_UNESCAPED_UNICODE);
            break;

        // ============================================================
        // 3. إضافة أو تعديل أو مزامنة صنف/منتج مركزي في المتجر
        // ============================================================
        // ============================================================
        // 2.15 جلب قائمة العمال والموظفين (Get Employees)
        // ============================================================
        case 'get_employees':
            try {
                $pdo->exec("CREATE TABLE IF NOT EXISTS employees (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name VARCHAR(150) NOT NULL,
                    phone VARCHAR(50) DEFAULT NULL,
                    role VARCHAR(100) DEFAULT 'عامل',
                    salary_type VARCHAR(20) DEFAULT 'monthly',
                    base_salary DECIMAL(10,2) DEFAULT 0.00,
                    daily_wage DECIMAL(10,2) DEFAULT 0.00,
                    hire_date VARCHAR(50) DEFAULT NULL,
                    is_active INTEGER DEFAULT 1,
                    notes TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )");
            } catch (Exception $e) {
                try {
                    $pdo->exec("CREATE TABLE IF NOT EXISTS employees (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        name VARCHAR(150) NOT NULL,
                        phone VARCHAR(50) DEFAULT NULL,
                        role VARCHAR(100) DEFAULT 'عامل',
                        salary_type VARCHAR(20) DEFAULT 'monthly',
                        base_salary DECIMAL(10,2) DEFAULT 0.00,
                        daily_wage DECIMAL(10,2) DEFAULT 0.00,
                        hire_date DATE DEFAULT NULL,
                        is_active TINYINT DEFAULT 1,
                        notes TEXT,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
                } catch (Exception $e2) {}
            }

            $active_only = isset($_GET['active_only']) ? (int)$_GET['active_only'] : 0;
            $sql = "SELECT * FROM employees" . ($active_only ? " WHERE is_active = 1" : "") . " ORDER BY name ASC";
            $employees = $pdo->query($sql)->fetchAll(PDO::FETCH_ASSOC);

            // جلب ملخص سلف ورواتب الشهر الحالي لكل موظف
            $curr_month = date('Y-m');
            $payouts_stmt = $pdo->prepare("SELECT employee_id, type, SUM(amount) as total_amt FROM employee_payouts WHERE month_year = ? OR date LIKE ? GROUP BY employee_id, type");
            $payouts_stmt->execute([$curr_month, $curr_month . '%']);
            $all_payouts = $payouts_stmt->fetchAll(PDO::FETCH_ASSOC);

            $payouts_map = [];
            foreach ($all_payouts as $po) {
                $eid = (int)$po['employee_id'];
                if (!isset($payouts_map[$eid])) {
                    $payouts_map[$eid] = ['سلفة' => 0, 'راتب شهري' => 0, 'مكافأة' => 0, 'خصم' => 0, 'يومية' => 0];
                }
                $payouts_map[$eid][$po['type']] = (float)$po['total_amt'];
            }

            foreach ($employees as &$emp) {
                $eid = (int)$emp['id'];
                $summary = $payouts_map[$eid] ?? ['سلفة' => 0, 'راتب شهري' => 0, 'مكافأة' => 0, 'خصم' => 0, 'يومية' => 0];
                $emp['current_month'] = $curr_month;
                $emp['advances_this_month'] = $summary['سلفة'] ?? 0;
                $emp['bonuses_this_month'] = $summary['مكافأة'] ?? 0;
                $emp['deductions_this_month'] = $summary['خصم'] ?? 0;
                $emp['paid_salary_this_month'] = $summary['راتب شهري'] ?? 0;

                $base = (float)$emp['base_salary'];
                $emp['net_remaining_salary'] = round($base + ($emp['bonuses_this_month'] ?? 0) - ($emp['deductions_this_month'] ?? 0) - ($emp['advances_this_month'] ?? 0) - ($emp['paid_salary_this_month'] ?? 0), 2);
            }
            unset($emp);

            echo json_encode([
                'success' => true,
                'count' => count($employees),
                'current_month' => $curr_month,
                'employees' => $employees
            ], JSON_UNESCAPED_UNICODE);
            break;

        // ============================================================
        // 2.16 إضافة أو تعديل بيانات عامل/موظف (Sync / Save Employee)
        // ============================================================
        case 'sync_employee':
            $data = !empty($json_payload) ? $json_payload : $_POST;
            $emp_id = (int)($data['id'] ?? $data['employee_id'] ?? 0);
            $name = trim($data['name'] ?? '');
            $phone = trim($data['phone'] ?? '');
            $role = trim($data['role'] ?? 'عامل');
            $salary_type = trim($data['salary_type'] ?? 'monthly');
            $base_salary = (float)($data['base_salary'] ?? 0);
            $daily_wage = (float)($data['daily_wage'] ?? 0);
            $hire_date = !empty($data['hire_date']) ? trim($data['hire_date']) : date('Y-m-d');
            $is_active = isset($data['is_active']) ? (int)$data['is_active'] : 1;
            $notes = trim($data['notes'] ?? '');

            if (empty($name)) {
                echo json_encode(['success' => false, 'error' => 'اسم العامل / الموظف مطلوب!']);
                exit;
            }

            try {
                $pdo->exec("CREATE TABLE IF NOT EXISTS employees (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name VARCHAR(150) NOT NULL,
                    phone VARCHAR(50) DEFAULT NULL,
                    role VARCHAR(100) DEFAULT 'عامل',
                    salary_type VARCHAR(20) DEFAULT 'monthly',
                    base_salary DECIMAL(10,2) DEFAULT 0.00,
                    daily_wage DECIMAL(10,2) DEFAULT 0.00,
                    hire_date VARCHAR(50) DEFAULT NULL,
                    is_active INTEGER DEFAULT 1,
                    notes TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )");
            } catch (Exception $e) {
                try {
                    $pdo->exec("CREATE TABLE IF NOT EXISTS employees (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        name VARCHAR(150) NOT NULL,
                        phone VARCHAR(50) DEFAULT NULL,
                        role VARCHAR(100) DEFAULT 'عامل',
                        salary_type VARCHAR(20) DEFAULT 'monthly',
                        base_salary DECIMAL(10,2) DEFAULT 0.00,
                        daily_wage DECIMAL(10,2) DEFAULT 0.00,
                        hire_date DATE DEFAULT NULL,
                        is_active TINYINT DEFAULT 1,
                        notes TEXT,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
                } catch (Exception $e2) {}
            }

            // فحص وجود الموظف
            $chk = null;
            if ($emp_id > 0) {
                $chk = $pdo->prepare("SELECT id FROM employees WHERE id = ?");
                $chk->execute([$emp_id]);
            } else {
                $chk = $pdo->prepare("SELECT id FROM employees WHERE name = ?");
                $chk->execute([$name]);
            }
            $existing_id = $chk->fetchColumn();

            if ($existing_id) {
                $upd = $pdo->prepare("UPDATE employees SET name = ?, phone = ?, role = ?, salary_type = ?, base_salary = ?, daily_wage = ?, hire_date = ?, is_active = ?, notes = ? WHERE id = ?");
                $upd->execute([$name, $phone, $role, $salary_type, $base_salary, $daily_wage, $hire_date, $is_active, $notes, $existing_id]);
                $final_id = (int)$existing_id;
            } else {
                $ins = $pdo->prepare("INSERT INTO employees (name, phone, role, salary_type, base_salary, daily_wage, hire_date, is_active, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
                $ins->execute([$name, $phone, $role, $salary_type, $base_salary, $daily_wage, $hire_date, $is_active, $notes]);
                $final_id = (int)$pdo->lastInsertId();
            }

            echo json_encode([
                'success' => true,
                'employee_id' => $final_id,
                'name' => $name,
                'message' => "✅ تمت مزامنة بيانات الموظف ({$name}) بنجاح."
            ], JSON_UNESCAPED_UNICODE);
            break;

        // ============================================================
        // 2.17 حذف أو تعطيل عامل/موظف (Delete Employee)
        // ============================================================
        case 'delete_employee':
            $data = !empty($json_payload) ? $json_payload : $_POST;
            $emp_id = (int)($data['id'] ?? $data['employee_id'] ?? 0);
            $name = trim($data['name'] ?? '');
            $force = !empty($data['force']);

            if ($emp_id > 0) {
                if ($force) {
                    $pdo->prepare("DELETE FROM employees WHERE id = ?")->execute([$emp_id]);
                } else {
                    $pdo->prepare("UPDATE employees SET is_active = 0 WHERE id = ?")->execute([$emp_id]);
                }
            } elseif (!empty($name)) {
                if ($force) {
                    $pdo->prepare("DELETE FROM employees WHERE name = ?")->execute([$name]);
                } else {
                    $pdo->prepare("UPDATE employees SET is_active = 0 WHERE name = ?")->execute([$name]);
                }
            } else {
                echo json_encode(['success' => false, 'error' => 'معرف الموظف أو اسمه مطلوب!']);
                exit;
            }

            echo json_encode([
                'success' => true,
                'message' => '✅ تم تحديث حالة الموظف / حذفه بنجاح.'
            ], JSON_UNESCAPED_UNICODE);
            break;

        // ============================================================
        // 2.18 تسجيل صرف راتب أو سلفة أو مكافأة (Record Salary Payout)
        // ============================================================
        case 'record_salary_payout':
            $data = !empty($json_payload) ? $json_payload : $_POST;
            $emp_id = (int)($data['employee_id'] ?? 0);
            $emp_name = trim($data['employee_name'] ?? '');
            $type = trim($data['type'] ?? 'راتب شهري'); // راتب شهري / سلفة / مكافأة / خصم / يومية / أوفر تايم
            $amount = (float)($data['amount'] ?? 0);
            $payment_method = trim($data['payment_method'] ?? 'كاش من الدرج');
            $date = !empty($data['date']) ? trim($data['date']) : date('Y-m-d');
            $month_year = !empty($data['month_year']) ? trim($data['month_year']) : date('Y-m', strtotime($date));
            $notes = trim($data['notes'] ?? '');
            $cashier_name = trim($data['cashier_name'] ?? 'كاشير المحل');

            if ($amount <= 0) {
                echo json_encode(['success' => false, 'error' => 'يجب إدخال مبلغ صحيح أكبر من الصفر!']);
                exit;
            }

            // التأكد من اسم ومعرف الموظف
            if ($emp_id > 0 && empty($emp_name)) {
                $st = $pdo->prepare("SELECT name FROM employees WHERE id = ?");
                $st->execute([$emp_id]);
                $emp_name = $st->fetchColumn() ?: "موظف #{$emp_id}";
            } elseif (!empty($emp_name) && $emp_id <= 0) {
                $st = $pdo->prepare("SELECT id FROM employees WHERE name = ?");
                $st->execute([$emp_name]);
                $emp_id = (int)$st->fetchColumn();
            }

            if (empty($emp_name)) {
                echo json_encode(['success' => false, 'error' => 'اسم الموظف أو رقمه مطلوب!']);
                exit;
            }

            try {
                $pdo->exec("CREATE TABLE IF NOT EXISTS employee_payouts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    employee_id INTEGER NOT NULL,
                    employee_name VARCHAR(150) NOT NULL,
                    type VARCHAR(50) NOT NULL,
                    amount DECIMAL(10,2) NOT NULL,
                    payment_method VARCHAR(50) DEFAULT 'كاش من الدرج',
                    date VARCHAR(50) NOT NULL,
                    month_year VARCHAR(20) DEFAULT NULL,
                    notes TEXT,
                    cashier_name VARCHAR(100) DEFAULT 'كاشير المحل',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )");
            } catch (Exception $e) {
                try {
                    $pdo->exec("CREATE TABLE IF NOT EXISTS employee_payouts (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        employee_id INT NOT NULL,
                        employee_name VARCHAR(150) NOT NULL,
                        type VARCHAR(50) NOT NULL,
                        amount DECIMAL(10,2) NOT NULL,
                        payment_method VARCHAR(50) DEFAULT 'كاش من الدرج',
                        date DATE NOT NULL,
                        month_year VARCHAR(20) DEFAULT NULL,
                        notes TEXT,
                        cashier_name VARCHAR(100) DEFAULT 'كاشير المحل',
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
                } catch (Exception $e2) {}
            }

            $ins = $pdo->prepare("INSERT INTO employee_payouts (employee_id, employee_name, type, amount, payment_method, date, month_year, notes, cashier_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
            $ins->execute([$emp_id, $emp_name, $type, $amount, $payment_method, $date, $month_year, $notes, $cashier_name]);
            $payout_id = (int)$pdo->lastInsertId();

            // تسجيل الحركة كمصروف تلقائياً في expenses إذا كانت صرف نقدي (سلفة، راتب، مكافأة، يومية)
            if ($type !== 'خصم') {
                try {
                    $cat_name = ($type === 'سلفة') ? 'سلف عاملين' : 'رواتب عاملين';
                    $exp_note = "صرف ({$type}) للعامل ({$emp_name}) لشهر ({$month_year})" . (!empty($notes) ? " - {$notes}" : "");
                    $pdo->prepare("INSERT INTO expenses (category, amount, note, date, partner_name, payment_method) VALUES (?, ?, ?, ?, ?, ?)")
                        ->execute([$cat_name, $amount, $exp_note, $date, $cashier_name, $payment_method]);
                } catch (Exception $e_exp) {}
            }

            echo json_encode([
                'success' => true,
                'payout_id' => $payout_id,
                'employee_name' => $emp_name,
                'type' => $type,
                'amount' => $amount,
                'month_year' => $month_year,
                'message' => "✅ تم تسجيل صرف ({$type}) بمبلغ ({$amount} ج.م) للعامل ({$emp_name}) بنجاح."
            ], JSON_UNESCAPED_UNICODE);
            break;

        // ============================================================
        // 2.19 جلب سجل الرواتب والسلف والمدفوعات (Get Salary Payouts)
        // ============================================================
        case 'get_salary_payouts':
            $emp_id = (int)($_GET['employee_id'] ?? 0);
            $emp_name = trim($_GET['employee_name'] ?? '');
            $month_year = trim($_GET['month_year'] ?? '');
            $type = trim($_GET['type'] ?? '');
            $limit = min(200, max(1, (int)($_GET['limit'] ?? 100)));

            $conditions = [];
            $params = [];

            if ($emp_id > 0) {
                $conditions[] = "employee_id = ?";
                $params[] = $emp_id;
            }
            if (!empty($emp_name)) {
                $conditions[] = "employee_name LIKE ?";
                $params[] = "%{$emp_name}%";
            }
            if (!empty($month_year)) {
                $conditions[] = "month_year = ?";
                $params[] = $month_year;
            }
            if (!empty($type)) {
                $conditions[] = "type = ?";
                $params[] = $type;
            }

            $where = !empty($conditions) ? "WHERE " . implode(' AND ', $conditions) : "";
            $sql = "SELECT * FROM employee_payouts {$where} ORDER BY date DESC, id DESC LIMIT {$limit}";
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            $payouts = $stmt->fetchAll(PDO::FETCH_ASSOC);

            $total_sum = 0;
            foreach ($payouts as $p) {
                $total_sum += (float)$p['amount'];
            }

            echo json_encode([
                'success' => true,
                'count' => count($payouts),
                'total_amount' => $total_sum,
                'payouts' => $payouts
            ], JSON_UNESCAPED_UNICODE);
            break;

        // ============================================================
        // 2.20 كشف حساب مالي تفصيلي لعامل/موظف (Get Employee Ledger)
        // ============================================================
        case 'get_employee_ledger':
            $emp_id = (int)($_GET['employee_id'] ?? 0);
            $emp_name = trim($_GET['employee_name'] ?? '');
            $month_year = trim($_GET['month_year'] ?? date('Y-m'));

            $emp = null;
            if ($emp_id > 0) {
                $st = $pdo->prepare("SELECT * FROM employees WHERE id = ?");
                $st->execute([$emp_id]);
                $emp = $st->fetch(PDO::FETCH_ASSOC);
            } elseif (!empty($emp_name)) {
                $st = $pdo->prepare("SELECT * FROM employees WHERE name = ?");
                $st->execute([$emp_name]);
                $emp = $st->fetch(PDO::FETCH_ASSOC);
            }

            if (!$emp) {
                echo json_encode(['success' => false, 'error' => 'العامل / الموظف غير موجود!']);
                exit;
            }

            $eid = (int)$emp['id'];
            $st_po = $pdo->prepare("SELECT * FROM employee_payouts WHERE (employee_id = ? OR employee_name = ?) AND (month_year = ? OR date LIKE ?) ORDER BY date ASC, id ASC");
            $st_po->execute([$eid, $emp['name'], $month_year, $month_year . '%']);
            $transactions = $st_po->fetchAll(PDO::FETCH_ASSOC);

            $total_advances = 0;
            $total_bonuses = 0;
            $total_deductions = 0;
            $total_paid = 0;
            $total_daily = 0;

            foreach ($transactions as $t) {
                $amt = (float)$t['amount'];
                $tt = trim($t['type']);
                if ($tt === 'سلفة' || mb_strpos($tt, 'سلف') !== false) {
                    $total_advances += $amt;
                } elseif ($tt === 'مكافأة' || $tt === 'أوفر تايم' || mb_strpos($tt, 'مكاف') !== false || mb_strpos($tt, 'أوفر') !== false) {
                    $total_bonuses += $amt;
                } elseif ($tt === 'خصم' || mb_strpos($tt, 'خصم') !== false) {
                    $total_deductions += $amt;
                } elseif ($tt === 'راتب شهري' || mb_strpos($tt, 'راتب') !== false) {
                    $total_paid += $amt;
                } elseif ($tt === 'يومية' || mb_strpos($tt, 'يومي') !== false) {
                    $total_daily += $amt;
                }
            }

            $base_salary = (float)$emp['base_salary'];
            $net_remaining = round($base_salary + $total_bonuses + $total_daily - $total_deductions - $total_advances - $total_paid, 2);

            echo json_encode([
                'success' => true,
                'employee' => $emp,
                'month_year' => $month_year,
                'summary' => [
                    'base_salary' => $base_salary,
                    'total_advances' => $total_advances,
                    'total_bonuses' => $total_bonuses,
                    'total_deductions' => $total_deductions,
                    'total_paid_salary' => $total_paid,
                    'total_daily_wages' => $total_daily,
                    'net_remaining_to_pay' => $net_remaining
                ],
                'transactions' => $transactions
            ], JSON_UNESCAPED_UNICODE);
            break;

        // ============================================================
        // 3. إضافة أو تعديل أو مزامنة صنف/منتج مركزي في المتجر

        case 'sync_product':
            $data = !empty($json_payload) ? $json_payload : $_POST;
            $remote_id = (int)($data['product_id'] ?? $data['remote_id'] ?? 0);
            $name = trim($data['name'] ?? '');
            $category = trim($data['category'] ?? 'عام');
            $sub_category = trim($data['sub_category'] ?? '');
            $price = (float)($data['price'] ?? 0);
            $cost = (float)($data['cost'] ?? 0);
            $stock = (float)($data['stock'] ?? 100);
            $barcode = trim($data['barcode'] ?? '');
            $barcode2 = trim($data['barcode2'] ?? '');
            $barcode3 = trim($data['barcode3'] ?? '');
            $all_barcodes = trim($data['all_barcodes'] ?? $barcode);
            $local_code = trim($data['local_code'] ?? '');
            $description = trim($data['description'] ?? '');
            $image_url = trim($data['image_url'] ?? '');
            $is_weight_based = !empty($data['is_weight_based']) ? 1 : 0;
            
            if (empty($name)) {
                echo json_encode(['success' => false, 'error' => 'اسم المنتج مطلوب!']);
                exit;
            }
            
            // التأكد من وجود القسم في جدول التصنيفات
            if (!empty($category)) {
                try {
                    $cat_chk = $pdo->prepare("SELECT id FROM categories WHERE name = ? LIMIT 1");
                    $cat_chk->execute([$category]);
                    if (!$cat_chk->fetchColumn()) {
                        $cat_ins = $pdo->prepare("INSERT INTO categories (name) VALUES (?)");
                        $cat_ins->execute([$category]);
                    }
                } catch (Exception $e) {}
            }
            
            // فحص وجود المنتج بالمعرف السحابي أو الباركود أو الكود المحلي أو الاسم
            $existing_id = null;
            if ($remote_id > 0) {
                $chk = $pdo->prepare("SELECT id FROM products WHERE id = ? LIMIT 1");
                $chk->execute([$remote_id]);
                $existing_id = $chk->fetchColumn();
            }
            if (!$existing_id && !empty($barcode)) {
                $chk = $pdo->prepare("SELECT id FROM products WHERE barcode = ? LIMIT 1");
                $chk->execute([$barcode]);
                $existing_id = $chk->fetchColumn();
            }
            if (!$existing_id && !empty($local_code)) {
                $chk = $pdo->prepare("SELECT id FROM products WHERE local_code = ? LIMIT 1");
                $chk->execute([$local_code]);
                $existing_id = $chk->fetchColumn();
            }
            if (!$existing_id) {
                $chk = $pdo->prepare("SELECT id FROM products WHERE name = ? LIMIT 1");
                $chk->execute([$name]);
                $existing_id = $chk->fetchColumn();
            }
            
            // التأكد التلقائي من وجود الأعمدة الإضافية في جدول المنتجات
            try { $pdo->exec("ALTER TABLE products ADD COLUMN sub_category VARCHAR(100) DEFAULT NULL"); } catch (Exception $e) {}
            try { $pdo->exec("ALTER TABLE products ADD COLUMN barcode2 VARCHAR(100) DEFAULT NULL"); } catch (Exception $e) {}
            try { $pdo->exec("ALTER TABLE products ADD COLUMN barcode3 VARCHAR(100) DEFAULT NULL"); } catch (Exception $e) {}
            try { $pdo->exec("ALTER TABLE products ADD COLUMN all_barcodes TEXT DEFAULT NULL"); } catch (Exception $e) {}
            try { $pdo->exec("ALTER TABLE products ADD COLUMN local_code VARCHAR(50) DEFAULT NULL"); } catch (Exception $e) {}

            if ($existing_id) {
                $upd = $pdo->prepare("UPDATE products SET name = ?, category = ?, sub_category = ?, price = ?, cost = ?, stock = ?, barcode = ?, barcode2 = ?, barcode3 = ?, all_barcodes = ?, local_code = ? WHERE id = ?");
                $upd->execute([$name, $category, $sub_category, $price, $cost, $stock, $barcode, $barcode2, $barcode3, $all_barcodes, $local_code, $existing_id]);
                $final_id = $existing_id;
                $action_done = 'updated';
            } else {
                $ins = $pdo->prepare("INSERT INTO products (name, category, sub_category, price, cost, stock, barcode, barcode2, barcode3, all_barcodes, local_code, description, image_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
                $ins->execute([$name, $category, $sub_category, $price, $cost, $stock, $barcode, $barcode2, $barcode3, $all_barcodes, $local_code, $description, $image_url]);
                $final_id = $pdo->lastInsertId();
                $action_done = 'inserted';
            }
            
            echo json_encode([
                'success' => true,
                'action' => $action_done,
                'product_id' => (int)$final_id,
                'message' => "✅ تمت مزامنة المنتج ({$name}) على المتجر الإلكتروني بنجاح."
            ], JSON_UNESCAPED_UNICODE);
            break;

        // ============================================================
        // 3.1 حذف منتج من المتجر الإلكتروني
        // ============================================================
        case 'delete_product':
            $data = !empty($json_payload) ? $json_payload : $_POST;
            $remote_id = (int)($data['product_id'] ?? $data['remote_id'] ?? 0);
            $barcode = trim($data['barcode'] ?? '');
            $local_code = trim($data['local_code'] ?? '');
            $name = trim($data['name'] ?? '');
            
            $deleted = false;
            if ($remote_id > 0) {
                $del = $pdo->prepare("DELETE FROM products WHERE id = ?");
                $del->execute([$remote_id]);
                $deleted = true;
            } elseif (!empty($barcode)) {
                $del = $pdo->prepare("DELETE FROM products WHERE barcode = ?");
                $del->execute([$barcode]);
                $deleted = true;
            } elseif (!empty($local_code)) {
                $del = $pdo->prepare("DELETE FROM products WHERE local_code = ?");
                $del->execute([$local_code]);
                $deleted = true;
            } elseif (!empty($name)) {
                $del = $pdo->prepare("DELETE FROM products WHERE name = ?");
                $del->execute([$name]);
                $deleted = true;
            }
            
            echo json_encode([
                'success' => true,
                'deleted' => $deleted,
                'message' => "✅ تم حذف المنتج من المتجر الإلكتروني بنجاح."
            ], JSON_UNESCAPED_UNICODE);
            break;

        // ============================================================
        // 3.2 تحديث سريع لمخزون منتج على المتجر
        // ============================================================
        case 'update_stock':
            $data = !empty($json_payload) ? $json_payload : $_POST;
            $remote_id = (int)($data['product_id'] ?? 0);
            $barcode = trim($data['barcode'] ?? '');
            $name = trim($data['name'] ?? '');
            $new_stock = (float)($data['stock'] ?? 0);
            
            if ($remote_id > 0) {
                $upd = $pdo->prepare("UPDATE products SET stock = ? WHERE id = ?");
                $upd->execute([$new_stock, $remote_id]);
            } elseif (!empty($barcode)) {
                $upd = $pdo->prepare("UPDATE products SET stock = ? WHERE barcode = ?");
                $upd->execute([$new_stock, $barcode]);
            } elseif (!empty($name)) {
                $upd = $pdo->prepare("UPDATE products SET stock = ? WHERE name = ?");
                $upd->execute([$new_stock, $name]);
            }
            
            echo json_encode([
                'success' => true,
                'message' => "✅ تم تحديث رصيد المخزون في المتجر إلى ({$new_stock}) بنجاح."
            ], JSON_UNESCAPED_UNICODE);
            break;

        // ============================================================
        // 3.3 جلب كافة الأقسام والتصنيفات (Get Categories)
        // ============================================================
        case 'get_categories':
            $cats = $pdo->query("SELECT id, name, parent_id FROM categories ORDER BY id ASC")->fetchAll(PDO::FETCH_ASSOC);
            echo json_encode([
                'success' => true,
                'count' => count($cats),
                'categories' => $cats
            ], JSON_UNESCAPED_UNICODE);
            break;

        // ============================================================
        // 3.4 مزامنة قسم أساسي أو فرعي (Sync Category)
        // ============================================================
        case 'sync_category':
            $data = !empty($json_payload) ? $json_payload : $_POST;
            $main_name = trim($data['main_category'] ?? $data['name'] ?? '');
            $sub_name = trim($data['sub_category'] ?? '');
            
            if (empty($main_name)) {
                echo json_encode(['success' => false, 'error' => 'اسم القسم الأساسي مطلوب!']);
                exit;
            }
            
            // التأكد من وجود القسم الأساسي
            $chk = $pdo->prepare("SELECT id FROM categories WHERE name = ? LIMIT 1");
            $chk->execute([$main_name]);
            $main_id = $chk->fetchColumn();
            if (!$main_id) {
                $ins = $pdo->prepare("INSERT INTO categories (name) VALUES (?)");
                $ins->execute([$main_name]);
                $main_id = $pdo->lastInsertId();
            }
            
            // إذا كان هناك قسم فرعي
            if (!empty($sub_name)) {
                $chk_sub = $pdo->prepare("SELECT id FROM categories WHERE name = ? AND parent_id = ? LIMIT 1");
                $chk_sub->execute([$sub_name, $main_id]);
                if (!$chk_sub->fetchColumn()) {
                    $ins_sub = $pdo->prepare("INSERT INTO categories (name, parent_id) VALUES (?, ?)");
                    $ins_sub->execute([$sub_name, $main_id]);
                }
            }
            
            echo json_encode([
                'success' => true,
                'message' => "✅ تمت مزامنة التصنيف ({$main_name}) بنجاح."
            ], JSON_UNESCAPED_UNICODE);
            break;

        // ============================================================
        // 3.5 حذف قسم (Delete Category)
        // ============================================================
        case 'delete_category':
            $data = !empty($json_payload) ? $json_payload : $_POST;
            $cat_name = trim($data['name'] ?? '');
            if (!empty($cat_name)) {
                $chk = $pdo->prepare("SELECT id FROM categories WHERE name = ? LIMIT 1");
                $chk->execute([$cat_name]);
                $c_id = $chk->fetchColumn();
                if ($c_id) {
                    $pdo->prepare("DELETE FROM categories WHERE parent_id = ?")->execute([$c_id]);
                    $pdo->prepare("DELETE FROM categories WHERE id = ?")->execute([$c_id]);
                }
            }
            echo json_encode(['success' => true, 'message' => 'تم حذف القسم من المتجر بنجاح.'], JSON_UNESCAPED_UNICODE);
            break;

        // ============================================================
        // 4. سحب الطلبات الجديدة لتجهيزها في الكاشير المحلي
        // ============================================================
        case 'get_pending_orders':
            $stmt = $pdo->query("SELECT * FROM orders WHERE status = 'جديد' OR status = 'قيد التجهيز' ORDER BY id DESC LIMIT 50");
            $orders = $stmt->fetchAll(PDO::FETCH_ASSOC);
            
            echo json_encode([
                'success' => true,
                'count' => count($orders),
                'orders' => $orders
            ], JSON_UNESCAPED_UNICODE);
            break;

        // ============================================================
        // 5. تسجيل مصروف عام (Record Expense)
        // ============================================================
        case 'record_expense':
            $data = !empty($json_payload) ? $json_payload : $_POST;
            $cat = trim($data['category'] ?? 'نثريات');
            $amount = (float)($data['amount'] ?? 0);
            $note = trim($data['note'] ?? '');
            $pm = trim($data['payment_method'] ?? 'كاش');
            $date = $data['date'] ?? date('Y-m-d H:i:s');
            
            if ($amount <= 0) {
                echo json_encode(['success' => false, 'error' => 'المبلغ يجب أن يكون أكبر من الصفر!']);
                exit;
            }
            
            $stmt = $pdo->prepare("INSERT INTO expenses (category, amount, note, date, payment_method) VALUES (?, ?, ?, ?, ?)");
            $stmt->execute([$cat, $amount, $note, $date, $pm]);
            
            echo json_encode([
                'success' => true,
                'message' => "✅ تم تسجيل مصروف بقيمة {$amount} ج.م تحت بند ({$cat}) بنجاح."
            ], JSON_UNESCAPED_UNICODE);
            break;

        // ============================================================
        // 6. سداد دفعة لمورد (Pay Supplier)
        // ============================================================
        case 'pay_supplier':
            $data = !empty($json_payload) ? $json_payload : $_POST;
            $sup_id = (int)($data['supplier_id'] ?? 0);
            $sup_name = trim($data['supplier_name'] ?? '');
            $amount = (float)($data['amount'] ?? 0);
            $note = trim($data['note'] ?? '');
            $pm = trim($data['payment_method'] ?? 'كاش');
            $date = $data['date'] ?? date('Y-m-d H:i:s');
            
            if ($amount <= 0) {
                echo json_encode(['success' => false, 'error' => 'مبلغ السداد يجب أن يكون أكبر من الصفر!']);
                exit;
            }
            
            // تحديث رصيد المورد
            if ($sup_id > 0) {
                $upd = $pdo->prepare("UPDATE suppliers SET balance = balance - ? WHERE id = ?");
                $upd->execute([$amount, $sup_id]);
                if (empty($sup_name)) {
                    $sup_name = $pdo->query("SELECT name FROM suppliers WHERE id = {$sup_id}")->fetchColumn() ?: "مورد #{$sup_id}";
                }
            } elseif (!empty($sup_name)) {
                $upd = $pdo->prepare("UPDATE suppliers SET balance = balance - ? WHERE name = ?");
                $upd->execute([$amount, $sup_name]);
            }
            
            $full_note = "[سداد مورد: {$sup_name}] " . $note;
            $stmt = $pdo->prepare("INSERT INTO expenses (category, amount, note, date, supplier_id, payment_method) VALUES ('سداد موردين', ?, ?, ?, ?, ?)");
            $stmt->execute([$amount, $full_note, $date, $sup_id ?: null, $pm]);
            
            echo json_encode([
                'success' => true,
                'message' => "✅ تم سداد مبلغ {$amount} ج.م للمورد ({$sup_name}) وتحديث الرصيد بنجاح."
            ], JSON_UNESCAPED_UNICODE);
            break;

        // ============================================================
        // 7. سحب أرباح / مسحوبات للمالك أو الشريك (Partner Withdrawal)
        // ============================================================
        case 'partner_withdraw':
            $data = !empty($json_payload) ? $json_payload : $_POST;
            $partner_name = trim($data['partner_name'] ?? 'المالك / المدير العام');
            $amount = (float)($data['amount'] ?? 0);
            $note = trim($data['note'] ?? '');
            $date = $data['date'] ?? date('Y-m-d H:i:s');
            
            if ($amount <= 0) {
                echo json_encode(['success' => false, 'error' => 'مبلغ السحب يجب أن يكون أكبر من الصفر!']);
                exit;
            }
            
            $full_note = "[مسحوبات: {$partner_name}] " . $note;
            $stmt = $pdo->prepare("INSERT INTO expenses (category, amount, note, date, partner_name, payment_method) VALUES ('مسحوبات الإدارة', ?, ?, ?, ?, 'كاش')");
            $stmt->execute([$amount, $full_note, $date, $partner_name]);
            
            echo json_encode([
                'success' => true,
                'message' => "✅ تم تسجيل سحب مبلغ {$amount} ج.م للشريك ({$partner_name}) وخصمه من الخزينة."
            ], JSON_UNESCAPED_UNICODE);
            break;

        // ============================================================
        // 8. تقارير الكاشير والشيفت المالي اللحظي (POS Reports & Shift Summary)
        // ============================================================
        case 'get_pos_reports':
            $today = date('Y-m-d');
            
            // إجمالي المبيعات اليوم
            $sales_stmt = $pdo->prepare("SELECT total_price, payment_method, discount_amount, shipping_cost, cashier_name, created_at FROM orders WHERE created_at >= ? AND status != 'ملغي'");
            $sales_stmt->execute(["{$today} 00:00:00"]);
            $sales_today = $sales_stmt->fetchAll(PDO::FETCH_ASSOC);
            
            $total_sales_amount = 0;
            $sales_by_method = [
                'كاش' => 0,
                'فودافون كاش' => 0,
                'انستا باي' => 0,
                'فيزا' => 0,
                'آجل' => 0
            ];
            
            foreach ($sales_today as $s) {
                $amt = (float)$s['total_price'];
                $total_sales_amount += $amt;
                $pm = $s['payment_method'] ?? 'كاش';
                
                if (mb_strpos($pm, 'فودافون') !== false || mb_strpos($pm, 'محفظة') !== false) {
                    $sales_by_method['فودافون كاش'] += $amt;
                } elseif (mb_strpos($pm, 'انستا') !== false) {
                    $sales_by_method['انستا باي'] += $amt;
                } elseif (mb_strpos($pm, 'فيزا') !== false || mb_strpos($pm, 'كارت') !== false || mb_strpos($pm, 'بطاقة') !== false) {
                    $sales_by_method['فيزا'] += $amt;
                } elseif (mb_strpos($pm, 'آجل') !== false || mb_strpos($pm, 'حساب') !== false) {
                    $sales_by_method['آجل'] += $amt;
                } else {
                    $sales_by_method['كاش'] += $amt;
                }
            }
            
            // المصروفات اليومية
            $exp_stmt = $pdo->prepare("SELECT id, category, amount, note, date, partner_name, payment_method FROM expenses WHERE date >= ? OR created_at >= ?");
            $exp_stmt->execute(["{$today} 00:00:00", "{$today} 00:00:00"]);
            $expenses_today = $exp_stmt->fetchAll(PDO::FETCH_ASSOC);
            
            $total_general_expenses = 0;
            $total_supplier_payouts = 0;
            $total_partner_withdrawals = 0;
            $cash_outflows = 0;
            
            foreach ($expenses_today as $exp) {
                $amt = (float)$exp['amount'];
                $cat = $exp['category'] ?? '';
                $is_cash = empty($exp['payment_method']) || $exp['payment_method'] === 'كاش';
                
                if ($cat === 'سداد موردين') {
                    $total_supplier_payouts += $amt;
                } elseif ($cat === 'مسحوبات الإدارة') {
                    $total_partner_withdrawals += $amt;
                } else {
                    $total_general_expenses += $amt;
                }
                
                if ($is_cash) {
                    $cash_outflows += $amt;
                }
            }
            
            // السيولة النقدية الفعلية في الدرج (Cash in Drawer)
            $net_cash_in_drawer = max(0, $sales_by_method['كاش'] - $cash_outflows);
            
            echo json_encode([
                'success' => true,
                'server_time' => date('Y-m-d H:i:s'),
                'today_date' => $today,
                'orders_count' => count($sales_today),
                'total_sales' => $total_sales_amount,
                'sales_by_method' => $sales_by_method,
                'total_general_expenses' => $total_general_expenses,
                'total_supplier_payouts' => $total_supplier_payouts,
                'total_partner_withdrawals' => $total_partner_withdrawals,
                'total_all_expenses' => ($total_general_expenses + $total_supplier_payouts + $total_partner_withdrawals),
                'net_cash_in_drawer' => $net_cash_in_drawer,
                'recent_sales' => array_slice(array_reverse($sales_today), 0, 8),
                'recent_expenses' => array_slice(array_reverse($expenses_today), 0, 8)
            ], JSON_UNESCAPED_UNICODE);
            break;

        // ============================================================
        // 9. جلب قوائم الموردين والتصنيفات والشركاء
        // ============================================================
        case 'get_pos_meta':
            $suppliers = $pdo->query("SELECT id, name, phone, balance FROM suppliers ORDER BY name ASC")->fetchAll(PDO::FETCH_ASSOC);
            $categories = $pdo->query("SELECT name FROM expense_categories ORDER BY name ASC")->fetchAll(PDO::FETCH_COLUMN);
            $partners = $pdo->query("SELECT name FROM partners ORDER BY name ASC")->fetchAll(PDO::FETCH_COLUMN);
            
            echo json_encode([
                'success' => true,
                'suppliers' => $suppliers,
                'expense_categories' => $categories,
                'partners' => $partners
            ], JSON_UNESCAPED_UNICODE);
            break;

        // ============================================================
        // 10. إحصائيات مركز المعلومات للمبيعات والمخزون
        // ============================================================
        case 'get_hub_stats':
            $today = date('Y-m-d');
            $sales_today = $pdo->query("SELECT COALESCE(SUM(total_price), 0) FROM orders WHERE created_at LIKE '{$today}%'")->fetchColumn();
            $orders_today = $pdo->query("SELECT COUNT(*) FROM orders WHERE created_at LIKE '{$today}%'")->fetchColumn();
            $low_stock = $pdo->query("SELECT COUNT(*) FROM products WHERE stock <= 5")->fetchColumn();
            
            echo json_encode([
                'success' => true,
                'sales_today' => (float)$sales_today,
                'orders_today' => (int)$orders_today,
                'low_stock_count' => (int)$low_stock,
                'server_time' => date('Y-m-d H:i:s')
            ], JSON_UNESCAPED_UNICODE);
            break;

        // ============================================================
        // 11. تسجيل دخول الطيار برمز الـ PIN أو الهاتف
        // ============================================================
        case 'driver_login':
            $data = !empty($json_payload) ? $json_payload : $_POST;
            $pin = trim($data['pin_code'] ?? '');
            $driver_id = (int)($data['driver_id'] ?? 0);
            $phone = trim($data['phone'] ?? '');

            if (empty($pin)) {
                echo json_encode(['success' => false, 'error' => 'يرجى إدخال الرمز السري (PIN) للدخول']);
                break;
            }

            if ($driver_id > 0) {
                $stmt = $pdo->prepare("SELECT * FROM delivery_drivers WHERE id = ? AND pin_code = ? AND is_active = 1");
                $stmt->execute([$driver_id, $pin]);
            } elseif (!empty($phone)) {
                $stmt = $pdo->prepare("SELECT * FROM delivery_drivers WHERE phone = ? AND pin_code = ? AND is_active = 1");
                $stmt->execute([$phone, $pin]);
            } else {
                $stmt = $pdo->prepare("SELECT * FROM delivery_drivers WHERE pin_code = ? AND is_active = 1");
                $stmt->execute([$pin]);
            }

            $driver = $stmt->fetch(PDO::FETCH_ASSOC);
            if ($driver) {
                echo json_encode([
                    'success' => true,
                    'message' => 'مرحباً بك كابتن ' . $driver['name'],
                    'driver' => [
                        'id' => (int)$driver['id'],
                        'name' => $driver['name'],
                        'phone' => $driver['phone'],
                        'cash_balance' => (float)$driver['cash_balance']
                    ]
                ], JSON_UNESCAPED_UNICODE);
            } else {
                echo json_encode(['success' => false, 'error' => 'الرمز السري (PIN) غير صحيح أو الحساب معطل']);
            }
            break;

        // ============================================================
        // 12. جلب أوردرات الطيار المعزولة حصراً ومحفظته المالية
        // ============================================================
        case 'get_driver_orders':
            $driver_name = trim($_GET['driver_name'] ?? ($json_payload['driver_name'] ?? ''));
            if (empty($driver_name)) {
                echo json_encode(['success' => false, 'error' => 'يرجى تحديد اسم الطيار']);
                break;
            }

            // التأكد من جلب الأوردرات المسندة لهذا الطيار فقط
            $stmt = $pdo->prepare("SELECT * FROM orders WHERE delivery_person = ? ORDER BY id DESC LIMIT 50");
            $stmt->execute([$driver_name]);
            $orders = $stmt->fetchAll(PDO::FETCH_ASSOC);

            // تصنيف وإحصاء أوردرات هذا الطيار
            $in_transit = [];
            $pending = [];
            $delivered_today = [];
            $total_cash_in_hand = 0;
            $total_commission = 0;
            $today = date('Y-m-d');

            foreach ($orders as &$ord) {
                $ord['id'] = (int)$ord['id'];
                $ord['total_price'] = (float)$ord['total_price'];
                $ord['shipping_cost'] = (float)($ord['shipping_cost'] ?? 0);
                $ord['payment_method'] = $ord['payment_method'] ?? 'كاش';
                $ord['is_cash'] = (mb_stripos($ord['payment_method'], 'كاش') !== false || mb_stripos($ord['payment_method'], 'cash') !== false || empty($ord['payment_method']));

                $status = $ord['status'] ?? 'جديد';
                $created_date = substr($ord['created_at'] ?? '', 0, 10);

                if ($status === 'جاري التوصيل' || $status === 'في الطريق') {
                    $in_transit[] = $ord;
                } elseif ($status === 'بانتظار الطيار' || $status === 'جديد' || $status === 'مؤقتة' || $status === 'معلق') {
                    $pending[] = $ord;
                } elseif ($status === 'تم التسليم' || $status === 'مكتملة') {
                    if ($created_date === $today) {
                        $delivered_today[] = $ord;
                    }
                    if ($ord['is_cash']) {
                        $total_cash_in_hand += $ord['total_price'];
                    }
                    $total_commission += $ord['shipping_cost'];
                }
            }
            unset($ord);

            // جلب الرصيد الحالي المسجل في جدول الطيارين
            $stmt_bal = $pdo->prepare("SELECT cash_balance FROM delivery_drivers WHERE name = ?");
            $stmt_bal->execute([$driver_name]);
            $drv_bal = (float)$stmt_bal->fetchColumn();

            echo json_encode([
                'success' => true,
                'driver_name' => $driver_name,
                'stats' => [
                    'in_transit_count' => count($in_transit),
                    'pending_count' => count($pending),
                    'delivered_today_count' => count($delivered_today),
                    'cash_in_hand' => $total_cash_in_hand,
                    'driver_balance' => $drv_bal,
                    'total_commission' => $total_commission
                ],
                'orders_in_transit' => $in_transit,
                'orders_pending' => $pending,
                'orders_delivered_today' => $delivered_today,
                'all_orders' => $orders
            ], JSON_UNESCAPED_UNICODE);
            break;

        // ============================================================
        // 13. تحديث حالة توصيل الأوردر (استلام / تم التسليم / راجع)
        // ============================================================
        case 'update_delivery_status':
            $data = !empty($json_payload) ? $json_payload : $_POST;
            $order_id = (int)($data['order_id'] ?? 0);
            $new_status = trim($data['status'] ?? '');
            $driver_name = trim($data['driver_name'] ?? '');
            $note = trim($data['note'] ?? '');

            if ($order_id <= 0 || empty($new_status)) {
                echo json_encode(['success' => false, 'error' => 'بيانات الطلب أو الحالة غير مكتملة']);
                break;
            }

            // التحقق من أن الأوردر مسند لهذا الطيار
            $chk = $pdo->prepare("SELECT id, total_price, payment_method, status FROM orders WHERE id = ? AND delivery_person = ?");
            $chk->execute([$order_id, $driver_name]);
            $order = $chk->fetch(PDO::FETCH_ASSOC);

            if (!$order) {
                echo json_encode(['success' => false, 'error' => 'عذراً، هذا الأوردر غير مسند إليك أو غير موجود']);
                break;
            }

            // تحديث حالة الأوردر
            $upd = $pdo->prepare("UPDATE orders SET status = ? WHERE id = ?");
            $upd->execute([$new_status, $order_id]);

            // إذا تم التسليم وكان كاش، نضيف المبلغ لعهدة الطيار
            $is_cash = (mb_stripos($order['payment_method'] ?? '', 'كاش') !== false || mb_stripos($order['payment_method'] ?? '', 'cash') !== false || empty($order['payment_method']));
            if ($new_status === 'تم التسليم' && $is_cash) {
                $amt = (float)$order['total_price'];
                $pdo->prepare("UPDATE delivery_drivers SET cash_balance = cash_balance + ? WHERE name = ?")->execute([$amt, $driver_name]);
            }

            echo json_encode([
                'success' => true,
                'message' => "تم تحديث حالة الأوردر رقم #{$order_id} إلى ({$new_status}) بنجاح",
                'order_id' => $order_id,
                'new_status' => $new_status
            ], JSON_UNESCAPED_UNICODE);
            break;

        // ============================================================
        // 14. تصفية عهدة الطيار النقدية وتسليمها للكاشير
        // ============================================================
        case 'settle_driver_cash':
            $data = !empty($json_payload) ? $json_payload : $_POST;
            $driver_name = trim($data['driver_name'] ?? '');
            $amount = (float)($data['amount'] ?? 0);
            $note = trim($data['note'] ?? 'تصفية عهدة دليفري وتسليم كاش');

            if (empty($driver_name) || $amount <= 0) {
                echo json_encode(['success' => false, 'error' => 'يرجى تحديد الطيار والمبلغ المراد تسليمه']);
                break;
            }

            // تصفية أو خصم المبلغ من رصيد الطيار
            $pdo->prepare("UPDATE delivery_drivers SET cash_balance = CASE WHEN cash_balance >= ? THEN cash_balance - ? ELSE 0 END WHERE name = ?")->execute([$amount, $amount, $driver_name]);

            // تسجيل إيراد / قيد حركة استلام عهدة
            try {
                $pdo->prepare("INSERT INTO expenses (category, amount, note, date, partner_name, payment_method) VALUES ('توريد عهدة دليفري', ?, ?, ?, ?, 'كاش')")
                    ->execute([$amount, "استلام كاش من الطيار ($driver_name): " . $note, date('Y-m-d H:i:s'), $driver_name]);
            } catch (Exception $e) {}

            echo json_encode([
                'success' => true,
                'message' => "تم تسليم وتصفية مبلغ {$amount} ج.م من الكابتن {$driver_name} بنجاح!",
                'settled_amount' => $amount
            ], JSON_UNESCAPED_UNICODE);
            break;

        // ============================================================
        // 7. تصفير شامل لجميع بيانات المتجر السحابي (Reset All Cloud Data)
        // ============================================================
        case 'reset_all_data':
            $tables_to_wipe = ['products', 'orders', 'expenses', 'customers', 'suppliers', 'abandoned_carts', 'wishlist', 'notifications'];
            foreach ($tables_to_wipe as $t) {
                try {
                    $pdo->exec("DELETE FROM `{$t}`");
                } catch (Exception $e) {
                    // تجاهل الجداول غير الموجودة بأمان
                }
            }
            
            echo json_encode([
                'success' => true,
                'message' => '✅ تم تصفير وحذف كافة بيانات المتجر الإلكتروني السحابي بنجاح.'
            ], JSON_UNESCAPED_UNICODE);
            break;

        // ============================================================
        // 15. جلب قائمة الطيارين المتاحين (للكاشير وشاشة الدخول)
        // ============================================================
        case 'get_delivery_drivers':
            $drivers = $pdo->query("SELECT id, name, phone, cash_balance FROM delivery_drivers WHERE is_active = 1 ORDER BY name ASC")->fetchAll(PDO::FETCH_ASSOC);
            echo json_encode([
                'success' => true,
                'drivers' => $drivers
            ], JSON_UNESCAPED_UNICODE);
            break;

        // ============================================================
        // 16. تحديث رصيد ومخزون منتج في الجرد (Single Product Stock)
        // ============================================================
        case 'update_inventory_stock':
            $data = !empty($json_payload) ? $json_payload : $_POST;
            $product_id = (int)($data['product_id'] ?? 0);
            $barcode = trim($data['barcode'] ?? '');
            $new_stock = isset($data['new_stock']) ? (float)$data['new_stock'] : null;
            $note = trim($data['note'] ?? 'تعديل جرد يدوي');

            if ($new_stock === null || ($product_id <= 0 && empty($barcode))) {
                echo json_encode(['success' => false, 'error' => 'يرجى تحديد المنتج والكمية الجديدة بالجرد']);
                break;
            }

            if ($product_id > 0) {
                $stmt = $pdo->prepare("SELECT id, name, stock, cost, price FROM products WHERE id = ?");
                $stmt->execute([$product_id]);
            } else {
                $stmt = $pdo->prepare("SELECT id, name, stock, cost, price FROM products WHERE barcode = ? OR local_code = ?");
                $stmt->execute([$barcode, $barcode]);
            }
            $prod = $stmt->fetch(PDO::FETCH_ASSOC);

            if (!$prod) {
                echo json_encode(['success' => false, 'error' => 'المنتج غير موجود في قاعدة البيانات']);
                break;
            }

            $old_stock = (float)$prod['stock'];
            $upd = $pdo->prepare("UPDATE products SET stock = ? WHERE id = ?");
            $upd->execute([$new_stock, $prod['id']]);

            echo json_encode([
                'success' => true,
                'message' => "تم تحديث رصيد ({$prod['name']}) من {$old_stock} إلى {$new_stock} بنجاح ✓",
                'product_id' => (int)$prod['id'],
                'name' => $prod['name'],
                'old_stock' => $old_stock,
                'new_stock' => $new_stock,
                'diff' => ($new_stock - $old_stock)
            ], JSON_UNESCAPED_UNICODE);
            break;

        // ============================================================
        // 17. تطبيق الجرد الشامل وتحديث كميات متعددة دفعة واحدة
        // ============================================================
        case 'bulk_inventory_audit':
            $data = !empty($json_payload) ? $json_payload : $_POST;
            $items = $data['items'] ?? [];
            $auditor = trim($data['auditor'] ?? 'مسؤول الجرد');

            if (is_string($items)) {
                $items = json_decode($items, true) ?: [];
            }

            if (empty($items)) {
                echo json_encode(['success' => false, 'error' => 'لا توجد أصناف لتطبيق الجرد عليها']);
                break;
            }

            $updated_count = 0;
            $upd_stmt = $pdo->prepare("UPDATE products SET stock = ? WHERE id = ?");
            foreach ($items as $it) {
                $p_id = (int)($it['id'] ?? 0);
                $n_stock = isset($it['new_stock']) ? (float)$it['new_stock'] : null;
                if ($p_id > 0 && $n_stock !== null) {
                    $upd_stmt->execute([$n_stock, $p_id]);
                    $updated_count++;
                }
            }

            // تسجيل إشعار بنظام الإدارة
            try {
                $pdo->prepare("INSERT INTO notifications (title, body, link) VALUES (?, ?, ?)")
                    ->execute([
                        "📋 تم تطبيق جرد مخزون جديد",
                        "قام ($auditor) بتطبيق جرد شامل وتحديث كميات ($updated_count) صنفاً",
                        "pos.php"
                    ]);
            } catch (Exception $e) {}

            echo json_encode([
                'success' => true,
                'message' => "تم تطبيق الجرد الشامل وتحديث كميات {$updated_count} صنف بنجاح!",
                'updated_count' => $updated_count
            ], JSON_UNESCAPED_UNICODE);
            break;

        // ============================================================
        // 18. جلب الفواتير السابقة للمزامنة السحابية الفورية بين الأجهزة
        // ============================================================
        case 'get_completed_orders':
        case 'get_recent_orders':
        case 'get_orders':
            try { $pdo->exec("ALTER TABLE orders ADD COLUMN invoice_barcode VARCHAR(100) DEFAULT NULL"); } catch (Exception $e) {}
            try { $pdo->exec("ALTER TABLE orders ADD COLUMN items_json LONGTEXT DEFAULT NULL"); } catch (Exception $e) {}

            $limit = min(200, max(1, (int)($_GET['limit'] ?? 100)));
            $stmt = $pdo->prepare("SELECT * FROM orders ORDER BY id DESC LIMIT ?");
            $stmt->bindValue(1, $limit, PDO::PARAM_INT);
            $stmt->execute();
            $raw_orders = $stmt->fetchAll(PDO::FETCH_ASSOC);

            $formatted_orders = [];
            foreach ($raw_orders as $o) {
                $items = [];
                if (!empty($o['items_json'])) {
                    $items = json_decode($o['items_json'], true) ?: [];
                }
                if (empty($items) && !empty($o['order_details'])) {
                    $lines = explode("\n", $o['order_details']);
                    foreach ($lines as $line) {
                        $line = trim($line);
                        if (empty($line)) continue;
                        if (preg_match('/^[•\-\*]?\s*(.*?)\s*[×x]\s*([\d\.]+)\s*=\s*([\d\.]+)/u', $line, $m)) {
                            $p_name = trim($m[1]);
                            $p_qty = (float)$m[2];
                            $p_sub = (float)$m[3];
                            $p_price = $p_qty > 0 ? ($p_sub / $p_qty) : $p_sub;
                            $items[] = [
                                'name' => $p_name,
                                'qty' => $p_qty,
                                'price' => $p_price,
                                'total' => $p_sub
                            ];
                        } else {
                            $items[] = [
                                'name' => $line,
                                'qty' => 1,
                                'price' => (float)$o['total_price'],
                                'total' => (float)$o['total_price']
                            ];
                        }
                    }
                }

                $formatted_orders[] = [
                    'order_id' => (int)$o['id'],
                    'id' => (int)$o['id'],
                    'invoice_barcode' => $o['invoice_barcode'] ?: ("INV-" . $o['id']),
                    'created_at' => $o['created_at'],
                    'customer_name' => $o['customer_name'] ?: ($o['source'] === 'delivery' ? 'عميل دليفري' : 'عميل نقدي'),
                    'customer_phone' => $o['customer_phone'] ?? '',
                    'phone' => $o['customer_phone'] ?? '',
                    'address' => $o['customer_address'] ?? '',
                    'delivery_person' => $o['delivery_person'] ?? '',
                    'delivery_fee' => (float)($o['delivery_fee'] ?? $o['shipping_cost'] ?? 0),
                    'order_type' => (!empty($o['delivery_person']) && $o['delivery_person'] !== 'بدون توصيل (تيك أواي)') ? 'delivery' : 'hall',
                    'payment_method' => $o['payment_method'] ?: 'كاش',
                    'payment_status' => $o['payment_status'] ?: 'مدفوع',
                    'status' => $o['status'] ?: 'مكتمل',
                    'total' => (float)$o['total_price'],
                    'total_price' => (float)$o['total_price'],
                    'discount' => (float)($o['discount_amount'] ?? 0),
                    'cashier' => $o['cashier_name'] ?? 'كاشير المحل',
                    'items' => $items
                ];
            }

            echo json_encode([
                'success' => true,
                'count' => count($formatted_orders),
                'orders' => $formatted_orders
            ], JSON_UNESCAPED_UNICODE);
            break;

        // ============================================================
        // 19. الاستعلام عن تفاصيل فاتورة بالباركود أو برقم الفاتورة (للمرتجعات والمعاينة)
        // ============================================================
        case 'get_order_details':
        case 'lookup_order':
            try { $pdo->exec("ALTER TABLE orders ADD COLUMN invoice_barcode VARCHAR(100) DEFAULT NULL"); } catch (Exception $e) {}
            try { $pdo->exec("ALTER TABLE orders ADD COLUMN items_json LONGTEXT DEFAULT NULL"); } catch (Exception $e) {}

            $raw_q = trim($_GET['order_id'] ?? $_GET['barcode'] ?? $_GET['q'] ?? $json_payload['order_id'] ?? '');
            if (empty($raw_q)) {
                echo json_encode(['success' => false, 'error' => 'يرجى تحديد رقم الفاتورة أو باركود الفاتورة.']);
                break;
            }

            $numeric_id = (int)preg_replace('/[^0-9]/', '', $raw_q);
            $clean_bc = strtoupper($raw_q);

            $stmt = $pdo->prepare("SELECT * FROM orders WHERE id = ? OR invoice_barcode = ? OR invoice_barcode = ? LIMIT 1");
            $stmt->execute([$numeric_id, $raw_q, $clean_bc]);
            $o = $stmt->fetch(PDO::FETCH_ASSOC);

            if (!$o && !empty($raw_q)) {
                $stmt2 = $pdo->prepare("SELECT * FROM orders WHERE invoice_barcode LIKE ? OR customer_phone = ? LIMIT 1");
                $stmt2->execute(['%' . $raw_q . '%', $raw_q]);
                $o = $stmt2->fetch(PDO::FETCH_ASSOC);
            }

            if (!$o) {
                echo json_encode(['success' => false, 'message' => "لم يتم العثور على فاتورة برقم: {$raw_q}"]);
                break;
            }

            $items = [];
            if (!empty($o['items_json'])) {
                $items = json_decode($o['items_json'], true) ?: [];
            }
            if (empty($items) && !empty($o['order_details'])) {
                $lines = explode("\n", $o['order_details']);
                foreach ($lines as $line) {
                    $line = trim($line);
                    if (empty($line)) continue;
                    if (preg_match('/^[•\-\*]?\s*(.*?)\s*[×x]\s*([\d\.]+)\s*=\s*([\d\.]+)/u', $line, $m)) {
                        $p_name = trim($m[1]);
                        $p_qty = (float)$m[2];
                        $p_sub = (float)$m[3];
                        $p_price = $p_qty > 0 ? ($p_sub / $p_qty) : $p_sub;
                        $items[] = [
                            'name' => $p_name,
                            'qty' => $p_qty,
                            'price' => $p_price,
                            'total' => $p_sub
                        ];
                    } else {
                        $items[] = [
                            'name' => $line,
                            'qty' => 1,
                            'price' => (float)$o['total_price'],
                            'total' => (float)$o['total_price']
                        ];
                    }
                }
            }

            $formatted_order = [
                'order_id' => (int)$o['id'],
                'id' => (int)$o['id'],
                'invoice_barcode' => $o['invoice_barcode'] ?: ("INV-" . $o['id']),
                'created_at' => $o['created_at'],
                'customer_name' => $o['customer_name'] ?: 'عميل نقدي',
                'customer_phone' => $o['customer_phone'] ?? '',
                'phone' => $o['customer_phone'] ?? '',
                'address' => $o['customer_address'] ?? '',
                'delivery_person' => $o['delivery_person'] ?? '',
                'delivery_fee' => (float)($o['delivery_fee'] ?? $o['shipping_cost'] ?? 0),
                'order_type' => (!empty($o['delivery_person']) && $o['delivery_person'] !== 'بدون توصيل (تيك أواي)') ? 'delivery' : 'hall',
                'payment_method' => $o['payment_method'] ?: 'كاش',
                'payment_status' => $o['payment_status'] ?: 'مدفوع',
                'status' => $o['status'] ?: 'مكتمل',
                'total' => (float)$o['total_price'],
                'total_price' => (float)$o['total_price'],
                'discount' => (float)($o['discount_amount'] ?? 0),
                'cashier' => $o['cashier_name'] ?? 'كاشير المحل',
                'items' => $items
            ];

            echo json_encode([
                'success' => true,
                'order' => $formatted_order,
                'items' => $items
            ], JSON_UNESCAPED_UNICODE);
            break;

        // ============================================================
        // 20. تسجيل مرتجع مبيعات وإرجاع البضاعة للمخزون
        // ============================================================
        case 'process_return':
        case 'record_return':
            $data = !empty($json_payload) ? $json_payload : $_POST;
            $order_id = (int)($data['order_id'] ?? $data['id'] ?? 0);
            $returned_items = $data['returned_items'] ?? $data['items'] ?? [];
            $refund_amount = (float)($data['refund_amount'] ?? $data['total_refund'] ?? 0);
            $reason = trim($data['reason'] ?? 'مرتجع مبيعات كاشير');
            $cashier = trim($data['cashier_name'] ?? 'كاشير المحل');

            if (is_string($returned_items)) {
                $returned_items = json_decode($returned_items, true) ?: [];
            }

            if (empty($returned_items) && $refund_amount <= 0) {
                echo json_encode(['success' => false, 'error' => 'يرجى تحديد الأصناف المرتجعة أو مبلغ الاسترداد']);
                break;
            }

            // إرجاع الأصناف إلى رصيد المخزون
            $restored_count = 0;
            foreach ($returned_items as $rit) {
                $p_id = (int)($rit['product_id'] ?? $rit['id'] ?? 0);
                $p_bc = trim($rit['barcode'] ?? '');
                $p_name = trim($rit['name'] ?? '');
                $qty = (float)($rit['qty'] ?? $rit['return_qty'] ?? 1);

                if ($qty <= 0) continue;

                $restored = false;
                if ($p_id > 0) {
                    $upd = $pdo->prepare("UPDATE products SET stock = stock + ? WHERE id = ?");
                    $upd->execute([$qty, $p_id]);
                    if ($upd->rowCount() > 0) $restored = true;
                }
                if (!$restored && !empty($p_bc)) {
                    $upd = $pdo->prepare("UPDATE products SET stock = stock + ? WHERE barcode = ?");
                    $upd->execute([$qty, $p_bc]);
                    if ($upd->rowCount() > 0) $restored = true;
                }
                if (!$restored && !empty($p_name)) {
                    $upd = $pdo->prepare("UPDATE products SET stock = stock + ? WHERE name = ?");
                    $upd->execute([$qty, $p_name]);
                    if ($upd->rowCount() > 0) $restored = true;
                }
                if ($restored) $restored_count++;
            }

            if ($order_id > 0) {
                try {
                    $pdo->prepare("UPDATE orders SET status = 'مرتجع' WHERE id = ?")->execute([$order_id]);
                } catch (Exception $e) {}
            }

            if ($refund_amount > 0) {
                try {
                    $pdo->prepare("INSERT INTO expenses (category, amount, note, date, payment_method) VALUES ('مرتجع مبيعات', ?, ?, ?, 'كاش')")
                        ->execute([$refund_amount, "مرتجع فاتورة #{$order_id} - سبب: {$reason} - كاشير: {$cashier}", date('Y-m-d H:i:s')]);
                } catch (Exception $e) {}
            }

            echo json_encode([
                'success' => true,
                'message' => "✅ تم تسجيل المرتجع واسترجاع المخزون بنجاح (مبلغ مسترد: {$refund_amount} ج.م)",
                'order_id' => $order_id,
                'refund_amount' => $refund_amount,
                'restored_items_count' => $restored_count
            ], JSON_UNESCAPED_UNICODE);
            break;

        default:
            echo json_encode(['success' => false, 'error' => 'Unknown action']);
            break;
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Database/Server Error: ' . $e->getMessage()
    ], JSON_UNESCAPED_UNICODE);
}
