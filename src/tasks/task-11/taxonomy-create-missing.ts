/**
 * وظیفهٔ ۱۱ — ساخت الگوهای رده‌بندی گم‌شده در جعبهٔ آرایه زیستی خودکار.
 *
 * Drains رده:صفحه‌های دارای الگوی آرایه‌شناسی گم‌شده — the category an automatic
 * taxobox adds when it prints «Missing taxonomy template (fix)». It never edits an
 * article. It creates the الگو:Taxonomy/<name> page the taxobox asked for, or one of
 * that page's missing ancestors.
 *
 * WHICH TEMPLATE IS MISSING — asked of the renderer, never guessed from wikitext.
 * The first version read `taxon=` out of the article and looked that name up. That
 * is wrong for every species box: `{{جعبه اطلاعات گونه|taxon=Cornu aspersum}}` needs
 * الگو:Taxonomy/Cornu, not «Cornu aspersum», and `genus=Sepsis (fly)` needs
 * «Sepsis (fly)». 44 of 130 members were invisible to it for that reason. Now each
 * article is parsed and the missing template is read off `prop=templates`, which
 * lists exactly the الگو:Taxonomy/* titles the module tried and did not find.
 *
 * CHAINS. A missing template whose parent is also missing cannot be proved on the
 * article (templatesandbox simulates one page), and the old code just refused it,
 * forever — nothing else ever created the parent. Now the chain is walked upward to
 * the first ancestor whose own parent exists, and THAT is created. An hourly run
 * therefore drains a chain of depth k in k runs, each edit individually proved.
 *
 * WHERE THE DATA COMES FROM, in order:
 *   1. en.wikipedia's Template:Taxonomy/<name>. fa's automatic taxobox is a port of
 *      en's, so en's tree uses the same names, the same disambiguated titles
 *      («Sepsis (fly)») and the same rank keywords. rank/parent/extinct are copied;
 *      a rank fa's الگو:Anglicise rank does not know is refused.
 *   2. Wikidata, for names en does not have: rank ← P105 (through RANKS), parent ←
 *      the single P171's P225. Ambiguous or incomplete → refused.
 *   link ← the fa article for the taxon if one exists, else the Latin name, which is
 *   what the box already prints.
 *
 * PERSIAN NAMES. Some articles pass a Persian name (`taxon=پاکس‌ویریده`). The fix
 * fa already uses for those (الگو:Taxonomy/آمانیتا) is a redirect to the Latin
 * template: the name is resolved through the fa article's Wikidata item → P225.
 *
 * SPECIES BOXES. The template a species box is blocked on is its GENUS. When the
 * resolved rank is not genus — a homonym, or a Persian name that is really a family
 * («سهره» → Fringillidae) — the edit is refused: it would render a wrong row.
 *
 * THE PROOF. Before any write, verify() renders with the proposed content injected
 * through `templatesandboxtext`:
 *   - the template an article is blocked on: that article must leave the category;
 *   - an ancestor: `{{Automatic taxobox|taxon=<it>}}` must render with no «Missing
 *     taxonomy template» and no error.
 * A template that does not demonstrably do its job is not saved.
 */
import { BOT_UA, EN_API, type Bot, type BotTask } from '../../core.js';

