# MamouriBot

Source code for [MamouriBot](https://fa.wikipedia.org/wiki/کاربر:MamouriBot), a
maintenance bot on the Persian Wikipedia (fa.wikipedia.org). I
([Mamouri](https://fa.wikipedia.org/wiki/کاربر:Mamouri)) run it from
[Toolforge](https://wikitech.wikimedia.org/wiki/Portal:Toolforge).

Each task is filed and approved separately under
[ویکی‌پدیا:سیاست ربات‌رانی/درخواست مجوز](https://fa.wikipedia.org/wiki/ویکی‌پدیا:سیاست_ربات‌رانی/درخواست_مجوز).
This repository holds the current code. The `کاربر:MamouriBot/کد/…` pages on the wiki are
only copies of what was reviewed when each task was approved.

## Tasks

| # | directory | task id | what it does | status |
|---|---|---|---|---|
| ۱ | `task-01/` | `remove-use-dmy-dates` | Removes `{{Use dmy dates}}` and the seven other imported English variant templates, which render nothing on fa | Approved. Daily, `ud-daily` |
| ۳ | `task-03/` | `normalize-cite-params` | Unifies the archive parameter names in citations, in the language the citation already uses, and drops `ref=harv` | Approved. Hourly, `cite-params-hourly` |
| ۴ | `task-04/` | `company-deprecated-params` | Renames deprecated `جعبه اطلاعات شرکت` parameters, which brings back hidden field values | Approved. Daily, `cp-daily` |
| ۴ | `task-04/` | `citation-dedup-accessdate` | Removes a duplicated access-date parameter where both copies hold the same date | Approved as part of task ۴. No scheduled job |
| ۵ | `task-05/` | `empty-unknown-params.py` | Removes empty unknown citation parameters that cause a CS1 error (Python) | Approved. Daily, `empty-params` |
| ۶ | `task-06/` | `notelist-missing` | Adds a missing notes list to articles whose notes are never shown | Approved. Every 15 minutes, `notelist-watch` |
| ۷ | `task-07/` | `infobox-software-params` | Updates old `جعبه اطلاعات نرم‌افزار` parameter names | Approved. Weekly, `sw-weekly` |
| ۸ | `task-08/` | `musician-params` | Fixes `جعبه اطلاعات هنرمند موسیقی` parameter names the template ignores | Approved. Weekly, `mp-weekly` |
| ۹ | `task-09/` | `taxonomy-link-localize` | Points `link=` in the taxonomy templates at the Persian article | Approved. Weekly, `tl-weekly` |
| ۱۰ | `task-10/` | `destub` | Removes stub tags from articles that are no longer stubs | Approved. `destub-watch` every 10 minutes, `destub-inventory-monthly` |
| ۱۱ | `task-11/` | `taxonomy-create-missing` | Creates the missing `الگو:Taxonomy/*` pages behind «Missing taxonomy template» | Trial permission. Hourly, `tx-hourly` |
| ۱۲ | `task-12/` | `linkfix` | Repairs links the mass imports left in English | Approved for article links; the extension is waiting for review and runs as well. Daily, `lf-daily`, at most 100 edits |
| ۱۳ | `task-13/` | `reports-cli` | Publishes the database reports. Writes report pages only, never an article | No permission needed. Daily and weekly jobs, unflagged |
| ۱۴ | `task-14/` | `population-box` | Adds `{{جمعیت ایران}}`, fed from Wikidata, to Iranian village articles | Filed, waiting for review and a نظرخواهی. Not run live |
| ۱۵ | `task-15/` | `source-tags` | Adds `{{بدون منبع}}` and related banners to unsourced articles, removes stale ones | Approved. Daily, `st-daily`, at most 200 edits |
| ۱۶ | `task-16/` | `strip-text-fragment` | Removes `#:~:text=` from URLs | Approved. Daily, `tf-daily` |

Task ۲ (the ship-infobox conversion) was a one-off run from a separate script and is not part
of this runner. Task ۱۳ is not a `BotTask`: it has its own entry point,
`src/tasks/task-13/reports-cli.ts`, and its own bundle.

The directory name is the permission-request number, zero-padded, and the same number is
used everywhere: `src/tasks/task-10/`, `docs/task-10-destub.md`,
`toolforge/task-08-musician-params/`. Each task's tests sit beside its code.

What is left to do, with the trigger for each item, is in [`TODO.md`](TODO.md). Job schedules
are in `docs/TOOLFORGE.md`.

## Docs

- `docs/BUILDING-A-TASK.md`: how to add a task. Read it before adding `src/tasks/task-NN/`.
- `docs/TOOLFORGE.md`: deployment, jobs, logs, stopping.
- `docs/PACING.md`: how the bot decides how long to wait between edits.
- `docs/task-NN-*.md`: each task's own notes.
- `TODO.md`: open items.

## Layout

```
src/run.ts          CLI entry point; one registered task per permission request
src/core.ts         the shared framework: login, identity checks, maxlag, pacing, stop page,
                    {{nobots}}, resume checkpoint, dry run
src/pacing.ts       server-driven write pacing (docs/PACING.md)
src/brfa.ts         the permission link at the start of every edit summary
src/tasks/task-NN/  one directory per task: code, tests, and any write-free trial script
src/lib/            shared helpers, vendored from the companion repository, plus
                    replica.ts for read-only database access
tools/              test runner, bundle builder, vendored-copy check
toolforge/          run.sh + jobs.yaml per task; bundles are written here by npm run bundle
docs/               task notes and the Toolforge playbook
archive/            local one-offs, git-ignored
```

## Running

```sh
npm install
npx tsx src/run.ts <task-id>                              # dry run: reads only, no login
npx tsx src/run.ts <task-id> --limit 20                   # dry run, first 20 pages
npx tsx src/run.ts <task-id> --live --limit 25 --delay 15 # live
npx tsx src/run.ts <task-id> --live --as-me               # live, under my own account
npx tsx src/run.ts <task-id> --check                      # credentials and stop page only
npm test                                                  # every unit test, no network
npm run bundle                                            # build the Toolforge bundles
```

A run is a dry run unless you pass `--live`. `--live` needs `WIKIPEDIA_BOT_USERNAME` and
`WIKIPEDIA_BOT_PASSWORD` in the environment or in a local `.env` (git-ignored). `--as-me`
uses `WIKIPEDIA_USERNAME` and `WIKIPEDIA_PASSWORD` instead. On Toolforge the credentials are
tool environment variables, so none are kept in this repository.

`npm test` runs every `src/**/*.test.ts` and `test_*.py`. Files named `*.trial.ts` or
`*.replay.ts` need the network and are left out.

`core.ts` applies these to every task:

- every edit summary starts with a link to the permission that covers it (`src/brfa.ts`)
- `assert=user` and `assertuser` on every write, with a fresh login on `assertuserfailed`
- `maxlag=5` on every write, and the server's `Retry-After` is followed
- a pause between edits (`docs/PACING.md`); a blocked or read-only reply stops the run
- [`کاربر:MamouriBot/توقف`](https://fa.wikipedia.org/wiki/کاربر:MamouriBot/توقف) is read
  before each edit, so anyone can stop the bot from the wiki
- `{{nobots}}` and `{{bots|deny=…}}` are respected
- processed titles are saved, so a resumed run never edits a page twice
- `Ctrl-C` finishes the current page and then stops

`npm run typecheck` does not pass yet. It reports four strict-mode errors, in `src/core.ts`
and in the vendored `src/lib/notelist.ts`.

## Vendored helpers

`src/lib/` holds copies of helpers from my companion repository of fa.wikipedia scripts,
where this repository is checked out as the `bots/` submodule. A Toolforge job clones only
this repository, so it needs its own copies.

`npm run check:vendored` (part of `npm test`) checks that every vendored file is
byte-identical to its original whenever the parent repository is on disk. If you edit one
side, copy the file to the other. The one intended difference is described in
`tools/check-vendored.ts`: `gates.ts` looks for `gates.py` in its own directory, because a
Toolforge job does not run from a repository root.

## Licence

MIT, see `LICENSE`.
