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

    // 1. Search in local cached products first
    let product = window.app?.products?.find(p => 
      (p.barcode && p.barcode.trim() === q) ||
      (p.local_code && p.local_code.trim().toLowerCase() === q.toLowerCase()) ||
      (p.name && p.name.toLowerCase().includes(q.toLowerCase()))
    );

    if (product) {
      this.loadProductToForm(product);
      return;
    }

    // 2. Otherwise query API
    try {
      window.app?.showLoading(true, 'جاري البحث عن الصنف في السيرفر...');
      const res = await window.api.lookupBarcode(q);
      window.app?.showLoading(false);

      if (res && res.success && res.product) {
        this.loadProductToForm(res.product);
      } else {
        window.posScanner?.playErrorTone();
        window.app?.showToast('لم يتم العثور على هذا الصنف', 'error');
      }
    } catch (e) {
      window.app?.showLoading(false);
      window.app?.showToast('خطأ أثناء البحث عن الصنف', 'error');
    }
  }

  loadProductToForm(p) {
    this.selectedProduct = p;
    const formBox = document.getElementById('inv-product-edit-form');
    if (!formBox) return;

    formBox.classList.remove('hidden');

    // Fill form fields
    document.getElementById('inv-prod-name').value = p.name || '';
    document.getElementById('inv-prod-category').value = p.category || 'عام';
    document.getElementById('inv-prod-price').value = parseFloat(p.price || 0).toFixed(2);
    document.getElementById('inv-prod-cost').value = parseFloat(p.cost || 0).toFixed(2);
    document.getElementById('inv-prod-stock').value = parseFloat(p.stock || 0);
    document.getElementById('inv-prod-barcode').value = p.barcode || '';
    document.getElementById('inv-prod-localcode').value = p.local_code || '';

    // Scroll to form smoothly
    formBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    window.posScanner?.playSuccessBeep();
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
      price: price,
      cost: cost,
      stock: stock,
      barcode: barcode,
      local_code: localCode,
      all_barcodes: barcode
    };

    try {
      window.app?.showLoading(true, 'جاري حفظ التعديلات وتحديث المخزون والأسعار...');
      const res = await window.api.syncProduct(payload);
      window.app?.showLoading(false);

      if (res && res.success) {
        window.posScanner?.playSuccessBeep();
        window.app?.showToast(`تم تحديث الصنف (${name}) والمخزون بنجاح ✅`, 'success');

        // Update local product cache in background
        const idx = window.app.products.findIndex(p => p.id === this.selectedProduct.id);
        if (idx > -1) {
          window.app.products[idx] = { ...window.app.products[idx], ...payload };
          localStorage.setItem('syrian_home_products', JSON.stringify(window.app.products));
          window.app.renderProducts();
        }

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
