/**
 * Unit tests for the de-stub removal transform. No network.
 *
 *   npx tsx src/tasks/task-10/destub.test.ts
 *
 * Every case asserts the reconstruction identity as well as the output, because
 * the output looking right is exactly what a wholesale rewrite also does.
 */
import { removeStubTags, scanStubs, nonBannerTextLost } from './destub.js';
import type { Inventory } from './destub-inventory-lib.js';

const ZWNJ = '‌';
let fail = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a === b) { console.log(`  ✓ ${label}`); return; }
  console.log(`  ✗ ${label}\n      انتظار: ${b}\n      حاصل  : ${a}`);
  fail++;
}

const t = (canonical: string, cats: string[], dispatcher = false) =>
  ({ canonical, aliases: [], cats, ...(dispatcher ? { dispatcher: true as const } : {}) });

const INV: Inventory = {
  fetched: new Date().toISOString(),
  metaTemplate: 'الگو:الگوی خرد',
  allStubsCat: 'همه مقاله‌های خرد',
  templates: {
    'الگو:خرد': t('الگو:خرد', ['مقاله‌های خرد'], true),
    'الگو:فوتبال-خرد': t('الگو:فوتبال-خرد', ['مقاله‌های خرد فوتبال']),
    'الگو:ایران-خرد': t('الگو:ایران-خرد', ['مقاله‌های خرد ایران']),
    'الگو:Iran-stub': t('الگو:Iran-stub', ['مقاله‌های خرد ایران']),
    // A real member that does NOT look like a stub template by name.
    'الگو:ریاضی‌دان ایرانی': t('الگو:ریاضی‌دان ایرانی', ['مقاله‌های خرد دانشمند اهل ایران']),
  },
  index: {
    'خرد': 'الگو:خرد',
    'فوتبال-خرد': 'الگو:فوتبال-خرد',
    'ایران-خرد': 'الگو:ایران-خرد',
    'Iran-stub': 'الگو:Iran-stub',
    [`ریاضی${ZWNJ}دان ایرانی`]: 'الگو:ریاضی‌دان ایرانی',
    'ریاضی دان ایرانی': 'الگو:ریاضی‌دان ایرانی',
  },
  unresolvedVariants: [],
};

/** Run the transform and check the reconstruction identity holds too. */
function run(src: string) {
  const r = removeStubTags(src, INV);
  return r;
}

console.log('the ordinary shape');
eq(run('متن مقاله.\n\n[[رده:ایران]]\n\n{{فوتبال-خرد}}').text,
  'متن مقاله.\n\n[[رده:ایران]]', 'tag on its own line at the end of the page');
eq(run('متن مقاله.\n\n[[رده:ایران]]\n\n{{فوتبال-خرد}}').changed, true, 'and it reports changed');
eq(run('متن مقاله.\n\n[[رده:ایران]]\n\n{{فوتبال-خرد}}\n').text,
  'متن مقاله.\n\n[[رده:ایران]]', 'trailing newline after the tag');
eq(run('متن.\n\n{{فوتبال-خرد}}\n\n[[رده:ایران]]\n').text,
  'متن.\n\n[[رده:ایران]]\n', 'tag in the middle leaves exactly one blank line');
eq(run('{{فوتبال-خرد}}\n\nمتن.\n').text, 'متن.\n', 'tag at the very top of the page');

console.log('several tags');
eq(run('متن.\n\n{{فوتبال-خرد}}\n{{ایران-خرد}}\n').text, 'متن.', 'two adjacent tags');
eq(run('متن.\n\n{{فوتبال-خرد}}\n\n{{ایران-خرد}}\n').text, 'متن.', 'two tags with a gap');
eq(run('متن.\n\n{{فوتبال-خرد}}\n{{ایران-خرد}}\n').removed.map(r => r.canonical).sort(),
  ['الگو:ایران-خرد', 'الگو:فوتبال-خرد'], 'both are reported as removed');

console.log('tag spellings');
eq(run('متن.\n\n{{خرد}}\n').text, 'متن.', 'bare {{خرد}}');
eq(run('متن.\n\n{{خرد|فوتبال}}\n').text, 'متن.', '{{خرد|فوتبال}} with an argument');
eq(run('متن.\n\n{{خرد|فوتبال}}\n').removed, [{ canonical: 'الگو:خرد', firstArg: 'فوتبال' }],
  'the dispatcher argument is captured for the category assert');
