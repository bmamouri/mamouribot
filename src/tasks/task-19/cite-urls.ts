/**
 * وظیفهٔ ۱۹ — complete bare-URL references and repair citation URLs.
 *
 *   npx tsx src/run.ts cite-urls --limit 20                       # dry run, from the searches
 *   TARGET_TITLES='حسین کاظم‌زاده ایرانشهر' npx tsx src/run.ts cite-urls
 *   npx tsx src/run.ts cite-urls --live --as-me --limit 30        # trial under my account
 *
 * The flow, because the framework's transform() is synchronous and offline:
 *
 *   getTargets   read every candidate, run planPage() with an empty lookup to learn which
 *                URLs need metadata, resolve those (Citoid → the page → Wayback), cache the
 *                answers, run planPage() again and keep only pages with a change.
 *   transform    planPage() on the text the runner just read, from the cache. A URL the
 *                cache does not know is simply left alone, so a page edited in between
 *                can never get a guessed citation.
 *   verify       every href on the rendered page must still be there or be accounted for
 *                by a rewrite this plan made; no new error markers; the publish gate on
 *                the diff only.
 *   report       the URLs the task declined, by reason, so «nothing to do» and «could not
 *                do» are not confused.
 *
 * See docs/task-19-cite-urls.md.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { BOT_UA, HUMAN_UA, type Bot, type BotTask } from '../../core.js';
import { auditCounts, checkWikitext } from '../../lib/gates.js';
import { todayFa, faDigits } from './build.js';
import { planPage, type Kind, type Lookup, type Plan } from './plan.js';
import { NetResolver, combine, siteFor, type Evidence, type Resolved } from './resolve.js';
import { isArchiveUrl } from './url.js';
import { canonHref } from './url.js';
import * as review from './review.js';
import sitesData from './data/sites.json' with { type: 'json' };

export const REPORT_PAGE = 'کاربر:MamouriBot/وظیفه ۱۹/گزارش';

/**
 * Candidate searches. Every query is a superset of something planPage() changes, and each
 * was counted on ۲۱ نوامبر ۲۰۲۶ (docs/task-19-cite-urls.md § Population).
 */
export const QUERIES: Record<string, string> = {
  bareRef: 'insource:/\\<ref[^>\\/]*\\> *\\[?https?:\\/\\/[^ <\\]]+\\]? *\\<\\/ref\\>/',
  bareTracking: 'incategory:"صفحه‌های دارای ارجاعی که پیوند اینترنتی‌شان برهنه است"',
  noTitle: 'incategory:"صفحه‌های دارای یادکرد بدون عنوان یادکرد"',
  archivedCopy: 'incategory:"نگهداری یادکرد:عنوان آرشیو به جای عنوان"',
  badUrl: 'incategory:"صفحه‌هایی که نشانی اینترنتی‌شان خطا دارد"',
  // CS1 only recognises the English «Archived copy»; the Persian placeholder has no category.
  archivedCopyFa: 'insource:/عنوان *= *نسخه آرشیو شده/',
  googleSite: 'insource:/(وبگاه|website|work|ناشر|publisher) *= *(www\\.)?[Gg]oogle(\\.com)? *[|}]/',
  redirector: 'insource:/google\\.com\\/url\\?|webcache\\.googleusercontent|\\/amp\\/s\\//',
};

const SUMMARY = 'تکمیل یادکردهای نشانی عریان و اصلاح نشانی منبع‌ها';

// --- state shared between getTargets, transform and verify -----------------------------

/** url → fetched evidence (or, for archive URLs, a finished answer). Judged at lookup time. */
let CACHE = new Map<string, Evidence | { resolved: Resolved }>();
let VERIFIED_ARTICLES = new Set<string>();
const PLANS = new Map<string, Plan>();
const DECLINED = new Map<string, { reason: string; pages: Set<string> }>();
const KIND_SUMMARY = new Map<string, Set<Kind>>();
let TODAY = todayFa();
let REVIEW: review.Proposal[] = [];
const EXTRA_TITLES = new Set<string>();
/** Whether the live review page lists rows, so an empty queue still rewrites a stale page. */
let LIVE_REVIEW_ROWS = 0;
let REVIEW_EXISTED = false;
const FRESH: Omit<review.Proposal, 'decision' | 'seen' | 'id'>[] = [];
const EXAMINED = new Set<string>();

