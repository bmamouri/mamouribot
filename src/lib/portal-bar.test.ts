import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addPortals, hasPortal, portalCalls } from './portal-bar.js';

const P = 'دهه ۱۹۵۰ (میلادی)';

test('a plain wikilink to the decade is NOT a portal link', () => {
  const t = `متن [[${P}]] و بیشتر\n[[رده:${P}]]\n`;
  assert.equal(hasPortal(t, P), false);
  assert.match(addPortals(t, [P])!, /\{\{نوار درگاه\|دهه ۱۹۵۰ \(میلادی\)\}\}/);
});

test('the decade inside a category name is NOT a portal link', () => {
  assert.equal(hasPortal(`[[رده:فیلم‌های ${P}]]`, P), false);
});

test('an actual portal parameter IS detected', () => {
  assert.equal(hasPortal(`{{نوار درگاه|تاریخ|${P}}}`, P), true);
  assert.equal(hasPortal(`{{درگاه|${P}}}`, P), true);
  assert.equal(addPortals(`{{درگاه|${P}}}`, [P]), null);
});

test('an existing call is extended, not duplicated', () => {
  const out = addPortals('{{درگاه|تاریخ}}\n[[رده:الف]]\n', [P])!;
  assert.equal(out, `{{درگاه|تاریخ|${P}}}\n[[رده:الف]]\n`);
  assert.equal(portalCalls(out).length, 1);
});

test('جستارهای وابسته is preferred over the category position', () => {
  const t = `مقدمه\n\n== جستارهای وابسته ==\n* [[الف]]\n\n[[رده:ب]]\n`;
  const out = addPortals(t, [P])!;
  assert.match(out, /== جستارهای وابسته ==\n\{\{درگاه\|/);
  assert.ok(!out.includes('نوار درگاه'));
});

test('insertion is idempotent', () => {
  const t = `متن\n[[رده:الف]]\n`;
  const once = addPortals(t, [P])!;
  assert.equal(addPortals(once, [P]), null);
});

test('a second distinct portal is appended to the same call', () => {
  const out = addPortals(`{{نوار درگاه|${P}}}\n`, ['تاریخ'])!;
  assert.equal(out, `{{نوار درگاه|${P}|تاریخ}}\n`);
});

test('a portal already present under a redirect name counts as present', () => {
  // درگاه:هندوئیسم redirects to درگاه:هندوگرایی, so this page is already done.
  const text = '== همچنین ببینید ==\n{{درگاه|هندوئیسم}}\n[[رده:پوجا]]';
  assert.equal(hasPortal(text, 'هندوگرایی', ['هندوئیسم']), true);
  assert.equal(hasPortal(text, 'هندوگرایی'), false, 'without aliases it looks missing');
  assert.equal(addPortals(text, ['هندوگرایی'], { 'هندوگرایی': ['هندوئیسم'] }), null);
});

test('without alias handling the same portal would be added twice', () => {
  const text = '{{درگاه|هندوئیسم}}\n[[رده:پوجا]]';
  assert.match(addPortals(text, ['هندوگرایی'])!, /هندوئیسم\|هندوگرایی/);
});
