/**
 * Syrian Home POS - Inventory & Price Manager Controller (شاشة جرد المخزون وتعديل الأسعار والتصنيفات)
 * Supports:
 * 1. Main Categories (التصنيفات الأساسية) and Sub Categories (التصنيفات الفرعية)
 * 2. Barcode Scanning / Automatic Barcode Generator
 * 3. Piece vs Weight Unit Types
 * 4. Real-time Inventory & Price Sync with Server
 */

const SUPERMARKET_TAXONOMY = {
  'أجبان وألبان': [
    'أجبان سورية وبلدية',
    'جبنة حلوم وموزاريلا',
    'أجبان صفراء ورومي وشيدر',
    'حليب ولبن ورايب',
    'زبدة وقشطة وكريمة'
  ],
  'مكسرات وتسالي وحلويات': [
    'مكسرات نيئة ومحمصة',
    'حلويات شرقية ومعمول',
    'حلاوة وطحينة',
    'شيكولاتة وبسكويت وسكاكر',
    'لب وفول سوداني ومقرمشات'
  ],
  'عطارة وتوابل وزيوت': [
    'بهارات وتوابل سورية',
    'زيت زيتون وزيوت نباتية',
    'أعشاب وزهورات ومشروبات ساخنة',
    'بقوليات وحبوب',
    'مخللات وزيتون وورق عنب'
  ],
  'مخبوزات ومعجنات': [
    'خبز سوري وتورتيلا',
    'مناقيش وفطائر وسمبوسك',
    'كعك وشابورة وبقسماط'
  ],
  'لحوم ودواجن ومصنعات': [
    'لانشون وبسطرمة وروستو',
    'سجق وسوسيس ومصنعات',
    'لحوم ودواجن مجمدة'
  ],
  'مشروبات وعصائر ومياه': [
    'مياه معدنية وفوارة',
    'عصائر طبيعية ومشروبات غازية',
    'شاي وقهوة وسريع التحضير'
  ],
  'معلبات ومواد غذائية': [
    'تونة وسردين وأسماك',
    'صلصة ومعجون طماطم',
    'مكرونة وأرز وشعرية',
    'سمن وزيوت طهي',
    'معلبات جاهزة وفول'
  ],
  'منظفات وعناية منزلية': [
    'مسحوق غسيل ومنعم أقمشة',
    'صابون سائل وسوائل تنظيف',
    'معطرات ومطهرات',
    'مناديل وورقيات'
  ],
  'عام': [
    'متنوع'
  ]
};

class InventoryController {
  constructor() {
    this.selectedProduct = null;
    this.originalStock = 0;
    this.pendingImageBase64 = null;
    this.searchDebounceTimer = null;
    this.isScanningToInputField = false;
    this.isScanningToPackField = false;
    this.initCategoryDatalists();
    this.bindInventoryUiEvents();
  }

  bindInventoryUiEvents() {
    const bind = () => {
      const searchEl = document.getElementById('inv-search-input');
      if (searchEl && !searchEl.dataset.liveBound) {
        searchEl.dataset.liveBound = '1';
        searchEl.addEventListener('input', () => {
          clearTimeout(this.searchDebounceTimer);
          const v = searchEl.value.trim();
          if (!v) {
            this.hideSearchResults();
            return;
          }
          if (v.length >= 2) {
            this.searchDebounceTimer = setTimeout(() => {
              this.searchProductForAudit(v, true);
            }, 320);
          }
        });
      }
      ['inv-prod-stock', 'inv-prod-cost', 'inv-prod-price'].forEach((id) => {
        const el = document.getElementById(id);
        if (el && !el.dataset.adjBound) {
          el.dataset.adjBound = '1';
          el.addEventListener('input', () => this.onStockInputChanged());
        }
      });
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', bind);
    } else {
      bind();
    }
  }

  isRealImageUrl(url) {
    const u = String(url || '').trim().toLowerCase();
    if (!u) return false;
    return !(
      u.includes('placeholder.php') ||
      u.includes('/placeholder') ||
      u === 'placeholder.png' ||
      u === 'placeholder.jpg' ||
      u.includes('no-image') ||
      u.includes('no_image')
    );
  }

