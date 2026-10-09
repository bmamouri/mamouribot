# وظیفهٔ ۳ — state of the full run, ۸ اکتبر ۲۰۲۶

Handover. Everything measured, not estimated. The run was stopped on a defect that was
never in the bot; it is now diagnosed and guarded against, so the run can resume. See §3.

## 1. Where it stands

| | |
|---|---|
| Permission | **{{مجوز دارد}}** granted ۸ اکتبر ۲۰۲۶ (full, not a trial) |
| Edits, ۸ اکتبر | **45** (5 self-reverted, all restored byte-identically) |
| Self-reverted by the guard | **5** |
| Processed | 75 |
| Checkpoint | 729 done, 15 deferred (`~/state/normalize-cite-params.json`) |
| Job | deleted; `mamouribot` runs only `empty-params`, `notelist-daily`, `destub-watch`, `destub-inventory-monthly` |

Every one of the 5 reverted pages was checked: the current revision is the bot's own
revert and the wikitext is **byte-identical to the pre-bot state**. 5 of 5. No article is
left damaged.

Logs on the tool: `~/task-03-cite-params/logs/live{1,2,3}.out`.

## 2. What the permission actually covers — read this before widening anything

Checked term by term against the approved page, not assumed:

**Approved:** the archive families (`archive-url`, `archiveurl`, `نشانی بایگانی`,
`archive-date`, `archivedate`), the `dead-url` family → `چگونگی پیوند` with `مرده`/`زنده`,
and `ref=harv` removal.

**NOT approved, and not mentioned anywhere on the page:** access-date, language, title,
book-title, date, page, pages, periodical, chapter, publisher. The follow-up declared
THREE deviations; a fourth covering those ten was drafted and removed before posting.

They are therefore **off by default**, gated behind `CITE_WIDENED_SCOPE=1`, and
`src/tasks/task-03/scope.test.ts` asserts the default by spawning a child process without
that variable. The env var is not permission: those families need approving on the request
page first.

## 3. WHY THE RUN WAS STOPPED — SOLVED ۸ اکتبر ۲۰۲۶، the guard is in

**Root cause: an `archive.today` URL, not a `mw.loadData` proxy and not engine mixing.**
A single citation on an otherwise empty page reproduces it; the "many English citations"
correlation was an artefact of page size.

`Module:Citation/CS1/en` runs `has_archive_today_url`, which blanks any parameter holding
an archive.today-family URL **and its declared dependents**. `cfg.dependencies_t` has two
faults: `url_dependency_map_t` is keyed on **English parameter names only** (no
`['پیوند بایگانی']`), and `dependencies_t` is built ~2,200 lines **before** the fa i18n
overlay appends the Persian aliases. So a Persian-named archive url is blanked alone, its
date survives, and the citation reports «|archive-date= نیازمند |archive-url= است».

A preview cannot see it: `is_preview_mode = not is_set(REVISIONID)`, and the suppression
pass is skipped in preview. `action=parse&text=` has no REVISIONID — which is the entire
`text=` vs `oldid=` disagreement, and why every isolation test rendered clean.

**The guard is implemented.** `ARCHIVE_TODAY_FAMILY` in `normalize-cite-params.ts` freezes
the whole archive family (`archive-url`, `archive-date`, `url-status`) on any citation
carrying such a URL; everything else on the page is still done. **All five pages this run
self-reverted carry an archive.today URL — 5 of 5** — and under the guard none of them
produces a Persian-named archive parameter inside such a citation. Four tests cover it,
built on the real failing citation from آمریکایی‌ها.

The **module** fix (rebuild `dependencies_t` keyed on every alias, after the overlay, in
both Configurations) would additionally clear a large share of
`رده:صفحه‌های دارای خطا در نشانی بایگانی` — 4,361 pages, most of them broken by hand, with
no bot involved. It is a core-module edit and is the operator's call. Full diagnosis, the
nine-case reproduction table and the exact Lua: `docs/task-03-open-defect.md`.

The run can resume: §4.

## 3b. The original (superseded) hypothesis

~20% of edits in the last batch were self-reverted, all with one message:

```
|archive-date= نیازمند |archive-url= است
```

The engine rendering the citation recognises `تاریخ بایگانی` as ArchiveDate but **not**
`پیوند بایگانی` as ArchiveURL, so a set archive date with no archive url trips the
dependency check in `url_dependency_map_t`.

**The bot's edit is correct.** The example that proves it:

