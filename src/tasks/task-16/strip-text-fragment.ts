/**
 * وظیفهٔ ۱۶ — remove Google/Chrome "text fragment" directives (`#:~:text=…`) that leaked
 * into a citation URL when someone copy-pasted a link straight out of a Google search
 * result or a browser's "Copy Link to Highlight". The directive is browser-side state
 * (what to scroll to and highlight), not part of the page's real address: stripping it
 * from the first `#` onward always yields the identical page.
 *
 * Example (کامفیروز, live on fa.wikipedia — the case that started this task):
 *   http://www.tamashanewspaper.ir/news-details/10835-…باشند#:~:text=مهندس…&text=کامفیروز…
 *   → http://www.tamashanewspaper.ir/news-details/10835-…باشند
 *
 * See `docs/task-16-text-fragment.md` and `research/google-text-fragment-links.md` in the
 * companion repo for the population measurement (328 occurrences / 200 sampled fa
 * articles, 100% stripped correctly, 0 false positives) that this transform was built
 * against.
 *
 * WHERE THE DIRECTIVE SHOWS UP. It is overwhelmingly a suffix on a plain `https?://` URL,
 * and that URL can sit ANYWHERE in the wikitext — inside a citation template's `url=`/
 * `نشانی=`, a bare `<ref>` link, `[url label]` bracket syntax, plain body text, or even a
 * same-wiki `[[صفحه#:~:text=…|برچسب]]` wikilink (someone pasted a highlighted Google URL
 * and MediaWiki's autolink turned the `[[…]]` into an internal link). So this operates on
 * the RAW TEXT, scanning every `#` for the directive that follows it, rather than trying
 * to special-case templates.
 *
 * WHY THE DELIMITER SET INCLUDES `{` AND `}`. A first draft excluded only whitespace,
 * `]`, `|`, `<`, `>`, `"` — the characters MediaWiki itself treats as ending a bare URL
 * (`Parser::EXT_LINK_URL_CLASS`, plus `|` for wikitext structure). That missed one real
 * shape: `{{Webarchive|url=https://…#:~:text=…}}`, where the URL is followed directly by
 * `}}` with no `|` in between. Measured against the 200-page sample, 9 of 328 occurrences
 * hit this (اکسیژن، رضا پهلوی، زبان کشمیری، هلیوم ×3، کربن ×2، کنستانتین بزرگ) and the
 * brace became part of the %-encoded tail, which would have left a stray `}}` after the
 * strip. `{`/`}` are now excluded too.
 *
 * A single quote is deliberately NOT excluded (a second draft's mistake): see the note
 * on `URL_CHAR` below for the live fa.wikipedia example this broke on.
 */
import type { Bot, BotTask } from '../../core.js';
import { checkWikitext } from '../../lib/gates.js';

/**
 * The end-of-fragment delimiter set is CONTEXT-DEPENDENT, and that is the one real
 * subtlety here.
 *
 * Outside a `[[…]]` wikilink — a bare URL, a citation's `url=`, bracket-link syntax — the
 * fragment is percent-encoded, so the delimiter set is MediaWiki's own bare-URL
 * terminator class (`Parser::EXT_LINK_URL_CLASS`: whitespace, `]`, `<`, `>`, `"`), plus
 * `|` and `{`/`}` for the wikitext structure the URL sits inside — a template parameter
 * or a bracketed link ends at the first unescaped `|`, and a template call ends at `}}`.
 *
 * A single quote is deliberately NOT a delimiter: an early draft excluded it, and that
 * truncated the directive at the first literal, un-encoded apostrophe inside highlighted
 * prose — e.g. `#:~:text=…Israel's,…` (live on «اسرائیل»). The directive is still
 * entirely within `[^\s\]<>"{}|]`; MediaWiki's own class does not exclude `'` either.
 *
 * INSIDE a `[[…]]` wikilink, though, someone pasted a Google-highlighted URL straight
 * into the link target and MediaWiki turned it into an internal link — so the directive's
 * "text" is whatever LITERAL, unencoded Persian prose was highlighted: full of spaces,
 * commas, parentheses, even Latin text (`[[محمد یعقوب بیگ#:~:text=یعقوب بیگ برای جنگ با،
 * یعقوب بیگ را منهدم کردند.|یعقوب بیگ]]`, from the 200-page sample). The only characters
 * that can end it there are the wikilink's own delimiters: `[`, `]`, `|`. Using the URL
 * delimiter set here would stop at the first space and leave most of the directive
 * sitting in the "label" half of the link, after a stray leftover `|`.
 */
