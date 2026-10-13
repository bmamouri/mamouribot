# وظیفهٔ ۱۶ — removing Google/browser text-fragment directives (`#:~:text=`)

> **Status (۱۳ اکتبر ۲۰۲۶): APPROVED AND RUNNING.** `{{مجوز دارد}}` from Huji on
> ۱۲ اکتبر ۲۰۲۶, after a 35-edit trial under the operator's own account that was audited
> diff by diff on the request page. Runs as **MamouriBot**, daily at 06:50 UTC, 200 edits
> per run. Huji's note: removing the directive «نه تنها چیزی نالازم را می‌زداید، که
> مشکلات حق تکثیر را هم رفع می‌کند» — the highlight carries a quoted excerpt of the
> source into the citation.

| | |
|---|---|
| Code | `src/tasks/task-16/strip-text-fragment.ts` (+ `.test.ts`, `corpus-check.replay.ts`) |
| Task id | `strip-text-fragment` |
| Task number | **۱۶** |
| Deployment | `toolforge/task-16-text-fragment/` |
| Research | `research/google-text-fragment-links.md` in the companion repo |
| Draft BRFA | `drafts/brfa-task16-text-fragment.wiki` in the companion repo (not posted) |

## Why

Chrome/Edge/Android-Chrome append a *scroll-to-text-fragment* directive to a URL when
the user got there by tapping a Google search snippet or using "Copy Link to
Highlight": `…page.html#:~:text=some,highlighted%20text`. It is browser-side state (what
to scroll to and highlight), not part of the page's real address — stripping everything
from the directive onward always yields the identical page. Copy-pasted into a wiki
citation, it carries that ephemeral highlight state into the article forever.

The case that started this: `کامفیروز`, live today, citing
`…باشند#:~:text=مهندس%20بهرام…&text=کامفیروز%20علاوه…` where the real URL ends at
`…باشند`.

## Scale (measured ۱۳ اکتبر ۱۴۰۵, CirrusSearch `insource:/\#\:~\:text\=/`)

- **1,942** fa articles (ns0), ≈0.18% of the 1,097,117-article namespace.
- For comparison: en.wikipedia same query → 55,012 (0.76%, no cleanup bot there either);
  de.wikipedia → 223 (0.02%, after ~1 year of `Benutzer:CamelBot` auto-removing them —
  prior art for another Wikipedia running exactly this as routine bot maintenance, see
  `Wikipedia:Bots/Anfragen/Archiv/2025-1#Text-Fragment-Links_II`).
- New ones keep landing (checked the 50 most-recently-touched hits: essentially all
  edited in the last 1–2 days), so this is an ongoing trickle, not a frozen backlog.
- No fa bot or convention currently removes these; a prefix search of
  `…/درخواست مجوز/MamouriBot/` found tasks ۱–۱۵ only, none about this.

## Population shape (200-page / 328-occurrence sample)

| context | share | handling |
|---|---|---|
| citation template `url=`/`نشانی=` (`cite web`/`یادکرد وب`) | 50% | strip from the parameter value |
| bare URL inside `<ref>…</ref>`, no template | 12% | strip from the URL |
| external-link bracket syntax `[http://…#:~:text=… label]` | 4% | strip from the URL |
| external URL elsewhere in body text | 24% | strip from the URL |
| **internal** wikilink `[[صفحه#:~:text=…|برچسب]]` | ~5.5% | strip, see below |
| other/ambiguous | ~4.5% | strip; no special case needed |

So the directive is overwhelmingly a suffix on a plain `https?://` URL, and that URL can
sit **anywhere** in the wikitext — which is why `transform` scans the raw text for every
`#` rather than special-casing templates. Measured end to end: `npx tsx
src/tasks/task-16/corpus-check.replay.ts` strips all 328 occurrences across the 200
sampled pages, 0 leftover directives, 0 brace-balance regressions.

### The two delimiter contexts, and why there are two

Outside a `[[…]]` wikilink, the fragment is percent-encoded and MediaWiki's own
autolinker rule applies: it ends at whitespace, `]`, `|`, `<`, `>`, `"`, `'`, or a
template-closing `{`/`}`.

**`{`/`}` had to be added to that set after the first draft missed them.** 9 of the 328
sampled occurrences sit directly inside `{{Webarchive|url=https://…#:~:text=…}}` with no
`|` between the URL and the closing `}}` — `اکسیژن`, `رضا پهلوی`, `زبان کشمیری`, `هلیوم`
(×3), `کربن` (×2), `کنستانتین بزرگ`. Without the exclusion, the match ate into the `}}`
and left the article with an unbalanced brace. Pinned in the test suite.

**Inside** a `[[…]]` wikilink, the "directive" is whatever **literal, unencoded**
Persian prose was highlighted — someone pasted a Google-highlighted URL straight into a
link target and MediaWiki autolinked it. That text is full of spaces, commas,
parentheses, even embedded Latin (`[[محمد یعقوب بیگ#:~:text=یعقوب بیگ برای جنگ با،
یعقوب بیگ را منهدم کردند.|یعقوب بیگ]]`). Using the URL delimiter set here stops at the
first space and leaves most of the directive sitting in the link's "label" half with a
stray leftover `|`. The only characters that can end it are the wikilink's own
delimiters: `[`, `]`, `|`. `stripTextFragments` tracks `[[`/`]]` depth in one linear pass
and switches delimiter class the instant a `#` is read while inside an open wikilink
target (18 occurrences / ~9 articles in the sample use this shape).

