<?php
require_once 'config.php';
$current_page = basename($_SERVER['PHP_SELF']);
$cart_count = isset($_SESSION['cart']) ? array_sum(array_column($_SESSION['cart'], 'qty')) : 0;

// جلب جميع الأقسام الرئيسية والفرعية بشكل هرمي (Tree)
$categories_tree = [];
$main_categories = $pdo->query("SELECT * FROM categories WHERE parent_id IS NULL ORDER BY name ASC")->fetchAll(PDO::FETCH_ASSOC);
foreach ($main_categories as $mc) {
    $sub_stmt = $pdo->prepare("SELECT * FROM categories WHERE parent_id = ? ORDER BY name ASC");
    $sub_stmt->execute([$mc['id']]);
    $subs = $sub_stmt->fetchAll(PDO::FETCH_ASSOC);
    $categories_tree[] = [
        'id' => $mc['id'],
        'name' => $mc['name'],
        'image_url' => $mc['image_url'],
        'subs' => $subs
    ];
}

// مصفوفات عامة لاستخدامها في باقي الصفحات والإدارة
$categories_list = $main_categories;
$all_categories_list = $pdo->query("SELECT c.*, p.name as parent_name FROM categories c LEFT JOIN categories p ON c.parent_id = p.id ORDER BY COALESCE(c.parent_id, c.id) ASC, c.parent_id IS NOT NULL ASC, c.name ASC")->fetchAll(PDO::FETCH_ASSOC);

$announcement_bar = $settings['announcement_bar'] ?? '';

// حساب عدد عناصر قائمة الأمنيات
$wishlist_count = 0;
if (isset($_SESSION['user_id'])) {
    $stmt_wish_count = $pdo->prepare("SELECT COUNT(*) FROM wishlist WHERE user_id = ?");
    $stmt_wish_count->execute([$_SESSION['user_id']]);
    $wishlist_count = $stmt_wish_count->fetchColumn();
} else {
    $wishlist_count = isset($_SESSION['wishlist']) ? count($_SESSION['wishlist']) : 0;
}

