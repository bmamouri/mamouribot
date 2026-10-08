/**
 * وظیفهٔ ۱۴ — درج {{جمعیت ایران}} در مقاله‌های آبادی‌های ایران.
 *
 * `{{جمعیت ایران}}` is a Wikidata-fed census trend box: `پودمان:جمعیت ایران` reads the
 * article's own item, collects every P1082 qualified with P585, maps each year to its
 * Jalali census label (2006→۱۳۸۵، 2011→۱۳۹۰، 2016→۱۳۹۵) and emits a centred
 * `{{جمعیت تاریخی}}` table. **No number travels in the edit.** The bot places a tag;
 * the data was imported, audited (154,330 values, 0 missing, 0 differing) and lives
 * upstream. See `scripts/population/` in the parent repository.
 *
 * Three shapes of article, measured on a random 400 of the 16,962 candidates:
 *
 *     89.5%  «== جمعیت ==» exists, no box            → insert under the heading
 *      6.3%  a hand-written {{جمعیت تاریخی}} box     → REPLACE it
 *      4.0%  no population section at all            → create one
 *      0.2%  already carries {{جمعیت ایران}}         → skip
 *
 * WHY THE REPLACEMENT NEEDS A PROOF, NOT A RULE. Those hand-written boxes are the only
 * machine-readable copy of some figures: until ۸ اکتبر ۲۰۲۶ Wikidata held ۱۳۸۵ and ۱۳۹۵
 * only, while 92% of the boxes also showed ۱۳۹۰, so replacing one silently deleted a
 * sourced census row. ۱۳۹۰ has since been imported, but "the data is there now" is a
 * claim about a population, not about the article in hand — a box may carry ۱۳۷۵ or a
 * figure that disagrees with the SCI file. So `verify()` renders the proposed wikitext
 * and refuses the save unless **every (year, value) pair** the old box showed survives
 * in the new render. A box that would lose a row is reported, never guessed around.
 * (`lessons/scripts-and-batch/never-wholesale-replace-article.md`,
 *  `scripts/population/1390-CENSUS-GAP.md`.)
 *
 * WHY THE HEADING MATCH IS NOT `/== جمعیت ==/`. «== جمعیّت ==» with a shadda is a real
 * variant and is visually near-identical; «== جمعیت‌شناسی ==» and «== [[جمعیت]] ==» are
 * population sections too. Creating a section on an article that already has one under a
 * variant gives it TWO population sections. So the heading test accepts the shadda, and
 * anything population-ish that is not an exact heading is REPORTED rather than treated as
 * "no section".
 *
 * WHY THE TITLES COME FROM `wbgetentities` AND NOT FROM WDQS. WDQS `schema:name` strips
 * U+200C: a SPARQL pass returned 0 of 17,271 titles containing a ZWNJ, where the API gives
 * 58 in 400. Every stripped title 404s, which surfaced as "14% of candidates missing" —
 * a believable number. Do not optimise this into one SPARQL query.
 */
import { BOT_UA, type Bot, type BotTask } from '../../core.js';
import { checkWikitext } from '../../lib/gates.js';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

const WDQS = 'https://query.wikidata.org/sparql';
const WD_API = 'https://www.wikidata.org/w/api.php';

export const TEMPLATE = '{{جمعیت ایران}}';
export const HIST_TEMPLATE = 'جمعیت تاریخی';
export const REPORT_PAGE = 'کاربر:MamouriBot/وظیفه ۱۴/گزارش';

/** Census years the module knows how to render, newest last. */
export const CENSUS_YEARS = [1385, 1390, 1395];

/** Sections that conventionally follow the body; a new «== جمعیت ==» goes before them. */
const TAIL_HEADINGS = [
  'جستارهای وابسته', 'نگارخانه', 'یادداشت‌ها', 'یادداشت', 'پانویس', 'پانویس‌ها',
  'منابع', 'منبع', 'پیوند به بیرون', 'پیوندهای بیرونی',
];

