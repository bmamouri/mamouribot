/**
 * The networked half of the Iranica report. What it decides and why is in
 * `iranica-report.ts`; this file only fetches.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { gunzipSync } from 'zlib';
import { Bot, BOT_UA, EN_API } from '../../core.js';
import { checkWikitext } from '../../lib/gates.js';
import frozen from './data/iranica-match.json' with { type: 'json' };
import {
  CRAWL_DELAY_MS, IRANICA, MIN_ENTRIES, PAGES_PER_RUN, REPORT_PAGE, SKIP, WAYBACK,
  buildImprove, buildPages, irWords, isChallenge, measure, parentOf, parseEntry,
  parseSitemap, parseSitemapIndex, signaturePage, slugOf,
  type CreateEnRow, type CreateNoneRow, type EntryMeta, type FaQuality, type MatchRow, type UnsureRow,
} from './iranica-report.js';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const WDQS = 'https://query.wikidata.org/sparql';
const STATE = () => process.env.BOT_STATE_DIR ?? '.state';
const CACHE = () => join(STATE(), 'iranica-entries.json');

type Source = 'iranica' | 'wayback';

/**
 * GET one Iranica URL: the site itself first, the Wayback copy if the site answers with
 * the Cloudflare challenge. Once the site has challenged us, the rest of the run goes
 * straight to Wayback rather than paying a wasted request (and a crawl delay) each time.
 */
class IranicaClient {
  direct = true;
  used: Source = 'iranica';
  private last = 0;

  private async get(url: string, ua: string): Promise<{ status: number; body: string }> {
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        const res = await fetch(url, { headers: { 'User-Agent': ua }, signal: AbortSignal.timeout(90_000), redirect: 'follow' });
        // Wayback's raw (`id_`) copy of a file the site served gzipped is the gzip bytes
        // themselves, labelled text/xml with no Content-Encoding, so fetch does not
        // inflate it. Measured: articles-sitemap10.xml arrives as 10,616 gzip bytes.
        const raw = Buffer.from(await res.arrayBuffer());
        const body = (raw[0] === 0x1f && raw[1] === 0x8b ? gunzipSync(raw) : raw).toString('utf8');
        // Wayback refuses connections for a few minutes when hit too fast; archive.org
        // also has whole-site outages («Temporarily Offline», 503). Wait both out.
        if (res.status === 429 || (res.status === 503 && !isChallenge(503, body))) {
          await sleep(60_000 * (attempt + 1)); continue;
        }
        return { status: res.status, body };
      } catch {
        await sleep(30_000 * (attempt + 1));
      }
    }
    return { status: 0, body: '' };
  }

  /** `path` is everything after the host, e.g. `/articles/korsi/`. Returns null on 404. */
  async fetch(path: string, opts: { polite?: boolean } = {}): Promise<string | null> {
    if (this.direct) {
      if (opts.polite) await sleep(Math.max(0, this.last + CRAWL_DELAY_MS - Date.now()));
      this.last = Date.now();
      const r = await this.get(IRANICA + path, BOT_UA);
      if (r.status === 404) return null;
      if (r.status === 200 && !isChallenge(200, r.body)) return r.body;
      if (isChallenge(r.status, r.body)) {
        console.log('ایرانیکا درخواست را با صفحهٔ چالش پاسخ داد؛ از نسخهٔ بایگانی‌شده در Wayback استفاده می‌شود');
        this.direct = false;
      } else {
        throw new Error(`ایرانیکا ${r.status} برای ${path}`);
      }
    }
    this.used = 'wayback';
    if (opts.polite) await sleep(2000);
    const r = await this.get(WAYBACK + IRANICA + path, BOT_UA);
    if (r.status === 404) return null;
    if (r.status !== 200) throw new Error(`Wayback ${r.status} برای ${path}`);
    return r.body;
  }
}

/** Every entry slug from the sitemap index. Throws if the set is implausibly small. */
async function entrySlugs(ir: IranicaClient): Promise<string[]> {
  const index = await ir.fetch('/sitemap_index.xml');
  if (!index) throw new Error('نقشهٔ سایت ایرانیکا پیدا نشد');
  const maps = parseSitemapIndex(index);
  const out = new Set<string>();
  for (const url of maps) {
    const xml = await ir.fetch(new URL(url).pathname);
    const got = xml ? parseSitemap(xml) : [];
    // Every listed sitemap holds entries; an empty one is a failed read, not an empty file.
    if (!got.length) throw new Error(`نقشهٔ ${url} هیچ مدخلی نداشت`);
    for (const s of got) out.add(s);
    await sleep(1000);
  }
  if (out.size < MIN_ENTRIES) {
    throw new Error(`تنها ${out.size} مدخل در نقشهٔ سایت (${maps.length} پرونده)؛ کمتر از ${MIN_ENTRIES}، پس احتمالاً صفحهٔ چالش یا نسخهٔ ناقص است`);
  }
  return [...out].sort();
}

