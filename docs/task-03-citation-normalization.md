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
1. ☐ Post the BRFA expansion on `ویکی‌پدیا:سیاست ربات‌رانی/درخواست مجوز/MamouriBot/وظیفه ۳` (draft below / handed to user) and get approval.
2. ☐ Dry-run on a real sample from the dup category + legacy-alias articles; review diffs.
3. ☐ Verify «چگونگی پیوند» value vocabulary, then flip `ENABLE_URL_STATUS=true` and re-test.
4. ☐ User creates the dedicated Toolforge tool; deploy bundled runner.
5. ☐ Wave 1 (dup category) → verify category drains; Wave 2 (legacy migration).
6. ☐ Separate follow-up: «شابک نادرست» → `((…))` + module deprecation.

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
