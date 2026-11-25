/**
 * وظیفهٔ ۲۰ — the two approved kinds of change, as pure functions on wikitext.
 *
 *   1. Dictionary values. A parameter on the whitelist whose WHOLE value (comments, refs
 *      and surrounding whitespace aside) matches an approved entry gets the entry's Persian
 *      value. In infoboxes the key is (template, parameter, value); in navboxes, group
 *      headings use the `ناوبری` key.
 *   2. Navbox labels. `[[Persian article|English label]]` inside a navbox list: the link
 *      already goes where a human sent it, so the label becomes the article's title, with a
 *      trailing disambiguator «(…)» removed. No dictionary, no guess.
 *
 * Nothing else is touched. Every case below the line is left exactly as it was, and each
 * one has a test: a value with a template inside, a partial match inside a phrase, a value
 * whose key belongs to a different template, a link target, a parameter not on the
 * whitelist, a label carrying a qualifier («FW: …», «(5-HT)», Roman numerals), a link
 * inside a ref, comment or nowiki.
 */
import { lookup, normTemplate, paramFamily, type Dictionary, NAVBOX_KEY } from './dictionary.js';
import { PATTERN_PARAMS, rewritePattern } from './patterns.js';

export interface Change { kind: 'value' | 'group' | 'label' | 'pattern'; template: string; param: string; from: string; to: string }
export interface Result { text: string; changes: Change[]; skipped: string[] }

/** Navbox-family template names (canonical and redirects), lower-cased. */
export const NAVBOX_FAMILY = new Set([
  'navbox', 'پیوندان', 'پیونددان', 'ناوبری تاشو', 'horror navbox', 'ناوبری', 'راهبری',
  'جعبه گشتن پویا با عکس', 'ناوباکس', 'جعبه گشتن', 'footer', 'جعبه ناوبری',
  'navbox with collapsible groups', 'navbox with collapsible sections',
  'navbox with columns', 'جعبه ناوبر با ستون',
  'navbox subgroup', 'navbox generic subgroup', 'navbox subgroups', 'زیرگروه ناوجعبه',
  'navbox musical artist', 'military navigation',
  'sidebar', 'نوار کناری', 'نوار جانبی', 'sidebar with collapsible lists', 'sidebar with collapsible groups',
]);
const NAV_LABEL_PARAM = /^(?:title|above|below|group\d+|heading\d+)$/;
const NAV_LIST_PARAM = /^(?:list\d+|content\d+)$/;

/**
 * The parameters dictionary values may change, per canonical template. A parameter that is
 * not here is never touched, so a new parameter is ignored until a person adds it. Control
 * keys the template reads (`unit_pref`, `pushpin_*`, `*_density_*`, colours, `show-medals`,
 * `status`, `status_system`, `background`) are deliberately absent.
 *
 * `*` lists parameter families safe on any infobox.
 */
export const WHITELIST: Record<string, string[]> = {
  '*': [],
  // The label families of this template (subdivision_type#, leader_title#, …) are translated
  // at display time by پودمان:ترجمه مقدار جعبه since ۲۲ نوامبر ۲۰۲۶, so the bot leaves them
  // alone: an article edit would change nothing a reader sees.
  'جعبه اطلاعات منطقه مسکونی': [],
  'Infobox ecoregion': ['conservation'],
  'Infobox football biography': ['position'],
  'جعبه اطلاعات شناگر': ['strokes'],
  // Infobox officeholder: placeholders and job words only. Names (people, parties, offices)
  // are never in the table for these parameters, so a predecessor called «Vacant» is fine
  // but a predecessor called «John Smith» can never match.
  'Infobox officeholder': ['predecessor#', 'predecessor', 'successor#', 'successor', 'primeminister#',
    'president#', 'vicepresident#', 'website', 'term_end#', 'term_end', 'profession', 'occupation'],
  'جعبه اطلاعات دارو': ['routes_of_administration', 'metabolism', 'excretion', 'bioavailability',
    'protein_bound', 'onset', 'elimination_half-life', 'duration_of_action', 'legal_status',
    'dependency_liability', 'addiction_liability'],
  [NAVBOX_KEY]: ['group#', 'heading#'],
};

const allowed = (template: string, param: string) => {
  const fam = paramFamily(param);
  return (WHITELIST[template] ?? []).includes(fam) || WHITELIST['*'].includes(fam);
};

