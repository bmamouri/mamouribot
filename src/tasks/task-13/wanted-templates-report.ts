/**
 * وظیفهٔ ۱۳ — ویکی‌پدیا:گزارش دیتابیس/الگوهای ناموجود پرکاربرد در مقاله‌ها
 *
 * The 1,000 missing templates that the most articles call, ranked by how many articles
 * show them as a red link, so that fixing from the top repairs the most articles per
 * edit. Example that prompted it: «آرایه زمان‌بندی تپ‌اختر اروپا» ends with
 * `{{اخترشناسی امواج گرانشی}}`, a template fa does not have.
 *
 * WHAT COUNTS AS "USED AND RED". A transclusion of a missing page is recorded in
 * `templatelinks` whether or not it renders: a call inside a branch that never fires,
 * or behind `#ifexist`, is recorded too and shows nothing. A red transclusion also
 * records a `pagelinks` row to the same target (that is the red link), so the count is
 * articles having BOTH. Measured ۱۳ نوامبر ۲۰۲۶: of the top 1,000 by bare
 * transclusion count, 49 never rendered at all (`Play`, 431 articles, called by
 * `{{شنیدن}}` in a branch that never fires) and would have topped the list for nothing.
 *
 * WHY "VIA" MATTERS. Often an existing template calls the missing one: `RegioneIT
 * (unlinked)` is red in 459 articles only because the Italian province templates call
 * it. Fixing that one caller fixes them all, so each row names the existing templates
 * through which most of its articles reach it.
 *
 * SUGGESTIONS, AND WHICH ONES ARE GUESSES. Each source is labelled on the page:
 *   - same title exists on en.wikipedia: a fact (about half the list has Latin names);
 *   - that en template's fa interwiki points at an existing fa template: a fact;
 *   - the move log moved the title without leaving a redirect: a fact;
 *   - an existing fa template whose name differs only in spacing, ZWNJ, hamza, Arabic
 *     letters or letter case, or a «X-خرد»/«خرد-X» swap: a GUESS;
 *   - co-occurrence: the en template present on (nearly) every en counterpart of the
 *     articles using it, and rare elsewhere: a GUESS. Only for Persian-named templates
 *     with nothing better, stub names only matched to en stubs and the reverse, and a
 *     candidate whose fa equivalent is already on those articles is dropped (it is a
 *     neighbour, not the missing one: «کوگو-خرد» co-occurs with «Consorts of Japan»,
 *     which fa already has as «امپراتریس‌های ژاپن»).
 */
import { fa, phpUnserialize, sqlString } from './ac-moves-report.js';

export const WANTED_TEMPLATES_PAGE = 'ویکی‌پدیا:گزارش دیتابیس/الگوهای ناموجود پرکاربرد در مقاله‌ها';
export const TOP_N = 1000;

// ---------------------------------------------------------------------------
// SQL
// ---------------------------------------------------------------------------

/** Missing ns-10 targets, by the number of distinct articles where they render red. */
export function wantedSql(limit = TOP_N): string {
  return `
SELECT lt_id, lt_title, COUNT(DISTINCT tl_from) AS n
FROM templatelinks
JOIN linktarget ON lt_id = tl_target_id
JOIN pagelinks ON pl_from = tl_from AND pl_target_id = tl_target_id
LEFT JOIN page ON page_namespace = 10 AND page_title = lt_title
WHERE tl_from_namespace = 0 AND lt_namespace = 10 AND page_id IS NULL
GROUP BY lt_id, lt_title
ORDER BY n DESC, lt_title
LIMIT ${limit}`;
}

/** Existing templates whose own page transcludes one of the missing ones. */
export function callersSql(ids: string[]): string {
  return `
SELECT tl_target_id, page_title FROM templatelinks JOIN page ON page_id = tl_from
WHERE tl_target_id IN (${ids.join(',')}) AND tl_from_namespace = 10 AND page_namespace = 10`;
}

