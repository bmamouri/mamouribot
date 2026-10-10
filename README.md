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

**[`TODO.md`](TODO.md)** is what is left to do. Start there after a gap: the campaigns run
for months, so most of it is "do this once X is true", and every entry carries the trigger
and a command that answers whether it is due yet.

Other references: `docs/TOOLFORGE.md` for deployment, `docs/PACING.md` for why the bot
waits what it waits, and `docs/task-NN-*.md` for each task's own decisions.

## Tasks

| # | directory | Task id | What it does |
|---|---|---|---|
| ۱ | `task-01/` | `remove-use-dmy-dates` | Removes the imported `{{Use dmy dates}}`, which renders nothing on fa.wiki and only populates a tracking category |
| ۳ | `task-03/` | `normalize-cite-params` | Unifies the archive parameter names in citation templates (`archive-url`/`نشانی بایگانی` → `پیوند بایگانی`, `archive-date` → `تاریخ بایگانی`, the `dead-url` family → `چگونگی پیوند`) and drops `ref=harv` |
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
| ۱۳ | `task-13/` | `reports-cli` | **Every database report this bot publishes**: «مقاله‌های نیازمند تغییرنام» daily, and three weekly: the two درگاه reports, the featured-content ranking and the user-preferences overview. Proposes only; writes pages and never edits an article. **Needs no permission and runs UNFLAGGED** (`flagEdits: false`) — see `docs/task-13-move-report.md` |
| ۱۴ | `task-14/` | `population-box` | Places `{{جمعیت ایران}}`, the Wikidata-fed census trend box, on Iranian village articles. No number travels in the edit; replacing a hand-written box carries a deletion proof. See `docs/task-14-population.md` |

**The directory name is the BRFA number**, zero-padded so it sorts, and it is the index
for the whole repository: `src/tasks/task-10/`, `docs/task-10-destub.md`,
`toolforge/task-08-musician-params/`. Each task's tests sit beside the task they test,
so `src/tasks/task-07/` is everything task ۷ is.

Task ۲ (the ship-infobox conversion) was a one-off run from a separate script and is
not part of this runner. Task ۱۳ is not a `BotTask` either: it writes a single report
page rather than iterating over articles, so it has its own entry point,
`src/tasks/task-13/move-report-cli.ts`.


## Open items

**The actionable list lives in [`TODO.md`](TODO.md)**, not here. Each entry there carries a
trigger, a command to check whether it is due, and what to do — because these campaigns run
for months and a flat checklist rots before its conditions arrive.

What is below is *status*: where each task stands and why. Delete an entry when it stops
being true.

**وظیفهٔ ۳ (APPROVED, running).** {{مجوز دارد}} granted ۸ اکتبر ۲۰۲۶. Runs as the cron job
`cite-params-hourly` — 250 pages an hour at `--delay 5`, off a frozen, shuffled 80,450-title
target list. ~2,000 articles done of an estimated ~265,000; see `docs/task-03-run-state.md`.

It was stopped for a day on a defect that turned out to be **in `Module:Citation/CS1`, not
in the bot**. `has_archive_today_url` blanks a parameter holding an `archive.today` URL plus
its dependents, but `url_dependency_map_t` is keyed on English parameter names only and
`dependencies_t` is built ~2,200 lines before the fa i18n overlay adds the Persian aliases,
so a Persian-named archive url was blanked while its date survived. A preview can never show
it: the suppression pass is skipped when `{{REVISIONID}}` is unset. Both fixes are live —
the bot freezes the archive family on such citations, and the module rebuilds
`dependencies_t` keyed on every alias. Full diagnosis: `docs/task-03-open-defect.md`.

**A correction worth not re-making:** this file and `docs/task-03-run-state.md` both said
the duplicate-parameter tracking category was «largely drained» for the approved scope, on
the strength of one capped run that edited nothing. Measured on ۹ اکتبر ۲۰۲۶ against a
random 300 of its members, **275 (۹۲٪) are actionable under the approved scope alone**, and
the category holds 45,126 articles. The ordering was the trap, not the population:
`list=categorymembers` returns a leading window that is nearly all already-clean pages.

**وظیفهٔ ۱۲ (second trial done, permanent permission expected).** The ۵۰-edit trial ran
۹ اکتبر ۲۰۲۶ and the report is posted: 141 links rewritten, content red links 2,840 → 2,720,
0 self-reverts, red links down on 46 articles and up on none. See `docs/task-12-linkfix.md`.

**وظیفهٔ ۱۳ — LIVE since ۹ اکتبر ۲۰۲۶, permission declined as unnecessary.** Runs daily as
`mr-daily`; first publication rev 44682987 came back `bot: false`. The BAG's answer was that
such a bot needs no permission and that its edits are *better off not bot-flagged*, because
the flag is flood control and this task writes one page a day. It runs on MamouriBot with
`flagEdits: false`, which `RunOptions` carries independently of `identity` —
**it does not need the operator's credentials on Toolforge**, because `bot=1` is a per-edit
parameter. See `docs/task-13-move-report.md`.

**وظیفهٔ ۱۴ (filed ۸ اکتبر ۲۰۲۶, awaiting review).** Code, 28 tests and the Toolforge jobs
are ready; the dry run found 39 of 40 articles actionable, every diff a one-line addition.
Not run live. See `docs/task-14-population.md`.

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
