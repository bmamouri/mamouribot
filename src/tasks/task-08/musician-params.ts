/**
 * MamouriBot — Task 8: rename legacy/misspelled parameter keys of
 * {{جعبه اطلاعات هنرمند موسیقی}} to the names the template actually reads.
 *
 * On-wiki request  : ویکی‌پدیا:سیاست ربات‌رانی/درخواست مجوز/MamouriBot/وظیفه ۸
 * On-wiki code copy: کاربر:MamouriBot/کد/وظیفه ۸
 *
 * The template accepts a fixed known-parameter list; anything else is silently
 * discarded and the page is filed in
 * رده:صفحه‌هایی که از جعبه اطلاعات هنرمند موسیقی با پارامترهای نامعلوم استفاده می‌کنند.
 * A full scan of every transclusion found thousands of FILLED-IN values sitting
 * under names the template ignores — so the data is invisible to readers today.
 *
 * Scope (deliberately narrow): only keys whose correct target ALREADY EXISTS in
 * the template. Keys with no target at all (ملیت، associated_acts، استاد، دانشگاه …)
 * are NOT touched here — removing or migrating those changes article content and
 * needs its own consensus first.
 *
 * Safety invariants:
 *   - only parameters INSIDE a {{جعبه اطلاعات هنرمند موسیقی}} call are considered
 *     (balanced {{ }} / [[ ]] scan); an identically-named param in another
 *     infobox on the same page is untouched;
 *   - the VALUE is never REWRITTEN — only the key changes. (It is read, to detect
 *     collisions and to apply the Latin-header guard below.)
 *   - alignment/padding around `=` is preserved;
 *   - collision guard: if the rename would put two DIFFERENT non-empty values on
 *     the same infobox row, the WHOLE ARTICLE is left alone for manual review;
 *   - an empty duplicate of the target is merged away (the filled value wins).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import type { Bot, BotTask } from '../../core.js';

/** Template names (and redirects) whose calls we may edit. */
const CALL_NAMES = [
  'جعبه اطلاعات هنرمند موسیقی',
  'Infobox musical artist',
  'Infobox musician',
  'Infobox Musical Artist',
  'هنرمند موسیقی',
  'اطلاعات هنرمند موسیقی',
];

/**
 * wrong key → canonical key the template reads.
 * Every TARGET is one of the template's own documented names and is grammatically
 * correct Persian (per the Task-4 review note about «شرکت‌های تابعه»).
 */
export const RENAME: Record<string, string> = {
  // Persian: underscore is NOT a space in a parameter name
  'اندازه_تصویر': 'اندازه تصویر',
  'تصویر_توضیح': 'زیرنویس تصویر',
  'محل_تولد': 'محل تولد',
  'نام_همسر': 'همسر',
  'اعضای_فعلی': 'اعضای کنونی',
  'اعضای_قبلی': 'اعضای پیشین',
  'ساز_تخصصی': 'ساز',
  // Persian: spacing / ZWNJ / plural variants of an existing name
  'پس زمینه': 'پس‌زمینه',
  'سال های فعالیت': 'سال‌های فعالیت',
  'جایزه': 'جوایز',
  'اعضا': 'اعضای کنونی',
  'اعضاء': 'اعضای کنونی',
  'همسران': 'همسر',
  'همسر(ها)': 'همسر',
  'همسر(ان)': 'همسر',
  'ساز(ها)': 'ساز',
  'وب گاه': 'وبگاه',
  // Persian: legacy synonym of an existing field
  'سایت': 'وبگاه',
  'برچسب': 'ناشر',
  'ساز تخصصی': 'ساز',
  'آلت موسیقی': 'ساز',
  'عنوان تصویر': 'زیرنویس تصویر',
  'نام اصلی': 'نام تولد',
  'نام هنگام تولد': 'نام تولد',
  'زبان نام اصلی': 'زبان نام بومی',
  // Latin: parameter names are case-sensitive
  'Name': 'name',
  'Genre': 'genre',
  'Background': 'background',
  'Years_active': 'years_active',
  'Label': 'label',
  'Occupation': 'occupation',
  'Occupations': 'occupations',
  'Origin': 'origin',
  'Instrument': 'instrument',
  'Instruments': 'instruments',
  'Current_members': 'current_members',
  'Past_members': 'past_members',
  'Alias': 'alias',
  'Landscape': 'landscape',
  'Spouse': 'spouse',
  'Caption': 'caption',
  'Img': 'image',
  'Img_capt': 'caption',
  'Birth Name': 'birth_name',
  // NOTE: «official» is deliberately NOT mapped. A full-corpus audit found 271 of
  // 366 uses collide with an already-filled website — and the "collision" is the
  // SAME url, raw in official vs wrapped as {{URL|…}} in website. It is a
  // redundant duplicate key, not a value carrier, so de-duplicating it is a
  // separate problem from renaming and is out of scope for this task.
  // Latin: spelling variants of an existing name
  'genres': 'genre',
  'yearsactive': 'years_active',
  'imagesize': 'image_size',
  'image size': 'image_size',
  'label_name': 'label',
  'other_names': 'alias',
  'othername': 'alias',
  'url': 'website',
  'URL': 'website',
};

