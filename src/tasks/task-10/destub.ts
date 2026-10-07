/**
 * MamouriBot — remove stub tags from articles that are no longer stubs.
 *
 * Raised by Tisfoon on بحث کاربر:Mamouri: fa.wikipedia has ~710,000 articles in
 * رده:همه مقاله‌های خرد, and many were stubs only when they were created.
 *
 * Pipeline (each phase is its own file, because only the last one writes):
 *   destub-inventory.ts   which templates are stub tags          (read-only)
 *   destub-classify.ts    which articles are no longer stubs     (read-only)
 *   destub.ts             remove the tag                         (this file)
 *
 * The verdict is computed in destub-classify.ts and merely looked up here,
 * because `BotTask.transform()` is synchronous and pure while the prose metric
 * needs `action=parse`.
 *
 * THE EDIT IS A DELETION, WHICH CHANGES WHAT COUNTS AS VERIFICATION
 * -----------------------------------------------------------------
 * Every automated check this repo has is built to notice something BREAKING.
 * A deletion breaks nothing: remove half an article and it renders perfectly,
 * reports zero errors and sits in no tracking category. That is precisely how
 * ~190 articles lost prose, refs and categories once already
 * (lessons/scripts-and-batch/never-wholesale-replace-article.md). So this task
 * proves its edit three times over rather than checking it:
 *
 *   1. reconstruction — re-inserting exactly what was removed must restore the
 *      original byte for byte, so the edit provably touched nothing else;
 *   2. category diff   — the categories lost must be exactly the ones the
 *      removed tags emit, and NO category may be gained;
 *   3. text diff       — the only rendered text that may disappear is the stub
 *      banner's own sentence.
 */
import type { Bot, BotTask } from '../../core.js';
import { templateCalls, checkWikitext } from '../../lib/gates.js';
import {
  loadInventory, normTemplateName, expectedCats, ALL_STUBS_CAT,
  type Inventory,
} from './destub-inventory-lib.js';
import { CLASSIFIED_PATH, type Verdict } from './destub-classify.js';
import { ALLOWLIST_PAGE, parseAllowlist } from './destub-report.js';
import { readFileSync, existsSync } from 'fs';

/** Populated in getTargets; transform() only reads it. */
let inventory: Inventory | null = null;
const inv = () => (inventory ??= loadInventory());

/** test seam: let the unit tests supply an inventory without the network */
export const seedInventory = (i: Inventory) => { inventory = i; };

// ---------------------------------------------------------------------------
// finding the tags
// ---------------------------------------------------------------------------

export interface StubScan {
  /** top-level, non-opaque stub tags — the ones that may be removed */
  spans: { start: number; end: number; canonical: string; firstArg?: string }[];
  /** why the article must be left to a human; empty means it is safe to edit */
  refusals: string[];
}

/**
 * A name that is shaped like a stub tag. Used ONLY to notice tags the inventory
 * does not know about, never to decide that something IS a stub tag — 76 of the
 * real stub templates do not end in «-خرد», and «الگو:بخش خرد» does end that way
 * while not being an article stub at all. Membership is the inventory's job.
 */
const STUB_SHAPED = /(?:^|[-\s‌])خرد$|-ناقص$/;

export function scanStubs(text: string, inventory: Inventory): StubScan {
  const spans: StubScan['spans'] = [];
  const refusals: string[] = [];

  const top = templateCalls(text, { topLevelOnly: true, mask: true });
  for (const c of top) {
    const key = normTemplateName(c.name);
    const canonical = inventory.index[key];
    if (canonical) {
      const firstArg = c.args.find(a => !a.includes('='))?.trim();
      spans.push({ start: c.start, end: c.end, canonical, firstArg });
    } else if (STUB_SHAPED.test(key)) {
      // Looks like a stub tag but is not in the inventory: either a redirect
      // created since the inventory was built, or a red template. Either way the
      // category assert could not be computed for it, and removing it would
      // leave the article in a stub category the bot cannot account for.
      refusals.push(`الگوی خردمانند ناشناخته: {{${c.name}}}`);
    }
  }

  // A stub tag that is NOT top-level, or that sits inside a comment/<nowiki>,
  // must not be excised: the first would edit another template's argument, the
  // second would delete text the reader never sees. Both are rare and both are
  // judgement calls, so the article goes to a human rather than being half-done.
  const all = templateCalls(text, { topLevelOnly: false, mask: false });
  const topKeys = new Set(spans.map(s => `${s.start}:${s.end}`));
  for (const c of all) {
    if (topKeys.has(`${c.start}:${c.end}`)) continue;
    const key = normTemplateName(c.name);
    if (inventory.index[key] || STUB_SHAPED.test(key)) {
      refusals.push(`الگوی خرد در جای نامناسب (تودرتو یا درون یادداشت): {{${c.name}}}`);
    }
  }

  return { spans, refusals };
}

