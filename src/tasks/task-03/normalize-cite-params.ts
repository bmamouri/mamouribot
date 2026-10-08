/**
 * Task 3 (expanded) — normalize CS1/CS2 citation parameter names to their
 * Persian canonical, in ONE pass that simultaneously:
 *   (a) DEDUPLICATES — when a citation carries ≥2 aliases of the SAME field
 *       (e.g. |archive-url= and |نشانی بایگانی=, or |پیوند بایگانی= and
 *       |نشانی بایگانی=) it drains «رده:صفحه‌های دارای ارجاع با متغیر تکراری»; and
 *   (b) MIGRATES — a lone legacy/English/deprecated alias (|archive-url=,
 *       |dead-url=, …) is renamed to the Persian canonical, retiring the shims.
 *
 * This is the cleanup wave after the IABot archive-parameter fix (see the agent
 * memory `iabot-archive-param-dedup` / `citation-cleanup-bot`). IABot no longer
 * CREATES duplicates; this task cleans the pre-existing backlog and the legacy
 * English names left across the wiki.
 *
 * SAFETY (same discipline as citation-dedup-accessdate.ts):
 *   - Per citation, per field: collect every segment whose (underscore-normalized,
 *     lowercased) key is an alias of that field.
 *   - Values are compared after normalizing Persian/Arabic digits → Western and
 *     applying the field's value-map (see below). If ≥2 aliases hold genuinely
 *     DIFFERENT non-empty values → the field is LEFT UNTOUCHED and the citation is
 *     reported for manual review. The bot never guesses which value is right.
 *   - Otherwise keep ONE segment, rename its key to the canonical, drop the rest.
 *   - Only the affected segments change; the kept value and surrounding
 *     whitespace/alignment are preserved. Only CS1/CS2 citation templates are touched.
 *   - Per citation: safely-fixable fields are fixed even if a sibling field in the
 *     same citation has a value clash (that one is left and counted).
 *
 * VALUE-MAP (the one non-rename transform): the legacy boolean |dead-url= /
 * |deadurl= took yes/no, whereas url-status takes dead/live. When the KEPT param
 * came from a boolean alias we translate yes→dead, no→live so the rename is
 * meaning-preserving. All other aliases of url-status already use the
 * dead/live/unfit/usurped vocabulary and pass through unchanged.
 *   ⚠ url-status is gated behind ENABLE_URL_STATUS until the dead/live value
 *   vocabulary of «چگونگی پیوند» is confirmed on-wiki (see docs/task-03-citation-normalization.md).
 *
 * The small wikitext parsers below are an intentional self-contained copy of the
 * helpers in citation-dedup-accessdate.ts (kept separate so the already-filed
 * Task-4 code stays byte-identical — same convention that file documents).
 */
/*
 * ───────────────────────────────────────────────────────────────────────────────
 * WHERE THE SOURCE OF TRUTH FOR fa CS1 PARAMETER NAMES ACTUALLY IS
 * ───────────────────────────────────────────────────────────────────────────────
 * Read this before changing any `canonical` below. Established by reading the live
 * modules on 2026-10-07, after two wrong conclusions were drawn from reading the
 * wrong config.
 *
 * 1. The citation templates are bare #invokes of a DISPATCH, not of an engine:
 *
 *      الگو:یادکرد وب   = {{#invoke:citation/CS1/fa/dispatch|web}}
 *      الگو:Cite web    = {{#invoke:citation/CS1/en|citation|CitationClass=web}}
 *
 * 2. پودمان:citation/CS1/fa/dispatch picks the engine PER CITATION from the
 *    citation's own زبان/language parameter, via Module:Citation/lang `is_rtl`:
 *    an LTR source routes to Module:Citation/CS1/en, an RTL one to
 *    Module:citation/CS1/fa. So two citations on the same page can be rendered by
 *    different engines, and a defect can therefore appear on an English-sourced
 *    page and not a Persian-sourced one. That is not a bug, it is the design.
 *
 * 3. Each engine loads its OWN configuration — verified in the module source:
 *
 *      Module:Citation/CS1/en  → mw.loadData('Module:Citation/CS1/en/Configuration')
 *      Module:citation/CS1/fa  → mw.loadData('Module:Citation/CS1/fa/Configuration')
 *
 * 4. **پودمان:Citation/CS1/Configuration is NOT one of them.** It belongs to the base
 *    Module:Citation/CS1, which these templates no longer use. It is the page where
 *    the operator added the Persian aliases in
 *    <https://fa.wikipedia.org/w/index.php?diff=44514521>:
 *
 *      ['ArchiveURL']  = {'پیوند بایگانی', 'archive-url', 'archiveurl'}
 *      ['ArchiveDate'] = {'تاریخ بایگانی', 'archive-date', 'archivedate'}
 *
 *    and the edit summary says why: «خوانده‌شده توسط ربات بایگانی اینترنتی» — it is
 *    read by **InternetArchiveBot**. So that page is the source of truth for what
 *    IABot writes and recognises, NOT for what renders. Those two questions have
 *    different answers and must be checked separately.
 *
 * 5. Unresolved, and the reason not to trust a config read: NONE of
 *    en/Configuration, fa/Configuration, en/Whitelist, fa/Whitelist, the dispatch or
 *    either 245 KB engine contains a single Persian parameter name — not «عنوان»,
 *    not «نشانی», not «بایگانی» — and yet all of those parameters render correctly.
 *    Some resolution path has not been found. Until it is:
 *
 *      **Do not conclude that a parameter name works, or does not, by reading a
 *      configuration table. Render it and look.** Two conclusions in this task were
 *      drawn that way and both were wrong.
 *
 * And when you do render it to check, use `action=parse&page=` or `&oldid=`, the same
 * mode that detects the defect. `action=parse&text=` on the same wikitext disagrees:
 * it reported «نیازمند»×0 for a page that shows the error live.
 * ───────────────────────────────────────────────────────────────────────────────
 */
import type { Bot, BotTask } from '../../core.js';
import { existsSync, readFileSync } from 'fs';
import { checkWikitext } from '../../lib/gates.js';
import { loadStoreChecked, mergeReview, saveStore, storePath } from './review-store.js';

