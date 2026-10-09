/**
 * MamouriBot — core framework for compliant, automated fa.wikipedia cleanup.
 *
 * Designed to satisfy fa.wiki bot policy (ویکی‌پدیا:سیاست ربات‌رانی):
 *   - separate bot account (WIKIPEDIA_BOT_USERNAME / WIKIPEDIA_BOT_PASSWORD in .env)
 *   - maxlag=5 on every write (server-friendly; auto-retry on lag)
 *   - throttling: configurable min delay between edits (default 10s)
 *   - emergency stop:
 *       (a) detects blocked/readonly API errors and halts immediately
 *           (matches fa.wiki's {{دکمه خاموش اضطراری}} admin-block convention)
 *       (b) polls a run page (کاربر:MamouriBot/توقف) before each edit — any
 *           value other than the "go" keyword halts the bot (belt-and-suspenders)
 *       (c) SIGINT (Ctrl-C) stops cleanly after the current page
 *   - respects opt-out: skips pages bearing {{nobots}} / {{bots|deny=...}}
 *   - marks edits with bot=1 and a Persian edit summary
 *   - resumable: per-task state file records processed titles
 *   - dry-run mode: computes diffs without writing (reads need no login)
 *
 * One BotTask = one BRFA-approved task. Tasks are pure-ish: getTargets() +
 * transform(). Add new cleanup tasks under src/tasks/ without touching
 * this core.
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { Pacer, RunRegistry } from './pacing.js';
import { brfaPage, fitsSummaryLimit, withBrfaLink } from './brfa.js';
import { dirname } from 'path';
import { isKnown, isParked, loadCheckpoint, markDeferred, markDone, serializeCheckpoint } from './lib/checkpoint.js';

// --- .env loader (same inline pattern as the rest of the repo) ---
// Optional: on Toolforge there is no .env — credentials arrive as real environment
// variables via `toolforge envvars create`, and the tool's git repo is PUBLIC, so a
// committed .env would leak them. Absent file = fall through to process.env.
//
// `../.env` is checked too, and that is not a convenience: this repository is checked
// out as the `bots/` submodule of the companion repo, which is where the single `.env`
// lives. Running `npx tsx src/run.ts` from inside `bots/` therefore found no credentials
// at all, and the only workarounds are to duplicate the secrets into a second file or to
// pass them on a command line where `ps` can read them. Neither is acceptable.
for (const candidate of ['.env', '../.env']) {
  if (!existsSync(candidate)) continue;
  for (const line of readFileSync(candidate, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

export const FA_API = 'https://fa.wikipedia.org/w/api.php';
/** Read-only, for the langlink lookups وظیفهٔ ۱۲ needs. The bot never writes here. */
export const EN_API = 'https://en.wikipedia.org/w/api.php';
/**
 * Self-identifying User-Agent, in the shape Wikimedia's API policy asks for and
 * the one Pywikibot sends: bot name, wiki, operating account, then the runtime.
 *
 * A bot must NOT pose as a browser. The fa.wikipedia bot review is explicit about it
 * («لطفاً در کدتان مقدار UA را تغییر دهید تا ادای یک مرورگر ساده را در نیاورد»), and a
 * truthful UA is what lets the WMF ops team map traffic back to this account and to the
 * operator page when something goes wrong.
 */
export const BOT_NAME = 'MamouriBot';
// ASCII only: an HTTP header value cannot carry Persian text (it is latin-1), so the
// operator page is referenced by its canonical URL rather than its Persian title.
export const BOT_UA = `${BOT_NAME}/1.0 (wikipedia:fa; User:${BOT_NAME}; https://fa.wikipedia.org/wiki/User:${BOT_NAME}) mamouribot-core/1.0 Node.js/${process.versions.node}`;

/**
 * The User-Agent for a run that edits as the HUMAN operator rather than as the bot.
 *
 * The cover rule inverts between the two identities and both halves matter. `MamouriBot`
 * is an approved bot and must self-identify, which the وظیفهٔ ۹ review required;
 * `Mamouri` is a person editing from a browser and uses the browser's string. Sending
 * BOT_UA while authenticated as `Mamouri` would be the worst of both: traffic that
 * announces itself as an automated bot against edits attributed to a human account.
 * See docs/reference/mediawiki-api.md and lessons/api-and-permissions/bot-ua-must-not-pose-as-browser.md.
 */
export const HUMAN_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Brave/1.71 Chrome/130.0.0.0 Safari/537.36';

/** Page the operator/any editor can edit to halt the bot without an admin block. */
export const STOP_PAGE = 'کاربر:MamouriBot/توقف';
/**
 * Consecutive failures to READ the stop page before the run halts itself.
 *
 * Fail-open on one failure, fail-closed on a pattern. An unreadable kill switch is not a
 * kill switch, and carrying on indefinitely while unable to check it is exactly the
 * situation the switch exists for.
 */
export const MAX_STOP_READ_FAILURES = 3;
/** The only value on STOP_PAGE that lets the bot keep editing. */
const STOP_GO_KEYWORD = 'بله';

export interface BotTask {
  /** stable id, used for the state file name */
  id: string;
  /** BRFA task number (وظیفه N) */
  taskNumber: number;
  /** Persian edit summary (<~150 chars; AbuseFilter #221) */
  summary: string;
  /** human-readable description (for logs / BRFA) */
  description: string;
  /** Re-examine a title this many days after it was last touched.
   *  Omit (the default) to keep the historical behaviour: a title parked in the
   *  checkpoint is never looked at again. Set it for a CONTINUOUS task whose
   *  tracking category keeps gaining members, so a page that gets re-broken — or
   *  one deferred by code that has since improved — is not skipped forever. */
  recheckAfterDays?: number;
  /** Process a target that DOES NOT EXIST, passing '' to transform(), so the
   *  task can create it. Off by default: for an ordinary cleanup task a missing
   *  page is nothing to do, and silently creating pages would be a surprise. */
  createsMissing?: boolean;
  /** list of page titles to process */
  getTargets(bot: Bot): Promise<string[]>;
  /** pure transform: given current wikitext return new text + whether it changed.
   *  `manualReview` marks a no-change result that needs a human (e.g. a value clash) so
   *  the runner defers it instead of re-processing it every run. */
  transform(text: string, title: string): { text: string; changed: boolean; note?: string; manualReview?: boolean };
  /**
   * Optional per-edit proof, run after transform() and after the built-in render
   * guard, before anything is written. Return `ok: false` to refuse the save.
   *
   * The built-in guard counts render-error markers before and after, which can
   * only ever catch an edit that ADDS an error. It is blind by construction to
   * an edit that removes content — the failure mode recorded in
   * lessons/scripts-and-batch/never-wholesale-replace-article.md and
   * enrich-must-not-drop-blue-seealso.md, where the page rendered perfectly
   * cleanly and had simply lost most of itself. A task whose edit is a DELETION
   * needs to prove what it deleted, and that proof is task-specific: this is
   * where it goes.
   */
  verify?(bot: Bot, title: string, oldText: string, newText: string): Promise<{ ok: boolean; detail: string }>;
  /**
   * Optional post-run publication of whatever the task REFUSED to touch.
   *
   * Called once after the last write. A task that declines work silently is
   * indistinguishable from a task with nothing to do: وظیفهٔ ۱۱ ran live, set
   * 119 items aside as needing a human, and left its report page still reading
   * "the bot has not run yet". The refusals are the part a human has to act on,
   * so publishing them is not optional bookkeeping — it is the deliverable.
   *
   * Receives `dryRun` so it can print instead of saving.
   */
  report?(bot: Bot, dryRun: boolean): Promise<void>;
}

