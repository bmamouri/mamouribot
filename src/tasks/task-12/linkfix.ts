/**
 * وظیفهٔ ۱۲ — repair links the mass imports left in English.
 *
 *   npx tsx src/run.ts linkfix --limit 20                     # dry run
 *   TARGET_TRANSCLUDING='الگو:…' npx tsx src/run.ts linkfix
 *   npx tsx src/run.ts linkfix --live --as-me --limit 30
 *
 * APPROVED ۹ اکتبر ۲۰۲۶ for the scope in the request. The extension (red links whose fa
 * article exists under another name: citation labels kept, same-subject en redirects,
 * {{پیوند با میان‌ویکی}}/{{بت}}, CS1 *-link parameters, template namespace) is NOT yet
 * approved, so it runs `--as-me` until the follow-up on the request is answered. See
 * docs/task-12-linkfix.md § Extension.
 *
 * | kind | example | repair |
 * |---|---|---|
 * | `latin_target`         | `[[Antelope Valley]]`  | fa article if one exists, else `[[:en:Antelope Valley|دره آنتلوپ]]` |
 * | `persian_digit_target` | `[[Area code ۳۲۳]]`    | remap to the Latin twin, then as above |
 * | `latin_display`        | `[[منطقه زمانی اقیانوس آرام|PST]]` | **counted only**, never rewritten |
 *
 * `latin_display` is reported and never repaired: 13,204 articles carry it and the right
 * label is an editorial choice per row — `PST` may well want to stay a symbol, see
 * lessons/persian-conventions/units-persian-name-latin-symbol-bdi.md.
 *
 * WHY THE RESOLUTION HAPPENS IN getTargets()
 * ------------------------------------------
 * The framework's `transform(text, title)` is synchronous and per page, but deciding what
 * a link should become needs the network (en langlinks, then an fa existence check) and
 * is only efficient in bulk: one `prop=langlinks` request covers 40 targets shared across
 * dozens of articles. So `getTargets` — which is async and runs first — reads every
 * candidate page, scans it, resolves every distinct target once, caches the answers, and
 * returns only the pages that have at least one applicable repair. `transform` is then
 * pure, which is also what makes it testable offline.
 *
 * Ported from the Python `scripts/linkfix/`, which this replaces.
 */
import { EN_API, type Bot, type BotTask } from '../../core.js';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import { scan } from './detect.js';
import { applyResolutions, gateDiff } from './rewrite.js';
import { applyTemplates, parseInterwikiCalls, scanCiteLinks } from './templates.js';
import { linkContext } from '../../lib/gates.js';
import {
  REVIEW, Resolver, loadNames, mediawikiFaExists, mediawikiFaInfo, mediawikiLookup,
  type Names, type Resolution,
} from './resolve.js';

const SUMMARY = 'فارسی‌سازی پیوندهای انگلیسی و اصلاح پیوندهای سرخ';
const SUMMARY_BT = 'اصلاح پیوندهای سرخ به مقاله‌های موجود و جایگزینی الگوی بت با الگوی پیوند با میان‌ویکی';

/** Filled by getTargets, consumed by the pure transform. */
let RESOLUTIONS = new Map<string, Resolution>();
let NAMES: Names = loadNames();
/** fa titles named by {{پیوند با میان‌ویکی}}/{{بت}} calls that exist (the call is already blue). */
let FA_LIVE = new Set<string>();
/**
 * Whether the NEW scope runs: same-subject en redirects, {{پیوند با میان‌ویکی}}/{{بت}}
 * calls, CS1 *-link parameters, and template namespace. It is not approved for the bot
 * yet, so it runs only as the operator (`--as-me`), in a dry run, or once
 * `LINKFIX_EXTENSION=1` is set after the follow-up is answered. The corrections that only
 * make an edit SMALLER or SAFER (kept citation labels, disambiguation and Wikidata-item
 * checks, project-namespace and <nowiki> skips, English-prose deferral, the count-based
 * gate) are always on.
 */
let EXTENSION = false;
/** Pages whose edit also converts {{بت}}: their summary has to say so. */
const CONVERTS_BT = new Set<string>();
/** target -> why it needs a human, plus where it was seen. The worklist. */
const REVIEW_LIST = new Map<string, { reason: string; pages: string[] }>();
const KIND_COUNTS: Record<string, number> = {};