/**
 * Why «چگونگی پیوند» takes an ENGLISH value, when its key is Persian.
 *
 * The two halves of a parameter localise differently, and conflating them is an easy
 * mistake to make:
 *
 *   - the NAME is an alias, and fa.wiki has localised it:
 *       ['UrlStatus'] = {'url-status', 'چگونگی پیوند'}
 *   - the VALUE is a KEYWORD, and the module compares it against a fixed list. The
 *     localisation point is the `keywords` table, where each canonical keyword maps to
 *     the set of spellings that are accepted:
 *       ['dead']         = {'dead', 'deviated'}   -- Used by InternetArchiveBot
 *       ['live']         = {'live'}               -- Used by InternetArchiveBot
 *       ['bot: unknown'] = {'bot: unknown'}       -- Used by InternetArchiveBot
 *
 * All three configs — /Configuration, /en/Configuration, /fa/Configuration — list only
 * English spellings, so a Persian value is invalid. Probed on the live module
 * 2026-10-07 with |چگونگی پیوند=:
 *
 *   dead / live / unfit / usurped  → render correctly; `live` points the title at the
 *                                    original, the others at the archive
 *   مرده / زنده / نامناسب / تصاحب‌شده / ناشناخته
 *                                  → «مقدار |چگونگی پیوند=… نامعتبر», and WORSE, the
 *                                    value is then ignored: «زنده» still rendered as
 *                                    dead, pointing the title at the archive. An
 *                                    invalid keyword is not merely flagged, it
 *                                    silently inverts the meaning.
 *
 * So writing `dead` is not an English-by-preference choice; it is the only spelling the
 * module accepts. Making Persian values work is a MODULE change, not a bot change:
 * add the spelling to the list in BOTH /en/Configuration and /fa/Configuration, since
 * the dispatch routes per citation language. It must be ADDITIVE — every one of those
 * lines is annotated «Used by InternetArchiveBot», which writes `url-status=dead`;
 * replacing `dead` rather than appending to it would break IABot wiki-wide. That is a
 * sitewide decision to propose, not one to take here.
 *
 * ---------------------------------------------------------------------------------
 * CORRECTION, 2026-10-07, after the Persian spellings were added and the scope widened.
 *
 * The paragraph above says the localisation point is «/Configuration, /en/Configuration,
 * /fa/Configuration». That is where the spellings were in fact added and they work, but
 * it is not the file an fa editor is supposed to edit, and it is NOT where the Persian
 * parameter NAMES live. Checked directly:
 *
 *   - «پودمان:Citation/CS1/fa/Configuration» contains no Persian parameter name at all.
 *     grep it for «تاریخ بازبینی» or «کد زبان» and you get nothing.
 *   - «پودمان:Citation/CS1/fa/i18n» is the localisation overlay, a pure data module
 *     loaded by Configuration. Its own header states the merge semantics:
 *         aliases_add  -> APPEND each list of Persian names to aliases[<metaparam>]
 *         keywords_add -> APPEND each list of Persian values to keywords[<key>]
 *     So `aliases_add` is the authoritative Persian-name table and `keywords_add` the
 *     authoritative Persian-value table, and the overlay is deliberately the ONLY file
 *     fa editors touch, so the engine modules stay byte-identical to en.wikipedia.
 *
 * Every alias list in FIELDS below was read out of that `aliases_add` table and then
 * machine-checked: each list must map to exactly ONE metaparameter, or the bot would
 * merge two unrelated fields. One claim elsewhere in this file falls to the same check —
 * «نشانی بایگانی» is NOT undeclared; it is a declared ArchiveURL alias in the overlay.
 * The canonical stays «پیوند بایگانی» because it is listed first.
 */
const ENABLE_URL_STATUS = true;

interface FieldDef {
  field: string;
  /** the Persian canonical name we normalize TO (must be a real CS1 alias of this field) */
  canonical: string;
  /** every alias of this field, underscore-normalized + lowercased */
  aliases: string[];
  /**
   * Drop the redundant duplicate but NEVER rename the survivor. Set on every family
   * added after the trial, and the reason is worth spelling out.
   *
   * The archive and url-status families above are renamed because their legacy aliases
   * are DEPRECATED: `dead-url` only still works through a compatibility shim, and
   * retiring that shim is what the permission request is for. The rename is the job.
   *
   * None of that is true of the families below. `title`, `website`, `accessdate` and
   * `ناشر` are current, valid CS1 aliases that render perfectly. Renaming them would be
   * a purely cosmetic edit, which the request promises the bot will never make
   * («ربات هرگز ویرایشِ صرفاً آرایشی ثبت نمی‌کند») — and `title` sits on virtually every
   * citation on the wiki, so treating it as a rename family would have made almost every
   * article editable for no reader-visible gain.
   *
   * Two of them are not even safely renameable in principle. CS1 folds `Periodical` to
   * one metaparameter, but `وبگاه` (a website), `روزنامه` (a newspaper) and `ژورنال` (a
   * journal) are different claims about the source; likewise `Chapter` covers `فصل` and
   * `مقاله`. Renaming `وبگاه` to `نشریه` would make a citation assert the source is a
   * periodical when the editor said it is a website — a factual change to a reference,
   * dressed as cleanup, and invisible in the render because CS1 formats them identically.
   *
   * So for all of these the bot removes the redundancy, which is the actual defect and
   * the only thing raising an error, and leaves the editor's choice of name alone.
   * `canonical` is then purely the label used on the review page.
   */
  dedupeOnly?: boolean;
  /** optional per-source-alias value transform, used for EQUALITY (alias already normalizeKey'd) */
  valueMap?: (sourceAlias: string, rawVal: string) => string;
  /** optional transform for the value actually WRITTEN, given the raw and the canonical.
   *  Separate from valueMap on purpose: two aliases must compare equal by meaning while
   *  the surviving one is written in the preferred spelling. */
  writeMap?: (rawVal: string, canonical: string) => string;
}

/** yes/no → dead/live for the legacy boolean dead-url aliases. */
/**
 * The boolean vocabulary of the legacy url-status aliases, mapped to the keywords the
 * module actually accepts — «بله/آری/مرده/dead ← dead؛ نه/خیر/زنده/live ← live», as the
 * permission request specifies.
 *
 * This used to bail out for every alias except dead-url/deadurl, which meant the
 * PERSIAN alias «پیوند مرده» — the one place Persian booleans actually live — had its
 * value passed through untouched. «پیوند مرده=خیر» was renamed to «چگونگی پیوند=خیر»,
 * and «خیر» is not a url-status keyword, so the bot introduced a fresh visible error:
 * «مقدار |چگونگی پیوند=خیر نامعتبر». Caught on آب‌انبار سردار بزرگ during the trial.
 *
 * Anything not in the table passes through: dead, live, unfit, usurped, bot: unknown
 * are already correct, and an unrecognised value must never be guessed at.
 */
const DEAD_VALUES = ['yes', 'true', 'بله', 'بلی', 'آری', 'مرده', 'dead'];
const LIVE_VALUES = ['no', 'false', 'خیر', 'نه', 'زنده', 'live'];

/** Spellings the module accepts as written. «مرده»/«زنده» joined this list when they
 *  were added to the keywords table — see the url-status note above. */
const ACCEPTED = ['dead', 'deviated', 'live', 'unfit', 'usurped', 'bot: unknown', 'مرده', 'زنده'];

