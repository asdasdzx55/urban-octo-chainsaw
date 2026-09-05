/**
 * Syrian Home Supermarket - REST API Client Layer
 * Handles communication with https://supermarkrt.almagd555.com/api_sync.php
 */

class SyrianHomeAPI {
  constructor() {
    this.baseUrl = 'https://supermarkrt.almagd555.com/api_sync.php';
    this.apiKey = 'syrian_home_pos_secret_token_2026';
    this.isOnline = true;
  }

  /**
   * Helper method for GET requests with API Key
   */
  async get(action, params = {}) {
    const url = new URL(this.baseUrl);
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
          'Authorization': `Bearer ${this.apiKey}`
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
    const url = new URL(this.baseUrl);
    url.searchParams.set('action', action);
    url.searchParams.set('api_key', this.apiKey);

    try {
      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
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
  async getPosReports(period = 'today') {
    return await this.get('get_pos_reports', { period: period });
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
   * 15. Submit Purchase Invoice (تسجيل فاتورة مشتريات / توريد وزيادة المخزون)
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
   * 17.1 Sync / Add / Update Supplier (إضافة أو تعديل مورد سحابياً)
   */
  async syncSupplier(supplierPayload) {
    return await this.post('sync_supplier', supplierPayload);
  }

  /**
   * 17.2 Get Supplier Ledger / Statement (كشف حساب مالي تفصيلي للمورد مع فلترة التاريخ)
   */
  async getSupplierLedger(supplierId, supplierName = '', fromDate = '', toDate = '') {
    const params = { supplier_id: supplierId };
    if (supplierName) params.supplier_name = supplierName;
    if (fromDate) params.from_date = fromDate;
    if (toDate) params.to_date = toDate;
    return await this.get('get_supplier_ledger', params);
  }

  /**
   * 17.3 Get Suppliers Comprehensive Report (تقرير إجمالي الموردين والمديونيات)
   */
  async getSuppliersReport() {
    return await this.get('get_suppliers_report');
  }

  /**
   * 18. Get Delivery Drivers List (جلب قائمة طياري الدليفري)
   */
  async getDeliveryDrivers() {
    return await this.get('get_delivery_drivers');
  }

  /**
   * 19. Sync / Add Delivery Driver (إضافة أو تعديل طيار دليفري)
   */
  async syncDeliveryDriver(driverPayload) {
    return await this.post('sync_delivery_driver', driverPayload);
  }

  /**
   * 20. Assign Order to Driver (إسناد طلب لطيار بالاسم)
   */
  async assignDeliveryDriver(assignPayload) {
    return await this.post('assign_delivery_driver', assignPayload);
  }

  /**
   * 21. Settle Delivery Account (تصفية عهدة طيار دليفري)
   */
  async settleDeliveryAccount(settlePayload) {
    return await this.post('settle_delivery_account', settlePayload);
  }

  /**
   * 22. Get Driver Orders & Stats (جلب أوردرات وإحصائيات طيار دليفري محدد)
   */
  async getDriverOrders(driverName, driverId = null) {
    return await this.get('get_driver_orders', { driver_name: driverName, driver_id: driverId });
  }

  /**
   * 23. Get Employees List (جلب قائمة العمال والموظفين مع ملخص الرواتب والسلف)
   */
  async getEmployees(activeOnly = false) {
    return await this.get('get_employees', { active_only: activeOnly ? 1 : 0 });
  }

  /**
   * 24. Sync / Add / Update Employee (إضافة أو تعديل بيانات عامل)
   */
  async syncEmployee(employeePayload) {
    return await this.post('sync_employee', employeePayload);
  }

  /**
   * 25. Delete / Deactivate Employee (حذف أو إيقاف عامل)
   */
  async deleteEmployee(employeeId, name = '') {
    return await this.post('delete_employee', { employee_id: employeeId, name: name });
  }

  /**
   * 26. Record Salary Payout / Advance (تسجيل صرف سلفة، راتب، مكافأة، خصم، يومية)
   */
  async recordSalaryPayout(payoutPayload) {
    return await this.post('record_salary_payout', payoutPayload);
  }

  /**
   * 27. Get Employee Financial Ledger (كشف حساب مالي تفصيلي لعامل)
   */
  async getEmployeeLedger(employeeId, monthYear = '') {
    const params = { employee_id: employeeId };
    if (monthYear) params.month_year = monthYear;
    return await this.get('get_employee_ledger', params);
  }

  /**
   * 28. Get General Salary Payouts Log (سجل مدفوعات الرواتب والسلف العامة)
   */
  async getSalaryPayouts(monthYear = '', limit = 50) {
    const params = { limit: limit };
    if (monthYear) params.month_year = monthYear;
    return await this.get('get_salary_payouts', params);
  }
}

window.api = new SyrianHomeAPI();
