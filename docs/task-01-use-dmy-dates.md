# وظیفهٔ ۱: removing the imported English "use this variant" templates

This task removes `{{Use dmy dates}}` and its seven sibling templates from fa articles.

**Status (۱۳ اکتبر ۲۰۲۶): approved and running.** Huji gave `{{مجوز دارد}}` on
۱۲ اکتبر ۲۰۲۶ at the [permission request](https://fa.wikipedia.org/wiki/ویکی‌پدیا:سیاست_ربات‌رانی/درخواست_مجوز/MamouriBot/وظیفه_۱).
It runs as MamouriBot, daily at 06:20 UTC, with at most 200 edits per run.

| | |
|---|---|
| Code | `src/tasks/task-01/use-dmy-dates.ts` (+ `.test.ts`, 29 assertions, `validate-dmy.ts`) |
| Task id | `remove-use-dmy-dates` |
| Deployment | `toolforge/task-01-use-dmy-dates/` → job `ud-daily` |

## Why

These templates were imported from English and show nothing in a fa article. Each one is
an edit-preview warning plus two maintenance categories,
`رده:صفحه‌های حاوی الگوی غیر بومی` and `رده:همه صفحه‌های نیازمند تمیزکاری`, and each
`/توضیحات` says «این الگو باید از صفحه حذف شود». They also ignore every parameter they are
given (`|date=…`, `|cs1-dates=l`), because unlike en.wiki there is no CS1 date-format code
behind them here. I checked that on the live template source before the first live edit.
`{{EngvarB}}` is emptier still and does not even add the category («این الگو خالی شده است
و هیچ محتوایی به صفحه‌ها اضافه نمی‌کند»). Removing them therefore cannot change how an
article looks. The article only leaves the cleanup category.

## Which templates

Eight templates, twelve names in total, counted live with `prop=redirects` on
۱۳ اکتبر ۲۰۲۶:

| English name | Persian name it redirects to | ns0 uses |
|---|---|---|
| `Use dmy dates` | `استفاده از تاریخ‌های زمانی` | 54 |
| `Use mdy dates` | `استفاده از تاریخ زمانی` | 42 |
| `Use British English` | `استفاده از انگلیسی بریتانیایی` | 49 |
| `Use American English` | `استفاده از انگلیسی آمریکایی` | 22 |
| `Use Indian English` | — | 7 |
| `Use Australian English` | — | 9 |
| `Use Hong Kong English` | — | 0 |
| `EngvarB` | — | 33 |

The pattern has to include both the English and the Persian names. A page can transclude
either the English redirect or the Persian target, and matching only the English name
leaves the Persian calls in place while the run reports that everything is clean. The
English-only version found 54 targets. With the Persian names added it found 489.

### The variants are covered by the same permission

The request describes `{{Use dmy dates}}` and said the variants would be «handled by
separate tasks later». On ۱۳ اکتبر I decided they fall under the same permission. The
request's argument (an imported template that shows nothing and whose own documentation
asks for it to be removed) applies word for word to all eight, they share one tracking
category, and the method is the same. That is my answer if anyone asks.

## Why it runs every day

The request declared ~980 articles and «تناوب اجرا: یک‌بار (و در صورت بازگشت الگو،
گاه‌به‌گاه برای نگهداری)». The reason I asked for permission at all was that the category
keeps filling up again: editors keep importing these templates with machine-translation
tools. I said so on the request page and it was approved on that basis, so the task runs
daily. At 489 targets and 200 edits a run, the backlog takes about three runs. After that
each run only clears the day's new imports.

For the same reason the task sets `recheckAfterDays: 30`. Without it, the resume
checkpoint would mark a page done the first time it was cleaned and skip it in every later
batch, so a page that got the template back a week later would stay in the category while
the run reported "nothing to do". Re-checking costs almost nothing, because
`list=embeddedin` is reliable: a title only comes back if it really has the template again.

## Targets

`list=embeddedin` on each of the twelve titles, namespace 0, with duplicates removed. I
don't use the tracking category, because a page can also land in it through a
subtemplate. A page with two of these templates (common: dmy dates plus British English,
e.g. «لمباردها») shows up once per template. Without removing duplicates it would use up a
second `--limit` slot on an edit that changes nothing. Both templates come out in one edit.

## What the edit does

`removeUseDmyDates()` in `use-dmy-dates.ts`:

1. If a line holds only the template (with or without `|date=…`), the whole line goes. If
   that was the page's first line, the blank line it would leave at the top is trimmed too.
   It is invisible when rendered, but the publish check rejects it («صفحه با سطر خالی آغاز
   می‌شود»), and it blocked three وظیفهٔ ۱۵ removals before that task got the same trim. A
   paragraph break further down the page is kept.
2. Any other occurrence, where the template sits on the same line as other content (e.g.
   `{{درباره|…}}{{Use dmy dates|date=March 2022}}` in «صوفیه»), has only that call cut. The
   neighbouring template is left alone.

If the call is not in the wikitext at all, the page reaches the category through a
subtemplate. It is reported and not edited. Two pages were in that state when I counted
(«انتخابات ریاست‌جمهوری فرانسه (۲۰۰۷)» and «(۲۰۱۷)»). The bot never saves an edit that
changes nothing.

## Operating it

```bash
ssh mamouri@login.toolforge.org 'become mamouribot toolforge jobs logs ud-daily'
ssh mamouri@login.toolforge.org 'become mamouribot toolforge jobs restart ud-daily'
```

Don't run `toolforge jobs load` on this task's jobs.yaml. A load syncs the whole job list
and deletes the other tasks' scheduled jobs. Use `toolforge jobs run` and `delete` per job.

To stop it, blank `کاربر:MamouriBot/توقف`, or run `toolforge jobs delete ud-daily`. The
checkpoint in `~/state/` means a restart carries on where it stopped instead of starting
over.

## Rollout, ۱۳ اکتبر ۲۰۲۶

| what | outcome |
|---|---|
| 20 live edits (English-name version), checked diff by diff against the live pages | all 20 removed exactly the template line and nothing else; every page shrank by 18–45 bytes |
| six of those 20 stayed in `رده:صفحه‌های حاوی الگوی غیر بومی` | correct at the time: they held `Use British/Indian/Australian English`, which were not yet in scope. This is why I widened the task. |
| widening found the Persian template names | the target list went from 54 to 489. The English-only list had shown an almost empty backlog while most calls used the Persian redirect target. |
| 12 more live edits with the widened code, checked | clean, including a page where two of the templates were removed in one edit |
