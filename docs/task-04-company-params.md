# وظیفهٔ ۴: deprecated parameters in {{جعبه اطلاعات شرکت}}

This task replaces deprecated and legacy parameters in `{{جعبه اطلاعات شرکت}}` with the
current ones. The template no longer reads the old names, so their values are hidden in the
infobox. Renaming them brings the field back and takes the page out of the tracking category.

## Status

- **Approved.** Request page:
  `ویکی‌پدیا:سیاست ربات‌رانی/درخواست مجوز/MamouriBot/وظیفه ۴`.
- Runs as MamouriBot, job `cp-daily`, daily at 06:35 UTC (`35 6 * * *`), at most 50 edits
  per run with `--delay 15`.
- The original backlog (about 12,300 pages) is done. The job keeps up with new articles
  created with old parameters, and with pages reverted past the bot's edit in unrelated
  disputes. The category normally holds a couple of dozen pages, so `--limit 50` covers a
  normal day.

## What it changes

- A deprecated or legacy key becomes its current Persian name: `|location=…` →
  `|دفتر مرکزی=…`, `|homepage=…` → `|وبگاه=…`.
- In the same edit, the rest of that infobox is made Persian: English keys get their Persian
  names and `{{Infobox company}}` becomes `{{جعبه اطلاعات شرکت}}`. This only happens alongside
  a real rename. The bot never makes a cosmetic-only edit.

Edit summary: `به‌روزرسانی پارامترهای منسوخ جعبه اطلاعات شرکت و فارسی‌سازی نام پارامترها و
فراخوانی`.

## Rules

- Only keys inside a `{{جعبه اطلاعات شرکت}}` call (or one of its redirects) are touched. A
  parameter with the same name in another template is left alone.
- Values are never changed, only key names and the template name.
- An empty or identical duplicate is merged. A real clash on a field that shows something
  skips the whole article for review. A clash on a cosmetic field keeps both keys.
- A few ambiguous legacy names are reported, not renamed: «توضیح», «نام‌های تجاری»,
  «شکل‌بندی بدنه».

## Targets

`getTargets()` reads the tracking category
`رده:صفحه‌هایی که از جعبه اطلاعات شرکت با پارامترهای منسوخ‌شده استفاده می‌کنند`, so a title
only appears while it still has a deprecated parameter. The task sets
`recheckAfterDays: 30`, so a page that was fixed and later reverted comes back into scope.

## Running it

```sh
npx tsx src/tasks/task-04/company-deprecated-params.test.ts   # offline tests
npx tsx src/run.ts company-deprecated-params --limit 50        # dry run
```

Deployment is `toolforge/task-04-company-params/` (jobs `cp-check`, `cp-dry`, `cp-first`,
`cp-daily`).

```bash
ssh mamouri@login.toolforge.org 'become mamouribot toolforge jobs logs cp-daily'
ssh mamouri@login.toolforge.org 'become mamouribot toolforge jobs restart cp-daily'
```

Don't run `toolforge jobs load` on this task's `jobs.yaml`. A load syncs the whole job list
and deletes every other task's scheduled jobs. Use `toolforge jobs run` and `delete` per job.

To stop it, blank `کاربر:MamouriBot/توقف`, or run `toolforge jobs delete cp-daily`. The
checkpoint is `~/state/company-deprecated-params.json`, so a restart carries on where it
stopped.

## Open

- `کارخانه قند میاندوآب` is in the tracking category, but `fixCompanyParams()` reports
  «جعبه اطلاعات شرکت یافت نشد». It needs a look by hand: the infobox may be inside a
  transcluded template, or the category may be stale.

## Code

| file | what |
|---|---|
| `src/tasks/task-04/company-deprecated-params.ts` | the task (`company-deprecated-params`): the name map, `fixCompanyParams()`, targets |
| `src/tasks/task-04/company-deprecated-params.test.ts` | offline tests |
| `src/tasks/task-04/validate-company-params.ts` | read-only check over the whole category |
| `toolforge/task-04-company-params/` | `run.sh`, `jobs.yaml` |
