/**
 * The network-free half of وظیفهٔ ۱۳'s portal reports, in the shape `build-bundle.ts` can gate.
 *
 * A bundle that imported cleanly but whose table builder or exclusion list had been
 * mangled would look perfectly healthy right up until it published a page — the same
 * reasoning as وظیفهٔ ۱۳'s selfTest, which this mirrors.
 */
import {
  EXCLUDED_EN_PORTALS, buildCandidates, buildPopular, fa, monthWindow, num, when,
} from './portal-reports.js';
import { checkWikitext } from '../../lib/gates.js';

export function selfTest(): string {
  if (fa(1403) !== '۱۴۰۳') return `SELFTEST FAILED: digits → ${fa(1403)}`;
  if (!num(9).startsWith('data-sort-value="9"')) return 'SELFTEST FAILED: sort value missing';
  if (!when('20260530123000').includes('۲۰۲۶-۰۵-۳۰')) return `SELFTEST FAILED: date → ${when('20260530123000')}`;
  if (!when('').includes('ناشناخته')) return 'SELFTEST FAILED: empty timestamp must not crash';

  // The exclusion is by exact title; «sex» as a substring would take East/West Sussex.
  if (!EXCLUDED_EN_PORTALS.has('Erotica and pornography')) return 'SELFTEST FAILED: erotica not excluded';
  if (!EXCLUDED_EN_PORTALS.has('Nudity')) return 'SELFTEST FAILED: nudity not excluded';
  if (EXCLUDED_EN_PORTALS.has('East Sussex')) return 'SELFTEST FAILED: East Sussex must survive';
  if (EXCLUDED_EN_PORTALS.has('Sex work')) return 'SELFTEST FAILED: Sex work must survive';
  if (EXCLUDED_EN_PORTALS.size !== 2) return `SELFTEST FAILED: ${EXCLUDED_EN_PORTALS.size} exclusions, expected 2`;

  const w = monthWindow(new Date(Date.UTC(2026, 9, 11)));
  if (w.start !== '20251001' || w.end !== '20260930') return `SELFTEST FAILED: window ${w.start}..${w.end}`;

  const pop = buildPopular([{ portal: 'درگاه:فیلم', views: 165915, perMonth: 12763.5,
    links: 490, subpages: 34, bytes: 2878, revisions: 39, editors: 22, lastEdit: '20260911000000' }], w.label);
  if (!pop.includes('[[درگاه:فیلم]]')) return 'SELFTEST FAILED: portal link missing';
  if (!pop.includes('[[رده:گزارش‌های دیتابیس ویکی‌پدیا]]')) return 'SELFTEST FAILED: category missing';
  if ((pop.match(/\{\|/g) ?? []).length !== 1) return 'SELFTEST FAILED: expected exactly one table';

  const cand = buildCandidates(
    [{ portal: 'Video games', views: 77270, perMonth: 5944, faTopic: 'بازی ویدئویی',
       links: 300, subpages: 12, bytes: 4000, interwikis: 20, lastEdit: '20260911000000' }],
    [{ en: 'China', faPortal: 'درگاه:چین' }], w.label);
  if (!cand.includes('[[:en:Portal:Video games|Video games]]')) return 'SELFTEST FAILED: en link missing';
  if (!cand.includes('درگاه:بازی ویدئویی')) return 'SELFTEST FAILED: suggested fa name missing';
  if (!cand.includes('[[:en:Portal:China|Portal:China]] ← [[درگاه:چین]]')) return 'SELFTEST FAILED: unlinked section missing';

  // A topic with no fa article must render an em-dash, not «[[]]» or «درگاه:».
  const none = buildCandidates(
    [{ portal: 'Obscure', views: 1, perMonth: 0, faTopic: '', links: 0, subpages: 0,
       bytes: 0, interwikis: 0, lastEdit: '' }], [], w.label);
  if (none.includes('[[]]') || none.includes('درگاه:\n')) return 'SELFTEST FAILED: empty topic leaked brackets';
  if (!none.includes('مقالهٔ فارسی ندارد')) return 'SELFTEST FAILED: empty topic must say so';

  for (const [name, text] of [['popular', pop], ['candidates', cand], ['empty-topic', none]] as const) {
    const problems = checkWikitext('ویکی‌پدیا:گزارش دیتابیس/آزمایش', text)
      .filter(p => !p.includes('signature leak'));
    if (problems.length) return `SELFTEST FAILED: gate on ${name}: ${problems.join('; ')}`;
  }
  return 'SELFTEST OK: جدول‌ها، استثناها و دروازه';
}
