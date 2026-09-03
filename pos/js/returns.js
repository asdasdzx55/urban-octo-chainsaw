/**
 * Syrian Home POS - Returns & Refunds Controller
 * Supports:
 * 1. Searching invoices by ID, Barcode, or Recent Invoices Quick Picker
 * 2. Real-time API normalization (handling `{ items: [...] }` payload required by PHP backend)
 * 3. Exact Unit & Decimal Weight Returns (e.g. 0.060 kg)
 * 4. Local cache syncing and offline fallback
 */

class ReturnsController {
  constructor() {
    this.currentOrder = null;
    this.returnCart = {}; // { product_id: return_qty }
  }

  init() {
    this.renderRecentInvoicesList();
  }

  async searchInvoice(queryCode = null) {
    const input = document.getElementById('return-search-input');
    const rawVal = String(queryCode || (input ? input.value : '')).trim();

    if (!rawVal) {
      window.app?.showToast('يرجى إدخال رقم الفاتورة أو مسح الباركود', 'error');
      return;
    }

    if (input) input.value = rawVal;

    // 1. Normalize Query & Extract Clean Numeric ID
    // e.g. "INV-4" -> "4", "#4" -> "4", "4" -> "4"
    let cleanQuery = rawVal.replace(/^[#\s]*(INV-?)?/i, '').trim();
    const numMatch = rawVal.match(/\d+/);
    const numericId = numMatch ? numMatch[0] : cleanQuery;

    // 2. Check Local Completed Orders Cache First
    try {
      const localOrders = JSON.parse(localStorage.getItem('pos_completed_orders') || '[]');
      const localFound = localOrders.find(ord => {
        const oId = String(ord.order_id || ord.id || '');
        const oBarcode = String(ord.invoice_barcode || '').toLowerCase();
        const qLower = rawVal.toLowerCase();
        return oId === cleanQuery || oId === numericId || oBarcode === qLower || oBarcode === `inv-${cleanQuery}`.toLowerCase();
      });

      if (localFound) {
        this.loadOrderToView(localFound, 'local');
        return;
      }
    } catch (e) {
      console.warn('Local orders cache error:', e);
    }

    // 3. Query Server API
    try {
      window.app?.showLoading(true, 'جاري البحث عن الفاتورة في السيرفر...');
      const res = await window.api.getOrderDetails(numericId || cleanQuery);
      window.app?.showLoading(false);

      if (res && res.success && (res.order || res.items)) {
        this.loadOrderToView(res, 'api');
      } else {
        window.posScanner?.playErrorTone();
        window.app?.showToast(`لم يتم العثور على فاتورة برقم: ${rawVal}`, 'error');
      }
    } catch (err) {
      window.app?.showLoading(false);
      window.posScanner?.playErrorTone();
      window.app?.showToast(`لم يتم العثور على الفاتورة: ${err.message}`, 'error');
    }
  }

  loadOrderToView(data, source = 'api') {
    let order = null;
    let items = [];

    if (source === 'local') {
      order = {
        id: data.order_id || data.id,
        invoice_barcode: data.invoice_barcode || `INV-${data.order_id || data.id}`,
        created_at: data.created_at || 'اليوم',
        customer_name: data.customer_name || 'نقدي',
        payment_method: data.payment_method || 'كاش',
        total: parseFloat(data.total || 0),
        items: data.items || []
      };
      items = (data.items || []).map(item => ({
        product_id: item.product_id || item.id,
        name: item.name,
        qty: parseFloat(item.qty || 1),
        price: parseFloat(item.price || 0),
        returned_qty: parseFloat(item.returned_qty || 0),
        barcode: item.barcode || ''
      }));
    } else {
      order = data.order || {};
      order.id = order.id || data.id;
      order.invoice_barcode = order.invoice_barcode || `INV-${order.id}`;
      order.total = parseFloat(order.total_price !== undefined ? order.total_price : (order.total || 0));
      
      const rawItems = (Array.isArray(data.items) && data.items.length > 0) ? data.items : (order.items || []);
      items = rawItems.map(item => {
        const matchedProd = window.app?.products?.find(p => p.name === item.name || (item.barcode && p.barcode === item.barcode));
        return {
          product_id: item.product_id || item.id || (matchedProd ? matchedProd.id : 0),
          name: item.name,
          qty: parseFloat(item.quantity !== undefined ? item.quantity : (item.qty || 1)),
          price: parseFloat(item.price || 0),
          returned_qty: parseFloat(item.returned_qty || 0),
          barcode: item.barcode || (matchedProd ? matchedProd.barcode : '')
        };
      });
    }

    order.items = items;
    this.currentOrder = order;
    this.returnCart = {};

    window.posScanner?.playSuccessBeep();
    this.renderOrderDetails();
    window.app?.showToast(`تم العثور على الفاتورة #${order.id} بنجاح ✅`, 'success');
  }

  renderOrderDetails() {
    const detailsBox = document.getElementById('return-order-details-box');
    if (!detailsBox || !this.currentOrder) return;

    const ord = this.currentOrder;
    detailsBox.classList.remove('hidden');
    detailsBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    detailsBox.innerHTML = `
      <div class="p-5 bg-white dark:bg-gray-800 rounded-3xl border border-gray-200 dark:border-gray-700 shadow-lg flex flex-col gap-4 animate-slide-up">
        
        <!-- Header Info -->
        <div class="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-gray-100 dark:border-gray-700">
          <div>
            <h3 class="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <span class="text-indigo-600 font-mono font-black text-lg">#${ord.id}</span>
              <span class="text-xs bg-indigo-50 dark:bg-indigo-950 text-indigo-600 px-2.5 py-1 rounded-lg border border-indigo-200 dark:border-indigo-800 font-mono font-bold">${ord.invoice_barcode || 'INV-' + ord.id}</span>
            </h3>
            <p class="text-xs text-gray-500 mt-0.5">التاريخ: ${ord.created_at || 'اليوم'} • العميل: <b>${ord.customer_name || 'نقدي'}</b></p>
          </div>

          <div class="text-left">
            <span class="text-base sm:text-lg font-black text-emerald-600 dark:text-emerald-400 font-mono">${parseFloat(ord.total || 0).toFixed(2)} ج.م</span>
            <p class="text-[11px] text-gray-400 font-bold">طريقة الدفع: ${ord.payment_method || 'كاش'}</p>
          </div>
        </div>

        <!-- Items Table for Returns -->
        <div>
          <h4 class="text-xs font-bold text-gray-700 dark:text-gray-300 mb-2.5 flex items-center gap-1.5">
            <i data-lucide="check-square" class="w-4 h-4 text-indigo-600"></i>
            <span>حدد الأصناف والكميات المراد إرجاعها واستعادة مبالغها:</span>
          </h4>
          
          <div class="flex flex-col gap-2.5">
            ${(ord.items || []).map(item => {
              const maxRefundable = Math.max(0, parseFloat((item.qty - (item.returned_qty || 0)).toFixed(3)));
              const isWeight = (item.qty % 1 !== 0) || (maxRefundable % 1 !== 0);
              const currentSelected = this.returnCart[item.product_id] !== undefined ? this.returnCart[item.product_id] : 0;

              return `
                <div class="p-3.5 bg-gray-50 dark:bg-gray-900/60 rounded-2xl border border-gray-200 dark:border-gray-700 flex items-center justify-between gap-3 flex-wrap sm:flex-nowrap">
                  <div class="flex-1 min-w-0">
                    <h5 class="text-xs sm:text-sm font-bold text-gray-900 dark:text-white truncate">${item.name}</h5>
                    <p class="text-[11px] text-gray-500 mt-0.5">
                      تم شراء: <b class="text-gray-700 dark:text-gray-300">${item.qty} ${isWeight ? 'كجم' : 'قطعة'}</b> • تم إرجاع: <b>${item.returned_qty || 0}</b> • السعر: <b>${item.price.toFixed(2)} ج.م</b>
                    </p>
                  </div>

                  ${maxRefundable > 0 ? `
                    <div class="flex items-center gap-2">
                      <span class="text-xs font-bold text-gray-500">كمية الإرجاع:</span>
                      ${isWeight ? `
                        <div class="flex items-center gap-1.5">
                          <input type="number" step="0.005" min="0" max="${maxRefundable}" value="${currentSelected}" onchange="window.returnsController.setReturnQty(${item.product_id}, this.value)" class="w-24 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl text-xs font-bold px-2 py-1.5 font-mono text-center">
                          <button type="button" onclick="window.returnsController.setReturnQty(${item.product_id}, ${maxRefundable}); window.returnsController.renderOrderDetails();" class="px-2.5 py-1.5 text-xs font-bold bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 rounded-xl border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 transition">الكل</button>
                        </div>
                      ` : `
                        <select onchange="window.returnsController.setReturnQty(${item.product_id}, this.value)" class="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl text-xs font-bold px-3 py-1.5 font-mono">
                          ${Array.from({ length: maxRefundable + 1 }, (_, i) => `
                            <option value="${i}" ${i === currentSelected ? 'selected' : ''}>${i} قطعة</option>
                          `).join('')}
                        </select>
                      `}
                    </div>
                  ` : `
                    <span class="text-xs font-bold text-rose-500 bg-rose-50 dark:bg-rose-950 px-2.5 py-1 rounded-lg">تم إرجاعه بالكامل</span>
                  `}
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <!-- Reason and Submit -->
        <div class="pt-3 border-t border-gray-100 dark:border-gray-700 flex flex-col sm:flex-row items-center justify-between gap-3">
          <input type="text" id="return-reason-input" placeholder="سبب الإرجاع (مثال: تالف أو رغبة العميل)..." class="w-full sm:w-80 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2.5 text-xs">
          
          <button onclick="window.returnsController.submitReturn()" class="w-full sm:w-auto px-6 py-3 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-rose-600/30 transition transform active:scale-95">
            <i data-lucide="rotate-ccw" class="w-4 h-4"></i>
            <span>تأكيد استرجاع الفاتورة واستعادة المخزون</span>
          </button>
        </div>

      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
  }

  setReturnQty(productId, qty) {
    const num = parseFloat(qty);
    if (num > 0) {
      this.returnCart[productId] = num;
    } else {
      delete this.returnCart[productId];
    }
  }

  async submitReturn() {
    if (!this.currentOrder) return;

    const returnItems = Object.entries(this.returnCart).map(([productId, qty]) => {
      const item = this.currentOrder.items.find(i => String(i.product_id) === String(productId));
      return {
        product_id: parseInt(productId, 10) || productId,
        quantity: qty,
        qty: qty,
        refund_amount: parseFloat(((item ? item.price : 0) * qty).toFixed(2))
      };
    });

    if (returnItems.length === 0) {
      window.app?.showToast('يرجى تحديد كمية صنف واحد على الأقل للإرجاع', 'error');
      return;
    }

    const totalRefund = returnItems.reduce((sum, i) => sum + i.refund_amount, 0);
    const reason = document.getElementById('return-reason-input')?.value.trim() || 'رغبة العميل';

    // Send payload matching PHP backend expectations
    const payload = {
      order_id: this.currentOrder.id,
      reason: reason,
      items: returnItems,
      return_items: returnItems,
      returned_items: returnItems,
      refund_amount: totalRefund,
      total_refund: totalRefund,
      cashier_name: window.app?.currentCashier || 'كاشير المحل'
    };

    try {
      window.app?.showLoading(true, 'جاري معالجة المرتجع واسترجاع الكمية للمخزن...');
      const res = await window.api.processReturn(payload);
      window.app?.showLoading(false);

      if (res && res.success) {
        window.posScanner?.playSuccessBeep();
        window.app?.showToast(res.message || `تم تسجيل المرتجع بقيمة ${totalRefund.toFixed(2)} ج.م واسترجاع المخزون بنجاح ✅`, 'success');
        
        // Update local order cache
        try {
          const completed = JSON.parse(localStorage.getItem('pos_completed_orders') || '[]');
          const target = completed.find(o => String(o.order_id || o.id) === String(this.currentOrder.id));
          if (target && target.items) {
            returnItems.forEach(ret => {
              const itm = target.items.find(i => String(i.product_id || i.id) === String(ret.product_id));
              if (itm) itm.returned_qty = (itm.returned_qty || 0) + ret.quantity;
            });
            localStorage.setItem('pos_completed_orders', JSON.stringify(completed));
          }
        } catch(e) {}

        // Restore local inventory stock
        this.restoreLocalStock(returnItems);

        // Reset and hide
        this.currentOrder = null;
        this.returnCart = {};
        document.getElementById('return-order-details-box')?.classList.add('hidden');
        if (document.getElementById('return-search-input')) document.getElementById('return-search-input').value = '';
        
        // Refresh catalog in background to update stock levels
        window.app?.refreshProductsQuietly();
        this.renderRecentInvoicesList();
      } else {
        throw new Error(res.error || res.message || 'فشل الاتصال بالسيرفر');
      }
    } catch (err) {
      window.app?.showLoading(false);

      // Offline return fallback
      window.syncManager?.queueReturn(payload);
      
      // Update local order cache
      try {
        const completed = JSON.parse(localStorage.getItem('pos_completed_orders') || '[]');
        const target = completed.find(o => String(o.order_id || o.id) === String(this.currentOrder.id));
        if (target && target.items) {
          returnItems.forEach(ret => {
            const itm = target.items.find(i => String(i.product_id || i.id) === String(ret.product_id));
            if (itm) itm.returned_qty = (itm.returned_qty || 0) + ret.quantity;
          });
          localStorage.setItem('pos_completed_orders', JSON.stringify(completed));
        }
      } catch(e) {}

      // Restore local stock immediately
      this.restoreLocalStock(returnItems);

      // Reset and hide
      this.currentOrder = null;
      this.returnCart = {};
      document.getElementById('return-order-details-box')?.classList.add('hidden');
      if (document.getElementById('return-search-input')) document.getElementById('return-search-input').value = '';
      
      window.posScanner?.playSuccessBeep();
      window.app?.showToast(`تم تسجيل المرتجع محلياً (أوفلاين) واستعادة المخزون (${totalRefund.toFixed(2)} ج.م) 📦✅`, 'warning');
      this.renderRecentInvoicesList();
    }
  }

  restoreLocalStock(returnItems) {
    if (!Array.isArray(returnItems) || !window.app?.products) return;
    returnItems.forEach(ret => {
      const p = window.app.products.find(prod => prod.id === ret.product_id);
      if (p) {
        const curStock = parseFloat(p.stock || 0);
        const qty = parseFloat(ret.quantity || ret.qty || 1);
        p.stock = parseFloat((curStock + qty).toFixed(3));
      }
    });
    try {
      localStorage.setItem('syrian_home_products', JSON.stringify(window.app.products));
      window.app.renderProducts();
    } catch(e) {}
  }

  async renderRecentInvoicesList() {
    const listContainer = document.getElementById('return-recent-invoices');
    if (!listContainer) return;

    try {
      let completed = JSON.parse(localStorage.getItem('pos_completed_orders') || '[]');
      
      // If local cache is empty, fetch completed orders from cloud hub
      if (completed.length === 0 && window.cart?.syncCompletedOrdersFromCloud) {
        completed = await window.cart.syncCompletedOrdersFromCloud();
      }

      if (completed.length === 0) {
        listContainer.innerHTML = `
          <div class="col-span-full p-4 text-center text-gray-400 text-xs bg-gray-50 dark:bg-gray-800/40 rounded-2xl border border-dashed border-gray-200 dark:border-gray-700">
            <i data-lucide="receipt" class="w-6 h-6 mx-auto mb-1 opacity-40"></i>
            لا توجد فواتير مسجلة اليوم حتى الآن
          </div>
        `;
        if (window.lucide) window.lucide.createIcons();
        return;
      }

      listContainer.innerHTML = completed.slice(0, 6).map(ord => `
        <div onclick="window.returnsController.searchInvoice('${ord.order_id || ord.id}')" class="p-3 bg-gray-50 dark:bg-gray-900/50 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 rounded-2xl border border-gray-200 dark:border-gray-700 flex items-center justify-between gap-3 cursor-pointer transition group">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-xl bg-indigo-100 dark:bg-indigo-900/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-mono font-bold text-xs group-hover:scale-105 transition">
              #${ord.order_id || ord.id}
            </div>
            <div>
              <h5 class="text-xs font-bold text-gray-900 dark:text-white font-mono">${ord.invoice_barcode || 'INV-' + (ord.order_id || ord.id)}</h5>
              <p class="text-[10px] text-gray-500">${ord.created_at || 'اليوم'} • <span class="text-indigo-600 dark:text-indigo-400 font-bold">${ord.payment_method || 'كاش'}</span></p>
            </div>
          </div>

          <div class="text-left flex items-center gap-2">
            <span class="text-xs font-black text-emerald-600 dark:text-emerald-400 font-mono">${parseFloat(ord.total || 0).toFixed(2)} ج.م</span>
            <span class="px-2.5 py-1 rounded-lg bg-indigo-600 text-white text-[10px] font-bold shadow-2xs group-hover:bg-indigo-700 transition">
              استرجاع 🔄
            </span>
          </div>
        </div>
      `).join('');

      if (window.lucide) window.lucide.createIcons();
    } catch(e) {}
  }
}

window.returnsController = new ReturnsController();
