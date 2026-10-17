/**
 * The bot's resume checkpoint: which titles have been handled, and when.
 *
 * It used to be two bare arrays of titles, which meant a title could NEVER come
 * back. For a one-off migration that is correct. For a CONTINUOUS task it is a
 * silent hole: a page fixed once was filtered out of every later batch, so if
 * someone re-broke it, the page sat in the tracking category being skipped
 * forever while the run reported "nothing to do". Same for a page deferred for
 * manual review — it stayed deferred even after the code learned to handle it.
 *
 * Timestamps fix that, but expiry is OPT-IN per task (`recheckAfterDays`).
 * Turning it on globally would make long-running approved tasks re-sweep their
 * whole backlog — 12k pages for the infobox task — which is not a free action
 * and not this module's decision to make.
 */

export interface Checkpoint {
  /** title → epoch ms when it was last successfully handled */
  done: Record<string, number>;
  /** title → epoch ms when it was last parked for a human */
  deferred: Record<string, number>;
  /**
   * title → epoch ms when the task looked and found NOTHING TO DO.
   *
   * A third bucket, not folded into `done`, because the two mean different things and
   * want different lifetimes. `done` is "we changed this"; `clean` is "we looked, the
   * page did not need us". Recording it is not optional bookkeeping — leaving it out
   * wedged وظیفهٔ ۳ for nine days (see CLEAN_TTL_DAYS).
   */
  clean: Record<string, number>;
  /** true when this was read from the pre-timestamp array format */
  migrated: boolean;
}

/**
 * How long a "nothing to do here" verdict is trusted.
 *
 * Not the task's own `recheckAfterDays`, and deliberately never infinite. A page that
 * needs no work today can acquire the defect tomorrow, so a permanent clean stamp would
 * hide it forever in a task whose target list is defect-driven. 30 days bounds that to one
 * month while still letting a capped run walk a frozen list of 80,000 titles — which takes
 * about 13 days at وظیفهٔ ۳'s rate — without the start of the list expiring behind it.
 */
export const CLEAN_TTL_DAYS = 30;

/**
 * Parse whatever is on disk, tolerating the legacy `{done: [...], deferred: [...]}`.
 *
 * Legacy entries carry no timestamp. They are stamped with `now` rather than
 * treated as expired, so migrating cannot trigger an immediate full re-sweep —
 * the first eligible re-check is a whole TTL away.
 */
export function loadCheckpoint(raw: unknown, now = Date.now()): Checkpoint {
  const obj = (raw ?? {}) as Record<string, unknown>;
  let migrated = false;
  const coerce = (v: unknown): Record<string, number> => {
    if (Array.isArray(v)) {
      migrated = true;
      return Object.fromEntries((v as string[]).map(t => [t, now]));
    }
    if (v && typeof v === 'object') {
      // drop anything non-numeric rather than letting a NaN make a title
      // permanently eligible (or permanently parked) by accident
      const out: Record<string, number> = {};
      for (const [k, n] of Object.entries(v as Record<string, unknown>)) {
        if (typeof n === 'number' && Number.isFinite(n)) out[k] = n;
        else { out[k] = now; migrated = true; }
      }
      return out;
    }
    return {};
  };
  const done = coerce(obj.done);
  const deferred = coerce(obj.deferred);
  // Absent in v1/v2 files: an older checkpoint simply has no clean verdicts recorded, and
  // those pages get looked at once more. That is the safe direction.
  const clean = coerce(obj.clean);
  return { done, deferred, clean, migrated };
}

export function serializeCheckpoint(cp: Checkpoint): string {
  return JSON.stringify({ v: 3, done: cp.done, deferred: cp.deferred, clean: cp.clean });
}

/**
 * Should this title be skipped this run?
 *
 * `recheckAfterDays` falsy (the default) reproduces the old behaviour exactly:
 * present in either set → always skipped.
 */
export function isParked(cp: Checkpoint, title: string, recheckAfterDays = 0, now = Date.now()): boolean {
  // A clean verdict always expires, whatever the task says about its own TTL.
  const cleanAt = cp.clean[title];
  if (cleanAt !== undefined && now - cleanAt < CLEAN_TTL_DAYS * 86400_000) return true;
  const at = cp.done[title] ?? cp.deferred[title];
  if (at === undefined) return false;
  if (!recheckAfterDays) return true;
  return now - at < recheckAfterDays * 86400_000;
}

/** has this title been seen before, regardless of whether it is still parked? */
export function isKnown(cp: Checkpoint, title: string): boolean {
  return cp.done[title] !== undefined || cp.deferred[title] !== undefined
    || cp.clean[title] !== undefined;
}

/**
 * Record a title as handled. Moving a title into `done` clears any earlier
 * `deferred` stamp, so a page that was once parked for review and has since
 * been fixed does not keep the stale entry — `isParked` reads whichever of the
 * two it finds first, and a leftover would make the newer stamp unreachable.
 */
export function markDone(cp: Checkpoint, title: string, now = Date.now()) {
  cp.done[title] = now;
  delete cp.deferred[title];
  // …and any earlier clean verdict: the page did need work after all, and leaving both
  // stamps would let the shorter-lived one decide how long the page stays parked.
  delete cp.clean[title];
}

export function markDeferred(cp: Checkpoint, title: string, now = Date.now()) {
  cp.deferred[title] = now;
  delete cp.done[title];
  delete cp.clean[title];
}

/**
 * Record that the task looked at this title and found nothing to change.
 *
 * MUST be called for that outcome. Every other verdict — edited, missing, opted out,
 * parked for review — wrote to the checkpoint, and "nothing to do" alone wrote nothing.
 * For a task that walks a FROZEN list under a `--limit` cap that is a permanent wedge, not
 * a slow leak: the run takes the first N titles that are not parked, and if those N all
 * come back "nothing to do" then nothing is recorded, so the next run takes the very same
 * N. وظیفهٔ ۳ sat on the identical 250 titles, starting «سزار ای. رادنی», every hour for
 * nine days — exit code 0, no error in the log, «پردازش=250» every time, and the
 * «پردازش‌شدهٔ پیشین» counter frozen at 6,999 as the only visible symptom.
 */
export function markClean(cp: Checkpoint, title: string, now = Date.now()) {
  cp.clean[title] = now;
  delete cp.done[title];
  delete cp.deferred[title];
}
