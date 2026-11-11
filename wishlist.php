<?php
require_once 'config.php';
require_once __DIR__ . '/storefront_helpers.php';

// استيراد القائمة المشتركة إلى مفضلة المستخدم الحالية
if (isset($_GET['action']) && $_GET['action'] === 'import' && isset($_GET['items'])) {
    $items_raw = explode(',', $_GET['items']);
    $import_ids = array_map('intval', $items_raw);
    $import_ids = array_filter($import_ids, function($id) { return $id > 0; });
    
    foreach ($import_ids as $p_id) {
        if (isset($_SESSION['user_id'])) {
            $user_id = $_SESSION['user_id'];
            $check = $pdo->prepare("SELECT COUNT(*) FROM wishlist WHERE user_id = ? AND product_id = ?");
            $check->execute([$user_id, $p_id]);
            if ($check->fetchColumn() == 0) {
                $pdo->prepare("INSERT INTO wishlist (user_id, product_id) VALUES (?, ?)")->execute([$user_id, $p_id]);
            }
        } else {
            if (!isset($_SESSION['wishlist'])) {
                $_SESSION['wishlist'] = [];
            }
            if (!in_array($p_id, $_SESSION['wishlist'])) {
                $_SESSION['wishlist'][] = $p_id;
            }
        }
    }
    header("Location: wishlist.php?msg=imported");
    exit;
}

include 'header.php';

// جلب المنتجات المضافة للمفضلة
$wishlist_products = [];
$is_shared_view = false;
$shared_items = [];

if (isset($_GET['items']) && !empty($_GET['items'])) {
    $is_shared_view = true;
    $items_raw = explode(',', $_GET['items']);
    $shared_items = array_map('intval', $items_raw);
    $shared_items = array_filter($shared_items, function($id) { return $id > 0; });
}

if ($is_shared_view) {
    if (!empty($shared_items)) {
        $placeholders = implode(',', array_fill(0, count($shared_items), '?'));
        $stmt = $pdo->prepare("SELECT * FROM products WHERE id IN ($placeholders) AND " . storefrontVisibleProductSql() . " ORDER BY id DESC");
        $stmt->execute($shared_items);
        $wishlist_products = $stmt->fetchAll(PDO::FETCH_ASSOC);
    }
} else {
    if (isset($_SESSION['user_id'])) {
        $user_id = $_SESSION['user_id'];
        $stmt = $pdo->prepare("SELECT p.* FROM products p JOIN wishlist w ON p.id = w.product_id WHERE w.user_id = ? AND " . storefrontVisibleProductSql('p') . " ORDER BY w.id DESC");
        $stmt->execute([$user_id]);
        $wishlist_products = $stmt->fetchAll(PDO::FETCH_ASSOC);
    } else {
        if (isset($_SESSION['wishlist']) && !empty($_SESSION['wishlist'])) {
            $placeholders = implode(',', array_fill(0, count($_SESSION['wishlist']), '?'));
            $stmt = $pdo->prepare("SELECT * FROM products WHERE id IN ($placeholders) AND " . storefrontVisibleProductSql() . " ORDER BY id DESC");
            $stmt->execute($_SESSION['wishlist']);
            $wishlist_products = $stmt->fetchAll(PDO::FETCH_ASSOC);
        }
    }
}

// توليد رابط المشاركة للمفضلة الحالية
$wishlist_ids = array_column($wishlist_products, 'id');
$share_link = "";
if (!empty($wishlist_ids)) {
    $protocol = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? "https" : "http");
    $host = $_SERVER['HTTP_HOST'];
    $path = strtok($_SERVER["REQUEST_URI"], '?');
    $share_link = $protocol . "://" . $host . $path . "?items=" . implode(',', $wishlist_ids);
}
?>

