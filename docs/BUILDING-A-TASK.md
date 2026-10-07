# How to build a MamouriBot task

The conventions, the contract, and the traps. Every rule below has a failure behind it;
where the failure is recent and specific it is named, because a rule whose cost you can
see is one you will follow.

Read first: `../README.md` (layout, running, vendored helpers), `TOOLFORGE.md` (deployment),
`PACING.md` (why the bot waits what it waits). The repository-wide rules — Persian on-wiki,
no AI attribution, work on `main` — are in the companion repo's `AGENTS.md` and are not
repeated here.

---

## 0. Before writing any code

1. **Find the BRFA number and confirm it on-wiki.** Enumerate
   `ویکی‌پدیا:سیاست ربات‌رانی/درخواست مجوز/MamouriBot/` and read the request for the number
   you think you want. A `task-NN/` directory in this repo is a *filing decision*, not an
   approval: `src/tasks/task-04/citation-dedup-accessdate.ts` says "Task 4 (addition)" in
   its own header and was never filed anywhere, which once led to telling a reviewer that
   work was covered by a permission that did not cover it. See
   `lessons/api-and-permissions/repo-folder-is-not-the-approved-scope.md`.
2. **Read the request's `===بحث===` section, not just the proposal.** وظیفهٔ ۱۲ was
   declined with three specific requests attached; working from the proposal alone would
   have missed all of them, and one of them was already satisfied.
3. **Check whether the thing is approved, and for what scope.** If the task is unapproved,
   or your work widens an approved scope, it runs under `--as-me` (the human operator) and
   not as the bot, until the request says otherwise.
4. **Measure the population before designing.** Sample a few hundred real pages and
   classify them. Every design decision below gets easier with a distribution in hand, and
   the estimates in a hand-written spec are usually wrong: a spec saying "~4% already have
   the box, ~95% have the exact section" measured out at 6.3% and 89.5%.

## 1. Where the files go

The BRFA number is the index across the whole tree, zero-padded:

```
src/tasks/task-NN/<name>.ts          the BotTask
src/tasks/task-NN/<name>.test.ts     its tests, beside it
src/tasks/task-NN/data/*.json        curated data the task needs
docs/task-NN-<name>.md               what it does, decisions, open defects
toolforge/task-NN-<name>/            run.sh + jobs.yaml for deployment
```

Register the task in `src/run.ts`'s `TASKS` map. That is the whole wiring; `run.ts` gives
you dry-run-by-default, `--live`, `--as-me`, `--limit`, `--delay` and `--check` for free.

`archive/` is git-ignored and is where one-off probes, measurement scripts and
differential checks belong. They are not part of the build and `tsconfig.json` excludes
them deliberately.

## 2. The contract

```ts
export interface BotTask {
  id: string;            // the CLI name: npx tsx src/run.ts <id>
  taskNumber: number;    // the BRFA number
  summary: string;       // the EDIT SUMMARY. Persian, content-only, under ~150 chars
  description: string;   // Persian, for logs and report pages

  recheckAfterDays?: number;  // let a done page be re-examined later
  createsMissing?: boolean;   // this task's job is to CREATE pages

  getTargets(bot: Bot): Promise<string[]>;
  transform(text: string, title: string):
    { text: string; changed: boolean; note?: string; manualReview?: boolean };
  verify?(bot, title, oldText, newText): Promise<{ ok: boolean; detail: string }>;
  report?(bot, dryRun: boolean): Promise<void>;
}
```

### `summary` — this is on-wiki text

Persian, first person where it reads naturally, describing **the content change only**.
Never the script, the batch, the migration or the task machinery. Keep it under ~150
characters: AbuseFilter 221 warns on long summaries, and a `warn` clears by re-submitting
once, which `core.ts` already handles.

### `getTargets` — also the right place for bulk network work

It is `async` and runs once before anything else, which makes it the only hook that can do
batched lookups. وظیفهٔ ۱۲ resolves every link target there — one `prop=langlinks` request
covers 40 targets shared across dozens of articles — caches the answers, and returns only
the pages that have an applicable repair. `transform` is then pure, which is what makes
offline tests possible at all.

Take selectors from **environment variables**, not argv: the shell mangles Persian titles
passed as arguments, and a 30-page run became 41 pages that way. Established names:
`TARGET_TITLES` (pipe-separated), `TARGET_FILE` (JSON list or one per line),
`TARGET_CATEGORY`, `TARGET_TRANSCLUDING`, `TARGET_CAP`.

Derive a candidate cap from `bot.opts.limit` rather than enumerating everything. One task's
search terms matched ~340,000 pages, which is fourteen minutes of enumeration before the
first edit.

### `transform` — pure, synchronous, and must be able to say "no"

Return `changed: false` for anything you are not certain about. `manualReview: true` marks
it as needing a human and feeds the counter in the run summary. **Leaving a defect in place
is always better than guessing at it**, and a task that cannot say no is not approvable.

