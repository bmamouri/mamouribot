/**
 * De-stub — continuous watcher. The CLI entry; the logic lives in
 * destub-watch-lib.ts (see that file's header for why the split exists).
 *
 *   npx tsx src/tasks/task-10/destub-watch.ts                     # one poll, dry-run
 *   npx tsx src/tasks/task-10/destub-watch.ts --live               # one poll, writes (≤20 edits)
 *   npx tsx src/tasks/task-10/destub-watch.ts --live --limit 0     # one poll, writes (no cap — don't schedule this)
 */
import { Bot, type RunOptions } from '../../core.js';
import { poll, DEFAULT_WATCH_EDIT_LIMIT } from './destub-watch-lib.js';

async function main() {
  const argv = process.argv.slice(2);
  const live = argv.includes('--live');
  const limitArg = argv.indexOf('--limit');
  const limit = limitArg >= 0 ? Number(argv[limitArg + 1]) : DEFAULT_WATCH_EDIT_LIMIT;
  const opts: RunOptions = { dryRun: !live, delayMs: 10000, limit, maxlag: 5 };
  const bot = new Bot(opts);
  await poll(bot);
}

// Unconditional, like run.ts — nothing imports THIS file (destub-watch-lib.ts
// is what tests and future callers import), so there is no ambiguity for an
// isMain() guard to resolve, bundled or not. See destub-watch-lib.ts's header.
main().catch(e => { console.error(e); process.exit(1); });
