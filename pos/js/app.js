const DEFAULT_PRODUCTS = [
  {
    id: 10725,
    name: 'نوكا بالفستق',
    category: 'حلويات ومكسرات',
    unit_type: 'weight',
    unit: 'كجم',
    price: 1400.00,
    cost: 1100.00,
    stock: 25.500,
    barcode: '10725',
    local_code: '10725',
    all_barcodes: '10725, 2010725'
  },
  {
    id: 101,
    name: 'جبنة سورية مشللة',
    category: 'أجبان وألبان',
    unit_type: 'weight',
    unit: 'كجم',
    price: 380.00,
    cost: 300.00,
    stock: 18.000,
    barcode: '10101',
    local_code: '10101'
  },
  {
    id: 102,
    name: 'زعتر حلبي ممتاز',
    category: 'عطارة وتوابل',
    unit_type: 'weight',
    unit: 'كجم',
    price: 220.00,
    cost: 160.00,
    stock: 30.000,
    barcode: '10202',
    local_code: '10202'
  },
  {
    id: 103,
    name: 'زيت زيتون سوري بكر 1 لتر',
    category: 'بقالة وزيوت',
    unit_type: 'piece',
    unit: 'قطعة',
    price: 290.00,
    cost: 230.00,
    stock: 45,
    barcode: '6221000100010',
    local_code: 'ITEM-101'
  },
  {
    id: 104,
    name: 'دبس رمان طبيعي 500 مل',
    category: 'صلصات ومخللات',
    unit_type: 'piece',
    unit: 'قطعة',
    price: 110.00,
    cost: 85.00,
    stock: 32,
    barcode: '6222000200020',
    local_code: 'ITEM-102'
  }
];

class App {
  constructor() {
    let saved = [];
    try {
      saved = JSON.parse(localStorage.getItem('syrian_home_products') || '[]');
    } catch (e) {
      saved = [];
    }

    this.products = (Array.isArray(saved) && saved.length > 0) ? saved : DEFAULT_PRODUCTS;
    this.categories = [];
    this.activeCategory = 'all';
    this.currentView = 'pos'; // 'pos', 'orders', 'returns', 'reports', 'settings'
    this.theme = localStorage.getItem('pos_theme') || 'light';
  }

  async init() {
    this.applyTheme(this.theme);
    this.bindEvents();

    // Render initial products
    if (this.products.length > 0) {
      this.extractCategories();
      this.renderCategories();
      this.renderProducts();
    }

    // Fetch fresh products from API
    await this.fetchProducts();

    // Health check ping
    this.checkServerHealth();

    // Init Expenses & Suppliers
    window.expensesController?.init();

    // Init Store Brand Name from Settings
    if (window.settingsController) {
      const store = window.settingsController.getStoreInfo();
      const brand = document.getElementById('brand-store-name');
      if (brand && store && store.store_name) {
        brand.textContent = store.store_name;
      }
    }

    // Render Lucide icons
    if (window.lucide) window.lucide.createIcons();
  }

