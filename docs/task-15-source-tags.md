# وظیفهٔ ۱۵: source maintenance banners (add, and remove when stale)

This task puts `{{بدون منبع}}` and a few related banners on articles that have no sources,
and takes `{{بدون منبع}}` off articles that are now properly cited. It only acts when it is
sure. Everything doubtful goes on a report page for a person to look at.

## Status

- **Approved** by Huji on ۱۲ اکتبر ۲۰۲۶
  ([request](https://fa.wikipedia.org/wiki/ویکی‌پدیا:سیاست_ربات‌رانی/درخواست_مجوز/MamouriBot/وظیفه_۱۵)).
- Runs as **MamouriBot** from the `st-daily` Toolforge job, every day at 03:05 UTC, with
  `--live --limit 200 --delay 15`.
- The request promises «روزانه، با سقف ۲۰۰ ویرایش در هر اجرا». I don't raise the limit
  without amending the request first.
- Report page: `کاربر:MamouriBot/وظیفه ۱۵/گزارش`, republished on every run.

## What it changes

| banner | when | edit |
|---|---|---|
| `{{بدون منبع}}` | no source of any kind, in the wikitext and in the render | add |
| `{{بدون منبع زنده}}` | the same, on a page in `رده:افراد زنده` | add |
| `{{بهبود منبع}}` | ≥800 prose words and ≤2 sources, or ≥2,000 words and ≤3 sources; not a BLP | add |
| `{{منبع زنده}}` | BLP with 1–2 sources and ≥300 prose words | add |
| stale `{{بدون منبع}}` | enough inline citations for the article's length | remove |

Adding, at the top of the article, below the hatnotes and above the infobox:

```
{{توصیف کوتاه|…}}                    {{توصیف کوتاه|…}}
{{جعبه اطلاعات شخص|…}}       →       {{بدون منبع|تاریخ=اکتبر ۲۰۲۶}}
                                      {{جعبه اطلاعات شخص|…}}
```

Removing, when the tag sits inside `{{مشکلات متعدد}}` with two other banners, deletes only
its line:

```
{{مشکلات متعدد|                       {{مشکلات متعدد|
{{بدون منبع|تاریخ=…}}         →       {{ویکی‌سازی|تاریخ=…}}
{{ویکی‌سازی|تاریخ=…}}                  {{لحن|تاریخ=…}}
{{لحن|تاریخ=…}}                       }}
}}
```

The narrow thresholds for بهبود منبع and منبع زنده are my operating choice, not part of the
template docs. "Too few sources" is a judgement, so the bot only acts far from the
borderline. The request says so.

## What counts as a source

Each of these counts as a source:

1. a `<ref>…</ref>` whose body has anything other than `{{یادکرد-ویکی}}` / `Cite wikipedia`
   and whitespace. A named reuse `<ref name=x/>` is not a new source;
2. `{{پک}}`/`{{sfn}}`/`{{harv*}}`/`{{یادکرد پک}}` and their redirects;
3. a citation template (`یادکرد *`, `cite *`, `citation`) outside `<ref>`, other than
   یادکرد-ویکی;
4. a non-empty bulleted line under a references-type heading (منابع, پانویس, کتاب‌شناسی,
   کتابنامه, پیوند به بیرون, …, and the en equivalents), unless it is only یادکرد-ویکی or
   only `[[…]]` links (a see-also list is not a source);
5. any external URL, in the wikitext or the render, that is not a wiki or authority-control
   host. This includes an infobox `website`;
6. an ISBN / شابک.

These do not count:

- `{{یادکرد-ویکی}}`. Its own documentation says it must not replace the original sources.
  An article whose only "source" is the en.wiki page it was translated from is unsourced.
  Most of the volume comes from these pages.
- A reference that cites only the فرهنگستان word list (`{{یادکرد فرهنگستان}}`) or another
  Wikipedia. It sources the Persian term, not anything the article says.

The page is always rendered before a decision, because templates can emit references and
links the wikitext doesn't show (infoboxes pull Wikidata references, authority-control
templates emit URLs). For `{{بدون منبع}}` the render must show zero footnotes and no
external link other than authority links. If the wikitext and the render disagree, the
page goes on the report.

## Rules for adding

A page is refused if any of these is true:

- it is a redirect, a disambiguation page (`pageprops.disambiguation`), a list (`فهرست*`),
  or a date page. Date pages include day pages in all three calendars, month-and-year pages
  («خرداد ۱۳۸۷»), years, and century, decade and millennium pages. HujiBot وظیفهٔ ۷ removed
  this banner from date pages, so adding it back would reverse a community decision;
- it carries `{{جعبه اطلاعات روستای ایران}}` (Iranian آبادی articles are out of scope);
- it carries an in-use, under-construction, speedy-deletion or AfD template;
- it was edited in the last 7 days. Someone may be working on it;
- it already has any source or verification banner (بدون منبع, بدون منبع زنده, بهبود منبع,
  منبع زنده, یک منبع, بدون پانویس, مدرک, or a redirect to one), on its own or inside
  `{{مشکلات متعدد}}`. This is checked again against the text at save time;
- it already has two or more maintenance banners at the top. Wrapping them is a judgement
  edit, so the page is reported;
- `{{nobots}}`/`{{bots|deny}}` (handled by `core.ts`).

There is no minimum length for `{{بدون منبع}}`. A 20-word unsourced stub is as unsourced as
a 2,000-word one. The spam risk is handled by the daily cap and the pacing.

Existing BLPs that carry plain `{{بدون منبع}}` are not switched to `{{بدون منبع زنده}}`.

For the narrow tiers, sources are counted with the فرهنگستان and other-Wikipedia references
left out.

## Removing a stale tag

- Only the article-level use is removed. Section uses (`{{منبع|بخش}}`, `{{بدون منبع|بخش}}`,
  `{{بدون منبع|...|name=بخش بدون منبع}}`) are skipped.
- Not on a page edited in the last 7 days.
- The article needs **one inline citation per 250 prose words, and at least 2**
  (`citationFloor()`): 2 at 500 words, 3 at 501, 8 at 2,000.
  - Only inline citations count (`inlineCitations()`): footnotes, named reuses and
    `{{پک}}`/sfn. A bullet under «منابع» is a reading list, not tied to any claim.
  - The count is the smaller of the wikitext count and the rendered footnotes.
  - Prose words come from وظیفهٔ ۱۰'s `extractProse` over the rendered HTML (`<p>` text only),
    so infoboxes, tables and reference lists don't inflate it.
  - Adding and removing use different tests on purpose. For adding, a bibliography still
    counts as a source, because there any doubt must block.
- These go on the report instead of being edited:
  - the render shows no footnotes although the wikitext has sources;
  - the tag appears more than once, or next to `{{بخش بدون منبع}}`, so removing one leaves
    the page in the category;
  - the page has a hand-written `[[رده:…بدون منبع…]]`. Removing a hand-placed category is a
    different edit and outside the approved scope;
  - the tag is inside `{{مشکلات متعدد}}` and only one banner would be left. Unwrapping is a
    judgement call.
- The edit removes the tag and its trailing newline, without leaving the page starting with
  a blank line. Inside `{{مشکلات متعدد}}` it removes that line. Nothing else changes.
- The tag is never downgraded to بهبود منبع or یک منبع.

## What it leaves alone

| | why |
|---|---|
| `{{یک منبع}}` | report only. Its doc says one source is not a policy violation and advises against tagging stubs. Pages with exactly one source and ≥300 words are listed on the report |
| `{{بخش بدون منبع}}` | not tagged. A section can be sourced by a neighbouring citation or a general reference |
| `{{اصلاح ترجمه}}` | not tagged. The banner threatens deletion and a detector for untranslated text is right only 15–20% of the time |
| `{{گسترش از زبان}}` | out of scope. It means "a longer article exists in another language", not "contains English" |
| dead links | out of scope. fa has no article-level dead-link banner |
| Iranian آبادی articles | out of scope |

## Placement

- Article banners go at the top, after hatnotes (`{{تغییرمسیر}}`, `{{دیگر کاربردها}}`,
  `{{برای}}`, …), `{{DISPLAYTITLE}}`, `{{عنوان مقاله}}`, `{{توصیف کوتاه}}` and protection
  icons (`{{حص}}`, `{{محافظت}}`, Pp*), and before the infobox.
- If the page has `{{مشکلات متعدد}}`, the banner goes in as a line inside it.
- One newline after the template. No other whitespace changes.
- The banner count for the "two or more" rule only counts the run of templates at the start
  of the page, stopping at the infobox and skipping hatnotes and توصیف کوتاه.

## The date

- Banners carry `تاریخ=<Gregorian month in Persian> <year>` with Persian digits, e.g.
  `{{بدون منبع|تاریخ=اکتبر ۲۰۲۶}}`, the same form `{{جا:بدون منبع}}` produces.
- `پودمان:Message box` files the page under `رده:<category> از <date>`. If that category
  page does not exist, the article lands in
  `رده:مقاله‌های دارای پارامتر تاریخ نادرست در الگو`.
- So at the start of a run `ensureMonthlyCategories` creates any of this month's four
  categories that is missing, with `{{رده تمیزکاری ماهانه}}` as the whole page. On fa
  nothing else creates them
  (`lessons/tracking-categories/dated-maintenance-cat-missing-monthly-cats.md`).
- In a dry run nothing is created and no date is written. If creating a category fails, the
  banner goes in without a date.

## Edit summaries

As MamouriBot, core puts the request link in front (`withBrfaLink(15, …)`). Under
`--as-me` there is no prefix.

- `افزودن الگوی {{بدون منبع}}: مقاله هیچ منبعی ندارد (یادکرد-ویکی منبع به‌شمار نمی‌آید)`
- `افزودن الگوی {{بدون منبع زنده}}: زندگی‌نامهٔ فرد زنده بدون منبع`
- `حذف الگوی {{بدون منبع}}: مقاله اکنون منبع دارد`

The narrow tiers give the measured numbers, e.g. «۲ منبع برای ۱٬۲۰۰ واژه», so an editor who
disagrees can see the rule.

## Finding candidates

`getTargets` searches with CirrusSearch, takes a third of the budget from stale tags and the
rest from add candidates, and shuffles them with a fixed seed so a run doesn't hit fifty
footballers in a row.

- Add: `-insource:"<ref" -insource:"http" -hastemplate:"بدون منبع" -hastemplate:"جعبه اطلاعات روستای ایران" -intitle:فهرست`
  (about 230,000 pages in October 2026; about 99,000 pass all the tests).
- Remove: `hastemplate:"بدون منبع" insource:"<ref"` (about 2,150 pages).

The search only finds candidates. Every page then goes through the full rules.

- Each page is checked first with one batched query (dab, categories, last edit, village
  infobox). Only the survivors are rendered.
- A refusal that depends on the render must set `needsRender` on the `Decision`. Without it
  the cheap screen rejects every such page before rendering, and the run reports nothing to
  edit, with no error. If a daily log shows zero removals, check this first.
- Titles are deduplicated, because offset paging over a live index repeats titles.
- CirrusSearch fails past offset 10,000, so the walk stops there.
- At `--limit 100` the screening takes about 20 minutes before the first edit.

## Checks before saving

`transform` is pure. All network work happens in `getTargets`, cached per title. `verify`
then renders the new text and refuses the edit unless:

- for an add, the page gains the banner's category, and for بدون منبع / بدون منبع زنده the
  render still shows 0 footnotes;
- for a removal, the page leaves `مقاله‌های بدون منبع` (and `زندگی‌نامه زندگان بدون منبع`);
- the page is not in `مقاله‌های دارای پارامتر تاریخ نادرست در الگو`;
- the render has no more error markers (`scribunto-error`, `class="error"`) than before.
  Errors the article already had don't block it;
- `checkWikitext` finds no problem that the old text didn't have.

Category names are compared with U+200E/U+200F removed:
`همه مقاله‌های زندگی‌نامه زندگان بدون منبع‏‏` really has a stray U+200F.

| banner | category |
|---|---|
| بدون منبع | `مقاله‌های بدون منبع` (+ `… از <ماه سال>`) |
| بدون منبع زنده | `زندگی‌نامه زندگان بدون منبع`, `همه مقاله‌های زندگی‌نامه زندگان بدون منبع‏‏` |
| بهبود منبع | `مقاله‌های نیازمند ارجاع‌های اضافی` |
| منبع زنده | `مقاله‌های زندگی‌نامه زندگان بدون منبع` |

## Running it

```sh
npm test                 # also checks the vendored src/lib/ files against the parent repo's scripts/lib/
npm run typecheck
npx tsx src/tasks/task-15/source-detect.replay.ts         # detector vs the measured sample
npx tsx src/run.ts source-tags --limit 20                 # dry run
npx tsx src/run.ts source-tags --live --limit 25 --delay 15
TARGET_TITLES='الف|ب' npx tsx src/run.ts source-tags      # specific pages
```

Pages are selected through environment variables, because the shell mangles Persian titles
passed as arguments.

| variable | effect |
|---|---|
| `TARGET_TITLES` | `|`-separated titles instead of the search |
| `TARGET_FILE` | a JSON list or one title per line |
| `TARGET_CAP` | how many candidates to screen (default `max(limit × 6, 60)`) |
| `PACE_LO`, `PACE_HI` | seconds of pause between edits, overriding the 30–120 s range of `--as-me` |

Deployment is `toolforge/task-15-source-tags/` (`run.sh`, `jobs.yaml`):

| job | what |
|---|---|
| `st-check` | credentials, bot flag and stop page; no edits |
| `st-dry` | dry run, `--limit 25` |
| `st-first` | one-off live run, `--limit 25 --delay 15` |
| `st-daily` | `5 3 * * *`, `--live --limit 200 --delay 15` |

`toolforge jobs load` deletes scheduled jobs that are not in the file, including other
tasks' jobs, so change one job with `toolforge jobs delete X && toolforge jobs run X …`.
Never add `--as-me` to `run.sh`.

To check live edits independently of `verify`, use
`scripts/archive/task15-audit-live-edits.py` in the parent repo.

## Stopping it, state and logs

- Stop: set `کاربر:MamouriBot/ادامه` to anything other than `بله`. The bot checks it before
  every edit.
- State: `BOT_STATE_DIR` (`$HOME/state` on Toolforge). A page is decided once and not
  rechecked later.
- Logs: `logs/st-daily.out` and `logs/st-daily.err` (and the same for the other jobs).

## Open

- «N (عدد)» number articles are genuinely unsourced and in scope, but the search finds them
  together, so they arrive in clumps (19 of 196 edits on one day). I haven't decided whether
  to exclude or throttle them.
- The report never lists section or untranslated-text candidates. The `Decision` type has
  the kinds `بخش بدون منبع` and `اصلاح ترجمه`, but `decide` does not produce them.
- The add search excludes pages with `http` anywhere. If that filter is ever dropped, the
  فرهنگستان / other-Wikipedia rule starts to matter for volume.

## How the source detector works

`source-detect.ts` is a port of a Python prototype that is not in this repository.
`source-detect.replay.ts` checks it against `docs/data/task-15/random-2000.json`: no page may
be called unsourced that the prototype called sourced.

- Comments are stripped first. Template names match
  `\{\{\s*([^{}|\n]+?)\s*(?:\||\}\})`, with `_` read as a space.
- Ref tags are found in a copy of the text with `<nowiki>`, `<pre>` and comments blanked, so
  `<nowiki><ref>…</ref></nowiki>` cites nothing. Ref bodies are read from a copy with only
  comments blanked, so `<ref><nowiki>https://…</nowiki></ref>` is still a source.
- A ref body is یادکرد-ویکی-only if it matches `یادکرد-ویکی|cite wikipedia` and has neither
  `http` nor another citation template.
- References-type headings match
  `منابع|منبع|پانویس|یادداشت|کتاب‌?شناسی|کتابنامه|پیوند به بیرون|پیوندهای بیرونی|جستارهای وابسته|مطالعه بیشتر|برای مطالعه|ارجاع|References|Notes|Bibliography|External|Further|See also|Sources`.
  A general reference is a `*` line longer than 15 characters there.
- The `*_sourcing` fields (`refs_sourcing`, `cite_outside_sourcing`, `http_external`,
  `genref_sourcing`) leave out the فرهنگستان word list and other Wikipedias. Every decision
  uses them. The plain fields stay for the replay.
- Rendered footnotes are counted by `countRenderedRefs()`. MediaWiki writes the id as
  `id="cite&#95;note-1"`, so the HTML is decoded before matching `id="cite_note-`.
- External links in the render are ignored when the host matches `NOT_A_SOURCE_HOST` in
  `source-tags.ts` (wiki projects, authority control, «یافتن منابع» search links).
- JavaScript's `\b` only understands ASCII. Don't put `\b` next to a Persian literal in any
  regex here; it silently matches nothing.

Data in `docs/data/task-15/`, measured ۱۰ اکتبر ۲۰۲۶:

- `random-2000.json`: per-page features for 2,000 random articles, the replay fixture;
- `strict-unsourced-rendered.json`: the render check of the 212 strictly unsourced pages in
  that sample;
- `template-survey.json`: use counts and redirect lists for every template involved.

## Code

| file | what |
|---|---|
| `src/tasks/task-15/source-tags.ts` | the `BotTask` (`id: 'source-tags'`, `taskNumber: 15`): search, cheap facts, render, monthly categories, `verify`, report |
| `src/tasks/task-15/decide.ts` | all the rules: `decide`, date pages, banner count, summaries |
| `src/tasks/task-15/banners.ts` | banner names and categories, placement, `addBanner`, `removeStaleTag` |
| `src/tasks/task-15/source-detect.ts` | the source detector, `inlineCitations`, `citationFloor` |
| `src/tasks/task-15/source-tags.test.ts`, `source-detect.test.ts` | offline tests |
| `src/tasks/task-15/source-detect.replay.ts` | replay against the measured sample |
| `toolforge/task-15-source-tags/` | `run.sh`, `jobs.yaml` |
