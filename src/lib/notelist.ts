/**
 * Shared logic for the missing-notes-list cleanup.
 *
 * Extracted from fix-notelist-from-category.ts and convert-rawref-to-efn.ts so
 * the one-off fixers and the recurring sweep (scripts/archive/notelist-sweep.ts) can't
 * drift apart — every rule below was learned from a regression on live articles,
 * and a second copy is how they come back.
 */
import { apiGet, apiPost, readPage } from './fa-wiki.js';

export const TRACKING_CAT =
  'رده:صفحه‌های دارای یادداشت که فهرست یادداشت‌ها در آنها جا افتاده است';

/** the cite error this whole pipeline exists to clear */
export const GROUP_ERR = /برای گروهی به نام «([^»]+)»/g;

export const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** the only group names الگو:یادداشت‌ها actually switches on; everything else
 *  silently falls through to persian-alpha, which hides the notes again */
export const WHITELIST = new Set([
  'note', 'یادداشت', 'upper-alpha', 'upper-roman',
  'persian-alpha', 'lower-alpha', 'lower-greek', 'lower-roman',
]);

/** {{پانویس}} passes group= straight to <references>, so it takes any name */
export const container = (g: string) =>
  g === 'persian-alpha' ? '{{یادداشت‌ها}}'
  : WHITELIST.has(g) ? `{{یادداشت‌ها|گروه=${g}}}`
  : `{{پانویس|گروه=${g}}}`;

/**
 * Already renders a list for this EXACT group?
 *
 * Two traps, both of which produced false positives on live articles:
 *  - the group name must be anchored at both ends, or group `n` matches the `n`
 *    of `note` and the article looks already-fixed when it is not;
 *  - {{پانویس‌های تودرتو|گروه=…}} takes a group but is a nested NOTE, not a
 *    list, so it must not count as a container.
 */
export function hasContainerFor(text: string, g: string) {
  const e = esc(g);
  const end = `"?\\s*(?:\\||\\}\\})`; // group value ends at a pipe or the call's close
  return new RegExp(`\\{\\{ *(?:پانویس|یادداشت‌ها|notelist)(?!‌های تودرتو)[^}]*(?:گروه|group) *= *"?${e}${end}`, 'i').test(text)
    || new RegExp(`<references[^>]*group *= *"?${e}"?\\s*/?>`, 'i').test(text)
    || (g === 'persian-alpha' && /\{\{ *یادداشت‌ها *(?:\|[^}]*)?\}\}/.test(text));
}

/**
 * Does a grouped <ref> for this group carry a ref-GENERATING template?
 *
 * {{sfn}} expands to a <ref>, and a <ref> nested inside another <ref> breaks the
 * outer group's list — so the page errors even though its container is present
 * and correct. en.wikipedia errors identically; this is standard Cite behaviour,
 * not an fa defect. Adding another container would not help.
 */
