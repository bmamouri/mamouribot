/**
 * Task 12 — decide what each finding should become, and what it must NOT.
 *
 * The resolution ladder is from
 * `lessons/persian-conventions/useful-redlink-repoint-not-strip.md`:
 *
 *   1. an fa article exists          -> re-point, Persian display
 *   2. only an en article exists     -> [[:en:Title|فارسی]]
 *   3. neither                       -> unlinked Persian text
 *
 * What makes this botable at all is the hard line this module draws: **the bot never
 * invents a Persian display name.** A name is either in the curated table
 * (`data/names.json`, grown by a human) or the finding is returned as REVIEW and left
 * untouched on-wiki. Measured on a random 80-article sample, that boundary leaves ~45% of
 * occurrences auto-fixable and sends ~55% to review, and the permission request has to
 * state that honestly rather than let the bot transliterate on its own.
 *
 * Second hard line: an fa title reached through an **en redirect** is REVIEW, not auto.
 * `Acquanetta Warren` redirects to `Fontana, California`, whose fa article is the CITY —
 * re-pointing a mayor's name at a city is a wrong-topic blue link, which no red-link
 * check can catch.
 *
 * Ported from the Python `scripts/linkfix/resolve.py`, which this replaces.
 */
import { existsSync, readFileSync } from 'fs';
import bundledNames from './data/names.json' with { type: 'json' };

export const FA = 'fa', EN = 'en', PLAIN = 'plain', REVIEW = 'review', SKIP = 'skip';
export type ResKind = typeof FA | typeof EN | typeof PLAIN | typeof REVIEW | typeof SKIP;

export interface Resolution {
  kind: ResKind;
  link?: string | null;
  display?: string | null;
  reason: string;
}

export interface Names {
  fa: Record<string, string>;
  en: Record<string, string>;
  plain: Record<string, string>;
  remap: Record<string, string>;
  by_old_display: Record<string, string>;
}

/**
 * The curated table.
 *
 * The JSON is IMPORTED, not read from disk, so it survives bundling: a Toolforge job runs
 * one collapsed file and anything resolved relative to `import.meta.url` lands in
 * `dist/` — the same trap that cost a round of debugging with `gates.py`.
 *
 * `LINKFIX_NAMES` overrides it with a path, because the operating model is a loop: the
 * bot reports what it could not name, a human adds names, the bot runs again. Having to
 * rebuild the bundle between those steps would be friction in the one place this task
 * depends on a human.
 */
export function loadNames(path = process.env.LINKFIX_NAMES): Names {
  if (path) {
    if (!existsSync(path)) throw new Error(`LINKFIX_NAMES=${path} وجود ندارد`);
    return JSON.parse(readFileSync(path, 'utf8')) as Names;
  }
  return bundledNames as Names;
}

/** What a lookup must report for one en title. */
export interface LookupInfo {
  enExists: boolean;
  faTitle: string | null;
  viaRedirect: boolean;
  /** The en redirect's own title and its categories (the «rcats»), when viaRedirect. */
  redirectFrom?: string;
  redirectTo?: string;
  redirectCats?: string[];
  /** A redirect to `Page#Section` is about the section, not the page. */
  redirectFragment?: string | null;
  enDisambig?: boolean;
  /** Wikidata item of the en page the link finally lands on. */
  enItem?: string | null;
}

/**
 * Redirect categories that say "the same subject under another title". Each is about the
 * TITLE (it moved, it is shorter, it is spelled differently), never about the topic.
 */
const SAME_SUBJECT_RCATS = new Set([
  'Redirects from moves', 'Redirects from modifications', 'Redirects from short names',
  'Redirects from long names', 'Redirects from other capitalisations',
  'Redirects from alternative names', 'Redirects from alternative spellings',
  'Redirects from full names', 'Redirects from former names',
  'Redirects from incorrect hyphenation', 'Redirects from titles with diacritics',
  'Redirects from titles without diacritics', 'Redirects from ASCII-only titles',
]);
/**
 * Any of these vetoes the redirect, even beside a same-subject category: the redirect's
 * subject is a part of, a relative of, or a thing named after its target. `Homeric` →
 * Homer («from adjectives»), `Odinism` → Heathenry («subtopics»), `Finnish paganism` →
 * Baltic Finnic paganism («related words») were all in the ۱۲ نوامبر sample. A redirect
 * with its OWN Wikidata item is a distinct concept by definition.
 */
const DIFFERENT_SUBJECT_RCAT = new RegExp(
  'possibilities|merges|members|subtopics|related (?:words|topics)|adjectives|eponyms|'
  + 'list (?:topics|entries)|to sections|to anchors|to embedded anchors|songs|albums|'
  + 'book titles|works|fictional|characters|spouses|relatives|incomplete|'
  + 'connected to a Wikidata item|avoided double redirects|from people|personal names|'
  + 'ambiguous|disambiguation', 'i');

/**
 * A page that redirects into a LIST is an entry in it, not the list: `Trout Lake Airport
 * (Washington)` → `List of airports in Washington` carried only «Redirects from moves» in
 * the ۱۲ نوامبر sample. Same for an index or an outline.
 */