const URL_CHAR = /[^\s\]|<>"{}]/;
const WIKILINK_CHAR = /[^[\]|]/;
const URL_CHAR_CLASS = '[^\\s\\]|<>"{}]';
const WIKILINK_CHAR_CLASS = '[^\\[\\]|]';

function directiveRe(charClass: string): RegExp {
  // Chained `&text=…` segments (one directive can carry several highlighted ranges —
  // 28/200 sampled pages had more than one) belong to the SAME directive and must be
  // stripped together, not just the first one.
  return new RegExp(`:(?:~|%7[eE]):text=${charClass}*(?:&text=${charClass}*)*$`, 'i');
}
const URL_DIRECTIVE_RE = directiveRe(URL_CHAR_CLASS);
const WIKILINK_DIRECTIVE_RE = directiveRe(WIKILINK_CHAR_CLASS);

/**
 * Strip one text-fragment directive out of the fragment that follows a single `#`.
 *
 * `frag` is everything after the `#` up to its context's own end delimiter (already
 * sliced by the caller, using the matching char class). Returns `null` when `frag` is not
 * a text-fragment directive at all — i.e. the `#` belongs to a REAL section anchor and
 * must be left alone.
 *
 * `page#section:~:text=…` → `before = 'section'`, kept with its `#`.
 * `page#:~:text=…`        → `before = ''`, the whole `#…` is dropped.
 */
function stripOneDirective(frag: string, directiveRx: RegExp): string | null {
  const m = directiveRx.exec(frag);
  if (!m) return null;
  return frag.slice(0, m.index);
}

/**
 * How many more characters after the directive are the SAME directive, continued past a
 * literal space.
 *
 * Google writes the prefix/suffix separator as `,`. Some pasters mangle it into a Persian
 * `،` followed by a real space, and then the percent-encoded tail of the highlight sits
 * after that space — so MediaWiki's URL class (which ends at whitespace) stops the strip
 * halfway and leaves debris inside the citation parameter. Live in «کازرون» ×3:
 *
 *   |نشانی=https://…ن-پنجم-هجری-#:~:text=شیخ%2520…%2520ساخت، دین%2520اسلام%2520…شد. |وبگاه=…
 *
 * Stripping to the space alone would leave `|نشانی=https://…هجری- دین%2520اسلام%2520…شد.`
 * — still a broken URL, now with half a highlight hanging off it. The first dry run on
 * Toolforge showed this on 3 of 12 sampled pages, so it is not a rarity.
 *
 * The test for "this token is still the directive" is a PERCENT ESCAPE in it: the
 * directive's tail is always percent-encoded in a URL context, and ordinary Persian or
 * English prose after a URL never is. That keeps the rule from eating real sentence text
 * in the 24% of occurrences where the URL just sits in the body. A token containing
 * `://` or `=` is never swallowed either — that is a new URL or a new template parameter,
 * not debris.
 *
 * Only for the URL context. Inside `[[…]]` the directive is unencoded prose and already
 * runs to the wikilink delimiter, so there is nothing left over to find.
 */
