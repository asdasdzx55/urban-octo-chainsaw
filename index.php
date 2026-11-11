<?php
require_once 'config.php';
require_once __DIR__ . '/storefront_helpers.php';

// جلب الشرائح المتحركة (Slides)
$slides = $pdo->query("SELECT * FROM home_slides ORDER BY sort_order ASC, id ASC")->fetchAll(PDO::FETCH_ASSOC);

// جلب 8 منتجات مميزة للرئيسية لجعلها تبدو غنية ومليئة بالمعروضات
$featured_products = $pdo->query("SELECT * FROM products WHERE " . storefrontVisibleProductSql() . " ORDER BY id DESC LIMIT 8")->fetchAll(PDO::FETCH_ASSOC);

include 'header.php';
?>
<!-- ستايل مخصص لصفحة الرئيسية للسلايدر والتأثيرات البصرية الإضافية -->
<style>
    .swiper-pagination-bullet-active {
        background: #D4AF37 !important;
        width: 24px !important;
        border-radius: 4px !important;
        transition: all 0.3s ease;
    }
    .swiper-button-next::after, .swiper-button-prev::after {
        font-size: 22px !important;
    }
    .shine-hover {
        position: relative;
        overflow: hidden;
    }
    .shine-hover::after {
        content: '';
        position: absolute;
        top: 0;
        left: -100%;
        width: 50%;
        height: 100%;
        background: linear-gradient(to right, rgba(255,255,255,0) 0%, rgba(255,255,255,0.3) 100%);
        transform: skewX(-25deg);
    }
    .shine-hover:hover::after {
        left: 120%;
        transition: all 0.6s ease;
    }
</style>

<!-- ================= 1. السلايدر الرئيسي (Swiper.js Carousel) ================= -->
<div class="relative overflow-hidden group">
    <div class="swiper main-slider h-[60vh] md:h-[75vh]">
        <div class="swiper-wrapper">
            <?php if(empty($slides)): ?>
                <!-- الشريحة الأولى -->
                <div class="swiper-slide relative flex items-center justify-center">
                    <img src="images/hero_cheese_sweets.jpg" class="absolute inset-0 w-full h-full object-cover transform scale-100 transition-transform duration-[12000ms]" alt="أجبان ومعمول وبرازق شامية">
                    <div class="absolute inset-0 bg-black/45"></div>
                    <div class="relative z-10 text-center px-4 max-w-3xl text-white">
                        <span class="text-royal-gold text-xs md:text-sm font-bold tracking-widest uppercase mb-3 block animate-pulse">
                            سوبر ماركت المنزل السوري | طعم الأصالة والخير الشامي 🌟
                        </span>
                        <h2 class="text-3xl md:text-5xl mb-6 font-serif tracking-wide leading-tight drop-shadow-lg font-bold">
                            أشهى الأجبان البلدية والمعمول والبرازق الشامية
                        </h2>
                        <a href="shop.php" class="inline-block bg-white text-royal-dark font-extrabold px-10 py-4 text-xs tracking-widest uppercase hover:bg-royal-gold hover:text-white transition duration-300 shadow-xl rounded-xl btn-shine">
                            تصفح المنتجات الآن
                        </a>
                    </div>
                </div>
                <!-- الشريحة الثانية -->
                <div class="swiper-slide relative flex items-center justify-center">
                    <img src="images/hero_sweets_delight.jpg" class="absolute inset-0 w-full h-full object-cover transform scale-100 transition-transform duration-[12000ms]" alt="حلويات ومؤونة شامية">
                    <div class="absolute inset-0 bg-black/45"></div>
                    <div class="relative z-10 text-center px-4 max-w-3xl text-white">
                        <span class="text-royal-gold text-xs md:text-sm font-bold tracking-widest uppercase mb-3 block animate-pulse">
                            جودة فاخرة وطازجة يومياً 🍯
                        </span>
                        <h2 class="text-3xl md:text-5xl mb-6 font-serif tracking-wide leading-tight drop-shadow-lg font-bold">
                            تشكيلة المكدوس والزيوت والبهارات والحلويات الفاخرة
                        </h2>
                        <a href="shop.php" class="inline-block bg-white text-royal-dark font-extrabold px-10 py-4 text-xs tracking-widest uppercase hover:bg-royal-gold hover:text-white transition duration-300 shadow-xl rounded-xl btn-shine">
                            تسوق العروض المميزة
                        </a>
                    </div>
                </div>
            <?php else: ?>
                <?php foreach($slides as $slide): ?>
                <div class="swiper-slide relative flex items-center justify-center">
                    <img src="<?php echo htmlspecialchars($slide['image_url']); ?>" class="absolute inset-0 w-full h-full object-cover transform scale-100 transition-transform duration-[12000ms] swiper-lazy" alt="Banner">
                    <div class="absolute inset-0 bg-black/45"></div>
                    <div class="relative z-10 text-center px-4 max-w-3xl text-white">
                        <?php if(!empty($slide['subtitle'])): ?>
                            <span class="text-royal-gold text-xs md:text-sm font-bold tracking-widest uppercase mb-4 block animate-pulse">
                                <?php echo htmlspecialchars($slide['subtitle']); ?>
                            </span>
                        <?php endif; ?>
                        <h2 class="text-4xl md:text-6xl mb-6 font-serif tracking-wide leading-tight drop-shadow-lg font-bold">
                            <?php echo htmlspecialchars($slide['title']); ?>
                        </h2>
                        <a href="<?php echo htmlspecialchars($slide['link_url'] ?: 'shop.php'); ?>" class="inline-block bg-white text-royal-dark font-extrabold px-10 py-4 text-xs tracking-widest uppercase hover:bg-royal-gold hover:text-white transition duration-300 shadow-xl rounded-lg btn-shine">
                            تسوق الآن
                        </a>
                    </div>
                </div>
                <?php endforeach; ?>
            <?php endif; ?>
        </div>
        <div class="swiper-pagination !bottom-6"></div>
        <div class="swiper-button-next !text-white/80 hover:!text-royal-gold transition-colors hidden md:flex opacity-0 group-hover:opacity-100 duration-300"></div>
        <div class="swiper-button-prev !text-white/80 hover:!text-royal-gold transition-colors hidden md:flex opacity-0 group-hover:opacity-100 duration-300"></div>
    </div>
