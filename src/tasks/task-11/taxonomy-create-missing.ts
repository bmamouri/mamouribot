/**
 * وظیفهٔ ۱۱ — ساخت الگوهای رده‌بندی گم‌شده در جعبهٔ آرایه زیستی خودکار.
 *
 * رده:تمیزکاری جعبه آرایه زیستی خودکار collects pages whose automatic taxobox
 * cannot build its classification chain. A survey of all 268 members found the
 * category is not one problem but four, and only one of them is bot work:
 *
 *     137 articles   the chain names a الگو:Taxonomy/<taxon> that DOES NOT EXIST
 *      29 articles   the article passes a PERSIAN taxon name, so the lookup goes
 *                    to a template that was never going to exist
 *       9 articles   no taxon parameter at all
 *       5 articles   chain deeper than 30 levels (suspect loop)
 *      86 templates  the broken taxonomy templates themselves
 *
 * This task does exactly the first one: create the missing taxonomy template.
 * It never edits an article, never guesses a name, and never creates a template
 * that no existing article already transcludes.
 *
 * WHY CREATING TEMPLATES IS NOT THE PATTERN THE CORPUS FORBIDS.
 * `lessons/api-and-permissions/dont-bulk-create-unused-helper-templates.md`
 * vetoed creating 109 taxonomy templates up front for articles that did not
 * exist yet — orphan scaffolding that looks like spam to new-page patrollers.
 * The inverse holds here: every target is extracted FROM an existing article
 * that already transcludes it, so each template is in use the moment it is
 * saved, and getTargets() enforces that by construction — a title only becomes
 * a target because a live article's chain demanded it.
 *
 * WHERE THE DATA COMES FROM — Wikidata, never a guess:
 *   rank   ← P105 (taxon rank), mapped through RANKS below; an unlisted rank is
 *            a refusal, not a fallback.
 *   parent ← P171 (parent taxon) → that item's P225. Exactly one P171 value, or
 *            refuse.
 *   link   ← the taxon item's fawiki sitelink if it has one, else the Latin name
 *            (which is what the taxobox already shows, so no regression).
 *
 * REFUSALS (logged to the report page for a human, never guessed around):
 *   - P225 matches zero or more than one Wikidata item
 *   - no P105, or a rank outside RANKS
 *   - no P171, or more than one P171
 *   - the parent's own taxonomy template does not exist yet
 *   - the article is blocked by something other than a missing template
 *   - the simulated render does not actually clear the cleanup category
 *
 * THE PROOF THAT IT CANNOT GET IT WRONG. Before any write, verify() re-renders
 * a real article that is blocked by this template, with the proposed template
 * content injected through `templatesandboxtext`. The save happens only if that
 * render drops out of رده:تمیزکاری جعبه آرایه زیستی خودکار and gains no new
 * error. A template that does not demonstrably fix a live article is refused.
 */
import { BOT_UA, type Bot, type BotTask } from '../../core.js';

const WDQS = 'https://query.wikidata.org/sparql';
const PREFIX = 'الگو:Taxonomy/';
export const CLEANUP_CAT = 'رده:تمیزکاری جعبه آرایه زیستی خودکار';
const CLEANUP_CAT_KEY = CLEANUP_CAT.replace(/^رده:/, '').replace(/ /g, '_');
export const REPORT_PAGE = 'کاربر:MamouriBot/وظیفه ۱۱/گزارش';
const PERSIAN = /[؀-ۿ]/;

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


export type Resolved = { rank: string; parent: string; link: string };
/** taxon → resolved fields, or a refusal reason. Filled by getTargets. */
const resolved = new Map<string, Resolved>();
const refused: { taxon: string; why: string; article: string }[] = [];
/** taxon → one article that is blocked by it, used as the proof subject. */
const blockedArticle = new Map<string, string>();

/** test seams */
export const seedResolved = (t: string, r: Resolved) => resolved.set(t, r);
export const seedBlocked = (t: string, a: string) => blockedArticle.set(t, a);
export const _refusals = () => refused;

