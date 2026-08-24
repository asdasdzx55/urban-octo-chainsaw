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
      total_invoices: 0,
      total_items_sold: 0
    };

    document.getElementById('rep-total-sales').textContent = `${parseFloat(s.total_sales || 0).toFixed(2)} ج.م`;
    document.getElementById('rep-cash-sales').textContent = `${parseFloat(s.cash_sales || 0).toFixed(2)} ج.م`;
    document.getElementById('rep-instapay-sales').textContent = `${parseFloat(s.instapay_sales || 0).toFixed(2)} ج.م`;
    document.getElementById('rep-invoices-count').textContent = s.total_invoices || 0;
    document.getElementById('rep-items-count').textContent = s.total_items_sold || 0;
  }

  printZReport() {
    const s = this.summaryData || {};
    const printArea = document.getElementById('receipt-print-area');
    if (!printArea) return;

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
          <span>${parseFloat(s.cash_sales || 0).toFixed(2)} ج.م</span>
        </div>
        <div class="receipt-total-row">
          <span>مبيعات إنستاباي (InstaPay):</span>
          <span>${parseFloat(s.instapay_sales || 0).toFixed(2)} ج.م</span>
        </div>
        <div class="receipt-total-row">
          <span>إجمالي عدد الفواتير:</span>
          <span>${s.total_invoices || 0} فاتورة</span>
        </div>
        <div class="receipt-total-row">
          <span>إجمالي الأصناف المباعة:</span>
          <span>${s.total_items_sold || 0} قطعة</span>
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
