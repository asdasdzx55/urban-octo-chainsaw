/**
 * Syrian Home POS - Purchases & Supplier Invoices Controller (نظام فواتير المشتريات والتوريد)
 * Mirrors the POS Sales Screen layout & speed:
 * - Product catalog grid & live search/barcode scanning
 * - Split cart view for incoming purchase invoice
 * - Supplier dropdown with quick '+' modal for new suppliers
 * - Payment methods: نقدي, آجل, إنستاباي, فودافون كاش
 * - Direct cost & selling price inline adjustments
 * - Auto invoice numbering & instant stock updates
 * - Full Mobile optimization with tab switching & floating action bar
 */

class PurchasesController {
  constructor() {
    this.suppliers = [];
    this.selectedSupplierId = null;
    this.paymentMethod = 'نقدي'; // 'نقدي', 'آجل', 'انستا باي', 'فودافون كاش'
    this.paidAmount = 0;
    this.items = []; // Array of items in current purchase invoice
    this.activeCategory = 'all';
    this.searchQuery = '';
    this.categories = [];
    this.invoiceNumber = '';
    this.invoiceDate = '';
    this.history = [];
    this.isInitialized = false;
    this.mobileTab = 'catalog'; // 'catalog' or 'cart'
    this.isScanningForNewProductModal = false;
  }

  async init() {
    this.generateInvoiceNumber();
    await this.loadSuppliers();
    this.renderSuppliersDropdown();
    this.extractCategories();
    this.renderCategories();
    this.renderCatalogGrid();
    this.renderCart();
    this.setMobileTab(this.mobileTab || 'catalog');
    this.isInitialized = true;
  }

  generateInvoiceNumber() {
    const rand = Math.floor(1000 + Math.random() * 9000);
    const dateStr = new Date().toISOString().slice(2, 10).replace(/-/g, '');
    this.invoiceNumber = 'PUR-' + dateStr + '-' + rand;
    this.invoiceDate = new Date().toISOString().slice(0, 19).replace('T', ' ');
    
    const badge = document.getElementById('purch-auto-invoice-badge');
    if (badge) {
      badge.textContent = this.invoiceNumber + ' • ' + new Date().toLocaleDateString('ar-EG');
    }
  }

  /* ==================== MOBILE RESPONSIVE TABS ==================== */
  setMobileTab(tab) {
    this.mobileTab = tab;
    const cartCol = document.getElementById('purch-cart-column');
    const catalogCol = document.getElementById('purch-catalog-column');
    const tabCatBtn = document.getElementById('purch-mobile-tab-catalog');
    const tabCartBtn = document.getElementById('purch-mobile-tab-cart');
    const floatingBar = document.getElementById('purch-mobile-bottom-bar');

    if (tab === 'cart') {
      cartCol?.classList.remove('hidden');
      catalogCol?.classList.add('hidden');
      floatingBar?.classList.add('hidden');

      if (tabCartBtn) {
        tabCartBtn.className = 'flex-1 py-2 px-3 rounded-xl text-xs font-bold bg-indigo-600 text-white shadow-xs flex items-center justify-center gap-1.5 transition';
      }
      if (tabCatBtn) {
        tabCatBtn.className = 'flex-1 py-2 px-3 rounded-xl text-xs font-bold text-gray-600 dark:text-gray-300 flex items-center justify-center gap-1.5 transition';
      }
    } else {
      cartCol?.classList.add('hidden');
      catalogCol?.classList.remove('hidden');
      if (this.items.length > 0) {
        floatingBar?.classList.remove('hidden');
      } else {
        floatingBar?.classList.add('hidden');
      }

      if (tabCatBtn) {
        tabCatBtn.className = 'flex-1 py-2 px-3 rounded-xl text-xs font-bold bg-indigo-600 text-white shadow-xs flex items-center justify-center gap-1.5 transition';
      }
      if (tabCartBtn) {
        tabCartBtn.className = 'flex-1 py-2 px-3 rounded-xl text-xs font-bold text-gray-600 dark:text-gray-300 flex items-center justify-center gap-1.5 transition';
      }
    }

    if (window.lucide) window.lucide.createIcons();
  }

  /* ==================== CAMERA SCANNER INTEGRATION ==================== */
  openCameraScanner() {
    this.isScanningForNewProductModal = false;
    window.posScanner?.openCameraModal();
  }

  scanBarcodeForNewProduct() {
    this.isScanningForNewProductModal = true;
    window.posScanner?.openCameraModal();
  }

