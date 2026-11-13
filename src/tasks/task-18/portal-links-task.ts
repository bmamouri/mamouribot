/**
 * وظیفهٔ ۱۸ — افزودن پیوند درگاه به مقاله‌های وابسته.
 *
 * A CONTINUOUS task, not a one-off sweep: new articles join a portal's subject category
 * all the time, so this round-robins through the portal rotation forever rather than
 * trying to finish one giant sweep. See `docs/task-18-portal-links.md` for the plan and
 * the measurements behind each choice.
 *
 * PIPELINE, per run
 * ------------------
 *   1. discoverPortals()     — every درگاه with an exact-name subject category, minus
 *                               the two excluded portals, freshly re-derived every run.
 *   2. pickNext()             — advance the rotation pointer by `PORTALS_PER_RUN` portals.
 *   3. per chosen portal:
 *        portalCandidates()  — depth ≤1 category walk (portal-scope.ts)
 *        screen each candidate CHEAPLY first (missing/redirect/dab/already/rejected),
 *        then the revert guard (revert-guard.ts) ONLY for what survives the cheap screen
 *        — it costs a metadata-only history read, and content reads only for a genuine
 *        revert-shaped hit, so it must not run on every candidate unconditionally.
 *   4. return the survivors, capped at `--limit`, to core.ts's normal write pipeline.
 *
 * `transform()` re-checks everything transform-time-cheap (hasPortal, redirect, dab) from
 * the text core.ts just fetched, because getTargets()'s screen can be minutes stale by
 * the time the write actually happens.
 *
 * `ignoreCheckpoint: true` — see rotation-state.ts's header: core.ts's done/deferred/clean
 * checkpoint parks a TITLE forever once seen, which is wrong for a task where the same
 * article is a legitimate candidate for a DIFFERENT portal on a later round. This task's
 * own per-portal done-store (portal-done-store.ts) carries the real idempotency.
 */
import type { Bot, BotTask } from '../../core.js';
import { discoverPortals, portalCandidates, type PortalCandidate } from './portal-scope.js';
import { portalWasRevertedHere } from './revert-guard.js';
import { loadRotation, saveRotation, pickNext, sliceFromCursor } from './rotation-state.js';
import { loadDone, saveDone, isHumanRejected, type DoneRecord } from './portal-done-store.js';
import { addPortalLink, summaryFor } from './portal-links.js';
import { hasPortal } from '../../lib/portal-bar.js';

/** How many portals to advance the rotation by, per run. A full pass over a category
 *  this depth is cheap; the slow part the operator flagged (surveying EVERY portal's
 *  full tree every 6 hours) is avoided by never walking more than this many portals'
 *  trees in one run. */
export const PORTALS_PER_RUN = Number(process.env.PORTALS_PER_RUN ?? 6);

/** Candidates screened per portal per run, so one huge portal (e.g. «ایران») cannot
 *  starve the rotation of the OTHER portals chosen alongside it this run. */
export const CANDIDATES_PER_PORTAL = Number(process.env.CANDIDATES_PER_PORTAL ?? 60);

/** title -> the portal this run decided to add there, consumed by transform()/perPageSummary(). */
const decidedPortal = new Map<string, string>();
/** title -> which portal's done-store it belongs to, so transform()/verify() write back
 *  to the right file without re-deriving it from decidedPortal (same map, kept distinct
 *  for clarity at the call sites). */
const doneStores = new Map<string, DoneRecord>();
const aliasesFor = new Map<string, string[]>();

interface Refusal { title: string; portal: string; why: string }
const refusals: Refusal[] = [];

/** The portal's own redirects — a link through one of these is already done. */
async function portalAliases(bot: Bot, portal: string): Promise<string[]> {
  const r = await bot.apiGet({
    action: 'query', titles: `درگاه:${portal}`, prop: 'redirects', rdlimit: '500',
  });
  return (r.query?.pages?.[0]?.redirects ?? [])
    .map((x: { title: string }) => x.title.replace(/^درگاه:/, ''));
}

