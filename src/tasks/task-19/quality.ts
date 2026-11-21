/**
 * وظیفهٔ ۱۹ — what counts as usable metadata. Pure.
 *
 * Every rule here comes from a real Citoid answer in the 140-URL benchmark
 * (docs/task-19-cite-urls.md § Metadata quality). Citoid is right most of the time and
 * confidently wrong the rest: «INDEX», «{title}», «Technical Difficulties», a site's
 * Cloudflare page, a parked domain «This website is for sale!», a web editor as the
 * author, a page-modified date as the publication date. A citation built from any of
 * those is worse than the bare URL it replaced, because it looks finished.
 */
import { hostOf } from './url.js';

/** CS1's own `generic_titles` list on fa, plus what the benchmark found. Lowercase. */
const GENERIC_EXACT = new Set([
  'index', 'home', 'homepage', 'home page', 'main page', 'welcome', 'untitled', 'no title', 'unknown',
  'search', 'search results', 'login', 'log in', 'sign in', 'error', 'not found', 'page not found',
  'access denied', 'forbidden', 'just a moment...', 'just a moment', 'attention required!',
  'attention required! | cloudflare', 'technical difficulties', 'press releases', 'news', 'archive',
  'archived copy', 'wayback machine', 'redirecting...', 'loading...', 'document', 'default',
  'iis windows server', 'apache2 ubuntu default page: it works', 'it works!', 'site maintenance',
  'object moved', '301 moved permanently', '302 found', 'blocked page', 'suspended page',
  'account suspended', 'domain for sale', 'coming soon', 'under construction', 'about', 'about us',
  'contact', 'contact us', 'no data found', 'no results found', 'tickets', 'sitemap',
  'صفحه اصلی', 'صفحهٔ اصلی', 'خانه', 'خوش آمدید', 'جستجو', 'نتایج جستجو', 'ورود', 'خطا', 'اخبار',
  'صفحه مورد نظر یافت نشد', 'صفحه یافت نشد', 'یافت نشد', 'در حال انتقال', 'بایگانی', 'آرشیو',
  'نسخه بایگانی شده', 'نسخه بایگانی‌شده', 'بدون عنوان',
]);
const GENERIC_SUBSTR = [
  'are you a robot', 'hugedomains', 'website is for sale', 'domain is for sale', 'this domain',
  'buy this domain', 'parked domain', 'subscribe to read', 'log into facebook', 'login • instagram',
  'internet archive wayback machine', 'webcite query result', "wikiwix's cache", 'usurped title',
  'error 404', 'error-404', '404 not found', 'page not found', 'cloudflare', 'ddos-guard',
  'access denied', 'request rejected', 'captcha', 'enable javascript', 'browser is outdated',
  'account suspended', 'suspendedpage', 'bandwidth limit exceeded', 'database error',
  'خطای ۴۰۴', 'صفحه مورد نظر', 'یافت نشد', 'دسترسی غیرمجاز', 'دسترسی امکان‌پذیر نیست',
  'در حال انتقال به سایت', 'not available in your region', 'not available in your country',
  'the official website for', 'official site of', 'geoblock', 'home of the',
];

export type TitleVerdict = { ok: true; title: string } | { ok: false; reason: string };

