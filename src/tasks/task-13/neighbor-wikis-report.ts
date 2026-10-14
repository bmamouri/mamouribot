/**
 * وظیفهٔ ۱۳ — چهار گزارش «مقایسهٔ مقالات ویکی‌فا و ویکی‌های همسایه»:
 *
 *   ویکی‌پدیا:گزارش دیتابیس/مقالاتی که در ویکی‌عربی هست و در ویکی‌فا نیست
 *   ویکی‌پدیا:گزارش دیتابیس/مقالاتی که در ویکی‌کردی هست و در ویکی‌فا نیست
 *   ویکی‌پدیا:گزارش دیتابیس/مقالاتی که در ویکی‌مازندرانی هست و در ویکی‌فا نیست
 *   ویکی‌پدیا:گزارش دیتابیس/مقالاتی که در ویکی‌های خاورمیانه هست و در ویکی‌فا نیست
 *
 * These four pages existed since 2014-2019, hand-run by three different editors
 * (Ladsgroup, Yamaha5, Hamid Hassani) and never updated after ۱۷ آوریل ۲۰۲۱. MamouriBot
 * takes them over at the operator's request, daily, as part of this task — same ruling
 * as every other report here: propose only, write one page, no permission needed, see
 * `docs/task-13-move-report.md`.
 *
 * WHAT CHANGED FROM THE OLD REPORTS, AND WHY
 * -------------------------------------------
 * The old pages counted each foreign wiki's OWN interlanguage-link count
 * (`تعداد میان‌ویکی‌ها`, read off THAT wiki's own `langlinks` table before Wikidata
 * centralised everything). That number no longer means what it used to — langlinks is
 * largely superseded by Wikidata sitelinks — and reading it required a live connection
 * to five different wikis' replicas with five different queries.
 *
 * This version reads ONE number instead: how many Wikimedia sites carry a sitelink to
 * the item at all (`wb_items_per_site` on `wikidatawiki_p`). That is what Wikidata's own
 * item page shows as its sitelink count, it is comparable across all four reports with a
 * single query shape, and — unlike a per-wiki interlanguage count — it keeps meaning the
 * same thing as more wikis join or leave. Rows are sorted by it, highest first, which is
 * the direct answer to "sort by whichever is most notable/connected".
 *
 * STRUCTURAL PAGES ARE EXCLUDED, NOT JUST UNLIKELY
 * -------------------------------------------------
 * `wb_items_per_site` has no namespace column — `ips_site_page` is page-table text, raw.
 * A naive top-N by sitelink count is dominated by templates, maintenance categories and
 * cross-wiki infrastructure: `قالب:Wikitext talk page converted to Flow` (503 sitelinks),
 * `تصنيف:مستخدم zh-Hant` (304), `وحدة:Navbar/configuration` (127) — none of them an
 * article a fa editor could translate. Measured on عربی ۱۳ اکتبر ۲۰۲۶: of the top 30
 * candidates by raw sitelink count, only `هواء`, `الاحتباس الحراري` and `مجموعة إثنية`
 * were real articles; the rest were `قالب:`/`تصنيف:`/`وحدة:`/`ويكيبيديا:`.
 *
 * Two layers, because one alone is not trustworthy:
 *   1. a SQL prefilter — `ips_site_page NOT LIKE '%:%'` — which is cheap and also a
 *      genuine performance win (fewer rows reach the per-item sitelink-count subquery),
 *      but is a superset test only: a mainspace title that happens to contain a colon
 *      (rare, but real in transliterated names) would be wrongly excluded here;
 *   2. the AUTHORITATIVE check — querying the SOURCE wiki's own `page` table for
 *      `page_namespace = 0 AND page_is_redirect = 0` on the surviving candidates — which
 *      is what actually decides a row ships. The SQL filter only exists to keep that
 *      second query's input small; nothing is trusted on the SQL filter's say alone.
 *
 * THE MERGE FOR «ویکی‌های خاورمیانه»
 * -----------------------------------
 * Tried as one query across three site IDs with a correlated subquery and a GROUP BY: it
 * timed out past 90 seconds on `wikidatawiki_p` (measured). Three separate single-site
 * queries — the same shape already proven fast for each of the other three reports —
 * run in well under a minute each and are merged in TypeScript: by item, keep the
 * largest sitelink count and the union of which of عربی/ترکی/عبری it was found under.
 * `replica.ts` deliberately has no WHERE-clause API for callers to compose with, so this
 * merge happens here, not as a fourth, more complex query.
 *
 * THE BRIDGE BUG — CAUGHT BY THE OPERATOR ۱۳ اکتبر ۲۰۲۶
 * --------------------------------------------------------
 * «NOT EXISTS an fa sitelink for THIS item» is correct for the item it checks — the bug
 * is that it can be checking the wrong item. مازندرانی «صنعت» sits on Q8148 ("Industry
 * (manufacturing)"), which has no fa sitelink. But Q8148's OWN enwiki sitelink,
 * "Industry (manufacturing)", is itself a local `#REDIRECT` on en.wikipedia to
 * "Manufacturing" — which belongs to a DIFFERENT item, Q187939, and Q187939 has
 * fa:«تولید (صنعت)». The item-level check never saw that, because it is a property of
 * the wrong item. Same shape for عربی «هواء»: Q7391292 ("Air") → enwiki redirect →
 * "Atmosphere of Earth" → Q3230 → fa:«اتمسفر زمین».
 *
 * The fix bridges through en.wikipedia's OWN redirect graph directly, the same move
 * `portal-reports-run.ts`'s `faTopics()` already makes for a different reason. One
 * `action=query&redirects=1&prop=langlinks&lllang=fa` call on en.wikipedia itself
 * resolves the WHOLE chain — tested live against `Special:DoubleRedirects`: a two-hop
 * chain ("Woody weedkiller" → "2,4-Dichlorophenoxyacetic acid" → "2,4-D") came back
 * fully resolved in one response, with both hops listed and the final page's langlinks
 * attached. So a candidate is dropped whenever ITS OWN enwiki sitelink, followed to
 * wherever it currently redirects, turns out to already carry an fa langlink — never
 * mind which Wikidata item that final page belongs to. `resolveRedirectChain()` below is
 * the network-free half of that: it walks the `from → to` pairs the API returns.
 */