const WDQS = 'https://query.wikidata.org/sparql';
const WD_API = 'https://www.wikidata.org/w/api.php';
const PREFIX = 'الگو:Taxonomy/';
export const CAT = 'رده:صفحه‌های دارای الگوی آرایه‌شناسی گم‌شده';
const CAT_KEY = CAT.replace(/^رده:/, '').replace(/ /g, '_');
export const REPORT_PAGE = 'کاربر:MamouriBot/وظیفه ۱۱/گزارش';
const PROBE_TITLE = 'کاربر:MamouriBot/وظیفه ۱۱/آزمایش';
const PERSIAN = /[؀-ۿ]/;
const SPECIES_BOX = /\{\{\s*(?:جعبه اطلاعات (?:زیر)?گونه|(?:sub|infra)?speciesbox)\s*[|}]/i;

/**
 * Wikidata taxon-rank item → the keyword الگو:Anglicise rank understands.
 * Deliberately short. An unlisted rank is REFUSED rather than guessed: a wrong
 * rank renders a wrong row in every taxobox below it, and renders silently.
 */
export const RANKS: Record<string, string> = {
  // VERIFIED against Wikidata labels on 2026-10-03, not from memory. The first
  // draft of this table had three wrong entries — Q5868144 was mapped to
  // subordo but is actually SUPERORDER, Q3491996 to superordo but is SUBDOMAIN,
  // Q3181348 to subfamilia but is SECTION. Each would have written a plausible
  // wrong rank into a template, and a wrong rank renders a wrong row in every
  // taxobox below it without raising anything. Re-verify before adding a row:
  //   wbgetentities&ids=Q…&props=labels&languages=en
  Q36732: 'regnum',
  Q38348: 'phylum',
  Q1153785: 'subphylum',
  Q37517: 'classis',
  Q5867051: 'subclassis',
  Q3504061: 'superclassis',
  Q2007442: 'infraclassis',
  Q36602: 'ordo',
  Q5867959: 'subordo',
  Q5868144: 'superordo',
  Q2889003: 'infraordo',
  Q35409: 'familia',
  Q164280: 'subfamilia',
  Q2136103: 'superfamilia',
  Q227936: 'tribus',
  Q3965313: 'subtribus',
  Q34740: 'genus',
  Q3238261: 'subgenus',
  Q7432: 'species',
  Q68947: 'subspecies',
  Q713623: 'clade',
  // deliberately absent: «section» has two competing items (Q3181348,
  // Q10861426) and «realm» (Q62075839) is virology-only — both are refused
  // and reported rather than guessed.
};

export type Resolved = { rank: string; parent: string; link: string; extinct?: boolean };
export type Plan =
  | { kind: 'create'; name: string; r: Resolved; source: 'en' | 'wd' }
  | { kind: 'redirect'; name: string; to: string };
type Refusal = { taxon: string; why: string; article: string };

/** template title → what to write, filled by getTargets */
const plans = new Map<string, Plan>();
/** template title → the article whose box it unblocks (direct), or null (ancestor) */
const witness = new Map<string, string | null>();
const refused: Refusal[] = [];

/** test seams */
export const seedResolved = (t: string, r: Resolved) =>
  plans.set(PREFIX + t, { kind: 'create', name: t, r, source: 'wd' });
export const seedRedirect = (t: string, to: string) =>
  plans.set(PREFIX + t, { kind: 'redirect', name: t, to });
export const _refusals = () => refused;

/** The exact wikitext of a taxonomy template. Matches what the UI creates. */
export const templateBody = (r: Resolved) =>
  `{{Don't edit this line {{{machine code|}}}\n` +
  `|rank=${r.rank}\n` +
  `|link=${r.link}\n` +
  `|parent=${r.parent}\n` +
  (r.extinct ? `|extinct=yes\n` : '') +
  `|refs=\n` +
  `}}\n`;

export const redirectBody = (to: string) => `#تغییرمسیر [[${PREFIX}${to}]]\n`;

/** Parse a taxonomy template: null when absent, {root} for the blank root. */
export const parseTaxonomy = (c: string | null) => {
  if (c === null) return null;
  const red = c.match(/^\s*#(?:تغییرمسیر|تغییر_مسیر|REDIRECT)\s*\[\[[^\]]*Taxonomy\/([^\]|]+)\]\]/i);
  if (red) return { redirect: red[1].trim() };
  if (c.includes('intentionally blank')) return { root: true as const };
  // [ \t]*, not \s*: on an empty `|rank=` a \s* would run over the newline and
  // read the NEXT line («|link=X») as the rank.
  const g = (k: string) => (c.match(new RegExp(`^\\s*\\|[ \\t]*${k}[ \\t]*=[ \\t]*([^\\n]*)`, 'm')) ?? [, ''])[1]
    .replace(/<!--[\s\S]*?(?:-->|$)/g, '').trim();
  return { rank: g('rank'), parent: g('parent'), link: g('link'), extinct: g('extinct') };
};

/** «Sepsis (fly)|Sepsis» → { target: 'Sepsis (fly)', display: 'Sepsis' } */
export const splitLink = (link: string, name: string) => {
  const [target, display] = link.split('|').map(s => s.replace(/^\[\[|\]\]$/g, '').trim());
  const t = target || name;
  return { target: t, display: display || t.replace(/\s*\([^)]*\)\s*$/, '') };
};

const fa = (n: number) => String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[+d]);

