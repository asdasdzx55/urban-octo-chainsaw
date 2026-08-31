/**
 * Syrian Home POS - Inventory & Price Manager Controller (شاشة جرد المخزون وتعديل الأسعار والتصنيفات)
 * Supports:
 * 1. Main Categories (التصنيفات الأساسية) and Sub Categories (التصنيفات الفرعية)
 * 2. Barcode Scanning / Automatic Barcode Generator
 * 3. Piece vs Weight Unit Types
 * 4. Real-time Inventory & Price Sync with Server
 */

const SUPERMARKET_TAXONOMY = {
  'أجبان وألبان': [
    'أجبان سورية وبلدية',
    'جبنة حلوم وموزاريلا',
    'أجبان صفراء ورومي وشيدر',
    'حليب ولبن ورايب',
    'زبدة وقشطة وكريمة'
  ],
  'مكسرات وتسالي وحلويات': [
    'مكسرات نيئة ومحمصة',
    'حلويات شرقية ومعمول',
    'حلاوة وطحينة',
    'شيكولاتة وبسكويت وسكاكر',
    'لب وفول سوداني ومقرمشات'
  ],
  'عطارة وتوابل وزيوت': [
    'بهارات وتوابل سورية',
    'زيت زيتون وزيوت نباتية',
    'أعشاب وزهورات ومشروبات ساخنة',
    'بقوليات وحبوب',
    'مخللات وزيتون وورق عنب'
  ],
  'مخبوزات ومعجنات': [
    'خبز سوري وتورتيلا',
    'مناقيش وفطائر وسمبوسك',
    'كعك وشابورة وبقسماط'
  ],
  'لحوم ودواجن ومصنعات': [
    'لانشون وبسطرمة وروستو',
    'سجق وسوسيس ومصنعات',
    'لحوم ودواجن مجمدة'
  ],
  'مشروبات وعصائر ومياه': [
    'مياه معدنية وفوارة',
    'عصائر طبيعية ومشروبات غازية',
    'شاي وقهوة وسريع التحضير'
  ],
  'معلبات ومواد غذائية': [
    'تونة وسردين وأسماك',
    'صلصة ومعجون طماطم',
    'مكرونة وأرز وشعرية',
    'سمن وزيوت طهي',
    'معلبات جاهزة وفول'
  ],
  'منظفات وعناية منزلية': [
    'مسحوق غسيل ومنعم أقمشة',
    'صابون سائل وسوائل تنظيف',
    'معطرات ومطهرات',
    'مناديل وورقيات'
  ],
  'عام': [
    'متنوع'
  ]
};

class InventoryController {
  constructor() {
    this.selectedProduct = null;
    this.isScanningToInputField = false;
    this.initCategoryDatalists();
  }

  initCategoryDatalists() {
    // Populate Main Categories Datalist
    const mainList = document.getElementById('list-main-categories');
    if (mainList) {
      const allMains = Object.keys(SUPERMARKET_TAXONOMY);
      mainList.innerHTML = allMains.map(cat => `<option value="${cat}"></option>`).join('');
    }
  }

  onMainCategoryChanged() {
    const mainCat = document.getElementById('inv-prod-category')?.value.trim() || '';
    const subList = document.getElementById('list-sub-categories');
    if (!subList) return;

    const subSuggestions = SUPERMARKET_TAXONOMY[mainCat] || [];
    subList.innerHTML = subSuggestions.map(sub => `<option value="${sub}"></option>`).join('');
  }

