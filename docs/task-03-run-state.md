# وظیفهٔ ۳ — state of the full run, ۸ اکتبر ۲۰۲۶

Handover. Everything measured, not estimated. **The run is STOPPED and deliberately so**;
§3 is the reason and it is not in the bot.

## 1. Where it stands

| | |
|---|---|
| Permission | **{{مجوز دارد}}** granted ۸ اکتبر ۲۰۲۶ (full, not a trial) |
| Edits this run | **45** |
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

## 3. WHY THE RUN IS STOPPED — a module bug, not a bot bug

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

## 4. Enumeration order matters for this scope

`getTargets` walks the duplicate-parameter category (45,173 members) before the
legacy-alias searches. With the approved scope that category is largely drained — the trial
and a human-account run already did its archive cases — so a capped run finds nothing:
`live1` processed 25 pages for **0 edits**, every one «موردی برای هم‌سان‌سازی نبود».

The work is in the searches: **118,930** articles with `dead-url`, **169,076** with
`archive-url`, **41,394** with `نشانی بایگانی`, 1,735 with `ref=harv`.

So the supervised batches were driven from a title list built off those searches and
uploaded to `~/task-03-cite-params/targets.txt` (2,837 titles). To resume:

```bash
become mamouribot
toolforge jobs run cn-live --image node20 --mem 2Gi \
  --command "env TARGET_FILE=/data/project/mamouribot/task-03-cite-params/targets.txt \
             /data/project/mamouribot/task-03-cite-params/run.sh --live --limit 250 --delay 10" \
  -o /data/project/mamouribot/task-03-cite-params/logs/live4.out \
  -e /data/project/mamouribot/task-03-cite-params/logs/live4.err
```

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

1. **Fix the CS1 alias asymmetry** (§3). This unblocks the whole run and is the only thing
   standing between the task and a clean sweep of ~250,000 articles.
2. **Guard the harv-only cosmetic edit** (§6).
3. **Get the ten widened families approved**, then set `CITE_WIDENED_SCOPE=1` (§2).
4. Resume with the command in §4, in supervised batches, watching the revert rate. Above a
   few percent, stop and look rather than grinding through.
