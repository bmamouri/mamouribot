/**
 * De-stub, phase 2 — decide which stub-tagged articles are genuinely no longer
 * stubs.
 *
 * Read-only. Reads the worklist, scores each article, writes one JSON line per
 * article to .state/destub/classified.jsonl. destub.ts then only
 * looks verdicts up, because `BotTask.transform()` is synchronous and pure while
 * the measurement needs `action=parse`.
 *
 *   npx tsx src/tasks/task-10/destub-classify.ts [--limit N] [--title 'X'] [--fresh]
 *
 * WHY NOT BYTE SIZE
 * -----------------
 * The worklist is ویکی‌پدیا:گزارش دیتابیس/مقاله‌های خرد بلند — HujiBot's weekly
 * `page_len > 10*1024` query, 4,522 rows. `page_len` is BYTES and Persian costs
 * two bytes a character, so that cutoff is ~5,000 characters, not 10,000: it is
 * half as strict as it reads. Worse, page_len counts infoboxes, reference lists
 * and tables. دلتا ۲ sits on the list at 12 KB with 47 words of prose — it is
 * long only because of a 52-row infobox. Measuring bytes would have destubbed
 * it.
 *
 * So the metric is enwiki's, from Wikipedia:AutoWikiBrowser/General fixes:
 * words of readable prose, with words in bulleted text counted half «to avoid
 * destubbing pages with big lists and little text». Both wikis' guidelines agree
 * that ~500 words is almost never a stub; this runs at 400 with a battery of
 * structural checks on top, because the tiers are deliberately asymmetric — a
 * wrong removal costs a revert and bot trust, a skip costs nothing.
 */
import { Bot } from '../../core.js';
import { loadInventory, ALL_STUBS_CAT, type Inventory } from './destub-inventory-lib.js';
import { mkdirSync, writeFileSync, readFileSync, existsSync, appendFileSync } from 'fs';
import { dirname } from 'path';
import { isMain } from '../../lib/is-main.js';

export const WORKLIST_PAGE = 'ویکی‌پدیا:گزارش دیتابیس/مقاله‌های خرد بلند';
export const CLASSIFIED_PATH = '.state/destub/classified.jsonl';

/** ≥ this many prose words, with every check clean, is auto-removable. */
export const AUTO_REMOVE_WORDS = 400;
/** Below this the tag is simply correct; record and never look again. */
export const LEAVE_ALONE_WORDS = 150;
/** bytes per prose word above which the page is mostly not prose */
export const MAX_BYTES_PER_WORD = 40;
/** share of prose words that may be Latin script before it reads as untranslated */
export const MAX_LATIN_SHARE = 0.15;
/** share of counted words that may come from list items before it reads as a list */
export const MAX_LIST_SHARE = 0.5;
/** above this many prose words the bytes-per-word ratio stops being informative */
export const RATIO_GUARD_WORDS = 600;

export type Tier = 'auto-remove' | 'needs-human' | 'leave-alone';

export interface Verdict {
  title: string;
  bytes: number;
  words: number;        // weighted: <p> at 1.0, <li>/<dd> at 0.5
  proseWords: number;   // <p> only
  listWords: number;    // <li>/<dd> only, unweighted
  latinShare: number;
  refs: number;
  tier: Tier;
  /** why it is not auto-remove; empty for auto-remove */
  flags: string[];
  /** observations recorded for the human report, which do NOT block removal */
  notes: string[];
}

// ---------------------------------------------------------------------------
// HTML → prose words
// ---------------------------------------------------------------------------

/**
 * Elements whose entire subtree is excluded. `<table>` alone removes infoboxes,
 * taxoboxes, navboxes, wikitables and ambox banners, which is most of the bulk
 * that makes a stub look long.
 */