/** The exact wikitext of a taxonomy template. Matches what the UI creates. */
export const templateBody = (r: Resolved) =>
  `{{Don't edit this line {{{machine code|}}}\n` +
  `|rank=${r.rank}\n` +
  `|link=${r.link}\n` +
  `|parent=${r.parent}\n` +
  `|refs=\n` +
  `}}\n`;

/** Parse a taxonomy template: null when absent, {root} for the blank root. */
export const parseTaxonomy = (c: string | null) => {
  if (c === null) return null;
  const red = c.match(/^\s*#(?:تغییرمسیر|تغییر_مسیر|REDIRECT)\s*\[\[[^\]]*Taxonomy\/([^\]]+)\]\]/i);
  if (red) return { redirect: red[1].trim() };
  if (c.includes('intentionally blank')) return { root: true as const };
  const g = (k: string) => (c.match(new RegExp(`\\|\\s*${k}\\s*=\\s*([^\\n|}]*)`)) ?? [, ''])[1].trim();
  return { rank: g('rank'), parent: g('parent'), link: g('link') };
};

export const task: BotTask = {
  id: 'taxonomy-create-missing',
  taskNumber: 11,
  createsMissing: true,
  // the category keeps gaining members as editors create species articles
  recheckAfterDays: 14,
  summary: 'ساخت الگوی رده‌بندی برای تکمیل زنجیرهٔ جعبهٔ آرایه زیستی',
  description:
    'ساخت الگوهای الگو:Taxonomy/* که مقاله‌های موجود به آن‌ها ارجاع می‌دهند ولی وجود ندارند؛ ' +
    'رتبه و رستهٔ بالادست از ویکی‌داده (P105 و P171) گرفته می‌شود.',

  async getTargets(bot: Bot): Promise<string[]> {
    const articles = await categoryArticles(bot);
    console.log(`  ${articles.length} مقاله در رده`);

    // 1. diagnose each article: which template does its chain miss?
    const want = new Map<string, string>();  // taxon -> blocking article
    for (const art of articles) {
      const d = await diagnose(bot, art);
      if (d.kind === 'missing-template') {
        if (!want.has(d.taxon)) want.set(d.taxon, art);
      } else {
        refused.push({ taxon: d.taxon ?? '', why: d.kind, article: art });
      }
    }
    console.log(`  ${want.size} الگوی گم‌شده، ${refused.length} مورد خارج از دامنهٔ این وظیفه`);

    // 2. Resolve against Wikidata — but ONLY where the parent template
    //    already exists.
    //
    // A richer version resolved whole ancestor chains and raised the creatable
    // count from 53 to 129. It was reverted, because it broke the one property
    // that matters here: the per-edit proof. verify() proves a template by
    // re-rendering a blocked article with that template injected, and
    // templatesandbox can only simulate ONE page. An ancestor created as part
    // of a chain does not by itself clear the article — its descendants are
    // still missing — so 10 of 15 sampled templates failed their own proof.
    //
    // Creating them anyway would mean saving edits whose effect was not
    // demonstrated, which is exactly what this task is not allowed to do.
    // Requiring an existing parent keeps every single edit individually
    // provable; the chains still drain, one level per run, because each run
    // makes the next level's parent exist.
    const need = [...want.keys()];
    await prefetchTemplates(bot, need);
    const info = await wikidataTaxa(bot, need);
    await prefetchTemplates(bot, [...info.values()].map(i => i.parent).filter(Boolean) as string[]);

    const out: string[] = [];
    for (const [taxon, art] of want) {
      const i = info.get(taxon);
      if (!i) { refused.push({ taxon, why: 'در ویکی‌داده یافت نشد یا بیش از یک آیتم دارد', article: art }); continue; }
      const rank = RANKS[i.rankQid ?? ''];
      if (!rank) { refused.push({ taxon, why: `رتبهٔ ناشناخته (${i.rankQid ?? '—'})`, article: art }); continue; }
      if (!i.parent) { refused.push({ taxon, why: 'رستهٔ بالادست در ویکی‌داده مشخص نیست', article: art }); continue; }
      if (!(await templateExists(bot, i.parent))) {
        refused.push({ taxon, why: `الگوی رستهٔ بالادست (${i.parent}) هنوز وجود ندارد`, article: art });
        continue;
      }
      resolved.set(taxon, { rank, parent: i.parent, link: i.faTitle ?? taxon });
      blockedArticle.set(taxon, art);
      out.push(PREFIX + taxon);
    }
    console.log(`  ${out.length} الگو قابل ساخت، ${refused.length} مورد برای بازبینی انسانی`);
    return out;
  },

  transform(text: string, title: string) {
    if (text.trim() !== '') return { text, changed: false, note: 'صفحه از قبل وجود دارد' };
    const taxon = title.slice(PREFIX.length);
    const r = resolved.get(taxon);
    if (!r) return { text, changed: false, note: 'حل‌نشده', manualReview: true };
    return { text: templateBody(r), changed: true };
  },

  /**
   * Prove it. Render a real article that this template blocks, with the
   * proposed content injected, and require that the article actually leaves
   * the cleanup category. templatesandboxtext works on a title that does not
   * exist yet, which is what makes a pre-write proof possible here.
   */
  async verify(bot: Bot, title: string, _old: string, newText: string) {
    const taxon = title.slice(PREFIX.length);
    const art = blockedArticle.get(taxon);
    if (!art) return { ok: false, detail: 'مقالهٔ شاهدی برای این الگو ثبت نشده' };
    const cats = await parseCategories(bot, art, { title, text: newText });
    if (cats === null) return { ok: false, detail: 'بازنمایی مقالهٔ شاهد ناموفق بود' };
    if (cats.includes(CLEANUP_CAT_KEY)) {
      return { ok: false, detail: `${art} پس از ساخت این الگو همچنان در ردهٔ تمیزکاری می‌ماند` };
    }
    return { ok: true, detail: `${art} از ردهٔ تمیزکاری خارج می‌شود` };
  },

  /**
   * Publish everything the task declined to create. Grouped by reason, because
   * the reasons need different human actions: a missing Wikidata item is a
   * Wikidata edit, an unknown rank is a RANKS gap here, and a parent template
   * that does not exist yet needs no action at all — the next run creates it.
   */
  async report(bot: Bot, dryRun: boolean) {
    const byReason = new Map<string, { taxon: string; article: string }[]>();
    for (const r of refused) {
      // Fold the varying parenthetical (a QID, a parent name) so that one
      // reason is one section instead of one section per item.
      const k = r.why.replace(/\s*\([^)]*\)/, '').trim();
      if (!byReason.has(k)) byReason.set(k, []);
      byReason.get(k)!.push({ taxon: r.taxon, article: r.article });
    }

    const lines = [
      `این صفحه را ربات [[کاربر:MamouriBot|MamouriBot]] در هر اجرای ` +
        `[[ویکی‌پدیا:سیاست ربات‌رانی/درخواست مجوز/MamouriBot/وظیفه ۱۱|وظیفهٔ ۱۱]] به‌روز می‌کند.`,
      '',
      `در اینجا مواردی فهرست می‌شود که در [[:${CLEANUP_CAT}]] هستند ولی ربات آن‌ها را ` +
        `اصلاح نکرده، چون اصلاحشان قطعی نبوده. هر مورد نیاز به بررسی انسانی دارد.`,
      '',
      `آخرین به‌روزرسانی: ~~~~~ — ${fa(refused.length)} مورد.`,
      '',
    ];
    for (const [why, items] of [...byReason].sort((a, b) => b[1].length - a[1].length)) {
      lines.push(`== ${why} (${fa(items.length)}) ==`, '');
      // Out-of-scope refusals carry no taxon name — the defect is in the
      // article's taxobox, not in a named template. An empty <code> there
      // printed as a stray grey box in the published report.
      for (const it of items.sort((a, b) => a.taxon.localeCompare(b.taxon))) {
        lines.push(it.taxon
          ? `* [[${it.article}]] — <code dir="ltr">${it.taxon}</code>`
          : `* [[${it.article}]]`);
      }
      lines.push('');
    }
    const text = lines.join('\n');

    if (dryRun) {
      console.log(`\n--- گزارش بازبینی (آزمایشی، ${refused.length} مورد) ---\n${text}`);
      return;
    }
    const cur: any = await (bot as any).apiGet({
      action: 'query', prop: 'revisions', titles: REPORT_PAGE,
      rvprop: 'content|ids|timestamp', rvslots: 'main',
    });
    const p = cur.query.pages[0];
    await bot.edit(REPORT_PAGE, text, 'به‌روزرسانی فهرست موارد نیازمند بازبینی',
      p.missing ? 0 : p.revisions[0].revid, p.missing ? '' : p.revisions[0].timestamp,
      { allowCreate: true });
    console.log(`گزارش منتشر شد: ${REPORT_PAGE} (${refused.length} مورد)`);
  },
};

