/**
 * Main Application Orchestrator
 * Handles I18n, Theme, Tabs, History, and UI Events
 */

const I18N = {
  ar: {
    app_title: "ماسح ومولد الباركود الذكي",
    tagline: "ماسح فوري، سريع ومجاني 100% يعمل مباشرة على متصفحك",
    tab_live: "المسح بالكاميرا",
    tab_image: "مسح من صورة",
    tab_generate: "إنشاء باركود / QR",
    tab_history: "سجل العمليات",
    tab_api: "الربط مع الكاشير (API)",
    
    // Live scanner
    camera_select: "اختر الكاميرا",
    btn_start_scan: "تشغيل الكاميرا",
    btn_stop_scan: "إيقاف الكاميرا",
    status_active: "الكاميرا نشطة وجاهزة للمسح",
    status_paused: "الكاميرا متوقفة",
    continuous_mode: "المسح المستمر",
    flip_camera: "تبديل الكاميرا",
    toggle_torch: "الفلاش",
    align_code_hint: "وجّه الكاميرا نحو الباركود أو رمز الـ QR",
    
    // Scan result
    result_title: "نتيجة المسح",
    format_label: "النوع",
    time_label: "الوقت",
    btn_copy: "نسخ النص",
    btn_open_url: "فتح الرابط",
    btn_share: "مشاركة",
    copied_toast: "تم نسخ النص إلى الحافظة!",
    
    // Image scanner
    drag_drop_title: "اسحب الصورة هنا أو اضغط للاختيار",
    drag_drop_subtitle: "يدعم صيغ PNG, JPG, WEBP, GIF ولصق الصور مباشرة عبر (Ctrl + V)",
    decoding_image: "جاري فك تشفير الباركود من الصورة...",
    scan_success: "تم استخراج الكود بنجاح!",
    no_barcode_found: "لم يتم العثور على رمز باركود واضح. يرجى تجربة صورة أوضح.",
    
    // Generator
    gen_type_qr: "رمز استجابة سريعة (QR Code)",
    gen_type_barcode: "باركود خطي (1D Barcode)",
    gen_content_type: "نوع المحتوى",
    gen_url: "رابط موقع (URL)",
    gen_text: "نص عادي",
    gen_wifi: "شبكة واي فاي (WiFi)",
    gen_vcard: "بطاقة اتصال (vCard)",
    gen_email: "بريد إلكتروني",
    gen_phone: "رقم هاتف",
    gen_whatsapp: "واتساب (WhatsApp)",
    
    gen_barcode_format: "صيغة الباركود",
    gen_input_placeholder: "أدخل القيمة هنا...",
    gen_fg_color: "لون الرمز",
    gen_bg_color: "لون الخلفية",
    gen_size: "الحجم والقياس",
    gen_show_text: "إظهار الأرقام/النص أسفل الباركود",
    gen_ecc: "مستوى تصحيح الخطأ",
    
    btn_download_png: "تنزيل صورة PNG",
    btn_download_svg: "تنزيل ملف SVG",
    btn_print: "طباعة الرمز",
    download_started: "بدأ التنزيل...",
    invalid_barcode_format: "القيمة غير صالحة للصيغة المختارة.",
    
    // History
    history_title: "سجل عمليات المسح",
    search_history: "بحث في السجل...",
    filter_all: "الكل",
    btn_export_csv: "تصدير CSV (Excel)",
    btn_export_json: "تصدير JSON",
    btn_clear_history: "مسح السجل بالكامل",
    confirm_clear_history: "هل أنت متأكد من رغبتك في حذف جميع السجلات؟",
    empty_history: "لا توجد عمليات مسح محفوظة حتى الآن.",
    
    // Settings & general
    theme_toggle: "تبديل المظهر",
    lang_toggle: "English",
    camera_permission_denied: "تم رفض الإذن أو تعذر الوصول إلى الكاميرا. يرجى منح الإذن في المتصفح."
  },
  en: {
    app_title: "Smart Barcode & QR Hub",
    tagline: "Instant, fast, and 100% free web scanner running directly in your browser",
    tab_live: "Live Camera",
    tab_image: "Scan Image",
    tab_generate: "Generate Code",
    tab_history: "History",
    tab_api: "POS & API Integration",
    
    // Live scanner
    camera_select: "Select Camera",
    btn_start_scan: "Start Camera",
    btn_stop_scan: "Stop Camera",
    status_active: "Camera active & ready to scan",
    status_paused: "Camera paused",
    continuous_mode: "Continuous Mode",
    flip_camera: "Flip Camera",
    toggle_torch: "Flashlight",
    align_code_hint: "Point your camera at a barcode or QR code",
    
    // Scan result
    result_title: "Scan Result",
    format_label: "Format",
    time_label: "Time",
    btn_copy: "Copy Content",
    btn_open_url: "Open Link",
    btn_share: "Share",
    copied_toast: "Copied to clipboard!",
    
    // Image scanner
    drag_drop_title: "Drag and drop an image here or click to browse",
    drag_drop_subtitle: "Supports PNG, JPG, WEBP, GIF, and direct clipboard paste (Ctrl + V)",
    decoding_image: "Decoding barcode from image...",
    scan_success: "Barcode decoded successfully!",
    no_barcode_found: "No clear barcode detected. Please try a higher quality image.",
    
    // Generator
    gen_type_qr: "QR Code (2D)",
    gen_type_barcode: "Linear Barcode (1D)",
    gen_content_type: "Content Type",
    gen_url: "Website URL",
    gen_text: "Plain Text",
    gen_wifi: "WiFi Network",
    gen_vcard: "Contact Card (vCard)",
    gen_email: "Email Message",
    gen_phone: "Phone Number",
    gen_whatsapp: "WhatsApp Chat",
    
    gen_barcode_format: "Barcode Format",
    gen_input_placeholder: "Enter value here...",
    gen_fg_color: "Code Color",
    gen_bg_color: "Background",
    gen_size: "Dimension / Size",
    gen_show_text: "Show text below barcode",
    gen_ecc: "Error Correction Level",
    
    btn_download_png: "Download PNG",
    btn_download_svg: "Download SVG",
    btn_print: "Print Code",
    download_started: "Downloading file...",
    invalid_barcode_format: "Invalid value for the selected format.",
    
    // History
    history_title: "Scan History",
    search_history: "Search history...",
    filter_all: "All Types",
    btn_export_csv: "Export CSV (Excel)",
    btn_export_json: "Export JSON",
    btn_clear_history: "Clear All History",
    confirm_clear_history: "Are you sure you want to clear all scan records?",
    empty_history: "No scan records yet.",
    
    // Settings & general
    theme_toggle: "Toggle Theme",
    lang_toggle: "العربية",
    camera_permission_denied: "Camera permission denied or camera unavailable. Please allow access."
  }
};