const DROP_TAGS = new Set(['table', 'style', 'script', 'sup', 'figure', 'figcaption',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

/**
 * Class names whose entire subtree is excluded. `asbox` is load-bearing and easy
 * to miss: on fa the stub banner is a `<div class="metadata plainlinks asbox
 * stub">` — NOT a table — and its own text lives in `<p class="asbox-body">`,
 * so dropping tables alone would count the stub notice itself as prose.
 */
const DROP_CLASSES = new Set(['infobox', 'navbox', 'vertical-navbox', 'sidebar', 'metadata',
  'ambox', 'asbox', 'asbox-body', 'portal', 'navframe', 'mw-collapsible',
  'reflist', 'references', 'mw-references-wrap', 'reference', 'reference-text',
  'thumb', 'thumbcaption', 'gallery', 'gallerytext', 'hatnote', 'dablink',
  'toc', 'mw-editsection', 'mw-empty-elt', 'noprint', 'mbox-text']);

/** Containers whose text counts, and at what weight. */
const WEIGHTS: Record<string, number> = { p: 1, li: 0.5, dd: 0.5 };

/** HTML elements that never have a closing tag. */
const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr']);

const ZWNJ = '‌';

/** Decode the entity set MediaWiki actually emits in article text. */
function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&nbsp;/g, ' ').replace(/&ndash;/g, '–').replace(/&mdash;/g, '—')
    .replace(/&amp;/g, '&'); // last, so &amp;lt; does not become '<'
}

/**
 * Persian-aware word count.
 *
 * U+200C (ZWNJ) is NOT a separator: «می‌رود», «کتاب‌ها», «دانشگاه‌های» are one
 * word each. Splitting on it inflates Persian counts by roughly a fifth, and it
 * inflates in the one direction that turns a stub into a non-stub.
 */
export function countWords(text: string): { total: number; latin: number } {
  const cleaned = text
    .replace(/[ً-ْٰ]/g, '')                       // harakat
    .replace(/[.,،؛:!?؟«»""'"()\[\]{}…\/\\|–—+*=@#$%^&~`_]/g, ' ')
    .replace(/(^|[\s])-+([\s]|$)/g, ' ');                        // bare dashes, not in-word hyphens
  let total = 0, latin = 0;
  for (const tok of cleaned.split(/[\s ]+/)) {
    if (!tok) continue;
    // a token of only ZWNJ/combining marks is not a word
    if (!/[\p{L}\p{N}]/u.test(tok.replace(new RegExp(ZWNJ, 'g'), ''))) continue;
    total++;
    if (/^[\p{Script=Latin}\p{N}\p{P}]+$/u.test(tok)) latin++;
  }
  return { total, latin };
}

interface Extracted { proseText: string; listText: string }

/**
 * Walk the parser output, dropping excluded subtrees, and return the text of the
 * counted containers. A depth-aware walk rather than a regex sweep, because
 * infoboxes nest tables inside tables and `<table[^>]*>.*?</table>` closes on
 * the first inner `</table>`, leaving the rest of the infobox to be counted as
 * prose.
 */
export function extractProse(html: string): Extracted {
  const prose: string[] = [];
  const list: string[] = [];
  /** open elements: tag name + whether it opened a dropped subtree */
  const stack: { tag: string; dropped: boolean; weightKey?: string }[] = [];
  let dropDepth = 0;
  /** innermost counted container, or undefined */
  const currentKey = () => {
    for (let i = stack.length - 1; i >= 0; i--) if (stack[i].weightKey) return stack[i].weightKey;
    return undefined;
  };

  const re = /<\/?([a-zA-Z][a-zA-Z0-9]*)((?:"[^"]*"|'[^']*'|[^>"'])*)\/?>/g;
  let last = 0;
  let m: RegExpExecArray | null;
  const emit = (raw: string) => {
    if (dropDepth > 0 || !raw) return;
    const key = currentKey();
    if (!key) return;
    (key === 'p' ? prose : list).push(decodeEntities(raw));
  };

  while ((m = re.exec(html))) {
    emit(html.slice(last, m.index));
    last = re.lastIndex;
    const tag = m[1].toLowerCase();
    const attrs = m[2] ?? '';
    const closing = m[0][1] === '/';
    const selfClosing = m[0].endsWith('/>') || VOID_TAGS.has(tag);

    if (closing) {
      // Pop to the matching open tag. Unbalanced markup (MediaWiki emits some)
      // must not unwind the whole stack.
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].tag !== tag) continue;
        for (let j = stack.length - 1; j >= i; j--) if (stack[j].dropped) dropDepth--;
        stack.length = i;
        break;
      }
      continue;
    }
    if (selfClosing) continue;

    const classes = (attrs.match(/class\s*=\s*"([^"]*)"/i)?.[1]
      ?? attrs.match(/class\s*=\s*'([^']*)'/i)?.[1] ?? '')
      .toLowerCase().split(/\s+/).filter(Boolean);
    const dropped = DROP_TAGS.has(tag) || classes.some(c => DROP_CLASSES.has(c));
    if (dropped) dropDepth++;
    stack.push({ tag, dropped, weightKey: WEIGHTS[tag] !== undefined ? tag : undefined });
  }
  emit(html.slice(last));

  const strip = (xs: string[]) => xs.join(' ').replace(/\s+/g, ' ').trim();
  return { proseText: strip(prose), listText: strip(list) };
}

