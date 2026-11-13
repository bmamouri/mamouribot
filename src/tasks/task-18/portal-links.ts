/**
 * وظیفهٔ ۱۸ — the pure decision half: given an article's wikitext and the portal names
 * already known to be missing from it, build the edit (or refuse to).
 *
 * No network here, so it is fully offline-testable. The network work — discovering
 * portals, scoping candidates, checking for a prior human revert, reading the article's
 * current text — happens in `getTargets()` in `portal-links-task.ts`.
 */
import { addPortals, hasPortal } from '../../lib/portal-bar.js';

export interface AddDecision {
  text: string;
  changed: boolean;
  note: string;
}

/**
 * Add `portal` to `text`, or refuse.
 *
 * Refusals are the whole point of «avoid false positives completely»:
 *
 *   - a redirect: never touch the target of a #تغییرمسیر.
 *   - a disambiguation page: a portal link on a dab page is nobody's answer.
 *   - already carries the portal (under its canonical name or a redirect) —
 *     re-checked HERE at transform time, not trusted from the scope pass, because
 *     the scope pass and the write can be minutes apart and a human may have added
 *     it meanwhile.
 *   - a stray `~~~~` in the result — see the signature-hazard check elsewhere in this
 *     repo's portal scripts; a bot edit must never risk posting a dated signature into
 *     article text.
 */
export function addPortalLink(
  text: string, portal: string, aliases: string[] = [],
): AddDecision {
  if (/^\s*#(تغییرمسیر|REDIRECT|تغییر_مسیر)/i.test(text)) {
    return { text, changed: false, note: 'تغییرمسیر است' };
  }
  if (/\{\{\s*(ابهام‌زدایی|صفحه ابهام‌زدایی)\s*[|}]/.test(text)) {
    return { text, changed: false, note: 'صفحهٔ ابهام‌زدایی است' };
  }
  if (hasPortal(text, portal, aliases)) {
    return { text, changed: false, note: 'از پیش پیوند درگاه را دارد' };
  }

  const out = addPortals(text, [portal], { [portal]: aliases });
  if (out === null) {
    return { text, changed: false, note: 'از پیش پیوند درگاه را دارد' };
  }
  if (out.includes('~~~~') && !text.includes('~~~~')) {
    return { text, changed: false, note: 'نتیجه نشان امضا دارد — رد شد' };
  }
  return { text: out, changed: true, note: `افزودن پیوند درگاه «${portal}»` };
}

/**
 * The Persian edit summary, content-only, no task machinery named.
 *
 * Does NOT claim a location: `addPortals()` prefers جستارهای وابسته but falls back to
 * just above the first category when that heading is absent, so a summary promising
 * «در جستارهای وابسته» would be wrong on exactly those pages.
 */
export const summaryFor = (portal: string) => `افزودن پیوند درگاه ${portal}`;
