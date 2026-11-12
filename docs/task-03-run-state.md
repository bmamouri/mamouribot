# وظیفهٔ ۳: the full run, from ۸ اکتبر ۲۰۲۶

{{مجوز دارد}} was granted on ۸ اکتبر ۲۰۲۶ (full permission, not a trial). The run was stopped
the same day on a defect that turned out to be in the CS1 modules, not in the bot. The bot
now avoids it, and since ۹ اکتبر ۲۰۲۶ the task runs hourly on Toolforge. All numbers here are
measured.

What the task does: `docs/task-03-citation-normalization.md`. The trial before this:
`docs/task-03-trial-state.md`.

## 1. ۸ اکتبر ۲۰۲۶, when the run was stopped

| | |
|---|---|
| Permission | **{{مجوز دارد}}** granted ۸ اکتبر ۲۰۲۶ (full, not a trial) |
| Edits, ۸ اکتبر | **45** (5 self-reverted, all restored byte-identically) |
| Self-reverted by the post-save check | **5** |
| Processed | 75 |
| Checkpoint | 729 done, 15 deferred (`~/state/normalize-cite-params.json`) |
| Job | deleted; `mamouribot` runs only `empty-params`, `notelist-watch`, `destub-watch`, `destub-inventory-monthly` |

I checked each of the 5 reverted pages: the current revision is the bot's own revert and the
wikitext is byte-identical to the state before the bot. No article was left damaged.

Logs on the tool: `~/task-03-cite-params/logs/live{1,2,3}.out`.

## 2. What the permission covers

Read this before widening anything. I checked it term by term against the approved page.

**Approved:** the archive families (`archive-url`, `archiveurl`, `نشانی بایگانی`,
`archive-date`, `archivedate`), the `dead-url` family → `چگونگی پیوند` with `مرده`/`زنده`,
and removing `ref=harv`.

**Not approved, and not mentioned anywhere on the page:** access-date, language, title,
book-title, date, page, pages, periodical, chapter, publisher. The follow-up declared three
deviations; I drafted a fourth covering those ten and removed it before posting.

So those ten are off by default, behind `CITE_WIDENED_SCOPE=1`, and
`src/tasks/task-03/scope.test.ts` checks the default by starting a child process without that
variable. Setting the variable is not permission: those families have to be approved on the
request page first.

## 3. Why the run was stopped

About 20% of the edits in the last batch were self-reverted, all with the message
`|archive-date= نیازمند |archive-url= است`. In the trial the rate had been 0.7%. The trial
drew from the duplicate-parameter category, whose pages mostly had Persian names already.
This run drew from the legacy-alias searches, pages with English parameter names, which are
exactly the citations the en engine renders.

The cause was an `archive.today` URL. `Module:Citation/CS1/en` blanks a parameter holding
such a URL along with its dependents, but its dependency table only knew the English
parameter names, so a Persian-named archive url was blanked while its date survived. A
preview never shows this, because the module skips that step when there is no
`{{REVISIONID}}`.

On ۸ اکتبر ۲۰۲۶ I added a guard to the bot (`ARCHIVE_TODAY_FAMILY` in
`normalize-cite-params.ts`): on any citation with such a URL, the archive family
(`archive-url`, `archive-date`, `url-status`) is left as written, and everything else on the
page is still done. All five pages this run self-reverted carry an archive.today URL. The
same day I also fixed both CS1 Configuration modules.

The full diagnosis, the nine-case table, the Lua and the module fix are in
`docs/task-03-open-defect.md`.

## 4. Which pages to work first

I had said the duplicate-parameter category was «largely drained» for the approved scope,
because one capped run processed 25 pages and made 0 edits. That was wrong, and I repeated it
before checking.

On ۹ اکتبر ۲۰۲۶ I ran a random 300 of the category's members through the task's own
`normalizeCiteParams`:

| scope | would be edited | no change | needs a human |
|---|---|---|---|
| **approved only** | **275 / 300 (۹۲٪)** | 23 | 2 |
| widened (the ten unapproved families) | 286 / 300 | 2 | 12 |

«رده:صفحه‌های دارای ارجاع با متغیر تکراری» holds **45,126** articles (ns0), and about 92%
of them can be fixed under the approved scope alone. These pages come first: a duplicate
parameter shows a visible CS1 error, while a legacy alias renders fine and is only a
migration.

