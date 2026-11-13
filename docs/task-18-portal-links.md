# وظیفهٔ ۱۸: افزودن پیوند درگاه به مقاله‌های وابسته

This task adds `{{درگاه|X}}` (or extends an existing `{{نوار درگاه|…}}`/`{{درگاه|…}}` call)
to an article that is clearly within a درگاه's subject but does not yet link it. It is a
**continuous** task: new articles join a portal's subject category every day, so the bot
round-robins through the portal list forever rather than trying to finish in one sweep.

## Status

- **Not filed yet.** Code, tests and a ۱۰۰-edit `--as-me` trial are the precondition for
  filing, per `BUILDING-A-TASK.md` §0 and §8. Nothing here runs under the bot account
  until a BRFA is approved.
- Draft request: `drafts/mamouribot/brfa-وظیفه-۱۸.txt` (companion repository).

## The standing rules this task is built around

1. **Avoid false positives completely, even at the cost of missing related articles.**
   Every scoping and screening choice below trades recall for precision on purpose.
2. **Ongoing, not a one-off.** New articles are added to portal subject categories all
   the time; the rotation design exists so the bot keeps noticing them without ever
   re-walking everything at once.
3. **Two portals are excluded outright**, by the operator's instruction, not by
   measurement: `درگاه:وقایع اتفاقیه` and `درگاه:سکس‌شناسی`. Listed in
   `src/tasks/task-18/data/excluded-portals.json`.
4. **A portal link a human already reverted on a given article must never be
   re-proposed there**, for that portal, ever again — see «The revert guard» below.

## Which portals are in the bot's rotation

`portal-scope.ts::discoverPortals()` walks every `درگاه:` main page (ns 100, not a
redirect, not a subpage) and keeps only the ones with an **exact-name subject category**
— `درگاه:X` is in scope only if `رده:X` exists. Measured live on a 2026-11 survey: fa has
about 200 portal main pages; the great majority name a category after themselves (`ایران`
→ `رده:ایران`, `فوتبال` → `رده:فوتبال`, `شاهنامه` → `رده:شاهنامه`, …), because that is
already fa's own naming convention for subject categories. A portal without a matching
category contributes zero candidates this run — not an error, just nothing to do yet.

**Why not a cleverer per-portal rule.** The decade-portal pipeline
(`scripts/portals/decade-scope.ts`) built hand-tuned WORKS/CONSUMER filters for decade
vocabulary («فیلم‌های دهه ۲۰۰۰», «اسباب‌بازی‌های دهه ۲۰۰۰», …). That does not generalise to
~150 arbitrary subjects without a human reviewing each portal's noise, which is exactly
the false-positive risk rule 1 rules out. The exact-name-category rule needs **no
per-portal tuning at all** — fa's own curation already did the work — so it is the one
rule that is safe to run unattended across the whole rotation.

The rotation list is **re-derived every run**, not cached: a new portal, or a subject
category created after the fact, enters the rotation on its own.

## Which articles are candidates, for one portal

`portal-scope.ts::portalCandidates()`:

- every ns-0 member of `رده:‹portal›` (depth 0), plus
- every ns-0 member of that category's **immediate** subcategories that pass **both** of
  two independent filters (depth 1). No deeper descent.