/**
 * Underscore elimination (raised in the وظیفه ۸ approval): fa.wiki is dropping
 * underscore parameter names entirely. These keys WORK today — the template accepts
 * them — so converting them is cosmetic in isolation. It is the prerequisite for
 * removing the aliases from the template, which is the point.
 *
 * Only PERSIAN names are converted. Latin names (`birth_date`, `image_size`,
 * `years_active`, …) keep their underscores — they are en.wikipedia's parameter
 * names and the template stays synced with them.
 *
 * ⚠ `نام_اصلی` maps to «نام تولد», NOT «نام اصلی»: the space form is NOT read by the
 * template, so a naive underscore→space swap would silently blank the birth name in
 * ~1,900 articles.
 */
export const DEALIAS: Record<string, string> = {
  'توضیح_تصویر': 'توضیح تصویر',
  'نام_مستعار': 'نام مستعار',
  'نام_اصلی': 'نام تولد',
  'اعضای_کنونی': 'اعضای کنونی',
  'اعضای_پیشین': 'اعضای پیشین',
};

/** Every key the transform may rewrite, whatever the reason. */
export const ALL_RENAMES: Record<string, string> = { ...RENAME, ...DEALIAS };

/**
 * Alias sets that feed ONE infobox row. Two keys in the same group carrying two
 * different non-empty values after a rename is a genuine collision.
 */
const ROWS: string[][] = [
  ['name', 'نام'],
  ['background', 'پس‌زمینه'],
  ['embed', 'جاسازی‌کردن'],
  ['image', 'تصویر'],
  ['image_size', 'اندازه تصویر', 'image_upright'],
  ['landscape', 'دورنما'],
  ['alt', 'جایگزین تصویر'],
  ['image_class', 'کلاس تصویر'],
  ['caption', 'زیرنویس تصویر', 'توضیح تصویر', 'توضیح_تصویر', 'زیرنویس'],
  ['alias', 'نام مستعار', 'نام_مستعار'],
  ['birth_name', 'نام تولد', 'نام_اصلی', 'Birth_name'],
  ['birth_date', 'زادروز'],
  ['birth_place', 'زادگاه', 'تولد', 'محل تولد'],
  ['origin', 'خاستگاه'],
  ['death_date', 'تاریخ مرگ'],
  ['death_place', 'محل مرگ', 'مکان مرگ', 'مرگ'],
  ['death_cause', 'علت مرگ'],
  ['education', 'تحصیلات'],
  ['genre', 'ژانر', 'ژانرها', 'سبک', 'سبک‌ها'],
  ['occupation', 'پیشه', 'حرفه'],
  ['occupations'],
  ['instrument', 'ساز'],
  ['instruments', 'سازها'],
  ['discography', 'ترانه‌شناسی'],
  ['works', 'آثار'],
  ['years_active', 'سال‌های فعالیت', 'مدت', 'فعالیت'],
  ['label', 'ناشر'],
  ['publishers', 'پخش‌کننده‌ها'],
  ['current_member_of', 'عضو کنونی'],
  ['past_member_of', 'عضو پیشین'],
  ['spouse', 'همسر'],
  ['partner', 'شریک زندگی'],
  ['awards', 'جوایز'],
  ['current_members', 'اعضای کنونی', 'اعضای_کنونی'],
  ['past_members', 'اعضای پیشین', 'اعضای_پیشین'],
  ['website', 'وبگاه', 'وب‌گاه', 'نشانی وب'],
  ['honorific_prefix', 'پیشوند افتخاری'],
  ['honorific_suffix', 'پسوند افتخاری'],
  ['native_name', 'نام بومی'],
  ['native_name_lang', 'زبان نام بومی'],
];

const ROW_OF = new Map<string, string>();
for (const g of ROWS) for (const a of g) ROW_OF.set(a, g[0]);
const rowOf = (k: string) => ROW_OF.get(k) ?? `@${k}`;

/**
 * Renames that must NOT fire when the value is Latin-only.
 *
 * `Name` is currently IGNORED by the template, so the infobox header falls back to
 * the (Persian) page title. Honouring a Latin-only value would replace that
 * Persian header with an English string — a visible regression on fa.wiki. Of the
 * 80 live `|Name=` values, 64 are Persian (worth recovering) and 10 are Latin-only
 * (left alone for a human).
 */
export const LATIN_GUARDED = new Set(['Name']);
export const hasPersian = (v: string) => /[\u0600-\u06FF]/.test(v);

