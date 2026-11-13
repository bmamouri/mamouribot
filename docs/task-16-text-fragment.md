# وظیفهٔ ۱۶: removing browser text-fragment directives (`#:~:text=`)

This task removes the `#:~:text=…` highlight that browsers add to copied links, from URLs and
links in fa articles. Chrome and Edge add it when someone arrives from a Google search snippet
or uses "Copy Link to Highlight". It only tells the browser what to highlight; cutting the URL
at the directive always gives the same page. It also carries a quoted excerpt of the source
into the citation.

## Status

- **Approved.** Request page:
  `ویکی‌پدیا:سیاست ربات‌رانی/درخواست مجوز/MamouriBot/وظیفه ۱۶`.
- Runs as MamouriBot, job `tf-daily`, daily at 06:50 UTC (`50 6 * * *`), at most 200 edits
  per run with `--delay 15`.
- Editors paste new directives every day, so it runs permanently. The task sets
  `recheckAfterDays: 30`: a page can be edited again after a month, but only if it has a new
  directive by then. That is how I read «هرگز صفحه‌ای را که ویرایش کرده دوباره ویرایش
  نمی‌کند» in the request.

## What it changes

- `…باشند#:~:text=مهندس%20بهرام…&text=کامفیروز%20علاوه…` → `…باشند`
- `page#section:~:text=…` → `page#section` (a real section anchor is kept)
- `[[محمد یعقوب بیگ#:~:text=یعقوب بیگ برای جنگ با، یعقوب بیگ را منهدم کردند.|یعقوب بیگ]]` →
  `[[محمد یعقوب بیگ|یعقوب بیگ]]`

The directive can be anywhere: in a citation's `url=`/`نشانی=`, a bare URL in a `<ref>`, a
bracketed external link, plain text, or an internal wikilink. So `transform` scans the raw text
for every `#` instead of handling templates separately.

Edit summary: `حذف برچسب برجسته‌سازی مرورگر (#:~:text=) از نشانی منبع`.

## Where the directive ends

- **Outside a `[[…]]` wikilink**, MediaWiki's rule for bare URLs applies: it ends at
  whitespace, `]`, `|`, `<`, `>`, `"`, `'`, `{` or `}`. The braces matter for
  `{{Webarchive|url=https://…#:~:text=…}}`, where nothing else separates the URL from `}}`.
- **After a literal space**, the following space-separated pieces are also taken while they
  contain a percent escape and contain neither `://` nor `=` (`debrisAfter()`). This covers a
  Google `,` separator pasted as a Persian comma plus a real space.
- **Inside a `[[…]]` wikilink target**, the directive is unencoded text full of spaces and
  commas, so only `[`, `]` and `|` end it. `stripTextFragments` tracks `[[`/`]]` depth and
  switches to these delimiters when it reads a `#` inside an open wikilink target.

There is no opt-out comment (de.wikipedia's `CamelBot` honours `<!-- sic -->`; fa has no such
convention), so every directive is stripped.

## Safety checks

- It only deletes a substring. No HTTP requests and no guessing at the real URL, so the same
  input always gives the same result.
- It never takes a trailing `]`, `|`, `<ref>` close or template brace.
- No template fields are added or renamed and no prose is touched.
- `verify()` runs `transform` again on the old text and requires a byte-for-byte match with
  the new text, checks the change with `checkWikitext` (old against new, never the whole page),
  and checks that no directive is left.
- The built-in render-error check runs as for every task.

## Targets

CirrusSearch `insource:/\#\:~\:text\=/`, namespace 0, 50 at a time up to the 10,000-offset
limit, with duplicates removed (offset paging repeats titles). With about 1,940 candidates no
saved list is needed; `--limit` splits the work into runs.

## Running it

```sh
npx tsx src/tasks/task-16/strip-text-fragment.test.ts        # offline tests
npx tsx src/tasks/task-16/corpus-check.replay.ts              # needs /tmp/tf_research/pages.json

npx tsx src/run.ts strip-text-fragment --limit 20                         # dry run
npx tsx src/run.ts strip-text-fragment --live --limit 10 --delay 15       # live, as MamouriBot
```

`corpus-check.replay.ts` strips every occurrence on a 200-page sample and checks that no
directive and no unbalanced brace is left. The sample is `/tmp/tf_research/pages.json`;
regenerate it as described in `research/google-text-fragment-links.md` in the parent repo if it
is not on disk.

Deployment is `toolforge/task-16-text-fragment/` (jobs `tf-check`, `tf-dry`, `tf-first`,
`tf-daily`).

```sh
ssh mamouri@login.toolforge.org 'become mamouribot toolforge jobs logs tf-daily'
ssh mamouri@login.toolforge.org 'become mamouribot toolforge jobs restart tf-daily'
```

Don't run `toolforge jobs load` on this task's `jobs.yaml`. A load syncs the whole job list and
deletes the other tasks' scheduled jobs. Use `toolforge jobs run` and `delete` per job.

To stop it, blank `کاربر:MamouriBot/ادامه`, or run `toolforge jobs delete tf-daily`. The
checkpoint is in `~/state/`.

## Code

| file | what |
|---|---|
| `src/tasks/task-16/strip-text-fragment.ts` | the task (`strip-text-fragment`): `getTargets`, `stripTextFragments`, `debrisAfter`, `verify` |
| `src/tasks/task-16/strip-text-fragment.test.ts` | offline tests |
| `src/tasks/task-16/corpus-check.replay.ts` | replay over the 200-page sample |
| `toolforge/task-16-text-fragment/` | `run.sh`, `jobs.yaml` |
| `research/google-text-fragment-links.md` in the parent repo | the research behind the task |