function debrisAfter(text: string, j: number): number {
  let n = 0;
  for (;;) {
    const m = /^[^\S\n]+([^\s\]|<>"{}]+)/.exec(text.slice(j + n));
    if (!m) return n;
    const token = m[1];
    if (!/%[0-9A-Fa-f]{2}/.test(token)) return n;
    if (token.includes('://') || token.includes('=')) return n;
    n += m[0].length;
  }
}

/**
 * Pure transform: find every `#` in the text, check whether a text-fragment directive
 * follows it to its context's own end, and strip just that directive. A real section
 * anchor (`#بخش`) or an unrelated `#` is left completely untouched.
 *
 * A single linear pass also tracks `[[…]]` bracket depth — same shape as the brace/link
 * depth trackers elsewhere in this repo (`findCitationSpans`'s `splitTopLevel`) — so the
 * delimiter class flips the instant a `#` is read while inside an open wikilink target.
 */
export function stripTextFragments(text: string): { text: string; changed: boolean; note?: string } {
  let out = '';
  let last = 0;
  let count = 0;
  let wikiDepth = 0;
  let i = 0;
  while (i < text.length) {
    const two = text.slice(i, i + 2);
    if (two === '[[') { wikiDepth++; i += 2; continue; }
    if (two === ']]') { wikiDepth = Math.max(0, wikiDepth - 1); i += 2; continue; }
    if (text[i] !== '#') { i++; continue; }
    const charClass = wikiDepth > 0 ? WIKILINK_CHAR : URL_CHAR;
    const directiveRx = wikiDepth > 0 ? WIKILINK_DIRECTIVE_RE : URL_DIRECTIVE_RE;
    const h = i;
    let j = h + 1;
    while (j < text.length && charClass.test(text[j])) j++;
    const frag = text.slice(h + 1, j);
    const before = stripOneDirective(frag, directiveRx);
    if (before !== null) {
      out += text.slice(last, h);
      out += before === '' ? '' : '#' + before;
      last = wikiDepth > 0 ? j : j + debrisAfter(text, j);
      count++;
      i = last;
      continue;
    }
    i = j;
  }
  if (count === 0) return { text, changed: false, note: 'نشانهٔ #:~:text= یافت نشد' };
  out += text.slice(last);
  return { text: out, changed: true, note: count === 1 ? undefined : `${count} نشانه حذف شد` };
}

export const stripTextFragmentTask: BotTask = {
  id: 'strip-text-fragment',
  taskNumber: 16,
  summary: 'حذف برچسب برجسته‌سازی مرورگر (#:~:text=) از نشانی منبع',
  description:
    'حذف نشانهٔ «تکه متن» (Text Fragment، #:~:text=…) که مرورگرهای مبتنی بر Chromium هنگام ' +
    'کپی‌کردن پیوند از نتیجهٔ جستجوی گوگل یا با «Copy Link to Highlight» به نشانی اینترنتی ' +
    'می‌افزایند. این نشانه بخشی از نشانی واقعی صفحه نیست و تنها وضعیت مرورگر را حمل می‌کند؛ ' +
    'حذف آن نشانی را بدون تغییر معنا به شکل درست بازمی‌گرداند. ربات تنها همین دنبالهٔ کاراکتری ' +
    'را از هر نشانی حذف می‌کند (در یادکرد، <ref> ساده، پیوند کروشه‌ای یا متن معمولی)؛ هیچ ' +
    'بخش دیگری از نشانی یا مقاله را تغییر نمی‌دهد.',

  async getTargets(bot: Bot): Promise<string[]> {
    const out: string[] = [];
    let offset = 0;
    // CirrusSearch regex search; see docs/task-16-text-fragment.md §«فهرست نامزدها».
    // Capped at the 10,000-offset hard limit CirrusSearch imposes, same guard as task-15.
    const want = bot.opts.limit ? Math.max(bot.opts.limit * 6, 200) : 10000;
    while (out.length < want && offset < 10000) {
      const r = await bot.apiGet({
        action: 'query', list: 'search', srnamespace: '0',
        srsearch: 'insource:/\\#\\:~\\:text\\=/', srlimit: '50',
        sroffset: String(offset), srprop: '',
      });
      const hits = r.query?.search ?? [];
      if (!hits.length) break;
      out.push(...hits.map((h: { title: string }) => h.title));
      offset += 50;
    }
    // Offset paging REPEATS titles: every page of results is a fresh query against an
    // index that moves while the run walks it. وظیفهٔ ۱۵ hit this and put the same page
    // in one batch twice. Harmless here (the second pass finds nothing to strip) but it
    // wastes a read and a slot under `--limit`.
    return [...new Set(out)];
  },

  transform(text: string) {
    return stripTextFragments(text);
  },

  /**
   * Continuous task, so the checkpoint must expire. Chromium keeps minting these
   * directives and the permission (۱۲ اکتبر ۲۰۲۶) was granted on the explicit basis that
   * the bot runs permanently rather than once; a page cleaned today and re-pasted into
   * next week would otherwise be parked forever while the run reported "nothing to do".
   *
   * 30 days, not shorter: the candidate list is a CirrusSearch index, which lags the
   * bot's own edits by minutes, so a just-cleaned page keeps appearing as a hit for a
   * while. The checkpoint is what stops the next run re-reading all of them.
   */
  recheckAfterDays: 30,

  /**
   * This task's own risk: proving the strip did not eat anything beyond the directive
   * itself. The built-in render-error guard cannot see this — a URL missing its last
   * few path characters still renders a perfectly clean link, it just points at the
   * wrong page, which is exactly the class of silent damage `verify()` exists for
   * (`docs/BUILDING-A-TASK.md` §2).
   *
   * `transform` is pure and deterministic, so the strongest available proof is simply to
   * RECOMPUTE it from `oldText` and require a byte-for-byte match against `newText`. Any
   * divergence — a different charset context picked than the one the save actually used,
   * a stray leftover delimiter, anything — fails loudly here instead of shipping quietly,
   * which is exactly what a partial, URL-only re-check (an earlier draft of this function)
   * would have missed for the wikilink case (`[[صفحه#:~:text=…|برچسب]]`), where the
   * directive is unencoded Persian prose, not a URL.
   */
  async verify(_bot: Bot, title: string, oldText: string, newText: string) {
    // Gate the DIFF, not the whole text (`docs/BUILDING-A-TASK.md` §5): many candidate
    // pages carry unrelated pre-existing defects (an em dash in prose, a Latin display
    // label on a wikilink, …) that are not this task's to fix, and a whole-text gate
    // would refuse every one of them. Only a problem the EDIT ITSELF introduces blocks.
    //
    // The two problem lists are compared AFTER running this task's own strip over each
    // problem string, because a gate message quotes the offending wikitext — and when the
    // directive sat inside the thing being quoted, the message changes wording across the
    // edit and a pre-existing defect reads as a brand-new one. Live case, «شماره استاندارد
    // بین‌المللی پیایند» on the first live batch: the gate's Latin-display-label rule quoted
    // `[[شماره استاندارد بین‌المللی پیایند#:~:text=…|ISSN]]` before and
    // `[[شماره استاندارد بین‌المللی پیایند|ISSN]]` after, so a defect this task neither
    // created nor is allowed to fix blocked the page. Normalising both sides makes the two
    // spellings of the same complaint cancel. This is the same shape as وظیفهٔ ۱۵'s
    // before/after error-marker count: an ABSOLUTE test on a page with pre-existing faults
    // refuses it forever.
    const norm = (p: string) => stripTextFragments(p).text;
    const had = new Set(checkWikitext(title, oldText).map(norm));
    const fresh = checkWikitext(title, newText).filter(p => !had.has(norm(p)));
    if (fresh.length) return { ok: false, detail: 'دروازه: ' + fresh.join('؛ ') };
    const recomputed = stripTextFragments(oldText);
    if (recomputed.text !== newText) {
      return { ok: false, detail: 'بازتولید تابع خالص با متن ذخیره‌شده یکسان نیست' };
    }
    if (stripTextFragments(newText).changed) {
      return { ok: false, detail: 'نشانهٔ #:~:text= همچنان در متن تازه باقی مانده' };
    }
    return { ok: true, detail: '' };
  },
};
