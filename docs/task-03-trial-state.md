# وظیفهٔ ۳ — trial state, as of ۷ اکتبر ۲۰۲۶

Written as a handover. Everything below is measured, not estimated; where something is
unknown it says so.

## Numbers

| | |
|---|---|
| Approved | up to **۱٬۰۰۰** trial edits (۱۱ ژوئیهٔ ۲۰۲۶) |
| Task-3 content edits made | **834**, over **758** distinct articles |
| Self-reverts by the post-save guard | **6** |
| Total writes against the budget | **840** |
| Budget left | ~160 |
| Last run | 650 processed, 520 edited, 129 no-change, 1 deferred |
| Net wikitext removed | **53,040 bytes** (636 edits shrank the page, 135 grew it, 63 left the size unchanged) |
| Left the duplicate-parameter category | **305 of 758** |

All of these were counted from `list=usercontribs` over 6–7 اکتبر ۲۰۲۶, not from the job
logs, so they include the repair passes. 834 edits over 758 pages means some pages were
edited more than once, which is what the repair runs were.

## Scope widened, ۷ اکتبر ۲۰۲۶ — not yet run live

The operator corrected a claim made in the first draft of the follow-up: the remaining
duplicate families are **not** وظیفهٔ ۴'s work. وظیفهٔ ۴ on-wiki is only
`{{جعبه اطلاعات شرکت}}` deprecated parameters and says nothing about citations;
`src/tasks/task-04/citation-dedup-accessdate.ts` is labelled "Task 4 (addition)" in this
repo but was never filed anywhere. So those families had no owner, and ten of them were
added to this task instead: access-date, language, title, book-title, date, page, pages,
periodical, chapter, publisher.

**All ten are `dedupeOnly`: the redundant parameter is removed and no name is renamed.**
The reason is in the flag's own documentation in the source. Short version: `dead-url` is
deprecated so renaming it IS the job, whereas `title` and `وبگاه` are current and valid,
so renaming them would be the cosmetic-only edit the permission request promises never to
make — and `title` sits on nearly every citation on the wiki.

Measured over 1,000 members of the duplicate-parameter category, read-only:

| | |
|---|---|
| Pages the widened task can edit | 552 |
| Pages with only a value clash | 424 |
| Pages with nothing to do | 24 |
| Clashes found | 1,035 |

Fixes by family: archive-url / archive-date / url-status 431 each, language 72,
access-date 34, periodical 12, title 4.

**access-date is a report family, not a fix family, and that is measured not assumed.**
It accounts for 867 of the 1,035 clashes and the bot can safely fix only 34. Sampling the
pairs shows why: most are ONE date written twice, once Jalali and once Gregorian
(`۱۷ تیر ۱۳۹۵` and `۷ ژوئیهٔ ۲۰۱۶` are the same day; so are `۲۸ شهریور ۱۳۸۸` and
`۱۹ سپتامبر ۲۰۰۹`), and the rest are genuinely different dates from a later re-check of
the link. The bot must not convert calendars and must not choose, so these all go to the
review page.

That is why `buildReview` now groups **per field with a per-field cap** instead of one flat
400-row list: a flat list would be ~87% access-date and the archive worklist the page was
built for would fall off the end. Tested in `review-store.test.ts`.

Nothing in this widening has edited a live page. The approval covers the original scope,
so it stays unrun until the request is updated.

### What the other 453 still-categorised pages carry

Measured, not assumed: a sample of twelve was re-rendered and every remaining duplicate
message was pulled out of the HTML. **Not one was an archive or url-status pair.** They
were `کد زبان`/`زبان` (7), `کتاب`/`عنوان` (4), `بازیابی`/`accessdate` (4),
`نویسنده`/`نام خانوادگی`, `اثر`/`نشریه`, `بخش`/`فصل`. So the task drained its own share
completely on the pages it touched, and the category stays populated because it has
several independent causes. The category held 45,173 pages on ۷ اکتبر ۲۰۲۶.

Every one of those families except `نویسنده`/`نام خانوادگی` is now in scope; see the
section above.

Tool: `tools.mamouribot` (the one tool; see `docs/TOOLFORGE.md`). Deployment lives in
`toolforge/task-03-cite-params/`. Resume checkpoint at `~/state/normalize-cite-params.json`
with a `.pre-canonical` and `.pre-fix-backup` beside it.

## What the task does now

Normalises citation archive parameters to the names the CS1 configuration declares,
merges duplicate aliases of one field, and removes the deprecated `ref=harv`.

- archive url → `پیوند بایگانی` · archive date → `تاریخ بایگانی` · url status → `چگونگی پیوند`
- url-status VALUES are written in Persian (`مرده`/`زنده`) as of ۷ اکتبر ۲۰۲۶, after the
  spellings were added to the CS1 keywords table. A value the module already accepts is
  left exactly as written, so existing `=dead` is never churned. `unfit`, `usurped` and
  `bot: unknown` stay English: no Persian term is in use for them.
- A genuine value clash is never resolved. The field is left alone and recorded.

## The open defect, which blocks asking for the full permission

On a small number of pages the bot's edit raises the CS1 error count, always with the
same message: `|archive-date= نیازمند |archive-url= است`. **Six pages in 840 edits
(0.7%).** All six were self-reverted by the bot and carry no bot-caused error now:

    ۲۴ (مجموعه تلویزیونی)        خطاهای رندر 2→4
    آدم‌ربایی‌های آریل کاسترو     خطاهای رندر 2→4
    احیا (آلبوم امینم)            خطاهای رندر 37→40
    جیسون استاتهام                خطاهای رندر 2→4
    استان لرستان                  خطاهای رندر 19→21
    امبو امپنزا                   خطاهای رندر 4→6

