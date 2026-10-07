/**
 * Supervision for the وظیفهٔ ۳ trial: prove the bot's live edits changed nothing a
 * reader can see. Read-only, no login.
 *
 *   npx tsx src/tasks/task-03/verify-trial.ts [--limit N] [--user MamouriBot]
 *   npx tsx src/tasks/task-03/verify-trial.ts --json > trial.json
 *
 * The permission request claims the transform is behaviour-preserving: «خروجی
 * رندرشدهٔ هر یادکرد پیش و پس از تبدیل مو‌به‌مو یکسان است», because the template's
 * compatibility shim maps the legacy names to exactly the values this task writes. That
 * is a testable claim and it is the one that matters, so this tests it directly rather
 * than inspecting wikitext and reasoning about what it ought to render as.
 *
 * For every edit the bot made, it:
 *   1. renders the parent revision and the new revision through the API,
 *   2. strips the HTML to visible text and compares — any difference is a regression,
 *   3. counts CS1 error markers on both sides, so an edit that ADDS one is caught,
 *   4. diffs the wikitext and classifies every change, so anything beyond a known
 *      parameter rename, a duplicate drop or a ref=harv removal is flagged as
 *      unexplained rather than quietly accepted.
 *
 * Step 4 exists because steps 1–3 are blind to a change that is invisible AND wrong:
 * dropping a |ref=CITEREF… anchor leaves the citation rendering identically while
 * every short footnote pointing at it stops resolving.
 */
import { apiGet } from '../../lib/fa-wiki.js';

const BOT = 'MamouriBot';

/**
 * Parameter names this task is allowed to introduce or remove. Anything else is news.
 *
 * Derived from the task's own FIELDS table, never hand-listed: the hand-written version
 * of this set was correct when the task only touched archive parameters, and after the
 * scope widened it flagged every single correct edit as out of scope. A supervision
 * check that is wrong on all of its input teaches you to ignore it.
 */
import { TOUCHABLE_KEYS } from './normalize-cite-params.js';
const EXPECTED_KEYS = TOUCHABLE_KEYS;

/** CS1 renders its errors inside these, so their count must not rise. */
const ERROR_MARKERS = [
  // `class="` prefixed on purpose: the bare name also appears in the TemplateStyles
  // block that defines its colour, which gives every page a constant phantom floor.
  'class="cs1-visible-error', 'cite_error', 'scribunto-error', 'class="error"',
  'mw-ext-cite-error',
];

export interface EditCheck {
  title: string;
  revid: number;
  parentid: number;
  renderIdentical: boolean;
  renderDiffSample?: string;
  errorsBefore: number;
  errorsAfter: number;
  changedKeys: string[];
  unexpectedKeys: string[];
  bytesDelta: number;
  verdict: 'ok' | 'REGRESSED';
  reasons: string[];
}

/**
 * Remove every `<span class="…cs1-…">…</span>` with its contents, nesting included.
 *
 * The CS1 error and maintenance spans are exactly what this task is meant to make
 * disappear — «بیش از یک پارامتر تاریخ بایگانی= و archive-date= داده‌شده است» is the
 * duplicate-parameter error the whole job exists to drain. Comparing raw rendered text
 * therefore flags every successful edit as a regression, which is how a check that is
 * too strict gets switched off and stops catching the real thing. Strip them, compare
 * what is left, and count the markers separately so an edit that ADDS an error is still
 * caught.
 */
function stripCs1Spans(html: string): string {
  let out = '', i = 0;
  const open = /<span\b[^>]*class="[^"]*cs1-[^"]*"[^>]*>/gi;
  for (;;) {
    open.lastIndex = i;
    const m = open.exec(html);
    if (!m) { out += html.slice(i); break; }
    out += html.slice(i, m.index);
    // walk to the matching </span>, counting nested <span ...>
    let depth = 1, j = open.lastIndex;
    while (depth > 0 && j < html.length) {
      const nextOpen = html.indexOf('<span', j), nextClose = html.indexOf('</span', j);
      if (nextClose === -1) { j = html.length; break; }
      if (nextOpen !== -1 && nextOpen < nextClose) { depth++; j = nextOpen + 5; }
      else { depth--; j = nextClose + 6; }
    }
    i = html.indexOf('>', j - 1) + 1 || html.length;
  }
  return out;
}

