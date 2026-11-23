/**
 * The fa.wiktionary patrol loop.
 *
 *   npx tsx src/tasks/task-21/cli.ts patrol              # dry: reads, scores, logs, never writes
 *   npx tsx src/tasks/task-21/cli.ts patrol --once       # one poll, then exit (testing)
 *   npx tsx src/tasks/task-21/cli.ts patrol --live       # only after approval; see docs/task-21-wiktionary-antivandal.md
 *
 * Polling, not EventStreams: ~12 edits a day do not justify a long-lived HTTP stream and
 * its reconnect logic, and a 60 s poll of list=recentchanges keyed on rcid cannot miss or
 * double-count an edit. The checkpoint is the highest rcid fully processed.
 *
 * Each candidate waits SETTLE_MS after the user's last save on that page, then the
 * CUMULATIVE change from the last trusted revision to the current top is judged, not one
 * intermediate save.
 */
import { Bot, FAWIKT, BotStop, type BotTask } from '../../core.js';
import {
  ADMIN_BOARD, HISTORY_DEPTH, LLM_MAX_DIFF_CHARS, NAMESPACES, POLL_MS, REVIEW_KEEP_DAYS, REVIEW_PAGE,
  REVIEW_PUBLISH_MS, REVERTS_BEFORE_PROTECT_REPORT, REVERTS_BEFORE_USER_REPORT, SETTLE_MS, SUMMARY_REVERT,
} from './config.js';
import { decide, wantsSecondPass, type Decision } from './decide.js';
import { diffLines, renderForModel } from './diff.js';
import { Ledger } from './ledger.js';
import { fingerprintTrusted, LlmClient, type LlmVerdict } from './llm.js';
import { flags as ruleFlags, isRevertOf } from './rules.js';
import { isIpName, isTempName, tierLabel, tierOf, type Tier, type UserFacts } from './trust.js';

const FAWIKI_API = 'https://fa.wikipedia.org/w/api.php';
const META_API = 'https://meta.wikimedia.org/w/api.php';
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

interface Rev { revid: number; parentid: number; user: string; userid?: number; timestamp: string;
  comment: string; tags: string[]; content?: string }

export interface Case {
  rcid: number; title: string; ns: number; pageid: number;
  user: string; revid: number; isCreation: boolean;
}

export interface Judged {
  c: Case; tier: Tier; decision: Decision; flags: string[];
  pass1: LlmVerdict | null; pass2: LlmVerdict | null; llmError?: string;
  targetRevid: number | null; diffChars: number;
}

/**
 * The patrol is a loop, not a BotTask, but its summaries go through the same
 * `summaryFor()` so they carry the permission link («[[…|ربات]]: …») once the request
 * page exists, and none before. Only `taskNumber` and `summary` are read.
 */
const SUMMARY_TASK = (summary: string) => ({ id: 'wiktionary-antivandal', taskNumber: 21, summary } as unknown as BotTask);
const SUMMARY_TAG = 'نامزد حذف سریع: صفحهٔ تازه‌ای که سرواژهٔ واژه‌نامه نیست';

export class Patrol {
  readonly bot: Bot;
  readonly llm: LlmClient;
  readonly ledger = new Ledger();
  private userCache = new Map<string, { at: number; u: UserFacts }>();
  private highUse: Set<string> | null = null;

  constructor(private live: boolean) {
    this.bot = new Bot({ dryRun: !live, delayMs: 10_000, limit: 0, maxlag: 5,
                         identity: 'bot', flagEdits: false, wiki: FAWIKT });
    this.llm = new LlmClient({ ua: 'MamouriBot/1.0 (wiktionary:fa; User:MamouriBot; https://fa.wiktionary.org/wiki/User:MamouriBot) wikt-patrol/1.0' });
  }

