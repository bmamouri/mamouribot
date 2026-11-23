/**
 * وظیفهٔ ۱۶ (گسترش) — remove the tracking parameters that sharing a link out of Facebook,
 * Instagram, YouTube, X, TikTok, Spotify, LinkedIn or a Google/Meta ad click appends to a URL.
 * Like the text-fragment directive, they record where a click came from and never pick
 * which page is shown: the URL without them opens the identical page.
 *
 * Measured on a 456-page sample (۲۴ نوامبر ۲۰۲۶) of the pages CirrusSearch returns for these keys:
 *
 *   youtube.com  feature 111, si 65, ab_channel 50, pp 5          (v, list, index, t: kept)
 *   instagram    igsh 75, igshid 44, utm_source 25                 (hl, img_index: kept)
 *   facebook     mibextid 37, __tn__, __xts__[0], paipv, eav, rdid (fbid, set, id, type, story_fbid: kept)
 *   twitter/x    s 59, t 44, ref_src 17                            (lang: kept)
 *   any host     utm_* 113, fbclid 46, gclid 55, srsltid 49
 *
 * Only a parameter on the list below goes; every other parameter keeps its position and its
 * exact bytes. A URL is left alone when:
 *
 *  - it is an archive URL. The captured URL is the archive's key; changing it breaks the link
 *    (`web.archive.org/web/2024…/https://youtube.com/watch?si=…&v=…` is common in the sample);
 *  - its query is written with HTML entities (`&amp;`, `&#x20;`), where splitting is ambiguous;
 *  - it sits inside a comment, `<nowiki>`, `<pre>`, `<syntaxhighlight>`, …;
 *  - the last parameter would go and the URL is followed by sentence punctuation
 *    (`…?s=20.`): MediaWiki drops that punctuation from a bare link but a citation parameter
 *    keeps it, so `…/status/123.` would be a broken URL in the citation case.
 */
import { opaqueSpans, inSpans } from '../task-19/wikitext.js';
import { isArchiveUrl, hostOf } from '../task-19/url.js';

/** Removed on every host: ad-click ids and campaign tags. */
const GLOBAL = new Set([
  'fbclid', 'gclid', 'gclsrc', 'dclid', 'gbraid', 'wbraid', 'msclkid', 'yclid', 'igshid', 'mibextid',
  'srsltid', 'ttclid', 'twclid', 'li_fat_id', 'mc_cid', 'mc_eid', '_hsenc', '_hsmi', 'mkt_tok', 'gad_source',
  '_gl',
]);

interface HostRule { host: RegExp; keys: Set<string>; prefixes?: string[]; pathOnly?: { re: RegExp; keys: Set<string> } }

const HOST_RULES: HostRule[] = [
  {
    host: /(^|\.)(facebook\.com|fb\.com|fb\.watch|messenger\.com)$/,
    keys: new Set(['mibextid', '__tn__', 'paipv', 'eav', 'rdid', '_rdr', 'fref', 'ref', 'refsrc', 'notif_t',
      'notif_id', 'comment_tracking', 'sfnsn', 'extid', 'hc_ref', 'hc_location', 'acontext']),
    prefixes: ['__xts__', '__cft__'],
  },
  { host: /(^|\.)instagram\.com$/, keys: new Set(['igsh', 'igshid', 'ig_mid']) },
  {
    host: /(^|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com)$/,
    keys: new Set(['si', 'feature', 'ab_channel', 'pp', 'embeds_referring_euri', 'embeds_euri',
      'embeds_referring_origin', 'source_ve_path', 'src_vid', 'annotation_id']),
  },
  {
    host: /(^|\.)(twitter\.com|x\.com)$/,
    keys: new Set(['ref_src', 'ref_url']),
    // `s` and `t` are the share-sheet source and token on a tweet. Search and hashtag pages
    // use other parameters, but limit these two to tweets so nothing else can be hit.
    pathOnly: { re: /\/status(?:es)?\/\d+/, keys: new Set(['s', 't']) },
  },
  {
    host: /(^|\.)tiktok\.com$/,
    keys: new Set(['_r', '_t', 'is_from_webapp', 'sender_device', 'is_copy_url', 'web_id', 'share_app_id',
      'share_link_id', 'social_sharing', 'tt_from', 'u_code', 'checksum', 'refer', 'referer_url', 'referer_video_id']),
  },
  { host: /(^|\.)spotify\.com$/, keys: new Set(['si']) },
  { host: /(^|\.)linkedin\.com$/, keys: new Set(['trk', 'trackingid', 'refid', 'lipi', 'midtoken', 'midsig', 'trkemail']) },
];

function decodeSafe(s: string): string {
  try { return decodeURIComponent(s); } catch { return s; }
}

