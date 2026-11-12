/**
 * Task 12 — turn resolutions into new wikitext, and refuse to ship a text that got worse.
 *
 * Two rules carry most of the risk and so are isolated here:
 *
 *  * **Display text is preserved when it is already Persian.** The bot's job is the LINK;
 *    rewording a label a human chose is out of scope and unreviewable at batch size.
 *  * **Numeric displays keep their shape** and only change script: `41st`→`۴۱ام`,
 *    `562, 310`→`۵۶۲، ۳۱۰`. An area code or a population rank is a number in a Persian
 *    infobox row, not a word to translate.
 *
 * `gateDiff` runs the shared publish gate on the text BEFORE and AFTER and reports only
 * problems the edit introduces. These pages carry thousands of inherited defects (13,204
 * articles have a Latin display label); a whole-text gate would block every edit and tempt
 * someone to pass a skip flag, which is how a real check gets switched off.
 *
 * Ported from the Python `scripts/linkfix/rewrite.ts`, which this replaces.
 */
import { auditCounts, checkWikitext, linkContext } from '../../lib/gates.js';
import { linkRe, PERSIAN, skipped } from './detect.js';
import { EN, FA, PLAIN, REVIEW, SKIP, type Names, type Resolution } from './resolve.js';

const ORDINAL = /^(\d+)(?:st|nd|rd|th)$/;
const NUMERIC = /^\d+(?:\s*(?:\/|,|and|و|–|-)\s*\d+)*$/;
const AREA_CODE = /^[Aa]rea codes? ([\d andor/,]+)$/;

export const persianDigits = (s: string) =>
  s.replace(/[0-9]/g, d => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);

/** Persian digits for a numeric label, same shape; null if the label is not numeric. */
export function numericDisplay(old: string): string | null {
  const s = old.trim();
  const m = ORDINAL.exec(s);
  if (m) return persianDigits(m[1]) + 'ام';
  if (NUMERIC.test(s)) {
    // The Persian comma, not the Latin one: «۵۶۲، ۳۱۰».
    return persianDigits(s).replace(/\band\b/g, 'و').replace(/,/g, '،');
  }
  return null;
}

/** What the reader should see, given the old label. */
export function displayFor(
  target: string, old: string | null, resolution: Resolution, names: Names,
): string | null {
  if (old && PERSIAN.test(old)) return old;
  if (old) {
    // One target can mean two things in two places: «Charter city» is the article, but a
    // row labelled «General Law City» is a different concept pointing at it.
    const override = names.by_old_display?.[`${target}||${old}`];
    if (override) return override;
    const num = numericDisplay(old);
    if (num) return num;
    const m = AREA_CODE.exec(old);
    if (m) return persianDigits(m[1]);
  }
  return resolution.display ?? null;
}

/**
 * In a FOREIGN span (a citation to an English source, an English bibliography line) the
 * label is the source's own text and stays as written: `[[Prometheus Books]]` becomes
 * `[[کتاب‌های پرومتئوس|Prometheus Books]]`, and `[[George O. Abell|Abell, George O.]]`
 * keeps `Abell, George O.`. Translating it would misquote the source, and the shipped
 * code did exactly that on «ایمانوئل ولیکوفسکی» until extension ۱.
 *
 * Only the fa re-point keeps the label. An interwiki or plain-text repair inside a foreign
 * span would gain nothing a reader can see, so those stay REVIEW there.
 */
export function render(
  target: string, old: string | null, resolution: Resolution, names: Names,
  foreign = false,
): string {
  if (foreign && resolution.kind === FA) {
    const label = old ?? target;
    return resolution.link === label ? `[[${label}]]` : `[[${resolution.link}|${label}]]`;
  }
  const display = displayFor(target, old, resolution, names);
  if (resolution.kind === PLAIN) return display ?? '';
  if (resolution.kind === FA) {
    return resolution.link === display ? `[[${resolution.link}]]` : `[[${resolution.link}|${display}]]`;
  }
  if (resolution.kind === EN) return `[[:en:${resolution.link}|${display}]]`;
  throw new Error(`not applicable: ${resolution.kind}`);
}

export interface Applied { text: string; applied: number; deferred: string[] }

/**
 * Untouched for REVIEW/unknown targets: leaving a defect in place is always better than
 * guessing at it.
 */
/**
 * A link set in ENGLISH running text: the line around it, link removed, reads as English
 * words and has no Persian. Untranslated templates are full of these
 * (`|info=This user is a [[Citizenship|citizen]] of the …`); re-pointing one gives
 * «This user is a [[شهروندی]] of the», which is no better for anyone. Left for whoever
 * translates the text.
 *
 * A bare list item `* [[Ibn Masarra]]` or a cell `|[[Argentine real|Real]]<br/>1813` has
 * no running text at all, and stays repairable.
 */
