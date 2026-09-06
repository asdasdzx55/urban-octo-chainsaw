/**
 * Syrian Home POS - Employees & Payroll Controller (v2.5.0)
 * نظام إدارة شؤون العمال، الرواتب، السلف، وكشوف الحسابات المالية (إصدار متكامل بدون Modals عائمة)
 */
class EmployeesController {
  constructor() {
    this.employees = [];
    this.recentPayouts = [];
    this.currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
    this.searchQuery = '';
    this.statusFilter = 'all'; // all, active, inactive
    this.currentSubView = 'list'; // list, form, payout, ledger
    this.currentLedgerData = null;
    this.activeLedgerEmpId = null;
  }

  /**
   * تهيئة متحكم العمال عند فتح الشاشة
   */
  init() {
    this.currentMonth = new Date().toISOString().slice(0, 7);
    const monthInput = document.getElementById('emp-month-filter');
    if (monthInput && !monthInput.value) {
      monthInput.value = this.currentMonth;
    }
    
    // ضبط التبويب الافتراضي على قائمة العمال
    this.setSubView(this.currentSubView || 'list');
    this.loadEmployees();
    this.loadRecentPayouts();
  }

  /**
   * التبديل بين الأقسام المدمجة في شاشة شؤون العمال (بدون نوافذ منبثقة)
   * @param {'list'|'form'|'payout'|'ledger'} viewName 
   * @param {any} data 
   */
  setSubView(viewName = 'list', data = null) {
    this.currentSubView = viewName;

    // تحديث أزرار التبويب العلوية
    document.querySelectorAll('.emp-subtab-btn').forEach(btn => {
      const target = btn.getAttribute('data-subview');
      if (target === viewName) {
        btn.className = 'emp-subtab-btn px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 text-white shadow-md flex items-center gap-1.5 transition';
      } else {
        btn.className = 'emp-subtab-btn px-4 py-2 rounded-xl text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-1.5 transition cursor-pointer';
      }
    });

    // إخفاء كافة الشاشات الفرعية وإظهار الشاشة المختارة
    const views = {
      list: document.getElementById('emp-subview-list'),
      form: document.getElementById('emp-subview-form'),
      payout: document.getElementById('emp-subview-payout'),
      ledger: document.getElementById('emp-subview-ledger')
    };

    Object.keys(views).forEach(k => {
      if (views[k]) {
        if (k === viewName) {
          views[k].classList.remove('hidden');
        } else {
          views[k].classList.add('hidden');
        }
      }
    });

    // إجراءات خاصة بكل شاشة عند التبديل
    if (viewName === 'form') {
      if (data) {
        this.populateEditForm(data);
      } else {
        this.resetAddForm();
      }
    } else if (viewName === 'payout') {
      this.setupPayoutForm(data);
    } else if (viewName === 'ledger') {
      const empId = data?.employeeId || data || (this.employees[0]?.id);
      this.setupLedgerView(empId);
    } else if (viewName === 'list') {
      this.renderKPIs();
      this.renderEmployeesList();
    }

    // التمرير لأعلى الصفحة لضمان رؤية النموذج بالكامل على الموبايل
    const parentContainer = document.getElementById('view-employees');
    if (parentContainer) parentContainer.scrollTop = 0;

    if (window.lucide) window.lucide.createIcons();
  }

  /**
   * جلب قائمة العمال من السيرفر
   */
  async loadEmployees() {
    const listContainer = document.getElementById('employees-grid');

    try {
      window.app?.showLoading(true, 'جاري تحميل بيانات العمال والرواتب...');
      const res = await window.api.getEmployees(false);
      window.app?.showLoading(false);

      if (res && res.success && Array.isArray(res.employees)) {
        this.employees = res.employees;
        if (res.current_month) this.currentMonth = res.current_month;
        this.renderKPIs();
        this.renderEmployeesList();
        this.updateDropdowns();
      } else {
        throw new Error(res?.error || 'فشل جلب بيانات العمال');
      }
    } catch (err) {
      window.app?.showLoading(false);
      console.error('Error loading employees:', err);
      if (listContainer) {
        listContainer.innerHTML = `
          <div class="col-span-full p-8 text-center bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900 rounded-3xl">
            <i data-lucide="alert-circle" class="w-8 h-8 text-rose-500 mx-auto mb-2"></i>
            <p class="text-xs font-bold text-rose-600 dark:text-rose-400">تعذر جلب بيانات العمال: ${err.message}</p>
            <button type="button" onclick="window.employeesController.loadEmployees()" class="mt-3 px-4 py-2 bg-rose-600 text-white rounded-xl text-xs font-bold hover:bg-rose-700 transition cursor-pointer">
              إعادة المحاولة 🔄
            </button>
          </div>
        `;
        if (window.lucide) window.lucide.createIcons();
      }
    }
  }