interface Call { start: number; end: number; name: string; params: Param[] }
interface Param { name: string; valueStart: number; valueEnd: number; value: string }

/** Regions whose content is never edited: comments, nowiki-like blocks, refs. */
function opaqueSpans(text: string): [number, number][] {
  const out: [number, number][] = [];
  const re = /<!--[\s\S]*?(?:-->|$)|<(nowiki|pre|math|syntaxhighlight|source|score|ref|gallery|templatedata)\b[^>]*?(?:\/>|>[\s\S]*?<\/\1\s*>)/gi;
  for (const m of text.matchAll(re)) out.push([m.index!, m.index! + m[0].length]);
  return out;
}
const inside = (spans: [number, number][], at: number) => spans.some(([s, e]) => s <= at && at < e);

/** Every {{…}} call, outer and nested, with top-level params located in the original text. */
export function calls(text: string): Call[] {
  const opaque = opaqueSpans(text);
  const out: Call[] = [];
  const stack: number[] = [];
  for (let i = 0; i < text.length; i++) {
    if (inside(opaque, i)) { const sp = opaque.find(([s, e]) => s <= i && i < e)!; i = sp[1] - 1; continue; }
    if (text.startsWith('{{{', i) && !text.startsWith('{{{{', i)) {
      const j = text.indexOf('}}}', i + 3);
      if (j !== -1 && !text.slice(i + 3, j).includes('{{')) { i = j + 2; continue; }
    }
    if (text.startsWith('{{', i)) { stack.push(i); i++; continue; }
    if (text.startsWith('}}', i) && stack.length) {
      const s = stack.pop()!; const e = i + 2; i++;
      out.push(split(text, s, e, opaque));
    }
  }
  return out;
}

