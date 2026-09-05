/**
 * Syrian Home POS - Employees & Payroll Controller
 * إدارة شؤون العمال والموظفين، الرواتب، السلف، وكشوف الحسابات المالية
 */
class EmployeesController {
  constructor() {
    this.employees = [];
    this.recentPayouts = [];
    this.currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
    this.searchQuery = '';
    this.statusFilter = 'all'; // all, active, inactive
    this.currentLedgerData = null;
  }

  init() {
    this.currentMonth = new Date().toISOString().slice(0, 7);
    const monthInput = document.getElementById('emp-month-filter');
    if (monthInput && !monthInput.value) {
      monthInput.value = this.currentMonth;
    }
    this.loadEmployees();
    this.loadRecentPayouts();
  }

  /**
   * Load employees list and summary from cloud API
   */
  async loadEmployees() {
    const listContainer = document.getElementById('employees-grid');
    if (!listContainer) return;

    try {
      window.app?.showLoading(true, 'جاري تحميل بيانات العمال والرواتب...');
      const res = await window.api.getEmployees(false);
      window.app?.showLoading(false);

      if (res && res.success && Array.isArray(res.employees)) {
        this.employees = res.employees;
        if (res.current_month) this.currentMonth = res.current_month;
        this.renderKPIs();
        this.renderEmployeesList();
      } else {
        throw new Error(res?.error || 'فشل جلب بيانات العمال');
      }
    } catch (err) {
      window.app?.showLoading(false);
      console.error('Error loading employees:', err);
      listContainer.innerHTML = `
        <div class="col-span-full p-8 text-center bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900 rounded-3xl">
          <i data-lucide="alert-circle" class="w-8 h-8 text-rose-500 mx-auto mb-2"></i>
          <p class="text-xs font-bold text-rose-600 dark:text-rose-400">تعذر الاتصال بالسيرفر لجلب بيانات العمال: ${err.message}</p>
          <button onclick="window.employeesController.loadEmployees()" class="mt-3 px-4 py-2 bg-rose-600 text-white rounded-xl text-xs font-bold hover:bg-rose-700 transition">
            إعادة المحاولة 🔄
          </button>
        </div>
      `;
      if (window.lucide) window.lucide.createIcons();
    }
  }