/** Cheap, read-only pre-screen before the revert guard ever runs — see module header. */
async function cheapScreen(
  bot: Bot, title: string, portal: string, aliases: string[], done: DoneRecord,
): Promise<{ status: string } | { text: string }> {
  if (done[title]) return { status: done[title] };

  const q = await bot.apiGet({
    action: 'query', titles: title, prop: 'revisions|info',
    rvprop: 'content', rvslots: 'main',
  });
  const p = q.query?.pages?.[0];
  if (!p || p.missing) return { status: 'missing' };
  if (p.ns !== 0) return { status: 'not-article' };
  const text: string = p.revisions?.[0]?.slots?.main?.content ?? '';
  if (/^\s*#(تغییرمسیر|REDIRECT|تغییر_مسیر)/i.test(text)) return { status: 'redirect' };
  if (/\{\{\s*(ابهام‌زدایی|صفحه ابهام‌زدایی)\s*[|}]/.test(text) || title.includes('ابهام‌زدایی')) {
    return { status: 'dab' };
  }
  if (hasPortal(text, portal, aliases)) return { status: 'already' };
  return { text };
}

async function getTargets(bot: Bot): Promise<string[]> {
  const portals = await discoverPortals(bot);
  if (!portals.length) {
    console.log('هیچ درگاهی با ردهٔ هم‌نام یافت نشد — صفر نامزد.');
    return [];
  }

  const rotation = loadRotation();
  const { chosen, nextPointer } = pickNext(portals, rotation.pointer, PORTALS_PER_RUN);
  // Advance and SAVE the pointer immediately, before any network work for the chosen
  // portals — a crash mid-run must not re-select the same portals forever (rotation-state.ts).
  rotation.pointer = nextPointer;
  saveRotation(rotation);
  console.log(`چرخه: ${chosen.length} درگاه از ${portals.length} (نشانگر بعدی: ${nextPointer})`);
  console.log(`  ${chosen.join('، ')}`);

  const limit = bot.opts.limit || 20;
  const keep: string[] = [];

  for (const portal of chosen) {
    if (keep.length >= limit) break;

    const candidates: PortalCandidate[] = await portalCandidates(bot, portal);
    if (!candidates.length) { console.log(`  ${portal}: ۰ نامزد`); continue; }

    const cursors = rotation.cursors;
    const { slice, nextCursor } = sliceFromCursor(candidates, cursors[portal] ?? 0, CANDIDATES_PER_PORTAL);
    cursors[portal] = nextCursor;
    saveRotation(rotation);

    const aliases = await portalAliases(bot, portal);
    aliasesFor.set(portal, aliases);
    const done = loadDone(portal);
    doneStores.set(portal, done);

    let added = 0, screened = 0;
    for (const c of slice) {
      if (keep.length >= limit) break;
      if (decidedPortal.has(c.title)) continue; // another chosen portal already claimed this title this run

      const screen = await cheapScreen(bot, c.title, portal, aliases, done);
      if ('status' in screen) {
        if (!done[c.title]) { done[c.title] = screen.status; saveDone(portal, done); }
        screened++;
        continue;
      }

      // The expensive check LAST, and only for a candidate that survived everything free.
      const revert = await portalWasRevertedHere(bot, c.title, portal, aliases);
      if (revert.blocked) {
        done[c.title] = `rejected-by-human:${revert.revid}`;
        saveDone(portal, done);
        refusals.push({ title: c.title, portal, why: revert.detail! });
        screened++;
        continue;
      }

      decidedPortal.set(c.title, portal);
      keep.push(c.title);
      added++;
    }
    console.log(`  ${portal}: ${added} نامزد از ${slice.length} بررسی‌شده (ردشده: ${screened})`);
  }

  return keep;
}

export const portalLinksTask: BotTask = {
  id: 'portal-links',
  taskNumber: 18,
  summary: 'افزودن پیوند درگاه به مقالهٔ وابسته',
  description:
    'افزودن {{درگاه|…}} به مقاله‌هایی که در ردهٔ موضوعی هم‌نام یک درگاه (یا زیررده‌های ' +
    'بی‌واسطهٔ غیرظرفی آن) هستند و هنوز پیوند آن درگاه را ندارند. به چرخش روی فهرست ' +
    'درگاه‌ها کار می‌کند، نه یک بار برای همه؛ مقاله‌ای که پیش‌تر پیوند درگاهی در آن ' +
    'واگردانده شده، برای همان درگاه دیگر هرگز پیشنهاد نمی‌شود.',

  // See the module header: this task's own idempotency lives in portal-done-store.ts,
  // keyed per PORTAL rather than per title, because the same title is a legitimate
  // candidate for a different portal later. core.ts's single-title checkpoint cannot
  // express that.
  ignoreCheckpoint: true,

  perPageSummary(title: string) {
    const portal = decidedPortal.get(title);
    return portal ? summaryFor(portal) : undefined;
  },

  getTargets,

  transform(text: string, title: string) {
    const portal = decidedPortal.get(title);
    if (!portal) return { text, changed: false, note: 'بدون تصمیم (در این اجرا بررسی نشد)' };
    const aliases = aliasesFor.get(portal) ?? [];
    const d = addPortalLink(text, portal, aliases);
    return { text: d.text, changed: d.changed, note: d.note };
  },

  async verify(_bot: Bot, title: string, _oldText: string, newText: string) {
    const portal = decidedPortal.get(title);
    if (!portal) return { ok: true, detail: '' };
    const aliases = aliasesFor.get(portal) ?? [];
    if (!hasPortal(newText, portal, aliases)) {
      return { ok: false, detail: 'پس از ویرایش، پیوند درگاه در متن دیده نشد' };
    }
    return { ok: true, detail: `پیوند درگاه «${portal}» افزوده شد` };
  },

  async report(bot: Bot, dryRun: boolean) {
    // Mark every genuinely-written page `already` in its portal's done-store, so the
    // NEXT visit to that portal does not re-screen it from a stale 'missing text' state.
    for (const [title, portal] of decidedPortal) {
      const done = doneStores.get(portal);
      if (done && !done[title]) { done[title] = 'already'; }
    }
    for (const [portal, done] of doneStores) saveDone(portal, done);

    if (!refusals.length) return;
    console.log(`\n${refusals.length} مورد رد شد به‌سبب واگردانی پیشین انسانی:`);
    for (const r of refusals.slice(0, 50)) console.log(`  [[${r.title}]] (${r.portal}) — ${r.why}`);
    if (dryRun) return;
    // No accumulating report page for this task yet — the per-portal done-store already
    // records every rejection permanently and is itself the audit trail. Added here as a
    // place to grow a wiki-facing report page if a reviewer wants one.
  },
};