// تتبع وتسجيل زيارات العملاء تلقائياً
if (function_exists('trackVisitor')) {
    trackVisitor();
}
?>
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    
    <!-- PWA & iOS Configurations -->
    <link rel="manifest" href="manifest.json">
    <meta name="theme-color" content="#0f172a">
    <meta name="mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
    <meta name="apple-mobile-web-app-title" content="المنزل السوري">
    <meta name="application-name" content="المنزل السوري">
    <link rel="icon" type="image/png" href="images/store-icon-96.png">
    <link rel="apple-touch-icon" href="images/store-icon-192.png">

    <title><?php echo htmlspecialchars($settings['store_name'] ?? 'المنزل السوري'); ?><?php echo !empty($settings['store_tagline']) ? ' | ' . htmlspecialchars($settings['store_tagline']) : ' | سوبر ماركت المنزل السوري'; ?></title>
    <!-- Tailwind CSS -->
    <script src="https://cdn.tailwindcss.com"></script>
    <!-- Google Fonts -->
    <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;600;700;800&family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400&display=swap" rel="stylesheet">
    <!-- Font Awesome -->
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <!-- Swiper.js CSS (For sliders) -->
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.css" />
    
    <!-- Meta Pixel Code -->
    <?php 
    $meta_pixel_id = trim($settings['meta_pixel_id'] ?? '');
    $meta_pixel_enabled = ($settings['meta_pixel_enabled'] ?? '1') === '1';
    if ($meta_pixel_enabled && !empty($meta_pixel_id)): 
    ?>
    <script>
      !function(f,b,e,v,n,t,s)
      {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
      n.callMethod.apply(n,arguments):n.queue.push(arguments)};
      if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
      n.queue=[];t=b.createElement(e);t.async=!0;
      t.src=v;s=b.getElementsByTagName(e)[0];
      s.parentNode.insertBefore(t,s)}(window, document,'script',
      'https://connect.facebook.net/en_US/fbevents.js');
      fbq('init', '<?php echo htmlspecialchars($meta_pixel_id); ?>');
      fbq('track', 'PageView');
      <?php if (isset($_SESSION['meta_add_to_cart_event'])): 
          $added_item = $_SESSION['meta_add_to_cart_event'];
          unset($_SESSION['meta_add_to_cart_event']);
      ?>
      fbq('track', 'AddToCart', {
        content_ids: ['<?php echo $added_item['id']; ?>'],
        content_name: '<?php echo addslashes(htmlspecialchars($added_item['name'])); ?>',
        value: <?php echo (float)($added_item['price'] * $added_item['qty']); ?>,
        currency: 'EGP'
      });
      <?php endif; ?>
    </script>
    <noscript>
      <img height="1" width="1" style="display:none" src="https://www.facebook.com/tr?id=<?php echo htmlspecialchars($meta_pixel_id); ?>&ev=PageView&noscript=1"/>
    </noscript>
    <?php endif; ?>
    
    <?php
    $theme_primary = $settings['theme_primary_color'] ?? '#2563eb';
    $theme_secondary = $settings['theme_secondary_color'] ?? '#1d4ed8';
    $theme_accent = $settings['theme_accent_color'] ?? '#3b82f6';
    $theme_header_bg = $settings['theme_header_bg'] ?? '#0f172a';
    $theme_header_text = $settings['theme_header_text'] ?? '#ffffff';
    $theme_body_bg = $settings['theme_body_bg'] ?? '#f8fafc';
    $theme_card_bg = $settings['theme_card_bg'] ?? '#ffffff';
    $theme_btn_color = $settings['theme_btn_color'] ?? $theme_primary;
    $theme_btn_text = $settings['theme_btn_text'] ?? '#ffffff';
    ?>
    <script>
        tailwind.config = {
            theme: {
                extend: {
                    colors: {
                        royal: {
                            dark: '<?php echo $theme_header_bg; ?>',
                            charcoal: '<?php echo $theme_header_bg; ?>',
                            gold: '<?php echo $theme_primary; ?>',
                            lightgold: '<?php echo $theme_accent; ?>',
                            darkgold: '<?php echo $theme_secondary; ?>',
                            cream: '<?php echo $theme_card_bg; ?>',
                            sand: '<?php echo $theme_body_bg; ?>'
                        }
                    },
                    fontFamily: {
                        sans: ['Cairo', 'sans-serif'],
                        serif: ['Playfair Display', 'serif']
                    }
                }
            }
        }
    </script>
    <style>
        :root {
            --primary-color: <?php echo $theme_primary; ?>;
            --secondary-color: <?php echo $theme_secondary; ?>;
            --accent-color: <?php echo $theme_accent; ?>;
            --header-bg: <?php echo $theme_header_bg; ?>;
            --header-text: <?php echo $theme_header_text; ?>;
            --body-bg: <?php echo $theme_body_bg; ?>;
            --card-bg: <?php echo $theme_card_bg; ?>;
            --btn-color: <?php echo $theme_btn_color; ?>;
            --btn-text: <?php echo $theme_btn_text; ?>;
        }
        html, body {
            overflow-x: hidden;
            width: 100%;
            position: relative;
            background-color: var(--body-bg);
            scroll-behavior: smooth;
            color: #333;
            font-family: 'Cairo', sans-serif;
        }
        @media (max-width: 1023px) {
            body {
                padding-bottom: 75px;
            }
        }
        .font-serif {
            font-family: 'Playfair Display', serif;
        }
        .lux-border {
            border: 1px solid <?php echo $theme_primary; ?>33;
        }
        .lux-shadow {
            box-shadow: 0 10px 30px -15px rgba(17, 17, 17, 0.08);
        }
        .bg-gold-gradient {
            background: linear-gradient(135deg, <?php echo $theme_accent; ?> 0%, <?php echo $theme_primary; ?> 100%);
        }
        .bg-gold-gradient-hover:hover {
            background: linear-gradient(135deg, <?php echo $theme_primary; ?> 0%, <?php echo $theme_accent; ?> 100%);
        }
        /* Shine effect for buttons */
        .btn-shine {
            position: relative;
            overflow: hidden;
        }
        .btn-shine::after {
            content: '';
            position: absolute;
            top: -50%;
            left: -60%;
            width: 30%;
            height: 200%;
            background: rgba(255, 255, 255, 0.25);
            transform: rotate(45deg);
            transition: none;
        }
        .btn-shine:hover::after {
            left: 120%;
            transition: all 0.6s ease-in-out;
        }
        /* Fade-in transitions */
        .animate-fade-in {
            animation: fadeIn 0.8s ease-out forwards;
        }
        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }
        /* Product Card styles */
        .product-image-container img {
            transition: transform 0.8s cubic-bezier(0.25, 1, 0.5, 1);
        }
        .product-card:hover .product-image-container img {
            transform: scale(1.06);
        }
        .add-to-cart-btn {
            transform: translateY(100%);
            transition: all 0.4s cubic-bezier(0.25, 1, 0.5, 1);
            opacity: 0;
        }
        .product-card:hover .add-to-cart-btn {
            transform: translateY(0);
            opacity: 1;
        }
        /* Custom scrollbar */
        ::-webkit-scrollbar {
            width: 8px;
            height: 8px;
        }
        ::-webkit-scrollbar-track {
            background: #FAF8F5;
        }
        ::-webkit-scrollbar-thumb {
            background: #D4AF37;
            border-radius: 4px;
        }
        ::-webkit-scrollbar-thumb:hover {
            background: #B89047;
        }
        /* Header glassmorphism */
        .glass-header {
            background: rgba(255, 255, 255, 0.9);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            border-bottom: 1px solid rgba(212, 175, 55, 0.1);
        }
    </style>
