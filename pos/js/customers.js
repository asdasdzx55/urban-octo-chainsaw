/**
 * Syrian Home POS - Customers & Credit Accounts Controller (v2.6.0)
 * منظومة إدارة حسابات العملاء، الآجل، المديونيات، سندات القبض والدفع، وكشوف الحسابات
 */
class CustomersController {
  constructor() {
    this.customers = [];
    this.searchQuery = '';
    this.filter = 'debt'; // 'debt' (المدينين فقط افتراضياً), 'all', 'credit', 'zero'
    this.currentSubView = 'list'; // 'list', 'form', 'voucher', 'ledger'
    this.activeCustomer = null;
    this.voucherType = 'receipt'; // 'receipt' (مقبوض), 'payment' (دفع)
    this.recentVouchers = [];
  }

  init() {
    this.setSubView('list');
    this.loadCustomers();
    this.loadRecentVouchers();
  }

  setSubView(viewName, data = null) {
    this.currentSubView = viewName;

    // Toggle subtab buttons
    document.querySelectorAll('.cust-subtab-btn').forEach(btn => {
      const target = btn.getAttribute('data-subview');
      if (target === viewName) {
        btn.className = 'cust-subtab-btn px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 text-white shadow-md flex items-center gap-1.5 transition';
      } else {
        btn.className = 'cust-subtab-btn px-4 py-2 rounded-xl text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-1.5 transition cursor-pointer';
      }
    });

    const views = {
      list: document.getElementById('cust-subview-list'),
      form: document.getElementById('cust-subview-form'),
      voucher: document.getElementById('cust-subview-voucher'),
      ledger: document.getElementById('cust-subview-ledger')
    };

    Object.keys(views).forEach(k => {
      if (views[k]) {
        if (k === viewName) views[k].classList.remove('hidden');
        else views[k].classList.add('hidden');
      }
    });

    if (viewName === 'form') {
      if (data) this.populateEditForm(data);
      else this.resetAddForm();
    } else if (viewName === 'voucher') {
      this.setupVoucherForm(data);
    } else if (viewName === 'ledger') {
      const custId = data?.id || data || (this.customers[0]?.id);
      this.setupLedgerView(custId);
    } else if (viewName === 'list') {
      this.renderKPIs();
      this.renderCustomersList();
    }

    const parent = document.getElementById('view-customers');
    if (parent) parent.scrollTop = 0;
    if (window.lucide) window.lucide.createIcons();
  }