/** «جمعیت» with or without the shadda on the ی. Both occur in live headings. */
const JAMIAT = 'جمعیّ?ت';
/** The exact heading the box belongs under. */
const POP_HEADING = new RegExp(`^==[ \\t]*${JAMIAT}[ \\t]*==[ \\t]*$`, 'm');
/** Any heading that is about population but is NOT the exact one — never auto-created over. */
const POP_ISH_HEADING = new RegExp(`^=+[ \\t]*\\[*[ \\t]*${JAMIAT}[^=\\n]*=+[ \\t]*$`, 'm');

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
/** Normalise Persian/Arabic-Indic digits to ASCII and drop thousands separators. */
export function latinDigits(s: string): string {
  return s.replace(/[۰-۹٠-٩]/g, c => {
    const i = PERSIAN_DIGITS.indexOf(c);
    return String(i >= 0 ? i : ARABIC_DIGITS.indexOf(c));
  }).replace(/[,٬،]/g, '');
}

/**
 * Brace-balanced locator for `{{<name>…}}`.
 *
 * A regex capture would stop at the first `}}`, which on a box holding a nested template
 * eats the wrong closer and leaves a stray `}}` in the article
 * (`lessons/scripts-and-batch/regex-value-capture-eats-closing-braces.md`).
 */
export function findTemplate(text: string, name: string): { start: number; end: number; body: string } | null {
  const open = new RegExp(`\\{\\{[ \\t]*${name}[ \\t]*(?=[|}])`, 'g');
  const m = open.exec(text);
  if (!m) return null;
  let depth = 0;
  for (let i = m.index; i < text.length; i++) {
    if (text.startsWith('{{', i)) { depth++; i++; }
    else if (text.startsWith('}}', i)) {
      depth--; i++;
      if (depth === 0) return { start: m.index, end: i + 1, body: text.slice(m.index, i + 1) };
    }
  }
  return null;   // unbalanced — treat as "not found" rather than cutting the article
}

/** Split a template body on its TOP-LEVEL pipes, ignoring nested templates and links. */
function splitArgs(body: string): string[] {
  const inner = body.slice(2, -2);
  const out: string[] = [];
  let depth = 0, cur = '';
  for (let i = 0; i < inner.length; i++) {
    if (inner.startsWith('{{', i) || inner.startsWith('[[', i)) { depth++; cur += inner.slice(i, i + 2); i++; continue; }
    if (inner.startsWith('}}', i) || inner.startsWith(']]', i)) { depth--; cur += inner.slice(i, i + 2); i++; continue; }
    if (inner[i] === '|' && depth === 0) { out.push(cur); cur = ''; continue; }
    cur += inner[i];
  }
  out.push(cur);
  return out;
}

export interface YearValue { year: number; value: number }

/**
 * The (year, population) pairs a hand-written `{{جمعیت تاریخی}}` shows.
 *
 * The template is positional — `{{جمعیت تاریخی|۱۳۸۵|۸۲۴|۱۳۹۰|۸۰۶|align=center}}` — so
 * named arguments are dropped and the rest read in pairs. A pair that is not
 * year+number is returned as `NaN`, which the caller treats as "cannot prove", not as
 * "nothing there".
 */
export function parseHistorical(body: string): YearValue[] {
  const args = splitArgs(body).slice(1).filter(a => !/^[^|=]*=/.test(a)).map(a => a.trim());
  const out: YearValue[] = [];
  for (let i = 0; i + 1 < args.length; i += 2) {
    const year = Number(latinDigits(args[i]));
    const value = Number(latinDigits(args[i + 1]));
    if (!args[i] && !args[i + 1]) continue;
    out.push({ year, value });
  }
  return out;
}

export type Kind =
  | 'has-template'        // already done
  | 'insert'              // exact heading, no box
  | 'replace'             // hand-written box to swap for the Wikidata-fed one
  | 'create'              // no population heading at all
  | 'ambiguous-heading'   // a population-ish heading that is not the exact one
  | 'no-place';           // nowhere safe to create a section

export interface Classification { kind: Kind; text: string; old?: YearValue[] }

