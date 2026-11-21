/**
 * وظیفهٔ ۱۹ — pure URL repairs. No network, no wikitext: a string in, a string out.
 *
 * Each function returns the URL unchanged when it is not sure. The callers decide WHERE a
 * URL may be touched (see scan.ts); this file only decides WHAT the repaired URL is.
 *
 * Measurements behind every rule are in docs/task-19-cite-urls.md and, with the samples,
 * in research/bare-url-citations.md in the companion repository.
 */

/** Characters that end a URL in raw wikitext (MediaWiki's EXT_LINK_URL_CLASS plus wikitext structure). */
export const URL_STOP = /[\s\[\]<>"{}|]/;
/** A run of http(s) URL characters, for scanning raw text. `''` (italic markup) also ends it. */
export const URL_IN_TEXT = /https?:\/\/(?:(?!'')[^\s\[\]<>"{}|])+/gi;

/** Archive services. Their URLs embed another URL, and the captured form must stay byte-exact. */
const ARCHIVE_HOSTS = /(^|\.)(web\.archive\.org|archive\.(?:org|today|ph|is|md|li|fo|vn)|webcitation\.org|ghostarchive\.org|wikiwix\.com|archive-it\.org|perma\.cc|webarchive\.(?:org\.uk|nationalarchives\.gov\.uk|loc\.gov)|arquivo\.pt|webarchive\.nla\.gov\.au)$/i;

export function hostOf(url: string): string | null {
  const m = /^https?:\/\/([^/?#:\s]+)/i.exec(url);
  return m ? m[1].toLowerCase() : null;
}
export function isArchiveUrl(url: string): boolean {
  const h = hostOf(url);
  return !!h && ARCHIVE_HOSTS.test(h);
}

// ---------------------------------------------------------------------------
// 1. Percent-decoding to readable Unicode
// ---------------------------------------------------------------------------

/**
 * Code points that stay percent-encoded even though they are not ASCII.
 *
 *  - invisible or space-like characters: a reader cannot see them in the wikitext and an
 *    editor will delete or retype them (ZWNJ is the exception: Persian editors use it
 *    every day and it renders a working link, measured on «بانک‌ها»)
 *  - Persian and Arabic-Indic digits: `پودمان:Citation/CS1/en` passes its whole output
 *    through `to_western`, hrefs included, so `/۱۳-معدن` inside an English-route citation
 *    becomes `/13-معدن` and some servers answer 404 (asrturkiye.com, measured). Encoded, the
 *    digits survive. This bot also writes `زبان=en` citations, so the rule is global.
 *  - U+FFFD and private-use/unassigned specials, which MediaWiki excludes from URLs
 */
function keepEncoded(cp: number): boolean {
  return cp < 0x80
    || (cp >= 0x80 && cp <= 0xa0) || cp === 0xad
    || cp === 0x061c
    || (cp >= 0x0660 && cp <= 0x0669) || (cp >= 0x06f0 && cp <= 0x06f9)
    || cp === 0x1680
    || (cp >= 0x2000 && cp <= 0x200b) || (cp >= 0x200d && cp <= 0x200f)
    || (cp >= 0x2028 && cp <= 0x202f) || (cp >= 0x205f && cp <= 0x206f)
    || cp === 0x3000 || cp === 0xfeff
    || (cp >= 0xe000 && cp <= 0xf8ff) || (cp >= 0xfff0 && cp <= 0xffff)
    || cp >= 0xf0000;
}

/**
 * Letters that Persian "normalizers" rewrite (ي→ی, ك→ک, ى, ە, …). A URL that really
 * contains one is correct as it is, but once it is readable in the wikitext the next run of
 * a character-fixing tool can "correct" it and silently break the link. Such a URL is left
 * encoded as a whole.
 */
const NORMALIZER_BAIT = /[\u0643\u064a\u0649\u06c1\u06d5\u06be\u0629]/;

type Byte = { v: number; raw: string };

/** Decode one run of `%XX` escapes. Returns the run unchanged if it is not valid UTF-8. */
function decodeRun(run: string): string {
  const bytes: Byte[] = [];
  for (let i = 0; i < run.length; i += 3) bytes.push({ v: parseInt(run.slice(i + 1, i + 3), 16), raw: run.slice(i, i + 3) });
  let out = '';
  for (let i = 0; i < bytes.length;) {
    const b = bytes[i].v;
    let need = 0, cp = 0, min = 0;
    if (b < 0x80) { need = 0; cp = b; }
    else if (b >= 0xc2 && b <= 0xdf) { need = 1; cp = b & 0x1f; min = 0x80; }
    else if (b >= 0xe0 && b <= 0xef) { need = 2; cp = b & 0x0f; min = 0x800; }
    else if (b >= 0xf0 && b <= 0xf4) { need = 3; cp = b & 0x07; min = 0x10000; }
    else return run;
    for (let k = 1; k <= need; k++) {
      const c = bytes[i + k]?.v;
      if (c === undefined || (c & 0xc0) !== 0x80) return run;
      cp = (cp << 6) | (c & 0x3f);
    }
    if (need && cp < min) return run;                         // overlong
    if (cp >= 0xd800 && cp <= 0xdfff) return run;              // surrogate
    if (cp > 0x10ffff) return run;
    const raw = bytes.slice(i, i + need + 1).map(x => x.raw).join('');
    out += keepEncoded(cp) ? raw : String.fromCodePoint(cp);
    i += need + 1;
  }
  return out;
}

/**
 * `https://x/%D8%AF%D8%B1` → `https://x/در`, leaving every ASCII escape (`%20`, `%7C`, `%25`, …)
 * exactly as written, so nothing about how the URL parses can change.
 *
 * Returns the input unchanged when:
 *  - it is an archive URL (the captured URL is part of its identity)
 *  - an escape run is not valid UTF-8 (legacy windows-1256 URLs such as `%C7%E1`)
 *  - the result is not NFC-stable. MediaWiki normalizes saved text to NFC, so a decomposed
 *    sequence (alef + madda above, U+0627 U+0653) would be recomposed to «آ» on save and the
 *    link would point somewhere else
 *  - the decoded URL would contain a letter a Persian character-normalizer rewrites
 */
export function decodePercentUnicode(url: string): string {
  if (isArchiveUrl(url)) return url;
  if (!/%[89a-f][0-9a-f]/i.test(url)) return url;
  const out = url.replace(/(?:%[0-9a-f]{2})+/gi, run => decodeRun(run));
  if (out === url) return url;
  if (out.normalize('NFC') !== out) return url;
  if (NORMALIZER_BAIT.test(out) && !NORMALIZER_BAIT.test(url)) return url;
  return out;
}

// ---------------------------------------------------------------------------
// 2. Broken schemes
// ---------------------------------------------------------------------------

const TLD = '(?:com|org|net|ir|info|edu|gov|int|co|io|me|tv|biz|af|tj|de|fr|uk|ru|it|es|nl|se|ch|at|be|ca|au|jp|cn|in|tr|ae|qa|iq|sa|eg|pk|az|am|ge|us|eu|news|online|site|website|blog)';
const SCHEMELESS = new RegExp(`^(?:www\\d{0,3}\\.[a-z0-9-]+(?:\\.[a-z0-9-]+)*|[a-z0-9-]+(?:\\.[a-z0-9-]+)*\\.${TLD})(?:[/?#][^\\s]*)?$`, 'i');

/**
 * Repair the scheme of a URL that is meant to be a whole URL, as in a citation's `نشانی=`.
 * Returns null when the value is not recognisably a URL at all.
 *
 *   www.shahbazi.org/pages/x.htm       → http://www.shahbazi.org/pages/x.htm
 *   https//x.org / http:/x.org / http:///x.org → https://x.org / http://x.org / http://x.org
 *   http://https://x.org               → https://x.org
 *
 * `http://`, not `https://`, for a schemeless value: a site that serves https redirects
 * http to it, and the reverse does not hold. Upgrading to https is not this task.
 */
export function repairScheme(value: string): string | null {
  let v = value.trim();
  if (!v || URL_STOP.test(v)) return null;
  // doubled scheme: keep the last one
  const dbl = /^(?:https?:\/*)+(https?:\/\/)/i.exec(v);
  if (dbl && dbl[0].length > dbl[1].length) v = dbl[1].toLowerCase() + v.slice(dbl[0].length);
  // malformed separator after the scheme
  const bad = /^(https?)(?::\/(?!\/)|\/\/|:\/{3,}|:(?!\/))(?=[a-z0-9])/i.exec(v);
  if (bad) v = `${bad[1].toLowerCase()}://` + v.slice(bad[0].length);
  if (/^https?:\/\/[^/\s]+\.[^/\s]+/i.test(v)) return v;
  if (/^\/\//.test(v)) return null;                           // protocol-relative is valid as it is
  if (SCHEMELESS.test(v)) return 'http://' + v;
  return null;
}

// ---------------------------------------------------------------------------
// 3. Tracking parameters
// ---------------------------------------------------------------------------

const TRACKING = new Set([
  'fbclid', 'gclid', 'gclsrc', 'dclid', 'gbraid', 'wbraid', 'msclkid', 'yclid', 'igshid', 'igsh',
  'mc_cid', 'mc_eid', '_hsenc', '_hsmi', 'mkt_tok', 'oly_anon_id', 'oly_enc_id', 'vero_id', 'ttclid',
  'twclid', 'li_fat_id', 'srsltid',
]);
const SI_HOSTS = /(^|\.)(youtube\.com|youtu\.be|open\.spotify\.com)$/i;

/**
 * Drop analytics parameters (`utm_*`, `fbclid`, …). They never select content: removing
 * them gives the same page. The remaining parameters keep their order and encoding.
 * Skipped when the query is written with entities (`&amp;`), where splitting is ambiguous.
 */
export function stripTracking(url: string): string {
  if (isArchiveUrl(url)) return url;
  const q = url.indexOf('?');
  if (q < 0) return url;
  const hashAt = url.indexOf('#', q);
  const base = url.slice(0, q);
  const query = url.slice(q + 1, hashAt < 0 ? undefined : hashAt);
  const frag = hashAt < 0 ? '' : url.slice(hashAt);
  if (/&(?:amp|#\d+);/i.test(query)) return url;
  const host = hostOf(url) ?? '';
  const parts = query.split('&');
  const kept = parts.filter(p => {
    const k = decodeSafe(p.split('=')[0]).toLowerCase();
    if (k.startsWith('utm_')) return false;
    if (TRACKING.has(k)) return false;
    if (k === 'si' && SI_HOSTS.test(host)) return false;
    return true;
  });
  if (kept.length === parts.length) return url;
  const rest = kept.filter(p => p !== '').join('&');
  return base + (rest ? '?' + rest : '') + frag;
}

function decodeSafe(s: string): string {
  try { return decodeURIComponent(s); } catch { return s; }
}

// ---------------------------------------------------------------------------
// 4. Redirectors and caches
// ---------------------------------------------------------------------------

/**
 * Unwrap a link that points at a redirector rather than the page:
 *
 *   https://www.google.com/url?sa=t&url=https%3A%2F%2Fx.org%2Fa   → https://x.org/a
 *   https://www.google.com/amp/s/x.org/a                          → https://x.org/a
 *   http://webcache.googleusercontent.com/search?q=cache:KEY:x.org/a → http://x.org/a
 *   https://l.facebook.com/l.php?u=https%3A%2F%2Fx.org            → https://x.org
 *
 * Google's cache was switched off in 2024, so a webcache link is dead. Returns the input
 * unchanged unless the embedded target is itself a plain http(s) URL.
 */
export function unwrapRedirector(url: string): string {
  const host = hostOf(url);
  if (!host) return url;
  const param = (name: string): string | null => {
    const m = new RegExp(`[?&](?:amp;)?${name}=([^&#]*)`, 'i').exec(url);
    // In a query string «+» is a space (form encoding), and decodeURIComponent leaves it.
    return m ? decodeSafe(m[1].replace(/\+/g, ' ')) : null;
  };
  let target: string | null = null;
  if (/(^|\.)google\.[a-z.]+$/.test(host) && /^https?:\/\/[^/]+\/url\?/i.test(url)) {
    target = param('url') ?? param('q');
  } else if (/(^|\.)google\.[a-z.]+$/.test(host)) {
    const m = /^https?:\/\/[^/]+\/amp\/s\/([^\s?#]+(?:\?[^\s#]*)?)/i.exec(url);
    if (m) target = 'https://' + m[1];
  } else if (host === 'webcache.googleusercontent.com') {
    const q = param('q');
    // `cache:KEY:URL SEARCH TERMS`: the URL ends at the first space
    const m = q ? /^cache:[^:]+:(\S+)/i.exec(q) : null;
    if (m) target = /^https?:\/\//i.test(m[1]) ? m[1] : 'http://' + m[1];
  } else if (/^(l|lm|m)\.facebook\.com$/.test(host) && /\/l\.php\?/i.test(url)) {
    target = param('u');
  }
  if (!target || !/^https?:\/\/[^/\s]+\.[^/\s]+/i.test(target) || URL_STOP.test(target)) return url;
  // `q=` for Google search is a query, not a target; a target with spaces would have failed above
  return target;
}

// ---------------------------------------------------------------------------
// All link-level repairs, in a fixed order
// ---------------------------------------------------------------------------

export type UrlFixKind = 'redirector' | 'tracking' | 'decode' | 'scheme';

/**
 * Apply every repair that applies to an already-delimited URL. `scheme` is applied only by
 * callers that know the value is meant to be a whole URL (a citation parameter); here it
 * is not, because in running text `www.x.org` is just text.
 */
export function repairUrl(url: string): { url: string; kinds: UrlFixKind[] } {
  const kinds: UrlFixKind[] = [];
  let u = url;
  const r = unwrapRedirector(u); if (r !== u) { kinds.push('redirector'); u = r; }
  const t = stripTracking(u); if (t !== u) { kinds.push('tracking'); u = t; }
  const d = decodePercentUnicode(u); if (d !== u) { kinds.push('decode'); u = d; }
  return { url: u, kinds };
}

/** Canonical form for comparing two hrefs that should point at the same resource. */
export function canonHref(href: string): string {
  let h = href.replace(/&amp;/g, '&').replace(/&#0*38;/g, '&');
  h = h.replace(/(?:%[0-9a-f]{2})+/gi, run => { try { return decodeURIComponent(run); } catch { return run; } });
  h = h.normalize('NFC');
  const m = /^([a-z]+:)?(\/\/[^/?#]*)(.*)$/i.exec(h);
  if (m) h = (m[1] ?? '').toLowerCase() + m[2].toLowerCase() + m[3];
  return h;
}
