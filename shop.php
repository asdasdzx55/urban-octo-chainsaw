<?php
require_once 'config.php';
require_once __DIR__ . '/storefront_helpers.php';
$vis_sql = storefrontVisibleProductSql();

// الحصول على التصنيف والبحث المختار
$cat = isset($_GET['category']) ? trim($_GET['category']) : '';
$sub_cat = isset($_GET['sub_category']) ? trim($_GET['sub_category']) : '';
$search = isset($_GET['search']) ? trim($_GET['search']) : '';

// بناء الاستعلام الديناميكي
$query = "SELECT * FROM products WHERE {$vis_sql}";
$params = [];
if(!empty($cat) && !empty($sub_cat)) {
    $query .= " AND category = ? AND sub_category = ?";
    $params[] = $cat;
    $params[] = $sub_cat;
} elseif(!empty($cat)) {
    $query .= " AND category = ?";
    $params[] = $cat;
} elseif(!empty($sub_cat)) {
    $query .= " AND sub_category = ?";
    $params[] = $sub_cat;
}

if(!empty($search)) {
    $query .= " AND (name LIKE ? OR description LIKE ?)";
    $params[] = "%$search%";
    $params[] = "%$search%";
}
$query .= " ORDER BY id DESC";

// ترقيم الصفحات لضمان سرعة التحميل حتى مع آلاف المنتجات المصوّرة
$per_page = 24;
$page = max(1, (int)($_GET['page'] ?? 1));
$count_query = preg_replace('/^SELECT \* FROM products/', 'SELECT COUNT(*) FROM products', $query, 1);
$count_query = preg_replace('/ ORDER BY id DESC$/', '', $count_query);
$stmt_total = $pdo->prepare($count_query);
$stmt_total->execute($params);
$total_products = (int)$stmt_total->fetchColumn();
$total_pages = max(1, (int)ceil($total_products / $per_page));
if ($page > $total_pages) {
    $page = $total_pages;
}
$offset = ($page - 1) * $per_page;
$query .= " LIMIT {$per_page} OFFSET {$offset}";

$stmt = $pdo->prepare($query);
$stmt->execute($params);
$products = $stmt->fetchAll(PDO::FETCH_ASSOC);

include 'header.php';
?>
<!-- عنوان صفحة المتجر -->
<div class="bg-royal-sand/40 py-12 md:py-16 text-center border-b border-royal-gold/10">
    <div class="container mx-auto px-4">
        <span class="text-royal-darkgold text-xs font-bold tracking-widest uppercase mb-2 block"><?php echo htmlspecialchars($settings['store_name'] ?? 'STORE PRODUCTS'); ?></span>
        <h2 class="text-3xl md:text-4xl font-serif text-royal-dark font-bold">
            <?php 
            if (!empty($sub_cat)) {
                echo htmlspecialchars($cat ? $cat . ' / ' . $sub_cat : $sub_cat);
            } elseif (!empty($cat)) {
                echo htmlspecialchars($cat);
            } elseif (!empty($search)) {
                echo 'نتائج البحث عن: "' . htmlspecialchars($search) . '"';
            } else {
                echo 'كل المنتجات والمعروضات';
            }
            ?>
        </h2>
        <p class="text-gray-500 text-xs mt-3 font-light">تصفح تشكيلة متميزة من أفضل المنتجات بجودة عالية وأسعار منافسة مع تجربة تسوق سهلة وسريعة.</p>
    </div>
</div>