  async searchProductForAudit(query) {
    const q = (query || document.getElementById('inv-search-input')?.value || '').trim();
    if (!q) {
      window.app?.showToast('يرجى إدخال اسم الصنف أو مسح الباركود', 'error');
      return;
    }

    const parsed = window.BarcodeParser ? window.BarcodeParser.parse(q) : {
      isScale: /^20\d{11}$/.test(q),
      itemCode: /^20\d{11}$/.test(q) ? q.slice(2, 7) : q,
      originalBarcode: q
    };

    // 1. Search in local cached products first
    let product = window.app?.products?.find(p => {
      if (window.BarcodeParser) {
        return window.BarcodeParser.matchesProduct(parsed, p) || (p.name && p.name.toLowerCase().includes(q.toLowerCase()));
      }
      return (p.barcode && p.barcode.trim() === parsed.itemCode) ||
             (p.local_code && p.local_code.trim().toLowerCase() === parsed.itemCode.toLowerCase()) ||
             (p.name && p.name.toLowerCase().includes(q.toLowerCase()));
    });

    if (product) {
      this.loadProductToForm(product);
      return;
    }

    // 2. Otherwise query API
    try {
      window.app?.showLoading(true, 'جاري البحث عن الصنف في السيرفر...');
      let res = null;
      if (parsed.isScale) {
        res = await window.api.lookupBarcode(parsed.itemCode);
        if (!res || !res.success || !res.product) {
          res = await window.api.lookupBarcode(parsed.originalBarcode);
        }
      } else {
        res = await window.api.lookupBarcode(q);
      }
      window.app?.showLoading(false);

      if (res && res.success && res.product) {
        this.loadProductToForm(res.product);
      } else {
        window.posScanner?.playErrorTone();
        window.app?.showToast(parsed.isScale ? `لم يتم العثور على صنف ميزان بكود: ${parsed.itemCode}` : 'لم يتم العثور على هذا الصنف', 'error');
      }
    } catch (e) {
      window.app?.showLoading(false);
      window.app?.showToast('خطأ أثناء البحث عن الصنف', 'error');
    }
  }

  openNewProductForm() {
    this.selectedProduct = { isNew: true };
    const formBox = document.getElementById('inv-product-edit-form');
    const formTitle = document.getElementById('inv-form-title');
    if (!formBox) return;

    if (formTitle) {
      formTitle.innerHTML = `<i data-lucide="plus-circle" class="w-4 h-4 text-emerald-600"></i> إضافة صنف جديد مع التصنيف الأساسي والفرعي`;
    }

    const deleteBtn = document.getElementById('btn-delete-inv-prod');
    if (deleteBtn) deleteBtn.classList.add('hidden');

    // Reset fields with sensible defaults
    document.getElementById('inv-prod-name').value = '';
    document.getElementById('inv-prod-category').value = 'أجبان وألبان';
    this.onMainCategoryChanged();
    if (document.getElementById('inv-prod-subcategory')) {
      document.getElementById('inv-prod-subcategory').value = 'أجبان سورية وبلدية';
    }
    if (document.getElementById('inv-prod-unittype')) document.getElementById('inv-prod-unittype').value = 'piece';
    document.getElementById('inv-prod-price').value = '0.00';
    document.getElementById('inv-prod-cost').value = '0.00';
    document.getElementById('inv-prod-stock').value = '10';
    document.getElementById('inv-prod-barcode').value = '';
    document.getElementById('inv-prod-localcode').value = '';

    formBox.classList.remove('hidden');
    formBox.style.display = 'flex';
    formBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    document.getElementById('inv-prod-name')?.focus();

    if (window.lucide) window.lucide.createIcons();
  }

  closeForm() {
    const formBox = document.getElementById('inv-product-edit-form');
    if (formBox) {
      formBox.classList.add('hidden');
      formBox.style.display = 'none';
    }
  }

  scanBarcodeWithCamera() {
    this.isScanningToInputField = true;
    window.posScanner?.openCameraModal();
  }

  setScannedBarcode(barcode) {
    this.isScanningToInputField = false;
    const barcodeInput = document.getElementById('inv-prod-barcode');
    if (barcodeInput) {
      barcodeInput.value = barcode.trim();
      window.app?.showToast(`تم مسح الباركود: ${barcode} ✅`, 'success');
      barcodeInput.focus();
    }
  }

  generateRandomBarcode() {
    let code = '622' + Math.floor(100000000 + Math.random() * 900000000);
    const barcodeInput = document.getElementById('inv-prod-barcode');
    if (barcodeInput) {
      barcodeInput.value = code;
      window.app?.showToast(`تم توليد باركود تلقائي: ${code}`, 'info');
    }
  }

