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
import { checkWikitext } from '../../lib/gates.js';
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

export function render(
  target: string, old: string | null, resolution: Resolution, names: Names,
): string {
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
export function applyResolutions(
  text: string, resolutions: Map<string, Resolution>, names: Names,
): Applied {
  let applied = 0;
  const deferred: string[] = [];
  const out = text.replace(linkRe(), (whole, rawTarget: string, rawOld?: string) => {
    const target = rawTarget.trim();
    const old = rawOld === undefined ? null : rawOld;
    if (skipped(target)) return whole;
    const res = resolutions.get(target);
    if (res === undefined) return whole;
    if (res.kind === REVIEW || res.kind === SKIP) { deferred.push(target); return whole; }
    applied++;
    return render(names.remap?.[target] ?? target, old, res, names);
  });
  return { text: out, applied, deferred };
}

/** Problems this edit INTRODUCES; inherited ones are returned separately, not raised. */
export function gateDiff(
  title: string, before: string, after: string,
): { introduced: string[]; inherited: string[] } {
  const was = new Set(checkWikitext(title, before));
  const now = checkWikitext(title, after);
  return { introduced: now.filter(p => !was.has(p)), inherited: [...was].sort() };
}
