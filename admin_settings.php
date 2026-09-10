<?php
require_once 'config.php';

// التحقق من رتبة المدير
if (!isAdmin()) {
    header("Location: login.php");
    exit;
}

// 0.1 تحديث هوية المتجر واللوجو والعملة
if (isset($_POST['update_general_settings'])) {
    $store_name = trim($_POST['store_name'] ?? '');
    $store_tagline = trim($_POST['store_tagline'] ?? '');
    $store_description = trim($_POST['store_description'] ?? '');
    $store_currency = trim($_POST['store_currency'] ?? 'ج.م');
    
    $text_settings = [
        'store_name' => $store_name,
        'store_tagline' => $store_tagline,
        'store_description' => $store_description,
        'store_currency' => $store_currency,
    ];
    
    foreach ($text_settings as $key => $val) {
        $stmt = $pdo->prepare("SELECT COUNT(*) FROM settings WHERE key_name = ?");
        $stmt->execute([$key]);
        if ($stmt->fetchColumn() > 0) {
            $pdo->prepare("UPDATE settings SET setting_value = ? WHERE key_name = ?")->execute([$val, $key]);
        } else {
            $pdo->prepare("INSERT INTO settings (key_name, setting_value) VALUES (?, ?)")->execute([$key, $val]);
        }
    }
    
    // رفع شعار المتجر (Logo)
    if (isset($_FILES['store_logo']) && $_FILES['store_logo']['error'] == 0) {
        $logo_url = uploadImage($_FILES['store_logo']);
        if ($logo_url) {
            $pdo->prepare("UPDATE settings SET setting_value = ? WHERE key_name = 'store_logo'")->execute([$logo_url]);
        }
    }
    
    // رفع أيقونة المتجر (Favicon)
    if (isset($_FILES['store_favicon']) && $_FILES['store_favicon']['error'] == 0) {
        $fav_url = uploadImage($_FILES['store_favicon']);
        if ($fav_url) {
            $pdo->prepare("UPDATE settings SET setting_value = ? WHERE key_name = 'store_favicon'")->execute([$fav_url]);
        }
    }
    
    header("Location: admin_settings.php?tab=general&msg=general_updated");
    exit;
}

// 0.2 حذف شعار المتجر
if (isset($_GET['action']) && $_GET['action'] == 'remove_logo') {
    $pdo->prepare("UPDATE settings SET setting_value = '' WHERE key_name = 'store_logo'")->execute();
    header("Location: admin_settings.php?tab=general&msg=logo_removed");
    exit;
}

// 0.3 تغيير كلمة مرور المسؤول الأساسي (Master Admin Password)
if (isset($_POST['update_admin_password'])) {
    $current_pass = $_POST['current_password'] ?? '';
    $new_pass = $_POST['new_password'] ?? '';
    $confirm_pass = $_POST['confirm_password'] ?? '';
    $admin_username = $_SESSION['username'] ?? 'admin';
    
    // جلب مستخدم المدير
    $stmt = $pdo->prepare("SELECT * FROM users WHERE username = ? OR role = 'admin' ORDER BY id ASC LIMIT 1");
    $stmt->execute([$admin_username]);
    $admin_user = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$admin_user) {
        header("Location: admin_settings.php?tab=security&error=user_not_found");
        exit;
    }
    
    // التحقق من كلمة المرور الحالية
    if (!password_verify($current_pass, $admin_user['password'])) {
        header("Location: admin_settings.php?tab=security&error=wrong_current_password");
        exit;
    }
    
    if (strlen($new_pass) < 6) {
        header("Location: admin_settings.php?tab=security&error=password_too_short");
        exit;
    }
    
    if ($new_pass !== $confirm_pass) {
        header("Location: admin_settings.php?tab=security&error=password_mismatch");
        exit;
    }
    
    $new_hash = password_hash($new_pass, PASSWORD_DEFAULT);
    $upd_stmt = $pdo->prepare("UPDATE users SET password = ? WHERE id = ?");
    $upd_stmt->execute([$new_hash, $admin_user['id']]);
    
    header("Location: admin_settings.php?tab=security&msg=password_updated");
    exit;
}

// 0.4 تحديث ألوان وتصميم المتجر (Theme Palette)
if (isset($_POST['update_theme_colors'])) {
    $color_keys = [
        'theme_primary_color',
        'theme_secondary_color',
        'theme_accent_color',
        'theme_header_bg',
        'theme_header_text',
        'theme_body_bg',
        'theme_card_bg',
        'theme_btn_color',
        'theme_btn_text'
    ];
    
    foreach ($color_keys as $ck) {
        $cval = trim($_POST[$ck] ?? '');
        if (!empty($cval)) {
            $stmt = $pdo->prepare("SELECT COUNT(*) FROM settings WHERE key_name = ?");
            $stmt->execute([$ck]);
            if ($stmt->fetchColumn() > 0) {
                $pdo->prepare("UPDATE settings SET setting_value = ? WHERE key_name = ?")->execute([$cval, $ck]);
            } else {
                $pdo->prepare("INSERT INTO settings (key_name, setting_value) VALUES (?, ?)")->execute([$ck, $cval]);
            }
        }
    }
    
    header("Location: admin_settings.php?tab=colors&msg=colors_updated");
    exit;
}

// 1. تحديث شريط التنبيهات
if (isset($_POST['update_announcement'])) {
    $ann_text = trim($_POST['announcement_bar']);
    $pdo->prepare("UPDATE settings SET setting_value=? WHERE key_name='announcement_bar'")->execute([$ann_text]);
    header("Location: admin_settings.php?tab=theme&msg=announcement_updated");
    exit;
}

// 1.1. تحديث إعدادات ميتا بكسل
if (isset($_POST['update_meta_pixel'])) {
    $pixel_id = trim($_POST['meta_pixel_id']);
    $pixel_enabled = isset($_POST['meta_pixel_enabled']) ? '1' : '0';
    
    $stmt1 = $pdo->prepare("SELECT COUNT(*) FROM settings WHERE key_name='meta_pixel_id'");
    $stmt1->execute();
    if ($stmt1->fetchColumn() > 0) {
        $pdo->prepare("UPDATE settings SET setting_value=? WHERE key_name='meta_pixel_id'")->execute([$pixel_id]);
    } else {
        $pdo->prepare("INSERT INTO settings (key_name, setting_value) VALUES ('meta_pixel_id', ?)")->execute([$pixel_id]);
    }
    
    $stmt2 = $pdo->prepare("SELECT COUNT(*) FROM settings WHERE key_name='meta_pixel_enabled'");
    $stmt2->execute();
    if ($stmt2->fetchColumn() > 0) {
        $pdo->prepare("UPDATE settings SET setting_value=? WHERE key_name='meta_pixel_enabled'")->execute([$pixel_enabled]);
    } else {
        $pdo->prepare("INSERT INTO settings (key_name, setting_value) VALUES ('meta_pixel_enabled', ?)")->execute([$pixel_enabled]);
    }

    header("Location: admin_settings.php?tab=meta&msg=meta_updated");
    exit;
}

// 1.2. تحديث إعدادات بوابات الدفع الإلكتروني (مصر فقط)
if (isset($_POST['update_payment_settings'])) {
    $pay_settings = [
        'cod_enabled' => isset($_POST['cod_enabled']) ? '1' : '0',
        'vodafone_cash_enabled' => isset($_POST['vodafone_cash_enabled']) ? '1' : '0',
        'vodafone_cash_number' => trim($_POST['vodafone_cash_number'] ?? ''),
        'instapay_enabled' => isset($_POST['instapay_enabled']) ? '1' : '0',
        'instapay_address' => trim($_POST['instapay_address'] ?? ''),
        'instapay_name' => trim($_POST['instapay_name'] ?? ''),
        'cham_cash_enabled' => '0',
        'cham_cash_number' => '',
        'cham_cash_name' => '',
        'syriatel_cash_number' => '',
        'paypal_enabled' => '0',
        'paypal_email' => '',
        'paypal_client_id' => '',
        'paymob_enabled' => isset($_POST['paymob_enabled']) ? '1' : '0',
        'paymob_api_key' => trim($_POST['paymob_api_key'] ?? ''),
        'paymob_integration_id_card' => trim($_POST['paymob_integration_id_card'] ?? ''),
        'paymob_integration_id_wallet' => trim($_POST['paymob_integration_id_wallet'] ?? ''),
        'paymob_iframe_id' => trim($_POST['paymob_iframe_id'] ?? '')
    ];
    
    foreach ($pay_settings as $key => $val) {
        $stmt = $pdo->prepare("SELECT COUNT(*) FROM settings WHERE key_name = ?");
        $stmt->execute([$key]);
        if ($stmt->fetchColumn() > 0) {
            $pdo->prepare("UPDATE settings SET setting_value = ? WHERE key_name = ?")->execute([$val, $key]);
        } else {
            $pdo->prepare("INSERT INTO settings (key_name, setting_value) VALUES (?, ?)")->execute([$key, $val]);
        }
    }

    header("Location: admin_settings.php?tab=payments&msg=payments_updated");
    exit;
}

// 1.25 تحديث إعدادات الشحن الذكي بالكيلومتر لمناطق القاهرة الكبرى
if (isset($_POST['update_km_shipping_settings'])) {
    $enable_km = isset($_POST['enable_km_shipping']) ? '1' : '0';
    $store_lat = trim($_POST['store_lat'] ?? '30.0444');
    $store_lng = trim($_POST['store_lng'] ?? '31.2357');
    $store_address = trim($_POST['store_address_name'] ?? '');
    $km_rate = (float)($_POST['km_rate'] ?? 2.00);
    $km_base_min_price = (float)($_POST['km_base_min_price'] ?? 25.00);
    $selected_govs = isset($_POST['km_govs']) && is_array($_POST['km_govs']) ? array_values($_POST['km_govs']) : ['القاهرة', 'الجيزة', '6 أكتوبر', 'الشيخ زايد'];
    $km_govs_json = json_encode($selected_govs, JSON_UNESCAPED_UNICODE);

    $km_settings = [
        'enable_km_shipping' => $enable_km,
        'store_lat' => $store_lat,
        'store_lng' => $store_lng,
        'store_address_name' => $store_address,
        'km_rate' => $km_rate,
        'km_base_min_price' => $km_base_min_price,
        'km_shipping_govs' => $km_govs_json
    ];

    foreach ($km_settings as $k => $v) {
        $stmt = $pdo->prepare("SELECT COUNT(*) FROM settings WHERE key_name = ?");
        $stmt->execute([$k]);
        if ($stmt->fetchColumn() > 0) {
            $pdo->prepare("UPDATE settings SET setting_value = ? WHERE key_name = ?")->execute([$v, $k]);
        } else {
            $pdo->prepare("INSERT INTO settings (key_name, setting_value) VALUES (?, ?)")->execute([$k, $v]);
        }
    }

    header("Location: admin_settings.php?tab=shipping&msg=km_shipping_updated");
    exit;
}

// 1.3. تحديث أسعار وحالة مناطق ومحافظات الشحن في مصر
if (isset($_POST['update_shipping_zones'])) {
    $costs = isset($_POST['gov_cost']) && is_array($_POST['gov_cost']) ? $_POST['gov_cost'] : [];
    $active_status = isset($_POST['gov_active']) ? $_POST['gov_active'] : [];

    $stmt_update = $pdo->prepare("UPDATE shipping_zones SET cost = ?, is_active = ?, currency_symbol = 'ج.م', country_name = 'مصر', country_code = 'EG' WHERE id = ?");
    foreach($costs as $id => $cost) {
        $is_active = isset($active_status[$id]) ? 1 : 0;
        $stmt_update->execute([$cost, $is_active, $id]);
    }
    header("Location: admin_settings.php?tab=shipping&msg=shipping_updated");
    exit;
}

// 1.4. تطبيق سعر شحن موحد على جميع محافظات مصر
if (isset($_POST['mass_update_country_cost'])) {
    $mass_cost = (float)($_POST['mass_cost'] ?? 0);
    $stmt_mass = $pdo->prepare("UPDATE shipping_zones SET cost = ? WHERE country_name = 'مصر' OR country_name IS NULL");
    $stmt_mass->execute([$mass_cost]);
    header("Location: admin_settings.php?tab=shipping&msg=mass_updated");
    exit;
}

// 1.5. إضافة محافظة أو مدينة مصرية جديدة
if (isset($_POST['add_new_governorate'])) {
    $new_gov_name = trim($_POST['new_gov_name'] ?? '');
    $new_gov_cost = (float)($_POST['new_gov_cost'] ?? 50.00);

    if (!empty($new_gov_name)) {
        $stmt_check = $pdo->prepare("SELECT COUNT(*) FROM shipping_zones WHERE gov_name = ?");
        $stmt_check->execute([$new_gov_name]);
        if ($stmt_check->fetchColumn() == 0) {
            $pdo->prepare("INSERT INTO shipping_zones (country_name, country_code, currency_symbol, gov_name, cost, is_active) VALUES ('مصر', 'EG', 'ج.م', ?, ?, 1)")
                ->execute([$new_gov_name, $new_gov_cost]);
        }
    }
    header("Location: admin_settings.php?tab=shipping&msg=gov_added");
    exit;
}

// 1.6. حذف محافظة
if (isset($_GET['action']) && $_GET['action'] === 'delete_gov' && isset($_GET['gov_id'])) {
    $gov_id = (int)$_GET['gov_id'];
    $pdo->prepare("DELETE FROM shipping_zones WHERE id = ?")->execute([$gov_id]);
    header("Location: admin_settings.php?tab=shipping&msg=gov_deleted");
    exit;
}

$shipping_zones = $pdo->query("SELECT * FROM shipping_zones WHERE country_name = 'مصر' OR country_name IS NULL ORDER BY id ASC")->fetchAll(PDO::FETCH_ASSOC);

