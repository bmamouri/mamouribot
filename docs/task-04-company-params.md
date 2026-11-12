# وظیفهٔ ۴: deprecated parameters in {{جعبه اطلاعات شرکت}}

This task replaces deprecated and legacy parameters in `{{جعبه اطلاعات شرکت}}` with the
current ones.

**Status (۱۰ نوامبر ۲۰۲۶): approved and running continuously.** Huji gave
`{{مجوز دارد}}` on ۱۳ ژوئیهٔ ۲۰۲۶. It runs as MamouriBot, daily at 06:35 UTC, with at most
50 edits per run.

| | |
|---|---|
| Code | `src/tasks/task-04/company-deprecated-params.ts` (+ `.test.ts`, 27 assertions) |
| Task id | `company-deprecated-params` |
| Deployment | `toolforge/task-04-company-params/` → job `cp-daily` |

## From a one-off sweep to a daily job

The request (`ویکی‌پدیا:سیاست ربات‌رانی/درخواست مجوز/MamouriBot/وظیفه ۴`) was for a
one-off sweep, and it ran that way on ۱۳ ژوئیه ۲۰۲۶: about 12,300 pages, all now in the
`done` bucket of `.state/company-deprecated-params.json`.

By ۱۰ نوامبر ۲۰۲۶ the tracking category
(`رده:صفحه‌هایی که از جعبه اطلاعات شرکت با پارامترهای منسوخ‌شده استفاده می‌کنند`) held 22
pages again. The original backlog had been cleared (over 99.8%). These were new, from two
sources, and I confirmed both on live pages before changing anything:

1. New articles created with a legacy or English parameter, e.g. «الف آلفا» (created
   ۱۸ سپتامبر ۲۰۲۶ with `مکان` instead of the current field), «تینکینگ ماشینز لب»
   (created ۲۷ اکتبر) and «مجله لومینا» (created ۵ نوامبر). None of these existed in July.
2. Pages the bot had already fixed that were later reverted to a revision from before its
   edit, by a content dispute or a vandalism rollback that had nothing to do with the
   infobox. Five pages: «بانک آینده», «تایپ-مون», «سناباد خودرو»,
   «شرکت توزیع نیروی برق تهران بزرگ», «مهاب قدس». Each shows MamouriBot's July edit in its
   history, undone later by someone reverting something else.

The old checkpoint marked a title done forever, so it could see neither case: a title was
skipped in every later run, and the runs reported "nothing to do" while the category filled
up. I gave it the same fix as وظیفهٔ ۱ (`recheckAfterDays: 30`) rather than re-running it
by hand whenever someone noticed the category again.

## Why re-checking is safe and cheap

`getTargets()` reads the tracking category itself, so a title only appears if it still (or
again) has a deprecated or legacy parameter in the infobox. There is no separate target
list to rebuild. Re-checking a title that was done before costs one more render of a page
that is already in the category, not a new pass over the 12,300 pages. The category
normally holds a couple of dozen pages, so `--limit 50` easily covers a normal day.

## Rollout, ۱۰ نوامبر ۲۰۲۶

| what | outcome |
|---|---|
| `--check` | credentials, bot flag, stop page all clean |
| dry run (`--limit 50`) | 22 targets, 21 ready, 1 no-change (`کارخانه قند میاندوآب`: no infobox call found; an old oddity, not a bug) |
| first live batch (`--live --limit 5`) | 5/5 edited, summaries carry the BRFA link, bot flag set |
| rendered before/after on those 5 | error-marker count unchanged on every page (0→0 ×2, 2→2 ×2, 18→18 ×1) |
| remaining batch (`--live --limit 25`) | 16 more edited, 1 no-change (the same page), 0 self-reverts |
| rendered before/after on 6 more of those | error-marker count unchanged on all 6 |
| category after the run | 22 → 1 (the page with no infobox call) |
| `cp-daily` scheduled | `35 6 * * *` UTC, clear of `ud-daily` (06:20) and `tf-daily` (06:50) |

## Operating it

```bash
ssh mamouri@login.toolforge.org 'become mamouribot toolforge jobs logs cp-daily'
ssh mamouri@login.toolforge.org 'become mamouribot toolforge jobs restart cp-daily'
```

Don't run `toolforge jobs load` on this task's `jobs.yaml`. A load syncs the whole job list
and deletes every other task's scheduled jobs. Use `toolforge jobs run` and `delete` per
job.

To stop it, blank `کاربر:MamouriBot/توقف`, or run `toolforge jobs delete cp-daily`. The
checkpoint in `~/state/company-deprecated-params.json` means a restart carries on where it
stopped instead of starting over.

## The one page the task has never touched

`کارخانه قند میاندوآب` is in the tracking category, but `fixCompanyParams()` reports
«جعبه اطلاعات شرکت یافت نشد»: the category and the search for the infobox call disagree.
It needs a look by hand (the infobox may be inside a transcluded template, or the category
may be stale). The task is right to leave it, since it has no edit it can justify.