<div class="container mx-auto px-4 md:px-8 py-16 max-w-6xl animate-fade-in">
    <!-- إشعار نجاح الاستيراد -->
    <?php if (isset($_GET['msg']) && $_GET['msg'] === 'imported'): ?>
        <div class="bg-green-50 text-green-700 p-4 mb-8 rounded-xl border border-green-200 text-xs font-bold text-center">
            <i class="fa-solid fa-circle-check text-sm mr-1"></i> تم استيراد وحفظ المنتجات إلى قائمة أمنياتكِ بنجاح!
        </div>
    <?php endif; ?>

    <!-- بنر عرض القائمة المشتركة -->
    <?php if ($is_shared_view && !empty($wishlist_products)): ?>
        <div class="bg-royal-sand/35 p-6 rounded-2xl border border-royal-gold/20 mb-10 flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-right">
            <div>
                <h3 class="text-sm font-serif font-bold text-royal-dark">✨ قائمة أمنيات مشاركة معكِ</h3>
                <p class="text-[11px] text-gray-500 mt-1 font-light">يمكنكِ تصفح هذه المنتجات التي اختارتها صديقتكِ، أو حفظها مباشرة لمفضلتكِ!</p>
            </div>
            <a href="wishlist.php?action=import&items=<?php echo implode(',', $wishlist_ids); ?>" class="bg-royal-charcoal text-white hover:bg-royal-gold hover:text-royal-charcoal px-6 py-2.5 rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-2">
                <i class="fa-solid fa-heart-circle-plus"></i> حفظ المنتجات لمفضلتى
            </a>
        </div>
    <?php endif; ?>

    <div class="text-center mb-12">
        <span class="text-royal-darkgold text-xs font-bold tracking-widest uppercase mb-2 block">YOUR FAVOURITES</span>
        <h2 class="text-3xl font-serif text-royal-dark font-bold"><?php echo $is_shared_view ? 'قائمة الأمنيات المشتركة' : 'قائمة الأمنيات الخاصة بكِ'; ?></h2>
        <p class="text-xs text-gray-500 font-light mt-2"><?php echo $is_shared_view ? 'المنتجات الفاخرة التي تمت مشاركتها معكِ للتصفح.' : 'المنتجات الفاخرة التي قمتِ بحفظها لشرائها لاحقاً.'; ?></p>
        
        <?php if (!$is_shared_view && !empty($wishlist_products)): ?>
            <div class="mt-4 flex justify-center">
                <button onclick="copyShareLink('<?php echo $share_link; ?>')" class="bg-royal-sand hover:bg-royal-gold/15 text-royal-darkgold border border-royal-gold/20 py-2.5 px-6 rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-sm hover:scale-105">
                    <i class="fa-solid fa-share-nodes"></i> مشاركة هذه القائمة مع صديق
                </button>
            </div>
        <?php endif; ?>
    </div>

    <?php if (empty($wishlist_products)): ?>
        <div class="text-center py-20 bg-white rounded-2xl border border-royal-gold/10 shadow-sm max-w-xl mx-auto">
            <div class="w-16 h-16 bg-royal-cream text-royal-darkgold rounded-full flex items-center justify-center text-2xl mx-auto mb-6">
                <i class="fa-regular fa-heart"></i>
            </div>
            <h3 class="text-lg text-royal-dark font-serif font-bold mb-2">قائمة الأمنيات فارغة</h3>
            <p class="text-gray-400 text-xs max-w-xs mx-auto mb-8 font-light leading-relaxed">تصفح منتجات المتجر المميزة وأضف ما يعجبك بالضغط على أيقونة القلب.</p>
            <a href="shop.php" class="bg-royal-charcoal text-white hover:bg-royal-gold hover:text-royal-charcoal px-8 py-3.5 text-xs font-bold tracking-widest uppercase transition-all shadow-md rounded-xl btn-shine">تصفح المتجر الآن</a>
        </div>
    <?php else: ?>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8" id="wishlist-grid">
            <?php foreach ($wishlist_products as $p): $p['image_url'] = resolveProductDisplayImage($pdo, $p); ?>
                <div class="product-card group relative flex flex-col bg-white rounded-2xl overflow-hidden shadow-sm border border-royal-gold/10 p-3 hover:shadow-lg transition-all duration-300" id="item-card-<?php echo $p['id']; ?>">
                    <!-- الصورة والتأثيرات -->
                    <div class="product-image-container block overflow-hidden bg-gray-50 aspect-[4/5] relative rounded-xl shadow-inner">
                        <?php if($p['old_price'] && $p['old_price'] > $p['price']): $discount = round((($p['old_price'] - $p['price']) / $p['old_price']) * 100); ?>
                            <span class="absolute top-3 left-3 bg-red-600 text-white text-[9px] font-bold tracking-wider py-1.5 px-3 rounded-full z-10">خصم <?php echo $discount; ?>%</span>
                        <?php endif; ?>
                        
                        <!-- زر حذف من المفضلة -->
                        <button type="button" onclick="removeFromWishlist(<?php echo $p['id']; ?>)" class="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/95 text-red-500 flex items-center justify-center shadow-md transition-all z-20 focus:outline-none hover:scale-110">
                            <i class="fa-solid fa-trash-can text-xs"></i>
                        </button>

                        <img src="<?php echo htmlspecialchars($p['image_url']); ?>" class="w-full h-full object-cover" alt="<?php echo htmlspecialchars($p['name']); ?>">
                        
                        <!-- زر الإضافة للسلة أو اختيار الوزن السريع عند الحوم -->
                        <div class="absolute inset-x-0 bottom-0 p-3 z-10 add-to-cart-btn">
                            <?php if(!empty($p['is_weight_based'])): ?>
                                <a href="product.php?id=<?php echo $p['id']; ?>" class="w-full bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold py-3.5 transition shadow-lg rounded-xl btn-shine flex items-center justify-center gap-1.5">
                                    ⚖️ اختر الوزن <i class="fa-solid fa-arrow-left text-[10px]"></i>
                                </a>
                            <?php else: ?>
                                <form method="POST" action="">
                                    <input type="hidden" name="return_page" value="wishlist.php">
                                    <input type="hidden" name="product_id" value="<?php echo $p['id']; ?>">
                                    <input type="hidden" name="product_name" value="<?php echo htmlspecialchars($p['name']); ?>">
                                    <input type="hidden" name="product_price" value="<?php echo $p['price']; ?>">
                                    <input type="hidden" name="product_image" value="<?php echo htmlspecialchars($p['image_url']); ?>">
                                    <button type="submit" name="add_to_cart" class="w-full bg-royal-charcoal text-white hover:bg-royal-gold hover:text-royal-charcoal text-xs font-bold py-3.5 transition shadow-lg rounded-xl btn-shine">أضف للسلة <i class="fa-solid fa-cart-plus mr-1"></i></button>
                                </form>
                            <?php endif; ?>
                        </div>
                    </div>
                    <!-- تفاصيل الكارت -->
                    <div class="pt-4 pb-2 text-center">
                        <span class="text-[10px] text-gray-400 font-bold uppercase tracking-wider block mb-1"><?php echo htmlspecialchars($p['category']); ?></span>
                        <a href="product.php?id=<?php echo $p['id']; ?>" class="block text-sm font-semibold text-royal-dark mb-2 hover:text-royal-gold transition-colors duration-300 leading-tight"><?php echo htmlspecialchars($p['name']); ?></a>
                        
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
</div>

<script>
    function removeFromWishlist(productId) {
        const formData = new FormData();
        formData.append('product_id', productId);
        
        fetch('ajax_wishlist.php', {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success' && data.action === 'removed') {
                // إخفاء الكارت الخاص بالمنتج بحركة ناعمة
                const card = document.getElementById('item-card-' + productId);
                card.style.opacity = '0';
                card.style.transform = 'scale(0.9)';
                setTimeout(() => {
                    card.remove();
                    const remainingCards = document.querySelectorAll('#wishlist-grid > div');
                    if (remainingCards.length === 0) {
                        location.reload();
                    }
                }, 300);
            } else {
                alert(data.message || 'حدث خطأ ما');
            }
        })
        .catch(error => {
            console.error('Error:', error);
        });
    }

    function copyShareLink(url) {
        if (!url) return;
        navigator.clipboard.writeText(url).then(() => {
            showToast("تم نسخ رابط مشاركة المفضلة بنجاح! 🔗");
        }).catch(err => {
            console.error('Failed to copy: ', err);
        });
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
</script>

<?php
include 'footer.php';
?>