// 2. إضافة صورة جديدة للسلايدر
if (isset($_POST['add_slide'])) {
    $title = trim($_POST['slide_title']);
    $subtitle = trim($_POST['slide_subtitle']);
    $link = trim($_POST['slide_link']);
    $sort = (int)$_POST['slide_sort'];
    
    $slide_img = uploadImage($_FILES['slide_file']);
    if ($slide_img) {
        $pdo->prepare("INSERT INTO home_slides (image_url, title, subtitle, link_url, sort_order) VALUES (?, ?, ?, ?, ?)")
            ->execute([$slide_img, $title, $subtitle, $link, $sort]);
        header("Location: admin_settings.php?tab=theme&msg=slide_added");
        exit;
    } else {
        header("Location: admin_settings.php?tab=theme&error=upload_failed");
        exit;
    }
}

// 3. حذف شريحة من السلايدر
if (isset($_GET['action']) && $_GET['action'] == 'delete_slide' && isset($_GET['id'])) {
    $slide_id = (int)$_GET['id'];
    $stmt = $pdo->prepare("SELECT image_url FROM home_slides WHERE id = ?");
    $stmt->execute([$slide_id]);
    $img_path = $stmt->fetchColumn();
    
    if ($img_path) {
        if (file_exists($img_path) && strpos($img_path, 'uploads/') !== false) {
            unlink($img_path);
        }
        $pdo->prepare("DELETE FROM home_slides WHERE id = ?")->execute([$slide_id]);
        header("Location: admin_settings.php?tab=theme&msg=slide_deleted");
        exit;
    }
}

// 4. إضافة قسم جديد للمتجر
if (isset($_POST['add_category'])) {
    $cat_name = trim($_POST['cat_name']);
    $parent_id = !empty($_POST['parent_id']) && $_POST['parent_id'] !== 'none' ? (int)$_POST['parent_id'] : null;
    $cat_img = uploadImage($_FILES['cat_image']) ?: 'https://placehold.co/600x800/f8f5f0/D4AF37?text=';
    
    try {
        $pdo->prepare("INSERT INTO categories (name, image_url, parent_id) VALUES (?, ?, ?)")->execute([$cat_name, $cat_img, $parent_id]);
        header("Location: admin_settings.php?tab=categories&msg=cat_added");
        exit;
    } catch (PDOException $e) {
        header("Location: admin_settings.php?tab=categories&error=cat_duplicate");
        exit;
    }
}

// 5. تعديل القسم المحدد
if (isset($_POST['edit_category'])) {
    $cat_id = (int)$_POST['cat_id'];
    $newName = trim($_POST['cat_name']);
    $parent_id = !empty($_POST['parent_id']) && $_POST['parent_id'] !== 'none' ? (int)$_POST['parent_id'] : null;
    
    $oldName_stmt = $pdo->prepare("SELECT name FROM categories WHERE id=?");
    $oldName_stmt->execute([$cat_id]);
    $oldName = $oldName_stmt->fetchColumn();
    
    $newImg = uploadImage($_FILES['cat_image']);
    if ($newImg) {
        $pdo->prepare("UPDATE categories SET name=?, image_url=?, parent_id=? WHERE id=?")->execute([$newName, $newImg, $parent_id, $cat_id]);
    } else {
        $pdo->prepare("UPDATE categories SET name=?, parent_id=? WHERE id=?")->execute([$newName, $parent_id, $cat_id]);
    }
    
    if ($oldName && $oldName !== $newName) {
        $pdo->prepare("UPDATE products SET category=? WHERE category=?")->execute([$newName, $oldName]);
        $pdo->prepare("UPDATE products SET sub_category=? WHERE sub_category=?")->execute([$newName, $oldName]);
    }
    header("Location: admin_settings.php?tab=categories&msg=cat_edited");
    exit;
}

// 6. حذف القسم
if (isset($_GET['action']) && $_GET['action'] == 'delete_category' && isset($_GET['id'])) {
    $cat_id = (int)$_GET['id'];
    $stmt = $pdo->prepare("SELECT name, parent_id FROM categories WHERE id = ?");
    $stmt->execute([$cat_id]);
    $cat_to_del = $stmt->fetch(PDO::FETCH_ASSOC);
    if ($cat_to_del) {
        $c_name = $cat_to_del['name'];
        if (!empty($cat_to_del['parent_id'])) {
            // Subcategory: clear sub_category in products
            $pdo->prepare("UPDATE products SET sub_category = NULL WHERE sub_category = ?")->execute([$c_name]);
            $pdo->prepare("DELETE FROM categories WHERE id = ?")->execute([$cat_id]);
        } else {
            // Main category: reassign products to 'عام' and delete subcategories
            $pdo->prepare("UPDATE products SET category = 'عام', sub_category = NULL WHERE category = ?")->execute([$c_name]);
            $pdo->prepare("DELETE FROM categories WHERE parent_id = ?")->execute([$cat_id]);
            $pdo->prepare("DELETE FROM categories WHERE id = ?")->execute([$cat_id]);
        }
    }
    header("Location: admin_settings.php?tab=categories&msg=cat_deleted");
    exit;
}

// إعادة جلب الإعدادات المحدثة
$settings = [];
$stmt = $pdo->query("SELECT * FROM settings");
while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) { $settings[$row['key_name']] = $row['setting_value']; }

$slides = $pdo->query("SELECT * FROM home_slides ORDER BY sort_order ASC, id ASC")->fetchAll(PDO::FETCH_ASSOC);

include 'header.php';
include 'admin_nav.php';

$active_tab = $_GET['tab'] ?? (isset($_GET['edit_cat_id']) ? 'categories' : 'general');
?>

