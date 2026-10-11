/**
 * وظیفهٔ ۱۳ — ویکی‌پدیا:گزارش دیتابیس/مقاله‌های نیازمند تغییرنام
 *
 *   npx tsx src/tasks/task-13/move-report-cli.ts              # dry run: prints the wikitext
 *   npx tsx src/tasks/task-13/move-report-cli.ts --live       # publishes the report page
 *   npx tsx src/tasks/task-13/move-report-cli.ts --refresh    # re-enumerate titles, ignore the cache
 *   npx tsx src/tasks/task-13/move-report-cli.ts --sample 50  # dry run against the first N titles
 *   npx tsx src/tasks/task-13/move-report-cli.ts --backend ssh|direct   # override replica access
 *
 * Rezabot published this report daily until it stopped in مهر ۱۴۰۰ (October 2021),
 * and the page has been frozen since. It lists article titles whose spelling or
 * punctuation does not match fa.wikipedia convention, with the corrected title and
 * a move link. It PROPOSES; a human moves. Nothing here edits an article.
 *
 * WHAT THIS DOES NOT INHERIT FROM THE OLD REPORT
 * ----------------------------------------------
 * The old report's سجاوندی section rewrote initials — «کی. پی. کانداسامی» to
 * «کی.پی. کانداسامی» — which an editor objected to on قهوه‌خانه/فنی, correctly:
 * the spacing of Latin initials in a Persian title is not settled, and the old rule
 * normalised in both directions on different pages. Its سایر section was worse. It
 * ran a general "join these two words with a ZWNJ" heuristic with no word list, and
 * so proposed «کمیته ملیون ایرانی» → «کمیته میلیون ایرانی», «مینامی نو تسوبانه» →
 * «می‌نامی نو تسوبانه» and «دانشگاه اند ونزوئلا» → «دانشگاه‌اند ونزوئلا». Each is a
 * foreign name mangled by a rule that cannot tell a name from a compound.
 *
 * That is why every rule below is either a character-class substitution that needs
 * no knowledge of the word (an Arabic letter is never correct in a Persian title) or
 * an EXACT phrase from a short table. There is no inferred ZWNJ insertion, no
 * dictionary, no initial-spacing rule, and no ezafe removal. A rule that cannot
 * state its own scope does not belong on a page editors act on without checking.
 *
 * THE WHITELIST IS THE POINT
 * --------------------------
 * `/فهرست سفید` already holds 1,179 titles that editors added over the years,
 * each one a title the old bot proposed and a human rejected: «کینک.کام»,
 * «مینامی، توکوشیما», «اکسید آهن (II, III)», «ۀ». That page is the community's
 * record of where the report was wrong, and it is honoured absolutely — a title on
 * it never appears in the report again, no argument and no re-litigating it on the
 * next run.
 */
import { Bot } from '../../core.js';
import { checkWikitext } from '../../lib/gates.js';
import { articleTitles, queryRows, type Backend } from '../../lib/replica.js';
import {
  PAST_STEMS, PRESENT_STEMS, DAN_ENDINGS, NOT_MI_VERBS,
  ALLAH_FIRST, HONORIFIC_FIRST, HONORIFIC_SECOND,
} from './zwnj-lists.js';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname } from 'path';

// Renamed ۱۰ اکتبر ۲۰۲۶ at Huji's request, part of fa.wikipedia replacing the word
// «انتقال» with «تغییرنام». The old title and all four subpages are redirects, so
// nothing that pointed at them broke; this constant is what decides where the daily
// run WRITES, and the whitelist path is derived from it.
/**
 * One report per namespace. The rules are identical; only where they are applied and
 * where the result is published differ.
 *
 * `colon` is not cosmetic. A bare `[[رده:X]]` **files the report page into that
 * category** instead of linking to it, and the report would quietly join hundreds of
 * categories — see lessons/template-porting/category-template-categorizes-not-links.md.
 * Namespace 14 therefore links with a leading colon. Templates do not transclude from a
 * link, so namespace 10 needs none.
 *
 * `ns` 0 keeps the historical behaviour exactly; everything else was added alongside.
 *
 * WHY PROJECT SPACE ONLY LOOKS AT TOP-LEVEL PAGES. The first dry run over namespace 4
 * returned **3,312** suggestions, against 100 for categories and 15 for templates — on a
 * namespace a tenth the size. None of them were real. In project space a subpage is
 * almost never prose that someone chose: it is a record or a datum, and its title is
 * load-bearing.
 *
 *   ویکی‌پدیا:آیا می‌دانستید که...؟/…            ۲۷۴۴  — DYK drafts and archives
 *   ویکی‌پدیا:یادبودهای برگزیده/۱۱ شوّال/رویدادها  ۳۶۰  — transcluded by exact title
 *   ویکی‌پدیا:نظرخواهی برای حذف/…                ۱۵۴  — a closed discussion keeps the
 *                                                        title it was nominated under
 *   ویکی‌پدیا:اشتباه‌یاب/موارد درست/…               ۴۴  — the typo-finder's whitelist, whose
 *                                                        entries ARE article titles; a
 *                                                        "fix" here breaks the tool
 *
 * Renaming any of those is wrong, and the harakat in «۱۱ شوّال» or the «...» in a
 * fifteen-year-old DYK archive are not defects. Exactly **2** of the 3,312 were
 * top-level pages. Rather than grow a list of excluded trees — which would need an entry
 * for every project that ever archives by subpage, and would silently rot — namespaces
 * flagged `topLevelOnly` consider only pages with no `/` in them. A genuine project page
 * worth renaming is a top-level one; if a subpage ever needs a move, it needs a human
 * reading the discussion, not a row on a report.
 */
export interface Target {
  ns: number;
  /** Namespace prefix as it appears in a title, '' for main space. */
  prefix: string;
  /** Leading ':' when a bare link would do something other than link. */
  colon: string;
  page: string;
  what: string;
  /** Skip subpages: their titles are records or transclusion keys. See above. */
  topLevelOnly?: boolean;
}

export const TARGETS: Record<string, Target> = {
  article:  { ns: 0,  prefix: '',          colon: '',  what: 'مقاله',
              page: 'ویکی‌پدیا:گزارش دیتابیس/مقاله‌های نیازمند تغییرنام' },
  category: { ns: 14, prefix: 'رده:',      colon: ':', what: 'رده',
              page: 'ویکی‌پدیا:گزارش دیتابیس/رده‌های نیازمند تغییرنام' },
  template: { ns: 10, prefix: 'الگو:',     colon: '',  what: 'الگو',
              page: 'ویکی‌پدیا:گزارش دیتابیس/الگوهای نیازمند تغییرنام' },
  project:  { ns: 4,  prefix: 'ویکی‌پدیا:', colon: '', what: 'صفحهٔ ویکی‌پدیا',
              page: 'ویکی‌پدیا:گزارش دیتابیس/صفحه‌های ویکی‌پدیای نیازمند تغییرنام',
              topLevelOnly: true },
  help:     { ns: 12, prefix: 'راهنما:',   colon: '',  what: 'راهنما',
              page: 'ویکی‌پدیا:گزارش دیتابیس/راهنماهای نیازمند تغییرنام' },
};

