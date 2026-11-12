<?php
/**
 * Credential-free storefront visibility & inventory adjustment helpers.
 * Shared between public storefront, web admin tools, api_barcode.php, and api_sync.php.
 */

/**
 * Determine whether a product image path/URL represents a real uploaded photo.
 */
function isRealProductImage(?string $url): bool
{
    $u = trim((string)$url);
    if ($u === '') {
        return false;
    }
    $lower = strtolower($u);
    $placeholders = [
        'placeholder.php',
        '/placeholder',
        'placeholder.png',
        'placeholder.jpg',
        'placeholder.jpeg',
        'placeholder.webp',
        'no-image',
        'no_image',
        'default.png',
        'default.jpg',
    ];
    foreach ($placeholders as $marker) {
        if (strpos($lower, $marker) !== false) {
            return false;
        }
    }
    return true;
}

/**
 * SQL predicate restricting products to items that have a real uploaded photo
 * (either on products.image_url or in product_images gallery). Stock <= 0 stays visible.
 */
function storefrontVisibleProductSql(string $alias = ''): string
{
    $p = $alias !== '' ? rtrim($alias, '.') . '.' : '';
    return "(
        COALESCE({$p}is_pos_visible, 1) = 1
        AND NOT (
            COALESCE({$p}stock, 0) <= 0
            AND (
                {$p}name LIKE '%كيس%' 
                OR {$p}name LIKE '%أكياس%' 
                OR {$p}name LIKE '%اكياس%' 
                OR {$p}name LIKE '%شنط%'
                OR {$p}name LIKE '%شنطة%'
                OR {$p}name LIKE '%كرتونة%'
                OR {$p}name LIKE '%سلوفان%'
            )
        )
        AND (
            (
                {$p}image_url IS NOT NULL
                AND TRIM({$p}image_url) <> ''
                AND LOWER(TRIM({$p}image_url)) NOT LIKE '%placeholder.php%'
                AND LOWER(TRIM({$p}image_url)) NOT LIKE '%/placeholder%'
                AND LOWER(TRIM({$p}image_url)) <> 'placeholder.png'
                AND LOWER(TRIM({$p}image_url)) <> 'placeholder.jpg'
                AND LOWER(TRIM({$p}image_url)) NOT LIKE '%no-image%'
                AND LOWER(TRIM({$p}image_url)) NOT LIKE '%no_image%'
            )
            OR EXISTS (
                SELECT 1 FROM product_images pi_vis
                WHERE pi_vis.product_id = {$p}id
                  AND pi_vis.image_path IS NOT NULL
                  AND TRIM(pi_vis.image_path) <> ''
                  AND LOWER(TRIM(pi_vis.image_path)) NOT LIKE '%placeholder.php%'
                  AND LOWER(TRIM(pi_vis.image_path)) NOT LIKE '%/placeholder%'
                  AND LOWER(TRIM(pi_vis.image_path)) NOT LIKE '%no-image%'
                  AND LOWER(TRIM(pi_vis.image_path)) NOT LIKE '%no_image%'
            )
        )
    )";
}

/**
 * Resolve a product's primary real display image URL (or '' if unpictured).
 */