  // ---------- ingestion ----------
  async poll(): Promise<Case[]> {
    const d = await this.bot.apiGet({
      action: 'query', list: 'recentchanges', rctype: 'edit|new', rcshow: '!bot',
      rcnamespace: NAMESPACES.join('|'), rcprop: 'ids|title|user|userid|timestamp|flags|loginfo',
      rclimit: '100', rcdir: 'older',
    });
    const rows: any[] = d.query?.recentchanges ?? [];
    const last = this.ledger.state.lastRcId;
    // First run: start from now, do not judge a backlog the humans already handled.
    if (last === 0 && rows.length) { this.ledger.state.lastRcId = rows[0].rcid; this.ledger.save(); return []; }
    const fresh = rows.filter(r => r.rcid > last).reverse();
    // One case per page: the newest change, judged cumulatively.
    const byPage = new Map<number, Case>();
    for (const r of fresh) {
      byPage.set(r.pageid, { rcid: r.rcid, title: r.title, ns: r.ns, pageid: r.pageid,
        user: r.user, revid: r.revid, isCreation: r.type === 'new' });
    }
    return [...byPage.values()];
  }

  // ---------- context ----------
  async history(pageid: number): Promise<Rev[]> {
    const d = await this.bot.apiGet({ action: 'query', prop: 'revisions', pageids: String(pageid),
      rvprop: 'ids|user|userid|timestamp|comment|tags', rvlimit: String(HISTORY_DEPTH) });
    return d.query?.pages?.[0]?.revisions ?? [];
  }
  async content(revid: number): Promise<string> {
    const d = await this.bot.apiGet({ action: 'query', prop: 'revisions', revids: String(revid),
      rvprop: 'content', rvslots: 'main' });
    return d.query?.pages?.[0]?.revisions?.[0]?.slots?.main?.content ?? '';
  }

  async user(name: string): Promise<UserFacts> {
    const hit = this.userCache.get(name);
    if (hit && Date.now() - hit.at < 3_600_000) return hit.u;
    const temp = isTempName(name);
    let u: UserFacts = { name, userid: null, temp, groups: [], editcount: 0, registration: null,
      blockedLocally: false, blockedOnFawiki: false, locked: false };
    if (!isIpName(name)) {
      const d = await this.bot.apiGet({ action: 'query', list: 'users', ususers: name,
        usprop: 'groups|editcount|registration|blockinfo' });
      const x = d.query?.users?.[0] ?? {};
      u = { ...u, userid: x.userid ?? null, groups: x.groups ?? [], editcount: x.editcount ?? 0,
        registration: x.registration ?? null, blockedLocally: !!x.blockid };
      if (u.userid && !temp) {
        try {
          const f = await this.bot.apiGetOn(FAWIKI_API, { action: 'query', list: 'users', ususers: name, usprop: 'blockinfo' });
          const fx = f.query?.users?.[0];
          // A partial block on fawiki is not a signal about vandalism here.
          u.blockedOnFawiki = !!fx?.blockid && fx?.blockpartial === undefined;
          const g = await this.bot.apiGetOn(META_API, { action: 'query', meta: 'globaluserinfo', guiuser: name });
          u.locked = g.query?.globaluserinfo?.locked !== undefined && g.query?.globaluserinfo?.locked !== false;
        } catch { /* cross-wiki signal is best effort */ }
      }
    }
    this.userCache.set(name, { at: Date.now(), u });
    return u;
  }

  async highUseTemplates(): Promise<Set<string>> {
    if (this.highUse) return this.highUse;
    const d = await this.bot.apiGet({ action: 'query', list: 'querypage', qppage: 'Mostlinkedtemplates', qplimit: '200' });
    this.highUse = new Set((d.query?.querypage?.results ?? [])
      .filter((r: any) => Number(r.value) >= 500).map((r: any) => r.title));
    return this.highUse;
  }

