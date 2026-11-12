# How to build a MamouriBot task

The conventions, the `BotTask` interface, and the mistakes I have already made with it.
Where a rule comes from a specific failure, the failure is named.

Read first: `../README.md` (layout, running, vendored helpers), `TOOLFORGE.md` (deployment),
`PACING.md` (how the bot decides how long to wait). The rules for the whole companion
repository (Persian on the wiki, work on `main`) are in its `AGENTS.md` and are not repeated
here.

---

## 0. Before writing any code

1. **Find the permission-request number and confirm it on the wiki.** List
   `ویکی‌پدیا:سیاست ربات‌رانی/درخواست مجوز/MamouriBot/` and read the request for the number
   you have in mind. A `task-NN/` directory in this repository is a filing decision, not an
   approval. `src/tasks/task-04/citation-dedup-accessdate.ts` says "Task 4 (addition)" in
   its header and was never filed anywhere, and I once told a reviewer that work was
   covered by a permission that did not cover it. See
   `lessons/api-and-permissions/repo-folder-is-not-the-approved-scope.md`.
2. **Read the request's `===بحث===` section as well as the proposal.** وظیفهٔ ۱۲ was held
   back with three specific requests attached. Working from the proposal alone would have
   missed all three, and one of them was already done.
3. **Check whether the task is approved, and for what scope.** If it is not approved, or
   your work goes beyond the approved scope, run it under `--as-me` (my own account) rather
   than as the bot until the request says otherwise.
4. **Measure the pages before designing.** Sample a few hundred real pages and sort them
   into cases. Every decision below is easier with real numbers, and estimates in a
   hand-written spec are usually wrong: one spec said "~4% already have the box, ~95% have
   the exact section", and the measured figures were 6.3% and 89.5%.

## 1. Where the files go

The permission-request number, zero-padded, ties the files together:

```
src/tasks/task-NN/<name>.ts          the BotTask
src/tasks/task-NN/<name>.test.ts     its tests, beside it
src/tasks/task-NN/data/*.json        curated data the task needs
docs/task-NN-<name>.md               what it does, decisions, open defects
toolforge/task-NN-<name>/            run.sh + jobs.yaml for deployment
```

Register the task in the `TASKS` map in `src/run.ts`. That is all the wiring there is.
`run.ts` gives you dry run by default, `--live`, `--as-me`, `--limit`, `--delay` and
`--check`.

A new task does not need a new Toolforge tool. There is one, `mamouribot`, and each task is
a directory and a job inside it. The quota is far from full: 4 of 50 cron definitions were
in use on ۸ اکتبر ۲۰۲۶. See `TOOLFORGE.md`.

`archive/` is git-ignored and holds one-off probes, measurement scripts and comparison
checks. They are not part of the build, and `tsconfig.json` excludes them.

## 2. The interface

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

### `summary`: this text appears on the wiki

Write it in Persian, in the first person where that reads naturally, and describe only the
change to the content. Don't mention the script, the batch, the migration or how the task
works. Keep it under about 150 characters: AbuseFilter 221 warns on long summaries, and a
warning clears when the edit is submitted again, which `core.ts` already does.

Don't put the task number in it. `core.ts` starts every bot edit summary with a link to the
permission that covers it, built from `taskNumber`:

```
[[ویکی‌پدیا:سیاست ربات‌رانی/درخواست مجوز/MamouriBot/وظیفه ۳|ربات]]: <your summary>
```

That is how bots on both wikis do it. I sampled live recent changes on ۸ اکتبر ۲۰۲۶: of 500
en.wikipedia bot edits, none wrote "Task N" as text, and 211 linked the approval on the word
"Bot" (`[[Wikipedia:Bots/Requests for approval/VWF bot 6|Bot]]: …`). fa follows the same
pattern: `[[ویکی‌پدیا:رده‌دهی مقالات همسنگ|ربات]]: …` from HujiBot, `[[وپ:دار|ربات: انتقال رده]] …`
from Dexbot. A bare number tells a reader nothing, while a link takes them to the approval
in one click for the same number of characters.

