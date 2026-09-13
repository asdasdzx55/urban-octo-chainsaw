/**
 * Syrian Home POS - Ultimate Thermal Receipt & Local Print Bridge Controller (v3.2.0)
 * يدعم كلاً من:
 * 1. مكتبة الربط المحلي QZ Tray (Local Print Bridge عبر WebSocket المباشر لطابعة الويندوز المعرفة).
 * 2. طابعة متصفح كروم (Kiosk Printing Mode بتنسيق حراري فائق الجودة والجمال).
 */

class POSPrinterController {
  constructor() {
    this.isPrinting = false;
    this.qzConnected = false;
    this.qzPrinterName = localStorage.getItem('pos_qz_printer_name') || '';
    this.qzPrinters = [];
    this.init();
  }

  init() {
    this.settings = this.loadPrinterSettings();
    // محاولة الاتصال التلقائي الصامت بمكتبة QZ Tray إذا كانت مشغلة على جهاز الكاشير
    setTimeout(() => {
      this.autoConnectQZ();
    }, 600);
  }

  loadPrinterSettings() {
    const defaults = {
      print_engine: 'auto',   // 'auto' (يفضل QZ Tray إن وجد، وإلا كروم), 'qz', 'chrome'
      use_qz_bridge: true,    // تفعيل مكتبة الربط المحلي
      qz_printer_name: localStorage.getItem('pos_qz_printer_name') || '',
      paper_width: '80mm',    // '80mm' أو '58mm'
      auto_print: true,       // طباعة تلقائية عند الدفع أو F5
      show_preview_after_sale: false, // تعطيل ظهور شاشة المعاينة بعد البيع لتسريع الكاشير!
      copies: 1,              // عدد النسخ (1 أو 2)
      auto_cut: true,         // قص الورق تلقائياً
      open_drawer: false      // فتح درج الكاشير
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

  /* ==================== 1. مكتبة الربط المحلي QZ TRAY (LOCAL PRINT BRIDGE) ==================== */

  async autoConnectQZ() {
    if (typeof qz === 'undefined') return;
    try {
      await this.connectQZ(true);
    } catch (e) {}
  }

  async connectQZ(silent = false) {
    if (typeof qz === 'undefined') {
      if (!silent) window.app?.showToast('مكتبة QZ Tray غير متوفرة في الصفحة', 'warning');
      return false;
    }

    try {
      // إعداد الشهادة الرقمية لـ QZ Tray لمنع النوافذ المزعجة
      if (!qz.security.getCertificatePromise) {
        qz.security.setCertificatePromise(function(resolve, reject) {
          resolve();
        });
      }
      if (!qz.security.getSignaturePromise) {
        qz.security.setSignaturePromise(function(toSign) {
          return function(resolve, reject) {
            resolve();
          };
        });
      }

      if (!qz.websocket.isActive()) {
        await qz.websocket.connect({ retries: 1, delay: 0.3 });
      }

      this.qzConnected = true;
      console.log('✅ Connected to QZ Tray Local Print Bridge');

      // جلب قائمة الطابعات المعرفة في نظام ويندوز
      try {
        const printers = await qz.printers.find();
        this.qzPrinters = printers || [];
        
        if (!this.qzPrinterName || !this.qzPrinters.includes(this.qzPrinterName)) {
          try {
            this.qzPrinterName = await qz.printers.getDefault();
          } catch (e) {
            this.qzPrinterName = this.qzPrinters[0] || '';
          }
          if (this.qzPrinterName) {
            localStorage.setItem('pos_qz_printer_name', this.qzPrinterName);
          }
        }
      } catch (pErr) {
        console.warn('QZ Printers list error:', pErr);
      }

      this.updateQZUI();

      if (!silent) {
        window.app?.showToast(`تم الاتصال بنجاح بمكتبة QZ Tray! الطابعة: ${this.qzPrinterName || 'الافتراضية'} ⚡🖨️`, 'success');
      }
      return true;

    } catch (err) {
      this.qzConnected = false;
      this.updateQZUI();
      if (!silent) {
        console.warn('QZ Connection failed:', err);
        window.app?.showToast('برنامج QZ Tray غير مشغل حالياً على جهازك. جاري الاعتماد على طابعة كروم المباشرة 👍', 'info');
      }
      return false;
    }
  }

  updateQZUI() {
    const statusBadge = document.getElementById('qz-bridge-status-badge');
    const printerSelect = document.getElementById('qz-printer-select');
    const qzBox = document.getElementById('qz-bridge-box');

    if (statusBadge) {
      if (this.qzConnected) {
        statusBadge.innerHTML = `
          <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
            <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>QZ Tray متصل ومفعل ⚡</span>
          </span>
        `;
      } else {
        statusBadge.innerHTML = `
          <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
            <span>كروم Kiosk (جاهز) 🖨️</span>
          </span>
        `;
      }
    }

    if (printerSelect && this.qzPrinters && this.qzPrinters.length > 0) {
      printerSelect.innerHTML = this.qzPrinters.map(p => `
        <option value="${p}" ${p === this.qzPrinterName ? 'selected' : ''}>${p}</option>
      `).join('');
      printerSelect.disabled = false;
    }
  }

  async printViaQZ(invoice) {
    if (!invoice) invoice = window.cart?.lastInvoice;
    if (!invoice) return false;

    if (this.isPrinting) return false;
    this.isPrinting = true;
    setTimeout(() => { this.isPrinting = false; }, 1500);

    try {
      if (!this.qzConnected || !qz.websocket.isActive()) {
        const ok = await this.connectQZ(true);
        if (!ok) return false;
      }

      const printer = this.qzPrinterName || await qz.printers.getDefault();
      const paperWidth = this.settings.paper_width || '80mm';
      const is58 = paperWidth === '58mm';
      const wMM = is58 ? 58 : 80;
      const numCopies = parseInt(this.settings.copies, 10) || 1;

      const config = qz.configs.create(printer, {
        size: { width: wMM, height: null },
        units: 'mm',
        margins: 0,
        colorType: 'grayscale',
        copies: numCopies,
        scaleContent: true
      });

      const receiptHTML = window.cart ? window.cart.buildReceiptHTML(invoice) : '';
      const styles = this.getThermalPrintStyles(paperWidth);

      // Render barcode to base64 or inline SVG
      let processedHTML = receiptHTML;
      if (window.JsBarcode) {
        try {
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = receiptHTML;
          const svgEls = tempDiv.querySelectorAll('.receipt-svg-barcode');
          svgEls.forEach(el => {
            const code = el.getAttribute('data-barcode') || (invoice.invoice_barcode || `INV-${invoice.order_id}`);
            window.JsBarcode(el, code, {
              format: 'CODE128',
              width: is58 ? 1.2 : 1.4,
              height: is58 ? 28 : 34,
              displayValue: false,
              margin: 1
            });
          });
          processedHTML = tempDiv.innerHTML;
        } catch (e) {
          console.warn('Barcode render error for QZ:', e);
        }
      }

      const fullHTML = `
        <!DOCTYPE html>
        <html dir="rtl" lang="ar">
        <head>
          <meta charset="UTF-8">
          <title>فاتورة #${invoice.order_id}</title>
          <style>${styles}</style>
        </head>
        <body>
          <div class="receipt-print-wrapper">
            ${processedHTML}
          </div>
        </body>
        </html>
      `;

      const data = [{
        type: 'pixel',
        format: 'html',
        flavor: 'plain',
        data: fullHTML
      }];

      window.app?.showToast(`جاري الطباعة الفورية عبر QZ Tray (${printer}) ⚡🖨️`, 'info');
      await qz.print(config, data);
      window.app?.showToast(`تمت طباعة فاتورة #${invoice.order_id} بنجاح عبر QZ Tray ⚡✅`, 'success');
      return true;

    } catch (e) {
      console.warn('QZ Tray print failed:', e);
      return false;
    }
  }

  /* ==================== 2. طابعة متصفح كروم فائق الدقة (CHROME KIOSK PRINT) ==================== */

  printViaChrome(invoice) {
    if (!invoice) invoice = window.cart?.lastInvoice;
    if (!invoice) {
      window.app?.showToast('لا توجد فاتورة للطباعة', 'warning');
      return;
    }

    if (this.isPrinting) return;
    this.isPrinting = true;
    setTimeout(() => { this.isPrinting = false; }, 1500);

    try {
      const paperWidth = this.settings.paper_width || '80mm';
      const numCopies = parseInt(this.settings.copies, 10) || 1;
      const receiptHTML = window.cart ? window.cart.buildReceiptHTML(invoice) : '';
      const styles = this.getThermalPrintStyles(paperWidth);

      // إنشاء نسخ الفاتورة
      let copiesHTML = '';
      for (let i = 0; i < numCopies; i++) {
        copiesHTML += `
          <div class="receipt-print-wrapper ${i > 0 ? 'page-break-before' : ''}">
            ${i > 0 ? '<div style="text-align:center; font-size:10px; font-weight:bold; padding:2px 0; border-bottom:1px dashed #000; margin-bottom:4px;">--- نسخة ثانية (المحل) ---</div>' : ''}
            ${receiptHTML}
          </div>
        `;
      }

      let printFrame = document.getElementById('pos-chrome-print-frame');
      if (printFrame) printFrame.remove();

      printFrame = document.createElement('iframe');
      printFrame.id = 'pos-chrome-print-frame';
      // إخفاء الـ iframe بدقة كاملة بدون حجب التنسيق أو الباركود
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

      // رسم الباركود عالي الدقة
      if (window.JsBarcode) {
        try {
          const barcodeEls = printFrame.contentWindow.document.querySelectorAll('.receipt-svg-barcode');
          barcodeEls.forEach(el => {
            const code = el.getAttribute('data-barcode') || (invoice.invoice_barcode || `INV-${invoice.order_id}`);
            window.JsBarcode(el, code, {
              format: 'CODE128',
              width: paperWidth === '58mm' ? 1.2 : 1.4,
              height: paperWidth === '58mm' ? 28 : 34,
              displayValue: false,
              margin: 1
            });
          });
        } catch (bErr) {
          console.warn('Iframe barcode error:', bErr);
        }
      }

      window.app?.showToast(`جاري إرسال الفاتورة #${invoice.order_id} للطابعة 🖨️⚡`, 'info');

      // إطلاق أمر الطباعة بعد اكتمال تحميل التنسيق والخطوط
      requestAnimationFrame(() => {
        setTimeout(() => {
          try {
            printFrame.contentWindow.focus();
            printFrame.contentWindow.print();
          } catch (pErr) {
            console.warn('Chrome print error:', pErr);
          }
        }, 180);
      });

    } catch (e) {
      console.warn('printViaChrome error:', e);
      window.app?.showToast(`خطأ في الطباعة: ${e.message}`, 'error');
    }
  }

  // توافق مع الاستدعاءات القديمة
  printViaKioskPC(invoice) {
    this.printReceipt(invoice);
  }

  printViaBrowser(invoice) {
    this.printViaChrome(invoice);
  }

  /* ==================== طباعة الفاتورة الشاملة (DISPATCH PRINT) ==================== */

  async printReceipt(invoice) {
    if (!invoice) invoice = window.cart?.lastInvoice;
    if (!invoice) return;

    // 1. تجربة مكتبة الربط المحلي QZ Tray أولاً إذا كانت مفعلة ومتصلة
    if (this.settings.use_qz_bridge && this.qzConnected) {
      const qzOk = await this.printViaQZ(invoice);
      if (qzOk) return;
    }

    // 2. البديل المباشر فائق السرعة: طابعة كروم بوضع Kiosk Printing
    this.printViaChrome(invoice);
  }

  /* ==================== طباعة إيصال فحص وتجربة ==================== */

  printTestReceipt() {
    const store = window.settingsController ? window.settingsController.getStoreInfo() : { store_name: 'سوبر ماركت المنزل السوري' };
    const testInv = {
      order_id: 'TEST-' + Math.floor(1000 + Math.random() * 9000),
      created_at: new Date().toLocaleString('ar-EG'),
      customer_name: 'فحص وتجربة وضوح الطابعة',
      phone: store.store_phone || '01000000000',
      address: store.store_address || 'الفرع الرئيسي',
      cashier: 'مسؤول النظام',
      order_type: 'hall',
      payment_method: 'نقدي',
      items: [
        { name: 'تجربة صنف بالقطعة 1', qty: 2, price: 25.00, total: 50.00, unit: 'قطعة' },
        { name: 'تجربة وزن جبنة وزيتون 2', qty: 1.25, price: 40.00, total: 50.00, unit: 'كجم' }
      ],
      subtotal: 100.00,
      discount: 0,
      total: 100.00,
      paid_amount: 100.00,
      change: 0,
      invoice_barcode: 'TEST-123456',
      is_test: true
    };

    window.app?.showToast('جاري طباعة إيصال فحص للتأكد من جمال ووضوح الفاتورة... 🖨️', 'info');
    this.printReceipt(testInv);
  }

  /* ==================== تنسيق الفاتورة الحراري فائق الجودة والجمال (CSS) ==================== */

  getThermalPrintStyles(paperWidth = '80mm') {
    const is58 = paperWidth === '58mm';
    const pageW = is58 ? '58mm' : '80mm';
    const contentW = is58 ? '50mm' : '74mm';
    const baseFontSize = is58 ? '9px' : '10.5px';

    return `
      @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&family=Courier+Prime:wght@400;700&display=swap');

      @page {
        size: ${pageW} auto;
        margin: 0mm !important;
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
        line-height: 1.3;
      }

      .receipt-print-wrapper, .bw-receipt {
        width: ${contentW};
        max-width: ${contentW};
        margin: 0 auto;
        padding: 2mm 1mm;
        background: #ffffff !important;
        color: #000000 !important;
      }

      .bw-header {
        text-align: center;
        margin-bottom: 4px;
      }

      .bw-title {
        font-size: ${is58 ? '14px' : '17px'};
        font-weight: 900;
        margin: 0 0 2px 0;
        color: #000000 !important;
        line-height: 1.2;
      }

      .bw-sub {
        font-size: ${is58 ? '9px' : '10.5px'};
        font-weight: 700;
        margin-bottom: 2px;
        color: #000000 !important;
      }

      .bw-info {
        font-size: ${is58 ? '8.5px' : '10px'};
        margin: 1px 0;
        font-weight: 600;
        color: #000000 !important;
      }

      .bw-divider-double {
        border: none;
        border-top: 2px dashed #000000;
        margin: 4px 0;
      }

      .bw-divider-solid {
        border: none;
        border-top: 1px solid #000000;
        margin: 4px 0;
      }

      .bw-divider-dashed {
        border: none;
        border-top: 1px dashed #000000;
        margin: 4px 0;
      }

      .bw-meta-table {
        width: 100%;
        border-collapse: collapse;
        font-size: ${is58 ? '8.5px' : '10px'};
        margin: 2px 0;
      }

      .bw-meta-table td {
        padding: 1.5px 1px;
        vertical-align: middle;
        color: #000000 !important;
      }

      .bw-mono {
        font-family: 'Courier Prime', 'Courier New', monospace;
        font-weight: bold;
      }

      .bw-delivery-box {
        border: 1.5px solid #000000;
        border-radius: 4px;
        padding: 3px 4px;
        margin: 4px 0;
        background: #fafafa !important;
      }

      .bw-delivery-title {
        font-weight: 900;
        font-size: ${is58 ? '9.5px' : '11px'};
        text-align: center;
        border-bottom: 1px dashed #000000;
        padding-bottom: 2px;
        margin-bottom: 3px;
      }

      /* جدول الأصناف فائق الدقة والوضوح */
      .bw-items-table {
        width: 100%;
        border-collapse: collapse;
        margin: 4px 0;
        font-size: ${is58 ? '8.5px' : '10px'};
        border: 1.5px solid #000000;
        table-layout: fixed;
        word-wrap: break-word;
      }

      .bw-items-table thead th {
        border: 1px solid #000000;
        border-bottom: 2px solid #000000;
        background-color: #000000 !important;
        color: #ffffff !important;
        -webkit-print-color-adjust: exact !important;
        font-weight: 900;
        padding: 3px 1px;
        text-align: center;
        font-size: ${is58 ? '8px' : '9.5px'};
      }

      .bw-items-table tbody td {
        border: 1px solid #000000;
        padding: 3px 2px;
        vertical-align: middle;
        color: #000000 !important;
      }

      .bw-items-table .th-num, .bw-items-table .td-num {
        width: 8%;
        text-align: center;
        font-family: 'Courier Prime', monospace;
        font-weight: bold;
      }

      .bw-items-table .th-name, .bw-items-table .td-name {
        width: 44%;
        text-align: right;
      }

      .bw-items-table .item-title {
        font-weight: 800;
        line-height: 1.2;
        color: #000000 !important;
        font-size: ${is58 ? '8.5px' : '10px'};
      }

      .bw-items-table .item-code {
        font-size: 7.5px;
        color: #333333 !important;
        font-family: 'Courier Prime', monospace;
        display: block;
      }

      .bw-items-table .th-qty, .bw-items-table .td-qty {
        width: 16%;
        text-align: center;
        font-family: 'Courier Prime', monospace;
        font-weight: bold;
        font-size: ${is58 ? '8.5px' : '10px'};
      }

      .bw-items-table .th-price, .bw-items-table .td-price {
        width: 16%;
        text-align: center;
        font-family: 'Courier Prime', monospace;
        font-size: ${is58 ? '8.5px' : '10px'};
      }

      .bw-items-table .th-total, .bw-items-table .td-total {
        width: 16%;
        text-align: left;
        font-family: 'Courier Prime', monospace;
        font-weight: 900;
        font-size: ${is58 ? '8.5px' : '10px'};
      }

      /* جدول الإجماليات */
      .bw-summary-table {
        width: 100%;
        border-collapse: collapse;
        font-size: ${is58 ? '9px' : '10.5px'};
        margin: 3px 0;
        table-layout: fixed;
      }

      .bw-summary-table td {
        padding: 2px 1px;
        color: #000000 !important;
      }

      .bw-summary-table .bw-val {
        text-align: left;
        font-family: 'Courier Prime', monospace;
        font-weight: 800;
      }

      /* سطر الإجمالي المطلوب البارز */
      .bw-summary-table .bw-grand-row td {
        border-top: 2px solid #000000;
        border-bottom: 2px solid #000000;
        padding: 4px 1px;
        font-size: ${is58 ? '11px' : '13px'};
        font-weight: 900;
        background-color: #f2f2f2 !important;
        -webkit-print-color-adjust: exact !important;
      }

      .bw-summary-table .bw-grand-val {
        text-align: left;
        font-family: 'Courier Prime', monospace;
        font-size: ${is58 ? '12px' : '14.5px'};
        font-weight: 900;
      }

      /* الباركود وتذييل الفاتورة */
      .bw-barcode {
        text-align: center;
        margin: 4px 0 2px 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
      }

      .bw-barcode svg {
        max-width: 100%;
        height: ${is58 ? '28px' : '34px'};
      }

      .bw-barcode-text {
        font-family: 'Courier Prime', monospace;
        font-size: ${is58 ? '8.5px' : '10px'};
        font-weight: 900;
        letter-spacing: 1px;
        color: #000000 !important;
      }

      .bw-footer {
        text-align: center;
        font-size: ${is58 ? '8px' : '9.5px'};
        color: #000000 !important;
        line-height: 1.3;
        margin-top: 4px;
      }

      .page-break-before {
        page-break-before: always;
        break-before: page;
        margin-top: 4mm;
      }

      .no-print {
        display: none !important;
      }
    `;
  }
}

window.printerController = new POSPrinterController();
