/**
 * وظیفهٔ ۷ — نام پارامترهای قدیمی {{جعبه اطلاعات نرم‌افزار}}.
 *
 * Approved at ویکی‌پدیا:سیاست ربات‌رانی/درخواست مجوز/MamouriBot/وظیفه ۷
 * ({{مجوز دارد}}، ۲۱ سپتامبر ۲۰۲۶).
 *
 * The template was synced towards en twice (revs 28696525 in 2020 and 39450131
 * in 2024). Both passes deleted the Persian parameter names the call sites were
 * written with, without converting the call sites. The failure is silent: an
 * unknown parameter makes its row VANISH from the infobox — no red error, no
 * gap, nothing a reader or a render check can see. The warning exists only in
 * edit preview, which is why ~۸۴۰ articles sat broken for six years.
 *
 * The rename table is derived from the template's own pre-migration revision
 * 28649917 (۴ آوریل ۲۰۲۰) — the last version that still accepted those names —
 * so no mapping is guesswork. All of it lives in src/lib/infobox-software*.ts, shared
 * with the interactive scripts so the two can't drift.
 *
 * The bot only ever rewrites a parameter NAME, never a value, except for two
 * explicitly-reasoned cases (status → discontinued, استفاده → ژانر merge).
 * Value clashes, malformed infoboxes and unmapped names are deferred, never
 * guessed at.
 */
import type { Bot, BotTask } from '../../core.js';
import { fixArticle, aliasGroups, SOFTWARE_RULES, type Rules } from '../../lib/infobox-software.js';
import { RENAME, DEAD, STATUS_PARAMS } from '../../lib/infobox-software-map.js';

const TRACKING_CAT =
  'رده:صفحه‌هایی که از جعبه اطلاعات نرم‌افزار با پارامترهای نامعلوم استفاده می‌کنند';
const TEMPLATE = 'الگو:جعبه اطلاعات نرم‌افزار';

/**
 * The parameter names the live template accepts, read once in getTargets.
 *
 * transform() is pure and synchronous but cannot be correct without this: the
 * allowlist is the definition of "unknown", and it changes on-wiki independently
 * of this code.
 */
let known: Set<string> = new Set();
/** Alias groups read off the live template, so a rename can't shadow an existing alias. */
let rules: Rules = SOFTWARE_RULES;

/** test seam: let a harness supply the same allowlist getTargets would. */
export const seedKnownParams = (names: Iterable<string>) => { known = new Set(names); };

/** Parse the `Check for unknown parameters` allowlist out of the template. */
function parseAllowlist(src: string): Set<string> {
  const m = /ignoreblank=y\|([\s\S]*?)\}\}<!-- check for version errors/.exec(src);
  if (!m) throw new Error('فهرست پارامترهای مجاز در الگو پیدا نشد');
  return new Set(m[1].split('|').map(s => s.trim()).filter(Boolean));
}

/** Every `{{{name|` the template body actually reads. */
function parseConsumed(src: string): Set<string> {
  const body = src.split('{{#invoke:Check for unknown parameters')[0];
  return new Set([...body.matchAll(/\{\{\{\s*([^|{}]+?)\s*[|}]/g)].map(m => m[1].trim()));
}

async function getTargets(bot: Bot): Promise<string[]> {
  // --- read the template and arm the guards -----------------------------
  const r = await bot.apiGet({
    action: 'query', titles: TEMPLATE, prop: 'revisions', rvprop: 'content', rvslots: 'main',
  });
  const src: string = r.query?.pages?.[0]?.revisions?.[0]?.slots?.main?.content ?? '';
  if (!src) throw new Error(`${TEMPLATE} خوانده نشد`);

  known = parseAllowlist(src);
  rules = { ...SOFTWARE_RULES, aliasGroups: aliasGroups(src) };
  const consumed = parseConsumed(src);

  /**
   * Fail closed. A parameter can be READ by a data row yet be missing from the
   * allowlist — on this template `module`/`پودمان` are exactly that. Such a name
   * looks "unknown" while its value displays perfectly, so renaming or dropping
   * it would destroy working data. If the template ever grows a row for one of
   * the legacy names, stop rather than eat it.
   */
  const mapped = [...Object.keys(RENAME), ...DEAD, ...STATUS_PARAMS];
  const clash = mapped.filter(p => consumed.has(p));
  if (clash.length) {
    throw new Error(
      `الگو این پارامترها را می‌خواند ولی جدول تبدیل آن‌ها را تغییر می‌دهد: ${clash.join('، ')}`,
    );
  }
  console.log(`✔ ${known.size} پارامتر مجاز؛ هیچ‌کدام از ${mapped.length} نام نگاشته‌شده خوانده نمی‌شود`);

  // --- enumerate the tracking category ----------------------------------
  const titles: string[] = [];
  let cont: Record<string, string> = {};
  for (;;) {
    const page = await bot.apiGet({
      action: 'query', list: 'categorymembers', cmtitle: TRACKING_CAT,
      cmlimit: '500', cmnamespace: '0', ...cont,
    });
    for (const m of page.query?.categorymembers ?? []) titles.push(m.title);
    if (!page.continue) break;
    cont = page.continue;
  }
  return titles;
}

export const infoboxSoftwareParamsTask: BotTask = {
  id: 'infobox-software-params',
  taskNumber: 7,
  summary:
    'ربات: به‌روز کردن نام پارامترهای جعبه اطلاعات نرم‌افزار به نام‌های کنونی الگو (اطلاعاتی که نمایش داده نمی‌شد بازگشت)',
  description:
    'تبدیل نام‌های قدیمی پارامترهای جعبه اطلاعات نرم‌افزار به نام‌های کنونی و بازگرداندن ردیف‌هایی که به همین سبب نمایش داده نمی‌شدند',

  getTargets,

  transform(text, title) {
    if (known.size === 0) throw new Error('فهرست پارامترهای مجاز بارگذاری نشده است');

    const res = fixArticle(text, known, rules);
    if (!res) {
      return { text, changed: false, note: 'جعبه اطلاعات نرم‌افزار پیدا نشد', manualReview: true };
    }

    if (res.text !== text) {
      const what = res.changes.map(c => c.param).join('، ');
      // A page can be partly fixed and still hold a deferred clash; the change
      // is worth saving, and the leftover keeps it in the category for a human.
      return { text: res.text, changed: true, note: what };
    }

    if (res.manual.length) {
      return { text, changed: false, note: res.manual.join(' | '), manualReview: true };
    }
    return { text, changed: false };
  },
};
