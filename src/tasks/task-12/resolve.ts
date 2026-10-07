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
}
export type Lookup = (titles: string[]) => Promise<Map<string, LookupInfo>>;
/** Which of these fa titles really exist. */
export type FaExists = (titles: string[]) => Promise<Set<string>>;

/**
 * Injected rather than imported, so the whole class is testable against a plain Map with
 * no network at all. That is what makes the 23 offline tests possible.
 */
export class Resolver {
  constructor(
    private lookup: Lookup,
    private names: Names = loadNames(),
    private faExists?: FaExists,
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

    const out = new Map<string, Resolution>();
    for (const target of uniq) {
      const key = remap[target] ?? target;
      let [bucket, name] = this.curated(target);
      if (bucket === null && key !== target) [bucket, name] = this.curated(key);
      const { enExists, faTitle, viaRedirect } =
        info.get(key) ?? { enExists: false, faTitle: null, viaRedirect: false };

      if (faTitle && liveFa !== null && !liveFa.has(faTitle)) {
        out.set(target, { kind: REVIEW, reason:
          'langlink points at an fa title that does not exist (stale Wikidata sitelink)' });
        continue;
      }
      if (faTitle && viaRedirect) {
        out.set(target, { kind: REVIEW, reason:
          `fa target '${faTitle}' reached via an en redirect — verify it is the same subject` });
        continue;
      }
      if (faTitle) {
        out.set(target, { kind: FA, link: faTitle,
          display: bucket === FA ? name : faTitle, reason: 'fa article via langlink' });
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

/** `prop=langlinks&lllang=fa` on en.wikipedia, following redirects. */
export function mediawikiLookup(en: ApiClient): Lookup {
  return async (titles: string[]) => {
    const out = new Map<string, LookupInfo>();
    for (let i = 0; i < titles.length; i += 40) {
      const chunk = titles.slice(i, i + 40);
      const d = await en.apiGet({ action: 'query', prop: 'langlinks', lllang: 'fa',
        lllimit: '500', redirects: '1', titles: chunk.join('|') });
      const q = d.query ?? {};
      const norm = new Map<string, string>((q.normalized ?? []).map((x: any) => [x.from, x.to]));
      const red = new Map<string, string>((q.redirects ?? []).map((x: any) => [x.from, x.to]));
      const pages = new Map<string, any>((q.pages ?? []).map((p: any) => [p.title, p]));
      for (const t of chunk) {
        const n = norm.get(t) ?? t;
        const resolved = red.get(n) ?? n;
        const p = pages.get(resolved) ?? {};
        out.set(t, {
          enExists: !p.missing,
          faTitle: p.langlinks?.[0]?.title ?? null,
          viaRedirect: resolved !== t,
        });
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
