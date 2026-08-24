/**
 * Barcode & QR Code Generator Controller
 * Generates high-res 2D QR codes and 1D Barcodes using QRCode & JsBarcode.
 */

class GeneratorController {
  constructor() {
    this.currentCodeType = 'qr'; // 'qr' or 'barcode'
    this.qrContentType = 'url'; // 'url', 'text', 'wifi', 'vcard', 'email', 'phone', 'whatsapp'
    this.barcodeFormat = 'CODE128'; // 'CODE128', 'EAN13', 'UPC', 'CODE39', 'ITF14'
  }

  init() {
    this.bindEvents();
    this.updateGeneratorForm();
    this.generate();
  }

  bindEvents() {
    // Code type switcher (QR vs Barcode)
    document.querySelectorAll('input[name="gen-code-type"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        this.currentCodeType = e.target.value;
        this.updateGeneratorForm();
        this.generate();
      });
    });

    // QR sub-type switcher
    const qrTypeSelect = document.getElementById('gen-qr-type');
    if (qrTypeSelect) {
      qrTypeSelect.addEventListener('change', (e) => {
        this.qrContentType = e.target.value;
        this.updateQRSubFields();
        this.generate();
      });
    }

    // Barcode format switcher
    const barcodeFormatSelect = document.getElementById('gen-barcode-format');
    if (barcodeFormatSelect) {
      barcodeFormatSelect.addEventListener('change', (e) => {
        this.barcodeFormat = e.target.value;
        this.generate();
      });
    }

    // Live update on input changes
    const formInputs = document.querySelectorAll('#generator-form-container input, #generator-form-container textarea, #generator-form-container select');
    formInputs.forEach(input => {
      input.addEventListener('input', () => this.generate());
    });

    // Color & styling pickers
    ['gen-fg-color', 'gen-bg-color', 'gen-size', 'gen-show-text', 'gen-ecc'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', () => this.generate());
    });

    // Download & Print Buttons
    document.getElementById('btn-download-png')?.addEventListener('click', () => this.downloadPNG());
    document.getElementById('btn-download-svg')?.addEventListener('click', () => this.downloadSVG());
    document.getElementById('btn-print-code')?.addEventListener('click', () => this.printCode());
  }

  updateGeneratorForm() {
    const qrOptions = document.getElementById('qr-specific-options');
    const barcodeOptions = document.getElementById('barcode-specific-options');
    const qrFields = document.getElementById('qr-dynamic-fields');
    const barcodeFields = document.getElementById('barcode-dynamic-fields');
    const textOptionContainer = document.getElementById('barcode-text-option-container');

    if (this.currentCodeType === 'qr') {
      qrOptions?.classList.remove('hidden');
      qrFields?.classList.remove('hidden');
      barcodeOptions?.classList.add('hidden');
      barcodeFields?.classList.add('hidden');
      textOptionContainer?.classList.add('hidden');
      this.updateQRSubFields();
    } else {
      qrOptions?.classList.add('hidden');
      qrFields?.classList.add('hidden');
      barcodeOptions?.classList.remove('hidden');
      barcodeFields?.classList.remove('hidden');
      textOptionContainer?.classList.remove('hidden');
    }
  }

  updateQRSubFields() {
    const groups = ['url', 'text', 'wifi', 'vcard', 'email', 'phone', 'whatsapp'];
    groups.forEach(g => {
      const el = document.getElementById(`qr-group-${g}`);
      if (el) {
        if (g === this.qrContentType) {
          el.classList.remove('hidden');
        } else {
          el.classList.add('hidden');
        }
      }
    });
  }

  getQRPayload() {
    switch (this.qrContentType) {
      case 'url': {
        let url = document.getElementById('qr-input-url')?.value.trim() || 'https://example.com';
        if (!/^https?:\/\//i.test(url) && url.length > 0) {
          url = 'https://' + url;
        }
        return url;
      }
      case 'text':
        return document.getElementById('qr-input-text')?.value || 'مرحباً بك في ماسح الباركود';
      case 'wifi': {
        const ssid = document.getElementById('qr-wifi-ssid')?.value || 'MyWiFi';
        const pass = document.getElementById('qr-wifi-pass')?.value || '';
        const type = document.getElementById('qr-wifi-type')?.value || 'WPA';
        const hidden = document.getElementById('qr-wifi-hidden')?.checked ? 'true' : 'false';
        return `WIFI:T:${type};S:${ssid};P:${pass};H:${hidden};;`;
      }
      case 'vcard': {
        const name = document.getElementById('qr-vcard-name')?.value || 'Ahmed Ali';
        const phone = document.getElementById('qr-vcard-phone')?.value || '+966500000000';
        const email = document.getElementById('qr-vcard-email')?.value || 'user@example.com';
        const company = document.getElementById('qr-vcard-org')?.value || '';
        const title = document.getElementById('qr-vcard-title')?.value || '';
        const url = document.getElementById('qr-vcard-url')?.value || '';
        return `BEGIN:VCARD\nVERSION:3.0\nN:${name}\nFN:${name}\nORG:${company}\nTITLE:${title}\nTEL:${phone}\nEMAIL:${email}\nURL:${url}\nEND:VCARD`;
      }
      case 'email': {
        const to = document.getElementById('qr-email-to')?.value || '';
        const subj = encodeURIComponent(document.getElementById('qr-email-sub')?.value || '');
        const body = encodeURIComponent(document.getElementById('qr-email-body')?.value || '');
        return `mailto:${to}?subject=${subj}&body=${body}`;
      }
      case 'phone': {
        const num = document.getElementById('qr-phone-num')?.value || '';
        return `tel:${num}`;
      }
      case 'whatsapp': {
        let num = document.getElementById('qr-wa-num')?.value.replace(/[^0-9]/g, '') || '';
        const msg = encodeURIComponent(document.getElementById('qr-wa-msg')?.value || '');
        return `https://wa.me/${num}?text=${msg}`;
      }
      default:
        return 'https://example.com';
    }
  }

  generate() {
    const previewContainer = document.getElementById('generator-preview-box');
    const errorNotice = document.getElementById('generator-error-notice');
    if (!previewContainer) return;

    errorNotice?.classList.add('hidden');
    previewContainer.innerHTML = '';

    const fgColor = document.getElementById('gen-fg-color')?.value || '#000000';
    const bgColor = document.getElementById('gen-bg-color')?.value || '#ffffff';
    const size = parseInt(document.getElementById('gen-size')?.value || '250', 10);

    if (this.currentCodeType === 'qr') {
      const payload = this.getQRPayload();
      const ecc = document.getElementById('gen-ecc')?.value || 'M';

      const canvas = document.createElement('canvas');
      canvas.id = 'generated-code-canvas';
      previewContainer.appendChild(canvas);

      try {
        QRCode.toCanvas(canvas, payload, {
          width: size,
          margin: 2,
          color: {
            dark: fgColor,
            light: bgColor
          },
          errorCorrectionLevel: ecc
        }, (error) => {
          if (error) {
            console.error(error);
            this.showGenError(error.message);
          }
        });
      } catch (err) {
        this.showGenError(err.message);
      }
    } else {
      // 1D Barcode
      const value = document.getElementById('barcode-input-value')?.value.trim() || '123456789012';
      const showText = document.getElementById('gen-show-text')?.checked ?? true;
      const format = this.barcodeFormat;

      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.id = 'generated-code-svg';
      previewContainer.appendChild(svg);

      try {
        JsBarcode(svg, value, {
          format: format,
          lineColor: fgColor,
          background: bgColor,
          width: Math.max(1.5, Math.floor(size / 100)),
          height: Math.floor(size * 0.45),
          displayValue: showText,
          fontSize: 14,
          margin: 15,
          valid: (valid) => {
            if (!valid) {
              this.showGenError(window.app?.t('invalid_barcode_format') || 'القيمة المدخلة غير متوافقة مع هذا النوع من الباركود.');
            }
          }
        });
      } catch (err) {
        this.showGenError(err.message);
      }
    }
  }

  showGenError(msg) {
    const errorNotice = document.getElementById('generator-error-notice');
    if (errorNotice) {
      errorNotice.textContent = msg;
      errorNotice.classList.remove('hidden');
    }
  }

  downloadPNG() {
    const previewContainer = document.getElementById('generator-preview-box');
    const canvas = previewContainer?.querySelector('canvas');
    const svg = previewContainer?.querySelector('svg');

    if (canvas) {
      const link = document.createElement('a');
      link.download = `qrcode_${Date.now()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      window.app?.showToast(window.app?.t('download_started') || 'جاري تحميل الصورة PNG...', 'success');
    } else if (svg) {
      // Convert SVG to high-res PNG canvas
      const svgData = new XMLSerializer().serializeToString(svg);
      const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
      const URL = window.URL || window.webkitURL || window;
      const blobURL = URL.createObjectURL(svgBlob);

      const image = new Image();
      image.onload = () => {
        const c = document.createElement('canvas');
        c.width = image.width * 2;
        c.height = image.height * 2;
        const ctx = c.getContext('2d');
        ctx.scale(2, 2);
        ctx.drawImage(image, 0, 0);
        const link = document.createElement('a');
        link.download = `barcode_${Date.now()}.png`;
        link.href = c.toDataURL('image/png');
        link.click();
        URL.revokeObjectURL(blobURL);
        window.app?.showToast(window.app?.t('download_started') || 'جاري تحميل الصورة PNG...', 'success');
      };
      image.src = blobURL;
    }
  }

  downloadSVG() {
    const previewContainer = document.getElementById('generator-preview-box');
    const svg = previewContainer?.querySelector('svg');

    if (svg) {
      const svgData = new XMLSerializer().serializeToString(svg);
      const blob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = `barcode_${Date.now()}.svg`;
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);
      window.app?.showToast(window.app?.t('download_started') || 'جاري تحميل ملف SVG...', 'success');
    } else {
      // For QR Code, generate an SVG version using QRCode.toString
      const payload = this.getQRPayload();
      const fgColor = document.getElementById('gen-fg-color')?.value || '#000000';
      const bgColor = document.getElementById('gen-bg-color')?.value || '#ffffff';
      const ecc = document.getElementById('gen-ecc')?.value || 'M';

      QRCode.toString(payload, {
        type: 'svg',
        color: { dark: fgColor, light: bgColor },
        errorCorrectionLevel: ecc
      }, (err, string) => {
        if (!err && string) {
          const blob = new Blob([string], { type: "image/svg+xml;charset=utf-8" });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.download = `qrcode_${Date.now()}.svg`;
          link.href = url;
          link.click();
          URL.revokeObjectURL(url);
          window.app?.showToast(window.app?.t('download_started') || 'جاري تحميل ملف SVG...', 'success');
        }
      });
    }
  }

  printCode() {
    const previewBox = document.getElementById('generator-preview-box');
    if (!previewBox) return;

    const printArea = document.getElementById('print-area');
    if (printArea) {
      printArea.innerHTML = previewBox.innerHTML;
      window.print();
    }
  }
}

window.generatorController = new GeneratorController();
