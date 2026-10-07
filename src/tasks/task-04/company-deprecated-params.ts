/**
 * Task 4 — normalise {{جعبه اطلاعات شرکت}} (Infobox company) parameter usage.
 *
 * Targets = pages in
 *   رده:صفحه‌هایی که از جعبه اطلاعات شرکت با پارامترهای منسوخ‌شده استفاده می‌کنند
 * i.e. every article carrying a NON-EMPTY *deprecated* parameter. Those deprecated
 * aliases are no longer read by the template body, so their data is INVISIBLE in
 * the rendered infobox; renaming them to the modern canonical both clears the
 * tracking category AND restores the hidden field. That rename is the SUBSTANTIVE
 * reason we edit an article.
 *
 * Because we're already editing such an article, we also — per the operator's
 * decision — Persianise the rest of that infobox in the SAME edit ("update it
 * properly"): English parameter keys → their canonical Persian name, and the
 * invocation name ({{Infobox company}}, {{Infobox bank}}, …) → {{جعبه اطلاعات شرکت}}.
 * This normalisation is COSMETIC (renders identically) and therefore only ever
 * RIDES ALONG with a substantive rename — an article with only English keys and
 * no deprecated param is never in the category, and one whose sole deprecated
 * param is UNRESOLVED is left untouched. The bot never makes a cosmetic-only edit.
 *
 * Safety design (edits live article bodies, so it is conservative):
 *   - Only KEYS *inside* a جعبه اطلاعات شرکت invocation are touched; a like-named
 *     param in another template ({{جعبه اطلاعات مکان|موقعیت=…}}) is left alone —
 *     the parser brace/link-matches the exact template span first.
 *   - Recognises every redirect that resolves to the template as an invocation.
 *   - Values are never parsed or altered; only the key token / invocation name is
 *     renamed, preserving surrounding whitespace and alignment.
 *   - Duplicate resolution: an empty (or identical) duplicate is merged away; a
 *     genuine value clash on a SUBSTANTIVE field skips the whole article for
 *     manual review; a clash on a purely cosmetic field leaves THAT field
 *     un-normalised (both keys kept) rather than blocking the substantive fix.
 *
 * A few rare, genuinely ambiguous legacy aliases are left UNRESOLVED (reported,
 * not renamed): «توضیح» (which caption?), «نام‌های تجاری» (brands vs trade name),
 * «شکل‌بندی بدنه» (dead bodyclass, no modern field).
 *
 * NB: «شرکت‌های تابعه» (Arabic feminine) is grammatically wrong Persian — the
 * canonical is «شرکت‌های تابع» (see the template fix / lessons); the map reflects
 * that, and never renames toward the …تابعه form.
 */
import type { Bot, BotTask } from '../../core.js';