/** A value that contributes nothing (blank, or only an HTML comment). */
function isBlank(v: string): boolean {
  return v.replace(/<!--[\s\S]*?-->/g, '').trim() === '';
}

/** Locate every balanced {{Infobox musical artist …}} call in the page. */
export function findCalls(text: string): Array<[number, number]> {
  const alt = CALL_NAMES.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const re = new RegExp(`\\{\\{\\s*(?:${alt})\\s*[|}]`, 'giu');
  const out: Array<[number, number]> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const start = m.index;
    let depth = 0;
    let i = start;
    while (i < text.length) {
      if (text.startsWith('{{', i)) { depth++; i += 2; continue; }
      if (text.startsWith('}}', i)) { depth--; i += 2; if (depth === 0) break; continue; }
      i++;
    }
    if (depth !== 0) return out; // unbalanced → refuse to touch this page
    out.push([start, i]);
    re.lastIndex = i;
  }
  return out;
}

type Part = { raw: string; key: string | null; value: string };

/** Split a call body on TOP-LEVEL pipes (ignoring nested templates/links). */
function splitParts(call: string): Part[] {
  const body = call.slice(2, -2);
  const chunks: string[] = [];
  let depth = 0, cur = '', i = 0;
  while (i < body.length) {
    const two = body.slice(i, i + 2);
    if (two === '{{' || two === '[[') { depth++; cur += two; i += 2; continue; }
    if (two === '}}' || two === ']]') { depth--; cur += two; i += 2; continue; }
    if (body[i] === '|' && depth === 0) { chunks.push(cur); cur = ''; i++; continue; }
    cur += body[i]; i++;
  }
  chunks.push(cur);
  return chunks.map((raw, idx) => {
    if (idx === 0) return { raw, key: null, value: '' };
    const eq = raw.indexOf('=');
    if (eq < 0) return { raw, key: null, value: '' };
    return { raw, key: raw.slice(0, eq).trim(), value: raw.slice(eq + 1) };
  });
}

/**
 * Swap the key inside a `  key   = value` chunk.
 *
 * Two layout styles exist in the wild and we must not convert one into the other:
 *  - column-aligned (`|نام          = …`) → keep the `=` column by adjusting padding;
 *  - single-space   (`|نام = …`)          → keep exactly the original spacing.
 * Padding never drops below one space, so a longer key can't produce `|کلید= مقدار`.
 */
function renameChunk(raw: string, from: string, to: string): string {
  const eq = raw.indexOf('=');
  const head = raw.slice(0, eq);      // e.g. "اندازه_تصویر   "
  const rest = raw.slice(eq);         // "= 280px"
  const lead = head.match(/^\s*/)![0];
  const trail = head.slice(lead.length + from.length); // padding after the key
  // not column-aligned → leave spacing exactly as the author wrote it
  if (trail.length <= 1) return `${lead}${to}${trail}${rest}`;
  const width = from.length + trail.length;            // the `=` column
  const pad = ' '.repeat(Math.max(1, width - to.length));
  return `${lead}${to}${pad}${rest}`;
}

export type TransformResult = {
  text: string;
  changed: boolean;
  note?: string;
  manualReview?: boolean;
};

