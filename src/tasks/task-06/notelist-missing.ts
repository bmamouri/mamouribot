/**
 * وظیفهٔ ۶ — فهرست یادداشت‌های جاافتاده.
 *
 * Articles translated from en carry notes that were `{{efn}}` there. The
 * translation turns them into raw `<ref group="…">` and either drops the list
 * that displays them, mis-names it, or strands it above the notes. The result is
 * not merely an error message: the note text never reaches the reader at all
 * (one article was hiding 112 notes).
 *
 * The tracking category رده:صفحه‌های دارای یادداشت که فهرست یادداشت‌ها در آنها
 * جا افتاده است was wired up on 2026-09-15 and new members keep arriving, so
 * this is a CONTINUOUS task, not a one-off sweep.
 *
 * Three mechanical classes are fixed; two judgement classes are never touched:
 *
 *   missing-container    add {{یادداشت‌ها}}/{{پانویس|گروه=X}} in the right place
 *   misplaced-container  the list sits above its notes — move it down
 *   nested-ref           {{sfn}} inside a raw grouped ref breaks that group's
 *                        list (en errors identically) — restore {{یادچپ}}
 *   malformed            group= holds a URL/sentence/number — a typo, reported
 *   unknown              anything the rules can't explain — reported
 *
 * All rules live in src/lib/notelist.ts, shared with the interactive
 * scripts/archive/notelist-sweep.ts so the two can't drift.
 */
import type { Bot, BotTask } from '../../core.js';
import { GROUP_ERR, TRACKING_CAT, applyFix, classify, usedGroups } from '../../lib/notelist.js';

/**
 * title → the groups Cite actually complains about, established in getTargets.
 *
 * transform() is pure and synchronous, but scanning the wikitext alone is not
 * enough: an article can inherit `<ref group="nb">` from a TRANSCLUDED template,
 * in which case its own source contains no grouped ref at all and the page looks
 * clean while hiding its notes. The render is the only thing that sees through
 * transclusion, so it is done once per candidate up front and handed over here.
 */
const brokenGroups = new Map<string, string[]>();

/** test seam: let the replay harness supply the same render-truth getTargets would */
export const seedBrokenGroups = (title: string, groups: string[]) => brokenGroups.set(title, groups);

/**
 * `list=categorymembers` and the rendered category page are BOTH stale — one
 * reported 0 members while 35 were live, another 41 while 64 were. CirrusSearch
 * lags too, just differently. Only the union is trustworthy as an input set;
 * transform() then re-checks each page from its own wikitext.
 */
async function getTargets(bot: Bot): Promise<string[]> {
  const titles = new Set<string>();

  let cont: Record<string, string> = {};
  for (;;) {
    const r = await bot.apiGet({ action: 'query', list: 'categorymembers', cmtitle: TRACKING_CAT,
      cmlimit: '500', cmnamespace: '0', ...cont });
    for (const m of r.query?.categorymembers ?? []) titles.add(m.title);
    if (!r.continue) break;
    cont = r.continue;
  }

  let off = 0;
  for (;;) {
    const r = await bot.apiGet({ action: 'query', list: 'search',
      srsearch: `incategory:"${TRACKING_CAT.replace(/^رده:/, '')}"`,
      srlimit: '50', sroffset: String(off), srnamespace: '0' });
    for (const m of r.query?.search ?? []) titles.add(m.title);
    if (!r.continue) break;
    off = r.continue.sroffset;
  }

  // Render each candidate from its OWN wikitext — `action=parse&page=` is served
  // from a parser cache that can be days stale, and the category itself lags in
  // both directions. Only pages that genuinely still error are handed on.
  const broken: string[] = [];
  for (const title of titles) {
    try {
      const d = await bot.apiGet({ action: 'query', prop: 'revisions', rvprop: 'content',
        rvslots: 'main', titles: title });
      const pg = d.query?.pages?.[0];
      if (!pg || 'missing' in pg) continue;
      const text: string = pg.revisions[0].slots.main.content;
      const r = await bot.apiPost({ action: 'parse', title, text, contentmodel: 'wikitext',
        prop: 'text', disablelimitreport: '1' });
      const groups = [...new Set([...((r.parse?.text ?? '') as string).matchAll(GROUP_ERR)].map(m => m[1]))];
      if (!groups.length) continue;
      brokenGroups.set(title, groups);
      broken.push(title);
    } catch { /* a read hiccup just defers the page to the next run */ }
  }
  return broken;
}

export const notelistMissingTask: BotTask = {
  id: 'notelist-missing',
  taskNumber: 6,
  // A CONTINUOUS task: the category keeps gaining members as articles are
  // translated from en, and a page that gets re-broken must not be skipped for
  // good. Also gives the deferred ones (typo'd group names, cases the rules
  // cannot explain yet) another look once the code has moved on.
  recheckAfterDays: 30,
  summary: 'افزودن فهرست یادداشت‌های جاافتاده؛ بدون آن متن یادداشت‌ها اصلاً نمایش داده نمی‌شد',
  description:
    'افزودن فهرست یادداشت‌های جاافتاده به مقاله‌هایی که یادداشت دارند اما فهرست نمایش آن را ندارند ' +
    '(رده:صفحه‌های دارای یادداشت که فهرست یادداشت‌ها در آنها جا افتاده است). سه حالت ماشینی اصلاح می‌شود: ' +
    'نبودِ فهرست، فهرستی که بالاتر از یادداشت‌ها قرار گرفته، و یادکرد درون یادداشت خام که فهرست گروه را از کار می‌اندازد. ' +
    'نام گروه‌های نادرست (نشانی اینترنتی، جمله یا عدد در پارامتر گروه) دست‌نخورده می‌مانند و برای بازبینی دستی گزارش می‌شوند.',

  getTargets,

  transform(text: string, title: string) {
    // the rendered verdict when we have it, the wikitext scan as a fallback
    // (the test harness replays old revisions without a getTargets pass)
    const groups = brokenGroups.get(title) ?? usedGroups(text);
    const c = classify(text, groups);

    if (c.kind === 'clean') return { text, changed: false, note: c.detail };

    // a typo'd group name, or something the rules can't explain — adding a list
    // would enshrine the mistake, so defer it for a human instead
    if (c.kind === 'malformed' || c.kind === 'unknown')
      return { text, changed: false, note: c.detail, manualReview: true };

    const fix = applyFix(text, c.kind, c.groups);
    if (!fix) return { text, changed: false, note: `${c.detail} — اصلاح خودکار ممکن نشد`, manualReview: true };

    // MediaWiki expands ~~~~ to a signature on save; a note body that ends up
    // holding one would silently sign the article.
    if (fix.text.includes('~~~~') && !text.includes('~~~~'))
      return { text, changed: false, note: 'نتیجه شامل نشان امضا بود', manualReview: true };

    return { text: fix.text, changed: true, note: fix.note };
  },
};
