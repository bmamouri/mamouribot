# Missing notes lists (MamouriBot, وظیفه ۶)

This task restores the notes list in articles whose grouped notes have nowhere to display.

It was approved with `{{مجوز دارد}}` on the request on 2026-09-20, and has run continuously
on Toolforge since 2026-10-02. The `{{ربات جدید|MamouriBot|}}` status parameter on the
request page was never filled in, so the page still looks open. The approval is in its
`===بحث===` section.

## Why

Articles translated from en carry explanatory notes that were `{{efn}}` there. The
translation turns them into raw `<ref group="…">` and then drops the list that displays
them, gives it the wrong name, or puts it in the wrong place. No error message shows; the
note text simply never reaches the reader. One article ([[شانگهای]]) was hiding 112 notes.

About 1,400 articles were fixed by hand and with one-off scripts before this task existed
(see `scripts/archive/notelist-sweep.ts` and the sibling `fix-notelist-*` and
`convert-rawref-to-efn` scripts). Translation from en goes on, so the category keeps
gaining members, and that is why this runs continuously instead of as a one-off sweep.

The category (`رده:صفحه‌های دارای یادداشت که فهرست یادداشت‌ها در آنها جا افتاده است`) only
works because of a fix on 2026-09-15. All Cite errors pass through `{{broken ref}}` →
`{{broken ref/cat}}`, and `مدیاویکی:Cite error group refs without references` was passing a
`cat=` parameter that `{{broken ref}}` never implemented. Every one of these pages fell to
`#default` and was lost among 16k generic cite errors. A template editor fixed the two
messages on that date.

## The five classes

Three are fixed automatically. Two are reported and never touched.

| class | what it is | fix |
|---|---|---|
| `missing-container` | notes exist, no list for their group | insert `{{یادداشت‌ها}}` / `{{پانویس|گروه=X}}` under a notes heading, or a new section above `منابع` |
| `misplaced-container` | the list sits *above* the notes it should collect (left over from translation; it lands above the lead). Cite only collects refs that come before the list, so this gives the same error as a missing list while looking present to any wikitext check | remove the stranded list and place it again in the right spot |
| `nested-ref` | `{{sfn}}`/`{{پک}}` inside a raw `<ref group="…">`. The inner template expands to a `<ref>`, and a `<ref>` inside a `<ref>` breaks that group's list. en.wikipedia gives the same error; this is standard Cite behaviour, not an fa defect. (I first thought it was an fa bug, but the detector only matched the Persian error text, so en only *looked* clean.) | convert the notes to `{{یادچپ}}` (fa's `{{efn}}`), which goes through `{{#tag:ref}}` and accepts `{{sfn}}` inside |
| `malformed` | `group=` holds something that was never a group name: a pasted URL, a sentence, a bare number, a lone diacritic. Real examples: a full ISNA URL, `ایج، فارس، ایران`, `3`, `ْ` | never fixed automatically, because adding a list would make the typo permanent. Reported. |
| `unknown` | renders broken, but the rules can't explain why | never fixed automatically. Reported. |

The choice of list template matters. `{{یادداشت‌ها}}` only accepts eight group names
(`note, یادداشت, upper-alpha, upper-roman, persian-alpha, lower-alpha, lower-greek,
lower-roman`) and quietly falls back to persian-alpha for anything else, which hides the
notes again. `{{پانویس}}` passes `group=` straight to `<references>`, so it is the right
template for all the other names (`nb`, `n`, `fn`, `پاورقی`, `نکته`, `Anm.`, …). Getting
this wrong once took a repair pass over 22 articles.

## Finding the targets

The category can't be trusted on its own. `list=categorymembers` and the rendered category
page are both out of date, in both directions: once they showed 0 members while 35
articles were broken, and later 41 while 64 were. CirrusSearch `incategory:` lags too, in
its own way. Twice, articles turned up after I had declared the category empty.

So `getTargets` takes the union of `categorymembers` and `incategory:`, then renders every
candidate again from its own wikitext (`action=parse` with `text=`, not `page=`, since the
page render comes from a parser cache that can be days old), and keeps only the ones that
still show «برای گروهی به نام «…»». Rendering the article is the only reliable test.

The group name comes from Cite's own error message, not from scanning the wikitext,
because an article can get `<ref group="nb">` from a transcluded template. Its own source
then has no grouped ref at all and looks clean. Two articles in the first batch were like
this. `transform()` is pure and synchronous, so `getTargets` keeps the render result in a
module-level map that `transform` reads (`seedBrokenGroups` lets the tests fill the same
map).

## Re-checking: `recheckAfterDays: 30`

The resume checkpoint used to be two plain arrays of titles, so a title could never come
back. A page fixed once was skipped in every later batch, and if it broke again it sat in
the category while the run reported "nothing to do". The same went for a page deferred for
review: it stayed deferred even after the code learned to handle it.