class App {
  constructor() {
    this.currentLang = localStorage.getItem('app_lang') || 'ar';
    this.currentTheme = localStorage.getItem('app_theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    this.currentTab = 'live';
    this.history = JSON.parse(localStorage.getItem('scan_history') || '[]');
  }

  init() {
    this.applyTheme(this.currentTheme);
    this.applyLanguage(this.currentLang);
    this.bindEvents();
    this.renderHistory();

    // Init generator
    window.generatorController?.init();

    // Auto-enumerate cameras
    window.scannerController?.initCameras().then(() => {
      // Check for POS Mode URL Query (?mode=pos)
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('mode') === 'pos' || urlParams.get('mode') === 'pos_embedded') {
        setTimeout(() => {
          window.scannerController?.startLiveScanner();
        }, 500);
      }
    });

    // Render Lucide icons
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  t(key) {
    return I18N[this.currentLang]?.[key] || I18N['ar']?.[key] || key;
  }

  applyLanguage(lang) {
    this.currentLang = lang;
    localStorage.setItem('app_lang', lang);
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.body.dir = lang === 'ar' ? 'rtl' : 'ltr';

    // Update all i18n text nodes in the DOM
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (key && I18N[lang]?.[key]) {
        el.textContent = I18N[lang][key];
      }
    });

