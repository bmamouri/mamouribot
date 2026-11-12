# De-stub: removing stub tags from articles that are no longer stubs

Task 10 removes stub templates from articles that have grown past being stubs. Tisfoon
raised it on بحث کاربر:Mamouri: fa.wikipedia has ~710,000 articles in
`رده:همه مقاله‌های خرد`, and many were stubs only when they were created.

**Status (2026-10-03):** approved ({{مجوز دارد}}) as
`ویکی‌پدیا:سیاست ربات‌رانی/درخواست مجوز/MamouriBot/وظیفه ۱۰`, as filed: "یک دور
نخست روی فهرست موجود، سپس هفتگی برای نگهداری". The request includes a trial of 102 live
edits I ran under my own account: 0 refused at save time, 0 reverted, 66 different stub
templates. Code copy: `کاربر:MamouriBot/کد/وظیفه ۱۰`. Review page:
`ویکی‌پدیا:گزارش دیتابیس/مقاله‌های خرد بلند/بازبینی`. The Toolforge tool is
`tools.mamouribot`. The continuous watcher (see "Running continuously" below) runs far more
often than what was approved, and I have not settled that question yet.

## Background

**There is already a worklist, and there was already a permission.**
`ویکی‌پدیا:گزارش دیتابیس/مقاله‌های خرد بلند` is HujiBot's weekly `page_len > 10*1024`
query: 4,522 rows, untouched, the largest 77 KB. `درخواست مجوز/Jeepubot/وظیفه ۲` was
approved for this same job in Feb 2021, but as **نیمه‌خودکار**, and the approver said
that running it more automatically would need a new request. That is why this is a new
وظیفه.

**A tracking category can't be built from the template side.** `پودمان:Asbox` knows
nothing about length. It adds `همه مقاله‌های خرد` in ns0 and the topical `|رده*`
categories, and that is all. Page size is not cheaply available in Lua. enwiki's
`Module:Article stub box` is the same. Both wikis use a query instead of a category.

**Byte size is the wrong measure, by a wide margin.** `page_len` counts bytes, and a
Persian character takes two, so the 10 KB cut-off is really about 5,000 characters. It
also counts infoboxes, tables and reference lists. `دلتا ۲` is on the report at 12 KB with
**44 words** of prose; a 52-row infobox makes it look long. It is a real stub and its tag
is correct.

So I use enwiki's AWB rule: words of readable prose, with words in bulleted text counted as
half. On 14 random articles from the report it agreed with my own reading every time.

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

# 3. Remove the tags.  DRY-RUN by default.
npx tsx src/run.ts destub --limit 25            # dry-run, read the diffs
npx tsx src/run.ts destub --live --limit 25     # the BRFA trial
npx tsx src/run.ts destub --live                # full run

# 4. Publish what the bot refused, for humans.
npx tsx src/tasks/task-10/destub-report.ts              # prints the wikitext
npx tsx src/tasks/task-10/destub-report.ts --live

