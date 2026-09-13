/**
 * Syrian Home POS - Direct Thermal Printer Controller (v2.5.5)
 * يوفر إمكانية طباعة الفواتير الحرارية مباشرة بدون فتح نافذة/صفحة كروم (No Chrome Dialog):
 * 1. Web Bluetooth API: اتصال وطباعة مباشرة لطابعات البلوتوث (ESC/POS Raster & Text).
 * 2. RawBT Android Driver: إرسال مباشر لطابعات USB وبلوتوث على هواتف الأندرويد.
 * 3. Kiosk Printing Guide: إرشادات الطباعة الصامتة الفورية في كروم للكمبيوتر (--kiosk-printing).
 */

class POSPrinterController {
  constructor() {
    this.btDevice = null;
    this.btCharacteristic = null;
    this.isPrinting = false;
    this.init();
  }

  init() {
    // Load preference from localStorage
    this.settings = this.loadPrinterSettings();
  }

  loadPrinterSettings() {
    const defaults = {
      print_mode: 'preview', // 'preview' (معاينة بالتطبيق بدون كروم), 'bluetooth' (بلوتوث مباشر), 'rawbt' (تطبيق RawBT), 'browser' (كروم)
      auto_open_browser_print: false, // لا تفتح نافذة كروم تلقائياً عند الدفع!
      paper_width: '80mm',
      paired_bt_name: localStorage.getItem('pos_bt_printer_name') || ''
    };

    try {
      const saved = localStorage.getItem('pos_printer_prefs');
      if (saved) {
        return { ...defaults, ...JSON.parse(saved) };
      }
    } catch (e) {}

    return defaults;
  }

  savePrinterSettings(newPrefs) {
    this.settings = { ...this.settings, ...newPrefs };
    localStorage.setItem('pos_printer_prefs', JSON.stringify(this.settings));
  }

  isBluetoothSupported() {
    return !!(navigator && navigator.bluetooth);
  }

  /* ==================== WEB BLUETOOTH PRINTING (بدون كروم) ==================== */

  async connectBluetooth() {
    if (!this.isBluetoothSupported()) {
      window.app?.showToast('متصفحك لا يدعم Web Bluetooth، يرجى استخدام متصفح Chrome أو تجربة خيار RawBT', 'warning');
      return false;
    }

    try {
      window.app?.showLoading(true, 'جاري البحث عن طابعات البلوتوث القريبة...');

      // Common Thermal Printer Service UUIDs
      const serviceUUIDs = [
        '000018f0-0000-1000-8000-00805f9b34fb', // Standard POS Printers
        'e7810a71-73ae-499d-8c15-faa9aef0c3f2', // Mini POS
        '49535343-fe7d-4ae5-8fa9-9fafd205e455', // ISSC Transparent
        '0000ffe0-0000-1000-8000-00805f9b34fb'  // Serial BLE
      ];

      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: serviceUUIDs
      });

      if (!device) throw new Error('لم يتم اختيار أي جهاز');

      this.btDevice = device;
      localStorage.setItem('pos_bt_printer_name', device.name || 'طابعة حرارية بلوتوث');
      this.settings.paired_bt_name = device.name || 'طابعة حرارية بلوتوث';

      window.app?.showLoading(true, `جاري الاتصال بالطابعة (${device.name || 'بلوتوث'})...`);

      const server = await device.gatt.connect();
      
      // Look for write characteristic across supported services
      let targetCharacteristic = null;
      for (const sId of serviceUUIDs) {
        try {
          const service = await server.getPrimaryService(sId);
          if (service) {
            const characteristics = await service.getCharacteristics();
            for (const ch of characteristics) {
              if (ch.properties.write || ch.properties.writeWithoutResponse) {
                targetCharacteristic = ch;
                break;
              }
            }
          }
        } catch (errService) {}
        if (targetCharacteristic) break;
      }

      // If specific service not found, iterate all services
      if (!targetCharacteristic) {
        const services = await server.getPrimaryServices();
        for (const service of services) {
          try {
            const characteristics = await service.getCharacteristics();
            for (const ch of characteristics) {
              if (ch.properties.write || ch.properties.writeWithoutResponse) {
                targetCharacteristic = ch;
                break;
              }
            }
          } catch(e) {}
          if (targetCharacteristic) break;
        }
      }

      if (!targetCharacteristic) {
        throw new Error('تم الاتصال ولكن لم يتم العثور على منفذ الطباعة في الطابعة');
      }