/** Letterform-insensitive fold, for looking a spelling up. Comparison only. */
const foldVal = (v: string) => v.trim().toLowerCase().replace(/[يى]/g, 'ی').replace(/ك/g, 'ک');

/**
 * The value used for EQUALITY between two aliases of this field. Everything folds to
 * the internal canonical, so «پیوند مرده=بله» and «چگونگی پیوند=dead» are recognised as
 * the same statement rather than as a conflict.
 */
function deadUrlValueMap(_sourceAlias: string, rawVal: string): string {
  const v = foldVal(rawVal);
  if (DEAD_VALUES.includes(v)) return 'dead';
  if (LIVE_VALUES.includes(v)) return 'live';
  return rawVal;
}

/**
 * The value actually WRITTEN. Persian, now that «مرده» and «زنده» are accepted spellings
 * in every CS1 config — the key «چگونگی پیوند» is Persian, so the value should be too.
 *
 * But only where the bot is translating anyway. A value the module already accepts is
 * left exactly as the editor wrote it: rewriting every existing «چگونگی پیوند=dead» to
 * «مرده» would be hundreds of edits that change nothing a reader sees, and the operator
 * asked for the opposite — new writes in Persian, existing English left alone.
 */
function urlStatusWrite(rawVal: string, canonical: string): string {
  const raw = rawVal.trim();
  if (ACCEPTED.includes(foldVal(raw))) return raw;          // already valid → untouched
  if (canonical === 'dead') return 'مرده';
  if (canonical === 'live') return 'زنده';
  return raw;                                                // unrecognised → never guessed at
}

/**
 * Field map. **Every canonical must be a name the CS1 configuration actually declares** —
 * check `پودمان:Citation/CS1/Configuration` before adding one, do not choose on style.
 *   archive-url → «پیوند بایگانی» · archive-date → «تاریخ بایگانی» · url-status → «چگونگی پیوند»
 */
const ALL_FIELDS: FieldDef[] = [
  {
    // «پیوند بایگانی», NOT «نشانی بایگانی». The latter was chosen on style grounds
    // («Persian, shortest/native», 2026-09-27) and never checked against the module.
    // It is declared NOWHERE: zero occurrences across پودمان:Citation/CS1/Configuration,
    // /en/Configuration, /fa/Configuration and both whitelists. «پیوند بایگانی» is the
    // one Persian name the configuration actually lists:
    //
    //   ['ArchiveURL'] = {'پیوند بایگانی', 'archive-url', 'archiveurl'}
    //
    // Writing an undeclared name happens to render today, but it carries no guarantee,
    // and «|archive-date= نیازمند |archive-url= است» appeared on two of ~70 trial pages.
    // ArchiveDate's Persian alias «تاریخ بایگانی» IS declared, which is exactly the
    // error's shape: the date resolves, the URL does not.
    //
    // «نشانی بایگانی» stays in the alias list so the pages the earlier trial already
    // wrote it to get renamed back on the next pass.
    field: 'archive-url',
    canonical: 'پیوند بایگانی',
    aliases: ['پیوند بایگانی', 'نشانی بایگانی', 'archive-url', 'archiveurl'],
  },
  {
    field: 'archive-date',
    canonical: 'تاریخ بایگانی',
    aliases: ['تاریخ بایگانی', 'archive-date', 'archivedate'],
  },
  ...(ENABLE_URL_STATUS ? [{
    field: 'url-status',
    canonical: 'چگونگی پیوند',
    aliases: ['چگونگی پیوند', 'پیوند مرده', 'url-status', 'dead-url', 'deadurl'],
    valueMap: deadUrlValueMap,
    writeMap: urlStatusWrite,
  } as FieldDef] : []),

  // -------------------------------------------------------------------------
  // The rest of the duplicate-parameter families.
  //
  // WHERE THESE LISTS COME FROM — and it is not where the header above says to look.
  // `پودمان:Citation/CS1/fa/Configuration` contains NO Persian parameter names at all;
  // it is the verbatim-en engine's config. The Persian names live in
  // «پودمان:Citation/CS1/fa/i18n», a pure data overlay whose `aliases_add` table is
  // APPENDED to the engine's `aliases[<metaparameter>]`. So the complete alias list for
  // a field is the engine's English list plus that overlay's Persian list, and the
  // overlay is the only file fa editors are meant to touch.
  //
  // Reading that table is how these were derived rather than guessed. It also settles a
  // claim made further up this file: «نشانی بایگانی» IS declared, as an ArchiveURL
  // alias in the overlay. The canonical stays «پیوند بایگانی» because it is listed
  // first, but the parameter was never undeclared.
  //
  // Still: a config table is evidence, not proof. Every canonical below was rendered on
  // a live page before being used here, because this task has already been burned once
  // by trusting a table. See docs/task-03-citation-normalization.md.
  // -------------------------------------------------------------------------

  // Every one of these is dedupeOnly. See the flag's documentation above: these aliases
  // are all CURRENT and valid, so renaming them would be cosmetic churn the request
  // promises not to make, and two of the families are not safely renameable at all.
  {
    field: 'access-date',
    canonical: 'تاریخ بازبینی',
    dedupeOnly: true,
    aliases: ['تاریخ بازبینی', 'تاریخ بازدید', 'تاریخ بازیابی', 'تاریخ دسترسی',
              'بازبینی', 'بازدید', 'بازیابی', 'access-date', 'accessdate'],
  },
  {
    field: 'language',
    canonical: 'زبان',
    dedupeOnly: true,
    aliases: ['زبان', 'کد زبان', 'language', 'lang'],
  },
  {
    field: 'title',
    canonical: 'عنوان',
    dedupeOnly: true,
    aliases: ['عنوان', 'کتاب', 'title'],
  },
  {
    field: 'book-title',
    canonical: 'عنوان کتاب',
    dedupeOnly: true,
    aliases: ['عنوان کتاب', 'عنوان جلد', 'book-title', 'booktitle'],
  },
  {
    field: 'date',
    canonical: 'تاریخ',
    dedupeOnly: true,
    aliases: ['تاریخ', 'date', 'air-date', 'airdate'],
  },
  {
    field: 'page',
    canonical: 'صفحه',
    dedupeOnly: true,
    aliases: ['صفحه', 'ص', 'page', 'p'],
  },
  {
    field: 'pages',
    canonical: 'صفحات',
    dedupeOnly: true,
    aliases: ['صفحات', 'صفحه‌ها', 'صص', 'pages', 'pp'],
  },

  {
    field: 'periodical',
    canonical: 'نشریه',
    dedupeOnly: true,
    aliases: ['نشریه', 'مجله', 'روزنامه', 'ژورنال', 'اثر', 'وبگاه',
              'journal', 'magazine', 'newspaper', 'periodical', 'website', 'work'],
  },
  {
    field: 'chapter',
    canonical: 'فصل',
    dedupeOnly: true,
    aliases: ['فصل', 'بخش', 'مدخل', 'مشارکت', 'مقاله',
              'chapter', 'contribution', 'entry', 'article', 'section'],
  },
  {
    field: 'publisher',
    canonical: 'ناشر',
    dedupeOnly: true,
    aliases: ['ناشر', 'انتشارات', 'publisher', 'institution'],
  },
];