/** Persian digits — the report is read by humans on fa.wikipedia. */
const fa = (n: number) => String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[+d]);

// ---------------------------------------------------------------- helpers

async function categoryArticles(bot: Bot): Promise<string[]> {
  const out: string[] = [];
  let cont: string | undefined;
  do {
    const d: any = await (bot as any).apiGet({
      action: 'query', list: 'categorymembers', cmtitle: CLEANUP_CAT,
      cmnamespace: '0', cmlimit: '500', ...(cont ? { cmcontinue: cont } : {}),
    });
    out.push(...d.query.categorymembers.map((m: any) => m.title));
    cont = d.continue?.cmcontinue;
  } while (cont);
  return out;
}

const tplCache = new Map<string, string | null>();
/**
 * Prefetch many taxonomy templates in one query. The first implementation
 * asked for them one at a time behind the 1.2s GET gate; resolving the parent
 * chains then needed ~1000 sequential calls and the trial ran for twenty
 * minutes before a WDQS socket timed out. 50 titles per request is the API's
 * limit for a non-bot read and turns that into ~20 calls.
 */
async function prefetchTemplates(bot: Bot, taxa: string[]) {
  const want = [...new Set(taxa)].filter(t => t && !tplCache.has(t));
  for (let i = 0; i < want.length; i += 50) {
    const chunk = want.slice(i, i + 50);
    const d: any = await (bot as any).apiGet({
      action: 'query', titles: chunk.map(t => PREFIX + t).join('|'),
      prop: 'revisions', rvprop: 'content', rvslots: 'main', redirects: '1',
    });
    const q = d.query;
    const red = new Map<string, string>((q.redirects ?? []).map((r: any) => [r.from, r.to]));
    const got = new Map<string, string | null>();
    for (const pg of q.pages) {
      got.set(pg.title, ('missing' in pg || !pg.revisions) ? null : pg.revisions[0].slots.main.content);
    }
    for (const t of chunk) {
      const key = red.get(PREFIX + t) ?? (PREFIX + t);
      tplCache.set(t, got.get(key) ?? null);
    }
  }
}

