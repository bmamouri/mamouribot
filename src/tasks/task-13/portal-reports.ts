/**
 * وظیفهٔ ۱۳ — the two درگاه (portal, NS 100) database reports.
 *
 *   npx tsx src/tasks/task-13/reports-cli.ts --report portals
 *   npx tsx src/tasks/task-13/reports-cli.ts --report portals --live
 *
 * | page | what it ranks |
 * |---|---|
 * | پربازدیدترین درگاه‌ها | fa portals by real reader traffic |
 * | درگاه‌های انگلیسی برای ترجمه | en portals fa does not have, best candidates first |
 *
 * They live in وظیفهٔ ۱۳ with «مقاله‌های نیازمند تغییرنام» because they are the same job:
 * a database report that **proposes**, writes one page, and never touches an article. By
 * the BAG's ruling on this task that needs no permission, and the edits are deliberately
 * NOT bot-flagged — the point is that people see them. See `docs/task-13-move-report.md`.
 *
 * WHY PAGEVIEWS AND NOT INBOUND LINKS. The two do not agree, and the report says so:
 * درگاه:جغرافیا has the most inbound article links of any fa portal and little traffic,
 * while several portals with almost no inbound links are heavily read. Inbound links are
 * a measure of how much *editors* wired a portal up; the question these reports answer is
 * which portal a *reader* actually opens. Pageviews are not in the replicas, so the
 * structural columns come from the database and the traffic column from the AQS API.
 *
 * WHY «NO fa INTERWIKI» IS NOT «fa DOES NOT HAVE IT». Only ~90 of 591 en portal roots
 * carry any fa langlink while fa has ~200 portals, so filtering on the interwiki alone
 * recommends creating portals that already exist. Every candidate is re-checked: resolve
 * the topic's Persian name through the *article*'s langlink, then ask fa whether
 * درگاه:<name> exists. Ported from `scripts/archive/portal-popularity/`, which produced
 * the hand-run versions of both pages.
 */
import { queryRows } from '../../lib/replica.js';

export const POPULAR_PAGE = 'ویکی‌پدیا:گزارش دیتابیس/پربازدیدترین درگاه‌ها';
export const CANDIDATES_PAGE = 'ویکی‌پدیا:گزارش دیتابیس/درگاه‌های انگلیسی برای ترجمه';
export const signaturePage = (p: string) => `${p}/امضا`;

const AQS = 'https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article';
export const BOT_UA_AQS = 'MamouriBot/1.0 (fa.wikipedia portal reports; mamouri@gmail.com)';

/**
 * en portals left out of the translation candidates, BY EXACT TITLE.
 *
 * Operator's call, ۱۱ اکتبر ۲۰۲۶: adult-content portals should not be recommended for
 * translation. These two happen to be ranks 1 and 2 by traffic, so they are not a
 * rounding error in the output.
 *
 * Exact titles, never a substring match: «sex» also appears inside **East Sussex** and
 * **West Sussex**, and a substring filter would silently drop two geography portals
 * while looking like it was doing the right thing. «Sex work» is deliberately NOT here —
 * it is a sociology and labour topic, and the instruction was to exclude erotica and
 * nudity, not the subject area.
 */
export const EXCLUDED_EN_PORTALS = new Set(['Erotica and pornography', 'Nudity']);

// ---------------------------------------------------------------------------
// SQL — the two Quarry queries, with the filtering moved into the bot
// ---------------------------------------------------------------------------

/** fa portals: quarry.wmcloud.org/query/110001 */
export const FA_PORTALS_SQL = `
SELECT REPLACE(p.page_title, '_', ' ') AS portal,
       COALESCE(l.links_from_articles, 0) AS links_from_articles,
       COALESCE(s.subpages, 0)            AS subpages,
       p.page_len                         AS bytes,
       COALESCE(r.revisions, 0)           AS revisions,
       COALESCE(r.last_edit, '')          AS last_edit,
       COALESCE(r.distinct_editors, 0)    AS distinct_editors
FROM page p
LEFT JOIN (SELECT lt.lt_title, COUNT(DISTINCT pl.pl_from) AS links_from_articles
           FROM linktarget lt JOIN pagelinks pl
             ON pl.pl_target_id = lt.lt_id AND pl.pl_from_namespace = 0
           WHERE lt.lt_namespace = 100 GROUP BY lt.lt_title) l ON l.lt_title = p.page_title
LEFT JOIN (SELECT SUBSTRING_INDEX(page_title, '/', 1) AS root, COUNT(*) AS subpages
           FROM page WHERE page_namespace = 100 AND page_title LIKE '%/%'
           GROUP BY root) s ON s.root = p.page_title
LEFT JOIN (SELECT rev_page, COUNT(*) AS revisions, MAX(rev_timestamp) AS last_edit,
                  COUNT(DISTINCT rev_actor) AS distinct_editors
           FROM revision JOIN page ON page_id = rev_page
           WHERE page_namespace = 100 AND page_title NOT LIKE '%/%'
           GROUP BY rev_page) r ON r.rev_page = p.page_id
WHERE p.page_namespace = 100 AND p.page_is_redirect = 0 AND p.page_title NOT LIKE '%/%'`;

