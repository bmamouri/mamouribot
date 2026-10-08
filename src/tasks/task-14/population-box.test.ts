/**
 * وظیفهٔ ۱۴ — offline tests.
 *
 *   npx tsx src/tasks/task-14/population-box.test.ts
 *
 * Every fixture below is shaped after a real article from the 400-article measurement
 * in scripts/population/1390-CENSUS-GAP.md §2 and §5, including the two heading
 * variants that a naive `== جمعیت ==` regex misses and would give two population
 * sections.
 */
import {
  TEMPLATE, classify, findTemplate, latinDigits, parseHistorical, reportWikitext,
} from './population-box.js';

let pass = 0;
const fails: string[] = [];
function ok(what: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ✓ ${what}`); }
  else { fails.push(`${what}${detail ? ` — ${detail}` : ''}`); console.log(`  ✗ ${what}\n      ${detail}`); }
}
const eq = (what: string, a: unknown, b: unknown) =>
  ok(what, JSON.stringify(a) === JSON.stringify(b), `${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);

const BODY = 'بنه رازی روستایی از توابع بخش هنزا است.\n\n';
const TAIL = '\n== منابع ==\n{{پانویس}}\n\n[[رده:روستاهای شهرستان رابر]]\n';

console.log('== digits ==');
eq('Persian digits normalise', latinDigits('۱۳۹۵'), '1395');
eq('thousands separators drop', latinDigits('۱٬۵۷۱'), '1571');
eq('Arabic-Indic digits normalise', latinDigits('١٣٩٠'), '1390');

console.log('\n== finding a brace-balanced box ==');
{
  const t = `${BODY}== جمعیت ==\n{{جمعیت تاریخی|۱۳۸۵|۸۲۴|align=center}}\n${TAIL}`;
  eq('plain box', findTemplate(t, 'جمعیت تاریخی')!.body,
     '{{جمعیت تاریخی|۱۳۸۵|۸۲۴|align=center}}');
  // The failure this guards: a regex capture stops at the FIRST `}}`, which on a
  // nested template closes the inner one and leaves a stray `}}` in the article.
  const n = `${BODY}{{جمعیت تاریخی|۱۳۸۵|{{formatnum:۸۲۴}}|align=center}}${TAIL}`;
  eq('nested template does not truncate the match', findTemplate(n, 'جمعیت تاریخی')!.body,
     '{{جمعیت تاریخی|۱۳۸۵|{{formatnum:۸۲۴}}|align=center}}');
  ok('an unbalanced box is NOT matched, so the article is never cut',
     findTemplate('{{جمعیت تاریخی|۱۳۸۵|۸۲۴', 'جمعیت تاریخی') === null);
  ok('absent box reports absent', findTemplate(BODY + TAIL, 'جمعیت تاریخی') === null);
}

console.log('\n== reading the pairs out of a hand-written box ==');
{
  // The real چاه خاصه box, from the gap memo.
  eq('three censuses', parseHistorical('{{جمعیت تاریخی|۱۳۸۵|۸۲۴|۱۳۹۰|۸۰۶|۱۳۹۵|۸۷۵|align=center}}'),
     [{ year: 1385, value: 824 }, { year: 1390, value: 806 }, { year: 1395, value: 875 }]);
  eq('named args are not read as a pair', parseHistorical('{{جمعیت تاریخی|align=center|۱۳۸۵|۴۱}}'),
     [{ year: 1385, value: 41 }]);
  const odd = parseHistorical('{{جمعیت تاریخی|۱۳۸۵|حدود هزار نفر}}');
  ok('an unparseable value becomes NaN rather than being silently dropped',
     odd.length === 1 && Number.isNaN(odd[0].value));
}

console.log('\n== classification ==');
{
  eq('exact heading → insert',
     classify(`${BODY}== جمعیت ==\nجمعیت این روستا ۵۹ نفر است.\n${TAIL}`).kind, 'insert');
  eq('the template lands directly under the heading',
     classify(`${BODY}== جمعیت ==\nمتن.\n${TAIL}`).text,
     `${BODY}== جمعیت ==\n${TEMPLATE}\nمتن.\n${TAIL}`);

  // آق‌چه‌کند really is written with a shadda. Visually near-identical; a plain
  // `جمعیت` regex misses it and the article ends up with TWO population sections.
  eq('heading with a shadda (جمعیّت) is the same heading',
     classify(`${BODY}== جمعیّت ==\nمتن.\n${TAIL}`).kind, 'insert');

  eq('already done → has-template',
     classify(`${BODY}== جمعیت ==\n{{جمعیت ایران}}\n${TAIL}`).kind, 'has-template');
  eq('an existing box plus the template is still has-template, never a re-replace',
     classify(`${BODY}{{جمعیت ایران}}\n{{جمعیت تاریخی|۱۳۸۵|۴۱}}${TAIL}`).kind, 'has-template');

  const r = classify(`${BODY}== جمعیت ==\n{{جمعیت تاریخی|۱۳۸۵|۸۲۴|۱۳۹۰|۸۰۶|align=center}}\n${TAIL}`);
  eq('hand-written box → replace', r.kind, 'replace');
  eq('the old pairs are carried out for the deletion proof', r.old,
     [{ year: 1385, value: 824 }, { year: 1390, value: 806 }]);
  eq('the box is swapped in place, nothing else moves', r.text,
     `${BODY}== جمعیت ==\n${TEMPLATE}\n${TAIL}`);

  eq('no population heading at all → create',
     classify(`${BODY}== تاریخ ==\nمتن.\n${TAIL}`).kind, 'create');
  eq('the new section goes before the first tail section',
     classify(`${BODY}${TAIL}`).text,
     `${BODY}\n== جمعیت ==\n${TEMPLATE}\n\n== منابع ==\n{{پانویس}}\n\n[[رده:روستاهای شهرستان رابر]]\n`);

  // §5 of the gap memo: these are population sections under another name. Creating
  // a second one is the damage, and it raises no error.
  for (const h of ['== جمعیت‌شناسی ==', '== [[جمعیت]] ==', '=== جمعیت ===']) {
    eq(`«${h}» is reported, not created over`,
       classify(`${BODY}${h}\nمتن.\n${TAIL}`).kind, 'ambiguous-heading');
  }
  eq('nowhere safe to create → no-place',
     classify('متن کوتاه بدون هیچ بخشی.\n').kind, 'no-place');
}

console.log('\n== the refusal report ==');
{
  const s = reportWikitext([
    { title: 'الف', why: 'علت یک' }, { title: 'ب', why: 'علت یک' }, { title: 'پ', why: 'علت دو' },
  ]);
  ok('signed with the five-tilde timestamp', s.includes('~~~~~'));
  ok('counts are in Persian digits', s.includes('(۲)') && s.includes('۳ مورد'));
  ok('the bigger reason comes first', s.indexOf('علت یک') < s.indexOf('علت دو'));
  // A bare {{جمعیت ایران}} in the report would transclude the box into the report page.
  ok('the template name is nowiki-wrapped so the report does not transclude it',
     s.includes('<nowiki>{{جمعیت ایران}}</nowiki>'));
}

console.log(`\n${pass} گذشت، ${fails.length} افتاد`);
if (fails.length) { console.error('failing:\n  - ' + fails.join('\n  - ')); process.exit(1); }
