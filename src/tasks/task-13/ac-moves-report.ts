/**
 * وظیفهٔ ۱۳ — ویکی‌پدیا:گزارش دیتابیس/تغییرنام‌های کاربران تأییدشده خودکار
 *
 * Every page move into or out of the article namespace made by a user whose only
 * move right, AT THE TIME OF THE MOVE, came from being (auto)confirmed. Asked for on
 * قهوه‌خانه/فنی («درخواست کوئری», Sunfyre, ۲۷ اکتبر ۲۰۲۶) after a نظرخواهی about raising
 * the move threshold looked unlikely to reach consensus: review the moves instead of
 * restricting them. Huji's Quarry query (110612) was the starting point.
 *
 * THREE WAYS THE OBVIOUS QUERY IS WRONG, each measured on fawiki_p ۲۸ اکتبر ۲۰۲۶:
 *
 *   1. CURRENT groups are not the groups the mover had. `LEFT JOIN user_groups … IS
 *      NULL` asks who is group-less TODAY. 19 accounts that moved an article as
 *      autoconfirmed-only since June were promoted to extendedconfirmed afterwards
 *      (Che1985: first move ۲۷ سپتامبر, promoted ۲۶ اکتبر), so the plain query
 *      silently drops a row the day its author gets promoted — on a report whose
 *      whole point is that rows stay put for five months. Groups are therefore
 *      replayed from the rights log (`rights` and `autopromote` entries) up to each
 *      move's timestamp, honouring temporary-group expiries.
 *   2. `confirmed` is not a sign of experience. It is handed out by hand to new
 *      accounts and grants exactly the move right autoconfirmed does, so a user whose
 *      only explicit group is `confirmed` belongs IN the report (operator's decision).
 *      `NEUTRAL_GROUPS` lists the few groups treated the same way.
 *   3. A group granted on meta by a steward leaves no entry in fa's rights log. If a
 *      user holds a group today that the replayed log cannot account for, they are
 *      assumed to have held it all along — the conservative direction, because a row
 *      wrongly KEPT names an experienced editor on a review list.
 *
 * Global groups (steward, global-sysop, global-rollbacker, …) come from
 * centralauth_p and are read as of today: centralauth keeps no history the replica
 * exposes. A user who gained one after moving is dropped; that is rare enough, and
 * points the safe way, to accept.
 *
 * THE WINDOW IS ANCHORED ON CALENDAR MONTHS, not "the last N days" (operator's
 * instruction): four whole months plus the current partial one. A rolling window
 * drops its first day every day, so a reviewer who worked through the list on Monday
 * finds different rows at the top on Tuesday. Anchored, a month's section stays
 * identical from the day it closes until it ages out — except for the «وضعیت کنونی»
 * column, which is the point of re-running it daily.
 */
export const AC_MOVES_PAGE = 'ویکی‌پدیا:گزارش دیتابیس/تغییرنام‌های کاربران تأییدشده خودکار';
export const MONTHS_SHOWN = 5;

/**
 * Groups that do not make an account more than an (auto)confirmed mover. Everything
 * else — extendedconfirmed, autopatrolled, rollbacker, patroller, sysop, … — takes the
 * user out of the report.
 */
export const NEUTRAL_GROUPS = new Set(['confirmed', 'ipblock-exempt', 'no-ipinfo', 'event-organizer']);
/** Global groups that, likewise, say nothing about experience on this wiki. */
export const NEUTRAL_GLOBAL_GROUPS = new Set([
  'global-ipblock-exempt', 'captcha-exempt', 'email-block-override', 'psi-volunteer-testers',
]);

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
export const fa = (s: number | string) => String(s).replace(/\d/g, d => FA_DIGITS[+d]);
const MONTH_NAMES = ['ژانویه', 'فوریه', 'مارس', 'آوریل', 'مه', 'ژوئن', 'ژوئیه', 'اوت',
  'سپتامبر', 'اکتبر', 'نوامبر', 'دسامبر'];

export interface Month { key: string; label: string; start: string; partial: boolean }

/** The anchored window: the current month and the `MONTHS_SHOWN - 1` before it, newest first. */
export function monthsWindow(now = new Date(), count = MONTHS_SHOWN): Month[] {
  const out: Month[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const y = d.getUTCFullYear(), m = d.getUTCMonth();
    const key = `${y}${String(m + 1).padStart(2, '0')}`;
    out.push({ key, label: `${MONTH_NAMES[m]} ${fa(y)}`, start: `${key}01000000`, partial: i === 0 });
  }
  return out;
}