  applyTheme(theme) {
    this.theme = theme;
    localStorage.setItem('pos_theme', theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }

  toggleTheme() {
    this.applyTheme(this.theme === 'dark' ? 'light' : 'dark');
  }

  async checkServerHealth() {
    const badge = document.getElementById('server-status-badge');
    try {
      const ping = await window.api.ping();
      if (badge) {
        if (ping && ping.success) {
          badge.innerHTML = `<span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> متصل بالسيرفر`;
          badge.className = 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20';
        } else {
          badge.innerHTML = `<span class="w-2 h-2 rounded-full bg-rose-500"></span> غير متصل`;
          badge.className = 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20';
        }
      }
    } catch (e) {
      if (badge) {
        badge.innerHTML = `<span class="w-2 h-2 rounded-full bg-amber-500"></span> وضع عدم الاتصال`;
        badge.className = 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20';
      }
    }
  }

  async fetchProducts() {
    try {
      this.showLoading(true, 'جاري مزامنة المنتجات والأسعار...');
      const res = await window.api.getProducts();
      this.showLoading(false);

      if (res && res.success && Array.isArray(res.products)) {
        this.products = res.products;
        localStorage.setItem('syrian_home_products', JSON.stringify(this.products));
        this.extractCategories();
        this.renderCategories();
        this.renderProducts();
        this.showToast(`تم تحميل ${this.products.length} صنف بنجاح`, 'success');
      }
    } catch (err) {
      this.showLoading(false);
      console.warn('Using cached products due to network issue:', err);
    }
  }

  async refreshProductsQuietly() {
    try {
      const res = await window.api.getProducts();
      if (res && res.success && Array.isArray(res.products)) {
        this.products = res.products;
        localStorage.setItem('syrian_home_products', JSON.stringify(this.products));
        this.renderProducts();
      }
    } catch (e) {}
  }

  extractCategories() {
    const set = new Set();
    this.products.forEach(p => {
      if (p.category && p.category.trim()) {
        set.add(p.category.trim());
      }
    });
    this.categories = Array.from(set);
  }

  renderCategories() {
    const container = document.getElementById('categories-bar');
    if (!container) return;

    let html = `
      <button onclick="window.app.filterByCategory('all')" class="category-btn px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${this.activeCategory === 'all' ? 'bg-indigo-600 text-white shadow-md' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200'}">
        جميع الأصناف (${this.products.length})
      </button>
    `;

    this.categories.forEach(cat => {
      const count = this.products.filter(p => p.category === cat).length;
      const isSelected = this.activeCategory === cat;
      html += `
        <button onclick="window.app.filterByCategory('${cat}')" class="category-btn px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${isSelected ? 'bg-indigo-600 text-white shadow-md' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200'}">
          ${cat} (${count})
        </button>
      `;
    });

    container.innerHTML = html;
  }

  filterByCategory(cat) {
    this.activeCategory = cat;
    this.renderCategories();
    this.renderProducts();
  }

  renderProducts(searchQuery = '') {
    const grid = document.getElementById('products-grid');
    if (!grid) return;

    let filtered = [...this.products];

    // Filter by Category
    if (this.activeCategory !== 'all') {
      filtered = filtered.filter(p => p.category === this.activeCategory);
    }

    // Filter by Search Query (Name, Barcode, Local Code, or Parsed Scale Code)
    const rawQ = (searchQuery || document.getElementById('product-search-input')?.value || '').trim();
    if (rawQ) {
      const q = rawQ.toLowerCase();
      const parsed = window.BarcodeParser ? window.BarcodeParser.parse(rawQ) : null;

      if (parsed && parsed.isScale) {
        filtered = filtered.filter(p => 
          window.BarcodeParser.matchesProduct(parsed, p) ||
          (p.name && p.name.toLowerCase().includes(q))
        );
      } else {
        filtered = filtered.filter(p => 
          (p.name && p.name.toLowerCase().includes(q)) ||
          (p.barcode && p.barcode.toLowerCase().includes(q)) ||
          (p.local_code && p.local_code.toLowerCase().includes(q)) ||
          (String(p.id) === q)
        );
      }
    }

    if (filtered.length === 0) {
      grid.innerHTML = `
        <div class="col-span-full py-16 text-center text-gray-400">
          <i data-lucide="package-search" class="w-12 h-12 mx-auto mb-2 opacity-40"></i>
          <p class="text-xs font-semibold">لم يتم العثور على أي صنف مطابق للبحث</p>
        </div>
      `;
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    grid.innerHTML = filtered.map(p => {
      const price = parseFloat(p.price || 0);
      const stock = parseFloat(p.stock || 0);
      const isWeight = p.unit_type === 'weight' || p.unit === 'كجم' || p.is_weight;
      const isLowStock = stock <= (isWeight ? 2 : 3);

      return `
        <div onclick="window.app.onProductCardClick(${p.id})" class="p-2 sm:p-2.5 bg-white dark:bg-gray-800 rounded-xl sm:rounded-2xl border border-gray-200/80 dark:border-gray-700/80 shadow-2xs hover:shadow-sm hover:border-indigo-400 dark:hover:border-indigo-500 transition-all cursor-pointer flex flex-col justify-between gap-1 transform active:scale-95 select-none">
          <div>
            <div class="flex items-center justify-between gap-1 mb-0.5">
              ${isWeight ? `<span class="px-1 py-0.2 rounded bg-amber-50 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 text-[8px] font-bold">⚖️ وزن</span>` : (p.local_code ? `<span class="px-1 py-0.2 rounded bg-gray-100 dark:bg-gray-700 font-mono text-[8px] font-bold text-gray-500 dark:text-gray-400">${p.local_code}</span>` : '<span></span>')}
              <span class="text-[8px] font-bold px-1 py-0.2 rounded ${isLowStock ? 'bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400' : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400'}">
                ${stock} ${isWeight ? 'كجم' : 'ق'}
              </span>
            </div>
            <h4 class="text-[11px] sm:text-xs font-bold text-gray-900 dark:text-white leading-tight line-clamp-1">${p.name}</h4>
          </div>

          <div class="flex items-center justify-between pt-1 border-t border-gray-100 dark:border-gray-700/60">
            <span class="text-xs sm:text-sm font-black text-indigo-600 dark:text-indigo-400 font-mono">${price.toFixed(2)} <span class="text-[8px] font-normal font-sans text-gray-400">${isWeight ? 'ج.م/كجم' : 'ج.م'}</span></span>
            <div class="w-5 h-5 rounded-md bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-xs shadow-xs">
              +
            </div>
          </div>
        </div>
      `;
    }).join('');

    if (window.lucide) window.lucide.createIcons();
  }

  onProductCardClick(productId) {
    const product = this.products.find(p => p.id === productId);
    if (product) {
      const isWeight = product.unit_type === 'weight' || product.unit === 'كجم' || product.is_weight;
      if (isWeight) {
        this.openWeightModal(product, 1.000);
      } else {
        window.posScanner?.playSuccessBeep();
        window.cart?.addItem(product, 1);
      }
    }
  }

  /* ==================== SCALE / WEIGHT MODAL ==================== */
  openWeightModal(product, currentQty = 1.000) {
    this.currentWeightProduct = product;
    const modal = document.getElementById('scale-weight-modal');
    if (!modal) return;

    document.getElementById('weight-modal-prod-name').textContent = product.name;
    document.getElementById('weight-modal-price-label').textContent = `السعر: ${parseFloat(product.price || 0).toFixed(2)} ج.م / كجم`;
    
    const input = document.getElementById('scale-weight-input');
    if (input) {
      input.value = currentQty.toFixed(3);
    }
    this.onWeightInputChanged();

    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    if (window.lucide) window.lucide.createIcons();

    setTimeout(() => {
      input?.focus();
      input?.select();
    }, 100);
  }

  closeWeightModal() {
    const modal = document.getElementById('scale-weight-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.style.display = 'none';
    }
    this.currentWeightProduct = null;
  }

  onWeightInputChanged() {
    if (!this.currentWeightProduct) return;
    const input = document.getElementById('scale-weight-input');
    const calcEl = document.getElementById('weight-modal-calc-total');
    const weight = parseFloat(input?.value || 0);
    const price = parseFloat(this.currentWeightProduct.price || 0);
    const total = weight * price;
    if (calcEl) calcEl.textContent = `${total.toFixed(2)} ج.م`;
  }

  setWeightPreset(weight) {
    const input = document.getElementById('scale-weight-input');
    if (input) {
      input.value = parseFloat(weight).toFixed(3);
      this.onWeightInputChanged();
    }
  }

  confirmWeightAndAddToCart() {
    if (!this.currentWeightProduct) return;
    const input = document.getElementById('scale-weight-input');
    const weight = parseFloat(input?.value || 0);

    if (weight <= 0) {
      this.showToast('يرجى إدخال وزن صحيح أكبر من 0', 'error');
      return;
    }

    window.posScanner?.playSuccessBeep();
    window.cart?.addItem(this.currentWeightProduct, weight);
    this.closeWeightModal();
  }

  openWeightModalForItem(productId) {
    const item = window.cart?.items?.find(i => i.product_id === productId);
    if (!item) return;
    const prod = this.products.find(p => p.id === productId) || item;
    this.openWeightModal(prod, item.qty);
  }

  switchView(viewName) {
    this.currentView = viewName;

    // Update nav buttons
    document.querySelectorAll('.app-view-btn').forEach(btn => {
      const isTarget = btn.getAttribute('data-view') === viewName;
      if (isTarget) {
        btn.classList.add('bg-indigo-600', 'text-white', 'shadow-md');
        btn.classList.remove('text-gray-600', 'dark:text-gray-300');
      } else {
        btn.classList.remove('bg-indigo-600', 'text-white', 'shadow-md');
        btn.classList.add('text-gray-600', 'dark:text-gray-300');
      }
    });

    // Update Mobile Bottom Nav Tabs
    document.querySelectorAll('.mobile-tab-btn').forEach(btn => {
      const isTarget = btn.getAttribute('data-view') === viewName;
      if (isTarget) {
        btn.classList.add('text-indigo-600', 'dark:text-indigo-400', 'font-bold');
        btn.classList.remove('text-gray-400', 'dark:text-gray-500');
        const indicator = btn.querySelector('.tab-indicator');
        if (indicator) indicator.classList.remove('opacity-0');
      } else {
        btn.classList.remove('text-indigo-600', 'dark:text-indigo-400', 'font-bold');
        btn.classList.add('text-gray-400', 'dark:text-gray-500');
        const indicator = btn.querySelector('.tab-indicator');
        if (indicator) indicator.classList.add('opacity-0');
      }
    });

    // Update View Containers
    ['pos', 'orders', 'returns', 'inventory', 'expenses', 'reports', 'settings'].forEach(v => {
      const el = document.getElementById(`view-${v}`);
      if (el) {
        if (v === viewName) {
          el.classList.remove('hidden');
        } else {
          el.classList.add('hidden');
        }
      }
    });

    if (viewName === 'orders') {
      window.ordersController?.loadOrders('pending');
    } else if (viewName === 'reports') {
      window.reportsController?.loadReports('today');
    } else if (viewName === 'expenses') {
      window.expensesController?.init();
    } else if (viewName === 'settings') {
      window.settingsController?.initForm();
    }

    // Auto close mobile drawer menu if open
    this.closeDrawerMenu();

    if (window.lucide) window.lucide.createIcons();
  }

  toggleMobileCart() {
    const drawer = document.getElementById('mobile-cart-drawer');
    if (!drawer) return;
    if (drawer.classList.contains('hidden') || drawer.style.display === 'none') {
      drawer.classList.remove('hidden');
      drawer.style.display = 'flex';
    } else {
      drawer.classList.add('hidden');
      drawer.style.display = 'none';
    }
    if (window.lucide) window.lucide.createIcons();
  }

  toggleDrawerMenu() {
    const drawer = document.getElementById('mobile-nav-drawer');
    if (!drawer) return;
    if (drawer.classList.contains('hidden') || drawer.style.display === 'none') {
      drawer.classList.remove('hidden');
      drawer.style.display = 'flex';
    } else {
      drawer.classList.add('hidden');
      drawer.style.display = 'none';
    }
    if (window.lucide) window.lucide.createIcons();
  }

  closeDrawerMenu() {
    const drawer = document.getElementById('mobile-nav-drawer');
    if (!drawer) return;
    drawer.classList.add('hidden');
    drawer.style.display = 'none';
  }

  /* ==================== CHECKOUT MODAL LOGIC ==================== */
  openCheckoutModal() {
    if (window.cart.items.length === 0) {
      this.showToast('سلة المشتريات فارغة!', 'error');
      return;
    }

    const modal = document.getElementById('checkout-modal');
    const total = window.cart.getTotal();

    document.getElementById('checkout-modal-total').textContent = `${total.toFixed(2)} ج.م`;
    document.getElementById('checkout-cash-input').value = total.toFixed(2);
    window.cart.paidAmount = total;
    this.updateChangeCalculation();

    // Default to cash
    this.selectPaymentMethod('cash');

    modal?.classList.remove('hidden');
  }

  closeCheckoutModal() {
    document.getElementById('checkout-modal')?.classList.add('hidden');
  }

  selectPaymentMethod(method) {
    window.cart.paymentMethod = method;

    const cashFields = document.getElementById('checkout-cash-fields');
    const instapayFields = document.getElementById('checkout-instapay-fields');
    const vodafoneFields = document.getElementById('checkout-vodafone-fields');

    document.querySelectorAll('.pay-method-btn').forEach(btn => {
      if (btn.getAttribute('data-method') === method) {
        btn.className = 'pay-method-btn flex-1 py-3 px-1.5 rounded-xl text-xs font-bold bg-indigo-600 text-white shadow-md flex items-center justify-center gap-1';
      } else {
        btn.className = 'pay-method-btn flex-1 py-3 px-1.5 rounded-xl text-xs font-bold bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 flex items-center justify-center gap-1';
      }
    });

    if (method === 'cash') {
      cashFields?.classList.remove('hidden');
      instapayFields?.classList.add('hidden');
      vodafoneFields?.classList.add('hidden');
    } else if (method === 'instapay') {
      cashFields?.classList.add('hidden');
      instapayFields?.classList.remove('hidden');
      vodafoneFields?.classList.add('hidden');
    } else if (method === 'vodafone_cash') {
      cashFields?.classList.add('hidden');
      instapayFields?.classList.add('hidden');
      vodafoneFields?.classList.remove('hidden');
    } else {
      cashFields?.classList.add('hidden');
      instapayFields?.classList.add('hidden');
      vodafoneFields?.classList.add('hidden');
    }
  }

  updateChangeCalculation() {
    const input = document.getElementById('checkout-cash-input');
    const changeDisplay = document.getElementById('checkout-change-display');
    const paid = parseFloat(input?.value || 0);
    window.cart.paidAmount = paid;

    const change = window.cart.getChange();
    if (changeDisplay) {
      changeDisplay.textContent = `${change.toFixed(2)} ج.م`;
    }
  }

  quickCashAdd(amount) {
    const input = document.getElementById('checkout-cash-input');
    if (input) {
      let current = parseFloat(input.value || 0);
      input.value = (current + amount).toFixed(2);
      this.updateChangeCalculation();
    }
  }

  setExactCash() {
    const input = document.getElementById('checkout-cash-input');
    if (input) {
      input.value = window.cart.getTotal().toFixed(2);
      this.updateChangeCalculation();
    }
  }

  /* ==================== MOBILE CART DRAWER ==================== */
  toggleMobileCart() {
    const drawer = document.getElementById('mobile-cart-drawer');
    if (!drawer) return;
    if (drawer.classList.contains('hidden') || drawer.style.display === 'none') {
      drawer.classList.remove('hidden');
      drawer.style.display = 'flex';
    } else {
      drawer.classList.add('hidden');
      drawer.style.display = 'none';
    }
    if (window.lucide) window.lucide.createIcons();
  }

  /* ==================== EVENT BINDINGS ==================== */
  bindEvents() {
    // Search input (Instant filter + Enter to add/scan)
    const searchInput = document.getElementById('product-search-input');
    searchInput?.addEventListener('input', (e) => {
      this.renderProducts(e.target.value);
    });

    searchInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const val = (e.target.value || '').trim();
        if (val) {
          e.preventDefault();
          window.cart?.addProductByBarcode(val);
          e.target.value = '';
          this.renderProducts('');
        }
      }
    });

