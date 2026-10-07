/**
 * Scale validation for Task 1 (read-only, batched to respect API limits).
 *
 * Fetches every target's wikitext in chunks of 50, applies removeUseDmyDates,
 * and reports: how many would change, how many are opted-out ({{nobots}}/{{bots}}),
 * how many produce NO match (need manual review), plus sample diffs and the full
 * no-match list. No login, no writes.
 */
import { Bot } from '../../core.js';
import { useDmyDatesTask, removeUseDmyDates } from './use-dmy-dates.js';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function main() {
  const bot = new Bot({ dryRun: true, delayMs: 0, limit: 0, maxlag: 5 });
  const titles = await useDmyDatesTask.getTargets(bot);
  console.log(`هدف‌ها: ${titles.length} مقاله`);

  let changed = 0, optedOut = 0, noMatch = 0, multi = 0;
  const noMatchList: string[] = [];
  const samples: string[] = [];

  for (let i = 0; i < titles.length; i += 50) {
    const chunk = titles.slice(i, i + 50);
    const d = await bot.apiGet({ action: 'query', prop: 'revisions', rvprop: 'content', rvslots: 'main', titles: chunk.join('|') });
    for (const pg of d.query.pages) {
      if ('missing' in pg || !pg.revisions) { noMatch++; noMatchList.push(pg.title + ' (missing)'); continue; }
      const text: string = pg.revisions[0].slots.main.content;
      if (Bot.isOptedOut(text)) { optedOut++; continue; }
      const occurrences = (text.match(/\{\{\s*[Uu]se dmy dates\b/g) || []).length;
      const { text: out, changed: ch } = removeUseDmyDates(text);
      if (!ch) { noMatch++; noMatchList.push(pg.title); continue; }
      changed++;
      if (occurrences > 1) multi++;
      // sanity: result must still contain no Use dmy dates, and must be SHORTER
      if (/\{\{\s*[Uu]se dmy dates\b/.test(out)) { console.log(`  ⚠ ${pg.title}: باقیماندهٔ الگو پس از حذف!`); }
      if (out.length >= text.length) { console.log(`  ⚠ ${pg.title}: طول کاهش نیافت`); }
      if (samples.length < 8) {
        const removed = text.split('\n').filter(l => /\{\{\s*[Uu]se dmy dates\b/.test(l)).map(l => l.trim());
        samples.push(`[${pg.title}]  −  ${removed.join(' / ').slice(0, 140)}`);
      }
    }
    process.stdout.write(`\r  پردازش‌شده: ${Math.min(i + 50, titles.length)}/${titles.length}`);
    await sleep(400);
  }
  console.log('\n\n=== خلاصهٔ اعتبارسنجی ===');
  console.log(`قابل‌حذف        : ${changed}`);
  console.log(`دارای چند نمونه : ${multi}`);
  console.log(`آپت‌اوت (رد)     : ${optedOut}`);
  console.log(`بی‌تطبیق         : ${noMatch}`);
  if (noMatchList.length) { console.log('\nفهرست بی‌تطبیق (بازبینی دستی):'); noMatchList.forEach(t => console.log('  - ' + t)); }
  console.log('\nنمونهٔ تغییرها:'); samples.forEach(s => console.log('  ' + s));
}
main().catch(e => { console.error(e); process.exit(1); });