  resolveImageFullUrl(rel) {
    const u = String(rel || '').trim();
    if (!this.isRealImageUrl(u)) return '';
    if (u.startsWith('http://') || u.startsWith('https://') || u.startsWith('data:') || u.startsWith('/')) {
      return u;
    }
    return '../' + u.replace(/^\.\//, '');
  }

  hideSearchResults() {
    const box = document.getElementById('inv-search-results');
    if (box) {
      box.innerHTML = '';
      box.classList.add('hidden');
    }
  }

  renderSearchResults(matches, query) {
    const box = document.getElementById('inv-search-results');
    if (!box) return;
    if (!matches || matches.length === 0) {
      box.innerHTML = `<div class="col-span-full p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs font-bold text-amber-800 dark:text-amber-200 flex items-center justify-between gap-3"><span>لم يتم العثور على أصناف تطابق "${this.escapeHtmlStr(query)}"</span><button type="button" onclick="window.inventoryController.openNewProductForm()" class="px-3 py-1.5 rounded-xl bg-amber-600 text-white text-xs">+ إضافة كصنف جديد</button></div>`;
      box.classList.remove('hidden');
      return;
    }

    this._lastSearchMatches = matches;
    box.innerHTML = matches.map((p, idx) => {
      const imgUrl = this.resolveImageFullUrl(p.image_url || p.image || '');
      const hasImg = !!imgUrl;
      const thumbHtml = hasImg
        ? `<img src="${this.escapeHtmlStr(imgUrl)}" class="w-14 h-14 rounded-xl object-cover border border-emerald-200 shrink-0">`
        : `<div class="w-14 h-14 rounded-xl border border-dashed border-amber-300 bg-amber-50 text-amber-600 flex items-center justify-center text-[10px] font-bold shrink-0 text-center leading-tight px-1">بدون صورة</div>`;
      const badgeHtml = hasImg
        ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">بالـمتجر ✅</span>`
        : `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">مخفي ⚠️</span>`;
      const bc = p.barcode || p.local_code || '—';
      const stockNum = parseFloat(p.stock || 0);
      return `
        <button type="button" onclick="window.inventoryController.selectSearchResult(${idx})" class="text-right p-3 rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-indigo-400 hover:shadow-md transition flex items-center gap-3 w-full">
          ${thumbHtml}
          <div class="flex-1 min-w-0">
            <div class="flex items-center justify-between gap-1.5 mb-1">
              ${badgeHtml}
              <span class="font-mono font-black text-xs text-indigo-600">${parseFloat(p.price || 0).toFixed(2)} ج.م</span>
            </div>
            <div class="font-bold text-xs text-gray-900 dark:text-white truncate">${this.escapeHtmlStr(p.name || '')}</div>
            <div class="text-[10px] font-mono text-gray-500 mt-0.5 truncate">باركود: ${this.escapeHtmlStr(bc)} | مخزون: ${stockNum}</div>
          </div>
        </button>
      `;
    }).join('');
    box.classList.remove('hidden');
  }

  async selectSearchResult(idx) {
    const p = (this._lastSearchMatches || [])[idx];
    if (!p) return;
    this.hideSearchResults();
    this.loadProductToForm(p);
    if (p.id && navigator.onLine) {
      try {
        const fresh = await window.api.lookupBarcode(String(p.id));
        if (fresh && fresh.success && fresh.product && this.selectedProduct?.id === p.id) {
          this.loadProductToForm(fresh.product);
        }
      } catch (e) {}
    }
  }

  escapeHtmlStr(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  renderProductPhotoState(imageUrl, gallery = []) {
    const cleanMain = this.resolveImageFullUrl(imageUrl);
    const prevEl = document.getElementById('inv-prod-image-preview');
    const emptyEl = document.getElementById('inv-prod-image-empty');
    const badgeEl = document.getElementById('inv-store-visibility-badge');
    const removeBtn = document.getElementById('inv-btn-remove-image');
    const galEl = document.getElementById('inv-prod-gallery-list');

    if (cleanMain) {
      if (prevEl) { prevEl.src = cleanMain; prevEl.classList.remove('hidden'); }
      if (emptyEl) emptyEl.classList.add('hidden');
      if (badgeEl) {
        badgeEl.textContent = '✅ ظاهر على المتجر الإلكتروني';
        badgeEl.className = 'px-3 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200';
      }
      if (removeBtn) removeBtn.classList.remove('hidden');
    } else {
      if (prevEl) { prevEl.src = ''; prevEl.classList.add('hidden'); }
      if (emptyEl) emptyEl.classList.remove('hidden');
      if (badgeEl) {
        badgeEl.textContent = '⚠️ مخفي عن المتجر (بدون صورة)';
        badgeEl.className = 'px-3 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200';
      }
      if (removeBtn) removeBtn.classList.add('hidden');
    }

    if (galEl) {
      const realGal = Array.isArray(gallery) ? gallery.filter(g => this.isRealImageUrl(g.image_path)) : [];
      if (realGal.length > 0 && this.selectedProduct?.id) {
        galEl.innerHTML = realGal.map(g => `
          <div class="relative group w-12 h-12 rounded-lg overflow-hidden border border-gray-200">
            <img src="${this.escapeHtmlStr(this.resolveImageFullUrl(g.image_path))}" class="w-full h-full object-cover">
            <button type="button" onclick="window.inventoryController.deleteSingleGalleryImage(${Number(g.id)})" class="absolute inset-0 bg-black/55 text-white text-[10px] font-bold opacity-0 group-hover:opacity-100 transition flex items-center justify-center" title="حذف">✕</button>
          </div>
        `).join('');
      } else {
        galEl.innerHTML = '';
      }
    }
  }

  compressImageToBase64(file, maxDim = 1000, quality = 0.86) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('فشل قراءة ملف الصورة'));
      reader.onload = (ev) => {
        const dataUrl = ev.target.result;
        const img = new Image();
        img.onload = () => {
          let w = img.width;
          let h = img.height;
          if (w > maxDim || h > maxDim) {
            if (w >= h) { h = Math.round((h * maxDim) / w); w = maxDim; }
            else { w = Math.round((w * maxDim) / h); h = maxDim; }
          }
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = () => resolve(dataUrl);
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    });
  }

