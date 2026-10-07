/**
 * De-stub, phase 1 — build the inventory of every fa.wikipedia stub template.
 *
 * Read-only. Writes .state/destub/stub-templates.json, consumed by
 * destub-classify.ts and destub.ts.
 *
 *   npx tsx src/tasks/task-10/destub-inventory.ts [--refresh]
 *
 * WHY THIS IS NOT A NAME PATTERN
 * ------------------------------
 * The obvious rule — "a stub template is one whose name ends in -خرد" — is
 * wrong in both directions, and each direction damages articles:
 *
 *   - 76 of the family's members do NOT end in -خرد, and about a dozen carry no
 *     stub marker at all: الگو:رقص, الگو:اندوکرینولوژی, الگو:ریاضی‌دان ایرانی,
 *     plus ~40 English-named ones (الگو:Iran-stub, الگو:Protein-stub, …).
 *     Missing them means the bot removes one tag of two and leaves the article
 *     in رده:همه مقاله‌های خرد — a half-edit.
 *   - Names that look like section stubs are not. Only two members contain
 *     «بخش», and one of them is الگو:بخشداری‌های ایران-خرد — a perfectly normal
 *     article-stub template for Iranian districts. A «بخش» exclusion would
 *     permanently protect every article tagged with it. The genuine section
 *     stub الگو:بخش خرد is not an Asbox member at all, so it is already
 *     excluded by construction and needs no name rule.
 *
 * So membership is defined by WHAT THE TEMPLATE EMITS, established by parsing
 * `{{X}}` in the context of a real article and requiring the category
 * «همه مقاله‌های خرد» to come out. پودمان:Asbox emits that category only when
 * `page.namespace == 0`, so this one check is the mechanical spelling of "this
 * is a mainspace stub tag". It also yields each template's topical categories
 * for free, which is what the save-time category assert compares against —
 * more reliable than re-parsing |رده* out of the template body, because Asbox
 * accepts unlimited |رده۱, |رده۲… and the Persian aliases are remapped in Lua.
 *
 * ZWNJ: 429 of the names contain U+200C. Variants (ZWNJ ↔ space ↔ nothing) are
 * generated HERE and each is resolved through the API, so the comparison later
 * stays an exact lookup. Folding at comparison time is what
 * lessons/template-porting/be-zaban-zwnj-vs-space-vs-lang-xx.md records as the
 * failure; folding while building the key set is the fix.
 *
 * This is the library half — build()/loadInventory()/normTemplateName() etc.,
 * imported by every other destub module AND bundled as a dependency inside
 * run.ts's multi-task bundle. The CLI that actually writes stub-templates.json
 * is the thin destub-inventory.ts, kept separate for the same reason
 * destub-watch.ts is separate from destub-watch-lib.ts: a module meant to be
 * bundled SOLO (for its own monthly Toolforge refresh job) cannot also carry
 * an isMain()-guarded self-invocation, because `__BUNDLED__` makes isMain()
 * return false unconditionally once bundled AT ALL — correct for the
 * many-tasks-one-bundle case this file is ALSO part of, wrong for a solo one.
 */
import { Bot } from '../../core.js';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname } from 'path';

/** The Asbox wrapper every stub template transcludes. */
export const STUB_META_TEMPLATE = 'الگو:الگوی خرد';
/** The category Asbox emits for every stub-tagged article in ns0. */
export const ALL_STUBS_CAT = 'همه مقاله‌های خرد';
export const INVENTORY_PATH = '.state/destub/stub-templates.json';
/** A stale enumeration is worse than none: new stub templates appear steadily. */
export const MAX_INVENTORY_AGE_DAYS = 30;

/**
 * Probe article for the validation parse. It must be a real ns0 page, because
 * Asbox branches on `page.namespace == 0`; parsing against a Template: title
 * suppresses the very category we are testing for. Any stable article works —
 * only its namespace is read.
 */
const PROBE_ARTICLE = 'ایران';

/**
 * Pages that transclude the wrapper but are not stub tags. Kept explicit and
 * short; everything else is decided by the parse in step 3.
 */
const DENYLIST = new Set([
  STUB_META_TEMPLATE,
  'الگو:دمو',
  'الگو:یک مقاله نمونه',
  'الگو:بخش پایانی مقاله',
  'الگو:توضیحات خرد',
  'الگو:مقاله‌های خرد',
]);

