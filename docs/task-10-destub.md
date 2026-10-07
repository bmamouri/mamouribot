# De-stub — removing stub tags from articles that are no longer stubs

Task 10. Raised by Tisfoon on بحث کاربر:Mamouri: fa.wikipedia has ~710,000
articles in `رده:همه مقاله‌های خرد`, and many were stubs only when created.

**Status (2026-10-03):** approved ({{مجوز دارد}}) as
`ویکی‌پدیا:سیاست ربات‌رانی/درخواست مجوز/MamouriBot/وظیفه ۱۰`, as filed: "یک دور
نخست روی فهرست موجود، سپس هفتگی برای نگهداری". A self-run trial of 102 live
edits is in the request — 0 refused at save time, 0 reverted, 66 distinct stub
templates. Code copy: `کاربر:MamouriBot/کد/وظیفه ۱۰`. Review page:
`ویکی‌پدیا:گزارش دیتابیس/مقاله‌های خرد بلند/بازبینی`. Toolforge tool created:
`tools.mamouribot` — see "Running forever" below,
which is a materially different cadence from what was approved and has an open
question before it goes live.

## The three things worth knowing before touching this

**1. The worklist already exists, and so does a permission.**
`ویکی‌پدیا:گزارش دیتابیس/مقاله‌های خرد بلند` is HujiBot's weekly
`page_len > 10*1024` query — 4,522 rows, untouched, biggest entry 77 KB.
`درخواست مجوز/Jeepubot/وظیفه ۲` was approved for this exact job in Feb 2021 but
declared **نیمه‌خودکار**, and the approver said explicitly that running it more
automatically needs a fresh request. That is why this is a new وظیفه.

**2. A tracking category is impossible from the template side.**
`پودمان:Asbox` has no length awareness at all — it emits `همه مقاله‌های خرد` for
ns0 and the topical `|رده*` cats, full stop — and page size is not cheaply
available in Lua. enwiki's `Module:Article stub box` is the same. Both wikis
solved this with a query, not a category. Don't spend a day rediscovering that.

**3. Byte size is the wrong signal, and the error is not small.**
`page_len` is *bytes*; Persian costs two bytes a character, so the 10 KB cutoff
is really ~5,000 characters. And it counts infoboxes, tables and reference
lists. `دلتا ۲` sits on the report at 12 KB with **44 words** of prose — a
52-row infobox makes it look long. It is a genuine stub and its tag is correct.

So the metric is enwiki's AWB rule: words of readable prose, words in bulleted
text counted half. On 14 random articles from the report it agreed with a manual
read every time.

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

Asymmetric on purpose: a wrong removal costs a revert and bot trust, a skip
costs nothing and gets picked up next week.

Refusals: list articles, disambiguation pages, bytes-per-word > 40, high Latin
share (untranslated), a render that shows a Lua/cite/parameter error, no `<ref>`
at all, a stub tag a human re-added in the last 90 days, a tag nested inside
another template or inside a comment/`<nowiki>`, and any stub-shaped template
the inventory doesn't know.

**A CS1 citation error is recorded but does NOT block.** Five of the first six
articles sampled had one; blocking would have cut the yield to a sixth in
exchange for no protection, and a wrong stub tag and a malformed `{{cite web}}`
are unrelated problems.

`.../بازبینی/فهرست سفید` is the allowlist: any title an editor puts there is
dropped from the bot's work for good, read fresh on every run.

## Why the verification is unusual

This edit is a **deletion**, and every automated check in this repo is built to
notice something *breaking*. A deletion breaks nothing — remove half an article
and it renders perfectly, reports zero errors and sits in no tracking category.
That is exactly how ~190 articles once lost prose, refs and categories
(`lessons/scripts-and-batch/never-wholesale-replace-article.md`). `core.ts`'s
`introducesRenderError` compares error counts before and after, so it is blind
to this by construction; it is kept only as a cheap backstop.

Three proofs run before every save instead:

1. **Reconstruction** — re-insert exactly what was removed and the original must
   return byte for byte. This caught a real bug during development: two stub
   tags on consecutive lines each claimed the newline between them, the ranges
   overlapped by one character, and the result was silent corruption.
2. **Category diff** — no category may be *gained*; the categories lost must be
   a subset of `{همه مقاله‌های خرد} ∪ the removed tags' own cats`. Subset, not
   equality: one tag can emit several topical cats and two tags can share one.
3. **Text diff** — the only rendered text allowed to disappear is the stub
   banner's own two sentences.

Plus: `[[رده:` and `<ref` counts unchanged, and the shared wikitext gate — on
the **delta only**. Running the full battery against the result refuses almost
every article for pre-existing defects (`—` in ordinary prose, malformed
citations) that the edit did not cause.

## Traps already paid for

- **Membership cannot be a name pattern.** 76 stub templates don't end in
  `-خرد` (`الگو:ریاضی‌دان ایرانی`, `الگو:Iran-stub`); meanwhile `الگو:بخش خرد` is
  a *section* stub and not an Asbox member at all. An early "exclude names
  containing بخش" rule would have permanently protected every article tagged
  `الگو:بخشداری‌های ایران-خرد`, a normal article stub. The inventory decides
  membership by the category the template emits, nothing else.
- **`{{خرد}}` bare is a real tag** and must not be denylisted as "the
  dispatcher". `{{خرد|فوتبال}}` expands to `{{فوتبال-خرد}}` and so emits *that*
  template's category — the category assert has to follow the argument.
