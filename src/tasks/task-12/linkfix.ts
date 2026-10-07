/**
 * وظیفهٔ ۱۲ — repair links the mass imports left in English.
 *
 *   npx tsx src/run.ts linkfix --limit 20                     # dry run
 *   TARGET_TRANSCLUDING='الگو:…' npx tsx src/run.ts linkfix
 *   npx tsx src/run.ts linkfix --live --as-me --limit 30
 *
 * NOT APPROVED YET. The permission request is drafted at
 * `drafts/brfa-mamouribot-linkfix.wiki` in the companion repo and has not been filed, so
 * until it is, this runs as the human operator (`--as-me`) and not as the bot. The three
 * defect classes, the measurements and the BRFA argument are in
 * `research/english-link-sweep-automation.md`.
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
import {
  REVIEW, Resolver, loadNames, mediawikiFaExists, mediawikiLookup,
  type Names, type Resolution,
} from './resolve.js';

const SUMMARY = 'فارسی‌سازی پیوندهای انگلیسی و اصلاح پیوندهای سرخ';

/** Filled by getTargets, consumed by the pure transform. */
let RESOLUTIONS = new Map<string, Resolution>();
let NAMES: Names = loadNames();
/** target -> why it needs a human, plus where it was seen. The worklist. */
const REVIEW_LIST = new Map<string, { reason: string; pages: string[] }>();
const KIND_COUNTS: Record<string, number> = {};

/** Candidate pages, from whichever selector the operator gave. */
async function candidatePages(bot: Bot): Promise<string[]> {
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
        tilimit: '500', tinamespace: '0', ...(cont ? { ticontinue: cont } : {}) });
      for (const p of d.query?.pages?.[0]?.transcludedin ?? []) titles.push(p.title);
      cont = d.continue?.ticontinue;
    } while (cont);
  }

  for (const cat of (process.env.TARGET_CATEGORY ?? '').split('|').map(s => s.trim()).filter(Boolean)) {
    let cont: string | undefined;
    do {
      const d = await bot.apiGet({ action: 'query', list: 'categorymembers', cmtitle: cat,
        cmlimit: '500', cmnamespace: '0', ...(cont ? { cmcontinue: cont } : {}) });
      for (const p of d.query?.categorymembers ?? []) titles.push(p.title);
      cont = d.continue?.cmcontinue;
    } while (cont);
  }
  return [...new Set(titles)];
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
  description: 'فارسی‌سازی پیوندهایی که از واردسازی انبوه به انگلیسی مانده‌اند: '
    + 'پیوند به مقالهٔ فارسی اگر باشد، وگرنه پیوند بیان‌ویکی با برچسب فارسی، وگرنه متن فارسی بی‌پیوند. '
    + 'ربات هرگز نام فارسی نمی‌سازد؛ هر مورد بی‌نام برای بازبینی انسانی گزارش می‌شود.',

  async getTargets(bot: Bot): Promise<string[]> {
    NAMES = loadNames();
    RESOLUTIONS = new Map();
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
    for (const [title, text] of src) {
      const fs = scan(text);
      findings.set(title, fs);
      for (const f of fs) {
        KIND_COUNTS[f.kind] = (KIND_COUNTS[f.kind] ?? 0) + 1;
        // latin_display is counted, never resolved: it is not repaired at all.
        if (f.kind !== 'latin_display') targets.add(f.target);
      }
    }
    console.log(`${targets.size} هدف یکتا برای تصمیم‌گیری`);
    console.log(`شمار یافته‌ها بر پایهٔ گونه: ${JSON.stringify(KIND_COUNTS)}`);
    if (!targets.size) return [];

    const resolver = new Resolver(
      mediawikiLookup({ apiGet: p => bot.apiGetOn(EN_API, p) }),
      NAMES,
      mediawikiFaExists({ apiGet: p => bot.apiGet(p) }),
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
      const { applied, deferred } = applyResolutions(text, RESOLUTIONS, NAMES);
      for (const t of deferred) {
        const row = REVIEW_LIST.get(t)
          ?? { reason: RESOLUTIONS.get(t)?.reason ?? 'نامشخص', pages: [] };
        row.pages.push(title);
        REVIEW_LIST.set(t, row);
      }
      if (applied) work.push(title);
    }
    console.log(`${work.length} صفحه برای ویرایش؛ ${REVIEW_LIST.size} هدف نیازمند نام فارسی`);
    return work;
  },

  transform(text: string, title: string) {
    const { text: out, applied } = applyResolutions(text, RESOLUTIONS, NAMES);
    if (!applied) return { text, changed: false, note: 'موردی برای اعمال نبود' };
    const { introduced } = gateDiff(title, text, out);
    if (introduced.length) {
      // Reported as no-change rather than thrown: one page failing its gate must not end
      // a batch, and the inherited defects on these pages are counted separately.
      return { text, changed: false, manualReview: true,
        note: `دروازه رد کرد: ${introduced.join('؛ ')}` };
    }
    return { text: out, changed: true, note: `${applied} پیوند` };
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

/** Exported for the tests, which drive the pure half with a fixed resolution map. */
export function __setResolutionsForTest(res: Map<string, Resolution>, names: Names) {
  RESOLUTIONS = res; NAMES = names;
}
export { REVIEW, contentRedLinks };