/** Whether a title in this namespace is in scope at all, before any rule runs. */
export const considered = (t: Target, title: string) =>
  !(t.topLevelOnly && title.includes('/'));

export const REPORT_PAGE = TARGETS.article.page;
export const WHITELIST_PAGE = `${REPORT_PAGE}/فهرست سفید`;
export const whitelistPage = (t: Target) => `${t.page}/فهرست سفید`;
/** Transcluded by {{گزارش دیتابیس}} on وپ:گد as the report's «آخرین به‌روزرسانی». */
export const SIGNATURE_PAGE = `${REPORT_PAGE}/امضا`;
export const signatureFor = (t: Target) => `${t.page}/امضا`;
const HEADER_TEMPLATE = '{{گزارش دیتابیس/صفحه برای انتقال}}';

/** Longest the page may get, in total and per section. Past this it stops being
 *  something a person works through, and the old page's 413 rows were already a lot. */
const MAX_ROWS = 600;
const MAX_PER_SECTION = 200;

const fa = (n: number) => String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

export interface Rule {
  id: string;
  /** section heading on the report page */
  heading: string;
  /** one line on the page saying what the rule is, so a reader can dispute it */
  explain: string;
  apply(title: string): string;
}

/** Arabic letters that have a Persian counterpart and no business in a fa title. */
const ARABIC_LETTERS: [RegExp, string][] = [
  [/ي/g, 'ی'],   // ARABIC YEH        -> FARSI YEH
  [/ى/g, 'ی'],   // ALEF MAKSURA      -> FARSI YEH
  [/ك/g, 'ک'],   // ARABIC KAF        -> KEHEH
];

/**
 * Vowel marks. Tanwin (ً ٌ ٍ) is deliberately NOT here: it is part of the spelling of
 * «کاملاً» and «نسبتاً», so stripping it would corrupt a correct title.
 */
const HARAKAT = /[َُِّْٰ]/g;

/**
 * Compounds written with a space that convention writes with a ZWNJ. An EXACT phrase
 * table on purpose — see the header. Every entry here was counted on the live wiki
 * before being added; nothing is here on the strength of it sounding right.
 */
const ZWNJ_COMPOUNDS: [string, string][] = [
  ['بین المللی', 'بین‌المللی'],
  ['نرم افزار', 'نرم‌افزار'],
  ['سخت افزار', 'سخت‌افزار'],
  ['سیستم عامل', 'سیستم‌عامل'],
];

/** Words whose only defect is an آ where convention writes ا. */
const ALEF_WORDS: [string, string][] = [
  ['فرآیند', 'فرایند'],
];

const ZWNJ = '‌';

/**
 * Letters that never join to the LEFT. A ZWNJ after one of these is unnecessary — the
 * gap is already there — and **AbuseFilter 27 («ایجاد صفحه با فاصلهٔ مجازی نالازم»)
 * refuses to create a title containing one.** So binding a suffix is not "insert a
 * ZWNJ": after these letters the space is simply deleted.
 *
 *   کتاب + ها → کتاب‌ها   (ب joins forward, ZWNJ needed)
 *   خودرو + ها → خودروها  (و does not, ZWNJ would be rejected)
 *
 * See lessons/api-and-permissions/zwnj-acronym-title-abusefilter-27.md, where a page
 * creation was disallowed outright for exactly this.
 */
const NON_JOINING_LEFT = 'اآدذرزژوءؤأإ';

/** Attach `right` to `left` with a ZWNJ only where one is actually needed. */
export const bind = (left: string, right: string) =>
  NON_JOINING_LEFT.includes(left.slice(-1)) ? left + right : left + ZWNJ + right;

/**
 * Suffixes that bind to the word before them. MEASURED over all 1,096,968 ns0 titles on
 * ۱۱ اکتبر ۲۰۲۶; the counts below are hits, and the judgement is on reading them.
 *
 * KEPT (precision ~۹۰٪ or better):
 *   ها / های / هایی   ۲۵۲  plural — «جام ملت های آسیا», «سلول های گانگلیونی»
 *   ای                 ۵۷  nisba, but ONLY after a word ending in «ه»; see below
 *
 * REJECTED, every one of them measured and read:
 *   ای  (unrestricted)  ۳۶۵ — an English middle initial. «مایکل ای مان» is Michael A.
 *                             Mann, «جی ای راتکلیف» is G. A. Ratcliffe. Requiring the
 *                             preceding word to end in «ه» cuts 365 → 57 and takes the
 *                             precision from near zero to ~۹۶٪, because the nisba
 *                             attaches to ه-final stems: منطقه‌ای، هسته‌ای، حرفه‌ای.
 *   اند                 ۴۶۳ — English "and": «پرت اند ویتنی», «گلف اند وسترن».
 *   ام                  ۴۳۰ — German "am": «فرانکفورت ام ماین», «زاسباخ ام کایزرشتوهل».
 *   اش                   ۳۹ — "Ash": «یواس‌اس اش», «میک اش».
 *   تر / ترین            ۴۵ — Dutch/German «ter»: «فریتس تر مر», «کارین تر بیک»; and
 *                             «چاه تر» is a wet well. Christine is «کریس ترین».
 *   هایش                  ۱ — Bernard Haisch.
 *
 * Those six are not guarded, they are ABSENT. A suffix rule for them would need to know
 * that a title is a transliterated foreign name, which nothing in the title says.
 */
const BINDING_SUFFIXES = ['ها', 'های', 'هایی'];

/**
 * Transliterated East-Asian name syllables that sit next to «ها» and are not the plural
 * suffix: «کیم ها یون», «پارک یونگ ها», «جونگ جون ها», «انگوین های لونگ». 17 of the 252
 * «ها» hits are this, and nothing else in the title distinguishes them.
 *
 * Deliberately excludes syllables that are also ordinary Persian words — «یون» is an
 * ion, «روی» is zinc or "on", «مین» is a mine, «سان» and «آن» are Persian — because a
 * guard entry only ever SUPPRESSES a suggestion, and suppressing «یون ها» → «یون‌ها»
 * would cost a real one.
 */
const EAST_ASIAN_SYLLABLES = new Set([
  'کیم', 'پارک', 'چوی', 'جونگ', 'کانگ', 'سونگ', 'هیون', 'نگوین', 'انگوین', 'فام',
  'نول', 'اون', 'یونگ', 'لونگ', 'بک', 'سوک', 'کیونگ', 'ووک',
]);

