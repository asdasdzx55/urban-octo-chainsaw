/**
 * Syrian Home POS - Inventory & Price Manager Controller (شاشة جرد المخزون وتعديل الأسعار)
 * Allows scanning product barcode and updating stock, price, cost, and name on the server.
 */

class InventoryController {
  constructor() {
    this.selectedProduct = null;
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
      formTitle.innerHTML = `<i data-lucide="plus-circle" class="w-4 h-4 text-emerald-600"></i> إضافة صنف جديد للمتجر والمخزن`;
    }

    // Reset fields with sensible defaults
    document.getElementById('inv-prod-name').value = '';
    document.getElementById('inv-prod-category').value = 'عام';
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
    // Generate 12-digit random barcode starting with 622 (Egypt/Regional standard)
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
    if (!formBox) return;

    if (formTitle) {
      formTitle.innerHTML = `<i data-lucide="edit-3" class="w-4 h-4 text-indigo-600"></i> تعديل بيانات الصنف والمخزون`;
    }
    formBox.classList.remove('hidden');
    formBox.style.display = 'flex';

    // Fill form fields
    document.getElementById('inv-prod-name').value = p.name || '';
    document.getElementById('inv-prod-category').value = p.category || 'عام';
    if (document.getElementById('inv-prod-unittype')) {
      document.getElementById('inv-prod-unittype').value = p.unit_type || (p.unit === 'كجم' ? 'weight' : 'piece');
    }
    document.getElementById('inv-prod-price').value = parseFloat(p.price || 0).toFixed(2);
    document.getElementById('inv-prod-cost').value = parseFloat(p.cost || 0).toFixed(2);
    document.getElementById('inv-prod-stock').value = parseFloat(p.stock || 0);
    document.getElementById('inv-prod-barcode').value = p.barcode || '';
    document.getElementById('inv-prod-localcode').value = p.local_code || '';

    // Scroll to form smoothly
    formBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    window.posScanner?.playSuccessBeep();
    if (window.lucide) window.lucide.createIcons();
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
      name: name,
      category: category,
      unit_type: unitType,
      unit: unitType === 'weight' ? 'كجم' : 'قطعة',
      price: price,
      cost: cost,
      stock: stock,
      barcode: barcode,
      local_code: localCode,
      all_barcodes: barcode
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
        const fullProd = { id: newId, ...payload };

        // Update or insert into local products list
        const idx = window.app.products.findIndex(p => (this.selectedProduct.id && p.id === this.selectedProduct.id) || (barcode && p.barcode === barcode));
        if (idx > -1) {
          window.app.products[idx] = { ...window.app.products[idx], ...payload };
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
      window.posScanner?.playErrorTone();
      window.app?.showToast(`خطأ في الحفظ: ${err.message}`, 'error');
    }
  }
}

window.inventoryController = new InventoryController();
