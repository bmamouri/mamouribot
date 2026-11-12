# How to build a MamouriBot task

The conventions and the `BotTask` interface. Read `../README.md` (layout, running),
`TOOLFORGE.md` (deployment) and `PACING.md` as well. The rules for the companion repository
(Persian on the wiki, work on `main`) are in its `AGENTS.md`.

## 0. Before writing any code

1. Find the permission-request number and confirm it on the wiki. List
   `ویکی‌پدیا:سیاست ربات‌رانی/درخواست مجوز/MamouriBot/` and read the request. A `task-NN/`
   directory is a filing decision, not an approval
   (`lessons/api-and-permissions/repo-folder-is-not-the-approved-scope.md`).
2. Read the request's `===بحث===` section as well as the proposal. Reviewers attach
   conditions there.
3. Check what scope is approved. Anything not approved runs under `--as-me` (my own
   account), not as the bot.
4. Measure a few hundred real pages and sort them into cases before designing. Estimates are
   usually wrong.

## 1. Where the files go

```
src/tasks/task-NN/<name>.ts          the BotTask
src/tasks/task-NN/<name>.test.ts     its tests, beside it
src/tasks/task-NN/data/*.json        curated data the task needs
docs/task-NN-<name>.md               what it does
toolforge/task-NN-<name>/            run.sh + jobs.yaml
```

Register the task in the `TASKS` map in `src/run.ts`. That is all the wiring. `run.ts` gives
you a dry run by default, `--live`, `--as-me`, `--limit`, `--delay` and `--check`.

A new task does not get a new Toolforge tool. It is a directory and a job inside
`mamouribot` (`TOOLFORGE.md`).

`archive/` is git-ignored and holds local one-offs. It is not part of the build.

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

### `summary`

Persian, first person where it reads naturally, describing only the change to the content.
Don't mention the script, batch or method. Keep it under about 150 characters (AbuseFilter
221 warns on long summaries).

Don't put the task number in it. `core.ts` starts every bot summary with a link to the
permission, built from `taskNumber`:

```
[[ویکی‌پدیا:سیاست ربات‌رانی/درخواست مجوز/MamouriBot/وظیفه ۳|ربات]]: <your summary>
```

It skips the prefix if the summary already starts with «ربات:», leaves the link out with a
warning if the permission page does not exist, and never adds it to a `--as-me` run. See
`src/brfa.ts`.

### `getTargets`

It runs once, before anything else, and is the place for batched network work: look up
everything the transforms will need, cache it, and return only pages with something to do.
`transform` then needs no network and can be tested offline.

Take page selectors from environment variables, because the shell mangles Persian titles
passed as arguments: `TARGET_TITLES` (pipe-separated), `TARGET_FILE` (JSON list or one per
line), `TARGET_CATEGORY`, `TARGET_TRANSCLUDING`, `TARGET_CAP`.

Cap the candidate list from `bot.opts.limit` instead of listing everything.

### `transform`

No network and no waiting. Return `changed: false` for anything you are not sure of, and
`manualReview: true` for pages a person should look at. Change the smallest part you can,
never the whole article (`lessons/scripts-and-batch/never-wholesale-replace-article.md`).

### `verify`

`core.ts` already counts CS1 and Lua errors before and after. If the task's real risk is
something else, check it here, before saving. وظیفهٔ ۱۲ renders both versions and refuses
the edit if content red links went up.

### `report`

Publish what the task declined to do, so it is not mistaken for a task with nothing to do.

If a report page builds up over many runs, keep a stored copy of the list, and refuse to
publish when that copy is missing, as opposed to empty (`src/tasks/task-03/review-store.ts`).
Wrap URL values in `<nowiki>`. Write a quoted em dash as an HTML entity, since the publish
check rejects a literal one.

## 3. What `core.ts` already does

Identity (`assert=user` + `assertuser`, a fresh login on `assertuserfailed`), `maxlag` and
`Retry-After`, pacing, `{{nobots}}`, the stop page, the resume checkpoint, edit-conflict
protection with `baserevid`, resubmitting after an AbuseFilter warning, `Ctrl-C`, the render
check after saving with a self-revert, sharing the edit rate between runs, and the
permission link in every summary. Don't write any of these again.

Reads from other wikis go through `bot.apiGetOn(API, params)`, so the user agent, retries and
request limits match the main client. The bot sends its own `BOT_UA`; `--as-me` sends the
browser string. `core.ts` picks the right one.

## 4. Tests

