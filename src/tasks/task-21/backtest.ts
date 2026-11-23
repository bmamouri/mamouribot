/**
 * Backtest the patrol against the gold set (gold.py). Reads only; never writes to a wiki.
 *
 *   npx tsx src/tasks/task-21/cli.ts backtest <gold.jsonl> [--per-bucket N] [--concurrency 4] [--out dir]
 *
 * Runs the SAME rules, model calls and decision ladder as the live patrol, on a seeded
 * sample of the gold set, and reports precision for each action. Run it on Toolforge:
 * from anywhere else LiftWing allows 100 LLM requests an hour.
 *
 * Fidelity notes, so the numbers are read correctly:
 *  - Deleted pages: only the first ~200 characters survive (in the deletion reason), so
 *    creations are judged on that snippet. Surviving creations are cut to the same length,
 *    or the structure rules would see more of a real entry than of a deleted one.
 *  - Ledger state (already acted today, burned pairs, hourly cap) is taken as clean.
 *  - The revert target is assumed to exist for T0/T1 edits.
 */
import { appendFileSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { Bot, FAWIKT } from '../../core.js';
import { LLM_MAX_DIFF_CHARS } from './config.js';
import { decide, wantsSecondPass } from './decide.js';
import { diffLines, renderForModel } from './diff.js';
import { fingerprintTrusted, LlmClient, type LlmVerdict } from './llm.js';
import { flags as ruleFlags, isRevertOf } from './rules.js';
import { tierLabel, type Tier } from './trust.js';

interface Gold {
  kind: 'edit' | 'creation'; label: 0 | 1; page: string; ns: number; why: string;
  rev_id?: number; parent_id?: number; tier?: Tier; tags?: string[]; snippet?: string;
  creator?: string; user?: string;
}

function rng(seed: number) {
  return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
}
function sample<T>(xs: T[], n: number, r: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, n);
}

