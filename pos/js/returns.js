/**
 * Syrian Home POS - Returns & Refunds Controller
 * Looks up invoices by barcode/ID and processes inventory returns.
 */

class ReturnsController {
  constructor() {
    this.currentOrder = null;
    this.returnCart = {}; // { product_id: return_qty }
  }

  async searchInvoice() {
    const input = document.getElementById('return-search-input');
    const value = input ? input.value.trim() : '';

    if (!value) {
      window.app?.showToast('يرجى إدخال رقم الفاتورة أو مسح الباركود', 'error');
      return;
    }

    // Extract ID if full barcode format like INV-1085
    let orderId = value;
    const match = value.match(/\d+/);
    if (match) orderId = match[0];

    try {
      window.app?.showLoading(true, 'جاري البحث عن الفاتورة...');
      const res = await window.api.getOrderDetails(orderId);
      window.app?.showLoading(false);

      if (res && res.success && res.order) {
        this.currentOrder = res.order;
        this.returnCart = {};
        this.renderOrderDetails();
      } else {
        window.app?.showToast('لم يتم العثور على فاتورة بهذا الرقم', 'error');
      }
    } catch (err) {
      window.app?.showLoading(false);
      window.app?.showToast(`خطأ أثناء جلب الفاتورة: ${err.message}`, 'error');
    }
  }

  renderOrderDetails() {
    const detailsBox = document.getElementById('return-order-details-box');
    if (!detailsBox || !this.currentOrder) return;

    const ord = this.currentOrder;
    detailsBox.classList.remove('hidden');

    detailsBox.innerHTML = `
      <div class="p-5 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-md flex flex-col gap-4">
        
        <!-- Header Info -->
        <div class="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-gray-100 dark:border-gray-700">
          <div>
            <h3 class="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <span class="text-indigo-600">#${ord.id}</span>
              <span>(${ord.invoice_barcode || 'INV-' + ord.id})</span>
            </h3>
            <p class="text-xs text-gray-500 mt-0.5">التاريخ: ${ord.created_at || 'اليوم'} • العميل: ${ord.customer_name || 'نقدي'}</p>
          </div>

          <div class="text-left">
            <span class="text-sm font-black text-emerald-600 dark:text-emerald-400">${parseFloat(ord.total || 0).toFixed(2)} ج.م</span>
            <p class="text-[11px] text-gray-400">طريقة الدفع: ${ord.payment_method}</p>
          </div>
        </div>

        <!-- Items Table for Returns -->
        <div>
          <h4 class="text-xs font-bold text-gray-700 dark:text-gray-300 mb-2">حدد الأصناف والكميات المراد إرجاعها:</h4>
          
          <div class="flex flex-col gap-2">
            ${(ord.items || []).map(item => {
              const maxRefundable = Math.max(0, item.qty - (item.returned_qty || 0));
              const currentSelected = this.returnCart[item.product_id] || 0;

              return `
                <div class="p-3 bg-gray-50 dark:bg-gray-900/60 rounded-xl border border-gray-100 dark:border-gray-700 flex items-center justify-between gap-3">
                  <div class="flex-1 min-w-0">
                    <h5 class="text-xs sm:text-sm font-bold text-gray-900 dark:text-white truncate">${item.name}</h5>
                    <p class="text-[11px] text-gray-500">
                      تم شراء: <b>${item.qty}</b> • تم إرجاع: <b>${item.returned_qty || 0}</b> • السعر: <b>${item.price.toFixed(2)} ج.م</b>
                    </p>
                  </div>

                  ${maxRefundable > 0 ? `
                    <div class="flex items-center gap-2">
                      <span class="text-xs text-gray-500">إرجاع:</span>
                      <select onchange="window.returnsController.setReturnQty(${item.product_id}, this.value)" class="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-xs font-bold px-2 py-1">
                        ${Array.from({ length: maxRefundable + 1 }, (_, i) => `
                          <option value="${i}" ${i === currentSelected ? 'selected' : ''}>${i}</option>
                        `).join('')}
                      </select>
                    </div>
                  ` : `
                    <span class="text-xs font-bold text-rose-500">تم إرجاعه بالكامل</span>
                  `}
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <!-- Reason and Submit -->
        <div class="pt-3 border-t border-gray-100 dark:border-gray-700 flex flex-col sm:flex-row items-center justify-between gap-3">
          <input type="text" id="return-reason-input" placeholder="سبب الإرجاع (مثال: تالف أو رغبة العميل)..." class="w-full sm:w-80 bg-gray-100 dark:bg-gray-700 border-none rounded-xl px-3 py-2 text-xs">
          
          <button onclick="window.returnsController.submitReturn()" class="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-md shadow-rose-600/20 transition">
            <i data-lucide="rotate-ccw" class="w-4 h-4"></i>
            تأكيد تسجيل المرتجع واستعادة المخزون
          </button>
        </div>

      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
  }

  setReturnQty(productId, qty) {
    const num = parseInt(qty, 10);
    if (num > 0) {
      this.returnCart[productId] = num;
    } else {
      delete this.returnCart[productId];
    }
  }

  async submitReturn() {
    if (!this.currentOrder) return;

    const returnItems = Object.entries(this.returnCart).map(([productId, qty]) => {
      const item = this.currentOrder.items.find(i => i.product_id == productId);
      return {
        product_id: parseInt(productId, 10),
        qty_to_return: qty,
        refund_amount: (item ? item.price : 0) * qty
      };
    });

    if (returnItems.length === 0) {
      window.app?.showToast('يرجى تحديد كمية صنف واحد على الأقل للإرجاع', 'error');
      return;
    }

    const reason = document.getElementById('return-reason-input')?.value.trim() || 'رغبة العميل';

    const payload = {
      order_id: this.currentOrder.id,
      reason: reason,
      return_items: returnItems
    };

    try {
      window.app?.showLoading(true, 'جاري معالجة المرتجع واسترجاع الكمية للمخزن...');
      const res = await window.api.processReturn(payload);
      window.app?.showLoading(false);

      if (res && res.success) {
        window.posScanner?.playSuccessBeep();
        window.app?.showToast(res.message || 'تم تسجيل المرتجع بنجاح واسترجاع المخزون ✅', 'success');
        
        // Reset and hide
        this.currentOrder = null;
        this.returnCart = {};
        document.getElementById('return-order-details-box')?.classList.add('hidden');
        if (document.getElementById('return-search-input')) document.getElementById('return-search-input').value = '';
      } else {
        throw new Error(res.message || 'فشل تسجيل المرتجع');
      }
    } catch (err) {
      window.app?.showLoading(false);
      window.posScanner?.playErrorTone();
      window.app?.showToast(`خطأ في المرتجع: ${err.message}`, 'error');
    }
  }
}

window.returnsController = new ReturnsController();
