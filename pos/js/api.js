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
    return await this.get('lookup_barcode', { barcode: barcode.trim() });
  }

  /**
   * 4. Submit a new sales invoice & deduct stock
   */
  async pushSale(salePayload) {
    return await this.post('push_sale', salePayload);
  }

  /**
   * 5. Get invoice details by order_id or barcode
   */
  async getOrderDetails(orderId) {
    return await this.get('get_order_details', { order_id: orderId });
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
}

window.api = new SyrianHomeAPI();