/** Clean a scraped title and decide whether it is a real title. */
export function judgeTitle(raw: string | undefined, ctx: { url: string; site?: string; names?: string[] }): TitleVerdict {
  if (!raw) return { ok: false, reason: 'no-title' };
  let t = decodeEntities(raw).replace(/\\(['"])/g, '$1').replace(/\s+/g, ' ').trim();
  t = t.replace(/^(?:[|:»·•–—-]\s*)+/, '').trim();
  if (/%[0-9a-f]{2}/i.test(t)) {
    try { t = decodeURIComponent(t); } catch { return { ok: false, reason: 'title-encoded' }; }
  }
  t = stripSiteSuffix(t, ctx);
  t = t.replace(/^["«“]+(.*)["»”]+$/, '$1').trim();
  const low = t.toLowerCase();
  if (!t || t.length < 3) return { ok: false, reason: 'no-title' };
  if (/^\{[^}]*\}$/.test(t) || /\{\{|\}\}|\$\{/.test(t)) return { ok: false, reason: 'template-placeholder' };
  if (/^\d{3}\b/.test(t) && /^(?:4\d\d|5\d\d)\b/.test(t)) return { ok: false, reason: 'http-error-title' };
  if (GENERIC_EXACT.has(low)) return { ok: false, reason: 'generic-title' };
  if (GENERIC_SUBSTR.some(s => low.includes(s))) return { ok: false, reason: 'generic-title' };
  const host = hostOf(ctx.url) ?? '';
  const bare = host.replace(/^www\d*\./, '');
  if (low === host || low === bare || low === `www.${bare}`) return { ok: false, reason: 'title-is-host' };
  const siteNames = [ctx.site ?? '', ...(ctx.names ?? [])].map(n => n.replace(/\s*\([^)]*\)$/, '').toLowerCase().trim()).filter(Boolean);
  if (siteNames.includes(low)) return { ok: false, reason: 'title-is-site' };
  if (/^https?:\/\//i.test(t) || /^www\./i.test(t)) return { ok: false, reason: 'title-is-url' };
  if (t.length > 300) return { ok: false, reason: 'title-too-long' };
  if (/[\uFFFD]|Ø|Ù|Û/.test(t)) return { ok: false, reason: 'mojibake' };
  return { ok: true, title: t };
}

/**
 * `جمعیت تهران از ۹ میلیون نفر عبور کرد - خبرگزاری مهر | اخبار ایران و جهان | Mehr News Agency`
 * → `جمعیت تهران از ۹ میلیون نفر عبور کرد`. A trailing segment is dropped only when it
 * names the site (the site name, the host, or a host stem), never on length alone.
 */
export function stripSiteSuffix(t: string, ctx: { url: string; site?: string; names?: string[] }): string {
  const host = (hostOf(ctx.url) ?? '').replace(/^www\d*\./, '');
  const stem = host.split('.')[0];
  const names = [ctx.site ?? '', host, stem, ...(ctx.names ?? [])]
    .map(n => n.replace(/\s*\([^)]*\)$/, '').replace(/\s+/g, '').toLowerCase())
    .filter(n => n.length >= 3);
  const named = (seg: string) => {
    const x = seg.replace(/\s+/g, '').toLowerCase();
    return x.length >= 2 && names.some(n => x === n || x.includes(n) || (x.length >= 4 && n.includes(x)));
  };
  // A LEADING site name: «Magiran | روزنامه …», «Pong-Story : Magnavox Odyssey». Only a
  // segment that names the site, so «Pence: Europe must…» keeps its colon.
  const lead = /^(.{2,40}?)\s+(?:\||::|:|»|·|•|–|—|-)\s+(.+)$/.exec(t);
  if (lead && named(lead[1]) && lead[2].length >= 3) t = lead[2];
  const parts = t.split(/\s+(?:\||-|–|—|::|»|·|•)\s+/);
  if (parts.length < 2) return t;
  // Cut at the FIRST segment that names the site: what follows it is the site's tagline
  // («… - خبرگزاری مهر | اخبار ایران و جهان | Mehr News Agency»).
  for (let i = 1; i < parts.length; i++) {
    if (named(parts[i])) {
      const out = parts.slice(0, i).join(' - ').trim();
      return out.length >= 3 ? out : t;
    }
  }
  return t;
}

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', zwnj: '\u200c', rlm: '', lrm: '', ndash: '–', mdash: '—', hellip: '…', laquo: '«', raquo: '»', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', auml: 'ä', ouml: 'ö', uuml: 'ü', eacute: 'é', egrave: 'è', aacute: 'á' };
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const cp = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(cp) && cp > 0 && cp < 0x110000 ? String.fromCodePoint(cp) : m;
    }
    return ENT[e.toLowerCase()] ?? m;
  }).replace(/[\u200e\u200f\u202a-\u202e]/g, '');
}

/** Persian text gets Persian letterforms; Arabic text is left as published. */
export function persianLetterforms(t: string): string {
  if (!/[پچژگ]/.test(t) && /[ةإأ]/.test(t)) return t;
  return t.replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/ى/g, 'ی').replace(/^[\s\u200c]+|[\s\u200c]+$/g, '');
}

