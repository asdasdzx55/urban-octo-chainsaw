/**
 * Syrian Home POS - Shift & Financial Reports Controller
 * Fetches and displays daily sales summaries, payment breakdowns, and Z-Reports.
 */

class ReportsController {
  constructor() {
    this.currentPeriod = 'today';
    this.summaryData = null;
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
      const res = await window.api.getPosReports(period);
      window.app?.showLoading(false);

      if (res && res.success && res.summary) {
        this.summaryData = res.summary;
        this.renderReports();
      } else {
        this.summaryData = null;
        this.renderReports();
      }
    } catch (err) {
      window.app?.showLoading(false);
      window.app?.showToast(`خطأ في جلب التقارير: ${err.message}`, 'error');
    }
  }

  renderReports() {
    const s = this.summaryData || {
      total_sales: 0,
      cash_sales: 0,
      instapay_sales: 0,
      vodafone_sales: 0,
      total_invoices: 0,
      total_items_sold: 0
    };

    const vodafoneSales = s.sales_by_method?.['فودافون كاش'] || s.vodafone_sales || 0;
    const instapaySales = s.sales_by_method?.['انستا باي'] || s.instapay_sales || 0;
    const cashSales = s.sales_by_method?.['كاش'] || s.cash_sales || 0;

    if (document.getElementById('rep-total-sales')) document.getElementById('rep-total-sales').textContent = `${parseFloat(s.total_sales || 0).toFixed(2)} ج.م`;
    if (document.getElementById('rep-cash-sales')) document.getElementById('rep-cash-sales').textContent = `${parseFloat(cashSales).toFixed(2)} ج.م`;
    if (document.getElementById('rep-instapay-sales')) document.getElementById('rep-instapay-sales').textContent = `${parseFloat(instapaySales).toFixed(2)} ج.م`;
    if (document.getElementById('rep-vodafone-sales')) document.getElementById('rep-vodafone-sales').textContent = `${parseFloat(vodafoneSales).toFixed(2)} ج.م`;
    if (document.getElementById('rep-invoices-count')) document.getElementById('rep-invoices-count').textContent = s.total_invoices || (s.orders_count || 0);
    if (document.getElementById('rep-items-count')) document.getElementById('rep-items-count').textContent = s.total_items_sold || 0;
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