/** Every recognised alias (deprecated OR current English/variant) → its canonical Persian name. */
const CANONICAL: Record<string, string> = {
  // ── legacy aliases the current template DROPPED (unknown params → hidden data);
  //    mappings verified against the pre-migration native template's own alias chains
  //    (rev 41182191, the last version before the 2026-06 en/Wikidata port) ──
  'foundation': 'بنیان‌گذاری',
  'dissolved': 'انحلال',
  'location': 'دفتر مرکزی',
  'location_city': 'شهر دفتر مرکزی',
  'location_country': 'کشور دفتر مرکزی',
  'locations': 'تعداد مکان‌ها',
  'subsid': 'شرکت‌های تابع',
  'company_name': 'نام',
  'company_logo': 'نشان‌واره',
  'company_type': 'نوع',
  'trading_name': 'نام تجاری',
  'profit': 'سود خالص',
  'profit_year': 'سال سود خالص',
  'caption': 'توضیح نشان‌واره',       // logo-caption chain in the native template
  'توضیح': 'توضیح نشان‌واره',          // same chain (was previously UNRESOLVED; history resolves it)
  'نام شرکت': 'نام',
  'نوع شرکت': 'نوع',
  'نام‌های تجاری': 'برندها',           // brands row (was UNRESOLVED; history resolves brands≠trade_name)
  // ── deprecated aliases (renaming these is SUBSTANTIVE: restores hidden data / clears the category) ──
  'homepage': 'وبگاه',
  'از بین رفته': 'انحلال',
  'افراد مهم': 'افراد کلیدی',
  'بنا نهاده': 'بنیان‌گذاری',
  'بنیان گذار': 'بنیان‌گذار',
  'بنیان گذاران': 'بنیان‌گذاران',
  'بنیانگذار': 'بنیان‌گذار',
  'بنیانگذاران': 'بنیان‌گذاران',
  'تابعه': 'شرکت‌های تابع',
  'تاسیس': 'بنیان‌گذاری',
  'تعداد کارکنان': 'شمار کارکنان',
  'توضیح نشان': 'توضیح نشان‌واره',
  'جایگزین نماد': 'جایگزین نشان‌واره',
  'دارایی کل': 'دارایی',
  'دارنده': 'مالک',
  'دارندگان': 'مالکان',
  'رئیس هیات مدیره': 'افراد کلیدی',
  'رتبه‌بندی': 'رتبه',
  'رییس هیئت مدیره': 'افراد کلیدی',
  'زیرنویس': 'توضیح نشان‌واره',
  'زیرنویس تصویر': 'توضیح تصویر',
  'زیرنویس نماد': 'توضیح نشان‌واره',
  'شخصیت_اصلی': 'افراد کلیدی',
  'شرکت تابعه': 'شرکت‌های تابع',
  'شرکت مادر': 'مادر',
  'شرکت‌های تابعه': 'شرکت‌های تابع',
  'شرکت‌های وابسته': 'شرکت‌های تابع',
  'شعبه مرکزی': 'دفتر مرکزی',
  'شعبه مرکزی_شهر': 'شهر دفتر مرکزی',
  'شعبه مرکزی_کشور': 'کشور دفتر مرکزی',
  'شعبهٔ مرکزی': 'دفتر مرکزی',
  'شعبهٔ مرکزی_شهر': 'شهر دفتر مرکزی',
  'شعبهٔ مرکزی_کشور': 'کشور دفتر مرکزی',
  'شهر شعبه مرکزی': 'شهر دفتر مرکزی',
  'شهر شعبهٔ مرکزی': 'شهر دفتر مرکزی',
  'شهر موقعیت': 'شهر دفتر مرکزی',
  'صفحه اصلی': 'وبگاه',
  'صفحه خانگی': 'وبگاه',
  'طبقه': 'نوع',
  'محدودهٔ فعالیت': 'محدوده فعالیت',
  'منحل‌شده': 'انحلال',
  'موقعیت': 'دفتر مرکزی',
  'موقعیت‌ها': 'تعداد مکان‌ها',
  'نماد': 'نشان‌واره',
  'نماد شرکت': 'نماد بورس',
  'نماد معاملاتی': 'نماد بورس',
  'وب گاه': 'وبگاه',
  'وب‌گاه': 'وبگاه',
  'پانوشت‌ها': 'پانویس',
  'پیشتر نامیده': 'نام پیشین',
  'پیشین': 'شرکت قبلی',
  'پیشینیان': 'شرکت‌های قبلی',
  'کارمندان': 'شمار کارکنان',
  'کارکنان': 'شمار کارکنان',
  'کشور شعبه مرکزی': 'کشور دفتر مرکزی',
  'کشور شعبهٔ مرکزی': 'کشور دفتر مرکزی',
  'کشور موقعیت': 'کشور دفتر مرکزی',
  'گونه': 'نوع',
  // ── current English / Latin aliases (renaming these is COSMETIC — only rides along with a substantive edit) ──
  'ISIN': 'شماره اوراق بهادار',
  'area_served': 'محدوده فعالیت',
  'areas_served': 'مناطق تحت پوشش',
  'assets': 'دارایی',
  'assets_year': 'سال دارایی',
  'aum': 'دارایی تحت مدیریت',
  'brands': 'برندها',
  'defunct': 'انحلال',
  'divisions': 'زیرمجموعه‌ها',
  'embed': 'تعبیه',
  'equity': 'سهام',
  'equity_year': 'سال سهام',
  'fate': 'سرنوشت',
  'fetchwikidata': 'واکشی ویکی‌داده',
  'footnotes': 'پانویس',
  'former_name': 'نام پیشین',
  'former_names': 'نام‌های پیشین',
  'founded': 'بنیان‌گذاری',
  'founder': 'بنیان‌گذار',
  'founders': 'بنیان‌گذاران',
  'genre': 'ژانر',
  'hq_location': 'دفتر مرکزی',
  'hq_location_city': 'شهر دفتر مرکزی',
  'hq_location_country': 'کشور دفتر مرکزی',
  'image': 'تصویر',
  'image_alt': 'جایگزین تصویر',
  'image_caption': 'توضیح تصویر',
  'image_size': 'اندازه تصویر',
  'image_upright': 'تصویر ایستاده',
  'income_year': 'سال سود ناخالص',
  'incorporated': 'صلاحیت ادغام',
  'industry': 'صنعت',
  'key_people': 'افراد کلیدی',
  'logo': 'نشان‌واره',
  'logo_alt': 'جایگزین نشان‌واره',
  'logo_caption': 'توضیح نشان‌واره',
  'logo_class': 'کلاس نشان‌واره',
  'logo_size': 'اندازه نشان‌واره',
  'logo_upright': 'نشان‌واره ایستاده',
  'module': 'پودمان',
  'name': 'نام',
  'native_name': 'نام بومی',
  'native_name_lang': 'زبان نام بومی',
  'net_income': 'سود خالص',
  'net_income_year': 'سال سود خالص',
  'noicon': 'بدون آیکون',
  'num_employees': 'شمار کارکنان',
  'num_employees_year': 'سال شمار کارکنان',
  'num_locations': 'تعداد مکان‌ها',
  'num_locations_year': 'سال تعداد مکان‌ها',
  'num_members': 'شمار اعضا',
  'num_members_year': 'سال شمار اعضا',
  'operating_income': 'سود ناخالص',
  'owner': 'مالک',
  'owners': 'مالکان',
  'parent': 'مادر',
  'predecessor': 'شرکت قبلی',
  'predecessors': 'شرکت‌های قبلی',
  'production': 'تولید',
  'production_year': 'سال تولید',
  'products': 'محصولات',
  'qid': 'شناسه ویکی‌داده',
  'rating': 'رتبه',
  'ratio': 'نسبت سرمایه',
  'revenue': 'درآمد',
  'revenue_year': 'سال درآمد',
  'romanized_name': 'نام لاتین',
  'services': 'خدمات',
  'subsidiaries': 'شرکت‌های تابع',
  'successor': 'جانشین',
  'successors': 'جانشینان',
  'suppressfields': 'فرونشانی فیلدها',
  'trade_name': 'نام تجاری',
  'traded_as': 'نماد بورس',
  'type': 'نوع',
  'website': 'وبگاه',
};

