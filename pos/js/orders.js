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
      order_type: 'delivery',
      payment_method: order.payment_method,
      items: order.items || [],
      subtotal: parseFloat(order.total || 0),
      discount: 0,
      total: parseFloat(order.total || 0),
      paid_amount: parseFloat(order.total || 0),
      change: 0
    };

    window.cart?.showReceiptModal(receiptData);
  }
}

window.ordersController = new WebOrdersController();
