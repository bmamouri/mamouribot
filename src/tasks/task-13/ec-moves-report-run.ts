/** The networked half of the extendedconfirmed-moves report. See `ec-moves-report.ts`. */
import { Bot } from '../../core.js';
import { collectMoves, publishReport, requireRows } from './ac-moves-report-run.js';
import { buildEcMain, buildEcMonth, EC_MOVES_PAGE, isEcWithoutAutopatrol, monthSubpage } from './ec-moves-report.js';
import type { MoveRow } from './ac-moves-report.js';

const pause = () => new Promise(r => setTimeout(r, 5000));

export async function runEcMovesReport(argv: string[], data?: Awaited<ReturnType<typeof collectMoves>>) {
  const live = argv.includes('--live');
  const bot = new Bot({ dryRun: !live, delayMs: 0, limit: 0, maxlag: 5, flagEdits: false });
  const { months, classified, autopatrolGroups } = data ?? await collectMoves(bot);
  if (!autopatrolGroups.has('autopatrolled')) {
    throw new Error('گروه autopatrolled اختیار autopatrol ندارد؛ پیکربندی دگرگون شده و گزارش بی‌معنا می‌شود');
  }
  // Global groups (steward, global-sysop, …) take a user out, as in the first report.
  const rows = classified.filter(c => !c.global && isEcWithoutAutopatrol(c.held, autopatrolGroups)).map(c => c.row);
  console.log(`تأییدشدهٔ پایدار بدون گشت خودکار: ${rows.length} ردیف از ${classified.length}`);
  requireRows(rows.length, 100);

  const blank = (rs: MoveRow[]) => rs.map(r => ({ ...r, comment: '' }));
  // The month subpages first, so the main page never links a subpage that is not there yet.
  for (const m of months) {
    const rs = rows.filter(r => r.ts.startsWith(m.key));
    await publishReport(bot, monthSubpage(m), buildEcMonth(rs, m), buildEcMonth(blank(rs), m),
      'به‌روزرسانی فهرست ماهانهٔ تغییرنام‌های کاربران تأییدشدهٔ پایدار بدون گشت خودکار', live,
      { signature: false, quiet: true });
    if (live) await pause();
  }
  await publishReport(bot, EC_MOVES_PAGE, buildEcMain(rows, months), buildEcMain(blank(rows), months),
    'به‌روزرسانی گزارش تغییرنام‌های کاربران تأییدشدهٔ پایدار بدون گشت خودکار', live);
}
