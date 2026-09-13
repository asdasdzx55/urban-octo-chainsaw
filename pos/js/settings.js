/**
 * Syrian Home POS - Store, Printing, Payment Fees & Data Management Controller (v2.5.2)
 * Manages store branding, thermal printing, dynamic payment method taxes/fees, and system reset operations.
 */

class SettingsController {
  constructor() {
    this.defaults = {
      store_name: 'ط³ظˆط¨ط± ظ…ط§ط±ظƒطھ ط§ظ„ظ…ظ†ط²ظ„ ط§ظ„ط³ظˆط±ظٹ',
      store_phone: '01000000000',
      store_phone2: '',
      store_address: 'ظپط±ط¹ ط§ظ„ط³ظˆط¨ط± ظ…ط§ط±ظƒطھ ط§ظ„ط±ط¦ظٹط³ظٹ',
      receipt_sub: 'ط£ط´ظ‡ظ‰ ط§ظ„ظ…ظ†طھط¬ط§طھ ظˆط§ظ„ظ…ظ†طھط¬ط§طھ ط§ظ„ط³ظˆط±ظٹط© ط§ظ„ط£طµظ„ظٹط©',
      receipt_footer: 'ط´ظƒط±ط§ظ‹ ظ„ط²ظٹط§ط±طھظƒظ… ط³ظˆط¨ط± ظ…ط§ط±ظƒطھ ط§ظ„ظ…ظ†ط²ظ„ ط§ظ„ط³ظˆط±ظٹ â€¢ ظٹظڈط±ط¬ظ‰ ط§ظ„ط§ط­طھظپط§ط¸ ط¨ط§ظ„ظپط§طھظˆط±ط© ظ„ظ„ط§ط³طھط±ط¬ط§ط¹',
      paper_width: '80mm',
      api_url: 'https://syrianhouse.almagd555.com/api_sync.php',
      api_token: 'syrian_home_pos_secret_token_2026',
      // Payment Method Fees / Taxes (ط¶ط±ط§ط¦ط¨ ظˆط±ط³ظˆظ… ظˆط³ط§ط¦ظ„ ط§ظ„ط¯ظپط¹ ط§ظ„ط¥ظ„ظƒطھط±ظˆظ†ظٹ)
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

    // Printer behavior settings (ط¨ط¯ظˆظ† طµظپط­ط© ظƒط±ظˆظ…)
    if (window.printerController) {
      const ps = window.printerController.settings;
      if (document.getElementById('set-no-chrome-print')) {
        document.getElementById('set-no-chrome-print').checked = !ps.auto_open_browser_print;
      }
      if (document.getElementById('set-print-mode')) {
        document.getElementById('set-print-mode').value = ps.print_mode || 'preview';
      }
    }

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

    // Save Printer Controller Preferences
    if (window.printerController) {
      const noChrome = document.getElementById('set-no-chrome-print') ? document.getElementById('set-no-chrome-print').checked : true;
      const printMode = document.getElementById('set-print-mode')?.value || 'preview';
      window.printerController.savePrinterSettings({
        auto_open_browser_print: !noChrome,
        print_mode: printMode
      });
    }

    // Update Brand Name in Header
    const brandTitle = document.getElementById('brand-store-name');
    if (brandTitle) brandTitle.textContent = newSettings.store_name;

    // Update API client parameters if configured
    if (window.api) {
      window.api.baseUrl = newSettings.api_url;
      window.api.apiKey = newSettings.api_token;
    }

    window.posScanner?.playSuccessBeep?.();
    window.app?.showToast('طھظ… ط­ظپط¸ ط¥ط¹ط¯ط§ط¯ط§طھ ط§ظ„ظ…طھط¬ط± ظˆط±ط³ظˆظ… ط§ظ„ط¯ظپط¹ ط¨ظ†ط¬ط§ط­ âœ…', 'success');
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
      modeTitle = 'طھطµظپظٹط± ط§ظ„ط­ط³ط§ط¨ط§طھ ظˆط§ظ„ظƒظ…ظٹط§طھ ظپظ‚ط·';
      confirmMsg = 'ظ‡ظ„ ط£ظ†طھ ظ…طھط£ظƒط¯ ظ…ظ† طھطµظپظٹط± ط¬ظ…ظٹط¹ ظƒظ…ظٹط§طھ ط§ظ„ظ…ط®ط²ظˆظ† (Stock = 0) ظˆطھطµظپظٹط± ط£ط±طµط¯ط© ط§ظ„ظ…ظˆط±ط¯ظٹظ† ظˆط§ظ„ط¯ظ„ظٹظپط±ظٹ ظˆط¹ط¯ط§ط¯ط§طھ ط§ظ„ط¹ظ…ظ„ط§ط،طں\n\n(ظ…ظ„ط§ط­ط¸ط©: ط³ظٹطھظ… ط§ظ„ط­ظپط§ط¸ ط§ظ„طھط§ظ… ط¹ظ„ظ‰ ظ‚ط§ط¦ظ…ط© ط§ظ„ظ…ظ†طھط¬ط§طھ ظˆط§ظ„ط£ط³ط¹ط§ط± ظˆط§ظ„ط¨ط§ط±ظƒظˆط¯ ظˆظ‚ظˆط§ط¦ظ… ط§ظ„ط¹ظ…ظ„ط§ط، ظˆط§ظ„ظ…ظˆط±ط¯ظٹظ†).';
    } else if (mode === 'wipe_sales_and_operations') {
      modeTitle = 'ط­ط°ظپ ط³ط¬ظ„ط§طھ ط§ظ„ظپظˆط§طھظٹط± ظˆط§ظ„ظ…ط¨ظٹط¹ط§طھ ظˆط§ظ„ط¹ظ…ظ„ظٹط§طھ';
      confirmMsg = 'طھط­ط°ظٹط± ظ‡ط§ظ…: ظ‡ظ„ ط£ظ†طھ ظ…طھط£ظƒط¯ ظ…ظ† ط­ط°ظپ ط¬ظ…ظٹط¹ ط³ط¬ظ„ط§طھ ظپظˆط§طھظٹط± ط§ظ„ظ…ط¨ظٹط¹ط§طھطŒ ط§ظ„ظ…ط´طھط±ظٹط§طھطŒ ط§ظ„ظ…طµط±ظˆظپط§طھ ط§ظ„ط¹ط§ظ…ط©طŒ ظˆط­ط±ظƒط§طھ ط§ظ„ط³ظ„ط§طھ ط§ظ„ظ…طھط±ظˆظƒط©طں\n\n(ظ…ظ„ط§ط­ط¸ط©: ط³ظٹطھظ… ط§ظ„ط­ظپط§ط¸ ط§ظ„طھط§ظ… ط¹ظ„ظ‰ ظƒطھط§ظ„ظˆط¬ ط§ظ„ظ…ظ†طھط¬ط§طھ ظˆظ‚ط§ط¦ظ…ط© ط§ظ„ط¹ظ…ظ„ط§ط،).';
    } else if (mode === 'factory_reset_all') {
      modeTitle = 'ط¥ط¹ط§ط¯ط© ط¶ط¨ط· ط§ظ„ظ…طµظ†ط¹ ظˆظ…ط³ط­ ط´ط§ظ…ظ„ ظ„ظ„ط¨ظٹط§ظ†ط§طھ';
      const wipeProducts = document.getElementById('set-factory-wipe-products')?.checked ? 1 : 0;
      confirmMsg = `âڑ ï¸ڈ طھط­ط°ظٹط± ط®ط·ظٹط± ط¬ط¯ط§ظ‹ ظˆط؛ظٹط± ظ‚ط§ط¨ظ„ ظ„ظ„طھط±ط§ط¬ط¹:\nط£ظ†طھ ط¹ظ„ظ‰ ظˆط´ظƒ ظ…ط³ط­ ط´ط§ظ…ظ„ ظ„ط¬ظ…ظٹط¹ ط¨ظٹط§ظ†ط§طھ ط§ظ„ظ…طھط¬ط± ط§ظ„ط³ط­ط§ط¨ظٹط© ظˆط§ظ„ظ…ط­ظ„ظٹط© ظˆط¥ط¹ط§ط¯ط© ط¶ط¨ط· ط§ظ„ظ…طµظ†ط¹!${wipeProducts ? '\n\nًںڑ¨ طھظ… طھط­ط¯ظٹط¯ ط®ظٹط§ط±: ط­ط°ظپ ظƒطھط§ظ„ظˆط¬ ظˆظ‚ط§ط¦ظ…ط© ط§ظ„ظ…ظ†طھط¬ط§طھ طھظ…ط§ظ…ط§ظ‹!' : '\n(ط³ظٹطھظ… ط§ظ„ط¥ط¨ظ‚ط§ط، ط¹ظ„ظ‰ ظ‚ط§ط¦ظ…ط© ط§ظ„ظ…ظ†طھط¬ط§طھ ظپظ‚ط· ظˆظ…ط³ط­ ظƒظ„ ظ…ط§ ط¹ط¯ط§ظ‡ط§)'}\n\nط§ظƒطھط¨ ظƒظ„ظ…ط© "طھط£ظƒظٹط¯" ظپظٹ ط§ظ„ظ…ط±ط¨ط¹ ط£ط¯ظ†ط§ظ‡ ظ„ظ„ظ…طھط§ط¨ط¹ط©:`;
    }

    if (mode === 'factory_reset_all') {
      const userInput = prompt(confirmMsg);
      if (userInput !== 'طھط£ظƒظٹط¯') {
        window.app?.showToast('طھظ… ط¥ظ„ط؛ط§ط، ط¹ظ…ظ„ظٹط© ط¥ط¹ط§ط¯ط© ط¶ط¨ط· ط§ظ„ظ…طµظ†ط¹', 'info');
        return;
      }
    } else {
      if (!confirm(confirmMsg)) return;
    }

    try {
      window.app?.showLoading(true, `ط¬ط§ط±ظٹ طھظ†ظپظٹط° ${modeTitle}...`);
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
        alert(res.message || 'طھظ…طھ ط§ظ„ط¹ظ…ظ„ظٹط© ط¨ظ†ط¬ط§ط­! âœ…');
        window.app?.showToast(res.message || 'طھظ…طھ ط§ظ„ط¹ظ…ظ„ظٹط© ط¨ظ†ط¬ط§ط­! âœ…', 'success');
      } else {
        alert(res?.error || 'ظپط´ظ„طھ ط§ظ„ط¹ظ…ظ„ظٹط©. ظٹط±ط¬ظ‰ ط§ظ„طھط£ظƒط¯ ظ…ظ† ط§ظ„ط§طھطµط§ظ„ ط¨ط§ظ„ط³ظٹط±ظپط±.');
        window.app?.showToast(res?.error || 'ظپط´ظ„طھ ط§ظ„ط¹ظ…ظ„ظٹط©', 'error');
      }
    } catch (err) {
      window.app?.showLoading(false);
      console.error('System reset error:', err);
      alert('ط®ط·ط£ ط£ط«ظ†ط§ط، طھظ†ظپظٹط° ط§ظ„ط¹ظ…ظ„ظٹط©: ' + (err.message || err));
      window.app?.showToast('ط®ط·ط£: ' + (err.message || err), 'error');
    }
  }
}

window.settingsController = new SettingsController();

