/**
 * Offline tests for وظیفهٔ ۱۲ extensions ۳–۵: {{پیوند با میان‌ویکی}}, {{بت}}, and the bare
 * `*-link` citation parameters. No network.
 *
 *   npx tsx src/tasks/task-12/templates.test.ts
 *
 * The «must not change» cases are the traps found in the ۱۲ نوامبر ۲۰۲۶ sample of 2,618
 * {{بت}} calls and 272 {{پیوند با میان‌ویکی}} calls; each names where it was seen.
 */
import { FA, REVIEW, type Resolution } from './resolve.js';
import { applyTemplates, btToIll, parseInterwikiCalls, scanCiteLinks } from './templates.js';
import { foreignSpans } from '../../lib/gates.js';

let pass = 0;
const fails: string[] = [];
function ok(what: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ✓ ${what}`); }
  else { fails.push(`${what}${detail ? ` — ${detail}` : ''}`); console.log(`  ✗ ${what}\n      ${detail}`); }
}

const fa = (link: string): Resolution => ({ kind: FA, link, display: link, reason: 'test' });
const RES = new Map<string, Resolution>([
  ['May 68', fa('مه ۶۸')],
  ['Thomas Wolsey', fa('تامس وولسی')],
  ['Hollywood Records', fa('هالیوود رکوردز')],
  ['Walt Disney Records', fa('والت دیزنی رکوردز')],
  ['Martin Gardner', fa('مارتین گاردنر')],
  ['Prometheus Books', fa('کتاب‌های پرومتئوس')],
  ['Seamount', { kind: REVIEW, reason: 'en-only' }],
  ['President of Honduras', fa('رئیس‌جمهور هندوراس')],
]);
const LIVE = new Set(['مه ۶۸', 'تامس وولسی', 'هالیوود رکوردز', 'والت دیزنی رکوردز',
  'مارتین گاردنر', 'کتاب‌های پرومتئوس', 'نقطه داغ هاوایی']);
const run = (t: string, mode: 'never' | 'if-repaired' | 'always' = 'if-repaired') =>
  applyTemplates(t, RES, LIVE, foreignSpans(t), mode);

console.log('== {{پیوند با میان‌ویکی}}: red call, fa article under another name ==');
{
  // «توماس گرارد»: the call names تامس وولزی, the article is تامس وولسی.
  const { text, applied } = run('{{پیوند با میان‌ویکی|تامس وولزی|Thomas Wolsey}} بود.');
  ok('becomes a plain link keeping the editor\'s Persian label',
     text === '[[تامس وولسی|تامس وولزی]] بود.', text);
  ok('counted as a repair', applied === 1);
}
{
  const { text } = run('{{پم|مه شصت‌وهشت|May 68|عنوان=مه ۱۹۶۸}}');
  ok('a redirect name and عنوان= are honoured', text === '[[مه ۶۸|مه ۱۹۶۸]]', text);
}
{
  const t = '{{پیوند با میان‌ویکی|نقطه داغ هاوایی|Hawaii hotspot}}';
  ok('a call whose fa title already exists is not touched', run(t).text === t);
}
{
  const t = '{{پیوند با میان‌ویکی|کوه دریایی|Seamount}}';
  ok('no fa article anywhere: untouched', run(t).text === t);
}
{
  const t = '{{پیوند با میان‌ویکی|مه ۶۸ فرانسه|Mai 68|زبان=fr}}';
  ok('a non-en source is left for a human', run(t).text === t && run(t).deferred.length === 1);
}

console.log('\n== {{بت}}: repair ==');
{
  // «اریک هابسبام»: {{بت|می ۶۸|en=May 68}} — the article is «مه ۶۸».
  const { text, applied } = run('{{بت\n| 1 = می ۶۸\n| en = May 68\n}}');
  ok('a multi-line spaced call is read and repaired', text === '[[مه ۶۸|می ۶۸]]', text);
  ok('counted', applied === 1);
}
{
  const { text } = run('{{بت|1=می ۶۸|2=رویدادهای مه|en=May 68}}');
  ok('its display label is kept', text === '[[مه ۶۸|رویدادهای مه]]', text);
}

{
  const { text } = run('{{بت|1=قوه مجریه هندوراس|2=Poder Ejecutivo de Honduras|en=President of Honduras}}');
  ok('a Latin label falls back to the call\'s own Persian title, not the article title',
     text === '[[رئیس‌جمهور هندوراس|قوه مجریه هندوراس]]', text);
}

console.log('\n== the traps: these must NOT change ==');
{
  // «شبکه دیزنی»: the label and en= name two different companies.
  const t = '{{بت|Walt Disney Records|en=Hollywood Records}}';
  const r = run(t);
  ok('label and en= naming different subjects is refused', r.text === t, r.text);
  ok('and sent to review', r.deferred.length === 1);
}
{
  const t = '{{بت|رده:نقاشان|en=Painters}} و {{بت|مه ۶۸|en=May 68}}';
  const r = run(t, 'always');
  ok('a namespace-prefixed title is never converted (it would categorise the page)',
     r.text.startsWith('{{بت|رده:نقاشان|en=Painters}}'), r.text);
}
{
  const calls = parseInterwikiCalls('{{بت|1=لیگ عدالت: نفرین|en=Justice League Action}}');
  ok('an ordinary colon in a title is not a namespace', calls[0].problem === null, String(calls[0].problem));
}
{
  // {{بت}} ignores ۲= and display=; converting would surface a label nobody has seen.
  for (const t of ['{{بت|مه ۶۸|۲=برچسب|en=May 68}}', '{{بت|مه ۶۸|display=x|en=May 68}}']) {
    const calls = parseInterwikiCalls(t);
    ok(`an ignored parameter blocks conversion: ${t}`, btToIll(calls[0]) === null);
  }
}
{
  const t = '{{بت|1=فهرست دسرهای ترکی|en=List of Turkish desserts|ترکی}}';
  ok('a bare positional after 1= (the gate\'s defect) is refused',
     parseInterwikiCalls(t)[0].problem !== null);
}
{
  const t = '{{بت|[[مه ۶۸]]|en=May 68}}';
  ok('nested markup is refused', parseInterwikiCalls(t)[0].problem !== null);
}
{
  const t = '<!-- {{بت|می ۶۸|en=May 68}} -->';
  ok('a call inside a comment is not a call', run(t, 'always').text === t);
}
{
  const t = '{{بت|کوه دریایی|en=}}';
  ok('no en= is refused', parseInterwikiCalls(t)[0].problem !== null);
}

console.log('\n== {{بت}} → {{پیوند با میان‌ویکی}}: only on a page being edited anyway ==');
{
  const t = 'متن {{بت|کوه دریایی|en=Seamount}}.';
  ok('a page whose ONLY change would be the conversion is not changed',
     run(t).text === t && run(t).applied === 0);
}
{
  const r = run('{{بت|می ۶۸|en=May 68}} و {{بت|کوه دریایی|en=Seamount}}');
  ok('alongside a real repair, the other calls convert',
     r.text === '[[مه ۶۸|می ۶۸]] و {{پیوند با میان‌ویکی|کوه دریایی|Seamount}}', r.text);
  ok('and are counted as conversions, not repairs', r.applied === 1 && r.converted === 1);
}
{
  const r = run('{{بت|کوه دریایی|تپه زیر آب|en=Seamount}}', 'always');
  ok('a label moves to عنوان=',
     r.text === '{{پیوند با میان‌ویکی|کوه دریایی|Seamount|عنوان=تپه زیر آب}}', r.text);
}
{
  const r = run('{{بت|کوه دریایی|کوه دریایی|en=Seamount}}', 'always');
  ok('a label equal to the title is dropped',
     r.text === '{{پیوند با میان‌ویکی|کوه دریایی|Seamount}}', r.text);
}
ok('never mode converts nothing', run('{{بت|کوه دریایی|en=Seamount}}', 'never').converted === 0);

console.log('\n== extension ۳: citation *-link parameters ==');
{
  const t = '{{cite book |last=Gardner |first=Martin |author-link=Gardner, Martin |title=Fads}}';
  const res = new Map(RES); res.set('Gardner, Martin', fa('مارتین گاردنر'));
  const r = applyTemplates(t, res, LIVE, foreignSpans(t));
  ok('the bare title is re-pointed, nothing else moves',
     r.text === '{{cite book |last=Gardner |first=Martin |author-link=مارتین گاردنر |title=Fads}}', r.text);
}
{
  const ls = scanCiteLinks('{{cite book |last=X |author-link=[[Y]] |publisher=Prometheus Books}}');
  ok('only *-link parameters, and only bare titles', ls.length === 0, JSON.stringify(ls));
}
{
  const ls = scanCiteLinks('{{cite book |editor2-link=Martin Gardner |title-link=Fads}}');
  ok('editorN-link and title-link are recognised', ls.map(l => l.param).join() === 'editor2-link,title-link',
     JSON.stringify(ls));
}

console.log(`\n${pass} گذشت، ${fails.length} افتاد`);
if (fails.length) { console.error('failing:\n  - ' + fails.join('\n  - ')); process.exit(1); }
