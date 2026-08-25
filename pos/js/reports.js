/**
 * Syrian Home POS - Shift & Financial Reports Controller
 * Calculates and displays live daily sales summaries, payment breakdowns, transaction history, and Z-Reports.
 */

class ReportsController {
  constructor() {
    this.currentPeriod = 'today';
    this.summaryData = null;
    this.recentSales = [];
  }

  async loadReports(period = this.currentPeriod) {
    this.currentPeriod = period;

    // Update UI tabs
    document.querySelectorAll('.report-period-btn').forEach(btn => {
      if (btn.getAttribute('data-period') === period) {
        btn.className = 'report-period-btn px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 text-white shadow-sm';
      } else {
        btn.className = 'report-period-btn px-4 py-2 rounded-xl text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700';
      }
    });

    try {
      window.app?.showLoading(true, 'جاري جلب تقارير المبيعات...');
      
      let serverSummary = null;
      try {
        const res = await window.api.getPosReports(period);
        if (res && res.success) {
          serverSummary = res.summary || res;
        }
      } catch (e) {
        console.warn('API reports unavailable, falling back to local storage:', e);
      }

      window.app?.showLoading(false);

      // Compute local sales from cache
      const localOrders = this.getLocalOrdersForPeriod(period);
      
      this.compileReports(serverSummary, localOrders);
      this.renderReports();
    } catch (err) {
      window.app?.showLoading(false);
      window.app?.showToast(`خطأ في جلب التقارير: ${err.message}`, 'error');
    }
  }

  getLocalOrdersForPeriod(period) {
    try {
      const allOrders = JSON.parse(localStorage.getItem('pos_completed_orders') || '[]');
      const now = new Date();

      return allOrders.filter(ord => {
        if (!ord.created_at) return true;
        // If today
        if (period === 'today') {
          return true; // Keep recent session orders
        }
        return true;
      });
    } catch (e) {
      return [];
    }
  }

  compileReports(serverData, localOrders) {
    // Start with server figures if available
    let totalSales = parseFloat(serverData?.total_sales || 0);
    let totalInvoices = parseInt(serverData?.orders_count || serverData?.total_invoices || 0, 10);
    let totalItems = parseInt(serverData?.total_items_sold || 0, 10);
    
    let cashSales = parseFloat(serverData?.sales_by_method?.['كاش'] || serverData?.cash_sales || 0);
    let instapaySales = parseFloat(serverData?.sales_by_method?.['انستا باي'] || serverData?.instapay_sales || 0);
    let vodafoneSales = parseFloat(serverData?.sales_by_method?.['فودافون كاش'] || serverData?.vodafone_sales || 0);
    let cardSales = parseFloat(serverData?.sales_by_method?.['فيزا'] || serverData?.card_sales || 0);

    let recentList = Array.isArray(serverData?.recent_sales) ? [...serverData.recent_sales] : [];

    // If server was offline or empty, calculate from localOrders
    if (totalSales === 0 && localOrders.length > 0) {
      localOrders.forEach(ord => {
        const tot = parseFloat(ord.total || 0);
        totalSales += tot;
        totalInvoices += 1;

        const pm = ord.payment_method || 'كاش';
        if (pm.includes('انستا') || pm.includes('instapay')) instapaySales += tot;
        else if (pm.includes('فودافون') || pm.includes('vodafone')) vodafoneSales += tot;
        else if (pm.includes('فيزا') || pm.includes('card')) cardSales += tot;
        else cashSales += tot;

        if (Array.isArray(ord.items)) {
          ord.items.forEach(i => totalItems += parseFloat(i.qty || 1));
        }

        recentList.push({
          order_id: ord.order_id || ord.id,
          invoice_barcode: ord.invoice_barcode,
          total_price: tot.toFixed(2),
          payment_method: pm,
          customer_name: ord.customer_name || 'نقدي',
          created_at: ord.created_at || 'اليوم'
        });
      });
    }

    this.summaryData = {
      total_sales: totalSales,
      orders_count: totalInvoices,
      total_invoices: totalInvoices,
      total_items_sold: totalItems,
      cash_sales: cashSales,
      instapay_sales: instapaySales,
      vodafone_sales: vodafoneSales,
      card_sales: cardSales,
      sales_by_method: {
        'كاش': cashSales,
        'انستا باي': instapaySales,
        'فودافون كاش': vodafoneSales,
        'فيزا': cardSales
      },
      net_cash_in_drawer: cashSales,
      recent_sales: recentList
    };
  }

