/**
 * Insert portal links into an article's wikitext.
 *
 * Promoted out of scripts/archive/add-portal-links.ts (the 1930/40/80/90 decade
 * runs) because scripts/portals/ needs it again for the ۱۹۵۰ sweep, and
 * AGENTS.md forbids importing across into the archive or keeping a second copy.
 *
 * Placement follows fa convention: `{{درگاه}}` at the top of جستارهای وابسته
 * when that section exists, otherwise `{{نوار درگاه}}` just above the first
 * category.
 *
 * Both entry points take the portal's REDIRECTS as aliases, because a portal
 * link through a redirect is a working link and must count as already done.
 */

/** A portal call and its parameter list, as actually parsed from the wikitext. */
export interface PortalCall { raw: string; name: string; params: string[] }

const CALL_RE = /\{\{ *(نوار درگاه|درگاه|Portal bar|Portal) *\|([^{}]*)\}\}/gi;

/**
 * Every `{{درگاه|…}}` / `{{نوار درگاه|…}}` call in the text, with parameters
 * split out.
 *
 * Callers must test membership against `params`, never with
 * `text.includes(portalName)`. A decade name also occurs as ordinary prose, as
 * a plain `[[wikilink]]` and inside category names, so a bare substring test
 * answers a different question than the one asked — it once reported "81 of
 * 189 pages already have the portal" when the real answer was 1.
 * See lessons/verification-and-gates/substring-test-is-not-a-link-check.md
 */
export function portalCalls(text: string): PortalCall[] {
  return [...text.matchAll(CALL_RE)].map(m => ({
    raw: m[0],
    name: m[1],
    params: m[2].split('|').map(x => x.trim()).filter(Boolean),
  }));
}

/**
 * True when `portal` is already a parameter of some portal call in `text`.
 *
 * `aliases` must list the portal's REDIRECTS. A portal link works through a
 * redirect, so `{{درگاه|هندوئیسم}}` already links درگاه:هندوگرایی and the page
 * is done — but a name-equality test calls it missing, and the sweep then
 * writes `{{درگاه|هندوئیسم|هندوگرایی}}`, i.e. the same portal listed twice.
 * That renders two identical links and raises nothing.
 */
export function hasPortal(text: string, portal: string, aliases: string[] = []): boolean {
  const names = new Set([portal, ...aliases]);
  return portalCalls(text).some(c => c.params.some(p => names.has(p)));
}

/**
 * Add `portals` to `text`, or return null when there is nothing to do.
 *
 * Returning null rather than the unchanged text is deliberate: it lets a batch
 * runner distinguish "already done" from "edited" without re-comparing, so the
 * run never issues a no-op write.
 */
export function addPortals(
  text: string,
  portals: string[],
  aliases: Record<string, string[]> = {},
): string | null {
  const calls = portalCalls(text);
  const present = new Set(calls.flatMap(c => c.params));
  // A portal already present under one of its redirects is present.
  const missing = portals.filter(
    p => !present.has(p) && !(aliases[p] ?? []).some(a => present.has(a)));
  if (!missing.length) return null;
  const args = missing.join('|');

  // 1) extend an existing portal call rather than adding a second one
  if (calls.length) {
    const c = calls[0];
    return text.replace(c.raw, `{{${c.name}|${[...c.params, ...missing].join('|')}}}`);
  }

  // 2) under the جستارهای وابسته heading
  const seeAlso = text.match(/^==\s*جستارهای وابسته\s*==\s*$/m);
  if (seeAlso) {
    const idx = text.indexOf(seeAlso[0]) + seeAlso[0].length;
    return `${text.slice(0, idx)}\n{{درگاه|${args}}}${text.slice(idx)}`;
  }

  // 3) above the first category
  const cat = text.match(/^\[\[رده:/m);
  if (cat) {
    const idx = text.indexOf(cat[0]);
    return `${text.slice(0, idx)}{{نوار درگاه|${args}}}\n${text.slice(idx)}`;
  }

  // 4) last resort: append
  return `${text.trimEnd()}\n{{نوار درگاه|${args}}}\n`;
}
