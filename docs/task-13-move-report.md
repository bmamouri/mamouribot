# وظیفهٔ ۱۳: database reports

This task publishes every database report MamouriBot writes under
`ویکی‌پدیا:گزارش دیتابیس/`. The first was the list of titles whose spelling or punctuation
does not match fa.wikipedia convention; the others list portals, users, moves and missing
articles. The task only proposes. It writes report pages and never edits an article.

## Status

- **No permission needed.** Huji declined the request as unnecessary on ۹ اکتبر ۲۰۲۶: a bot
  that updates a report page once a day needs neither permission nor the bot flag.
- **Unflagged on purpose.** Every report runs as MamouriBot with `flagEdits: false`, so the
  edits show up in recent changes and on watchlists, where someone who disagrees with a
  report will see them. `bot=1` is sent per edit, so this needs no change to the account and
  no personal credentials on Toolforge.
- Runs on Toolforge, tool `mamouribot`, on the schedules below.

## The reports

All pages are under `ویکی‌پدیا:گزارش دیتابیس/`.

| report | page | job | schedule (UTC) |
|---|---|---|---|
| `move` | the five «… نیازمند تغییرنام» pages | `mr-daily` | daily 03:17 |
| `portals` | `پربازدیدترین درگاه‌ها`, `درگاه‌های انگلیسی برای ترجمه` | `pr-daily` | daily 04:40 |
| `featured` | `کاربران بر پایه تعداد محتوای برگزیده` | `fc-weekly` | Mondays 04:50 |
| `prefs` | `ترجیحات کاربران` | `up-weekly` | Mondays 04:55 |
| `neighbors` | the four «مقالاتی که در ویکی‌… هست و در ویکی‌فا نیست» pages | `nb-daily` | daily 05:10 |
| `usermoves` | `تغییرنام‌های کاربران تأییدشده خودکار`, `تغییرنام‌های کاربران تأییدشده پایدار بدون گشت خودکار` | `moves-daily` | daily 05:30 |
| `iranica` | `مقاله‌هایی که با دانشنامه ایرانیکا می‌شود گسترش داد` | `ir-weekly` | Wednesdays 06:20 |

Each report also writes a `/امضا` subpage with a signature, which `{{گزارش دیتابیس}}`
transcludes on وپ:گد as «آخرین به‌روزرسانی».

### مقاله‌های نیازمند تغییرنام, and four siblings

Titles that should be renamed, with the proposed title. One rules engine writes five pages,
one per namespace (`TARGETS` in `move-report.ts`):

| `--ns` | namespace | page |
|---|---|---|
| `article` | 0 | `مقاله‌های نیازمند تغییرنام` |
| `category` | 14 | `رده‌های نیازمند تغییرنام` |
| `template` | 10 | `الگوهای نیازمند تغییرنام` |
| `project` | 4 | `صفحه‌های ویکی‌پدیای نیازمند تغییرنام` |
| `help` | 12 | `راهنماهای نیازمند تغییرنام` |

Titles come from the `fawiki_p` replica in one query; the rules run in TypeScript.
`replica.ts` has no WHERE clause on purpose, so there is one copy of each rule.

Every rule is either a character-class substitution that needs no knowledge of the word, or
an exact phrase or word list. There is no guessed ZWNJ insertion, no dictionary, no spacing
rule for initials and no ezafe removal. Editors act on this page without checking again, so
each rule has to say exactly what it covers.

| rule | example |
|---|---|
| `arabic-letters` | `ي`, `ى`, `ك` → `ی`, `ک` |
| `harakat` | strip vowel marks, but not tanwin («کاملاً») |
| `ellipsis` | `...` → `…` |
| `space-before-comma`, `space-after-comma` | no space before `،`, one after it between Persian words |
| `space-before-paren` | a space before a disambiguating bracket |
| `latin-year` | a Latin year after «سال», «زاده» or «متولد» |
| `latin-comma` | a Latin comma in a disambiguator: «(بازیکن فوتبال, زاده ۱۹۹۲)» |
| `alef-words` | «فرآیند» → «فرایند» |
| `zwnj-compounds` | بین المللی, نرم افزار, سخت افزار, سیستم عامل |
| `zwnj-plural` | «آزمون های» → «آزمون‌های»; «های»/«هایی» may not end a title |
| `zwnj-nisba` | «ای» only after a word ending in «ه»: «خامنه ای» → «خامنه‌ای» |
| `zwnj-verb` | «می» + a conjugated verb; a bare present stem is never a verb |
| `zwnj-honorific` | «زینت السادات» → «زینت‌السادات»; first element from a list |

The ZWNJ word lists come from the ابرابزار gadget; `zwnj-lists.ts` names its three pages.
After «ا آ د ذ ر ز ژ و» the space is deleted, not replaced by a ZWNJ
(«استاندارد های» → «استانداردهای»), because AbuseFilter 27 refuses a title with an
unnecessary ZWNJ (`lessons/api-and-permissions/zwnj-acronym-title-abusefilter-27.md`).

What it leaves alone:

- Latin digits in general. Almost every such title is an identifier: «افلاتوکسین B1»,
  «نوکیا X2-02».