The empty run only covered one 25-page window, on older code (see
`lessons/verification-and-gates/a-zero-needs-a-positive-control.md`). Why that window was
empty is under [the shuffle](#the-list-is-shuffled) below.

The searches are the second set of pages, re-measured the same day:

| query | articles |
|---|---|
| `insource:"archive-url"` | 169,083 |
| `insource:"archive-date"` | 169,006 |
| `insource:"url-status"` | 126,513 |
| `insource:"dead-url"` | 118,378 |
| `insource:"archiveurl"` | 109,295 |
| `insource:"archivedate"` | 109,288 |
| `insource:"پیوند مرده"` | 77,197 |
| `insource:"پیوند بایگانی"` | 45,741 |
| `insource:"نشانی بایگانی"` | 41,505 |
| `insource:"deadurl"` | 12,416 |
| `insource:"ref=harv"` | 1,730 |

### Why the targets are a frozen file

CirrusSearch fails past offset 10,000 (`cirrussearch-offset-too-large`, checked ۹ اکتبر
۲۰۲۶), so enumerating those searches in full during a run throws an error. The in-run cap is
also `limit * 20`, so a scheduled capped run would enumerate the same first window every
time and go idle once it was done, with tens of thousands of pages left.

So the list is collected once and frozen, the category first because those pages show an
error, then the union of the eight search windows:
`scripts/archive/task3-harvest-targets.py` in the companion repo.

## 5. The hourly job, from ۹ اکتبر ۲۰۲۶

The earlier batches were one-off jobs with a `--limit`, so each one finished and disappeared
from `toolforge jobs list`, and the task looked stopped when it had only used up its cap.
With the full permission it is a cron job:

```
cite-params-hourly   scheduled: 25 * * * *
  ./task-03-cite-params/run.sh --live --limit 250 --delay 5
```

`TARGET_FILE` defaults to `targets.txt` inside `run.sh`, so the job command does not set it.
The list has **80,450 titles**: the 45,126 category members first, then the union of the
eight search windows. Checkpoint when this was written: **1,189 done, 15 deferred**. When runs
start reporting nothing to do, regenerate the list, but first check that there really is
nothing left (section 4).

### The list is shuffled

`list=categorymembers` returns pages in a fixed order, and the first pages are almost all
clean already. Measured ۹ اکتبر ۲۰۲۶ with the task's own transform:

| slice of the 45,126 category members | would be edited |
|---|---|
| **first 100 in enumeration order** | **4** |
| random 100 | **100** |
| random 300 | 275 |

A capped run that walks the list from the start edits almost nothing and reports
«موردی برای هم‌سان‌سازی نبود» on every page. That is what the 25-page, 0-edit run was, and
the first hourly run on the unshuffled list did the same: 110 pages, **0 edits**.

So I shuffle the list with a fixed seed before uploading it, and each run's slice has the
same edit rate as the whole list. Rebuild it the same way.

### Pace

| | |
|---|---|
| Cost per edit apart from the delay | **~7s**: read, pre-save render, write, post-save render by `oldid` |
| Observed cadence at `--delay 15` | median **22s** over 429 consecutive gaps |
| At `--delay 5` | ~12s per edit, ~300/hour, ~7,200/day → the list in ~11 days |

Both render checks skip the second parse when the error count is zero, so the 7s is two API
round trips and a write, not four parses. Don't speed it up by dropping the post-save check:
it is the check that caught the archive.today defect and reverted the edits.

- MamouriBot holds `noratelimit` (checked ۹ اکتبر ۲۰۲۶: `ratelimits.edit` is `{}`), so the
  server sets no edit limit. The only limits are `maxlag` and our own delay.
- fa's bot policy itself gives five seconds as an example gap for slowing a bot down
  («فاصله زمانی مثلاً پنج ثانیه»), so `--delay 5` is within policy. The same section asks
  fast bots to slow down at peak hours.
- Parallel runs would not help. `src/pacing.ts` multiplies the gap by the number of
  concurrent runs (like pywikibot's `process_multiplicity`), so N runs each go at 1/N and the
  total is the same. More throughput means a bigger budget, not more workers.
- The pace is my decision, not a constant
  (`lessons/api-and-permissions/pacing-is-the-users-call-not-a-constant.md`). I chose 250 an
  hour at `--delay 5` on ۹ اکتبر ۲۰۲۶, from a table of measured options.

## 6. Checks on the edits themselves

- **The changes are right.** `archiveurl 2→0`, `archivedate 2→0`, `dead-url 2→0`;
  `پیوند بایگانی 0→2`, `تاریخ بایگانی 0→2`, `چگونگی پیوند 0→2`; rendered output identical,
  errors 0→0. Checked with `src/tasks/task-03/verify-trial.ts`.
- **The aliases added late resolve.** `نشانی بایگانی` is merged away; `dead-url=yes` becomes
  `چگونگی پیوند=مرده`; an existing `=dead` was left as it was. (Since ۱۳ اکتبر ۲۰۲۶ the value
  follows the script of the citation; see `docs/task-03-citation-normalization.md`.)
- **Nothing outside a citation changes.** `archive/check-only-citations-changed.ts`: 81 of 81
  pages clean. Its first version compared line by line and reported whole articles as changed,
  because a four-line citation becoming three lines shifts everything after it. `lineDiff` in
  `core.ts` exists to avoid that.

## 7. Removing `ref=harv`

Checked on `امپراتوری بیزانس` (diff 44674319), the page I had asked about:

- `CITEREF` anchors: 188 before, 188 after. None lost or gained, the `Thurn` citation's own
  anchor survives, and there are 0 new broken short-footnote links.
- Only the exact value `harv` was removed; there were no other `ref=` values. This matters
  because `ref=none` suppresses an anchor and `ref={{sfnref|…}}` sets a custom one, and
  dropping either breaks every `{{sfn}}`/`{{پک}}` pointing at it without any error.
- That edit also converted 16 archive parameters, so it was not cosmetic.

The request says `ref=harv` «خطا می‌دهد», but that is no longer true. Rendered side by side,
with and without it: 0 errors, 0 maintenance messages, the same anchor `CITEREFX1900`. (A
first test seemed to show an error span; that was the TemplateStyles phantom floor, which is
why `countErrorMarkers` carries a `class="` prefix.)

So an edit whose only change is removing `ref=harv` is cosmetic, and the request promises
never to make one («ربات هرگز ویرایشِ صرفاً آرایشی ثبت نمی‌کند»). It can happen: of 30 pages
with `ref=harv`, one (`ریاضیات`) would get a harv-only edit, and the other 29 had real work
too. Over ~1,735 pages that is roughly 60 cosmetic edits.

Still to do: skip the edit when removing `ref=harv` is the only change, and pick those pages
up when they next have real work.

## 8. Open items, in order

1. ~~Fix the CS1 alias asymmetry~~: done in the bot (section 3). Resume the run.
2. Skip the harv-only cosmetic edit (section 7).
3. Get the ten widened families approved, then set `CITE_WIDENED_SCOPE=1` (section 2).
4. Resume with the command in section 5, in supervised batches, watching the revert rate. If
   it goes above a few percent, stop and look.