/**
 * Namespaces the transclusion/category selectors read: `0` by default, `10` added by
 * extension ۶ (`TARGET_NAMESPACE=0|10`). A navbox link fixed once is fixed on every
 * article that carries the navbox.
 */
const namespaces = () => (process.env.TARGET_NAMESPACE ?? '0').split('|').map(s => s.trim())
  .filter(s => s === '0' || s === '10').join('|') || '0';

/**
 * Template subpages that are not the template: its documentation, which shows example
 * calls on purpose, and its sandboxes and test cases, which belong to whoever is editing them.
 */
const NOT_A_TEMPLATE = /^الگو:.*\/(?:توضیحات|تمرین|آزمایشی|آزمایش|doc|sandbox|testcases)(?:\/|$)/;

/** Candidate pages, from whichever selector the operator gave. */
export async function candidatePages(bot: Bot): Promise<string[]> {
  const titles = await candidatePagesRaw(bot, EXTENSION ? namespaces() : '0');
  if (!titles.length) return [];
  // The namespace comes from the API, not from the title's shape: «لیگ عدالت: نفرین» is
  // an article with a colon in it.
  const ns = new Map<string, number>();
  for (let i = 0; i < titles.length; i += 50) {
    const d = await bot.apiGet({ action: 'query', prop: 'info', titles: titles.slice(i, i + 50).join('|') });
    for (const p of d.query?.pages ?? []) ns.set(p.title, p.ns);
  }
  const allowed = new Set((EXTENSION ? namespaces() : '0').split('|').map(Number));
  return titles.filter(t => allowed.has(ns.get(t) ?? -1) && !NOT_A_TEMPLATE.test(t));
}

async function candidatePagesRaw(bot: Bot, ns: string): Promise<string[]> {
  const titles: string[] = [];
  const explicit = (process.env.TARGET_TITLES ?? '').split('|').map(s => s.trim()).filter(Boolean);
  titles.push(...explicit);

  // A JSON list of titles. The Python version needed this because the shell mangles
  // Persian titles passed as arguments, and a 30-page run became 41 pages during testing.
  const file = process.env.TARGET_FILE;
  if (file && existsSync(file)) {
    const raw = readFileSync(file, 'utf8').trim();
    titles.push(...(raw.startsWith('[')
      ? JSON.parse(raw) as string[]
      : raw.split('\n').map(s => s.trim()).filter(Boolean)));
  }

  for (const tpl of (process.env.TARGET_TRANSCLUDING ?? '').split('|').map(s => s.trim()).filter(Boolean)) {
    let cont: string | undefined;
    do {
      const d = await bot.apiGet({ action: 'query', prop: 'transcludedin', titles: tpl,
        tilimit: '500', tinamespace: ns, ...(cont ? { ticontinue: cont } : {}) });
      for (const p of d.query?.pages?.[0]?.transcludedin ?? []) titles.push(p.title);
      cont = d.continue?.ticontinue;
    } while (cont);
  }

  for (const cat of (process.env.TARGET_CATEGORY ?? '').split('|').map(s => s.trim()).filter(Boolean)) {
    let cont: string | undefined;
    do {
      const d = await bot.apiGet({ action: 'query', list: 'categorymembers', cmtitle: cat,
        cmlimit: '500', cmnamespace: ns, ...(cont ? { cmcontinue: cont } : {}) });
      for (const p of d.query?.categorymembers ?? []) titles.push(p.title);
      cont = d.continue?.cmcontinue;
    } while (cont);
  }
  // CirrusSearch queries, `||`-separated. Each one is read in random order, so a scheduled
  // run looks at a different sample of the same population every day.
  const cap = Number(process.env.TARGET_CAP ?? '0') || Infinity;
  for (const q of (process.env.TARGET_SEARCH ?? '').split('||').map(s => s.trim()).filter(Boolean)) {
    let offset = 0;
    while (titles.length < cap && offset < 9500) {
      const d = await bot.apiGet({ action: 'query', list: 'search', srsearch: q, srnamespace: ns,
        srlimit: '500', srsort: 'random', sroffset: String(offset), srinfo: '', srprop: '' });
      const got = (d.query?.search ?? []).map((p: any) => p.title as string);
      titles.push(...got);
      if (!got.length || d.continue?.sroffset === undefined) break;
      offset = d.continue.sroffset;
    }
  }
  const uniq = [...new Set(titles)];
  return Number.isFinite(cap) ? uniq.slice(0, cap) : uniq;
}

