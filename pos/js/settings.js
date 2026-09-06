/**
 * Syrian Home POS - Store, Printing, Payment Fees & Data Management Controller (v2.5.2)
 * Manages store branding, thermal printing, dynamic payment method taxes/fees, and system reset operations.
 */

class SettingsController {
  constructor() {
    this.defaults = {
      store_name: 'سوبر ماركت المنزل السوري',
      store_phone: '01000000000',
      store_phone2: '',
      store_address: 'فرع السوبر ماركت الرئيسي',
      receipt_sub: 'أشهى المنتجات والمنتجات السورية الأصلية',
      receipt_footer: 'شكراً لزيارتكم سوبر ماركت المنزل السوري • يُرجى الاحتفاظ بالفاتورة للاسترجاع',
      paper_width: '80mm',
      api_url: 'https://supermarkrt.almagd555.com/api_sync.php',
      api_token: 'syrian_home_pos_secret_token_2026',
      // Payment Method Fees / Taxes (ضرائب ورسوم وسائل الدفع الإلكتروني)
      enable_payment_fee: true,
      instapay_fee_type: 'percent', // 'percent' or 'fixed'
      instapay_fee_val: 0,
      vodafone_fee_type: 'percent', // 'percent' or 'fixed'
      vodafone_fee_val: 0,
      card_fee_type: 'percent', // 'percent' or 'fixed'
      card_fee_val: 0
    };

    this.settings = this.loadSettings();
  }

  loadSettings() {
    try {
      const saved = localStorage.getItem('syrian_home_pos_settings');
      if (saved) {
        return { ...this.defaults, ...JSON.parse(saved) };
      }
    } catch (e) {}
    return { ...this.defaults };
  }

  initForm() {
    const s = this.settings;
    if (document.getElementById('set-store-name')) document.getElementById('set-store-name').value = s.store_name || '';
    if (document.getElementById('set-store-phone')) document.getElementById('set-store-phone').value = s.store_phone || '';
    if (document.getElementById('set-store-phone2')) document.getElementById('set-store-phone2').value = s.store_phone2 || '';
    if (document.getElementById('set-store-address')) document.getElementById('set-store-address').value = s.store_address || '';
    if (document.getElementById('set-receipt-sub')) document.getElementById('set-receipt-sub').value = s.receipt_sub || '';
    if (document.getElementById('set-receipt-footer')) document.getElementById('set-receipt-footer').value = s.receipt_footer || '';
    if (document.getElementById('set-paper-width')) document.getElementById('set-paper-width').value = s.paper_width || '80mm';
    if (document.getElementById('set-api-url')) document.getElementById('set-api-url').value = s.api_url || '';
    if (document.getElementById('set-api-token')) document.getElementById('set-api-token').value = s.api_token || '';

    // Payment Fee Inputs
    if (document.getElementById('set-enable-payment-fee')) {
      document.getElementById('set-enable-payment-fee').checked = s.enable_payment_fee !== false;
    }
    if (document.getElementById('set-instapay-fee-val')) document.getElementById('set-instapay-fee-val').value = s.instapay_fee_val || 0;
    if (document.getElementById('set-instapay-fee-type')) document.getElementById('set-instapay-fee-type').value = s.instapay_fee_type || 'percent';
    if (document.getElementById('set-vodafone-fee-val')) document.getElementById('set-vodafone-fee-val').value = s.vodafone_fee_val || 0;
    if (document.getElementById('set-vodafone-fee-type')) document.getElementById('set-vodafone-fee-type').value = s.vodafone_fee_type || 'percent';
    if (document.getElementById('set-card-fee-val')) document.getElementById('set-card-fee-val').value = s.card_fee_val || 0;
    if (document.getElementById('set-card-fee-type')) document.getElementById('set-card-fee-type').value = s.card_fee_type || 'percent';
  }

  saveSettings() {
    const newSettings = {
      store_name: document.getElementById('set-store-name')?.value.trim() || this.defaults.store_name,
      store_phone: document.getElementById('set-store-phone')?.value.trim() || '',
      store_phone2: document.getElementById('set-store-phone2')?.value.trim() || '',
      store_address: document.getElementById('set-store-address')?.value.trim() || '',
      receipt_sub: document.getElementById('set-receipt-sub')?.value.trim() || '',
      receipt_footer: document.getElementById('set-receipt-footer')?.value.trim() || '',
      paper_width: document.getElementById('set-paper-width')?.value || '80mm',
      api_url: document.getElementById('set-api-url')?.value.trim() || this.defaults.api_url,
      api_token: document.getElementById('set-api-token')?.value.trim() || this.defaults.api_token,
      // Payment Fees
      enable_payment_fee: document.getElementById('set-enable-payment-fee') ? document.getElementById('set-enable-payment-fee').checked : true,
      instapay_fee_val: Math.max(0, parseFloat(document.getElementById('set-instapay-fee-val')?.value || 0)),
      instapay_fee_type: document.getElementById('set-instapay-fee-type')?.value || 'percent',
      vodafone_fee_val: Math.max(0, parseFloat(document.getElementById('set-vodafone-fee-val')?.value || 0)),
      vodafone_fee_type: document.getElementById('set-vodafone-fee-type')?.value || 'percent',
      card_fee_val: Math.max(0, parseFloat(document.getElementById('set-card-fee-val')?.value || 0)),
      card_fee_type: document.getElementById('set-card-fee-type')?.value || 'percent'
    };

    this.settings = newSettings;
    localStorage.setItem('syrian_home_pos_settings', JSON.stringify(newSettings));

    // Update Brand Name in Header
    const brandTitle = document.getElementById('brand-store-name');
    if (brandTitle) brandTitle.textContent = newSettings.store_name;

    // Update API client parameters if configured
    if (window.api) {
      window.api.baseUrl = newSettings.api_url;
      window.api.apiKey = newSettings.api_token;
    }

    window.posScanner?.playSuccessBeep?.();
    window.app?.showToast('تم حفظ إعدادات المتجر ورسوم الدفع بنجاح ✅', 'success');
  }

