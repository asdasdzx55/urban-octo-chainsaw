/**
 * Syrian Home POS - Cart & Checkout Engine
 * Manages items, discounts, totals, cash change calculation, and thermal receipt generation.
 */

class POSCart {
  constructor() {
    this.items = [];
    this.discountAmount = 0;
    this.taxRate = 0; // Default 0% or customizable
    this.paymentFeeType = 'percent'; // 'percent' or 'fixed'
    this.paymentFeeVal = 0; // variable fee/tax on payment method
    this.paymentMethod = 'cash'; // 'cash', 'instapay', 'vodafone_cash', 'card'
    this.orderType = 'hall'; // 'hall' (استلام بالمحل) or 'delivery' (توصيل منزلي)
    this.deliveryPayMode = 'cod'; // 'cod' (تحصيل عند الاستلام - آجل) or 'prepaid' (مدفوعة مسبقاً)
    this.deliveryPrepaidMethod = 'instapay'; // 'instapay', 'vodafone_cash', 'card', 'cash_store'
    this.deliveryPrepaidRef = '';
    this.customerName = 'عميل نقدي';
    this.customerPhone = '';
    this.customerAddress = '';
    this.deliveryPerson = 'ديلفري غير معروف';
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

    const cartKey = String(product.id);
    const existingIndex = this.items.findIndex(i => !i.is_pack && String(i.product_id) === String(product.id));
    const validQty = parseFloat(parseFloat(qty).toFixed(3));

    if (existingIndex > -1) {
      this.items[existingIndex].qty = parseFloat((this.items[existingIndex].qty + validQty).toFixed(3));
    } else {
      this.items.push({
        cart_key: cartKey,
        product_id: product.id,
        name: product.name,
        qty: validQty,
        price: parseFloat(product.price || 0),
        cost: parseFloat(product.cost || 0),
        barcode: product.barcode || '',
        local_code: product.local_code || '',
        unit_type: unitType,
        unit: unitLabel,
        is_pack: 0,
        pack_multiplier: 1
      });
    }

    this.render();
    const qtyDisplay = isWeight ? `${validQty.toFixed(3)} ${unitLabel}` : `${validQty} ${unitLabel}`;
    window.app?.showToast(`تمت إضافة: ${product.name} (${qtyDisplay})`, 'success');
  }

  addPackItem(product, qty = 1) {
    if (!product) return;

    const cartKey = `${product.id}_pack`;
    const existingIndex = this.items.findIndex(i => i.is_pack && String(i.product_id) === String(product.id));
    const validQty = Math.max(1, parseInt(qty, 10) || 1);
    const packPrice = parseFloat(product.pack_price || product.price || 0);
    const packMultiplier = parseFloat(product.pack_qty || 1);
    const packName = (product.pack_name && product.pack_name.trim()) 
      ? product.pack_name.trim() 
      : `${product.name} (دستة/كرتونة)`;

    if (existingIndex > -1) {
      this.items[existingIndex].qty += validQty;
    } else {
      this.items.push({
        cart_key: cartKey,
        product_id: product.id,
        name: packName,
        qty: validQty,
        price: packPrice,
        cost: parseFloat(product.cost || 0) * packMultiplier,
        barcode: product.pack_barcode || product.barcode || '',
        local_code: product.local_code || '',
        unit_type: 'pack',
        unit: 'دستة/كرتونة',
        is_pack: 1,
        pack_name: packName,
        pack_multiplier: packMultiplier
      });
    }

    this.render();
    window.app?.showToast(`تمت إضافة كرتونة/دستة: ${packName} (${validQty}) 📦`, 'success');
  }