/** Decide what, if anything, this article needs. Pure. */
export function classify(text: string): Classification {
  if (/\{\{[ \t]*جمعیت ایران[ \t]*[|}]/.test(text)) return { kind: 'has-template', text };

  const hist = findTemplate(text, HIST_TEMPLATE);
  if (hist) {
    return {
      kind: 'replace',
      old: parseHistorical(hist.body),
      text: text.slice(0, hist.start) + TEMPLATE + text.slice(hist.end),
    };
  }

  const h = POP_HEADING.exec(text);
  if (h) {
    const at = h.index + h[0].length;
    return { kind: 'insert', text: text.slice(0, at) + '\n' + TEMPLATE + text.slice(at) };
  }

  if (POP_ISH_HEADING.test(text)) return { kind: 'ambiguous-heading', text };

  // No population section anywhere: create one, immediately before the first
  // conventional tail section so it lands at the end of the body rather than after
  // the references.
  const tail = new RegExp(`^==[ \\t]*(?:${TAIL_HEADINGS.join('|')})[ \\t]*==[ \\t]*$`, 'm').exec(text);
  if (!tail) return { kind: 'no-place', text };
  return {
    kind: 'create',
    text: text.slice(0, tail.index) + `== جمعیت ==\n${TEMPLATE}\n\n` + text.slice(tail.index),
  };
}

/** Titles the task declined to touch, published by report(). */
export interface Refusal { title: string; why: string }
const refusals: Refusal[] = [];
export const _resetRefusals = () => { refusals.length = 0; };

/** Persian digits — the report is read by humans on fa.wikipedia. */
const fa = (n: number) => String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[+d]);

/** The Persian report of everything the task refused to touch. Pure, so it is tested. */
export function reportWikitext(rows: Refusal[]): string {
  const byWhy = new Map<string, string[]>();
  for (const r of rows) byWhy.set(r.why, [...(byWhy.get(r.why) ?? []), r.title]);
  const lines = [
    'این صفحه را ربات [[کاربر:MamouriBot|MamouriBot]] در هر اجرای '
      + '[[ویکی‌پدیا:سیاست ربات‌رانی/درخواست مجوز/MamouriBot/وظیفه ۱۴|وظیفهٔ ۱۴]] به‌روز می‌کند.',
    '',
    'مقاله‌های زیر نامزد درج <nowiki>{{جمعیت ایران}}</nowiki> بودند ولی ربات دست به آن‌ها نزد، '
      + 'چون درست‌بودن ویرایش قطعی نبود. هر مورد نیاز به بررسی انسانی دارد.',
    '',
    `آخرین به‌روزرسانی: ~~~~~ — ${fa(rows.length)} مورد.`,
    '',
  ];
  for (const [why, list] of [...byWhy].sort((a, b) => b[1].length - a[1].length)) {
    lines.push(`== ${why} (${fa(list.length)}) ==`, '');
    for (const t of [...list].sort((a, b) => a.localeCompare(b, 'fa'))) lines.push(`* [[${t}]]`);
    lines.push('');
  }
  return lines.join('\n');
}

const KIND_LABEL: Partial<Record<Kind, string>> = {
  'ambiguous-heading': 'بخش جمعیت با عنوانی غیر از «جمعیت» دارد (مثلاً «جمعیت‌شناسی» یا عنوان پیونددار)',
  'no-place': 'جای مطمئنی برای افزودن بخش جمعیت پیدا نشد',
};

/**
 * Candidate articles: Wikidata items carrying a census population, resolved to their
 * fawiki sitelink through the API. See the file header on why not WDQS.
 */
