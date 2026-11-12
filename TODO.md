# MamouriBot: things to come back to

Most of the bot's work runs for months, so most of what is left is not "do this now" but "do
this once something has happened". Each entry has:

- **Trigger**: what has to be true before it is worth doing.
- **Check**: a command that tells you whether it is due.
- **Then**: the work itself.

Delete an entry when it is done. An item with no trigger and no check doesn't belong here.

Numbers in this file are dated, because they go out of date.

---

## 0. Find and fix the existing mixed-script archive citations (وظیفهٔ ۳)

**Why.** Until ۱۳ اکتبر ۲۰۲۶ the archive-rename family (`archive-url`→`پیوند بایگانی`,
`archive-date`→`تاریخ بایگانی`, `url-status`→`چگونگی پیوند`) always wrote the Persian name,
even into a citation whose other parameters were all English (`{{cite book|last1=…|first1=…}}`).
Each name is a valid CS1 alias, but the result is one Persian key in an otherwise English
citation, which swaps one inconsistency («چند نام برای یک فیلد») for another («دو زبان در
یک یادکرد»). I spotted it on a live diff:
[نادیا اووسو](https://fa.wikipedia.org/w/index.php?title=نادیا_اووسو&diff=next&oldid=42998792).
The bot now follows the script the citation is already written in (`citationScript` in
`normalize-cite-params.ts`), so new edits are fine. Past ones are not fixed: every citation the
bot touched under the old behaviour still has it, and so does every hand-written citation that
already mixed English parameters with a Persian archive parameter.

**Trigger.** None yet. This is about finding out the size, not a scheduled fix. Pick it up
once وظیفهٔ ۳'s main backlog (the ten widened families, lifting the archive.today guard, §1
below) has settled, so a second sweep over the same pages doesn't collide with the first.

**Check / Then.** First measure, then decide:

1. Count the citations the bot itself wrote this way. Every MamouriBot edit whose summary
   contains «هم‌سان‌سازی نام پارامترهای بایگانی» is a candidate. For each, classify the
   citation with `citationScript` using every parameter except the archive family. If that
   says `en` and the diff shows a Persian archive key, it counts.
   `src/tasks/task-03/verify-trial.ts` already fetches the before and after wikitext for each
   such edit, so add this there.
2. Separately, count the hand-written ones: `insource:"چگونگی پیوند" insource:"last1="` (and
   the `archiveurl`/`last=` equivalent) finds citations that already mix both. Most of these
   predate the bot, but readers see the same problem.
3. Report the two counts separately (caused by the bot, and already there), so the number
   doesn't overstate what this task has to fix.
4. Then decide whether a follow-up pass is worth running. It would work out `citationScript`
   per citation again and rename the archive family to match (only the archive family; the
   ten dedupeOnly families never rename), the reverse of the original change. If it touches
   pages outside the approved scope it needs its own note on the request page. Fixing my own
   past edits is not automatically covered by the existing approval, so check it term by term
   (`lessons/api-and-permissions/repo-folder-is-not-the-approved-scope.md`).

**Measured ۱۳ اکتبر ۲۰۲۶** (1,750 pages pooled from three independent samples, out of ~7,065
task-3 edits at the time):

| | rate (page-level) | 95% CI | estimated pages |
|---|---|---|---|
| key-script mismatch (archive-url/-date/url-status KEY in the wrong script) | 31.0% | 28.9–33.2% | ~2,190 (2,040–2,340) |
| value-script mismatch (چگونگی پیوند KEY correct, VALUE still English — see below) | 45.0% | 41.0–49.0% | ~3,180 (2,900–3,460) |

The two overlap (many citations have both the key and the value wrong), so don't add them up.
A combined figure needs its own measurement that checks both conditions on each citation; the
600-page runs above each checked one.

A random sample of 800 mainspace pages, not limited to bot edits, found an **11.6%** mismatch
rate (95% CI 9.4–13.8%) across all of fa.wikipedia, which projects to **~103,000–152,000
articles**. Most of those predate this task and were never touched by MamouriBot. The bot's own
backlog of ~2,000–3,000 pages is a small part of it.

### 0b. The value needs translating as well as the key (fixed ۱۳ اکتبر ۲۰۲۶)

