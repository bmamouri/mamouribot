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
  /** true when this was read from the pre-timestamp array format */
  migrated: boolean;
}

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
  return { done, deferred, migrated };
}

export function serializeCheckpoint(cp: Checkpoint): string {
  return JSON.stringify({ v: 2, done: cp.done, deferred: cp.deferred });
}

/**
 * Should this title be skipped this run?
 *
 * `recheckAfterDays` falsy (the default) reproduces the old behaviour exactly:
 * present in either set → always skipped.
 */
export function isParked(cp: Checkpoint, title: string, recheckAfterDays = 0, now = Date.now()): boolean {
  const at = cp.done[title] ?? cp.deferred[title];
  if (at === undefined) return false;
  if (!recheckAfterDays) return true;
  return now - at < recheckAfterDays * 86400_000;
}

/** has this title been seen before, regardless of whether it is still parked? */
export function isKnown(cp: Checkpoint, title: string): boolean {
  return cp.done[title] !== undefined || cp.deferred[title] !== undefined;
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
}

export function markDeferred(cp: Checkpoint, title: string, now = Date.now()) {
  cp.deferred[title] = now;
  delete cp.done[title];
}
