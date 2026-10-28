/**
 * وظیفهٔ ۱۳ — «مقاله‌هایی که با دانشنامه ایرانیکا می‌شود گسترش داد»
 *
 *   npx tsx src/tasks/task-13/reports-cli.ts --report iranica          # dry run
 *   npx tsx src/tasks/task-13/reports-cli.ts --report iranica --live
 *
 * Every entry of Encyclopædia Iranica Online set against fa (and en) Wikipedia: which fa
 * articles are short where Iranica is long, and which Iranica subjects have no fa
 * article. Asked for by the operator after a one-off survey he ran by hand
 * (`scripts/archive/iranica_survey/` in the companion repo) turned out worth keeping
 * current. Same ruling as every other report here: proposes, never edits an article.
 *
 * THE THREE SOURCES, AND WHICH ONE DECIDES WHAT
 * ---------------------------------------------
 * 1. **The entry list** — Iranica's own sitemap (`articles-sitemap*.xml`). Tried
 *    directly first; iranicaonline.org answers scripted requests from some networks
 *    with a Cloudflare challenge (a 403 HTML page, never an error a client can read)
 *    and from others normally. Measured ۲۹ اکتبر ۲۰۲۶: the operator's laptop got the
 *    challenge on every URL, a Toolforge job got HTTP 200 and the real XML. So
 *    `fetchIranica()` tries the site, recognises the challenge by its body, and falls
 *    back to the Wayback Machine's newest copy (`/web/2026id_/…`, raw bytes) — the same
 *    page, a few days staler. Neither is trusted blindly: a sitemap that yields fewer
 *    than MIN_ENTRIES slugs aborts the run, because a challenge page or a truncated
 *    archive copy parses as "zero entries" rather than failing.
 * 2. **Which fa/en article an entry is about** — the hard part, and FROZEN in
 *    `data/iranica-match.json`. It was built once by hand: Wikidata P3021, en/fa pages
 *    that cite the entry, title and full-text search on both wikis, Persian
 *    transliteration of the headword. That took hours of API time and ~40 wrong matches
 *    (a film, a band, villages, "(actor)" pages, surname pages) were removed by reading
 *    them. Recomputing it daily would re-introduce the ones a rule cannot see. The run
 *    layers two LIVE signals on top: Wikidata's current P3021 claims (an item someone
 *    tagged since the freeze) and the current en→fa langlink of every matched en
 *    article (a fa article someone wrote since the freeze). Live evidence wins over the
 *    frozen file only by ADDING a match, never by removing one.
 * 3. **How good the fa article is** — live every run, from the article's own wikitext:
 *    prose words, refs, and the stub / good / featured categories. See `grade()`.
 *
 * WHY PROSE WORDS AND NOT BYTES
 * -----------------------------
 * A fa stub with an infobox, a navbox and twenty interwiki-era templates is routinely
 * 8–10 KB. «خاندان هخامنشی» is 8,799 bytes and 169 words of prose. Bytes would rank it as
 * a decent article; it is a stub.
 *
 * ENTRY METADATA (headword, author, length) IS CACHED, NOT REFETCHED
 * ------------------------------------------------------------------
 * Iranica's robots.txt asks for a 20-second crawl delay. 8,800 entries at that pace is
 * two days, so per-entry pages are fetched at most PAGES_PER_RUN per run, oldest-unknown
 * first, into `$BOT_STATE_DIR/iranica-entries.json`, and the cache is seeded from the
 * survey. A row whose entry has not been measured yet shows «ـ» in the length column; it
 * is still listed, because the match and the fa grade do not depend on it.
 */

export const REPORT_PAGE = 'ویکی‌پدیا:گزارش دیتابیس/مقاله‌هایی که با دانشنامه ایرانیکا می‌شود گسترش داد';
export const SUBPAGES = {
  stub: `${REPORT_PAGE}/خرد`,
  start: `${REPORT_PAGE}/آغازین`,
  rest: `${REPORT_PAGE}/بلندتر`,
  createEn: `${REPORT_PAGE}/ساخت با مقاله انگلیسی`,
  createNone: `${REPORT_PAGE}/ساخت مقاله تازه`,
  unsure: `${REPORT_PAGE}/بررسی‌نشده`,
} as const;
export const signaturePage = (p: string) => `${p}/امضا`;