    // Update placeholders
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      if (key && I18N[lang]?.[key]) {
        el.setAttribute('placeholder', I18N[lang][key]);
      }
    });

    const langBtnText = document.getElementById('lang-btn-text');
    if (langBtnText) {
      langBtnText.textContent = lang === 'ar' ? 'English' : 'العربية';
    }
  }

  toggleLanguage() {
    const newLang = this.currentLang === 'ar' ? 'en' : 'ar';
    this.applyLanguage(newLang);
    this.renderHistory();
  }

  applyTheme(theme) {
    this.currentTheme = theme;
    localStorage.setItem('app_theme', theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }

  toggleTheme() {
    const nextTheme = this.currentTheme === 'dark' ? 'light' : 'dark';
    this.applyTheme(nextTheme);
  }

  bindEvents() {
    // Theme & Language toggles
    document.getElementById('btn-toggle-theme')?.addEventListener('click', () => this.toggleTheme());
    document.getElementById('btn-toggle-lang')?.addEventListener('click', () => this.toggleLanguage());

    // Tab Navigation
    document.querySelectorAll('.nav-tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const targetTab = btn.getAttribute('data-tab');
        this.switchTab(targetTab);
      });
    });

    // Live Scanner Controls
    document.getElementById('btn-toggle-scan')?.addEventListener('click', () => {
      window.scannerController?.toggleLiveScanner();
    });

    document.getElementById('camera-select')?.addEventListener('change', (e) => {
      window.scannerController?.switchCamera(e.target.value);
    });

    document.getElementById('btn-flip-camera')?.addEventListener('click', () => {
      window.scannerController?.flipCamera();
    });

    document.getElementById('btn-torch')?.addEventListener('click', () => {
      window.scannerController?.toggleTorch();
    });

    document.getElementById('chk-continuous-mode')?.addEventListener('change', (e) => {
      if (window.scannerController) {
        window.scannerController.continuousMode = e.target.checked;
      }
    });

    document.getElementById('btn-sound-toggle')?.addEventListener('click', (e) => {
      const isEnabled = window.soundController?.toggleSound();
      const soundIcon = document.getElementById('sound-icon');
      if (soundIcon) {
        soundIcon.setAttribute('data-lucide', isEnabled ? 'volume-2' : 'volume-x');
        if (window.lucide) window.lucide.createIcons();
      }
      this.showToast(isEnabled ? 'تم تفعيل الصوت' : 'تم كتم الصوت', 'info');
    });

    // Image Upload & Drag-and-Drop
    const dropzone = document.getElementById('image-dropzone');
    const fileInput = document.getElementById('image-file-input');

    if (dropzone && fileInput) {
      dropzone.addEventListener('click', () => fileInput.click());

      fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
          window.scannerController?.scanImageFile(e.target.files[0]);
        }
      });

      ['dragenter', 'dragover'].forEach(eventName => {
        dropzone.addEventListener(eventName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          dropzone.classList.add('dropzone-active');
        }, false);
      });

      ['dragleave', 'drop'].forEach(eventName => {
        dropzone.addEventListener(eventName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          dropzone.classList.remove('dropzone-active');
        }, false);
      });

      dropzone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files && files.length > 0) {
          window.scannerController?.scanImageFile(files[0]);
        }
      }, false);
    }

    // Global Clipboard Paste (Ctrl + V)
    window.addEventListener('paste', (e) => {
      const items = (e.clipboardData || e.originalEvent.clipboardData).items;
      for (let index in items) {
        const item = items[index];
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const blob = item.getAsFile();
          this.switchTab('image');
          window.scannerController?.scanImageFile(blob);
          break;
        }
      }
    });

    // History controls
    document.getElementById('btn-export-csv')?.addEventListener('click', () => this.exportHistoryCSV());
    document.getElementById('btn-export-json')?.addEventListener('click', () => this.exportHistoryJSON());
    document.getElementById('btn-clear-history')?.addEventListener('click', () => this.clearHistory());
    document.getElementById('history-search-input')?.addEventListener('input', (e) => this.renderHistory(e.target.value));
    document.getElementById('history-type-filter')?.addEventListener('change', (e) => this.renderHistory(null, e.target.value));

    // Result card actions
    document.getElementById('btn-result-copy')?.addEventListener('click', () => {
      const text = document.getElementById('scan-result-text')?.textContent;
      if (text) {
        navigator.clipboard.writeText(text);
        this.showToast(this.t('copied_toast'), 'success');
      }
    });

    document.getElementById('btn-result-open')?.addEventListener('click', () => {
      const text = document.getElementById('scan-result-text')?.textContent;
      if (text) {
        let url = text.trim();
        if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    });

    document.getElementById('btn-result-share')?.addEventListener('click', async () => {
      const text = document.getElementById('scan-result-text')?.textContent;
      if (navigator.share && text) {
        try {
          await navigator.share({ title: 'Barcode Result', text: text });
        } catch (e) {}
      } else {
        navigator.clipboard.writeText(text);
        this.showToast(this.t('copied_toast'), 'success');
      }
    });
  }

  switchTab(tabId) {
    this.currentTab = tabId;

    // Pause camera when navigating away from Live tab
    if (tabId !== 'live' && window.scannerController?.isScanning) {
      window.scannerController?.stopLiveScanner();
    }

    // Update tab button styles
    document.querySelectorAll('.nav-tab-btn').forEach(btn => {
      const isTarget = btn.getAttribute('data-tab') === tabId;
      if (isTarget) {
        btn.classList.add('bg-indigo-600', 'text-white', 'shadow-md');
        btn.classList.remove('text-gray-600', 'dark:text-gray-300', 'hover:bg-gray-100', 'dark:hover:bg-gray-800');
      } else {
        btn.classList.remove('bg-indigo-600', 'text-white', 'shadow-md');
        btn.classList.add('text-gray-600', 'dark:text-gray-300', 'hover:bg-gray-100', 'dark:hover:bg-gray-800');
      }
    });

    // Update tab content containers
    ['live', 'image', 'generate', 'history', 'api'].forEach(id => {
      const section = document.getElementById(`tab-content-${id}`);
      if (section) {
        if (id === tabId) {
          section.classList.remove('hidden');
        } else {
          section.classList.add('hidden');
        }
      }
    });

    if (tabId === 'history') {
      this.renderHistory();
    }

    if (window.lucide) window.lucide.createIcons();
  }

  handleScanResult(text, format, source = 'camera') {
    const isURL = /^(https?:\/\/|www\.)[^\s/$.?#].[^\s]*$/i.test(text.trim());
    const parsed = window.BarcodeParser ? window.BarcodeParser.parse(text) : null;
    
    // 1. Send POS Event to Parent Window (iframe) or Opener (popup)
    const scanPayload = {
      type: 'POS_BARCODE_SCANNED',
      code: text,
      format: format,
      source: source,
      is_scale: parsed ? parsed.isScale : false,
      item_code: parsed ? parsed.itemCode : text,
      weight: parsed ? parsed.weight : null,
      quantity: parsed ? parsed.quantity : 1,
      timestamp: new Date().toISOString()
    };

    if (window.parent && window.parent !== window) {
      window.parent.postMessage(scanPayload, '*');
    }
    if (window.opener) {
      window.opener.postMessage(scanPayload, '*');
    }

    // 2. Trigger Webhook if specified in URL query (?webhook=https://api.example.com/scan)
    const urlParams = new URLSearchParams(window.location.search);
    const webhookUrl = urlParams.get('webhook');
    if (webhookUrl) {
      try {
        fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(scanPayload)
        }).catch(err => console.warn('Webhook error:', err));
      } catch (e) {}
    }

    // Display result card
    const resultCard = document.getElementById('scan-result-card');
    const resultText = document.getElementById('scan-result-text');
    const resultFormat = document.getElementById('scan-result-format');
    const resultTime = document.getElementById('scan-result-time');
    const openBtn = document.getElementById('btn-result-open');

    if (resultCard && resultText) {
      if (parsed && parsed.isScale) {
        resultText.innerHTML = `
          <div class="flex flex-col gap-2">
            <div class="font-mono text-sm sm:text-base font-bold">${this.escapeHtml(text)}</div>
            <div class="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs font-bold flex items-center justify-between flex-wrap gap-2">
              <span>⚖️ باركود ميزان (وزن متغير)</span>
              <span>كود الصنف: <b class="font-mono text-indigo-500">${parsed.itemCode}</b></span>
              <span>الوزن: <b class="font-mono text-emerald-500">${parsed.weight} كجم</b> (${parsed.weightGrams} جرام)</span>
            </div>
          </div>
        `;
      } else {
        resultText.textContent = text;
      }

      if (resultFormat) {
        resultFormat.textContent = (parsed && parsed.isScale ? 'EAN-13 (ميزان)' : format.replace(/_/g, ' '));
      }
      if (resultTime) resultTime.textContent = new Date().toLocaleTimeString(this.currentLang === 'ar' ? 'ar-SA' : 'en-US');

      if (openBtn) {
        if (isURL) {
          openBtn.classList.remove('hidden');
        } else {
          openBtn.classList.add('hidden');
        }
      }

      resultCard.classList.remove('hidden');
      resultCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    // Add to history
    this.addToHistory({
      id: 'sc_' + Date.now(),
      text: text,
      format: format,
      source: source,
      timestamp: new Date().toISOString(),
      isURL: isURL
    });

    if (window.lucide) window.lucide.createIcons();
  }

  addToHistory(item) {
    this.history.unshift(item);
    // Keep maximum 500 items
    if (this.history.length > 500) {
      this.history.pop();
    }
    localStorage.setItem('scan_history', JSON.stringify(this.history));
  }

  renderHistory(searchQuery = '', typeFilter = 'all') {
    const container = document.getElementById('history-list-container');
    const countBadge = document.getElementById('history-count-badge');
    if (!container) return;

    let items = [...this.history];

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      items = items.filter(i => i.text.toLowerCase().includes(q) || i.format.toLowerCase().includes(q));
    }

    if (typeFilter && typeFilter !== 'all') {
      items = items.filter(i => i.format.toLowerCase() === typeFilter.toLowerCase());
    }

    if (countBadge) {
      countBadge.textContent = items.length;
    }

    if (items.length === 0) {
      container.innerHTML = `
        <div class="py-12 text-center text-gray-400 dark:text-gray-500">
          <i data-lucide="inbox" class="w-12 h-12 mx-auto mb-3 opacity-40"></i>
          <p>${this.t('empty_history')}</p>
        </div>
      `;
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    container.innerHTML = items.map(item => {
      const date = new Date(item.timestamp);
      const formattedDate = date.toLocaleDateString(this.currentLang === 'ar' ? 'ar-SA' : 'en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      return `
        <div class="p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3 hover:border-indigo-200 dark:hover:border-indigo-900 transition-all">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-1.5 flex-wrap">
              <span class="px-2.5 py-0.5 text-xs font-semibold rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800">
                ${item.format.replace(/_/g, ' ')}
              </span>
              <span class="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1">
                <i data-lucide="clock" class="w-3 h-3"></i>
                ${formattedDate}
              </span>
            </div>
            <p class="text-sm font-mono text-gray-800 dark:text-gray-200 break-all select-all font-medium">
              ${this.escapeHtml(item.text)}
            </p>
          </div>
          <div class="flex items-center gap-1 self-end md:self-center shrink-0">
            ${item.isURL ? `
              <button onclick="window.open('${this.escapeHtml(item.text)}', '_blank')" class="p-2 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950 rounded-lg transition" title="${this.t('btn_open_url')}">
                <i data-lucide="external-link" class="w-4 h-4"></i>
              </button>
            ` : ''}
            <button onclick="navigator.clipboard.writeText('${this.escapeJs(item.text)}'); window.app.showToast('${this.t('copied_toast')}', 'success')" class="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition" title="${this.t('btn_copy')}">
              <i data-lucide="copy" class="w-4 h-4"></i>
            </button>
            <button onclick="window.app.deleteHistoryItem('${item.id}')" class="p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950 rounded-lg transition" title="Delete">
              <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
          </div>
        </div>
      `;
    }).join('');

    if (window.lucide) window.lucide.createIcons();
  }

  deleteHistoryItem(id) {
    this.history = this.history.filter(i => i.id !== id);
    localStorage.setItem('scan_history', JSON.stringify(this.history));
    this.renderHistory();
  }

  clearHistory() {
    if (confirm(this.t('confirm_clear_history'))) {
      this.history = [];
      localStorage.removeItem('scan_history');
      this.renderHistory();
      this.showToast('تم إفراغ السجل بالكامل', 'info');
    }
  }

  exportHistoryCSV() {
    if (this.history.length === 0) {
      this.showToast(this.t('empty_history'), 'info');
      return;
    }

    const headers = ["Format", "Content", "Source", "Timestamp"];
    const rows = this.history.map(item => [
      `"${item.format}"`,
      `"${item.text.replace(/"/g, '""')}"`,
      `"${item.source}"`,
      `"${item.timestamp}"`
    ]);

    const csvContent = "\uFEFF" + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `scan_history_${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  exportHistoryJSON() {
    if (this.history.length === 0) {
      this.showToast(this.t('empty_history'), 'info');
      return;
    }

    const jsonString = JSON.stringify(this.history, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `scan_history_${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  showToast(message, type = 'info') {
    const toast = document.createElement('div');
    const bgColors = {
      success: 'bg-emerald-600 text-white',
      error: 'bg-rose-600 text-white',
      info: 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900'
    };

    toast.className = `fixed bottom-6 start-6 z-50 px-4 py-3 rounded-xl shadow-xl flex items-center gap-2 text-sm font-medium transition-all duration-300 animate-slide-up ${bgColors[type] || bgColors.info}`;
    toast.innerHTML = `
      <span>${message}</span>
    `;

    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 300);
    }, 2800);
  }

  showLoading(show, message = '') {
    const loader = document.getElementById('global-loader');
    const loaderMsg = document.getElementById('global-loader-msg');
    if (!loader) return;
    if (show) {
      if (loaderMsg) loaderMsg.textContent = message;
      loader.classList.remove('hidden');
    } else {
      loader.classList.add('hidden');
    }
  }

  escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  escapeJs(str) {
    if (!str) return '';
    return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\n/g, '\\n');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
  window.app.init();
});
