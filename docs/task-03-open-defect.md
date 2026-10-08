# وظیفهٔ ۳ — open defect blocking the full permission

## Symptom

On two pages, renaming the archive parameters to a **Persian** name introduces a CS1
error that was not there before:

    {{cite web}}: |archive-date= نیازمند |archive-url= است

«۲۴ (مجموعه تلویزیونی)» and «آدم‌ربایی‌های آریل کاسترو». Both reverted; neither carries
a bot-caused error now. Two pages out of 70 touched, ≈3%.

## Ruled out — with the evidence

- **Not data loss.** Parameter counts balance exactly. On آدم‌ربایی‌های آریل کاسترو:
  archiveurl 7 + archive-url 3 → 10 Persian; same for dates; deadurl 1 + dead-url 7 → 8.
- **Not a single bad citation.** Every archive-bearing citation on the page rendered
  alone: clean.
- **Not the template name.** `{{Cite news}}`, `{{یادکرد خبر}}`, `{{Cite web}}`,
  `{{یادکرد وب}}` × Persian/English archive params: all eight clean.
- **Not the choice between the two Persian names.** The canonical was changed from
  «نشانی بایگانی» to «پیوند بایگانی» and all 70 pages re-run: 66 of 68 clean, and these
  same two still regress. The name is not the cause.
- **Not caused by this bot on the other pages that show the message.** Ten more of the
  70 render «نیازمند», but it is PRE-EXISTING there: the same message appears in
  revisions by HujiBot and InternetArchiveBot that predate MamouriBot, and on revisions
  using the ENGLISH `archive-url`. Those pages passed verification correctly, because
  the error count did not rise.

## Two measurement mistakes made while chasing it — both worth remembering

1. **`action=parse&text=` disagrees with `action=parse&page=`.** Applying the fix to the
   pre-bot revision and rendering it via `text=` showed «نیازمند»×0, which looked like
   proof. The live page, parsed via `page=`, still showed the error. Verify with the
   instrument that detects the defect, not a different one.
2. **Absolute error counts are not a regression metric.** Counting pages that *show*
   «نیازمند» after a run gave «12 of 70» and looked like new damage; comparing parent
   against new revision — which the verifier already does — gave 2. Ten of those twelve
   predate the bot.

## Where the source of truth is

Fully written up at the top of `src/tasks/task-03/normalize-cite-params.ts`. The short
version: the templates #invoke a dispatch that picks the engine per citation from the
citation's own language parameter; each engine loads its own Configuration; and
`پودمان:Citation/CS1/Configuration` — the page the operator added the Persian aliases
to in diff 44514521 — is read by **InternetArchiveBot**, not by either engine.

## What is actually known about the mechanism

`الگو:یادکرد وب` is a bare `{{#invoke:citation/CS1/fa/dispatch}}`, and the dispatch picks
the engine **per citation** from the `زبان`/`language` parameter: LTR sources go to
`Module:Citation/CS1/en`, RTL ones to the fa module. Both failing pages are
English-sourced.

The alias tables differ, and neither Persian name is declared in the two configs the
templates actually use:

| config | ArchiveURL aliases |
|---|---|
| `پودمان:Citation/CS1/Configuration` | `{'پیوند بایگانی', 'archive-url', 'archiveurl'}` |
| `پودمان:Citation/CS1/en/Configuration` | `{'archive-url', 'archiveurl'}` |
| `پودمان:Citation/CS1/fa/Configuration` | `{'archive-url', 'archiveurl'}` |

Persian parameter names nevertheless work on the overwhelming majority of citations, so
there is a translation layer between the dispatch and the engine that I have not read.
That layer is the next place to look.

## Next step

Read how `Module:citation/CS1/fa` and `Module:Citation/CS1/en` resolve Persian parameter
names — there must be a translation table or a key-mapping pass that the dispatch
performs. Then bisect «۲۴ (مجموعه تلویزیونی)» against that understanding.

Do NOT run more of the trial first. At ≈3%, the remaining ~900 edits would scatter
roughly 27 of these.


---

## ROOT CAUSE LOCATED — ۸ اکتبر ۲۰۲۶

Caught live on the first supervised batch after full permission: `آمریکایی‌ها`, the
post-save guard reverting at «خطاهای رندر 8→10». The new message is the one this document
is about: `|archive-date= نیازمند |archive-url= است`.

**The bot's edit is correct. The defect is module-side.** The citation involved:

```
before: {{cite press release|title=…|url=…|accessdate=November 23, 2012
         |archiveurl=https://web.archive.org/…|archivedate=۲۴ دسامبر ۲۰۱۰|deadurl=yes}}
after:  {{cite press release|title=…|url=…|accessdate=November 23, 2012
         |پیوند بایگانی=https://web.archive.org/…|تاریخ بایگانی=۲۴ دسامبر ۲۰۱۰|چگونگی پیوند=مرده}}
```

The error means the engine rendering that citation recognised `تاریخ بایگانی` as
ArchiveDate but did **not** recognise `پیوند بایگانی` as ArchiveURL, so a set archive date
with no archive url trips the dependency check in `url_dependency_map_t`.

### What rules it out, and what it points at

- **Not the rename itself.** Rendered in isolation, every combination is clean: `cite
  press release` with the Persian names, with the English names, with `نشانی بایگانی`,
  with `زبان=fa`, and `یادکرد وب` with the Persian names — **0 errors each**.
- **Not the parameter being undeclared.** Both Persian names are in `aliases_add` in
  «پودمان:Citation/CS1/fa/i18n».
- **It is context-dependent, and only in a STORED parse.** The same 44674288 bytes:

  | instrument | cs1-visible-error spans | «نیازمند» |
  |---|---|---|
  | `action=parse&text=` | 8 | 0 |
  | `action=parse&oldid=` | **10** | **1** |

- **The page mixes both CS1 engines.** 50 English-named citations (`cite web` ×29,
  `cite news` ×11, `cite press release` ×1 …) against 3 Persian-named (`یادکرد وب`), and
  only 2 explicit `زبان`/`language` parameters. The dispatch picks the engine **per
  citation**, so this page loads both.

So the hypothesis the evidence supports: when one page causes both engines to load, the
alias table an engine sees is not reliably its own, and `پیوند بایگانی` stops resolving to
ArchiveURL for a citation handled by the en engine. A `mw.loadData` table is a shared
read-only proxy, and this repository already records two ways those proxies behave
unlike plain tables — `lessons/wikitext-and-params/loaddata-nested-table-metatable-poison.md`
and `loaddata-proxy-length-operator-returns-zero.md`. A per-parse ordering effect also
explains why a preview never reproduces it.

### Consequences

- **No article is left damaged.** The guard parses the SAVED revision by `oldid` — the
  only instrument that sees this — and self-reverts. It fired 1 time in 30 on this batch.
- **A pre-save guard cannot catch it**, because a pre-save check has no revision to parse
  and must use `text=`, which shows the page as clean.
- **The fix is not in the bot.** It is in the fa CS1 configuration or the dispatch. Until
  then the bot leaves these pages alone, which costs a fraction of a percent of the
  population.

### Next step for whoever picks this up

Reproduce in a sandbox by SAVING, not previewing: take a page with many English-named
citations, add one `یادکرد وب`, convert one English citation's archive parameters to the
Persian names, save, and parse by `oldid`. Then vary the ORDER of the Persian-named
citation relative to the converted one. If the error tracks the order, the shared
`loadData` table is confirmed and the fix belongs in
«پودمان:Citation/CS1/fa/Configuration» or the dispatch, not here.
