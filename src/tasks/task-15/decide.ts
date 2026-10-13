/**
 * وظیفهٔ ۱۵ — the decision: given an article's text and the facts gathered about it,
 * which banner (if any) may the bot place, or which stale banner may it remove?
 *
 * Pure and synchronous so the whole rule set is testable offline. The network work that
 * produces `PageFacts` happens in `getTargets`; see `docs/BUILDING-A-TASK.md` §2.
 *
 * EVERY PATH THAT IS NOT A CONFIDENT YES IS A REFUSAL WITH A REASON. That is §3's
 * asymmetric refusal, and it is the whole design: a missed page costs nothing, a wrong
 * banner costs trust in the bot. The reasons are what the report page publishes, so they
 * are written to be read by an editor, not by a developer.
 */
import {
  sourceFeatures, isStrictUnsourced, inlineCitations, citationFloor, type SourceFeatures,
} from './source-detect.js';
import {
  BANNERS, EXISTING_SOURCE_BANNERS, STOP_TEMPLATES, allTemplateNames, findMultiple,
  isSectionUse, type BannerName,
} from './banners.js';
import { findTemplate } from '../task-14/population-box.js';

/** Top-of-page furniture, which is not a maintenance banner. */
const FURNITURE_NAMES = ['تغییرمسیر', 'دیگر کاربردها', 'برای', 'دربارهٔ', 'درباره',
  'displaytitle', 'عنوان مقاله', 'توصیف کوتاه', 'short description', 'شرح مختصر',
  'حص', 'محافظت', 'pp', 'pp-protected'];

/** What the task learned about a page from the API, before `transform` runs. */
export interface PageFacts {
  /** `id="cite_note-` anchors in the rendered HTML */
  renderedRefs: number;
  /** external links in the render that are not wiki/authority-control hosts */
  foreignLinks: number;
  /** the render could not be obtained — never tag in that case */
  renderFailed?: boolean;
  isDab: boolean;
  isBlp: boolean;
  isRedirect: boolean;
  hasVillageInfobox: boolean;
  /** days since the last edit; `Infinity` when unknown */
  daysSinceEdit: number;
  /** Persian prose words, from وظیفهٔ ۱۰'s extractProse/countWords */
  proseWords: number;
  /** per banner: does its dated monthly category exist yet? (§5) */
  datedCategoryExists: Partial<Record<BannerName, boolean>>;
}

export type Decision =
  | { act: 'add'; banner: BannerName; why: string }
  | { act: 'remove'; why: string }
  | { act: 'report'; why: string; kind: ReportKind }
  /**
   * `needsRender` marks a refusal that could change once the page is rendered, so the
   * cheap pre-render screen must let the page through instead of rejecting it.
   *
   * It is a FLAG rather than a pattern match on `why`, because the screen used to detect
   * this by testing the Persian reason string for «نمایش» — so the day a new
   * render-dependent refusal was added with a different wording (the citation-density
   * floor, which reads `proseWords` and `renderedRefs`), the screen would have quietly
   * rejected every removal candidate before it was ever rendered and the whole removal
   * half of the task would have reported "nothing to do".
   */
  | { act: 'skip'; why: string; needsRender?: true };

export type ReportKind =
  | 'یک منبع' | 'بخش بدون منبع' | 'اصلاح ترجمه'
  | 'شلوغی بنر' | 'بسته‌بندی تک‌بنری' | 'ناسازگاری متن و نمایش'
  | 'چند برچسب بدون منبع' | 'ردهٔ دستی بدون منبع';

/** Titles that are lists, years or dates — explicitly out (§3.1). */
// `\b` would be wrong here for the third time in this task: JavaScript's word
// boundary is ASCII-only, so `^فهرست\b` matches no Persian title at all.
const LIST_TITLE = /^(فهرست|سیاههٔ|سیاهه)(\s|$)/;

