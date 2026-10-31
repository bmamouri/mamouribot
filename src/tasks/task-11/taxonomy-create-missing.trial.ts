/**
 * Read-only trial for Task 11. Writes nothing.
 *
 *   npx tsx src/tasks/task-11/taxonomy-create-missing.trial.ts [limit]
 *
 * Runs the real getTargets() against the live category, then for each target
 * runs the real transform() and the real verify() — the templatesandbox proof
 * that the proposed template actually does its job. Prints what the bot would
 * create, how many it refuses, and why.
 */
import { Bot } from '../../core.js';
import { task, _refusals } from './taxonomy-create-missing.js';

const limit = Number(process.argv[2] ?? 0);
const bot = new Bot({ dryRun: true, delayMs: 0, limit: 0, maxlag: 5, identity: 'bot' });

const targets = await task.getTargets(bot);
console.log(`\n=== ${targets.length} الگو قابل ساخت\n`);

let good = 0;
const take = limit ? targets.slice(0, limit) : targets;
for (const t of take) {
  const { text, changed } = task.transform('', t);
  if (!changed) { console.log(`✗ ${t}\n    transform refused`); continue; }
  const v = await task.verify!(bot, t, '', text);
  if (v.ok) good++;
  console.log(`${v.ok ? '✓' : '✗'} ${t} — ${v.detail}\n    ${text.trim().replace(/\n/g, ' ')}`);
}
console.log(`\n=== اثبات: ${good}/${take.length}`);

const ref = _refusals();
const byWhy = new Map<string, number>();
for (const r of ref) byWhy.set(r.why, (byWhy.get(r.why) ?? 0) + 1);
console.log(`\n=== ${ref.length} مورد برای بازبینی انسانی`);
for (const [why, n] of [...byWhy].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${why}`);