  async loadCustomers() {
    const listContainer = document.getElementById('customers-grid');
    try {
      if (!this.customers.length) {
        window.app?.showLoading(true, 'جاري تحميل بيانات العملاء والآجل...');
      }
      const res = await window.api.get('get_customers', { limit: 500 });
      window.app?.showLoading(false);

      if (res && res.success && Array.isArray(res.customers)) {
        this.customers = res.customers.map(c => {
          const bal = parseFloat(c.balance || 0);
          return {
            id: parseInt(c.id || c.client_code || 0),
            code: parseInt(c.client_code || c.id || 0),
            name: c.name || 'عميل بدون اسم',
            phone: c.phone || '',
            phone2: c.phone2 || '',
            address: c.address || '',
            notes: c.notes || '',
            balance: bal,
            total_orders: parseInt(c.total_orders || 0),
            total_spent: parseFloat(c.total_spent || 0)
          };
        });

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
      // Fallback from cache
      try {
        const saved = JSON.parse(localStorage.getItem('syrian_home_customers') || '[]');
        if (saved && saved.length > 0) {
          this.customers = saved;
          this.renderKPIs();
          this.renderCustomersList();
          this.updateCustomerDropdowns();
          return;
        }
      } catch (e) {}

      if (listContainer) {
        listContainer.innerHTML = `
          <div class="col-span-full p-8 text-center bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900 rounded-3xl">
            <i data-lucide="alert-circle" class="w-8 h-8 text-rose-500 mx-auto mb-2"></i>
            <p class="text-xs font-bold text-rose-600 dark:text-rose-400">تعذر جلب بيانات العملاء: ${err.message}</p>
            <button onclick="window.customersController.loadCustomers()" class="mt-3 px-4 py-1.5 rounded-xl bg-rose-600 text-white text-xs font-bold">إعادة المحاولة</button>
          </div>
        `;
        if (window.lucide) window.lucide.createIcons();
      }
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
    if (this.filter === 'debt') {
      filtered = filtered.filter(c => c.balance < 0);
    } else if (this.filter === 'credit') {
      filtered = filtered.filter(c => c.balance > 0);
    } else if (this.filter === 'zero') {
      filtered = filtered.filter(c => c.balance === 0);
    }

    // Filter by Search Query (ID/Code, Name, or Phone)
    const q = (this.searchQuery || '').trim().toLowerCase();
    if (q) {
      filtered = filtered.filter(c => 
        String(c.code).includes(q) ||
        String(c.id).includes(q) ||
        (c.name && c.name.toLowerCase().includes(q)) ||
        (c.phone && c.phone.includes(q)) ||
        (c.notes && c.notes.toLowerCase().includes(q))
      );
    }

    // Sort: Largest debt first
    filtered.sort((a, b) => a.balance - b.balance);

    if (filtered.length === 0) {
      grid.innerHTML = `
        <div class="col-span-full py-16 text-center text-gray-400">
          <i data-lucide="users" class="w-12 h-12 mx-auto mb-2 opacity-40 text-indigo-400"></i>
          <p class="text-xs font-bold text-gray-600 dark:text-gray-300">لم يتم العثور على أي عميل مطابق للبحث أو الفلتر</p>
          <button onclick="window.customersController.filter = 'all'; window.customersController.searchQuery = ''; document.getElementById('cust-search-input').value = ''; window.customersController.renderCustomersList();" class="mt-3 px-4 py-2 rounded-xl bg-gray-100 dark:bg-gray-700 text-xs font-bold text-indigo-600 hover:bg-gray-200 transition">
            عرض كافة العملاء
          </button>
        </div>
      `;
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    grid.innerHTML = filtered.map(c => {
      const isDebt = c.balance < 0;
      const isCredit = c.balance > 0;
      const absBal = Math.abs(c.balance).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

      return `
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border ${isDebt ? 'border-rose-200 dark:border-rose-900/60 shadow-xs' : 'border-gray-200 dark:border-gray-700 shadow-2xs'} flex flex-col justify-between gap-3 transition hover:shadow-md">
          
          <!-- Top Row: Code Badge & Debt Badge -->
          <div class="flex items-start justify-between gap-2">
            <div class="flex items-center gap-1.5 flex-wrap">
              <span class="px-2.5 py-1 rounded-xl bg-indigo-50 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 font-mono font-black text-xs border border-indigo-200/80 dark:border-indigo-800">
                كود #${c.code || c.id}
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
                  <span>مديونية:</span> <span>${absBal} ج.م</span>
                </span>
              ` : isCredit ? `
                <span class="px-2.5 py-1 rounded-xl bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 font-mono font-black text-xs border border-emerald-200 dark:border-emerald-800 flex items-center gap-1">
                  <span>له رصيد:</span> <span>+${absBal} ج.م</span>
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
            ${c.notes ? `<p class="text-[10px] text-gray-400 mt-0.5">${c.notes}</p>` : ''}
          </div>

          <!-- Action Buttons Row -->
          <div class="pt-3 border-t border-gray-100 dark:border-gray-700/80 grid grid-cols-3 gap-1.5">
            <button type="button" onclick="window.customersController.openVoucher('receipt', ${c.id})" class="py-2 px-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition flex items-center justify-center gap-1 cursor-pointer" title="قبض دفعة نقدية من العميل">
              <i data-lucide="arrow-down-left" class="w-3.5 h-3.5"></i>
              <span>📥 مقبوض</span>
            </button>

            <button type="button" onclick="window.customersController.openVoucher('payment', ${c.id})" class="py-2 px-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-xs transition flex items-center justify-center gap-1 cursor-pointer" title="دفع أو رد نقدية للعميل">
              <i data-lucide="arrow-up-right" class="w-3.5 h-3.5"></i>
              <span>📤 دفع</span>
            </button>

            <button type="button" onclick="window.customersController.setSubView('ledger', { id: ${c.id} })" class="py-2 px-2 rounded-xl bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 font-bold text-xs transition flex items-center justify-center gap-1 cursor-pointer" title="كشف الحساب التفصيلي">
              <i data-lucide="receipt-text" class="w-3.5 h-3.5"></i>
              <span>كشف حساب</span>
            </button>
          </div>

        </div>
      `;
    }).join('');

    if (window.lucide) window.lucide.createIcons();
  }

  openVoucher(type, customerId) {
    this.voucherType = type; // 'receipt' or 'payment'
    const cust = this.customers.find(c => c.id === customerId);
    this.setSubView('voucher', cust);
  }

  setupVoucherForm(customer = null) {
    const isReceipt = this.voucherType === 'receipt';
    const titleEl = document.getElementById('cust-voucher-title');
    const typeBadgeEl = document.getElementById('cust-voucher-type-badge');
    const submitBtn = document.getElementById('cust-voucher-submit-btn');

    if (titleEl) {
      titleEl.textContent = isReceipt ? '📥 تسجيل سند قبض / مقبوض من عميل' : '📤 تسجيل سند صرف / دفع نقدية لعميل';
    }
    if (typeBadgeEl) {
      typeBadgeEl.textContent = isReceipt ? 'مقبوض (يدخل درج الكاشير)' : 'مدفوع (يخرج من درج الكاشير)';
      typeBadgeEl.className = isReceipt 
        ? 'px-2.5 py-1 rounded-xl text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' 
        : 'px-2.5 py-1 rounded-xl text-xs font-bold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300';
    }
    if (submitBtn) {
      submitBtn.className = isReceipt 
        ? 'flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md transition flex items-center justify-center gap-1.5 cursor-pointer'
        : 'flex-1 py-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-md transition flex items-center justify-center gap-1.5 cursor-pointer';
      submitBtn.innerHTML = isReceipt 
        ? '<i data-lucide="check" class="w-4 h-4"></i><span>تأكيد استلام المبلغ (قبض)</span>' 
        : '<i data-lucide="check" class="w-4 h-4"></i><span>تأكيد صرف المبلغ (دفع)</span>';
    }

    const select = document.getElementById('cust-voucher-customer-id');
    if (select && customer) {
      select.value = customer.id;
      this.onVoucherCustomerChange();
    }

    const amtInput = document.getElementById('cust-voucher-amount');
    if (amtInput) amtInput.value = '';
    const noteInput = document.getElementById('cust-voucher-note');
    if (noteInput) noteInput.value = isReceipt ? 'سداد دفعة من المديونية' : 'رد نقدية للعميل';

    if (window.lucide) window.lucide.createIcons();
  }

  onVoucherCustomerChange() {
    const select = document.getElementById('cust-voucher-customer-id');
    const preview = document.getElementById('cust-voucher-preview');
    if (!select || !preview) return;

    const id = parseInt(select.value);
    const c = this.customers.find(x => x.id === id);
    if (!c) {
      preview.innerHTML = '';
      return;
    }

    const isDebt = c.balance < 0;
    const absBal = Math.abs(c.balance).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    preview.innerHTML = `
      <div class="flex items-center justify-between p-3 rounded-xl bg-gray-50 dark:bg-gray-700/60 border border-gray-100 dark:border-gray-700 text-xs">
        <div>
          <span class="font-bold text-gray-900 dark:text-white">${c.name}</span>
          <span class="text-gray-400 font-mono text-[10px] me-1">(كود #${c.code || c.id})</span>
        </div>
        <div class="font-mono font-black ${isDebt ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}">
          ${isDebt ? `المديونية الحالية: ${absBal} ج.م` : `الرصيد الدائن: ${absBal} ج.م`}
        </div>
      </div>
    `;
  }

  setFullRemainingVoucherAmount() {
    const select = document.getElementById('cust-voucher-customer-id');
    const amtInput = document.getElementById('cust-voucher-amount');
    if (!select || !amtInput) return;

    const id = parseInt(select.value);
    const c = this.customers.find(x => x.id === id);
    if (c && c.balance < 0) {
      amtInput.value = Math.abs(c.balance);
    }
  }

  async saveVoucher() {
    const select = document.getElementById('cust-voucher-customer-id');
    const amtInput = document.getElementById('cust-voucher-amount');
    const noteInput = document.getElementById('cust-voucher-note');
    const methodSelect = document.getElementById('cust-voucher-method');

    const customerId = parseInt(select?.value || 0);
    const amount = parseFloat(amtInput?.value || 0);
    const note = (noteInput?.value || '').trim();
    const paymentMethod = methodSelect?.value || 'كاش من الدرج';

    if (!customerId) {
      window.app?.showToast('يرجى اختيار العميل أولاً!', 'error');
      return;
    }
    if (amount <= 0) {
      window.app?.showToast('يرجى كتابة مبلغ صحيح أكبر من الصفر!', 'error');
      return;
    }

    const customer = this.customers.find(c => c.id === customerId);
    const isReceipt = this.voucherType === 'receipt';

    try {
      window.app?.showLoading(true, isReceipt ? 'جاري تسجيل سند القبض...' : 'جاري تسجيل سند الصرف...');
      
      const payload = {
        action: isReceipt ? 'customer_receipt' : 'pay_customer',
        customer_id: customerId,
        customer_name: customer?.name || '',
        amount: amount,
        note: note,
        payment_method: paymentMethod,
        date: new Date().toISOString().slice(0, 19).replace('T', ' ')
      };

      const res = await window.api.post(payload.action, payload);
      window.app?.showLoading(false);

      if (res && res.success) {
        // Adjust local balance immediately
        if (customer) {
          if (isReceipt) {
            customer.balance += amount; // Reduces negative debt
          } else {
            customer.balance -= amount; // Increases debt / reduces credit
          }
        }
        window.app?.showToast(`✅ تم حفظ السند بنجاح بمبلغ ${amount} ج.م`, 'success');
        this.setSubView('list');
      } else {
        throw new Error(res?.error || 'فشل حفظ السند على السيرفر');
      }
    } catch (err) {
      window.app?.showLoading(false);
      window.app?.showToast(`⚠️ تم الحفظ محلياً: ${err.message}`, 'warning');
      if (customer) {
        if (isReceipt) customer.balance += amount;
        else customer.balance -= amount;
      }
      this.setSubView('list');
    }
  }

  updateCustomerDropdowns() {
    const select = document.getElementById('cust-voucher-customer-id');
    if (!select) return;

    select.innerHTML = `
      <option value="">-- اختر العميل بالاسم أو رقم الكود --</option>
      ${this.customers.map(c => `
        <option value="${c.id}">
          كود #${c.code || c.id} - ${c.name} ${c.balance < 0 ? `(مديونية: ${Math.abs(c.balance).toFixed(2)})` : ''}
        </option>
      `).join('')}
    `;
  }

  async setupLedgerView(customerId) {
    const cust = this.customers.find(c => c.id === customerId);
    const titleEl = document.getElementById('cust-ledger-title');
    const balEl = document.getElementById('cust-ledger-balance');
    const tableBody = document.getElementById('cust-ledger-table-body');

    if (titleEl && cust) {
      titleEl.innerHTML = `كشف حساب العميل: <b>${cust.name}</b> (كود #${cust.code || cust.id})`;
    }
    if (balEl && cust) {
      const isDebt = cust.balance < 0;
      balEl.textContent = `${Math.abs(cust.balance).toFixed(2)} ج.م (${isDebt ? 'مديونية آجل مطلوبة' : 'رصيد'})`;
      balEl.className = isDebt ? 'text-rose-600 font-bold font-mono' : 'text-emerald-600 font-bold font-mono';
    }

    if (tableBody) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="5" class="py-8 text-center text-gray-400">
            <i data-lucide="loader" class="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-500"></i>
            <span>جاري استدعاء سجل فواتير وسندات العميل...</span>
          </td>
        </tr>
      `;
      if (window.lucide) window.lucide.createIcons();

      try {
        const res = await window.api.get('get_customer_ledger', { customer_id: customerId });
        if (res && res.success && Array.isArray(res.transactions) && res.transactions.length > 0) {
          tableBody.innerHTML = res.transactions.map(t => `
            <tr class="border-b border-gray-100 dark:border-gray-700/60 hover:bg-gray-50/50 dark:hover:bg-gray-700/30">
              <td class="py-2.5 px-3 font-mono text-[11px] text-gray-500">${t.date || '-'}</td>
              <td class="py-2.5 px-3 font-bold ${t.type.includes('قبض') ? 'text-emerald-600' : 'text-rose-600'}">${t.type}</td>
              <td class="py-2.5 px-3 font-mono font-bold text-xs">${parseFloat(t.amount || 0).toFixed(2)} ج.م</td>
              <td class="py-2.5 px-3 text-gray-500">${t.payment_method || 'كاش'}</td>
              <td class="py-2.5 px-3 text-gray-400 text-[11px]">${t.note || '-'}</td>
            </tr>
          `).join('');
        } else {
          tableBody.innerHTML = `
            <tr>
              <td colspan="5" class="py-8 text-center text-gray-400">
                <p class="text-xs">لا توجد حركات مسجلة لهذا العميل حتى الآن. الرصيد الافتتاحي هو: <b>${cust ? Math.abs(cust.balance).toFixed(2) : 0} ج.م</b></p>
              </td>
            </tr>
          `;
        }
        if (window.lucide) window.lucide.createIcons();
      } catch (e) {
        tableBody.innerHTML = `
          <tr>
            <td colspan="5" class="py-6 text-center text-gray-400">
              <p class="text-xs">الرصيد الحالي المسجل في دريم سوفت: <b>${cust ? Math.abs(cust.balance).toFixed(2) : 0} ج.م</b></p>
            </td>
          </tr>
        `;
      }
    }
  }

  loadRecentVouchers() {
    // Optional recent vouchers list
  }
}

// Global instance
window.customersController = new CustomersController();
