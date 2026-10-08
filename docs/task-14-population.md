# وظیفهٔ ۱۴ — درج {{جمعیت ایران}} در مقاله‌های آبادی‌های ایران

Place a Wikidata-fed census trend box on Iranian village articles. **No number travels
in the edit** — the bot inserts one template tag and the module reads the figures live
from the article's own Wikidata item. This is a placement job, not a data job.

| | |
|---|---|
| Code | `src/tasks/task-14/population-box.ts` (+ `.test.ts`, 28 assertions) |
| Task id | `population-box` |
| Deployment | `toolforge/task-14-population/` |
| Upstream project | `scripts/population/` in the parent repo (`RFC-rollout-bot.md`, `PLAN.md`, `README.md`) |
| Report page | `کاربر:MamouriBot/وظیفه ۱۴/گزارش` |
| BRFA | `ویکی‌پدیا:سیاست ربات‌رانی/درخواست مجوز/MamouriBot/وظیفه ۱۴` |

## The data chain, end to end

1. **Source** — Statistical Center of Iran settlement censuses **۱۳۸۵ (2006)**,
   **۱۳۹۰ (2011)** and **۱۳۹۵ (2016)**, at the آبادی level.
2. **Into Wikidata** — `scripts/population/import_bot.py` wrote `P1082` (plus P1538/
   P1540/P1539) qualified with `P585` + `P459=Q39825` and a `P854` reference to the exact
   per-province SCI file; ۱۳۹۵ at **preferred** rank. Audited: **MATCH 154,330, MISSING 0,
   DIFFER 0**, positive control 30/30, 0 contamination.
3. **Display** — `پودمان:جمعیت ایران` reads `entity.claims` (not `getBestStatements`, which
   would hide the normal-rank ۱۳۸۵ value behind the preferred ۱۳۹۵ one), maps each P585
   year to its Jalali census label, and emits a centred `{{جمعیت تاریخی}}`.
4. **This task** — inserts `{{جمعیت ایران}}`. Nothing else changes.

Live example: [[بنه رازی]] renders ۱۳۸۵→۴۱ · ۱۳۹۰→۱۸ · ۱۳۹۵→۵۹ with computed %-change,
0 errors.

## Candidate set

One WDQS query for QIDs, then `wbgetentities` for titles:

```sparql
SELECT DISTINCT ?item WHERE {
  ?item wdt:P1010 ?code ; p:P1082 ?st ; wdt:P31 wd:Q532 .
  ?st pq:P585 ?when .
  ?art schema:about ?item ; schema:isPartOf <https://fa.wikipedia.org/> .
}
```

**`wdt:P31 wd:Q532` is load-bearing.** The census import is keyed on P1010, and provinces,
counties and cities carry one too; without the filter the set is 17,048 and opens on
«تهران» and «استان اردبیل». With it: **16,594**, all villages — the approved scope.
Cities and higher divisions are a later, separately-argued phase.

**Titles come from `wbgetentities`, never from WDQS.** `schema:name` strips U+200C: a
SPARQL pass returned 0 of 17,271 titles containing a ZWNJ where the API gives 58 in 400.
Every stripped title 404s, which surfaced as "14% of candidates missing" — a believable
enough number to act on. Do not optimise this into one query.

## The four article shapes

Measured on a random 400 of the candidates (`scripts/population/1390-CENSUS-GAP.md` §2):

| shape | share | what the bot does |
|---|---|---|
| `== جمعیت ==`, no box | 89.5% | insert `{{جمعیت ایران}}` directly under the heading |
| a hand-written `{{جمعیت تاریخی}}` | 6.3% | **replace it — only with proof, see below** |
| no population section at all | 4.0% | create `== جمعیت ==` before the first tail section |
| already has `{{جمعیت ایران}}` | 0.2% | skip |

Two shapes are refused and reported instead of guessed at:

- **a population-ish heading that is not the exact one** — `== جمعیت‌شناسی ==`,
  `== [[جمعیت]] ==`, `=== جمعیت ===`. Creating a section here gives the article **two**
  population sections, and that raises no error.
- **nowhere safe to create** — no tail section (منابع، پانویس، جستارهای وابسته …) to
  place one before.

**`== جمعیّت ==` with a shadda is the same heading.** It is a real live variant
(آق‌چه‌کند) and visually near-identical; the heading regex accepts it. A plain
`/جمعیت/` match misses it and the article gets a duplicate section.

## Why the replacement carries a proof instead of a rule

Those hand-written boxes were, until ۸ اکتبر ۲۰۲۶, the **only machine-readable copy** of
the ۱۳۹۰ figures at settlement level: Wikidata held ۱۳۸۵ and ۱۳۹۵ only, while 92% of the
boxes also showed ۱۳۹۰. Replacing one silently deleted a sourced census row from roughly
a thousand articles. That blocker is closed — ۱۳۹۰ is imported and audited — but *"the
data is there now"* is a claim about a population, not about the article in hand: a box
may carry ۱۳۷۵, or a figure that disagrees with the SCI file.

So `verify()` is a **deletion proof**, in the sense `BotTask.verify` exists for. It
renders the proposed wikitext and refuses the save unless **every (year, value) pair the
old box displayed** appears in the new render. The built-in render guard cannot do this:
it counts error markers, and a box that quietly loses a row raises none
(`lessons/scripts-and-batch/never-wholesale-replace-article.md`,
`enrich-must-not-drop-blue-seealso.md`).

A box that would lose anything is reported, not edited around.

## Safety

- The built-in render guard (before/after error markers) plus `verifySaved`, which
  re-parses the **saved** revision by `oldid` and self-reverts a regression — the only
  instrument that catches the class of defect task ۳ shipped twice.
- `gates.py check_wikitext` as a **delta** — run whole it fails on defects the article
  already had and that this task may not fix, so what is asserted is that the inserted
  line introduces none (the shape وظیفهٔ ۱۰ and ۱۲ use).
- `assert=user` + `assertuser=MamouriBot` on every save; `baserevid`/`basetimestamp`, so a
  concurrent human edit conflicts rather than being clobbered.
- `maxlag=5` on every request, `Retry-After` honoured, and
  `کاربر:MamouriBot/توقف` read before **every** edit.
- Brace-balanced template location, never a regex capture: a capture stops at the first
  `}}`, which on a box holding `{{formatnum:}}` closes the inner one and leaves a stray
  `}}` in the article.
- Resumable: `~/state/population-box.json`. No `recheckAfterDays` — this is a one-pass
  placement job, not a continuous category sweep, and re-sweeping 16.6k pages would be
  pure load.
- Edit summary **< 150 chars** (AbuseFilter #221), Persian, content only.

## Running it

```bash
npx tsx src/run.ts population-box --limit 40              # dry run, classify only
npx tsx src/run.ts population-box --live --limit 50 --delay 15   # the BRFA trial
```

On Toolforge: `toolforge jobs load toolforge/task-14-population/jobs.yaml`, then run
`pop-check` → `pop-dry` → `pop-trial`, and create `pop-full` **only** after auditing the
trial's diffs *and* renders.

## Open

- **Cities and higher divisions** (the 454 non-village items the P31 filter excludes) are
  a later phase and need their own argument — the aggregate rows exist in
  `settlements.csv` already.
- **Retiring `پودمان:جمعیت روستای ایران/داده/*`**, the local fallback layer, once Wikidata
  coverage is complete.
