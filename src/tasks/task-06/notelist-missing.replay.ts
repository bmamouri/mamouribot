/**
 * Replay check for وظیفهٔ ۶, against real articles. NEEDS THE NETWORK, so it is not
 * part of `npm test` — hence `.replay.ts` and not `.test.ts`.
 *
 * The tracking category is empty most of the time, so a live dry-run proves
 * nothing. Instead this fetches the PARENT of each revision the cleanup already
 * published (journalled in data/notelist/*.jsonl) — i.e. the broken wikitext as
 * it actually existed — and asserts the task still diagnoses and repairs it.
 *
 * It needs two things this repository does not carry: credentials in `.env`, and the
 * journals, which live in the companion repo of one-off scripts. Run it from there:
 *
 *   cd .. && npx tsx bots/src/tasks/task-06/notelist-missing.replay.ts [--limit=N]
 *
 * (The header used to say وظیفهٔ ۵. It imports notelistMissingTask, which is ۶.)
 */
import { existsSync, readFileSync } from 'fs';
import { apiGet, loadEnv } from '../../lib/fa-wiki.js';
import { classify, renderGroups, usedGroups } from '../../lib/notelist.js';
import { notelistMissingTask as task, seedBrokenGroups } from './notelist-missing.js';

// A missing .env or a missing journal is a setup problem, not a test failure, and it
// should say so in a sentence rather than throw ENOENT from inside a helper.
try {
  loadEnv();
} catch {
  console.error('این آزمون به .env نیاز دارد. از ریشهٔ مخزن یک‌بارمصرف‌ها اجرا کنید:\n' +
    '  cd .. && npx tsx bots/src/tasks/task-06/notelist-missing.replay.ts');
  process.exit(2);
}
const LIMIT = Number(process.argv.find(a => a.startsWith('--limit='))?.slice(8) ?? 40);

/** every title+revision this project published, newest journals first */
function published(): { title: string; rev: number; kind?: string }[] {
  const files = ['sweep.jsonl', 'cat-fixed.jsonl', 'efn-converted.jsonl', 'refgroup2-fixed.jsonl'];
  const out: { title: string; rev: number; kind?: string }[] = [];
  for (const f of files) {
    const p = `data/notelist/${f}`;
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, 'utf8').split('\n').filter(Boolean)) {
      const r = JSON.parse(line);
      if (r.rev) out.push({ title: r.title, rev: r.rev, kind: r.kind });
    }
  }
  return out;
}

(async () => {
  const rows = published().slice(-LIMIT);
  if (!rows.length) throw new Error('no journalled revisions to replay');

  let ok = 0, deferred = 0, failed = 0;
  const byKind: Record<string, number> = {};

  for (const row of rows) {
    // the parent of our edit = the broken text
    const r = await apiGet({ action: 'query', prop: 'revisions', revids: String(row.rev),
      rvprop: 'content|ids', rvslots: 'main' });
    const page = r.query?.pages?.[0];
    const rev = page?.revisions?.[0];
    if (!rev?.parentid) { console.log(`– ${row.title}: no parent revision`); continue; }

    const pr = await apiGet({ action: 'query', prop: 'revisions', revids: String(rev.parentid),
      rvprop: 'content', rvslots: 'main' });
    const before = pr.query?.pages?.[0]?.revisions?.[0]?.slots?.main?.content as string | undefined;
    if (!before) { console.log(`– ${row.title}: parent unreadable`); continue; }

    // mirror what the bot sees at runtime: getTargets renders each candidate, so
    // the groups come from Cite, not from a wikitext scan that transclusion hides
    const rendered = (await renderGroups(row.title, before)).groups;
    const groups = rendered.length ? rendered : usedGroups(before);
    seedBrokenGroups(row.title, groups);
    const c = classify(before, groups);
    byKind[c.kind] = (byKind[c.kind] ?? 0) + 1;
    const res = task.transform(before, row.title);

    if (res.changed) { ok++; console.log(`✓ ${row.title} [${c.kind}] ${res.note}`); }
    else if (res.manualReview) { deferred++; console.log(`⚠ ${row.title} [${c.kind}] deferred: ${res.note}`); }
    else { failed++; console.log(`✗ ${row.title} [${c.kind}] NO CHANGE — ${res.note}`); }
  }

  console.log(`\nrepaired ${ok}   deferred ${deferred}   missed ${failed}   of ${rows.length}`);
  console.log('classified as: ' + Object.entries(byKind).map(([k, n]) => `${k}=${n}`).join(', '));
  if (failed) { console.error('\nFAIL: the task no longer repairs wikitext it previously fixed'); process.exit(1); }
})();
