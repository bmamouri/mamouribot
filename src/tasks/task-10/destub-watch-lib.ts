/**
 * De-stub — continuous watcher, the testable/importable half.
 *
 * The CLI entry is destub-watch.ts, which is ONLY `main()` plus an
 * unconditional call at the bottom — like run.ts, not like destub-classify.ts.
 * That split exists for one reason: this file is imported by
 * destub-watch.test.ts for its pure functions, and destub-watch.ts's bundle
 * is a SOLO entry point (nothing else in it is ever "the" main), so an
 * `isMain()` guard — built for run.ts's bundle, where MANY task modules share
 * one output and must not all self-invoke — is the wrong tool here: under
 * `__BUNDLED__` it unconditionally returns false, which would silently
 * disable this task's own main() the moment it was bundled at all. Keeping
 * `poll()` in a file nothing-but-the-entry imports means the entry file can
 * call main() unconditionally, exactly like run.ts does, with no guard to get
 * wrong in either direction.
 *
 * destub.ts works from a snapshot: HujiBot's weekly "long stubs" report, which
 * only lists articles that are ALREADY over 10 KB. That is fine for clearing the
 * existing backlog, but it cannot do what Baqer actually asked for: an article
 * is a living thing on a wiki — a genuine stub today can gain real content next
 * Tuesday, and if it never happens to cross 10 KB of BYTES (it may never need
 * to; دلتا ۲-style infoboxes aside, 400 prose words is routinely under 10 KB),
 * it would NEVER appear in that report. Not eventually — never. Waiting a week
 * for the report to regenerate is also too slow for a tag that stopped being
 * true an hour after someone expanded the article.
 *
 * So this task does not wait for a report and does not re-scan the 710,000-
 * article backlog either. It watches `list=recentchanges` for edits to articles
 * CURRENTLY in رده:همه مقاله‌های خرد and classifies only those — the set of
 * "things that changed since the last poll", which is what makes running this
 * forever cheap: cost scales with EDIT VOLUME, not with the size of the stub
 * category. Measured on live fa.wikipedia traffic: ~167 mainspace edits/hour,
 * of which ~16% (≈27/hour) touch an article currently stub-tagged — a trickle,
 * not a flood.
 *
 * Newly-classified "auto-remove" titles land in the same classified.jsonl
 * destub.ts already reads, so one call to `bot.runTask(destubTask)` at the end
 * of every poll removes the tag immediately — no second job, no second
 * schedule, no second resume-state file.
 *
 * THAT CALL IS LIMIT-CAPPED (WATCH_EDIT_LIMIT), AND THAT IS LOAD-BEARING.
 * `destubTask.getTargets()` returns EVERY outstanding auto-remove title, not
 * just the ones this poll discovered — measured directly: a backlog of 431
 * titles classified but never yet actioned made one dry-run poll take over
 * three minutes and would have taken ~35 unbounded, because `prepare()` runs a
 * render-guard plus a category-diff plus a text-diff per candidate. A job meant
 * to tick every 10–15 minutes forever cannot have a single poll whose duration
 * depends on the SIZE OF THE BACKLOG rather than on how many articles were
 * actually edited since last time — that turns "continuous" into overlapping
 * or ever-lengthening runs. The explicit, approved backlog sweep is
 * `run.ts destub --live` with no limit, run deliberately; this task's job is
 * only to keep up with new arrivals promptly, a few at a time, forever.
 *
 * FORWARD-LOOKING ONLY. The first run with no checkpoint on disk starts the
 * clock at "now" rather than backfilling `list=recentchanges`'s ~30-day
 * retention window in one go. That backfill is not this task's job: the
 * existing backlog is destub.ts's (HujiBot's report plus the one-off
 * `--fresh` classify sweep). This task only ever looks forward from whenever
 * it was first started.
 */
import { Bot } from '../../core.js';
import { loadInventory, ALL_STUBS_CAT } from './destub-inventory-lib.js';
import { gather, CLASSIFIED_PATH } from './destub-classify.js';
import { destubTask } from './destub.js';
import { mkdirSync, writeFileSync, readFileSync, existsSync, appendFileSync } from 'fs';
import { dirname } from 'path';

export const CHECKPOINT_PATH = '.state/destub/watch-checkpoint.json';
/** Never consider an edit made by the bot's own account a trigger for itself. */
const SELF = 'MamouriBot';
/** Pagination safety valve: this many ×500 recentchanges entries per poll, max. */
const MAX_PAGES = 20;
/**
 * Default cap on edits per poll — see the file header. 20 at the default 10s
 * write-delay is a few minutes of work even in the worst case, comfortably
 * inside a 10–15 minute schedule; override with --limit for a manual backlog-
 * draining run (or omit it and use `run.ts destub --live` directly, which is
 * what that is for).
 */