- A Latin comma with a Latin letter beside it, as in chemical names: «N,N-…», «(II, III)».
- Tight brackets in polymer names («پلی(متیل متاکریلات)») and plural brackets («آدم‌کش(ها)»).
- A bracket preceded by anything but a letter, a digit or a closing bracket, since adding a
  space would still leave a wrong title.
- Thousands separators: «۱،۵۰۰».
- Suffixes that are mostly transliterated foreign words: «اند», «ام», «تر»/«ترین», «اش»,
  «بی», and «ای» after anything but «ه».
- Subpages in namespace 4 (`topLevelOnly`). Their titles are archives, closed discussions
  and transclusion keys.
- A proposal that the same rules would change again. Each one must be stable.
- A target that is already an article: that is a merge question. A redirect target is listed
  and labelled.

Editors overrule a row by adding it to `/فهرست سفید` under each report page. That is also
where true exceptions like «۴۰۱(کی)» (401(k)) belong. Each section of the published page has
a one-line explanation, so a disagreement can be about one rule.

### پربازدیدترین درگاه‌ها and درگاه‌های انگلیسی برای ترجمه

fa portals ranked by pageviews, and en portals with no fa counterpart, ranked by traffic, as
translation candidates. Structure comes from the `fawiki_p` and `enwiki_p` replicas
(`FA_PORTALS_SQL`, `EN_PORTALS_SQL`) and traffic from the AQS pageviews API. The pageview
window is whole months, so the counts change when the month does.

- Popularity is pageviews, not inbound links.
- A candidate is dropped if fa already has `درگاه:<name>`, redirects included, found through
  the topic article's fa langlink. A missing interwiki alone is not enough.
- `EXCLUDED_EN_PORTALS` leaves out «Erotica and pornography» and «Nudity» by exact title.
  Never by substring: «sex» is inside East Sussex.
- `--only popular|candidates` runs one of the two.

### کاربران بر پایه تعداد محتوای برگزیده

Users ranked by the featured articles, good articles and featured lists they brought through
review. The database cannot say whose work an article was, so the source is the three
hand-maintained گزیدن pages. Only ★ counts; ☆ is content demoted at review. A user's entries
run from their line to the next user's line, not to the next `|-`, because the good-article
page wraps every twenty entries. The run refuses to publish under 50 users.

### ترجیحات کاربران

Counts from `user_properties` on the replica, split by how active the users are. Only four
properties are exposed there (`gender`, `nickname`, `fancysig`, `disablemail`), so there is
no section for time zone, skin or language, and the selftest keeps it that way. A row exists
only when a user changed the default, so every count means "users who changed this". The
«جنسیت» section transcludes `/جنسیت`, which another operator's bot maintains.

### مقالاتی که در ویکی‌… هست و در ویکی‌فا نیست

Four pages: عربی (ar), کردی (ckb), مازندرانی (mzn), and خاورمیانه (ar, tr and he merged).
Each lists articles on the source wiki with no fa article, sorted by how many Wikimedia sites
link to the Wikidata item (`wb_items_per_site` on `wikidatawiki_p`), highest first.
`--only ar|ckb|mzn|mideast` runs one.

- Only real articles ship. A SQL prefilter drops titles with a colon; then the source wiki's
  `page` table must show namespace 0 and not a redirect.
- A candidate is dropped if its enwiki sitelink, followed through any en redirects, already
  has an fa langlink (`resolveRedirectChain()`). The fa article is often on a different
  Wikidata item.
- The خاورمیانه page runs three single-site queries and merges them in `mergeCandidates()`,
  keeping the larger sitelink count. One combined query times out.
- An en title containing a Perso-Arabic letter is left blank, because the publish check
  rightly refuses `[[:en:ب]]`.

### تغییرنام‌های کاربران تأییدشده خودکار, and … پایدار بدون گشت خودکار

Two lists for reviewing page moves into or out of ns 0, over four whole calendar months plus
the current one:

- **تأییدشده خودکار**: the mover had nothing beyond (auto)confirmed at the time of the move.
- **تأییدشده پایدار بدون گشت خودکار**: the mover was extendedconfirmed at the time but held no
  group with the `autopatrol` right. The main page has monthly totals and a per-user table;
  each month's rows go on a subpage such as `/۲۰۲۶-۱۰`. Subpages are written first and get no
  `/امضا`.

The two never overlap. `collectMoves()` reads the moves once and both reports filter them;
`--report acmoves` or `ecmoves` runs one alone.

- Groups are those held at the time of the move, replayed from the `rights` and
  `autopromote` logs, including expiry. `log_params` is parsed with a real PHP unserializer.
  A group held today with no log entry is assumed always held. Groups that no longer exist
  are dropped using `siprop=usergroups`.
- Which groups carry `autopatrol` is read at run time. The run stops if `autopatrolled` ever
  loses it.
- Global groups come from `centralauth_p` as of today. Bots are excluded.
- Edit summaries are quoted as written; `safeComment()` disarms templates, categories,
  files, signatures, tags and cell pipes. The publish check runs with summaries blanked.
- The run refuses to publish under 20 rows (autoconfirmed) or 100 rows (extendedconfirmed).