`core.ts` also handles these:

- a summary that already starts with «ربات:» doesn't get it twice;
- the permission page is checked once per run, and if it does not exist the link is left
  out with a warning. Otherwise an unfiled task would put a red link in every summary, and
  nothing else here checks for that. وظیفهٔ ۱۳ and ۱۴ are in that state today;
- a `--as-me` run never gets the link. Those edits are not bot edits, and they usually
  happen because the bot is not yet approved for that scope, so linking the permission
  would misstate who made the edit.

See `src/brfa.ts`.

### `getTargets`: also where bulk network work goes

It is `async` and runs once before anything else, so it is the only place that can do
batched lookups. وظیفهٔ ۱۲ looks up every link target there (one `prop=langlinks` request
covers 40 targets shared across dozens of articles), caches the answers, and returns only
the pages that have something to fix. `transform` then needs no network, which is what
makes offline tests possible.

Take page selectors from environment variables, not command-line arguments. The shell
mangles Persian titles passed as arguments, and a 30-page run once became 41 pages that way.
The names in use are `TARGET_TITLES` (pipe-separated), `TARGET_FILE` (JSON list or one per
line), `TARGET_CATEGORY`, `TARGET_TRANSCLUDING` and `TARGET_CAP`.

Work out a cap on candidates from `bot.opts.limit` instead of listing everything. One task's
search terms matched about 340,000 pages, which took fourteen minutes to list before the
first edit.

### `transform`: no network, no waiting, and able to say no

Return `changed: false` for anything you are not sure of. `manualReview: true` marks a page
as needing a person and adds it to the count in the run summary. Leaving a defect in place
is always better than guessing, and a task that can never decline is not one I can get
approved.

Don't rewrite a whole article. Change the smallest part you can.
(`lessons/scripts-and-batch/never-wholesale-replace-article.md`)

### `verify`: check the task's own risk before saving

`core.ts` already counts CS1 and Lua errors before and after. If your task's real risk is
something else, check it here. For وظیفهٔ ۱۲ the risk is red links, which
`countErrorMarkers` does not count, so it renders both versions and refuses the edit if the
number of content red links went up.

Check before saving. The Python version of that task saved the page, rendered it again,
and stopped the run if red links had gone up, which left the bad edit on the article.

### `report`: publish what the task declined to do

A task that declines work without saying so looks the same as a task with nothing to do.
وظیفهٔ ۱۱ ran live, set 119 items aside, and its report page still said the bot had not run
yet. The declined items are the ones a person needs to act on.

If the report page builds up over many runs, it needs a stored copy of the list, and the
code must check that the stored copy is there. Publishing such a page replaces a list built
over many runs. A run from a laptop whose state directory had no copy of the list cut a
41,646-byte page down to 972 bytes and lost all 38 articles on it, because `loadStore()`
returned `[]` both for "nothing pending" and for "no copy here". Tell those two apart, and
refuse to publish when the copy is missing. See `src/tasks/task-03/review-store.ts`.

The same page showed two more things. Wrap URL values in `<nowiki>`: the spam blacklist
refused the save because the values quoted `archive.today`, and the page was also creating
164 live external links. And a quoted em dash has to be kept: the publish check correctly
rejects `—` in Persian I write, but a value quoted from an article may contain one, so
write it as an HTML entity instead of changing the quotation.

## 3. What `core.ts` already does

Identity (`assert=user` + `assertuser`, logging in again on `assertuserfailed`), `maxlag`
and `Retry-After`, the pacing, `{{nobots}}`, the stop page on the wiki, the resume
checkpoint, edit-conflict protection via `baserevid`, resubmitting after an AbuseFilter
warning, `Ctrl-C` finishing the current page, checking the render after saving and
reverting itself if needed, sharing the edit rate between runs, and the permission link in
every edit summary.

