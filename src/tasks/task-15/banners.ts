/**
 * وظیفهٔ ۱۵ — the pure wikitext half: which banner, where it goes, and how a stale one
 * comes out. No network, no `mw`, no `Bot`: everything here is decided from the article
 * text plus a `PageFacts` record the task gathered earlier, which is what lets the whole
 * decision be tested offline.
 *
 * Rules and their reasons are in `docs/task-15-source-tags.md` §3–§5. Section numbers
 * below point at it rather than repeating the argument.
 */
import { findTemplate } from '../task-14/population-box.js';

export const REPORT_PAGE = 'کاربر:MamouriBot/وظیفه ۱۵/گزارش';

/** The four banners this task may place, with the category each one produces (§12.2). */
export const BANNERS = {
  'بدون منبع': { category: 'مقاله‌های بدون منبع' },
  'بدون منبع زنده': { category: 'زندگی‌نامه زندگان بدون منبع' },
  'بهبود منبع': { category: 'مقاله‌های نیازمند ارجاع‌های اضافی' },
  'منبع زنده': { category: 'مقاله‌های زندگی‌نامه زندگان بدون منبع' },
} as const;
export type BannerName = keyof typeof BANNERS;

/**
 * Any source/verification banner already on the page means hands off (§3.1).
 *
 * Redirects are resolved live at run start and merged into this set; the literals are
 * the ones measured on ۱۰ اکتبر ۲۰۲۶ so the task still refuses correctly if that lookup
 * fails. «مدرک» has 8,765 uses and is the one most likely to be missed.
 */
export const EXISTING_SOURCE_BANNERS = new Set<string>([
  'بدون منبع', 'بدون منبع زنده', 'بهبود منبع', 'منبع زنده', 'یک منبع', 'بدون پانویس',
  'مدرک', 'منبع', 'بی‌منبع', 'بی منبع', 'فاقد منبع', 'بدون مرجع', 'نیاز به منبع',
  'منبع کم', 'ذکر منبع', 'درخواست یادکرد منبع', 'درخواست یادکرد منابع',
  'unreferenced', 'refimprove', 'verify', 'blp sources', 'blp unreferenced', 'one source',
]);

/**
 * Templates that mean "someone is working on this right now, or it is about to be
 * deleted". The bot refuses outright rather than adding a banner to a page in motion
 * (§4).
 */
export const STOP_TEMPLATES = new Set<string>([
  'ویرایش', 'در دست ویرایش', 'in use', 'در حال تکمیل',
  'در دست ساخت', 'under construction',
  'حذف سریع', 'حس', 'delete', 'db', 'sd',
  'نظرخواهی برای حذف', 'پیشنهاد حذف', 'afd', 'نبح',
]);

/** Top-of-page furniture that a banner goes BELOW (§4). */
const FURNITURE = [
  'تغییرمسیر', 'دیگر کاربردها', 'برای', 'دربارهٔ', 'درباره', 'ابهام‌زدایی مقاله',
  'displaytitle', 'عنوان مقاله', 'توصیف کوتاه', 'short description', 'شرح مختصر',
  'حص', 'محافظت', 'pp', 'pp-protected', 'pp-semi-indef', 'pp-move-indef',
];

/** The wrapper and its English redirect. */
const MULTI = ['مشکلات متعدد', 'multiple issues', 'چند مشکل'];

const MONTHS = ['ژانویه', 'فوریه', 'مارس', 'آوریل', 'مه', 'ژوئن',
  'ژوئیه', 'اوت', 'سپتامبر', 'اکتبر', 'نوامبر', 'دسامبر'];
const faDigits = (n: number | string) => String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[+d]);

/** `اکتبر ۲۰۲۶` — the form `{{جا:بدون منبع}}` produces (§5). */
export const monthStamp = (d = new Date()) =>
  `${MONTHS[d.getUTCMonth()]} ${faDigits(d.getUTCFullYear())}`;

/** Template name as written at `index`, lowercased, `_` normalised. */
function nameAt(text: string, index: number): string | null {
  const m = /^\{\{\s*([^{}|\n]+?)\s*(?:\||\}\}|\n)/.exec(text.slice(index));
  return m ? m[1].replace(/_/g, ' ').trim().toLowerCase() : null;
}

/** Skip one balanced `{{…}}` starting at `i`; returns the index just past it. */
function skipTemplate(text: string, i: number): number {
  let depth = 0;
  for (let j = i; j < text.length; j++) {
    if (text.startsWith('{{', j)) { depth++; j++; }
    else if (text.startsWith('}}', j)) { depth--; j++; if (depth === 0) return j + 1; }
  }
  return -1;   // unbalanced: caller must treat the page as untouchable
}

/**
 * Where a new banner goes: after the hatnotes and the short description, before
 * everything else — which puts it before the infobox, as §4 requires and as the
 * 40-page samples show.
 *
 * Returns -1 when the top of the page cannot be parsed (an unbalanced template), because
 * guessing an offset there would splice a banner into the middle of someone's markup.
 */
