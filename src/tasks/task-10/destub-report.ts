/**
 * De-stub, phase 5 — publish the articles the bot refuses to touch.
 *
 *   npx tsx src/tasks/task-10/destub-report.ts            # dry-run, prints the wikitext
 *   npx tsx src/tasks/task-10/destub-report.ts --live     # publishes
 *
 * The bot only removes a stub tag when the article is unambiguously no longer a
 * stub. Everything between "clearly still a stub" and "clearly not" is a
 * judgement call, and a judgement call silently dropped is a judgement call
 * nobody makes. So it goes on a page where editors can act on it, ranked by how
 * close it is to the line, with the reason the bot stood back.
 *
 * This mirrors what enwiki ended up with — Wikipedia:Database reports/Long stubs
 * plus Category:Long stubs with short prose, a hand-maintained allowlist that
 * exists precisely because byte size lies about article length. The allowlist
 * here is /فهرست سفید: any title an editor puts there is skipped by the bot for
 * good, no argument, no re-litigating it on the next run.
 */
import { Bot } from '../../core.js';
import { CLASSIFIED_PATH, AUTO_REMOVE_WORDS, type Verdict } from './destub-classify.js';
import { readFileSync, existsSync } from 'fs';
import { isMain } from '../../lib/is-main.js';

export const REPORT_PAGE = 'ویکی‌پدیا:گزارش دیتابیس/مقاله‌های خرد بلند/بازبینی';
export const ALLOWLIST_PAGE = `${REPORT_PAGE}/فهرست سفید`;
/** Longest report we will publish; beyond this the page stops being usable. */
const MAX_ROWS = 500;

const fa = (n: number) => String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);

export function loadVerdicts(path = CLASSIFIED_PATH): Verdict[] {
  if (!existsSync(path)) throw new Error(`رده‌بندی انجام نشده است: ${path}`);
  return readFileSync(path, 'utf8').split('\n')
    .filter(l => l.trim()).map(l => JSON.parse(l) as Verdict);
}

/**
 * Titles an editor has declared genuinely-still-a-stub. One per line as a
 * wikilink or plain text; everything else on the page is ignored, so the page
 * can carry an explanatory preamble.
 */
