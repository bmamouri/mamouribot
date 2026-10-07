/**
 * Unit tests for the de-stub review report. No network.
 *
 *   npx tsx src/tasks/task-10/destub-report.test.ts
 */
import { buildReport, parseAllowlist } from './destub-report.js';
import type { Verdict } from './destub-classify.js';

let fail = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a === b) { console.log(`  ✓ ${label}`); return; }
  console.log(`  ✗ ${label}\n      انتظار: ${b}\n      حاصل  : ${a}`);
  fail++;
}

const v = (title: string, words: number, tier: Verdict['tier'], flags: string[] = []): Verdict =>
  ({ title, bytes: 12000, words, proseWords: words, listWords: 0, latinShare: 0,
     refs: 3, tier, flags, notes: [] });

console.log('parseAllowlist');
eq([...parseAllowlist('* [[دلتا ۲]]\n* [[پری دریایی]]')], ['دلتا ۲', 'پری دریایی'],
  'reads bulleted wikilinks');
eq([...parseAllowlist('# [[دلتا ۲]]')], ['دلتا ۲'], 'numbered lists too');
eq([...parseAllowlist('* [[دلتا_۲|دلتا ۲]]')], ['دلتا ۲'],
  'underscores normalised and the label dropped');
// The page needs room for an explanation without every sentence becoming an entry.
eq([...parseAllowlist('این صفحه فهرست مقاله‌هایی است که [[پری دریایی]] نیستند.\n* [[دلتا ۲]]')],
  ['دلتا ۲'], 'prose and inline links are ignored — only list entries count');
eq([...parseAllowlist('')], [], 'an empty page is an empty allowlist');

console.log('buildReport');
const verdicts = [
  v('الف', 900, 'auto-remove'),
  v('ب', 300, 'needs-human', ['مقالهٔ فهرست']),
  v('پ', 380, 'needs-human', ['بدون منبع']),
  v('ت', 40, 'leave-alone'),
];
const rep = buildReport(verdicts, new Set());
eq(rep.includes('[[ب]]'), true, 'a needs-human article is listed');
eq(rep.includes('[[پ]]'), true, 'and so is the other one');
eq(rep.includes('[[الف]]'), false, 'an auto-remove article is NOT listed');
eq(rep.includes('[[ت]]'), false, 'a still-a-stub article is NOT listed');
eq(rep.includes('مقالهٔ فهرست'), true, 'the reason is shown');
eq(rep.indexOf('[[پ]]') < rep.indexOf('[[ب]]'), true, 'ranked by word count, closest to the line first');
eq(rep.includes('[[رده:گزارش‌های دیتابیس ویکی‌پدیا]]'), true, 'categorised as a database report');
// Persian digits throughout: a report page full of Latin numerals reads as
// machine output on fa.wiki.
eq(/\|\s*۱\s*\|\|/.test(rep), true, 'row numbers use Persian digits');
eq(/\d/.test(rep.split('[[رده:')[0].replace(/https?:\S+/g, '')), false,
  'no Latin digits leak into the body');

console.log('buildReport — allowlist');
const filtered = buildReport(verdicts, new Set(['ب']));
eq(filtered.includes('[[ب]]'), false, 'an allowlisted article disappears from the report');
eq(filtered.includes('[[پ]]'), true, 'the rest stay');

console.log('buildReport — empty');
eq(buildReport([v('الف', 900, 'auto-remove')], new Set()).includes('موردی برای بازبینی یافت نشد'),
  true, 'says so plainly when there is nothing to review');

console.log(fail === 0 ? '\nهمهٔ آزمون‌ها موفق.' : `\n${fail} آزمون ناموفق.`);
process.exit(fail === 0 ? 0 : 1);