    // Theme toggle
    document.getElementById('btn-theme-toggle')?.addEventListener('click', () => this.toggleTheme());

    // Hamburger Menu button
    document.getElementById('btn-hamburger-menu')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleDrawerMenu();
    });

    // Navigation buttons
    document.querySelectorAll('.app-view-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.switchView(btn.getAttribute('data-view'));
      });
    });

    // Scanner modal buttons
    document.getElementById('btn-open-scanner')?.addEventListener('click', () => {
      window.posScanner?.openCameraModal();
    });
    document.getElementById('btn-close-scanner')?.addEventListener('click', () => {
      window.posScanner?.closeCameraModal();
    });

    // Checkout Modal buttons
    document.getElementById('btn-proceed-checkout')?.addEventListener('click', () => this.openCheckoutModal());
    document.getElementById('btn-mobile-checkout')?.addEventListener('click', () => {
      this.toggleMobileCart();
      this.openCheckoutModal();
    });
    document.getElementById('btn-close-checkout')?.addEventListener('click', () => this.closeCheckoutModal());
    document.getElementById('btn-submit-payment')?.addEventListener('click', () => window.cart?.checkout());

    // Receipt Modal Close & Print
    document.getElementById('btn-close-receipt')?.addEventListener('click', () => {
      document.getElementById('receipt-modal')?.classList.add('hidden');
    });
    document.getElementById('btn-print-receipt')?.addEventListener('click', () => {
      window.print();
    });

    // Cash calculation listener
    document.getElementById('checkout-cash-input')?.addEventListener('input', () => this.updateChangeCalculation());

    // Return search
    document.getElementById('btn-search-return')?.addEventListener('click', () => {
      window.returnsController?.searchInvoice();
    });
    document.getElementById('return-search-input')?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') window.returnsController?.searchInvoice();
    });

    // Z-Report Print
    document.getElementById('btn-print-zreport')?.addEventListener('click', () => {
      window.reportsController?.printZReport();
    });
  }

  showToast(message, type = 'info') {
    const toast = document.createElement('div');
    const colors = {
      success: 'bg-emerald-600 text-white',
      error: 'bg-rose-600 text-white',
      info: 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900'
    };

    toast.className = `fixed bottom-20 sm:bottom-6 start-6 z-50 px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-2 text-xs sm:text-sm font-bold animate-drawer-slide-up ${colors[type] || colors.info}`;
    toast.innerHTML = `<span>${message}</span>`;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 2400);
  }

  showLoading(show, message = '') {
    const loader = document.getElementById('global-loader');
    const msgEl = document.getElementById('global-loader-msg');
    if (!loader) return;
    if (show) {
      if (msgEl) msgEl.textContent = message;
      loader.classList.remove('hidden');
    } else {
      loader.classList.add('hidden');
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
  window.app.init();
});