/**
 * Date pages, which are explicitly out (§3.1).
 *
 * Not a style preference: HujiBot وظیفهٔ ۷ went through and *removed* {{بدون منبع}} from
 * date pages, so adding it back is reverting a community decision. A bare-number test is
 * not enough — the first dry run proposed tagging «۴ تیر» and «سده پنجم (میلادی)», which
 * are a day page and a century page.
 *
 * The ordinal/number requirement after سده/دهه/هزاره keeps real places out of the
 * pattern: «سده لنجان» is a city in Isfahan province, «سده پنجم» is a century.
 */
const FA_MONTH = 'فروردین|اردیبهشت|خرداد|تیر|مرداد|شهریور|مهر|آبان|آذر|دی|بهمن|اسفند';
const GREG_MONTH = 'ژانویه|فوریه|مارس|آوریل|مه|ژوئن|ژوئیه|اوت|سپتامبر|اکتبر|نوامبر|دسامبر';
// fa has day pages in all THREE calendars. Leaving the Hijri months out tagged 17 of
// them in one run («۲۷ رمضان», «۱ محرم», «۱۶ شعبان») — found by auditing the live run,
// not by any test, because the title pattern is the only thing that distinguishes them.
const HIJRI_MONTH = 'محرم|صفر|ربیع‌الاول|ربیع‌الآخر|ربیع‌الثانی|جمادی‌الاول|جمادی‌الاولی|' +
  'جمادی‌الآخر|جمادی‌الثانی|رجب|شعبان|رمضان|شوال|ذی‌القعده|ذی‌الحجه|ذیقعده|ذیحجه';
const ORDINAL = 'یکم|دوم|سوم|چهارم|پنجم|ششم|هفتم|هشتم|نهم|دهم|یازدهم|دوازدهم|سیزدهم|' +
  'چهاردهم|پانزدهم|شانزدهم|هفدهم|هجدهم|نوزدهم|بیستم|اول';
// A MONTH-AND-YEAR page is a date page too: «خرداد ۱۳۸۷», «اکتبر ۲۰۲۶». The day-first
// pattern below does not match them, so «خرداد ۱۳۸۷» was tagged in the first day's third
// batch — the same miss as the Hijri months, in a different shape. The year is required,
// or «مهر», «دی», «صفر» and «مه» would take the month names out of ordinary article
// titles with them.
const MONTH_YEAR = new RegExp(`^(${FA_MONTH}|${GREG_MONTH}|${HIJRI_MONTH}) [۰-۹0-9]{2,4}$`);
const DATE_PAGE = new RegExp(
  `^[۰-۹0-9]{1,2} (${FA_MONTH}|${GREG_MONTH}|${HIJRI_MONTH})( |$)` +
  `|${MONTH_YEAR.source}` +
  `|^(سده|دهه|هزاره) ([۰-۹0-9]+|${ORDINAL})( |$)` +
  '|^[۰-۹0-9]{1,4}( \\((میلادی|قمری|خورشیدی|پیش از میلاد)\\))?$');

/** The stale tags §3.9 may remove, plus their redirects. */
export const STALE_NAMES = new Set(['بدون منبع', 'بدون منبع زنده', 'منبع', 'بی‌منبع',
  'بی منبع', 'فاقد منبع', 'بدون مرجع', 'unreferenced', 'blp unreferenced']);

/**
 * Does the page already carry any source/verification banner, anywhere?
 *
 * Exported because `transform` re-checks it against the text fetched at WRITE time, not
 * the text the decision was made on. `decide` sees the page as enumeration found it, and
 * two things can put a banner there in between: the same title arriving twice in one run
 * (CirrusSearch paging repeats titles as the index shifts under the offsets), and a human
 * tagging the page during the ~50 minutes a 200-edit run takes. `addBanner` has no
 * already-present guard of its own, so without this re-check either case appends a
 * SECOND banner — which raises no error, lands in the right category and passes `verify`.
 */
export function hasSourceBanner(text: string): string | null {
  for (const n of allTemplateNames(text)) {
    const bare = n.split('|')[0].trim();
    if (EXISTING_SOURCE_BANNERS.has(bare)) return bare;
  }
  return null;
}