const COLLECTION_TARGET = /^(?:List|Lists|Index|Outline|Glossary|Timeline) of /i;

/** `Gardner, Martin` → `Martin Gardner`: a catalogue-style inversion of the same name. */
export function isNameInversion(from: string, to: string): boolean {
  const m = /^([^,]+),\s*([^,]+)$/.exec(from.trim());
  return !!m && `${m[2].trim()} ${m[1].trim()}` === to.trim();
}

/**
 * Whether an en redirect provably names the same subject as its target. Evidence only:
 * an exact name inversion, or a same-subject rcat — and in both cases no rcat that says
 * the subject differs. No category at all is NOT evidence; the redirect stays REVIEW.
 */
export function sameSubjectRedirect(info: LookupInfo): boolean {
  if (!info.viaRedirect || !info.redirectFrom || !info.redirectTo) return false;
  if (info.redirectFragment) return false;
  if (COLLECTION_TARGET.test(info.redirectTo) && !COLLECTION_TARGET.test(info.redirectFrom)) return false;
  const cats = info.redirectCats ?? [];
  if (cats.some(c => DIFFERENT_SUBJECT_RCAT.test(c))) return false;
  return isNameInversion(info.redirectFrom, info.redirectTo)
    || cats.some(c => SAME_SUBJECT_RCATS.has(c));
}
export type Lookup = (titles: string[]) => Promise<Map<string, LookupInfo>>;
/** Which of these fa titles really exist. */
export type FaExists = (titles: string[]) => Promise<Set<string>>;
/** Disambiguation flag and Wikidata item of each EXISTING fa title. */
export type FaInfo = (titles: string[]) => Promise<Map<string, { disambig: boolean; item: string | null }>>;

/**
 * Injected rather than imported, so the whole class is testable against a plain Map with
 * no network at all. That is what makes the 23 offline tests possible.
 */
export class Resolver {
  constructor(
    private lookup: Lookup,
    private names: Names = loadNames(),
    private faExists?: FaExists,
    private faInfo?: FaInfo,
    /** Follow same-subject en redirects (extension ۲). Off = the approved behaviour. */
    private followRedirects = true,
  ) {}

  private curated(target: string): [keyof Names | null, string | null] {
    for (const bucket of [FA, EN, PLAIN] as const) {
      const v = this.names[bucket]?.[target];
      if (v !== undefined) return [bucket, v];
    }
    return [null, null];
  }

  async resolveMany(targets: string[]): Promise<Map<string, Resolution>> {
    const uniq = [...new Set(targets)];
    const remap = this.names.remap ?? {};
    const probe = uniq.map(t => remap[t] ?? t);
    const info = await this.lookup(probe);

    const faCandidates = new Set<string>();
    for (const v of info.values()) if (v.faTitle) faCandidates.add(v.faTitle);
    const liveFa = (this.faExists && faCandidates.size)
      ? await this.faExists([...faCandidates].sort())
      : null;
    const faMeta = (this.faInfo && faCandidates.size)
      ? await this.faInfo([...faCandidates].sort())
      : null;

    const out = new Map<string, Resolution>();
    for (const target of uniq) {
      const key = remap[target] ?? target;
      let [bucket, name] = this.curated(target);
      if (bucket === null && key !== target) [bucket, name] = this.curated(key);
      const li = info.get(key) ?? { enExists: false, faTitle: null, viaRedirect: false };
      const { enExists, faTitle, viaRedirect } = li;

      if (li.enDisambig) {
        out.set(target, { kind: REVIEW, reason: 'en target is a disambiguation page' });
        continue;
      }
      if (faTitle && liveFa !== null && !liveFa.has(faTitle)) {
        out.set(target, { kind: REVIEW, reason:
          'langlink points at an fa title that does not exist (stale Wikidata sitelink)' });
        continue;
      }
      const meta = faTitle ? faMeta?.get(faTitle) : undefined;
      if (faTitle && meta?.disambig) {
        out.set(target, { kind: REVIEW, reason: `fa target '${faTitle}' is a disambiguation page` });
        continue;
      }
      if (faTitle && meta && li.enItem && meta.item && meta.item !== li.enItem) {
        // The langlink and the page the reader lands on disagree about the subject.
        out.set(target, { kind: REVIEW, reason:
          `fa target '${faTitle}' is ${meta.item}, the en page is ${li.enItem}` });
        continue;
      }
      if (faTitle && viaRedirect && !(this.followRedirects && sameSubjectRedirect(li))) {
        out.set(target, { kind: REVIEW, reason:
          `fa target '${faTitle}' reached via an en redirect — verify it is the same subject` });
        continue;
      }
      if (faTitle) {
        out.set(target, { kind: FA, link: faTitle,
          display: bucket === FA ? name : faTitle,
          reason: viaRedirect ? 'fa article via a same-subject en redirect' : 'fa article via langlink' });
        continue;
      }
      if (enExists) {
        if (name && (bucket === EN || bucket === FA)) {
          out.set(target, { kind: EN, link: key, display: name, reason: 'curated Persian display' });
        } else {
          out.set(target, { kind: REVIEW, reason:
            'en-only: needs a Persian display name in names.json' });
        }
        continue;
      }
      if (name && bucket === PLAIN) {
        out.set(target, { kind: PLAIN, link: null, display: name,
          reason: 'no article on either wiki' });
      } else {
        out.set(target, { kind: REVIEW, reason:
          'no article on either wiki and no curated Persian text' });
      }
    }
    return out;
  }
}