  handleCameraBarcodeScanned(barcode) {
    if (this.isScanningForNewProductModal) {
      this.isScanningForNewProductModal = false;
      const inp = document.getElementById('new-purch-item-barcode');
      if (inp) inp.value = barcode;
      window.posScanner?.closeCameraModal();
      window.posScanner?.playSuccessBeep();
      window.app?.showToast('تم مسح الباركود بالكاميرا: ' + barcode, 'success');
      return;
    }

    this.addProductByBarcode(barcode);
  }

  /* ==================== SUPPLIERS MANAGEMENT ==================== */
  async loadSuppliers() {
    try {
      const res = await window.api.getSuppliers();
      if (res && res.success && Array.isArray(res.suppliers)) {
        this.suppliers = res.suppliers;
      } else {
        const meta = await window.api.getPosMeta();
        if (meta && meta.success && Array.isArray(meta.suppliers)) {
          this.suppliers = meta.suppliers;
        }
      }
    } catch (e) {
      console.warn('Error loading suppliers in purchases:', e);
    }
  }

  renderSuppliersDropdown() {
    const select = document.getElementById('purch-supplier-select');
    if (!select) return;

    let html = '<option value="">-- اختر المورد من القائمة أو أضف جديداً (+) --</option>';
    if (this.suppliers.length > 0) {
      this.suppliers.forEach(s => {
        const bal = parseFloat(s.balance || 0);
        const isSelected = this.selectedSupplierId == s.id ? 'selected' : '';
        html += '<option value="' + s.id + '" ' + isSelected + ' data-name="' + s.name + '" data-phone="' + (s.phone || '') + '" data-balance="' + bal + '">' + 
          s.name + (bal !== 0 ? ' (رصيد حسابه: ' + bal.toFixed(2) + ' ج.م)' : '') + 
        '</option>';
      });
    }
    select.innerHTML = html;
    this.updateSupplierBalanceBadge();
  }

  onSupplierSelected(val) {
    this.selectedSupplierId = val ? parseInt(val, 10) : null;
    this.updateSupplierBalanceBadge();
  }

  updateSupplierBalanceBadge() {
    const select = document.getElementById('purch-supplier-select');
    const badge = document.getElementById('purch-supplier-bal-badge');
    if (!badge || !select) return;

    if (!select.value) {
      badge.classList.add('hidden');
      return;
    }

    const opt = select.options[select.selectedIndex];
    const bal = parseFloat(opt?.getAttribute('data-balance') || 0);
    const phone = opt?.getAttribute('data-phone') || '';

    badge.textContent = 'رصيد حساب المورد: ' + bal.toFixed(2) + ' ج.م' + (phone ? ' • هاتف: ' + phone : '');
    badge.classList.remove('hidden');
  }

  /* ==================== NEW SUPPLIER MODAL ==================== */
  openNewSupplierModal() {
    const modal = document.getElementById('new-supplier-modal');
    if (modal) {
      modal.classList.remove('hidden');
      modal.style.display = 'flex';
      document.getElementById('new-supplier-name')?.focus();
      if (window.lucide) window.lucide.createIcons();
    }
  }

  closeNewSupplierModal() {
    const modal = document.getElementById('new-supplier-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.style.display = 'none';
      const nameInp = document.getElementById('new-supplier-name');
      const phoneInp = document.getElementById('new-supplier-phone');
      const balInp = document.getElementById('new-supplier-initial-balance');
      if (nameInp) nameInp.value = '';
      if (phoneInp) phoneInp.value = '';
      if (balInp) balInp.value = '';
    }
  }