/** en portals with no fa langlink: quarry.wmcloud.org/query/110002 */
export const EN_PORTALS_SQL = `
SELECT REPLACE(p.page_title, '_', ' ') AS portal,
       COALESCE(l.links_from_articles, 0) AS links_from_articles,
       COALESCE(s.subpages, 0)            AS subpages,
       p.page_len                         AS bytes,
       (SELECT COUNT(*) FROM langlinks WHERE ll_from = p.page_id) AS interwikis,
       COALESCE(r.last_edit, '')          AS last_edit
FROM page p
LEFT JOIN langlinks fa ON fa.ll_from = p.page_id AND fa.ll_lang = 'fa'
LEFT JOIN (SELECT lt.lt_title, COUNT(DISTINCT pl.pl_from) AS links_from_articles
           FROM linktarget lt JOIN pagelinks pl
             ON pl.pl_target_id = lt.lt_id AND pl.pl_from_namespace = 0
           WHERE lt.lt_namespace = 100 GROUP BY lt.lt_title) l ON l.lt_title = p.page_title
LEFT JOIN (SELECT SUBSTRING_INDEX(page_title, '/', 1) AS root, COUNT(*) AS subpages
           FROM page WHERE page_namespace = 100 AND page_title LIKE '%/%'
           GROUP BY root) s ON s.root = p.page_title
LEFT JOIN (SELECT rev_page, MAX(rev_timestamp) AS last_edit
           FROM revision JOIN page ON page_id = rev_page
           WHERE page_namespace = 100 AND page_title NOT LIKE '%/%'
           GROUP BY rev_page) r ON r.rev_page = p.page_id
WHERE p.page_namespace = 100 AND p.page_is_redirect = 0 AND p.page_title NOT LIKE '%/%'
  AND fa.ll_from IS NULL`;

// ---------------------------------------------------------------------------
// Presentation
// ---------------------------------------------------------------------------

export const fa = (n: number | string) => String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[+d]);

/**
 * A sortable numeric cell.
 *
 * `data-sort-value` carries the ASCII number because the reader sees Persian digits and
 * the table's sort would otherwise order them as text — ۹ before ۱۰.
 */
export const num = (v: number, shown = fa(v)) => `data-sort-value="${v}" | ${shown}`;

/** `20260530123000` → `۲۰۲۶-۰۵-۳۰`, sortable as the raw stamp. */
export function when(stamp: string): string {
  if (!/^\d{8}/.test(stamp)) return 'data-sort-value="0" | ناشناخته';
  const [y, m, d] = [stamp.slice(0, 4), stamp.slice(4, 6), stamp.slice(6, 8)];
  return `data-sort-value="${y}${m}${d}" | ${fa(`${y}-${m}-${d}`)}`;
}

export interface PopularRow {
  portal: string; views: number; perMonth: number; links: number;
  subpages: number; bytes: number; revisions: number; editors: number; lastEdit: string;
}

export function buildPopular(rows: PopularRow[], window: string): string {
  const out = [
    `درگاه‌های ویکی‌پدیای فارسی بر پایهٔ شمار بازدید خوانندگان در بازهٔ ${window}، از پربازدیدترین. `
    + 'ستون‌ها مرتب‌شدنی‌اند. پیوند ورودی جانشین محبوبیت نیست: پربازدیدترین‌ها اغلب کمترین پیوند را دارند.',
    '',
    `آخرین به‌روزرسانی: ~~~~~؛ ${fa(rows.length)} درگاه.`,
    '',
    '{| class="wikitable sortable"',
    '! ردیف !! درگاه !! بازدید !! میانگین ماهانه !! پیوند از مقاله‌ها !! زیرصفحه '
    + '!! حجم (بایت) !! ویرایش‌ها !! ویرایشگران !! آخرین ویرایش',
  ];
  rows.forEach((r, i) => {
    out.push('|-',
      `| ${num(i + 1)}`,
      `| [[${r.portal}]]`,
      `| ${num(r.views)}`,
      `| ${num(Math.round(r.perMonth))}`,
      `| ${num(r.links)}`,
      `| ${num(r.subpages)}`,
      `| ${num(r.bytes)}`,
      `| ${num(r.revisions)}`,
      `| ${num(r.editors)}`,
      `| ${when(r.lastEdit)}`);
  });
  out.push('|}', '', '[[رده:گزارش‌های دیتابیس ویکی‌پدیا]]');
  return out.join('\n');
}