// ---------------------------------------------------------------------------
// scoring
// ---------------------------------------------------------------------------

const SECTION_ONLY_HEADINGS = new Set(['جستارهای وابسته', 'منابع', 'پیوند به بیرون',
  'پانویس', 'پانویس‌ها', 'یادکرد', 'نگارخانه', 'منبع']);

/**
 * Signals that the render itself is broken. A page that renders broken must keep
 * its maintenance tag: removing it makes the page LESS likely to get fixed.
 *
 * Each of these is matched as a class TOKEN inside an attribute, never as a bare
 * substring, and only after `<style>` blocks are removed — because
 * `cs1-visible-error` appears in the TemplateStyles rule
 * `.mw-parser-output .cs1-visible-error{color:…}` on every page that cites
 * anything. Matching the bare string flagged all six of the first articles
 * tested, i.e. it flagged nothing at all. Same shape as
 * lessons/verification-and-gates/cs1-visible-error-bare-substring-phantom.md.
 *
 * Note what is deliberately NOT here: «نامعلوم». It is an ordinary Persian word
 * («unknown») that appears as legitimate table content, so as a check it is a
 * guaranteed phantom.
 */
const BROKEN_RENDER: [string, RegExp][] = [
  ['پارامتر جایگزین‌نشده', /\{\{\{[^}\n]{0,60}\}\}\}/],
  ['خطای پودمان', /class="[^"]*\bscribunto-error\b/],
  ['خطای پانویس', /class="[^"]*\bmw-ext-cite-error\b/],
  // Whole-class match. `\berror\b` also matches inside `cs1-visible-error`,
  // because `-` is a non-word character, so it silently duplicated the CS1
  // check and would match any future `…-error` class too.
  ['خطای الگو', /class="(?:[^"]*\s)?error(?:\s[^"]*)?"/],
];

/**
 * Recorded on the verdict but NOT a reason to refuse. A CS1 citation error is a
 * citation nit, not evidence that the article is still a stub: five of the first
 * six articles sampled had one, so treating it as blocking would have cut the
 * yield to a sixth in exchange for no protection. The stub tag and the citation
 * error are independent problems, and leaving a wrong stub tag in place does not
 * help fix a malformed `{{cite web}}`.
 */
const RENDER_NOTES: [string, RegExp][] = [
  ['خطای یادکرد CS1', /class="[^"]*\bcs1-visible-error\b/],
];

/**
 * Recorded, not blocking. `[[:en:Foo|فارسی]]` is an ordinary fa.wiki habit when
 * the Persian article does not exist yet, and the label is usually already
 * Persian — it is not evidence of an untranslated page. It blocked
 * جورج راسل (اتومبیل‌ران) at 6,796 prose words, which no reading of «خرد»
 * supports. The Latin-share check covers the actual untranslated-junk case
 * directly.
 */
