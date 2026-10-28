/** The networked half of the autoconfirmed-moves report. See `ac-moves-report.ts`. */
import { Bot } from '../../core.js';
import { checkWikitext } from '../../lib/gates.js';
import { queryRows } from '../../lib/replica.js';
import {
  AC_MOVES_PAGE, NEUTRAL_GLOBAL_GROUPS, buildAcMoves, currentGroupsSql, globalGroupsSql,
  groupsAt, monthsWindow, movesSql, parseRightsParams, phpUnserialize, rightsSql, statusOf,
  type GroupChange, type MoveRow,
} from './ac-moves-report.js';

const chunk = <T>(a: T[], n: number) =>
  Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

/** Namespace number → local prefix, and every name or alias → number. */
async function namespaces(bot: Bot) {
  const d = await bot.apiGet({ action: 'query', meta: 'siteinfo', siprop: 'namespaces|namespacealiases|usergroups' });
  const groups = new Set<string>((d.query.usergroups as any[]).map(g => g.name));
  const prefix = new Map<number, string>();
  const byName = new Map<string, number>();
  for (const ns of Object.values(d.query.namespaces) as any[]) {
    prefix.set(ns.id, ns.name);
    for (const n of [ns.name, ns.canonical]) if (n) byName.set(n.toLowerCase(), ns.id);
  }
  for (const a of d.query.namespacealiases as any[]) byName.set(a.alias.toLowerCase(), a.id);
  return {
    groups,
    full: (ns: number, title: string) => {
      const t = title.replace(/_/g, ' ');
      return ns === 0 ? t : `${prefix.get(ns)}:${t}`;
    },
    nsOf: (full: string) => {
      const m = /^([^:]+):/.exec(full);
      return m && byName.has(m[1].trim().replace(/_/g, ' ').toLowerCase())
        ? byName.get(m[1].trim().replace(/_/g, ' ').toLowerCase())! : 0;
    },
  };
}

export async function runAcMovesReport(argv: string[]) {
  const live = argv.includes('--live');
  const bot = new Bot({ dryRun: !live, delayMs: 0, limit: 0, maxlag: 5, flagEdits: false });
  const months = monthsWindow();
  const start = months[months.length - 1].start;
  console.log(`بازه: از ${start.slice(0, 8)} (${months.map(m => m.key).join('، ')})`);
  const ns = await namespaces(bot);

  // 1. Every move touching ns 0, by a non-bot account.
  const raw = await queryRows(movesSql(start), { wiki: 'fa' });
  const moves = raw.map(r => {
    const p = phpUnserialize(r.log_params) as Record<string, unknown>;
    return {
      ts: r.log_timestamp, user: r.actor_name, userId: r.actor_user,
      from: ns.full(Number(r.log_namespace), r.log_title),
      fromNs: Number(r.log_namespace),
      to: String(p['4::target'] ?? ''),
      comment: r.comment_text,
      current: r.cur_ns === '' ? null : ns.full(Number(r.cur_ns), r.cur_title),
    };
  }).filter(m => m.to && (m.fromNs === 0 || ns.nsOf(m.to) === 0));
  console.log(`${raw.length} تغییرنام خام، ${moves.length} با مقاله سروکار دارند`);

  // 2. Who those users are today, and what fa's rights log says they were.
  const userIds = [...new Set(moves.map(m => m.userId))];
  const users = new Map<string, { name: string; groups: string[]; blocked: boolean }>();
  for (const ids of chunk(userIds, 300)) {
    for (const r of await queryRows(currentGroupsSql(ids), { wiki: 'fa' })) {
      users.set(r.user_id, {
        name: r.user_name, groups: r.grps ? r.grps.split(',') : [], blocked: Number(r.blocked) > 0,
      });
    }
  }
  const names = [...new Set([...users.values()].map(u => u.name))];
  const history = new Map<string, GroupChange[]>();
  for (const batch of chunk(names, 300)) {
    for (const r of await queryRows(rightsSql(batch), { wiki: 'fa', allowEmpty: true })) {
      const c = parseRightsParams(r.log_timestamp, r.log_params);
      if (!c) continue;
      const name = r.log_title.replace(/_/g, ' ');
      if (!history.has(name)) history.set(name, []);
      history.get(name)!.push(c);
    }
  }
  const globalHolders = new Set<string>();
  for (const batch of chunk(names, 300)) {
    for (const r of await queryRows(globalGroupsSql(batch), { wiki: 'centralauth', allowEmpty: true })) {
      if (!NEUTRAL_GLOBAL_GROUPS.has(r.gug_group)) globalHolders.add(r.gu_name);
    }
  }

  // 3. Keep a move only if its author had nothing beyond (auto)confirmed AT THAT MOMENT.
  const rows: MoveRow[] = [];
  let dropped = 0;
  for (const m of moves) {
    const u = users.get(m.userId);
    if (!u) { dropped++; continue; }
    const held = groupsAt(m.ts, history.get(u.name) ?? [], u.groups, ns.groups);
    if (held.length || globalHolders.has(u.name)) { dropped++; continue; }
    rows.push({
      ts: m.ts, user: u.name, blocked: u.blocked, from: m.from, to: m.to, comment: m.comment,
      status: statusOf(m.from, m.to, m.current),
    });
  }
  console.log(`${rows.length} ردیف؛ ${dropped} تغییرنام کاربران دارای دسترسی بیشتر کنار گذاشته شد`);
  // A positive control: the window spans five months on a wiki where such moves run at
  // several a day. Zero means a query or the group replay broke, not a quiet wiki.
  if (rows.length < 20) throw new Error(`تنها ${rows.length} ردیف؛ احتمالاً پرسمان یا بازسازی گروه‌ها شکسته است`);

  const text = buildAcMoves(rows, months);
  // Gated with the edit summaries BLANKED. A summary is another editor's words quoted
  // verbatim (the first live run tripped the em-dash rule on one); the style rules are
  // for prose this bot writes, and rewriting a quotation to pass them would misquote.
  // What a summary could DO to the page is handled by safeComment(), which the
  // selftest checks against a hostile one.
  const gated = buildAcMoves(rows.map(r => ({ ...r, comment: '' })), months);
  const problems = checkWikitext(AC_MOVES_PAGE, gated).filter(p => !p.includes('signature leak'));
  if (problems.length) throw new Error('GATE FAILED:\n  - ' + problems.join('\n  - '));
  if (!live) { console.log(`\n${text}`); return; }

  const cur = await bot.apiGet({ action: 'query', prop: 'revisions', titles: AC_MOVES_PAGE,
    rvprop: 'content|ids|timestamp', rvslots: 'main' });
  const p = cur.query.pages[0];
  await bot.edit(AC_MOVES_PAGE, text, 'به‌روزرسانی گزارش تغییرنام‌های کاربران تأییدشدهٔ خودکار',
    p.missing ? 0 : p.revisions[0].revid, p.missing ? '' : p.revisions[0].timestamp,
    { allowCreate: true });
  console.log(`منتشر شد: ${AC_MOVES_PAGE}`);
  const sig = `${AC_MOVES_PAGE}/امضا`;
  const s = (await bot.apiGet({ action: 'query', prop: 'revisions', titles: sig,
    rvprop: 'ids|timestamp', rvslots: 'main' })).query.pages[0];
  await bot.edit(sig, '‏~~~~~', 'به‌روزرسانی زمان آخرین اجرا',
    s.missing ? 0 : s.revisions[0].revid, s.missing ? '' : s.revisions[0].timestamp,
    { allowCreate: true });
}