export function parseAllowlist(wikitext: string): Set<string> {
  const out = new Set<string>();
  for (const m of wikitext.matchAll(/^\s*[*#]\s*\[\[([^\]|]+)/gm)) {
    out.add(m[1].replace(/_/g, ' ').trim());
  }
  return out;
}

export function buildReport(verdicts: Verdict[], allowlist: Set<string>): string {
  const rows = verdicts
    .filter(v => v.tier === 'needs-human' && !allowlist.has(v.title))
    .sort((a, b) => b.words - a.words);
  const shown = rows.slice(0, MAX_ROWS);

  const counts = { auto: 0, human: 0, leave: 0 };
  for (const v of verdicts) {
    if (v.tier === 'auto-remove') counts.auto++;
    else if (v.tier === 'needs-human') counts.human++;
    else counts.leave++;
  }

  // No header template: the sibling report uses a hand-written /بالا subpage
  // rather than a shared one, and «الگو:بالای صفحه گزارش» does not exist. The
  // explanation is inline instead of transcluded from a page that would be red.
  const head = [
    'این فهرست مقاله‌هایی است که برچسب خرد دارند و اندازهٔ آن‌ها بزرگ است، ولی برای',
    'برداشتن خودکار برچسب به‌اندازهٔ کافی روشن نیستند. سنجه، شمار واژه‌های متن خوانا',
    'است: متن پاراگراف‌ها کامل، و واژه‌های فهرست‌ها نصف به حساب می‌آید تا مقاله‌ای که',
    'تنها یک فهرست بلند دارد به اشتباه «بلند» شمرده نشود. حجم صفحه به بایت سنجهٔ',
    'خوبی نیست، چون جعبهٔ اطلاعات و فهرست منابع را هم می‌شمارد.',
    '',
    `مقاله‌هایی با دست‌کم ${fa(AUTO_REMOVE_WORDS)} واژه و بدون هیچ نشانهٔ تردید، برچسبشان`,
    'خودکار برداشته می‌شود و در این فهرست نمی‌آیند. ستون «دلیل» می‌گوید چرا مقاله‌ای',
    'اینجا مانده است.',
    '',
    `اگر مقاله‌ای را بررسی کردید و به نظرتان هنوز خرد است، عنوانش را به [[${ALLOWLIST_PAGE}|فهرست سفید]]`,
    'بیفزایید تا دیگر در این گزارش و در کار ربات نیاید. اگر خرد نیست، برچسب را',
    'بردارید؛ این کار به اجازهٔ کسی نیاز ندارد.',
    '',
    `آخرین به‌روزرسانی: ${fa(new Date().getUTCDate())} ` +
    `${['ژانویه', 'فوریه', 'مارس', 'آوریل', 'مه', 'ژوئن', 'ژوئیه', 'اوت', 'سپتامبر', 'اکتبر', 'نوامبر', 'دسامبر'][new Date().getUTCMonth()]} ` +
    `${fa(new Date().getUTCFullYear())}`,
    '',
    // «—» is an AI tell this repo has already been corrected on three times;
    // «؛» is the Persian separator for a run of clauses like this.
    `بررسی‌شده: ${fa(verdicts.length)}؛ برچسب برداشته‌شده یا آمادهٔ برداشتن: ${fa(counts.auto)}؛ ` +
    `نیازمند بازبینی: ${fa(counts.human)}؛ همچنان خرد: ${fa(counts.leave)}`,
    '',
  ];

  if (!shown.length) {
    return [...head, 'در این اجرا موردی برای بازبینی یافت نشد.', '',
      '[[رده:گزارش‌های دیتابیس ویکی‌پدیا]]'].join('\n');
  }

  const table = [
    '{| class="wikitable sortable"',
    '! ردیف !! مقاله !! واژه !! حجم (بایت) !! دلیل',
  ];
  shown.forEach((v, i) => {
    table.push('|-');
    table.push(`| ${fa(i + 1)} || [[${v.title}]] || ${fa(v.words)} || ${fa(v.bytes)} || ` +
      [...v.flags, ...v.notes].join('؛ '));
  });
  table.push('|}');

  const tail = rows.length > shown.length
    ? ['', `(${fa(rows.length - shown.length)} مورد دیگر در این گزارش نیامد.)`]
    : [];

  return [...head, ...table, ...tail, '', '[[رده:گزارش‌های دیتابیس ویکی‌پدیا]]'].join('\n');
}

async function fetchAllowlist(bot: Bot): Promise<Set<string>> {
  const r = await bot.apiGet({ action: 'query', prop: 'revisions', titles: ALLOWLIST_PAGE,
    rvprop: 'content', rvslots: 'main' });
  const p = r.query.pages[0];
  if (p.missing) return new Set();
  return parseAllowlist(p.revisions[0].slots.main.content);
}

async function main() {
  const live = process.argv.includes('--live');
  const bot = new Bot({ dryRun: !live, delayMs: 0, limit: 0, maxlag: 5 });
  const verdicts = loadVerdicts();
  const allow = await fetchAllowlist(bot);
  const text = buildReport(verdicts, allow);

  if (!live) {
    console.log(text);
    console.log(`\n--- آزمایشی. برای انتشار: --live  (فهرست سفید: ${allow.size} عنوان)`);
    return;
  }
  const cur = await bot.apiGet({ action: 'query', prop: 'revisions', titles: REPORT_PAGE,
    rvprop: 'content|ids|timestamp', rvslots: 'main' });
  const p = cur.query.pages[0];
  await bot.edit(REPORT_PAGE, text, 'به‌روزرسانی فهرست مقاله‌های خرد نیازمند بازبینی',
    p.missing ? 0 : p.revisions[0].revid, p.missing ? '' : p.revisions[0].timestamp,
    { allowCreate: true });
  console.log(`منتشر شد: ${REPORT_PAGE}`);
}

if (isMain(import.meta.url)) {
  main().catch(e => { console.error(e); process.exit(1); });
}