  /**
   * Load general salary & advance payouts log for the month
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
   * Update top KPI summary cards
   */
  renderKPIs() {
    const activeEmployees = this.employees.filter(e => e.is_active != 0);
    const totalBaseSalary = activeEmployees.reduce((sum, e) => sum + parseFloat(e.base_salary || 0), 0);
    const totalAdvances = this.employees.reduce((sum, e) => sum + parseFloat(e.advances_this_month || 0), 0);
    const totalRemaining = this.employees.reduce((sum, e) => sum + parseFloat(e.net_remaining_salary || 0), 0);

    const elCount = document.getElementById('kpi-emp-count');
    const elSalary = document.getElementById('kpi-emp-total-salary');
    const elAdvances = document.getElementById('kpi-emp-total-advances');
    const elRemaining = document.getElementById('kpi-emp-total-remaining');

    if (elCount) elCount.textContent = activeEmployees.length;
    if (elSalary) elSalary.textContent = `${totalBaseSalary.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;
    if (elAdvances) elAdvances.textContent = `${totalAdvances.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;
    if (elRemaining) elRemaining.textContent = `${totalRemaining.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;
  }

  /**
   * Filter and render employees cards grid
   */
  renderEmployeesList() {
    const container = document.getElementById('employees-grid');
    if (!container) return;

    const query = this.searchQuery.trim().toLowerCase();
    const filtered = this.employees.filter(emp => {
      // Status filter
      if (this.statusFilter === 'active' && emp.is_active == 0) return false;
      if (this.statusFilter === 'inactive' && emp.is_active != 0) return false;

      // Search query
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
        <div class="col-span-full p-12 text-center bg-gray-50 dark:bg-gray-800/50 rounded-3xl border border-dashed border-gray-200 dark:border-gray-700">
          <div class="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-500 mx-auto flex items-center justify-center mb-3">
            <i data-lucide="users" class="w-7 h-7"></i>
          </div>
          <h4 class="text-sm font-bold text-gray-800 dark:text-gray-200">لا يوجد عمال مطابقين للبحث</h4>
          <p class="text-xs text-gray-400 mt-1">يمكنك إضافة عامل جديد بالضغط على زر "إضافة عامل جديد" بالأعلى</p>
          <button onclick="window.employeesController.openAddModal()" class="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 mx-auto shadow-sm">
            <i data-lucide="plus" class="w-4 h-4"></i>
            <span>إضافة عامل جديد</span>
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

      // Color scheme based on role
      const roleColor = this.getRoleBadgeColor(emp.role);

      return `
        <div class="bg-white dark:bg-gray-800 rounded-3xl p-5 border border-gray-200/80 dark:border-gray-700 shadow-xs hover:shadow-md transition flex flex-col justify-between gap-4 relative overflow-hidden group">
          <!-- Top Active Status Accent -->
          <div class="absolute top-0 right-0 left-0 h-1.5 ${isActive ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-600'}"></div>

          <!-- Header: Name, Role, Status -->
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

            <!-- More Actions / Edit / Delete -->
            <div class="flex items-center gap-1">
              <button onclick="window.employeesController.openEditModal(${emp.id})" class="w-8 h-8 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 flex items-center justify-center transition" title="تعديل بيانات العامل">
                <i data-lucide="edit-2" class="w-3.5 h-3.5"></i>
              </button>
              <button onclick="window.employeesController.deleteEmployee(${emp.id}, '${emp.name}')" class="w-8 h-8 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/60 flex items-center justify-center transition" title="حذف العامل">
                <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
              </button>
            </div>
          </div>

          <!-- Financial Breakdown Box -->
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

          <!-- Bottom Action Buttons -->
          <div class="grid grid-cols-2 gap-2 pt-1">
            <button onclick="window.employeesController.openPayoutModal(${emp.id}, 'سلفة')" class="py-2 px-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-2xs transition">
              <i data-lucide="hand-coins" class="w-3.5 h-3.5"></i>
              <span>صرف سلفة</span>
            </button>

            <button onclick="window.employeesController.openLedgerModal(${emp.id})" class="py-2 px-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 font-bold text-xs flex items-center justify-center gap-1.5 border border-indigo-200 dark:border-indigo-800 transition">
              <i data-lucide="receipt-text" class="w-3.5 h-3.5"></i>
              <span>كشف حساب 📜</span>
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
   * Render recent salary & advance payouts table
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
      const typeBadge = this.getPayoutTypeBadge(p.type);
      return `
        <tr class="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50/60 dark:hover:bg-gray-900/30 transition text-xs">
          <td class="py-3 px-4 font-mono text-gray-500">${p.date || p.created_at?.slice(0, 10)}</td>
          <td class="py-3 px-4 font-bold text-gray-900 dark:text-white">${p.employee_name}</td>
          <td class="py-3 px-4">
            <span class="px-2 py-0.5 rounded-lg text-[10px] font-bold ${typeBadge}">
              ${p.type}
            </span>
          </td>
          <td class="py-3 px-4 font-black font-mono text-indigo-600 dark:text-indigo-400">${parseFloat(p.amount || 0).toFixed(2)} ج.م</td>
          <td class="py-3 px-4 text-gray-500">${p.payment_method || 'كاش من الدرج'}</td>
          <td class="py-3 px-4 text-gray-400 truncate max-w-xs">${p.notes || '-'}</td>
        </tr>
      `;
    }).join('');
  }

  getPayoutTypeBadge(type = '') {
    switch (type) {
      case 'سلفة':
        return 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300';
      case 'راتب شهري':
        return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300';
      case 'مكافأة':
        return 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300';
      case 'خصم':
        return 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300';
      case 'يومية':
        return 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300';
      default:
        return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
    }
  }

  /* ==================== ADD / EDIT EMPLOYEE MODAL ==================== */
  /* ==================== ADD / EDIT EMPLOYEE MODAL ==================== */
  openAddModal() {
    try {
      const modal = document.getElementById('employee-modal');
      if (!modal) {
        alert('تعذر فتح نافذة العامل: العنصر غير موجود!');
        return;
      }
      const titleEl = document.getElementById('emp-modal-title');
      if (titleEl) titleEl.textContent = '➕ إضافة عامل جديد';
      const idEl = document.getElementById('emp-id'); if (idEl) idEl.value = '';
      const nameEl = document.getElementById('emp-name'); if (nameEl) nameEl.value = '';
      const phoneEl = document.getElementById('emp-phone'); if (phoneEl) phoneEl.value = '';
      const roleEl = document.getElementById('emp-role'); if (roleEl) roleEl.value = 'بائع أجبان وألبان';
      const stEl = document.getElementById('emp-salary-type'); if (stEl) stEl.value = 'monthly';
      const salEl = document.getElementById('emp-base-salary'); if (salEl) salEl.value = '5000';
      const hireEl = document.getElementById('emp-hire-date'); if (hireEl) hireEl.value = new Date().toISOString().slice(0, 10);
      const notesEl = document.getElementById('emp-notes'); if (notesEl) notesEl.value = '';
      const actEl = document.getElementById('emp-active'); if (actEl) actEl.checked = true;

      modal.classList.remove('hidden');
      modal.style.display = 'flex';
      setTimeout(() => nameEl?.focus(), 50);
    } catch (e) {
      console.error('Error opening add employee modal:', e);
      alert('خطأ في فتح نافذة العامل: ' + e.message);
    }
  }

  openEditModal(id) {
    try {
      const emp = this.employees.find(e => e.id == id);
      if (!emp) {
        window.app?.showToast('لم يتم العثور على بيانات العامل المحدد!', 'error');
        return;
      }

      const modal = document.getElementById('employee-modal');
      if (!modal) return;

      const titleEl = document.getElementById('emp-modal-title');
      if (titleEl) titleEl.textContent = '✏️ تعديل بيانات العامل';
      const idEl = document.getElementById('emp-id'); if (idEl) idEl.value = emp.id;
      const nameEl = document.getElementById('emp-name'); if (nameEl) nameEl.value = emp.name || '';
      const phoneEl = document.getElementById('emp-phone'); if (phoneEl) phoneEl.value = emp.phone || '';
      const roleEl = document.getElementById('emp-role'); if (roleEl) roleEl.value = emp.role || 'عامل';
      const stEl = document.getElementById('emp-salary-type'); if (stEl) stEl.value = emp.salary_type || 'monthly';
      const salEl = document.getElementById('emp-base-salary'); if (salEl) salEl.value = emp.base_salary || 0;
      const hireEl = document.getElementById('emp-hire-date'); if (hireEl) hireEl.value = emp.hire_date || new Date().toISOString().slice(0, 10);
      const notesEl = document.getElementById('emp-notes'); if (notesEl) notesEl.value = emp.notes || '';
      const actEl = document.getElementById('emp-active'); if (actEl) actEl.checked = emp.is_active != 0;

      modal.classList.remove('hidden');
      modal.style.display = 'flex';
    } catch (e) {
      console.error('Error opening edit employee modal:', e);
    }
  }

  closeEmployeeModal() {
    const modal = document.getElementById('employee-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.style.display = 'none';
    }
  }

  async saveEmployee() {
    const id = document.getElementById('emp-id')?.value;
    const name = document.getElementById('emp-name')?.value.trim();
    const phone = document.getElementById('emp-phone')?.value.trim();
    const role = document.getElementById('emp-role')?.value.trim() || 'عامل';
    const salaryType = document.getElementById('emp-salary-type')?.value || 'monthly';
    const baseSalary = parseFloat(document.getElementById('emp-base-salary')?.value || 0) || 0;
    const hireDate = document.getElementById('emp-hire-date')?.value || new Date().toISOString().slice(0, 10);
    const notes = document.getElementById('emp-notes')?.value.trim();
    const isActive = document.getElementById('emp-active')?.checked ? 1 : 0;

    if (!name) {
      const msg = 'يرجى إدخال اسم العامل!';
      window.app?.showToast(msg, 'warning');
      alert(msg);
      document.getElementById('emp-name')?.focus();
      return;
    }

    const payload = {
      name: name,
      phone: phone,
      role: role,
      salary_type: salaryType,
      base_salary: baseSalary,
      hire_date: hireDate,
      notes: notes,
      is_active: isActive
    };
    if (id) payload.id = parseInt(id, 10);

    try {
      window.app?.showLoading(true, 'جاري حفظ بيانات العامل...');
      const res = await window.api.syncEmployee(payload);
      window.app?.showLoading(false);

      if (res && res.success) {
        try { window.posScanner?.playSuccessBeep?.(); } catch(e) {}
        window.app?.showToast(res.message || 'تم حفظ بيانات العامل بنجاح ✅', 'success');
        this.closeEmployeeModal();
        await this.loadEmployees();
      } else {
        throw new Error(res?.error || 'فشل حفظ العامل');
      }
    } catch (err) {
      window.app?.showLoading(false);
      const errMsg = `خطأ في الحفظ: ${err.message || err}`;
      console.error(errMsg);
      window.app?.showToast(errMsg, 'error');
      alert(errMsg);
    }
  }

  async deleteEmployee(id, name) {
    if (!confirm(`هل أنت متأكد من حذف أو تعطيل العامل (${name})؟`)) return;

    try {
      window.app?.showLoading(true, 'جاري الحذف...');
      const res = await window.api.deleteEmployee(id, name);
      window.app?.showLoading(false);

      if (res && res.success) {
        window.app?.showToast(res.message || 'تم حذف العامل بنجاح 🗑️', 'info');
        this.loadEmployees();
      } else {
        throw new Error(res?.error || 'فشل الحذف');
      }
    } catch (err) {
      window.app?.showLoading(false);
      window.app?.showToast(`خطأ أثناء الحذف: ${err.message}`, 'error');
    }
  }

  /* ==================== SALARY & ADVANCE PAYOUT MODAL ==================== */
  async openPayoutModal(employeeId = null, defaultType = 'سلفة') {
    try {
      const modal = document.getElementById('salary-payout-modal');
      if (!modal) {
        alert('تعذر فتح نافذة الصرف: العنصر غير موجود!');
        return;
      }

      // Auto-load employees if not loaded yet
      if (!this.employees || this.employees.length === 0) {
        window.app?.showLoading(true, 'جاري جلب قائمة العمال...');
        await this.loadEmployees();
        window.app?.showLoading(false);
      }

      const select = document.getElementById('payout-employee-id');
      if (!select) return;

      if (!this.employees || this.employees.length === 0) {
        const msg = 'لا يوجد عمال مسجلون حالياً. يرجى إضافة عامل أولاً!';
        window.app?.showToast(msg, 'warning');
        alert(msg);
        this.openAddModal();
        return;
      }

      // Populate employees in select
      select.innerHTML = this.employees.map(e => `
        <option value="${e.id}" ${e.id == employeeId ? 'selected' : ''}>
          ${e.name} (${e.role || 'عامل'})${e.is_active == 0 ? ' [متوقف]' : ''} - متبقي: ${(parseFloat(e.net_remaining_salary !== undefined ? e.net_remaining_salary : (e.base_salary || 0))).toFixed(0)} ج.م
        </option>
      `).join('');

      const typeEl = document.getElementById('payout-type');
      if (typeEl) typeEl.value = defaultType;

      const amtEl = document.getElementById('payout-amount');
      if (amtEl) amtEl.value = '';

      const methEl = document.getElementById('payout-method');
      if (methEl) methEl.value = 'كاش من الدرج';

      const notesEl = document.getElementById('payout-notes');
      if (notesEl) notesEl.value = defaultType === 'سلفة' ? 'سلفة من الراتب' : '';

      this.onPayoutEmployeeChange();

      modal.classList.remove('hidden');
      modal.style.display = 'flex';
      setTimeout(() => amtEl?.focus(), 50);
    } catch (e) {
      console.error('Error opening payout modal:', e);
      alert('خطأ في فتح نافذة صرف الراتب / السلفة: ' + e.message);
    }
  }

  closePayoutModal() {
    const modal = document.getElementById('salary-payout-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.style.display = 'none';
    }
  }

  onPayoutEmployeeChange() {
    const empId = document.getElementById('payout-employee-id')?.value;
    const infoBox = document.getElementById('payout-emp-preview');
    if (!infoBox) return;

    const emp = this.employees.find(e => e.id == empId);
    if (!emp) {
      infoBox.classList.add('hidden');
      return;
    }

    infoBox.classList.remove('hidden');
    const base = parseFloat(emp.base_salary || 0);
    const advances = parseFloat(emp.advances_this_month || 0);
    const remaining = parseFloat(emp.net_remaining_salary !== undefined ? emp.net_remaining_salary : (base - advances));

    infoBox.innerHTML = `
      <div class="flex items-center justify-between text-xs">
        <span class="text-gray-500">الراتب الأساسي: <strong class="text-gray-800 dark:text-gray-200 font-mono">${base.toFixed(0)} ج.م</strong></span>
        <span class="text-amber-600 dark:text-amber-400 font-bold">سلف الشهر: <strong class="font-mono">${advances.toFixed(0)} ج.م</strong></span>
        <span class="text-emerald-600 dark:text-emerald-400 font-bold">المتبقي: <strong class="font-mono">${remaining.toFixed(0)} ج.م</strong></span>
      </div>
    `;
  }

  async saveSalaryPayout() {
    const empId = document.getElementById('payout-employee-id')?.value;
    const type = document.getElementById('payout-type')?.value;
    const amount = parseFloat(document.getElementById('payout-amount')?.value || 0);
    const method = document.getElementById('payout-method')?.value;
    const notes = document.getElementById('payout-notes')?.value.trim();

    if (!empId) {
      const msg = 'يرجى اختيار العامل للصرف!';
      window.app?.showToast(msg, 'warning');
      alert(msg);
      return;
    }

    if (!amount || amount <= 0) {
      const msg = 'يرجى إدخال مبلغ صحيح للصرف أكبر من الصفر!';
      window.app?.showToast(msg, 'warning');
      alert(msg);
      document.getElementById('payout-amount')?.focus();
      return;
    }

    const emp = this.employees.find(e => e.id == empId);
    const empName = emp ? emp.name : '';

    const payload = {
      employee_id: parseInt(empId),
      employee_name: empName,
      type: type,
      amount: amount,
      payment_method: method,
      notes: notes,
      cashier_name: window.app?.currentCashier || 'كاشير المحل'
    };

    try {
      window.app?.showLoading(true, `جاري تسجيل صرف ${type}...`);
      const res = await window.api.recordSalaryPayout(payload);
      window.app?.showLoading(false);

      if (res && res.success) {
        try { window.posScanner?.playSuccessBeep?.(); } catch(e) {}
        const successMsg = res.message || `تم تسجيل صرف ${type} بقيمة ${amount.toFixed(2)} ج.م بنجاح 💸`;
        window.app?.showToast(successMsg, 'success');
        this.closePayoutModal();
        this.loadEmployees();
        this.loadRecentPayouts();

        // Refresh cash shift reports silently to reflect deducted cash
        window.reportsController?.loadReports?.('today');
      } else {
        throw new Error(res?.error || 'فشل تسجيل الصرف');
      }
    } catch (err) {
      window.app?.showLoading(false);
      const errMsg = `خطأ في تسجيل الصرف: ${err.message || err}`;
      console.error(errMsg);
      window.app?.showToast(errMsg, 'error');
      alert(errMsg);
    }
  }

  /* ==================== EMPLOYEE LEDGER (كشف حساب مالي تفصيلي) ==================== */
  async openLedgerModal(employeeId, monthYear = null) {
    const m = monthYear || this.currentMonth;
    try {
      window.app?.showLoading(true, 'جاري استخراج كشف الحساب المالي...');
      const res = await window.api.getEmployeeLedger(employeeId, m);
      window.app?.showLoading(false);

      if (res && res.success) {
        this.currentLedgerData = res;
        this.renderLedgerModal(res);
        const modal = document.getElementById('employee-ledger-modal');
        if (modal) {
          modal.classList.remove('hidden');
          modal.style.display = 'flex';
        }
      } else {
        throw new Error(res?.error || 'تعذر استخراج كشف الحساب');
      }
    } catch (err) {
      window.app?.showLoading(false);
      window.app?.showToast(`خطأ: ${err.message}`, 'error');
    }
  }

  renderLedgerModal(data) {
    const emp = data.employee || {};
    const sum = data.summary || {};
    const trans = data.transactions || [];

    document.getElementById('ledger-emp-name').textContent = emp.name || 'عامل';
    document.getElementById('ledger-emp-role').textContent = emp.role || 'عامل';
    document.getElementById('ledger-month-label').textContent = data.month_year || this.currentMonth;

    // Summary breakdown
    document.getElementById('ledger-base-salary').textContent = `${parseFloat(sum.base_salary || 0).toFixed(2)} ج.م`;
    document.getElementById('ledger-total-advances').textContent = `${parseFloat(sum.total_advances || 0).toFixed(2)} ج.م`;
    document.getElementById('ledger-total-bonuses').textContent = `${parseFloat(sum.total_bonuses || 0).toFixed(2)} ج.م`;
    document.getElementById('ledger-total-deductions').textContent = `${parseFloat(sum.total_deductions || 0).toFixed(2)} ج.م`;
    document.getElementById('ledger-total-paid').textContent = `${parseFloat(sum.total_paid_salary || 0).toFixed(2)} ج.م`;
    document.getElementById('ledger-net-remaining').textContent = `${parseFloat(sum.net_remaining_to_pay || 0).toFixed(2)} ج.م`;

    // Transactions table
    const tbody = document.getElementById('ledger-table-body');
    if (tbody) {
      if (trans.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="5" class="p-6 text-center text-xs text-gray-400 font-medium">
              لا توجد حركات سلف أو خصومات مسجلة لهذا العامل في شهر ${data.month_year}.
            </td>
          </tr>
        `;
      } else {
        tbody.innerHTML = trans.map(t => `
          <tr class="border-b border-gray-100 dark:border-gray-800 text-xs">
            <td class="py-2.5 px-3 font-mono text-gray-500">${t.date || t.created_at?.slice(0, 10)}</td>
            <td class="py-2.5 px-3">
              <span class="px-2 py-0.5 rounded-lg text-[10px] font-bold ${this.getPayoutTypeBadge(t.type)}">
                ${t.type}
              </span>
            </td>
            <td class="py-2.5 px-3 font-mono font-bold text-gray-900 dark:text-white">${parseFloat(t.amount || 0).toFixed(2)} ج.م</td>
            <td class="py-2.5 px-3 text-gray-500">${t.payment_method || 'كاش'}</td>
            <td class="py-2.5 px-3 text-gray-400 truncate max-w-[180px]">${t.notes || '-'}</td>
          </tr>
        `).join('');
      }
    }

    if (window.lucide) window.lucide.createIcons();
  }

  closeLedgerModal() {
    const modal = document.getElementById('employee-ledger-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.style.display = 'none';
    }
  }

  printLedger() {
    window.print();
  }
}

window.employeesController = new EmployeesController();
