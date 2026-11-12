# MamouriBot: things to come back to

Most of the bot's work runs for months, so most of what is left is "do this once something
has happened". Each entry has:

- **Trigger**: what has to be true before it is worth doing.
- **Check**: how to tell whether it is due.
- **Then**: the work itself.

Delete an entry when it is done. Keep the section numbers; other docs cite them. Numbers are
dated, because they go out of date.

---

## 0. Fix the existing mixed-script archive citations (وظیفهٔ ۳)

**Background.** The bot now writes archive parameter names in the script the citation already
uses (`citationScript` in `normalize-cite-params.ts`). Edits made before ۱۳ اکتبر ۲۰۲۶ ~21:01
UTC could put a Persian archive key into an English citation. Hand-written citations have the
same mix. Measured ۱۳ اکتبر ۲۰۲۶ on bot edits: about 31% of pages (~2,190) have a key in the
wrong script. A random sample of all articles found 11.6% with the mix, mostly not from the
bot.

**Trigger.** وظیفهٔ ۳'s main backlog (§1–§4) has settled, so a second sweep doesn't collide
with the first.

**Check / Then.**

1. Count the bot's own cases: MamouriBot edits whose summary contains «هم‌سان‌سازی نام
   پارامترهای بایگانی», where `citationScript` on the non-archive parameters says `en` and
   the diff adds a Persian archive key. `src/tasks/task-03/verify-trial.ts` already fetches
   before and after for each edit; add it there.
2. Count hand-written ones separately: `insource:"چگونگی پیوند" insource:"last1="` and the
   `archiveurl`/`last=` equivalent.
3. Decide whether a follow-up pass is worth it: rename only the archive family to match
   `citationScript`. If it goes beyond the approved scope, post a note on the request page
   first (`lessons/api-and-permissions/repo-folder-is-not-the-approved-scope.md`).

### 0b. Fix past edits that wrote an English `url-status` value

The code is fixed (`fieldUntouched` in `normalizeSpan`), but edits before ۱۳ اکتبر ۲۰۲۶
~21:01 UTC can carry `|چگونگی پیوند =dead`. About 45% of the bot's pages from that period
(~3,180) were affected. Fix them in the same sweep as §0, with the same trigger. The two
groups overlap, so don't add the numbers.

---

## 1. Lift the `archive.today` guard in وظیفهٔ ۳

**Background.** `ARCHIVE_TODAY_FAMILY` in `src/tasks/task-03/normalize-cite-params.ts` makes
the bot skip the archive family on any citation with an `archive.today`-family URL. The CS1
module bug behind it was fixed on ۸ اکتبر ۲۰۲۶. About 18,400 articles are skipped because of
the guard.

**Trigger.** `رده:صفحه‌های دارای خطا در نشانی بایگانی` has emptied substantially as the job
queue re-renders pages (4,363 when the module fix shipped, 4,255 on ۹ اکتبر ۲۰۲۶).

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
`normalizeSpan`, and their four tests. Test first on `آمریکایی‌ها`, `مدل (شخص)`,
`فهرست شناگران رکورددار المپیک`, `فهرست رکوردهای جهانی شنا` and
`فرودگاه بین‌المللی پیرسون تورنتو`, which all have such a URL. Keep a comment explaining the
cause.

---

## 2. Re-harvest وظیفهٔ ۳'s target list

**Background.** The job reads a fixed list, `~/task-03-cite-params/targets.txt` (~80,450
titles), because CirrusSearch fails past offset 10,000. Fixed pages stop matching the
searches, so each new harvest gives a fresh list. At ~5,500 edits a day a list lasts about
two weeks.

**Trigger.** Runs mostly report «موردی برای هم‌سان‌سازی نبود», or every couple of weeks.

**Check.** First make sure the job isn't stuck: if the «پردازش‌شدهٔ پیشین» count is the same
across runs, the checkpoint is not advancing, and a re-harvest would hide that.

```bash
ssh mamouri@login.toolforge.org 'become mamouribot grep "هدف‌ها:" \
  /data/project/mamouribot/cite-params-hourly.out | tail -5'
```

