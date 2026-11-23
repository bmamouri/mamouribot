/**
 * وظیفهٔ ۲۰ — the value dictionary: an on-wiki table, read at one pinned revision.
 *
 * The table lives on fa.wikipedia so anyone can read and correct it. The bot never reads
 * the current version. It reads `oldid=<PIN>` from `data/pin.json`, and moving the pin is a
 * commit in this repository that only the operator makes — so an edit to the page changes
 * nothing until it has been reviewed, and git records which revision was approved and when.
 *
 * Page format: one wikitable, one row per entry, five cells:
 *
 *   {| class="wikitable"
 *   ! الگو !! پارامتر !! مقدار انگلیسی !! مقدار فارسی !! منبع
 *   |-
 *   | Infobox ecoregion || conservation || Critical/endangered || بحرانی/در معرض خطر || attested:19/20
 *   |}
 *
 * - الگو is the canonical fa template title without the namespace, or `*` for every template.
 *   For navbox group headings it is `ناوبری`.
 * - پارامتر is a parameter name, or a family written with `#` for the digits (`clubs#`).
 * - مقدار انگلیسی is matched case- and whitespace-insensitively against the WHOLE value.
 * - مقدار فارسی is inserted verbatim (it may contain wikitext, for example a link).
 *
 * A page that does not parse cleanly stops the run instead of losing rows: a duplicate key
 * with two Persian values, a row with the wrong number of cells, an empty cell, a Persian
 * value that still contains Latin letters with no link, or a `*` key that a template-specific
 * key would contradict.
 */
import pin from './data/pin.json' with { type: 'json' };
import type { Bot } from '../../core.js';

export const DICTIONARY_PAGE = 'ویکی‌پدیا:ربات/وظیفه ۲۰/واژه‌نامه';
export const NAVBOX_KEY = 'ناوبری';

export interface Entry { template: string; param: string; en: string; fa: string; source: string; row: number }

export interface Dictionary {
  revid: number;
  entries: Entry[];
  /** `${template}\t${paramFamily}\t${normalised en}` → entry */
  byKey: Map<string, Entry>;
}

/** How a value is compared: case, runs of whitespace, comments and outer `'''`/`''` ignored. */
export function normValue(v: string): string {
  return v.replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^('{2,3})([\s\S]*)\1$/, '$2')
    .replace(/[\s\u00a0_]+/g, ' ')
    .trim()
    .toLowerCase();
}

/** `clubs12` → `clubs#`, `subdivision_type2` → `subdivision_type#`, `group3` → `group#`. */
export function paramFamily(name: string): string {
  return name.trim().replace(/\d+/g, '#');
}

export function normTemplate(name: string): string {
  const t = name.replace(/[\s_]+/g, ' ').trim().replace(/^(?:template|الگو)\s*:\s*/i, '');
  return t ? t[0].toUpperCase() + t.slice(1) : t;
}

export const key = (template: string, param: string, en: string) =>
  `${normTemplate(template)}\t${paramFamily(param)}\t${normValue(en)}`;

export class DictionaryError extends Error {}

/** Parse the table. Throws DictionaryError listing every problem, never a partial result. */
export function parseDictionary(wikitext: string, revid: number): Dictionary {
  const problems: string[] = [];
  const entries: Entry[] = [];
  const tables = wikitext.match(/\{\|[\s\S]*?\n\|\}/g) ?? [];
  if (tables.length !== 1) problems.push(`باید دقیقاً یک جدول باشد، ${tables.length} پیدا شد`);
  const body = tables[0] ?? '';
  const rows = body.split(/\n\|-[^\n]*/).slice(1);
  rows.forEach((raw, i) => {
    const row = i + 1;
    const line = raw.replace(/\n\|\}\s*$/, '').trim();
    if (!line) return;
    if (!line.startsWith('|')) { problems.push(`ردیف ${row}: با «|» آغاز نمی‌شود`); return; }
    const cells = line.slice(1).split(/\s*\|\|\s*|\n\|\s*/).map(c => c.trim());
    if (cells.length !== 5) { problems.push(`ردیف ${row}: ${cells.length} خانه به‌جای ۵`); return; }
    const [template, param, en, fa, source] = cells;
    if (!template || !param || !en || !fa || !source) { problems.push(`ردیف ${row}: خانهٔ خالی`); return; }
    const faVisible = fa.replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, '$1').replace(/\[\[([^\]]*)\]\]/g, '$1');
    if (/[A-Za-z]{2,}/.test(faVisible)) problems.push(`ردیف ${row}: مقدار فارسی هنوز حروف لاتین دارد: ${fa}`);
    if (normValue(en) === normValue(fa)) problems.push(`ردیف ${row}: مقدار فارسی همان مقدار انگلیسی است`);
    entries.push({ template: template === '*' ? '*' : normTemplate(template), param: paramFamily(param), en, fa, source, row });
  });

  if (!entries.length && !problems.length) problems.push('جدول هیچ ردیفی ندارد');
  const byKey = new Map<string, Entry>();
  for (const e of entries) {
    const k = `${e.template}\t${e.param}\t${normValue(e.en)}`;
    const prev = byKey.get(k);
    if (prev && prev.fa !== e.fa) problems.push(`ردیف‌های ${prev.row} و ${e.row}: یک کلید با دو مقدار فارسی`);
    byKey.set(k, e);
  }
  for (const e of entries) {
    if (e.template !== '*') continue;
    for (const o of entries) {
      if (o.template !== '*' && o.param === e.param && normValue(o.en) === normValue(e.en) && o.fa !== e.fa) {
        problems.push(`ردیف ${e.row} (*) با ردیف ${o.row} (${o.template}) ناسازگار است`);
      }
    }
  }
  if (problems.length) throw new DictionaryError(`واژه‌نامه نسخهٔ ${revid} پذیرفته نشد:\n  - ${problems.join('\n  - ')}`);
  return { revid, entries, byKey };
}

