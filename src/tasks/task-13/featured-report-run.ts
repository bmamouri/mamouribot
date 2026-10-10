/**
 * The networked half of the featured-content report. Parsing and table building, and the
 * reasoning behind both, are in `featured-report.ts`, which is what the tests load.
 */
import { Bot } from '../../core.js';
import { checkWikitext } from '../../lib/gates.js';
import {
  FEATURED_PAGE, SOURCES, buildFeatured, parseStars, rank, type Kind,
} from './featured-report.js';

export async function runFeaturedReport(argv: string[]) {
  const live = argv.includes('--live');
  const bot = new Bot({ dryRun: !live, delayMs: 0, limit: 0, maxlag: 5, flagEdits: false });

  const parts = {} as Record<Kind, Map<string, number>>;
  for (const [kind, src] of Object.entries(SOURCES) as [Kind, { page: string; label: string }][]) {
    const d = await bot.apiGet({ action: 'query', prop: 'revisions', titles: src.page,
      rvprop: 'content', rvslots: 'main' });
    const pg = d.query.pages[0];
    if (pg.missing) throw new Error(`منبع یافت نشد: ${src.page}`);
    parts[kind] = parseStars(pg.revisions[0].slots.main.content);
    console.log(`${src.label}: ${parts[kind].size} کاربر`);
  }

  const rows = rank(parts);
  // A zero, or a handful, would be indistinguishable from "the parser broke" — and this
  // publishes over a live page. See a-zero-needs-a-positive-control.
  if (rows.length < 50) {
    throw new Error(`تنها ${rows.length} کاربر یافت شد؛ احتمالاً تجزیهٔ صفحه‌های منبع شکسته است`);
  }
  console.log(`${rows.length} کاربر؛ بیشینه ${rows[0].score} (${rows[0].user})`);

  const text = buildFeatured(rows);
  const problems = checkWikitext(FEATURED_PAGE, text).filter(p => !p.includes('signature leak'));
  if (problems.length) throw new Error('GATE FAILED:\n  - ' + problems.join('\n  - '));
  if (!live) { console.log(`\n${text.slice(0, 1100)}\n… (${text.length} bytes)`); return; }

  const cur = await bot.apiGet({ action: 'query', prop: 'revisions', titles: FEATURED_PAGE,
    rvprop: 'content|ids|timestamp', rvslots: 'main' });
  const p = cur.query.pages[0];
  await bot.edit(FEATURED_PAGE, text, 'به‌روزرسانی فهرست کاربران بر پایهٔ محتوای برگزیده',
    p.missing ? 0 : p.revisions[0].revid, p.missing ? '' : p.revisions[0].timestamp,
    { allowCreate: true });
  console.log(`منتشر شد: ${FEATURED_PAGE}`);
  const sig = `${FEATURED_PAGE}/امضا`;
  const s = (await bot.apiGet({ action: 'query', prop: 'revisions', titles: sig,
    rvprop: 'ids|timestamp', rvslots: 'main' })).query.pages[0];
  await bot.edit(sig, '‏~~~~~', 'به‌روزرسانی زمان آخرین اجرا',
    s.missing ? 0 : s.revisions[0].revid, s.missing ? '' : s.revisions[0].timestamp,
    { allowCreate: true });
}