// ---------------------------------------------------------------------------
// the excision
// ---------------------------------------------------------------------------

/** One recorded splice, kept so the edit can be proved reversible. */
interface Splice { at: number; removed: string; inserted: string }

/**
 * Remove one span, widening to the whole line when the tag owns its line, and
 * repairing ONLY the blank lines the removal itself created.
 *
 * Deliberately not a whitespace tidy-up. Normalising whitespace across the page
 * is what turns "removed a tag" into "rewrote the page": it buries the real
 * change in a diff full of noise, and it defeats the reconstruction proof. A
 * pre-existing blank-line violation is left exactly as it was found — fixing it
 * would be an unrelated cosmetic change riding along in a bot edit.
 */
function exciseSpan(text: string, start: number, end: number): Splice {
  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  let lineEnd = text.indexOf('\n', end);
  if (lineEnd < 0) lineEnd = text.length;
  const ownsLine = text.slice(lineStart, start).trim() === ''
    && text.slice(end, lineEnd).trim() === '';

  if (!ownsLine) {
    // Inline: the tag shares its line with real content, so take the tag and
    // nothing else — then close the gap if it leaves two spaces where one
    // belongs.
    let a = start, b = end;
    const spaceBefore = a > 0 && text[a - 1] === ' ';
    const spaceAfter = b < text.length && text[b] === ' ';
    if (spaceBefore && spaceAfter) a -= 1;
    return { at: a, removed: text.slice(a, b), inserted: '' };
  }

  const a = lineStart;
  const b = lineEnd < text.length ? lineEnd + 1 : lineEnd;

  // Newline runs on either side of the cut, which the cut is about to join.
  let pre = 0;
  while (a - 1 - pre >= 0 && text[a - 1 - pre] === '\n') pre++;
  let post = 0;
  while (b + post < text.length && text[b + post] === '\n') post++;

  const from = a - pre, to = b + post;
  // At either end of the page there is nothing to join, so keep nothing —
  // otherwise the page is left opening or closing on a blank line. MediaWiki
  // strips trailing whitespace on save anyway.
  const inserted = (from === 0 || to === text.length)
    ? ''
    : '\n'.repeat(Math.min(2, Math.max(pre, post)));

  return { at: from, removed: text.slice(from, to), inserted };
}

const applySplice = (text: string, s: Splice) =>
  text.slice(0, s.at) + s.inserted + text.slice(s.at + s.removed.length);

const undoSplice = (text: string, s: Splice) =>
  text.slice(0, s.at) + s.removed + text.slice(s.at + s.inserted.length);

/**
 * Cut each tag out of the text as it stands after the previous cut, working
 * right to left.
 *
 * Computing every cut against the ORIGINAL text and applying them together looks
 * equivalent and is not: two stub tags on consecutive lines each claim the
 * newline between them, the two ranges overlap by that one character, and the
 * result is silent corruption. (The reconstruction proof below caught exactly
 * that during development, which is the argument for having it.) Splicing
 * sequentially from the right means each cut sees the real neighbouring
 * whitespace and no two cuts can overlap.
 */
function exciseAll(text: string, spans: { start: number; end: number }[]): { out: string; splices: Splice[] } {
  let out = text;
  const splices: Splice[] = [];
  for (const s of [...spans].sort((a, b) => b.start - a.start)) {
    const sp = exciseSpan(out, s.start, s.end);
    out = applySplice(out, sp);
    splices.push(sp);   // recorded in application order
  }
  return { out, splices };
}

/**
 * The proof that the edit is surgical: put back exactly what was taken out and
 * the original must return byte for byte. An edit that fails this is a rewrite
 * wearing a diff's clothing, however small the diff looks.
 *
 * Undone in reverse order of application: each cut shifted everything after it,
 * so only the most recent one is at a still-valid offset.
 */
