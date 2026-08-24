/**
 * Syrian Home POS - Cart & Checkout Engine
 * Manages items, discounts, totals, cash change calculation, and thermal receipt generation.
 */

class POSCart {
  constructor() {
    this.items = [];
    this.discountAmount = 0;
    this.taxRate = 0; // Default 0% or customizable
    this.paymentMethod = 'cash'; // 'cash', 'instapay', 'card'
    this.customerName = 'عميل نقدي';
    this.customerPhone = '';
    this.cashierNotes = 'كاشير 1';
    this.paidAmount = 0;
    this.instapayRef = '';
  }

  /* ==================== CART ITEM ACTIONS ==================== */
  addItem(product, qty = 1) {
    if (!product) return;

    const existingIndex = this.items.findIndex(i => i.product_id === product.id);

    if (existingIndex > -1) {
      this.items[existingIndex].qty += qty;
    } else {
      this.items.push({
        product_id: product.id,
        name: product.name,
        qty: qty,
        price: parseFloat(product.price || 0),
        cost: parseFloat(product.cost || 0),
        barcode: product.barcode || '',
        local_code: product.local_code || '',
        unit: product.unit || 'قطعة'
      });
    }

    this.render();
    window.app?.showToast(`تمت إضافة: ${product.name}`, 'success');
  }

  async addProductByBarcode(barcode) {
    const cleanCode = barcode.trim();
    if (!cleanCode) return;

    // 1. Check local cached products first for instant response
    let product = window.app?.products?.find(p => 
      (p.barcode && p.barcode.trim() === cleanCode) || 
      (p.local_code && p.local_code.trim().toLowerCase() === cleanCode.toLowerCase())
    );

    if (product) {
      this.addItem(product, 1);
      return;
    }

    // 2. Otherwise query API directly
    try {
      window.app?.showLoading(true, 'جاري البحث عن الصنف...');
      const res = await window.api.lookupBarcode(cleanCode);
      window.app?.showLoading(false);

      if (res && res.success && res.product) {
        this.addItem(res.product, 1);
      } else {
        window.posScanner?.playErrorTone();
        window.app?.showToast(`لم يتم العثور على صنف بالباركود: ${cleanCode}`, 'error');
      }
    } catch (e) {
      window.app?.showLoading(false);
      window.posScanner?.playErrorTone();
      window.app?.showToast('خطأ في الاتصال بالخادم للبحث عن الباركود', 'error');
    }
  }

  updateQty(productId, newQty) {
    const item = this.items.find(i => i.product_id === productId);
    if (!item) return;

    if (newQty <= 0) {
      this.removeItem(productId);
    } else {
      item.qty = parseFloat(newQty);
      this.render();
    }
  }

  removeItem(productId) {
    this.items = this.items.filter(i => i.product_id !== productId);
    this.render();
  }

  clearCart() {
    this.items = [];
    this.discountAmount = 0;
    this.paidAmount = 0;
    this.instapayRef = '';
    this.vodafoneRef = '';
    this.render();
  }

  /* ==================== CALCULATIONS ==================== */
  getSubtotal() {
    return this.items.reduce((sum, item) => sum + (item.price * item.qty), 0);
  }

  getTotal() {
    const subtotal = this.getSubtotal();
    const afterDiscount = Math.max(0, subtotal - this.discountAmount);
    const tax = afterDiscount * (this.taxRate / 100);
    return afterDiscount + tax;
  }

  getTotalItemsCount() {
    return this.items.reduce((sum, item) => sum + item.qty, 0);
  }

  getChange() {
    if (this.paymentMethod !== 'cash') return 0;
    const total = this.getTotal();
    const paid = parseFloat(this.paidAmount || 0);
    return Math.max(0, paid - total);
  }

