/**
 * Offline tests for وظیفهٔ ۱۵'s rules and wikitext surgery.
 *
 * The fixture list is §11 of `docs/task-15-source-tags.md`. Nearly all of them assert a
 * REFUSAL, because that is where this task's risk lives: a wrong banner is a public
 * claim about someone's article, and §3 buys safety by declining whenever a test is not
 * clearly passed.
 */
import {
  insertionPoint, addBanner, removeStaleTag, isSectionUse, monthStamp, bannerCall,
} from './banners.js';
import { decide, hasSourceBanner, STALE_NAMES, type PageFacts } from './decide.js';
import { countRenderedRefs, errorMarkers } from './source-tags.js';
import { citationFloor, inlineCitations, sourceFeatures } from './source-detect.js';

let pass = 0;
const fails: string[] = [];
const check = (name: string, cond: boolean, detail = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else fails.push(`${name}${detail ? ': ' + detail : ''}`);
};

/** A page with nothing special about it: old, not a BLP, renders with no refs. */
const CLEAN: PageFacts = {
  renderedRefs: 0, foreignLinks: 0, isDab: false, isBlp: false, isRedirect: false,
  hasVillageInfobox: false, daysSinceEdit: 400, proseWords: 150,
  datedCategoryExists: { 'بدون منبع': true },
};
const facts = (over: Partial<PageFacts> = {}): PageFacts => ({ ...CLEAN, ...over });

const act = (text: string, title = 'آزمون', over: Partial<PageFacts> = {}) =>
  decide(text, title, facts(over));

// ---- §3.1 the happy path, and then everything that must stop it ----------------------
check('an unsourced article is tagged', act('متن ساده بدون هیچ منبعی.').act === 'add');
check('…with the right banner',
  (act('متن.') as { banner?: string }).banner === 'بدون منبع');
check('a BLP gets the BLP banner (§3.2)',
  (act('متن.', 'کسی', { isBlp: true }) as { banner?: string }).banner === 'بدون منبع زنده');

check('a disambiguation page is refused',
  act('متن.', 'الف (ابهام‌زدایی)', { isDab: true }).act === 'skip');
check('a list title is refused', act('متن.', 'فهرست آثار الف').act === 'skip');
check('a year page is refused', act('متن.', '۱۳۹۰').act === 'skip');
// Date pages in every shape the first dry run threw up. HujiBot وظیفهٔ ۷ REMOVED this
// banner from them, so adding it back would revert a decision the community made.
for (const t of ['۴ تیر', '۱۲ مرداد', '۳ ژانویه', 'سده پنجم (میلادی)', 'دهه ۱۳۸۰',
                 'هزاره اول (پیش از میلاد)', '۲۰۲۶ (میلادی)',
                 // Hijri day pages: 17 of these were tagged in the 100-edit trial.
                 '۱ محرم', '۲۷ رمضان', '۱۶ شعبان', '۵ ربیع‌الثانی', '۲۲ ذی‌القعده',
                 '۸ جمادی‌الثانی', '۱۵ صفر', '۴ شوال']) {
  check(`date page «${t}» is refused`, act('متن.', t).act === 'skip');
}
// …without catching real places that merely start with the same word.
check('«سده لنجان» is a city, not a century', act('متن.', 'سده لنجان').act === 'add');
check('«تیر» alone is not a date page', act('متن.', 'تیر (ابهام‌زدایی ندارد)').act === 'add');
check('an Iranian village is refused (decision 5)',
  act('متن.', 'روستا', { hasVillageInfobox: true }).act === 'skip');
check('a redirect is refused', act('#تغییرمسیر [[الف]]', 'الف', { isRedirect: true }).act === 'skip');
check('a page edited in the last 7 days is refused',
  act('متن.', 'الف', { daysSinceEdit: 2 }).act === 'skip');
check('an in-use page is refused', act('{{در دست ویرایش}}\nمتن.').act === 'skip');
check('a page nominated for deletion is refused', act('{{نظرخواهی برای حذف}}\nمتن.').act === 'skip');

