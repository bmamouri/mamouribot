# وظیفهٔ ۱۴: درج {{جمعیت ایران}} در مقاله‌های آبادی‌های ایران

This task adds a census trend box to Iranian village articles. The edit carries no numbers:
the bot inserts one `{{جمعیت ایران}}` call, and `پودمان:جمعیت ایران` reads the figures live
from the article's own Wikidata item. The bot only decides where the box goes.

## Status

- **Not approved yet.** Filed as `ویکی‌پدیا:سیاست ربات‌رانی/درخواست مجوز/MamouriBot/وظیفه ۱۴`.
  The code, the tests and the Toolforge jobs are ready. It has not run live.
- Huji's objection is not technical: with the figures read from Wikidata, a wrong number has
  to be caught on Wikidata, where there are far fewer Persian-speaking patrollers. The task
  needs a short نظرخواهی that answers this before it can run (`TODO.md` §7b).
- Report page: `کاربر:MamouriBot/وظیفه ۱۴/گزارش`.

## Where the numbers come from

- **Source:** the Statistical Center of Iran settlement censuses of ۱۳۸۵ (2006), ۱۳۹۰ (2011)
  and ۱۳۹۵ (2016), at آبادی level.
- **Wikidata:** `P1082` (plus P1538/P1540/P1539) qualified with `P585` and `P459=Q39825`, with
  a `P854` reference to the per-province SCI file, and ۱۳۹۵ at preferred rank. They were
  written by `scripts/population/import_bot.py` in the parent repo.
- **Display:** `پودمان:جمعیت ایران` reads `entity.claims` (not `getBestStatements`, which would
  hide the normal-rank years behind the preferred ۱۳۹۵ value), maps each year to its Jalali
  census label, and outputs a centred `{{جمعیت تاریخی}}`.

Example: [[بنه رازی]] shows ۱۳۸۵→۴۱ · ۱۳۹۰→۱۸ · ۱۳۹۵→۵۹ with the percentage change.

## Which articles

One WDQS query for QIDs, then `wbgetentities` for titles:

```sparql
SELECT DISTINCT ?item WHERE {
  ?item wdt:P1010 ?code ; p:P1082 ?st ; wdt:P31 wd:Q532 .
  ?st pq:P585 ?when .
  ?art schema:about ?item ; schema:isPartOf <https://fa.wikipedia.org/> .
}
```

- `wdt:P31 wd:Q532` keeps the set to villages, which is the filed scope (about 16,594
  articles). Provinces, counties and cities also have P1010.
- Titles come from `wbgetentities`, not from WDQS, because `schema:name` drops ZWNJ (U+200C)
  and those titles then don't exist. Don't merge this into one query.

## What it changes

| article | what the bot does |
|---|---|
| has `== جمعیت ==`, no box (most articles) | insert `{{جمعیت ایران}}` directly under the heading |
| has a hand-written `{{جمعیت تاریخی}}` | replace it, only if nothing is lost (below) |
| has no population section | create `== جمعیت ==` before the first end section |
| already has `{{جمعیت ایران}}` | skip |

Refused and reported instead:

- a population heading that is not exactly `== جمعیت ==`, such as `== جمعیت‌شناسی ==`,
  `== [[جمعیت]] ==` or `=== جمعیت ===`, because a new section would give the article two;
- no end section (منابع، پانویس، جستارهای وابسته …) to place a new section before.

`== جمعیّت ==` with a shadda counts as the same heading.

### Replacing a hand-written box

A hand-written box may hold something Wikidata does not, such as ۱۳۷۵ or a different figure.
`verify()` renders the proposed wikitext and refuses to save unless every (year, value) pair
the old box showed appears in the new render. A box that would lose anything is reported and
left as it is. The render-error check can't do this, because a box that drops a row shows no
error (`lessons/scripts-and-batch/never-wholesale-replace-article.md`).

Edit summary: `درج جدول روند جمعیت بر پایهٔ داده‌های سرشماری مرکز آمار ایران (از ویکی‌داده)`.

## Safety checks

- The render-error check, plus `verifySaved`, which parses the saved revision again by `oldid`
  and reverts the bot's own edit if things got worse.
- `gates.py check_wikitext` on the change only, so problems the article already had don't
  block it.
- `assert=user` + `assertuser=MamouriBot` on every save, and `baserevid`/`basetimestamp`, so a
  concurrent edit gives a conflict instead of being overwritten.
- `maxlag=5`, `Retry-After` honoured, and `کاربر:MamouriBot/ادامه` read before every edit.
- Templates are located by matching braces, never with a regex capture, which would stop at
  the first inner `}}`.
- Edit summary under 150 characters (AbuseFilter #221).
- No `recheckAfterDays`: the task goes over the pages once.

## Running it

```bash
npx tsx src/tasks/task-14/population-box.test.ts                  # offline tests
npx tsx src/run.ts population-box --limit 40                      # dry run, classify only
npx tsx src/run.ts population-box --live --limit 50 --delay 15    # the trial
```

Deployment is `toolforge/task-14-population/`. On Toolforge, start each job on its own with
`toolforge jobs run`, in order `pop-check` → `pop-dry` → `pop-trial` (50 edits). Don't use
`toolforge jobs load` on this `jobs.yaml`: it replaces the whole job list and deletes every
other task's scheduled jobs. Create `pop-trial` only after approval, and `pop-full`
only after checking the trial's diffs and rendered pages.

To stop it, blank `کاربر:MamouriBot/ادامه`. The checkpoint is `~/state/population-box.json`.

## Open

- Cities and higher divisions (the 454 non-village items the P31 filter leaves out) are a
  later phase and need their own request. The aggregate rows are already in
  `settlements.csv`.
- Retire `پودمان:جمعیت روستای ایران/داده/*`, the local fallback data, once Wikidata coverage
  is complete.

## Code

| file | what |
|---|---|
| `src/tasks/task-14/population-box.ts` | the task (`population-box`): targets, placement, `verify()` |
| `src/tasks/task-14/population-box.test.ts` | offline tests |
| `toolforge/task-14-population/` | `run.sh`, `jobs.yaml` |
| `scripts/population/` in the parent repo | the Wikidata import and the project notes (`RFC-rollout-bot.md`, `PLAN.md`, `README.md`) |
