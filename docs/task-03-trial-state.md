# وظیفهٔ ۳: the trial, up to ۷ اکتبر ۲۰۲۶

This is the state of the trial as of ۷ اکتبر ۲۰۲۶. Full permission came the next day; the run
after that is in `docs/task-03-run-state.md`, and what the task does is in
`docs/task-03-citation-normalization.md`. All numbers here are measured; where something was
unknown at the time, it says so.

## Numbers

| | |
|---|---|
| Approved | up to **۱٬۰۰۰** trial edits (۱۱ ژوئیهٔ ۲۰۲۶) |
| Task-3 content edits made | **834**, over **758** distinct articles |
| Self-reverts by the post-save check | **6** |
| Total writes against the budget | **840** |
| Budget left | ~160 |
| Last run | 650 processed, 520 edited, 129 no-change, 1 deferred |
| Net wikitext removed | **53,040 bytes** (636 edits shrank the page, 135 grew it, 63 left the size unchanged) |
| Left the duplicate-parameter category | **305 of 758** |

I counted these from `list=usercontribs` over 6–7 اکتبر ۲۰۲۶, not from the job logs, so they
include the repair passes. That is why there are 834 edits over 758 pages.

## What the task did in the trial

It normalized citation archive parameters to the names the CS1 configuration declares, merged
duplicate aliases of one field, and removed the deprecated `ref=harv`.

- archive url → `پیوند بایگانی` · archive date → `تاریخ بایگانی` · url status → `چگونگی پیوند`
- url-status values have been written in Persian (`مرده`/`زنده`) since ۷ اکتبر ۲۰۲۶, after
  those spellings were added to the CS1 keywords table. A value the module already accepted was
  left as written, so an existing `=dead` was not changed. `unfit`, `usurped` and
  `bot: unknown` stay English, because no Persian term is in use for them. (Since ۱۳ اکتبر
  ۲۰۲۶ the value follows the script of the citation in a merge or rename; see
  `docs/task-03-citation-normalization.md`.)
- A real value clash is never resolved. The field is left alone and recorded.

Tool: `tools.mamouribot` (the only tool; see `docs/TOOLFORGE.md`). Deployment is in
`toolforge/task-03-cite-params/`. The resume checkpoint is `~/state/normalize-cite-params.json`,
with a `.pre-canonical` and a `.pre-fix-backup` beside it.

## Wider scope, added ۷ اکتبر ۲۰۲۶, not run live

In the first draft of the follow-up I wrote that the remaining duplicate families were
وظیفهٔ ۴'s work. That was wrong. وظیفهٔ ۴ on the wiki covers only the deprecated parameters of
`{{جعبه اطلاعات شرکت}}` and says nothing about citations;
`src/tasks/task-04/citation-dedup-accessdate.ts` is labelled "Task 4 (addition)" in this repo
but was never filed anywhere. So those families had no owner, and I added ten of them to this
task: access-date, language, title, book-title, date, page, pages, periodical, chapter,
publisher.

All ten are `dedupeOnly`: the redundant parameter is removed and nothing is renamed. The
reasoning is in the flag's documentation in the source. In short, `dead-url` is deprecated,
so renaming it is the job, whereas `title` and `وبگاه` are current and valid, so renaming them
would be the cosmetic-only edit the request promises never to make, and `title` is on nearly
every citation on the wiki.

Measured over 1,000 members of the duplicate-parameter category, read-only:

| | |
|---|---|
| Pages the widened task can edit | 552 |
| Pages with only a value clash | 424 |
| Pages with nothing to do | 24 |
| Clashes found | 1,035 |

Fixes by family: archive-url / archive-date / url-status 431 each, language 72, access-date 34,
periodical 12, title 4.

access-date ends up on the review list rather than being fixed. It accounts for 867 of the
1,035 clashes, and the bot can safely fix only 34. In a sample of the pairs, most are one date
written twice, once Jalali and once Gregorian (`۱۷ تیر ۱۳۹۵` and `۷ ژوئیهٔ ۲۰۱۶` are the same
day; so are `۲۸ شهریور ۱۳۸۸` and `۱۹ سپتامبر ۲۰۰۹`), and the rest are different dates from a
later re-check of the link. The bot does not convert calendars or choose between dates, so
all of these go to the review page.

So `buildReview` now groups by field, with a cap per field, instead of one flat 400-row list.
A flat list would be ~87% access-date, and the archive worklist the page was built for would
fall off the end. Tested in `review-store.test.ts`.

