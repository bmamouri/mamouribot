/** Network-free half of the preferences report, for the bundler's gate. */
import { buildPrefs, PROPERTIES } from './prefs-report.js';
import { checkWikitext } from '../../lib/gates.js';

export function selfTest(): string {
  const rows = [
    { property: 'gender', users: 29507, edited: 18009, ge100: 2297, ge1000: 627 },
    { property: 'nickname', users: 14485, edited: 10419, ge100: 2066, ge1000: 741 },
    // A property the replica might start exposing: it must not reach the table
    // unexplained, because a bare property name tells a reader nothing.
    { property: 'someNewPref', users: 5, edited: 1, ge100: 0, ge1000: 0 },
  ];
  const text = buildPrefs(rows, { accounts: 1573226, edited: 536391 });
  if (text.includes('someNewPref')) return 'SELFTEST FAILED: unexplained property reached the table';
  if (!text.includes('<code dir="ltr">gender</code>')) return 'SELFTEST FAILED: property column missing';
  if (!text.includes(PROPERTIES.nickname)) return 'SELFTEST FAILED: meaning column missing';
  if (!text.includes('{{formatnum:29507}}')) return 'SELFTEST FAILED: numbers not formatted';
  if (!text.includes('data-sort-value="29507"')) return 'SELFTEST FAILED: numbers not sortable';
  // The gender section belongs to another operator's bot and must stay a transclusion.
  if (!text.includes('{{/جنسیت}}')) return 'SELFTEST FAILED: the gender subpage must stay transcluded';
  // The timezone section must explain itself rather than render an empty table again.
  if (!text.includes('== منطقه زمانی ==')) return 'SELFTEST FAILED: timezone section missing';
  if (text.includes('!اختلاف ساعت')) return 'SELFTEST FAILED: the empty timezone table is back';
  if (!text.includes('[[رده:گزارش‌های دیتابیس ویکی‌پدیا]]')) return 'SELFTEST FAILED: category missing';
  const problems = checkWikitext('ویکی‌پدیا:گزارش دیتابیس/آزمایش', text)
    .filter(p => !p.includes('signature leak'));
  if (problems.length) return `SELFTEST FAILED: gate: ${problems.join('; ')}`;
  return 'SELFTEST OK: جدول ترجیحات';
}