export interface RunOptions {
  dryRun: boolean;
  delayMs: number;
  limit: number;          // 0 = no limit
  maxlag: number;
  /**
   * Which account the run authenticates as.
   *
   * `bot` is the normal case: MamouriBot, under an approved BRFA, bot-flagged edits,
   * self-identifying UA.
   *
   * `human` exists so the operator can trial a change on his OWN account before a task
   * (or a widened scope) is approved for the bot. Those edits are not bot edits: they
   * are not flagged, they appear in recent changes where other editors can see them, and
   * they are paced to the slower human cadence AGENTS.md requires. It is a different
   * identity, not a flag on the same one — see `identityConfig()`.
   */
  identity?: 'bot' | 'human';
  /**
   * Whether writes carry `bot=1`, independent of WHICH account makes them.
   *
   * Defaults to the identity's own default (bot → flagged, human → not). Set it to
   * `false` to have MamouriBot edit **visibly**, in recent changes and on watchlists.
   *
   * This exists because the two were conflated and a BAG member's answer pulled them
   * apart. Rejecting the وظیفهٔ ۱۳ request, Huji wrote: «چنین رباتی مجوز نمی‌خواهد و
   * ویرایش‌هایش را بدون پرچم ربات انجام دهد بهتر است. پرچم ربات برای ویرایش‌های متعدد
   * است تا از شلوغ شدن تغییرات اخیر و فهرست پی‌گیری جلوگیری کند. رباتی که روزی یکبار یک
   * صفحهٔ گزارش را به‌روز می‌کند نیازی به مجوز و پرچم ندارد.» — the flag is a
   * flood-control device, so a task that writes one page a day should NOT use it.
   *
   * The flag is per-edit opt-in, not a property of the account: verified on fa
   * ۹ اکتبر ۲۰۲۶ with two consecutive edits from MamouriBot, which is in the `bot`
   * group. Without `bot=1`, `list=recentchanges` reports `bot: false`; with it,
   * `bot: true`. So an unflagged task needs **no second credential** — a conclusion
   * worth keeping, because the obvious reading of that answer is "run it as the human
   * account" and that would mean putting the operator's password on Toolforge.
   */
  flagEdits?: boolean;
}