  /**
   * جلب سجل حركات الصرف للشهر المحدد
   */
  async loadRecentPayouts() {
    const tableBody = document.getElementById('emp-payouts-table-body');
    if (!tableBody) return;

    try {
      const res = await window.api.getSalaryPayouts(this.currentMonth, 25);
      if (res && res.success && Array.isArray(res.payouts)) {
        this.recentPayouts = res.payouts;
        this.renderRecentPayouts();
      }
    } catch (err) {
      console.warn('Failed to load recent salary payouts:', err);
    }
  }

  /**
   * تحديث بطاقات ملخص الـ KPIs المالية
   */
  renderKPIs() {
    const activeEmployees = this.employees.filter(e => e.is_active != 0);
    const totalBaseSalary = activeEmployees.reduce((sum, e) => sum + parseFloat(e.base_salary || 0), 0);
    const totalAdvances = this.employees.reduce((sum, e) => sum + parseFloat(e.advances_this_month || 0), 0);
    const totalRemaining = this.employees.reduce((sum, e) => sum + parseFloat(e.net_remaining_salary !== undefined ? e.net_remaining_salary : (parseFloat(e.base_salary || 0) - parseFloat(e.advances_this_month || 0))), 0);

    const elCount = document.getElementById('kpi-emp-count');
    const elSalary = document.getElementById('kpi-emp-total-salary');
    const elAdvances = document.getElementById('kpi-emp-total-advances');
    const elRemaining = document.getElementById('kpi-emp-total-remaining');

    if (elCount) elCount.textContent = activeEmployees.length;
    if (elSalary) elSalary.textContent = `${totalBaseSalary.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;
    if (elAdvances) elAdvances.textContent = `${totalAdvances.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;
    if (elRemaining) elRemaining.textContent = `${Math.max(0, totalRemaining).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;
  }

  /**
   * عرض كروت العمال
   */
  renderEmployeesList() {
    const container = document.getElementById('employees-grid');
    if (!container) return;

    const query = this.searchQuery.trim().toLowerCase();
    const filtered = this.employees.filter(emp => {
      if (this.statusFilter === 'active' && emp.is_active == 0) return false;
      if (this.statusFilter === 'inactive' && emp.is_active != 0) return false;

      if (query) {
        const name = (emp.name || '').toLowerCase();
        const role = (emp.role || '').toLowerCase();
        const phone = (emp.phone || '').toLowerCase();
        return name.includes(query) || role.includes(query) || phone.includes(query);
      }
      return true;
    });

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="col-span-full p-10 text-center bg-gray-50 dark:bg-gray-800/50 rounded-3xl border border-dashed border-gray-200 dark:border-gray-700">
          <div class="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-500 mx-auto flex items-center justify-center mb-3">
            <i data-lucide="users" class="w-7 h-7"></i>
          </div>
          <h4 class="text-sm font-bold text-gray-800 dark:text-gray-200">لا يوجد عمال مطابقين</h4>
          <p class="text-xs text-gray-400 mt-1">اضغط على زر إضافة عامل جديد للبدء بتسجيل العمال</p>
          <button type="button" onclick="window.employeesController.setSubView('form')" class="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 mx-auto shadow-sm cursor-pointer">
            <i data-lucide="plus" class="w-4 h-4"></i>
            <span>➕ تسجيل عامل جديد</span>
          </button>
        </div>
      `;
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    container.innerHTML = filtered.map(emp => {
      const baseSalary = parseFloat(emp.base_salary || 0);
      const advances = parseFloat(emp.advances_this_month || 0);
      const remaining = parseFloat(emp.net_remaining_salary !== undefined ? emp.net_remaining_salary : (baseSalary - advances));
      const isActive = emp.is_active != 0;
      const roleColor = this.getRoleBadgeColor(emp.role);

      return `
        <div class="bg-white dark:bg-gray-800 rounded-3xl p-5 border border-gray-200/80 dark:border-gray-700 shadow-xs hover:shadow-md transition flex flex-col justify-between gap-4 relative overflow-hidden group">
          <!-- Top Active Accent -->
          <div class="absolute top-0 right-0 left-0 h-1.5 ${isActive ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-600'}"></div>

          <!-- Header: Name, Role, Actions -->
          <div class="flex items-start justify-between gap-3 pt-1">
            <div class="flex items-center gap-3">
              <div class="w-11 h-11 rounded-2xl ${roleColor.bg} ${roleColor.text} font-black text-sm flex items-center justify-center shadow-2xs">
                ${(emp.name || 'ع').charAt(0)}
              </div>
              <div>
                <h4 class="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <span>${emp.name}</span>
                  ${!isActive ? '<span class="px-1.5 py-0.5 rounded text-[10px] bg-rose-100 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400 font-bold">متوقف</span>' : ''}
                </h4>
                <div class="flex items-center gap-2 mt-0.5">
                  <span class="px-2 py-0.5 rounded-lg text-[10px] font-bold ${roleColor.badge}">
                    ${emp.role || 'عامل'}
                  </span>
                  ${emp.phone ? `
                    <a href="tel:${emp.phone}" class="text-[11px] font-mono text-gray-400 hover:text-indigo-600 transition flex items-center gap-1">
                      <i data-lucide="phone" class="w-3 h-3"></i>
                      <span>${emp.phone}</span>
                    </a>
                  ` : ''}
                </div>
              </div>
            </div>

            <!-- Edit / Delete -->
            <div class="flex items-center gap-1">
              <button type="button" onclick="window.employeesController.setSubView('form', ${emp.id})" class="w-8 h-8 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 flex items-center justify-center transition cursor-pointer" title="تعديل بيانات العامل">
                <i data-lucide="edit-2" class="w-3.5 h-3.5"></i>
              </button>
              <button type="button" onclick="window.employeesController.deleteEmployee(${emp.id}, '${emp.name}')" class="w-8 h-8 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/60 flex items-center justify-center transition cursor-pointer" title="حذف العامل">
                <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
              </button>
            </div>
          </div>

          <!-- Financial Summary -->
          <div class="bg-gray-50 dark:bg-gray-900/50 rounded-2xl p-3 border border-gray-100 dark:border-gray-800 grid grid-cols-3 gap-2 text-center">
            <div>
              <p class="text-[10px] text-gray-400 font-medium">الراتب الأساسي</p>
              <p class="text-xs font-bold text-gray-800 dark:text-gray-200 mt-0.5 font-mono">${baseSalary.toFixed(0)}</p>
            </div>
            <div class="border-x border-gray-200 dark:border-gray-700/60">
              <p class="text-[10px] text-rose-500 font-medium">سلف الشهر 💸</p>
              <p class="text-xs font-bold text-rose-600 dark:text-rose-400 mt-0.5 font-mono">${advances.toFixed(0)}</p>
            </div>
            <div>
              <p class="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">الصافي المتبقي</p>
              <p class="text-xs font-black text-emerald-600 dark:text-emerald-400 mt-0.5 font-mono">${remaining.toFixed(0)} ج.م</p>
            </div>
          </div>

          <!-- Fast Action Buttons -->
          <div class="grid grid-cols-3 gap-1.5 pt-1">
            <button type="button" onclick="window.employeesController.setSubView('payout', { employeeId: ${emp.id}, type: 'راتب شهري' })" class="py-2 px-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] flex items-center justify-center gap-1 shadow-2xs transition cursor-pointer" title="دفع الراتب الشهري">
              <i data-lucide="banknote" class="w-3.5 h-3.5"></i>
              <span>دفع راتب</span>
            </button>

            <button type="button" onclick="window.employeesController.setSubView('payout', { employeeId: ${emp.id}, type: 'سلفة' })" class="py-2 px-1 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-[11px] flex items-center justify-center gap-1 shadow-2xs transition cursor-pointer" title="صرف سلفة">
              <i data-lucide="hand-coins" class="w-3.5 h-3.5"></i>
              <span>صرف سلفة</span>
            </button>

            <button type="button" onclick="window.employeesController.setSubView('ledger', { employeeId: ${emp.id} })" class="py-2 px-1 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 font-bold text-[11px] flex items-center justify-center gap-1 border border-indigo-200 dark:border-indigo-800 transition cursor-pointer" title="كشف حساب العامل">
              <i data-lucide="receipt-text" class="w-3.5 h-3.5"></i>
              <span>كشف حساب</span>
            </button>
          </div>
        </div>
      `;
    }).join('');

    if (window.lucide) window.lucide.createIcons();
  }

  getRoleBadgeColor(role = '') {
    const r = (role || '').trim();
    if (r.includes('كاشير')) {
      return { bg: 'bg-indigo-100 dark:bg-indigo-900/60', text: 'text-indigo-600 dark:text-indigo-400', badge: 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300' };
    }
    if (r.includes('دليفري') || r.includes('طيار')) {
      return { bg: 'bg-emerald-100 dark:bg-emerald-900/60', text: 'text-emerald-600 dark:text-emerald-400', badge: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300' };
    }
    if (r.includes('جبن') || r.includes('ألبان')) {
      return { bg: 'bg-amber-100 dark:bg-amber-900/60', text: 'text-amber-600 dark:text-amber-400', badge: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300' };
    }
    if (r.includes('مخزن') || r.includes('جرد')) {
      return { bg: 'bg-purple-100 dark:bg-purple-900/60', text: 'text-purple-600 dark:text-purple-400', badge: 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300' };
    }
    return { bg: 'bg-sky-100 dark:bg-sky-900/60', text: 'text-sky-600 dark:text-sky-400', badge: 'bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300' };
  }

  /**
   * عرض جدول حركات الصرف الأخيرة
   */
  renderRecentPayouts() {
    const tbody = document.getElementById('emp-payouts-table-body');
    if (!tbody) return;

    if (this.recentPayouts.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="p-6 text-center text-xs text-gray-400 font-medium">
            لا توجد حركات صرف رواتب أو سلف مسجلة لهذا الشهر حتى الآن.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = this.recentPayouts.map(p => {
      let badge = 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';
      if (p.type === 'سلفة') badge = 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400';
      if (p.type === 'راتب شهري') badge = 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400';
      if (p.type === 'مكافأة') badge = 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-400';

      return `
        <tr class="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50/50 dark:hover:bg-gray-700/30 text-xs">
          <td class="py-2.5 px-4 font-mono text-gray-500">${p.date || ''}</td>
          <td class="py-2.5 px-4 font-bold text-gray-900 dark:text-white">${p.employee_name || 'موظف'}</td>
          <td class="py-2.5 px-4">
            <span class="px-2 py-0.5 rounded-lg text-[10px] font-bold ${badge}">${p.type || 'صرف'}</span>
          </td>
          <td class="py-2.5 px-4 font-black font-mono text-gray-900 dark:text-white" dir="ltr">
            ${parseFloat(p.amount || 0).toFixed(2)} ج.م
          </td>
          <td class="py-2.5 px-4 text-gray-500">${p.payment_method || 'كاش'}</td>
          <td class="py-2.5 px-4 text-gray-400">${p.notes || '-'}</td>
        </tr>
      `;
    }).join('');
  }

  /* ==================== SUBVIEW: ADD / EDIT EMPLOYEE ==================== */

  resetAddForm() {
    const titleEl = document.getElementById('emp-form-title');
    if (titleEl) titleEl.innerHTML = `<i data-lucide="user-plus" class="w-5 h-5 text-indigo-600"></i><span>تسجيل عامل / موظف جديد ➕</span>`;
    
    const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
    setVal('emp-form-id', '');
    setVal('emp-form-name', '');
    setVal('emp-form-phone', '');
    setVal('emp-form-role', 'بائع أجبان وألبان');
    setVal('emp-form-salary-type', 'monthly');
    setVal('emp-form-base-salary', '5000');
    setVal('emp-form-hire-date', new Date().toISOString().slice(0, 10));
    setVal('emp-form-notes', '');
    
    const actEl = document.getElementById('emp-form-active');
    if (actEl) actEl.checked = true;

    setTimeout(() => document.getElementById('emp-form-name')?.focus(), 100);
    if (window.lucide) window.lucide.createIcons();
  }

  populateEditForm(data) {
    let emp = null;
    if (typeof data === 'object' && data !== null) {
      emp = data;
    } else {
      emp = this.employees.find(e => e.id == data);
    }
    if (!emp) {
      window.app?.showToast('لم يتم العثور على بيانات العامل المحدد!', 'error');
      return;
    }

    const titleEl = document.getElementById('emp-form-title');
    if (titleEl) titleEl.innerHTML = `<i data-lucide="edit-3" class="w-5 h-5 text-indigo-600"></i><span>تعديل بيانات العامل: ${emp.name} ✏️</span>`;

    const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
    setVal('emp-form-id', emp.id);
    setVal('emp-form-name', emp.name || '');
    setVal('emp-form-phone', emp.phone || '');
    setVal('emp-form-role', emp.role || 'عامل');
    setVal('emp-form-salary-type', emp.salary_type || 'monthly');
    setVal('emp-form-base-salary', emp.base_salary || 0);
    setVal('emp-form-hire-date', emp.hire_date || new Date().toISOString().slice(0, 10));
    setVal('emp-form-notes', emp.notes || '');

    const actEl = document.getElementById('emp-form-active');
    if (actEl) actEl.checked = emp.is_active != 0;

    setTimeout(() => document.getElementById('emp-form-name')?.focus(), 100);
    if (window.lucide) window.lucide.createIcons();
  }

  async saveEmployee() {
    const nameEl = document.getElementById('emp-form-name');
    const name = nameEl?.value.trim();

    if (!name) {
      window.app?.showToast('يرجى إدخال اسم العامل / الموظف!', 'warning');
      nameEl?.focus();
      return;
    }

    const payload = {
      id: document.getElementById('emp-form-id')?.value || undefined,
      name: name,
      phone: document.getElementById('emp-form-phone')?.value.trim(),
      role: document.getElementById('emp-form-role')?.value,
      salary_type: document.getElementById('emp-form-salary-type')?.value,
      base_salary: parseFloat(document.getElementById('emp-form-base-salary')?.value || 0),
      hire_date: document.getElementById('emp-form-hire-date')?.value,
      is_active: document.getElementById('emp-form-active')?.checked ? 1 : 0,
      notes: document.getElementById('emp-form-notes')?.value.trim()
    };

    try {
      window.app?.showLoading(true, 'جاري حفظ بيانات العامل...');
      const res = await window.api.syncEmployee(payload);
      window.app?.showLoading(false);

      if (res && res.success) {
        window.app?.showToast(res.message || 'تم حفظ بيانات العامل بنجاح ✅', 'success');
        await this.loadEmployees();
        this.setSubView('list');
      } else {
        throw new Error(res?.error || 'فشل حفظ بيانات العامل');
      }
    } catch (err) {
      window.app?.showLoading(false);
      console.error('Error saving employee:', err);
      window.app?.showToast(`خطأ في الحفظ: ${err.message}`, 'error');
    }
  }

  async deleteEmployee(id, name) {
    if (!confirm(`هل أنت متأكد من رغبتك في حذف أو إيقاف العامل (${name})؟`)) return;

    try {
      window.app?.showLoading(true, 'جاري الحذف...');
      const res = await window.api.deleteEmployee(id, name);
      window.app?.showLoading(false);

      if (res && res.success) {
        window.app?.showToast(res.message || 'تم حذف العامل بنجاح 🗑️', 'info');
        await this.loadEmployees();
      } else {
        throw new Error(res?.error || 'فشل الحذف');
      }
    } catch (err) {
      window.app?.showLoading(false);
      window.app?.showToast(`خطأ أثناء الحذف: ${err.message}`, 'error');
    }
  }

  /* ==================== SUBVIEW: SALARY & ADVANCE PAYOUT ==================== */

  updateDropdowns() {
    const payoutSelect = document.getElementById('emp-payout-select');
    const ledgerSelect = document.getElementById('emp-ledger-select');

    const optionsHtml = (this.employees || []).map(e => `
      <option value="${e.id}">
        ${e.name} (${e.role || 'عامل'})${e.is_active == 0 ? ' [متوقف]' : ''} - متبقي: ${(parseFloat(e.net_remaining_salary !== undefined ? e.net_remaining_salary : (parseFloat(e.base_salary || 0) - parseFloat(e.advances_this_month || 0)))).toFixed(0)} ج.م
      </option>
    `).join('');

    if (payoutSelect) payoutSelect.innerHTML = optionsHtml;
    if (ledgerSelect) ledgerSelect.innerHTML = optionsHtml;
  }

  setupPayoutForm(data = null) {
    this.updateDropdowns();

    let empId = data?.employeeId || null;
    let payoutType = data?.type || 'سلفة';

    if (!empId && this.employees.length > 0) {
      const firstActive = this.employees.find(e => e.is_active != 0);
      empId = firstActive ? firstActive.id : this.employees[0].id;
    }

    const selectEl = document.getElementById('emp-payout-select');
    if (selectEl && empId) selectEl.value = empId;

    const typeEl = document.getElementById('emp-payout-type');
    if (typeEl) typeEl.value = payoutType;

    const dateEl = document.getElementById('emp-payout-date');
    if (dateEl) dateEl.value = new Date().toISOString().slice(0, 10);

    const monthEl = document.getElementById('emp-payout-month');
    if (monthEl) monthEl.value = this.currentMonth || new Date().toISOString().slice(0, 7);

    this.onPayoutEmployeeChange();
    this.onPayoutTypeChange();

    setTimeout(() => document.getElementById('emp-payout-amount')?.focus(), 100);
  }

  onPayoutEmployeeChange() {
    const empId = document.getElementById('emp-payout-select')?.value;
    const emp = (this.employees || []).find(e => e.id == empId);
    const badgeEl = document.getElementById('emp-payout-worker-badge');
    const amtEl = document.getElementById('emp-payout-amount');

    if (!emp || !badgeEl) return;

    const base = parseFloat(emp.base_salary || 0);
    const advances = parseFloat(emp.advances_this_month || 0);
    const remaining = parseFloat(emp.net_remaining_salary !== undefined ? emp.net_remaining_salary : (base - advances));

    badgeEl.innerHTML = `
      <div class="flex items-center justify-between gap-3">
        <span class="font-bold text-gray-800 dark:text-gray-200">الراتب الأساسي: <strong class="font-mono text-indigo-600 dark:text-indigo-400">${base.toFixed(0)} ج.م</strong></span>
        <span class="font-bold text-rose-500">سلف الشهر: <strong class="font-mono">${advances.toFixed(0)} ج.م</strong></span>
        <span class="font-bold text-emerald-600 dark:text-emerald-400">الصافي المتبقي: <strong class="font-mono">${Math.max(0, remaining).toFixed(0)} ج.م</strong></span>
      </div>
    `;

    const type = document.getElementById('emp-payout-type')?.value;
    if (type === 'راتب شهري' && amtEl) {
      amtEl.value = Math.max(0, remaining).toFixed(2);
    }
  }

  onPayoutTypeChange() {
    const typeEl = document.getElementById('emp-payout-type');
    const type = typeEl?.value || 'سلفة';
    const empId = document.getElementById('emp-payout-select')?.value;
    const emp = (this.employees || []).find(e => e.id == empId);
    const amtEl = document.getElementById('emp-payout-amount');
    const notesEl = document.getElementById('emp-payout-notes');

    if (type === 'راتب شهري') {
      if (emp && amtEl) {
        const base = parseFloat(emp.base_salary || 0);
        const advances = parseFloat(emp.advances_this_month || 0);
        const remaining = parseFloat(emp.net_remaining_salary !== undefined ? emp.net_remaining_salary : (base - advances));
        amtEl.value = Math.max(0, remaining).toFixed(2);
      }
      if (notesEl && (!notesEl.value || notesEl.value === 'سلفة من الراتب')) {
        notesEl.value = 'صرف راتب شهري';
      }
    } else if (type === 'سلفة') {
      if (amtEl) amtEl.value = '';
      if (notesEl && (!notesEl.value || notesEl.value === 'صرف راتب شهري')) {
        notesEl.value = 'سلفة من الراتب';
      }
    }
  }

  setFullRemainingPayoutAmount() {
    const empId = document.getElementById('emp-payout-select')?.value;
    const emp = (this.employees || []).find(e => e.id == empId);
    const amtEl = document.getElementById('emp-payout-amount');
    if (!emp || !amtEl) return;
    const base = parseFloat(emp.base_salary || 0);
    const advances = parseFloat(emp.advances_this_month || 0);
    const remaining = parseFloat(emp.net_remaining_salary !== undefined ? emp.net_remaining_salary : (base - advances));
    amtEl.value = Math.max(0, remaining).toFixed(2);
    amtEl.focus();
    window.app?.showToast(`تم ضبط المبلغ على الصافي المتبقي (${amtEl.value} ج.م)`, 'info');
  }

  async saveSalaryPayout() {
    const empId = parseInt(document.getElementById('emp-payout-select')?.value || 0, 10);
    const emp = (this.employees || []).find(e => e.id == empId);
    const amount = parseFloat(document.getElementById('emp-payout-amount')?.value || 0);

    if (!empId || !emp) {
      window.app?.showToast('يرجى اختيار العامل لصرف المستحقات!', 'warning');
      return;
    }

    if (!amount || amount <= 0) {
      window.app?.showToast('يرجى إدخال مبلغ صحيح للصرف أكبر من الصفر!', 'warning');
      document.getElementById('emp-payout-amount')?.focus();
      return;
    }

    const payload = {
      employee_id: emp.id,
      employee_name: emp.name,
      type: document.getElementById('emp-payout-type')?.value || 'سلفة',
      amount: amount,
      payment_method: document.getElementById('emp-payout-method')?.value || 'كاش من الدرج',
      date: document.getElementById('emp-payout-date')?.value || new Date().toISOString().slice(0, 10),
      month_year: document.getElementById('emp-payout-month')?.value || this.currentMonth,
      notes: document.getElementById('emp-payout-notes')?.value.trim() || '',
      cashier_name: window.app?.currentUser?.name || 'كاشير المحل'
    };

    try {
      window.app?.showLoading(true, 'جاري تسجيل حركة الصرف وخصمها من الخزينة...');
      const res = await window.api.recordSalaryPayout(payload);
      window.app?.showLoading(false);

      if (res && res.success) {
        window.app?.showToast(res.message || 'تم تسجيل الصرف وخصم المبلغ من الخزينة بنجاح 💵', 'success');
        await this.loadEmployees();
        await this.loadRecentPayouts();
        this.setSubView('list');
      } else {
        throw new Error(res?.error || 'فشل تسجيل الصرف');
      }
    } catch (err) {
      window.app?.showLoading(false);
      console.error('Error saving salary payout:', err);
      window.app?.showToast(`خطأ في تسجيل الصرف: ${err.message}`, 'error');
    }
  }

  /* ==================== SUBVIEW: WORKER LEDGER (STATEMENT) ==================== */

  setupLedgerView(empId) {
    this.updateDropdowns();
    if (!empId && this.employees.length > 0) empId = this.employees[0].id;
    const selectEl = document.getElementById('emp-ledger-select');
    if (selectEl && empId) selectEl.value = empId;
    this.loadEmployeeLedger(empId);
  }

  async loadEmployeeLedger(empId = null, monthYear = '') {
    if (!empId) {
      empId = document.getElementById('emp-ledger-select')?.value;
    }
    if (!empId) return;

    this.activeLedgerEmpId = empId;
    const monthFilter = monthYear || document.getElementById('emp-ledger-month-filter')?.value || '';

    try {
      window.app?.showLoading(true, 'جاري جلب كشف حساب العامل...');
      const res = await window.api.getEmployeeLedger(empId, monthFilter);
      window.app?.showLoading(false);

      if (res && res.success) {
        this.currentLedgerData = res;
        this.renderEmployeeLedger(res);
      } else {
        throw new Error(res?.error || 'فشل جلب كشف الحساب');
      }
    } catch (err) {
      window.app?.showLoading(false);
      console.error('Error loading employee ledger:', err);
      window.app?.showToast(`تعذر جلب كشف حساب العامل: ${err.message}`, 'error');
    }
  }

  renderEmployeeLedger(res) {
    const emp = res.employee || {};
    const summary = res.summary || {};
    const transactions = res.transactions || [];

    const nameEl = document.getElementById('emp-ledger-emp-name');
    const roleEl = document.getElementById('emp-ledger-emp-role');
    const phoneEl = document.getElementById('emp-ledger-emp-phone');

    if (nameEl) nameEl.textContent = emp.name || 'العامل';
    if (roleEl) roleEl.textContent = emp.role || 'عامل';
    if (phoneEl) phoneEl.textContent = emp.phone ? `هاتف: ${emp.phone}` : 'بدون هاتف';

    const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setTxt('emp-ledger-base-salary', `${parseFloat(summary.base_salary || emp.base_salary || 0).toFixed(2)} ج.م`);
    setTxt('emp-ledger-total-advances', `${parseFloat(summary.total_advances || 0).toFixed(2)} ج.م`);
    setTxt('emp-ledger-total-paid', `${parseFloat(summary.total_paid_salary || 0).toFixed(2)} ج.م`);
    setTxt('emp-ledger-net-remaining', `${parseFloat(summary.net_remaining !== undefined ? summary.net_remaining : 0).toFixed(2)} ج.م`);

    const tbody = document.getElementById('emp-ledger-table-body');
    if (!tbody) return;

    if (transactions.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" class="py-8 text-center text-gray-400 font-bold text-xs">
            لا توجد حركات مسجلة لهذا العامل في الفترة المحددة.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = transactions.map(t => {
      let badge = 'bg-gray-100 text-gray-700';
      if (t.type === 'سلفة') badge = 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400 font-bold';
      if (t.type === 'راتب شهري') badge = 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 font-bold';

      return `
        <tr class="border-b border-gray-100 dark:border-gray-800 text-xs hover:bg-gray-50/50">
          <td class="py-2.5 px-4 font-mono text-gray-500">${t.date || ''}</td>
          <td class="py-2.5 px-4"><span class="px-2 py-0.5 rounded-lg text-[10px] ${badge}">${t.type}</span></td>
          <td class="py-2.5 px-4 font-black font-mono" dir="ltr">${parseFloat(t.amount || 0).toFixed(2)} ج.م</td>
          <td class="py-2.5 px-4 text-gray-500">${t.payment_method || 'كاش'}</td>
          <td class="py-2.5 px-4 text-gray-400">${t.notes || '-'}</td>
        </tr>
      `;
    }).join('');
  }

  printLedger() {
    if (!this.currentLedgerData || !this.currentLedgerData.employee) {
      window.app?.showToast('لا توجد بيانات كشف حساب متاحة للطباعة', 'warning');
      return;
    }

    const emp = this.currentLedgerData.employee;
    const summary = this.currentLedgerData.summary || {};
    const txs = this.currentLedgerData.transactions || [];

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      window.app?.showToast('يرجى السماح بفتح النوافذ المنبثقة للطباعة', 'warning');
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="utf-8">
        <title>كشف حساب مستحقات: ${emp.name}</title>
        <style>
          body { font-family: system-ui, -apple-system, sans-serif; padding: 24px; color: #111; }
          .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 12px; margin-bottom: 16px; }
          .title { font-size: 20px; font-weight: bold; }
          .sub { font-size: 13px; color: #555; margin-top: 4px; }
          .summary-box { display: flex; justify-content: space-between; background: #f4f4f5; padding: 12px; border-radius: 8px; margin-bottom: 16px; font-size: 13px; }
          table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 12px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: right; }
          th { background: #f0f0f0; font-weight: bold; }
          .print-btn { display: none; }
          @media print { .no-print { display: none; } }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="title">سوبرماركت البيت السوري</div>
          <div class="sub">كشف حساب مستحقات ورواتب العامل: <strong>${emp.name}</strong> (${emp.role || 'عامل'})</div>
          <div class="sub">تاريخ الطباعة: ${new Date().toLocaleString('ar-EG')}</div>
        </div>

        <div class="summary-box">
          <div>الراتب الأساسي: <strong>${parseFloat(emp.base_salary || 0).toFixed(2)} ج.م</strong></div>
          <div>إجمالي السلف: <strong>${parseFloat(summary.total_advances || 0).toFixed(2)} ج.م</strong></div>
          <div>الصافي المتبقي: <strong>${parseFloat(summary.net_remaining !== undefined ? summary.net_remaining : 0).toFixed(2)} ج.م</strong></div>
        </div>

        <table>
          <thead>
            <tr>
              <th>التاريخ</th>
              <th>نوع الحركة</th>
              <th>المبلغ</th>
              <th>طريقة الدفع</th>
              <th>البيان والملاحظات</th>
            </tr>
          </thead>
          <tbody>
            ${txs.map(t => `
              <tr>
                <td>${t.date}</td>
                <td>${t.type}</td>
                <td dir="ltr">${parseFloat(t.amount || 0).toFixed(2)} ج.م</td>
                <td>${t.payment_method || 'كاش'}</td>
                <td>${t.notes || '-'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <script>
          window.onload = function() { window.print(); }
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  }

  /* ==================== BACKWARD COMPATIBILITY ALIASES ==================== */

  openAddModal() {
    this.setSubView('form', null);
  }

  openEditModal(id) {
    this.setSubView('form', id);
  }

  openPayoutModal(employeeId = null, defaultType = 'سلفة') {
    this.setSubView('payout', { employeeId, type: defaultType });
  }

  openSalaryModal(employeeId = null) {
    this.setSubView('payout', { employeeId, type: 'راتب شهري' });
  }

  openAdvanceModal(employeeId = null) {
    this.setSubView('payout', { employeeId, type: 'سلفة' });
  }

  openLedgerModal(employeeId = null) {
    this.setSubView('ledger', { employeeId });
  }

  closeEmployeeModal() {
    this.setSubView('list');
  }

  closePayoutModal() {
    this.setSubView('list');
  }

  closeLedgerModal() {
    this.setSubView('list');
  }
}

// إنشاء النسخة العامة من المتحكم
window.employeesController = new EmployeesController();
