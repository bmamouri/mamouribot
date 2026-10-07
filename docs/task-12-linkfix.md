# وظیفهٔ ۱۲ — English-leftover links

Repairs links the mass imports left in English.

## Status: filed, permission deliberately WITHHELD pending three changes

`ویکی‌پدیا:سیاست ربات‌رانی/درخواست مجوز/MamouriBot/وظیفه ۱۲` was filed ۳ اکتبر ۲۰۲۶ and the
review replied the same day, declining to grant it «تا بهانه‌ای باشد» for three requests:

1. **Base the Python bots on pywikibot** rather than hand-rolling solved problems. This
   task's random 30–120s pacing was named specifically: pywikibot picks its delay from
   actual server load reported by the API, instead of guessing.
2. **Keep the code on GitHub, not inside the wiki**, suggesting the
   [PersianWikipedia/fawikibot](https://github.com/PersianWikipedia/fawikibot) project.
3. **Run it on Toolforge**, and give other maintainers access to the tool's home directory
   so they can fix things in place.

On point 1 the operator answered that some bots are TypeScript and the Python ones would be
migrated, and the review confirmed that scope: «برای همین گفتم که وقتش است که
**ربات‌های پایتون** خود را …», adding that point 2 applies to the TypeScript bots too.

**So this port is the answer to point 1**, in the form the reviewer allowed: the task is no
longer a hand-rolled Python bot, so pywikibot does not apply to it. Point 2 is satisfied by
this public repository. Point 3 is satisfied by `tools.mamouribot` — see `docs/TOOLFORGE.md`.

Worth stating in the follow-up: the framework does not rely on the random pause for server
courtesy. Every write carries `maxlag` and `core.ts` backs off and retries when the API
reports replication lag, which is the mechanism the review was pointing at.

Until the permission is granted this runs as the human operator (`--as-me`), never as the
bot. Research, measurements and the BRFA argument:
`research/english-link-sweep-automation.md` in the companion repo; the original request
text is `drafts/brfa-mamouribot-linkfix.wiki`.

## The three defect classes

| kind | example | repair |
|---|---|---|
| `latin_target` | `[[Antelope Valley]]` | fa article if one exists, else `[[:en:Antelope Valley|دره آنتلوپ]]` |
| `persian_digit_target` | `[[Area code ۳۲۳]]` — red on fa, absent from en | remap to the Latin twin, then as above |
| `latin_display` | `[[منطقه زمانی اقیانوس آرام|PST]]` | **counted only**, never rewritten |

`latin_display` is reported and never repaired: 13,204 articles carry it and the right
label is an editorial choice per row. `PST` may well want to stay a symbol — see
`lessons/persian-conventions/units-persian-name-latin-symbol-bdi.md`.

## The resolution ladder

From `lessons/persian-conventions/useful-redlink-repoint-not-strip.md`:

1. an fa article exists → re-point, Persian display
2. only an en article exists → `[[:en:Title|فارسی]]`
3. neither → unlinked Persian text

**The bot never invents a Persian name.** A name is either in `data/names.json`, curated
by a human, or the target goes to the review worklist untouched. Measured on a random
80-article sample that leaves ~45% of occurrences auto-fixable and sends ~55% to review,
and the permission request states that rather than letting the bot transliterate.

`data/names.json` has 357 entries seeded from the 185 pages done by hand on ۴ اکتبر ۲۰۲۶.
They are reviewed names, not guesses. Buckets: `fa` (fa article title), `en` (Persian label
for an interwiki), `plain` (Persian text where no article exists anywhere), `remap`
(Persian-digit target → Latin twin), `by_old_display` (`"Target||Old label"` → label, for
one target that means two different things).

## Running it

```sh
npx tsx src/tasks/task-12/linkfix.test.ts          # 39 offline assertions, no network

TARGET_CATEGORY='رده:شهرهای کالیفرنیا' npx tsx src/run.ts linkfix --limit 20
TARGET_TRANSCLUDING='الگو:…'           npx tsx src/run.ts linkfix
TARGET_FILE=/tmp/titles.json           npx tsx src/run.ts linkfix --live --as-me
```

Selectors are environment variables, not flags, for the reason the Python version
documented: the shell mangles Persian titles passed as arguments, and a 30-page run became
41 pages during testing. `TARGET_FILE` takes a JSON list or one title per line.

`LINKFIX_NAMES=/path/names.json` overrides the curated table at runtime, and
`LINKFIX_REPORT` the review worklist's path (default
`$BOT_STATE_DIR/linkfix-review.json`).