</head>
<body class="flex flex-col min-h-screen animate-fade-in">

    <!-- ================= شريط التنبيهات العلوي ================= -->
    <?php if(!empty($announcement_bar)): ?>
    <div class="bg-royal-dark text-white text-center py-2.5 text-xs md:text-sm tracking-wider font-light border-b border-royal-gold/20 relative z-50">
        <?php echo htmlspecialchars($announcement_bar); ?>
    </div>
    <?php endif; ?>

    <!-- ================= شريط التنقل (Header) ================= -->
    <header class="glass-header sticky top-0 z-50 transition-all duration-300 shadow-sm">
        <div class="container mx-auto px-4 md:px-8 py-4 flex justify-between items-center">
            
            <!-- القائمة الرئيسية (شاشات الكمبيوتر) -->
            <nav class="hidden lg:flex flex-1 gap-8 items-center text-sm font-medium text-gray-800">
                <a href="index.php" class="relative py-1 hover:text-royal-gold transition duration-300 <?php echo $current_page=='index.php'?'text-royal-gold font-bold':''; ?>">
                    الرئيسية
                    <?php if($current_page=='index.php'): ?>
                        <span class="absolute bottom-0 right-0 w-full h-[2px] bg-royal-gold rounded-full"></span>
                    <?php endif; ?>
                </a>
                
                <!-- تصنيفات المتجر -->
                <div class="relative group">
                    <button class="relative py-1 hover:text-royal-gold transition duration-300 flex items-center gap-1 cursor-pointer <?php echo $current_page=='shop.php'?'text-royal-gold font-bold':''; ?>">
                        التصنيفات <i class="fa-solid fa-chevron-down text-[9px] transition-transform duration-300 group-hover:rotate-180"></i>
                    </button>
                    <!-- قائمة التصنيفات المنسدلة -->
                    <div class="opacity-0 invisible group-hover:opacity-100 group-hover:visible absolute right-0 mt-3 w-64 bg-white border border-royal-gold/15 shadow-2xl rounded-2xl z-50 transition-all duration-300 transform translate-y-2 group-hover:translate-y-0 overflow-hidden">
                        <div class="py-2">
                            <a href="shop.php" class="block px-5 py-2.5 text-xs text-royal-dark hover:bg-royal-sand hover:text-royal-darkgold transition font-bold border-b border-gray-100 flex justify-between items-center">
                                <span>كل المعروضات والأقسام</span>
                                <i class="fa-solid fa-store text-[10px] text-royal-gold"></i>
                            </a>
                            <div class="max-h-[350px] overflow-y-auto divide-y divide-gray-50">
                                <?php foreach($categories_tree as $cat_item): ?>
                                    <div class="py-2.5 px-4 hover:bg-royal-sand/30 transition">
                                        <a href="shop.php?category=<?php echo urlencode($cat_item['name']); ?>" class="block font-bold text-xs text-royal-dark hover:text-royal-darkgold flex justify-between items-center py-0.5">
                                            <span><?php echo htmlspecialchars($cat_item['name']); ?></span>
                                            <?php if(!empty($cat_item['subs'])): ?>
                                                <span class="text-[9px] text-royal-darkgold bg-royal-gold/15 px-1.5 py-0.5 rounded-full font-bold"><?php echo count($cat_item['subs']); ?></span>
                                            <?php endif; ?>
                                        </a>
                                        <?php if(!empty($cat_item['subs'])): ?>
                                            <div class="pr-3 mt-1 space-y-1 border-r-2 border-royal-gold/25">
                                                <?php foreach($cat_item['subs'] as $sub_item): ?>
                                                    <a href="shop.php?category=<?php echo urlencode($cat_item['name']); ?>&sub_category=<?php echo urlencode($sub_item['name']); ?>" class="block text-[11px] text-gray-500 hover:text-royal-darkgold py-0.5 transition flex items-center gap-1">
                                                        <i class="fa-solid fa-angle-left text-[8px] text-royal-gold"></i>
                                                        <span><?php echo htmlspecialchars($sub_item['name']); ?></span>
                                                    </a>
                                                <?php endforeach; ?>
                                            </div>
                                        <?php endif; ?>
                                    </div>
                                <?php endforeach; ?>
                            </div>
                        </div>
                    </div>
                </div>

                <a href="shop.php" class="relative py-1 hover:text-royal-gold transition duration-300">تسوق الآن</a>
                <a href="track.php" class="relative py-1 hover:text-royal-gold transition duration-300">تتبع الطلب</a>
                
                <?php if(isAdmin()): ?>
                    <a href="/pos/" target="_blank" class="bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 rounded-full text-xs font-bold transition flex items-center gap-1 shadow-sm"><i class="fa-solid fa-cash-register text-[10px] text-amber-300"></i> كاشير الويب</a>
                    <a href="admin_orders.php" class="text-royal-darkgold hover:text-royal-dark transition font-semibold flex items-center gap-1"><i class="fa-solid fa-crown text-xs"></i> لوحة الإدارة</a>
                <?php endif; ?>
            </nav>

            <!-- شعار المتجر -->
            <a href="index.php" class="flex-none flex items-center gap-2.5 px-4 py-1">
                <?php if (!empty($settings['store_logo'])): ?>
                    <img src="<?php echo htmlspecialchars($settings['store_logo']); ?>" class="h-10 max-h-12 w-auto object-contain rounded-lg shadow-sm border border-royal-gold/15" alt="<?php echo htmlspecialchars($settings['store_name'] ?? 'Logo'); ?>">
                <?php else: ?>
                    <div class="flex flex-col items-center sm:items-start">
                        <span class="font-serif text-xl tracking-wider text-royal-dark font-extrabold uppercase"><?php echo htmlspecialchars($settings['store_name'] ?? 'المتجر الإلكتروني'); ?></span>
                        <?php if (!empty($settings['store_tagline'])): ?>
                            <span class="text-[9px] text-royal-darkgold font-bold -mt-0.5 hidden sm:inline-block"><?php echo htmlspecialchars($settings['store_tagline']); ?></span>
                        <?php endif; ?>
                    </div>
                <?php endif; ?>
            </a>

            <!-- الأيقونات والأدوات (يسار) -->
            <div class="flex flex-1 justify-end items-center gap-4 md:gap-6">
                <!-- شريط البحث (مخفي في الجوال) -->
                <form method="GET" action="shop.php" class="hidden md:flex relative w-56">
                    <input type="text" name="search" placeholder="ابحث عن منتج..." value="<?php echo isset($_GET['search']) ? htmlspecialchars($_GET['search']) : ''; ?>" class="w-full bg-royal-sand/50 border border-royal-gold/15 rounded-full py-2 px-5 pr-11 text-xs focus:outline-none focus:border-royal-gold focus:bg-white transition-all shadow-inner">
                    <button type="submit" class="absolute right-3.5 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-royal-gold transition-colors"><i class="fa-solid fa-magnifying-glass text-sm"></i></button>
                </form>

                <!-- الحساب والتحقق -->
                <?php if(isset($_SESSION['user_id'])): ?>
                    <a href="profile.php" class="hidden lg:flex flex-col text-left items-end hover:text-royal-gold transition-colors">
                        <span class="text-[10px] text-gray-400 font-bold uppercase tracking-wider">مرحباً بك</span>
                        <span class="text-xs text-royal-dark font-bold hover:text-royal-gold"><?php echo htmlspecialchars($_SESSION['username']); ?></span>
                    </a>
                    <a href="profile.php" class="text-gray-500 hover:text-royal-gold transition-colors text-lg" title="حسابي"><i class="fa-regular fa-user"></i></a>
                <?php else: ?>
                    <a href="login.php" class="text-gray-500 hover:text-royal-gold transition-colors text-lg" title="تسجيل دخول"><i class="fa-regular fa-user"></i></a>
                <?php endif; ?>
                
                <!-- أيقونة المفضلة -->
                <a href="wishlist.php" class="relative text-gray-700 hover:text-royal-gold transition-colors text-xl flex items-center p-1.5 hover:scale-105 transition-transform" title="المفضلة">
                    <i class="fa-regular fa-heart"></i>
                    <?php if($wishlist_count > 0): ?>
                        <span class="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[9px] font-extrabold w-5 h-5 flex items-center justify-center rounded-full border-2 border-white shadow-md"><?php echo $wishlist_count; ?></span>
                    <?php endif; ?>
                </a>

                <!-- أيقونة السلة التفاعلية -->
                <a href="cart.php" class="relative text-gray-700 hover:text-royal-gold transition-colors text-xl flex items-center p-1.5 hover:scale-105 transition-transform" title="حقيبة التسوق">
                    <i class="fa-solid fa-bag-shopping"></i>
                    <?php if($cart_count > 0): ?>
                        <span class="absolute -top-1.5 -right-1.5 bg-royal-darkgold text-white text-[9px] font-extrabold w-5 h-5 flex items-center justify-center rounded-full border-2 border-white shadow-md animate-bounce"><?php echo $cart_count; ?></span>
                    <?php endif; ?>
                </a>
                
                <!-- زر القائمة للجوال -->
                <button id="mobile-menu-btn" class="lg:hidden text-gray-800 text-xl focus:outline-none ml-1 hover:text-royal-gold transition-colors"><i class="fa-solid fa-bars-staggered"></i></button>
            </div>
        </div>
        
        <!-- قائمة الجوال المنسدلة -->
        <div id="mobile-menu" class="hidden lg:hidden bg-white/95 backdrop-blur-lg border-t border-royal-gold/10 absolute w-full shadow-2xl z-50 animate-fade-in">
            <div class="flex flex-col p-6 space-y-4 text-right text-gray-800 font-semibold">
                <!-- البحث للجوال -->
                <form method="GET" action="shop.php" class="relative w-full mb-3">
                    <input type="text" name="search" placeholder="ابحثي هنا..." value="<?php echo isset($_GET['search']) ? htmlspecialchars($_GET['search']) : ''; ?>" class="w-full bg-royal-sand border border-royal-gold/20 rounded-xl py-3 px-5 pr-11 text-sm focus:outline-none focus:border-royal-gold focus:bg-white transition-all">
                    <button type="submit" class="absolute right-4.5 top-1/2 transform -translate-y-1/2 text-gray-400"><i class="fa-solid fa-magnifying-glass"></i></button>
                </form>

                <a href="index.php" class="hover:text-royal-gold border-b border-gray-50 pb-2.5 flex justify-between items-center">
                    <span>الرئيسية</span><i class="fa-solid fa-chevron-left text-[10px] text-gray-300"></i>
                </a>
                
                <!-- قائمة تصنيفات الجوال -->
                <div class="border-b border-gray-50 pb-2.5">
                    <button id="mobile-categories-btn" class="w-full flex justify-between items-center hover:text-royal-gold focus:outline-none">
                        <span>التصنيفات الأقسام</span><i class="fa-solid fa-chevron-down text-xs transition-transform duration-300" id="mobile-cat-icon"></i>
                    </button>
                    <div id="mobile-categories-menu" class="hidden flex-col pr-3 mt-3 space-y-3 text-xs text-gray-700 border-r-2 border-royal-gold">
                        <a href="shop.php" class="py-1 hover:text-royal-gold block font-bold text-royal-dark">كل المعروضات</a>
                        <?php foreach($categories_tree as $cat_item): ?>
                            <div class="space-y-1">
                                <a href="shop.php?category=<?php echo urlencode($cat_item['name']); ?>" class="block font-bold text-royal-dark hover:text-royal-gold">
                                    • <?php echo htmlspecialchars($cat_item['name']); ?>
                                </a>
                                <?php if(!empty($cat_item['subs'])): ?>
                                    <div class="pr-4 space-y-1 border-r border-royal-gold/30 text-[11px] text-gray-500">
                                        <?php foreach($cat_item['subs'] as $sub_item): ?>
                                            <a href="shop.php?category=<?php echo urlencode($cat_item['name']); ?>&sub_category=<?php echo urlencode($sub_item['name']); ?>" class="block py-0.5 hover:text-royal-darkgold">
                                                ↳ <?php echo htmlspecialchars($sub_item['name']); ?>
                                            </a>
                                        <?php endforeach; ?>
                                    </div>
                                <?php endif; ?>
                            </div>
                        <?php endforeach; ?>
                    </div>
                </div>

                <a href="shop.php" class="hover:text-royal-gold border-b border-gray-50 pb-2.5 flex justify-between items-center">
                    <span>تسوقي الكوليكشن</span><i class="fa-solid fa-chevron-left text-[10px] text-gray-300"></i>
                </a>
                
                <?php if(isAdmin()): ?>
                    <a href="admin_orders.php" class="text-royal-darkgold border-b border-gray-50 pb-2.5 flex justify-between items-center">
                        <span>لوحة التحكم للمدير</span><i class="fa-solid fa-crown text-[10px]"></i>
                    </a>
                <?php endif; ?>
                
                <?php if(!isset($_SESSION['user_id'])): ?>
                    <a href="login.php" class="text-royal-darkgold pt-3 flex items-center justify-center gap-2 border-t border-gray-100"><i class="fa-regular fa-user"></i> تسجيل الدخول / حساب جديد</a>
                <?php else: ?>
                    <div class="flex justify-between items-center pt-3 border-t border-gray-100">
                        <a href="profile.php" class="flex flex-col text-right hover:text-royal-gold transition-colors">
                            <span class="text-[10px] text-gray-400">حسابك الحالي</span>
                            <span class="text-xs font-bold text-royal-dark hover:text-royal-gold"><?php echo htmlspecialchars($_SESSION['username']); ?></span>
                        </a>
                        <a href="login.php?action=logout" class="text-red-500 text-xs border border-red-200 px-4 py-1.5 rounded-full hover:bg-red-50 transition-colors">خروج</a>
                    </div>
                <?php endif; ?>
            </div>
        </div>
    </header>

    <script> 
        document.getElementById('mobile-menu-btn').addEventListener('click', function() {
            document.getElementById('mobile-menu').classList.toggle('hidden');
        }); 
        document.getElementById('mobile-categories-btn').addEventListener('click', function() {
            const menu = document.getElementById('mobile-categories-menu');
            const icon = document.getElementById('mobile-cat-icon');
            menu.classList.toggle('hidden');
            menu.classList.toggle('flex');
            icon.style.transform = menu.classList.contains('hidden') ? 'rotate(0deg)' : 'rotate(180deg)';
        });
    </script>
