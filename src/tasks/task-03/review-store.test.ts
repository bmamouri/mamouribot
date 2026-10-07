/**
 * Unit tests for the review worklist. No network, no filesystem.
 *
 *   npx tsx src/tasks/task-03/review-store.test.ts
 *
 * The behaviour under test is the one whose absence lost the whole trial's worklist:
 * the page is rebuilt from the union of every run, so a later run with one finding must
 * not erase the fifty an earlier one recorded.
 */
import { loadStoreChecked, mergeReview, parseStore, type ReviewRow } from './review-store.js';
import { buildReview } from './normalize-cite-params.js';

let pass = 0;
const fails: string[] = [];
function ok(what: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ✓ ${what}`); }
  else { fails.push(`${what}${detail ? ` — ${detail}` : ''}`); console.log(`  ✗ ${what}\n      ${detail}`); }
}

const conflict = (field: string) => [{ field, values: [{ key: 'a', value: '۱' }, { key: 'b', value: '۲' }] }];
const row = (title: string, field = 'تاریخ بایگانی'): ReviewRow =>
  ({ title, conflicts: conflict(field), seen: 1 });

console.log('== the union is kept across runs ==');
{
  const stored = [row('الف'), row('ب')];
  const merged = mergeReview(stored, [{ title: 'ج', conflicts: conflict('پیوند بایگانی') }]);
  ok('the earlier findings survive', merged.map(r => r.title).includes('الف') && merged.map(r => r.title).includes('ب'),
     JSON.stringify(merged.map(r => r.title)));
  ok('the new finding is added', merged.some(r => r.title === 'ج'));
  ok('three rows, not one', merged.length === 3, String(merged.length));
}

console.log('\n== a title examined and found clean leaves the list ==');
{
  const merged = mergeReview([row('الف'), row('ب')], [{ title: 'الف', conflicts: [] }]);
  ok('the fixed article is dropped', !merged.some(r => r.title === 'الف'), JSON.stringify(merged));
  ok('the untouched one stays', merged.some(r => r.title === 'ب'));
}

console.log('\n== a re-read replaces rather than duplicates ==');
{
  const merged = mergeReview([row('الف', 'تاریخ بایگانی')],
    [{ title: 'الف', conflicts: conflict('چگونگی پیوند') }]);
  ok('one row for the title', merged.filter(r => r.title === 'الف').length === 1, String(merged.length));
  ok('the newer reading wins', merged[0].conflicts[0].field === 'چگونگی پیوند', merged[0].conflicts[0].field);
}

console.log('\n== a title NOT examined is not touched ==');
ok('absent from fresh means left alone',
   mergeReview([row('الف')], []).length === 1);

console.log('\n== url values are not turned into links ==');
{
  // The spam blacklist refused to save this page because the archive-url values it
  // quotes include archive.today, which fa.wikipedia blacklists. A report page that
  // quotes urls must not create links out of them.
  const text = buildReview([{ title: 'الف', conflicts: [{ field: 'archive-url', canonical: 'پیوند بایگانی',
    values: [{ key: 'پیوند بایگانی', value: 'https://archive.today/2016/http://x.com/a' },
             { key: 'archive-url', value: 'https://web.archive.org/web/1/http://x.com/a' }] }] }]);
  ok('urls are wrapped so no external link is created', text.includes('<nowiki>https://archive.today'), text);
  ok('the value is still readable in full', text.includes('archive.today/2016/http://x.com/a'));
  ok('a plain value is not needlessly wrapped',
     !buildReview([{ title: 'ب', conflicts: conflict('x') }]).includes('<nowiki>'));
}

console.log('\n== an ABSENT store is distinguishable from an empty one ==');
{
  // The ambiguity that blanked the live report page: [] means both "nothing pending"
  // and "this machine has no worklist", and publishing is only safe in the first case.
  const { rows, existed } = loadStoreChecked('/tmp/definitely-not-a-store-' + Date.now() + '.json');
  ok('a missing file reports existed=false', existed === false);
  ok('and no rows', rows.length === 0);
}

console.log('\n== a damaged store does not take a run down ==');
ok('malformed json shape yields an empty list', parseStore('nonsense').length === 0);
ok('a missing rows key yields an empty list', parseStore({ v: 1 }).length === 0);
ok('rows without a title are discarded', parseStore({ rows: [{ conflicts: [] }, row('الف')] }).length === 1);
ok('the legacy bare-array shape is read', parseStore([row('الف')]).length === 1);

console.log('\n== the published page reflects the union ==');
{
  const text = buildReview(mergeReview([row('الف'), row('ب')], [{ title: 'ج', conflicts: conflict('x') }]));
  ok('every article appears', ['الف', 'ب', 'ج'].every(t => text.includes(`[[${t}]]`)), text);
  ok('the counts are in Persian digits', text.includes('شمار مقاله‌ها: ۳؛ شمار فیلدها: ۳'),
     text.split('\n').find(l => l.startsWith('شمار')) ?? '');
  ok('it does not claim to be only this run', !text.includes('در این اجرا'), text);
}
console.log('\n== the page is grouped per field, so one family cannot bury another ==');
{
  // The measured reason this exists: over 1,000 category members, access-date accounts
  // for 867 clashes and the archive families for 136. A flat list is ~87% access-date
  // and the archive worklist falls off the end.
  const many = Array.from({ length: 300 }, (_, i) => ({
    title: `مقالهٔ ${i}`,
    conflicts: [{ field: 'access-date', canonical: 'تاریخ بازبینی',
                  values: [{ key: 'بازبینی', value: 'الف' }, { key: 'تاریخ بازبینی', value: 'ب' }] }],
  }));
  const withArchive = [...many, { title: 'مقالهٔ بایگانی', conflicts: conflict('archive-url') }];
  const text = buildReview(withArchive);
  ok('the archive row survives 300 access-date rows', text.includes('[[مقالهٔ بایگانی]]'), text.slice(0, 300));
  ok('access-date is capped', !text.includes('[[مقالهٔ 299]]'));
  ok('and the page says how many it left out', /مورد دیگر از این فیلد/.test(text));
  // the helper builds conflicts without `canonical`, so that family falls back to its id
  ok('each family gets its own heading',
     text.includes('=== تاریخ بازبینی (') && text.includes('=== archive-url ('), text.slice(0, 500));
  ok('the fixable family is ordered before the judgement call',
     text.indexOf('=== archive-url') < text.indexOf('=== تاریخ بازبینی'));
  ok('the access-date note explains the two calendars', text.includes('هجری خورشیدی'));
  ok('headings are level three, not level two', !/^== [^=]/m.test(text));
  ok('the totals count fields, not just articles', text.includes('شمار فیلدها: ۳۰۱'),
     text.split('\n').find(l => l.startsWith('شمار')) ?? '');
}

{
  const empty = buildReview([]);
  ok('an empty worklist still produces a valid page', empty.includes('[[رده:گزارش‌های دیتابیس ویکی‌پدیا]]'));
  ok('and says so plainly', empty.includes('موردی برای بازبینی ثبت نشده'), empty);
}

console.log(`\n${pass} گذشت، ${fails.length} افتاد`);
if (fails.length) { console.error('failing:\n  - ' + fails.join('\n  - ')); process.exit(1); }