  // ---------- judging ----------
  async judge(c: Case): Promise<Judged | null> {
    const hist = await this.history(c.pageid);
    if (!hist.length || hist[0].revid !== c.revid) {
      // Someone saved after the case was queued; judge the new top next round.
      if (hist.length && hist[0].user !== c.user) return null;
    }
    const top = hist[0];
    const editor = await this.user(top.user);
    const tier = tierOf(editor);
    if (tier === 'T3') return null;

    // The suspect run: consecutive top revisions by this same editor.
    let k = 0;
    while (k < hist.length && hist[k].user === top.user) k++;
    const base = hist[k];            // the revision before the run, or undefined for a creation-run
    const isCreation = !base;
    // Revert target: the newest revision before the run whose author is T2/T3.
    let target: Rev | null = null;
    for (let i = k; i < hist.length; i++) {
      const t = tierOf(await this.user(hist[i].user));
      if (t === 'T2' || t === 'T3') { target = hist[i]; break; }
    }
    const trustedEditedSince = false;   // the run is the top of history by construction

    const [newText, oldText] = await Promise.all([
      this.content(top.revid), base ? this.content(base.revid) : Promise.resolve(''),
    ]);
    if (Bot.isOptedOut(newText) || Bot.isOptedOut(oldText)) return null;

    const d = diffLines(oldText, newText);
    const runTags = hist.slice(0, k).flatMap(r => r.tags ?? []);
    const runSummary = hist.slice(0, k).map(r => r.comment).filter(Boolean).join(' | ');
    const fl = ruleFlags({ ns: c.ns, isCreation, oldText, newText, added: d.added, removed: d.removed,
                           summary: runSummary, tags: runTags });

    // Shahbaz's guard: undoing another low-trust user is usually removing vandalism.
    let revertsLowTrustUser = false;
    if (isRevertOf(runTags) && base) {
      const bt = tierOf(await this.user(base.user));
      revertsLowTrustUser = base.user !== top.user && (bt === 'T0' || bt === 'T1');
    }

    const rendered = renderForModel(d, LLM_MAX_DIFF_CHARS);
    const changed = [...d.added, ...d.removed].join('\n');
    const languageHeaders = [...newText.matchAll(/^==\s*([^=\n]+?)\s*==\s*$/gm)].map(m => m[1]).slice(0, 12);
    const prompt = { title: c.title, ns: c.ns, isCreation, languageHeaders,
      diff: rendered.text, diffTruncated: rendered.truncated, summary: runSummary.slice(0, 300),
      tier: tierLabel(tier), flags: fl.map(f => `${f.id}: ${f.detail}`) };

    let pass1: LlmVerdict | null = null, pass2: LlmVerdict | null = null, llmError: string | undefined;
    if (changed.trim()) {
      const r1 = await this.llm.judge(prompt, changed, 'fast');
      if (r1.ok) pass1 = r1.v; else llmError = r1.why;
      if (wantsSecondPass(tier, pass1)) {
        const r2 = await this.llm.judge(prompt, changed, 'skeptic');
        if (r2.ok) pass2 = r2.v; else llmError = r2.why;
      }
    }

    const decision = decide({
      tier, ns: c.ns, isCreation, flags: fl, pass1, pass2,
      fingerprintTrusted: fingerprintTrusted(pass1?.fingerprint ?? null)
        && (!pass2 || fingerprintTrusted(pass2.fingerprint)),
      revertsLowTrustUser, hasRevertTarget: !!target, trustedEditedSince,
      botAlreadyActedOnPairToday: this.ledger.actedOnPairToday(c.title, top.user),
      humanUndidBotOnPair: this.ledger.isBurned(c.title, top.user),
      writesInLastHour: this.ledger.writesInLastHour(),
      actionsToday: this.ledger.actionsToday(),
      highUseTemplate: (c.ns === 10 || c.ns === 828) && (await this.highUseTemplates()).has(c.title),
    });
    return { c: { ...c, user: top.user, revid: top.revid, isCreation }, tier, decision,
      flags: fl.map(f => f.id), pass1, pass2, llmError, targetRevid: target?.revid ?? null,
      diffChars: rendered.text.length };
  }

