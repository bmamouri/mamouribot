# وظیفهٔ ۱۶: removing browser text-fragment directives (`#:~:text=`)

This task removes the `#:~:text=…` highlight that browsers add to copied links, from URLs
and links in fa articles.

**Status (۱۳ اکتبر ۲۰۲۶): approved and running.** Huji gave `{{مجوز دارد}}` on
۱۲ اکتبر ۲۰۲۶, after a 35-edit trial under my own account that he checked diff by diff on
the request page. It runs as MamouriBot, daily at 06:50 UTC, with 200 edits per run.
Huji noted that removing the directive «نه تنها چیزی نالازم را می‌زداید، که مشکلات حق تکثیر
را هم رفع می‌کند», because the highlight carries a quoted excerpt of the source into the
citation.

| | |
|---|---|
| Code | `src/tasks/task-16/strip-text-fragment.ts` (+ `.test.ts`, `corpus-check.replay.ts`) |
| Task id | `strip-text-fragment` |
| Task number | **۱۶** |
| Deployment | `toolforge/task-16-text-fragment/` |
| Research | `research/google-text-fragment-links.md` in the companion repo |
| Draft BRFA | `drafts/brfa-task16-text-fragment.wiki` in the companion repo (not posted) |

## Why

Chrome, Edge and Chrome on Android add a *scroll-to-text-fragment* directive to a URL when
someone arrives by tapping a Google search snippet or uses "Copy Link to Highlight":
`…page.html#:~:text=some,highlighted%20text`. It only tells the browser what to scroll to
and highlight. It is not part of the page's address, and cutting the URL at the directive
always gives the same page. Pasted into a citation, it keeps that highlight in the article
for good.

The case that started this was `کامفیروز`, which cites
`…باشند#:~:text=مهندس%20بهرام…&text=کامفیروز%20علاوه…` where the real URL ends at
`…باشند`.

## How many (۱۳ اکتبر ۱۴۰۵, CirrusSearch `insource:/\#\:~\:text\=/`)

- **1,942** fa articles (ns0), ≈0.18% of the 1,097,117 articles.
- en.wikipedia, same query: 55,012 (0.76%, with no cleanup bot there either).
  de.wikipedia: 223 (0.02%), after about a year of `Benutzer:CamelBot` removing them. So
  another Wikipedia already does exactly this as routine bot work; see
  `Wikipedia:Bots/Anfragen/Archiv/2025-1#Text-Fragment-Links_II`.
- New ones keep arriving. Of the 50 most recently edited hits, nearly all had been edited
  in the last day or two, so this is a steady trickle, not a fixed backlog.
- No fa bot or convention removes these today. A prefix search of
  `…/درخواست مجوز/MamouriBot/` found only tasks ۱–۱۵, none of them about this.

## Where the directive appears (sample of 200 pages, 328 occurrences)

| context | share | handling |
|---|---|---|
| citation template `url=`/`نشانی=` (`cite web`/`یادکرد وب`) | 50% | strip from the parameter value |
| bare URL inside `<ref>…</ref>`, no template | 12% | strip from the URL |
| external-link bracket syntax `[http://…#:~:text=… label]` | 4% | strip from the URL |
| external URL elsewhere in body text | 24% | strip from the URL |
| **internal** wikilink `[[صفحه#:~:text=…|برچسب]]` | ~5.5% | strip, see below |
| other/ambiguous | ~4.5% | strip; no special case needed |

Almost always the directive is a suffix on a plain `https?://` URL, and that URL can be
anywhere in the wikitext. So `transform` scans the raw text for every `#` instead of
handling templates separately. Tested end to end with `npx tsx
src/tasks/task-16/corpus-check.replay.ts`: it strips all 328 occurrences on the 200 sample
pages, with 0 directives left and 0 unbalanced braces.

### Where the directive ends

Outside a `[[…]]` wikilink, the fragment is percent-encoded and MediaWiki's own rule for
bare URLs applies: it ends at whitespace, `]`, `|`, `<`, `>`, `"`, `'`, or a template
brace `{`/`}`.

The first draft left out `{` and `}`. 9 of the 328 sample occurrences sit directly inside
`{{Webarchive|url=https://…#:~:text=…}}` with no `|` between the URL and the closing `}}`:
`اکسیژن`, `رضا پهلوی`, `زبان کشمیری`, `هلیوم` (×3), `کربن` (×2), `کنستانتین بزرگ`. Without
the braces in the set, the match ran into the `}}` and left the article with an unbalanced
brace. The test suite covers this.