export function inEnglishProse(text: string, at: number): boolean {
  const ls = text.lastIndexOf('\n', at - 1) + 1;
  const le = text.indexOf('\n', at);
  let line = text.slice(ls, le < 0 ? text.length : le);
  const rel = at - ls;
  // Templates are dropped — EXCEPT the ones the link sits inside, whose argument text IS
  // its context: `{{efn|Including 2% for the [[…|SDPS]] and …}}` («انتخابات پارلمانی
  // صربستان (۲۰۲۰)», ۱۲ نوامبر ۲۰۲۶). Same-length blanking keeps `rel` valid.
  const blank = (n: number) => ' '.repeat(n);
  let prev: string | null = null;
  while (prev !== line) {
    prev = line;
    line = line.replace(/\{\{[^{}]*\}\}/g, (m, off: number) => {
      if (!(off <= rel && rel < off + m.length)) return blank(m.length);
      const head = /^\{\{[^|}]*\|?/.exec(m)![0];
      return blank(head.length) + m.slice(head.length, -2) + blank(2);
    });
  }
  line = line.replace(/^\s*[|!]?\s*[\w\s-]{1,40}=/, '');           // a template/table parameter name
  line = line.replace(/\[\[[^\]]*\]\]/g, ' ').replace(/<[^>]*>/g, ' ')
    .replace(/\[(?:https?:)?\/\/\S+[^\]]*\]/g, ' ').replace(/&[#\w]+;/g, ' ');
  if (PERSIAN.test(line)) return false;
  return (line.match(/\b[A-Za-z]{2,}\b/g) ?? []).length >= 2;
}

/** `S&#809;` and `S̩` are one title to MediaWiki. */
const decodeEntities = (s: string) => s
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&amp;/g, '&').replace(/_/g, ' ').normalize('NFC').trim();

/** Whether offset `at` sits inside a `{{…}}` call (unbalanced `{{` before it). */
export function insideTemplate(text: string, at: number): boolean {
  let depth = 0;
  for (let i = 0; i < at - 1; i++) {
    const two = text[i] + text[i + 1];
    if (two === '{{') { depth++; i++; } else if (two === '}}' && depth) { depth--; i++; }
  }
  return depth > 0;
}

export function applyResolutions(
  text: string, resolutions: Map<string, Resolution>, names: Names,
  ctx: { foreign: [number, number][]; opaque: [number, number][] } = linkContext(text),
): Applied {
  let applied = 0;
  const deferred: string[] = [];
  const within = (xs: [number, number][], at: number) => xs.some(([s, e]) => s <= at && at < e);
  const out = text.replace(linkRe(), (whole, rawTarget: string, rawOld: string | undefined, at: number) => {
    const target = rawTarget.trim();
    const old = rawOld === undefined ? null : rawOld;
    if (skipped(target)) return whole;
    // `"the [[Netherlands]]"` inside <nowiki> in a template's documentation is an example.
    if (within(ctx.opaque, at)) return whole;
    const res = resolutions.get(target);
    if (res === undefined) return whole;
    if (res.kind === REVIEW || res.kind === SKIP) { deferred.push(target); return whole; }
    // The fa article has the SAME title as the link: it is already a working link, and
    // «re-pointing» it only threw the label away (`[[R|Ʀʀ]]` → `[[R]]`, ۱۲ نوامبر ۲۰۲۶).
    if (res.kind === FA && decodeEntities(res.link ?? '') === decodeEntities(target)) return whole;
    const foreign = within(ctx.foreign, at);
    if (foreign && res.kind !== FA) { deferred.push(target); return whole; }
    if (!foreign && inEnglishProse(text, at)) { deferred.push(target); return whole; }
    // An English {{cite …}} on fa converts Persian digits in its parameters to Latin —
    // link targets included — so `[[… ۱۸۴۸–۱۸۴۹|…]]` inside one renders RED as `… 1848–1849`
    // («انقلاب‌های ۱۸۴۸», ۱۲ نوامبر ۲۰۲۶). Never put a Persian-digit target inside a template.
    if (res.kind === FA && /[۰-۹]/.test(res.link ?? '') && insideTemplate(text, at)) {
      deferred.push(target); return whole;
    }
    applied++;
    return render(names.remap?.[target] ?? target, old, res, names, foreign);
  });
  return { text: out, applied, deferred };
}

/**
 * Problems this edit INTRODUCES; inherited ones are returned separately, not raised.
 *
 * "Introduced" is an audit whose hit COUNT rose. Comparing the messages instead refused
 * clean edits: a message quotes the text around each hit, so repairing a link beside an
 * inherited em dash changed the quote and the dash read as new («اریک هابسبام»,
 * ۱۲ نوامبر ۲۰۲۶).
 */
export function gateDiff(
  title: string, before: string, after: string,
): { introduced: string[]; inherited: string[] } {
  const was = auditCounts(title, before), now = auditCounts(title, after);
  const rose = Object.keys(now).filter(k => (now[k] ?? 0) > (was[k] ?? 0));
  const inherited = checkWikitext(title, before);
  if (!rose.length) return { introduced: [], inherited };
  const detail = checkWikitext(title, after);
  return {
    introduced: rose.map(k => `${k} ${was[k] ?? 0}→${now[k]}: `
      + (detail.find(p => p.includes(k.replace(/_/g, ' '))) ?? detail[0] ?? '')),
    inherited,
  };
}