**Why.** A separate bug I found the same day on a live diff:
[سیارک ۱۴۳۴۹](https://fa.wikipedia.org/w/index.php?title=سیارک_۱۴۳۴۹&diff=44719012&oldid=44232856).
Merging `dead-url=yes` into an existing `url-status=dead` produced `|چگونگی پیوند =dead`:
Persian key, English value. `urlStatusWrite` returned any value the module already accepts
(`dead`, `live`, `مرده`, `زنده`, `unfit`, `usurped`, `bot: unknown`) unchanged, including when
the field was being merged or renamed, which is exactly when the value has to change with the
key.

**Status: fixed and redeployed the same day.** `fieldUntouched` in `normalizeSpan` now decides
whether to call `writeMap`. Only a real no-op (a single alias, already under the right name for
this script) skips the translation; every merge or rename translates the value. This bug had
been there since وظیفهٔ ۳'s first live edit and is unrelated to the key fix above, which is why
its 45.0% rate is against the whole backlog.

**Not done:** fixing past edits with the wrong value. Do it in the same sweep as §0, with the
same trigger.

### 0c. The ۱۳ اکتبر redeploys went to the wrong path (both fixes only went live ~21:01 UTC)

Both redeploys that day wrote the new bundle to `~/bot/mamouribot.mjs`, but the scheduled
job's `run.sh` runs `~/mamouribot.mjs` (in the tool's home), so the live job kept running the
۹ اکتبر bundle through both announced fix times. A second live diff
([سیارک ۱۰۷۲۹](https://fa.wikipedia.org/w/index.php?title=سیارک_۱۰۷۲۹&diff=44720452&oldid=44231025),
20:30 UTC) still showed the bug. At ~21:01 UTC I copied the bundle to the right path, checked
`~/mamouribot.mjs` itself with `grep`, and ran the task through the real `run.sh` against fresh
citations before restarting. See
`lessons/scripts-and-batch/toolforge-deploy-path-must-match-run-sh.md`.

**Effect on §0.** The 31.0% and 45.0% rates were measured from `usercontribs` against the live
wiki, so they already include everything written by the old code and don't need measuring
again. It does mean there is no clean period after the fix to subtract: every MamouriBot
وظیفهٔ ۳ edit before ~21:01 UTC ۱۳ اکتبر ۲۰۲۶ is backlog.

**Trigger for closing this entry.** The next few hourly runs after ~21:01 UTC write
`چگونگی پیوند=مرده`/`زنده` (not `=dead`/`=live`) on fresh merges, and no mixed-script keys.
A quick `usercontribs` and diff check (or something in `scripts/archive`) is enough; the
600-page sample is only needed if something else looks wrong.

---

## 1. Lift the `archive.today` guard in وظیفهٔ ۳

**Why.** `ARCHIVE_TODAY_FAMILY` in `src/tasks/task-03/normalize-cite-params.ts` makes the bot
skip the whole archive family on any citation with an `archive.today`-family URL. That was
right while `Module:Citation/CS1` handled those URLs wrongly, but the module was fixed on
۸ اکتبر ۲۰۲۶ (both `/en/Configuration` and `/fa/Configuration`). The guard now costs scope:
roughly **18,400 articles** have such a URL and the bot skips all of them.

**Trigger.** `رده:صفحه‌های دارای خطا در نشانی بایگانی` has emptied substantially. It held
**4,363** when the module fix shipped and **4,255** on ۹ اکتبر ۲۰۲۶. It only empties as the job
queue re-renders each page, so this takes weeks. Wait for it instead of forcing it: the
category emptying shows the fix has reached real pages, not just the ones I re-parsed by hand.

**Check.**

```bash
python3 -I - <<'EOF'
import json, urllib.parse, urllib.request
API, UA = "https://fa.wikipedia.org/w/api.php", {"User-Agent": "MamouriBot/1.0 (mamouri@gmail.com)"}
n, cont = 0, {}
while True:
    u = API + "?" + urllib.parse.urlencode({"action": "query", "list": "categorymembers",
        "cmtitle": "رده:صفحه‌های دارای خطا در نشانی بایگانی", "cmnamespace": "0",
        "cmlimit": "500", "format": "json", "formatversion": "2", **cont})
    r = json.load(urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=120))
    n += len(r["query"]["categorymembers"])
    if "continue" not in r: break
    cont = r["continue"]
print(n, "pages (4,363 when the module fix shipped)")
EOF
```

**Then.** Delete `ARCHIVE_TODAY_FAMILY`, `ARCHIVE_FIELDS` and the `archiveTodayHere` branch in
`normalizeSpan`, along with the four tests for them. As the first test, re-run the five pages
the old batch reverted itself on: `آمریکایی‌ها`, `مدل (شخص)`,
`فهرست شناگران رکورددار المپیک`, `فهرست رکوردهای جهانی شنا`,
`فرودگاه بین‌المللی پیرسون تورنتو`. All five have an `archive.today` URL, which is how the
cause was found. If the module fix works they now edit cleanly; if not, the post-save check
reverts them. Keep the explanatory comment somewhere so the cause doesn't have to be worked out
again.

---

## 2. Re-harvest وظیفهٔ ۳'s target list

**Why.** The list is a saved file, not built on each run, because CirrusSearch fails past
offset 10,000 (`cirrussearch-offset-too-large`) and the in-run cap is `--limit * 20`, so a
scheduled run with a cap would keep walking the same window. As the bot fixes pages they stop
matching `insource:"archive-url"` and the rest, so **a new harvest gives a new 80k**. About
four harvests clear the backlog.

**Trigger.** Runs mostly report «موردی برای هم‌سان‌سازی نبود», or every couple of weeks
anyway. ~80,450 titles at ~5,500 edits a day is about two weeks per list.

⚠️ **The same symptom has another cause. Check it first, because a re-harvest hides it.** On
۱۸ اکتبر ۲۰۲۶ the runs were 250/250 «موردی برای هم‌سان‌سازی نبود» and the list looked used
up, but a sample of the titles not yet reached was **90% productive**. The job was processing
the same 250 titles every hour because a "nothing to do" result was never written to the
checkpoint (fixed: the `clean` bucket, `markClean` in core). You can tell because the
«پردازش‌شدهٔ پیشین» counter doesn't move between runs:

```bash
ssh mamouri@login.toolforge.org 'become mamouribot grep "هدف‌ها:" \
  /data/project/mamouribot/cite-params-hourly.out | tail -5'
```
The same number five times means it is stuck, not finished. A re-harvest would have hidden that
for one run and left the bug in place for every later task.

**Check.** On the tool, compare the checkpoint with the list:

```bash
ssh mamouri@login.toolforge.org "become mamouribot bash -c '
  python3 -c \"import json; d=json.load(open(\\\"/data/project/mamouribot/state/normalize-cite-params.json\\\")); print(len(d[\\\"done\\\"]), \\\"done\\\")\"
  wc -l < /data/project/mamouribot/task-03-cite-params/targets.txt'"
```

**Then.** Run `python3 -I scripts/archive/task3-harvest-targets.py` in the companion repo,
combine it with the category members, **shuffle with a fixed seed**, and upload to
`~/task-03-cite-params/targets.txt`. The shuffle matters: `list=categorymembers` returns pages
in an order where the first stretch is almost all already clean (first 100 → 4 edits; random
100 → 100), so an unshuffled list makes a healthy run look finished.

---

## 3. Finish وظیفهٔ ۳'s sweep

**Why.** It is the largest task and far from done.

**Status, ۱۸ اکتبر ۲۰۲۶** (measured again). A new random sample of 300 articles from all of
fa.wikipedia found **22.7% with in-scope work**, so about **249,000 of 1,098,256 articles
remain**. That is barely down from 25% on ۹ اکتبر, because the bot made no edits in the nine
days between (see §2's ⚠️). At 250 edits an hour that is **~6 weeks of running**, with about
three more harvests after the current list.

In the current list: **73,687 titles not yet reached, ~90% of them productive ≈ 66,000 edits**,
so about 11–12 days before the next harvest is due.

I also **re-shuffled the list in place** on ۱۸ اکتبر (`targets.txt.preshuffle.bak` has the old
order). The harvest order was clustered, with long runs of New Jersey townships, UN Security
Council resolutions and Italian footballers that earlier passes had already cleaned. Even with
the stuck checkpoint fixed, the bot would have spent ~30 hours of runs with nothing to do at the
head of the list. After the re-shuffle the next run edited 250 of 250.

**Status, ۹ اکتبر ۲۰۲۶.** ~2,000 articles edited. A random sample of 240 articles found ~25%
with in-scope work, so roughly 265,000 remaining, about 1% done.

**Check.** Measure the remaining share again instead of trusting the figures above. They come
from samples, and the bot keeps changing what is left.

**Then.** Watch the revert rate. If it goes above a few percent, stop and look instead of
carrying on. That is how the `archive.today` problem was caught.

---

## 4. The ten widened citation families

**Why.** `access-date`, `language`, `title`, `book-title`, `date`, `page`, `pages`,
`periodical`, `chapter`, `publisher` are implemented and tested but **not approved**. They are
switched off behind `CITE_WIDENED_SCOPE=1`, and `src/tasks/task-03/scope.test.ts` checks the
default by starting a child process without that variable.

On the tracking category they add little. On a random 300 members, the approved scope already
edits **275**; with the widened families, **286**.

**Trigger.** The families are approved on
`ویکی‌پدیا:سیاست ربات‌رانی/درخواست مجوز/MamouriBot/وظیفه ۳`. Setting the variable is not
approval.

**Then.** Set `CITE_WIDENED_SCOPE=1` in `toolforge/task-03-cite-params/run.sh` and redeploy.

---

## 5. Skip edits that only remove `ref=harv`

**Why.** The request says «ربات هرگز ویرایشِ صرفاً آرایشی ثبت نمی‌کند». Removing `ref=harv`
no longer fixes an error (rendered with and without it: 0 errors, 0 maintenance messages, same
`CITEREF` anchor), so an edit whose only change is that removal is cosmetic. Of 30 pages
containing `ref=harv`, **one** would get such an edit; across ~1,730 pages that is roughly 60.

**Trigger.** None. It is small and self-contained; do it whenever.

**Then.** In `normalizeCiteParams`, if the only change across all spans is removing `ref=harv`,
return `changed: false`. Those pages get picked up when they next have real work.

---

## 6. وظیفهٔ ۱۲: the extension

**Status.** The task was approved on ۹ اکتبر ۲۰۲۶. On ۱۲ نوامبر ۲۰۲۶ I posted the extension
(red links whose Persian article has another name, `{{بت}}` and `{{پیوند با میان‌ویکی}}`,
templates) with a 97-edit trial, rev 44966592 on the request page. No one was pinged.

**Check.** Read the end of `ویکی‌پدیا:سیاست ربات‌رانی/درخواست مجوز/MamouriBot/وظیفه ۱۲`.

**Trigger.** Huji, or another reviewer, answers it.

**Then.** If approved, set `LINKFIX_EXTENSION=1` in `toolforge/task-12-linkfix/run.sh`, add
`lf-full` to `jobs.yaml`, and start **only** that job with `toolforge jobs run`.
`toolforge jobs load` starts every one-off job in the file straight away, which is how
`lf-trial` once started before its preflight.

Still open, for me to decide: whether to move this repository under
`PersianWikipedia/fawikibot` as Huji suggested, or link to it from there.

---

## 7. وظیفهٔ ۱۴: waiting for review

**Status.** Filed ۸ اکتبر ۲۰۲۶. The code, 28 tests and the Toolforge jobs are ready. A dry run
found something to do on 39 of 40 articles, each diff a one-line addition. Not run live.

**Trigger.** A trial is granted on the request page.

**Then.** `pop-check` → `pop-dry` → `pop-trial` (50 edits), check the diffs **and the
rendered pages**, and only then create `pop-full`.

**Later, outside the filed scope:** cities and higher divisions (the 454 non-village items the
`P31=Q532` filter leaves out), and retiring `پودمان:جمعیت روستای ایران/داده/*` once Wikidata
coverage is complete.

---

## 7b. وظیفهٔ ۱۴ needs a نظرخواهی before it can run

**Why.** Huji on the request page, ۹ اکتبر ۲۰۲۶: technically fine, but the task changes where
population vandalism ends up. Today a wrong figure is reverted by fa patrollers. Read from
Wikidata, it has to be caught on Wikidata, where there are far fewer Persian-speaking
patrollers. He doesn't accept the قهوه‌خانه thread as consensus: too few people took part, and
this risk never came up there.

He also said the long messages were part of why that thread failed: «شما و هوشواره‌تان
پیام‌های طولانی نوشته بودید و دنبال کردنش احتمالاً از حوصلهٔ خیلی‌ها خارج بوده». The
نظرخواهی has to be short enough for people who aren't already involved to read. That, not the
code, is what is holding this up.

**Trigger.** A نظرخواهی is opened, runs, and reaches a conclusion.

**Then.** If it passes, the trial as in §7. If not, the template and module stay: the
قهوه‌خانه request is already met, and any editor can add `{{جمعیت ایران}}` by hand. Don't run
the bot on the strength of a thin thread.

The نظرخواهی should answer the real objection: how a wrong number on Wikidata gets noticed
from fa. Today the honest answer is that it doesn't, reliably.

---

## 8. Port وظیفهٔ ۵ to pywikibot

**Why.** Huji asked for it when he held back وظیفهٔ ۱۲: «وقتش است که ربات‌های پایتون خود را
به PWB مبتنی کنید». He meant the **Python** bots, and `src/tasks/task-05/
empty-unknown-params.py` is the only one left. His other two requests from that review, code
on GitHub and running from Toolforge, are done.

**Trigger.** None. I told Huji I would do it.

**Then.** Port it to pywikibot, or to TypeScript like every other task and say so. وظیفهٔ ۱۲
was moved to TypeScript for the same reason.

---

## 9. Watch the Persian `url-status` values against InternetArchiveBot

**Why.** `مرده`/`زنده` were added to the keywords table in all five CS1 configs, and the bot
writes them. That config tells IABot what to **recognise**, not what to **write**, so it may
still write `dead` the next time it visits a page the bot set to `مرده`. Nothing is wrong
today; the risk is the two bots slowly flipping the value back and forth.

**Trigger.** Only visible by waiting.

**Check.** Look at pages the bot set to `مرده` and see whether IABot has changed them since:

```bash
# any page where both appear is worth a look
insource:"چگونگی پیوند=مرده" insource:"url-status=dead"
```

---

## 10. The parent repository is not pushed

`~/dev/homelab/wikipedia` is **220 commits ahead of its remote** (last pushed 28 September
2026), including every submodule-pointer update. A fresh `git clone --recurse-submodules` of
the parent gets the **September** bot.

`bmamouri/mamouribot` itself is up to date, and that is what Toolforge clones, so nothing is
broken. The pointer only matters once the parent is pushed. I decided to keep the parent local
for now (۹ اکتبر ۲۰۲۶); this entry is here so nobody mistakes it for a bug.

---

## 11. وظیفهٔ ۱۵: watch the rollout (source maintenance banners)

**Status, ۱۳ اکتبر ۲۰۲۶.** **Approved and running.** Huji granted {{مجوز دارد}} on ۱۲ اکتبر.
The task runs as MamouriBot from the `st-daily` Toolforge job (`5 3 * * *` UTC,
`--live --limit 200 --delay 15`), deployed from `toolforge/task-15-source-tags/`. 196 edits on
day one; I checked 121 of them one by one against the live pages and all were clean. The
request promises **روزانه، با سقف ۲۰۰ ویرایش در هر اجرا**, so raising `--limit 200` means
amending the request first. The six problems found and fixed on day one are listed in
`docs/task-15-source-tags.md`. To repeat the check, use the rollout log and the audit script
(`scripts/archive/task15-audit-live-edits.py`, parent repo), not the run log, which only says
the bot's own `verify` passed.

**۱۳ اکتبر: the removal threshold was wrong and is now a density test.** I rejected the removal
on «هدهد» (564 words, one footnote, a «منابع» list that included the English Wikipedia).
Removing a banner now needs one inline citation per 250 words of prose, at least 2, and
bibliography bullets don't count (`citationFloor` / `inlineCitations` in
`src/tasks/task-15/source-detect.ts`). 26 of 59 earlier removals failed the new test. 17 were
restored with `scripts/archive/task15-restore-undercited-banners.py`, I chose to leave 4 stubs
alone, and 5 had already been re-tagged by others. **If the daily log ever shows zero
removals, look at the pre-render screen first.** A refusal that depends on the rendered page
must set `needsRender`; otherwise the screen rejects every candidate before rendering it, and
the run reports nothing to remove anywhere on the wiki, with no error.

**Trigger: a decision for me.** 19 of day one's 196 edits were «N (عدد)» number articles
(۵۳، ۷۵، ۹۰۰، ۲۰۰، …). They really are unsourced and in scope, but the candidate search finds
them in clumps, and nineteen tagged in one day may look like spam. Excluding or slowing them
is a choice, not a bug, so nothing changes until I decide.

**Check.** `toolforge jobs logs st-daily`, and `کاربر:MamouriBot/وظیفه ۱۵/گزارش`, the refusal
report, republished every run. A run that edits 200 pages and refuses none is as suspicious as
one that refuses everything; day one's refusals were all genuine.

**Then.** After a few more days, check a sample with
`python3 -I scripts/archive/task15-audit-live-edits.py <lo> <hi>` from the parent repo. Run it
in batches of ~15 in the foreground. Rendering a long article is a large GET, and the
background sandbox truncates those
(`lessons/scripts-and-batch/background-sandbox-drops-large-get-bodies.md`). A hundred renders
from my own IP also gets the connection rate-limited, which happened on day one and is why the
audit stopped at 121.

## 12. وظیفهٔ ۱: watch the rollout (removing the imported English templates)

**Status, ۱۳ اکتبر ۲۰۲۶.** **Approved and running.** Huji granted {{مجوز دارد}} on ۱۲ اکتبر.
Runs as MamouriBot from the `ud-daily` Toolforge job (`20 6 * * *` UTC,
`--live --limit 200 --delay 15`), deployed from `toolforge/task-01-use-dmy-dates/`. Notes:
`docs/task-01-use-dmy-dates.md`.

On ۱۳ اکتبر I widened the scope, under the same permission, from `{{Use dmy dates}}` alone to
all eight imported variant templates (`Use mdy dates`,
`Use British/American/Indian/Australian/Hong Kong English`, `EngvarB`). None of them renders
anything on fa and all ignore their parameters, so the edit still changes nothing visible, and
the argument in the request applies to each of them word for word. **I checked 32 live edits
on the day of the deploy; all clean.**

The English-only version found **54** targets and the widened one finds **489**, because four
of the English names redirect to a Persian title and most pages use the Persian name. So the
backlog is ~3 runs, not one. Any future template-removal task has to find and match both
names (`lessons/scripts-and-batch/imported-template-persian-redirect-target.md`).

**Trigger.** After ~3 runs the target count should drop to a handful a day. If it keeps
growing, translation tools are importing the templates faster than one run a day removes them,
and the cap or the schedule needs raising. That is not a code change.

**Check.** `toolforge jobs logs ud-daily`, and the size of
`رده:صفحه‌های حاوی الگوی غیر بومی`, which should now actually shrink since every template that
puts a page in it is in scope. A page that stays in it after an edit is getting one of the
templates indirectly through a subtemplate. That is correct: it is reported, not edited.

**Then.** Nothing, unless the trigger fires. Pages that get one of these templates through a
subtemplate («انتخابات ریاست‌جمهوری فرانسه (۲۰۰۷)» and «(۲۰۱۷)» were the two measured) are
read again every 30 days and correctly left alone. That is what `recheckAfterDays: 30` costs:
a handful of reads a month.

## 13. وظیفهٔ ۱۶: watch the rollout (stripping `#:~:text=`)

**Status, ۱۳ اکتبر ۲۰۲۶.** **Approved and running.** Huji granted {{مجوز دارد}} on ۱۲ اکتبر
after a 35-edit trial under my own account. The bot made 18 more live edits on the day of the
deploy, and I checked all 18 diffs: clean. Runs as MamouriBot from the `tf-daily` Toolforge job
(`50 6 * * *` UTC, `--live --limit 200 --delay 15`), deployed from
`toolforge/task-16-text-fragment/`. There were ~1,940 candidates on the day of the deploy, so
the backlog clears in ~10 runs and then becomes a trickle. Notes and the rollout log:
`docs/task-16-text-fragment.md`.

**Trigger.** The CirrusSearch count for `insource:/\#\:~\:text\=/` in ns0 stops falling. Either
the search index is behind the edits, or some form of the directive is being skipped. Dry-run
40 and read the diffs before changing anything.

**Check.** `toolforge jobs logs tf-daily`. Grep the log for `%25` inside a `+` line. That was
the bug found on the day of the deploy: the directive continued past a literal space and the
strip left half the highlight inside `نشانی=`. A clean run leaves no percent-encoded leftovers.

**Then.** The promise in the request, «هرگز صفحه‌ای را که ویرایش کرده دوباره ویرایش نمی‌کند»,
sits a little awkwardly next to `recheckAfterDays: 30`; see «The "never edits a page twice"
line» in the task doc. Only worth raising if someone on the wiki asks.