None of this wider scope has edited a live page. The approval covers the original scope, so it
stays off until the request is updated. (It is behind `CITE_WIDENED_SCOPE=1`; see
`docs/task-03-run-state.md`.)

### What the other 453 pages still in the category have

I re-rendered a sample of twelve and pulled every remaining duplicate message out of the HTML.
None was an archive or url-status pair. They were `کد زبان`/`زبان` (7), `کتاب`/`عنوان` (4),
`بازیابی`/`accessdate` (4), `نویسنده`/`نام خانوادگی`, `اثر`/`نشریه`, `بخش`/`فصل`. So the task
cleared its own share on every page it touched, and the category stays full because it has
several independent causes. It held 45,173 pages on ۷ اکتبر ۲۰۲۶.

Every one of those families except `نویسنده`/`نام خانوادگی` is now in the wider scope above.

## The defect that held up full permission

On a few pages the bot's edit raised the CS1 error count, always with the message
`|archive-date= نیازمند |archive-url= است`. **Six pages in 840 edits (0.7%).** The bot
reverted all six itself and none carries a bot-caused error now:

    ۲۴ (مجموعه تلویزیونی)        خطاهای رندر 2→4
    آدم‌ربایی‌های آریل کاسترو     خطاهای رندر 2→4
    احیا (آلبوم امینم)            خطاهای رندر 37→40
    جیسون استاتهام                خطاهای رندر 2→4
    استان لرستان                  خطاهای رندر 19→21
    امبو امپنزا                   خطاهای رندر 4→6

At the time of the trial the cause was unknown. On ۸ اکتبر ۲۰۲۶ it turned out to be an
`archive.today` URL meeting a fault in the CS1 Configuration modules, which only shows up in a
saved page and never in a preview. What I ruled out during the trial, the cause, and the fixes
in the bot and the modules are all in `docs/task-03-open-defect.md`.

`core.ts` checks the saved revision after every edit: it parses the new revision and its parent
by `oldid`, and if the error count went up it undoes the edit and marks the page deferred. I
tested it live on the two pages that regressed every time. It fired 6 times in the trial, and
that is the only reason none of those errors is on the wiki now.

## The manual-review page

`ویکی‌پدیا:گزارش دیتابیس/یادکردهای نیازمند بازبینی` exists and held **38 articles, 164
fields** on ۷ اکتبر ۲۰۲۶: the article, the field, and both values side by side.

The bot nearly blanked it. `report()` built the page from the current run's findings only,
and a processed page is parked in the checkpoint and never revisited. So a run that found one
clash would have overwritten a page listing fifty, and the trial's own findings were already
gone from memory. Findings now persist in `$BOT_STATE_DIR/normalize-cite-params.conflicts.json`
and the page is rebuilt from all of them; a title that is re-read and found clean drops off.
See `src/tasks/task-03/review-store.ts` and its tests.

I recovered the trial's findings with `src/tasks/task-03/scan-conflicts.ts`, which re-reads
the titles the checkpoint knows (694 of them) and records what is still unresolved. It reads
articles and never edits them. On Toolforge:

    toolforge jobs run cn-scan-live --image node20 --mem 1Gi \
      --command "./task-03-cite-params/scan.sh --live" --wait

## The trial report

The draft is `drafts/brfa-task03-trial-report.wiki` in the companion repo. It passes the gate
(`check_talk_reply`), every wikilink in it is checked blue, and it was **not posted** as of
۷ اکتبر. It has the same shape as the accepted وظیفهٔ ۱۱ trial report: `::`-indented prose, one
wikitable, no headings.

It lists where the work differs from the filed request: the request covered only the
`dead-url` family and `ref=harv`, named Python as the language, and promised `dead`/`live`
values. All three changed. It says plainly:

1. 834 edits, 6 self-reverted, a 0.7% regression rate, cause not yet found, contained by a
   post-save check that reverts automatically.
2. The duplicate-parameter category has several causes. In the trial this task cleared only
   the archive and url-status ones, so a page can be edited by this task and still show a
   duplicate error. Anyone checking a single page would think the task does not work unless
   told. Ten more families are now in scope but have not run. It does not say the others
   belong to وظیفهٔ ۴: that was my mistake, and وظیفهٔ ۴ is `{{جعبه اطلاعات شرکت}}` only.
3. The code is TypeScript on GitHub, not the Python the original request described.
4. The wider scope is a fourth change from the filed request and needs its own approval, so
   the report asks for it directly instead of mentioning it in passing.
