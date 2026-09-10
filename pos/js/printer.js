/**
 * Syrian Home POS - Advanced Thermal Receipt Printer Controller (v3.0.0)
 * يدعم جميع أنواع الطباعة الحرارية المتطورة:
 * 1. Kiosk PC Silent Print: طباعة صامتة فورية لطابعة الكمبيوتر المعرفة في الويندوز بدون نافذة كروم.
 * 2. WebUSB / WebSerial ESC/POS: اتصال مباشر بطابعات USB الموصولة بالكمبيوتر.
 * 3. Web Bluetooth API: طباعة لاسلكية مباشرة لطابعات البلوتوث (ESC/POS).
 * 4. RawBT Android Driver: طباعة فورية للأجهزة اللوحية والهواتف الذكية.
 * 5. Chrome Print Dialog: طباعة متصفح كروم التقليدية.
 * 6. Internal Preview: معاينة بالتطبيق فقط.
 */

class POSPrinterController {
  constructor() {
    this.btDevice = null;
    this.btCharacteristic = null;
    this.usbDevice = null;
    this.usbInterface = null;
    this.usbEndpointOut = null;
    this.isPrinting = false;
    this.init();
  }

  init() {
    this.settings = this.loadPrinterSettings();
  }

  loadPrinterSettings() {
    const defaults = {
      print_mode: 'kiosk_pc', // 'kiosk_pc' (الافتراضي: طابعة الكمبيوتر المعرفة بدون كروم), 'usb', 'bluetooth', 'rawbt', 'browser', 'preview'
      paper_width: '80mm',    // '80mm' أو '58mm'
      auto_print: true,       // طباعة تلقائية عند الدفع أو F5
      copies: 1,              // عدد النسخ (1 أو 2)
      auto_cut: true,         // قص الورق تلقائياً
      open_drawer: false,     // فتح درج الكاشير
      paired_bt_name: localStorage.getItem('pos_bt_printer_name') || '',
      usb_printer_name: localStorage.getItem('pos_usb_printer_name') || ''
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

  /* ==================== 1. طابعة الكمبيوتر المعرفة بدون كروم (KIOSK SILENT PRINT) ==================== */

  printViaKioskPC(invoice) {
    if (!invoice) invoice = window.cart?.lastInvoice;
    if (!invoice) {
      window.app?.showToast('لا توجد فاتورة للطباعة', 'warning');
      return;
    }

    if (this.isPrinting) return;
    this.isPrinting = true;
    setTimeout(() => { this.isPrinting = false; }, 2000);

    try {
      const paperWidth = this.settings.paper_width || '80mm';
      const numCopies = parseInt(this.settings.copies, 10) || 1;
      const receiptHTML = window.cart ? window.cart.buildReceiptHTML(invoice) : '';
      const styles = this.getThermalPrintStyles(paperWidth);

      // Build printable copies HTML
      let copiesHTML = '';
      for (let i = 0; i < numCopies; i++) {
        copiesHTML += `
          <div class="receipt-print-wrapper ${i > 0 ? 'page-break-before' : ''}">
            ${i > 0 ? '<div style="text-align:center; font-size:10px; font-weight:bold; padding:2px 0; border-bottom:1px dashed #000; margin-bottom:4px;">--- نسخة ثانية (المحل) ---</div>' : ''}
            ${receiptHTML}
          </div>
        `;
      }

      let printFrame = document.getElementById('pos-kiosk-print-frame');
      if (printFrame) printFrame.remove();

      printFrame = document.createElement('iframe');
      printFrame.id = 'pos-kiosk-print-frame';
      // Hidden off-screen, full opacity for crisp thermal rendering
      printFrame.setAttribute('style', 'position:fixed; top:0; left:-10000px; width:76mm; height:100vh; border:0; z-index:-9999; pointer-events:none;');
      document.body.appendChild(printFrame);

      const frameDoc = printFrame.contentWindow.document;
      frameDoc.open();
      frameDoc.write(`
        <!DOCTYPE html>
        <html dir="rtl" lang="ar">
        <head>
          <meta charset="UTF-8">
          <title>فاتورة #${invoice.order_id}</title>
          <style>${styles}</style>
        </head>
        <body>
          ${copiesHTML}
        </body>
        </html>
      `);
      frameDoc.close();

      // Render barcode in the iframe if JsBarcode is loaded
      if (window.JsBarcode) {
        try {
          const barcodeEls = printFrame.contentWindow.document.querySelectorAll('.receipt-svg-barcode');
          barcodeEls.forEach(el => {
            const code = el.getAttribute('data-barcode') || (invoice.invoice_barcode || `INV-${invoice.order_id}`);
            window.JsBarcode(el, code, {
              format: 'CODE128',
              width: paperWidth === '58mm' ? 1.2 : 1.5,
              height: 36,
              displayValue: false,
              margin: 1
            });
          });
        } catch (bErr) {
          console.warn('Iframe barcode error:', bErr);
        }
      }

      window.app?.showToast(`جاري الطباعة الصامتة لطابعة الكمبيوتر المعرفة #${invoice.order_id} 🖨️⚡`, 'info');

      // Trigger print after rendering
      requestAnimationFrame(() => {
        setTimeout(() => {
          try {
            printFrame.contentWindow.focus();
            printFrame.contentWindow.print();
          } catch (pErr) {
            console.warn('Kiosk print error:', pErr);
          }
        }, 200);
      });

    } catch (e) {
      console.warn('printViaKioskPC error:', e);
      window.app?.showToast(`خطأ في الطباعة الصامتة: ${e.message}`, 'error');
    }
  }

  getThermalPrintStyles(paperWidth = '80mm') {
    const is58 = paperWidth === '58mm';
    const pageW = is58 ? '58mm' : '80mm';
    const contentW = is58 ? '52mm' : '76mm';
    const baseFontSize = is58 ? '10px' : '11px';

    return `
      @page {
        size: ${pageW} auto;
        margin: 0;
      }
      * {
        box-sizing: border-box;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      html, body {
        width: 100%;
        margin: 0;
        padding: 0;
        background: #ffffff !important;
        color: #000000 !important;
        font-family: 'Cairo', -apple-system, BlinkMacSystemFont, 'Segoe UI', Tahoma, Arial, sans-serif;
        font-size: ${baseFontSize};
        direction: rtl;
        text-align: right;
        line-height: 1.35;
      }
      .receipt-print-wrapper {
        width: ${contentW};
        margin: 0 auto;
        padding: 2mm 1mm;
      }
      .page-break-before {
        page-break-before: always;
        break-before: page;
        margin-top: 5mm;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        font-size: inherit;
      }
      th, td {
        padding: 2px 1px;
      }
      .text-center { text-align: center; }
      .text-left { text-align: left; }
      .text-right { text-align: right; }
      .font-bold { font-weight: bold; }
      .font-mono { font-family: monospace; }
      .no-print { display: none !important; }
      hr, .divider {
        border: none;
        border-top: 1px dashed #000;
        margin: 4px 0;
      }
    `;
  }

  /* ==================== 2. طابعة USB المباشرة للكمبيوتر (WEB USB ESC/POS) ==================== */

  isUsbSupported() {
    return !!(navigator && navigator.usb);
  }

  async connectUSB() {
    if (!this.isUsbSupported()) {
      window.app?.showToast('متصفحك لا يدعم WebUSB، يرجى استخدام متصفح Chrome أو خيار طابعة الكمبيوتر الصامتة (Kiosk)', 'warning');
      return false;
    }

    try {
      window.app?.showLoading(true, 'يرجى اختيار طابعة الـ USB المعرفة من القائمة المنبثقة...');

      // Common Thermal Printer USB Class 0x07 (Printers)
      const device = await navigator.usb.requestDevice({
        filters: [{ classCode: 0x07 }]
      }).catch(async () => {
        // Fallback: request any USB device if classCode filter is strict
        return await navigator.usb.requestDevice({ filters: [] });
      });

      if (!device) throw new Error('لم يتم اختيار أي جهاز');

      await device.open();
      await device.selectConfiguration(1);

      // Find printer interface & OUT endpoint
      let outEndpoint = null;
      let targetInterface = null;

      for (const iface of device.configuration.interfaces) {
        for (const alt of iface.alternates) {
          for (const ep of alt.endpoints) {
            if (ep.direction === 'out') {
              outEndpoint = ep.endpointNumber;
              targetInterface = iface.interfaceNumber;
              break;
            }
          }
          if (outEndpoint) break;
        }
        if (outEndpoint) break;
      }

      if (!outEndpoint) {
        throw new Error('لم يتم العثور على منفذ إرسال بيانات الطباعة في هذا الجهاز');
      }

      await device.claimInterface(targetInterface);

      this.usbDevice = device;
      this.usbInterface = targetInterface;
      this.usbEndpointOut = outEndpoint;

      const devName = device.productName || 'طابعة USB حرارية';
      this.settings.usb_printer_name = devName;
      localStorage.setItem('pos_usb_printer_name', devName);

      window.app?.showLoading(false);
      window.app?.showToast(`تم اقتران طابعة الـ USB بنجاح: ${devName} 🔌✅`, 'success');
      return true;

    } catch (err) {
      window.app?.showLoading(false);
      if (err.name !== 'NotFoundError') {
        console.warn('USB Connection failed:', err);
        window.app?.showToast(`تعذر الاتصال بطابعة USB: ${err.message}`, 'error');
      }
      return false;
    }
  }

  async sendUsbData(uint8Array) {
    if (!this.usbDevice || !this.usbDevice.opened) {
      const ok = await this.connectUSB();
      if (!ok) return false;
    }

    try {
      await this.usbDevice.transferOut(this.usbEndpointOut, uint8Array);
      return true;
    } catch (err) {
      console.warn('USB Transfer error:', err);
      // Try to re-claim interface
      try {
        await this.usbDevice.claimInterface(this.usbInterface);
        await this.usbDevice.transferOut(this.usbEndpointOut, uint8Array);
        return true;
      } catch (e2) {
        throw new Error('فشل إرسال البيانات لطابعة الـ USB: ' + err.message);
      }
    }
  }

  async printViaUSB(invoice) {
    if (!invoice) invoice = window.cart?.lastInvoice;
    if (!invoice) {
      window.app?.showToast('لا توجد فاتورة للطباعة', 'warning');
      return;
    }

    try {
      window.app?.showLoading(true, 'جاري الإرسال المباشر لطابعة USB... 🔌');
      const escPosData = this.buildEscPosCommands(invoice);
      const success = await this.sendUsbData(escPosData);
      window.app?.showLoading(false);
      if (success) {
        window.app?.showToast(`تمت طباعة فاتورة #${invoice.order_id} عبر USB مباشرة 🔌✅`, 'success');
      }
    } catch (e) {
      window.app?.showLoading(false);
      window.app?.showToast(`خطأ في طباعة USB: ${e.message} - جاري التحويل للطباعة الصامتة`, 'warning');
      this.printViaKioskPC(invoice);
    }
  }

  /* ==================== 3. طابعة البلوتوث المباشرة (WEB BLUETOOTH ESC/POS) ==================== */

  isBluetoothSupported() {
    return !!(navigator && navigator.bluetooth);
  }

  async connectBluetooth() {
    if (!this.isBluetoothSupported()) {
      window.app?.showToast('متصفحك لا يدعم Web Bluetooth، يرجى استخدام متصفح Chrome على هاتف/كمبيوتر يدعم البلوتوث', 'warning');
      return false;
    }

    try {
      window.app?.showLoading(true, 'جاري البحث عن طابعات البلوتوث القريبة...');

      const serviceUUIDs = [
        '000018f0-0000-1000-8000-00805f9b34fb', // Standard POS
        'e7810a71-73ae-499d-8c15-faa9aef0c3f2', // Mini POS
        '49535343-fe7d-4ae5-8fa9-9fafd205e455', // ISSC
        '0000ffe0-0000-1000-8000-00805f9b34fb'  // Serial BLE
      ];

      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: serviceUUIDs
      });

      if (!device) throw new Error('لم يتم اختيار أي جهاز');

      this.btDevice = device;
      const devName = device.name || 'طابعة حرارية بلوتوث';
      this.settings.paired_bt_name = devName;
      localStorage.setItem('pos_bt_printer_name', devName);

      window.app?.showLoading(true, `جاري الاتصال بالطابعة (${devName})...`);

      const server = await device.gatt.connect();

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
      window.app?.showToast(`تم الاتصال بنجاح بالطابعة: ${devName} 📶✅`, 'success');
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

  /* ==================== 4. تطبيق RAWBT للأندرويد (RAWBT DRIVER) ==================== */

  printViaRawBT(invoice) {
    if (!invoice) invoice = window.cart?.lastInvoice;
    if (!invoice) {
      window.app?.showToast('لا توجد فاتورة للطباعة', 'warning');
      return;
    }

    try {
      const receiptHTML = window.cart ? window.cart.buildReceiptHTML(invoice) : '';
      const styles = this.getThermalPrintStyles(this.settings.paper_width || '80mm');

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

      const base64Data = btoa(unescape(encodeURIComponent(fullDoc)));
      window.app?.showToast('جاري إرسال الفاتورة لتطبيق RawBT للطباعة الفورية 📲🖨️', 'info');

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

  /* ==================== 5. نافذة كروم العادية (BROWSER PRINT) ==================== */

  printViaBrowser(invoice) {
    if (!invoice) invoice = window.cart?.lastInvoice;
    if (!invoice) return;
    window.cart?.printInvoice(invoice);
  }

  /* ==================== DISPATCH PRINT (بناءً على اختيار المستخدم في الإعدادات) ==================== */

  printReceipt(invoice, forceMode = null) {
    if (!invoice) invoice = window.cart?.lastInvoice;
    if (!invoice) return;

    const mode = forceMode || this.settings.print_mode || 'kiosk_pc';

    switch (mode) {
      case 'kiosk_pc':
        this.printViaKioskPC(invoice);
        break;
      case 'usb':
        this.printViaUSB(invoice);
        break;
      case 'bluetooth':
        this.printViaBluetooth(invoice);
        break;
      case 'rawbt':
        this.printViaRawBT(invoice);
        break;
      case 'browser':
        this.printViaBrowser(invoice);
        break;
      case 'preview':
      default:
        window.cart?.showReceiptModal(invoice);
        window.app?.showToast(`تم حفظ الفاتورة #${invoice.order_id} بنجاح 💾✅`, 'success');
        break;
    }
  }

  /* ==================== طباعة فاتورة فحص وتجربة (TEST RECEIPT) ==================== */

  printTestReceipt() {
    const store = window.settingsController ? window.settingsController.getStoreInfo() : { store_name: 'سوبر ماركت المنزل السوري' };
    const testInv = {
      order_id: 'TEST-' + Math.floor(1000 + Math.random() * 9000),
      created_at: new Date().toLocaleString('ar-EG'),
      customer_name: 'فحص وتجربة الطابعة',
      phone: store.store_phone || '01000000000',
      address: store.store_address || 'الفرع الرئيسي',
      cashier: 'مسؤول النظام',
      order_type: 'hall',
      payment_method: 'نقدي',
      items: [
        { name: 'تجربة خط عربي ومحاذاة 1', qty: 1, price: 50.00, total: 50.00, unit: 'قطعة' },
        { name: 'تجربة وزن ومقاسات 2', qty: 1.5, price: 40.00, total: 60.00, unit: 'كجم' }
      ],
      subtotal: 110.00,
      discount: 10.00,
      total: 100.00,
      paid_amount: 100.00,
      change: 0,
      invoice_barcode: 'TEST-123456',
      is_test: true
    };

    window.app?.showToast('جاري طباعة فاتورة تجريبية للتأكد من إعدادات الطابعة... 🖨️', 'info');
    this.printReceipt(testInv);
  }

  /* ==================== ESC/POS COMMAND BUILDER ==================== */

  buildEscPosCommands(inv) {
    const encoder = new TextEncoder();
    const bytes = [];

    const push = (...b) => bytes.push(...b);
    const pushText = (str) => {
      const encoded = encoder.encode(str);
      for (let i = 0; i < encoded.length; i++) bytes.push(encoded[i]);
    };

    const ESC = 0x1B;
    const GS = 0x1D;

    // 1. Initialize printer
    push(ESC, 0x40);

    // Open cash drawer if enabled (Pin 2: ESC p 0 25 250)
    if (this.settings.open_drawer) {
      push(ESC, 0x70, 0x00, 0x19, 0xFA);
    }

    // Arabic / UTF-8 mode
    push(ESC, 0x74, 0x00);

    // Center alignment
    push(ESC, 0x61, 0x01);

    // Store Title (Double height & width)
    const store = window.settingsController ? window.settingsController.getStoreInfo() : { store_name: 'سوبر ماركت المنزل السوري' };
    push(ESC, 0x21, 0x30);
    pushText(`${store.store_name || 'سوبر ماركت المنزل السوري'}\n`);

    // Subtitle
    push(ESC, 0x21, 0x00);
    push(ESC, 0x61, 0x01);
    pushText(`${store.receipt_sub || 'فاتورة مبيعات نقدية'}\n`);
    if (store.store_phone) pushText(`هاتف: ${store.store_phone}\n`);
    if (store.store_address) pushText(`${store.store_address}\n`);

    pushText('--------------------------------\n');

    // Invoice Meta
    push(ESC, 0x61, 0x02);
    pushText(`رقم الفاتورة: #${inv.order_id}\n`);
    pushText(`التاريخ: ${inv.created_at || new Date().toLocaleString('ar-EG')}\n`);
    pushText(`العميل: ${inv.customer_name || 'عميل نقدي'}\n`);
    if (inv.phone) pushText(`الهاتف: ${inv.phone}\n`);
    if (inv.cashier) pushText(`الكاشير: ${inv.cashier}\n`);

    pushText('--------------------------------\n');
    pushText('الصنف             الكمية  السعر  الإجمالي\n');
    pushText('--------------------------------\n');

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

    // Totals
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

    // Grand Total
    push(ESC, 0x21, 0x20);
    push(ESC, 0x61, 0x01);
    pushText(`المطلوب: ${parseFloat(inv.total || 0).toFixed(2)} ج.م\n`);

    push(ESC, 0x21, 0x00);
    if (inv.paid_amount && (inv.payment_method === 'cash' || inv.payment_method === 'نقدي' || !inv.payment_method)) {
      pushText(`المدفوع: ${parseFloat(inv.paid_amount).toFixed(2)} ج.م | الباقي: ${parseFloat(inv.change || 0).toFixed(2)} ج.م\n`);
    }

    // Barcode (Code128)
    const barcode = inv.invoice_barcode || `INV-${inv.order_id}`;
    push(ESC, 0x61, 0x01);
    push(GS, 0x68, 60);
    push(GS, 0x77, 2);
    push(GS, 0x6B, 73);
    push(barcode.length);
    pushText(barcode);
    pushText(`\n${barcode}\n`);

    pushText('--------------------------------\n');
    pushText(`${store.receipt_footer || 'شكراً لزيارتكم • يُرجى الاحتفاظ بالفاتورة'}\n`);
    pushText('الأسعار شاملة الضريبة\n');

    // Feed lines & Auto Cut
    pushText('\n\n\n\n');
    if (this.settings.auto_cut) {
      push(GS, 0x56, 0x01); // Full cut
    }

    return new Uint8Array(bytes);
  }

  /* ==================== 6. أداة تنزيل اختصار الطباعة الصامتة للويندوز ==================== */

  downloadWindowsSilentKioskBat() {
    const currentUrl = window.location.origin + window.location.pathname;
    const batContent = `@echo off
chcp 65001 >nul
title تشغيل كاشير سوبر ماركت المنزل السوري - طباعة صامتة فورية
echo ======================================================================
echo    سوبر ماركت المنزل السوري - تشغيل الكاشير بالطباعة الصامتة الفورية
echo ======================================================================
echo  جاري تشغيل المتصفح بوضع Kiosk Printing (الطباعة المباشرة لطابعة الكمبيوتر)...
echo.

set "URL=${currentUrl}"

if exist "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" (
    start "" "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --kiosk-printing --app="%URL%"
    goto done
)
if exist "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe" (
    start "" "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe" --kiosk-printing --app="%URL%"
    goto done
)
if exist "%LocalAppData%\\Google\\Chrome\\Application\\chrome.exe" (
    start "" "%LocalAppData%\\Google\\Chrome\\Application\\chrome.exe" --kiosk-printing --app="%URL%"
    goto done
)
if exist "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe" (
    start "" "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe" --kiosk-printing --app="%URL%"
    goto done
)

start msedge --kiosk-printing --app="%URL%"

:done
echo تم تشغيل الكاشير بالطباعة الصامتة بنجاح!
exit
`;

    const blob = new Blob([batContent], { type: 'application/x-bat;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'تشغيل_كاشير_المنزل_السوري_طباعة_صامتة.bat';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    window.app?.showToast('تم تنزيل ملف الاختصار بنجاح! ضعه على سطح المكتب وشغله لطباعة الفواتير فوراً بدون نافذة كروم 🚀✅', 'success');
  }

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
