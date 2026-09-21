'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const pos = read('pos.html');
const css = read('style.html');
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

test('tablet POS keeps a desktop-style two-column product and sale layout', () => {
  const tablet = mediaBlock(css, '(min-width: 541px) and (max-width: 900px) and (min-height: 541px)');
  assert.doesNotMatch(tablet, /\.pos-layout\s*\{\s*grid-template-columns:\s*1fr/);
  assert.match(tablet, /#page-pos\s+\.pos-layout\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(0,\s*1fr\)/);
});

test('POS search row exposes compact recent draft controls', () => {
  assert.match(pos, /class="pos-search-drafts-row"/);
  assert.match(pos, /id="posRecentDrafts"/);
  assert.match(pos, /id="posRecentDraftsList"/);
  assert.match(pos, /id="posRecentDraftsViewAll"/);
});

test('recent drafts reuse the existing list RPC and render only the newest three', () => {
  assert.match(pos, /function\s+posLoadRecentDrafts_\s*\(/);
  assert.match(pos, /serverCall\(['"]getSalesDraftList['"],\s*authToken\)/);
  assert.match(pos, /slice\(0,\s*3\)/);
  assert.match(pos, /function\s+posRenderRecentDrafts_\s*\(/);
});

test('tablet shows two recent drafts, desktop can show three, phone hides the strip', () => {
  assert.match(css, /\.pos-recent-draft-card:nth-child\(n\+3\)\s*\{\s*display:\s*none/);
  assert.match(css, /@media\s*\(max-width:\s*540px\)[\s\S]*\.pos-recent-drafts\s*\{\s*display:\s*none\s*!important/);
  assert.match(css, /@media\s*\(min-width:\s*1025px\)[\s\S]*\.pos-recent-draft-card:nth-child\(n\+3\)\s*\{\s*display:\s*inline-flex/);
});

test('opening a draft protects an unsaved POS sale and View All opens Draft Invoices', () => {
  assert.match(pos, /function\s+posHasUnsavedSale_\s*\(/);
  assert.match(pos, /function\s+posOpenDraft_\s*\(draftId\)[\s\S]*posHasUnsavedSale_\(\)[\s\S]*confirmAction\s*\(/);
  assert.match(pos, /id=['"]posRecentDraftsViewAll['"][\s\S]*addEventListener\(['"]click['"][\s\S]*goToPage\(['"]draftSales['"]\)/);
});

console.log(`\n${pass}/${pass + fail} passed`);
if (fail) process.exit(1);
