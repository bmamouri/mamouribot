/**
 * What the patrol has done, persisted so a restart neither double-acts nor forgets.
 *
 * One JSON file in BOT_STATE_DIR. Small: a few actions a day, pruned to 30 days.
 * Decisions themselves go to an append-only JSONL beside it, for the backtest and the
 * weekly false-positive summary.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { join } from 'path';

export interface ActionRecord {
  ts: string;          // ISO
  page: string;
  user: string;        // the editor acted against
  kind: 'revert' | 'tag' | 'report-page' | 'report-user';
  revid?: number;      // the bot's own revision, to detect a human undoing it
}

export interface LedgerState {
  /** Highest rcid fully processed. */
  lastRcId: number;
  actions: ActionRecord[];
  /** `page|user` pairs a human has undone the bot on. Never acted on again. */
  burned: string[];
  /** When the review page was last rebuilt, and the newest report it held (ISO). */
  reviewPublishedAt?: string;
  reviewNewest?: string;
}

const pair = (page: string, user: string) => `${page}|${user}`;

export class Ledger {
  state: LedgerState;
  private readonly file: string;
  private readonly log: string;

  constructor(dir = process.env.BOT_STATE_DIR ?? '.state') {
    mkdirSync(dir, { recursive: true });
    this.file = join(dir, 'wikt-patrol.json');
    this.log = join(dir, 'wikt-patrol.decisions.jsonl');
    this.state = existsSync(this.file)
      ? JSON.parse(readFileSync(this.file, 'utf8'))
      : { lastRcId: 0, actions: [], burned: [] };
  }

  save() {
    const cutoff = Date.now() - 30 * 86_400_000;
    this.state.actions = this.state.actions.filter(a => Date.parse(a.ts) >= cutoff);
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.state, null, 1));
    renameSync(tmp, this.file);
  }

  record(a: ActionRecord) { this.state.actions.push(a); this.save(); }

  decision(row: object) { appendFileSync(this.log, JSON.stringify(row) + '\n'); }

  /** Every decision row still on disk (the JSONL is append-only). */
  decisions(): any[] {
    if (!existsSync(this.log)) return [];
    return readFileSync(this.log, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
  }

  burn(page: string, user: string) {
    const k = pair(page, user);
    if (!this.state.burned.includes(k)) { this.state.burned.push(k); this.save(); }
  }
  isBurned(page: string, user: string) { return this.state.burned.includes(pair(page, user)); }

  private since(ms: number, now: number) {
    return this.state.actions.filter(a => now - Date.parse(a.ts) < ms);
  }
  actedOnPairToday(page: string, user: string, now = Date.now()) {
    return this.since(86_400_000, now).some(a => a.page === page && a.user === user
      && (a.kind === 'revert' || a.kind === 'tag'));
  }
  writesInLastHour(now = Date.now()) { return this.since(3_600_000, now).length; }
  actionsToday(now = Date.now()) {
    return this.since(86_400_000, now).filter(a => a.kind === 'revert' || a.kind === 'tag').length;
  }
  revertsOnPageToday(page: string, now = Date.now()) {
    return this.since(86_400_000, now).filter(a => a.page === page && a.kind === 'revert').length;
  }
  revertsOfUserToday(user: string, now = Date.now()) {
    return this.since(86_400_000, now).filter(a => a.user === user && a.kind === 'revert').length;
  }
  reportedToday(kind: 'report-page' | 'report-user', key: string, now = Date.now()) {
    return this.since(86_400_000, now).some(a => a.kind === kind && (kind === 'report-page' ? a.page : a.user) === key);
  }
}
