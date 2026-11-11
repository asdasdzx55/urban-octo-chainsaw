/**
 * Syrian Home POS - Barcode Parser Utility
 * Implements variable weight scale barcodes (EAN-13 prefix 20) & standard retail barcodes.
 * 
 * Rules:
 * 1. 13-digit (or 12/14-digit) barcode starting with "20":
 *    - Type: Variable-weight scale barcode (باركود ميزان ذو وزن متغير)
 *    - Item Code (كود الصنف): Digits 3 to 7 (5 digits) -> barcode.slice(2, 7)
 *    - Weight (الوزن): Digits 8 to 12 (5 digits) -> barcode.slice(7, 12), divided by 1000 to get kg (e.g. 00060 = 0.060 kg)
 *    - Check Digit (رقم التحقق): Digit 13 (index 12) -> ignored in calculations
 *    - Quantity (الكمية المعاملة): Weight in kg (e.g. 0.060)
 * 
 * 2. Any other barcode:
 *    - Type: Standard barcode (باركود قياسي)
 *    - Item Code: Full barcode string
 *    - Quantity: 1 (default)
 */

class BarcodeParser {
  /**
   * Parse raw scanned barcode string into structured metadata
   * @param {string|number} rawBarcode 
   * @returns {Object} Parsed barcode info
   */
  static parse(rawBarcode) {
    // 1. Sanitize: remove whitespace, dashes, carriage returns, newlines
    let barcode = String(rawBarcode || '').trim().replace(/[\s\r\n\t\-_]/g, '');

    if (!barcode) {
      return {
        isValid: false,
        isScale: false,
        originalBarcode: '',
        itemCode: '',
        itemCodeNumeric: '',
        weight: null,
        weightGrams: null,
        quantity: 1,
        checkDigit: null,
        unitType: 'piece',
        unit: 'قطعة',
        typeLabel: 'غير معروف'
      };
    }

    // Support 14-digit with leading 0 (UPC-A / GTIN-14: 02010725000603)
    if (barcode.length === 14 && barcode.startsWith('020')) {
      barcode = barcode.slice(1); // 2010725000603
    }

    // Rule 1: Scale variable-weight barcode (Prefix "20", standard EAN-13 13 digits or 12 digits)
    if (/^20\d{10,11}$/.test(barcode)) {
      const prefix = barcode.slice(0, 2);              // "20"
      const itemCode = barcode.slice(2, 7);            // Digits 3-7 (5 digits, e.g. "10725")
      const weightRaw = barcode.slice(7, 12);          // Digits 8-12 (5 digits in grams)
      const checkDigit = barcode.length >= 13 ? barcode.charAt(12) : null;
      
      const weightGrams = parseInt(weightRaw, 10) || 0;
      // Convert grams to kg (e.g. 00060 -> 60 / 1000 = 0.060 kg)
      const weightKg = parseFloat((weightGrams / 1000).toFixed(3));
      const itemCodeNumeric = String(parseInt(itemCode, 10) || itemCode);

      return {
        isValid: true,
        isScale: true,
        originalBarcode: barcode,
        prefix: prefix,
        itemCode: itemCode,                              // e.g. "10725"
        itemCodeNumeric: itemCodeNumeric,                // e.g. "10725"
        weight: weightKg,                                // e.g. 0.060
        weightGrams: weightGrams,                        // e.g. 60
        quantity: weightKg > 0 ? weightKg : 1,           // Handled quantity value
        checkDigit: checkDigit,                          // e.g. "3"
        unitType: 'weight',
        unit: 'كجم',
        typeLabel: 'باركود ميزان (وزن متغير)'
      };
    }

    // Rule 2: Non-scale standard barcode (EAN-13, Code 128, UPC, Local codes, etc.)
    return {
      isValid: true,
      isScale: false,
      originalBarcode: barcode,
      prefix: null,
      itemCode: barcode,
      itemCodeNumeric: /^\d+$/.test(barcode) ? String(parseInt(barcode, 10)) : barcode,
      weight: null,
      weightGrams: null,
      quantity: 1,
      checkDigit: null,
      unitType: 'piece',
      unit: 'قطعة',
      typeLabel: 'باركود قياسي'
    };
  }

  static _splitAllBarcodes(product) {
    const rawAll = String(product?.all_barcodes ?? '').trim().toLowerCase();
    if (!rawAll) return [];
    return rawAll.split(/[,;\s]+/).map(s => s.trim()).filter(Boolean);
  }

  static _matchTier(parsed, product) {
    if (!parsed || !product) return 99;

    const pBarcode = String(product.barcode ?? '').trim().toLowerCase();
    const pBarcode2 = String(product.barcode2 ?? '').trim().toLowerCase();
    const pBarcode3 = String(product.barcode3 ?? '').trim().toLowerCase();
    const pPackBarcode = String(product.pack_barcode ?? '').trim().toLowerCase();
    const pLocal = String(product.local_code ?? '').trim().toLowerCase();
    const directBarcodes = [pBarcode, pBarcode2, pBarcode3, pPackBarcode].filter(Boolean);

    if (parsed.isScale) {
      const code = String(parsed.itemCode || '').toLowerCase();
      const codeNum = String(parsed.itemCodeNumeric || '').toLowerCase();
      const orig = String(parsed.originalBarcode || '').toLowerCase();

      if (directBarcodes.some(b => b === orig || b === code || b === codeNum || (b.startsWith('20') && b.slice(2, 7) === code))) {
        return 0;
      }
      const list = BarcodeParser._splitAllBarcodes(product);
      if (list.some(t => t === code || t === codeNum || t === orig)) {
        return 1;
      }
      if (pLocal && (pLocal === code || pLocal === codeNum)) {
        return 2;
      }
      return 99;
    }

    const raw = String(parsed.originalBarcode || '').toLowerCase();
    const rawNum = String(parsed.itemCodeNumeric || '').toLowerCase();
    if (!raw) return 99;

    if (directBarcodes.includes(raw)) return 0;
    const list = BarcodeParser._splitAllBarcodes(product);
    if (list.includes(raw)) return 1;
    if (pLocal && (pLocal === raw || (rawNum && pLocal === rawNum))) return 2;
    if (rawNum && rawNum !== raw && (directBarcodes.includes(rawNum) || list.includes(rawNum))) {
      return 3;
    }
    return 99;
  }

  /**
   * Find the highest-priority matching product for a parsed barcode structure.
   * Never matches database ID as a barcode to avoid numeric ID collisions.
   * @param {Object} parsed Parsed barcode object
   * @param {Array} products Product catalog array
   * @returns {Object|null} Best matched product or null
   */
  static findBestMatch(parsed, products) {
    if (!parsed || !Array.isArray(products) || products.length === 0) return null;
    let bestProd = null;
    let bestTier = 99;
    for (let i = 0; i < products.length; i++) {
      const p = products[i];
      const tier = BarcodeParser._matchTier(parsed, p);
      if (tier < bestTier) {
        bestTier = tier;
        bestProd = p;
        if (tier === 0) break;
      }
    }
    return bestProd;
  }

  /**
   * Helper to check if a product matches a parsed barcode structure safely
   * Handles strings, numbers, nulls, and variations in product object fields
   * @param {Object} parsed Parsed barcode object
   * @param {Object} product Product object from inventory/catalog
   * @returns {boolean} True if matched
   */
  static matchesProduct(parsed, product) {
    return BarcodeParser._matchTier(parsed, product) < 99;
  }
}

// Global exposure
if (typeof window !== 'undefined') {
  window.BarcodeParser = BarcodeParser;
  window.parseBarcode = BarcodeParser.parse;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = BarcodeParser;
}