  async addProductByBarcode(barcode) {
    const rawCode = String(barcode || '').trim();
    if (!rawCode) return;

    // 0. Check if this barcode matches a pack barcode in cached products
    let matchedPack = window.app?.products?.find(p => p.has_pack == 1 && String(p.pack_barcode || '').trim() === rawCode);
    if (matchedPack) {
      this.addPackItem(matchedPack, 1);
      return;
    }

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
        if (res.is_pack_match || (res.product.has_pack == 1 && String(res.product.pack_barcode || '').trim() === rawCode)) {
          this.addPackItem(res.product, 1);
          return;
        }

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

  updateQty(key, newQty) {
    const item = this.items.find(i => String(i.cart_key || i.product_id) === String(key) || (i.product_id === key && !i.is_pack));
    if (!item) return;

    if (newQty <= 0) {
      this.removeItem(key);
    } else {
      item.qty = parseFloat(newQty);
      this.render();
    }
  }

  removeItem(key) {
    this.items = this.items.filter(i => String(i.cart_key || i.product_id) !== String(key) && !(i.product_id === key && !i.is_pack));
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
    this.deliveryPerson = 'ديلفري غير معروف';
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

  getPaymentFee() {
    const isDelivery = this.orderType === 'delivery';
    const pm = isDelivery 
      ? (this.deliveryPayMode === 'prepaid' ? this.deliveryPrepaidMethod : 'cash')
      : this.paymentMethod;

    if (pm === 'cash' || pm === 'cash_store' || (isDelivery && this.deliveryPayMode === 'cod')) {
      return 0;
    }

    const subtotal = this.getSubtotal();
    const afterDiscount = Math.max(0, subtotal - this.discountAmount);
    const val = parseFloat(this.paymentFeeVal || 0);

    if (val <= 0) return 0;

    if (this.paymentFeeType === 'percent') {
      return Math.round((afterDiscount * (val / 100)) * 100) / 100;
    } else {
      return val;
    }
  }

  getTotal() {
    const subtotal = this.getSubtotal();
    const afterDiscount = Math.max(0, subtotal - this.discountAmount);
    const tax = afterDiscount * (this.taxRate / 100);
    const paymentFee = this.getPaymentFee();
    const delivery = this.orderType === 'delivery' ? parseFloat(this.deliveryFee || 0) : 0;
    return afterDiscount + tax + paymentFee + delivery;
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

  /* ==================== CUSTOMER AUTOFILL BY PHONE ==================== */
  onCustomerPhoneInput(phone) {
    this.customerPhone = (phone || '').trim();
    if (this._phoneLookupTimer) clearTimeout(this._phoneLookupTimer);

    const clean = this.customerPhone.replace(/[^0-9]/g, '');
    const infoBanner = document.getElementById('checkout-customer-info-banner');

    if (clean.length < 8) {
      if (infoBanner) infoBanner.classList.add('hidden');
      return;
    }

    // Debounce lookup by 250ms
    this._phoneLookupTimer = setTimeout(() => {
      this.lookupCustomerByPhone(clean);
    }, 250);
  }

  async lookupCustomerByPhone(cleanPhone) {
    // 1. Fast lookup from local completed orders (instant match)
    try {
      const completed = JSON.parse(localStorage.getItem('pos_completed_orders') || '[]');
      const match = completed.find(o => {
        const p = (o.customer_phone || o.phone || '').replace(/[^0-9]/g, '');
        return p && (p === cleanPhone || p.endsWith(cleanPhone.slice(-9)) || cleanPhone.endsWith(p.slice(-9)));
      });

      if (match && (match.customer_name || match.address || match.customer_address)) {
        this.applyCustomerData({
          name: match.customer_name,
          phone: cleanPhone,
          address: match.address || match.customer_address || '',
          total_orders: 1,
          is_local: true
        });
      }
    } catch (e) {}

    // 2. Lookup from Central Backend Database
    try {
      const res = await window.api.getCustomerByPhone(cleanPhone);
      if (res && res.success && res.found && res.customer) {
        this.applyCustomerData(res.customer);
      }
    } catch (e) {
      console.warn('Backend customer phone lookup notice:', e);
    }
  }

  applyCustomerData(customer) {
    const infoBanner = document.getElementById('checkout-customer-info-banner');
    const infoText = document.getElementById('checkout-customer-info-text');
    const nameInput = document.getElementById('checkout-delivery-customer-name');
    const addrInput = document.getElementById('checkout-delivery-customer-address');

    const validName = customer.name && !['عميل نقدي', 'عميل كاشير', 'عميل دليفري'].includes(customer.name) ? customer.name : '';
    const validAddr = customer.address || '';

    if (validName && nameInput && (!nameInput.value || nameInput.value === 'عميل دليفري')) {
      nameInput.value = validName;
      this.customerName = validName;
      nameInput.classList.add('ring-2', 'ring-emerald-500');
      setTimeout(() => nameInput.classList.remove('ring-2', 'ring-emerald-500'), 1500);
    }

    if (validAddr && addrInput && !addrInput.value) {
      addrInput.value = validAddr;
      this.customerAddress = validAddr;
      addrInput.classList.add('ring-2', 'ring-emerald-500');
      setTimeout(() => addrInput.classList.remove('ring-2', 'ring-emerald-500'), 1500);
    }

    if (infoBanner && infoText && (validName || validAddr)) {
      const stats = [];
      if (customer.total_orders) stats.push(`${customer.total_orders} طلب`);
      if (parseFloat(customer.total_spent || 0) > 0) stats.push(`${parseFloat(customer.total_spent).toFixed(0)} ج.م`);
      if (customer.governorate && customer.governorate !== 'القاهرة') stats.push(customer.governorate);
      
      const statsBadge = stats.length > 0 ? ` <span class="bg-emerald-100 text-emerald-800 text-[11px] font-bold px-2 py-0.5 rounded-full mr-1">${stats.join(' • ')}</span>` : '';
      const mapLink = customer.map_url ? ` <a href="${customer.map_url}" target="_blank" class="text-blue-600 hover:text-blue-800 underline text-xs font-semibold mr-1 inline-flex items-center gap-0.5">📍 موقع GPS</a>` : '';

      infoText.innerHTML = `✨ <b>عميل مسجل:</b> ${validName || 'بيانات محفوظة'}${statsBadge}${mapLink} - تم استرجاع العنوان والاسم تلقائياً`;
      infoBanner.classList.remove('hidden');
      if (window.lucide) window.lucide.createIcons();
    }
  }

  clearCustomerAutofill() {
    const nameInput = document.getElementById('checkout-delivery-customer-name');
    const addrInput = document.getElementById('checkout-delivery-customer-address');
    const infoBanner = document.getElementById('checkout-customer-info-banner');

    if (nameInput) nameInput.value = '';
    if (addrInput) addrInput.value = '';
    this.customerName = 'عميل دليفري';
    this.customerAddress = '';
    if (infoBanner) infoBanner.classList.add('hidden');
  }

  /* ==================== CHECKOUT & SUBMIT SALE ==================== */
  async checkout(shouldPrint = true) {
    if (this.isSubmitting) {
      console.warn('Checkout already in progress, ignoring duplicate trigger.');
      return;
    }
    if (this.items.length === 0) {
      window.app?.showToast('سلة المشتريات فارغة!', 'error');
      return;
    }

    this.isSubmitting = true;
    const submitBtn = document.getElementById('btn-submit-payment');
    const saveOnlyBtn = document.getElementById('btn-submit-save-only');
    if (submitBtn) submitBtn.disabled = true;
    if (saveOnlyBtn) saveOnlyBtn.disabled = true;

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
    const finalDeliveryPerson = isDelivery 
      ? ((this.deliveryPerson && this.deliveryPerson.trim()) ? this.deliveryPerson.trim() : 'ديلفري غير معروف')
      : '';

    const payload = {
      local_sale_id: Date.now(),
      source: 'phone_pos',
      customer_name: (this.customerName || (isDelivery ? 'عميل دليفري' : 'عميل نقدي')).trim(),
      customer_phone: (this.customerPhone || '').trim(),
      phone: (this.customerPhone || '').trim(),
      address: (this.customerAddress || '').trim(),
      delivery_person: finalDeliveryPerson,
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
      payment_fee: this.getPaymentFee(),
      payment_fee_val: this.paymentFeeVal,
      payment_fee_type: this.paymentFeeType,
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
        barcode: item.barcode,
        local_code: item.local_code || '',
        is_pack: item.is_pack ? 1 : 0,
        pack_multiplier: item.pack_multiplier || 1,
        deduct_qty: (item.qty || 1) * (item.pack_multiplier || 1)
      }))
    };

    try {
      window.app?.showLoading(true, shouldPrint ? 'جاري حفظ وطباعة الفاتورة...' : 'جاري حفظ الفاتورة في السيستم...');
      const result = await window.api.pushSale(payload);
      window.app?.showLoading(false);

      if (result && result.success) {
        window.posScanner?.playSuccessBeep();
        
        // Prepare Completed Invoice Data for Printing
        const realOrderId = result.order_id || result.remote_id || Date.now();
        const realBarcode = result.invoice_barcode || `INV-${realOrderId}`;
        const invoiceData = {
          order_id: realOrderId,
          id: realOrderId,
          invoice_barcode: realBarcode,
          created_at: new Date().toLocaleString('ar-EG'),
          cashier: this.cashierNotes,
          customer_name: this.customerName || (isDelivery ? 'عميل دليفري' : 'عميل نقدي'),
          customer_phone: this.customerPhone || '',
          phone: this.customerPhone || '',
          address: this.customerAddress || '',
          delivery_person: finalDeliveryPerson,
          delivery_fee: deliveryFee,
          order_type: isDelivery ? 'delivery' : 'hall',
          delivery_pay_mode: isDelivery ? (this.deliveryPayMode || 'cod') : 'standard',
          payment_method: paymentMethodLabel,
          items: [...this.items],
          subtotal: this.getSubtotal(),
          discount: this.discountAmount,
          payment_fee: this.getPaymentFee(),
          payment_fee_val: this.paymentFeeVal,
          payment_fee_type: this.paymentFeeType,
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

        if (shouldPrint) {
          // Show Success Thermal Receipt Modal & Trigger Cloud / Hardware Print
          this.showReceiptModal(invoiceData);
          this.printViaCloudPrinter(invoiceData);
          if (isDelivery) {
            window.app?.showToast(`🛵 تم حفظ أوردر الدليفري #${realOrderId} وخروج الفاتورة للطيار! (الفاتورة مؤقتة لحين محاسبة الدليفري)`, 'info');
          } else {
            window.app?.showToast(`تم حفظ الفاتورة #${realOrderId} وطباعتها بنجاح ✅`, 'success');
          }
        } else {
          // Saved without printing
          if (isDelivery) {
            window.app?.showToast(`🛵 تم حفظ أوردر الدليفري #${realOrderId} مؤقتاً لحين محاسبة الطيار`, 'info');
          } else {
            window.app?.showToast(`تم حفظ الفاتورة #${realOrderId} بنجاح بدون طباعة 💾✅`, 'success');
          }
        }

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
        delivery_person: finalDeliveryPerson,
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

      // 4. Reset cart
      this.clearCart();
      document.getElementById('checkout-modal')?.classList.add('hidden');
      window.posScanner?.playSuccessBeep();

      if (shouldPrint) {
        this.showReceiptModal(invoiceData);
        try {
          this.printReceiptDirectly();
        } catch(e) {}
        window.app?.showToast(`تم حفظ الفاتورة #${offlineOrderId} محلياً وطباعتها (وضع أوفلاين) 📦🖨️`, 'warning');
      } else {
        window.app?.showToast(`تم حفظ الفاتورة #${offlineOrderId} محلياً بدون طباعة (وضع أوفلاين) 💾📦`, 'info');
      }
    } finally {
      this.isSubmitting = false;
      const submitBtn = document.getElementById('btn-submit-payment');
      const saveOnlyBtn = document.getElementById('btn-submit-save-only');
      if (submitBtn) submitBtn.disabled = false;
      if (saveOnlyBtn) saveOnlyBtn.disabled = false;
    }
  }

  deductLocalStock(soldItems) {
    if (!Array.isArray(soldItems) || !window.app?.products) return;
    soldItems.forEach(sold => {
      const p = window.app.products.find(prod => prod.id === sold.product_id);
      if (p) {
        const curStock = parseFloat(p.stock || 0);
        const qty = parseFloat(sold.qty || 1);
        const mult = parseFloat(sold.pack_multiplier || 1);
        const deductQty = sold.is_pack ? (qty * mult) : qty;
        p.stock = Math.max(0, parseFloat((curStock - deductQty).toFixed(3)));
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
    } else if (inv.payment_method === 'آجل' || inv.payment_method === 'credit') {
      pmDisplay = 'حساب آجل (على ذمة العميل)';
    } else if (inv.payment_method) {
      pmDisplay = inv.payment_method;
    }

    const store = window.settingsController ? window.settingsController.getStoreInfo() : {
      store_name: 'سوبر ماركت المنزل السوري',
      store_phone: '01000000000',
      store_phone2: '',
      store_address: 'الفرع الرئيسي • شارع الجيش • خدمة التوصيل',
      receipt_sub: 'أشهى المنتجات والمواد الغذائية السورية والشرقية',
      receipt_footer: 'شكراً لزيارتكم • نسعد بخدمتكم دائماً ❤️'
    };

    const phones = [store.store_phone, store.store_phone2].filter(Boolean);
    const phonesText = phones.join(' • ');
    const totalQtyCount = inv.items ? inv.items.reduce((acc, itm) => acc + (parseFloat(itm.qty) || 1), 0) : 0;
    const isDelivery = inv.order_type === 'delivery' || inv.order_type === 'دليفري' || parseFloat(inv.delivery_fee) > 0 || !!inv.address;
    const isPrepaid = inv.delivery_pay_mode === 'prepaid' || (parseFloat(inv.paid_amount) >= parseFloat(inv.total) && inv.amount_to_collect === 0);
    const netTotal = parseFloat(inv.total || inv.total_price || 0);
    const paidVal = parseFloat(inv.paid_amount || 0);
    const changeVal = paidVal >= netTotal ? (paidVal - netTotal) : 0;

    return `
      <div class="bw-receipt">
        
        <!-- Store Brand Header -->
        <div class="bw-header">
          <div class="bw-divider-top"></div>
          <h1 class="bw-title">${store.store_name}</h1>
          <div class="bw-stars">★  ★  ★</div>
          <div class="bw-sub">${store.receipt_sub || 'أشهى المنتجات والمواد الغذائية السورية والشرقية'}</div>
          <div class="bw-info"><b>الفرع:</b> ${store.store_address || 'الفرع الرئيسي • شارع الجيش • خدمة التوصيل'}</div>
          ${phonesText ? `<div class="bw-info"><b>هاتف وخدمة عملاء:</b> <span class="bw-mono">${phonesText}</span></div>` : ''}
          <div class="bw-tax-reg">س.ت: 45210  •  ر.ض: 541-890-332</div>
        </div>

        <!-- Framed Invoice Title Banner -->
        <div class="bw-title-banner">فاتورة مبيعات نقدية مبسطة</div>

        <!-- Invoice Details Box -->
        <table class="bw-meta-table">
          <tr>
            <td style="width: 50%;"><b>رقم الفاتورة:</b> <span class="bw-mono font-bold">#${inv.order_id}</span></td>
            <td style="width: 50%; text-align: left;"><b>التاريخ:</b> <span class="bw-mono">${inv.created_at || new Date().toLocaleString('ar-EG')}</span></td>
          </tr>
          <tr>
            <td><b>الكاشير:</b> ${inv.cashier || inv.cashier_name || 'كاشير 1'} (نقطة #1)</td>
            <td style="text-align: left;"><b>طريقة الدفع:</b> ${pmDisplay}</td>
          </tr>
          ${(inv.customer_name && inv.customer_name !== 'عميل نقدي') ? `
            <tr>
              <td><b>العميل:</b> ${inv.customer_name}</td>
              <td style="text-align: left;"><b>الهاتف:</b> <span class="bw-mono">${inv.customer_phone || inv.phone || '-'}</span></td>
            </tr>
          ` : ''}
        </table>

        <!-- Delivery Box If Applicable -->
        ${isDelivery ? `
          <div class="bw-delivery-box">
            <div class="bw-delivery-title">🛵 طلب توصيل منزلي (دليفري)</div>
            <table class="bw-meta-table">
              <tr>
                <td><b>هاتف العميل:</b> <span class="bw-mono">${inv.customer_phone || inv.phone || '-'}</span></td>
                <td style="text-align: left;"><b>الطيار:</b> ${inv.delivery_person || 'كابتن التوصيل'}</td>
              </tr>
              ${inv.address ? `
                <tr>
                  <td colspan="2"><b>العنوان:</b> ${inv.address}</td>
                </tr>
              ` : ''}
              <tr>
                <td colspan="2" style="text-align: center; font-weight: bold; padding-top: 3px; border-top: 1px dashed #000;">
                  ${isPrepaid ? '✅ مدفوعة مسبقاً (لا يُحصل أي مبلغ من العميل)' : `⏳ مطلوب تحصيل عند الاستلام: ${netTotal.toFixed(2)} ج.م`}
                </td>
              </tr>
            </table>
          </div>
        ` : ''}

        <div class="bw-divider-solid"></div>

        <!-- Items Table -->
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
              const rawQty = parseFloat(item.qty) || 1;
              const isWeight = item.unit_type === 'weight' || item.unit === 'كجم' || (rawQty % 1 !== 0);
              let qtyDisplay = '';
              if (isWeight) {
                qtyDisplay = rawQty < 1 ? `${Math.round(rawQty * 1000)} جم` : `${rawQty.toFixed(3)} كجم`;
              } else if (item.is_pack) {
                qtyDisplay = `${Math.round(rawQty)} كرتونة`;
              } else {
                qtyDisplay = `${Math.round(rawQty)} ق`;
              }
              const itemCode = item.local_code || item.code || item.barcode;
              const lineTotal = (parseFloat(item.price) * rawQty).toFixed(2);
              return `
                <tr>
                  <td class="td-num">${idx + 1}</td>
                  <td class="td-name">
                    <div class="item-title">${item.name}</div>
                    ${itemCode ? `<span class="item-code">كود: ${itemCode}</span>` : ''}
                  </td>
                  <td class="td-qty">${qtyDisplay}</td>
                  <td class="td-price">${parseFloat(item.price).toFixed(2)}</td>
                  <td class="td-total">${lineTotal} ج.م</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>

        <!-- Items Count & Quantity Summary -->
        <div class="bw-summary-bar">
          عدد الأصناف: <b>${inv.items ? inv.items.length : 0}</b> صنف  •  إجمالي الكميات والأوزان: <b>${totalQtyCount % 1 === 0 ? totalQtyCount : totalQtyCount.toFixed(3)}</b>
        </div>

        <!-- Totals & Payment Summary Table -->
        <table class="bw-summary-table">
          <tr>
            <td>المجموع الفرعي:</td>
            <td class="bw-val">${parseFloat(inv.subtotal || inv.total).toFixed(2)} ج.م</td>
          </tr>

          ${parseFloat(inv.discount) > 0 ? `
            <tr>
              <td>الخصم الممنوح:</td>
              <td class="bw-val" style="color: #b91c1c;">-${parseFloat(inv.discount).toFixed(2)} ج.م</td>
            </tr>
          ` : ''}

          ${(inv.delivery_fee && parseFloat(inv.delivery_fee) > 0) ? `
            <tr>
              <td>خدمة التوصيل (دليفري):</td>
              <td class="bw-val">+${parseFloat(inv.delivery_fee).toFixed(2)} ج.م</td>
            </tr>
          ` : ''}
        </table>

        <!-- High-Visibility Grand Total Box -->
        <div class="bw-grand-box">
          <span class="bw-grand-label">الإجمالي الصافي النهائي:</span>
          <span class="bw-grand-val">${netTotal.toFixed(2)} ج.م</span>
        </div>

        ${(!isDelivery && paidVal > 0) ? `
          <table class="bw-summary-table" style="margin-top: 3px;">
            <tr>
              <td>المبلغ المدفوع نقدياً:</td>
              <td class="bw-val">${paidVal.toFixed(2)} ج.م</td>
            </tr>
            <tr>
              <td><b>المتبقي (الباقي للعميل):</b></td>
              <td class="bw-val" style="font-size: 13px; font-weight: 900;">${changeVal.toFixed(2)} ج.م</td>
            </tr>
          </table>
        ` : ''}

        ${(inv.payment_method === 'آجل' || inv.payment_method === 'credit') ? `
          <div style="text-align: center; font-weight: bold; font-size: 11px; padding: 4px; background: #fef3c7; border: 1px solid #d97706; border-radius: 4px; margin: 4px 0;">
            ⚠️ حساب آجل على ذمة العميل
          </div>
        ` : ''}

        <!-- Barcode Section -->
        <div class="bw-barcode">
          <svg class="receipt-svg-barcode" data-barcode="${inv.invoice_barcode || `INV-${inv.order_id}`}"></svg>
          <div class="bw-barcode-text">* ${inv.invoice_barcode || `INV-${inv.order_id}`} *</div>
        </div>

        <div class="bw-divider-solid"></div>

        <!-- Return & Exchange Policy Terms -->
        <div class="bw-terms-box">
          <div style="font-weight: bold; margin-bottom: 2px;">تعليمات وسياسة الاستبدال والاسترجاع:</div>
          <ul>
            <li>• الاستبدال والاسترجاع خلال 14 يوماً بموجب أصل الفاتورة.</li>
            <li>• يُشترط أن تكون السلعة بحالتها الأصلية غير مفتوحة وبغلافها.</li>
            <li>• المخبوزات الطازجة والمجمدات لا تُرد بعد الاستلام حرصاً على سلامتكم.</li>
            <li>• جميع الأسعار شاملة ضريبة القيمة المضافة 14%.</li>
          </ul>
        </div>

        <div class="bw-divider-double"></div>

        <!-- Receipt Footer -->
        <div class="bw-footer">
          <p class="bw-footer-farewell"><b>${store.receipt_footer || 'شكراً لزيارتكم • نسعد بخدمتكم دائماً ❤️'}</b></p>
          <p style="font-size: 9.5px; color: #444; margin-top: 2px;">نظام كاشير المنزل السوري 2026 • Syrian House POS</p>
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

  async printViaCloudPrinter(inv = null) {
    const invoice = inv || this.lastInvoice;
    if (!invoice) {
      window.app?.showToast('لا توجد فاتورة محددة للطباعة', 'warning');
      return;
    }

    window.app?.showToast('جاري إرسال أمر الطباعة لطابعة الكاشير (XP-80C)... 🖨️', 'info');

    let rawItems = invoice.items || [];
    if (typeof rawItems === 'string') {
      try { rawItems = JSON.parse(rawItems); } catch(e) { rawItems = []; }
    }

    const cleanItems = (Array.isArray(rawItems) ? rawItems : []).map(it => ({
      name: it.name || it.item_name || 'صنف',
      qty: parseFloat(it.qty || it.quantity || 1),
      price: parseFloat(it.price || it.unit_price || 0),
      total: parseFloat(it.total || it.total_price || ((it.qty || 1) * (it.price || 0))),
      unit: it.unit || it.unit_type || '',
      local_code: it.local_code || it.code || it.barcode || '',
      is_pack: !!it.is_pack
    }));

    const store = window.settingsController ? window.settingsController.getStoreInfo() : {
      store_name: 'سوبر ماركت المنزل السوري',
      store_phone: '01000000000',
      store_phone2: '',
      store_address: 'الفرع الرئيسي • شارع الجيش • خدمة التوصيل',
      receipt_sub: 'أشهى المنتجات والمواد الغذائية السورية والشرقية',
      receipt_footer: 'شكراً لزيارتكم • نسعد بخدمتكم دائماً ❤️'
    };

    const isDelivery = invoice.order_type === 'delivery' || invoice.order_type === 'دليفري' || parseFloat(invoice.delivery_fee) > 0 || !!invoice.address;

    const payload = {
      order_id: invoice.order_id || invoice.id || '',
      invoice_barcode: invoice.invoice_barcode || `INV-${invoice.order_id || invoice.id || '000'}`,
      date: invoice.date || invoice.created_at || new Date().toLocaleString('ar-EG'),
      cashier_name: invoice.cashier_name || invoice.cashier || 'كاشير 1',
      customer_name: invoice.customer_name || 'عميل نقدي',
      customer_phone: invoice.customer_phone || invoice.phone || '',
      order_type: isDelivery ? 'دليفري' : 'صالة',
      delivery_person: invoice.delivery_person || '',
      address: invoice.address || '',
      payment_method: invoice.payment_method || 'كاش',
      total_price: parseFloat(invoice.total || invoice.total_price || invoice.net || 0),
      discount: parseFloat(invoice.discount || invoice.discount_amount || 0),
      delivery_fee: parseFloat(invoice.delivery_fee || 0),
      paid_amount: parseFloat(invoice.paid_amount || 0),
      items: cleanItems,
      store_name: store.store_name,
      store_phone: [store.store_phone, store.store_phone2].filter(Boolean).join(' • ') || '01000000000',
      store_address: store.store_address,
      receipt_sub: store.receipt_sub,
      footer: store.receipt_footer || 'شكراً لزيارتكم • نسعد بخدمتكم دائماً ❤️'
    };

    try {
      const res = await window.api.pushPrintJob({
        job_type: 'receipt',
        printer_name: 'XP-80C',
        payload: payload
      });

      if (res && res.success) {
        window.app?.showToast('✅ تم إرسال الفاتورة للطابعة! تخرج الورقة الآن من الكاشير 🖨️', 'success');
      } else {
        window.app?.showToast(res.error || 'تعذر إرسال أمر الطباعة لطابعة الكاشير', 'error');
        this.printReceiptDirectly();
      }
    } catch (err) {
      console.warn('Cloud print error:', err);
      window.app?.showToast('خطأ في إرسال أمر الطباعة، جاري الفتح على الموبايل...', 'info');
      this.printReceiptDirectly();
    }
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
      .bw-divider-top { border-top: 3px solid #000; margin-bottom: 6px; }
      .bw-title { font-size: 18px; font-weight: 900; margin: 0 0 2px 0; color: #000 !important; }
      .bw-stars { font-size: 11px; letter-spacing: 2px; margin-bottom: 2px; color: #000 !important; }
      .bw-sub { font-size: 10.5px; font-weight: 700; margin-bottom: 2px; color: #000 !important; }
      .bw-info { font-size: 9.5px; margin: 1.5px 0; font-weight: 600; color: #000 !important; }
      .bw-tax-reg { font-size: 9px; font-weight: 600; color: #333 !important; margin-top: 2px; }
      .bw-title-banner {
        background: #000 !important;
        color: #fff !important;
        font-size: 12px;
        font-weight: 900;
        text-align: center;
        padding: 3px 0;
        border-radius: 4px;
        margin: 6px 0;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .bw-divider-double { border-top: 2px solid #000; margin: 5px 0; }
      .bw-divider-solid { border-top: 1px solid #000; margin: 5px 0; }
      .bw-divider-dashed { border-top: 1px dashed #000; margin: 5px 0; }
      .bw-meta-table { width: 100%; border-collapse: collapse; font-size: 10px; margin: 3px 0; border: 1px solid #000; border-radius: 4px; }
      .bw-meta-table td { padding: 3px 4px; vertical-align: middle; color: #000 !important; }
      .bw-mono { font-family: 'Courier New', monospace; }
      .bw-delivery-box { border: 1.5px solid #000; border-radius: 6px; padding: 4px 5px; margin: 5px 0; }
      .bw-delivery-title { font-weight: 900; font-size: 11px; text-align: center; border-bottom: 1.5px solid #000; padding-bottom: 2px; margin-bottom: 3px; }
      .bw-items-table { width: 100%; border-collapse: collapse; margin: 5px 0; font-size: 10px; border: 1.5px solid #000; table-layout: fixed; word-wrap: break-word; }
      .bw-items-table thead th { border: 1px solid #000; border-bottom: 2px solid #000; background: #e8e8e8 !important; color: #000 !important; font-weight: 900; padding: 4px 2px; text-align: center; font-size: 9.5px; }
      .bw-items-table tbody td { border: 1px solid #000; padding: 3px 2px; vertical-align: middle; color: #000 !important; }
      .bw-items-table .th-num, .bw-items-table .td-num { width: 7%; text-align: center; font-family: 'Courier New', monospace; font-weight: bold; }
      .bw-items-table .th-name, .bw-items-table .td-name { width: 44%; text-align: right; }
      .bw-items-table .item-title { font-weight: 800; line-height: 1.2; color: #000 !important; font-size: 10px; }
      .bw-items-table .item-code { font-size: 8.5px; color: #444 !important; font-family: 'Courier New', monospace; display: block; }
      .bw-items-table .th-qty, .bw-items-table .td-qty { width: 21%; text-align: center; font-family: 'Courier New', monospace; font-weight: bold; font-size: 9.5px; }
      .bw-items-table .th-price, .bw-items-table .td-price { width: 14%; text-align: center; font-family: 'Courier New', monospace; font-size: 9.5px; }
      .bw-items-table .th-total, .bw-items-table .td-total { width: 14%; text-align: left; font-family: 'Courier New', monospace; font-weight: 900; font-size: 10px; }
      .bw-summary-bar { text-align: center; font-size: 9.5px; padding: 3px 0; border-top: 1px dashed #000; border-bottom: 1px dashed #000; margin: 4px 0; font-weight: 600; }
      .bw-summary-table { width: 100%; border-collapse: collapse; font-size: 10.5px; margin: 4px 0; table-layout: fixed; }
      .bw-summary-table td { padding: 2px 1px; color: #000 !important; }
      .bw-summary-table .bw-val { text-align: left; font-family: 'Courier New', monospace; font-weight: 800; }
      .bw-grand-box {
        border: 2px solid #000;
        background: #e8e8e8 !important;
        padding: 5px 6px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin: 5px 0;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .bw-grand-label { font-weight: 900; font-size: 11.5px; color: #000 !important; }
      .bw-grand-val { font-weight: 900; font-size: 15px; font-family: 'Courier New', monospace; color: #000 !important; }
      .bw-barcode { text-align: center; margin: 6px 0 2px 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
      .bw-barcode svg { max-width: 100%; height: 35px; }
      .bw-barcode-text { font-family: 'Courier New', monospace; font-size: 10px; font-weight: 900; letter-spacing: 1px; color: #000 !important; }
      .bw-terms-box { font-size: 8.5px; line-height: 1.35; margin: 5px 0; padding-top: 3px; color: #000 !important; }
      .bw-terms-box ul { list-style: none; padding: 0; margin: 2px 0; }
      .bw-terms-box li { margin-bottom: 1.5px; }
      .bw-footer { text-align: center; font-size: 9.5px; color: #000 !important; line-height: 1.35; margin-top: 4px; }
      .bw-footer p { margin: 1.5px 0; }
      .bw-footer-farewell { font-size: 11px; font-weight: 800; }
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
      const q = isWeight ? (itm.qty < 1 ? `${Math.round(itm.qty * 1000)} جم` : `${parseFloat(itm.qty).toFixed(3)} كجم`) : `${itm.qty} قطعة`;
      text += `▪️ ${itm.name}\n   ${q} × ${parseFloat(itm.price).toFixed(2)} = ${(parseFloat(itm.price) * parseFloat(itm.qty)).toFixed(2)} ج.م\n`;
    });

    text += `---------------------------------\n`;
    if (parseFloat(inv.discount) > 0) {
      text += `الخصم: -${parseFloat(inv.discount).toFixed(2)} ج.م\n`;
    }
    if (parseFloat(inv.payment_fee || 0) > 0) {
      text += `رسوم دفع إلكتروني (${inv.payment_method || 'إلكتروني'}): +${parseFloat(inv.payment_fee).toFixed(2)} ج.م\n`;
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
      const gramsVal = Math.round(item.qty * 1000);
      const qtyLabel = isWeight ? (item.qty < 1 ? `${gramsVal} جم` : `${parseFloat(item.qty).toFixed(3)} كجم`) : item.qty;

      return `
        <div class="p-2 sm:p-2.5 bg-gray-50 dark:bg-gray-700/50 rounded-2xl border border-gray-200/90 dark:border-gray-600/70 shadow-2xs flex items-center justify-between gap-2 cart-item-highlight transition">
          
          <!-- Product Name & Unit Price -->
          <div class="flex-1 min-w-0">
            <h4 class="text-xs sm:text-sm font-bold text-gray-900 dark:text-white truncate" title="${item.name}">${item.name}</h4>
            <div class="flex items-center gap-1.5 mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
              <span class="font-bold text-indigo-600 dark:text-indigo-400 font-mono">${item.price.toFixed(2)} ج.م${isWeight ? '/كجم' : ''}</span>
              ${item.local_code ? `<span class="px-1.5 py-0.2 bg-gray-200 dark:bg-gray-600 rounded text-[9px] font-mono font-bold">${item.local_code}</span>` : ''}
              ${isWeight ? `<span class="px-1.5 py-0.2 bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 rounded text-[9px] font-bold">⚖️ ${gramsVal} جم</span>` : ''}
              ${item.is_pack ? `<span class="px-1.5 py-0.2 bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 rounded text-[9px] font-bold">📦 كرتونة (خصم ${item.pack_multiplier || 1})</span>` : ''}
            </div>
          </div>

          <!-- Quantity / Weight Control -->
          <div class="flex items-center gap-1 bg-white dark:bg-gray-800 rounded-xl p-0.5 shrink-0 border border-gray-200 dark:border-gray-600 shadow-2xs">
            <button onclick="window.cart.updateQty('${item.cart_key || item.product_id}', ${prevQty})" class="w-6 h-6 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 flex items-center justify-center font-bold text-xs cursor-pointer active:scale-95 transition" title="تقليل">-</button>
            
            <span onclick="${isWeight ? `window.app.openWeightModalForItem(${item.product_id})` : ''}" class="px-1 text-center font-mono font-bold text-xs text-gray-900 dark:text-white ${isWeight ? 'cursor-pointer hover:text-amber-600 underline' : ''}" title="${isWeight ? `الوزن: ${gramsVal} جم (${parseFloat(item.qty).toFixed(3)} كجم) - اضغط للتعديل بالجرام` : ''}">
              ${qtyLabel}
            </span>

            <button onclick="window.cart.updateQty('${item.cart_key || item.product_id}', ${nextQty})" class="w-6 h-6 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center font-bold text-xs cursor-pointer shadow-2xs active:scale-95 transition" title="زيادة">+</button>
          </div>

          <!-- Total & Remove -->
          <div class="text-left shrink-0 min-w-[55px]">
            <div class="text-xs sm:text-sm font-black text-indigo-600 dark:text-indigo-400 font-mono">${(item.price * item.qty).toFixed(2)}</div>
            <button onclick="window.cart.removeItem('${item.cart_key || item.product_id}')" class="text-[10px] text-rose-500 hover:text-rose-700 font-bold hover:underline transition cursor-pointer">حذف ✕</button>
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

  async syncCompletedOrdersFromCloud() {
    try {
      if (!window.api || !window.api.getCompletedOrders) return this.getCompletedOrders();
      const res = await window.api.getCompletedOrders(100);
      if (res && res.success && Array.isArray(res.orders) && res.orders.length > 0) {
        const local = this.getCompletedOrders();
        const map = new Map();
        res.orders.forEach(o => map.set(String(o.order_id || o.id), o));
        local.forEach(o => {
          const id = String(o.order_id || o.id);
          if (!map.has(id)) map.set(id, o);
        });
        const merged = Array.from(map.values()).sort((a, b) => {
          const idA = parseInt(a.order_id || a.id || 0);
          const idB = parseInt(b.order_id || b.id || 0);
          return idB - idA;
        });
        localStorage.setItem('pos_completed_orders', JSON.stringify(merged.slice(0, 200)));
        if (!this.lastInvoice && merged.length > 0) {
          this.lastInvoice = merged[0];
        }
        return merged;
      }
    } catch(e) {
      console.warn('Orders cloud sync error:', e);
    }
    return this.getCompletedOrders();
  }

  async navigateInvoice(step) {
    let orders = this.getCompletedOrders();
    if (!orders || orders.length === 0) {
      window.app?.showLoading(true, 'جاري مزامنة الفواتير من السحابة...');
      orders = await this.syncCompletedOrdersFromCloud();
      window.app?.showLoading(false);
    }

    if (!orders || orders.length === 0) {
      window.app?.showToast('لا توجد فواتير سابقة مسجلة على هذا الجهاز أو السيرفر', 'info');
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