// an existing banner under ANY redirect name blocks the add
for (const name of ['بدون منبع', 'منبع', 'مدرک', 'بهبود منبع', 'Unreferenced']) {
  check(`an existing «${name}» blocks a second banner`,
    act(`{{${name}}}\nمتن.`).act !== 'add');
}

// ---- the render is the second opinion (§3.0) -----------------------------------------
check('wikitext says unsourced but the render shows refs → report, not tag',
  act('متن.', 'الف', { renderedRefs: 3 }).act === 'report');
check('wikitext says unsourced but the render has an external link → report',
  act('متن.', 'الف', { foreignLinks: 1 }).act === 'report');
check('a failed render never tags', act('متن.', 'الف', { renderFailed: true }).act === 'skip');

// ---- §3.3 / §3.4 narrow tiers ---------------------------------------------------------
// Real citations, not «یک»/«دو»: a three-character ref body cites nothing.
const twoRefs = 'متن.<ref>{{یادکرد کتاب|عنوان=الف|ناشر=ب}}</ref> متن.<ref>{{یادکرد وب|نشانی=https://example.com|عنوان=ج}}</ref>';
check('800 words with 2 sources gets بهبود منبع',
  (act(twoRefs, 'الف', { proseWords: 900 }) as { banner?: string }).banner === 'بهبود منبع');
check('799 words with 2 sources gets nothing',
  act(twoRefs, 'الف', { proseWords: 799 }).act !== 'add');
check('a BLP with 2 sources and 300 words gets منبع زنده',
  (act(twoRefs, 'کسی', { isBlp: true, proseWords: 350 }) as { banner?: string }).banner === 'منبع زنده');
check('a BLP with 2 sources and 299 words gets nothing',
  act(twoRefs, 'کسی', { isBlp: true, proseWords: 299 }).act !== 'add');

// ---- §3.5 report-only, confirmed with the operator ۱۲ اکتبر ۲۰۲۶ ---------------------
const oneRef = 'متن.<ref>{{یادکرد کتاب|عنوان=الف|ناشر=ب}}</ref>';
const one = act(oneRef, 'الف', { proseWords: 400 });
check('a single-source article is reported, never tagged',
  one.act === 'report' && (one as { kind?: string }).kind === 'یک منبع');

// ---- §4 placement ---------------------------------------------------------------------
const furniture =
  '{{دیگر کاربردها}}\n{{توصیف کوتاه|یک چیز}}\n{{جعبه اطلاعات شخص\n| نام = الف\n}}\nمتن.';
const placed = addBanner(furniture, 'بدون منبع', 'اکتبر ۲۰۲۶')!;
check('the banner goes below hatnote and short description',
  placed.text.indexOf('{{بدون منبع') > placed.text.indexOf('{{توصیف کوتاه'),
  placed.text.slice(0, 90));
check('…and ABOVE the infobox',
  placed.text.indexOf('{{بدون منبع') < placed.text.indexOf('{{جعبه اطلاعات'));
check('…adding exactly one line and changing nothing else',
  placed.text.replace('{{بدون منبع|تاریخ=اکتبر ۲۰۲۶}}\n', '') === furniture);
check('insertionPoint refuses an unbalanced top',
  insertionPoint('{{دیگر کاربردها\nمتن.') === -1);

const multi = '{{مشکلات متعدد|\n{{بازنویسی|تاریخ=ژوئن ۲۰۲۵}}\n{{لحن}}\n}}\nمتن.';
const merged = addBanner(multi, 'بدون منبع', null)!;
check('an existing {{مشکلات متعدد}} is merged into, not duplicated',
  merged.how === 'merged' && (merged.text.match(/مشکلات متعدد/g) ?? []).length === 1);
check('…and the new banner is a line inside it',
  /\{\{لحن\}\}\n\{\{بدون منبع\}\}\n\}\}/.test(merged.text), merged.text.slice(0, 120));
check('a page with two existing banners is reported, not given a third',
  act(multi).act === 'report');

// ---- §5 the date -----------------------------------------------------------------------
check('a date is written when the monthly category exists',
  bannerCall('بدون منبع', 'اکتبر ۲۰۲۶') === '{{بدون منبع|تاریخ=اکتبر ۲۰۲۶}}');
