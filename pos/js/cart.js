/**
 * Syrian Home POS - Cart & Checkout Engine
 * Manages items, discounts, totals, cash change calculation, and thermal receipt generation.
 */

class POSCart {
  constructor() {
    this.items = [];
    this.discountAmount = 0;
    this.taxRate = 0; // Default 0% or customizable
    this.paymentMethod = 'cash'; // 'cash', 'instapay', 'vodafone_cash', 'card'
    this.orderType = 'hall'; // 'hall' (استلام بالمحل) or 'delivery' (توصيل منزلي)
    this.deliveryPayMode = 'cod'; // 'cod' (تحصيل عند الاستلام - آجل) or 'prepaid' (مدفوعة مسبقاً)
    this.deliveryPrepaidMethod = 'instapay'; // 'instapay', 'vodafone_cash', 'card', 'cash_store'
    this.deliveryPrepaidRef = '';
    this.customerName = 'عميل نقدي';
    this.customerPhone = '';
    this.customerAddress = '';
    this.deliveryPerson = '';
    this.deliveryFee = 0;
    this.cashierNotes = 'كاشير 1';
    this.paidAmount = 0;
    this.instapayRef = '';
    this.vodafoneRef = '';
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
    this.orderType = 'hall';
    this.deliveryPayMode = 'cod';
    this.deliveryPrepaidMethod = 'instapay';
    this.deliveryPrepaidRef = '';
    this.deliveryFee = 0;
    this.deliveryPerson = '';
    this.customerAddress = '';
    this.customerPhone = '';
    this.customerName = 'عميل نقدي';
    this.render();
  }