Don't write any of these again. Doing that was what Huji objected to in the وظیفهٔ ۱۲
review: «یک سری مسائلی که از پیش حل شده را دوباره دارید حل می‌کنید».

Reads from other wikis go through `bot.apiGetOn(API, params)`, so the user agent, retries
and request limits stay the same as the main client. The user agent depends on the account:
the bot identifies itself, my own account uses the browser string, and `core.ts` picks the
right one.

## 4. Tests

Tests are plain `tsx` scripts that exit non-zero on failure, with no framework. `npm test`
goes through `src/` and runs every `*.test.ts` and every `test_*.py`, and none of them may
use the network. Files named `*.trial.ts` or `*.replay.ts` are left out because they need
the network; they stay beside the task as the record of how it was checked.

Test the edges rather than the normal case. The useful tests here all say "this exact input
must not change":

- a `File:`/`رده:`/interwiki link is never touched
- a `px` size is not mistaken for an English label
- `page` and `pages` are different fields and both must survive
- a single valid parameter is left alone, because renaming it would be a cosmetic change
  on every citation on the wiki

Check that a zero result is real. A sweep that found no defects and a sweep that stopped
early look the same. One dry run here found no candidates because the category was empty,
and the only way to know is to check that the selector matches something.
(`lessons/verification-and-gates/a-zero-needs-a-positive-control.md`)

When porting, compare against the original. I checked the وظیفهٔ ۱۲ port on 120 real
articles with the network replaced by fixed test data: finding links gave 827 results and
120 of 120 pages byte-identical, deciding gave 133 of 133 targets identical including the
reasons, and rewriting changed 202 links with 120 of 120 pages identical. Unit tests would
not have caught a regex that anchors differently in Python and JavaScript.

## 5. The publish check

```ts
import { gateOrThrow } from '../../lib/gates.js';   // or checkWikitext for the list
gateOrThrow(title, wikitext);
```

Every check in `gates.py` comes from a defect that already reached a live page, and none of
them shows an error on the wiki (no CS1 error, no tracking category, no red link), so they
can't be found by testing or by reading the rendered page.

Run it before every publish, not only article edits. The script that replaced ten code
pages on the wiki did not call it and put em dashes on all ten.
(`lessons/verification-and-gates/gate-is-for-every-publish-not-just-articles.md`)

On pages that already carry thousands of old problems, check only what the edit changes
and report only the problems it adds. Checking the whole text on those pages blocks every
edit, and sooner or later someone adds a flag to skip the check. See `rewrite.ts::gateDiff`
in `src/tasks/task-12/`.

## 6. Check by rendering, and know which render you are looking at

```
action=parse&prop=text|categories   then grep for
  scribunto-error   class="error   cs1-visible-error   redlink=1   نامعلوم
```

Include `class="` in the pattern. The bare class name also appears in the TemplateStyles
block that sets its colour, which gives every page the same false error count.

`parse&page=`/`&oldid=` and `parse&text=` can give different results for the same text.
The same 108,226 bytes gave 4 `cs1-visible-error` spans with `oldid=` and 2 with `text=`. A
check before saving has no revision to parse, so it can only use `text=`. That is why
وظیفهٔ ۳ also checks after saving and reverts itself, and why the defect that check looks
for can't be reproduced offline. Don't decide that a parameter name or value works by
reading a configuration table; render it and look.

## 7. Bundling and deployment