**Filter 1 — `isContainerCategory`.** The same KIND of exclusion `decade-scope.ts`
already uses for people-by-birth/death-year and pure geographic/temporal containers
(`بر پایه کشور`, `بر پایه دهه`, …), extended with `اهالی`/`افراد اهل` (residence) and
`مقاله‌های خرد`/`مقاله‌های درجه خرد` (the stub/quality-assessment subcategory every
portal's category has). Names **kinds** of category, never a topic.

**Filter 2 — `nameMentionsPortal`.** The subcategory's own title must contain the
portal's name as a substring.

**Both are needed — found by actually running the pre-approval trial, not assumed up
front.** The first version of this scope used filter 1 alone and, on its very first live
candidate pull (`درگاه:آرتساخ`), proposed the portal link on `امامقلی‌خان قاجار` — a
Qajar-era prince whose only connection is former *residence* in `رده:اهالی جمهوری
آرتساخ`, a subcategory filter 1 had not yet listed. Separately, `درگاه:تاریخ`'s own
subcategories include `رده:کاتولیک` and `رده:مسیحیت`, which carry **no name fragment at
all** connecting them to «تاریخ» — that is category-tree noise no exclude list can be
complete against, because it isn't a describable *kind*, it's a mis-threaded tree.
Filter 2 catches exactly that case, for free, with no list to maintain.

## The revert guard

Before a candidate is added to the worklist, `revert-guard.ts::portalWasRevertedHere()`
checks the article's recent revision history (default window: 100 revisions) for a
revision that is **itself a revert action** — MediaWiki's `mw-manual-revert` / `mw-undo`
/ `mw-rollback` tags, or an untagged edit whose summary is shaped like one (واگردانی،
برگردان، rv, …) — and confirms, by actually diffing that revision's content against its
parent, that the portal link (under its canonical name or a redirect) was lost there.

This is **not** "the portal was present once and is gone now" — that test has too many
innocent causes (an unrelated rewrite, a page blank-and-recreate). It is narrower: a
revision that is a revert action, and whose own diff removed the portal. That is a
stronger signal than the category-membership heuristic that put the article on the
worklist in the first place, so it overrides it.

A hit is recorded **permanently** in that portal's done-store
(`portal-done-store.ts`, `rejected-by-human:<revid>`) and the title is never reconsidered
for that portal again. This applies whether the edit that got reverted was the bot's own
or a human's — the operator's standing instruction is that the dispute, not the
disputant, is what matters.

The check runs **last**, after every free (missing/redirect/dab/already) screen has
already eliminated most candidates, because it costs a metadata-only history read per
survivor and a further two content reads only for the rare one that is actually
revert-shaped.

## The rotation (why 6 hours does not mean "survey every portal")

Surveying every portal's full candidate tree on every run is the slow path the operator
flagged. Instead:

- `PORTALS_PER_RUN` (default 6) portals advance per run, in a fixed alphabetical order
  with a persisted pointer (`rotation-state.ts`) that wraps around the list. At ~150–180
  portals in rotation, every portal gets a fresh look roughly once a day at the default
  schedule (every 6 hours × 4 runs/day × 6 portals/run ≈ 24/day).
- Within a chosen portal, `CANDIDATES_PER_PORTAL` (default 60) candidates are screened
  per run, from a per-portal cursor that also wraps — so a single huge portal (e.g.
  «ایران») cannot starve the OTHER portals chosen alongside it, and its own long tail is
  still eventually reached rather than only ever re-screening the alphabetically-first 60.
- The rotation pointer is saved **before** any network work for the chosen portals
  starts, so a crash mid-run advances the rotation rather than re-selecting the same
  portals forever.

Both numbers are environment overrides (`PORTALS_PER_RUN`, `CANDIDATES_PER_PORTAL`), not
constants, so the schedule can be tuned without a code change once real run times are
measured.

## Idempotency — why this task ignores core.ts's checkpoint

`ignoreCheckpoint: true`. core.ts's `done`/`deferred`/`clean` checkpoint parks a **title**
permanently once seen — correct for a task with one fixed worklist, wrong here: the same
article can be a genuine candidate for portal A this round and a *different* portal B on a
later round, and parking it after round one would hide it from every later portal. Instead
each portal keeps its own done-store (`out: .state/task-18/portal-done/<portal>.json`,
same shape as `scripts/portals/add-decade-portal-bar.ts`'s `bar-<decade>-done.json`),
keyed by title, recording `missing` / `redirect` / `dab` / `not-article` / `already` /
`rejected-by-human:<revid>`. A genuine "needs the link" candidate is **not** pre-recorded;
if the write succeeds, the next visit to that portal sees it via `hasPortal()` and the
done-store gains an `already` entry then (`report()`). If the write fails for any reason,
leaving it unwritten means it is simply reconsidered next time, which is correct — the
live page is the source of truth, not a write-outcome hook this task doesn't need.

## What it changes

`src/lib/portal-bar.ts` (vendored from `scripts/lib/portal-bar.ts`) does the insertion:

- extends an existing `{{درگاه|…}}`/`{{نوار درگاه|…}}` call rather than adding a second one;
- otherwise, under `== جستارهای وابسته ==` if that heading exists;
- otherwise, just above the first category;
- last resort, appended at the end of the page.

`portal-links.ts::addPortalLink()` refuses, rather than edits, when:

- the page is a `#تغییرمسیر`;
- the page is `{{ابهام‌زدایی}}`;
- the portal (or one of its redirects) is already linked — re-checked at write time
  against the text core.ts just fetched, because the scope pass can be minutes stale;
- the result would introduce a `~~~~` signature hazard.

Edit summary: `افزودن پیوند درگاه ‹portal›` (no claim about WHERE it landed, since that
depends on which of the four placements applied).

## Safety checks

- `transform()` is pure and synchronous; all network work is in `getTargets()`.
- `verify()` confirms the saved text actually carries the portal link (under its
  canonical name or a redirect) before the edit is allowed to count as done.
- The built-in render-error guard (before AND after saving) runs as for every task.
- `assert=user` + `assertuser=MamouriBot` on every write; `baserevid`/`basetimestamp` so a
  concurrent edit gives a conflict, never an overwrite.
- `maxlag=5`, `Retry-After` honoured, `کاربر:MamouriBot/توقف` read before every edit.
- Pre-approval trial runs `--as-me` (unflagged, visible in recent changes, 30–120s pacing
  per AGENTS.md) — see «Running it».

## Running it

```sh
npx tsx src/tasks/task-18/portal-links.test.ts        # pure wikitext decision, offline
npx tsx src/tasks/task-18/revert-guard.test.ts         # revert-action classifier, offline
npx tsx src/tasks/task-18/rotation-state.test.ts       # round-robin math, offline

npx tsx src/run.ts portal-links --limit 10             # dry run, no login, no writes
npx tsx src/run.ts portal-links --live --as-me --limit 25 --delay 30   # pre-approval trial
```

Pre-approval, this runs ONLY `--as-me`: unflagged edits under the operator's own account,
visible in recent changes, paced 30–120s. `--live` with the bot identity is not used until
a BRFA is approved for this scope.

## Open, before filing

- Run the 100-edit `--as-me` trial, read every diff and every rendered page, and include
  the real numbers (portals touched, candidates screened, edits made, revert-guard hits)
  in the BRFA rather than the estimates in this doc.
- Decide the production schedule once a trial run's wall-clock time is measured — the
  "every 6 hours" starting point in the request should match what `PORTALS_PER_RUN` ×
  `CANDIDATES_PER_PORTAL` actually costs in API calls, not a guess.
- No accumulating report page yet (`report()` only logs locally). Add one if a reviewer
  asks for a wiki-facing audit trail beyond the per-portal done-stores.

## Code

| file | what |
|---|---|
| `src/tasks/task-18/portal-links-task.ts` | the task (`portal-links`): rotation, screening pipeline, `getTargets`/`transform`/`verify`/`report` |
| `src/tasks/task-18/portal-scope.ts` | `discoverPortals()`, `portalCandidates()` — the scoping rule |
| `src/tasks/task-18/revert-guard.ts` | `portalWasRevertedHere()` — the permanent-exclusion check |
| `src/tasks/task-18/rotation-state.ts` | the round-robin pointer and per-portal cursor, persisted |
| `src/tasks/task-18/portal-done-store.ts` | per-portal done/rejected record |
| `src/tasks/task-18/portal-links.ts` | the pure add/refuse decision, and the edit summary |
| `src/tasks/task-18/data/excluded-portals.json` | the two portals excluded by operator instruction |
| `src/lib/portal-bar.ts` | vendored from `scripts/lib/portal-bar.ts` — the actual insertion logic |
| `toolforge/task-18-portal-links/` | `run.sh`, `jobs.yaml` |