check('no date at all when it does not (never a bad date)',
  bannerCall('بدون منبع', null) === '{{بدون منبع}}');
check('the stamp is Persian digits',
  /^[^\d]+ [۰-۹]{4}$/.test(monthStamp(new Date('2026-10-12T00:00:00Z'))), monthStamp());

// ---- §3.9 removal ----------------------------------------------------------------------
const stale = '{{بدون منبع|تاریخ=مه ۲۰۲۰}}\nمتن.<ref>{{یادکرد کتاب|عنوان=الف}}</ref>'
  + '<ref>{{یادکرد وب|نشانی=https://example.com|عنوان=ب}}</ref>';
check('a stale tag on a now-sourced article is removed',
  act(stale, 'الف', { renderedRefs: 2 }).act === 'remove');
const removed = removeStaleTag(stale, STALE_NAMES)!;
check('…taking its trailing newline with it',
  removed.text === 'متن.<ref>{{یادکرد کتاب|عنوان=الف}}</ref>'
    + '<ref>{{یادکرد وب|نشانی=https://example.com|عنوان=ب}}</ref>', JSON.stringify(removed.text));

// ---- the citation-density floor: «هدهد», ۱۳ اکتبر ۲۰۲۶ -------------------------------
// The removal bar used to be "one real source exists", and a bullet under «منابع» counted
// as that source. «هدهد» (564 words of prose, seven bibliography bullets of which one was
// the English Wikipedia article, exactly ONE inline footnote) lost its banner under the
// summary «مقاله اکنون منبع دارد». «وسترن» was the same at 1,128 words and one footnote.
// `inlineCitations` counts only what is attached to a sentence, and never more than the
// render shows.
check('a bibliography-only page has zero inline citations',
  inlineCitations(sourceFeatures('متن.\n== منابع ==\n* {{یادکرد کتاب|عنوان=الف|ناشر=ب}}'), 0) === 0);
check('two footnotes count two',
  inlineCitations(sourceFeatures(
    'متن.<ref>{{یادکرد کتاب|عنوان=الف|ناشر=ب}}</ref><ref>{{یادکرد وب|نشانی=https://e.com|عنوان=ج}}</ref>'), 2) === 2);
check('the render caps the wikitext count',
  inlineCitations(sourceFeatures(
    'متن.<ref>{{یادکرد کتاب|عنوان=الف|ناشر=ب}}</ref><ref>{{یادکرد وب|نشانی=https://e.com|عنوان=ج}}</ref>'), 1) === 1);

check('the floor is 2 citations for a short article', citationFloor(0) === 2);
check('…and 2 still at 500 words', citationFloor(500) === 2);
check('…3 at 501 words', citationFloor(501) === 3);
check('…one per 250 words above that', citationFloor(2000) === 8);

const oneFootnote = 'متن. '.repeat(50) + '<ref>{{یادکرد کتاب|عنوان=الف|ناشر=ب}}</ref>';
const hodhod = '{{بدون منبع|تاریخ=مه ۲۰۲۰}}\n' + oneFootnote
  + '\n== منابع ==\n{{پانویس}}\n* کتاب حکایت‌های عطار نیشابوری\n'
  + '* [http://www.iranbirds.com/ پرندگان ایران]\n'
  + '* Wikipedia contributors, "Hoopoe", http://en.wikipedia.org/wiki/Hoopoe\n';
const hodhodVerdict = act(hodhod, 'هدهد', { renderedRefs: 1, proseWords: 564 });
check('«هدهد» keeps its banner: one footnote for 564 words',
  hodhodVerdict.act === 'skip', JSON.stringify(hodhodVerdict));
check('…and the reason names the count, the length and the floor',
  /۱|1/.test(hodhodVerdict.why) && hodhodVerdict.why.includes('564')
    && hodhodVerdict.why.includes('3'));
check('…and it is marked render-dependent, so the cheap screen lets it be rendered',
  (hodhodVerdict as { needsRender?: true }).needsRender === true);
