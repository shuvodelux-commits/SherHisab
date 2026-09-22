'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const root = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
let pass = 0, fail = 0;
function test(name, fn) { try { fn(); pass++; console.log('PASS', name); } catch (e) { fail++; console.error('FAIL', name); console.error(e.stack || e); } }
const pos = read('pos.html');
const purchase = read('purchase.html');
const css = read('style.html');

test('purchase Add Product matches approved two-filter mockup structure', () => {
  assert.match(purchase, /class="purchase-filter-grid"/);
  assert.match(purchase, /id="purCategoryFilter"/);
  assert.match(purchase, /id="purBrandFilter"/);
  assert.match(purchase, />Brand\s*<span class="bn-hint"/);
  assert.match(purchase, /class="purchase-search-row"/);
  assert.match(purchase, /<button[^>]*class="[^"]*purchase-add-icon-btn[^"]*"[^>]*id="purAddLineBtn"/);
});

test('purchase brand filter is populated and jointly filters the product picker', () => {
  assert.match(purchase, /function\s+purFillBrandFilter_\s*\(/);
  assert.match(purchase, /purFillBrandFilter_\(\)/);
  assert.match(purchase, /document\.getElementById\("purBrandFilter"\)\.value/);
  assert.match(purchase, /!brand\s*\|\|\s*p\.brand\s*===\s*brand/);
  assert.match(purchase, /document\.getElementById\("purBrandFilter"\)\.disabled\s*=\s*!supplierId/);
  assert.match(purchase, /purBrandFilter"\)\.addEventListener\("change"/);
});

test('purchase mobile line card uses the mockup five-position row', () => {
  assert.match(css, /#page-purchase #purLinesTable tbody tr[\s\S]*grid-template-columns:\s*70px\s+minmax\(78px,1fr\)\s+minmax\(78px,1fr\)\s+48px\s+minmax\(68px,\.75fr\)/);
  assert.match(css, /#page-purchase #purLinesTable tbody td:nth-child\(5\)[\s\S]*grid-column:\s*5/);
  assert.match(css, /#page-purchase #purLinesTable tbody td:last-child[\s\S]*grid-column:\s*4/);
});

test('POS cart phone row preserves Qty Price Remove Total order', () => {
  assert.match(css, /@media\s*\(max-width:\s*499px\)[\s\S]*#page-pos\s+\.cart-row\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(76px,\s*\.8fr\)\s+42px\s+minmax\(70px,\s*\.7fr\)/);
  assert.match(css, /#page-pos\s+\.cart-row\s*>\s*\.cart-remove\s*\{[^}]*grid-column:\s*3/);
  assert.match(css, /#page-pos\s+\.cart-row\s+\.c-line-total-wrap\s*\{[^}]*grid-column:\s*4/);
  assert.match(pos, /class="c-mobile-label">Qty</);
  assert.match(pos, /class="c-mobile-label">Price</);
  assert.match(pos, /class="c-mobile-label">Total</);
});

test('POS customer controls use compact mockup action row', () => {
  assert.match(pos, /class="pos-customer-actions"/);
  assert.match(pos, /id="posCustomerMoreToggle"/);
  assert.match(pos, /id="posHistoryBtn"/);
  assert.match(css, /\.pos-customer-actions[\s\S]*grid-template-columns:\s*1fr\s+1fr/);
});

console.log(`\n${pass}/${pass + fail} passed`);
if (fail) process.exit(1);