function resolveProductDisplayImage(PDO $pdo, array $product): string
{
    if (isRealProductImage($product['image_url'] ?? '')) {
        return trim((string)$product['image_url']);
    }
    $pid = (int)($product['id'] ?? 0);
    if ($pid <= 0) {
        return '';
    }
    try {
        $stmt = $pdo->prepare("
            SELECT image_path FROM product_images
            WHERE product_id = ?
              AND image_path IS NOT NULL
              AND TRIM(image_path) <> ''
              AND LOWER(TRIM(image_path)) NOT LIKE '%placeholder.php%'
              AND LOWER(TRIM(image_path)) NOT LIKE '%no-image%'
            ORDER BY is_main DESC, id ASC
            LIMIT 1
        ");
        $stmt->execute([$pid]);
        $gal = $stmt->fetchColumn();
        if (isRealProductImage($gal ? (string)$gal : '')) {
            return trim((string)$gal);
        }
    } catch (Exception $e) {
    }
    return '';
}

/**
 * Keep products.image_url synchronized with product_images (and clear to '' when no real photo exists).
 */
function syncProductPrimaryImage(PDO $pdo, int $product_id): string
{
    if ($product_id <= 0) {
        return '';
    }
    $main_path = '';
    try {
        $stmt = $pdo->prepare("
            SELECT id, image_path FROM product_images
            WHERE product_id = ?
              AND image_path IS NOT NULL
              AND TRIM(image_path) <> ''
              AND LOWER(TRIM(image_path)) NOT LIKE '%placeholder.php%'
              AND LOWER(TRIM(image_path)) NOT LIKE '%no-image%'
            ORDER BY is_main DESC, id ASC
        ");
        $stmt->execute([$product_id]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        foreach ($rows as $row) {
            if (isRealProductImage($row['image_path'] ?? '')) {
                $main_path = trim((string)$row['image_path']);
                break;
            }
        }
    } catch (Exception $e) {
    }

    if ($main_path === '') {
        try {
            $cur = $pdo->prepare("SELECT image_url FROM products WHERE id = ? LIMIT 1");
            $cur->execute([$product_id]);
            $existing = $cur->fetchColumn();
            if (isRealProductImage($existing ? (string)$existing : '')) {
                return trim((string)$existing);
            }
        } catch (Exception $e) {
        }
    }

    $pdo->prepare("UPDATE products SET image_url = ? WHERE id = ?")->execute([$main_path, $product_id]);
    return $main_path;
}

/**
 * Clear both legacy image_url and product_images references for a removed photo, or unlink a file safely.
 */
function safeUnlinkProductImageFile(string $relative_path, string $base_dir): void
{
    $rel = ltrim(str_replace('\\', '/', trim($relative_path)), '/');
    if ($rel === '' || strpos($rel, '..') !== false) {
        return;
    }
    // Only unlink files inside uploads/
    if (strpos($rel, 'uploads/') !== 0) {
        return;
    }
    $full = rtrim($base_dir, '/\\') . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $rel);
    if (is_file($full)) {
        @unlink($full);
    }
}

/**
 * Ensure the inventory_adjustments audit & sync table exists.
 */
function ensureInventoryAdjustmentsSchema(PDO $pdo): void
{
    static $initialized = false;
    if ($initialized) {
        return;
    }
    try {
        $pdo->exec("CREATE TABLE IF NOT EXISTS inventory_adjustments (
            id INT AUTO_INCREMENT PRIMARY KEY,
            product_id INT NOT NULL,
            product_name VARCHAR(255) NOT NULL,
            barcode VARCHAR(100) DEFAULT '',
            local_code VARCHAR(100) DEFAULT '',
            old_stock DECIMAL(12,3) NOT NULL DEFAULT 0.000,
            new_stock DECIMAL(12,3) NOT NULL DEFAULT 0.000,
            diff_qty DECIMAL(12,3) NOT NULL DEFAULT 0.000,
            unit_cost DECIMAL(12,2) NOT NULL DEFAULT 0.00,
            unit_price DECIMAL(12,2) NOT NULL DEFAULT 0.00,
            cost_impact DECIMAL(12,2) NOT NULL DEFAULT 0.00,
            sale_impact DECIMAL(12,2) NOT NULL DEFAULT 0.00,
            reason_code VARCHAR(64) NOT NULL DEFAULT 'count_only',
            reason_label VARCHAR(150) NOT NULL DEFAULT '',
            cash_drawer_delta DECIMAL(12,2) NOT NULL DEFAULT 0.00,
            expense_id INT DEFAULT NULL,
            order_id INT DEFAULT NULL,
            cashier_name VARCHAR(100) DEFAULT 'Admin',
            note TEXT DEFAULT NULL,
            synced TINYINT(1) NOT NULL DEFAULT 0,
            dreamsoft_serial INT DEFAULT NULL,
            dreamsoft_synced_at DATETIME DEFAULT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_prod_created (product_id, created_at),
            INDEX idx_synced (synced)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
    } catch (Exception $e) {
    }
    $initialized = true;
}

/**
 * Normalize inventory adjustment reason metadata given signed stock delta.
 */
function getInventoryAdjustmentReasonMeta(string $reason_code, float $diff): array
{
    $code = trim($reason_code);
    if ($diff < 0) {
        $map = [
            'shortage_loss' => [
                'code' => 'shortage_loss',
                'label' => 'عجز / تالف جرد (خسائر غير نقدية - لا يمس الصندوق)',
                'affects_drawer' => false,
                'drawer_sign' => 0,
                'expense_category' => 'عجز وتالف جرد',
                'expense_method' => 'تسوية جرد (غير نقدي)',
                'sync_via_adjustment' => true,
            ],
            'unrecorded_sale' => [
                'code' => 'unrecorded_sale',
                'label' => 'بيع نقدي لم يُسجل بالفاتورة (+ توريد كاش للصندوق)',
                'affects_drawer' => true,
                'drawer_sign' => 1,
                'sync_via_adjustment' => false, // SalesInvoice handles ItemQty deduction
            ],
            'shortage_cash_expense' => [
                'code' => 'shortage_cash_expense',
                'label' => 'خصم عجز نقدي من عهدة الصندوق (- صرف كاش)',
                'affects_drawer' => true,
                'drawer_sign' => -1,
                'expense_category' => 'عجز جرد نقدي',
                'expense_method' => 'كاش',
                'sync_via_adjustment' => true,
            ],
            'count_only' => [
                'code' => 'count_only',
                'label' => 'تصحيح رصيد دفتري / افتتاحي (تعديل كمية فقط)',
                'affects_drawer' => false,
                'drawer_sign' => 0,
                'sync_via_adjustment' => true,
            ],
        ];
        return $map[$code] ?? $map['shortage_loss'];
    }

    $map = [
        'surplus_gain' => [
            'code' => 'surplus_gain',
            'label' => 'فائض جرد طبيعي (زيادة مخزون - لا يمس الصندوق)',
            'affects_drawer' => false,
            'drawer_sign' => 0,
            'sync_via_adjustment' => true,
        ],
        'surplus_cash_purchase' => [
            'code' => 'surplus_cash_purchase',
            'label' => 'مشتريات بضاعة مدفوعة كاش من الصندوق (- صرف كاش)',
            'affects_drawer' => true,
            'drawer_sign' => -1,
            'expense_category' => 'مشتريات بضاعة (من الجرد)',
            'expense_method' => 'كاش',
            'sync_via_adjustment' => true,
        ],
        'count_only' => [
            'code' => 'count_only',
            'label' => 'تصحيح رصيد دفتري / افتتاحي (تعديل كمية فقط)',
            'affects_drawer' => false,
            'drawer_sign' => 0,
            'sync_via_adjustment' => true,
        ],
    ];
    return $map[$code] ?? $map['surplus_gain'];
}

/**
 * Apply an inventory quantity adjustment, keep Cash in Drawer exact, record expenses/orders
 * as appropriate, and queue DreamSoft synchronization.
 * Note: updates products.stock when $opts['update_product_stock'] is true (default true).
 */
function applyInventoryAdjustment(PDO $pdo, array $product, float $new_stock, array $opts = []): array
{
    ensureInventoryAdjustmentsSchema($pdo);

    $product_id = (int)($product['id'] ?? 0);
    $old_stock = isset($opts['old_stock']) ? (float)$opts['old_stock'] : (float)($product['stock'] ?? 0);
    $diff = round($new_stock - $old_stock, 3);

    if ($product_id <= 0 || abs($diff) < 0.0005) {
        return [
            'adjusted' => false,
            'diff_qty' => 0.0,
            'old_stock' => $old_stock,
            'new_stock' => $new_stock,
            'cash_drawer_delta' => 0.0,
        ];
    }

    $unit_cost = isset($opts['cost']) ? (float)$opts['cost'] : (float)($product['cost'] ?? 0);
    $unit_price = isset($opts['price']) ? (float)$opts['price'] : (float)($product['price'] ?? 0);
    $cashier = trim((string)($opts['cashier_name'] ?? 'كاشير الجرد'));
    if ($cashier === '') {
        $cashier = 'كاشير الجرد';
    }
    $user_note = trim((string)($opts['note'] ?? ''));

    $default_reason = $diff < 0 ? 'shortage_loss' : 'surplus_gain';
    $requested_reason = trim((string)($opts['reason_code'] ?? $default_reason));
    $meta = getInventoryAdjustmentReasonMeta($requested_reason, $diff);
    $reason_code = $meta['code'];

    $abs_qty = abs($diff);
    $cost_impact = round($diff * $unit_cost, 2);
    $sale_impact = round($diff * $unit_price, 2);

    $custom_cash = isset($opts['cash_amount']) && $opts['cash_amount'] !== '' && $opts['cash_amount'] !== null
        ? max(0.0, (float)$opts['cash_amount'])
        : null;

    $today_date = date('Y-m-d');
    $now_dt = date('Y-m-d H:i:s');
    $prod_name = (string)($product['name'] ?? ('منتج #' . $product_id));
    $barcode = (string)($product['barcode'] ?? '');
    $local_code = (string)($product['local_code'] ?? '');

    if (!isset($opts['update_product_stock']) || $opts['update_product_stock']) {
        $pdo->prepare("UPDATE products SET stock = ? WHERE id = ?")->execute([$new_stock, $product_id]);
    }

    $cash_drawer_delta = 0.0;
    $expense_id = null;
    $order_id = null;
    $sync_flag = $meta['sync_via_adjustment'] ? 0 : 1;

    $qty_label = rtrim(rtrim(number_format($abs_qty, 3, '.', ''), '0'), '.');
    $diff_signed_str = ($diff > 0 ? '+' : '-') . $qty_label;
    $base_audit_note = "جرد [{$prod_name}] من {$old_stock} إلى {$new_stock} ({$diff_signed_str})";
    if ($user_note !== '') {
        $base_audit_note .= " - {$user_note}";
    }

    if ($reason_code === 'unrecorded_sale' && $diff < 0) {
        $sale_amount = $custom_cash !== null && $custom_cash > 0
            ? round($custom_cash, 2)
            : round($abs_qty * $unit_price, 2);
        $eff_unit_price = $abs_qty > 0 ? round($sale_amount / $abs_qty, 2) : $unit_price;

        if ($sale_amount > 0) {
            $items_arr = [[
                'id' => $product_id,
                'product_id' => $product_id,
                'item_code' => $local_code !== '' ? $local_code : '',
                'local_code' => $local_code,
                'barcode' => $barcode !== '' ? $barcode : $local_code,
                'name' => $prod_name,
                'qty' => $abs_qty,
                'price' => $eff_unit_price,
                'cost' => $unit_cost,
                'total' => $sale_amount,
            ]];
            $details_str = "{$prod_name} × {$qty_label} = {$sale_amount} ج.م (تسوية جرد: مبيعات غير مسجلة)";
            if ($user_note !== '') {
                $details_str .= " | {$user_note}";
            }

            $ord_stmt = $pdo->prepare("INSERT INTO orders (
                customer_name, customer_phone, customer_address, order_details,
                total_price, discount_amount, shipping_cost, payment_method, payment_status,
                status, source, cashier_name, delivery_person, delivery_fee, created_at, synced,
                items_json, order_type, invoice_barcode
            ) VALUES (?, ?, ?, ?, ?, 0, 0, 'كاش', 'مدفوع', 'مكتمل', 'pos_inventory_unrecorded', ?, '', 0, ?, 0, ?, 'hall', NULL)");
            $ord_stmt->execute([
                'مبيعات جرد غير مسجلة',
                '',
                '',
                $details_str,
                $sale_amount,
                $cashier,
                $now_dt,
                json_encode($items_arr, JSON_UNESCAPED_UNICODE),
            ]);
            $order_id = (int)$pdo->lastInsertId();
            $pdo->prepare("UPDATE orders SET invoice_barcode = ? WHERE id = ?")->execute(["INV-ADJ-{$order_id}", $order_id]);
            $cash_drawer_delta = $sale_amount;
        }
    } elseif ($reason_code === 'shortage_loss' && $diff < 0) {
        $loss_amount = round($abs_qty * ($unit_cost > 0 ? $unit_cost : 0.0), 2);
        if ($loss_amount > 0) {
            $exp_note = "[تسوية جرد غير نقدية - خسائر تالف/عجز] {$base_audit_note} | تكلفة الوحدة: {$unit_cost} ج.م (لا يؤثر على الصندوق)";
            $exp_stmt = $pdo->prepare("INSERT INTO expenses (category, amount, note, date, partner_name, payment_method, synced, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)");
            $exp_stmt->execute([
                $meta['expense_category'],
                $loss_amount,
                $exp_note,
                $today_date,
                $cashier,
                $meta['expense_method'],
                $now_dt,
            ]);
            $expense_id = (int)$pdo->lastInsertId();
        }
    } elseif ($reason_code === 'shortage_cash_expense' && $diff < 0) {
        $fallback_unit = $unit_cost > 0 ? $unit_cost : $unit_price;
        $cash_out = $custom_cash !== null && $custom_cash > 0
            ? round($custom_cash, 2)
            : round($abs_qty * $fallback_unit, 2);
        if ($cash_out > 0) {
            $exp_note = "[عجز جرد نقدي من الصندوق] {$base_audit_note}";
            $exp_stmt = $pdo->prepare("INSERT INTO expenses (category, amount, note, date, partner_name, payment_method, synced, created_at) VALUES (?, ?, ?, ?, ?, 'كاش', 1, ?)");
            $exp_stmt->execute([
                $meta['expense_category'],
                $cash_out,
                $exp_note,
                $today_date,
                $cashier,
                $now_dt,
            ]);
            $expense_id = (int)$pdo->lastInsertId();
            $cash_drawer_delta = -$cash_out;
        }
    } elseif ($reason_code === 'surplus_cash_purchase' && $diff > 0) {
        $fallback_unit = $unit_cost > 0 ? $unit_cost : $unit_price;
        $cash_out = $custom_cash !== null && $custom_cash > 0
            ? round($custom_cash, 2)
            : round($abs_qty * $fallback_unit, 2);
        if ($cash_out > 0) {
            $exp_note = "[شراء بضاعة كاش من الصندوق - جرد] {$base_audit_note}";
            $exp_stmt = $pdo->prepare("INSERT INTO expenses (category, amount, note, date, partner_name, payment_method, synced, created_at) VALUES (?, ?, ?, ?, ?, 'كاش', 1, ?)");
            $exp_stmt->execute([
                $meta['expense_category'],
                $cash_out,
                $exp_note,
                $today_date,
                $cashier,
                $now_dt,
            ]);
            $expense_id = (int)$pdo->lastInsertId();
            $cash_drawer_delta = -$cash_out;
        }
    }

    $adj_stmt = $pdo->prepare("INSERT INTO inventory_adjustments (
        product_id, product_name, barcode, local_code,
        old_stock, new_stock, diff_qty, unit_cost, unit_price, cost_impact, sale_impact,
        reason_code, reason_label, cash_drawer_delta, expense_id, order_id, cashier_name, note, synced, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
    $adj_stmt->execute([
        $product_id,
        $prod_name,
        $barcode,
        $local_code,
        $old_stock,
        $new_stock,
        $diff,
        $unit_cost,
        $unit_price,
        $cost_impact,
        $sale_impact,
        $reason_code,
        $meta['label'],
        $cash_drawer_delta,
        $expense_id,
        $order_id,
        $cashier,
        $user_note !== '' ? $user_note : $base_audit_note,
        $sync_flag,
        $now_dt,
    ]);
    $adjustment_id = (int)$pdo->lastInsertId();

    return [
        'adjusted' => true,
        'adjustment_id' => $adjustment_id,
        'reason_code' => $reason_code,
        'reason_label' => $meta['label'],
        'old_stock' => $old_stock,
        'new_stock' => $new_stock,
        'diff_qty' => $diff,
        'cost_impact' => $cost_impact,
        'sale_impact' => $sale_impact,
        'cash_drawer_delta' => $cash_drawer_delta,
        'expense_id' => $expense_id,
        'order_id' => $order_id,
        'queued_for_dreamsoft' => ($sync_flag === 0),
    ];
}

/**
 * Ensures the product visibility flag and cleanup sync queue schema exist.
 */
function ensureProductCleanupQueueSchema(PDO $pdo): void
{
    static $initialized = false;
    if ($initialized) {
        return;
    }
    $initialized = true;

    try {
        $colCheck = $pdo->query("SHOW COLUMNS FROM products LIKE 'is_pos_visible'");
        if ($colCheck && !$colCheck->fetch()) {
            $pdo->exec("ALTER TABLE products ADD COLUMN is_pos_visible TINYINT(1) NOT NULL DEFAULT 1");
            try {
                $pdo->exec("ALTER TABLE products ADD INDEX idx_products_pos_visible (is_pos_visible)");
            } catch (Throwable $e) {
                // Ignore if index creation races or already exists.
            }
        }
    } catch (Throwable $e) {
        // Non-fatal if schema already initialized concurrently.
    }

    try {
        $pdo->exec("
            CREATE TABLE IF NOT EXISTS product_cleanup_queue (
                id INT AUTO_INCREMENT PRIMARY KEY,
                product_id INT NOT NULL,
                local_code VARCHAR(64) DEFAULT NULL,
                barcode VARCHAR(100) DEFAULT NULL,
                product_name VARCHAR(255) NOT NULL DEFAULT '',
                action_type VARCHAR(20) NOT NULL,
                reason VARCHAR(255) DEFAULT '',
                status VARCHAR(20) NOT NULL DEFAULT 'pending',
                result_note VARCHAR(500) DEFAULT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                processed_at TIMESTAMP NULL DEFAULT NULL,
                KEY idx_pcq_status_id (status, id),
                KEY idx_pcq_product_id (product_id),
                KEY idx_pcq_local_code (local_code)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        ");
    } catch (Throwable $e) {
        // Non-fatal if table creation races.
    }
}

/**
 * Updates immediate POS/storefront visibility and queues DreamSoft sync cleanup action.
 */
function queueProductCleanupAction(PDO $pdo, array $product, string $action_type, string $reason = ''): bool
{
    ensureProductCleanupQueueSchema($pdo);

    $action_type = strtolower(trim($action_type));
    if (!in_array($action_type, ['archive', 'delete', 'restore'], true)) {
        return false;
    }

    $product_id = (int)($product['id'] ?? 0);
    if ($product_id <= 0) {
        return false;
    }

    $local_code = trim((string)($product['local_code'] ?? ''));
    $barcode = trim((string)($product['barcode'] ?? ''));
    $product_name = trim((string)($product['name'] ?? ''));

    $new_visibility = ($action_type === 'restore') ? 1 : 0;
    $upd = $pdo->prepare("UPDATE products SET is_pos_visible = ? WHERE id = ?");
    $upd->execute([$new_visibility, $product_id]);

    // Supersede older pending cleanup commands for the same product so latest intent wins.
    $sup = $pdo->prepare("
        UPDATE product_cleanup_queue
        SET status = 'superseded',
            result_note = 'تم استبدال الطلب بأحدث إجراء',
            processed_at = NOW()
        WHERE product_id = ? AND status = 'pending'
    ");
    $sup->execute([$product_id]);

    $ins = $pdo->prepare("
        INSERT INTO product_cleanup_queue (product_id, local_code, barcode, product_name, action_type, reason, status)
        VALUES (?, ?, ?, ?, ?, ?, 'pending')
    ");
    $ins->execute([
        $product_id,
        ($local_code !== '' ? $local_code : null),
        ($barcode !== '' ? $barcode : null),
        mb_substr($product_name, 0, 255),
        $action_type,
        mb_substr(trim($reason), 0, 255),
    ]);

    return true;
}
if (!function_exists('buildInvoiceSearchQuery')) {
    /**
     * Build parameterized SQL WHERE clauses, bindings, and ORDER BY for invoice search/filtering.
     */
    function buildInvoiceSearchQuery(array $input): array {
        $search = trim((string)($input['search'] ?? $input['q'] ?? ''));
        $from_date = trim((string)($input['from_date'] ?? ''));
        $to_date = trim((string)($input['to_date'] ?? ''));
        $status = trim((string)($input['status'] ?? ''));
        $payment_type = trim((string)($input['payment_type'] ?? ''));
        $payment_method = trim((string)($input['payment_method'] ?? ''));
        $order_type = trim((string)($input['order_type'] ?? ''));
        $source = trim((string)($input['source'] ?? ''));
        $cashier = trim((string)($input['cashier'] ?? ''));
        $min_total = trim((string)($input['min_total'] ?? ''));
        $max_total = trim((string)($input['max_total'] ?? ''));
        $sort_by = trim((string)($input['sort_by'] ?? 'newest'));

        $valid_date = static function (string $d): string {
            return preg_match('/^\d{4}-\d{2}-\d{2}$/', $d) ? $d : '';
        };
        $from_date = $valid_date($from_date);
        $to_date = $valid_date($to_date);
        if ($from_date !== '' && $to_date !== '' && $from_date > $to_date) {
            [$from_date, $to_date] = [$to_date, $from_date];
        }

        $where = [];
        $params = [];

        if ($status === 'all') {
            // Include all statuses including cancelled
        } elseif ($status === 'cancelled' || $status === 'ملغي') {
            $where[] = "status = 'ملغي'";
        } elseif ($status !== '') {
            $where[] = "status = ?";
            $params[] = $status;
        } else {
            $where[] = "(status != 'ملغي' OR status IS NULL)";
        }

        if ($search !== '') {
            $search_clean = ltrim($search, '# ');
            $search_term = $search_clean !== '' ? $search_clean : $search;
            $search_like = '%' . $search_term . '%';
            $or_parts = [
                "invoice_barcode LIKE ?",
                "customer_name LIKE ?",
                "customer_phone LIKE ?",
                "customer_address LIKE ?",
                "cashier_name LIKE ?",
                "delivery_person LIKE ?",
                "LOCATE(?, order_details) > 0",
                "LOCATE(?, items_json) > 0"
            ];
            $params = array_merge($params, array_fill(0, 6, $search_like), [$search_term, $search_term]);

            $encoded = json_encode($search_term);
            if (is_string($encoded) && strlen($encoded) > 2) {
                $inner = substr($encoded, 1, -1);
                if ($inner !== $search_term) {
                    $or_parts[] = "LOCATE(?, items_json) > 0";
                    $params[] = $inner;
                }
            }

            if (preg_match('/^(?:#|inv[-_\s]*)?\d+$/i', $search)) {
                $num_clean = preg_replace('/[^0-9]/', '', $search);
                if ($num_clean !== '') {
                    $or_parts[] = "invoice_barcode LIKE ?";
                    $params[] = "%{$num_clean}%";
                    $or_parts[] = "id = ?";
                    $params[] = (int)$num_clean;
                }
            }

            $where[] = '(' . implode(' OR ', $or_parts) . ')';
        }

        if ($from_date !== '') {
            $where[] = "created_at >= ?";
            $params[] = $from_date . " 00:00:00";
        }
        if ($to_date !== '') {
            $where[] = "created_at <= ?";
            $params[] = $to_date . " 23:59:59";
        }

        if ($payment_type !== '' && $payment_type !== 'all') {
            $payment_map = [
                'cash'     => "(payment_method IN ('نقدي', 'كاش', 'cash') OR payment_method LIKE '%نقدي%' OR payment_method LIKE '%كاش%' OR payment_method IS NULL OR payment_method = '')",
                'credit'   => "(payment_method LIKE '%آجل%' OR payment_method LIKE '%اجل%' OR payment_method LIKE '%دين%' OR payment_method LIKE '%حساب عميل%' OR LOWER(payment_method) LIKE '%credit%' OR LOWER(payment_method) LIKE '%deferred%')",
                'instapay' => "(payment_method LIKE '%إنستاباي%' OR payment_method LIKE '%انستاباي%' OR LOWER(payment_method) LIKE '%instapay%' OR payment_method LIKE '%مدفوع مسبق%')",
                'card'     => "(payment_method LIKE '%فيزا%' OR payment_method LIKE '%بطاقة%' OR payment_method LIKE '%شبكة%' OR LOWER(payment_method) LIKE '%card%' OR LOWER(payment_method) LIKE '%visa%')"
            ];
            if (isset($payment_map[$payment_type])) {
                $where[] = $payment_map[$payment_type];
            }
        } elseif ($payment_method !== '' && $payment_method !== 'all') {
            $where[] = "payment_method LIKE ?";
            $params[] = "%{$payment_method}%";
        }

        if ($order_type === 'hall') {
            $where[] = "(order_type = 'hall' OR order_type IS NULL OR order_type = '')";
        } elseif ($order_type === 'delivery') {
            $where[] = "(order_type = 'delivery' OR COALESCE(delivery_fee, 0) > 0)";
        } elseif ($order_type !== '' && $order_type !== 'all') {
            $where[] = "order_type = ?";
            $params[] = $order_type;
        }

        if ($source !== '' && $source !== 'all') {
            $where[] = "source = ?";
            $params[] = $source;
        }

        if ($cashier !== '' && $cashier !== 'all') {
            $where[] = "cashier_name LIKE ?";
            $params[] = "%{$cashier}%";
        }

        if ($min_total !== '' && is_numeric($min_total)) {
            $where[] = "total_price >= ?";
            $params[] = (float)$min_total;
        }
        if ($max_total !== '' && is_numeric($max_total)) {
            $where[] = "total_price <= ?";
            $params[] = (float)$max_total;
        }

        $sort_map = [
            'newest'  => 'created_at DESC, id DESC',
            'oldest'  => 'created_at ASC, id ASC',
            'highest' => 'total_price DESC, created_at DESC, id DESC',
            'lowest'  => 'total_price ASC, created_at DESC, id DESC'
        ];
        $order_by = $sort_map[$sort_by] ?? $sort_map['newest'];
        $where_sql = !empty($where) ? implode(' AND ', $where) : '1=1';

        return [
            'where_sql' => $where_sql,
            'params'    => $params,
            'order_by'  => $order_by,
            'filters'   => compact(
                'search', 'from_date', 'to_date', 'status',
                'payment_type', 'payment_method', 'order_type',
                'source', 'cashier', 'min_total', 'max_total', 'sort_by'
            )
        ];
    }
}

if (!function_exists('parseOrderItemsForDisplay')) {
    /**
     * Normalize items_json from an orders row into uniform display entries.
     */
    function parseOrderItemsForDisplay(array $row): array {
        if (empty($row['items_json'])) {
            return [];
        }
        $decoded = json_decode((string)$row['items_json'], true);
        if (!is_array($decoded)) {
            return [];
        }
        $out = [];
        foreach ($decoded as $it) {
            if (!is_array($it)) {
                continue;
            }
            $qty = (float)($it['qty'] ?? $it['quantity'] ?? 1);
            $price = (float)($it['price'] ?? $it['unit_price'] ?? 0);
            $total = isset($it['total']) ? (float)$it['total'] : ($price * $qty);
            $out[] = [
                'name'  => (string)($it['name'] ?? $it['product_name'] ?? 'صنف'),
                'qty'   => $qty,
                'price' => $price,
                'total' => $total,
            ];
        }
        return $out;
    }
}