export const task: BotTask = {
  id: 'taxonomy-create-missing',
  taskNumber: 11,
  createsMissing: true,
  // Hourly job: a deferred title is retried the next day, not a fortnight later.
  recheckAfterDays: 1,
  summary: 'ساخت الگوی رده‌بندی برای تکمیل زنجیرهٔ جعبهٔ آرایه زیستی',
  perPageSummary(title: string) {
    const p = plans.get(title);
    return p?.kind === 'redirect'
      ? `تغییرمسیر نام فارسی به الگوی رده‌بندی ${p.to} برای تکمیل جعبهٔ آرایه زیستی`
      : undefined;
  },
  description:
    'ساخت الگوهای الگو:Taxonomy/* که جعبهٔ آرایه زیستی مقاله‌ها به آن‌ها نیاز دارد ولی وجود ندارند؛ ' +
    'داده از الگوی متناظر در ویکی‌پدیای انگلیسی یا از ویکی‌داده (P105 و P171) گرفته می‌شود.',

  async getTargets(bot: Bot): Promise<string[]> {
    plans.clear(); witness.clear(); refused.length = 0;
    const articles = await categoryArticles(bot);
    console.log(`  ${articles.length} مقاله در رده`);
    if (!articles.length) return [];
    await loadRankKeywords(bot);

    const out: string[] = [];
    for (const art of articles) {
      let missing: string[], species: boolean;
      try { ({ missing, species } = await missingFor(bot, art)); }
      catch (e) { refused.push({ taxon: '', why: 'مقاله بازنمایی نشد', article: art }); continue; }
      if (!missing.length) { refused.push({ taxon: '', why: 'الگوی گم‌شده‌ای در بازنمایی دیده نشد', article: art }); continue; }
      for (const name of missing) {
        const r = await planChain(bot, name, species);
        if ('why' in r) { refused.push({ taxon: r.taxon, why: r.why, article: art }); continue; }
        const title = PREFIX + r.plan.name;
        if (!plans.has(title)) { plans.set(title, r.plan); out.push(title); }
        // A direct witness beats an ancestor one: the article proof is stronger.
        if (r.direct) witness.set(title, art);
        else if (!witness.has(title)) witness.set(title, null);
      }
    }
    console.log(`  ${out.length} الگو قابل ساخت، ${refused.length} مورد برای بازبینی انسانی`);
    return out;
  },

  transform(text: string, title: string) {
    if (text.trim() !== '') return { text, changed: false, note: 'صفحه از قبل وجود دارد' };
    const p = plans.get(title);
    if (!p) return { text, changed: false, note: 'حل‌نشده', manualReview: true };
    return { text: p.kind === 'redirect' ? redirectBody(p.to) : templateBody(p.r), changed: true };
  },

  async verify(bot: Bot, title: string, _old: string, newText: string) {
    const v = await prove(bot, title, newText);
    // A failed proof is a refusal a human has to see on the report page.
    if (!v.ok) refused.push({ taxon: title.slice(PREFIX.length), why: 'اثبات پیش از ذخیره ناموفق بود',
                              article: witness.get(title) ?? title });
    return v;
  },

  /**
   * Publish everything the task declined to create, grouped by reason. Runs every
   * hour, so it only saves when the list itself changed — an hourly timestamp bump
   * would be noise in everybody's watchlist.
   */
  async report(bot: Bot, dryRun: boolean) {
    const byReason = new Map<string, { taxon: string; article: string }[]>();
    for (const r of refused) {
      const k = r.why.replace(/\s*\([^)]*\)/, '').trim();
      if (!byReason.has(k)) byReason.set(k, []);
      byReason.get(k)!.push({ taxon: r.taxon, article: r.article });
    }
    const body: string[] = [];
    for (const [why, items] of [...byReason].sort((a, b) => b[1].length - a[1].length)) {
      body.push(`== ${why} (${fa(items.length)}) ==`, '');
      const seen = new Set<string>();
      for (const it of items.sort((a, b) => a.article.localeCompare(b.article))) {
        const line = it.taxon ? `* [[${it.article}]] — <code dir="ltr">${it.taxon}</code>` : `* [[${it.article}]]`;
        if (!seen.has(line)) { seen.add(line); body.push(line); }
      }
      body.push('');
    }
    const head = [
      `این صفحه را ربات [[کاربر:MamouriBot|MamouriBot]] در هر اجرای ` +
        `[[ویکی‌پدیا:سیاست ربات‌رانی/درخواست مجوز/MamouriBot/وظیفه ۱۱|وظیفهٔ ۱۱]] به‌روز می‌کند.`,
      '',
      `در اینجا مقاله‌هایی از [[:${CAT}]] فهرست می‌شود که ربات الگوی گم‌شده‌شان را نساخته، ` +
        `چون ساختنش قطعی نبوده. هر مورد نیاز به بررسی انسانی دارد.`,
      '',
    ];
    const stamp = `آخرین تغییر فهرست: ~~~~~ — ${fa(refused.length)} مورد.`;
    const text = [...head, stamp, '', ...body].join('\n');

    if (dryRun) { console.log(`\n--- گزارش بازبینی (آزمایشی، ${refused.length} مورد) ---\n${text}`); return; }
    const cur: any = await bot.apiGet({
      action: 'query', prop: 'revisions', titles: REPORT_PAGE,
      rvprop: 'content|ids|timestamp', rvslots: 'main',
    });
    const p = cur.query.pages[0];
    const old: string = p.missing ? '' : p.revisions[0].slots.main.content;
    const strip = (s: string) => s.replace(/^آخرین (?:به‌روزرسانی|تغییر فهرست):.*$/m, '').trim();
    if (strip(old) === strip(text)) { console.log('گزارش تغییری نکرده — ذخیره نشد'); return; }
    await bot.edit(REPORT_PAGE, text, 'به‌روزرسانی فهرست موارد نیازمند بازبینی',
      p.missing ? 0 : p.revisions[0].revid, p.missing ? '' : p.revisions[0].timestamp,
      { allowCreate: true });
    console.log(`گزارش منتشر شد: ${REPORT_PAGE} (${refused.length} مورد)`);
  },
};

