/**
 * Syrian Home POS - Comprehensive Financial & Statistical Reports Controller
 * Handles:
 * 1. Net Profit & Gross Profit (COGS, Margins, Cash in Drawer, Comparison Chart)
 * 2. Operating Expenses Breakdown & Search (Donut Chart, Daily Timeline, Category Filter)
 * 3. Purchases & Inbound Supplier Invoices (Debts, Paid Amounts, Invoices List)
 * 4. Top Selling Products by Supermarket Category (Rankings, Quantities, Category Revenue)
 * 5. End of Shift / Period Z-Report Thermal Printing
 */

class ReportsController {
  constructor() {
    this.currentPeriod = 'today';
    this.activeSubTab = 'profit';
    this.customFromDate = '';
    this.customToDate = '';

    this.summaryData = null;
    this.expensesData = null;
    this.purchasesData = null;
    this.topSellingData = [];
    this.recentSales = [];

    // Chart.js instances
    this.charts = {
      profitComparison: null,
      expensesDonut: null,
      expensesTimeline: null
    };

    // Client-side search filters
    this.expenseSearchQuery = '';
    this.expenseCategoryFilter = '';
    this.purchasesSearchQuery = '';
    this.topSellingSearchQuery = '';

    // Initialize on DOM ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.init());
    } else {
      this.init();
    }
  }

  init() {
    // Set default dates in custom date filter inputs to today
    const todayStr = new Date().toISOString().split('T')[0];
    const fromInput = document.getElementById('rep-filter-from-date');
    const toInput = document.getElementById('rep-filter-to-date');
    if (fromInput && !fromInput.value) fromInput.value = todayStr;
    if (toInput && !toInput.value) toInput.value = todayStr;

    // Attach Z-Report print button
    const btnPrintZ = document.getElementById('btn-print-zreport');
    if (btnPrintZ) {
      btnPrintZ.onclick = () => this.printZReport();
    }
  }

  // ============================================================
  // 1. SUB-TABS SWITCHING
  // ============================================================
  switchSubTab(tabName) {
    this.activeSubTab = tabName;
    const tabs = ['profit', 'expenses', 'purchases', 'top_selling'];

    tabs.forEach(t => {
      const btn = document.getElementById(`rep-tab-btn-${t}`);
      const content = document.getElementById(`rep-subtab-content-${t}`);

      if (t === tabName) {
        if (btn) {
          btn.className = 'rep-subtab-btn px-4 py-2.5 rounded-2xl text-xs font-black bg-indigo-600 text-white shadow-xs transition flex items-center gap-2 shrink-0 cursor-pointer';
        }
        if (content) {
          content.classList.remove('hidden');
        }
      } else {
        if (btn) {
          btn.className = 'rep-subtab-btn px-4 py-2.5 rounded-2xl text-xs font-bold bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 transition flex items-center gap-2 shrink-0 cursor-pointer';
        }
        if (content) {
          content.classList.add('hidden');
        }
      }
    });

    // Resize/render charts if subtab has charts
    setTimeout(() => {
      if (tabName === 'profit' && this.charts.profitComparison) {
        this.charts.profitComparison.resize();
      } else if (tabName === 'expenses') {
        if (this.charts.expensesDonut) this.charts.expensesDonut.resize();
        if (this.charts.expensesTimeline) this.charts.expensesTimeline.resize();
      }
      if (window.lucide) window.lucide.createIcons();
    }, 50);
  }

  // ============================================================
  // 2. DATA FETCHING & PERIOD MANAGEMENT
  // ============================================================
  async loadReports(period = this.currentPeriod) {
    this.currentPeriod = period;

    // Update Quick Period Buttons styling
    document.querySelectorAll('.report-period-btn').forEach(btn => {
      if (btn.getAttribute('data-period') === period) {
        btn.className = 'report-period-btn px-3 py-1.5 rounded-xl text-xs font-bold bg-indigo-600 text-white shadow-xs transition';
      } else {
        btn.className = 'report-period-btn px-3 py-1.5 rounded-xl text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition';
      }
    });

    // Update Active Period Label
    const periodLabels = {
      'today': 'اليوم (التقرير اليومي)',
      'week': 'آخر 7 أيام (الأسبوعي)',
      'month': 'الشهر الحالي',
      'year': 'العام الحالي',
      'all': 'كامل السجل (الكل)',
      'custom': `فترة مخصصة (${this.customFromDate || 'من'} إلى ${this.customToDate || 'إلى'})`
    };
    const periodLabelEl = document.getElementById('rep-active-period-label');
    if (periodLabelEl) {
      periodLabelEl.textContent = `الفترة الحالية: ${periodLabels[period] || period}`;
    }

    try {
      window.app?.showLoading(true, 'جاري معالجة واستخراج التقارير والرسوم البيانية...');

      const reqPayload = {
        period: period,
        from_date: this.customFromDate,
        to_date: this.customToDate,
        expense_category: this.expenseCategoryFilter,
        expense_search: this.expenseSearchQuery
      };

      let res = null;
      try {
        res = await window.api.getPosReports(reqPayload);
      } catch (err) {
        console.warn('API call failed, will attempt fallback:', err);
      }

      window.app?.showLoading(false);

      if (res && res.success) {
        this.summaryData = res.summary || {};
        this.expensesData = res.expenses_report || {};
        this.purchasesData = res.purchases_report || {};
        this.topSellingData = res.top_selling_by_category || [];
        this.recentSales = res.recent_sales || [];
      } else {
        // Fallback: local orders if server returned empty/offline
        this.compileLocalFallback();
      }

      // Render all 4 sections
      this.renderProfitTab();
      this.renderExpensesTab();
      this.renderPurchasesTab();
      this.renderTopSellingTab();

      if (window.lucide) window.lucide.createIcons();
    } catch (err) {
      window.app?.showLoading(false);
      console.error('Error loading reports:', err);
      window.app?.showToast(`حدث خطأ أثناء تحميل التقارير: ${err.message}`, 'error');
    }
  }

  applyCustomDateFilter() {
    const fromVal = document.getElementById('rep-filter-from-date')?.value;
    const toVal = document.getElementById('rep-filter-to-date')?.value;

    if (!fromVal || !toVal) {
      window.app?.showToast('يرجى اختيار تاريخ البداية وتاريخ النهاية أولاً', 'warning');
      return;
    }

    this.customFromDate = fromVal;
    this.customToDate = toVal;
    this.loadReports('custom');
  }

  compileLocalFallback() {
    try {
      const localOrders = JSON.parse(localStorage.getItem('pos_completed_orders') || '[]');
      let totalSales = 0;
      let totalItems = 0;
      let cashSales = 0;
      let instapaySales = 0;
      let vodafoneSales = 0;
      let cardSales = 0;
      let creditSales = 0;

      localOrders.forEach(ord => {
        const tot = parseFloat(ord.total || ord.total_price || 0);
        totalSales += tot;
        const pm = ord.payment_method || 'كاش';
        if (pm.includes('انستا')) instapaySales += tot;
        else if (pm.includes('فودافون')) vodafoneSales += tot;
        else if (pm.includes('فيزا') || pm.includes('card')) cardSales += tot;
        else if (pm.includes('آجل')) creditSales += tot;
        else cashSales += tot;

        if (Array.isArray(ord.items)) {
          ord.items.forEach(i => totalItems += parseFloat(i.qty || 1));
        }
      });

      this.summaryData = {
        total_sales: totalSales,
        total_cogs: totalSales * 0.75, // Approximation
        gross_profit: totalSales * 0.25,
        gross_margin: 25.0,
        total_all_expenses: 0,
        net_profit: totalSales * 0.25,
        net_margin: 25.0,
        net_cash_in_drawer: cashSales,
        orders_count: localOrders.length,
        total_items_sold: totalItems,
        sales_by_method: {
          'كاش': cashSales,
          'انستا باي': instapaySales,
          'فودافون كاش': vodafoneSales,
          'فيزا': cardSales,
          'آجل': creditSales
        }
      };

      this.expensesData = {
        total_amount: 0,
        filtered_total: 0,
        expenses_by_category: {},
        expenses_by_date: {},
        filtered_expenses: []
      };

      this.purchasesData = {
        total_amount: 0,
        total_paid: 0,
        total_debt: 0,
        invoices_count: 0,
        purchases_list: []
      };

      this.topSellingData = [];
      this.recentSales = localOrders.slice(0, 15);
    } catch (e) {
      console.error('Local fallback failed:', e);
    }
  }

  // ============================================================
  // 3. SUB-TAB 1: NET PROFIT & SALES (صافي الأرباح والمبيعات)
  // ============================================================
  renderProfitTab() {
    const s = this.summaryData || {};
    const totalSales = parseFloat(s.total_sales || 0);
    const totalCogs = parseFloat(s.total_cogs || 0);
    const grossProfit = parseFloat(s.gross_profit || 0);
    const grossMargin = parseFloat(s.gross_margin || 0);
    const totalExpenses = parseFloat(s.total_all_expenses || 0);
    const netProfit = parseFloat(s.net_profit || 0);
    const netMargin = parseFloat(s.net_margin || 0);
    const netCashInDrawer = parseFloat(s.net_cash_in_drawer || 0);
    const ordersCount = parseInt(s.orders_count || 0, 10);
    const totalItems = parseFloat(s.total_items_sold || 0);

    // KPI Cards
    this.setText('rep-total-sales', `${totalSales.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`);
    this.setText('rep-orders-count-sub', `${ordersCount} فاتورة • ${totalItems.toLocaleString('en-US', { maximumFractionDigits: 2 })} صنف/وزن`);
    this.setText('rep-total-cogs', `${totalCogs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`);
    this.setText('rep-gross-profit', `${grossProfit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`);
    this.setText('rep-gross-margin', `هامش الربح التجاري: ${grossMargin.toFixed(1)}%`);
    this.setText('rep-total-expenses', `${totalExpenses.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`);

    // Net profit styling (Green if profit, Red if deficit)
    const netProfitEl = document.getElementById('rep-net-profit');
    const netBadgeEl = document.getElementById('rep-net-profit-badge');
    if (netProfitEl) {
      netProfitEl.textContent = `${netProfit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;
      if (netProfit >= 0) {
        netProfitEl.className = 'text-base sm:text-lg font-black text-emerald-800 dark:text-emerald-300 mt-1 font-mono';
        if (netBadgeEl) {
          netBadgeEl.textContent = 'صافي ربح';
          netBadgeEl.className = 'px-1.5 py-0.2 rounded-md bg-emerald-600 text-white text-[9px] font-bold font-mono';
        }
      } else {
        netProfitEl.className = 'text-base sm:text-lg font-black text-rose-600 dark:text-rose-400 mt-1 font-mono';
        if (netBadgeEl) {
          netBadgeEl.textContent = 'عجز / خسارة';
          netBadgeEl.className = 'px-1.5 py-0.2 rounded-md bg-rose-600 text-white text-[9px] font-bold font-mono';
        }
      }
    }
    this.setText('rep-net-margin', `صافي هامش الربح: ${netMargin.toFixed(1)}%`);
    this.setText('rep-cash-in-drawer', `${netCashInDrawer.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`);

    // Payment Method Pills
    const pm = s.sales_by_method || {};
    this.setText('rep-pm-cash', `${parseFloat(pm['كاش'] || 0).toFixed(2)} ج.م`);
    this.setText('rep-pm-instapay', `${parseFloat(pm['انستا باي'] || 0).toFixed(2)} ج.م`);
    this.setText('rep-pm-vodafone', `${parseFloat(pm['فودافون كاش'] || 0).toFixed(2)} ج.م`);
    this.setText('rep-pm-card', `${parseFloat(pm['فيزا'] || 0).toFixed(2)} ج.م`);
    this.setText('rep-pm-credit', `${parseFloat(pm['آجل'] || 0).toFixed(2)} ج.م`);

    // Comparison Chart (Sales vs COGS vs Expenses vs Net Profit)
    this.renderProfitComparisonChart(totalSales, totalCogs, totalExpenses, netProfit);

    // Recent Sales Table
    this.renderRecentSalesTable();
  }

  renderProfitComparisonChart(sales, cogs, expenses, netProfit) {
    const canvas = document.getElementById('profit-comparison-chart');
    if (!canvas || !window.Chart) return;

    if (this.charts.profitComparison) {
      this.charts.profitComparison.destroy();
      this.charts.profitComparison = null;
    }

    const isDark = document.documentElement.classList.contains('dark');
    const textColor = isDark ? '#cbd5e1' : '#334155';
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)';

    const ctx = canvas.getContext('2d');
    this.charts.profitComparison = new window.Chart(ctx, {
      type: 'bar',
      data: {
        labels: [
          'إجمالي المبيعات',
          'تكلفة البضاعة (COGS)',
          'المصروفات والرواتب',
          'صافي الأرباح'
        ],
        datasets: [{
          label: 'المبلغ (ج.م)',
          data: [sales, cogs, expenses, netProfit],
          backgroundColor: [
            'rgba(99, 102, 241, 0.85)',
            'rgba(100, 116, 139, 0.85)',
            'rgba(244, 63, 94, 0.85)',
            netProfit >= 0 ? 'rgba(16, 185, 129, 0.85)' : 'rgba(239, 68, 68, 0.85)'
          ],
          borderColor: [
            '#4f46e5',
            '#475569',
            '#e11d48',
            netProfit >= 0 ? '#059669' : '#dc2626'
          ],
          borderWidth: 2,
          borderRadius: 8
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            rtl: true,
            callbacks: {
              label: (context) => ` ${context.parsed.y.toLocaleString('en-US', { minimumFractionDigits: 2 })} ج.م`
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              color: textColor,
              font: { family: 'Cairo, sans-serif', weight: 'bold', size: 11 }
            }
          },
          y: {
            grid: { color: gridColor },
            ticks: {
              color: textColor,
              font: { family: 'Cairo, monospace', size: 10 },
              callback: (value) => `${value.toLocaleString('en-US')} ج.م`
            }
          }
        }
      }
    });
  }

  renderRecentSalesTable() {
    const tableContainer = document.getElementById('rep-recent-sales-list');
    if (!tableContainer) return;

    const list = this.recentSales || [];
    if (list.length === 0) {
      tableContainer.innerHTML = `
        <div class="py-8 text-center text-gray-400">
          <i data-lucide="receipt" class="w-8 h-8 mx-auto mb-2 opacity-40"></i>
          <p class="text-xs font-semibold">لا توجد عمليات بيع مسجلة في هذه الفترة</p>
        </div>
      `;
      return;
    }

    tableContainer.innerHTML = `
      <div class="overflow-x-auto">
        <table class="w-full text-right text-xs">
          <thead class="bg-gray-50 dark:bg-gray-900/60 text-gray-500 font-bold border-b border-gray-100 dark:border-gray-700">
            <tr>
              <th class="p-3"># الفاتورة</th>
              <th class="p-3">التاريخ والوقت</th>
              <th class="p-3">طريقة الدفع</th>
              <th class="p-3">المبلغ الإجمالي</th>
              <th class="p-3">العميل / الكاشير</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100 dark:divide-gray-700">
            ${list.map((sale, idx) => `
              <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition">
                <td class="p-3 font-mono font-bold text-indigo-600 dark:text-indigo-400">#${sale.invoice_barcode || sale.order_id || sale.id || (idx + 1)}</td>
                <td class="p-3 text-gray-500 font-mono text-[11px]">${sale.created_at || 'اليوم'}</td>
                <td class="p-3">
                  <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    (sale.payment_method || '').includes('انستا') ? 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300' :
                    (sale.payment_method || '').includes('فودافون') ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300' :
                    (sale.payment_method || '').includes('فيزا') ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300' :
                    (sale.payment_method || '').includes('آجل') ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300' :
                    'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                  }">${sale.payment_method || 'كاش'}</span>
                </td>
                <td class="p-3 font-bold font-mono text-gray-900 dark:text-white">${parseFloat(sale.total_price || 0).toFixed(2)} ج.م</td>
                <td class="p-3 text-gray-600 dark:text-gray-300">${sale.customer_name || sale.cashier_name || 'عميل نقدي'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  // ============================================================
  // 4. SUB-TAB 2: EXPENSES & CHARTS (المصروفات والرسم البياني)
  // ============================================================
  onExpenseFilterChanged() {
    this.expenseSearchQuery = (document.getElementById('rep-expense-search-input')?.value || '').trim();
    this.expenseCategoryFilter = (document.getElementById('rep-expense-category-filter')?.value || '').trim();

    this.renderExpensesTableAndSummary();
  }

  resetExpenseFilters() {
    const searchEl = document.getElementById('rep-expense-search-input');
    const catEl = document.getElementById('rep-expense-category-filter');
    if (searchEl) searchEl.value = '';
    if (catEl) catEl.value = '';

    this.expenseSearchQuery = '';
    this.expenseCategoryFilter = '';
    this.renderExpensesTableAndSummary();
  }

  renderExpensesTab() {
    const exp = this.expensesData || {};
    const totalAmount = parseFloat(exp.total_amount || 0);
    const allExpenses = exp.filtered_expenses || [];

    const count = allExpenses.length;
    const avg = count > 0 ? (totalAmount / count) : 0;

    this.setText('rep-exp-all-total', `${totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`);
    this.setText('rep-exp-count', `${count} إيصال`);
    this.setText('rep-exp-avg', `${avg.toFixed(2)} ج.م`);

    // Render Charts
    this.renderExpensesDonutChart(exp.expenses_by_category || {});
    this.renderExpensesTimelineChart(exp.expenses_by_date || {});

    // Render filtered table & dynamic total
    this.renderExpensesTableAndSummary();
  }

  renderExpensesTableAndSummary() {
    const exp = this.expensesData || {};
    const allExpenses = exp.filtered_expenses || [];

    const sTerm = this.expenseSearchQuery.toLowerCase();
    const catTerm = this.expenseCategoryFilter.toLowerCase();

    const matched = allExpenses.filter(item => {
      const cat = (item.category || '').toLowerCase();
      const note = (item.note || '').toLowerCase();
      const pm = (item.payment_method || '').toLowerCase();
      const partner = (item.partner_name || '').toLowerCase();

      let matchCat = true;
      if (catTerm && catTerm !== 'all') {
        matchCat = cat.includes(catTerm);
      }

      let matchSearch = true;
      if (sTerm) {
        matchSearch = cat.includes(sTerm) || note.includes(sTerm) || pm.includes(sTerm) || partner.includes(sTerm);
      }

      return matchCat && matchSearch;
    });

    const filteredSum = matched.reduce((acc, cur) => acc + parseFloat(cur.amount || 0), 0);
    this.setText('rep-filtered-expenses-total', `${filteredSum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`);

    // Render Table
    const container = document.getElementById('rep-expenses-table-container');
    if (!container) return;

    if (matched.length === 0) {
      container.innerHTML = `
        <div class="py-8 text-center text-gray-400">
          <i data-lucide="receipt" class="w-8 h-8 mx-auto mb-2 opacity-40"></i>
          <p class="text-xs font-semibold">لا توجد مصروفات تطابق البحث أو الفلترة المحددة</p>
        </div>
      `;
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    container.innerHTML = `
      <div class="overflow-x-auto">
        <table class="w-full text-right text-xs">
          <thead class="bg-rose-50/50 dark:bg-rose-950/30 text-gray-500 font-bold border-b border-gray-100 dark:border-gray-700">
            <tr>
              <th class="p-3">التاريخ والوقت</th>
              <th class="p-3">بند المصروف / الفئة</th>
              <th class="p-3">البيان والتفاصيل</th>
              <th class="p-3">طريقة الصرف</th>
              <th class="p-3 text-left">المبلغ المنصرف</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100 dark:divide-gray-700">
            ${matched.map(item => `
              <tr class="hover:bg-rose-50/20 dark:hover:bg-rose-950/10 transition">
                <td class="p-3 text-gray-500 font-mono text-[11px]">${item.date || item.created_at || 'اليوم'}</td>
                <td class="p-3">
                  <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900">
                    <span class="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                    ${item.category || 'نثريات'}
                  </span>
                </td>
                <td class="p-3 font-medium text-gray-800 dark:text-gray-200">${item.note || item.partner_name || 'بدون بيان'}</td>
                <td class="p-3">
                  <span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                    ${item.payment_method || 'كاش'}
                  </span>
                </td>
                <td class="p-3 text-left font-black font-mono text-rose-600 dark:text-rose-400 text-sm">
                  ${parseFloat(item.amount || 0).toFixed(2)} ج.م
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
  }

  renderExpensesDonutChart(byCategory) {
    const canvas = document.getElementById('expenses-donut-chart');
    if (!canvas || !window.Chart) return;

    if (this.charts.expensesDonut) {
      this.charts.expensesDonut.destroy();
      this.charts.expensesDonut = null;
    }

    const labels = Object.keys(byCategory);
    const data = Object.values(byCategory);

    if (labels.length === 0) {
      labels.push('لا توجد مصروفات');
      data.push(0);
    }

    const palette = [
      '#f43f5e', '#8b5cf6', '#3b82f6', '#10b981', '#f59e0b',
      '#06b6d4', '#ec4899', '#6366f1', '#14b8a6', '#84cc16', '#64748b'
    ];

    const ctx = canvas.getContext('2d');
    this.charts.expensesDonut = new window.Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: data,
          backgroundColor: palette.slice(0, labels.length),
          borderWidth: 2,
          borderColor: document.documentElement.classList.contains('dark') ? '#1e293b' : '#ffffff'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '65%',
        plugins: {
          legend: {
            position: 'right',
            rtl: true,
            labels: {
              boxWidth: 12,
              font: { family: 'Cairo, sans-serif', size: 10, weight: 'bold' },
              color: document.documentElement.classList.contains('dark') ? '#cbd5e1' : '#475569'
            }
          },
          tooltip: {
            rtl: true,
            callbacks: {
              label: (ctx) => ` ${ctx.label}: ${ctx.parsed.toLocaleString('en-US', { minimumFractionDigits: 2 })} ج.م`
            }
          }
        }
      }
    });
  }

  renderExpensesTimelineChart(byDate) {
    const canvas = document.getElementById('expenses-timeline-chart');
    if (!canvas || !window.Chart) return;

    if (this.charts.expensesTimeline) {
      this.charts.expensesTimeline.destroy();
      this.charts.expensesTimeline = null;
    }

    const isDark = document.documentElement.classList.contains('dark');
    const textColor = isDark ? '#cbd5e1' : '#334155';
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)';

    const labels = Object.keys(byDate).sort();
    const data = labels.map(d => byDate[d]);

    const ctx = canvas.getContext('2d');
    this.charts.expensesTimeline = new window.Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels.length > 0 ? labels : ['اليوم'],
        datasets: [{
          label: 'المصروفات اليومية',
          data: data.length > 0 ? data : [0],
          backgroundColor: 'rgba(168, 85, 247, 0.75)',
          borderColor: '#9333ea',
          borderWidth: 2,
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            rtl: true,
            callbacks: {
              label: (ctx) => ` ${ctx.parsed.y.toLocaleString('en-US', { minimumFractionDigits: 2 })} ج.م`
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              color: textColor,
              font: { family: 'Cairo, monospace', size: 10 }
            }
          },
          y: {
            grid: { color: gridColor },
            ticks: {
              color: textColor,
              font: { family: 'Cairo, monospace', size: 10 },
              callback: (val) => `${val.toLocaleString('en-US')} ج.م`
            }
          }
        }
      }
    });
  }

  // ============================================================
  // 5. SUB-TAB 3: PURCHASES REPORT (تقرير المشتريات ككل)
  // ============================================================
  filterPurchasesTable() {
    this.purchasesSearchQuery = (document.getElementById('rep-purch-search-input')?.value || '').trim().toLowerCase();
    this.renderPurchasesTable();
  }

  renderPurchasesTab() {
    const p = this.purchasesData || {};
    const totalAmount = parseFloat(p.total_amount || 0);
    const totalPaid = parseFloat(p.total_paid || 0);
    const totalDebt = parseFloat(p.total_debt || 0);
    const count = parseInt(p.invoices_count || 0, 10);
    const paidRatio = totalAmount > 0 ? ((totalPaid / totalAmount) * 100) : 0;

    this.setText('rep-purch-total', `${totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`);
    this.setText('rep-purch-invoices-sub', `${count} فاتورة توريد`);
    this.setText('rep-purch-paid', `${totalPaid.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`);
    this.setText('rep-purch-debt', `${totalDebt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`);
    this.setText('rep-purch-paid-ratio', `${paidRatio.toFixed(1)}%`);

    this.renderPurchasesTable();
  }

  renderPurchasesTable() {
    const p = this.purchasesData || {};
    const list = p.purchases_list || [];
    const container = document.getElementById('rep-purchases-table-container');
    if (!container) return;

    const query = this.purchasesSearchQuery;
    const filtered = list.filter(item => {
      if (!query) return true;
      const supp = (item.supplier_name || '').toLowerCase();
      const inv = (item.invoice_number || '').toLowerCase();
      const pm = (item.payment_method || '').toLowerCase();
      return supp.includes(query) || inv.includes(query) || pm.includes(query);
    });

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="py-8 text-center text-gray-400">
          <i data-lucide="truck" class="w-8 h-8 mx-auto mb-2 opacity-40"></i>
          <p class="text-xs font-semibold">لا توجد فواتير مشتريات مسجلة في هذه الفترة</p>
        </div>
      `;
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    container.innerHTML = `
      <div class="overflow-x-auto">
        <table class="w-full text-right text-xs">
          <thead class="bg-amber-50/50 dark:bg-amber-950/30 text-gray-500 font-bold border-b border-gray-100 dark:border-gray-700">
            <tr>
              <th class="p-3"># الفاتورة</th>
              <th class="p-3">التاريخ</th>
              <th class="p-3">اسم المورد</th>
              <th class="p-3">إجمالي الفاتورة</th>
              <th class="p-3">المدفوع</th>
              <th class="p-3">المتبقي (الآجل)</th>
              <th class="p-3">طريقة الدفع</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100 dark:divide-gray-700">
            ${filtered.map(inv => {
              const tot = parseFloat(inv.total_amount || 0);
              const paid = parseFloat(inv.paid_amount || 0);
              const remaining = Math.max(0, tot - paid);

              return `
                <tr class="hover:bg-amber-50/20 dark:hover:bg-amber-950/10 transition">
                  <td class="p-3 font-mono font-bold text-amber-600 dark:text-amber-400">#${inv.invoice_number || inv.id}</td>
                  <td class="p-3 text-gray-500 font-mono text-[11px]">${inv.invoice_date || inv.created_at || 'اليوم'}</td>
                  <td class="p-3 font-bold text-gray-900 dark:text-white">${inv.supplier_name || 'مورد عام'}</td>
                  <td class="p-3 font-bold font-mono text-gray-900 dark:text-white">${tot.toFixed(2)} ج.م</td>
                  <td class="p-3 font-bold font-mono text-emerald-600 dark:text-emerald-400">${paid.toFixed(2)} ج.م</td>
                  <td class="p-3 font-bold font-mono ${remaining > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-gray-400'}">
                    ${remaining > 0 ? `${remaining.toFixed(2)} ج.م` : 'خالص ✔'}
                  </td>
                  <td class="p-3">
                    <span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                      ${inv.payment_method || 'كاش'}
                    </span>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
  }

  // ============================================================
  // 6. SUB-TAB 4: TOP SELLING BY CATEGORY (الأكثر مبيعاً من كل فئة)
  // ============================================================
  filterTopSellingDisplay() {
    this.topSellingSearchQuery = (document.getElementById('rep-top-selling-search')?.value || '').trim().toLowerCase();
    this.renderTopSellingTab();
  }

  renderTopSellingTab() {
    const container = document.getElementById('rep-top-selling-container');
    if (!container) return;

    const data = this.topSellingData || [];
    const query = this.topSellingSearchQuery;

    if (data.length === 0) {
      container.innerHTML = `
        <div class="py-12 text-center text-gray-400 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700">
          <i data-lucide="award" class="w-10 h-10 mx-auto mb-2 opacity-40"></i>
          <p class="text-sm font-bold">لا توجد بيانات مبيعات منتجات في هذه الفترة</p>
          <p class="text-xs text-gray-500 mt-1">سجل مبيعات لإظهار المنتجات الأكثر طلباً في كل قسم</p>
        </div>
      `;
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    // Filter categories and their products
    const filteredCategories = [];
    data.forEach(catGroup => {
      const catName = catGroup.category_name || 'عام';
      const catMatches = !query || catName.toLowerCase().includes(query);

      const matchingProds = (catGroup.products || []).filter(p => {
        if (!query) return true;
        return (p.name || '').toLowerCase().includes(query) ||
               (p.barcode || '').toLowerCase().includes(query) ||
               catMatches;
      });

      if (matchingProds.length > 0) {
        filteredCategories.push({
          ...catGroup,
          products: matchingProds
        });
      }
    });

    if (filteredCategories.length === 0) {
      container.innerHTML = `
        <div class="py-8 text-center text-gray-400 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700">
          <p class="text-xs font-semibold">لا توجد أصناف تطابق كلمة البحث في الفئات</p>
        </div>
      `;
      return;
    }

    container.innerHTML = filteredCategories.map(cat => {
      const catRev = parseFloat(cat.total_category_revenue || 0);
      const catQty = parseFloat(cat.total_category_qty || 0);
      const prods = cat.products || [];
      const topQty = prods.length > 0 ? parseFloat(prods[0].total_qty || 1) : 1;

      return `
        <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-2xs overflow-hidden flex flex-col">
          <!-- Category Header -->
          <div class="p-4 bg-gray-50/70 dark:bg-gray-900/40 border-b border-gray-100 dark:border-gray-700 flex flex-wrap items-center justify-between gap-3">
            <div class="flex items-center gap-2">
              <span class="w-3 h-3 rounded-full bg-emerald-500"></span>
              <h4 class="text-sm font-black text-gray-900 dark:text-white">قسم: ${cat.category_name}</h4>
              <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                ${prods.length} صنف مسجل
              </span>
            </div>
            <div class="flex items-center gap-4 text-xs">
              <span class="text-gray-500">
                إجمالي المبيعات: <strong class="text-gray-900 dark:text-white font-mono">${catRev.toLocaleString('en-US', { minimumFractionDigits: 2 })} ج.م</strong>
              </span>
              <span class="text-gray-500">
                الكميات: <strong class="text-emerald-600 dark:text-emerald-400 font-mono">${catQty.toLocaleString('en-US', { maximumFractionDigits: 2 })}</strong>
              </span>
            </div>
          </div>

          <!-- Products Ranking List -->
          <div class="divide-y divide-gray-100 dark:divide-gray-700/60">
            ${prods.map((prod, idx) => {
              const rank = idx + 1;
              const pQty = parseFloat(prod.total_qty || 0);
              const pRev = parseFloat(prod.total_revenue || 0);
              const pct = topQty > 0 ? Math.min(100, Math.round((pQty / topQty) * 100)) : 0;

              // Rank Badge Styling
              let rankBadge = '';
              if (rank === 1) {
                rankBadge = '<span class="w-6 h-6 rounded-full bg-amber-500 text-white font-black text-xs flex items-center justify-center shadow-xs">🥇</span>';
              } else if (rank === 2) {
                rankBadge = '<span class="w-6 h-6 rounded-full bg-slate-400 text-white font-black text-xs flex items-center justify-center shadow-xs">🥈</span>';
              } else if (rank === 3) {
                rankBadge = '<span class="w-6 h-6 rounded-full bg-amber-700 text-white font-black text-xs flex items-center justify-center shadow-xs">🥉</span>';
              } else {
                rankBadge = `<span class="w-6 h-6 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-bold text-xs flex items-center justify-center">#${rank}</span>`;
              }

              return `
                <div class="p-3.5 hover:bg-gray-50/60 dark:hover:bg-gray-700/30 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div class="flex items-center gap-3 min-w-0 flex-1">
                    ${rankBadge}
                    <div class="min-w-0">
                      <div class="text-xs font-black text-gray-900 dark:text-white truncate">${prod.name}</div>
                      <div class="text-[10px] text-gray-400 font-mono flex items-center gap-2 mt-0.5">
                        ${prod.barcode ? `<span>باركود: ${prod.barcode}</span>` : ''}
                        <span>سعر البيع: ${parseFloat(prod.unit_price || 0).toFixed(2)} ج.م</span>
                      </div>
                    </div>
                  </div>

                  <div class="flex items-center gap-4 shrink-0 justify-between sm:justify-end">
                    <div class="w-24 hidden md:block">
                      <div class="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-1.5 overflow-hidden">
                        <div class="bg-emerald-500 h-1.5 rounded-full" style="width: ${pct}%"></div>
                      </div>
                      <span class="text-[9px] text-gray-400 font-mono text-center block mt-0.5">${pct}% من الأكثر طلباً</span>
                    </div>

                    <div class="text-right sm:text-left min-w-[70px]">
                      <span class="text-[10px] text-gray-400 block">الكمية المباعة</span>
                      <span class="text-xs font-black font-mono text-emerald-700 dark:text-emerald-400">
                        ${pQty.toLocaleString('en-US', { maximumFractionDigits: 3 })}
                      </span>
                    </div>

                    <div class="text-left min-w-[90px]">
                      <span class="text-[10px] text-gray-400 block">الإيراد المحقق</span>
                      <span class="text-xs font-black font-mono text-gray-900 dark:text-white">
                        ${pRev.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م
                      </span>
                    </div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }).join('');

    if (window.lucide) window.lucide.createIcons();
  }

  // ============================================================
  // 7. THERMAL RECEIPT Z-REPORT PRINTING
  // ============================================================
  printZReport() {
    const s = this.summaryData || {};
    const printArea = document.getElementById('receipt-print-area');
    if (!printArea) return;

    const totalSales = parseFloat(s.total_sales || 0);
    const totalCogs = parseFloat(s.total_cogs || 0);
    const grossProfit = parseFloat(s.gross_profit || 0);
    const totalExpenses = parseFloat(s.total_all_expenses || 0);
    const netProfit = parseFloat(s.net_profit || 0);
    const netCashInDrawer = parseFloat(s.net_cash_in_drawer || 0);
    const ordersCount = s.orders_count || 0;
    const itemsCount = s.total_items_sold || 0;

    const pm = s.sales_by_method || {};
    const cashSales = parseFloat(pm['كاش'] || 0);
    const instapaySales = parseFloat(pm['انستا باي'] || 0);
    const vodafoneSales = parseFloat(pm['فودافون كاش'] || 0);
    const cardSales = parseFloat(pm['فيزا'] || 0);
    const creditSales = parseFloat(pm['آجل'] || 0);

    const periodNames = {
      'today': 'اليوم (التقرير اليومي)',
      'week': 'الأسبوع الحالي',
      'month': 'الشهر الحالي',
      'year': 'العام الحالي',
      'all': 'كامل السجل',
      'custom': `فترة مخصصة (${this.customFromDate} إلى ${this.customToDate})`
    };

    const zReportHTML = `
      <div class="receipt-header">
        <div class="receipt-store-title">سوبر ماركت المنزل السوري</div>
        <div class="receipt-store-sub">تقرير الحسابات والإقفال المالي (Z-Report)</div>
        <div class="receipt-store-sub">الفترة: ${periodNames[this.currentPeriod] || this.currentPeriod}</div>
      </div>

      <div class="receipt-meta">
        <div class="receipt-meta-row">
          <span>تاريخ الطباعة:</span>
          <span>${new Date().toLocaleString('ar-EG')}</span>
        </div>
        <div class="receipt-meta-row">
          <span>عدد الفواتير:</span>
          <span>${ordersCount} فاتورة</span>
        </div>
        <div class="receipt-meta-row">
          <span>إجمالي الأصناف:</span>
          <span>${itemsCount} قطعة/كجم</span>
        </div>
      </div>

      <div class="receipt-divider">--------------------------------</div>

      <div class="receipt-totals">
        <div class="receipt-total-row">
          <span>إجمالي المبيعات:</span>
          <span><b>${totalSales.toFixed(2)} ج.م</b></span>
        </div>
        <div class="receipt-total-row">
          <span>تكلفة البضاعة المباعة:</span>
          <span>${totalCogs.toFixed(2)} ج.م</span>
        </div>
        <div class="receipt-total-row">
          <span>مجمل الربح التجاري:</span>
          <span>${grossProfit.toFixed(2)} ج.م</span>
        </div>
        <div class="receipt-total-row">
          <span>إجمالي المصروفات والرواتب:</span>
          <span>${totalExpenses.toFixed(2)} ج.م</span>
        </div>
        <div class="receipt-total-row" style="font-size: 1.1em; border-top: 1px dashed #000; padding-top: 4px;">
          <span><b>صافي الأرباح الفعلي:</b></span>
          <span><b>${netProfit.toFixed(2)} ج.م</b></span>
        </div>
        <div class="receipt-total-row">
          <span><b>نقدية الكاش بالدرج:</b></span>
          <span><b>${netCashInDrawer.toFixed(2)} ج.م</b></span>
        </div>
      </div>

      <div class="receipt-divider">--- تفصيل طرق التحصيل ---</div>

      <div class="receipt-totals">
        <div class="receipt-total-row">
          <span>نقدية كاش:</span>
          <span>${cashSales.toFixed(2)} ج.م</span>
        </div>
        <div class="receipt-total-row">
          <span>إنستاباي (InstaPay):</span>
          <span>${instapaySales.toFixed(2)} ج.م</span>
        </div>
        <div class="receipt-total-row">
          <span>فودافون كاش:</span>
          <span>${vodafoneSales.toFixed(2)} ج.م</span>
        </div>
        <div class="receipt-total-row">
          <span>فيزا وبطاقات:</span>
          <span>${cardSales.toFixed(2)} ج.م</span>
        </div>
        <div class="receipt-total-row">
          <span>آجل ودليفري:</span>
          <span>${creditSales.toFixed(2)} ج.م</span>
        </div>
      </div>

      <div class="receipt-footer">
        <p>توقيع مسؤول الوردية: .........................</p>
        <p>تم استخراج التقرير آلياً عبر منظومة الكاشير</p>
      </div>
    `;

    printArea.innerHTML = zReportHTML;
    window.print();
  }

  // ============================================================
  // HELPERS
  // ============================================================
  setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }
}

// Global Singleton Instance
window.reportsController = new ReportsController();
