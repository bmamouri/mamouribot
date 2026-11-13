/**
 * وظیفهٔ ۱۸'s own persisted state: which portals are up next, and where each
 * portal's candidate screening left off.
 *
 * Deliberately NOT core.ts's per-task checkpoint (`done`/`deferred`/`clean`): that
 * checkpoint parks a TITLE permanently once seen, which is wrong here — the same
 * article can be a genuine candidate for portal A this round and portal B five
 * rounds later, and parking it after round one would hide it from every later
 * portal forever. See `BUILDING-A-TASK.md`'s `ignoreCheckpoint`, which this task
 * sets for exactly that reason; `portal-links.ts` tracks its own idempotency
 * instead, via `hasPortal()` re-checked at screen time and at write time.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname } from 'path';

export interface RotationState {
  /** index into the (freshly re-derived, alphabetically sorted) portal list */
  pointer: number;
  /** portal name -> index into its OWN candidate list to resume screening from */
  cursors: Record<string, number>;
}

const STATE_DIR = () => `${process.env.BOT_STATE_DIR ?? '.state'}/task-18`;
const ROTATION_PATH = () => `${STATE_DIR()}/rotation.json`;

export function loadRotation(): RotationState {
  const p = ROTATION_PATH();
  if (!existsSync(p)) return { pointer: 0, cursors: {} };
  try {
    const raw = JSON.parse(readFileSync(p, 'utf8'));
    return {
      pointer: Number.isFinite(raw.pointer) ? raw.pointer : 0,
      cursors: typeof raw.cursors === 'object' && raw.cursors ? raw.cursors : {},
    };
  } catch {
    return { pointer: 0, cursors: {} }; // a corrupt file must not crash a continuous task
  }
}

export function saveRotation(s: RotationState) {
  mkdirSync(dirname(ROTATION_PATH()), { recursive: true });
  writeFileSync(ROTATION_PATH(), JSON.stringify(s, null, 1));
}

/**
 * The next `count` portals to work this run, wrapping around the (freshly
 * discovered) list. Saved to disk IMMEDIATELY by the caller, before any network
 * work for those portals starts, so a crash mid-run still advances the rotation
 * rather than re-selecting the same portals forever.
 */
export function pickNext(portals: string[], pointer: number, count: number): { chosen: string[]; nextPointer: number } {
  if (!portals.length) return { chosen: [], nextPointer: 0 };
  const n = Math.min(count, portals.length);
  const start = ((pointer % portals.length) + portals.length) % portals.length;
  const chosen = Array.from({ length: n }, (_, i) => portals[(start + i) % portals.length]);
  return { chosen, nextPointer: (start + n) % portals.length };
}

/**
 * Slice `items` starting at `cursor`, wrapping around, up to `maxScan` items —
 * so a large portal's tail is eventually reached instead of only ever screening
 * the same alphabetically-first candidates every visit.
 */
export function sliceFromCursor<T>(items: T[], cursor: number, maxScan: number): { slice: T[]; nextCursor: number } {
  if (!items.length) return { slice: [], nextCursor: 0 };
  const start = ((cursor % items.length) + items.length) % items.length;
  const n = Math.min(maxScan, items.length);
  const slice = Array.from({ length: n }, (_, i) => items[(start + i) % items.length]);
  const nextCursor = (start + n) % items.length;
  return { slice, nextCursor };
}
