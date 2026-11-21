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
    this.loadFromStorage();
    this.searchQuery = '';
    this.categories = [];
    this.invoiceNumber = '';
    this.invoiceDate = '';
    this.history = [];
    this.isInitialized = false;
    this.mobileTab = 'catalog'; // 'catalog' or 'cart'
    this.isScanningForNewProductModal = false;
    this.catalogLimit = 40;
    this._searchTimer = null;
    this._supFilterTimer = null;
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
    this.catalogLimit = 40;
    this._searchTimer = null;
    this._supFilterTimer = null;
    window.posScanner?.openCameraModal();
  }

  scanBarcodeForNewProduct() {
    this.isScanningForNewProductModal = true;
    window.posScanner?.openCameraModal();
  }

  handleCameraBarcodeScanned(barcode) {
    if (this.isScanningForNewProductModal) {
      this.isScanningForNewProductModal = false;
    this.catalogLimit = 40;
    this._searchTimer = null;
    this._supFilterTimer = null;
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
    const dsSelect = document.getElementById('ds-purch-supplier-select');
    if (dsSelect) {
      dsSelect.innerHTML = html;
    }
    this.updateSupplierBalanceBadge();
  }

  filterSupplierDropdown(term) {
    clearTimeout(this._supFilterTimer);
    this._supFilterTimer = setTimeout(() => {
      this._doFastFilterSupplierDropdown(term);
    }, 150);
  }

  _doFastFilterSupplierDropdown(term) {
    const select = document.getElementById('purch-supplier-select');
    if (!select || !this.suppliers) return;

    term = (term || '').trim();
    let list = [...this.suppliers];
    if (term) {
      const qLower = term.toLowerCase();
      // Fast path search: code, phone, name substring
      list = list.filter(s => {
        const nameMatch = (s.name || '').toLowerCase().includes(qLower);
        const codeMatch = String(s.code || s.supplier_code || s.id || '').includes(term);
        const phoneMatch = String(s.phone || '').includes(term);
        return nameMatch || codeMatch || phoneMatch;
      });
    }

    // Limit options to top 50 to maintain fast DOM rendering
    const topList = list.slice(0, 50);

    let html = '<option value="">-- اختر المورد (' + list.length + ' نتائج مطابقة) --</option>';
    topList.forEach(s => {
      const bal = parseFloat(s.balance || 0);
      const isSelected = this.selectedSupplierId == s.id ? 'selected' : '';
      html += '<option value="' + s.id + '" ' + isSelected + ' data-name="' + s.name + '" data-phone="' + (s.phone || '') + '" data-balance="' + bal + '">' + 
        s.name + (bal !== 0 ? ' (رصيد: ' + bal.toFixed(2) + ' ج.م)' : '') + 
      '</option>';
    });
    select.innerHTML = html;

    if (list.length === 1) {
      select.value = list[0].id;
      this.onSupplierSelected(list[0].id);
    }
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
    this.catalogLimit = 40;
    this.renderCategories();
    this.renderCatalogGrid();
  }

  onSearchInput(val) {
    this.searchQuery = (val || '').trim().toLowerCase();
    this.catalogLimit = 40;
    clearTimeout(this._searchTimer);
    this._searchTimer = setTimeout(() => {
      this.renderCatalogGrid();
    }, 150);
  }

  loadMoreProducts() {
    this.catalogLimit = (this.catalogLimit || 40) + 40;
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
      if (window.lucide) window.lucide.createIcons({ root: grid });
      return;
    }

    const currentLimit = this.catalogLimit || 40;
    const toRender = filtered.slice(0, currentLimit);

    let html = toRender.map(p => {
      const cost = parseFloat(p.cost || 0);
      const price = parseFloat(p.price || 0);
      const stock = parseFloat(p.stock || 0);
      const isWeight = p.unit_type === 'weight' || p.unit === 'كجم' || p.is_weight;

      return '<div onclick="window.purchasesController.openProductEntryModal(' + p.id + ')" class="p-3.5 bg-white dark:bg-gray-800 rounded-3xl border border-gray-200/90 dark:border-gray-700/80 shadow-xs hover:shadow-md hover:border-indigo-500 dark:hover:border-indigo-400 cursor-pointer flex flex-col justify-between gap-2.5 select-none active:scale-98 transition group">' +
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
          '<h4 class="text-xs sm:text-sm font-bold text-gray-900 dark:text-white leading-snug line-clamp-2 min-h-[2.2rem]">' + p.name + '</h4>' +
          (p.barcode ? '<p class="text-[10px] text-gray-400 font-mono mt-0.5 truncate">' + p.barcode + '</p>' : '') +
        '</div>' +

        '<div class="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-700 mt-auto">' +
          '<div class="flex flex-col">' +
            '<span class="text-[11px] text-amber-600 dark:text-amber-400 font-black font-mono">تكلفة: ' + cost.toFixed(2) + ' ج.م</span>' +
            '<span class="text-[9px] text-gray-400">بيع: ' + price.toFixed(2) + ' ج.م</span>' +
          '</div>' +
          '<div class="h-8 px-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 font-black text-xs flex items-center justify-center gap-1 border border-indigo-200 dark:border-indigo-800 group-hover:bg-indigo-600 group-hover:text-white transition">' +
            '<i data-lucide="plus" class="w-3.5 h-3.5"></i>' +
            '<span>توريد</span>' +
          '</div>' +
        '</div>' +
      '</div>';
    }).join('');

    if (filtered.length > currentLimit) {
      html += '<div class="col-span-full py-4 text-center">' +
        '<button type="button" onclick="window.purchasesController.loadMoreProducts()" class="px-6 py-3 rounded-2xl bg-indigo-50 dark:bg-indigo-950/70 hover:bg-indigo-100 dark:hover:bg-indigo-900 text-indigo-700 dark:text-indigo-300 font-bold text-xs shadow-xs border border-indigo-200 dark:border-indigo-800 transition active:scale-95 cursor-pointer inline-flex items-center gap-2">' +
          '<i data-lucide="plus-circle" class="w-4 h-4"></i>' +
          '<span>عرض المزيد من الأصناف (+40 صنف) 📦</span>' +
          '<span class="text-[10px] text-gray-400 font-mono">(' + toRender.length + ' من ' + filtered.length + ')</span>' +
        '</button>' +
      '</div>';
    }

    grid.innerHTML = html;
    if (window.lucide) window.lucide.createIcons({ root: grid });
  }

  /* ==================== PURCHASE CART ACTIONS ==================== */
  addProductToPurchaseCart(productId, customQty = null) {
    const prod = window.app?.products?.find(p => p.id === productId);
    if (!prod) return;

    const isWeight = prod.unit_type === 'weight' || prod.unit === 'كجم' || prod.is_weight;
    const defaultQty = customQty !== null ? customQty : (isWeight ? 1.0 : 1);

    // في فواتير الشراء: إضافة المنتج دائماً كبند منفصل ومستقل (دون دمج)
    // لإتاحة تسجيل أسعار شراء مختلفة أو دفعات/أنواع متعددة لنفس المنتج في نفس الفاتورة
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
      this.openProductEntryModal(prod.id);
    } else {
      this.openProductEntryModal(null, clean);
    }
  }

  /* ==================== UNIFIED PRODUCT ENTRY MODAL (سلس وسريع للهاتف) ==================== */
  openProductEntryModal(productId = null, prefilledBarcode = '') {
    const modal = document.getElementById('purch-item-entry-modal');
    if (!modal) return;

    this.activeModalProduct = null;
    const titleEl = document.getElementById('purch-modal-title');
    const subEl = document.getElementById('purch-modal-subtitle');
    const customFields = document.getElementById('purch-modal-custom-fields');
    const customName = document.getElementById('purch-modal-custom-name');
    const customBc = document.getElementById('purch-modal-custom-barcode');
    const customUnit = document.getElementById('purch-modal-custom-unit-type');
    const qtyInp = document.getElementById('purch-modal-qty');
    const costInp = document.getElementById('purch-modal-cost');
    const priceInp = document.getElementById('purch-modal-price');
    const unitLabel = document.getElementById('purch-modal-unit-label');

    if (productId) {
      const prod = window.app?.products?.find(p => p.id === productId);
      if (!prod) return;
      this.activeModalProduct = prod;

      const isWeight = prod.unit_type === 'weight' || prod.unit === 'كجم' || prod.is_weight;
      if (titleEl) titleEl.textContent = prod.name;
      if (subEl) subEl.textContent = 'مخزون: ' + (prod.stock || 0) + ' ' + (prod.unit || 'قطعة') + (prod.barcode ? ' • باركود: ' + prod.barcode : '');
      if (unitLabel) unitLabel.textContent = isWeight ? '⚖️ كجم (وزن)' : '📦 قطعة';
      if (customFields) customFields.classList.add('hidden');

      if (qtyInp) {
        qtyInp.value = isWeight ? '1.0' : '1';
        qtyInp.step = isWeight ? '0.25' : '1';
      }
      if (costInp) costInp.value = parseFloat(prod.cost || 0).toFixed(2);
      if (priceInp) priceInp.value = parseFloat(prod.price || 0).toFixed(2);
    } else {
      // Custom Product Mode
      this.activeModalProduct = null;
      if (titleEl) titleEl.textContent = 'إضافة صنف جديد غير مسجل';
      if (subEl) subEl.textContent = 'تسجيل صنف مخصص للفاتورة مباشرة';
      if (unitLabel) unitLabel.textContent = '📦 قطعة';
      if (customFields) customFields.classList.remove('hidden');

      if (customName) {
        customName.value = '';
        setTimeout(() => customName.focus(), 150);
      }
      if (customBc) customBc.value = prefilledBarcode || '';
      if (qtyInp) {
        qtyInp.value = '1';
        qtyInp.step = '1';
      }
      if (costInp) costInp.value = '0.00';
      if (priceInp) priceInp.value = '0.00';
    }

    this.onModalCalcChange();
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    if (productId && qtyInp) {
      setTimeout(() => qtyInp.select(), 150);
    }
    if (window.lucide) window.lucide.createIcons();
  }

  closeItemEntryModal() {
    const modal = document.getElementById('purch-item-entry-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.style.display = 'none';
      this.activeModalProduct = null;
    }
  }

  modalChangeQty(delta) {
    const qtyInp = document.getElementById('purch-modal-qty');
    if (!qtyInp) return;
    const isWeight = this.activeModalProduct?.unit_type === 'weight' || this.activeModalProduct?.unit === 'كجم';
    const step = isWeight ? 0.25 : 1;
    let val = parseFloat(qtyInp.value || 0) + (delta * step);
    if (val <= 0) val = step;
    qtyInp.value = isWeight ? val.toFixed(2) : String(Math.round(val));
    this.onModalCalcChange();
  }

  modalSetQty(val) {
    const qtyInp = document.getElementById('purch-modal-qty');
    if (!qtyInp) return;
    qtyInp.value = String(val);
    this.onModalCalcChange();
  }

  onModalCalcChange() {
    const qty = parseFloat(document.getElementById('purch-modal-qty')?.value || 0);
    const cost = parseFloat(document.getElementById('purch-modal-cost')?.value || 0);
    const total = qty * cost;

    const formulaEl = document.getElementById('purch-modal-formula');
    const subtotalEl = document.getElementById('purch-modal-subtotal');
    const btnText = document.getElementById('purch-modal-confirm-btn-text');

    if (formulaEl) formulaEl.textContent = qty + ' × ' + cost.toFixed(2) + ' ج.م';
    if (subtotalEl) subtotalEl.textContent = total.toFixed(2) + ' ج.م';
    if (btnText) btnText.textContent = 'إضافة للفاتورة (' + total.toFixed(2) + ' ج.م) 📦';
  }

  confirmModalItemToCart() {
    const qty = parseFloat(document.getElementById('purch-modal-qty')?.value || 0);
    const cost = parseFloat(document.getElementById('purch-modal-cost')?.value || 0);
    const price = parseFloat(document.getElementById('purch-modal-price')?.value || 0);

    if (qty <= 0) {
      window.app?.showToast('يرجى كتابة كمية صحيحة أكبر من صفر!', 'error');
      return;
    }

    let name = '';
    let barcode = '';
    let unitType = 'piece';
    let unit = 'قطعة';

    if (this.activeModalProduct) {
      name = this.activeModalProduct.name;
      barcode = this.activeModalProduct.barcode || '';
      unitType = this.activeModalProduct.unit_type || (this.activeModalProduct.unit === 'كجم' ? 'weight' : 'piece');
      unit = this.activeModalProduct.unit || (unitType === 'weight' ? 'كجم' : 'قطعة');
    } else {
      name = (document.getElementById('purch-modal-custom-name')?.value || '').trim();
      barcode = (document.getElementById('purch-modal-custom-barcode')?.value || '').trim();
      unitType = document.getElementById('purch-modal-custom-unit-type')?.value || 'piece';
      unit = unitType === 'weight' ? 'كجم' : 'قطعة';

      if (!name) {
        window.app?.showToast('يرجى كتابة اسم الصنف!', 'error');
        return;
      }
    }

    // ALWAYS ADD AS A SEPARATE INDEPENDENT LINE ITEM (دون أي دمج نهائياً)
    this.items.push({
      product_id: this.activeModalProduct ? this.activeModalProduct.id : null,
      name: name,
      barcode: barcode,
      category: this.activeModalProduct?.category || 'عام',
      unit_type: unitType,
      unit: unit,
      cost_price: cost,
      selling_price: price,
      qty: qty,
      total: qty * cost
    });

    this.closeItemEntryModal();
    window.posScanner?.playSuccessBeep();
    window.app?.showToast('تمت إضافة: ' + name + ' (' + qty + ' × ' + cost.toFixed(2) + ' = ' + (qty * cost).toFixed(2) + ' ج.م)', 'success');
    this.renderCart();
  }

  openNewCustomProductModal(prefilledBarcode = '') {
    this.openProductEntryModal(null, prefilledBarcode);
  }

  closeNewCustomProductModal() {
    this.closeItemEntryModal();
  }

  saveNewCustomProductToCart() {
    this.confirmModalItemToCart();
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
      this.updateRowSubtotalDisplay(index);
      this.updateTotalsDisplay();
    }
  }

  updateItemCost(index, val) {
    const item = this.items[index];
    if (!item) return;

    item.cost_price = parseFloat(val || 0);
    item.total = item.qty * item.cost_price;
    this.updateRowSubtotalDisplay(index);
    this.updateTotalsDisplay();
  }

  updateRowSubtotalDisplay(index) {
    const item = this.items[index];
    if (!item) return;
    const total = (item.qty * item.cost_price).toFixed(2);
    const subtotalEl = document.getElementById('purch-item-subtotal-' + index);
    const calcEl = document.getElementById('purch-item-calc-' + index);
    if (subtotalEl) subtotalEl.textContent = total + ' ج.م';
    if (calcEl) calcEl.textContent = '(' + item.qty + ' × ' + item.cost_price.toFixed(2) + ')';
  }

  updateItemSellingPrice(index, val) {
    const item = this.items[index];
    if (!item) return;
    item.selling_price = parseFloat(val || 0);
  }

  updateModalProductSubtotal() {
    const qty = parseFloat(document.getElementById('new-purch-item-qty')?.value || 0);
    const cost = parseFloat(document.getElementById('new-purch-item-cost')?.value || 0);
    const total = qty * cost;
    const formulaEl = document.getElementById('new-purch-item-calc-formula');
    const valEl = document.getElementById('new-purch-item-subtotal-val');
    if (formulaEl) formulaEl.textContent = qty + ' × ' + cost.toFixed(2) + ' ج.م';
    if (valEl) valEl.textContent = total.toFixed(2) + ' ج.م';
  }

  removeItem(index) {
    this.items.splice(index, 1);
    this.renderCart();
  }

  saveToStorage() {
    try {
      if (this.items && this.items.length > 0) {
        localStorage.setItem('pos_purchases_cart', JSON.stringify({
          items: this.items,
          selectedSupplierId: this.selectedSupplierId,
          invoiceNumber: this.invoiceNumber,
          invoiceDate: this.invoiceDate,
          paidAmount: this.paidAmount
        }));
      } else {
        localStorage.removeItem('pos_purchases_cart');
      }
    } catch (e) {}
  }

  loadFromStorage() {
    try {
      const saved = localStorage.getItem('pos_purchases_cart');
      if (!saved) return;
      const data = JSON.parse(saved);
      if (data && Array.isArray(data.items) && data.items.length > 0) {
        this.items = data.items;
        if (data.selectedSupplierId) this.selectedSupplierId = data.selectedSupplierId;
        if (data.invoiceNumber) this.invoiceNumber = data.invoiceNumber;
        if (data.invoiceDate) this.invoiceDate = data.invoiceDate;
        if (data.paidAmount) this.paidAmount = parseFloat(data.paidAmount || 0);
      }
    } catch (e) {}
  }

  clearPurchaseCart() {
    this.items = [];
    try { localStorage.removeItem('pos_purchases_cart'); } catch(e) {}
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

    // Update DreamSoft Purchases Replica Displays
    const dsLedTotal = document.getElementById('ds-purch-led-total');
    const dsSummarySubtotal = document.getElementById('ds-purch-summary-subtotal');
    const dsItemsCount = document.getElementById('ds-purch-items-count');
    const dsQtyCount = document.getElementById('ds-purch-qty-count');
    const dsPaidInput = document.getElementById('ds-purch-paid-input');
    const dsRemind = document.getElementById('ds-purch-led-remind');
    const dsInvoiceNum = document.getElementById('ds-purch-invoice-num');
    const dsInvoiceDate = document.getElementById('ds-purch-invoice-date');

    if (dsLedTotal) dsLedTotal.textContent = total.toFixed(3);
    if (dsSummarySubtotal) dsSummarySubtotal.value = total.toFixed(3);
    if (dsItemsCount) dsItemsCount.textContent = count;
    if (dsQtyCount) dsQtyCount.textContent = qty;
    if (dsInvoiceNum && (!dsInvoiceNum.value || dsInvoiceNum.value === 'PUR-...')) dsInvoiceNum.value = this.invoiceNumber || 'PUR-2026';
    if (dsInvoiceDate && (!dsInvoiceDate.value || dsInvoiceDate.value === '...')) {
      const now = new Date();
      dsInvoiceDate.value = now.toLocaleDateString('ar-EG') + ' ' + now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
    }

    if (this.paymentMethod === 'كاش' && dsPaidInput) {
      dsPaidInput.value = total.toFixed(2);
      this.paidAmount = total;
    }

    const paidVal = dsPaidInput ? parseFloat(dsPaidInput.value || 0) : (parseFloat(this.paidAmount) || 0);
    const discVal = parseFloat(this.discountAmount || 0);
    const remain = Math.max(0, total - paidVal - discVal);
    if (dsRemind) dsRemind.textContent = remain.toFixed(2);
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
    this.saveToStorage();
    list.innerHTML = this.items.map((item, idx) => {
      const isWeight = item.unit_type === 'weight';
      const step = isWeight ? '0.25' : '1';

      return '<div class="p-3.5 sm:p-4 bg-white dark:bg-gray-800 rounded-3xl border border-gray-200/90 dark:border-gray-700/80 shadow-xs flex flex-col gap-3 transition">' +
        
        '<!-- Header: Item Number, Name, Delete -->' +
        '<div class="flex items-start justify-between gap-2">' +
          '<div class="flex items-center gap-2 min-w-0">' +
            '<span class="w-7 h-7 rounded-xl bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 font-mono text-xs font-black flex items-center justify-center shrink-0">#' + (idx + 1) + '</span>' +
            '<div class="min-w-0">' +
              '<h4 class="text-xs sm:text-sm font-bold text-gray-900 dark:text-white leading-tight truncate">' + item.name + '</h4>' +
              '<div class="flex items-center gap-1.5 mt-0.5 text-[10px] text-gray-400 font-mono">' +
                (isWeight ? '<span class="text-amber-500 font-sans font-bold">⚖️ وزن</span>' : '<span class="text-indigo-500 font-sans font-bold">📦 قطعة</span>') +
                (item.barcode ? '<span>• ' + item.barcode + '</span>' : '') +
              '</div>' +
            '</div>' +
          '</div>' +
          
          '<button type="button" onclick="window.purchasesController.removeItem(' + idx + ')" class="w-8 h-8 rounded-xl bg-gray-50 dark:bg-gray-700 text-gray-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/60 flex items-center justify-center transition active:scale-95" title="حذف من الفاتورة">' +
            '<i data-lucide="trash-2" class="w-4 h-4"></i>' +
          '</button>' +
        '</div>' +

        '<!-- Controls: Qty, Cost Price, Selling Price with Big Touch Targets -->' +
        '<div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-gray-100 dark:border-gray-700/60">' +
          
          '<!-- Qty Controls with touch buttons -->' +
          '<div class="flex flex-col gap-1">' +
            '<label class="text-[10px] font-bold text-gray-600 dark:text-gray-300">الكمية:</label>' +
            '<div class="flex items-center bg-gray-50 dark:bg-gray-700/60 border border-gray-200 dark:border-gray-600 rounded-2xl p-1">' +
              '<button type="button" onclick="window.purchasesController.changeItemQty(' + idx + ', -1)" class="w-9 h-9 rounded-xl bg-white dark:bg-gray-800 text-gray-800 dark:text-white font-black text-base flex items-center justify-center shadow-xs active:scale-95 select-none">−</button>' +
              '<input type="number" step="' + step + '" value="' + item.qty + '" oninput="window.purchasesController.updateItemQty(' + idx + ', this.value)" class="flex-1 text-center text-sm font-black font-mono bg-transparent border-0 p-0 focus:ring-0 text-gray-900 dark:text-white">' +
              '<button type="button" onclick="window.purchasesController.changeItemQty(' + idx + ', 1)" class="w-9 h-9 rounded-xl bg-white dark:bg-gray-800 text-gray-800 dark:text-white font-black text-base flex items-center justify-center shadow-xs active:scale-95 select-none">+</button>' +
            '</div>' +
          '</div>' +

          '<!-- Unit Cost -->' +
          '<div class="flex flex-col gap-1">' +
            '<label class="text-[10px] font-bold text-amber-600 dark:text-amber-400">سعر الشراء:</label>' +
            '<div class="relative">' +
              '<input type="number" step="0.5" value="' + item.cost_price + '" oninput="window.purchasesController.updateItemCost(' + idx + ', this.value)" class="w-full h-11 bg-amber-50/70 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 rounded-2xl px-3 pe-8 text-xs sm:text-sm font-black font-mono text-center text-amber-800 dark:text-amber-300">' +
              '<span class="absolute end-2.5 top-1/2 -translate-y-1/2 text-[9px] text-amber-600 font-bold pointer-events-none">ج.م</span>' +
            '</div>' +
          '</div>' +

          '<!-- Unit Selling Price -->' +
          '<div class="flex flex-col gap-1">' +
            '<label class="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">سعر البيع:</label>' +
            '<div class="relative">' +
              '<input type="number" step="0.5" value="' + item.selling_price + '" oninput="window.purchasesController.updateItemSellingPrice(' + idx + ', this.value)" class="w-full h-11 bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-700 rounded-2xl px-3 pe-8 text-xs sm:text-sm font-black font-mono text-center text-emerald-800 dark:text-emerald-300">' +
              '<span class="absolute end-2.5 top-1/2 -translate-y-1/2 text-[9px] text-emerald-600 font-bold pointer-events-none">ج.م</span>' +
            '</div>' +
          '</div>' +

        '</div>' +

        '<!-- Prominent Line Total Banner -->' +
        '<div class="flex items-center justify-between bg-emerald-50/90 dark:bg-emerald-950/60 p-3 rounded-2xl border border-emerald-200 dark:border-emerald-800 font-bold shadow-2xs">' +
          '<div class="flex items-center gap-1.5 text-xs text-gray-700 dark:text-gray-300">' +
            '<span>مجموع الصنف:</span>' +
            '<span id="purch-item-calc-' + idx + '" class="text-xs font-mono text-emerald-700 dark:text-emerald-300 font-bold">(' + item.qty + ' × ' + item.cost_price.toFixed(2) + ')</span>' +
          '</div>' +
          '<span id="purch-item-subtotal-' + idx + '" class="font-mono text-emerald-700 dark:text-emerald-300 text-sm sm:text-base font-black">' + (item.qty * item.cost_price).toFixed(2) + ' ج.م</span>' +
        '</div>' +

      '</div>';
    }).join('');

    // Render DreamSoft Purchases Table Replica
    const dsPurchTbody = document.getElementById('ds-purch-table-body');
    const dsPurchEmpty = document.getElementById('ds-purch-empty-notice');
    if (this.items.length === 0) {
      if (dsPurchTbody) dsPurchTbody.innerHTML = '';
      if (dsPurchEmpty) dsPurchEmpty.classList.remove('hidden');
    } else {
      if (dsPurchEmpty) dsPurchEmpty.classList.add('hidden');
      if (dsPurchTbody) {
        dsPurchTbody.innerHTML = this.items.map((item, idx) => {
          const isWeight = item.unit_type === 'weight';
          const step = isWeight ? '0.25' : '1';
          const lineTotal = (item.qty * item.cost_price).toFixed(3);
          const itemCode = item.barcode || item.product_id;

          return '<tr class="hover:bg-blue-100/60 transition bg-white">' +
            '<td class="text-center font-bold font-mono text-slate-700 py-1 px-1 text-[11px]">' + (idx + 1) + '</td>' +
            '<td class="font-mono font-bold text-slate-800 py-1 px-2 text-[11px] truncate max-w-[95px]" title="' + itemCode + '">' + itemCode + '</td>' +
            '<td class="py-1 px-2">' +
              '<div class="font-bold text-blue-950 leading-tight truncate max-w-xs text-xs">' + item.name + '</div>' +
              (isWeight ? '<span class="inline-block mt-0.5 px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 text-[9px] font-bold">⚖️ وزن</span>' : '') +
            '</td>' +
            '<td class="text-center py-1 px-1">' +
              '<div class="inline-flex items-center gap-1 bg-white p-0.5 rounded border border-slate-300 shadow-2xs">' +
                '<button type="button" onclick="window.purchasesController.changeItemQty(' + idx + ', -1)" class="w-5 h-5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-xs cursor-pointer">-</button>' +
                '<input type="number" step="' + step + '" value="' + item.qty + '" onchange="window.purchasesController.updateItemQty(' + idx + ', this.value)" class="w-12 text-center font-mono font-bold text-xs text-slate-900 border-0 p-0 focus:ring-0">' +
                '<button type="button" onclick="window.purchasesController.changeItemQty(' + idx + ', 1)" class="w-5 h-5 rounded bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center font-bold text-xs cursor-pointer">+</button>' +
              '</div>' +
            '</td>' +
            '<td class="text-center font-bold text-slate-700 py-1 px-1 text-[11px]">' + (isWeight ? 'كجم' : 'قطعة') + '</td>' +
            '<td class="text-center py-1 px-1">' +
              '<input type="number" step="0.25" value="' + item.cost_price.toFixed(2) + '" onchange="window.purchasesController.updateItemCost(' + idx + ', this.value)" class="w-20 text-center font-mono font-black text-xs text-blue-900 bg-sky-50 border border-sky-300 rounded py-0.5">' +
            '</td>' +
            '<td class="text-center py-1 px-1">' +
              '<input type="number" step="0.25" value="' + (item.selling_price || 0).toFixed(2) + '" onchange="window.purchasesController.updateItemSellingPrice(' + idx + ', this.value)" class="w-20 text-center font-mono font-bold text-xs text-slate-800 bg-white border border-slate-300 rounded py-0.5">' +
            '</td>' +
            '<td class="text-center font-mono font-black text-xs text-blue-950 py-1 px-1 whitespace-nowrap">' + lineTotal + '</td>' +
            '<td class="text-center py-1 px-1">' +
              '<button type="button" onclick="window.purchasesController.removeItem(' + idx + ')" class="p-1 rounded text-rose-500 hover:text-rose-700 hover:bg-rose-50 transition cursor-pointer" title="حذف هذا الصنف">' +
                '<i data-lucide="trash-2" class="w-3.5 h-3.5"></i>' +
              '</button>' +
            '</td>' +
          '</tr>';
        }).join('');
      }
    }

    this.updateTotalsDisplay();
    if (window.lucide) window.lucide.createIcons();
  }

  /* ==================== CUSTOM PRODUCT MODAL (LEGACY ALIASES) ==================== */
  openNewCustomProductModal(prefilledBarcode = '') {
    this.openProductEntryModal(null, prefilledBarcode);
  }

  closeNewCustomProductModal() {
    this.closeItemEntryModal();
  }

  saveNewCustomProductToCart() {
    this.confirmModalItemToCart();
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

          '<div class="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-gray-100 dark:border-gray-700">' +
            '<div class="text-left">' +
              '<div class="text-xs sm:text-sm font-black text-indigo-600 dark:text-indigo-400 font-mono">' + total.toFixed(2) + ' ج.م</div>' +
              (pm === 'آجل' ? '<span class="text-[10px] text-gray-400">المدفوع: ' + paid.toFixed(2) + ' ج.م</span>' : '') +
            '</div>' +
            '<button type="button" onclick="window.purchasesController?.openEditPurchaseModal(' + inv.id + ')" class="px-2.5 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 font-bold text-xs flex items-center gap-1 transition cursor-pointer shrink-0 shadow-2xs" title="تعديل الفاتورة وتصحيح المبالغ">' +
              '<i data-lucide="edit-3" class="w-3.5 h-3.5"></i>' +
              '<span>تعديل ✏️</span>' +
            '</button>' +
          '</div>' +
        '</div>';
    }).join('');

    if (window.lucide) window.lucide.createIcons();
  }

  /* ==================== EDIT PURCHASE INVOICE MODAL METHODS ==================== */
  async openEditPurchaseModal(purchaseId) {
    if (!purchaseId) return;
    window.app?.showLoading(true, 'جاري جلب تفاصيل الفاتورة...');
    try {
      const res = await window.api.getPurchaseDetails(purchaseId);
      window.app?.showLoading(false);
      if (!res || !res.success || !res.purchase) {
        window.app?.showToast(res?.error || 'تعذر جلب تفاصيل الفاتورة', 'error');
        return;
      }

      const p = res.purchase;
      this.currentEditingPurchase = p;

      document.getElementById('epm-purchase-id').value = p.id;
      document.getElementById('epm-inv-num').value = p.invoice_number || '';
      
      // Suppliers select
      const supSelect = document.getElementById('epm-supplier-select');
      if (supSelect) {
        const suppliers = window.expensesController?.suppliers || [];
        supSelect.innerHTML = suppliers.map(s => 
          `<option value="${s.id}" ${s.id == p.supplier_id ? 'selected' : ''}>${s.name} (الرصيد: ${parseFloat(s.balance || 0).toFixed(2)} ج.م)</option>`
        ).join('');
        if (p.supplier_id && !suppliers.some(s => s.id == p.supplier_id)) {
          supSelect.innerHTML = `<option value="${p.supplier_id}" selected>${p.supplier_name || 'المورد'}</option>` + supSelect.innerHTML;
        }
      }

      // Date
      const dateInp = document.getElementById('epm-date');
      if (dateInp) {
        const dStr = p.date || p.created_at || '';
        dateInp.value = dStr ? dStr.replace(' ', 'T').slice(0, 16) : '';
      }

      // Payment Method
      const pmSelect = document.getElementById('epm-pm');
      if (pmSelect) pmSelect.value = p.payment_method || 'نقدي';

      // Financials
      document.getElementById('epm-total').value = parseFloat(p.total_amount || 0).toFixed(2);
      document.getElementById('epm-paid').value = parseFloat(p.paid_amount || 0).toFixed(2);
      document.getElementById('epm-discount').value = parseFloat(p.discount || 0).toFixed(2);
      document.getElementById('epm-notes').value = p.notes || '';

      this.calcEditRemaining();

      // Show items summary if present
      const itemsBox = document.getElementById('epm-items-box');
      const itemsList = document.getElementById('epm-items-list');
      if (itemsBox && itemsList) {
        if (res.items && res.items.length > 0) {
          itemsBox.classList.remove('hidden');
          itemsList.innerHTML = res.items.map(it => 
            `<div class="flex items-center justify-between py-1 border-b border-gray-100 dark:border-gray-800 last:border-0 font-mono text-[11px]">
               <span class="font-bold text-gray-800 dark:text-gray-200">${it.name}</span>
               <span class="text-gray-500">${it.qty} ${it.unit || ''} × ${parseFloat(it.cost_price || 0).toFixed(2)} = <b class="text-amber-600 dark:text-amber-400">${parseFloat(it.total_cost || 0).toFixed(2)} ج.م</b></span>
             </div>`
          ).join('');
        } else {
          itemsBox.classList.add('hidden');
          itemsList.innerHTML = '';
        }
      }

      const modal = document.getElementById('edit-purchase-modal');
      if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
      }

      if (window.lucide) window.lucide.createIcons();
    } catch (err) {
      window.app?.showLoading(false);
      window.app?.showToast('خطأ أثناء جلب الفاتورة: ' + err.message, 'error');
    }
  }

  closeEditPurchaseModal() {
    const modal = document.getElementById('edit-purchase-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
    this.currentEditingPurchase = null;
  }

  calcEditRemaining() {
    const total = parseFloat(document.getElementById('epm-total')?.value || 0);
    const paid = parseFloat(document.getElementById('epm-paid')?.value || 0);
    const disc = parseFloat(document.getElementById('epm-discount')?.value || 0);
    const rem = Math.max(0, total - paid - disc);
    const remBadge = document.getElementById('epm-rem-badge');
    if (remBadge) {
      remBadge.textContent = `${rem.toFixed(2)} ج.م`;
      if (rem > 0) {
        remBadge.className = 'px-2.5 py-1 rounded-lg bg-amber-600 text-white font-mono font-black text-sm';
      } else {
        remBadge.className = 'px-2.5 py-1 rounded-lg bg-emerald-600 text-white font-mono font-black text-sm';
      }
    }
  }

  onEditPmChanged() {
    const pm = document.getElementById('epm-pm')?.value || 'نقدي';
    const totalInput = document.getElementById('epm-total');
    const paidInput = document.getElementById('epm-paid');
    if (totalInput && paidInput) {
      const tot = parseFloat(totalInput.value || 0);
      if (pm === 'نقدي') {
        paidInput.value = tot.toFixed(2);
      } else {
        paidInput.value = '0.00';
      }
    }
    this.calcEditRemaining();
  }

  async submitEditPurchase() {
    const pid = parseInt(document.getElementById('epm-purchase-id')?.value || 0, 10);
    if (!pid) return;

    const invNum = document.getElementById('epm-inv-num')?.value.trim() || '';
    const supSelect = document.getElementById('epm-supplier-select');
    const supId = supSelect ? parseInt(supSelect.value, 10) : 0;
    const supName = supSelect && supSelect.selectedIndex > -1 ? supSelect.options[supSelect.selectedIndex].text.split('(')[0].trim() : '';
    const pm = document.getElementById('epm-pm')?.value || 'نقدي';
    const total = parseFloat(document.getElementById('epm-total')?.value || 0);
    const paid = parseFloat(document.getElementById('epm-paid')?.value || 0);
    const discount = parseFloat(document.getElementById('epm-discount')?.value || 0);
    const date = document.getElementById('epm-date')?.value || '';
    const notes = document.getElementById('epm-notes')?.value.trim() || '';

    if (total <= 0) {
      window.app?.showToast('يرجى إدخال إجمالي صحيح للفاتورة أكبر من الصفر', 'warning');
      return;
    }

    window.app?.showLoading(true, 'جاري حفظ تعديلات الفاتورة وتحديث الحسابات...');
    try {
      const payload = {
        purchase_id: pid,
        invoice_number: invNum,
        supplier_id: supId,
        supplier_name: supName,
        payment_method: pm,
        total_amount: total,
        paid_amount: paid,
        discount: discount,
        date: date ? date.replace('T', ' ') : '',
        notes: notes
      };

      const res = await window.api.editPurchase(payload);
      window.app?.showLoading(false);
      if (res && res.success) {
        window.app?.showToast(res.message || 'تم حفظ تعديل الفاتورة بنجاح ✓', 'success');
        this.closeEditPurchaseModal();
        await this.loadPurchasesHistory();

        // Refresh suppliers list and statement if open
        if (window.expensesController) {
          try {
            if (typeof window.expensesController.loadSuppliers === 'function') {
              await window.expensesController.loadSuppliers();
            }
            if (window.expensesController.activeSupplierId) {
              await window.expensesController.openSupplierLedger(window.expensesController.activeSupplierId, window.expensesController.activeSupplierName);
            }
          } catch (e) {
            console.warn('Expenses reload error:', e);
          }
        }
      } else {
        window.app?.showToast(res?.error || 'تعذر تعديل الفاتورة', 'error');
      }
    } catch (err) {
      window.app?.showLoading(false);
      window.app?.showToast('خطأ: ' + err.message, 'error');
    }
  }

  async submitDeletePurchase() {
    const pid = parseInt(document.getElementById('epm-purchase-id')?.value || 0, 10);
    if (!pid) return;

    if (!confirm('⚠️ هل أنت متأكد من رغبتك في حذف فاتورة المشتريات هذه نهائياً؟\nسيتم رد الرصيد وتصحيح كشف حساب المورد تلقائياً.')) {
      return;
    }

    window.app?.showLoading(true, 'جاري حذف الفاتورة ورد الحسابات...');
    try {
      const res = await window.api.deletePurchase(pid);
      window.app?.showLoading(false);
      if (res && res.success) {
        window.app?.showToast(res.message || 'تم حذف الفاتورة بنجاح', 'success');
        this.closeEditPurchaseModal();
        await this.loadPurchasesHistory();
        if (window.expensesController) {
          try {
            if (typeof window.expensesController.loadSuppliers === 'function') {
              await window.expensesController.loadSuppliers();
            }
            if (window.expensesController.activeSupplierId) {
              await window.expensesController.openSupplierLedger(window.expensesController.activeSupplierId, window.expensesController.activeSupplierName);
            }
          } catch (e) {
            console.warn('Expenses reload error:', e);
          }
        }
      } else {
        window.app?.showToast(res?.error || 'تعذر حذف الفاتورة', 'error');
      }
    } catch (err) {
      window.app?.showLoading(false);
      window.app?.showToast('خطأ: ' + err.message, 'error');
    }
  }

  // ==================== DREAMSOFT PURCHASES REPLICA ACTIONS ====================
  removeLastItem() {
    if (!this.items || this.items.length === 0) {
      window.app?.showToast('لا توجد أصناف لحذفها من فاتورة المشتريات', 'info');
      return;
    }
    const removed = this.items.pop();
    this.saveToStorage();
    this.renderCart();
    this.updateTotalsDisplay();
    window.app?.showToast('تم حذف (' + (removed.name || '') + ') من الفاتورة', 'info');
  }

  handleDsBarcodeInput(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      const val = (e.target.value || '').trim();
      if (!val) return;
      e.target.value = '';
      this.addProductByBarcode(val);
    }
  }

  setDsPaymentMethod(method) {
    this.setPaymentMethod(method);
    const indicator = document.getElementById('ds-purch-status-indicator');
    if (indicator) {
      indicator.textContent = (method === 'كاش') ? 'فاتورة مشتريات : نقدي' : 'فاتورة مشتريات : آجل';
    }
    this.updateTotalsDisplay();
  }

  onDsSupplierSelected(supId) {
    this.selectedSupplierId = supId;
    const select = document.getElementById('purch-supplier-select');
    if (select) select.value = supId;
    this.onSupplierSelected(supId);
    const sup = this.suppliers.find(s => s.id == supId);
    const badge = document.getElementById('ds-purch-supplier-bal-badge');
    if (badge) {
      const bal = parseFloat(sup?.balance || 0);
      badge.textContent = 'الرصيد: ' + bal.toFixed(2) + ' ج.م';
      badge.className = 'px-2 py-0.5 rounded bg-white border border-sky-300 font-mono font-bold text-xs ' + (bal > 0 ? 'text-rose-700' : 'text-emerald-700');
    }
  }

  onDsPaidInput(val) {
    this.paidAmount = parseFloat(val || 0);
    this.updateTotalsDisplay();
  }

  onDsDiscountInput(val) {
    this.discountAmount = parseFloat(val || 0);
    this.updateTotalsDisplay();
  }

  setDsNotes(notes) {
    this.invoiceNotes = notes;
    const txt = document.getElementById('purch-notes');
    if (txt) txt.value = notes;
  }

  setDsRefNum(ref) {
    this.supplierInvoiceNumber = ref;
  }

  openSelectedSupplierStatement() {
    if (!this.selectedSupplierId) {
      window.app?.showToast('يرجى اختيار المورد أولاً لعرض كشف حسابه', 'warning');
      return;
    }
    if (typeof window.openSupplierStatement === 'function') {
      window.openSupplierStatement(this.selectedSupplierId);
    }
  }

}

window.purchasesController = new PurchasesController();
