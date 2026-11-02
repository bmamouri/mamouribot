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
 * Namespaces this task will actually EDIT. Deliberately NOT the full whitelist
 * {{Broken ref}} itself categorizes into (0, 4, 6, 10, 12, 14, 100, 118) — that
 * widened set was tried on 2026-11-01 and broke on its first run:
 *
 *   - الگو:یادچپ (ns 10) IS the {{efn}}-equivalent that GENERATES
 *     `<ref group="persian-alpha">` for every article that calls it. Rendering
 *     the template in isolation triggers the Cite error by design — it has no
 *     `<references>` of its own because every caller is supposed to supply one
 *     — but "render it and see if Cite complains" is not evidence of anything
 *     broken for a template. The bot added a container straight into the
 *     template body, which does not fix any article and got reverted on sight
 *     by two different human editors (twice each) before the bot re-added it
 *     a 4th time and had to be emergency-stopped.
 *   - الگو:شجره‌نامه هرا (a `{{Tree chart}}` family-tree template) is the same
 *     shape: `<ref group="پ">` inside a template body transcluded elsewhere.
 *   - ویکی‌پدیا:…/تست (ns 4) turned out to hold `<ref group="گروه">` as a
 *     LITERAL PYTHON TEST-CASE STRING, not a rendered Cite error at all.
 *
 * Templates and project pages are not "mostly article-shaped with an
 * occasional edge case" the way پیش‌نویس drafts are — a template body being
 * re-rendered standalone routinely LOOKS broken by construction. Until the
 * classifier can tell "this <ref group> is meant to be satisfied by whoever
 * transcludes me" apart from "this page is just missing its own list", ns 10
 * (الگو) and ns 4 (ویکی‌پدیا) stay OUT. پیش‌نویس (118) is kept: a draft is a
 * future article and renders the same way one does — verified on
 * پیش‌نویس:ایران/تاریخ, which has an ordinary missing persian-notelist on its
 * own text, no transclusion involved.
 */
export const TARGET_NAMESPACES = ['0', '118'];

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
      cmlimit: '500', cmnamespace: TARGET_NAMESPACES.join('|'), ...cont });
    for (const m of r.query?.categorymembers ?? []) titles.add(m.title);
    if (!r.continue) break;
    cont = r.continue;
  }

  let off = 0;
  for (;;) {
    const r = await bot.apiGet({ action: 'query', list: 'search',
      srsearch: `incategory:"${TRACKING_CAT.replace(/^رده:/, '')}"`,
      srlimit: '50', sroffset: String(off), srnamespace: TARGET_NAMESPACES.join('|') });
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
  // getTargets() already re-renders every candidate from its own wikitext before
  // handing it on — it only returns a title when the render JUST proved it is still
  // broken. The checkpoint (done/deferred/clean) is therefore not a reliable filter on
  // top of that: a page fixed once and later re-broken by a translation edit is a
  // genuine, render-confirmed target again, but recheckAfterDays would still park it
  // for up to 30 days. Work whatever getTargets() returns, every run.
  ignoreCheckpoint: true,
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

    // a typo'd group name, something the rules can't explain, or a container split
    // across two spots (some notes before it, some stranded after — Cite only collects
    // refs that precede the list, so the trailing ones are silently dropped) — none of
    // these are safe to guess at, so they are deferred for a human instead
    if (c.kind === 'malformed' || c.kind === 'unknown' || c.kind === 'split-container')
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