export async function backtest(path: string, perBucket: number, concurrency: number, outDir: string) {
  const all: Gold[] = readFileSync(path, 'utf8').trim().split('\n').map(l => JSON.parse(l));
  const r = rng(20261123);
  const bucket = (f: (g: Gold) => boolean) => all.filter(f);
  const picked = [
    ...bucket(g => g.kind === 'edit' && g.label === 1 && g.tier !== 'T2'),          // all of them
    ...sample(bucket(g => g.kind === 'edit' && g.label === 1 && g.tier === 'T2'), Math.round(perBucket / 4), r),
    ...sample(bucket(g => g.kind === 'edit' && g.label === 0 && g.tier !== 'T2' && g.parent_id !== 0), perBucket, r),
    ...sample(bucket(g => g.kind === 'edit' && g.label === 0 && g.tier === 'T2'), Math.round(perBucket / 4), r),
    ...sample(bucket(g => g.kind === 'creation' && g.label === 1), perBucket, r),
  ];
  const bot = new Bot({ dryRun: true, delayMs: 0, limit: 0, maxlag: 5, identity: 'bot', wiki: FAWIKT });
  const llm = new LlmClient({ ua: 'MamouriBot/1.0 (wiktionary:fa; User:MamouriBot) wikt-backtest/1.0' });

  // Surviving low-trust creations are the hard negatives for the tag action.
  const creationNeg = await survivingCreations(bot, Math.round(perBucket / 2), r);
  const cases: Gold[] = [...picked, ...creationNeg];
  console.log(`${cases.length} cases (${creationNeg.length} surviving creations)`);

  const texts = async (revids: number[]) => {
    const out = new Map<number, string>();
    for (let i = 0; i < revids.length; i += 50) {
      const d = await bot.apiGet({ action: 'query', prop: 'revisions', revids: revids.slice(i, i + 50).join('|'),
        rvprop: 'ids|content', rvslots: 'main' });
      for (const p of d.query?.pages ?? []) for (const rv of p.revisions ?? []) {
        out.set(rv.revid, rv.slots?.main?.content ?? '');
      }
    }
    return out;
  };
  const ids = cases.flatMap(c => c.kind === 'edit' ? [c.rev_id!, c.parent_id!] : []).filter(Boolean);
  const txt = await texts([...new Set(ids)]);

  // Results are appended as they come and a rerun skips what is done, so a stalled or
  // killed run still leaves usable data and resumes where it stopped.
  mkdirSync(outDir, { recursive: true });
  const resultsFile = `${outDir}/backtest-results.jsonl`;
  const results: any[] = existsSync(resultsFile)
    ? readFileSync(resultsFile, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];
  const key = (g: { kind: string; rev_id?: number; rev?: number; page: string }) => `${g.kind}|${g.rev_id ?? g.rev ?? ''}|${g.page}`;
  const doneKeys = new Set(results.map(key));
  const todo = cases.filter(g => !doneKeys.has(key(g)));
  console.log(`${results.length} already done, ${todo.length} to go`);
  let next = 0;
  const worker = async () => {
    while (next < todo.length) {
      const g = todo[next++];
      let oldText = '', newText = '';
      const isCreation = g.kind === 'creation';
      if (isCreation) newText = (g.snippet ?? '').slice(0, 200);
      else {
        if (!txt.has(g.rev_id!) || !txt.has(g.parent_id!)) continue;   // page deleted since
        oldText = txt.get(g.parent_id!)!; newText = txt.get(g.rev_id!)!;
      }
      const tier: Tier = g.tier ?? 'T1';
      const d = diffLines(oldText, newText);
      const fl = ruleFlags({ ns: g.ns, isCreation, oldText, newText, added: d.added, removed: d.removed,
        summary: '', tags: g.tags ?? [] });
      const rendered = renderForModel(d, LLM_MAX_DIFF_CHARS);
      const changed = [...d.added, ...d.removed].join('\n');
      const prompt = { title: g.page, ns: g.ns, isCreation,
        languageHeaders: [...newText.matchAll(/^==\s*([^=\n]+?)\s*==\s*$/gm)].map(m => m[1]).slice(0, 12),
        diff: rendered.text, diffTruncated: rendered.truncated, summary: '', tier: tierLabel(tier),
        flags: fl.map(f => `${f.id}: ${f.detail}`) };
      let p1: LlmVerdict | null = null, p2: LlmVerdict | null = null, err = '';
      if (changed.trim()) {
        const a = await llm.judge(prompt, changed, 'fast');
        if (a.ok) p1 = a.v; else err = a.why;
        if (wantsSecondPass(tier, p1)) { const b = await llm.judge(prompt, changed, 'skeptic'); if (b.ok) p2 = b.v; else err = b.why; }
      }
      const dec = decide({ tier, ns: g.ns, isCreation, flags: fl, pass1: p1, pass2: p2,
        fingerprintTrusted: fingerprintTrusted(p1?.fingerprint ?? null),
        revertsLowTrustUser: isRevertOf(g.tags ?? []), hasRevertTarget: true, trustedEditedSince: false,
        botAlreadyActedOnPairToday: false, humanUndidBotOnPair: false, writesInLastHour: 0, highUseTemplate: false });
      const row = { kind: g.kind, label: g.label, tier, page: g.page, rev: g.rev_id, why: g.why,
        action: dec.action, reasons: dec.reasons, flags: fl.map(f => f.id),
        p1: p1 && [p1.verdict, p1.confidence, p1.verifiedEvidence.length, p1.reason_fa],
        p2: p2 && [p2.verdict, p2.confidence, p2.verifiedEvidence.length], err,
        fp: p1?.fingerprint, snippet: isCreation ? newText : undefined };
      results.push(row);
      appendFileSync(resultsFile, JSON.stringify(row) + '\n');
      if (results.length % 10 === 0) console.log(`  ${results.length}/${cases.length}`);
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));

  const report = metrics(results);
  writeFileSync(`${outDir}/backtest-report.md`, report);
  console.log(report);
}

