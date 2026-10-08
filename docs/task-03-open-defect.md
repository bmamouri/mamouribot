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

---

## ACTUAL ROOT CAUSE — ۸ اکتبر ۲۰۲۶. The section above is superseded.

**It is not a `mw.loadData` proxy, and it is not about mixing engines.** A SINGLE citation
on an otherwise empty page reproduces it. The "many English citations" correlation was an
artefact of page size, and the `text=` vs `oldid=` split has a plain explanation.

### The trigger is an `archive.today` URL

`Module:Citation/CS1/en` (and `/fa`, identical here) runs a suppression pass at ~line 4830:

```lua
if cfg.suppress_archive_today_urls then
    has_archive_today_url (cite_args_t);
```

`has_archive_today_url` blanks any parameter holding an archive.today-family URL **and its
declared dependents**:

```lua
for p, v in pairs (cite_args_t) do
    if is_archive_today_url (v:lower()) then
        table.insert (unset_params_t, p);
        if cfg.dependencies_t[p] then          -- keyed on the LITERAL parameter name
            for _, dependent in ipairs (cfg.dependencies_t[p]) do
                table.insert (unset_params_t, dependent);
            end
        end
    end
end
if 0 < #unset_params_t then
    if not is_preview_mode then                -- preview does NOT suppress
```

`cfg.dependencies_t` has **two independent faults**, in both
`پودمان:Citation/CS1/en/Configuration` and `پودمان:Citation/CS1/fa/Configuration`
(byte-identical in this region, lines 462–491):

1. **`url_dependency_map_t` is keyed on English parameter names only** — `['archive-url']`,
   `['archiveurl']`, `['url']`… There is no `['پیوند بایگانی']`. A Persian-named archive
   url is therefore blanked **alone**, and `تاریخ بایگانی` survives.
2. **`dependencies_t` is built at line ~478, about 2,200 lines BEFORE the fa i18n overlay**
   (line ~2680) appends the Persian aliases to `aliases`. So even under the English key
   `archiveurl` the dependent list holds only `archive-date`/`archivedate` — never
   `تاریخ بایگانی`.

Either way the engine reaches line 4106 with ArchiveDate set and ArchiveURL blank:

```lua
if utilities.is_set (ArchiveDate) then     -- ArchiveURL not set but ArchiveDate is
    utilities.set_message ('err_archive_date_missing_url');
```

### Why a preview never reproduced it

`is_preview_mode = not utilities.is_set (frame:preprocess ('{{REVISIONID}}'))` (line 4707),
and the suppression pass is skipped in preview. `action=parse&text=` has no REVISIONID, so
it **is** preview mode — nothing gets blanked, nothing becomes inconsistent, the render is
clean. That is the whole `text=` / `oldid=` disagreement, and why every isolation test
passed. Measurement mistake #1 above was reading a real difference as an instrument quirk.

### Measured, on a live sandbox (کاربر:Mamouri/آزمایش یادکرد، نسخهٔ ۴۴۶۷۵۴۰۴)

One citation per case. `oldid=`: 14 `cs1-visible-error` spans, 6 «نیازمند». `text=` on the
same bytes: 2 spans, **0** «نیازمند».

| case | archive-url param | archive-date param | host | stored parse |
|---|---|---|---|---|
| A | `پیوند بایگانی` | `تاریخ بایگانی` | archive.today | **error** |
| B | `archiveurl` | `archivedate` | archive.today | clean |
| C | `archive-url` | `archive-date` | archive.today | clean |
| D | `پیوند بایگانی` | `تاریخ بایگانی` | web.archive.org | clean |
| E | A, but `{{یادکرد وب}}` | | archive.today | **error** |
| F | A, plus `زبان=fa` (fa engine) | | archive.today | **error** |
| G | `نشانی بایگانی` | `تاریخ بایگانی` | archive.today | **error** |
| H | `archiveurl` | `تاریخ بایگانی` | archive.today | **error** ← fault 2 alone, no bot involved |
| I | `پیوند بایگانی` | `archivedate` | archive.today | **error** |

So: an archive.today-family URL whose archive-url and archive-date parameters are **not
both from the same language's name set**. `web.archive.org` is clean under any naming.

**Case H explains the ten pre-existing «نیازمند» pages the write-up above could not
account for.** ~18,400 mainspace articles carry an archive.today-family URL and ~4,050 of
those also contain `تاریخ بایگانی`; a hand-written mixture breaks identically.
`رده:صفحه‌های دارای خطا در نشانی بایگانی` holds 4,361 pages.

### What was done in the bot — DONE

`ARCHIVE_TODAY_FAMILY` in `src/tasks/task-03/normalize-cite-params.ts`: when a citation
carries such a URL, the whole archive family (`archive-url`, `archive-date`, `url-status`)
is left exactly as written. The rest of the citation, and the rest of the page, still get
their work. **All five pages the run self-reverted carry an archive.today URL** — 5 of 5 —
and under the guard none of them produces a Persian-named archive parameter inside such a
citation. Four tests cover it, including the real failing citation from آمریکایی‌ها.