export function insertionPoint(text: string): number {
  let i = 0;
  for (;;) {
    while (i < text.length && /\s/.test(text[i])) i++;
    if (!text.startsWith('{{', i)) return i;
    const name = nameAt(text, i);
    if (!name) return i;
    const bare = name.split('|')[0].trim();
    if (!FURNITURE.some(f => bare === f || bare.startsWith(f + ' ') || bare.startsWith(f + '-'))) {
      return i;
    }
    const next = skipTemplate(text, i);
    if (next < 0) return -1;
    i = next;
  }
}

/** Every template name used anywhere in the text, lowercased. */
export function allTemplateNames(text: string): string[] {
  const out: string[] = [];
  const re = /\{\{\s*([^{}|\n]+?)\s*(?:\||\}\})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push(m[1].replace(/_/g, ' ').trim().toLowerCase());
  return out;
}

/** The `{{مشکلات متعدد}}` wrapper, if the page has one. */
export function findMultiple(text: string): { start: number; end: number; body: string } | null {
  for (const n of MULTI) {
    const f = findTemplate(text, n);
    if (f) return f;
  }
  return null;
}

/**
 * Build the banner call. The date is written ONLY when the monthly category exists
 * (§5, decision 7): `پودمان:Message box` files a page under
 * `رده:مقاله‌های دارای پارامتر تاریخ نادرست در الگو` when it does not, and those
 * categories are created after the fact by somebody else.
 */
export const bannerCall = (name: BannerName, date: string | null) =>
  date ? `{{${name}|تاریخ=${date}}}` : `{{${name}}}`;

/** Add the banner, either standalone at the top or as a line in an existing wrapper. */
export function addBanner(text: string, name: BannerName, date: string | null):
{ text: string; how: 'standalone' | 'merged' } | null {
  const call = bannerCall(name, date);

  const multi = findMultiple(text);
  if (multi) {
    // One banner per line inside the wrapper, which is how fa writes it:
    //   {{مشکلات متعدد|\n{{بازنویسی|…}}\n{{بخش آغازین کوتاه|…}}\n}}
    const close = multi.body.lastIndexOf('}}');
    const inner = multi.body.slice(0, close).replace(/\s*$/, '');
    const merged = `${inner}\n${call}\n}}`;
    return { text: text.slice(0, multi.start) + merged + text.slice(multi.end), how: 'merged' };
  }

  const at = insertionPoint(text);
  if (at < 0) return null;
  // Exactly one newline after the banner and nothing else disturbed (§4, as وظیفهٔ ۱۴).
  return { text: text.slice(0, at) + call + '\n' + text.slice(at), how: 'standalone' };
}

/**
 * Is this `{{بدون منبع}}`-family call the SECTION form?
 *
 * `{{منبع|بخش}}` is the same template used at the top of a section, and 14 of 40 sampled
 * tagged pages were that. Removing one because the ARTICLE now has a reference would
 * strip a banner from a section that still has none (§3.9).
 */
export function isSectionUse(call: string): boolean {
  const inner = call.replace(/^\{\{|\}\}$/g, '');
  const args = inner.split('|').slice(1).map(a => a.trim());
  return args.some(a => a === 'بخش' || a === 'section' ||
    /^(name|نام)\s*=\s*بخش(\s|$)/.test(a) || /^(بخش|section)\s*=\s*(بله|yes)$/.test(a));
}

export interface Removal { text: string; how: 'standalone' | 'in-wrapper'; leftAlone?: boolean }

/**
 * Remove a stale `{{بدون منبع}}` / `{{بدون منبع زنده}}`.
 *
 * Returns null when nothing may be touched: a section use, a wrapper marked
 * `section=yes`, or a wrapper that would be left holding a single banner — unwrapping is
 * an editorial choice, so that page goes to the report instead (§3.9).
 */
export function removeStaleTag(text: string, names: Set<string>): Removal | null {
  const multi = findMultiple(text);
  if (multi) {
    // A section-scoped wrapper makes every banner inside it a section banner.
    if (/\|\s*section\s*=\s*yes|\|\s*بخش\s*=\s*(بله|yes)/.test(multi.body)) return null;
    const lines = multi.body.split('\n');
    const keep: string[] = [];
    let removed = 0, banners = 0;
    for (const line of lines) {
      const t = line.trim();
      const n = t.startsWith('{{') ? nameAt(t, 0) : null;
      if (n) banners++;
      if (n && names.has(n) && !isSectionUse(t)) { removed++; continue; }
      keep.push(line);
    }
    if (!removed) return null;
    // Leaving a one-banner wrapper is allowed; unwrapping it is not ours to decide.
    const left = banners - removed;
    const body = keep.join('\n').replace(/\n\s*\n/g, '\n');
    return {
      text: text.slice(0, multi.start) + body + text.slice(multi.end),
      how: 'in-wrapper',
      leftAlone: left === 1,
    };
  }

  for (const name of names) {
    const f = findTemplate(text, name);
    if (!f) continue;
    if (isSectionUse(f.body)) return null;
    // Take the trailing newline with it so the page does not gain a blank line.
    let end = f.end;
    if (text[end] === '\n') end++;
    return { text: text.slice(0, f.start) + text.slice(end), how: 'standalone' };
  }
  return null;
}
