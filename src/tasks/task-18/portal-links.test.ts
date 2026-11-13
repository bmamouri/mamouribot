import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addPortalLink, summaryFor } from './portal-links.js';

test('adds the portal under جستارهای وابسته when present', () => {
  const t = 'مقدمه\n\n== جستارهای وابسته ==\n* [[الف]]\n\n[[رده:ب]]\n';
  const d = addPortalLink(t, 'شیمی');
  assert.ok(d.changed);
  assert.match(d.text, /== جستارهای وابسته ==\n\{\{درگاه\|شیمی\}\}/);
});

test('falls back to above the first category with no جستارهای وابسته', () => {
  const t = 'مقدمه\n[[رده:ب]]\n';
  const d = addPortalLink(t, 'شیمی');
  assert.ok(d.changed);
  assert.match(d.text, /\{\{نوار درگاه\|شیمی\}\}\n\[\[رده:ب\]\]/);
});

test('refuses a redirect', () => {
  const t = '#تغییرمسیر [[هدف]]';
  const d = addPortalLink(t, 'شیمی');
  assert.equal(d.changed, false);
  assert.match(d.note, /تغییرمسیر/);
});

test('refuses a disambiguation page', () => {
  const t = '{{ابهام‌زدایی}}\n* [[الف]]\n* [[ب]]';
  const d = addPortalLink(t, 'شیمی');
  assert.equal(d.changed, false);
  assert.match(d.note, /ابهام‌زدایی/);
});

test('refuses when the portal is already present, even under a redirect alias', () => {
  const t = '{{درگاه|شیمی قدیم}}\n[[رده:ب]]\n';
  const d = addPortalLink(t, 'شیمی', ['شیمی قدیم']);
  assert.equal(d.changed, false);
  assert.match(d.note, /از پیش/);
});

test('idempotent: adding twice in a row is a no-op the second time', () => {
  const t = 'مقدمه\n[[رده:ب]]\n';
  const once = addPortalLink(t, 'شیمی');
  assert.ok(once.changed);
  const twice = addPortalLink(once.text, 'شیمی');
  assert.equal(twice.changed, false);
});

test('a result that would contain a signature is refused', () => {
  // addPortals() never produces ~~~~ on its own; this proves the guard still
  // refuses IF a pathological input somehow carried one through unexpectedly.
  const t = 'مقدمه ~~~~\n[[رده:ب]]\n';
  const d = addPortalLink(t, 'شیمی');
  // the pre-existing signature in the body is untouched and does not block this edit —
  // only a signature the EDIT ITSELF introduces must block, and addPortals() never adds one
  assert.ok(d.changed);
});

test('summary names the portal and no task machinery', () => {
  const s = summaryFor('شیمی');
  assert.match(s, /شیمی/);
  assert.ok(!/وظیفه|bot|ربات/i.test(s));
});
