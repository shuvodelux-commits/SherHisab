'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const root = path.resolve(__dirname, '..');
const pos = fs.readFileSync(path.join(root, 'pos.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'style.html'), 'utf8');
let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('PASS', name); }
  catch (err) { fail++; console.error('FAIL', name); console.error(err.stack || err); }
}
function mediaBlock(source, query) {
  const start = source.indexOf('@media ' + query + ' {');
  assert.notStrictEqual(start, -1, 'missing media query ' + query);
  let i = source.indexOf('{', start), depth = 0;
  for (; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error('unclosed media block ' + query);
}
const tablet = mediaBlock(css, '(min-width: 541px) and (max-width: 1024px) and (min-height: 541px)');

test('tablet uses the approved balanced desktop-style POS columns', () => {
  assert.match(tablet, /#page-pos\s+\.pos-layout\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(0,\s*1fr\)/);
});

test('tablet open-day status is a compact single-row grid', () => {
  assert.match(tablet, /#page-pos\s+#posSessionBanner\s*\{[^}]*grid-template-columns:\s*auto\s+minmax\(0,\s*1fr\)\s+auto/);
  assert.match(tablet, /#page-pos\s+#posSessionBanner\s+\.session-mobile-head\s*\{[^}]*display:\s*contents/);
  assert.match(tablet, /#page-pos\s+#posSessionBanner\s+\.session-mobile-metrics\s*\{[^}]*grid-template-columns:\s*repeat\(4/);
});

test('recent drafts are visually integrated into the tablet search control', () => {
  assert.match(tablet, /#page-pos\s+\.pos-search-drafts-row\s*\{[^}]*border:\s*1px solid var\(--color-border\)/);
  assert.match(tablet, /#page-pos\s+\.pos-search-drafts-row\s+\.pos-product-search-box\s+\.search-input\s*\{[^}]*border:\s*0/);
  assert.match(tablet, /#page-pos\s+\.pos-recent-drafts\s*\{[^}]*border-left:\s*1px solid/);
});

test('tablet customer controls are compact and bilingual placeholders remain usable without visible labels', () => {
  assert.match(pos, /id="posCustomerName"[^>]*placeholder="Enter customer name — কাস্টমারের নাম"[^>]*aria-label="Customer Name — কাস্টমারের নাম"/);
  assert.match(pos, /id="posCustomerPhone"[^>]*placeholder="Enter phone number — ফোন নম্বর"[^>]*aria-label="Phone Number — ফোন নম্বর"/);
  assert.match(tablet, /#page-pos\s+\.pos-customer-section\s*>\s*label\s*\{[^}]*display:\s*none/);
  assert.match(tablet, /#page-pos\s+\.pos-customer-actions\s+\.btn\s*\{[^}]*min-height:\s*36px/);
});

test('tablet cart has explicit columns and readable product-name allocation', () => {
  assert.match(pos, /class="pos-cart-columns"[^>]*>[\s\S]*Product[\s\S]*Qty[\s\S]*Price \(৳\)[\s\S]*Total \(৳\)/);
  assert.match(tablet, /#page-pos\s+\.pos-cart-columns\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+44px\s+62px\s+58px\s+22px/);
  assert.match(tablet, /#page-pos\s+\.cart-row\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+44px\s+62px\s+58px\s+22px/);
  assert.match(tablet, /#page-pos\s+\.cart-row\s+\.c-name\s*\{[^}]*overflow-wrap:\s*anywhere/);
});

test('product and cart renderers stay text-only with no product thumbnails', () => {
  const productRenderer = pos.slice(pos.indexOf('function posRenderProductGrid_'), pos.indexOf('function posComputeAutoPricing_'));
  const cartRenderer = pos.slice(pos.indexOf('function posRenderCart_'), pos.indexOf('function posSyncShortagePanel_'));
  assert.doesNotMatch(productRenderer, /<img\b/i);
  assert.doesNotMatch(cartRenderer, /<img\b/i);
});

console.log(`\n${pass}/${pass + fail} passed`);
if (fail) process.exit(1);
