/**
 * وظیفهٔ ۱۳ — ویکی‌پدیا:گزارش دیتابیس/تغییرنام‌های کاربران تأییدشده پایدار بدون گشت خودکار
 *
 * The companion of `ac-moves-report.ts`, asked for by Sunfyre after it went live: every
 * move into or out of ns 0 whose author was extendedconfirmed at the time but held no
 * group carrying the `autopatrol` right. extendedconfirmed is granted on edit count
 * alone; autopatrolled is granted by an admin who looked at the work. So this is "many
 * edits, nobody has vouched for them yet" — the population the نظرخواهی argued about
 * («بیشترین تغییرنام‌های اشتباه … توسط کاربرانی صورت می‌گیرد که پایدار هستند»).
 *
 * Same engine as the first report: the same window, the same group replay from the
 * rights log, the same cells. Only the predicate differs, and the layout, because the
 * volume is six times larger — measured ۲۸ اکتبر ۲۰۲۶ at ~2,900 rows over five months,
 * two thirds of them from two users, against 451 for the autoconfirmed report. One page
 * would be over a megabyte. So the main page carries the monthly totals and a per-user
 * summary, and each month's rows go on its own subpage, which stops changing once the
 * month is over except for its «وضعیت کنونی» column.
 *
 * Which groups carry `autopatrol` is read from `siprop=usergroups` at run time (today:
 * sysop, autopatrolled, eliminator, bot), not hard-coded, so a reconfiguration on fa is
 * followed without a code change.
 */
import {
  commonNotes, fa, movesTable, STATUS_HEADER, statusCounts, userCell, countKind,
  type Month, type MoveRow,
} from './ac-moves-report.js';

export const EC_MOVES_PAGE = 'ویکی‌پدیا:گزارش دیتابیس/تغییرنام‌های کاربران تأییدشده پایدار بدون گشت خودکار';

/** `/۲۰۲۶-۱۰` — Persian digits, as every other subpage title on fa. */
export const monthSubpage = (m: Month) => `${EC_MOVES_PAGE}/${fa(`${m.key.slice(0, 4)}-${m.key.slice(4)}`)}`;

/** The predicate: extendedconfirmed at the time, and no autopatrol right. */
export function isEcWithoutAutopatrol(heldAtMove: string[], autopatrolGroups: Set<string>): boolean {
  return heldAtMove.includes('extendedconfirmed') && !heldAtMove.some(g => autopatrolGroups.has(g));
}

const pct = (part: number, whole: number) => (whole ? `${fa(Math.round((100 * part) / whole))}٪` : '۰٪');
const num = (v: number) => `data-sort-value="${v}" | ${fa(v)}`;

export function buildEcMain(rows: MoveRow[], months: Month[]): string {
  const byMonth = new Map(months.map(m => [m.key, [] as MoveRow[]]));
  for (const r of rows) byMonth.get(r.ts.slice(0, 6))?.push(r);

  const out = [
    'این صفحه تغییرنام‌هایی را فهرست می‌کند که به فضای نام اصلی (مقاله‌ها) وارد یا از آن خارج شده‌اند و '
    + 'انجام‌دهنده‌شان در زمان تغییرنام عضو [[ویکی‌پدیا:کاربران تأییدشدهٔ پایدار|کاربران تأییدشدهٔ پایدار]] بوده '
    + 'ولی [[ویکی‌پدیا:گشت خودکار|گشت خودکار]] نبوده است (و هیچ گروه دیگری که اختیار گشت خودکار دارد، '
    + 'مانند مدیران، را هم نداشته است). تغییرنام‌های کاربرانی که فقط تأییدشدهٔ خودکار هستند در '
    + '[[ویکی‌پدیا:گزارش دیتابیس/تغییرنام‌های کاربران تأییدشده خودکار]] آمده است.',
    '',
    ...commonNotes(months),
    '* فهرست کامل هر ماه در زیرصفحهٔ همان ماه است و این صفحه تنها خلاصه را نشان می‌دهد.',
    '',
    'آخرین به‌روزرسانی: ~~~~~',
    '',
    '== خلاصهٔ ماهانه ==',
    '{| class="wikitable"',
    `! ماه !! تغییرنام !! کاربر !! ${STATUS_HEADER}`,
  ];
  for (const m of months) {
    const rs = byMonth.get(m.key)!;
    out.push('|-',
      `| [[${monthSubpage(m)}|${m.label}]]${m.partial ? ' (تاکنون)' : ''}`,
      `| ${fa(rs.length)}`,
      `| ${fa(new Set(rs.map(r => r.user)).size)}`,
      ...statusCounts(rs));
  }
  out.push('|}');

  // Per user, over the whole window. A reviewer's first question on a list this long is
  // "whose moves are these", and two users account for most of it.
  const byUser = new Map<string, MoveRow[]>();
  for (const r of rows) (byUser.get(r.user) ?? byUser.set(r.user, []).get(r.user)!).push(r);
  const users = [...byUser].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], 'fa'));
  out.push('', '== بر پایهٔ کاربر ==',
    'شمار تغییرنام‌های هر کاربر در کل بازه. «برگردانده‌شده» یعنی صفحه اکنون دوباره در عنوان پیشین خود است.',
    '{| class="wikitable sortable"',
    '! کاربر !! تغییرنام !! برگردانده‌شده !! درصد برگردانده‌شده !! حذف‌شده !! ماه‌ها');
  for (const [user, rs] of users) {
    const reverted = countKind(rs, 'reverted');
    const inMonths = months.filter(m => rs.some(r => r.ts.startsWith(m.key)));
    out.push('|-',
      `| ${userCell(user, rs[0].blocked)}`,
      `| ${num(rs.length)}`,
      `| ${num(reverted)}`,
      `| data-sort-value="${rs.length ? reverted / rs.length : 0}" | ${pct(reverted, rs.length)}`,
      `| ${num(countKind(rs, 'deleted'))}`,
      `| ${inMonths.map(m => `[[${monthSubpage(m)}|${m.label}]]`).join('، ')}`);
  }
  out.push('|}', '', '[[رده:گزارش‌های دیتابیس ویکی‌پدیا]]');
  return out.join('\n');
}

/** A month's subpage: every row, no category (the main page carries it). */
export function buildEcMonth(rows: MoveRow[], month: Month): string {
  return [
    `تغییرنام‌های ${month.label}${month.partial ? ' (تاکنون)' : ''} برای `
    + `[[${EC_MOVES_PAGE}|گزارش تغییرنام‌های کاربران تأییدشدهٔ پایدار بدون گشت خودکار]]. `
    + `${fa(rows.length)} تغییرنام از ${fa(new Set(rows.map(r => r.user)).size)} کاربر.`,
    '',
    'آخرین به‌روزرسانی: ~~~~~',
    '',
    ...movesTable(rows),
  ].join('\n');
}
