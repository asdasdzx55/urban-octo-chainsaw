<?php
require_once 'config.php';
require_once __DIR__ . '/storefront_helpers.php';

if (!isset($_GET['id'])) {
    header("Location: shop.php");
    exit;
}
$id = (int)$_GET['id'];

// معالجة إضافة المراجعة (التقييم)
if (isset($_POST['submit_review']) && isset($_SESSION['user_id'])) {
    $rating = (int)$_POST['rating'];
    $comment = trim($_POST['comment']);
    $pdo->prepare("INSERT INTO reviews (product_id, user_name, rating, comment) VALUES (?, ?, ?, ?)")->execute([$id, $_SESSION['username'], $rating, $comment]);
    header("Location: product.php?id=" . $id . "&msg=review_added");
    exit;
}

// جلب تفاصيل المنتج
$stmt = $pdo->prepare("SELECT * FROM products WHERE id = ?");
$stmt->execute([$id]);
$p = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$p) {
    die("<div style='direction:rtl; text-align:center; padding:50px; font-family:tahoma;'><h2>عذراً، المنتج الذي تبحث عنه غير موجود.</h2><a href='shop.php'>العودة للمتجر</a></div>");
}

// جلب صور المعرض
$gal_stmt = $pdo->prepare("SELECT * FROM product_images WHERE product_id = ? ORDER BY is_main DESC, id ASC");
$gal_stmt->execute([$id]);
$gallery = $gal_stmt->fetchAll(PDO::FETCH_ASSOC);
if (empty($gallery)) {
    $gallery = [];
}
$gallery = array_values(array_filter($gallery, function($row) {
    return isRealProductImage($row['image_path'] ?? '');
}));
$resolved_main_image = resolveProductDisplayImage($pdo, $p);
if (empty($gallery) && $resolved_main_image !== '') {
    $gallery = [['image_path' => $resolved_main_image]];
}
$p['image_url'] = $resolved_main_image;
if (empty($gallery) && !isAdmin()) {
    http_response_code(404);
    die("<div style='direction:rtl; text-align:center; padding:60px 20px; font-family:tahoma;'><h2 style='color:#1f2937;'>عذراً، هذا المنتج غير معروض بالمتجر الإلكتروني حالياً.</h2><p style='color:#6b7280; margin:12px 0 24px;'>يتم نشر المنتجات على المتجر فور تجهيز صورها الرسمية.</p><a href='shop.php' style='display:inline-block; background:#1f2937; color:#D4AF37; padding:12px 24px; border-radius:12px; text-decoration:none; font-weight:bold;'>العودة لتصفح المتجر</a></div>");
}
if (empty($gallery)) {
    $gallery = [['image_path' => 'placeholder.php?w=800&h=1000']];
}

// جلب التقييمات
$reviews_stmt = $pdo->prepare("SELECT * FROM reviews WHERE product_id = ? ORDER BY id DESC");
$reviews_stmt->execute([$id]);
$reviews = $reviews_stmt->fetchAll(PDO::FETCH_ASSOC);
$total_reviews = count($reviews);
$avg_rating = $total_reviews > 0 ? round(array_sum(array_column($reviews, 'rating')) / $total_reviews, 1) : 0;

// جلب خيارات ومواصفات المنتج (Product Variants)
$var_stmt = $pdo->prepare("SELECT * FROM product_variants WHERE product_id = ? AND is_active = 1 ORDER BY id ASC");
$var_stmt->execute([$id]);
$product_variants = $var_stmt->fetchAll(PDO::FETCH_ASSOC);

$grouped_variants = [];
foreach ($product_variants as $v) {
    $grouped_variants[$v['variant_type']][] = $v;
}

include 'header.php';
?>

<!-- Meta Pixel ViewContent Event -->
<?php if(!empty($meta_pixel_id) && $meta_pixel_enabled): ?>
<script>
  if (typeof fbq !== 'undefined') {
    fbq('track', 'ViewContent', {
      content_ids: ['<?php echo $p['id']; ?>'],
      content_name: '<?php echo addslashes(htmlspecialchars($p['name'])); ?>',
      content_category: '<?php echo addslashes(htmlspecialchars($p['category'])); ?>',
      value: <?php echo (float)$p['price']; ?>,
      currency: 'EGP'
    });
  }
</script>
<?php endif; ?>
<!-- ستايل مخصص لمعرض صور المنتج التفاعلي -->
<style>
    .product-swiper {
        width: 100%;
        border-radius: 12px;
        overflow: hidden;
    }
    .product-swiper-thumbs {
        box-sizing: border-box;
        padding: 10px 0;
    }
    .product-swiper-thumbs .swiper-slide {
        width: 25%;
        height: 100%;
        opacity: 0.4;
        cursor: pointer;
        border-radius: 8px;
        overflow: hidden;
        border: 2px solid transparent;
    }
    .product-swiper-thumbs .swiper-slide-thumb-active {
        opacity: 1;
        border-color: #D4AF37;
    }
    details > summary { list-style: none; }
    details > summary::-webkit-details-marker { display: none; }
</style>

