# De-stub: removing stub tags from articles that are no longer stubs

Task 10 removes stub templates from articles that have grown past being stubs. fa.wikipedia
has about 710,000 articles in `رده:همه مقاله‌های خرد`, and many were stubs only when they
were created. The bot removes the tag only when the article clearly has enough prose, and
lists the borderline cases for people to decide.

## Status

- **Approved** as `ویکی‌پدیا:سیاست ربات‌رانی/درخواست مجوز/MamouriBot/وظیفه ۱۰`, as filed:
  «یک دور نخست روی فهرست موجود، سپس هفتگی برای نگهداری». Code copy for reviewers:
  `کاربر:MamouriBot/کد/وظیفه ۱۰`.
- Runs as MamouriBot on `tools.mamouribot`:
  - `destub-watch`, every 10 minutes (`*/10 * * * *`), at most 20 edits per poll;
  - `destub-inventory-monthly`, `0 2 1 * *`, refreshes the list of stub templates.
- Review page: `ویکی‌پدیا:گزارش دیتابیس/مقاله‌های خرد بلند/بازبینی`.

## How it measures

Page size is the wrong measure. `page_len` counts bytes (a Persian character takes two) and
includes infoboxes, tables and reference lists, so `دلتا ۲` is 12 KB with 44 words of prose
and is a real stub. I use enwiki's AWB rule instead: words of readable prose, with words in
bulleted text counted as half. ZWNJ does not separate words (`می‌رود` is one word).

| prose words | what happens |
|---|---|
| ≥ 400, every check clean | tag removed |
| 150–399, or ≥ 400 with any check tripped | untouched, listed for review |
| < 150 | untouched, the tag is correct |

The thresholds lean towards leaving tags alone. A wrong removal costs a revert; a skip costs
nothing.

The bot refuses:

- list articles and disambiguation pages;
- more than 40 bytes per word, or a high share of Latin text (untranslated);
- a render that shows a Lua, cite or parameter error;
- an article with no `<ref>` at all;
- a stub tag that someone added in the last 90 days;
- a tag inside another template, a comment or `<nowiki>`;
- any template that looks like a stub tag but is not in the inventory.

A CS1 citation error is recorded but does not block the edit. It is unrelated to whether the
stub tag is right.

Any title an editor adds to `ویکی‌پدیا:گزارش دیتابیس/مقاله‌های خرد بلند/بازبینی/فهرست سفید`
is dropped from the bot's work for good. The page is read fresh on every run.

## Which templates are stub tags

The inventory decides by the category a template adds, not by its name. Many stub templates
don't end in `-خرد` (`الگو:ریاضی‌دان ایرانی`, `الگو:Iran-stub`), and `الگو:بخش خرد` is a
section stub, not an Asbox template. A bare `{{خرد}}` is a real tag: `{{خرد|فوتبال}}` expands
to `{{فوتبال-خرد}}`, so the category check follows the argument.

## How edits are checked

This edit removes text, and a removal renders without errors even when it deletes too much
(`lessons/scripts-and-batch/never-wholesale-replace-article.md`). So these checks run before
every save:

1. **Reconstruction.** Putting back exactly what was removed must give the original byte for
   byte.
2. **Category diff.** No category may be added. The categories lost must be a subset of
   `{همه مقاله‌های خرد} ∪ the removed tags' own cats`.
3. **Text diff.** The `asbox` subtree is cut out of the before render, and the rest must match
   the after render word for word. The only text allowed to disappear is the stub banner.

The `[[رده:` and `<ref` counts must not change, and the shared wikitext check runs on the
changed part only. `core.ts`'s `introducesRenderError` also runs, as an extra check.

Edit summary: `حذف برچسب خرد از مقاله‌ای که دیگر خرد نیست`.

## Running it

```bash
# 1. Which templates are stub tags?  ~2,600 validation parses, ~1h, cached 30 days.
npx tsx src/tasks/task-10/destub-inventory.ts
#    -> .state/destub/stub-templates.json

# 2. Which articles are no longer stubs?  One render each; resumable.
npx tsx src/tasks/task-10/destub-classify.ts            # whole worklist
npx tsx src/tasks/task-10/destub-classify.ts --limit 50
npx tsx src/tasks/task-10/destub-classify.ts --title 'دلتا ۲'
#    -> .state/destub/classified.jsonl

# 3. Remove the tags.  Dry run by default.
npx tsx src/run.ts destub --limit 25
npx tsx src/run.ts destub --live

# 4. Publish what the bot refused, for people to review.
npx tsx src/tasks/task-10/destub-report.ts              # prints the wikitext
npx tsx src/tasks/task-10/destub-report.ts --live

# The watcher: one poll.
npx tsx src/tasks/task-10/destub-watch.ts               # dry run
npx tsx src/tasks/task-10/destub-watch.ts --live        # writes (≤20 edits)
```