function reconstructs(original: string, edited: string, splices: Splice[]): boolean {
  let out = edited;
  for (const s of [...splices].reverse()) out = undoSplice(out, s);
  return out === original;
}

/**
 * Problems present in the edited text that were not present before. Compared by
 * the audit's message prefix rather than the whole string, because most audit
 * messages embed the offending snippets and those shift as soon as anything
 * moves.
 */
export function newProblems(oldText: string, newText: string): string[] {
  const key = (p: string) => p.split(':')[0];
  const had = new Set(checkWikitext('', oldText).map(key));
  return checkWikitext('', newText).filter(p => !had.has(key(p)));
}

export interface RemovalResult {
  text: string;
  changed: boolean;
  note?: string;
  manualReview?: boolean;
  /** the tags actually taken out, for the category assert */
  removed: { canonical: string; firstArg?: string }[];
}

export function removeStubTags(text: string, inventory: Inventory): RemovalResult {
  const { spans, refusals } = scanStubs(text, inventory);

  // Refuse rather than edit partially. A half-removal leaves the article in
  // رده:همه مقاله‌های خرد, so the save gate would reject it anyway; refusing here
  // costs two fewer round-trips and files the page for a human instead.
  if (refusals.length) {
    return { text, changed: false, manualReview: true, note: refusals.join('؛ '), removed: [] };
  }
  if (!spans.length) {
    return { text, changed: false, note: 'برچسب خردی یافت نشد', removed: [] };
  }

  const { out, splices } = exciseAll(text, spans);

  if (!reconstructs(text, out, splices)) {
    return { text, changed: false, manualReview: true,
      note: 'برش برگشت‌پذیر نیست — ویرایش انجام نشد', removed: [] };
  }
  // Gate on what the EDIT introduced, not on what the article already had.
  // Run against the whole battery and an untouched article fails immediately:
  // «—» appears in ordinary prose, unbalanced comments and malformed citations
  // are everywhere, and none of it is this edit's doing. A gate that fires on
  // pre-existing conditions the caller cannot fix is a gate that gets switched
  // off, so only the delta is blocking.
  const introduced = newProblems(text, out);
  if (introduced.length) {
    return { text, changed: false, manualReview: true,
      note: `دروازه: ${introduced.join('؛ ')}`, removed: [] };
  }

  return {
    text: out, changed: true,
    removed: spans.map(s => ({ canonical: s.canonical, firstArg: s.firstArg })),
    note: spans.map(s => s.canonical.replace(/^الگو:/, '')).join('، '),
  };
}

// ---------------------------------------------------------------------------
// per-edit proof
// ---------------------------------------------------------------------------

/**
 * The Asbox banner, the only rendered text this edit may remove. It renders as
 * «این یک مقالهٔ خرد مرتبط با <موضوع> است. می‌توانید با گسترش آن به ویکی‌پدیا
 * کمک کنید.» — TWO sentences, which the chunker below splits apart. Matching it
 * as a single pattern refused every edit, including all six articles the metric
 * had just certified, so both halves are listed.
 */
// No `\b` anywhere: in JavaScript a word boundary is defined on ASCII word
// characters, so «یک\b» never matches between two Persian letters and the
// pattern silently fails on every real page.
const STUB_SENTENCE = [
  /^این\s+یک\s.*خرد/,
  /گسترش.*کمک\s*کنید/,
];
const isBannerText = (s: string) => STUB_SENTENCE.some(re => re.test(s));

const stripTags = (html: string) =>
  html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ').trim();

/**
 * Delete whole elements carrying any of `classes`, subtree and all.
 *
 * Depth-aware rather than a regex: the stub banner is a `<div class="… asbox">`
 * wrapping a `<table>`, and `<div[^>]*asbox[^>]*>[\s\S]*?</div>` would close on
 * the first inner `</div>` and leave the banner's text behind.
 */