/** Visible text of a rendered revision: tags gone, entities decoded, whitespace flat. */
function visibleText(html: string): string {
  return stripCs1Spans(html)
    // The reference list carries per-revision ids and backlink letters that differ
    // between any two parses of the same page; they are not reader-visible content.
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#\d+;/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function renderRevision(oldid: number): Promise<string> {
  const r = await apiGet({ action: 'parse', oldid: String(oldid), prop: 'text', formatversion: '2' });
  if (r.error) throw new Error(`parse oldid=${oldid}: ${r.error.code} ${r.error.info ?? ''}`);
  return r.parse.text as string;
}

async function wikitext(oldid: number): Promise<string> {
  const r = await apiGet({ action: 'query', revids: String(oldid), prop: 'revisions',
    rvprop: 'content', rvslots: 'main', formatversion: '2' });
  return r.query.pages[0].revisions[0].slots.main.content as string;
}

const countMarkers = (html: string) =>
  ERROR_MARKERS.reduce((n, m) => n + (html.split(m).length - 1), 0);

/** Every `|key=` in the text, normalized the way the task normalizes them. */
function paramKeys(text: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const m of text.matchAll(/\|\s*([^|={}\n]{1,40}?)\s*=/g)) {
    const k = m[1].replace(/_/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
    out.set(k, (out.get(k) ?? 0) + 1);
  }
  return out;
}

export async function checkEdit(title: string, revid: number, parentid: number): Promise<EditCheck> {
  const reasons: string[] = [];

  const [beforeHtml, afterHtml] = [await renderRevision(parentid), await renderRevision(revid)];
  const bVis = visibleText(beforeHtml), aVis = visibleText(afterHtml);
  // CS1 joins several error messages with «;». Removing the error spans leaves those
  // separators stranded, so the before side ends «… . ;» and the after side «… .» for
  // an edit that changed nothing a reader sees. Collapsing the separators is the last
  // step of removing the errors, not a loosening of the check: any real change — a
  // date, a URL, a word — still differs after it.
  const forCompare = (s: string) => s.replace(/[\s;،]+/g, ' ').trim();
  const renderIdentical = forCompare(bVis) === forCompare(aVis);
  let renderDiffSample: string | undefined;
  if (!renderIdentical) {
    const b2 = forCompare(bVis), a2 = forCompare(aVis);
    let i = 0;
    while (i < b2.length && i < a2.length && b2[i] === a2[i]) i++;
    renderDiffSample = `…${b2.slice(Math.max(0, i - 60), i + 90)}\n…${a2.slice(Math.max(0, i - 60), i + 90)}`;
    reasons.push('rendered text differs (outside the CS1 error spans)');
  }

  const errorsBefore = countMarkers(beforeHtml), errorsAfter = countMarkers(afterHtml);
  if (errorsAfter > errorsBefore) reasons.push(`CS1 errors rose ${errorsBefore}→${errorsAfter}`);

  const [bText, aText] = [await wikitext(parentid), await wikitext(revid)];
  const bk = paramKeys(bText), ak = paramKeys(aText);
  const changedKeys: string[] = [], unexpectedKeys: string[] = [];
  for (const k of new Set([...bk.keys(), ...ak.keys()])) {
    if ((bk.get(k) ?? 0) === (ak.get(k) ?? 0)) continue;
    changedKeys.push(`${k} ${bk.get(k) ?? 0}→${ak.get(k) ?? 0}`);
    if (!EXPECTED_KEYS.has(k)) unexpectedKeys.push(k);
  }
  if (unexpectedKeys.length) reasons.push(`parameters outside the task's scope changed: ${unexpectedKeys.join(', ')}`);

  // A ref= anchor that disappears is invisible in the render and breaks every short
  // footnote pointing at it, so it is checked by value, not just by key count.
  const refValues = (t: string) => [...t.matchAll(/\|\s*ref\s*=\s*([^|}\n]*)/g)].map(m => m[1].trim());
  const lostRefs = refValues(bText).filter(v => v !== '' && v.toLowerCase() !== 'harv')
    .filter(v => !refValues(aText).includes(v));
  if (lostRefs.length) reasons.push(`a non-harv |ref= anchor was lost: ${lostRefs.join(' | ')}`);

  return {
    title, revid, parentid, renderIdentical, renderDiffSample,
    errorsBefore, errorsAfter, changedKeys, unexpectedKeys,
    bytesDelta: aText.length - bText.length,
    verdict: reasons.length ? 'REGRESSED' : 'ok', reasons,
  };
}

