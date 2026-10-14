# Citation-parameter normalization campaign (MamouriBot, وظیفه ۳ expanded)

Self-contained record so this can continue even if all chat context is lost.

## Why
After localizing the fa CS1 citation templates, citations across the wiki carry a
mix of English/legacy and Persian names for the same field, and many carry **two
aliases of one field at once** → CS1 emits «متغیر تکراری» (duplicate parameter)
and the pages pile up in **«رده:صفحه‌های دارای ارجاع با متغیر تکراری»**. The bulk
of the recent duplicates were created by **InternetArchiveBot** re-archiving cites
that already had an archive parameter under a different alias.

That IABot *source* was fixed first (so no NEW duplicates are created) — see the
agent memories `iabot-archive-param-dedup` and `citation-cleanup-bot`. Summary of
what is already live on-wiki (all as Mamouri):
- TemplateData of یادکرد وب/خبر/ژورنال/کتاب: English + both Persian archive names
  are aliases of one field, so IABot recognizes an existing param and updates it
  in place instead of duplicating (revs 44510536/44/55/58, consolidation
  44514798/99/804/809).
- `پودمان:Citation/CS1/Configuration` rev 44514521: Persian name first in
  `['ArchiveURL']`/`['ArchiveDate']`.
- Verified: IABot now writes Persian and creates no new duplicates (e.g. یعره rev 44515396).

**This task cleans the pre-existing backlog** and migrates legacy names — the
"once and for all" citation cleanup the user asked for (maximalist scope).