async function fetchSources(bot: Bot, titles: string[]): Promise<Map<string, string>> {
  const src = new Map<string, string>();
  for (let i = 0; i < titles.length; i += 50) {
    const d = await bot.apiGet({ action: 'query', prop: 'revisions', rvprop: 'content',
      rvslots: 'main', titles: titles.slice(i, i + 50).join('|') });
    for (const p of d.query?.pages ?? []) {
      const text = p.revisions?.[0]?.slots?.main?.content;
      if (typeof text === 'string') src.set(p.title, text);
    }
  }
  return src;
}

/**
 * No `:en:` link may point at a page that does not exist, because an interwiki to a
 * missing page renders BLUE and lies. `:en:San Pedro station` pointed at a station in the
 * Philippines; nothing on the fa page looked wrong.
 */
async function unverifiedEnTargets(bot: Bot, resolutions: Map<string, Resolution>): Promise<string[]> {
  const targets = [...new Set([...resolutions.values()]
    .filter(r => r.kind === 'en' && r.link).map(r => r.link!))].sort();
  const bad: string[] = [];
  for (let i = 0; i < targets.length; i += 40) {
    const chunk = targets.slice(i, i + 40);
    const d = await bot.apiGetOn(EN_API, { action: 'query', prop: 'info', redirects: '1',
      titles: chunk.join('|') });
    const q = d.query ?? {};
    const norm = new Map<string, string>((q.normalized ?? []).map((x: any) => [x.from, x.to]));
    const red = new Map<string, string>((q.redirects ?? []).map((x: any) => [x.from, x.to]));
    const live = new Set<string>((q.pages ?? []).filter((p: any) => !p.missing).map((p: any) => p.title));
    for (const t of chunk) {
      const n = norm.get(t) ?? t;
      if (!live.has(red.get(n) ?? n)) bad.push(t);
    }
  }
  return bad;
}

/** Content red links in a rendered page, excluding template chrome. */
function contentRedLinks(html: string): string[] {
  const reds = [...html.matchAll(/<a href="\/w\/index\.php\?title=([^"&]+)[^"]*" class="new"/g)]
    .map(m => m[1]);
  // Navbar talk links («بحث …») are template furniture, not article content.
  return reds.filter(r => !r.startsWith('%D8%A8%D8%AD%D8%AB'));
}

