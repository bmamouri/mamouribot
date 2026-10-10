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

## 11. وظیفهٔ ۱۵ — build it (source maintenance banners)

**Status, ۱۰ اکتبر ۲۰۲۶.** Researched and planned; the operator answered every design
question. **No code yet**, nothing run, nothing filed. Everything needed to pick it up is
in `docs/task-15-source-tags.md` — start at its §0 (decisions, build steps, target
queries), and §12 (the source-detection rules, so the git-ignored research scripts are
not needed).

**Trigger.** The operator says to continue.

**Check.** `ls src/tasks/task-15/` — absent means not started.

**Then.** Follow §0.4 of the doc: write `src/tasks/task-15/source-tags.ts` + tests,
register `source-tags` in `src/run.ts`, dry-run, then a ~1000-edit trial under the
operator's own account (`--as-me`), audited between runs. **No قهوه‌خانه thread and no
BRFA** until the operator decides after the trial. One question is still open: ask before
tagging یک منبع / بخش بدون منبع / اصلاح ترجمه (planned report-only).
