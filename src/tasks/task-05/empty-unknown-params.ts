/**
 * وظیفهٔ ۵ — remove EMPTY, module-flagged-UNKNOWN parameters from CS1 citations.
 * Clears رده:خطاهای CS1: پارامترهای نامعلوم خالی («یادکرد پارامتر ناشناختهٔ خالی دارد»).
 *
 * Approved ۱۵ سپتامبر ۲۰۲۶:
 *   ویکی‌پدیا:سیاست ربات‌رانی/درخواست مجوز/MamouriBot/وظیفه ۵
 * On-wiki code copy: کاربر:MamouriBot/کد/وظیفه ۵
 *
 * Ported from the original Python (src/tasks/task-05/empty-unknown-params.py, deleted;
 * see git history) to TypeScript so every task shares one framework, per TODO.md §8.
 * The detection/removal logic below is a faithful port — same regexes, same safety
 * gates — not a rewrite; `empty-unknown-params.test.ts` carries over all 27 original
 * assertions unchanged.
 *
 * Safety: only removes a param that is BOTH empty AND flagged unknown by the module
 * (detected from the module's own error span, not guessed); every edit is gated on a
 * render-identity check (each <cite>'s content byte-identical before/after except the
 * cleared error) and skipped otherwise.
 *
 * WHY DETECTION HAPPENS IN getTargets() AND NOT IN transform()
 * --------------------------------------------------------------
 * `transform()` must be pure (no network, `docs/BUILDING-A-TASK.md` §2). But knowing
 * WHICH parameter names the citation module has flagged as unknown needs a render
 * (`action=parse` of the citations) — that is network-bound. So `getTargets()` does the
 * read + render + detection once per candidate, stores the flagged (named, positional)
 * sets in `DECISIONS`, and returns only titles where something would actually be
 * removed. `transform()` then just re-applies that decision with the pure `stripSpans()`.
 *
 * `verify()` re-renders the proposed wikitext and refuses the save unless the citation
 * CONTENT (everything except the cs1 error spans) is byte-identical and the flagged-param
 * count went down — the same two-part gate the Python version computed as `gate_pass`.
 */
import type { Bot, BotTask } from '../../core.js';

// ── parsing helpers (module-private; exported only where the tests need them) ──

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
/** Module reports positional keys in Persian digits; wikitext may use Latin. */
function numKey(s: string): string {
  return s.replace(/[۰-۹]/g, c => String(PERSIAN_DIGITS.indexOf(c)));
}
/** CS1's verbatim-en placeholder shown for a stray `|=` (empty parameter name). */
const EMPTY_NAME_FLAG = '(empty string)';
/** Match a wikitext key to the module's DISPLAYED name: `_` renders as a space, Persian digits as Latin. */
function canon(s: string): string {
  return numKey(s.replace(/_/g, ' ')).replace(/\s+/g, ' ').trim();
}
const isDigits = (s: string): boolean => /^[۰-۹0-9]+$/.test(s);

/** Error spans the fa CS1 module renders for this exact defect, plus the `|key=` tokens inside. */
export function flaggedParams(html: string): { named: Set<string>; pos: Set<string> } {
  const named = new Set<string>(), pos = new Set<string>();
  const spanRe = /<span class="cs1-visible-error[^"]*">\s*یادکرد پارامتر ناشناختهٔ خالی دارد[\s\S]*?<\/span>/g;
  for (const spanMatch of html.matchAll(spanRe)) {
    const span = spanMatch[0];
    // the pipe renders as either the HTML entity or a literal '|' — both seen live
    for (const m of span.matchAll(/<code class="cs1-code">(?:&#124;|\|)([^=<]+)=<\/code>/g)) {
      const pm = m[1].trim();
      if (isDigits(pm)) pos.add(numKey(pm)); else named.add(canon(pm));
    }
  }
  return { named, pos };
}

/** Find every top-level `{{یادکرد…}}` / `{{cite …}}` / `{{citation}}` span (برون‌مرکزی ویکی excluded). */
export function findCiteTemplates(text: string): [number, number][] {
  const spans: [number, number][] = [];
  const n = text.length;
  let i = 0;
  for (;;) {
    const j = text.indexOf('{{', i);
    if (j < 0) break;
    const head = text.slice(j + 2, j + 40);
    const mn = /^\s*([^|}\n]+)/.exec(head);
    const name = mn ? mn[1].trim() : '';
    const namel = name.toLowerCase().replace(/_/g, ' ').trim();
    const isCite = (name.startsWith('یادکرد') && name !== 'یادکرد-ویکی')
      || namel.startsWith('cite') || namel === 'citation';
    if (isCite) {
      let depth = 0, k = j;
      while (k < n - 1) {
        const two = text.slice(k, k + 2);
        if (two === '{{') { depth++; k += 2; continue; }
        if (two === '}}') { depth--; k += 2; if (depth === 0) break; continue; }
        k++;
      }
      spans.push([j, k]);
      i = k;
    } else {
      i = j + 2;
    }
  }
  return spans;
}

