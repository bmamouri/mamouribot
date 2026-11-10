# وظیفهٔ ۴ — {{جعبه اطلاعات شرکت}} deprecated-parameter cleanup

> **Status (۱۰ نوامبر ۲۰۲۶): APPROVED AND RUNNING CONTINUOUSLY.** `{{مجوز دارد}}` from
> Huji on ۱۳ ژوئیهٔ ۲۰۲۶. Runs as **MamouriBot**, daily at 06:35 UTC, capped at 50 edits
> per run.

| | |
|---|---|
| Code | `src/tasks/task-04/company-deprecated-params.ts` (+ `.test.ts` — 27 assertions) |
| Task id | `company-deprecated-params` |
| Deployment | `toolforge/task-04-company-params/` → job `cp-daily` |

## Why it was a one-off, and why that changed

The request (`ویکی‌پدیا:سیاست ربات‌رانی/درخواست مجوز/MamouriBot/وظیفه ۴`) declared a
one-off sweep, and it ran that way on ۱۳ ژوئیه ۲۰۲۶ — ~12,300 pages, all now in
`.state/company-deprecated-params.json`'s `done` bucket.

By ۱۰ نوامبر ۲۰۲۶ the tracking category
(`رده:صفحه‌هایی که از جعبه اطلاعات شرکت با پارامترهای منسوخ‌شده استفاده می‌کنند`) held 22
pages again — not the original backlog (it drained to >99.8%), but a fresh trickle from
two sources, both confirmed on live pages before deploying the fix:

1. **New articles created with a legacy/English param.** E.g. «الف آلفا» (created
   ۱۸ سپتامبر ۲۰۲۶ with `مکان` instead of the canonical field), «تینکینگ ماشینز لب»
   (created ۲۷ اکتبر), «مجله لومینا» (created ۵ نوامبر) — none of these existed in July.
2. **A page the bot already fixed, reverted back past its own edit** by an unrelated
   content dispute or vandalism rollback that happened to land on a pre-fix revision.
   Confirmed on five pages — «بانک آینده», «تایپ-مون», «سناباد خودرو»,
   «شرکت توزیع نیروی برق تهران بزرگ», «مهاب قدس» — each shows `MamouriBot`'s July edit in
   its history, undone later by someone reverting something else entirely.

Both are exactly what the old `done`-forever checkpoint cannot see: a title parked once
is filtered out of every later run, so the category refilling silently produced "nothing
to do" runs. The fix is the same shape as وظیفهٔ ۱ (`recheckAfterDays: 30`) rather than a
manual re-run every time someone notices the category again.

## Why re-checking is safe (and cheap)

`getTargets()` **is** the tracking category itself — a title only appears if it
genuinely still (or again) carries a deprecated/legacy parameter inside the infobox.
Unlike a frozen search-derived target list, there is no separate population to re-derive;
re-checking a previously-`done` title costs one more render of a page that is already a
category member, not a re-sweep of the 12,300-page backlog. The category's steady-state
size is a couple of dozen pages, so `--limit 50` comfortably clears a normal day.

## Rollout, ۱۰ نوامبر ۲۰۲۶

| what | outcome |
|---|---|
| `--check` | credentials, bot flag, stop page all clean |
| dry run (`--limit 50`) | 22 targets, 21 ready, 1 no-change (`کارخانه قند میاندوآب` — no infobox invocation found; a pre-existing anomaly, not a bug) |
| first live batch (`--live --limit 5`) | 5/5 edited, summaries carry the BRFA link, bot flag set |
| rendered before/after on those 5 | error-marker count unchanged on every page (0→0 ×2, 2→2 ×2, 18→18 ×1) |
| remaining batch (`--live --limit 25`) | 16 more edited, 1 no-change (same anomaly), 0 self-reverts |
| rendered before/after on 6 more of those | error-marker count unchanged on all 6 |
| category after the run | 22 → 1 (the one no-infobox anomaly) |
| `cp-daily` scheduled | `35 6 * * *` UTC — clear of `ud-daily` (06:20) and `tf-daily` (06:50) |

## Operating it

```bash
ssh mamouri@login.toolforge.org 'become mamouribot toolforge jobs logs cp-daily'
ssh mamouri@login.toolforge.org 'become mamouribot toolforge jobs restart cp-daily'
```

Do NOT `toolforge jobs load` the task's `jobs.yaml` — a load SYNCS and would delete every
other task's scheduled jobs. Use `toolforge jobs run` / `delete` per job.

Stopping: blank `کاربر:MamouriBot/توقف`, or `toolforge jobs delete cp-daily`. The
checkpoint in `~/state/company-deprecated-params.json` means a restart resumes rather
than repeats.

## The one page the task has never touched

`کارخانه قند میاندوآب` is in the tracking category but `fixCompanyParams()` reports
«جعبه اطلاعات شرکت یافت نشد» — the category membership and the invocation search
disagree. Worth a one-off look (possibly the infobox is inside a transcluded template, or
the category is stale), but it is not a defect in this task: the transform correctly
declines to invent an edit it cannot justify.
