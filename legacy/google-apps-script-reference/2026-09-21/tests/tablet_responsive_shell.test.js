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

const css = read('style.html');
const js = read('javascript.html');
const pos = read('pos.html');

function mediaBlock(source, query) {
  const start = source.indexOf('@media ' + query + ' {');
  assert.notStrictEqual(start, -1, 'missing media query ' + query);
  let i = source.indexOf('{', start);
  let depth = 0;
  for (; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error('unclosed media block ' + query);
}

test('tablet widths 541-1024 use the fixed desktop shell', () => {
  const desktop = mediaBlock(css, '(min-width: 541px)');
  assert.match(desktop, /\.sidebar\s*\{[\s\S]*position:\s*fixed/);
  assert.match(desktop, /\.main\s*\{[\s\S]*margin-left:\s*var\(--sidebar-width\)/);
  assert.match(desktop, /\.topbar\s*\{[\s\S]*left:\s*var\(--sidebar-width\)/);
  assert.match(css, /@media\s*\(min-width:\s*541px\)\s*and\s*\(max-width:\s*1024px\)\s*and\s*\(min-height:\s*541px\)/);
});

test('phone-only UI uses 540px width boundary instead of 640px', () => {
  assert.match(css, /@media\s*\(max-width:\s*540px\)/);
  assert.doesNotMatch(css, /@media\s*\(max-width:\s*640px\)/);
  assert.match(js, /max-width:\s*540px/);
  assert.doesNotMatch(js, /max-width:\s*640px/);
  assert.doesNotMatch(pos, /max-width:\s*640px/);
});

test('shared isPhoneViewport_ also recognizes short coarse landscape phones', () => {
  assert.match(js, /function\s+isPhoneViewport_\s*\(/);
  assert.match(js, /max-width:\s*540px/);
  assert.match(js, /orientation:\s*landscape/);
  assert.match(js, /max-height:\s*540px/);
  assert.match(js, /pointer:\s*coarse/);
  assert.match(pos, /isPhoneViewport_\(\)/);
});

test('phone CSS includes short coarse landscape and resets desktop shell offsets', () => {
  assert.match(css, /@media\s*\(max-width:\s*540px\)\s*,\s*\(orientation:\s*landscape\)\s*and\s*\(max-height:\s*540px\)\s*and\s*\(pointer:\s*coarse\)/);
  assert.match(css, /@media\s*\(max-width:\s*540px\)[\s\S]{0,1200}?:root\s*\{\s*--topbar-height:\s*56px;\s*\}[\s\S]{0,900}?\.main\s*\{[^}]*margin-left:\s*0/);
  assert.match(css, /@media\s*\(max-width:\s*540px\)[\s\S]{0,1200}?:root\s*\{\s*--topbar-height:\s*56px;\s*\}[\s\S]{0,1200}?\.topbar\s*\{[^}]*left:\s*0/);
});

test('tablet defaults to collapsed rail and phone uses mobile menu behavior', () => {
  assert.match(js, /restoreSidebarState_\(\)[\s\S]{0,160}?isPhoneViewport_\(\)/);
  assert.match(js, /saved\s*===\s*null[\s\S]{0,180}?innerWidth\s*<=\s*1180[\s\S]{0,180}?!isPhoneViewport_\(\)/);
  assert.match(js, /menuToggle[\s\S]{0,220}?isPhoneViewport_\(\)[\s\S]{0,120}?openMobileMore_\(\)/);
  assert.match(js, /menu\.hidden\s*=\s*false;[\s\S]{0,160}?isPhoneViewport_\(\)/);
});

console.log(`\n${pass}/${pass + fail} passed`);
if (fail) process.exit(1);
