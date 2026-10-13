// Not a unit test; run-tests.mjs excludes *.replay.ts (kept as evidence this task was
// verified against the real population). Needs /tmp/tf_research/pages.json from the
// research phase; see docs/task-16-text-fragment.md.
import { stripTextFragments } from './strip-text-fragment.js';
import { readFileSync } from 'fs';

const pages: Record<string, string> = JSON.parse(readFileSync('/tmp/tf_research/pages.json', 'utf8'));
let changedCount = 0, totalRemaining = 0, badBraces = 0;
for (const [title, text] of Object.entries(pages)) {
  const r = stripTextFragments(text);
  if (r.changed) changedCount++;
  if (/:(?:~|%7[eE]):text=/i.test(r.text)) {
    totalRemaining++;
    console.log('LEFTOVER DIRECTIVE:', title);
  }
  const beforeOpen = (text.match(/\{\{/g) ?? []).length;
  const beforeClose = (text.match(/\}\}/g) ?? []).length;
  const afterOpen = (r.text.match(/\{\{/g) ?? []).length;
  const afterClose = (r.text.match(/\}\}/g) ?? []).length;
  if (beforeOpen !== afterOpen || beforeClose !== afterClose) {
    badBraces++;
    console.log('BRACE COUNT CHANGED:', title, beforeOpen, afterOpen, beforeClose, afterClose);
  }
}
console.log('pages changed:', changedCount, '/', Object.keys(pages).length);
console.log('leftover directives:', totalRemaining);
console.log('brace-count mismatches:', badBraces);