Inside a `[[…]]` wikilink, the directive is the **literal, unencoded** Persian text that was
highlighted: someone pasted a highlighted URL straight into a link target and MediaWiki
turned it into a link. That text is full of spaces, commas, brackets and even Latin
(`[[محمد یعقوب بیگ#:~:text=یعقوب بیگ برای جنگ با، یعقوب بیگ را منهدم کردند.|یعقوب بیگ]]`).
The URL rule would stop at the first space, leaving most of the directive in the link's
label half with a stray `|`. Here only the wikilink's own delimiters can end it: `[`, `]`,
`|`. `stripTextFragments` tracks `[[`/`]]` depth in a single pass and switches to these
delimiters as soon as it reads a `#` inside an open wikilink target (18 occurrences on
~9 articles in the sample).

### No way to opt out

de.wikipedia's `CamelBot` leaves a link alone if it ends with a `<!-- sic -->` comment.
None of the 328 fa samples has one, and fa has no such convention, so the task strips every
directive.

## Why this is safe for a bot

- **It only deletes a substring.** No HTTP requests and no guessing at the "real" URL, so
  it can't link to the wrong page, and the same input always gives the same result.
- **It ends where MediaWiki ends a URL.** It can never take a trailing `]`, `|`, `<ref>`
  close or template brace.
- **A real section anchor is kept.** `page#section:~:text=…` → `page#section`; only the
  directive after the anchor is removed.
- **One regex pass covers every context** (`cite` template `url=`, bare `<ref>` links,
  bracketed external links, plain body text, internal wikilinks) in the same way, because
  the sample above shows the directive can be anywhere.
- **No content changes.** No template fields are added or renamed and no prose is touched;
  the only visible change is the link target. The built-in render-error check plus
  `checkWikitext` on the change (old against new, never on the whole text, since several
  candidate pages already have unrelated problems such as an em dash in prose) are enough.
  It needs no special category or render check like task-14/15 do.

## `verify()`

`transform` is pure and deterministic, so `verify` simply runs it again on `oldText` and
requires a byte-for-byte match with `newText`, plus the check on the change and a final
check that no directive is left. An earlier draft only re-checked the URL case
(`https?://[^\s\]|<>"'{}]+`), which would have let a missed wikilink case through, the
kind of defect `verify` is there to catch (`docs/BUILDING-A-TASK.md` §2).

## `getTargets`

CirrusSearch `insource:/\#\:~\:text\=/`, ns0, 50 at a time up to the 10,000-offset limit
(the same guard task-15 uses). With ~1,940 candidates today it needs no saved list or
category walk; `--limit` is enough to split it into runs.

## Edit summary

`حذف برچسب برجسته‌سازی مرورگر (#:~:text=) از نشانی منبع`. It describes the content only,
names what is removed, and says nothing about the bot or the run. Editors who already
remove these by hand describe it the same way (seen live: `/* فریاد حلقه */ تمیزکاری`,
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

On Toolforge the scheduled job is `tf-daily`. Don't run `toolforge jobs load` on this
task's jobs.yaml. A load syncs the whole job list and deletes the twelve other tasks'
scheduled jobs. Use `toolforge jobs run` and `delete` per job.

```sh
ssh mamouri@login.toolforge.org 'become mamouribot toolforge jobs logs tf-daily'
ssh mamouri@login.toolforge.org 'become mamouribot toolforge jobs restart tf-daily'
```

## Rollout

| ۱۳ اکتبر ۲۰۲۶ | what the first Toolforge dry run found |
|---|---|
| the directive continued past a literal space | «کازرون» ×3: whoever pasted it wrote Google's `,` separator as «، », a Persian comma plus a **real space**, so the encoded rest of the highlight fell outside MediaWiki's URL characters. Stripping up to the space left `…هجری- دین%2520اسلام%2520…شد.` inside `نشانی=`: still a broken URL, now with half a highlight attached. Fixed with `debrisAfter()`, which keeps taking the following space-separated pieces as long as they contain a percent escape and contain neither `://` nor `=`. 3 of 12 sampled pages, so not rare. |
| duplicate titles in one batch | CirrusSearch offset paging repeats titles (each page is a new query against an index that keeps changing; وظیفهٔ ۱۵ had the same problem). `getTargets` now returns `[...new Set(out)]`. |
| the checkpoint never expired | The permission depends on this running permanently, but without `recheckAfterDays` a page cleaned today and pasted into again next week would be skipped forever while the run reported "nothing to do". Now 30 days; see the note on the field. |

## The "never edits a page twice" line

The request says «هرگز صفحه‌ای را که ویرایش کرده دوباره ویرایش نمی‌کند». With
`recheckAfterDays: 30` the bot can come back to a page after a month, but only if the page
has a **new** directive by then. That is a new problem within scope, not a second edit of
the old one, and it is how I read the request: otherwise the permanent run Huji approved
would not be possible. If anyone asks, I will explain this on the request page.