/**
 * Every form that counts as a conjugated verb after «می»/«نمی».
 *
 * «می» alone is NOT a usable signal: of 187 ns0 titles with a standalone «می», most are
 * Korean («کیم می سوک», «چا می کیونگ») or English May («رزا می بیلینگ‌هرست»), and «می» is
 * also Persian for wine — «می خواه و گل افشان کن» is Hafez asking for wine, not a verb.
 * Requiring a conjugated verb after it takes 187 hits down to 9, all real.
 *
 * The present/past asymmetry is the guard that earns the precision, and the ابرابزار
 * draws it the same way: a PRESENT stem must carry a personal ending, a PAST stem may
 * stand bare because bare past = third person singular («چه می شد اگر…»). Without it
 * «میس می آی» — the band Miss May I — reads as «می» + a bare present stem.
 */
const MI_VERBS = new Set<string>();
for (const st of PAST_STEMS) for (const e of ['', 'م', 'ی', 'یم', 'ید', 'ند', 'ه']) MI_VERBS.add(st + e);
for (const st of PRESENT_STEMS) for (const e of ['م', 'ی', 'د', 'یم', 'ید', 'ند']) MI_VERBS.add(st + e);
for (const e of DAN_ENDINGS) MI_VERBS.add('دان' + e);
for (const w of NOT_MI_VERBS) MI_VERBS.delete(w);

/**
 * First elements of the Arabic honorific compounds, from `zwnj-lists.ts`.
 *
 * CURATED, BECAUSE THE GENERATIVE VERSION IS WRONG MORE OFTEN THAN RIGHT. Matching any
 * word before «الله» fires on 378 ns0 titles whose commonest first elements are all
 * false: «موتور الله» ×۱۰، «تپه الله» ×۶، «چاه الله» ×۶، «قنات الله» ×۵، «حاجی الله» ×۴،
 * «کلاته الله» ×۳، «کاروانسرای الله» ×۳، and «ناحیه الدین» ×۵ — which is Dean, Hand
 * County, South Dakota. In every one of those «الله» *begins* the following name
 * (الله‌یار، الله‌وردی، الله‌کرم، الله‌نظر، الله‌آباد) and must stay separate from the word
 * before it, which is a well, a hill, a qanat or a caravanserai. Binding them yields
 * «چاه موتورالله یار» and «کلاته‌الله‌نظر».
 *
 * The ابرابزار reached the same conclusion: it has no generic «ال» rule either, only an
 * explicit first-element list, which is the one in `ALLAH_FIRST`.
 */
const HONORIFIC_PAIRS: [string[], string[]][] = [
  [ALLAH_FIRST, ['الله', 'اللهی']],
  [HONORIFIC_FIRST, HONORIFIC_SECOND],
];

/**
 * An Arabic-LANGUAGE title keeps «ال» as a separate definite article all the way
 * through, and must be left alone: «المسالک و الممالک», «کتاب التاجی فی اخبار الدوله
 * الدیلمیه», «بسم الله الرحمن الرحیم», «الاحکام الدینیة فی تکفیر قزلباش». Any Arabic
 * function word, or two «ال…» words in a row, is enough to say so — 58 titles.
 *
 * It over-fires slightly on Persian names containing «بن» («علی بن شمس الدین لاهیجی»),
 * which costs a suggestion rather than publishing a wrong one.
 *
 * «علی» and «و» are deliberately NOT in the list even though they are Arabic function
 * words, because they are also an extremely common Persian name and the Persian "and":
 * «شیخ الاسلام علی اکبر» and «شپش و راه های مقابله با آن» are Persian. Nothing is lost —
 * every Arabic title measured is already caught by «فی», «من», «الی» or by the
 * two-«ال…»-words clause, which is what «المسالک و الممالک» and «بسم الله الرحمن
 * الرحیم» trip on.
 */
const ARABIC_PHRASE = /(^| )(فی|لـ|من|عن|ابن|بن|الی)( |$)|(^|[ (])ال[آ-ی]+ ال[آ-ی]+/;

/** ASCII, Persian (۰-۹) and Arabic-Indic (٠-٩) digits. `\d` is only the first set. */
const DIGITS = '0-9۰-۹٠-٩';

/**
 * Multiplier prefixes in chemical nomenclature. «پلی(متیل متاکریلات)» is written with
 * the bracket tight against the prefix on purpose, and the bracket is full of Persian
 * letters, so nothing else about the title says "leave me alone".
 */
const CHEM_PREFIXES = ['پلی', 'بیس', 'تریس', 'تتراکیس', 'آزوبیس', 'سیکلوبیس'];

/** Bracketed fragments that are part of the name rather than a disambiguator:
 *  «آدم‌کش(ها)» is the plural suffix, not a qualifier. */
const NOT_A_QUALIFIER = new Set(['ها', 'های', 'ان']);

/**
 * After an ellipsis, these take no space before them. Closing punctuation only: an
 * OPENING bracket does take one, so «۱۹۸۳… (دریامردی…)» keeps its space and the «…»
 * tight inside the bracket keeps none.
 */
const CLOSES_AFTER_ELLIPSIS = /[)\]}»،؛:!؟?.…]/;

/**
 * An ellipsis that is a TERM IN A SERIES, not punctuation: «۱ − ۲ + ۳ − ۴ + …».
 *
 * Attaching it to the operator the way prose demands gives «+…», which is wrong in
 * mathematical typography — the ellipsis stands for the remaining terms and is spaced
 * like one. The rule would otherwise propose a title that is wrong in a new way, which
 * is the thing every other guard in this file exists to prevent.
 */
const MATH_OPERATOR_BEFORE = /[+\-−–=×÷<>]$/;
const MATH_OPERATOR_AFTER = /^[+\-−–=×÷<>]/;

/**
 * «...» → «…», then the spacing around every ellipsis in the title.
 *
 * The three rules are Huji's, on the وظیفهٔ ۱۳ request page (۹ اکتبر ۲۰۲۶):
 *
 *   «سه‌نقطه‌ای که وسط یا پایان عبارت است باید به بخش قبلی بچسبد. سه‌نقطه که وسط عبارت
 *    است باید بعدش فاصله باشد. سه‌نقطه‌ای که در ابتدای عبارت است نباید بعدش فاصله باشد.»
 *
 * so «... اما جداً» → «…اما جداً» and «دوستت دارم...آقای هنرمند!» → «دوستت دارم… آقای
 * هنرمند!». Because the pass works on the ellipsis CHARACTER, it also catches titles
 * whose «…» was already correct but mis-spaced, which he asked for in the same note and
 * which the old rule — a bare `replace(/\.{3}/g, '…')` — could not see at all.
 *
 * `{3,}` rather than `{3}`: four dots used to become «….», an ellipsis plus a stray dot,
 * and that is a proposal that is wrong in a new way rather than a title left alone.
 *
 * The match deliberately swallows the whitespace on BOTH sides; re-emitting it is how
 * "attach to the preceding part" is implemented.
 */
