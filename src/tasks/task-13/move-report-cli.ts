/**
 * CLI entry point for وظیفهٔ ۱۳. See `move-report.ts` for what the task does.
 *
 *   npx tsx src/tasks/task-13/move-report-cli.ts [--live] [--refresh] [--sample N] [--backend ssh|direct]
 *   npx tsx src/tasks/task-13/move-report-cli.ts --selftest
 *
 * `main()` is called UNCONDITIONALLY, with no `isMain()` guard, because this entry is
 * bundled on its own for Toolforge. A bundle collapses every module into one file, so
 * `import.meta.url` becomes the bundle's and `__BUNDLED__` makes `isMain()` return
 * false everywhere — a guarded main() in a solo bundle simply never runs, and the job
 * exits 0 having done nothing. Nothing imports this file; the library half is
 * `move-report.ts`, which is what the tests and the bundler's gate load.
 */
import { run } from './move-report.js';

run().catch(e => { console.error(e); process.exit(1); });
