/**
 * Read-only trial for Task 11. Writes nothing.
 *
 *   npx tsx src/tasks/taxonomy-create-missing.trial.ts [limit]
 *
 * Runs the real getTargets() against the live category, then for each target
 * runs the real transform() and the real verify() — the templatesandbox proof
 * that the proposed template actually clears a blocked article. Prints the
 * table a BRFA needs: how many the bot would fix, how many it refuses, and why.
 */
import { writeFileSync } from 'fs';
import { Bot } from '../../core.js';
import { task, _refusals } from './taxonomy-create-missing.js';

const limit = Number(process.argv[2] ?? 0);
const bot = new Bot({ dryRun: true, delayMs: 0, limit: 0, maxlag: 5 });

const targets = await task.getTargets(bot);
console.log(`\n=== ${targets.length} الگو قابل ساخت\n`);

const rows: { title: string; ok: boolean; detail: string; body: string }[] = [];
const take = limit ? targets.slice(0, limit) : targets;
for (const t of take) {
  const { text, changed } = task.transform('', t);
  if (!changed) { rows.push({ title: t, ok: false, detail: 'transform refused', body: '' }); continue; }
  const v = await task.verify!(bot, t, '', text);
  rows.push({ title: t, ok: v.ok, detail: v.detail, body: text });
  console.log(`${v.ok ? '✓' : '✗'} ${t}\n    ${v.detail}`);
}

const good = rows.filter(r => r.ok).length;
console.log(`\n=== اثبات: ${good}/${rows.length} الگو واقعاً مقالهٔ مسدود را از رده خارج می‌کند`);

const ref = _refusals();
const byWhy = new Map<string, number>();
for (const r of ref) byWhy.set(r.why, (byWhy.get(r.why) ?? 0) + 1);
console.log(`\n=== ${ref.length} مورد برای بازبینی انسانی`);
for (const [why, n] of [...byWhy].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${why}`);

writeFileSync('src/tasks/task11-trial.json',
  JSON.stringify({ targets, rows, refusals: ref }, null, 1));
console.log('\nwrote src/tasks/task11-trial.json');