  /* ==================== CHECKOUT & SUBMIT SALE ==================== */
  async checkout() {
    if (this.items.length === 0) {
      window.app?.showToast('سلة المشتريات فارغة!', 'error');
      return;
    }

    const total = this.getTotal();

    const paymentMethodLabel = this.paymentMethod === 'vodafone_cash' ? 'فودافون كاش' : 
                               this.paymentMethod === 'instapay' ? 'انستا باي' : 
                               this.paymentMethod === 'card' ? 'فيزا' : 'كاش';

    // Prepare Sale Payload according to Syrian Home REST API
    const payload = {
      customer_name: this.customerName || 'عميل نقدي',
      customer_phone: this.customerPhone || '',
      payment_method: paymentMethodLabel,
      instapay_ref: this.paymentMethod === 'instapay' ? this.instapayRef : (this.paymentMethod === 'vodafone_cash' ? this.vodafoneRef : ''),
      total: total,
      discount: this.discountAmount,
      tax: this.taxRate,
      cashier_notes: this.cashierNotes,
      paid_amount: this.paidAmount,
      items: this.items.map(item => ({
        product_id: item.product_id,
        name: item.name,
        qty: item.qty,
        price: item.price,
        cost: item.cost,
        barcode: item.barcode
      }))
    };

    try {
      window.app?.showLoading(true, 'جاري حفظ الفاتورة وتحديث المخزون...');
      const result = await window.api.pushSale(payload);
      window.app?.showLoading(false);

      if (result && result.success) {
        window.posScanner?.playSuccessBeep();
        
        // Prepare Completed Invoice Data for Printing
        const invoiceData = {
          order_id: result.order_id || Date.now(),
          invoice_barcode: result.invoice_barcode || `INV-${result.order_id}`,
          created_at: new Date().toLocaleString('ar-EG'),
          cashier: this.cashierNotes,
          customer_name: this.customerName,
          payment_method: paymentMethodLabel,
          items: [...this.items],
          subtotal: this.getSubtotal(),
          discount: this.discountAmount,
          total: total,
          paid_amount: this.paidAmount || total,
          change: this.getChange()
        };

        // Reset Cart
        this.clearCart();

        // Close Checkout modal if open
        document.getElementById('checkout-modal')?.classList.add('hidden');

        // Show Success Thermal Receipt Modal
        this.showReceiptModal(invoiceData);
        window.app?.showToast('تم حفظ الفاتورة بنجاح ✅', 'success');

        // Update local reports and trigger product reload in background
        window.app?.refreshProductsQuietly();
      } else {
        throw new Error(result.message || 'فشل حفظ الفاتورة على السيرفر');
      }
    } catch (err) {
      window.app?.showLoading(false);
      window.posScanner?.playErrorTone();
      window.app?.showToast(`خطأ أثناء الحفظ: ${err.message}`, 'error');
    }
  }