export interface StubTemplate {
  /** canonical ns10 title, e.g. 'الگو:فوتبال-خرد' */
  canonical: string;
  /** every literal title that reaches it: redirects and resolved ZWNJ variants */
  aliases: string[];
  /** topical categories this tag adds to an article, excluding ALL_STUBS_CAT */
  cats: string[];
  /**
   * True only for الگو:خرد, which is
   * `{{#if:{{{1|}}}|{{{{{1}}}-خرد}}|{{الگوی خرد|…}}}}` — i.e. with a positional
   * argument it expands to a DIFFERENT stub template and so emits that one's
   * topical category, not its own. `{{خرد}}` emits «مقاله‌های خرد» but
   * `{{خرد|فوتبال}}` emits «مقاله‌های خرد فوتبال». The save-time category assert
   * has to follow the argument, or it will see an unexplained removed category
   * and refuse a perfectly good edit.
   *
   * Removal itself needs no special case: either spelling is one ordinary
   * top-level `{{…}}` span.
   */
  dispatcher?: true;
}

/** The dispatcher template, whose first positional argument names the real tag. */
export const DISPATCHER_TEMPLATE = 'الگو:خرد';

/**
 * Topical categories a resolved call is expected to remove. For everything but
 * الگو:خرد this is just the recorded list; for `{{خرد|X}}` it is the categories
 * of `الگو:X-خرد`. Returns null when the argument names a template that is not
 * in the inventory — a red `{{X-خرد}}` call, which is a needs-human signal.
 */
export function expectedCats(inv: Inventory, canonical: string, firstArg?: string): string[] | null {
  const tpl = inv.templates[canonical];
  if (!tpl) return null;
  if (!tpl.dispatcher || !firstArg?.trim()) return tpl.cats;
  const target = inv.index[normTemplateName(`${firstArg.trim()}-خرد`)];
  return target ? inv.templates[target].cats : null;
}

export interface Inventory {
  fetched: string;
  metaTemplate: string;
  allStubsCat: string;
  /** canonical title → record */
  templates: Record<string, StubTemplate>;
  /** lookup key (normalised, WITHOUT the الگو: prefix) → canonical title */
  index: Record<string, string>;
  /** variants that look like a stub tag but resolve nowhere — for humans */
  unresolvedVariants: string[];
}

const ZWNJ = '‌';

// ---------------------------------------------------------------------------
// title normalisation
// ---------------------------------------------------------------------------

/**
 * Namespace prefixes that may precede a template name in a transclusion.
 * Populated from the wiki in build(); this is only the fallback for the pure,
 * offline normaliser used by the unit tests.
 */
const DEFAULT_TEMPLATE_PREFIXES = ['الگو', 'template', 't'];

/**
 * MediaWiki title normalisation, and nothing more. Deliberately does NOT touch
 * ZWNJ: «کتاب‌» and «کتاب» are different pages, so trimming U+200C would map a
 * redlink onto a real template and remove a tag that never existed.
 */
export function normTemplateName(raw: string, prefixes: string[] = DEFAULT_TEMPLATE_PREFIXES): string {
  let s = raw;
  // A leading colon is legal in a transclusion and carries no meaning here.
  s = s.replace(/^\s*:\s*/, '');
  s = s.replace(/_/g, ' ');
  // Trim ASCII/Unicode whitespace and NBSP only — NOT ZWNJ.
  s = s.replace(/^[\s ]+|[\s ]+$/g, '');
  s = s.replace(/[\s ]{2,}/g, ' ');
  // Strip one namespace prefix, case-insensitively, allowing spaces around ':'.
  const m = s.match(/^([^:]+?)\s*:\s*(.+)$/);
  if (m && prefixes.includes(m[1].trim().toLowerCase())) s = m[2].trim();
  // MediaWiki upper-cases the first character only. Matters for the ~40
  // Latin-named members: {{iran-stub}} and {{Iran-stub}} are the same page.
  if (s) s = s[0].toUpperCase() + s.slice(1);
  return s;
}

/**
 * ZWNJ / space / no-space spellings of a Persian compound name. Editors type
 * all three and MediaWiki treats them as three different titles, so each has to
 * be resolved against the wiki rather than folded away.
 */