/** Everything that differs between the two identities, in one place. */
function identityConfig(identity: 'bot' | 'human' = 'bot') {
  return identity === 'human'
    ? { ua: HUMAN_UA, userEnv: 'WIKIPEDIA_USERNAME', passEnv: 'WIKIPEDIA_PASSWORD',
        botFlag: false, requireBotGroup: false }
    : { ua: BOT_UA, userEnv: 'WIKIPEDIA_BOT_USERNAME', passEnv: 'WIKIPEDIA_BOT_PASSWORD',
        botFlag: true, requireBotGroup: true };
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Result of the write-free prepare() step, consumed by the serial writer. */
type Prepared =
  | { kind: 'missing'; title: string }
  | { kind: 'optout'; title: string }
  | { kind: 'nochange'; title: string; note?: string; manual?: boolean }
  | { kind: 'regressed'; title: string; detail: string }
  | { kind: 'error'; title: string; msg: string }
  // oldText rides along purely so a dry run can show a real diff. A BRFA trial has to
  // be reported with actual before/after lines, and «(آماده: <title>)» proves nothing
  // to a reviewer.
  | { kind: 'ready'; title: string; oldText: string; newText: string; revid: number; basetimestamp: string; note?: string };

export class Bot {
  private cookies = new Map<string, string>();
  private csrf: string | null = null;
  private loggedIn = false;
  /** Authenticated username, used to hard-gate every write against session loss. */
  private username: string | null = null;
  private stopRequested = false;
  /** Serialised min-spacing for GETs, so bursty enumeration (categorymembers paging) stays under the API's rate limit. */
  private getGate: Promise<void> = Promise.resolve();
  private readonly minGetGapMs = 1200;

  /** Which account this run writes as, and everything that differs because of it. */
  private readonly id: ReturnType<typeof identityConfig>;
  /** Decides the gap before each write from what the server reports. See src/pacing.ts. */
  private readonly pacer: Pacer;
  /** Counts other live runs of this bot, so they share one rate rather than doubling it. */
  private readonly runs: RunRegistry;
  /** Writes since the last `dbrepllag` poll. */
  private sinceLagPoll = Number.MAX_SAFE_INTEGER;
  /** Resolved once per run: does this task's permission page exist to link to? */
  private brfaLinkable: boolean | null = null;
  /** Consecutive failures reading the stop page; see MAX_STOP_READ_FAILURES. */
  private stopReadFailures = 0;

  constructor(public opts: RunOptions) {
    // Assigned in the body, not as a field initializer: a field initializer that reads
    // `this.opts` depends on when TS emits parameter-property assignments relative to
    // field initializers, and getting the bot's identity from an evaluation-order
    // subtlety is not a thing to leave to chance.
    this.id = identityConfig(opts.identity);
    // `flagEdits` overrides only the flag, never the account or the UA. See RunOptions.
    if (opts.flagEdits !== undefined) this.id = { ...this.id, botFlag: opts.flagEdits };
    // The human account's 30-120s spread is a COVER requirement, not a performance one
    // (AGENTS.md), so its floor and ceiling are that range and the pacer may not shrink
    // it when the server is idle. The bot account's floor is --delay and it is free to
    // slow down on lag.
    this.pacer = opts.identity === 'human'
      ? new Pacer({ floorMs: Math.max(30_000, opts.delayMs), ceilMs: 120_000,
                    busyLagS: opts.maxlag, spread: 'uniform-to-ceiling' })
      : new Pacer({ floorMs: opts.delayMs, ceilMs: Math.max(opts.delayMs * 6, 60_000),
                    busyLagS: opts.maxlag, jitter: 0.1 });
    this.runs = new RunRegistry(process.env.BOT_STATE_DIR ?? '.state');
    process.on('SIGINT', () => {
      console.log('\n⏹  دریافت SIGINT — پس از پایان صفحهٔ جاری متوقف می‌شوم…');
      this.stopRequested = true;
    });
  }

  // ---------- low-level HTTP ----------
  private cookieHeader() { return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; '); }
  private remember(res: Response) {
    for (const sc of res.headers.getSetCookie?.() ?? []) {
      const [n, v] = sc.split(';')[0].split('=');
      if (n && v) this.cookies.set(n.trim(), v.trim());
    }
  }
  /**
   * fetch + parse with retry/backoff on transient failures (429 / non-JSON throttle
   * pages / network).
   *
   * `Retry-After` is read off EVERY response and handed to the pacer. The server sends it
   * on a maxlag rejection and on a 429, and it states exactly how long to wait — the one
   * piece of load information the API volunteers without being asked. This framework used
   * to discard it and substitute a guess (`lag + 1`, or an exponential backoff), which is
   * essentially the whole of what pywikibot does differently. See src/pacing.ts.
   */
  private async request(init: () => Promise<Response>): Promise<any> {
    for (let attempt = 0; ; attempt++) {
      let json: any;
      try {
        const r = await init();
        this.remember(r);
        const retryAfter = Number(r.headers.get('retry-after'));
        if (Number.isFinite(retryAfter) && retryAfter > 0) this.pacer.noteRetryAfter(retryAfter);
        const headerLag = Number(r.headers.get('x-database-lag'));
        if (Number.isFinite(headerLag)) this.pacer.noteLag(headerLag);
        const body = await r.text();
        // JSON body but the API says slow down → back off and retry
        if (r.status === 429) throw new Error('429');
        try { json = JSON.parse(body); }
        catch {
          // A 414 or a throttle page is HTML, not JSON. Retried, then surfaced.
          if (attempt >= 8) throw new Error(`rate-limited/non-JSON (status ${r.status}): ${body.slice(0, 80)}`);
          json = undefined;
        }
      } catch (e) {
        if (e instanceof BotStop) throw e;   // a deliberate halt is not transient
        if (attempt >= 8) throw e;
        json = undefined;
      }

      if (json !== undefined) {
        // maxlag is handled HERE so it covers every verb rather than only edits.
        //
        // The parameter used to be sent on writes only, so reads ran at full speed
        // through a lagged replica — and reads are most of what the bot does: target
        // enumeration, four concurrent prefetches, the pre-save render guard, the
        // post-save verification and the stop-page poll. The write would back off
        // politely while everything around it hammered the servers, which is not what
        // «maxlag=۵» in the permission requests promises.
        //
        // Handled OUTSIDE the parse try/catch on purpose: an earlier version threw the
        // fatal BotStop from inside it, where the bare `catch` swallowed it and replaced
        // it with a misleading "non-JSON" error.
        if (json?.error?.code === 'maxlag') {
          const lag = Number(json.error.lag);
          if (Number.isFinite(lag)) this.pacer.noteLag(lag);
          const wait = this.pacer.takeRetryAfterMs()
            || (Number.isFinite(lag) ? Math.min(60_000, (lag + 1) * 1000) : 5000);
          if (attempt === 0) {
            console.log(`  … maxlag ${json.error.lag}s روی ${json.error.host ?? '?'} — ${Math.round(wait / 1000)}s صبر`);
          }
          if (attempt >= 8) throw new BotStop('maxlag پایدار — توقف', true);
          await sleep(wait);
          continue;
        }
        return json;
      }

      // Obey the server's own figure when it gave one; fall back to exponential backoff
      // only when it did not.
      const asked = this.pacer.takeRetryAfterMs();
      await sleep(asked || Math.min(30000, 2000 * 2 ** attempt));
    }
  }
  /**
   * GETs go through a serial gate that enforces a minimum gap, preventing
   * burst-429 during enumeration.
   *
   * Every request below carries `AbortSignal.timeout`. A bare `fetch` has no
   * default timeout, and a connection that opens but never delivers bytes hangs
   * the awaiting promise FOREVER — no error, no log line, just a process at 0%
   * CPU with one lingering socket. That is invisible on a one-off run you are
   * watching, and fatal on an unattended job meant to run forever: the retry
   * loop in `request()` never even gets to fire, because the `await` it's
   * retrying around never resolves. See
   * lessons/scripts-and-batch/fetch-without-timeout-wedges-forever.md.
   */
  async apiGet(p: Record<string, string>): Promise<any> {
    return this.apiGetOn(FA_API, p);
  }

  /**
   * A read against ANOTHER wiki's API, through the same rate gate, timeout and
   * User-Agent as every other request this run makes.
   *
   * وظیفهٔ ۱۲ has to ask en.wikipedia for `prop=langlinks` to find out whether a Latin
   * link target has an fa article. Hand-rolling a second client for that would mean a
   * second place where the UA, the retry/backoff and the burst gate can drift from this
   * one — and the UA in particular is identity-sensitive, since it differs between the
   * bot and the human account. Reads are anonymous, so no session is involved.
   */
  async apiGetOn(api: string, p: Record<string, string>): Promise<any> {
    const wait = this.getGate.then(() => sleep(this.minGetGapMs));
    this.getGate = wait;
    await wait;
    // `maxlag` on READS too, not just writes. Omitted for `action=login`: combining it
    // with `assert` there risks an infinite recursion while the replicas are lagged, and
    // pywikibot and mwn both unset it for the same reason.
    const withLag = p.action === 'login'
      ? p
      : { maxlag: String(this.opts.maxlag), ...p };
    const qs = new URLSearchParams({ format: 'json', formatversion: '2', ...withLag });

    // Fall back to POST when the query string is too long for a URL.
    //
    // Every batched read in this repo sends `titles=a|b|c…` 50 at a time, which is the
    // documented API limit and is fine for ASCII. Percent-encoded Persian is about nine
    // bytes per character, so fifty real fa.wikipedia titles can exceed the ~8 KB the
    // front end accepts, and the reply is an HTML 414 page rather than JSON — which this
    // client reported as "rate-limited/non-JSON" and retried eight times before giving
    // up. `destub-watch` died that way on every run from ۴ اکتبر ۲۰۲۶ and silently
    // stopped advancing its watermark; the job showed as failing but the cause looked
    // like throttling.
    //
    // The API accepts read queries over POST, so this is a transport detail and nothing
    // for the fifteen call sites to think about. Done here rather than by shrinking every
    // batch, because the right batch size depends on the script of the titles.
    if (qs.toString().length > 6000) {
      return this.request(() => fetch(api, {
        method: 'POST',
        headers: { 'User-Agent': this.id.ua, 'Content-Type': 'application/x-www-form-urlencoded', Cookie: this.cookieHeader() },
        body: qs.toString(),
        signal: AbortSignal.timeout(60000),
      }));
    }
    return this.request(() => fetch(`${api}?${qs}`,
      { headers: { 'User-Agent': this.id.ua, Cookie: this.cookieHeader() }, signal: AbortSignal.timeout(60000) }));
  }
  async apiPost(p: Record<string, string>): Promise<any> {
    // Same as apiGet: `maxlag` unless this is the login round-trip. `edit()` already sets
    // it explicitly; the spread below keeps the caller's value when there is one.
    const withLag = p.action === 'login' ? p : { maxlag: String(this.opts.maxlag), ...p };
    return this.request(() => fetch(FA_API, {
      method: 'POST',
      headers: { 'User-Agent': this.id.ua, 'Content-Type': 'application/x-www-form-urlencoded', Cookie: this.cookieHeader() },
      body: new URLSearchParams({ format: 'json', formatversion: '2', ...withLag }).toString(),
      signal: AbortSignal.timeout(60000),
    }));
  }

  // ---------- auth (lazy: only needed for writes) ----------
  async login() {
    if (this.loggedIn) return;
    const user = process.env[this.id.userEnv];
    const pass = process.env[this.id.passEnv];
    if (!user || !pass) throw new Error(`${this.id.userEnv} / ${this.id.passEnv} غایب‌اند در .env`);
    const lt = (await this.apiGet({ action: 'query', meta: 'tokens', type: 'login' })).query.tokens.logintoken;
    const lr = await this.apiPost({ action: 'login', lgname: user, lgpassword: pass, lgtoken: lt });
    if (lr.login?.result !== 'Success') throw new Error(`login failed: ${JSON.stringify(lr.login)}`);
    this.csrf = (await this.apiGet({ action: 'query', meta: 'tokens' })).query.tokens.csrftoken;
    // Trust the API for who we actually are, not the configured string: a bot
    // password logs in as the OWNER account (`User@botname` → `User`).
    const ui = (await this.apiGet({ action: 'query', meta: 'userinfo', uiprop: 'groups' })).query.userinfo;
    if (ui.anon !== undefined || !ui.name) throw new Error('ورود ناموفق: نشست ناشناس');
    this.username = ui.name;
    this.loggedIn = true;
    const flagged = (ui.groups ?? []).includes('bot');
    // A human-identity run EXPECTS no bot flag, so the warning would be noise; but a
    // bot-identity run that has silently lost its flag must say so loudly.
    const note = this.id.requireBotGroup
      ? (flagged ? ' (پرچم‌دار)' : ' ⚠ بدون پرچم ربات')
      : ' (حساب انسانی؛ ویرایش‌ها پرچم ربات نمی‌خورند)';
    console.log(`✓ ورود با حساب ${ui.name}${note}`);
  }

  /**
   * How long to wait after a write.
   *
   * The bot runs on a fixed cadence set by --delay, which is what bot policy asks for.
   * The human account must NOT: AGENTS.md requires «a random 30-120s after every write
   * (not a fixed cadence)», because a human account editing on a metronome is exactly
   * what an unapproved bot looks like. delayMs is the floor, randomised upward.
   */
  private async writeGapMs(): Promise<number> {
    // Poll measured replica lag occasionally. One small query per 25 writes, and it is
    // the ONLY way to see lag before being rejected: the Retry-After and X-Database-Lag
    // headers are absent from successful responses (probed ۸ اکتبر ۲۰۲۶).
    if (this.sinceLagPoll >= 25) {
      this.sinceLagPoll = 0;
      try {
        const d = await this.apiGet({ action: 'query', meta: 'siteinfo', siprop: 'dbrepllag' });
        const lag = d.query?.dbrepllag?.[0]?.lag;
        if (typeof lag === 'number') this.pacer.noteLag(lag);
      } catch { /* a failed poll must never stop a run; the floor still applies */ }
    }
    this.sinceLagPoll++;
    try { this.pacer.noteConcurrency(this.runs.beat()); } catch { /* best effort */ }
    const { ms, why } = this.pacer.nextGap();
    if (ms > this.opts.delayMs * 1.5) console.log(`  ⏳ ${Math.round(ms / 1000)}s — ${why}`);
    return ms;
  }

  /**
   * The edit summary a task's writes should carry: its own text, prefixed with a link to
   * the permission that authorises it. See src/brfa.ts for the convention.
   *
   * Two cases deliberately get NO link:
   *
   *  - the permission page does not exist. Linking it would put a red link in every
   *    summary this run produces, and nothing else in this framework checks summaries for
   *    red links. وظیفهٔ ۱۳ and ۱۴ are in exactly that state.
   *  - the run is editing as the HUMAN operator (`--as-me`). Those are not bot edits:
   *    unflagged, hand-paced, and usually made precisely BECAUSE the bot is not approved
   *    for the scope yet. Claiming a permission on them would be a false statement about
   *    who made the edit and under what authority.
   */
  async summaryFor(task: BotTask): Promise<string> {
    if (this.opts.identity === 'human') return task.summary;
    if (this.brfaLinkable === null) {
      const page = brfaPage(task.taskNumber);
      try {
        const d = await this.apiGet({ action: 'query', titles: page, prop: 'info' });
        this.brfaLinkable = !d.query?.pages?.[0]?.missing;
      } catch { this.brfaLinkable = false; }
      if (!this.brfaLinkable) {
        console.warn(`  ⚠ «${page}» وجود ندارد — خلاصهٔ ویرایش بدون پیوند مجوز می‌رود`);
      }
    }
    if (!this.brfaLinkable) return task.summary;
    const full = withBrfaLink(task.taskNumber, task.summary);
    if (!fitsSummaryLimit(full)) {
      console.warn('  ⚠ خلاصه با پیوند از ۵۰۰ نویسه بیشتر می‌شود — بدون پیوند فرستاده شد');
      return task.summary;
    }
    return full;
  }

  // ---------- emergency-stop checks ----------
  /**
   * True if the bot must halt now (stop page flipped, or an admin block seen earlier).
   *
   * Called before EVERY edit. The page is the kill switch any editor can use: it works
   * while its content is exactly «بله», and blanking it or writing anything else stops
   * the bot. HTML comments are stripped first, because the live page carries its own
   * instructions in one.
   *
   * A read failure does not stop the run — a single network blip must not halt a batch —
   * but it cannot be ignored forever either, because an unreadable stop page is a kill
   * switch that silently does not work. After CONSECUTIVE failures the run halts and
   * says why.
   */
  async mustStop(): Promise<{ stop: boolean; why?: string }> {
    if (this.stopRequested) return { stop: true, why: 'SIGINT' };
    try {
      const d = await this.apiGet({ action: 'query', prop: 'revisions', rvprop: 'content', rvslots: 'main', titles: STOP_PAGE });
      const pg = d.query.pages[0];
      this.stopReadFailures = 0;
      if (!('missing' in pg)) {
        const raw = pg.revisions?.[0]?.slots?.main?.content ?? '';
        const content = raw.replace(/<!--[\s\S]*?-->/g, '').trim(); // ignore HTML comments
        if (content !== STOP_GO_KEYWORD) return { stop: true, why: `صفحهٔ توقف «${STOP_PAGE}» مقدارش «${STOP_GO_KEYWORD}» نیست` };
      }
    } catch (e) {
      this.stopReadFailures++;
      console.warn(`  ⚠ صفحهٔ توقف خوانده نشد (${this.stopReadFailures}/${MAX_STOP_READ_FAILURES}): ${(e as Error).message}`);
      if (this.stopReadFailures >= MAX_STOP_READ_FAILURES) {
        return { stop: true, why: `صفحهٔ توقف ${MAX_STOP_READ_FAILURES} بار پشت سر هم خوانده نشد — کلید توقف در دسترس نیست` };
      }
    }
    return { stop: false };
  }

  // ---------- render-safety guard ----------
  /** Count MediaWiki render-error markers (Lua/Scribunto errors + `class="error"` spans). */
  private async renderErrorCount(title: string, wikitext: string): Promise<number> {
    const r = await this.apiPost({ action: 'parse', title, text: wikitext, contentmodel: 'wikitext', prop: 'text', disablelimitreport: '1' });
    return countErrorMarkers(r.parse?.text ?? '');
  }

  /**
   * Error markers in a SAVED revision, parsed by `oldid`.
   *
   * Not interchangeable with `renderErrorCount` above, which parses `text=`. The two
   * modes disagree: on «۲۴ (مجموعه تلویزیونی)» a `text=` parse of the exact wikitext
   * reported no «نیازمند» error while the stored page shows one. So the pre-save guard,
   * which can only use `text=` because the revision does not exist yet, is blind to a
   * whole class of defect — and that is how the task 3 trial shipped two of them.
   *
   * The answer is to check again AFTER saving, with the instrument that sees it.
   */
  private async savedErrorCount(oldid: number): Promise<number> {
    const r = await this.apiGet({ action: 'parse', oldid: String(oldid), prop: 'text', formatversion: '2' });
    return countErrorMarkers(r.parse?.text ?? '');
  }

  /**
   * After an edit: re-parse the saved revision and its parent. If the edit raised the
   * error count, UNDO it and report. A task that cannot explain a new error has no
   * business leaving it on the page, and 3% of a 1,000-edit trial is thirty articles.
   */
  private async verifySaved(title: string, newrevid: number, parentrevid: number):
      Promise<{ ok: boolean; detail: string }> {
    try {
      const after = await this.savedErrorCount(newrevid);
      if (after === 0) return { ok: true, detail: '' };
      const before = parentrevid ? await this.savedErrorCount(parentrevid) : 0;
      if (after <= before) return { ok: true, detail: '' };
      return { ok: false, detail: `خطاهای رندر ${before}→${after}` };
    } catch (e) {
      // A read failure must not look like a clean verification.
      return { ok: false, detail: `بررسی پس از ذخیره ناموفق: ${(e as Error).message}` };
    }
  }

  /** Undo one of our own edits, used when verifySaved refuses it. */
  private async undoEdit(title: string, revid: number, why: string) {
    await this.login();
    return this.apiPost({
      action: 'edit', title, undo: String(revid), token: this.csrf!,
      summary: `واگردانی ویرایش خودکار: ${why}`,
      // Same coupling as edit(): the bot undoing its own edit seconds later is the
      // definition of routine, and the pair is pure noise in recent changes.
      ...(this.id.botFlag ? { bot: '1', minor: '1' } : {}),
      assert: 'user', assertuser: this.username!, maxlag: String(this.opts.maxlag),
    });
  }

  /** True when `newText` renders MORE errors than `oldText` — i.e. the edit would ship a fresh «خطا». */
  private async introducesRenderError(title: string, oldText: string, newText: string): Promise<{ regressed: boolean; detail: string }> {
    try {
      const after = await this.renderErrorCount(title, newText);
      if (after === 0) return { regressed: false, detail: '' };
      const before = await this.renderErrorCount(title, oldText);
      return { regressed: after > before, detail: `خطاها ${before}→${after}` };
    } catch { return { regressed: false, detail: 'بررسی ناموفق' }; } // parse hiccup: don't block on a read failure
  }

  // ---------- opt-out ----------
  static isOptedOut(text: string): boolean {
    if (/\{\{\s*[Nn]obots\s*\}\}/.test(text)) return true;
    // {{bots|deny=all}} or a deny list naming this bot
    const m = text.match(/\{\{\s*[Bb]ots\s*\|([^{}]*)\}\}/);
    if (m) {
      const body = m[1];
      const deny = /deny\s*=\s*([^|]*)/i.exec(body)?.[1] ?? '';
      if (/\ball\b/i.test(deny) || /MamouriBot/i.test(deny)) return true;
      const allow = /allow\s*=\s*([^|]*)/i.exec(body)?.[1];
      if (allow !== undefined && !/\ball\b/i.test(allow) && !/MamouriBot/i.test(allow)) return true;
    }
    return false;
  }

  // ---------- edit with maxlag + abuse-filter + block handling ----------
  /**
   * `allowCreate` is for the bot's own report pages, which have to exist before
   * they can be updated. It stays off by default: for an ARTICLE edit, a missing
   * page means the title moved or was deleted under the run, and creating it
   * would resurrect a deleted article as a side effect of a cleanup task.
   */
  async edit(title: string, text: string, summary: string, baserevid: number, basetimestamp: string,
             opts: { allowCreate?: boolean } = {}) {
    await this.login();
    const payload: Record<string, string> = {
      action: 'edit', title, text, summary,
      // Only a bot-identity run marks its edits as bot edits. A human-account trial must
      // stay visible in recent changes: being reviewable by other editors is the point.
      //
      // `minor` travels WITH the bot flag, never apart from it. Huji, on
      // بحث کاربر:Mamouri § پرچم ربات (۹ اکتبر ۲۰۲۶): «پرچم ربات فقط بر ویرایش‌های جزئی
      // اعمال می‌شود پس ربات باید ویرایش‌هایش را جزئی علامت بزند و گزینهٔ پرچم را هم در
      // زمان ویرایشش استفاده کند.» The two are one decision: if an edit is routine
      // enough to hide from recent changes, it is a minor edit, and if it is not, it
      // should carry neither mark.
      //
      // That coupling is why this is `this.id.botFlag` and not a blanket `minor: '1'`:
      // وظیفهٔ ۱۳ runs with `flagEdits: false` precisely so its one daily edit is SEEN,
      // and marking it minor would hide it again from everyone filtering minor edits.
      // A human-account trial is the same case.
      //
      // MediaWiki ignores `minor` on a page creation, so task ۱۱ needs no exception.
      ...(this.id.botFlag ? { bot: '1', minor: '1' } : {}),
      ...(opts.allowCreate ? {} : { nocreate: '1' }),
      token: this.csrf!,
      // A page being created has no base revision to collide with; sending an
      // empty one makes the API reject the whole edit.
      ...(baserevid ? { baserevid: String(baserevid), basetimestamp } : {}),
      maxlag: String(this.opts.maxlag),
      // Fail closed if the session lapses mid-run: without these the API would
      // happily save the edit as the exit IP / a temp account, and authorship
      // cannot be reassigned afterwards.
      assert: 'user', assertuser: this.username!,
    };
    for (let attempt = 0; attempt < 6; attempt++) {
      const r = await this.apiPost(payload);
      const code = r.error?.code;
      if (code === 'maxlag') {
        // The rejection carries the measured lag in the body and the wait the server
        // wants in the `Retry-After` header; request() has already handed both to the
        // pacer. Prefer the server's figure over `lag + 1`, which was this framework
        // inventing a number while the right one sat unread in the response.
        const lag = Number(r.error?.lag);
        if (Number.isFinite(lag)) this.pacer.noteLag(lag);
        const asked = this.pacer.takeRetryAfterMs();
        const wait = asked || (Number.isFinite(lag) ? (lag + 1) * 1000 : 5000);
        console.log(`  … maxlag ${r.error?.lag}s روی ${r.error?.host ?? '?'} — `
          + `${Math.round(wait / 1000)}s صبر${asked ? ' (به درخواست کارساز)' : ''}`);
        await sleep(wait);
        continue;
      }
      if (code === 'abusefilter-warning') { // acknowledge by re-submitting once
        const r2 = await this.apiPost(payload);
        if (r2.error) throw new BotStop(`abusefilter: ${JSON.stringify(r2.error)}`, false);
        return r2;
      }
      if (code === 'assertuserfailed' || code === 'assertbotfailed') {
        // session dropped — re-authenticate and retry this same page, never skip it
        console.log('  … نشست از دست رفت — ورود دوباره');
        this.loggedIn = false; this.csrf = null;
        await this.login();
        payload.token = this.csrf!;
        payload.assertuser = this.username!;
        continue;
      }
      if (code === 'badtoken') { // CSRF token expired mid-run — refresh and retry, never skip the page
        console.log('  … نشانه منقضی شد — تازه‌سازی و تلاش دوباره');
        this.csrf = (await this.apiGet({ action: 'query', meta: 'tokens' })).query.tokens.csrftoken;
        payload.token = this.csrf!;
        continue;
      }
      if (code === 'blocked' || code === 'autoblocked' || code === 'readonly') {
        // admin pressed the emergency-stop block (or wiki read-only) → halt entirely
        throw new BotStop(`توقف اضطراری: ${code} — ${r.error?.info ?? ''}`, true);
      }
      if (r.error) throw new BotStop(`edit error on «${title}»: ${JSON.stringify(r.error)}`, false);
      return r;
    }
    throw new BotStop('maxlag پایدار — توقف', true);
  }

  // ---------- prepare one page (read + transform + render-guard) ----------
  // This is the expensive, WRITE-FREE part of an edit; the pipeline runs several of
  // these concurrently and ahead of the serial writer, so their latency overlaps the
  // previous edit's write + courtesy delay instead of adding to it.
  private async prepare(task: BotTask, title: string): Promise<Prepared> {
    try {
      const d = await this.apiGet({ action: 'query', prop: 'revisions', rvprop: 'content|ids|timestamp', rvslots: 'main', titles: title });
      const pg = d.query.pages[0];
      // A task whose whole job is to CREATE a page (Task 11 creates the missing
      // الگو:Taxonomy/<taxon> that an existing article already transcludes) must
      // see the absent title rather than have it skipped. Opt in explicitly:
      // for every other task a missing target is still nothing to do.
      const absent = 'missing' in pg;
      if (absent && !task.createsMissing) return { kind: 'missing', title };
      const rev = absent ? null : pg.revisions[0];
      const text: string = absent ? '' : rev!.slots.main.content;
      if (!absent && Bot.isOptedOut(text)) return { kind: 'optout', title };
      const { text: newText, changed, note, manualReview } = task.transform(text, title);
      if (!changed) return { kind: 'nochange', title, note, manual: manualReview };
      const guard = await this.introducesRenderError(title, text, newText);
      if (guard.regressed) return { kind: 'regressed', title, detail: guard.detail };
      if (task.verify) {
        const v = await task.verify(this, title, text, newText);
        if (!v.ok) return { kind: 'regressed', title, detail: v.detail };
      }
      // A creation has no base revision to collide with, so revid/basetimestamp
      // are 0/'' and edit() omits them. The runner must also pass
      // allowCreate — edit() sends nocreate=1 by default and would otherwise
      // reject the very page this task exists to create.
      return { kind: 'ready', title, oldText: text, newText, revid: rev?.revid ?? 0,
               basetimestamp: rev?.timestamp ?? '', note };
    } catch (e) {
      return { kind: 'error', title, msg: (e as Error).message };
    }
  }

  // ---------- the task driver ----------
  async runTask(task: BotTask) {
    // BOT_STATE_DIR lets Toolforge keep the resume checkpoint on NFS ($HOME),
    // so a job that is killed and rescheduled continues where it stopped.
    const stateDir = process.env.BOT_STATE_DIR ?? '.state';
    const statePath = `${stateDir}/${task.id}.json`;
    const cp = loadCheckpoint(existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : {});
    if (cp.migrated) console.log('سیاههٔ پیشرفت به شکل زمان‌دار منتقل شد');

    const saveState = () => {
      mkdirSync(dirname(statePath), { recursive: true });
      writeFileSync(statePath, serializeCheckpoint(cp));
    };

    console.log(`\n=== ${task.id} (وظیفه ${task.taskNumber}) — ${this.opts.dryRun ? 'آزمایشی (بدون ذخیره)' : 'اجرای واقعی'} ===`);
    const targets = await task.getTargets(this);
    const doneN = Object.keys(cp.done).length, defN = Object.keys(cp.deferred).length;
    console.log(`هدف‌ها: ${targets.length} صفحه (پردازش‌شده‌ٔ پیشین: ${doneN}، معوق: ${defN}`
      + (task.recheckAfterDays ? `، بازبینی دوباره پس از ${task.recheckAfterDays} روز` : '') + ')');

    let edited = 0, skipped = 0, nomatch = 0, processed = 0, regressed = 0;
    const diffs: { title: string; before: string; after: string }[] = [];

    const work = targets.filter(t => !isParked(cp, t, task.recheckAfterDays));
    const revisits = work.filter(t => isKnown(cp, t)).length;
    if (revisits) console.log(`  (از این میان ${revisits} مورد پیش‌تر دیده شده و مهلتشان سر رسیده — بازبینی دوباره)`);
    const cap = this.opts.limit ? Math.min(work.length, this.opts.limit) : work.length;

    if (this.opts.dryRun) {
      // dry-run stays sequential (no writes, no guard) — it only previews diffs
      for (let i = 0; i < cap; i++) {
        const p = await this.prepare(task, work[i]);
        processed++;
        if (p.kind === 'optout') { skipped++; console.log(`  ⊘ ${p.title} — {{nobots}}/{{bots}} (رد شد)`); }
        else if (p.kind === 'nochange') { nomatch++; console.log(`  ? ${p.title} — تغییری حاصل نشد${p.note ? ' ('+p.note+')' : ''}`); }
        else if (p.kind === 'ready') { if (diffs.length < DIFF_SAMPLES) diffs.push({ title: p.title, before: p.oldText, after: p.newText }); edited++; console.log(`  ✎ ${p.title} — آماده${p.note ? ' ('+p.note+')' : ''}`); }
        else if (p.kind === 'error') console.error(`  ✗ ${p.title}: ${p.msg}`);
      }
    } else {
      // ── live: prefetch pipeline ──
      // Several prepare() (read + transform + render-guard) run concurrently and AHEAD
      // of the single serial writer, so their round-trips overlap the previous edit's
      // write + courtesy delay. Writes stay strictly serial and in order (state/resume +
      // etiquette); each edit still carries baserevid, so a page that changed under a
      // prefetched read simply fails with an edit conflict and is retried next run.
      const PREFETCH = 4;
      const inflight = new Map<number, Promise<Prepared>>();
      let scheduled = 0;
      const schedule = () => { while (inflight.size < PREFETCH && scheduled < cap) { const i = scheduled; inflight.set(i, this.prepare(task, work[i])); scheduled++; } };
      schedule();

      for (let w = 0; w < cap; w++) {
        const item = await inflight.get(w)!;
        inflight.delete(w);
        schedule(); // refill the window — these prepare()s run while we write `item`
        processed++;

        if (item.kind === 'missing') { markDone(cp, item.title); saveState(); continue; }
        if (item.kind === 'optout') { skipped++; markDone(cp, item.title); saveState(); console.log(`  ⊘ ${item.title} — {{nobots}}/{{bots}} (رد شد)`); continue; }
        if (item.kind === 'nochange') {
          if (item.manual) { regressed++; markDeferred(cp, item.title); saveState(); console.log(`  ⚠ ${item.title} — ${item.note ?? 'نیازمند بازبینی دستی'} — رد شد`); }
          else { nomatch++; console.log(`  ? ${item.title} — تغییری حاصل نشد${item.note ? ' ('+item.note+')' : ''}`); }
          continue;
        }
        if (item.kind === 'error') { console.error(`  ✗ ${item.title}: ${item.msg}`); continue; }
        if (item.kind === 'regressed') { regressed++; markDeferred(cp, item.title); saveState(); console.log(`  ⚠ ${item.title} — ویرایش خطای نمایش تازه می‌سازد (${item.detail}) — رد شد برای بازبینی دستی`); continue; }

        // Emergency stop, checked BEFORE EVERY EDIT — no sampling.
        //
        // This used to poll the stop page on every fifth write, which contradicted a
        // commitment written into an approved permission request: وظیفهٔ ۳ says «پیش از
        // هر ویرایش، کلید توقفِ مشترکِ ربات بررسی می‌شود … ربات را بی‌درنگ متوقف می‌کند»,
        // and the stop page itself tells any reader «ربات پیش از هر ویرایش این صفحه را
        // بررسی می‌کند». Neither was true. At the bot's 10s cadence the sampling let the
        // bot run on for up to five more edits after someone asked it to stop; under the
        // human 30-120s pacing, for up to ten minutes.
        //
        // One extra read per write is not a meaningful cost: each edit already costs
        // several reads for the render guard and the post-save verification.
        if (this.stopRequested) { console.log('⏹  توقف: SIGINT'); break; }
        const ms = await this.mustStop();
        if (ms.stop) { console.log(`⏹  توقف: ${ms.why}`); break; }

        try {
          const res = await this.edit(item.title, item.newText, await this.summaryFor(task), item.revid, item.basetimestamp,
                                      { allowCreate: !!task.createsMissing });
          const newrevid: number = res.edit?.newrevid ?? 0;
          // Verify the SAVED revision, not the preview. See savedErrorCount.
          const v = newrevid ? await this.verifySaved(item.title, newrevid, item.revid)
                             : { ok: true, detail: '' };
          if (!v.ok) {
            await this.undoEdit(item.title, newrevid, v.detail);
            regressed++; markDeferred(cp, item.title); saveState();
            console.log(`  ↩ ${item.title} — واگردانی شد (${v.detail})`);
          } else {
            edited++; markDone(cp, item.title); saveState();
            console.log(`  ✓ ${item.title} (نسخهٔ ${newrevid})  [${edited}]`);
          }
        } catch (e) {
          if (e instanceof BotStop && e.fatal) { console.error(`✗ ${e.message}`); break; }
          const msg = (e as Error).message;
          // a blacklisted URL already in the page (e.g. archive.today) can't be saved by the
          // bot — defer for manual review instead of re-failing on it every run.
          if (/spamblacklist/.test(msg)) { regressed++; markDeferred(cp, item.title); saveState(); console.log(`  ⚠ ${item.title} — پیوند در فهرست سیاه؛ رد شد برای بازبینی دستی`); }
          else console.error(`  ✗ ${item.title}: ${msg}`);
        }
        await sleep(await this.writeGapMs());
      }
    }

    if (!this.opts.dryRun) saveState();
    console.log(`\nخلاصه: ویرایش‌شده/آماده=${edited}  رد(آپت‌اوت)=${skipped}  بی‌تطبیق=${nomatch}  معوق(بازبینی دستی)=${regressed}  پردازش=${processed}`);
    if (this.opts.dryRun && diffs.length) {
      console.log('\n--- نمونه تغییرها (آزمایشی) ---');
      for (const df of diffs) console.log(`\n[${df.title}]\n${lineDiff(df.before, df.after)}`);
    }

    // Stop counting toward other runs' concurrency the moment this one is finished.
    this.runs.close();

    // A failure here must not invalidate the edits that already succeeded.
    if (task.report) {
      try { await task.report(this, this.opts.dryRun); }
      catch (e: any) { console.error(`  ✗ نگارش گزارش بازبینی ناموفق بود: ${e?.message ?? e}`); }
    }
  }
}

/** Error that signals whether the whole run must halt (fatal) or just this page. */
export class BotStop extends Error {
  constructor(msg: string, public fatal: boolean) { super(msg); }
}

/**
 * A real before/after diff of the lines that changed, for the dry-run preview.
 *
 * `snippet()` below shows only REMOVED lines, which is right for a task whose edit is
 * a deletion and useless for one that renames a parameter in place: the reviewer sees
 * a line vanish and cannot tell what replaced it. This pairs each changed line with
 * its replacement so a BRFA trial report can be written from the log.
 */
/**
 * Render-error markers in parsed HTML.
 *
 * `cs1-visible-error` is how CS1 renders a citation error; leaving it out made the
 * guard blind to the whole class of defect the citation tasks produce, and the task 3
 * trial shipped «مقدار |چگونگی پیوند=خیر نامعتبر» straight past it. Matched with the
 * `class="` prefix on purpose: the bare name also appears in the TemplateStyles block
 * that defines its colour, which would give every page a constant phantom floor.
 */
export function countErrorMarkers(html: string): number {
  return (html.match(/scribunto-error/g)?.length ?? 0)
    + (html.match(/class="error/g)?.length ?? 0)
    + (html.match(/class="cs1-visible-error/g)?.length ?? 0);
}

const DIFF_SAMPLES = 12;
/** How many changed lines to show per page before truncating. */
const DIFF_LINES_PER_PAGE = 8;
/** Characters of context shown around a change. */
const DIFF_WIDTH = 180;
export function lineDiff(before: string, after: string): string {
  const b = before.split('\n'), a = after.split('\n');
  const out: string[] = [];
  let shown = 0, truncated = false;

  for (const h of hunks(b, a)) {
    if (shown >= DIFF_LINES_PER_PAGE) { truncated = true; break; }
    // A one-for-one replacement is the common case here (a parameter renamed in
    // place), and showing it as a pair with the window on the change reads far better
    // than a removed block followed by an added block.
    if (h.del.length === 1 && h.add.length === 1) {
      const [x, y] = excerptPair(h.del[0], h.add[0]);
      out.push(`  − ${x}`); out.push(`  + ${y}`); shown++;
      continue;
    }
    // The cap is enforced INSIDE the hunk too: one hunk can be the whole article, and
    // checking only between hunks would print all of it into the job log.
    for (const l of h.del) {
      if (shown >= DIFF_LINES_PER_PAGE) { truncated = true; break; }
      out.push(`  − ${l.trim().slice(0, DIFF_WIDTH)}`); shown++;
    }
    for (const l of h.add) {
      if (shown >= DIFF_LINES_PER_PAGE) { truncated = true; break; }
      out.push(`  + ${l.trim().slice(0, DIFF_WIDTH)}`); shown++;
    }
  }
  if (truncated) out.push('  … (تغییرهای بیشتر در این صفحه نمایش داده نشد)');
  if (!out.length) return '  (بدون تفاوت در سطح خط)';
  return out.join('\n');
}

/**
 * Changed regions, from a line-level longest-common-subsequence.
 *
 * Walking the two sides positionally is wrong the moment an edit removes a whole
 * line — which these transforms do, because dropping a duplicate parameter that sat
 * on its own line collapses it. Every following line then looks changed, and a trial
 * report built from that preview would tell a reviewer the bot rewrote the article.
 */
function hunks(b: string[], a: string[]): { del: string[]; add: string[] }[] {
  const n = b.length, m = a.length;
  // lcs[i][j] = length of the LCS of b[i..] and a[j..]
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = b[i] === a[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const out: { del: string[]; add: string[] }[] = [];
  let i = 0, j = 0, cur: { del: string[]; add: string[] } | null = null;
  const flush = () => { if (cur && (cur.del.length || cur.add.length)) out.push(cur); cur = null; };
  while (i < n && j < m) {
    if (b[i] === a[j]) { flush(); i++; j++; continue; }
    cur ??= { del: [], add: [] };
    if (lcs[i + 1][j] >= lcs[i][j + 1]) cur.del.push(b[i++]);
    else cur.add.push(a[j++]);
  }
  cur ??= { del: [], add: [] };
  while (i < n) cur.del.push(b[i++]);
  while (j < m) cur.add.push(a[j++]);
  flush();
  return out.filter(h => h.del.some(l => l.trim()) || h.add.some(l => l.trim()));
}

/**
 * A window onto the part of the line that actually changed.
 *
 * Truncating both lines at a fixed width is what the first version did, and on a long
 * citation line the edit is routinely past that cut: the preview then prints two
 * IDENTICAL strings and the reviewer concludes the bot is making no-op edits. So the
 * window is centred on the first difference instead, with «…» marking each elision.
 */
function excerptPair(x: string, y: string): [string, string] {
  let s = 0;
  while (s < x.length && s < y.length && x[s] === y[s]) s++;
  // Walk back to a word boundary so the excerpt does not start mid-token — but only a
  // little way. A long URL or a run of identical characters has no space in it, and an
  // unbounded walk-back lands at column 0, which is exactly the fixed-width truncation
  // this function exists to avoid: both sides then print identically.
  const LOOKBACK = 40;
  const sp = x.lastIndexOf(' ', Math.max(0, s - 1));
  const ws = sp >= 0 && s - sp <= LOOKBACK ? sp + 1 : Math.max(0, s - 12);
  const cut = (str: string) => {
    const head = ws > 0 ? '…' : '';
    const body = str.slice(ws, ws + DIFF_WIDTH);
    const tail = ws + DIFF_WIDTH < str.length ? '…' : '';
    return `${head}${body.trim()}${tail}`;
  };
  return [cut(x), cut(y)];
}

/** Show the removed fragment(s) by diffing line-sets — compact preview for dry-run. */
function snippet(before: string, after: string): string {
  const b = before.split('\n'), a = new Set(after.split('\n'));
  const removed = b.filter(l => !a.has(l) && l.trim() !== '');
  return removed.map(l => `  − ${l.trim().slice(0, 160)}`).join('\n') || '  (تنها حذف خط خالی)';
}
