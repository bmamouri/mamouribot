/**
 * وظیفهٔ ۱۵ — source maintenance banners: add one when the article plainly has no
 * sources, and remove one that has gone stale.
 *
 * The plan, the measurements behind it and every decision the operator made are in
 * `docs/task-15-source-tags.md`. The rules live in `decide.ts`, the wikitext surgery in
 * `banners.ts` and the source detector in `source-detect.ts`; this file is the networked
 * shell around them.
 *
 * WHY ALL THE NETWORK WORK IS IN getTargets. `transform` must be pure and synchronous
 * (`docs/BUILDING-A-TASK.md` §2), and this task's decision needs the RENDER of the page:
 * §3.0 is explicit that the wikitext alone cannot be trusted, because infoboxes pull
 * Wikidata references and authority-control templates emit URLs. So every page is
 * rendered, measured and cached here, and `transform` is a lookup plus pure rules.
 *
 * RUNNING: **approved** ۱۲ اکتبر ۲۰۲۶ ({{مجوز دارد}}, Huji), so this runs as MamouriBot
 * — no `--as-me`. The request promises روزانه با سقف ۲۰۰ ویرایش, which is enforced by the
 * `--limit` in `toolforge/task-15-source-tags/jobs.yaml`, not in this file.
 *
 * Decision 8 (`--as-me` only) applied to the pre-approval trial and no longer holds.
 *
 *   npx tsx src/run.ts source-tags --limit 20            # dry run, read every diff
 *   npx tsx src/run.ts source-tags --live --limit 25 --delay 15
 */
import { readFileSync } from 'fs';
import type { Bot, BotTask } from '../../core.js';
import { checkWikitext } from '../../lib/gates.js';
import { extractProse, countWords } from '../task-10/destub-classify.js';
import {
  decide, summaryFor, hasSourceBanner, STALE_NAMES, type Decision, type PageFacts,
} from './decide.js';
import {
  addBanner, removeStaleTag, monthStamp, BANNERS, REPORT_PAGE, type BannerName,
} from './banners.js';

/** Authority-control and wiki hosts, which are not sources (§12.1). */
const NOT_A_SOURCE_HOST =
  /(wikidata\.org|wikimedia\.org|wikipedia\.org|wikisource\.org|wiktionary\.org|geohack|toolforge|wmflabs|viaf\.org|d-nb\.info|id\.loc\.gov|isni|orcid|worldcat\.org\/identities|idref|bnf\.fr|catalogo\.bne|nla\.gov\.au|snaccooperative|nkp\.cz|nlg\.gr|ndl\.go\.jp|nukat|kb\.nl|nli\.org|libris|trove|musicbrainz|openstreetmap|geonames|bibliotheken\.nl|nsk\.hr|kulturnav|google\.com\/search|books\.google|scholar\.google)/i;

/**
 * References in rendered HTML.
 *
 * NOT a plain match on `id="cite_note-`, which §12.1 specifies and which silently counts
 * **zero on every page**: MediaWiki escapes the underscore in id attributes, so the
 * markup is `id="cite&#95;note-1"`. «جنگ کره» renders 46 references and matched none.
 *
 * That failure was invisible and one-directional. Stale removals were merely refused
 * (safe), but on the add path it disabled the render's second opinion about references
 * entirely — the check that exists to catch a reference the wikitext scan missed — while
 * the external-link half kept working and made the guard look alive.
 */
