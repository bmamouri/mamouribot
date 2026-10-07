# MamouriBot

Source code for [MamouriBot](https://fa.wikipedia.org/wiki/کاربر:MamouriBot), a
maintenance bot on the **Persian Wikipedia** (fa.wikipedia.org). It is operated by
[Mamouri](https://fa.wikipedia.org/wiki/کاربر:Mamouri) and runs from
[Toolforge](https://wikitech.wikimedia.org/wiki/Portal:Toolforge).

Every task here is filed and approved separately under
[ویکی‌پدیا:سیاست ربات‌رانی/درخواست مجوز](https://fa.wikipedia.org/wiki/ویکی‌پدیا:سیاست_ربات‌رانی/درخواست_مجوز).
This repository is the source of truth for the code; the `کاربر:MamouriBot/کد/…`
pages on the wiki are kept only as historical copies of what was reviewed at the
time a task was approved.

## Writing a new task

**`docs/BUILDING-A-TASK.md`** is the playbook: the `BotTask` contract, where files go, what
`core.ts` already does so you do not rebuild it, how a task gets approved, and the traps.
Read it before adding `src/tasks/task-NN/`.

Other references: `docs/TOOLFORGE.md` for deployment, `docs/PACING.md` for why the bot
waits what it waits, and `docs/task-NN-*.md` for each task's own decisions.

## Tasks

| # | directory | Task id | What it does |
|---|---|---|---|
| ۱ | `task-01/` | `remove-use-dmy-dates` | Removes the imported `{{Use dmy dates}}`, which renders nothing on fa.wiki and only populates a tracking category |
| ۳ | `task-03/` | `normalize-cite-params` | Unifies the deprecated link-status parameters in citation templates and drops `ref=harv` |
| ۴ | `task-04/` | `company-deprecated-params` | Renames deprecated `جعبه اطلاعات شرکت` parameters, restoring field values the template was silently dropping |
| ۴ | `task-04/` | `citation-dedup-accessdate` | The approved addition to task ۴: removes a duplicated access-date parameter where both copies hold the same date |
| ۵ | `task-05/` | `empty-unknown-params.py` | Removes *empty* unknown citation parameters that raise a CS1 error (Python; to be ported to pywikibot) |
| ۶ | `task-06/` | `notelist-missing` | Adds a missing note list to articles whose notes are therefore never displayed |
| ۷ | `task-07/` | `infobox-software-params` | Updates stale `جعبه اطلاعات نرم‌افزار` parameter names and restores the rows they hid |
| ۸ | `task-08/` | `musician-params` | Fixes `جعبه اطلاعات هنرمند موسیقی` parameter names the template was discarding |
| ۹ | `task-09/` | `taxonomy-link-localize` | Localizes `link=` targets in the taxonomy templates |
| ۱۰ | `task-10/` | `destub` | Removes stub tags from articles that are demonstrably no longer stubs |
| ۱۱ | `task-11/` | `taxonomy-create-missing` | Creates missing taxonomy templates that task ۹ depends on |
| ۱۲ | `task-12/` | `linkfix` | Repairs links the mass imports left in English: fa article if one exists, else an interwiki with a Persian label, else plain Persian text. Never invents a Persian name. Permission withheld pending three requests from the review, all now done. See `docs/task-12-linkfix.md` |
| ۱۳ | `task-13/` | `move-report` | Rebuilds the «برای انتقال مقاله» database report of titles whose spelling needs fixing. Proposes only; writes one page and never edits an article. See `docs/task-13-move-report.md` |

**The directory name is the BRFA number**, zero-padded so it sorts, and it is the index
for the whole repository: `src/tasks/task-10/`, `docs/task-10-destub.md`,
`toolforge/task-08-musician-params/`. Each task's tests sit beside the task they test,
so `src/tasks/task-07/` is everything task ۷ is.

Task ۲ (the ship-infobox conversion) was a one-off run from a separate script and is
not part of this runner. Task ۱۳ is not a `BotTask` either: it writes a single report
page rather than iterating over articles, so it has its own entry point,
`src/tasks/task-13/move-report-cli.ts`. Its permission request is not filed yet.


## Open items

Current as of ۷ اکتبر ۲۰۲۶. Delete an entry when it is done rather than letting this rot.

**وظیفهٔ ۳ (trial run, follow-up drafted and unposted).** 834 edits over 758 articles and
6 self-reverts of the approved 1,000; ~160 left. Full state, including the open defect and
everything already ruled out, in `docs/task-03-trial-state.md`. The follow-up is written at
`drafts/brfa-task03-trial-report.wiki` in the companion repo and has NOT been posted; it
declares the three deviations from the filed request (archive parameters added to the
scope, TypeScript instead of Python, Persian url-status values).

One thing is still open rather than merely undone: the 0.7% regression is CONTAINED by the
post-save check, not fixed. Cause unknown; the one live clue is that `parse&oldid=` and
`parse&text=` disagree on identical bytes, which is also why no pre-save guard can catch
it. The reviewer may reasonably want it root-caused before the full permission.

**وظیفهٔ ۱۳ (not filed).** Code, tests and deployment are ready and verified against the
live wiki; see `docs/task-13-move-report.md`. The permission request is drafted at
`drafts/brfa-task13-move-report.wiki` in the companion repo and has not been posted.

**وظیفهٔ ۱۲ (filed, permission WITHHELD).** Declined on ۳ اکتبر ۲۰۲۶ pending three
changes: pywikibot for the Python bots, code on GitHub rather than in the wiki, and
Toolforge. All three are now done — the task is TypeScript at `src/tasks/task-12/`, this
repo is public, and it runs on `tools.mamouribot` — and the review scoped the pywikibot
request to Python bots. The reply is drafted in the companion repo's `drafts/` and is NOT
posted. See `docs/task-12-linkfix.md`.

One question in that reply is genuinely open and is the operator's to answer: whether to
move this repo under `PersianWikipedia/fawikibot` as the review suggested, or link to it from
there.

**Persian url-status values.** `مرده`/`زنده` were added to the keywords table in all five
CS1 configs and the bot writes them. Untested over time: that config tells
InternetArchiveBot what to RECOGNISE, not what to EMIT, so IABot may still write `dead`
when it next visits a page the bot set to `مرده`. Only observable by waiting.

## Layout

```
src/pacing.ts      server-driven write pacing: Retry-After, dbrepllag,
                   concurrent-run sharing. See docs/PACING.md
src/core.ts        the shared bot framework: login, maxlag, throttling,
                   emergency stop, {{nobots}} opt-out, resumable state, dry-run
src/run.ts         CLI entry point; one registered task per BRFA
src/tasks/task-NN/ one directory per BRFA task: the task, its unit tests, and any
                   write-free trial or replay script it was verified with
src/lib/           shared fa.wikipedia helpers (see "Vendored helpers" below),
                   plus replica.ts for read-only access to the fawiki database
tools/             test runner and the vendored-copy drift check
docs/              per-task notes and the Toolforge deployment playbook
(archive/)         spent one-offs that filed the permission requests and the
                   per-task trial runs; git-ignored, kept only locally
```

## Running

```sh
npm install
npx tsx src/run.ts <task-id>                              # dry run: reads only, no login
npx tsx src/run.ts <task-id> --limit 20                   # dry run, first 20 pages
npx tsx src/run.ts <task-id> --live --limit 25 --delay 15 # a BRFA trial
npm test                                                  # every unit test, no network
```

`npm test` runs every `src/**/*.test.ts` and `test_*.py`. Files
named `*.trial.ts` or `*.replay.ts` are **not** in that run: they need the network, and
one of them needs research data that lives in the companion repository. They are the
write-free trials each task was verified with before its permission request, kept
beside the task so the evidence does not drift away from the code.

**Dry run is the default.** `--live` is the only thing that writes, and it needs
`WIKIPEDIA_BOT_USERNAME` / `WIKIPEDIA_BOT_PASSWORD` in the environment (or in a
local `.env`, which is git-ignored). On Toolforge they are real environment
variables, so no credentials ever live in this repository.

Safety behaviour that `core.ts` applies to every task, not per task:

- every edit summary is prefixed with a link to the permission that authorises it,
  which is the convention both fa and en bots use (`src/brfa.ts`)
- `maxlag=5` on every write, with automatic retry when the replicas lag
- a throttle between edits, and the run stops on a blocked or read-only API reply
- the run page [`کاربر:MamouriBot/توقف`](https://fa.wikipedia.org/wiki/کاربر:MamouriBot/توقف)
  is polled before each edit, so anyone can stop the bot from the wiki
- `{{nobots}}` / `{{bots|deny=…}}` are honoured
- resumable: the processed titles are checkpointed, so an interrupted run never
  rewrites a page it already handled
- `Ctrl-C` finishes the current page and then stops cleanly

See `docs/TOOLFORGE.md` for deployment.

`npm test` is the gate and is expected to be green. `npm run typecheck` is *not*
clean yet: it reports six pre-existing strict-mode complaints that predate this
repository, three of them in a vendored helper that cannot be edited here
without drifting from its original. They are being worked through separately;
nothing in the move introduced them.

## Vendored helpers

`src/lib/` holds copies of helpers shared with the operator's companion
repository of one-off fa.wikipedia scripts, where this repository is checked out
as a submodule. A Toolforge job clones **this** repository alone, so `src/lib/`
cannot import out of the tree, and a copy is unavoidable.

A second copy of a file is how one of them quietly stops matching the other, and
a publish gate that has drifted is worse than no gate at all: it passes, and the
defect ships. So the drift is a failing check rather than a hope —
`npm run check:vendored` asserts every vendored file is byte-identical to its
original whenever the parent repository is present on disk, and reports that
there is nothing to compare against when it is not. It runs as part of
`npm test`.

The **tests** of the vendored files are vendored too. The companion repository's
vitest only globs `tests/**`, so `checkpoint.test.ts` and `test_gates.py` ran nowhere
automatically; here they are inside `npm test`, which means `gates.py` — the publish
gate battery, the most load-bearing file either repository shares — is exercised on
every build.

The one deliberate exception is documented in `tools/check-vendored.ts`:
`gates.ts` resolves `gates.py` beside itself rather than against the process
working directory, because a Toolforge job does not run from a repository root.
All of the checking logic lives in `gates.py`, which *is* compared.

## Licence

MIT, see `LICENSE`.
