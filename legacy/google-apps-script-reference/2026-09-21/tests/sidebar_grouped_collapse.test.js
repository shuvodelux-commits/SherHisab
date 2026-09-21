'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('PASS', name); }
  catch (err) { fail++; console.error('FAIL', name); console.error(err.stack || err); }
}

const ui = read('UI.gs');
const js = read('javascript.html');
const css = read('style.html');
const index = read('index.html');

function navMeta(key) {
  const re = new RegExp("\\{\\s*key:\\s*'" + key + "'[\\s\\S]*?\\}", 'm');
  const m = ui.match(re);
  assert.ok(m, 'missing NAV_ITEMS entry for ' + key);
  return m[0];
}

test('sidebar metadata encodes the approved six divider groups and exact desktop order', () => {
  const expected = [
    ['dashboard', 0, 10], ['pos', 0, 20],
    ['sales', 1, 30], ['customers', 1, 40],
    ['purchase', 2, 50], ['suppliers', 2, 60], ['vendors', 2, 70],
    ['products', 3, 80],
    ['daybook', 4, 90], ['bank', 4, 100], ['expense', 4, 110], ['finance', 4, 120],
    ['reports', 5, 130], ['settings', 6, 140]
  ];
  expected.forEach(([key, group, order]) => {
    const block = navMeta(key);
    assert.match(block, new RegExp('sidebarGroup:\\s*' + group + '\\b'), key + ' group');
    assert.match(block, new RegExp('sidebarOrder:\\s*' + order + '\\b'), key + ' order');
  });
});

test('desktop sidebar renderer sorts by sidebarOrder and inserts divider elements only between visible groups', () => {
  assert.match(js, /function\s+sidebarItemsInOrder_\s*\(/);
  assert.match(js, /sidebarOrder/);
  assert.match(js, /item\.sidebarGroup/);
  assert.match(js, /className\s*=\s*['"]nav-divider['"]/);
  assert.match(js, /nav\.appendChild\(divider\)/);
  assert.match(js, /buildNav_\(items\)/);
  assert.doesNotMatch(js, /nav-category|category-heading|MAIN|ACCOUNTS\s*&\s*FINANCE/);
});

test('menu toggle is always available and desktop uses a persisted collapsed rail instead of drawer-open state', () => {
  assert.match(index, /id="menuToggle"/);
  assert.match(css, /#menuToggle\s*\{[\s\S]*display:\s*inline-flex/);
  assert.match(js, /SIDEBAR_COLLAPSED_KEY/);
  assert.match(js, /function\s+setSidebarCollapsed_\s*\(/);
  assert.match(js, /function\s+restoreSidebarState_\s*\(/);
  assert.match(js, /function\s+toggleDesktopSidebar_\s*\(/);
  assert.match(js, /localStorage\.setItem\(SIDEBAR_COLLAPSED_KEY/);
  assert.match(js, /function\s+isPhoneViewport_\s*\(/);
  assert.match(js, /max-width:\s*540px/);
  assert.doesNotMatch(js, /matchMedia\(['"]\(max-width:\s*860px\)['"]\)/);
  assert.match(js, /toggleDesktopSidebar_\(\)/);
});

test('desktop collapsed rail is 68px and expands main topbar and floating scrollbar into freed space', () => {
  assert.match(css, /--sidebar-collapsed-width:\s*68px/);
  assert.match(css, /#app\.sidebar-collapsed\s+\.sidebar\s*\{[\s\S]*width:\s*var\(--sidebar-collapsed-width\)/);
  assert.match(css, /#app\.sidebar-collapsed\s+\.main\s*\{[\s\S]*margin-left:\s*var\(--sidebar-collapsed-width\)/);
  assert.match(css, /#app\.sidebar-collapsed\s+\.topbar\s*\{[\s\S]*left:\s*var\(--sidebar-collapsed-width\)/);
  assert.match(css, /#app\.sidebar-collapsed\s+\.floating-hscroll\s*\{[\s\S]*left:\s*var\(--sidebar-collapsed-width\)/);
});

test('collapsed rail hides labels, centers icons, keeps active state and exposes native tooltips', () => {
  assert.match(css, /#app\.sidebar-collapsed[\s\S]*\.nav-item-text[\s\S]*display:\s*none/);
  assert.match(css, /#app\.sidebar-collapsed[\s\S]*\.shop-name[\s\S]*display:\s*none/);
  assert.match(css, /#app\.sidebar-collapsed[\s\S]*\.nav-item[\s\S]*justify-content:\s*center/);
  assert.match(css, /\.nav-item\.active/);
  assert.match(js, /el\.title\s*=\s*item\.label/);
  assert.match(js, /aria-label/);
});

test('collapse preference defaults tablet and narrow desktop to collapsed only when no saved preference exists', () => {
  assert.match(js, /localStorage\.getItem\(SIDEBAR_COLLAPSED_KEY\)/);
  assert.match(js, /innerWidth\s*<=\s*1180/);
  assert.match(js, /!isPhoneViewport_\(\)/);
});

test('phone bottom navigation and More sheet contracts remain unchanged', () => {
  for (const id of ['mobileBottomNav', 'mobileMoreSheet', 'mobileMoreList']) assert.match(index, new RegExp('id="' + id + '"'));
  assert.match(css, /@media\s*\(max-width:\s*540px\)[\s\S]*\.sidebar\s*\{\s*display:\s*none/);
  assert.match(js, /openMobileMore_\(\)/);
  assert.match(js, /buildMobileNav_\(items\)/);
});

console.log(`\n${pass}/${pass + fail} passed`);
if (fail) process.exit(1);