export function countRenderedRefs(html: string): number {
  return (html.replace(/&#0*95;/g, '_').match(/id="cite_note-/g) ?? []).length;
}

/** Render-error markers, counted so a before/after comparison is possible. */
export function errorMarkers(html: string): number {
  return (html.match(/scribunto-error|class="[^"]*\berror\b/g) ?? []).length;
}

/** The render of an arbitrary wikitext, for the before half of that comparison. */
async function renderOf(bot: Bot, title: string, text: string): Promise<string> {
  const r = await bot.apiPost({
    action: 'parse', title, text, contentmodel: 'wikitext',
    prop: 'text', disablelimitreport: '1',
  });
  return String(r.parse?.text ?? '');
}

/** Searches that find candidates. Counts are from §0.5, measured ۱۰ اکتبر ۲۰۲۶. */
const QUERIES = {
  add: '-insource:"<ref" -insource:"http" -hastemplate:"بدون منبع" ' +
       '-hastemplate:"جعبه اطلاعات روستای ایران" -intitle:فهرست',
  stale: 'hastemplate:"بدون منبع" insource:"<ref"',
};

interface Refusal { title: string; why: string; kind: string }

const facts = new Map<string, PageFacts>();
const decisions = new Map<string, Decision>();
const refusals: Refusal[] = [];
const done: { title: string; what: string }[] = [];

/** Deterministic shuffle, so a run is not fifty footballers in a row (§7). */
function shuffle<T>(rows: T[], seed = 20261012): T[] {
  let s = seed;
  const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const out = [...rows];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** CirrusSearch, stopping before the offset-10,000 hard error (§0.5). */
async function search(bot: Bot, srsearch: string, want: number): Promise<string[]> {
  const titles: string[] = [];
  for (let offset = 0; titles.length < want && offset < 10000; offset += 50) {
    const r = await bot.apiGet({
      action: 'query', list: 'search', srsearch, srnamespace: '0',
      srlimit: '50', sroffset: String(offset), srprop: '',
    });
    const hits = r.query?.search ?? [];
    if (!hits.length) break;
    titles.push(...hits.map((h: { title: string }) => h.title));
  }
  // Offset paging over a live index REPEATS titles: each page is a fresh query against an
  // index that has moved, so a title can fall into two windows. The first dry run on
  // Toolforge returned «هنرمند بازی ویدئویی» twice in ten targets, which would have
  // appended two {{بدون منبع}} banners to it.
  return [...new Set(titles)];
}

/**
 * Make sure each banner's monthly category exists, creating it when it does not, and
 * report which ones are now usable (§5).
 *
 * WHY THE BOT CREATES THEM. `پودمان:Message box` builds `<base> از <month year>` and
 * files the article in `رده:مقاله‌های دارای پارامتر تاریخ نادرست در الگو` when that page
 * is absent. The first version of this task dodged that by writing no date at all, which
 * is safe but throws away the thing the date is for: the dated categories are how an
 * editor sees how long an article has carried a problem. On en a bot creates these
 * monthly categories; fa has none, so the months simply stop
 * (`lessons/tracking-categories/dated-maintenance-cat-missing-monthly-cats.md` — "the
 * bulk fix is creating the missing monthly categories, not editing articles").
 *
 * The page body is one line. `{{رده تمیزکاری ماهانه}}` derives the parent, the month,
 * the hidden flag and the all-articles category from the title, identically for every
 * base — verified against all four of this task's bases before the first was created.
 *
 * Granularity is MONTH, not day: «اکتبر ۲۰۲۶». Twelve pages per base per year.
 */
async function ensureMonthlyCategories(bot: Bot): Promise<Partial<Record<BannerName, boolean>>> {
  const stamp = monthStamp();
  const want = (Object.keys(BANNERS) as BannerName[])
    .map(b => ({ banner: b, title: `رده:${BANNERS[b].category} از ${stamp}` }));
  const r = await bot.apiGet({
    action: 'query', prop: 'info', titles: want.map(x => x.title).join('|'),
  });
  const missing = new Set<string>(
    (r.query?.pages ?? []).filter((p: { missing?: boolean }) => p.missing)
      .map((p: { title: string }) => p.title));

  const out: Partial<Record<BannerName, boolean>> = {};
  for (const { banner, title } of want) {
    if (!missing.has(title)) { out[banner] = true; continue; }
    if (bot.opts.dryRun) {
      console.log(`  (آزمایشی) ردهٔ «${title}» ساخته می‌شد`);
      out[banner] = false;            // a dry run must not pretend it exists
      continue;
    }
    try {
      await bot.edit(title, '{{رده تمیزکاری ماهانه}}', 'ایجاد ردهٔ ماهانهٔ تمیزکاری',
        0, '', { allowCreate: true });
      console.log(`  ردهٔ «${title}» ساخته شد`);
      out[banner] = true;
    } catch (e) {
      console.warn(`  ⚠ ردهٔ «${title}» ساخته نشد: ${(e as Error).message}`);
      out[banner] = false;            // fall back to writing no date
    }
  }
  console.log(`رده‌های ماهانهٔ «${stamp}»: ` +
    Object.entries(out).map(([k, v]) => `${k}=${v ? 'آماده' : 'نه'}`).join('، '));
  return out;
}

/**
 * The cheap half of the facts: one batched query for up to 50 titles, no rendering.
 *
 * Split from the render because rendering is what costs. A 100-edit run walks several
 * hundred candidates, and most are rejected on something this call already knows — the
 * page is a dab, it is an Iranian village, it was edited yesterday. Rendering those
 * first meant ~2.4 s of API gate per candidate and a silent half-hour before the first
 * edit, which is how the 100-edit trial run began.
 */
async function gatherCheap(bot: Bot, titles: string[], dated: Partial<Record<BannerName, boolean>>):
Promise<Map<string, PageFacts>> {
  const out = new Map<string, PageFacts>();
  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50);
    const q = await bot.apiGet({
      action: 'query', titles: batch.join('|'),
      prop: 'info|pageprops|categories|revisions|templates',
      cllimit: 'max', tllimit: 'max', tltemplates: 'الگو:جعبه اطلاعات روستای ایران',
      rvprop: 'timestamp', rvslots: 'main',
    });
    for (const p of q.query?.pages ?? []) {
      if (p.missing) continue;
      const ts = p.revisions?.[0]?.timestamp;
      out.set(p.title, {
        renderedRefs: 0, foreignLinks: 0, renderFailed: true,   // until rendered
        isRedirect: p.redirect !== undefined,
        isDab: (p.pageprops ?? {}).disambiguation !== undefined,
        isBlp: (p.categories ?? []).some((c: { title: string }) => c.title === 'رده:افراد زنده'),
        hasVillageInfobox: (p.templates ?? []).length > 0,
        daysSinceEdit: ts ? (Date.now() - Date.parse(ts)) / 86_400_000 : Infinity,
        proseWords: 0,
        datedCategoryExists: dated,
      });
    }
  }
  return out;
}

