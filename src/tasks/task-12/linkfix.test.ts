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
  EN, FA, PLAIN, REVIEW, Resolver, loadNames,
  type LookupInfo, type Names, type Resolution,
} from './resolve.js';
import { applyResolutions, gateDiff, numericDisplay } from './rewrite.js';
import { contentRedLinks } from './linkfix.js';

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
};

function resolver(faLive?: Set<string>) {
  return new Resolver(
    async (ts: string[]) => new Map(ts.map(t =>
      [t, LOOKUP[t] ?? { enExists: false, faTitle: null, viaRedirect: false }])),
    NAMES,
    faLive === undefined ? undefined
      : async (ts: string[]) => new Set(ts.filter(t => faLive.has(t))),
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
