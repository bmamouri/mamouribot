/**
 * How long to wait before the next write, decided from what the SERVER says rather than
 * from a constant.
 *
 * WHAT THE API ACTUALLY OFFERS — probed against fa.wikipedia on ۸ اکتبر ۲۰۲۶
 * ---------------------------------------------------------------------------
 * There is no endpoint that answers "is now a good time to run". The server-load signal
 * is these four things and nothing else:
 *
 *   1. `maxlag=N` on a request. If replica lag exceeds N the request is REJECTED with
 *      `error.code = 'maxlag'` carrying the exact `lag` and the lagging `host`.
 *   2. A **`Retry-After`** response header on that rejection — the server stating how
 *      long to wait. On WMF wikis it is 5.
 *   3. An **`X-Database-Lag`** response header, also only on a rejection.
 *   4. `action=query&meta=siteinfo&siprop=dbrepllag`, which reports current replica lag
 *      on demand, without writing anything. This is the only way to see lag BEFORE being
 *      rejected: headers 2 and 3 are absent from successful responses (verified).
 *
 * WHAT PYWIKIBOT DOES, since that is the comparison that prompted this
 * --------------------------------------------------------------------
 * From `pywikibot/throttle.py::get_delay`:
 *
 *     current_delay = max(self.mindelay,        # local config
 *                         self.retry_after,     # server-driven
 *                         min(self.writedelay, self.maxdelay))   # local config
 *     return current_delay * self.process_multiplicity
 *
 * So pywikibot does not predict server load or pick an idle moment. It takes a locally
 * configured floor, raises it to whatever `Retry-After` the server last asked for, and
 * divides the resulting rate among its own concurrent processes. The reputation for being
 * "server-aware" rests on honouring `Retry-After` — which is exactly the part this
 * framework was missing, and the reason this file exists.
 *
 * WHAT THIS DOES
 * --------------
 * The same `max()` of a floor and the server's `Retry-After`, plus two things:
 *
 *   - it reads measured lag from `dbrepllag` and slides the gap between a floor and a
 *     ceiling, so the bot slows down BEFORE the server starts rejecting it rather than
 *     after. That is more conservative than pywikibot, not cleverer: pywikibot ignores
 *     lag until it is refused.
 *   - it counts other live runs of the same bot and shares the rate between them, which
 *     is pywikibot's `process_multiplicity`. Two overlapping Toolforge jobs otherwise
 *     each pace themselves and together hit the wiki at twice the intended rate.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';

export interface PacerOptions {
  /** Never go faster than this between writes. The courtesy floor. */
  floorMs: number;
  /** Never go slower than this from lag alone; `Retry-After` may still exceed it. */
  ceilMs: number;
  /** Lag at or below which the server is considered healthy and the floor applies. */
  healthyLagS?: number;
  /** Lag at or above which the ceiling applies. Defaults to the run's maxlag. */
  busyLagS?: number;
  /**
   * How the gap is randomised. A bot on an exact metronome is a recognisable pattern, and
   * for the human account an unvarying cadence is the thing that gives it away.
   *
   *  - `proportional`: ±`jitter` around the computed gap, CLAMPED so it can never fall
   *    below `floorMs`. For the bot account, where the floor is a courtesy commitment.
   *  - `uniform-to-ceiling`: uniform between the computed gap and `ceilMs`. This is what
   *    the human account needs, because AGENTS.md requires «a random 30-120s after every
   *    write (not a fixed cadence)» — a floor plus a small wobble is not that, and an
   *    earlier version of this file produced 15s gaps for a 30s floor by multiplying
   *    downward.
   */
  spread?: 'proportional' | 'uniform-to-ceiling';
  /** Magnitude for `proportional`. Ignored by `uniform-to-ceiling`. */
  jitter?: number;
}

export class Pacer {
  private retryAfterMs = 0;
  private lagS: number | null = null;
  private concurrency = 1;
  private readonly healthyLagS: number;
  private readonly busyLagS: number;
  private readonly jitter: number;
  private readonly spread: 'proportional' | 'uniform-to-ceiling';

  constructor(private opts: PacerOptions) {
    this.healthyLagS = opts.healthyLagS ?? 1;
    this.busyLagS = Math.max(opts.busyLagS ?? 5, this.healthyLagS + 0.001);
    this.jitter = opts.jitter ?? 0;
    this.spread = opts.spread ?? 'proportional';
  }

  /**
   * The server asked us to wait. Recorded as a FLOOR for the next gap, not as a sleep:
   * the caller may already be sleeping for other reasons, and `Retry-After` is a minimum.
   */
  noteRetryAfter(seconds: number) {
    if (Number.isFinite(seconds) && seconds > 0) {
      this.retryAfterMs = Math.max(this.retryAfterMs, seconds * 1000);
    }
  }

  /** Measured replica lag, from `siprop=dbrepllag` or from a maxlag rejection. */
  noteLag(seconds: number) {
    if (Number.isFinite(seconds) && seconds >= 0) this.lagS = seconds;
  }