</div>

<!-- ================= 2. شريط مميزات المتجر الافتتاحية (Why Choose Us) ================= -->
<div class="bg-royal-charcoal py-8 border-y border-royal-gold/15 text-white">
    <div class="container mx-auto px-4 md:px-8 max-w-6xl">
        <div class="grid grid-cols-2 md:grid-cols-4 gap-6 text-center divide-y md:divide-y-0 md:divide-x md:divide-x-reverse divide-royal-gold/10">
            <div class="pt-4 md:pt-0">
                <i class="fa-solid fa-shield-halved text-royal-gold text-2xl mb-3"></i>
                <h4 class="text-xs font-bold uppercase tracking-wider mb-1">جودة أصلية ومضمونة</h4>
                <p class="text-[10px] text-gray-400 font-light">أفضل المنتجات مع ضمان الجودة ورضا العملاء</p>
            </div>
            <div class="pt-4 md:pt-0">
                <i class="fa-solid fa-tag text-royal-gold text-2xl mb-3"></i>
                <h4 class="text-xs font-bold uppercase tracking-wider mb-1">أفضل الأسعار والعروض</h4>
                <p class="text-[10px] text-gray-400 font-light">تخفيضات دورية وخصومات حصرية ومنافسة</p>
            </div>
            <div class="pt-4 md:pt-0">
                <i class="fa-solid fa-truck-fast text-royal-gold text-2xl mb-3"></i>
                <h4 class="text-xs font-bold uppercase tracking-wider mb-1">شحن وتوصيل سريع</h4>
                <p class="text-[10px] text-gray-400 font-light">توصيل آمن وسريع حتى باب منزلك</p>
            </div>
            <div class="pt-4 md:pt-0">
                <i class="fa-solid fa-credit-card text-royal-gold text-2xl mb-3"></i>
                <h4 class="text-xs font-bold uppercase tracking-wider mb-1">دفع آمن ومتعدد</h4>
                <p class="text-[10px] text-gray-400 font-light">دفع عند الاستلام، بطاقات بنكية، ومحافظ إلكترونية</p>
            </div>
        </div>
    </div>
</div>

