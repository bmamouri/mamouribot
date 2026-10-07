/**
 * Task 4 (addition) — deduplicate redundant access-date parameters in CS1
 * citations ({{یادکرد …}} / {{cite …}} / {{citation}}).
 *
 * Background: fa articles widely use underscore-joined access-date parameters
 * (|تاریخ_بازبینی=). While that form was temporarily unrecognized during the CS1
 * engine migration, semi-automated tools added a SECOND access-date parameter
 * (|بازبینی= / |تاریخ بازبینی=) to the same citation. Now that the underscore
 * form is recognized again (the module normalizes «_»→« » in parameter names),
 * such citations carry TWO aliases of the same field and the CS1 module emits
 *   «بیش از یک پارامتر |تاریخ بازبینی= و |بازبینی= داده‌شده است»
 * (redundant parameter — رده:صفحه‌های دارای ارجاع با متغیر تکراری).
 *
 * This transform removes the redundancy ONLY where it is provably safe:
 *   - Per citation, collect params whose (underscore-normalized) key is an
 *     access-date alias (بازبینی / تاریخ بازبینی / تاریخ دسترسی / access-date / …).
 *   - If a citation has ≥2 of them:
 *       • all non-empty values are the SAME date — compared after normalizing
 *         Persian/Arabic digits → Western and collapsing whitespace — → keep ONE
 *         and drop the redundant copies. Preference for the kept name: a
 *         space-form over an underscore-form, else first occurrence.
 *       • ≥2 genuinely DIFFERENT non-empty values (two unrelated dates, or one
 *         Jalali + one Gregorian that don't string-match) → the citation is LEFT
 *         UNTOUCHED and reported for manual review. The bot never guesses which
 *         date is correct, and never converts calendars.
 *   - Only the redundant parameter's segment is removed; values are never parsed
 *     or altered, and the surrounding whitespace/alignment of the kept params is
 *     preserved. Only CS1 citation templates are considered.
 *
 * Handling is PER CITATION: an article's safely-dedupable citations are fixed
 * even if another citation in the same article has a genuine date conflict (that
 * one is left as-is and counted in the note), so a single conflicting citation
 * never blocks cleanup of the rest.
 *
 * NB: the small wikitext parsers below are intentionally a self-contained copy of
 * the generic helpers in company-deprecated-params.ts — kept separate so that the
 * already-filed Task-4 company code stays byte-identical.
 */
import type { Bot, BotTask } from '../../core.js';

/** Access-date field aliases, underscore-normalized + lowercased. */
const ACCESSDATE_ALIASES = new Set([
  'بازدید', 'بازیابی', 'بازبینی',
  'تاریخ بازدید', 'تاریخ بازیابی', 'تاریخ بازبینی', 'تاریخ دسترسی',
  'access-date', 'accessdate',
]);

/** Normalize a parameter key for alias matching: «_»→« », collapse ws, lower. */
function normalizeKey(k: string): string {
  return k.replace(/_/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Normalize a value for equality: Persian/Arabic digits → Western, collapse ws. */
function normalizeVal(v: string): string {
  return v
    .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660))
    .replace(/\s+/g, ' ')
    .trim();
}

/** True if a (normalized) template name is a CS1 citation. */
function isCitationName(name: string): boolean {
  const n = normalizeKey(name);
  return n === 'یادکرد' || n.startsWith('یادکرد ')
    || n === 'cite' || n.startsWith('cite ')
    || n === 'citation';
}

/** Given `{{` at `start`, return the index just past the matching `}}` (or -1). */
function matchBraces(text: string, start: number): number {
  let depth = 0;
  for (let i = start; i < text.length - 1; i++) {
    const two = text.slice(i, i + 2);
    if (two === '{{') { depth++; i++; }
    else if (two === '}}') { depth--; i++; if (depth === 0) return i + 1; }
  }
  return -1;
}

/** Find the [start,end) index of every top-level CS1 citation invocation. */
export function findCitationSpans(text: string): [number, number][] {
  const spans: [number, number][] = [];
  const n = text.length;
  let i = 0;
  while (i < n - 1) {
    if (text[i] === '{' && text[i + 1] === '{') {
      let k = i + 2, name = '';
      while (k < n && text[k] !== '|' && text.slice(k, k + 2) !== '}}' && text.slice(k, k + 2) !== '{{') {
        name += text[k]; k++;
      }
      if (isCitationName(name)) {
        const end = matchBraces(text, i);
        if (end > 0) { spans.push([i, end]); i = end; continue; }
      }
    }
    i++;
  }
  return spans;
}