Then compare the checkpoint with the list:

```bash
ssh mamouri@login.toolforge.org "become mamouribot bash -c '
  python3 -c \"import json; d=json.load(open(\\\"/data/project/mamouribot/state/normalize-cite-params.json\\\")); print(len(d[\\\"done\\\"]), \\\"done\\\")\"
  wc -l < /data/project/mamouribot/task-03-cite-params/targets.txt'"
```

**Then.** Run `python3 -I scripts/archive/task3-harvest-targets.py` in the companion
repository, combine it with the category members, shuffle with a fixed seed, and upload to
`~/task-03-cite-params/targets.txt`. Shuffle, because `list=categorymembers` returns the
already-clean pages first.

---

## 3. Finish وظیفهٔ ۳'s sweep

**Background.** On ۱۸ اکتبر ۲۰۲۶ a random sample of 300 articles found 22.7% with in-scope
work, about 249,000 of 1,098,256 articles. At 250 edits an hour that is about six weeks of
running.

**Check.** Measure the remaining share again on a fresh random sample.

**Then.** Watch the self-revert rate. If it goes above a few percent, stop the job and look.

---

## 4. The ten widened citation families

**Background.** `access-date`, `language`, `title`, `book-title`, `date`, `page`, `pages`,
`periodical`, `chapter` and `publisher` are implemented and tested but not approved. They are
off unless `CITE_WIDENED_SCOPE=1`; `src/tasks/task-03/scope.test.ts` checks the default.

**Trigger.** The families are approved on
`ویکی‌پدیا:سیاست ربات‌رانی/درخواست مجوز/MamouriBot/وظیفه ۳`. Setting the variable is not
approval.

**Then.** Set `CITE_WIDENED_SCOPE=1` in `toolforge/task-03-cite-params/run.sh` and redeploy.

---

## 5. Skip edits that only remove `ref=harv`

**Background.** Removing `ref=harv` no longer fixes a visible error, so an edit that does only
that is cosmetic, which the request says the bot never makes. Roughly 60 pages are affected.

**Trigger.** None. Do it whenever.

**Then.** In `normalizeCiteParams`, if the only change across all spans is removing
`ref=harv`, return `changed: false`.

---

## 6. وظیفهٔ ۱۲: the extension

**Background.** The task is approved for article links. The extension (red links whose
Persian article has another name, `{{بت}}` and `{{پیوند با میان‌ویکی}}`, citation `*-link`
parameters, templates) was posted with a 97-edit trial on ۱۲ نوامبر ۲۰۲۶ and is waiting for
review.

**Check.** Read the end of `ویکی‌پدیا:سیاست ربات‌رانی/درخواست مجوز/MamouriBot/وظیفه ۱۲`.

**Trigger.** Huji or another reviewer answers.

**Then.** If approved, set `LINKFIX_EXTENSION=1` in `toolforge/task-12-linkfix/run.sh`, add
an `lf-full` job to `jobs.yaml`, and create only that job with `toolforge jobs run`.

Also open, for me to decide: whether to move this repository under
`PersianWikipedia/fawikibot`, as Huji suggested, or link to it from there.

---

## 7. وظیفهٔ ۱۴: waiting for review

**Background.** Filed ۸ اکتبر ۲۰۲۶. Code, tests and Toolforge jobs are ready. Not run live.
Blocked on §7b.

**Trigger.** A trial is granted on the request page.

**Then.** `pop-check` → `pop-dry` → `pop-trial` (50 edits). Check the diffs and the rendered
pages, and only then create `pop-full`.

Later, outside the filed scope: cities and higher divisions (the 454 non-village items the
`P31=Q532` filter leaves out), and retiring `پودمان:جمعیت روستای ایران/داده/*` once Wikidata
coverage is complete.

---

## 7b. وظیفهٔ ۱۴ needs a نظرخواهی before it can run

**Background.** Huji does not accept the قهوه‌خانه thread as consensus. The open question is
that a wrong population figure would then have to be caught on Wikidata instead of by fa
patrollers. The نظرخواهی must answer that, and be short enough for uninvolved editors to
read.