function planOpts(lookup: Lookup, title: string) {
  const acc = review.accepted(REVIEW).get(title) ?? [];
  return {
    lookup, today: TODAY,
    labelled: process.env.T19_LABELLED === '1', minorAlone: process.env.T19_MINOR_ALONE === '1',
    rejected: review.rejected(REVIEW),
    approved: new Map(acc.map(a => [a.url, a.proposed])),
  };
}
const TODAY_ISO = () => new Date().toISOString().slice(0, 10);

const cachePath = () => join(process.env.BOT_STATE_DIR ?? '.state', 'cite-urls.evidence.json');
const CACHE_DAYS = Number(process.env.T19_CACHE_DAYS ?? 30);
type Stored = (Evidence | { resolved: Resolved }) & { at: number };

function loadCache(): Map<string, Evidence | { resolved: Resolved }> {
  const p = cachePath();
  if (!existsSync(p)) return new Map();
  const raw = JSON.parse(readFileSync(p, 'utf8')) as Record<string, Stored>;
  const cut = Date.now() - CACHE_DAYS * 86400_000;
  AT = new Map(Object.entries(raw).map(([k, v]) => [k, v.at]));
  return new Map(Object.entries(raw).filter(([, v]) => v.at >= cut));
}
let AT = new Map<string, number>();
function saveCache() {
  const p = cachePath();
  mkdirSync(dirname(p), { recursive: true });
  const now = Date.now();
  const out: Record<string, unknown> = {};
  for (const [k, v] of CACHE) out[k] = { ...v, at: AT.get(k) ?? now };
  writeFileSync(p, JSON.stringify(out));
}

export function judge(url: string, e: Evidence | { resolved: Resolved }, todayIso = TODAY_ISO()): Resolved {
  if ('resolved' in e) return e.resolved;
  return combine({ ...e, url, today: todayIso, site: siteFor(url) });
}

/** The lookup planPage() sees. `[[Article]]` site links are dropped unless verified. */
export function lookupFrom(cache: Map<string, Evidence | { resolved: Resolved }>, verified: Set<string>): Lookup {
  return (url: string) => {
    const e = cache.get(url);
    if (!e) return undefined;
    const r = judge(url, e);
    if (!r.meta) return { ok: false, reason: r.reason ?? r.status };
    const meta = { ...r.meta };
    const m = /^\[\[([^\]|]+)\]\]$/.exec(meta.website ?? '');
    if (m && !verified.has(m[1])) {
      const s = siteFor(url);
      meta.website = s?.name ?? (url.match(/^https?:\/\/(?:www\.)?([^/]+)/)?.[1] ?? '');
    }
    return { ok: true, meta };
  };
}

async function search(bot: Bot, q: string, cap: number): Promise<string[]> {
  const out: string[] = [];
  let offset = 0;
  while (out.length < cap && offset < 9500) {
    const d = await bot.apiGet({ action: 'query', list: 'search', srsearch: q, srnamespace: '0',
      srlimit: '500', srsort: 'random', sroffset: String(offset), srinfo: '', srprop: '' });
    const got = (d.query?.search ?? []).map((p: { title: string }) => p.title);
    out.push(...got);
    if (!got.length || d.continue?.sroffset === undefined) break;
    offset = d.continue.sroffset;
  }
  return out;
}

async function candidates(bot: Bot): Promise<string[]> {
  const t: string[] = [];
  t.push(...(process.env.TARGET_TITLES ?? '').split('|').map(s => s.trim()).filter(Boolean));
  const file = process.env.TARGET_FILE;
  if (file && existsSync(file)) {
    const raw = readFileSync(file, 'utf8').trim();
    t.push(...(raw.startsWith('[') ? JSON.parse(raw) as string[] : raw.split('\n').map(s => s.trim()).filter(Boolean)));
  }
  if (t.length) return [...new Set(t)];
  const cap = Number(process.env.TARGET_CAP ?? 0) || Math.max((bot.opts.limit || 50) * 4, 100);
  const which = (process.env.T19_QUERIES ?? 'bareRef,bareTracking,noTitle,archivedCopy,archivedCopyFa,badUrl,redirector,googleSite').split(',');
  const per = Math.ceil(cap / which.length);
  for (const k of which) if (QUERIES[k]) t.push(...(await search(bot, QUERIES[k], per)).slice(0, per));
  return [...new Set(t)].slice(0, cap);
}