<div class="container mx-auto px-4 md:px-8 py-10 max-w-6xl animate-fade-in">
    <div class="mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-royal-gold/10 pb-4">
        <div>
            <h2 class="text-2xl font-serif font-bold text-royal-dark">
                <?php 
                if ($active_tab === 'general') echo '🏛️ هوية المتجر والشعار والعملة';
                elseif ($active_tab === 'security') echo '🔐 كلمة مرور المسؤول والحساب';
                elseif ($active_tab === 'colors') echo '🎨 ألوان وهوية تصميم المتجر (Theme Palette)';
                elseif ($active_tab === 'payments') echo '💳 وسائل وبوابات الدفع الإلكتروني';
                elseif ($active_tab === 'shipping') echo '🚚 مناطق ومصاريف الشحن والتوصيل';
                elseif ($active_tab === 'theme') echo '🖼️ إعدادات السلايدر وشريط الإعلانات';
                elseif ($active_tab === 'categories') echo '🏷️ إدارة الأقسام والتصنيفات';
                elseif ($active_tab === 'meta') echo '📈 إعدادات ميتا وإعلانات فيسبوك';
                else echo 'مركز إعدادات المتجر';
                ?>
            </h2>
            <p class="text-xs text-gray-400 mt-1 font-light">تخصيص كامل لمعلومات المتجر، بيانات الحماية، طرق الدفع، والشحن بكل سهولة.</p>
        </div>
    </div>

    <!-- التنبيهات ورسائل النجاح -->
    <?php if(isset($_GET['msg'])): ?>
        <div class="bg-green-50 text-green-700 p-4 mb-6 rounded-xl border border-green-200 text-xs font-bold animate-fade-in">
            <i class="fa-solid fa-circle-check mr-1 text-sm"></i>
            <?php 
            if($_GET['msg'] == 'general_updated') echo 'تم تحديث هوية المتجر واللوجو والعملة بنجاح!';
            elseif($_GET['msg'] == 'logo_removed') echo 'تم إزالة الشعار بنجاح والاعتماد على اسم المتجر النصي!';
            elseif($_GET['msg'] == 'password_updated') echo 'تم تغيير وتحديث كلمة مرور المسؤول بنجاح!';
            elseif($_GET['msg'] == 'colors_updated') echo 'تم حفظ وتطبيق لوحة ألوان المتجر بنجاح على كامل الموقع!';
            elseif($_GET['msg'] == 'announcement_updated') echo 'تم تحديث شريط الإعلانات العلوي بنجاح!';
            elseif($_GET['msg'] == 'meta_updated') echo 'تم تحديث وتفعيل إعدادات Meta Pixel بنجاح!';
            elseif($_GET['msg'] == 'payments_updated') echo 'تم تحديث وتفعيل إعدادات بوابات ووسائل الدفع بنجاح!';
            elseif($_GET['msg'] == 'shipping_updated') echo 'تم تحديث أسعار وحالة مناطق الشحن بنجاح!';
            elseif($_GET['msg'] == 'km_shipping_updated') echo 'تم حفظ وتحديث إعدادات الشحن الذكي بالكيلومتر وموقع المحل بنجاح!';
            elseif($_GET['msg'] == 'slide_added') echo 'تم إضافة شريحة البانر الجديد بنجاح!';
            elseif($_GET['msg'] == 'slide_deleted') echo 'تم حذف شريحة السلايدر بنجاح!';
            elseif($_GET['msg'] == 'cat_added') echo 'تم إضافة القسم الجديد بنجاح!';
            elseif($_GET['msg'] == 'cat_edited') echo 'تم تعديل القسم وتحديث المنتجات بنجاح!';
            elseif($_GET['msg'] == 'cat_deleted') echo 'تم حذف القسم بنجاح!';
            ?>
        </div>
    <?php endif; ?>

    <?php if(isset($_GET['error'])): ?>
        <div class="bg-red-50 text-red-700 p-4 mb-6 rounded-xl border border-red-200 text-xs font-bold animate-fade-in">
            <i class="fa-solid fa-circle-exclamation mr-1 text-sm"></i>
            <?php 
            if($_GET['error'] == 'wrong_current_password') echo 'كلمة المرور الحالية غير صحيحة! يرجى إعادة المحاولة.';
            elseif($_GET['error'] == 'password_too_short') echo 'كلمة المرور الجديدة يجب ألا تقل عن 6 أحرف أو أرقام.';
            elseif($_GET['error'] == 'password_mismatch') echo 'كلمة المرور الجديدة وتأكيدها غير متطابقين!';
            elseif($_GET['error'] == 'upload_failed') echo 'فشل رفع الصورة؛ يرجى التحقق من الامتداد ومحاولة الرفع مجدداً.';
            elseif($_GET['error'] == 'cat_duplicate') echo 'القسم موجود بالفعل! يرجى اختيار اسم قسم مختلف.';
            elseif($_GET['error'] == 'user_not_found') echo 'تعذر العثور على حساب المسؤول!';
            ?>
        </div>
    <?php endif; ?>

    <!-- ==================== TABS CONTENT ==================== -->

    <!-- TAB 0: 🏛️ هوية المتجر واللوجو والعملة -->
    <?php if ($active_tab === 'general'): ?>
    <div class="bg-white p-6 md:p-8 border border-royal-gold/10 shadow-sm mb-8 rounded-2xl animate-fade-in">
        <h3 class="font-serif font-bold text-sm text-royal-dark mb-6 border-b pb-3 flex items-center justify-between">
            <span class="flex items-center gap-2"><i class="fa-solid fa-store text-royal-darkgold"></i> هوية المتجر، الشعار، والعملة (White-Label Store Settings)</span>
            <span class="text-[10px] text-gray-400 font-bold">💡 تتيح لك تخصيص المتجر لأي نشاط تجاري فوراً</span>
        </h3>
        
        <form method="POST" action="admin_settings.php?tab=general" enctype="multipart/form-data" class="space-y-6">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                <div>
                    <label class="block text-xs font-bold text-gray-700 mb-2">اسم المتجر الرسمي *</label>
                    <input type="text" name="store_name" value="<?php echo htmlspecialchars($settings['store_name'] ?? 'المتجر الإلكتروني'); ?>" required placeholder="مثال: إلكتروتك / متجر الهواتف" class="w-full p-3 border border-gray-200 rounded-xl outline-none focus:border-royal-gold text-xs font-bold bg-royal-cream/20">
                    <p class="text-[10px] text-gray-400 mt-1">يظهر في ترويسة الموقع، الفوتر، رسائل البريد، والفواتير.</p>
                </div>

                <div>
                    <label class="block text-xs font-bold text-gray-700 mb-2">الشعار اللفظي أو الوصف المختصر (Tagline)</label>
                    <input type="text" name="store_tagline" value="<?php echo htmlspecialchars($settings['store_tagline'] ?? ''); ?>" placeholder="مثال: وجهتك الأولى لأحدث الأجهزة والإلكترونيات" class="w-full p-3 border border-gray-200 rounded-xl outline-none focus:border-royal-gold text-xs bg-royal-cream/20">
                    <p class="text-[10px] text-gray-400 mt-1">يظهر بجانب اللوجو وفي أعلى الموقع أو الفوتر.</p>
                </div>

                <div class="md:col-span-2">
                    <label class="block text-xs font-bold text-gray-700 mb-2">نبذة عن المتجر (تظهر في الفوتر وصفحة من نحن)</label>
                    <textarea name="store_description" rows="3" class="w-full p-3 border border-gray-200 rounded-xl outline-none focus:border-royal-gold text-xs leading-relaxed bg-royal-cream/20"><?php echo htmlspecialchars($settings['store_description'] ?? ''); ?></textarea>
                </div>

                <div>
                    <label class="block text-xs font-bold text-gray-700 mb-2">رمز العملة الرسمي</label>
                    <input type="text" name="store_currency" value="<?php echo htmlspecialchars($settings['store_currency'] ?? 'ج.م'); ?>" placeholder="مثال: ج.م أو ر.س أو $" class="w-full p-3 border border-gray-200 rounded-xl outline-none focus:border-royal-gold text-xs font-bold bg-royal-cream/20">
                    <p class="text-[10px] text-gray-400 mt-1">يظهر بجانب أسعار جميع المنتجات والشحن والسلة.</p>
                </div>

                <div>
                    <label class="block text-xs font-bold text-gray-700 mb-2">شعار المتجر (Logo Image)</label>
                    <div class="flex items-center gap-4">
                        <?php if (!empty($settings['store_logo'])): ?>
                            <div class="p-2 border rounded-xl bg-gray-50 flex items-center gap-2">
                                <img src="<?php echo htmlspecialchars($settings['store_logo']); ?>" alt="Store Logo" class="h-10 max-w-[120px] object-contain">
                                <a href="admin_settings.php?tab=general&action=remove_logo" onclick="return confirm('إزالة صورة اللوجو والاعتماد على الاسم النصي؟')" class="text-red-500 hover:text-red-700 text-xs font-bold p-1" title="حذف الشعار"><i class="fa-solid fa-trash-can"></i></a>
                            </div>
                        <?php endif; ?>
                        <input type="file" name="store_logo" accept="image/*" class="w-full text-xs text-gray-500">
                    </div>
                    <p class="text-[10px] text-gray-400 mt-1">PNG أو WebP شفاف مقاس مفضل 250x70. (في حال تركه فارغاً سيتم عرض اسم المتجر بتصميم راقٍ).</p>
                </div>

                <div>
                    <label class="block text-xs font-bold text-gray-700 mb-2">أيقونة المتصفح والتطبيق (Favicon / App Icon)</label>
                    <div class="flex items-center gap-4">
                        <?php if (!empty($settings['store_favicon'])): ?>
                            <img src="<?php echo htmlspecialchars($settings['store_favicon']); ?>" alt="Favicon" class="w-8 h-8 rounded-lg border object-cover">
                        <?php endif; ?>
                        <input type="file" name="store_favicon" accept="image/*" class="w-full text-xs text-gray-500">
                    </div>
                    <p class="text-[10px] text-gray-400 mt-1">تظهر في لسان المتصفح وأيقونة التطبيق على هواتف العملاء.</p>
                </div>

            </div>

            <div class="pt-4 border-t">
                <button type="submit" name="update_general_settings" class="bg-royal-charcoal text-white hover:bg-royal-gold hover:text-royal-charcoal font-bold px-10 py-3.5 text-xs rounded-xl shadow btn-shine transition-all">
                    حفظ هوية المتجر والإعدادات العامة
                </button>
            </div>
        </form>
    </div>
    <?php endif; ?>

    <!-- TAB 0.1: 🔐 كلمة مرور المسؤول والحساب -->
    <?php if ($active_tab === 'security'): ?>
    <div class="bg-white p-6 md:p-8 border border-royal-gold/10 shadow-sm mb-8 rounded-2xl animate-fade-in max-w-2xl">
        <h3 class="font-serif font-bold text-sm text-royal-dark mb-6 border-b pb-3 flex items-center justify-between">
            <span class="flex items-center gap-2"><i class="fa-solid fa-shield-halved text-royal-darkgold"></i> تغيير كلمة مرور حساب المسؤول الأساسي</span>
            <span class="text-[10px] text-green-700 bg-green-50 px-2 py-0.5 rounded-full font-bold border border-green-200">مشفرة بأمان BCRYPT</span>
        </h3>
        
        <form method="POST" action="admin_settings.php?tab=security" class="space-y-5">
            <div>
                <label class="block text-xs font-bold text-gray-700 mb-2">كلمة المرور الحالية *</label>
                <div class="relative">
                    <input type="password" name="current_password" required placeholder="أدخل كلمة المرور الحالية" class="w-full p-3 border border-gray-200 rounded-xl outline-none focus:border-royal-gold text-xs bg-royal-cream/20">
                </div>
                <p class="text-[10px] text-gray-400 mt-1">كلمة المرور الافتراضية عند أول تثبيت كانت: <code>admin123</code></p>
            </div>

            <div>
                <label class="block text-xs font-bold text-gray-700 mb-2">كلمة المرور الجديدة *</label>
                <input type="password" name="new_password" required minlength="6" placeholder="أدخل كلمة مرور جديدة قوية (6 أحرف أو أرقام على الأقل)" class="w-full p-3 border border-gray-200 rounded-xl outline-none focus:border-royal-gold text-xs bg-royal-cream/20">
            </div>

            <div>
                <label class="block text-xs font-bold text-gray-700 mb-2">تأكيد كلمة المرور الجديدة *</label>
                <input type="password" name="confirm_password" required minlength="6" placeholder="أعد كتابة كلمة المرور الجديدة للتأكيد" class="w-full p-3 border border-gray-200 rounded-xl outline-none focus:border-royal-gold text-xs bg-royal-cream/20">
            </div>

            <div class="pt-4 border-t">
                <button type="submit" name="update_admin_password" class="bg-red-700 text-white hover:bg-red-800 font-bold px-10 py-3.5 text-xs rounded-xl shadow transition-all flex items-center gap-2">
                    <i class="fa-solid fa-key"></i> تحديث كلمة المرور الآن
                </button>
            </div>
        </form>
    </div>
    <?php endif; ?>

    <!-- TAB 0.2: 🎨 ألوان وتصميم المتجر (Theme & Color Palette) -->
    <?php if ($active_tab === 'colors'): ?>
    <div class="bg-white p-6 md:p-8 border border-royal-gold/10 shadow-sm mb-8 rounded-2xl animate-fade-in">
        <h3 class="font-serif font-bold text-sm text-royal-dark mb-6 border-b pb-3 flex items-center justify-between">
            <span class="flex items-center gap-2"><i class="fa-solid fa-palette text-royal-darkgold"></i> تخصيص لوحة ألوان وهوية تصميم المتجر (Custom Theme Palette)</span>
            <span class="text-[10px] text-gray-400 font-bold">💡 يتم تطبيق الألوان فوراً على كافة الصفحات والأزرار والهيدر والفواتير</span>
        </h3>

        <!-- باليتات ألوان جاهزة بضغطة زر واحدة (Theme Presets) -->
        <div class="mb-8 p-5 bg-royal-cream/40 rounded-2xl border border-royal-gold/15">
            <h4 class="text-xs font-bold text-royal-dark mb-3 flex items-center gap-2">
                <i class="fa-solid fa-wand-magic-sparkles text-royal-darkgold"></i> نماذج وقوالب ألوان جاهزة (اضغط لتطبيق القالب فوراً):
            </h4>
            <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <button type="button" onclick="applyColorPreset('modern_blue')" class="p-3 rounded-xl border border-gray-200 bg-white hover:border-blue-500 hover:shadow-md transition text-center group">
                    <div class="flex h-5 rounded-lg overflow-hidden mb-2 border">
                        <div class="w-1/3 bg-[#2563eb]"></div>
                        <div class="w-1/3 bg-[#3b82f6]"></div>
                        <div class="w-1/3 bg-[#0f172a]"></div>
                    </div>
                    <span class="text-[11px] font-bold text-gray-700 block group-hover:text-blue-600">أزرق تقني عصري</span>
                </button>

                <button type="button" onclick="applyColorPreset('midnight_black')" class="p-3 rounded-xl border border-gray-200 bg-white hover:border-gray-800 hover:shadow-md transition text-center group">
                    <div class="flex h-5 rounded-lg overflow-hidden mb-2 border">
                        <div class="w-1/3 bg-[#111827]"></div>
                        <div class="w-1/3 bg-[#475569]"></div>
                        <div class="w-1/3 bg-[#000000]"></div>
                    </div>
                    <span class="text-[11px] font-bold text-gray-700 block group-hover:text-gray-900">أسود وأبيض مونوكروم</span>
                </button>

                <button type="button" onclick="applyColorPreset('royal_gold')" class="p-3 rounded-xl border border-gray-200 bg-white hover:border-amber-500 hover:shadow-md transition text-center group">
                    <div class="flex h-5 rounded-lg overflow-hidden mb-2 border">
                        <div class="w-1/3 bg-[#D4AF37]"></div>
                        <div class="w-1/3 bg-[#A0814A]"></div>
                        <div class="w-1/3 bg-[#0E3326]"></div>
                    </div>
                    <span class="text-[11px] font-bold text-gray-700 block group-hover:text-amber-600">ذهبي وفحمي فاخر</span>
                </button>

                <button type="button" onclick="applyColorPreset('emerald_green')" class="p-3 rounded-xl border border-gray-200 bg-white hover:border-emerald-500 hover:shadow-md transition text-center group">
                    <div class="flex h-5 rounded-lg overflow-hidden mb-2 border">
                        <div class="w-1/3 bg-[#059669]"></div>
                        <div class="w-1/3 bg-[#10b981]"></div>
                        <div class="w-1/3 bg-[#064e3b]"></div>
                    </div>
                    <span class="text-[11px] font-bold text-gray-700 block group-hover:text-emerald-600">أخضر زمردي طبيعي</span>
                </button>

                <button type="button" onclick="applyColorPreset('crimson_red')" class="p-3 rounded-xl border border-gray-200 bg-white hover:border-red-500 hover:shadow-md transition text-center group">
                    <div class="flex h-5 rounded-lg overflow-hidden mb-2 border">
                        <div class="w-1/3 bg-[#dc2626]"></div>
                        <div class="w-1/3 bg-[#ef4444]"></div>
                        <div class="w-1/3 bg-[#1c1917]"></div>
                    </div>
                    <span class="text-[11px] font-bold text-gray-700 block group-hover:text-red-600">عنابي ملكي فخم</span>
                </button>

                <button type="button" onclick="applyColorPreset('electric_violet')" class="p-3 rounded-xl border border-gray-200 bg-white hover:border-purple-500 hover:shadow-md transition text-center group">
                    <div class="flex h-5 rounded-lg overflow-hidden mb-2 border">
                        <div class="w-1/3 bg-[#7c3aed]"></div>
                        <div class="w-1/3 bg-[#8b5cf6]"></div>
                        <div class="w-1/3 bg-[#1e1b4b]"></div>
                    </div>
                    <span class="text-[11px] font-bold text-gray-700 block group-hover:text-purple-600">بنفسجي حديث</span>
                </button>
            </div>
        </div>

        <form method="POST" action="admin_settings.php?tab=colors" class="space-y-6" id="colors-form">
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                
                <!-- 1. اللون الرئيسي -->
                <div class="p-4 border border-gray-200 rounded-xl bg-gray-50/50">
                    <label class="block text-xs font-bold text-gray-700 mb-1">اللون الرئيسي للمتجر (Primary)</label>
                    <p class="text-[10px] text-gray-400 mb-3">للأزرار الأساسية، العناوين، والروابط النشطة.</p>
                    <div class="flex items-center gap-3">
                        <input type="color" id="picker_primary" value="<?php echo htmlspecialchars($settings['theme_primary_color'] ?? '#2563eb'); ?>" onchange="syncColor('primary', this.value)" class="w-12 h-10 border rounded-lg cursor-pointer bg-white p-1">
                        <input type="text" name="theme_primary_color" id="hex_primary" value="<?php echo htmlspecialchars($settings['theme_primary_color'] ?? '#2563eb'); ?>" oninput="syncColor('primary', this.value)" class="w-full p-2.5 border rounded-lg text-xs font-mono font-bold uppercase bg-white">
                    </div>
                </div>

                <!-- 2. اللون الثانوي -->
                <div class="p-4 border border-gray-200 rounded-xl bg-gray-50/50">
                    <label class="block text-xs font-bold text-gray-700 mb-1">اللون الثانوي (Secondary)</label>
                    <p class="text-[10px] text-gray-400 mb-3">للتأثيرات الجانبية، والأسعار، والنصوص الفرعية.</p>
                    <div class="flex items-center gap-3">
                        <input type="color" id="picker_secondary" value="<?php echo htmlspecialchars($settings['theme_secondary_color'] ?? '#1d4ed8'); ?>" onchange="syncColor('secondary', this.value)" class="w-12 h-10 border rounded-lg cursor-pointer bg-white p-1">
                        <input type="text" name="theme_secondary_color" id="hex_secondary" value="<?php echo htmlspecialchars($settings['theme_secondary_color'] ?? '#1d4ed8'); ?>" oninput="syncColor('secondary', this.value)" class="w-full p-2.5 border rounded-lg text-xs font-mono font-bold uppercase bg-white">
                    </div>
                </div>

                <!-- 3. لون التمييز والتدرجات -->
                <div class="p-4 border border-gray-200 rounded-xl bg-gray-50/50">
                    <label class="block text-xs font-bold text-gray-700 mb-1">لون التمييز والتدرجات (Accent)</label>
                    <p class="text-[10px] text-gray-400 mb-3">لتدرجات الأزرار، والبادجات، ونقاط التمرير.</p>
                    <div class="flex items-center gap-3">
                        <input type="color" id="picker_accent" value="<?php echo htmlspecialchars($settings['theme_accent_color'] ?? '#3b82f6'); ?>" onchange="syncColor('accent', this.value)" class="w-12 h-10 border rounded-lg cursor-pointer bg-white p-1">
                        <input type="text" name="theme_accent_color" id="hex_accent" value="<?php echo htmlspecialchars($settings['theme_accent_color'] ?? '#3b82f6'); ?>" oninput="syncColor('accent', this.value)" class="w-full p-2.5 border rounded-lg text-xs font-mono font-bold uppercase bg-white">
                    </div>
                </div>

                <!-- 4. خلفية الهيدر والفوتر -->
                <div class="p-4 border border-gray-200 rounded-xl bg-gray-50/50">
                    <label class="block text-xs font-bold text-gray-700 mb-1">خلفية الهيدر والفوتر (Header/Footer)</label>
                    <p class="text-[10px] text-gray-400 mb-3">لون شريط الترويسة العلوي وأسفل الموقع.</p>
                    <div class="flex items-center gap-3">
                        <input type="color" id="picker_header_bg" value="<?php echo htmlspecialchars($settings['theme_header_bg'] ?? '#0f172a'); ?>" onchange="syncColor('header_bg', this.value)" class="w-12 h-10 border rounded-lg cursor-pointer bg-white p-1">
                        <input type="text" name="theme_header_bg" id="hex_header_bg" value="<?php echo htmlspecialchars($settings['theme_header_bg'] ?? '#0f172a'); ?>" oninput="syncColor('header_bg', this.value)" class="w-full p-2.5 border rounded-lg text-xs font-mono font-bold uppercase bg-white">
                    </div>
                </div>

                <!-- 5. نصوص الهيدر والفوتر -->
                <div class="p-4 border border-gray-200 rounded-xl bg-gray-50/50">
                    <label class="block text-xs font-bold text-gray-700 mb-1">لون نصوص الهيدر والفوتر</label>
                    <p class="text-[10px] text-gray-400 mb-3">لون الروابط والكتابة داخل الهيدر والفوتر.</p>
                    <div class="flex items-center gap-3">
                        <input type="color" id="picker_header_text" value="<?php echo htmlspecialchars($settings['theme_header_text'] ?? '#ffffff'); ?>" onchange="syncColor('header_text', this.value)" class="w-12 h-10 border rounded-lg cursor-pointer bg-white p-1">
                        <input type="text" name="theme_header_text" id="hex_header_text" value="<?php echo htmlspecialchars($settings['theme_header_text'] ?? '#ffffff'); ?>" oninput="syncColor('header_text', this.value)" class="w-full p-2.5 border rounded-lg text-xs font-mono font-bold uppercase bg-white">
                    </div>
                </div>

                <!-- 6. خلفية الموقع العامة -->
                <div class="p-4 border border-gray-200 rounded-xl bg-gray-50/50">
                    <label class="block text-xs font-bold text-gray-700 mb-1">خلفية الموقع العامة (Body BG)</label>
                    <p class="text-[10px] text-gray-400 mb-3">اللون العام لخلفية جميع صفحات المتجر.</p>
                    <div class="flex items-center gap-3">
                        <input type="color" id="picker_body_bg" value="<?php echo htmlspecialchars($settings['theme_body_bg'] ?? '#f8fafc'); ?>" onchange="syncColor('body_bg', this.value)" class="w-12 h-10 border rounded-lg cursor-pointer bg-white p-1">
                        <input type="text" name="theme_body_bg" id="hex_body_bg" value="<?php echo htmlspecialchars($settings['theme_body_bg'] ?? '#f8fafc'); ?>" oninput="syncColor('body_bg', this.value)" class="w-full p-2.5 border rounded-lg text-xs font-mono font-bold uppercase bg-white">
                    </div>
                </div>

                <!-- 7. خلفية الكروت والصناديق -->
                <div class="p-4 border border-gray-200 rounded-xl bg-gray-50/50">
                    <label class="block text-xs font-bold text-gray-700 mb-1">خلفية كروت المنتجات (Card BG)</label>
                    <p class="text-[10px] text-gray-400 mb-3">لون خلفية بطاقات العرض وصناديق الفاتورة.</p>
                    <div class="flex items-center gap-3">
                        <input type="color" id="picker_card_bg" value="<?php echo htmlspecialchars($settings['theme_card_bg'] ?? '#ffffff'); ?>" onchange="syncColor('card_bg', this.value)" class="w-12 h-10 border rounded-lg cursor-pointer bg-white p-1">
                        <input type="text" name="theme_card_bg" id="hex_card_bg" value="<?php echo htmlspecialchars($settings['theme_card_bg'] ?? '#ffffff'); ?>" oninput="syncColor('card_bg', this.value)" class="w-full p-2.5 border rounded-lg text-xs font-mono font-bold uppercase bg-white">
                    </div>
                </div>

                <!-- 8. لون أزرار الشراء -->
                <div class="p-4 border border-gray-200 rounded-xl bg-gray-50/50">
                    <label class="block text-xs font-bold text-gray-700 mb-1">لون أزرار الشراء والسلة (Button BG)</label>
                    <p class="text-[10px] text-gray-400 mb-3">لون الأزرار التفاعلية للشراء وإتمام الطلب.</p>
                    <div class="flex items-center gap-3">
                        <input type="color" id="picker_btn_color" value="<?php echo htmlspecialchars($settings['theme_btn_color'] ?? '#2563eb'); ?>" onchange="syncColor('btn_color', this.value)" class="w-12 h-10 border rounded-lg cursor-pointer bg-white p-1">
                        <input type="text" name="theme_btn_color" id="hex_btn_color" value="<?php echo htmlspecialchars($settings['theme_btn_color'] ?? '#2563eb'); ?>" oninput="syncColor('btn_color', this.value)" class="w-full p-2.5 border rounded-lg text-xs font-mono font-bold uppercase bg-white">
                    </div>
                </div>

                <!-- 9. لون نصوص الأزرار -->
                <div class="p-4 border border-gray-200 rounded-xl bg-gray-50/50">
                    <label class="block text-xs font-bold text-gray-700 mb-1">لون كتابة الأزرار (Button Text)</label>
                    <p class="text-[10px] text-gray-400 mb-3">لون الخط المكتوب داخل أزرار الشراء.</p>
                    <div class="flex items-center gap-3">
                        <input type="color" id="picker_btn_text" value="<?php echo htmlspecialchars($settings['theme_btn_text'] ?? '#ffffff'); ?>" onchange="syncColor('btn_text', this.value)" class="w-12 h-10 border rounded-lg cursor-pointer bg-white p-1">
                        <input type="text" name="theme_btn_text" id="hex_btn_text" value="<?php echo htmlspecialchars($settings['theme_btn_text'] ?? '#ffffff'); ?>" oninput="syncColor('btn_text', this.value)" class="w-full p-2.5 border rounded-lg text-xs font-mono font-bold uppercase bg-white">
                    </div>
                </div>

            </div>

            <!-- المعاينة الحية المباشرة (Live Preview Box) -->
            <div class="mt-8 border border-dashed border-gray-300 p-6 rounded-2xl bg-gray-50">
                <h4 class="text-xs font-bold text-royal-dark mb-4 flex items-center gap-2">
                    <i class="fa-solid fa-eye text-royal-darkgold"></i> معاينة مباشرة للمتجر بالألوان المحددة:
                </h4>
                
                <div id="preview_container" class="rounded-xl overflow-hidden border shadow-sm p-4 space-y-4" style="background-color: <?php echo $settings['theme_body_bg'] ?? '#f8fafc'; ?>;">
                    <!-- محاكاة الهيدر -->
                    <div id="preview_header" class="p-3 rounded-lg flex justify-between items-center" style="background-color: <?php echo $settings['theme_header_bg'] ?? '#0f172a'; ?>; color: <?php echo $settings['theme_header_text'] ?? '#ffffff'; ?>;">
                        <div class="font-bold text-xs flex items-center gap-2">
                            <i class="fa-solid fa-store" id="preview_icon" style="color: <?php echo $settings['theme_primary_color'] ?? '#2563eb'; ?>;"></i>
                            <span><?php echo htmlspecialchars($settings['store_name'] ?? 'المتجر الإلكتروني'); ?></span>
                        </div>
                        <div class="text-[10px] space-x-3 space-x-reverse flex items-center">
                            <span class="opacity-80">الرئيسية</span>
                            <span class="opacity-80">المتجر</span>
                            <span class="px-2 py-1 rounded font-bold text-xs" id="preview_badge" style="background-color: <?php echo $settings['theme_primary_color'] ?? '#2563eb'; ?>; color: #ffffff;">السلة (1)</span>
                        </div>
                    </div>

                    <!-- محاكاة كارت منتج -->
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div id="preview_card" class="p-4 rounded-xl border shadow-sm flex flex-col justify-between" style="background-color: <?php echo $settings['theme_card_bg'] ?? '#ffffff'; ?>;">
                            <div class="h-28 rounded-lg mb-3 flex items-center justify-center font-bold text-xs" style="background: linear-gradient(135deg, <?php echo $settings['theme_accent_color'] ?? '#3b82f6'; ?> 0%, <?php echo $settings['theme_primary_color'] ?? '#2563eb'; ?> 100%); color: #ffffff;">
                                800 × 1000 px
                            </div>
                            <div>
                                <h5 class="font-bold text-xs text-gray-800">اسم المنتج المعروض</h5>
                                <div class="flex justify-between items-center my-2">
                                    <span id="preview_price" class="font-serif font-bold text-sm" style="color: <?php echo $settings['theme_secondary_color'] ?? '#1d4ed8'; ?>;">250 <?php echo htmlspecialchars($settings['store_currency'] ?? 'ج.م'); ?></span>
                                    <span class="text-[9px] bg-red-100 text-red-600 px-2 py-0.5 rounded font-bold">خصم 20%</span>
                                </div>
                                <button type="button" id="preview_button" class="w-full py-2.5 rounded-lg text-xs font-bold shadow transition" style="background-color: <?php echo $settings['theme_btn_color'] ?? '#2563eb'; ?>; color: <?php echo $settings['theme_btn_text'] ?? '#ffffff'; ?>;">
                                    أضف إلى الحقيبة <i class="fa-solid fa-cart-plus mr-1"></i>
                                </button>
                            </div>
                        </div>

                        <div class="p-4 rounded-xl border flex flex-col justify-center space-y-2 text-xs" style="background-color: <?php echo $settings['theme_card_bg'] ?? '#ffffff'; ?>;">
                            <span class="text-[10px] text-gray-400 font-bold">ملخص الطلب</span>
                            <div class="flex justify-between font-bold">
                                <span>الإجمالي:</span>
                                <span id="preview_price_summary" style="color: <?php echo $settings['theme_primary_color'] ?? '#2563eb'; ?>;">250 <?php echo htmlspecialchars($settings['store_currency'] ?? 'ج.م'); ?></span>
                            </div>
                            <button type="button" id="preview_btn_checkout" class="w-full py-2.5 rounded-lg text-xs font-bold shadow transition" style="background-color: <?php echo $settings['theme_btn_color'] ?? '#2563eb'; ?>; color: <?php echo $settings['theme_btn_text'] ?? '#ffffff'; ?>;">
                                إتمام عملية الشراء 🚀
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div class="pt-4 border-t flex flex-col sm:flex-row justify-between items-center gap-4">
                <button type="submit" name="update_theme_colors" class="w-full sm:w-auto bg-royal-charcoal text-white hover:bg-royal-gold hover:text-royal-charcoal font-bold px-10 py-3.5 text-xs rounded-xl shadow btn-shine transition-all flex items-center justify-center gap-2">
                    <i class="fa-solid fa-floppy-disk"></i> حفظ وتطبيق الألوان على كامل المتجر
                </button>

                <button type="button" onclick="applyColorPreset('modern_blue')" class="text-xs text-gray-500 hover:text-royal-dark font-bold underline">
                    استعادة الألوان الافتراضية القياسية
                </button>
            </div>
        </form>
    </div>

    <!-- Script to handle dynamic color syncing and presets -->
    <script>
        const colorPresets = {
            modern_blue: {
                primary: '#2563eb', secondary: '#1d4ed8', accent: '#3b82f6',
                header_bg: '#0f172a', header_text: '#ffffff',
                body_bg: '#f8fafc', card_bg: '#ffffff',
                btn_color: '#2563eb', btn_text: '#ffffff'
            },
            midnight_black: {
                primary: '#000000', secondary: '#334155', accent: '#64748b',
                header_bg: '#111827', header_text: '#ffffff',
                body_bg: '#f9fafb', card_bg: '#ffffff',
                btn_color: '#000000', btn_text: '#ffffff'
            },
            royal_gold: {
                primary: '#D4AF37', secondary: '#A0814A', accent: '#D4BE92',
                header_bg: '#0E3326', header_text: '#ffffff',
                body_bg: '#FAF8F5', card_bg: '#ffffff',
                btn_color: '#A0814A', btn_text: '#ffffff'
            },
            emerald_green: {
                primary: '#059669', secondary: '#047857', accent: '#10b981',
                header_bg: '#064e3b', header_text: '#ffffff',
                body_bg: '#f0fdf4', card_bg: '#ffffff',
                btn_color: '#059669', btn_text: '#ffffff'
            },
            crimson_red: {
                primary: '#dc2626', secondary: '#b91c1c', accent: '#ef4444',
                header_bg: '#1c1917', header_text: '#ffffff',
                body_bg: '#fef2f2', card_bg: '#ffffff',
                btn_color: '#dc2626', btn_text: '#ffffff'
            },
            electric_violet: {
                primary: '#7c3aed', secondary: '#6d28d9', accent: '#8b5cf6',
                header_bg: '#1e1b4b', header_text: '#ffffff',
                body_bg: '#faf5ff', card_bg: '#ffffff',
                btn_color: '#7c3aed', btn_text: '#ffffff'
            }
        };

        function syncColor(type, val) {
            if (!val.startsWith('#')) val = '#' + val;
            if (/^#[0-9A-F]{6}$/i.test(val) || /^#[0-9A-F]{3}$/i.test(val)) {
                const picker = document.getElementById('picker_' + type);
                const hex = document.getElementById('hex_' + type);
                if (picker && picker.value !== val) picker.value = val;
                if (hex && hex.value !== val) hex.value = val;
                updateLivePreview();
            }
        }

        function applyColorPreset(name) {
            const p = colorPresets[name];
            if (!p) return;
            for (let k in p) {
                syncColor(k, p[k]);
            }
            updateLivePreview();
        }

        function updateLivePreview() {
            const primary = document.getElementById('hex_primary').value;
            const secondary = document.getElementById('hex_secondary').value;
            const accent = document.getElementById('hex_accent').value;
            const header_bg = document.getElementById('hex_header_bg').value;
            const header_text = document.getElementById('hex_header_text').value;
            const body_bg = document.getElementById('hex_body_bg').value;
            const card_bg = document.getElementById('hex_card_bg').value;
            const btn_color = document.getElementById('hex_btn_color').value;
            const btn_text = document.getElementById('hex_btn_text').value;

            document.getElementById('preview_container').style.backgroundColor = body_bg;
            document.getElementById('preview_header').style.backgroundColor = header_bg;
            document.getElementById('preview_header').style.color = header_text;
            document.getElementById('preview_icon').style.color = primary;
            document.getElementById('preview_badge').style.backgroundColor = primary;
            
            document.getElementById('preview_card').style.backgroundColor = card_bg;
            document.getElementById('preview_price').style.color = secondary;
            document.getElementById('preview_price_summary').style.color = primary;
            
            document.getElementById('preview_button').style.backgroundColor = btn_color;
            document.getElementById('preview_button').style.color = btn_text;
            
            document.getElementById('preview_btn_checkout').style.backgroundColor = btn_color;
            document.getElementById('preview_btn_checkout').style.color = btn_text;
        }
    </script>
    <?php endif; ?>

    <!-- TAB 1: 💳 وسائل وبوابات الدفع الإلكتروني (مصر) -->
    <?php if ($active_tab === 'payments'): ?>
    <div class="bg-white p-6 border border-royal-gold/10 shadow-sm mb-8 rounded-2xl animate-fade-in">
        <div class="border-b pb-4 mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
            <div>
                <h3 class="font-serif font-bold text-base text-royal-dark flex items-center gap-2">
                    <i class="fa-solid fa-wallet text-royal-darkgold"></i> إعدادات وتنشيط وسائل وبوابات الدفع المحلية (جمهورية مصر العربية 🇪🇬)
                </h3>
                <p class="text-xs text-gray-400 mt-1">تخصيص وسائل الدفع المعتمدة في مصر: الدفع عند الاستلام (كاش)، المحافظ الإلكترونية (فودافون كاش)، تحويل إنستا باي (InstaPay)، وبطاقات الدفع البنكية عبر Paymob.</p>
            </div>
            <span class="text-[10px] bg-royal-sand text-royal-darkgold px-3 py-1.5 rounded-xl font-bold">💡 تظهر الوسيلة للعميل فقط عند تفعيلها هنا</span>
        </div>
        
        <form method="POST" action="admin_settings.php?tab=payments" class="space-y-6">
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                
                <!-- 1. الدفع عند الاستلام (COD) -->
                <div class="bg-royal-cream/40 p-5 rounded-2xl border border-royal-gold/15 flex flex-col justify-between space-y-3 md:col-span-1 shadow-sm">
                    <div>
                        <div class="flex items-center justify-between border-b pb-2 mb-3">
                            <span class="font-bold text-xs text-royal-dark flex items-center gap-1.5">
                                <i class="fa-solid fa-hand-holding-dollar text-green-600"></i> الدفع عند الاستلام (كاش)
                            </span>
                            <input type="checkbox" name="cod_enabled" id="cod_active" value="1" <?php echo ($settings['cod_enabled'] ?? '1') === '1' ? 'checked' : ''; ?> class="w-4 h-4 accent-royal-darkgold cursor-pointer">
                        </div>
                        <p class="text-xs text-gray-500 font-medium">يتيح للعميل دفع قيمة الفاتورة كاش نقدياً لمندوب التوصيل فور استلام الطلب داخل مصر.</p>
                    </div>
                </div>

                <!-- 2. فودافون كاش / المحافظ الإلكترونية -->
                <div class="bg-royal-cream/40 p-5 rounded-2xl border border-royal-gold/15 flex flex-col justify-between space-y-3 md:col-span-1 shadow-sm">
                    <div>
                        <div class="flex items-center justify-between border-b pb-2 mb-3">
                            <span class="font-bold text-xs text-royal-dark flex items-center gap-1.5">
                                🇪🇬 فودافون كاش / المحافظ الإلكترونية
                            </span>
                            <input type="checkbox" name="vodafone_cash_enabled" id="vc_active" value="1" <?php echo ($settings['vodafone_cash_enabled'] ?? '0') === '1' ? 'checked' : ''; ?> class="w-4 h-4 accent-royal-darkgold cursor-pointer">
                        </div>
                        <label class="block text-[11px] font-bold text-gray-600 mb-1">رقم محفظة استقبال التحويلات:</label>
                        <input type="text" name="vodafone_cash_number" value="<?php echo htmlspecialchars($settings['vodafone_cash_number'] ?? ''); ?>" placeholder="مثال: 01012345678" class="w-full p-2.5 border border-gray-200 rounded-xl outline-none focus:border-royal-gold text-xs font-mono bg-white">
                        <p class="text-[10px] text-gray-400 mt-2">📌 يتيح للعميل التحويل مع إلزامه برفع صورة إيصال التحويل.</p>
                    </div>
                </div>

                <!-- 3. انستا باي (InstaPay) -->
                <div class="bg-royal-cream/40 p-5 rounded-2xl border border-royal-gold/15 flex flex-col justify-between space-y-3 md:col-span-1 shadow-sm">
                    <div>
                        <div class="flex items-center justify-between border-b pb-2 mb-3">
                            <span class="font-bold text-xs text-royal-dark flex items-center gap-1.5">
                                🇪🇬 تحويل انستا باي InstaPay
                            </span>
                            <input type="checkbox" name="instapay_enabled" id="insta_active" value="1" <?php echo ($settings['instapay_enabled'] ?? '0') === '1' ? 'checked' : ''; ?> class="w-4 h-4 accent-royal-darkgold cursor-pointer">
                        </div>
                        <div class="space-y-2">
                            <div>
                                <label class="block text-[10px] font-bold text-gray-600 mb-0.5">عنوان InstaPay IPA أو رقم الحساب:</label>
                                <input type="text" name="instapay_address" value="<?php echo htmlspecialchars($settings['instapay_address'] ?? ''); ?>" placeholder="مثال: username@instapay" class="w-full p-2 border border-gray-200 rounded-xl outline-none focus:border-royal-gold text-xs font-mono bg-white">
                            </div>
                            <div>
                                <label class="block text-[10px] font-bold text-gray-600 mb-0.5">اسم صاحب الحساب بالبنك:</label>
                                <input type="text" name="instapay_name" value="<?php echo htmlspecialchars($settings['instapay_name'] ?? ''); ?>" placeholder="اسم المستفيد" class="w-full p-2 border border-gray-200 rounded-xl outline-none focus:border-royal-gold text-xs bg-white">
                            </div>
                        </div>
                    </div>
                </div>

            </div>

            <!-- 4. إعدادات بوابة Paymob التلقائية (مصر) -->
            <div class="bg-blue-50/50 p-5 rounded-2xl border border-blue-100 space-y-4">
                <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-blue-200/60 pb-3 gap-2">
                    <span class="font-bold text-xs text-royal-dark flex items-center gap-2">
                        <i class="fa-solid fa-credit-card text-blue-600"></i> بوابة باي موب للدفع الإلكتروني بالفيزا والماستركارد وميزة (Paymob Gateway)
                        <span class="bg-blue-100 text-blue-800 text-[10px] px-2 py-0.5 rounded-md font-bold">🇪🇬 جمهورية مصر العربية</span>
                    </span>
                    <div class="flex items-center gap-2">
                        <input type="checkbox" name="paymob_enabled" id="pm_active" value="1" <?php echo ($settings['paymob_enabled'] ?? '0') === '1' ? 'checked' : ''; ?> class="w-4 h-4 accent-blue-600 cursor-pointer">
                        <label for="pm_active" class="text-xs font-bold text-royal-dark cursor-pointer">تفعيل الدفع الإلكتروني عبر Paymob</label>
                    </div>
                </div>
                
                <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                        <label class="block text-[10px] font-bold text-gray-600 mb-1">Paymob API Key:</label>
                        <input type="password" name="paymob_api_key" value="<?php echo htmlspecialchars($settings['paymob_api_key'] ?? ''); ?>" placeholder="مفتاح API الخاص بحسابك" class="w-full p-2 border border-gray-200 rounded-xl text-xs font-mono bg-white">
                    </div>
                    <div>
                        <label class="block text-[10px] font-bold text-gray-600 mb-1">Card Integration ID (كروت وميزة):</label>
                        <input type="text" name="paymob_integration_id_card" value="<?php echo htmlspecialchars($settings['paymob_integration_id_card'] ?? ''); ?>" placeholder="مثال: 123456" class="w-full p-2 border border-gray-200 rounded-xl text-xs font-mono bg-white">
                    </div>
                    <div>
                        <label class="block text-[10px] font-bold text-gray-600 mb-1">Wallet Integration ID (محافظ إلكترونية):</label>
                        <input type="text" name="paymob_integration_id_wallet" value="<?php echo htmlspecialchars($settings['paymob_integration_id_wallet'] ?? ''); ?>" placeholder="مثال: 654321" class="w-full p-2 border border-gray-200 rounded-xl text-xs font-mono bg-white">
                    </div>
                    <div>
                        <label class="block text-[10px] font-bold text-gray-600 mb-1">Paymob iFrame ID:</label>
                        <input type="text" name="paymob_iframe_id" value="<?php echo htmlspecialchars($settings['paymob_iframe_id'] ?? ''); ?>" placeholder="مثال: 78901" class="w-full p-2 border border-gray-200 rounded-xl text-xs font-mono bg-white">
                    </div>
                </div>
            </div>

            <button type="submit" name="update_payment_settings" class="bg-royal-charcoal text-white px-8 py-3.5 font-bold text-xs rounded-xl hover:bg-royal-gold hover:text-royal-charcoal shadow btn-shine transition-all">
                <i class="fa-solid fa-floppy-disk mr-1"></i> حفظ وتحديث وسائل وبوابات الدفع
            </button>
        </form>
    </div>
    <?php endif; ?>

    <!-- TAB 2: 🚚 مناطق ومصاريف الشحن والتوصيل في مصر + نظام الشحن الذكي بالكيلومتر -->
    <?php if ($active_tab === 'shipping'): 
        $enable_km_val = $settings['enable_km_shipping'] ?? '1';
        $store_lat_val = $settings['store_lat'] ?? '30.0444';
        $store_lng_val = $settings['store_lng'] ?? '31.2357';
        $store_addr_val = $settings['store_address_name'] ?? 'الفرع الرئيسي / مركز الشحن والتوزيع';
        $km_rate_val = $settings['km_rate'] ?? '2';
        $km_base_min_val = $settings['km_base_min_price'] ?? '25';
        $km_govs_saved = !empty($settings['km_shipping_govs']) ? json_decode($settings['km_shipping_govs'], true) : ['القاهرة', 'الجيزة', '6 أكتوبر', 'الشيخ زايد'];
        if (!is_array($km_govs_saved)) $km_govs_saved = ['القاهرة', 'الجيزة', '6 أكتوبر', 'الشيخ زايد'];
    ?>
    <!-- تضمين مكتبة Leaflet للخرائط التفاعلية -->
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>

    <div class="space-y-8 animate-fade-in">
        
        <!-- كارت 1: 📍 نظام الشحن الذكي بالكيلومتر لمناطق القاهرة الكبرى (القاهرة، الجيزة، 6 أكتوبر، زايد) -->
        <div class="bg-white p-6 border border-royal-gold/15 shadow-sm rounded-2xl">
            <div class="border-b pb-4 mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div>
                    <h3 class="font-serif font-bold text-base text-royal-dark flex items-center gap-2">
                        <i class="fa-solid fa-route text-royal-darkgold text-lg"></i>
                        نظام الشحن الذكي بالكيلومتر (القاهرة، الجيزة، 6 أكتوبر، الشيخ زايد)
                    </h3>
                    <p class="text-xs text-gray-400 mt-1">حساب تكلفة الشحن: أول كيلومتر بسعر ثابت (<?php echo $km_base_min_val; ?> ج.م)، وكل كيلومتر إضافي بعد الأول يُضاف له (<?php echo $km_rate_val; ?> ج.م).</p>
                </div>
                <div class="flex items-center gap-2">
                    <span class="text-[10px] bg-royal-sand text-royal-darkgold px-3 py-1.5 rounded-full font-bold">
                        📍 نقطة البداية: موقع المحل
                    </span>
                </div>
            </div>

            <form method="POST" action="admin_settings.php?tab=shipping" class="space-y-6">
                <input type="hidden" name="update_km_shipping_settings" value="1">
                
                <!-- سويتش التفعيل الرئيسي -->
                <div class="bg-royal-sand/30 p-4 rounded-xl border border-royal-gold/20 flex items-center justify-between">
                    <div>
                        <label for="enable_km_switch" class="text-xs font-bold text-royal-dark cursor-pointer flex items-center gap-2">
                            <i class="fa-solid fa-calculator text-royal-darkgold"></i> تفعيل نظام حساب التوصيل بالمسافة والكيلومتر
                        </label>
                        <p class="text-[10px] text-gray-500 mt-0.5">عند تفعيله، سيتم حساب تكلفة التوصيل بمجرد تحديد العميل لموقعه على الخريطة في المناطق المحددة بالأسفل.</p>
                    </div>
                    <input type="checkbox" name="enable_km_shipping" id="enable_km_switch" value="1" <?php echo $enable_km_val === '1' ? 'checked' : ''; ?> class="w-5 h-5 accent-royal-darkgold cursor-pointer">
                </div>

                <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <!-- العمود الأيمن: إعدادات التسعير والمناطق -->
                    <div class="space-y-4">
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <!-- سعر أقل من 1 كم -->
                            <div class="bg-royal-cream/30 p-3.5 rounded-xl border border-royal-gold/10">
                                <label class="block text-xs font-bold text-royal-dark mb-1">
                                    سعر أول كيلومتر (سعر فتح المسافة / الحد الأدنى) *
                                </label>
                                <div class="relative">
                                    <input type="number" step="0.5" name="km_base_min_price" id="admin_km_base_min" value="<?php echo htmlspecialchars($km_base_min_val); ?>" required class="w-full p-2.5 bg-white border border-gray-200 rounded-lg text-xs font-bold font-serif text-royal-dark outline-none focus:border-royal-gold">
                                    <span class="absolute left-3 top-2 text-[10px] text-gray-500 font-bold">ج.م</span>
                                </div>
                                <p class="text-[10px] text-gray-400 mt-1">يُطبق كقيمة ثابتة لأول كيلومتر من المسافة.</p>
                            </div>

                            <!-- سعر الكيلومتر الواحد -->
                            <div class="bg-royal-cream/30 p-3.5 rounded-xl border border-royal-gold/10">
                                <label class="block text-xs font-bold text-royal-dark mb-1">
                                    سعر الكيلومتر الإضافي (بعد الكيلو الأول) *
                                </label>
                                <div class="relative">
                                    <input type="number" step="0.25" name="km_rate" id="admin_km_rate" value="<?php echo htmlspecialchars($km_rate_val); ?>" required class="w-full p-2.5 bg-white border border-gray-200 rounded-lg text-xs font-bold font-serif text-royal-dark outline-none focus:border-royal-gold">
                                    <span class="absolute left-3 top-2 text-[10px] text-gray-500 font-bold">ج.م / كم</span>
                                </div>
                                <p class="text-[10px] text-gray-400 mt-1">مثال: لو 2 كم => 25 + 2 = 27 ج.م (لو 10 كم => 25 + 9×2 = 43 ج.م).</p>
                            </div>
                        </div>

                        <!-- اسم / عنوان المحل ومركز الشحن -->
                        <div>
                            <label class="block text-xs font-bold text-royal-dark mb-1">
                                اسم وعنوان مركز الشحن / المحل (نقطة الصفر للمسافة) *
                            </label>
                            <input type="text" name="store_address_name" id="store_address_name" value="<?php echo htmlspecialchars($store_addr_val); ?>" placeholder="مثال: الفرع الرئيسي - شارع النصر، المعادي" class="w-full p-2.5 bg-white border border-gray-200 rounded-xl text-xs outline-none focus:border-royal-gold font-medium">
                        </div>

                        <!-- إحداثيات المحل GPS -->
                        <div class="grid grid-cols-2 gap-3 bg-gray-50 p-3.5 rounded-xl border">
                            <div>
                                <label class="block text-[10px] font-bold text-gray-500 mb-0.5">خط العرض (Latitude):</label>
                                <input type="text" name="store_lat" id="store_lat" value="<?php echo htmlspecialchars($store_lat_val); ?>" class="w-full p-2 bg-white border border-gray-200 rounded-lg text-xs font-mono font-bold text-royal-dark text-left" dir="ltr" readonly>
                            </div>
                            <div>
                                <label class="block text-[10px] font-bold text-gray-500 mb-0.5">خط الطول (Longitude):</label>
                                <input type="text" name="store_lng" id="store_lng" value="<?php echo htmlspecialchars($store_lng_val); ?>" class="w-full p-2 bg-white border border-gray-200 rounded-lg text-xs font-mono font-bold text-royal-dark text-left" dir="ltr" readonly>
                            </div>
                            <div class="col-span-2 pt-1 flex justify-between items-center">
                                <button type="button" id="btn-get-admin-gps" class="bg-royal-sand hover:bg-royal-gold text-royal-dark hover:text-white px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow-sm">
                                    <i class="fa-solid fa-location-crosshairs text-royal-darkgold"></i> تحديد موقعي الحالي كمركز للمحل
                                </button>
                                <span class="text-[10px] text-gray-400">أو اسحب الدبوس على الخريطة</span>
                            </div>
                        </div>

                        <!-- المناطق والمحافظات المشمولة في نظام الكيلومتر -->
                        <div>
                            <label class="block text-xs font-bold text-royal-dark mb-2">
                                المناطق والمحافظات المشمولة في حساب الكيلومتر:
                            </label>
                            <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                <?php 
                                $local_cairo_zones = ['القاهرة', 'الجيزة', '6 أكتوبر', 'الشيخ زايد', 'القليوبية'];
                                foreach ($local_cairo_zones as $zone): 
                                    $is_checked = in_array($zone, $km_govs_saved);
                                ?>
                                    <label class="border p-2 rounded-xl flex items-center gap-2 cursor-pointer transition text-xs <?php echo $is_checked ? 'bg-royal-sand/40 border-royal-gold/40 font-bold text-royal-dark' : 'bg-gray-50 border-gray-200 text-gray-500'; ?>">
                                        <input type="checkbox" name="km_govs[]" value="<?php echo $zone; ?>" <?php echo $is_checked ? 'checked' : ''; ?> class="w-4 h-4 accent-royal-darkgold cursor-pointer rounded">
                                        <span><?php echo $zone; ?></span>
                                    </label>
                                <?php endforeach; ?>
                            </div>
                        </div>

                        <!-- حاسبة تجريبية للمعاينة الحية -->
                        <div class="bg-gradient-to-r from-emerald-50 to-teal-50/40 p-3.5 rounded-xl border border-emerald-200/60">
                            <h5 class="text-xs font-bold text-emerald-950 flex items-center gap-1.5 mb-1.5">
                                <i class="fa-solid fa-calculator text-emerald-600"></i> حاسبة تجريبية سريعة للمعاينة:
                            </h5>
                            <div class="flex items-center gap-2 text-xs">
                                <span>مسافة تجريبية:</span>
                                <input type="number" step="0.5" id="test-distance-input" value="12.5" class="w-20 p-1.5 border border-emerald-300 rounded-lg text-center font-bold font-serif bg-white">
                                <span>كم =</span>
                                <span id="test-calc-result" class="font-bold text-emerald-800 bg-white px-3 py-1 rounded-lg border border-emerald-300 font-serif">25 ج.م</span>
                            </div>
                        </div>
                    </div>

                    <!-- العمود الأيسر: الخريطة التفاعلية لتحديد موقع المحل -->
                    <div class="flex flex-col space-y-2">
                        <label class="block text-xs font-bold text-royal-dark flex items-center justify-between">
                            <span><i class="fa-solid fa-map-location-dot text-royal-darkgold"></i> خريطة موقع المحل (مركز الشحن الرئيسي)</span>
                            <span class="text-[10px] text-gray-400 font-normal">انقر أو اسحب الدبوس لتغيير موقع المحل</span>
                        </label>
                        <!-- شريط البحث بالخريطة -->
                        <div class="flex gap-2">
                            <input type="text" id="admin-map-search-input" placeholder="ابحث عن منطقة المحل / الشارع بالاسم..." class="flex-grow p-2.5 border border-gray-200 rounded-xl text-xs outline-none focus:border-royal-gold bg-white">
                            <button type="button" id="btn-admin-map-search" class="bg-royal-charcoal text-white hover:bg-royal-gold hover:text-royal-charcoal px-4 py-2 rounded-xl text-xs font-bold transition">بحث</button>
                        </div>
                        <div id="admin-store-map" class="h-80 w-full rounded-2xl border border-royal-gold/20 overflow-hidden shadow-inner z-10"></div>
                        <div class="bg-royal-sand/30 p-2.5 rounded-xl text-[10px] text-royal-dark text-center font-bold border border-royal-gold/15">
                            💡 سيتم احتساب المسافة بين هذا الدبوس وموقع العميل عند إتمام الطلب في صفحة الدفع.
                        </div>
                    </div>
                </div>

                <div class="pt-4 flex justify-end border-t">
                    <button type="submit" class="bg-royal-charcoal text-white hover:bg-royal-gold hover:text-royal-charcoal px-10 py-3.5 rounded-xl text-xs font-bold shadow-md transition-all btn-shine">
                        <i class="fa-solid fa-floppy-disk mr-1"></i> حفظ إعدادات الشحن بالكيلومتر وموقع المحل
                    </button>
                </div>
            </form>
        </div>
        
        <!-- كارت 2: إدارة محافظات ومناطق جمهورية مصر العربية (التسعير الثابت كبديل) -->
        <div class="bg-white p-6 border border-royal-gold/10 shadow-sm rounded-2xl">
            <div class="border-b pb-4 mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h3 class="font-serif font-bold text-base text-royal-dark flex items-center gap-2">
                        <span>🇪🇬</span>
                        تسعير محافظات ومناطق جمهورية مصر العربية (التسعير المباشر)
                    </h3>
                    <p class="text-xs text-gray-400 mt-1">العملة: <strong class="text-royal-dark font-bold">ج.م (الجنيه المصري)</strong> | عدد المحافظات المسجلة: <strong class="text-royal-dark font-bold"><?php echo count($shipping_zones); ?></strong></p>
                </div>
            </div>

            <!-- شريط الأدوات السريعة (تطبيق سعر موحد + إضافة محافظة) -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 bg-royal-cream/20 p-4 rounded-xl border border-royal-gold/10">
                <!-- أداة السعر الموحد -->
                <form method="POST" action="admin_settings.php?tab=shipping" class="flex items-center gap-2">
                    <input type="number" step="0.5" name="mass_cost" placeholder="سعر موحد لكل المحافظات..." required class="w-48 p-2.5 border border-gray-200 rounded-xl text-xs bg-white outline-none focus:border-royal-gold font-bold">
                    <button type="submit" name="mass_update_country_cost" class="bg-royal-sand hover:bg-royal-gold text-royal-dark hover:text-white px-4 py-2.5 rounded-xl text-xs font-bold transition shadow-sm whitespace-nowrap">
                        تطبيق على كل المحافظات
                    </button>
                </form>

                <!-- أداة إضافة محافظة / مدينة جديدة -->
                <form method="POST" action="admin_settings.php?tab=shipping" class="flex items-center gap-2 justify-end">
                    <input type="text" name="new_gov_name" placeholder="اسم محافظة/مدينة مصرية جديدة..." required class="flex-grow p-2.5 border border-gray-200 rounded-xl text-xs bg-white outline-none focus:border-royal-gold">
                    <input type="number" step="0.5" name="new_gov_cost" value="50.00" class="w-24 p-2.5 border border-gray-200 rounded-xl text-xs bg-white outline-none focus:border-royal-gold font-bold" title="سعر الشحن">
                    <button type="submit" name="add_new_governorate" class="bg-gold-gradient text-white hover:bg-gold-gradient-hover px-4 py-2.5 rounded-xl text-xs font-bold transition shadow-sm whitespace-nowrap btn-shine">
                        إضافة +
                    </button>
                </form>
            </div>

            <!-- نموذج تعديل وحفظ أسعار المحافظات -->
            <form id="shipping-settings-form" method="POST" action="admin_settings.php?tab=shipping" class="space-y-6">
                <input type="hidden" name="update_shipping_zones" value="1">
                
                <?php if(empty($shipping_zones)): ?>
                    <div class="text-center py-12 bg-gray-50 border border-dashed rounded-xl">
                        <p class="text-xs text-gray-400 font-medium">لا توجد محافظات مضافة حتى الآن. يمكنك إضافة مدن جديدة من النموذج بالأعلى.</p>
                    </div>
                <?php else: ?>
                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        <?php foreach($shipping_zones as $z): ?>
                            <div class="border p-4 rounded-xl transition-all duration-300 <?php echo !$z['is_active'] ? 'opacity-40 bg-gray-50 border-gray-200' : 'bg-white border-royal-gold/15 shadow-sm hover:border-royal-gold/40'; ?>">
                                <div class="flex justify-between items-center mb-3">
                                    <label class="font-bold text-royal-dark text-xs flex items-center gap-2 cursor-pointer select-none">
                                        <input type="checkbox" name="gov_active[<?php echo $z['id']; ?>]" value="1" <?php echo $z['is_active'] ? 'checked' : ''; ?> class="w-4 h-4 accent-royal-gold cursor-pointer rounded"> 
                                        <span><?php echo htmlspecialchars($z['gov_name']); ?></span>
                                    </label>
                                    <div class="flex items-center gap-1.5">
                                        <span class="text-[9px] px-2 py-0.5 rounded font-bold <?php echo $z['is_active'] ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'; ?>">
                                            <?php echo $z['is_active'] ? 'شحن متاح' : 'موقف'; ?>
                                        </span>
                                        <a href="admin_settings.php?tab=shipping&action=delete_gov&gov_id=<?php echo $z['id']; ?>" onclick="return confirm('هل تريد بالتأكيد حذف هذه المحافظة؟')" class="text-gray-300 hover:text-red-600 p-1 text-xs transition-colors" title="حذف المحافظة">
                                            <i class="fa-solid fa-trash-can"></i>
                                        </a>
                                    </div>
                                </div>
                                
                                <div class="flex items-center gap-2">
                                    <span class="text-xs text-gray-400 font-medium whitespace-nowrap">سعر الشحن:</span>
                                    <div class="relative flex-grow">
                                        <input type="number" step="0.5" name="gov_cost[<?php echo $z['id']; ?>]" value="<?php echo $z['cost']; ?>" class="w-full p-2.5 text-xs border border-gray-200 rounded-lg outline-none focus:border-royal-gold font-serif font-bold text-royal-dark text-left bg-royal-cream/20 focus:bg-white" dir="ltr">
                                        <span class="absolute left-3 top-2.5 text-[10px] text-gray-500 font-bold">ج.م</span>
                                    </div>
                                </div>
                            </div>
                        <?php endforeach; ?>
                    </div>

                    <div class="pt-4 flex justify-between items-center border-t">
                        <div class="text-xs text-gray-400">
                            تم تحديد <span class="font-bold text-royal-darkgold"><?php echo count($shipping_zones); ?></span> منطقة ومحافظة
                        </div>
                        <button type="submit" class="bg-royal-charcoal text-white hover:bg-royal-gold hover:text-royal-charcoal px-10 py-3.5 rounded-xl text-xs font-bold shadow-md transition-all btn-shine">
                            حفظ أسعار شحن المحافظات
                        </button>
                    </div>
                <?php endif; ?>
            </form>
        </div>

    </div>

    <!-- كود جافاسكريبت الخاص بخريطة تحديد مركز المحل وحاسبة المعاينة -->
    <script>
    document.addEventListener('DOMContentLoaded', function() {
        const storeLatEl = document.getElementById('store_lat');
        const storeLngEl = document.getElementById('store_lng');
        const storeAddrEl = document.getElementById('store_address_name');
        
        const defaultLat = parseFloat(storeLatEl.value) || 30.0444;
        const defaultLng = parseFloat(storeLngEl.value) || 31.2357;

        if (document.getElementById('admin-store-map')) {
            const adminMap = L.map('admin-store-map').setView([defaultLat, defaultLng], 14);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom: 19,
                attribution: '© OpenStreetMap'
            }).addTo(adminMap);

            const redIcon = new L.Icon({
                iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
                shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
                iconSize: [25, 41],
                iconAnchor: [12, 41],
                popupAnchor: [1, -34],
                shadowSize: [41, 41]
            });

            let storeMarker = L.marker([defaultLat, defaultLng], {
                draggable: true,
                icon: redIcon
            }).addTo(adminMap);

            storeMarker.bindPopup("<b>📍 موقع المحل / مركز الشحن</b>").openPopup();

            function updateAdminCoords(lat, lng) {
                storeLatEl.value = lat.toFixed(6);
                storeLngEl.value = lng.toFixed(6);
                
                // جلب اسم المنطقة
                fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=ar`)
                    .then(res => res.json())
                    .then(data => {
                        if (data && data.display_name && (!storeAddrEl.value || storeAddrEl.value === 'الفرع الرئيسي / مركز الشحن والتوزيع')) {
                            const road = data.address.road || data.address.suburb || data.address.neighbourhood || '';
                            const city = data.address.city || data.address.town || data.address.state || '';
                            storeAddrEl.value = [road, city].filter(Boolean).join('، ') || data.display_name.split('،')[0];
                        }
                    }).catch(e => console.log(e));
            }

            storeMarker.on('dragend', function(e) {
                const pos = e.target.getLatLng();
                updateAdminCoords(pos.lat, pos.lng);
            });

            adminMap.on('click', function(e) {
                storeMarker.setLatLng(e.latlng);
                updateAdminCoords(e.latlng.lat, e.latlng.lng);
            });

            // زر GPS للمدير
            document.getElementById('btn-get-admin-gps').addEventListener('click', function() {
                if (navigator.geolocation) {
                    this.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري جلب الموقع...';
                    navigator.geolocation.getCurrentPosition((pos) => {
                        this.innerHTML = '<i class="fa-solid fa-location-crosshairs text-royal-darkgold"></i> تم التحديد بنجاح!';
                        const lat = pos.coords.latitude;
                        const lng = pos.coords.longitude;
                        adminMap.setView([lat, lng], 16);
                        storeMarker.setLatLng([lat, lng]);
                        updateAdminCoords(lat, lng);
                    }, () => {
                        alert('تعذر الوصول لموقعك الحالي. يمكنك سحب الدبوس على الخريطة يدوياً.');
                        this.innerHTML = '<i class="fa-solid fa-location-crosshairs text-royal-darkgold"></i> تحديد موقعي الحالي';
                    });
                }
            });

            // بحث الخريطة في لوحة التحكم
            function performAdminSearch() {
                const q = document.getElementById('admin-map-search-input').value.trim();
                if (!q) return;
                const btn = document.getElementById('btn-admin-map-search');
                btn.innerText = "جاري...";
                btn.disabled = true;
                
                fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&accept-language=ar&limit=1`)
                    .then(res => res.json())
                    .then(data => {
                        btn.innerText = "بحث";
                        btn.disabled = false;
                        if (data && data.length > 0) {
                            const lat = parseFloat(data[0].lat);
                            const lng = parseFloat(data[0].lon);
                            adminMap.setView([lat, lng], 16);
                            storeMarker.setLatLng([lat, lng]);
                            updateAdminCoords(lat, lng);
                        } else {
                            alert("لم يتم العثور على نتائج، يرجى كتابة اسم المنطقة بشكل أوضح.");
                        }
                    }).catch(() => {
                        btn.innerText = "بحث";
                        btn.disabled = false;
                    });
            }

            document.getElementById('btn-admin-map-search').addEventListener('click', performAdminSearch);
            document.getElementById('admin-map-search-input').addEventListener('keypress', function(e) {
                if (e.key === 'Enter') { e.preventDefault(); performAdminSearch(); }
            });
        }

        // حاسبة المعاينة التفاعلية
        const testDistInput = document.getElementById('test-distance-input');
        const kmRateInput = document.getElementById('admin_km_rate');
        const kmBaseMinInput = document.getElementById('admin_km_base_min');
        const testResultSpan = document.getElementById('test-calc-result');

        function updateTestCalc() {
            const dist = parseFloat(testDistInput.value) || 0;
            const rate = parseFloat(kmRateInput.value) || 2;
            const baseMin = parseFloat(kmBaseMinInput.value) || 25;
            
            let cost = 0;
            if (dist <= 1.0) {
                cost = baseMin;
            } else {
                const extraDist = dist - 1.0;
                cost = baseMin + Math.round(extraDist * rate);
            }
            testResultSpan.innerText = cost + ' ج.م';
        }

        if (testDistInput) {
            testDistInput.addEventListener('input', updateTestCalc);
            kmRateInput.addEventListener('input', updateTestCalc);
            kmBaseMinInput.addEventListener('input', updateTestCalc);
            updateTestCalc();
        }
    });
    </script>
    <?php endif; ?>

    <!-- TAB 3: 🎨 الواجهة والسلايدر -->
    <?php if ($active_tab === 'theme'): ?>
    <div class="bg-white p-6 border border-royal-gold/10 shadow-sm mb-8 rounded-2xl animate-fade-in">
        <h3 class="font-serif font-bold text-sm text-royal-dark mb-4 border-b pb-2 flex items-center gap-1.5"><i class="fa-solid fa-bullhorn text-royal-darkgold"></i> شريط التنبيهات العلوي</h3>
        <form method="POST" action="admin_settings.php?tab=theme" class="space-y-4">
            <input type="text" name="announcement_bar" value="<?php echo htmlspecialchars($settings['announcement_bar'] ?? ''); ?>" placeholder="اكتب نص الإعلان المرفق بالأعلى" class="w-full p-3 border border-gray-200 rounded-xl outline-none focus:border-royal-gold text-xs bg-royal-cream/35">
            <button type="submit" name="update_announcement" class="bg-royal-charcoal text-white px-8 py-3 font-bold text-xs rounded-xl hover:bg-royal-gold hover:text-royal-charcoal shadow transition-all">حفظ نص الشريط العلوي</button>
        </form>
    </div>

    <!-- السلايدر المتحرك -->
    <div class="bg-white p-6 border border-royal-gold/10 shadow-sm mb-8 rounded-2xl animate-fade-in">
        <h3 class="font-serif font-bold text-sm text-royal-dark mb-6 border-b pb-2 flex items-center gap-1.5"><i class="fa-regular fa-images text-royal-darkgold"></i> سلايدر البانر المتحرك (Home Page Carousel)</h3>
        
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <!-- نموذج إضافة شريحة جديدة -->
            <form method="POST" action="admin_settings.php?tab=theme" enctype="multipart/form-data" class="space-y-4 bg-royal-sand/20 p-5 rounded-2xl border border-royal-gold/10">
                <h4 class="font-bold text-xs text-royal-darkgold border-b pb-2 mb-2"><i class="fa-solid fa-plus-circle"></i> إضافة صورة بنر متحرك جديدة</h4>
                <div>
                    <label class="block text-[10px] text-gray-500 font-bold mb-1">صورة البانر (1920x1080) *</label>
                    <input type="file" name="slide_file" accept="image/*" required class="w-full text-xs text-gray-500">
                </div>
                <div>
                    <label class="block text-[10px] text-gray-500 font-bold mb-1">العنوان الرئيسي (اختياري)</label>
                    <input type="text" name="slide_title" class="w-full p-2 border border-gray-200 rounded-lg text-xs outline-none focus:border-royal-gold">
                </div>
                <div>
                    <label class="block text-[10px] text-gray-500 font-bold mb-1">العنوان الفرعي (اختياري)</label>
                    <input type="text" name="slide_subtitle" class="w-full p-2 border border-gray-200 rounded-lg text-xs outline-none focus:border-royal-gold">
                </div>
                <div>
                    <label class="block text-[10px] text-gray-500 font-bold mb-1">رابط التوجيه (اختياري - افتراضياً المتجر)</label>
                    <input type="text" name="slide_link" placeholder="shop.php" class="w-full p-2 border border-gray-200 rounded-lg text-xs outline-none focus:border-royal-gold font-serif">
                </div>
                <div>
                    <label class="block text-[10px] text-gray-500 font-bold mb-1">رقم الترتيب (للفرز)</label>
                    <input type="number" name="slide_sort" value="0" class="w-full p-2 border border-gray-200 rounded-lg text-xs outline-none focus:border-royal-gold font-serif">
                </div>
                <button type="submit" name="add_slide" class="w-full bg-royal-charcoal text-white hover:bg-royal-gold hover:text-royal-charcoal text-xs py-3 font-bold rounded-xl shadow btn-shine transition-all">إضافة شريحة بنر جديدة</button>
            </form>

            <!-- جدول عرض صور البانر الحالية ومراجعتها وحذفها -->
            <div class="lg:col-span-2 overflow-x-auto border rounded-2xl overflow-hidden">
                <table class="w-full text-right text-xs">
                    <thead class="bg-royal-sand/40 text-gray-500 border-b font-bold">
                        <tr>
                            <th class="p-4 font-bold">معاينة البانر</th>
                            <th class="p-4 font-bold">العناوين</th>
                            <th class="p-4 font-bold">رابط التوجيه</th>
                            <th class="p-4 text-center font-bold">الترتيب</th>
                            <th class="p-4 text-center font-bold">إجراء</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-100 font-medium">
                        <?php foreach($slides as $slide): ?>
                        <tr>
                            <td class="p-4 w-28">
                                <img src="<?php echo htmlspecialchars($slide['image_url']); ?>" class="w-24 h-12 object-cover rounded-lg bg-gray-50 border shadow-inner">
                            </td>
                            <td class="p-4">
                                <div class="font-bold text-royal-dark text-xs"><?php echo htmlspecialchars($slide['title'] ?: '-'); ?></div>
                                <div class="text-[10px] text-gray-400 mt-1"><?php echo htmlspecialchars($slide['subtitle'] ?: '-'); ?></div>
                            </td>
                            <td class="p-4 font-serif text-[10px]"><?php echo htmlspecialchars($slide['link_url'] ?: 'shop.php'); ?></td>
                            <td class="p-4 text-center font-serif"><?php echo $slide['sort_order']; ?></td>
                            <td class="p-4 text-center">
                                <a href="admin_settings.php?tab=theme&action=delete_slide&id=<?php echo $slide['id']; ?>" onclick="return confirm('حذف صورة البانر هذه نهائياً؟')" class="text-red-500 hover:text-red-700 text-sm" title="حذف شريحة البانر"><i class="fa-solid fa-trash-can"></i></a>
                            </td>
                        </tr>
                        <?php endforeach; ?>
                    </tbody>
                </table>
            </div>
        </div>
    </div>
    <?php endif; ?>

    <!-- TAB 4: 📈 إعلانات ميتا وتتبع البكسل -->
    <?php if ($active_tab === 'meta'): ?>
    <div class="bg-white p-6 border border-royal-gold/10 shadow-sm mb-8 rounded-2xl animate-fade-in">
        <h3 class="font-serif font-bold text-sm text-royal-dark mb-4 border-b pb-2 flex items-center justify-between">
            <span class="flex items-center gap-1.5"><i class="fa-brands fa-facebook text-blue-600"></i> إعدادات ميتا بكسل (Meta Ads Pixel)</span>
            <?php if(!empty($settings['meta_pixel_id']) && ($settings['meta_pixel_enabled'] ?? '1') === '1'): ?>
                <span class="bg-green-100 text-green-700 text-[9px] px-2 py-0.5 rounded-full font-bold">مُفعّل ✓</span>
            <?php else: ?>
                <span class="bg-gray-100 text-gray-500 text-[9px] px-2 py-0.5 rounded-full font-bold">غير مفعّل</span>
            <?php endif; ?>
        </h3>
        <form method="POST" action="admin_settings.php?tab=meta" class="space-y-4 max-w-xl">
            <div>
                <label class="block text-[11px] font-bold text-gray-600 mb-1">معرّف ميتا بكسل (Meta Pixel ID):</label>
                <input type="text" name="meta_pixel_id" value="<?php echo htmlspecialchars($settings['meta_pixel_id'] ?? ''); ?>" placeholder="مثال: 123456789012345" class="w-full p-3 border border-gray-200 rounded-xl outline-none focus:border-royal-gold text-xs font-mono bg-royal-cream/35">
            </div>
            <div class="flex items-center gap-2 pt-1">
                <input type="checkbox" name="meta_pixel_enabled" id="pixel_active" value="1" <?php echo ($settings['meta_pixel_enabled'] ?? '1') === '1' ? 'checked' : ''; ?> class="w-4 h-4 text-royal-gold rounded accent-royal-darkgold cursor-pointer">
                <label for="pixel_active" class="text-xs font-bold text-royal-dark cursor-pointer">تفعيل تتبع إعلانات ميتا (Meta Pixel Standard Events)</label>
            </div>
            <button type="submit" name="update_meta_pixel" class="bg-royal-charcoal text-white px-8 py-3 font-bold text-xs rounded-xl hover:bg-royal-gold hover:text-royal-charcoal shadow transition-all">حفظ إعدادات Meta Pixel</button>
        </form>
    </div>
    <?php endif; ?>

    <!-- TAB 5: 🏷️ أقسام وتصنيفات المتجر -->
    <?php if ($active_tab === 'categories'): ?>
    <?php 
    $edit_cat_mode = false;
    $edit_cat = ['id'=>'', 'name'=>'', 'image_url'=>'', 'parent_id'=>''];
    if(isset($_GET['edit_cat_id'])) {
        $edit_cat_id = (int)$_GET['edit_cat_id'];
        $stmt = $pdo->prepare("SELECT * FROM categories WHERE id = ?");
        $stmt->execute([$edit_cat_id]);
        $cat_data = $stmt->fetch(PDO::FETCH_ASSOC);
        if($cat_data) {
            $edit_cat = $cat_data;
            $edit_cat_mode = true;
        }
    }

    // Fetch all categories with parent names and actual product counts
    $all_categories_query = "
        SELECT c.*, p.name AS parent_name,
               (SELECT COUNT(*) FROM products prod WHERE prod.category = c.name OR prod.sub_category = c.name) AS products_count
        FROM categories c
        LEFT JOIN categories p ON c.parent_id = p.id
        ORDER BY CASE WHEN c.parent_id IS NULL OR c.parent_id = 0 THEN 0 ELSE 1 END, c.parent_id ASC, c.name ASC
    ";
    $all_categories_list = $pdo->query($all_categories_query)->fetchAll(PDO::FETCH_ASSOC);

    $total_mains = 0;
    $total_subs = 0;
    $total_prods_assigned = 0;
    foreach ($all_categories_list as $row) {
        if (empty($row['parent_id'])) $total_mains++;
        else $total_subs++;
        $total_prods_assigned += (int)($row['products_count'] ?? 0);
    }
    ?>

    <!-- Top KPI & Action Bar on PC -->
    <div class="mb-6 grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div class="p-4 bg-white rounded-2xl border border-gray-100 shadow-2xs flex items-center gap-3">
            <div class="w-11 h-11 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold text-lg shrink-0">
                <i class="fa-solid fa-layer-group"></i>
            </div>
            <div>
                <span class="text-[11px] font-bold text-gray-400 block">إجمالي التصنيفات</span>
                <span class="text-lg font-black text-gray-800"><?php echo count($all_categories_list); ?></span>
            </div>
        </div>

        <div class="p-4 bg-white rounded-2xl border border-gray-100 shadow-2xs flex items-center gap-3">
            <div class="w-11 h-11 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-lg shrink-0">
                <i class="fa-solid fa-folder"></i>
            </div>
            <div>
                <span class="text-[11px] font-bold text-gray-400 block">أقسام رئيسية</span>
                <span class="text-lg font-black text-gray-800"><?php echo $total_mains; ?></span>
            </div>
        </div>

        <div class="p-4 bg-white rounded-2xl border border-gray-100 shadow-2xs flex items-center gap-3">
            <div class="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-lg shrink-0">
                <i class="fa-solid fa-tags"></i>
            </div>
            <div>
                <span class="text-[11px] font-bold text-gray-400 block">أقسام فرعية</span>
                <span class="text-lg font-black text-gray-800"><?php echo $total_subs; ?></span>
            </div>
        </div>

        <div class="p-4 bg-white rounded-2xl border border-gray-100 shadow-2xs flex items-center gap-3">
            <div class="w-11 h-11 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center font-bold text-lg shrink-0">
                <i class="fa-solid fa-cash-register"></i>
            </div>
            <div class="flex-1">
                <span class="text-[11px] font-bold text-gray-400 block">كاشير الويب</span>
                <a href="/pos/" target="_blank" class="text-xs font-bold text-sky-600 hover:underline flex items-center gap-1">
                    <span>فتح الكاشير</span> ⚡
                </a>
            </div>
        </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <!-- كارت إضافة / تعديل قسم (4 أعمدة على شاشات الكمبيوتر) -->
        <div class="lg:col-span-4 bg-white p-6 border border-royal-gold/15 shadow-sm rounded-3xl sticky top-4">
            <h3 class="font-serif font-bold text-sm text-royal-dark mb-4 pb-3 border-b border-gray-100 flex items-center justify-between">
                <span class="flex items-center gap-2">
                    <i class="fa-solid fa-folder-tree text-royal-gold text-base"></i> 
                    <?php echo $edit_cat_mode ? 'تعديل بيانات القسم' : 'إضافة تصنيف جديد'; ?>
                </span>
                <?php if($edit_cat_mode): ?>
                    <span class="px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 text-[10px] font-bold">وضع التعديل</span>
                <?php endif; ?>
            </h3>
            
            <form method="POST" action="admin_settings.php?tab=categories" enctype="multipart/form-data" class="space-y-4">
                <?php if($edit_cat_mode): ?>
                    <input type="hidden" name="cat_id" value="<?php echo $edit_cat['id']; ?>">
                <?php endif; ?>
                
                <div>
                    <label class="block text-xs font-bold mb-1.5 text-gray-700">اسم القسم أو التصنيف *</label>
                    <input type="text" name="cat_name" value="<?php echo htmlspecialchars($edit_cat['name']); ?>" placeholder="مثال: أجبان وألبان، عطارة..." required class="w-full p-3 border border-gray-200 rounded-xl outline-none focus:border-royal-gold text-xs font-bold text-gray-800 bg-gray-50/40 focus:bg-white transition-all">
                </div>

                <div>
                    <label class="block text-xs font-bold mb-1.5 text-gray-700">القسم الأب (التبعية) *</label>
                    <select name="parent_id" class="w-full p-3 border border-gray-200 rounded-xl outline-none focus:border-royal-gold text-xs font-bold text-gray-800 bg-gray-50/40 focus:bg-white transition-all">
                        <option value="none">-- قسم رئيسي مستقل (بدون أب) --</option>
                        <?php 
                        $main_cats_query = "SELECT * FROM categories WHERE parent_id IS NULL OR parent_id = 0";
                        if ($edit_cat_mode) {
                            $main_cats_query .= " AND id != " . (int)$edit_cat['id'];
                        }
                        $main_cats_query .= " ORDER BY name ASC";
                        $main_cats = $pdo->query($main_cats_query)->fetchAll(PDO::FETCH_ASSOC);
                        foreach($main_cats as $mc): 
                        ?>
                            <option value="<?php echo $mc['id']; ?>" <?php echo $edit_cat['parent_id'] == $mc['id'] ? 'selected' : ''; ?>>
                                📁 <?php echo htmlspecialchars($mc['name']); ?>
                            </option>
                        <?php endforeach; ?>
                    </select>
                    <p class="text-[10px] text-gray-400 mt-1">إذا اخترت قسماً رئيسياً، سيصبح هذا تصنيفاً فرعياً يتبع له.</p>
                </div>
                
                <div>
                    <label class="block text-xs font-bold mb-1.5 text-gray-700">صورة التصنيف (اختياري)</label>
                    <?php if($edit_cat_mode && !empty($edit_cat['image_url'])): ?>
                        <div class="mb-2 flex items-center gap-3 p-2 bg-gray-50 rounded-xl border border-gray-100">
                            <img src="<?php echo htmlspecialchars($edit_cat['image_url']); ?>" class="w-12 h-12 object-cover rounded-lg border border-gray-200">
                            <span class="text-[11px] text-gray-500 font-medium">الصورة الحالية للقسم</span>
                        </div>
                    <?php endif; ?>
                    <input type="file" name="cat_image" accept="image/*" class="w-full text-xs text-gray-500 file:mr-0 file:ml-3 file:py-2 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200 cursor-pointer">
                </div>
                
                <div class="flex gap-2 pt-2">
                    <button type="submit" name="<?php echo $edit_cat_mode ? 'edit_category' : 'add_category'; ?>" class="flex-1 bg-royal-charcoal hover:bg-royal-gold text-white hover:text-royal-charcoal text-xs py-3 font-bold rounded-xl shadow transition-all flex items-center justify-center gap-1.5 cursor-pointer">
                        <i class="fa-solid fa-check"></i>
                        <span><?php echo $edit_cat_mode ? 'تحديث وحفظ' : 'إضافة القسم للمتجر'; ?></span>
                    </button>
                    <?php if($edit_cat_mode): ?>
                        <a href="admin_settings.php?tab=categories" class="bg-gray-100 text-gray-700 px-4 py-3 text-xs font-bold rounded-xl hover:bg-gray-200 transition-colors flex items-center justify-center border">
                            إلغاء
                        </a>
                    <?php endif; ?>
                </div>
            </form>
        </div>

        <!-- جدول واستعراض الأقسام (8 أعمدة على شاشات الكمبيوتر) -->
        <div class="lg:col-span-8 bg-white border border-royal-gold/15 shadow-sm rounded-3xl overflow-hidden flex flex-col">
            <!-- Header with Search & Filter -->
            <div class="p-4 bg-gray-50/70 border-b border-gray-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <div class="flex items-center gap-2">
                    <span class="w-8 h-8 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center font-bold text-xs">
                        <i class="fa-solid fa-list-check"></i>
                    </span>
                    <h3 class="font-bold text-xs sm:text-sm text-gray-800">قائمة الأقسام والتصنيفات في المتجر</h3>
                </div>

                <!-- Instant Search Bar -->
                <div class="relative w-full sm:w-64">
                    <i class="fa-solid fa-magnifying-glass absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
                    <input type="text" id="admin-cat-search" oninput="filterAdminCategories(this.value)" placeholder="ابحث في الأقسام..." class="w-full bg-white border border-gray-200 rounded-xl pr-8 pl-3 py-1.5 text-xs font-medium focus:border-royal-gold outline-none">
                </div>
            </div>

            <!-- Table -->
            <div class="overflow-x-auto">
                <table class="w-full text-right text-xs" id="admin-categories-table">
                    <thead class="bg-gray-50/50 text-gray-400 border-b border-gray-100">
                        <tr>
                            <th class="p-3.5 font-bold w-16 text-center">أيقونة</th>
                            <th class="p-3.5 font-bold">اسم القسم</th>
                            <th class="p-3.5 font-bold">النوع والتبعية</th>
                            <th class="p-3.5 font-bold text-center">عدد الأصناف</th>
                            <th class="p-3.5 text-center font-bold">إجراءات</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-100 font-medium">
                        <?php if(empty($all_categories_list)): ?>
                            <tr>
                                <td colspan="5" class="p-12 text-center text-gray-400 text-xs">
                                    <i class="fa-solid fa-folder-open text-3xl mb-2 text-gray-300 block"></i>
                                    لا توجد تصنيفات أو أقسام مضافة حتى الآن.
                                </td>
                            </tr>
                        <?php else: ?>
                            <?php foreach($all_categories_list as $c): 
                                $is_sub = !empty($c['parent_id']);
                                $count = (int)($c['products_count'] ?? 0);
                            ?>
                            <tr class="cat-table-row hover:bg-amber-50/30 transition-colors <?php echo $is_sub ? 'bg-gray-50/30' : ''; ?>" data-name="<?php echo htmlspecialchars(mb_strtolower($c['name'])); ?>" data-parent="<?php echo htmlspecialchars(mb_strtolower($c['parent_name'] ?? '')); ?>">
                                <td class="p-3.5 text-center w-16">
                                    <?php if(!empty($c['image_url'])): ?>
                                        <img src="<?php echo htmlspecialchars($c['image_url']); ?>" class="w-9 h-9 object-cover rounded-xl border border-gray-100 mx-auto shadow-2xs">
                                    <?php else: ?>
                                        <div class="w-9 h-9 rounded-xl <?php echo $is_sub ? 'bg-sky-50 text-sky-600' : 'bg-amber-50 text-amber-700'; ?> flex items-center justify-center text-xs font-bold mx-auto border border-gray-100 shadow-2xs">
                                            <i class="<?php echo $is_sub ? 'fa-solid fa-tag' : 'fa-solid fa-folder'; ?>"></i>
                                        </div>
                                    <?php endif; ?>
                                </td>
                                <td class="p-3.5 font-bold text-gray-900 text-xs sm:text-sm">
                                    <?php if($is_sub): ?>
                                        <span class="text-amber-500 ml-1 font-mono text-xs">↳</span>
                                    <?php endif; ?>
                                    <?php echo htmlspecialchars($c['name']); ?>
                                </td>
                                <td class="p-3.5">
                                    <?php if(!$is_sub): ?>
                                        <span class="bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-full font-bold text-[10px] inline-flex items-center gap-1">
                                            <i class="fa-solid fa-layer-group text-[9px]"></i> قسم رئيسي أساسي
                                        </span>
                                    <?php else: ?>
                                        <span class="bg-indigo-50 text-indigo-700 border border-indigo-200 px-2.5 py-1 rounded-full font-bold text-[10px] inline-flex items-center gap-1">
                                            <i class="fa-solid fa-arrow-turn-down-right text-[9px]"></i> فرعي تابع لـ: <?php echo htmlspecialchars($c['parent_name'] ?? 'رئيسي'); ?>
                                        </span>
                                    <?php endif; ?>
                                </td>
                                <td class="p-3.5 text-center">
                                    <span class="px-2.5 py-1 rounded-lg text-xs font-mono font-bold <?php echo $count > 0 ? 'bg-gray-100 text-gray-800' : 'bg-gray-50 text-gray-400'; ?>">
                                        <?php echo $count; ?> صنف
                                    </span>
                                </td>
                                <td class="p-3.5 text-center space-x-2 space-x-reverse">
                                    <a href="admin_settings.php?tab=categories&edit_cat_id=<?php echo $c['id']; ?>" class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 font-bold text-xs transition">
                                        <i class="fa-solid fa-pen-to-square text-[11px]"></i> تعديل
                                    </a>
                                    <a href="admin_settings.php?tab=categories&action=delete_category&id=<?php echo $c['id']; ?>" onclick="return confirm('هل أنت متأكد من رغبتك في حذف قسم (<?php echo htmlspecialchars($c['name']); ?>)؟ سيتم تحويل كافة المنتجات التابعة له إلى قسم عام.')" class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 font-bold text-xs transition">
                                        <i class="fa-solid fa-trash text-[11px]"></i> حذف
                                    </a>
                                </td>
                            </tr>
                            <?php endforeach; ?>
                        <?php endif; ?>
                    </tbody>
                </table>
            </div>

            <!-- Table Filter Script -->
            <script>
            function filterAdminCategories(query) {
                const q = (query || '').toLowerCase().trim();
                const rows = document.querySelectorAll('.cat-table-row');
                rows.forEach(r => {
                    const name = r.getAttribute('data-name') || '';
                    const parent = r.getAttribute('data-parent') || '';
                    if (!q || name.includes(q) || parent.includes(q)) {
                        r.style.display = '';
                    } else {
                        r.style.display = 'none';
                    }
                });
            }
            </script>
        </div>
    </div>
    <?php endif; ?>
</div>

<?php
include 'footer.php';
?>