export const linkfixTask: BotTask = {
  id: 'linkfix',
  taskNumber: 12,
  summary: SUMMARY,
  // Every diff carrying a {{بت}} conversion says so, so a reader of the summary is not
  // surprised by a template swap the link repair alone would not explain.
  perPageSummary: (title: string) => CONVERTS_BT.has(title) ? SUMMARY_BT : undefined,
  description: 'فارسی‌سازی پیوندهایی که از واردسازی انبوه به انگلیسی مانده‌اند: '
    + 'پیوند به مقالهٔ فارسی اگر باشد، وگرنه پیوند بیان‌ویکی با برچسب فارسی، وگرنه متن فارسی بی‌پیوند. '
    + 'ربات هرگز نام فارسی نمی‌سازد؛ هر مورد بی‌نام برای بازبینی انسانی گزارش می‌شود.',

  async getTargets(bot: Bot): Promise<string[]> {
    NAMES = loadNames();
    RESOLUTIONS = new Map();
    // A dry run previews the extension unless LINKFIX_EXTENSION=0 asks to see exactly what
    // the bot would do under the approved scope.
    EXTENSION = process.env.LINKFIX_EXTENSION === '1' || bot.opts.identity === 'human'
      || (bot.opts.dryRun && process.env.LINKFIX_EXTENSION !== '0');
    if (!EXTENSION) console.log('دامنهٔ گسترش‌یافته خاموش است (فقط --as-me یا LINKFIX_EXTENSION=1)');
    REVIEW_LIST.clear();

    const candidates = await candidatePages(bot);
    if (!candidates.length) {
      console.log('هیچ صفحه‌ای داده نشد. TARGET_TITLES یا TARGET_FILE یا '
        + 'TARGET_TRANSCLUDING یا TARGET_CATEGORY را تنظیم کنید.');
      return [];
    }
    const src = await fetchSources(bot, candidates);
    console.log(`${src.size} صفحه خوانده شد`);

    const findings = new Map<string, ReturnType<typeof scan>>();
    const targets = new Set<string>();
    const callFa = new Set<string>();
    const count = (k: string) => { KIND_COUNTS[k] = (KIND_COUNTS[k] ?? 0) + 1; };
    for (const [title, text] of src) {
      const fs = scan(text);
      findings.set(title, fs);
      for (const f of fs) {
        count(f.kind);
        // latin_display is counted, never resolved: it is not repaired at all.
        if (f.kind !== 'latin_display') targets.add(f.target);
      }
      for (const c of EXTENSION ? parseInterwikiCalls(text) : []) {
        count(`${c.kind}_call`);
        if (c.fa) callFa.add(c.fa);
        if (c.problem) continue;
        targets.add(c.foreign);
        // A Latin first argument is resolved too, so a call whose two titles disagree
        // can be told apart from one whose «fa» title is just the en title again.
        if (!/[؀-ۿ]/.test(c.fa)) targets.add(c.fa);
      }
      for (const l of EXTENSION ? scanCiteLinks(text) : []) { count('cite_link_param'); targets.add(l.value); }
    }
    console.log(`${targets.size} هدف یکتا برای تصمیم‌گیری`);
    console.log(`شمار یافته‌ها بر پایهٔ گونه: ${JSON.stringify(KIND_COUNTS)}`);
    if (!targets.size) return [];
    FA_LIVE = await mediawikiFaExists({ apiGet: p => bot.apiGet(p) })(
      [...new Set([...callFa, ...targets])].sort());

    const resolver = new Resolver(
      mediawikiLookup({ apiGet: p => bot.apiGetOn(EN_API, p) }),
      NAMES,
      mediawikiFaExists({ apiGet: p => bot.apiGet(p) }),
      mediawikiFaInfo({ apiGet: p => bot.apiGet(p) }),
      EXTENSION,
    );
    RESOLUTIONS = await resolver.resolveMany([...targets].sort());

    const bad = await unverifiedEnTargets(bot, RESOLUTIONS);
    if (bad.length) {
      // Fatal on purpose: a blue link that lies is worse than the red link it replaced,
      // and one bad target means the resolution data is wrong, not just this page.
      throw new Error(`هدف‌های :en: که روی en وجود ندارند: ${bad.join(', ')}`);
    }

    // Which pages actually have an applicable repair, and record the rest for the human.
    const work: string[] = [];
    for (const [title, text] of src) {
      const { applied, deferred, templates } = repairPage(text);
      for (const t of deferred) {
        const row = REVIEW_LIST.get(t)
          ?? { reason: RESOLUTIONS.get(t)?.reason ?? 'نامشخص', pages: [] };
        row.pages.push(title);
        REVIEW_LIST.set(t, row);
      }
      for (const raw of templates.deferred) {
        const row = REVIEW_LIST.get(raw) ?? { reason: 'template call needs a human', pages: [] };
        row.pages.push(title);
        REVIEW_LIST.set(raw, row);
      }
      if (applied) work.push(title);
    }
    console.log(`${work.length} صفحه برای ویرایش؛ ${REVIEW_LIST.size} هدف نیازمند نام فارسی`);
    return work;
  },

  transform(text: string, title: string) {
    const { text: out, applied, templates } = repairPage(text);
    if (!applied) return { text, changed: false, note: 'موردی برای اعمال نبود' };
    if (templates.converted) CONVERTS_BT.add(title); else CONVERTS_BT.delete(title);
    const { introduced } = gateDiff(title, text, out);
    if (introduced.length) {
      // Reported as no-change rather than thrown: one page failing its gate must not end
      // a batch, and the inherited defects on these pages are counted separately.
      return { text, changed: false, manualReview: true,
        note: `دروازه رد کرد: ${introduced.join('؛ ')}` };
    }
    return { text: out, changed: true,
      note: `${applied} پیوند${templates.converted ? `، ${templates.converted} بت→پبم` : ''}` };
  },

  /**
   * Refuse the edit if it would ADD a content red link.
   *
   * This is the task's whole risk: every repair either re-points a link or unlinks it, so
   * a wrong Persian title turns a working English link into a red one, and nothing else
   * in the pipeline notices — `countErrorMarkers` in core.ts counts CS1 and Lua errors,
   * and a red link is neither.
   *
   * It runs PRE-save, which is a deliberate difference from the Python version: that one
   * wrote the page, re-rendered it, and aborted the run if the count had risen — leaving
   * the bad edit live on the article it had just damaged.
   */
  async verify(bot: Bot, title: string, oldText: string, newText: string) {
    const render = async (text?: string) => {
      const p: Record<string, string> = { action: 'parse', prop: 'text', disablelimitreport: '1' };
      const r = text === undefined
        ? await bot.apiGet({ ...p, page: title })
        : await bot.apiPost({ ...p, title, text, contentmodel: 'wikitext' });
      return (r.parse?.text ?? '') as string;
    };
    const [beforeHtml, afterHtml] = [await render(), await render(newText)];
    const before = contentRedLinks(beforeHtml), after = contentRedLinks(afterHtml);
    if (after.length > before.length) {
      const fresh = after.filter(r => !before.includes(r)).slice(0, 5)
        .map(r => decodeURIComponent(r.replace(/_/g, ' ')));
      return { ok: false, detail: `پیوند سرخ افزود (${before.length}→${after.length}): ${fresh.join('، ')}` };
    }
    return { ok: true, detail: '' };
  },

  /**
   * The worklist a human fills into `data/names.json` before the next run.
   *
   * Written to disk rather than published on-wiki. The bot/human loop this task depends on
   * is "bot reports what it cannot name, human adds names, bot runs again", and until the
   * permission request is filed there is no agreed on-wiki home for that list. Creating
   * one unasked would also mean another cumulative report page to keep from overwriting
   * itself, which وظیفهٔ ۳ has already shown is easy to get wrong.
   */
  async report(_bot: Bot, _dryRun: boolean) {
    const path = process.env.LINKFIX_REPORT
      ?? `${process.env.BOT_STATE_DIR ?? '.state'}/linkfix-review.json`;
    const review = Object.fromEntries([...REVIEW_LIST.entries()].sort(([a], [b]) => a.localeCompare(b)));
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify({
      generated: new Date().toISOString(),
      by_kind: KIND_COUNTS,
      review_count: REVIEW_LIST.size,
      review,
    }, null, 1));
    console.log(`فهرست نیازمند نام فارسی: ${REVIEW_LIST.size} هدف — ${path}`);
    for (const [t, v] of [...REVIEW_LIST].slice(0, 15)) {
      console.log(`    ${t}: ${v.reason}`);
    }
  },
};

/**
 * Every repair on one page: wikilinks first, then template calls and citation link
 * parameters on the result. `applied` counts real repairs only — a `{{بت}}` conversion is
 * never a reason to edit a page, it only rides along on one that is being edited anyway.
 */
export function repairPage(text: string) {
  const links = applyResolutions(text, RESOLUTIONS, NAMES);
  if (!EXTENSION) {
    return { text: links.text, applied: links.applied, deferred: links.deferred,
      templates: { text: links.text, applied: 0, converted: 0, deferred: [] as string[] } };
  }
  const spans = linkContext(links.text).foreign;
  const templates = applyTemplates(links.text, RESOLUTIONS, FA_LIVE, spans,
    links.applied ? 'always' : 'if-repaired');
  return { text: templates.text, applied: links.applied + templates.applied,
    deferred: links.deferred, templates };
}

/** Exported for the tests, which drive the pure half with a fixed resolution map. */
export function __setResolutionsForTest(res: Map<string, Resolution>, names: Names,
                                        faLive = new Set<string>(), extension = true) {
  RESOLUTIONS = res; NAMES = names; FA_LIVE = faLive; EXTENSION = extension;
}
export { REVIEW, contentRedLinks };
