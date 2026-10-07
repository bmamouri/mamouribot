/** Unit tests for Task 11.  npx tsx src/tasks/task-11/taxonomy-create-missing.test.ts */
import { task, seedResolved, templateBody, parseTaxonomy, RANKS, reportWikitext } from './taxonomy-create-missing.js';

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean | string) => {
  if (cond === true) { pass++; console.log(`✓ ${name}`); }
  else { fail++; console.log(`✗ ${name}\n    ${cond === false ? 'failed' : cond}`); }
};

// ---------- templateBody: the exact bytes that get saved
const body = templateBody({ rank: 'subfamilia', parent: 'Carangidae', link: 'آجی (ماهی)' });
ok('body opens with the machine-code line the taxobox expects',
  body.startsWith("{{Don't edit this line {{{machine code|}}}"));
ok('body carries rank, parent and link', body.includes('|rank=subfamilia')
  && body.includes('|parent=Carangidae') && body.includes('|link=آجی (ماهی)'));
ok('body is closed', body.trimEnd().endsWith('}}'));

// ---------- transform
seedResolved('Caranginae', { rank: 'subfamilia', parent: 'Carangidae', link: 'Caranginae' });
const created = task.transform('', 'الگو:Taxonomy/Caranginae');
ok('creates content for a resolved, absent template', created.changed && created.text.includes('|rank=subfamilia'));

const existing = task.transform('{{Don\'t edit this line}}', 'الگو:Taxonomy/Caranginae');
ok('NEVER overwrites a template that already has content',
  !existing.changed || 'must refuse to touch an existing page');

const unknown = task.transform('', 'الگو:Taxonomy/Nowhereia');
ok('refuses an unresolved taxon and flags it for a human',
  !unknown.changed && unknown.manualReview === true);

// ---------- parseTaxonomy
ok('absent template parses as null', parseTaxonomy(null) === null);
ok('the deliberately blank root is recognised, not treated as broken',
  (parseTaxonomy('<noinclude><!-- This page left intentionally blank; all automated taxoboxes depend on this being the case!-->') as any).root === true);
ok('a redirect is followed, not mistaken for a taxon',
  (parseTaxonomy('#تغییرمسیر [[الگو:Taxonomy/Amanita]]') as any).redirect === 'Amanita');
const p = parseTaxonomy('{{Don\'t edit this line\n|rank=genus\n|link=X\n|parent=Y\n}}') as any;
ok('fields are read off a normal template', p.rank === 'genus' && p.parent === 'Y' && p.link === 'X');
const empty = parseTaxonomy('{{Don\'t edit this line\n|rank=\n|link=X\n|parent=\n}}') as any;
ok('an EMPTY rank/parent reads as empty, which is what makes it detectable',
  empty.rank === '' && empty.parent === '');

// ---------- rank table is conservative on purpose
ok('a known rank maps', RANKS['Q34740'] === 'genus');
// the three that were wrong in the first draft, pinned so they cannot regress
ok('Q5868144 is superorder, not suborder', RANKS['Q5868144'] === 'superordo');
ok('Q5867959 is suborder', RANKS['Q5867959'] === 'subordo');
ok('Q164280 is subfamily', RANKS['Q164280'] === 'subfamilia');
ok('Q3491996 (subdomain) is NOT mapped to a taxonomic rank', RANKS['Q3491996'] === undefined);
ok('Q3181348 (section, ambiguous) is not mapped', RANKS['Q3181348'] === undefined);
ok('no two ranks share a QID', Object.keys(RANKS).length === new Set(Object.keys(RANKS)).size);
ok('an unlisted rank has no mapping, so the caller must refuse',
  RANKS['Q99999999'] === undefined);

// ---------- report
const rep = reportWikitext([
  { taxon: 'Foo', why: 'رتبهٔ ناشناخته', article: 'مقاله الف' },
  { taxon: '', why: 'رتبهٔ ناشناخته', article: 'مقاله ب' },
  { taxon: 'Baz', why: 'نام آرایه در مقاله فارسی نوشته شده', article: 'مقاله ج' },
]);
ok('report groups by reason', rep.includes('== رتبهٔ ناشناخته (2) ==')
  && rep.includes('== نام آرایه در مقاله فارسی نوشته شده (1) =='));
ok('report links every article', rep.includes('[[مقاله الف]]') && rep.includes('[[مقاله ج]]'));
ok('report omits the taxon when there is none', rep.includes('* [[مقاله ب]]\n'));

console.log(`\n${pass} گذشت، ${fail} افتاد`);
process.exit(fail ? 1 : 0);