/** The subset of CANONICAL keys whose rename is SUBSTANTIVE (justifies editing the article at all). */
const SUBSTANTIVE = new Set<string>([
  // legacy dropped-alias renames restore hidden data → substantive
  'foundation', 'dissolved', 'location', 'location_city', 'location_country', 'locations', 'subsid',
  'company_name', 'company_logo', 'company_type', 'trading_name', 'profit', 'profit_year', 'caption',
  'توضیح', 'نام شرکت', 'نوع شرکت', 'نام‌های تجاری',
  'homepage', 'از بین رفته', 'افراد مهم', 'بنا نهاده', 'بنیان گذار', 'بنیان گذاران', 'بنیانگذار',
  'بنیانگذاران', 'تابعه', 'تاسیس', 'تعداد کارکنان', 'توضیح نشان', 'جایگزین نماد', 'دارایی کل', 'دارنده', 
  'دارندگان', 'رئیس هیات مدیره', 'رتبه‌بندی', 'رییس هیئت مدیره', 'زیرنویس', 'زیرنویس تصویر', 'زیرنویس نماد', 
  'شخصیت_اصلی', 'شرکت تابعه', 'شرکت مادر', 'شرکت‌های تابعه', 'شرکت‌های وابسته', 'شعبه مرکزی', 
  'شعبه مرکزی_شهر', 'شعبه مرکزی_کشور', 'شعبهٔ مرکزی', 'شعبهٔ مرکزی_شهر', 'شعبهٔ مرکزی_کشور', 
  'شهر شعبه مرکزی', 'شهر شعبهٔ مرکزی', 'شهر موقعیت', 'صفحه اصلی', 'صفحه خانگی', 'طبقه', 'محدودهٔ فعالیت', 
  'منحل‌شده', 'موقعیت', 'موقعیت‌ها', 'نماد', 'نماد شرکت', 'نماد معاملاتی', 'وب گاه', 'وب‌گاه', 'پانوشت‌ها', 
  'پیشتر نامیده', 'پیشین', 'پیشینیان', 'کارمندان', 'کارکنان', 'کشور شعبه مرکزی', 'کشور شعبهٔ مرکزی', 
  'کشور موقعیت', 'گونه', 
]);

/** The canonical Persian invocation the bot normalises every alias name to. */
const CANONICAL_TEMPLATE = 'جعبه اطلاعات شرکت';

/**
 * Alias PRECEDENCE, taken verbatim from the pre-migration template's own
 * `{{{a|{{{b|{{{c|…}}}}}}}}}` chains (rev 41182191). The template displayed the
 * FIRST non-empty alias in each chain and ignored the rest — so when two aliases
 * of one field carry different values (a "collision"), the winner is the
 * highest-precedence (earliest) one: that's the value readers actually saw, and
 * the shadowed ones have been dead/invisible for years. Rank = position in chain
 * (lower wins). Unknown aliases get no rank → such a clash is still deferred.
 */