function split(text: string, s: number, e: number, opaque: [number, number][]): Call {
  const segs: [number, number][] = [];
  let d = 0, from = s + 2;
  for (let i = s + 2; i < e - 2; i++) {
    if (inside(opaque, i)) { i = opaque.find(([a, b]) => a <= i && i < b)![1] - 1; continue; }
    if (text.startsWith('{{', i) || text.startsWith('[[', i)) { d++; i++; continue; }
    if ((text.startsWith('}}', i) || text.startsWith(']]', i)) && d) { d--; i++; continue; }
    if (text[i] === '|' && !d) { segs.push([from, i]); from = i + 1; }
  }
  segs.push([from, e - 2]);
  const name = text.slice(segs[0][0], segs[0][1]).split(/[\n#]/)[0].replace(/<!--[\s\S]*?-->/g, '');
  const params: Param[] = [];
  for (const [a, b] of segs.slice(1)) {
    const seg = text.slice(a, b);
    let dd = 0, eq = -1;
    for (let i = 0; i < seg.length; i++) {
      if (seg.startsWith('{{', i) || seg.startsWith('[[', i)) { dd++; i++; continue; }
      if (seg.startsWith('}}', i) || seg.startsWith(']]', i)) { dd--; i++; continue; }
      if (seg[i] === '=' && !dd) { eq = i; break; }
    }
    if (eq < 0) continue;
    params.push({ name: seg.slice(0, eq).trim(), valueStart: a + eq + 1, valueEnd: b, value: seg.slice(eq + 1) });
  }
  return { start: s, end: e, name: normTemplate(name), params };
}

/**
 * The part of a value that is compared and replaced: leading/trailing whitespace, comments
 * and refs are kept outside it, so `|conservation=Vulnerable<ref>…</ref>\n` keeps its ref
 * and its newline.
 */
export function core(value: string): { lead: string; body: string; tail: string } | null {
  const m = /^(\s*(?:<!--[\s\S]*?-->\s*)*)([\s\S]*?)((?:\s*(?:<!--[\s\S]*?-->|<ref\b[^>]*\/>|<ref\b[^>]*>[\s\S]*?<\/ref\s*>))*\s*)$/i.exec(value);
  if (!m) return null;
  const body = m[2];
  // anything structural inside: never a whole-value match
  if (/\{\{|\}\}|<ref|<!--|\[\[(?:file|image|پرونده|تصویر):|\n/i.test(body)) return null;
  return { lead: m[1], body, tail: m[3] };
}

/** `[[a|b]]` → `b`, `[[a]]` → `a`. */
export const delink = (s: string) => s.replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, '$1').replace(/\[\[([^\]]*)\]\]/g, '$1');

/**
 * A value that is exactly one article link with an English label, refs and comments aside:
 * returns the label as `body` (what the dictionary is keyed on). Anything else is null.
 */
export function singleLink(value: string): { lead: string; body: string; tail: string } | null {
  const m = /^(\s*(?:<!--[\s\S]*?-->\s*)*)\[\[([^\[\]|#]+)(?:\|([^\[\]|]+))?\]\]((?:\s*(?:<!--[\s\S]*?-->|<ref\b[^>]*\/>|<ref\b[^>]*>[\s\S]*?<\/ref\s*>))*\s*)$/i.exec(value);
  if (!m) return null;
  const [, lead, target, label, tail] = m;
  if (/^\s*:|^(?:file|image|پرونده|تصویر|رده|category)\s*:/i.test(target)) return null;
  const body = (label ?? target).trim();
  return { lead, body, tail };
}

/** Title shown for a Persian link label: the target with a trailing «(…)» removed. */
export function titleLabel(target: string): string {
  return target.replace(/_/g, ' ').replace(/#.*$/, '').replace(/\s*\([^()]*\)\s*$/, '').trim();
}

/** fa title → its en sitelink title; '' when it has none, undefined when not looked up. */
export type EnTitle = (faTitle: string) => string | undefined;

/**
 * Compare an English label with an English title: spacing and disambiguator aside, case
 * NOT aside. A label that differs only in case is a different thing written with the same
 * letters: `http`, `ssh`, `git` in a list of URI schemes are scheme names, not the protocol
 * «HTTP» or the program «Git» (dry run of ۲۲ نوامبر ۲۰۲۶).
 */
export const nameKey = (s: string) => s.replace(/_/g, ' ').replace(/\s*\([^()]*\)\s*$/, '')
  .normalize('NFC').replace(/[\s\u00a0]+/g, ' ').trim();

/** A label that is a qualifier or code rather than the name of the target. */
const QUALIFIER = /^(?:[A-Z]{1,4}\s*:|[IVXLCDM]+$)|\([^)]*\)|\d|^[A-Z0-9.\-]{1,5}$/;

const LINK = /\[\[([^\[\]|]+)\|([^\[\]|]+)\]\]/g;
const PERSIAN = /[\u0600-\u06FF]/;
const LATIN2 = /[A-Za-z]{2,}/;

/** Persian targets of `[[Persian|English]]` links inside navbox lists: what getTargets must look up. */
export function navboxLabelTargets(text: string): string[] {
  const out = new Set<string>();
  for (const c of calls(text)) {
    if (!NAVBOX_FAMILY.has(c.name.toLowerCase())) continue;
    for (const p of c.params) {
      if (!NAV_LIST_PARAM.test(p.name)) continue;
      for (const m of p.value.matchAll(LINK)) {
        if (PERSIAN.test(m[1]) && !PERSIAN.test(m[2]) && LATIN2.test(m[2])) out.add(m[1].trim());
      }
    }
  }
  return [...out];
}

/**
 * Label edits in one list value, as absolute [start, end, replacement] spans, one per link.
 * Links inside a nested navbox (a child or subgroup, handled as its own call) and inside
 * opaque regions (refs, comments, nowiki) are excluded. List wrappers such as
 * {{فهرست افقی}} are not excluded: their arguments are the items.
 */
function navboxLabels(p: Param, template: string, changes: Change[], skipped: string[],
                      exclude: [number, number][], enTitle: EnTitle): [number, number, string][] {
  const out: [number, number, string][] = [];
  for (const m of p.value.matchAll(LINK)) {
    const at = p.valueStart + m.index!;
    if (inside(exclude, at)) continue;
    const [whole, target, label] = m;
    const t = target.trim();
    if (!PERSIAN.test(t) || PERSIAN.test(label) || !LATIN2.test(label)) continue;
    if (/^\s*:|^(?:رده|پرونده|تصویر|الگو|ویکی‌پدیا|درگاه|category|file|image|template)\s*:/i.test(t)) continue;
    if (QUALIFIER.test(label.trim())) { skipped.push(`برچسب با توضیح: ${whole}`); continue; }
    // The label must BE the English name of the linked article: equal to the en sitelink
    // title, disambiguators and case aside. «Corbyn», «Fe», «Diode» for «لامپ خلأ», «Pro» for
    // «ردمی نوت ۹» are deliberate short or partial labels, and the full Persian title would
    // change what the navbox says (dry run of ۲۲ نوامبر ۲۰۲۶).
    const en = enTitle(t);
    if (en === undefined) { skipped.push(`عنوان انگلیسی نامعلوم: ${whole}`); continue; }
    if (!en || nameKey(en) !== nameKey(label)) { skipped.push(`برچسب نام مقاله نیست: ${whole}`); continue; }
    const to = titleLabel(t);
    if (!to) continue;
    const repl = to === t ? `[[${t}]]` : `[[${t}|${to}]]`;
    changes.push({ kind: 'label', template, param: p.name, from: whole, to: repl });
    out.push([at, at + whole.length, repl]);
  }
  return out;
}

/** Apply every approved change to one page. Pure; no network. */
export function applyPage(text: string, dict: Dictionary | null, canonical: (name: string) => string,
                          enTitle: EnTitle = () => undefined): Result {
  const changes: Change[] = [];
  const skipped: string[] = [];
  // replacements as [start, end, newText] in the original text, applied right to left
  const edits: [number, number, string][] = [];
  const all = calls(text);
  const navSpans: [number, number][] = all.filter(c => NAVBOX_FAMILY.has(c.name.toLowerCase())).map(c => [c.start, c.end]);
  const opaque = opaqueSpans(text);
  for (const c of all) {
    const lower = c.name.toLowerCase();
    const isNav = NAVBOX_FAMILY.has(lower);
    const template = isNav ? NAVBOX_KEY : canonical(c.name);
    for (const p of c.params) {
      if (isNav && NAV_LIST_PARAM.test(p.name)) {
        // links inside a navbox nested in this one belong to that call, not to this one
        const descendants = navSpans.filter(([s, e]) => s > c.start && e <= c.end);
        edits.push(...navboxLabels(p, template, changes, skipped, [...opaque, ...descendants], enTitle));
        continue;
      }
      if (isNav && !NAV_LABEL_PARAM.test(p.name)) continue;
      // number + unit values (half-life, molar mass): a fixed shape, not a dictionary row
      const rule = PATTERN_PARAMS[template]?.[p.name.trim()];
      if (rule) {
        const parts = core(p.value);
        const out = parts && LATIN2.test(parts.body) ? rewritePattern(rule, parts.body) : null;
        if (parts && out) {
          edits.push([p.valueStart, p.valueEnd, parts.lead + out + parts.tail]);
          changes.push({ kind: 'pattern', template, param: p.name, from: parts.body.trim(), to: out });
          continue;
        }
      }
      if (!dict || !allowed(template, p.name)) continue;
      // A value that is exactly one link (`[[Kidney|Renal]]`) is matched on its label and
      // takes the entry only when the entry itself carries a link to an fa article
      // (`[[کلیه|کلیوی]]`); a plain value takes the entry's text without the link, so the
      // bot never adds a link that was not there.
      const one = singleLink(p.value);
      const parts = one ? one : core(p.value);
      if (!parts || !LATIN2.test(parts.body)) continue;
      const entry = lookup(dict, template, p.name, parts.body);
      if (!entry) continue;
      if (one && !/\[\[/.test(entry.fa)) continue;
      const to = one ? entry.fa : delink(entry.fa);
      edits.push([p.valueStart, p.valueEnd, parts.lead + to + parts.tail]);
      changes.push({ kind: isNav ? 'group' : 'value', template, param: p.name, from: parts.body.trim(), to });
    }
  }
  // overlapping edits should not happen (one per link or per value); refuse the page if they do
  edits.sort((a, b) => b[0] - a[0]);
  for (let i = 1; i < edits.length; i++) {
    if (edits[i][1] > edits[i - 1][0]) return { text, changes: [], skipped: ['ویرایش‌های هم‌پوشان؛ صفحه دست‌نخورده ماند'] };
  }
  let out = text;
  for (const [s, e, rep] of edits) out = out.slice(0, s) + rep + out.slice(e);
  return { text: out, changes, skipped };
}