## What it does — one normalization pass
For every CS1/CS2 citation (`{{یادکرد …}}` / `{{cite …}}` / `{{citation}}`), for
each field in the map, coerce whatever alias is present to the **Persian
canonical**, and when ≥2 aliases of one field coexist, **merge to one**:
- values are compared after normalizing Persian/Arabic digits → Western (+ the
  field's value-map); if the coexisting values genuinely **differ**, the field is
  **left untouched** and the citation is reported for **manual review** — the bot
  never guesses which value is right, never converts calendars.
- otherwise keep one segment, rename its key to the canonical, drop the rest;
  kept value + surrounding whitespace preserved; only citation templates touched.

This single pass does **both** the dedup (drains the tracking category) and the
Task-3 legacy-name migration.

### Canonicals (decided 2026-09-27 — Persian, shortest/native, no loanword where possible)
| Field | Canonical | Aliases normalized to it |
|---|---|---|
| archive-url | **نشانی بایگانی** | پیوند بایگانی, archive-url, archiveurl |
| archive-date | **تاریخ بایگانی** | archive-date, archivedate (تاریخ is naturalized-Arabic; only Persian option — a native replacement would need a module change) |
| url-status | **چگونگی پیوند** | پیوند مرده, url-status, dead-url, deadurl — **GATED OFF** (`ENABLE_URL_STATUS=false`) until the dead/live value vocabulary of «چگونگی پیوند» is confirmed on-wiki |

`dead-url`/`deadurl` are boolean (yes/no) whereas url-status is dead/live, so
enabling that field also applies a value-map (yes→dead, no→live) — hence the gate.

**Excluded on purpose:** «شابک نادرست» → `((…))` accept-as-written. Converting
usages is article-side, but the endgame (retiring the parameter) needs a **module
change**, so it's a separate follow-up (convert usages + deprecate the param together).

## Files
- `src/tasks/task-03/normalize-cite-params.ts` — the `BotTask` (engine + `FIELDS` map + `getTargets`).
- `src/tasks/task-03/normalize-cite-params.test.ts` — unit tests (`npx tsx …`), 8 cases incl. the یاور همدانی Persian↔Persian dup.
- Registered in `src/run.ts` as task id `normalize-cite-params`.
- Framework: `src/core.ts` (render-safety guard, resume, stop-page `کاربر:MamouriBot/توقف`, maxlag, opt-out — all automatic).

## How to run
Read `docs/TOOLFORGE.md` first. **Dry-run is the default; `--live` writes.**
```sh
npx tsx src/run.ts normalize-cite-params --limit 30            # DRY-RUN (default): inspect diffs, no writes
npx tsx src/run.ts normalize-cite-params --check              # verify MamouriBot creds + stop-page, no edits
npx tsx src/run.ts normalize-cite-params --live --limit 50    # LIVE, capped (needs bot creds + bot flag)
npx tsx src/run.ts normalize-cite-params --live --delay 12    # LIVE, 12s between edits (default 10)
```
`getTargets` returns the dup category **plus**
`insource:` hits for legacy aliases → the set is large; use `--limit` to **phase**
it: recommended **wave 1 = the dup category (errors)**, wave 2 = the broader
legacy-name migration. On Toolforge: create a dedicated tool, ship the bundled
`run.ts`, schedule/one-off per TOOLFORGE.md; edits go out as **MamouriBot** (bot
flag, Persian summary, no automation mention).

## Status / next steps
1. ☑ Posted the BRFA expansion; {{مجوز دارد}} granted ۸ اکتبر ۲۰۲۶.
2. ☑ Dry-run + live trial reviewed; see `docs/task-03-run-state.md`.
3. ☑ «چگونگی پیوند» value vocabulary confirmed on-wiki; `ENABLE_URL_STATUS=true`.
4. ☑ Toolforge job `cite-params-hourly` deployed, then **stopped ۱۳ اکتبر ۲۰۲۶** for the
   fix below, then **redeployed and resumed ۱۳ اکتبر ۲۰۲۶** after an 80-page dry-run
   sample (§"Which SCRIPT a rename writes") showed 0 regressions, 0 render errors.
5. ☑ Resumed. `~/bot/mamouribot.mjs` on Toolforge rebuilt via `npm run bundle` and
   redeployed over stdin per `docs/TOOLFORGE.md`; verified with `grep -c citationScript`
   on the deployed bundle before restarting the cron (same command/schedule as before:
   `cite-params-hourly`, `25 * * * *`, `--live --limit 250 --delay 5`).
6. ☐ Separate follow-up: «شابک نادرست» → `((…))` + module deprecation.
7. ☐ Scope the pre-existing mixed-script backlog — `TODO.md` §0.

## Which SCRIPT a rename writes — fixed ۱۳ اکتبر ۲۰۲۶

The canonicals table above says «Persian, shortest/native» and that used to mean the
rename ALWAYS wrote Persian, even into a citation whose every other parameter was
English. Caught on a live diff — [نادیا اووسو](https://fa.wikipedia.org/w/index.php?title=نادیا_اووسو&diff=next&oldid=42998792) —
where a `{{cite book|last1=Այվազյան|first1=…|title=…|publisher=…}}` got a single Persian
key dropped in: `|چگونگی پیوند=|پیوند بایگانی=|تاریخ بایگانی=`. Each rename was
individually a declared CS1 alias of the right field, and the citation as a whole was
made LESS consistent, not more — the opposite of «هم‌سان‌سازی».

**The fix:** the three renaming families (`archive-url`, `archive-date`, `url-status`)
now carry both a Persian canonical (`canonical`) and an English one (`canonicalEn`), and
`citationScript()` in `normalize-cite-params.ts` picks between them per citation by
voting on the SCRIPT of every OTHER parameter name already on that citation (never the
field being decided, and never the template name — `{{cite web}}` with all-Persian
parameters is common enough that the template name alone is not a reliable signal, and
using it regressed the no-signal case: a bare `{{cite web|deadurl=no}}`). A tie,
including a citation with no other parameters at all, defaults to Persian — the
project's house style and the behaviour this task has always had, so the common case
does not regress. The ten `dedupeOnly` families are unaffected: they never rename,
`canonical` there is only the report-page label.

The `url-status` value follows the same choice: `urlStatusWrite` now takes the script and
writes `dead`/`live` for an English-scripted citation, `مرده`/`زنده` for a Persian one —
a value the module already accepts (`dead`, `live`, `unfit`, `usurped`, `bot: unknown`,
`مرده`, `زنده`) is still left exactly as written, so there is no churn either way.

Tests: `normalize-cite-params.test.ts` — the exact Nadia Owusu citation, an all-English
citation, an all-Persian citation (still writes Persian, unchanged behaviour), the
no-other-params default, the tie-break default, and `citationScript()` itself unit-tested
directly. All green under `CITE_WIDENED_SCOPE=1` (96 passed) and under the default
approved-scope run (82 passed, 14 skipped-by-design).

**Not done:** retrofitting citations the bot already wrote under the old,
always-Persian behaviour, or the pre-existing hand-written mixed-script population.
Scoping that is `TODO.md` §0, deliberately left for later so it does not collide with
the backlog this task is already working through.

## A second, bigger defect in the SAME area — fixed ۱۳ اکتبر ۲۰۲۶ (same day, caught by the operator)

The fix above translates the KEY to match the citation's script. It did not reliably
translate the VALUE. Caught on a live edit —
[سیارک ۱۴۳۴۹](https://fa.wikipedia.org/w/index.php?title=سیارک_۱۴۳۴۹&diff=44719012&oldid=44232856) —
where `dead-url=yes` merged with an existing `url-status=dead` produced `|چگونگی پیوند
=dead`: the right Persian KEY, still carrying the English VALUE.

**Root cause:** `urlStatusWrite` had a shortcut — "if the value is already a spelling
the module accepts (`dead`, `live`, `مرده`, `زنده`, `unfit`, `usurped`, `bot: unknown`),
return it untouched" — meant to avoid pointless churn on a field nobody is otherwise
editing. That shortcut fired unconditionally, including on every MERGE (≥2 aliases
present) and every RENAME away from a non-canonical key — i.e. exactly the cases where
the field IS being edited and the value has to follow the key into its new script.

**The fix:** the decision of *whether to translate at all* moved out of `urlStatusWrite`
and into the caller (`normalizeSpan`), where it belongs — `fieldUntouched` is true only
for the genuine no-op case (a single alias already sitting at the canonical name for
this citation's script), which is the only case where leaving the value alone is
correct. Everywhere else (a merge or a rename) the value is now always translated to
match. `urlStatusWrite` itself got simpler: it no longer has a "value already valid"
early-return at all, since the caller now guarantees it is only called when a
translation is wanted.

**Measured impact — bigger than the key-only bug:** a sample of 600 of the bot's own
past edits found this specific value defect on **45.0%** of pages (95% CI 41.0–49.0%),
vs. 31.0% for the key-script bug alone — because it also fires on plain renames, not just
merges. Estimated **≈3,180 pages** (95% CI 2,900–3,460) across the bot's ~7,065 edits so
far carry a Persian `چگونگی پیوند` key with an English `dead`/`live` value. This overlaps
substantially with the key-mismatch population in `TODO.md` §0 rather than adding to it
cleanly — both numbers feed the same eventual retrofit pass, not two separate ones.

Tests added: the exact سیارک ۱۴۳۴۹ citation reproduced in full, a merge in an
English-scripted citation (value must stay English), and two NO-CHURN tests (Persian and
English) proving the genuine no-op case still writes nothing. 103/103 passing under
`CITE_WIDENED_SCOPE=1`, 89/103 under the default approved scope (14 skipped by design).

Redeployed to Toolforge the same day, immediately after the key-script fix and before
a second live batch could run under it — `سیارک ۱۴۳۴۹` itself predates the key-script
fix entirely (it was edited under the ORIGINAL always-Persian-value behaviour, not a
regression introduced by that fix). So the measured 45.0% rate above is against the
**whole** bot backlog since وظیفهٔ ۳ started, not a narrow window — this defect has been
present since the task's first live edit, the key-script fix did not introduce it, and
no batch ran between the two fixes going live. Do not assume a narrow exposure window
without checking `usercontribs` timestamps against the actual deploy times first.

## The redeploy did not actually take effect for either fix — caught ۱۳ اکتبر ۲۰۲۶ via a SECOND live diff

[سیارک ۱۰۷۲۹](https://fa.wikipedia.org/w/index.php?title=سیارک_۱۰۷۲۹&diff=44720452&oldid=44231025),
edited at **20:30 UTC** — after BOTH fixes above were "redeployed" — still shows the
exact same bug: `|چگونگی پیوند =dead`.

**Root cause: wrong deploy path, not a code defect.** `toolforge/task-03-cite-params/
run.sh` execs `node ../mamouribot.mjs` relative to ITS OWN directory
(`~/task-03-cite-params/`), which resolves to the **tool home** `~/mamouribot.mjs`. Both
redeploys that day piped the rebuilt bundle to `~/bot/mamouribot.mjs` instead — a path
that exists (وظیفهٔ ۵'s Python script lives there) and that `grep -c <new code>` on
confirmed looked correct, but that **nothing on the box reads**. The live cron kept
running the stale ۹ اکتبر bundle, three days and both fixes behind, for the entire
redeploy "window." Every verification step done that day — `--check`, a live
`--wait`ed run of `--check` — exercises login/stop-key, not which file the scheduled
job's `run.sh` actually execs, so nothing caught it. See the ⚠ in `docs/TOOLFORGE.md`
and `lessons/scripts-and-batch/toolforge-deploy-path-must-match-run-sh.md`.

**Fixed:** copied the SAME rebuilt bundle to `~/mamouribot.mjs` (the correct path),
verified `grep -c fieldUntouched ~/mamouribot.mjs` → 2, then ran the task through the
REAL `run.sh` wiring (`TARGET_TITLES=… BOT_STATE_DIR=/tmp/… ./task-03-cite-params/
run.sh --limit N`, dry-run, no writes) against fresh `dead-url`/`url-status` citations
and confirmed `چگونگی پیوند=مرده` / `=زنده` — both fixes verified live through the actual
job path, not just the bundle file. Job restarted.

**Open implication:** every edit this task has made SINCE the first "fix" announcement
and before 21:01 UTC this day was made with the ORIGINAL buggy code, because the
redeploys before then never reached the file the job runs. The retrofit-scope numbers
in `TODO.md` §0/§0b (measured against `usercontribs` directly, not against "edits after
the fix") are NOT affected by this — they already describe the live wiki state — but
any claim of the form "edits after `<fix timestamp>` are clean" made earlier today was
false. Don't trust an announced fix time for this task until it is re-verified against
`~/mamouribot.mjs` specifically.

## BRFA expansion (Persian, for the وظیفه ۳ request — user reviews & posts)
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
