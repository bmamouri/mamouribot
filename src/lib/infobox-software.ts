import { RENAME, DEAD, DROP_EVEN_IF_SET, STATUS_PARAMS, classifyStatus, type StatusVerdict } from './infobox-software-map.js';

/**
 * Everything that differs between one infobox and another.
 *
 * The parser and rewriter below are generic; only this table is per-template.
 * Keeping it a parameter (rather than a second copy of the engine) matters
 * because the same Persian name can mean different things in different boxes —
 * «گونه» is a genre in جعبه اطلاعات نرم‌افزار but a programming PARADIGM in
 * جعبه اطلاعات زبان برنامه‌نویسی.
 */
export interface Rules {
  /** the template plus every redirect that points at it */
  templateNames: string[];
  /** legacy/variant name -> the name this template currently accepts */
  rename: Record<string, string>;
  /** names with no row at all; removed only when empty unless listed below */
  dead: Set<string>;
  /** dead names removed even when they carry a value */
  dropEvenIfSet: Set<string>;
  /** names handled by the status ladder (active -> drop, stopped -> discontinued) */
  statusParams: Set<string>;
  classifyStatus: (raw: string) => StatusVerdict;
  /**
   * The one comma-list field where a legacy value may be folded into an
   * existing canonical value instead of deferring the page. Null = never merge.
   */
  mergeParam: string | null;
  /**
   * Names that feed the SAME row, most-preferred first, as read off the
   * template's `{{{a|{{{b|{{{c|}}}}}}}}}` chains.
   *
   * Without this a rename can land a value next to an existing alias of the
   * same row — e.g. «گونه»→«پارادایم» on an article that already sets
   * `paradigm`. The template shows `paradigm` and the renamed value stays
   * invisible, which is exactly the defect being repaired, only under a new
   * name. Supply it at runtime from the live template; empty = exact-name
   * matching only.
   */
  aliasGroups?: string[][];
}

/**
 * Extract the alias groups from a template's wikitext.
 *
 * An alias group is one STRICTLY NESTED default chain —
 * `{{{paradigm|{{{paradigms|{{{پارادایم|}}}}}}}}}` — because that is the
 * construct that makes several names feed one value, earlier names winning.
 *
 * Taking every `{{{name` in a data cell instead would be wrong: a cell often
 * holds several independent fields. `| data19 =` of جعبه اطلاعات نرم‌افزار
 * carries `language count`, `language` and `language footnote` together, and
 * treating those as aliases invents collisions between a COUNT, a LIST and a
 * FOOTNOTE that have nothing to do with each other.
 */
export function aliasGroups(src: string): string[][] {
  const body = src.split('{{#invoke:Check for unknown parameters')[0];
  const out: string[][] = [];
  const consumed = new Set<number>();

  for (let i = 0; i < body.length; i++) {
    if (!body.startsWith('{{{', i) || consumed.has(i)) continue;
    const chain: string[] = [];
    let at = i;
    for (;;) {
      if (!body.startsWith('{{{', at)) break;
      consumed.add(at);
      // the name runs to the first | or the closing }}}
      let j = at + 3;
      while (j < body.length && body[j] !== '|' && !body.startsWith('}}}', j)) j++;
      const name = body.slice(at + 3, j).trim();
      if (!name || /[{}]/.test(name)) break;
      chain.push(name);
      if (body[j] !== '|') break;             // no default -> chain ends
      let k = j + 1;
      while (k < body.length && /\s/.test(body[k])) k++;
      if (!body.startsWith('{{{', k)) break;  // default is a literal -> chain ends
      at = k;                                  // default is another param -> continue
    }
    if (chain.length > 1) out.push([...new Set(chain)]);
  }
  return out;
}

/** The template plus every redirect pointing at it (prop=redirects, ۲۰۲۶-۰۹). */
export const TEMPLATE_NAMES = [
  'جعبه اطلاعات نرم‌افزار',
  'جعبه نرم‌افزار',
  'نرم‌افزار',
  'Infobox software',
  'Infobox Software',
  'Infobox web browser',
  'Infobox video game engine',
];

/** Rules for الگو:جعبه اطلاعات نرم‌افزار — the default. */
export const SOFTWARE_RULES: Rules = {
  templateNames: TEMPLATE_NAMES,
  rename: RENAME,
  dead: DEAD,
  dropEvenIfSet: DROP_EVEN_IF_SET,
  statusParams: STATUS_PARAMS,
  classifyStatus,
  mergeParam: 'ژانر',
};

export interface Param {
  /** parameter name, trimmed */
  name: string;
  /** raw value as written, untrimmed */
  rawValue: string;
  /** span of the whole `|name=value` segment inside the article text */
  start: number;
  end: number;
  /** span of just the name token inside the article text */
  nameStart: number;
  nameEnd: number;
  /** span of the value, excluding the `=` */
  valueStart: number;
  valueEnd: number;
}

export interface Infobox {
  start: number;
  end: number;
  params: Param[];
}