## The human in the loop

Every run writes the review worklist: each target it could not name, why, and which pages
it was seen on. A human adds names to `data/names.json` and the bot runs again. That loop
is the operating model, not a fallback.

```sh
python3 -c "import json;r=json.load(open('.state/linkfix-review.json'));\
print(r['review_count']);[print(k,'—',v['reason']) for k,v in list(r['review'].items())[:20]]"
```

The worklist is a local file, not an on-wiki page. A cumulative report page is easy to get
wrong — وظیفهٔ ۳ blanked its own worklist once, see `docs/task-03-trial-state.md` — and
there is no reason to create one before the task is approved to run.

## Safety rails, and why each one exists

- **dry-run by default**; `--live` is explicit, and `--as-me` while the permission is withheld.
- **`:en:` targets existence-checked on en** before any write. An interwiki to a missing
  page renders BLUE and lies: `:en:San Pedro station` pointed at a station in the
  Philippines. One bad target aborts the whole run, because it means the resolution data
  is wrong rather than one page being unlucky.
- **fa targets existence-checked on fa** — a Wikidata sitelink can outlive the article
  (`جولیا برونلی`), so a langlink hit is not proof the page is there.
- **fa-via-en-redirect is never auto-applied** — `Acquanetta Warren` redirects to the city
  she is mayor of, and re-pointing it is a wrong-topic blue link no red-link check catches.
- **`File:`/`رده:`/sister-project links are untouchable**
  (`lessons/routemap/link-sweep-must-exclude-file-namespace.md`).
- **the publish gate runs on the DIFF**, so a run fails on a problem the edit introduces,
  not on the thousands it inherits. A whole-text gate would block every edit on these
  pages and tempt someone to switch it off.
- **a red-link guard refuses the save** if the edit would add a content red link. This is
  the task's whole risk: `countErrorMarkers` in `core.ts` counts CS1 and Lua errors, and a
  red link is neither.
- **paced and resumable** by the shared framework: the human cadence under `--as-me`, and
  the resume checkpoint means an interrupted run costs nothing.

## What it deliberately does not do

No page creation, no renames, no template or module edits, and no rewording of a label
that is already Persian. Template-emitted English (`{{Representative|cacd|26}}` →
`Julia Brownley`, 3,840 articles) is invisible to a wikitext scan and belongs in a separate
module-side task, the same shape as the `Adjacent stations` data-module fix.

## The port from Python

This replaces `scripts/linkfix/` (`detect.py`, `resolve.py`, `rewrite.py`, `run.py`, 23
unittest cases), deleted in the same commit. Keeping both would have been two
implementations of one task plus two copies of a hand-curated name table, which is the
drift this repo keeps a byte-identical check for elsewhere.

The port was verified against the Python rather than assumed equivalent. Over a corpus of
120 real fa.wikipedia articles, with the network stubbed by deterministic synthetic
fixtures so every branch of the ladder is exercised:

| layer | result |
|---|---|
| detection | 827 findings, **120/120 pages byte-identical** |
| resolution | **133/133 targets identical**, review reasons included |
| rewrite | 202 links applied, **120/120 pages byte-identical** |

The comparison scripts are in `archive/` (git-ignored): `diff-against-python.ts`,
`diff-resolve-against-python.ts`, `diff-rewrite-against-python.ts`. They need the Python,
so they only run against a checkout that still has it — which is why the numbers above are
recorded here rather than left as a command to re-run.

### What changed on purpose

- **The red-link check moved pre-save.** The Python wrote the page, re-rendered it, and
  aborted the run if red links had risen — leaving the bad edit live on the article it had
  just damaged. The port implements the framework's `verify()` hook, so a page that would
  get worse is never saved.
- **Resolution happens in `getTargets()`.** The framework's `transform()` is synchronous
  and per page, but resolving needs the network and is only efficient in bulk. `getTargets`
  reads every candidate, resolves each distinct target once, caches the answers, and
  returns only the pages with an applicable repair; `transform` is then pure, which is what
  makes the offline tests possible.
- **A gate failure defers one page instead of killing the batch.** The Python raised
  `SystemExit` on the first page whose gate complained.
- **`names.json` is imported, not read from disk**, so it survives bundling into the single
  file a Toolforge job runs. Verified present in `toolforge/mamouribot.mjs`.
- **Identity, pacing, maxlag, the stop key and `{{nobots}}`** come from `core.ts` now
  instead of being re-implemented, which is most of what `run.py` was.