/** Is this an author name, or something a scraper mistook for one? */
export function judgeAuthor(first: string, last: string, site?: string, titleSegments: string[] = []): boolean {
  const f = first.trim(), l = last.trim();
  if (!f || !l) return false;
  const whole = `${f} ${l}`;
  if (whole.length > 60) return false;
  if (/[\d@#/\\|[\]{}()<>:;=_]|\.(?:com|ir|org|net)\b|https?/i.test(whole)) return false;
  if (/[a-z][A-Z]/.test(l) || /[a-z][A-Z]/.test(f)) return false;     // «BrennanDiplomatic»
  if (/^[A-Z]{3,}$/.test(l) || /^[A-Z]{3,}$/.test(f)) return false;   // «WELT», an outlet in capitals
  if (/\b(?:staff|reporter|correspondent|editor|admin|desk|news|agency|press|team|online|reuters|ap|afp|bbc|خبرگزاری|سرویس|گروه|تحریریه|خبرنگار)\b/i.test(whole)) return false;
  if (site && whole.toLowerCase().includes(site.toLowerCase())) return false;
  // «… | باشگاه شاهنامه پژوهان» with the same words as the author: the site, split in two
  const flat = (x: string) => x.replace(/[\s\u200c]+/g, '').toLowerCase();
  if (titleSegments.slice(1).some(seg => flat(seg) === flat(whole))) return false;
  if (f.split(/\s+/).length > 3 || l.split(/\s+/).length > 3) return false;
  return true;
}

/** A Citoid/meta date worth printing: well-formed, not in the future, not just "today". */
export function judgeDate(d: string | undefined, today: string, itemType: string): string | undefined {
  if (!d) return undefined;
  const m = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?/.exec(d.trim());
  if (!m) return undefined;
  if (itemType === 'webpage') return undefined;   // a "webpage" date is usually the template's modified date
  const iso = m[0];
  if (iso.slice(0, 10) === today) return undefined;
  const y = Number(m[1]);
  if (y > 1500 && iso > today) return undefined;
  return iso;
}

/**
 * The language code for `زبان=`, or undefined. A page's declared language is wrong often
 * enough (an English page tagged `fr`, a French AA story tagged `tr`) that it is believed
 * only when the title's own script agrees with it. When in doubt nothing is written: a
 * citation without `زبان` renders correctly, one with the wrong language says so.
 */
export function langOf(title: string, declared?: string): string | undefined {
  const code = (declared ?? '').toLowerCase().split(/[-_]/)[0];
  if (/[\u0600-\u06ff]/.test(title)) {
    if (/[پچژگ]/.test(title)) return undefined;
    return code === 'ar' || /[ةإأ]/.test(title) ? 'ar' : undefined;
  }
  if (!/^[a-z]{2,3}$/.test(code) || code === 'fa') return undefined;
  const latin = /^[\p{Script=Latin}\p{N}\p{P}\p{S}\s]+$/u.test(title);
  if (latin) {
    const letters = title.match(/\p{L}/gu) ?? [];
    const ascii = letters.filter(c => /[A-Za-z]/.test(c)).length;
    if (code === 'en') return letters.length && ascii / letters.length >= 0.9 ? 'en' : undefined;
    // Any Latin language other than English is believed only when the title carries a
    // letter that language actually uses.
    const MARKS: Record<string, RegExp> = {
      de: /[äöüßÄÖÜ]/, fr: /[éèêëàâçîïôûùœÉÈÀÇ]/, es: /[ñáéíóúü¿¡Ñ]/, it: /[àèéìòù]/, pt: /[ãõçáéíóâêô]/,
      tr: /[ğışİĞŞ]/, az: /[əğışƏĞŞ]/, pl: /[ąćęłńśźżŁŚŻ]/, cs: /[ěščřžůýĚŠČŘŽ]/, sk: /[ľščťžýáäô]/,
      hu: /[őűáéíóöüú]/, ro: /[ăâîșțşţ]/, sv: /[åäö]/, da: /[æøå]/, no: /[æøå]/, nb: /[æøå]/,
      fi: /[äö]/, nl: /[ëïé]/, hr: /[čćđšž]/, sl: /[čšž]/, vi: /[ăâđêôơư]/, ca: /[àçèéíïòóúü·]/,
      lv: /[āčēģīķļņšūž]/, lt: /[ąčęėįšųūž]/, et: /[äõöüšž]/, sq: /[ëç]/, uz: /[oʻgʻ]/, ku: /[êîûşç]/,
    };
    return MARKS[code]?.test(title) ? code : undefined;
  }
  const byScript: [RegExp, string[]][] = [
    [/\p{Script=Cyrillic}/u, ['ru', 'uk', 'bg', 'sr', 'mk', 'be', 'kk', 'ky', 'tg', 'mn']],
    [/\p{Script=Armenian}/u, ['hy']], [/\p{Script=Georgian}/u, ['ka']], [/\p{Script=Greek}/u, ['el']],
    [/\p{Script=Hebrew}/u, ['he', 'yi']], [/\p{Script=Hangul}/u, ['ko']],
    [/[\p{Script=Hiragana}\p{Script=Katakana}]/u, ['ja']], [/\p{Script=Han}/u, ['zh', 'ja']],
    [/\p{Script=Devanagari}/u, ['hi', 'mr', 'ne']], [/\p{Script=Thai}/u, ['th']],
  ];
  for (const [re, codes] of byScript) if (re.test(title)) return codes.includes(code) ? code : undefined;
  return undefined;
}
