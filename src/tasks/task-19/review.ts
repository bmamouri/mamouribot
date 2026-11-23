/**
 * وظیفهٔ ۱۹ — the review queue: proposals the bot is not sure enough to save.
 *
 *   کاربر:MamouriBot/وظیفه ۱۹/بازبینی
 *
 * A proposal is a finished citation the bot WOULD write, with the reason it did not.
 * An editor reads it and either applies it to the article by hand, or marks the row:
 *
 *   {{وظیفه ۱۹/بازبینی|شناسه=…|وضعیت=}}       vazʿiyat empty: waiting
 *   …|وضعیت=بله}}                              the bot applies this exact citation next run
 *   …|وضعیت=نه}}                               never propose this URL again
 *
 * The page is a rendering of a store on disk (`$BOT_STATE_DIR/cite-urls.review.json`), so
 * a run that finds one proposal does not wipe out the forty already listed (the defect
 * `task-03/review-store.ts` records). The page is read back before it is rewritten: a
 * human's بله/نه there is merged into the store first, so a decision is never lost by
 * the rewrite that follows it.
 *
 * What gets proposed instead of saved:
 *   - a bare ref whose title is good but whose author is a Persian name the splitter
 *     could not split   (the citation is written with نویسنده=, see names.ts)
 *   - a title that passed every rule but disagrees with the URL slug in only part
 *   - more than MAX_REFS_PER_EDIT bare refs on one page (the rest wait here)
 * and anything a later rule adds with `uncertain`.
 */
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

export const REVIEW_PAGE = 'کاربر:MamouriBot/وظیفه ۱۹/بازبینی';

export type Decision = '' | 'yes' | 'no';
export interface Proposal {
  id: string;
  title: string;        // article
  url: string;
  proposed: string;     // the citation template, ready to paste
  why: string;          // Persian reason shown to the reviewer
  decision: Decision;
  seen: number;
}

export const storePath = () => join(process.env.BOT_STATE_DIR ?? '.state', 'cite-urls.review.json');

export function proposalId(title: string, url: string): string {
  return createHash('sha1').update(`${title}\n${url}`).digest('hex').slice(0, 10);
}

export function loadStore(): { rows: Proposal[]; existed: boolean } {
  const p = storePath();
  if (!existsSync(p)) return { rows: [], existed: false };
  try {
    const raw = JSON.parse(readFileSync(p, 'utf8'));
    const rows = Array.isArray(raw?.rows) ? raw.rows : [];
    return { rows: rows.filter((r: any) => r && typeof r.id === 'string' && typeof r.url === 'string'), existed: true };
  } catch { return { rows: [], existed: true }; }
}
export function saveStore(rows: Proposal[]) {
  const p = storePath();
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify({ rows }, null, 1));
}

/** `{{…|شناسه=abc|وضعیت=بله}}` rows from the live page → id → decision. */
export function readDecisions(pageText: string): Map<string, Decision> {
  const out = new Map<string, Decision>();
  for (const m of pageText.matchAll(/\|\s*شناسه\s*=\s*([0-9a-f]{10})\s*\|\s*وضعیت\s*=\s*([^|}\n]*)/g)) {
    const v = m[2].trim();
    out.set(m[1], /^(?:بله|آری|yes|درست|اعمال)$/i.test(v) ? 'yes' : /^(?:نه|خیر|no|نادرست|رد)$/i.test(v) ? 'no' : '');
  }
  return out;
}

/**
 * Fold this run into the store. `fresh` is every proposal made this run; `examined` is every
 * article this run looked at, so a proposal on an examined article that was NOT made again
 * (the bare ref was fixed by someone, or the bot is now sure) leaves the queue. A row a
 * human decided stays until the bot has acted on it.
 */
export function merge(stored: Proposal[], fresh: Omit<Proposal, 'decision' | 'seen' | 'id'>[], examined: Set<string>,
                      decisions: Map<string, Decision>, now = Date.now()): Proposal[] {
  const byId = new Map(stored.map(r => [r.id, { ...r, decision: decisions.get(r.id) ?? r.decision }]));
  const freshIds = new Set<string>();
  for (const f of fresh) {
    const id = proposalId(f.title, f.url);
    freshIds.add(id);
    const prev = byId.get(id);
    byId.set(id, { ...f, id, seen: now, decision: decisions.get(id) ?? prev?.decision ?? '' });
  }
  for (const [id, r] of byId) {
    if (examined.has(r.title) && !freshIds.has(id) && r.decision !== 'no') byId.delete(id);
  }
  return [...byId.values()].sort((a, b) => a.title.localeCompare(b.title, 'fa') || a.url.localeCompare(b.url));
}

/** URLs a reviewer rejected, never to be proposed or saved again. */
export function rejected(rows: Proposal[]): Set<string> {
  return new Set(rows.filter(r => r.decision === 'no').map(r => `${r.title}\n${r.url}`));
}
/** Proposals a reviewer accepted, by article: the transform applies exactly these. */
export function accepted(rows: Proposal[]): Map<string, Proposal[]> {
  const out = new Map<string, Proposal[]>();
  for (const r of rows) if (r.decision === 'yes') out.set(r.title, [...(out.get(r.title) ?? []), r]);
  return out;
}

const faDigits = (n: number) => String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);

export function renderPage(rows: Proposal[], today: string): string {
  const waiting = rows.filter(r => r.decision === '');
  const out = [
    'این صفحه یادکردهایی را فهرست می‌کند که ربات ساخته ولی دربارهٔ درستی‌شان مطمئن نبوده و ذخیره نکرده است.',
    'اگر یادکرد پیشنهادی درست است، «وضعیت» را «بله» کنید تا ربات در اجرای بعدی همان را در مقاله بگذارد؛',
    'اگر نادرست است «نه» بنویسید تا دیگر پیشنهاد نشود. می‌توانید یادکرد را دستی هم در مقاله بگذارید.',
    '',
    `آخرین به‌روزرسانی: ${today}؛ ${faDigits(waiting.length)} مورد در انتظار بررسی.`,
  ];
  if (!rows.length) out.push('', 'در حال حاضر پیشنهادی برای بازبینی نیست.');
  else out.push('');
  let cur = '';
  for (const r of rows) {
    if (r.title !== cur) { out.push(`== [[${r.title}]] ==`); cur = r.title; }
    out.push(`* <nowiki>${r.url}</nowiki> (${r.why})`);
    out.push(`*: <code><nowiki>${r.proposed}</nowiki></code>`);
    out.push(`*: {{کاربر:MamouriBot/وظیفه ۱۹/بازبینی/سطر|شناسه=${r.id}|وضعیت=${r.decision === 'yes' ? 'بله' : r.decision === 'no' ? 'نه' : ''}}}`);
  }
  return out.join('\n') + '\n';
}

/** The tiny row template, created once if missing. It only displays the state. */
export const ROW_TEMPLATE = `<includeonly>{{#switch:{{{وضعیت|}}}|بله=<span style="color:#14866d">✔ تأیید شد؛ ربات اعمال می‌کند</span>|نه=<span style="color:#d33">✘ رد شد</span>|#default=<span style="color:#72777d">در انتظار بررسی (وضعیت را «بله» یا «نه» کنید)</span>}}</includeonly><noinclude>سطر صفحهٔ [[کاربر:MamouriBot/وظیفه ۱۹/بازبینی]].</noinclude>`;