export function hasNestedRefTemplate(text: string, g: string) {
  const re = new RegExp(`<ref[^>]*group\\s*=\\s*"?${esc(g)}"?[^>]*>([\\s\\S]*?)</ref>`, 'gi');
  for (const m of text.matchAll(re)) if (/\{\{ *(?:sfn|Sfn|پک|harvnb|Harvnb)\b/.test(m[1])) return true;
  return false;
}

/**
 * Where this group's notes are actually written, and where its list sits.
 *
 * Cite only collects refs that appear BEFORE the list. A container stranded at
 * the top of the article (a common translation artifact — it lands above the
 * lead) therefore errors exactly like a missing one, while looking present to
 * every wikitext check.
 */
export function containerIsMisplaced(text: string, g: string) {
  const e = esc(g);
  const cont = [
    new RegExp(`\\{\\{ *(?:پانویس|یادداشت‌ها|notelist)(?!‌های تودرتو)[^}]*(?:گروه|group) *= *"?${e}"?\\s*(?:\\||\\}\\})`, 'i'),
    new RegExp(`<references[^>]*group *= *"?${e}"?\\s*/?>`, 'i'),
    ...(g === 'persian-alpha' ? [/\{\{ *یادداشت‌ها *(?:\|[^}]*)?\}\}/] : []),
  ].map(re => text.search(re)).filter(i => i >= 0);
  if (!cont.length) return false;

  const uses = [
    new RegExp(`<ref[^>]*group\\s*=\\s*"?${e}"?`, 'i'),
    ...(g === 'persian-alpha' ? [/\{\{ *(?:یادچپ|یاد|Efn|efn)\b/] : []),
  ].map(re => text.search(re)).filter(i => i >= 0);
  if (!uses.length) return false;

  // every list for this group comes before every note that should be in it
  return Math.max(...cont) < Math.min(...uses);
}

/** drop a stranded container so it can be re-planned into the right place */
export function stripContainer(text: string, g: string) {
  const e = esc(g);
  for (const re of [
    new RegExp(`\\n?\\{\\{ *(?:پانویس|یادداشت‌ها|notelist)(?!‌های تودرتو)[^}]*(?:گروه|group) *= *"?${e}"?[^}]*\\}\\}\\n?`, 'i'),
    new RegExp(`\\n?<references[^>]*group *= *"?${e}"?\\s*/?>\\n?`, 'i'),
    ...(g === 'persian-alpha' ? [/\n?\{\{ *یادداشت‌ها *(?:\|[^}]*)?\}\}\n?/] : []),
  ]) if (re.test(text)) return text.replace(re, '\n');
  return text;
}

/**
 * A group name that was never meant to be one — the editor pasted a URL, a
 * sentence, a stray diacritic or a bare number into group=. Adding a list for
 * these would enshrine the typo, so they are reported for a human instead.
 */
export function looksMalformed(g: string) {
  return /^https?:/i.test(g)          // a pasted source URL
    || /[،,]/.test(g)                 // a comma-separated phrase
    || /^\d+$/.test(g)                // a bare number
    || /\s/.test(g) && g.length > 12  // a sentence fragment
    || g.length === 1 && !/[a-zA-Z]/.test(g); // a lone diacritic / letter like «ْ»
}

/**
 * Blank out spans the parser ignores, PRESERVING offsets so index-based checks
 * (containerIsMisplaced) still line up with the original text. A commented-out
 * `<ref group="X">` must not be mistaken for a live one.
 */
export function stripInert(text: string) {
  return text.replace(
    /<!--[\s\S]*?-->|<nowiki>[\s\S]*?<\/nowiki>|<pre[\s\S]*?<\/pre>|<syntaxhighlight[\s\S]*?<\/syntaxhighlight>/gi,
    m => ' '.repeat(m.length));
}

/**
 * Every note group the wikitext actually uses.
 *
 * Derived from the source rather than the render because a BotTask transform is
 * pure and synchronous. The category membership is what tells us the page is
 * broken; this tells us which group to repair.
 */
export function usedGroups(text: string) {
  const t = stripInert(text);
  const groups = new Set<string>();
  for (const m of t.matchAll(/<ref[^>]*?group\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>/]+))/gi))
    groups.add((m[1] ?? m[2] ?? m[3]).trim());
  for (const m of t.matchAll(/\{\{ *#tag:ref *\|[^}]*?group\s*=\s*"?([^"|}]+)/gi))
    groups.add(m[1].trim());
  // {{efn}}/{{یادچپ}} with an explicit group, and without one (→ persian-alpha)
  for (const m of t.matchAll(/\{\{ *(?:یادچپ|Efn|efn)\b([^}]*)\}\}/gi)) {
    const g = m[1].match(/(?:گروه|group)\s*=\s*"?([^"|}]+)/i);
    groups.add(g ? g[1].trim() : 'persian-alpha');
  }
  return [...groups].filter(Boolean);
}

const NOTE_HEADING = /^(={2,4}) *(یادداشت|یادداشت‌ها|یادداشت ها|یادداشت‌های توضیحی|پانویس‌ها|پاورقی|پاورقی‌ها|نکته‌ها|واژه‌نامه) *={2,4} *$/m;
const REF_HEADING  = /^(={2,4}) *(منابع|منبع|مراجع|پانویس|پانویس‌ها|پانوشت|پانوشت‌ها|منابع و پانویس|منابع و یادداشت‌ها|یادداشت‌ها و منابع) *={2,4} *$/m;

