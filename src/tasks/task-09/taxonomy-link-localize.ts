/**
 * وظیفهٔ ۹ — نمایش نام فارسی آرایه‌ها در جعبهٔ ردهبندی خودکار.
 *
 * fa.wikipedia's automatic-taxobox system ({{Speciesbox}} / {{Automatic taxobox}})
 * builds the classification chain by walking `الگو:Taxonomy/<LatinTaxon>` templates.
 * Each such template carries a `link=` field which is BOTH the wikilink target and
 * the text the taxobox displays for that rank. Imported from en.wiki, most of them
 * still hold the bare Latin name, so the reader sees
 *
 *     تیره: Plumbaginaceae        سرده: Acantholimon
 *
 * while the article's own prose says «تیرهٔ بهمنیان» / «سردهٔ کلاه میرحسن» — and a
 * Persian article for that very taxon exists. This task repoints `link=` at the
 * Persian article, displaying its title without a trailing disambiguator:
 *
 *     |link=Acantholimon      →  |link=کلاه میرحسن (سرده)|کلاه میرحسن
 *     |link=Malvales          →  |link=پنیرک‌سانان
 *
 * Nothing else in the template is touched: `rank=`, `parent=`, `refs=` and every
 * other line are byte-identical afterwards. One template edit fixes every article
 * of that taxon at once, because the templates are shared.
 *
 * WHERE THE PERSIAN NAME COMES FROM — Wikidata, never a guess and never a
 * transliteration invented by the bot: the taxon item whose P225 (scientific name)
 * is exactly the template's subpage name, then that item's fawiki sitelink. The
 * whole map is pulled from WDQS in one query at the start of a run and cached.
 *
 * REFUSALS (the template is left Latin, which is the correct outcome):
 *   - `link=` already contains a Persian letter → already localized, skip (idempotent)
 *   - no fawiki sitelink for the taxon → no Persian article exists to link to
 *   - the Latin name maps to MORE THAN ONE fa article → ambiguous, needs a human
 *   - the fa article title is itself Latin → the edit would change nothing visible
 *   - the target page does not exist on fa.wiki → never introduce a red link
 *   - no `link=` line, or the replacement would alter any other byte of the page
 */
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import { BOT_UA, type Bot, type BotTask } from '../../core.js';

const WDQS = 'https://query.wikidata.org/sparql';
/** the same self-identifying UA the wiki calls use — WDQS asks for one too */
const UA = BOT_UA;
const PREFIX = 'الگو:Taxonomy/';
const PERSIAN = /[؀-ۿ]/;
/** the `link=` line, and only that line */
export const LINK_LINE = /^\|\s*link\s*=.*$/m;

/** taxon (template subpage name) → resolved fa article title, filled by getTargets */
const faTitleFor = new Map<string, string>();
/** test seam: let the unit tests supply what getTargets would have resolved */
export const seedFaTitle = (taxon: string, faTitle: string) => faTitleFor.set(taxon, faTitle);

/** «کلاه میرحسن (سرده)» → «کلاه میرحسن» — display only; the link target keeps the disambiguator. */
export const displayName = (faTitle: string) => faTitle.replace(/\s*\([^)]*\)\s*$/, '');

/** The replacement `link=` line for a resolved fa title. */
export const linkLineFor = (faTitle: string) => {
  const disp = displayName(faTitle);
  return disp === faTitle ? `|link=${faTitle}` : `|link=${faTitle}|${disp}`;
};

/**
 * Latin scientific name → fa article title, for every taxon Wikidata knows about.
 * One query (~36k rows). A per-taxon lookup would be tens of thousands of API calls;
 * `haswbstatement:P225=` search is unreliable and is deliberately not used.
 *
 * A Latin name with two different fa articles is dropped from the map entirely —
 * picking one of them is an editorial judgement, not a mechanical fix.
 */