Tests are plain `tsx` scripts that exit non-zero on failure. `npm test` runs every
`*.test.ts` and `test_*.py` under `src/`, and none of them may use the network. Name
network-dependent checks `*.trial.ts` or `*.replay.ts`; they are left out.

Test the edges. The useful tests say "this exact input must not change":

- a `File:`/`رده:`/interwiki link is never touched
- a `px` size is not mistaken for an English label
- `page` and `pages` are different fields and both survive
- a single valid parameter is left alone, since renaming it is a cosmetic edit

Check that a zero result is real: show the selector matches something
(`lessons/verification-and-gates/a-zero-needs-a-positive-control.md`).

When porting code, compare the output with the original on real pages, byte for byte. Unit
tests don't catch a regex that behaves differently in another language.

## 5. The publish check

```ts
import { gateOrThrow } from '../../lib/gates.js';   // or checkWikitext for the list
gateOrThrow(title, wikitext);
```

Every check in `gates.py` covers a defect that shows no error on the wiki. Run it before
every publish, including report and code pages
(`lessons/verification-and-gates/gate-is-for-every-publish-not-just-articles.md`).

On pages that already carry many old problems, check only what the edit changes, so only
problems the edit adds can block it. See `rewrite.ts::gateDiff` in `src/tasks/task-12/`.

## 6. Check by rendering

```
action=parse&prop=text|categories   then grep for
  scribunto-error   class="error   cs1-visible-error   redlink=1   نامعلوم
```

Include `class="` in the pattern; the bare class name also appears in TemplateStyles.

`parse&page=`/`&oldid=` and `parse&text=` can give different results for the same text, and
a check before saving can only use `text=`. That is why وظیفهٔ ۳ also checks after saving.
Don't decide that a parameter name or value works by reading a configuration table; render
it.

## 7. Bundling and deployment

Use `npm run bundle`, never esbuild by hand: the bundle needs the `__BUNDLED__` define, and
the build script checks it. Read `TOOLFORGE.md` before deploying.

A task registered in `run.ts` is already in `toolforge/mamouribot.mjs` and needs no bundle
entry. Add an entry in `tools/build-bundle.ts` only for a separate job, with a small CLI file
that calls `run()` unconditionally, because `isMain()` is always false inside a bundle.

Import JSON data (`import names from './data/names.json' with { type: 'json' }`) so it ends
up in the bundle. Let an environment variable override hand-maintained data, so editing it
needs no rebuild.

## 8. Getting it approved

1. Dry run with `--limit 20` and read the diffs.
2. Measure, then write the request from the measurements. Copy the structure of the last
   accepted request. Subsections are `===`, never `==`
   (`lessons/api-and-permissions/brfa-subsection-must-be-level-three.md`).
3. Run the trial under `--as-me` if the scope is not approved yet. Those edits are
   unflagged and paced at 30–120s.
4. Report the trial in full, including what went wrong and every way the run differed from
   the request.
5. Run `gates.check_talk_reply()` on the reply. It caps prose at 400 words and catches bold
   lines used as headings.

Drafts go in the companion repository's `drafts/`, and I post them myself.

## 9. Pitfalls outside the bot code

- The companion repository's git index is shared by several sessions. Stage exact paths,
  never a whole directory.
- Work on `main`; don't branch.
- The companion repository's `.gitignore` ignores every `data/` directory. Run
  `git ls-files` on any data file you depend on.
- Don't take article titles from WDQS `schema:name`; it strips the ZWNJ. Use
  `wbgetentities&props=sitelinks`.
- A Persian heading can be spelled more than one way (`جمعیّت` / `جمعیت`) or wrapped in a
  link. Match all forms before adding a section.
- Finding a substring does not tell you the structure: `جمعیت تاریخی` matches prose as well
  as the template call.

## 10. Checklist

- [ ] permission-request number confirmed on the wiki, and the `بحث` section read
- [ ] pages measured on a real sample
- [ ] `src/tasks/task-NN/`, tests beside it, registered in `run.ts`
- [ ] `docs/task-NN-*.md` says what it does
- [ ] Persian summary, content only, under ~150 characters, no task number
- [ ] `transform` uses no network and can return `changed: false`
- [ ] the task's own risk has a `verify` that refuses before saving
- [ ] declined pages are published or written to a file; an accumulating report page checks
      that its stored list exists
- [ ] `npm test` passes, including the vendored-copy check
- [ ] `npm run bundle` passes
- [ ] dry-run diffs read
- [ ] rendered pages compared before and after
- [ ] nothing rewrites what `core.ts` already does