export interface CandidateRow {
  portal: string; views: number; perMonth: number; faTopic: string;
  links: number; subpages: number; bytes: number; interwikis: number; lastEdit: string;
}

export function buildCandidates(rows: CandidateRow[], window: string): string {
  const out = [
    'درگاه‌هایی از ویکی‌پدیای انگلیسی که در فارسی برابری ندارند، بر پایهٔ شمار بازدید '
    + `خوانندگان انگلیسی‌زبان در بازهٔ ${window}، از پربازدیدترین. `
    + `سنجهٔ برابر برای درگاه‌های موجود فارسی در [[${POPULAR_PAGE}]] آمده است.`,
    '',
    `آخرین به‌روزرسانی: ~~~~~؛ ${fa(rows.length)} نامزد.`,
    '',
  ];
  out.push('== نامزدهای ترجمه ==',
    'نام پیشنهادی فارسی از مقالهٔ همان موضوع گرفته شده و پیشنهاد است، نه نام قطعی. ستون‌ها مرتب‌شدنی‌اند.',
    '',
    '{| class="wikitable sortable"',
    '! ردیف !! درگاه انگلیسی !! بازدید !! میانگین ماهانه !! موضوع در فارسی '
    + '!! نام پیشنهادی درگاه !! پیوند از مقاله‌ها !! زیرصفحه !! حجم (بایت) !! میان‌ویکی !! آخرین ویرایش');
  rows.forEach((r, i) => {
    out.push('|-',
      `| ${num(i + 1)}`,
      `| [[:en:Portal:${r.portal}|${r.portal}]]`,
      `| ${num(r.views)}`,
      `| ${num(Math.round(r.perMonth))}`,
      `| ${r.faTopic ? `[[${r.faTopic}]]` : 'مقالهٔ فارسی ندارد'}`,
      `| ${r.faTopic ? `درگاه:${r.faTopic}` : 'ـ'}`,
      `| ${num(r.links)}`,
      `| ${num(r.subpages)}`,
      `| ${num(r.bytes)}`,
      `| ${num(r.interwikis)}`,
      `| ${when(r.lastEdit)}`);
  });
  out.push('|}', '', '[[رده:گزارش‌های دیتابیس ویکی‌پدیا]]');
  return out.join('\n');
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

/** The AQS window: the twelve complete months ending with last month. */
export function monthWindow(today = new Date()): { start: string; end: string; label: string } {
  // Last day of the previous complete month, then back to the first of the month
  // twelve months before it. `+ 1` because getUTCMonth() is 0-based and the window is
  // INCLUSIVE of its end month: Oct 2025 … Sep 2026 is twelve months, not thirteen.
  // The hand-run Python this is ported from was off by one here and labelled a
  // thirteen-month window as twelve.
  const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0));
  const start = new Date(Date.UTC(end.getUTCFullYear() - 1, end.getUTCMonth() + 1, 1));
  const f = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '');
  const m = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  return { start: f(start), end: f(end), label: `${fa(m(start))} تا ${fa(m(end))}` };
}

/**
 * Total and mean monthly human pageviews for one title, 0 when AQS has never served it.
 *
 * A 404 is a real answer — the page has no data — and must not abort a run of several
 * hundred. 429 is the one worth retrying: the API throttles bursts.
 */
export async function pageviews(
  project: 'fa.wikipedia' | 'en.wikipedia', title: string, start: string, end: string,
): Promise<{ total: number; perMonth: number }> {
  const enc = encodeURIComponent(title.replace(/ /g, '_'));
  const url = `${AQS}/${project}/all-access/user/${enc}/monthly/${start}/${end}`;
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': BOT_UA_AQS } });
    if (res.status === 404) return { total: 0, perMonth: 0 };
    if (res.status === 429) { await new Promise(r => setTimeout(r, 2000 * (attempt + 1))); continue; }
    if (!res.ok) throw new Error(`AQS ${res.status} for ${title}`);
    const j: any = await res.json();
    const items: any[] = j.items ?? [];
    const total = items.reduce((s, i) => s + i.views, 0);
    return { total, perMonth: items.length ? total / items.length : 0 };
  }
  throw new Error(`AQS kept throttling for ${title}`);
}

export const faPortals = () => queryRows(FA_PORTALS_SQL, { wiki: 'fa' });
export const enPortals = async () =>
  (await queryRows(EN_PORTALS_SQL, { wiki: 'en' }))
    .filter(r => !EXCLUDED_EN_PORTALS.has(r.portal));