export function zwnjVariants(name: string): string[] {
  const out = new Set<string>();
  if (name.includes(ZWNJ)) {
    out.add(name.replace(new RegExp(ZWNJ, 'g'), ' '));
    out.add(name.replace(new RegExp(ZWNJ, 'g'), ''));
  } else if (name.includes(' ')) {
    out.add(name.replace(/ /g, ZWNJ));
  }
  out.delete(name);
  return [...out];
}

// ---------------------------------------------------------------------------
// build
// ---------------------------------------------------------------------------

async function templatePrefixes(bot: Bot): Promise<string[]> {
  const r = await bot.apiGet({ action: 'query', meta: 'siteinfo', siprop: 'namespaces|namespacealiases' });
  const out = new Set(DEFAULT_TEMPLATE_PREFIXES);
  for (const ns of Object.values<any>(r.query.namespaces)) {
    if (ns.id === 10) { for (const n of [ns.name, ns.canonical]) if (n) out.add(String(n).toLowerCase()); }
  }
  for (const a of r.query.namespacealiases ?? []) {
    if (a.id === 10 && a.alias) out.add(String(a.alias).toLowerCase());
  }
  return [...out];
}

/** Every ns10 page that transcludes the Asbox wrapper. */
async function familyMembers(bot: Bot): Promise<string[]> {
  const titles: string[] = [];
  let cont: Record<string, string> = {};
  for (;;) {
    const r = await bot.apiGet({
      action: 'query', list: 'embeddedin', eititle: STUB_META_TEMPLATE,
      einamespace: '10', eilimit: '500', ...cont,
    });
    for (const p of r.query?.embeddedin ?? []) titles.push(p.title);
    if (!r.continue) break;
    cont = r.continue;
  }
  return titles;
}

/**
 * Parse `{{X}}` as if it were in an article and report the categories it emits.
 * Returns null when the template does not emit ALL_STUBS_CAT, i.e. it is not a
 * mainspace stub tag.
 */
async function probeCategories(bot: Bot, title: string): Promise<string[] | null> {
  const name = title.replace(/^[^:]+:/, '');
  const r = await bot.apiGet({
    action: 'parse', title: PROBE_ARTICLE, text: `{{${name}}}`,
    contentmodel: 'wikitext', prop: 'categories', disablelimitreport: '1',
  });
  const cats: string[] = (r.parse?.categories ?? []).map((c: any) => String(c.category).replace(/_/g, ' '));
  if (!cats.includes(ALL_STUBS_CAT)) return null;
  return cats.filter(c => c !== ALL_STUBS_CAT);
}

/** ns10 redirects pointing at each member, 50 titles per request. */
async function redirectsFor(bot: Bot, titles: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50);
    let cont: Record<string, string> = {};
    for (;;) {
      const r = await bot.apiGet({
        action: 'query', titles: batch.join('|'), prop: 'redirects',
        rdnamespace: '10', rdlimit: 'max', ...cont,
      });
      for (const p of r.query?.pages ?? []) {
        if (!p.redirects) continue;
        const list = out.get(p.title) ?? [];
        for (const rd of p.redirects) list.push(rd.title);
        out.set(p.title, list);
      }
      if (!r.continue) break;
      cont = r.continue;
    }
  }
  return out;
}

/**
 * Resolve candidate ZWNJ variants: a variant that lands on a known member
 * becomes an alias; one that resolves nowhere is reported, never guessed at.
 */
async function resolveVariants(
  bot: Bot, variants: string[], canonicalOf: (t: string) => string | undefined,
): Promise<{ resolved: Map<string, string>; unresolved: string[] }> {
  const resolved = new Map<string, string>();
  const unresolved: string[] = [];
  for (let i = 0; i < variants.length; i += 50) {
    const batch = variants.slice(i, i + 50);
    const r = await bot.apiGet({
      action: 'query', titles: batch.map(v => `الگو:${v}`).join('|'),
      prop: 'info', redirects: '1',
    });
    // `redirects: '1'` rewrites titles, so map each request title back through
    // the normalized/redirects tables rather than trusting positional order.
    const chain = new Map<string, string>();
    for (const n of r.query?.normalized ?? []) chain.set(n.from, n.to);
    for (const rd of r.query?.redirects ?? []) chain.set(rd.from, rd.to);
    const live = new Set((r.query?.pages ?? []).filter((p: any) => !p.missing).map((p: any) => p.title));
    for (const v of batch) {
      let t = `الگو:${v}`;
      for (let hop = 0; hop < 5 && chain.has(t); hop++) t = chain.get(t)!;
      const canon = live.has(t) ? canonicalOf(t) : undefined;
      if (canon) resolved.set(v, canon); else unresolved.push(v);
    }
  }
  return { resolved, unresolved };
}