function loadCache(): Record<string, EntryMeta> {
  const p = CACHE();
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : {};
}
function saveCache(c: Record<string, EntryMeta>) {
  mkdirSync(STATE(), { recursive: true });
  writeFileSync(CACHE(), JSON.stringify(c));
}

/** Measure up to PAGES_PER_RUN entries that have never been read, saving as it goes. */
async function topUp(ir: IranicaClient, slugs: string[], cache: Record<string, EntryMeta>, wanted: Set<string>, limit: number) {
  const todo = slugs.filter(s => !cache[s]?.m)
    .sort((a, b) => Number(wanted.has(b)) - Number(wanted.has(a)))
    .slice(0, limit);
  console.log(`سنجش ${todo.length} مدخل تازه (${slugs.length - slugs.filter(s => !cache[s]?.m).length} از پیش سنجیده)`);
  const today = new Date().toISOString().slice(0, 10);
  for (const [i, s] of todo.entries()) {
    try {
      const html = await ir.fetch(`/articles/${s.split('/').map(encodeURIComponent).join('/')}/`, { polite: true });
      cache[s] = html === null ? { gone: 1, m: today } : { ...cache[s], ...parseEntry(html), m: today };
    } catch (e) {
      console.log(`  ${s}: ${(e as Error).message}`);
    }
    if ((i + 1) % 25 === 0) { saveCache(cache); console.log(`  ${i + 1}/${todo.length}`); }
  }
  saveCache(cache);
}

/**
 * Wikidata's live P3021 claims: slug → enwiki title. Only the EN title is taken from
 * WDQS; fa titles never are, because `schema:name` strips the ZWNJ (see task-14). The fa
 * article is reached through en's own langlink in `enInfo()`.
 */
async function liveWikidata(): Promise<Map<string, string>> {
  const q = 'SELECT ?id ?en WHERE { ?i wdt:P3021 ?id . '
    + '?e schema:about ?i; schema:isPartOf <https://en.wikipedia.org/>; schema:name ?en }';
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(`${WDQS}?format=json&query=${encodeURIComponent(q)}`,
        { headers: { 'User-Agent': BOT_UA, Accept: 'application/sparql-results+json' }, signal: AbortSignal.timeout(120_000) });
      if (!res.ok) throw new Error(`WDQS ${res.status}`);
      const j: any = await res.json();
      const out = new Map<string, string>();
      for (const b of j.results.bindings) {
        const s = slugOf(`${IRANICA}/articles/${b.id.value}`);
        if (s) out.set(s, b.en.value);
      }
      return out;
    } catch (e) {
      if (attempt === 3) { console.log(`WDQS در دسترس نبود: ${(e as Error).message}؛ تنها دادهٔ ثابت به کار می‌رود`); break; }
      await sleep(20_000 * (attempt + 1));
    }
  }
  return new Map();
}

/** Which of these fa titles exist as articles (redirects followed). */
async function faExists(bot: Bot, titles: string[]): Promise<Set<string>> {
  const live = new Set<string>();
  for (let i = 0; i < titles.length; i += 50) {
    const d = await bot.apiGet({ action: 'query', titles: titles.slice(i, i + 50).join('|'), redirects: '1', prop: 'info' });
    const q = d.query ?? {};
    const ok = new Set((q.pages ?? []).filter((p: any) => !p.missing && p.ns === 0).map((p: any) => p.title));
    const back = new Map<string, string>();
    for (const x of [...(q.normalized ?? []), ...(q.redirects ?? [])]) back.set(x.to, back.get(x.from) ?? x.from);
    for (const t of ok) live.add(back.get(t as string) ?? (t as string));
  }
  return live;
}

/** en title → { fa langlink, bytes, 60-day views }, following en redirects. */
async function enInfo(bot: Bot, titles: string[]) {
  const out = new Map<string, { fa?: string; bytes: number; views: number }>();
  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50);
    let cont: Record<string, string> = {};
    for (;;) {
      const d = await bot.apiGetOn(EN_API, { action: 'query', titles: batch.join('|'), redirects: '1',
        prop: 'langlinks|info|pageviews', lllang: 'fa', lllimit: 'max', ...cont });
      const q = d.query ?? {};
      const back = new Map<string, string>();
      for (const x of [...(q.normalized ?? []), ...(q.redirects ?? [])]) back.set(x.to, back.get(x.from) ?? x.from);
      for (const p of q.pages ?? []) {
        if (p.missing) continue;
        const key = back.get(p.title) ?? p.title;
        const cur: { fa?: string; bytes: number; views: number } = out.get(key) ?? { bytes: p.length ?? 0, views: 0 };
        if (p.langlinks?.[0]) cur.fa = p.langlinks[0].title;
        cur.views += Object.values(p.pageviews ?? {}).reduce((a: number, v: any) => a + (v ?? 0), 0);
        out.set(key, cur);
      }
      if (!d.continue) break;
      cont = d.continue;
    }
  }
  return out;
}