Never rewrite a whole article. Splice the minimum.
(`lessons/scripts-and-batch/never-wholesale-replace-article.md`)

### `verify` — your task's own risk, checked PRE-save

`core.ts` already counts CS1 and Lua errors before and after. If your task's real risk is
something else, that belongs here. وظیفهٔ ۱۲'s risk is red links — `countErrorMarkers`
counts neither — so it renders both versions and refuses the edit if content red links
rose.

**Pre-save, not post-save.** The Python version of that task wrote the page, re-rendered
it, and aborted the *run* if red links had risen — leaving the bad edit live on the article
it had just damaged.

### `report` — publishing what the task refused to do

A task that declines work silently is indistinguishable from a task with nothing to do.
وظیفهٔ ۱۱ ran live, set 119 items aside, and left its report page still saying the bot had
not run yet. The refusals are the part a human acts on.

**If the page is cumulative, it needs a store, and the store needs a guard.** Publishing a
cumulative page is a wholesale replacement of a worklist built over many runs. A run from a
laptop whose state directory had no copy of the store took a 41,646-byte page down to 972
bytes and lost all 38 articles on it, because `loadStore()` returning `[]` means both
"nothing pending" and "no copy here". Distinguish those two, and refuse to overwrite when
the store is absent. See `src/tasks/task-03/review-store.ts`.

Two more things that page taught: **wrap URL values in `<nowiki>`** (the spam blacklist
refused the save because the values quoted `archive.today`, and the page was also
generating 164 live external links), and **a quoted em dash is not yours** — the publish
gate rightly rejects `—` in authored Persian, but a value quoted verbatim from an article
may contain one, so emit it as an entity rather than changing the quotation.

## 3. What `core.ts` already does — do not reimplement

Identity (`assert=user` + `assertuser`, re-login on `assertuserfailed`), `maxlag` with
`Retry-After` honoured, the pacer, `{{nobots}}`, the on-wiki stop page, the resume
checkpoint, edit-conflict protection via `baserevid`, the abuse-filter re-submit, `Ctrl-C`
finishing the current page, post-save render verification with self-revert, and the
concurrent-run rate sharing.

Re-implementing any of it is what the وظیفهٔ ۱۲ review objected to: «یک سری مسائلی که از
پیش حل شده را دوباره دارید حل می‌کنید».

Cross-wiki reads go through `bot.apiGetOn(API, params)` so the UA, retry and burst gate
cannot drift from the main client. The UA is identity-sensitive: the bot self-identifies,
the human account uses the browser string, and `core.ts` picks the right one.

## 4. Tests

Plain `tsx` scripts that exit non-zero on failure — no framework. `npm test` walks `src/`
and runs **every `*.test.ts`** and **every `test_*.py`**, and nothing in that run may touch
the network. Files named `*.trial.ts` or `*.replay.ts` are deliberately excluded: they need
the network and are kept beside the task as the evidence it was verified with.

Write the test for the boundary, not the happy path. The useful ones here are all of the
form "this exact input must NOT be changed":

- a `File:`/`رده:`/interwiki link is never touched
- a `px` size is not mistaken for an English label
- `page` and `pages` are different fields and must both survive
- a lone valid parameter is left alone, because renaming it would be cosmetic churn on
  every citation on the wiki

**A zero needs a positive control.** A sweep reporting "no defects found" and a sweep that
exited early look identical. One dry run here returned zero candidates and the cause was an
empty category, which is only knowable by checking that the selector matches *something*.
(`lessons/verification-and-gates/a-zero-needs-a-positive-control.md`)

**When porting, diff against the original.** The وظیفهٔ ۱۲ port was checked over 120 real
articles with the network stubbed by deterministic fixtures: detection 827 findings and
120/120 pages byte-identical, resolution 133/133 targets identical including the review
reason strings, rewrite 202 links and 120/120 identical. Unit tests would not have caught a
regex that anchors differently between Python and JavaScript.

## 5. The publish gate

```ts
import { gateOrThrow } from '../../lib/gates.js';   // or checkWikitext for the list
gateOrThrow(title, wikitext);
```

Every check in `gates.py` corresponds to a defect that already shipped to a live page, and
**none of them raises an error on-wiki** — no CS1 error, no tracking category, no red link
— so they cannot be found by testing or by reading the render.

Run it before **every** publish, not just article edits. The script that replaced ten
on-wiki code pages did not call it and shipped em dashes to all ten.
(`lessons/verification-and-gates/gate-is-for-every-publish-not-just-articles.md`)

For pages carrying thousands of inherited defects, gate the **diff** rather than the text:
report only problems the edit introduces. A whole-text gate on those pages blocks every
edit and tempts someone to add a skip flag, which is how a real check gets switched off.
See `rewrite.ts::gateDiff` in `src/tasks/task-12/`.

## 6. Verify by rendering, and know which render

```
action=parse&prop=text|categories   then grep for
  scribunto-error   class="error   cs1-visible-error   redlink=1   نامعلوم
```