  setDiscount(amount) {
    this.discountAmount = Math.max(0, parseFloat(amount || 0));
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
    const delivery = this.orderType === 'delivery' ? parseFloat(this.deliveryFee || 0) : 0;
    return afterDiscount + tax + delivery;
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

    const isDelivery = this.orderType === 'delivery';
    const deliveryFee = isDelivery ? parseFloat(this.deliveryFee || 0) : 0;

    let paymentMethodLabel = 'كاش';
    let paidAmount = total;
    let amountToCollect = 0;
    let isCredit = 0;

    if (isDelivery) {
      if (this.deliveryPayMode === 'cod') {
        paymentMethodLabel = 'تحصيل عند الاستلام (آجل)';
        paidAmount = 0;
        amountToCollect = total;
        isCredit = 1;
      } else {
        const subLabel = this.deliveryPrepaidMethod === 'instapay' ? 'إنستاباي' : 
                         this.deliveryPrepaidMethod === 'vodafone_cash' ? 'فودافون كاش' : 
                         this.deliveryPrepaidMethod === 'card' ? 'فيزا' : 'كاش مقدماً';
        paymentMethodLabel = `مدفوع مسبقاً (${subLabel})`;
        paidAmount = total;
        amountToCollect = 0;
        isCredit = 0;
      }
    } else {
      paymentMethodLabel = this.paymentMethod === 'vodafone_cash' ? 'فودافون كاش' : 
                           this.paymentMethod === 'instapay' ? 'انستا باي' : 
                           this.paymentMethod === 'card' ? 'فيزا' : 'كاش';
      paidAmount = parseFloat(this.paidAmount || total);
      amountToCollect = 0;
    }

    // Prepare Sale Payload according to Syrian Home REST API & Delivery Spec
    const payload = {
      local_sale_id: Date.now(),
      customer_name: (this.customerName || (isDelivery ? 'عميل دليفري' : 'عميل نقدي')).trim(),
      customer_phone: (this.customerPhone || '').trim(),
      phone: (this.customerPhone || '').trim(),
      address: (this.customerAddress || '').trim(),
      delivery_person: (this.deliveryPerson || '').trim(),
      delivery_fee: deliveryFee,
      order_type: isDelivery ? 'delivery' : 'hall',
      delivery_pay_mode: isDelivery ? (this.deliveryPayMode || 'cod') : 'standard',
      delivery_prepaid_method: isDelivery ? (this.deliveryPrepaidMethod || 'instapay') : '',
      delivery_prepaid_ref: isDelivery ? (this.deliveryPrepaidRef || '') : '',
      payment_method: paymentMethodLabel,
      instapay_ref: isDelivery ? (this.deliveryPayMode === 'prepaid' && this.deliveryPrepaidMethod === 'instapay' ? this.deliveryPrepaidRef : '') : (this.paymentMethod === 'instapay' ? this.instapayRef : ''),
      vodafone_ref: isDelivery ? (this.deliveryPayMode === 'prepaid' && this.deliveryPrepaidMethod === 'vodafone_cash' ? this.deliveryPrepaidRef : '') : (this.paymentMethod === 'vodafone_cash' ? this.vodafoneRef : ''),
      total: total,
      total_amount: total,
      discount: this.discountAmount,
      tax: this.taxRate,
      cashier_notes: this.cashierNotes,
      paid_amount: paidAmount,
      amount_to_collect: amountToCollect,
      is_credit: isCredit,
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
          customer_name: this.customerName || (isDelivery ? 'عميل دليفري' : 'عميل نقدي'),
          customer_phone: this.customerPhone || '',
          phone: this.customerPhone || '',
          address: this.customerAddress || '',
          delivery_person: this.deliveryPerson || '',
          delivery_fee: deliveryFee,
          order_type: isDelivery ? 'delivery' : 'hall',
          delivery_pay_mode: isDelivery ? (this.deliveryPayMode || 'cod') : 'standard',
          payment_method: paymentMethodLabel,
          items: [...this.items],
          subtotal: this.getSubtotal(),
          discount: this.discountAmount,
          total: total,
          paid_amount: paidAmount,
          amount_to_collect: amountToCollect,
          is_credit: isCredit,
          change: isDelivery ? 0 : this.getChange()
        };

        // Save to local completed orders cache for instant returns & offline lookup
        try {
          const completed = JSON.parse(localStorage.getItem('pos_completed_orders') || '[]');
          completed.unshift(invoiceData);
          if (completed.length > 200) completed.pop();
          localStorage.setItem('pos_completed_orders', JSON.stringify(completed));
        } catch(e) {}

        // Deduct local stock
        this.deductLocalStock(this.items);

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
        throw new Error(result.message || 'فشل الاتصال بالسيرفر');
      }
    } catch (err) {
      window.app?.showLoading(false);

      // ==================== OFFLINE CHECKOUT FALLBACK ====================
      const offlineOrderId = `OFF-${Date.now().toString().slice(-6)}`;
      const invoiceData = {
        order_id: offlineOrderId,
        invoice_barcode: `INV-${offlineOrderId}`,
        created_at: new Date().toLocaleString('ar-EG'),
        cashier: this.cashierNotes,
        customer_name: this.customerName || (isDelivery ? 'عميل دليفري' : 'عميل نقدي'),
        customer_phone: this.customerPhone || '',
        phone: this.customerPhone || '',
        address: this.customerAddress || '',
        delivery_person: this.deliveryPerson || '',
        delivery_fee: deliveryFee,
        order_type: isDelivery ? 'delivery' : 'hall',
        delivery_pay_mode: isDelivery ? (this.deliveryPayMode || 'cod') : 'standard',
        payment_method: paymentMethodLabel,
        items: [...this.items],
        subtotal: this.getSubtotal(),
        discount: this.discountAmount,
        total: total,
        paid_amount: paidAmount,
        amount_to_collect: amountToCollect,
        is_credit: isCredit,
        change: isDelivery ? 0 : this.getChange(),
        is_offline: true
      };

      // 1. Queue sale in Sync Manager for automatic cloud sync
      window.syncManager?.queueSale(payload, invoiceData);

      // 2. Save to local completed orders
      try {
        const completed = JSON.parse(localStorage.getItem('pos_completed_orders') || '[]');
        completed.unshift(invoiceData);
        if (completed.length > 200) completed.pop();
        localStorage.setItem('pos_completed_orders', JSON.stringify(completed));
      } catch(e) {}

      // 3. Deduct stock locally
      this.deductLocalStock(this.items);

      // 4. Reset cart and show receipt
      this.clearCart();
      document.getElementById('checkout-modal')?.classList.add('hidden');
      window.posScanner?.playSuccessBeep();
      this.showReceiptModal(invoiceData);
      window.app?.showToast('تم حفظ الفاتورة محلياً وطباعتها (وضع أوفلاين) وستتم مزامنتها تلقائياً 📦✅', 'warning');
    }
  }

  deductLocalStock(soldItems) {
    if (!Array.isArray(soldItems) || !window.app?.products) return;
    soldItems.forEach(sold => {
      const p = window.app.products.find(prod => prod.id === sold.product_id);
      if (p) {
        const curStock = parseFloat(p.stock || 0);
        const qty = parseFloat(sold.qty || 1);
        p.stock = Math.max(0, parseFloat((curStock - qty).toFixed(3)));
      }
    });
    try {
      localStorage.setItem('syrian_home_products', JSON.stringify(window.app.products));
      window.app.renderProducts();
    } catch(e) {}
  }

  /* ==================== THERMAL RECEIPT RENDERING ==================== */
  showReceiptModal(inv) {
    const modal = document.getElementById('receipt-modal');
    const container = document.getElementById('receipt-view-container');
    const printArea = document.getElementById('receipt-print-area');
    if (!modal || !container) return;

    this.lastInvoice = inv;

    let badgeClass = 'receipt-badge-cash';
    let pmDisplay = '💵 نقدي (كاش)';
    if (inv.payment_method === 'فودافون كاش' || inv.payment_method === 'vodafone_cash') {
      badgeClass = 'receipt-badge-vodafone';
      pmDisplay = '📱 فودافون كاش';
    } else if (inv.payment_method === 'انستا باي' || inv.payment_method === 'instapay') {
      badgeClass = 'receipt-badge-instapay';
      pmDisplay = '⚡ إنستاباي';
    } else if (inv.payment_method === 'فيزا' || inv.payment_method === 'card') {
      badgeClass = 'receipt-badge-card';
      pmDisplay = '💳 بطاقة بنكية';
    }

    const store = window.settingsController ? window.settingsController.getStoreInfo() : {
      store_name: 'سوبر ماركت المنزل السوري',
      store_phone: '01000000000',
      store_phone2: '',
      store_address: 'القاهرة - مصر',
      receipt_sub: 'أشهى المأكولات والمنتجات السورية الأصلية',
      receipt_footer: 'شكراً لزيارتكم • يُرجى الاحتفاظ بالفاتورة للاستبدال والاسترجاع خلال 14 يوماً'
    };

    const phones = [store.store_phone, store.store_phone2].filter(Boolean);
    const phonesText = phones.join(' • ');

    const totalQtyCount = inv.items.reduce((acc, itm) => acc + (parseFloat(itm.qty) || 1), 0);

    const receiptHTML = `
      <div class="thermal-receipt">
        
        <!-- Header -->
        <div class="receipt-header">
          <div class="receipt-store-logo">🏪</div>
          <h2 class="receipt-store-title">${store.store_name}</h2>
          ${store.receipt_sub ? `<div class="receipt-store-sub">${store.receipt_sub}</div>` : ''}
          ${phonesText ? `<div class="receipt-store-info"><span>📞 هاتف:</span> <b style="font-family: monospace;">${phonesText}</b></div>` : ''}
          ${store.store_address ? `<div class="receipt-store-info"><span>📍</span> <span>${store.store_address}</span></div>` : ''}
        </div>

        <!-- Invoice Info Metadata Box -->
        <div class="receipt-meta">
          <div class="receipt-meta-row">
            <span class="receipt-meta-label">رقم الفاتورة:</span>
            <span class="receipt-meta-val" style="font-family: monospace; font-size: 13px;">#${inv.order_id}</span>
          </div>
          <div class="receipt-meta-row">
            <span class="receipt-meta-label">التاريخ والوقت:</span>
            <span class="receipt-meta-val" style="font-family: monospace; font-size: 10.5px;">${inv.created_at}</span>
          </div>
          <div class="receipt-meta-row">
            <span class="receipt-meta-label">الكاشير / المنفذ:</span>
            <span class="receipt-meta-val">${inv.cashier || 'كاشير 1'}</span>
          </div>
          <div class="receipt-meta-row">
            <span class="receipt-meta-label">العميل:</span>
            <span class="receipt-meta-val">${inv.customer_name || 'عميل نقدي'}</span>
          </div>
          <div class="receipt-meta-row" style="margin-top: 4px; padding-top: 3px; border-top: 1px dotted #e5e7eb;">
            <span class="receipt-meta-label">طريقة الدفع:</span>
            <span class="receipt-badge ${badgeClass}">${pmDisplay}</span>
          </div>

          ${(inv.order_type === 'delivery' || inv.delivery_fee > 0 || inv.address) ? `
            <div style="background:#f0fdf4; border:1px dashed #86efac; border-radius:8px; padding:6px; margin-top:6px; font-size:11px;">
              <div style="font-weight:bold; color:#15803d; text-align:center; margin-bottom:3px;">🛵 فاتورة توصيل منزلي (دليفري)</div>
              <div class="receipt-meta-row" style="margin:2px 0;">
                <span class="receipt-meta-label">الهاتف:</span>
                <span class="receipt-meta-val" style="font-family:monospace;">${inv.customer_phone || inv.phone || '-'}</span>
              </div>
              <div class="receipt-meta-row" style="margin:2px 0;">
                <span class="receipt-meta-label">الطيار:</span>
                <span class="receipt-meta-val">${inv.delivery_person || 'غير محدد'}</span>
              </div>
              ${inv.address ? `
                <div style="margin-top:3px; color:#374151;">
                  <span class="receipt-meta-label">العنوان:</span>
                  <span class="receipt-meta-val" style="font-weight:bold;">${inv.address}</span>
                </div>
              ` : ''}
              <div style="margin-top:4px; padding-top:4px; border-top:1px dashed #bbf7d0; text-align:center;">
                ${(inv.delivery_pay_mode === 'prepaid' || (inv.paid_amount >= inv.total && inv.amount_to_collect === 0)) ? `
                  <span style="font-weight:bold; color:#15803d;">✅ مدفوعة مسبقاً (${inv.payment_method}) - لا يُحصل أي مبلغ</span>
                ` : `
                  <span style="font-weight:bold; color:#b45309;">⏳ تحصيل عند الاستلام: <b>${parseFloat(inv.total).toFixed(2)} ج.م</b></span>
                `}
              </div>
            </div>
          ` : ''}
        </div>

        <!-- Items Table -->
        <table class="receipt-items-table">
          <thead>
            <tr>
              <th style="width: 46%; text-align: right;">الصنف</th>
              <th style="width: 20%; text-align: center;">الكمية</th>
              <th style="width: 16%; text-align: center;">السعر</th>
              <th style="width: 18%; text-align: left;">المجموع</th>
            </tr>
          </thead>
          <tbody>
            ${inv.items.map(item => {
              const isWeight = item.unit_type === 'weight' || item.unit === 'كجم';
              const qtyDisplay = isWeight ? `${parseFloat(item.qty).toFixed(3)} كجم` : `${item.qty}`;
              const lineTotal = (parseFloat(item.price) * parseFloat(item.qty)).toFixed(2);
              return `
              <tr>
                <td>
                  <div class="receipt-item-name">${item.name}</div>
                  <div class="receipt-item-details">${isWeight ? '⚖️ ميزان بالوزن' : '📦 بالقطعة'}</div>
                </td>
                <td style="text-align: center; font-family: monospace; font-weight: 700;">${qtyDisplay}</td>
                <td style="text-align: center; font-family: monospace;">${parseFloat(item.price).toFixed(2)}</td>
                <td style="text-align: left; font-family: monospace; font-weight: 800; color: #111827;">${lineTotal}</td>
              </tr>
            `;
            }).join('')}
          </tbody>
        </table>

        <!-- Totals Section -->
        <div class="receipt-totals">
          <div class="receipt-total-row">
            <span>المجموع الفرعي:</span>
            <span style="font-family: monospace; font-weight: 700;">${parseFloat(inv.subtotal).toFixed(2)} ج.م</span>
          </div>

          ${parseFloat(inv.discount) > 0 ? `
            <div class="receipt-total-row discount">
              <span>الخصم الممنوح:</span>
              <span style="font-family: monospace;">-${parseFloat(inv.discount).toFixed(2)} ج.م</span>
            </div>
          ` : ''}

          ${(inv.delivery_fee && parseFloat(inv.delivery_fee) > 0) ? `
            <div class="receipt-total-row">
              <span>خدمة التوصيل (دليفري):</span>
              <span style="font-family: monospace;">+${parseFloat(inv.delivery_fee).toFixed(2)} ج.م</span>
            </div>
          ` : ''}

          <div class="receipt-total-row receipt-grand-total">
            <span>الإجمالي الصافي المطلوب:</span>
            <span class="total-val">${parseFloat(inv.total).toFixed(2)} ج.م</span>
          </div>

          ${inv.order_type === 'delivery' ? `
            <div class="receipt-cash-breakdown">
              <div class="receipt-total-row" style="font-weight:bold; font-size:12px; color:${(inv.delivery_pay_mode === 'prepaid' || inv.amount_to_collect === 0) ? '#15803d' : '#b45309'};">
                <span>المطلوب تحصيله من العميل:</span>
                <span style="font-family:monospace; font-size:13px;">${(inv.delivery_pay_mode === 'prepaid' || inv.amount_to_collect === 0) ? '0.00 ج.م (خالص)' : parseFloat(inv.total).toFixed(2) + ' ج.م'}</span>
              </div>
            </div>
          ` : `
            ${(inv.payment_method === 'cash' || inv.payment_method === 'نقدي' || !inv.payment_method) ? `
              <div class="receipt-cash-breakdown">
                <div class="receipt-total-row" style="margin-bottom: 2px;">
                  <span>المبلغ المدفوع من العميل:</span>
                  <span style="font-family: monospace;">${parseFloat(inv.paid_amount || inv.total).toFixed(2)} ج.م</span>
                </div>
                <div class="receipt-total-row" style="font-weight: 800; color: #059669;">
                  <span>المتبقي للعميل (الباقي):</span>
                  <span style="font-family: monospace; font-size: 13px;">${parseFloat(inv.change || 0).toFixed(2)} ج.م</span>
                </div>
              </div>
            ` : ''}
          `}

          <div style="font-size: 10px; color: #6b7280; text-align: center; margin-top: 6px; padding-top: 4px; border-top: 1px dotted #e5e7eb;">
            إجمالي عدد الأصناف: <b>${inv.items.length}</b> صنف (<b>${totalQtyCount % 1 === 0 ? totalQtyCount : totalQtyCount.toFixed(3)}</b> كمية)
          </div>
        </div>

        <!-- Barcode -->
        <div class="receipt-barcode-container">
          <svg id="receipt-svg-barcode"></svg>
        </div>

        <!-- Footer -->
        <div class="receipt-footer">
          <p><b>${store.receipt_footer || 'شكراً لزيارتكم • يُرجى الاحتفاظ بالفاتورة للاسترجاع'}</b></p>
          <p class="tax-note">الأسعار شاملة ضريبة القيمة المضافة • نظام كاشير المنزل السوري 2026</p>
        </div>

      </div>
    `;

    container.innerHTML = receiptHTML;
    if (printArea) printArea.innerHTML = receiptHTML;

    // Render Barcode via JsBarcode
    try {
      if (window.JsBarcode) {
        window.JsBarcode("#receipt-svg-barcode", inv.invoice_barcode || `INV-${inv.order_id}`, {
          format: "CODE128",
          width: 1.6,
          height: 38,
          displayValue: true,
          fontSize: 11,
          font: "monospace",
          margin: 4
        });
      }
    } catch (e) {
      console.warn('Barcode render notice:', e);
    }

    modal.classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();
  }

  shareReceiptWhatsApp() {
    if (!this.lastInvoice) return;
    const inv = this.lastInvoice;
    const store = window.settingsController ? window.settingsController.getStoreInfo() : { store_name: 'سوبر ماركت المنزل السوري' };
    
    let text = `🧾 *فاتورة شراء - ${store.store_name}*\n`;
    text += `رقم الفاتورة: #${inv.order_id}\n`;
    text += `التاريخ: ${inv.created_at}\n`;
    text += `العميل: ${inv.customer_name || 'عميل نقدي'}\n`;
    text += `---------------------------------\n`;
    
    inv.items.forEach(itm => {
      const isWeight = itm.unit_type === 'weight' || itm.unit === 'كجم';
      const q = isWeight ? `${parseFloat(itm.qty).toFixed(3)} كجم` : `${itm.qty} قطعة`;
      text += `▪️ ${itm.name}\n   ${q} × ${parseFloat(itm.price).toFixed(2)} = ${(parseFloat(itm.price) * parseFloat(itm.qty)).toFixed(2)} ج.م\n`;
    });

    text += `---------------------------------\n`;
    if (parseFloat(inv.discount) > 0) {
      text += `الخصم: -${parseFloat(inv.discount).toFixed(2)} ج.م\n`;
    }
    text += `*💰 صافي الإجمالي: ${parseFloat(inv.total).toFixed(2)} ج.م*\n`;
    text += `طريقة الدفع: ${inv.payment_method}\n`;
    text += `\nنتشرف بزيارتكم دائماً 🙏✨`;

    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
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
