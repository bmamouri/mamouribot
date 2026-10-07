/**
 * De-stub, phase 1 — the CLI entry. Logic lives in destub-inventory-lib.ts (see
 * that file's header for why the split exists: this module is bundled SOLO for
 * a monthly Toolforge refresh job, and an isMain()-guarded self-invocation is
 * the wrong tool for a solo bundle).
 *
 *   npx tsx src/tasks/task-10/destub-inventory.ts [--refresh]
 *
 * Writes .state/destub/stub-templates.json, consumed by
 * destub-classify.ts, destub.ts and destub-watch-lib.ts. loadInventory()
 * refuses a copy older than 30 days (MAX_INVENTORY_AGE_DAYS) — see
 * docs/TOOLFORGE.md for the scheduled refresh this feeds.
 */
import { Bot } from '../../core.js';
import { build, INVENTORY_PATH } from './destub-inventory-lib.js';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname } from 'path';

async function main() {
  const bot = new Bot({ dryRun: true, delayMs: 0, limit: 0, maxlag: 5 });
  const inv = await build(bot);
  mkdirSync(dirname(INVENTORY_PATH), { recursive: true });
  writeFileSync(INVENTORY_PATH, JSON.stringify(inv, null, 1));
  console.log(`\nنوشته شد: ${INVENTORY_PATH}`);
  console.log(`  الگو: ${Object.keys(inv.templates).length}`);
  console.log(`  کلید جست‌وجو: ${Object.keys(inv.index).length}`);
}

// Unconditional, like run.ts and destub-watch.ts — nothing imports THIS file,
// so there is no multi-module-bundle ambiguity for an isMain() guard to resolve.
main().catch(e => { console.error(e); process.exit(1); });