check('«وسترن» keeps its banner too: one footnote for 1,128 words',
  act('{{بدون منبع}}\n' + oneFootnote, 'وسترن',
      { renderedRefs: 1, proseWords: 1128 }).act === 'skip');

// A bibliography is not an inline citation, however long the list is.
const bibliographyOnly = '{{بدون منبع}}\n' + 'متن. '.repeat(40)
  + '\n== منابع ==\n' + '* {{یادکرد کتاب|عنوان=الف|ناشر=ب}}\n'.repeat(8);
check('eight bibliography bullets and no footnote never clear the floor',
  act(bibliographyOnly, 'الف', { renderedRefs: 0, proseWords: 400 }).act !== 'remove');

// The density rule must not block a genuinely sourced article. These ratios are the
// live ones measured on the first day's own removals.
const manyRefs = (n: number) =>
  Array.from({ length: n }, (_, i) =>
    `متن.<ref>{{یادکرد کتاب|عنوان=ک${i}|ناشر=ن}}</ref>`).join(' ');
check('«کمونالیسم»-shaped: 9 footnotes for 859 words is removed',
  act('{{بدون منبع}}\n' + manyRefs(9), 'الف',
      { renderedRefs: 9, proseWords: 859 }).act === 'remove');
check('«کتاب مستطاب آشپزی»-shaped: 3 footnotes for 232 words is removed',
  act('{{بدون منبع}}\n' + manyRefs(3), 'الف',
      { renderedRefs: 3, proseWords: 232 }).act === 'remove');
check('«روی»-shaped: a heavily cited long article is removed',
  act('{{بدون منبع}}\n' + manyRefs(60), 'الف',
      { renderedRefs: 60, proseWords: 9299 }).act === 'remove');
check('a long article whose citations do not keep up is refused',
  act('{{بدون منبع}}\n' + manyRefs(5), 'الف',
      { renderedRefs: 5, proseWords: 9299 }).act === 'skip');

// The render is the smaller, conservative opinion when the two disagree.
check('wikitext claims many footnotes but the render shows two → the render wins',
  act('{{بدون منبع}}\n' + manyRefs(20), 'الف',
      { renderedRefs: 2, proseWords: 2000 }).act === 'skip');

// A named-ref reuse has no body to classify but is still a citation on a sentence.
check('a <ref name=x/> reuse counts towards the floor',
  act('{{بدون منبع}}\nمتن.<ref name="a">{{یادکرد کتاب|عنوان=الف|ناشر=ب}}</ref>'
      + ' متن.<ref name="a"/>', 'الف',
      { renderedRefs: 2, proseWords: 300 }).act === 'remove');

check('a SECTION use is never removed ({{منبع|بخش}})',
  removeStaleTag('{{منبع|بخش}}\nمتن.<ref>{{یادکرد کتاب|عنوان=الف}}</ref>', STALE_NAMES) === null);
check('…nor the name= form',
  removeStaleTag('{{بدون منبع|name=بخش بدون منبع}}\nمتن.<ref>{{یادکرد کتاب|عنوان=الف}}</ref>', STALE_NAMES) === null);
check('isSectionUse sees the positional form', isSectionUse('{{منبع|بخش}}'));
check('isSectionUse does not fire on a dated article tag',
  !isSectionUse('{{بدون منبع|تاریخ=مه ۲۰۲۰}}'));

check('a section-scoped wrapper is left alone entirely',
  removeStaleTag('{{مشکلات متعدد|section=yes|\n{{منبع|بخش}}\n{{لحن|بخش}}\n}}\nمتن.<ref>{{یادکرد کتاب|عنوان=الف}}</ref>',
    STALE_NAMES) === null);

const inWrapper = '{{مشکلات متعدد|\n{{بدون منبع|تاریخ=مه ۲۰۲۰}}\n{{لحن}}\n{{بازنویسی}}\n}}\nمتن.<ref>{{یادکرد کتاب|عنوان=الف}}</ref>';
const unwrapped = removeStaleTag(inWrapper, STALE_NAMES)!;
check('a stale tag inside the wrapper is removed as a line',
  !unwrapped.text.includes('بدون منبع') && unwrapped.text.includes('{{لحن}}'));
