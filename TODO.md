# MamouriBot — things to come back to

The bot's campaigns run for **months**, so most of what is left is not "do this now" but
"do this when a condition is met". A plain checklist rots in that setting: by the time the
condition arrives, nobody remembers what the item meant or how to tell whether it is due.

So every entry below carries three things:

- **Trigger** — what has to be true before it is worth doing.
- **Check** — a command that answers "is it due?" without re-deriving anything.
- **Then** — the actual work, concretely enough to start.

Delete an entry when it is done. Do not soften one into "look into X someday"; if it has
no trigger and no check, it is not a TODO, it is a wish.

Numbers in this file are **dated**, because a stale number here is worse than no number —
it resolves ambiguity in the wrong direction with equal confidence.

---

## 0. Find and fix the pre-existing mixed-script archive citations (وظیفهٔ ۳)

**Why.** Until ۱۳ اکتبر ۲۰۲۶ the archive-rename family (`archive-url`→`پیوند بایگانی`,
`archive-date`→`تاریخ بایگانی`, `url-status`→`چگونگی پیوند`) always wrote the Persian
canonical, even into a citation whose every other parameter was English
(`{{cite book|last1=…|first1=…}}`). That is individually correct — every name is a
declared CS1 alias — but it drops one Persian key into an otherwise all-English
citation, trading one inconsistency («چند نام برای یک فیلد») for another («دو زبان در
یک یادکرد»). Caught on a live diff: [نادیا اووسو](https://fa.wikipedia.org/w/index.php?title=نادیا_اووسو&diff=next&oldid=42998792).
The bot now matches the citation's OWN script (see `citationScript` in
`normalize-cite-params.ts`), so this does not happen going forward — but the fix is not
retroactive. Every citation the bot already touched under the old behaviour, PLUS every
hand-written citation that already mixes English params with a Persian archive
parameter for unrelated reasons, still has it.

**Trigger.** None yet — this is discovery work, not a scheduled fix. Pick it up once
وظیفهٔ ۳'s main backlog (ten-families widening, archive.today guard lift, §1 below) has
settled, so a second sweep over the same population does not collide with the first.

**Check / Then — figuring out the scope, not fixing it yet:**

1. Find how many citations the bot itself wrote this way. Every MamouriBot edit whose
   summary contains «هم‌سان‌سازی نام پارامترهای بایگانی» is a candidate; for each, render
   the parameter list and classify with `citationScript` using everything EXCEPT the
   archive family — if it comes back `en` but the diff shows a Persian archive key,
   that is one. `src/tasks/task-03/verify-trial.ts` already fetches parent/child
   wikitext for every such edit, so this is an addition to that script, not a new one.
2. Separately, search for the hand-written population: `insource:"چگونگی پیوند"
   insource:"last1="` (and the `archiveurl`/`last=` equivalent) finds a citation that is
   already both. This population existed before the bot and the bot is not the one to
   blame for all of it, but it is the same defect from the reader's perspective and
   worth knowing the size of.
3. Report the two counts (bot-caused vs. pre-existing) separately — conflating them
   would overstate what this task owes to fix.
4. **Then, once the scope is known:** decide whether a follow-up pass is worth running —
   it would re-detect `citationScript` per citation and rename the archive family (and
   ONLY the archive family — the ten dedupeOnly families never rename regardless) to
   match, the mirror image of the original migration. Needs its own BRFA note if it
   touches pages outside the already-approved scope, since "fix my own past mistake" is
   not automatically "my own approval already covers it" — check term by term as usual
   (`lessons/api-and-permissions/repo-folder-is-not-the-approved-scope.md`).

**Measured ۱۳ اکتبر ۲۰۲۶** (pooled 1,750-page sample across three independent draws, out
of ~7,065 total task-3 edits at measurement time):

| | rate (page-level) | 95% CI | estimated pages |
|---|---|---|---|
| key-script mismatch (archive-url/-date/url-status KEY in the wrong script) | 31.0% | 28.9–33.2% | ~2,190 (2,040–2,340) |
| value-script mismatch (چگونگی پیوند KEY correct, VALUE still English — see below) | 45.0% | 41.0–49.0% | ~3,180 (2,900–3,460) |

