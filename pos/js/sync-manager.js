/**
 * Syrian Home POS - Offline & Online Synchronization Manager
 * Coordinates:
 * 1. Automatic connectivity monitoring (Online / Offline state tracking & ping)
 * 2. Header status badge & pending queue indicators
 * 3. Offline queue management for sales, returns, product sync, and expenses
 * 4. Background queue synchronization when reconnected to internet
 * 5. Persistent Unit-Type mapping so weight/piece settings never revert on refresh
 */

class POSSyncManager {
  constructor() {
    this.isOnline = navigator.onLine;
    this.isSyncing = false;
    this.pingInterval = null;
    this.init();
  }

  init() {
    // 1. Listen for browser network events
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.updateStatusBadge();
      this.processPendingQueues();
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
      this.updateStatusBadge();
      window.app?.showToast('انقطع الاتصال بالإنترنت - يعمل النظام الآن في وضع أوفلاين المحلي 📦', 'warning');
    });

    // 2. Periodic background connectivity check & queue drain (every 12 seconds)
    this.pingInterval = setInterval(() => {
      this.checkConnectivity();
    }, 12000);

    // Initial check after short delay
    setTimeout(() => {
      this.checkConnectivity();
    }, 1500);
  }

  async checkConnectivity() {
    if (!navigator.onLine) {
      this.isOnline = false;
      this.updateStatusBadge();
      return;
    }

    try {
      if (window.api) {
        const res = await window.api.ping();
        this.isOnline = !!(res && (res.status === 'ok' || res.success !== false));
      } else {
        this.isOnline = navigator.onLine;
      }
    } catch (e) {
      this.isOnline = false;
    }

    this.updateStatusBadge();

    // If online and we have pending items, process them
    if (this.isOnline && this.hasPendingItems() && !this.isSyncing) {
      this.processPendingQueues();
    }
  }

  /* ==================== PERSISTENT PRODUCT UNIT TYPE MAPPING ==================== */
  getUnitsMap() {
    try {
      return JSON.parse(localStorage.getItem('pos_product_units') || '{}');
    } catch (e) {
      return {};
    }
  }

  saveUnitsMap(map) {
    try {
      localStorage.setItem('pos_product_units', JSON.stringify(map));
    } catch (e) {}
  }

  setProductUnitType(productOrId, unitType) {
    const map = this.getUnitsMap();
    const type = unitType === 'weight' ? 'weight' : 'piece';

    if (typeof productOrId === 'object' && productOrId !== null) {
      if (productOrId.id) map[`id_${productOrId.id}`] = type;
      if (productOrId.local_code) map[`code_${productOrId.local_code}`] = type;
      if (productOrId.barcode) map[`bar_${productOrId.barcode}`] = type;
    } else {
      map[`id_${productOrId}`] = type;
    }

    this.saveUnitsMap(map);
  }

  normalizeProduct(product) {
    if (!product) return product;

    const map = this.getUnitsMap();
    const pId = product.id ? `id_${product.id}` : null;
    const pLocal = product.local_code ? `code_${product.local_code}` : null;
    const pBar = product.barcode ? `bar_${product.barcode}` : null;

    let unitType = 'piece';

    // 1. Check local persistent mapping first (explicit user setting)
    if (pId && map[pId]) {
      unitType = map[pId];
    } else if (pLocal && map[pLocal]) {
      unitType = map[pLocal];
    } else if (pBar && map[pBar]) {
      unitType = map[pBar];
    } 
    // 2. Check product raw flags
    else if (product.unit_type === 'weight' || product.unit === 'كجم' || product.is_weight) {
      unitType = 'weight';
    } 
    // 3. Check scale barcode / local_code heuristics
    // Scale items in Syrian Home: 5-digit local code starting with 10xxx or barcode starting with 20
    else if (product.local_code && /^10\d{3}$/.test(String(product.local_code).trim())) {
      unitType = 'weight';
    } else if (product.barcode && /^20\d{10,11}$/.test(String(product.barcode).trim())) {
      unitType = 'weight';
    } 
    // 4. Stock with decimal values (e.g. 44.52 kg)
    else if (product.stock && (parseFloat(product.stock) % 1 !== 0)) {
      unitType = 'weight';
    } 
    // 5. Traditional bulk categories (أجبان، مكسرات، عطارة) without 13-digit retail barcode
    else if (
      (product.category === 'أجبان وألبان' || product.category === 'عطارة وتوابل وزيوت' || product.category === 'لحوم ودواجن ومصنعات') &&
      (!product.barcode || product.barcode.length < 8)
    ) {
      unitType = 'weight';
    }

    const isWeight = unitType === 'weight';

    return {
      ...product,
      unit_type: unitType,
      unit: isWeight ? 'كجم' : 'قطعة',
      is_weight: isWeight
    };
  }

  /* ==================== OFFLINE QUEUES MANAGEMENT ==================== */
  getQueue(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || '[]');
    } catch (e) {
      return [];
    }
  }

  setQueue(key, items) {
    try {
      localStorage.setItem(key, JSON.stringify(items));
    } catch (e) {}
    this.updateStatusBadge();
  }

  hasPendingItems() {
    const sales = this.getQueue('pos_pending_sales');
    const returns = this.getQueue('pos_pending_returns');
    const prods = this.getQueue('pos_pending_products');
    const expenses = this.getQueue('pos_pending_expenses');
    return (sales.length + returns.length + prods.length + expenses.length) > 0;
  }

  getPendingCount() {
    const sales = this.getQueue('pos_pending_sales');
    const returns = this.getQueue('pos_pending_returns');
    const prods = this.getQueue('pos_pending_products');
    const expenses = this.getQueue('pos_pending_expenses');
    return sales.length + returns.length + prods.length + expenses.length;
  }

  queueSale(salePayload, invoiceData) {
    const queue = this.getQueue('pos_pending_sales');
    queue.push({
      id: `offline_sale_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      timestamp: Date.now(),
      payload: salePayload,
      invoice: invoiceData
    });
    this.setQueue('pos_pending_sales', queue);
  }

  queueReturn(returnPayload) {
    const queue = this.getQueue('pos_pending_returns');
    queue.push({
      id: `offline_return_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      timestamp: Date.now(),
      payload: returnPayload
    });
    this.setQueue('pos_pending_returns', queue);
  }

  queueProduct(productPayload) {
    const queue = this.getQueue('pos_pending_products');
    queue.push({
      id: `offline_prod_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      timestamp: Date.now(),
      payload: productPayload
    });
    this.setQueue('pos_pending_products', queue);
  }

  queueExpense(expensePayload) {
    const queue = this.getQueue('pos_pending_expenses');
    queue.push({
      id: `offline_exp_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      timestamp: Date.now(),
      payload: expensePayload
    });
    this.setQueue('pos_pending_expenses', queue);
  }

  /* ==================== BACKGROUND SYNC PROCESSOR ==================== */
  async processPendingQueues() {
    if (this.isSyncing || !this.isOnline) return;
    this.isSyncing = true;
    this.updateStatusBadge();

    let syncedSalesCount = 0;

    // 1. Process Pending Sales
    let salesQueue = this.getQueue('pos_pending_sales');
    if (salesQueue.length > 0) {
      const remainingSales = [];
      for (const item of salesQueue) {
        try {
          const res = await window.api.pushSale(item.payload);
          if (res && res.success) {
            syncedSalesCount++;
            // Update order_id on local completed order if exists
            try {
              const completed = JSON.parse(localStorage.getItem('pos_completed_orders') || '[]');
              const matched = completed.find(o => String(o.order_id) === String(item.invoice?.order_id));
              if (matched && res.order_id) {
                matched.server_order_id = res.order_id;
                matched.synced = true;
                localStorage.setItem('pos_completed_orders', JSON.stringify(completed));
              }
            } catch (e) {}
          } else {
            remainingSales.push(item);
          }
        } catch (e) {
          remainingSales.push(item);
        }
      }
      this.setQueue('pos_pending_sales', remainingSales);
    }

    // 2. Process Pending Returns
    let returnsQueue = this.getQueue('pos_pending_returns');
    if (returnsQueue.length > 0) {
      const remainingReturns = [];
      for (const item of returnsQueue) {
        try {
          const res = await window.api.processReturn(item.payload);
          if (!res || !res.success) {
            remainingReturns.push(item);
          }
        } catch (e) {
          remainingReturns.push(item);
        }
      }
      this.setQueue('pos_pending_returns', remainingReturns);
    }

    // 3. Process Pending Product Updates
    let prodsQueue = this.getQueue('pos_pending_products');
    if (prodsQueue.length > 0) {
      const remainingProds = [];
      for (const item of prodsQueue) {
        try {
          const res = await window.api.syncProduct(item.payload);
          if (!res || !res.success) {
            remainingProds.push(item);
          }
        } catch (e) {
          remainingProds.push(item);
        }
      }
      this.setQueue('pos_pending_products', remainingProds);
    }

    // 4. Process Pending Expenses
    let expQueue = this.getQueue('pos_pending_expenses');
    if (expQueue.length > 0) {
      const remainingExp = [];
      for (const item of expQueue) {
        try {
          const res = await window.api.recordExpense(item.payload);
          if (!res || !res.success) {
            remainingExp.push(item);
          }
        } catch (e) {
          remainingExp.push(item);
        }
      }
      this.setQueue('pos_pending_expenses', remainingExp);
    }

    this.isSyncing = false;
    this.updateStatusBadge();

    if (syncedSalesCount > 0) {
      window.app?.showToast(`تمت مزامنة ${syncedSalesCount} فاتورة أوفلاين مع السيرفر السحابي بنجاح ☁️✅`, 'success');
      window.app?.refreshProductsQuietly();
    }
  }

  /* ==================== HEADER STATUS BADGE UPDATER ==================== */
  updateStatusBadge() {
    const badge = document.getElementById('server-status-badge');
    if (!badge) return;

    const pendingCount = this.getPendingCount();

    if (this.isSyncing) {
      badge.innerHTML = `<span class="w-2.5 h-2.5 rounded-full bg-blue-500 animate-ping"></span>`;
      badge.title = `جاري المزامنة (${pendingCount} معلقة)...`;
      badge.className = 'inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-500/15 border border-blue-500/30 shrink-0';
      return;
    }

    if (this.isOnline) {
      if (pendingCount > 0) {
        badge.innerHTML = `<span class="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-xs shadow-emerald-500/50"></span>`;
        badge.title = `متصل بالسيرفر (${pendingCount} معلقة - اضغط للمزامنة)`;
        badge.className = 'inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500/15 border border-emerald-500/30 shrink-0 cursor-pointer';
        badge.onclick = () => this.processPendingQueues();
      } else {
        badge.innerHTML = `<span class="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-xs shadow-emerald-500/50"></span>`;
        badge.title = 'متصل بالسيرفر (Online)';
        badge.className = 'inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500/15 border border-emerald-500/30 shrink-0';
        badge.onclick = null;
      }
    } else {
      badge.innerHTML = `<span class="w-2.5 h-2.5 rounded-full bg-rose-500"></span>`;
      badge.title = `غير متصل بالسيرفر (Offline) ${pendingCount > 0 ? `(${pendingCount} معلقة)` : ''}`;
      badge.className = 'inline-flex items-center justify-center w-5 h-5 rounded-full bg-rose-500/15 border border-rose-500/30 shrink-0';
      badge.onclick = null;
    }
  }
}

window.syncManager = new POSSyncManager();