  async handleImageFileSelected(inputEl) {
    const file = inputEl?.files?.[0];
    if (!file) return;
    try {
      const b64 = await this.compressImageToBase64(file);
      if (!this.selectedProduct || !this.selectedProduct.id || this.selectedProduct.isNew) {
        this.pendingImageBase64 = b64;
        this.renderProductPhotoState(b64, []);
        window.app?.showToast('📷 تم تجهيز الصورة — اضغط حفظ الصنف لإتمام النشر بالمتجر', 'info');
        inputEl.value = '';
        return;
      }

      window.app?.showLoading(true, 'جاري رفع الصورة ونشر المنتج بالمتجر...');
      const res = await window.api.uploadProductImage({
        product_id: this.selectedProduct.id,
        image_base64: b64,
        set_main: true,
      });
      window.app?.showLoading(false);
      inputEl.value = '';

      if (res && res.success) {
        this.selectedProduct.image_url = res.image_url;
        this.selectedProduct.has_real_image = true;
        this.selectedProduct.gallery = res.gallery || [];
        this.renderProductPhotoState(res.image_url, res.gallery || []);

        if (Array.isArray(window.app?.products)) {
          const idx = window.app.products.findIndex(pr => pr.id === this.selectedProduct.id);
          if (idx > -1) {
            window.app.products[idx].image_url = res.image_url;
            window.app.products[idx].has_real_image = true;
            localStorage.setItem('syrian_home_products', JSON.stringify(window.app.products));
            window.app?.renderProducts();
          }
        }
        window.posScanner?.playSuccessBeep?.();
        window.app?.showToast('✅ تم رفع الصورة ونُشر المنتج الآن على المتجر الإلكتروني!', 'success');
      } else {
        window.app?.showToast(res?.error || 'تعذر رفع الصورة', 'error');
      }
    } catch (err) {
      window.app?.showLoading(false);
      window.app?.showToast('خطأ في رفع الصورة: ' + err.message, 'error');
    }
  }

  async removeSelectedProductImage() {
    if (!this.selectedProduct?.id) {
      this.pendingImageBase64 = null;
      this.renderProductPhotoState('', []);
      return;
    }
    if (!confirm('هل تريد حذف صور هذا المنتج وإخفاؤه من واجهة المتجر الإلكتروني؟ (سيبقى متاحاً في الكاشير)')) return;
    await this.deleteSingleGalleryImage(0);
  }

  async deleteSingleGalleryImage(imageId = 0) {
    if (!this.selectedProduct?.id) return;
    try {
      window.app?.showLoading(true, 'جاري تحديث صور المنتج...');
      const res = await window.api.deleteProductImage(this.selectedProduct.id, imageId);
      window.app?.showLoading(false);
      if (res && res.success) {
        this.selectedProduct.image_url = res.image_url || '';
        this.selectedProduct.has_real_image = !!res.has_real_image;
        this.selectedProduct.gallery = res.gallery || [];
        this.renderProductPhotoState(this.selectedProduct.image_url, this.selectedProduct.gallery);
        if (Array.isArray(window.app?.products)) {
          const idx = window.app.products.findIndex(pr => pr.id === this.selectedProduct.id);
          if (idx > -1) {
            window.app.products[idx].image_url = this.selectedProduct.image_url;
            window.app.products[idx].has_real_image = this.selectedProduct.has_real_image;
            localStorage.setItem('syrian_home_products', JSON.stringify(window.app.products));
            window.app?.renderProducts();
          }
        }
        window.app?.showToast(res.message || 'تم تحديث الصورة بنجاح', 'info');
      } else {
        window.app?.showToast(res?.error || 'تعذر حذف الصورة', 'error');
      }
    } catch (e) {
      window.app?.showLoading(false);
      window.app?.showToast('تعذر الاتصال بالخادم أثناء حذف الصورة', 'error');
    }
  }

