/**
 * Syrian Home POS - Expenses & Supplier Payouts Controller (المصروفات ودفعات الموردين)
 * Handles recording operational expenses and supplier debt settlements.
 */

class ExpensesController {
  constructor() {
    this.suppliers = [];
    this.expenseCategories = ['نثريات', 'إيجار', 'كهرباء ومياه', 'صيانة ومعدات', 'أكياس ومطبوعات', 'وجبات وبوفيه', 'نقل وشحن', 'رواتب وعمالة'];
    this.currentMode = 'purchase'; // 'purchase', 'expense', 'supplier', 'history'
  }

  async init() {
    try {
      const meta = await window.api.getPosMeta();
      if (meta && meta.success) {
        if (Array.isArray(meta.suppliers)) this.suppliers = meta.suppliers;
        if (Array.isArray(meta.expense_categories) && meta.expense_categories.length > 0) {
          this.expenseCategories = meta.expense_categories;
        }
        this.renderSuppliersDropdown();
        this.renderExpenseCategoriesDropdown();
      }
      this.setMode(this.currentMode || 'purchase');
    } catch (e) {
      console.warn('Could not load pos meta:', e);
    }
  }

  setMode(mode) {
    this.currentMode = mode;
    const purchForm = document.getElementById('purchase-invoice-form');
    const expForm = document.getElementById('expense-general-form');
    const supForm = document.getElementById('expense-supplier-form');
    const historyBox = document.getElementById('purchases-history-container');

    document.querySelectorAll('.expense-mode-btn').forEach(btn => {
      if (btn.getAttribute('data-mode') === mode) {
        btn.className = 'expense-mode-btn flex-1 py-2.5 px-3 rounded-xl text-xs font-bold bg-indigo-600 text-white shadow-sm flex items-center justify-center gap-1.5 transition';
      } else {
        btn.className = 'expense-mode-btn flex-1 py-2.5 px-3 rounded-xl text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 flex items-center justify-center gap-1.5 transition';
      }
    });

    purchForm?.classList.add('hidden');
    expForm?.classList.add('hidden');
    supForm?.classList.add('hidden');
    historyBox?.classList.add('hidden');

    if (mode === 'purchase') {
      purchForm?.classList.remove('hidden');
      window.purchasesController?.init();
    } else if (mode === 'expense') {
      expForm?.classList.remove('hidden');
    } else if (mode === 'supplier') {
      supForm?.classList.remove('hidden');
    } else if (mode === 'history') {
      historyBox?.classList.remove('hidden');
      window.purchasesController?.loadPurchasesHistory();
    }

    if (window.lucide) window.lucide.createIcons();
  }

  renderExpenseCategoriesDropdown() {
    const select = document.getElementById('exp-category-select');
    if (!select) return;

    select.innerHTML = this.expenseCategories.map(cat => `
      <option value="${cat}">${cat}</option>
    `).join('');
  }

  renderSuppliersDropdown() {
    const select = document.getElementById('exp-supplier-select');
    if (!select) return;

    if (this.suppliers.length === 0) {
      select.innerHTML = `<option value="">-- لا يوجد موردين مسجلين --</option>`;
      return;
    }

    select.innerHTML = `
      <option value="">-- اختر المورد --</option>
      ${this.suppliers.map(s => `
        <option value="${s.id}" data-balance="${s.balance || 0}">${s.name} (الرصيد: ${parseFloat(s.balance || 0).toFixed(2)} ج.م)</option>
      `).join('')}
    `;
  }

  onSupplierSelected(supplierId) {
    const s = this.suppliers.find(item => item.id == supplierId);
    const balanceEl = document.getElementById('supplier-balance-badge');
    if (s && balanceEl) {
      balanceEl.textContent = `الرصيد المتبقي له: ${parseFloat(s.balance || 0).toFixed(2)} ج.م`;
      balanceEl.classList.remove('hidden');
    } else if (balanceEl) {
      balanceEl.classList.add('hidden');
    }
  }

  async submitGeneralExpense() {
    const category = document.getElementById('exp-category-select')?.value || 'نثريات';
    const amount = parseFloat(document.getElementById('exp-amount-input')?.value || 0);
    const note = document.getElementById('exp-note-input')?.value.trim() || '';
    const paymentMethod = document.getElementById('exp-payment-method')?.value || 'كاش';

    if (amount <= 0) {
      window.app?.showToast('يرجى إدخال مبلغ صحيح أكبر من الصفر', 'error');
      return;
    }

    const payload = {
      category: category,
      amount: amount,
      note: note,
      payment_method: paymentMethod,
      date: new Date().toISOString().slice(0, 19).replace('T', ' ')
    };

    try {
      window.app?.showLoading(true, 'جاري تسجيل المصروف في الخزينة...');
      const res = await window.api.recordExpense(payload);
      window.app?.showLoading(false);

      if (res && res.success) {
        window.posScanner?.playSuccessBeep();
        window.app?.showToast(res.message || 'تم تسجيل المصروف بنجاح ✅', 'success');

        // Clear input
        document.getElementById('exp-amount-input').value = '';
        document.getElementById('exp-note-input').value = '';
      } else {
        throw new Error(res.error || 'فشل تسجيل المصروف');
      }
    } catch (err) {
      window.app?.showLoading(false);
      window.app?.showToast(`خطأ في تسجيل المصروف: ${err.message}`, 'error');
    }
  }

  async submitSupplierPayment() {
    const select = document.getElementById('exp-supplier-select');
    const supplierId = select ? parseInt(select.value, 10) : 0;
    const supplierName = select && select.selectedIndex > -1 ? select.options[select.selectedIndex].text.split('(')[0].trim() : '';
    const amount = parseFloat(document.getElementById('sup-amount-input')?.value || 0);
    const note = document.getElementById('sup-note-input')?.value.trim() || '';
    const paymentMethod = document.getElementById('sup-payment-method')?.value || 'كاش';

    if (amount <= 0) {
      window.app?.showToast('يرجى إدخال مبلغ سداد صحيح أكبر من الصفر', 'error');
      return;
    }

    const payload = {
      supplier_id: supplierId,
      supplier_name: supplierName,
      amount: amount,
      note: note,
      payment_method: paymentMethod,
      date: new Date().toISOString().slice(0, 19).replace('T', ' ')
    };

    try {
      window.app?.showLoading(true, 'جاري سداد دفعة المورد وتحديث رصيد حسابه...');
      const res = await window.api.paySupplier(payload);
      window.app?.showLoading(false);

      if (res && res.success) {
        window.posScanner?.playSuccessBeep();
        window.app?.showToast(res.message || 'تم سداد الدفعة وتحديث رصيد المورد بنجاح ✅', 'success');

        // Refresh metadata in background to get new balance
        this.init();

        // Clear input
        document.getElementById('sup-amount-input').value = '';
        document.getElementById('sup-note-input').value = '';
      } else {
        throw new Error(res.error || 'فشل سداد الدفعة');
      }
    } catch (err) {
      window.app?.showLoading(false);
      window.app?.showToast(`خطأ في السداد: ${err.message}`, 'error');
    }
  }
}

window.expensesController = new ExpensesController();