### No `sic!`-style escape hatch exists or is needed

de.wikipedia's `CamelBot` respects a trailing `<!-- sic -->` comment to leave a
deliberately-kept link alone. None of the 328 sampled fa occurrences carry one, and fa
has no on-wiki convention for it. The task strips unconditionally.

## Why this is safe as a bot task

- **Pure substring deletion.** No HTTP fetch, no guessing at "the real" URL, no risk of
  linking to the wrong page — the result for any input is deterministic.
- **The delimiter boundary is MediaWiki's own.** It can never eat a trailing `]`, `|`,
  `<ref>` close, or template brace.
- **A real section anchor is never touched.** `page#section:~:text=…` → `page#section`;
  only the directive after a real anchor is removed, the anchor itself survives.
- **One regex pass covers every context** (`cite`-template `url=`, bare `<ref>` links,
  bracketed external links, plain body text, internal wikilinks) uniformly, because the
  measured population (§ above) shows the directive can be anywhere.
- **Nothing content-shaped changes.** No template fields are added or renamed, no prose
  is touched — the only visible effect is the link target itself, so the built-in
  render-error guard plus a delta gate (`checkWikitext`, old vs. new — never the
  whole-text form, since several candidate pages carry unrelated pre-existing defects
  like an em dash in prose) is enough; no bespoke category/rendering check is needed the
  way task-14/15 need one.

## `verify()`: recompute-and-compare, not a partial re-check

`transform` is pure and deterministic, so `verify` simply **recomputes it from
`oldText`** and requires a byte-for-byte match against `newText`, plus the gate delta and
a final confirmation that no directive remains. An earlier draft instead re-checked only
the URL-shaped case (`https?://[^\s\]|<>"'{}]+`), which would have silently passed a
wikilink-shaped miss — exactly the class of defect `verify` exists to catch
(`docs/BUILDING-A-TASK.md` §2).

## `getTargets`

CirrusSearch `insource:/\#\:~\:text\=/`, ns0, paged 50 at a time up to the 10,000-offset
hard limit (same guard task-15 uses). At ~1,940 candidates today this needs no frozen
file or category walk — a plain `--limit` cap phases it.

## Edit summary

`حذف برچسب برجسته‌سازی مرورگر (#:~:text=) از نشانی منبع` — content-only, names the
artifact being removed, never the bot/script/batch machinery. Matches how editors who
already catch this by hand describe it (seen live: `/* فریاد حلقه */ تمیزکاری`,
`تمیزکاری`).

## Running it

```sh
npx tsx src/tasks/task-16/strip-text-fragment.test.ts        # 22 offline assertions
npx tsx src/tasks/task-16/corpus-check.replay.ts              # needs /tmp/tf_research/pages.json
                                                               # (the 200-page research sample; regenerate
                                                               # per research/google-text-fragment-links.md
                                                               # if it is not on disk)

npx tsx src/run.ts strip-text-fragment --limit 20             # DRY-RUN (default): read every diff
npx tsx src/run.ts strip-text-fragment --live --limit 10 --delay 15           # live, as MamouriBot
```

On Toolforge the scheduled job is `tf-daily`. Do NOT `toolforge jobs load` the task's
jobs.yaml — a load SYNCS and would delete the twelve other tasks' scheduled jobs. Use
`toolforge jobs run` / `delete` per job.

```sh
ssh mamouri@login.toolforge.org 'become mamouribot toolforge jobs logs tf-daily'
ssh mamouri@login.toolforge.org 'become mamouribot toolforge jobs restart tf-daily'
```

## Rollout log

| ۱۳ اکتبر ۲۰۲۶ | what the first Toolforge dry run found |
|---|---|
| the directive continued past a literal space | «کازرون» ×3: the paster wrote Google's `,` separator as «، » — Persian comma plus a **real space** — so the encoded tail of the highlight sat outside MediaWiki's URL class. Stripping to the space left `…هجری- دین%2520اسلام%2520…شد.` inside `نشانی=`: still a broken URL, now with half a highlight hanging off it. Fixed by `debrisAfter()`, which keeps taking following whitespace-separated tokens while they carry a percent escape and contain neither `://` nor `=`. 3 of 12 sampled pages, so not a rarity. |
| duplicate titles in one batch | CirrusSearch offset paging repeats titles (each page is a fresh query against a moving index — the same thing bit وظیفهٔ ۱۵). `getTargets` now returns `[...new Set(out)]`. |
| the checkpoint never expired | The permission rests on this running permanently, but without `recheckAfterDays` a page cleaned today and re-pasted next week would be parked forever while the run reported "nothing to do". Now 30 days; see the note on the field. |

## Open for the operator

The request says «هرگز صفحه‌ای را که ویرایش کرده دوباره ویرایش نمی‌کند». With
`recheckAfterDays: 30` the bot *can* return to a page after a month — but only if the page
has acquired a **new** directive since, which is a new in-scope defect rather than a
re-edit of the old one. That reading is what makes the permanent run Huji approved
possible at all. Worth a sentence on the request page if anyone asks.