/** fa title (as asked) → quality, following redirects; missing titles are absent. */
async function faQuality(bot: Bot, titles: string[]): Promise<Map<string, FaQuality>> {
  const out = new Map<string, FaQuality>();
  const cats = 'رده:همه مقاله‌های خرد|رده:مقاله‌های خوب|رده:مقاله‌های برگزیده';
  const views = new Map<string, number>();
  // Content in batches of 20: 50 full wikitexts overflow the response limit and the API
  // silently drops `revisions` from the tail of the batch.
  for (let i = 0; i < titles.length; i += 20) {
    const batch = titles.slice(i, i + 20);
    const d = await bot.apiGet({ action: 'query', titles: batch.join('|'), redirects: '1',
      prop: 'revisions|categories', rvprop: 'content', rvslots: 'main', cllimit: 'max', clcategories: cats });
    const q = d.query ?? {};
    const back = new Map<string, string>();
    for (const x of [...(q.normalized ?? []), ...(q.redirects ?? [])]) back.set(x.to, back.get(x.from) ?? x.from);
    for (const p of q.pages ?? []) {
      if (p.missing || !p.revisions) continue;
      const c = new Set<string>((p.categories ?? []).map((x: any) => x.title));
      const m = measure(p.title, p.revisions[0].slots.main.content, c);
      const asked = back.get(p.title) ?? p.title;
      out.set(asked, { ...m, views: 0 });
      if (asked !== p.title) out.set(p.title, out.get(asked)!);
    }
    if ((i / 20) % 25 === 0) console.log(`  کیفیت مقاله‌های فارسی: ${Math.min(i + 20, titles.length)}/${titles.length}`);
  }
  const resolved = [...new Set([...out.values()].map(q => q.title))];
  for (let i = 0; i < resolved.length; i += 50) {
    let cont: Record<string, string> = {};
    for (;;) {
      const d = await bot.apiGet({ action: 'query', titles: resolved.slice(i, i + 50).join('|'), prop: 'pageviews', ...cont });
      for (const p of d.query?.pages ?? []) {
        views.set(p.title, (views.get(p.title) ?? 0) + Object.values(p.pageviews ?? {}).reduce((a: number, v: any) => a + (v ?? 0), 0));
      }
      if (!d.continue) break;
      cont = d.continue;
    }
  }
  for (const q of out.values()) q.views = views.get(q.title) ?? 0;
  return out;
}

async function publish(bot: Bot, page: string, text: string, live: boolean, signature: boolean) {
  const problems = checkWikitext(page, text).filter(p => !p.includes('signature leak'));
  if (problems.length) throw new Error(`GATE FAILED (${page}):\n  - ` + problems.join('\n  - '));
  if (!live) { console.log(`\n===== ${page}: ${text.length} بایت`); return; }
  const cur = await bot.apiGet({ action: 'query', prop: 'revisions', titles: page, rvprop: 'ids|timestamp', rvslots: 'main' });
  const p = cur.query.pages[0];
  await bot.edit(page, text, 'به‌روزرسانی گزارش مقاله‌هایی که با دانشنامهٔ ایرانیکا می‌شود گسترش داد',
    p.missing ? 0 : p.revisions[0].revid, p.missing ? '' : p.revisions[0].timestamp, { allowCreate: true });
  console.log(`منتشر شد: ${page}`);
  if (!signature) return;
  const sig = signaturePage(page);
  const s = (await bot.apiGet({ action: 'query', prop: 'revisions', titles: sig, rvprop: 'ids|timestamp', rvslots: 'main' })).query.pages[0];
  await bot.edit(sig, '‏~~~~~', 'به‌روزرسانی زمان آخرین اجرا',
    s.missing ? 0 : s.revisions[0].revid, s.missing ? '' : s.revisions[0].timestamp, { allowCreate: true });
}