  getStoreInfo() {
    return this.settings;
  }

  getPaymentMethodFee(method) {
    const s = this.settings;
    if (!s.enable_payment_fee) return { type: 'percent', val: 0 };
    if (method === 'instapay') {
      return { type: s.instapay_fee_type || 'percent', val: parseFloat(s.instapay_fee_val || 0) };
    }
    if (method === 'vodafone_cash') {
      return { type: s.vodafone_fee_type || 'percent', val: parseFloat(s.vodafone_fee_val || 0) };
    }
    if (method === 'card') {
      return { type: s.card_fee_type || 'percent', val: parseFloat(s.card_fee_val || 0) };
    }
    return { type: 'percent', val: 0 };
  }

  /* ==================== SYSTEM RESET & DATA WIPE ==================== */
  async triggerSystemReset(mode) {
    let modeTitle = '';
    let confirmMsg = '';

    if (mode === 'zero_quantities_and_balances') {
      modeTitle = 'تصفير الحسابات والكميات فقط';
      confirmMsg = 'هل أنت متأكد من تصفير جميع كميات المخزون (Stock = 0) وتصفير أرصدة الموردين والدليفري وعدادات العملاء؟\n\n(ملاحظة: سيتم الحفاظ التام على قائمة المنتجات والأسعار والباركود وقوائم العملاء والموردين).';
    } else if (mode === 'wipe_sales_and_operations') {
      modeTitle = 'حذف سجلات الفواتير والمبيعات والعمليات';
      confirmMsg = 'تحذير هام: هل أنت متأكد من حذف جميع سجلات فواتير المبيعات، المشتريات، المصروفات العامة، وحركات السلات المتروكة؟\n\n(ملاحظة: سيتم الحفاظ التام على كتالوج المنتجات وقائمة العملاء).';
    } else if (mode === 'factory_reset_all') {
      modeTitle = 'إعادة ضبط المصنع ومسح شامل للبيانات';
      const wipeProducts = document.getElementById('set-factory-wipe-products')?.checked ? 1 : 0;
      confirmMsg = `⚠️ تحذير خطير جداً وغير قابل للتراجع:\nأنت على وشك مسح شامل لجميع بيانات المتجر السحابية والمحلية وإعادة ضبط المصنع!${wipeProducts ? '\n\n🚨 تم تحديد خيار: حذف كتالوج وقائمة المنتجات تماماً!' : '\n(سيتم الإبقاء على قائمة المنتجات فقط ومسح كل ما عداها)'}\n\nاكتب كلمة "تأكيد" في المربع أدناه للمتابعة:`;
    }

    if (mode === 'factory_reset_all') {
      const userInput = prompt(confirmMsg);
      if (userInput !== 'تأكيد') {
        window.app?.showToast('تم إلغاء عملية إعادة ضبط المصنع', 'info');
        return;
      }
    } else {
      if (!confirm(confirmMsg)) return;
    }

    try {
      window.app?.showLoading(true, `جاري تنفيذ ${modeTitle}...`);
      const wipeProducts = document.getElementById('set-factory-wipe-products')?.checked ? 1 : 0;
      
      const res = await window.api.systemReset(mode, wipeProducts);
      window.app?.showLoading(false);

      if (res && res.success) {
        // Clear local caches accordingly
        if (mode === 'zero_quantities_and_balances') {
          if (window.inventoryController?.products) {
            window.inventoryController.products.forEach(p => p.stock = 0);
            window.inventoryController.renderInventoryTable?.();
          }
        } else if (mode === 'wipe_sales_and_operations') {
          localStorage.removeItem('pos_completed_orders');
          localStorage.removeItem('pos_held_carts');
          localStorage.removeItem('pos_offline_orders');
          if (window.cart) window.cart.clearCart();
          if (window.ordersController) {
            window.ordersController.orders = [];
            window.ordersController.render?.();
          }
        } else if (mode === 'factory_reset_all') {
          localStorage.removeItem('pos_completed_orders');
          localStorage.removeItem('pos_held_carts');
          localStorage.removeItem('pos_offline_orders');
          if (window.cart) window.cart.clearCart();
          if (wipeProducts && window.inventoryController) {
            window.inventoryController.products = [];
            window.inventoryController.renderInventoryTable?.();
          }
        }

        // Reload fresh data from cloud server
        try {
          await window.inventoryController?.loadProducts();
          await window.app?.loadDeliveryDrivers();
        } catch (syncErr) {
          console.warn('Sync after reset error:', syncErr);
        }

        window.posScanner?.playSuccessBeep?.();
        alert(res.message || 'تمت العملية بنجاح! ✅');
        window.app?.showToast(res.message || 'تمت العملية بنجاح! ✅', 'success');
      } else {
        alert(res?.error || 'فشلت العملية. يرجى التأكد من الاتصال بالسيرفر.');
        window.app?.showToast(res?.error || 'فشلت العملية', 'error');
      }
    } catch (err) {
      window.app?.showLoading(false);
      console.error('System reset error:', err);
      alert('خطأ أثناء تنفيذ العملية: ' + (err.message || err));
      window.app?.showToast('خطأ: ' + (err.message || err), 'error');
    }
  }
}

window.settingsController = new SettingsController();
