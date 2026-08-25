/**
 * Syrian Home - Barcode Parser Utility
 * Implements variable weight scale barcodes (EAN-13 prefix 20) & standard retail barcodes.
 * 
 * Rules:
 * 1. 13-digit barcode starting with "20":
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
    const barcode = String(rawBarcode || '').trim();

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

    // Rule 1: 13 digits starting with "20" (Scale variable weight barcode)
    if (/^20\d{11}$/.test(barcode)) {
      const prefix = barcode.slice(0, 2);              // "20"
      const itemCode = barcode.slice(2, 7);            // Digits 3-7 (5 digits)
      const weightRaw = barcode.slice(7, 12);          // Digits 8-12 (5 digits in grams)
      const checkDigit = barcode.charAt(12);           // Digit 13 (Check Digit)
      
      const weightGrams = parseInt(weightRaw, 10) || 0;
      // Convert grams to kg (e.g. 00060 -> 60 / 1000 = 0.060 kg)
      const weightKg = parseFloat((weightGrams / 1000).toFixed(3));
      const itemCodeNumeric = String(parseInt(itemCode, 10));

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

    // Rule 2: Non-scale standard barcode
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

  /**
   * Helper to check if a product matches a parsed barcode structure
   */
  static matchesProduct(parsed, product) {
    if (!parsed || !product) return false;

    const pBarcode = (product.barcode || '').trim();
    const pLocal = (product.local_code || '').trim().toLowerCase();
    const pId = String(product.id || '');
    const pAllBarcodes = (product.all_barcodes || '').trim();

    if (parsed.isScale) {
      const code = parsed.itemCode.toLowerCase();
      const codeNum = parsed.itemCodeNumeric.toLowerCase();

      if (pLocal === code || pLocal === codeNum) return true;
      if (pBarcode === parsed.itemCode || pBarcode === parsed.itemCodeNumeric || pBarcode === parsed.originalBarcode) return true;
      if (pBarcode.startsWith('20') && pBarcode.slice(2, 7) === parsed.itemCode) return true;
      if (pId === code || pId === codeNum) return true;

      if (pAllBarcodes) {
        const list = pAllBarcodes.split(/[,;\s]+/).map(s => s.trim().toLowerCase());
        if (list.includes(code) || list.includes(codeNum) || list.includes(parsed.originalBarcode.toLowerCase())) {
          return true;
        }
      }

      return false;
    }

    const raw = parsed.originalBarcode.toLowerCase();
    if (pBarcode.toLowerCase() === raw) return true;
    if (pLocal === raw) return true;
    if (pId === raw) return true;

    if (pAllBarcodes) {
      const list = pAllBarcodes.split(/[,;\s]+/).map(s => s.trim().toLowerCase());
      if (list.includes(raw)) return true;
    }

    return false;
  }
}

if (typeof window !== 'undefined') {
  window.BarcodeParser = BarcodeParser;
  window.parseBarcode = BarcodeParser.parse;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = BarcodeParser;
}
