/**
 * CLI entry point for وظیفهٔ ۱۳ — **every** database report this bot publishes.
 *
 *   npx tsx src/tasks/task-13/reports-cli.ts --selftest
 *   npx tsx src/tasks/task-13/reports-cli.ts --report move     [--live] [--refresh]
 *        … --ns article|category|template|project|help   (default: every one)
 *   npx tsx src/tasks/task-13/reports-cli.ts --report portals  [--live] [--only popular|candidates]
 *   npx tsx src/tasks/task-13/reports-cli.ts --report featured [--live]
 *   npx tsx src/tasks/task-13/reports-cli.ts --report prefs    [--live]
 *   npx tsx src/tasks/task-13/reports-cli.ts --report neighbors [--live] [--only ar|ckb|mzn|mideast]
 *   npx tsx src/tasks/task-13/reports-cli.ts --report acmoves  [--live]   (autoconfirmed)
 *   npx tsx src/tasks/task-13/reports-cli.ts --report ecmoves  [--live]   (extendedconfirmed, not autopatrolled)
 *   npx tsx src/tasks/task-13/reports-cli.ts --report usermoves [--live]  (both, one replica pass)
 *   npx tsx src/tasks/task-13/reports-cli.ts --report iranica  [--live] [--pages N] [--no-fetch]
 *   npx tsx src/tasks/task-13/reports-cli.ts --report all      [--live]
 *
 * One task, one entry, one bundle. The reports have nothing in common in their data —
 * one reads fa page titles, the others read two replicas and the pageviews API — but
 * they are the same JOB: propose something on a page, never touch an article, need no
 * permission, and go out unflagged so people see them. Splitting them across task
 * numbers would have meant a second permission conversation for work the BAG has
 * already said needs none.
 *
 * `main()` is called UNCONDITIONALLY, with no `isMain()` guard, because this entry is
 * bundled on its own for Toolforge. A bundle collapses every module into one file, so
 * `import.meta.url` becomes the bundle's and `__BUNDLED__` makes `isMain()` return false
 * everywhere — a guarded main() in a solo bundle simply never runs and the job exits 0
 * having done nothing. Nothing imports this file; the library halves are
 * `move-report.ts` and `portal-reports.ts`, which the tests and the bundler gate load.
 */
import { TARGETS, run as runMoveReport, selfTest as moveSelfTest } from './move-report.js';
import { runPortalReports } from './portal-reports-run.js';
import { runFeaturedReport } from './featured-report-run.js';
import { runPrefsReport } from './prefs-report-run.js';
import { runNeighborWikisReports } from './neighbor-wikis-report-run.js';
import { collectMoves, runAcMovesReport } from './ac-moves-report-run.js';
import { runEcMovesReport } from './ec-moves-report-run.js';
import { runIranicaReport } from './iranica-report-run.js';
import { Bot } from '../../core.js';
import { selfTest as portalSelfTest } from './portal-reports.selftest.js';
import { selfTest as featuredSelfTest } from './featured-report.selftest.js';
import { selfTest as prefsSelfTest } from './prefs-report.selftest.js';
import { selfTest as neighborSelfTest } from './neighbor-wikis-report.selftest.js';
import { selfTest as acMovesSelfTest } from './ac-moves-report.selftest.js';
import { selfTest as ecMovesSelfTest } from './ec-moves-report.selftest.js';
import { selfTest as iranicaSelfTest } from './iranica-report.selftest.js';

const argv = process.argv.slice(2);
const arg = (name: string) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};

async function main() {
  if (argv.includes('--selftest')) {
    // Both halves, so the bundler's gate covers every report in the bundle. A single
    // line is printed because build-bundle.ts matches on it.
    for (const t of [moveSelfTest(), portalSelfTest(), featuredSelfTest(), prefsSelfTest(), neighborSelfTest(), acMovesSelfTest(), ecMovesSelfTest(), iranicaSelfTest()]) {
      if (!t.startsWith('SELFTEST OK')) { console.error(t); process.exit(1); }
    }
    console.log('SELFTEST OK: هر هشت گزارش‌ساز');
    return;
  }
  const report = arg('--report') ?? 'move';
  if (!['move', 'portals', 'featured', 'prefs', 'neighbors', 'acmoves', 'ecmoves', 'usermoves', 'iranica', 'all'].includes(report)) {
    console.error(`گزارش ناشناخته: ${report} (move | portals | featured | prefs | neighbors | acmoves | ecmoves | usermoves | iranica | all)`);
    process.exit(1);
  }
  if (report === 'move' || report === 'all') {
    // One rules engine, five namespaces. --ns picks one; the default is all of them,
    // so a scheduled run keeps every sibling report current without five job entries.
    const only = arg('--ns');
    for (const [name, t] of Object.entries(TARGETS)) {
      if (only && only !== name) continue;
      await runMoveReport(t);
    }
  }
  if (report === 'portals' || report === 'all') await runPortalReports(argv);
  if (report === 'featured' || report === 'all') await runFeaturedReport(argv);
  if (report === 'prefs' || report === 'all') await runPrefsReport(argv);
  if (report === 'neighbors' || report === 'all') await runNeighborWikisReports(argv);
  // Not in «all»: weekly, and its entry fetches respect Iranica's 20-second crawl delay.
  if (report === 'iranica') await runIranicaReport(argv);
  if (report === 'acmoves') await runAcMovesReport(argv);
  if (report === 'ecmoves') await runEcMovesReport(argv);
  if (report === 'usermoves' || report === 'all') {
    // Both move reports read the same moves and the same rights-log replay; collect once.
    const data = await collectMoves(new Bot({ dryRun: true, delayMs: 0, limit: 0, maxlag: 5, flagEdits: false }));
    await runAcMovesReport(argv, data);
    await runEcMovesReport(argv, data);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
