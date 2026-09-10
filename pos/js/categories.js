/**
 * Syrian Home POS - Categories & Subcategories Manager Controller
 * إدارة وإنشاء التصنيفات الرئيسية والفرعية ومزامنتها لحظياً مع السيرفر وكتالوج الكاشير
 */

const DEFAULT_SUPERMARKET_TAXONOMY = {
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

class CategoriesController {
  constructor() {
    this.rawCategories = []; // [{ id, name, parent_id }]
    this.taxonomy = {};      // { [mainName]: Set(subNames) }
    this.init();
  }

  init() {
    // 1. Load initial cache or fallback taxonomy
    this.buildInitialTaxonomy();
    
    // 2. Refresh from server in background
    setTimeout(() => {
      this.loadCategoriesFromServer();
    }, 100);
  }

  buildInitialTaxonomy() {
    this.taxonomy = {};

    // Load cached categories from localStorage if present
    try {
      const cached = JSON.parse(localStorage.getItem('pos_categories_cache') || '[]');
      if (Array.isArray(cached) && cached.length > 0) {
        this.rawCategories = cached;
        this.rebuildTaxonomyFromRaw(cached);
      }
    } catch (e) {
      console.warn('Failed to parse cached categories:', e);
    }

    // If still empty (first run ever), ensure at least 'عام' exists
    if (Object.keys(this.taxonomy).length === 0) {
      this.taxonomy['عام'] = new Set(['متنوع']);
    }

    this.updateDatalists();
  }

  rebuildTaxonomyFromRaw(rawList) {
    if (!Array.isArray(rawList)) return;

    const newTaxonomy = {};
    const idMap = new Map();

    // Map main categories first
    rawList.forEach(c => {
      idMap.set(c.id, c.name);
      if (!c.parent_id || c.parent_id == 0) {
        if (!newTaxonomy[c.name]) {
          newTaxonomy[c.name] = new Set();
        }
      }
    });

    // Link subcategories
    rawList.forEach(c => {
      if (c.parent_id && c.parent_id > 0) {
        const parentName = idMap.get(c.parent_id);
        if (parentName) {
          if (!newTaxonomy[parentName]) {
            newTaxonomy[parentName] = new Set();
          }
          newTaxonomy[parentName].add(c.name);
        }
      }
    });

    if (Object.keys(newTaxonomy).length === 0) {
      newTaxonomy['عام'] = new Set(['متنوع']);
    }

    this.taxonomy = newTaxonomy;
  }

  async loadCategoriesFromServer() {
    try {
      if (!window.api?.getCategories) return;
      const res = await window.api.getCategories();
      if (res && res.success && Array.isArray(res.categories)) {
        this.rawCategories = res.categories;
        this.rebuildTaxonomyFromRaw(res.categories);
        localStorage.setItem('pos_categories_cache', JSON.stringify(res.categories));
        this.updateDatalists();
        
        // Refresh product tabs in main POS if app is loaded
        if (window.app?.extractTaxonomy && window.app?.renderCategories) {
          window.app.extractTaxonomy();
          window.app.renderCategories();
        }
      }
    } catch (err) {
      console.warn('Offline or failed to fetch categories from server:', err);
    }
  }

  getTaxonomy() {
    const res = {};
    for (const [k, v] of Object.entries(this.taxonomy)) {
      res[k] = Array.from(v);
    }
    return res;
  }

  getAllMainCategories() {
    return Object.keys(this.taxonomy).sort((a, b) => a.localeCompare(b, 'ar'));
  }

  getSubcategoriesFor(mainCat) {
    if (!mainCat || !this.taxonomy[mainCat]) return [];
    return Array.from(this.taxonomy[mainCat]).sort((a, b) => a.localeCompare(b, 'ar'));
  }

  updateDatalists() {
    const mains = this.getAllMainCategories();

    // 1. Update Main Categories Datalist
    const mainDatalist = document.getElementById('list-main-categories');
    if (mainDatalist) {
      mainDatalist.innerHTML = mains.map(cat => `<option value="${cat}"></option>`).join('');
    }

    // 2. Update modal select for adding subcategories
    const selectEl = document.getElementById('cat-modal-parent-select');
    if (selectEl) {
      const currentVal = selectEl.value;
      selectEl.innerHTML = `
        <option value="">-- اختر التصنيف الرئيسي التابع له --</option>
        ${mains.map(cat => `<option value="${cat}" ${cat === currentVal ? 'selected' : ''}>${cat}</option>`).join('')}
      `;
    }

    // 3. Update dedicated Categories Page select
    const pageSelect = document.getElementById('cat-page-parent-select');
    if (pageSelect) {
      const currentVal = pageSelect.value;
      pageSelect.innerHTML = `
        <option value="">-- اختر القسم الرئيسي --</option>
        ${mains.map(cat => `<option value="${cat}" ${cat === currentVal ? 'selected' : ''}>${cat}</option>`).join('')}
      `;
    }

    // 4. Update Sub Categories Datalist for currently selected main category in product form
    this.refreshSubCategoryDatalist();

    // 5. Update Categories Page view if active
    if (document.getElementById('view-categories') && !document.getElementById('view-categories').classList.contains('hidden')) {
      this.renderCategoryView();
    }
  }

  refreshSubCategoryDatalist() {
    const mainCatInput = document.getElementById('inv-prod-category');
    const subDatalist = document.getElementById('list-sub-categories');
    if (!subDatalist) return;

    const mainCat = mainCatInput ? mainCatInput.value.trim() : '';
    const subs = this.getSubcategoriesFor(mainCat);
    subDatalist.innerHTML = subs.map(sub => `<option value="${sub}"></option>`).join('');
  }

  /* ==================== CREATE & SYNC CATEGORIES ==================== */

  async createMainCategory(name) {
    const trimmed = (name || '').trim();
    if (!trimmed) {
      window.app?.showToast('يرجى كتابة اسم التصنيف الرئيسي!', 'error');
      return false;
    }

    if (this.taxonomy[trimmed]) {
      window.app?.showToast(`التصنيف الرئيسي (${trimmed}) موجود بالفعل!`, 'warning');
      return false;
    }

    // 1. Optimistic Local Update
    this.taxonomy[trimmed] = new Set();
    this.updateDatalists();
    this.renderManagerUI();

    // 2. Sync with Server
    try {
      window.app?.showLoading(true, 'جاري حفظ التصنيف الرئيسي في السيرفر...');
      const res = await window.api?.syncCategory({ main_category: trimmed });
      window.app?.showLoading(false);

      if (res && res.success) {
        window.posScanner?.playSuccessBeep();
        window.app?.showToast(`تم إنشاء التصنيف الرئيسي (${trimmed}) بنجاح ✅`, 'success');
        if (res.category_id) {
          this.rawCategories.push({ id: res.category_id, name: trimmed, parent_id: null });
          localStorage.setItem('pos_categories_cache', JSON.stringify(this.rawCategories));
        }
      } else {
        throw new Error(res?.error || 'فشل الحفظ');
      }
    } catch (e) {
      window.app?.showLoading(false);
      window.app?.showToast(`تم حفظ التصنيف الرئيسي (${trimmed}) محلياً 📦`, 'info');
    }

    // Refresh POS catalog tabs
    if (window.app) {
      window.app.extractTaxonomy?.();
      window.app.renderCategories?.();
    }

    return true;
  }

  async createSubCategory(mainCategory, subName) {
    const mainTrimmed = (mainCategory || '').trim();
    const subTrimmed = (subName || '').trim();

    if (!mainTrimmed) {
      window.app?.showToast('يرجى اختيار أو كتابة التصنيف الرئيسي أولاً!', 'error');
      return false;
    }

    if (!subTrimmed) {
      window.app?.showToast('يرجى كتابة اسم التصنيف الفرعي!', 'error');
      return false;
    }

    // Ensure main category exists in taxonomy
    if (!this.taxonomy[mainTrimmed]) {
      this.taxonomy[mainTrimmed] = new Set();
    }

    if (this.taxonomy[mainTrimmed].has(subTrimmed)) {
      window.app?.showToast(`التصنيف الفرعي (${subTrimmed}) موجود بالفعل تحت (${mainTrimmed})!`, 'warning');
      return false;
    }

    // 1. Optimistic Local Update
    this.taxonomy[mainTrimmed].add(subTrimmed);
    this.updateDatalists();
    this.renderManagerUI();

    // 2. Sync with Server
    try {
      window.app?.showLoading(true, 'جاري حفظ التصنيف الفرعي في السيرفر...');
      const res = await window.api?.syncCategory({
        main_category: mainTrimmed,
        sub_category: subTrimmed
      });
      window.app?.showLoading(false);

      if (res && res.success) {
        window.posScanner?.playSuccessBeep();
        window.app?.showToast(`تمت إضافة التصنيف الفرعي (${subTrimmed}) تحت (${mainTrimmed}) بنجاح ✅`, 'success');
        if (res.sub_id) {
          this.rawCategories.push({ id: res.sub_id, name: subTrimmed, parent_id: res.main_id });
          localStorage.setItem('pos_categories_cache', JSON.stringify(this.rawCategories));
        }
      } else {
        throw new Error(res?.error || 'فشل الحفظ');
      }
    } catch (e) {
      window.app?.showLoading(false);
      window.app?.showToast(`تم حفظ التصنيف الفرعي (${subTrimmed}) محلياً 📦`, 'info');
    }

    // Refresh POS catalog tabs
    if (window.app) {
      window.app.extractTaxonomy?.();
      window.app.renderCategories?.();
    }

    return true;
  }

  async deleteCategory(mainCat, subCat = null) {
    const isSub = !!subCat;
    const targetLabel = isSub ? `القسم الفرعي (${subCat})` : `القسم الرئيسي (${mainCat}) مع كافة تصنيفاته الفرعية`;
    
    if (!confirm(`هل أنت متأكد من حذف ${targetLabel}؟`)) {
      return;
    }

    // 1. Local deduction in taxonomy
    if (isSub) {
      if (this.taxonomy[mainCat]) {
        this.taxonomy[mainCat].delete(subCat);
      }
    } else {
      delete this.taxonomy[mainCat];
    }

    // Ensure 'عام' exists if everything was deleted
    if (Object.keys(this.taxonomy).length === 0) {
      this.taxonomy['عام'] = new Set(['متنوع']);
    }

    // 2. Remove from rawCategories & localStorage cache
    if (Array.isArray(this.rawCategories)) {
      if (isSub) {
        this.rawCategories = this.rawCategories.filter(c => !(c.name === subCat && c.parent_id));
      } else {
        const mainObj = this.rawCategories.find(c => c.name === mainCat && (!c.parent_id || c.parent_id == 0));
        const mainId = mainObj ? mainObj.id : null;
        this.rawCategories = this.rawCategories.filter(c => {
          if (c.name === mainCat && (!c.parent_id || c.parent_id == 0)) return false;
          if (mainId && c.parent_id == mainId) return false;
          return true;
        });
      }
      localStorage.setItem('pos_categories_cache', JSON.stringify(this.rawCategories));
    }

    // 3. Update products in memory & localStorage so they don't revive the category
    if (window.app?.products && Array.isArray(window.app.products)) {
      let prodsUpdated = false;
      window.app.products.forEach(p => {
        if (!isSub) {
          if ((p.category || '').trim() === mainCat) {
            p.category = 'عام';
            p.sub_category = '';
            p.subcategory = '';
            prodsUpdated = true;
          }
        } else {
          if ((p.category || '').trim() === mainCat && ((p.sub_category || '').trim() === subCat || (p.subcategory || '').trim() === subCat)) {
            p.sub_category = '';
            p.subcategory = '';
            prodsUpdated = true;
          }
        }
      });
      if (prodsUpdated) {
        try {
          localStorage.setItem('syrian_home_products', JSON.stringify(window.app.products));
        } catch (e) {}
      }
    }

    this.updateDatalists();
    this.renderManagerUI();
    this.renderCategoryView();

    // 4. Server deletion
    try {
      window.app?.showLoading(true, 'جاري حذف التصنيف من السيرفر...');
      const payload = isSub 
        ? { main_category: mainCat, sub_category: subCat }
        : { main_category: mainCat, name: mainCat };
      
      await window.api?.deleteCategory(payload);
      window.app?.showLoading(false);
      window.app?.showToast(`تم حذف ${targetLabel} بنجاح 🗑️`, 'success');
    } catch (e) {
      window.app?.showLoading(false);
      window.app?.showToast(`تم الحذف محلياً 🗑️`, 'info');
    }

    // Refresh UI
    if (window.app) {
      window.app.extractTaxonomy?.();
      window.app.renderCategories?.();
      window.app.renderProducts?.();
    }
  }

  async importSupermarketDefaults() {
    if (!confirm('هل تريد استيراد تصنيفات وأقسام السوبرماركت المقترحة وحفظها في المتجر؟')) {
      return;
    }
    window.app?.showLoading(true, 'جاري استيراد أقسام السوبر ماركت المقترحة...');
    try {
      for (const [main, subs] of Object.entries(DEFAULT_SUPERMARKET_TAXONOMY)) {
        if (!this.taxonomy[main]) {
          this.taxonomy[main] = new Set();
        }
        await window.api?.syncCategory({ main_category: main });
        for (const sub of subs) {
          this.taxonomy[main].add(sub);
          await window.api?.syncCategory({ main_category: main, sub_category: sub });
        }
      }
      await this.loadCategoriesFromServer();
      window.app?.showLoading(false);
      window.app?.showToast('تم استيراد تصنيفات السوبر ماركت بنجاح ✅', 'success');
      this.renderCategoryView();
    } catch (e) {
      window.app?.showLoading(false);
      window.app?.showToast('تم استيراد التصنيفات محلياً 📦', 'info');
      this.renderCategoryView();
    }
  }

  // Ensures any user-typed custom category in product edit form is registered
  registerCategoryIfNew(mainCat, subCat = '') {
    const main = (mainCat || '').trim();
    const sub = (subCat || '').trim();
    if (!main) return;

    let isNew = false;
    if (!this.taxonomy[main]) {
      this.taxonomy[main] = new Set();
      isNew = true;
    }
    if (sub && !this.taxonomy[main].has(sub)) {
      this.taxonomy[main].add(sub);
      isNew = true;
    }

    if (isNew) {
      this.updateDatalists();
      // Sync in background quietly
      window.api?.syncCategory({ main_category: main, sub_category: sub });
    }
  }

  /* ==================== CATEGORY MANAGER UI & VIEW CONTROLS ==================== */

  openCategoryManagerModal(preselectedMain = '', forSub = false) {
    window.app?.switchView('categories');
    if (preselectedMain) {
      setTimeout(() => {
        this.openSubAdderOnPage(preselectedMain);
      }, 60);
    }
  }

  closeCategoryManagerModal() {
    const modal = document.getElementById('category-manager-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.style.display = 'none';
  }

  submitNewMainCategory() {
    const input = document.getElementById('cat-modal-main-name');
    if (!input) return;
    const name = input.value.trim();
    if (!name) {
      window.app?.showToast('يرجى كتابة اسم التصنيف الرئيسي!', 'error');
      return;
    }

    this.createMainCategory(name).then(ok => {
      if (ok) input.value = '';
    });
  }

  submitNewSubCategory() {
    const parentSel = document.getElementById('cat-modal-parent-select');
    const subInput = document.getElementById('cat-modal-sub-name');
    if (!parentSel || !subInput) return;

    const mainCat = parentSel.value.trim();
    const subCat = subInput.value.trim();

    if (!mainCat) {
      window.app?.showToast('يرجى اختيار التصنيف الأساسي التابع له!', 'error');
      parentSel.focus();
      return;
    }

    if (!subCat) {
      window.app?.showToast('يرجى كتابة اسم التصنيف الفرعي!', 'error');
      subInput.focus();
      return;
    }

    this.createSubCategory(mainCat, subCat).then(ok => {
      if (ok) subInput.value = '';
    });
  }

  useCategoryInProductForm(mainCat, subCat = '') {
    const mainInput = document.getElementById('inv-prod-category');
    const subInput = document.getElementById('inv-prod-subcategory');

    if (mainInput) {
      mainInput.value = mainCat;
      if (window.inventoryController) {
        window.inventoryController.onMainCategoryChanged();
      }
    }
    if (subInput && subCat) {
      subInput.value = subCat;
    }

    this.closeCategoryManagerModal();
    window.app?.switchView('inventory');
    const formEl = document.getElementById('inv-product-edit-form');
    if (formEl && formEl.classList.contains('hidden')) {
      window.inventoryController?.openNewProductForm();
    }
    const label = subCat ? `${mainCat} > ${subCat}` : mainCat;
    window.app?.showToast(`تم اختيار التصنيف: ${label} وجاري نقلك لنموذج الصنف ✅`, 'success');
  }

  renderManagerUI(filterQuery = '') {
    const listEl = document.getElementById('cat-manager-tree-list');
    const countEl = document.getElementById('cat-manager-total-count');
    if (!listEl) return;

    const q = (filterQuery || document.getElementById('cat-manager-search-input')?.value || '').trim().toLowerCase();
    const mains = this.getAllMainCategories();

    let totalSubsCount = 0;
    mains.forEach(m => {
      totalSubsCount += (this.taxonomy[m] ? this.taxonomy[m].size : 0);
    });

    if (countEl) {
      countEl.textContent = `${mains.length} رئيسي • ${totalSubsCount} فرعي`;
    }

    const filteredMains = mains.filter(m => {
      if (!q) return true;
      if (m.toLowerCase().includes(q)) return true;
      const subs = Array.from(this.taxonomy[m] || []);
      return subs.some(s => s.toLowerCase().includes(q));
    });

    if (filteredMains.length === 0) {
      listEl.innerHTML = `
        <div class="p-8 text-center text-gray-400">
          <i data-lucide="folder-x" class="w-10 h-10 mx-auto mb-2 opacity-30"></i>
          <p class="text-xs font-bold">لا توجد تصنيفات مطابقة للبحث</p>
        </div>
      `;
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    listEl.innerHTML = filteredMains.map(main => {
      const subs = Array.from(this.taxonomy[main] || []).sort((a, b) => a.localeCompare(b, 'ar'));
      const prodsCount = window.app?.products ? window.app.products.filter(p => (p.category || 'عام') === main).length : 0;

      return `
        <div class="p-3.5 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-2xs flex flex-col gap-2.5 transition hover:border-indigo-300 dark:hover:border-indigo-700">
          
          <!-- Main Category Header -->
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2 min-w-0">
              <span class="w-7 h-7 rounded-xl bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 font-bold text-xs">
                📁
              </span>
              <div class="min-w-0">
                <h4 class="text-xs sm:text-sm font-bold text-gray-900 dark:text-white truncate">${main}</h4>
                <span class="text-[10px] text-gray-400">${subs.length} أقسام فرعية • ${prodsCount} منتجات</span>
              </div>
            </div>

            <!-- Main Actions -->
            <div class="flex items-center gap-1.5 shrink-0">
              <button type="button" onclick="window.categoryController.useCategoryInProductForm('${main}', '')" class="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950 dark:hover:bg-indigo-900 text-indigo-600 dark:text-indigo-300 text-[11px] font-bold transition flex items-center gap-1 cursor-pointer" title="استخدام هذا التصنيف في شاشة تعديل الصنف">
                <span>اختيار للصنف</span>
                <i data-lucide="check" class="w-3 h-3"></i>
              </button>

              <button type="button" onclick="window.categoryController.openSubAdderFor('${main}')" class="px-2 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/70 text-emerald-600 dark:text-emerald-400 text-[11px] font-bold transition flex items-center gap-1 cursor-pointer" title="إضافة قسم فرعي يتبع هذا القسم">
                <span>+ فرعي</span>
              </button>

              <button type="button" onclick="window.categoryController.deleteCategory('${main}')" class="p-1.5 rounded-lg text-gray-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/60 transition cursor-pointer" title="حذف هذا القسم الرئيسي بالكامل">
                <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
              </button>
            </div>
          </div>

          <!-- Sub Categories Chips -->
          <div class="pt-2 border-t border-gray-100 dark:border-gray-700/60 flex flex-wrap items-center gap-1.5">
            ${subs.length > 0 ? subs.map(sub => `
              <span class="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-50 dark:bg-gray-700/60 border border-gray-200 dark:border-gray-600 rounded-xl text-[11px] text-gray-700 dark:text-gray-300 font-medium">
                <button type="button" onclick="window.categoryController.useCategoryInProductForm('${main}', '${sub}')" class="hover:text-indigo-600 hover:underline cursor-pointer" title="اختيار هذا التصنيف الفرعي">${sub}</button>
                <button type="button" onclick="window.categoryController.deleteCategory('${main}', '${sub}')" class="text-gray-400 hover:text-rose-600 font-bold px-0.5 cursor-pointer" title="حذف هذا القسم الفرعي">✕</button>
              </span>
            `).join('') : '<span class="text-[10px] text-gray-400 italic">لا توجد أقسام فرعية بعد (اضغط + فرعي لإضافة تصنيف فرعي)</span>'}
          </div>

        </div>
      `;
    }).join('');

    if (window.lucide) window.lucide.createIcons();
  }

  /* ==================== DEDICATED FULL PAGE VIEW CONTROLS ==================== */

  submitPageMainCategory() {
    const input = document.getElementById('cat-page-main-name');
    if (!input) return;
    const name = input.value.trim();
    if (!name) {
      window.app?.showToast('يرجى كتابة اسم التصنيف الرئيسي!', 'error');
      return;
    }

    this.createMainCategory(name).then(ok => {
      if (ok) {
        input.value = '';
        this.renderCategoryView();
      }
    });
  }

  submitPageSubCategory() {
    const parentSel = document.getElementById('cat-page-parent-select');
    const subInput = document.getElementById('cat-page-sub-name');
    if (!parentSel || !subInput) return;

    const mainCat = parentSel.value.trim();
    const subCat = subInput.value.trim();

    if (!mainCat) {
      window.app?.showToast('يرجى اختيار القسم الرئيسي أولاً!', 'error');
      parentSel.focus();
      return;
    }

    if (!subCat) {
      window.app?.showToast('يرجى كتابة اسم القسم الفرعي!', 'error');
      subInput.focus();
      return;
    }

    this.createSubCategory(mainCat, subCat).then(ok => {
      if (ok) {
        subInput.value = '';
        this.renderCategoryView();
      }
    });
  }

  openSubAdderOnPage(mainCat) {
    const sel = document.getElementById('cat-page-parent-select');
    if (sel) sel.value = mainCat;
    const subInput = document.getElementById('cat-page-sub-name');
    if (subInput) {
      subInput.focus();
      subInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  renderCategoryView(filterQuery = '') {
    const listEl = document.getElementById('cat-page-tree-list');
    const mainsCountEl = document.getElementById('cat-page-mains-count');
    const subsCountEl = document.getElementById('cat-page-subs-count');
    const prodsCountEl = document.getElementById('cat-page-prods-count');
    if (!listEl) return;

    const q = (filterQuery || document.getElementById('cat-page-search-input')?.value || '').trim().toLowerCase();
    const mains = this.getAllMainCategories();

    let totalSubsCount = 0;
    mains.forEach(m => {
      totalSubsCount += (this.taxonomy[m] ? this.taxonomy[m].size : 0);
    });

    const totalProds = window.app?.products ? window.app.products.length : 0;

    if (mainsCountEl) mainsCountEl.textContent = mains.length;
    if (subsCountEl) subsCountEl.textContent = totalSubsCount;
    if (prodsCountEl) prodsCountEl.textContent = totalProds;

    const filteredMains = mains.filter(m => {
      if (!q) return true;
      if (m.toLowerCase().includes(q)) return true;
      const subs = Array.from(this.taxonomy[m] || []);
      return subs.some(s => s.toLowerCase().includes(q));
    });

    if (filteredMains.length === 0) {
      listEl.innerHTML = `
        <div class="col-span-full p-12 text-center text-gray-400 bg-white dark:bg-gray-800 rounded-3xl border border-gray-100 dark:border-gray-700">
          <i data-lucide="folder-x" class="w-12 h-12 mx-auto mb-2 opacity-30 text-indigo-400"></i>
          <p class="text-sm font-bold">لا توجد أقسام مطابقة للبحث</p>
        </div>
      `;
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    listEl.innerHTML = filteredMains.map(main => {
      const subs = Array.from(this.taxonomy[main] || []).sort((a, b) => a.localeCompare(b, 'ar'));
      const prodsCount = window.app?.products ? window.app.products.filter(p => (p.category || 'عام') === main).length : 0;

      return `
        <div class="p-4 bg-white dark:bg-gray-800 rounded-3xl border border-gray-200 dark:border-gray-700 shadow-2xs flex flex-col justify-between gap-3 transition hover:border-indigo-300 dark:hover:border-indigo-700 overflow-hidden">
          
          <!-- Main Category Header -->
          <div class="flex items-center justify-between gap-2 pb-2.5 border-b border-gray-100 dark:border-gray-700/60">
            <div class="flex items-center gap-2 min-w-0">
              <span class="w-8 h-8 rounded-2xl bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 font-bold text-sm shadow-2xs">
                📁
              </span>
              <div class="min-w-0">
                <h4 class="text-sm font-bold text-gray-900 dark:text-white truncate" title="${main}">${main}</h4>
                <span class="text-[11px] text-gray-400 font-medium block truncate">${subs.length} أقسام فرعية • ${prodsCount} أصناف</span>
              </div>
            </div>

            <!-- Actions -->
            <div class="flex items-center gap-1 shrink-0">
              <button type="button" onclick="window.categoryController.useCategoryInProductForm('${main}', '')" class="px-2 py-1 rounded-xl bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-300 text-xs font-bold transition flex items-center gap-1 cursor-pointer active:scale-95 whitespace-nowrap" title="اختيار هذا القسم وتطبيقه في شاشة المخزون والصنف">
                <i data-lucide="check" class="w-3.5 h-3.5"></i>
                <span>تطبيق</span>
              </button>
              <button type="button" onclick="window.categoryController.openSubAdderOnPage('${main}')" class="px-2.5 py-1 rounded-xl bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/70 text-emerald-600 dark:text-emerald-400 text-xs font-bold transition flex items-center gap-1 cursor-pointer active:scale-95 whitespace-nowrap" title="إضافة قسم فرعي يتبع هذا القسم">
                <i data-lucide="plus" class="w-3.5 h-3.5"></i>
                <span>فرعي</span>
              </button>
              <button type="button" onclick="window.categoryController.deleteCategory('${main}')" class="p-1.5 rounded-xl text-gray-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/60 transition cursor-pointer shrink-0" title="حذف هذا القسم الرئيسي بالكامل">
                <i data-lucide="trash-2" class="w-4 h-4"></i>
              </button>
            </div>
          </div>

          <!-- Sub Categories Chips -->
          <div class="flex flex-wrap items-center gap-1.5 min-h-[35px]">
            ${subs.length > 0 ? subs.map(sub => `
              <span class="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-50 dark:bg-gray-700/60 border border-gray-200 dark:border-gray-600 rounded-xl text-xs text-gray-700 dark:text-gray-300 font-medium">
                <button type="button" onclick="window.categoryController.useCategoryInProductForm('${main}', '${sub}')" class="hover:text-indigo-600 hover:underline cursor-pointer flex items-center gap-1" title="اختيار هذا التصنيف وتطبيقه على الصنف">
                  <span>🏷️ ${sub}</span>
                </button>
                <button type="button" onclick="window.categoryController.deleteCategory('${main}', '${sub}')" class="text-gray-400 hover:text-rose-600 font-bold px-0.5 cursor-pointer ml-0.5" title="حذف هذا القسم الفرعي">✕</button>
              </span>
            `).join('') : '<span class="text-xs text-gray-400 italic">لا توجد أقسام فرعية بعد (اضغط + فرعي لإضافة فروع)</span>'}
          </div>

          <!-- Footer button: Show Products of this category in POS -->
          <div class="pt-2 border-t border-gray-100 dark:border-gray-700/60 flex items-center justify-between">
            <button type="button" onclick="window.app.filterByCategory('${main}'); window.app.switchView('pos');" class="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer">
              <span>عرض الأصناف في البيع (${prodsCount})</span>
              <i data-lucide="chevron-left" class="w-3.5 h-3.5"></i>
            </button>
          </div>

        </div>
      `;
    }).join('');

    if (window.lucide) window.lucide.createIcons();
  }

  openSubAdderFor(mainCat) {
    const sel = document.getElementById('cat-modal-parent-select');
    if (sel) sel.value = mainCat;
    const subInput = document.getElementById('cat-modal-sub-name');
    if (subInput) {
      subInput.focus();
      subInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }
}

window.categoryController = new CategoriesController();