const WIKITEXT_NOTES: [string, RegExp][] = [
  ['پیوند به ویکی انگلیسی', /\[\[\s*:\s*en\s*:/i],
];

/**
 * Remove `<style>` blocks and HTML comments before testing for error markers.
 * TemplateStyles inlines the full CSS of every template used on the page, which
 * mentions the class names of every error state those templates can produce.
 */
function withoutStyleBlocks(html: string): string {
  return html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
}

export interface ScoreInput {
  title: string;
  bytes: number;
  html: string;
  wikitext: string;
  isDisambig: boolean;
  /** true if a human re-added a stub tag in the recent past */
  tagReadded: boolean;
}

export function score(inp: ScoreInput): Verdict {
  const { proseText, listText } = extractProse(inp.html);
  const p = countWords(proseText);
  const l = countWords(listText);
  const words = p.total + Math.floor(l.total / 2);
  const counted = p.total + l.total;
  const latinShare = counted ? (p.latin + l.latin) / counted : 0;
  const refs = (inp.wikitext.match(/<ref[\s>\/]/g) ?? []).length;

  const flags: string[] = [];
  if (inp.tagReadded) flags.push('برچسب را کاربری بازگردانده است');
  if (inp.isDisambig) flags.push('صفحهٔ ابهام‌زدایی');
  if (inp.title.startsWith('فهرست')) flags.push('مقالهٔ فهرست');
  if (counted && l.total / counted > MAX_LIST_SHARE) flags.push('بیشتر محتوا فهرست است');
  // Only meaningful in the middle of the range. The point of this guard is to
  // catch a page that is long only because of a taxobox or a big table — but
  // above RATIO_GUARD_WORDS the prose count already settles the question, and
  // the ratio just penalises well-referenced articles for having a long
  // reference list. It was blocking مداخله آمریکا در جنگ داخلی سوریه at 1,144
  // prose words on a ratio of 40.2.
  if (words > 0 && words < RATIO_GUARD_WORDS && inp.bytes / words > MAX_BYTES_PER_WORD) {
    flags.push('حجم صفحه بسیار بیشتر از متن آن است');
  }
  if (latinShare > MAX_LATIN_SHARE) flags.push('سهم بالای متن لاتین (ترجمه‌نشده)');
  const notes: string[] = [];
  const renderable = withoutStyleBlocks(inp.html);
  for (const [why, re] of BROKEN_RENDER) if (re.test(renderable)) flags.push(`نمایش معیوب: ${why}`);
  for (const [why, re] of RENDER_NOTES) if (re.test(renderable)) notes.push(why);
  for (const [why, re] of WIKITEXT_NOTES) if (re.test(inp.wikitext)) notes.push(why);
  if (refs === 0) flags.push('بدون منبع');
  // A page whose only sections are the standard tail matter has no body.
  const headings = [...inp.html.matchAll(/<h2[^>]*>(?:<span[^>]*>)?([^<]*)/g)]
    .map(x => x[1].trim()).filter(Boolean);
  if (headings.length > 0 && headings.every(h => SECTION_ONLY_HEADINGS.has(h))) {
    flags.push('تنها بخش‌های پایانی استاندارد را دارد');
  }

  let tier: Tier;
  if (words < LEAVE_ALONE_WORDS) tier = 'leave-alone';
  else if (words >= AUTO_REMOVE_WORDS && flags.length === 0) tier = 'auto-remove';
  else tier = 'needs-human';

  return {
    title: inp.title, bytes: inp.bytes, words,
    proseWords: p.total, listWords: l.total,
    latinShare: Math.round(latinShare * 1000) / 1000,
    refs, tier,
    // `class="error mw-ext-cite-error"` matches two patterns at once, so the
    // same defect would otherwise be listed twice in the report.
    flags: [...new Set(flags)], notes: [...new Set(notes)],
  };
}

// ---------------------------------------------------------------------------
// worklist + run
// ---------------------------------------------------------------------------

/** Titles and byte sizes from HujiBot's weekly report table. */
export function parseWorklist(wikitext: string): { title: string; bytes: number }[] {
  const out: { title: string; bytes: number }[] = [];
  const re = /\|\s*\{\{formatnum:\d+\}\}\s*\|\|\s*\[\[([^\]|]+?)\]\]\s*\|\|\s*\{\{formatnum:(\d+)\}\}/g;
  for (const m of wikitext.matchAll(re)) {
    out.push({ title: m[1].replace(/_/g, ' ').trim(), bytes: Number(m[2]) });
  }
  return out;
}

async function fetchWorklist(bot: Bot): Promise<{ title: string; bytes: number }[]> {
  const r = await bot.apiGet({ action: 'query', prop: 'revisions', titles: WORKLIST_PAGE,
    rvprop: 'content', rvslots: 'main', formatversion: '2' });
  const page = r.query.pages[0];
  if (page.missing) throw new Error(`صفحهٔ گزارش یافت نشد: ${WORKLIST_PAGE}`);
  return parseWorklist(page.revisions[0].slots.main.content);
}

/**
 * Gather everything the score needs for one article. Deliberately the LIVE
 * render, not a cached parse of the wikitext: a stub tag can arrive through a
 * transcluded template, and the rendered page is the only thing that sees
 * through transclusion.
 */
export async function gather(bot: Bot, title: string, bytes: number, inv: Inventory): Promise<Verdict | null> {
  const info = await bot.apiGet({ action: 'query', titles: title,
    prop: 'info|pageprops|revisions|categories',
    clcategories: `رده:${ALL_STUBS_CAT}`, cllimit: 'max',
    rvprop: 'content|timestamp', rvslots: 'main', rvlimit: '1', redirects: '1' });
  const page = info.query.pages[0];
  if (page.missing) return null;
  if (info.query.redirects?.length) return null;      // moved or redirected since the report

  // The worklist is a weekly snapshot, so a good share of it has already been
  // destubbed by hand. Asking for the page's OWN categories in this same request
  // costs nothing and skips the two expensive calls below. (Its own categories,
  // not `list=categorymembers`, which lags the job queue.)
  if (!page.categories?.length) return null;

  const wikitext: string = page.revisions[0].slots.main.content;

  const parsed = await bot.apiGet({ action: 'parse', page: page.title, prop: 'text',
    redirects: '1', disablelimitreport: '1' });
  const html: string = parsed.parse.text;

  return score({
    title: page.title, bytes, html, wikitext,
    isDisambig: page.pageprops?.disambiguation !== undefined
      || /\{\{\s*(ابهام[‌ ]?زدایی|نام خانوادگی|سردر)\s*[|}]/.test(wikitext),
    tagReadded: await stubTagReadded(bot, page.title, inv),
  });
}

/**
 * True if any revision in the last 90 days ADDED a stub tag. A tag a human put
 * back is a considered judgement, and the bot must never overrule it.
 */
export async function stubTagReadded(bot: Bot, title: string, inv: Inventory): Promise<boolean> {
  const since = new Date(Date.now() - 90 * 86400000).toISOString();
  const r = await bot.apiGet({ action: 'query', prop: 'revisions', titles: title,
    rvprop: 'comment|user|timestamp|tags', rvlimit: '20', rvend: since });
  const revs = r.query.pages[0]?.revisions ?? [];
  // A cheap, conservative proxy: an edit summary that talks about adding a stub
  // tag. Diffing 20 revisions would cost 20 more requests per article for a
  // signal this catches in practice; a missed case only means the bot removes a
  // tag a human restored silently, which a watchlist revert corrects.
  return revs.some((v: any) => /خرد/.test(v.comment ?? '') && !/حذف|برداشتن|زدودن/.test(v.comment ?? ''));
}

async function main() {
  const argv = process.argv.slice(2);
  const limit = Number(argv[argv.indexOf('--limit') + 1]) || 0;
  const only = argv.includes('--title') ? argv[argv.indexOf('--title') + 1] : null;
  const fresh = argv.includes('--fresh');

  const inv = loadInventory();
  const bot = new Bot({ dryRun: true, delayMs: 0, limit: 0, maxlag: 5 });

  let work = only ? [{ title: only, bytes: 0 }] : await fetchWorklist(bot);
  console.log(`فهرست کار: ${work.length} مقاله`);

  mkdirSync(dirname(CLASSIFIED_PATH), { recursive: true });
  const done = new Set<string>();
  if (!fresh && existsSync(CLASSIFIED_PATH)) {
    for (const line of readFileSync(CLASSIFIED_PATH, 'utf8').split('\n')) {
      if (line.trim()) done.add(JSON.parse(line).title);
    }
    console.log(`از پیش بررسی‌شده: ${done.size}`);
  } else if (fresh) {
    writeFileSync(CLASSIFIED_PATH, '');
  }
  work = work.filter(w => !done.has(w.title));
  if (limit) work = work.slice(0, limit);

  const tally: Record<string, number> = {};
  for (const [i, w] of work.entries()) {
    try {
      const v = await gather(bot, w.title, w.bytes, inv);
      if (!v) { console.log(`  – ${w.title}: دیگر برچسب خرد ندارد یا نبود/تغییرمسیر`); continue; }
      appendFileSync(CLASSIFIED_PATH, JSON.stringify(v) + '\n');
      tally[v.tier] = (tally[v.tier] ?? 0) + 1;
      const mark = v.tier === 'auto-remove' ? '✓' : v.tier === 'needs-human' ? '?' : '·';
      console.log(`${mark} ${String(i + 1).padStart(5)}  ${String(v.words).padStart(5)} واژه  ${v.title}` +
        (v.flags.length ? `  [${v.flags.join('، ')}]` : ''));
    } catch (e) {
      console.log(`  ! ${w.title}: ${(e as Error).message}`);
    }
  }
  console.log('\nنتیجه:', JSON.stringify(tally));
}

if (isMain(import.meta.url)) {
  main().catch(e => { console.error(e); process.exit(1); });
}