  loadProductToForm(p) {
    this.selectedProduct = p;
    const formBox = document.getElementById('inv-product-edit-form');
    const formTitle = document.getElementById('inv-form-title');
    const deleteBtn = document.getElementById('btn-delete-inv-prod');
    if (!formBox) return;

    if (formTitle) {
      formTitle.innerHTML = `<i data-lucide="edit-3" class="w-4 h-4 text-indigo-600"></i> تعديل بيانات الصنف (${p.name})`;
    }

    if (deleteBtn) {
      deleteBtn.classList.remove('hidden');
    }

    formBox.classList.remove('hidden');
    formBox.style.display = 'flex';

    // Fill form fields
    document.getElementById('inv-prod-name').value = p.name || '';
    document.getElementById('inv-prod-category').value = p.category || 'عام';
    this.onMainCategoryChanged();
    
    if (document.getElementById('inv-prod-subcategory')) {
      document.getElementById('inv-prod-subcategory').value = p.sub_category || p.subcategory || '';
    }

    if (document.getElementById('inv-prod-unittype')) {
      document.getElementById('inv-prod-unittype').value = p.unit_type || (p.unit === 'كجم' ? 'weight' : 'piece');
    }
    document.getElementById('inv-prod-price').value = parseFloat(p.price || 0).toFixed(2);
    document.getElementById('inv-prod-cost').value = parseFloat(p.cost || 0).toFixed(2);
    document.getElementById('inv-prod-stock').value = parseFloat(p.stock || 0);
    document.getElementById('inv-prod-barcode').value = p.barcode || '';
    document.getElementById('inv-prod-localcode').value = p.local_code || '';

    formBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    window.posScanner?.playSuccessBeep();
    if (window.lucide) window.lucide.createIcons();
  }

  async deleteSelectedProduct() {
    if (!this.selectedProduct || this.selectedProduct.isNew) return;

    const prodName = this.selectedProduct.name || 'الصنف المحدد';
    if (!confirm(`هل أنت متأكد من حذف الصنف (${prodName}) نهائياً من النظام والسيرفر؟`)) {
      return;
    }

    const prodId = this.selectedProduct.id;
    const barcode = this.selectedProduct.barcode;

    try {
      window.app?.showLoading(true, 'جاري حذف الصنف من السيرفر...');
      try {
        await window.api.deleteProduct(prodId, barcode);
      } catch (e) {
        console.warn('Server delete error, removing locally:', e);
      }
      window.app?.showLoading(false);

      // Remove from local catalog
      window.app.products = window.app.products.filter(p => p.id !== prodId && (!barcode || p.barcode !== barcode));
      localStorage.setItem('syrian_home_products', JSON.stringify(window.app.products));

      // Refresh UI
      window.app.extractCategories();
      window.app.renderCategories();
      window.app.renderProducts();

      this.closeForm();
      window.posScanner?.playSuccessBeep();
      window.app?.showToast(`تم حذف الصنف (${prodName}) بنجاح 🗑️`, 'info');
    } catch (err) {
      window.app?.showLoading(false);
      window.app?.showToast(`خطأ أثناء الحذف: ${err.message}`, 'error');
    }
  }

  adjustStock(delta) {
    const input = document.getElementById('inv-prod-stock');
    if (input) {
      let val = parseFloat(input.value || 0);
      input.value = Math.max(0, val + delta);
    }
  }