export function stripComments(v: string): string {
  return v.replace(/<!--[\s\S]*?-->/g, '');
}

export function isEmpty(v: string): boolean {
  return stripComments(v).trim() === '';
}

/** Locate the infobox call and split it into parameters, brace/bracket aware. */
export function parseInfobox(text: string, templateNames: string[] = TEMPLATE_NAMES): Infobox | null {
  // longest first so a short redirect name can never shadow a longer one
  const alts = [...templateNames].sort((a, b) => b.length - a.length).map(escapeRe).join('|');
  const re = new RegExp(`\\{\\{\\s*(?:${alts})\\s*[|}]`, 'i');
  const m = re.exec(text);
  if (!m) return null;
  const start = m.index;

  // walk to the matching }}
  let depth = 0;
  let i = start;
  let end = -1;
  while (i < text.length) {
    if (text.startsWith('<!--', i)) {
      const c = text.indexOf('-->', i);
      i = c === -1 ? text.length : c + 3;
      continue;
    }
    if (text.startsWith('{{', i)) { depth++; i += 2; continue; }
    if (text.startsWith('}}', i)) {
      depth--; i += 2;
      if (depth === 0) { end = i; break; }
      continue;
    }
    i++;
  }
  if (end === -1) return null;

  // split top-level segments on `|`
  const inner = { from: start + 2, to: end - 2 };
  const params: Param[] = [];
  let d = 0;
  let segStart = -1;
  i = inner.from;
  while (i < inner.to) {
    if (text.startsWith('<!--', i)) {
      const c = text.indexOf('-->', i);
      i = c === -1 ? inner.to : Math.min(c + 3, inner.to);
      continue;
    }
    if (text.startsWith('{{', i) || text.startsWith('[[', i)) { d++; i += 2; continue; }
    if (text.startsWith('}}', i) || text.startsWith(']]', i)) { d--; i += 2; continue; }
    if (text[i] === '|' && d === 0) {
      if (segStart !== -1) pushSeg(text, segStart, i, params);
      segStart = i + 1;
      i++;
      continue;
    }
    i++;
  }
  if (segStart !== -1) pushSeg(text, segStart, inner.to, params);

  return { start, end, params };
}

