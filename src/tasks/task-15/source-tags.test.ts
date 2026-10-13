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
const stale = '{{بدون منبع|تاریخ=مه ۲۰۲۰}}\nمتن.<ref>{{یادکرد کتاب|عنوان=الف}}</ref>';
check('a stale tag on a now-sourced article is removed',
  act(stale, 'الف', { renderedRefs: 1 }).act === 'remove');
const removed = removeStaleTag(stale, STALE_NAMES)!;
check('…taking its trailing newline with it',
  removed.text === 'متن.<ref>{{یادکرد کتاب|عنوان=الف}}</ref>', JSON.stringify(removed.text));

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

console.log(`\n${pass} گذشت، ${fails.length} افتاد`);
if (fails.length) { console.error('failing:\n  - ' + fails.join('\n  - ')); process.exit(1); }