  noteConcurrency(n: number) { this.concurrency = Math.max(1, n); }

  /**
   * Take the pending `Retry-After`, in ms, and clear it. 0 when the server did not ask.
   *
   * For the retry loop, which must sleep RIGHT NOW rather than fold the instruction into
   * the next inter-write gap. Whichever consumer gets there first wins, which is correct:
   * the instruction describes one wait, and honouring it twice would double it.
   */
  takeRetryAfterMs(): number {
    const ms = this.retryAfterMs;
    this.retryAfterMs = 0;
    return ms;
  }

  /** Lag-driven component, before the floor, the ceiling and `Retry-After` apply. */
  private lagComponentMs(): number {
    if (this.lagS === null || this.lagS <= this.healthyLagS) return this.opts.floorMs;
    if (this.lagS >= this.busyLagS) return this.opts.ceilMs;
    const t = (this.lagS - this.healthyLagS) / (this.busyLagS - this.healthyLagS);
    return this.opts.floorMs + t * (this.opts.ceilMs - this.opts.floorMs);
  }

  /**
   * The gap to wait now, and why — the reason is logged, because a bot that silently
   * changes its own pace is one nobody can review.
   *
   * `Retry-After` is applied AFTER the ceiling, deliberately: the ceiling bounds what we
   * choose for ourselves, while a server instruction is not ours to cap.
   */
  nextGap(): { ms: number; why: string } {
    const lagMs = Math.min(this.lagComponentMs(), this.opts.ceilMs);
    let ms = Math.max(this.opts.floorMs, lagMs);
    let why = this.lagS === null ? 'floor (lag unknown)'
      : ms > this.opts.floorMs ? `lag ${this.lagS.toFixed(2)}s`
      : `floor (lag ${this.lagS.toFixed(2)}s)`;

    if (this.retryAfterMs > ms) {
      ms = this.retryAfterMs;
      why = `Retry-After ${(this.retryAfterMs / 1000).toFixed(0)}s`;
    }
    // Consumed: it describes one instruction, not a standing state.
    this.retryAfterMs = 0;

    if (this.concurrency > 1) {
      ms *= this.concurrency;
      why += `, shared with ${this.concurrency - 1} other run(s)`;
    }
    if (this.spread === 'uniform-to-ceiling') {
      const lo = ms, hi = Math.max(lo, this.opts.ceilMs);
      ms = lo + Math.random() * (hi - lo);
      why += `, پخش تصادفی ${Math.round(lo / 1000)}-${Math.round(hi / 1000)}s`;
    } else if (this.jitter > 0) {
      // Clamped at the floor: the floor is a commitment, so randomness may lengthen a
      // gap but never shorten it past what was promised.
      ms = Math.max(this.opts.floorMs, ms * (1 + (Math.random() * 2 - 1) * this.jitter));
    }
    return { ms: Math.round(ms), why };
  }
}

// ---------------------------------------------------------------------------
// Counting our own concurrent runs
// ---------------------------------------------------------------------------

/**
 * pywikibot's `process_multiplicity`, done with heartbeat files.
 *
 * Toolforge jobs can overlap: a long task-03 run and a scheduled task-05 run are two
 * processes editing as the same account, and if each honours a 10s gap the wiki sees an
 * edit every 5s. Each run touches a file in the state directory; a run is "live" if its
 * heartbeat is recent. Stale files are cleaned up so a killed job stops counting.
 *
 * Deliberately NOT a lock: a second run must be slowed, never blocked, because blocking
 * would turn an overlap into a job that silently does nothing.
 */
export class RunRegistry {
  private readonly dir: string;
  private readonly file: string;
  private closed = false;

  constructor(stateDir: string, private readonly id = `${process.pid}-${Date.now()}`,
              private readonly staleMs = 120_000) {
    this.dir = join(stateDir, 'runs');
    this.file = join(this.dir, `${this.id}.json`);
  }

  /** Record that this run is alive, and return how many runs are currently live. */
  beat(now = Date.now()): number {
    if (this.closed) return 1;
    mkdirSync(this.dir, { recursive: true });
    writeFileSync(this.file, JSON.stringify({ pid: process.pid, at: now }));
    let live = 0;
    for (const name of readdirSync(this.dir)) {
      if (!name.endsWith('.json')) continue;
      const p = join(this.dir, name);
      try {
        const { at } = JSON.parse(readFileSync(p, 'utf8')) as { at: number };
        if (now - at <= this.staleMs) live++;
        else rmSync(p, { force: true });
      } catch {
        // An unreadable heartbeat is a half-written or corrupt file: drop it rather than
        // letting it either crash the run or inflate the count forever.
        rmSync(p, { force: true });
      }
    }
    return Math.max(1, live);
  }

  close() {
    this.closed = true;
    if (existsSync(this.file)) rmSync(this.file, { force: true });
  }
}