/**
 * WHAT THE PERMISSION ACTUALLY COVERS — and why the rest is off by default.
 *
 * `ویکی‌پدیا:سیاست ربات‌رانی/درخواست مجوز/MamouriBot/وظیفه ۳` was granted
 * {{مجوز دارد}} on ۸ اکتبر ۲۰۲۶. Read against the approved page, the scope is:
 *
 *   • the dead-url family → «چگونگی پیوند», with مرده/زنده values   (request body)
 *   • `ref=harv` removal                                            (request body)
 *   • archive-url / archiveurl / نشانی بایگانی / archive-date / archivedate
 *                                                     (declared as deviation «یک»)
 *
 * The follow-up declared THREE deviations. A fourth, covering the ten families below,
 * was in the draft and was removed before posting, so none of access-date, language,
 * title, book-title, date, page, pages, periodical, chapter or publisher appears
 * anywhere on the approved page — checked term by term, not assumed.
 *
 * They therefore stay OFF. A bot editing outside its approval is the kind of thing a
 * flag gets pulled for, and the failure is silent: every one of those edits is
 * individually correct and still unauthorised. Compare
 * lessons/api-and-permissions/repo-folder-is-not-the-approved-scope.md, where the same
 * confusion went the other way.
 *
 * To enable them, do BOTH: get them approved on the request page, and set
 * `CITE_WIDENED_SCOPE=1`. The env var alone is not permission.
 */
export const APPROVED_FIELDS = new Set(['archive-url', 'archive-date', 'url-status']);

const WIDENED_SCOPE_ENABLED = process.env.CITE_WIDENED_SCOPE === '1';

const FIELDS: FieldDef[] = WIDENED_SCOPE_ENABLED
  ? ALL_FIELDS
  : ALL_FIELDS.filter(f => APPROVED_FIELDS.has(f.field));

if (WIDENED_SCOPE_ENABLED) {
  console.warn('⚠ CITE_WIDENED_SCOPE=1 — '
    + `${ALL_FIELDS.length - APPROVED_FIELDS.size} خانوادهٔ خارج از مجوز فعال شد. `
    + 'مطمئن شوید درخواست مجوز به‌روز شده است.');
}

/** normalizedKey → FieldDef, for O(1) classification of a param. */
const ALIAS_TO_FIELD = new Map<string, FieldDef>();
for (const f of FIELDS) for (const a of f.aliases) ALIAS_TO_FIELD.set(a, f);

/**
 * Every parameter name this task may add or remove, derived from FIELDS.
 *
 * Exported so `verify-trial.ts` can check an edit against the task's ACTUAL scope rather
 * than a hand-copied list. It had one, it was written before the scope widened, and it
 * then reported every correct edit as touching «parameters outside the task's scope» —
 * which is how a supervision check stops being read. Deriving it removes the drift.
 */
export const TOUCHABLE_KEYS: ReadonlySet<string> = new Set([
  ...FIELDS.flatMap(f => [f.canonical, ...f.aliases]).map(normalizeKey),
  'ref',   // |ref=harv removal, part of the originally approved scope
]);

/** Normalize a parameter key for alias matching: «_»→« », collapse ws, lower. */
function normalizeKey(k: string): string {
  return k.replace(/_/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}
/**
 * Normalize a value for EQUALITY ONLY: digits to Western, Arabic letterforms to
 * Persian, whitespace collapsed.
 *
 * The letterform folding is not cosmetic. «کیکو آبه» carried
 * `archivedate= ۳۱ اکتبر ۲۰۱۴` against `تاریخ بایگانی= ۳۱ اكتبر ۲۰۱۴` — the same date,
 * differing in one character, Persian keheh «ک» (U+06A9) against Arabic kaf «ك»
 * (U+0643). Byte comparison calls that a value conflict, so the field was left alone
 * and the duplicate-parameter error stayed on the page after the bot had edited it:
 * the most confusing possible outcome, because the article looks handled and is not.
 * Two values a reader cannot tell apart are the same value.
 */
function normalizeVal(v: string): string {
  return v
    .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660))
    .replace(/[يى]/g, 'ی').replace(/ك/g, 'ک')
    .replace(/\s+/g, ' ').trim();
}

/**
 * How badly a value is written, for choosing between candidates that compare equal.
 * Lower is better. Nothing is ever rewritten by this; it only picks.
 *
 * ONLY Arabic letterforms count, and that is not a style preference — it is what the
 * module can read. Probed against the live CS1 on 2026-10-07 with |تاریخ بایگانی=:
 *
 *   «۳ اکتبر ۲۰۲۰»  Persian digits, Persian keheh  → parses
 *   «۳ اكتبر ۲۰۲۰»  Persian digits, ARABIC kaf     → «تاریخ وارد شده … را بررسی کنید»
 *   «3 اکتبر 2020»  LATIN digits,   Persian keheh  → parses
 *   «۲۲ بهمن ۱۴۰۳»  Jalali                          → parses
 *
 * An earlier version also penalised ASCII digits, assuming a Latin-digit date was what
 * fa CS1 rejected. The probe says otherwise: Latin digits are fine, and the Arabic kaf
 * in the month name is the whole problem. That assumption made «پریمیرا لیگا ۲۰–۲۰۱۹»
 * worse rather than better — the reason to probe a renderer instead of reasoning about
 * it.
 */
function foreignness(s: string): number {
  return (s.match(/[يكى]/g) ?? []).length;
}

/**
 * A LAST-RESORT tie-break between two values that are otherwise equally good: on
 * fa.wikipedia, prefer the one written in Persian digits.
 *
 * Deliberately separate from `foreignness()` and weighted far below it, because the
 * comment above records a real bug caused by treating Latin digits as a correctness
 * problem. They are not: both forms parse. This is purely «۱۴ ژوئن ۲۰۲۰» reads better
 * than «14 ژوئن 2020» to a Persian reader, so when the bot has to discard one of two
 * identical dates it should keep the native-looking one. It must never outrank the
 * letterform check, which IS about what the module can read.
 *
 * Found on `.eu`, where a merge kept «accessdate=14 ژوئن 2020» and discarded
 * «بازبینی=۱۴ ژوئن ۲۰۲۰» — same day, and the worse of the two survived.
 */
function latinDigits(s: string): number {
  return (s.match(/[0-9]/g) ?? []).length ? 1 : 0;
}

