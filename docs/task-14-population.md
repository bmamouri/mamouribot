# وظیفهٔ ۱۴: درج {{جمعیت ایران}} در مقاله‌های آبادی‌های ایران

This task adds a census trend box to Iranian village articles. The edit carries no
numbers: the bot inserts one template call, and the module reads the figures live from the
article's own Wikidata item. The bot decides where the box goes; the data is already on
Wikidata.

| | |
|---|---|
| Code | `src/tasks/task-14/population-box.ts` (+ `.test.ts`, 28 assertions) |
| Task id | `population-box` |
| Deployment | `toolforge/task-14-population/` |
| Upstream project | `scripts/population/` in the parent repo (`RFC-rollout-bot.md`, `PLAN.md`, `README.md`) |
| Report page | `کاربر:MamouriBot/وظیفه ۱۴/گزارش` |
| BRFA | `ویکی‌پدیا:سیاست ربات‌رانی/درخواست مجوز/MamouriBot/وظیفه ۱۴` |

## Where the numbers come from

1. **Source:** the Statistical Center of Iran settlement censuses of **۱۳۸۵ (2006)**,
   **۱۳۹۰ (2011)** and **۱۳۹۵ (2016)**, at the آبادی level.
2. **Wikidata:** `scripts/population/import_bot.py` wrote `P1082` (plus P1538/P1540/P1539)
   qualified with `P585` + `P459=Q39825` and a `P854` reference to the exact per-province
   SCI file, with ۱۳۹۵ at preferred rank. Audit: **MATCH 154,330, MISSING 0, DIFFER 0**,
   positive control 30/30, 0 contamination.
3. **Display:** `پودمان:جمعیت ایران` reads `entity.claims` (not `getBestStatements`, which
   would hide the normal-rank ۱۳۸۵ value behind the preferred ۱۳۹۵ one), maps each P585 year
   to its Jalali census label, and outputs a centred `{{جمعیت تاریخی}}`.
4. **This task:** inserts `{{جمعیت ایران}}`. Nothing else changes.

Live example: [[بنه رازی]] shows ۱۳۸۵→۴۱ · ۱۳۹۰→۱۸ · ۱۳۹۵→۵۹ with the percentage change
worked out, and 0 errors.

## Which articles

One WDQS query for QIDs, then `wbgetentities` for titles:

```sparql
SELECT DISTINCT ?item WHERE {
  ?item wdt:P1010 ?code ; p:P1082 ?st ; wdt:P31 wd:Q532 .
  ?st pq:P585 ?when .
  ?art schema:about ?item ; schema:isPartOf <https://fa.wikipedia.org/> .
}
```

The `wdt:P31 wd:Q532` line is required. The census import is keyed on P1010, and provinces,
counties and cities have one too. Without the filter the set is 17,048 and starts with
«تهران» and «استان اردبیل». With it, it is **16,594**, all villages, which is the approved
scope. Cities and higher divisions are a later phase that needs its own case.

Titles come from `wbgetentities`, not from WDQS. `schema:name` drops U+200C: a SPARQL pass
returned 0 of 17,271 titles with a ZWNJ, where the API gives 58 in 400. Every title that
lost its ZWNJ 404s, which showed up as "14% of candidates missing", a number plausible
enough to believe. Don't merge this into one query.

## The four kinds of article

Measured on 400 random candidates (`scripts/population/1390-CENSUS-GAP.md` §2):

| shape | share | what the bot does |
|---|---|---|
| `== جمعیت ==`, no box | 89.5% | insert `{{جمعیت ایران}}` directly under the heading |
| a hand-written `{{جمعیت تاریخی}}` | 6.3% | **replace it, only with proof (see below)** |
| no population section at all | 4.0% | create `== جمعیت ==` before the first section at the end of the article |
| already has `{{جمعیت ایران}}` | 0.2% | skip |

Two cases are refused and reported instead of guessed at:

- **a population heading that is not exactly `== جمعیت ==`**, such as `== جمعیت‌شناسی ==`,
  `== [[جمعیت]] ==` or `=== جمعیت ===`. Creating a section here would give the article two
  population sections, and nothing would flag it.
- **nowhere safe to create the section**: no end section (منابع، پانویس، جستارهای وابسته …)
  to put it before.

`== جمعیّت ==` with a shadda counts as the same heading. It occurs on live pages (آق‌چه‌کند)
and looks almost identical, and the heading regex accepts it. A plain `/جمعیت/` match misses
it and the article gets a second section.

## Replacing a hand-written box

Until ۸ اکتبر ۲۰۲۶ those hand-written boxes were the only machine-readable copy of the ۱۳۹۰
figures at village level. Wikidata held only ۱۳۸۵ and ۱۳۹۵, while 92% of the boxes also
showed ۱۳۹۰, so replacing them would have quietly deleted a sourced census row from about a
thousand articles. That is fixed now, since ۱۳۹۰ is imported and audited. But a single box
may still hold something else, such as ۱۳۷۵, or a figure that disagrees with the SCI file.

So `verify()` checks that nothing is lost, which is what `BotTask.verify` is for. It renders
the proposed wikitext and refuses to save unless **every (year, value) pair the old box
showed** appears in the new render. The built-in render check can't do this: it counts
error markers, and a box that drops a row produces none
(`lessons/scripts-and-batch/never-wholesale-replace-article.md`,
`enrich-must-not-drop-blue-seealso.md`).

A box that would lose anything is reported and left as it is.

## Safety

- The built-in render check (error markers before and after) plus `verifySaved`, which
  parses the **saved** revision again by `oldid` and reverts its own edit if things got
  worse. It is the only check that catches the kind of defect task ۳ shipped twice.
- `gates.py check_wikitext` on the change only. Run on the whole page it fails on problems
  the article already had and that this task is not allowed to fix, so it checks that the
  inserted line adds none (the same approach as وظیفهٔ ۱۰ and ۱۲).
- `assert=user` + `assertuser=MamouriBot` on every save, and `baserevid`/`basetimestamp`,
  so a concurrent human edit produces a conflict instead of being overwritten.
- `maxlag=5` on every request, `Retry-After` honoured, and `کاربر:MamouriBot/توقف` read
  before every edit.
- Templates are located by matching braces, never with a regex capture. A capture stops at
  the first `}}`, which in a box containing `{{formatnum:}}` closes the inner template and
  leaves a stray `}}` in the article.
- Resumable: `~/state/population-box.json`. No `recheckAfterDays`: this task goes over the
  pages once, not over a category that keeps refilling, and going over 16.6k pages again
  would only add load.
- Edit summary **under 150 characters** (AbuseFilter #221), in Persian, describing the
  content only.

## Running it

```bash
npx tsx src/run.ts population-box --limit 40              # dry run, classify only
npx tsx src/run.ts population-box --live --limit 50 --delay 15   # the BRFA trial
```

On Toolforge: `toolforge jobs load toolforge/task-14-population/jobs.yaml`, then run
`pop-check` → `pop-dry` → `pop-trial`. Create `pop-full` only after checking the trial's
diffs and renders.

## Still to do

- **Cities and higher divisions** (the 454 non-village items the P31 filter leaves out) are
  a later phase and need their own case. The aggregate rows are already in
  `settlements.csv`.
- **Retiring `پودمان:جمعیت روستای ایران/داده/*`**, the local fallback data, once Wikidata
  coverage is complete.
