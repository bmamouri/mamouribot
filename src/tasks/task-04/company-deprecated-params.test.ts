/**
 * Behaviour tests for the Task-4 transform (company-deprecated-params).
 *   npx tsx src/tasks/task-04/company-deprecated-params.test.ts
 *
 * Assertions are property-based and format-tolerant: `flat()` collapses the
 * canonical MULTI-LINE output ({{name\n| key = value\n}}) back to a compact
 * `{{name|key=value}}` form so structural checks stay robust to the one-param-
 * per-line formatting and to ZWNJ in the Persian tokens. Covers: substantive
 * deprecated renames, cosmetic English-key + invocation normalisation that only
 * RIDES ALONG with a substantive edit (never cosmetic-only), dedup/merge, clash
 * handling, the key-people fold, and the multi-line infobox formatting itself.
 */
import { fixCompanyParams, findInfoboxSpans } from './company-deprecated-params.js';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) pass++;
  else { fail++; console.log(`FAIL ${name}${detail ? '\n  ' + detail : ''}`); }
}
const run = (s: string) => fixCompanyParams(s);
/** Collapse the multi-line output to a compact `{{name|key=value|…}}` for structural checks. */
const flat = (s: string) => s.replace(/\s*\n\s*/g, '').replace(/\s*=\s*/g, '=').replace(/\s*\|\s*/g, '|');

// 1) substantive deprecated rename + invocation normalisation ride along
{
  const r = run('{{Infobox company\n| homepage = a\n}}');
  check('1 deprecated homepage triggers edit', r.changed);
  check('1 homepage→وبگاه', flat(r.text).includes('وبگاه=a') && !r.text.includes('homepage'), r.text);
  check('1 invocation → جعبه اطلاعات شرکت', r.text.includes('{{جعبه اطلاعات شرکت') && !r.text.includes('Infobox company'), r.text);
}

// 2) English keys normalised only alongside a substantive change
{
  const r = run('{{جعبه اطلاعات شرکت|homepage=a|name=X|revenue=۵|type=ب}}');
  check('2 changed', r.changed);
  check('2 english keys gone', !/[|]\s*(homepage|name|revenue|type)\s*=/.test(r.text), r.text);
  check('2 persian keys present', flat(r.text).includes('نام=X') && flat(r.text).includes('درآمد=۵') && flat(r.text).includes('نوع=ب'), r.text);
}

// 3) NO cosmetic-only edit: English keys/invocation but no deprecated param → untouched
{
  const src = '{{Infobox company|name=X|revenue=۵}}';
  const r = run(src);
  check('3 cosmetic-only NOT edited', !r.changed && r.text === src, `changed=${r.changed}`);
}

// 4) bare نماد → نشان‌واره (substantive), not the old لوگو target
{
  const r = run('{{جعبه اطلاعات شرکت|نماد=x.svg}}');
  check('4 changed', r.changed);
  check('4 نماد→نشان‌واره', flat(r.text).includes('نشان‌واره=x.svg'), r.text);
}

// 5) a like-named param in ANOTHER template is not touched
{
  const r = run('{{جعبه اطلاعات مکان|موقعیت=شمال}}\n{{Infobox company|موقعیت=تهران}}');
  check('5 other template untouched', r.text.includes('{{جعبه اطلاعات مکان|موقعیت=شمال}}'), r.text);
  check('5 company موقعیت→دفتر مرکزی', flat(r.text).includes('دفتر مرکزی=تهران'), r.text);
  check('5 company invocation persianised', flat(r.text).includes('{{جعبه اطلاعات شرکت|دفتر مرکزی=تهران}}'), r.text);
}

// 6) substantive value clash → resolved by precedence (keep the historically-shown value)
{
  // دفتر مرکزی (rank 4) beats موقعیت (rank 5): keep «الف», drop the shadowed «ب»
  const r = run('{{جعبه اطلاعات شرکت|homepage=z|دفتر مرکزی=الف|موقعیت=ب}}');
  check('6 clash resolved (winner kept)', r.changed && flat(r.text).includes('دفتر مرکزی=الف'), r.text);
  check('6 shadowed value dropped', !r.text.includes('=ب') && !/موقعیت/.test(r.text), r.text);
}

// 6b) higher-precedence LEGACY alias wins over موقعیت even when both are legacy
{
  // شعبهٔ مرکزی (rank 2) beats موقعیت (rank 5) → keep «تهران، ایران», one HQ line only
  const r = run('{{جعبه اطلاعات شرکت|homepage=z|شعبهٔ مرکزی=تهران، ایران|موقعیت=تهران}}');
  check('6b higher-precedence legacy kept', r.changed && flat(r.text).includes('دفتر مرکزی=تهران، ایران'), r.text);
  check('6b only one HQ line', (r.text.match(/دفتر مرکزی/g) || []).length === 1 && !/موقعیت/.test(r.text), r.text);
}