  // ---------- acting ----------
  async act(j: Judged): Promise<void> {
    const { c, decision } = j;
    if (!this.live || (decision.action !== 'revert' && decision.action !== 'tag')) return;
    const stop = await this.bot.mustStop();
    if (stop.stop) throw new BotStop(stop.why ?? 'stop', true);
    await this.bot.login();

    if (decision.action === 'revert' && j.targetRevid) {
      const text = await this.content(j.targetRevid);
      const cur = await this.bot.apiGet({ action: 'query', prop: 'revisions', revids: String(c.revid), rvprop: 'timestamp' });
      const ts = cur.query?.pages?.[0]?.revisions?.[0]?.timestamp ?? '';
      // baserevid = the suspect top: if anyone saved since, the edit conflicts and nothing happens.
      const r = await this.bot.edit(c.title, text, await this.bot.summaryFor(SUMMARY_TASK(SUMMARY_REVERT)), c.revid, ts);
      if (!saved(r, c, 'revert', this.ledger)) return;
      this.ledger.record({ ts: new Date().toISOString(), page: c.title, user: c.user, kind: 'revert', revid: r?.edit?.newrevid });
      await this.bot.paceWrite();
      await this.escalate(c);
    } else if (decision.action === 'tag') {
      const text = await this.content(c.revid);
      if (/\{\{\s*حذف سریع/.test(text)) return;
      const cur = await this.bot.apiGet({ action: 'query', prop: 'revisions', revids: String(c.revid), rvprop: 'timestamp' });
      const ts = cur.query?.pages?.[0]?.revisions?.[0]?.timestamp ?? '';
      const r = await this.bot.edit(c.title, `{{حذف سریع|خرابکاری}}\n${text}`,
        await this.bot.summaryFor(SUMMARY_TASK(SUMMARY_TAG)), c.revid, ts);
      if (!saved(r, c, 'tag', this.ledger)) return;
      this.ledger.record({ ts: new Date().toISOString(), page: c.title, user: c.user, kind: 'tag', revid: r?.edit?.newrevid });
      await this.bot.paceWrite();
    }
  }

  /** Shahbaz protects after 3 reverts in a day; this bot cannot protect, so it asks once. */
  async escalate(c: Case) {
    const lines: string[] = [];
    if (this.ledger.revertsOnPageToday(c.title) >= REVERTS_BEFORE_PROTECT_REPORT
        && !this.ledger.reportedToday('report-page', c.title)) {
      lines.push(`* درخواست نیمه‌حفاظت موقت برای [[${c.title}]]: امروز ${REVERTS_BEFORE_PROTECT_REPORT} بار ویرایش مشکوک در آن برگردانده شد.`);
      this.ledger.record({ ts: new Date().toISOString(), page: c.title, user: c.user, kind: 'report-page' });
    }
    if (this.ledger.revertsOfUserToday(c.user) >= REVERTS_BEFORE_USER_REPORT
        && !this.ledger.reportedToday('report-user', c.user)) {
      lines.push(`* [[ویژه:مشارکت‌ها/${c.user}|${c.user}]]: امروز ${REVERTS_BEFORE_USER_REPORT} ویرایش مشکوک از این کاربر برگردانده شد.`);
      this.ledger.record({ ts: new Date().toISOString(), page: c.title, user: c.user, kind: 'report-user' });
    }
    if (!lines.length) return;
    await this.bot.apiPost({ action: 'edit', title: ADMIN_BOARD, section: 'new',
      sectiontitle: 'گزارش خودکار خرابکاری', text: `${lines.join('\n')}\n~~~~`,
      summary: 'گزارش خرابکاری مکرر', token: await this.csrf(),
      assert: 'user', assertuser: this.bot.whoami ?? '' });
    await this.bot.paceWrite();
  }

  private async csrf(): Promise<string> {
    return (await this.bot.apiGet({ action: 'query', meta: 'tokens' })).query.tokens.csrftoken;
  }

  /** A human undoing the bot burns the page/user pair for good, and becomes a labelled mistake. */
  async checkUndone() {
    const recent = this.ledger.state.actions.filter(a => a.revid && Date.now() - Date.parse(a.ts) < 7 * 86_400_000);
    for (const a of recent) {
      if (this.ledger.isBurned(a.page, a.user)) continue;
      const d = await this.bot.apiGet({ action: 'query', prop: 'revisions', revids: String(a.revid), rvprop: 'tags' });
      const tags: string[] = d.query?.pages?.[0]?.revisions?.[0]?.tags ?? [];
      if (tags.includes('mw-reverted')) {
        this.ledger.burn(a.page, a.user);
        this.ledger.decision({ ts: new Date().toISOString(), kind: 'bot-undone', page: a.page, user: a.user, revid: a.revid });
      }
    }
  }

  /**
   * The review page: every case reported in the last REVIEW_KEEP_DAYS days, newest first,
   * plus what the bot did. Rebuilt whole, so a patroller can blank a row by hand and it
   * comes back only if the case is still in the window. Written unflagged, in the bot's
   * own user space.
   */
  async publishReview(force = false) {
    if (!this.live) return;
    const rows = this.ledger.decisions().filter(r => r.ts
      && Date.now() - Date.parse(r.ts) < REVIEW_KEEP_DAYS * 86_400_000
      && (r.action === 'report' || r.action === 'revert' || r.action === 'tag'));
    const newest = rows.length ? rows[rows.length - 1].ts : '';
    const st = this.ledger.state;
    if (!force && newest === (st.reviewNewest ?? '')) return;
    if (!force && st.reviewPublishedAt && Date.now() - Date.parse(st.reviewPublishedAt) < REVIEW_PUBLISH_MS) return;
    const text = renderReview(rows);
    const cur = await this.bot.apiGet({ action: 'query', prop: 'revisions', titles: REVIEW_PAGE, rvprop: 'ids|timestamp|content', rvslots: 'main' });
    const pg = cur.query?.pages?.[0];
    const rev = pg?.missing ? null : pg?.revisions?.[0];
    if (rev?.slots?.main?.content === text) { st.reviewNewest = newest; this.ledger.save(); return; }
    const stop = await this.bot.mustStop();
    if (stop.stop) throw new BotStop(stop.why ?? 'stop', true);
    await this.bot.edit(REVIEW_PAGE, text, 'به‌روزرسانی فهرست بازبینی', rev?.revid ?? 0, rev?.timestamp ?? '', { allowCreate: !rev });
    st.reviewPublishedAt = new Date().toISOString(); st.reviewNewest = newest; this.ledger.save();
    await this.bot.paceWrite();
  }

  // ---------- loop ----------
  async run(opts: { once: boolean }) {
    const pending = new Map<number, { c: Case; due: number }>();
    for (;;) {
      try {
        for (const c of await this.poll()) enqueue(pending, c, Date.now());
        for (const [pid, { c, due }] of [...pending]) {
          if (!opts.once && Date.now() < due) continue;
          pending.delete(pid);
          const j = await this.judge(c);
          if (j) {
            this.ledger.decision(summarise(j));
            console.log(line(j));
            await this.act(j);
          }
          this.ledger.state.lastRcId = Math.max(this.ledger.state.lastRcId, c.rcid);
          this.ledger.save();
        }
        if (this.live) { await this.checkUndone(); await this.publishReview(); }
        if (this.llm.consecutiveFailures >= 10) console.warn('  ⚠ مدل ۱۰ بار پشت سر هم پاسخ نداد؛ فقط گزارش');
      } catch (e) {
        if (e instanceof BotStop && e.fatal) { console.error(`⏹ ${e.message}`); return; }
        console.warn(`  ⚠ ${(e as Error).message}`);
      }
      if (opts.once && pending.size === 0) return;
      await sleep(opts.once ? 1000 : POLL_MS);
    }
  }
}

/**
 * Queue a case to be judged SETTLE_MS after the page's latest edit.
 *
 * Only a NEWER edit resets the wait. The first version reset it on every poll: the poll
 * returns everything above the checkpoint, the checkpoint only moves once a case is judged,
 * so a 60 s poll kept pushing a 90 s wait forward and nothing was ever judged. Shadow mode
 * sat at the same rcid for eleven hours before this was noticed.
 */
export function enqueue(pending: Map<number, { c: Case; due: number }>, c: Case, now: number) {
  const cur = pending.get(c.pageid);
  if (cur && cur.c.rcid >= c.rcid) return;
  pending.set(c.pageid, { c, due: now + SETTLE_MS });
}

/** True when MediaWiki actually saved the edit. A CAPTCHA or a filter can refuse without an `error`. */
function saved(r: any, c: Case, kind: string, ledger: Ledger): boolean {
  const ok = r?.edit?.result === 'Success' && !r.edit.nochange;
  if (!ok) {
    console.warn(`  ⚠ ${kind} روی «${c.title}» ذخیره نشد: ${JSON.stringify(r?.edit ?? r).slice(0, 200)}`);
    ledger.decision({ ts: new Date().toISOString(), kind: 'write-refused', action: kind, title: c.title, revid: c.revid, response: r?.edit ?? r });
  }
  return ok;
}

const FA = (n: number | string) => String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
const VERDICT_FA: Record<string, string> = {
  vandalism: 'خرابکاری', spam: 'هرزنگاری', test: 'ویرایش آزمایشی', nonsense: 'بی‌معنا',
  not_dictionary: 'سرواژه نیست', ai_paste: 'رونوشت چت‌بات', good_faith_problem: 'با حسن نیت ولی نادرست', ok: 'درست',
};
const ACTION_FA: Record<string, string> = { report: 'گزارش', revert: 'واگردانی شد', tag: 'برچسب حذف خورد' };

export function renderReview(rows: any[]): string {
  const esc = (s: string) => String(s ?? '').replace(/\|/g, '{{!}}').replace(/\n/g, ' ');
  const body = [...rows].reverse().map(r => {
    const when = String(r.ts).slice(0, 16).replace('T', ' ');
    const v = r.p1 ? `${VERDICT_FA[r.p1.v] ?? r.p1.v} (${FA(Math.round(r.p1.c * 100))}٪)` : '؟';
    return `|-\n| ${FA(when)} || [[${r.title}]] || [[ویژه:تفاوت/${r.revid}|تفاوت]] || ${ACTION_FA[r.action] ?? r.action} || ${v} || ${esc(r.p1?.r ?? (r.reasons ?? []).join('؛ '))}`;
  }).join('\n');
  return [
    `ویرایش‌هایی که [[کاربر:MamouriBot/ضدخرابکاری|ربات]] در ${FA(REVIEW_KEEP_DAYS)} روز گذشته مشکوک دانسته است. «گزارش» یعنی ربات کاری نکرده و نگاه یک کاربر لازم است. اگر ردیفی را بررسی کردید، می‌توانید آن را بردارید. اشتباه ربات را در [[کاربر:MamouriBot/ضدخرابکاری/گزارش اشتباه]] بگویید.`,
    '',
    '{| class="wikitable sortable" style="width:100%"',
    '! زمان (UTC) !! صفحه !! تفاوت !! کار ربات !! داوری !! دلیل',
    body || '|-\n| colspan="6" | موردی نیست.',
    '|}',
  ].join('\n');
}

export function summarise(j: Judged) {
  return {
    ts: new Date().toISOString(), title: j.c.title, revid: j.c.revid, user: j.c.user, tier: j.tier,
    creation: j.c.isCreation, action: j.decision.action, reasons: j.decision.reasons, flags: j.flags,
    p1: j.pass1 && { v: j.pass1.verdict, c: j.pass1.confidence, ev: j.pass1.verifiedEvidence, r: j.pass1.reason_fa, fp: j.pass1.fingerprint },
    p2: j.pass2 && { v: j.pass2.verdict, c: j.pass2.confidence, ev: j.pass2.verifiedEvidence, r: j.pass2.reason_fa },
    llmError: j.llmError, target: j.targetRevid,
  };
}

function line(j: Judged): string {
  const v = j.pass1 ? `${j.pass1.verdict} ${j.pass1.confidence.toFixed(2)}` : `LLM✗ ${j.llmError ?? ''}`;
  return `${j.decision.action.padEnd(6)} ${j.tier} ${j.c.title} r${j.c.revid} [${v}] ${j.flags.join(',')} — ${j.decision.reasons.join('؛ ')}`;
}
