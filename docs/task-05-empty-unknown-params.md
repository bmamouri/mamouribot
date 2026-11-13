# وظیفهٔ ۵: empty, unknown citation parameters

Removes a parameter from a `{{یادکرد …}}`/`{{cite …}}` call when it is BOTH empty and
explicitly flagged unknown by the citation module (رده:خطاهای CS1: پارامترهای نامعلوم
خالی, «یادکرد پارامتر ناشناختهٔ خالی دارد»). A parameter that holds a value is never
touched, whatever its name.

## Status

- **Approved**, ۱۵ سپتامبر ۲۰۲۶. Request page:
  `ویکی‌پدیا:سیاست ربات‌رانی/درخواست مجوز/MamouriBot/وظیفه ۵`.
- Runs as MamouriBot, job `empty-params`, daily at 03:05 UTC (`5 3 * * *`), at most 200
  edits per run with `--delay 15`.
- Originally shipped as a standalone Python script (`empty-unknown-params.py`, run from
  `~/bot/` on Toolforge with its own `.env`). Ported into this TypeScript framework per
  `TODO.md` §8, so every task shares one codebase, one credential path, and one bundle.
  The port is a faithful translation: same regexes, same safety gates, same 27 unit
  tests, carried over unchanged.

## What it changes

- A citation parameter that is empty AND appears in the error span's `|key=` list for
  that citation is removed. Everything else in the template — name, other params,
  whitespace — is untouched.
- An empty bare positional argument (`||`) is removed only when the article's own error
  span flags a positional index.
- A stray `|=` (empty parameter NAME) is removed only when the module's
  `(empty string)` placeholder is in the flagged set.

Edit summary: `حذف پارامترهای خالی ناشناخته از یادکردها (رفع خطای «پارامتر ناشناختهٔ
خالی»)`.

## Safety

- Detection is read directly off the rendered error span
  (`<span class="cs1-visible-error…">یادکرد پارامتر ناشناختهٔ خالی دارد…`), never
  guessed from a name list — a parameter the module has not flagged is never removed,
  however empty it looks.
- `verify()` renders the article's citations before and after the proposed edit and
  refuses the save unless (a) every `<cite>`'s CONTENT — everything except the cs1 error
  spans themselves — is byte-identical, and (b) the flagged-parameter count actually
  went down. A citation whose visible text merely shifted is treated the same as one that
  gained an error: refused.
- Citations transcluded from another template are not touched — only citations that
  appear directly in the article's own wikitext (`findCiteTemplates` walks the raw text,
  not the rendered page).

## Targets

`getTargets()` reads `رده:خطاهای CS1: پارامترهای نامعلوم خالی` across namespaces
`0|4|10|118` (article, project, template, draft; User is intentionally excluded — editing
another editor's sandbox is intrusive), skipping `/تمرین` and `/آزمایشی` subpages. For
each candidate it renders just the article's own citation templates (cheap: the error is
self-contained per citation, so this never pays for a full-article server-side parse),
detects the flagged parameters, and keeps the title only if something would actually be
removed. `recheckAfterDays: 30` lets a page that was fixed and later reverted — or a newly
created page with the same old parameter — come back into scope, same shape as وظیفهٔ ۴.

## Running it

```sh
npx tsx src/tasks/task-05/empty-unknown-params.test.ts   # offline tests
npx tsx src/run.ts empty-unknown-params --limit 50       # dry run
```

Deployment is `toolforge/task-05-empty-unknown-params/` (jobs `ep-check`, `ep-dry`,
`ep-first`, `empty-params`).

```bash
ssh mamouri@login.toolforge.org 'become mamouribot toolforge jobs logs empty-params'
```

Don't run `toolforge jobs load` on this task's `jobs.yaml`. A load syncs the whole job
list and deletes every other task's scheduled jobs. Use `toolforge jobs run` and `delete`
per job.

To stop it, change `کاربر:MamouriBot/ادامه` to anything other than `بله`, or run
`toolforge jobs delete empty-params`. The checkpoint is
`~/state/empty-unknown-params.json`, so a restart carries on where it stopped.

## Code

| file | what |
|---|---|
| `src/tasks/task-05/empty-unknown-params.ts` | the task: detection, `stripTemplate()`, `verify()`, targets |
| `src/tasks/task-05/empty-unknown-params.test.ts` | offline tests, ported from the original Python suite |
| `toolforge/task-05-empty-unknown-params/` | `run.sh`, `jobs.yaml` |