These two overlap (many citations have both the key and value wrong at once), so they
are **not additive** — do not sum them into a combined estimate without re-measuring the
union directly (sample pages and check both conditions per citation, the way the
600-page runs above each did for one condition at a time).

A random mainspace sample (800 pages, not filtered to bot edits) found an **11.6%**
mismatch rate (95% CI 9.4–13.8%) across ALL of fa.wikipedia — projecting to
**~103,000–152,000 articles**, most of which predate this task and were never touched by
MamouriBot. The bot's own ~2,000–3,000-page backlog is a small, well-understood slice of
a much larger pre-existing problem.

### 0b. The value itself also needs translating, not just the key — fixed ۱۳ اکتبر ۲۰۲۶

**Why.** Separate defect, caught the same day by the operator on a live diff:
[سیارک ۱۴۳۴۹](https://fa.wikipedia.org/w/index.php?title=سیارک_۱۴۳۴۹&diff=44719012&oldid=44232856).
`dead-url=yes` merging into an existing `url-status=dead` produced `|چگونگی پیوند =dead`
— correct Persian KEY, still-English VALUE. `urlStatusWrite` had a shortcut that
returned any already-module-accepted value (`dead`, `live`, `مرده`, `زنده`, `unfit`,
`usurped`, `bot: unknown`) untouched, and that shortcut fired even when the field was
being merged or renamed — i.e. exactly when the value needed to move with the key.

**Status: fixed, redeployed same day.** `fieldUntouched` in `normalizeSpan` now decides
whether to call `writeMap` at all — only a genuine no-op (single alias, already at the
canonical name for this script) skips translation. Every merge or rename translates the
value. This predates and is independent of the key-script fix above — it has been
present since وظیفهٔ ۳'s first live edit, which is why its measured rate (45.0%) is
against the whole backlog, not a narrow window.

**Not done:** retrofitting past edits with the wrong value, same as 0's key-script
backlog — same `TODO.md` entry, same trigger, do them together rather than two separate
sweeps.

### 0c. The ۱۳ اکتبر redeploys went to the wrong path — both fixes only went live ~21:01 UTC

Two "redeploys" that day piped the rebuilt bundle to `~/bot/mamouribot.mjs`; the
scheduled job's `run.sh` execs `~/mamouribot.mjs` (tool home) instead, so the live cron
ran the pre-fix ۹ اکتبر bundle through both announced fix times. Caught via a SECOND
live diff ([سیارک ۱۰۷۲۹](https://fa.wikipedia.org/w/index.php?title=سیارک_۱۰۷۲۹&diff=44720452&oldid=44231025),
20:30 UTC) still showing the bug. Corrected ~21:01 UTC — copied to the right path,
verified `grep` on `~/mamouribot.mjs` specifically, and ran the task through the real
`run.sh` wiring (not just the bundle file) against fresh citations before restarting.
See `lessons/scripts-and-batch/toolforge-deploy-path-must-match-run-sh.md`.

**Consequence for the retrofit scope above:** the 31.0%/45.0% rates in §0/§0b are
measured straight from `usercontribs` against the live wiki, so they already include
everything written under the buggy code — they do not need re-measuring on account of
this. What they mean has changed slightly: there was no narrow "clean after the fix"
window today to carve out of the backlog. Every MamouriBot وظیفهٔ ۳ edit before ~21:01
UTC ۱۳ اکتبر ۲۰۲۶ is backlog, full stop.

**Trigger for closing this entry.** Confirm the next few hourly runs (after ~21:01 UTC)
produce `چگونگی پیوند=مرده`/`زنده` (not `=dead`/`=live`) on fresh merges, and no
mixed-script key. `scripts/archive` or a quick `usercontribs` + diff check is enough;
this does not need the full 600-page sampling again unless something else looks wrong.

---

## 1. Lift the `archive.today` guard in وظیفهٔ ۳

**Why.** `ARCHIVE_TODAY_FAMILY` in `src/tasks/task-03/normalize-cite-params.ts` makes the
bot leave the whole archive family alone on any citation holding an `archive.today`-family
URL. That was the right call while `Module:Citation/CS1` mis-handled those, but **the module
is fixed** (۸ اکتبر ۲۰۲۶, both `/en/Configuration` and `/fa/Configuration`). The guard now
costs scope: roughly **18,400 articles** carry such a URL and the bot declines all of them.

**Trigger.** `رده:صفحه‌های دارای خطا در نشانی بایگانی` has drained substantially. It held
**4,363** when the module fix shipped and **4,255** on ۹ اکتبر ۲۰۲۶ — it drains only as the
job queue re-renders each page, so this is a matter of weeks, not hours. Wait for it rather
than forcing it: the category draining is the evidence that the module fix reached real
pages, not just the ones re-parsed by hand.

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

**Then.** Delete `ARCHIVE_TODAY_FAMILY`, `ARCHIVE_FIELDS` and the `archiveTodayHere` branch
in `normalizeSpan`, plus the four tests that pin them. **Re-run the five pages the old batch
self-reverted as the first test** — `آمریکایی‌ها`, `مدل (شخص)`,
`فهرست شناگران رکورددار المپیک`, `فهرست رکوردهای جهانی شنا`,
`فرودگاه بین‌المللی پیرسون تورنتو`. All five carry an `archive.today` URL, which is how the
cause was found; if the module fix is real they now edit cleanly, and the post-save guard
self-reverts if not. Keep the explanatory comment somewhere — the mechanism is worth not
rediscovering.

---

## 2. Re-harvest وظیفهٔ ۳'s target list

**Why.** The list is frozen, not enumerated per run, because CirrusSearch hard-errors past
offset 10,000 (`cirrussearch-offset-too-large`) and the in-run cap is `--limit * 20`, so a
scheduled capped run would re-walk one window forever. As the bot fixes pages they stop
matching `insource:"archive-url"` and friends, so **a fresh harvest yields a fresh 80k**.
Roughly four harvests clear the backlog.

**Trigger.** Runs start reporting mostly «موردی برای هم‌سان‌سازی نبود» — or just every
couple of weeks. ~80,450 titles at ~5,500 edits/day is about two weeks per list.

**Check.** On the tool: compare the checkpoint against the list.

```bash
ssh mamouri@login.toolforge.org "become mamouribot bash -c '
  python3 -c \"import json; d=json.load(open(\\\"/data/project/mamouribot/state/normalize-cite-params.json\\\")); print(len(d[\\\"done\\\"]), \\\"done\\\")\"
  wc -l < /data/project/mamouribot/task-03-cite-params/targets.txt'"
```

**Then.** `python3 -I scripts/archive/task3-harvest-targets.py` in the companion repo, union
with the category members, **shuffle with a fixed seed**, upload to
`~/task-03-cite-params/targets.txt`. The shuffle is load-bearing, not tidiness —
`list=categorymembers` returns an order whose leading window is nearly all already-clean
pages (first 100 → 4 edits; random 100 → 100), so an unshuffled list makes a healthy run
look finished.

---

## 3. Finish وظیفهٔ ۳'s sweep

**Why.** It is the big one and it is nowhere near done.

**Status, ۹ اکتبر ۲۰۲۶.** ~2,000 articles edited. A 240-article random sample of all of
fa.wikipedia found **~25% have in-scope work**, so roughly **265,000 articles remain** —
about 1% done. At `cite-params-hourly`'s ~5,500 edits/day that is **~7 weeks**.

**Check.** Re-run the population estimate rather than trusting the number above; it is a
sample, and the bot is changing the population under it.

**Then.** Nothing to do but watch the revert rate. Above a few percent, stop and look rather
than grinding through — that is how the `archive.today` defect was caught.

---

## 4. The ten widened citation families

**Why.** `access-date`, `language`, `title`, `book-title`, `date`, `page`, `pages`,
`periodical`, `chapter`, `publisher` are implemented and tested but **not approved**. They
are off behind `CITE_WIDENED_SCOPE=1`, and `src/tasks/task-03/scope.test.ts` asserts the
default by spawning a child process without that variable.

Worth knowing before asking: on the tracking category they buy little. Measured on a random
300 members, the approved scope already edits **275**; with the widened families, **286**.

**Trigger.** The families are approved on
`ویکی‌پدیا:سیاست ربات‌رانی/درخواست مجوز/MamouriBot/وظیفه ۳`. **The env var is not
permission.**

**Then.** Set `CITE_WIDENED_SCOPE=1` in `toolforge/task-03-cite-params/run.sh` and redeploy.

---

## 5. Suppress a `ref=harv`-only edit

**Why.** The request promises «ربات هرگز ویرایشِ صرفاً آرایشی ثبت نمی‌کند». Removing
`ref=harv` no longer fixes an error — rendered with and without it: 0 errors, 0 maintenance
messages, same `CITEREF` anchor — so an edit whose *only* change is that removal is
cosmetic. Measured: of 30 pages containing `ref=harv`, **one** would get a harv-only edit;
scaled over ~1,730 pages, roughly 60 such edits.

**Trigger.** None. Small, self-contained, do it whenever.

**Then.** In `normalizeCiteParams`, if the only change across all spans is `ref=harv`
removal, return `changed: false`. Those pages get picked up when they next have real work.

---

## 6. وظیفهٔ ۱۲ — the permanent permission

**Status.** The second 50-edit temporary trial ran ۹ اکتبر ۲۰۲۶ and the report is posted:
50 edits, 141 links rewritten, content red links 2,840 → 2,720, 0 self-reverts, red links
down on 46 articles and up on none. Huji said the permanent permission follows.

**Trigger.** The permission is issued.

**Then.** Add `lf-full` to `toolforge/task-12-linkfix/jobs.yaml` and load **only** that job
(`toolforge jobs load` runs every one-off definition in the file immediately — that is how
`lf-trial` started before its preflight). The file deliberately has no `lf-full` today.

Also open and the operator's to answer: whether to move this repository under
`PersianWikipedia/fawikibot` as the review suggested, or link to it from there.

---

## 7. وظیفهٔ ۱۴ — awaiting review

**Status.** Filed ۸ اکتبر ۲۰۲۶. Code, 28 tests and the Toolforge jobs are ready; a dry run
found 39 of 40 articles actionable, every diff a one-line addition. Not run live.

**Trigger.** A trial is granted on the request page.

**Then.** `pop-check` → `pop-dry` → `pop-trial` (50 edits), audit the diffs **and the
renders**, and only then create `pop-full`.

**Later phases, deliberately out of the filed scope:** cities and higher divisions (the 454
non-village items the `P31=Q532` filter excludes), and retiring
`پودمان:جمعیت روستای ایران/داده/*` once Wikidata coverage is complete.

---

## 7b. وظیفهٔ ۱۴ needs a نظرخواهی before it can run

**Why.** Huji on the request page, ۹ اکتبر ۲۰۲۶: technically fine, but the task moves where
population vandalism *lands*. Today a wrong figure is reverted by fa patrollers; read from
Wikidata, it has to be caught on Wikidata, where there are far fewer Persian-speaking
patrollers. He does not accept the قهوه‌خانه thread as consensus — too few participants,
and this specific risk was never raised there.

He also said, plainly, that **the long messages were part of why that thread failed**:
«شما و هوشواره‌تان پیام‌های طولانی نوشته بودید و دنبال کردنش احتمالاً از حوصلهٔ خیلی‌ها
خارج بوده». Whoever writes the نظرخواهی: make it short enough to be read by people who are
not already invested. That is the actual blocker, not the code.

**Trigger.** A نظرخواهی is opened, runs, and reaches a conclusion.

**Then.** If it passes, the trial as in §7. If it does not, the template and module stay —
the قهوه‌خانه request is already satisfied and any editor can place `{{جمعیت ایران}}` by
hand. Do not run the bot on the strength of a thin thread.

**Worth answering in the نظرخواهی, because it is the real objection:** how a wrong number on
Wikidata gets noticed from fa. The honest answer today is "it does not, reliably".

---

## 8. Port وظیفهٔ ۵ to pywikibot

**Why.** Huji asked for it when declining وظیفهٔ ۱۲: «وقتش است که ربات‌های پایتون خود را به
PWB مبتنی کنید». He scoped it to the **Python** bots, and `src/tasks/task-05/
empty-unknown-params.py` is the only one left. The other two requests from that review —
code on GitHub, and Toolforge — are done.

**Trigger.** None. It is an outstanding request from a reviewer, so it is owed.

**Then.** Port it, or port it to TypeScript alongside every other task and say so; وظیفهٔ ۱۲
itself was moved to TypeScript for exactly that consistency.

---

## 9. Watch the Persian `url-status` values against InternetArchiveBot

**Why.** `مرده`/`زنده` were added to the keywords table in all five CS1 configs and the bot
writes them. But that config tells IABot what to **recognise**, not what to **emit**, so it
may still write `dead` next time it visits a page the bot set to `مرده`. Nothing is wrong
today; the risk is a slow ping-pong between two bots.

**Trigger.** Only observable by waiting.

**Check.** Sample pages the bot set to `مرده` and see whether IABot has since changed them:

```bash
# any page where both appear is worth a look
insource:"چگونگی پیوند=مرده" insource:"url-status=dead"
```

---

## 10. The parent repository is not pushed

`~/dev/homelab/wikipedia` is **220 commits ahead of its remote** (last pushed 28 September
2026), and that includes every submodule-pointer bump. So a fresh
`git clone --recurse-submodules` of the parent gets a **September** bot.

`bmamouri/mamouribot` itself is current, and that is what Toolforge clones, so nothing is
broken — but the pointer is only meaningful once the parent is pushed. The operator asked
for it to stay local for now (۹ اکتبر ۲۰۲۶); this entry exists so the consequence is not
rediscovered as a bug.

---

## 11. وظیفهٔ ۱۵ — watch the rollout (source maintenance banners)

**Status, ۱۳ اکتبر ۲۰۲۶.** **Approved and running.** Huji granted {{مجوز دارد}} on
۱۲ اکتبر; the task now runs as MamouriBot from the `st-daily` Toolforge job
(`5 3 * * *` UTC, `--live --limit 200 --delay 15`), deployed from
`toolforge/task-15-source-tags/`. 196 edits on day one, 121 of them audited one by one
against the live pages — all clean. The published commitment is **روزانه، با سقف ۲۰۰
ویرایش در هر اجرا**, so `--limit 200` is not a tuning knob: raising it means amending
the request first. Six defects found and fixed during day one are tabulated in
`docs/task-15-source-tags.md`; the rollout log and the audit script
(`scripts/archive/task15-audit-live-edits.py`, parent repo) are the way to repeat the
check rather than trusting the run log, which only reports that the bot's own `verify`
was satisfied.

**۱۳ اکتبر, same day: the removal bar was wrong and is now a density test.** The operator
rejected «هدهد» (564 words, one footnote, a «منابع» list that included the English
Wikipedia). Removal now needs one INLINE citation per 250 prose words, minimum 2, and
bibliography bullets do not count — `citationFloor` / `inlineCitations` in
`src/tasks/task-15/source-detect.ts`. 26 of 59 past removals failed the new bar; 17 were
restored with `scripts/archive/task15-restore-undercited-banners.py`, 4 stubs left alone
by the operator's choice, 5 already re-tagged by others. **If the daily log ever shows
zero removals, suspect the pre-render screen first** — a refusal that depends on the
render must set `needsRender`, or the screen rejects every candidate before rendering it
and the run reports nothing to remove anywhere on the wiki, with no error.

**Trigger — open judgement call for the operator.** 19 of day one's 196 edits were
«N (عدد)» number articles (۵۳، ۷۵، ۹۰۰، ۲۰۰، …). They are genuinely unsourced and in
scope, but the candidate search finds them in clumps, so nineteen tagged in one day may
read as spray. Excluding or throttling them is a decision, not a defect — ask before
changing anything.

**Check.** `toolforge jobs logs st-daily`, and
`کاربر:MamouriBot/وظیفه ۱۵/گزارش` — the refusal report, republished every run. A run
that edits 200 and refuses none is as suspicious as one that refuses everything: day
one's refusals were all real.

**Then.** Audit a sample after a few more days with
`python3 -I scripts/archive/task15-audit-live-edits.py <lo> <hi>` from the parent repo.
Run it in SLICES of ~15 and in the foreground: a render of a long article is a large GET
and the background sandbox truncates those
(`lessons/scripts-and-batch/background-sandbox-drops-large-get-bodies.md`), and a
hundred renders from the operator's own IP gets the connection rate-limited — which
happened on day one and is why the audit stopped at 121.

## 12. وظیفهٔ ۱ — watch the rollout (removing the imported English templates)

**Status, ۱۳ اکتبر ۲۰۲۶.** **Approved and running.** Huji granted {{مجوز دارد}} on
۱۲ اکتبر. Runs as MamouriBot from the `ud-daily` Toolforge job (`20 6 * * *` UTC,
`--live --limit 200 --delay 15`), deployed from `toolforge/task-01-use-dmy-dates/`.
Notes: `docs/task-01-use-dmy-dates.md`.

Scope was widened on ۱۳ اکتبر, at the operator's decision and under the same permission,
from `{{Use dmy dates}}` alone to all eight imported variant templates (`Use mdy dates`,
`Use British/American/Indian/Australian/Hong Kong English`, `EngvarB`). None of them
renders anything on fa and all ignore their parameters, so the edit stays render-neutral;
the argument in the request applies word for word to each. **32 live edits audited on
deploy day, all clean.**

The number to know: the English-only version saw **54** targets, the widened one sees
**489** — because four of the English names are redirects to a Persian title and most
pages call the Persian side. So the backlog is ~3 runs, not one, and any future
template-removal task must enumerate and match BOTH spellings
(`lessons/scripts-and-batch/imported-template-persian-redirect-target.md`).

**Trigger.** After ~3 runs the target count should fall to a handful a day. If it keeps
growing instead, translation tools are re-importing faster than one run a day clears and
the cap or the schedule needs raising — not a code change.

**Check.** `toolforge jobs logs ud-daily`, and the size of
`رده:صفحه‌های حاوی الگوی غیر بومی`, which should now actually drain since every template
that files a page into it is in scope. A page that stays behind after an edit is
transcluding one of them indirectly from a subtemplate — correct, and reported, not
edited.

**Then.** Nothing, unless the trigger fires. Pages that transclude one of these
indirectly from a subtemplate («انتخابات ریاست‌جمهوری فرانسه (۲۰۰۷)» and «(۲۰۱۷)» were
the two measured) are re-read every 30 days and correctly not edited; that is the
`recheckAfterDays: 30` cost and it is a handful of reads a month.

## 13. وظیفهٔ ۱۶ — watch the rollout (stripping `#:~:text=`)

**Status, ۱۳ اکتبر ۲۰۲۶.** **Approved and running.** Huji granted {{مجوز دارد}} on
۱۲ اکتبر after a 35-edit trial under the operator's own account. 18 further live edits as
the bot on deploy day, all 18 audited against the live diffs — clean. Runs as MamouriBot
from the `tf-daily` Toolforge job (`50 6 * * *` UTC, `--live --limit 200 --delay 15`),
deployed from `toolforge/task-16-text-fragment/`. ~1,940 candidates on deploy day, so
the backlog drains over ~10 runs and then becomes a trickle. Notes and the rollout log:
`docs/task-16-text-fragment.md`.

**Trigger.** CirrusSearch `insource:/\#\:~\:text\=/` in ns0 stops falling. Either the
search index is lagging behind the edits, or a shape of the directive is being skipped —
dry-run 40 and read the diffs before touching anything.

**Check.** `toolforge jobs logs tf-daily`. The signal to grep the log for is `%25`
inside a `+` line: that is the defect found on deploy day, where the directive continued
past a literal space and the strip left half the highlight inside `نشانی=`. A clean run
leaves no percent-encoded debris at all.

**Then.** The declared promise «هرگز صفحه‌ای را که ویرایش کرده دوباره ویرایش نمی‌کند»
sits slightly awkwardly beside `recheckAfterDays: 30` — see «Open for the operator» in
the task doc. Only worth raising if someone on-wiki asks.
