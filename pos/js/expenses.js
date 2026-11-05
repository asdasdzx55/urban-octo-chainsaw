/**
 * Syrian Home POS - Expenses & Supplier Payouts Controller (المصروفات ودفعات الموردين)
 * Handles recording operational expenses and supplier debt settlements.
 */

class ExpensesController {
  constructor() {
    this.suppliers = [];
    this.expenseCategories = ['نثريات', 'إيجار', 'فواتير (كهرباء/مياه)', 'صيانة', 'رواتب عاملين', 'سلف عاملين', 'سداد موردين', 'مشتريات بضاعة', 'مسحوبات الإدارة', 'أخرى', 'تيست'];
    this.currentMode = 'purchase'; // 'purchase', 'expense', 'supplier', 'history'
  }

  async init(targetMode = null) {
    if (targetMode) this.currentMode = targetMode;
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
      this.setMode(this.currentMode || 'purchase');
    }
  }

  setMode(mode) {
    this.currentMode = mode;
    const purchForm = document.getElementById('purchase-invoice-form');
    const expForm = document.getElementById('expense-general-form');
    const supForm = document.getElementById('expense-supplier-form');
    const historyBox = document.getElementById('purchases-history-container');
    const reportBox = document.getElementById('suppliers-report-container');
    const ledgerBox = document.getElementById('supplier-ledger-container');

    document.querySelectorAll('.expense-mode-btn').forEach(btn => {
      if (btn.getAttribute('data-mode') === mode) {
        btn.className = 'expense-mode-btn py-2 px-2 rounded-xl text-xs font-bold bg-indigo-600 text-white shadow-sm flex items-center justify-center gap-1.5 transition';
      } else {
        btn.className = 'expense-mode-btn py-2 px-2 rounded-xl text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 flex items-center justify-center gap-1.5 transition';
      }
    });

    purchForm?.classList.add('hidden');
    expForm?.classList.add('hidden');
    supForm?.classList.add('hidden');
    historyBox?.classList.add('hidden');
    reportBox?.classList.add('hidden');
    ledgerBox?.classList.add('hidden');

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
    } else if (mode === 'suppliers_report') {
      reportBox?.classList.remove('hidden');
      this.loadSuppliersReport();
    } else if (mode === 'supplier_ledger') {
      ledgerBox?.classList.remove('hidden');
      if (!this.currentSupplierLedger) {
        this.openSupplierLedger();
      }
    }

    if (window.lucide) window.lucide.createIcons();

    const viewExp = document.getElementById('view-expenses');
    if (viewExp) viewExp.scrollTop = 0;
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
        try { window.posScanner?.playSuccessBeep?.(); } catch(e) {}
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
        try { window.posScanner?.playSuccessBeep?.(); } catch(e) {}
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

  /* ==================== SUPPLIERS REPORTS & LEDGER ==================== */
  async loadSuppliersReport() {
    const loadingRow = document.getElementById('suppliers-report-loading');
    
    try {
      if (loadingRow) loadingRow.classList.remove('hidden');
      const res = await window.api.getSuppliersReport();
      if (loadingRow) loadingRow.classList.add('hidden');

      if (!res || !res.success) {
        throw new Error(res?.error || 'فشل جلب تقارير الموردين');
      }

      const summary = res.summary || {};
      const totalDebtEl = document.getElementById('sup-report-total-debt');
      const totalSuppliedEl = document.getElementById('sup-report-total-supplied');
      const totalPaidEl = document.getElementById('sup-report-total-paid');
      const countEl = document.getElementById('sup-report-count');

      if (totalDebtEl) totalDebtEl.textContent = parseFloat(summary.total_debt || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ج.م';
      if (totalSuppliedEl) totalSuppliedEl.textContent = parseFloat(summary.total_supplied || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ج.م';
      if (totalPaidEl) totalPaidEl.textContent = parseFloat(summary.total_paid || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ج.م';
      if (countEl) countEl.textContent = res.count || (res.suppliers || []).length;

      this.allSuppliersData = res.suppliers || [];
      this.currentSuppliersFilter = 'all';
      this.renderSuppliersReportTable(this.allSuppliersData);
    } catch (err) {
      if (loadingRow) loadingRow.classList.add('hidden');
      console.error('Error loading suppliers report:', err);
      window.app?.showToast(`تعذر جلب تقرير الموردين: ${err.message}`, 'error');
    }
  }

  renderSuppliersReportTable(suppliers) {
    const tbody = document.getElementById('suppliers-report-table-body');
    const mobileContainer = document.getElementById('suppliers-report-mobile-cards');
    if (!tbody) return;

    if (!suppliers || suppliers.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="py-8 text-center text-gray-400 font-bold">لا يوجد موردين مطابقين للبحث أو الفلتر</td></tr>`;
      if (mobileContainer) {
        mobileContainer.innerHTML = `<div class="py-8 text-center text-gray-400 font-bold text-xs">لا يوجد موردين مطابقين للبحث أو الفلتر</div>`;
      }
      return;
    }

    // 1. Desktop Table
    tbody.innerHTML = suppliers.map(s => {
      const bal = parseFloat(s.balance || 0);
      const balColor = bal > 0 ? 'text-rose-600 dark:text-rose-400 font-black' : (bal < 0 ? 'text-blue-600 font-black' : 'text-emerald-600 font-bold');
      const phoneStr = s.phone ? `<span class="font-mono text-gray-400">${s.phone}</span>` : `<span class="text-gray-300">غير مسجل</span>`;
      const unpaidBadge = (s.unpaid_invoices_count > 0) ? `<span class="px-1.5 py-0.5 rounded-full text-[10px] bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 font-bold">(${s.unpaid_invoices_count} آجل)</span>` : '';
      const lastDate = s.last_purchase_date ? s.last_purchase_date.split(' ')[0] : '<span class="text-gray-300">-</span>';

      return `
        <tr class="border-b border-gray-100 dark:border-gray-700/60 hover:bg-gray-50/70 dark:hover:bg-gray-700/30 transition">
          <td class="py-3 px-3">
            <div class="font-bold text-gray-900 dark:text-white">${s.name}</div>
            <div class="text-[10px] text-gray-400">${phoneStr}</div>
          </td>
          <td class="py-3 px-3 ${balColor} font-mono text-left" dir="ltr">
            ${bal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م
          </td>
          <td class="py-3 px-3 text-center font-bold font-mono text-gray-700 dark:text-gray-300">
            <span>${s.invoices_count || s.purchases_count || 0}</span> ${unpaidBadge}
          </td>
          <td class="py-3 px-3 text-left font-bold font-mono text-indigo-600 dark:text-indigo-400" dir="ltr">
            ${parseFloat(s.total_supplied || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م
          </td>
          <td class="py-3 px-3 text-left font-bold font-mono text-emerald-600 dark:text-emerald-400" dir="ltr">
            ${parseFloat(s.total_paid || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م
          </td>
          <td class="py-3 px-3 font-mono text-[11px] text-gray-500">
            ${lastDate}
          </td>
          <td class="py-3 px-3 text-center">
            <div class="flex items-center justify-center gap-1.5">
              <button type="button" onclick="window.paySupplierDirect(${s.id})" class="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-300 hover:bg-emerald-100 transition font-bold text-xs cursor-pointer border border-emerald-200 dark:border-emerald-800" title="سداد دفعة فورية للمورد">
                <i data-lucide="hand-coins" class="w-3.5 h-3.5"></i>
                <span>سداد</span>
              </button>
              <button type="button" onclick="window.openSupplierStatement(${s.id}, '${s.name.replace(/'/g, "\'")}')" class="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-100 transition font-bold text-xs cursor-pointer border border-indigo-200 dark:border-indigo-800" title="عرض كشف الحساب التفصيلي">
                <i data-lucide="receipt-text" class="w-3.5 h-3.5"></i>
                <span>كشف حساب</span>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    // 2. Mobile Responsive Cards
    if (mobileContainer) {
      mobileContainer.innerHTML = suppliers.map(s => {
        const bal = parseFloat(s.balance || 0);
        let balBadge = '';
        if (bal > 0) {
          balBadge = `<span class="px-2.5 py-1 rounded-xl text-xs font-black bg-rose-50 dark:bg-rose-950/70 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/60 font-mono" dir="ltr">${bal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م (مطلوب له ⚠️)</span>`;
        } else if (bal < 0) {
          balBadge = `<span class="px-2.5 py-1 rounded-xl text-xs font-black bg-blue-50 dark:bg-blue-950/70 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900/60 font-mono" dir="ltr">${Math.abs(bal).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م (رصيد دائن 🟢)</span>`;
        } else {
          balBadge = `<span class="px-2.5 py-1 rounded-xl text-xs font-bold bg-emerald-50 dark:bg-emerald-950/70 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">خالص تماماً ✅</span>`;
        }

        const phoneLink = s.phone ? `<a href="tel:${s.phone}" class="text-indigo-600 dark:text-indigo-400 font-mono underline inline-flex items-center gap-1"><i data-lucide="phone" class="w-3 h-3"></i><span>${s.phone}</span></a>` : '<span class="text-gray-300">بدون هاتف</span>';
        const unpaidCount = s.unpaid_invoices_count > 0 ? `<span class="text-rose-500 font-bold">(${s.unpaid_invoices_count} آجل)</span>` : '';

        return `
          <div class="bg-white dark:bg-gray-800 rounded-2xl p-3.5 border border-gray-200 dark:border-gray-700 shadow-2xs flex flex-col gap-2.5">
            <div class="flex items-start justify-between gap-2">
              <div>
                <div class="font-black text-sm text-gray-900 dark:text-white flex items-center gap-1.5">
                  <span class="w-2 h-2 rounded-full ${bal > 0 ? 'bg-rose-500' : 'bg-emerald-500'}"></span>
                  <span>${s.name}</span>
                </div>
                <div class="text-[11px] text-gray-400 flex items-center gap-2 mt-1">
                  <span>كود #${s.supplier_code || s.code || s.id}</span>
                  <span>•</span>
                  ${phoneLink}
                </div>
              </div>
              <div class="text-left shrink-0">
                ${balBadge}
              </div>
            </div>

            <!-- Financial Metrics Grid -->
            <div class="grid grid-cols-3 gap-1.5 p-2 rounded-xl bg-gray-50 dark:bg-gray-700/40 text-[11px]">
              <div class="text-center">
                <div class="text-gray-400 text-[10px]">فواتير التوريد</div>
                <div class="font-bold text-gray-800 dark:text-gray-200 mt-0.5">${s.invoices_count || s.purchases_count || 0} ${unpaidCount}</div>
              </div>
              <div class="text-center">
                <div class="text-gray-400 text-[10px]">إجمالي التوريد</div>
                <div class="font-bold text-indigo-600 dark:text-indigo-400 font-mono mt-0.5" dir="ltr">${parseFloat(s.total_supplied || 0).toLocaleString('en-US', { minimumFractionDigits: 0 })}</div>
              </div>
              <div class="text-center">
                <div class="text-gray-400 text-[10px]">إجمالي المسدد</div>
                <div class="font-bold text-emerald-600 dark:text-emerald-400 font-mono mt-0.5" dir="ltr">${parseFloat(s.total_paid || 0).toLocaleString('en-US', { minimumFractionDigits: 0 })}</div>
              </div>
            </div>

            <!-- Mobile Action Buttons -->
            <div class="grid grid-cols-2 gap-2 pt-1 border-t border-gray-100 dark:border-gray-700/60">
              <button type="button" onclick="window.paySupplierDirect(${s.id})" class="py-2.5 px-3 rounded-xl bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-bold text-xs flex items-center justify-center gap-1.5 border border-emerald-200 dark:border-emerald-800 transition shadow-2xs">
                <i data-lucide="hand-coins" class="w-3.5 h-3.5"></i>
                <span>سداد دفعة</span>
              </button>
              <button type="button" onclick="window.openSupplierStatement(${s.id}, '${s.name.replace(/'/g, "\'")}')" class="py-2.5 px-3 rounded-xl bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-300 font-bold text-xs flex items-center justify-center gap-1.5 border border-indigo-200 dark:border-indigo-800 transition shadow-2xs">
                <i data-lucide="receipt-text" class="w-3.5 h-3.5"></i>
                <span>كشف حساب</span>
              </button>
            </div>
          </div>
        `;
      }).join('');
    }

    if (window.lucide) {
      const container = document.getElementById('view-expenses') || document.body;
      window.lucide.createIcons({ root: container });
    }
  }

  normalizeArabic(str) {
    if (!str) return '';
    return String(str)
      .replace(/[\u064B-\u065F\u0670]/g, '')
      .replace(/[أإآٱ]/g, 'ا')
      .replace(/ة/g, 'ه')
      .replace(/ى/g, 'ي')
      .replace(/ـ/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  levenshteinDistance(s1, s2) {
    if (s1.length < s2.length) return this.levenshteinDistance(s2, s1);
    if (s2.length === 0) return s1.length;
    let prev = Array.from({ length: s2.length + 1 }, (_, i) => i);
    for (let i = 0; i < s1.length; i++) {
      const curr = [i + 1];
      for (let j = 0; j < s2.length; j++) {
        const ins = prev[j + 1] + 1;
        const del = curr[j] + 1;
        const sub = prev[j] + (s1[i] === s2[j] ? 0 : 1);
        curr.push(Math.min(ins, del, sub));
      }
      prev = curr;
    }
    return prev[prev.length - 1];
  }

  matchSupplierScore(query, targetName, code = '', phone = '') {
    if (!query) return 1;
    const qNorm = this.normalizeArabic(query);
    const tNorm = this.normalizeArabic(targetName);
    const qCompact = qNorm.replace(/\s+/g, '');
    const tCompact = tNorm.replace(/\s+/g, '');
    const qRaw = String(query).trim();

    // 1. مطابقة مباشرة بالكود
    if (code && (String(code) === qRaw || String(code) === qNorm)) return 100;
    if (code && String(code).startsWith(qRaw) && qRaw.length >= 2) return 85;

    // 2. مطابقة بالهاتف
    if (phone && String(phone).includes(qRaw)) return 80;

    // 3. تطابق تام بعد توحيد الحروف
    if (qNorm === tNorm) return 100;

    // 4. تطابق تجاهل المسافات (مثل: عبدالله vs عبد الله)
    if (tCompact.includes(qCompact)) return 95;

    // 5. تطابق جزئي بالاسم
    if (tNorm.includes(qNorm)) return 90;

    // 6. تطابق كلمات متعددة بأي ترتيب
    const tokens = qNorm.split(' ').filter(Boolean);
    if (tokens.length > 1) {
      if (tokens.every(tok => tNorm.includes(tok) || tCompact.includes(tok))) return 85;
      if (tokens.some(tok => tNorm.includes(tok))) return 60;
    }

    // 7. تشابه الحروف المتسلسلة (Subsequence)
    let qIdx = 0;
    for (let i = 0; i < tCompact.length && qIdx < qCompact.length; i++) {
      if (tCompact[i] === qCompact[qIdx]) qIdx++;
    }
    if (qIdx === qCompact.length && qCompact.length >= 3) return 70;

    // 8. تقارب إملائي (Levenshtein distance)
    const words = tNorm.split(' ');
    for (const w of words) {
      if (Math.abs(w.length - qNorm.length) <= 2) {
        const d = this.levenshteinDistance(qNorm, w);
        if (d <= 1 && qNorm.length >= 3) return 65;
        if (d <= 2 && qNorm.length >= 5) return 55;
      }
    }

    return 0;
  }

  searchSuppliersReport(term) {
    term = (term || '').trim();
    if (!this.allSuppliersData) return;

    let filtered = [...this.allSuppliersData];
    if (this.currentSuppliersFilter === 'debt') {
      filtered = filtered.filter(s => parseFloat(s.balance || 0) > 0);
    } else if (this.currentSuppliersFilter === 'settled') {
      filtered = filtered.filter(s => parseFloat(s.balance || 0) <= 0);
    }

    if (term) {
      const scored = [];
      filtered.forEach(s => {
        const score = this.matchSupplierScore(term, s.name, s.code || s.id, s.phone);
        if (score > 0) {
          scored.push({ supplier: s, score });
        }
      });
      // ترتيب تنازلي: الأكثر تطابقاً وتشابهاً أولاً
      scored.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return parseFloat(b.supplier.balance || 0) - parseFloat(a.supplier.balance || 0);
      });
      filtered = scored.map(item => item.supplier);
    }

    this.renderSuppliersReportTable(filtered);
  }

  filterSupplierDropdown(term) {
    const select = document.getElementById('exp-supplier-select');
    if (!select || !this.suppliers) return;

    term = (term || '').trim();
    let list = [...this.suppliers];
    if (term) {
      const scored = [];
      list.forEach(s => {
        const score = this.matchSupplierScore(term, s.name, s.code || s.id, s.phone);
        if (score > 0) scored.push({ s, score });
      });
      scored.sort((a, b) => b.score - a.score);
      list = scored.map(item => item.s);
    }

    select.innerHTML = `
      <option value="">-- اختر المورد (${list.length} نتائج مطابقة) --</option>
      ${list.map(s => `
        <option value="${s.id}" data-balance="${s.balance || 0}">${s.name} (كود #${s.code || s.id} - رصيد: ${parseFloat(s.balance || 0).toFixed(2)} ج.م)</option>
      `).join('')}
    `;

    if (list.length === 1) {
      select.value = list[0].id;
      this.onSupplierSelected(list[0].id);
    }
  }

  filterSuppliersReport(filterType) {
    this.currentSuppliersFilter = filterType;
    document.querySelectorAll('.sup-filter-btn').forEach(btn => {
      if (btn.getAttribute('data-filter') === filterType) {
        btn.className = 'sup-filter-btn px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-600 text-white shadow-xs';
      } else {
        btn.className = 'sup-filter-btn px-2.5 py-1 rounded-lg text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600';
      }
    });

    const searchInput = document.getElementById('sup-report-search');
    this.searchSuppliersReport(searchInput ? searchInput.value : '');
  }

  exportSuppliersReportExcel() {
    if (!this.allSuppliersData || this.allSuppliersData.length === 0) {
      window.app?.showToast('لا توجد بيانات موردين لتصديرها!', 'warning');
      return;
    }

    let csv = '\uFEFF'; // UTF-8 BOM
    csv += 'اسم المورد,رقم الهاتف,الرصيد المستحق (ج.م),عدد فواتير التوريد,فواتير بها متبقي,إجمالي البضاعة الموردة (ج.م),إجمالي المسدد (ج.م),تاريخ آخر توريد\n';

    this.allSuppliersData.forEach(s => {
      const name = `"${(s.name || '').replace(/"/g, '""')}"`;
      const phone = `"${s.phone || ''}"`;
      const bal = parseFloat(s.balance || 0).toFixed(2);
      const pCount = s.invoices_count || s.purchases_count || 0;
      const unpCount = s.unpaid_invoices_count || 0;
      const supplied = parseFloat(s.total_supplied || 0).toFixed(2);
      const paid = parseFloat(s.total_paid || 0).toFixed(2);
      const lastDate = `"${s.last_purchase_date || ''}"`;

      csv += `${name},${phone},${bal},${pCount},${unpCount},${supplied},${paid},${lastDate}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `تقرير_الموردين_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    window.app?.showToast('تم تصدير تقرير الموردين بنجاح 📑', 'success');
  }

  async ensureSuppliersLoaded() {
    if (this.suppliers && this.suppliers.length > 0) return this.suppliers;
    if (window.purchasesController?.suppliers && window.purchasesController.suppliers.length > 0) {
      this.suppliers = window.purchasesController.suppliers;
      return this.suppliers;
    }
    try {
      const res = await window.api.getSuppliers();
      if (res && res.success && Array.isArray(res.suppliers)) {
        this.suppliers = res.suppliers;
      }
    } catch (e) {
      console.warn('Could not fetch suppliers:', e);
    }
    return this.suppliers || [];
  }

  async openSupplierLedger(supplierId = null, supplierName = '', fromDate = '', toDate = '') {
    const allSuppliers = await this.ensureSuppliersLoaded();

    // Normalize supplierId
    if (supplierId && !isNaN(supplierId) && parseInt(supplierId, 10) > 0) {
      supplierId = parseInt(supplierId, 10);
    } else {
      supplierId = null;
    }

    // Fallback cascade to find selected supplier
    if (!supplierId) {
      if (window.purchasesController?.selectedSupplierId && parseInt(window.purchasesController.selectedSupplierId, 10) > 0) {
        supplierId = parseInt(window.purchasesController.selectedSupplierId, 10);
      } else {
        const purchSelect = document.getElementById('purch-supplier-select');
        const expSelect = document.getElementById('exp-supplier-select');
        if (purchSelect && purchSelect.value && parseInt(purchSelect.value, 10) > 0) {
          supplierId = parseInt(purchSelect.value, 10);
          supplierName = purchSelect.options[purchSelect.selectedIndex]?.getAttribute('data-name') || '';
        } else if (expSelect && expSelect.value && parseInt(expSelect.value, 10) > 0) {
          supplierId = parseInt(expSelect.value, 10);
          supplierName = expSelect.options[expSelect.selectedIndex]?.text.split('(')[0].trim();
        } else if (allSuppliers.length > 0) {
          supplierId = allSuppliers[0].id;
          supplierName = allSuppliers[0].name;
        }
      }
    }

    if (supplierId && !supplierName && allSuppliers.length > 0) {
      const match = allSuppliers.find(s => s.id == supplierId);
      if (match) supplierName = match.name;
    }

    if (!supplierId && !supplierName) {
      const msg = 'لا يوجد موردون مسجلون في النظام حالياً لعرض كشف الحساب!';
      window.app?.showToast(msg, 'warning');
      alert(msg);
      return;
    }

    this.activeSupplierId = supplierId;
    this.activeSupplierName = supplierName;
    this.ledgerFilter = 'all';

    // Switch view to expenses if needed
    if (window.app && window.app.currentView !== 'expenses') {
      window.app.switchView('expenses');
    }

    // Switch mode to supplier_ledger
    this.currentMode = 'supplier_ledger';
    const purchForm = document.getElementById('purchase-invoice-form');
    const expForm = document.getElementById('expense-general-form');
    const supForm = document.getElementById('expense-supplier-form');
    const historyBox = document.getElementById('purchases-history-container');
    const reportBox = document.getElementById('suppliers-report-container');
    const ledgerBox = document.getElementById('supplier-ledger-container');

    document.querySelectorAll('.expense-mode-btn').forEach(btn => {
      if (btn.getAttribute('data-mode') === 'supplier_ledger') {
        btn.className = 'expense-mode-btn py-2 px-2 rounded-xl text-xs font-bold bg-indigo-600 text-white shadow-sm flex items-center justify-center gap-1.5 transition';
      } else {
        btn.className = 'expense-mode-btn py-2 px-2 rounded-xl text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 flex items-center justify-center gap-1.5 transition';
      }
    });

    purchForm?.classList.add('hidden');
    expForm?.classList.add('hidden');
    supForm?.classList.add('hidden');
    historyBox?.classList.add('hidden');
    reportBox?.classList.add('hidden');
    ledgerBox?.classList.remove('hidden');

    const viewExp = document.getElementById('view-expenses');
    if (viewExp) viewExp.scrollTop = 0;

    try {
      window.app?.showLoading(true, 'جاري جلب كشف الحساب المالي للمورد...');
      const res = await window.api.getSupplierLedger(supplierId, supplierName, fromDate, toDate);
      window.app?.showLoading(false);

      if (!res || !res.success) {
        throw new Error(res?.error || 'لم يتم العثور على بيانات كشف الحساب');
      }

      this.currentSupplierLedger = res;

      const sup = res.supplier || {};
      const summary = res.summary || {};

      const nameEl = document.getElementById('sup-ledger-name');
      if (nameEl) nameEl.textContent = sup.name || supplierName;

      const phoneEl = document.getElementById('sup-ledger-phone');
      if (phoneEl) phoneEl.textContent = sup.phone ? `هاتف: ${sup.phone}` : 'بدون رقم هاتف';
      
      // Populate supplier switcher inside ledger view
      const switchSelect = document.getElementById('sup-ledger-switch-select');
      if (switchSelect && allSuppliers.length > 0) {
        switchSelect.innerHTML = allSuppliers.map(s => `
          <option value="${s.id}" ${s.id == (sup.id || supplierId) ? 'selected' : ''}>
            ${s.name} (${parseFloat(s.balance || 0).toFixed(0)} ج.م)
          </option>
        `).join('');
      }

      const balEl = document.getElementById('sup-ledger-current-balance');
      const curBal = parseFloat(summary.current_balance !== undefined ? summary.current_balance : (sup.balance || 0));
      if (balEl) {
        balEl.textContent = curBal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ج.م';
        balEl.className = 'text-sm font-black font-mono mt-0.5 ' + (curBal > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400');
      }

      const purchEl = document.getElementById('sup-ledger-total-purchases');
      if (purchEl) purchEl.textContent = parseFloat(summary.total_purchases || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ج.م';

      const payEl = document.getElementById('sup-ledger-total-payments');
      if (payEl) payEl.textContent = parseFloat(summary.total_payments || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ج.م';

      const countEl = document.getElementById('sup-ledger-invoices-count');
      if (countEl) countEl.textContent = (summary.purchases_count || 0) + ' فواتير';

      // Set input dates if returned
      const fromInput = document.getElementById('sup-ledger-from-date');
      const toInput = document.getElementById('sup-ledger-to-date');
      if (fromInput) fromInput.value = res.filter?.from_date || fromDate || '';
      if (toInput) toInput.value = res.filter?.to_date || toDate || '';

      try {
        this.renderLedgerTable();
      } catch (renderErr) {
        console.error('Error rendering ledger table:', renderErr);
      }

      if (window.lucide) window.lucide.createIcons();
    } catch (err) {
      window.app?.showLoading(false);
      console.error('Error opening supplier ledger:', err);
      const errMsg = `تعذر جلب كشف الحساب: ${err.message || err}`;
      window.app?.showToast(errMsg, 'error');
    }
  }

  onLedgerSupplierSwitched(newSupplierId) {
    if (!newSupplierId) return;
    const sup = (this.suppliers || []).find(s => s.id == newSupplierId);
    const supName = sup ? sup.name : '';
    this.openSupplierLedger(parseInt(newSupplierId, 10), supName);
  }

  filterLedger(type) {
    this.ledgerFilter = type;
    document.querySelectorAll('.sup-ledger-tab-btn').forEach(btn => {
      btn.className = 'sup-ledger-tab-btn px-2.5 py-1 rounded-lg text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600';
    });
    const activeBtn = document.getElementById(`sup-ledger-filter-${type}`);
    if (activeBtn) {
      activeBtn.className = 'sup-ledger-tab-btn px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-600 text-white shadow-xs';
    }

    this.renderLedgerTable();
  }

  renderLedgerTable() {
    const tbody = document.getElementById('sup-ledger-table-body');
    const mobileContainer = document.getElementById('sup-ledger-mobile-cards');
    if (!tbody || !this.currentSupplierLedger) return;

    let txs = this.currentSupplierLedger.transactions || [];
    if (this.ledgerFilter === 'purchases') {
      txs = txs.filter(t => t.type === 'فاتورة توريد');
    } else if (this.ledgerFilter === 'payments') {
      txs = txs.filter(t => t.type === 'سداد نقدي' || t.type === 'دفعة نقدية مسددة');
    } else if (this.ledgerFilter === 'unpaid') {
      txs = txs.filter(t => (t.remaining > 0));
    }

    if (txs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="py-8 text-center text-gray-400 font-bold">لا توجد حركات مطابقة للفلتر المحدد</td></tr>`;
      if (mobileContainer) {
        mobileContainer.innerHTML = `<div class="py-8 text-center text-gray-400 font-bold text-xs">لا توجد حركات مطابقة للفلتر المحدد</div>`;
      }
      return;
    }

    // 1. Desktop Table
    tbody.innerHTML = txs.map(t => {
      const isPurch = t.type === 'فاتورة توريد';
      const typeBadge = isPurch 
        ? `<span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-50 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800">توريد بضاعة 📥</span>`
        : `<span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/70 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">سداد نقدي 💵</span>`;

      const creditStr = (t.credit > 0) ? `<span class="font-bold text-rose-600 dark:text-rose-400 font-mono">+${parseFloat(t.credit).toFixed(2)}</span>` : '<span class="text-gray-300">-</span>';
      const debitStr = (t.debit > 0) ? `<span class="font-bold text-emerald-600 dark:text-emerald-400 font-mono">-${parseFloat(t.debit).toFixed(2)}</span>` : '<span class="text-gray-300">-</span>';
      const remStr = (t.remaining > 0) ? `<span class="font-bold text-amber-600 dark:text-amber-400 font-mono">${parseFloat(t.remaining).toFixed(2)}</span>` : '<span class="text-emerald-600 font-bold">خالص</span>';

      const hasItems = isPurch && Array.isArray(t.items) && t.items.length > 0;
      const itemsBtn = hasItems 
        ? `<button type="button" onclick="window.expensesController.toggleTxItems(${t.id})" class="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 font-bold text-[10px] hover:bg-indigo-100 transition border border-indigo-200 dark:border-indigo-800 cursor-pointer">
             <i data-lucide="boxes" class="w-3 h-3"></i>
             <span>${t.items.length} أصناف ▾</span>
           </button>`
        : `<span class="text-gray-300">-</span>`;

      let itemsRow = '';
      if (hasItems) {
        itemsRow = `
          <tr id="sup-tx-items-${t.id}" class="hidden bg-gray-50/90 dark:bg-gray-900/60 border-b border-gray-100 dark:border-gray-700/60">
            <td colspan="8" class="p-3">
              <div class="bg-white dark:bg-gray-800 rounded-xl p-3 border border-gray-200 dark:border-gray-700 shadow-xs">
                <div class="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 mb-2 flex items-center gap-1">
                  <i data-lucide="package" class="w-3.5 h-3.5"></i>
                  <span>أصناف فاتورة التوريد (${t.reference || t.id}):</span>
                </div>
                <table class="w-full text-right text-[11px] border-collapse">
                  <thead>
                    <tr class="border-b border-gray-100 dark:border-gray-700 text-gray-400 font-bold">
                      <th class="py-1.5 px-2">الصنف</th>
                      <th class="py-1.5 px-2 text-center">الكمية</th>
                      <th class="py-1.5 px-2 text-left">سعر التكلفة</th>
                      <th class="py-1.5 px-2 text-left">إجمالي التكلفة</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${t.items.map(it => `
                      <tr class="border-b border-gray-50 dark:border-gray-700/40">
                        <td class="py-1 px-2 font-bold text-gray-800 dark:text-gray-200">${it.name}</td>
                        <td class="py-1 px-2 text-center font-mono font-bold">${it.qty} ${it.unit || 'قطعة'}</td>
                        <td class="py-1 px-2 text-left font-mono" dir="ltr">${parseFloat(it.cost_price || 0).toFixed(2)} ج.م</td>
                        <td class="py-1 px-2 text-left font-mono font-bold text-indigo-600 dark:text-indigo-400" dir="ltr">${parseFloat(it.total_cost || (it.qty * it.cost_price)).toFixed(2)} ج.م</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            </td>
          </tr>
        `;
      }

      return `
        <tr class="border-b border-gray-100 dark:border-gray-700/60 hover:bg-gray-50/50 dark:hover:bg-gray-700/20 text-xs">
          <td class="py-2.5 px-3 font-mono text-[11px] text-gray-500">${t.date || ''}</td>
          <td class="py-2.5 px-3">${typeBadge}</td>
          <td class="py-2.5 px-3 font-bold font-mono text-gray-700 dark:text-gray-300">${t.reference || '-'}</td>
          <td class="py-2.5 px-3 text-left" dir="ltr">${creditStr}</td>
          <td class="py-2.5 px-3 text-left" dir="ltr">${debitStr}</td>
          <td class="py-2.5 px-3 text-left" dir="ltr">${remStr}</td>
          <td class="py-2.5 px-3 text-[11px] text-gray-500">${t.notes || t.note || ''}</td>
          <td class="py-2.5 px-3 text-center">${itemsBtn}</td>
        </tr>
        ${itemsRow}
      `;
    }).join('');

    // 2. Mobile Responsive Cards for Transactions
    if (mobileContainer) {
      mobileContainer.innerHTML = txs.map(t => {
        const isPurch = t.type === 'فاتورة توريد';
        const badgeColor = isPurch ? 'bg-indigo-50 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-400 border-indigo-200' : 'bg-emerald-50 dark:bg-emerald-950/70 text-emerald-600 dark:text-emerald-400 border-emerald-200';
        const typeTitle = isPurch ? 'توريد بضاعة 📥' : 'سداد نقدي 💵';
        const amountDisplay = isPurch
          ? `<span class="text-rose-600 dark:text-rose-400 font-mono font-black" dir="ltr">+${parseFloat(t.credit || 0).toFixed(2)} ج.م</span>`
          : `<span class="text-emerald-600 dark:text-emerald-400 font-mono font-black" dir="ltr">-${parseFloat(t.debit || 0).toFixed(2)} ج.م</span>`;

        const hasItems = isPurch && Array.isArray(t.items) && t.items.length > 0;
        const itemsBtn = hasItems
          ? `<button type="button" onclick="window.expensesController.toggleTxItems(${t.id})" class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-300 font-bold text-[10px] border border-indigo-200 dark:border-indigo-800">
               <i data-lucide="package" class="w-3 h-3"></i>
               <span>الأصناف (${t.items.length}) ▾</span>
             </button>`
          : '';

        let itemsAccordion = '';
        if (hasItems) {
          itemsAccordion = `
            <div id="sup-tx-mobile-items-${t.id}" class="hidden flex flex-col gap-1 p-2 rounded-xl bg-gray-50 dark:bg-gray-700/50 text-[11px] mt-1 border border-gray-200 dark:border-gray-600">
              ${t.items.map(it => `
                <div class="flex items-center justify-between py-1 border-b border-gray-100 dark:border-gray-700/50">
                  <span class="font-bold text-gray-800 dark:text-gray-200">${it.name} (${it.qty} ${it.unit || 'قطعة'})</span>
                  <span class="font-mono text-indigo-600 dark:text-indigo-400 font-bold" dir="ltr">${parseFloat(it.total_cost || (it.qty * it.cost_price)).toFixed(2)} ج.م</span>
                </div>
              `).join('')}
            </div>
          `;
        }

        return `
          <div class="bg-white dark:bg-gray-800 rounded-2xl p-3 border border-gray-200 dark:border-gray-700 shadow-2xs flex flex-col gap-2">
            <div class="flex items-center justify-between">
              <span class="px-2 py-0.5 rounded-lg text-[10px] font-bold border ${badgeColor}">${typeTitle}</span>
              <span class="font-mono text-[10px] text-gray-400">${t.date || ''}</span>
            </div>

            <div class="flex items-center justify-between">
              <div>
                <span class="font-bold text-xs text-gray-800 dark:text-gray-200">${t.reference || ('حركة #' + t.id)}</span>
                ${(t.notes || t.note) ? `<div class="text-[11px] text-gray-400 mt-0.5">${t.notes || t.note}</div>` : ''}
              </div>
              <div class="text-left">
                <div class="text-sm font-black">${amountDisplay}</div>
                ${isPurch && t.remaining > 0 ? `<div class="text-[10px] text-amber-600 dark:text-amber-400 font-mono font-bold">متبقي: ${parseFloat(t.remaining).toFixed(2)} ج.م</div>` : ''}
              </div>
            </div>

            ${itemsBtn ? `<div class="pt-1 flex items-center justify-between border-t border-gray-100 dark:border-gray-700/60">${itemsBtn}</div>` : ''}
            ${itemsAccordion}
          </div>
        `;
      }).join('');
    }

    if (window.lucide) window.lucide.createIcons();
  }

  toggleTxItems(txId) {
    const row = document.getElementById(`sup-tx-items-${txId}`);
    if (row) {
      row.classList.toggle('hidden');
    }
  }

  applyLedgerDateFilter() {
    const fromDate = document.getElementById('sup-ledger-from-date')?.value || '';
    const toDate = document.getElementById('sup-ledger-to-date')?.value || '';
    this.openSupplierLedger(this.activeSupplierId, this.activeSupplierName, fromDate, toDate);
  }

  clearLedgerDateFilter() {
    const fromInput = document.getElementById('sup-ledger-from-date');
    const toInput = document.getElementById('sup-ledger-to-date');
    if (fromInput) fromInput.value = '';
    if (toInput) toInput.value = '';
    this.openSupplierLedger(this.activeSupplierId, this.activeSupplierName, '', '');
  }

  exportSupplierLedgerExcel() {
    if (!this.currentSupplierLedger || !this.currentSupplierLedger.supplier) {
      window.app?.showToast('لا توجد بيانات كشف حساب متاحة للتصدير', 'warning');
      return;
    }

    const sup = this.currentSupplierLedger.supplier;
    const txs = this.currentSupplierLedger.transactions || [];

    let csv = '\uFEFF';
    csv += `كشف حساب المورد: ${sup.name}\n`;
    csv += `رقم الهاتف: ${sup.phone || 'غير مسجل'}\n`;
    csv += `الرصيد المستحق الحالي: ${sup.balance} ج.م\n`;
    csv += `تاريخ التصدير: ${new Date().toLocaleString('ar-EG')}\n\n`;

    csv += 'التاريخ والوقت,النوع,رقم المرجع,دائن (توريد),مدين (سداد),المتبقي,طريقة الدفع,ملاحظات,أصناف الفاتورة\n';

    txs.forEach(t => {
      const date = `"${t.date || ''}"`;
      const type = `"${t.type || ''}"`;
      const ref = `"${t.reference || ''}"`;
      const credit = parseFloat(t.credit || 0).toFixed(2);
      const debit = parseFloat(t.debit || 0).toFixed(2);
      const rem = parseFloat(t.remaining || 0).toFixed(2);
      const pm = `"${t.payment_method || ''}"`;
      const notes = `"${(t.notes || '').replace(/"/g, '""')}"`;
      
      let itemsList = '';
      if (Array.isArray(t.items) && t.items.length > 0) {
        itemsList = t.items.map(it => `${it.name} (${it.qty} ${it.unit || ''} بسعر ${it.cost_price})`).join(' | ');
      }
      itemsList = `"${itemsList.replace(/"/g, '""')}"`;

      csv += `${date},${type},${ref},${credit},${debit},${rem},${pm},${notes},${itemsList}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `كشف_حساب_${sup.name}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    window.app?.showToast('تم تصدير كشف الحساب بنجاح 📑', 'success');
  }

  closeSupplierLedgerModal() {
    this.setMode('suppliers_report');
  }

  closeSupplierLedger() {
    this.setMode('suppliers_report');
  }

  paySupplierDirect(supplierId) {
    if (window.app && window.app.currentView !== 'expenses') {
      window.app.switchView('expenses');
    }
    this.setMode('supplier');
    setTimeout(() => {
      const select = document.getElementById('exp-supplier-select');
      if (select && supplierId) {
        select.value = supplierId;
        select.dispatchEvent(new Event('change'));
      }
      const amtInput = document.getElementById('sup-amount-input');
      if (amtInput) {
        amtInput.focus();
        amtInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 150);
  }

  printSupplierLedger() {
    if (!this.currentSupplierLedger || !this.currentSupplierLedger.supplier) {
      window.app?.showToast('لا توجد بيانات كشف حساب متاحة للطباعة', 'warning');
      return;
    }

    const res = this.currentSupplierLedger;
    const sup = res.supplier;
    const summary = res.summary || {};
    const txs = res.transactions || [];
    const printArea = document.getElementById('receipt-print-area');
    if (!printArea) {
      window.print();
      return;
    }

    const printHTML = `
      <div class="receipt-header">
        <h2 style="margin:0; font-size:16px; font-weight:bold;">السورية هوم ماركت</h2>
        <p style="margin:2px 0; font-size:12px;">كشف حساب مالي تفصيلي لمورد</p>
        <div style="border-top:1px dashed #000; margin:6px 0;"></div>
      </div>

      <div style="font-size:11px; margin-bottom:8px;">
        <div><b>اسم المورد:</b> ${sup.name}</div>
        <div><b>رقم الهاتف:</b> ${sup.phone || 'غير مسجل'}</div>
        <div><b>تاريخ الكشف:</b> ${new Date().toLocaleString('ar-EG')}</div>
      </div>

      <div style="background:#f5f5f5; border:1px solid #ddd; padding:6px; border-radius:6px; font-size:11px; margin-bottom:8px;">
        <div style="display:flex; justify-content:space-between; margin-bottom:2px;">
          <span>إجمالي البضاعة الموردة:</span>
          <b>${parseFloat(summary.total_purchases || 0).toFixed(2)} ج.م</b>
        </div>
        <div style="display:flex; justify-content:space-between; margin-bottom:2px;">
          <span>إجمالي المسدد له:</span>
          <b>${parseFloat(summary.total_payments || 0).toFixed(2)} ج.م</b>
        </div>
        <div style="border-top:1px solid #ccc; margin:4px 0;"></div>
        <div style="display:flex; justify-content:space-between; font-size:12px; font-weight:bold;">
          <span>الرصيد المتبقي للمورد:</span>
          <span>${parseFloat(summary.current_balance || sup.balance || 0).toFixed(2)} ج.م</span>
        </div>
      </div>

      <table style="width:100%; border-collapse:collapse; font-size:10px; text-align:right; margin-bottom:10px;">
        <thead>
          <tr style="border-bottom:1px solid #000; background:#eee;">
            <th style="padding:3px;">التاريخ</th>
            <th style="padding:3px;">النوع / المرجع</th>
            <th style="padding:3px; text-align:left;">دائن (توريد)</th>
            <th style="padding:3px; text-align:left;">مدين (سداد)</th>
          </tr>
        </thead>
        <tbody>
          ${txs.map(t => `
            <tr style="border-bottom:1px dashed #ddd;">
              <td style="padding:3px; font-size:9px;">${(t.date || '').split(' ')[0]}</td>
              <td style="padding:3px;">${t.type}<br/><small style="color:#555;">${t.reference || ''}</small></td>
              <td style="padding:3px; text-align:left;">${t.credit > 0 ? parseFloat(t.credit).toFixed(2) : '-'}</td>
              <td style="padding:3px; text-align:left;">${t.debit > 0 ? parseFloat(t.debit).toFixed(2) : '-'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div style="border-top:1px dashed #000; margin-top:8px; padding-top:6px; font-size:10px; text-align:center;">
        <p style="margin:2px 0;">توقيع المحاسب / الإدارة: ........................</p>
        <p style="margin:2px 0;">توقيع واستلام المورد: ........................</p>
      </div>
    `;

    printArea.innerHTML = printHTML;
    window.print();
  }
}

window.expensesController = new ExpensesController();

// Global handlers for supplier actions from cards and tables
window.openSupplierStatement = function(id, name = '') {
  if (window.expensesController) {
    window.expensesController.openSupplierLedger(id, name);
  }
};

window.paySupplierDirect = function(id) {
  if (window.expensesController) {
    window.expensesController.paySupplierDirect(id);
  }
};