/** Split a template span's body into top-level segments (seg[0] = name, rest = params). */
function splitTopLevel(body: string): string[] {
  const segs: string[] = [];
  let cur = '', brace = 0, link = 0, i = 0;
  while (i < body.length) {
    const two = body.slice(i, i + 2);
    if (two === '{{' || two === '[[') { if (two === '{{') brace++; else link++; cur += two; i += 2; continue; }
    if (two === '}}' || two === ']]') { if (two === '}}') brace = Math.max(0, brace - 1); else link = Math.max(0, link - 1); cur += two; i += 2; continue; }
    if (body[i] === '|' && brace === 0 && link === 0) { segs.push(cur); cur = ''; i++; continue; }
    cur += body[i]; i++;
  }
  segs.push(cur);
  return segs;
}

/** Split a param segment at its first top-level '=' into [keyRaw, valWithEq|null]. */
function splitKey(seg: string): [string, string | null] {
  let brace = 0, link = 0, i = 0;
  while (i < seg.length) {
    const two = seg.slice(i, i + 2);
    if (two === '{{' || two === '[[') { if (two === '{{') brace++; else link++; i += 2; continue; }
    if (two === '}}' || two === ']]') { if (two === '}}') brace = Math.max(0, brace - 1); else link = Math.max(0, link - 1); i += 2; continue; }
    if (seg[i] === '=' && brace === 0 && link === 0) return [seg.slice(0, i), seg.slice(i)];
    i++;
  }
  return [seg, null];
}

interface AD { idx: number; underscore: boolean; val: string }

/** Dedup one citation span. */
function dedupSpan(span: string): { out: string; changed: boolean; collision: boolean } {
  const body = span.slice(2, -2);
  const segs = splitTopLevel(body);
  const ad: AD[] = [];
  for (let s = 1; s < segs.length; s++) {
    const [keyRaw, val] = splitKey(segs[s]);
    if (val === null) continue;                                  // positional param
    if (ACCESSDATE_ALIASES.has(normalizeKey(keyRaw))) {
      ad.push({ idx: s, underscore: keyRaw.includes('_'), val: normalizeVal(val.slice(1)) });
    }
  }
  if (ad.length < 2) return { out: span, changed: false, collision: false };

  const nonEmpty = ad.filter(a => a.val !== '');
  if (new Set(nonEmpty.map(a => a.val)).size >= 2) {
    return { out: span, changed: false, collision: true };       // genuine conflict → leave for manual review
  }
  // safe: at most one distinct non-empty value → keep one, drop the rest.
  const pool = nonEmpty.length ? nonEmpty : ad;
  const keep = (pool.find(a => !a.underscore) ?? pool[0]).idx;   // prefer a clean (space-form) name
  const drop = new Set(ad.filter(a => a.idx !== keep).map(a => a.idx));
  const newSegs = segs.filter((_, i) => !drop.has(i));
  return { out: '{{' + newSegs.join('|') + '}}', changed: true, collision: false };
}

/** Pure transform for the runner. */
export function dedupAccessDate(text: string): { text: string; changed: boolean; note?: string } {
  const spans = findCitationSpans(text);
  if (!spans.length) return { text, changed: false, note: 'یادکردی یافت نشد' };

  let out = '', last = 0, anyChanged = false, collisions = 0;
  for (const [a, b] of spans) {
    const { out: ns, changed, collision } = dedupSpan(text.slice(a, b));
    out += text.slice(last, a) + ns;
    last = b;
    anyChanged ||= changed;
    if (collision) collisions++;
  }
  out += text.slice(last);

  if (!anyChanged) {
    return { text, changed: false, note: collisions ? `${collisions} یادکرد با تداخل تاریخ — نیازمند بازبینی دستی` : 'تکراریِ ایمن برای حذف نبود' };
  }
  return { text: out, changed: true, note: collisions ? `ویرایش شد؛ ${collisions} یادکرد با تداخل تاریخ رها شد` : undefined };
}

export const citationAccessDateDedupTask: BotTask = {
  id: 'citation-dedup-accessdate',
  taskNumber: 4,
  summary: 'حذف پارامتر تکراری تاریخ بازبینی در یادکردها (نگه‌داشتن یک نمونه)',
  description: 'حذف پارامترهای تکراریِ تاریخ بازبینی در یادکردهای شیوهٔ یادکرد ۱ که مقدارشان یکسان است (مثلاً |تاریخ_بازبینی= و |بازبینی= با یک تاریخ)؛ یادکردهایی که دو تاریخ متفاوت دارند دست‌نخورده و برای بازبینی دستی گزارش می‌شوند.',
  async getTargets(bot: Bot): Promise<string[]> {
    const out: string[] = [];
    let cont: string | undefined;
    do {
      const p: Record<string, string> = {
        action: 'query', list: 'categorymembers',
        cmtitle: 'رده:صفحه‌های دارای ارجاع با متغیر تکراری',
        cmnamespace: '0', cmlimit: '500',
      };
      if (cont) p.cmcontinue = cont;
      const d = await bot.apiGet(p);
      for (const m of d.query.categorymembers) out.push(m.title);
      cont = d.continue?.cmcontinue;
    } while (cont);
    return out;
  },
  transform(text: string) { return dedupAccessDate(text); },
};