export async function build(bot: Bot): Promise<Inventory> {
  const prefixes = await templatePrefixes(bot);

  const members = await familyMembers(bot);
  console.log(`عضو خام: ${members.length}`);

  // Subpages (/توضیحات, /تمرین, /styles.css) transclude the wrapper for their
  // demo but are not tags themselves.
  const candidates = members.filter(t => !t.includes('/') && !DENYLIST.has(t));
  console.log(`نامزد پس از پالایش: ${candidates.length}`);

  const templates: Record<string, StubTemplate> = {};
  let rejected = 0;
  for (const [i, t] of candidates.entries()) {
    const cats = await probeCategories(bot, t);
    if (cats === null) { rejected++; continue; }
    templates[t] = { canonical: t, aliases: [], cats, ...(t === DISPATCHER_TEMPLATE ? { dispatcher: true as const } : {}) };
    if ((i + 1) % 200 === 0) console.log(`  بررسی‌شده ${i + 1}/${candidates.length}`);
  }
  console.log(`تأییدشده: ${Object.keys(templates).length} (رد‌شده: ${rejected})`);

  const redirects = await redirectsFor(bot, Object.keys(templates));
  for (const [canon, rds] of redirects) {
    if (templates[canon]) templates[canon].aliases.push(...rds);
  }

  // canonical + redirect titles → canonical
  const index: Record<string, string> = {};
  const add = (title: string, canon: string) => {
    const key = normTemplateName(title, prefixes);
    if (key) index[key] = canon;
  };
  for (const tpl of Object.values(templates)) {
    add(tpl.canonical, tpl.canonical);
    for (const a of tpl.aliases) add(a, tpl.canonical);
  }

  // ZWNJ spellings of everything already in the index.
  const wanted = new Set<string>();
  for (const key of Object.keys(index)) for (const v of zwnjVariants(key)) if (!index[v]) wanted.add(v);
  const { resolved, unresolved } = await resolveVariants(
    bot, [...wanted], t => index[normTemplateName(t, prefixes)],
  );
  for (const [v, canon] of resolved) index[normTemplateName(v, prefixes)] = canon;
  // Expect this to resolve very few, often none: the redirects pass above
  // already picked up every alternative spelling that someone actually created
  // as a redirect. What is left are spellings nobody has ever made, correctly
  // confirmed here as redlinks rather than assumed either way.
  console.log(`گونهٔ نویسه‌ای: ${resolved.size} حل‌شده، ${unresolved.length} ناموجود ` +
    `(بیشترشان هرگز ساخته نشده‌اند — تغییرمسیرهای موجود پیش‌تر گرفته شده‌اند)`);

  return {
    fetched: new Date().toISOString(),
    metaTemplate: STUB_META_TEMPLATE,
    allStubsCat: ALL_STUBS_CAT,
    templates, index,
    unresolvedVariants: unresolved.sort(),
  };
}

// ---------------------------------------------------------------------------
// load
// ---------------------------------------------------------------------------

/** Read the cached inventory, refusing a stale one rather than trusting it. */
export function loadInventory(path = INVENTORY_PATH): Inventory {
  if (!existsSync(path)) {
    throw new Error(`فهرست الگوهای خرد ساخته نشده است: ${path}\n` +
      `اجرا کنید: npx tsx src/tasks/task-10/destub-inventory.ts`);
  }
  const inv: Inventory = JSON.parse(readFileSync(path, 'utf8'));
  const ageDays = (Date.now() - Date.parse(inv.fetched)) / 86400000;
  if (ageDays > MAX_INVENTORY_AGE_DAYS) {
    throw new Error(`فهرست الگوهای خرد ${Math.round(ageDays)} روز قدیمی است ` +
      `(بیش از ${MAX_INVENTORY_AGE_DAYS} روز). دوباره بسازید.`);
  }
  return inv;
}