- **`cs1-visible-error` as a bare substring matches the TemplateStyles CSS rule**
  on every page that cites anything. It flagged all six of the first articles
  tested, i.e. it flagged nothing. Match class tokens, after stripping `<style>`.
- **`\b` does not work on Persian in JavaScript regex.** It is defined on ASCII
  word characters, so `/^این یک\b/` never matches. A banner pattern using it
  refused every edit while looking correct.
- **ZWNJ is not a word separator.** Counting `می‌رود` as two words inflates every
  Persian prose count ~20%, in the one direction that turns a stub into a
  non-stub. It is also not trimmable from a title: `فوتبال-خرد‌` and `فوتبال-خرد`
  are different pages.
- **Don't gate on trailing spaces.** 6 of 12 random articles already have them.
- **The text proof cannot compare sentence chunks.** The first live batch refused
  16 of 20 good articles: removing the banner changes how neighbouring elements
  join, so navbox bars («ن ب و …»), section edit links and CS1 maintenance notes
  stopped matching verbatim and read as "vanished". Excise the `asbox` subtree
  from the *before* render instead and require the rest to match word for word.
- **A subtree remover must keep the markup it isn't removing.** An early version
  kept only the text between tags, which deleted every `<style>` wrapper and left
  its CSS behind as words — indistinguishable from lost prose. It refused all ten
  articles tested.
- **Don't gate the result on the full wikitext battery.** Run it on the *delta*:
  an untouched article already trips `—`, malformed citations and more, none of it
  this edit's doing.
- **A BRFA sub-heading must be `===`.** The page's own title is the only `==`;
  the page is transcluded into the request queue, so a `==` becomes a sibling of
  your own request. See `lessons/api-and-permissions/brfa-subsection-must-be-level-three.md`.

## Running forever

Raised directly by Baqer: a byte-report regenerated weekly (`destub-classify.ts`
over HujiBot's report) misses two things — an article never crossing 10 KB of
bytes never appears in it AT ALL, and even one that does waits up to a week.
`destub-watch.ts` closes both gaps: it watches `list=recentchanges` for edits to
articles CURRENTLY in `رده:همه مقاله‌های خرد`, classifies only what changed, and
removes the tag in the same run if it now qualifies. Cost scales with edit
volume, not with the 710,000-article stub category — measured on live traffic,
~167 mainspace edits/hour, ~16% (≈27/hour) touching a stub-tagged article.

```bash
npx tsx src/tasks/task-10/destub-watch.ts                 # one poll, dry-run
npx tsx src/tasks/task-10/destub-watch.ts --live           # one poll, writes (≤20 edits)
npx tsx src/tasks/task-10/destub-inventory.ts               # monthly refresh (loadInventory expires at 30 days)
```

**⚠️ Open question before this goes on a schedule.** The approved request says
"یک دور نخست روی فهرست موجود، سپس هفتگی برای نگهداری" — a one-time sweep, then
WEEKLY maintenance. A job ticking every 10–15 minutes forever is a materially
different public cadence than what was approved, even though the safety logic,
the summary, and every check are identical. This needs a decision (tell the reviewer
first? just run it and let the contribution history speak for itself? widen the
poll interval instead?) — 
see the conversation, not just this file, for that decision once it's made.

Three bundles, three jobs, on the one tool (`tools.mamouribot`):

```bash
npm run bundle                           # builds + gates every entry point

# deploy to the ONE tool (see TOOLFORGE.md §2 for the stdin-pipe pattern — no scp).
# The bundles live at the tool home and are shared; nothing is per-tool any more.
cat dist/destub-watch.mjs | ssh mamouri@login.toolforge.org \
  "become mamouribot bash -c 'cat > ~/destub-watch.mjs'"
cat dist/destub-inventory.mjs | ssh mamouri@login.toolforge.org \
  "become mamouribot bash -c 'cat > ~/destub-inventory.mjs'"

# Credentials are already set as envvars on the tool — do NOT write a .env there.
```

This task needs its own working directory, which most do not: its state paths
(`.state/destub/…`) are relative to the process CWD rather than to `BOT_STATE_DIR`, so
its jobs `cd ~/task-10-destub` and reach the shared bundles as `../destub-watch.mjs`.

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

`destub-watch.ts` is deliberately NOT given the whole outstanding backlog on
every poll — `bot.runTask(destubTask)` caps at `DEFAULT_WATCH_EDIT_LIMIT` (20)
edits per invocation. Measured directly: with 431 titles sitting in
`classified.jsonl` as auto-remove-but-not-yet-edited, one uncapped dry-run poll
took over three minutes and would have taken ~35 unbounded, because every
candidate's `prepare()` runs a render-guard plus the category-diff plus the
text-diff proof. A job meant to tick every 10–15 minutes forever cannot have a
single poll whose duration depends on the SIZE OF THE BACKLOG — that turns
"continuous" into overlapping or ever-lengthening runs. **Drain the existing
backlog with `run.ts destub --live` (no limit) as a deliberate, supervised act**
— that command already exists and is what the approved "یک دور نخست" describes;
the watcher's job is only to keep up with new arrivals promptly, a few at a
time, forever, after that backlog is gone.

## Out of scope for v1

Talk-page assessment classes. fa banners do carry `کلاس=خرد`
(`{{ویکی‌پروژه تاریخ زنان|کلاس=خرد|خودکار=بله}}`), but coverage is sparse and it
is a separate task with its own permission question.