async function survivingCreations(bot: Bot, n: number, r: () => number): Promise<Gold[]> {
  const out: Gold[] = [];
  let cont: Record<string, string> = {};
  const rows: any[] = [];
  for (let k = 0; k < 6; k++) {
    const d = await bot.apiGet({ action: 'query', list: 'logevents', letype: 'create', lenamespace: '0',
      lelimit: '500', leprop: 'title|user|userid|ids', ...cont });
    rows.push(...(d.query?.logevents ?? []));
    if (!d.continue) break; cont = d.continue;
  }
  const users = [...new Set(rows.map(x => x.user))];
  const info = new Map<string, any>();
  for (let i = 0; i < users.length; i += 50) {
    const d = await bot.apiGet({ action: 'query', list: 'users', ususers: users.slice(i, i + 50).join('|'), usprop: 'groups|editcount' });
    for (const u of d.query?.users ?? []) info.set(u.name, u);
  }
  const low = rows.filter(x => {
    const u = info.get(x.user);
    if (!x.userid || x.user.startsWith('~')) return true;
    return u && !(u.groups ?? []).some((g: string) => ['sysop', 'rollbacker', 'patroller', 'autopatrolled', 'bot'].includes(g))
      && (u.editcount ?? 0) < 500;
  });
  for (const x of sample(low, n * 2, r)) {
    if (out.length >= n) break;
    const d = await bot.apiGet({ action: 'query', prop: 'revisions', pageids: String(x.pageid),
      rvdir: 'newer', rvlimit: '1', rvprop: 'content', rvslots: 'main' });
    const p = d.query?.pages?.[0];
    if (!p || p.missing) continue;
    const text: string = p.revisions?.[0]?.slots?.main?.content ?? '';
    if (/^\s*#\s*(redirect|تغییر)/i.test(text)) continue;
    const u = info.get(x.user);
    const tier: Tier = !x.userid || x.user.startsWith('~') ? 'T0' : (u?.editcount ?? 0) < 50 ? 'T1' : 'T2';
    out.push({ kind: 'creation', label: 0, page: x.title, ns: 0, why: 'survived', tier, snippet: text.slice(0, 200) });
  }
  return out;
}

export function metrics(rs: any[]): string {
  const lines: string[] = ['# Backtest', ''];
  const by = (f: (x: any) => boolean) => rs.filter(f);
  for (const [name, action, kind] of [['Revert (edits)', 'revert', 'edit'], ['Speedy tag (creations)', 'tag', 'creation']] as const) {
    const scope = by(x => x.kind === kind);
    const acted = scope.filter(x => x.action === action);
    const tp = acted.filter(x => x.label === 1).length;
    const pos = scope.filter(x => x.label === 1 && x.tier !== 'T2').length;
    lines.push(`## ${name}`, '',
      `- cases: ${scope.length} (${scope.filter(x => x.label === 1).length} positive)`,
      `- acted: ${acted.length}, correct: ${tp}, **precision ${acted.length ? (tp / acted.length).toFixed(3) : 'n/a'}**`,
      `- recall on T0/T1 positives: ${pos ? (acted.filter(x => x.label === 1 && x.tier !== 'T2').length / pos).toFixed(3) : 'n/a'}`,
      `- acted on T2: ${acted.filter(x => x.tier === 'T2').length} (must be 0)`, '');
    const fps = acted.filter(x => x.label === 0);
    if (fps.length) {
      lines.push('False positives:', '');
      for (const x of fps) lines.push(`- ${x.tier} ${x.page} r${x.rev ?? ''}: ${x.p1?.[0]} ${x.p1?.[1]} — ${x.p1?.[3] ?? ''}`);
      lines.push('');
    }
  }
  const reported = by(x => x.action === 'report');
  lines.push('## Review queue', '',
    `- reported: ${reported.length}, of which positive: ${reported.filter(x => x.label === 1).length}`,
    `- LLM errors: ${by(x => x.err).length}`,
    `- fingerprints: ${[...new Set(rs.map(x => x.fp).filter(Boolean))].join(', ')}`, '');
  return lines.join('\n');
}