<div class="container mx-auto px-4 md:px-8 py-12 max-w-6xl animate-fade-in">
    <div class="flex flex-col lg:flex-row gap-12 mb-16">
        
        <!-- القسم الأيمن: معرض الصور (Swiper) -->
        <div class="w-full lg:w-1/2 flex flex-col">
            <!-- سلايدر الصور الرئيسي -->
            <div class="swiper product-swiper aspect-[4/5] bg-white border border-royal-gold/10 shadow-sm">
                <div class="swiper-wrapper">
                    <?php if(!empty($gallery)): ?>
                        <?php foreach($gallery as $img): ?>
                        <div class="swiper-slide flex items-center justify-center bg-gray-50">
                            <img src="<?php echo htmlspecialchars($img['image_path']); ?>" class="w-full h-full object-cover" alt="Product Image">
                        </div>
                        <?php endforeach; ?>
                    <?php else: ?>
                        <div class="swiper-slide flex items-center justify-center bg-gray-50">
                            <img src="<?php echo htmlspecialchars($p['image_url']); ?>" class="w-full h-full object-cover" alt="Product Image">
                        </div>
                    <?php endif; ?>
                </div>
                <!-- أزرار التمرير للموبايل -->
                <div class="swiper-pagination"></div>
                
                <!-- زر تكبير الصورة (Lightbox) -->
                <button type="button" onclick="openLightbox()" class="absolute bottom-4 right-4 w-9 h-9 rounded-full bg-white/90 backdrop-blur-sm text-royal-dark hover:text-royal-gold hover:bg-white flex items-center justify-center shadow-md transition-all z-20 focus:outline-none hover:scale-110" title="تكبير الصورة">
                    <i class="fa-solid fa-magnifying-glass-plus text-xs"></i>
                </button>
            </div>
            
            <!-- السلايدر المصغر (الصور المصغرة - Thumbs) -->
            <?php if(count($gallery) > 1): ?>
            <div class="swiper product-swiper-thumbs mt-4 h-24">
                <div class="swiper-wrapper">
                    <?php foreach($gallery as $img): ?>
                    <div class="swiper-slide bg-gray-100">
                        <img src="<?php echo htmlspecialchars($img['image_path']); ?>" class="w-full h-full object-cover" alt="Product Thumb" loading="lazy" decoding="async">
                    </div>
                    <?php endforeach; ?>
                </div>
            </div>
            <?php endif; ?>
        </div>

        <!-- القسم الأيسر: معلومات المنتج والدفع -->
        <div class="w-full lg:w-1/2 flex flex-col justify-between">
            <div>
                <!-- القسم -->
                <span class="text-royal-darkgold text-xs font-bold uppercase tracking-wider block mb-2"><?php echo htmlspecialchars($p['category']); ?></span>
                
                <!-- اسم المنتج -->
                <h1 class="text-3xl font-serif font-bold text-royal-dark mb-4 leading-tight"><?php echo htmlspecialchars($p['name']); ?></h1>
                
                <!-- متوسط التقييم بالنجوم -->
                <div class="flex items-center gap-2 mb-6 text-xs">
                    <div class="flex gap-0.5">
                        <?php echo renderStars($avg_rating); ?>
                    </div>
                    <span class="text-xs text-gray-400 font-bold font-serif">(<?php echo $total_reviews; ?> مراجعة)</span>
                </div>

                <!-- جلب خيارات الوزن إن كان المنتج يباع بالوزن -->
                <?php 
                $weight_options = !empty($p['is_weight_based']) ? getProductWeightOptions($p) : []; 
                ?>

                <!-- السعر وتخفيض الخصم -->
                <div class="flex flex-wrap items-center gap-4 mb-6 bg-royal-sand/30 p-4 rounded-xl border border-royal-gold/5 w-fit">
                    <span class="text-2xl font-serif font-bold text-royal-darkgold">
                        <span id="display-product-price"><?php 
                            if (!empty($p['is_weight_based']) && !empty($weight_options)) {
                                $first_w = (float)$weight_options[0]['weight'];
                                echo round($p['price'] * $first_w, 2);
                            } else {
                                echo htmlspecialchars($p['price']); 
                            }
                        ?></span>
                        <span class="text-base font-normal"><?php echo htmlspecialchars($settings['store_currency'] ?? 'ج.م'); ?></span>
                    </span>
                    <?php if(!empty($p['is_weight_based'])): ?>
                        <span class="text-xs text-amber-800 bg-amber-100/90 font-bold py-1 px-2.5 rounded-lg border border-amber-200">
                            (السعر للكيلو: <?php echo htmlspecialchars($p['price']); ?> <?php echo htmlspecialchars($settings['store_currency'] ?? 'ج.م'); ?>)
                        </span>
                    <?php endif; ?>
                    <?php if($p['old_price'] && $p['old_price'] > $p['price']): $discount = round((($p['old_price'] - $p['price']) / $p['old_price']) * 100); ?>
                        <span class="text-sm text-gray-400 line-through font-serif"><?php echo htmlspecialchars($p['old_price']); ?> <?php echo htmlspecialchars($settings['store_currency'] ?? 'ج.م'); ?></span>
                        <span class="bg-red-100 text-red-700 text-[10px] font-bold py-1 px-2.5 rounded-full">خصم <?php echo $discount; ?>%</span>
                    <?php endif; ?>
                </div>

                <!-- فورم الشراء وإضافة المنتجات للسلة -->
                <form method="POST" action="" id="product-buy-form" class="mb-10 max-w-md space-y-5">
                    <input type="hidden" name="return_page" value="product.php?id=<?php echo $p['id']; ?>">
                    <input type="hidden" name="product_id" value="<?php echo $p['id']; ?>">
                    <input type="hidden" name="product_name" value="<?php echo htmlspecialchars($p['name']); ?>">
                    <input type="hidden" name="product_price" value="<?php echo $p['price']; ?>">
                    <input type="hidden" name="product_image" value="<?php echo htmlspecialchars($p['image_url']); ?>">

                    <!-- قسم خيارات الوزن لمنتجات الأوزان (ربع، نصف، 3/4، كيلو) -->
                    <?php if (!empty($p['is_weight_based']) && !empty($weight_options)): ?>
                        <div class="bg-amber-50/60 p-4 rounded-2xl border border-amber-200/80 space-y-3">
                            <div class="flex justify-between items-center">
                                <label class="block text-xs font-bold text-royal-dark flex items-center gap-1.5">
                                    <i class="fa-solid fa-scale-balanced text-amber-600 text-sm"></i>
                                    اختر الوزن المطلوب:
                                </label>
                                <span class="text-xs text-amber-800 font-bold bg-white px-2.5 py-0.5 rounded-full border border-amber-200 shadow-2xs" id="selected-weight-badge">
                                    <?php echo htmlspecialchars($weight_options[0]['label']); ?>
                                </span>
                            </div>

                            <!-- مربعات وأزرار الأوزان -->
                            <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                                <?php foreach ($weight_options as $w_idx => $w_item): 
                                    $w_val = (float)$w_item['weight'];
                                    $w_lbl = $w_item['label'];
                                    $w_calc_price = round($p['price'] * $w_val, 2);
                                    $is_w_checked = ($w_idx === 0) ? 'checked' : '';
                                ?>
                                    <label class="weight-pill-label relative group cursor-pointer border <?php echo $w_idx === 0 ? 'border-amber-500 bg-amber-500/15 text-amber-900 ring-2 ring-amber-500/30 shadow-xs' : 'border-gray-200 bg-white text-gray-700 hover:border-amber-300'; ?> p-3 rounded-xl transition-all select-none flex flex-col items-center justify-center text-center">
                                        <input type="radio" 
                                               name="selected_weight_radio" 
                                               value="<?php echo $w_val; ?>" 
                                               data-weight="<?php echo $w_val; ?>"
                                               data-label="<?php echo htmlspecialchars($w_lbl); ?>"
                                               data-price="<?php echo $w_calc_price; ?>"
                                               <?php echo $is_w_checked; ?> 
                                               class="weight-radio-input sr-only">
                                        
                                        <span class="font-bold text-xs mb-1 block leading-tight text-gray-800"><?php echo htmlspecialchars($w_lbl); ?></span>
                                        <span class="text-amber-700 font-serif font-bold text-xs bg-white px-2 py-0.5 rounded border border-amber-200/60 shadow-2xs">
                                            <?php echo $w_calc_price; ?> <?php echo htmlspecialchars($settings['store_currency'] ?? 'ج.م'); ?>
                                        </span>
                                    </label>
                                <?php endforeach; ?>
                            </div>

                            <input type="hidden" name="selected_weight" id="hidden_selected_weight" value="<?php echo (float)$weight_options[0]['weight']; ?>">
                            <input type="hidden" name="weight_label" id="hidden_weight_label" value="<?php echo htmlspecialchars($weight_options[0]['label']); ?>">
                        </div>
                    <?php endif; ?>

                    <!-- قسم خيارات ومواصفات المنتج (المقاسات، الألوان، السعات) -->
                    <?php if (!empty($grouped_variants)): ?>
                        <div class="space-y-5 pt-2 border-t border-b border-royal-gold/15 py-5">
                            <?php foreach ($grouped_variants as $v_type => $v_items): 
                                $is_color_group = ($v_type === 'اللون' || !empty(array_filter($v_items, fn($it) => !empty($it['color_code']))));
                            ?>
                                <div>
                                    <div class="flex justify-between items-center mb-2.5">
                                        <label class="block text-xs font-bold text-royal-dark flex items-center gap-1.5">
                                            <?php if ($is_color_group): ?>
                                                <i class="fa-solid fa-palette text-royal-darkgold text-xs"></i>
                                            <?php else: ?>
                                                <i class="fa-solid fa-sliders text-royal-darkgold text-xs"></i>
                                            <?php endif; ?>
                                            اختر <?php echo htmlspecialchars($v_type); ?>:
                                        </label>
                                        <span class="text-xs text-royal-dark font-bold selected-variant-label bg-royal-sand/50 px-2.5 py-0.5 rounded-full border border-royal-gold/20" data-for-type="<?php echo htmlspecialchars($v_type); ?>">
                                            <?php echo htmlspecialchars($v_items[0]['variant_name']); ?>
                                        </span>
                                    </div>

                                    <?php if ($is_color_group): ?>
                                        <!-- دوائر / مربعات الألوان التفاعلية (Shopify & WooCommerce Swatches) -->
                                        <div class="flex flex-wrap items-center gap-3">
                                            <?php foreach ($v_items as $idx => $item): 
                                                $color_hex = !empty($item['color_code']) ? $item['color_code'] : '#111827';
                                                $is_white = in_array(strtolower($color_hex), ['#ffffff', '#fff', '#fefefe', '#fafafa']);
                                                $json_val = json_encode([
                                                    'name' => $item['variant_name'],
                                                    'price' => (float)$item['price_modifier']
                                                ], JSON_UNESCAPED_UNICODE);
                                                $is_checked = ($idx === 0) ? 'checked' : '';
                                            ?>
                                                <label class="variant-color-swatch relative group cursor-pointer flex flex-col items-center select-none" title="<?php echo htmlspecialchars($item['variant_name']); ?>">
                                                    <input type="radio" 
                                                           name="selected_variants[<?php echo htmlspecialchars($v_type); ?>]" 
                                                           value="<?php echo htmlspecialchars($json_val); ?>" 
                                                           data-name="<?php echo htmlspecialchars($item['variant_name']); ?>"
                                                           data-price-mod="<?php echo (float)$item['price_modifier']; ?>"
                                                           data-type="<?php echo htmlspecialchars($v_type); ?>"
                                                           <?php echo $is_checked; ?> 
                                                           class="variant-radio-input sr-only">
                                                    
                                                    <!-- مربع / دائرة اللون -->
                                                    <span class="swatch-circle w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200 border <?php echo $is_white ? 'border-gray-300 shadow-inner' : 'border-black/10'; ?> <?php echo $idx === 0 ? 'ring-2 ring-royal-gold ring-offset-2 scale-110 shadow-md' : 'hover:scale-105 hover:shadow-sm'; ?>" style="background-color: <?php echo htmlspecialchars($color_hex); ?>;">
                                                        <i class="swatch-check fa-solid fa-check text-xs <?php echo $is_white ? 'text-gray-800' : 'text-white'; ?> <?php echo $idx === 0 ? 'opacity-100' : 'opacity-0'; ?> drop-shadow transition-opacity"></i>
                                                    </span>

                                                    <!-- شارة فرق السعر إن وجد -->
                                                    <?php if ((float)$item['price_modifier'] > 0): ?>
                                                        <span class="text-[9px] text-royal-darkgold font-mono font-bold mt-1 bg-white px-1.5 py-0.2 rounded border border-royal-gold/30 shadow-xs">
                                                            +<?php echo (float)$item['price_modifier']; ?>
                                                        </span>
                                                    <?php endif; ?>
                                                </label>
                                            <?php endforeach; ?>
                                        </div>

                                    <?php else: ?>
                                        <!-- أزرار الخيارات الأخرى (المقاسات والسعات والأحجام) -->
                                        <div class="flex flex-wrap gap-2.5">
                                            <?php foreach ($v_items as $idx => $item): 
                                                $json_val = json_encode([
                                                    'name' => $item['variant_name'],
                                                    'price' => (float)$item['price_modifier']
                                                ], JSON_UNESCAPED_UNICODE);
                                                $is_checked = ($idx === 0) ? 'checked' : '';
                                            ?>
                                                <label class="variant-pill-label relative cursor-pointer border <?php echo $idx === 0 ? 'border-royal-gold bg-royal-sand/40 text-royal-dark ring-1 ring-royal-gold shadow-sm' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'; ?> py-2 px-4 rounded-xl text-xs font-bold transition-all select-none flex items-center gap-2">
                                                    <input type="radio" 
                                                           name="selected_variants[<?php echo htmlspecialchars($v_type); ?>]" 
                                                           value="<?php echo htmlspecialchars($json_val); ?>" 
                                                           data-name="<?php echo htmlspecialchars($item['variant_name']); ?>"
                                                           data-price-mod="<?php echo (float)$item['price_modifier']; ?>"
                                                           data-type="<?php echo htmlspecialchars($v_type); ?>"
                                                           <?php echo $is_checked; ?> 
                                                           class="variant-radio-input sr-only">
                                                    <span><?php echo htmlspecialchars($item['variant_name']); ?></span>
                                                    <?php if ((float)$item['price_modifier'] > 0): ?>
                                                        <span class="text-[10px] text-royal-darkgold font-mono font-bold bg-white px-1.5 py-0.5 rounded-md border border-royal-gold/20">
                                                            +<?php echo (float)$item['price_modifier']; ?> <?php echo htmlspecialchars($settings['store_currency'] ?? 'ج.م'); ?>
                                                        </span>
                                                    <?php endif; ?>
                                                </label>
                                            <?php endforeach; ?>
                                        </div>
                                    <?php endif; ?>
                                </div>
                            <?php endforeach; ?>
                        </div>
                    <?php endif; ?>
                    
                    <div class="flex flex-col sm:flex-row gap-4 pt-1">
                        <!-- التحكم بالكمية -->
                        <div class="w-full sm:w-1/3">
                            <label class="block text-[10px] text-gray-400 uppercase tracking-widest font-bold mb-2">الكمية المطلوبة</label>
                            <div class="flex items-center border border-gray-300 h-12 w-full rounded-lg bg-white overflow-hidden shadow-inner">
                                <button type="button" class="w-10 h-full text-gray-500 hover:bg-gray-100 flex justify-center items-center font-bold text-lg transition-colors qty-minus">-</button>
                                <input type="number" name="qty" id="input-prod-qty" value="1" min="1" class="flex-grow text-center outline-none bg-transparent h-full font-bold pointer-events-none font-serif text-sm" readonly>
                                <button type="button" class="w-10 h-full text-gray-500 hover:bg-gray-100 flex justify-center items-center font-bold text-lg transition-colors qty-plus">+</button>
                            </div>
                        </div>
                        <!-- زر الإضافة -->
                        <div class="w-full sm:w-2/3 flex items-end">
                            <button type="submit" name="add_to_cart" id="add-to-cart-submit-btn" class="w-full bg-gold-gradient text-white font-bold py-3.5 h-12 text-xs tracking-widest uppercase flex justify-center items-center gap-2 rounded-lg shadow-md bg-gold-gradient-hover btn-shine transition-all">
                                <?php if (!empty($p['is_weight_based']) && !empty($weight_options)): ?>
                                    إضافة (<?php echo htmlspecialchars($weight_options[0]['label']); ?>) للحقيبة <i class="fa-solid fa-bag-shopping"></i>
                                <?php else: ?>
                                    إضافة للحقيبة <i class="fa-solid fa-bag-shopping"></i>
                                <?php endif; ?>
                            </button>
                        </div>
                    </div>
                </form>

                <script>
                document.addEventListener('DOMContentLoaded', function() {
                    const isWeightBased = <?php echo !empty($p['is_weight_based']) ? 'true' : 'false'; ?>;
                    const baseKgPrice = <?php echo (float)$p['price']; ?>;
                    const priceDisplay = document.getElementById('display-product-price');
                    const radios = document.querySelectorAll('.variant-radio-input');
                    const weightRadios = document.querySelectorAll('.weight-radio-input');
                    const hiddenWeight = document.getElementById('hidden_selected_weight');
                    const hiddenWeightLabel = document.getElementById('hidden_weight_label');
                    const weightBadge = document.getElementById('selected-weight-badge');
                    const btnCart = document.getElementById('add-to-cart-submit-btn');

                    function escapeHtml(str) {
                        if (!str) return '';
                        return str.toString()
                            .replace(/&/g, "&amp;")
                            .replace(/</g, "&lt;")
                            .replace(/>/g, "&gt;")
                            .replace(/"/g, "&quot;")
                            .replace(/'/g, "&#039;");
                    }

                    function updateCalculatedPrice() {
                        let currentWeightFactor = 1.0;
                        let currentWeightLabel = '';

                        if (isWeightBased && weightRadios.length > 0) {
                            weightRadios.forEach(wr => {
                                if (wr.checked) {
                                    currentWeightFactor = parseFloat(wr.getAttribute('data-weight')) || 1.0;
                                    currentWeightLabel = wr.getAttribute('data-label') || '';
                                    
                                    if (hiddenWeight) hiddenWeight.value = currentWeightFactor;
                                    if (hiddenWeightLabel) hiddenWeightLabel.value = currentWeightLabel;
                                    if (weightBadge) weightBadge.textContent = currentWeightLabel;

                                    const parent = wr.closest('.weight-pill-label');
                                    if (parent) {
                                        const siblings = parent.parentElement.querySelectorAll('.weight-pill-label');
                                        siblings.forEach(s => {
                                            s.className = 'weight-pill-label relative group cursor-pointer border border-gray-200 bg-white text-gray-700 hover:border-amber-300 p-3 rounded-xl transition-all select-none flex flex-col items-center justify-center text-center';
                                        });
                                        parent.className = 'weight-pill-label relative group cursor-pointer border border-amber-500 bg-amber-500/15 text-amber-900 ring-2 ring-amber-500/30 shadow-xs p-3 rounded-xl transition-all select-none flex flex-col items-center justify-center text-center';
                                    }
                                }
                            });
                        }

                        let totalMod = 0;
                        radios.forEach(r => {
                            if (r.checked) {
                                const mod = parseFloat(r.getAttribute('data-price-mod')) || 0;
                                totalMod += mod;

                                const vType = r.getAttribute('data-type');
                                const vName = r.getAttribute('data-name');
                                const lbl = document.querySelector(`.selected-variant-label[data-for-type="${vType}"]`);
                                if (lbl) lbl.textContent = vName;

                                // 1. تحديث أزرار الألوان (Color Swatches)
                                const colorSwatch = r.closest('.variant-color-swatch');
                                if (colorSwatch) {
                                    const allSwatches = colorSwatch.parentElement.querySelectorAll('.variant-color-swatch');
                                    allSwatches.forEach(sw => {
                                        const circle = sw.querySelector('.swatch-circle');
                                        const check = sw.querySelector('.swatch-check');
                                        if (circle) circle.classList.remove('ring-2', 'ring-royal-gold', 'ring-offset-2', 'scale-110', 'shadow-md');
                                        if (check) check.classList.add('opacity-0');
                                    });
                                    const activeCircle = colorSwatch.querySelector('.swatch-circle');
                                    const activeCheck = colorSwatch.querySelector('.swatch-check');
                                    if (activeCircle) activeCircle.classList.add('ring-2', 'ring-royal-gold', 'ring-offset-2', 'scale-110', 'shadow-md');
                                    if (activeCheck) activeCheck.classList.remove('opacity-0');
                                }

                                // 2. تحديث أزرار المقاسات والخيارات الأخرى (Pills)
                                const parentLabel = r.closest('.variant-pill-label');
                                if (parentLabel) {
                                    const siblings = parentLabel.parentElement.querySelectorAll('.variant-pill-label');
                                    siblings.forEach(s => {
                                        s.className = 'variant-pill-label relative cursor-pointer border border-gray-200 bg-white text-gray-600 hover:border-gray-300 py-2 px-4 rounded-xl text-xs font-bold transition-all select-none flex items-center gap-2';
                                    });
                                    parentLabel.className = 'variant-pill-label relative cursor-pointer border border-royal-gold bg-royal-sand/40 text-royal-dark ring-1 ring-royal-gold py-2 px-4 rounded-xl text-xs font-bold transition-all select-none flex items-center gap-2 shadow-sm';
                                }
                            }
                        });

                        const singleUnitPrice = (baseKgPrice * currentWeightFactor) + totalMod;
                        const qtyInput = document.getElementById('input-prod-qty');
                        const qtyVal = parseInt(qtyInput ? qtyInput.value : 1) || 1;

                        if (priceDisplay) {
                            const newTotal = (singleUnitPrice * qtyVal).toFixed(2);
                            priceDisplay.textContent = parseFloat(newTotal);
                        }

                        if (btnCart && isWeightBased && currentWeightLabel) {
                            btnCart.innerHTML = `إضافة (${escapeHtml(currentWeightLabel)}) للحقيبة <i class="fa-solid fa-bag-shopping ms-1"></i>`;
                        }
                    }

                    radios.forEach(r => {
                        r.addEventListener('change', updateCalculatedPrice);
                    });

                    weightRadios.forEach(wr => {
                        wr.addEventListener('change', updateCalculatedPrice);
                    });

                    document.querySelectorAll('.qty-plus, .qty-minus').forEach(btn => {
                        btn.addEventListener('click', function() {
                            setTimeout(updateCalculatedPrice, 20);
                        });
                    });

                    updateCalculatedPrice();
                });
                </script>

                    function updateCalculatedPrice() {
                        let totalMod = 0;
                        radios.forEach(r => {
                            if (r.checked) {
                                const mod = parseFloat(r.getAttribute('data-price-mod')) || 0;
                                totalMod += mod;

                                const vType = r.getAttribute('data-type');
                                const vName = r.getAttribute('data-name');
                                const lbl = document.querySelector(`.selected-variant-label[data-for-type="${vType}"]`);
                                if (lbl) lbl.textContent = vName;

                                // 1. تحديث أزرار الألوان (Color Swatches)
                                const colorSwatch = r.closest('.variant-color-swatch');
                                if (colorSwatch) {
                                    const allSwatches = colorSwatch.parentElement.querySelectorAll('.variant-color-swatch');
                                    allSwatches.forEach(sw => {
                                        const circle = sw.querySelector('.swatch-circle');
                                        const check = sw.querySelector('.swatch-check');
                                        if (circle) circle.classList.remove('ring-2', 'ring-royal-gold', 'ring-offset-2', 'scale-110', 'shadow-md');
                                        if (check) check.classList.add('opacity-0');
                                    });
                                    const activeCircle = colorSwatch.querySelector('.swatch-circle');
                                    const activeCheck = colorSwatch.querySelector('.swatch-check');
                                    if (activeCircle) activeCircle.classList.add('ring-2', 'ring-royal-gold', 'ring-offset-2', 'scale-110', 'shadow-md');
                                    if (activeCheck) activeCheck.classList.remove('opacity-0');
                                }

                                // 2. تحديث أزرار المقاسات والخيارات الأخرى (Pills)
                                const parentLabel = r.closest('.variant-pill-label');
                                if (parentLabel) {
                                    const siblings = parentLabel.parentElement.querySelectorAll('.variant-pill-label');
                                    siblings.forEach(s => {
                                        s.className = 'variant-pill-label relative cursor-pointer border border-gray-200 bg-white text-gray-600 hover:border-gray-300 py-2 px-4 rounded-xl text-xs font-bold transition-all select-none flex items-center gap-2';
                                    });
                                    parentLabel.className = 'variant-pill-label relative cursor-pointer border border-royal-gold bg-royal-sand/40 text-royal-dark ring-1 ring-royal-gold py-2 px-4 rounded-xl text-xs font-bold transition-all select-none flex items-center gap-2 shadow-sm';
                                }
                            }
                        });

                        if (priceDisplay) {
                            const newTotal = (basePrice + totalMod).toFixed(2);
                            priceDisplay.textContent = parseFloat(newTotal);
                        }
                    }

                    radios.forEach(r => {
                        r.addEventListener('change', updateCalculatedPrice);
                    });

                    updateCalculatedPrice();
                });
                </script>

            <!-- مشاركة المنتج -->
            <?php
            $prod_protocol = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? "https" : "http");
            $prod_url = $prod_protocol . "://" . $_SERVER['HTTP_HOST'] . $_SERVER['REQUEST_URI'];
            $store_n = $settings['store_name'] ?? 'المتجر الإلكتروني';
            $share_text = "اكتشفت هذا المنتج المميز من متجر " . $store_n . ": " . $p['name'];
            ?>
            <div class="bg-royal-sand/15 p-4 rounded-xl border border-royal-gold/10 mt-2 mb-6 flex flex-col sm:flex-row items-center justify-between gap-3">
                <span class="text-xs text-gray-500 font-bold flex items-center gap-1.5"><i class="fa-solid fa-share-nodes text-royal-darkgold"></i> مشاركة هذا المنتج:</span>
                <div class="flex gap-2.5">
                    <!-- نسخ الرابط -->
                    <button onclick="copyProductLink('<?php echo $prod_url; ?>')" class="w-8 h-8 rounded-full bg-white text-royal-darkgold hover:bg-royal-gold hover:text-royal-charcoal flex items-center justify-center shadow-sm border border-royal-gold/15 transition-all" title="نسخ رابط المنتج">
                        <i class="fa-solid fa-link text-xs"></i>
                    </button>
                    <!-- مشاركة واتساب -->
                    <a href="https://api.whatsapp.com/send?text=<?php echo urlencode($share_text . "\n" . $prod_url); ?>" target="_blank" class="w-8 h-8 rounded-full bg-[#25D366] text-white hover:scale-110 flex items-center justify-center shadow-sm transition-all" title="مشاركة عبر واتساب">
                        <i class="fa-brands fa-whatsapp text-sm"></i>
                    </a>
                    <!-- مشاركة تلجرام -->
                    <a href="https://t.me/share/url?url=<?php echo urlencode($prod_url); ?>&text=<?php echo urlencode($share_text); ?>" target="_blank" class="w-8 h-8 rounded-full bg-[#0088cc] text-white hover:scale-110 flex items-center justify-center shadow-sm transition-all" title="مشاركة عبر تلجرام">
                        <i class="fa-brands fa-telegram text-sm"></i>
                    </a>
                    <!-- مشاركة نظام الهاتف الأصلية -->
                    <button onclick="nativeShare('<?php echo htmlspecialchars($p['name']); ?>', '<?php echo htmlspecialchars($share_text); ?>', '<?php echo $prod_url; ?>')" class="w-8 h-8 rounded-full bg-royal-charcoal text-white hover:scale-110 flex items-center justify-center shadow-sm transition-all lg:hidden" title="خيارات مشاركة إضافية">
                        <i class="fa-solid fa-arrow-up-from-bracket text-xs"></i>
                    </button>
                </div>
            </div>
            </div>

            <!-- أكورديون تفاصيل وسياسات المنتج -->
            <div class="border-t border-gray-200 divide-y divide-gray-200 mt-6 shadow-sm rounded-xl border border-gray-100 overflow-hidden bg-white">
                <details class="group p-5 cursor-pointer" open>
                    <summary class="font-bold flex justify-between items-center text-royal-dark outline-none select-none text-sm">
                        <span><i class="fa-solid fa-circle-info text-royal-darkgold ml-2"></i> وصف المنتج</span>
                        <span class="transition group-open:rotate-180 text-royal-gold"><i class="fa-solid fa-chevron-down text-xs"></i></span>
                    </summary>
                    <div class="text-gray-500 mt-4 text-xs font-light leading-loose whitespace-pre-wrap pl-4 pr-1 animate-fade-in"><?php echo htmlspecialchars($p['description']); ?></div>
                </details>
                <details class="group p-5 cursor-pointer">
                    <summary class="font-bold flex justify-between items-center text-royal-dark outline-none select-none text-sm">
                        <span><i class="fa-solid fa-truck text-royal-darkgold ml-2"></i> الشحن والتوصيل</span>
                        <span class="transition group-open:rotate-180 text-royal-gold"><i class="fa-solid fa-chevron-down text-xs"></i></span>
                    </summary>
                    <div class="text-gray-500 mt-4 text-xs font-light leading-loose whitespace-pre-wrap pl-4 pr-1 animate-fade-in">
                        <?php echo htmlspecialchars($settings['policy_shipping'] ?? ''); ?>
                        <div class="mt-3 pt-2 border-t border-gray-100">
                            <a href="policies.php#shipping" class="text-royal-darkgold hover:underline font-bold inline-flex items-center gap-1 text-[11px]">
                                قراءة سياسة الشحن والتوصيل كاملة <i class="fa-solid fa-arrow-left text-[9px]"></i>
                            </a>
                        </div>
                    </div>
                </details>
                <details class="group p-5 cursor-pointer">
                    <summary class="font-bold flex justify-between items-center text-royal-dark outline-none select-none text-sm">
                        <span><i class="fa-solid fa-arrow-rotate-left text-royal-darkgold ml-2"></i> سياسة الاسترجاع والاستبدال</span>
                        <span class="transition group-open:rotate-180 text-royal-gold"><i class="fa-solid fa-chevron-down text-xs"></i></span>
                    </summary>
                    <div class="text-gray-500 mt-4 text-xs font-light leading-loose whitespace-pre-wrap pl-4 pr-1 animate-fade-in">
                        <?php echo htmlspecialchars($settings['policy_return'] ?? ''); ?>
                        <div class="mt-3 pt-2 border-t border-gray-100">
                            <a href="policies.php#returns" class="text-royal-darkgold hover:underline font-bold inline-flex items-center gap-1 text-[11px]">
                                قراءة سياسة الاسترجاع والشروط كاملة <i class="fa-solid fa-arrow-left text-[9px]"></i>
                            </a>
                        </div>
                    </div>
                </details>
            </div>
        </div>
    </div>

    <!-- قسم المراجعات والتقييمات -->
    <div class="border-t border-gray-200 pt-16">
        <h3 class="text-2xl font-serif text-royal-dark font-bold mb-10 text-center relative inline-block pb-3 left-1/2 transform -translate-x-1/2">
            آراء عملائنا
            <span class="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-12 h-[2px] bg-royal-gold"></span>
        </h3>
        
        <div class="grid grid-cols-1 md:grid-cols-2 gap-12 items-start">
            <!-- كتابة تقييم جديد -->
            <div class="bg-white p-8 border border-royal-gold/10 shadow-sm rounded-2xl">
                <h4 class="font-serif font-bold text-lg mb-4 text-royal-dark border-b pb-2 flex items-center gap-2">
                    <i class="fa-regular fa-comment-dots text-royal-darkgold"></i> شاركينا رأيكِ في المنتج
                </h4>
                
                <?php if(isset($_GET['msg']) && $_GET['msg']=='review_added'): ?>
                    <div class="bg-green-50 text-green-700 p-4 mb-5 rounded-lg border border-green-200 text-xs font-bold"><i class="fa-regular fa-circle-check"></i> تم إضافة تقييمكِ بنجاح! شكراً لمشاركتنا تجربتكِ.</div>
                <?php endif; ?>
                
                <?php if(isset($_SESSION['user_id'])): ?>
                    <form method="POST" action="product.php?id=<?php echo $p['id']; ?>" class="space-y-4">
                        <div>
                            <label class="block text-xs font-bold text-gray-700 mb-2">تقييمكِ بالنجوم *</label>
                            <select name="rating" required class="w-full p-3 border border-gray-200 outline-none focus:border-royal-gold bg-royal-cream/30 rounded-lg text-sm">
                                <option value="5">⭐⭐⭐⭐⭐ (ممتاز جداً)</option>
                                <option value="4">⭐⭐⭐⭐ (جيد جداً)</option>
                                <option value="3">⭐⭐⭐ (جيد)</option>
                                <option value="2">⭐⭐ (مقبول)</option>
                                <option value="1">⭐ (ضعيف)</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-gray-700 mb-2">تعليقكِ *</label>
                            <textarea name="comment" rows="4" required class="w-full p-3.5 border border-gray-200 outline-none focus:border-royal-gold bg-royal-cream/30 rounded-lg text-sm resize-none" placeholder="اكتبي تجربتكِ الصادقة هنا..."></textarea>
                        </div>
                        <button type="submit" name="submit_review" class="bg-royal-charcoal text-white font-bold py-3 px-6 hover:bg-royal-gold hover:text-royal-charcoal transition-all text-xs tracking-widest w-full rounded-lg shadow-md btn-shine">إرسال التقييم</button>
                    </form>
                <?php else: ?>
                    <div class="text-center py-10 bg-royal-sand/20 rounded-xl border border-dashed border-royal-gold/25">
                        <i class="fa-regular fa-comment-dots text-4xl text-gray-300 mb-4"></i>
                        <p class="text-gray-500 text-xs mb-5 font-bold">يجب تسجيل الدخول لتتمكني من كتابة تقييم للمنتج.</p>
                        <a href="login.php" class="inline-block bg-royal-charcoal text-white font-bold px-8 py-2.5 hover:bg-royal-gold hover:text-royal-charcoal transition-all text-xs tracking-wider rounded-lg shadow">دخول / إنشاء حساب جديد</a>
                    </div>
                <?php endif; ?>
            </div>

            <!-- عرض التقييمات الحالية -->
            <div class="bg-white p-8 border border-royal-gold/10 shadow-sm rounded-2xl">
                <h4 class="font-serif font-bold text-lg mb-6 text-royal-dark border-b pb-2">كل التقييمات (<?php echo $total_reviews; ?>)</h4>
                <?php if($total_reviews == 0): ?>
                    <div class="text-center py-14 text-gray-400 font-serif text-sm">كوني أول من يضع تقييماً ورأياً لهذا المنتج!</div>
                <?php else: ?>
                    <div class="space-y-6 max-h-[450px] overflow-y-auto pr-2">
                        <?php foreach($reviews as $rev): ?>
                            <div class="border-b border-gray-100 pb-5 last:border-0 last:pb-0 animate-fade-in">
                                <div class="flex justify-between items-center mb-1.5">
                                    <div class="font-bold text-sm text-royal-dark"><?php echo htmlspecialchars($rev['user_name']); ?></div>
                                    <div class="text-[10px] text-gray-400" dir="ltr"><?php echo date('Y-m-d', strtotime($rev['created_at'])); ?></div>
                                </div>
                                <div class="text-royal-gold text-[10px] mb-2.5">
                                    <?php 
                                    for($i=1; $i<=5; $i++){
                                        echo $i <= $rev['rating'] ? '<i class="fa-solid fa-star"></i>' : '<i class="fa-regular fa-star"></i>';
                                    }
                                    ?>
                                </div>
                                <p class="text-gray-600 text-xs leading-relaxed whitespace-pre-wrap font-light"><?php echo htmlspecialchars($rev['comment']); ?></p>
                            </div>
                        <?php endforeach; ?>
                    </div>
                <?php endif; ?>
            </div>
        </div>
    </div>