  async saveNewSupplier() {
    const name = (document.getElementById('new-supplier-name')?.value || '').trim();
    const phone = (document.getElementById('new-supplier-phone')?.value || '').trim();
    const initialBal = parseFloat(document.getElementById('new-supplier-initial-balance')?.value || 0);

    if (!name) {
      window.app?.showToast('يرجى كتابة اسم المورد!', 'error');
      return;
    }

    try {
      window.app?.showLoading?.(true, 'جاري حفظ ومزامنة المورد سحابياً...');
      const res = await window.api.syncSupplier({
        name: name,
        phone: phone,
        initial_balance: initialBal
      });
      window.app?.showLoading?.(false);

      const realId = (res && res.success && res.supplier_id) ? res.supplier_id : Date.now();
      const newSup = {
        id: realId,
        name: name,
        phone: phone,
        balance: initialBal
      };

      this.suppliers = this.suppliers.filter(s => s.id !== realId && s.name !== name);
      this.suppliers.unshift(newSup);
      this.selectedSupplierId = realId;
      this.renderSuppliersDropdown();
      this.closeNewSupplierModal();
      
      // Update expenses controller suppliers as well
      if (window.expensesController) {
        window.expensesController.suppliers = this.suppliers;
        window.expensesController.renderSuppliersDropdown();
      }

      window.app?.showToast(res?.message || ('تمت إضافة ومزامنة المورد سحابياً: ' + name), 'success');
    } catch (err) {
      window.app?.showLoading?.(false);
      console.warn('Sync supplier error, saving locally:', err);
      const newId = Date.now();
      const newSup = { id: newId, name: name, phone: phone, balance: initialBal };
      this.suppliers.unshift(newSup);
      this.selectedSupplierId = newId;
      this.renderSuppliersDropdown();
      this.closeNewSupplierModal();
      window.app?.showToast('تم حفظ المورد محلياً: ' + name, 'warning');
    }
  }

  /* ==================== PAYMENT METHODS ==================== */
  setPaymentMethod(pm) {
    this.paymentMethod = pm;
    const paidBox = document.getElementById('purch-credit-paid-box');
    const paidInput = document.getElementById('purch-paid-amount');
    const total = this.calcTotalAmount();

    document.querySelectorAll('.purch-pm-btn').forEach(btn => {
      if (btn.getAttribute('data-pm') === pm) {
        btn.className = 'purch-pm-btn py-1.5 rounded-lg text-[11px] font-bold transition flex items-center justify-center gap-1 bg-indigo-600 text-white shadow-xs';
      } else {
        btn.className = 'purch-pm-btn py-1.5 rounded-lg text-[11px] font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition flex items-center justify-center gap-1';
      }
    });

    if (pm === 'آجل') {
      paidBox?.classList.remove('hidden');
      if (paidInput && !paidInput.value) paidInput.value = '0.00';
    } else {
      paidBox?.classList.add('hidden');
      if (paidInput) paidInput.value = total.toFixed(2);
    }
  }

  /* ==================== CATALOG & SEARCH ==================== */
  extractCategories() {
    const products = window.app?.products || [];
    const set = new Set();
    products.forEach(p => {
      const cat = (p.category && p.category.trim()) || 'عام';
      set.add(cat);
    });
    this.categories = Array.from(set);
  }

  renderCategories() {
    const bar = document.getElementById('purch-categories-bar');
    if (!bar) return;

    const products = window.app?.products || [];
    let html = '<button onclick="window.purchasesController.filterCategory(\'all\')" class="px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition border ' + 
      (this.activeCategory === 'all' ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs' : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-indigo-300') + '">' +
      'جميع الأصناف (' + products.length + ')' +
    '</button>';

    this.categories.forEach(cat => {
      const count = products.filter(p => (p.category || 'عام') === cat).length;
      const isSelected = this.activeCategory === cat;
      html += '<button onclick="window.purchasesController.filterCategory(\'' + cat + '\')" class="px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition border ' + 
        (isSelected ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs' : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-indigo-300') + '">' +
        cat + ' (' + count + ')' +
      '</button>';
    });

    bar.innerHTML = html;
  }

  filterCategory(cat) {
    this.activeCategory = cat;
    this.renderCategories();
    this.renderCatalogGrid();
  }

  onSearchInput(val) {
    this.searchQuery = (val || '').trim().toLowerCase();
    this.renderCatalogGrid();
  }

