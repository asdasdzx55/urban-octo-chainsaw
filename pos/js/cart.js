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
    this.lastInvoice = null;
    try {
      const completed = JSON.parse(localStorage.getItem('pos_completed_orders') || '[]');
      if (completed.length > 0) this.lastInvoice = completed[0];
    } catch(e) {}
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

  /* ==================== NATURAL BLACK & WHITE RECEIPT RENDERING & PRINTING ==================== */
  buildReceiptHTML(inv) {
    if (!inv) return '';

    let pmDisplay = 'نقدي (كاش)';
    if (inv.payment_method === 'فودافون كاش' || inv.payment_method === 'vodafone_cash') {
      pmDisplay = 'فودافون كاش';
    } else if (inv.payment_method === 'انستا باي' || inv.payment_method === 'instapay') {
      pmDisplay = 'إنستاباي';
    } else if (inv.payment_method === 'فيزا' || inv.payment_method === 'card') {
      pmDisplay = 'بطاقة بنكية';
    } else if (inv.payment_method) {
      pmDisplay = inv.payment_method;
    }

    const store = window.settingsController ? window.settingsController.getStoreInfo() : {
      store_name: 'سوبر ماركت المنزل السوري',
      store_phone: '01000000000',
      store_phone2: '',
      store_address: 'القاهرة - مصر',
      receipt_sub: 'للمنتجات والمواد الغذائية السورية الأصلية',
      receipt_footer: 'شكراً لزيارتكم • يُرجى الاحتفاظ بالفاتورة للاستبدال والاسترجاع'
    };

    const phones = [store.store_phone, store.store_phone2].filter(Boolean);
    const phonesText = phones.join(' • ');
    const totalQtyCount = inv.items ? inv.items.reduce((acc, itm) => acc + (parseFloat(itm.qty) || 1), 0) : 0;
    const isDelivery = inv.order_type === 'delivery' || parseFloat(inv.delivery_fee) > 0 || !!inv.address;
    const isPrepaid = inv.delivery_pay_mode === 'prepaid' || (parseFloat(inv.paid_amount) >= parseFloat(inv.total) && inv.amount_to_collect === 0);

    return `
      <div class="bw-receipt">
        
        <!-- Header -->
        <div class="bw-header">
          <h1 class="bw-title">${store.store_name}</h1>
          <div class="bw-sub">${store.receipt_sub || 'للمنتجات والمواد الغذائية السورية'}</div>
          ${phonesText ? `<div class="bw-info"><b>هاتف:</b> <span class="bw-mono">${phonesText}</span></div>` : ''}
          ${store.store_address ? `<div class="bw-info"><b>العنوان:</b> ${store.store_address}</div>` : ''}
        </div>

        <div class="bw-divider-double"></div>

        <!-- Invoice Details Table -->
        <table class="bw-meta-table">
          <tr>
            <td style="width: 50%;"><b>رقم الفاتورة:</b> <span class="bw-mono">#${inv.order_id}</span></td>
            <td style="width: 50%; text-align: left;"><b>التاريخ:</b> <span class="bw-mono">${inv.created_at || new Date().toLocaleString('ar-EG')}</span></td>
          </tr>
          <tr>
            <td><b>الكاشير:</b> ${inv.cashier || 'كاشير 1'}</td>
            <td style="text-align: left;"><b>العميل:</b> ${inv.customer_name || 'عميل نقدي'}</td>
          </tr>
          <tr>
            <td colspan="2"><b>طريقة الدفع:</b> ${pmDisplay}</td>
          </tr>
        </table>

        <!-- Delivery Box If Applicable -->
        ${isDelivery ? `
          <div class="bw-delivery-box">
            <div class="bw-delivery-title">🛵 طلب توصيل منزلي (دليفري)</div>
            <table class="bw-meta-table">
              <tr>
                <td><b>الهاتف:</b> <span class="bw-mono">${inv.customer_phone || inv.phone || '-'}</span></td>
                <td style="text-align: left;"><b>الطيار:</b> ${inv.delivery_person || 'غير محدد'}</td>
              </tr>
              ${inv.address ? `
                <tr>
                  <td colspan="2"><b>العنوان:</b> ${inv.address}</td>
                </tr>
              ` : ''}
              <tr>
                <td colspan="2" style="text-align: center; font-weight: bold; padding-top: 3px; border-top: 1px dashed #000;">
                  ${isPrepaid ? '✅ مدفوعة مسبقاً (لا يُحصل أي مبلغ)' : `⏳ تحصيل عند الاستلام: ${parseFloat(inv.total).toFixed(2)} ج.م`}
                </td>
              </tr>
            </table>
          </div>
        ` : ''}

        <div class="bw-divider-solid"></div>

        <!-- Items Table (جدول الأصناف الأسود والأبيض المنسق) -->
        <table class="bw-items-table">
          <thead>
            <tr>
              <th class="th-num">م</th>
              <th class="th-name">الصنف والبيان</th>
              <th class="th-qty">الكمية</th>
              <th class="th-price">السعر</th>
              <th class="th-total">المجموع</th>
            </tr>
          </thead>
          <tbody>
            ${inv.items && inv.items.map((item, idx) => {
              const isWeight = item.unit_type === 'weight' || item.unit === 'كجم';
              const qtyDisplay = isWeight ? `${parseFloat(item.qty).toFixed(3)} كجم` : `${item.qty} ق`;
              const lineTotal = (parseFloat(item.price) * parseFloat(item.qty)).toFixed(2);
              return `
                <tr>
                  <td class="td-num">${idx + 1}</td>
                  <td class="td-name">
                    <div class="item-title">${item.name}</div>
                    ${item.local_code ? `<span class="item-code">كود: ${item.local_code}</span>` : ''}
                  </td>
                  <td class="td-qty">${qtyDisplay}</td>
                  <td class="td-price">${parseFloat(item.price).toFixed(2)}</td>
                  <td class="td-total">${lineTotal}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>

        <div class="bw-divider-solid"></div>

        <!-- Totals & Payment Summary Table -->
        <table class="bw-summary-table">
          <tr>
            <td>المجموع الفرعي:</td>
            <td class="bw-val">${parseFloat(inv.subtotal || inv.total).toFixed(2)} ج.م</td>
          </tr>

          ${parseFloat(inv.discount) > 0 ? `
            <tr>
              <td>الخصم الممنوح:</td>
              <td class="bw-val">-${parseFloat(inv.discount).toFixed(2)} ج.م</td>
            </tr>
          ` : ''}

          ${(inv.delivery_fee && parseFloat(inv.delivery_fee) > 0) ? `
            <tr>
              <td>خدمة التوصيل (دليفري):</td>
              <td class="bw-val">+${parseFloat(inv.delivery_fee).toFixed(2)} ج.م</td>
            </tr>
          ` : ''}

          <tr class="bw-grand-row">
            <td>الإجمالي النهائي المطلوب:</td>
            <td class="bw-grand-val">${parseFloat(inv.total).toFixed(2)} ج.م</td>
          </tr>

          ${(!isDelivery && (inv.payment_method === 'cash' || inv.payment_method === 'نقدي' || !inv.payment_method)) ? `
            <tr>
              <td>المبلغ المدفوع نقداً:</td>
              <td class="bw-val">${parseFloat(inv.paid_amount || inv.total).toFixed(2)} ج.م</td>
            </tr>
            <tr>
              <td>المتبقي (الباقي للعميل):</td>
              <td class="bw-val" style="font-weight: 900; font-size: 13px;">${parseFloat(inv.change || 0).toFixed(2)} ج.م</td>
            </tr>
          ` : ''}

          <tr>
            <td colspan="2" style="text-align: center; font-size: 10px; padding-top: 4px; border-top: 1px dashed #000;">
              عدد الأصناف: <b>${inv.items ? inv.items.length : 0}</b> صنف (<b>${totalQtyCount % 1 === 0 ? totalQtyCount : totalQtyCount.toFixed(3)}</b> كمية)
            </td>
          </tr>
        </table>

        <!-- Barcode Section -->
        <div class="bw-barcode">
          <svg class="receipt-svg-barcode" data-barcode="${inv.invoice_barcode || `INV-${inv.order_id}`}"></svg>
          <div class="bw-barcode-text">${inv.invoice_barcode || `INV-${inv.order_id}`}</div>
        </div>

        <div class="bw-divider-double"></div>

        <!-- Receipt Footer -->
        <div class="bw-footer">
          <p><b>${store.receipt_footer || 'شكراً لزيارتكم • يُرجى الاحتفاظ بالفاتورة للاسترجاع'}</b></p>
          <p style="font-size: 9.5px; margin-top: 2px;">الأسعار شاملة الضريبة • نظام كاشير المنزل السوري 2026</p>
        </div>

      </div>
    `;
  }

  renderBarcodes(inv) {
    if (!window.JsBarcode) return;
    try {
      document.querySelectorAll(".receipt-svg-barcode").forEach(el => {
        const code = el.getAttribute('data-barcode') || (inv ? (inv.invoice_barcode || `INV-${inv.order_id}`) : 'INV-0');
        window.JsBarcode(el, code, {
          format: "CODE128",
          width: 1.5,
          height: 36,
          displayValue: false,
          margin: 2
        });
      });
    } catch (e) {
      console.warn('JsBarcode render error:', e);
    }
  }

  showReceiptModal(inv) {
    const modal = document.getElementById('receipt-modal');
    const container = document.getElementById('receipt-view-container');
    const printArea = document.getElementById('receipt-print-area');
    if (!modal || !container) return;

    this.lastInvoice = inv;
    const receiptHTML = this.buildReceiptHTML(inv);

    container.innerHTML = receiptHTML;
    if (printArea) printArea.innerHTML = receiptHTML;

    // Render Barcodes on all SVG elements
    this.renderBarcodes(inv);

    modal.classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();
  }

  printReceiptDirectly() {
    if (this.isPrinting) return;
    this.isPrinting = true;
    setTimeout(() => { this.isPrinting = false; }, 2000);

    if (!this.lastInvoice) {
      window.print();
      return;
    }
    this.printInvoice(this.lastInvoice);
  }

  getReceiptPrintStyles() {
    return `
      @page { size: 80mm auto; margin: 2mm; }
      * { box-sizing: border-box; }
      html, body {
        width: 100%;
        margin: 0;
        padding: 1mm 2mm;
        background: #ffffff !important;
        color: #000000 !important;
        font-family: 'Cairo', -apple-system, BlinkMacSystemFont, 'Segoe UI', Tahoma, Arial, sans-serif;
        direction: rtl;
        text-align: right;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .bw-receipt {
        width: 100%;
        max-width: 74mm;
        margin: 0 auto;
        padding: 0;
        background: #fff !important;
        color: #000 !important;
        border: none !important;
        box-shadow: none !important;
      }
      .bw-header { text-align: center; margin-bottom: 6px; }
      .bw-title { font-size: 18px; font-weight: 900; margin: 0 0 3px 0; color: #000 !important; }
      .bw-sub { font-size: 11px; font-weight: 700; margin-bottom: 3px; color: #000 !important; }
      .bw-info { font-size: 10px; margin: 1.5px 0; font-weight: 600; color: #000 !important; }
      .bw-divider-double { border-top: 2px solid #000; margin: 6px 0; }
      .bw-divider-solid { border-top: 1px solid #000; margin: 6px 0; }
      .bw-divider-dashed { border-top: 1px dashed #000; margin: 6px 0; }
      .bw-meta-table { width: 100%; border-collapse: collapse; font-size: 10.5px; margin: 3px 0; }
      .bw-meta-table td { padding: 2px 1px; vertical-align: middle; color: #000 !important; }
      .bw-mono { font-family: 'Courier New', monospace; font-weight: bold; }
      .bw-delivery-box { border: 1.5px solid #000; border-radius: 6px; padding: 5px 6px; margin: 5px 0; }
      .bw-delivery-title { font-weight: 900; font-size: 11.5px; text-align: center; border-bottom: 1.5px solid #000; padding-bottom: 3px; margin-bottom: 4px; }
      .bw-items-table { width: 100%; border-collapse: collapse; margin: 5px 0; font-size: 10.5px; border: 1.5px solid #000; table-layout: fixed; word-wrap: break-word; }
      .bw-items-table thead th { border: 1px solid #000; border-bottom: 2px solid #000; background: #e8e8e8 !important; color: #000 !important; font-weight: 900; padding: 4px 2px; text-align: center; font-size: 10px; }
      .bw-items-table tbody td { border: 1px solid #000; padding: 3.5px 2px; vertical-align: middle; color: #000 !important; }
      .bw-items-table .th-num, .bw-items-table .td-num { width: 7%; text-align: center; font-family: 'Courier New', monospace; font-weight: bold; }
      .bw-items-table .th-name, .bw-items-table .td-name { width: 45%; text-align: right; }
      .bw-items-table .item-title { font-weight: 800; line-height: 1.25; color: #000 !important; font-size: 10.5px; }
      .bw-items-table .item-code { font-size: 8.5px; color: #333 !important; font-family: 'Courier New', monospace; display: block; }
      .bw-items-table .th-qty, .bw-items-table .td-qty { width: 20%; text-align: center; font-family: 'Courier New', monospace; font-weight: bold; font-size: 10px; }
      .bw-items-table .th-price, .bw-items-table .td-price { width: 14%; text-align: center; font-family: 'Courier New', monospace; font-size: 10px; }
      .bw-items-table .th-total, .bw-items-table .td-total { width: 14%; text-align: left; font-family: 'Courier New', monospace; font-weight: 900; font-size: 10.5px; }
      .bw-summary-table { width: 100%; border-collapse: collapse; font-size: 11px; margin: 5px 0; table-layout: fixed; }
      .bw-summary-table td { padding: 2.5px 1px; color: #000 !important; }
      .bw-summary-table .bw-val { text-align: left; font-family: 'Courier New', monospace; font-weight: 800; }
      .bw-summary-table .bw-grand-row td { border-top: 2px solid #000; border-bottom: 2px solid #000; padding: 5px 1px; font-size: 13.5px; font-weight: 900; }
      .bw-summary-table .bw-grand-val { text-align: left; font-family: 'Courier New', monospace; font-size: 15px; font-weight: 900; }
      .bw-barcode { text-align: center; margin: 6px 0 3px 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
      .bw-barcode svg { max-width: 100%; height: 35px; }
      .bw-barcode-text { font-family: 'Courier New', monospace; font-size: 10.5px; font-weight: 900; letter-spacing: 1px; color: #000 !important; }
      .bw-footer { text-align: center; font-size: 9.5px; color: #000 !important; line-height: 1.35; margin-top: 5px; }
      .bw-footer p { margin: 2px 0; }
      @media print {
        .no-print { display: none !important; }
      }
    `;
  }

  printInvoice(inv) {
    if (!inv && this.lastInvoice) inv = this.lastInvoice;
    if (!inv) return;

    // 1. Get receipt content (from modal container if already rendered with SVG barcode)
    const container = document.getElementById('receipt-view-container');
    const printArea = document.getElementById('receipt-print-area');
    let receiptContent = (container && container.innerHTML && container.innerHTML.includes('bw-receipt'))
      ? container.innerHTML
      : this.buildReceiptHTML(inv);

    // 2. Always update in-page print area
    if (printArea) {
      printArea.innerHTML = receiptContent;
      this.renderBarcodes(inv);
    }

    // 3. Reliable Iframe Print: position off-screen at left -10000px with opacity 1
    try {
      let printFrame = document.getElementById('receipt-hidden-print-frame');
      if (printFrame) {
        printFrame.remove();
      }
      printFrame = document.createElement('iframe');
      printFrame.id = 'receipt-hidden-print-frame';
      // Notice: full opacity 1, off-screen at left -10000px so Chromium generates full black/white vectors!
      printFrame.setAttribute('style', 'position:fixed; top:0; left:-10000px; width:76mm; height:100vh; border:0; z-index:-9999; pointer-events:none;');
      document.body.appendChild(printFrame);

      const frameDoc = printFrame.contentWindow.document;
      frameDoc.open();
      frameDoc.write(`
        <!DOCTYPE html>
        <html dir="rtl" lang="ar">
        <head>
          <meta charset="UTF-8">
          <title>فاتورة رقم #${inv.order_id}</title>
          <style>
            ${this.getReceiptPrintStyles()}
          </style>
        </head>
        <body>
          ${receiptContent}
        </body>
        </html>
      `);
      frameDoc.close();

      // Trigger print ONCE cleanly after layout paint
      requestAnimationFrame(() => {
        setTimeout(() => {
          try {
            printFrame.contentWindow.focus();
            printFrame.contentWindow.print();
          } catch(frameErr) {
            console.warn('Iframe print error:', frameErr);
          }
        }, 250);
      });

    } catch (e) {
      console.warn('Iframe print initialization error:', e);
    }
  }

  openReceiptInNewWindow() {
    if (!this.lastInvoice) {
      window.app?.showToast('لا توجد فاتورة مفتوحة حالياً', 'warning');
      return;
    }
    const inv = this.lastInvoice;
    const container = document.getElementById('receipt-view-container');
    const content = (container && container.innerHTML && container.innerHTML.includes('bw-receipt'))
      ? container.innerHTML
      : this.buildReceiptHTML(inv);

    const printWin = window.open('', '_blank', 'width=450,height=720');
    if (printWin) {
      printWin.document.open();
      printWin.document.write(`
        <!DOCTYPE html>
        <html dir="rtl" lang="ar">
        <head>
          <meta charset="UTF-8">
          <title>فاتورة رقم #${inv.order_id}</title>
          <style>
            ${this.getReceiptPrintStyles()}
          </style>
        </head>
        <body>
          <div class="no-print" style="text-align: center; margin-bottom: 12px; padding: 8px; background: #f3f4f6; border-radius: 8px;">
            <button onclick="window.print()" style="padding: 10px 24px; font-size: 14px; font-weight: bold; background: #1e1b4b; color: #fff; border: none; border-radius: 8px; cursor: pointer;">
              🖨️ اضغط لطباعة الفاتورة الآن
            </button>
            <p style="font-size: 11px; color: #6b7280; margin-top: 4px;">ستغلق هذه الصفحة تلقائياً بعد إتمام الطباعة</p>
          </div>
          ${content}
          <script>
            setTimeout(function() {
              window.focus();
              window.print();
            }, 300);
          <\/script>
        </body>
        </html>
      `);
      printWin.document.close();
    } else {
      window.app?.showToast('المتصفح حظر فتح النافذة، تم التحويل للطباعة المباشرة', 'info');
      window.print();
    }
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
        <div class="p-2 sm:p-2.5 bg-gray-50 dark:bg-gray-700/50 rounded-2xl border border-gray-200/90 dark:border-gray-600/70 shadow-2xs flex items-center justify-between gap-2 cart-item-highlight transition">
          
          <!-- Product Name & Unit Price -->
          <div class="flex-1 min-w-0">
            <h4 class="text-xs sm:text-sm font-bold text-gray-900 dark:text-white truncate" title="${item.name}">${item.name}</h4>
            <div class="flex items-center gap-1.5 mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
              <span class="font-bold text-indigo-600 dark:text-indigo-400 font-mono">${item.price.toFixed(2)} ج.م${isWeight ? '/كجم' : ''}</span>
              ${item.local_code ? `<span class="px-1.5 py-0.2 bg-gray-200 dark:bg-gray-600 rounded text-[9px] font-mono font-bold">${item.local_code}</span>` : ''}
              ${isWeight ? `<span class="px-1.5 py-0.2 bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 rounded text-[9px] font-bold">⚖️ وزن</span>` : ''}
            </div>
          </div>

          <!-- Quantity / Weight Control -->
          <div class="flex items-center gap-1 bg-white dark:bg-gray-800 rounded-xl p-0.5 shrink-0 border border-gray-200 dark:border-gray-600 shadow-2xs">
            <button onclick="window.cart.updateQty(${item.product_id}, ${prevQty})" class="w-6 h-6 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 flex items-center justify-center font-bold text-xs cursor-pointer active:scale-95 transition" title="تقليل">-</button>
            
            <span onclick="${isWeight ? `window.app.openWeightModalForItem(${item.product_id})` : ''}" class="px-1 text-center font-mono font-bold text-xs text-gray-900 dark:text-white ${isWeight ? 'cursor-pointer hover:text-amber-600 underline' : ''}" title="${isWeight ? 'اضغط لتعديل الوزن' : ''}">
              ${isWeight ? parseFloat(item.qty).toFixed(3) : item.qty}
            </span>

            <button onclick="window.cart.updateQty(${item.product_id}, ${nextQty})" class="w-6 h-6 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center font-bold text-xs cursor-pointer shadow-2xs active:scale-95 transition" title="زيادة">+</button>
          </div>

          <!-- Total & Remove -->
          <div class="text-left shrink-0 min-w-[55px]">
            <div class="text-xs sm:text-sm font-black text-indigo-600 dark:text-indigo-400 font-mono">${(item.price * item.qty).toFixed(2)}</div>
            <button onclick="window.cart.removeItem(${item.product_id})" class="text-[10px] text-rose-500 hover:text-rose-700 font-bold hover:underline transition cursor-pointer">حذف ✕</button>
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

  /* ==================== CASHIER INVOICE NAVIGATION TOOLBAR ==================== */
  getCompletedOrders() {
    try {
      return JSON.parse(localStorage.getItem('pos_completed_orders') || '[]');
    } catch(e) {
      return [];
    }
  }

  navigateInvoice(step) {
    const orders = this.getCompletedOrders();
    if (!orders || orders.length === 0) {
      window.app?.showToast('لا توجد فواتير سابقة مسجلة على هذا الجهاز', 'info');
      return;
    }

    if (this.currentInvoiceNavIndex === undefined || this.currentInvoiceNavIndex === null) {
      this.currentInvoiceNavIndex = -1;
    }

    let newIndex = this.currentInvoiceNavIndex;

    if (step < 0) {
      // رجوع: go older (0 is latest, 1 is older, 2 is older...)
      if (newIndex === -1) {
        newIndex = 0;
      } else if (newIndex < orders.length - 1) {
        newIndex++;
      } else {
        window.app?.showToast('وصلت لأقدم فاتورة مسجلة', 'info');
        return;
      }
    } else {
      // تقدم: go newer
      if (newIndex > 0) {
        newIndex--;
      } else if (newIndex === 0) {
        this.newSale();
        window.app?.showToast('عدت لشاشة الفاتورة الجديدة', 'info');
        return;
      } else {
        window.app?.showToast('أنت بالفعل في شاشة الفاتورة الجديدة', 'info');
        return;
      }
    }

    this.currentInvoiceNavIndex = newIndex;
    const invoice = orders[newIndex];
    if (invoice) {
      this.lastInvoice = invoice;
      window.app?.showToast(`فاتورة #${invoice.order_id} (${newIndex + 1} من ${orders.length}) 🧾`, 'info');
      this.showReceiptModal(invoice);
    }
  }

  printCurrentOrLast() {
    let inv = this.lastInvoice;
    if (!inv) {
      const orders = this.getCompletedOrders();
      if (orders && orders.length > 0) inv = orders[0];
    }

    if (!inv) {
      window.app?.showToast('لا توجد فاتورة لطباعتها', 'warning');
      return;
    }

    window.app?.showToast(`جاري طباعة فاتورة #${inv.order_id}... 🖨️`, 'info');
    this.printInvoice(inv);
  }

  newSale() {
    this.currentInvoiceNavIndex = -1;
    const receiptModal = document.getElementById('receipt-modal');
    if (receiptModal) receiptModal.classList.add('hidden');

    this.clearCart();
    const searchInput = document.getElementById('product-search-input');
    if (searchInput) searchInput.focus();

    window.app?.showToast('جاهز لفاتورة بيع جديدة ➕', 'success');
  }
}

window.cart = new POSCart();