check('a removal that would leave a one-banner wrapper is reported instead',
  act('{{مشکلات متعدد|\n{{بدون منبع}}\n{{لحن}}\n}}\nمتن.<ref>{{یادکرد کتاب|عنوان=الف}}</ref>',
    'الف', { renderedRefs: 1 }).act === 'report');

check('a tagged page that is STILL unsourced keeps its tag',
  act('{{بدون منبع|تاریخ=مه ۲۰۲۰}}\nمتن بدون منبع.').act === 'skip');
check('a tagged page whose refs do not render is reported, not edited',
  act(stale, 'الف', { renderedRefs: 0 }).act === 'report');

// ---- the render's reference counter --------------------------------------------------
// MediaWiki escapes the underscore inside id attributes, so the naive `id="cite_note-`
// counts zero on every page. «جنگ کره» renders 46 references and matched none of them.
check('an escaped id is counted', countRenderedRefs('<li id="cite&#95;note-1">x</li>') === 1);
check('a plain id is counted too', countRenderedRefs('<li id="cite_note-1">x</li>') === 1);
check('a backlink href is not double counted',
  countRenderedRefs('<a href="#cite_note-1">1</a><li id="cite&#95;note-1">x</li>') === 1);
check('no references means zero', countRenderedRefs('<p>متن</p>') === 0);

// A page whose opening sentence carries two citations is NOT "banner crowding".
check('two citations near the top are not mistaken for two banners',
  act('متن.<ref>{{یادکرد کتاب|عنوان=الف}}</ref> متن.<ref>{{یادکرد وب|نشانی=https://e.com}}</ref>',
      'الف', { proseWords: 900 }).act === 'add');
check('…while two real leading banners still report',
  act('{{لحن}}\n{{بازنویسی}}\nمتن.').act === 'report');
check('furniture above a banner is not counted as one',
  act('{{دیگر کاربردها}}\n{{توصیف کوتاه|چیزی}}\n{{لحن}}\nمتن.').act === 'add');

// ---- the مولکول case, end to end ------------------------------------------------------
// One reference, {{یادکرد فرهنگستان}}: the article is still unsourced, so the tag stays.
const molecule = '{{منبع}}متن.<ref>{{یادکرد فرهنگستان|مصوب=مولکول|بیگانه=molecule}}</ref>';
check('a tag is NOT removed when the only ref is یادکرد فرهنگستان',
  act(molecule, 'مولکول', { renderedRefs: 1 }).act === 'skip',
  JSON.stringify(act(molecule, 'مولکول', { renderedRefs: 1 })));
check('…and an untagged version of it would be tagged',
  (act('متن.<ref>{{یادکرد فرهنگستان|مصوب=مولکول}}</ref>') as { banner?: string }).banner === 'بدون منبع');

// ---- the write-time re-check (a duplicate target, or a human tagging mid-run) ---------
// The first Toolforge dry run returned «هنرمند بازی ویدئویی» twice among ten targets,
// because offset paging over a live search index repeats titles. The cached decision says
// «add», addBanner has no already-present guard, and the result — two banners on one page
// — raises no error and passes verify. getTargets now dedupes; this is the second line of
// defence, and the one that also covers a human tagging the page during a 50-minute run.
check('hasSourceBanner sees a banner that arrived after the decision',
  hasSourceBanner('{{بدون منبع|تاریخ=اکتبر ۲۰۲۶}}\nمتن.') === 'بدون منبع');
check('…and a redirect spelling of it',
  hasSourceBanner('{{بی‌منبع}}\nمتن.') !== null);
check('…but not a plain untagged page', hasSourceBanner('متن بدون بنر.') === null);
check('…and not a citation that merely mentions sources',
  hasSourceBanner('متن.<ref>{{یادکرد وب|نشانی=https://e.com}}</ref>') === null);

