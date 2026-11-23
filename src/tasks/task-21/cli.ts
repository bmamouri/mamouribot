/**
 * fa.wiktionary anti-vandalism patrol: entry point.
 *
 *   npx tsx src/tasks/task-21/cli.ts patrol [--once] [--live]
 *   npx tsx src/tasks/task-21/cli.ts backtest <gold.jsonl> [--per-bucket 300] [--concurrency 4] [--out dir]
 *   npx tsx src/tasks/task-21/cli.ts selftest
 *
 * Dry unless --live. --live is refused until WIKT_PATROL_APPROVED=1 is set, which is to
 * be set only once the bot request on fa.wiktionary is approved (docs/task-21-wiktionary-antivandal.md).
 */
import { backtest } from './backtest.js';
import { Patrol } from './patrol.js';
import { flags } from './rules.js';
import { decide } from './decide.js';

const a = process.argv.slice(2);
const val = (k: string, d: number) => { const i = a.indexOf(k); return i >= 0 ? Number(a[i + 1]) : d; };
const str = (k: string, d: string) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : d; };

async function main() {
  const cmd = a[0];
  if (cmd === 'selftest') {
    // Network-free proof that the bundle's rules and ladder survived bundling.
    const f = flags({ ns: 0, isCreation: true, oldText: '', newText: 'علی متولد ۱۳۸۰ در تهران است', added: ['علی متولد ۱۳۸۰ در تهران است'], removed: [], summary: '', tags: [] });
    const d = decide({ tier: 'T3', ns: 0, isCreation: true, flags: f, pass1: null, pass2: null, fingerprintTrusted: true,
      revertsLowTrustUser: false, hasRevertTarget: true, trustedEditedSince: false, botAlreadyActedOnPairToday: false,
      humanUndidBotOnPair: false, writesInLastHour: 0, actionsToday: 0, highUseTemplate: false });
    const ok = f.some(x => x.id === 'no-structure') && d.action === 'log';
    console.log(ok ? 'SELFTEST OK' : `SELFTEST FAILED ${JSON.stringify({ f, d })}`);
    process.exit(ok ? 0 : 1);
  }
  if (cmd === 'backtest') {
    await backtest(a[1], val('--per-bucket', 300), val('--concurrency', 4), str('--out', '.state/wikt-backtest'));
    return;
  }
  if (cmd === 'patrol') {
    const live = a.includes('--live');
    if (live && process.env.WIKT_PATROL_APPROVED !== '1') {
      console.error('--live is refused: the fa.wiktionary bot request is not approved (WIKT_PATROL_APPROVED≠1).');
      process.exit(2);
    }
    console.log(live ? '⚠️  حالت واقعی روی ویکی‌واژه' : 'حالت آزمایشی: بی هیچ ویرایشی');
    await new Patrol(live).run({ once: a.includes('--once') });
    return;
  }
  console.error('usage: cli.ts patrol|backtest|selftest');
  process.exit(1);
}
main().catch(e => { console.error(e); process.exit(1); });
