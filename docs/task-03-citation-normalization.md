# وظیفهٔ ۳: citation parameter normalization

Citations on fa.wikipedia carry several names for the same archive field: `archive-url`,
`archiveurl`, `نشانی بایگانی` and `پیوند بایگانی` all mean one thing. Many citations carry two
of them at once, which CS1 shows as «متغیر تکراری» and files under
«رده:صفحه‌های دارای ارجاع با متغیر تکراری». This task renames each archive parameter to one
name per field, merges duplicates when their values agree, and removes the deprecated `ref=harv`.

## Status

- **Approved.** {{مجوز دارد}} granted ۸ اکتبر ۲۰۲۶. Request page:
  `ویکی‌پدیا:سیاست ربات‌رانی/درخواست مجوز/MamouriBot/وظیفه ۳`.
- Runs on Toolforge (tool `mamouribot`) as MamouriBot, with the bot flag, as the cron job
  `cite-params-hourly`: schedule `25 * * * *`, command
  `./task-03-cite-params/run.sh --live --limit 250 --delay 5`. That is about 300 edits an hour.
- It works from a fixed, shuffled list of 80,450 titles (`targets.txt`).
- Ten more citation families are implemented but not approved, and are off.

## What it changes

| field | Persian citation | English citation | aliases it replaces |
|---|---|---|---|
| archive-url | `پیوند بایگانی` | `archive-url` | `نشانی بایگانی`, `archiveurl` |
| archive-date | `تاریخ بایگانی` | `archive-date` | `archivedate` |
| url-status | `چگونگی پیوند` | `url-status` | `پیوند مرده`, `dead-url`, `deadurl` |

Plus `ref=harv`, which is removed.

```
{{یادکرد وب|عنوان=خ|archive-url=http://a|archive-date=2018|نشانی بایگانی=http://a|تاریخ بایگانی=2018}}
→ {{یادکرد وب|عنوان=خ|پیوند بایگانی=http://a|تاریخ بایگانی=2018}}

{{cite web|last=A|first=B|title=T|dead-url=yes}}
→ {{cite web|last=A|first=B|title=T|url-status=dead}}
```

Edit summary: «همسان‌سازی نام پارامترهای بایگانی یادکردها به نام فارسی و حذف پارامتر تکراری».

## Rules

- **Each citation keeps its own language.** `citationScript()` counts the script of every other
  parameter name on the citation (not the field being renamed, not the template name) and
  writes the Persian or the English name to match. A tie, or a citation with no other
  parameters, gets Persian.
- **The url-status value follows the key.** `yes`/`no` from the old `dead-url` become
  `dead`/`live` in an English citation and `مرده`/`زنده` in a Persian one. In any merge or
  rename the value is translated. A lone parameter already under the right name is left
  alone (`fieldUntouched`). `unfit`, `usurped` and `bot: unknown` stay English; an unknown
  value is never guessed at. The Persian values were confirmed to render on the wiki, and
  `ENABLE_URL_STATUS` is `true`.
- **Values are compared, never chosen.** Values are compared after turning Persian/Arabic
  digits into Western ones and folding Arabic kaf/yeh. If two aliases hold different values,
  that field is left as it is and the citation goes on the review page. The bot does not
  convert calendars.
- **archive.today citations keep their archive parameters.** If a citation has an
  archive.today-family URL (`ARCHIVE_TODAY_FAMILY`), its archive-url, archive-date and
  url-status are left exactly as written. The rest of the page is still done. Renaming half
  of that pair made `Module:Citation/CS1` show «|archive-date= نیازمند |archive-url= است».
  The modules are fixed now; the guard stays until the error category settles (see open
  problems).
- **Only `ref=harv` goes.** The exact, case-sensitive value `harv`. `ref=none`,
  `ref={{sfnref|…}}`, a bare `ref=` and `ref=HARV` are left, because removing them breaks
  short-footnote links without any error.
- Only CS1/CS2 citation templates are touched (`{{یادکرد …}}`, `{{cite …}}`, `{{citation}}`).
  The kept value and the spacing around it are preserved.
- After each save the new revision and its parent are parsed by `oldid`. If the error count
  went up, the edit is undone and the page is deferred. This is the only check that sees the
  archive.today error: a preview (`action=parse&text=`) skips the step that causes it. Don't
  drop it to go faster.
- Don't decide that a parameter name or value works by reading a CS1 configuration table.
  Render it with `parse&page=`/`&oldid=` (or `&text=` plus `&revid=`) and look. The
  `/en/Configuration` and `/fa/Configuration` tables hold no Persian names; those come from
  the overlay in «پودمان:Citation/CS1/fa/i18n».

### Not in scope

- access-date, language, title, book-title, date, page, pages, periodical, chapter and
  publisher. These ten families are implemented as `dedupeOnly` (remove the redundant copy,
  never rename) but are not on the approved request. They run only with
  `CITE_WIDENED_SCOPE=1`, and `src/tasks/task-03/scope.test.ts` checks they are off without
  it. Setting the variable is not permission.
- «شابک نادرست» → `((…))`. Retiring it needs a module change too, so it would be a separate
  task that does both.

## The review page

When values clash, the citation is listed on
`ویکی‌پدیا:گزارش دیتابیس/یادکردهای نیازمند بازبینی`: the article, the field and both values.
Findings are kept in `$BOT_STATE_DIR/normalize-cite-params.conflicts.json`, and the page is
rebuilt from all of them, so one run cannot blank the list. A title re-read and found clean
drops off. `scan.sh` re-reads the titles in the checkpoint and rebuilds the page. It never
edits an article:

