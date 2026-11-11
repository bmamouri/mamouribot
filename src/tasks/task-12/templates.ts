/**
 * وظیفهٔ ۱۲, extensions ۳–۵ — red links that sit inside template calls.
 *
 *  * `{{پیوند با میان‌ویکی|X|Y}}` (and its redirects) and `{{بت|X|en=Y}}` render a link to
 *    the fa title X and carry the en title Y. When X is red but Y's fa article exists under
 *    another name X′, the call becomes `[[X′|<the editor's label>]]`.
 *  * A citation's `|author-link=` (and the other CS1 `*-link` parameters) holds a BARE
 *    title, which the wikilink scan cannot see. When it is a red Latin title whose fa
 *    article exists, only that value changes; the visible `last=`/`first=` never do.
 *  * `{{بت}}` is being retired by its author. On a page this task is ALREADY editing for a
 *    real repair, every remaining `{{بت}}` call becomes `{{پیوند با میان‌ویکی}}`. Never on
 *    its own: a diff whose only change is a template swap is a cosmetic edit.
 *
 * Every call this module cannot read with certainty is returned as a problem and left
 * byte-for-byte as it was. The resolution itself is the same ladder as plain links
 * (`resolve.ts`), so a call is only ever re-pointed on Wikidata evidence.
 */
import { templateCalls } from '../../lib/gates.js';
import { FA, type Resolution } from './resolve.js';
import { PERSIAN } from './detect.js';

export const ILL_NAMES = new Set(['پیوند با میان‌ویکی', 'پبم', 'پم', 'link-interwiki', 'pam']);
export const BT_NAME = 'بت';
const CANONICAL_ILL = 'پیوند با میان‌ویکی';

/**
 * A title that starts with a real namespace. `{{بت}}` colon-prefixes its target and
 * `{{پیوند با میان‌ویکی}}` does not, so converting `{{بت|رده:X}}` would CATEGORISE the
 * page. An ordinary colon in a title («لیگ عدالت: نفرین») is not a namespace.
 */
const NAMESPACE_PREFIX = /^\s*:?\s*(?:رده|category|پرونده|file|image|الگو|template|پودمان|module|ویکی‌پدیا|wikipedia|وپ|wp|کاربر|user|بحث|talk|راهنما|help|درگاه|portal|مدیاویکی|mediawiki|ویژه|special|پیش‌نویس|draft|[a-z]{2,3}(?:-[a-z]+)?)\s*:/i;

export interface InterwikiCall {
  start: number;
  end: number;
  kind: 'ill' | 'bt';
  /** the fa title the call links (param 1) */
  fa: string;
  /** the en title (param 2 of ILL, `en=` of بت) */
  foreign: string;
  lang: string;
  /** the label the editor chose, or null for "same as fa" */
  label: string | null;
  /** why this call cannot be touched; null when it can */
  problem: string | null;
  raw: string;
}

const norm = (name: string) => {
  const n = name.replace(/_/g, ' ').replace(/^\s*(?:الگو|template)\s*:/i, '').trim();
  return n.charAt(0).toLowerCase() + n.slice(1);
};

/** Split a template body at pipes outside nested `{{…}}` and `[[…]]`. */
export function splitArgs(body: string): string[] {
  const parts: string[] = [];
  let cur = '', depth = 0;
  for (let i = 0; i < body.length; i++) {
    const two = body.slice(i, i + 2);
    if (two === '{{' || two === '[[') { depth++; cur += two; i++; continue; }
    if ((two === '}}' || two === ']]') && depth) { depth--; cur += two; i++; continue; }
    if (body[i] === '|' && depth === 0) { parts.push(cur); cur = ''; continue; }
    cur += body[i];
  }
  parts.push(cur);
  return parts;
}

interface Params { positional: string[]; named: Map<string, string> }
function readParams(args: string[]): Params {
  const positional: string[] = [];
  const named = new Map<string, string>();
  for (const a of args) {
    const eq = a.indexOf('=');
    // `=` inside a nested link or template is not a parameter separator.
    const nested = Math.min(...['[[', '{{'].map(t => a.indexOf(t)).filter(i => i >= 0), Infinity);
    if (eq >= 0 && eq < nested) {
      const k = a.slice(0, eq).trim();
      named.set(k, a.slice(eq + 1).trim());
    } else {
      positional.push(a.trim());
    }
  }
  return { positional, named };
}