function removeSubtreesByClass(html: string, classes: Set<string>): string {
  const out: string[] = [];
  const stack: { tag: string; dropped: boolean }[] = [];
  let dropDepth = 0, last = 0;
  const re = /<\/?([a-zA-Z][a-zA-Z0-9]*)((?:"[^"]*"|'[^']*'|[^>"'])*)\/?>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (dropDepth === 0) out.push(html.slice(last, m.index));
    last = re.lastIndex;
    const tag = m[1].toLowerCase();

    if (m[0][1] === '/') {
      let endsDropped = false;
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].tag !== tag) continue;
        for (let j = stack.length - 1; j >= i; j--) {
          if (stack[j].dropped) { dropDepth--; endsDropped = true; }
        }
        stack.length = i;
        break;
      }
      // The surviving markup must stay markup: an earlier version pushed only
      // the text between tags, which deleted every `<style>` wrapper and left
      // its CSS behind as "text". The caller then read that CSS as lost article
      // prose and refused all ten articles tested.
      if (dropDepth === 0 && !endsDropped) out.push(m[0]);
      continue;
    }

    const cls = (m[2].match(/class\s*=\s*"([^"]*)"/i)?.[1] ?? '').toLowerCase().split(/\s+/);
    const dropped = cls.some(c => classes.has(c));
    if (m[0].endsWith('/>') || VOID_TAGS.has(tag)) {
      if (dropDepth === 0 && !dropped) out.push(m[0]);
      continue;
    }
    if (dropped) dropDepth++;
    else if (dropDepth === 0) out.push(m[0]);
    stack.push({ tag, dropped });
  }
  if (dropDepth === 0) out.push(html.slice(last));
  return out.join('');
}

const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr']);

/**
 * Text present before the edit and absent after it, once the stub banner is
 * taken out of the "before" side. Anything this reports is content the edit
 * destroyed.
 *
 * The obvious implementation — split both renders into sentences and look for
 * chunks that disappeared — does NOT work, and failed on 16 of the first 20
 * live articles. Removing the banner changes how neighbouring elements join, so
 * chunk boundaries shift and perfectly intact text stops matching verbatim:
 * navbox bars («ن ب و …»), section edit links, and CS1 maintenance notes all got
 * reported as "vanished" when nothing had happened to them.
 *
 * So the banner is excised structurally instead, and what remains must match
 * word for word. That compares like with like and is insensitive to whitespace
 * and element joins.
 */
export function nonBannerTextLost(beforeHtml: string, afterHtml: string): string[] {
  const words = (h: string) => stripTags(h).split(/\s+/).filter(Boolean);
  const before = words(removeSubtreesByClass(beforeHtml, new Set(['asbox'])));
  const after = words(afterHtml);

  // Multiset difference: words the edit removed beyond the banner.
  const pool = new Map<string, number>();
  for (const w of after) pool.set(w, (pool.get(w) ?? 0) + 1);
  const lost: string[] = [];
  for (const w of before) {
    const n = pool.get(w) ?? 0;
    if (n > 0) pool.set(w, n - 1); else lost.push(w);
  }
  if (!lost.length) return [];

  // Anything left that is still banner wording is a leftover of a SECOND stub
  // tag whose wrapper markup differed; not a loss.
  const joined = lost.join(' ');
  if (isBannerText(joined)) return [];
  return [joined];
}

async function parseSupplied(bot: Bot, title: string, text: string) {
  const r = await bot.apiPost({ action: 'parse', title, text, contentmodel: 'wikitext',
    prop: 'text|categories', disablelimitreport: '1' });
  return {
    html: r.parse?.text ?? '',
    cats: new Set<string>((r.parse?.categories ?? []).map((c: any) => String(c.category).replace(/_/g, ' '))),
  };
}

/**
 * Prove the edit removed the stub tags and nothing else. Parses the supplied
 * text on both sides — nothing is saved by a parse — and compares.
 */