export const DEFAULT_WATCH_EDIT_LIMIT = 20;

export interface WatchCheckpoint {
  /** ISO timestamp of the newest recentchanges entry already handled */
  timestamp: string;
  /** its rcid, to break ties among entries sharing the same timestamp */
  rcid: number;
}

export interface RcEntry {
  title: string;
  rcid: number;
  timestamp: string;
  newlen: number;
  user: string;
}

// ---------------------------------------------------------------------------
// pure logic — testable without the network
// ---------------------------------------------------------------------------

/**
 * One candidate per title: the most RECENT edit to it in this poll (later
 * `newlen` is the one that matters), excluding the bot's own edits and
 * excluding anything at or before the checkpoint boundary.
 *
 * The boundary check matters because `rcstart=<timestamp>&rcdir=newer` is
 * INCLUSIVE of that exact timestamp. Without it, the entry the checkpoint was
 * last advanced to would be reclassified every single poll forever — cheap
 * individually, but it is the kind of "mostly harmless" bug that quietly
 * doubles the request count of a job meant to run unattended for months.
 */
export function dedupeCandidates(entries: RcEntry[], cp: WatchCheckpoint): RcEntry[] {
  const byTitle = new Map<string, RcEntry>();
  for (const e of entries) {
    if (e.user === SELF) continue;
    if (e.timestamp < cp.timestamp) continue;
    if (e.timestamp === cp.timestamp && e.rcid <= cp.rcid) continue;
    const prev = byTitle.get(e.title);
    if (!prev || e.timestamp > prev.timestamp || (e.timestamp === prev.timestamp && e.rcid > prev.rcid)) {
      byTitle.set(e.title, e);
    }
  }
  return [...byTitle.values()];
}

/**
 * The checkpoint to persist after this poll: the latest (timestamp, rcid) seen
 * among the entries ACTUALLY FETCHED — not "now". If pagination hit MAX_PAGES,
 * `entries` stops short of the live edge of recentchanges on purpose, and the
 * checkpoint must stop exactly there too, so the next poll resumes the gap
 * instead of either reprocessing it or silently skipping it.
 */
export function nextCheckpoint(entries: RcEntry[], current: WatchCheckpoint): WatchCheckpoint {
  let best = current;
  for (const e of entries) {
    if (e.timestamp > best.timestamp || (e.timestamp === best.timestamp && e.rcid > best.rcid)) {
      best = { timestamp: e.timestamp, rcid: e.rcid };
    }
  }
  return best;
}

/**
 * The later of two checkpoints, by the same (timestamp, rcid) ordering
 * everything else here uses. A tie keeps `a` — used below to prefer a real
 * rcid over a synthetic one when they land on the same timestamp.
 */
export function laterCheckpoint(a: WatchCheckpoint, b: WatchCheckpoint): WatchCheckpoint {
  if (b.timestamp > a.timestamp) return b;
  if (b.timestamp === a.timestamp && b.rcid > a.rcid) return b;
  return a;
}

export function loadWatchCheckpoint(path = CHECKPOINT_PATH): WatchCheckpoint {
  if (!existsSync(path)) {
    // Forward-looking only — see the file header. `rcid: 0` is safe regardless
    // of fa.wikipedia's real rcid range: dedupeCandidates only compares it
    // against entries sharing this exact timestamp, and nothing can share a
    // timestamp of "right now, before any poll has run".
    return { timestamp: new Date().toISOString(), rcid: 0 };
  }
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function saveWatchCheckpoint(cp: WatchCheckpoint, path = CHECKPOINT_PATH): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(cp));
}

// ---------------------------------------------------------------------------
// network
// ---------------------------------------------------------------------------

/**
 * Every mainspace edit since the checkpoint, oldest first. Capped at
 * MAX_PAGES×500 entries so a long-dead job (Toolforge outage, a stuck earlier
 * poll) cannot turn its first revival into an hours-long catch-up run; the
 * checkpoint-from-what-was-fetched rule above means the remainder is simply
 * next poll's work, not lost.
 */