export function fixMusicianParams(text: string): TransformResult {
  const calls = findCalls(text);
  if (!calls.length) return { text, changed: false };

  let out = text;
  // `recovered` = changes a reader or the tracking category actually notices:
  //   a rename (hidden value becomes visible) or the removal of a NON-EMPTY
  //   unknown key (page leaves the tracking category).
  // `cosmetic` = removal of an EMPTY legacy key. The template's unknown-param
  //   check uses ignoreblank=y, so an empty stray key renders nothing and is not
  //   categorised — removing it alone would be a purely cosmetic edit, which
  //   سیاست ربات‌رانی forbids. It may only ride along with a real change.
  let renamed = 0, dealiased = 0, dedupedNonEmpty = 0, droppedEmpty = 0;

  // rebuild right-to-left so earlier offsets stay valid
  for (let c = calls.length - 1; c >= 0; c--) {
    const [s, e] = calls[c];
    const call = text.slice(s, e);
    const parts = splitParts(call);

    // what does each row already hold, ignoring the keys we're about to rename?
    const kept = new Map<string, string>();
    for (const p of parts) {
      if (!p.key || ALL_RENAMES[p.key]) continue;
      if (!isBlank(p.value)) kept.set(rowOf(p.key), p.value.trim());
    }

    const drop = new Set<number>();
    let local = 0;
    const claimed = new Map<string, string>();

    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (!p.key) continue;
      const to = ALL_RENAMES[p.key];
      if (!to) continue;

      if (isBlank(p.value)) { drop.add(i); droppedEmpty++; continue; } // empty legacy key → cosmetic only

      // would replace a Persian rendering with a Latin one → leave for a human
      if (LATIN_GUARDED.has(p.key) && !hasPersian(p.value)) continue;

      const row = rowOf(to);
      const existing = kept.get(row);
      if (existing !== undefined && existing !== p.value.trim()) {
        // genuine clash with a value the template already displays
        return {
          text,
          changed: false,
          note: `تداخل مقدار در «${p.key}»/«${to}» — نیازمند بازبینی دستی`,
          manualReview: true,
        };
      }
      const prior = claimed.get(row);
      if (prior !== undefined && prior !== p.value.trim()) {
        return {
          text,
          changed: false,
          note: `دو پارامتر قدیمی با مقدار متفاوت برای «${to}» — نیازمند بازبینی دستی`,
          manualReview: true,
        };
      }
      // identical value already on the row: dropping this non-empty unknown key
      // is what removes the page from the tracking category → a real change
      if (existing !== undefined || prior !== undefined) { drop.add(i); dedupedNonEmpty++; continue; }
      claimed.set(row, p.value.trim());
      if (DEALIAS[p.key]) dealiased++;
      parts[i] = { ...p, raw: renameChunk(p.raw, p.key, to), key: to };
      local++;
    }

    // an empty duplicate of a row we just filled is now redundant
    if (local) {
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        if (!p.key || drop.has(i)) continue;
        if (isBlank(p.value) && claimed.has(rowOf(p.key)) && !ALL_RENAMES[p.key]) { drop.add(i); droppedEmpty++; }
      }
    }
    if (!local && !drop.size) continue;

    renamed += local - 0;
    const rebuilt = '{{' + parts.filter((_, i) => !drop.has(i)).map((p) => p.raw).join('|') + '}}';
    out = out.slice(0, s) + rebuilt + out.slice(e);
  }

  // Nothing but EMPTY stray keys removed → still a no-op edit, skip.
  // (De-aliasing counts as a real change: it is the prerequisite for dropping the
  // underscore aliases from the template.)
  if (renamed + dedupedNonEmpty === 0) return { text, changed: false };
  // never let the transform mangle the page wholesale
  if (out.includes('~~~~')) return { text, changed: false, note: 'رشتهٔ امضا در نتیجه', manualReview: true };
  return {
    text: out,
    changed: out !== text,
    note: `${renamed - dealiased} تغییرنام، ${dealiased} حذف زیرخط، ${dedupedNonEmpty} حذف تکراری، ${droppedEmpty} حذف خالی`,
  };
}

export const musicianParamsTask: BotTask = {
  id: 'musician-params',
  taskNumber: 8,
  summary: 'اصلاح نام پارامترهای قدیمی جعبه اطلاعات هنرمند موسیقی به نام کنونی',
  description:
    'تغییرنام کلیدهای قدیمی/نادرست {{جعبه اطلاعات هنرمند موسیقی}} به نامی که الگو می‌خواند',
  async getTargets(bot: Bot): Promise<string[]> {
    // Building the list costs one CirrusSearch per key (~6 min), so cache it:
    // a restarted Toolforge job resumes instantly, and — more importantly — the
    // trial and the full run then operate on the SAME frozen list, which is what
    // makes the trial audit meaningful.
    const dir = process.env.BOT_STATE_DIR ?? '.state';
    const cache = `${dir}/musician-params.targets.json`;
    if (existsSync(cache)) {
      const t = JSON.parse(readFileSync(cache, 'utf8')) as string[];
      console.log(`فهرست هدف از حافظهٔ نهان: ${t.length} صفحه (${cache})`);
      return t;
    }
    const seen = new Set<string>();
    const keys = Object.keys(ALL_RENAMES);   // must include DEALIAS, not just RENAME
    // one CirrusSearch per key, scoped to pages that transclude the template
    for (const k of keys) {
      const esc = k.replace(/[\\/]/g, '\\$&');
      let offset = 0;
      for (;;) {
        const d = await bot.apiGet({
          action: 'query', list: 'search', srnamespace: '0', srlimit: '500',
          sroffset: String(offset),
          srsearch: `hastemplate:"جعبه اطلاعات هنرمند موسیقی" insource:/\\|[ ]*${esc}[ ]*=[ ]*[^ |}]/`,
        });
        for (const r of d.query?.search ?? []) seen.add(r.title);
        const next = d.continue?.sroffset;
        if (next === undefined) break;
        offset = next;
      }
    }
    const out = [...seen].sort();
    mkdirSync(dir, { recursive: true });
    writeFileSync(cache, JSON.stringify(out, null, 0));
    console.log(`فهرست هدف ساخته و ذخیره شد: ${out.length} صفحه (${cache})`);
    return out;
  },
  transform(text: string) { return fixMusicianParams(text); },
};