Use `npm run bundle`, never esbuild by hand. The bundle needs the `__BUNDLED__` define, and
the build script checks that it took effect. Read `TOOLFORGE.md` before deploying. Each of
its four warnings (jobs start in the tool home, job logs append, `node` is not installed on
the bastion, esbuild escapes non-ASCII so a bundle can't be searched for Persian text) cost
me a round of debugging.

A task registered in `run.ts` needs no bundle entry of its own, because it is already in
`dist/bot-run.mjs`. Add an entry only for a separate job on the tool, and give it a small
CLI file that calls `run()` without any condition. Inside a single-file bundle `isMain()` is
always false, so a `main()` behind that check never runs and the job exits 0 having done
nothing.

Import JSON data (`import names from './data/names.json' with { type: 'json' }`) instead of
reading it from disk, so it ends up in the bundle; inside a bundle `import.meta.url` points
to `dist/`. Allow an environment variable to override data I maintain by hand, so that the
cycle of reading the report, adding names and running again does not need a rebuild each
time.

## 8. Getting it approved

1. **Dry run** and read the diffs, with `--limit 20` first.
2. **Measure**, then write the request from the measurements. Copy the structure of the
   last accepted request. The task's subsections must be `===`, never `==`, because the page
   is transcluded into the request queue, where a `==` heading sits at the same level as the
   request itself.
   (`lessons/api-and-permissions/brfa-subsection-must-be-level-three.md`)
3. **Trial under `--as-me`** if the scope is not approved yet. Those are not bot edits: they
   are unflagged, show in recent changes, and are paced at the human 30–120s.
4. **Report the trial in full**, including what went wrong: how often it made things worse,
   the cause if I know it and that I don't if I don't, and every way the run differed from
   the request. A reviewer will find these anyway, and being caught playing one down costs
   more than saying it.
5. `gates.check_talk_reply()` limits the prose to 400 words and catches bold lines used as
   headings. It usually makes me cut, and the shorter version reads better.

Drafts go in the companion repository's `drafts/`, and I post them myself.

## 9. Mistakes that have nothing to do with bot code

- **The git index is shared.** Several sessions work in the companion repository's one
  checkout at the same time. `git rm` stages into that shared index, and another commit once
  picked up a deletion of mine under an unrelated message. Don't use `git add` on a whole
  directory; stage the paths you mean. I once staged someone else's untracked work by
  running `git add scripts/archive/`.
- **Work on `main`.** Don't branch, or the other sessions won't see the work.
- **The companion repository's `.gitignore` ignores every `data/` directory.** A hand-made
  table of 357 names lived in `scripts/linkfix/data/` and so was in no commit at all, only
  on one laptop. Run `git ls-files` on any data file you depend on.
- **Don't take article titles from WDQS `schema:name`.** It strips the ZWNJ. None of 17,271
  Persian settlement titles came back with U+200C, against 58 of 400 through the Wikidata
  API. Every such title then returns 404, so it looks like "14% of candidate articles are
  missing", which is believable enough to act on. Use `wbgetentities&props=sitelinks`.
- **A Persian heading can be spelled more than one way.** `== جمعیّت ==` with a shadda looks
  almost the same as `== جمعیت ==` but does not match an exact regex, so a bot that "adds
  the section when it is missing" gives those articles two. A heading can also be wrapped in
  a wikilink.
- **Finding a substring does not tell you the structure.** Searching for `جمعیت تاریخی`
  matches the words in ordinary text as well as the template call.

## 10. Checklist

- [ ] permission-request number confirmed on the wiki, and the `بحث` section read
- [ ] pages measured on a real sample, not estimated
- [ ] `src/tasks/task-NN/`, tests beside it, registered in `run.ts`
- [ ] `docs/task-NN-*.md` records what it does and every decision I made about it
- [ ] Persian summary, content only, under ~150 characters, with no task number in it
      (`core.ts` adds the permission link; see `src/brfa.ts`)
- [ ] `transform` uses no network and can return `changed: false`
- [ ] the task's own risk has a `verify` that refuses before saving
- [ ] declined pages are published or written to a file, and a report page that builds up
      over runs has a stored list with a check that it exists
- [ ] `npm test` passes, including the vendored-copy check
- [ ] `npm run bundle` passes all its checks
- [ ] dry-run diffs read by me
- [ ] rendered pages compared before and after on real pages
- [ ] nothing rewrites what `core.ts` already does