`scripts/lib/checkpoint.ts` now stores `title → timestamp`, and this task sets
`recheckAfterDays: 30`. Expiry is set per task, and only this task turns it on. Turning it
on for everything would make `company-deprecated-params` go over 12,276 pages again on its
next run, and those tasks have their own approvals. Old array state is migrated by
stamping entries with the current time, not by treating them as expired, so the upgrade
can't set off an unexpected full pass. 19 tests in `scripts/lib/checkpoint.test.ts` cover
the expiry boundary, tasks that don't turn it on, corrupt timestamps, and `markDone`
clearing `deferred`.

## Files

- `src/tasks/task-06/notelist-missing.ts`: the task (targets and pure transform)
- `scripts/lib/notelist.ts`: all detection and repair rules, shared with the interactive
  `scripts/archive/notelist-sweep.ts` so the two can't drift apart
- `src/tasks/notelist-missing.test.ts`: replay test. It fetches the revision from before
  the fix for articles that were already fixed, and checks that the task still diagnoses
  and repairs them. The category is empty most of the time, so a live dry run proves
  nothing. Last result: **120 replayed → 114 repaired, 6 correctly deferred, 0 missed.**
- `scripts/lib/checkpoint.ts` + `.test.ts`: the timestamped resume state
- `drafts/mamouribot/brfa-وظیفه-۶.txt`: the request as filed
- on-wiki copy of the code for reviewers: `کاربر:MamouriBot/کد/وظیفه ۶`

## How to run

```sh
npx tsx src/run.ts notelist-missing                 # dry run
npx tsx src/run.ts notelist-missing --live --delay 12
npx tsx src/tasks/notelist-missing.test.ts --limit=120   # replay test
```

⚠️ Build the Toolforge bundle **only** with `npm run bundle`, never with esbuild by hand.
See the warning in `TOOLFORGE.md`: a hand-built bundle makes every `isMain()` guard fire,
and `destub-report`'s main publishes a report page when `--live` is in argv.

On Toolforge: tool `tools.mamouribot` (the only tool), job `notelist-watch`,
`*/15 * * * *` UTC, `--delay 12`. The request promises at least 10 seconds between edits.
How often the run starts is a separate matter: the request gives a schedule only as an
example («اجرای دوره‌ای، برای نمونه هفتگی»), not as a limit, and polling every 15 minutes
stays well within the per-edit minimum.

I switched it from daily (`23 4 * * *`) to every 15 minutes on ۱۱ اکتبر ۲۰۲۶, so that an
article just broken by a translation (the persian-alpha fallback above) gets its notes
list back within minutes instead of staying broken for up to a day. Running it often is
cheap: `getTargets` only renders the pages currently in the tracking category (normally
almost none), and the 10-second minimum between edits is unchanged. This changes how often
the category is checked, not how fast edits go out.

This task has no `~/bot/jobs.yaml` on the server. Tasks 3/8/12/13/14 keep their job
definitions as tracked files under `toolforge/task-NN-*/jobs.yaml` and load them with
`toolforge jobs load`, but this job was created with a plain `toolforge jobs run
--schedule`. To recreate it after a tool rebuild, run that command again (below), not
`jobs load`.

```sh
become mamouribot toolforge jobs run notelist-watch \
  --command "cd /data/project/mamouribot && BOT_STATE_DIR=/data/project/mamouribot/state node mamouribot.mjs notelist-missing --live --delay 12" \
  --image node20 --mem 1Gi --schedule "*/15 * * * *" \
  --filelog-stdout logs/notelist-watch.out --filelog-stderr logs/notelist-watch.err
```

## Status

The backlog was cleared on 2026-10-02: **185 edited, 7 deferred, 4 already fine** out of
196. I rendered 17 of them to check: 17/17 clean, 206 note-list items restored.

### The 7 waiting for a person

Five have mistyped group names (`پ` ×2, `ی` ×2, `8`), where a list must not be added. The
other two:

- **مهاواکیه‌ها**: `misplaced-container` that the code could not move safely.
- **جایزه بفتای بهترین بازیگر نقش اول زن**: the framework's render check refused the edit
  because it would have taken the page from 1 render error to 10. This should be
  understood before the `nested-ref` path is trusted on award-table articles.

They become eligible again 30 days after they were last touched (≈2026-11-02). If the code
is improved for them before then, clear their entries from
`~/bot/.state/notelist-missing.json` on the server so they are retried straight away.

## Known gaps

- **No alerting.** A failed run leaves `~/notelist-daily.err` on the server and nothing
  else, and a run that silently does nothing looks the same as a healthy one. Watch the
  category size: if it grows while the job reports no work, something is broken.
- The code on Toolforge is a snapshot. Local changes need a rebuild and upload; nothing
  deploys itself.
- Pages whose category membership is out of date but which render fine are checked again
  on every run (4 of them on 2026-10-02). They are never marked done, on purpose.
