# وظیفهٔ ۱: removing the imported English "use this variant" templates

This task removes `{{Use dmy dates}}` and its seven sibling templates from fa articles. They
were imported from English, show nothing in a fa article and ignore their parameters, so
removing them does not change how the article looks. The article only leaves the cleanup
category.

## Status

- **Approved.** Request page:
  `ویکی‌پدیا:سیاست ربات‌رانی/درخواست مجوز/MamouriBot/وظیفه ۱`.
- Runs as MamouriBot, job `ud-daily`, daily at 06:20 UTC, at most 200 edits per run with
  `--delay 15`.
- It runs every day because editors keep importing these templates with machine-translation
  tools, so `رده:صفحه‌های حاوی الگوی غیر بومی` keeps filling up again.

## Which templates

Eight templates, twelve names. Four of the English names redirect to a Persian title, and
most pages use the Persian one, so the task matches both.

| English name | Persian name it redirects to |
|---|---|
| `Use dmy dates` | `استفاده از تاریخ‌های زمانی` |
| `Use mdy dates` | `استفاده از تاریخ زمانی` |
| `Use British English` | `استفاده از انگلیسی بریتانیایی` |
| `Use American English` | `استفاده از انگلیسی آمریکایی` |
| `Use Indian English` | |
| `Use Australian English` | |
| `Use Hong Kong English` | |
| `EngvarB` | |

All eight fall under the one permission: the argument in the request (an imported template
that shows nothing and whose own documentation asks for it to be removed) applies to each.

## Targets

`list=embeddedin` on each of the twelve titles, namespace 0, with duplicates removed. A page
with two of the templates comes back once and both are removed in one edit. I don't use the
tracking category, because a page can also land in it through a subtemplate.

The task sets `recheckAfterDays: 30`, so a page that gets a template back later is picked up
again.

## What the edit does

`removeUseDmyDates()` in `use-dmy-dates.ts`:

1. If a line holds only the template (with or without `|date=…`), the whole line goes. If it
   was the page's first line, the blank line left at the top is trimmed too, because the
   publish check rejects a page that starts with a blank line.
2. If the template shares a line with other content, only the call is cut:
   `{{درباره|…}}{{Use dmy dates|date=March 2022}}` → `{{درباره|…}}`.

If the call is not in the page's wikitext, the page reaches the category through a
subtemplate. It is reported and not edited. The bot never saves an edit that changes nothing.

Edit summary: `حذف الگوهای واردشدهٔ انگلیسی {{Use dmy dates}}، {{Use British English}} و
مانند آن‌ها (در فارسی چیزی نمایش نمی‌دهند)`.

## Running it

```sh
npx tsx src/tasks/task-01/use-dmy-dates.test.ts       # offline tests
npx tsx src/run.ts remove-use-dmy-dates --limit 25    # dry run
```

Deployment is `toolforge/task-01-use-dmy-dates/` (jobs `ud-check`, `ud-dry`, `ud-first`,
`ud-daily`).

```bash
ssh mamouri@login.toolforge.org 'become mamouribot toolforge jobs logs ud-daily'
ssh mamouri@login.toolforge.org 'become mamouribot toolforge jobs restart ud-daily'
```

Don't run `toolforge jobs load` on this task's `jobs.yaml`. A load syncs the whole job list
and deletes the other tasks' scheduled jobs. Use `toolforge jobs run` and `delete` per job.

To stop it, blank `کاربر:MamouriBot/ادامه`, or run `toolforge jobs delete ud-daily`. The
checkpoint is in `~/state/`, so a restart carries on where it stopped.

## Code

| file | what |
|---|---|
| `src/tasks/task-01/use-dmy-dates.ts` | the task (`remove-use-dmy-dates`): targets and `removeUseDmyDates()` |
| `src/tasks/task-01/use-dmy-dates.test.ts` | offline tests |
| `src/tasks/task-01/validate-dmy.ts` | validation script |
| `toolforge/task-01-use-dmy-dates/` | `run.sh`, `jobs.yaml` |
