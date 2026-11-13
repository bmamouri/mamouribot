/** Network-free half of the missing-templates report, for the bundler's gate. */
import { checkWikitext } from '../../lib/gates.js';
import { buildWanted, coOccurrence, nearName, normName, wantedSql, type WantedRow } from './wanted-templates-report.js';

export function selfTest(): string {
  if (!/JOIN pagelinks/.test(wantedSql())) return 'SELFTEST FAILED: count must require the red link';
  const idx = new Map<string, string[]>();
  for (const t of ['یادکرد_وب', 'بزرگترین_شهرهای_آلاباما', 'Cite_Q', 'نمایش‌نامه‌نویس_ارمنی-خرد', 'خرد-فیزیک']) {
    (idx.get(normName(t)) ?? idx.set(normName(t), []).get(normName(t))!).push(t);
  }
  if (nearName('یاد_کرد_وب', idx) !== 'یادکرد_وب') return 'SELFTEST FAILED: spacing';
  if (nearName('بزرگ‌ترین_شهرهای_آلاباما', idx) !== 'بزرگترین_شهرهای_آلاباما') return 'SELFTEST FAILED: zwnj';
  if (nearName('CiteQ', idx) !== 'Cite_Q') return 'SELFTEST FAILED: latin';
  if (nearName('فیزیک-خرد', idx) !== 'خرد-فیزیک') return 'SELFTEST FAILED: stub swap';
  if (nearName('یادکرد_وب', idx) !== null) return 'SELFTEST FAILED: suggested itself';
  if (nearName('اخترشناسی_امواج_گرانشی', idx) !== null) return 'SELFTEST FAILED: invented a match';

  const df = new Map([['Nav', 5], ['Reflist', 900], ['Physics-stub', 5]]);
  const sets = [new Set(['Nav', 'Reflist', 'Physics-stub']), new Set(['Nav', 'Reflist']), new Set(['Nav', 'Reflist', 'Physics-stub'])];
  const c = coOccurrence(sets, df, 1000, false);
  if (c.length !== 1 || c[0].en !== 'Nav') return `SELFTEST FAILED: co-occurrence ${JSON.stringify(c)}`;
  if (coOccurrence(sets, df, 1000, true)[0]?.en === 'Nav') return 'SELFTEST FAILED: stub matched a navbox';
  if (coOccurrence(sets.slice(0, 2), df, 1000, false).length) return 'SELFTEST FAILED: guessed from two articles';

  const rows: WantedRow[] = [
    { title: 'RegioneIT_(unlinked)', articles: 459, callers: [{ title: 'استان_ونیز', articles: 44 }],
      hints: [{ kind: 'en-same', en: 'RegioneIT_(unlinked)' }] },
    { title: 'یاد_کرد_وب', articles: 3, callers: [], hints: [{ kind: 'near', fa: 'یادکرد_وب' }], deleted: '20240509101010' },
    { title: 'کوگو-خرد', articles: 2, callers: [], hints: [{ kind: 'co', en: 'Japan-royal-stub', support: 9, of: 10 }] },
  ];
  const page = buildWanted(rows);
  if ((page.match(/\{\{نارنجی\|حدس\}\}/g) ?? []).length !== 3) return 'SELFTEST FAILED: guesses must be marked (2 rows + legend)';
  if (page.match(/^\| data-sort-value="459"/m) === null) return 'SELFTEST FAILED: count cell';
  if (!page.includes('[[الگو:استان ونیز|استان ونیز]] (۴۴)')) return 'SELFTEST FAILED: caller cell';
  if (!page.includes('حذف‌شده در ۲۰۲۴-۰۵-۰۹')) return 'SELFTEST FAILED: deletion';
  if (!page.includes('[[:en:Template:RegioneIT (unlinked)|')) return 'SELFTEST FAILED: en link';
  const problems = checkWikitext('ویکی‌پدیا:گزارش دیتابیس/آزمایش', page).filter(p => !p.includes('signature leak'));
  if (problems.length) return `SELFTEST FAILED: gate: ${problems.join('; ')}`;
  return 'SELFTEST OK: الگوهای ناموجود پرکاربرد در مقاله‌ها';
}