  onStockInputChanged() {
    const card = document.getElementById('inv-adjustment-card');
    if (!card) return;

    if (!this.selectedProduct || this.selectedProduct.isNew || !this.selectedProduct.id) {
      card.classList.add('hidden');
      return;
    }

    const oldQty = parseFloat(this.originalStock || 0) || 0;
    const newQty = parseFloat(document.getElementById('inv-prod-stock')?.value || 0) || 0;
    const diff = Math.round((newQty - oldQty) * 1000) / 1000;

    if (Math.abs(diff) < 0.0005) {
      card.classList.add('hidden');
      return;
    }

    card.classList.remove('hidden');
    const diffBadge = document.getElementById('inv-adj-diff-badge');
    if (diffBadge) {
      diffBadge.textContent = `من ${oldQty} إلى ${newQty} (${diff > 0 ? '+' : ''}${diff})`;
    }

    const sel = document.getElementById('inv-adj-reason');
    if (sel) {
      const options = diff < 0
        ? [
            { v: 'shortage_loss', t: 'نقص: عجز / تالف جرد (خسائر غير نقدية — الصندوق محفوظ)' },
            { v: 'unrecorded_sale', t: 'نقص: مبيعات نقدية غير مسجلة (+ دخول كاش بالصندوق)' },
            { v: 'shortage_cash_expense', t: 'نقص: خصم عجز نقدي من الصندوق (- صرف كاش)' },
            { v: 'count_only', t: 'تصحيح رصيد دفتري / افتتاحي (تعديل كمية فقط)' },
          ]
        : [
            { v: 'surplus_gain', t: 'زيادة: فائض جرد طبيعي (زيادة مخزون — الصندوق محفوظ)' },
            { v: 'surplus_cash_purchase', t: 'زيادة: مشتريات مدفوعة كاش من الصندوق (- صرف كاش)' },
            { v: 'count_only', t: 'تصحيح رصيد دفتري / افتتاحي (تعديل كمية فقط)' },
          ];

      const validCodes = options.map(o => o.v);
      const prevVal = sel.value;
      sel.innerHTML = options.map(o => `<option value="${o.v}">${o.t}</option>`).join('');
      sel.value = validCodes.includes(prevVal) ? prevVal : options[0].v;
    }

    const reasonCode = sel?.value || (diff < 0 ? 'shortage_loss' : 'surplus_gain');
    const cost = parseFloat(document.getElementById('inv-prod-cost')?.value || 0) || 0;
    const price = parseFloat(document.getElementById('inv-prod-price')?.value || 0) || 0;
    const absQty = Math.abs(diff);
    const customCashRaw = document.getElementById('inv-adj-cash-amount')?.value;
    const customCash = customCashRaw !== '' && customCashRaw !== undefined ? parseFloat(customCashRaw) : NaN;
    const cashInp = document.getElementById('inv-adj-cash-amount');

    let cashImpactText = '0.00 ج.م (الصندوق يظل مطابقاً للدرج ولا يحدث عجز/زيادة كاش)';
    let cashBadgeClass = 'text-emerald-700 font-bold';
    let allowCashInput = false;

    if (reasonCode === 'unrecorded_sale') {
      allowCashInput = true;
      const amt = !isNaN(customCash) && customCash > 0 ? customCash : absQty * price;
      cashImpactText = `+${amt.toFixed(2)} ج.م (يدخل الصندوق كمبيعات كاش وتُنشأ فاتورة دريم سوفت)`;
      cashBadgeClass = 'text-blue-700 font-extrabold';
    } else if (reasonCode === 'shortage_cash_expense') {
      allowCashInput = true;
      const amt = !isNaN(customCash) && customCash > 0 ? customCash : absQty * (cost > 0 ? cost : price);
      cashImpactText = `-${amt.toFixed(2)} ج.م (يُخصم كمصروف عجز نقدي من الصندوق)`;
      cashBadgeClass = 'text-rose-700 font-extrabold';
    } else if (reasonCode === 'surplus_cash_purchase') {
      allowCashInput = true;
      const amt = !isNaN(customCash) && customCash > 0 ? customCash : absQty * (cost > 0 ? cost : price);
      cashImpactText = `-${amt.toFixed(2)} ج.م (يُخصم من الصندوق كمشتريات بضاعة كاش)`;
      cashBadgeClass = 'text-rose-700 font-extrabold';
    } else if (reasonCode === 'shortage_loss') {
      const lossAmt = absQty * cost;
      cashImpactText = `0.00 ج.م للصندوق | خسائر تالف/عجز: ${lossAmt.toFixed(2)} ج.م (بالتكلفة)`;
      cashBadgeClass = 'text-amber-800 font-bold';
    }

    if (cashInp) {
      cashInp.disabled = !allowCashInput;
      if (!allowCashInput) cashInp.classList.add('opacity-50');
      else cashInp.classList.remove('opacity-50');
    }

    const prevBox = document.getElementById('inv-stock-impact-preview');
    if (prevBox) {
      prevBox.innerHTML = `
        <span class="font-bold text-gray-600 dark:text-gray-300">قيمة الفرق بالتكلفة: <b class="font-mono">${(absQty * cost).toFixed(2)} ج.م</b></span>
        <span class="${cashBadgeClass}">تأثير الصندوق: ${cashImpactText}</span>
      `;
    }
    this.isScanningToInputField = false;
    this.isScanningToPackField = false;
    this.initCategoryDatalists();
  }

  initCategoryDatalists() {
    if (window.categoryController) {
      window.categoryController.updateDatalists();
      return;
    }
    // Fallback if categoryController not yet ready
    const mainList = document.getElementById('list-main-categories');
    if (mainList) {
      const allMains = Object.keys(SUPERMARKET_TAXONOMY);
      mainList.innerHTML = allMains.map(cat => `<option value="${cat}"></option>`).join('');
    }
  }

  onMainCategoryChanged() {
    if (window.categoryController) {
      window.categoryController.refreshSubCategoryDatalist();
      return;
    }
    const mainCat = document.getElementById('inv-prod-category')?.value.trim() || '';
    const subList = document.getElementById('list-sub-categories');
    if (!subList) return;

    const subSuggestions = SUPERMARKET_TAXONOMY[mainCat] || [];
    subList.innerHTML = subSuggestions.map(sub => `<option value="${sub}"></option>`).join('');
  }

  openCategoryManagerModal(preselectedMain = '', forSub = false) {
    if (window.categoryController) {
      window.categoryController.openCategoryManagerModal(preselectedMain, forSub);
    }
  }

