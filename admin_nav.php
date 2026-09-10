<?php
if (!isAdmin()) {
    header("Location: login.php");
    exit;
}
$current_admin_page = basename($_SERVER['PHP_SELF']);
$current_tab = $_GET['tab'] ?? '';
?>
<div class="bg-white border-b border-gray-200/80 py-3 px-4 shadow-xs">
    <div class="container mx-auto max-w-7xl">
        <!-- Top Row: Core Action & Main Operations -->
        <div class="flex items-center justify-between gap-3 flex-wrap pb-2.5 border-b border-gray-100">
            <!-- POS Quick Launcher -->
            <div class="flex items-center gap-2">
                <a href="/pos/" target="_blank" class="px-4 py-2 rounded-xl transition-all bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm font-black flex items-center gap-2 border border-emerald-500 text-xs cursor-pointer">
                    <i class="fa-solid fa-cash-register text-amber-300"></i>
                    <span>🛒 كاشير الويب (POS) ⚡</span>
                </a>
            </div>

            <!-- Operations Section -->
            <div class="flex items-center gap-1.5 flex-wrap text-xs font-bold">
                <a href="admin_dashboard.php" class="px-3 py-1.5 rounded-xl transition-all <?php echo $current_admin_page == 'admin_dashboard.php' ? 'bg-royal-charcoal text-white shadow-xs' : 'text-gray-600 hover:text-royal-dark hover:bg-gray-100 border border-gray-100'; ?>">
                    <i class="fa-solid fa-chart-line ml-1"></i> الإحصائيات
                </a>
                <a href="admin_orders.php" class="px-3 py-1.5 rounded-xl transition-all <?php echo in_array($current_admin_page, ['admin_orders.php', 'admin_order_details.php']) ? 'bg-royal-charcoal text-white shadow-xs' : 'text-gray-600 hover:text-royal-dark hover:bg-gray-100 border border-gray-100'; ?>">
                    <i class="fa-solid fa-receipt ml-1"></i> الطلبات
                </a>
                <a href="admin_delivery.php" class="px-3 py-1.5 rounded-xl transition-all <?php echo $current_admin_page == 'admin_delivery.php' ? 'bg-royal-charcoal text-white shadow-xs' : 'text-gray-600 hover:text-royal-dark hover:bg-gray-100 border border-gray-100'; ?>">
                    <i class="fa-solid fa-motorcycle text-amber-500 ml-1"></i> الدليفري
                </a>
                <a href="admin_customers.php" class="px-3 py-1.5 rounded-xl transition-all <?php echo $current_admin_page == 'admin_customers.php' ? 'bg-royal-charcoal text-white shadow-xs' : 'text-gray-600 hover:text-royal-dark hover:bg-gray-100 border border-gray-100'; ?>">
                    <i class="fa-solid fa-users text-cyan-600 ml-1"></i> العملاء
                </a>
                <a href="admin_products.php" class="px-3 py-1.5 rounded-xl transition-all <?php echo in_array($current_admin_page, ['admin_products.php', 'admin_edit_product.php']) ? 'bg-royal-charcoal text-white shadow-xs' : 'text-gray-600 hover:text-royal-dark hover:bg-gray-100 border border-gray-100'; ?>">
                    <i class="fa-solid fa-box-open ml-1"></i> المنتجات
                </a>
                <a href="admin_settings.php?tab=categories" class="px-3 py-1.5 rounded-xl transition-all <?php echo ($current_admin_page == 'admin_settings.php' && $current_tab == 'categories') ? 'bg-royal-gold text-royal-dark font-black shadow-xs' : 'text-gray-700 bg-amber-50/80 hover:bg-amber-100/90 border border-amber-200/80'; ?>">
                    <i class="fa-solid fa-layer-group text-amber-600 ml-1"></i> 🏷️ الأقسام والتصنيفات
                </a>
            </div>
        </div>

        <!-- Second Row: Inventory, Suppliers & Settings Navigation -->
        <div class="flex items-center justify-between gap-2 flex-wrap pt-2 text-[11px] font-bold text-gray-500">
            <div class="flex items-center gap-1 flex-wrap">
                <span class="text-gray-400 font-normal ml-1">المخزون والموردين:</span>
                <a href="admin_purchases.php" class="px-2.5 py-1 rounded-lg <?php echo $current_admin_page == 'admin_purchases.php' ? 'bg-gray-800 text-white' : 'hover:bg-gray-100 text-gray-600'; ?>">
                    <i class="fa-solid fa-truck-ramp-box text-amber-500 ml-0.5"></i> المشتريات
                </a>
                <a href="admin_suppliers.php" class="px-2.5 py-1 rounded-lg <?php echo $current_admin_page == 'admin_suppliers.php' ? 'bg-gray-800 text-white' : 'hover:bg-gray-100 text-gray-600'; ?>">
                    <i class="fa-solid fa-handshake text-blue-500 ml-0.5"></i> الموردين
                </a>
                <a href="admin_coupons.php" class="px-2.5 py-1 rounded-lg <?php echo $current_admin_page == 'admin_coupons.php' ? 'bg-gray-800 text-white' : 'hover:bg-gray-100 text-gray-600'; ?>">
                    <i class="fa-solid fa-tags ml-0.5"></i> الكوبونات
                </a>
                <a href="admin_abandoned_carts.php" class="px-2.5 py-1 rounded-lg <?php echo $current_admin_page == 'admin_abandoned_carts.php' ? 'bg-gray-800 text-white' : 'hover:bg-gray-100 text-gray-600'; ?>">
                    <i class="fa-solid fa-cart-arrow-down text-rose-500 ml-0.5"></i> السلات المتروكة
                </a>
            </div>

            <div class="flex items-center gap-1 flex-wrap">
                <span class="text-gray-400 font-normal ml-1">الإعدادات:</span>
                <a href="admin_settings.php?tab=general" class="px-2.5 py-1 rounded-lg <?php echo ($current_admin_page == 'admin_settings.php' && ($current_tab == 'general' || empty($current_tab))) ? 'bg-gray-800 text-white' : 'hover:bg-gray-100 text-gray-600'; ?>">
                    هوية المتجر
                </a>
                <a href="admin_settings.php?tab=payments" class="px-2.5 py-1 rounded-lg <?php echo ($current_admin_page == 'admin_settings.php' && $current_tab == 'payments') ? 'bg-gray-800 text-white' : 'hover:bg-gray-100 text-gray-600'; ?>">
                    الدفع
                </a>
                <a href="admin_settings.php?tab=shipping" class="px-2.5 py-1 rounded-lg <?php echo ($current_admin_page == 'admin_settings.php' && $current_tab == 'shipping') ? 'bg-gray-800 text-white' : 'hover:bg-gray-100 text-gray-600'; ?>">
                    الشحن
                </a>
                <a href="admin_settings.php?tab=theme" class="px-2.5 py-1 rounded-lg <?php echo ($current_admin_page == 'admin_settings.php' && $current_tab == 'theme') ? 'bg-gray-800 text-white' : 'hover:bg-gray-100 text-gray-600'; ?>">
                    السلايدر
                </a>
                <a href="admin_settings.php?tab=security" class="px-2.5 py-1 rounded-lg <?php echo ($current_admin_page == 'admin_settings.php' && $current_tab == 'security') ? 'bg-gray-800 text-white' : 'hover:bg-gray-100 text-gray-600'; ?>">
                    🔐 كلمة المرور
                </a>
                <a href="admin_backup.php" class="px-2.5 py-1 rounded-lg <?php echo $current_admin_page == 'admin_backup.php' ? 'bg-gray-800 text-white' : 'hover:bg-gray-100 text-gray-600'; ?>">
                    النسخ الاحتياطي
                </a>
            </div>
        </div>
    </div>
</div>
<div class="bg-royal-sand/20 py-2.5 px-4 text-center border-b border-royal-gold/5 text-[10px] text-royal-darkgold font-bold">
    <i class="fa-solid fa-lock"></i> لوحة تحكم المسؤول الآمنة (بيئة الإدارة)
</div>
