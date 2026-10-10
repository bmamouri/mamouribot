/**
 * CLI entry point for وظیفهٔ ۱۳ — **every** database report this bot publishes.
 *
 *   npx tsx src/tasks/task-13/reports-cli.ts --selftest
 *   npx tsx src/tasks/task-13/reports-cli.ts --report move     [--live] [--refresh]
 *   npx tsx src/tasks/task-13/reports-cli.ts --report portals  [--live] [--only popular|candidates]
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
import { run as runMoveReport, selfTest as moveSelfTest } from './move-report.js';
import { runPortalReports } from './portal-reports-run.js';
import { selfTest as portalSelfTest } from './portal-reports.selftest.js';

const argv = process.argv.slice(2);
const arg = (name: string) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};

async function main() {
  if (argv.includes('--selftest')) {
    // Both halves, so the bundler's gate covers every report in the bundle. A single
    // line is printed because build-bundle.ts matches on it.
    for (const t of [moveSelfTest(), portalSelfTest()]) {
      if (!t.startsWith('SELFTEST OK')) { console.error(t); process.exit(1); }
    }
    console.log('SELFTEST OK: هر دو گزارش‌ساز');
    return;
  }
  const report = arg('--report') ?? 'move';
  if (report !== 'move' && report !== 'portals' && report !== 'all') {
    console.error(`گزارش ناشناخته: ${report} (move | portals | all)`);
    process.exit(1);
  }
  if (report === 'move' || report === 'all') await runMoveReport();
  if (report === 'portals' || report === 'all') await runPortalReports(argv);
}

main().catch(e => { console.error(e); process.exit(1); });