```
before: {{cite press release|title=…|url=…|accessdate=November 23, 2012
         |archiveurl=https://web.archive.org/…|archivedate=۲۴ دسامبر ۲۰۱۰|deadurl=yes}}
after:  {{cite press release|title=…|url=…|accessdate=November 23, 2012
         |پیوند بایگانی=https://web.archive.org/…|تاریخ بایگانی=۲۴ دسامبر ۲۰۱۰|چگونگی پیوند=مرده}}
```

Ruled out by rendering, each giving **0 errors in isolation**: `cite press release` with
the Persian names, with the English names, with `نشانی بایگانی`, with `زبان=fa`, and
`یادکرد وب` with the Persian names. Both Persian names *are* declared in `aliases_add` in
«پودمان:Citation/CS1/fa/i18n».

What it points at:

| instrument, identical bytes (rev 44674288) | spans | «نیازمند» |
|---|---|---|
| `action=parse&text=` | 8 | 0 |
| `action=parse&oldid=` | **10** | **1** |

and the failing pages **mix both engines**: 50 English-named citations (`cite web` ×29,
`cite news` ×11 …) against 3 Persian-named, with only 2 explicit `زبان` parameters. The
dispatch picks the engine per citation, so such a page loads both. A `mw.loadData` table is
a shared read-only proxy and this repo already records two ways those behave unlike plain
tables (`lessons/wikitext-and-params/loaddata-nested-table-metatable-poison.md`,
`loaddata-proxy-length-operator-returns-zero.md`). A per-parse ordering effect also
explains why a preview never reproduces it.

**Why the rate jumped from 0.7% in the trial to ~20% here.** The trial drew from the
duplicate-parameter category, whose pages were largely Persian-named already. This run
draws from the legacy-alias searches — pages with **English** parameter names, which are
exactly the citations routed to the en engine. The population selects for the bug.

### The fix, and it is one line of Lua

Make `پیوند بایگانی` resolve as an ArchiveURL alias for the **en** engine too, the way
`تاریخ بایگانی` already does for ArchiveDate. The operator holds `templateeditor`.

Reproduce by **saving, not previewing**: take a page with many English-named citations, add
one `یادکرد وب`, convert one English citation's archive parameters to the Persian names,
save, parse by `oldid`, then vary the ORDER of the Persian-named citation. If the error
tracks the order, the shared `loadData` table is confirmed.

Full diagnosis: `docs/task-03-open-defect.md`.

## 4. Enumeration order matters for this scope — ⚠ THE EARLIER CLAIM HERE WAS WRONG

This section used to say the duplicate-parameter category was «largely drained» for the
approved scope, on the strength of one capped run that processed 25 pages for 0 edits.
**That was false, and it was repeated to the operator before anyone checked it.**

Measured on ۹ اکتبر ۲۰۲۶ — a random 300 of the category's members, each run through the
task's own `normalizeCiteParams`:

| scope | would be edited | no change | needs a human |
|---|---|---|---|
| **approved only** | **275 / 300 (۹۲٪)** | 23 | 2 |
| widened (the ten unapproved families) | 286 / 300 | 2 | 12 |

So «رده:صفحه‌های دارای ارجاع با متغیر تکراری» holds **45,126** articles (ns0) and about
92% of them are actionable **under the approved scope alone**. It is the opposite of
drained, and it is the better population to work first: a duplicate parameter renders a
visible CS1 error, where a legacy alias renders fine and is only a migration debt.

The one capped run that found nothing was evidence about one 25-page window and a then
different code state, not about 45,000 pages. A zero needs a positive control
(`lessons/verification-and-gates/a-zero-needs-a-positive-control.md`); this one never got
one.

The searches are the second population, re-measured the same day:

| query | articles |
|---|---|
| `insource:"archive-url"` | 169,083 |
| `insource:"archive-date"` | 169,006 |
| `insource:"url-status"` | 126,513 |
| `insource:"dead-url"` | 118,378 |
| `insource:"archiveurl"` | 109,295 |
| `insource:"archivedate"` | 109,288 |
| `insource:"پیوند مرده"` | 77,197 |
| `insource:"پیوند بایگانی"` | 45,741 |
| `insource:"نشانی بایگانی"` | 41,505 |
| `insource:"deadurl"` | 12,416 |
| `insource:"ref=harv"` | 1,730 |

### Why the targets are a frozen file and not enumerated per run