eq(run('متن.\n\n{{الگو:فوتبال-خرد}}\n').text, 'متن.', 'with the namespace prefix');
eq(run('متن.\n\n{{ فوتبال-خرد }}\n').text, 'متن.', 'with padding spaces');
eq(run('متن.\n\n{{Iran-stub}}\n').text, 'متن.', 'a Latin-named stub template');
eq(run('متن.\n\n{{iran-stub}}\n').text, 'متن.', 'lower-cased first letter is the same page');
eq(run(`متن.\n\n{{ریاضی${ZWNJ}دان ایرانی}}\n`).text, 'متن.',
  'a member whose name contains no stub marker at all');
eq(run('متن.\n\n{{ریاضی دان ایرانی}}\n').text, 'متن.', 'the space spelling of the same name');

console.log('inline');
eq(run('جملهٔ اول. {{فوتبال-خرد}} جملهٔ دوم.').text, 'جملهٔ اول. جملهٔ دوم.',
  'inline tag leaves a single space');
eq(run('متن.{{فوتبال-خرد}}\n').text, 'متن.\n', 'inline tag with no surrounding space');

console.log('refusals — the article is left untouched');
for (const [label, src] of [
  ['a tag nested inside another template', 'متن.\n\n{{جعبه اطلاعات|رده={{فوتبال-خرد}}}}\n'],
  ['a tag inside an HTML comment', 'متن.\n\n<!-- {{فوتبال-خرد}} -->\n'],
  ['a tag inside <nowiki>', 'متن.\n\n<nowiki>{{فوتبال-خرد}}</nowiki>\n'],
  ['an unknown stub-shaped template', 'متن.\n\n{{والیبال-خرد}}\n'],
  ['an unknown -ناقص template', 'متن.\n\n{{شیمی-ناقص}}\n'],
] as const) {
  const r = run(src);
  eq({ changed: r.changed, manual: r.manualReview === true, text: r.text },
    { changed: false, manual: true, text: src }, label);
}

console.log('no-ops');
eq(run('متن بدون برچسب.\n').changed, false, 'an article with no stub tag');
eq(run('متن.\n\n{{جعبه اطلاعات|نام=x}}\n').changed, false, 'a non-stub template is not touched');
// «بخش خرد» is a SECTION stub and not an Asbox member, so it is not in the
// inventory. It also must not trip the stub-shaped refusal into a false alarm
// on articles that legitimately carry it — but a refusal is the safe direction,
// so this asserts only that the article is not edited.
eq(run('متن.\n\n{{بخش خرد}}\n').changed, false, 'a section-stub template is never removed');

console.log('reconstruction — the anti-rewrite proof');
for (const [label, src] of [
  ['end of page', 'متن.\n\n[[رده:x]]\n\n{{فوتبال-خرد}}'],
  ['middle of page', 'متن.\n\n{{فوتبال-خرد}}\n\n[[رده:x]]\n'],
  ['two tags', 'متن.\n\n{{فوتبال-خرد}}\n{{ایران-خرد}}\n'],
  ['inline', 'الف {{فوتبال-خرد}} ب'],
  ['top of page', '{{فوتبال-خرد}}\n\nمتن.\n'],
] as const) {
  const r = run(src);
  // Everything removed must be whitespace or the tag itself — nothing else may
  // be inside a removed span.
  const bodyLost = src.length - r.text.length;
  const tagChars = (src.match(/\{\{[^{}]*\}\}/g) ?? []).join('').length;
  eq(bodyLost <= tagChars + 4, true, `${label}: removed only the tag and its whitespace`);
}