<div class="container mx-auto px-4 md:px-8 py-10 md:py-16">
    
    <!-- شريط تصفية الأقسام للجوال (Mobile Quick Categories Filter Bar) -->
    <div class="block lg:hidden mb-8">
        <div class="bg-white p-4 rounded-2xl border border-royal-gold/10 shadow-sm">
            <div class="flex justify-between items-center mb-3">
                <span class="text-xs font-bold text-royal-dark flex items-center gap-1.5"><i class="fa-solid fa-filter text-royal-darkgold"></i> تصفية حسب القسم:</span>
                <?php if(!empty($cat) || !empty($sub_cat) || !empty($search)): ?>
                    <a href="shop.php" class="text-[10px] text-red-500 font-bold hover:underline">إلغاء التصفية ✕</a>
                <?php endif; ?>
            </div>
            <div class="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
                <a href="shop.php" class="shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all <?php echo (empty($cat) && empty($sub_cat)) ? 'bg-royal-charcoal text-white shadow-sm' : 'bg-royal-sand/60 text-gray-700'; ?>">
                    كل المعروضات
                </a>
                <?php foreach($categories_tree as $c_mob): ?>
                    <a href="shop.php?category=<?php echo urlencode($c_mob['name']); ?>" class="shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all <?php echo ($cat === $c_mob['name'] && empty($sub_cat)) ? 'bg-royal-gold text-royal-charcoal shadow-sm' : 'bg-royal-sand/60 text-gray-700 hover:bg-royal-gold/20'; ?>">
                        <?php echo htmlspecialchars($c_mob['name']); ?>
                    </a>
                <?php endforeach; ?>
            </div>
        </div>
    </div>

    <!-- قسم الأقسام الفرعية المصورة عند النقر على قسم رئيسي (يظهر للشاشات والجوال) -->
    <?php if(!empty($cat) && empty($sub_cat)): ?>
        <?php 
        $selected_main_cat = null;
        foreach($categories_tree as $ct) {
            if ($ct['name'] === $cat) {
                $selected_main_cat = $ct;
                break;
            }
        }
        ?>
        <?php if ($selected_main_cat && !empty($selected_main_cat['subs'])): ?>
        <div class="mb-12 bg-white p-6 md:p-8 rounded-3xl border border-royal-gold/15 shadow-sm animate-fade-in">
            <div class="flex items-center justify-between border-b border-royal-gold/10 pb-4 mb-6">
                <h3 class="font-serif font-bold text-lg md:text-xl text-royal-dark flex items-center gap-2">
                    <i class="fa-solid fa-layer-group text-royal-darkgold"></i> 
                    الأقسام الفرعية لـ <span class="text-royal-darkgold"><?php echo htmlspecialchars($cat); ?></span>
                </h3>
                <span class="text-xs text-gray-400 font-light hidden sm:inline">اضغطي على أي قسم فرعي تالي لمشاهدة منتجاته الرسمية</span>
            </div>
            <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-6">
                <?php foreach($selected_main_cat['subs'] as $sub): 
                    $sub_img = !empty($sub['image_url']) ? $sub['image_url'] : $selected_main_cat['image_url'];
                    if (empty($sub_img)) {
                        $sub_img = 'https://placehold.co/400x500/f8f5f0/D4AF37?text=' . urlencode($sub['name']);
                    }
                ?>
                <a href="shop.php?category=<?php echo urlencode($cat); ?>&sub_category=<?php echo urlencode($sub['name']); ?>" class="group bg-royal-sand/20 hover:bg-royal-gold/10 p-3.5 rounded-2xl border border-royal-gold/10 hover:border-royal-gold shadow-sm hover:shadow-md transition-all duration-300 text-center flex flex-col items-center">
                    <div class="w-full aspect-square rounded-xl overflow-hidden mb-3 bg-white border border-gray-100 shadow-inner relative">
                        <img src="<?php echo htmlspecialchars($sub_img); ?>" alt="<?php echo htmlspecialchars($sub['name']); ?>" class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" loading="lazy" decoding="async">
                        <div class="absolute inset-0 bg-black/5 group-hover:bg-black/20 transition-colors"></div>
                    </div>
                    <h4 class="text-xs font-serif font-bold text-royal-dark group-hover:text-royal-darkgold transition-colors line-clamp-1 mb-1">
                        <?php echo htmlspecialchars($sub['name']); ?>
                    </h4>
                    <span class="text-[10px] text-royal-darkgold font-bold bg-white/90 px-2.5 py-1 rounded-full border border-royal-gold/20 shadow-2xs group-hover:bg-royal-gold group-hover:text-royal-charcoal transition-all">
                        تصفح المنتجات ➔
                    </span>
                </a>
                <?php endforeach; ?>
            </div>
        </div>
        <?php endif; ?>
    <?php endif; ?>

    <div class="flex flex-col lg:flex-row gap-8">
        
        <!-- القائمة الجانبية للتصنيفات (Desktop Sidebar) -->
        <aside class="w-full lg:w-1/4 shrink-0 hidden lg:block">
            <div class="bg-white p-6 rounded-2xl border border-royal-gold/10 shadow-sm sticky top-28 space-y-4">
                <div class="flex justify-between items-center border-b pb-3">
                    <h3 class="font-serif font-bold text-lg text-royal-dark flex items-center gap-2">
                        <i class="fa-solid fa-layer-group text-royal-darkgold text-sm"></i> تصنيفات المتجر
                    </h3>
                    <?php if(!empty($cat) || !empty($sub_cat) || !empty($search)): ?>
                        <a href="shop.php" class="text-[10px] text-red-500 font-bold hover:underline">إعادة ضبط ✕</a>
                    <?php endif; ?>
                </div>

                <ul class="space-y-2.5 text-xs">
                    <!-- خيار كل المنتجات -->
                    <li>
                        <a href="shop.php" class="flex justify-between items-center py-2.5 px-3 rounded-xl transition-all <?php echo (empty($cat) && empty($sub_cat)) ? 'bg-royal-charcoal text-white font-bold shadow-md' : 'text-gray-700 hover:bg-royal-sand/60 hover:text-royal-darkgold'; ?>">
                            <span class="flex items-center gap-2"><i class="fa-solid fa-store text-[11px]"></i> كل المنتجات المعروضة</span>
                            <span class="<?php echo (empty($cat) && empty($sub_cat)) ? 'bg-royal-gold text-royal-charcoal' : 'bg-royal-gold/20 text-royal-darkgold'; ?> text-[10px] px-2 py-0.5 rounded-full font-bold">
                                <?php echo $pdo->query("SELECT COUNT(*) FROM products WHERE {$vis_sql}")->fetchColumn(); ?>
                            </span>
                        </a>
                    </li>
                    
                    <?php 
                    foreach($categories_tree as $mc): 
                        $is_active_main = ($cat === $mc['name']);
                        
                        // إجمالي منتجات القسم الرئيسي
                        $stmt_count = $pdo->prepare("SELECT COUNT(*) FROM products WHERE category = ? AND {$vis_sql}");
                        $stmt_count->execute([$mc['name']]);
                        $main_count = $stmt_count->fetchColumn();
                    ?>
                    <li class="rounded-xl overflow-hidden border border-royal-gold/10 bg-royal-cream/20">
                        <!-- رابط التصنيف الأساسي -->
                        <a href="shop.php?category=<?php echo urlencode($mc['name']); ?>" class="flex justify-between items-center py-2.5 px-3 transition-all <?php echo ($is_active_main && empty($sub_cat)) ? 'bg-royal-gold/20 text-royal-darkgold font-bold border-r-4 border-royal-darkgold' : 'text-royal-dark font-bold hover:bg-royal-sand/60'; ?>">
                            <span class="flex items-center gap-2">
                                <i class="fa-solid fa-folder-open text-[11px] <?php echo $is_active_main ? 'text-royal-darkgold' : 'text-gray-400'; ?>"></i>
                                <?php echo htmlspecialchars($mc['name']); ?>
                            </span>
                            <span class="bg-royal-gold/20 text-royal-darkgold text-[10px] px-2 py-0.5 rounded-full font-bold">
                                <?php echo $main_count; ?>
                            </span>
                        </a>
                        
                        <!-- التصنيفات الفرعية المعروضة تحت التصنيف الأساسي -->
                        <?php if(!empty($mc['subs'])): ?>
                            <ul class="py-2 pr-5 pl-2 space-y-1 bg-white/90 border-t border-gray-100 border-r-2 border-royal-gold/30">
                                <?php foreach($mc['subs'] as $s): 
                                    $is_active_sub = ($sub_cat === $s['name']);
                                    
                                    $stmt_sub_count = $pdo->prepare("SELECT COUNT(*) FROM products WHERE category = ? AND sub_category = ? AND {$vis_sql}");
                                    $stmt_sub_count->execute([$mc['name'], $s['name']]);
                                    $sub_count = $stmt_sub_count->fetchColumn();
                                    
                                    if ($sub_count == 0) {
                                        $stmt_sub_count2 = $pdo->prepare("SELECT COUNT(*) FROM products WHERE sub_category = ? AND {$vis_sql}");
                                        $stmt_sub_count2->execute([$s['name']]);
                                        $sub_count = $stmt_sub_count2->fetchColumn();
                                    }
                                ?>
                                    <li>
                                        <a href="shop.php?category=<?php echo urlencode($mc['name']); ?>&sub_category=<?php echo urlencode($s['name']); ?>" class="flex justify-between items-center py-1.5 px-2.5 rounded-lg transition-all text-[11px] <?php echo $is_active_sub ? 'bg-royal-charcoal text-white font-bold shadow-sm' : 'text-gray-600 hover:text-royal-darkgold hover:bg-royal-sand/40'; ?>">
                                            <span class="flex items-center gap-1.5">
                                                <i class="fa-solid fa-turn-down-right text-[8px] opacity-70"></i>
                                                <?php echo htmlspecialchars($s['name']); ?>
                                            </span>
                                            <span class="<?php echo $is_active_sub ? 'bg-royal-gold text-royal-charcoal' : 'bg-gray-100 text-gray-500'; ?> text-[9px] px-1.5 py-0.2 rounded-full font-bold">
                                                <?php echo $sub_count; ?>
                                            </span>
                                        </a>
                                    </li>
                                <?php endforeach; ?>
                            </ul>
                        <?php endif; ?>
                    </li>
                    <?php endforeach; ?>
                </ul>
            </div>
        </aside>

        <!-- شبكة عرض المنتجات -->
        <main class="flex-grow">
            <?php if(empty($products)): ?>
                <div class="text-center py-24 bg-white rounded-2xl border border-royal-gold/10 shadow-sm">
                    <i class="fa-regular fa-folder-open text-6xl text-gray-200 mb-6"></i>
                    <h3 class="text-xl text-gray-500 font-serif mb-3 font-semibold">عذراً، لا توجد منتجات متوفرة حالياً</h3>
                    <p class="text-gray-400 text-xs max-w-xs mx-auto mb-8 font-light leading-relaxed">المتجر جاهز ومفرغ بالكامل، يمكنك إضافة منتجات جديدة من لوحة التحكم.</p>
                    <a href="shop.php" class="bg-royal-charcoal text-white px-8 py-3.5 text-xs font-bold tracking-widest uppercase hover:bg-royal-gold hover:text-royal-charcoal transition-all shadow-md rounded-xl btn-shine">تصفح كل المنتجات</a>
                </div>
            <?php else: ?>
                <!-- فرز أو خيارات التصفح السريع -->
                <div class="flex justify-between items-center mb-8 text-xs text-gray-500 font-medium">
                    <div>تم العثور على <span class="text-royal-darkgold font-bold font-serif text-sm"><?php echo count($products); ?></span> منتج</div>
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-8">
                    <?php foreach($products as $p): $p['image_url'] = resolveProductDisplayImage($pdo, $p); ?>
                        <div class="product-card group relative flex flex-col bg-white rounded-xl overflow-hidden shadow-sm border border-royal-gold/5 p-3 hover:shadow-lg transition-shadow">
                            <!-- الصورة والتأثيرات -->
                            <a href="product.php?id=<?php echo $p['id']; ?>" class="product-image-container block overflow-hidden bg-gray-50 aspect-[4/5] relative rounded-lg">
                                <?php if($p['old_price'] && $p['old_price'] > $p['price']): $discount = round((($p['old_price'] - $p['price']) / $p['old_price']) * 100); ?>
                                    <span class="absolute top-3 left-3 bg-red-600 text-white text-[9px] font-bold tracking-wider py-1 px-2.5 rounded-full z-10">خصم <?php echo $discount; ?>%</span>
                                <?php endif; ?>

                                <!-- زر قائمة الأمنيات (القلب) -->
                                <button type="button" onclick="toggleWishlist(event, <?php echo $p['id']; ?>)" class="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center shadow-md transition-all z-20 focus:outline-none hover:scale-110">
                                    <i class="<?php echo in_wishlist($p['id']) ? 'fa-solid text-red-500' : 'fa-regular text-gray-400'; ?> fa-heart text-sm"></i>
                                </button>

                        <?php 
                        $hover_img = getProductHoverImage($p['id'], $p['image_url']); 
                        $has_hover = ($hover_img !== $p['image_url']);
                        ?>
                        <div class="relative w-full h-full">
                            <img src="<?php echo htmlspecialchars($p['image_url'] ?: 'placeholder.php?w=800&h=1000'); ?>" class="w-full h-full object-cover transition-all duration-700 <?php echo $has_hover ? 'group-hover:scale-105 group-hover:opacity-0' : ''; ?>" alt="<?php echo htmlspecialchars($p['name']); ?>" loading="lazy" decoding="async">
                            <?php if($has_hover): ?>
                                <img src="<?php echo htmlspecialchars($hover_img); ?>" class="absolute inset-0 w-full h-full object-cover scale-95 opacity-0 transition-all duration-700 group-hover:scale-105 group-hover:opacity-100" alt="<?php echo htmlspecialchars($p['name']); ?>" loading="lazy" decoding="async">
                            <?php endif; ?>
                        </div>
                                
                                <!-- زر الإضافة للسلة أو اختيار الوزن السريع عند الحوم -->
                                <div class="absolute inset-x-0 bottom-0 p-3 z-10 add-to-cart-btn">
                                    <?php if(!empty($p['is_weight_based'])): ?>
                                        <a href="product.php?id=<?php echo $p['id']; ?>" class="w-full bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold py-3 transition shadow-lg rounded-lg btn-shine flex items-center justify-center gap-1.5">
                                            ⚖️ اختر الوزن <i class="fa-solid fa-arrow-left text-[10px]"></i>
                                        </a>
                                    <?php else: ?>
                                        <form method="POST" action="">
                                            <input type="hidden" name="return_page" value="shop.php<?php echo (!empty($cat) ? '?category='.urlencode($cat) : ''); ?>">
                                            <input type="hidden" name="product_id" value="<?php echo $p['id']; ?>">
                                            <input type="hidden" name="product_name" value="<?php echo htmlspecialchars($p['name']); ?>">
                                            <input type="hidden" name="product_price" value="<?php echo $p['price']; ?>">
                                            <input type="hidden" name="product_image" value="<?php echo htmlspecialchars($p['image_url']); ?>">
                                            <button type="submit" name="add_to_cart" class="w-full bg-royal-charcoal text-white hover:bg-royal-gold hover:text-royal-charcoal text-xs font-bold py-3 transition shadow-lg rounded-lg btn-shine">أضف للسلة <i class="fa-solid fa-cart-plus mr-1"></i></button>
                                        </form>
                                    <?php endif; ?>
                                </div>
                            </a>
                            <!-- تفاصيل الكارت -->
                            <div class="pt-4 pb-2 text-center">
                                <a href="product.php?id=<?php echo $p['id']; ?>" class="block text-sm font-semibold text-royal-dark mb-1.5 hover:text-royal-gold transition-colors duration-300"><?php echo htmlspecialchars($p['name']); ?></a>
                                
                                <!-- التقييم بالنجوم -->
                                <?php 
                                $rating_data = getProductRating($p['id']);
                                if ($rating_data['count'] > 0): 
                                ?>
                                    <div class="flex justify-center items-center gap-1 mb-2 text-[10px]">
                                        <div class="flex gap-0.5"><?php echo renderStars($rating_data['avg']); ?></div>
                                        <span class="text-gray-450 font-bold font-serif">(<?php echo $rating_data['count']; ?>)</span>
                                    </div>
                                <?php endif; ?>

                                <div class="flex justify-center items-center gap-2">
                                    <span class="text-royal-darkgold font-serif text-base font-bold">
                                        <?php echo htmlspecialchars($p['price']); ?> <?php echo htmlspecialchars($settings['store_currency'] ?? 'ج.م'); ?>
                                        <?php if(!empty($p['is_weight_based'])): ?>
                                            <span class="text-[10px] text-gray-400 font-normal">/ كيلو</span>
                                        <?php endif; ?>
                                    </span>
                                    <?php if($p['old_price'] && $p['old_price'] > $p['price']): ?>
                                        <span class="text-gray-400 font-serif text-xs line-through"><?php echo htmlspecialchars($p['old_price']); ?> <?php echo htmlspecialchars($settings['store_currency'] ?? 'ج.م'); ?></span>
                                    <?php endif; ?>
                                </div>
                            </div>
                        </div>
                    <?php endforeach; ?>
                </div>
            <?php endif; ?>
        <?php if (isset($total_pages) && $total_pages > 1): ?>
            <div class="mt-10 flex flex-wrap items-center justify-center gap-2">
                <?php
                $qp = $_GET;
                $renderPageLink = function(int $pNum, string $label, bool $active = false) use ($qp): string {
                    $qp['page'] = $pNum;
                    $url = 'shop.php?' . http_build_query($qp);
                    $cls = $active
                        ? 'bg-royal-charcoal text-royal-gold border-royal-charcoal font-bold shadow-md'
                        : 'bg-white text-gray-700 hover:bg-royal-sand border-royal-gold/20';
                    return '<a href="' . htmlspecialchars($url) . '" class="px-4 py-2 rounded-xl border text-xs transition ' . $cls . '">' . $label . '</a>';
                };
                if ($page > 1) echo $renderPageLink($page - 1, 'السابق');
                $start_p = max(1, $page - 2);
                $end_p = min($total_pages, $page + 2);
                for ($i = $start_p; $i <= $end_p; $i++) {
                    echo $renderPageLink($i, (string)$i, $i === $page);
                }
                if ($page < $total_pages) echo $renderPageLink($page + 1, 'التالي');
                ?>
            </div>
        <?php endif; ?>
        </main>

    </div>
</div>

<?php
include 'footer.php';
?>

<script>
    function toggleWishlist(event, productId) {
        event.preventDefault();
        event.stopPropagation();
        
        const btn = event.currentTarget;
        const icon = btn.querySelector('i');
        
        const formData = new FormData();
        formData.append('product_id', productId);
        
        fetch('ajax_wishlist.php', {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                if (data.action === 'added') {
                    icon.classList.remove('fa-regular', 'text-gray-400');
                    icon.classList.add('fa-solid', 'text-red-500');
                } else {
                    icon.classList.remove('fa-solid', 'text-red-500');
                    icon.classList.add('fa-regular', 'text-gray-400');
                }
            } else {
                alert(data.message || 'حدث خطأ ما');
            }
        })
        .catch(error => {
            console.error('Error:', error);
        });
    }
</script>