### The module fix — NOT done, needs the operator's call

Rebuild `dependencies_t` keyed on **every** alias, **after** the i18n overlay, in both
Configurations. Insert at the end of the `F A   I 1 8 N   O V E R L A Y` `do` block, just
after the existing `aliases_add` merge loop (`/fa/Configuration` ≈ line 2675,
`/en/Configuration` ≈ line 2685). Both tables are top-level locals (68 locals, far under
Lua's 200 limit) and `dependencies_t` is exported *after* the overlay at line 2723, so
mutating it there propagates.

```lua
	-- fa i18n: <dependencies_t> was built at line ~478 from <aliases> BEFORE the Persian names
	-- were appended just above, and <url_dependency_map_t> is keyed on English parameter names
	-- only, so has_archive_today_url() blanks a Persian-named archive url without blanking
	-- |تاریخ بایگانی=, which then trips err_archive_date_missing_url.  Rebuild, keyed on every alias.
	for meta, key in pairs ({URL = 'url', ArchiveURL = 'archive-url', ChapterURL = 'chapter-url',
		ConferenceURL = 'conference-url', MapURL = 'map-url', TranscriptURL = 'transcript-url'}) do
		local deps_t = {};
		for _, dep_meta in ipairs (url_dependency_map_t[key] or {}) do
			local a = aliases[dep_meta];
			if 'string' == type (a) then deps_t[#deps_t + 1] = a;
			else for _, n in ipairs (a) do deps_t[#deps_t + 1] = n; end end
		end
		local names_t = aliases[meta];
		if 'string' == type (names_t) then names_t = {names_t}; end
		for _, n in ipairs (names_t) do dependencies_t[n] = deps_t; end
	end
```

This is a change to a core module that renders on every citation on the wiki, and it would
clear a large share of 4,361 error pages — upside and blast radius both large. It is the
operator's decision, not the bot's, and it should be sandboxed
(`پودمان:Citation/CS1/fa/Configuration/تمرین` + `templatesandboxtext` renders of the nine
cases above) before any live edit.

---

## THE MODULE FIX IS LIVE — ۸ اکتبر ۲۰۲۶

Applied to both `پودمان:Citation/CS1/en/Configuration` (rev 44677658) and
`پودمان:Citation/CS1/fa/Configuration` (rev 44677662), with the same text first saved to
each `/تمرین` sandbox. The block rebuilds `dependencies_t` at the END of the fa i18n
overlay, keyed on **every** alias, so it sees the Persian names that the original
build — 2,200 lines earlier — could not.

### The instrument that finally measured it

`action=parse&text=…&revid=<n>` — `text=` alone is preview mode and renders clean;
adding `revid=` sets `{{REVISIONID}}` and reproduces the stored parse **exactly**. On the
nine-case sandbox: stored `oldid=` → 12 spans / 6 «نیازمند»; `text=` alone → 0/0;
`text=` + `revid=` → **12/6**. That is the whole two-day instrument puzzle, and it means
a defect of this class is now testable against unsaved wikitext.

### Verified before saving, via templatesandboxtext

On the nine-case sandbox: baseline 12 spans / 6 «نیازمند»; en/Configuration patched
→ 2/1 (only the `زبان=fa` case left, which the fa engine handles); fa/Configuration
patched → 10/5. Together, 0. **0 Lua errors in every run.**

### Live, after saving (`action=parse&page=`, purged)

| page | cs1 errors before → after | this message before → after |
|---|---|---|
| the nine-case sandbox | 12 → **0** | 6 → **0** |
| ایران | 276 → **48** | 114 → **0** |
| شیرین عبادی | 130 → **123** | 7 → **0** |
| گوگل | 49 → **43** | 3 → **0** |
| کیفر ساترلند | 11 → **9** | 1 → **0** |
| امپراتوری بیزانس | 2 → 2 | 1 → **0** |
| کردستان | 6 → 6 | — → **0** |
| آمریکایی‌ها، زبان‌های هندواروپایی، حافظ، مدل (شخص)، فرودگاه…پیرسون، فهرست…شنا | unchanged | unchanged |

**0 Lua errors on any of them.** The two pages still showing the message (افغانستان،
محمدرضا شجریان) are genuine: an archive date with no archive url at all, no archive.today
involved. `رده:صفحه‌های دارای خطا در نشانی بایگانی` held **4,363** articles when the fix
went live; it drains as the job queue re-renders.

### Open: the bot guard can now be lifted

`ARCHIVE_TODAY_FAMILY` is still in force, which means ~18,400 articles never get their
archive parameters normalised. That is deliberate for now — the parser cache keeps old
renders around, and the guard costs nothing while the category drains. Once the category
has settled, lift it and re-run the five pages the earlier batch self-reverted; they are
the natural first test.
