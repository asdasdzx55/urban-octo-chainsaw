/**
 * Syrian Home POS - Store & Printing Settings Controller (إدارة إعدادات المتجر والفاتورة)
 * Manages store name, phone numbers, branch address, receipt header/footer, and API configuration.
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
      api_token: 'syrian_home_pos_secret_token_2026'
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
      api_token: document.getElementById('set-api-token')?.value.trim() || this.defaults.api_token
    };

    this.settings = newSettings;
    localStorage.setItem('syrian_home_pos_settings', JSON.stringify(newSettings));

    // Update Brand Name in Header
    const brandTitle = document.getElementById('brand-store-name');
    if (brandTitle) brandTitle.textContent = newSettings.store_name;

    // Update API client parameters if configured
    if (window.api) {
      window.api.baseUrl = newSettings.api_url;
      window.api.secretToken = newSettings.api_token;
    }

    window.posScanner?.playSuccessBeep();
    window.app?.showToast('تم حفظ إعدادات المتجر والفاتورة بنجاح ✅', 'success');
  }

  getStoreInfo() {
    return this.settings;
  }
}

window.settingsController = new SettingsController();
