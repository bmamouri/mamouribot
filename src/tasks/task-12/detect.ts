/**
 * Task 12 — pure-text detection of the English-leftover link defects.
 *
 * No network, no state: every function takes wikitext and returns findings, so the whole
 * detection layer is unit-testable against fixtures. The classes are the ones actually
 * observed in the LA-area sweep (`research/english-link-sweep-automation.md` in the
 * companion repo); each is counted separately because they need DIFFERENT repairs and
 * carry different risk.
 *
 * Ported from the Python `scripts/linkfix/detect.py`, which this replaces.
 */

/**
 * Link prefixes that are not article links on this wiki. `en:` / `:en:` and friends are
 * already interwiki, `پرونده:`/`رده:` are files and categories, and `s:`/`d:`/`commons:`
 * are sister projects.
 *
 * A sweep that forgets these rewrites image options into body text — a 25px size or a
 * thumb caption looks exactly like a link label. See
 * lessons/routemap/link-sweep-must-exclude-file-namespace.md.
 */
export const SKIP_PREFIXES = [
  'file:', 'image:', 'media:', 'category:',
  'en:', ':en:', 'w:', ':w:', 's:', ':s:', 'd:', ':d:',
  'commons:', ':commons:', 'wikt:', ':wikt:',
  'پرونده:', 'رده:', 'ویکی‌پدیا:', 'الگو:', 'پودمان:', 'بحث:',
] as const;

export const PERSIAN = /[؀-ۿ]/;
/** `[[target]]` or `[[target|display]]`, one occurrence. Not global: callers add the flag. */
export const LINK_SOURCE = String.raw`\[\[([^\]\|\n]+)(?:\|([^\]\n]*))?\]\]`;
export const linkRe = () => new RegExp(LINK_SOURCE, 'g');

const LATIN_START = /^[A-Za-z]/;
/**
 * «Area code ۳۲۳»: a Latin page name typed with Persian digits, so it is red on fa AND
 * absent from en — invisible to a Latin-target scan and to an en-side existence check.
 */
const PERSIAN_DIGIT_TARGET = /^[A-Za-z][A-Za-z ]*[۰-۹]/;

export type Kind = 'latin_target' | 'persian_digit_target' | 'latin_display';

/** One defective link occurrence. */
export interface Finding {
  kind: Kind;
  target: string;
  /** `null` when the link has no `|label` part. */
  display: string | null;
  start: number;
  end: number;
}

export function skipped(target: string): boolean {
  const low = target.replace(/^:+/, '').toLowerCase();
  return SKIP_PREFIXES.some(p => low.startsWith(p.replace(/^:+/, '')));
}

/** All findings in one page's wikitext, in source order. */
export function scan(text: string): Finding[] {
  const out: Finding[] = [];
  for (const m of text.matchAll(linkRe())) {
    const target = m[1].trim();
    const display = m[2] === undefined ? null : m[2];
    if (skipped(target)) continue;
    let kind: Kind;
    if (PERSIAN_DIGIT_TARGET.test(target)) {
      // Checked BEFORE latin_target: «Area code ۳۲۳» starts with a Latin letter too, and
      // it needs the remap to its Latin twin, not a plain resolve.
      kind = 'persian_digit_target';
    } else if (LATIN_START.test(target)) {
      kind = 'latin_target';
    } else if (display !== null && PERSIAN.test(target) && !PERSIAN.test(display)
               && /[A-Za-z]{2}/.test(display)) {
      // Blue link, Persian target, English label: no red-link check sees it and the
      // reader still reads English. Detected and counted only — see the task header.
      kind = 'latin_display';
    } else {
      continue;
    }
    out.push({ kind, target, display, start: m.index!, end: m.index! + m[0].length });
  }
  return out;
}

export function counts(text: string): Record<string, number> {
  const c: Record<string, number> = {};
  for (const f of scan(text)) c[f.kind] = (c[f.kind] ?? 0) + 1;
  return c;
}