const PRECEDENCE_CHAINS: string[][] = [
  ['location', 'hq_location', 'شعبهٔ مرکزی', 'شعبه مرکزی', 'دفتر مرکزی', 'موقعیت'],
  ['location_city', 'hq_location_city', 'شهر شعبهٔ مرکزی', 'شعبهٔ مرکزی_شهر', 'شهر شعبه مرکزی', 'شعبه مرکزی_شهر', 'شهر موقعیت'],
  ['location_country', 'hq_location_country', 'کشور شعبهٔ مرکزی', 'شعبهٔ مرکزی_کشور', 'کشور شعبه مرکزی', 'شعبه مرکزی_کشور', 'کشور موقعیت'],
  ['name', 'نام', 'company_name', 'نام شرکت'],
  ['type', 'نوع', 'company_type', 'نوع شرکت', 'طبقه', 'گونه'],
  ['traded_as', 'نماد معاملاتی', 'نماد شرکت', 'نماد بورس'],
  ['subsid', 'subsidiaries', 'شرکت‌های تابع', 'تابع', 'شرکت‌های وابسته', 'شرکت تابعه', 'تابعه'],
  ['parent', 'مادر', 'شرکت مادر'],
  ['divisions', 'زیرمجموعه‌ها'],
  ['owners', 'دارندگان', 'مالکان', 'owner', 'دارنده', 'مالک'],
  ['num_employees', 'شمار کارکنان', 'تعداد کارکنان', 'کارمندان', 'کارکنان'],
  ['foundation', 'founded', 'بنا نهاده', 'تاسیس', 'تأسیس', 'بنیان‌گذاری'],
  ['defunct', 'از بین رفته', 'dissolved', 'منحل‌شده', 'انحلال'],
  ['logo_caption', 'زیرنویس نماد', 'توضیح نشان', 'caption', 'زیرنویس', 'توضیح', 'توضیح نشان‌واره'],
  ['logo', 'نماد', 'company_logo', 'نماد شرکت', 'نشان‌واره'],
  ['image_caption', 'زیرنویس تصویر', 'توضیح تصویر'],
  ['founders', 'بنیانگذاران', 'founder', 'بنیانگذار', 'بنیان گذار', 'بنیان گذاران', 'بنیان‌گذار', 'بنیان‌گذاران'],
  ['products', 'محصولات'],
  ['area_served', 'محدودهٔ فعالیت', 'محدوده فعالیت'],
  ['net_income', 'profit', 'سود خالص'],
  ['website', 'homepage', 'صفحه اصلی', 'صفحه خانگی', 'وب گاه', 'وب‌گاه', 'وبگاه'],
  ['brands', 'نام‌های تجاری', 'برندها'],
  ['revenue', 'درآمد'],
  ['assets', 'دارایی کل', 'دارایی'],
];
const PRECEDENCE = new Map<string, number>();
for (const chain of PRECEDENCE_CHAINS) chain.forEach((a, i) => { if (!PRECEDENCE.has(a)) PRECEDENCE.set(a, i); });
/** Precedence rank of an alias (lower = wins). Unknown → Infinity (defer the clash). */
const rank = (alias: string): number => PRECEDENCE.get(alias) ?? Infinity;

/**
 * Rare legacy aliases with no modern field — reported, never renamed:
 * «شکل‌بندی بدنه» (dead bodyclass). (Former members «توضیح» and «نام‌های تجاری»
 * were resolved from the template's history: →«توضیح نشان‌واره» and →«برندها».)
 */
const UNRESOLVED = new Set(['شکل‌بندی بدنه']);

/**
 * Person/role aliases that all FOLD into one «افراد کلیدی» field (the modern
 * template has no dedicated CEO/chairman/… row). The value is the role label to
 * append in parentheses; '' means the source is already key-people (no label).
 * Verified against the native template's standalone person rows + operator decision.
 */
const KEY_PEOPLE_CANON = 'افراد کلیدی';
const KEY_PEOPLE_SOURCES = new Map<string, string>([
  ['افراد کلیدی', ''], ['key_people', ''], ['افراد مهم', ''], ['شخصیت_اصلی', ''],
  ['مدیر عامل', 'مدیرعامل'], ['مدیرعامل', 'مدیرعامل'],
  ['قائم مقام', 'قائم‌مقام'], ['سخنگو', 'سخنگو'],
  ['رئیس هیات مدیره', 'رئیس هیئت‌مدیره'], ['رییس هیئت مدیره', 'رئیس هیئت‌مدیره'], ['رئیس هیئت مدیره', 'رئیس هیئت‌مدیره'],
]);