/**
 * Maintenance banners already at the top, for the "do not add a third" rule (§4).
 *
 * Counts only the LEADING run of templates, which is what "banners at the top" means.
 * The first version counted every template in the opening 600 characters, so an article
 * whose first sentence carries two `<ref>{{یادکرد کتاب}}</ref>` citations was read as
 * having two banners and reported as crowded instead of being tagged — 12 of the first
 * dry run's 22 refusals were that.
 */
function bannerCount(text: string): number {
  const multi = findMultiple(text);
  // Inside a wrapper the first `{{` of the match is the wrapper itself.
  if (multi) return Math.max(0, (multi.body.match(/^\s*\{\{/gm) ?? []).length - 1);

  let i = 0, n = 0;
  for (;;) {
    while (i < text.length && /\s/.test(text[i])) i++;
    if (!text.startsWith('{{', i)) return n;          // prose, or an infobox-less top
    const name = (/^\{\{\s*([^{}|\n]+?)\s*(?:\||\}\}|\n)/.exec(text.slice(i))?.[1] ?? '')
      .replace(/_/g, ' ').trim().toLowerCase();
    if (/^(جعبه|infobox)/.test(name)) return n;       // the infobox ends the banner block
    let depth = 0, j = i;
    for (; j < text.length; j++) {
      if (text.startsWith('{{', j)) { depth++; j++; }
      else if (text.startsWith('}}', j)) { depth--; j++; if (depth === 0) { j++; break; } }
    }
    if (depth !== 0) return n;                        // unbalanced: stop counting
    if (!FURNITURE_NAMES.some(f => name === f || name.startsWith(f + ' '))) n++;
    i = j;
  }
}

/**
 * The whole rule set, in one place.
 *
 * Order matters: the cheap structural refusals come first so that a page which must not
 * be touched is never measured, and the report-only kinds come last so they cannot
 * shadow a real decision.
 */
export function decide(text: string, title: string, f: PageFacts): Decision {
  // ---- never, under any circumstances ------------------------------------------------
  if (f.isRedirect) return { act: 'skip', why: 'تغییرمسیر است' };
  if (f.isDab) return { act: 'skip', why: 'صفحهٔ ابهام‌زدایی است' };
  if (LIST_TITLE.test(title)) return { act: 'skip', why: 'فهرست است' };
  if (DATE_PAGE.test(title)) return { act: 'skip', why: 'صفحهٔ تاریخ است (وظیفهٔ ۷ هوجی‌بات این برچسب را از آنها برداشته)' };
  if (f.hasVillageInfobox) return { act: 'skip', why: 'آبادی ایران است (خارج از دامنه)' };

  const names = allTemplateNames(text).map(n => n.split('|')[0].trim());
  const stop = names.find(n => STOP_TEMPLATES.has(n));
  if (stop) return { act: 'skip', why: `الگوی «${stop}» روی صفحه است` };

  // Someone may be mid-cleanup; en's "actively expanded" caution (§3.1).
  if (f.daysSinceEdit < 7) return { act: 'skip', why: 'در ۷ روز گذشته ویرایش شده' };

  const feats: SourceFeatures = sourceFeatures(text);
  const strict = isStrictUnsourced(feats);

  // ---- §3.9 remove a stale tag -------------------------------------------------------
  const staleName = [...STALE_NAMES].find(n => {
    const t = findTemplate(text, n);
    return t && !isSectionUse(t.body);
  });
  if (staleName) {
    if (strict) return { act: 'skip', why: 'برچسب هست و مقاله هنوز منبعی ندارد' };
    // The render must agree, or the wikitext is lying about what the page cites.
    if (f.renderFailed) return { act: 'skip', why: 'نمایش صفحه گرفته نشد', needsRender: true };
    if (f.renderedRefs < 1) {
      return { act: 'report', kind: 'ناسازگاری متن و نمایش',
        why: 'ویکی‌متن منبع دارد ولی در نمایش هیچ پانویسی دیده نمی‌شود' };
    }
    const multi = findMultiple(text);
    // Banners INSIDE the wrapper: the first `{{` of the match is the wrapper itself.
    const inside = multi ? (multi.body.match(/^\s*\{\{/gm) ?? []).length - 1 : 0;
    if (multi && inside === 2) {
      return { act: 'report', kind: 'بسته‌بندی تک‌بنری',
        why: 'برچسب کهنه درون {{مشکلات متعدد}} است و با برداشتنش تنها یک بنر می‌ماند' };
    }
    // More than one copy of the tag — or a sibling section tag — and removing one leaves
    // the page in the unsourced category anyway. `removeStaleTag` takes a single
    // occurrence, so «بوسنی و هرزگوین», «گلباف» and «انجیل» each reached `verify`, which
    // refused them with «هنوز در ردهٔ بدون منبع است»: safe, but the edit was attempted and
    // the reason published named the symptom instead of the cause.
    const copies = [...STALE_NAMES].reduce((n, name) => {
      const re = new RegExp('\\{\\{\\s*' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*[|}]', 'gi');
      return n + (text.match(re) ?? []).length;
    }, 0);
    const sectionTag = findTemplate(text, 'بخش بدون منبع');
    if (copies > 1 || sectionTag) {
      return { act: 'report', kind: 'چند برچسب بدون منبع',
        why: 'بیش از یک برچسب بی‌منبعی دارد؛ برداشتن یکی صفحه را از رده بیرون نمی‌آورد' };
    }
    // The category written by hand at the bottom of the page, rather than by the banner.
    // «عدسی (خوراکی)» has both; taking the banner out leaves `[[رده:مقاله‌های بدون منبع]]`
    // behind and the page in the category, which `verify` then refused. Removing a
    // hand-placed category is a different edit from removing a banner and is not in the
    // approved scope, so this is a report.
    if (/\[\[\s*رده\s*:\s*[^\]]*بدون منبع[^\]]*\]\]/.test(text)) {
      return { act: 'report', kind: 'ردهٔ دستی بدون منبع',
        why: 'ردهٔ بی‌منبعی به‌دست در صفحه نوشته شده، نه با برچسب؛ برداشتن برچسب بس نیست' };
    }
    // ---- is it sourced ENOUGH to call the banner stale? ------------------------------
    //
    // Until ۱۳ اکتبر ۲۰۲۶ this returned `remove` as soon as ONE real source existed, and
    // it counted the general-bibliography bullets under «منابع» towards that one. That is
    // the wrong test twice over, and the operator caught it on «هدهد»: 564 words of prose,
    // a «منابع» list of seven items — one of them literally "Wikipedia contributors,
    // Hoopoe" — and exactly ONE inline footnote in the whole article. The banner came off
    // with the summary «مقاله اکنون منبع دارد», which is a claim the article does not
    // support. «وسترن» was the same shape: 1,128 words, one footnote.
    //
    // Two changes, both in `inlineCitations` / `citationFloor` (source-detect.ts):
    //
    // 1. Only INLINE citations count. A bullet under «منابع» is a reading list: it is not
    //    attached to any sentence, so it cannot be checked against a claim, and a reader
    //    cannot tell which statement it is supposed to support. `cite_outside_sourcing`
    //    and `genref_sourcing` are therefore excluded here — note they still count in
    //    `isStrictUnsourced`, because for ADDING a banner every doubt must block, and a
    //    bibliography is doubt. The two directions are deliberately asymmetric.
    // 2. The count has to keep up with the article. One footnote on 500 words of prose is
    //    not a sourced article; the floor scales with length (§3.9).
    //
    // Measured on the day's own removals: genuinely-sourced articles run 27–95 words per
    // citation («کازرون» 27, «روی» 37, «ترابری ریلی» 79, «کمونالیسم» 95), while the two
    // bad removals were 564 and 1,128. The floor sits far from both groups.
    const inline = inlineCitations(feats, f.renderedRefs);
    const floor = citationFloor(f.proseWords);
    if (inline < floor) {
      return { act: 'skip', needsRender: true,
        why: `منبع درون‌متنی کم است: ${inline} پانویس برای ${f.proseWords} واژه ` +
             `(کمینهٔ لازم ${floor})` };
    }
    return { act: 'remove', why: `${inline} پانویس درون‌متنی برای ${f.proseWords} واژه دارد` };
  }

  // ---- adding needs a clean slate ----------------------------------------------------
  const already = hasSourceBanner(text);
  if (already) return { act: 'skip', why: `از پیش الگوی «${already}» دارد` };
  if (f.renderFailed) return { act: 'skip', why: 'نمایش صفحه گرفته نشد', needsRender: true };

  if (bannerCount(text) >= 2) {
    return { act: 'report', kind: 'شلوغی بنر',
      why: 'دو بنر نگهداری یا بیشتر از پیش دارد؛ بسته‌بندی‌شان کار آدم است' };
  }

  // ---- §3.1 / §3.2: no source of any kind --------------------------------------------
  if (strict) {
    // The render is the second opinion: templates can emit refs and links the wikitext
    // scan never sees (§3.0). Disagreement is a refusal, not a tie-break.
    if (f.renderedRefs > 0 || f.foreignLinks > 0) {
      return { act: 'report', kind: 'ناسازگاری متن و نمایش',
        why: `ویکی‌متن منبعی ندارد ولی نمایش ${f.renderedRefs} پانویس و ` +
             `${f.foreignLinks} پیوند بیرونی دارد` };
    }
    const banner: BannerName = f.isBlp ? 'بدون منبع زنده' : 'بدون منبع';
    return { act: 'add', banner, why: 'هیچ منبعی ندارد' };
  }

  // ---- the narrow tiers (§3.3 / §3.4) ------------------------------------------------
  // The «مولکول» rule: count only what sources the CONTENT. {{یادکرد فرهنگستان}} and a
  // link to another Wikipedia are references to something, but not to anything the
  // article claims, so they must not lift a page over a tier threshold either.
  const real = feats.refs_sourcing + feats.cite_outside_sourcing + feats.sfn + feats.genref_sourcing;
  if (f.isBlp) {
    if (real >= 1 && real <= 2 && f.proseWords >= 300) {
      return { act: 'add', banner: 'منبع زنده',
        why: `زندگی‌نامهٔ زنده با ${real} منبع برای ${f.proseWords} واژه` };
    }
  } else {
    if ((f.proseWords >= 800 && real <= 2) || (f.proseWords >= 2000 && real <= 3)) {
      return { act: 'add', banner: 'بهبود منبع',
        why: `${real} منبع برای ${f.proseWords} واژه` };
    }
  }

  // ---- report-only kinds (§3.5–§3.7) -------------------------------------------------
  // Confirmed with the operator on ۱۲ اکتبر ۲۰۲۶: these stay report-only. The banners
  // are judgement calls — «یک منبع»'s own doc says it is not a policy violation, and
  // «اصلاح ترجمه» tells readers the page will be nominated for deletion within two
  // weeks at a measured precision of 15–20%.
  if (real === 1 && f.proseWords >= 300) {
    return { act: 'report', kind: 'یک منبع', why: `تنها ۱ منبع برای ${f.proseWords} واژه` };
  }

  return { act: 'skip', why: 'شرایط هیچ برچسبی را ندارد' };
}

/** The Persian edit summary for a decision (§6). */
export function summaryFor(d: Decision): string {
  if (d.act === 'add' && d.banner === 'بدون منبع') {
    return 'افزودن الگوی {{بدون منبع}}: مقاله هیچ منبعی ندارد (یادکرد-ویکی منبع به‌شمار نمی‌آید)';
  }
  if (d.act === 'add' && d.banner === 'بدون منبع زنده') {
    return 'افزودن الگوی {{بدون منبع زنده}}: زندگی‌نامهٔ فرد زنده بدون منبع';
  }
  if (d.act === 'add') return `افزودن الگوی {{${d.banner}}}: ${d.why}`;
  if (d.act === 'remove') return 'حذف الگوی {{بدون منبع}}: مقاله اکنون منبع دارد';
  return '';
}

export { BANNERS };