// ---- two copies of the tag: removing one leaves the page in the category --------------
// «بوسنی و هرزگوین», «گلباف» and «انجیل» each carry the tag twice (انجیل also has
// {{بخش بدون منبع}}). The first live batch attempted all three and verify refused them
// with «هنوز در ردهٔ بدون منبع است» — the symptom, not the cause.
const sourced = 'متن.<ref>{{یادکرد کتاب|عنوان=الف|ناشر=ب}}</ref>\n' +
  '<ref>{{یادکرد وب|نشانی=https://e.com|عنوان=ج}}</ref>';
check('one stale tag on a now-sourced page is still removed',
  act('{{بدون منبع}}\n' + sourced, 'الف', { renderedRefs: 2 }).act === 'remove');
check('two copies of the stale tag are reported, not edited',
  act('{{بدون منبع}}\n' + sourced + '\n{{بدون منبع}}', 'الف', { renderedRefs: 2 }).act === 'report');
check('a sibling {{بخش بدون منبع}} is reported too',
  act('{{بدون منبع}}\n' + sourced + '\n== بخش ==\n{{بخش بدون منبع}}', 'الف',
      { renderedRefs: 2 }).act === 'report');

// ---- errorMarkers: the before/after comparison verify now makes ----------------------
// «جنگ کره» renders six cite errors of its own. An absolute test refused it and blamed
// our edit; only an INCREASE is ours.
check('a pre-existing cite error is counted',
  errorMarkers('<span class="error mw-ext-cite-error">x</span>') === 1);
check('six of them count six',
  errorMarkers('<i class="error mw-ext-cite-error">x</i>'.repeat(6)) === 6);
check('a scribunto error counts', errorMarkers('<p class="scribunto-error">x</p>') === 1);
check('a clean render counts zero', errorMarkers('<p>متن</p><div class="errorless">x</div>') === 0);

// A hand-written category, not the banner, is what keeps «عدسی (خوراکی)» in the rede.
check('a hand-placed unsourced category is reported, not edited',
  act('{{بدون منبع}}\n' + sourced + '\n[[رده:مقاله‌های بدون منبع]]', 'الف',
      { renderedRefs: 2 }).act === 'report');
check('…while an unrelated category does not block the removal',
  act('{{بدون منبع}}\n' + sourced + '\n[[رده:غذاها]]', 'الف',
      { renderedRefs: 2 }).act === 'remove');

// Removing a tag must not leave the page starting with a blank line — invisible in the
// render, in every diff, and caught by check_wikitext after it refused three removals.
const rm = (s: string) => removeStaleTag(s, STALE_NAMES)?.text;
check('a blank line after the tag is not left at the top',
  rm('{{بدون منبع}}\n\nمتن.') === 'متن.', JSON.stringify(rm('{{بدون منبع}}\n\nمتن.')));
check('several blank lines are not left either',
  rm('{{بدون منبع}}\n\n\nمتن.') === 'متن.');
check('the ordinary case is unchanged',
  rm('{{بدون منبع}}\nمتن.') === 'متن.');
check('a mid-page paragraph break survives',
  rm('سرآغاز.\n{{بدون منبع}}\n\nمتن.') === 'سرآغاز.\n\nمتن.',
  JSON.stringify(rm('سرآغاز.\n{{بدون منبع}}\n\nمتن.')));

// Month-and-year pages are date pages. «خرداد ۱۳۸۷» was tagged on day one because the
// rule required a day number first, the same gap that let the Hijri day pages through.
for (const title of ['خرداد ۱۳۸۷', 'اکتبر ۲۰۲۶', 'رمضان ۱۴۴۵', 'مه ۱۹۴۵']) {
  check(`«${title}» is a date page`, act('متن بی‌منبع.', title).act === 'skip',
    JSON.stringify(act('متن بی‌منبع.', title)));
}
// …and a month name alone must not take ordinary titles with it.
for (const title of ['مهر (شهر)', 'دی اکسید کربن', 'مه‌آلودگی', 'صفر مطلق']) {
  check(`«${title}» is not a date page`, act('متن بی‌منبع.', title).act === 'add');
}

console.log(`\n${pass} گذشت، ${fails.length} افتاد`);
if (fails.length) { console.error('failing:\n  - ' + fails.join('\n  - ')); process.exit(1); }