  async saveProductChanges() {
    if (!this.selectedProduct) return;

    const name = document.getElementById('inv-prod-name')?.value.trim();
    const category = document.getElementById('inv-prod-category')?.value.trim() || 'عام';
    const subCategory = document.getElementById('inv-prod-subcategory')?.value.trim() || '';
    const unitType = document.getElementById('inv-prod-unittype')?.value || 'piece';
    const price = parseFloat(document.getElementById('inv-prod-price')?.value || 0);
    const cost = parseFloat(document.getElementById('inv-prod-cost')?.value || 0);
    const stock = parseFloat(document.getElementById('inv-prod-stock')?.value || 0);
    const barcode = document.getElementById('inv-prod-barcode')?.value.trim() || '';
    const localCode = document.getElementById('inv-prod-localcode')?.value.trim() || '';

    if (!name) {
      window.app?.showToast('اسم المنتج مطلوب!', 'error');
      return;
    }

    const payload = {
      id: this.selectedProduct.id,
      name: name,
      category: category,
      sub_category: subCategory,
      subcategory: subCategory,
      unit_type: unitType,
      unit: unitType === 'weight' ? 'كجم' : 'قطعة',
      price: price,
      cost: cost,
      stock: stock,
      barcode: barcode,
      local_code: localCode,
      all_barcodes: barcode
    };

    // Save unit type mapping in persistent local store so it NEVER reverts on refresh
    window.syncManager?.setProductUnitType(this.selectedProduct.id, unitType);
    window.syncManager?.setProductUnitType({ id: this.selectedProduct.id, local_code: localCode, barcode: barcode }, unitType);

    const isWeight = unitType === 'weight';
    const normalizedProd = {
      ...this.selectedProduct,
      ...payload,
      unit_type: unitType,
      unit: isWeight ? 'كجم' : 'قطعة',
      is_weight: isWeight
    };

    try {
      window.app?.showLoading(true, 'جاري حفظ التعديلات في السيرفر وتحديث الكتالوج...');
      const res = await window.api.syncProduct(payload);
      window.app?.showLoading(false);

      if (res && res.success) {
        window.posScanner?.playSuccessBeep();
        const successMsg = this.selectedProduct.isNew ? `تمت إضافة الصنف (${name}) بنجاح ويمكن بيعه الآن ✅` : `تم تحديث الصنف (${name}) والمخزون بنجاح ✅`;
        window.app?.showToast(successMsg, 'success');

        const newId = res.product_id || (this.selectedProduct.id || Date.now());
        const fullProd = { ...normalizedProd, id: newId };

        // Update or insert into local products list
        const idx = window.app.products.findIndex(p => (this.selectedProduct.id && p.id === this.selectedProduct.id) || (barcode && p.barcode === barcode));
        if (idx > -1) {
          window.app.products[idx] = { ...window.app.products[idx], ...fullProd };
        } else {
          window.app.products.unshift(fullProd);
        }

        // Save & Refresh Catalog
        localStorage.setItem('syrian_home_products', JSON.stringify(window.app.products));
        window.app.extractCategories();
        window.app.renderCategories();
        window.app.renderProducts();

        // Hide form
        document.getElementById('inv-product-edit-form')?.classList.add('hidden');
        if (document.getElementById('inv-search-input')) {
          document.getElementById('inv-search-input').value = '';
        }
      } else {
        throw new Error(res.error || res.message || 'فشل حفظ التعديلات');
      }
    } catch (err) {
      window.app?.showLoading(false);
      
      // Offline fallback: save locally and queue for background sync
      window.syncManager?.queueProduct(payload);
      window.posScanner?.playSuccessBeep();
      window.app?.showToast(`تم حفظ الصنف (${name}) محلياً (وضع أوفلاين) وستتم مزامنته عند عودة الإنترنت 📦`, 'warning');

      const offlineId = this.selectedProduct.id || Date.now();
      const fullProd = { ...normalizedProd, id: offlineId };

      const idx = window.app.products.findIndex(p => (this.selectedProduct.id && p.id === this.selectedProduct.id) || (barcode && p.barcode === barcode));
      if (idx > -1) {
        window.app.products[idx] = { ...window.app.products[idx], ...fullProd };
      } else {
        window.app.products.unshift(fullProd);
      }

      localStorage.setItem('syrian_home_products', JSON.stringify(window.app.products));
      window.app.extractCategories();
      window.app.renderCategories();
      window.app.renderProducts();

      document.getElementById('inv-product-edit-form')?.classList.add('hidden');
      if (document.getElementById('inv-search-input')) {
        document.getElementById('inv-search-input').value = '';
      }
    }
  }
}

window.inventoryController = new InventoryController();
