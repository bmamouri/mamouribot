# وظیفهٔ ۱ — removing the imported English "use this variant" templates

> **Status (۱۳ اکتبر ۲۰۲۶): APPROVED AND RUNNING.** `{{مجوز دارد}}` from Huji on
> ۱۲ اکتبر ۲۰۲۶ at the [permission request](https://fa.wikipedia.org/wiki/ویکی‌پدیا:سیاست_ربات‌رانی/درخواست_مجوز/MamouriBot/وظیفه_۱).
> Runs as **MamouriBot**, daily at 06:20 UTC, capped at 200 edits per run.

| | |
|---|---|
| Code | `src/tasks/task-01/use-dmy-dates.ts` (+ `.test.ts` — 29 assertions, `validate-dmy.ts`) |
| Task id | `remove-use-dmy-dates` |
| Deployment | `toolforge/task-01-use-dmy-dates/` → job `ud-daily` |

## Why

These are English imports that render **nothing** in a fa.wiki article. Each body is an
edit-preview warning plus two maintenance categories —
`رده:صفحه‌های حاوی الگوی غیر بومی` and `رده:همه صفحه‌های نیازمند تمیزکاری` — and each
`/توضیحات` says «این الگو باید از صفحه حذف شود». They also **ignore every parameter**
they are handed (`|date=…`, `|cs1-dates=l`): unlike en.wiki there is no CS1 date-format
plumbing behind them here, which was checked on the live template source before the first
live edit. `{{EngvarB}}` is blanker still and adds not even the category («این الگو خالی
شده است و هیچ محتوایی به صفحه‌ها اضافه نمی‌کند»). So removal is **render-neutral by
construction**: the article looks identical afterwards and simply leaves the cleanup
category.

## Which templates

Eight canonical titles, twelve names in total, measured live with `prop=redirects` on
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

**Both spellings have to be in the pattern.** A page may transclude either the English
redirect or the Persian target, and matching only the English name leaves the Persian call
in place — page still in the category, run still reporting a clean sweep. That is not
hypothetical: the English-only version saw **54** targets, and widening to the Persian
names took the list to **489**.

### Scope: the variants are under the same approval

The request describes `{{Use dmy dates}}` and said the variants would be «handled by
separate tasks later». The operator decided on ۱۳ اکتبر that they are the same cleanup
under the same permission, which is his call to make: the argument the request makes — an
imported template that renders nothing and whose own doc asks to be removed — is
word-for-word identical for all eight, they share one tracking category, and the method
did not change at all. If a reviewer asks, that is the answer.

## Scope and why it is a permanent job, not a one-off

The request declared ~980 articles and «تناوب اجرا: یک‌بار (و در صورت بازگشت الگو،
گاه‌به‌گاه برای نگهداری)». What prompted asking for the permission at all was that the
category **refills**: editors keep re-importing these templates with machine-translation
tools. The operator said as much on the request page and the approval followed, so this is
deployed as a daily run. At 489 targets and 200 edits a run the backlog takes about three
runs; after that each run only has the day's new imports to clear.

That is also why the task sets `recheckAfterDays: 30`. Without expiry the resume
checkpoint would park a page the first time it was cleaned and filter it out of every
later batch forever — so a page re-broken a week later would sit in the category while the
run reported "nothing to do". Re-checking costs almost nothing because `list=embeddedin`
is authoritative: a title only reappears if it really has the template again.

## Targets

`list=embeddedin` on each of the twelve titles, namespace 0, deduplicated — **not** the
tracking category, which a page can also reach indirectly from a subtemplate. A page
carrying two of these templates (common: dmy dates + British English, e.g. «لمباردها»)
appears once per template and must be deduplicated, or it burns a second `--limit` slot
on a no-op; both templates come out in **one** edit.

## What the edit does

`removeUseDmyDates()` in `use-dmy-dates.ts`:

1. A line holding only the template (with or without `|date=…`) → the whole line goes.
   If that was the page's first line, the leading blank line it would leave is trimmed:
   invisible in the render, but the gate rejects it («صفحه با سطر خالی آغاز می‌شود») and it
   blocked three وظیفهٔ ۱۵ removals before that task learned the same trim. A mid-page
   paragraph break is preserved.
2. Any remaining inline occurrence (template glued to other content, e.g.
   `{{درباره|…}}{{Use dmy dates|date=March 2022}}` in «صوفیه») → only that call is cut,
   the neighbour is untouched.

If the call is not in the wikitext at all the page is left **unedited** and reported: it
reaches the category through a subtemplate. Two pages were measured in that state
(«انتخابات ریاست‌جمهوری فرانسه (۲۰۰۷)» and «(۲۰۱۷)»). The bot never saves a no-op edit.

## Operating it

```bash
ssh mamouri@login.toolforge.org 'become mamouribot toolforge jobs logs ud-daily'
ssh mamouri@login.toolforge.org 'become mamouribot toolforge jobs restart ud-daily'
```

Do NOT `toolforge jobs load` the task's jobs.yaml — a load SYNCS and would delete the
other tasks' scheduled jobs. Use `toolforge jobs run` / `delete` per job.

Stopping: blank `کاربر:MamouriBot/توقف`, or `toolforge jobs delete ud-daily`. The
checkpoint in `~/state/` means a restart resumes rather than repeats.

## Rollout log, ۱۳ اکتبر ۲۰۲۶

| what | outcome |
|---|---|
| 20 live edits (English-name version), audited diff by diff against the live pages | all 20 removed exactly the template line and nothing else; every page shrank by 18–45 bytes |
| six of those 20 stayed in `رده:صفحه‌های حاوی الگوی غیر بومی` | correct at the time: they held `Use British/Indian/Australian English`, then out of scope. This is what prompted the operator to widen the task. |
| widening found the Persian template names | the target list went 54 → 489. The English-only enumeration had been reporting a nearly-drained backlog while most calls used the Persian redirect target. |
| 12 more live edits with the widened code, audited | clean, including a page with two of the templates removed in one edit |
