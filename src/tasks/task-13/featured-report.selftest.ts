/**
 * The network-free half of the featured-content report, in the shape the bundler gates.
 *
 * The parser is the risky part: its input is three hand-maintained pages with three
 * different layouts, and the failure it is built against — a user's entries continuing
 * over following rows — produces a plausible-looking wrong number rather than an error.
 */
import { buildFeatured, parseStars, rank } from './featured-report.js';
import { checkWikitext } from '../../lib/gates.js';

export function selfTest(): string {
  // The real shape of the good-article page: twenty per row, then a continuation row
  // whose first cell is empty. A row-based split truncates this user to 2 and looks fine.
  const wrapped = [
    '|-', '|[[کاربر:الف|الف]]', '|[[یک|★]]', '|[[دو|★]]',
    '|-', '|', '|[[سه|★]]', '|[[چهار|★]]', '|[[پنج|☆]]',
    '|-', '|[[کاربر:ب|ب]]', '|[[شش|★]]',
  ].join('\n');
  const got = parseStars(wrapped);
  if (got.get('الف') !== 4) return `SELFTEST FAILED: continuation rows lost, الف → ${got.get('الف')}`;
  if (got.get('ب') !== 1) return `SELFTEST FAILED: next user picked up the previous one's rows, ب → ${got.get('ب')}`;

  // ☆ is demoted content and must not count.
  if (parseStars('|[[کاربر:ج|ج]]\n|[[x|☆]]\n|[[y|☆]]').get('ج') !== 0) {
    return 'SELFTEST FAILED: hollow stars counted';
  }
  // A user link in the prose above the table must not open a phantom row.
  if (parseStars('سلام [[کاربر:د]] و دیگران\n|[[کاربر:ه|ه]]\n|[[z|★]]').get('د') !== undefined) {
    return 'SELFTEST FAILED: inline user mention treated as a row';
  }

  const rows = rank({
    fa: new Map([['الف', 3], ['ب', 1]]),
    ga: new Map([['الف', 2], ['ج', 5]]),
    fl: new Map([['ب', 4]]),
  });
  if (rows.length !== 3) return `SELFTEST FAILED: ${rows.length} ranked, expected 3`;
  if (rows[0].user !== 'الف' || rows[0].score !== 5) return `SELFTEST FAILED: top is ${rows[0].user}/${rows[0].score}`;
  // ب and ج both score 5; the tie breaks on featured articles, which ب has and ج does not.
  if (rows[1].user !== 'ب') return `SELFTEST FAILED: tie broken wrong, ${rows[1].user} before ${rows[2].user}`;
  if (rank({ fa: new Map([['ز', 0]]), ga: new Map(), fl: new Map() }).length !== 0) {
    return 'SELFTEST FAILED: a zero-score user must not be listed';
  }

  const text = buildFeatured(rows);
  if (!text.includes('[[کاربر:الف|الف]]')) return 'SELFTEST FAILED: user link missing';
  if (!text.includes('[[رده:گزارش‌های دیتابیس ویکی‌پدیا]]')) return 'SELFTEST FAILED: category missing';
  if (!text.includes('data-sort-value="5"')) return 'SELFTEST FAILED: numbers not sortable';
  const problems = checkWikitext('ویکی‌پدیا:گزارش دیتابیس/آزمایش', text)
    .filter(p => !p.includes('signature leak'));
  if (problems.length) return `SELFTEST FAILED: gate: ${problems.join('; ')}`;
  return 'SELFTEST OK: شمارش ستاره‌ها و جدول برگزیده‌ها';
}