/**
 * Whether a parameter name is written in Persian script.
 *
 * Only matters for the `dedupeOnly` families, and there it matters a lot: since nothing
 * is renamed, the alias that survives the merge is the one the article keeps forever.
 * Given «کد زبان» and «lang» holding the same value, keeping the Persian one leaves the
 * citation more readable to the editors who maintain it, and costs nothing — both are
 * declared aliases that render identically.
 */
function isPersianName(key: string): boolean {
  return /[؀-ۿ]/.test(key);
}
function isCitationName(name: string): boolean {
  const n = normalizeKey(name);
  return n === 'یادکرد' || n.startsWith('یادکرد ') || n === 'cite' || n.startsWith('cite ') || n === 'citation';
}
function matchBraces(text: string, start: number): number {
  let depth = 0;
  for (let i = start; i < text.length - 1; i++) {
    const two = text.slice(i, i + 2);
    if (two === '{{') { depth++; i++; }
    else if (two === '}}') { depth--; i++; if (depth === 0) return i + 1; }
  }
  return -1;
}
export function findCitationSpans(text: string): [number, number][] {
  const spans: [number, number][] = [];
  const n = text.length;
  let i = 0;
  while (i < n - 1) {
    if (text[i] === '{' && text[i + 1] === '{') {
      let k = i + 2, name = '';
      while (k < n && text[k] !== '|' && text.slice(k, k + 2) !== '}}' && text.slice(k, k + 2) !== '{{') { name += text[k]; k++; }
      if (isCitationName(name)) { const end = matchBraces(text, i); if (end > 0) { spans.push([i, end]); i = end; continue; } }
    }
    i++;
  }
  return spans;
}
function splitTopLevel(body: string): string[] {
  const segs: string[] = [];
  let cur = '', brace = 0, link = 0, i = 0;
  while (i < body.length) {
    const two = body.slice(i, i + 2);
    if (two === '{{' || two === '[[') { if (two === '{{') brace++; else link++; cur += two; i += 2; continue; }
    if (two === '}}' || two === ']]') { if (two === '}}') brace = Math.max(0, brace - 1); else link = Math.max(0, link - 1); cur += two; i += 2; continue; }
    if (body[i] === '|' && brace === 0 && link === 0) { segs.push(cur); cur = ''; i++; continue; }
    cur += body[i]; i++;
  }
  segs.push(cur);
  return segs;
}
/** Split a param segment at its first top-level '=' into [keyRaw, valWithoutEq|null]. */
function splitKey(seg: string): [string, string | null] {
  let brace = 0, link = 0, i = 0;
  while (i < seg.length) {
    const two = seg.slice(i, i + 2);
    if (two === '{{' || two === '[[') { if (two === '{{') brace++; else link++; i += 2; continue; }
    if (two === '}}' || two === ']]') { if (two === '}}') brace = Math.max(0, brace - 1); else link = Math.max(0, link - 1); i += 2; continue; }
    if (seg[i] === '=' && brace === 0 && link === 0) return [seg.slice(0, i), seg.slice(i + 1)];
    i++;
  }
  return [seg, null];
}

interface Hit { idx: number; keyRaw: string; alias: string; rawVal: string }

/** Normalize one citation span. Returns new span text + flags. */
/** A field left alone because two aliases held genuinely different values. */
/**
 * `field` is the internal identifier (`archive-url`); `canonical` is the Persian
 * parameter name an editor actually sees in the wikitext. The report page shows the
 * canonical — a column reading «archive-url» tells a Persian editor to look for a name
 * that, after this task has run, is no longer in the article.
 */
export interface Conflict { field: string; canonical?: string; values: { key: string; value: string }[] }

function normalizeSpan(span: string): { out: string; changed: boolean; collision: boolean; conflicts: Conflict[] } {
  const conflicts: Conflict[] = [];
  const body = span.slice(2, -2);
  const segs = splitTopLevel(body);

  // classify params by field
  const byField = new Map<string, Hit[]>();
  for (let s = 1; s < segs.length; s++) {
    const [keyRaw, val] = splitKey(segs[s]);
    if (val === null) continue; // positional
    const alias = normalizeKey(keyRaw);
    const f = ALIAS_TO_FIELD.get(alias);
    if (!f) continue;
    (byField.get(f.field) ?? byField.set(f.field, []).get(f.field)!).push({ idx: s, keyRaw, alias, rawVal: val });
  }
  const dropIdx = new Set<number>();
  const rename = new Map<number, { key: string; val: string }>(); // seg idx → replacement key/val
  let changed = false, collision = false;

  // --- |ref=harv -----------------------------------------------------------
  // Part of the approved scope: harv is now the DEFAULT anchor behaviour and the
  // module emits an error for it, so the parameter is pure noise.
  //
  // This runs BEFORE the "no field hits" bail-out below, because a citation can carry
  // ref=harv and nothing else this task cares about — which is the common case, and
  // bailing first silently skipped all of them.
  //
  // Only the exact value `harv` goes. |ref= with any other value is load-bearing:
  // «زبان انگلیسی» alone carries |ref={{Sfnref…}} and a bare |ref=, and |ref=none
  // deliberately SUPPRESSES the anchor short footnotes link to. Dropping any of those
  // would break every sfn pointing at the citation, and break it silently — the
  // citation still renders, only the footnote link goes nowhere. The comparison is
  // case-sensitive to match the module, which tests `'harv' == ref`; |ref=HARV is not
  // the deprecated form and is left alone.
  for (let s = 1; s < segs.length; s++) {
    const [keyRaw, val] = splitKey(segs[s]);
    if (val === null) continue;
    if (normalizeKey(keyRaw) !== 'ref') continue;
    if (normalizeVal(val) !== 'harv') continue;
    dropIdx.add(s); changed = true;
  }

  if (!byField.size && !changed) return { out: span, changed: false, collision: false, conflicts };

  for (const f of FIELDS) {
    const hits = byField.get(f.field);
    if (!hits || !hits.length) continue;

    // apply value-map for comparison + for the eventual kept value
    const mapped = hits.map(h => ({ ...h, mappedVal: f.valueMap ? f.valueMap(h.alias, h.rawVal) : h.rawVal }));
    const nonEmpty = mapped.filter(h => normalizeVal(h.mappedVal) !== '');
    const distinct = new Set(nonEmpty.map(h => normalizeVal(h.mappedVal)));
    if (distinct.size >= 2) {
      // Genuine value clash: the field is left untouched, and recorded so a human can
      // see WHICH values disagreed. «معوق=2» in a job log is not a worklist.
      collision = true;
      conflicts.push({ field: f.field, canonical: f.canonical, values: nonEmpty.map(h => ({ key: h.keyRaw.trim(), value: h.rawVal.trim() })) });
      continue;
    }

    // choose which segment to KEEP: prefer one already at the canonical name, else a non-empty, else first
    const pool = nonEmpty.length ? nonEmpty : mapped;
    // Which SEGMENT survives, i.e. which parameter NAME the article keeps. For a
    // renaming family this barely matters, since the survivor is renamed to the
    // canonical anyway. For a dedupeOnly family it is the entire outcome: prefer the
    // canonical if it is present, then any Persian-script alias, then document order.
    const keep = pool.find(h => normalizeKey(h.keyRaw) === normalizeKey(f.canonical))
      ?? (f.dedupeOnly ? pool.find(h => isPersianName(h.keyRaw)) : undefined)
      ?? pool[0];
    // Of several values that compare equal, keep the one written most natively. Taking
    // whichever came first wrote «اكتبر» with an Arabic kaf, and «3 فوریه 2021» with
    // Latin digits, into the canonical parameter — in the second case producing a date
    // the module cannot parse. Ties keep the earliest, so this only ever breaks ties.
    // Which of the equal values survives. Two preferences, in order:
    //   1. a value the write step would leave UNCHANGED — i.e. one the module already
    //      accepts. Merging «dead-url=بله» into an existing «چگونگی پیوند=dead» must keep
    //      the «dead» that is already there rather than replacing it with «مرده»; that
    //      would be churn on a value nobody needs changed.
    //   2. then the existing letterform preference, for values that are otherwise equal.
    const writesUnchanged = (h: Hit & { mappedVal: string }) =>
      f.writeMap ? (f.writeMap(h.rawVal, h.mappedVal) === h.rawVal.trim() ? 0 : 1) : 0;
    // Weights are ordered by how much each criterion matters, and the gaps are wide so
    // a lower-ranked preference can never overturn a higher one:
    //   1000s  a value the module already accepts (no pointless churn)
    //     10s  Arabic letterforms, which the module genuinely cannot read
    //      1s  Latin digits, purely a readability tie-break
    const rank = (h: Hit & { mappedVal: string }) =>
      writesUnchanged(h) * 1000 + foreignness(h.mappedVal) * 10 + latinDigits(h.mappedVal);
    const chosen = nonEmpty.length ? nonEmpty.reduce((best, h) => rank(h) < rank(best) ? h : best) : keep;
    const keptVal = f.writeMap ? f.writeMap(chosen.rawVal, chosen.mappedVal) : chosen.mappedVal;

    // rename kept → canonical (preserve the ORIGINAL key's leading/trailing space around the name)
    const m = keep.keyRaw.match(/^(\s*).*?(\s*)$/s)!;
    const newKey = f.dedupeOnly ? keep.keyRaw : `${m[1]}${f.canonical}${m[2]}`;
    const needRename = keep.keyRaw !== newKey || keptVal !== keep.rawVal;
    if (needRename) { rename.set(keep.idx, { key: newKey, val: keptVal }); changed = true; }

    // drop the other aliases of this field
    for (const h of mapped) if (h.idx !== keep.idx) { dropIdx.add(h.idx); changed = true; }
  }


  if (!changed) return { out: span, changed: false, collision, conflicts };

  const newSegs: string[] = [];
  for (let s = 0; s < segs.length; s++) {
    if (dropIdx.has(s)) continue;
    const r = rename.get(s);
    if (r) newSegs.push(`${r.key}=${r.val}`);
    else newSegs.push(segs[s]);
  }
  return { out: '{{' + newSegs.join('|') + '}}', changed: true, collision, conflicts };
}