```sh
toolforge jobs run cn-scan-live --image node20 --mem 1Gi \
  --command "./task-03-cite-params/scan.sh --live" --wait
```

## Running it

Read `docs/TOOLFORGE.md` first. A dry run is the default; `--live` writes.

```sh
npx tsx src/tasks/task-03/normalize-cite-params.test.ts   # offline tests
npx tsx src/tasks/task-03/review-store.test.ts
npx tsx src/tasks/task-03/scope.test.ts

npx tsx src/run.ts normalize-cite-params --limit 30            # dry run, prints diffs
npx tsx src/run.ts normalize-cite-params --check              # bot login and stop page, no edits
npx tsx src/run.ts normalize-cite-params --live --limit 50    # writes, as MamouriBot
TARGET_TITLES='…|…' npx tsx src/run.ts normalize-cite-params  # specific pages
```

| variable | effect |
|---|---|
| `TARGET_TITLES` | `|`-separated titles to process |
| `TARGET_FILE` | one title per line; `run.sh` sets it to `targets.txt` |
| `TARGET_CAP` | cap on enumerated candidates when there is no file (default `--limit` × 20) |
| `CITE_WIDENED_SCOPE` | `1` turns on the ten unapproved families |
| `BOT_STATE_DIR` | checkpoint and review store; `~/state` on Toolforge |

Without a file, `getTargets` reads the duplicate-parameter category and then `insource:`
searches for the legacy names. The live job does not do that: CirrusSearch fails past offset
10,000, and a capped run would walk the same first window every hour. So the list is
collected once with `scripts/archive/task3-harvest-targets.py` in the companion repo, the
category members first, then shuffled with a fixed seed and uploaded to
`~/task-03-cite-params/targets.txt`. The shuffle matters: the category's first pages in API
order are almost all clean, so an unshuffled list makes a healthy run look finished.

The category held 45,126 articles on ۹ اکتبر ۲۰۲۶, and about 92% of them can be fixed under
the approved scope.

### Toolforge

Deployment is `toolforge/task-03-cite-params/` (`run.sh`, `scan.sh`, `jobs.yaml`). `jobs.yaml`
has `cn-check` and `cn-dry`, plus the old trial jobs `cn-trial-50` and `cn-trial-1000`. The
hourly cron was created by hand with the command and schedule above.

`run.sh` runs `node ../mamouribot.mjs`, so the bundle it uses is `~/mamouribot.mjs` in the
tool home, not `~/bot/mamouribot.mjs`. Build with `npm run bundle`, upload over stdin as in
`docs/TOOLFORGE.md`, then grep `~/mamouribot.mjs` for something the change added before
trusting it (`lessons/scripts-and-batch/toolforge-deploy-path-must-match-run-sh.md`).

### Stopping it, state and logs

- Stop page `کاربر:MamouriBot/توقف` stops every task before its next edit.
- `become mamouribot toolforge jobs delete cite-params-hourly` stops this one; the checkpoint
  keeps its place.
- Checkpoint: `~/state/normalize-cite-params.json`. Review store:
  `~/state/normalize-cite-params.conflicts.json`.
- Log: `~/cite-params-hourly.out`. If the «هدف‌ها:» line shows the same done count run after
  run, the job is stuck, not finished.

## Open problems

- The archive.today guard still skips about 18,400 articles. The CS1 modules were fixed on
  ۸ اکتبر ۲۰۲۶; the guard comes off when «رده:صفحه‌های دارای خطا در نشانی بایگانی» has mostly
  emptied (`TODO.md` §1).
- Citations the bot edited before ۱۳ اکتبر ۲۰۲۶ (about 21:01 UTC) can have a Persian archive
  key in an English citation, or `چگونگی پیوند=dead`. The code was fixed then; past edits are
  not. Measuring and fixing them is `TODO.md` §0.
- An edit whose only change is removing `ref=harv` is cosmetic, which the request promises not
  to make. Roughly 60 pages would get one. Skipping it is `TODO.md` §5.
- The ten widened families wait for approval (`TODO.md` §4).
- InternetArchiveBot may write `dead` back over `مرده` (`TODO.md` §9).
- The target list needs re-harvesting when it runs dry (`TODO.md` §2).

## Code

| file | what |
|---|---|
| `src/tasks/task-03/normalize-cite-params.ts` | the task: `FIELDS`, `citationScript`, `normalizeCiteParams`, `ARCHIVE_TODAY_FAMILY`, `getTargets`, the review page |
| `src/tasks/task-03/normalize-cite-params.test.ts` | offline tests |
| `src/tasks/task-03/scope.test.ts` | the ten families are off without `CITE_WIDENED_SCOPE=1` |
| `src/tasks/task-03/review-store.ts` | the persistent clash list behind the review page |
| `src/tasks/task-03/scan-conflicts.ts`, `scan-conflicts-cli.ts` | re-reads checkpoint titles and rebuilds the review page |
| `src/tasks/task-03/verify-trial.ts` | checks the bot's past edits: before and after wikitext per edit |
| `src/core.ts` | render checks, post-save revert, resume, stop page, maxlag, `{{nobots}}` |
| `toolforge/task-03-cite-params/` | `run.sh`, `scan.sh`, `jobs.yaml` |

Registered in `src/run.ts` as `normalize-cite-params`.
