/**
 * The networked half of وظیفهٔ ۱۳'s four «ویکی‌های همسایه» reports. SQL, merging and
 * table-building (and the reasoning behind them) are in `neighbor-wikis-report.ts`,
 * which is what the tests load.
 */
import { Bot, EN_API } from '../../core.js';
import { checkWikitext } from '../../lib/gates.js';
import { queryRows } from '../../lib/replica.js';
import {
  BATCH, CANDIDATE_LIMIT, HAS_PERSIAN_LETTER, MAX_ROWS, REPORTS, SITES, VERIFY_CAP,
  buildReport, candidatesSql, chunk, enTitlesSql, mainspaceSql, mergeCandidates,
  resolveRedirectChain, signaturePage,
  type NeighborRow, type RawCandidate, type SiteKey,
} from './neighbor-wikis-report.js';

const n = (v: string) => Number(v) || 0;
/** Anonymous reads on en.wikipedia are capped at 50 titles per request. */
const EN_BRIDGE_BATCH = 50;

/** Raw candidates for one site, straight off `wb_items_per_site`. */
async function rawCandidates(siteId: string): Promise<RawCandidate[]> {
  const rows = await queryRows(candidatesSql(siteId), { wiki: 'wikidata' });
  return rows.map(r => ({ itemId: n(r.item_id), title: r.title, sitelinks: n(r.sitelinks) }));
}

/**
 * Keep only candidates that are a real, non-redirect mainspace page on THEIR OWN wiki.
 * Verified against each site's own `page` table — not the colon prefilter in the SQL,
 * which is a performance shortcut only. See the header in neighbor-wikis-report.ts.
 */
async function verifyMainspace(site: SiteKey, rows: RawCandidate[]): Promise<RawCandidate[]> {
  const capped = rows.slice(0, VERIFY_CAP);
  const live = new Set<string>();
  for (const batch of chunk(capped, BATCH)) {
    const titles = batch.map(r => r.title);
    const result = await queryRows(mainspaceSql(titles), { wiki: SITES[site].wiki });
    for (const r of result) live.add(r.page_title.replace(/_/g, ' '));
  }
  return capped.filter(r => live.has(r.title));
}

/** en.wikipedia's title for each item that has one, straight from Wikidata's sitelinks —
 *  no redirect following here, that is `bridgedToFa()`'s job. */
async function enTitles(itemIds: number[]): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  for (const batch of chunk(itemIds, BATCH)) {
    if (!batch.length) continue;
    const rows = await queryRows(enTitlesSql(batch), { wiki: 'wikidata' });
    for (const r of rows) if (!HAS_PERSIAN_LETTER.test(r.title)) out.set(n(r.item_id), r.title);
  }
  return out;
}

/**
 * Which items are already reachable from fa, through en.wikipedia's OWN redirect graph
 * — the bridge bug the operator caught ۱۳ اکتبر ۲۰۲۶. A candidate's Wikidata item has no
 * fa sitelink, but its enwiki sitelink can be a page that is itself a local `#REDIRECT`
 * to a DIFFERENT page, belonging to a DIFFERENT item, which DOES have one. See the
 * header in neighbor-wikis-report.ts for the two live examples this was measured on.
 *
 * One `redirects=1&prop=langlinks` call per batch resolves the WHOLE chain server-side
 * (tested against a real two-hop case on `Special:DoubleRedirects`), so this never walks
 * more than the one hop `resolveRedirectChain` needs to land on whatever final title the
 * API already settled on.
 */
async function bridgedToFa(bot: Bot, enTitleByItem: Map<number, string>): Promise<Set<number>> {
  const excluded = new Set<number>();
  const entries = [...enTitleByItem.entries()];
  for (const batch of chunk(entries, EN_BRIDGE_BATCH)) {
    const titles = batch.map(([, t]) => t);
    const d = await bot.apiGetOn(EN_API, { action: 'query', titles: titles.join('|'),
      prop: 'langlinks', lllang: 'fa', redirects: '1' });
    const q = d.query ?? {};
    const forward = new Map<string, string>([
      ...(q.redirects ?? []).map((x: any) => [x.from, x.to] as [string, string]),
      ...(q.normalized ?? []).map((x: any) => [x.from, x.to] as [string, string]),
    ]);
    const hasFa = new Set<string>((q.pages ?? [])
      .filter((p: any) => (p.langlinks?.length ?? 0) > 0).map((p: any) => p.title));
    for (const [itemId, title] of batch) {
      if (hasFa.has(resolveRedirectChain(title, forward))) excluded.add(itemId);
    }
  }
  return excluded;
}