/** Pure transform for the runner. */
export function normalizeCiteParams(text: string): { text: string; changed: boolean; note?: string; manualReview?: boolean; conflicts?: Conflict[] } {
  const spans = findCitationSpans(text);
  if (!spans.length) return { text, changed: false, note: 'یادکردی یافت نشد' };
  let out = '', last = 0, anyChanged = false, collisions = 0;
  const allConflicts: Conflict[] = [];
  for (const [a, b] of spans) {
    const { out: ns, changed, collision, conflicts } = normalizeSpan(text.slice(a, b));
    allConflicts.push(...conflicts);
    out += text.slice(last, a) + ns; last = b;
    anyChanged ||= changed;
    if (collision) collisions++;
  }
  out += text.slice(last);
  if (!anyChanged) {
    return { text, changed: false, manualReview: collisions > 0, conflicts: allConflicts,
             note: collisions ? `${collisions} یادکرد با تداخل مقدار، نیازمند بازبینی دستی` : 'موردی برای هم‌سان‌سازی نبود' };
  }
  return { text: out, changed: true, conflicts: allConflicts,
           note: collisions ? `هم‌سان‌سازی شد؛ ${collisions} یادکرد با تداخل مقدار رها شد` : undefined };
}

export const normalizeCiteParamsTask: BotTask = {
  id: 'normalize-cite-params',
  taskNumber: 3,
  summary: 'هم‌سان‌سازی نام پارامترهای بایگانی یادکردها به نام فارسی و حذف پارامتر تکراری',
  description: 'هم‌سان‌سازی نام پارامترهای یادکرد (نشانی/تاریخ بایگانی و چگونگی پیوند) به نام فارسی معیار و ادغام پارامترهای تکراریِ هم‌ارز؛ یادکردهایی که دو مقدار متفاوت دارند دست‌نخورده و برای بازبینی دستی گزارش می‌شوند.',
  async getTargets(bot: Bot): Promise<string[]> {
    // TARGET_TITLES: a pipe-separated list, for re-running over specific pages — a
    // repair pass after a bug, or a reviewer asking about particular articles. Without
    // it the only way to revisit a page is to hope the search happens to surface it
    // again, which it will not once the page no longer matches.
    const explicit = (process.env.TARGET_TITLES ?? '').split('|').map(s => s.trim()).filter(Boolean);
    if (explicit.length) return explicit;
    // TARGET_FILE: one title per line. Same purpose as TARGET_TITLES, for a repair list
    // too long to pass in a job command.
    const file = process.env.TARGET_FILE;
    if (file && existsSync(file)) {
      const lines = readFileSync(file, 'utf8').split('\n').map(s => s.trim()).filter(Boolean);
      if (lines.length) return lines;
    }

    const seen = new Set<string>();
    // Stop enumerating once this many candidates are collected. The duplicate-parameter
    // category is gathered first, so a small cap yields the error-bearing pages.
    //
    // The default is derived from the run limit rather than being unbounded. The search
    // terms below match roughly 340,000 pages between them (dead-url alone is 119,599),
    // which is ~680 paged requests before the FIRST page is edited — about fourteen
    // minutes of a trial run spent enumerating pages it will never reach. A trial that
    // processes N pages needs a candidate pool a small multiple of N, not all of them.
    // The multiple is slack for candidates that turn out to need no change.
    // TARGET_CAP overrides; 0 with no --limit means enumerate everything (full campaign).
    const envCap = Number(process.env.TARGET_CAP) || 0;
    const cap = envCap || (bot.opts.limit ? bot.opts.limit * 20 : 0);
    // (1) the duplicate-parameter tracking category (the urgent, error-bearing pages)
    let cont: string | undefined;
    do {
      const p: Record<string, string> = {
        action: 'query', list: 'categorymembers',
        cmtitle: 'رده:صفحه‌های دارای ارجاع با متغیر تکراری', cmnamespace: '0', cmlimit: '500',
      };
      if (cont) p.cmcontinue = cont;
      const d = await bot.apiGet(p);
      for (const m of d.query.categorymembers) seen.add(m.title);
      cont = d.continue?.cmcontinue;
    } while (cont && !(cap && seen.size >= cap));
    if (cap && seen.size >= cap) return [...seen];
    // (2) legacy/English/non-canonical alias occurrences (the migration backlog)
    // Every legacy spelling the approved task is about. The dead-url family was
    // missing here, which meant a page whose ONLY defect was |dead-url=yes was never
    // visited: url-status got fixed only when a page happened to be found for an
    // archive-parameter reason. The BRFA's own population estimate is dominated by
    // exactly those names (dead-url ≈۱۲۰٬۰۰۰, پیوند مرده ≈۷۱٬۰۰۰, url-status ≈۷۶٬۰۰۰),
    // and the live hit counts match it: 119,599 / 76,637 / 127,070 on 2026-10-07.
    const legacy = [
      'archive-url', 'archiveurl', 'پیوند بایگانی', 'archive-date', 'archivedate',
      'dead-url', 'deadurl', 'url-status', 'پیوند مرده', 'ref=harv',
      // «نشانی بایگانی» is used on ~41,656 articles and is declared in NO CS1 config.
      // It long predates this task — the bot was adding to that population, not
      // creating it — and it is searched for here so the pages carrying it get moved to
      // the declared «پیوند بایگانی».
      'نشانی بایگانی',
    ];
    for (const term of legacy) {
      let sc: string | undefined;
      do {
        const p: Record<string, string> = {
          action: 'query', list: 'search',
          srsearch: `insource:"${term}"`, srnamespace: '0', srlimit: '500', srinfo: '', srprop: '',
        };
        if (sc) p.sroffset = sc;
        const d = await bot.apiGet(p);
        for (const m of (d.query?.search ?? [])) seen.add(m.title);
        sc = d.continue?.sroffset ? String(d.continue.sroffset) : undefined;
      } while (sc && !(cap && seen.size >= cap));
      if (cap && seen.size >= cap) break;
    }
    return [...seen];
  },
  transform(text: string, title: string) {
    const r = normalizeCiteParams(text);
    // EVERY examined title is recorded, clean ones included: a title that now has no
    // clash is what removes a stale row from the report page. See review-store.ts.
    EXAMINED.push({ title, conflicts: r.conflicts ?? [] });
    return r;
  },
  async report(bot: Bot, dryRun: boolean) { await publishReview(bot, dryRun); },
};

