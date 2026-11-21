/**
 * وظیفهٔ ۱۹ — the small amount of wikitext structure the task needs: opaque regions,
 * template spans, citation parameters, `<ref>` bodies.
 *
 * Offsets are JS string offsets into the text passed in. Nothing here shells out, so an
 * astral character (𝑥, an emoji) cannot shift a span the way a code-point offset from
 * Python would.
 */

export type Span = [number, number];

const OPAQUE = /<!--[\s\S]*?(?:-->|$)|<(nowiki|pre|syntaxhighlight|source|math|chem|ce|code|score|timeline|graph|mapframe|maplink|templatedata|templatestyles|poem|gallery|imagemap|hiero)\b[^>]*?(?:\/>|>[\s\S]*?<\/\1\s*>)/gi;

/** Comments, `<nowiki>`, `<pre>`, `<syntaxhighlight>`, `<math>`, `<gallery>`, …: never edited. */
export function opaqueSpans(text: string): Span[] {
  const out: Span[] = [];
  for (const m of text.matchAll(OPAQUE)) out.push([m.index!, m.index! + m[0].length]);
  return out;
}

export function inSpans(spans: Span[], at: number, end = at + 1): boolean {
  return spans.some(([s, e]) => at < e && end > s);
}

export interface Tpl { start: number; end: number; name: string; depth: number }

/**
 * Every `{{…}}` call (parser functions and `{{{param}}}` included as non-templates), with
 * its nesting depth. Opaque regions are skipped. An unbalanced `{{` ends the scan there,
 * and the caller treats the rest of the page as inside a template (nothing is touched).
 */
export function templateSpans(text: string, opaque: Span[] = opaqueSpans(text)): { calls: Tpl[]; unclosedAt: number } {
  const calls: Tpl[] = [];
  const stack: { start: number; triple: boolean }[] = [];
  const op = [...opaque].sort((a, b) => a[0] - b[0]);
  let oi = 0;
  for (let i = 0; i < text.length - 1; i++) {
    while (oi < op.length && op[oi][1] <= i) oi++;
    if (oi < op.length && op[oi][0] <= i) { i = op[oi][1] - 1; continue; }
    if (text[i] === '{' && text[i + 1] === '{') {
      const triple = text[i + 2] === '{' && text[i + 3] !== '{';
      stack.push({ start: i, triple });
      i += triple ? 2 : 1;
    } else if (text[i] === '}' && text[i + 1] === '}' && stack.length) {
      const top = stack[stack.length - 1];
      if (top.triple) {
        if (text[i + 2] !== '}') continue;
        stack.pop(); i += 2; continue;
      }
      stack.pop();
      const end = i + 2;
      const head = text.slice(top.start + 2, Math.min(end - 2, top.start + 200));
      const name = head.split(/[|}\n]/)[0].replace(/<!--[\s\S]*?-->/g, '').trim();
      calls.push({ start: top.start, end, name, depth: stack.length });
      i += 1;
    }
  }
  return { calls, unclosedAt: stack.length ? stack[0].start : -1 };
}

/** `[[…]]` spans (wikilinks, file links, categories). URLs inside them are never edited. */
export function wikilinkSpans(text: string, opaque: Span[]): Span[] {
  const out: Span[] = [];
  const stack: number[] = [];
  for (let i = 0; i < text.length - 1; i++) {
    if (inSpans(opaque, i)) continue;
    if (text[i] === '[' && text[i + 1] === '[') { stack.push(i); i++; }
    else if (text[i] === ']' && text[i + 1] === ']' && stack.length) {
      const s = stack.pop()!;
      if (!stack.length) out.push([s, i + 2]);
      i++;
    }
  }
  return out;
}

export function normName(name: string): string {
  return name.replace(/_/g, ' ').replace(/\s+/g, ' ').replace(/^(?:الگو|template)\s*:/i, '').trim().toLowerCase();
}

/** Citation templates whose parameters this task understands. */
export function citationKind(name: string): 'web' | 'news' | 'other-cite' | null {
  const n = normName(name);
  if (n === 'یادکرد وب' || n === 'cite web' || n === 'یادکرد-وب') return 'web';
  if (n === 'یادکرد خبر' || n === 'cite news') return 'news';
  if (n === 'یادکرد' || n === 'citation' || n.startsWith('یادکرد ') || n.startsWith('cite ')) return 'other-cite';
  return null;
}

// ---------------------------------------------------------------------------
// Parameters
// ---------------------------------------------------------------------------

export interface Param {
  /** index of the `|` that opens this segment, relative to the template start */
  at: number;
  raw: string;
  key: string | null;      // trimmed key, null for a positional argument
  keyNorm: string | null;
  /** offsets of the value core (whitespace-trimmed) relative to the template start */
  vStart: number;
  vEnd: number;
  value: string;           // trimmed value
}