`class="` must be part of the pattern: the bare name also appears in the TemplateStyles
block that defines its colour, giving every page a constant phantom error count.

**`parse&page=`/`&oldid=` and `parse&text=` disagree on identical bytes.** Measured: the
same 108,226 bytes gave 4 `cs1-visible-error` spans by `oldid=` and 2 by `text=`. A
pre-save check has no revision to parse, so it can only use `text=` — which is exactly why
وظیفهٔ ۳ has a post-save guard that self-reverts, and why a defect it chases is not
reproducible offline. Never conclude a parameter name or value works by reading a config
table; render it and look.

## 7. Bundling and deployment

`npm run bundle` — never esbuild by hand. The `__BUNDLED__` define is not optional, and the
builder asserts it took effect. Read `TOOLFORGE.md` before deploying; its four gotchas
(jobs start in the tool home, job logs append, `node` is absent from the bastion, esbuild
escapes non-ASCII so grepping a bundle for Persian finds nothing) each cost a debugging
round.

A task registered in `run.ts` needs **no** bundle entry: it is already inside
`dist/bot-run.mjs`. Add an entry only for a separate on-box job, and then it needs a thin
CLI file calling `run()` **unconditionally** — inside a solo bundle `isMain()` is false
everywhere, so a guarded `main()` never runs and the job exits 0 having done nothing.

Import JSON data (`import names from './data/names.json' with { type: 'json' }`) rather
than reading it from disk, so it survives bundling; `import.meta.url` inside a bundle
resolves to `dist/`. Allow an env override for data a human curates, so the
report-add-names-rerun loop does not need a rebuild each time.

## 8. Getting it approved

1. **Dry run** and read the diffs. `--limit 20` first.
2. **Measure**, then write the request from the measurements. Copy the structure of the
   last accepted request verbatim; machine-uniform formatting is what exposes an agent,
   not the prose. The task's sub-sections must be `===`, never `==`, because the page is
   transcluded into the request queue where a `==` becomes a sibling of the request itself.
   (`lessons/api-and-permissions/brfa-subsection-must-be-level-three.md`)
3. **Trial under `--as-me`** if the scope is not yet approved. Those edits are not bot
   edits: unflagged, visible in recent changes, paced to the human 30–120s.
4. **Report the trial honestly**, including what went wrong. State the regression rate, the
   cause if known and that it is unknown if not, and every deviation from what the request
   described. A reviewer finds these anyway, and being caught understating one costs more
   than the admission.
5. The talk gate helps: `gates.check_talk_reply()` enforces a 400-word prose cap and
   catches bold-only pseudo-headings. It will make you cut, and the cut version is better.

Drafts go to the companion repo's `drafts/` and are **not posted** by the agent.

## 9. Traps that are not about bot code

- **The git index is shared.** Several agents work this one checkout. `git rm` stages into
  that shared index, and another agent's commit swept a deletion of mine into their commit
  with an unrelated message. Never use a directory-wide `git add`; stage explicit paths.
  Once I staged another agent's untracked work by running `git add scripts/archive/`.
- **Work on `main`.** Do not branch; the other agents will not see it.
- **`.gitignore` has a blanket `data/` rule** in the companion repo. A 357-entry
  hand-curated name table lived in `scripts/linkfix/data/` and was therefore in **no commit
  anywhere** — only on one laptop. Check `git ls-files` on any data file you are relying on.
- **Don't take article titles from WDQS `schema:name`** — it strips the ZWNJ. Zero of
  17,271 Persian settlement titles came back containing U+200C, against 58 of 400 via the
  Wikidata API. Every such title then 404s, so the symptom presents as "14% of candidate
  articles are missing", which is believable enough to act on. Use
  `wbgetentities&props=sitelinks`.
- **A Persian heading has variants.** `== جمعیّت ==` with a shadda is visually
  near-identical to `== جمعیت ==` and misses an exact-match regex, so a bot that "creates
  the section when missing" gives those articles two. Likewise a heading can be wrapped in
  a wikilink.
- **A substring is not a structural test.** Checking for `جمعیت تاریخی` matches the words in
  prose as well as the template call.

## 10. Checklist

- [ ] BRFA number confirmed on-wiki, and the `بحث` section read
- [ ] population measured on a real sample, not estimated
- [ ] `src/tasks/task-NN/`, tests beside it, registered in `run.ts`
- [ ] `docs/task-NN-*.md` records what it does and every decision taken with the operator
- [ ] Persian summary, content-only, under ~150 chars
- [ ] `transform` is pure and can return `changed: false`
- [ ] the task's own risk has a `verify` that refuses pre-save
- [ ] refusals are published or written out, and a cumulative page has a store with a guard
- [ ] `npm test` green, including the vendored-copy check
- [ ] `npm run bundle` green, all gates
- [ ] dry-run diffs read by a human
- [ ] rendered before/after compared on real pages
- [ ] nothing re-implements what `core.ts` already does