/** where the category / DEFAULTSORT block starts — the notes list goes above it */
function tailStart(text: string) {
  const cats = [...text.matchAll(/^\[\[ *(?:رده|Category) *:/gm)];
  const sort = text.search(/\{\{ *(?:ترتیب‌پیش‌فرض|DEFAULTSORT)/i);
  const marks = [cats.length ? cats[0].index! : -1, sort].filter(i => i >= 0);
  return marks.length ? Math.min(...marks) : text.length;
}

/** insert a container for every group that lacks one */
export function planContainers(text: string, groups: string[]) {
  const need = groups.filter(g => !hasContainerFor(text, g));
  if (!need.length) return null;
  const blocks = need.map(container).join('\n');

  const nh = text.match(NOTE_HEADING);
  if (nh) {
    const at = nh.index! + nh[0].length;
    return { next: text.slice(0, at) + '\n' + blocks + text.slice(at), where: `under ${nh[0].trim()}`, need };
  }
  const rh = text.match(REF_HEADING);
  if (rh) {
    const lvl = rh[1];
    return { next: text.slice(0, rh.index!) + `${lvl} یادداشت‌ها ${lvl}\n${blocks}\n\n` + text.slice(rh.index!),
             where: `new section above ${rh[0].trim()}`, need };
  }
  const at = tailStart(text);
  return { next: text.slice(0, at).replace(/\s+$/, '') + `\n\n== یادداشت‌ها ==\n${blocks}\n\n` + text.slice(at),
           where: 'new section before the categories', need };
}

/** a bare `|` at depth zero would split the template argument; pipes inside
 *  [[…]] / {{…}} are parsed by the inner construct and are safe */
export function hasBarePipe(s: string) {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    if (s.startsWith('{{', i) || s.startsWith('[[', i)) { depth++; i++; continue; }
    if (s.startsWith('}}', i) || s.startsWith(']]', i)) { depth--; i++; continue; }
    if (s[i] === '|' && depth <= 0) return true;
  }
  return false;
}

/**
 * Restore what the en original used: raw <ref group="X"> → {{یادچپ}} (fa's
 * {{efn}}), which routes through {{#tag:ref}} and tolerates {{sfn}} inside.
 */
export function convertToEfn(text: string, group: string) {
  const g = esc(group);
  let notes = 0, unsafe = 0, out = text;

  // Self-closing reuses FIRST. The paired pattern below would otherwise match
  // `<ref group=G name=x />` as an opening tag — `[^>]*?` happily absorbs the
  // `/` — and swallow everything up to the next </ref>.
  out = out.replace(
    new RegExp(`<ref([^>]*?)group\\s*=\\s*"?${g}"?([^>]*?)/>`, 'gi'),
    (whole, pre, post) => {
      const name = (pre + post).match(/name\s*=\s*"([^"]*)"|name\s*=\s*'([^']*)'|name\s*=\s*([^\s"'>]+)/i);
      if (!name) { unsafe++; return whole; }
      return `{{یادچپ|name=${name[1] ?? name[2] ?? name[3]}}}`;
    });

  out = out.replace(
    new RegExp(`<ref([^>]*?)group\\s*=\\s*"?${g}"?([^>]*?)>([\\s\\S]*?)</ref>`, 'gi'),
    (whole, pre, post, body) => {
      if (hasBarePipe(body)) { unsafe++; return whole; }
      const name = (pre + post).match(/name\s*=\s*"([^"]*)"|name\s*=\s*'([^']*)'|name\s*=\s*([^\s"'>]+)/i);
      const n = name ? (name[1] ?? name[2] ?? name[3]) : null;
      notes++;
      return n ? `{{یادچپ|name=${n}|1=${body}}}` : `{{یادچپ|1=${body}}}`;
    });

  const before = out;
  out = out
    .replace(new RegExp(`<references[^>]*group\\s*=\\s*"?${g}"?[^>]*/?>`, 'gi'), '{{یادداشت‌ها}}')
    .replace(new RegExp(`\\{\\{ *(?:پانویس|یادداشت‌ها)\\s*\\|[^}]*(?:گروه|group)\\s*=\\s*"?${g}"?[^}]*\\}\\}`, 'gi'), '{{یادداشت‌ها}}');

  return { out, notes, unsafe, containerSwapped: before !== out };
}

/**
 * Every ns-0 title currently in the tracking category.
 *
 * `list=categorymembers` and the rendered category page are BOTH stale — one
 * reported 0 members while 35 were live, and 41 while 64 were. CirrusSearch
 * lags too, just differently. The union of the two, re-rendered, is the only
 * reliable input.
 */
export async function collectCandidates(cat = TRACKING_CAT) {
  const titles = new Set<string>();
  let cont: Record<string, string> = {};
  for (;;) {
    const r = await apiGet({ action: 'query', list: 'categorymembers', cmtitle: cat,
      cmlimit: '500', cmnamespace: '0', ...cont });
    for (const m of r.query.categorymembers) titles.add(m.title);
    if (!r.continue) break;
    cont = r.continue;
  }
  const viaCat = titles.size;
  let off = 0;
  for (;;) {
    const r = await apiGet({ action: 'query', list: 'search',
      srsearch: `incategory:"${cat.replace(/^رده:/, '')}"`, srlimit: '50',
      sroffset: String(off), srnamespace: '0' });
    for (const m of r.query.search) titles.add(m.title);
    if (!r.continue) break;
    off = r.continue.sroffset;
  }
  return { titles: [...titles], viaCat };
}

/**
 * Ground truth for "is this page broken".
 *
 * Parses the SUPPLIED wikitext rather than `action=parse&page=`, because the
 * page render is served from a parser cache that can be days stale — it both
 * hides fixes and reports errors that are already gone.
 */
export async function renderGroups(title: string, text: string) {
  const r = await apiPost({ action: 'parse', title, text, contentmodel: 'wikitext',
    prop: 'text', format: 'json', formatversion: '2' });
  const html = r.parse.text as string;
  return {
    html,
    groups: [...new Set([...html.matchAll(GROUP_ERR)].map(m => m[1]))],
    items: (html.match(/<li id="cite&#95;note|<li id="cite_note/g) ?? []).length,
  };
}

export type Kind =
  'clean' | 'missing-container' | 'misplaced-container' | 'nested-ref' | 'malformed' | 'unknown';

/**
 * Decide the failure mode from wikitext + the set of groups that are broken.
 *
 * Order matters: a malformed group name is never "fixed" by adding a list, and a
 * stranded list looks present to every container check, so both must be ruled
 * out before the ordinary missing-container path.
 */
export function classify(text: string, groups: string[]): { kind: Kind; detail: string; groups: string[] } {
  if (!groups.length) return { kind: 'clean', detail: 'no note group needs a list', groups };

  const malformed = groups.filter(looksMalformed);
  if (malformed.length) return { kind: 'malformed', detail: `group= is not a group name: ${malformed.join('، ')}`, groups: malformed };

  const missing = groups.filter(g => !hasContainerFor(text, g));
  if (missing.length) return { kind: 'missing-container', detail: `no list for ${missing.join('، ')}`, groups: missing };

  const misplaced = groups.filter(g => containerIsMisplaced(text, g));
  if (misplaced.length) return { kind: 'misplaced-container', detail: `the list for ${misplaced.join('، ')} sits above the notes it should collect`, groups: misplaced };

  const nested = groups.filter(g => hasNestedRefTemplate(text, g));
  if (nested.length) return { kind: 'nested-ref', detail: `{{sfn}} nested in a raw grouped ref (${nested.join('، ')})`, groups: nested };

  return { kind: 'clean', detail: 'every group already has a usable list', groups: [] };
}

/**
 * Apply the fix for a mechanical class. Returns null when there is nothing safe
 * to do — the caller reports those for a human rather than guessing.
 */
export function applyFix(text: string, k: Kind, groups: string[]) {
  if (k === 'missing-container' || k === 'misplaced-container') {
    let base = text;
    if (k === 'misplaced-container') for (const g of groups) base = stripContainer(base, g);
    const p = planContainers(base, groups);
    return p ? { text: p.next, note: `فهرست ${p.need.join('، ')} — ${p.where}` } : null;
  }
  if (k === 'nested-ref') {
    let out = text, notes = 0;
    for (const g of groups) {
      const r = convertToEfn(out, g);
      if (!r.containerSwapped) continue;
      out = r.out; notes += r.notes;
    }
    return out === text ? null : { text: out, note: `${notes} یادداشت به الگوی یادچپ` };
  }
  return null;
}

export interface Diagnosis {
  title: string;
  revid: number;
  timestamp: string;
  text: string;
  groups: string[];
  /** what to do about it */
  kind: 'clean' | 'missing-container' | 'misplaced-container' | 'nested-ref' | 'malformed' | 'unknown';
  detail: string;
}

/** read + render a page and decide which failure mode it is */
export async function diagnose(title: string): Promise<Diagnosis> {
  const p = await readPage(title);
  const { groups } = await renderGroups(title, p.text);
  const base = { title, revid: p.revid, timestamp: p.timestamp!, text: p.text };

  if (!groups.length) return { ...base, groups, kind: 'clean', detail: 'renders clean' };

  const c = classify(p.text, groups);
  // the render says it is broken, so a 'clean' verdict here means the wikitext
  // rules cannot explain it — that is a human's problem, not a no-op
  if (c.kind === 'clean')
    return { ...base, groups, kind: 'unknown', detail: `container present, no nested ref — needs a human (${groups.join('، ')})` };
  return { ...base, groups: c.groups, kind: c.kind, detail: c.detail };
}