The worklist for step 2 is HujiBot's weekly report
`ویکی‌پدیا:گزارش دیتابیس/مقاله‌های خرد بلند` (`page_len > 10*1024`).

`destub-watch.ts` follows `list=recentchanges` for edits to articles in
`رده:همه مقاله‌های خرد`, classifies only what changed, and removes the tag in the same run if
the article now qualifies. It also catches articles that never reach 10 KB. It stops at
`DEFAULT_WATCH_EDIT_LIMIT` (20) edits per poll, so a poll's length does not depend on the
backlog. Clear any backlog in `classified.jsonl` with `run.ts destub --live` (no limit), while
watching it.

The task sets `recheckAfterDays: 30`.

Tests (all offline): `destub.test.ts`, `destub-classify.test.ts`,
`destub-inventory-lib.test.ts`, `destub-report.test.ts`, `destub-watch.test.ts`, plus
`python3 scripts/lib/test_gates.py`.

## Deployment

Unlike the other tasks, this one has its own bundles and working directory. Its state paths
(`.state/destub/…`) are relative to the working directory, not `BOT_STATE_DIR`, so its jobs
`cd ~/task-10-destub` and run the shared bundles as `../destub-watch.mjs`.

```bash
npm run bundle                           # builds and checks every entry point

# upload by stdin (see TOOLFORGE.md; no scp)
cat dist/destub-watch.mjs | ssh mamouri@login.toolforge.org \
  "become mamouribot bash -c 'cat > ~/destub-watch.mjs'"
cat dist/destub-inventory.mjs | ssh mamouri@login.toolforge.org \
  "become mamouribot bash -c 'cat > ~/destub-inventory.mjs'"
```

Credentials are set as envvars on the tool; don't write a `.env` there.

The watcher needs `stub-templates.json` before it can run. Either upload the local
`.state/destub/stub-templates.json` the same way into `~/task-10-destub/.state/destub/`, or
run the inventory once:

```bash
become mamouribot toolforge jobs run destub-inventory-once \
  --command "cd ~/task-10-destub && node ../destub-inventory.mjs" --image node20 --wait

become mamouribot toolforge jobs run destub-watch \
  --command "cd /data/project/mamouribot/task-10-destub && node ../destub-watch.mjs --live" \
  --image node20 --schedule "*/10 * * * *" --mem 1Gi
become mamouribot toolforge jobs run destub-inventory-monthly \
  --command "cd /data/project/mamouribot/task-10-destub && node ../destub-inventory.mjs" \
  --image node20 --schedule "0 2 1 * *" --mem 1Gi
```

To stop it, blank `کاربر:MamouriBot/ادامه`, or run `toolforge jobs delete destub-watch`.
State is in `~/task-10-destub/.state/destub/` (`stub-templates.json`, `classified.jsonl`,
`watch-checkpoint.json`).

## Open

- The approval says one sweep, then weekly maintenance. `destub-watch` polls every 10
  minutes, which is a different schedule from the one approved. I have not yet decided
  whether to tell the reviewer, lengthen the interval, or leave it.
- Talk-page assessment classes (`کلاس=خرد` in project banners) are out of scope. They would
  be a separate task with its own permission.

## Code

| file | what |
|---|---|
| `src/tasks/task-10/destub.ts` | the task (`destub`): targets, removal, the three checks |
| `src/tasks/task-10/destub-classify.ts` | prose word count and tiers (`AUTO_REMOVE_WORDS`, `LEAVE_ALONE_WORDS`, `MAX_BYTES_PER_WORD`) |
| `src/tasks/task-10/destub-inventory.ts`, `destub-inventory-lib.ts` | which templates are stub tags |
| `src/tasks/task-10/destub-watch.ts`, `destub-watch-lib.ts` | the recent-changes watcher |
| `src/tasks/task-10/destub-report.ts` | the review page and the allowlist |
| `src/tasks/task-10/destub-trial-table.ts` | builds an edit table from a run, for the request page |
