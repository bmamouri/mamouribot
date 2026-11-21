/**
 * وظیفهٔ ۱۹ — decide every change on one page. Pure: metadata comes in through `lookup`.
 *
 * The same function runs twice. In getTargets it runs with an empty lookup and reports the
 * URLs it would need metadata for (`needs`); after those are fetched it runs again, and
 * `transform` runs it a third time on the text the runner actually read. Nothing in here
 * touches the network, so the result is deterministic and testable offline.
 *
 * What is changed, by class (docs/task-19-cite-urls.md has the measurements):
 *
 *   bare-ref     `<ref>URL</ref>` and `<ref>[URL]</ref>` → `<ref>{{یادکرد وب|…}}</ref>`
 *   labelled-ref `<ref>[URL label]</ref>` → full citation (off unless T19_LABELLED=1)
 *   title        a citation whose title is missing, «Archived copy», or the URL itself
 *   scheme       `www.x.org`, `https//`, `http:/`, `http://https://` in a citation URL
 *   redirector   Google `/url?`, `/amp/s/`, the dead Google cache, Facebook `l.php`
 *   qmark        `.php؟id=1` typed with the Persian question mark
 *   tracking     `utm_*`, `fbclid`, `gclid`, …
 *   decode       `%D8%AF%D8%B1` → `در`
 *
 * `tracking` and `decode` change no rendered output, so they are MINOR: applied only on a
 * page that gets at least one substantive change, unless `minorAlone` is set.
 */
import {
  ARCHIVE_DATE_KEYS, ARCHIVE_URL_KEYS, TITLE_KEYS, URL_KEYS, URL_STATUS_KEYS,
  appendParams, citationKind, escapeParam, getParam, hasKey, inSpans, normName, opaqueSpans,
  paramScript, parseParams, refs, setValue, templateSpans, wikilinkSpans, type Span,
} from './wikitext.js';
import {
  URL_STOP, isArchiveUrl, hostOf, repairScheme, repairUrl, type UrlFixKind,
} from './url.js';
import { buildCitation, formatDate, type Meta } from './build.js';
import { isHomeLike } from './resolve.js';

export type Kind = 'bare-ref' | 'labelled-ref' | 'title' | 'scheme' | 'redirector' | 'qmark' | UrlFixKind;
export const MINOR: ReadonlySet<Kind> = new Set<Kind>(['tracking', 'decode']);

export type Lookup = (url: string) => { ok: true; meta: Meta } | { ok: false; reason: string } | undefined;

export interface PlanOptions {
  lookup: Lookup;
  /** «۲۱ نوامبر ۲۰۲۶»: the access date written into new citations */
  today: string;
  labelled?: boolean;
  minorAlone?: boolean;
  /** `title\nurl` pairs a reviewer rejected on the review page: never touched */
  rejected?: Set<string>;
  /** at most this many bare refs completed per edit; the rest wait for a later run */
  maxRefs?: number;
  /** url → citation a reviewer approved on the review page: written exactly as approved */
  approved?: Map<string, string>;
}

/** Bare refs completed per edit. 74 in one diff (کانون تکواندوکاران ایران) is unreviewable. */
export const MAX_REFS_PER_EDIT = 20;

export interface Change { kind: Kind; from: string; to: string }
export interface Decline { url: string; reason: string }
export interface Plan {
  text: string;
  changed: boolean;
  changes: Change[];
  /** URLs this page needs metadata for and the lookup did not have */
  needs: string[];
  declined: Decline[];
  /** old → new for every URL rewritten in place; used by verify() to account for hrefs */
  urlMap: Map<string, string>;
  /** finished citations the bot did not save, for the review page */
  proposals: { url: string; proposed: string; why: string }[];
}

