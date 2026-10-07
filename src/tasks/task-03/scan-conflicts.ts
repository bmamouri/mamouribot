/**
 * Read-only sweep that rebuilds the وظیفهٔ ۳ manual-review worklist.
 *
 *   npx tsx src/tasks/task-03/scan-conflicts.ts [--live] [--limit N] [--titles-from FILE]
 *
 * Default reads and prints. `--live` is the ONLY thing that writes, and the only page it
 * ever writes is the report page — it never touches an article.
 *
 * WHY THIS EXISTS
 * ---------------
 * A value clash is noticed while a page is being processed, and a processed page is
 * parked in the resume checkpoint, so the normal run will never look at it again. The
 * 1,000-edit trial therefore recorded its clashes in memory and dropped them: 834 pages
 * were examined and nothing on the wiki says which of them a human still has to decide.
 * Re-running the task cannot recover them — it skips every page it already did.
 *
 * This walks the titles the checkpoint already knows about, re-reads them, and records
 * what is STILL unresolved. The detector is the same exported `normalizeCiteParams`, so
 * the worklist cannot disagree with what the bot actually refuses to touch.
 */
import { Bot } from '../../core.js';
import { existsSync, readFileSync } from 'fs';
import { normalizeCiteParams, publishReviewRows, type Conflict } from './normalize-cite-params.js';
import { loadStoreChecked, mergeReview, saveStore, storePath } from './review-store.js';

/** Titles to re-read: an explicit file, else everything the checkpoint has seen. */
export function titlesToScan(): string[] {
  const i = process.argv.indexOf('--titles-from');
  const file = i >= 0 ? process.argv[i + 1] : '';
  if (file) {
    if (!existsSync(file)) throw new Error(`--titles-from: ${file} وجود ندارد`);
    return readFileSync(file, 'utf8').split('\n').map(s => s.trim()).filter(Boolean);
  }
  const statePath = `${process.env.BOT_STATE_DIR ?? '.state'}/normalize-cite-params.json`;
  if (!existsSync(statePath)) throw new Error(`سیاههٔ پیشرفت یافت نشد: ${statePath}`);
  const cp = JSON.parse(readFileSync(statePath, 'utf8'));
  const keys = (v: unknown) => Array.isArray(v) ? v as string[] : Object.keys(v ?? {});
  return [...new Set([...keys(cp.done), ...keys(cp.deferred)])];
}

/** `titles=` takes 50 per request without apihighlimits, 500 with it. */
async function fetchBatch(bot: Bot, titles: string[]): Promise<Map<string, string>> {
  const d = await bot.apiGet({
    action: 'query', prop: 'revisions', rvprop: 'content', rvslots: 'main',
    titles: titles.join('|'), formatversion: '2',
  });
  const out = new Map<string, string>();
  for (const p of (d.query?.pages ?? [])) {
    const content = p.revisions?.[0]?.slots?.main?.content;
    if (typeof content === 'string') out.set(p.title, content);
  }
  return out;
}

// Reads need no login; `login()` is called only for the publish. The only write this
// module can make is the report page, through publishReviewRows.
const bot = new Bot({ dryRun: false, delayMs: 0, limit: 0, maxlag: 5 });

export async function run() {
  const live = process.argv.includes('--live');
  const li = process.argv.indexOf('--limit');
  const limit = li >= 0 && process.argv[li + 1] ? Number(process.argv[li + 1]) : 0;

  const allTitles = titlesToScan();
  let titles = allTitles;
  if (limit) titles = titles.slice(0, limit);
  console.log(`بازخوانی ${titles.length} صفحه برای یافتن تداخل مقدار (فقط خواندن)`);

  const fresh: { title: string; conflicts: Conflict[] }[] = [];
  const BATCH = 50;
  for (let i = 0; i < titles.length; i += BATCH) {
    const chunk = titles.slice(i, i + BATCH);
    const texts = await fetchBatch(bot, chunk);
    for (const [title, text] of texts) {
      // A title that reads clean is recorded too, with an empty list: that is what
      // removes a row already on the page for an article somebody has since fixed.
      fresh.push({ title, conflicts: normalizeCiteParams(text).conflicts ?? [] });
    }
    const found = fresh.filter(f => f.conflicts.length).length;
    console.log(`  ${Math.min(i + BATCH, titles.length)}/${titles.length} — تا اینجا ${found} مقالهٔ دارای تداخل`);
  }

  const { rows: stored, existed } = loadStoreChecked();
  const rows = mergeReview(stored, fresh);

  // Publishing replaces the whole page, and `fresh` only covers the titles just read. A
  // partial scan with no store on disk therefore republishes a worklist built from a
  // handful of titles, deleting every row the full history had recorded. Rebuilding the
  // page from scratch is legitimate ONLY when the scan was complete.
  // Compared against the FULL title list, not the sliced one: after `slice(0, limit)`
  // the two lengths are equal by construction and the check would never fire.
  const partial = titles.length < allTitles.length;
  if (!existed && partial) {
    throw new Error(`سیاههٔ تداخل‌ها (${storePath()}) موجود نیست و این پویش کامل نبود `
      + `(${titles.length} از ${allTitles.length}). انتشار صفحه در این حالت فهرست را نابود می‌کند؛ `
      + 'یا --limit را بردارید یا سیاهه را بیاورید.');
  }
  const withConflicts = rows.filter(r => r.conflicts.length);
  console.log(`\nمجموع موردهای نیازمند بازبینی: ${withConflicts.length} مقاله`
    + ` (${withConflicts.reduce((n, r) => n + r.conflicts.length, 0)} فیلد)`);

  if (!live) {
    console.log('\n(حالت آزمایشی؛ برای ذخیره و انتشار --live بدهید)');
    for (const r of withConflicts.slice(0, 15)) {
      console.log(`  ${r.title}: ${r.conflicts.map(c => c.field).join('، ')}`);
    }
    await publishReviewRows(bot, rows, true);
    return;
  }
  saveStore(rows);
  await bot.login();
  await publishReviewRows(bot, rows, false);
}