/** Every `{{پیوند با میان‌ویکی}}` / `{{بت}}` call in the text, with what can be done to it. */
export function parseInterwikiCalls(text: string): InterwikiCall[] {
  const out: InterwikiCall[] = [];
  for (const c of templateCalls(text, { mask: true })) {
    const name = norm(c.name);
    const isIll = ILL_NAMES.has(name);
    if (!isIll && name !== BT_NAME) continue;
    const raw = text.slice(c.start, c.end);
    const body = raw.slice(2, -2);
    const args = splitArgs(body).slice(1);
    const p = readParams(args);
    const call: InterwikiCall = { start: c.start, end: c.end, kind: isIll ? 'ill' : 'bt',
      fa: '', foreign: '', lang: 'en', label: null, problem: null, raw };
    const fail = (why: string) => { call.problem = why; out.push(call); };

    if (args.some(a => /\{\{|\[\[|<!--|<ref/i.test(a))) { fail('nested markup in an argument'); continue; }
    if (p.named.has('۱') || p.named.has('۲')) { fail('Persian-digit parameter name, which the template ignores'); continue; }
    if (isIll) {
      const allowed = new Set(['1', '2', 'عنوان', 'زبان']);
      const unknown = [...p.named.keys()].filter(k => !allowed.has(k));
      if (unknown.length) { fail(`unknown parameter ${unknown.join(', ')}`); continue; }
      call.fa = p.named.get('1') ?? p.positional[0] ?? '';
      call.foreign = p.named.get('2') ?? p.positional[1] ?? '';
      call.lang = (p.named.get('زبان') ?? 'en').trim() || 'en';
      call.label = p.named.get('عنوان') || null;
      if (p.positional.length > 2 || (p.named.has('1') && p.positional.length)) {
        fail('extra positional argument'); continue;
      }
    } else {
      const allowed = new Set(['1', '2', 'en']);
      const unknown = [...p.named.keys()].filter(k => !allowed.has(k));
      if (unknown.length) { fail(`unknown parameter ${unknown.join(', ')} — {{بت}} ignores it`); continue; }
      // A bare positional AFTER «1=» overwrites argument 1 — the gate's
      // positional_after_named defect. Never guess which one the editor meant.
      if (p.named.has('1') && p.positional.length) {
        fail('bare positional after «1=»'); continue;
      }
      call.fa = p.named.get('1') ?? p.positional[0] ?? '';
      call.label = (p.named.get('2') ?? p.positional[1]) || null;
      call.foreign = p.named.get('en') ?? '';
      if (p.positional.length > 2) { fail('extra positional argument'); continue; }
    }
    call.fa = call.fa.trim(); call.foreign = call.foreign.trim();
    if (!call.fa) { fail('no fa title'); continue; }
    if (!call.foreign) { fail('no en title'); continue; }
    if (NAMESPACE_PREFIX.test(call.fa)) { fail('fa title has a namespace prefix'); continue; }
    if (call.lang !== 'en') { fail(`source language ${call.lang}, not en`); continue; }
    out.push(call);
  }
  // Calls nested inside another interwiki call would overlap on splice; there are none in
  // practice, and if there ever are, a human decides.
  for (const a of out) for (const b of out) {
    if (a !== b && a.start <= b.start && b.end <= a.end) b.problem ??= 'nested inside another call';
  }
  return out;
}

/** `{{بت}}` → `{{پیوند با میان‌ویکی}}`, same rendering. Null when it cannot be converted. */
export function btToIll(call: InterwikiCall): string | null {
  if (call.kind !== 'bt' || call.problem) return null;
  const label = call.label && call.label !== call.fa ? `|عنوان=${call.label}` : '';
  return `{{${CANONICAL_ILL}|${call.fa}|${call.foreign}${label}}}`;
}

const sameTitle = (a: string, b: string) =>
  a.replace(/_/g, ' ').trim().toLowerCase() === b.replace(/_/g, ' ').trim().toLowerCase();

/**
 * What a red call should become, or why not.
 *
 * `faLive` is the set of fa titles that exist; a call whose X is already there renders a
 * working link and is not this task's business.
 */
export function repairFor(
  call: InterwikiCall, res: Map<string, Resolution>, faLive: Set<string>,
  foreign = false,
): { text: string } | { review: string } | null {
  if (call.fa && faLive.has(call.fa)) return null;   // already blue: not this task's business
  if (call.problem) return { review: call.problem };
  const r = res.get(call.foreign);
  if (!r || r.kind !== FA || !r.link) return null;
  // A LATIN «fa title» that is not the en title names something else:
  // `{{بت|Walt Disney Records|en=Hollywood Records}}` («شبکه دیزنی») would otherwise
  // become a link labelled Walt Disney Records pointing at Hollywood Records.
  if (!PERSIAN.test(call.fa) && !sameTitle(call.fa, call.foreign)) {
    const viaFa = res.get(call.fa);
    if (!(viaFa?.kind === FA && viaFa.link === r.link)) {
      return { review: `the call's two titles name different subjects (${call.fa} / ${call.foreign})` };
    }
  }
  let label = call.label ?? call.fa;
  if (!PERSIAN.test(label) && !foreign) label = r.link;
  return { text: label === r.link ? `[[${r.link}]]` : `[[${r.link}|${label}]]` };
}

// --- extension ۳: the bare-title *-link parameters of CS1 citations ---------------------

/** CS1 parameters whose value is a bare page title, per پودمان:Citation/CS1/fa/Configuration. */
const CITE_LINK_PARAM = /^(?:(?:author|subject|editor|translator|contributor|interviewer)\d*-?link\d*|authorlink\d*|(?:title|episode|series)-?link)$/i;
const isCitation = (name: string) => {
  const n = norm(name).toLowerCase();
  return n.startsWith('یادکرد') || n.startsWith('cite') || n === 'citation';
};

export interface CiteLink { start: number; end: number; param: string; value: string }

/** Every Latin bare title in a citation's `*-link` parameter, with the VALUE's offsets. */
export function scanCiteLinks(text: string): CiteLink[] {
  const out: CiteLink[] = [];
  for (const c of templateCalls(text, { mask: true })) {
    if (!isCitation(c.name)) continue;
    const body = text.slice(c.start + 2, c.end - 2);
    let off = c.start + 2;
    for (const [i, a] of splitArgs(body).entries()) {
      const here = off;
      off += a.length + 1;
      if (i === 0) continue;
      const eq = a.indexOf('=');
      if (eq < 0) continue;
      const param = a.slice(0, eq).trim();
      if (!CITE_LINK_PARAM.test(param)) continue;
      const rawVal = a.slice(eq + 1);
      const value = rawVal.trim();
      if (!/^[A-Za-z]/.test(value) || /[[\]{}|:#<]/.test(value)) continue;
      const vStart = here + eq + 1 + rawVal.indexOf(value);
      out.push({ start: vStart, end: vStart + value.length, param, value });
    }
  }
  return out;
}

export interface TemplateApplied { text: string; applied: number; converted: number; deferred: string[] }

/**
 * Apply extensions ۳–۵ to one page. `convertBt` is decided by the caller: true only when
 * something else on the page (or a repair here) is a real fix.
 */
export function applyTemplates(
  text: string, res: Map<string, Resolution>, faLive: Set<string>,
  spans: [number, number][] = [], convertBt: 'never' | 'if-repaired' | 'always' = 'if-repaired',
): TemplateApplied {
  const splices: { start: number; end: number; text: string; repair: boolean }[] = [];
  const deferred: string[] = [];
  const inForeign = (at: number) => spans.some(([s, e]) => s <= at && at < e);

  for (const call of parseInterwikiCalls(text)) {
    const r = repairFor(call, res, faLive, inForeign(call.start));
    if (r && 'review' in r) { deferred.push(call.raw.replace(/\s+/g, ' ')); continue; }
    if (r) { splices.push({ start: call.start, end: call.end, text: r.text, repair: true }); continue; }
    const conv = btToIll(call);
    if (conv) splices.push({ start: call.start, end: call.end, text: conv, repair: false });
  }
  for (const l of scanCiteLinks(text)) {
    const r = res.get(l.value);
    if (r?.kind === FA && r.link && !faLive.has(l.value)) {
      splices.push({ start: l.start, end: l.end, text: r.link, repair: true });
    }
  }

  const applied = splices.filter(s => s.repair).length;
  const doConvert = convertBt === 'always' || (convertBt === 'if-repaired' && applied > 0);
  const chosen = splices.filter(s => s.repair || doConvert).sort((a, b) => b.start - a.start);
  let out = text;
  for (const s of chosen) out = out.slice(0, s.start) + s.text + out.slice(s.end);
  return { text: out, applied, converted: chosen.length - applied, deferred };
}