function pushSeg(text: string, from: number, to: number, out: Param[]) {
  const seg = text.slice(from, to);
  // the name is everything up to the first top-level `=`
  let d = 0;
  let eq = -1;
  for (let i = 0; i < seg.length; i++) {
    if (seg.startsWith('{{', i) || seg.startsWith('[[', i)) { d++; i++; continue; }
    if (seg.startsWith('}}', i) || seg.startsWith(']]', i)) { d--; i++; continue; }
    if (seg[i] === '=' && d === 0) { eq = i; break; }
  }
  if (eq === -1) return; // positional parameter — leave alone
  const rawName = seg.slice(0, eq);
  const name = rawName.trim();
  if (!name) return;
  const nameStart = from + rawName.indexOf(name);
  out.push({
    name,
    rawValue: seg.slice(eq + 1),
    start: from - 1, // include the leading `|`
    end: to,
    nameStart,
    nameEnd: nameStart + name.length,
    valueStart: from + eq + 1,
    valueEnd: to,
  });
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface Change {
  kind: 'rename' | 'drop' | 'merge' | 'discontinued';
  param: string;
  to?: string;
  note?: string;
}

export interface Result {
  text: string;
  changes: Change[];
  /** reasons the page could not be fully handled automatically */
  manual: string[];
}

/**
 * Rewrite one article's infobox. Returns the new text plus a change log.
 * Never drops a non-empty value unless it is explicitly allowed to.
 */
export function fixArticle(text: string, known: Set<string>, rules: Rules = SOFTWARE_RULES): Result | null {
  const ib = parseInfobox(text, rules.templateNames);
  if (!ib) return null;

  const changes: Change[] = [];
  const manual: string[] = [];
  // edits collected as [start, end, replacement]; applied right-to-left
  const edits: [number, number, string][] = [];

  const present = new Map<string, Param[]>();
  for (const p of ib.params) {
    if (!present.has(p.name)) present.set(p.name, []);
    present.get(p.name)!.push(p);
  }
  // names that will exist after the rewrite, seeded with the ones already known
  // A row may be reachable under several names; collapse them to one key so a
  // rename cannot quietly land beside an existing alias of the same row.
  const groupKey = new Map<string, string>();
  for (const g of rules.aliasGroups ?? []) for (const n of g) groupKey.set(n, g[0]);
  const keyOf = (name: string) => groupKey.get(name) ?? name;

  // row key -> the parameter that will carry its value after the rewrite
  const occupied = new Map<string, { param: Param; value: string }>();
  for (const p of ib.params) {
    const k = keyOf(p.name);
    if (known.has(p.name) && !isEmpty(p.rawValue) && !occupied.has(k)) {
      occupied.set(k, { param: p, value: p.rawValue });
    }
  }

  for (const p of ib.params) {
    if (known.has(p.name)) continue; // already valid
    const empty = isEmpty(p.rawValue);

    // --- status family -------------------------------------------------
    if (rules.statusParams.has(p.name)) {
      const verdict = rules.classifyStatus(p.rawValue);
      if (verdict === 'manual') {
        manual.push(`«${p.name}» با مقدار غیراستاندارد: ${stripComments(p.rawValue).trim().slice(0, 60)}`);
        continue;
      }
      if (verdict === 'discontinued') {
        const existing = present.get('discontinued')?.find((x) => !isEmpty(x.rawValue));
        if (!existing) {
          // keep the original line shape: swap the name, swap the value
          edits.push(...renameEdits(text, p, 'discontinued'));
          edits.push([p.valueStart, p.valueEnd, keepShape(p.rawValue, 'yes')]);
          changes.push({ kind: 'discontinued', param: p.name, to: 'discontinued' });
          occupied.set(keyOf('discontinued'), { param: p, value: 'yes' });
        } else {
          edits.push([p.start, p.end, '']);
          changes.push({ kind: 'drop', param: p.name, note: 'discontinued از پیش تنظیم شده بود' });
        }
      } else {
        edits.push([p.start, p.end, '']);
        changes.push({ kind: 'drop', param: p.name, note: 'وضعیت فعال = حالت پیش‌فرض' });
      }
      continue;
    }

    // --- dead parameters -----------------------------------------------
    if (rules.dead.has(p.name)) {
      if (empty || rules.dropEvenIfSet.has(p.name)) {
        edits.push([p.start, p.end, '']);
        changes.push({ kind: 'drop', param: p.name });
      } else {
        manual.push(`«${p.name}» پارامتر حذف‌شده ولی دارای مقدار`);
      }
      continue;
    }

    // --- renames ---------------------------------------------------------
    const target = rules.rename[p.name];
    if (!target) {
      manual.push(`«${p.name}» ناشناخته`);
      continue;
    }

    const holder = occupied.get(keyOf(target));
    if (empty) {
      // nothing to preserve — drop it rather than creating a duplicate
      edits.push([p.start, p.end, '']);
      changes.push({ kind: 'drop', param: p.name, note: 'خالی' });
      continue;
    }
    if (holder === undefined) {
      edits.push(...renameEdits(text, p, target));
      changes.push({ kind: 'rename', param: p.name, to: target });
      occupied.set(keyOf(target), { param: p, value: p.rawValue });
      continue;
    }
    // collision: the canonical name already carries a different value.
    if (stripComments(holder.value).trim() === stripComments(p.rawValue).trim()) {
      edits.push([p.start, p.end, '']);
      changes.push({ kind: 'drop', param: p.name, note: 'تکراری' });
      continue;
    }
    if (target === rules.mergeParam) {
      // genre is a comma list — fold the legacy value into the canonical one.
      const t = holder.param;
      const trailing = /\s*$/.exec(holder.value)![0];
      const merged = `${holder.value.slice(0, holder.value.length - trailing.length)}، ${stripComments(p.rawValue).trim()}${trailing}`;
      edits.push([t.valueStart, t.valueEnd, merged]);
      edits.push([p.start, p.end, '']);
      changes.push({ kind: 'merge', param: p.name, to: target });
      occupied.set(keyOf(target), { param: t, value: merged });
      continue;
    }
    manual.push(`تعارض مقدار: «${p.name}» و «${holder.param.name}» هر دو مقدار دارند`);
  }

  if (!edits.length) return { text, changes, manual };

  // apply right-to-left so offsets stay valid
  edits.sort((a, b) => b[0] - a[0]);
  let out = text;
  for (const [s, e, rep] of edits) out = out.slice(0, s) + rep + out.slice(e);

  // a removed parameter can leave a blank line behind
  out = out.slice(0, ib.start) + out.slice(ib.start).replace(/\n[ \t]*\n(?=[ \t]*\|)/g, '\n');

  return { text: out, changes, manual };
}

/**
 * Rename a parameter in place, absorbing the length change into the padding
 * before the `=` so the column the article aligns on does not drift.
 */
function renameEdits(text: string, p: Param, target: string): [number, number, string][] {
  const out: [number, number, string][] = [[p.nameStart, p.nameEnd, target]];
  const pad = text.slice(p.nameEnd, p.valueStart - 1); // whitespace before `=`
  if (/^[ \t]+$/.test(pad)) {
    const width = pad.length + p.name.length - target.length;
    out.push([p.nameEnd, p.valueStart - 1, ' '.repeat(Math.max(1, width))]);
  }
  return out;
}

/** Swap a value while keeping the surrounding whitespace of the original. */
function keepShape(original: string, value: string): string {
  const lead = /^[ \t]*/.exec(original)![0];
  const trail = /\s*$/.exec(original)![0];
  return `${lead || ' '}${value}${trail}`;
}