/** Split a template call into top-level parameters, keeping exact offsets. */
export function parseParams(call: string): Param[] {
  const params: Param[] = [];
  const body0 = 2, bodyEnd = call.length - 2;
  let depthB = 0, depthL = 0;
  const cuts: number[] = [];
  for (let i = body0; i < bodyEnd; i++) {
    const two = call.slice(i, i + 2);
    if (two === '{{') { depthB++; i++; continue; }
    if (two === '}}') { depthB = Math.max(0, depthB - 1); i++; continue; }
    if (two === '[[') { depthL++; i++; continue; }
    if (two === ']]') { depthL = Math.max(0, depthL - 1); i++; continue; }
    if (call.startsWith('<!--', i)) { const e = call.indexOf('-->', i); i = e < 0 ? bodyEnd : e + 2; continue; }
    if (call[i] === '|' && depthB === 0 && depthL === 0) cuts.push(i);
  }
  for (let k = 0; k < cuts.length; k++) {
    const at = cuts[k];
    const segEnd = k + 1 < cuts.length ? cuts[k + 1] : bodyEnd;
    const raw = call.slice(at + 1, segEnd);
    let eq = -1, dB = 0, dL = 0;
    for (let i = 0; i < raw.length; i++) {
      const two = raw.slice(i, i + 2);
      if (two === '{{') { dB++; i++; continue; }
      if (two === '}}') { dB = Math.max(0, dB - 1); i++; continue; }
      if (two === '[[') { dL++; i++; continue; }
      if (two === ']]') { dL = Math.max(0, dL - 1); i++; continue; }
      if (raw[i] === '=' && dB === 0 && dL === 0) { eq = i; break; }
    }
    const valRaw = eq < 0 ? raw : raw.slice(eq + 1);
    const valOff = at + 1 + (eq < 0 ? 0 : eq + 1);
    const lead = valRaw.length - valRaw.trimStart().length;
    const value = valRaw.trim();
    const key = eq < 0 ? null : raw.slice(0, eq).replace(/<!--[\s\S]*?-->/g, '').trim();
    params.push({
      at, raw, key, keyNorm: key === null ? null : key.replace(/_/g, ' ').replace(/\s+/g, ' ').toLowerCase(),
      vStart: valOff + lead, vEnd: valOff + lead + value.length, value,
    });
  }
  return params;
}

/** Parameters that hold the citation's main URL. Archive and chapter URLs are not here on purpose. */
export const URL_KEYS = new Set(['نشانی', 'پیوند', 'پیوند اصلی', 'url', 'URL'.toLowerCase()]);
export const TITLE_KEYS = new Set(['عنوان', 'کتاب', 'title', 'script-title', 'عنوان به خط', 'trans-title', 'ترجمه عنوان']);
export const ARCHIVE_URL_KEYS = new Set(['پیوند بایگانی', 'نشانی بایگانی', 'archive-url', 'archiveurl']);
export const ARCHIVE_DATE_KEYS = new Set(['تاریخ بایگانی', 'archive-date', 'archivedate']);
export const URL_STATUS_KEYS = new Set(['چگونگی پیوند', 'پیوند مرده', 'url-status', 'dead-url', 'deadurl']);

export function getParam(params: Param[], keys: Set<string>): Param | undefined {
  return params.find(p => p.keyNorm !== null && keys.has(p.keyNorm) && p.value !== '');
}
export function hasKey(params: Param[], keys: Set<string>): boolean {
  return params.some(p => p.keyNorm !== null && keys.has(p.keyNorm));
}

/** Which script the citation's own parameter names use, so added names match them. */
export function paramScript(params: Param[]): 'fa' | 'en' {
  let fa = 0, en = 0;
  for (const p of params) {
    if (!p.key) continue;
    if (/[؀-ۿ]/.test(p.key)) fa++; else if (/^[a-z][a-z0-9-]*$/i.test(p.key)) en++;
  }
  return en > fa ? 'en' : 'fa';
}

/**
 * Insert `|key=value` pairs before the closing braces, copying the spacing of the call:
 * a call written one parameter per line gets one per line, `| key = value` gets spaces.
 */
export function appendParams(call: string, pairs: [string, string][]): string {
  if (!pairs.length) return call;
  const params = parseParams(call);
  const multiline = params.length >= 2 && params.filter(p => /\n\s*$/.test(p.raw)).length >= params.length - 1;
  const spaced = params.filter(p => p.key && /\s=|=\s/.test(p.raw.slice(0, p.raw.indexOf('=') + 2))).length > params.length / 2;
  const leadSpace = params.filter(p => /^\s/.test(p.raw)).length > params.length / 2;
  const eq = spaced ? ' = ' : '=';
  const lead = leadSpace ? ' ' : '';
  let body = call.slice(0, -2);
  if (multiline) body = body.replace(/\s*$/, '');
  const add = pairs.map(([k, v]) => multiline ? `\n|${lead}${k}${eq}${v}` : `${spaced && !leadSpace && !/\s$/.test(body) ? ' ' : ''}|${lead}${k}${eq}${v}`).join('');
  return body + add + (multiline ? '\n' : '') + '}}';
}

/** Replace the value core of one parameter, keeping its key and surrounding whitespace. */
export function setValue(call: string, p: Param, value: string): string {
  return call.slice(0, p.vStart) + value + call.slice(p.vEnd);
}

// ---------------------------------------------------------------------------
// <ref> bodies
// ---------------------------------------------------------------------------

export interface Ref { start: number; end: number; open: string; body: string; bodyStart: number }

export function refs(text: string, opaque: Span[]): Ref[] {
  const out: Ref[] = [];
  const re = /<ref(\s[^>]*?)?(?<!\/)>([\s\S]*?)<\/ref\s*>/gi;
  for (const m of text.matchAll(re)) {
    const s = m.index!;
    if (inSpans(opaque, s)) continue;
    const open = m[0].slice(0, m[0].indexOf('>') + 1);
    out.push({ start: s, end: s + m[0].length, open, body: m[2], bodyStart: s + open.length });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Escaping values written into a template parameter
// ---------------------------------------------------------------------------

/** Make arbitrary source text safe as a template parameter value. */
export function escapeParam(s: string): string {
  return s
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\[/g, '&#91;').replace(/\]/g, '&#93;')
    .replace(/\{/g, '&#123;').replace(/\}/g, '&#125;')
    .replace(/\|/g, '{{!}}')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/~{3,}/g, m => '&#126;'.repeat(m.length))
    .replace(/'{2,}/g, m => '&#39;'.repeat(m.length))
    .replace(/__([A-Zا-ی]+)__/g, '&#95;_$1_&#95;')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
