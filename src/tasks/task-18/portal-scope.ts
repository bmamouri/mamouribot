/**
 * وظیفهٔ ۱۸ — which portals exist, and which articles are in scope for each one.
 *
 * TWO questions, kept apart because they have different risk profiles:
 *
 *   discoverPortals()  — which درگاه pages are in the bot's rotation at all.
 *   portalCandidates() — for ONE portal, which articles are even worth looking at.
 *
 * THE SCOPING RULE (why it is this and not something cleverer)
 * --------------------------------------------------------------
 * The decade-portal pipeline (`scripts/portals/decade-scope.ts`) tuned WORKS/CONSUMER
 * noise filters BY HAND for decade vocabulary («فیلم‌های ۲۰۰۰», «اسباب‌بازی‌های دهه ۲۰۰۰»,
 * …). That does not generalise to ~150 arbitrary portals without per-portal review, which
 * is exactly the false-positive risk the operator ruled out. So this task uses the
 * narrowest rule that still needs NO per-portal tuning:
 *
 *   A portal «درگاه:X» is in scope only if «رده:X» exists (the SAME name, fa convention
 *   for the portal's own subject category). Candidates are: articles directly in that
 *   category (depth 0), plus articles in subcategories that (a) are not a maintenance/
 *   container KIND and (b) carry the portal's own name as a substring. Nothing deeper.
 *
 * fa's own naming convention did the curation for depth 0: a category named exactly after
 * the portal IS the portal's subject-matter category by construction, not by guessing.
 *
 * THE SUBSTRING GATE AT DEPTH 1 — found necessary by actually running the pre-approval
 * trial, not assumed up front
 * ----------------------------------------------------------------------------------------
 * The first version of this file descended into every non-container subcategory. The
 * live trial on «درگاه:آرتساخ» immediately produced a real false positive: «رده:اهالی
 * جمهوری آرتساخ» ("residents of the Republic of Artsakh") is a subcategory, and it
 * proposed the portal link on a Qajar-era prince whose only tie to Artsakh is former
 * RESIDENCE, not subject matter — the same shape as the زادگان/درگذشتگان exclusion, but
 * a name this file had not thought to list. Worse, «درگاه:تاریخ»'s own subcategories
 * include «رده:کاتولیک» and «رده:مسیحیت» — categories with NO naming pattern connecting
 * them to «تاریخ» at all; no name-fragment exclude list can be complete against that,
 * because the noise there is a mis-threaded category tree, not a describable KIND.
 *
 * The fix that actually closes both holes: require the subcategory's own title to carry
 * the portal's name as a substring (`دارای نام درگاه` below). «اهالی جمهوری آرتساخ» does
 * contain «آرتساخ», so the substring test alone would not have caught the residence case
 * — it still needs `CONTAINER_EXCLUDE` as a second, independent filter. «کاتولیک» and
 * «مسیحیت» contain no mention of «تاریخ» at all, so the substring test rejects them with
 * no name list needed. Both filters apply; a subcategory must pass BOTH to be descended
 * into.
 */
import type { Bot } from '../../core.js';
import excludedPortalsData from './data/excluded-portals.json' with { type: 'json' };

/** Portal names (without the درگاه: prefix) the operator excluded outright. */
export const EXCLUDED_PORTAL_NAMES = new Set<string>(excludedPortalsData.names);

/**
 * Subcategory NAME FRAGMENTS that mean "this collects individuals by an incidental axis
 * (birth year, death year, residence, country, continent) or by maintenance status, not
 * the portal's subject itself" — the same shape as `EXCLUDE` in
 * `scripts/portals/decade-scope.ts`, extended with «اهالی»/«افراد اهل» (residence, the
 * false positive the live trial found on «درگاه:آرتساخ») and «مقاله‌های خرد»/«مقاله‌های
 * درجه خرد» (the stub/quality-assessment maintenance subcategory every portal has).
 * Deliberately generic: every entry names a KIND of container, never a topic, so the
 * list needs no portal-by-portal tuning and stays safe to apply blindly across the whole
 * rotation. This is the FIRST of two independent filters — see `nameMentionsPortal`.
 */
export const CONTAINER_EXCLUDE = [
  'زادگان', 'درگذشتگان', 'مفقودالاثر',      // people by birth/death year
  'اهالی', 'افراد اهل',                      // people by residence, not by subject
  'بر پایه کشور', 'بر پایه قاره',           // pure geographic containers
  'بر پایه استان', 'بر پایه شهر',
  'بر پایه دهه', 'بر پایه سال',             // pure by-year/by-decade containers
  'مقاله‌های خرد', 'مقاله‌های درجه خرد',   // stub / quality-assessment maintenance cats
];
export const isContainerCategory = (catTitle: string): boolean =>
  CONTAINER_EXCLUDE.some(w => catTitle.includes(w));

