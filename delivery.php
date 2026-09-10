<?php
require_once 'config.php';

// جلب قائمة الطيارين النشطين
$stmt_drivers = $pdo->query("SELECT id, name, phone, cash_balance FROM delivery_drivers WHERE is_active = 1 ORDER BY name ASC");
$active_drivers = $stmt_drivers->fetchAll(PDO::FETCH_ASSOC);
?>
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>تطبيق الطيارين والدليفري | سوبر ماركت المنزل السوري</title>
    
    <!-- PWA & Mobile App Settings -->
    <link rel="manifest" href="delivery-manifest.json">
    <meta name="theme-color" content="#0f172a">
    <meta name="mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
    <meta name="apple-mobile-web-app-title" content="سوريان دليفري">
    <link rel="apple-touch-icon" href="images/delivery-icon-192.png">
    <link rel="icon" type="image/png" href="images/delivery-icon-192.png">
    
    <!-- الخطوط والأيقونات والتنسيقات الحديثة -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap" rel="stylesheet">
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    
    <script>
        tailwind.config = {
            theme: {
                extend: {
                    fontFamily: { sans: ['Cairo', 'sans-serif'] },
                    colors: {
                        brand: {
                            50: '#ecfdf5',
                            500: '#10b981',
                            600: '#059669',
                            700: '#047857',
                        },
                        driver: {
                            amber: '#f59e0b',
                            dark: '#0f172a',
                            card: '#1e293b'
                        }
                    }
                }
            }
        }
    </script>
    
    <style>
        body { font-family: 'Cairo', sans-serif; -webkit-tap-highlight-color: transparent; }
        .glass-panel { background: rgba(30, 41, 59, 0.95); backdrop-filter: blur(10px); }
        .pulse-amber { animation: pulseAmber 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
        @keyframes pulseAmber { 0%, 100% { opacity: 1; } 50% { opacity: .5; } }
    </style>
</head>
<body class="bg-slate-950 text-slate-100 min-h-screen pb-20 select-none">

    <!-- ================================================================= -->
    <!-- 1. شاشة تسجيل دخول الطيار برمز الـ PIN (Driver Login Screen)      -->
    <!-- ================================================================= -->
    <div id="driver-login-screen" class="fixed inset-0 z-50 bg-slate-950 flex flex-col items-center justify-center p-4">
        <div class="max-w-sm w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl text-center space-y-5">
            
            <div class="w-20 h-20 mx-auto rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center text-3xl shadow-lg border border-amber-500/30">
                <i class="fa-solid fa-motorcycle animate-bounce"></i>
            </div>

            <div>
                <h1 class="text-xl font-black text-white">تطبيق طياري الدليفري</h1>
                <p class="text-xs text-slate-400 mt-1">سوبر ماركت المنزل السوري | نظام التوصيل المعزول</p>
            </div>

            <form onsubmit="handleDriverLogin(event)" class="space-y-4 text-right text-xs">
                <div>
                    <label class="block font-bold text-slate-300 mb-1.5">اختر اسم الكابتن / الطيار:</label>
                    <select id="login-driver-select" required class="w-full bg-slate-950 border border-slate-700 text-white rounded-xl px-3 py-3 text-sm focus:outline-none focus:border-amber-500 font-bold">
                        <option value="">-- اضغط لاختيار اسمك --</option>
                        <?php foreach ($active_drivers as $drv): ?>
                            <option value="<?php echo htmlspecialchars($drv['name']); ?>" data-id="<?php echo $drv['id']; ?>">
                                🛵 <?php echo htmlspecialchars($drv['name']); ?> (<?php echo htmlspecialchars($drv['phone']); ?>)
                            </option>
                        <?php endforeach; ?>
                    </select>
                </div>

                <div>
                    <label class="block font-bold text-slate-300 mb-1.5">الرمز السري (PIN Code):</label>
                    <div class="relative">
                        <input type="password" id="login-driver-pin" maxlength="6" inputmode="numeric" required placeholder="أدخل رمز PIN (مثال: 1111)" 
                               class="w-full bg-slate-950 border border-slate-700 text-amber-400 font-mono text-center tracking-widest text-lg rounded-xl px-3 py-3 focus:outline-none focus:border-amber-500">
                    </div>
                    <p class="text-[10px] text-slate-400 mt-1">* رمز PIN التجريبي: حسام (1111) | طارق (2222) | محمود (3333)</p>
                </div>

                <button type="submit" id="login-submit-btn" class="w-full py-3.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-base rounded-xl shadow-lg transition-all flex items-center justify-center gap-2">
                    <i class="fa-solid fa-lock-open"></i>
                    <span>دخول واستعراض أوردراتي فقط</span>
                </button>
            </form>

            <div id="login-install-banner" class="pt-3 border-t border-slate-800 space-y-1">
                <button type="button" onclick="triggerPwaInstall()" class="w-full py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-xs rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 border border-emerald-400/30">
                    <i class="fa-solid fa-mobile-screen-button text-sm animate-bounce"></i>
                    <span>📲 تثبيت تطبيق الدليفري على هاتفك</span>
                </button>
                <p class="text-[10px] text-slate-400">يعمل كتطبيق كامل ومستقل على شاشة هاتفك الرئيسية</p>
            </div>

            <div class="pt-2 border-t border-slate-800 text-center">
                <a href="/pos/" target="_blank" class="text-slate-400 hover:text-white text-[11px] font-bold inline-flex items-center gap-1">
                    <i class="fa-solid fa-cash-register"></i> الذهاب لشاشة الكاشير الرئيسية (POS)
                </a>
            </div>
        </div>
    </div>

    <!-- ================================================================= -->
    <!-- 2. الشاشة الرئيسية لتطبيق الدليفري (Driver Dashboard)             -->
    <!-- ================================================================= -->
    <div id="driver-app-content" class="hidden min-h-screen">
        
        <!-- الشريط العلوي الذكي -->
        <header class="sticky top-0 z-30 glass-panel border-b border-slate-800 px-4 py-3 shadow-lg">
            <div class="flex items-center justify-between max-w-2xl mx-auto">
                <div class="flex items-center gap-2.5">
                    <div class="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center text-lg font-black border border-amber-500/30">
                        <i class="fa-solid fa-motorcycle"></i>
                    </div>
                    <div>
                        <div class="flex items-center gap-1.5">
                            <h2 class="font-black text-sm text-white" id="header-driver-name">كابتن الطيار</h2>
                            <span class="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                        </div>
                        <p class="text-[10px] text-slate-400">سوبر ماركت المنزل السوري</p>
                    </div>
                </div>

                <div class="flex items-center gap-2">
                    <button id="header-install-btn" onclick="triggerPwaInstall()" class="px-2.5 py-1.5 bg-emerald-500/20 hover:bg-emerald-500 text-emerald-400 hover:text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border border-emerald-500/30" title="تثبيت التطبيق على الهاتف">
                        <i class="fa-solid fa-mobile-screen-button"></i>
                        <span class="hidden sm:inline">تثبيت التطبيق</span>
                    </button>
                    <button onclick="refreshDriverOrders(true)" class="w-9 h-9 rounded-xl bg-slate-800 text-slate-300 hover:text-white flex items-center justify-center text-xs transition-colors" title="تحديث">
                        <i class="fa-solid fa-rotate" id="refresh-icon"></i>
                    </button>
                    <button onclick="driverLogout()" class="px-2.5 py-1.5 bg-rose-500/20 hover:bg-rose-500 text-rose-400 hover:text-white rounded-xl text-xs font-bold transition-all" title="تسجيل الخروج">
                        <i class="fa-solid fa-power-off"></i> خروج
                    </button>
                </div>
            </div>
        </header>

        <!-- مساحة العمل الرئيسية -->
        <main class="max-w-2xl mx-auto p-4 space-y-4">
            
            <!-- بطاقة محفظة العهدة والماليات (الفلوس اللي عليا) -->
            <div class="bg-gradient-to-br from-slate-900 to-slate-850 border border-slate-800 rounded-3xl p-4 shadow-xl">
                <div class="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
                    <span class="text-xs font-black text-slate-300 flex items-center gap-1.5">
                        <i class="fa-solid fa-wallet text-amber-400 text-sm"></i> محفظتي وعهدة الكاشير:
                    </span>
                    <button onclick="openSettleModal()" class="text-[11px] font-bold px-2.5 py-1 bg-amber-500/20 text-amber-300 hover:bg-amber-500 hover:text-slate-950 rounded-lg border border-amber-500/40 transition-all">
                        <i class="fa-solid fa-hand-holding-dollar ml-1"></i> تصفية وتسليم عهدة
                    </button>
                </div>

                <div class="grid grid-cols-2 gap-3 text-center">
                    <div class="bg-slate-950/80 p-3 rounded-2xl border border-slate-800">
                        <span class="text-[10px] text-slate-400 block font-bold mb-0.5">💰 الفلوس الكاش اللي معايا (العهدة):</span>
                        <span class="text-lg sm:text-xl font-black text-amber-400 font-mono" id="stat-cash-in-hand">0.00 ج.م</span>
                        <span class="text-[9px] text-slate-400 block mt-0.5">واجب تسليمها للخزينة</span>
                    </div>

                    <div class="bg-slate-950/80 p-3 rounded-2xl border border-slate-800">
                        <span class="text-[10px] text-slate-400 block font-bold mb-0.5">🛵 عمولة التوصيل المستحقة:</span>
                        <span class="text-lg sm:text-xl font-black text-emerald-400 font-mono" id="stat-commission">0.00 ج.م</span>
                        <span class="text-[9px] text-slate-400 block mt-0.5">أجرتي عن أوردرات اليوم</span>
                    </div>
                </div>
            </div>

            <!-- شريط التبويبات الثلاثية للأوردرات -->
            <div class="grid grid-cols-3 gap-1.5 bg-slate-900 p-1.5 rounded-2xl border border-slate-800 text-xs font-bold text-center">
                <button onclick="switchTab('in_transit')" id="tab-btn-in_transit" class="tab-pill py-2.5 rounded-xl bg-amber-500 text-slate-950 font-black shadow transition-all flex flex-col items-center justify-center gap-0.5">
                    <span class="flex items-center gap-1">
                        <i class="fa-solid fa-route"></i> في الطريق
                    </span>
                    <span class="text-[10px] opacity-90 font-mono" id="badge-in_transit">(0)</span>
                </button>

                <button onclick="switchTab('pending')" id="tab-btn-pending" class="tab-pill py-2.5 rounded-xl text-slate-400 hover:text-white transition-all flex flex-col items-center justify-center gap-0.5">
                    <span class="flex items-center gap-1">
                        <i class="fa-solid fa-clock"></i> جديدة بانتظاري
                    </span>
                    <span class="text-[10px] opacity-80 font-mono" id="badge-pending">(0)</span>
                </button>

                <button onclick="switchTab('delivered')" id="tab-btn-delivered" class="tab-pill py-2.5 rounded-xl text-slate-400 hover:text-white transition-all flex flex-col items-center justify-center gap-0.5">
                    <span class="flex items-center gap-1">
                        <i class="fa-solid fa-check-circle"></i> المسلمة اليوم
                    </span>
                    <span class="text-[10px] opacity-80 font-mono" id="badge-delivered">(0)</span>
                </button>
            </div>

            <!-- حاوية عرض كروت الأوردرات -->
            <div id="orders-container" class="space-y-3">
                <!-- تعبأ ديناميكياً ببطاقات الأوردرات -->
            </div>

            <!-- رسالة فارغة عند عدم وجود أوردرات -->
            <div id="empty-orders-view" class="hidden bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center space-y-3">
                <div class="w-16 h-16 mx-auto rounded-full bg-slate-800 text-slate-500 flex items-center justify-center text-2xl">
                    <i class="fa-solid fa-box-open"></i>
                </div>
                <h3 class="font-bold text-sm text-slate-200">لا توجد أوردرات في هذا القسم حالياً</h3>
                <p class="text-xs text-slate-400">بمجرد تسجيل الكاشير لأوردر جديد باسمك سيظهر هنا فوراً</p>
                <button onclick="refreshDriverOrders(true)" class="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-amber-400 rounded-xl text-xs font-bold">
                    <i class="fa-solid fa-rotate ml-1"></i> فحص الأوردرات الآن
                </button>
            </div>

        </main>
    </div>

    <!-- ================================================================= -->
    <!-- 3. نافذة تصفية وتسليم العهدة للكاشير (Settle Modal)               -->
    <!-- ================================================================= -->
    <div id="settle-modal" class="fixed inset-0 z-50 bg-black/80 hidden items-center justify-center p-4">
        <div class="max-w-sm w-full bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-2xl space-y-4 text-xs">
            <div class="flex items-center justify-between pb-3 border-b border-slate-800">
                <h3 class="font-black text-sm text-white flex items-center gap-2">
                    <i class="fa-solid fa-hand-holding-dollar text-amber-400"></i>
                    <span>تسليم وتصفية عهدة الكاشير</span>
                </h3>
                <button onclick="closeModal('settle-modal')" class="text-slate-400 hover:text-white"><i class="fa-solid fa-xmark text-base"></i></button>
            </div>

            <div class="bg-slate-950 p-3 rounded-2xl border border-slate-800 text-center">
                <span class="text-slate-400 block text-[11px]">إجمالي العهدة النقدية المسجلة عليك حالياً:</span>
                <span class="text-xl font-black text-amber-400 font-mono" id="settle-current-balance">0.00 ج.م</span>
            </div>

            <form onsubmit="handleSettleSubmit(event)" class="space-y-3">
                <div>
                    <label class="block font-bold text-slate-300 mb-1">المبلغ المراد تسليمه للخزينة (ج.م):</label>
                    <input type="number" id="settle-amount" step="1" required min="1" 
                           class="w-full bg-slate-950 border border-slate-700 text-amber-400 font-black text-center text-lg rounded-xl px-3 py-2.5 focus:outline-none focus:border-amber-500">
                </div>

                <div>
                    <label class="block font-bold text-slate-300 mb-1">ملاحظة / اسم الكاشير المستلم:</label>
                    <input type="text" id="settle-note" placeholder="مثال: تسليم كاشير الوردية أحمد" 
                           class="w-full bg-slate-950 border border-slate-700 text-white rounded-xl px-3 py-2 focus:outline-none">
                </div>

                <div class="grid grid-cols-2 gap-2 pt-2">
                    <button type="submit" id="settle-submit-btn" class="py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-xl shadow">
                        تأكيد التسليم ✓
                    </button>
                    <button type="button" onclick="closeModal('settle-modal')" class="py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl">
                        إلغاء
                    </button>
                </div>
            </form>
        </div>
    </div>

    <!-- نغمات الصوت والإشعارات -->
    <audio id="beep-sound" src="data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbqWEzHSSa2/C7eFEmJ5rV8M2GYSweptbtyoxgLSSf2fTSh2QrIZrS7s2EZCsemtDtzoVjKCSZ0u3Qh2YrIZjR7tCHZisgmNHuz4hoLCSY0O/QiWssJJjQ8NKKbC4pmtHw041xMiyY0fHVj3c4L" preload="auto"></audio>

    <!-- ================================================================= -->
    <!-- 4. جافاسكريبت التطبيق الشامل وإدارة أوردرات الطيار المعزولة        -->
    <!-- ================================================================= -->
    <script>
        // المتغيرات العامة لجلسة الطيار
        let currentDriver = null;
        let activeTab = 'in_transit'; // in_transit | pending | delivered
        let ordersData = {
            in_transit: [],
            pending: [],
            delivered: [],
            stats: {}
        };
        let pollInterval = null;

        // تهيئة التطبيق وفحص الجلسة
        document.addEventListener('DOMContentLoaded', () => {
            const savedDriver = localStorage.getItem('syrian_home_driver_session');
            if (savedDriver) {
                try {
                    currentDriver = JSON.parse(savedDriver);
                    initDriverApp();
                } catch (e) {
                    showLoginScreen();
                }
            } else {
                showLoginScreen();
            }
        });

        function showLoginScreen() {
            document.getElementById('driver-login-screen').classList.remove('hidden');
            document.getElementById('driver-app-content').classList.add('hidden');
            if (pollInterval) clearInterval(pollInterval);
        }

        async function handleDriverLogin(e) {
            e.preventDefault();
            const btn = document.getElementById('login-submit-btn');
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري التحقق...';

            const select = document.getElementById('login-driver-select');
            const driverName = select.value;
            const driverId = select.options[select.selectedIndex]?.dataset.id || 0;
            const pinCode = document.getElementById('login-driver-pin').value.trim();

            if (!driverName || !pinCode) {
                alert("يرجى اختيار اسمك وإدخال رمز PIN");
                btn.disabled = false;
                btn.innerHTML = '<i class="fa-solid fa-lock-open"></i> <span>دخول واستعراض أوردراتي فقط</span>';
                return;
            }

            try {
                const res = await fetch('api_sync.php?action=driver_login&api_key=syrian_home_pos_secret_token_2026', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ driver_id: driverId, pin_code: pinCode })
                });
                const data = await res.json();

                if (data.success && data.driver) {
                    currentDriver = data.driver;
                    localStorage.setItem('syrian_home_driver_session', JSON.stringify(currentDriver));
                    initDriverApp();
                } else {
                    alert("❌ خطأ: " + (data.error || "رمز PIN غير صحيح!"));
                }
            } catch (err) {
                alert("تعذر الاتصال بالسيرفر!");
            } finally {
                btn.disabled = false;
                btn.innerHTML = '<i class="fa-solid fa-lock-open"></i> <span>دخول واستعراض أوردراتي فقط</span>';
            }
        }

        function initDriverApp() {
            document.getElementById('driver-login-screen').classList.add('hidden');
            document.getElementById('driver-app-content').classList.remove('hidden');
            document.getElementById('header-driver-name').innerText = currentDriver.name;
            
            refreshDriverOrders();
            // فحص دوري للأوردرات الجديدة كل 15 ثانية
            if (pollInterval) clearInterval(pollInterval);
            pollInterval = setInterval(() => refreshDriverOrders(false), 15000);
        }

        function driverLogout() {
            if (confirm("هل تريد تسجيل الخروج من حساب الطيار؟")) {
                localStorage.removeItem('syrian_home_driver_session');
                currentDriver = null;
                showLoginScreen();
            }
        }

        // جلب أوردرات الطيار المعزولة حصراً
        async function refreshDriverOrders(showLoading = false) {
            if (!currentDriver) return;

            const refreshIcon = document.getElementById('refresh-icon');
            if (refreshIcon && showLoading) refreshIcon.classList.add('fa-spin');

            try {
                const url = `api_sync.php?action=get_driver_orders&driver_name=${encodeURIComponent(currentDriver.name)}&api_key=syrian_home_pos_secret_token_2026`;
                const res = await fetch(url);
                const data = await res.json();

                if (data.success) {
                    ordersData.in_transit = data.orders_in_transit || [];
                    ordersData.pending = data.orders_pending || [];
                    ordersData.delivered = data.orders_delivered_today || [];
                    ordersData.stats = data.stats || {};

                    updateStatsUI();
                    renderOrdersList();
                }
            } catch (e) {
                console.error("Error loading orders:", e);
            } finally {
                if (refreshIcon) refreshIcon.classList.remove('fa-spin');
            }
        }

        function updateStatsUI() {
            const stats = ordersData.stats;
            document.getElementById('stat-cash-in-hand').innerText = `${parseFloat(stats.cash_in_hand || 0).toFixed(2)} ج.م`;
            document.getElementById('stat-commission').innerText = `${parseFloat(stats.total_commission || 0).toFixed(2)} ج.م`;
            document.getElementById('settle-current-balance').innerText = `${parseFloat(stats.cash_in_hand || 0).toFixed(2)} ج.م`;

            document.getElementById('badge-in_transit').innerText = `(${ordersData.in_transit.length})`;
            document.getElementById('badge-pending').innerText = `(${ordersData.pending.length})`;
            document.getElementById('badge-delivered').innerText = `(${ordersData.delivered.length})`;
        }

        function switchTab(tabName) {
            activeTab = tabName;
            document.querySelectorAll('.tab-pill').forEach(btn => {
                btn.classList.remove('bg-amber-500', 'text-slate-950', 'font-black', 'shadow');
                btn.classList.add('text-slate-400');
            });

            const activeBtn = document.getElementById(`tab-btn-${tabName}`);
            if (activeBtn) {
                activeBtn.classList.add('bg-amber-500', 'text-slate-950', 'font-black', 'shadow');
                activeBtn.classList.remove('text-slate-400');
            }

            renderOrdersList();
        }

        function renderOrdersList() {
            const container = document.getElementById('orders-container');
            const emptyView = document.getElementById('empty-orders-view');
            container.innerHTML = '';

            const list = ordersData[activeTab] || [];

            if (list.length === 0) {
                emptyView.classList.remove('hidden');
                return;
            }
            emptyView.classList.add('hidden');

            list.forEach(ord => {
                const card = createOrderCard(ord);
                container.appendChild(card);
            });
        }

        function createOrderCard(ord) {
            const card = document.createElement('div');
            card.className = "bg-slate-900 border border-slate-800 rounded-3xl p-4 shadow-xl space-y-3 transition-all";

            const isCash = ord.is_cash;
            const totalFormatted = parseFloat(ord.total_price).toFixed(2);
            const deliveryFee = parseFloat(ord.shipping_cost || 0).toFixed(2);
            const addressEncoded = encodeURIComponent((ord.customer_address || '') + ' ' + (ord.governorate || ''));
            const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${addressEncoded}`;
            const cleanPhone = (ord.customer_phone || '').replace(/[^0-9]/g, '');

            // تجهيز قائمة الأصناف
            let itemsHtml = '';
            try {
                const details = ord.order_details;
                if (details) {
                    itemsHtml = `<p class="text-[11px] text-slate-300 bg-slate-950/80 p-2.5 rounded-xl border border-slate-800 font-mono leading-relaxed line-clamp-3">${details}</p>`;
                }
            } catch(e) {}

            card.innerHTML = `
                <!-- ترويسة الكارت: رقم الأوردر والوقت -->
                <div class="flex items-center justify-between pb-2.5 border-b border-slate-800">
                    <div class="flex items-center gap-2">
                        <span class="px-2.5 py-1 rounded-xl bg-amber-500/20 text-amber-400 font-black font-mono text-xs border border-amber-500/30">
                            #${ord.id}
                        </span>
                        <span class="text-xs font-bold text-white">${ord.customer_name || 'عميل دليفري'}</span>
                    </div>
                    <span class="text-[10px] text-slate-400 font-mono">${ord.created_at || ''}</span>
                </div>

                <!-- شريط التنبيه المالي الفاقع: كاش أم فيزا -->
                <div class="p-3 rounded-2xl ${isCash ? 'bg-emerald-950/60 border border-emerald-500/40 text-emerald-300' : 'bg-blue-950/60 border border-blue-500/40 text-blue-300'} flex items-center justify-between">
                    <div class="flex items-center gap-2">
                        <span class="w-8 h-8 rounded-xl ${isCash ? 'bg-emerald-500/20 text-emerald-400' : 'bg-blue-500/20 text-blue-400'} flex items-center justify-center text-sm font-black">
                            <i class="fa-solid ${isCash ? 'fa-money-bill-wave' : 'fa-credit-card'}"></i>
                        </span>
                        <div>
                            <span class="font-black text-xs block">${isCash ? '💵 دفع نقدي (كاش)' : '💳 مدفوع مقدماً (إلكتروني)'}</span>
                            <span class="text-[10px] opacity-80">${isCash ? 'يجب استلام المبلغ كاملاً من العميل' : 'لا تطلب أي مبالغ، الطلب مدفوع'}</span>
                        </div>
                    </div>
                    <div class="text-left">
                        <span class="text-base font-black ${isCash ? 'text-emerald-400' : 'text-blue-400'} font-mono">${totalFormatted} ج.م</span>
                        <span class="text-[9px] text-slate-400 block">(شامل التوصيل ${deliveryFee} ج.م)</span>
                    </div>
                </div>

                <!-- العنوان وموقع الخريطة والاتصال السريع -->
                <div class="space-y-2 text-xs">
                    <div class="flex items-start gap-2 text-slate-300">
                        <i class="fa-solid fa-location-dot text-rose-500 text-sm mt-0.5"></i>
                        <span class="font-semibold leading-relaxed flex-1">${ord.customer_address || 'العنوان غير محدد بدقة'}</span>
                    </div>

                    <!-- أزرار الخرائط والاتصال المباشر -->
                    <div class="grid grid-cols-3 gap-2 pt-1">
                        <!-- زر فتح خرائط جوجل للملاحة -->
                        <a href="${mapsUrl}" target="_blank" class="py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl text-center flex items-center justify-center gap-1.5 shadow-md active:scale-95 transition-all">
                            <i class="fa-solid fa-map-location-dot text-sm"></i>
                            <span>الخريطة 🗺️</span>
                        </a>

                        <!-- زر الاتصال الهاتفي -->
                        <a href="tel:${cleanPhone}" class="py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-center flex items-center justify-center gap-1.5 shadow-md active:scale-95 transition-all">
                            <i class="fa-solid fa-phone text-xs"></i>
                            <span>اتصال 📞</span>
                        </a>

                        <!-- زر الواتساب -->
                        <a href="https://wa.me/2${cleanPhone}" target="_blank" class="py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-center flex items-center justify-center gap-1.5 shadow-md active:scale-95 transition-all">
                            <i class="fa-brands fa-whatsapp text-sm"></i>
                            <span>واتساب 💬</span>
                        </a>
                    </div>
                </div>

                <!-- تفاصيل محتويات الشنطة -->
                ${itemsHtml}

                <!-- أزرار الإجراءات وتحديث الحالة -->
                <div class="pt-2 border-t border-slate-800">
                    ${renderActionButtons(ord)}
                </div>
            `;

            return card;
        }

        function renderActionButtons(ord) {
            const status = ord.status || 'جديد';
            const isCash = ord.is_cash;
            const total = parseFloat(ord.total_price).toFixed(2);

            if (status === 'بانتظار الطيار' || status === 'جديد' || status === 'مؤقتة') {
                return `
                    <button onclick="updateOrderStatus(${ord.id}, 'جاري التوصيل')" class="w-full py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg active:scale-98 transition-all">
                        <i class="fa-solid fa-motorcycle text-base"></i>
                        <span>استلام الأوردر وبدء الرحلة 🛵</span>
                    </button>
                `;
            } else if (status === 'جاري التوصيل' || status === 'في الطريق') {
                return `
                    <div class="grid grid-cols-12 gap-2">
                        <button onclick="confirmDeliveredOrder(${ord.id}, ${ord.total_price}, ${isCash})" class="col-span-8 py-3 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-black rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg active:scale-98 transition-all">
                            <i class="fa-solid fa-check-circle text-base"></i>
                            <span>تم التسليم ${isCash ? 'وتحصيل (' + total + ' ج.م)' : 'بنجاح ✓'}</span>
                        </button>
                        <button onclick="updateOrderStatus(${ord.id}, 'راجع')" class="col-span-4 py-3 bg-slate-800 hover:bg-rose-900/50 text-rose-400 hover:text-rose-300 font-bold rounded-xl text-xs flex items-center justify-center gap-1 border border-rose-500/30 transition-all">
                            <i class="fa-solid fa-rotate-left"></i>
                            <span>تعذر / راجع</span>
                        </button>
                    </div>
                `;
            } else {
                return `
                    <div class="text-center py-1.5 text-xs text-emerald-400 font-bold flex items-center justify-center gap-1.5">
                        <i class="fa-solid fa-circle-check"></i>
                        <span>تم تسليم الأوردر وتوثيق الحسابات</span>
                    </div>
                `;
            }
        }

        async function updateOrderStatus(orderId, newStatus) {
            if (!currentDriver) return;
            if (!confirm(`هل أنت متأكد من تغيير حالة الأوردر #${orderId} إلى (${newStatus})؟`)) return;

            try {
                const res = await fetch('api_sync.php?action=update_delivery_status&api_key=syrian_home_pos_secret_token_2026', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ order_id: orderId, status: newStatus, driver_name: currentDriver.name })
                });
                const data = await res.json();

                if (data.success) {
                    playBeep();
                    refreshDriverOrders(true);
                } else {
                    alert("خطأ: " + data.error);
                }
            } catch (e) {
                alert("حدث خطأ في تحديث الحالة!");
            }
        }

        function confirmDeliveredOrder(orderId, totalAmount, isCash) {
            const confirmMsg = isCash 
                ? `تأكيد تسليم الأوردر #${orderId}:\nهل استلمت مبلغ (${parseFloat(totalAmount).toFixed(2)} ج.م) كاش من العميل؟`
                : `تأكيد تسليم الأوردر #${orderId}:\nتم التأكد من تسليم الطلب للعميل؟`;

            if (confirm(confirmMsg)) {
                updateOrderStatus(orderId, 'تم التسليم');
            }
        }

        // تصفية العهدة وتسليمها للكاشير
        function openSettleModal() {
            const balance = ordersData.stats?.cash_in_hand || 0;
            document.getElementById('settle-amount').value = Math.round(balance);
            document.getElementById('settle-modal').classList.remove('hidden');
            document.getElementById('settle-modal').classList.add('flex');
        }

        function closeModal(id) {
            document.getElementById(id).classList.add('hidden');
            document.getElementById(id).classList.remove('flex');
        }

        async function handleSettleSubmit(e) {
            e.preventDefault();
            const btn = document.getElementById('settle-submit-btn');
            btn.disabled = true;

            const amount = parseFloat(document.getElementById('settle-amount').value);
            const note = document.getElementById('settle-note').value.trim();

            try {
                const res = await fetch('api_sync.php?action=settle_driver_cash&api_key=syrian_home_pos_secret_token_2026', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ driver_name: currentDriver.name, amount: amount, note: note })
                });
                const data = await res.json();

                if (data.success) {
                    alert(data.message);
                    closeModal('settle-modal');
                    refreshDriverOrders(true);
                } else {
                    alert("خطأ: " + data.error);
                }
            } catch (err) {
                alert("تعذر تسجيل تسليم العهدة!");
            } finally {
                btn.disabled = false;
            }
        }

        function playBeep() {
            try {
                const audio = document.getElementById('beep-sound');
                if (audio) { audio.currentTime = 0; audio.play().catch(()=>{}); }
            } catch (e) {}
        }

        // ============================================================
        // PWA Installation & Service Worker Handling
        // ============================================================
        let deferredPrompt = null;
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

        if (isStandalone) {
            const loginBanner = document.getElementById('login-install-banner');
            if (loginBanner) loginBanner.style.display = 'none';
            const headerBtn = document.getElementById('header-install-btn');
            if (headerBtn) headerBtn.style.display = 'none';
        }

        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredPrompt = e;
            console.log('beforeinstallprompt captured');
        });

        window.addEventListener('appinstalled', () => {
            deferredPrompt = null;
            const loginBanner = document.getElementById('login-install-banner');
            if (loginBanner) loginBanner.style.display = 'none';
            const headerBtn = document.getElementById('header-install-btn');
            if (headerBtn) headerBtn.style.display = 'none';
            alert('🎉 تم تثبيت تطبيق الدليفري بنجاح على هاتفك!');
        });

        function triggerPwaInstall() {
            if (deferredPrompt) {
                deferredPrompt.prompt();
                deferredPrompt.userChoice.then((choiceResult) => {
                    if (choiceResult.outcome === 'accepted') {
                        console.log('Driver installed the app');
                    }
                    deferredPrompt = null;
                });
            } else {
                const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
                const instrEl = document.getElementById('pwa-install-instructions');
                if (isIOS) {
                    instrEl.innerHTML = `
                        <div class="space-y-3">
                            <p class="font-bold text-amber-400 text-sm">خطوات تثبيت التطبيق على أجهزة iPhone / iPad:</p>
                            <p class="flex items-center gap-2"><span>1.</span> اضغط على زر المشاركة <span class="inline-flex items-center gap-1 bg-slate-800 text-sky-400 px-2 py-1 rounded font-mono font-bold"><i class="fa-solid fa-arrow-up-from-bracket"></i> Share</span> أسفل شاشة Safari.</p>
                            <p class="flex items-center gap-2"><span>2.</span> اسحب لأسفل واضغط على <span class="inline-flex items-center gap-1 bg-slate-800 text-amber-400 px-2 py-1 rounded font-bold"><i class="fa-solid fa-square-plus"></i> إضافة إلى الشاشة الرئيسية (Add to Home Screen)</span>.</p>
                            <p class="flex items-center gap-2"><span>3.</span> اضغط على <span class="text-emerald-400 font-bold">إضافة (Add)</span> في أعلى زاوية الشاشة.</p>
                            <p class="text-emerald-400 font-bold mt-2">✓ سيظهر تطبيق الدليفري فوراً على شاشتك الرئيسية ويعمل بكامل الشاشة كبرنامج مستقل!</p>
                        </div>
                    `;
                } else {
                    instrEl.innerHTML = `
                        <div class="space-y-3">
                            <p class="font-bold text-amber-400 text-sm">خطوات تثبيت التطبيق على هواتف أندرويد (Chrome):</p>
                            <p class="flex items-center gap-2"><span>1.</span> اضغط على زر القائمة <span class="inline-flex items-center gap-1 bg-slate-800 text-sky-400 px-2 py-1 rounded font-mono font-bold"><i class="fa-solid fa-ellipsis-vertical"></i> الثلاث نقاط</span> في أعلى الشاشة.</p>
                            <p class="flex items-center gap-2"><span>2.</span> اختر من القائمة <span class="inline-flex items-center gap-1 bg-slate-800 text-amber-400 px-2 py-1 rounded font-bold"><i class="fa-solid fa-download"></i> تثبيت التطبيق (Install App)</span> أو <span class="text-amber-400 font-bold">الإضافة إلى الشاشة الرئيسية</span>.</p>
                            <p class="flex items-center gap-2"><span>3.</span> اضغط على تأكيد <span class="text-emerald-400 font-bold">تثبيت (Install)</span>.</p>
                            <p class="text-emerald-400 font-bold mt-2">✓ سيتم تنزيل أيقونة التطبيق على شاشتك وتفتح فوراً بدون الحاجة لفتح المتصفح!</p>
                        </div>
                    `;
                }
                document.getElementById('pwa-install-modal').classList.remove('hidden');
                document.getElementById('pwa-install-modal').classList.add('flex');
            }
        }

        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('delivery-sw.js').then((reg) => {
                    console.log('Delivery SW registered successfully:', reg.scope);
                }).catch((err) => {
                    console.warn('Delivery SW registration error:', err);
                });
            });
        }
    </script>

    <!-- Modal تعليمات تثبيت تطبيق الدليفري -->
    <div id="pwa-install-modal" class="fixed inset-0 z-50 bg-black/80 hidden items-center justify-center p-4">
        <div class="max-w-sm w-full bg-slate-900 border border-amber-500/40 rounded-3xl p-6 shadow-2xl text-center space-y-4">
            <div class="w-16 h-16 mx-auto rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center text-3xl border border-amber-500/30">
                <i class="fa-solid fa-mobile-screen-button"></i>
            </div>
            <h3 class="text-lg font-black text-white">تثبيت تطبيق الدليفري على الهاتف</h3>
            <div id="pwa-install-instructions" class="text-right text-xs text-slate-300 space-y-3 bg-slate-950/70 p-4 rounded-xl border border-slate-800">
                <!-- محتوى التعليمات الذكي -->
            </div>
            <button onclick="closeModal('pwa-install-modal')" class="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-xl transition">
                إغلاق
            </button>
        </div>
    </div>
</body>
</html>