async function getTargets(bot: Bot): Promise<string[]> {
  // The candidate list is FROZEN to disk on first build, beside the resume checkpoint.
  //
  // Not an optimisation. Resolving 16,594 sitelinks is ~332 `wbgetentities` calls, each
  // carrying maxlag=5, and Wikidata is routinely lagged enough that the enumeration alone
  // ran past half an hour — before a single page was read. A Toolforge job that is killed
  // and rescheduled would pay that again every time, and the list is the same list: the
  // candidate set changes only when someone imports more census data.
  //
  // Delete the file to rebuild.
  const cache = join(process.env.BOT_STATE_DIR ?? '.state', 'population-box.targets.txt');
  if (existsSync(cache)) {
    const rows = readFileSync(cache, 'utf8').split('\n').map(s => s.trim()).filter(Boolean);
    console.log(`فهرست نامزدها از ${cache} خوانده شد: ${rows.length} مقاله`);
    return rows;
  }

  const qids = await populationItems();
  console.log(`${qids.length} آیتم روستا با جمعیت سرشماری؛ عنوان مقاله‌ها از ویکی‌داده گرفته می‌شود`);
  const titles: string[] = [];
  for (let i = 0; i < qids.length; i += 50) {
    const d = await bot.apiGetOn(WD_API, {
      action: 'wbgetentities', ids: qids.slice(i, i + 50).join('|'),
      props: 'sitelinks', sitefilter: 'fawiki',
    });
    for (const e of Object.values<any>(d.entities ?? {})) {
      const t = e?.sitelinks?.fawiki?.title;
      if (t) titles.push(t);
    }
    if (i % 2000 === 0) console.log(`  ${i}/${qids.length} آیتم، ${titles.length} مقاله`);
  }
  mkdirSync(dirname(cache), { recursive: true });
  writeFileSync(cache, titles.join('\n') + '\n');
  console.log(`فهرست نامزدها ساخته شد: ${titles.length} مقاله → ${cache}`);
  return titles;
}

/**
 * QIDs of VILLAGE items carrying a census population AND an fa article.
 * Only identifiers cross this wire — see the header on why titles do not.
 *
 * `wdt:P31 wd:Q532` (village) is the scope limit, and it is load-bearing rather than
 * decorative: the census import is keyed on P1010 (آبادی code), and provinces, counties
 * and cities carry one too. Without the filter the candidate set is 17,048 and opens on
 * «تهران» and «استان اردبیل»; with it, 16,594 — all villages, which is the scope the
 * permission asks for. Cities and higher divisions are a later, separately-argued phase.
 * Counted live on ۸ اکتبر ۲۰۲۶.
 */
export async function populationItems(): Promise<string[]> {
  const q = `SELECT DISTINCT ?item WHERE {
    ?item wdt:P1010 ?code ; p:P1082 ?st ; wdt:P31 wd:Q532 .
    ?st pq:P585 ?when .
    ?art schema:about ?item ; schema:isPartOf <https://fa.wikipedia.org/> .
  }`;
  // WDQS drops slow connections; a task-11 trial lost twenty minutes of
  // enumeration to one UND_ERR_CONNECT_TIMEOUT. Retry with backoff.
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(`${WDQS}?format=json&query=${encodeURIComponent(q)}`, {
        headers: { 'User-Agent': BOT_UA, Accept: 'application/sparql-results+json' },
        signal: AbortSignal.timeout(180_000),
      });
      if (!res.ok) throw new Error(`WDQS ${res.status}`);
      const j: any = await res.json();
      return j.results.bindings.map((b: any) => String(b.item.value).replace(/.*\//, ''));
    } catch (e) {
      if (attempt === 3) throw e;
      await new Promise(r => setTimeout(r, 5000 * (attempt + 1)));
    }
  }
}

