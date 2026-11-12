# وظیفهٔ ۳: citation parameter normalization

This task brings the archive parameters of CS1/CS2 citations onto one name per field, merges
duplicate aliases of the same field, and removes the deprecated `ref=harv`. It started as
وظیفه ۳ (the `dead-url` family and `ref=harv`) and I expanded it to cover the archive
parameters as well.

## Where it stands

- {{مجوز دارد}} was granted on ۸ اکتبر ۲۰۲۶, after a trial.
- It runs on Toolforge as the cron job `cite-params-hourly` (`25 * * * *`,
  `--live --limit 250 --delay 5`).
- On ۱۳ اکتبر ۲۰۲۶ I stopped it, fixed two defects in how it chose the script of a key and
  of a value, and resumed it the same day. See [the ۱۳ اکتبر fixes](#which-script-a-rename-writes-fixed-۱۳-اکتبر-۲۰۲۶)
  below.
- Still open: a separate follow-up for «شابک نادرست» → `((…))` plus the module deprecation,
  and scoping the existing mixed-script backlog (`TODO.md` §0).

The other docs for this task:

| doc | what it covers |
|---|---|
| `docs/task-03-trial-state.md` | the 1,000-edit trial, up to ۷ اکتبر ۲۰۲۶, and the manual-review page |
| `docs/task-03-run-state.md` | the full run from ۸ اکتبر ۲۰۲۶: approved scope, target list, pacing, `ref=harv` |
| `docs/task-03-open-defect.md` | the `archive.today` / CS1 module defect, its diagnosis and the module fix |

## Why

After the fa CS1 citation templates were localized, citations across the wiki carry a mix of
English/legacy and Persian names for the same field. Many carry two aliases of one field at
once, so CS1 shows «متغیر تکراری» (duplicate parameter) and the pages collect in
«رده:صفحه‌های دارای ارجاع با متغیر تکراری». Most of the recent duplicates came from
InternetArchiveBot re-archiving citations that already had an archive parameter under a
different alias.

I fixed the IABot side first, so that no new duplicates are created (my notes on this are
`iabot-archive-param-dedup` and `citation-cleanup-bot`). Live on the wiki, all as Mamouri:

- TemplateData of یادکرد وب/خبر/ژورنال/کتاب: English and both Persian archive names are
  aliases of one field, so IABot recognizes an existing parameter and updates it in place
  instead of adding another (revs 44510536/44/55/58, consolidation 44514798/99/804/809).
- `پودمان:Citation/CS1/Configuration` rev 44514521: Persian name first in
  `['ArchiveURL']`/`['ArchiveDate']`.
- IABot now writes Persian and creates no new duplicates (for example یعره rev 44515396).

This task cleans up the backlog that was already there and migrates the legacy names. I
wanted the citation cleanup done once, so the scope is as wide as I could justify.

## What it does

For every CS1/CS2 citation (`{{یادکرد …}}`, `{{cite …}}`, `{{citation}}`), and for each field
in the map, it renames whatever alias is present to the canonical name. When two or more
aliases of one field are present, it merges them into one:

- Values are compared after converting Persian/Arabic digits to Western ones (and applying
  the field's value map). If the values really differ, the field is left alone and the
  citation goes on the manual-review list. The bot never guesses which value is right and
  never converts calendars.
- Otherwise it keeps one parameter, renames its key to the canonical name and drops the
  rest. The kept value and the whitespace around it are preserved, and only citation
  templates are touched.

That one pass both empties the tracking category and does the legacy-name migration.

### Canonical names (decided 2026-09-27: Persian, short and native, avoiding loanwords where possible)

| Field | Canonical | Aliases normalized to it |
|---|---|---|
| archive-url | **نشانی بایگانی** | پیوند بایگانی, archive-url, archiveurl |
| archive-date | **تاریخ بایگانی** | archive-date, archivedate (تاریخ is naturalized Arabic, but it is the only Persian option; a native replacement would need a module change) |
| url-status | **چگونگی پیوند** | پیوند مرده, url-status, dead-url, deadurl. Originally switched off (`ENABLE_URL_STATUS=false`) until the dead/live values of «چگونگی پیوند» were confirmed on the wiki; they now are, and `ENABLE_URL_STATUS=true`. |

The archive-url canonical was later changed from `نشانی بایگانی` to `پیوند بایگانی`, the
name the CS1 configuration declares (see `docs/task-03-trial-state.md`). Since ۱۳ اکتبر
۲۰۲۶ each of these three fields also has an English canonical, used in English-named
citations (see below).

`dead-url`/`deadurl` take yes/no, while url-status takes dead/live, so this field also
applies a value map (yes → dead, no → live). That is why it was switched off until the values
were confirmed.

I left «شابک نادرست» → `((…))` out on purpose. Converting the uses happens in articles, but
retiring the parameter needs a module change, so it is a separate follow-up that does both
together.

## Files

- `src/tasks/task-03/normalize-cite-params.ts`: the `BotTask` (engine, `FIELDS` map, `getTargets`).
- `src/tasks/task-03/normalize-cite-params.test.ts`: unit tests (`npx tsx …`), 8 cases including the یاور همدانی Persian↔Persian duplicate.
- Registered in `src/run.ts` as task id `normalize-cite-params`.
- Framework: `src/core.ts` (render check, resume, stop page `کاربر:MamouriBot/توقف`, maxlag, opt-out, all automatic).

## Running it

Read `docs/TOOLFORGE.md` first. A dry run is the default; `--live` writes.

```sh
npx tsx src/run.ts normalize-cite-params --limit 30            # DRY-RUN (default): inspect diffs, no writes
npx tsx src/run.ts normalize-cite-params --check              # verify MamouriBot creds + stop-page, no edits
npx tsx src/run.ts normalize-cite-params --live --limit 50    # LIVE, capped (needs bot creds + bot flag)
npx tsx src/run.ts normalize-cite-params --live --delay 12    # LIVE, 12s between edits (default 10)
```

`getTargets` returns the duplicate category plus `insource:` hits for the legacy aliases, so
the set is large. I planned it in two waves: the duplicate category first (those pages show
an error), then the wider legacy-name migration. The live run now works from a frozen,
shuffled target list instead; see `docs/task-03-run-state.md`. On Toolforge the edits go out
as MamouriBot, with the bot flag and a Persian summary.

## History

1. I posted the expansion on the request page; {{مجوز دارد}} was granted ۸ اکتبر ۲۰۲۶.
2. Dry run and live trial reviewed: `docs/task-03-trial-state.md` and `docs/task-03-run-state.md`.
3. The «چگونگی پیوند» values were confirmed on the wiki; `ENABLE_URL_STATUS=true`.
4. The Toolforge job `cite-params-hourly` was deployed, stopped on ۱۳ اکتبر ۲۰۲۶ for the fixes
   below, and resumed the same day after an 80-page dry-run sample showed 0 regressions and
   0 render errors.
5. To resume, I rebuilt the bundle with `npm run bundle` and redeployed it over stdin as in
   `docs/TOOLFORGE.md`, checked it with `grep -c citationScript`, and restarted the cron with
   the same command and schedule (`cite-params-hourly`, `25 * * * *`,
   `--live --limit 250 --delay 5`). The first redeploy went to the wrong file; see
   [the deploy path](#the-redeploy-did-not-take-effect-at-first).
6. Not done: «شابک نادرست» → `((…))` and the module deprecation.
7. Not done: scoping the existing mixed-script backlog (`TODO.md` §0).

## Which script a rename writes (fixed ۱۳ اکتبر ۲۰۲۶)

Until ۱۳ اکتبر the rename always wrote the Persian name, even into a citation whose other
parameters were all English. On
[نادیا اووسو](https://fa.wikipedia.org/w/index.php?title=نادیا_اووسو&diff=next&oldid=42998792)
a `{{cite book|last1=Այվազյան|first1=…|title=…|publisher=…}}` got Persian keys dropped into
it: `|چگونگی پیوند=|پیوند بایگانی=|تاریخ بایگانی=`. Each rename was a valid CS1 alias of the
right field, but the citation as a whole became less consistent, which is the opposite of
«هم‌سان‌سازی».

The three renaming fields (`archive-url`, `archive-date`, `url-status`) now carry a Persian
canonical (`canonical`) and an English one (`canonicalEn`). `citationScript()` in
`normalize-cite-params.ts` chooses between them per citation, by counting the script of
every other parameter name on that citation. It ignores the field being decided and the
template name: `{{cite web}}` with all-Persian parameters is common, and using the template
name made the no-signal case worse (a bare `{{cite web|deadurl=no}}`). A tie, including a
citation with no other parameters, defaults to Persian, which is the house style and what the
task always did. The ten `dedupeOnly` fields are unaffected: they never rename, and their
`canonical` is only the label on the report page.

The url-status value follows the same choice. `urlStatusWrite` takes the script and writes
`dead`/`live` in an English citation and `مرده`/`زنده` in a Persian one.

Tests in `normalize-cite-params.test.ts`: the Nadia Owusu citation, an all-English citation,
an all-Persian citation (still writes Persian), the no-other-parameters default, the
tie-break default, and `citationScript()` on its own. All pass under `CITE_WIDENED_SCOPE=1`
(96 passed) and under the default approved scope (82 passed, 14 skipped by design).

I have not touched the citations the bot already wrote under the old always-Persian rule, or
the hand-written mixed-script citations that were there before. Scoping that is `TODO.md` §0,
left for later so it does not get in the way of the backlog this task is working through.

### The value did not follow the key

The same day I found a second, bigger defect in the same place. On
[سیارک ۱۴۳۴۹](https://fa.wikipedia.org/w/index.php?title=سیارک_۱۴۳۴۹&diff=44719012&oldid=44232856)
`dead-url=yes` merged with an existing `url-status=dead` gave `|چگونگی پیوند =dead`: a
Persian key with an English value.

`urlStatusWrite` returned a value unchanged if the module already accepted it (`dead`,
`live`, `مرده`, `زنده`, `unfit`, `usurped`, `bot: unknown`). That was meant to avoid churn on
a field nobody was editing, but it also applied to every merge and every rename, which are
exactly the cases where the value has to follow the key into the new script.

The decision whether to translate the value now lives in the caller, `normalizeSpan`.
`fieldUntouched` is true only when there is a single alias already at the canonical name for
the citation's script, and that is the only case where the value is left alone. In a merge or
a rename the value is always translated. `urlStatusWrite` no longer has an early return for
values that are already valid.

This defect was more common than the key one. In a sample of 600 of the bot's past edits it
showed up on **45.0%** of pages (95% CI 41.0–49.0%), against 31.0% for the key-script bug,
because it also hits plain renames. That is about **3,180 pages** (95% CI 2,900–3,460) of the
bot's ~7,065 edits so far with a Persian `چگونگی پیوند` key and an English `dead`/`live`
value. These pages largely overlap with the key-mismatch pages in `TODO.md` §0, and both
feed one retrofit pass, not two.

Tests added: the full سیارک ۱۴۳۴۹ citation, a merge in an English citation (the value stays
English), and two no-churn tests (Persian and English) showing the real no-op case still
writes nothing. 103/103 pass under `CITE_WIDENED_SCOPE=1`, 89/103 under the default approved
scope (14 skipped by design).

سیارک ۱۴۳۴۹ was edited before the key-script fix, under the original behaviour, so this
defect was not introduced by that fix. It has been there since the task's first live edit,
and the 45.0% rate covers the whole backlog since وظیفهٔ ۳ started. No batch ran between the
two fixes going live. Before assuming a short exposure window for any defect, check
`usercontribs` timestamps against the real deploy times.

### The redeploy did not take effect at first

[سیارک ۱۰۷۲۹](https://fa.wikipedia.org/w/index.php?title=سیارک_۱۰۷۲۹&diff=44720452&oldid=44231025),
edited at **20:30 UTC** after both fixes had supposedly been redeployed, still had
`|چگونگی پیوند =dead`.

The code was fine; the deploy path was wrong. `toolforge/task-03-cite-params/run.sh` runs
`node ../mamouribot.mjs` relative to its own directory (`~/task-03-cite-params/`), which is
the tool home's `~/mamouribot.mjs`. Both redeploys that day went to `~/bot/mamouribot.mjs`.
That path exists (وظیفهٔ ۵'s Python script lives there) and `grep -c <new code>` on it looked
right, but nothing on the server reads it. The cron kept running the ۹ اکتبر bundle, three
days and both fixes behind. `--check` and a `--wait`ed live run of `--check` only test the
login and stop page, not which file `run.sh` runs, so they did not catch it. See the ⚠ in
`docs/TOOLFORGE.md` and `lessons/scripts-and-batch/toolforge-deploy-path-must-match-run-sh.md`.

I copied the same bundle to `~/mamouribot.mjs`, checked `grep -c fieldUntouched
~/mamouribot.mjs` → 2, and ran the task through the real `run.sh` (`TARGET_TITLES=…
BOT_STATE_DIR=/tmp/… ./task-03-cite-params/run.sh --limit N`, dry run, no writes) on fresh
`dead-url`/`url-status` citations. They came out as `چگونگی پیوند=مرده` / `=زنده`. Then I
restarted the job.

Every edit this task made after the first fix was announced and before 21:01 UTC that day
ran the original buggy code. The retrofit numbers in `TODO.md` §0/§0b are not affected,
because they were measured from `usercontribs` and describe the wiki as it is. Any fix time
for this task should be checked against `~/mamouribot.mjs` itself before it is trusted.

## The expansion as posted on the request page

> پیرو درخواست وظیفهٔ ۳، دامنهٔ این وظیفه را کمی گسترده‌تر می‌کنم تا همهٔ ناسازگاری‌های
> نام‌گذاری پارامترهای بایگانیِ یادکردها یک‌جا سامان بگیرد. علاوه بر تبدیل پارامترهای
> قدیمیِ وضعیت پیوند، ربات نام پارامترهای بایگانی را نیز به نام فارسی معیار هم‌سان می‌کند:
> `archive-url`/`archiveurl`/«پیوند بایگانی» ← «نشانی بایگانی» و `archive-date`/`archivedate`
> ← «تاریخ بایگانی». هدف اصلی خالی‌کردن ردهٔ «صفحه‌های دارای ارجاع با متغیر تکراری» است که
> بیشترشان از بایگانی دوبارهٔ ربات اینترنت‌آرشیو پدید آمده‌اند.
>
> ملاحظات ایمنی: ربات فقط وقتی دو پارامترِ هم‌ارز را ادغام می‌کند که مقدارشان یکسان باشد؛
> اگر دو مقدار متفاوت باشند، آن یادکرد را دست‌نخورده می‌گذارد و برای بازبینی دستی گزارش
> می‌کند (هیچ حدسی دربارهٔ درستیِ مقدار نمی‌زند و هیچ تقویمی را تبدیل نمی‌کند). پیش از هر
> ذخیره، شمار خطاهای نمایشی صفحه پیش و پس از ویرایش مقایسه می‌شود و اگر خطایی افزوده شود
> ویرایش انجام نمی‌شود. تنها الگوهای یادکرد بررسی می‌شوند و مقدارها و فاصله‌گذاری حفظ می‌شود.
> «شابک نادرست» فعلاً در این وظیفه نیست چون کنارگذاشتنِ کامل آن نیاز به تغییر پودمان دارد.
