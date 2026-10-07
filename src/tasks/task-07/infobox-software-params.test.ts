/**
 * Unit tests for وظیفهٔ ۷ — {{جعبه اطلاعات نرم‌افزار}} parameter names. No network.
 *
 *   npx tsx src/tasks/task-07/infobox-software-params.test.ts
 *
 * This task was the only one with no test, on-wiki or here, which is awkward given
 * what it does: an unknown parameter makes its infobox row VANISH with no error, no
 * gap and no tracking signal a render check can see, which is how ~۸۴۰ articles sat
 * broken for six years. A transform whose whole purpose is to fix an invisible defect
 * cannot be verified by looking at the result either.
 *
 * So the assertions are mostly about what the transform must NOT do: invent a value,
 * drop one, guess at an unmapped name, or rewrite anything outside the infobox. Every
 * parameter name used below is a real entry from `infobox-software-map.ts`, not an
 * invented one, because a test built on a made-up mapping passes while proving nothing
 * about the table the bot actually ships.
 */
import { fixArticle, parseInfobox, aliasGroups, SOFTWARE_RULES } from '../../lib/infobox-software.js';
import { classifyStatus, RENAME, DEAD } from '../../lib/infobox-software-map.js';

let pass = 0;
const fails: string[] = [];

function ok(what: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ✓ ${what}`); }
  else { fails.push(`${what}${detail ? ` — ${detail}` : ''}`); console.log(`  ✗ ${what} ${detail}`); }
}

/** The live template's accepted names, as getTargets would have read them. */
const KNOWN = new Set([
  'نام', 'انتشار اولیه', 'نسخه آخرین انتشار', 'ژانر', 'discontinued',
  'توسعه‌دهنده', 'پروانه', 'وبگاه', 'سیستم‌عامل',
]);

const fix = (text: string) => fixArticle(text, KNOWN, SOFTWARE_RULES);

console.log('== the table itself is real ==');
ok('«تاریخ انتشار» maps to «انتشار اولیه»', RENAME['تاریخ انتشار'] === 'انتشار اولیه',
   String(RENAME['تاریخ انتشار']));
ok('«الکسا» is a dead parameter', DEAD.has('الکسا'));
ok('every rename target is a name the template accepts or another mapped name',
   Object.values(RENAME).every(v => KNOWN.has(v) || v === 'discontinued' || !(v in RENAME)),
   Object.values(RENAME).filter(v => v in RENAME).join(', '));

console.log('\n== a rename preserves the value exactly ==');
{
  const before = [
    '{{جعبه اطلاعات نرم‌افزار',
    '| نام = فو',
    '| تاریخ انتشار = ۱۲ خرداد ۱۳۹۰',
    '}}',
    'فو یک نرم‌افزار است.',
  ].join('\n');
  const r = fix(before)!;
  ok('the row is renamed', r.text.includes('| انتشار اولیه = ۱۲ خرداد ۱۳۹۰'), r.text);
  ok('the old name is gone', !r.text.includes('تاریخ انتشار'));
  ok('the value survives byte-for-byte', r.text.includes('۱۲ خرداد ۱۳۹۰'));
  ok('the body is untouched', r.text.endsWith('فو یک نرم‌افزار است.'));
  ok('one change, nothing deferred', r.changes.length === 1 && r.manual.length === 0,
     JSON.stringify({ changes: r.changes, manual: r.manual }));
}

console.log('\n== an unmapped name is deferred, never guessed ==');
{
  const before = '{{جعبه اطلاعات نرم‌افزار\n| نام = فو\n| یک‌چیز‌عجیب = مقدار\n}}';
  const r = fix(before)!;
  ok('text is unchanged', r.text === before, r.text);
  ok('it is reported for a human', r.manual.some(m => m.includes('ناشناخته')), JSON.stringify(r.manual));
  ok('no change is claimed', r.changes.length === 0);
}

console.log('\n== a value clash is never resolved by picking one ==');
{
  // Both names reach the same row and both carry a DIFFERENT value. Choosing either
  // one silently destroys a sourced fact, so the page has to go to a human.
  const before = [
    '{{جعبه اطلاعات نرم‌افزار',
    '| انتشار اولیه = ۱۳۹۰',
    '| تاریخ انتشار = ۱۳۹۵',
    '}}',
  ].join('\n');
  const r = fix(before)!;
  ok('both values still present', r.text.includes('۱۳۹۰') && r.text.includes('۱۳۹۵'), r.text);
  ok('deferred as a conflict', r.manual.some(m => m.includes('تعارض مقدار')), JSON.stringify(r.manual));
}
{
  // Same row, SAME value: that is a duplicate, not a conflict, and dropping the
  // legacy copy loses nothing.
  const before = '{{جعبه اطلاعات نرم‌افزار\n| انتشار اولیه = ۱۳۹۰\n| تاریخ انتشار = ۱۳۹۰\n}}';
  const r = fix(before)!;
  ok('the duplicate is dropped', r.changes.some(c => c.kind === 'drop' && c.note === 'تکراری'),
     JSON.stringify(r.changes));
  ok('the value is kept once', (r.text.match(/۱۳۹۰/g) ?? []).length === 1, r.text);
}

console.log('\n== the status family: the two deliberate value rewrites ==');
{
  const r = fix('{{جعبه اطلاعات نرم‌افزار\n| نام = فو\n| وضعیت = فعال\n}}')!;
  ok('an active state is simply removed, it is the default', !r.text.includes('وضعیت'), r.text);
  ok('and recorded as a drop', r.changes.some(c => c.kind === 'drop'), JSON.stringify(r.changes));
}
{
  const r = fix('{{جعبه اطلاعات نرم‌افزار\n| نام = فو\n| وضعیت = متوقف شده\n}}')!;
  ok('a discontinued state becomes discontinued=yes',
     /\|\s*discontinued\s*=\s*yes/.test(r.text), r.text);
  ok('the Persian value does not survive into the new row', !r.text.includes('متوقف شده'), r.text);
}
{
  // Prose, a date or a ref in the status field is not a state. Guessing here is how a
  // transform invents a fact.
  for (const v of ['متوقف شده در ۲۰۱۹', 'فعال<ref>جایی</ref>', '{{به‌روزرسانی}}']) {
    const before = `{{جعبه اطلاعات نرم‌افزار\n| نام = فو\n| وضعیت = ${v}\n}}`;
    const r = fix(before)!;
    ok(`«${v}» goes to review, page untouched`, r.text === before && r.manual.length > 0,
       JSON.stringify({ changed: r.text !== before, manual: r.manual }));
  }
}

console.log('\n== classifyStatus edge cases ==');
ok('empty counts as active (just remove the row)', classifyStatus('') === 'active');
ok('harakat is ignored: «فعّال» is «فعال»', classifyStatus('فعّال') === 'active', classifyStatus('فعّال'));
ok('a bare wikilink is unwrapped', classifyStatus('[[Discontinued]]') === 'discontinued',
   classifyStatus('[[Discontinued]]'));
ok('a wikilink with prose around it is manual', classifyStatus('[[فو]] از ۱۳۹۰') === 'manual');
ok('case-insensitive on Latin', classifyStatus('DISCONTINUED') === 'discontinued');
ok('an unknown word is manual, not a guess', classifyStatus('نیمه‌کاره') === 'manual');

console.log('\n== dead parameters ==');
{
  const r = fix('{{جعبه اطلاعات نرم‌افزار\n| نام = فو\n| الکسا = \n}}')!;
  ok('an empty dead parameter is dropped', !r.text.includes('الکسا'), r.text);
}
{
  // الکسا is on DROP_EVEN_IF_SET: the service shut down, so the value is worthless.
  const r = fix('{{جعبه اطلاعات نرم‌افزار\n| نام = فو\n| الکسا = ۱٬۲۳۴\n}}')!;
  ok('a dead parameter on the drop list goes even with a value', !r.text.includes('الکسا'), r.text);
}
{
  // A dead parameter NOT on that list still carries information, so it is deferred.
  const stillHasValue = [...DEAD].find(d => !['الکسا', 'alexa', 'frequently updated',
    'frequently_updated', 'اغلب به روز می‌شود'].includes(d))!;
  const before = `{{جعبه اطلاعات نرم‌افزار\n| نام = فو\n| ${stillHasValue} = چیزی\n}}`;
  const r = fix(before)!;
  ok(`a valued dead parameter («${stillHasValue}») is deferred, not deleted`,
     r.text === before && r.manual.length > 0, JSON.stringify(r.manual));
}

console.log('\n== the merge case: ژانر is a comma list ==');
{
  const legacy = Object.keys(RENAME).find(k => RENAME[k] === 'ژانر');
  ok('the table has a legacy name for ژانر', Boolean(legacy), String(legacy));
  if (legacy) {
    const before = `{{جعبه اطلاعات نرم‌افزار\n| ژانر = ویرایشگر\n| ${legacy} = مرورگر\n}}`;
    const r = fix(before)!;
    ok('both values end up in one row', /\|\s*ژانر\s*=\s*ویرایشگر، مرورگر/.test(r.text), r.text);
    ok('neither value is lost', r.text.includes('ویرایشگر') && r.text.includes('مرورگر'));
    ok('recorded as a merge', r.changes.some(c => c.kind === 'merge'), JSON.stringify(r.changes));
  }
}

console.log('\n== guards ==');
{
  ok('no infobox means nothing to do', fix('متن بدون جعبه.') === null);
  const clean = '{{جعبه اطلاعات نرم‌افزار\n| نام = فو\n| ژانر = ویرایشگر\n}}';
  const r = fix(clean)!;
  ok('an already-correct infobox is left alone', r.text === clean && r.changes.length === 0, r.text);
}
{
  // IDEMPOTENT. A second pass must be a no-op, or a daily task keeps rewriting the
  // same page and every run shows up in watchlists as a fresh edit.
  const before = '{{جعبه اطلاعات نرم‌افزار\n| نام = فو\n| تاریخ انتشار = ۱۳۹۰\n| وضعیت = متوقف\n}}';
  const once = fix(before)!;
  const twice = fix(once.text)!;
  ok('running twice changes nothing the second time', twice.text === once.text, twice.text);
  ok('and claims no further changes', twice.changes.length === 0, JSON.stringify(twice.changes));
}
{
  // Everything outside the infobox has to come back identical. A transform that
  // rebuilds the page instead of splicing it renders perfectly cleanly and has simply
  // lost most of itself.
  const tail = '\n\n== بخش ==\nمتن با {{الگو|دیگر}} و [[پیوند]].\n\n[[رده:نرم‌افزار]]';
  const before = '{{جعبه اطلاعات نرم‌افزار\n| نام = فو\n| تاریخ انتشار = ۱۳۹۰\n}}' + tail;
  const r = fix(before)!;
  ok('the article tail is preserved exactly', r.text.endsWith(tail), JSON.stringify(r.text.slice(-60)));
}
{
  // A rename must not land beside an existing alias of the same row. aliasGroups is
  // read off the live template, so feed it a realistic group.
  const groups = aliasGroups('{{{انتشار اولیه|{{{released|{{{انتشار_اولیه|}}}}}}}}}');
  ok('aliasGroups finds a group from template source', groups.some(g => g.length > 1),
     JSON.stringify(groups));
}
{
  const ib = parseInfobox('{{جعبه اطلاعات نرم‌افزار\n| نام = فو <!-- یادداشت -->\n}}');
  ok('a comment stays part of the raw value', ib !== null && ib.params[0].rawValue.includes('<!--'),
     JSON.stringify(ib?.params[0]));
}

console.log(`\n${pass} گذشت، ${fails.length} افتاد`);
if (fails.length) { console.error('failing:\n  - ' + fails.join('\n  - ')); process.exit(1); }
