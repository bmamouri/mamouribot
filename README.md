# MamouriBot

Source code for [MamouriBot](https://fa.wikipedia.org/wiki/کاربر:MamouriBot), a
maintenance bot on the **Persian Wikipedia** (fa.wikipedia.org). I
([Mamouri](https://fa.wikipedia.org/wiki/کاربر:Mamouri)) run it from
[Toolforge](https://wikitech.wikimedia.org/wiki/Portal:Toolforge).

Each task is filed and approved separately under
[ویکی‌پدیا:سیاست ربات‌رانی/درخواست مجوز](https://fa.wikipedia.org/wiki/ویکی‌پدیا:سیاست_ربات‌رانی/درخواست_مجوز).
This repository holds the current code. The `کاربر:MamouriBot/کد/…` pages on the wiki are
only historical copies of what was reviewed when each task was approved.

## Writing a new task

Start with `docs/BUILDING-A-TASK.md`. It covers the `BotTask` interface, where files go,
what `core.ts` already does, how a task gets approved, and the mistakes I have already made.
Read it before adding `src/tasks/task-NN/`.

[`TODO.md`](TODO.md) lists what is left to do. Most entries are "do this once X is true",
because the campaigns run for months, so each one has its trigger and a command that tells
you whether it is due.

Other references: `docs/TOOLFORGE.md` for deployment, `docs/PACING.md` for how the bot
decides how long to wait between edits, and `docs/task-NN-*.md` for each task's own
decisions.

## Tasks

| # | directory | Task id | What it does |
|---|---|---|---|
| ۱ | `task-01/` | `remove-use-dmy-dates` | Removes the imported `{{Use dmy dates}}`, which renders nothing on fa.wiki and only adds pages to a tracking category |
| ۳ | `task-03/` | `normalize-cite-params` | Unifies the archive parameter names in citation templates (`archive-url`/`نشانی بایگانی` → `پیوند بایگانی`/`archive-url`, `archive-date` → `تاریخ بایگانی`/`archive-date`, the `dead-url` family → `چگونگی پیوند`/`url-status`). Each citation keeps the language of its own other parameters; no language is forced. Also drops `ref=harv` |
| ۴ | `task-04/` | `company-deprecated-params` | Renames deprecated `جعبه اطلاعات شرکت` parameters, which brings back field values the template was dropping. Runs daily (`cp-daily`) to catch new category members and pages that broke again, as well as the original one-off sweep |
| ۴ | `task-04/` | `citation-dedup-accessdate` | The approved addition to task ۴: removes a duplicated access-date parameter where both copies hold the same date |
| ۵ | `task-05/` | `empty-unknown-params.py` | Removes *empty* unknown citation parameters that cause a CS1 error (Python; to be ported to pywikibot) |
| ۶ | `task-06/` | `notelist-missing` | Adds a missing note list to articles whose notes are otherwise never shown |
| ۷ | `task-07/` | `infobox-software-params` | Updates old `جعبه اطلاعات نرم‌افزار` parameter names and brings back the rows they hid |
| ۸ | `task-08/` | `musician-params` | Fixes `جعبه اطلاعات هنرمند موسیقی` parameter names the template was ignoring |
| ۹ | `task-09/` | `taxonomy-link-localize` | Localizes `link=` targets in the taxonomy templates |
| ۱۰ | `task-10/` | `destub` | Removes stub tags from articles that are clearly no longer stubs |
| ۱۱ | `task-11/` | `taxonomy-create-missing` | Hourly: creates the missing `الگو:Taxonomy/*` pages behind «Missing taxonomy template» (رده:صفحه‌های دارای الگوی آرایه‌شناسی گم‌شده) |
| ۱۲ | `task-12/` | `linkfix` | Repairs links the mass imports left in English: the fa article if there is one, else an interwiki link with a Persian label, else plain Persian text. Never makes up a Persian name. Also repoints red links whose Persian article has another name (extension awaiting review). See `docs/task-12-linkfix.md` |
| ۱۳ | `task-13/` | `reports-cli` | Every database report this bot publishes: the five «نیازمند تغییرنام» reports, the two درگاه reports and the four «ویکی‌های همسایه» reports daily, the two move-review lists («تغییرنام‌های کاربران تأییدشده خودکار» and «… تأییدشده پایدار بدون گشت خودکار») daily, and the featured-content ranking and the user-preferences overview weekly. It only proposes: it writes report pages and never edits an article. Needs no permission and runs without the bot flag (`flagEdits: false`); see `docs/task-13-move-report.md` |
| ۱۴ | `task-14/` | `population-box` | Places `{{جمعیت ایران}}`, the census trend box fed from Wikidata, on Iranian village articles. No number is written in the edit itself, and a hand-written box is only replaced after a check shows that every figure it displayed is still there. See `docs/task-14-population.md` |

The directory name is the permission-request number, zero-padded so it sorts, and the same
number is used across the repository: `src/tasks/task-10/`, `docs/task-10-destub.md`,
`toolforge/task-08-musician-params/`. Each task's tests sit beside it, so `src/tasks/task-07/`
is everything task ۷ is.

Task ۲ (the ship-infobox conversion) was a one-off run from a separate script and is not
part of this runner. Task ۱۳ is not a `BotTask` either: it writes report pages rather than
going through articles, so it has its own entry point, `src/tasks/task-13/move-report-cli.ts`.

## Where each task stands

The to-do list is in [`TODO.md`](TODO.md). This section is status only; remove an entry
when it stops being true.

**وظیفهٔ ۳: approved, running.** {{مجوز دارد}} granted ۸ اکتبر ۲۰۲۶. It runs as the cron job
`cite-params-hourly`, 250 pages an hour at `--delay 5`, from a fixed, shuffled list of
80,450 titles. About 2,000 articles are done out of an estimated 265,000; see
`docs/task-03-run-state.md`.

I stopped it for a day over a defect that was in `Module:Citation/CS1`, not in the bot.
`has_archive_today_url` blanks a parameter holding an `archive.today` URL along with the
parameters that depend on it. But `url_dependency_map_t` only uses English parameter names,
and `dependencies_t` is built about 2,200 lines before the fa translation layer adds the
Persian names. So a Persian-named archive URL was blanked while its date stayed. A preview
never shows this, because that step is skipped when `{{REVISIONID}}` is unset. Both fixes
are live: the bot leaves the archive parameters alone on such citations, and the module now
builds `dependencies_t` with every alias. The full write-up is in
`docs/task-03-open-defect.md`.

This file and `docs/task-03-run-state.md` once said the duplicate-parameter tracking
category was «largely drained» for the approved scope. That was based on one capped run that
edited nothing. On ۹ اکتبر ۲۰۲۶ I checked a random 300 of its members: 275 (۹۲٪) can be
fixed under the approved scope alone, and the category holds 45,126 articles. The capped run
was misleading because `list=categorymembers` returns the already-clean pages first.

**وظیفهٔ ۴: approved, running continuously.** {{مجوز دارد}} granted ۱۳ ژوئیه ۲۰۲۶. It ran once
that day as a one-off sweep (about ۱۲٬۳۰۰ pages). On ۱۰ نوامبر ۲۰۲۶ I made it a daily job
(`cp-daily`, `35 6 * * *`) because the category kept filling up again: new articles were
created with old parameters, and pages the bot had fixed were reverted past its edit in
unrelated content disputes (I confirmed this on five live pages). The task sets
`recheckAfterDays: 30`, so a reverted page comes back into scope instead of staying marked
done since July. See `docs/TOOLFORGE.md`.

**وظیفهٔ ۱۲: approved ۹ اکتبر ۲۰۲۶.** The second ۵۰-edit trial rewrote 141 links and took
content red links from 2,840 to 2,720, with no self-reverts. In November I extended it to red
links whose Persian article has another name, ran 97 edits of that under my own account and
posted the results on the request page. That part waits for review and only runs `--as-me`
until then. See `docs/task-12-linkfix.md`.

**وظیفهٔ ۱۳: live since ۹ اکتبر ۲۰۲۶, permission declined as unnecessary.** It runs daily as
`mr-daily`. The first publication, rev 44682987, came back `bot: false`. Huji answered that
a bot like this needs no permission and that its edits are better without the bot flag,
since the flag is there to hide floods and this task writes one page a day. So it runs as
MamouriBot with `flagEdits: false`, which `RunOptions` sets separately from `identity`. It
does not need my personal credentials on Toolforge, because `bot=1` is set per edit. See
`docs/task-13-move-report.md`.

**وظیفهٔ ۱۴: filed ۸ اکتبر ۲۰۲۶, waiting for review.** The code, 28 tests and the Toolforge
jobs are ready. In the dry run 39 of 40 articles needed the box, and every diff was a
one-line addition. It has not run live. See `docs/task-14-population.md`.

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

`npm test` runs every `src/**/*.test.ts` and `test_*.py`. Files named `*.trial.ts` or
`*.replay.ts` are left out of it because they need the network, and one of them needs
research data from the companion repository. They are the write-free trials each task was
checked with before its permission request, kept beside the task so they stay in step with
the code.

A run is a dry run unless you pass `--live`. `--live` needs `WIKIPEDIA_BOT_USERNAME` and
`WIKIPEDIA_BOT_PASSWORD` in the environment, or in a local `.env`, which git ignores. On
Toolforge they are real environment variables, so no credentials are kept in this
repository.

`core.ts` applies these to every task:

- every edit summary starts with a link to the permission that covers it, as fa and en
  bots both do (`src/brfa.ts`)
- `maxlag=5` on every write, with a retry when the replicas lag
- a pause between edits, and the run stops on a blocked or read-only API reply
- the page [`کاربر:MamouriBot/توقف`](https://fa.wikipedia.org/wiki/کاربر:MamouriBot/توقف)
  is checked before each edit, so anyone can stop the bot from the wiki
- `{{nobots}}` / `{{bots|deny=…}}` are respected
- runs can be resumed: processed titles are saved, so an interrupted run never edits a
  page it already handled
- `Ctrl-C` finishes the current page and then stops

See `docs/TOOLFORGE.md` for deployment.

`npm test` should always pass. `npm run typecheck` does not pass yet: it reports six
strict-mode complaints that are older than this repository, three of them in a vendored
helper that can't be edited here without making it differ from the original. I am fixing
them separately; none of them came from moving the code here.

## Vendored helpers

`src/lib/` holds copies of helpers shared with my companion repository of one-off
fa.wikipedia scripts, where this repository is checked out as a submodule. A Toolforge job
clones only this repository, so `src/lib/` cannot import from outside it and needs its own
copies.

Copies drift apart, and a publish check that has drifted is worse than none, because it
passes and the defect goes out. So `npm run check:vendored` checks that every vendored file
is byte-identical to its original whenever the parent repository is on disk, and says there
is nothing to compare against when it is not. It runs as part of `npm test`.

The tests of the vendored files are copied too. The companion repository's vitest only
looks in `tests/**`, so `checkpoint.test.ts` and `test_gates.py` never ran automatically
there. Here they are part of `npm test`, so `gates.py`, the set of publish checks that both
repositories depend on most, is tested on every build.

The one intended difference is described in `tools/check-vendored.ts`: `gates.ts` looks
for `gates.py` in its own directory rather than the process's working directory, because a
Toolforge job does not run from a repository root. All of the checking logic is in
`gates.py`, which is compared.

## Licence

MIT, see `LICENSE`.