/** Normalised invocation names (canonical + every redirect) → the company infobox. */
const TEMPLATE_NAMES = new Set([
  'جعبه اطلاعات شرکت',
  'اطلاعات شرکت', 'جعبه شرکت', 'company', 'company infobox',
  'infobox company', 'infobox companies', 'infobox corporation',
  'infobox co-operative', 'infobox cooperative', 'infobox defunct company',
  'infobox korean company', 'infobox financial', 'infobox manufacturing company',
  'infobox bank', 'infobox verkehrsbetrieb', 'infobox video game developer',
  'dotcom company', 'infobox company/wikidata',
].map(normalizeName));

function normalizeName(s: string): string {
  return s.replace(/_/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Find the [start,end) index of every top-level company-infobox invocation. */
export function findInfoboxSpans(text: string): [number, number][] {
  const spans: [number, number][] = [];
  const n = text.length;
  let i = 0;
  while (i < n - 1) {
    if (text[i] === '{' && text[i + 1] === '{') {
      // read the template name up to the first | or }} or nested {{
      let k = i + 2, name = '';
      while (k < n && text[k] !== '|' && text.slice(k, k + 2) !== '}}' && text.slice(k, k + 2) !== '{{') {
        name += text[k]; k++;
      }
      if (TEMPLATE_NAMES.has(normalizeName(name))) {
        const end = matchBraces(text, i);
        if (end > 0) { spans.push([i, end]); i = end; continue; }
      }
    }
    i++;
  }
  return spans;
}

/**
 * If an INERT region opens at `i` — an HTML comment or a literal-wikitext tag
 * (`<nowiki>`, `<pre>`, `<syntaxhighlight>`, `<source>`) — return the index just
 * past its close (or end of string); else -1. These regions are opaque: any
 * `|`/`=`/`{{`/`[[` inside them is literal, so treating them as one token stops an
 * unbalanced bracket like `<nowiki>[[x]</nowiki>` from breaking the param scan.
 */
function skipInert(s: string, i: number): number {
  if (s.slice(i, i + 4) === '<!--') { const end = s.indexOf('-->', i + 4); return end < 0 ? s.length : end + 3; }
  const open = /^<(nowiki|pre|syntaxhighlight|source)(\s[^>]*)?>/i.exec(s.slice(i, i + 120));
  if (open) {
    if (/\/>$/.test(open[0])) return i + open[0].length; // self-closing (shouldn't match above, but safe)
    const rest = s.slice(i + open[0].length);
    const closeIdx = rest.search(new RegExp('</' + open[1] + '\\s*>', 'i'));
    if (closeIdx < 0) return s.length;
    return i + open[0].length + closeIdx + rest.slice(closeIdx).indexOf('>') + 1;
  }
  if (/^<nowiki\s*\/>/i.test(s.slice(i, i + 12))) return i + s.slice(i).match(/^<nowiki\s*\/>/i)![0].length;
  return -1;
}

/** Given `{{` at `start`, return the index just past the matching `}}` (or -1). Comments are opaque. */
function matchBraces(text: string, start: number): number {
  let depth = 0;
  for (let i = start; i < text.length - 1; i++) {
    const c = skipInert(text, i); if (c >= 0) { i = c - 1; continue; }
    const two = text.slice(i, i + 2);
    if (two === '{{') { depth++; i++; }
    else if (two === '}}') { depth--; i++; if (depth === 0) return i + 1; }
  }
  return -1;
}

/** Split a template span's body into top-level segments (seg[0] = name+, rest = params). Comments are opaque. */
function splitTopLevel(body: string): string[] {
  const segs: string[] = [];
  let cur = '', brace = 0, link = 0, i = 0;
  while (i < body.length) {
    const c = skipInert(body, i); if (c >= 0) { cur += body.slice(i, c); i = c; continue; }
    const two = body.slice(i, i + 2);
    if (two === '{{' || two === '[[') { if (two === '{{') brace++; else link++; cur += two; i += 2; continue; }
    if (two === '}}' || two === ']]') { if (two === '}}') brace = Math.max(0, brace - 1); else link = Math.max(0, link - 1); cur += two; i += 2; continue; }
    if (body[i] === '|' && brace === 0 && link === 0) { segs.push(cur); cur = ''; i++; continue; }
    cur += body[i]; i++;
  }
  segs.push(cur);
  return segs;
}

/** Split a param segment at its first top-level '=' into [keyRaw, valRaw] (val includes '='). Comments are opaque. */
function splitKey(seg: string): [string, string | null] {
  let brace = 0, link = 0, i = 0;
  while (i < seg.length) {
    const c = skipInert(seg, i); if (c >= 0) { i = c; continue; }
    const two = seg.slice(i, i + 2);
    if (two === '{{' || two === '[[') { if (two === '{{') brace++; else link++; i += 2; continue; }
    if (two === '}}' || two === ']]') { if (two === '}}') brace = Math.max(0, brace - 1); else link = Math.max(0, link - 1); i += 2; continue; }
    if (seg[i] === '=' && brace === 0 && link === 0) return [seg.slice(0, i), seg.slice(i)];
    i++;
  }
  return [seg, null];
}

/** Rename `keyRaw` (with its surrounding whitespace) to `target`, keeping alignment. */
function renameKey(keyRaw: string, target: string): string {
  const lead = keyRaw.slice(0, keyRaw.length - keyRaw.trimStart().length);
  const trail = keyRaw.slice(keyRaw.trimEnd().length);
  return lead + target + trail;
}

interface Entry { origSeg: string; keyRaw: string; key: string; valEq: string; val: string; valEmpty: boolean; finalKey: string | null; renamed: boolean; substantive: boolean; person: boolean; outValue?: string }

/** A value that is only whitespace and/or HTML comments carries no data (renders nothing). */
const isEmptyVal = (v: string): boolean => v.replace(/<!--[\s\S]*?-->/g, '').trim() === '';

/**
 * Render an infobox as canonical multi-line wikitext — one param per line — mirroring
 * the house style of scripts/archive/wikiformat.py (build_multiline):
 *   {{name
 *   | key = value
 *   | value            (positional)
 *   }}
 * Values are emitted verbatim (only end-trimmed), so nested templates inside a value
 * keep their own formatting — we format the infobox itself, not the whole article.
 */
function formatInfobox(name: string, params: { key: string | null; value: string }[]): string {
  const lines = ['{{' + name];
  for (const p of params) lines.push(p.key === null ? `| ${p.value}` : `| ${p.key} = ${p.value}`);
  lines.push('}}');
  return lines.join('\n');
}

/**
 * Rewrite one infobox span: normalise the invocation name + rename every alias in
 * CANONICAL to its Persian canonical, FOLD all person/role aliases into a single
 * «افراد کلیدی», then resolve duplicates.
 *   - substantive = at least one renamed key came from SUBSTANTIVE (a deprecated /
 *     dropped param whose data was hidden), or a role field was folded in — this is
 *     what justifies editing the article.
 *   - collision  = a genuine value clash on a substantive field → skip article.
 *   - cosmetic clashes leave that one field un-normalised (both keys kept).
 */
function rewriteSpan(span: string): { out: string; substantive: boolean; changed: boolean; collision: boolean; unresolved: boolean } {
  const body = span.slice(2, -2);
  const segs = splitTopLevel(body);

  // invocation name → canonical (cosmetic)
  const rawName = segs[0];
  const nameText = rawName.trim();
  let name = rawName, invocationChanged = false;
  if (TEMPLATE_NAMES.has(normalizeName(nameText)) && normalizeName(nameText) !== normalizeName(CANONICAL_TEMPLATE)) {
    const lead = rawName.slice(0, rawName.length - rawName.trimStart().length);
    const trail = rawName.slice(rawName.trimEnd().length);
    name = lead + CANONICAL_TEMPLATE + trail;
    invocationChanged = true;
  }

  const entries: Entry[] = [];
  let unresolved = false;
  for (let s = 1; s < segs.length; s++) {
    const [keyRaw, val] = splitKey(segs[s]);
    if (val === null) { entries.push({ origSeg: segs[s], keyRaw: segs[s], key: '', valEq: '', val: '', valEmpty: isEmptyVal(segs[s]), finalKey: null, renamed: false, substantive: false, person: false }); continue; } // positional
    const key = keyRaw.trim();
    if (UNRESOLVED.has(key)) unresolved = true;
    const person = KEY_PEOPLE_SOURCES.has(key);
    const target = CANONICAL[key];
    entries.push({
      origSeg: segs[s], keyRaw, key, valEq: val, val: val.slice(1).trim(), valEmpty: isEmptyVal(val.slice(1)),
      finalKey: person ? KEY_PEOPLE_CANON : (target ?? key),
      renamed: !person && !!target && target !== key,
      substantive: !person && SUBSTANTIVE.has(key),
      person,
    });
  }

  // ── key-people fold: merge every person/role field into one «افراد کلیدی» ──
  const foldDrop = new Set<number>();
  let foldSubstantive = false;
  const persons = entries.map((e, i) => ({ e, i })).filter(x => x.e.person);
  if (persons.length) {
    const parts: string[] = [];
    for (const { e } of persons) {
      if (e.valEmpty) continue;
      const role = KEY_PEOPLE_SOURCES.get(e.key)!;
      parts.push(role ? `${e.val} (${role})` : e.val);
    }
    const anyRename = persons.some(x => x.e.key !== KEY_PEOPLE_CANON);
    // fold when there's a non-canonical person key to rename, or several to merge
    // (a lone canonical «افراد کلیدی» is left exactly as-is — no cosmetic churn)
    if (anyRename || persons.length > 1) {
      const t = persons[0].e;
      t.finalKey = KEY_PEOPLE_CANON;
      t.renamed = true;
      t.outValue = parts.join('{{سخ}}');
      foldSubstantive = persons.some(x => x.e.key !== KEY_PEOPLE_CANON && !x.e.valEmpty);
      for (let k = 1; k < persons.length; k++) foldDrop.add(persons[k].i);
    }
  }

  // resolve duplicates that our renames created (non-person entries only; the fold owns person entries)
  const groups = new Map<string, number[]>();
  entries.forEach((e, i) => { if (e.finalKey !== null && !e.person) (groups.get(e.finalKey) ?? groups.set(e.finalKey, []).get(e.finalKey)!).push(i); });
  const drop = new Set<number>();
  const unrename = new Set<number>();
  for (const idxs of groups.values()) {
    if (idxs.length < 2 || !idxs.some(i => entries[i].renamed)) continue; // pre-existing dup we didn't cause → leave alone
    const nonEmpty = idxs.filter(i => !entries[i].valEmpty);
    const clash = new Set(nonEmpty.map(i => entries[i].val)).size >= 2;
    if (clash) {
      if (idxs.some(i => entries[i].substantive)) {
        // substantive clash: resolve by the template's own alias precedence — keep the
        // value that was historically DISPLAYED (highest-precedence alias), drop the
        // shadowed dead duplicates. If no clashing alias has a known rank, defer instead.
        const ordered = nonEmpty.slice().sort((a, b) => rank(entries[a].key) - rank(entries[b].key));
        if (rank(entries[ordered[0]].key) === Infinity) return { out: span, substantive: false, changed: false, collision: true, unresolved };
        const winner = ordered[0];
        for (const i of idxs) if (i !== winner) drop.add(i);
      } else {
        idxs.forEach(i => { if (entries[i].renamed) unrename.add(i); }); // cosmetic clash → don't normalise this field
      }
    } else {
      const winner = nonEmpty.length ? nonEmpty[0] : idxs[0];
      for (const i of idxs) if (i !== winner) drop.add(i);
    }
  }

  const substantive = foldSubstantive || entries.some((e, i) => e.renamed && e.substantive && !unrename.has(i));

  // build the canonical param list (renames + fold applied), then emit multi-line
  const params: { key: string | null; value: string }[] = [];
  entries.forEach((e, i) => {
    if (drop.has(i) || foldDrop.has(i)) return;
    if (e.finalKey === null) { const v = e.origSeg.trim(); if (v) params.push({ key: null, value: v }); return; } // positional
    const key = (e.renamed && !unrename.has(i)) ? e.finalKey! : e.key;
    params.push({ key, value: e.outValue ?? e.val });
  });
  const out = formatInfobox(name.trim(), params);
  // `out !== span` also catches pure reformatting; the article is only ever edited when
  // `substantive` is true (see fixCompanyParams), so this never triggers a cosmetic-only edit.
  return { out, substantive, changed: out !== span, collision: false, unresolved };
}

/** Pure transform for the runner. Edits only when a SUBSTANTIVE rename happens. */
export function fixCompanyParams(text: string): { text: string; changed: boolean; note?: string; manualReview?: boolean } {
  const spans = findInfoboxSpans(text);
  if (!spans.length) return { text, changed: false, note: 'جعبه اطلاعات شرکت یافت نشد' };

  let out = '', last = 0, anySubstantive = false, anyUnresolved = false;
  for (const [a, b] of spans) {
    const r = rewriteSpan(text.slice(a, b));
    // a genuine value clash on a substantive field → needs a human; flag for deferral
    if (r.collision) return { text, changed: false, note: 'تداخل مقدار در پارامتر منسوخ — نیازمند بازبینی دستی', manualReview: true };
    out += text.slice(last, a) + r.out;
    last = b;
    anySubstantive ||= r.substantive;
    anyUnresolved ||= r.unresolved;
  }
  out += text.slice(last);
  // never make a cosmetic-only edit: require a substantive (deprecated) rename
  if (!anySubstantive) return { text, changed: false, note: anyUnresolved ? 'تنها پارامتر منسوخ حل‌نشده دارد' : 'پارامتر منسوخ شناخته‌شده‌ای نبود' };
  return { text: out, changed: true, note: anyUnresolved ? 'ویرایش شد؛ پارامتر منسوخ حل‌نشده باقی ماند' : undefined };
}

/** Diagnostic: per span, dump each param's key + parse classification (for debugging stuck pages). */
export function diagnoseParams(text: string): { span: number; params: { key: string; canon: string; renamed: boolean; substantive: boolean; person: boolean; empty: boolean }[] }[] {
  const out: any[] = [];
  findInfoboxSpans(text).forEach(([a, b], si) => {
    const segs = splitTopLevel(text.slice(a, b).slice(2, -2));
    const params: any[] = [];
    for (let s = 1; s < segs.length; s++) {
      const [keyRaw, val] = splitKey(segs[s]);
      if (val === null) { params.push({ key: '(positional) ' + segs[s].trim().slice(0, 20), canon: '', renamed: false, substantive: false, person: false, empty: isEmptyVal(segs[s]) }); continue; }
      const key = keyRaw.trim();
      const person = KEY_PEOPLE_SOURCES.has(key);
      const target = CANONICAL[key];
      params.push({ key, canon: person ? KEY_PEOPLE_CANON : (target ?? key), renamed: !person && !!target && target !== key, substantive: !person && SUBSTANTIVE.has(key), person, empty: isEmptyVal(val.slice(1)) });
    }
    out.push({ span: si, params });
  });
  return out;
}

/** Diagnostic: per span, list the canonical fields that receive 2+ DISTINCT non-empty values (the clashes). */
export function diagnoseCollisions(text: string): { field: string; entries: { alias: string; value: string }[] }[] {
  const result: { field: string; entries: { alias: string; value: string }[] }[] = [];
  for (const [a, b] of findInfoboxSpans(text)) {
    const segs = splitTopLevel(text.slice(a, b).slice(2, -2));
    const byCanon = new Map<string, { alias: string; value: string }[]>();
    for (let s = 1; s < segs.length; s++) {
      const [keyRaw, val] = splitKey(segs[s]);
      if (val === null) continue;
      const key = keyRaw.trim();
      const v = val.slice(1).trim();
      if (!v) continue;
      const canon = KEY_PEOPLE_SOURCES.has(key) ? KEY_PEOPLE_CANON : (CANONICAL[key] ?? key);
      (byCanon.get(canon) ?? byCanon.set(canon, []).get(canon)!).push({ alias: key, value: v });
    }
    for (const [field, entries] of byCanon) {
      if (entries.length >= 2 && new Set(entries.map(e => e.value)).size >= 2) result.push({ field, entries });
    }
  }
  return result;
}

export const companyDeprecatedParamsTask: BotTask = {
  id: 'company-deprecated-params',
  taskNumber: 4,
  summary: 'به‌روزرسانی پارامترهای منسوخ جعبه اطلاعات شرکت و فارسی‌سازی نام پارامترها و فراخوانی',
  description: 'تغییرنام پارامترهای منسوخ {{جعبه اطلاعات شرکت}} به معادل کنونی (که دادهٔ پنهان را بازمی‌گرداند و رده را خالی می‌کند) و در همان ویرایش، فارسی‌سازی نام پارامترهای انگلیسی و نام فراخوانی الگو؛ فارسی‌سازی تنها همراه یک تغییر بامعنا انجام می‌شود، نه به‌تنهایی.',
  async getTargets(bot: Bot): Promise<string[]> {
    const out: string[] = [];
    let cont: string | undefined;
    do {
      const p: Record<string, string> = {
        action: 'query', list: 'categorymembers',
        cmtitle: 'رده:صفحه‌هایی که از جعبه اطلاعات شرکت با پارامترهای منسوخ‌شده استفاده می‌کنند',
        cmnamespace: '0', cmlimit: '500',
      };
      if (cont) p.cmcontinue = cont;
      const d = await bot.apiGet(p);
      for (const m of d.query.categorymembers) out.push(m.title);
      cont = d.continue?.cmcontinue;
    } while (cont);
    return out;
  },
  transform(text: string) { return fixCompanyParams(text); },
};