/**
 * The pre-write proof, with the proposed content injected through templatesandbox:
 * an article blocked on this template must leave the category; an ancestor must
 * render its own chain with no «Missing taxonomy template» and no error.
 */
async function prove(bot: Bot, title: string, newText: string): Promise<{ ok: boolean; detail: string }> {
    if (!witness.has(title)) return { ok: false, detail: 'شاهدی برای این الگو ثبت نشده' };
    const art = witness.get(title);
    const sandbox = { templatesandboxtitle: title, templatesandboxtext: newText, templatesandboxcontentmodel: 'wikitext' };
    try {
      if (art) {
        const d: any = await bot.apiGet({ action: 'parse', page: art, prop: 'categories', ...sandbox });
        const cats: string[] = (d.parse?.categories ?? []).map((c: any) => c.category);
        if (cats.includes(CAT_KEY)) return { ok: false, detail: `${art} همچنان در رده می‌ماند` };
        return { ok: true, detail: `${art} از رده خارج می‌شود` };
      }
      const name = title.slice(PREFIX.length);
      const d: any = await bot.apiGet({
        action: 'parse', title: PROBE_TITLE, contentmodel: 'wikitext', prop: 'text',
        text: `{{Automatic taxobox|taxon=${name}}}`, ...sandbox,
      });
      const html: string = d.parse?.text ?? '';
      if (html.includes('Missing taxonomy template')) return { ok: false, detail: 'زنجیره همچنان ناقص است' };
      if (/class="error|scribunto-error/.test(html)) return { ok: false, detail: 'بازنمایی خطا دارد' };
      return { ok: true, detail: 'زنجیرهٔ این آرایه کامل بازنمایی می‌شود' };
    } catch (e) {
      return { ok: false, detail: `بازنمایی ناموفق: ${(e as Error).message}` };
    }
}

// ---------------------------------------------------------------- helpers

async function categoryArticles(bot: Bot): Promise<string[]> {
  const out: string[] = [];
  let cont: string | undefined;
  do {
    const d: any = await bot.apiGet({
      action: 'query', list: 'categorymembers', cmtitle: CAT,
      cmnamespace: '0', cmlimit: '500', ...(cont ? { cmcontinue: cont } : {}),
    });
    out.push(...d.query.categorymembers.map((m: any) => m.title));
    cont = d.continue?.cmcontinue;
  } while (cont);
  return out;
}

/** The الگو:Taxonomy/* titles the article's box looked for and did not find. */
async function missingFor(bot: Bot, article: string) {
  const d: any = await bot.apiGet({ action: 'parse', page: article, prop: 'templates|wikitext' });
  const missing = (d.parse?.templates ?? [])
    .filter((t: any) => t.title.startsWith(PREFIX) && !t.exists)
    .map((t: any) => t.title.slice(PREFIX.length) as string);
  return { missing, species: SPECIES_BOX.test(d.parse?.wikitext ?? '') };
}

const tplCache = new Map<string, string | null>();
async function templateText(bot: Bot, name: string): Promise<string | null> {
  if (tplCache.has(name)) return tplCache.get(name)!;
  const d: any = await bot.apiGet({
    action: 'query', titles: PREFIX + name, prop: 'revisions',
    rvprop: 'content', rvslots: 'main', redirects: '1',
  });
  const pg = d.query.pages[0];
  const v = ('missing' in pg || !pg.revisions) ? null : pg.revisions[0].slots.main.content;
  tplCache.set(name, v);
  return v;
}
const templateExists = async (bot: Bot, name: string) => (await templateText(bot, name)) !== null;

/** Rank keywords fa's الگو:Anglicise rank knows. A rank outside this set is refused. */
let rankKeywords: Set<string> | null = null;
async function loadRankKeywords(bot: Bot) {
  if (rankKeywords) return;
  const d: any = await bot.apiGet({
    action: 'query', titles: 'الگو:Anglicise rank', prop: 'revisions', rvprop: 'content', rvslots: 'main',
  });
  const src: string = d.query.pages[0].revisions[0].slots.main.content;
  rankKeywords = new Set([...src.matchAll(/\|\s*([a-z][a-z ]*?)\s*=/g)].map(m => m[1]));
  for (const v of Object.values(RANKS)) rankKeywords.add(v);
}
export const _setRankKeywords = (s: string[]) => { rankKeywords = new Set(s); };

/**
 * Walk up from the missing `name` to the lowest template that can be written now
 * (its parent, or its redirect target, already exists).
 */
async function planChain(bot: Bot, name: string, species: boolean):
    Promise<{ plan: Plan; direct: boolean } | { taxon: string; why: string }> {
  let cur = name;
  const seen = new Set<string>();
  for (let depth = 0; depth < 40; depth++) {
    if (seen.has(cur)) return { taxon: name, why: 'حلقه در زنجیرهٔ رده‌بندی' };
    seen.add(cur);
    const direct = depth === 0;

    if (PERSIAN.test(cur)) {
      const latin = await latinForPersian(bot, cur);
      if (!latin) return { taxon: cur, why: 'نام فارسی آرایه به نام علمی یکتایی نرسید' };
      if (await templateExists(bot, latin)) {
        if (direct && species) {
          const t = parseTaxonomy(await templateText(bot, latin));
          if (t && 'rank' in t && t.rank !== 'genus') {
            return { taxon: cur, why: `نام فارسی به آرایه‌ای با رتبهٔ ${t.rank} می‌رسد نه سرده` };
          }
        }
        return { plan: { kind: 'redirect', name: cur, to: latin }, direct };
      }
      cur = latin;
      continue;
    }

    const info = await resolveLatin(bot, cur);
    if ('why' in info) return { taxon: cur, why: info.why };
    if ('redirectTo' in info) {
      if (await templateExists(bot, info.redirectTo)) {
        return { plan: { kind: 'redirect', name: cur, to: info.redirectTo }, direct };
      }
      cur = info.redirectTo;
      continue;
    }
    if (direct && species && info.r.rank !== 'genus') {
      return { taxon: cur, why: `جعبهٔ گونه به سرده نیاز دارد ولی رتبهٔ این نام ${info.r.rank} است` };
    }
    if (await templateExists(bot, info.r.parent)) {
      return { plan: { kind: 'create', name: cur, r: info.r, source: info.source }, direct };
    }
    cur = info.r.parent;
  }
  return { taxon: name, why: 'زنجیره بیش از حد عمیق' };
}

type Latin = { r: Resolved; source: 'en' | 'wd' } | { redirectTo: string } | { why: string };
async function resolveLatin(bot: Bot, name: string): Promise<Latin> {
  const en = await enTaxonomy(bot, name);
  if (en) {
    const t = parseTaxonomy(en);
    if (t && 'redirect' in t) return { redirectTo: t.redirect! };
    if (t && 'rank' in t && t.rank && t.parent) {
      if (!rankKeywords!.has(t.rank)) return { why: `رتبهٔ ناشناخته در الگوی انگلیسی (${t.rank})` };
      const { target, display } = splitLink(t.link, name);
      const faTitle = await faForEn(bot, target);
      return {
        source: 'en',
        r: { rank: t.rank, parent: t.parent, link: faTitle ?? display,
             extinct: /^(yes|true|y)$/i.test(t.extinct ?? '') },
      };
    }
  }
  const wd = await wikidataTaxon(name);
  if (!wd) return { why: 'نه در ویکی‌پدیای انگلیسی الگو دارد نه در ویکی‌داده آیتم یکتا' };
  const rank = RANKS[wd.rankQid ?? ''];
  if (!rank) return { why: `رتبهٔ ناشناخته در ویکی‌داده (${wd.rankQid ?? '—'})` };
  if (!wd.parent) return { why: 'رستهٔ بالادست در ویکی‌داده مشخص نیست' };
  return { source: 'wd', r: { rank, parent: wd.parent, link: wd.faTitle ?? name } };
}

async function enTaxonomy(bot: Bot, name: string): Promise<string | null> {
  const d: any = await bot.apiGetOn(EN_API, {
    action: 'query', titles: `Template:Taxonomy/${name}`, prop: 'revisions',
    rvprop: 'content', rvslots: 'main',
  });
  const pg = d.query.pages[0];
  return ('missing' in pg || !pg.revisions) ? null : pg.revisions[0].slots.main.content;
}

/** fa title of the en article `title`, if it has one. */
async function faForEn(bot: Bot, title: string): Promise<string | null> {
  const d: any = await bot.apiGetOn(EN_API, {
    action: 'query', titles: title, prop: 'langlinks', lllang: 'fa', redirects: '1',
  });
  return d.query.pages[0]?.langlinks?.[0]?.title ?? null;
}

/** Persian taxon name → the P225 of the Wikidata item its fa article belongs to. */
async function latinForPersian(bot: Bot, name: string): Promise<string | null> {
  const d: any = await bot.apiGetOn(WD_API, {
    action: 'wbgetentities', sites: 'fawiki', titles: name, props: 'claims', redirects: 'yes',
  });
  const e: any = Object.values(d.entities ?? {})[0];
  if (!e || 'missing' in e) return null;
  const vals = (e.claims?.P225 ?? []).map((c: any) => c.mainsnak?.datavalue?.value).filter(Boolean);
  return vals.length === 1 ? vals[0] : null;
}

/** rank qid, parent name and fa sitelink for one scientific name, or null if ambiguous. */
async function wikidataTaxon(name: string) {
  const q = `SELECT ?item ?rank ?pname ?fa WHERE {
    ?item wdt:P225 "${name.replace(/"/g, '\\"')}" .
    OPTIONAL { ?item wdt:P105 ?rank }
    OPTIONAL { ?item wdt:P171 ?p . ?p wdt:P225 ?pname }
    OPTIONAL { ?fa schema:about ?item ; schema:isPartOf <https://fa.wikipedia.org/> }
  }`;
  let j: any = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(`${WDQS}?format=json&query=${encodeURIComponent(q)}`,
        { headers: { 'User-Agent': BOT_UA, Accept: 'application/sparql-results+json' },
          signal: AbortSignal.timeout(90_000) });
      if (!res.ok) throw new Error(`WDQS ${res.status}`);
      j = await res.json();
      break;
    } catch (e) {
      if (attempt === 3) throw e;
      await new Promise(r => setTimeout(r, 5000 * (attempt + 1)));
    }
  }
  const rows = j.results.bindings as any[];
  if (!rows.length) return null;
  // two items, two ranks or two parents for one name: ambiguous, refuse
  const uniq = (k: string) => new Set(rows.map(b => b[k]?.value ?? '')).size;
  if (uniq('item') > 1 || uniq('rank') > 1 || uniq('pname') > 1) return null;
  const b = rows[0];
  return {
    rankQid: b.rank?.value.split('/').pop() as string | undefined,
    parent: b.pname?.value as string | undefined,
    faTitle: b.fa ? decodeURIComponent(b.fa.value.split('/wiki/')[1]).replace(/_/g, ' ') : undefined,
  };
}

/** The Persian report of everything this task refused to touch. */
export const reportWikitext = (rows: Refusal[]) => {
  const byWhy = new Map<string, typeof rows>();
  for (const r of rows) (byWhy.get(r.why) ?? byWhy.set(r.why, []).get(r.why)!).push(r);
  let s = `این صفحه را ربات به‌روز می‌کند. موارد زیر در [[:${CAT}]] هستند ولی ربات آن‌ها را `
    + `اصلاح نکرد، چون اصلاحشان قطعی نبود. هر مورد نیاز به بررسی انسانی دارد.\n\n`;
  for (const [why, list] of [...byWhy].sort((a, b) => b[1].length - a[1].length)) {
    s += `== ${why} (${list.length}) ==\n`;
    for (const r of list.slice(0, 200)) {
      s += `* [[${r.article}]]${r.taxon ? ` — آرایه: <code>${r.taxon}</code>` : ''}\n`;
    }
    s += '\n';
  }
  return s;
};