export async function verifyRemoval(
  bot: Bot, title: string, oldText: string, newText: string,
  removed: { canonical: string; firstArg?: string }[], inventory: Inventory,
): Promise<{ ok: boolean; detail: string }> {
  const before = await parseSupplied(bot, title, oldText);
  const after = await parseSupplied(bot, title, newText);

  const gained = [...after.cats].filter(c => !before.cats.has(c));
  if (gained.length) return { ok: false, detail: `ردهٔ تازه افزوده شد: ${gained.join('، ')}` };

  const lost = [...before.cats].filter(c => !after.cats.has(c));
  if (!lost.includes(ALL_STUBS_CAT)) {
    return { ok: false, detail: `«${ALL_STUBS_CAT}» حذف نشد — برچسب خرد هنوز برجاست` };
  }
  // Subset, not equality: one tag may emit several topical categories, two tags
  // may share one, and a topical stub category can also arrive from a second
  // source. Demanding equality would refuse perfectly good edits.
  const explainable = new Set<string>([ALL_STUBS_CAT]);
  for (const r of removed) {
    const cats = expectedCats(inventory, r.canonical, r.firstArg);
    if (cats === null) {
      return { ok: false, detail: `ردهٔ الگوی {{${r.canonical}}} قابل تعیین نیست` };
    }
    for (const c of cats) explainable.add(c);
  }
  const unexplained = lost.filter(c => !explainable.has(c));
  if (unexplained.length) {
    return { ok: false, detail: `ردهٔ نامربوط حذف شد: ${unexplained.join('، ')}` };
  }

  const notBanner = nonBannerTextLost(before.html, after.html);
  if (notBanner.length) {
    return { ok: false, detail: `متنی جز پیام خرد ناپدید شد: «${notBanner[0].slice(0, 90)}»` };
  }

  // Cheap structural counts, unchanged by construction.
  const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;
  for (const [label, re] of [['رده', /\[\[\s*رده\s*:/g], ['یادکرد', /<ref[\s>\/]/g]] as const) {
    if (count(oldText, re) !== count(newText, re)) {
      return { ok: false, detail: `شمار ${label} تغییر کرد` };
    }
  }

  return { ok: true, detail: '' };
}

// ---------------------------------------------------------------------------
// the task
// ---------------------------------------------------------------------------

/** title → the tags transform() took out, handed to verify(). */
const removedByTitle = new Map<string, { canonical: string; firstArg?: string }[]>();

function loadVerdicts(): Map<string, Verdict> {
  const m = new Map<string, Verdict>();
  if (!existsSync(CLASSIFIED_PATH)) {
    throw new Error(`رده‌بندی انجام نشده است: ${CLASSIFIED_PATH}\n` +
      `اجرا کنید: npx tsx src/tasks/task-10/destub-classify.ts`);
  }
  for (const line of readFileSync(CLASSIFIED_PATH, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const v: Verdict = JSON.parse(line);
    m.set(v.title, v);
  }
  return m;
}

export const destubTask: BotTask = {
  id: 'destub',
  taskNumber: 10,
  summary: 'حذف برچسب خرد از مقاله‌ای که دیگر خرد نیست',
  description: 'حذف الگوهای خرد از مقاله‌هایی که به اندازهٔ کافی گسترش یافته‌اند',
  // A title parked as `deferred` (CS1 error, no <ref>, high Latin share, …) can
  // stop being true without the article itself being re-edited: someone fixes
  // the citation on a DIFFERENT page, or a later run of this very code carries
  // a corrected check. Without expiry such a title is skipped forever even
  // though destub-watch.ts keeps re-classifying it on every edit — the checkpoint
  // would silently outlive the condition it recorded. Same value notelist-missing
  // uses, which is the only other continuous task in this fleet; see
  // src/lib/checkpoint.ts and .claude/rules/bot.md.
  recheckAfterDays: 30,

  async getTargets(bot: Bot): Promise<string[]> {
    inv(); // fail fast on a missing or stale inventory
    const verdicts = loadVerdicts();

    // An editor who has looked at an article and judged it still a stub outranks
    // any measurement this bot can make. Read the allowlist EVERY run: the whole
    // point of the review page is that a human's answer takes effect.
    const r = await bot.apiGet({ action: 'query', prop: 'revisions', titles: ALLOWLIST_PAGE,
      rvprop: 'content', rvslots: 'main' });
    const pg = r.query.pages[0];
    const allow = pg.missing ? new Set<string>()
      : parseAllowlist(pg.revisions[0].slots.main.content);

    const targets = [...verdicts.values()]
      .filter(v => v.tier === 'auto-remove' && !allow.has(v.title))
      .sort((a, b) => b.words - a.words)   // most obviously-not-a-stub first
      .map(v => v.title);
    console.log(`نامزد حذف برچسب: ${targets.length} از ${verdicts.size} مقالهٔ بررسی‌شده` +
      (allow.size ? ` (${allow.size} عنوان در فهرست سفید)` : ''));
    return targets;
  },

  transform(text: string, title: string) {
    const r = removeStubTags(text, inv());
    if (r.changed) removedByTitle.set(title, r.removed);
    return { text: r.text, changed: r.changed, note: r.note, manualReview: r.manualReview };
  },

  async verify(bot, title, oldText, newText) {
    const removed = removedByTitle.get(title) ?? [];
    return verifyRemoval(bot, title, oldText, newText, removed, inv());
  },
};