<!-- ================= 3. تسوق حسب الأقسام المميزة (Featured Categories) ================= -->
<?php if(!empty($categories_list)): ?>
<div class="py-20 bg-royal-sand/30">
    <div class="container mx-auto px-4 md:px-8 max-w-6xl">
        <div class="text-center mb-14">
            <span class="text-royal-darkgold text-xs font-bold tracking-widest uppercase mb-2.5 block">OUR CATEGORIES</span>
            <h3 class="text-3xl font-serif text-royal-dark font-bold relative inline-block pb-3">
                تصفح أقسام وتصنيفات المتجر
                <span class="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-12 h-[2px] bg-royal-gold"></span>
            </h3>
        </div>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-6">
            <?php foreach($categories_list as $cat): ?>
            <a href="shop.php?category=<?php echo urlencode($cat['name']); ?>" class="group block bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 border border-royal-gold/5 text-center p-3">
                <div class="overflow-hidden aspect-[4/5] relative rounded-xl mb-4 shadow-inner">
                    <img src="<?php echo htmlspecialchars($cat['image_url'] ?: 'images/cat_pantry.jpg'); ?>" class="w-full h-full object-cover transition duration-1000 group-hover:scale-105" alt="<?php echo htmlspecialchars($cat['name']); ?>" loading="lazy" decoding="async">
                    <div class="absolute inset-0 bg-black/5 group-hover:bg-black/25 transition-colors"></div>
                </div>
                <h4 class="text-sm font-serif text-royal-dark font-bold group-hover:text-royal-darkgold transition-colors duration-300 pb-1"><?php echo htmlspecialchars($cat['name']); ?></h4>
            </a>
            <?php endforeach; ?>
        </div>
    </div>
</div>
<?php endif; ?>

<!-- ================= 4. العرض الخاص والترويجي (Special Offer Section) ================= -->
<div class="py-16 bg-royal-sand/50 border-y border-royal-gold/10">
    <div class="container mx-auto px-4 md:px-8 max-w-5xl">
        <div class="bg-white rounded-3xl overflow-hidden border border-royal-gold/15 shadow-lg flex flex-col md:flex-row items-center p-6 md:p-10 gap-8 shine-hover">
            <div class="w-full md:w-1/2 aspect-video md:aspect-square rounded-2xl overflow-hidden shadow bg-gray-50 flex items-center justify-center">
                <img src="images/special_offer.jpg" class="w-full h-full object-cover" alt="سلة الإفطار والمؤونة الشامية" loading="lazy" decoding="async">
            </div>
            <div class="w-full md:w-1/2 text-center md:text-right space-y-4">
                <span class="bg-royal-gold/15 text-royal-darkgold text-[10px] font-bold py-1 px-3 rounded-full border border-royal-gold/20 inline-block uppercase tracking-wider">عرض خاص وحصري ⭐</span>
                <h3 class="text-2xl md:text-3xl font-serif text-royal-dark font-bold leading-tight">سلة الإفطار والمؤونة الشامية المميزة</h3>
                <p class="text-xs text-gray-500 leading-relaxed font-light">تشكيلة استثنائية من أشهى الأجبان البلدية (شلل، حلوم، قشقوان)، المكدوس بالجوز، زيت الزيتون البكر الممتاز، والزعتر الحلبي الفاخر بخصم خاص 20% لفترة محدودة مع توصيل سريع حتى باب بيتك!</p>
                <div class="pt-2">
                    <a href="shop.php" class="bg-royal-charcoal text-white hover:bg-royal-gold hover:text-royal-charcoal text-xs font-bold py-3.5 px-8 rounded-xl shadow-md btn-shine transition-all">تصفح العروض والمنتجات</a>
                </div>
            </div>
        </div>
    </div>
</div>