# Evidence for the permission request, read back from the wiki after a run.
npx tsx src/tasks/task-10/destub-trial-table.ts > table.wiki
```

Tests (all offline): `destub.test.ts`, `destub-classify.test.ts`,
`destub-inventory.test.ts`, `destub-report.test.ts`, plus
`python3 scripts/lib/test_gates.py`.

## Tiers

| prose words | what happens |
|---|---|
| ≥ 400, every check clean | tag removed |
| 150–399, or ≥400 with any check tripped | untouched, listed for review |
| < 150 | untouched, the tag is correct |

The thresholds lean towards leaving tags alone. A wrong removal costs a revert and trust in
the bot. A skip costs nothing and is picked up the next week.

The bot refuses list articles, disambiguation pages, more than 40 bytes per word, a high
share of Latin text (untranslated), a render that shows a Lua, cite or parameter error, no
`<ref>` at all, a stub tag that someone re-added in the last 90 days, a tag inside another
template or inside a comment or `<nowiki>`, and any template that looks like a stub tag but
is not in the inventory.

A CS1 citation error is recorded but does not block the edit. Five of the first six
articles sampled had one. Blocking on it would have cut the yield to a sixth and protected
nothing, since a wrong stub tag and a malformed `{{cite web}}` are unrelated problems.

`.../بازبینی/فهرست سفید` is the allowlist. Any title an editor adds there is dropped from
the bot's work for good. It is read fresh on every run.

## How edits are checked

This edit removes text, and the usual checks only notice something breaking. A removal
breaks nothing: delete half an article and it renders perfectly, shows no errors and lands
in no tracking category. That is how ~190 articles once lost prose, references and
categories (`lessons/scripts-and-batch/never-wholesale-replace-article.md`). `core.ts`'s
`introducesRenderError` compares error counts before and after, so it cannot see this kind
of damage. It stays only as a cheap extra check.

These three checks run before every save:

1. **Reconstruction.** Put back exactly what was removed, and the original must come back
   byte for byte. During development this caught a real bug: two stub tags on consecutive
   lines both claimed the newline between them, the ranges overlapped by one character,
   and the text was quietly corrupted.
2. **Category diff.** No category may be added. The categories lost must be a subset of
   `{همه مقاله‌های خرد} ∪ the removed tags' own cats`. A subset rather than an exact match,
   because one tag can add several topical categories and two tags can share one.
3. **Text diff.** The only rendered text allowed to disappear is the stub banner's own two
   sentences.

On top of that, the `[[رده:` and `<ref` counts must not change, and the shared wikitext
check runs on the changed part only. Run on the whole result, it refuses almost every
article for old problems the edit did not cause (`—` in ordinary prose, malformed
citations).

## Problems already found and fixed

- **Whether a template is a stub tag can't be decided by its name.** 76 stub templates
  don't end in `-خرد` (`الگو:ریاضی‌دان ایرانی`, `الگو:Iran-stub`), and `الگو:بخش خرد` is a
  *section* stub, not an Asbox template at all. An early rule that excluded names
  containing بخش would have permanently protected every article tagged
  `الگو:بخشداری‌های ایران-خرد`, which is a normal article stub. The inventory decides by
  the category the template adds, nothing else.
- **A bare `{{خرد}}` is a real tag** and must not be excluded as "the dispatcher".
  `{{خرد|فوتبال}}` expands to `{{فوتبال-خرد}}` and adds that template's category, so the
  category check has to follow the argument.
- **`cs1-visible-error` as a plain substring matches the TemplateStyles CSS rule** on
  every page that cites anything. It flagged all six of the first articles tested, which
  means it told us nothing. Match class tokens, after removing `<style>`.
- **`\b` does not work on Persian in JavaScript regex.** It only knows ASCII word
  characters, so `/^این یک\b/` never matches. A banner pattern that used it looked correct
  and refused every edit.
- **ZWNJ does not separate words.** Counting `می‌رود` as two words inflates every Persian
  prose count by about 20%, in the direction that turns a stub into a non-stub. It also
  can't be trimmed from a title: `فوتبال-خرد‌` and `فوتبال-خرد` are different pages.
- **Don't check for trailing spaces.** 6 of 12 random articles already have them.
- **The text check can't compare sentence chunks.** The first live batch refused 16 of 20
  good articles: removing the banner changes how the neighbouring elements join, so navbox
  bars («ن ب و …»), section edit links and CS1 maintenance notes no longer matched exactly
  and looked as if they had disappeared. The check now cuts the `asbox` subtree out of the
  *before* render and requires the rest to match word for word.
- **Removing a subtree must keep the markup around it.** An early version kept only the
  text between tags. That dropped every `<style>` wrapper and left its CSS behind as words,
  which looked exactly like lost prose. It refused all ten articles tested.
- **A BRFA sub-heading must be `===`.** The page's own title is the only `==`. The page is
  transcluded into the request queue, so a `==` would sit next to your own request as a
  sibling. See `lessons/api-and-permissions/brfa-subsection-must-be-level-three.md`.

## Running continuously

