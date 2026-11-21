/**
 * وظیفهٔ ۱۹ — find out what a URL is: title, site, date, authors, and whether it is alive.
 *
 * The ladder, per URL:
 *
 *   1. Citoid, the citation service VisualEditor uses (`/api/rest_v1/data/citation`).
 *      If its title passes `judgeTitle`, that is the answer and nothing else is fetched.
 *   2. The page itself: `og:title`, `<title>`, JSON-LD `datePublished`, `<html lang>`.
 *      Needed for Iranian sites Citoid cannot reach, and for the per-site overrides in
 *      data/sites.json (NobelPrize.org's archive pages all share one title).
 *   3. When the page is GONE (404/410, a parked or suspended host, a redirect to the home
 *      page): the newest Wayback capture with status 200, read from the CDX index, and the
 *      snapshot's own title. The archive URL is built from the CAPTURED URL the CDX row
 *      gives, never the one we asked about
 *      (lessons/citations/wayback-archive-url-must-be-the-captured-url.md).
 *
 * A 403, a timeout or a JavaScript challenge is NOT evidence that a page is dead
 * (lessons/verification-and-gates/citation-403-is-not-a-dead-link.md). Those come back
 * `unknown`, and the bare URL is left alone.
 *
 * `combine()` makes every decision and is pure; `NetResolver` only performs requests.
 */
import { BOT_UA } from '../../core.js';
import type { Meta } from './build.js';
import { decodeEntities, judgeAuthor, judgeDate, judgeTitle, langOf, persianLetterforms } from './quality.js';
import { hostOf, isArchiveUrl } from './url.js';
import sitesData from './data/sites.json' with { type: 'json' };

export type Status = 'live' | 'dead' | 'unknown';
export interface Resolved {
  status: Status;
  /** present when a usable citation can be built */
  meta?: Meta;
  reason?: string;
  archive?: { url: string; date: string };
}

export interface SiteEntry { article?: string; name?: string; news?: boolean; titleFrom?: 'h1' | 'h2'; titlePrefix?: string; noDate?: boolean }
const SITES = sitesData as unknown as Record<string, SiteEntry>;