<!-- ================= 5. الكوليكشن المتميز (Featured Products Grid) ================= -->
<div class="py-20 bg-white">
    <div class="container mx-auto px-4 md:px-8 max-w-6xl">
        <div class="flex flex-col md:flex-row justify-between items-center md:items-end mb-12 border-b border-gray-100 pb-5">
            <div class="text-center md:text-right mb-4 md:mb-0">
                <span class="text-royal-darkgold text-xs font-bold tracking-widest uppercase mb-2 block">OUR BESTSELLERS</span>
                <h3 class="text-3xl font-serif text-royal-dark font-bold">تشكيلة المنتجات المميزة</h3>
            </div>
            <a href="shop.php" class="text-xs font-bold text-gray-500 hover:text-royal-darkgold transition uppercase tracking-widest flex items-center gap-1.5 font-bold">عرض كل الأصناف <i class="fa-solid fa-arrow-left"></i></a>
        </div>
        
        <?php if(!empty($featured_products)): ?>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
                <?php foreach($featured_products as $p): $p['image_url'] = resolveProductDisplayImage($pdo, $p); ?>
                    <div class="product-card group relative flex flex-col bg-royal-cream/40 rounded-2xl overflow-hidden shadow-sm border border-royal-gold/10 p-3 hover:shadow-lg transition-all duration-300">
                        <a href="product.php?id=<?php echo $p['id']; ?>" class="product-image-container block overflow-hidden bg-gray-50 aspect-[4/5] relative rounded-xl shadow-inner">
                            <?php if($p['old_price'] && $p['old_price'] > $p['price']): $discount = round((($p['old_price'] - $p['price']) / $p['old_price']) * 100); ?>
                                <span class="absolute top-3 left-3 bg-red-600 text-white text-[9px] font-bold tracking-wider py-1.5 px-3 rounded-full z-10">خصم <?php echo $discount; ?>%</span>
                            <?php endif; ?>
                            
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
                            
                            <div class="absolute inset-x-0 bottom-0 p-3 z-10 add-to-cart-btn">
                                <?php if(!empty($p['is_weight_based'])): ?>
                                    <a href="product.php?id=<?php echo $p['id']; ?>" class="w-full bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold py-3.5 transition shadow-lg rounded-xl btn-shine flex items-center justify-center gap-1.5">
                                        ⚖️ اختر الوزن <i class="fa-solid fa-arrow-left text-[10px]"></i>
                                    </a>
                                <?php else: ?>
                                    <form method="POST" action="">
                                        <input type="hidden" name="return_page" value="index.php">
                                        <input type="hidden" name="product_id" value="<?php echo $p['id']; ?>">
                                        <input type="hidden" name="product_name" value="<?php echo htmlspecialchars($p['name']); ?>">
                                        <input type="hidden" name="product_price" value="<?php echo $p['price']; ?>">
                                        <input type="hidden" name="product_image" value="<?php echo htmlspecialchars($p['image_url']); ?>">
                                        <button type="submit" name="add_to_cart" class="w-full bg-royal-charcoal text-white hover:bg-royal-gold hover:text-royal-charcoal text-xs font-bold py-3.5 transition shadow-lg rounded-xl btn-shine">أضف للسلة <i class="fa-solid fa-cart-plus mr-1"></i></button>
                                    </form>
                                <?php endif; ?>
                            </div>
                        </a>
                        <div class="pt-4 pb-2 text-center">
                            <span class="text-[10px] text-gray-400 font-bold uppercase tracking-wider block mb-1"><?php echo htmlspecialchars($p['category']); ?></span>
                            <a href="product.php?id=<?php echo $p['id']; ?>" class="block text-sm font-semibold text-royal-dark mb-2 hover:text-royal-gold transition-colors duration-300 leading-tight"><?php echo htmlspecialchars($p['name']); ?></a>
                            
                            <?php 
                            $rating_data = getProductRating($p['id']);
                            if ($rating_data['count'] > 0): 
                            ?>
                                <div class="flex justify-center items-center gap-1 mb-2.5 text-[10px]">
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
        <?php else: ?>
            <div class="text-center py-12 px-4 bg-royal-sand/20 rounded-3xl border border-dashed border-royal-gold/20 max-w-xl mx-auto">
                <div class="w-16 h-16 rounded-2xl bg-white shadow-sm flex items-center justify-center mx-auto mb-4 border border-royal-gold/15 text-royal-darkgold text-2xl">
                    <i class="fa-solid fa-box-open"></i>
                </div>
                <h4 class="text-base font-bold text-royal-dark mb-2">لا توجد منتجات مضافة حالياً</h4>
                <p class="text-xs text-gray-400 mb-6 font-light">المتجر جاهز ومفرغ بالكامل. يمكنك البدء بإضافة أقسامك ومنتجاتك من لوحة التحكم بكل سهولة.</p>
                <?php if(isAdmin()): ?>
                    <a href="admin_products.php" class="inline-block bg-royal-charcoal text-white hover:bg-royal-gold hover:text-royal-charcoal text-xs font-bold py-3.5 px-8 rounded-xl shadow btn-shine transition">
                        <i class="fa-solid fa-plus-circle mr-1"></i> إضافة أول منتج للمتجر
                    </a>
                <?php endif; ?>
            </div>
        <?php endif; ?>
    </div>
</div>