  renderCatalogGrid() {
    const grid = document.getElementById('purch-products-grid');
    if (!grid) return;

    const products = window.app?.products || [];
    let filtered = products.filter(p => {
      const matchCat = this.activeCategory === 'all' || (p.category || 'عام') === this.activeCategory;
      if (!matchCat) return false;
      if (!this.searchQuery) return true;

      const nameMatch = (p.name || '').toLowerCase().includes(this.searchQuery);
      const barcodeMatch = (p.barcode || '').toLowerCase().includes(this.searchQuery);
      const codeMatch = (p.local_code || '').toLowerCase().includes(this.searchQuery);
      return nameMatch || barcodeMatch || codeMatch;
    });

    if (filtered.length === 0) {
      grid.innerHTML = '<div class="col-span-full py-12 text-center text-gray-400">' +
        '<i data-lucide="package-search" class="w-10 h-10 mx-auto mb-2 opacity-40"></i>' +
        '<p class="text-xs font-semibold">لم يتم العثور على أي صنف مطابق للبحث</p>' +
        '<button onclick="window.purchasesController.openNewCustomProductModal()" class="mt-3 px-4 py-2 rounded-xl bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 text-xs font-bold inline-flex items-center gap-1">' +
          '<i data-lucide="plus-circle" class="w-3.5 h-3.5"></i>' +
          'إضافة كصنف جديد بالفاتورة' +
        '</button>' +
      '</div>';
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    grid.innerHTML = filtered.map(p => {
      const cost = parseFloat(p.cost || 0);
      const price = parseFloat(p.price || 0);
      const stock = parseFloat(p.stock || 0);
      const isWeight = p.unit_type === 'weight' || p.unit === 'كجم' || p.is_weight;

      return '<div onclick="window.purchasesController.addProductToPurchaseCart(' + p.id + ')" class="p-3 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200/90 dark:border-gray-700/80 shadow-xs hover:shadow-md hover:border-indigo-500 dark:hover:border-indigo-400 cursor-pointer flex flex-col justify-between gap-2 select-none group transition">' +
        '<div class="flex items-center justify-between gap-1 text-[10px]">' +
          (isWeight 
            ? '<span class="px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 font-bold border border-amber-200 dark:border-amber-800">⚖️ ميزان</span>'
            : '<span class="px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-bold border border-indigo-200 dark:border-indigo-800">📦 قطعة</span>'
          ) +
          '<span class="font-bold px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-mono">' +
            'مخزن: ' + stock + ' ' + (isWeight ? 'كجم' : 'ق') +
          '</span>' +
        '</div>' +

        '<div class="my-0.5">' +
          '<h4 class="text-xs font-bold text-gray-900 dark:text-white leading-snug line-clamp-2 min-h-[2rem]">' + p.name + '</h4>' +
          (p.barcode ? '<p class="text-[10px] text-gray-400 font-mono mt-0.5 truncate">' + p.barcode + '</p>' : '') +
        '</div>' +

        '<div class="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-700 mt-auto">' +
          '<div class="flex flex-col">' +
            '<span class="text-[10px] text-amber-600 dark:text-amber-400 font-bold font-mono">تكلفة: ' + cost.toFixed(2) + ' ج.م</span>' +
            '<span class="text-[9px] text-gray-400">بيع: ' + price.toFixed(2) + ' ج.م</span>' +
          '</div>' +
          '<div class="w-6 h-6 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold text-xs shadow-xs group-hover:bg-emerald-700 transition">' +
            '+' +
          '</div>' +
        '</div>' +
      '</div>';
    }).join('');

    if (window.lucide) window.lucide.createIcons();
  }

  /* ==================== PURCHASE CART ACTIONS ==================== */
  addProductToPurchaseCart(productId, customQty = null) {
    const prod = window.app?.products?.find(p => p.id === productId);
    if (!prod) return;

    const isWeight = prod.unit_type === 'weight' || prod.unit === 'كجم' || prod.is_weight;
    const defaultQty = customQty !== null ? customQty : (isWeight ? 1.0 : 1);

    const existingIdx = this.items.findIndex(i => i.product_id === prod.id || (prod.barcode && i.barcode === prod.barcode));
    if (existingIdx > -1) {
      this.items[existingIdx].qty += defaultQty;
      this.items[existingIdx].total = this.items[existingIdx].qty * this.items[existingIdx].cost_price;
    } else {
      this.items.push({
        product_id: prod.id,
        name: prod.name,
        barcode: prod.barcode || '',
        category: prod.category || 'عام',
        unit_type: isWeight ? 'weight' : 'piece',
        unit: isWeight ? 'كجم' : 'قطعة',
        cost_price: parseFloat(prod.cost || 0),
        selling_price: parseFloat(prod.price || 0),
        qty: defaultQty,
        total: defaultQty * parseFloat(prod.cost || 0)
      });
    }

    window.posScanner?.playSuccessBeep();
    this.renderCart();
  }

  addProductByBarcode(barcode) {
    const clean = String(barcode || '').trim();
    if (!clean) return;

    const prod = window.app?.products?.find(p => 
      (p.barcode && p.barcode.trim() === clean) || 
      (p.local_code && p.local_code.trim() === clean) ||
      (String(p.id) === clean)
    );

    if (prod) {
      this.addProductToPurchaseCart(prod.id);
      window.app?.showToast('تمت إضافة الصنف للفاتورة: ' + prod.name, 'info');
    } else {
      this.openNewCustomProductModal(clean);
    }
  }

  changeItemQty(index, delta) {
    const item = this.items[index];
    if (!item) return;

    const step = item.unit_type === 'weight' ? 0.25 : 1;
    const newQty = item.qty + (delta * step);

    if (newQty <= 0) {
      this.removeItem(index);
    } else {
      item.qty = parseFloat(newQty.toFixed(3));
      item.total = item.qty * item.cost_price;
      this.renderCart();
    }
  }

  updateItemQty(index, val) {
    const item = this.items[index];
    if (!item) return;

    const num = parseFloat(val || 0);
    if (num <= 0) {
      this.removeItem(index);
    } else {
      item.qty = num;
      item.total = item.qty * item.cost_price;
      this.updateTotalsDisplay();
    }
  }

  updateItemCost(index, val) {
    const item = this.items[index];
    if (!item) return;

    item.cost_price = parseFloat(val || 0);
    item.total = item.qty * item.cost_price;
    this.updateTotalsDisplay();
  }

  updateItemSellingPrice(index, val) {
    const item = this.items[index];
    if (!item) return;
    item.selling_price = parseFloat(val || 0);
  }

  removeItem(index) {
    this.items.splice(index, 1);
    this.renderCart();
  }

  clearPurchaseCart() {
    this.items = [];
    this.generateInvoiceNumber();
    this.renderCart();
  }

  calcTotalAmount() {
    return this.items.reduce((sum, i) => sum + (i.qty * i.cost_price), 0);
  }

  calcTotalQty() {
    return this.items.reduce((sum, i) => sum + i.qty, 0);
  }

  updateTotalsDisplay() {
    const total = this.calcTotalAmount();
    const qty = this.calcTotalQty();
    const count = this.items.length;

    const totalEl = document.getElementById('purch-cart-total-val');
    const countEl = document.getElementById('purch-cart-items-count-val');
    const paidInput = document.getElementById('purch-paid-amount');
    const mobileBadge = document.getElementById('purch-mobile-cart-badge');
    const barTotal = document.getElementById('purch-mobile-bar-total');
    const barItems = document.getElementById('purch-mobile-bar-items');
    const floatingBar = document.getElementById('purch-mobile-bottom-bar');

    if (totalEl) totalEl.textContent = total.toFixed(2) + ' ج.م';
    if (countEl) countEl.textContent = count + ' أصناف (' + qty + ' كمية)';
    if (mobileBadge) mobileBadge.textContent = String(count);
    if (barTotal) barTotal.textContent = total.toFixed(2) + ' ج.م';
    if (barItems) barItems.textContent = count + ' أصناف (' + qty + ' قطعة/كجم)';

    if (this.mobileTab === 'catalog' && count > 0) {
      floatingBar?.classList.remove('hidden');
    } else {
      floatingBar?.classList.add('hidden');
    }

    if (this.paymentMethod !== 'آجل' && paidInput) {
      paidInput.value = total.toFixed(2);
    }
  }

  renderCart() {
    const list = document.getElementById('purch-cart-items-list');
    const emptyNotice = document.getElementById('purch-empty-notice');
    if (!list) return;

    if (this.items.length === 0) {
      list.innerHTML = '';
      emptyNotice?.classList.remove('hidden');
      this.updateTotalsDisplay();
      return;
    }

    emptyNotice?.classList.add('hidden');
    list.innerHTML = this.items.map((item, idx) => {
      const isWeight = item.unit_type === 'weight';
      const step = isWeight ? '0.25' : '1';

      return '<div class="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-2xl border border-gray-200/80 dark:border-gray-600/60 flex flex-col gap-2 shadow-2xs">' +
        
        '<div class="flex items-start justify-between gap-2">' +
          '<div class="flex-1 min-w-0">' +
            '<h4 class="text-xs font-bold text-gray-900 dark:text-white leading-tight truncate">' + item.name + '</h4>' +
            '<div class="flex items-center gap-1.5 mt-0.5 text-[10px] text-gray-400 font-mono">' +
              (isWeight ? '<span class="text-amber-500 font-sans">⚖️ وزن</span>' : '<span class="text-indigo-500 font-sans">📦 قطعة</span>') +
              (item.barcode ? '<span>• ' + item.barcode + '</span>' : '') +
            '</div>' +
          '</div>' +
          
          '<button onclick="window.purchasesController.removeItem(' + idx + ')" class="p-1 text-gray-400 hover:text-rose-500 rounded-lg transition" title="حذف من الفاتورة">' +
            '<i data-lucide="trash-2" class="w-4 h-4"></i>' +
          '</button>' +
        '</div>' +

        '<div class="grid grid-cols-3 gap-2 pt-1 border-t border-gray-200/60 dark:border-gray-600/40 text-center items-end">' +
          
          '<!-- Qty Controls -->' +
          '<div class="flex flex-col gap-0.5 text-right">' +
            '<label class="text-[9px] font-bold text-gray-500">الكمية:</label>' +
            '<div class="flex items-center bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl p-0.5">' +
              '<button type="button" onclick="window.purchasesController.changeItemQty(' + idx + ', -1)" class="w-6 h-6 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-bold text-xs flex items-center justify-center hover:bg-gray-200">-</button>' +
              '<input type="number" step="' + step + '" value="' + item.qty + '" oninput="window.purchasesController.updateItemQty(' + idx + ', this.value)" class="w-10 text-center text-xs font-bold font-mono bg-transparent border-0 p-0 focus:ring-0">' +
              '<button type="button" onclick="window.purchasesController.changeItemQty(' + idx + ', 1)" class="w-6 h-6 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-bold text-xs flex items-center justify-center hover:bg-gray-200">+</button>' +
            '</div>' +
          '</div>' +

          '<!-- Unit Cost (Editable) -->' +
          '<div class="flex flex-col gap-0.5 text-right">' +
            '<label class="text-[9px] font-bold text-amber-600 dark:text-amber-400">سعر الشراء:</label>' +
            '<input type="number" step="0.5" value="' + item.cost_price + '" oninput="window.purchasesController.updateItemCost(' + idx + ', this.value)" class="w-full bg-white dark:bg-gray-800 border border-amber-300 dark:border-amber-700 rounded-xl px-2 py-1 text-xs font-bold font-mono text-center text-amber-700 dark:text-amber-300">' +
          '</div>' +

          '<!-- Unit Selling Price (Editable) -->' +
          '<div class="flex flex-col gap-0.5 text-right">' +
            '<label class="text-[9px] font-bold text-emerald-600 dark:text-emerald-400">سعر البيع:</label>' +
            '<input type="number" step="0.5" value="' + item.selling_price + '" oninput="window.purchasesController.updateItemSellingPrice(' + idx + ', this.value)" class="w-full bg-white dark:bg-gray-800 border border-emerald-300 dark:border-emerald-700 rounded-xl px-2 py-1 text-xs font-bold font-mono text-center text-emerald-600 dark:text-emerald-300">' +
          '</div>' +

        '</div>' +

        '<div class="flex items-center justify-between text-[11px] pt-1 border-t border-gray-200/40 dark:border-gray-600/20 font-bold">' +
          '<span class="text-gray-500">إجمالي البند:</span>' +
          '<span class="font-mono text-indigo-600 dark:text-indigo-400 font-black">' + (item.qty * item.cost_price).toFixed(2) + ' ج.م</span>' +
        '</div>' +

      '</div>';
    }).join('');

    this.updateTotalsDisplay();
    if (window.lucide) window.lucide.createIcons();
  }

  /* ==================== CUSTOM PRODUCT MODAL ==================== */
  openNewCustomProductModal(prefilledBarcode = '') {
    const modal = document.getElementById('new-purchase-product-modal');
    if (modal) {
      modal.classList.remove('hidden');
      modal.style.display = 'flex';
      const bcodeInp = document.getElementById('new-purch-item-barcode');
      if (bcodeInp && prefilledBarcode) bcodeInp.value = prefilledBarcode;
      document.getElementById('new-purch-item-name')?.focus();
      if (window.lucide) window.lucide.createIcons();
    }
  }

  closeNewCustomProductModal() {
    const modal = document.getElementById('new-purchase-product-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.style.display = 'none';
      this.isScanningForNewProductModal = false;
      const nameInp = document.getElementById('new-purch-item-name');
      const bcodeInp = document.getElementById('new-purch-item-barcode');
      const costInp = document.getElementById('new-purch-item-cost');
      const priceInp = document.getElementById('new-purch-item-price');
      const qtyInp = document.getElementById('new-purch-item-qty');
      if (nameInp) nameInp.value = '';
      if (bcodeInp) bcodeInp.value = '';
      if (costInp) costInp.value = '0.00';
      if (priceInp) priceInp.value = '0.00';
      if (qtyInp) qtyInp.value = '1';
    }
  }

  saveNewCustomProductToCart() {
    const name = (document.getElementById('new-purch-item-name')?.value || '').trim();
    const barcode = (document.getElementById('new-purch-item-barcode')?.value || '').trim();
    const unitType = document.getElementById('new-purch-item-unit-type')?.value || 'piece';
    const qty = parseFloat(document.getElementById('new-purch-item-qty')?.value || 1);
    const cost = parseFloat(document.getElementById('new-purch-item-cost')?.value || 0);
    const price = parseFloat(document.getElementById('new-purch-item-price')?.value || 0);

    if (!name) {
      window.app?.showToast('يرجى كتابة اسم الصنف!', 'error');
      return;
    }

    this.items.push({
      product_id: null,
      name: name,
      barcode: barcode,
      category: 'عام',
      unit_type: unitType,
      unit: unitType === 'weight' ? 'كجم' : 'قطعة',
      cost_price: cost,
      selling_price: price,
      qty: qty,
      total: qty * cost
    });

    this.closeNewCustomProductModal();
    this.renderCart();
    window.posScanner?.playSuccessBeep();
    window.app?.showToast('تمت إضافة الصنف للفاتورة: ' + name, 'success');
  }

  /* ==================== SUBMIT PURCHASE INVOICE ==================== */
  async submitPurchaseInvoice() {
    if (this.items.length === 0) {
      window.app?.showToast('فاتورة الشراء فارغة! أضف أصنافاً أولاً.', 'error');
      return;
    }

    const select = document.getElementById('purch-supplier-select');
    let supplierId = this.selectedSupplierId;
    let supplierName = '';
    let supplierPhone = '';

    if (select && select.value) {
      supplierId = parseInt(select.value, 10);
      supplierName = select.options[select.selectedIndex]?.getAttribute('data-name') || '';
      supplierPhone = select.options[select.selectedIndex]?.getAttribute('data-phone') || '';
    }

    if (!supplierName) {
      window.app?.showToast('يرجى اختيار أو إضافة المورد أولاً!', 'error');
      if (this.mobileTab === 'catalog') this.setMobileTab('cart');
      select?.focus();
      return;
    }

    const totalAmount = this.calcTotalAmount();
    const paidInput = document.getElementById('purch-paid-amount');
    const paidAmount = this.paymentMethod === 'آجل' ? parseFloat(paidInput?.value || 0) : totalAmount;

    const payload = {
      supplier_id: supplierId,
      supplier_name: supplierName,
      supplier_phone: supplierPhone,
      invoice_number: this.invoiceNumber || ('PUR-' + Date.now()),
      payment_method: this.paymentMethod,
      total_amount: totalAmount,
      paid_amount: paidAmount,
      date: this.invoiceDate || new Date().toISOString().slice(0, 19).replace('T', ' '),
      items: this.items.map(i => ({
        barcode: (i.barcode || '').trim(),
        name: (i.name || '').trim(),
        category: i.category || 'عام',
        unit_type: i.unit_type,
        unit: i.unit,
        qty: i.qty,
        cost_price: i.cost_price,
        selling_price: i.selling_price
      }))
    };

    try {
      window.app?.showLoading(true, 'جاري حفظ فاتورة الشراء وتحديث أرصدة المخزن...');
      const res = await window.api.pushPurchase(payload);
      window.app?.showLoading(false);

      if (res && res.success) {
        window.posScanner?.playSuccessBeep();
        window.app?.showToast(res.message || 'تم حفظ فاتورة التوريد وتحديث المخزن بنجاح ✅', 'success');

        // Immediately update local catalog cache
        if (Array.isArray(res.updated_products)) {
          res.updated_products.forEach(up => {
            const existingIdx = window.app.products.findIndex(p => 
              (up.product_id && p.id == up.product_id) || 
              (up.barcode && p.barcode == up.barcode) ||
              (up.name && p.name == up.name)
            );
            if (existingIdx > -1) {
              window.app.products[existingIdx].stock = parseFloat(up.new_stock || window.app.products[existingIdx].stock);
              window.app.products[existingIdx].cost = parseFloat(up.cost_price || window.app.products[existingIdx].cost);
              if (up.selling_price) window.app.products[existingIdx].price = parseFloat(up.selling_price);
            } else {
              window.app.products.unshift({
                id: up.product_id || Date.now(),
                name: up.name,
                barcode: up.barcode,
                category: up.category || 'عام',
                cost: parseFloat(up.cost_price || 0),
                price: parseFloat(up.selling_price || 0),
                stock: parseFloat(up.new_stock || up.added_qty || 0),
                unit: up.unit || 'قطعة',
                unit_type: up.unit_type || 'piece'
              });
            }
          });
          localStorage.setItem('syrian_home_products', JSON.stringify(window.app.products));
          window.app.extractCategories();
          window.app.renderCategories();
          window.app.renderProducts();
          this.extractCategories();
          this.renderCategories();
          this.renderCatalogGrid();
        }

        // Reset Cart
        this.clearPurchaseCart();
        if (this.mobileTab === 'cart') this.setMobileTab('catalog');

        // Reload Suppliers
        await this.loadSuppliers();
        this.renderSuppliersDropdown();
      } else {
        throw new Error(res.error || res.message || 'تعذر حفظ الفاتورة');
      }
    } catch (err) {
      window.app?.showLoading(false);
      window.app?.showToast('خطأ: ' + err.message, 'error');
    }
  }

  /* ==================== PAST PURCHASES HISTORY ==================== */
  async loadPurchasesHistory() {
    const listContainer = document.getElementById('purchases-history-list');
    if (!listContainer) return;

    try {
      listContainer.innerHTML = 
        '<div class="py-12 text-center text-gray-400">' +
          '<div class="w-7 h-7 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>' +
          '<p class="text-xs">جاري تحميل سجل فواتير المشتريات...</p>' +
        '</div>';

      const res = await window.api.getPurchases(50);
      if (res && res.success && Array.isArray(res.purchases)) {
        this.history = res.purchases;
        this.renderPurchasesHistory();
      } else {
        listContainer.innerHTML = '<p class="text-xs text-gray-400 text-center py-8">لا توجد فواتير مشتريات مسجلة حتى الآن.</p>';
      }
    } catch (e) {
      listContainer.innerHTML = '<p class="text-xs text-rose-500 text-center py-8">تعذر تحميل سجل المشتريات: ' + e.message + '</p>';
    }
  }

  renderPurchasesHistory() {
    const listContainer = document.getElementById('purchases-history-list');
    if (!listContainer) return;

    if (this.history.length === 0) {
      listContainer.innerHTML = '<p class="text-xs text-gray-400 text-center py-8">لا توجد فواتير مشتريات سابقة.</p>';
      return;
    }

    listContainer.innerHTML = this.history.map(inv => {
      const total = parseFloat(inv.total_amount || 0);
      const paid = parseFloat(inv.paid_amount || 0);
      const pm = inv.payment_method || 'نقدي';
      const itemsCount = inv.items_count || (Array.isArray(inv.items) ? inv.items.length : '-');

      return '<div class="p-4 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200/80 dark:border-gray-700/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">' +
          '<div class="flex items-start gap-3">' +
            '<div class="w-10 h-10 rounded-2xl bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold shrink-0">' +
              '<i data-lucide="package-plus" class="w-5 h-5"></i>' +
            '</div>' +
            '<div>' +
              '<div class="flex items-center gap-2">' +
                '<h4 class="text-xs sm:text-sm font-bold text-gray-900 dark:text-white">' + (inv.supplier_name || 'مورد عام') + '</h4>' +
                '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold ' + (pm === 'آجل' ? 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300') + '">' + pm + '</span>' +
              '</div>' +
              '<p class="text-[11px] text-gray-500 font-mono mt-0.5">' + (inv.invoice_number || ('PUR-#' + inv.id)) + ' • ' + (inv.date || inv.created_at || '') + ' • (' + itemsCount + ' أصناف)</p>' +
            '</div>' +
          '</div>' +

          '<div class="flex items-center justify-between sm:justify-end gap-4 pt-2 sm:pt-0 border-t sm:border-t-0 border-gray-100 dark:border-gray-700">' +
            '<div class="text-left">' +
              '<div class="text-xs sm:text-sm font-black text-indigo-600 dark:text-indigo-400 font-mono">' + total.toFixed(2) + ' ج.م</div>' +
              (pm === 'آجل' ? '<span class="text-[10px] text-gray-400">المدفوع: ' + paid.toFixed(2) + ' ج.م</span>' : '') +
            '</div>' +
          '</div>' +
        '</div>';
    }).join('');

    if (window.lucide) window.lucide.createIcons();
  }
}

window.purchasesController = new PurchasesController();