**Trigger.** A نظرخواهی is opened and reaches a conclusion.

**Then.** If it passes, the trial as in §7. If not, the template and module stay and editors
add `{{جمعیت ایران}}` by hand.

---

## 8. Port وظیفهٔ ۵ to pywikibot

**Background.** Huji asked that the Python bots move to pywikibot.
`src/tasks/task-05/empty-unknown-params.py` is the only one left.

**Trigger.** None. I told Huji I would do it.

**Then.** Port it to pywikibot, or to TypeScript like every other task and say so on the
request page.

---

## 9. Watch the Persian `url-status` values against InternetArchiveBot

**Background.** The bot writes `مرده`/`زنده`. The CS1 configuration tells IABot to recognise
them, not to write them, so IABot may change them back to `dead` and the two bots could flip
the value back and forth.

**Trigger.** Only visible by waiting.

**Check.** Look at pages the bot set to `مرده` for later IABot edits:

```bash
# any page where both appear is worth a look
insource:"چگونگی پیوند=مرده" insource:"url-status=dead"
```

---

## 10. The parent repository is not pushed

The companion repository has not been pushed since 28 September 2026, so a fresh
`git clone --recurse-submodules` of it gets an old bot. `bmamouri/mamouribot` itself is up to
date, and that is what Toolforge uses, so nothing is broken. This is my decision, not a bug.

**Check.** `git -C ~/dev/homelab/wikipedia rev-list --count @{u}..HEAD`

**Then.** Push the parent when I decide to; the submodule pointer comes with it.

---

## 11. وظیفهٔ ۱۵: watch the daily run

**Background.** Runs as `st-daily`, at most 200 edits a run, which the request promises.
Raising the limit means amending the request first. Removing a banner needs one inline
citation per 250 words of prose, at least 2 (`citationFloor` / `inlineCitations` in
`src/tasks/task-15/source-detect.ts`). A refusal that depends on the rendered page must set
`needsRender`, or the pre-render screen rejects every candidate silently.

**Trigger: a decision for me.** «N (عدد)» number articles are in scope but come up in clumps
(19 of the first day's 196 edits). Excluding or slowing them is my choice; nothing changes
until I decide.

**Check.** `toolforge jobs logs st-daily`, and the refusal report
`کاربر:MamouriBot/وظیفه ۱۵/گزارش`. A run with zero removals, or one that refuses nothing, is
worth a look.

**Then.** Audit a sample with `python3 -I scripts/archive/task15-audit-live-edits.py <lo> <hi>`
from the companion repository, in batches of about 15, in the foreground
(`lessons/scripts-and-batch/background-sandbox-drops-large-get-bodies.md`).

---

## 12. وظیفهٔ ۱: watch the daily run

**Background.** Runs as `ud-daily`, at most 200 edits a run, on all eight imported variant
templates under both their English and Persian names
(`lessons/scripts-and-batch/imported-template-persian-redirect-target.md`). Pages that get a
template through a subtemplate are reported, not edited, and re-read every 30 days.

**Trigger.** The daily target count keeps growing instead of dropping to a handful.

**Check.** `toolforge jobs logs ud-daily`, and the size of
`رده:صفحه‌های حاوی الگوی غیر بومی`.

**Then.** Raise the cap or the schedule. No code change needed.

---

## 13. وظیفهٔ ۱۶: watch the daily run

**Background.** Runs as `tf-daily`, at most 200 edits a run.

**Trigger.** The CirrusSearch count for `insource:/\#\:~\:text\=/` in ns0 stops falling.

**Check.** `toolforge jobs logs tf-daily`. Grep for `%25` on a `+` line; a clean run leaves no
percent-encoded leftovers. Before changing anything, dry-run 40 pages and read the diffs.

**Then.** If someone on the wiki asks, explain how `recheckAfterDays: 30` fits the request's
promise «هرگز صفحه‌ای را که ویرایش کرده دوباره ویرایش نمی‌کند» (see
`docs/task-16-text-fragment.md`).