export function isTrackingKey(rawKey: string, host: string, path: string): boolean {
  const k = decodeSafe(rawKey).toLowerCase();
  if (!k) return false;
  if (k.startsWith('utm_')) return true;
  if (GLOBAL.has(k)) return true;
  for (const r of HOST_RULES) {
    if (!r.host.test(host)) continue;
    if (r.keys.has(k)) return true;
    if (r.prefixes?.some(p => k.startsWith(p))) return true;
    if (r.pathOnly && r.pathOnly.keys.has(k) && r.pathOnly.re.test(path)) return true;
  }
  return false;
}

/**
 * One URL in, the same URL without its tracking parameters out, plus the removed keys.
 * `trail` is the punctuation directly after the URL in the text (see the header).
 */
export function cleanUrl(url: string, trail = ''): { url: string; removed: string[] } {
  const none = { url, removed: [] };
  if (isArchiveUrl(url)) return none;
  const q = url.indexOf('?');
  if (q < 0) return none;
  // `site/#/route?x=…` is a client-side route, read by the page's own script: leave it.
  const h0 = url.indexOf('#');
  if (h0 >= 0 && h0 < q) return none;
  const hashAt = url.indexOf('#', q);
  const base = url.slice(0, q);
  const query = url.slice(q + 1, hashAt < 0 ? undefined : hashAt);
  const frag = hashAt < 0 ? '' : url.slice(hashAt);
  if (/&(?:[a-z]+|#\d+|#x[0-9a-f]+);/i.test(query)) return none;
  const host = hostOf(url) ?? '';
  const path = base.replace(/^https?:\/\/[^/]+/i, '');
  const parts = query.split('&');
  const removed: string[] = [];
  const kept = parts.filter(p => {
    const key = p.split('=')[0];
    if (isTrackingKey(key, host, path)) { removed.push(decodeSafe(key)); return false; }
    return true;
  });
  if (!removed.length) return none;
  if (trail && !frag && isTrackingKey(parts[parts.length - 1].split('=')[0], host, path)) return none;
  const rest = kept.filter(p => p !== '').join('&');
  return { url: base + (rest ? '?' + rest : '') + frag, removed };
}

/** A URL in raw wikitext: MediaWiki's URL class plus wikitext structure; `''` ends it too. */
const URL_IN_TEXT = /https?:\/\/(?:(?!'')[^\s[\]<>"{}|])+/gi;
/** Punctuation MediaWiki leaves out of the end of a bare link (plus ZWNJ, seen live). */
const TRAILING = /[.,;:!?)\u200c]+$/;

export function stripTrackingParams(text: string): { text: string; changed: boolean; removed: string[] } {
  const opaque = opaqueSpans(text);
  const removed: string[] = [];
  let out = '';
  let last = 0;
  for (const m of text.matchAll(URL_IN_TEXT)) {
    const at = m.index!;
    if (inSpans(opaque, at, at + m[0].length)) continue;
    const trail = TRAILING.exec(m[0])?.[0] ?? '';
    const url = m[0].slice(0, m[0].length - trail.length);
    const r = cleanUrl(url, trail);
    if (!r.removed.length) continue;
    out += text.slice(last, at) + r.url;
    last = at + url.length;
    removed.push(...r.removed);
  }
  if (!removed.length) return { text, changed: false, removed };
  out += text.slice(last);
  return { text: out, changed: true, removed };
}

/**
 * CirrusSearch queries for candidate pages. A plain `insource:"…"` term is cheap; the regex
 * ones carry a plain term first so the regex runs only on its hits. Counts are ns0 hits on
 * ۲۴ نوامبر ۲۰۲۶; many are archive-only and come back as no-change.
 */
export const TRACKING_QUERIES: string[] = [
  'insource:"fbclid"',                                                               // 6,363
  'insource:"__tn__"',                                                               // 2,257
  'insource:"utm_source"',                                                           // 1,099
  'insource:"utm_medium"',
  'insource:"utm_campaign"',
  'insource:"youtube" insource:/youtube\\.com[^ |\\]]*[?&]feature=/',                // 466
  'insource:"twitter" insource:/(twitter|x)\\.com[^ |\\]]*[?&](s|t|ref_src)=/',       // 213
  'insource:"igshid"',                                                               // 195
  'insource:"srsltid"',                                                              // 173
  'insource:"youtube" insource:/youtube\\.com[^ |\\]]*[?&](pp|ab_channel)=/',         // 152
  'insource:"igsh"',                                                                 // 124
  'insource:"spotify" insource:/spotify\\.com[^ |\\]]*[?&]si=/',                     // 76
  'insource:"gclid"',                                                                // 71
  'insource:"youtu" insource:/youtu[^ |\\]]*[?&]si=/',                               // 47
  'insource:"mibextid"',                                                             // 25
  'insource:"tiktok" insource:/tiktok\\.com[^ |\\]]*[?&](_r|_t|is_from_webapp)=/',    // 6
];