  async searchProductForAudit(query) {
    const q = (query || document.getElementById('inv-search-input')?.value || '').trim();
    if (!q) {
      this.hideSearchResults();
      window.app?.showToast('يرجى إدخال اسم المنتج أو الباركود', 'error');
      return;
    }

    const parsed = window.BarcodeParser ? window.BarcodeParser.parse(q) : {
      isScale: /^20\d{11}$/.test(q),
      itemCode: /^20\d{11}$/.test(q) ? q.slice(2, 7) : q,
      originalBarcode: q
    };

    const qLower = q.toLowerCase();
    const localList = Array.isArray(window.app?.products) ? window.app.products : [];

    // 1. Check exact barcode / scale / local_code / pack_barcode match first (auto-open!)
    const exactMatch = localList.find(p => {
      if (window.BarcodeParser && window.BarcodeParser.matchesProduct(parsed, p)) return true;
      return (p.barcode && String(p.barcode).trim() === q) ||
             (p.barcode2 && String(p.barcode2).trim() === q) ||
             (p.barcode3 && String(p.barcode3).trim() === q) ||
             (p.pack_barcode && String(p.pack_barcode).trim() === q) ||
             (p.local_code && String(p.local_code).trim().toLowerCase() === qLower);
    });

    if (exactMatch) {
      this.hideSearchResults();
      this.loadProductToForm(exactMatch);
      if (navigator.onLine && exactMatch.id) {
        window.api.lookupBarcode(String(exactMatch.id)).then(fresh => {
          if (fresh && fresh.success && fresh.product && this.selectedProduct?.id === exactMatch.id) {
            this.loadProductToForm(fresh.product);
          }
        }).catch(() => {});
      }
      return;
    }

    // 2. Gather multi-match candidates by name / partial barcode / category
    let matches = localList.filter(p => {
      const n = String(p.name || '').toLowerCase();
      const b = String(p.barcode || '').toLowerCase();
      const lc = String(p.local_code || '').toLowerCase();
      const allB = String(p.all_barcodes || '').toLowerCase();
      return n.includes(qLower) || b.includes(qLower) || lc.includes(qLower) || allB.includes(qLower);
    }).slice(0, 24);

    if (navigator.onLine && matches.length < 5) {
      try {
        if (!arguments[1]) window.app?.showLoading(true, 'جاري البحث عن الصنف...');
        const searchRes = await window.api.searchProducts(q, 24);
        window.app?.showLoading(false);
        if (searchRes && searchRes.success && Array.isArray(searchRes.products) && searchRes.products.length > 0) {
          const seenIds = new Set(matches.map(m => Number(m.id)));
          searchRes.products.forEach(sp => {
            if (!seenIds.has(Number(sp.id))) {
              matches.push(sp);
              seenIds.add(Number(sp.id));
            }
          });
        }
      } catch (err) {
        window.app?.showLoading(false);
      }
    }

    if (matches.length === 1 && !arguments[1]) {
      this.hideSearchResults();
      this.loadProductToForm(matches[0]);
      return;
    }
    if (matches.length > 0) {
      this.renderSearchResults(matches, q);
      return;
    }

    // 3. Fallback direct barcode API check
    try {
      window.app?.showLoading(true, 'جاري الاستعلام عن الباركود...');
      const res = await window.api.lookupBarcode(parsed.isScale ? parsed.itemCode : q);
      window.app?.showLoading(false);
      if (res && res.success && res.product) {
        this.hideSearchResults();
        this.loadProductToForm(res.product);
      } else {
        this.renderSearchResults([], q);
        if (!arguments[1]) window.posScanner?.playErrorTone?.();
      }
    } catch (e) {
      window.app?.showLoading(false);
      window.app?.showToast('تعذر البحث في الشبكة', 'error');
    }

  }

  openNewProductForm() {
    this.selectedProduct = { isNew: true };
    const formBox = document.getElementById('inv-product-edit-form');
    const formTitle = document.getElementById('inv-form-title');
    if (!formBox) return;

    if (formTitle) {
      formTitle.innerHTML = `<i data-lucide="plus-circle" class="w-4 h-4 text-emerald-600"></i> إضافة صنف جديد مع التصنيف الأساسي والفرعي`;
    }

    const deleteBtn = document.getElementById('btn-delete-inv-prod');
    if (deleteBtn) deleteBtn.classList.add('hidden');

    // Reset fields with sensible defaults
    document.getElementById('inv-prod-name').value = '';
    document.getElementById('inv-prod-category').value = 'أجبان وألبان';
    this.onMainCategoryChanged();
    if (document.getElementById('inv-prod-subcategory')) {
      document.getElementById('inv-prod-subcategory').value = 'أجبان سورية وبلدية';
    }
    if (document.getElementById('inv-prod-unittype')) document.getElementById('inv-prod-unittype').value = 'piece';
    document.getElementById('inv-prod-price').value = '0.00';
    document.getElementById('inv-prod-cost').value = '0.00';
    document.getElementById('inv-prod-stock').value = '10';
    this.originalStock = 10;
    this.pendingImageBase64 = null;
    if (document.getElementById('inv-prod-old-price')) document.getElementById('inv-prod-old-price').value = '';
    if (document.getElementById('inv-prod-description')) document.getElementById('inv-prod-description').value = '';
    if (document.getElementById('inv-adj-cash-amount')) document.getElementById('inv-adj-cash-amount').value = '';
    if (document.getElementById('inv-adj-note')) document.getElementById('inv-adj-note').value = '';
    this.hideSearchResults();
    this.renderProductPhotoState('', []);
    this.onStockInputChanged();
    document.getElementById('inv-prod-barcode').value = '';
    document.getElementById('inv-prod-localcode').value = '';

    // Reset Pack Fields
    const chkPack = document.getElementById('inv-prod-haspack');
    if (chkPack) chkPack.checked = false;
    const packContainer = document.getElementById('inv-pack-fields-container');
    if (packContainer) {
      packContainer.classList.add('hidden');
      packContainer.style.display = 'none';
    }
    if (document.getElementById('inv-prod-packname')) document.getElementById('inv-prod-packname').value = '';
    if (document.getElementById('inv-prod-packbarcode')) document.getElementById('inv-prod-packbarcode').value = '';
    if (document.getElementById('inv-prod-packqty')) document.getElementById('inv-prod-packqty').value = '12';
    if (document.getElementById('inv-prod-packprice')) document.getElementById('inv-prod-packprice').value = '0.00';

    formBox.classList.remove('hidden');
    formBox.style.display = 'flex';
    formBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    document.getElementById('inv-prod-name')?.focus();

    if (window.lucide) window.lucide.createIcons();
  }