// ---------------------------------------------------------------------------
// PHP unserialize — log_params is PHP-serialized, and its arrays are what carry the
// group lists and expiries. A regex over the string confuses `oldgroups` with
// `newgroups` the moment one of them is empty, so it is parsed properly.
// ---------------------------------------------------------------------------
export type Php = null | boolean | number | string | Php[] | { [k: string]: Php };

export function phpUnserialize(s: string): Php {
  const bytes = Buffer.from(s, 'utf8');
  let i = 0;
  const readUntil = (ch: string) => {
    const j = bytes.indexOf(ch, i);
    if (j < 0) throw new Error(`php: expected «${ch}» after ${i}`);
    const v = bytes.subarray(i, j).toString('utf8');
    i = j + 1;
    return v;
  };
  const value = (): Php => {
    const t = String.fromCharCode(bytes[i]);
    i += 2; // type and ':' (or ';' for N)
    switch (t) {
      case 'N': return null;
      case 'b': return readUntil(';') === '1';
      case 'i': case 'd': return Number(readUntil(';'));
      case 's': {
        // Length is in BYTES, which is why this walks a Buffer and not the string.
        const len = Number(readUntil(':'));
        const v = bytes.subarray(i + 1, i + 1 + len).toString('utf8');
        i += len + 3; // opening quote, closing quote, ';'
        return v;
      }
      case 'a': {
        const n = Number(readUntil(':'));
        i += 1; // '{'
        const entries: [string | number, Php][] = [];
        for (let k = 0; k < n; k++) entries.push([value() as string | number, value()]);
        i += 1; // '}'
        const isList = entries.every(([k], idx) => k === idx);
        return isList ? entries.map(([, v]) => v) : Object.fromEntries(entries.map(([k, v]) => [String(k), v]));
      }
      default: throw new Error(`php: unsupported type «${t}» at ${i - 2}`);
    }
  };
  return value();
}

/** One rights-log entry, reduced to the group state it leaves behind. */
export interface GroupChange { ts: string; groups: { name: string; expiry: string | null }[] }

/**
 * `rights` / `autopromote` log_params → the groups the user holds afterwards.
 * Returns null for an entry that says nothing about the resulting state.
 *
 * Two formats exist: the PHP-serialized one (2010 on), and an older plain
 * "old\nnew" pair of comma lists that carries no expiry.
 */
export function parseRightsParams(ts: string, params: string): GroupChange | null {
  if (params.startsWith('a:')) {
    const p = phpUnserialize(params) as Record<string, Php>;
    const names = p['5::newgroups'];
    if (!Array.isArray(names)) return null;
    const meta = Array.isArray(p.newmetadata) ? p.newmetadata : [];
    return {
      ts,
      groups: names.map((n, k) => {
        const m = meta[k] as Record<string, Php> | undefined;
        const e = m && typeof m === 'object' ? m.expiry : null;
        return { name: String(n), expiry: typeof e === 'string' && e ? e : null };
      }).filter(g => g.name !== ''),
    };
  }
  const lines = params.split('\n');
  if (lines.length < 2) return null;
  return {
    ts,
    groups: lines[1].split(',').map(s => s.trim()).filter(Boolean).map(name => ({ name, expiry: null })),
  };
}

/**
 * The non-neutral groups held at `ts`, replaying `changes` (any order).
 *
 * `defined` is the wiki's group list today. A group that no longer exists was abolished
 * by a configuration change, which writes nothing to the rights log: fa's «uploader»
 * group went that way, and without this every editor who once held it replays as an
 * uploader for ever and vanishes from the report.
 */
export function groupsAt(
  ts: string, changes: GroupChange[], currentGroups: string[], defined?: Set<string>,
): string[] {
  const before = changes.filter(c => c.ts <= ts).sort((a, b) => a.ts.localeCompare(b.ts));
  const held = new Set<string>();
  const last = before[before.length - 1];
  if (last) for (const g of last.groups) if (!g.expiry || g.expiry > ts) held.add(g.name);
  // A group held today that the log never mentions was granted somewhere fa does not
  // log (a steward on meta). Assume it was always held — see the header, point 3.
  const everLogged = new Set(changes.flatMap(c => c.groups.map(g => g.name)));
  for (const g of currentGroups) if (!everLogged.has(g)) held.add(g);
  return [...held].filter(g => !NEUTRAL_GROUPS.has(g) && (!defined || defined.has(g))).sort();
}

// ---------------------------------------------------------------------------
// SQL. Kept dumb, as everywhere in this task: it narrows by time and type, and the
// rules that decide whether a row ships are in TypeScript.
// ---------------------------------------------------------------------------
export const sqlString = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