/** For each (missing, caller) pair: how many articles use both. */
export function callerOverlapSql(ids: string[], callers: string[]): string {
  return `
SELECT m.tl_target_id AS mid, v.lt_title AS caller, COUNT(DISTINCT m.tl_from) AS k
FROM templatelinks m
JOIN templatelinks c ON c.tl_from = m.tl_from
JOIN linktarget v ON v.lt_id = c.tl_target_id
WHERE m.tl_target_id IN (${ids.join(',')}) AND m.tl_from_namespace = 0
  AND v.lt_namespace = 10 AND v.lt_title IN (${callers.map(sqlString).join(',')})
GROUP BY m.tl_target_id, v.lt_title`;
}

export function logSql(titles: string[]): string {
  return `
SELECT log_title, log_type, log_action, log_timestamp, log_params FROM logging
WHERE log_namespace = 10 AND log_title IN (${titles.map(sqlString).join(',')})
  AND log_type IN ('delete', 'move') AND log_deleted = 0
ORDER BY log_timestamp`;
}

export const faTemplatesSql = 'SELECT page_title FROM page WHERE page_namespace = 10';

/** en pages in ns 10 by title, with their redirect target and fa interwiki. */
export function enTemplatesSql(titles: string[]): string {
  return `
SELECT p.page_title, rd_namespace, rd_title, ll_title FROM page p
LEFT JOIN redirect ON rd_from = p.page_id
LEFT JOIN langlinks ON ll_from = p.page_id AND ll_lang = 'fa'
WHERE p.page_namespace = 10 AND p.page_title IN (${titles.map(sqlString).join(',')})`;
}

/** Articles using the missing templates, with their en counterpart. */
export function enCounterpartsSql(ids: string[]): string {
  return `
SELECT tl_target_id, tl_from, ll_title FROM templatelinks
JOIN langlinks ON ll_from = tl_from AND ll_lang = 'en'
WHERE tl_target_id IN (${ids.join(',')}) AND tl_from_namespace = 0`;
}

export const enArticleIdsSql = (titles: string[]) =>
  `SELECT page_id, page_title FROM page WHERE page_namespace = 0 AND page_title IN (${titles.map(sqlString).join(',')})`;

export const enArticleTemplatesSql = (ids: string[]) => `
SELECT tl_from, lt_title FROM templatelinks JOIN linktarget ON lt_id = tl_target_id
WHERE tl_from IN (${ids.join(',')}) AND lt_namespace = 10`;

/** Which of these fa articles already transclude which of these fa templates. */
export const faPresentSql = (articleIds: string[], titles: string[]) => `
SELECT tl_from, lt_title FROM templatelinks JOIN linktarget ON lt_id = tl_target_id
WHERE tl_from IN (${articleIds.join(',')}) AND lt_namespace = 10
  AND lt_title IN (${titles.map(sqlString).join(',')})`;

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

const PERSIAN = /[\u0600-\u06FF]/;
export const hasPersian = (t: string) => PERSIAN.test(t);
export const isStubName = (t: string) => /(^|[-_])خرد([-_]|$)/.test(t);
const SKIP_SUBPAGE = /\/(توضیحات|doc|تمرین|sandbox|آزمایشی|testcases)$/i;
export const isDocOrSandbox = (t: string) => SKIP_SUBPAGE.test(t);

/** Folds the differences that make two template names the same name typed differently. */
export function normName(t: string): string {
  return t
    .replace(/[_\s\u200c\u200d\u200f\u200e\-–—]/g, '')
    .replace(/[ي]/g, 'ی').replace(/[ك]/g, 'ک').replace(/[ةۀ]/g, 'ه')
    .replace(/[أإآ]/g, 'ا').replace(/ؤ/g, 'و').replace(/ئ/g, 'ی')
    .replace(/[\u064B-\u0652\u0654\u0670]/g, '')
    .replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .toLowerCase();
}

