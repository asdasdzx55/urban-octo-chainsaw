/**
 * Syrian Home Supermarket POS - Delivery Drivers Settlement Controller
 * إدارة وتقفيل حسابات وعهد طياري الدليفري وتوريد النقدية للخزينة
 */

class DeliverySettlementController {
  constructor() {
    this.drivers = [];
    this.selectedDriver = null;
    this.driverOrdersData = null;
    this.settlementHistory = [];
    this.unassignedOrders = [];
    this.assigningOrderId = null;
    this.adhocOrder = null;
    this.activeTab = 'drivers'; // 'drivers' | 'unassigned' | 'history'
  }

  async init() {
    this.loadSettlementHistory();
    await Promise.all([this.loadDrivers(), this.loadUnassignedOrders()]);
    this.renderKPIs();
    this.renderActiveTab();
  }

  async loadUnassignedOrders() {
    try {
      const res = await window.api.getUnassignedDeliveryOrders();
      if (res && res.success && Array.isArray(res.orders)) {
        this.unassignedOrders = res.orders;
      }
    } catch (e) {
      console.warn('Error loading unassigned delivery orders:', e);
      this.unassignedOrders = [];
    }
    this.updateUnassignedBadge();
  }

  updateUnassignedBadge() {
    const badge = document.getElementById('ds-unassigned-badge');
    const count = this.unassignedOrders.length;
    if (badge) {
      if (count > 0) {
        badge.textContent = count;
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    }
  }

  loadSettlementHistory() {
    try {
      this.settlementHistory = JSON.parse(localStorage.getItem('pos_delivery_settlements') || '[]');
    } catch (e) {
      this.settlementHistory = [];
    }
  }

  saveSettlementHistory() {
    try {
      localStorage.setItem('pos_delivery_settlements', JSON.stringify(this.settlementHistory));
    } catch (e) {}
  }

  async loadDrivers() {
    try {
      const result = await window.api.getDeliveryDrivers();
      if (result && result.success && Array.isArray(result.drivers)) {
        this.drivers = result.drivers;
        try {
          localStorage.setItem('pos_delivery_drivers', JSON.stringify(this.drivers));
        } catch (e) {}
      } else {
        throw new Error('فشل جلب قائمة الطيارين');
      }
    } catch (err) {
      console.warn('Fallback to local delivery drivers:', err);
      try {
        this.drivers = JSON.parse(localStorage.getItem('pos_delivery_drivers') || '[]');
      } catch (e) {
        this.drivers = [];
      }
    }
  }

  renderKPIs() {
    const totalDrivers = this.drivers.length;
    const activeDrivers = this.drivers.filter(d => d.is_active != 0).length;

    // Total outstanding cash in the street across all drivers
    const totalOutstandingCash = this.drivers.reduce((sum, d) => sum + parseFloat(d.cash_balance || 0), 0);

    // Total settled cash today
    const todayStr = new Date().toLocaleDateString('ar-EG');
    const todaySettlements = this.settlementHistory.filter(s => {
      if (!s.timestamp) return false;
      return new Date(s.timestamp).toLocaleDateString('ar-EG') === todayStr;
    });

    const totalSettledToday = todaySettlements.reduce((sum, s) => sum + parseFloat(s.settled_amount || 0), 0);
    const settlementsCountToday = todaySettlements.length;

    // Update KPI UI elements
    const elTotalDrivers = document.getElementById('ds-kpi-total-drivers');
    const elOutstanding = document.getElementById('ds-kpi-outstanding-cash');
    const elSettledToday = document.getElementById('ds-kpi-settled-today');
    const elSettlementsCount = document.getElementById('ds-kpi-settlements-count');

    if (elTotalDrivers) elTotalDrivers.textContent = `${activeDrivers} / ${totalDrivers}`;
    if (elOutstanding) elOutstanding.textContent = `${totalOutstandingCash.toFixed(2)} ج.م`;
    if (elSettledToday) elSettledToday.textContent = `${totalSettledToday.toFixed(2)} ج.م`;
    if (elSettlementsCount) elSettlementsCount.textContent = `${settlementsCountToday} عملية`;
  }

  switchTab(tab) {
    this.activeTab = tab;
    const btnDrivers = document.getElementById('ds-tab-drivers');
    const btnHistory = document.getElementById('ds-tab-history');
    const btnUnassigned = document.getElementById('ds-tab-unassigned');
    const panelDrivers = document.getElementById('ds-panel-drivers');
    const panelHistory = document.getElementById('ds-panel-history');
    const panelUnassigned = document.getElementById('ds-panel-unassigned');

    const allBtns = [btnDrivers, btnHistory, btnUnassigned];
    const allPanels = [panelDrivers, panelHistory, panelUnassigned];

    allBtns.forEach(b => {
      b?.classList.remove('bg-emerald-600', 'text-white', 'shadow-xs');
      b?.classList.add('text-gray-600', 'dark:text-gray-300');
    });
    allPanels.forEach(p => p?.classList.add('hidden'));

    if (tab === 'drivers') {
      btnDrivers?.classList.add('bg-emerald-600', 'text-white', 'shadow-xs');
      btnDrivers?.classList.remove('text-gray-600', 'dark:text-gray-300');
      panelDrivers?.classList.remove('hidden');
    } else if (tab === 'unassigned') {
      btnUnassigned?.classList.add('bg-emerald-600', 'text-white', 'shadow-xs');
      btnUnassigned?.classList.remove('text-gray-600', 'dark:text-gray-300');
      panelUnassigned?.classList.remove('hidden');
    } else {
      btnHistory?.classList.add('bg-emerald-600', 'text-white', 'shadow-xs');
      btnHistory?.classList.remove('text-gray-600', 'dark:text-gray-300');
      panelHistory?.classList.remove('hidden');
    }

    this.renderActiveTab();
    if (window.lucide) window.lucide.createIcons();
  }

  renderActiveTab() {
    if (this.activeTab === 'drivers') {
      this.renderDriversList();
    } else if (this.activeTab === 'unassigned') {
      this.renderUnassignedOrders();
    } else {
      this.renderHistoryList();
    }
  }

  filterDrivers(query = '') {
    const q = (query || '').toLowerCase().trim();
    const filtered = this.drivers.filter(d => {
      return (d.name || '').toLowerCase().includes(q) || (d.phone || '').includes(q);
    });
    this.renderDriversList(filtered);
  }

  renderDriversList(driversToRender = null) {
    const list = driversToRender || this.drivers;
    const container = document.getElementById('ds-drivers-grid');
    if (!container) return;

    if (list.length === 0) {
      container.innerHTML = `
        <div class="col-span-full p-8 text-center bg-white dark:bg-gray-800 rounded-3xl border border-dashed border-gray-200 dark:border-gray-700">
          <div class="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 flex items-center justify-center mx-auto mb-3">
            <i data-lucide="bike" class="w-6 h-6"></i>
          </div>
          <h4 class="text-sm font-bold text-gray-800 dark:text-gray-200">لا يوجد طيارين مسجلين</h4>
          <p class="text-xs text-gray-500 mt-1 mb-4">يمكنك إضافة طيار دليفري جديد للمنظومة بسهولة</p>
          <button onclick="window.deliverySettlementController.openNewDriverModal()" class="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-md">
            + إضافة أول طيار
          </button>
        </div>
      `;
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    container.innerHTML = list.map(driver => {
      const balance = parseFloat(driver.cash_balance || 0);
      const hasBalance = balance > 0;

      return `
        <div class="bg-white dark:bg-gray-800 rounded-3xl p-5 border border-gray-200 dark:border-gray-700 shadow-xs hover:shadow-md transition flex flex-col justify-between gap-4">
          <!-- Top Driver Info -->
          <div>
            <div class="flex items-start justify-between gap-2 mb-3">
              <div class="flex items-center gap-3">
                <div class="w-11 h-11 rounded-2xl bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 flex items-center justify-center font-bold">
                  <i data-lucide="bike" class="w-5 h-5"></i>
                </div>
                <div>
                  <h4 class="text-sm font-black text-gray-900 dark:text-white flex items-center gap-2">
                    ${driver.name}
                    ${driver.is_active != 0 ? `
                      <span class="w-2 h-2 rounded-full bg-emerald-500 ring-4 ring-emerald-100 dark:ring-emerald-950" title="نشط"></span>
                    ` : `
                      <span class="w-2 h-2 rounded-full bg-gray-400" title="معطل"></span>
                    `}
                  </h4>
                  <p class="text-xs text-gray-500 font-mono mt-0.5">${driver.phone || 'بدون هاتف'}</p>
                </div>
              </div>

              ${driver.pin_code ? `
                <span class="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-lg text-[10px] font-mono font-bold" title="كود PIN">
                  PIN: ${driver.pin_code}
                </span>
              ` : ''}
            </div>

            <!-- Balance Card -->
            <div class="p-3.5 rounded-2xl ${hasBalance ? 'bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60' : 'bg-gray-50 dark:bg-gray-700/50 border border-gray-100 dark:border-gray-700'} flex items-center justify-between">
              <div>
                <span class="text-[11px] font-bold ${hasBalance ? 'text-amber-800 dark:text-amber-300' : 'text-gray-500'}">العهدة النقدية المستحقة:</span>
                <p class="text-[10px] text-gray-400 mt-0.5">${hasBalance ? 'كاش في جيب الطيار مطلوب توريده' : 'الحساب خالص بالكامل'}</p>
              </div>
              <span class="text-base font-black font-mono ${hasBalance ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}">
                ${balance.toFixed(2)} ج.م
              </span>
            </div>
          </div>

          <!-- Bottom Action Buttons -->
          <div class="grid grid-cols-2 gap-2 pt-2 border-t border-gray-100 dark:border-gray-700">
            <button onclick="window.deliverySettlementController.openSettleModal(${driver.id})" class="py-2.5 px-3 rounded-xl ${hasBalance ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200'} text-xs font-bold flex items-center justify-center gap-1.5 transition">
              <i data-lucide="hand-coins" class="w-4 h-4"></i>
              <span>تقفيل وتصفية</span>
            </button>

            <button onclick="window.deliverySettlementController.openDriverOrdersView(${driver.id})" class="py-2.5 px-3 rounded-xl bg-gray-100 dark:bg-gray-700/80 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 text-xs font-bold flex items-center justify-center gap-1.5 transition">
              <i data-lucide="receipt" class="w-4 h-4 text-indigo-500"></i>
              <span>كشف الطلبات</span>
            </button>
          </div>
        </div>
      `;
    }).join('');

    if (window.lucide) window.lucide.createIcons();
  }

  renderHistoryList() {
    const container = document.getElementById('ds-history-table-body');
    if (!container) return;

    if (this.settlementHistory.length === 0) {
      container.innerHTML = `
        <tr>
          <td colspan="7" class="p-8 text-center text-gray-400 text-xs">
            <i data-lucide="receipt" class="w-8 h-8 mx-auto mb-2 opacity-30"></i>
            لا توجد أي عمليات تقفيل سابقة مسجلة
          </td>
        </tr>
      `;
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    container.innerHTML = this.settlementHistory.map((s, idx) => `
      <tr class="border-b border-gray-100 dark:border-gray-700/60 hover:bg-gray-50/60 dark:hover:bg-gray-700/30 transition text-xs">
        <td class="py-3 px-4 font-mono font-bold text-gray-500">#${s.id || (idx + 1)}</td>
        <td class="py-3 px-4 font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <div class="w-6 h-6 rounded-lg bg-emerald-100 dark:bg-emerald-900 text-emerald-600 flex items-center justify-center text-[10px]">🛵</div>
          <span>${s.driver_name}</span>
        </td>
        <td class="py-3 px-4 font-mono font-black text-emerald-600 dark:text-emerald-400">
          ${parseFloat(s.settled_amount || 0).toFixed(2)} ج.م
        </td>
        <td class="py-3 px-4 text-gray-500">${s.cashier || 'كاشير 1'}</td>
        <td class="py-3 px-4 text-gray-500 font-mono text-[11px]">${s.date || '-'}</td>
        <td class="py-3 px-4 text-gray-500 truncate max-w-xs">${s.notes || 'تقفيل وردية'}</td>
        <td class="py-3 px-4 text-center">
          <button onclick="window.deliverySettlementController.reprintSettlement('${s.id}')" class="p-2 rounded-xl bg-gray-100 dark:bg-gray-700 hover:bg-indigo-50 hover:text-indigo-600 text-gray-600 dark:text-gray-300 transition" title="إعادة طباعة الإيصال">
            <i data-lucide="printer" class="w-3.5 h-3.5"></i>
          </button>
        </td>
      </tr>
    `).join('');

    if (window.lucide) window.lucide.createIcons();
  }

  /* ==================== SETTLE DRIVER MODAL LOGIC ==================== */
  async openSettleModal(driverId) {
    const driver = this.drivers.find(d => d.id == driverId);
    if (!driver) return;

    this.selectedDriver = driver;
    const modal = document.getElementById('driver-settle-modal');
    if (!modal) return;

    // Reset fields
    document.getElementById('dsm-driver-name').textContent = driver.name;
    document.getElementById('dsm-driver-phone').textContent = driver.phone || '';
    
    const balance = parseFloat(driver.cash_balance || 0);
    const balanceEl = document.getElementById('dsm-driver-balance');
    if (balanceEl) balanceEl.textContent = `${balance.toFixed(2)} ج.م`;

    const amountInput = document.getElementById('dsm-settle-amount');
    if (amountInput) amountInput.value = balance > 0 ? balance.toFixed(2) : '0';

    const notesInput = document.getElementById('dsm-settle-notes');
    if (notesInput) notesInput.value = `تقفيل وردية - ${new Date().toLocaleTimeString('ar-EG', {hour:'2-digit', minute:'2-digit'})}`;

    // Orders breakdown container
    const ordersContainer = document.getElementById('dsm-orders-container');
    if (ordersContainer) {
      ordersContainer.innerHTML = `
        <div class="p-6 text-center text-gray-400 text-xs">
          <i data-lucide="loader-2" class="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-600"></i>
          جاري تحميل بيانات وأوردرات الطيار...
        </div>
      `;
    }

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    if (window.lucide) window.lucide.createIcons();

    // Fetch live orders for this driver from API
    try {
      const ordersRes = await window.api.getDriverOrders(driver.name, driver.id);
      if (ordersRes && ordersRes.success) {
        this.driverOrdersData = ordersRes;
        this.renderDriverOrdersInModal(ordersRes);
      } else {
        if (ordersContainer) {
          ordersContainer.innerHTML = `
            <div class="p-4 text-center text-gray-400 text-xs">لا توجد طلبات جارية لهذا الطيار اليوم</div>
          `;
        }
      }
    } catch (err) {
      console.warn('Error loading driver orders:', err);
      if (ordersContainer) {
        ordersContainer.innerHTML = `
          <div class="p-4 text-center text-gray-400 text-xs">تعذر الاتصال بالسيرفر، يمكنك التقفيل اليدوي للعهدة المسجلة</div>
        `;
      }
    }
  }

  renderDriverOrdersInModal(data) {
    const ordersContainer = document.getElementById('dsm-orders-container');
    if (!ordersContainer) return;

    const allOrders = data.all_orders || [];
    const stats = data.stats || {};

    if (allOrders.length === 0) {
      ordersContainer.innerHTML = `
        <div class="p-4 text-center text-gray-400 text-xs bg-gray-50 dark:bg-gray-700/40 rounded-2xl">
          لا توجد أوردرات مسجلة لهذا الطيار اليوم
        </div>
      `;
      return;
    }

    // Mini Stats summary
    const statsHtml = `
      <div class="grid grid-cols-3 gap-2 mb-3">
        <div class="p-2.5 rounded-xl bg-gray-50 dark:bg-gray-700/50 text-center">
          <span class="text-[10px] text-gray-500">تم تسليمها</span>
          <p class="text-xs font-black text-emerald-600">${stats.delivered_today_count || 0}</p>
        </div>
        <div class="p-2.5 rounded-xl bg-gray-50 dark:bg-gray-700/50 text-center">
          <span class="text-[10px] text-gray-500">قيد التوصيل</span>
          <p class="text-xs font-black text-amber-600">${stats.in_transit_count || 0}</p>
        </div>
        <div class="p-2.5 rounded-xl bg-gray-50 dark:bg-gray-700/50 text-center">
          <span class="text-[10px] text-gray-500">كاش التحصيل</span>
          <p class="text-xs font-black text-indigo-600 font-mono">${(stats.cash_in_hand || 0).toFixed(2)} ج.م</p>
        </div>
      </div>
    `;

    const ordersHtml = allOrders.slice(0, 10).map(ord => {
      const isDelivered = (ord.status || '').includes('مكتمل') || (ord.status || '').includes('تم التسليم');
      const isCod = (ord.payment_method || '').includes('كاش') || (ord.payment_method || '').includes('استلام') || ord.payment_status !== 'مدفوع';

      return `
        <div class="p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 flex items-center justify-between gap-2 text-xs">
          <div>
            <div class="flex items-center gap-2">
              <span class="font-mono font-bold text-gray-900 dark:text-white">#${ord.id}</span>
              <span class="font-semibold text-gray-700 dark:text-gray-300">${ord.customer_name || 'عميل دليفري'}</span>
              <span class="px-1.5 py-0.5 rounded text-[10px] font-bold ${isDelivered ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300' : 'bg-amber-100 text-amber-800'}">
                ${ord.status || 'قيد التوصيل'}
              </span>
            </div>
            <p class="text-[10px] text-gray-400 mt-0.5 truncate max-w-xs">${ord.customer_address || ord.address || '-'}</p>
          </div>

          <div class="text-left">
            <span class="font-mono font-black text-gray-900 dark:text-white">${parseFloat(ord.total_price || 0).toFixed(2)} ج.م</span>
            <p class="text-[10px] font-bold ${isCod ? 'text-amber-600' : 'text-emerald-600'}">
              ${isCod ? '💵 تحصيل كاش' : '✅ مدفوع مسبقاً'}
            </p>
          </div>
        </div>
      `;
    }).join('');

    ordersContainer.innerHTML = statsHtml + `<div class="flex flex-col gap-2 max-h-48 overflow-y-auto">${ordersHtml}</div>`;
    if (window.lucide) window.lucide.createIcons();
  }

  setFullSettlementAmount() {
    if (!this.selectedDriver) return;
    const balance = parseFloat(this.selectedDriver.cash_balance || 0);
    const amountInput = document.getElementById('dsm-settle-amount');
    if (amountInput) amountInput.value = balance.toFixed(2);
  }

  closeSettleModal() {
    const modal = document.getElementById('driver-settle-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
    this.selectedDriver = null;
    this.driverOrdersData = null;
  }

  async submitSettlement() {
    if (!this.selectedDriver) return;

    const amountInput = document.getElementById('dsm-settle-amount');
    const notesInput = document.getElementById('dsm-settle-notes');
    const amount = parseFloat(amountInput?.value || 0);
    const notes = (notesInput?.value || 'تقفيل وردية').trim();

    if (isNaN(amount) || amount < 0) {
      window.app?.showToast('يرجى إدخال مبلغ صحيح للتقفيل', 'error');
      return;
    }

    const prevBalance = parseFloat(this.selectedDriver.cash_balance || 0);
    const remainingBalance = Math.max(0, prevBalance - amount);

    try {
      window.app?.showLoading(true, 'جاري تصفية حساب الطيار وتوريد النقدية...');
      
      const res = await window.api.settleDeliveryAccount({
        driver_id: this.selectedDriver.id,
        driver_name: this.selectedDriver.name,
        amount: amount,
        notes: notes
      });

      window.app?.showLoading(false);

      // Create settlement record
      const settlement = {
        id: `SET-${Date.now().toString().slice(-6)}`,
        driver_id: this.selectedDriver.id,
        driver_name: this.selectedDriver.name,
        driver_phone: this.selectedDriver.phone || '',
        cashier: window.cart?.cashierNotes || 'كاشير 1',
        settled_amount: amount,
        previous_balance: prevBalance,
        remaining_balance: remainingBalance,
        notes: notes,
        date: new Date().toLocaleString('ar-EG'),
        timestamp: Date.now()
      };

      // Save locally
      this.settlementHistory.unshift(settlement);
      this.saveSettlementHistory();

      // Update in memory driver balance
      this.selectedDriver.cash_balance = remainingBalance;
      const driverInList = this.drivers.find(d => d.id == this.selectedDriver.id);
      if (driverInList) driverInList.cash_balance = remainingBalance;
      localStorage.setItem('pos_delivery_drivers', JSON.stringify(this.drivers));

      window.posScanner?.playSuccessBeep();
      window.app?.showToast(`✅ تم تقفيل وتوريد (${amount.toFixed(2)} ج.م) من الطيار بنجاح!`, 'success');

      this.closeSettleModal();
      this.renderKPIs();
      this.renderActiveTab();

      // Print settlement receipt
      this.printSettlementSlip(settlement);

    } catch (err) {
      window.app?.showLoading(false);
      window.app?.showToast(`حدث خطأ أثناء التقفيل: ${err.message || err}`, 'error');
    }
  }

  /* ==================== PRINT SETTLEMENT SLIP ==================== */
  printSettlementSlip(settlement) {
    const store = window.cart?.storeMeta || {
      store_name: 'سوبر ماركت البيت السوري',
      store_address: 'العنوان: شارع السوق التجاري',
      phone_numbers: ['01000000000']
    };

    const slipHtml = `
      <div class="receipt-header">
        <h2 class="receipt-store-title">${store.store_name}</h2>
        <div class="receipt-store-sub">🛵 إيصال تصفية وتوريد عهدة دليفري</div>
        <div class="receipt-store-sub">📍 ${store.store_address || ''}</div>
      </div>

      <div class="receipt-meta">
        <div class="receipt-meta-row">
          <span>رقم الإيصال: <b>#${settlement.id}</b></span>
          <span>التاريخ: ${settlement.date}</span>
        </div>
        <div class="receipt-meta-row">
          <span>الطيار: <b>${settlement.driver_name}</b></span>
          <span>الهاتف: ${settlement.driver_phone || '-'}</span>
        </div>
        <div class="receipt-meta-row">
          <span>الكاشير المستلم: <b>${settlement.cashier}</b></span>
          <span>البيان: ${settlement.notes || 'تقفيل وردية'}</span>
        </div>
      </div>

      <div class="receipt-totals" style="margin: 12px 0; border-top: 1px dashed #000; border-bottom: 1px dashed #000; padding: 8px 0;">
        <div class="receipt-total-row" style="font-size: 11px;">
          <span>العهدة السابقة قبل التوريد:</span>
          <span>${parseFloat(settlement.previous_balance).toFixed(2)} ج.م</span>
        </div>
        <div class="receipt-total-row receipt-grand-total" style="font-size: 14px; margin: 4px 0;">
          <span>المبلغ المورد للخزينة:</span>
          <span>${parseFloat(settlement.settled_amount).toFixed(2)} ج.م</span>
        </div>
        <div class="receipt-total-row" style="font-size: 11px; font-weight: bold; color: ${settlement.remaining_balance > 0 ? '#b45309' : '#15803d'};">
          <span>الرصيد المتبقي على الطيار:</span>
          <span>${parseFloat(settlement.remaining_balance).toFixed(2)} ج.م ${settlement.remaining_balance === 0 ? '(خالص ✅)' : ''}</span>
        </div>
      </div>

      <div style="margin-top: 15px; font-size: 10px; display: flex; justify-content: space-between; text-align: center;">
        <div style="width: 45%; border-top: 1px solid #333; padding-top: 4px;">
          <span>توقيع الطيار / المندوب</span>
        </div>
        <div style="width: 45%; border-top: 1px solid #333; padding-top: 4px;">
          <span>توقيع الكاشير المستلم</span>
        </div>
      </div>

      <div class="receipt-footer" style="margin-top: 15px;">
        <p>تم استلام النقدية وتوريدها إلى الخزينة بنجاح</p>
      </div>
    `;

    const container = document.getElementById('receipt-view-container');
    const printArea = document.getElementById('receipt-print-area');
    const modal = document.getElementById('receipt-modal');

    if (container) container.innerHTML = slipHtml;
    if (printArea) printArea.innerHTML = slipHtml;
    modal?.classList.remove('hidden');

    // Trigger print
    setTimeout(() => {
      window.print();
    }, 400);
  }

  reprintSettlement(settlementId) {
    const s = this.settlementHistory.find(item => item.id == settlementId);
    if (s) {
      this.printSettlementSlip(s);
    }
  }

  /* ==================== OPEN DRIVER ORDERS MODAL ==================== */
  openDriverOrdersView(driverId) {
    this.openSettleModal(driverId);
  }

  /* ==================== QUICK NEW DRIVER MODAL ==================== */
  openNewDriverModal() {
    window.app?.openNewDriverModal();
  }

  /* ==================== UNASSIGNED / AD-HOC DELIVERY ORDERS ==================== */
  renderUnassignedOrders() {
    const container = document.getElementById('ds-unassigned-grid');
    if (!container) return;

    if (this.unassignedOrders.length === 0) {
      container.innerHTML = `
        <div class="col-span-full p-10 text-center bg-white dark:bg-gray-800 rounded-3xl border border-dashed border-gray-200 dark:border-gray-700">
          <div class="w-14 h-14 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 flex items-center justify-center mx-auto mb-3">
            <i data-lucide="check-check" class="w-7 h-7"></i>
          </div>
          <h4 class="text-sm font-black text-gray-900 dark:text-white">لا توجد طلبات دليفري معلقة بدون طيار</h4>
          <p class="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
            جميع طلبات التوصيل مسندة لطيارين أو تم تقفيلها وتسليمها بالكامل.
          </p>
          <button onclick="window.deliverySettlementController.loadUnassignedOrders().then(() => window.deliverySettlementController.renderActiveTab())" class="mt-4 px-4 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 text-gray-700 dark:text-gray-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5 mx-auto">
            <i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i>
            <span>تحديث القائمة</span>
          </button>
        </div>
      `;
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    container.innerHTML = this.unassignedOrders.map(order => {
      const isAdhoc = order.is_adhoc || (order.delivery_person && order.delivery_person.startsWith('توصيل مؤقت:'));
      const isCod = order.payment_status !== 'مدفوع' || (order.payment_method || '').includes('استلام') || (order.payment_method || '').includes('كاش');
      const timeStr = order.created_at ? new Date(order.created_at).toLocaleTimeString('ar-EG', {hour:'2-digit', minute:'2-digit'}) : '-';

      return `
        <div class="bg-white dark:bg-gray-800 rounded-3xl p-5 border border-amber-200/80 dark:border-amber-900/50 shadow-xs hover:shadow-md transition flex flex-col justify-between gap-4 relative overflow-hidden">
          <!-- Top Badge Bar -->
          <div class="flex items-center justify-between gap-2 border-b border-gray-100 dark:border-gray-700/60 pb-3">
            <div class="flex items-center gap-2">
              <span class="w-8 h-8 rounded-xl ${isAdhoc ? 'bg-purple-100 dark:bg-purple-950 text-purple-600' : 'bg-amber-100 dark:bg-amber-950 text-amber-600'} flex items-center justify-center font-bold text-xs">
                ${isAdhoc ? '📝' : '🛵'}
              </span>
              <div>
                <span class="font-mono font-bold text-xs text-gray-900 dark:text-white">#${order.id}</span>
                <span class="text-[10px] text-gray-400 font-mono block">${timeStr}</span>
              </div>
            </div>

            <div class="flex items-center gap-1">
              <span class="px-2.5 py-1 rounded-full text-[10px] font-bold ${isAdhoc ? 'bg-purple-50 text-purple-700 border border-purple-200 dark:bg-purple-950/40 dark:border-purple-800' : 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:border-amber-800'}">
                ${isAdhoc ? (order.delivery_person || 'توصيل مؤقت') : 'بانتظار الإسناد'}
              </span>
              <span class="px-2 py-0.5 rounded text-[10px] font-bold ${isCod ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300'}">
                ${isCod ? '💵 مطلوب تحصيل' : '✅ مدفوع'}
              </span>
            </div>
          </div>

          <!-- Customer Info Box -->
          <div class="flex flex-col gap-2">
            <div class="flex items-start justify-between gap-2">
              <div>
                <h4 class="text-sm font-black text-gray-900 dark:text-white flex items-center gap-1.5">
                  <i data-lucide="user" class="w-3.5 h-3.5 text-gray-400"></i>
                  <span>${order.customer_name || 'عميل دليفري'}</span>
                </h4>
                <p class="text-xs text-emerald-600 dark:text-emerald-400 font-mono font-bold mt-0.5 flex items-center gap-1">
                  <i data-lucide="phone" class="w-3 h-3"></i>
                  <span>${order.customer_phone || 'بدون رقم'}</span>
                </p>
              </div>

              <div class="text-left">
                <span class="text-xs text-gray-400 block">إجمالي الطلب:</span>
                <span class="text-base font-black font-mono text-indigo-600 dark:text-indigo-400">
                  ${parseFloat(order.total_price || 0).toFixed(2)} ج.م
                </span>
                ${order.delivery_fee > 0 ? `<span class="text-[10px] text-gray-400 block font-mono">شامل توصيل: ${parseFloat(order.delivery_fee).toFixed(0)} ج.م</span>` : ''}
              </div>
            </div>

            <!-- Address -->
            <div class="p-2.5 bg-gray-50 dark:bg-gray-700/50 rounded-xl border border-gray-100 dark:border-gray-700 flex items-start gap-1.5 text-xs text-gray-600 dark:text-gray-300">
              <i data-lucide="map-pin" class="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5"></i>
              <span class="line-clamp-2">${order.customer_address || 'لم يتم تسجيل عنوان تفصيلي'}</span>
            </div>
          </div>

          <!-- Action Buttons -->
          <div class="grid grid-cols-2 gap-2 pt-2 border-t border-gray-100 dark:border-gray-700">
            <!-- Option 1: Assign to permanent driver -->
            <button onclick="window.deliverySettlementController.openAssignModal(${order.id})" class="py-2 px-2.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900 text-indigo-700 dark:text-indigo-300 text-xs font-bold flex items-center justify-center gap-1.5 transition border border-indigo-200 dark:border-indigo-800/60">
              <i data-lucide="bike" class="w-3.5 h-3.5"></i>
              <span>إسناد لطيار</span>
            </button>

            <!-- Option 2: Settle ad-hoc with note (Neighbor / casual courier / pickup) -->
            <button onclick="window.deliverySettlementController.openAdhocSettleModal(${order.id})" class="py-2 px-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition shadow-xs">
              <i data-lucide="hand-coins" class="w-3.5 h-3.5"></i>
              <span>تقفيل بملاحظة</span>
            </button>
          </div>
        </div>
      `;
    }).join('');

    if (window.lucide) window.lucide.createIcons();
  }

  /* ==================== ASSIGN DRIVER TO ORDER ==================== */
  openAssignModal(orderId) {
    const order = this.unassignedOrders.find(o => o.id == orderId);
    if (!order) return;

    this.assigningOrderId = orderId;
    const modal = document.getElementById('assign-driver-modal');
    if (!modal) return;

    document.getElementById('adm-order-id').textContent = `#${order.id}`;
    document.getElementById('adm-cust-name').textContent = order.customer_name || 'عميل دليفري';
    document.getElementById('adm-cust-phone').textContent = order.customer_phone || '-';
    document.getElementById('adm-order-total').textContent = `${parseFloat(order.total_price || 0).toFixed(2)} ج.م`;

    const select = document.getElementById('adm-driver-select');
    if (select) {
      let html = '<option value="">-- اختر طيار الدليفري --</option>';
      this.drivers.filter(d => d.is_active != 0).forEach(d => {
        html += `<option value="${d.name}" data-id="${d.id}">🛵 ${d.name} (${d.phone || 'بدون هاتف'})</option>`;
      });
      select.innerHTML = html;
    }

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    if (window.lucide) window.lucide.createIcons();
  }

  closeAssignModal() {
    const modal = document.getElementById('assign-driver-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
    this.assigningOrderId = null;
  }

  async submitAssignDriver() {
    if (!this.assigningOrderId) return;
    const select = document.getElementById('adm-driver-select');
    const driverName = (select?.value || '').trim();

    if (!driverName) {
      window.app?.showToast('يرجى اختيار طيار للإسناد', 'error');
      return;
    }

    try {
      window.app?.showLoading(true, 'جاري إسناد الأوردر للطيار...');
      const res = await window.api.assignDeliveryDriver({
        order_id: this.assigningOrderId,
        delivery_person: driverName
      });
      window.app?.showLoading(false);

      if (res && res.success) {
        window.app?.showToast(`✅ تم إسناد الأوردر للطيار (${driverName}) بنجاح!`, 'success');
        this.closeAssignModal();
        await Promise.all([this.loadDrivers(), this.loadUnassignedOrders()]);
        this.renderKPIs();
        this.renderActiveTab();
      } else {
        throw new Error(res?.error || 'فشل إسناد الأوردر');
      }
    } catch (e) {
      window.app?.showLoading(false);
      window.app?.showToast(`خطأ في الإسناد: ${e.message}`, 'error');
    }
  }

  /* ==================== AD-HOC DELIVERY SETTLEMENT (بملاحظة بدل اسم الدليفري) ==================== */
  openAdhocSettleModal(orderId) {
    const order = this.unassignedOrders.find(o => o.id == orderId);
    if (!order) return;

    this.adhocOrder = order;
    const modal = document.getElementById('adhoc-settle-modal');
    if (!modal) return;

    document.getElementById('asm-order-id').textContent = `#${order.id}`;
    document.getElementById('asm-cust-name').textContent = order.customer_name || 'عميل دليفري';
    document.getElementById('asm-cust-phone').textContent = order.customer_phone || '-';
    document.getElementById('asm-order-total').textContent = `${parseFloat(order.total_price || 0).toFixed(2)} ج.م`;

    const amountInput = document.getElementById('asm-collected-amount');
    if (amountInput) {
      amountInput.value = parseFloat(order.total_price || 0).toFixed(2);
    }

    const noteInput = document.getElementById('asm-driver-note');
    if (noteInput) {
      noteInput.value = '';
    }

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    if (window.lucide) window.lucide.createIcons();
  }

  closeAdhocSettleModal() {
    const modal = document.getElementById('adhoc-settle-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
    this.adhocOrder = null;
  }

  setAdhocNotePreset(note) {
    const noteInput = document.getElementById('asm-driver-note');
    if (noteInput) {
      noteInput.value = note;
    }
  }

  async submitAdhocSettlement() {
    if (!this.adhocOrder) return;

    const noteInput = document.getElementById('asm-driver-note');
    const amountInput = document.getElementById('asm-collected-amount');
    const methodSelect = document.getElementById('asm-payment-method');

    const note = (noteInput?.value || 'توصيل بمعرفة الجار / مندوب مؤقت').trim();
    const amount = parseFloat(amountInput?.value || this.adhocOrder.total_price || 0);
    const paymentMethod = methodSelect?.value || 'كاش';

    if (isNaN(amount) || amount < 0) {
      window.app?.showToast('يرجى إدخال مبلغ تحصيل صحيح', 'error');
      return;
    }

    try {
      window.app?.showLoading(true, 'جاري تقفيل الأوردر وتوريد النقدية...');
      const res = await window.api.settleAdhocDelivery({
        order_id: this.adhocOrder.id,
        driver_note: note,
        amount: amount,
        payment_method: paymentMethod,
        cashier: window.cart?.cashierNotes || 'كاشير 1'
      });
      window.app?.showLoading(false);

      if (res && res.success) {
        // Record in settlement history
        const settlement = {
          id: `ADHOC-${Date.now().toString().slice(-6)}`,
          order_id: this.adhocOrder.id,
          driver_name: `مؤقت: ${note}`,
          driver_phone: this.adhocOrder.customer_phone || '-',
          cashier: window.cart?.cashierNotes || 'كاشير 1',
          settled_amount: amount,
          previous_balance: amount,
          remaining_balance: 0,
          payment_method: paymentMethod,
          notes: `توصيل مؤقت - أوردر #${this.adhocOrder.id} [${note}]`,
          date: new Date().toLocaleString('ar-EG'),
          timestamp: Date.now(),
          is_adhoc: true
        };

        this.settlementHistory.unshift(settlement);
        this.saveSettlementHistory();

        window.posScanner?.playSuccessBeep();
        window.app?.showToast(`✅ تم تقفيل الأوردر وتوريد (${amount.toFixed(2)} ج.م) للخزينة بملاحظة (${note})`, 'success');

        this.closeAdhocSettleModal();
        await Promise.all([this.loadDrivers(), this.loadUnassignedOrders()]);
        this.renderKPIs();
        this.renderActiveTab();

        // Print slip
        this.printAdhocSettlementSlip(settlement, this.adhocOrder);
      } else {
        throw new Error(res?.error || 'فشل التقفيل');
      }
    } catch (e) {
      window.app?.showLoading(false);
      window.app?.showToast(`خطأ أثناء التقفيل: ${e.message}`, 'error');
    }
  }

  printAdhocSettlementSlip(settlement, order) {
    const store = window.cart?.storeMeta || {
      store_name: 'سوبر ماركت البيت السوري',
      store_address: 'العنوان: شارع السوق التجاري',
      phone_numbers: ['01000000000']
    };

    const slipHtml = `
      <div class="receipt-header">
        <h2 class="receipt-store-title">${store.store_name}</h2>
        <div class="receipt-store-sub">🛵 إيصال تقفيل وتوريد دليفري مؤقت / خارجي</div>
        <div class="receipt-store-sub">📍 ${store.store_address || ''}</div>
      </div>

      <div class="receipt-meta">
        <div class="receipt-meta-row">
          <span>رقم الإيصال: <b>#${settlement.id}</b></span>
          <span>التاريخ: ${settlement.date}</span>
        </div>
        <div class="receipt-meta-row">
          <span>رقم الأوردر: <b>#${settlement.order_id || '-'}</b></span>
          <span>طريقة الدفع: <b>${settlement.payment_method || 'كاش'}</b></span>
        </div>
        <div class="receipt-meta-row">
          <span>القائم بالتسليم / الملاحظة: <b>${settlement.driver_name}</b></span>
        </div>
        <div class="receipt-meta-row">
          <span>الكاشير المستلم: <b>${settlement.cashier}</b></span>
        </div>
      </div>

      <div class="receipt-totals" style="margin: 12px 0; border-top: 1px dashed #000; border-bottom: 1px dashed #000; padding: 8px 0;">
        <div class="receipt-total-row receipt-grand-total" style="font-size: 14px; margin: 4px 0;">
          <span>المبلغ المورد للخزينة:</span>
          <span>${parseFloat(settlement.settled_amount).toFixed(2)} ج.م (خالص ✅)</span>
        </div>
      </div>

      <div style="margin-top: 15px; font-size: 10px; display: flex; justify-content: space-between; text-align: center;">
        <div style="width: 45%; border-top: 1px solid #333; padding-top: 4px;">
          <span>توقيع المستلم / القائم بالتوصيل</span>
        </div>
        <div style="width: 45%; border-top: 1px solid #333; padding-top: 4px;">
          <span>توقيع الكاشير</span>
        </div>
      </div>

      <div class="receipt-footer" style="margin-top: 15px;">
        <p>تم استلام النقدية وتوريدها إلى الخزينة وتسوية الأوردر بنجاح</p>
      </div>
    `;

    const container = document.getElementById('receipt-view-container');
    const printArea = document.getElementById('receipt-print-area');
    const modal = document.getElementById('receipt-modal');

    if (container) container.innerHTML = slipHtml;
    if (printArea) printArea.innerHTML = slipHtml;
    modal?.classList.remove('hidden');

    setTimeout(() => {
      window.print();
    }, 400);
  }
}

window.deliverySettlementController = new DeliverySettlementController();