/**
 * Every visible move in the window, except those by accounts that are bots today.
 * `log_deleted = 0` because a hidden performer, title or summary is not ours to print.
 * ns 0 is every article moved out; 2 and 118 (user, draft) are where articles are
 * moved IN from — whether the target really is ns 0 is decided in TypeScript from the
 * target's prefix.
 */
export function movesSql(start: string): string {
  return `
SELECT l.log_id, l.log_timestamp, l.log_namespace, l.log_title, l.log_params, l.log_page,
       a.actor_name, a.actor_user, c.comment_text,
       p.page_namespace AS cur_ns, p.page_title AS cur_title
FROM logging l
JOIN actor a ON a.actor_id = l.log_actor
JOIN comment c ON c.comment_id = l.log_comment_id
LEFT JOIN page p ON p.page_id = l.log_page
WHERE l.log_type = 'move' AND l.log_timestamp >= '${start}' AND l.log_deleted = 0
  AND l.log_namespace IN (0, 2, 118)
  AND a.actor_user IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM user_groups b WHERE b.ug_user = a.actor_user AND b.ug_group = 'bot')
ORDER BY l.log_timestamp DESC`;
}

export function rightsSql(userNames: string[]): string {
  const list = userNames.map(u => sqlString(u.replace(/ /g, '_'))).join(',');
  return `
SELECT log_title, log_timestamp, log_params FROM logging
WHERE log_type = 'rights' AND log_action IN ('rights', 'autopromote')
  AND log_namespace = 2 AND log_title IN (${list})`;
}

export function currentGroupsSql(userIds: string[]): string {
  return `
SELECT u.user_id, u.user_name, u.user_editcount, u.user_registration,
       (SELECT GROUP_CONCAT(ug_group) FROM user_groups WHERE ug_user = u.user_id) AS grps,
       (SELECT COUNT(*) FROM block_target bt JOIN block bl ON bl.bl_target = bt.bt_id
         WHERE bt.bt_user = u.user_id AND bl.bl_sitewide = 1) AS blocked
FROM user u WHERE u.user_id IN (${userIds.join(',')})`;
}

export function globalGroupsSql(userNames: string[]): string {
  return `
SELECT gu_name, gug_group FROM globaluser JOIN global_user_groups ON gug_user = gu_id
WHERE gu_name IN (${userNames.map(sqlString).join(',')})
  AND (gug_expiry IS NULL OR gug_expiry > DATE_FORMAT(UTC_TIMESTAMP(), '%Y%m%d%H%i%S'))`;
}

// ---------------------------------------------------------------------------
// Rows and the page.
// ---------------------------------------------------------------------------
export type Status =
  | { kind: 'same' }
  | { kind: 'reverted' }
  | { kind: 'moved-again'; title: string }
  | { kind: 'deleted' };

export interface MoveRow {
  ts: string;
  user: string;
  blocked: boolean;
  from: string;
  to: string;
  comment: string;
  status: Status;
}

/** Where the moved page is now, compared with where the move left it. */
export function statusOf(from: string, to: string, current: string | null): Status {
  if (current === null) return { kind: 'deleted' };
  if (current === to) return { kind: 'same' };
  if (current === from) return { kind: 'reverted' };
  return { kind: 'moved-again', title: current };
}

/**
 * An edit summary, made safe to print in a table cell.
 *
 * It is printed as wikitext because a summary's links are part of what a reviewer
 * reads («[[وپ:نام رایج|نام رایج]]»). What would make the cell DO something is
 * neutralised: templates and parser functions, signatures, tags, table syntax, and a
 * link to a category or file, which would file the report into that category or
 * embed the image.
 */
