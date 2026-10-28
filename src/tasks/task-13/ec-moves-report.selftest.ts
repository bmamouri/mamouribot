/** Network-free half of the extendedconfirmed-moves report, for the bundler's gate. */
import { monthsWindow, type MoveRow } from './ac-moves-report.js';
import { buildEcMain, buildEcMonth, EC_MOVES_PAGE, isEcWithoutAutopatrol, monthSubpage } from './ec-moves-report.js';
import { checkWikitext } from '../../lib/gates.js';

export function selfTest(): string {
  const ap = new Set(['sysop', 'autopatrolled', 'eliminator', 'bot']);
  if (!isEcWithoutAutopatrol(['extendedconfirmed'], ap)) return 'SELFTEST FAILED: plain EC excluded';
  if (!isEcWithoutAutopatrol(['extendedconfirmed', 'rollbacker'], ap)) return 'SELFTEST FAILED: EC+rollbacker excluded';
  if (isEcWithoutAutopatrol(['autopatrolled', 'extendedconfirmed'], ap)) return 'SELFTEST FAILED: autopatrolled kept';
  if (isEcWithoutAutopatrol(['extendedconfirmed', 'sysop'], ap)) return 'SELFTEST FAILED: sysop kept';
  // Not EC yet: belongs to the OTHER report, never both.
  if (isEcWithoutAutopatrol([], ap)) return 'SELFTEST FAILED: autoconfirmed-only user counted as EC';

  const w = monthsWindow(new Date(Date.UTC(2026, 9, 28)));
  if (monthSubpage(w[0]) !== `${EC_MOVES_PAGE}/۲۰۲۶-۱۰`) return `SELFTEST FAILED: subpage ${monthSubpage(w[0])}`;
  const rows: MoveRow[] = [
    { ts: '20261020100000', user: 'الف', blocked: false, from: 'ا', to: 'ب', comment: '', status: { kind: 'reverted' } },
    { ts: '20261019100000', user: 'الف', blocked: false, from: 'پ', to: 'ت', comment: '', status: { kind: 'same' } },
    { ts: '20260901100000', user: 'ب', blocked: false, from: 'ث', to: 'ج', comment: '', status: { kind: 'deleted' } },
  ];
  const main = buildEcMain(rows, w);
  if (!main.includes(`[[${EC_MOVES_PAGE}/۲۰۲۶-۱۰|اکتبر ۲۰۲۶]]`)) return 'SELFTEST FAILED: month link';
  if (!main.includes('۵۰٪')) return 'SELFTEST FAILED: revert percentage';
  if (main.indexOf('[[کاربر:الف|') > main.indexOf('[[کاربر:ب|')) return 'SELFTEST FAILED: users not sorted by volume';
  if (main.includes('| data-sort-value="20261020100000"')) return 'SELFTEST FAILED: rows leaked onto the main page';
  if (!main.includes('[[رده:گزارش‌های دیتابیس ویکی‌پدیا]]')) return 'SELFTEST FAILED: category missing';
  if (!main.includes('[[ویکی‌پدیا:گزارش دیتابیس/تغییرنام‌های کاربران تأییدشده خودکار]]')) return 'SELFTEST FAILED: sibling link';
  const month = buildEcMonth(rows.filter(r => r.ts.startsWith('202610')), w[0]);
  if (month.includes('[[رده:')) return 'SELFTEST FAILED: a subpage must not be categorised';
  if ((month.match(/^\|-$/gm) ?? []).length !== 2) return 'SELFTEST FAILED: subpage row count';
  for (const [name, t] of [['main', main], ['month', month]] as const) {
    const problems = checkWikitext('ویکی‌پدیا:گزارش دیتابیس/آزمایش', t).filter(p => !p.includes('signature leak'));
    if (problems.length) return `SELFTEST FAILED: gate on ${name}: ${problems.join('; ')}`;
  }
  return 'SELFTEST OK: تغییرنام‌های کاربران تأییدشده پایدار بدون گشت خودکار';
}
