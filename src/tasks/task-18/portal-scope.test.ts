import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isContainerCategory, nameMentionsPortal } from './portal-scope.js';

test('residence-by-portal category is excluded (the آرتساخ false positive from the live trial)', () => {
  // «رده:اهالی جمهوری آرتساخ» DOES mention «آرتساخ», so nameMentionsPortal alone would
  // let it through — isContainerCategory is what actually excludes it.
  assert.ok(isContainerCategory('اهالی جمهوری آرتساخ'));
  assert.ok(nameMentionsPortal('اهالی جمهوری آرتساخ', 'آرتساخ'));
});

test('a maintenance/stub subcategory is excluded regardless of portal name', () => {
  assert.ok(isContainerCategory('مقاله‌های خرد شیمی'));
  assert.ok(isContainerCategory('مقاله‌های درجه خرد ایران'));
});

test('birth/death-year containers stay excluded', () => {
  assert.ok(isContainerCategory('زادگان ۱۹۵۰'));
  assert.ok(isContainerCategory('درگذشتگان ۲۰۲۰'));
});

test('a subcategory unrelated BY NAME to the portal is excluded even with no container pattern '
  + '(the تاریخ→کاتولیک/مسیحیت false positive from the live trial)', () => {
  assert.equal(isContainerCategory('کاتولیک'), false); // no container pattern — this filter alone misses it
  assert.equal(nameMentionsPortal('کاتولیک', 'تاریخ'), false); // the second filter is what catches it
  assert.equal(nameMentionsPortal('مسیحیت', 'تاریخ'), false);
});

test('a genuine topical subcategory passes both filters', () => {
  assert.equal(isContainerCategory('شیمی آلی'), false);
  assert.ok(nameMentionsPortal('شیمی آلی', 'شیمی'));
});

test('a geographic-by-portal container is excluded', () => {
  assert.ok(isContainerCategory('فوتبال بر پایه کشور'));
  assert.ok(isContainerCategory('ایران بر پایه استان'));
});
