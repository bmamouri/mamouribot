/** The networked half of the user-preferences report. See `prefs-report.ts`. */
import { Bot } from '../../core.js';
import { checkWikitext } from '../../lib/gates.js';
import { queryRows } from '../../lib/replica.js';
import {
  PREFS_PAGE, PREFS_SQL, PROPERTIES, TOTALS_SQL, buildPrefs, type PrefRow,
} from './prefs-report.js';

const n = (v: string) => Number(v) || 0;

export async function runPrefsReport(argv: string[]) {
  const live = argv.includes('--live');
  const bot = new Bot({ dryRun: !live, delayMs: 0, limit: 0, maxlag: 5, flagEdits: false });

  const rows: PrefRow[] = (await queryRows(PREFS_SQL, { wiki: 'fa' })).map(r => ({
    property: r.up_property, users: n(r.users), edited: n(r.edited),
    ge100: n(r.ge100), ge1000: n(r.ge1000),
  }));
  const t = (await queryRows(TOTALS_SQL, { wiki: 'fa' }))[0];
  console.log(`${rows.length} ترجیح در پایگاه بدل: ${rows.map(r => r.property).join('، ')}`);

  // If the replica ever exposes more, say so rather than silently dropping it: the
  // table only prints properties PROPERTIES can explain.
  const unknown = rows.filter(r => !PROPERTIES[r.property]).map(r => r.property);
  if (unknown.length) console.log(`  ترجیح تازه و توضیح‌داده‌نشده: ${unknown.join('، ')}`);
  // Every property vanishing is what a redaction change looks like, and it would
  // publish an empty table over a live page.
  if (!rows.some(r => PROPERTIES[r.property])) throw new Error('هیچ ترجیح شناخته‌شده‌ای یافت نشد');

  const text = buildPrefs(rows, { accounts: n(t.accounts), edited: n(t.edited) });
  const problems = checkWikitext(PREFS_PAGE, text).filter(p => !p.includes('signature leak'));
  if (problems.length) throw new Error('GATE FAILED:\n  - ' + problems.join('\n  - '));
  if (!live) { console.log(`\n${text}`); return; }

  const cur = await bot.apiGet({ action: 'query', prop: 'revisions', titles: PREFS_PAGE,
    rvprop: 'content|ids|timestamp', rvslots: 'main' });
  const p = cur.query.pages[0];
  await bot.edit(PREFS_PAGE, text, 'به‌روزرسانی گزارش ترجیحات کاربران',
    p.missing ? 0 : p.revisions[0].revid, p.missing ? '' : p.revisions[0].timestamp,
    { allowCreate: true });
  console.log(`منتشر شد: ${PREFS_PAGE}`);
  const sig = `${PREFS_PAGE}/امضا`;
  const s = (await bot.apiGet({ action: 'query', prop: 'revisions', titles: sig,
    rvprop: 'ids|timestamp', rvslots: 'main' })).query.pages[0];
  await bot.edit(sig, '‏~~~~~', 'به‌روزرسانی زمان آخرین اجرا',
    s.missing ? 0 : s.revisions[0].revid, s.missing ? '' : s.revisions[0].timestamp,
    { allowCreate: true });
}