/** Run `fn` over `items` with at most `n` in flight. */
async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>): Promise<void> {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const x = items[i++]; await fn(x); }
  }));
}

async function fetchTexts(bot: Bot, titles: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let i = 0; i < titles.length; i += 50) {
    const d = await bot.apiGet({ action: 'query', prop: 'revisions', rvprop: 'content', rvslots: 'main', titles: titles.slice(i, i + 50).join('|') });
    for (const p of d.query?.pages ?? []) {
      const c = p.revisions?.[0]?.slots?.main?.content;
      if (typeof c === 'string' && p.ns === 0) out.set(p.title, c);
    }
  }
  return out;
}

/** The `[[…]]` targets in sites.json that exist and are not disambiguation pages. */
async function verifySiteArticles(bot: Bot): Promise<Set<string>> {
  const names = [...new Set(Object.values(sitesData as Record<string, { article?: string }>).map(s => s.article).filter((x): x is string => !!x))];
  const ok = new Set<string>();
  for (let i = 0; i < names.length; i += 50) {
    const d = await bot.apiGet({ action: 'query', titles: names.slice(i, i + 50).join('|'), prop: 'pageprops', ppprop: 'disambiguation' });
    const norm = new Map<string, string>((d.query?.normalized ?? []).map((x: { from: string; to: string }) => [x.to, x.from]));
    for (const p of d.query?.pages ?? []) {
      if (p.missing || p.pageprops?.disambiguation !== undefined) continue;
      ok.add(norm.get(p.title) ?? p.title);
      ok.add(p.title);
    }
  }
  const missing = names.filter(n => !ok.has(n));
  if (missing.length) console.log(`⚠ مقاله‌های وبگاه که وجود ندارند یا ابهام‌زدایی‌اند (بی‌پیوند نوشته می‌شوند): ${missing.join('، ')}`);
  return ok;
}

// --- verify helpers --------------------------------------------------------------------

function externalHrefs(html: string): string[] {
  return [...html.matchAll(/<a\b[^>]*class="[^"]*\bexternal\b[^"]*"[^>]*href="([^"]+)"/g), ...html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*class="[^"]*\bexternal\b[^"]*"/g)]
    .map(m => m[1].replace(/&amp;/g, '&'));
}

const PERSIAN_DIGIT = /[۰-۹]/g;
const toLatin = (s: string) => s.replace(PERSIAN_DIGIT, d => String(d.charCodeAt(0) - 0x06f0));

/**
 * Every external link on the old render must survive on the new one, unless this plan
 * rewrote it (old→new in urlMap) or the link was the archive search the module prints.
 * Compared in canonical form, because the module is free to re-encode.
 */
export function unexplainedLoss(oldHrefs: string[], newHrefs: string[], urlMap: Map<string, string>): string[] {
  const now = new Set(newHrefs.map(canonHref).map(toLatin));
  const mapped = new Map<string, string>();
  for (const [a, b] of urlMap) mapped.set(toLatin(canonHref(a)), toLatin(canonHref(b)));
  const lost: string[] = [];
  for (const h of oldHrefs) {
    const c = toLatin(canonHref(h));
    if (now.has(c)) continue;
    const to = mapped.get(c);
    if (to && now.has(to)) continue;
    // http→https for a schemeless repair: `[www.x «t»]` rendered no href at all before
    if (/^(?:https?:)?\/\/(?:web\.archive\.org|www\.google\.com\/search|books\.google)/.test(c)) continue;
    lost.push(h);
  }
  return lost;
}

// --- the task ----------------------------------------------------------------------------