/**
 * The SECOND, independent filter: does the subcategory's own title even mention the
 * portal? Catches category-tree noise that carries no describable container pattern at
 * all — «درگاه:تاریخ»'s subcategories include «رده:کاتولیک» and «رده:مسیحیت», which
 * share no name fragment with «تاریخ» and so pass `isContainerCategory` cleanly while
 * being unrelated to it as a SUBJECT. A subcategory must mention the portal by name to
 * be descended into, no matter what else is true of it.
 */
export const nameMentionsPortal = (catTitle: string, portal: string): boolean =>
  catTitle.includes(portal);

async function listCategoryMembers(bot: Bot, cat: string): Promise<{ ns: number; title: string }[]> {
  const out: { ns: number; title: string }[] = [];
  let cont: Record<string, string> = {};
  for (;;) {
    const r = await bot.apiGet({
      action: 'query', list: 'categorymembers', cmtitle: cat,
      cmlimit: '500', cmtype: 'page|subcat', ...cont,
    });
    out.push(...(r.query?.categorymembers ?? []));
    if (!r.continue) return out;
    cont = r.continue;
  }
}

/** Every ns-100 portal MAIN page (no subpage, not a redirect), without the درگاه: prefix. */
async function listPortalMainPages(bot: Bot): Promise<string[]> {
  const titles: string[] = [];
  let cont: Record<string, string> = {};
  for (;;) {
    const r = await bot.apiGet({
      action: 'query', list: 'allpages', apnamespace: '100',
      aplimit: '500', apfilterredir: 'nonredirects', ...cont,
    });
    for (const p of r.query?.allpages ?? []) {
      const name = p.title.replace(/^درگاه:/, '');
      if (!name.includes('/')) titles.push(name);
    }
    if (!r.continue) return titles;
    cont = r.continue;
  }
}

/**
 * Which of `names` have an exact-name subject category («رده:‹name›»), batched.
 * Returns only the ones that do, in no particular order — callers sort.
 */
async function withExactCategory(bot: Bot, names: string[]): Promise<string[]> {
  const out: string[] = [];
  for (let i = 0; i < names.length; i += 50) {
    const batch = names.slice(i, i + 50);
    const r = await bot.apiGet({
      action: 'query', titles: batch.map(n => `رده:${n}`).join('|'), prop: 'info',
    });
    const present = new Set(
      (r.query?.pages ?? []).filter((p: { missing?: boolean }) => !p.missing)
        .map((p: { title: string }) => p.title.replace(/^رده:/, '')),
    );
    for (const n of batch) if (present.has(n)) out.push(n);
  }
  return out;
}

/**
 * The portal rotation: every درگاه main page that both (a) has an exact-name subject
 * category and (b) is not on the exclusion list, sorted for a stable, deterministic
 * round-robin order.
 *
 * Re-derived every run rather than cached — the cost is a handful of cheap calls (one
 * `allpages` walk plus a few `prop=info` batches), and a NEW portal, or a subject
 * category created after the fact, must enter the rotation on its own without anyone
 * refreshing a survey file.
 */
export async function discoverPortals(bot: Bot): Promise<string[]> {
  const mains = await listPortalMainPages(bot);
  const candidates = mains.filter(n => !EXCLUDED_PORTAL_NAMES.has(n));
  const withCat = await withExactCategory(bot, candidates);
  return withCat.sort((a, b) => a.localeCompare(b, 'fa'));
}

export interface PortalCandidate {
  title: string;
  /** which category produced it, for the report and for debugging a bad inclusion. */
  from: string;
}

/**
 * Candidate ns-0 articles for one portal: direct members of «رده:‹portal›», plus
 * members of its immediate subcategories that pass BOTH filters — not a container
 * KIND (`isContainerCategory`) and the subcategory's own name actually mentions the
 * portal (`nameMentionsPortal`). No deeper descent. See the module header for why
 * both filters are needed; either alone left a real false positive uncaught in the
 * live trial.
 */
export async function portalCandidates(bot: Bot, portal: string): Promise<PortalCandidate[]> {
  const cat = `رده:${portal}`;
  const out = new Map<string, string>(); // title -> provenance (first wins)

  const top = await listCategoryMembers(bot, cat);
  for (const m of top) if (m.ns === 0) out.set(m.title, cat);

  const subcats = top.filter(m =>
    m.ns === 14 && !isContainerCategory(m.title) && nameMentionsPortal(m.title, portal));
  for (const sc of subcats) {
    const members = await listCategoryMembers(bot, sc.title);
    for (const m of members) {
      if (m.ns !== 0) continue;
      if (!out.has(m.title)) out.set(m.title, sc.title);
    }
  }

  return [...out].map(([title, from]) => ({ title, from }));
}
