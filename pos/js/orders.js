/**
 * Syrian Home POS - Online Web Orders Controller
 * Handles fetching, status updating, and dispatching online store orders.
 */

class WebOrdersController {
  constructor() {
    this.currentStatusFilter = 'pending';
    this.orders = [];
  }

  async loadOrders(status = this.currentStatusFilter) {
    this.currentStatusFilter = status;
    const container = document.getElementById('web-orders-list');
    if (!container) return;

    // Update filter tabs UI
    document.querySelectorAll('.order-status-tab').forEach(tab => {
      if (tab.getAttribute('data-status') === status) {
        tab.className = 'order-status-tab px-3 py-1.5 rounded-xl text-xs font-bold bg-indigo-600 text-white shadow-sm';
      } else {
        tab.className = 'order-status-tab px-3 py-1.5 rounded-xl text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700';
      }
    });

    try {
      container.innerHTML = `
        <div class="p-8 text-center text-gray-400">
          <div class="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
          <p class="text-xs">جاري جلب الطلبات من المتجر...</p>
        </div>
      `;

      if (!window.app?.deliveryDrivers?.length) {
        await window.app?.loadDeliveryDrivers();
      }

      const res = await window.api.getWebOrders(status);

      if (res && res.success && Array.isArray(res.orders)) {
        this.orders = res.orders;
        this.renderOrders();
      } else {
        this.orders = [];
        this.renderOrders();
      }
    } catch (err) {
      container.innerHTML = `
        <div class="p-8 text-center text-rose-500 text-xs">
          تعذر جلب طلبات المتجر الأونلاين (${err.message})
        </div>
      `;
    }
  }


  // ==================== SALES INVOICES ARCHIVE & LOG ====================
  initSalesLog() {
    this.salesInvoices = [];
    this.salesPage = 1;
    this.salesLimit = 50;
    this.salesSearchQuery = '';
    this.salesPeriodFilter = 'all';
    this.salesFromDate = '';
    this.salesToDate = '';
    this.salesPaymentFilter = 'all';
    this.salesOrderTypeFilter = 'all';
    this.salesSourceFilter = 'all';
    this.salesCashierFilter = '';
    this.salesMinTotal = '';
    this.salesMaxTotal = '';
    this.salesStatusFilter = '';
    this.salesSortBy = 'newest';
    this.totalSalesCount = 0;
    this._salesRequestSeq = 0;
  }