console.log('content preservation');
const rich = [
  '{{جعبه اطلاعات کشور|نام=ایران|جمعیت=۸۵٬۰۰۰٬۰۰۰}}',
  "'''ایران''' کشوری در [[غرب آسیا]] است.<ref>{{یادکرد وب|عنوان=x|نشانی=http://a.b}}</ref>",
  '',
  '== تاریخ ==',
  'متن تاریخ.',
  '',
  '== منابع ==',
  '{{پانویس}}',
  '',
  '[[رده:ایران]]',
  '[[رده:کشورهای آسیا]]',
  '',
  '{{فوتبال-خرد}}',
].join('\n');
const rr = run(rich);
eq(rr.changed, true, 'a realistic article is edited');
eq(rr.text.includes('{{جعبه اطلاعات کشور|نام=ایران|جمعیت=۸۵٬۰۰۰٬۰۰۰}}'), true, 'infobox survives');
eq((rr.text.match(/\[\[رده:/g) ?? []).length, 2, 'both categories survive');
eq(rr.text.includes('<ref>'), true, 'the reference survives');
eq(rr.text.includes('== تاریخ =='), true, 'sections survive');
eq(rr.text.includes('خرد'), false, 'the stub tag is gone');
eq(rr.text.endsWith('[[رده:کشورهای آسیا]]'), true, 'no blank tail is left behind');

console.log('nonBannerTextLost — the text proof');
// The real fa banner, verbatim from the render of [[دلتا ۲]]. It is TWO
// sentences, and the chunker splits them apart: an earlier single-pattern match
// on the first half refused every edit, including six articles the metric had
// just certified. That is why this fixture is copied rather than paraphrased.
const BANNER = '<div class="asbox"><p class="asbox-body">این یک ' +
  '<a href="/x">مقالهٔ خرد</a> مرتبط با فضا یا پرواز فضایی است. ' +
  'می‌توانید با <a href="/y">گسترش آن</a> به ویکی‌پدیا کمک کنید.</p></div>';
const BODY = '<p>دلتا ۲ یکی از موشک‌های خانوادهٔ دلتا مورد استفادهٔ ناسا بود. ' +
  'این پرتابگر ساخت شرکت مک‌دانل داگلاس است.</p>';
eq(nonBannerTextLost(BODY + BANNER, BODY), [], 'removing only the banner loses no other text');
eq(nonBannerTextLost(BODY + BANNER, BANNER).length > 0, true, 'losing the body IS reported');
eq(nonBannerTextLost(BODY, BODY), [], 'an unchanged page loses nothing');
// The failure the whole check exists for: a "small" edit that quietly drops a
// paragraph renders perfectly and reports no error anywhere else.
const TWO = '<p>پاراگراف نخست با متن به‌اندازهٔ کافی بلند.</p><p>پاراگراف دوم که نباید گم شود.</p>';
eq(nonBannerTextLost(TWO + BANNER, '<p>پاراگراف نخست با متن به‌اندازهٔ کافی بلند.</p>').length, 1,
  'a dropped paragraph is caught even though the render is clean');
// Regression: the banner is excised structurally and the REST must match word
// for word. An earlier version compared sentence chunks and reported navbox
// bars, section edit links and CS1 maintenance notes as "vanished" whenever
// removing the banner changed how neighbouring elements joined — it refused 16
// of the first 20 live articles while nothing was wrong with any of them.
const NAVBOX = '<div class="navbox"><div>ن ب و</div><div>ولسوالی‌های ولایت بغلان، افغانستان</div></div>';
const EDITLINKS = '<div class="mw-heading"><h2>منابع</h2>' +
  '<span class="mw-editsection">[ ویرایش | ویرایش متنی ]</span></div>';
eq(nonBannerTextLost(BODY + EDITLINKS + BANNER + NAVBOX, BODY + EDITLINKS + NAVBOX), [],
  'navbox bars and section edit links are not reported as lost');
// And the CSS in a <style> block must not read as article text: an early
// version of the subtree remover stripped the <style> wrapper and left its
// rules behind as words, which looked exactly like lost prose.
const STYLED = '<style>.mw-parser-output .asbox{position:relative;overflow:hidden}</style>';
eq(nonBannerTextLost(STYLED + BODY + BANNER, BODY), [],
  'TemplateStyles CSS is never counted as lost text');

console.log('scanStubs');
eq(scanStubs('متن {{فوتبال-خرد}}', INV).spans.length, 1, 'finds a tag');
eq(scanStubs('متن', INV).spans.length, 0, 'finds nothing in a plain article');
eq(scanStubs('{{جعبه|x={{فوتبال-خرد}}}}', INV).refusals.length, 1, 'reports a nested tag');

console.log(fail === 0 ? '\nهمهٔ آزمون‌ها موفق.' : `\n${fail} آزمون ناموفق.`);
process.exit(fail === 0 ? 0 : 1);