async function publish(bot: Bot, page: string, text: string, live: boolean) {
  const problems = checkWikitext(page, text).filter(p => !p.includes('signature leak'));
  if (problems.length) throw new Error('GATE FAILED:\n  - ' + problems.join('\n  - '));
  if (!live) {
    console.log(`\n===== ${page} =====\n${text.slice(0, 1400)}\n… (${text.length} bytes)`);
    return;
  }
  const cur = await bot.apiGet({ action: 'query', prop: 'revisions', titles: page,
    rvprop: 'content|ids|timestamp', rvslots: 'main' });
  const p = cur.query.pages[0];
  await bot.edit(page, text, 'به‌روزرسانی گزارش مقایسهٔ مقالات با ویکی‌های همسایه',
    p.missing ? 0 : p.revisions[0].revid, p.missing ? '' : p.revisions[0].timestamp,
    { allowCreate: true });
  console.log(`منتشر شد: ${page}`);
  const sig = signaturePage(page);
  const s = (await bot.apiGet({ action: 'query', prop: 'revisions', titles: sig,
    rvprop: 'ids|timestamp', rvslots: 'main' })).query.pages[0];
  await bot.edit(sig, '‏~~~~~', 'به‌روزرسانی زمان آخرین اجرا',
    s.missing ? 0 : s.revisions[0].revid, s.missing ? '' : s.revisions[0].timestamp,
    { allowCreate: true });
}

export async function runNeighborWikisReports(argv: string[]) {
  const live = argv.includes('--live');
  const only = argv[argv.indexOf('--only') + 1];
  const want = (k: string) => !argv.includes('--only') || only === k;
  const bot = new Bot({ dryRun: !live, delayMs: 0, limit: 0, maxlag: 5, flagEdits: false });

  // Fetched once per SITE (not per report): the mideast report reuses ar/tr/he's own
  // verified lists rather than re-querying them, since all four reports want the same
  // "candidates on this site, verified, with sitelinks" for whichever sites they cover.
  const wantedReports = Object.entries(REPORTS).filter(([key]) => want(key));
  const neededSites = new Set<SiteKey>(wantedReports.flatMap(([, r]) => r.sites));
  const verified = new Map<SiteKey, RawCandidate[]>();
  for (const site of neededSites) {
    const raw = await rawCandidates(SITES[site].siteId);
    console.log(`${SITES[site].label}: ${raw.length} نامزد خام`);
    const ok = await verifyMainspace(site, raw);
    console.log(`${SITES[site].label}: ${ok.length} پس از تأیید فضای نام`);
    verified.set(site, ok);
  }

  // The bridge check (see neighbor-wikis-report.ts header) runs ONCE over every item
  // that survived namespace verification on any needed site, deduplicated — an item
  // appearing in both ar's and the mideast report's lists must not cost two en.wikipedia
  // round trips. Dropped items are then filtered out of every site's list, so the
  // candidate counts each report prints already reflect the exclusion.
  const allItemIds = [...new Set(
    [...neededSites].flatMap(site => (verified.get(site) ?? []).map(r => r.itemId)))];
  const enTitleByItem = await enTitles(allItemIds);
  const bridged = await bridgedToFa(bot, enTitleByItem);
  if (bridged.size) console.log(`پل به فا از طریق تغییرمسیر انگلیسی: ${bridged.size} مورد کنار گذاشته شد`);
  for (const site of neededSites) {
    verified.set(site, (verified.get(site) ?? []).filter(r => !bridged.has(r.itemId)));
  }

  for (const [, target] of wantedReports) {
    const merged = mergeCandidates(target.sites.map(s => [s, verified.get(s) ?? []] as [SiteKey, RawCandidate[]]));
    const rows = [...merged.values()].sort((a, b) => b.sitelinks - a.sitelinks).slice(0, MAX_ROWS);
    const withEn: NeighborRow[] = rows.map(r => ({ ...r, enTitle: enTitleByItem.get(r.itemId) }));

    const candidateCount = target.sites.reduce((s, site) => s + (verified.get(site)?.length ?? 0), 0);
    const text = buildReport(target, withEn, candidateCount);
    await publish(bot, target.page, text, live);
  }
}

// Exported for the selftest's gated bundle check.
export const _CANDIDATE_LIMIT = CANDIDATE_LIMIT;