// --- live lookups, the only part that touches the network -------------------

/** Minimal shape this module needs from an API client, so it is not tied to Bot. */
export interface ApiClient { apiGet(p: Record<string, string>): Promise<any> }

/**
 * `prop=langlinks&lllang=fa` on en.wikipedia, following redirects — plus what the redirect
 * gate needs: each redirect's own categories, its fragment, the target's disambiguation
 * flag and Wikidata item.
 */
export function mediawikiLookup(en: ApiClient): Lookup {
  return async (titles: string[]) => {
    const out = new Map<string, LookupInfo>();
    for (let i = 0; i < titles.length; i += 40) {
      const chunk = titles.slice(i, i + 40);
      const d = await en.apiGet({ action: 'query', prop: 'langlinks|pageprops', lllang: 'fa',
        lllimit: '500', ppprop: 'disambiguation|wikibase_item', redirects: '1',
        titles: chunk.join('|') });
      const q = d.query ?? {};
      const norm = new Map<string, string>((q.normalized ?? []).map((x: any) => [x.from, x.to]));
      const red = new Map<string, { to: string; frag: string | null }>((q.redirects ?? [])
        .map((x: any) => [x.from, { to: x.to, frag: x.tofragment ?? null }]));
      const pages = new Map<string, any>((q.pages ?? []).map((p: any) => [p.title, p]));
      const cats = red.size ? await redirectCategories(en, [...red.keys()]) : new Map();
      for (const t of chunk) {
        const n = norm.get(t) ?? t;
        const r = red.get(n);
        const resolved = r?.to ?? n;
        const p = pages.get(resolved) ?? {};
        out.set(t, {
          enExists: !p.missing,
          faTitle: p.langlinks?.[0]?.title ?? null,
          viaRedirect: resolved !== t && !!r,
          ...(r ? { redirectFrom: n, redirectTo: r.to, redirectFragment: r.frag,
                    redirectCats: cats.get(n) ?? [] } : {}),
          enDisambig: p.pageprops?.disambiguation !== undefined,
          enItem: p.pageprops?.wikibase_item ?? null,
        });
      }
    }
    return out;
  };
}

/** Every category (hidden ones included — that is where rcats live) of these redirects. */
async function redirectCategories(en: ApiClient, titles: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  for (let i = 0; i < titles.length; i += 40) {
    const base = { action: 'query', prop: 'categories', cllimit: 'max',
      titles: titles.slice(i, i + 40).join('|') };
    let cont: Record<string, string> = {};
    do {
      const d = await en.apiGet({ ...base, ...cont });
      for (const p of d.query?.pages ?? []) {
        const got = out.get(p.title) ?? [];
        for (const c of p.categories ?? []) got.push(String(c.title).replace(/^Category:/, ''));
        out.set(p.title, got);
      }
      cont = d.continue?.clcontinue ? { clcontinue: d.continue.clcontinue, continue: d.continue.continue } : {};
    } while (cont.clcontinue);
  }
  return out;
}

/** Disambiguation flag and Wikidata item of fa titles (missing ones are simply absent). */
export function mediawikiFaInfo(fa: ApiClient): FaInfo {
  return async (titles: string[]) => {
    const out = new Map<string, { disambig: boolean; item: string | null }>();
    for (let i = 0; i < titles.length; i += 50) {
      const d = await fa.apiGet({ action: 'query', prop: 'pageprops',
        ppprop: 'disambiguation|wikibase_item', titles: titles.slice(i, i + 50).join('|') });
      for (const p of d.query?.pages ?? []) {
        if (p.missing) continue;
        out.set(p.title, { disambig: p.pageprops?.disambiguation !== undefined,
          item: p.pageprops?.wikibase_item ?? null });
      }
    }
    return out;
  };
}

/**
 * Which fa titles are really there.
 *
 * A Wikidata sitelink can outlive the article it points at, so a langlink hit is NOT
 * proof the fa page exists — `جولیا برونلی` was exactly that, and re-pointing to it would
 * have produced a red link out of a working English one.
 */
export function mediawikiFaExists(fa: ApiClient): FaExists {
  return async (titles: string[]) => {
    const live = new Set<string>();
    for (let i = 0; i < titles.length; i += 50) {
      const d = await fa.apiGet({ action: 'query', prop: 'info',
        titles: titles.slice(i, i + 50).join('|') });
      for (const p of d.query?.pages ?? []) if (!p.missing) live.add(p.title);
    }
    return live;
  };
}