  /* ==================== THERMAL RECEIPT RENDERING ==================== */
  showReceiptModal(inv) {
    const modal = document.getElementById('receipt-modal');
    const container = document.getElementById('receipt-view-container');
    const printArea = document.getElementById('receipt-print-area');
    if (!modal || !container) return;

    const pmDisplay = (inv.payment_method === 'فودافون كاش' || inv.payment_method === 'vodafone_cash') ? '📱 فودافون كاش' :
                      (inv.payment_method === 'انستا باي' || inv.payment_method === 'instapay') ? '📱 إنستاباي' :
                      (inv.payment_method === 'فيزا' || inv.payment_method === 'card') ? '💳 فيزا/بطاقة' : '💵 نقدي (كاش)';

    const store = window.settingsController ? window.settingsController.getStoreInfo() : {
      store_name: 'سوبر ماركت المنزل السوري',
      store_phone: '01000000000',
      store_phone2: '',
      store_address: '',
      receipt_sub: 'أشهى المنتجات والمنتجات السورية الأصلية',
      receipt_footer: 'شكراً لزيارتكم سوبر ماركت المنزل السوري • يُرجى الاحتفاظ بالفاتورة للاسترجاع'
    };

    const phonesText = [store.store_phone, store.store_phone2].filter(Boolean).join(' • ');

    const receiptHTML = `
      <div class="receipt-header">
        <div class="receipt-store-title">${store.store_name}</div>
        ${store.receipt_sub ? `<div class="receipt-store-sub">${store.receipt_sub}</div>` : ''}
        ${phonesText ? `<div class="receipt-store-sub">📞 هاتف: ${phonesText}</div>` : ''}
        ${store.store_address ? `<div class="receipt-store-sub">📍 ${store.store_address}</div>` : ''}
      </div>

      <div class="receipt-meta">
        <div class="receipt-meta-row">
          <span>رقم الفاتورة: <b>#${inv.order_id}</b></span>
          <span>${inv.invoice_barcode}</span>
        </div>
        <div class="receipt-meta-row">
          <span>التاريخ: ${inv.created_at}</span>
          <span>الكاشير: ${inv.cashier}</span>
        </div>
        <div class="receipt-meta-row">
          <span>العميل: ${inv.customer_name}</span>
          <span>طريقة الدفع: ${pmDisplay}</span>
        </div>
      </div>

      <table class="receipt-items-table">
        <thead>
          <tr>
            <th style="width: 50%;">الصنف</th>
            <th style="width: 15%; text-align: center;">الكمية</th>
            <th style="width: 15%; text-align: center;">السعر</th>
            <th style="width: 20%; text-align: left;">الإجمالي</th>
          </tr>
        </thead>
        <tbody>
          ${inv.items.map(item => `
            <tr>
              <td>${item.name}</td>
              <td style="text-align: center;">${item.qty}</td>
              <td style="text-align: center;">${item.price.toFixed(2)}</td>
              <td style="text-align: left;">${(item.price * item.qty).toFixed(2)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div class="receipt-totals">
        <div class="receipt-total-row">
          <span>المجموع الفرعي:</span>
          <span>${inv.subtotal.toFixed(2)} ج.م</span>
        </div>
        ${inv.discount > 0 ? `
          <div class="receipt-total-row" style="color: red;">
            <span>الخصم:</span>
            <span>-${inv.discount.toFixed(2)} ج.م</span>
          </div>
        ` : ''}
        <div class="receipt-total-row receipt-grand-total">
          <span>صافي الإجمالي:</span>
          <span>${inv.total.toFixed(2)} ج.م</span>
        </div>
        ${inv.payment_method === 'cash' ? `
          <div class="receipt-total-row" style="font-size: 11px; margin-top: 4px;">
            <span>المبلغ المدفوع:</span>
            <span>${parseFloat(inv.paid_amount).toFixed(2)} ج.م</span>
          </div>
          <div class="receipt-total-row" style="font-size: 11px; font-weight: bold;">
            <span>المتبقي للعميل (الباقي):</span>
            <span>${inv.change.toFixed(2)} ج.م</span>
          </div>
        ` : ''}
      </div>

      <div class="receipt-barcode-container">
        <svg id="receipt-svg-barcode"></svg>
      </div>

      <div class="receipt-footer">
        <p>${store.receipt_footer || 'شكراً لزيارتكم • يُرجى الاحتفاظ بالفاتورة للاسترجاع'}</p>
        <p style="font-size: 9px; margin-top: 2px;">الأسعار شاملة ضريبة القيمة المضافة</p>
      </div>
    `;

    container.innerHTML = receiptHTML;
    if (printArea) printArea.innerHTML = receiptHTML;

    // Render Barcode via JsBarcode
    try {
      if (window.JsBarcode) {
        window.JsBarcode("#receipt-svg-barcode", inv.invoice_barcode, {
          format: "CODE128",
          width: 1.5,
          height: 35,
          displayValue: true,
          fontSize: 10
        });
      }
    } catch (e) {}

    modal.classList.remove('hidden');
  }

  /* ==================== RENDER CART TO DOM ==================== */
  render() {
    const listContainer = document.getElementById('cart-items-list');
    const emptyNotice = document.getElementById('cart-empty-notice');
    const subtotalEl = document.getElementById('cart-subtotal-val');
    const discountEl = document.getElementById('cart-discount-val');
    const totalEl = document.getElementById('cart-total-val');
    const mobileTotalEl = document.getElementById('mobile-cart-total-val');
    const badgeEl = document.getElementById('cart-badge-count');
    const mobileBadgeEl = document.getElementById('mobile-cart-badge');

    const total = this.getTotal();
    const count = this.getTotalItemsCount();

    const mobileListContainer = document.getElementById('mobile-cart-drawer-list');
    const fabBadge = document.getElementById('fab-cart-count');
    const fabTotal = document.getElementById('fab-cart-total');

    const centerCartBadge = document.getElementById('center-cart-count');

    // Update Totals
    if (subtotalEl) subtotalEl.textContent = `${this.getSubtotal().toFixed(2)} ج.م`;
    if (discountEl) discountEl.textContent = `-${this.discountAmount.toFixed(2)} ج.م`;
    if (totalEl) totalEl.textContent = `${total.toFixed(2)} ج.م`;
    if (mobileTotalEl) mobileTotalEl.textContent = `${total.toFixed(2)} ج.م`;
    if (badgeEl) badgeEl.textContent = count;
    if (mobileBadgeEl) mobileBadgeEl.textContent = count;
    if (fabBadge) fabBadge.textContent = count;
    if (fabTotal) fabTotal.textContent = `${total.toFixed(2)} ج.م`;
    if (centerCartBadge) centerCartBadge.textContent = count;

    const itemsHTML = this.items.map(item => `
      <div class="p-3 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm flex items-center justify-between gap-3 cart-item-highlight">
        <div class="flex-1 min-w-0">
          <h4 class="text-xs sm:text-sm font-bold text-gray-900 dark:text-white truncate">${item.name}</h4>
          <div class="flex items-center gap-2 mt-1 text-[11px] text-gray-500 dark:text-gray-400">
            <span class="font-bold text-indigo-600 dark:text-indigo-400">${item.price.toFixed(2)} ج.م</span>
            ${item.local_code ? `<span class="px-1.5 py-0.2 bg-gray-100 dark:bg-gray-700 rounded text-[10px]">${item.local_code}</span>` : ''}
          </div>
        </div>

        <!-- Quantity Control -->
        <div class="flex items-center gap-1.5 bg-gray-100 dark:bg-gray-700 rounded-xl p-1 shrink-0">
          <button onclick="window.cart.updateQty(${item.product_id}, ${item.qty - 1})" class="w-6 h-6 rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 flex items-center justify-center font-bold text-sm shadow-xs hover:bg-gray-200">-</button>
          <span class="w-7 text-center font-bold text-xs text-gray-900 dark:text-white">${item.qty}</span>
          <button onclick="window.cart.updateQty(${item.product_id}, ${item.qty + 1})" class="w-6 h-6 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-sm shadow-xs hover:bg-indigo-700">+</button>
        </div>

        <!-- Item Total & Delete -->
        <div class="text-left shrink-0 min-w-[60px]">
          <div class="text-xs sm:text-sm font-black text-gray-900 dark:text-white">${(item.price * item.qty).toFixed(2)}</div>
          <button onclick="window.cart.removeItem(${item.product_id})" class="text-[10px] text-rose-500 hover:underline">حذف</button>
        </div>
      </div>
    `).join('');

    if (this.items.length === 0) {
      if (emptyNotice) emptyNotice.classList.remove('hidden');
      if (listContainer) listContainer.innerHTML = '';
      if (mobileListContainer) mobileListContainer.innerHTML = '<p class="text-xs text-gray-400 text-center py-6">السلة فارغة</p>';
      return;
    }

    if (emptyNotice) emptyNotice.classList.add('hidden');
    if (listContainer) listContainer.innerHTML = itemsHTML;
    if (mobileListContainer) mobileListContainer.innerHTML = itemsHTML;
  }
}

window.cart = new POSCart();