  closeForm() {
    const formBox = document.getElementById('inv-product-edit-form');
    if (formBox) {
      formBox.classList.add('hidden');
      formBox.style.display = 'none';
    }
  }

  scanBarcodeWithCamera() {
    this.isScanningToInputField = true;
    window.posScanner?.openCameraModal();
  }

  setScannedBarcode(barcode) {
    this.isScanningToInputField = false;
    const barcodeInput = document.getElementById('inv-prod-barcode');
    if (barcodeInput) {
      barcodeInput.value = barcode.trim();
      window.app?.showToast(`تم مسح الباركود: ${barcode} ✅`, 'success');
      barcodeInput.focus();
    }
  }

  generateRandomBarcode() {
    let code = '622' + Math.floor(100000000 + Math.random() * 900000000);
    const barcodeInput = document.getElementById('inv-prod-barcode');
    if (barcodeInput) {
      barcodeInput.value = code;
      window.app?.showToast(`تم توليد باركود تلقائي: ${code}`, 'info');
    }
  }

  togglePackFields() {
    const chk = document.getElementById('inv-prod-haspack');
    const container = document.getElementById('inv-pack-fields-container');
    if (!container) return;
    if (chk && chk.checked) {
      container.classList.remove('hidden');
      container.style.display = 'grid';
      document.getElementById('inv-prod-packname')?.focus();
    } else {
      container.classList.add('hidden');
      container.style.display = 'none';
    }
  }

  generateRandomPackBarcode() {
    let code = '6229' + Math.floor(10000000 + Math.random() * 90000000);
    const barcodeInput = document.getElementById('inv-prod-packbarcode');
    if (barcodeInput) {
      barcodeInput.value = code;
      window.app?.showToast(`تم توليد باركود دستة تلقائي: ${code}`, 'info');
    }
  }

  scanPackBarcodeWithCamera() {
    this.isScanningToPackField = true;
    window.posScanner?.openCameraModal();
  }

  setScannedPackBarcode(barcode) {
    this.isScanningToPackField = false;
    const input = document.getElementById('inv-prod-packbarcode');
    if (input) {
      input.value = barcode.trim();
      window.app?.showToast(`تم مسح باركود الدستة: ${barcode} ✅`, 'success');
      input.focus();
    }
  }

  loadProductToForm(p) {
    this.selectedProduct = p;
    const formBox = document.getElementById('inv-product-edit-form');
    const formTitle = document.getElementById('inv-form-title');
    const deleteBtn = document.getElementById('btn-delete-inv-prod');
    if (!formBox) return;

    if (formTitle) {
      formTitle.innerHTML = `<i data-lucide="edit-3" class="w-4 h-4 text-indigo-600"></i> تعديل بيانات الصنف (${p.name})`;
    }

    if (deleteBtn) {
      deleteBtn.classList.remove('hidden');
    }

    formBox.classList.remove('hidden');
    formBox.style.display = 'flex';

    // Fill form fields
    document.getElementById('inv-prod-name').value = p.name || '';
    document.getElementById('inv-prod-category').value = p.category || 'عام';
    this.onMainCategoryChanged();
    
    if (document.getElementById('inv-prod-subcategory')) {
      document.getElementById('inv-prod-subcategory').value = p.sub_category || p.subcategory || '';
    }

    if (document.getElementById('inv-prod-unittype')) {
      document.getElementById('inv-prod-unittype').value = p.unit_type || (p.unit === 'كجم' ? 'weight' : 'piece');
    }
    document.getElementById('inv-prod-price').value = parseFloat(p.price || 0).toFixed(2);
    document.getElementById('inv-prod-cost').value = parseFloat(p.cost || 0).toFixed(2);
    document.getElementById('inv-prod-stock').value = parseFloat(p.stock || 0);
    this.originalStock = parseFloat(p.stock || 0) || 0;
    this.pendingImageBase64 = null;
    if (document.getElementById('inv-prod-old-price')) {
      document.getElementById('inv-prod-old-price').value = (p.old_price !== null && p.old_price !== undefined && p.old_price !== '') ? parseFloat(p.old_price) : '';
    }
    if (document.getElementById('inv-prod-description')) {
      document.getElementById('inv-prod-description').value = p.description || '';
    }
    if (document.getElementById('inv-adj-cash-amount')) document.getElementById('inv-adj-cash-amount').value = '';
    if (document.getElementById('inv-adj-note')) document.getElementById('inv-adj-note').value = '';
    this.renderProductPhotoState(p.image_url || p.image || '', p.gallery || []);
    this.onStockInputChanged();
    document.getElementById('inv-prod-barcode').value = p.barcode || '';
    document.getElementById('inv-prod-localcode').value = p.local_code || '';

    // Populate Pack Fields
    const hasPack = p.has_pack == 1 || p.has_pack === true || p.has_pack === '1';
    const chkPack = document.getElementById('inv-prod-haspack');
    if (chkPack) chkPack.checked = !!hasPack;
    const packContainer = document.getElementById('inv-pack-fields-container');
    if (packContainer) {
      if (hasPack) {
        packContainer.classList.remove('hidden');
        packContainer.style.display = 'grid';
      } else {
        packContainer.classList.add('hidden');
        packContainer.style.display = 'none';
      }
    }
    if (document.getElementById('inv-prod-packname')) document.getElementById('inv-prod-packname').value = p.pack_name || '';
    if (document.getElementById('inv-prod-packbarcode')) document.getElementById('inv-prod-packbarcode').value = p.pack_barcode || '';
    if (document.getElementById('inv-prod-packqty')) document.getElementById('inv-prod-packqty').value = p.pack_qty || 12;
    if (document.getElementById('inv-prod-packprice')) document.getElementById('inv-prod-packprice').value = parseFloat(p.pack_price || 0).toFixed(2);

    formBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    window.posScanner?.playSuccessBeep();
    if (window.lucide) window.lucide.createIcons();
  }

