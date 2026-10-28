/** Network-free half of the autoconfirmed-moves report, for the bundler's gate. */
import {
  buildAcMoves, groupsAt, monthsWindow, parseRightsParams, phpUnserialize, safeComment, statusOf,
  type MoveRow,
} from './ac-moves-report.js';
import { checkWikitext } from '../../lib/gates.js';

export function selfTest(): string {
  // The window: four whole months and the current one, anchored on the 1st.
  const w = monthsWindow(new Date(Date.UTC(2026, 9, 28)));
  if (w.length !== 5) return `SELFTEST FAILED: ${w.length} months`;
  if (w[0].key !== '202610' || !w[0].partial) return `SELFTEST FAILED: current month ${w[0].key}`;
  if (w[4].start !== '20260601000000') return `SELFTEST FAILED: window starts ${w[4].start}`;
  if (w.slice(1).some(m => m.partial)) return 'SELFTEST FAILED: a past month marked partial';
  // Crossing a year boundary.
  const jan = monthsWindow(new Date(Date.UTC(2027, 0, 3)));
  if (jan[4].key !== '202609') return `SELFTEST FAILED: year rollover → ${jan[4].key}`;
  // Anchored: every day of a month gives the same start.
  if (monthsWindow(new Date(Date.UTC(2026, 9, 1)))[4].start !== monthsWindow(new Date(Date.UTC(2026, 9, 31)))[4].start) {
    return 'SELFTEST FAILED: window start moves within the month';
  }

  // PHP unserialize: string lengths are BYTES, and Persian is two bytes a letter.
  const p = phpUnserialize('a:3:{s:9:"4::target";s:15:"برج مراد";s:10:"5::noredir";s:1:"0";s:17:"associated_rev_id";i:44804965;}') as Record<string, unknown>;
  if (p['4::target'] !== 'برج مراد') return `SELFTEST FAILED: php target → ${p['4::target']}`;
  if (p.associated_rev_id !== 44804965) return 'SELFTEST FAILED: php integer';

  // Rights replay: real log_params shapes.
  const promote = parseRightsParams('20261026141627',
    'a:2:{s:12:"4::oldgroups";a:0:{}s:12:"5::newgroups";a:1:{i:0;s:17:"extendedconfirmed";}}')!;
  if (promote.groups[0]?.name !== 'extendedconfirmed') return 'SELFTEST FAILED: autopromote not parsed';
  // A move BEFORE the promotion stays in; one after drops out (Che1985).
  if (groupsAt('20260927115619', [promote], ['extendedconfirmed']).length) {
    return 'SELFTEST FAILED: a move made before promotion was attributed to the later group';
  }
  if (groupsAt('20261027000000', [promote], ['extendedconfirmed']).join() !== 'extendedconfirmed') {
    return 'SELFTEST FAILED: a move made after promotion was kept';
  }
  // A temporary group counts only until it expires.
  const temp = parseRightsParams('20261001000000',
    'a:4:{s:12:"4::oldgroups";a:0:{}s:12:"5::newgroups";a:1:{i:0;s:10:"rollbacker";}'
    + 's:11:"oldmetadata";a:0:{}s:11:"newmetadata";a:1:{i:0;a:1:{s:6:"expiry";s:14:"20261010000000";}}}')!;
  if (groupsAt('20261005000000', [temp], []).join() !== 'rollbacker') return 'SELFTEST FAILED: temp group ignored';
  if (groupsAt('20261020000000', [temp], []).length) return 'SELFTEST FAILED: expired group still counted';
  // `confirmed` is neutral; a group with no log trail (granted on meta) is assumed held.
  if (groupsAt('20261020000000', [], ['confirmed']).length) return 'SELFTEST FAILED: confirmed treated as experience';
  if (groupsAt('20261020000000', [], ['sysop']).join() !== 'sysop') return 'SELFTEST FAILED: unlogged group dropped';
  // An abolished group (fa's «uploader») leaves no log entry when it goes.
  const up = parseRightsParams('20140922173814', 'a:2:{s:12:"4::oldgroups";a:0:{}s:12:"5::newgroups";a:1:{i:0;s:8:"uploader";}}')!;
  if (groupsAt('20261020000000', [up], [], new Set(['sysop', 'confirmed'])).length) {
    return 'SELFTEST FAILED: an abolished group still counted';
  }
  // The pre-2010 plain format.
  if (parseRightsParams('20080101000000', 'uploader\nautopatrolled, rollbacker')?.groups.length !== 2) {
    return 'SELFTEST FAILED: legacy rights format';
  }

  // Status.
  if (statusOf('الف', 'ب', 'الف').kind !== 'reverted') return 'SELFTEST FAILED: revert not seen';
  if (statusOf('الف', 'ب', null).kind !== 'deleted') return 'SELFTEST FAILED: deletion not seen';
  if (statusOf('الف', 'ب', 'ج').kind !== 'moved-again') return 'SELFTEST FAILED: re-move not seen';

  // A hostile edit summary must not do anything to the page.
  const bad = safeComment('{{حذف سریع}} [[رده:خرابکاری]] ~~~~ <span>x</span> || a\n* b');
  if (/\{\{|\[\[رده:|~~~~|<span|\|\|/.test(bad)) return `SELFTEST FAILED: summary not neutralised → ${bad}`;
  if (!safeComment('[[وپ:نام رایج|نام رایج]]').includes('[[وپ:نام رایج|نام رایج]]')) {
    return 'SELFTEST FAILED: a summary link lost its target';
  }

  const rows: MoveRow[] = [
    { ts: '20261022235256', user: 'نمونه', blocked: true, from: 'برج میلاد', to: 'برج مراد',
      comment: '', status: { kind: 'reverted' } },
    { ts: '20261018233736', user: 'Sandboxerr', blocked: false, from: 'تامس سول', to: 'توماس سول',
      comment: '[[وپ:نام رایج|نام رایج]]', status: { kind: 'same' } },
    { ts: '20260801120000', user: 'نمونه', blocked: false, from: 'پیش‌نویس:الف', to: 'الف',
      comment: '', status: { kind: 'deleted' } },
    // Outside the window: must not appear.
    { ts: '20260501120000', user: 'کهنه', blocked: false, from: 'ک', to: 'ل', comment: '', status: { kind: 'same' } },
  ];
  const text = buildAcMoves(rows, w);
  if (!text.includes('== اکتبر ۲۰۲۶ ==') || !text.includes('== ژوئن ۲۰۲۶ ==')) return 'SELFTEST FAILED: month sections';
  if (text.includes('کهنه')) return 'SELFTEST FAILED: a row outside the window was printed';
  if (!text.includes('[[:پیش‌نویس:الف]]')) return 'SELFTEST FAILED: source link';
  if (!text.includes('(بسته‌شده)')) return 'SELFTEST FAILED: block marker';
  if (!text.includes('در این ماه موردی یافت نشد')) return 'SELFTEST FAILED: empty month must say so';
  if (!text.includes('data-sort-value="20261022235256"')) return 'SELFTEST FAILED: time not sortable';
  if (!text.includes('[[رده:گزارش‌های دیتابیس ویکی‌پدیا]]')) return 'SELFTEST FAILED: category missing';
  if ((text.match(/\[\[رده:/g) ?? []).length !== 1) return 'SELFTEST FAILED: a stray category';
  const problems = checkWikitext('ویکی‌پدیا:گزارش دیتابیس/آزمایش', text).filter(q => !q.includes('signature leak'));
  if (problems.length) return `SELFTEST FAILED: gate: ${problems.join('; ')}`;
  return 'SELFTEST OK: تغییرنام‌های کاربران تأییدشده خودکار';
}
