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

          // الحساب المحاسبي لدريم سوفت:
          // إذا كان remind > 0 فالمديونية المطلوبة من العميل هي remind
          let finalBal = 0.00;
          if (remind > 0) {
            finalBal = -remind; // سالب = مديونية على العميل
          } else if (rawBal < 0 && remind === 0 && (c.notes && c.notes.includes('حساب آجل'))) {
            finalBal = rawBal;
          } else if (rawBal > 0) {
            finalBal = rawBal; // موجب = رصيد دائن لصالح العميل
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
            <button onclick="window.customersController.openVoucherModal(${c.code || c.id}, 'receipt')" class="py-2 px-1 rounded-xl bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 text-xs font-bold transition flex items-center justify-center gap-1 shadow-2xs">
              <i data-lucide="arrow-down-left" class="w-3.5 h-3.5"></i>
              <span>قبض [مقبوض]</span>
            </button>
            <button onclick="window.customersController.openVoucherModal(${c.code || c.id}, 'pay')" class="py-2 px-1 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/60 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 text-xs font-bold transition flex items-center justify-center gap-1 shadow-2xs">
              <i data-lucide="arrow-up-right" class="w-3.5 h-3.5"></i>
              <span>صرف [دفع]</span>
            </button>
            <button onclick="window.customersController.openLedgerModal(${c.code || c.id})" class="py-2 px-1 rounded-xl bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 text-xs font-bold transition flex items-center justify-center gap-1 shadow-2xs">
              <i data-lucide="file-text" class="w-3.5 h-3.5"></i>
              <span>كشف حساب</span>
            </button>
          </div>

        </div>
      `;
    }).join('');

    if (window.lucide) window.lucide.createIcons({ root: document.getElementById('view-customers') || document.body });
  }

  openVoucherModal(customerCode, type = 'receipt') {
    const cust = this.customers.find(c => (c.code === customerCode || c.id === customerCode));
    if (!cust) return;

    this.selectedCustomer = cust;
    this.currentReceiptModalType = type;

    const modal = document.getElementById('cust-voucher-modal');
    if (!modal) return;

    const titleEl = document.getElementById('cust-voucher-modal-title');
    const subtitleEl = document.getElementById('cust-voucher-modal-subtitle');
    const custNameEl = document.getElementById('cust-voucher-name');
    const custBalEl = document.getElementById('cust-voucher-balance');
    const amountInp = document.getElementById('cust-voucher-amount');
    const noteInp = document.getElementById('cust-voucher-note');

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
    if (!this.selectedCustomer) return;

    const amountInp = document.getElementById('cust-voucher-amount');
    const noteInp = document.getElementById('cust-voucher-note');
    const pmInp = document.getElementById('cust-voucher-method');

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
    }
  }

  async openLedgerModal(customerCode) {
    const cust = this.customers.find(c => (c.code === customerCode || c.id === customerCode));
    if (!cust) return;

    this.selectedCustomer = cust;
    const modal = document.getElementById('cust-ledger-modal');
    if (!modal) return;

    document.getElementById('cust-ledger-title').textContent = `كشف حساب: ${cust.name} (كود #${cust.code || cust.id})`;
    document.getElementById('cust-ledger-balance').textContent = `الرصيد الحالي: ${Math.abs(cust.balance).toLocaleString('ar-EG', { minimumFractionDigits: 2 })} ج.م ${cust.balance < 0 ? '(مديونية مطلوبة)' : cust.balance > 0 ? '(رصيد دائن)' : '(خالص)'}`;

    const tbody = document.getElementById('cust-ledger-table-body');
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="5" class="py-8 text-center text-gray-400">جاري تحميل حركات الحساب...</td></tr>`;
    }

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    if (window.lucide) window.lucide.createIcons({ root: document.getElementById('view-customers') || document.body });

    try {
      const res = await window.api.get('get_customer_ledger', { customer_id: cust.id, customer_name: cust.name });
      if (res && res.success && Array.isArray(res.transactions)) {
        if (res.transactions.length === 0) {
          tbody.innerHTML = `<tr><td colspan="5" class="py-8 text-center text-gray-400">لا توجد حركات مسجلة حتى الآن</td></tr>`;
          return;
        }

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
    } catch (err) {
      if (tbody) tbody.innerHTML = `<tr><td colspan="5" class="py-4 text-center text-rose-500">تعذر جلب الحركات: ${err.message}</td></tr>`;
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
