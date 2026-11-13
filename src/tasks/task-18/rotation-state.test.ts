import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickNext, sliceFromCursor } from './rotation-state.js';

test('pickNext walks the list in order and wraps', () => {
  const portals = ['الف', 'ب', 'پ', 'ت', 'ث'];
  const r1 = pickNext(portals, 0, 2);
  assert.deepEqual(r1.chosen, ['الف', 'ب']);
  assert.equal(r1.nextPointer, 2);

  const r2 = pickNext(portals, r1.nextPointer, 2);
  assert.deepEqual(r2.chosen, ['پ', 'ت']);
  assert.equal(r2.nextPointer, 4);

  const r3 = pickNext(portals, r2.nextPointer, 2);
  assert.deepEqual(r3.chosen, ['ث', 'الف']); // wraps
  assert.equal(r3.nextPointer, 1);
});

test('pickNext never chooses more than the list has', () => {
  const r = pickNext(['الف', 'ب'], 0, 10);
  assert.equal(r.chosen.length, 2);
});

test('pickNext on an empty list is a no-op', () => {
  const r = pickNext([], 5, 3);
  assert.deepEqual(r.chosen, []);
  assert.equal(r.nextPointer, 0);
});

test('sliceFromCursor advances and wraps the SAME way pickNext does', () => {
  const items = [1, 2, 3, 4, 5];
  const a = sliceFromCursor(items, 0, 3);
  assert.deepEqual(a.slice, [1, 2, 3]);
  assert.equal(a.nextCursor, 3);

  const b = sliceFromCursor(items, a.nextCursor, 3);
  assert.deepEqual(b.slice, [4, 5, 1]); // wraps
  assert.equal(b.nextCursor, 1);
});

test('sliceFromCursor on an empty list is a no-op', () => {
  const r = sliceFromCursor([], 4, 10);
  assert.deepEqual(r.slice, []);
  assert.equal(r.nextCursor, 0);
});
