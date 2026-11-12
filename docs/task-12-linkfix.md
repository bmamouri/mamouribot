# وظیفهٔ ۱۲ — English-leftover links

Repairs links the mass imports left in English.

> **Status (۱۲ نوامبر ۲۰۲۶): APPROVED.** Huji granted {{مجوز دارد}} on ۹ اکتبر ۲۰۲۶ after
> the 50-edit trial. A scope extension is built and trialled (97 edits `--as-me`), follow-up posted and awaiting review; see
> [Extension: red links with a Persian article under another name](#extension-red-links-with-a-persian-article-under-another-name)
> at the end of this file. Until its follow-up is answered, the extension runs `--as-me` only.

## Status history: filed, permission first WITHHELD pending three changes

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

---

## Extension: red links with a Persian article under another name

**Status: built and trialled ۱۲ نوامبر ۲۰۲۶ (97 live edits `--as-me`); follow-up posted (rev 44966592), awaiting review.** Decided with the operator:
everything goes into ONE follow-up on the وظیفهٔ ۱۲ request (no new task number), posted in
its `===بحث===` section **without pinging anyone** — no `{{پینگ}}`, no `{{ب|…}}`, no user
link other than the signature. The draft goes to the companion repo's `drafts/` and is not
posted by an agent.

### The motivating case

«ایمانوئل ولیکوفسکی» has 23 content red links. `[[Prometheus Books]]` and
`[[American Association for the Advancement of Science]]` are red, but
`کتاب‌های پرومتئوس` and `انجمن پیشبرد علوم آمریکا` exist and are sitelinked to the same
Wikidata items. A dry run of the CURRENT code on that page (۱۲ نوامبر ۲۰۲۶) fixes 9 links
and defers 20 — so the ladder already finds them. What is wrong is the output, and what is
missing is coverage.

### Hard rules (from the operator)

1. **No false positives.** Uncertain means untouched and on the review list. Name
   similarity, transliteration and search hits are never evidence; only a Wikidata sitelink
   (en langlink → fa) plus an fa existence check is.
2. **A citation keeps its own language.** Repoint the target, keep the label:
   `[[Prometheus Books]]` → `[[کتاب‌های پرومتئوس|Prometheus Books]]`. No English redirects
   are created: وپ:تغن says non-Persian redirects «عموماً نباید ایجاد شوند», page creation
   is outside this task, and a redirect is a page someone then has to maintain.
3. Use `{{پیوند با میان‌ویکی}}` and `{{بت}}` as sources of the English name.
4. `{{بت}}` is being **retired** by its author (the operator). Convert it to
   `{{پیوند با میان‌ویکی}}` — but **only on pages the bot is already editing for a real
   repair**. No standalone conversion pass: a diff whose only effect is a template swap is
   the cosmetic-edit objection, and the operator chose to avoid it.
5. Cover article prose, infoboxes, templates (navboxes) and citations.

### What changes, as six numbered items (each separable in review)

| # | case | today | after |
|---|---|---|---|
| ۱ | **citation-context label** | `[[George O. Abell\|Abell, George O.]]` → `[[جرج آبل]]` — the author name in an English bibliography line turns Persian. **A defect in approved behaviour.** | Inside `<ref>…</ref>`, a `{{cite …}}`/`{{یادکرد …}}` call, a `{{چپ‌چین}}…{{پایان چپ‌چین}}` block, or a list item under «منابع»/«کتاب‌شناسی»/«برای مطالعهٔ بیشتر»: keep the Latin label (`[[جرج آبل\|Abell, George O.]]`). Prose and infobox keep the current Persian-label behaviour. Citation context also needs no names.json entry, so more links become fixable unattended. |
| ۲ | **safe en redirects** | every fa target reached through an en redirect is REVIEW (`Acquanetta Warren` → the city) | Auto only when the redirect is provably the same subject: (a) exact `Last, First [M.]` inversion of the target title, or (b) the en redirect carries one of `Redirects from alternative names`, `…from long names`, `…from short names`, `…from moves`, `…from other capitalisations`, `…from modifications` — **and** none of `…with possibilities`, `…from adjectives`, `…from members`, `…from subtopics`, `…to sections`, `…from related words`, `…from eponyms`. A redirect with a `#fragment` is always REVIEW. Measured: `Homeric`→Homer carries «from adjectives» and is refused; `John Wiley & Sons` carries «from long names» and passes. |
| ۳ | **citation parameters** | not scanned | `\|publisher=[[X]]`, `\|work=[[X]]`, `\|ناشر=[[X]]` etc. are ordinary links and follow ۱. `\|author-link=X` / `\|پیوند نویسنده=X` hold a BARE title: parameter-aware rewrite of the value only, never the visible `last=`/`first=`. |
| ۴ | **`{{پیوند با میان‌ویکی}}`** (and redirects `پبم`, `پم`, `Link-interwiki`, `Pam`; 7,397 articles) | not touched | If param 1 is red, param 2 (on `زبان=`, default en) resolves through the ladder to an existing fa X′ **and** X′ ≠ a disambiguation page → `[[X′\|<label>]]`, label = `عنوان=` if set, else param 1 (the editor's Persian wording is kept). |
| ۵ | **`{{بت}}`** (2,161 articles, 678 templates) | not touched | Same resolution as ۴ with `1=` / `en=`. Unresolved calls on an edited page are converted to `{{پیوند با میان‌ویکی}}` (rule 4). |
| ۶ | **template namespace** | excluded by the approved request | ns 10 navboxes and infobox wrappers, same rules. Skips `/توضیحات`, `/تمرین`, `/آزمایشی` subpages and any page whose edit returns `protectedpage`. Called out separately in the follow-up because it widens the approved «no template edits» line. |

Infoboxes need no separate code: a link in an infobox parameter is ordinary wikitext and
already scanned. Template-*emitted* English (`{{Representative}}`) stays out of scope.

### `{{بت}}` → `{{پیوند با میان‌ویکی}}` mapping

Verified by rendering both on ۱۲ نوامبر ۲۰۲۶ — identical article output:

| `{{بت}}` | `{{پیوند با میان‌ویکی}}` |
|---|---|
| `{{بت\|X\|en=Y}}` (83% of 2,618 sampled calls) | `{{پیوند با میان‌ویکی\|X\|Y}}` |
| `{{بت\|X\|L\|en=Y}}` (17%) | `{{پیوند با میان‌ویکی\|X\|Y\|عنوان=L}}` |
| `1=`/`2=` named forms | same, by value |

Known differences, each with a decision:

- the new template adds hidden «رده:مقاله‌های دارای پیوند با میان‌ویکی» in ns 0 and an
  «(en)» superscript outside ns 0 (so on a navbox's own page only). Intended behaviour.
- **REVIEW, not converted:** `۲=` (Persian-digit key) and `display=` — `{{بت}}` ignores both
  today, so converting would surface a label nobody has seen (6 of 2,618). No `en=` (3 of
  2,618): nothing to convert to. X starting with a real namespace prefix (`رده:`, `پرونده:`,
  `الگو:` …): `{{بت}}` colon-prefixes it, `{{پیوند با میان‌ویکی}}` does not, so the page
  would be CATEGORISED. An ordinary colon («لیگ عدالت: نفرین») is safe — test both.
- multi-line calls with spaced `| 1 = …` are the common shape; the parser takes top-level
  pipes only (nested `{{…}}`/`[[…]]` inside a value → REVIEW).
- when X is already blue: replace with `[[X|L]]` only if X and Y share a Wikidata item;
  otherwise convert and keep the English record. Blue-but-wrong exists:
  `{{بت|Walt Disney Records|en=Hollywood Records}}`.

### Refusal list — each one becomes a "must NOT change" test

| trap | seen on |
|---|---|
| label and `en=` name different subjects | `{{بت\|Walt Disney Records\|en=Hollywood Records}}` («شبکه دیزنی») |
| fa target is a disambiguation page (`pageprops.disambiguation`) | `BA` → fa `BA` («ریچارد بنتلی») |
| redirect changes the concept | `Homeric` → `هومر`, `historical philology` → `زبان‌شناسی تاریخی` |
| redirect to a section | any `tofragment` |
| en page missing or a disambiguation | 21 of 272 `{{پیوند با میان‌ویکی}}` calls in the sample |
| sitelink outlived the fa page | `جولیا برونلی` (existing rail) |
| `File:`/`رده:` links, image captions | existing rail |
| a citation label rewritten to Persian | the Abell line — the regression test for item ۱ |

Plus one new post-resolution check: after the rewrite, the fa target's
`wikibase_item` must equal the en source's item. A langlink is per-page and can be stale;
the pageprops on fa are what the reader actually lands on.

### Measured (۱۲ نوامبر ۲۰۲۶, 100 pages: 60 random from the pbm category, 40 random `{{بت}}`)

| | calls | already blue | red, fixable via langlink | red, via en redirect | red, en has no fa | en missing |
|---|---|---|---|---|---|---|
| `{{پیوند با میان‌ویکی}}` | 272 | 24 | 5 | 4 | 214 | 21 |
| `{{بت}}` | 1,047 | 112 | 25 | 7 | 890 | 12 |

So **~2.5% of red template calls** become fixable — low rate, large population. The
follow-up states the rate as measured. Script:
`archive/task12-ill-bt-sample.py` (git-ignored, local only).

### Measured (۱۲ نوامبر ۲۰۲۶) — `archive/task12-ext-measure.py`

Three samples, each link classified by where it sits (citation context vs prose) and what
its target resolves to. "fixable" = en page has an fa langlink, the fa page exists and is
not a disambiguation page.

| sample | pages | red Latin links | fixable direct | + via redirect gate | citation context |
|---|---|---|---|---|---|
| random ns 0 | 400 | 401 targets / 127 pages | 69 | 18 | 35 of 495 links (7%) |
| ns 0 with `{{چپ‌چین}}` and a Latin link | 300 | 837 targets / 106 pages | 129 | 26 | 288 of 1,048 (27%) |
| random ns 10 | 400 | 1,404 targets / 58 pages | 187 | 33 | 3 of 1,459 |

- **Item ۱ is real but concentrated**: in a random article only 7% of Latin links sit in
  a citation, but in articles with an English bibliography it is 27%, and that is where
  every shipped "author name turned Persian" diff came from. 22 of the 63 fixable citation
  links in the second sample carry a label the old code would have translated.
- **Item ۲ adds ~20%** on top of direct langlinks (18/69, 26/129, 33/187). Every
  accepted redirect in the samples carried «Redirects from moves», «…modifications»,
  «…short names» or «…other capitalisations»; the refused ones were «related words» and
  «subtopics» (Finnish paganism → Baltic Finnic paganism, Odinism → Heathenry). 5–14
  redirects per sample carry NO category at all and stay REVIEW
  (`Canadian Albums Chart` → `Billboard Canadian Albums`, `Hephthalite Empire` →
  `Hephthalites`) — some are the same subject, but nothing machine-readable says so.
  Wikidata aliases were checked as an alternative signal and rejected: `Finnish paganism`
  is an alias of the item it was refused for.
- **Item ۶ is the biggest single pool by yield**: 58 of 400 templates have a red Latin
  link, averaging 3.8 fixable each. Navboxes are transcluded, so one template edit fixes
  the link on every article that carries it.

### Build order

1. ✅ **Item ۱** (۱۲ نوامبر ۲۰۲۶). `foreign_text_spans` in `gates.py` is the single
   definition of "this Latin label is the source's own text" — the publish gate's
   `latin_display_label` exemption and the bot's keep-the-label rule both read it, so they
   cannot disagree. Widened from «`{{یادکرد}}` with non-Persian `زبان`» to: any citation
   template with a non-Persian language or (with none declared) English-only values; a
   `<ref>` whose visible text is English-only; a line in `{{چپ‌چین}}` or a list line under
   a bibliography heading whose visible text is English-only. Checked against the old gate
   on 400 live pages: 1,324 → 974 hits, **0 newly firing**, and all 30 sampled newly-exempt
   hits are labels in English-language references. Inside such a span only the fa re-point
   applies (label kept); an interwiki or plain-text repair there goes to REVIEW. 10 gate
   fixtures, 10 task tests. Dry run on «ایمانوئل ولیکوفسکی»:
   `[[George O. Abell|Abell, George O.]]` → `[[جرج آبل|Abell, George O.]]`,
   `[[Prometheus Books]]` → `[[کتاب‌های پرومتئوس|Prometheus Books]]`.
2. ✅ **Item ۲** (`resolve.ts::sameSubjectRedirect`). Accepted: an exact `Last, First`
   inversion, or a same-subject rcat (moves, modifications, short/long/full/former/
   alternative names, capitalisation, spelling, diacritics). Vetoed by any rcat matching
   `DIFFERENT_SUBJECT_RCAT` (possibilities, subtopics, members, adjectives, eponyms,
   related words, sections/anchors, ambiguous, «connected to a Wikidata item», works,
   people …), by a `#fragment`, and by an entry redirecting INTO a `List of …`
   (`Trout Lake Airport (Washington)` → `List of airports in Washington`, «moves» only).
   No rcat = REVIEW. Live check on 300 bibliography pages + 465 templates: 108 accepted,
   149 refused; every accepted one read by hand, the two wrong accepts above are now tests.
   Also new for every target, redirect or not: en disambiguation → REVIEW, fa
   disambiguation → REVIEW (`BA`), and the fa page's Wikidata item must equal the en
   page's (`mediawikiFaInfo`).
3. ✅ **Items ۳–۵** (`templates.ts`). `{{پیوند با میان‌ویکی}}` (+ پبم, پم, Link-interwiki,
   Pam) and `{{بت}}`: a red call whose en title resolves to fa X′ becomes `[[X′|label]]`,
   the label being `عنوان=`/`2=` or the call's own fa title. Refused: label and `en=`
   naming different subjects (a Latin «fa» title is resolved too and must land on the same
   X′), namespace prefix, nested markup, Persian-digit or unknown parameters, bare
   positional after `1=`, no en title, non-en `زبان`. `{{بت}}` → `{{پیوند با میان‌ویکی}}`
   **only** on a page with at least one real repair (the page's `applied` count excludes
   conversions, so a conversion can never be the reason an edit happens); such an edit
   gets its own summary via `perPageSummary`. CS1 `*-link` parameters (author/editor/
   translator/contributor/interviewer/subject/title/series/episode) hold a bare title,
   re-pointed in place; nothing visible moves. 28 tests in `templates.test.ts`.
4. ✅ **Item ۶**. `TARGET_NAMESPACE=0|10` widens the transclusion/category selectors;
   namespace is read from the API, never from the title (a colon is not a namespace).
   `/توضیحات`, `/تمرین`, `/آزمایشی`, `/doc`, `/sandbox`, `/testcases` are skipped. The
   first template dry run (465 random templates, 32 with a repair) found three faults,
   fixed and now tests: `[[Template:X|X]]`/`[[Help:…]]`/`[[Wikipedia:…]]` were treated as
   article links (the English namespace names joined `SKIP_PREFIXES`); a link inside
   `<nowiki>` in a doc example was re-pointed (opaque regions are now skipped); and a link
   inside an untranslated English sentence (`This user is a [[Citizenship|citizen]] of the
   …`) was re-pointed to a Persian title mid-English — `inEnglishProse` now defers those
   to whoever translates the template. A protected template is not special-cased: the
   edit returns `protectedpage`, core.ts defers that one page, the run continues.
5. ✅ **gateDiff fixed.** It compared gate MESSAGES before/after; a message quotes the
   text around each hit, so repairing a link beside an inherited em dash made the dash
   look new and refused «اریک هابسبام» and «شبکه دیزنی». It now compares per-audit hit
   counts (`audit_counts` in gates.py, `auditCounts` in gates.ts).
6. ✅ **No regression on approved behaviour.** The 49 pages of the October trial,
   resolved with the approved resolver and rewritten by the old and new `rewrite.ts`:
   48 byte-identical, 1 different — `| format = [[CSV]]` in an English citation keeps
   `CSV` as its label, which is item ۱ working. (`archive/task12-regress.ts`)
7. ✅ **The new scope is switched off for the bot.** `lf-trial` in
   `toolforge/task-12-linkfix/jobs.yaml` runs `--live` as MamouriBot, and without a gate
   it would now carry unapproved scope. `EXTENSION` (in `linkfix.ts`) turns on items ۲–۶
   only under `--as-me`, in a dry run (unless `LINKFIX_EXTENSION=0`, which previews the
   approved scope exactly), or with `LINKFIX_EXTENSION=1` — set that in `run.sh` **after**
   the follow-up is answered, not before. Item ۱ and the safety checks (dab, Wikidata item,
   project namespaces, `<nowiki>`, English prose, count-based gate) are always on: each
   only makes an edit smaller or refuses one, and item ۱ corrects the approved behaviour.
8. ✅ **Pre-run render check, 100 pages** (`archive/task12-render-check.ts`): every page
   rendered before and after; visible-text and red-link diff. Four faults found and fixed
   before any write: a Persian-digit fa target inside an English `{{cite}}` is converted to
   Latin digits by the module and renders RED («انقلاب‌های ۱۸۴۸»); a link whose fa article
   has the same title was "re-pointed" and lost its label (`[[R|Ʀʀ]]`); English text inside
   the `{{efn}}` a link sits in was not counted as context («انتخابات پارلمانی صربستان»);
   a Latin `{{بت}}` label fell back to the article title instead of the call's own
   Persian title. One flagged page was a FIX: a multi-line `{{بت}}` in a `<gallery>`
   caption printed `{{بت` literally, and the one-line conversion renders.
9. ✅ **Live trial, ۱۲ نوامبر ۲۰۲۶, `--as-me`, 100 pages chosen** (30 English-bibliography
   articles, 25 `{{بت}}` articles, 20 `{{پیوند با میان‌ویکی}}` articles, 25 templates).
   97 edits (23 templates), revs 44965886–44966456; 3 pages had nothing left. Verified
   from the wiki afterwards (`archive/task12-verify-live.py`, `task12-classify-live.py`):
   content red links 9,397 → 9,054, down on 89 pages, unchanged on 8 (their links were
   already blue via an en redirect, e.g. `[[Associated Press|…]]` in a citation), **up on
   none**; error markers up on none; no reverts; every edit by Mamouri. 120 links repaired
   with their English label kept, 199 template calls repaired, 23 citation `*-link`
   values, 1,702 `{{بت}}` replaced across 39 pages, 935 targets to review. Run data in
   `.state/task12-ext-run/` (git-ignored).
10. ✅ **Follow-up posted** ۱۲ نوامبر ۲۰۲۶ as `==== گسترش دامنه: … ====` at the end of the
    request page, rev 44966592, no pings (source: `drafts/brfa-task12-extension-followup.wiki`
    in the companion repo). Awaiting the reviewer. On approval: set `LINKFIX_EXTENSION=1`
    in `toolforge/task-12-linkfix/run.sh`, and only then let the bot run the new scope. an `--as-me` trial on the new cases
   only, and the follow-up draft in `drafts/`.

### Code map

| file | what |
|---|---|
| `scripts/lib/gates.py` (+ vendored copy) | `foreign_text_spans`, `audit_counts`, CLI modes `foreign` / `counts` |
| `src/lib/gates.ts` | `foreignSpans`, `linkContext` (foreign + opaque spans), `auditCounts` |
| `src/tasks/task-12/resolve.ts` | `sameSubjectRedirect`, `isNameInversion`, `mediawikiFaInfo`, redirect rcats in `mediawikiLookup` |
| `src/tasks/task-12/rewrite.ts` | kept label in foreign spans, `inEnglishProse`, opaque skip, count-based `gateDiff` |
| `src/tasks/task-12/templates.ts` | ILL / بت parsing, repair, conversion; CS1 `*-link` parameters |
| `src/tasks/task-12/linkfix.ts` | wiring, `TARGET_NAMESPACE`, `repairPage`, per-page summary |