/** Longest matching `host` or `host/path-prefix` key; `www.` and `m.` are ignored. */
export function siteFor(url: string, sites: Record<string, SiteEntry> = SITES): SiteEntry | undefined {
  const m = /^https?:\/\/([^/?#:]+)(?::\d+)?([^?#]*)/i.exec(url);
  if (!m) return undefined;
  const host = m[1].toLowerCase().replace(/^(?:www\d*|m|mobile|amp)\./, '');
  const path = m[2];
  let best: string | undefined;
  for (const k of Object.keys(sites)) {
    if (k.startsWith('_')) continue;
    const slash = k.indexOf('/');
    const kh = slash < 0 ? k : k.slice(0, slash), kp = slash < 0 ? '' : k.slice(slash);
    if (host !== kh && !host.endsWith('.' + kh)) continue;
    if (kp && !path.startsWith(kp)) continue;
    if (!best || k.length > best.length) best = k;
  }
  return best ? sites[best] : undefined;
}

// ---------------------------------------------------------------------------
// Inputs to combine()
// ---------------------------------------------------------------------------

export interface CitoidItem {
  itemType?: string; title?: string; url?: string; date?: string; language?: string;
  websiteTitle?: string; publicationTitle?: string; blogTitle?: string;
  author?: [string, string][];
}
export type CitoidResult = { ok: true; item: CitoidItem } | { ok: false; status: number };

export interface PageResult {
  status: number;          // 0 = network failure or timeout
  finalUrl: string;
  title?: string;          // <title>
  ogTitle?: string;
  h1?: string;
  h2?: string;
  siteName?: string;
  published?: string;
  lang?: string;
  challenge?: boolean;     // Cloudflare / ArvanCloud / "transferring to the website…"
}

export interface Capture { timestamp: string; original: string }

// ---------------------------------------------------------------------------
// Decisions
// ---------------------------------------------------------------------------

/** The page we asked for is not there any more, judged from where the request ended up. */
export function softDead(asked: string, finalUrl: string | undefined): string | null {
  if (!finalUrl) return null;
  const f = finalUrl.toLowerCase();
  if (/suspendedpage|account-?suspended|\/404(?:\.\w+)?(?:[?#]|$)|notfound|not-found|error\.(?:html?|aspx?)|hugedomains|sedoparking|parkingcrew|dan\.com\/buy|geoblock/.test(f)) return 'soft-404';
  const a = /^https?:\/\/[^/]+(\/[^?#]*)?(\?[^#]*)?/i.exec(asked);
  const b = /^https?:\/\/[^/]+(\/[^?#]*)?(\?[^#]*)?/i.exec(finalUrl);
  if (a && b) {
    const ap = (a[1] ?? '/') + (a[2] ?? ''), bp = (b[1] ?? '/') + (b[2] ?? '');
    const home = /^\/?(?:index\.\w+|fa\/?|en\/?|home\/?)?$/i;
    if (!home.test(ap) && home.test(bp)) return 'redirected-home';
    // Sent somewhere unrelated: none of the asked path's identifying segments survive.
    // A canonicalising redirect keeps the id (`/news/1405080603988/` → `/news/1405080603988/slug`).
    const dec = (x: string) => { try { return decodeURIComponent(x); } catch { return x; } };
    const ids = dec(ap).split(/[/?&=._-]+/).filter(t => t.length >= 4 && !/^(?:news|html?|php|aspx?|index|article|articles|content|detail|fa|en|www)$/i.test(t));
    const fin = dec(finalUrl).toLowerCase();
    if (ids.length && !ids.some(t => fin.includes(t.toLowerCase()))) return 'redirected-elsewhere';
  }
  return null;
}

function firstSegment(s: string | undefined): string | undefined {
  if (!s) return undefined;
  const t = decodeEntities(s).split(/\s+[|–—:-]\s+/)[0].trim();
  return t.length >= 2 ? t : undefined;
}

/** The plain website name, before any linking. */
function websiteName(url: string, candidates: (string | undefined)[]): string {
  // «Analytics Platform - Matomo» on matomo.org: the segment that IS the host wins.
  const stem = (hostOf(url) ?? '').replace(/^www\d*\./, '').split('.')[0].replace(/-/g, '').toLowerCase();
  for (const c of candidates) {
    if (!c || stem.length < 3) continue;
    const seg = decodeEntities(c).split(/\s+[|–—:-]\s+/).map(x => x.trim()).find(x => x.replace(/[\s.-]/g, '').toLowerCase() === stem);
    if (seg) return seg;
  }
  for (const c of candidates) {
    const s = firstSegment(c);
    if (!s) continue;
    if (/^(?:home|index|news|خانه|صفحه اصلی)$/i.test(s)) continue;
    if (s.length > 60) continue;
    return persianLetterforms(s).replace(/^www\d*\.(?=[a-z0-9-]+(?:\.[a-z0-9-]+)+$)/i, '');
  }
  return (hostOf(url) ?? '').replace(/^www\d*\./, '');
}

export interface CombineInput {
  url: string;
  today: string;            // ISO date, for judging dates
  citoid?: CitoidResult;
  page?: PageResult;
  capture?: Capture | null; // null = asked, none exists
  snapshot?: PageResult;    // the capture, fetched with `id_`
  site?: SiteEntry;
}

/** What was fetched for one URL: CombineInput without the parts that come from config. */
export type Evidence = Omit<CombineInput, 'today' | 'site'>;

/** What still has to be fetched before combine() can decide. */
export function nextStep(inp: CombineInput): 'citoid' | 'page' | 'cdx' | 'snapshot' | null {
  if (!inp.citoid) return 'citoid';
  const c = draftFromCitoid(inp);
  if (c && !inp.site?.titleFrom) return null;
  if (!inp.page) return 'page';
  const p = inp.page;
  const gone = p.status === 404 || p.status === 410 || !!softDead(inp.url, p.finalUrl)
    || (inp.citoid.ok && !!softDead(inp.url, inp.citoid.item.url));
  // A live page behind a bot wall (ArvanCloud on irna.ir/isna.ir): a capture can still tell
  // us its title. The citation keeps the live URL and gets no archive fields.
  if (!gone && !p.challenge) return null;
  if (inp.capture === undefined) return 'cdx';
  if (inp.capture && !inp.snapshot) return 'snapshot';
  return null;
}

/**
 * `طبیعت روستای … | آخرین خبر` with only `akharinkhabar.ir` known as the site: the segment
 * after the LAST ` | ` is the site's name. Only a pipe (a dash is common inside real
 * titles), only a short segment, and only when the site name is otherwise a bare host.
 */
export function splitPipeSite(title: string, website: string, url: string): { title: string; website: string } {
  const host = (hostOf(url) ?? '').replace(/^www\d*\./, '');
  const isHost = !website || website.toLowerCase() === host || website.toLowerCase() === `www.${host}`;
  const m = /^(.{10,}?)\s+\|\s+([^|]{2,40})$/.exec(title);
  if (!isHost || !m || m[2].split(/\s+/).length > 6) return { title, website };
  return { title: m[1].trim(), website: m[2].trim() };
}

function draftFromCitoid(inp: CombineInput): Meta | null {
  if (!inp.citoid?.ok) return null;
  const it = inp.citoid.item;
  if (softDead(inp.url, it.url)) return null;
  const site = websiteName(inp.url, [it.websiteTitle, it.publicationTitle, it.blogTitle]);
  const t = judgeTitle(it.title, { url: inp.url, site, names: [inp.site?.name ?? '', inp.site?.article ?? ''] });
  if (!t.ok) return null;
  const sp = splitPipeSite(persianLetterforms(t.title), site, inp.url);
  return {
    url: inp.url,
    title: sp.title,
    titleFromSite: true,
    website: sp.website,
    date: judgeDate(it.date, inp.today, it.itemType ?? ''),
    authors: (it.author ?? []).map(([f, l]) => [persianLetterforms(f ?? ''), persianLetterforms(l ?? '')] as [string, string])
      .filter(([f, l]) => judgeAuthor(f, l, site, decodeEntities(it.title ?? '').split(/\s+[|–—-]\s+/))),
    language: langOf(t.title, it.language),
    news: it.itemType === 'newspaperArticle' || it.itemType === 'magazineArticle',
  };
}

function draftFromPage(url: string, p: PageResult, site: SiteEntry | undefined, today: string): Meta | { reason: string } {
  if (p.challenge) return { reason: 'bot-challenge' };
  const name = websiteName(url, [p.siteName]);
  let raw = site?.titleFrom === 'h2' ? p.h2 : site?.titleFrom === 'h1' ? p.h1 : (p.ogTitle || p.title);
  if (site?.titleFrom && raw) raw = (site.titlePrefix ?? '') + raw;
  const t = judgeTitle(raw, { url, site: name, names: [site?.name ?? '', site?.article ?? ''] });
  if (!t.ok) return { reason: t.reason };
  const sp = splitPipeSite(persianLetterforms(t.title), name, url);
  return {
    url, title: sp.title, titleFromSite: true, website: sp.website,
    date: judgeDate(p.published, today, 'page'),
    language: langOf(t.title, p.lang),
  };
}

/** Pure: the final answer for a URL, from whatever has been fetched. */
export function combine(inp: CombineInput): Resolved {
  const site = inp.site;
  const fromCitoid = site?.titleFrom ? null : draftFromCitoid(inp);
  if (fromCitoid) return { status: 'live', meta: decorate(fromCitoid, inp) };

  const p = inp.page;
  if (!p) return { status: 'unknown', reason: citoidReason(inp.citoid) };
  const deadWhy = p.status === 404 || p.status === 410 ? `http-${p.status}`
    : softDead(inp.url, p.finalUrl) ?? (inp.citoid?.ok ? softDead(inp.url, inp.citoid.item.url) : null);

  if (!deadWhy && p.challenge) {
    const snap = inp.snapshot;
    if (!inp.capture || !snap || snap.status < 200 || snap.status >= 300 || snap.challenge) return { status: 'live', reason: 'bot-challenge' };
    const d = draftFromPage(inp.url, snap, site, inp.today);
    if ('reason' in d) return { status: 'live', reason: 'bot-challenge' };
    return { status: 'live', meta: decorate(d, inp) };
  }

  if (!deadWhy) {
    if (p.status >= 200 && p.status < 300) {
      const d = draftFromPage(inp.url, p, site, inp.today);
      if ('reason' in d) return { status: 'live', reason: d.reason };
      // Citoid may still know authors and a date when only its title was poor.
      if (inp.citoid?.ok && !site?.titleFrom) {
        const it = inp.citoid.item;
        d.date ??= judgeDate(it.date, inp.today, it.itemType ?? '');
      }
      return { status: 'live', meta: decorate(d, inp) };
    }
    return { status: 'unknown', reason: p.status ? `http-${p.status}` : 'unreachable' };
  }

  if (!inp.capture) return { status: 'dead', reason: `${deadWhy}-no-archive` };
  const archive = {
    url: `https://web.archive.org/web/${inp.capture.timestamp}/${inp.capture.original}`,
    date: `${inp.capture.timestamp.slice(0, 4)}-${inp.capture.timestamp.slice(4, 6)}-${inp.capture.timestamp.slice(6, 8)}`,
  };
  const snap = inp.snapshot;
  if (!snap || snap.status < 200 || snap.status >= 300) return { status: 'dead', archive, reason: 'archive-unreadable' };
  const d = draftFromPage(inp.url, snap, site, inp.today);
  if ('reason' in d) return { status: 'dead', archive, reason: d.reason };
  d.archive = archive;
  return { status: 'dead', archive, meta: decorate(d, inp) };
}

function citoidReason(c: CitoidResult | undefined): string {
  if (!c) return 'not-fetched';
  return c.ok ? 'citoid-poor-title' : `citoid-${c.status}`;
}

function decorate(m: Meta, inp: CombineInput): Meta {
  const s = inp.site;
  if (s?.article) m.website = `[[${s.article}]]`;      // checked for existence before use, see task
  else if (s?.name) m.website = s.name;
  if (s?.news) m.news = true;
  if (s?.noDate) delete m.date;
  if (m.authors && !m.authors.length) delete m.authors;
  return m;
}

// ---------------------------------------------------------------------------
// The network
// ---------------------------------------------------------------------------

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** One polite queue per service: a fixed gap between requests and `Retry-After` obeyed. */
class Gate {
  private last = 0;
  private chain: Promise<void> = Promise.resolve();
  constructor(private gapMs: number) {}
  run<T>(fn: () => Promise<T>): Promise<T> {
    const p = this.chain.then(async () => {
      const wait = this.last + this.gapMs - Date.now();
      if (wait > 0) await sleep(wait);
      this.last = Date.now();
    });
    this.chain = p.catch(() => {});
    return p.then(fn);
  }
  backoff(ms: number) { this.last = Date.now() + ms; }
}

const CHALLENGE = /cf-browser-verification|cf_chl_|challenge-platform|__cf_chl|ddos-guard|arvancloud|در حال انتقال به سایت|transferring to the website|enable javascript and cookies|checking your browser/i;

export function parseHtml(html: string, status: number, finalUrl: string): PageResult {
  const meta = (k: string) => {
    const re1 = new RegExp(`<meta[^>]+(?:property|name)=["']${k}["'][^>]*content=["']([^"']*)["']`, 'i');
    const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${k}["']`, 'i');
    return (re1.exec(html) ?? re2.exec(html))?.[1];
  };
  const tag = (t: string) => {
    const m = new RegExp(`<${t}\\b[^>]*>([\\s\\S]*?)</${t}>`, 'i').exec(html);
    return m ? decodeEntities(m[1].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim() || undefined : undefined;
  };
  const body = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, '');
  const ld = /"datePublished"\s*:\s*"([^"]+)"/.exec(html)?.[1];
  return {
    status, finalUrl,
    title: tag('title'),
    ogTitle: meta('og:title') ? decodeEntities(meta('og:title')!) : undefined,
    h1: (() => { const m = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(body); return m ? decodeEntities(m[1].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim() : undefined; })(),
    h2: (() => { const m = /<h2\b[^>]*>([\s\S]*?)<\/h2>/i.exec(body); return m ? decodeEntities(m[1].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim() : undefined; })(),
    siteName: meta('og:site_name'),
    published: meta('article:published_time') ?? ld ?? meta('date') ?? meta('pubdate'),
    lang: /<html[^>]*\blang=["']?([a-zA-Z-]+)/i.exec(html)?.[1],
    challenge: CHALLENGE.test(html.slice(0, 20000)) && !meta('og:title'),
  };
}

function charsetOf(ct: string | null, head: Uint8Array): string {
  const m = /charset=["']?([\w-]+)/i.exec(ct ?? '');
  if (m) return m[1].toLowerCase();
  const sniff = new TextDecoder('latin1').decode(head.slice(0, 4096));
  const n = /<meta[^>]+charset=["']?([\w-]+)/i.exec(sniff);
  return n ? n[1].toLowerCase() : 'utf-8';
}

export class NetResolver {
  private citoidGate = new Gate(Number(process.env.T19_CITOID_GAP_MS ?? 3000));
  private webGate = new Gate(Number(process.env.T19_WEB_GAP_MS ?? 1500));
  private waybackGate = new Gate(Number(process.env.T19_WAYBACK_GAP_MS ?? 2000));
  constructor(private ua = BOT_UA, private todayIso = new Date().toISOString().slice(0, 10)) {}

  async resolve(url: string): Promise<Resolved> {
    if (isArchiveUrl(url)) return this.resolveArchive(url, { url, today: this.todayIso, site: siteFor(url) });
    return combine({ ...await this.gather(url), today: this.todayIso, site: siteFor(url) });
  }

  /**
   * Fetch what combine() needs and nothing more. The result is the raw evidence, not a
   * decision, so it can be cached and judged again by later, stricter rules without
   * fetching anything.
   */
  async gather(url: string): Promise<Evidence> {
    const inp: CombineInput = { url, today: this.todayIso, site: siteFor(url) };
    for (let guard = 0; guard < 5; guard++) {
      const step = nextStep(inp);
      if (!step) break;
      if (step === 'citoid') inp.citoid = await this.citoid(url);
      else if (step === 'page') inp.page = await this.page(url);
      else if (step === 'cdx') inp.capture = await this.cdx(url);
      else if (step === 'snapshot') inp.snapshot = await this.page(`https://web.archive.org/web/${inp.capture!.timestamp}id_/${inp.capture!.original}`, this.waybackGate);
    }
    const { today: _t, site: _s, ...evidence } = inp;
    return evidence;
  }

  /** A citation already carrying a Wayback URL: read the title from the capture. */
  private async resolveArchive(url: string, inp: CombineInput): Promise<Resolved> {
    const m = /^https?:\/\/web\.archive\.org\/web\/(\d{8,14})[a-z_]*\/(.+)$/i.exec(url);
    if (!m) return { status: 'unknown', reason: 'archive-url' };
    const snap = await this.page(`https://web.archive.org/web/${m[1]}id_/${m[2]}`, this.waybackGate);
    if (snap.status < 200 || snap.status >= 300) return { status: 'unknown', reason: 'archive-unreadable' };
    const t = judgeTitle(snap.ogTitle || snap.title, { url: m[2], site: snap.siteName });
    if (!t.ok) return { status: 'unknown', reason: t.reason };
    return { status: 'unknown', meta: decorate({ url: m[2], title: persianLetterforms(t.title), titleFromSite: true, language: langOf(t.title, snap.lang) }, { ...inp, url: m[2], site: siteFor(m[2]) }) };
  }

  async citoid(url: string): Promise<CitoidResult> {
    const api = `https://fa.wikipedia.org/api/rest_v1/data/citation/mediawiki/${encodeURIComponent(url)}`;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const r = await this.citoidGate.run(() => fetch(api, { headers: { 'User-Agent': this.ua, 'Accept-Language': 'fa' }, signal: AbortSignal.timeout(60_000) }));
        if (r.status === 429 || r.status === 503) {
          this.citoidGate.backoff((Number(r.headers.get('retry-after')) || 15) * 1000);
          await r.body?.cancel();
          continue;
        }
        if (!r.ok) { await r.body?.cancel(); return { ok: false, status: r.status }; }
        const j = await r.json() as CitoidItem[];
        return j?.[0] ? { ok: true, item: j[0] } : { ok: false, status: 204 };
      } catch { if (attempt >= 1) return { ok: false, status: 0 }; }
    }
    return { ok: false, status: 429 };
  }

  async page(url: string, gate = this.webGate): Promise<PageResult> {
    const first = await this.pageOnce(url, gate);
    if (first.status !== 0) return first;
    await sleep(5000);                         // one retry: DNS and TLS hiccups are common
    return this.pageOnce(url, gate);
  }

  private async pageOnce(url: string, gate: Gate): Promise<PageResult> {
    try {
      const r = await gate.run(() => fetch(url, {
        headers: { 'User-Agent': this.ua, 'Accept': 'text/html,application/xhtml+xml', 'Accept-Language': 'fa,en;q=0.5' },
        redirect: 'follow', signal: AbortSignal.timeout(30_000),
      }));
      const ct = r.headers.get('content-type');
      if (ct && !/html|xml/i.test(ct)) { await r.body?.cancel(); return { status: r.status, finalUrl: r.url }; }
      const buf = new Uint8Array(await r.arrayBuffer()).slice(0, 2_000_000);
      let html: string;
      try { html = new TextDecoder(charsetOf(ct, buf)).decode(buf); } catch { html = new TextDecoder('utf-8').decode(buf); }
      return parseHtml(html, r.status, r.url);
    } catch {
      return { status: 0, finalUrl: url };
    }
  }

  async cdx(url: string): Promise<Capture | null> {
    const q = `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(url.replace(/^https?:\/\//i, ''))}&output=json&filter=statuscode:200&filter=mimetype:text/html&limit=-1&fl=timestamp,original`;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await this.waybackGate.run(() => fetch(q, { headers: { 'User-Agent': this.ua }, signal: AbortSignal.timeout(60_000) }));
        if (r.status === 429 || r.status >= 500) { this.waybackGate.backoff(20_000); await r.body?.cancel(); continue; }
        if (!r.ok) { await r.body?.cancel(); return null; }
        const rows = await r.json() as string[][];
        const last = rows?.[rows.length - 1];
        if (!last || last[0] === 'timestamp') return null;
        return { timestamp: last[0], original: last[1] };
      } catch { /* retry */ }
    }
    return null;
  }
}
