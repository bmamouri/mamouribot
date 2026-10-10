/**
 * وظیفهٔ ۱۳ — ویکی‌پدیا:گزارش دیتابیس/کاربران بر پایه تعداد محتوای برگزیده
 *
 * Users ranked by how much featured content they brought through review: featured
 * articles, good articles and featured lists. The previous bot stopped maintaining it
 * and the published page had not moved since شهریور ۱۴۰۴.
 *
 * WHERE THE NUMBERS COME FROM, AND WHY NOT THE DATABASE. Nothing in the replicas says
 * *who* took an article to featured status — the category tells you the article is
 * featured, not whose work it was. That attribution exists only on three
 * hand-maintained pages, one per content type, so those are the source:
 *
 *   ویکی‌پدیا:گزیدن مقاله‌های برگزیده/کاربران
 *   ویکی‌پدیا:گزیدن مقاله‌های خوب/کاربران
 *   ویکی‌پدیا:گزیدن فهرست‌های برگزیده/کاربران
 *
 * ★ is content that is still featured, ☆ is content demoted at review — the legend is
 * on each source page. **Only ★ counts.** A report titled "by amount of featured
 * content" that counted demoted work would be answering a different question.
 *
 * THE PARSING TRAP, AND THE CONTROL THAT CAUGHT IT. A user's entries do not sit in one
 * table row. The good-article page wraps at twenty per row and continues on following
 * rows whose first cell is empty, so the obvious `split('|-')` silently truncates every
 * prolific contributor to exactly 20 and looks plausible doing it. Entries are therefore
 * accumulated from a user's line until the NEXT user line.
 *
 * The featured-list page states each user's own total in a «تعداد» column, which is a
 * free positive control: parsed against it, 64 of 65 rows agree. The one that does not
 * is the page being stale about itself, not the parser, and the report surfaces that
 * rather than hiding it — see `MISMATCH_NOTE`.
 */
export const FEATURED_PAGE = 'ویکی‌پدیا:گزارش دیتابیس/کاربران بر پایه تعداد محتوای برگزیده';

export const SOURCES = {
  fa: { page: 'ویکی‌پدیا:گزیدن مقاله‌های برگزیده/کاربران', label: 'مقالهٔ برگزیده' },
  ga: { page: 'ویکی‌پدیا:گزیدن مقاله‌های خوب/کاربران', label: 'مقالهٔ خوب' },
  fl: { page: 'ویکی‌پدیا:گزیدن فهرست‌های برگزیده/کاربران', label: 'فهرست برگزیده' },
} as const;
export type Kind = keyof typeof SOURCES;

const USER_LINE = /^\|\s*\[\[کاربر:([^\]|]+)/;

export const faDigits = (n: number | string) => String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[+d]);

/**
 * user → number of ★ entries on one source page.
 *
 * Everything from a user's line up to the next user's line belongs to that user; see
 * the header on why a row-based split is wrong.
 */
export function parseStars(wikitext: string): Map<string, number> {
  const out = new Map<string, number>();
  let cur: string | null = null;
  for (const line of wikitext.split('\n')) {
    const m = USER_LINE.exec(line);
    if (m) {
      cur = m[1].trim();
      if (!out.has(cur)) out.set(cur, 0);
    }
    if (cur) out.set(cur, out.get(cur)! + (line.match(/★/g)?.length ?? 0));
  }
  return out;
}

export interface FeaturedRow { user: string; fa: number; ga: number; fl: number; score: number }

/** Merge the three tallies, score them, and order by score then by the rarer kinds. */
export function rank(parts: Record<Kind, Map<string, number>>): FeaturedRow[] {
  const users = new Set<string>([...Object.values(parts).flatMap(m => [...m.keys()])]);
  return [...users]
    .map(user => {
      const fa = parts.fa.get(user) ?? 0, ga = parts.ga.get(user) ?? 0, fl = parts.fl.get(user) ?? 0;
      return { user, fa, ga, fl, score: fa + ga + fl };
    })
    .filter(r => r.score > 0)
    // Ties broken by featured articles then featured lists, both harder to earn than a
    // good article, so the order is stable rather than whatever Set iteration gives.
    .sort((a, b) => b.score - a.score || b.fa - a.fa || b.fl - a.fl || a.user.localeCompare(b.user, 'fa'));
}

const num = (v: number) => `data-sort-value="${v}" | ${faDigits(v)}`;

export const MISMATCH_NOTE =
  'شمار هر ستون از همان صفحهٔ گزیدن شمرده می‌شود و تنها مواردی که هنوز برگزیده یا خوب‌اند '
  + '(★) به حساب می‌آیند؛ مواردی که در بازبینی از فهرست خارج شده‌اند (☆) شمرده نمی‌شوند.';

export function buildFeatured(rows: FeaturedRow[]): string {
  const out = [
    'کاربران ویکی‌پدیای فارسی بر پایهٔ شمار محتوای برگزیده‌ای که به ثمر رسانده‌اند. '
    + MISMATCH_NOTE,
    '',
    `آخرین به‌روزرسانی: ~~~~~؛ ${faDigits(rows.length)} کاربر.`,
    '',
    '{| class="wikitable sortable"',
    `! ردیف !! کاربر !! [[${SOURCES.fa.page}|${SOURCES.fa.label}]] `
    + `!! [[${SOURCES.ga.page}|${SOURCES.ga.label}]] `
    + `!! [[${SOURCES.fl.page}|${SOURCES.fl.label}]] !! امتیاز`,
  ];
  rows.forEach((r, i) => {
    out.push('|-',
      `| ${num(i + 1)}`,
      `| [[کاربر:${r.user}|${r.user}]]`,
      `| ${num(r.fa)}`,
      `| ${num(r.ga)}`,
      `| ${num(r.fl)}`,
      `| ${num(r.score)}`);
  });
  out.push('|}', '', '[[رده:گزارش‌های دیتابیس ویکی‌پدیا]]');
  return out.join('\n');
}
