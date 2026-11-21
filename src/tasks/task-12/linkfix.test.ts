/**
 * Offline tests for وظیفهٔ ۱۲. No network: the resolver's lookup is a Map.
 *
 *   npx tsx src/tasks/task-12/linkfix.test.ts
 *
 * Every test is a defect that actually shipped to a live page during the LA-area sweep
 * (۴ اکتبر ۲۰۲۶) or a boundary the bot must not cross. Ported one-for-one from the Python
 * `scripts/linkfix/tests/test_linkfix.py`, with the ported-over cases marked so a
 * reviewer can check nothing was lost in translation, plus the cases the port added.
 */
import { PERSIAN, scan, type Finding } from './detect.js';
import {
  EN, FA, PLAIN, REVIEW, Resolver, loadNames, isNameInversion, sameSubjectRedirect,
  type LookupInfo, type Names, type Resolution,
} from './resolve.js';
import { applyResolutions, gateDiff, inEnglishProse, numericDisplay } from './rewrite.js';
import { contentRedLinks, repairPage, __setResolutionsForTest } from './linkfix.js';

let pass = 0;
const fails: string[] = [];
function ok(what: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ✓ ${what}`); }
  else { fails.push(`${what}${detail ? ` — ${detail}` : ''}`); console.log(`  ✗ ${what}\n      ${detail}`); }
}
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const NAMES: Names = {
  fa: { 'Los Angeles Times': 'لس آنجلس تایمز' },
  en: { 'Antelope Valley': 'دره آنتلوپ', 'Area code 562': '۵۶۲', 'Area code 323': '۳۲۳',
        'Charter city': 'شهر منشوری', 'Pro Tempore': 'شهردار موقت' },
  plain: { 'Mayor:': 'شهردار:', 'John Fasana': 'جان فاسانا' },
  remap: { 'Area code ۳۲۳': 'Area code 323' },
  by_old_display: { 'Charter city||General Law City': 'شهر قانون عمومی' },
};

const LOOKUP: Record<string, LookupInfo> = {
  'Antelope Valley':      { enExists: true,  faTitle: null, viaRedirect: false },
  'Los Angeles Times':    { enExists: true,  faTitle: 'لس آنجلس تایمز', viaRedirect: false },
  'Area code 562':        { enExists: true,  faTitle: null, viaRedirect: false },
  'Area code 323':        { enExists: true,  faTitle: null, viaRedirect: false },
  'Charter city':         { enExists: true,  faTitle: null, viaRedirect: false },
  'Pro Tempore':          { enExists: true,  faTitle: null, viaRedirect: false },
  'John Fasana':          { enExists: false, faTitle: null, viaRedirect: false },
  'Acquanetta Warren':    { enExists: true,  faTitle: 'فونتانا (کالیفرنیا)', viaRedirect: true },
  'Julia Brownley':       { enExists: true,  faTitle: 'جولیا برونلی', viaRedirect: false },
  'Monte Nido, California': { enExists: true, faTitle: null, viaRedirect: false },
  'Mayor:':               { enExists: false, faTitle: null, viaRedirect: false },
  'Prometheus Books':     { enExists: true,  faTitle: 'کتاب‌های پرومتئوس', viaRedirect: false },
  'George O. Abell':      { enExists: true,  faTitle: 'جرج آبل', viaRedirect: false },
  // Extension ۲ fixtures, each the real rcat set measured on en ۱۲ نوامبر ۲۰۲۶.
  'Gardner, Martin':      { enExists: true, faTitle: 'مارتین گاردنر', viaRedirect: true,
    redirectFrom: 'Gardner, Martin', redirectTo: 'Martin Gardner', redirectCats: [] },
  'John Wiley & Sons':    { enExists: true, faTitle: 'جان وایلی و پسران', viaRedirect: true,
    redirectFrom: 'John Wiley & Sons', redirectTo: 'Wiley (publisher)',
    redirectCats: ['Printworthy redirects', 'Redirects from long names', 'Redirects from moves'] },
  'Homeric':              { enExists: true, faTitle: 'هومر', viaRedirect: true,
    redirectFrom: 'Homeric', redirectTo: 'Homer',
    redirectCats: ['Redirects from adjectives', 'Redirects from eponyms'] },
  'Odinism':              { enExists: true, faTitle: 'هیثنری', viaRedirect: true,
    redirectFrom: 'Odinism', redirectTo: 'Heathenry (new religious movement)',
    redirectCats: ['Printworthy redirects', 'Redirects connected to a Wikidata item',
                   'Redirects from subtopics', 'Redirects from moves'] },
  'Canadian Albums Chart': { enExists: true, faTitle: 'بیلبورد کانادا', viaRedirect: true,
    redirectFrom: 'Canadian Albums Chart', redirectTo: 'Billboard Canadian Albums', redirectCats: [] },
  'Bob Smith discography': { enExists: true, faTitle: 'باب اسمیت', viaRedirect: true,
    redirectFrom: 'Bob Smith discography', redirectTo: 'Bob Smith', redirectFragment: 'Discography',
    redirectCats: ['Redirects from moves'] },
  'BA':                   { enExists: true, faTitle: 'BA', viaRedirect: false },
  'Mercury':              { enExists: true, faTitle: 'مرکوری', viaRedirect: false, enDisambig: true },
  'Walt Disney Records':  { enExists: true, faTitle: 'والت دیزنی رکوردز', viaRedirect: false, enItem: 'Q1' },
  'Revolutionary Spring': { enExists: true, faTitle: 'بهار انقلابی ۱۸۴۸–۱۸۴۹', viaRedirect: false },
  'R':                    { enExists: true, faTitle: 'R', viaRedirect: false },
};
/** fa disambiguation flags and items, as mediawikiFaInfo reports them. */
const FA_META = new Map([
  ['BA', { disambig: true, item: 'Q2' }],
  ['والت دیزنی رکوردز', { disambig: false, item: 'Q999' }],
]);

function resolver(faLive?: Set<string>) {
  return new Resolver(
    async (ts: string[]) => new Map(ts.map(t =>
      [t, LOOKUP[t] ?? { enExists: false, faTitle: null, viaRedirect: false }])),
    NAMES,
    faLive === undefined ? undefined
      : async (ts: string[]) => new Set(ts.filter(t => faLive.has(t))),
    async (ts: string[]) => new Map(ts.filter(t => FA_META.has(t)).map(t => [t, FA_META.get(t)!])),
  );
}
async function rewriteText(text: string, faLive?: Set<string>) {
  const res = await resolver(faLive).resolveMany(scan(text).map(f => f.target));
  return applyResolutions(text, res, NAMES);
}
const kinds = (fs: Finding[]) => fs.map(f => f.kind);

console.log('== detection ==');
{
  const f = scan('متن [[Antelope Valley]] و [[Area code 562|562]]');
  ok('a Latin target is found', eq(kinds(f), ['latin_target', 'latin_target']), JSON.stringify(kinds(f)));
  ok('the display label is captured', f[1].display === '562', String(f[1].display));
}
{
  // A sweep that forgets File: rewrites image options into body text —
  // lessons/routemap/link-sweep-must-exclude-file-namespace.md
  const text = '[[پرونده:X.svg|100px|thumb]] [[File:Y.jpg|25px]] '
    + '[[:en:Already|پیش‌تر]] [[رده:شهرها]] [[الگو:نمونه]]';
  ok('file, category, template and interwiki links are never touched', scan(text).length === 0,
     JSON.stringify(scan(text)));
}
ok('a Persian-digit target is its own class',
   eq(kinds(scan('[[Area code ۳۲۳|۳۲۳]]')), ['persian_digit_target']));
ok('a Latin label on a Persian target is detected',
   eq(kinds(scan('[[منطقه زمانی اقیانوس آرام|PST]]')), ['latin_display']));
ok('a Persian label on a Persian target is clean', scan('[[لس آنجلس تایمز|روزنامه]]').length === 0);
ok('a px size is not mistaken for an English label', scan('[[پرونده:Flag.svg|25px]]').length === 0);

console.log('\n== the resolution ladder ==');
{
  const r = (await resolver().resolveMany(['Los Angeles Times'])).get('Los Angeles Times')!;
  ok('an fa langlink is applied automatically', r.kind === FA && r.link === 'لس آنجلس تایمز',
     JSON.stringify(r));
}
{
  const r = (await resolver().resolveMany(['Antelope Valley'])).get('Antelope Valley')!;
  ok('en-only with a curated name becomes an interwiki',
     r.kind === EN && r.link === 'Antelope Valley' && r.display === 'دره آنتلوپ', JSON.stringify(r));
}
{
  const r = (await resolver().resolveMany(['Monte Nido, California'])).get('Monte Nido, California')!;
  ok('en-only WITHOUT a curated name is review', r.kind === REVIEW, JSON.stringify(r));
  ok('and the reason names the table', r.reason.includes('names.json'), r.reason);
}
{
  const r = (await resolver().resolveMany(['John Fasana'])).get('John Fasana')!;
  ok('no article anywhere, with a name, becomes plain text',
     r.kind === PLAIN && r.display === 'جان فاسانا', JSON.stringify(r));
}
{
  // Acquanetta Warren redirects to Fontana, California: the fa article is the CITY, not
  // the mayor. Re-pointing it is a wrong-topic BLUE link, which no red-link check catches.
  const r = (await resolver().resolveMany(['Acquanetta Warren'])).get('Acquanetta Warren')!;
  ok('fa reached via an en redirect is review, not a re-point', r.kind === REVIEW, JSON.stringify(r));
  ok('and the reason says why', r.reason.includes('en redirect'), r.reason);
}
{
  // A langlink is not proof the fa page exists: a Wikidata sitelink outlives deletion.
  const r = (await resolver(new Set()).resolveMany(['Julia Brownley'])).get('Julia Brownley')!;
  ok('a stale sitelink to a deleted fa article is review', r.kind === REVIEW, JSON.stringify(r));
  ok('and the reason says stale', r.reason.includes('stale'), r.reason);
}
{
  const r = (await resolver().resolveMany(['Area code ۳۲۳'])).get('Area code ۳۲۳')!;
  ok('a remapped Persian-digit target resolves via its Latin twin',
     r.kind === EN && r.link === 'Area code 323', JSON.stringify(r));
}

console.log('\n== rewriting ==');
{
  const { text, applied } = await rewriteText('[[Los Angeles Times]] در [[Antelope Valley]]');
  ok('fa re-point and interwiki together',
     text === '[[لس آنجلس تایمز]] در [[:en:Antelope Valley|دره آنتلوپ]]', text);
  ok('both counted', applied === 2, String(applied));
}
{
  const { text } = await rewriteText('[[Antelope Valley|دره‌ی آنتلوپ]]');
  ok('a Persian label is preserved verbatim', text === '[[:en:Antelope Valley|دره‌ی آنتلوپ]]', text);
}
ok('an ordinal keeps its shape', numericDisplay('41st') === '۴۱ام', String(numericDisplay('41st')));
ok('a comma list keeps its shape', numericDisplay('562, 310') === '۵۶۲، ۳۱۰', String(numericDisplay('562, 310')));
ok('«and» becomes «و»', numericDisplay('747 and 818') === '۷۴۷ و ۸۱۸', String(numericDisplay('747 and 818')));
ok('a word is not numeric', numericDisplay('Antelope Valley') === null);
{
  const { text } = await rewriteText('[[Charter city|General Law City]]');
  ok('one target meaning two things uses by_old_display',
     text === '[[:en:Charter city|شهر قانون عمومی]]', text);
}
{
  const { text } = await rewriteText('[[Mayor:]] [[John Fasana]]');
  ok('plain-text replacement drops the brackets', text === 'شهردار: جان فاسانا', text);
}
{
  const before = '[[Monte Nido, California]] و [[Acquanetta Warren]]';
  const { text, applied, deferred } = await rewriteText(before);
  ok('review targets are left untouched', text === before, text);
  ok('and nothing is counted as applied', applied === 0, String(applied));
  ok('both are deferred', eq([...deferred].sort(), ['Acquanetta Warren', 'Monte Nido, California']),
     JSON.stringify(deferred));
}
{
  const before = '[[پرونده:X.svg|100px|thumb|شرح]] [[Antelope Valley]]';
  const { text } = await rewriteText(before);
  ok('a file link survives a rewrite unchanged', text.includes('[[پرونده:X.svg|100px|thumb|شرح]]'), text);
}

console.log('\n== extension ۱: a citation keeps its own language ==');
{
  // «ایمانوئل ولیکوفسکی», 2026-11-12: the shipped code turned the author name in an
  // English bibliography line Persian. The label is the source's text; only the target moves.
  const before = '== منابع ==\n{{چپ‌چین}}\n*[[George O. Abell|Abell, George O.]] (1981). '
    + 'Scientists and Velikovsky, edited by [[Kendrick Frazier]], [[Prometheus Books]].\n{{پایان چپ‌چین}}';
  const { text } = await rewriteText(before);
  ok('the author label stays as the source prints it',
     text.includes('[[جرج آبل|Abell, George O.]]'), text);
  ok('an unlabelled publisher keeps its English name as the label',
     text.includes('[[کتاب‌های پرومتئوس|Prometheus Books]]'), text);
}
{
  const before = 'متن.<ref>Gardner (1957). [[Prometheus Books]].</ref>';
  const { text } = await rewriteText(before);
  ok('inside an English <ref> too', text.includes('[[کتاب‌های پرومتئوس|Prometheus Books]]'), text);
}
{
  const before = '{{cite book |last=Abell |title=Paranormal Borderlands |publisher=[[Prometheus Books]]}}';
  const { text } = await rewriteText(before);
  ok('inside a cite template whose values are English',
     text.includes('|publisher=[[کتاب‌های پرومتئوس|Prometheus Books]]'), text);
}
{
  const { text } = await rewriteText('کتاب را [[Prometheus Books]] منتشر کرد.');
  ok('in Persian prose the label still becomes Persian (approved behaviour unchanged)',
     text === 'کتاب را [[کتاب‌های پرومتئوس]] منتشر کرد.', text);
}
{
  // An interwiki with a Persian label inside an English citation helps no reader and
  // translates the source; it is left alone.
  const before = '<ref>Smith (2001). [[Antelope Valley]] history.</ref>';
  const { text, deferred } = await rewriteText(before);
  ok('en-only target inside an English citation is left untouched', text === before, text);
  ok('and deferred for review', deferred.includes('Antelope Valley'), JSON.stringify(deferred));
}
{
  const before = '== منابع ==\n*[[Prometheus Books]] (۱۳۸۰). کتابی فارسی.';
  const { text } = await rewriteText(before);
  ok('a PERSIAN bibliography line is prose for this purpose',
     text.includes('[[کتاب‌های پرومتئوس]] (۱۳۸۰)'), text);
}
{
  const before = '𝑥 متن.<ref>Gardner (1957). [[Prometheus Books]].</ref>';
  const { text } = await rewriteText(before);
  ok('an astral character before the span does not shift it',
     text.includes('[[کتاب‌های پرومتئوس|Prometheus Books]]'), text);
}
{
  const before = 'متن.<ref>Gardner (1957). [[Prometheus Books]].</ref>';
  const { text: after } = await rewriteText(before);
  const { introduced } = gateDiff('نمونه', before, after);
  ok('the gate accepts the kept English label', introduced.length === 0, JSON.stringify(introduced));
}

console.log('\n== extension ۲: an en redirect is followed only when it is the same subject ==');
{
  const res = await resolver().resolveMany(Object.keys(LOOKUP));
  const k = (t: string) => res.get(t)!.kind;
  ok('a catalogue inversion «Gardner, Martin» is followed', k('Gardner, Martin') === FA,
     JSON.stringify(res.get('Gardner, Martin')));
  ok('«Redirects from long names» is followed', k('John Wiley & Sons') === FA,
     JSON.stringify(res.get('John Wiley & Sons')));
  ok('an adjective → person redirect («Homeric» → Homer) is refused', k('Homeric') === REVIEW);
  ok('«subtopics» vetoes even beside «moves» (Odinism)', k('Odinism') === REVIEW);
  ok('a redirect with NO rcat is refused', k('Canadian Albums Chart') === REVIEW);
  ok('a redirect to a section is refused', k('Bob Smith discography') === REVIEW);
  ok('Acquanetta Warren (no rcat fixture) is still refused', k('Acquanetta Warren') === REVIEW);
  ok('an fa disambiguation target is refused (BA)', k('BA') === REVIEW, JSON.stringify(res.get('BA')));
  ok('an en disambiguation page is refused', k('Mercury') === REVIEW);
  ok('fa page on a different Wikidata item than the en page is refused',
     k('Walt Disney Records') === REVIEW, JSON.stringify(res.get('Walt Disney Records')));
}
ok('inversion needs the exact same words', !isNameInversion('Gardner, Martin', 'Martin Gardiner'));
ok('a place name with a comma is not an inversion',
   !isNameInversion('Fontana, California', 'California Fontana State'));
ok('an entry redirecting into a list is not the list (Trout Lake Airport)',
   !sameSubjectRedirect({ enExists: true, faTitle: 'فهرست فرودگاه‌های واشینگتن', viaRedirect: true,
     redirectFrom: 'Trout Lake Airport (Washington)', redirectTo: 'List of airports in Washington',
     redirectCats: ['Redirects from moves'] }));
ok('«from ambiguous terms» vetoes (The Diplomat → Diplomat (disambiguation))',
   !sameSubjectRedirect({ enExists: true, faTitle: 'دیپلمات (ابهام‌زدایی)', viaRedirect: true,
     redirectFrom: 'The Diplomat', redirectTo: 'Diplomat (disambiguation)',
     redirectCats: ['Redirects from ambiguous terms', 'Redirects from modifications'] }));
ok('a renamed list is still followed',
   sameSubjectRedirect({ enExists: true, faTitle: 'x', viaRedirect: true,
     redirectFrom: 'List of Iranian poets', redirectTo: 'List of Persian poets',
     redirectCats: ['Redirects from moves'] }));
ok('a non-redirect is never a same-subject redirect',
   !sameSubjectRedirect({ enExists: true, faTitle: 'x', viaRedirect: false }));

console.log('\n== extension ۶: what a template dry run taught (۱۲ نوامبر ۲۰۲۶) ==');
{
  for (const t of ['[[Template:Songkick|Songkick]]', '[[Help:IPA/Mandarin|IPA]]',
                   '[[Wikipedia:Subpages|subpage]]', '[[راهنما:آی‌پی‌ای|IPA]]']) {
    ok(`a project-namespace link is not an article link: ${t}`, scan(t).length === 0, JSON.stringify(scan(t)));
  }
}
{
  const before = 'a link such as <nowiki>"the [[Los Angeles Times]]"</nowiki> works';
  const { text } = await rewriteText(before);
  ok('a link inside <nowiki> is an example, not a link', text === before, text);
}
{
  const before = '|info=This user is a [[Los Angeles Times|citizen]] of the state.';
  const { text, deferred } = await rewriteText(before);
  ok('a link in an untranslated English sentence is left for the translator', text === before, text);
  ok('and deferred', deferred.includes('Los Angeles Times'));
}
ok('a bare list item is not English prose', !inEnglishProse('* [[Ibn Masarra]]', 3));
ok('a table cell with a year is not English prose', !inEnglishProse('|[[Argentine real|Real]]<br/>1813', 2));
ok('a Persian sentence is not English prose', !inEnglishProse('او به [[Prometheus Books]] رفت', 7));
ok('an infobox parameter holding just a link is not prose', !inEnglishProse('|country = [[Argentina]]', 12));

console.log('\n== found by the pre-run render check (۱۲ نوامبر ۲۰۲۶) ==');
{
  // «انقلاب‌های ۱۸۴۸»: an English {{Cite book}} converts Persian digits in its parameters,
  // link targets included, so the repaired link rendered RED as «… 1848–1849».
  const before = '{{Cite book |last=Clark |title=[[Revolutionary Spring|Revolutionary Spring: Europe Aflame]] |date=2023}}';
  const { text, deferred } = await rewriteText(before);
  ok('a Persian-digit target is never put inside a template', text === before, text);
  ok('and is deferred', deferred.includes('Revolutionary Spring'));
  const { text: prose } = await rewriteText('کتاب [[Revolutionary Spring]] را بخوانید.');
  ok('in prose the same target is fine', prose.includes('[[بهار انقلابی ۱۸۴۸–۱۸۴۹]]'), prose);
}

{
  const before = '<span>[[R|Ʀʀ]]</span> [[R&#95;|x]]';
  const { text } = await rewriteText(before);
  ok('a link whose fa article has the same title is left alone (label kept)', text === before, text);
}
{
  const before = '13.3{{efn|Including 3.4% for the [[Los Angeles Times|LAT]] and 2% for others.}}';
  const { text } = await rewriteText(before);
  ok('English text inside a footnote template is its context', text === before, text);
  ok('but a bare link in an English-free template argument is repairable',
     !inEnglishProse('{{navbox|list1=[[Los Angeles Times]]}}', 16));
}

console.log('\n== the unapproved scope stays off for the bot ==');
{
  const g = { enExists: true, faTitle: 'مارتین گاردنر', viaRedirect: true,
    redirectFrom: 'Gardner, Martin', redirectTo: 'Martin Gardner', redirectCats: [] };
  const look = async (ts: string[]) => new Map(ts.map(t => [t, g]));
  const off = await new Resolver(look, NAMES, undefined, undefined, false).resolveMany(['Gardner, Martin']);
  ok('with the extension off, a same-subject redirect is still REVIEW',
     off.get('Gardner, Martin')!.kind === REVIEW, JSON.stringify(off.get('Gardner, Martin')));
  const res = new Map<string, Resolution>([['May 68', { kind: FA, link: 'مه ۶۸', reason: 't' }]]);
  __setResolutionsForTest(res, NAMES, new Set(['مه ۶۸']), false);
  const t = '{{بت|می ۶۸|en=May 68}}';
  ok('with the extension off, a {{بت}} call is not touched', repairPage(t).text === t, repairPage(t).text);
  __setResolutionsForTest(res, NAMES, new Set(['مه ۶۸']), true);
  ok('with it on, it is', repairPage(t).text === '[[مه ۶۸|می ۶۸]]', repairPage(t).text);
}

console.log('\n== the gate fires on what the edit introduces ==');
{
  // These pages carry ~13k inherited Latin display labels; a whole-text gate would block
  // every edit and tempt someone to switch it off.
  const before = '[[اداره آمار آمریکا|United States Census Bureau]] [[Antelope Valley]]';
  const { text: after } = await rewriteText(before);
  const { introduced, inherited } = gateDiff('نمونه', before, after);
  ok('an inherited problem does not block the edit', introduced.length === 0, JSON.stringify(introduced));
  ok('but it is still reported', inherited.some(p => p.includes('LATIN display')), JSON.stringify(inherited));
}
{
  const { introduced } = gateDiff('نمونه', 'متن ساده', 'متن [[لس آنجلس تایمز|Los Angeles Times]]');
  ok('an introduced problem is caught', introduced.some(p => p.includes('LATIN display')),
     JSON.stringify(introduced));
}

{
  // «اریک هابسبام», ۱۲ نوامبر ۲۰۲۶: repairing a link right beside an inherited em dash
  // changed the quoted context, and the message-comparing gate called the dash new.
  const before = 'جنبش [[May 68|می ۶۸]] پاریس را محکوم کرد — قدرت گرفت.';
  const after = 'جنبش [[مه ۶۸|می ۶۸]] پاریس را محکوم کرد — قدرت گرفت.';
  const { introduced } = gateDiff('نمونه', before, after);
  ok('an inherited em dash beside the repaired link is not "introduced"', introduced.length === 0,
     JSON.stringify(introduced));
  const { introduced: added } = gateDiff('نمونه', before, after + ' و — دیگر');
  ok('a second em dash IS introduced', added.some(p => p.startsWith('dashes 1→2')), JSON.stringify(added));
}

console.log('\n== the shipped names table ==');
{
  const names = loadNames();
  ok('it loads and is substantial', Object.keys(names.en).length > 100, String(Object.keys(names.en).length));
  let nonPersian: string[] = [];
  for (const bucket of ['fa', 'en', 'plain'] as const) {
    for (const [k, v] of Object.entries(names[bucket])) {
      if (!PERSIAN.test(v)) nonPersian.push(`${bucket}[${k}] = ${v}`);
    }
  }
  ok('every curated value is Persian', nonPersian.length === 0, nonPersian.slice(0, 3).join('; '));
  ok('every remap target is the Latin twin of its key',
     Object.entries(names.remap).every(([k, v]) => /[۰-۹]/.test(k) && /[0-9]/.test(v)),
     JSON.stringify(names.remap));
}

console.log('\n== the red-link guard (new in the port) ==');
{
  // The Python version wrote the page first and then aborted the RUN if red links had
  // risen, leaving the bad edit live. The port refuses pre-save, so this parsing of the
  // rendered html is what that decision rests on.
  const html = '<a href="/w/index.php?title=%D8%A8%D8%AD%D8%AB:X&amp;action=edit&amp;redlink=1" class="new">بحث</a>'
    + '<a href="/w/index.php?title=Missing_Page&amp;action=edit&amp;redlink=1" class="new">نبود</a>'
    + '<a href="/wiki/Fine" class="mw-redirect">خوب</a>';
  const reds = contentRedLinks(html);
  ok('a content red link is counted', reds.length === 1, JSON.stringify(reds));
  ok('a navbar talk red link is not', !reds.some(r => r.startsWith('%D8%A8%D8%AD%D8%AB')), JSON.stringify(reds));
  ok('a blue link is not counted', !reds.some(r => r.includes('Fine')));
}

console.log(`\n${pass} گذشت، ${fails.length} افتاد`);
if (fails.length) { console.error('failing:\n  - ' + fails.join('\n  - ')); process.exit(1); }
