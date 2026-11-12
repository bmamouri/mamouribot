# وظیفهٔ ۳: the archive.today defect in the CS1 modules

On a few pages, renaming archive parameters to Persian names made CS1 show an error that was
not there before:

    {{cite web}}: |archive-date= نیازمند |archive-url= است

The cause was in the CS1 modules, not in the bot's edits. It is fixed on both sides:

- **In the bot** (since ۸ اکتبر ۲۰۲۶): `ARCHIVE_TODAY_FAMILY` leaves the archive parameters of
  any citation with an archive.today URL exactly as written.
- **In the modules** (۸ اکتبر ۲۰۲۶): `پودمان:Citation/CS1/en/Configuration` (rev 44677658) and
  `پودمان:Citation/CS1/fa/Configuration` (rev 44677662) now rebuild `dependencies_t` keyed on
  every alias.

Still open: lifting the bot guard (see [the last section](#open-the-bot-guard-can-now-be-lifted)).

## Cause

### The trigger is an `archive.today` URL

`Module:Citation/CS1/en` (and `/fa`, identical here) runs a suppression pass at ~line 4830:

```lua
if cfg.suppress_archive_today_urls then
    has_archive_today_url (cite_args_t);
```

`has_archive_today_url` blanks any parameter holding an archive.today-family URL, and its
declared dependents:

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

`cfg.dependencies_t` had two separate faults, in both `پودمان:Citation/CS1/en/Configuration`
and `پودمان:Citation/CS1/fa/Configuration` (byte-identical in this region, lines 462–491):

1. `url_dependency_map_t` is keyed on English parameter names only: `['archive-url']`,
   `['archiveurl']`, `['url']`… There is no `['پیوند بایگانی']`, so a Persian-named archive
   url is blanked on its own and `تاریخ بایگانی` survives.
2. `dependencies_t` is built at line ~478, about 2,200 lines before the fa i18n overlay
   (line ~2680) adds the Persian aliases to `aliases`. So even under the English key
   `archiveurl` the list of dependents holds only `archive-date`/`archivedate`, never
   `تاریخ بایگانی`.

Either way the engine reaches line 4106 with ArchiveDate set and ArchiveURL blank:

```lua
if utilities.is_set (ArchiveDate) then     -- ArchiveURL not set but ArchiveDate is
    utilities.set_message ('err_archive_date_missing_url');
```

A single citation on an otherwise empty page is enough to reproduce it.

### Why a preview never shows it

`is_preview_mode = not utilities.is_set (frame:preprocess ('{{REVISIONID}}'))` (line 4707),
and the suppression pass is skipped in preview. `action=parse&text=` has no REVISIONID, so
it is preview mode: nothing is blanked and the render is clean. That is why `text=` and
`oldid=` disagreed, why every isolated test passed, and why the bot's pre-save check cannot
see it (a pre-save check has no revision, so it can only use `text=`).

`action=parse&text=…&revid=<n>` does reproduce it. Adding `revid=` sets `{{REVISIONID}}` and
matches the stored parse exactly. On the nine-case sandbox below: stored `oldid=` → 12 spans
/ 6 «نیازمند»; `text=` alone → 0/0; `text=` + `revid=` → **12/6**. So this kind of defect can
now be tested against unsaved wikitext.

### Measured on a live sandbox (کاربر:Mamouri/آزمایش یادکرد، نسخهٔ ۴۴۶۷۵۴۰۴)

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

The error appears when a citation has an archive.today-family URL and its archive-url and
archive-date parameters do not both come from the same language's names. `web.archive.org`
is clean whatever the names.

Case H explains the ten pages that already showed «نیازمند» before the bot touched them (see
below). ~18,400 mainspace articles carry an archive.today-family URL and ~4,050 of those also
contain `تاریخ بایگانی`; a hand-written mix breaks the same way.
`رده:صفحه‌های دارای خطا در نشانی بایگانی` held 4,361 pages.

## The fix in the bot

`ARCHIVE_TODAY_FAMILY` in `src/tasks/task-03/normalize-cite-params.ts`: when a citation has
such a URL, the whole archive family (`archive-url`, `archive-date`, `url-status`) is left
exactly as written. The rest of the citation and the rest of the page are still normalized.
All five pages the full run self-reverted carry an archive.today URL (5 of 5), and with the
guard none of them gets a Persian-named archive parameter inside such a citation. Four tests
cover it, including the real failing citation from آمریکایی‌ها.

## The fix in the modules

The block goes at the end of the `F A   I 1 8 N   O V E R L A Y` `do` block, just after the
existing `aliases_add` merge loop (`/fa/Configuration` ≈ line 2675, `/en/Configuration` ≈ line
2685). Both tables are top-level locals (68 locals, well under Lua's limit of 200), and
`dependencies_t` is exported after the overlay at line 2723, so changing it there carries
through.

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

This changes a core module that renders every citation on the wiki, so I saved the same text
to each `/تمرین` sandbox first (`پودمان:Citation/CS1/fa/Configuration/تمرین`) and rendered the
nine cases with `templatesandboxtext` before the live edit.

### Before saving (templatesandboxtext)

On the nine-case sandbox: baseline 12 spans / 6 «نیازمند». With en/Configuration patched,
2/1 (only the `زبان=fa` case was left, which the fa engine handles). With fa/Configuration
patched, 10/5. Both together: 0. **0 Lua errors in every run.**

### After saving (`action=parse&page=`, purged)

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

**0 Lua errors on any of them.** The two pages that still show the message (افغانستان،
محمدرضا شجریان) are real errors: an archive date with no archive url at all, and no
archive.today involved. `رده:صفحه‌های دارای خطا در نشانی بایگانی` held **4,363** articles when
the fix went live; it empties as the job queue re-renders pages.

## Open: the bot guard can now be lifted

`ARCHIVE_TODAY_FAMILY` is still on, so ~18,400 articles never get their archive parameters
normalized. I am leaving it for now: the parser cache keeps old renders around, and the guard
costs nothing while the category empties. Once the category has settled, lift it and re-run
the five pages the earlier batch self-reverted; they are the obvious first test.

## How the citation templates are wired

The full write-up is at the top of `src/tasks/task-03/normalize-cite-params.ts`. In short:

- `الگو:یادکرد وب` is a bare `{{#invoke:citation/CS1/fa/dispatch|web}}`.
- The dispatch picks the engine per citation from that citation's `زبان`/`language`: LTR
  sources go to `Module:Citation/CS1/en`, RTL ones to `Module:citation/CS1/fa`.
- Each engine loads its own configuration: `…/en/Configuration`, `…/fa/Configuration`.
- `پودمان:Citation/CS1/Configuration` belongs to the base module, which these templates no
  longer use. InternetArchiveBot reads it. That is the page I added the Persian aliases to in
  diff 44514521.

The alias tables differ:

| config | ArchiveURL aliases |
|---|---|
| `پودمان:Citation/CS1/Configuration` | `{'پیوند بایگانی', 'archive-url', 'archiveurl'}` |
| `پودمان:Citation/CS1/en/Configuration` | `{'archive-url', 'archiveurl'}` |
| `پودمان:Citation/CS1/fa/Configuration` | `{'archive-url', 'archiveurl'}` |

The Persian names still work in both engines because the fa i18n overlay adds them: both
are in `aliases_add` in «پودمان:Citation/CS1/fa/i18n».

Don't decide that a parameter name or value works by reading a config table. Render it and
look, with `parse&page=`/`&oldid=` (or `&text=` plus `&revid=`), not `&text=` alone.

## How it was found

**In the trial (up to ۷ اکتبر ۲۰۲۶)** six pages in 840 edits regressed (0.7%), all with this
message. The list is in `docs/task-03-trial-state.md`. At the time I looked at two of them,
«۲۴ (مجموعه تلویزیونی)» and «آدم‌ربایی‌های آریل کاسترو», out of the 70 touched then (≈3%). Both
were reverted and carry no bot-caused error now. I held the rest of the trial back, because
at ≈3% the remaining ~900 edits would have spread roughly 27 more of these. I ruled out, each
by a direct test:

- **Data loss.** Parameter counts balance exactly. On آدم‌ربایی‌های آریل کاسترو: archiveurl
  7 + archive-url 3 → 10 Persian; the same for dates; deadurl 1 + dead-url 7 → 8.
- **A single bad citation.** Every archive-bearing citation on the page rendered alone was
  clean.
- **The template name.** `{{Cite news}}`, `{{یادکرد خبر}}`, `{{Cite web}}`, `{{یادکرد وب}}` ×
  Persian/English archive parameters: all eight combinations clean.
- **The choice between the two Persian names.** I changed the canonical from «نشانی بایگانی»
  to «پیوند بایگانی» and re-ran all 70 pages: 66 of 68 clean, and the same two still
  regressed.
- **Post-expand size.** 582,980 of 2,097,152 bytes on ۲۴ (مجموعه تلویزیونی).
- **The bot, on the other pages showing the message.** Ten more of the 70 render «نیازمند»,
  but it was already there in revisions by HujiBot and InternetArchiveBot from before
  MamouriBot, and in revisions using the English `archive-url`. Those pages passed the check
  correctly, because the error count did not go up. (Case H above explains them.)

The one clue was that `action=parse&oldid=` and `action=parse&text=` disagreed on the same
108,226 bytes: `oldid=` gave 4 `cs1-visible-error` spans and «نیازمند»×1, `text=` gave 2 and 0.

I made two measurement mistakes along the way:

1. Applying a candidate fix to the pre-bot revision and rendering it with `text=` showed
   «نیازمند»×0, which looked like proof, but the live page parsed with `page=` still showed
   the error. Use the method that actually shows the defect.
2. Counting pages that show «نیازمند» after a run gave «12 of 70» and looked like new damage.
   Comparing each new revision with its parent, which the verifier already does, gave 2. Ten
   of the twelve were older than the bot.

**On ۸ اکتبر ۲۰۲۶**, in the first supervised batch after full permission, the post-save check
reverted `آمریکایی‌ها` at «خطاهای رندر 8→10» with the same message. The citation:

```
before: {{cite press release|title=…|url=…|accessdate=November 23, 2012
         |archiveurl=https://web.archive.org/…|archivedate=۲۴ دسامبر ۲۰۱۰|deadurl=yes}}
after:  {{cite press release|title=…|url=…|accessdate=November 23, 2012
         |پیوند بایگانی=https://web.archive.org/…|تاریخ بایگانی=۲۴ دسامبر ۲۰۱۰|چگونگی پیوند=مرده}}
```

The bot's edit was correct. Rendered alone, every combination was clean (0 errors each):
`cite press release` with the Persian names, with the English names, with `نشانی بایگانی`,
with `زبان=fa`, and `یادکرد وب` with the Persian names. On the same 44674288 bytes:

| instrument | cs1-visible-error spans | «نیازمند» |
|---|---|---|
| `action=parse&text=` | 8 | 0 |
| `action=parse&oldid=` | **10** | **1** |

The page had 50 English-named citations (`cite web` ×29, `cite news` ×11, `cite press
release` ×1 …), 3 Persian-named ones (`یادکرد وب`) and only 2 explicit `زبان`/`language`
parameters, so it loaded both engines. My first theory was that two engines on one page
shared a `mw.loadData` table and one of them saw the wrong aliases
(`lessons/wikitext-and-params/loaddata-nested-table-metatable-poison.md`,
`loaddata-proxy-length-operator-returns-zero.md`). That was wrong. The same day a single
citation on an empty page reproduced the error; the link to many English citations was just
page size, and the `text=`/`oldid=` gap is the preview-mode skip described above. The
post-save check, which parses the saved revision by `oldid`, caught it and reverted 1 time
in 30 in that batch, so no article was left damaged.
