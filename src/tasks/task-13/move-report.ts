/**
 * وظیفهٔ ۱۳ — ویکی‌پدیا:گزارش دیتابیس/برای انتقال مقاله
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
import { articleTitles, type Backend } from '../../lib/replica.js';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname } from 'path';

export const REPORT_PAGE = 'ویکی‌پدیا:گزارش دیتابیس/برای انتقال مقاله';
export const WHITELIST_PAGE = `${REPORT_PAGE}/فهرست سفید`;
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

export function buildReport(rows: Row[], stats: Stats, now = new Date()): string {
  const listed = rows.filter(r => r.targetState !== 'article');

  const head = [
    HEADER_TEMPLATE,
    '',
    'این فهرست عنوان‌هایی است که املا یا سجاوندی‌شان با شیوهٔ ویکی‌پدیای فارسی نمی‌خواند،',
    'همراه با عنوان پیشنهادی و پیوند انتقال. فهرست خودکار ساخته می‌شود ولی انتقال با دست',
    'انجام می‌گیرد؛ هیچ مقاله‌ای خودکار جابه‌جا نمی‌شود.',
    '',
    `اگر عنوانی درست است و نباید جابه‌جا شود، آن را به [[${WHITELIST_PAGE}|فهرست سفید]] بیفزایید؛`,
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
      body.push(`# [[${r.title}]] > [[${r.target}]] ${moveLink(r.title, r.target)}${extra}${redirect}`);
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
export async function allTitles(refresh = false, backend: Backend = 'auto'): Promise<string[]> {
  if (!refresh && existsSync(CACHE)) {
    const c = JSON.parse(readFileSync(CACHE, 'utf8')) as { at: string; titles: string[] };
    const ageHours = (Date.now() - Date.parse(c.at)) / 3_600_000;
    if (ageHours < 20) {
      console.log(`فهرست عنوان‌ها از حافظهٔ نهان: ${fa(c.titles.length)} عنوان (${ageHours.toFixed(1)} ساعت)`);
      return c.titles;
    }
  }
  const titles = await articleTitles(backend);
  mkdirSync(dirname(CACHE), { recursive: true });
  writeFileSync(CACHE, JSON.stringify({ at: new Date().toISOString(), titles }));
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

async function fetchWhitelist(bot: Bot): Promise<Set<string>> {
  const r = await bot.apiGet({ action: 'query', prop: 'revisions', titles: WHITELIST_PAGE,
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

export async function run() {
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

  const whitelist = await fetchWhitelist(bot);
  console.log(`فهرست سفید: ${fa(whitelist.size)} عنوان`);

  const backendArg = process.argv.indexOf('--backend');
  const backend = (backendArg >= 0 ? process.argv[backendArg + 1] : 'auto') as Backend;
  let titles = await allTitles(refresh, backend);
  if (sample) titles = titles.slice(0, sample);

  const suggestions: Suggestion[] = [];
  let whitelisted = 0;
  for (const t of titles) {
    const s = suggest(t);
    if (!s) continue;
    if (whitelist.has(s.title) || whitelist.has(s.target)) { whitelisted++; continue; }
    suggestions.push(s);
  }
  console.log(`پیشنهادها پیش از بررسی مقصد: ${fa(suggestions.length)}`);

  const states = await targetStates(bot, [...new Set(suggestions.map(s => s.target))]);
  const rows: Row[] = suggestions.map(s => ({ ...s, targetState: states.get(s.target) ?? 'free' }));
  const occupied = rows.filter(r => r.targetState === 'article').length;

  const capped = rows.filter(r => r.targetState !== 'article').slice(0, MAX_ROWS);
  const text = buildReport(capped, { scanned: titles.length, whitelisted, occupied });

  const problems = checkWikitext(REPORT_PAGE, text);
  if (problems.length) throw new Error('GATE FAILED:\n  - ' + problems.join('\n  - '));

  if (!live) {
    console.log(text);
    console.log(`\n--- آزمایشی. برای انتشار: --live`);
    return;
  }
  const cur = await bot.apiGet({ action: 'query', prop: 'revisions', titles: REPORT_PAGE,
    rvprop: 'content|ids|timestamp', rvslots: 'main' });
  const p = cur.query.pages[0];
  await bot.edit(REPORT_PAGE, text, 'به‌روزرسانی گزارش عنوان‌های نیازمند انتقال',
    p.missing ? 0 : p.revisions[0].revid, p.missing ? '' : p.revisions[0].timestamp,
    { allowCreate: true });
  console.log(`منتشر شد: ${REPORT_PAGE}`);
}
