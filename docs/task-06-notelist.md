# Missing notes lists (MamouriBot, وظیفه ۶)

This task restores the notes list in articles whose grouped notes have nowhere to display.
Articles translated from en carry explanatory notes that were `{{efn}}` there. Translation
turns them into raw `<ref group="…">` and then drops the list, gives it the wrong name, or
puts it in the wrong place. No error shows to the reader; the note text simply never appears.

## Status

- **Approved** with `{{مجوز دارد}}` in the `===بحث===` section of the request. The
  `{{ربات جدید|MamouriBot|}}` status parameter on the request page was never filled in, so
  the page still looks open.
- Runs as MamouriBot, job `notelist-watch`, every 15 minutes (`*/15 * * * *` UTC) with
  `--delay 12`. The request promises at least 10 seconds between edits and gives a schedule
  only as an example. A run only renders the pages currently in the tracking category, which
  is normally almost empty, so frequent runs are cheap.
- Translation from en goes on, so the category keeps gaining members. That is why it runs
  continuously.

## The classes

Three are fixed automatically. The rest are reported and never touched.

| class | what it is | fix |
|---|---|---|
| `missing-container` | notes exist, no list for their group | insert `{{یادداشت‌ها}}` / `{{پانویس|گروه=X}}` under a notes heading, or a new section above `منابع` |
| `misplaced-container` | the list sits above the notes it should collect. Cite only collects refs that come before the list, so this breaks the same way as a missing list | remove the list and place it again in the right spot |
| `nested-ref` | `{{sfn}}`/`{{پک}}` inside a raw `<ref group="…">`. A `<ref>` inside a `<ref>` breaks that group's list (standard Cite behaviour, en gives the same error) | convert the notes to `{{یادچپ}}` (fa's `{{efn}}`), which accepts `{{sfn}}` inside |
| `split-container` | some notes before the list, some after it | reported |
| `malformed` | `group=` holds something that was never a group name: a pasted URL, a sentence, a bare number, a lone diacritic | reported; adding a list would make the typo permanent |
| `unknown` | renders broken, but the rules can't explain why | reported |

The list template depends on the group name. `{{یادداشت‌ها}}` only accepts eight names
(`note, یادداشت, upper-alpha, upper-roman, persian-alpha, lower-alpha, lower-greek,
lower-roman`) and falls back to persian-alpha for anything else, which hides the notes again.
`{{پانویس}}` passes `group=` straight to `<references>`, so it is used for every other name
(`nb`, `n`, `fn`, `پاورقی`, `نکته`, `Anm.`, …).

An edit is also refused if the result would contain `~~~~`, which MediaWiki would turn into a
signature.

Edit summary: `افزودن فهرست یادداشت‌های جاافتاده؛ بدون آن متن یادداشت‌ها اصلاً نمایش داده
نمی‌شد`.

## Finding the targets

Tracking category: `رده:صفحه‌های دارای یادداشت که فهرست یادداشت‌ها در آنها جا افتاده است`.
Only namespaces 0 and 118 (پیش‌نویس) are read. Templates and project pages are left out,
because a template body rendered on its own often looks broken by design.

Neither `list=categorymembers` nor CirrusSearch `incategory:` is up to date, so `getTargets`
takes the union of both. It then renders every candidate from its own wikitext
(`action=parse` with `text=`, not `page=`, because the parser cache can be days old) and keeps
only the pages that still show «برای گروهی به نام «…»».

The group name comes from Cite's error message, not from the wikitext, because an article can
get `<ref group="nb">` from a transcluded template. `transform()` is pure, so `getTargets`
keeps the render result in a module-level map that `transform` reads (`seedBrokenGroups`
fills the same map in tests).

Because `getTargets` already proves each page is broken, the task sets
`ignoreCheckpoint: true` and works on everything it returns, every run. Pages that are still
listed in the category but render fine are checked again on every run and never marked done.

## Running it

```sh
npx tsx src/run.ts notelist-missing                       # dry run
npx tsx src/run.ts notelist-missing --live --delay 12
npx tsx src/tasks/notelist-missing.test.ts                # offline tests (namespace list, transform)
cd .. && npx tsx bots/src/tasks/task-06/notelist-missing.replay.ts --limit=120   # replay test
```

The replay test needs the network, the `.env` and the notelist journals in the parent repo,
so it is run from there. It fetches the revision from before each past fix and checks that the
task still diagnoses and repairs it, since the category is usually empty and a dry run proves
nothing.

Build the Toolforge bundle only with `npm run bundle`, never with esbuild by hand. A
hand-built bundle makes every `isMain()` guard fire (see `TOOLFORGE.md`).

This task has no `toolforge/` directory or `jobs.yaml`. The job was created with a plain
`toolforge jobs run --schedule`. To recreate it, run the same command again, not `jobs load`:

```sh
become mamouribot toolforge jobs run notelist-watch \
  --command "cd /data/project/mamouribot && BOT_STATE_DIR=/data/project/mamouribot/state node mamouribot.mjs notelist-missing --live --delay 12" \
  --image node20 --mem 1Gi --schedule "*/15 * * * *" \
  --filelog-stdout logs/notelist-watch.out --filelog-stderr logs/notelist-watch.err
```

To stop it, blank `کاربر:MamouriBot/ادامه`, or run `toolforge jobs delete notelist-watch`.
Logs are `~/logs/notelist-watch.out` and `.err`, and the state is in `~/state/`.

## Open

- There is no alerting. A run that silently does nothing looks the same as a healthy one.
  Watch the category size: if it grows while the job reports no work, something is broken.
- The code on Toolforge is a snapshot. Local changes need a rebuild and upload.

## Code

| file | what |
|---|---|
| `src/tasks/task-06/notelist-missing.ts` | the task: `TARGET_NAMESPACES`, `getTargets`, the pure `transform` |
| `src/lib/notelist.ts` (copy of `scripts/lib/notelist.ts`) | all detection and repair rules, shared with `scripts/archive/notelist-sweep.ts` |
| `src/tasks/notelist-missing.test.ts` | offline tests for the task wiring |
| `src/lib/notelist.test.ts` | offline tests for the rules |
| `src/tasks/task-06/notelist-missing.replay.ts` | replay test against real past revisions |
| `src/lib/checkpoint.ts` | the resume state |

On-wiki copy of the code for reviewers: `کاربر:MamouriBot/کد/وظیفه ۶`.