async function wikidataTaxonMap(): Promise<Map<string, string>> {
  // PAGED BY INITIAL LETTER, deliberately. The unpaged query answers ~10 MB, and from
  // Toolforge that body comes back truncated at a FIXED offset every single time (it
  // parsed fine from a laptop, so it is the network path, not the query): undici then
  // throws a SyntaxError from inside r.json() and takes the whole run down. 27 small
  // responses cost a few extra seconds and always arrive whole.
  const shards = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].map(L => `FILTER(STRSTARTS(?t,"${L}"))`);
  shards.push('FILTER(!REGEX(?t,"^[A-Za-z]"))'); // scientific names should all start A–Z; prove it rather than assume
  const queryFor = (filter: string) => `SELECT ?t ?a WHERE {
    ?item wdt:P225 ?t .
    ?a schema:about ?item ; schema:isPartOf <https://fa.wikipedia.org/> .
    ${filter}
  }`;

  // The parsed map is cached in the state dir, so a resumed run does not re-fetch it
  // at all (targets are re-verified on-wiki anyway).
  const cachePath = `${process.env.BOT_STATE_DIR ?? '.state'}/taxon-fa-map.json`;
  const MAX_AGE_MS = 7 * 24 * 3600 * 1000;
  try {
    const c = JSON.parse(readFileSync(cachePath, 'utf8'));
    if (Date.now() - c.at < MAX_AGE_MS && Object.keys(c.map).length > 20000) {
      console.log(`  نگاشت ویکی‌داده از حافظهٔ نهانی (${Object.keys(c.map).length} آرایه)`);
      return new Map(Object.entries(c.map as Record<string, string>));
    }
  } catch { /* no cache yet, or unreadable → fetch */ }

  type Row = { t: { value: string }; a: { value: string } };
  const rows: Row[] = [];
  for (const filter of shards) {
    let got: Row[] | null = null;
    for (let attempt = 1; attempt <= 4 && !got; attempt++) {
      try {
        const r = await fetch(`${WDQS}?query=${encodeURIComponent(queryFor(filter))}`, {
          headers: { Accept: 'application/sparql-results+json', 'User-Agent': UA },
          signal: AbortSignal.timeout(300000),
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        // read as TEXT and parse here: a truncated body must be OUR error to retry,
        // not an opaque SyntaxError thrown from inside undici's json()
        const parsed = JSON.parse(await r.text());
        if (!Array.isArray(parsed.results?.bindings)) throw new Error('پاسخ بدون bindings');
        got = parsed.results.bindings as Row[];
      } catch (e) {
        console.log(`  … شارد ${filter.slice(0, 28)} ناموفق (تلاش ${attempt}): ${(e as Error).message}`);
        if (attempt === 4) throw new Error(`WDQS پس از ۴ تلاش ناموفق: ${(e as Error).message}`);
        await new Promise(r => setTimeout(r, 20000 * attempt));
      }
    }
    rows.push(...got!);
  }
  // Plausibility floor: a complete pull is tens of thousands of rows. Building a run on
  // a short answer would silently mean "no Persian article exists" for thousands of taxa.
  if (rows.length < 20000) throw new Error(`پاسخ ویکی‌داده کوتاه است (${rows.length} ردیف) — اجرا متوقف شد`);
  console.log(`  ویکی‌داده: ${rows.length} ردیف در ${shards.length} بخش`);

  const multi = new Map<string, Set<string>>();
  for (const row of rows) {
    const title = decodeURIComponent(row.a.value.split('/wiki/')[1]).replace(/_/g, ' ');
    (multi.get(row.t.value) ?? multi.set(row.t.value, new Set()).get(row.t.value)!).add(title);
  }
  const out = new Map<string, string>();
  for (const [latin, titles] of multi) if (titles.size === 1) out.set(latin, [...titles][0]);
  try {
    mkdirSync(dirname(cachePath), { recursive: true });
    writeFileSync(cachePath, JSON.stringify({ at: Date.now(), map: Object.fromEntries(out) }));
  } catch { /* cache is an optimisation, never fatal */ }
  return out;
}

async function getTargets(bot: Bot): Promise<string[]> {
  const faMap = await wikidataTaxonMap();
  console.log(`  نگاشت ویکی‌داده: ${faMap.size} آرایه با مقالهٔ فارسی`);

  // 1) every Taxonomy/* template
  const titles: string[] = [];
  let cont: Record<string, string> = {};
  for (;;) {
    const r = await bot.apiGet({ action: 'query', list: 'allpages', apnamespace: '10', apprefix: 'Taxonomy/', aplimit: 'max', ...cont });
    titles.push(...r.query.allpages.map((p: any) => p.title));
    if (!r.continue) break;
    cont = r.continue;
  }
  console.log(`  الگوهای ردهبندی: ${titles.length}`);

  // 2) keep the ones whose link= is still Latin AND that have a Persian article
  const candidates: string[] = [];
  const wanted = new Map<string, string>(); // fa title → taxon, for the existence pass
  for (let i = 0; i < titles.length; i += 50) {
    const r = await bot.apiGet({
      action: 'query', titles: titles.slice(i, i + 50).join('|'),
      prop: 'revisions', rvprop: 'content', rvslots: 'main',
    });
    for (const p of r.query.pages) {
      if ('missing' in p) continue;
      const text: string = p.revisions?.[0]?.slots?.main?.content ?? '';
      const line = text.match(LINK_LINE);
      if (!line || PERSIAN.test(line[0])) continue;      // absent, or already Persian
      const taxon = (p.title as string).slice(PREFIX.length);
      const fa = faMap.get(taxon);
      if (!fa || !PERSIAN.test(fa)) continue;            // no fa article, or a Latin-titled one
      candidates.push(p.title);
      wanted.set(fa, taxon);
    }
    // the scan is 800+ batched reads; without a heartbeat a long run looks hung
    if ((i / 50) % 100 === 0) console.log(`    … ${Math.min(i + 50, titles.length)}/${titles.length} بررسی شد، ${candidates.length} نامزد`);
  }
  console.log(`  نامزدها: ${candidates.length}`);

  // 3) the link target must really exist on fa.wiki — a Wikidata sitelink can be
  //    stale, and shipping a red link is exactly what the wiki asks bots not to do.
  //    `redirects=1` resolves a redirect so the taxobox links the real article.
  const faTitles = [...wanted.keys()];
  const resolved = new Map<string, string>();
  for (let i = 0; i < faTitles.length; i += 50) {
    const r = await bot.apiGet({ action: 'query', titles: faTitles.slice(i, i + 50).join('|'), prop: 'info', redirects: '1' });
    const hop = new Map<string, string>();
    for (const n of r.query.normalized ?? []) hop.set(n.from, n.to);
    for (const n of r.query.redirects ?? []) hop.set(n.from, n.to);
    const alive = new Set((r.query.pages ?? []).filter((p: any) => !('missing' in p)).map((p: any) => p.title));
    for (const t of faTitles.slice(i, i + 50)) {
      let cur = t;
      for (let h = 0; h < 3 && hop.has(cur); h++) cur = hop.get(cur)!;
      if (alive.has(cur) && PERSIAN.test(cur)) resolved.set(t, cur);
    }
  }

  const withTarget: string[] = [];
  for (const title of candidates) {
    const taxon = title.slice(PREFIX.length);
    const fa = faMap.get(taxon)!;
    const real = resolved.get(fa);
    if (!real) continue;                                  // missing target → never edit
    faTitleFor.set(taxon, real);
    withTarget.push(title);
  }
  console.log(`  هدف با مقصد موجود: ${withTarget.length}`);

  // 4) Hold back HIGH-USE templates. One edit to a rank near the root of the tree
  //    changes a row on thousands of articles at once (الگو:Taxonomy/Amorphea feeds
  //    4,428), which is a different conversation from localizing a single genus. The
  //    permission request explicitly promises these stay out until that is answered.
  //    MAX_ARTICLES=0 lifts the cap once it is.
  const cap = Number(process.env.MAX_ARTICLES ?? '10');
  if (!cap) { console.log('  سقف پرکاربردی برداشته شده (MAX_ARTICLES=0)'); return withTarget; }
  const final: string[] = [];
  let heldBack = 0;
  for (let i = 0; i < withTarget.length; i += 50) {
    const batch = withTarget.slice(i, i + 50);
    const counts = new Map<string, number>(batch.map(t => [t, 0]));
    let cont: Record<string, string> = {};
    for (;;) {
      const r = await bot.apiGet({ action: 'query', titles: batch.join('|'), prop: 'transcludedin', tinamespace: '0', tilimit: 'max', ...cont });
      for (const p of r.query?.pages ?? []) {
        if (p.transcludedin) counts.set(p.title, (counts.get(p.title) ?? 0) + p.transcludedin.length);
      }
      if (!r.continue) break;
      cont = r.continue;
    }
    for (const t of batch) {
      if ((counts.get(t) ?? 0) > cap) { heldBack++; continue; }
      final.push(t);
    }
  }
  console.log(`  هدف نهایی: ${final.length} (${heldBack} الگوی پرکاربرد کنار گذاشته شد، سقف ${cap} مقاله)`);
  return final;
}

export const taxonomyLinkLocalizeTask: BotTask = {
  id: 'taxonomy-link-localize',
  taskNumber: 9,
  summary: 'نمایش نام فارسی آرایه در جعبهٔ ردهبندی',
  description:
    'در الگوهای «الگو:Taxonomy/…» که جعبهٔ ردهبندی خودکار از آن‌ها ساخته می‌شود، مقدار پارامتر link ' +
    'که هم مقصد پیوند و هم متن نمایش‌داده‌شده است، از نام لاتین به عنوان مقالهٔ فارسی همان آرایه تغییر می‌کند ' +
    '(نام فارسی از پیوند میان‌ویکیِ فارسیِ آیتم ویکی‌داده‌ای گرفته می‌شود که P225 آن دقیقاً همان نام علمی است). ' +
    'آرایه‌هایی که مقالهٔ فارسی ندارند، لاتین می‌مانند و نام‌هایی که به بیش از یک مقالهٔ فارسی می‌رسند برای بازبینی دستی کنار گذاشته می‌شوند. ' +
    'هیچ خط دیگری از الگو (rank، parent، refs) دست نمی‌خورد.',

  getTargets,

  transform(text: string, title: string) {
    const taxon = title.startsWith(PREFIX) ? title.slice(PREFIX.length) : title;
    const fa = faTitleFor.get(taxon);
    if (!fa) return { text, changed: false, note: 'نام فارسی برای این آرایه یافت نشد' };
    if (!PERSIAN.test(fa)) return { text, changed: false, note: 'عنوان مقالهٔ مقصد فارسی نیست' };

    const line = text.match(LINK_LINE);
    if (!line) return { text, changed: false, note: 'خط link در الگو نیست' };
    if (PERSIAN.test(line[0])) return { text, changed: false, note: 'از پیش فارسی است' };

    const newLine = linkLineFor(fa);
    const next = text.replace(LINK_LINE, () => newLine);

    // Belt-and-braces: prove the edit is exactly one line and nothing else moved.
    // Splicing the matched span back out must reproduce the original page byte for byte.
    const before = text.slice(0, line.index!), after = text.slice(line.index! + line[0].length);
    if (next !== before + newLine + after)
      return { text, changed: false, note: 'جایگزینی بیش از یک خط را تغییر می‌داد', manualReview: true };
    if (next === text) return { text, changed: false, note: 'بدون تغییر' };
    // MediaWiki expands ~~~~ into a signature on EVERY save, including one that
    // was already sitting in the page — so refuse outright rather than only when
    // the replacement introduced it.
    if (next.includes('~~~~'))
      return { text, changed: false, note: 'متن الگو شامل نشان امضا است', manualReview: true };

    return { text: next, changed: true, note: `${line[0].trim()} ← ${newLine}` };
  },
};
