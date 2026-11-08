/**
 * Syrian Home POS - Customers & Credit Management Controller (إدارة حسابات العملاء والآجل)
 * مزامنة دقيقة ومتطابقة 100% مع أكواد وأرصدة برنامج دريم سوفت الأصلي
 */
class CustomersController {
  constructor() {
    this.customers = [];
    this.filter = 'debtors'; // 'debtors', 'all', 'creditors'
    this.searchQuery = '';
    this.selectedCustomer = null;
    this.currentReceiptModalType = 'receipt'; // 'receipt' (مقبوض) | 'pay' (دفع)
  }

  init() {
    this.bindEvents();
    this.loadCustomers();
  }

  bindEvents() {
    // Search input
    const searchInput = document.getElementById('cust-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value.trim().toLowerCase();
        this.renderCustomersList();
      });
    }

    // Filter Buttons
    document.querySelectorAll('.cust-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.cust-filter-btn').forEach(b => {
          b.classList.remove('bg-indigo-600', 'text-white', 'shadow-xs');
          b.classList.add('bg-white', 'dark:bg-gray-800', 'text-gray-600', 'dark:text-gray-300');
        });
        btn.classList.add('bg-indigo-600', 'text-white', 'shadow-xs');
        btn.classList.remove('bg-white', 'dark:bg-gray-800', 'text-gray-600', 'dark:text-gray-300');
        this.filter = btn.getAttribute('data-filter');
        this.renderCustomersList();
      });
    });

    // Refresh Button
    const refreshBtn = document.getElementById('btn-refresh-customers');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => this.loadCustomers(true));
    }
  }

  async loadCustomers(forceRefresh = false) {
    const listContainer = document.getElementById('customers-grid');
    
    // 1. Instant Cache Load
    if (!forceRefresh) {
      try {
        const cached = localStorage.getItem('syrian_home_customers');
        if (cached) {
          this.customers = JSON.parse(cached);
          this.renderKPIs();
          this.renderCustomersList();
        }
      } catch (e) {}
    }

    try {
      if (forceRefresh || !this.customers || this.customers.length === 0) {
        window.app?.showLoading(true, 'جاري تحميل بيانات العملاء وأرصدة دريم سوفت...');
      }
      
      const res = await window.api.get('get_customers', { limit: 1000 });
      window.app?.showLoading(false);

      if (res && res.success && Array.isArray(res.customers)) {
        this.customers = res.customers.map(c => {
          const code = parseInt(c.code || c.id || 0);
          const remind = parseFloat(c.remind || 0);
          const rawBal = parseFloat(c.balance || 0);
          const rec = parseFloat(c.receipts || 0);

          // الحساب المحاسبي المباشر من دريم سوفت:
          let finalBal = rawBal;
          if (finalBal === 0 && remind > 0) {
            finalBal = -remind;
          }

          return {
            id: parseInt(c.id || code),
            code: code,
            name: c.name || 'عميل بدون اسم',
            phone: c.phone || '',
            phone2: c.phone2 || '',
            address: c.address || '',
            notes: c.notes || '',
            balance: finalBal,
            remind: remind,
            receipts: rec,
            total_orders: parseInt(c.total_orders || 0),
            total_spent: parseFloat(c.total_spent || 0)
          };
        });

        // حفظ في الكاش
        try {
          localStorage.setItem('syrian_home_customers', JSON.stringify(this.customers));
        } catch (e) {}

        this.renderKPIs();
        this.renderCustomersList();
        this.updateCustomerDropdowns();
      }
    } catch (err) {
      window.app?.showLoading(false);
      console.error('Error loading customers:', err);
    }
  }

  renderKPIs() {
    let totalDebt = 0;
    let debtCustomersCount = 0;
    let totalCredit = 0;

    this.customers.forEach(c => {
      if (c.balance < 0) {
        totalDebt += Math.abs(c.balance);
        debtCustomersCount++;
      } else if (c.balance > 0) {
        totalCredit += c.balance;
      }
    });

    const elCount = document.getElementById('kpi-cust-count');
    const elDebt = document.getElementById('kpi-cust-total-debt');
    const elDebtCount = document.getElementById('kpi-cust-debt-count');
    const elCredit = document.getElementById('kpi-cust-total-credit');

    if (elCount) elCount.textContent = this.customers.length;
    if (elDebt) elDebt.textContent = `${totalDebt.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;
    if (elDebtCount) elDebtCount.textContent = `${debtCustomersCount} عميل`;
    if (elCredit) elCredit.textContent = `${totalCredit.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;
  }

  renderCustomersList() {
    const grid = document.getElementById('customers-grid');
    if (!grid) return;

    let filtered = [...this.customers];

    // Filter by Debt Status
    if (this.filter === 'debtors') {
      filtered = filtered.filter(c => c.balance < 0);
    } else if (this.filter === 'creditors') {
      filtered = filtered.filter(c => c.balance > 0);
    }

    // Filter by Search Query (ID/Code, Name, or Phone)
    if (this.searchQuery) {
      const q = this.searchQuery;
      filtered = filtered.filter(c => 
        String(c.code).includes(q) ||
        String(c.id).includes(q) ||
        (c.name && c.name.toLowerCase().includes(q)) ||
        (c.phone && c.phone.includes(q)) ||
        (c.notes && c.notes.toLowerCase().includes(q))
      );
    }

    // Sort: Largest debt first, then by code
    filtered.sort((a, b) => {
      if (a.balance !== b.balance) {
        return a.balance - b.balance; // الأكثر مديونية أولاً
      }
      return a.code - b.code;
    });

    if (filtered.length === 0) {
      grid.innerHTML = `
        <div class="col-span-full py-16 text-center text-gray-400">
          <i data-lucide="users" class="w-12 h-12 mx-auto mb-2 opacity-40 text-indigo-400"></i>
          <p class="text-xs font-bold text-gray-600 dark:text-gray-300">لم يتم العثور على أي عميل مطابق للبحث أو الفلتر</p>
          <button onclick="window.customersController.filter = 'all'; window.customersController.searchQuery = ''; document.getElementById('cust-search-input').value = ''; window.customersController.renderCustomersList();" class="mt-3 px-4 py-2 rounded-xl bg-gray-100 dark:bg-gray-700 text-xs font-bold text-indigo-600 hover:bg-gray-200 transition">
            عرض كافة العملاء (${this.customers.length})
          </button>
        </div>
      `;
      if (window.lucide) window.lucide.createIcons({ root: document.getElementById('view-customers') || document.body });
      return;
    }

    grid.innerHTML = filtered.map(c => {
      const isDebt = c.balance < 0;
      const isCredit = c.balance > 0;
      const absBal = Math.abs(c.balance).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

      return `
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border ${isDebt ? 'border-rose-300 dark:border-rose-900/80 shadow-xs' : 'border-gray-200 dark:border-gray-700 shadow-2xs'} flex flex-col justify-between gap-3 transition hover:shadow-md">
          
          <!-- Top Row: Code Badge & Debt Badge -->
          <div class="flex items-start justify-between gap-2">
            <div class="flex items-center gap-1.5 flex-wrap">
              <span class="px-2.5 py-1 rounded-xl bg-indigo-50 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 font-mono font-black text-xs border border-indigo-200/80 dark:border-indigo-800">
                كود دريم سوفت #${c.code || c.id}
              </span>
              ${c.phone ? `
                <a href="tel:${c.phone}" class="px-2 py-0.5 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-mono text-[11px] hover:text-indigo-600 flex items-center gap-1">
                  <span>📞</span> <span>${c.phone}</span>
                </a>
              ` : ''}
            </div>

            <!-- Balance Badge -->
            <div class="text-left">
              ${isDebt ? `
                <span class="px-2.5 py-1 rounded-xl bg-rose-50 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 font-mono font-black text-xs border border-rose-200 dark:border-rose-800 flex items-center gap-1">
                  <span>آجل مطلوب:</span> <span>${absBal} ج.م</span>
                </span>
              ` : isCredit ? `
                <span class="px-2.5 py-1 rounded-xl bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 font-mono font-black text-xs border border-emerald-200 dark:border-emerald-800 flex items-center gap-1">
                  <span>رصيد دائن:</span> <span>+${absBal} ج.م</span>
                </span>
              ` : `
                <span class="px-2.5 py-1 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-500 font-mono font-bold text-xs">
                  خالص (0.00)
                </span>
              `}
            </div>
          </div>

          <!-- Customer Name & Details -->
          <div class="my-1">
            <h3 class="text-sm sm:text-base font-black text-gray-900 dark:text-white leading-tight">${c.name}</h3>
            ${c.address ? `<p class="text-[11px] text-gray-400 mt-1 flex items-center gap-1"><span>📍</span> <span>${c.address}</span></p>` : ''}
          </div>

          <!-- Actions Toolbar -->
          <div class="pt-2 border-t border-gray-100 dark:border-gray-700/60 grid grid-cols-3 gap-1.5">
            <button onclick="window.customersController.openVoucherSubView(${c.id}, 'receipt')" class="py-2 px-1 rounded-xl bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 text-xs font-bold transition flex items-center justify-center gap-1 shadow-2xs cursor-pointer">
              <i data-lucide="arrow-down-left" class="w-3.5 h-3.5"></i>
              <span>قبض [مقبوض]</span>
            </button>
            <button onclick="window.customersController.openVoucherSubView(${c.id}, 'pay')" class="py-2 px-1 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/60 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 text-xs font-bold transition flex items-center justify-center gap-1 shadow-2xs cursor-pointer">
              <i data-lucide="arrow-up-right" class="w-3.5 h-3.5"></i>
              <span>صرف [دفع]</span>
            </button>
            <button onclick="window.customersController.openLedgerSubView(${c.id})" class="py-2 px-1 rounded-xl bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 text-xs font-bold transition flex items-center justify-center gap-1 shadow-2xs cursor-pointer">
              <i data-lucide="file-text" class="w-3.5 h-3.5"></i>
              <span>كشف حساب</span>
            </button>
          </div>

        </div>
      `;
    }).join('');

    if (window.lucide) window.lucide.createIcons({ root: document.getElementById('view-customers') || document.body });
  }

  // ==================== SUBVIEWS (TABS) NAVIGATION ====================
  updateSubTabButtons(subview) {
    document.querySelectorAll('.cust-subtab-btn').forEach(btn => {
      let match = false;
      const dataSub = btn.getAttribute('data-subview');
      if (subview === 'list' && dataSub === 'list') match = true;
      else if (subview === 'ledger' && dataSub === 'ledger') match = true;
      else if (subview === 'voucher') {
        if (this.voucherType === 'payment' && (dataSub === 'voucher-payment' || dataSub === 'voucher')) match = true;
        else if (this.voucherType !== 'payment' && (dataSub === 'voucher-receipt' || dataSub === 'voucher')) match = true;
      }

      if (match) {
        btn.className = 'cust-subtab-btn px-3.5 py-2 rounded-xl text-xs font-bold bg-indigo-600 text-white shadow-md flex items-center gap-1.5 transition cursor-pointer';
      } else {
        btn.className = 'cust-subtab-btn px-3.5 py-2 rounded-xl text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 flex items-center gap-1.5 transition cursor-pointer';
      }
    });
  }

  setSubView(subview) {
    this.currentSubView = subview;
    const listEl = document.getElementById('cust-subview-list');
    const voucherEl = document.getElementById('cust-subview-voucher');
    const ledgerEl = document.getElementById('cust-subview-ledger');

    this.updateSubTabButtons(subview);

    listEl?.classList.add('hidden');
    voucherEl?.classList.add('hidden');
    ledgerEl?.classList.add('hidden');

    if (subview === 'list') {
      listEl?.classList.remove('hidden');
      this.renderCustomersList();
    } else if (subview === 'voucher') {
      voucherEl?.classList.remove('hidden');
      this.populateVoucherForm();
    } else if (subview === 'ledger') {
      ledgerEl?.classList.remove('hidden');
      this.populateInlineLedger();
    }

    if (window.lucide) window.lucide.createIcons();
  }

  openVoucherSubView(customerIdentifier, type = 'receipt') {
    if (window.app && typeof window.app.switchView === 'function') {
      window.app.switchView('customers');
    }
    this.voucherType = (type === 'pay' || type === 'payment') ? 'payment' : 'receipt';
    this.currentSubView = 'voucher';

    this.updateSubTabButtons('voucher');

    const listEl = document.getElementById('cust-subview-list');
    const voucherEl = document.getElementById('cust-subview-voucher');
    const ledgerEl = document.getElementById('cust-subview-ledger');

    listEl?.classList.add('hidden');
    ledgerEl?.classList.add('hidden');
    voucherEl?.classList.remove('hidden');

    this.populateVoucherForm(customerIdentifier);

    setTimeout(() => {
      voucherEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      const amountInp = document.getElementById('cust-voucher-amount');
      if (amountInp) {
        amountInp.focus();
        if (amountInp.value) amountInp.select();
      }
    }, 120);

    if (window.lucide) window.lucide.createIcons();
  }

  openLedgerSubView(customerIdentifier) {
    if (window.app && typeof window.app.switchView === 'function') {
      window.app.switchView('customers');
    }
    this.currentSubView = 'ledger';
    this.updateSubTabButtons('ledger');

    const listEl = document.getElementById('cust-subview-list');
    const voucherEl = document.getElementById('cust-subview-voucher');
    const ledgerEl = document.getElementById('cust-subview-ledger');

    listEl?.classList.add('hidden');
    voucherEl?.classList.add('hidden');
    ledgerEl?.classList.remove('hidden');

    this.populateInlineLedger(customerIdentifier);

    setTimeout(() => {
      ledgerEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);

    if (window.lucide) window.lucide.createIcons();
  }

  populateVoucherForm(preselectedId = null) {
    const select = document.getElementById('cust-voucher-customer-id');
    if (!select) return;

    let targetCust = null;
    if (preselectedId !== null && preselectedId !== undefined && preselectedId !== '') {
      targetCust = this.customers.find(c => c.id == preselectedId) || 
                   this.customers.find(c => c.code == preselectedId) ||
                   this.customers.find(c => String(c.id) === String(preselectedId) || String(c.code) === String(preselectedId));
    }

    select.innerHTML = '<option value="">-- اختر العميل بالاسم أو الكود --</option>' +
      this.customers.map(c => `
        <option value="${c.id}" ${targetCust && targetCust.id === c.id ? 'selected' : ''}>
          #${c.code || c.id} - ${c.name} (${c.balance < 0 ? `آجل مطلوب: ${Math.abs(c.balance).toFixed(2)} ج.م` : c.balance > 0 ? `رصيد دائن: ${c.balance.toFixed(2)} ج.م` : 'خالص'})
        </option>
      `).join('');

    if (targetCust) {
      select.value = String(targetCust.id);
    }

    const titleEl = document.getElementById('cust-voucher-title');
    const badgeEl = document.getElementById('cust-voucher-type-badge');
    const submitBtn = document.getElementById('cust-voucher-submit-btn');

    if (this.voucherType === 'payment') {
      if (titleEl) titleEl.innerHTML = `<span>📤 تسجيل سند صرف (دفع نقدي لعميل)</span>`;
      if (badgeEl) {
        badgeEl.textContent = 'صرف (يخرج من درج الكاشير) 🔴';
        badgeEl.className = 'px-2.5 py-1 rounded-xl text-xs font-bold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300';
      }
      if (submitBtn) {
        submitBtn.className = 'flex-1 py-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-md transition flex items-center justify-center gap-1.5 cursor-pointer';
      }
    } else {
      if (titleEl) titleEl.innerHTML = `<span>📥 تسجيل سند قبض / مقبوض من عميل</span>`;
      if (badgeEl) {
        badgeEl.textContent = 'مقبوض (يدخل درج الكاشير) 🟢';
        badgeEl.className = 'px-2.5 py-1 rounded-xl text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300';
      }
      if (submitBtn) {
        submitBtn.className = 'flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md transition flex items-center justify-center gap-1.5 cursor-pointer';
      }
    }

    this.onVoucherCustomerChange();
  }

  onVoucherCustomerChange() {
    const select = document.getElementById('cust-voucher-customer-id');
    const previewEl = document.getElementById('cust-voucher-preview');
    const amountInp = document.getElementById('cust-voucher-amount');
    const noteInp = document.getElementById('cust-voucher-note');
    if (!select) return;

    const custId = parseInt(select.value, 10);
    const cust = this.customers.find(c => c.id === custId);
    if (!cust) {
      if (previewEl) previewEl.innerHTML = '';
      return;
    }

    const absDebt = Math.abs(cust.balance).toFixed(2);
    let balBadge = '';
    if (cust.balance < 0) {
      balBadge = `<span class="px-2.5 py-1 rounded-xl text-xs font-bold bg-rose-50 dark:bg-rose-950 text-rose-600 dark:text-rose-400 border border-rose-200">المديونية الحالية: ${absDebt} ج.م (آجل مطلوب)</span>`;
      if (amountInp && this.voucherType !== 'payment') {
        amountInp.value = absDebt;
      }
    } else if (cust.balance > 0) {
      balBadge = `<span class="px-2.5 py-1 rounded-xl text-xs font-bold bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 border border-emerald-200">رصيد دائن: ${cust.balance.toFixed(2)} ج.م</span>`;
      if (amountInp && this.voucherType === 'payment') {
        amountInp.value = Math.abs(cust.balance).toFixed(2);
      }
    } else {
      balBadge = `<span class="px-2.5 py-1 rounded-xl text-xs font-bold bg-gray-100 dark:bg-gray-700 text-gray-500">الحساب خالص (0.00 ج.م)</span>`;
      if (amountInp) amountInp.value = '';
    }

    if (previewEl) {
      previewEl.innerHTML = `
        <div class="p-3 rounded-2xl bg-gray-50 dark:bg-gray-700/40 border border-gray-200 dark:border-gray-600 flex items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <i data-lucide="user" class="w-4 h-4 text-indigo-500"></i>
            <span class="font-bold text-xs text-gray-800 dark:text-gray-200">${cust.name} (كود #${cust.code || cust.id})</span>
          </div>
          ${balBadge}
        </div>
      `;
    }

    if (noteInp) {
      noteInp.value = this.voucherType === 'payment' ? `صرف نقدي لعميل #${cust.code || cust.id}` : `دفعة نقدية من حساب الآجل - عميل #${cust.code || cust.id}`;
    }

    if (window.lucide && previewEl) window.lucide.createIcons({ root: previewEl });
  }

  setFullRemainingVoucherAmount() {
    const select = document.getElementById('cust-voucher-customer-id');
    const amountInp = document.getElementById('cust-voucher-amount');
    if (!select || !amountInp) return;
    const custId = parseInt(select.value, 10);
    const cust = this.customers.find(c => c.id === custId || c.code === custId);
    if (cust && cust.balance < 0) {
      amountInp.value = Math.abs(cust.balance).toFixed(2);
      amountInp.focus();
    }
  }

  async saveVoucher() {
    const select = document.getElementById('cust-voucher-customer-id');
    const amountInp = document.getElementById('cust-voucher-amount');
    const methodSelect = document.getElementById('cust-voucher-method');
    const noteInp = document.getElementById('cust-voucher-note');

    const custId = select ? parseInt(select.value, 10) : 0;
    const cust = this.customers.find(c => c.id === custId || c.code === custId);
    const amount = parseFloat(amountInp?.value || 0);
    const method = methodSelect?.value || 'كاش من الدرج';
    const note = noteInp?.value.trim() || '';

    if (!cust) {
      window.app?.showToast('يرجى اختيار العميل أولاً', 'error');
      select?.focus();
      return;
    }

    if (isNaN(amount) || amount <= 0) {
      window.app?.showToast('يرجى إدخال مبلغ صحيح أكبر من الصفر', 'error');
      amountInp?.focus();
      return;
    }

    const action = this.voucherType === 'payment' ? 'pay_customer' : 'customer_receipt';
    const payload = {
      customer_id: cust.id,
      customer_code: cust.code,
      customer_name: cust.name,
      amount: amount,
      payment_method: method,
      note: note,
      date: new Date().toISOString().slice(0, 19).replace('T', ' ')
    };

    window.app?.showLoading(true, 'جاري تسجيل السند وتحديث الحساب...');
    try {
      const res = await window.api.post(action, payload);
      window.app?.showLoading(false);
      if (res && res.success) {
        window.app?.showToast(res.message || 'تم حفظ السند بنجاح!', 'success');
        if (amountInp) amountInp.value = '';
        if (noteInp) noteInp.value = '';
        await this.loadCustomers(true);
        this.setSubView('list');
      } else {
        window.app?.showToast(res.error || 'تعذر حفظ السند!', 'error');
      }
    } catch (err) {
      window.app?.showLoading(false);
      window.app?.showToast('خطأ في الاتصال: ' + err.message, 'error');
    }
  }

  async populateInlineLedger(preselectedId = null) {
    let cust = null;
    if (preselectedId !== null && preselectedId !== undefined && preselectedId !== '') {
      cust = this.customers.find(c => c.id == preselectedId) || 
             this.customers.find(c => c.code == preselectedId) ||
             this.customers.find(c => String(c.id) === String(preselectedId) || String(c.code) === String(preselectedId));
    }
    if (!cust) {
      cust = this.customers.find(c => c.balance < 0) || this.customers[0];
    }
    if (!cust) return;

    // Populate and update customer selector inside ledger subview
    const select = document.getElementById('cust-ledger-customer-select');
    if (select) {
      select.innerHTML = '<option value="">-- اختر العميل بالاسم أو الكود --</option>' +
        this.customers.map(c => `
          <option value="${c.id}" ${c.id === cust.id ? 'selected' : ''}>
            #${c.code || c.id} - ${c.name} (${c.balance < 0 ? `آجل مطلوب: ${Math.abs(c.balance).toFixed(2)} ج.م` : c.balance > 0 ? `دائن: ${c.balance.toFixed(2)} ج.م` : 'خالص'})
          </option>
        `).join('');
      select.value = String(cust.id);
    }

    const titleEl = document.getElementById('cust-ledger-title');
    const balEl = document.getElementById('cust-ledger-balance');
    const tbody = document.getElementById('cust-ledger-table-body');
    const mobileCards = document.getElementById('cust-ledger-mobile-cards');

    if (titleEl) titleEl.textContent = `كشف حساب: ${cust.name} (كود #${cust.code || cust.id})`;
    if (balEl) {
      const absBal = Math.abs(cust.balance).toLocaleString('ar-EG', { minimumFractionDigits: 2 });
      balEl.textContent = `${absBal} ج.م ${cust.balance < 0 ? '(مديونية مطلوبة 🔴)' : cust.balance > 0 ? '(رصيد دائن 🟢)' : '(خالص ✅)'}`;
      balEl.className = `font-mono font-black text-sm ${cust.balance < 0 ? 'text-rose-600 dark:text-rose-400' : cust.balance > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-500'}`;
    }

    if (tbody) tbody.innerHTML = `<tr><td colspan="5" class="py-8 text-center text-gray-400">جاري تحميل حركات الحساب...</td></tr>`;
    if (mobileCards) mobileCards.innerHTML = `<div class="py-6 text-center text-gray-400 text-xs">جاري تحميل حركات الحساب...</div>`;

    try {
      const res = await window.api.get('get_customer_ledger', { customer_id: cust.id, customer_code: cust.code, customer_name: cust.name });
      if (res && res.success && Array.isArray(res.transactions)) {
        if (res.transactions.length === 0) {
          if (tbody) tbody.innerHTML = `<tr><td colspan="5" class="py-8 text-center text-gray-400">لا توجد حركات مسجلة حتى الآن</td></tr>`;
          if (mobileCards) mobileCards.innerHTML = `<div class="py-6 text-center text-gray-400 text-xs">لا توجد حركات مسجلة حتى الآن</div>`;
          return;
        }

        if (tbody) {
          tbody.innerHTML = res.transactions.map(t => `
            <tr class="border-b border-gray-100 dark:border-gray-800 text-xs hover:bg-gray-50 dark:hover:bg-gray-800/40">
              <td class="py-2.5 px-3 font-mono text-gray-500">${t.date || t.created_at}</td>
              <td class="py-2.5 px-3 font-bold text-gray-800 dark:text-gray-200">${t.type}</td>
              <td class="py-2.5 px-3 font-mono font-bold ${t.type.includes('قبض') ? 'text-emerald-600' : 'text-rose-600'}">${parseFloat(t.amount || 0).toFixed(2)} ج.م</td>
              <td class="py-2.5 px-3 text-gray-500">${t.payment_method || 'كاش'}</td>
              <td class="py-2.5 px-3 text-gray-600 dark:text-gray-400">${t.note || '-'}</td>
            </tr>
          `).join('');
        }

        if (mobileCards) {
          mobileCards.innerHTML = res.transactions.map(t => {
            const isReceipt = t.type.includes('قبض');
            const colorClass = isReceipt ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400';
            const badgeClass = isReceipt ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200' : 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200';
            return `
              <div class="p-3 rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs flex flex-col gap-1.5 shadow-2xs">
                <div class="flex items-center justify-between">
                  <span class="px-2 py-0.5 rounded-lg text-[10px] font-bold border ${badgeClass}">${t.type}</span>
                  <span class="font-mono text-gray-400 text-[10px]">${t.date || t.created_at || ''}</span>
                </div>
                <div class="flex items-center justify-between font-bold pt-1">
                  <span class="text-gray-700 dark:text-gray-300">${t.note || t.reference || '-'}</span>
                  <span class="font-mono ${colorClass} text-sm" dir="ltr">${isReceipt ? '+' : '-'}${parseFloat(t.amount || 0).toFixed(2)} ج.م</span>
                </div>
                <div class="text-[10px] text-gray-400">${t.payment_method || 'كاش'}</div>
              </div>
            `;
          }).join('');
        }
      }
    } catch (err) {
      if (tbody) tbody.innerHTML = `<tr><td colspan="5" class="py-4 text-center text-rose-500">تعذر جلب الحركات: ${err.message}</td></tr>`;
      if (mobileCards) mobileCards.innerHTML = `<div class="py-4 text-center text-rose-500 text-xs">تعذر جلب الحركات: ${err.message}</div>`;
    }
  }

  onLedgerCustomerChange() {
    const select = document.getElementById('cust-ledger-customer-select');
    if (!select || !select.value) return;
    this.populateInlineLedger(parseInt(select.value, 10));
  }

  openVoucherModal(customerCode, type = 'receipt') {
    this.openVoucherSubView(customerCode, type);
    return;
    const cust = this.customers.find(c => String(c.code) === String(customerCode) || String(c.id) === String(customerCode));
    if (!cust) return;

    this.selectedCustomer = cust;
    this.currentReceiptModalType = type;

    const modal = document.getElementById('cust-voucher-modal');
    if (!modal) return;

    const titleEl = document.getElementById('cust-voucher-modal-title');
    const subtitleEl = document.getElementById('cust-voucher-modal-subtitle');
    const custNameEl = document.getElementById('cust-modal-voucher-name') || document.getElementById('cust-voucher-name');
    const custBalEl = document.getElementById('cust-modal-voucher-balance') || document.getElementById('cust-voucher-balance');
    const amountInp = document.getElementById('cust-modal-voucher-amount') || document.getElementById('cust-voucher-amount');
    const noteInp = document.getElementById('cust-modal-voucher-note') || document.getElementById('cust-voucher-note');

    if (custNameEl) custNameEl.textContent = `${cust.name} (كود #${cust.code || cust.id})`;
    
    const absDebt = Math.abs(cust.balance).toFixed(2);
    if (custBalEl) {
      if (cust.balance < 0) {
        custBalEl.textContent = `المديونية الحالية: ${absDebt} ج.م (آجل غير مسدد)`;
        custBalEl.className = 'text-xs font-bold text-rose-600 dark:text-rose-400 mt-1';
      } else if (cust.balance > 0) {
        custBalEl.textContent = `رصيد دائن: ${cust.balance.toFixed(2)} ج.م`;
        custBalEl.className = 'text-xs font-bold text-emerald-600 dark:text-emerald-400 mt-1';
      } else {
        custBalEl.textContent = 'الحساب خالص (0.00 ج.م)';
        custBalEl.className = 'text-xs font-bold text-gray-500 mt-1';
      }
    }

    if (type === 'receipt') {
      titleEl.innerHTML = `<span class="text-emerald-600">📥 سند قبض من عميل [مقبوض]</span>`;
      subtitleEl.textContent = 'استلام دفعة نقدية وتوريدها للخزينة وتخفيض مديونية العميل';
      if (amountInp) amountInp.value = cust.balance < 0 ? Math.abs(cust.balance) : '';
      if (noteInp) noteInp.value = `دفعة من الحساب الآجل - عميل #${cust.code || cust.id}`;
    } else {
      titleEl.innerHTML = `<span class="text-rose-600">📤 سند صرف / دفع لعميل [دفع]</span>`;
      subtitleEl.textContent = 'صرف مبلغ نقدي من الدرج للعميل أو رد دفعة';
      if (amountInp) amountInp.value = '';
      if (noteInp) noteInp.value = `صرف نقدي من الدرج - عميل #${cust.code || cust.id}`;
    }

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    if (window.lucide) window.lucide.createIcons({ root: document.getElementById('view-customers') || document.body });

    setTimeout(() => amountInp?.focus(), 150);
  }

  closeVoucherModal() {
    const modal = document.getElementById('cust-voucher-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
    this.selectedCustomer = null;
  }

  async submitVoucher() {
    if (this.isSubmitting) return;
    if (!this.selectedCustomer) return;

    this.isSubmitting = true;
    const amountInp = document.getElementById('cust-modal-voucher-amount') || document.getElementById('cust-voucher-amount');
    const noteInp = document.getElementById('cust-modal-voucher-note') || document.getElementById('cust-voucher-note');
    const pmInp = document.getElementById('cust-modal-voucher-method') || document.getElementById('cust-voucher-method');

    const amount = parseFloat(amountInp?.value || 0);
    const note = noteInp?.value.trim() || '';
    const paymentMethod = pmInp?.value || 'كاش من الدرج';

    if (isNaN(amount) || amount <= 0) {
      window.app?.showToast('يرجى إدخال مبلغ صحيح أكبر من الصفر', 'error');
      amountInp?.focus();
      return;
    }

    const action = this.currentReceiptModalType === 'receipt' ? 'customer_receipt' : 'pay_customer';
    const payload = {
      customer_id: this.selectedCustomer.id,
      customer_code: this.selectedCustomer.code,
      customer_name: this.selectedCustomer.name,
      amount: amount,
      payment_method: paymentMethod,
      note: note,
      date: new Date().toISOString().slice(0, 19).replace('T', ' ')
    };

    window.app?.showLoading(true, 'جاري تسجيل السند وتحديث الحساب...');

    try {
      const res = await window.api.post(action, payload);
      window.app?.showLoading(false);

      if (res && res.success) {
        window.app?.showToast(res.message || 'تم حفظ السند بنجاح!', 'success');
        this.closeVoucherModal();
        this.loadCustomers(true);
      } else {
        window.app?.showToast(res.error || 'تعذر تسجيل السند!', 'error');
      }
    } catch (err) {
      window.app?.showLoading(false);
      window.app?.showToast('خطأ في الاتصال بالسيرفر: ' + err.message, 'error');
    } finally {
      this.isSubmitting = false;
    }
  }

  async openLedgerModal(customerCode) {
    this.openLedgerSubView(customerCode);
    return;
    const cust = this.customers.find(c => String(c.code) === String(customerCode) || String(c.id) === String(customerCode));
    if (!cust) return;

    this.selectedCustomer = cust;
    const modal = document.getElementById('cust-ledger-modal');
    if (!modal) return;

    const titleEl = document.getElementById('cust-modal-ledger-title') || document.getElementById('cust-ledger-title');
    const balEl = document.getElementById('cust-modal-ledger-balance') || document.getElementById('cust-ledger-balance');
    const tbody = document.getElementById('cust-modal-ledger-table-body') || document.getElementById('cust-ledger-table-body');
    const mobileCards = document.getElementById('cust-modal-ledger-mobile-cards');

    if (titleEl) titleEl.textContent = `كشف حساب: ${cust.name} (كود #${cust.code || cust.id})`;
    if (balEl) balEl.textContent = `الرصيد الحالي: ${Math.abs(cust.balance).toLocaleString('ar-EG', { minimumFractionDigits: 2 })} ج.م ${cust.balance < 0 ? '(مديونية مطلوبة)' : cust.balance > 0 ? '(رصيد دائن)' : '(خالص)'}`;

    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="5" class="py-8 text-center text-gray-400">جاري تحميل حركات الحساب...</td></tr>`;
    }
    if (mobileCards) {
      mobileCards.innerHTML = `<div class="py-8 text-center text-gray-400 text-xs">جاري تحميل حركات الحساب...</div>`;
    }

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    if (window.lucide) window.lucide.createIcons({ root: document.getElementById('view-customers') || document.body });

    try {
      const res = await window.api.get('get_customer_ledger', { customer_id: cust.id, customer_name: cust.name });
      if (res && res.success && Array.isArray(res.transactions)) {
        if (res.transactions.length === 0) {
          if (tbody) tbody.innerHTML = `<tr><td colspan="5" class="py-8 text-center text-gray-400">لا توجد حركات مسجلة حتى الآن</td></tr>`;
          if (mobileCards) mobileCards.innerHTML = `<div class="py-8 text-center text-gray-400 text-xs">لا توجد حركات مسجلة حتى الآن</div>`;
          return;
        }

        if (tbody) {
          tbody.innerHTML = res.transactions.map(t => `
            <tr class="border-b border-gray-100 dark:border-gray-800 text-xs hover:bg-gray-50 dark:hover:bg-gray-800/40">
              <td class="py-2.5 px-3 font-mono text-gray-500">${t.date || t.created_at}</td>
              <td class="py-2.5 px-3 font-bold text-gray-800 dark:text-gray-200">${t.type}</td>
              <td class="py-2.5 px-3 text-gray-600 dark:text-gray-400">${t.note || '-'}</td>
              <td class="py-2.5 px-3 font-mono font-bold ${t.type.includes('قبض') ? 'text-emerald-600' : 'text-rose-600'}">${parseFloat(t.amount || 0).toFixed(2)} ج.م</td>
              <td class="py-2.5 px-3 text-gray-500">${t.payment_method || 'كاش'}</td>
            </tr>
          `).join('');
        }

        if (mobileCards) {
          mobileCards.innerHTML = res.transactions.map(t => {
            const isReceipt = t.type.includes('قبض');
            const colorClass = isReceipt ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400';
            const badgeClass = isReceipt ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200' : 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200';
            return `
              <div class="p-3 rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs flex flex-col gap-1.5 shadow-2xs">
                <div class="flex items-center justify-between">
                  <span class="px-2 py-0.5 rounded-lg text-[10px] font-bold border ${badgeClass}">${t.type}</span>
                  <span class="font-mono text-gray-400 text-[10px]">${t.date || t.created_at || ''}</span>
                </div>
                <div class="flex items-center justify-between font-bold pt-1">
                  <span class="text-gray-700 dark:text-gray-300">${t.note || t.reference || '-'}</span>
                  <span class="font-mono ${colorClass} text-sm" dir="ltr">${isReceipt ? '+' : '-'}${parseFloat(t.amount || 0).toFixed(2)} ج.م</span>
                </div>
                <div class="text-[10px] text-gray-400">${t.payment_method || 'كاش'}</div>
              </div>
            `;
          }).join('');
        }
      }
    } catch (err) {
      if (tbody) tbody.innerHTML = `<tr><td colspan="5" class="py-4 text-center text-rose-500">تعذر جلب الحركات: ${err.message}</td></tr>`;
      if (mobileCards) mobileCards.innerHTML = `<div class="py-4 text-center text-rose-500 text-xs">تعذر جلب الحركات: ${err.message}</div>`;
    }
  }

  closeLedgerModal() {
    const modal = document.getElementById('cust-ledger-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
  }

  updateCustomerDropdowns() {
    const selects = document.querySelectorAll('.customer-selector-dropdown');
    selects.forEach(sel => {
      const currentVal = sel.value;
      sel.innerHTML = '<option value="">-- اختر العميل (اختياري) --</option>' + 
        this.customers.map(c => `
          <option value="${c.id}" data-phone="${c.phone}" data-address="${c.address}">
            #${c.code || c.id} - ${c.name} ${c.balance < 0 ? `(دين: ${Math.abs(c.balance).toFixed(0)} ج.م)` : ''}
          </option>
        `).join('');
      if (currentVal) sel.value = currentVal;
    });
  }
}

window.customersController = new CustomersController();