import { queryRows, type Wiki } from '../../lib/replica.js';

/** One row read straight from `wb_items_per_site`, before namespace verification. */
export interface RawCandidate {
  itemId: number;
  /** As stored on Wikidata: page-table text, spaces not underscores. */
  title: string;
  sitelinks: number;
}

/** A row that has survived namespace verification and is ready to publish. */
export interface NeighborRow extends RawCandidate {
  /** Which of this report's source wikis it was found under, e.g. ['ar'] or ['ar','tr']. */
  sources: SiteKey[];
  /** The matching en.wikipedia article title, if the item has one. */
  enTitle?: string;
}

export type SiteKey = 'ar' | 'ckb' | 'mzn' | 'tr' | 'he';

/** Site key -> (Wikidata site_id, replica.ts Wiki key, interwiki prefix, human label). */
export const SITES: Record<SiteKey, { siteId: string; wiki: Wiki; prefix: string; label: string }> = {
  ar:  { siteId: 'arwiki',  wiki: 'ar',  prefix: 'ar',  label: 'عربی' },
  ckb: { siteId: 'ckbwiki', wiki: 'ckb', prefix: 'ckb', label: 'کردی (سورانی)' },
  mzn: { siteId: 'mznwiki', wiki: 'mzn', prefix: 'mzn', label: 'مازندرانی' },
  tr:  { siteId: 'trwiki',  wiki: 'tr',  prefix: 'tr',  label: 'ترکی استانبولی' },
  he:  { siteId: 'hewiki',  wiki: 'he',  prefix: 'he',  label: 'عبری' },
};

export interface ReportTarget {
  page: string;
  /** What this report calls the source(s) in its intro sentence. */
  sourceLabel: string;
  sites: SiteKey[];
  /** A combined report (more than one site) gets an extra «ویکی‌های دارنده» column. */
  combined: boolean;
}