  async deleteSelectedProduct() {
    if (!this.selectedProduct || this.selectedProduct.isNew) return;

    const prodName = this.selectedProduct.name || 'الصنف المحدد';
    if (!confirm(`هل أنت متأكد من حذف الصنف (${prodName}) نهائياً من النظام والسيرفر؟`)) {
      return;
    }

    const prodId = this.selectedProduct.id;
    const barcode = this.selectedProduct.barcode;

    try {
      window.app?.showLoading(true, 'جاري حذف الصنف من السيرفر...');
      try {
        await window.api.deleteProduct(prodId, barcode);
      } catch (e) {
        console.warn('Server delete error, removing locally:', e);
      }
      window.app?.showLoading(false);

      // Remove from local catalog
      window.app.products = window.app.products.filter(p => p.id !== prodId && (!barcode || p.barcode !== barcode));
      localStorage.setItem('syrian_home_products', JSON.stringify(window.app.products));

      // Refresh UI
      window.app.extractCategories();
      window.app.renderCategories();
      window.app.renderProducts();

      this.closeForm();
      window.posScanner?.playSuccessBeep();
      window.app?.showToast(`تم حذف الصنف (${prodName}) بنجاح 🗑️`, 'info');
    } catch (err) {
      window.app?.showLoading(false);
      window.app?.showToast(`خطأ أثناء الحذف: ${err.message}`, 'error');
    }
  }

  adjustStock(delta) {
    const input = document.getElementById('inv-prod-stock');
    if (input) {
      const current = parseFloat(input.value || 0);
      input.value = Math.max(-99999, current + delta);
      this.onStockInputChanged();
    }
  }