export function safeComment(s: string): string {
  return s
    .replace(/[\r\n]+/g, ' ')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\{/g, '&#123;').replace(/\}/g, '&#125;')
    .replace(/~{3,}/g, m => '&#126;'.repeat(m.length))
    // A pipe inside [[…]] is the link's label separator and is safe in a cell; any
    // other pipe would start a new cell («||») or be read as cell attributes.
    .replace(/(\[\[[^\[\]]*\]\])|\|/g, (m, l) => l ?? '&#124;')
    .replace(/'{2,}/g, m => '&#39;'.repeat(m.length))
    .replace(/\[\[\s*(?=(?:رده|Category|پرونده|File|تصویر|Image|رسانه|Media)\s*:)/gi, '[[:')
    .replace(/^[\s*#:;=!-]+/, m => m.replace(/[*#:;=!-]/g, c => `&#${c.charCodeAt(0)};`))
    .trim();
}

/** `[[:X]]`: the leading colon keeps a category or file target a plain link. */
const link = (t: string) => `[[:${t}]]`;

function stamp(ts: string): string {
  const v = `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)} ${ts.slice(8, 10)}:${ts.slice(10, 12)}`;
  return `data-sort-value="${ts}" | ${fa(v)}`;
}

function statusCell(s: Status): string {
  switch (s.kind) {
    case 'same': return 'data-sort-value="1" | در همان عنوان';
    case 'reverted': return 'data-sort-value="2" | {{سبز|به عنوان پیشین برگردانده شد}}';
    case 'moved-again': return `data-sort-value="3" | دوباره تغییرنام یافت: ${link(s.title)}`;
    case 'deleted': return 'data-sort-value="4" | {{قرمز|حذف شد}}';
  }
}

function userCell(r: MoveRow): string {
  const u = `[[کاربر:${r.user}|${r.user}]] ([[ویژه:مشارکت‌ها/${r.user}|مشارکت‌ها]])`;
  return r.blocked ? `${u} {{قرمز|(بسته‌شده)}}` : u;
}

export function buildAcMoves(rows: MoveRow[], months: Month[]): string {
  const byMonth = new Map(months.map(m => [m.key, [] as MoveRow[]]));
  for (const r of rows) byMonth.get(r.ts.slice(0, 6))?.push(r);
  const count = (rs: MoveRow[], k: Status['kind']) => rs.filter(r => r.status.kind === k).length;

  const out = [
    'این صفحه تغییرنام‌هایی را فهرست می‌کند که به فضای نام اصلی (مقاله‌ها) وارد یا از آن خارج شده‌اند و '
    + 'انجام‌دهنده‌شان در زمان تغییرنام، جز عضویت در [[ویکی‌پدیا:کاربران تأییدشده خودکار|کاربران تأییدشدهٔ خودکار]] '
    + '(یا گروه «تأییدشده»)، دسترسی دیگری نداشته است تا بازبینی شوند.',
    '',
    '* گروه‌های کاربر بر پایهٔ [[ویژه:سیاهه‌ها/rights|سیاههٔ اختیارات]] در همان لحظهٔ تغییرنام سنجیده می‌شود؛ '
    + 'پس اگر کاربری بعدها دسترسی تازه‌ای بگیرد، تغییرنام‌های پیشینش از این فهرست حذف نمی‌شود.',
    '* هر ماه بخش جداگانه‌ای دارد و فهرست هر ماه پس از پایانش ثابت می‌ماند. '
    + `${fa(months.length - 1)} ماه کامل گذشته و ماه جاری نمایش داده می‌شود.`,
    '* تغییرنام صفحه‌های بحث که همراه مقاله جابه‌جا شده‌اند جداگانه آورده نمی‌شوند. '
    + 'ستون «وضعیت کنونی» در هر به‌روزرسانی دوباره سنجیده می‌شود.',
    '* زمان‌ها به وقت [[زمان هماهنگ جهانی]] است.',
    '',
    'آخرین به‌روزرسانی: ~~~~~',
    '',
    '{| class="wikitable"',
    '! ماه !! تغییرنام !! کاربر !! در همان عنوان !! برگردانده‌شده !! دوباره تغییرنام‌یافته !! حذف‌شده',
  ];
  for (const m of months) {
    const rs = byMonth.get(m.key)!;
    out.push('|-',
      `| [[#${m.label}|${m.label}]]${m.partial ? ' (تاکنون)' : ''}`,
      `| ${fa(rs.length)}`,
      `| ${fa(new Set(rs.map(r => r.user)).size)}`,
      `| ${fa(count(rs, 'same'))}`,
      `| ${fa(count(rs, 'reverted'))}`,
      `| ${fa(count(rs, 'moved-again'))}`,
      `| ${fa(count(rs, 'deleted'))}`);
  }
  out.push('|}');

  for (const m of months) {
    const rs = byMonth.get(m.key)!;
    out.push('', `== ${m.label} ==`);
    if (!rs.length) { out.push('در این ماه موردی یافت نشد.'); continue; }
    out.push('{| class="wikitable sortable" style="width:100%"',
      '! زمان !! کاربر !! عنوان پیشین !! عنوان تازه !! خلاصهٔ ویرایش !! وضعیت کنونی');
    for (const r of rs) {
      out.push('|-',
        `| ${stamp(r.ts)}`,
        `| ${userCell(r)}`,
        `| ${link(r.from)}`,
        `| ${link(r.to)}`,
        `| ${safeComment(r.comment)}`,
        `| ${statusCell(r.status)}`);
    }
    out.push('|}');
  }
  out.push('', '[[رده:گزارش‌های دیتابیس ویکی‌پدیا]]');
  return out.join('\n');
}