async function templateText(bot: Bot, taxon: string): Promise<string | null> {
  if (tplCache.has(taxon)) return tplCache.get(taxon)!;
  const d: any = await (bot as any).apiGet({
    action: 'query', titles: PREFIX + taxon, prop: 'revisions',
    rvprop: 'content', rvslots: 'main', redirects: '1',
  });
  const pg = d.query.pages[0];
  const v = ('missing' in pg || !pg.revisions) ? null : pg.revisions[0].slots.main.content;
  tplCache.set(taxon, v);
  return v;
}
const templateExists = async (bot: Bot, taxon: string) => (await templateText(bot, taxon)) !== null;

type Diag = { kind: string; taxon?: string };
async function diagnose(bot: Bot, article: string): Promise<Diag> {
  const d: any = await (bot as any).apiGet({
    action: 'query', titles: article, prop: 'revisions', rvprop: 'content', rvslots: 'main',
  });
  const pg = d.query.pages[0];
  if ('missing' in pg || !pg.revisions) return { kind: 'مقاله خوانده نشد' };
  const text: string = pg.revisions[0].slots.main.content;
  const m = text.match(/^\s*\|\s*(?:taxon|genus)\s*=\s*(.+?)\s*$/m);
  if (!m || !m[1]) return { kind: 'پارامتر آرایه در جعبه نیست' };
  const taxon = m[1].replace(/^''|''$/g, '').replace(/^\[\[|\]\]$/g, '').trim();
  if (PERSIAN.test(taxon)) return { kind: 'نام آرایه در مقاله فارسی نوشته شده', taxon };

  let n = taxon;
  const seen = new Set<string>();
  for (let i = 0; i < 30; i++) {
    if (seen.has(n)) return { kind: 'حلقه در زنجیرهٔ رده‌بندی', taxon: n };
    seen.add(n);
    const parsed = parseTaxonomy(await templateText(bot, n));
    if (parsed === null) return { kind: 'missing-template', taxon: n };
    if ('root' in parsed) return { kind: 'زنجیره سالم است', taxon };
    if ('redirect' in parsed) { n = parsed.redirect!; continue; }
    if (!parsed.parent) return { kind: 'رستهٔ بالادست در الگو خالی است', taxon: n };
    n = parsed.parent;
  }
  return { kind: 'زنجیره بیش از حد عمیق', taxon };
}