export const REPORTS: Record<'ar' | 'ckb' | 'mzn' | 'mideast', ReportTarget> = {
  ar: {
    page: 'ویکی‌پدیا:گزارش دیتابیس/مقالاتی که در ویکی‌عربی هست و در ویکی‌فا نیست',
    sourceLabel: 'ویکی‌عربی', sites: ['ar'], combined: false,
  },
  ckb: {
    page: 'ویکی‌پدیا:گزارش دیتابیس/مقالاتی که در ویکی‌کردی هست و در ویکی‌فا نیست',
    sourceLabel: 'ویکی‌کردی (سورانی)', sites: ['ckb'], combined: false,
  },
  mzn: {
    page: 'ویکی‌پدیا:گزارش دیتابیس/مقالاتی که در ویکی‌مازندرانی هست و در ویکی‌فا نیست',
    sourceLabel: 'ویکی‌مازندرانی', sites: ['mzn'], combined: false,
  },
  mideast: {
    page: 'ویکی‌پدیا:گزارش دیتابیس/مقالاتی که در ویکی‌های خاورمیانه هست و در ویکی‌فا نیست',
    sourceLabel: 'ویکی‌های خاورمیانه (عربی، ترکی استانبولی، عبری)',
    sites: ['ar', 'tr', 'he'], combined: true,
  },
};

export const signaturePage = (page: string) => `${page}/امضا`;

/** SQL LIMIT on the raw per-site candidate query. Cost is dominated by the per-row
 *  sitelink-count subquery, not by this number (measured: LIMIT 20 and LIMIT 2000 on
 *  عربی both ran in ~45-47s), so there is no reason to keep it small. */
export const CANDIDATE_LIMIT = 5000;
/** How many of the merged, sitelinks-sorted candidates get the authoritative
 *  namespace/redirect check against their source wiki's own `page` table. */
export const VERIFY_CAP = 2000;
/** Final row cap per report, matching the other task-13 reports' MAX_ROWS. */
export const MAX_ROWS = 300;
/** Batch size for both the mainspace-verification and the en-title lookups. */
export const BATCH = 300;

/**
 * Items on `siteId` with no fa sitelink at all, ranked by total sitelink count.
 *
 * `NOT LIKE '%:%'` is a PERFORMANCE prefilter, not the namespace check — see the header.
 * It is a superset test: everything it drops really is non-mainspace on every wiki
 * measured (templates, categories, modules, project pages all carry a colon in their
 * own language), so dropping it loses nothing that the authoritative check would have
 * kept, while cutting the row count that reaches the expensive subquery substantially.
 */
export function candidatesSql(siteId: string, limit = CANDIDATE_LIMIT): string {
  return `
SELECT a.ips_item_id AS item_id, a.ips_site_page AS title,
       (SELECT COUNT(*) FROM wb_items_per_site c WHERE c.ips_item_id = a.ips_item_id) AS sitelinks
FROM wb_items_per_site a
WHERE a.ips_site_id = '${siteId}'
  AND a.ips_site_page NOT LIKE '%:%'
  AND NOT EXISTS (
    SELECT 1 FROM wb_items_per_site f WHERE f.ips_item_id = a.ips_item_id AND f.ips_site_id = 'fawiki'
  )
ORDER BY sitelinks DESC
LIMIT ${limit}`;
}

/** The authoritative check: is this title a real, non-redirect mainspace page on its
 *  own wiki? `titles` are page-table text (spaces); this swaps to underscores itself. */
export function mainspaceSql(titles: string[]): string {
  const list = titles.map(t => `'${t.replace(/_/g, ' ').replace(/'/g, "\\'")}'`).join(',');
  return `SELECT page_title FROM page WHERE page_namespace = 0 AND page_is_redirect = 0 AND page_title IN (${list})`;
}

/** en.wikipedia's title for each item, where one exists. */
export function enTitlesSql(itemIds: number[]): string {
  return `SELECT ips_item_id AS item_id, ips_site_page AS title FROM wb_items_per_site
WHERE ips_site_id = 'enwiki' AND ips_item_id IN (${itemIds.join(',')})`;
}

/**
 * Follow en.wikipedia's OWN redirect chain to its end, from the `{from,to}` pairs a
 * `action=query&redirects=1` response returns. The API already resolves the full chain
 * server-side (tested against live double-redirect cases), so this never needs more
 * than one hop in practice — but it does not assume that, because trusting an
 * unenforced invariant is exactly how the bridge bug above went unnoticed.
 */
export function resolveRedirectChain(start: string, pairs: Map<string, string>): string {
  let cur = start;
  const seen = new Set<string>([cur]);
  while (pairs.has(cur)) {
    const next = pairs.get(cur)!;
    if (seen.has(next)) break; // a redirect loop; stop rather than spin
    cur = next;
    seen.add(cur);
  }
  return cur;
}