      this.btCharacteristic = targetCharacteristic;
      window.app?.showLoading(false);
      window.app?.showToast(`تم الاتصال بنجاح بالطابعة: ${device.name || 'بلوتوث'} 📶✅`, 'success');
      return true;

    } catch (err) {
      window.app?.showLoading(false);
      if (err.name !== 'NotFoundError') {
        console.warn('Bluetooth connection failed:', err);
        window.app?.showToast(`تعذر الاتصال بالبلوتوث: ${err.message}`, 'error');
      }
      return false;
    }
  }

  async sendBluetoothData(uint8Array) {
    if (!this.btCharacteristic || !this.btDevice?.gatt?.connected) {
      const ok = await this.connectBluetooth();
      if (!ok) return false;
    }

    const CHUNK_SIZE = 128;
    for (let i = 0; i < uint8Array.length; i += CHUNK_SIZE) {
      const chunk = uint8Array.slice(i, i + CHUNK_SIZE);
      if (this.btCharacteristic.writeValueWithoutResponse) {
        await this.btCharacteristic.writeValueWithoutResponse(chunk);
      } else {
        await this.btCharacteristic.writeValue(chunk);
      }
      // Small pause between packets to prevent buffer overflow on mobile thermal printers
      await new Promise(r => setTimeout(r, 20));
    }
    return true;
  }

  async printViaBluetooth(invoice) {
    if (!invoice) invoice = window.cart?.lastInvoice;
    if (!invoice) {
      window.app?.showToast('لا توجد فاتورة للطباعة', 'warning');
      return;
    }

    if (this.isPrinting) return;
    this.isPrinting = true;
    setTimeout(() => { this.isPrinting = false; }, 3000);

    try {
      window.app?.showLoading(true, 'جاري إرسال الفاتورة للطابعة عبر البلوتوث... 📶');
      
      const escPosData = this.buildEscPosCommands(invoice);
      const success = await this.sendBluetoothData(escPosData);
      
      window.app?.showLoading(false);
      if (success) {
        window.app?.showToast(`تمت طباعة فاتورة #${invoice.order_id} عبر البلوتوث مباشرة 📶✅`, 'success');
      }
    } catch (e) {
      window.app?.showLoading(false);
      window.app?.showToast(`خطأ في إرسال الطباعة: ${e.message}`, 'error');
    }
  }

  buildEscPosCommands(inv) {
    const encoder = new TextEncoder();
    const bytes = [];

    // Helper to push ESC/POS command bytes
    const push = (...b) => bytes.push(...b);
    const pushText = (str) => {
      const encoded = encoder.encode(str);
      for (let i = 0; i < encoded.length; i++) bytes.push(encoded[i]);
    };

    const ESC = 0x1B;
    const GS = 0x1D;

    // 1. Initialize printer
    push(ESC, 0x40);

    // 2. Select Arabic / UTF-8 mode if available or standard
    push(ESC, 0x74, 0x00);

    // Center alignment
    push(ESC, 0x61, 0x01);

    // Double size for store title
    const store = window.settingsController ? window.settingsController.getStoreInfo() : { store_name: 'سوبر ماركت المنزل السوري' };
    push(ESC, 0x21, 0x30); // Double height & width
    pushText(`${store.store_name || 'سوبر ماركت المنزل السوري'}\n`);

    // Normal size
    push(ESC, 0x21, 0x00);
    push(ESC, 0x61, 0x01);
    pushText(`${store.receipt_sub || 'فاتورة مبيعات نقدية'}\n`);
    if (store.store_phone) pushText(`هاتف: ${store.store_phone}\n`);
    if (store.store_address) pushText(`${store.store_address}\n`);

    // Divider
    pushText('--------------------------------\n');

    // Right alignment for metadata
    push(ESC, 0x61, 0x02);
    pushText(`رقم الفاتورة: #${inv.order_id}\n`);
    pushText(`التاريخ: ${inv.created_at || new Date().toLocaleString('ar-EG')}\n`);
    pushText(`العميل: ${inv.customer_name || 'عميل نقدي'}\n`);
    if (inv.phone) pushText(`الهاتف: ${inv.phone}\n`);
    if (inv.cashier) pushText(`الكاشير: ${inv.cashier}\n`);

    // Items Header
    pushText('--------------------------------\n');
    pushText('الصنف             الكمية  السعر  الإجمالي\n');
    pushText('--------------------------------\n');

    // Items
    if (Array.isArray(inv.items)) {
      inv.items.forEach((item, idx) => {
        const name = (item.name || 'صنف').substring(0, 16);
        const qty = item.qty || 1;
        const price = (item.price || 0).toFixed(2);
        const total = (item.total || (qty * item.price)).toFixed(2);
        pushText(`${idx + 1}. ${name}\n`);
        pushText(`   ${qty} x ${price} = ${total} ج.م\n`);
      });
    }

    pushText('--------------------------------\n');

    // Financial Summary (Left / Right aligned)
    push(ESC, 0x61, 0x02);
    pushText(`المجموع: ${(inv.subtotal || inv.total || 0).toFixed(2)} ج.م\n`);
    if (inv.discount && parseFloat(inv.discount) > 0) {
      pushText(`الخصم: -${parseFloat(inv.discount).toFixed(2)} ج.م\n`);
    }
    if (inv.payment_fee && parseFloat(inv.payment_fee) > 0) {
      pushText(`رسوم الدفع: +${parseFloat(inv.payment_fee).toFixed(2)} ج.م\n`);
    }
    if (inv.delivery_fee && parseFloat(inv.delivery_fee) > 0) {
      pushText(`خدمة التوصيل: +${parseFloat(inv.delivery_fee).toFixed(2)} ج.م\n`);
    }

    // Grand Total (Bold & Large)
    push(ESC, 0x21, 0x20); // Double height
    push(ESC, 0x61, 0x01); // Center
    pushText(`المطلوب: ${parseFloat(inv.total || 0).toFixed(2)} ج.م\n`);

    // Normal text
    push(ESC, 0x21, 0x00);
    if (inv.paid_amount && (inv.payment_method === 'cash' || inv.payment_method === 'نقدي' || !inv.payment_method)) {
      pushText(`المدفوع: ${parseFloat(inv.paid_amount).toFixed(2)} ج.م | الباقي: ${parseFloat(inv.change || 0).toFixed(2)} ج.م\n`);
    }

    // Barcode (Code128)
    const barcode = inv.invoice_barcode || `INV-${inv.order_id}`;
    push(ESC, 0x61, 0x01); // Center
    push(GS, 0x68, 60);    // Height 60
    push(GS, 0x77, 2);     // Width 2
    push(GS, 0x6B, 73);    // Code128 format
    push(barcode.length);
    pushText(barcode);
    pushText(`\n${barcode}\n`);

    // Footer
    pushText('--------------------------------\n');
    pushText(`${store.receipt_footer || 'شكراً لزيارتكم • يُرجى الاحتفاظ بالفاتورة'}\n`);
    pushText('الأسعار شاملة الضريبة\n');

    // Feed lines & Cut paper
    pushText('\n\n\n\n');
    push(GS, 0x56, 0x01); // Full cut

    return new Uint8Array(bytes);
  }

  /* ==================== RAWBT ANDROID DIRECT PRINT (بدون كروم) ==================== */

  printViaRawBT(invoice) {
    if (!invoice) invoice = window.cart?.lastInvoice;
    if (!invoice) {
      window.app?.showToast('لا توجد فاتورة للطباعة', 'warning');
      return;
    }

    try {
      // Build clean self-contained thermal receipt HTML
      const receiptHTML = window.cart ? window.cart.buildReceiptHTML(invoice) : '';
      const styles = window.cart ? window.cart.getReceiptPrintStyles() : '';

      const fullDoc = `
        <!DOCTYPE html>
        <html dir="rtl" lang="ar">
        <head>
          <meta charset="UTF-8">
          <style>${styles}</style>
        </head>
        <body>
          ${receiptHTML}
        </body>
        </html>
      `;

      // Base64 encode for RawBT URL scheme
      const base64Data = btoa(unescape(encodeURIComponent(fullDoc)));
      
      window.app?.showToast('جاري إرسال الفاتورة لتطبيق RawBT للطباعة الفورية 📲🖨️', 'info');

      // First attempt: RawBT custom URL scheme
      const rawbtUri = `rawbt:data:text/html;base64,${base64Data}`;
      
      const frame = document.createElement('iframe');
      frame.style.display = 'none';
      frame.src = rawbtUri;
      document.body.appendChild(frame);
      setTimeout(() => frame.remove(), 2000);

    } catch (e) {
      console.warn('RawBT print failed:', e);
      window.app?.showToast('تعذر التحويل لتطبيق RawBT، يرجى التأكد من تثبيته على هاتفك', 'warning');
    }
  }

  /* ==================== DISPATCH PRINT (بناءً على اختيار المستخدم) ==================== */

  printReceipt(invoice, forceBrowser = false) {
    if (!invoice) invoice = window.cart?.lastInvoice;
    if (!invoice) return;

    if (forceBrowser) {
      window.cart?.printInvoice(invoice);
      return;
    }

    const mode = this.settings.print_mode || 'preview';

    if (mode === 'bluetooth') {
      this.printViaBluetooth(invoice);
    } else if (mode === 'rawbt') {
      this.printViaRawBT(invoice);
    } else if (mode === 'browser') {
      window.cart?.printInvoice(invoice);
    } else {
      // 'preview' / default:
      // Show receipt modal cleanly inside the app WITHOUT triggering Chrome print!
      window.cart?.showReceiptModal(invoice);
      window.app?.showToast(`تم حفظ الفاتورة #${invoice.order_id} بنجاح ✅`, 'success');
    }
  }

  /* ==================== KIOSK SILENT PRINTING GUIDE (للكمبيوتر) ==================== */

  showKioskGuideModal() {
    const modal = document.getElementById('kiosk-guide-modal');
    if (modal) {
      modal.classList.remove('hidden');
      modal.style.display = 'flex';
      if (window.lucide) window.lucide.createIcons();
    }
  }

  closeKioskGuideModal() {
    const modal = document.getElementById('kiosk-guide-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.style.display = 'none';
    }
  }
}

window.printerController = new POSPrinterController();