  renderReports() {
    const s = this.summaryData || {
      total_sales: 0,
      cash_sales: 0,
      instapay_sales: 0,
      vodafone_sales: 0,
      total_invoices: 0,
      total_items_sold: 0,
      recent_sales: []
    };

    const vodafoneSales = s.sales_by_method?.['فودافون كاش'] || s.vodafone_sales || 0;
    const instapaySales = s.sales_by_method?.['انستا باي'] || s.instapay_sales || 0;
    const cashSales = s.sales_by_method?.['كاش'] || s.cash_sales || 0;

    if (document.getElementById('rep-total-sales')) document.getElementById('rep-total-sales').textContent = `${parseFloat(s.total_sales || 0).toFixed(2)} ج.م`;
    if (document.getElementById('rep-cash-sales')) document.getElementById('rep-cash-sales').textContent = `${parseFloat(cashSales).toFixed(2)} ج.م`;
    if (document.getElementById('rep-instapay-sales')) document.getElementById('rep-instapay-sales').textContent = `${parseFloat(instapaySales).toFixed(2)} ج.م`;
    if (document.getElementById('rep-vodafone-sales')) document.getElementById('rep-vodafone-sales').textContent = `${parseFloat(vodafoneSales).toFixed(2)} ج.م`;
    if (document.getElementById('rep-invoices-count')) document.getElementById('rep-invoices-count').textContent = s.total_invoices || (s.orders_count || 0);
    if (document.getElementById('rep-items-count')) document.getElementById('rep-items-count').textContent = `${s.total_items_sold || 0} صنف`;

    // Render Recent Transactions Table
    const tableContainer = document.getElementById('rep-recent-sales-list');
    if (tableContainer) {
      if (s.recent_sales && s.recent_sales.length > 0) {
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
                ${s.recent_sales.slice(0, 15).map((sale, idx) => `
                  <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition">
                    <td class="p-3 font-mono font-bold text-indigo-600">#${sale.order_id || sale.invoice_barcode || (idx + 1)}</td>
                    <td class="p-3 text-gray-500 font-mono">${sale.created_at || 'اليوم'}</td>
                    <td class="p-3">
                      <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        sale.payment_method?.includes('انستا') ? 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300' :
                        sale.payment_method?.includes('فودافون') ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300' :
                        sale.payment_method?.includes('فيزا') ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300' :
                        'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                      }">${sale.payment_method || 'كاش'}</span>
                    </td>
                    <td class="p-3 font-bold font-mono text-gray-900 dark:text-white">${parseFloat(sale.total_price || 0).toFixed(2)} ج.م</td>
                    <td class="p-3 text-gray-500">${sale.customer_name || sale.cashier_name || 'عميل نقدي'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `;
      } else {
        tableContainer.innerHTML = `
          <div class="py-8 text-center text-gray-400">
            <i data-lucide="receipt" class="w-8 h-8 mx-auto mb-2 opacity-40"></i>
            <p class="text-xs font-semibold">لا توجد عمليات بيع مسجلة في هذه الفترة</p>
          </div>
        `;
      }
    }

    if (window.lucide) window.lucide.createIcons();
  }

  printZReport() {
    const s = this.summaryData || {};
    const printArea = document.getElementById('receipt-print-area');
    if (!printArea) return;

    const vodafoneSales = s.sales_by_method?.['فودافون كاش'] || s.vodafone_sales || 0;
    const instapaySales = s.sales_by_method?.['انستا باي'] || s.instapay_sales || 0;
    const cashSales = s.sales_by_method?.['كاش'] || s.cash_sales || 0;

    const zReportHTML = `
      <div class="receipt-header">
        <div class="receipt-store-title">سوبر ماركت المنزل السوري</div>
        <div class="receipt-store-sub">تقرير إقفال الوردية (Z-Report)</div>
        <div class="receipt-store-sub">الفترة: ${this.currentPeriod === 'today' ? 'اليوم' : this.currentPeriod}</div>
      </div>

      <div class="receipt-meta">
        <div class="receipt-meta-row">
          <span>التاريخ والوقت:</span>
          <span>${new Date().toLocaleString('ar-EG')}</span>
        </div>
        <div class="receipt-meta-row">
          <span>الكاشير:</span>
          <span>كاشير 1</span>
        </div>
      </div>

      <div class="receipt-totals">
        <div class="receipt-total-row">
          <span>إجمالي المبيعات:</span>
          <span><b>${parseFloat(s.total_sales || 0).toFixed(2)} ج.م</b></span>
        </div>
        <div class="receipt-total-row">
          <span>مبيعات النقدية (الكاش):</span>
          <span>${parseFloat(cashSales).toFixed(2)} ج.م</span>
        </div>
        <div class="receipt-total-row">
          <span>مبيعات إنستاباي (InstaPay):</span>
          <span>${parseFloat(instapaySales).toFixed(2)} ج.م</span>
        </div>
        <div class="receipt-total-row">
          <span>مبيعات فودافون كاش:</span>
          <span>${parseFloat(vodafoneSales).toFixed(2)} ج.م</span>
        </div>
        <div class="receipt-total-row">
          <span>إجمالي عدد الفواتير:</span>
          <span>${s.total_invoices || (s.orders_count || 0)} فاتورة</span>
        </div>
        <div class="receipt-total-row">
          <span>إجمالي المصروفات المنصرفة:</span>
          <span>${parseFloat(s.total_all_expenses || 0).toFixed(2)} ج.م</span>
        </div>
        <div class="receipt-total-row">
          <span>صافي النقدية في الدرج:</span>
          <span><b>${parseFloat(s.net_cash_in_drawer || cashSales).toFixed(2)} ج.م</b></span>
        </div>
      </div>

      <div class="receipt-footer">
        <p>توقيع مسؤول الوردية: .........................</p>
      </div>
    `;

    printArea.innerHTML = zReportHTML;
    window.print();
  }
}

window.reportsController = new ReportsController();