/** The render, and the two measurements only it can give. Called per page, so sparingly. */
async function gatherRender(bot: Bot, title: string, f: PageFacts): Promise<PageFacts> {
  try {
    const r = await bot.apiGet({
      action: 'parse', page: title, prop: 'text|externallinks', disablelimitreport: '1',
    });
    const html = String(r.parse?.text ?? '');
    const ex = extractProse(html);
    return {
      ...f,
      renderFailed: false,
      renderedRefs: countRenderedRefs(html),
      foreignLinks: (r.parse?.externallinks ?? [])
        .filter((u: string) => !NOT_A_SOURCE_HOST.test(u)).length,
      proseWords: countWords(ex.proseText).total,
    };
  } catch {
    return { ...f, renderFailed: true };
  }
}

/**
 * Would this page be refused whatever the render says?
 *
 * Only reasons that cannot change with rendering belong here; anything that depends on
 * `renderedRefs`, `foreignLinks` or `proseWords` must stay in `decide`, or the screen
 * would start making decisions of its own.
 */
function rejectedWithoutRendering(text: string, title: string, f: PageFacts): string | null {
  const d = decide(text, title, { ...f, renderFailed: false, renderedRefs: 0, foreignLinks: 0,
    proseWords: Number.MAX_SAFE_INTEGER });
  // A render-dependent verdict is not a rejection; let it through to be rendered.
  if (d.act === 'skip' && !/نمایش/.test(d.why)) return d.why;
  return null;
}

