const BarcodeParser = require('./pos/js/barcode-parser.js');

console.log('🧪 Starting Barcode Parser Unit Tests...\n');

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

// Test Case 1: The user's image barcode (2010725000603)
console.log('--- Test Case 1: Variable-Weight Scale Barcode (User Image) ---');
const res1 = BarcodeParser.parse('2010725000603');
console.log('Parsed:', res1);

assert(res1.isValid === true, 'Barcode is valid');
assert(res1.isScale === true, 'isScale is true');
assert(res1.itemCode === '10725', 'Item code extracted is 10725');
assert(res1.weight === 0.060, 'Weight in kg is 0.060');
assert(res1.weightGrams === 60, 'Weight in grams is 60');
assert(res1.quantity === 0.060, 'Quantity is 0.060');
assert(res1.checkDigit === '3', 'Check digit is 3');
assert(res1.unitType === 'weight', 'unitType is weight');
assert(res1.unit === 'كجم', 'unit is كجم');

// Calculation check with price = 1400.00 / kg
const price1 = 1400.00;
const total1 = parseFloat((price1 * res1.quantity).toFixed(2));
assert(total1 === 84.00, `Total price calculation: 1400 * 0.060 = 84.00 (Got: ${total1})`);

// Test Case 2: Another scale barcode (2000125004508 - 450g of item 00125)
console.log('\n--- Test Case 2: Variable-Weight Scale Barcode (450g) ---');
const res2 = BarcodeParser.parse('2000125004508');
console.log('Parsed:', res2);

assert(res2.isScale === true, 'isScale is true');
assert(res2.itemCode === '00125', 'Item code extracted is 00125');
assert(res2.itemCodeNumeric === '125', 'Item code numeric is 125');
assert(res2.weight === 0.450, 'Weight in kg is 0.450');
assert(res2.quantity === 0.450, 'Quantity is 0.450');
assert(res2.checkDigit === '8', 'Check digit is 8');

// Test Case 3: Standard retail barcode (e.g. 6221000100010)
console.log('\n--- Test Case 3: Standard Retail Barcode ---');
const res3 = BarcodeParser.parse('6221000100010');
console.log('Parsed:', res3);

assert(res3.isScale === false, 'isScale is false');
assert(res3.itemCode === '6221000100010', 'Item code is full barcode');
assert(res3.quantity === 1, 'Quantity is 1');
assert(res3.unitType === 'piece', 'unitType is piece');
assert(res3.unit === 'قطعة', 'unit is قطعة');

// Test Case 4: Product matching helper test
console.log('\n--- Test Case 4: Product Matching Helper ---');
const sampleProduct = {
  id: 10725,
  name: 'نوكا بالفستق',
  price: 1400.00,
  barcode: '10725',
  local_code: '10725'
};

assert(BarcodeParser.matchesProduct(res1, sampleProduct) === true, 'res1 matches sample product with local_code 10725');

const nonMatchingProduct = {
  id: 99999,
  name: 'صنف آخر',
  barcode: '99999',
  local_code: '99999'
};

assert(BarcodeParser.matchesProduct(res1, nonMatchingProduct) === false, 'res1 does not match nonMatchingProduct');

console.log(`\n========================================`);
console.log(`Results: ${passed} passed, ${failed} failed.`);
console.log(`========================================\n`);

if (failed > 0) {
  process.exit(1);
}