/** The fa template a misspelt name probably meant, or null. Never returns `title` itself. */
export function nearName(title: string, byNorm: Map<string, string[]>): string | null {
  const own = byNorm.get(normName(title))?.find(t => t !== title);
  if (own) return own;
  const m = /^(.+)-خرد$/.exec(title) ?? /^خرد-(.+)$/.exec(title);
  if (!m) return null;
  for (const alt of [`${m[1]}-خرد`, `خرد-${m[1]}`]) {
    if (alt === title) continue;
    const hit = byNorm.get(normName(alt))?.[0];
    if (hit) return hit;
  }
  return null;
}

export interface CoCandidate { en: string; support: number; of: number; score: number }

/**
 * en templates on (nearly) all en counterparts and rare across the whole sample.
 * `docFreq` is how many of the `population` sampled en articles carry each template.
 */
export function coOccurrence(
  counterpartTemplates: Set<string>[], docFreq: Map<string, number>, population: number,
  stub: boolean, minCoverage = 0.8, minLift = 30,
): CoCandidate[] {
  const k = counterpartTemplates.length;
  if (k < 3) return [];
  const support = new Map<string, number>();
  for (const s of counterpartTemplates) for (const t of s) support.set(t, (support.get(t) ?? 0) + 1);
  const out: CoCandidate[] = [];
  for (const [t, s] of support) {
    if (/\.css$/i.test(t) || /-stub$/i.test(t) !== stub) continue;
    const cov = s / k;
    const lift = cov / ((docFreq.get(t) ?? s) / population);
    if (cov < minCoverage || lift < minLift) continue;
    out.push({ en: t, support: s, of: k, score: s * Math.log(lift) });
  }
  return out.sort((a, b) => b.score - a.score);
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export type Hint =
  | { kind: 'en-same'; en: string; faEquivalent?: string }
  | { kind: 'moved'; to: string }
  | { kind: 'near'; fa: string }
  | { kind: 'co'; en: string; support: number; of: number; faEquivalent?: string };

export interface WantedRow {
  title: string;              // underscores
  articles: number;
  callers: { title: string; articles: number }[];
  hints: Hint[];
  deleted?: string;           // yyyymmddhhmmss of the last deletion, when that is the last event
}

const sp = (t: string) => t.replace(/_/g, ' ');
const tpl = (t: string) => `[[الگو:${sp(t)}|${sp(t)}]]`;
const en = (t: string) => `[[:en:Template:${sp(t)}|${sp(t)}]]`;
const date = (ts: string) => fa(`${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}`);

function hintText(h: Hint): string {
  switch (h.kind) {
    case 'en-same': return h.faEquivalent
      ? `همنام در انگلیسی: ${en(h.en)}؛ معادل فارسی آن: ${tpl(h.faEquivalent)}`
      : `همنام در انگلیسی: ${en(h.en)}`;
    case 'moved': return `منتقل‌شده بدون تغییرمسیر به ${tpl(h.to)}`;
    case 'near': return `{{نارنجی|حدس}}: نام نزدیک ${tpl(h.fa)}`;
    case 'co': return `{{نارنجی|حدس}}: ${en(h.en)} (در ${fa(h.support)} از ${fa(h.of)} مقالهٔ همتای انگلیسی)`
      + (h.faEquivalent ? `؛ معادل فارسی آن: ${tpl(h.faEquivalent)}` : '');
  }
}

export function buildWanted(rows: WantedRow[]): string {
  const total = rows.reduce((a, r) => a + r.articles, 0);
  const withHint = rows.filter(r => r.hints.length).length;
  const viaCaller = rows.filter(r => r.callers.length).length;
  const out = [
    `این صفحه ${fa(rows.length)} الگویی را فهرست می‌کند که در بیشترین شمار مقاله‌ها فراخوانده می‌شوند ولی در `
    + 'ویکی‌پدیای فارسی صفحه‌ای ندارند و از این رو در مقاله به‌صورت پیوند قرمز دیده می‌شوند. فهرست به ترتیب شمار '
    + 'مقاله‌هاست تا با ساختن یا اصلاح هر الگو بیشترین مقاله یک‌جا درست شود.',
    '',
    '* «مقاله‌ها» شمار مقاله‌هایی است که الگو در آن‌ها واقعاً قرمز نمایش داده می‌شود. فراخوانی‌هایی که هیچ‌گاه '
    + 'نمایش داده نمی‌شوند (مثلاً در شاخه‌ای از شرط که اجرا نمی‌شود) شمرده نمی‌شوند. عدد به فهرست همان مقاله‌ها پیوند دارد.',
    '* «از راه الگو» یعنی الگوی موجودی خود این الگوی ناموجود را فرامی‌خواند و مقاله‌ها از راه آن قرمز شده‌اند؛ '
    + 'در این حالت اصلاح همان یک الگو همهٔ آن مقاله‌ها را درست می‌کند. عدد داخل کمانک شمار مقاله‌های مشترک است.',
    '* در ستون «پیشنهاد»، «همنام در انگلیسی» یعنی الگویی با همین نام در ویکی‌پدیای انگلیسی هست، و «معادل فارسی» '
    + 'از پیوند میان‌ویکی همان الگو آمده است. مواردی که با {{نارنجی|حدس}} مشخص شده‌اند قطعی نیستند و پیش از '
    + 'هر کاری باید بررسی شوند: «نام نزدیک» الگوی موجودی است که نامش تنها در فاصله، نیم‌فاصله، همزه، حروف عربی '
    + 'یا جای «خرد» تفاوت دارد، و الگوی انگلیسی پیشنهادی الگویی است که تقریباً در همهٔ نسخه‌های انگلیسی همان مقاله‌ها هست '
    + 'و در مقاله‌های دیگر کم‌یاب است.',
    '* «حذف‌شده» یعنی این الگو پیش‌تر وجود داشته و حذف شده است؛ شاید درست‌تر باشد فراخوانی‌اش از مقاله‌ها برداشته شود.',
    '',
    `جمع: ${fa(total)} مورد کاربرد؛ ${fa(viaCaller)} الگو از راه الگوی دیگری فراخوانده می‌شوند و برای `
    + `${fa(withHint)} الگو پیشنهادی یافت شد.`,
    '',
    'آخرین به‌روزرسانی: ~~~~~',
    '',
    '{| class="wikitable sortable" style="width:100%"',
    '! ردیف !! الگو !! مقاله‌ها !! از راه الگو !! پیشنهاد !! سابقه',
  ];
  rows.forEach((r, i) => {
    const link = `{{fullurl:ویژه:پیوند به این صفحه/الگو:${sp(r.title)}|namespace=0&hidelinks=1&hideredirs=1&limit=500}}`;
    out.push('|-',
      `| ${fa(i + 1)}`,
      `| [[الگو:${sp(r.title)}]]`,
      `| data-sort-value="${r.articles}" | [${link} ${fa(r.articles)}]`,
      `| ${r.callers.map(c => `${tpl(c.title)} (${fa(c.articles)})`).join('، ')}`,
      `| ${r.hints.map(hintText).join('<br />')}`,
      `| ${r.deleted ? `data-sort-value="${r.deleted}" | حذف‌شده در ${date(r.deleted)}` : ''}`);
  });
  out.push('|}', '', '[[رده:گزارش‌های دیتابیس ویکی‌پدیا]]');
  return out.join('\n');
}

/** Last delete/move per title, from `logSql` rows (oldest first). */
export function lastEvents(rows: Record<string, string>[]) {
  const out = new Map<string, { type: string; ts: string; target?: string }>();
  for (const r of rows) {
    let target: string | undefined;
    if (r.log_type === 'move') {
      try { target = String((phpUnserialize(r.log_params) as Record<string, unknown>)['4::target'] ?? ''); } catch { /* old format */ }
    }
    out.set(r.log_title, { type: r.log_type, ts: r.log_timestamp, target });
  }
  return out;
}
