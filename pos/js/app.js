/**
 * Syrian Home POS - Main Application Controller
 * Handles Products Catalog, Categories, Search, Offline Cache, Views, and Modals.
 */

class App {
  constructor() {
    this.products = JSON.parse(localStorage.getItem('syrian_home_products') || '[]');
    this.categories = [];
    this.activeCategory = 'all';
    this.currentView = 'pos'; // 'pos', 'orders', 'returns', 'reports', 'settings'
    this.theme = localStorage.getItem('pos_theme') || 'light';
  }

  async init() {
    this.applyTheme(this.theme);
    this.bindEvents();

    // Render initial cached products
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

    // Filter by Search Query (Name, Barcode, Local Code)
    const q = (searchQuery || document.getElementById('product-search-input')?.value || '').trim().toLowerCase();
    if (q) {
      filtered = filtered.filter(p => 
        (p.name && p.name.toLowerCase().includes(q)) ||
        (p.barcode && p.barcode.includes(q)) ||
        (p.local_code && p.local_code.toLowerCase().includes(q))
      );
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
      const stock = parseInt(p.stock || 0, 10);
      const isLowStock = stock <= 3;

      return `
        <div onclick="window.app.onProductCardClick(${p.id})" class="p-3.5 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200/80 dark:border-gray-700/80 shadow-sm hover:shadow-md hover:border-indigo-400 dark:hover:border-indigo-500 transition-all cursor-pointer flex flex-col justify-between gap-3 transform active:scale-98 select-none">
          <div>
            <div class="flex items-center justify-between gap-1 mb-1">
              ${p.local_code ? `<span class="px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-700 font-mono text-[10px] font-bold text-gray-600 dark:text-gray-300">${p.local_code}</span>` : '<span></span>'}
              <span class="text-[10px] font-bold px-2 py-0.5 rounded-md ${isLowStock ? 'bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400' : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400'}">
                مخزون: ${stock}
              </span>
            </div>
            <h4 class="text-xs sm:text-sm font-bold text-gray-900 dark:text-white leading-snug line-clamp-2">${p.name}</h4>
          </div>

          <div class="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-700/60">
            <span class="text-sm sm:text-base font-black text-indigo-600 dark:text-indigo-400">${price.toFixed(2)} <span class="text-[10px] font-normal">ج.م</span></span>
            <div class="w-7 h-7 rounded-xl bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-base shadow-xs">
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
      window.posScanner?.playSuccessBeep();
      window.cart?.addItem(product, 1);
    }
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
    }

    // Auto close mobile drawer menu if open
    this.closeDrawerMenu();

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
    drawer?.classList.toggle('hidden');
  }

  /* ==================== EVENT BINDINGS ==================== */
  bindEvents() {
    // Search input
    document.getElementById('product-search-input')?.addEventListener('input', (e) => {
      this.renderProducts(e.target.value);
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