/** Split a template's body into top-level segments (seg[0] = name, rest = params). `[[`/`{{` are opaque. */
export function splitTopPipes(inner: string): string[] {
  const parts: string[] = [];
  let buf = '', depth = 0, i = 0;
  const n = inner.length;
  while (i < n) {
    const two = inner.slice(i, i + 2);
    if (two === '{{' || two === '[[') { depth++; buf += two; i += 2; continue; }
    if (two === '}}' || two === ']]') { depth--; buf += two; i += 2; continue; }
    if (inner[i] === '|' && depth === 0) { parts.push(buf); buf = ''; i++; continue; }
    buf += inner[i]; i++;
  }
  parts.push(buf);
  return parts;
}

/** Split a param segment at its first top-level `=` into [key, val] (val keeps the leading '='), or null if positional. */
export function argNamed(arg: string): [string, string] | null {
  let depth = 0;
  for (let i = 0; i < arg.length; i++) {
    const two = arg.slice(i, i + 2);
    if (two === '{{' || two === '[[') { depth++; continue; }
    if (two === '}}' || two === ']]') { depth--; continue; }
    if (arg[i] === '=' && depth === 0) return [arg.slice(0, i), arg.slice(i + 1)];
  }
  return null;
}

/**
 * Strip empty flagged params from any cite templates NESTED inside `text` (e.g. a full
 * citation placed in another cite's عنوان= value). Rebuilds right-to-left so spans stay valid.
 */
function stripNested(text: string, fnamed: Set<string>, fpos: Set<string>): { text: string; removed: string[] } {
  const spans = findCiteTemplates(text).slice().sort((a, b) => b[0] - a[0]);
  let removed: string[] = [];
  for (const [a, b] of spans) {
    const { out: nc, removed: rem } = stripTemplate(text.slice(a, b), fnamed, fpos);
    if (rem.length) { text = text.slice(0, a) + nc + text.slice(b); removed = removed.concat(rem); }
  }
  return { text, removed };
}

/** Remove only the segments that are BOTH empty and flagged. Never touches a param that has a value. */
export function stripTemplate(tpl: string, fnamed: Set<string>, fpos: Set<string>): { out: string; removed: string[] } {
  const inner = tpl.slice(2, -2);
  const parts = splitTopPipes(inner);
  const name = parts[0];
  const args = parts.slice(1);
  const removed: string[] = [];
  const kept: string[] = [];
  for (let arg of args) {
    const { text: nestedArg, removed: nestedRemoved } = stripNested(arg, fnamed, fpos);
    arg = nestedArg;
    removed.push(...nestedRemoved);
    const nm = argNamed(arg);
    if (nm) {
      const [key, val] = nm;
      // empty-NAMED param: a stray `|=` (empty key) renders as the module's «(empty string)» placeholder
      const emptyName = key === '' && fnamed.has(EMPTY_NAME_FLAG);
      if (val.trim() === '' && (fnamed.has(canon(key)) || emptyName || (isDigits(key) && fpos.has(numKey(key))))) {
        removed.push('|' + key + '=');
        continue;
      }
      kept.push(arg);
    } else {
      if (arg.trim() === '' && fpos.size) { removed.push('|<pos>'); continue; } // empty bare positional; only when an article flags a positional
      kept.push(arg);
    }
  }
  if (!removed.length) return { out: tpl, removed: [] };
  return { out: '{{' + [name, ...kept].join('|') + '}}', removed };
}

/** Text of each `<cite>`, with ALL cs1 spans removed → the real citation content. */
export function citeCore(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<cite\b[^>]*>([\s\S]*?)<\/cite>/g)) {
    let c = m[1].replace(/<span class="cs1-[^"]*">[\s\S]*?<\/span>/g, '');
    c = c.replace(/<[^>]+>/g, '');
    out.push(c.replace(/\s+/g, ' ').trim());
  }
  return out;
}

/** Apply `stripTemplate` to every top-level cite span in the article, right-to-left, re-building the text. */
function applyStrips(text: string, fnamed: Set<string>, fpos: Set<string>): { text: string; removed: string[] } {
  const spans = findCiteTemplates(text);
  let out = '', last = 0;
  const removed: string[] = [];
  for (const [a, b] of spans) {
    const { out: nc, removed: rem } = stripTemplate(text.slice(a, b), fnamed, fpos);
    out += text.slice(last, a) + nc;
    last = b;
    removed.push(...rem);
  }
  out += text.slice(last);
  return { text: out, removed };
}

// ── BotTask wiring ──

/** title -> the flagged-param sets detected from the rendered citations, for `transform()` to re-apply. */
const DECISIONS = new Map<string, { named: Set<string>; pos: Set<string> }>();

/**
 * Template namespaces this task reads, pipe-separated for `cmnamespace`.
 * Default matches the live cron job: article, project, template, draft. `ns2` (User) is
 * intentionally never included — editing another editor's sandbox is intrusive.
 */
const namespaces = () => process.env.TARGET_NAMESPACE ?? '0|4|10|118';