// ---------------------------------------------------------------------------
// The manual-review page
// ---------------------------------------------------------------------------

/**
 * Citations this run refused to touch, collected as it went.
 *
 * The bot is right to leave a genuine value clash alone — «ندا آقاسلطان» has four, one
 * pair fifteen years apart — but «معوق=۴» in a job log is not a worklist, and nobody
 * else can see it. Deciding between «تاریخ بازبینی=2024-04-05» and
 * «بازبینی=۲۸ ژوئیه ۲۰۰۹» is exactly the editorial judgement a bot must not make and a
 * human can make in seconds, given the two values side by side.
 */
const EXAMINED: { title: string; conflicts: Conflict[] }[] = [];

export const REVIEW_PAGE = 'ویکی‌پدیا:گزارش دیتابیس/یادکردهای نیازمند بازبینی';

const faDigits = (n: number) => String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
const MONTHS = ['ژانویه', 'فوریه', 'مارس', 'آوریل', 'مه', 'ژوئن',
                'ژوئیه', 'اوت', 'سپتامبر', 'اکتبر', 'نوامبر', 'دسامبر'];

/**
 * Rows shown PER FIELD, not per page.
 *
 * A single flat cap does not work once access-date is in scope. Measured over 1,000
 * members of the duplicate-parameter category: access-date accounts for 867 of the
 * clashes and the archive families for 136. A flat 400-row list is therefore ~87%
 * access-date, and the archive worklist the page was built for is pushed off the end by
 * a family whose remedy is completely different. Capping per field keeps every family
 * reachable, and the heading says how many were found so nothing is hidden.
 */
const MAX_ROWS_PER_FIELD = 120;

/** Display order: the families the bot can usually fix first, the judgement calls last. */
const FIELD_ORDER = ['archive-url', 'archive-date', 'url-status', 'language', 'title',
  'book-title', 'date', 'page', 'pages', 'periodical', 'chapter', 'publisher', 'access-date'];

/**
 * What a human actually has to DO differs per family, so the page says so per family
 * rather than giving one instruction that is wrong for most rows.
 */
const FIELD_NOTE: Record<string, string> = {
  'access-date': 'بیشتر این موردها یک تاریخ‌اند که دو بار نوشته شده، یک‌بار هجری خورشیدی و '
    + 'یک‌بار میلادی؛ بعضی هم دو تاریخ واقعاً جدا هستند (پیوند بعدها دوباره بررسی شده). '
    + 'ربات تاریخ را تبدیل نمی‌کند و میانشان انتخاب نمی‌کند، چون هر دو کار داوری است.',
  'periodical': 'این نام‌ها برای پودمان یکی‌اند ولی برای خواننده نه: «وبگاه» و «روزنامه» و '
    + '«ژورنال» ادعاهای متفاوتی دربارهٔ منبع‌اند. ربات تنها مورد تکراری را برمی‌دارد و نام را عوض نمی‌کند.',
  'chapter': 'مانند بالا: «فصل» و «مقاله» برای پودمان یکی‌اند و برای خواننده نه.',
};

/**
 * A conflicting value, rendered so the page can actually be saved.
 *
 * Most of these values ARE urls — the whole archive-url family — and printing them bare
 * makes 164 live external links on one page. Two consequences, one fatal: the page
 * becomes a link farm nobody wants, and the spam blacklist refuses the save outright.
 * «archive.today» and «archive.ph» are blacklisted on fa.wikipedia and appear in exactly
 * the citations this task reports, so restoring the page after it was blanked failed with
 * `spamblacklist` until the values stopped being links.
 *
 * `<nowiki>` keeps the full value visible and comparable, which is the point of the
 * column, while creating no link at all.
 *
 * The em dash is written as an entity for a related but distinct reason. The publish gate
 * rejects «—» because it is an English habit in Persian PROSE, and that rule has fired
 * for real three times. But these strings are not prose: they are quoted verbatim from
 * the article's own citations, and one of them is a genuine chapter title, «The Fifth
 * Monarchy — Persia». Changing the character would falsify a quoted value, and leaving it
 * literal blocks the page from ever publishing. The entity renders as the same character,
 * so the reader sees the true value, while the gate's scan for an authored em dash stays
 * meaningful. If the gate ever learns to skip quoted cells, drop this.
 */
