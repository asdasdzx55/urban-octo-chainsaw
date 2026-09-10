<?php
if (!isAdmin()) {
    header("Location: login.php");
    exit;
}
$current_admin_page = basename($_SERVER['PHP_SELF']);
?>
<div class="bg-white border-b border-royal-gold/10 py-4 px-4 shadow-sm">
    <div class="container mx-auto max-w-6xl">
        <div class="grid grid-cols-2 sm:grid-cols-3 md:flex md:flex-wrap md:justify-center gap-2 text-center text-xs font-bold">
            <a href="/pos/" target="_blank" class="px-3.5 py-2.5 rounded-xl transition-all bg-emerald-600 hover:bg-emerald-700 text-white shadow-md font-black flex items-center justify-center gap-1.5 border border-emerald-500 animate-pulse">
                <i class="fa-solid fa-cash-register block md:inline mb-1 md:mb-0 text-amber-300"></i> 🛒 كاشير الويب (POS) ⚡
            </a>
            <a href="admin_dashboard.php" class="px-3 py-2.5 rounded-xl transition-all <?php echo $current_admin_page == 'admin_dashboard.php' ? 'bg-royal-charcoal text-white shadow-sm' : 'text-gray-500 hover:text-royal-dark hover:bg-royal-sand border border-gray-100'; ?>">
                <i class="fa-solid fa-chart-line block md:inline mb-1 md:mb-0"></i> لوحة الإحصائيات
            </a>
            <a href="admin_orders.php" class="px-3 py-2.5 rounded-xl transition-all <?php echo in_array($current_admin_page, ['admin_orders.php', 'admin_order_details.php']) ? 'bg-royal-charcoal text-white shadow-sm' : 'text-gray-500 hover:text-royal-dark hover:bg-royal-sand border border-gray-100'; ?>">
                <i class="fa-solid fa-receipt block md:inline mb-1 md:mb-0"></i> طلبات العملاء
            </a>
            <a href="admin_customers.php" class="px-3 py-2.5 rounded-xl transition-all <?php echo $current_admin_page == 'admin_customers.php' ? 'bg-royal-charcoal text-white shadow-sm' : 'text-gray-500 hover:text-royal-dark hover:bg-royal-sand border border-gray-100'; ?>">
                <i class="fa-solid fa-users block md:inline mb-1 md:mb-0 text-cyan-600"></i> 👥 دليل العملاء
            </a>
            <a href="admin_purchases.php" class="px-3 py-2.5 rounded-xl transition-all <?php echo $current_admin_page == 'admin_purchases.php' ? 'bg-royal-charcoal text-white shadow-sm' : 'text-gray-500 hover:text-royal-dark hover:bg-royal-sand border border-gray-100'; ?>">
                <i class="fa-solid fa-truck-ramp-box block md:inline mb-1 md:mb-0 text-amber-500"></i> فواتير المشتريات
            </a>
            <a href="admin_suppliers.php" class="px-3 py-2.5 rounded-xl transition-all <?php echo $current_admin_page == 'admin_suppliers.php' ? 'bg-royal-charcoal text-white shadow-sm' : 'text-gray-500 hover:text-royal-dark hover:bg-royal-sand border border-gray-100'; ?>">
                <i class="fa-solid fa-handshake block md:inline mb-1 md:mb-0 text-blue-500"></i> إدارة الموردين
            </a>
            <a href="admin_delivery.php" class="px-3 py-2.5 rounded-xl transition-all <?php echo $current_admin_page == 'admin_delivery.php' ? 'bg-royal-charcoal text-white shadow-sm' : 'text-gray-500 hover:text-royal-dark hover:bg-royal-sand border border-gray-100'; ?>">
                <i class="fa-solid fa-motorcycle block md:inline mb-1 md:mb-0 text-amber-500"></i> 🛵 إدارة الدليفري والطيارين
            </a>
            <a href="admin_abandoned_carts.php" class="px-3 py-2.5 rounded-xl transition-all <?php echo $current_admin_page == 'admin_abandoned_carts.php' ? 'bg-royal-charcoal text-white shadow-sm' : 'text-gray-500 hover:text-royal-dark hover:bg-royal-sand border border-gray-100'; ?>">
                <i class="fa-solid fa-cart-arrow-down block md:inline mb-1 md:mb-0 text-red-500"></i> السلات المتروكة
            </a>
            <a href="admin_products.php" class="px-3 py-2.5 rounded-xl transition-all <?php echo in_array($current_admin_page, ['admin_products.php', 'admin_edit_product.php']) ? 'bg-royal-charcoal text-white shadow-sm' : 'text-gray-500 hover:text-royal-dark hover:bg-royal-sand border border-gray-100'; ?>">
                <i class="fa-solid fa-box-open block md:inline mb-1 md:mb-0"></i> المنتجات والمعرض
            </a>
            <a href="admin_coupons.php" class="px-3 py-2.5 rounded-xl transition-all <?php echo $current_admin_page == 'admin_coupons.php' ? 'bg-royal-charcoal text-white shadow-sm' : 'text-gray-500 hover:text-royal-dark hover:bg-royal-sand border border-gray-100'; ?>">
                <i class="fa-solid fa-tags block md:inline mb-1 md:mb-0"></i> كوبونات الخصم
            </a>
            <a href="admin_settings.php?tab=general" class="px-3 py-2.5 rounded-xl transition-all <?php echo ($current_admin_page == 'admin_settings.php' && ($_GET['tab'] ?? 'general') == 'general') ? 'bg-royal-charcoal text-white shadow-sm' : 'text-gray-500 hover:text-royal-dark hover:bg-royal-sand border border-gray-100'; ?>">
                <i class="fa-solid fa-store block md:inline mb-1 md:mb-0 text-royal-gold"></i> 🏛️ هوية المتجر
            </a>
            <a href="admin_settings.php?tab=security" class="px-3 py-2.5 rounded-xl transition-all <?php echo ($current_admin_page == 'admin_settings.php' && ($_GET['tab'] ?? '') == 'security') ? 'bg-royal-charcoal text-white shadow-sm' : 'text-gray-500 hover:text-royal-dark hover:bg-royal-sand border border-gray-100'; ?>">
                <i class="fa-solid fa-key block md:inline mb-1 md:mb-0 text-red-500"></i> 🔐 كلمة المرور
            </a>
            <a href="admin_settings.php?tab=payments" class="px-3 py-2.5 rounded-xl transition-all <?php echo ($current_admin_page == 'admin_settings.php' && ($_GET['tab'] ?? '') == 'payments') ? 'bg-royal-charcoal text-white shadow-sm' : 'text-gray-500 hover:text-royal-dark hover:bg-royal-sand border border-gray-100'; ?>">
                <i class="fa-solid fa-credit-card block md:inline mb-1 md:mb-0"></i> 💳 وسائل الدفع
            </a>
            <a href="admin_settings.php?tab=shipping" class="px-3 py-2.5 rounded-xl transition-all <?php echo ($current_admin_page == 'admin_settings.php' && ($_GET['tab'] ?? '') == 'shipping') ? 'bg-royal-charcoal text-white shadow-sm' : 'text-gray-500 hover:text-royal-dark hover:bg-royal-sand border border-gray-100'; ?>">
                <i class="fa-solid fa-truck-fast block md:inline mb-1 md:mb-0"></i> 🚚 مناطق الشحن
            </a>
            <a href="admin_settings.php?tab=colors" class="px-3 py-2.5 rounded-xl transition-all <?php echo ($current_admin_page == 'admin_settings.php' && ($_GET['tab'] ?? '') == 'colors') ? 'bg-royal-charcoal text-white shadow-sm' : 'text-gray-500 hover:text-royal-dark hover:bg-royal-sand border border-gray-100'; ?>">
                <i class="fa-solid fa-palette block md:inline mb-1 md:mb-0 text-royal-gold"></i> 🎨 ألوان المتجر
            </a>
            <a href="admin_settings.php?tab=theme" class="px-3 py-2.5 rounded-xl transition-all <?php echo ($current_admin_page == 'admin_settings.php' && ($_GET['tab'] ?? '') == 'theme') ? 'bg-royal-charcoal text-white shadow-sm' : 'text-gray-500 hover:text-royal-dark hover:bg-royal-sand border border-gray-100'; ?>">
                <i class="fa-regular fa-images block md:inline mb-1 md:mb-0"></i> 🖼️ السلايدر والإعلان
            </a>
            <a href="admin_settings.php?tab=categories" class="px-3 py-2.5 rounded-xl transition-all <?php echo ($current_admin_page == 'admin_settings.php' && ($_GET['tab'] ?? '') == 'categories') ? 'bg-royal-charcoal text-white shadow-sm' : 'text-gray-500 hover:text-royal-dark hover:bg-royal-sand border border-gray-100'; ?>">
                <i class="fa-solid fa-layer-group block md:inline mb-1 md:mb-0"></i> 🏷️ الأقسام
            </a>
            <a href="admin_settings.php?tab=meta" class="px-3 py-2.5 rounded-xl transition-all <?php echo ($current_admin_page == 'admin_settings.php' && ($_GET['tab'] ?? '') == 'meta') ? 'bg-royal-charcoal text-white shadow-sm' : 'text-gray-500 hover:text-royal-dark hover:bg-royal-sand border border-gray-100'; ?>">
                <i class="fa-brands fa-facebook block md:inline mb-1 md:mb-0"></i> 📈 ميتا وإعلانات
            </a>
            <a href="admin_info.php" class="px-3 py-2.5 rounded-xl transition-all <?php echo $current_admin_page == 'admin_info.php' ? 'bg-royal-charcoal text-white shadow-sm' : 'text-gray-500 hover:text-royal-dark hover:bg-royal-sand border border-gray-100'; ?>">
                <i class="fa-solid fa-robot block md:inline mb-1 md:mb-0"></i> السياسات والذكاء
            </a>
            <a href="admin_notifications.php" class="px-3 py-2.5 rounded-xl transition-all <?php echo $current_admin_page == 'admin_notifications.php' ? 'bg-royal-charcoal text-white shadow-sm' : 'text-gray-500 hover:text-royal-dark hover:bg-royal-sand border border-gray-100'; ?>">
                <i class="fa-solid fa-bell block md:inline mb-1 md:mb-0"></i> إشعارات التطبيق
            </a>
            <a href="admin_backup.php" class="px-3 py-2.5 rounded-xl transition-all <?php echo $current_admin_page == 'admin_backup.php' ? 'bg-royal-charcoal text-white shadow-sm' : 'text-gray-500 hover:text-royal-dark hover:bg-royal-sand border border-gray-100'; ?>">
                <i class="fa-solid fa-cloud-arrow-down block md:inline mb-1 md:mb-0 text-royal-gold"></i> النسخ الاحتياطي
            </a>
        </div>
    </div>
</div>
<div class="bg-royal-sand/20 py-2.5 px-4 text-center border-b border-royal-gold/5 text-[10px] text-royal-darkgold font-bold">
    <i class="fa-solid fa-lock"></i> لوحة تحكم المسؤول الآمنة (بيئة الإدارة)
</div>
