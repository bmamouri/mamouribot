/**
 * CLI entry point for the وظیفهٔ ۳ review-page sweep. See `scan-conflicts.ts`.
 *
 *   npx tsx src/tasks/task-03/scan-conflicts-cli.ts [--live] [--limit N]
 *
 * `run()` is called UNCONDITIONALLY and with no `isMain()` guard, for the reason
 * documented in `../task-13/move-report-cli.ts`: this entry is bundled on its own, and
 * inside a bundle `isMain()` is false everywhere, so a guarded main() never runs and the
 * job exits 0 having done nothing.
 */
import { run } from './scan-conflicts.js';

run().catch(e => { console.error(e); process.exit(1); });