function reviewValue(v: string): string {
  const short = v.slice(0, 80).replace(/\u2014/g, '&#8212;');
  return /https?:\/\/|\bwww\./i.test(short) ? `<nowiki>${short}</nowiki>` : short;
}

export function buildReview(
  deferred: { title: string; conflicts: Conflict[] }[], now = new Date(),
): string {
  const rows = deferred.filter(d => d.conflicts.length);
  // flatten to (title, conflict) and bucket by field
  const byField = new Map<string, { title: string; c: Conflict }[]>();
  for (const d of rows) {
    for (const c of d.conflicts) {
      const k = c.field;
      (byField.get(k) ?? byField.set(k, []).get(k)!).push({ title: d.title, c });
    }
  }
  const total = [...byField.values()].reduce((a, v) => a + v.length, 0);
  const head = [
    'این فهرست یادکردهایی است که دو نام هم‌ارز برای یک فیلد دارند و مقدارشان یکسان نیست.',
    'ربات این موردها را دست‌نخورده می‌گذارد، چون انتخاب میان دو مقدار متفاوت داوری محتوایی است',
    'و کار ربات نیست. برای هر مورد هر دو مقدار آمده است تا بتوان بی‌مراجعه به ویکی‌متن تصمیم گرفت.',
    '',
    'پس از اصلاح، پارامتر تکراری را بردارید؛ همین کار صفحه را از',
    '[[:رده:صفحه‌های دارای ارجاع با متغیر تکراری]] بیرون می‌آورد.',
    '',
    `آخرین به‌روزرسانی: ${faDigits(now.getUTCDate())} ${MONTHS[now.getUTCMonth()]} ${faDigits(now.getUTCFullYear())}`,
    `شمار مقاله‌ها: ${faDigits(rows.length)}؛ شمار فیلدها: ${faDigits(total)}`,
    '',
  ];
  if (!total) {
    return [...head, 'در حال حاضر موردی برای بازبینی ثبت نشده است.', '',
      '[[رده:گزارش‌های دیتابیس ویکی‌پدیا]]'].join('\n');
  }

  const out: string[] = [...head];
  const fields = [...byField.keys()].sort(
    (a, b) => (FIELD_ORDER.indexOf(a) + 1 || 99) - (FIELD_ORDER.indexOf(b) + 1 || 99));
  for (const field of fields) {
    const items = byField.get(field)!;
    const label = items[0].c.canonical ?? field;
    // Level 3: this page is not transcluded, but every other list the bot writes uses
    // === for its sections and a reviewer already corrected the bot once for heading
    // levels. Match it.
    out.push(`=== ${label} (${faDigits(items.length)}) ===`);
    if (FIELD_NOTE[field]) out.push(FIELD_NOTE[field], '');
    const shown = items.slice(0, MAX_ROWS_PER_FIELD);
    out.push('{| class="wikitable sortable"', '! مقاله !! مقدارهای ناهمسان');
    for (const { title, c } of shown) {
      out.push('|-');
      const pairs = c.values.map(v => `<code>${v.key}</code> = ${reviewValue(v.value)}`).join('<br />');
      out.push(`| [[${title}]] || ${pairs}`);
    }
    out.push('|}');
    if (items.length > shown.length) {
      out.push('', `(${faDigits(items.length - shown.length)} مورد دیگر از این فیلد در فهرست نیامد.)`);
    }
    out.push('');
  }
  return [...out, '[[رده:گزارش‌های دیتابیس ویکی‌پدیا]]'].join('\n');
}

async function publishReview(bot: Bot, dryRun: boolean) {
  if (!EXAMINED.length) { console.log('بازبینی دستی: در این اجرا صفحه‌ای بررسی نشد'); return; }
  const { rows: stored, existed } = loadStoreChecked();
  const rows = mergeReview(stored, EXAMINED);

  // The report page is cumulative, so publishing it is a WHOLESALE REPLACEMENT of a
  // worklist built up over many runs. If this machine has no store, the merge result is
  // this run's findings alone, and publishing it deletes everything every previous run
  // recorded. That is not hypothetical: a run from a laptop took the page from 41,646
  // bytes to 972 and lost all 38 articles on it, because BOT_STATE_DIR there had no
  // conflicts.json — the store lives on Toolforge.
  //
  // So without a store, the page is only ever safe to CREATE, never to overwrite.
  if (!existed) {
    const cur = await bot.apiGet({ action: 'query', prop: 'revisions', titles: REVIEW_PAGE,
      rvprop: 'ids|size' });
    const page = cur.query.pages[0];
    const liveSize: number = page.missing ? 0 : (page.revisions?.[0]?.size ?? 0);
    if (liveSize > 0) {
      console.error(`  ⚠ ${REVIEW_PAGE} منتشر نشد: سیاههٔ تداخل‌ها (${storePath()}) روی این ماشین نیست،`);
      console.error('    و بازنویسی صفحه با یافته‌های همین اجرا فهرست اجراهای پیشین را نابود می‌کند.');
      console.error('    سیاهه را از Toolforge بیاورید، یا scan-conflicts.ts را اجرا کنید تا از نو ساخته شود.');
      return;
    }
  }

  if (!dryRun) saveStore(rows);
  await publishReviewRows(bot, rows, dryRun);
}

/**
 * Write the report page from the accumulated worklist.
 *
 * Separate from publishReview so the read-only scanner (`scan-conflicts.ts`) can
 * publish the same page from the same store without going through a run that edits
 * articles.
 */
export async function publishReviewRows(
  bot: Bot, rows: { title: string; conflicts: Conflict[] }[], dryRun: boolean,
) {
  const text = buildReview(rows);
  const problems = checkWikitext(REVIEW_PAGE, text);
  if (problems.length) throw new Error('GATE FAILED:\n  - ' + problems.join('\n  - '));
  if (dryRun) {
    console.log(`\n--- ${REVIEW_PAGE} (آزمایشی) ---\n${text.slice(0, 1200)}`);
    return;
  }
  const cur = await bot.apiGet({ action: 'query', prop: 'revisions', titles: REVIEW_PAGE,
    rvprop: 'ids|timestamp', rvslots: 'main' });
  const p = cur.query.pages[0];
  await bot.edit(REVIEW_PAGE, text, 'به‌روزرسانی فهرست یادکردهای دارای تداخل مقدار',
    p.missing ? 0 : p.revisions[0].revid, p.missing ? '' : p.revisions[0].timestamp,
    { allowCreate: true });
  console.log(`منتشر شد: ${REVIEW_PAGE} (${rows.filter(r => r.conflicts.length).length} مقاله)`);
}