<!-- ================= 6. معرض الصور (Visual Feed / Gallery) ================= -->
<div class="py-20 bg-royal-sand/20 border-t border-royal-gold/10">
    <div class="container mx-auto px-4 md:px-8 max-w-6xl">
        <div class="text-center mb-12">
            <span class="text-royal-darkgold text-xs font-bold tracking-widest uppercase mb-2.5 block">#GALLERY</span>
            <h3 class="text-3xl font-serif text-royal-dark font-bold relative inline-block pb-3">
                معرض صور وتشكيلات المتجر
                <span class="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-12 h-[2px] bg-royal-gold"></span>
            </h3>
            <p class="text-gray-500 text-xs mt-3 font-light">استكشف صور وتجارب عملائنا المميزة مع أشهى منتجات المؤونة والحلويات والأجبان الشامية الأصيلة.</p>
        </div>
        
        <div class="grid grid-cols-2 md:grid-cols-6 gap-4">
            <?php 
            $gallery_items = [
                ['img' => 'images/gallery_1.jpg', 'title' => 'أجبان شامية بلدية', 'sub' => 'شلل وحلوم وقشقوان'],
                ['img' => 'images/gallery_2.jpg', 'title' => 'معمول وبرازق دمشقية', 'sub' => 'بالفستق والسمسم'],
                ['img' => 'images/gallery_3.jpg', 'title' => 'مكدوس سوري بلدي', 'sub' => 'بالجوز وزيت الزيتون'],
                ['img' => 'images/gallery_4.jpg', 'title' => 'عطارة وزعتر حلبي', 'sub' => 'بهارات وسماق ودبس'],
                ['img' => 'images/gallery_5.jpg', 'title' => 'بن وقهوة بالهيل', 'sub' => 'محمص ومطحون طازج'],
                ['img' => 'images/gallery_6.jpg', 'title' => 'زيتون وزيت إدلب', 'sub' => 'عصرة أولى بكر ممتاز']
            ];
            foreach($gallery_items as $g): 
            ?>
            <div class="aspect-square rounded-2xl overflow-hidden shadow-md border border-royal-gold/10 relative group cursor-pointer">
                <img src="<?php echo htmlspecialchars($g['img']); ?>" class="w-full h-full object-cover group-hover:scale-110 transition duration-700" alt="<?php echo htmlspecialchars($g['title']); ?>" loading="lazy" decoding="async">
                <div class="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col items-center justify-end p-2.5 text-center text-white">
                    <span class="text-xs font-bold text-royal-gold leading-tight"><?php echo htmlspecialchars($g['title']); ?></span>
                    <span class="text-[10px] text-gray-200 opacity-90"><?php echo htmlspecialchars($g['sub']); ?></span>
                </div>
            </div>
            <?php endforeach; ?>
        </div>
    </div>
</div>

<!-- ================= 7. سياسات الشحن والاسترجاع ================= -->
<?php if(!empty($settings['policy_shipping']) || !empty($settings['policy_return'])): ?>
<div id="policies" class="py-16 bg-white border-t border-royal-gold/10">
    <div class="container mx-auto px-4 md:px-8 max-w-5xl">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-10">
            <?php if(!empty($settings['policy_shipping'])): ?>
            <div class="bg-royal-cream p-8 rounded-2xl shadow-sm border border-royal-gold/5">
                <div class="flex items-center gap-3 mb-4 text-royal-darkgold">
                    <i class="fa-solid fa-truck-fast text-2xl animate-pulse"></i>
                    <h4 class="font-serif font-bold text-lg text-royal-dark">سياسة الشحن والتوصيل للمحافظات</h4>
                </div>
                <p class="text-gray-600 text-xs leading-loose whitespace-pre-wrap font-light">
                    <?php echo htmlspecialchars($settings['policy_shipping']); ?>
                </p>
            </div>
            <?php endif; ?>
            <?php if(!empty($settings['policy_return'])): ?>
            <div class="bg-royal-cream p-8 rounded-2xl shadow-sm border border-royal-gold/5">
                <div class="flex items-center gap-3 mb-4 text-royal-darkgold">
                    <i class="fa-solid fa-arrow-rotate-left text-2xl animate-pulse"></i>
                    <h4 class="font-serif font-bold text-lg text-royal-dark">سياسة الاستبدال والاسترجاع الرسمية</h4>
                </div>
                <p class="text-gray-600 text-xs leading-loose whitespace-pre-wrap font-light">
                    <?php echo htmlspecialchars($settings['policy_return']); ?>
                </p>
            </div>
            <?php endif; ?>
        </div>
    </div>
</div>
<?php endif; ?>

<!-- تشغيل سلايدر البانر التفاعلي للرئيسية -->
<script>
    document.addEventListener('DOMContentLoaded', function() {
        const swiper = new Swiper('.main-slider', {
            loop: true,
            effect: 'fade',
            fadeEffect: {
                crossFade: true
            },
            autoplay: {
                delay: 6000,
                disableOnInteraction: false,
            },
            pagination: {
                el: '.swiper-pagination',
                clickable: true,
            },
            navigation: {
                nextEl: '.swiper-button-next',
                prevEl: '.swiper-button-prev',
            },
        });
    });

    // دالة إضافة/حذف المنتجات من المفضلة
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

<?php
include 'footer.php';
?>