export function fixEllipsis(t: string): string {
  return t
    .replace(/\.{3,}/g, '…')
    .replace(/[\s‌]*…[\s‌]*/g, (m, idx: number, full: string) => {
      const head = full.slice(0, idx);
      const tail0 = full.slice(idx + m.length);
      // A term in a series, not punctuation — on either side: «۱ − ۲ + ۳ − ۴ + …» and
      // «… + ۴ + ۳ + ۲ + ۱» are the same title read in two directions.
      if (MATH_OPERATOR_BEFORE.test(head.trimEnd()) || MATH_OPERATOR_AFTER.test(tail0)) return m;
      if (head.trim() === '') return '…';                 // starts the title: nothing after
      const tail = full.slice(idx + m.length);
      if (tail === '') return '…';                        // ends it: nothing after
      return CLOSES_AFTER_ELLIPSIS.test(tail[0]) ? '…' : '… ';
    });
}

export const RULES: Rule[] = [
  {
    id: 'arabic-letters',
    heading: 'حرف‌های عربی',
    explain: 'ی و ک و الف مقصورهٔ عربی («ي»، «ى»، «ك») به شکل فارسی‌شان.',
    apply: t => ARABIC_LETTERS.reduce((s, [re, to]) => s.replace(re, to), t),
  },
  {
    id: 'harakat',
    heading: 'اعراب',
    explain: 'برداشتن اعراب از عنوان. تنوین («ً») برداشته نمی‌شود، چون بخشی از املای واژه‌هایی مانند «کاملاً» است.',
    apply: t => t.replace(HARAKAT, ''),
  },
  {
    id: 'ellipsis',
    heading: 'سه‌نقطه',
    explain:
      'سه نقطهٔ پیاپی («...») به نشانهٔ سه‌نقطه («…»)، و درست‌کردن فاصله‌گذاری آن: '
      + 'سه‌نقطهٔ میانی یا پایانی به بخش پیش از خودش می‌چسبد؛ سه‌نقطهٔ میانی پس از خود یک فاصله می‌گیرد؛ '
      + 'و سه‌نقطه‌ای که عنوان با آن آغاز می‌شود پس از خود فاصله نمی‌گیرد. '
      + 'پیش از نشانه‌های پایانی («؟»، «!»، «)» و مانند آن) فاصله‌ای افزوده نمی‌شود. '
      + 'عنوان‌هایی که نویسهٔ سه‌نقطه‌شان درست است ولی فاصله‌گذاری‌اش نادرست، هم در همین بخش می‌آیند.',
    apply: fixEllipsis,
  },
  {
    id: 'space-before-comma',
    heading: 'فاصله پیش از ویرگول',
    explain: 'برداشتن فاصله یا نیم‌فاصلهٔ پیش از ویرگول.',
    apply: t => t.replace(new RegExp(`[ ${ZWNJ}]+،`, 'g'), '،'),
  },
  {
    id: 'space-after-comma',
    heading: 'نبود فاصله پس از ویرگول',
    // Two guards, both from rows this rule actually produced on the live wiki:
    //
    //   «۱،۵۰۰» — the thousands separator is not a missing space. The digit class has
    //   to name the Persian and Arabic-Indic digits explicitly; `\d` matches only
    //   ASCII, so a guard written with it is no guard at all on a fa title.
    //
    //   «کبالت(II،III) اکسید», «N،N-دی‌متیل‌آمینومتیل‌فروسن» — in a chemical name the
    //   separator between oxidation states or locants is a Latin comma written tight,
    //   and the whitelist already carries «منگنز (II, III) اکسید» and
    //   «اکسید نقره (I, III)» as titles editors settled on. Adding a space after a
    //   Persian comma there would propose a title that is wrong in a second way. Any
    //   Latin letter beside the comma means this is not Persian prose.
    //   «یک، دو، سه،… پنج» — an ellipsis must stay tight against what precedes it, so a
    //   comma followed by one does NOT get a space inserted between them. Without this
    //   the two rules fight: the ellipsis rule attaches it and the comma rule pushes it
    //   away again, and the loser is whichever runs second.
    explain: 'افزودن فاصله پس از ویرگولی که میان دو واژهٔ فارسی آمده است. ویرگول میان رقم‌ها («۱،۵۰۰»)، ویرگول درون نام‌های شیمیایی، و ویرگولی که پس از آن سه‌نقطه آمده دست‌نخورده می‌ماند.',
    apply: t => t.replace(new RegExp(`([^\\s${DIGITS}A-Za-z])،(?=[^\\s${DIGITS})A-Za-z…])`, 'g'), '$1، '),
  },
  {
    id: 'space-before-paren',
    heading: 'نبود فاصله پیش از پرانتز',
    // Four guards, every one of them a row this rule produced against the live wiki:
    //
    //   «قلع(II)», «نقره(I,III) اکسید» — needs a Persian letter inside the brackets,
    //   so an oxidation state is left alone.
    //   «پلی(متیل متاکریلات)», «۴٬۴-آزوبیس(۴-سیانوپنتانویک اسید)» — a polymer or
    //   bridged name writes the bracket tight against a multiplier prefix, and the
    //   bracket IS full of Persian letters, so the first guard does not see it.
    //   «شط‌(ولاشان)», «واتربوری.(ورمونت)», «سلولز سنتاز -(تشکیل UDP)» — when what
    //   precedes the bracket is a ZWNJ, a dot or a dash, inserting a space leaves the
    //   stray character behind, i.e. proposes a title that is still wrong. The
    //   character before the bracket must be a letter or a digit.
    //   «داوود باقری( فوتسال)» — a space just inside the bracket is the same defect
    //   and is closed in the same move, so the proposal is complete.
    //
    // «۴۰۱(کی)» and «پنتسر ۳۵(تی)» are 401(k) and Panzer 35(t), written tight in the
    // source language, and no mechanical guard can tell them from a qualifier. They
    // are what the whitelist is for.
    explain: 'افزودن فاصله پیش از پرانتز ابهام‌زدایی. پرانتزهایی که درونشان حرف فارسی نیست (مانند درجهٔ اکسایش) و نام‌های شیمیایی مانند «پلی(…)» دست‌نخورده می‌مانند.',
    apply: t => {
      // A closing bracket counts as a letter here: «والکور (کبک)(شهرک)» has two
      // qualifiers and separating them leaves nothing stray behind.
      const m = new RegExp(`^(.*[\\p{L}\\p{N})])\\(\\s*([^()]*[آ-ی][^()]*?)\\s*\\)$`, 'u').exec(t);
      if (!m) return t;
      const inner = m[2];
      if (NOT_A_QUALIFIER.has(inner)) return t;
      const word = m[1].split(' ').pop()!;
      if (CHEM_PREFIXES.some(p => word.endsWith(p))) return t;
      return `${m[1]} (${inner})`;
    },
  },
  {
    id: 'latin-year',
    heading: 'رقم لاتین در سال',
    // Anchored on the word, never on the digits. Measured over ns0 on ۱۱ اکتبر ۲۰۲۶:
    // 1,219 titles carry a Latin digit but only 152 also carry Persian letters, and
    // nearly all of THOSE are identifiers where the Latin digit is correct —
    // «افلاتوکسین B1», «ویروس آنفلوانزای نوع A زیرگروه H5N1», «ژن TCOF1»,
    // «پرلود و فوگ در دو ماژور (BWV 870)», «نوکیا X2-02», «الگوریتم C4.5». A blanket
    // "Persianise every Latin digit" rule would be wrong far more often than right.
    // «سال», «زاده» and «متولد» pin it to a year in running Persian: 8, 2 and 1 titles,
    // every one a real case. «متولد» was missed on the first pass and the gap showed up
    // in the published output — «ژائو پدرو (بازیکن فوتبال, متولد 1993)» had its comma
    // fixed while the year stayed Latin, i.e. the report proposed a title that was still
    // wrong. Measured and deliberately absent: «درگذشته», «دههٔ», «زادهٔ», «مرگ» and
    // «قرن» match nothing, and a rule with no members is a liability.
    explain: 'رقم لاتین سالی که پس از «سال»، «زاده» یا «متولد» آمده، به رقم فارسی. رقم‌های لاتینِ درونِ نام‌ها و شناسه‌ها (مانند «افلاتوکسین B1» یا «ژن TCOF1») دست‌نخورده می‌مانند.',
    apply: t => t.replace(/((?:سال|زاده|متولد)\s+)([0-9]{3,4})(?![0-9])/g,
      (_, w, y) => w + y.replace(/[0-9]/g, (d: string) => '۰۱۲۳۴۵۶۷۸۹'[+d])),
  },
  {
    id: 'latin-comma',
    heading: 'ویرگول لاتین',
    // Same shape of guard as «نبود فاصله پس از ویرگول», and for the same reason: a
    // Latin comma is CORRECT inside a chemical name, where it separates locants or
    // oxidation states — «N,N-دی‌ایزوپروپیل‌آمینو اتانول», «(R,R)-تترا هیدروکریزن»,
    // «سولفید آهن (II, III)», «(۸z,۶z,۴z,۲z)-تیونین». Every one of those has a LATIN
    // letter immediately before the comma, which is what distinguishes them from a
    // disambiguator comma written with the wrong key: «(بازیکن فوتبال, زاده ۱۹۹۲)».
    // Of 21 titles with a Latin comma beside Persian text, those two shapes are the
    // whole population.
    explain: 'ویرگول لاتین («,») میان دو واژهٔ فارسی به ویرگول فارسی («،»). ویرگول درون نام‌های شیمیایی، که پیش از آن حرف لاتین است، دست‌نخورده می‌ماند.',
    apply: t => t.replace(/([آ-ی۰-۹]),\s*(?=[آ-ی])/g, '$1، '),
  },
  {
    id: 'alef-words',
    heading: 'آ و ا',
    explain: 'واژه‌هایی که با «آ» نوشته شده‌اند و املای پذیرفته‌شده‌شان با «ا» است.',
    apply: t => ALEF_WORDS.reduce((s, [from, to]) => s.split(from).join(to), t),
  },
  {
    id: 'zwnj-compounds',
    heading: 'نیم‌فاصله',
    explain: 'ترکیب‌های مشخصی که با فاصله نوشته شده‌اند و نیم‌فاصله می‌خواهند. این یک فهرست معین است، نه قاعده‌ای که از خود واژه حدس زده شود.',
    apply: t => ZWNJ_COMPOUNDS.reduce((s, [from, to]) => s.split(from).join(to), t),
  },
  {
    id: 'zwnj-plural',
    heading: 'نیم‌فاصله پیش از «ها»',
    explain: 'پسوند جمع («ها»، «های»، «هایی») که با فاصله نوشته شده، به واژهٔ پیش از خود می‌چسبد. '
      + 'اگر واژه به حرفی پایان یابد که از چپ نمی‌چسبد («ا آ د ذ ر ز ژ و»)، تنها فاصله برداشته '
      + 'می‌شود و نیم‌فاصله‌ای نمی‌آید، چون نیم‌فاصلهٔ نالازم در عنوان پذیرفته نمی‌شود. '
      + 'نام‌های آوانویسی‌شدهٔ خاور دور که در آنها «ها» بخشی از نام است («کیم ها یون») گزارش نمی‌شوند.',
    apply: t => t.replace(
      new RegExp(`([آ-ی]{3,}) (${BINDING_SUFFIXES.join('|')})(?=[ )]|$)`, 'g'),
      (m, left, suffix, offset: number) => {
        // The syllable before, and the one after, decide whether this is a plural at all.
        const rest = t.slice(offset + m.length);
        // Any such syllable ANYWHERE in the title, not just beside the «ها»: «کیم مین ها»
        // and «پارک مین ها» are Kim Min-ha and Park Min-ha, and the neighbour there is
        // «مین», which is also the Persian for a landmine and so cannot be listed.
        if (t.split(/[ ()]/).some(w => EAST_ASIAN_SYLLABLES.has(w))) return m;
        // «های» and «هایی» are the plural plus ezafe: they REQUIRE a following noun, so a
        // Persian title cannot end in one. Every ns0 title that did was a transliterated
        // English «High» or Vietnamese «Hai» — «رینبو های» (Rainbow High), «مانستر های»,
        // «پایونیر های», «ناوچه کلاس-نینگ های» (Ninghai class), «اپیک های», «جانی های».
        // Bare «ها» is a complete plural and may end a title («گلوتامات ها», «نبرد نینجا
        // ها»), so the restriction is on the ezafe forms only.
        if (suffix !== 'ها' && !rest.replace(/[)\s]/g, '')) return m;
        return bind(left, suffix);
      }),
  },
  {
    id: 'zwnj-nisba',
    heading: 'نیم‌فاصله پیش از «ای»',
    explain: 'پسوند نسبت («ای») پس از واژه‌ای که به «ه» پایان می‌یابد، به آن واژه می‌چسبد: '
      + '«منطقه ای» → «منطقه‌ای». تنها پس از «ه» اعمال می‌شود، چون «ای» تنها در جاهای دیگر '
      + 'بیشتر حرف نخست نام لاتین است («مایکل ای مان») و نه پسوند.',
    // The vocative «ای» («ای آینه ای آینه», «مژده ای دل») is the residual false positive
    // and is left to the whitelist: it is two titles, and telling it apart needs to know
    // the line is a poem.
    apply: t => t.replace(/([آ-ی]{2,}ه) ای(?=[ )]|$)/g, (_, left) => bind(left, 'ای')),
  },
  {
    id: 'zwnj-verb',
    heading: 'نیم‌فاصله در فعل',
    explain: 'پیشوند «می» و «نمی» به فعل پس از خود می‌چسبد: «می شود» → «می‌شود». '
      + 'تنها زمانی اعمال می‌شود که واژهٔ پس از آن فعلی صرف‌شده باشد، چون «می» خودش هم '
      + 'واژه است («می خواه و گل افشان کن») و هم در نام‌های آوانویسی‌شده می‌آید («کیم می سوک»).',
    apply: t => t.replace(/(^|[ (])(ن?می) ([آ-ی]+)/g,
      (m, before, prefix, word) => MI_VERBS.has(word) ? before + prefix + ZWNJ + word : m),
  },
  {
    id: 'zwnj-honorific',
    heading: 'نیم‌فاصله در لقب‌های عربی',
    explain: 'لقب‌های دوپارهٔ عربی («زین العابدین»، «شیخ الاسلام»، «آیت الله») که با فاصله '
      + 'نوشته شده‌اند. پارهٔ نخست از فهرستی معین خوانده می‌شود، نه از خود عنوان حدس زده '
      + 'می‌شود؛ و عنوان‌های عربی‌زبان، که در آنها «ال» حرف تعریف جداست، دست‌نخورده می‌مانند.',
    apply: t => {
      if (ARABIC_PHRASE.test(t)) return t;
      return HONORIFIC_PAIRS.reduce((s, [firsts, seconds]) => s.replace(
        new RegExp(`(^|[ (])(${firsts.join('|')}) (${seconds.join('|')})(?![آ-ی])`, 'g'),
        (_, before, first, second) => before + bind(first, second)), t);
    },
  },
];