// 6c) unknown-precedence clash → still deferred (manualReview) — رتبه has no precedence chain
{
  const r = run('{{جعبه اطلاعات شرکت|رتبه‌بندی=۱|rating=۲}}'); // both → رتبه, no rank
  check('6c unknown-precedence clash deferred', !r.changed && !!r.manualReview, `changed=${r.changed} manual=${r.manualReview}`);
}

// 7) cosmetic clash leaves that field alone but still does the substantive fix
{
  const r = run('{{جعبه اطلاعات شرکت|homepage=z|name=A|نام=B}}');
  check('7 changed (substantive homepage)', r.changed);
  check('7 homepage fixed', flat(r.text).includes('وبگاه=z'), r.text);
  check('7 cosmetic clash: both name & نام kept', flat(r.text).includes('name=A') && flat(r.text).includes('نام=B'), r.text);
}

// 8) empty duplicate merged (deprecated + empty canonical)
{
  const r = run('{{جعبه اطلاعات شرکت\n| دفتر مرکزی = \n| شعبهٔ مرکزی = تهران\n}}');
  check('8 merged to one filled key', r.changed && flat(r.text).includes('دفتر مرکزی=تهران') && !/شعبهٔ مرکزی/.test(r.text), r.text);
}

// 9) English↔Persian empty-dup merges (name empty + نام filled etc.)
{
  const r = run('{{جعبه اطلاعات شرکت|homepage=z|name=|نام=X}}');
  check('9 empty english dup merged', r.changed && flat(r.text).includes('نام=X') && !/[|]\s*name\s*=/.test(r.text), r.text);
}

// 10) unresolved-only param → no edit («شکل‌بندی بدنه» has no modern field)
{
  const src = '{{جعبه اطلاعات شرکت|شکل‌بندی بدنه=x}}';
  const r = run(src);
  check('10 unresolved-only not edited', !r.changed && r.text === src);
}

// 11) mixed: substantive + unresolved (unresolved left, noted)
{
  const r = run('{{Infobox company|homepage=a|شکل‌بندی بدنه=x}}');
  check('11 changed', r.changed && flat(r.text).includes('وبگاه=a') && flat(r.text).includes('شکل‌بندی بدنه=x'), r.text);
  check('11 note mentions unresolved', !!r.note && r.note.includes('حل‌نشده'), r.note);
}

// 12) no infobox → no-op
{
  const src = 'یک مقاله بدون جعبه';
  const r = run(src);
  check('12 no-op', !r.changed && r.text === src);
}

// 13) positional param preserved, value with nested template/link untouched
{
  const r = run('{{Infobox company|بله|شعبهٔ مرکزی={{پرچم|ایران}} [[تهران]]|بنیانگذار=[[الف|ب]]}}');
  check('13 positional kept', flat(r.text).includes('|بله|'), r.text);
  check('13 nested value intact', r.text.includes('{{پرچم|ایران}} [[تهران]]') && r.text.includes('[[الف|ب]]'), r.text);
  check('13 keys renamed', flat(r.text).includes('دفتر مرکزی=') && flat(r.text).includes('بنیان‌گذار=[[الف'), r.text);
}

// 14) subsidiaries: deprecated …تابعه AND english subsidiaries both → شرکت‌های تابع (never …تابعه)
{
  const r1 = run('{{جعبه اطلاعات شرکت|شرکت‌های تابعه=الف|homepage=b}}');
  check('14a …تابعه → شرکت‌های تابع', r1.changed && flat(r1.text).includes('شرکت‌های تابع=الف') && !r1.text.includes('تابعه'), r1.text);
  const r2 = run('{{جعبه اطلاعات شرکت|subsidiaries=الف|homepage=b}}');
  check('14b english subsidiaries → شرکت‌های تابع', r2.changed && flat(r2.text).includes('شرکت‌های تابع=الف'), r2.text);
}

// 15) key renamed AND emitted in the canonical (normalised-whitespace) multi-line form
{
  const r = run('{{جعبه اطلاعات شرکت\n| تعداد کارکنان    = ۱۰۰\n}}');
  check('15 renamed + normalised', r.text.includes('| شمار کارکنان = ۱۰۰') && !/تعداد کارکنان/.test(r.text), JSON.stringify(r.text));
}

// 16) pre-existing duplicate we didn't cause is left alone
{
  const r = run('{{جعبه اطلاعات شرکت|نوع=الف|نوع=ب|homepage=z}}');
  check('16 pre-existing dup untouched', flat(r.text).includes('نوع=الف|نوع=ب'), r.text);
  check('16 substantive still applied', flat(r.text).includes('وبگاه=z'), r.text);
}

// 17) span finder still locates each invocation
check('17 span count', findInfoboxSpans('x{{جعبه اطلاعات شرکت|a=1}}y{{Infobox bank|b=2}}z').length === 2);

