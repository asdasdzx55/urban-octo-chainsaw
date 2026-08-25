const BarcodeParser = require('./pos/js/barcode-parser.js');

console.log('🧪 Starting Advanced Edge-Case Unit Tests...\n');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`❌ FAIL: ${message}`);
    failed++;
  }
}

// 1. Live API Product with Integer local_code and empty string barcode
const liveApiProduct = {
  id: 3,
  name: 'نوكيا بالفستق',
  category: 'عام',
  price: 1400,
  barcode: '',
  local_code: 10725, // integer from MySQL!
  stock: 10
};

// Test Case A: Standard 13-digit scale barcode
const resA = BarcodeParser.parse('2010725000603');
assert(BarcodeParser.matchesProduct(resA, liveApiProduct) === true, 'Matches live MySQL product with integer local_code 10725');

// Test Case B: Barcode with spaces from camera OCR/text: "2 010725 000603"
const resB = BarcodeParser.parse('2 010725 000603');
assert(resB.isScale === true, 'Cleaned spaces and identified scale barcode');
assert(resB.itemCode === '10725', 'itemCode is 10725');
assert(resB.weight === 0.060, 'weight is 0.060 kg');
assert(BarcodeParser.matchesProduct(resB, liveApiProduct) === true, 'Matches live product with spaces in barcode');

// Test Case C: UPC-A 14-digit with leading zero: "02010725000603"
const resC = BarcodeParser.parse('02010725000603');
assert(resC.isScale === true, 'Handled 14-digit UPC-A with leading 0');
assert(resC.itemCode === '10725', 'Extracted 10725 from UPC-A');
assert(BarcodeParser.matchesProduct(resC, liveApiProduct) === true, 'Matches live product from 14-digit UPC-A');

// Test Case D: 12-digit barcode without check digit: "201072500060"
const resD = BarcodeParser.parse('201072500060');
assert(resD.isScale === true, 'Handled 12-digit scale barcode without check digit');
assert(resD.itemCode === '10725', 'Extracted 10725 from 12-digit');
assert(BarcodeParser.matchesProduct(resD, liveApiProduct) === true, 'Matches live product from 12-digit');

// Test Case E: Product with null barcode and null local_code
const nullProduct = {
  id: 99,
  name: 'بدون كود',
  barcode: null,
  local_code: null
};
assert(BarcodeParser.matchesProduct(resA, nullProduct) === false, 'Safe with null fields without throwing TypeError');

console.log(`\n========================================`);
console.log(`Results: ${passed} passed, ${failed} failed.`);
console.log(`========================================\n`);

if (failed > 0) process.exit(1);