async function getTargets(bot: Bot): Promise<string[]> {
  const explicit = (process.env.TARGET_TITLES ?? '').split('|').map(s => s.trim()).filter(Boolean);
  const fromFile = process.env.TARGET_FILE
    ? (() => {
      const raw = readFileSync(process.env.TARGET_FILE!, 'utf8').trim();
      return raw.startsWith('[') ? JSON.parse(raw) as string[] : raw.split('\n').map(s => s.trim());
    })().filter(Boolean)
    : [];

  const limit = bot.opts.limit || 20;
  const cap = Number(process.env.TARGET_CAP ?? 0) || Math.max(limit * 6, 60);

  let candidates = [...explicit, ...fromFile];
  if (!candidates.length) {
    // Both populations in one run (decision 3: no phases). The stale-removal set is
    // small and finite, so it is taken whole and the rest of the budget goes to adds.
    const stale = await search(bot, QUERIES.stale, Math.ceil(cap / 3));
    const adds = await search(bot, QUERIES.add, cap);
    console.log(`نامزدها: ${adds.length} برای افزودن، ${stale.length} برای برداشتن برچسب کهنه`);
    // Deduped across the two searches as well: a title can match both.
    candidates = shuffle([...new Set([...stale, ...adds])]).slice(0, cap);
  }
  candidates = [...new Set(candidates)];   // also dedupes TARGET_TITLES / TARGET_FILE
  if (!candidates.length) {
    console.log('هیچ نامزدی یافت نشد — جستجو را بررسی کنید (صفر بدون شاهد مثبت معنا ندارد).');
    return [];
  }

  const dated = await ensureMonthlyCategories(bot);

  // Fetch the wikitext of every candidate once, so the decision can be made here and
  // only the pages that will actually change are handed to the runner.
  const texts = new Map<string, string>();
  for (let i = 0; i < candidates.length; i += 50) {
    const r = await bot.apiGet({
      action: 'query', prop: 'revisions', rvprop: 'content', rvslots: 'main',
      titles: candidates.slice(i, i + 50).join('|'),
    });
    for (const p of r.query?.pages ?? []) {
      const c = p.revisions?.[0]?.slots?.main?.content;
      if (c) texts.set(p.title, c);
    }
  }

  const cheap = await gatherCheap(bot, candidates, dated);
  console.log(`حقایق پایه برای ${cheap.size} صفحه گرفته شد؛ اکنون نمایش صفحه‌های نامزد`);

  const keep: string[] = [];
  let screened = 0, rendered = 0;
  for (const title of candidates) {
    if (keep.length >= limit) break;
    const text = texts.get(title);
    const base = cheap.get(title);
    if (text === undefined || !base) continue;

    const early = rejectedWithoutRendering(text, title, base);
    if (early) { screened++; continue; }

    const f = await gatherRender(bot, title, base);
    rendered++;
    facts.set(title, f);
    const d = decide(text, title, f);
    decisions.set(title, d);
    if (d.act === 'report') refusals.push({ title, why: d.why, kind: d.kind });
    if (d.act === 'add' || d.act === 'remove') keep.push(title);
    if (rendered % 25 === 0) {
      console.log(`  ${rendered} نمایش، ${keep.length}/${limit} برای ویرایش، ${screened} پیش‌رد`);
    }
  }
  console.log(`${screened} صفحه بدون نمایش رد شد، ${rendered} صفحه نمایش داده شد`);
  console.log(`${keep.length} صفحه برای ویرایش؛ ${refusals.length} مورد برای گزارش`);
  return keep;
}

