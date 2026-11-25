/**
 * وظیفهٔ ۲۰ — offline tests.
 *
 *   npx tsx src/tasks/task-20/values.test.ts
 *
 * Most of these say "this exact input must not change". The fixtures come from the census
 * of the ۱ نوامبر ۲۰۲۶ dump and from the two ecoregion articles that started the task.
 */
import { applyPage, core, titleLabel } from './values.js';
import { parseDictionary, normValue, paramFamily, lookup, DictionaryError } from './dictionary.js';

let pass = 0;
const fails: string[] = [];
function ok(what: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ✓ ${what}`); }
  else { fails.push(`${what}${detail ? ` — ${detail}` : ''}`); console.log(`  ✗ ${what}\n      ${detail}`); }
}
const eq = (what: string, a: unknown, b: unknown) =>
  ok(what, JSON.stringify(a) === JSON.stringify(b), `${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);

const table = (rows: string[][]) =>
  '{| class="wikitable"\n! الگو !! پارامتر !! مقدار انگلیسی !! مقدار فارسی !! منبع\n'
  + rows.map(r => `|-\n| ${r.join(' || ')}`).join('\n') + '\n|}';

const DICT = parseDictionary(table([
  ['Infobox ecoregion', 'conservation', 'Critical/endangered', 'بحرانی/در معرض خطر', 'attested:19/20'],
  ['Infobox ecoregion', 'conservation', 'Vulnerable', 'آسیب‌پذیر', 'attested:4/5'],
  ['جعبه اطلاعات منطقه مسکونی', 'subdivision_type#', 'County', 'شهرستان', 'attested'],
  ['جعبه اطلاعات منطقه مسکونی', 'settlement_type', 'Village', 'روستا', 'attested'],
  ['ناوبری', 'group#', 'Related articles', 'مقاله‌های مرتبط', 'manual'],
  ['Infobox football biography', 'clubs#', 'Retired', 'بازنشسته', 'manual'],
  ['Infobox football biography', 'position', 'Midfielder', 'هافبک', 'attested'],
]), 1);
const canon = (n: string) => ({ 'Infobox settlement': 'جعبه اطلاعات منطقه مسکونی' } as Record<string, string>)[n] ?? n;
const run = (t: string) => applyPage(t, DICT, canon);
const unchanged = (what: string, t: string) => eq(what, run(t).text, t);

console.log('== the dictionary page ==');
{
  eq('normValue ignores case, spacing and comments', normValue("  Critical/Endangered <!-- x -->\n"), 'critical/endangered');
  eq('paramFamily folds digits', paramFamily('subdivision_type2'), 'subdivision_type#');
  ok('template key first, then *', lookup(DICT, 'Infobox ecoregion', 'conservation', 'vulnerable')?.fa === 'آسیب‌پذیر');
  const bad = (what: string, rows: string[][], needle: string) => {
    try { parseDictionary(table(rows), 9); ok(what, false, 'parsed'); }
    catch (e) { ok(what, e instanceof DictionaryError && (e as Error).message.includes(needle), (e as Error).message); }
  };
  bad('duplicate key, two Persian values, is refused',
    [['X', 'p', 'Foo', 'فو', 's'], ['X', 'p', 'foo', 'فوو', 's']], 'دو مقدار فارسی');
  bad('a row with four cells is refused', [['X', 'p', 'Foo', 'فو']], 'خانه');
  bad('an empty cell is refused', [['X', 'p', 'Foo', '', 's']], '');
  bad('a Persian value still in Latin is refused', [['X', 'p', 'Foo', 'Foo bar', 's']], 'لاتین');
  bad('a * row contradicting a template row is refused',
    [['*', 'type', 'Town', 'شهر', 's'], ['X', 'type', 'Town', 'شهرک', 's']], 'ناسازگار');
  bad('no table is refused', [], '');
  try { parseDictionary('no table here', 3); ok('missing table', false); } catch { ok('missing table is refused', true); }
}

console.log('== infobox values: what changes ==');
{
  const r = run('{{Infobox ecoregion\n|name=مانگروهای گینه\n|conservation=Vulnerable\n|area=۲۲٬۱۶۵\n}}');
  eq('whole value replaced', r.text, '{{Infobox ecoregion\n|name=مانگروهای گینه\n|conservation=آسیب‌پذیر\n|area=۲۲٬۱۶۵\n}}');
  eq('one change recorded', r.changes.map(c => c.kind), ['value']);
  eq('case and spacing ignored', run('{{Infobox ecoregion|conservation= critical/Endangered }}').text,
     '{{Infobox ecoregion|conservation= بحرانی/در معرض خطر }}');
  eq('a trailing ref and comment are kept', run('{{Infobox ecoregion|conservation=Vulnerable<ref>WWF</ref> <!-- x -->\n}}').text,
     '{{Infobox ecoregion|conservation=آسیب‌پذیر<ref>WWF</ref> <!-- x -->\n}}');
  eq('a parameter family matches any digit', run('{{Infobox football biography|position=Midfielder}}').text,
     '{{Infobox football biography|position=هافبک}}');
  unchanged('settlement labels are the module\'s, not the bot\'s', '{{Infobox settlement|subdivision_type2=County}}');
}

console.log('== infobox values: what must not change ==');
{
  unchanged('a partial match inside a phrase', '{{Infobox ecoregion|conservation=Vulnerable to fire}}');
  unchanged('a value with a template inside', '{{Infobox ecoregion|conservation={{IUCN|VU}} Vulnerable}}');
  unchanged('a value with a link', '{{Infobox ecoregion|conservation=[[Vulnerable species|Vulnerable]]}}');
  unchanged('the same value under another template', '{{Infobox mountain|conservation=Vulnerable}}');
  unchanged('a parameter not on the whitelist', '{{Infobox settlement|unit_pref=County}}');
  unchanged('a control key with an English value', '{{Infobox settlement|unit_pref=Imperial|population_density_km2=auto}}');
  unchanged('an already Persian value', '{{Infobox ecoregion|conservation=آسیب‌پذیر}}');
  unchanged('a value inside a comment', '<!-- {{Infobox ecoregion|conservation=Vulnerable}} -->');
  unchanged('a value inside nowiki', '<nowiki>{{Infobox ecoregion|conservation=Vulnerable}}</nowiki>');
  unchanged('a {{{param}}} default in a template body', '{{Infobox ecoregion|conservation={{{conservation|Vulnerable}}}}}');
  unchanged('a multi-line value', '{{Infobox ecoregion|conservation=Vulnerable\n* more}}');
  unchanged('a club name that happens to be in the dictionary for another parameter',
    '{{Infobox football biography|currentclub=Retired}}');
  eq('no dictionary at all', applyPage('{{Infobox ecoregion|conservation=Vulnerable}}', null, canon).text,
     '{{Infobox ecoregion|conservation=Vulnerable}}');
}

console.log('== navbox labels ==');
const EN: Record<string, string> = {
  'سالواتور موندی (نقاشی)': 'Salvator Mundi (Leonardo)', 'ربات لئوناردو': 'Leonardo\'s robot',
  'کمان زنبورکی لئوناردو': 'Crossbows', 'جرمی کوربین': 'Jeremy Corbyn', 'آهن': 'Iron',
  'لامپ خلأ': 'Vacuum tube', 'بی‌پیوند': '', 'پروتکل انتقال ابرمتن': 'HTTP',
};
const runL = (t: string) => applyPage(t, DICT, canon, x => EN[x]);
const sameL = (what: string, t: string) => eq(what, runL(t).text, t);
{
  eq('label equal to the en title (disambiguator aside) → the Persian title',
    runL('{{Navbox|list1=* [[سالواتور موندی (نقاشی)|Salvator Mundi]]}}').text,
    '{{Navbox|list1=* [[سالواتور موندی (نقاشی)|سالواتور موندی]]}}');
  sameL('a lower-case label stays (git, not Git)', '{{Navbox|list1=* [[کمان زنبورکی لئوناردو|crossbows]]}}');
  eq('the exact en title changes', runL('{{Navbox|list1=* [[کمان زنبورکی لئوناردو|Crossbows]]}}').text,
    '{{Navbox|list1=* [[کمان زنبورکی لئوناردو]]}}');
  eq('a child navbox is handled as its own call, once',
    runL('{{Navbox|list1={{Navbox|child|list1=* [[کمان زنبورکی لئوناردو|Crossbows]]}}\n* [[سالواتور موندی (نقاشی)|Salvator Mundi]]}}').text,
    '{{Navbox|list1={{Navbox|child|list1=* [[کمان زنبورکی لئوناردو]]}}\n* [[سالواتور موندی (نقاشی)|سالواتور موندی]]}}');
  eq('inside a list wrapper', runL('{{Navbox|list1={{فهرست افقی|[[کمان زنبورکی لئوناردو|Crossbows]]|[[تهران]]}}}}').text,
    '{{Navbox|list1={{فهرست افقی|[[کمان زنبورکی لئوناردو]]|[[تهران]]}}}}');
  sameL('a label differing in inner case stays (URI scheme, not protocol)', '{{Navbox|list1=* [[پروتکل انتقال ابرمتن|http]]}}');
  sameL('a short label (surname) stays', '{{Navbox|list1=* [[جرمی کوربین|Corbyn]]}}');
  sameL('a symbol stays', '{{Navbox|list1=* [[آهن|Fe]]}}');
  sameL('a label naming something else stays', '{{Navbox|list1=* [[لامپ خلأ|Diode]]}}');
  sameL('a label that is not the en title stays', '{{Navbox|list1=* [[ربات لئوناردو|Robot]]}}');
  sameL('no en sitelink stays', '{{Navbox|list1=* [[بی‌پیوند|Foo]]}}');
  sameL('not looked up stays', '{{Navbox|list1=* [[ناشناخته|Foo]]}}');
}
{
  unchanged('without an en lookup no label changes', '{{Navbox|list1=* [[سالواتور موندی (نقاشی)|Salvator Mundi]]}}');
  eq('group heading from the dictionary', run('{{Navbox|group2=Related articles|list2=* [[تهران]]}}').text,
    '{{Navbox|group2=مقاله‌های مرتبط|list2=* [[تهران]]}}');
  unchanged('an English target is task 12, not this task', '{{Navbox|list1=* [[Castle of Púbol]]}}');
  unchanged('an English target with an English label', '{{Navbox|list1=* [[Madonna of the Yarnwinder|Buccleuch Madonna]]}}');
  unchanged('a position qualifier', '{{Navbox|list1=* [[لیونل مسی|FW: Messi]]}}');
  unchanged('a parenthesised code', '{{Navbox|list1=* [[سروتونین|Serotonin (5-HT)]]}}');
  unchanged('a Roman numeral', '{{Navbox|list1=* [[فاینال فانتزی ۳|III]]}}');
  unchanged('a label with digits', '{{Navbox|list1=* [[فصل ۲۰۱۶|Season 2016]]}}');
  unchanged('a single short code', '{{Navbox|list1=* [[ایالات متحده آمریکا|USA]]}}');
  unchanged('an interwiki link', '{{Navbox|list1=* [[:en:Foo|Foo]]}}');
  unchanged('a file link', '{{Navbox|list1=* [[پرونده:Flag.svg|Flag]]}}');
  unchanged('a link inside a ref', '{{Navbox|list1=* [[تهران]]<ref>[[ربات لئوناردو|Robot]]</ref>}}');
  unchanged('a link outside any navbox', '* [[ربات لئوناردو|Robot]]');
  unchanged('a link in an infobox', '{{Infobox person|known_for=[[ربات لئوناردو|Robot]]}}');
  unchanged('a navbox style parameter', '{{Navbox|bodyclass=hlist|state=autocollapse|name=Foo}}');
}

console.log('== pattern values (drug infobox) ==');
{
  const canonDrug = (n: string) => ({ 'Infobox drug': 'جعبه اطلاعات دارو', 'Drugbox': 'جعبه اطلاعات دارو' } as Record<string, string>)[n] ?? n;
  const runP = (t: string) => applyPage(t, null, canonDrug);
  const box = '{{Infobox drug\n| legal_status = Unscheduled\n| elimination_half-life = 18 to 159 days\n| molecular_weight = 320.04 g/mol\n}}';
  const r = runP(box);
  eq('half-life and molar mass rewritten, nothing else (میتوتان)', r.text,
     '{{Infobox drug\n| legal_status = Unscheduled\n| elimination_half-life = ۱۸ تا ۱۵۹ روز\n| molecular_weight = ۳۲۰٫۰۴ گرم بر مول\n}}');
  eq('recorded as pattern changes', r.changes.map(c => c.kind), ['pattern', 'pattern']);
  eq('a ref after the value is kept', runP('{{Drugbox|elimination_half-life=24 hours<ref>x</ref>\n}}').text,
     '{{Drugbox|elimination_half-life=۲۴ ساعت<ref>x</ref>\n}}');
  const same = (what: string, t: string) => eq(what, runP(t).text, t);
  same('a second clause stays (تریامترن اچ)', '{{Infobox drug|elimination_half-life=1-2 hours, active metabolite 3 hours}}');
  same('a salt qualifier stays (تاموکسیفن)', '{{Infobox drug|molecular_weight=563.638 g/mol (citrate salt)}}');
  same('two values on one line stay', '{{Infobox drug|molecular_weight=371.515 g/mol{{سخ}}563.638 g/mol ([[citrate]] salt)}}');
  same('a bare number stays (the template formats it)', '{{Infobox drug|molecular_weight=370.577}}');
  same('the same shape in another template stays', '{{Infobox song|length=24 hours}}');
  same('the same shape in another drug parameter stays', '{{Infobox drug|bioavailability=24 hours}}');
  same('already Persian stays', '{{Infobox drug|elimination_half-life=۲۱–۶۱ ساعت}}');
}

console.log('== linked dictionary values (drug infobox) ==');
{
  const D2 = parseDictionary(table([
    ['جعبه اطلاعات دارو', 'excretion', 'Renal', '[[کلیه|کلیوی]]', 'هم‌سویی'],
    ['جعبه اطلاعات دارو', 'metabolism', 'Hepatic', '[[کبد|کبدی]]', 'هم‌سویی'],
    ['جعبه اطلاعات دارو', 'legal_status', 'Unscheduled', 'بدون رده', 'الگو'],
  ]), 2);
  const canonDrug = (n: string) => ({ 'Infobox drug': 'جعبه اطلاعات دارو' } as Record<string, string>)[n] ?? n;
  const r2 = (t: string) => applyPage(t, D2, canonDrug).text;
  eq('a linked value takes the linked entry (سفالوتین)', r2('{{Infobox drug|excretion=[[Kidney|Renal]]}}'),
     '{{Infobox drug|excretion=[[کلیه|کلیوی]]}}');
  eq('the label decides, not the target', r2('{{Infobox drug|metabolism=[[Liver|Hepatic]]}}'),
     '{{Infobox drug|metabolism=[[کبد|کبدی]]}}');
  eq('a plain value takes the entry without the link', r2('{{Infobox drug|excretion=Renal}}'),
     '{{Infobox drug|excretion=کلیوی}}');
  eq('a ref after a linked value is kept', r2('{{Infobox drug|excretion=[[Kidney|Renal]]<ref>x</ref>}}'),
     '{{Infobox drug|excretion=[[کلیه|کلیوی]]<ref>x</ref>}}');
  eq('a linked value whose entry has no link stays (the link is not dropped)',
     r2('{{Infobox drug|legal_status=[[Controlled Substances Act|Unscheduled]]}}'),
     '{{Infobox drug|legal_status=[[Controlled Substances Act|Unscheduled]]}}');
  eq('two links stay', r2('{{Infobox drug|excretion=[[Kidney|Renal]], [[Bile]]}}'),
     '{{Infobox drug|excretion=[[Kidney|Renal]], [[Bile]]}}');
  eq('link plus words stays', r2('{{Infobox drug|excretion=[[Kidney|Renal]] 60%}}'),
     '{{Infobox drug|excretion=[[Kidney|Renal]] 60%}}');
}

console.log('== officeholder placeholders ==');
{
  const D3 = parseDictionary(table([
    ['Infobox officeholder', 'predecessor#', 'Position established', 'ایجاد سمت', 'هم‌سویی'],
    ['Infobox officeholder', 'primeminister#', 'Himself', 'خودش', 'هم‌سویی'],
    ['Infobox officeholder', 'successor#', 'Vacant', 'خالی', 'هم‌سویی'],
  ]), 3);
  const r3 = (t: string) => applyPage(t, D3, (n: string) => n).text;
  eq('placeholder in a numbered family', r3('{{Infobox officeholder|predecessor2=Position established}}'),
     '{{Infobox officeholder|predecessor2=ایجاد سمت}}');
  eq('italic Himself', r3("{{Infobox officeholder|primeminister1=''Himself''}}"), '{{Infobox officeholder|primeminister1=خودش}}');
  const keep = (what: string, t: string) => eq(what, r3(t), t);
  keep('Himself with a qualifier stays (نیکوشور دان)', "{{Infobox officeholder|predecessor4=''Himself'' (as president of [[Save Bucharest Union|USB]])}}");
  keep('a name with (interim) stays', '{{Infobox officeholder|successor4=[[Elek Levente]] (interim)}}');
  keep('an office title stays', '{{Infobox officeholder|office4=President of the [[Save Romania Union]]}}');
  keep('a name stays', '{{Infobox officeholder|successor1=John Smith}}');
  keep('Vacant in a parameter not on the list stays', '{{Infobox officeholder|office1=Vacant}}');
}

console.log('== helpers ==');
{
  eq('titleLabel strips a disambiguator', titleLabel('مرکوری (سیاره)'), 'مرکوری');
  eq('titleLabel keeps inner parentheses', titleLabel('الف (ب) ج'), 'الف (ب) ج');
  eq('core keeps refs out', core('Vulnerable<ref>x</ref>\n')?.body, 'Vulnerable');
  eq('core refuses a template', core('{{x}}'), null);
}

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) process.exit(1);