const RULE_BY_ID = new Map(RULES.map(r => [r.id, r]));

export interface Suggestion {
  title: string;
  target: string;
  /** every rule that changed something, in rule order */
  rules: string[];
}

/** Characters MediaWiki will not accept in a title at all. */
const ILLEGAL = /[#<>[\]{}|]|%[0-9A-Fa-f]{2}/;

/**
 * The whole rule engine: cumulative, in a fixed order, no network. Returns null when
 * the title is already fine or when the result cannot be trusted.
 *
 * Refuses non-idempotent results. If running the rules over the PROPOSED title changes
 * it again, the rule set disagrees with itself about where the title should end up, and
 * publishing the first step would invite a move that the next run proposes moving again.
 */
export function suggest(title: string): Suggestion | null {
  let target = title;
  const rules: string[] = [];
  for (const r of RULES) {
    const next = r.apply(target);
    if (next !== target) { rules.push(r.id); target = next; }
  }
  if (!rules.length) return null;

  target = target.replace(/\s+/g, ' ').trim();
  if (!target || target === title) return null;
  if (target.length > 255 || ILLEGAL.test(target)) return null;

  // idempotence: the proposal must be a fixed point of the same rules
  let settled = target;
  for (const r of RULES) settled = r.apply(settled);
  if (settled.replace(/\s+/g, ' ').trim() !== target) return null;

  return { title, target, rules };
}

// ---------------------------------------------------------------------------
// Whitelist
// ---------------------------------------------------------------------------

/**
 * Titles editors have declared correct as they stand. The page has been maintained by
 * hand since 2017 and the entries are not uniform: some are wikilinks, most are bare
 * text, some have no space after the bullet. Parse all of those, and ignore everything
 * that is not a list item so the page can carry its own instructions.
 */
export function parseWhitelist(wikitext: string): Set<string> {
  const out = new Set<string>();
  for (const line of wikitext.split('\n')) {
    const m = /^\s*[*#]+\s*(.*)$/.exec(line);
    if (!m) continue;
    let entry = m[1].trim();
    const link = /^\[\[([^\]|]+)/.exec(entry);
    if (link) entry = link[1];
    entry = entry.replace(/'''?/g, '').replace(/<[^>]*>/g, '').replace(/_/g, ' ').trim();
    if (entry) out.add(entry);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Report rendering
// ---------------------------------------------------------------------------

export type TargetState = 'free' | 'redirect' | 'article';

export interface Row extends Suggestion {
  targetState: TargetState;
}

const MONTHS = ['ژانویه', 'فوریه', 'مارس', 'آوریل', 'مه', 'ژوئن',
                'ژوئیه', 'اوت', 'سپتامبر', 'اکتبر', 'نوامبر', 'دسامبر'];

function today(d = new Date()): string {
  return `${fa(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${fa(d.getUTCFullYear())}`;
}

/** The move link the old report used, kept byte-for-byte in shape so the page reads the same. */
function moveLink(from: string, to: string): string {
  const u = (s: string) => encodeURI(s.replace(/ /g, '_')).replace(/\?/g, '%3F');
  return `<small>([//fa.wikipedia.org/wiki/Special:MovePage/${u(from)}?wpNewTitleMain=${u(to)} انتقال])</small>`;
}

export interface Stats {
  scanned: number;
  whitelisted: number;
  /** dropped because an article already sits on the proposed title */
  occupied: number;
}

export function buildReport(
  rows: Row[], stats: Stats, now = new Date(), target: Target = TARGETS.article,
): string {
  // The rules run on the bare title — nothing should rewrite «رده:» itself — so the
  // namespace prefix is put back here, for display, for the link and for the move URL.
  const full = (t: string) => `${target.prefix}${t}`;
  const link = (t: string) => `[[${target.colon}${full(t)}]]`;
  const listed = rows.filter(r => r.targetState !== 'article');

  const head = [
    HEADER_TEMPLATE,
    '',
    `این فهرست ${target.what}‌هایی است که املا یا سجاوندی عنوانشان با شیوهٔ ویکی‌پدیای فارسی`,
    'نمی‌خواند، همراه با عنوان پیشنهادی و پیوند تغییرنام. فهرست خودکار ساخته می‌شود ولی',
    'تغییرنام با دست انجام می‌گیرد؛ هیچ صفحه‌ای خودکار جابه‌جا نمی‌شود.',
    '',
    `اگر عنوانی درست است و نباید جابه‌جا شود، آن را به [[${whitelistPage(target)}|فهرست سفید]] بیفزایید؛`,
    'از آن پس در این گزارش نمی‌آید. هر قاعده زیر عنوان بخش خودش توضیح داده شده است، تا اگر',
    'با قاعده‌ای موافق نیستید بتوانید دربارهٔ همان بخش گفتگو کنید.',
    '',
    `آخرین به‌روزرسانی: ${today(now)}`,
    `بررسی‌شده: ${fa(stats.scanned)} عنوان؛ پیشنهاد: ${fa(listed.length)}؛ ` +
      `در فهرست سفید: ${fa(stats.whitelisted)}؛ مقصد از پیش مقاله دارد: ${fa(stats.occupied)}`,
    '',
  ];

  const body: string[] = [];
  for (const rule of RULES) {
    const mine = listed.filter(r => r.rules[0] === rule.id);
    if (!mine.length) continue;
    const shown = mine.slice(0, MAX_PER_SECTION);
    body.push(`== ${rule.heading} ==`, rule.explain, '');
    for (const r of shown) {
      const extra = r.rules.length > 1
        ? ` <small>(${r.rules.slice(1).map(id => RULE_BY_ID.get(id)!.heading).join('، ')})</small>`
        : '';
      const redirect = r.targetState === 'redirect'
        ? ' <small>(مقصد تغییرمسیر است)</small>'
        : '';
      body.push(`# ${link(r.title)} > ${link(r.target)} `
        + `${moveLink(full(r.title), full(r.target))}${extra}${redirect}`);
    }
    if (mine.length > shown.length) {
      body.push('', `(${fa(mine.length - shown.length)} مورد دیگر از این بخش در این اجرا نیامد.)`);
    }
    body.push('');
  }

  if (!body.length) body.push('در این اجرا موردی یافت نشد.', '');

  return [...head, ...body, '[[رده:گزارش‌های دیتابیس ویکی‌پدیا]]'].join('\n');
}

// ---------------------------------------------------------------------------
// Enumeration, target checking, publishing
// ---------------------------------------------------------------------------

const CACHE = `${process.env.BOT_STATE_DIR ?? '.state'}/ns0-titles.json`;

/**
 * Every article title in ns0, from the replica, cached for the day. The enumeration is
 * the only expensive part of a run and the titles do not change much in an hour, so a
 * re-run while tuning a rule costs nothing.
 */
export async function allTitles(
  target: Target = TARGETS.article, refresh = false, backend: Backend = 'auto',
): Promise<string[]> {
  const cache = target.ns === 0 ? CACHE : CACHE.replace(/\.json$/, `-ns${target.ns}.json`);
  if (!refresh && existsSync(cache)) {
    const c = JSON.parse(readFileSync(cache, 'utf8')) as { at: string; titles: string[] };
    const ageHours = (Date.now() - Date.parse(c.at)) / 3_600_000;
    if (ageHours < 20) {
      console.log(`فهرست عنوان‌ها از حافظهٔ نهان: ${fa(c.titles.length)} عنوان (${ageHours.toFixed(1)} ساعت)`);
      return c.titles;
    }
  }
  const titles = target.ns === 0
    ? await articleTitles(backend)
    : (await queryRows(
        `SELECT page_title FROM page WHERE page_namespace = ${target.ns} AND page_is_redirect = 0`,
        { wiki: 'fa', mode: backend })).map(r => r.page_title.replace(/_/g, ' '));
  mkdirSync(dirname(cache), { recursive: true });
  writeFileSync(cache, JSON.stringify({ at: new Date().toISOString(), titles }));
  console.log(`فهرست عنوان‌ها: ${fa(titles.length)} عنوان`);
  return titles;
}

/**
 * Is the proposed title free, a redirect, or a live article? An article there means the
 * proposal is a merge question and not a move, so it is dropped rather than listed.
 */
export async function targetStates(bot: Bot, targets: string[]): Promise<Map<string, TargetState>> {
  const out = new Map<string, TargetState>();
  for (let i = 0; i < targets.length; i += 50) {
    const batch = targets.slice(i, i + 50);
    const r = await bot.apiGet({ action: 'query', prop: 'info', titles: batch.join('|') });
    for (const p of r.query.pages ?? []) {
      // The API normalises the title it echoes back; map by the normalised form and
      // fall back to the request form, so a row is never silently left unclassified.
      const state: TargetState = p.missing ? 'free' : p.redirect ? 'redirect' : 'article';
      out.set(p.title, state);
    }
    for (const t of batch) if (!out.has(t)) out.set(t, 'free');
  }
  return out;
}

async function fetchWhitelist(bot: Bot, target: Target = TARGETS.article): Promise<Set<string>> {
  const r = await bot.apiGet({ action: 'query', prop: 'revisions', titles: whitelistPage(target),
    rvprop: 'content', rvslots: 'main' });
  const p = r.query.pages[0];
  if (p.missing) return new Set();
  return parseWhitelist(p.revisions[0].slots.main.content);
}

/**
 * A handful of rules applied to known titles, with no network and no database.
 *
 * This exists so the Toolforge bundle can be gated: `build-bundle.ts` runs it and
 * requires the exact line below. A bundle that imported cleanly but whose rules were
 * mangled by bundling would otherwise look perfectly healthy right up until it
 * published a page full of wrong proposals.
 */
export function selfTest(): string {
  const cases: [string, string | null][] = [
    ['سفيه', 'سفیه'],
    ['اول آمدند ...', 'اول آمدند…'],
    ['مارک(ناحیه)', 'مارک (ناحیه)'],
    ['پلی(متیل متاکریلات)', null],
    ['کی. پی. کانداسامی', null],
    ['تهران', null],
  ];
  for (const [input, want] of cases) {
    const got = suggest(input)?.target ?? null;
    if (got !== want) return `SELFTEST FAILED: «${input}» → «${got}», expected «${want}»`;
  }
  // A bare [[رده:X]] FILES this page into that category instead of linking to it, and
  // the report would silently join every category it lists. Namespace 14 must link with
  // a leading colon; namespace 10 must not grow one, because a template link is a link.
  const catRow = buildReport(
    [{ title: 'الف', target: 'ب', rules: ['arabic-letters'], targetState: 'free' }],
    { scanned: 1, whitelisted: 0, occupied: 0 }, new Date(), TARGETS.category)
    .split('\n').find(l => l.startsWith('# ')) ?? '';
  if (!catRow.includes('[[:رده:الف]]')) return `SELFTEST FAILED: category link would categorise: ${catRow.slice(0, 60)}`;
  const tplRow = buildReport(
    [{ title: 'الف', target: 'ب', rules: ['arabic-letters'], targetState: 'free' }],
    { scanned: 1, whitelisted: 0, occupied: 0 }, new Date(), TARGETS.template)
    .split('\n').find(l => l.startsWith('# ')) ?? '';
  if (!tplRow.includes('[[الگو:الف]]')) return `SELFTEST FAILED: template link wrong: ${tplRow.slice(0, 60)}`;

  // A ZWNJ after a letter that does not join forward is UNNECESSARY, and AbuseFilter 27
  // disallows a title containing one — so this is a blocked move, not a bad suggestion,
  // and it belongs in the gated selftest rather than only in the unit tests.
  if (bind('استاندارد', 'های') !== 'استانداردهای') {
    return `SELFTEST FAILED: ZWNJ after «د» would be rejected by AbuseFilter 27: ${bind('استاندارد', 'های')}`;
  }
  if (bind('آزمون', 'های') !== `آزمون${ZWNJ}های`) {
    return 'SELFTEST FAILED: «ن» joins forward and needs the ZWNJ';
  }

  // The project-space subpage guard. Without it that report was 3,312 rows of DYK
  // archives and transcluded date pages — see the TARGETS header. A real title with a
  // real defect must still be reported, so both directions are asserted.
  if (considered(TARGETS.project, 'آیا می‌دانستید که...؟/پیش‌نویس/الف')) {
    return 'SELFTEST FAILED: project subpages are back in scope';
  }
  if (!considered(TARGETS.project, 'چرا ویکی‌پدیا دیگر دوزار نمی‌ارزد؟')) {
    return 'SELFTEST FAILED: a top-level project page was skipped';
  }
  if (!considered(TARGETS.article, 'الف/ب')) {
    return 'SELFTEST FAILED: the guard leaked into main space, where «/» is part of titles';
  }

  // Prove the publish gate can actually run from wherever this is: it is a Python
  // file that cannot be bundled, and a bundle looks perfectly healthy until the gate
  // fires at the very end of a run and cannot find gates.py.
  try {
    checkWikitext(REPORT_PAGE, 'یک خط آزمایشی.');
  } catch (e) {
    return `SELFTEST FAILED: the publish gate could not run — ${(e as Error).message}`;
  }
  return `SELFTEST OK: ${cases.length} مورد، ${RULES.length} قاعده، دروازه در دسترس`;
}

export async function run(target: Target = TARGETS.article) {
  if (process.argv.includes('--selftest')) {
    const line = selfTest();
    console.log(line);
    if (!line.startsWith('SELFTEST OK')) process.exit(1);
    return;
  }
  const live = process.argv.includes('--live');
  const refresh = process.argv.includes('--refresh');
  const sampleArg = process.argv.indexOf('--sample');
  const sample = sampleArg >= 0 ? Number(process.argv[sampleArg + 1]) : 0;

  // flagEdits: false — MamouriBot writes this page, but WITHOUT `bot=1`, so the edit
  // shows up in recent changes and on watchlists. That is what the BAG asked for when
  // it declined the permission request as unnecessary («ویرایش‌هایش را بدون پرچم ربات
  // انجام دهد بهتر است … پرچم ربات برای ویرایش‌های متعدد است»): the flag is flood
  // control, and this task writes one page a day. It stays on the bot account — the flag
  // is per-edit opt-in, so nothing here needs the operator's own credentials.
  const bot = new Bot({ dryRun: !live, delayMs: 0, limit: 0, maxlag: 5, flagEdits: false });

  console.log(`گزارش: ${target.page}`);
  const whitelist = await fetchWhitelist(bot, target);
  console.log(`فهرست سفید: ${fa(whitelist.size)} عنوان`);

  const backendArg = process.argv.indexOf('--backend');
  const backend = (backendArg >= 0 ? process.argv[backendArg + 1] : 'auto') as Backend;
  let titles = await allTitles(target, refresh, backend);
  if (sample) titles = titles.slice(0, sample);

  const suggestions: Suggestion[] = [];
  let whitelisted = 0;
  let subpages = 0;
  for (const t of titles) {
    if (!considered(target, t)) { subpages++; continue; }
    const s = suggest(t);
    if (!s) continue;
    if (whitelist.has(s.title) || whitelist.has(s.target)) { whitelisted++; continue; }
    suggestions.push(s);
  }
  if (subpages) console.log(`زیرصفحه‌های نادیده‌گرفته: ${fa(subpages)}`);
  console.log(`پیشنهادها پیش از بررسی مقصد: ${fa(suggestions.length)}`);

  // Existence is checked on the FULL title, prefix included, or every category target
  // would come back «free» because «X» is not «رده:X».
  const states = await targetStates(bot, [...new Set(suggestions.map(s => target.prefix + s.target))]);
  const rows: Row[] = suggestions.map(s => ({ ...s, targetState: states.get(target.prefix + s.target) ?? 'free' }));
  const occupied = rows.filter(r => r.targetState === 'article').length;

  const capped = rows.filter(r => r.targetState !== 'article').slice(0, MAX_ROWS);
  // `scanned` is what the rules actually looked at, not how big the namespace is: the
  // report says «از N عنوان بررسی‌شده», and counting skipped subpages there would be a lie.
  const text = buildReport(capped, { scanned: titles.length - subpages, whitelisted, occupied },
    new Date(), target);

  const problems = checkWikitext(target.page, text);
  if (problems.length) throw new Error('GATE FAILED:\n  - ' + problems.join('\n  - '));

  if (!live) {
    console.log(text);
    console.log(`\n--- آزمایشی. برای انتشار: --live`);
    return;
  }
  const cur = await bot.apiGet({ action: 'query', prop: 'revisions', titles: target.page,
    rvprop: 'content|ids|timestamp', rvslots: 'main' });
  const p = cur.query.pages[0];
  await bot.edit(target.page, text, 'به‌روزرسانی گزارش عنوان‌های نیازمند تغییرنام',
    p.missing ? 0 : p.revisions[0].revid, p.missing ? '' : p.revisions[0].timestamp,
    { allowCreate: true });
  console.log(`منتشر شد: ${target.page}`);

  // The «آخرین به‌روزرسانی» column on وپ:گد is not derived from the page history — the
  // {{گزارش دیتابیس}} row TRANSCLUDES `<report>/امضا`, so the index shows whatever that
  // subpage says. Rezabot last wrote it in 2021, and until this ran the index advertised
  // a daily report as last updated five years ago. Five tildes: MediaWiki substitutes a
  // bare timestamp, which is all the cell may contain. The RLM keeps the date from
  // rendering backwards inside an RTL table cell.
  const sigPage = signatureFor(target);
  const sig = await bot.apiGet({ action: 'query', prop: 'revisions', titles: sigPage,
    rvprop: 'ids|timestamp', rvslots: 'main' });
  const sp = sig.query.pages[0];
  await bot.edit(sigPage, '\u200f~~~~~', 'به‌روزرسانی زمان آخرین اجرا',
    sp.missing ? 0 : sp.revisions[0].revid, sp.missing ? '' : sp.revisions[0].timestamp,
    { allowCreate: true });
  console.log(`زمان به‌روزرسانی ثبت شد: ${sigPage}`);
}