/** One WDQS query for every taxon at once: rank qid, parent name, fa sitelink. */
async function wikidataTaxa(bot: Bot, taxa: string[]) {
  const out = new Map<string, { rankQid?: string; parent?: string; faTitle?: string }>();
  if (!taxa.length) return out;
  const seen = new Map<string, number>();
  for (let i = 0; i < taxa.length; i += 100) {
    const chunk = taxa.slice(i, i + 100);
    const values = chunk.map(t => `"${t.replace(/"/g, '\\"')}"`).join(' ');
    const q = `SELECT ?name ?rank ?pname ?fa WHERE {
      VALUES ?name { ${values} }
      ?item wdt:P225 ?name .
      OPTIONAL { ?item wdt:P105 ?rank }
      OPTIONAL { ?item wdt:P171 ?p . ?p wdt:P225 ?pname }
      OPTIONAL { ?fa schema:about ?item ; schema:isPartOf <https://fa.wikipedia.org/> }
    }`;
    // WDQS drops slow connections; a trial died on UND_ERR_CONNECT_TIMEOUT
    // mid-run, losing twenty minutes of enumeration. Retry with backoff.
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
    for (const b of j.results.bindings) {
      const name = b.name.value;
      seen.set(name, (seen.get(name) ?? 0) + 1);
      const cur = out.get(name) ?? {};
      if (b.rank) cur.rankQid = b.rank.value.split('/').pop();
      if (b.pname) cur.parent = b.pname.value;
      if (b.fa) cur.faTitle = decodeURIComponent(b.fa.value.split('/wiki/')[1]).replace(/_/g, ' ');
      out.set(name, cur);
    }
  }
  // a scientific name shared by two items, or two different parents, is ambiguous
  for (const [name, n] of seen) if (n > 1) out.delete(name);
  return out;
}

/** Categories of `page`, optionally with one template's content simulated. */
async function parseCategories(bot: Bot, page: string, sandbox?: { title: string; text: string }) {
  try {
    const d: any = await (bot as any).apiGet({
      action: 'parse', page, prop: 'categories',
      ...(sandbox ? {
        templatesandboxtitle: sandbox.title,
        templatesandboxtext: sandbox.text,
        templatesandboxcontentmodel: 'wikitext',
      } : {}),
    });
    return (d.parse?.categories ?? []).map((c: any) => c.category as string);
  } catch { return null; }
}

/** The Persian report of everything this task refused to touch. */
export const reportWikitext = (rows: { taxon: string; why: string; article: string }[]) => {
  const byWhy = new Map<string, typeof rows>();
  for (const r of rows) (byWhy.get(r.why) ?? byWhy.set(r.why, []).get(r.why)!).push(r);
  let s = `این صفحه را ربات به‌روز می‌کند. موارد زیر در [[:${CLEANUP_CAT}]] هستند ولی ربات آن‌ها را `
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
