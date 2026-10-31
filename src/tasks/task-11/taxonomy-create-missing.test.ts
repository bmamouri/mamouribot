/** Unit tests for Task 11.  npx tsx src/tasks/task-11/taxonomy-create-missing.test.ts */
import { task, seedResolved, seedRedirect, templateBody, redirectBody, parseTaxonomy, splitLink, sameAsBody, speciesBoxGenus, RANKS, reportWikitext } from './taxonomy-create-missing.js';

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

// ---------- the widened scope (۳۱ اکتبر ۲۰۲۶)
ok('extinct=yes is carried over when the source says so',
  templateBody({ rank: 'genus', parent: 'X', link: 'Y', extinct: true }).includes('|extinct=yes'));
ok('extinct is omitted otherwise', !templateBody({ rank: 'genus', parent: 'X', link: 'Y' }).includes('extinct'));
ok('a Persian-name redirect points at the Latin taxonomy template',
  redirectBody('Poxviridae') === '#تغییرمسیر [[الگو:Taxonomy/Poxviridae]]\n');
seedRedirect('پاکس‌ویریده', 'Poxviridae');
const red = task.transform('', 'الگو:Taxonomy/پاکس‌ویریده');
ok('transform writes the redirect for a planned Persian name', red.changed && red.text.startsWith('#تغییرمسیر'));
ok('a redirect gets its own edit summary', /Poxviridae/.test(task.perPageSummary!('الگو:Taxonomy/پاکس‌ویریده') ?? ''));
ok('a creation keeps the task summary', task.perPageSummary!('الگو:Taxonomy/Caranginae') === undefined);
const sl = splitLink('Sepsis (fly)|Sepsis', 'Sepsis (fly)');
ok('en «target|display» link splits', sl.target === 'Sepsis (fly)' && sl.display === 'Sepsis');
ok('a bare disambiguated link drops the qualifier for display',
  splitLink('', 'Cornu (gastropod)').display === 'Cornu');
const en = parseTaxonomy("{{Don't edit this line {{{machine code|}}}\n|rank=genus\n|link=Sepsis (fly)|Sepsis\n|parent=Sepsinae\n|refs= <!--Shown on this page only; don't include <ref> tags -->\n}}") as any;
ok('an en template with a piped link and a commented refs line parses',
  en.rank === 'genus' && en.parent === 'Sepsinae' && en.link === 'Sepsis (fly)|Sepsis');
const ext = parseTaxonomy("{{Don't edit this line {{{machine code|}}}\n|rank=genus\n|link=X\n|parent=Y\n|extinct= <!--leave blank -->\n}}") as any;
ok('a commented-out extinct reads as empty', ext.extinct === '');

const commented = parseTaxonomy("<!---\n{{Don't edit this line {{{machine code|}}}\n|rank=familia\n|link=X\n|parent=Virus\n}}\n--->\n[[رده:الگو:آرایه‌شناسی غیرضروری]]") as any;
ok('a template whose whole body is commented out has no rank or parent',
  commented.rank === '' && commented.parent === '');

// ---------- species boxes and same-as variants
ok('a species box looks up the first word of taxon=',
  speciesBoxGenus('{{جعبه اطلاعات گونه\n| taxon = Cornu aspersum\n}}') === 'Cornu');
ok('genus= wins over taxon=', speciesBoxGenus('{{Speciesbox\n|genus=Sepsis (fly)\n|species=cynipsea\n}}') === 'Sepsis (fly)');
ok('an explicit parent= switches the genus check off',
  speciesBoxGenus('{{جعبه اطلاعات گونه\n|parent=Prunus sect. Microcerasus\n|taxon=Prunus prostrata}}') === null);
ok('a species box with neither genus nor taxon takes its genus from the title',
  speciesBoxGenus('{{جعبه اطلاعات گونه\n|species=olivaceus}}', 'سهره پری‌شاهرخی') === 'سهره');
ok('an automatic taxobox has no genus to check', speciesBoxGenus('{{Automatic taxobox\n| taxon = Canina\n}}') === null);
const sa = parseTaxonomy("<noinclude>{{pp-template}}</noinclude>{{Don't edit this line {{{machine code|}}}\n|same as=Eukaryota\n|always_display=yes\n}}") as any;
ok('a same-as variant is recognised', sa.sameAs === 'Eukaryota' && sa.rank === '');
ok('a same-as body drops en-only noinclude banners',
  !sameAsBody("<noinclude>{{pp-template}}</noinclude>{{Don't edit this line}}").includes('pp-template'));

const oneLine = parseTaxonomy("{{Don't edit this line {{{machine code|}}}\n|rank=virus_group\n|link=گروه IV بالتیمور|parent=Life\n}}") as any;
ok('two parameters on one line are both read', oneLine.parent === 'Life' && oneLine.link === 'گروه IV بالتیمور');
const nested = parseTaxonomy("{{Don't edit this line {{{machine code|}}}\n|rank=familia\n|link=X\n|parent=Y\n|refs={{cite web|url=a|title=b}}\n}}") as any;
ok('a pipe inside refs={{…}} does not split the call', nested.parent === 'Y' && nested.rank === 'familia');

const tail = parseTaxonomy("{{Don't edit this line {{{machine code|}}}\n|rank=cladus\n|link=X\n|parent=Neodiapsida\n}}<noinclude>{{pp-semi-indef}}</noinclude>\n[[رده:الگو]]") as any;
ok('text after the closing braces does not leak into the last parameter', tail.parent === 'Neodiapsida');
const disp = parseTaxonomy("<noinclude>{{pp-template}}</noinclude>{{Don't edit this line {{{machine code|}}}\n|same as=Eukaryota\n|always_display=yes\n}}") as any;
ok('a leading noinclude does not hide the call', disp.sameAs === 'Eukaryota');

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
