/**
 * Syrian Home Supermarket - REST API Client Layer
 * Handles communication with https://syrianhouse.almagd555.com/api_sync.php
 */

class SyrianHomeAPI {
  constructor() {
    if (typeof window !== 'undefined' && window.location && window.location.origin) {
      if (window.location.origin.includes('almagd555.com') || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        this.baseUrl = `${window.location.origin}/api_sync.php`;
      } else {
        this.baseUrl = 'https://syrianhouse.almagd555.com/api_sync.php';
      }
    } else {
      this.baseUrl = 'https://syrianhouse.almagd555.com/api_sync.php';
    }
    this.apiKey = 'syrian_home_pos_secret_token_2026';
    this.isOnline = true;
  }

  /**
   * Helper method for GET requests with API Key
   */
  async get(action, params = {}) {
    const url = new URL(this.baseUrl, typeof window !== 'undefined' && window.location ? window.location.href : 'https://syrianhouse.almagd555.com');
    url.searchParams.set('action', action);
    url.searchParams.set('api_key', this.apiKey);

    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, value);
      }
    }

    try {
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'X-API-KEY': this.apiKey
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      this.isOnline = true;
      return data;
    } catch (error) {
      console.error(`API GET error on action [${action}]:`, error);
      this.isOnline = false;
      throw error;
    }
  }

  /**
   * Helper method for POST requests with API Key
   */
  async post(action, bodyData = {}) {
    const url = new URL(this.baseUrl, typeof window !== 'undefined' && window.location ? window.location.href : 'https://syrianhouse.almagd555.com');
    url.searchParams.set('action', action);
    url.searchParams.set('api_key', this.apiKey);

    try {
      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'X-API-KEY': this.apiKey
        },
        body: JSON.stringify(bodyData)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      this.isOnline = true;
      return data;
    } catch (error) {
      console.error(`API POST error on action [${action}]:`, error);
      this.isOnline = false;
      throw error;
    }
  }

  /**
   * 0. Verify Admin Password for POS Login / Lock Screen
   */
  async verifyAdminPassword(password) {
    return await this.post('verify_admin_password', { password });
  }

  /**
   * 1. Health check & Server Status
   */
  async ping() {
    try {
      const url = `${this.baseUrl}?action=ping`;
      const response = await fetch(url);
      return await response.json();
    } catch (error) {
      return { success: false, status: 'offline', error: error.message };
    }
  }

  /**
   * 2. Fetch all products from store
   */
  async getProducts() {
    return await this.get('get_products');
  }

  /**
   * 3. Lookup a product directly by barcode
   */
  async lookupBarcode(barcode) {
    try {
      const code = String(barcode || '').trim();
      if (!code) return { success: false, error: 'Empty barcode' };
      return await this.get('lookup_barcode', { barcode: code });
    } catch (e) {
      console.warn('lookupBarcode API notice:', e.message);
      return { success: false, error: e.message };
    }
  }

  /**
   * 4. Submit a new sales invoice & deduct stock
   */
  async pushSale(salePayload) {
    return await this.post('push_sale', salePayload);
  }

  /**
   * 4.5 Get completed POS orders from cloud for multi-device synchronization
   */
  async getCompletedOrders(limit = 100) {
    return await this.get('get_completed_orders', { limit: limit });
  }

  /**
   * 5. Get invoice details by order_id or barcode
   */
  async getOrderDetails(orderId) {
    return await this.get('get_order_details', { order_id: orderId, barcode: orderId, q: orderId });
  }

  /**
   * 6. Process product return and restore inventory
   */
  async processReturn(returnPayload) {
    return await this.post('process_return', returnPayload);
  }

  /**
   * 7. Get online web orders
   */
  async getWebOrders(status = 'pending') {
    return await this.get('get_web_orders', { status: status });
  }

  /**
   * 8. Update online web order status
   */
  async updateOrderStatus(orderId, status) {
    return await this.post('update_order_status', { order_id: orderId, status: status });
  }

  /**
   * 9. Get POS Shift / Financial Reports
   */
  async getPosReports(params = 'today') {
    if (typeof params === 'string') {
      return await this.get('get_pos_reports', { period: params });
    }
    return await this.get('get_pos_reports', params || { period: 'today' });
  }

  /**
   * 10. Sync / Update Product Price, Cost, Stock, and Barcode
   */
  async syncProduct(productPayload) {
    return await this.post('sync_product', productPayload);
  }

  /**
   * 11. Record General Operating Expense
   */
  async recordExpense(expensePayload) {
    return await this.post('record_expense', expensePayload);
  }

  /**
   * 12. Pay Supplier & Deduct Balance
   */
  async paySupplier(supplierPayload) {
    return await this.post('pay_supplier', supplierPayload);
  }

  /**
   * 13. Get Suppliers, Expense Categories, and Partners List
   */
  async getPosMeta() {
    return await this.get('get_pos_meta');
  }

  /**
   * 14. Delete Product from Server Database
   */
  async deleteProduct(productId, barcode = '') {
    return await this.post('delete_product', { product_id: productId, barcode: barcode });
  }

  /**
   * 15. Submit Purchase Invoice (طھط³ط¬ظٹظ„ ظپط§طھظˆط±ط© ظ…ط´طھط±ظٹط§طھ / طھظˆط±ظٹط¯ ظˆط²ظٹط§ط¯ط© ط§ظ„ظ…ط®ط²ظˆظ†)
   */
  async pushPurchase(purchasePayload) {
    return await this.post('push_purchase', purchasePayload);
  }

  /**
   * 16. Get Past Purchase Invoices
   */
  async getPurchases(limit = 50) {
    return await this.get('get_purchases', { limit: limit });
  }

  /**
   * 17. Get Suppliers List
   */
  async getSuppliers() {
    return await this.get('get_suppliers');
  }

  /**
   * 17.1 Sync / Add / Update Supplier (ط¥ط¶ط§ظپط© ط£ظˆ طھط¹ط¯ظٹظ„ ظ…ظˆط±ط¯ ط³ط­ط§ط¨ظٹط§ظ‹)
   */
  async syncSupplier(supplierPayload) {
    return await this.post('sync_supplier', supplierPayload);
  }

  /**
   * 17.2 Get Supplier Ledger / Statement (ظƒط´ظپ ط­ط³ط§ط¨ ظ…ط§ظ„ظٹ طھظپطµظٹظ„ظٹ ظ„ظ„ظ…ظˆط±ط¯ ظ…ط¹ ظپظ„طھط±ط© ط§ظ„طھط§ط±ظٹط®)
   */
  async getSupplierLedger(supplierId, supplierName = '', fromDate = '', toDate = '') {
    const params = { supplier_id: supplierId };
    if (supplierName) params.supplier_name = supplierName;
    if (fromDate) params.from_date = fromDate;
    if (toDate) params.to_date = toDate;
    return await this.get('get_supplier_ledger', params);
  }

  /**
   * 17.3 Get Suppliers Comprehensive Report (طھظ‚ط±ظٹط± ط¥ط¬ظ…ط§ظ„ظٹ ط§ظ„ظ…ظˆط±ط¯ظٹظ† ظˆط§ظ„ظ…ط¯ظٹظˆظ†ظٹط§طھ)
   */
  async getSuppliersReport() {
    return await this.get('get_suppliers_report');
  }

  /**
   * 18. Get Delivery Drivers List (ط¬ظ„ط¨ ظ‚ط§ط¦ظ…ط© ط·ظٹط§ط±ظٹ ط§ظ„ط¯ظ„ظٹظپط±ظٹ)
   */
  async getDeliveryDrivers() {
    return await this.get('get_delivery_drivers');
  }

  /**
   * 19. Sync / Add Delivery Driver (ط¥ط¶ط§ظپط© ط£ظˆ طھط¹ط¯ظٹظ„ ط·ظٹط§ط± ط¯ظ„ظٹظپط±ظٹ)
   */
  async syncDeliveryDriver(driverPayload) {
    return await this.post('sync_delivery_driver', driverPayload);
  }

  /**
   * 20. Assign Order to Driver (ط¥ط³ظ†ط§ط¯ ط·ظ„ط¨ ظ„ط·ظٹط§ط± ط¨ط§ظ„ط§ط³ظ…)
   */
  async assignDeliveryDriver(assignPayload) {
    return await this.post('assign_delivery_driver', assignPayload);
  }

  /**
   * 21. Settle Delivery Account (طھطµظپظٹط© ط¹ظ‡ط¯ط© ط·ظٹط§ط± ط¯ظ„ظٹظپط±ظٹ)
   */
  async settleDeliveryAccount(settlePayload) {
    return await this.post('settle_delivery_account', settlePayload);
  }

  /**
   * 22. Get Driver Orders & Stats (ط¬ظ„ط¨ ط£ظˆط±ط¯ط±ط§طھ ظˆط¥ط­طµط§ط¦ظٹط§طھ ط·ظٹط§ط± ط¯ظ„ظٹظپط±ظٹ ظ…ط­ط¯ط¯)
   */
  async getDriverOrders(driverName, driverId = null) {
    return await this.get('get_driver_orders', { driver_name: driverName, driver_id: driverId });
  }

  /**
   * 22.1 Get Unassigned Delivery Orders (ط¬ظ„ط¨ ط·ظ„ط¨ط§طھ ط§ظ„طھظˆطµظٹظ„ ط§ظ„ظ…ط¹ظ„ظ‚ط© ظˆط¨ط¯ظˆظ† ط·ظٹط§ط±)
   */
  async getUnassignedDeliveryOrders() {
    return await this.get('get_unassigned_delivery_orders');
  }

  /**
   * 22.2 Settle Ad-hoc / Temporary Delivery (طھظ‚ظپظٹظ„ ط£ظˆط±ط¯ط± ط¯ظ„ظٹظپط±ظٹ ظ…ط¤ظ‚طھ ط¨ظ…ظ„ط§ط­ط¸ط© ظˆطھظˆط±ظٹط¯ ط§ظ„ظ†ظ‚ط¯ظٹط©)
   */
  async settleAdhocDelivery(settlePayload) {
    return await this.post('settle_adhoc_delivery', settlePayload);
  }

  /**
   * 22.3 Get Customer Info by Phone (ط¬ظ„ط¨ ط¨ظٹط§ظ†ط§طھ ط§ظ„ط¹ظ…ظٹظ„ ط§ظ„ظ…ط³ط¬ظ„ ط¨ط§ظ„ظ‡ط§طھظپ طھظ„ظ‚ط§ط¦ظٹط§ظ‹)
   */
  async getCustomerByPhone(phone) {
    return await this.get('get_customer_by_phone', { phone: phone });
  }

  async lookupCustomer(phone) {
    return await this.get('lookup_customer', { phone: phone });
  }

  /**
   * 22.4 Search Customers (ط§ظ„ط¨ط­ط« ظپظٹ ظ‚ط§ط¹ط¯ط© ط¨ظٹط§ظ†ط§طھ ط§ظ„ط¹ظ…ظ„ط§ط، ط¨ط§ظ„ط§ط³ظ… ط£ظˆ ط§ظ„ظ‡ط§طھظپ ط£ظˆ ط§ظ„ط¹ظ†ظˆط§ظ†)
   */
  async searchCustomers(query = '', page = 1, limit = 50) {
    return await this.get('search_customers', { q: query, page: page, limit: limit });
  }

  /**
   * 22.5 Sync All Customers from Web Orders (ط§ط³طھط®ط±ط§ط¬ ظˆطھط¬ظ…ظٹط¹ ط¨ظٹط§ظ†ط§طھ ط§ظ„ط¹ظ…ظ„ط§ط، ظ…ظ† ظƒط§ظپط© ط§ظ„ط·ظ„ط¨ط§طھ ط§ظ„ط³ط§ط¨ظ‚ط©)
   */
  async syncAllWebCustomers() {
    return await this.post('sync_all_web_customers');
  }

  /**
   * 22.6 Save / Update Customer Data (ط­ظپط¸ ط£ظˆ طھط¹ط¯ظٹظ„ ط¨ظٹط§ظ†ط§طھ ط¹ظ…ظٹظ„)
   */
  async saveCustomer(customerData) {
    return await this.post('save_customer', customerData);
  }

  /**
   * 22.7 Delete Customer (ط­ط°ظپ ط¹ظ…ظٹظ„)
   */
  async deleteCustomer(customerId) {
    return await this.post('delete_customer', { id: customerId });
  }

  /**
   * 23. Get Employees List (ط¬ظ„ط¨ ظ‚ط§ط¦ظ…ط© ط§ظ„ط¹ظ…ط§ظ„ ظˆط§ظ„ظ…ظˆط¸ظپظٹظ† ظ…ط¹ ظ…ظ„ط®طµ ط§ظ„ط±ظˆط§طھط¨ ظˆط§ظ„ط³ظ„ظپ)
   */
  async getEmployees(activeOnly = false) {
    return await this.get('get_employees', { active_only: activeOnly ? 1 : 0 });
  }

  /**
   * 24. Sync / Add / Update Employee (ط¥ط¶ط§ظپط© ط£ظˆ طھط¹ط¯ظٹظ„ ط¨ظٹط§ظ†ط§طھ ط¹ط§ظ…ظ„)
   */
  async syncEmployee(employeePayload) {
    return await this.post('sync_employee', employeePayload);
  }

  /**
   * 25. Delete / Deactivate Employee (ط­ط°ظپ ظ†ظ‡ط§ط¦ظٹ ط£ظˆ ط¥ظٹظ‚ط§ظپ ط¹ط§ظ…ظ„)
   */
  async deleteEmployee(employeeId, name = '', force = true) {
    return await this.post('delete_employee', {
      employee_id: employeeId,
      name: name,
      force: force ? 1 : 0
    });
  }

  /**
   * 25b. Toggle Employee Active Status (ط¥ظٹظ‚ط§ظپ ظ…ط¤ظ‚طھ ط£ظˆ ط¥ط¹ط§ط¯ط© طھظ†ط´ظٹط· ط¹ط§ظ…ظ„)
   */
  async toggleEmployeeStatus(employeeId, isActive) {
    return await this.post('delete_employee', {
      employee_id: employeeId,
      force: 0,
      status: isActive ? 1 : 0
    });
  }

  /**
   * 26. Record Salary Payout / Advance (طھط³ط¬ظٹظ„ طµط±ظپ ط³ظ„ظپط©طŒ ط±ط§طھط¨طŒ ظ…ظƒط§ظپط£ط©طŒ ط®طµظ…طŒ ظٹظˆظ…ظٹط©)
   */
  async recordSalaryPayout(payoutPayload) {
    return await this.post('record_salary_payout', payoutPayload);
  }

  /**
   * 27. Get Employee Financial Ledger (ظƒط´ظپ ط­ط³ط§ط¨ ظ…ط§ظ„ظٹ طھظپطµظٹظ„ظٹ ظ„ط¹ط§ظ…ظ„)
   */
  async getEmployeeLedger(employeeId, monthYear = '') {
    const params = { employee_id: employeeId };
    if (monthYear) params.month_year = monthYear;
    return await this.get('get_employee_ledger', params);
  }

  /**
   * 28. Get General Salary Payouts Log (ط³ط¬ظ„ ظ…ط¯ظپظˆط¹ط§طھ ط§ظ„ط±ظˆط§طھط¨ ظˆط§ظ„ط³ظ„ظپ ط§ظ„ط¹ط§ظ…ط©)
   */
  async getSalaryPayouts(monthYear = '', limit = 50) {
    const params = { limit: limit };
    if (monthYear) params.month_year = monthYear;
    return await this.get('get_salary_payouts', params);
  }

  /**
   * 29. Categories & Subcategories API (ط¬ظ„ط¨ ظˆظ…ط²ط§ظ…ظ†ط© ظˆط­ط°ظپ ط§ظ„طھطµظ†ظٹظپط§طھ ط§ظ„ط±ط¦ظٹط³ظٹط© ظˆط§ظ„ظپط±ط¹ظٹط©)
   */
  async getCategories() {
    return await this.get('get_categories');
  }

  async syncCategory(categoryPayload) {
    return await this.post('sync_category', categoryPayload);
  }

  async deleteCategory(categoryPayload) {
    return await this.post('delete_category', categoryPayload);
  }

  /**
   * 30. System Reset & Data Wipe (ط¥ط¹ط§ط¯ط© ط¶ط¨ط· ظˆطھطµظپظٹط± ط§ظ„ظ†ط¸ط§ظ… ظ…ظ† ط§ظ„ط¥ط¹ط¯ط§ط¯ط§طھ)
   * Modes:
   *  - zero_quantities_and_balances
   *  - wipe_sales_and_operations
   *  - factory_reset_all
   */
  async systemReset(mode, wipeProducts = 0) {
    const payload = {
      action: 'system_reset',
      mode: mode,
      confirm_token: 'CONFIRM_RESET_SYRIA_2026'
    };
    if (mode === 'factory_reset_all') {
      payload.wipe_products = wipeProducts ? 1 : 0;
    }
    return await this.post('system_reset', payload);
  }
}

window.api = new SyrianHomeAPI();

