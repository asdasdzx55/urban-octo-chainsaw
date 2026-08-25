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

    const isWeight = product.unit_type === 'weight' || product.unit === 'كجم' || product.is_weight || (typeof qty === 'number' && qty % 1 !== 0);
    const unitType = isWeight ? 'weight' : 'piece';
    const unitLabel = isWeight ? 'كجم' : 'قطعة';

    const existingIndex = this.items.findIndex(i => i.product_id === product.id);
    const validQty = parseFloat(parseFloat(qty).toFixed(3));

    if (existingIndex > -1) {
      this.items[existingIndex].qty = parseFloat((this.items[existingIndex].qty + validQty).toFixed(3));
    } else {
      this.items.push({
        product_id: product.id,
        name: product.name,
        qty: validQty,
        price: parseFloat(product.price || 0),
        cost: parseFloat(product.cost || 0),
        barcode: product.barcode || '',
        local_code: product.local_code || '',
        unit_type: unitType,
        unit: unitLabel
      });
    }

    this.render();
    const qtyDisplay = isWeight ? `${validQty.toFixed(3)} ${unitLabel}` : `${validQty} ${unitLabel}`;
    window.app?.showToast(`تمت إضافة: ${product.name} (${qtyDisplay})`, 'success');
  }

  async addProductByBarcode(barcode) {
    const rawCode = String(barcode || '').trim();
    if (!rawCode) return;

    // Parse barcode according to Syrian Home Scale & Retail rules
    const parsed = window.BarcodeParser ? window.BarcodeParser.parse(rawCode) : {
      isValid: true,
      isScale: /^20\d{10,11}$/.test(rawCode.replace(/\D/g, '')),
      originalBarcode: rawCode,
      itemCode: rawCode.slice(2, 7),
      itemCodeNumeric: String(parseInt(rawCode.slice(2, 7), 10) || rawCode.slice(2, 7)),
      quantity: parseFloat((parseInt(rawCode.slice(7, 12), 10) / 1000).toFixed(3)) || 1,
      weight: parseFloat((parseInt(rawCode.slice(7, 12), 10) / 1000).toFixed(3)) || null,
      unitType: 'weight',
      unit: 'كجم'
    };

    // 1. Check local cached products first for instant response
    let product = window.app?.products?.find(p => {
      if (window.BarcodeParser) {
        return window.BarcodeParser.matchesProduct(parsed, p);
      }
      const pBarcode = String(p.barcode || '').trim();
      const pLocal = String(p.local_code || '').trim().toLowerCase();
      const code = String(parsed.itemCode || '').toLowerCase();
      return (pBarcode && pBarcode === code) || (pLocal && pLocal === code);
    });

    if (product) {
      const productToAdd = parsed.isScale ? {
        ...product,
        unit_type: 'weight',
        unit: 'كجم',
        is_weight: true
      } : product;

      this.addItem(productToAdd, parsed.quantity);
      return;
    }

    // 2. Otherwise query API directly
    try {
      window.app?.showLoading(true, 'جاري البحث عن الصنف في السيرفر...');
      let res = null;

      if (parsed.isScale) {
        // Query by extracted 5-digit item code first
        res = await window.api.lookupBarcode(parsed.itemCode);
        if (!res || !res.success || !res.product) {
          res = await window.api.lookupBarcode(parsed.originalBarcode);
        }
      } else {
        res = await window.api.lookupBarcode(parsed.originalBarcode);
      }

      window.app?.showLoading(false);

      if (res && res.success && res.product) {
        const productToAdd = parsed.isScale ? {
          ...res.product,
          unit_type: 'weight',
          unit: 'كجم',
          is_weight: true
        } : res.product;

        this.addItem(productToAdd, parsed.quantity);
      } else {
        window.posScanner?.playErrorTone();
        const errorMsg = parsed.isScale
          ? `لم يتم العثور على صنف ميزان بكود: ${parsed.itemCode} (وزن: ${parsed.weight} كجم)`
          : `لم يتم العثور على صنف بالباركود: ${parsed.originalBarcode}`;
        window.app?.showToast(errorMsg, 'error');
      }
    } catch (e) {
      window.app?.showLoading(false);
      window.posScanner?.playErrorTone();
      const notFoundMsg = parsed.isScale
        ? `الصنف غير مسجل بكود ميزان: ${parsed.itemCode}`
        : `الباركود غير مسجل: ${parsed.originalBarcode}`;
      window.app?.showToast(notFoundMsg, 'error');
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

        // Save to local completed orders cache for instant returns & offline lookup
        try {
          const completed = JSON.parse(localStorage.getItem('pos_completed_orders') || '[]');
          completed.unshift(invoiceData);
          if (completed.length > 200) completed.pop();
          localStorage.setItem('pos_completed_orders', JSON.stringify(completed));
        } catch(e) {}

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
            <th style="width: 45%;">الصنف</th>
            <th style="width: 20%; text-align: center;">الكمية / الوزن</th>
            <th style="width: 15%; text-align: center;">السعر</th>
            <th style="width: 20%; text-align: left;">الإجمالي</th>
          </tr>
        </thead>
        <tbody>
          ${inv.items.map(item => {
            const isWeight = item.unit_type === 'weight' || item.unit === 'كجم';
            const qtyStr = isWeight ? `${parseFloat(item.qty).toFixed(3)} كجم` : `${item.qty}`;
            return `
            <tr>
              <td>${item.name}</td>
              <td style="text-align: center; font-family: monospace;">${qtyStr}</td>
              <td style="text-align: center;">${item.price.toFixed(2)}</td>
              <td style="text-align: left; font-weight: bold;">${(item.price * item.qty).toFixed(2)}</td>
            </tr>
          `;
          }).join('')}
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

    const itemsHTML = this.items.map(item => {
      const isWeight = item.unit_type === 'weight' || item.unit === 'كجم';
      const step = isWeight ? 0.25 : 1;
      const prevQty = isWeight ? parseFloat((item.qty - step).toFixed(3)) : item.qty - 1;
      const nextQty = isWeight ? parseFloat((item.qty + step).toFixed(3)) : item.qty + 1;

      return `
        <div class="p-2.5 sm:p-3 bg-gray-50 dark:bg-gray-700/50 rounded-2xl border border-gray-200 dark:border-gray-600/70 shadow-xs flex items-center justify-between gap-2.5 cart-item-highlight">
          <div class="flex-1 min-w-0">
            <h4 class="text-xs sm:text-sm font-bold text-gray-900 dark:text-white truncate">${item.name}</h4>
            <div class="flex items-center gap-2 mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
              <span class="font-bold text-indigo-600 dark:text-indigo-400 font-mono">${item.price.toFixed(2)} ج.م${isWeight ? '/كجم' : ''}</span>
              ${item.local_code ? `<span class="px-1.5 py-0.2 bg-gray-200 dark:bg-gray-600 rounded text-[9px] font-mono font-bold">${item.local_code}</span>` : ''}
              ${isWeight ? `<span class="px-1.5 py-0.2 bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 rounded text-[9px] font-bold">⚖️ وزن</span>` : ''}
            </div>
          </div>

          <!-- Quantity Control -->
          <div class="flex items-center gap-1 bg-white dark:bg-gray-800 rounded-xl p-1 shrink-0 border border-gray-200 dark:border-gray-600">
            <button onclick="window.cart.updateQty(${item.product_id}, ${prevQty})" class="w-6 h-6 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 flex items-center justify-center font-bold text-xs shadow-xs hover:bg-gray-200">-</button>
            <span onclick="${isWeight ? `window.app.openWeightModalForItem(${item.product_id})` : ''}" class="px-1 text-center font-bold text-xs text-gray-900 dark:text-white font-mono ${isWeight ? 'cursor-pointer hover:text-indigo-600 hover:underline' : ''}">
              ${isWeight ? parseFloat(item.qty).toFixed(3) + ' كجم' : item.qty}
            </span>
            <button onclick="window.cart.updateQty(${item.product_id}, ${nextQty})" class="w-6 h-6 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-xs shadow-xs hover:bg-indigo-700">+</button>
          </div>

          <!-- Item Total & Delete -->
          <div class="text-left shrink-0 min-w-[55px]">
            <div class="text-xs sm:text-sm font-black text-indigo-600 dark:text-indigo-400 font-mono">${(item.price * item.qty).toFixed(2)}</div>
            <button onclick="window.cart.removeItem(${item.product_id})" class="text-[10px] text-rose-500 font-bold hover:underline">حذف ✕</button>
          </div>
        </div>
      `;
    }).join('');

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