  async saveProductChanges() {
    if (!this.selectedProduct) return;

    const name = document.getElementById('inv-prod-name')?.value.trim();
    const category = document.getElementById('inv-prod-category')?.value.trim() || 'عام';
    const subCategory = document.getElementById('inv-prod-subcategory')?.value.trim() || '';
    const unitType = document.getElementById('inv-prod-unittype')?.value || 'piece';
    const price = parseFloat(document.getElementById('inv-prod-price')?.value || 0);
    const cost = parseFloat(document.getElementById('inv-prod-cost')?.value || 0);
    const stock = parseFloat(document.getElementById('inv-prod-stock')?.value || 0);
    const barcode = document.getElementById('inv-prod-barcode')?.value.trim() || '';
    const localCode = document.getElementById('inv-prod-localcode')?.value.trim() || '';

    // Pack / Dozen Fields
    const hasPack = document.getElementById('inv-prod-haspack')?.checked ? 1 : 0;
    const packName = document.getElementById('inv-prod-packname')?.value.trim() || '';
    const packBarcode = document.getElementById('inv-prod-packbarcode')?.value.trim() || '';
    const packQty = parseFloat(document.getElementById('inv-prod-packqty')?.value || 12);
    const packPrice = parseFloat(document.getElementById('inv-prod-packprice')?.value || 0);

    if (!name) {
      window.app?.showToast('اسم المنتج مطلوب!', 'error');
      return;
    }

    const oldPriceRaw = document.getElementById('inv-prod-old-price')?.value;
    const oldPriceVal = oldPriceRaw !== '' && oldPriceRaw !== undefined ? parseFloat(oldPriceRaw) : null;
    const descriptionVal = document.getElementById('inv-prod-description')?.value.trim() || '';
    const stockChanged = !!(this.selectedProduct?.id && !this.selectedProduct?.isNew && Math.abs(stock - (parseFloat(this.originalStock || 0) || 0)) >= 0.0005);
    const adjReason = document.getElementById('inv-adj-reason')?.value || '';
    const adjCashRaw = document.getElementById('inv-adj-cash-amount')?.value;
    const adjNote = document.getElementById('inv-adj-note')?.value.trim() || '';
    const cashierName = window.authManager?.currentUser?.name || window.app?.cashierName || 'كاشير الجرد';

    const payload = {
      id: this.selectedProduct.id,
      name: name,
      category: category,
      sub_category: subCategory,
      subcategory: subCategory,
      unit_type: unitType,
      unit: unitType === 'weight' ? 'كيلو' : 'قطعة',
      price: price,
      old_price: oldPriceVal,
      cost: cost,
      stock: stock,
      barcode: barcode,
      local_code: localCode,
      all_barcodes: this.selectedProduct?.all_barcodes || barcode,
      description: descriptionVal,
      has_pack: hasPack,
      pack_name: packName,
      pack_barcode: packBarcode,
      pack_qty: packQty,
      pack_price: packPrice,
      track_adjustment: stockChanged,
      adjustment_reason: stockChanged ? adjReason : '',
      adjustment_cash_amount: stockChanged && adjCashRaw !== '' && adjCashRaw !== undefined ? parseFloat(adjCashRaw) : null,
      adjustment_note: stockChanged ? adjNote : '',
      cashier_name: cashierName,
    };

    // Save unit type mapping in persistent local store so it NEVER reverts on refresh
    window.syncManager?.setProductUnitType(this.selectedProduct.id, unitType);
    window.syncManager?.setProductUnitType({ id: this.selectedProduct.id, local_code: localCode, barcode: barcode }, unitType);

    const isWeight = unitType === 'weight';
    const normalizedProd = {
      ...this.selectedProduct,
      ...payload,
      unit_type: unitType,
      unit: isWeight ? 'كجم' : 'قطعة',
      is_weight: isWeight,
      has_pack: hasPack,
      pack_name: packName,
      pack_barcode: packBarcode,
      pack_qty: packQty,
      pack_price: packPrice
    };

    try {
      window.app?.showLoading(true, 'جاري حفظ التعديلات في السيرفر وتحديث الكتالوج...');
      const res = await window.api.syncProduct(payload);
      window.app?.showLoading(false);

      if (res && res.success) {
        window.posScanner?.playSuccessBeep();
        const msgText = (res.adjustment && res.adjustment.adjusted && res.message)
          ? res.message
          : (this.selectedProduct.isNew ? '??? ????? ????? (' + name + ') ????? ?' : '?? ????? ????? (' + name + ') ????? ?');
        window.app?.showToast(msgText, 'success');

        const newId = res.product_id || (this.selectedProduct.id || Date.now());
        let finalImgUrl = (res.image_url !== undefined) ? res.image_url : (this.selectedProduct.image_url || '');
        let finalHasImg = (res.has_real_image !== undefined) ? !!res.has_real_image : this.isRealImageUrl(finalImgUrl);
        if (this.pendingImageBase64 && newId) {
          try {
            const upRes = await window.api.uploadProductImage({ product_id: newId, image_base64: this.pendingImageBase64, set_main: true });
            if (upRes && upRes.success) {
              finalImgUrl = upRes.image_url || finalImgUrl;
              finalHasImg = true;
              window.app?.showToast('? ?? ??? ?????? ???? ????? ??? ??????!', 'success');
            }
          } catch (upErr) {}
          this.pendingImageBase64 = null;
        }
        this.originalStock = stock;
        const fullProd = { ...normalizedProd, id: newId, image_url: finalImgUrl, has_real_image: finalHasImg };

        // Update or insert into local products list
        const idx = window.app.products.findIndex(p => (this.selectedProduct.id && p.id === this.selectedProduct.id) || (barcode && p.barcode === barcode));
        if (idx > -1) {
          window.app.products[idx] = { ...window.app.products[idx], ...fullProd };
        } else {
          window.app.products.unshift(fullProd);
        }

        // Save & Refresh Catalog
        localStorage.setItem('syrian_home_products', JSON.stringify(window.app.products));
        window.categoryController?.registerCategoryIfNew(category, subCategory);
        window.app?.extractTaxonomy();
        window.app?.renderCategories();
        window.app?.renderProducts();

        // Hide form
        document.getElementById('inv-product-edit-form')?.classList.add('hidden');
        if (document.getElementById('inv-search-input')) {
          document.getElementById('inv-search-input').value = '';
        }
      } else {
        throw new Error(res.error || res.message || 'فشل حفظ التعديلات');
      }
    } catch (err) {
      window.app?.showLoading(false);
      
      // Offline fallback: save locally and queue for background sync
      window.syncManager?.queueProduct(payload);
      window.posScanner?.playSuccessBeep();
      window.app?.showToast(`تم حفظ الصنف (${name}) محلياً (وضع أوفلاين) وستتم مزامنته عند عودة الإنترنت 📦`, 'warning');

      const offlineId = this.selectedProduct.id || Date.now();
      const fullProd = { ...normalizedProd, id: offlineId };

      const idx = window.app.products.findIndex(p => (this.selectedProduct.id && p.id === this.selectedProduct.id) || (barcode && p.barcode === barcode));
      if (idx > -1) {
        window.app.products[idx] = { ...window.app.products[idx], ...fullProd };
      } else {
        window.app.products.unshift(fullProd);
      }

      localStorage.setItem('syrian_home_products', JSON.stringify(window.app.products));
      window.categoryController?.registerCategoryIfNew(category, subCategory);
      window.app?.extractTaxonomy();
      window.app?.renderCategories();
      window.app?.renderProducts();

      document.getElementById('inv-product-edit-form')?.classList.add('hidden');
      if (document.getElementById('inv-search-input')) {
        document.getElementById('inv-search-input').value = '';
      }
    }
  }
}

window.inventoryController = new InventoryController();