### مقاله‌هایی که با دانشنامه ایرانیکا می‌شود گسترش داد

Every Encyclopædia Iranica Online entry compared with fa and en: fa articles that are short
where Iranica is long, and Iranica subjects with no fa article. The main page has a summary
and two previews; six subpages hold the tables (`/خرد`, `/آغازین`, `/بلندتر`,
`/ساخت با مقاله انگلیسی`, `/ساخت مقاله تازه`, `/بررسی‌نشده`). Subpages are written first.
It is not part of `--report all`.

- The entry list comes from iranicaonline.org's sitemaps. If the site answers with its
  Cloudflare challenge (recognised by the body, not the status), `IranicaClient` reads the
  Wayback copy (`WAYBACK`) instead, un-gzipping it when needed. Fewer than `MIN_ENTRIES`
  (8000) stops the run.
- Matches between entries and articles are fixed in `data/iranica-match.json`, because the
  wrong ones were removed by reading them. A run only adds matches from Wikidata P3021 and en
  langlinks, and drops a matched fa title that no longer exists.
- fa grades are live, from words of prose, not bytes: خرد (stub category or under 300 words),
  آغازین (under 1,000), متوسط (under 2,500), کامل‌تر; خوب and برگزیده from their categories.
- Entry length is measured slowly to respect `Crawl-Delay: 20`: at most `PAGES_PER_RUN`
  (150) entries per run, about 50 minutes, cached in `$BOT_STATE_DIR/iranica-entries.json`.
  An unmeasured entry shows «ـ». `--pages N` and `--no-fetch` change this for one run.

## Running it

```sh
npx tsx src/tasks/task-13/reports-cli.ts --selftest                  # every report, no network
npx tsx src/tasks/task-13/move-report.test.ts                        # move-report unit tests
npx tsx src/tasks/task-13/reports-cli.ts --report move --ns article  # dry run, prints the wikitext
npx tsx src/tasks/task-13/reports-cli.ts --report move --live --refresh
npx tsx src/tasks/task-13/reports-cli.ts --report all                # everything except iranica
```

`--report` takes `move`, `portals`, `featured`, `prefs`, `neighbors`, `acmoves`, `ecmoves`,
`usermoves`, `iranica` or `all`; the default is `move` in all five namespaces. Nothing is
written without `--live`. `--refresh` rebuilds the cached title list.

Every page goes through the publish check (`gates.py`) before it is saved. A run that finds
too few rows stops instead of overwriting a live page with a short list, because a broken
parser or query returns a short list, not an error.

## Deployment

`npm run bundle` builds `toolforge/task-13-reports.mjs` from `reports-cli.ts` and runs its
selftest. Deployment is `toolforge/task-13-move-report/` (`run.sh`, `jobs.yaml`), with
`mr-selftest` and `mr-dry` as one-off jobs beside the scheduled ones. Logs are in
`logs/` there; state is `~/state` (`BOT_STATE_DIR`).

`toolforge jobs load` deletes scheduled jobs missing from the file it is given. Keep every
job in `jobs.yaml`, and when other tasks' jobs are live in the tool, change one job with
`toolforge jobs delete X && toolforge jobs run X …` rather than a load. To stop a report,
delete its job.

## Open

- «وضعیت به‌روزرسانی» on وپ:گد is a hand-written cell on the line after each
  `{{گزارش دیتابیس}}` row, not a parameter. The bot does not touch وپ:گد, so both lines have
  to be updated by hand when a report starts or stops
  (`scripts/archive/db-index-rename-report-runners.py` in the parent repo does both).

## Code

| file | what |
|---|---|
| `src/tasks/task-13/reports-cli.ts` | the one entry; `--report`, `--ns`, `--selftest` |
| `src/tasks/task-13/move-report.ts` | the rename rules, `TARGETS`, whitelist, publish |
| `src/tasks/task-13/zwnj-lists.ts` | ZWNJ word lists from ابرابزار |
| `src/tasks/task-13/move-report.test.ts` | unit tests, mostly cases that must give no proposal |
| `src/tasks/task-13/portal-reports.ts`, `portal-reports-run.ts` | the two درگاه reports |
| `src/tasks/task-13/featured-report.ts`, `-run.ts` | featured-content ranking |
| `src/tasks/task-13/prefs-report.ts`, `-run.ts` | user preferences |
| `src/tasks/task-13/neighbor-wikis-report.ts`, `-run.ts` | the four neighbour-wiki reports |
| `src/tasks/task-13/ac-moves-report.ts`, `-run.ts` | autoconfirmed moves; `collectMoves()`, the rights-log replay |
| `src/tasks/task-13/ec-moves-report.ts`, `-run.ts` | extendedconfirmed moves without autopatrol |
| `src/tasks/task-13/iranica-report.ts`, `-run.ts`, `data/iranica-match.json` | the Iranica report |
| `src/tasks/task-13/*.selftest.ts` | each report's offline selftest |
| `src/lib/replica.ts` | replica queries: `articleTitles()`, `queryRows()` |
| `toolforge/task-13-move-report/` | `run.sh`, `jobs.yaml` |