export const citeUrlsTask: BotTask = {
  id: 'cite-urls',
  taskNumber: 19,
  summary: SUMMARY,
  description: 'تبدیل ارجاع‌هایی که فقط نشانی اینترنتی‌اند به یادکرد کامل (عنوان، وبگاه، تاریخ) از روی خود صفحه، '
    + 'افزودن عنوان به یادکردهای بی‌عنوان، اصلاح نشانی‌های خراب (بی‌پروتکل، دوپروتکلی، پیوندهای واسطهٔ گوگل) '
    + 'و خواناکردن نشانی‌های درصدی. نشانی‌ای که فرادادهٔ مطمئن ندارد دست‌نخورده می‌ماند و گزارش می‌شود.',
  recheckAfterDays: 60,

  perPageSummary(title: string) {
    const kinds = KIND_SUMMARY.get(title);
    if (!kinds) return undefined;
    const parts: string[] = [];
    const n = PLANS.get(title)?.changes.filter(c => c.kind === 'bare-ref' || c.kind === 'labelled-ref').length ?? 0;
    if (n) parts.push(`تکمیل ${faDigits(n)} یادکرد نشانی عریان`);
    if (kinds.has('title')) parts.push('افزودن عنوان یادکرد');
    if (kinds.has('scheme') || kinds.has('redirector') || kinds.has('qmark')) parts.push('اصلاح نشانی منبع');
    if (kinds.has('tracking')) parts.push('حذف پارامترهای ردیابی');
    if (kinds.has('decode')) parts.push('خواناکردن نشانی‌های درصدی');
    return parts.length ? parts.join('، ') : undefined;
  },

  async getTargets(bot: Bot): Promise<string[]> {
    TODAY = process.env.T19_TODAY ?? todayFa();
    CACHE = loadCache();
    PLANS.clear(); DECLINED.clear(); KIND_SUMMARY.clear();
    VERIFIED_ARTICLES = await verifySiteArticles(bot);
    FRESH.length = 0; EXAMINED.clear();
    ({ rows: REVIEW, existed: REVIEW_EXISTED } = review.loadStore());
    {
      const d = await bot.apiGet({ action: 'query', prop: 'revisions', titles: review.REVIEW_PAGE, rvprop: 'content', rvslots: 'main' });
      const live = d.query?.pages?.[0]?.revisions?.[0]?.slots?.main?.content ?? '';
      const decisions = review.readDecisions(live);
      LIVE_REVIEW_ROWS = decisions.size;
      REVIEW = REVIEW.map(r => ({ ...r, decision: decisions.get(r.id) ?? r.decision }));
      const n = [...decisions.values()].filter(Boolean).length;
      if (n) console.log(`صفحهٔ بازبینی: ${n} تصمیم خوانده شد`);
      // Approved/rejected rows add their articles to the candidates.
      for (const r of REVIEW) if (r.decision === 'yes') EXTRA_TITLES.add(r.title);
    }
    const titles = [...new Set([...EXTRA_TITLES, ...await candidates(bot)])];
    if (!titles.length) { console.log('هیچ نامزدی یافت نشد (صفر بدون شاهد مثبت معنا ندارد).'); return []; }
    const texts = await fetchTexts(bot, titles);
    console.log(`${texts.size} صفحه خوانده شد`);

    const opt = (lookup: Lookup, t = '') => planOpts(lookup, t);
    // Pages are worked in chunks: look up the URLs one chunk needs, plan the chunk, and
    // stop as soon as there are enough pages for this run's --limit. Looking up every
    // URL on every candidate first meant ~4,000 lookups (5+ hours) before a 50-edit run
    // wrote anything (cu-first, ۲۳ نوامبر ۲۰۲۶).
    const limit = bot.opts.limit || Infinity;
    const want = Number.isFinite(limit) ? Math.ceil(limit * 1.1) : Infinity;
    const maxLookups = Number(process.env.T19_MAX_LOOKUPS ?? (Number.isFinite(limit) ? limit * 6 : 4000));
    const CHUNK = 25;
    // The same identity as the wiki requests: a run under my account reads as me, a bot run as the bot.
    const net = new NetResolver(bot.opts.identity === 'human' ? HUMAN_UA : BOT_UA);
    const lookup = lookupFrom(CACHE, VERIFIED_ARTICLES);
    const work: string[] = [];
    const counts: Record<string, number> = {};
    const entries = [...texts];
    let looked = 0, pagesSeen = 0;
    for (let c = 0; c < entries.length && work.length < want; c += CHUNK) {
      const chunk = entries.slice(c, c + CHUNK);
      const need = new Set<string>();
      for (const [t, x] of chunk) for (const u of planPage(x, t, opt(() => undefined, t)).needs) if (!CACHE.has(u)) need.add(u);
      const todo = [...need].slice(0, Math.max(0, maxLookups - looked));
      // Several URLs in flight at once. Each service still has its own minimum gap
      // (resolve.ts Gate), so this overlaps waiting on different services and hosts; it
      // does not raise the rate to any one of them.
      await pool(todo, Number(process.env.T19_CONCURRENCY ?? 4), async u => {
        CACHE.set(u, isArchiveUrl(u) ? { resolved: await net.resolve(u) } : await net.gather(u));
      });
      looked += todo.length;
      saveCache();
      for (const [t, x] of chunk) {
        pagesSeen++;
        const p = planPage(x, t, opt(lookup, t));
        EXAMINED.add(t);
        for (const pr of p.proposals) FRESH.push({ title: t, ...pr });
        for (const d of p.declined) {
          const row = DECLINED.get(d.url) ?? { reason: d.reason, pages: new Set<string>() };
          row.pages.add(t); DECLINED.set(d.url, row);
        }
        if (!p.changed) continue;
        for (const k of p.changes) counts[k.kind] = (counts[k.kind] ?? 0) + 1;
        PLANS.set(t, p);
        KIND_SUMMARY.set(t, new Set(p.changes.map(k => k.kind)));
        work.push(t);
      }
      console.log(`  …${pagesSeen}/${entries.length} صفحه، ${looked} نشانی بررسی شد، ${work.length} صفحه آماده`);
      if (looked >= maxLookups) { console.log(`سقف بررسی نشانی (${maxLookups}) رسید`); break; }
    }
    const notes = [...CACHE].map(([u, e]) => [u, judge(u, e).notes] as const).filter(([, n]) => n?.length);
    if (notes.length) console.log(`بررسی متقابل با خود صفحه ${notes.length} مورد را اصلاح کرد:\n` + notes.slice(0, 30).map(([u, n]) => `  ${u.slice(0, 80)}  ${n!.join('; ')}`).join('\n'));
    console.log(`گونهٔ تغییرها: ${JSON.stringify(counts)}`);
    console.log(`${work.length} صفحه برای ویرایش؛ ${DECLINED.size} نشانی کنار گذاشته شد`);
    if (process.env.T19_SAVE_WORK) writeFileSync(process.env.T19_SAVE_WORK, JSON.stringify(work));
    return work;
  },

  transform(text: string, title: string) {
    const p = planPage(text, title, planOpts(lookupFrom(CACHE, VERIFIED_ARTICLES), title));
    if (!p.changed) return { text, changed: false, note: 'موردی برای اصلاح نبود' };
    PLANS.set(title, p);
    KIND_SUMMARY.set(title, new Set(p.changes.map(c => c.kind)));
    return { text: p.text, changed: true, note: [...new Set(p.changes.map(c => c.kind))].join('، ') };
  },

  async verify(bot: Bot, title: string, oldText: string, newText: string) {
    const plan = PLANS.get(title);
    if (!plan || plan.text !== newText) return { ok: false, detail: 'plan and text disagree' };
    // 1. the publish gate, on what this edit added
    const was = auditCounts(title, oldText), now = auditCounts(title, newText);
    const rose = Object.keys(now).filter(k => (now[k] ?? 0) > (was[k] ?? 0));
    if (rose.length) {
      const detail = checkWikitext(title, newText).find(p => rose.some(k => p.includes(k.replace(/_/g, ' ')))) ?? rose.join(',');
      return { ok: false, detail: `gate: ${detail}` };
    }
    // 2. render both, compare external links and citation error markers
    const render = async (t: string) => (await bot.apiPost({ action: 'parse', title, text: t, contentmodel: 'wikitext', prop: 'text|categories', disablelimitreport: '1' })).parse;
    const [a, b] = [await render(oldText), await render(newText)];
    const ah = a?.text ?? '', bh = b?.text ?? '';
    const lost = unexplainedLoss(externalHrefs(ah), externalHrefs(bh), plan.urlMap);
    if (lost.length) return { ok: false, detail: `links lost: ${lost.slice(0, 3).join(' ')}` };
    const errs = (h: string) => (h.match(/class="cs1-visible-error/g) ?? []).length + (h.match(/class="error/g) ?? []).length;
    if (errs(bh) > errs(ah)) return { ok: false, detail: `citation errors ${errs(ah)}→${errs(bh)}` };
    // fa renders the id as `cite&#95;note-…`; a pattern for `cite_note` alone matches zero
    // on both sides and the check silently passes everything.
    const refsOf = (h: string) => (h.match(/<li id="cite(?:_|&#95;)note-/g) ?? []).length;
    // The positive control: when the plan rewrote a <ref>, the old render must show it.
    const touchedRef = plan.changes.some(c => c.kind === 'bare-ref' || c.kind === 'labelled-ref');
    if (touchedRef && !refsOf(ah)) return { ok: false, detail: 'old render has no references (selector broken?)' };
    if (refsOf(bh) !== refsOf(ah)) return { ok: false, detail: `reference count ${refsOf(ah)}→${refsOf(bh)}` };
    return { ok: true, detail: '' };
  },

  async report(bot: Bot, dryRun: boolean) {
    await publishReview(bot, dryRun);
    if (!DECLINED.size) return;
    const byReason = new Map<string, [string, Set<string>][]>();
    for (const [u, r] of DECLINED) {
      const k = REASONS[r.reason] ?? r.reason;
      if (!byReason.has(k)) byReason.set(k, []);
      byReason.get(k)!.push([u, r.pages]);
    }
    const out = [
      'نشانی‌هایی که در آخرین اجرا دست‌نخورده ماندند، چون فرادادهٔ مطمئنی برایشان پیدا نشد. ',
      'هر کدام را می‌توان دستی به یادکرد کامل تبدیل کرد.',
      '',
      `آخرین به‌روزرسانی: ${todayFa()}`,
      '',
    ];
    for (const [k, rows] of [...byReason].sort((x, y) => y[1].length - x[1].length)) {
      out.push(`== ${k} (${faDigits(rows.length)}) ==`);
      for (const [u, pages] of rows.slice(0, 150)) out.push(`# <nowiki>${u}</nowiki> در ${[...pages].slice(0, 3).map(p => `[[${p}]]`).join('، ')}`);
      if (rows.length > 150) out.push(`(${faDigits(rows.length - 150)} مورد دیگر.)`);
      out.push('');
    }
    const text = out.join('\n');
    const problems = checkWikitext(REPORT_PAGE, text);
    if (problems.length) { console.log(`گزارش منتشر نشد، دروازه: ${problems.join(' | ')}`); return; }
    if (dryRun) { console.log(`\n--- گزارش (آزمایشی، ${DECLINED.size} نشانی) ---\n${text.slice(0, 2500)}`); return; }
    // A trial under my own account must not write into the bot's user space.
    if (bot.opts.identity === 'human') {
      const f = join(process.env.BOT_STATE_DIR ?? '.state', 'cite-urls.report.wiki');
      writeFileSync(f, text);
      console.log(`گزارش در ${f} نوشته شد (اجرای دستی، روی ویکی منتشر نشد)`);
      return;
    }
    const cur = await bot.apiGet({ action: 'query', prop: 'revisions', titles: REPORT_PAGE, rvprop: 'content|ids|timestamp', rvslots: 'main' });
    const p = cur.query.pages[0];
    await bot.edit(REPORT_PAGE, text, 'به‌روزرسانی فهرست نشانی‌های نیازمند بررسی',
      p.missing ? 0 : p.revisions[0].revid, p.missing ? '' : p.revisions[0].timestamp, { allowCreate: true });
  },
};

async function publishReview(bot: Bot, dryRun: boolean) {
  // An applied approval is done: the article no longer has that bare URL, so the row
  // is dropped by merge() when the article was examined and no longer proposes it.
  const merged = review.merge(REVIEW, FRESH, EXAMINED, new Map());
  // Nothing to list and nothing listed: no edit. A page that still lists rows the store does
  // not know (a run from another machine, or rows since resolved) is rewritten from the store.
  if (!merged.length && !LIVE_REVIEW_ROWS) return;
  void REVIEW_EXISTED;
  const text = review.renderPage(merged, todayFa());
  const problems = checkWikitext(review.REVIEW_PAGE, text);
  if (problems.length) { console.log(`صفحهٔ بازبینی منتشر نشد، دروازه: ${problems.join(' | ')}`); return; }
  if (dryRun) { console.log(`\n--- صفحهٔ بازبینی (آزمایشی، ${merged.length} پیشنهاد) ---\n${text.slice(0, 2000)}`); return; }
  review.saveStore(merged);
  // The queue lives in the bot's user space. A run under my own account keeps it on disk
  // only; it reaches the wiki with the first bot-identity run.
  if (bot.opts.identity === 'human') {
    const f = join(process.env.BOT_STATE_DIR ?? '.state', 'cite-urls.review.wiki');
    writeFileSync(f, text);
    console.log(`صفحهٔ بازبینی در ${f} نوشته شد (اجرای دستی، روی ویکی منتشر نشد)`);
    return;
  }
  const cur = await bot.apiGet({ action: 'query', prop: 'revisions', titles: review.REVIEW_PAGE, rvprop: 'content|ids|timestamp', rvslots: 'main' });
  const p = cur.query.pages[0];
  if (!p.missing && p.revisions[0].slots.main.content === text) return;
  const tpl = 'کاربر:MamouriBot/وظیفه ۱۹/بازبینی/سطر';
  const t = await bot.apiGet({ action: 'query', titles: tpl, prop: 'info' });
  if (t.query.pages[0].missing) await bot.edit(tpl, review.ROW_TEMPLATE, 'الگوی سطر صفحهٔ بازبینی یادکردها', 0, '', { allowCreate: true });
  await bot.edit(review.REVIEW_PAGE, text, 'به‌روزرسانی یادکردهای پیشنهادی نیازمند بازبینی',
    p.missing ? 0 : p.revisions[0].revid, p.missing ? '' : p.revisions[0].timestamp, { allowCreate: true });
  console.log(`صفحهٔ بازبینی منتشر شد: ${merged.length} پیشنهاد`);
}

const REASONS: Record<string, string> = {
  'citoid-poor-title': 'عنوان صفحه عام یا نامعتبر بود',
  'generic-title': 'عنوان صفحه عام یا نامعتبر بود',
  'no-title': 'صفحه عنوان نداشت',
  'template-placeholder': 'عنوان صفحه عام یا نامعتبر بود',
  'title-is-host': 'عنوان صفحه فقط نام وبگاه بود',
  'title-is-site': 'عنوان صفحه فقط نام وبگاه بود',
  'bot-challenge': 'وبگاه به درخواست خودکار پاسخ نمی‌دهد',
  'unreachable': 'وبگاه در دسترس نبود',
  'http-403': 'وبگاه به درخواست خودکار پاسخ نمی‌دهد',
  'http-404-no-archive': 'صفحه حذف شده و نسخهٔ بایگانی ندارد',
  'http-410-no-archive': 'صفحه حذف شده و نسخهٔ بایگانی ندارد',
  'soft-404-no-archive': 'صفحه حذف شده و نسخهٔ بایگانی ندارد',
  'redirected-home-no-archive': 'صفحه حذف شده و نسخهٔ بایگانی ندارد',
  'archive-unreadable': 'نسخهٔ بایگانی خوانده نشد',
  'file': 'پرونده (پی‌دی‌اف و مانند آن)',
  'wikimedia': 'پیوند به ویکی‌پدیا یا پروژه‌های خواهر',
  'unsupported-host': 'شبکهٔ اجتماعی یا وبگاهی که یادکرد ویژه می‌خواهد',
  'archive-url': 'نشانی بایگانی',
  'mojibake': 'عنوان با رمزگذاری نادرست',
  'home-page': 'ارجاع به صفحهٔ اصلی وبگاه، نه به یک صفحهٔ مشخص',
  'slug-title': 'عنوان صفحه فقط نشانی صفحه بود',
  'title-slug-mismatch': 'عنوان صفحه با موضوع نشانی نمی‌خواند',
};