export const populationBoxTask: BotTask = {
  id: 'population-box',
  taskNumber: 14,
  summary: 'درج جدول روند جمعیت بر پایهٔ داده‌های سرشماری مرکز آمار ایران (از ویکی‌داده)',
  description:
    'افزودن {{جمعیت ایران}} به مقاله‌های آبادی‌های ایران. این الگو جدول روند جمعیت را از ویکی‌داده می‌خواند ' +
    '(سرشماری‌های ۱۳۸۵، ۱۳۹۰ و ۱۳۹۵ مرکز آمار ایران) و هیچ عددی در ویرایش جابه‌جا نمی‌شود. ' +
    'اگر مقاله «== جمعیت ==» داشته باشد الگو زیر همان عنوان درج می‌شود؛ اگر جدول دستی {{جمعیت تاریخی}} داشته باشد ' +
    'جای آن می‌نشیند، ولی فقط وقتی ربات اثبات کند همهٔ سال‌ها و عددهای جدول قبلی در جدول تازه هم نمایش داده می‌شوند؛ ' +
    'اگر هیچ بخش جمعیتی نداشته باشد بخش تازه‌ای پیش از بخش‌های پایانی ساخته می‌شود. ' +
    'عنوان‌های جمعیتیِ غیرمعمول و مواردی که جای مطمئنی برایشان نیست دست‌نخورده می‌مانند و گزارش می‌شوند.',

  getTargets,

  transform(text: string, title: string) {
    const c = classify(text);
    if (c.kind === 'has-template') return { text, changed: false, note: 'از پیش {{جمعیت ایران}} دارد' };
    if (c.kind === 'ambiguous-heading' || c.kind === 'no-place') {
      refusals.push({ title, why: KIND_LABEL[c.kind]! });
      return { text, changed: false, note: KIND_LABEL[c.kind], manualReview: true };
    }
    return { text: c.text, changed: true, note: c.kind };
  },

  /**
   * The deletion proof. Only a `replace` removes anything, and what it removes is the
   * only machine-readable copy of those figures, so the save is allowed only once the
   * NEW wikitext has been rendered and shown to contain every (year, value) the old box
   * displayed. The built-in render guard cannot do this: it counts error markers, and a
   * box that quietly loses a row raises none.
   */
  async verify(bot: Bot, title: string, oldText: string, newText: string) {
    // The publish gate, as a DELTA. Run whole, it fails on defects the article already
    // had and that this task is not allowed to fix; what matters is that the inserted
    // line introduces none (as in وظیفهٔ ۱۰ and ۱۲).
    const had = new Set(checkWikitext(title, oldText));
    const fresh = checkWikitext(title, newText).filter(p => !had.has(p));
    if (fresh.length) {
      refusals.push({ title, why: 'دروازهٔ انتشار ایراد گرفت: ' + fresh.join('؛ ') });
      return { ok: false, detail: 'دروازه: ' + fresh.join('؛ ') };
    }

    const c = classify(oldText);
    if (c.kind !== 'replace') return { ok: true, detail: '' };

    const old = c.old ?? [];
    if (!old.length || old.some(p => !Number.isFinite(p.year) || !Number.isFinite(p.value))) {
      refusals.push({ title, why: 'جدول دستی به‌شکل غیرمنتظره‌ای نوشته شده و خوانده نشد' });
      return { ok: false, detail: 'جدول دستی خوانده نشد' };
    }

    const r = await bot.apiPost({
      action: 'parse', title, text: newText, contentmodel: 'wikitext',
      prop: 'text', disablelimitreport: '1',
    });
    const rendered = latinDigits(String(r.parse?.text ?? '').replace(/<[^>]+>/g, ' '));

    const lost = old.filter(p => !new RegExp(`\\b${p.year}\\b[\\s\\S]{0,120}?\\b${p.value}\\b`).test(rendered));
    if (lost.length) {
      const why = 'جدول تازه این سال‌ها را نشان نمی‌دهد: ' + lost.map(p => `${p.year}=${p.value}`).join('، ');
      refusals.push({ title, why });
      return { ok: false, detail: why };
    }
    return { ok: true, detail: `${old.length} ردیف جدول دستی در جدول تازه هم هست` };
  },

  /**
   * Publish what was refused. A task that declines work silently is indistinguishable
   * from one with nothing to do, and these refusals — a box that would lose a row, an
   * article with an unusual population heading — are exactly the part a human must act on.
   */
  async report(bot: Bot, dryRun: boolean) {
    if (!refusals.length) return;
    const text = reportWikitext(refusals);
    if (dryRun) {
      console.log(`\n--- گزارش بازبینی (آزمایشی، ${refusals.length} مورد) ---\n${text}`);
      return;
    }
    const cur = await bot.apiGet({
      action: 'query', prop: 'revisions', titles: REPORT_PAGE,
      rvprop: 'content|ids|timestamp', rvslots: 'main',
    });
    const p = cur.query.pages[0];
    await bot.edit(REPORT_PAGE, text, 'به‌روزرسانی فهرست موارد نیازمند بازبینی',
      p.missing ? 0 : p.revisions[0].revid, p.missing ? '' : p.revisions[0].timestamp,
      { allowCreate: true });
    console.log(`گزارش منتشر شد: ${REPORT_PAGE} (${refusals.length} مورد)`);
  },
};
