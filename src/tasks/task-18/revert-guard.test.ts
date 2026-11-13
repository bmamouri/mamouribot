import { test } from 'node:test';
import assert from 'node:assert/strict';
import { looksLikeRevertAction } from './revert-guard.js';

test('a tagged manual revert is recognised', () => {
  assert.ok(looksLikeRevertAction({ revid: 1, timestamp: '', tags: ['mw-manual-revert'] }));
});

test('a tagged undo is recognised', () => {
  assert.ok(looksLikeRevertAction({ revid: 1, timestamp: '', tags: ['mw-undo'] }));
});

test('a tagged rollback is recognised', () => {
  assert.ok(looksLikeRevertAction({ revid: 1, timestamp: '', tags: ['mw-rollback'] }));
});

test('an untagged edit with a واگردانی summary is recognised', () => {
  assert.ok(looksLikeRevertAction({ revid: 1, timestamp: '', comment: 'واگردانی ویرایش ۱۲۳۴۵۶' }));
});

test('an untagged edit with an rv summary is recognised', () => {
  assert.ok(looksLikeRevertAction({ revid: 1, timestamp: '', comment: 'rv vandalism' }));
});

test('mw-reverted ALONE (the tag on the reverted revision, not the reverting one) is not a trigger', () => {
  assert.equal(looksLikeRevertAction({ revid: 1, timestamp: '', tags: ['mw-reverted'] }), false);
});

test('an ordinary content edit is not mistaken for a revert', () => {
  assert.equal(
    looksLikeRevertAction({ revid: 1, timestamp: '', comment: 'افزودن بخش جدید', tags: [] }),
    false,
  );
});

test('the word «برگردان» inside unrelated prose still matches (summary-shape test, not NLP)', () => {
  // Documented, not a bug: the summary heuristic is intentionally coarse, and the
  // content-diff confirmation in portalWasRevertedHere() is what prevents a false
  // trigger from actually blocking an unrelated article.
  assert.ok(looksLikeRevertAction({ revid: 1, timestamp: '', comment: 'برگردان به نسخهٔ قدیمی‌تر مقاله' }));
});