</div>

<!-- تشغيل وإعداد Swiper للصور التفاعلية للمنتج -->
<script>
    document.addEventListener('DOMContentLoaded', function() {
        // إعداد Thumbs slider أولاً إذا كان موجوداً
        const thumbSlider = document.querySelector('.product-swiper-thumbs');
        let swiperThumbs = null;
        if (thumbSlider) {
            swiperThumbs = new Swiper('.product-swiper-thumbs', {
                spaceBetween: 10,
                slidesPerView: 4,
                freeMode: true,
                watchSlidesProgress: true,
            });
        }

        // إعداد السلايدر الرئيسي
        const mainSwiper = new Swiper('.product-swiper', {
            spaceBetween: 10,
            pagination: {
                el: '.swiper-pagination',
                clickable: true
            },
            thumbs: {
                swiper: swiperThumbs
            }
        });

        // تشغيل أزرار الكمية + و -
        document.querySelectorAll('.qty-plus').forEach(btn => {
            btn.addEventListener('click', function() {
                let input = this.previousElementSibling;
                input.value = parseInt(input.value) + 1;
            });
        });
        
        document.querySelectorAll('.qty-minus').forEach(btn => {
            btn.addEventListener('click', function() {
                let input = this.nextElementSibling;
                if(parseInt(input.value) > 1) { 
                    input.value = parseInt(input.value) - 1; 
                }
            });
        });

        // تغيير الصورة الكبيرة عند الحوم (hover) أو اللمس (touch) على المصغرات
        setTimeout(() => {
            document.querySelectorAll('.product-swiper-thumbs .swiper-slide').forEach((slide, index) => {
                slide.addEventListener('mouseenter', function() {
                    if (mainSwiper) mainSwiper.slideTo(index);
                });
                slide.addEventListener('touchstart', function() {
                    if (mainSwiper) mainSwiper.slideTo(index);
                });
            });
        }, 300);
    });

    function copyProductLink(url) {
        if (!url) return;
        navigator.clipboard.writeText(url).then(() => {
            showToast("تم نسخ رابط المنتج بنجاح! 🔗");
        }).catch(err => {
            console.error('Failed to copy: ', err);
        });
    }

    function nativeShare(title, text, url) {
        if (navigator.share) {
            navigator.share({
                title: title,
                text: text,
                url: url
            }).catch(console.error);
        }
    }

    function showToast(message) {
        let toast = document.createElement('div');
        toast.className = "fixed bottom-28 left-1/2 transform -translate-x-1/2 bg-royal-charcoal text-royal-gold px-6 py-3.5 rounded-2xl shadow-2xl border border-royal-gold/25 z-[99999] text-xs font-bold font-sans transition-all duration-300 opacity-0 scale-95";
        toast.textContent = message;
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.classList.remove('opacity-0', 'scale-95');
            toast.classList.add('opacity-100', 'scale-100');
        }, 10);
        
        setTimeout(() => {
            toast.classList.remove('opacity-100', 'scale-100');
            toast.classList.add('opacity-0', 'scale-95');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // وظائف المودال والتكبير (Lightbox)
    function openLightbox() {
        const activeSlide = document.querySelector('.product-swiper .swiper-slide-active img');
        if (!activeSlide) return;
        
        const modal = document.getElementById('lightbox-modal');
        const img = document.getElementById('lightbox-img');
        img.src = activeSlide.src;
        img.style.transform = 'scale(1)';
        img.classList.remove('cursor-zoom-out');
        img.classList.add('cursor-zoom-in');
        
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }

    function closeLightbox() {
        const modal = document.getElementById('lightbox-modal');
        modal.classList.remove('flex');
        modal.classList.add('hidden');
    }

    function toggleImageZoom() {
        const img = document.getElementById('lightbox-img');
        if (img.style.transform === 'scale(1.8)') {
            img.style.transform = 'scale(1)';
            img.classList.remove('cursor-zoom-out');
            img.classList.add('cursor-zoom-in');
        } else {
            img.style.transform = 'scale(1.8)';
            img.classList.remove('cursor-zoom-in');
            img.classList.add('cursor-zoom-out');
        }
    }
</script>

<!-- نافذة المودال للتكبير (Lightbox Modal) -->
<div id="lightbox-modal" class="fixed inset-0 bg-black/90 backdrop-blur-md z-[99999] hidden flex items-center justify-center animate-fade-in" onclick="closeLightbox()">
    <button type="button" class="absolute top-5 right-5 text-white/70 hover:text-white text-3xl focus:outline-none">
        <i class="fa-solid fa-xmark"></i>
    </button>
    <div class="max-w-[90vw] max-h-[85vh] relative overflow-hidden" onclick="event.stopPropagation()">
        <img id="lightbox-img" src="" class="max-w-full max-h-[85vh] object-contain rounded-lg transition-transform duration-300 select-none cursor-zoom-in" onclick="toggleImageZoom()">
    </div>
</div>

<?php
include 'footer.php';
?>