async function getTargets(bot: Bot): Promise<string[]> {
  DECISIONS.clear();
  const members: string[] = [];
  let cont: string | undefined;
  do {
    const p: Record<string, string> = {
      action: 'query', list: 'categorymembers',
      cmtitle: 'رده:خطاهای CS1: پارامترهای نامعلوم خالی',
      cmnamespace: namespaces(), cmlimit: '500',
    };
    if (cont) p.cmcontinue = cont;
    const d = await bot.apiGet(p);
    for (const m of d.query.categorymembers) members.push(m.title);
    cont = d.continue?.cmcontinue;
  } while (cont);

  // testcases/sandbox subpages belong to whoever is editing them, same exclusion as the
  // original Python and as linkfix.ts's NOT_A_TEMPLATE.
  const candidates = members.filter(t => !(t.endsWith('/تمرین') || t.endsWith('/آزمایشی')));
  console.log(`اندازهٔ رده: ${members.length}  نامزد: ${candidates.length}`);

  const out: string[] = [];
  const cap = bot.opts.limit ? Math.max(bot.opts.limit * 3, 60) : Infinity;
  for (const title of candidates) {
    if (out.length >= cap) break;
    const d = await bot.apiGet({ action: 'query', prop: 'revisions', rvprop: 'content', rvslots: 'main', titles: title });
    const pg = d.query.pages[0];
    if ('missing' in pg) continue;
    const text: string = pg.revisions?.[0]?.slots?.main?.content ?? '';
    const spans = findCiteTemplates(text);
    if (!spans.length) continue;
    const cites = spans.map(([a, b]) => text.slice(a, b));
    // The error is SELF-CONTAINED per citation, so parse ONLY the citations (cheap)
    // rather than the whole article (an expensive server-side parse).
    const html = (await bot.apiPost({
      action: 'parse', contentmodel: 'wikitext', text: cites.join('\n\n'), title, prop: 'text',
    })).parse.text as string;
    const { named, pos } = flaggedParams(html);
    if (!named.size && !pos.size) continue;
    const { removed } = applyStrips(text, named, pos);
    if (!removed.length) continue;
    DECISIONS.set(title, { named, pos });
    out.push(title);
  }
  return out;
}

export const emptyUnknownParamsTask: BotTask = {
  id: 'empty-unknown-params',
  taskNumber: 5,
  summary: 'حذف پارامترهای خالی ناشناخته از یادکردها (رفع خطای «پارامتر ناشناختهٔ خالی»)',
  description:
    'حذف پارامترهایی از الگوهای یادکرد که هم خالی‌اند و هم پودمان یادکرد آن‌ها را به‌صراحت ' +
    'ناشناخته علامت زده (رده:خطاهای CS1: پارامترهای نامعلوم خالی). پارامتر دارای مقدار هرگز ' +
    'دست‌کاری نمی‌شود؛ هر ویرایش پیش از ذخیره با سنجش نمای یادکردها پیش و پس از تغییر، گیت می‌شود.',

  // The category keeps refilling (new articles, reverts past the bot's edit), so a title
  // parked in `done` forever would miss a page that re-earned the error later. Same shape
  // as task ۴'s company-params.
  recheckAfterDays: 30,

  getTargets,

  transform(text: string, title: string) {
    const d = DECISIONS.get(title);
    if (!d) return { text, changed: false, note: 'بدون تصمیم (در این اجرا بررسی نشد)' };
    const { text: out, removed } = applyStrips(text, d.named, d.pos);
    if (!removed.length) return { text, changed: false, note: 'پارامتر ناشناختهٔ خالی یافت نشد' };
    return { text: out, changed: true, note: removed.join('؛ ') };
  },

  /**
   * The task's whole risk: a removal that happens to eat something it should not have.
   * Renders both versions and refuses unless (a) every `<cite>`'s content — everything
   * EXCEPT the cs1 error spans — is byte-identical, and (b) the flagged-param count
   * actually went down. Mirrors the Python version's `gate_pass` exactly; the built-in
   * render-error counter in core.ts is too coarse to see a citation whose content merely
   * SHIFTED rather than gained/lost an error marker.
   */
  async verify(bot: Bot, title: string, oldText: string, newText: string) {
    const render = async (text: string) => (await bot.apiPost({
      action: 'parse', title, text, contentmodel: 'wikitext', prop: 'text', disablelimitreport: '1',
    })).parse?.text as string ?? '';
    const [beforeHtml, afterHtml] = [await render(oldText), await render(newText)];
    const coreBefore = citeCore(beforeHtml), coreAfter = citeCore(afterHtml);
    if (JSON.stringify(coreBefore) !== JSON.stringify(coreAfter)) {
      return { ok: false, detail: 'محتوای نمایشی یادکرد جز حذف خطا تغییر کرد' };
    }
    const before = flaggedParams(beforeHtml), after = flaggedParams(afterHtml);
    const beforeCount = before.named.size + before.pos.size;
    const afterCount = after.named.size + after.pos.size;
    if (afterCount >= beforeCount) {
      return { ok: false, detail: `شمار خطاها کاهش نیافت (${beforeCount}→${afterCount})` };
    }
    return { ok: true, detail: `خطا ${beforeCount}→${afterCount}` };
  },
};