  getPeriodDateRange(period) {
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const fmt = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const todayStr = fmt(now);

    if (period === 'today') {
      return { fromDate: todayStr, toDate: todayStr };
    }
    if (period === 'yesterday') {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      const yStr = fmt(y);
      return { fromDate: yStr, toDate: yStr };
    }
    if (period === 'week') {
      const w = new Date(now);
      w.setDate(w.getDate() - 7);
      return { fromDate: fmt(w), toDate: todayStr };
    }
    if (period === 'month') {
      return { fromDate: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`, toDate: todayStr };
    }
    if (period === 'last_month') {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      return { fromDate: fmt(start), toDate: fmt(end) };
    }
    return { fromDate: '', toDate: '' };
  }

  updateSalesPeriodButtons(period) {
    document.querySelectorAll('.sales-period-btn').forEach(btn => {
      if (btn.getAttribute('data-period') === period) {
        btn.className = 'sales-period-btn px-2.5 py-1 rounded-lg bg-white dark:bg-gray-600 text-indigo-600 shadow-2xs transition cursor-pointer';
      } else {
        btn.className = 'sales-period-btn px-2.5 py-1 rounded-lg text-gray-600 dark:text-gray-300 transition cursor-pointer';
      }
    });
  }

  updateSalesFilterBadge() {
    let activeCount = 0;
    if (this.salesSearchQuery) activeCount++;
    if (this.salesFromDate || this.salesToDate) activeCount++;
    if (this.salesPaymentFilter && this.salesPaymentFilter !== 'all') activeCount++;
    if (this.salesOrderTypeFilter && this.salesOrderTypeFilter !== 'all') activeCount++;
    if (this.salesSourceFilter && this.salesSourceFilter !== 'all') activeCount++;
    if (this.salesCashierFilter) activeCount++;
    if (this.salesMinTotal !== '') activeCount++;
    if (this.salesMaxTotal !== '') activeCount++;
    if (this.salesStatusFilter) activeCount++;
    if (this.salesSortBy && this.salesSortBy !== 'newest') activeCount++;

    let advancedCount = 0;
    if (this.salesSourceFilter && this.salesSourceFilter !== 'all') advancedCount++;
    if (this.salesCashierFilter) advancedCount++;
    if (this.salesStatusFilter) advancedCount++;
    if (this.salesSortBy && this.salesSortBy !== 'newest') advancedCount++;

    const badgeEl = document.getElementById('sales-active-filter-badge');
    if (badgeEl) {
      badgeEl.textContent = String(advancedCount);
      badgeEl.classList.toggle('hidden', advancedCount === 0);
    }

    const resetBtn = document.getElementById('btn-reset-sales-filters');
    if (resetBtn) {
      resetBtn.classList.toggle('hidden', activeCount === 0);
    }

    const clearSearchBtn = document.getElementById('sales-search-clear-btn');
    if (clearSearchBtn) {
      clearSearchBtn.classList.toggle('hidden', !this.salesSearchQuery);
    }
  }

  async loadSalesInvoices(reset = true) {
    if (!this.salesInvoices) this.initSalesLog();
    this.updateSalesFilterBadge();

    if (reset) {
      this.salesPage = 1;
      this.salesInvoices = [];
    }

    const tbody = document.getElementById('sales-invoices-table-body');
    const mobileCards = document.getElementById('sales-invoices-mobile-cards');
    const btnMore = document.getElementById('btn-load-more-sales');

    if (reset) {
      if (tbody) tbody.innerHTML = `<tr><td colspan="7" class="py-8 text-center text-gray-400 font-bold">جاري تحميل سجل فواتير المبيعات...</td></tr>`;
      if (mobileCards) mobileCards.innerHTML = `<div class="py-8 text-center text-gray-400 font-bold text-xs">جاري تحميل فواتير المبيعات...</div>`;
    }

    const params = {
      page: this.salesPage,
      limit: this.salesLimit
    };
    if (this.salesSearchQuery) params.search = this.salesSearchQuery;

    if (this.salesPeriodFilter !== 'custom' && this.salesPeriodFilter !== 'all') {
      const range = this.getPeriodDateRange(this.salesPeriodFilter);
      if (range.fromDate) params.from_date = range.fromDate;
      if (range.toDate) params.to_date = range.toDate;
    } else {
      if (this.salesFromDate) params.from_date = this.salesFromDate;
      if (this.salesToDate) params.to_date = this.salesToDate;
    }

    if (this.salesPaymentFilter && this.salesPaymentFilter !== 'all') params.payment_type = this.salesPaymentFilter;
    if (this.salesOrderTypeFilter && this.salesOrderTypeFilter !== 'all') params.order_type = this.salesOrderTypeFilter;
    if (this.salesSourceFilter && this.salesSourceFilter !== 'all') params.source = this.salesSourceFilter;
    if (this.salesCashierFilter) params.cashier = this.salesCashierFilter;
    if (this.salesMinTotal !== '') params.min_total = this.salesMinTotal;
    if (this.salesMaxTotal !== '') params.max_total = this.salesMaxTotal;
    if (this.salesStatusFilter) params.status = this.salesStatusFilter;
    if (this.salesSortBy && this.salesSortBy !== 'newest') params.sort_by = this.salesSortBy;

    const reqSeq = ++this._salesRequestSeq;

    try {
      const res = await window.api.get('get_completed_orders', params);
      if (reqSeq !== this._salesRequestSeq) return;

      if (res && res.success && Array.isArray(res.orders)) {
        if (reset) {
          this.salesInvoices = res.orders;
        } else {
          this.salesInvoices = this.salesInvoices.concat(res.orders);
        }
        this.totalSalesCount = res.total_count || 0;

        // Update KPIs
        const totalAmountEl = document.getElementById('sales-kpi-total-amount');
        const countEl = document.getElementById('sales-kpi-count');
        const avgEl = document.getElementById('sales-kpi-avg');

        if (totalAmountEl) totalAmountEl.textContent = `${(res.total_sales || 0).toLocaleString('ar-EG', { minimumFractionDigits: 2 })} ج.م`;
        if (countEl) countEl.textContent = `${(res.total_count || 0).toLocaleString()} فاتورة`;
        if (avgEl) {
          const avg = res.total_count > 0 ? (res.total_sales || 0) / res.total_count : 0;
          avgEl.textContent = `${avg.toFixed(2)} ج.م`;
        }
        const infoEl = document.getElementById('sales-pagination-info');
        if (infoEl) infoEl.textContent = `عرض ${this.salesInvoices.length} من إجمالي ${this.totalSalesCount} فاتورة`;

        if (btnMore) {
          btnMore.style.display = (this.salesInvoices.length < this.totalSalesCount) ? 'inline-flex' : 'none';
        }

        this.renderSalesInvoices();
      } else {
        if (tbody) tbody.innerHTML = `<tr><td colspan="7" class="py-8 text-center text-gray-400 font-bold">لا توجد فواتير مطابقة للبحث أو الفلتر</td></tr>`;
        if (mobileCards) mobileCards.innerHTML = `<div class="py-8 text-center text-gray-400 font-bold text-xs">لا توجد فواتير مطابقة</div>`;
      }
    } catch (err) {
      if (tbody) tbody.innerHTML = `<tr><td colspan="7" class="py-8 text-center text-rose-500 font-bold">خطأ في جلب الفواتير: ${err.message}</td></tr>`;
      if (mobileCards) mobileCards.innerHTML = `<div class="py-8 text-center text-rose-500 font-bold text-xs">خطأ: ${err.message}</div>`;
    }
  }

  renderSalesInvoices() {
    const tbody = document.getElementById('sales-invoices-table-body');
    const mobileCards = document.getElementById('sales-invoices-mobile-cards');
    if (!this.salesInvoices) return;

    if (this.salesInvoices.length === 0) {
      if (tbody) tbody.innerHTML = `<tr><td colspan="7" class="py-8 text-center text-gray-400 font-bold">لا توجد فواتير مسجلة</td></tr>`;
      if (mobileCards) mobileCards.innerHTML = `<div class="py-8 text-center text-gray-400 font-bold text-xs">لا توجد فواتير مسجلة</div>`;
      return;
    }

    // 1. Desktop Table
    if (tbody) {
      tbody.innerHTML = this.salesInvoices.map(inv => {
        const isCredit = inv.payment_method.includes('آجل') || inv.payment_method.includes('دين');
        const isDelivery = inv.order_type === 'delivery' || parseFloat(inv.delivery_fee) > 0;
        const isSettled = ['تم التسليم', 'مكتمل', 'completed', 'تم التقفيل'].includes(inv.status);
        const isPendingDelivery = isDelivery && !isSettled;

        let payBadge = '';
        if (isPendingDelivery) {
          payBadge = `<span class="px-2 py-0.5 rounded-lg text-[10px] font-black bg-amber-500 text-white animate-pulse">🛵 دليفري مؤقت (قيد التوصيل)</span>`;
        } else if (isDelivery && isSettled) {
          payBadge = `<span class="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-300">🛵 دليفري خالص وكاشير ✅</span>`;
        } else if (isCredit) {
          payBadge = `<span class="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-rose-50 dark:bg-rose-950/70 text-rose-600 dark:text-rose-400 border border-rose-200">آجل / دين</span>`;
        } else {
          payBadge = `<span class="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/70 text-emerald-600 dark:text-emerald-400 border border-emerald-200">${inv.payment_method}</span>`;
        }

        const netProductsVal = isDelivery ? Math.max(0, parseFloat(inv.total || 0) - parseFloat(inv.delivery_fee || 0)) : parseFloat(inv.total || 0);

        return `
          <tr class="border-b border-gray-100 dark:border-gray-700/60 hover:bg-gray-50/70 dark:hover:bg-gray-700/30 transition text-xs">
            <td class="py-3 px-3 font-mono font-bold text-indigo-600 dark:text-indigo-400">
              #${inv.order_id || inv.id}
            </td>
            <td class="py-3 px-3 font-mono text-gray-500 text-[11px]">
              ${inv.created_at}
            </td>
            <td class="py-3 px-3">
              <div class="font-bold text-gray-900 dark:text-white">${inv.customer_name}</div>
              ${inv.customer_phone ? `<div class="text-[10px] text-gray-400 font-mono">${inv.customer_phone}</div>` : ''}
              ${isDelivery && inv.delivery_person ? `<div class="text-[9.5px] text-indigo-500">الطيار: ${inv.delivery_person}</div>` : ''}
            </td>
            <td class="py-3 px-3">
              ${payBadge}
            </td>
            <td class="py-3 px-3 font-mono font-black text-left text-sm ${isCredit ? 'text-rose-600' : 'text-gray-900 dark:text-white'}" dir="ltr">
              <div>${parseFloat(inv.total || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م</div>
              ${isDelivery && parseFloat(inv.delivery_fee) > 0 ? `<div class="text-[9.5px] font-normal text-gray-400">شامل توصيل ${parseFloat(inv.delivery_fee).toFixed(0)} ج.م</div>` : ''}
            </td>
            <td class="py-3 px-3 text-[11px] text-gray-500">
              ${inv.cashier || 'كاشير المحل'}
            </td>
            <td class="py-3 px-3 text-center">
              <div class="flex items-center justify-center gap-1.5 flex-wrap">
                ${isPendingDelivery ? `
                  <button type="button" onclick="window.ordersController.settleDeliveryOrder('${inv.id}', ${inv.total || 0}, ${inv.delivery_fee || 0})" class="px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs flex items-center gap-1 shadow-xs transition cursor-pointer" title="محاسبة الدليفري ونقل الفاتورة نقداً لكاشير دريم سوفت بدون رسوم التوصيل">
                    <i data-lucide="hand-coins" class="w-3.5 h-3.5"></i>
                    <span>💰 محاسبة ونقل للكاشير</span>
                  </button>
                ` : ''}
                <button type="button" onclick="window.ordersController.viewInvoiceReceipt('${inv.order_id || inv.id}')" class="px-2.5 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-300 font-bold text-xs flex items-center gap-1 border border-indigo-200 dark:border-indigo-800 transition cursor-pointer" title="عرض وطباعة الفاتورة الحرارية">
                  <i data-lucide="printer" class="w-3.5 h-3.5"></i>
                  <span>عرض وطباعة</span>
                </button>
                <button type="button" onclick="window.ordersController.refundInvoiceDirect('${inv.order_id || inv.id}')" class="px-2 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-300 font-bold text-xs flex items-center gap-1 border border-rose-200 dark:border-rose-900/60 transition cursor-pointer" title="استرجاع أصناف الفاتورة">
                  <i data-lucide="rotate-ccw" class="w-3.5 h-3.5"></i>
                  <span>مرتجع</span>
                </button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    }

    // 2. Mobile Responsive Touch Cards
    if (mobileCards) {
      mobileCards.innerHTML = this.salesInvoices.map(inv => {
        const isCredit = inv.payment_method.includes('آجل') || inv.payment_method.includes('دين');
        const isDelivery = inv.order_type === 'delivery' || parseFloat(inv.delivery_fee) > 0;
        const isSettled = ['تم التسليم', 'مكتمل', 'completed', 'تم التقفيل'].includes(inv.status);
        const isPendingDelivery = isDelivery && !isSettled;

        let payBadge = '';
        if (isPendingDelivery) {
          payBadge = `<span class="px-2 py-0.5 rounded-lg text-[10px] font-black bg-amber-500 text-white animate-pulse">🛵 دليفري مؤقت (قيد التوصيل)</span>`;
        } else if (isDelivery && isSettled) {
          payBadge = `<span class="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-300">🛵 دليفري خالص وكاشير ✅</span>`;
        } else if (isCredit) {
          payBadge = `<span class="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-rose-50 dark:bg-rose-950/70 text-rose-600 dark:text-rose-400 border border-rose-200">آجل / دين ⚠️</span>`;
        } else {
          payBadge = `<span class="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/70 text-emerald-600 dark:text-emerald-400 border border-emerald-200">${inv.payment_method} 🟢</span>`;
        }

        return `
          <div class="bg-white dark:bg-gray-800 rounded-2xl p-3.5 border border-gray-200 dark:border-gray-700 shadow-2xs flex flex-col gap-2.5">
            <div class="flex items-start justify-between gap-2">
              <div>
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="font-mono font-black text-sm text-indigo-600 dark:text-indigo-400">#${inv.order_id || inv.id}</span>
                  ${payBadge}
                </div>
                <div class="font-bold text-xs text-gray-900 dark:text-white mt-1">${inv.customer_name}</div>
                <div class="text-[10px] text-gray-400 font-mono mt-0.5">${inv.created_at} • ${inv.cashier || 'كاشير المحل'}</div>
                ${isDelivery && inv.delivery_person ? `<div class="text-[10px] text-indigo-500 mt-0.5">🛵 الطيار: ${inv.delivery_person}</div>` : ''}
              </div>
              <div class="text-left shrink-0">
                <div class="text-[10px] text-gray-400 font-bold">الإجمالي</div>
                <div class="text-base font-black font-mono ${isCredit ? 'text-rose-600' : 'text-gray-900 dark:text-white'}" dir="ltr">
                  ${parseFloat(inv.total || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م
                </div>
                ${isDelivery && parseFloat(inv.delivery_fee) > 0 ? `<div class="text-[9px] text-gray-400">شامل توصيل ${parseFloat(inv.delivery_fee).toFixed(0)} ج.م</div>` : ''}
              </div>
            </div>

            <!-- Action Buttons for Phone -->
            <div class="grid grid-cols-2 gap-2 pt-2 border-t border-gray-100 dark:border-gray-700/60">
              ${isPendingDelivery ? `
                <button type="button" onclick="window.ordersController.settleDeliveryOrder('${inv.id}', ${inv.total || 0}, ${inv.delivery_fee || 0})" class="col-span-2 py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs flex items-center justify-center gap-1.5 shadow-sm transition">
                  <i data-lucide="hand-coins" class="w-4 h-4"></i>
                  <span>💰 محاسبة الدليفري وتوريد للكاشير الأساسي</span>
                </button>
              ` : ''}
              <button type="button" onclick="window.ordersController.viewInvoiceReceipt('${inv.order_id || inv.id}')" class="py-2.5 px-3 rounded-xl bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-300 font-bold text-xs flex items-center justify-center gap-1.5 border border-indigo-200 dark:border-indigo-800 transition shadow-2xs">
                <i data-lucide="printer" class="w-3.5 h-3.5"></i>
                <span>عرض وطباعة</span>
              </button>
              <button type="button" onclick="window.ordersController.refundInvoiceDirect('${inv.order_id || inv.id}')" class="py-2.5 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-300 font-bold text-xs flex items-center justify-center gap-1.5 border border-rose-200 dark:border-rose-900/60 transition shadow-2xs">
                <i data-lucide="rotate-ccw" class="w-3.5 h-3.5"></i>
                <span>استرجاع / مرتجع</span>
              </button>
            </div>
          </div>
        `;
      }).join('');
    }

    if (window.lucide) window.lucide.createIcons();
  }

  onSalesSearchInput(val) {
    if (!this.salesInvoices) this.initSalesLog();
    this.salesSearchQuery = val.trim();
    this.updateSalesFilterBadge();
    clearTimeout(this._searchTimer);
    this._searchTimer = setTimeout(() => {
      this.loadSalesInvoices(true);
    }, 350);
  }

  clearSalesSearch() {
    const input = document.getElementById('sales-search-input');
    if (input) input.value = '';
    this.salesSearchQuery = '';
    this.updateSalesFilterBadge();
    this.loadSalesInvoices(true);
  }

  filterSalesPeriod(period) {
    if (!this.salesInvoices) this.initSalesLog();
    this.salesPeriodFilter = period;
    const range = this.getPeriodDateRange(period);
    this.salesFromDate = range.fromDate;
    this.salesToDate = range.toDate;

    const fromEl = document.getElementById('sales-filter-from-date');
    const toEl = document.getElementById('sales-filter-to-date');
    if (fromEl) fromEl.value = range.fromDate;
    if (toEl) toEl.value = range.toDate;

    this.updateSalesPeriodButtons(period);
    this.loadSalesInvoices(true);
  }

  onSalesDateRangeChange() {
    if (!this.salesInvoices) this.initSalesLog();
    const fromEl = document.getElementById('sales-filter-from-date');
    const toEl = document.getElementById('sales-filter-to-date');
    this.salesFromDate = fromEl ? fromEl.value : '';
    this.salesToDate = toEl ? toEl.value : '';
    this.salesPeriodFilter = (this.salesFromDate || this.salesToDate) ? 'custom' : 'all';
    this.updateSalesPeriodButtons(this.salesPeriodFilter);
    this.loadSalesInvoices(true);
  }

  onSalesFilterChange(debounced = false) {
    if (!this.salesInvoices) this.initSalesLog();
    const val = id => {
      const el = document.getElementById(id);
      return el ? el.value : '';
    };
    this.salesPaymentFilter = val('sales-filter-payment') || 'all';
    this.salesOrderTypeFilter = val('sales-filter-type') || 'all';
    this.salesSourceFilter = val('sales-filter-source') || 'all';
    this.salesCashierFilter = val('sales-filter-cashier').trim();
    this.salesMinTotal = val('sales-filter-min-total').trim();
    this.salesMaxTotal = val('sales-filter-max-total').trim();
    this.salesStatusFilter = val('sales-filter-status');
    this.salesSortBy = val('sales-filter-sort') || 'newest';

    clearTimeout(this._filterTimer);
    if (debounced) {
      this.updateSalesFilterBadge();
      this._filterTimer = setTimeout(() => {
        this.loadSalesInvoices(true);
      }, 350);
    } else {
      this.loadSalesInvoices(true);
    }
  }

  toggleAdvancedSalesFilters() {
    const panel = document.getElementById('sales-advanced-filters');
    const btn = document.getElementById('btn-toggle-advanced-sales-filters');
    if (!panel) return;
    const isHidden = panel.classList.contains('hidden');
    panel.classList.toggle('hidden', !isHidden);
    if (btn) {
      btn.classList.toggle('bg-indigo-600', isHidden);
      btn.classList.toggle('text-white', isHidden);
      btn.classList.toggle('bg-indigo-50', !isHidden);
      btn.classList.toggle('text-indigo-700', !isHidden);
    }
  }

  resetSalesFilters() {
    this.initSalesLog();
    const setVal = (id, v) => {
      const el = document.getElementById(id);
      if (el) el.value = v;
    };
    setVal('sales-search-input', '');
    setVal('sales-filter-from-date', '');
    setVal('sales-filter-to-date', '');
    setVal('sales-filter-payment', 'all');
    setVal('sales-filter-type', 'all');
    setVal('sales-filter-source', 'all');
    setVal('sales-filter-cashier', '');
    setVal('sales-filter-min-total', '');
    setVal('sales-filter-max-total', '');
    setVal('sales-filter-status', '');
    setVal('sales-filter-sort', 'newest');
    this.updateSalesPeriodButtons('all');
    this.loadSalesInvoices(true);
  }

  loadMoreSalesInvoices() {
    this.salesPage += 1;
    this.loadSalesInvoices(false);
  }
  normalizeInvoiceForReceipt(inv) {
    if (!inv) return null;
    let items = Array.isArray(inv.items) ? inv.items : [];
    if (typeof inv.items === 'string') {
      try { items = JSON.parse(inv.items) || []; } catch (e) { items = []; }
    }
    if (items.length === 0 && inv.details) {
      const lines = String(inv.details).split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      items = lines.map(line => {
        const m = line.match(/^(.+?)\s*[×xX*]\s*([\d.]+)\s*=\s*([\d.]+)/);
        if (m) {
          const qty = parseFloat(m[2]) || 1;
          const total = parseFloat(m[3]) || 0;
          return {
            name: m[1].trim(),
            qty,
            price: qty > 0 ? (total / qty) : total,
            total
          };
        }
        return { name: line, qty: 1, price: 0, total: 0 };
      });
    }
    const netTotal = parseFloat(inv.total ?? inv.total_price ?? 0) || 0;
    const paid = parseFloat(inv.paid_amount ?? netTotal) || netTotal;
    return {
      ...inv,
      order_id: inv.order_id || inv.invoice_barcode || inv.id,
      invoice_barcode: inv.invoice_barcode || inv.order_id || ('INV-' + inv.id),
      address: inv.address || inv.customer_address || '',
      items,
      total: netTotal,
      paid_amount: paid,
      change: Math.max(0, paid - netTotal)
    };
  }

  async viewInvoiceReceipt(invoiceId) {
    try {
      const targetKey = String(invoiceId);
      const cached = Array.isArray(this.salesInvoices)
        ? this.salesInvoices.find(x => String(x.order_id) === targetKey || String(x.invoice_barcode) === targetKey || String(x.id) === targetKey)
        : null;

      let orderData = cached || null;
      if (!orderData || ((!orderData.items || orderData.items.length === 0) && !orderData.details)) {
        window.app?.showLoading(true, 'جاري تحميل الفاتورة...');
        const res = await window.api.getOrderDetails(invoiceId);
        window.app?.showLoading(false);
        if (res && res.success && res.order) {
          orderData = orderData ? { ...orderData, ...res.order } : res.order;
        }
      }

      if (!orderData) {
        window.app?.showToast('تعذر العثور على بيانات الفاتورة', 'error');
        return;
      }

      const normalized = this.normalizeInvoiceForReceipt(orderData);
      if (window.cart && typeof window.cart.showReceiptModal === 'function') {
        window.cart.showReceiptModal(normalized);
      } else {
        window.app?.showToast('شاشة عرض الفاتورة غير جاهزة', 'error');
      }
    } catch (err) {
      window.app?.showLoading(false);
      window.app?.showToast(`خطأ في عرض الفاتورة: ${err.message}`, 'error');
    }
  }

  refundInvoiceDirect(invoiceId) {
    if (window.app && window.app.currentView !== 'returns') {
      window.app.switchView('returns');
    }
    setTimeout(() => {
      window.returnsController?.searchInvoice(invoiceId);
    }, 150);
  }

  renderOrders() {
    const container = document.getElementById('web-orders-list');
    if (!container) return;

    if (this.orders.length === 0) {
      container.innerHTML = `
        <div class="p-12 text-center text-gray-400 dark:text-gray-500">
          <i data-lucide="shopping-bag" class="w-12 h-12 mx-auto mb-3 opacity-30"></i>
          <p class="text-sm font-semibold">لا توجد طلبات في هذه الحالة (${this.currentStatusFilter})</p>
        </div>
      `;
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    container.innerHTML = this.orders.map(ord => {
      const isInstaPay = ord.payment_method === 'instapay';
      return `
        <div class="p-4 sm:p-5 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200/80 dark:border-gray-700 shadow-md flex flex-col gap-3.5">
          
          <!-- Order Header -->
          <div class="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-gray-100 dark:border-gray-700">
            <div class="flex items-center gap-2">
              <span class="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-xs">
                #${ord.id}
              </span>
              <div>
                <h4 class="text-sm font-bold text-gray-900 dark:text-white">${ord.customer_name || 'عميل المتجر'}</h4>
                <p class="text-[11px] text-gray-500">${ord.customer_phone || 'بدون هاتف'}</p>
              </div>
            </div>

            <!-- Payment Badge -->
            <div class="flex items-center gap-2">
              ${isInstaPay ? `
                <span class="px-2.5 py-1 rounded-full text-xs font-bold bg-purple-50 dark:bg-purple-950 text-purple-600 dark:text-purple-400 border border-purple-200">
                  📱 إنستاباي (${ord.instapay_ref || 'مسدد'})
                </span>
              ` : `
                <span class="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 border border-emerald-200">
                  💵 دفع عند الاستلام
                </span>
              `}
              <span class="text-sm font-black text-indigo-600 dark:text-indigo-400">${parseFloat(ord.total || 0).toFixed(2)} ج.م</span>
            </div>
          </div>

          <!-- Order Address -->
          ${ord.address ? `
            <div class="text-xs text-gray-600 dark:text-gray-300 flex items-start gap-1.5 bg-gray-50 dark:bg-gray-900/60 p-2.5 rounded-xl">
              <i data-lucide="map-pin" class="w-4 h-4 text-rose-500 shrink-0 mt-0.5"></i>
              <span>${ord.address}</span>
            </div>
          ` : ''}

          <!-- Items Ordered List -->
          <div class="flex flex-col gap-1.5 py-1 text-xs">
            ${(ord.items || []).map(item => `
              <div class="flex justify-between items-center text-gray-700 dark:text-gray-300">
                <span>• ${item.name} <b>× ${item.qty}</b></span>
                <span class="font-mono text-gray-500">${(item.price * item.qty).toFixed(2)} ج.م</span>
              </div>
            `).join('')}
          </div>

          <!-- Order Actions -->
          <div class="flex items-center justify-between flex-wrap gap-2 pt-3 border-t border-gray-100 dark:border-gray-700">
            <div class="flex items-center flex-wrap gap-2">
              <select onchange="window.ordersController.changeStatus(${ord.id}, this.value)" class="bg-gray-100 dark:bg-gray-700 border-none rounded-xl text-xs font-semibold px-3 py-1.5 text-gray-800 dark:text-gray-200">
                <option value="pending" ${ord.status === 'pending' ? 'selected' : ''}>قيد الانتظار (Pending)</option>
                <option value="processing" ${ord.status === 'processing' ? 'selected' : ''}>جاري التجهيز (Processing)</option>
                <option value="shipped" ${ord.status === 'shipped' ? 'selected' : ''}>خرج للتوصيل (Shipped)</option>
                <option value="delivered" ${ord.status === 'delivered' ? 'selected' : ''}>تم التسليم (Delivered)</option>
                <option value="cancelled" ${ord.status === 'cancelled' ? 'selected' : ''}>ملغي (Cancelled)</option>
              </select>

              <!-- Assign Delivery Driver Dropdown -->
              <div class="flex items-center gap-1 bg-gray-50 dark:bg-gray-700/60 px-2 py-0.5 rounded-xl border border-gray-200/60 dark:border-gray-600/60">
                <span class="text-[10px] font-bold text-gray-500">الطيار:</span>
                <select onchange="window.ordersController.assignDriver(${ord.id}, '${ord.invoice_barcode || ''}', this.value)" class="bg-transparent border-none text-xs font-bold px-1 py-1 text-emerald-600 dark:text-emerald-400 focus:ring-0">
                  <option value="">-- بدون تعيين --</option>
                  ${(window.app?.deliveryDrivers || []).map(d => `
                    <option value="${d.name}" ${ord.delivery_person === d.name ? 'selected' : ''}>🛵 ${d.name}</option>
                  `).join('')}
                </select>
              </div>
            </div>

            <button onclick="window.ordersController.printDeliverySlip(${ord.id})" class="px-3 py-1.5 rounded-xl bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 text-gray-700 dark:text-gray-200 text-xs font-semibold flex items-center gap-1.5 transition">
              <i data-lucide="printer" class="w-3.5 h-3.5"></i>
              طباعة بوليصة التوصيل
            </button>
          </div>

        </div>
      `;
    }).join('');

    if (window.lucide) window.lucide.createIcons();
  }

  async assignDriver(orderId, invNumber, driverName) {
    if (!driverName) return;
    try {
      window.app?.showLoading(true, 'جاري إسناد الطلب للطيار...');
      const res = await window.api.assignDeliveryDriver({
        order_id: orderId,
        invoice_number: invNumber,
        delivery_person: driverName
      });
      window.app?.showLoading(false);

      if (res && res.success) {
        window.app?.showToast(`✅ تم إسناد الأوردر للطيار (${driverName}) بنجاح!`, 'success');
        this.loadOrders(this.currentStatusFilter);
      } else {
        throw new Error(res.message || 'فشل إسناد الطلب');
      }
    } catch(e) {
      window.app?.showLoading(false);
      window.app?.showToast(`خطأ: ${e.message}`, 'error');
    }
  }

  async changeStatus(orderId, newStatus) {
    try {
      window.app?.showLoading(true, 'جاري تحديث حالة الطلب...');
      const res = await window.api.updateOrderStatus(orderId, newStatus);
      window.app?.showLoading(false);

      if (res && res.success) {
        window.app?.showToast('تم تحديث حالة الطلب بنجاح ✅', 'success');
        this.loadOrders(this.currentStatusFilter);
      } else {
        throw new Error(res.message || 'فشل التحديث');
      }
    } catch (e) {
      window.app?.showLoading(false);
      window.app?.showToast(`خطأ في تحديث الحالة: ${e.message}`, 'error');
    }
  }

  printDeliverySlip(orderId) {
    const order = this.orders.find(o => o.id === orderId);
    if (!order) return;

    const rawTotal = parseFloat(order.total || order.total_price || 0);
    const delivFee = parseFloat(order.delivery_fee || order.delivery_cost || 0);
    const disc = parseFloat(order.discount || order.discount_amount || 0);
    const rawItems = order.items || [];
    let itemsSubtotal = 0;
    if (Array.isArray(rawItems) && rawItems.length > 0) {
      itemsSubtotal = rawItems.reduce((s, itm) => s + (parseFloat(itm.price || itm.unit_price || 0) * (parseFloat(itm.qty || itm.quantity || 1))), 0);
    }
    if (itemsSubtotal <= 0) {
      itemsSubtotal = Math.max(0, rawTotal - delivFee + disc);
    }

    const receiptData = {
      order_id: order.id,
      invoice_barcode: `WEB-ORD-${order.id}`,
      created_at: new Date().toLocaleString('ar-EG'),
      cashier: 'أوردر أونلاين',
      customer_name: order.customer_name || 'عميل المتجر',
      customer_phone: order.customer_phone || '',
      phone: order.customer_phone || '',
      address: order.address || '',
      delivery_person: order.delivery_person || '',
      delivery_fee: delivFee,
      order_type: 'delivery',
      payment_method: order.payment_method || 'كاش',
      items: rawItems,
      subtotal: itemsSubtotal,
      discount: disc,
      total: rawTotal,
      paid_amount: rawTotal,
      change: 0
    };

    window.cart?.showReceiptModal(receiptData);
  }
  async settleDeliveryOrder(rawId, totalAmount, deliveryFee) {
    const cleanId = String(rawId).replace(/[^0-9]/g, '');
    const numTotal = parseFloat(totalAmount) || 0;
    const numFee = parseFloat(deliveryFee) || 0;
    const netCashierAmount = Math.max(0, numTotal - numFee);

    const confirmed = confirm(
      `🛵 محاسبة وتحصيل أوردر الدليفري رقم #${cleanId}؟\n\n` +
      `• إجمالي الأوردر المطلوب: ${numTotal.toFixed(2)} ج.م\n` +
      `• رسوم خدمة التوصيل للطيار: ${numFee.toFixed(2)} ج.م\n` +
      `-------------------------------------------\n` +
      `💰 الصافي الذي سيدخل خزينة الكاشير الأساسي نقداً: ${netCashierAmount.toFixed(2)} ج.م\n\n` +
      `سيتم تقفيل الفاتورة وترحيلها نقداً فوراً إلى برنامج الكاشير الأساسي (دريم سوفت) بدون خدمة التوصيل.`
    );

    if (!confirmed) return;

    try {
      window.app?.showLoading(true, 'جاري تقفيل الأوردر وترحيله لكاشير دريم سوفت...');
      const res = await window.api.settleDeliveryOrder(cleanId);
      window.app?.showLoading(false);

      if (res && res.success) {
        window.posScanner?.playSuccessBeep();
        window.app?.showToast(`✅ تم تحصيل الأوردر #${cleanId} وترحيله نقداً للكاشير الأساسي (${netCashierAmount.toFixed(2)} ج.م) بنجاح!`, 'success');
        this.loadSalesInvoices();
        if (window.deliverySettlementController) {
          window.deliverySettlementController.loadDrivers();
          window.deliverySettlementController.loadUnassignedOrders();
        }
      } else {
        window.app?.showToast(res.error || 'تعذر تقفيل أوردر الدليفري', 'error');
      }
    } catch (err) {
      window.app?.showLoading(false);
      window.app?.showToast(`خطأ في العملية: ${err.message || err}`, 'error');
    }
  }

}

window.ordersController = new WebOrdersController();