export async function runIranicaReport(argv: string[]) {
  const live = argv.includes('--live');
  const pages = Number(argv[argv.indexOf('--pages') + 1]);
  const bot = new Bot({ dryRun: !live, delayMs: 0, limit: 0, maxlag: 5, flagEdits: false });
  const ir = new IranicaClient();

  // 1. the entry list, from Iranica or its archived copy
  const slugs = await entrySlugs(ir);
  const source = ir.used;
  console.log(`${slugs.length} مدخل از ${source === 'iranica' ? 'خود ایرانیکا' : 'نسخهٔ بایگانی‌شده'}`);

  // 2. matches: frozen file, plus live Wikidata and en langlinks
  const fz = frozen as unknown as Record<string, MatchRow>;
  const match = new Map<string, { fa?: string; en?: string; guess?: string; unlinked?: string }>();
  for (const s of slugs) {
    const r = fz[s] ?? [];
    match.set(s, { fa: r[0] || undefined, en: r[1] || undefined, guess: r[3] || undefined, unlinked: r[4] || undefined });
  }
  const wd = await liveWikidata();
  let added = 0;
  for (const [s, enTitle] of wd) {
    const m = match.get(s);
    if (m && !m.en) { m.en = enTitle; added++; }
  }
  const enTitles = [...new Set([...match.values()].map(m => m.en).filter((t): t is string => !!t))];
  const en = await enInfo(bot, enTitles);
  for (const m of match.values()) {
    const fa = m.en ? en.get(m.en)?.fa : undefined;
    if (!m.fa && fa) { m.fa = fa; m.guess = undefined; added++; }
  }
  console.log(`پیوند تازه از ویکی‌داده و پیوند میان‌زبانی: ${added}`);

  // 3. entry metadata, cached; topped up a little each run
  const cache = loadCache();
  const wanted = new Set([...match].filter(([, m]) => m.fa || m.en).map(([s]) => s));
  if (!argv.includes('--no-fetch')) {
    const n = Number.isFinite(pages) && pages >= 0 ? pages : PAGES_PER_RUN;
    if (n > 0) await topUp(ir, slugs, cache, wanted, n);
  }

  // 4. fa quality, live
  const faTitles = [...new Set([...match.values()].map(m => m.fa).filter((t): t is string => !!t))];
  console.log(`${faTitles.length} مقالهٔ فارسی برای سنجش`);
  const quality = await faQuality(bot, faTitles);
  // A frozen fa title that no longer exists (deleted, or moved without a redirect) is a
  // create candidate again, not an improve row.
  for (const m of match.values()) if (m.fa && !quality.has(m.fa)) m.fa = undefined;

  const improve = buildImprove(match, quality, cache);
  if (improve.length < 1000) throw new Error(`تنها ${improve.length} مقالهٔ فارسی؛ احتمالاً دادهٔ ثابت یا خواندن کیفیت شکسته است`);

  const createEnMap = new Map<string, CreateEnRow>();
  for (const [s, m] of match) {
    if (m.fa || !m.en || m.unlinked || SKIP.test(s) || cache[s]?.gone) continue;
    const info = en.get(m.en);
    if (!info) continue;
    const row = createEnMap.get(m.en) ?? { en: m.en, slugs: [], enBytes: info.bytes, views: info.views, irWords: null };
    row.slugs.push(s);
    createEnMap.set(m.en, row);
  }
  const createEn = [...createEnMap.values()].map(r => ({ ...r, irWords: irWords(r.slugs, cache) }))
    .sort((a, b) => b.views - a.views);

  const groups = new Map<string, string[]>();
  const unsure: UnsureRow[] = [];
  for (const [s, m] of match) {
    if (m.fa || m.en || SKIP.test(s) || cache[s]?.gone) continue;
    if (m.guess) { unsure.push({ slug: s, guess: m.guess }); continue; }
    const p = parentOf(s);
    groups.set(p, [...(groups.get(p) ?? []), s]);
  }
  const createNone: CreateNoneRow[] = [...groups.values()]
    .map(sl => ({ slugs: sl.sort(), irWords: irWords(sl, cache) }))
    .sort((a, b) => (b.irWords ?? 0) - (a.irWords ?? 0) || b.slugs.length - a.slugs.length);
  // The guesses must still exist, or the unsure page fills with red links.
  const guessLive = await faExists(bot, [...new Set(unsure.map(u => u.guess))]);
  const unsureLive = unsure.filter(u => guessLive.has(u.guess)).sort((a, b) => a.slug.localeCompare(b.slug));

  const built = buildPages(improve, createEn, createNone, unsureLive, cache, {
    entries: slugs.length, skipped: slugs.filter(s => SKIP.test(s)).length, source,
    withFa: [...match].filter(([s, m]) => m.fa && quality.has(m.fa) && !SKIP.test(s)).length,
    measured: slugs.filter(s => typeof cache[s]?.w === 'number').length,
  });
  for (const b of built) {
    await publish(bot, b.page, b.text, live, b.page === REPORT_PAGE);
    if (live) await sleep(5000);
  }
}