/** The entry for one value, template-specific first, then `*`. */
export function lookup(d: Dictionary, template: string, param: string, value: string): Entry | undefined {
  return d.byKey.get(key(template, param, value)) ?? d.byKey.get(`*\t${paramFamily(param)}\t${normValue(value)}`);
}

/** The pinned revision. 0 means no revision is approved yet. `T20_PIN` overrides for a dry run. */
export function pinnedRevid(): number {
  const env = Number(process.env.T20_PIN ?? '');
  return Number.isFinite(env) && env > 0 ? env : (pin as { revid: number }).revid;
}

/** Read and parse the dictionary at the pinned revision, refusing anything else. */
export async function loadPinnedDictionary(bot: Bot): Promise<Dictionary> {
  // A local draft of the table, for a DRY run before it is published. Refused on --live,
  // so a draft can never edit articles.
  const draft = process.env.T20_DICT_FILE;
  if (draft) {
    if (!bot.opts.dryRun) throw new DictionaryError('T20_DICT_FILE تنها در اجرای آزمایشی پذیرفته می‌شود');
    const { readFileSync } = await import('fs');
    const d = parseDictionary(readFileSync(draft, 'utf8'), 0);
    await checkLinkTargets(bot, d);
    return d;
  }
  const revid = pinnedRevid();
  if (!revid) throw new DictionaryError('هیچ نسخه‌ای از واژه‌نامه تأیید نشده است (data/pin.json)');
  const res = await bot.apiGet({ action: 'query', prop: 'revisions', revids: String(revid),
    rvprop: 'content|ids', rvslots: 'main' });
  const page = res.query?.pages?.[0];
  if (!page || page.title !== DICTIONARY_PAGE) {
    throw new DictionaryError(`نسخهٔ ${revid} از صفحهٔ «${DICTIONARY_PAGE}» نیست (${page?.title ?? 'ناموجود'})`);
  }
  const text = page.revisions?.[0]?.slots?.main?.content;
  if (typeof text !== 'string') throw new DictionaryError(`متن نسخهٔ ${revid} خوانده نشد`);
  const dict = parseDictionary(text, revid);
  await checkLinkTargets(bot, dict);
  return dict;
}

/** Every article a Persian value links to, e.g. `[[کلیه|کلیوی]]` → `کلیه`. */
export function linkTargets(d: Dictionary): string[] {
  const out = new Set<string>();
  for (const e of d.entries) for (const m of e.fa.matchAll(/\[\[([^\]|]+)/g)) out.add(m[1].trim());
  return [...out];
}

/**
 * Refuse the whole table if any linked value points at a missing page, a redirect or a
 * disambiguation page: the bot writes these links into articles, so a bad one would add a
 * red or wrong link on every page that row matches.
 */
export async function checkLinkTargets(bot: Bot, d: Dictionary): Promise<void> {
  const titles = linkTargets(d);
  const bad: string[] = [];
  for (let i = 0; i < titles.length; i += 50) {
    const chunk = titles.slice(i, i + 50);
    const r = await bot.apiGet({ action: 'query', titles: chunk.join('|'), prop: 'info|pageprops',
      ppprop: 'disambiguation' });
    for (const p of r.query?.pages ?? []) {
      if (p.missing) bad.push(`${p.title} (ناموجود)`);
      else if (p.redirect) bad.push(`${p.title} (تغییرمسیر)`);
      else if (p.pageprops?.disambiguation !== undefined) bad.push(`${p.title} (ابهام‌زدایی)`);
    }
  }
  if (bad.length) throw new DictionaryError(`واژه‌نامه نسخهٔ ${d.revid} پیوند نادرست دارد: ${bad.join('، ')}`);
}