export const sourceTagsTask: BotTask = {
  id: 'source-tags',
  taskNumber: 15,
  // Overwritten per page in transform()'s note; core uses this when it has nothing else.
  summary: 'نشان‌گذاری وضعیت منابع مقاله',
  description:
    'افزودن {{بدون منبع}} و {{بدون منبع زنده}} به مقاله‌هایی که هیچ منبعی ندارند (یادکرد-ویکی منبع به‌شمار نمی‌آید)، ' +
    'افزودن {{بهبود منبع}} و {{منبع زنده}} تنها در حالت‌های بسیار روشن، و برداشتن {{بدون منبع}} از مقاله‌هایی که ' +
    'اکنون منبع دارند. هر مقاله پیش از تصمیم‌گیری نمایش داده می‌شود و هر مورد مشکوک به‌جای ویرایش گزارش می‌شود.',

  /** §6: the summary names the banner and the measured reason for it. */
  perPageSummary(title: string) {
    const d = decisions.get(title);
    return d ? (summaryFor(d) || undefined) : undefined;
  },

  getTargets,

  transform(text: string, title: string) {
    const d = decisions.get(title);
    if (!d) return { text, changed: false, note: 'بدون تصمیم (در این اجرا بررسی نشد)' };
    if (d.act === 'skip') return { text, changed: false, note: d.why };
    if (d.act === 'report') return { text, changed: false, note: d.why, manualReview: true };

    if (d.act === 'remove') {
      const out = removeStaleTag(text, STALE_NAMES);
      if (!out) {
        refusals.push({ title, why: 'برچسب کهنه به‌شکل امنی قابل برداشتن نبود', kind: 'برداشتن ناامن' });
        return { text, changed: false, note: 'برداشتن امن نبود', manualReview: true };
      }
      done.push({ title, what: 'برداشتن برچسب کهنه' });
      return { text: out.text, changed: true, note: summaryFor(d) };
    }

    // Last-moment re-check against the text as it is NOW; see hasSourceBanner's comment.
    const already = hasSourceBanner(text);
    if (already) {
      refusals.push({ title, why: `از پیش {{${already}}} دارد`, kind: 'بنر از پیش موجود' });
      return { text, changed: false, note: `از پیش {{${already}}} دارد` };
    }

    const f = facts.get(title);
    const date = f?.datedCategoryExists?.[d.banner] ? monthStamp() : null;
    const out = addBanner(text, d.banner, date);
    if (!out) {
      refusals.push({ title, why: 'بالای صفحه خوانده نشد (الگوی نابسته)', kind: 'جای درج پیدا نشد' });
      return { text, changed: false, note: 'جای درج پیدا نشد', manualReview: true };
    }
    done.push({ title, what: `افزودن {{${d.banner}}}` });
    return { text: out.text, changed: true, note: summaryFor(d) };
  },

  /**
   * This task's own risk, checked before anything is written (§11).
   *
   * The built-in guard counts error markers, which neither a wrong banner nor a wrongly
   * removed one produces. What must be proved here is that the page really does end up
   * in the category the banner claims, that it does NOT land in the bad-date tracking
   * category, and — for an add — that the render still shows no references at all. The
   * last one is the second opinion that catches a reference the wikitext scan missed.
   */
  async verify(bot: Bot, title: string, oldText: string, newText: string) {
    const had = new Set(checkWikitext(title, oldText));
    const fresh = checkWikitext(title, newText).filter(p => !had.has(p));
    if (fresh.length) return { ok: false, detail: 'دروازه: ' + fresh.join('؛ ') };

    const d = decisions.get(title);
    if (!d || (d.act !== 'add' && d.act !== 'remove')) return { ok: true, detail: '' };

    const r = await bot.apiPost({
      action: 'parse', title, text: newText, contentmodel: 'wikitext',
      prop: 'text|categories', disablelimitreport: '1',
    });
    const html = String(r.parse?.text ?? '');
    // The stray U+200F in «همه مقاله‌های زندگی‌نامه زندگان بدون منبع‏‏» is real (§1.4);
    // compare on the stripped form so a category match cannot turn on an invisible mark.
    const cats = (r.parse?.categories ?? [])
      .map((c: { category: string }) => c.category.replace(/_/g, ' ').replace(/[‎‏]/g, ''));

    // Errors the edit INTRODUCES, not errors the article already had.
    //
    // This was an absolute test, and it refused «جنگ کره» — whose render carries six
    // `class="error mw-ext-cite-error"` markers of its own, none of ours. Any long
    // article with a broken citation was therefore permanently unreachable, and the
    // refusal published blamed our edit. `checkWikitext` two lines up already compares
    // before against after (the `had` set); the render check has to do the same.
    const before = errorMarkers(await renderOf(bot, title, oldText));
    const after = errorMarkers(html);
    if (after > before) {
      return { ok: false, detail: `نمایش ${after - before} خطای تازه دارد` };
    }
    const badDate = 'مقاله‌های دارای پارامتر تاریخ نادرست در الگو';
    if (cats.includes(badDate)) return { ok: false, detail: `در رده «${badDate}» افتاد` };

    if (d.act === 'add') {
      const want = BANNERS[d.banner].category.replace(/[‎‏]/g, '');
      if (!cats.some((c: string) => c.includes(want))) {
        return { ok: false, detail: `رده «${want}» پس از درج دیده نشد` };
      }
      const refsNow = countRenderedRefs(html);
      if ((d.banner === 'بدون منبع' || d.banner === 'بدون منبع زنده') && refsNow > 0) {
        return { ok: false, detail: `نمایش ${refsNow} پانویس دارد؛ «بدون منبع» درست نیست` };
      }
      return { ok: true, detail: `رده «${want}» افزوده شد` };
    }

    // remove: the page must LEAVE the unsourced category.
    if (cats.some((c: string) => c.includes('مقاله‌های بدون منبع') ||
                                 c.includes('زندگی‌نامه زندگان بدون منبع'))) {
      return { ok: false, detail: 'هنوز در ردهٔ بدون منبع است' };
    }
    return { ok: true, detail: 'از ردهٔ بدون منبع بیرون آمد' };
  },

  async report(bot: Bot, dryRun: boolean) {
    if (!refusals.length && !done.length) return;
    const byKind = new Map<string, Refusal[]>();
    for (const r of refusals) {
      if (!byKind.has(r.kind)) byKind.set(r.kind, []);
      byKind.get(r.kind)!.push(r);
    }
    const out = [
      'این صفحه موارد نیازمند بررسی انسانی را فهرست می‌کند: عنوان‌هایی که برایشان برچسبی',
      'گذاشته نشد چون تصمیم‌گیری دربارهٔ آنها داوری لازم دارد.',
      '',
      `آخرین به‌روزرسانی: ~~~~~`,
      '',
      `در این اجرا ${done.length} ویرایش انجام شد و ${refusals.length} مورد کنار گذاشته شد.`,
      '',
    ];
    for (const [kind, rows] of [...byKind].sort((a, b) => b[1].length - a[1].length)) {
      out.push(`== ${kind} (${rows.length}) ==`);
      for (const r of rows.slice(0, 200)) out.push(`# [[${r.title}]] — ${r.why}`);
      if (rows.length > 200) out.push(`(${rows.length - 200} مورد دیگر.)`);
      out.push('');
    }
    const text = out.join('\n');
    if (dryRun) {
      console.log(`\n--- گزارش (آزمایشی، ${refusals.length} مورد) ---\n${text.slice(0, 2000)}`);
      return;
    }
    const cur = await bot.apiGet({
      action: 'query', prop: 'revisions', titles: REPORT_PAGE,
      rvprop: 'content|ids|timestamp', rvslots: 'main',
    });
    const p = cur.query.pages[0];
    await bot.edit(REPORT_PAGE, text, 'به‌روزرسانی فهرست موارد نیازمند بررسی',
      p.missing ? 0 : p.revisions[0].revid, p.missing ? '' : p.revisions[0].timestamp,
      { allowCreate: true });
    console.log(`گزارش منتشر شد: ${REPORT_PAGE}`);
  },
};