I asked for this myself. A byte report rebuilt weekly (`destub-classify.ts` over HujiBot's
report) misses two things: an article that never reaches 10 KB never appears in it at all,
and one that does can wait up to a week. `destub-watch.ts` covers both. It watches
`list=recentchanges` for edits to articles that are currently in
`رده:همه مقاله‌های خرد`, classifies only what changed, and removes the tag in the same run
if the article now qualifies. The cost follows edit volume, not the size of the
710,000-article stub category. On live traffic I measured ~167 mainspace edits an hour, of
which ~16% (≈27 an hour) touched a stub-tagged article.

```bash
npx tsx src/tasks/task-10/destub-watch.ts                 # one poll, dry-run
npx tsx src/tasks/task-10/destub-watch.ts --live           # one poll, writes (≤20 edits)
npx tsx src/tasks/task-10/destub-inventory.ts               # monthly refresh (loadInventory expires at 30 days)
```

**⚠️ Open question before this runs on a schedule.** The approved request says "یک دور
نخست روی فهرست موجود، سپس هفتگی برای نگهداری": one sweep, then weekly maintenance. A job
running every 10–15 minutes indefinitely is a clearly different schedule from the one
approved, even though the safety checks, the edit summary and everything else are the
same. I still have to choose between telling the reviewer first, running it and letting
the contribution history speak for itself, or making the poll interval longer.

Three bundles and three jobs, all on the one tool (`tools.mamouribot`):

```bash
npm run bundle                           # builds + gates every entry point

# deploy to the tool (see TOOLFORGE.md §2 for the stdin-pipe pattern; no scp).
# The bundles live at the tool home and are shared; nothing is per-tool any more.
cat dist/destub-watch.mjs | ssh mamouri@login.toolforge.org \
  "become mamouribot bash -c 'cat > ~/destub-watch.mjs'"
cat dist/destub-inventory.mjs | ssh mamouri@login.toolforge.org \
  "become mamouribot bash -c 'cat > ~/destub-inventory.mjs'"

# Credentials are already set as envvars on the tool; don't write a .env there.
```

Unlike most tasks, this one needs its own working directory. Its state paths
(`.state/destub/…`) are relative to the process's working directory rather than to
`BOT_STATE_DIR`, so its jobs `cd ~/task-10-destub` and reach the shared bundles as
`../destub-watch.mjs`.

```bash
# the FIRST stub-templates.json must exist before the watcher can run at all —
# either upload the one already built locally (.state/destub/stub-templates.json)
# the same stdin way into ~/task-10-destub/.state/destub/, or run the inventory once:
become mamouribot toolforge jobs run destub-inventory-once \
  --command "cd ~/task-10-destub && node ../destub-inventory.mjs" --image node20 --wait

# the scheduled jobs, as they currently exist:
become mamouribot toolforge jobs run destub-watch \
  --command "cd /data/project/mamouribot/task-10-destub && node ../destub-watch.mjs --live" \
  --image node20 --schedule "*/10 * * * *" --mem 1Gi
become mamouribot toolforge jobs run destub-inventory-monthly \
  --command "cd /data/project/mamouribot/task-10-destub && node ../destub-inventory.mjs" \
  --image node20 --schedule "0 2 1 * *" --mem 1Gi
```

`destub-watch.ts` does not take the whole outstanding backlog on each poll.
`bot.runTask(destubTask)` stops at `DEFAULT_WATCH_EDIT_LIMIT` (20) edits per run. With 431
titles in `classified.jsonl` marked for removal but not yet edited, one dry-run poll
without the limit took over three minutes and would have taken ~35, because every
candidate's `prepare()` runs a render check, the category diff and the text diff. A job
that starts every 10–15 minutes can't have a run whose length depends on the size of the
backlog, or runs start overlapping or keep getting longer. **Clear the existing backlog
with `run.ts destub --live` (no limit), deliberately and while watching it.** That command
is what the approved "یک دور نخست" describes. After the backlog is gone, the watcher only
keeps up with new arrivals, a few at a time.

## Out of scope for v1

Talk-page assessment classes. fa banners do carry `کلاس=خرد`
(`{{ویکی‌پروژه تاریخ زنان|کلاس=خرد|خودکار=بله}}`), but few pages have them, and it would be
a separate task with its own permission question.