/**
 * A handful of en.wikipedia articles are themselves named after a single Perso-Arabic
 * letter — enwiki has «ب» (the letter Beh) the same way it has «Ñ» and «Š», which
 * `move-report.ts` already treats as a real title. `[[:en:ب]]` is indistinguishable from
 * the dead-interwiki mistake `gates.py`'s `audit_en_interwiki_persian` exists to catch (a
 * porter `:en:`-prefixing a title that is already Persian), so an en title containing a
 * Perso-Arabic letter is dropped rather than linked — the source-wiki link already shows
 * the reader the subject.
 */
export const HAS_PERSIAN_LETTER = /[؀-ۿ]/;

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Merge per-site candidate lists into one, by item: keep the largest sitelink count
 * (all sites agree on this, since it is a property of the ITEM, not the site — any
 * difference is replication lag between two wikis' copies of `wb_items_per_site`,
 * and the larger one is the fresher), and record every site the item was found under.
 *
 * `perSite` keys are iterated in the order given, which decides which site's own title
 * ends up DISPLAYED for an item found under more than one — see `pickTitle`.
 */
export function mergeCandidates(perSite: [SiteKey, RawCandidate[]][]): Map<number, NeighborRow> {
  const out = new Map<number, NeighborRow>();
  for (const [site, rows] of perSite) {
    for (const r of rows) {
      const existing = out.get(r.itemId);
      if (!existing) {
        out.set(r.itemId, { ...r, sources: [site] });
      } else {
        existing.sitelinks = Math.max(existing.sitelinks, r.sitelinks);
        if (!existing.sources.includes(site)) existing.sources.push(site);
      }
    }
  }
  return out;
}

const fa = (n: number) => String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[+d]);
const num = (v: number) => `data-sort-value="${v}" | {{formatnum:${v}}}`;

/**
 * The wikitext table. One renderer for all four reports: a single-site report's row
 * just has `sources.length === 1` and the «ویکی‌های دارنده» column is omitted —
 * `combined` on the target decides that, not anything about the row.
 */
export function buildReport(target: ReportTarget, rows: NeighborRow[], candidateCount: number): string {
  const sourceCol = target.combined
    ? ' !! ویکی‌های دارنده'
    : '';
  const out = [
    `مقاله‌هایی در ${target.sourceLabel} که در ویکی‌پدیای فارسی وجود ندارند (نه به شکل مقاله `
    + 'و نه تغییرمسیر)، بر پایهٔ شمار سایت‌لینک آیتم ویکی‌دادهٔ هر موضوع در همهٔ پروژه‌های '
    + 'ویکی‌مدیا، از بیشترین. این عدد همان شمار سایت‌لینکی است که در صفحهٔ آیتم ویکی‌داده '
    + 'دیده می‌شود و معیاری از ارتباط و اهمیت آن موضوع در میان پروژه‌هاست. صفحه‌های ساختاری '
    + '(رده، الگو، راهنما، پودمان و مانند آن) در این فهرست نمی‌آیند.',
    '',
    `آخرین به‌روزرسانی: ~~~~~؛ ${fa(rows.length)} مورد از ${fa(candidateCount)} نامزد بررسی‌شده.`,
    '',
    '{| class="wikitable sortable"',
    `! ردیف !! عنوان !! مقالهٔ انگلیسی !! آیتم ویکی‌داده !! سایت‌لینک‌ها${sourceCol}`,
  ];
  rows.forEach((r, i) => {
    const primary = r.sources[0];
    const site = SITES[primary];
    out.push('|-',
      `| ${num(i + 1)}`,
      `| [[:${site.prefix}:${r.title}|${r.title}]]`,
      `| ${r.enTitle ? `[[:en:${r.enTitle}|${r.enTitle}]]` : 'ـ'}`,
      `| [[:d:Q${r.itemId}]]`,
      `| ${num(r.sitelinks)}`);
    if (target.combined) {
      out.push(`| ${r.sources.map(s => SITES[s].label).join('، ')}`);
    }
  });
  out.push('|}', '', '[[رده:گزارش‌های دیتابیس ویکی‌پدیا]]');
  return out.join('\n');
}