async function pollRecentChanges(bot: Bot, cp: WatchCheckpoint): Promise<{ entries: RcEntry[]; truncated: boolean }> {
  const entries: RcEntry[] = [];
  let cont: Record<string, string> = {};
  for (let page = 0; page < MAX_PAGES; page++) {
    const r = await bot.apiGet({
      action: 'query', list: 'recentchanges', rcnamespace: '0', rctype: 'edit',
      rcdir: 'newer', rcstart: cp.timestamp, rclimit: '500',
      rcprop: 'title|ids|timestamp|sizes|user', ...cont,
    });
    for (const c of r.query?.recentchanges ?? []) {
      entries.push({ title: c.title, rcid: c.rcid, timestamp: c.timestamp, newlen: c.newlen, user: c.user });
    }
    if (!r.continue) return { entries, truncated: false };
    cont = r.continue;
  }
  return { entries, truncated: true };
}

/** Of these titles, which are CURRENTLY in رده:همه مقاله‌های خرد — not when the edit happened, now. */
async function currentStubTitles(bot: Bot, titles: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50);
    const r = await bot.apiGet({ action: 'query', titles: batch.join('|'), prop: 'categories',
      clcategories: `رده:${ALL_STUBS_CAT}`, cllimit: 'max' });
    for (const p of r.query?.pages ?? []) {
      if (p.categories?.length) out.add(p.title);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// one poll
// ---------------------------------------------------------------------------

export async function poll(bot: Bot): Promise<void> {
  const inv = loadInventory();
  const cp = loadWatchCheckpoint();

  // Captured BEFORE the query, not after: `rcdir=newer` with no `rcend` reads
  // up to the live edge of recentchanges, so a non-truncated result — even an
  // EMPTY one — proves nothing happened between `cp` and this moment. That
  // proof is what the checkpoint must advance to below. Without it, a poll
  // that finds zero entries has nothing to call nextCheckpoint() with, so it
  // would re-derive "now" from scratch on every future poll instead of ever
  // persisting a baseline — confirmed on the very first live Toolforge test:
  // two consecutive polls each reported zero edits and NEITHER ever wrote
  // watch-checkpoint.json, which means every poll after that would have kept
  // silently re-baselining to its own "right now" and losing whatever real
  // edits happened in between. Not a corner case — it was the FIRST thing
  // that happened on real infrastructure.
  const asOf = new Date().toISOString();

  const { entries, truncated } = await pollRecentChanges(bot, cp);
  if (truncated) {
    console.log(`⚠ بیش از ${MAX_PAGES * 500} ویرایش از آخرین بررسی — این دور تنها بخشی را پردازش می‌کند`);
  }
  if (!entries.length) {
    console.log('هیچ ویرایش تازه‌ای از آخرین بررسی نیست.');
    // Still safe to advance when NOT truncated — see the comment on `asOf`.
    // When truncated, `entries` stops short of the live edge on purpose
    // (nextCheckpoint's own doc comment), so the checkpoint must too.
    if (!truncated) saveWatchCheckpoint(laterCheckpoint(cp, { timestamp: asOf, rcid: 0 }));
    return;
  }

  const candidates = dedupeCandidates(entries, cp);
  console.log(`${entries.length} ویرایش از ${cp.timestamp}؛ ${candidates.length} عنوان یکتا (بی‌شمارِ خودِ ربات)`);

  const stubNow = candidates.length ? await currentStubTitles(bot, candidates.map(c => c.title)) : new Set<string>();
  const toClassify = candidates.filter(c => stubNow.has(c.title));
  console.log(`${toClassify.length} مورد هنوز برچسب خرد دارند`);

  mkdirSync(dirname(CLASSIFIED_PATH), { recursive: true });
  for (const c of toClassify) {
    try {
      const v = await gather(bot, c.title, c.newlen, inv);
      if (!v) { console.log(`  – ${c.title}: دیگر برچسب خرد ندارد یا نبود/تغییرمسیر`); continue; }
      appendFileSync(CLASSIFIED_PATH, JSON.stringify(v) + '\n');
      const mark = v.tier === 'auto-remove' ? '✓' : v.tier === 'needs-human' ? '?' : '·';
      console.log(`${mark} ${String(v.words).padStart(5)} واژه  ${c.title}` +
        (v.flags.length ? `  [${v.flags.join('، ')}]` : ''));
    } catch (e) {
      // One failed classify (network blip) does not abort the poll or the
      // checkpoint advance — see the file header on why that trade is fine.
      console.log(`  ! ${c.title}: ${(e as Error).message}`);
    }
  }

  // Advance AFTER attempting every candidate — see nextCheckpoint's doc comment
  // on why this must come from `entries`, not from "now".
  saveWatchCheckpoint(nextCheckpoint(entries, cp));

  // Whatever just became auto-remove-eligible gets its tag taken off in the
  // SAME process: one state directory, one pacing budget, no second job.
  await bot.runTask(destubTask);
}