async function main() {
  const arg = (n: string, d: string) => {
    const i = process.argv.indexOf(n);
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
  };
  const limit = Number(arg('--limit', '50'));
  const user = arg('--user', BOT);
  const asJson = process.argv.includes('--json');

  // --since pins the window to one trial run, so the report is reproducible later
  // instead of meaning "whatever the last N edits happened to be when I ran it".
  const since = arg('--since', '');
  const uc = await apiGet({ action: 'query', list: 'usercontribs', ucuser: user,
    ucnamespace: '0', uclimit: String(limit), ucprop: 'title|ids|sizediff|comment|timestamp',
    ...(since ? { ucstart: since, ucdir: 'newer' } : {}),
    formatversion: '2' });
  // Select THIS task's edits by their summary, rather than taking everything the account
  // did and excluding one known other task.
  //
  // The exclude-list approach broke as soon as the trial ran on the human account:
  // several agents share `Mamouri` (AGENTS.md says so), so «عقل فعال» — edited by someone
  // else with the summary «برداشتن پرانتز تکراری» — was picked up and reported as this
  // task's rendering regression. A supervision tool that attributes other people's edits
  // to itself is worse than none: it manufactures regressions and buries real ones.
  const marker = arg('--summary-contains', 'هم‌سان‌سازی نام پارامترهای بایگانی');
  const all = uc.query.usercontribs as any[];
  const edits = all.filter(e => (e.comment ?? '').includes(marker));
  const skipped = all.length - edits.length;
  if (skipped) console.log(`(${skipped} ویرایش دیگر این حساب که به این وظیفه مربوط نیست نادیده گرفته شد)`);
  if (!edits.length) { console.log('هیچ ویرایشی یافت نشد.'); return; }

  const results: EditCheck[] = [];
  for (const e of edits) {
    const r = await checkEdit(e.title, e.revid, e.parentid);
    results.push(r);
    if (!asJson) {
      const mark = r.verdict === 'ok' ? '✓' : '✗';
      console.log(`${mark} ${r.title}  (رندر ${r.renderIdentical ? 'یکسان' : 'متفاوت'}، خطا ${r.errorsBefore}→${r.errorsAfter}، ${r.bytesDelta >= 0 ? '+' : ''}${r.bytesDelta} بایت)`);
      for (const k of r.changedKeys) console.log(`      ${k}`);
      for (const why of r.reasons) console.error(`      ⚠ ${why}`);
      if (r.renderDiffSample) console.error(r.renderDiffSample.split('\n').map(l => '      ' + l).join('\n'));
    }
  }

  if (asJson) { console.log(JSON.stringify(results, null, 1)); return; }
  const bad = results.filter(r => r.verdict !== 'ok');
  console.log(`\nبررسی‌شده: ${results.length}؛ سالم: ${results.length - bad.length}؛ مشکوک: ${bad.length}`);
  if (bad.length) { console.error('\nصفحه‌های نیازمند بررسی:\n  - ' + bad.map(b => `${b.title}: ${b.reasons.join('; ')}`).join('\n  - ')); process.exit(1); }
  console.log('هیچ تفاوتی در خروجی رندرشده دیده نشد.');
}

main().catch(e => { console.error(e); process.exit(1); });