export const IRANICA = 'https://www.iranicaonline.org';
export const WAYBACK = 'https://web.archive.org/web/2026id_/';
/** A sitemap set smaller than this is a challenge page or a truncated copy, not Iranica. */
export const MIN_ENTRIES = 8000;
/** robots.txt: «Crawl-Delay: 20». */
export const CRAWL_DELAY_MS = 20_000;
/** Per-entry page fetches per run (each ≥ CRAWL_DELAY_MS apart). ~1h on the direct path. */
export const PAGES_PER_RUN = 150;
/** Row caps per subpage, so no page passes ~350 KB. */
export const CAP = { stub: 1200, start: 1200, rest: 500, createEn: 600, createNone: 700, unsure: 1200 };
export const PREVIEW = 25;

// ---------------------------------------------------------------------------
// slugs
// ---------------------------------------------------------------------------

/** One key per entry everywhere: percent-decoded, lower-cased, no slashes at the ends.
 *  The sitemap writes «ḵores» as `%e1%b8%b5ores`; Wikidata and the wikis write it decoded,
 *  and 112 entries went unmatched in the survey until both sides used this. */
export function slugOf(url: string): string | null {
  const m = /iranicaonline\.org\/articles\/([^?#\s<]+)/i.exec(url);
  if (!m) return null;
  let s = m[1];
  try { s = decodeURIComponent(s); } catch { /* a lone % — keep it raw */ }
  s = s.replace(/^\/+|\/+$/g, '').replace(/\s+/g, '').toLowerCase();
  return s || null;
}

/** Cross-reference stubs, family index pages and the numbered song-text pages: not subjects. */
export const SKIP = /cross-?ref|-parent$|-index$|^\d+-\d+-/;

/** «hafez-iv», «hafez/hafez-iv-…» → «hafez»: groups the sub-entries of one subject. */
export function parentOf(slug: string): string {
  return slug.split('/')[0].replace(/-(?:[ivxl]+|\d{1,2})(?:-.*)?$/, '');
}

export function parseSitemapIndex(xml: string): string[] {
  return [...xml.matchAll(/<loc>([^<]*articles-sitemap\d*\.xml)<\/loc>/g)].map(m => m[1].trim());
}
export function parseSitemap(xml: string): string[] {
  const out: string[] = [];
  for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    const s = slugOf(m[1]);
    if (s) out.push(s);
  }
  return out;
}

/** The Cloudflare interstitial, by its body: the status code alone is not enough, since
 *  a challenge is sometimes served as 200 behind a proxy. */
export function isChallenge(status: number, body: string): boolean {
  return status === 403 || status === 503 || /<title>Just a moment\.\.\.<\/title>|challenges\.cloudflare\.com/.test(body.slice(0, 4000));
}

// ---------------------------------------------------------------------------
// entry pages
// ---------------------------------------------------------------------------

export interface EntryMeta {
  /** headword, e.g. «ʿABD-AL-ḤAQQ DEHLAVĪ» */
  t?: string;
  /** author(s) as printed */
  a?: string;
  /** words of body text, bibliography excluded */
  w?: number;
  /** ISO date this was read */
  m?: string;
  /** the entry is gone (404) */
  gone?: 1;
}

const decodeEntities = (s: string) => s
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const text = (html: string) => decodeEntities(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

/** Headword, author and body length from one entry page (live site and Wayback copy alike). */
export function parseEntry(html: string): EntryMeta {
  const pick = (re: RegExp) => { const m = re.exec(html); return m ? text(m[1]) : undefined; };
  const out: EntryMeta = {
    t: pick(/<h1>([\s\S]*?)<\/h1>/) ?? pick(/og:title" content="([^"]*)"/),
    a: pick(/authors-block">([\s\S]*?)<\/span>/),
  };
  // Body starts after the «Published <date>» line (skip to its closing </p>).
  const i0 = html.indexOf('article-meta">Published');
  const i = i0 > 0 ? html.indexOf('</p>', i0) : -1;
  const j = html.indexOf('Cite this article', i);
  if (i > 0 && j > 0) {
    const body = text(html.slice(i, j).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ''));
    const b = body.search(/\bBibliography\b/);
    out.w = (b >= 0 ? body.slice(0, b) : body).split(' ').filter(Boolean).length;
  }
  return out;
}

// ---------------------------------------------------------------------------
// fa article quality
// ---------------------------------------------------------------------------

function stripTemplates(t: string): string {
  let out = '', depth = 0;
  for (let i = 0; i < t.length; i++) {
    if (t.startsWith('{{', i)) { depth++; i++; continue; }
    if (depth && t.startsWith('}}', i)) { depth--; i++; continue; }
    if (!depth) out += t[i];
  }
  return out;
}

const TAIL = /\n==\s*(?:منابع|پانویس|پانویس‌ها|جستارهای وابسته|پیوند به بیرون|یادداشت‌ها|کتاب‌شناسی|منابع و یادداشت‌ها|References|See also|External links|Notes|Further reading|Bibliography)\s*==/;

/** Words of running prose: no templates, refs, tables, files, lists or tail sections. */
export function proseWords(wikitext: string): number {
  let t = wikitext.replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<ref[^>/]*\/>/g, '').replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '');
  t = stripTemplates(t)
    .replace(/\{\|[\s\S]*?\|\}/g, '')
    .replace(/<(gallery|syntaxhighlight|math|timeline|poem)[^>]*>[\s\S]*?<\/\1>/g, '')
    .replace(/\[\[(?:پرونده|تصویر|File|Image|رده|Category):[^[\]]*(?:\[\[[^\]]*\]\][^[\]]*)*\]\]/gi, '');
  t = t.split(TAIL)[0];
  t = t.split('\n').filter(l => l.trim() && !/^\s*[*#|!=:;]/.test(l)).join('\n')
    .replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, '$1')
    .replace(/\[https?:\/\/\S+\s*([^\]]*)\]/g, '$1')
    .replace(/<[^>]+>|'''?/g, '');
  return t.split(/\s+/).filter(Boolean).length;
}

export type Grade = 'خرد' | 'آغازین' | 'متوسط' | 'کامل‌تر' | 'خوب' | 'برگزیده';
export const GRADE_ORDER: Record<Grade, number> = { 'خرد': 0, 'آغازین': 1, 'متوسط': 2, 'کامل‌تر': 3, 'خوب': 4, 'برگزیده': 5 };
export const GRADE_BG: Record<Grade, string> = {
  'خرد': '#fee7e6', 'آغازین': '#fef6e7', 'متوسط': '#eaf3ff', 'کامل‌تر': '#d5fdf4', 'خوب': '#d5fdf4', 'برگزیده': '#d5fdf4',
};
export const STUB_CAT = 'رده:همه مقاله‌های خرد';
export const GA_CAT = 'رده:مقاله‌های خوب';
export const FA_CAT = 'رده:مقاله‌های برگزیده';

export interface FaQuality { title: string; words: number; refs: number; stub: boolean; ga: boolean; featured: boolean; cites: boolean; views: number }

export function grade(q: Pick<FaQuality, 'words' | 'stub' | 'ga' | 'featured'>): Grade {
  if (q.featured) return 'برگزیده';
  if (q.ga) return 'خوب';
  if (q.stub || q.words < 300) return 'خرد';
  return q.words < 1000 ? 'آغازین' : q.words < 2500 ? 'متوسط' : 'کامل‌تر';
}

export function measure(title: string, wikitext: string, cats: Set<string>): Omit<FaQuality, 'views'> {
  return {
    title, words: proseWords(wikitext), refs: (wikitext.match(/<ref[\s>]/g) ?? []).length,
    stub: cats.has(STUB_CAT), ga: cats.has(GA_CAT), featured: cats.has(FA_CAT),
    cites: /iranicaonline|ایرانیکا|Iranica/.test(wikitext),
  };
}

// ---------------------------------------------------------------------------
// rows
// ---------------------------------------------------------------------------

/** Frozen match row: [fa, en, how, faGuess, faUnlinked]. */
export type MatchRow = [string?, string?, string?, string?, string?];

export interface ImproveRow {
  fa: string; slugs: string[]; grade: Grade; words: number; refs: number; views: number;
  cites: boolean; irWords: number | null; score: number;
}
export interface CreateEnRow { en: string; slugs: string[]; enBytes: number; views: number; irWords: number | null }
export interface CreateNoneRow { slugs: string[]; irWords: number | null }
export interface UnsureRow { slug: string; guess: string }

export function irWords(slugs: string[], meta: Record<string, EntryMeta>): number | null {
  const known = slugs.map(s => meta[s]?.w).filter((w): w is number => typeof w === 'number');
  return known.length ? known.reduce((a, b) => a + b, 0) : null;
}

/** How much Iranica has beyond what fa has, weighted by readers; citing Iranica already halves it. */
export function score(r: Pick<ImproveRow, 'slugs' | 'words' | 'views' | 'cites' | 'irWords'>): number {
  const ir = r.irWords ?? 1500 * r.slugs.length;
  const gap = Math.max(ir - r.words, 0);
  return gap * (1 + Math.min(r.views, 20_000) / 2000) * (r.cites ? 0.5 : 1);
}

export function buildImprove(
  match: Map<string, { fa?: string }>, quality: Map<string, FaQuality>, meta: Record<string, EntryMeta>,
): ImproveRow[] {
  // Keyed by the RESOLVED title: two slugs whose frozen fa titles are a redirect and its
  // target are one article and must be one row.
  const byFa = new Map<string, { q: FaQuality; slugs: string[] }>();
  for (const [s, r] of match) {
    if (!r.fa || SKIP.test(s) || meta[s]?.gone) continue;
    const q = quality.get(r.fa);
    if (!q) continue;
    const g = byFa.get(q.title) ?? { q, slugs: [] };
    g.slugs.push(s);
    byFa.set(q.title, g);
  }
  const rows: ImproveRow[] = [];
  for (const [fa, { q, slugs }] of byFa) {
    const base = { fa, slugs: slugs.sort(), grade: grade(q), words: q.words, refs: q.refs, views: q.views,
      cites: q.cites, irWords: irWords(slugs, meta) };
    rows.push({ ...base, score: score(base) });
  }
  return rows.sort((a, b) => GRADE_ORDER[a.grade] - GRADE_ORDER[b.grade] || b.score - a.score || a.fa.localeCompare(b.fa));
}

// ---------------------------------------------------------------------------
// wikitext
// ---------------------------------------------------------------------------

export const faDigits = (n: number | string) => String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[+d]);
/** Sortable number: ASCII for the sorter, grouped Persian for the reader. */
export const num = (v: number) => `data-sort-value="${v}" | {{formatnum:${v}}}`;
/** «ـ» for unknown, as every other report here — never an em dash, which the gate refuses. */
const maybe = (v: number | null) => (v === null ? 'data-sort-value="0" | ـ' : num(v));

export function headOf(slug: string, meta: Record<string, EntryMeta>): string {
  return meta[slug]?.t || slug.split('/').pop()!.replace(/-/g, ' ').toUpperCase();
}

/** An external link to the entry. `[`, `]` and `|` in a headword would end the link or the cell. */
export function entryLink(slug: string, meta: Record<string, EntryMeta>): string {
  const label = headOf(slug, meta).replace(/\[/g, '(').replace(/\]/g, ')').replace(/\|/g, '/');
  const path = slug.split('/').map(encodeURIComponent).join('/');
  return `<span dir="ltr">[${IRANICA}/articles/${path}/ ${label}]</span>`;
}

function entriesCell(slugs: string[], meta: Record<string, EntryMeta>, limit = 4): string {
  const out = slugs.slice(0, limit).map(s => entryLink(s, meta));
  if (slugs.length > limit) out.push(`و ${faDigits(slugs.length - limit)} زیرمدخل دیگر`);
  return out.join('<br />');
}

const CATEGORY = '[[رده:گزارش‌های دیتابیس ویکی‌پدیا]]';
export const GRADE_KEY = (['خرد', 'آغازین', 'متوسط', 'کامل‌تر'] as Grade[])
  .map((g, i) => `<span style="background:${GRADE_BG[g]};padding:0 .3em">${g}</span> `
    + ['برچسب خرد یا کمتر از ۳۰۰ واژه', '۳۰۰ تا ۹۹۹ واژه', '۱٬۰۰۰ تا ۲٬۴۹۹ واژه', '۲٬۵۰۰ واژه و بیشتر'][i])
  .join('؛ ');

export function navBar(): string {
  const l = (p: string, t: string) => `[[${p}|${t}]]`;
  return `<div style="border:1px solid #a2a9b1;background:#f8f9fa;padding:.4em .8em;margin-bottom:1em">`
    + `'''${l(REPORT_PAGE, 'ایرانیکا و ویکی‌پدیای فارسی')}''': گسترش مقاله‌های `
    + `${l(SUBPAGES.stub, 'خرد')}، ${l(SUBPAGES.start, 'آغازین')} و ${l(SUBPAGES.rest, 'بلندتر')} · `
    + `${l(SUBPAGES.createEn, 'ساخت با مقالهٔ انگلیسی')} · ${l(SUBPAGES.createNone, 'ساخت مقالهٔ تازه')} · `
    + `${l(SUBPAGES.unsure, 'بررسی‌نشده')}</div>`;
}

export function improveTable(rows: ImproveRow[], meta: Record<string, EntryMeta>): string {
  const out = ['{| class="wikitable sortable" style="font-size:90%"',
    '! ردیف !! مقالهٔ فارسی !! کیفیت !! واژه‌های نثر !! یادکرد !! بازدید ۶۰ روزه !! ایرانیکا را یاد کرده؟ !! مدخل(های) ایرانیکا !! واژه‌های مدخل'];
  rows.forEach((r, i) => out.push('|-',
    `| ${num(i + 1)} || [[${r.fa}]] || style="background:${GRADE_BG[r.grade]}" data-sort-value="${GRADE_ORDER[r.grade]}" | ${r.grade}`
    + ` || ${num(r.words)} || ${num(r.refs)} || ${num(r.views)} || ${r.cites ? 'بله' : 'خیر'}`
    + ` || ${entriesCell(r.slugs, meta)} || ${maybe(r.irWords)}`));
  out.push('|}');
  return out.join('\n');
}

export function createEnTable(rows: CreateEnRow[], meta: Record<string, EntryMeta>): string {
  const out = ['{| class="wikitable sortable" style="font-size:90%"',
    '! ردیف !! مقالهٔ انگلیسی !! حجم مقالهٔ انگلیسی (بایت) !! بازدید ۶۰ روزهٔ انگلیسی !! مدخل(های) ایرانیکا !! واژه‌های مدخل'];
  rows.forEach((r, i) => out.push('|-',
    `| ${num(i + 1)} || <span dir="ltr">[[:en:${r.en}|${r.en}]]</span> || ${num(r.enBytes)} || ${num(r.views)}`
    + ` || ${entriesCell(r.slugs, meta)} || ${maybe(r.irWords)}`));
  out.push('|}');
  return out.join('\n');
}

export function createNoneTable(rows: CreateNoneRow[], meta: Record<string, EntryMeta>): string {
  const out = ['{| class="wikitable sortable" style="font-size:90%"',
    '! ردیف !! مدخل(های) ایرانیکا !! شمار زیرمدخل‌ها !! واژه‌های مدخل'];
  rows.forEach((r, i) => out.push('|-',
    `| ${num(i + 1)} || ${entriesCell(r.slugs, meta, 3)} || ${num(r.slugs.length)} || ${maybe(r.irWords)}`));
  out.push('|}');
  return out.join('\n');
}

export function unsureTable(rows: UnsureRow[], meta: Record<string, EntryMeta>): string {
  const out = ['{| class="wikitable sortable" style="font-size:90%"', '! ردیف !! مدخل ایرانیکا !! مقالهٔ فارسی هم‌نام'];
  rows.forEach((r, i) => out.push('|-', `| ${num(i + 1)} || ${entryLink(r.slug, meta)} || [[${r.guess}]]`));
  out.push('|}');
  return out.join('\n');
}

function subpage(title: string, intro: string, table: string): string {
  return [navBar(), `'''${title}.''' ${intro} همهٔ ستون‌ها مرتب‌شدنی‌اند.`, '',
    'آخرین به‌روزرسانی: ~~~~~', '', table, '', CATEGORY].join('\n');
}

export interface Built { page: string; text: string }

export interface Summary {
  entries: number; skipped: number; source: 'iranica' | 'wayback';
  withFa: number; measured: number;
}

const ORDER = 'ترتیب پیش‌فرض: آن‌ها که فاصلهٔ حجمشان با مدخل ایرانیکا و شمار بازدیدشان بیشتر است بالاترند.';

export function buildPages(
  improve: ImproveRow[], createEn: CreateEnRow[], createNone: CreateNoneRow[], unsure: UnsureRow[],
  meta: Record<string, EntryMeta>, s: Summary,
): Built[] {
  const by = (g: Grade[]) => improve.filter(r => g.includes(r.grade));
  const stub = by(['خرد']), start = by(['آغازین']), rest = by(['متوسط', 'کامل‌تر', 'خوب', 'برگزیده']);
  const count = (g: Grade) => improve.filter(r => r.grade === g).length;
  const shown = (n: number, cap: number) => (n > cap ? `${faDigits(n)} مورد؛ ${faDigits(cap)} ردیف نخست.` : `${faDigits(n)} مورد.`);

  const pages: Built[] = [
    { page: SUBPAGES.stub, text: subpage('مقاله‌های خردی که ایرانیکا برایشان مدخل دارد',
      `برچسب خرد یا کمتر از ۳۰۰ واژه نثر. ${shown(stub.length, CAP.stub)} ${ORDER}`, improveTable(stub.slice(0, CAP.stub), meta)) },
    { page: SUBPAGES.start, text: subpage('مقاله‌های آغازینی که ایرانیکا برایشان مدخل دارد',
      `۳۰۰ تا ۹۹۹ واژه نثر. ${shown(start.length, CAP.start)} ${ORDER}`, improveTable(start.slice(0, CAP.start), meta)) },
    { page: SUBPAGES.rest, text: subpage('مقاله‌های متوسط و بلندتری که مدخل ایرانیکا هنوز چیزی بیش از آن‌ها دارد',
      `${shown(rest.length, CAP.rest)} کیفیت: ${GRADE_KEY}. ${ORDER}`,
      improveTable([...rest].sort((a, b) => b.score - a.score).slice(0, CAP.rest), meta)) },
    { page: SUBPAGES.createEn, text: subpage('موضوع‌هایی که مقالهٔ انگلیسی و مدخل ایرانیکا دارند ولی مقالهٔ فارسی ندارند',
      `${shown(createEn.length, CAP.createEn)} به ترتیب بازدید مقالهٔ انگلیسی.`, createEnTable(createEn.slice(0, CAP.createEn), meta)) },
    { page: SUBPAGES.createNone, text: subpage('مدخل‌هایی که در هیچ‌یک از دو ویکی‌پدیا مقالهٔ هم‌موضوع برایشان پیدا نشد',
      `${shown(createNone.length, CAP.createNone)} از بلندترین مدخل. پیش از ساخت، نام فارسی را جست‌وجو کنید: شاید مقاله با نامی دیگر هست.`,
      createNoneTable(createNone.slice(0, CAP.createNone), meta)) },
    { page: SUBPAGES.unsure, text: subpage('مدخل‌هایی که مقالهٔ فارسی هم‌نامی دارند ولی هم‌موضوع بودنشان روشن نیست',
      `${shown(unsure.length, CAP.unsure)} نام مقاله با نام مدخل یکی است ولی ممکن است موضوعی دیگر باشد؛ پیش از کار، هر دو را بخوانید.`,
      unsureTable(unsure.slice(0, CAP.unsure), meta)) },
  ];

  const top = [...stub, ...start].sort((a, b) => b.score - a.score).slice(0, PREVIEW);
  const row = (label: string, n: number, page: string, link: string) => `|-\n| ${label} || ${num(n)} || [[${page}|${link}]]`;
  const main = [
    navBar(),
    `این صفحه نشان می‌دهد کدام مقاله‌های ویکی‌پدیای فارسی را می‌شود با [[دانشنامه ایرانیکا|دانشنامهٔ ایرانیکا]] گسترش داد `
    + `و کدام موضوع‌های ایرانیکا هنوز مقالهٔ فارسی ندارند. همهٔ ${faDigits(s.entries)} مدخل برخط ایرانیکا با مقاله‌های `
    + 'ویکی‌پدیای فارسی و انگلیسی سنجیده می‌شود.',
    '',
    'آخرین به‌روزرسانی: ~~~~~',
    '',
    '== خلاصه ==',
    '{| class="wikitable"',
    '! بخش !! شمار !! فهرست',
    row('مقاله‌های فارسی خرد که مدخل ایرانیکا دارند', count('خرد'), SUBPAGES.stub, 'خرد'),
    row('مقاله‌های فارسی آغازین', count('آغازین'), SUBPAGES.start, 'آغازین'),
    row('مقاله‌های فارسی متوسط و بلندتر', rest.length, SUBPAGES.rest, 'بلندتر'),
    row('موضوع‌های دارای مقالهٔ انگلیسی و بی مقالهٔ فارسی', createEn.length, SUBPAGES.createEn, 'ساخت با مقالهٔ انگلیسی'),
    row('موضوع‌های بی مقاله در هر دو ویکی‌پدیا', createNone.length, SUBPAGES.createNone, 'ساخت مقالهٔ تازه'),
    row('مدخل‌های دارای مقالهٔ هم‌نام که هم‌موضوع بودنشان روشن نیست', unsure.length, SUBPAGES.unsure, 'بررسی‌نشده'),
    '|}',
    '',
    `* مدخل‌های برخط ایرانیکا: ${faDigits(s.entries)}، که ${faDigits(s.skipped)} تای آن‌ها مدخل ارجاعی یا فهرستی‌اند و کنار گذاشته شدند.`,
    `* ${faDigits(s.withFa)} مدخل به ${faDigits(improve.length)} مقالهٔ فارسی می‌رسند. کیفیت این مقاله‌ها: `
    + (['خرد', 'آغازین', 'متوسط', 'کامل‌تر', 'خوب', 'برگزیده'] as Grade[]).map(g => `${g} ${faDigits(count(g))}`).join('، ') + '.',
    `* ${faDigits(improve.filter(r => r.cites).length)} تا از این مقاله‌ها هم‌اکنون دست‌کم یک بار به ایرانیکا ارجاع داده‌اند.`,
    `* طول ${faDigits(s.measured)} مدخل سنجیده شده است و باقی کم‌کم سنجیده می‌شوند؛ ستون «واژه‌های مدخل» برای آن‌ها «ـ» است.`,
    '',
    '== روش ==',
    '* \'\'\'پیوند مدخل به مقاله:\'\'\' شناسهٔ ایرانیکا در ویکی‌داده (P3021)؛ مقاله‌های ویکی‌پدیای انگلیسی و فارسی که خودِ همان '
    + 'مدخل را یاد کرده‌اند و عنوانشان با آن می‌خواند؛ جست‌وجوی سرواژهٔ مدخل در هر دو ویکی‌پدیا؛ و پیوند میان‌زبانی مقالهٔ '
    + 'انگلیسی. پیوندهایی که فقط بر پایهٔ هم‌نامی بود و موضوعشان به ایران نمی‌رسید (مانند روستایی هم‌نام یا صفحهٔ نام) کنار گذاشته شد.',
    `* '''کیفیت مقالهٔ فارسی''' از شمار واژه‌های نثر متن (بی جعبه‌ها، جدول‌ها، فهرست‌ها و پانویس‌ها) و رده‌های خرد، خوب و برگزیده: ${GRADE_KEY}.`,
    '* \'\'\'واژه‌های مدخل\'\'\' طول متن مدخل ایرانیکا بی کتاب‌نامه است. \'\'\'بازدید\'\'\' مجموع بازدید ۶۰ روز گذشته است.',
    '* متن ایرانیکا آزاد نیست. از آن باید به‌عنوان منبع بهره برد و مطلب را با نوشتهٔ خود آورد، نه ترجمه.',
    '',
    `== نمونه: مقاله‌های کوتاه با بیشترین فاصله ==`,
    `${faDigits(PREVIEW)} ردیف نخست؛ فهرست کامل در [[${SUBPAGES.stub}|خردها]] و [[${SUBPAGES.start}|آغازین‌ها]].`,
    '',
    improveTable(top, meta),
    '',
    '== نمونه: پربازدیدترین موضوع‌های بی مقالهٔ فارسی ==',
    `${faDigits(PREVIEW)} ردیف نخست؛ [[${SUBPAGES.createEn}|فهرست کامل]].`,
    '',
    createEnTable(createEn.slice(0, PREVIEW), meta),
    '',
    CATEGORY,
  ].join('\n');
  // Subpages first, so the main page never links one that does not exist yet.
  return [...pages, { page: REPORT_PAGE, text: main }];
}
