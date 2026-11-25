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
 * Second batch (۲۵ نوامبر ۲۰۲۶), from a 1,028-page sample of 54 more candidate keys:
 * Cloudflare challenge tokens (`__cf_chl_*`), Yahoo consent redirects (`guccounter`), BBC/NYT/
 * Guardian/MSN/Forbes share tags, Google Books search-click data (`ved`, `sa`, `ei`, `usg`),
 * the AMP viewer's `amp_js_v`/`usqp` and `#amp_tf=…`, and whole fragments that are only
 * tracking state (`#google_vignette`, `#gsc.tab=0`, `#sthash.…`, `#axzz…`). Generic names
 * (`cmpid`, `icid`, `ncid`, `s_cid`) are limited to the sites seen using them for campaigns:
 * `ICID=11763` on medscimonit.com is the article.
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
  '_gl', '_ga', '__twitter_impression', 'fb_action_ids', 'fb_action_types', 'fb_source', 'fb_ref',
  'action_object_map', 'action_type_map', 'action_ref_map', 'guccounter', 'guce_referrer', 'guce_referrer_sig',
  '__hstc', '__hssc', '__hsfp', 'wt.mc_id', 'wt.mc_ev', 'ns_mchannel', 'ns_source', 'ns_campaign', 'ns_linkname',
  'ns_fee', 'at_medium', 'at_campaign', 'at_ptr_name', 'xtor', 'dicbo', 'sr_share',
  '_openstat', 'oly_anon_id', 'oly_enc_id', 'vero_id', 'vero_conv', '_branch_match_id', '_branch_referrer',
]);
/** Removed on every host, by prefix: Cloudflare challenge tokens, Matomo/Piwik campaigns, AT Internet. */
const GLOBAL_PREFIXES = ['__cf_chl_', 'pk_', 'mtm_', 'at_custom'];

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
  // `ex`, `en`, `ei` on old NYT links were an access token; they stay.
  { host: /(^|\.)nytimes\.com$/, keys: new Set(['smid', 'smtyp', 'partner', 'emc']) },
  { host: /(^|\.)theguardian\.com$/, keys: new Set(['cmp']) },
  { host: /(^|\.)(msn\.com|bbc\.com|bbc\.co\.uk)$/, keys: new Set(['ocid']) },
  { host: /(^|\.)forbes\.com$/, keys: new Set(['sh']) },
  // `cmpid`, `icid`, `ncid`, `s_cid` are generic names: `ICID=11763` on medscimonit.com and
  // aaem.pl is the article number. Only on the sites measured to use them for campaigns.
  { host: /(^|\.)(newscientist\.com|popsci\.com|foxsports\.com|foxbusiness\.com|foxnews\.com|cycleworld\.com|politico\.com|nationalgeographic\.com|bloomberg\.com)$/, keys: new Set(['cmpid']) },
  { host: /(^|\.)(soccerway\.com|goal\.com|sagepub\.com|chroniclelive\.co\.uk|aol\.com|cinematical\.com)$/, keys: new Set(['icid']) },
  { host: /(^|\.)(huffingtonpost\.[a-z.]+|huffpost\.com|techcrunch\.com|engadget\.com)$/, keys: new Set(['ncid']) },
  { host: /(^|\.)(cdc\.gov|usnews\.com|zdnet\.com|ksl\.com)$/, keys: new Set(['s_cid']) },
  { host: /(^|\.)reddit\.com$/, keys: new Set(['rdt', 'share_id']) },
  { host: /(^|\.)(amazon\.[a-z.]+|imdb\.com)$/, keys: new Set(), prefixes: ['pf_rd_', 'pd_rd_'] },
  // Search-click data on a Google Books link. `id`, `pg`, `dq`, `sig`, `ots` stay; `usg`
  // elsewhere (Google Translate's proxy) is a signature the page needs, hence the path test.
  { host: /(^|\.)books\.google\.[a-z.]+$/, keys: new Set(), pathOnly: { re: /^\/books/, keys: new Set(['ved', 'sa', 'ei', 'usg']) } },
  { host: /\.cdn\.ampproject\.org$/, keys: new Set(['amp_js_v', 'amp_gsa', 'usqp', 'amp_lite']) },
];

/** A whole fragment that is only tracking state: dropped with its `#`. */
const FRAGMENT_WHOLE: RegExp[] = [
  /^google_vignette$/,                       // AdSense interstitial
  /^gsc\.tab=\d+$/,                          // Google Custom Search widget state
  /^sthash\.[A-Za-z0-9]{8}(?:\.[a-z]{4})?$/,   // AddThis (`#sthash.9MPVsbBO.dpuf`)
  /^[ai]xzz[A-Za-z0-9]{6,}$/,                // Tynt copy tracking (`#axzz1b9QLCKIO`)
  /^(?:Echobox|link_time)=\d+$/,             // social schedulers
  /^xtor=[A-Za-z0-9_%\[\]-]+$/,               // AT Internet
];
/** `key=value&…` fragment parts written by the AMP viewer on a cdn.ampproject.org page. */
const AMP_FRAGMENT_KEYS = new Set(['amp_tf', 'aoh', 'amp_ct', 'ampshare', 'referrer', 'csi']);

