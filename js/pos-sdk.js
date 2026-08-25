/**
 * POS & Cashier Barcode Scanner Web SDK
 * Easily embed and integrate the barcode scanner into any Cashier / POS / E-Commerce website.
 * 
 * Usage Example:
 * <script src="https://asdasdzx55.github.io/urban-octo-chainsaw/js/pos-sdk.js"></script>
 * <script>
 *   const scanner = new POSScannerSDK({
 *     scannerUrl: 'https://asdasdzx55.github.io/urban-octo-chainsaw/',
 *     onScan: function(result) {
 *        console.log("Scanned Barcode:", result.code, "Format:", result.format);
 *        // Add to cashier cart automatically:
 *        addProductToCart(result.code);
 *     }
 *   });
 * </script>
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.POSScannerSDK = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {

  class POSScannerSDK {
    constructor(options = {}) {
      this.scannerUrl = options.scannerUrl || 'https://asdasdzx55.github.io/urban-octo-chainsaw/';
      this.onScan = options.onScan || function(data) { console.log('Scanned:', data); };
      this.onClose = options.onClose || function() {};
      this.modal = null;
      this.iframe = null;
      this.isOpen = false;

      this.initListener();
    }

    initListener() {
      window.addEventListener('message', (event) => {
        // Filter messages from our scanner
        if (event.data && (event.data.type === 'POS_BARCODE_SCANNED' || event.data.type === 'BARCODE_SCANNED')) {
          const rawCode = event.data.code;
          const parsed = (typeof window !== 'undefined' && window.BarcodeParser) ? window.BarcodeParser.parse(rawCode) : null;

          this.onScan({
            code: rawCode,
            format: event.data.format,
            is_scale: event.data.is_scale !== undefined ? event.data.is_scale : (parsed ? parsed.isScale : false),
            item_code: event.data.item_code || (parsed ? parsed.itemCode : rawCode),
            weight: event.data.weight !== undefined ? event.data.weight : (parsed ? parsed.weight : null),
            quantity: event.data.quantity !== undefined ? event.data.quantity : (parsed ? parsed.quantity : 1),
            timestamp: event.data.timestamp || new Date().toISOString()
          });

          // If autoClose is true, close modal
          if (this.autoClose) {
            this.close();
          }
        }

        if (event.data && event.data.type === 'POS_MODAL_CLOSE') {
          this.close();
        }
      });
    }

    /**
     * Open Scanner in a responsive modal dialog over the cashier screen
     */
    open(options = {}) {
      if (this.isOpen) return;

      this.autoClose = options.autoClose || false;
      const targetUrl = new URL(this.scannerUrl);
      targetUrl.searchParams.set('mode', 'pos');
      if (options.continuous !== undefined) {
        targetUrl.searchParams.set('continuous', options.continuous ? '1' : '0');
      }

      // Create modal overlay
      this.modal = document.createElement('div');
      this.modal.id = 'pos-scanner-modal-overlay';
      this.modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: rgba(0, 0, 0, 0.75);
        backdrop-filter: blur(4px);
        z-index: 999999;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 16px;
        box-sizing: border-box;
      `;

      // Create container
      const container = document.createElement('div');
      container.style.cssText = `
        position: relative;
        width: 100%;
        max-width: 540px;
        height: 90vh;
        max-height: 680px;
        background: #111827;
        border-radius: 20px;
        overflow: hidden;
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
        display: flex;
        flex-direction: column;
      `;

      // Header with close button
      const header = document.createElement('div');
      header.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 16px;
        background: #1f2937;
        color: #ffffff;
        font-family: sans-serif;
        font-size: 14px;
        font-weight: bold;
        border-bottom: 1px solid #374151;
      `;
      header.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px;">
          <span>📷 ماسح باركود الكاشير | POS Scanner</span>
        </div>
        <button id="btn-close-pos-modal" style="
          background: #374151;
          color: #fff;
          border: none;
          border-radius: 8px;
          padding: 6px 12px;
          font-size: 12px;
          cursor: pointer;
        ">✕ إغلاق</button>
      `;

      // Iframe
      this.iframe = document.createElement('iframe');
      this.iframe.src = targetUrl.toString();
      this.iframe.style.cssText = `
        width: 100%;
        flex: 1;
        border: none;
      `;
      this.iframe.allow = "camera; microphone";

      container.appendChild(header);
      container.appendChild(this.iframe);
      this.modal.appendChild(container);
      document.body.appendChild(this.modal);

      document.getElementById('btn-close-pos-modal').addEventListener('click', () => this.close());
      this.isOpen = true;
    }

    /**
     * Close the modal
     */
    close() {
      if (this.modal && this.modal.parentNode) {
        this.modal.parentNode.removeChild(this.modal);
      }
      this.isOpen = false;
      this.modal = null;
      this.iframe = null;
      this.onClose();
    }

    /**
     * Embed directly into a designated DOM container element on the page
     */
    mount(containerElement, options = {}) {
      if (!containerElement) return;
      const targetUrl = new URL(this.scannerUrl);
      targetUrl.searchParams.set('mode', 'pos_embedded');
      
      const iframe = document.createElement('iframe');
      iframe.src = targetUrl.toString();
      iframe.style.cssText = `
        width: 100%;
        height: 100%;
        min-height: 400px;
        border: none;
        border-radius: 12px;
      `;
      iframe.allow = "camera; microphone";
      containerElement.innerHTML = '';
      containerElement.appendChild(iframe);
    }
  }

  return POSScannerSDK;
}));