// 18) legacy DROPPED English aliases (unknown params) now translated — substantive
{
  const r = run('{{جعبه اطلاعات شرکت|foundation=۱۹۹۰|location_city=تهران|subsid=الف|dissolved=۲۰۰۰|company_type=خصوصی}}');
  check('18 changed', r.changed);
  check('18 foundation→بنیان‌گذاری', flat(r.text).includes('بنیان‌گذاری=۱۹۹۰'), r.text);
  check('18 location_city→شهر دفتر مرکزی', flat(r.text).includes('شهر دفتر مرکزی=تهران'), r.text);
  check('18 subsid→شرکت‌های تابع', flat(r.text).includes('شرکت‌های تابع=الف'), r.text);
  check('18 dissolved→انحلال', flat(r.text).includes('انحلال=۲۰۰۰'), r.text);
  check('18 company_type→نوع', flat(r.text).includes('نوع=خصوصی'), r.text);
  check('18 no english left', !/[|]\s*(foundation|location_city|subsid|dissolved|company_type)\s*=/.test(r.text), r.text);
}

// 19) «نام‌های تجاری»→برندها and «توضیح»/caption→توضیح نشان‌واره (history-resolved)
{
  const r = run('{{جعبه اطلاعات شرکت|homepage=z|نام‌های تجاری=الف|caption=ب}}');
  check('19 برندها', flat(r.text).includes('برندها=الف'), r.text);
  check('19 caption→توضیح نشان‌واره', flat(r.text).includes('توضیح نشان‌واره=ب'), r.text);
}

// 20) key-people FOLD: CEO/deputy/spokesperson merge into «افراد کلیدی» with role labels
{
  const r = run('{{جعبه اطلاعات شرکت|homepage=z|مدیر عامل=رینس|قائم مقام=دوما|سخنگو=آنا}}');
  check('20 changed', r.changed);
  check('20 folded key present', /افراد کلیدی\s*=\s*رینس \(مدیرعامل\)\{\{سخ\}\}دوما \(قائم‌مقام\)\{\{سخ\}\}آنا \(سخنگو\)/.test(r.text), r.text);
  check('20 no standalone role keys', !/[|]\s*(مدیر عامل|قائم مقام|سخنگو)\s*=/.test(r.text), r.text);
}

// 21) fold merges existing «افراد کلیدی» first, then role-labelled sources
{
  const r = run('{{جعبه اطلاعات شرکت|homepage=z|افراد کلیدی=هیئت|مدیر عامل=رینس}}');
  check('21 existing kept first', /افراد کلیدی\s*=\s*هیئت\{\{سخ\}\}رینس \(مدیرعامل\)/.test(r.text), r.text);
}

// 22) chairman gets a role label too (رئیس هیئت مدیره → افراد کلیدی)
{
  const r = run('{{جعبه اطلاعات شرکت|homepage=z|رئیس هیات مدیره=آلمنی}}');
  check('22 chairman folded w/ role', /افراد کلیدی\s*=\s*آلمنی \(رئیس هیئت‌مدیره\)/.test(r.text), r.text);
}

// 23) lone canonical «افراد کلیدی» is NOT folded (kept as-is, just reformatted)
{
  const r = run('{{جعبه اطلاعات شرکت|homepage=z|افراد کلیدی=کسی}}');
  check('23 lone key-people untouched', flat(r.text).includes('افراد کلیدی=کسی') && flat(r.text).includes('وبگاه=z'), r.text);
}

// 24) class-C no-field legacy keys are LEFT untouched (شعار, تعداد کاربران)
{
  const r = run('{{جعبه اطلاعات شرکت|homepage=z|شعار=بهترین|تعداد کاربران=۱۰۰}}');
  check('24 شعار left', flat(r.text).includes('شعار=بهترین'), r.text);
  check('24 تعداد کاربران left', flat(r.text).includes('تعداد کاربران=۱۰۰'), r.text);
}

// 25) canonical multi-line FORMAT: {{name on its own line, one param per «| » line, }} on its own line
{
  const r = run('{{Infobox company|homepage=a|name=X|type=ب|revenue=۵}}');
  const lines = r.text.trim().split('\n');
  check('25 first line is {{name', lines[0] === '{{جعبه اطلاعات شرکت', JSON.stringify(lines));
  check('25 last line is }}', lines[lines.length - 1] === '}}', JSON.stringify(lines));
  check('25 every middle line starts with "| "', lines.slice(1, -1).every(l => l.startsWith('| ')), JSON.stringify(lines));
  check('25 named params are "| key = value"', /^\| نام = X$/m.test(r.text) && /^\| درآمد = ۵$/m.test(r.text), r.text);
}

// 26) reformatting is idempotent-safe: an already-formatted+renamed box re-runs to no change
{
  const once = run('{{Infobox company|homepage=a|name=X}}').text;
  const twice = run(once);
  check('26 no re-edit of formatted+done box', !twice.changed && twice.text === once, twice.text);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