function cleanFragment(frag: string, host: string): { frag: string; removed: string[] } {
  if (FRAGMENT_WHOLE.some(re => re.test(frag))) return { frag: '', removed: ['#' + frag.split(/[=.]/)[0].replace(/^([ai]xzz).*/, '$1')] };
  if (!/\.cdn\.ampproject\.org$/.test(host)) return { frag, removed: [] };
  const parts = frag.split('&');
  if (!parts.every(p => /^[A-Za-z_]+=/.test(p))) return { frag, removed: [] };
  const removed: string[] = [];
  const kept = parts.filter(p => {
    const k = p.split('=')[0].toLowerCase();
    if (AMP_FRAGMENT_KEYS.has(k)) { removed.push('#' + k); return false; }
    return true;
  });
  return { frag: kept.join('&'), removed };
}

function decodeSafe(s: string): string {
  try { return decodeURIComponent(s); } catch { return s; }
}

export function isTrackingKey(rawKey: string, host: string, path: string): boolean {
  const k = decodeSafe(rawKey).toLowerCase();
  if (!k) return false;
  if (k.startsWith('utm_')) return true;
  if (GLOBAL.has(k)) return true;
  if (GLOBAL_PREFIXES.some(p => k.startsWith(p))) return true;
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
  const h = url.indexOf('#');
  // `site/#/route?x=…` is a client-side route, read by the page's own script: leave it.
  if (q >= 0 && h >= 0 && h < q) return none;
  if (q < 0 && h < 0) return none;
  const base = url.slice(0, q >= 0 ? q : h);
  const query = q >= 0 ? url.slice(q + 1, h >= 0 ? h : undefined) : null;
  const frag = h >= 0 ? url.slice(h + 1) : null;
  if (/&(?:[a-z]+|#\d+|#x[0-9a-f]+);/i.test(url)) return none;
  const host = hostOf(url) ?? '';
  const path = base.replace(/^https?:\/\/[^/]+/i, '');
  const removed: string[] = [];

  let newQuery = query;
  if (query !== null) {
    const kept = query.split('&').filter(p => {
      const key = p.split('=')[0];
      if (isTrackingKey(key, host, path)) { removed.push(decodeSafe(key)); return false; }
      return true;
    });
    if (removed.length) newQuery = kept.filter(p => p !== '').join('&');
  }
  let newFrag = frag;
  if (frag) {
    const f = cleanFragment(frag, host);
    if (f.removed.length) { newFrag = f.frag; removed.push(...f.removed); }
  }
  if (!removed.length) return none;
  // A bare trailing `#` the editor left is kept; a fragment emptied here goes with its `#`.
  const out = base + (newQuery ? '?' + newQuery : '') + (newFrag || frag === '' ? '#' + newFrag : '');
  // Cutting the END of a URL that is followed by punctuation would glue the punctuation
  // onto the URL inside a citation parameter (see the header).
  if (trail && url.startsWith(out)) return none;
  return { url: out, removed };
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
  // second batch, ۲۵ نوامبر ۲۰۲۶
  'insource:"books.google" insource:/books\\.google\\.[a-z.]+\\/books[^ |\\]]*[?&](ved|sa|ei|usg)=/', // 3,599
  'insource:"amp_js_v"',                                                             // 364
  'insource:"amp_tf"',                                                               // 350
  'insource:"forbes" insource:/forbes\\.com[^ |\\]]*[?&]sh=/',                       // 260
  'insource:"gsc.tab"',                                                              // 206
  'insource:"sthash"',
  'insource:"google_vignette"',                                                      // 127
  'insource:"ns_mchannel"',
  'insource:"smid" insource:/nytimes\\.com[^ |\\]]*[?&]smid=/',                      // 116
  'insource:"ocid" insource:/(msn|bbc)\\.(com|co\\.uk)[^ |\\]]*[?&]ocid=/',           // 111
  'insource:"icid" insource:/(soccerway|goal|sagepub)\\.com[^ |\\]]*[?&][iI][cC][iI][dD]=/',
  'insource:"guccounter"',                                                           // 101
  'insource:"__cf_chl"',                                                             // 86
  'insource:"CMP" insource:/theguardian\\.com[^ |\\]]*[?&]CMP=/',                    // 78
  'insource:"ncid"',                                                                 // 49
  'insource:"WT.mc_id"',                                                             // 36
  'insource:"at_medium"',                                                            // 26
  'insource:"pf_rd_p"',                                                              // 22
  'insource:"cmpid"',                                                                // 16
  'insource:"__twitter_impression"',                                                 // 14
  'insource:"xtor"',                                                                 // 13
  'insource:"s_cid"',                                                                // 11
  'insource:"axzz"',
  'insource:"ixzz"',
  'insource:"fb_action_ids"',
  'insource:"__hstc"',
  'insource:"dicbo"',
];