### Ruled out, each by direct test

- **Data loss.** Parameter counts balance exactly. On آدم‌ربایی‌های آریل کاسترو:
  archiveurl 7 + archive-url 3 → 10 Persian; same for dates; deadurl 1 + dead-url 7 → 8.
- **Any single citation.** Every archive-bearing citation on the page rendered alone: clean.
- **The template name.** `{{Cite news}}`, `{{یادکرد خبر}}`, `{{Cite web}}`, `{{یادکرد وب}}`
  × Persian/English archive params: all eight combinations clean.
- **The canonical name choice.** The canonical was changed from `نشانی بایگانی` to
  `پیوند بایگانی` and all 70 then-edited pages re-run: 66 of 68 clean, these same pages
  still regressed. Not the cause.
- **Post-expand size.** 582,980 of 2,097,152 bytes on ۲۴ (مجموعه تلویزیونی). Nowhere near.

### The one live clue

`action=parse&oldid=` and `action=parse&text=` disagree on identical bytes. Re-verified
deliberately, because two earlier conclusions in this task were drawn from the wrong
instrument:

    same 108,226 bytes of wikitext
      oldid= : 4 cs1-visible-error spans, «نیازمند»×1
      text=  : 2 cs1-visible-error spans, «نیازمند»×0

So the defect lives in something a stored-page parse has that a preview parse does not.
That is also exactly why the PRE-save guard cannot see it: a pre-save check has no
revision to parse, so it can only use `text=`.

### Next step

Find what differs between the two parse modes for this page. Bisection cannot be done
offline, because `text=` does not reproduce the defect — it needs saved revisions, so
bisect in a sandbox page or a userspace copy, halving citations between English and
Persian names until the smallest reproducing wikitext is found.

## How it is contained meanwhile

`core.ts` verifies the SAVED revision after every edit: it parses the new revision and
its parent by `oldid`, and if the error count rose it UNDOES the edit and marks the page
deferred. Proved live against the two pages that regress reliably, and it fired 6 times
in the trial, which is the only reason none of those errors is on the wiki now.

## The manual-review page

`ویکی‌پدیا:گزارش دیتابیس/یادکردهای نیازمند بازبینی` exists and holds **38 articles,
164 fields** as of ۷ اکتبر ۲۰۲۶: article, field, and both disagreeing values side by side.

It was nearly lost. `report()` built the page from the CURRENT RUN's findings only, and a
processed page is parked in the checkpoint and never revisited, so the run that found one
clash would have overwritten a page listing fifty, and the trial's own findings were
already gone from memory. Findings now persist in
`$BOT_STATE_DIR/normalize-cite-params.conflicts.json` and the page is rebuilt from the
union; a title re-read and found clean drops off. See `src/tasks/task-03/review-store.ts`
and its tests.

The trial's findings were recovered with `src/tasks/task-03/scan-conflicts.ts`, which
re-reads the titles the checkpoint knows (694 of them) and records what is still
unresolved. It reads articles and never edits one. On Toolforge:

    toolforge jobs run cn-scan-live --image node20 --mem 1Gi \
      --command "./task-03-cite-params/scan.sh --live" --wait

## Where the source of truth is

See the block at the top of `src/tasks/task-03/normalize-cite-params.ts`. Short version:

- `الگو:یادکرد وب` is a bare `{{#invoke:citation/CS1/fa/dispatch|web}}`
- the dispatch picks the engine **per citation** from that citation's `زبان`/`language`:
  LTR to `Module:Citation/CS1/en`, RTL to `Module:citation/CS1/fa`
- each engine loads its own config: `…/en/Configuration`, `…/fa/Configuration`
- `پودمان:Citation/CS1/Configuration` is the BASE module's, which these templates no
  longer use. It is read by **InternetArchiveBot**
- and the rule that matters: **do not conclude a parameter name or value works by reading
  a config table. Render it and look** — with `parse&page=`/`&oldid=`, not `&text=`

## The follow-up

Drafted at `drafts/brfa-task03-trial-report.wiki` in the companion repo, gate-passing
(`check_talk_reply`), every wikilink verified blue, **not posted**. It follows the shape of
the accepted وظیفهٔ ۱۱ trial report: `::`-indented prose, one wikitable, no headings.

Beyond the three points below it declares the deviations from the filed request, which a
reviewer comparing the two WILL notice: the filed request covered only the `dead-url`
family and `ref=harv`, named Python as the implementation language, and promised
`dead`/`live` values. All three changed.

Say these plainly, because a reviewer will find them otherwise:

1. 834 edits, 6 self-reverted, 0.7% regression rate, cause not yet identified, contained
   by a post-save check that reverts automatically.
2. The duplicate-parameter category has several causes. During the trial this task
   drained only the archive and url-status ones, so **a page can be edited by this task
   and still show a duplicate error**, and a reviewer spot-checking one will conclude the
   task does not work unless told. Ten more families are now in scope but have not run.
   Do NOT say the others belong to وظیفهٔ ۴: that was wrong, and the operator caught it.
   وظیفهٔ ۴ is `{{جعبه اطلاعات شرکت}}` only.
3. The code is TypeScript on GitHub, not the Python the original request described.
4. The widened scope is a fourth deviation from the filed request and needs its own
   consent, which is why the follow-up asks for it explicitly rather than mentioning it
   in passing.