/** Pages an editor has marked as being worked on right now. */
const IN_USE = /\{\{\s*(?:در دست ویرایش|در حال ویرایش|inuse|in use|under construction|در دست ساخت)\s*[|}]/i;

/** Inline bare-URL maintenance tags. Removed together with the bare URL they mark. */
const BARE_TAG = /\{\{\s*(?:bare url inline|bare url pdf|bare url|cleanup bare urls|نشانی‌های وب عریان|نشانی وب عریان|نشانی پی‌دی‌اف عریان)\s*(?:\|[^{}]*)?\}\}/gi;

/** A free URL as MediaWiki delimits it, including its trailing-punctuation rule. */
function freeUrl(s: string): { url: string; rest: string } | null {
  const m = /^https?:\/\/[^\s\[\]<>"{}|]+/i.exec(s);
  if (!m) return null;
  let url = m[0];
  if (url.includes("''")) url = url.slice(0, url.indexOf("''"));
  const sep = url.includes('(') ? /[,;.:!?]+$/ : /[,;.:!?)]+$/;
  const t = sep.exec(url);
  if (t) url = url.slice(0, t.index);
  return { url, rest: s.slice(url.length) };
}

/** Hosts whose pages are not citable as a web page, or need a template this task does not write. */
const SKIP_HOSTS = /(^|\.)(wikipedia\.org|wikimedia\.org|wikidata\.org|wiktionary\.org|wikisource\.org|wikiquote\.org|twitter\.com|x\.com|facebook\.com|instagram\.com|t\.me|telegram\.me|youtube\.com|youtu\.be|aparat\.com|tiktok\.com|books\.google\.[a-z.]+|google\.[a-z.]+\/books|maps\.google\.[a-z.]+|archive\.org)$/i;
export function skipReason(url: string): string | null {
  const h = hostOf(url);
  if (!h) return 'not-http';
  if (isArchiveUrl(url)) return 'archive-url';
  if (SKIP_HOSTS.test(h)) return /wiki/.test(h) ? 'wikimedia' : 'unsupported-host';
  if (/^https?:\/\/(?:www\.)?google\.[a-z.]+\/(?:maps|books|search)/i.test(url)) return 'unsupported-host';
  if (/\.(?:pdf|docx?|xlsx?|pptx?|zip|rar|jpe?g|png|gif|mp3|mp4)(?:[?#]|$)/i.test(url)) return 'file';
  return null;
}

/** Repair a citation's URL value. `scheme` only here: in a parameter the value IS a whole URL. */
function fixParamUrl(value: string): { url: string; kinds: Kind[] } | null {
  if (!value || /[{}<\[\]]/.test(value)) return null;   // templates, comments, links inside: leave
  let u = value, kinds: Kind[] = [];
  if (!/^(?:https?:)?\/\//i.test(u) || /^https?(?::\/(?!\/)|\/\/|:\/{3,})/i.test(u) || /^https?:\/*https?:/i.test(u)) {
    const s = repairScheme(u);
    if (s && s !== u) { kinds.push('scheme'); u = s; }
  }
  if (!/^(?:https?:)?\/\//i.test(u)) return kinds.length ? { url: u, kinds } : null;
  const q = fixQmark(u); if (q !== u) { kinds.push('qmark'); u = q; }
  const r = repairUrl(u);
  return { url: r.url, kinds: [...kinds, ...r.kinds] };
}

/** `.php؟id=1` → `.php?id=1`: only when there is no real `?` and a `key=` follows. */
export function fixQmark(url: string): string {
  if (url.includes('?')) return url;
  return url.replace(/؟(?=[A-Za-z_][\w.-]*=)/, '?');
}

function inlineUrlFix(url: string): { url: string; kinds: Kind[] } {
  let u = url; const kinds: Kind[] = [];
  const q = fixQmark(u); if (q !== u) { kinds.push('qmark'); u = q; }
  const r = repairUrl(u);
  return { url: r.url, kinds: [...kinds, ...r.kinds] };
}

const PLACEHOLDER_TITLE = /^(?:archived? copy|نسخهٔ? (?:بایگانی|آرشیو)[‌ ]?شده|(?:بایگانی|آرشیو)[‌ ]?شده|untitled|no title|بدون عنوان|title|عنوان)$/i;

/** A site parameter left over from a Google redirect or cache link. */
const SITE_KEYS = new Set(['وبگاه', 'ناشر', 'اثر', 'website', 'work', 'publisher']);
const GOOGLE_SITE = /^(?:https?:\/\/)?(?:www\.)?google(?:\.[a-z]{2,3}){1,2}\/?$|^google$/i;

export function planPage(text: string, title: string, opt: PlanOptions): Plan {
  const plan: Plan = { text, changed: false, changes: [], needs: [], declined: [], urlMap: new Map(), proposals: [] };
  const maxRefs = opt.maxRefs ?? MAX_REFS_PER_EDIT;
  let refsDone = 0;
  if (IN_USE.test(text)) return plan;

  const opaque = opaqueSpans(text);
  const { calls, unclosedAt } = templateSpans(text, opaque);
  const links = wikilinkSpans(text, opaque);
  const cutoff = unclosedAt < 0 ? text.length : unclosedAt;   // after an unclosed {{ nothing is safe
  const edits: { start: number; end: number; to: string }[] = [];
  const taken: Span[] = [];
  const free = (s: number, e: number) => e <= cutoff && !inSpans(opaque, s, e) && !inSpans(taken, s, e);
  const need = (u: string) => { if (!plan.needs.includes(u)) plan.needs.push(u); };
  const record = (kind: Kind, from: string, to: string) => plan.changes.push({ kind, from, to });

  // --- 1. bare references -------------------------------------------------------------
  for (const r of refs(text, opaque)) {
    if (!free(r.start, r.end)) continue;
    const body = r.body;
    const bare = matchBareRef(body, !!opt.labelled);
    if (!bare) continue;
    const fixed = inlineUrlFix(bare.url);
    const url = fixed.url;
    const skip = skipReason(url);
    if (skip) { plan.declined.push({ url, reason: skip }); continue; }
    // A site's front page as the whole reference: its title describes the site, not the
    // claim, so a «complete» citation would only dress it up (weather.com, vardanjan.ir).
    const pre = opt.approved?.get(url);
    if (pre && !opt.rejected?.has(`${title}\n${url}`)) {
      edits.push({ start: r.bodyStart, end: r.bodyStart + body.length, to: pre });
      taken.push([r.start, r.end]);
      record('bare-ref', bare.url, url);
      continue;
    }
    if (isHomeLike(url)) { plan.declined.push({ url, reason: 'home-page' }); continue; }
    const got = opt.lookup(url);
    if (got === undefined) { need(url); continue; }
    if (!got.ok) { plan.declined.push({ url, reason: got.reason }); continue; }
    if (opt.rejected?.has(`${title}\n${url}`)) continue;
    const ok = opt.approved?.get(url);
    if (ok) {
      edits.push({ start: r.bodyStart, end: r.bodyStart + body.length, to: ok });
      taken.push([r.start, r.end]);
      record('bare-ref', bare.url, url);
      continue;
    }
    const meta = bare.label && !got.meta.titleFromSite ? { ...got.meta } : got.meta;
    const cite = buildCitation(meta, { today: opt.today });
    const doubt = uncertainty(meta, cite);
    if (doubt) { plan.proposals.push({ url, proposed: cite, why: doubt }); continue; }
    if (refsDone >= maxRefs) continue;            // no proposal: the next run picks it up
    refsDone++;
    edits.push({ start: r.bodyStart, end: r.bodyStart + body.length, to: cite });
    taken.push([r.start, r.end]);
    record(bare.label ? 'labelled-ref' : 'bare-ref', bare.url, url);
    for (const k of fixed.kinds) record(k, bare.url, url);
  }

  // --- 2. citation templates ----------------------------------------------------------
  for (const c of calls) {
    if (!free(c.start, c.end)) continue;
    const kind = citationKind(c.name);
    if (!kind) continue;
    const call = text.slice(c.start, c.end);
    // a nested citation inside this one is handled on its own; skip the outer to keep spans disjoint
    if (calls.some(o => o !== c && o.start > c.start && o.end < c.end && citationKind(o.name))) continue;
    const params = parseParams(call);
    if (params.some(p => p.key === null && p.value !== '')) continue;    // positional args: not a CS1 call we understand
    let out = call;
    const delta: Change[] = [];
    // work from the last parameter backwards so offsets stay valid
    const urlP = getParam(params, URL_KEYS);
    let finalUrl: string | null = null;
    if (urlP) {
      const fx = fixParamUrl(urlP.value);
      if (fx) {
        finalUrl = fx.url;
        if (fx.url !== urlP.value) {
          out = setValue(out, urlP, fx.url);
          for (const k of fx.kinds) delta.push({ kind: k, from: urlP.value, to: fx.url });
          plan.urlMap.set(urlP.value, fx.url);
        }
      } else if (/^(?:https?:)?\/\//i.test(urlP.value)) finalUrl = urlP.value;
    }

    // title fill: only web/news, only from metadata, only when missing or a placeholder
    if ((kind === 'web' || kind === 'news') && finalUrl && /^https?:/i.test(finalUrl)) {
      const tP = getParam(params, TITLE_KEYS);
      const tv = tP?.value ?? '';
      const tvPlain = tv.replace(/^["«'']+|["»'']+$/g, '').trim();
      const placeholder = !tP || PLACEHOLDER_TITLE.test(tvPlain) || tvPlain === finalUrl || /^(?:https?:\/\/|www\.)\S+$/i.test(tvPlain);
      if (placeholder && !/[{}<]/.test(tv)) {
        const arch = getParam(params, ARCHIVE_URL_KEYS)?.value;
        const key = arch && /^https?:\/\/web\.archive\.org\/web\/\d{8,14}/i.test(arch) ? arch : finalUrl;
        const skip = key === finalUrl ? skipReason(finalUrl) : null;
        const got = skip ? { ok: false as const, reason: skip } : opt.lookup(key);
        if (got === undefined) need(key);
        else if (!got.ok) plan.declined.push({ url: key, reason: got.reason });
        else {
          const script = paramScript(params);
          const newTitle = escapeParam(got.meta.title);
          const fresh = parseParams(out);
          const ftP = getParam(fresh, TITLE_KEYS);
          const emptyTitle = fresh.find(p => p.keyNorm !== null && TITLE_KEYS.has(p.keyNorm) && p.value === '');
          const adds: [string, string][] = [];
          if (ftP) out = setValue(out, ftP, newTitle);
          else if (emptyTitle) out = setValue(out, emptyTitle, newTitle);
          else adds.push([script === 'en' ? 'title' : 'عنوان', newTitle]);
          if (got.meta.archive && key === finalUrl && !hasKey(fresh, ARCHIVE_URL_KEYS)) {
            adds.push([script === 'en' ? 'archive-url' : 'پیوند بایگانی', got.meta.archive.url]);
            if (!hasKey(fresh, ARCHIVE_DATE_KEYS)) adds.push([script === 'en' ? 'archive-date' : 'تاریخ بایگانی', formatDate(got.meta.archive.date)!]);
            if (!hasKey(fresh, URL_STATUS_KEYS)) adds.push([script === 'en' ? 'url-status' : 'چگونگی پیوند', script === 'en' ? 'dead' : 'مرده']);
          }
          if (adds.length) out = appendParams(out, adds);
          delta.push({ kind: 'title', from: tv, to: got.meta.title });
        }
      }
    }
    // `وبگاه=www.google.com` names the redirector, not the source. Replace it once the URL
    // no longer points at Google, with the real site name when we know it.
    if (finalUrl && !/google\./i.test(hostOf(finalUrl) ?? '')) {
      const fresh = parseParams(out);
      const gp = fresh.find(p => p.keyNorm !== null && SITE_KEYS.has(p.keyNorm) && GOOGLE_SITE.test(p.value));
      if (gp) {
        const got = opt.lookup(finalUrl);
        if (got === undefined && !skipReason(finalUrl)) need(finalUrl);
        else if (got?.ok && got.meta.website && !GOOGLE_SITE.test(got.meta.website)) {
          out = setValue(out, gp, got.meta.website.startsWith('[[') ? got.meta.website : escapeParam(got.meta.website));
          delta.push({ kind: 'redirector', from: gp.value, to: got.meta.website });
        }
      }
    }
    if (out !== call) {
      edits.push({ start: c.start, end: c.end, to: out });
      taken.push([c.start, c.end]);
      plan.changes.push(...delta);
    }
  }

  // --- 3. links outside citations: [URL label], and URLs left in <ref> text -----------
  const templ = calls.map(c => [c.start, c.end] as Span);
  for (const m of text.matchAll(/\[(https?:\/\/[^\s\[\]<>"{}|]+)(?=[\s\]])/gi)) {
    const s = m.index! + 1, url = m[1], e = s + url.length;
    if (!free(s, e) || inSpans(links, s, e) || inSpans(templ, s, e)) continue;
    const fx = inlineUrlFix(url);
    if (fx.url === url || URL_STOP.test(fx.url)) continue;
    edits.push({ start: s, end: e, to: fx.url });
    taken.push([s, e]);
    plan.urlMap.set(url, fx.url);
    for (const k of fx.kinds) record(k, url, fx.url);
  }
  for (const r of refs(text, opaque)) {
    if (!free(r.start, r.end)) continue;
    for (const m of r.body.matchAll(/(?<![\[\w/=])https?:\/\/[^\s\[\]<>"{}|]+/gi)) {
      const s = r.bodyStart + m.index!;
      const f = freeUrl(text.slice(s, r.bodyStart + r.body.length));
      if (!f) continue;
      const e = s + f.url.length;
      if (!free(s, e) || inSpans(templ, s, e) || inSpans(links, s, e)) continue;
      const fx = inlineUrlFix(f.url);
      if (fx.url === f.url || URL_STOP.test(fx.url)) continue;
      edits.push({ start: s, end: e, to: fx.url });
      taken.push([s, e]);
      plan.urlMap.set(f.url, fx.url);
      for (const k of fx.kinds) record(k, f.url, fx.url);
    }
  }

  // --- apply ----------------------------------------------------------------------------
  const substantive = plan.changes.some(c => !MINOR.has(c.kind));
  if (!plan.changes.length || (!substantive && !opt.minorAlone)) {
    plan.changes = [];
    plan.urlMap.clear();
    return plan;
  }
  edits.sort((a, b) => b.start - a.start);
  let out = text;
  for (const e of edits) out = out.slice(0, e.start) + e.to + out.slice(e.end);
  plan.text = out;
  plan.changed = out !== text;
  void title; void normName;
  return plan;
}

/**
 * Why a finished citation should go to a human instead of the article, or null.
 * Kept narrow on purpose: the metadata rules have already rejected what is wrong; this
 * is only for what is plausible but unproven.
 */
export function uncertainty(meta: Meta, cite: string): string | null {
  if (/\|نویسنده[۰-۹]*=/.test(cite)) return 'نام نویسنده به نام و نام خانوادگی جدا نشد';
  // a title cut to a site-free stub reads like a section name, not an article
  // Encyclopedias title an entry by its headword: «بروجرد» on cgie.org.ir is right.
  const encyclopedia = /(^|\.)(cgie\.org\.ir|encyclopaediaislamica\.com|iranicaonline\.org|britannica\.com|rch\.ac\.ir|wikinoor\.ir|daneshnameh|abadis\.ir|vajehyab\.com|dehkhoda)/i.test(hostOf(meta.url) ?? '');
  if (!encyclopedia && meta.title.split(/\s+/).length === 1 && meta.title.length < 12 && !/[0-9۰-۹]/.test(meta.title)) return 'عنوان صفحه بسیار کوتاه است و شاید نام بخش باشد';
  return null;
}

/** `<ref>` bodies that are only a URL, optionally bracketed, optionally followed by a bare-URL tag. */
export function matchBareRef(body: string, labelled: boolean): { url: string; label?: string } | null {
  const b = body.replace(BARE_TAG, '').trim();
  if (!b) return null;
  if (b.startsWith('[')) {
    const m = /^\[(https?:\/\/[^\s\[\]<>"{}|]+)(?:\s+([^\]\n]+?))?\s*\]\s*\.?$/i.exec(b);
    if (!m) return null;
    if (m[2] !== undefined) {
      if (!labelled) return null;
      if (/[{}<\[]|''/.test(m[2])) return null;
      return { url: m[1], label: m[2].trim() };
    }
    return { url: m[1] };
  }
  const f = freeUrl(b);
  if (!f || !/^[\s.]*$/.test(f.rest)) return null;
  return { url: f.url };
}