Not laziness: **CirrusSearch hard-errors past offset 10,000** —
`cirrussearch-offset-too-large`, verified ۹ اکتبر ۲۰۲۶ — so an uncapped in-run enumeration
of those searches throws rather than stopping politely. And the in-run cap is
`limit * 20`, which means a scheduled capped run re-enumerates the *same* leading window
every time and goes idle once that window is done, with tens of thousands of pages left.

So the list is harvested once and frozen, **category first** because those pages carry a
visible error, then the union of the eight search windows:
`scripts/archive/task3-harvest-targets.py` in the companion repo.

## 4b. It runs on a schedule now — ۹ اکتبر ۲۰۲۶

The earlier batches were **one-off** jobs with a `--limit`, so each finished and vanished
from `toolforge jobs list`, and the task looked stopped when it had merely run out of its
cap. With the full permission it is a cron job instead:

```
cite-params-2h   scheduled: 20 */2 * * *
  ./task-03-cite-params/run.sh --live --limit 200 --delay 15
```

200 pages every two hours is ~85 minutes of work at the observed ~25s per edit, so a run
always finishes well before the next one fires — an overrunning schedule stacks pods and
is worse than a slower one.

`TARGET_FILE` now defaults to `targets.txt` inside `run.sh`, so no job command has to set
it. The list is **80,450 titles** — the 45,126 category members first, then the union of
the eight search windows (`scripts/archive/task3-harvest-targets.py` in the
companion repo). Checkpoint at the time of writing: **1,189 done, 15 deferred**. At ~2,400
edits a day that is about five weeks of work; regenerate the list when runs start
reporting nothing to do, and **verify the claim before believing it** — see §4.

## 5. What was verified about the edits themselves

- **Transformations are right.** `archiveurl 2→0`, `archivedate 2→0`, `dead-url 2→0`;
  `پیوند بایگانی 0→2`, `تاریخ بایگانی 0→2`, `چگونگی پیوند 0→2`; rendered output identical,
  errors 0→0. Checked with `src/tasks/task-03/verify-trial.ts`.
- **The late-added aliases resolve.** `نشانی بایگانی` merges away; `dead-url=yes` becomes
  `چگونگی پیوند=مرده`; an existing `=dead` is left unchurned, so no pointless churn.
- **Nothing outside a citation moves.** `archive/check-only-citations-changed.ts`: 81 of 81
  pages clean. Its first version compared line-by-line and reported whole articles as
  changed because a four-line citation collapsing to three shifts everything after it —
  the false positive `lineDiff` in `core.ts` exists to avoid.

## 6. `ref=harv` removal — correct, with one promise to keep

Checked on `امپراتوری بیزانس` (diff 44674319), the case the operator queried:

- **`CITEREF` anchors: 188 before, 188 after.** None lost, none gained. The `Thurn`
  citation's own anchor survives. **0** new dangling short-footnote links.
- Only the exact value `harv` was removed; no other `ref=` value existed. This matters
  because `ref=none` suppresses an anchor and `ref={{sfnref|…}}` sets a custom one, and
  dropping either breaks every `{{sfn}}`/`{{پک}}` pointing at it **silently**.
- That edit also converted **16** archive parameters, so it was not a cosmetic edit.

**But the request's claim that `ref=harv` «خطا می‌دهد» is no longer true.** Rendered side
by side: with and without it, **0 errors, 0 maintenance messages, same anchor
`CITEREFX1900`**. (A first probe seemed to show an error span; that was the TemplateStyles
phantom floor, which is why `countErrorMarkers` carries a `class="` prefix.)

So an edit whose ONLY change is removing `ref=harv` is purely cosmetic, which the request
promises never to do («ربات هرگز ویرایشِ صرفاً آرایشی ثبت نمی‌کند»). It can happen: of 30
pages containing `ref=harv`, **one** (`ریاضیات`) would get a harv-only edit; the other 29
had real work too. Scaled over ~1,735 pages that is roughly 60 cosmetic edits.

**Open, small, not yet done:** suppress the edit when removing `ref=harv` is the only
change, and let those pages be picked up when they next have real work.

## 7. Open items, in order

1. ~~Fix the CS1 alias asymmetry~~ — **done in the bot** (§3). Resume the run.
2. **Guard the harv-only cosmetic edit** (§6).
3. **Get the ten widened families approved**, then set `CITE_WIDENED_SCOPE=1` (§2).
4. Resume with the command in §4, in supervised batches, watching the revert rate. Above a
   few percent, stop and look rather than grinding through.
