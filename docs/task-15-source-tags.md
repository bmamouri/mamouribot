# وظیفهٔ ۱۵: source maintenance banners (add, and remove when stale)

This task puts `{{بدون منبع}}` and a few related banners on articles that have no sources,
and takes `{{بدون منبع}}` off articles that are now properly cited. It only acts when it is
sure. Everything doubtful goes on a report page for a person to look at.

## Where it stands

Huji granted
[{{مجوز دارد}}](https://fa.wikipedia.org/wiki/ویکی‌پدیا:سیاست_ربات‌رانی/درخواست_مجوز/MamouriBot/وظیفه_۱۵)
on ۱۲ اکتبر ۲۰۲۶, after a 116-edit trial under my own account (§13). Since ۱۳ اکتبر ۲۰۲۶ it
runs as **MamouriBot**, not `--as-me`. The deployment is `toolforge/task-15-source-tags/`
and the schedule is the `st-daily` job.

The request commits to **روزانه با سقف ۲۰۰ ویرایش**. Don't raise the limit in `jobs.yaml`
without amending the request first.

Every banner carries `تاریخ=`. The run creates the month's cleanup category when it is
missing (`ensureMonthlyCategories`, §5). Without that page the article would land in
`رده:مقاله‌های دارای پارامتر تاریخ نادرست در الگو`.

One question is still open. 19 of the 196 edits on the first day were «N (عدد)» number
articles. They are genuinely unsourced and in scope, but the candidate search finds them
together, so they arrive in clumps, and nineteen tagged in one day may look like spray.
Whether to exclude or throttle them is my call to make; it is not a defect.

| | |
|---|---|
| Code | `src/tasks/task-15/`: `source-detect.ts` (the §3.0 detector), `banners.ts` (placement and removal), `decide.ts` (the §3 rules), `source-tags.ts` (the `BotTask`), plus `source-detect.test.ts`, `source-tags.test.ts` and `source-detect.replay.ts` |
| Task id | `source-tags` |
| Task number | **۱۵** |
| Measurements | `docs/data/task-15/random-2000.json`, `strict-unsourced-rendered.json`, `template-survey.json` |
| Measurement scripts | `archive/task-15-research/` is git-ignored and only exists on my machine. §12 records their logic, so nothing depends on them. |
| Measured on | ۱۰ اکتبر ۲۰۲۶ (2026-10-10). ns0 has 1,096,839 articles. |

§0 has my decisions and the code layout, §1–§2 the research behind them, §3–§6 the rules
as they are now, §11 how edits are checked, §12 how the source detector works, and §13 the
trial log.

## History

### The trial

I ran the trial under my own account on ۱۲ اکتبر ۲۰۲۶ in three runs (§13). Two kinds of
mistake turned up and both were fixed: a removal on «مولکول», whose only reference was
`{{یادکرد فرهنگستان}}`, and 17 Hijri day pages that were tagged. I reverted all of them
and Huji approved the task the same day.

### First day as MamouriBot, ۱۳ اکتبر ۲۰۲۶

The bot made 21 + 60 + 119 = 200 edits (the daily cap), and then `st-daily` took over at
03:05 UTC. I re-derived each of the first 81 edits from the live pages with
`scripts/archive/task15-audit-live-edits.py` in the parent repo: 81 of 81 were clean, and
the shortest gap between edits was 18 s. The audit and the day's runs turned up these
defects, all fixed:

| found | why it mattered |
|---|---|
| the same title twice in one run | offset paging over a live search index repeats titles. The cached decision still said «add», so the page got a second banner. No error, right category, and it passed `verify` |
| «جنگ کره» refused | `verify` failed any new render with `class="error"` in it. That article has six cite errors of its own, so every long article with a broken citation was out of reach and our edit took the blame |
| three removals refused | the tag appears twice (or next to {{بخش بدون منبع}}). Removing one leaves the page in the category, and the published reason named the symptom |
| «عدسی (خوراکی)» refused | the article has `[[رده:مقاله‌های بدون منبع]]` written at its foot, so taking the banner out leaves it in the category. Removing a hand-placed category is a different edit and not in scope, so it is reported |
| two removals blocked by the gate | `removeStaleTag` took the tag and one newline. That is right mid-page, but with `{{tag}}` and a blank line at the top it leaves a page that starts with a blank line: invisible in the render, visible in every diff |
| «خرداد ۱۳۸۷» tagged | `DATE_PAGE` required a day number before the month, so a month-and-year page did not count as a date page. Reverted with `scripts/archive/task15-revert-month-year-date-tag.py` |

### The removal bar, ۱۳ اکتبر ۲۰۲۶: 17 edits reverted

Later the same day I looked at «هدهد» and rejected the removal. It has 564 words of prose,
seven bullets under «منابع» (one of them is "Wikipedia contributors, Hoopoe") and exactly
one inline footnote, yet the banner came off with «مقاله اکنون منبع دارد». The rule then
was "at least one real source", and it counted the bibliography bullets as that source.
§3.9 describes the rule that replaced it.

I re-measured every removal ever made, 38 as MamouriBot and 21 in the trial. **26 failed
the new bar**, so 44% of the removals had been wrong. Five had already been re-tagged by
someone: «مولکول» was self-reverted on ۱۲ اکتبر, and «جورقان», «زویار», «جانویسلو» and
«وسترن» had picked up {{مدرک}} or {{بهبود منبع}}. That left 21 live. I restored 17 with
`scripts/archive/task15-restore-undercited-banners.py`. It puts the original banner call
back where it was, so «تمام‌نگاری» returned to `رده:مقاله‌های بدون منبع از دسامبر ۲۰۱۹`
rather than this month's, and it leaves a page alone if anyone has re-tagged it or if the
text around the banner is gone. The other 4 are stubs of 22–84 words with one citation
each. Calling them «بدون منبع» would be false, so I left them as they are.

The fix nearly switched the removals off without anyone noticing. The cheap screen that
runs before rendering decided whether a refusal depended on the render by looking for
«نمایش» in the Persian reason. The new density refusal depends on the render but is worded
differently, so the screen would have rejected every removal candidate before rendering
it, and the run would have reported nothing to remove anywhere on the wiki, with no error
and a clean log. `Decision` now has an explicit `needsRender` flag instead. Afterwards a
60-page dry run through the real `run.sh` still produced 4 removals («راحت‌الحلقوم»,
«شهرستان سمیرم», «سوگواری محرم», «لوله»), each re-measured separately at 26–164 words
per citation. If a daily log ever shows zero removals, check this first.

## 0. Decisions and how it is built

### 0.1 The request

I wanted a bot that adds these banners at the top of fa articles, only when it is
confident: بدون منبع, بهبود منبع, بخش بدون منبع, بدون منبع زنده, منبع زنده, یک منبع,
اصلاح ترجمه, گسترش از زبان. The constraints:
- Follow each template's own documented criteria.
- `{{یادکرد-ویکی}}` is not a source.
- Giving up when in doubt is fine. The result must not look like spam.

### 0.2 Decisions (۱۰ اکتبر ۲۰۲۶)

These are my answers to the questions the research raised.

| # | Question | Decision |
|---|---|---|
| 1 | Task number | **۱۵** |
| 2 | بدون منبع زنده | Use it in its real sense (a BLP with no sources). It is **optional**: «we don't need to do it if it is too much work or we are not confident about it». |
| 3 | Scope / phases | **No phases.** «Let's do everything at once. We test and we update regularly.» Every tag the plan allows to be placed ships in one task (§3). |
| 4 | 371 BLPs already tagged with plain بدون منبع | **Leave them alone.** No swap to بدون منبع زنده. |
| 5 | Iranian آبادی articles | **Exclude.** Skip any page carrying `{{جعبه اطلاعات روستای ایران}}` (55,680 pages). |
| 6 | گسترش از زبان | **Dropped.** Not in this task. |
| 7 | Date parameter | Write the date only if the monthly category exists, otherwise no date, and never create the categories. **Later changed:** the bot now creates the missing monthly category (§5). |
| 8 | Consensus / BRFA | No قهوه‌خانه thread and no BRFA at first. Build it, run it under my own account (`--as-me`) for a while, fix bugs, then decide. **Later:** the request was filed and approved on ۱۲ اکتبر ۲۰۲۶. |
| 9 | Pilot | About **1000 edits** under `--as-me`, built up gradually and paced like a person (`--as-me` gives the 30–120 s random pause). |
| 10 | Thresholds | Starting values accepted (§3.3–§3.4). |
| — | Stale tags | **In scope, same task.** Remove بدون منبع / بدون منبع زنده from articles that are now properly cited (§3.9). |
| — | Dead links | Dropped (no fa banner exists, §1.4). |

On ۱۲ اکتبر ۲۰۲۶ I confirmed that یک منبع, بخش بدون منبع and اصلاح ترجمه stay
report-only. "Everything at once" did not mean tagging them.

### 0.3 What the task does
1. **Adds `{{بدون منبع}}`** when there are no sources of any kind, in both the wikitext
   and the render (§3.0, §3.1).
2. **Adds `{{بدون منبع زنده}}`** for the same case on a page in `رده:افراد زنده` (§3.2).
3. **Adds `{{بهبود منبع}}`**, narrow tier (§3.3).
4. **Adds `{{منبع زنده}}`**, narrow tier (§3.4).
5. **Removes stale `{{بدون منبع}}` / `{{بدون منبع زنده}}`** (§3.9).
6. **Reports only:** یک منبع, بخش بدون منبع and اصلاح ترجمه candidates, pages refused for
   banner crowding (§4), and anything doubtful. The report goes to
   `کاربر:MamouriBot/وظیفه ۱۵/گزارش`.

### 0.4 Code layout and running

The task follows `docs/BUILDING-A-TASK.md` and `src/core.ts` (the `BotTask` interface,
`Bot`, `--as-me`, and the `prepare`/`verify`/`report` hooks). It borrows from
`src/tasks/task-14/population-box.ts` (template insertion, `findTemplate`,
`reportWikitext`, the gate-delta check in `verify`) and from `src/tasks/task-10/destub.ts`
and `destub-classify.ts` (`extractProse`/`countWords` for Persian prose words, and the
parse-and-check-categories pattern in `verify`).

`src/tasks/task-15/source-tags.ts` (`id: 'source-tags'`, `taskNumber: 15`) is registered in
`src/run.ts` `TASKS`:
- **`getTargets`** finds candidates with CirrusSearch (§0.5). It caps the walk from
  `bot.opts.limit`, as tasks 12 and 13 do, and accepts the `TARGET_TITLES`, `TARGET_FILE`
  and `TARGET_CAP` environment selectors. `transform` has to be pure and synchronous, so
  every network check happens here, cached per title:
  - the render (`action=parse`, `prop=text|externallinks|categories`),
  - `pageprops` (dab), `revisions` (last edit time), categories,
  - whether the monthly category exists (§5).
- **`transform`** inserts a banner, merges it into `{{مشکلات متعدد}}`, or removes the stale
  tag. Otherwise it refuses, with a reason.
- **`verify`** runs before saving (§11).
- **`report`** writes the report page.

```sh
npm test                 # also checks the vendored src/lib/ files against the parent repo's scripts/lib/
npm run typecheck
npx tsx src/run.ts source-tags --limit 20                 # dry run
npx tsx src/run.ts source-tags --as-me --live --limit N   # live, under my account
```

When committing, commit in `bots/` first, then move the submodule pointer in the parent
repo. Stage explicit paths only.

### 0.5 Target queries (counts from ۱۰ اکتبر ۲۰۲۶)
- **Add, unsourced:** `-insource:"<ref" -insource:"http" -hastemplate:"بدون منبع"
  -hastemplate:"جعبه اطلاعات روستای ایران"`, minus dabs, gives **231,803**.
  - That includes یادکرد-ویکی-only pages, on purpose (§1.9).
  - The query only finds candidates. Every page still goes through the full §3.0 test and
    the render check, after which about 99k pass (§2.2).
- **Add, narrow tiers:** prefilter by size. ≥300 prose words is roughly ≥3.8 KB, and ≥800
  words roughly ≥9.3 KB. Use `insource:"<ref"` plus a size floor, then count refs locally.
  - Avoid regex repetition such as `insource:/(<ref.*){4}/`. CirrusSearch returns
    `cirrussearch-regex-syntax-error`.
- **Remove, stale:** `hastemplate:"بدون منبع" insource:"<ref"` gives **2,152**.
  `hastemplate:"بدون منبع زنده" insource:"<ref"` gives **8**.
- **Search limits:** CirrusSearch fails past offset 10,000
  (`cirrussearch-offset-too-large`; see task 3's frozen list). For a large walk, split the
  query (e.g. `prefix:` by first letter, or by `incategory:`), or harvest a frozen list
  once, shuffle it with a fixed seed, and feed it with `TARGET_FILE`.
- **Rate limits:** heavy reads hit HTTP 429. Honour `Retry-After`. Core's GET gate is
  1.2 s.

---

## 0b. Research summary

1. **Two of the eight requested templates don't do what I assumed.**
   - **بدون منبع زنده is not a dead-link banner.** It is fa's copy of en
     `{{BLP unreferenced}}`: a living person's biography with no sources at all. fa has no
     article-level dead-link banner (§1.4).
   - **گسترش از زبان does not mean "contains English".** It means "a longer article exists
     in another language, so translate more of it". fa also says not to use it directly,
     only through a language wrapper (§1.8).
2. **The number of affected articles is huge, and most are sub-stubs.** About 11% of
   articles have nothing citation-like at all. After a render check, 9.1% (about 99,000)
   are cleanly unsourced. 31% have exactly one source (about 345,000). Applying the
   templates literally would tag hundreds of thousands of pages, which is the spam the
   request rules out.
3. **Only two templates have a test a bot can decide with confidence:** بدون منبع and
   بدون منبع زنده. Both require "no source of any kind", which can be checked. The others
   turn on "too few", "big" or "untranslated", which the docs leave to editors, so the bot
   only applies them under narrow conditions nobody would argue with (§3).
4. **Untranslated text is rare.** In 2,000 random articles, with templates and galleries
   stripped, the count is zero. What a detector finds is mostly airline-destination
   tables, bibliographies and song lyrics, which are rightly left in the original
   language. A bot should report candidates, not tag them (§3.7).
5. **Dated tags put pages in the wrong category** if the month's category doesn't exist
   yet (§5).
6. **At this scale, a village-pump consensus is very likely needed before a BRFA** (§8). I
   put that question off until after the `--as-me` trial (decision 8).

---

## 1. What each template actually means

I fetched all the template sources and /توضیحات on 2026-10-10, along with the en
equivalents. The criteria below are quoted or paraphrased from those docs. Redirect lists
are in `docs/data/task-15/template-survey.json`.

### 1.1 `{{بدون منبع}}` ← en `{{Unreferenced}}`
- Use only when the article has no citations or references of any kind.
- The en doc rules it out if there is even one general reference, bare URL or footnote.
  Sources listed under «پیوند به بیرون» can count as references.
- When sources are listed but there are no inline citations, the right tag is
  `{{بدون پانویس}}`, not this one.
- Params: `تاریخ`/`date`. The template substitutes itself (`#درخواست:Unsubst`) and stamps
  a date.
- Category: `مقاله‌های بدون منبع` (dated monthly subcategories).
- Placement: top of the article.
- 11 redirects, including `{{منبع}}`, `{{بی‌منبع}}` and `{{Unreferenced}}`.
- `{{منبع|بخش}}` is an old section use of the same template. In a sample of 40 tagged
  pages, 14 were section uses.
- Live: 5,783 articles. 2,152 of those now contain `<ref`. Removing stale tags is in scope
  (§3.9), but containing a `<ref` somewhere is not enough: that was roughly the first
  version's test, and 44% of its removals were wrong. 2,152 is the upper bound on
  candidates, not on edits.

### 1.2 `{{بهبود منبع}}` ← en `{{More citations needed}}`
- Use only when there are some citations, but too few.
- The fa doc notes that some editors think it is unnecessary on stubs.
- The en doc says to use `{{منبع زنده}}` instead on BLPs.
- Category: `مقاله‌های نیازمند ارجاع‌های اضافی`.
- Live: 6,913.
- 10 redirects, including `{{Refimprove}}` and `{{Verify}}`.

### 1.3 `{{بخش بدون منبع}}` ← en `{{Unreferenced section}}`
- Use only when the section has no references at all. For sections with some but too few,
  use `{{بهبود منبع بخش}}`.
- It goes at the top of the section, not the top of the article, so the top-of-article
  placement I asked for doesn't apply to it (§4).
- Live: 459.

### 1.4 `{{بدون منبع زنده}}` ← en `{{BLP unreferenced}}`: not dead links
- Banner text: «زندگی‌نامهٔ فرد زنده … دربرگیرنده هیچ مرجع یا منبعی نیست». It adds that
  unsourced material about living people «باید به‌سرعت حذف شوند».
- Categories: `زندگی‌نامه زندگان بدون منبع` and `همه مقاله‌های زندگی‌نامه زندگان بدون منبع‏‏`.
  The second contains a stray U+200F. That does no harm to transclusion, but code that
  checks category membership by exact name has to allow for it.
- The en doc says pages that warrant deletion should get `{{prod blp}}` instead.
- Live: only 19 uses, against 371 BLPs tagged with plain بدون منبع. fa editors put plain
  بدون منبع on unsourced BLPs, so this template is hardly used.
- Section variant: `{{بخش بدون منبع زنده}}`.
- **Dead links:** `{{پیوند مرده}}` is the inline marker after a single URL. There is no
  banner: پیوندهای مرده, Dead links and Cleanup link rot are all missing on fa. Checking
  whether external URLs are alive is a different and much heavier task (HTTP requests to
  thousands of outside hosts, archive lookups, false deaths from sites that block bots),
  so it is dropped (decision 2).

### 1.5 `{{منبع زنده}}` ← en `{{BLP sources}}`
- A living person's biography that needs more references. It must not be used on
  unsourced BLPs; those take `{{بدون منبع زنده}}`.
- The en doc says to consider not adding it to very short articles.
- Live: 102.

### 1.6 `{{یک منبع}}` ← en `{{One source}}`
- The article relies largely or entirely on one source. The doc says that is not a policy
  violation.
- The en doc says to consider not adding it:
  - to stubs,
  - to articles that are being actively expanded,
  - where there is no apparent problem.
- `{{BLP one source}}` does not exist on fa.
- Live: 239.

### 1.7 `{{اصلاح ترجمه}}` ← en `{{Not English}}`
- Text written in a language other than Persian. Param 1 is the language; param 2 = `بخش`
  for section use. 15 redirects.
- It is a heavy tag. Unless `listed=yes`/`فهرست‌شده`, the banner:
  - tells the reader the page will be nominated for deletion within two weeks,
  - asks whoever tags it to list it at `ویکی‌پدیا:صفحه‌های نیازمند ترجمه به فارسی` with
    `{{اعلان صنت}}`.

  A bot that tags without listing leaves a false threat. A bot that lists also creates a
  public queue entry for every page.
- Live: 1,290.

### 1.8 `{{گسترش از زبان}}` ← en `{{Expand language}}`
- Meaning: «این مقاله را می‌توان با ترجمهٔ مقالهٔ متناظر در ویکی‌پدیای X گسترش داد». It
  invites expansion. It does not mean the page contains untranslated text.
- It is not used directly. The wrappers are used instead, e.g. `{{گسترش از زبان انگلیسی}}`
  (750 uses), عربی, فرانسوی or آلمانی. Params: `1`/`مقاله دیگر`, `تاریخ`.
- Wrapper total: 1,160.
- What I meant by "many English sections" is اصلاح ترجمه, not this. This template fits a
  different job: a short fa article whose en interwiki is many times longer (§3.8;
  dropped, decision 6).

### 1.9 `{{یادکرد-ویکی}}`: not a source
- Its own TemplateData says using it in place of the original sources is wrong.
- It adds `رده:مقاله‌های دارای الگوی یادکرد-ویکی` (502,966 pages).
- In this task, a `<ref>` whose only content is یادکرد-ویکی (or one of its four redirects,
  or `Cite wikipedia`) counts as zero sources. So does a bare یادکرد-ویکی outside any ref.
- So an article whose only "source" is the en.wiki page it was translated from is
  unsourced for بدون منبع. This is the heart of the task, and most of the volume comes
  from it (§2).

### 1.10 `{{مشکلات متعدد}}`
- The multiple-issues wrapper (`چند مشکل` does not exist).
- Existing pages rarely wrap these tags in it: 1, 4 and 8 of 40 sampled pages for بهبود
  منبع, منبع زنده and یک منبع.

---

## 2. Measured numbers

### 2.1 Search counts (ns0)

| query | articles |
|---|---|
| no `<ref` | 395,315 |
| no `<ref`, no یادکرد-ویکی | 169,115 |
| … and no `http` | 100,448 |
| … and no پک/sfn, not dab, not already tagged | 75,591 |
| یادکرد-ویکی and no `<ref` | 226,200 |
| … and no `http` | 160,200 |
| in `افراد زنده` (187,754) with no `<ref` | 108,776 |
| … of which no یادکرد-ویکی | 30,592 |

### 2.2 Random sample of 2,000 articles

Drawn with `list=random` (non-redirect, ns0). 33 were dabs, which leaves **1,967**.
Per-page features are in `docs/data/task-15/random-2000.json`.

**Citation shape**

| shape | n | share | ≈ wiki-wide |
|---|---|---|---|
| no `<ref>` and no پک/sfn | 750 | 38.1% | 418k |
| … with یادکرد-ویکی | 445 | 22.6% | |
| … with a citation template outside `<ref>` | 176 | 8.9% | |
| … with a URL anywhere | 413 | 21.0% | |
| … with bulleted lines under a references/external-links heading | 385 | 19.6% | |
| **STRICT unsourced**: none of the above (یادکرد-ویکی allowed), not a list, no ISBN | **212** | **10.8%** | **≈118k** |
| … of which carry یادکرد-ویکی (translated, cite only en.wiki) | 174 | | |
| … of which already tagged بدون منبع | 4 | | |
| … of which BLP (`رده:افراد زنده`) | 39 | | |

The STRICT unsourced group is mostly sub-stubs:
- Persian prose (lead and body, templates and tables stripped) has a median of about 24
  words. 19 in 20 are under about 130 words.
- The most common infobox is `Infobox football biography` (61 of 212, 29%).

**Rendered check of STRICT unsourced** (`action=parse` on all 212):

| result | n |
|---|---|
| rendered `cite_note-` footnotes | **0**. The wikitext test never missed a ref. |
| no external link except wiki/authority hosts | **181** |
| only authority-control or «یافتن منابع» search links (bibsys, worldcat, sbn, Google search …) | 18 |
| some other link, all emitted by templates | 13 |

- The 13 links come from templates, not from article text:
  - an infobox `website` (quakeroats.com, tv5.co.th, okb-novator.ru, sonymobiledisplay.jp),
  - authority catalogues missing from the ignore list (bibliotheken.nl, nsk.hr, kulturnav),
  - one YouTube link, and HLS (a real encyclopedia entry).
- Under the en doc, an official-site or encyclopedia link arguably counts as an external
  link, which rules out بدون منبع. So the bot refuses any page whose render has an
  external link that is not an authority link.
- That leaves **181 of 2,000 = 9.1% ≈ 99k articles**.
  - 35 are BLPs, about 19k wiki-wide.
  - 148 cite only en.wiki (یادکرد-ویکی).
- The 31 refused pages are 15% of the STRICT group. That is what the render check catches.

**Number of real sources** (یادکرد-ویکی-only refs removed), among the 1,217 articles that
have any:

| Persian prose words | 1 | 2 | 3 | 4+ |
|---|---|---|---|---|
| < 100 | 550 | 138 | 85 | 59 |
| 100–299 | 51 | 48 | 21 | 77 |
| 300–799 | 10 | 14 | 15 | 90 |
| 800–1,999 | 3 | 0 | 1 | 39 |
| 2,000+ | 0 | 0 | 1 | 14 |

- **620 articles (31.5%, ≈345k) have exactly one source.**
- 89% of them have fewer than 100 Persian words. These are exactly the stubs the یک منبع
  doc says not to tag.
- **13 (0.66%, ≈7k) have one source and ≥300 words.**
- Long articles (≥800 words) with ≤3 sources: **4 (≈2.2k)**.

**BLPs:** 208 (10.6%).
- With 1–2 sources and ≥150 words: **4**. With ≥300 words: **2**.
- منبع زنده, applied with the en doc's "not on very short articles", is a small job:
  roughly 1–2k pages wiki-wide.

**Big unsourced sections:** 18 articles had a non-references section of ≥250 Persian words
with no `<ref>`/پک in it, in an article that does have refs. 5 of those sections are plot
summaries (داستان / خلاصه داستان), which by convention are sourced to the work itself. That
leaves **13 (0.66%, ≈7k)**. Examples:
- توپ (جنگ‌افزار): «پیشینه», 503 words
- آرتور شوپنهاور: «تحصیلات», 888 words
- نیروی هوایی لهستان: «دهه ۱۹۳۰» and «جنگ سرد»

### 2.3 Untranslated text

- **Random sample: 0 of 1,967.** This counts content sections where Latin words are ≥40
  and outnumber Persian words, after stripping templates at any depth, `<gallery>`, math,
  tables and list lines.
- A first, simpler pass found 45 cases. All of them were infobox parameters (drugbox IUPAC
  names, `official_name`) or gallery captions, so a detector that doesn't know about
  templates is wrong every time.
- **Targeted search:** `insource:/\. The [a-z]+ … /` without اصلاح ترجمه gives 1,807
  articles. The same detector flags **49** of them. Most are rightly in English:
  - airport «شرکت‌های هواپیمایی و مقصدهای پروازی» tables (about 20 of the 49),
  - bibliographies (تالیفات, فهرست مقالات, آثار),
  - full song lyrics (چرخ‌های اتوبوس),
  - group tables.
- Genuine untranslated prose is a handful:
  - رویان‌زایی مگس سرکه: «Maternal effect genes», 625 words, and «Gap genes»
  - بندیکت آرنولد: یک مسئله شرافتی: «Plot», 1,381 words
  - تبدیل یکاهای اندازه‌گیری: «Radiation – equivalent dose»
  - فرودگاه شهری مانهایم: «Current operations»
  - رویدادهای سینمایی مارول list fragments
- So genuine cases number in the low hundreds wiki-wide, and the detector is right only
  about 15–20% of the time. That is not good enough for a bot to place a tag that
  threatens deletion.

---

## 3. Per-template rules

As in وظیفهٔ ۱۰, the bot refuses whenever it is unsure:
- it tags only when every test passes,
- every doubtful page goes to the report page for a person,
- a missed page costs nothing, while a wrong tag costs trust in the bot.

### 3.0 What counts as a source

Each of these counts as a source:
1. a `<ref>…</ref>` whose body contains anything other than یادکرد-ویکی / `Cite wikipedia`
   and whitespace. A named reuse `<ref name=x/>` is not a new source.
2. `{{پک}}`/`{{sfn}}`/`{{harv*}}`/`{{یادکرد پک}}`, plus every redirect, resolved from the
   live redirect list.
3. a citation template (`یادکرد *`, `cite *`, `citation`) outside `<ref>`, other than
   یادکرد-ویکی.
4. general references: any non-empty bulleted line under a references-type heading
   (منابع, پانویس, کتاب‌شناسی, کتابنامه, برای مطالعهٔ بیشتر, پیوند به بیرون, …, and the en
   equivalents), except a line whose only content is یادکرد-ویکی.
5. any external URL, in the wikitext or in the render, that is not a wiki or
   authority-control host. This includes an infobox `website`.
6. an ISBN / شابک.

Since the «مولکول» fix (§13, run 1), a reference that cites only the فرهنگستان word list
or another Wikipedia does not count as sourcing the article's content.

The page is rendered before any decision. Templates can emit refs and links: infoboxes pull
Wikidata references, some navboxes add footnotes, and authority-control templates emit
URLs. The rendered HTML must also show zero `cite_note-` anchors and no external links
other than authority links. If the wikitext and the render disagree, the bot refuses.

### 3.1 بدون منبع: tag

Tag when all of these hold:
- §3.0 source count = 0 in both the wikitext and the render.
- Not a dab (`pageprops.disambiguation`), not a list (`فهرست*`), not a year or date page.
  HujiBot وظیفه ۷ removed بدون منبع from date pages, so the consensus there is explicit.
  Date pages include day pages in all three calendars (Hijri ones too, §13 run 3),
  month-and-year pages such as «خرداد ۱۳۸۷», and month, century, decade and millennium
  pages (§13 build log).
- Not a redirect, not a set-index, not a soft redirect.
- No source or verification banner already present. This checks every redirect of بدون
  منبع, بدون منبع زنده, بهبود منبع, منبع زنده, یک منبع, بدون پانویس and مدرک (8,765
  uses), and the same names inside `{{مشکلات متعدد}}`.
- Not a BLP. BLPs go to §3.2.
- Not an Iranian village: no `{{جعبه اطلاعات روستای ایران}}` (decision 5).
- The render has no external link other than authority links (§3.0 item 5).
- Not edited in the last 7 days. This follows the en "actively expanded" caution and
  avoids new articles that are still being written.
- Not `{{nobots}}`/`{{bots|deny}}`. `core.ts` handles this.

There is no minimum length. "No sources" is yes or no, and a 20-word unsourced stub is as
unsourced as a 2,000-word one. That makes the volume about 99k after the render check, so
the spam question is answered by pacing and the daily cap (§7).

### 3.2 بدون منبع زنده: tag (optional, decision 2)

- Same test as §3.1, plus `رده:افراد زنده` on the page.
- That category is set by people or by `{{جعبه اطلاعات شخص}}` logic. It is the reliable BLP
  marker on fa.
- If the page already has plain `{{بدون منبع}}`, it is not swapped (decision 4: leave the
  371 alone), and it is not listed on the report either.
- About 19k candidates wiki-wide by extrapolation (35 of the 181 that pass the render
  check).

### 3.3 بهبود منبع: narrow tag (thresholds accepted, decision 10)

"Too few" is a judgement, so the bot only acts far from the borderline:
- ≥ **800** Persian prose words and ≤ **2** real sources, or
- ≥ **2,000** words and ≤ **3** sources.

Also:
- Not a BLP (§3.4 instead).
- Not when the page already has one of the §3.1–§3.6 tags.

In the sample this matches 4 pages (≈2k wiki-wide). The density rule is not in the
template doc. It is my operating choice, and the request says so.

### 3.4 منبع زنده: narrow tag (thresholds accepted, decision 10)
- BLP, 1–2 real sources, ≥ **300** Persian prose words. That is 2 in the sample (≈1k).
- Never with 0 sources (that is §3.2).

### 3.5 یک منبع: report only
- Exactly one real source, ≥ **300** words, and the source is not the subject's own site.
  That is 13 in the sample (≈7k).
- The doc itself says one source is not a policy violation and advises against tagging
  stubs, so a bot campaign would be exactly the drive-by tagging the doc warns about.
- Candidates are listed on the report page and not tagged.

### 3.6 بخش بدون منبع: report only
- Section ≥250 words, no refs inside it, refs elsewhere in the article, a heading that is
  not plot/synopsis/references/gallery/discography/works list, and not the lead. That is
  ≈7k pages.
- The tag goes at the top of the section, not the top of the article.
- Why report only:
  - A section can be sourced by the next section's citation, or by a general reference.
  - Telling what a heading means (plot, works, discography) needs a hand-made exclusion
    list that will never be complete.

### 3.7 اصلاح ترجمه: report only
- The detector is right only about 15–20% of the time (§2.3), and the banner threatens
  deletion. A bot must not place it.
- The report lists candidate sections with Latin and Persian word counts for a person to
  judge.

### 3.8 گسترش از زبان: dropped (decision 6)
- What I meant by "many English sections" is اصلاح ترجمه, not this.
- A size-ratio job ("fa is under 10% of the en article") would be a separate task. Size
  ratio is a weak signal, and editors often find the tag noisy.

### 3.9 Remove stale بدون منبع / بدون منبع زنده: edit
- **Targets:** `hastemplate:"بدون منبع" insource:"<ref"` (2,152) and
  `hastemplate:"بدون منبع زنده" insource:"<ref"` (8).
- **The tag must be the article-level use.** The section forms `{{منبع|بخش}}` and
  `{{بدون منبع|بخش}}` (any positional `بخش`/`section`) and
  `{{بدون منبع|...|name=بخش بدون منبع}}` are skipped. They were 14 of 40 sampled tagged
  pages.
- **Not on a page edited in the last 7 days.** Someone may be in the middle of cleaning it
  up.
- **Enough inline citations for the length of the article.** `inlineCitations()` counts
  footnotes and `{{پک}}`/sfn only. Bullets under «منابع» don't count: nothing ties them to
  a sentence, so no claim can be checked against them. Matches inside `<!-- -->`,
  `<nowiki>` and `<pre>` don't count either. `citationFloor()` requires one inline
  citation per 250 prose words, with a minimum of 2 (2 at 500 words, 3 at 501, 8 at
  2,000). Prose words come from وظیفهٔ ۱۰'s `extractProse` over the rendered HTML, which
  keeps `<p>` text only and drops infoboxes, navboxes, tables and reference lists, so
  templates and markup can't inflate the count.
  - I set 250 from this task's own removals. Properly sourced articles came in at 27–95
    words per citation («کازرون» 27, «روی» 37, «ترابری ریلی» 79, «کمونالیسم» 95, and the
    shortest, «کتاب مستطاب آشپزی», 77). The rejected ones were «هدهد» at 564 and «وسترن»
    at 1,128. The floor sits in the gap between them.
  - Adding and removing use different tests on purpose. `isStrictUnsourced` still counts
    bibliographies, because it guards adding a banner, and there any doubt must block.
- **The render agrees:** it has at least one `cite_note-`. If it has none, the page goes on
  the report («ناسازگاری متن و نمایش»).
- **These go on the report instead of being edited:**
  - the tag appears more than once, or next to `{{بخش بدون منبع}}`: removing one leaves the
    page in the category anyway;
  - the page has a hand-written `[[رده:…بدون منبع…]]`: removing a hand-placed category is a
    different edit, outside the approved scope;
  - the tag is inside `{{مشکلات متعدد}}` and only one banner would be left. Unwrapping is
    a judgement call.
- **The edit:**
  - If the tag stands alone, delete it with its trailing newline, without leaving the page
    starting with a blank line.
  - If it is inside `{{مشکلات متعدد}}`, delete that line.
  - Nothing else changes.
- **No downgrading.** Replacing the tag with بهبود منبع or یک منبع is a judgement call. If
  the page qualifies for §3.3/§3.4, that banner is added in the same edit under its own
  rules. Otherwise the tag is removed and that is all.
- **Summary:** `حذف الگوی {{بدون منبع}}: مقاله اکنون منبع دارد`.
- **verify:** the page leaves `مقاله‌های بدون منبع` (and its dated subcategory), and the
  gate shows no new problems.

Until ۱۳ اکتبر ۲۰۲۶ the rule was "at least one real source, and the render has a
`cite_note-`", with bibliography bullets counted. 44% of the removals made under it were
wrong (see [History](#the-removal-bar-۱۳-اکتبر-۲۰۲۶-17-edits-reverted)).

---

## 4. Placement

- **Article-level banners** (§3.1–§3.5) go at the top of the article, after:
  - hatnotes (`{{تغییرمسیر}}`, `{{دیگر کاربردها}}`, `{{برای}}`, …),
  - `{{DISPLAYTITLE}}`, `{{عنوان مقاله}}`, `{{توصیف کوتاه}}` (and its redirects Short
    description, شرح مختصر),
  - protection icons (`{{حص}}` and its redirects محافظت, Pp*).
  - `{{کوتاه‌نوشت}}` does not exist on fa.

  Banners go before the infobox. That is how existing tagged pages look in the 40-page
  samples, and what en MOS:ORDER says.
- **If the page has a `{{مشکلات متعدد}}`,** the banner goes in as a line inside it, not as
  a second banner above it.
- If the page already has two or more other maintenance banners, the bot does not add a
  third on its own. It reports the page instead, since wrapping them is a judgement edit.
  `bannerCount` only counts the run of templates at the start of the page, stopping at the
  infobox and skipping hatnotes and توصیف کوتاه.
- **The bot refuses outright** on pages carrying in-use, under-construction,
  speedy-deletion or AfD templates. The redirect lists are in §12.3.
- **Section banners** (§3.6, report-only) would go on the first line under the heading if
  they are ever enabled.
- Insertion is plain text with one newline after the template. No other whitespace
  changes, as in وظیفهٔ ۱۴.

## 5. The date parameter

- Banners carry `تاریخ=<ماه میلادی به فارسی> <سال>` with Persian digits, e.g.
  `{{بدون منبع|تاریخ=اکتبر ۲۰۲۶}}`. That is what `{{جا:بدون منبع}}` produces (its output
  uses `date=`; either name works).
- Month names: ژانویه فوریه مارس آوریل مه ژوئن ژوئیه اوت سپتامبر اکتبر نوامبر دسامبر.
- `پودمان:Message box` builds the dated category as `<cat> از <date>` and checks whether
  that `رده:` page exists, e.g. `رده:مقاله‌های بدون منبع از اکتبر ۲۰۲۶`. If it does not,
  the module adds the page to `رده:مقاله‌های دارای پارامتر تاریخ نادرست در الگو` (723
  pages on 2026-10-10).
- Jeeputer / «Jeeputer's Cat» creates those monthly categories after the fact. On
  2026-10-10 they existed up to about ژوئیه ۲۰۲۶; September and October 2026 did not.
- **What the bot does now:** at the start of a run, `ensureMonthlyCategories` checks each
  banner's category for the current month and creates any that is missing, with
  `{{رده تمیزکاری ماهانه}}` as the whole page. That template works out the parent, the
  month, the hidden flag and the all-articles category from the title, the same way for all
  four of this task's categories. In a dry run nothing is created and no date is written.
  If creating the category fails, the banner is written without a date.
- Originally (decision 7) the bot wrote no date when the category was missing and never
  created categories. That was safe, but it threw away what the date is for: the dated
  categories show editors how long an article has had a problem. On en a bot creates
  these categories; on fa nothing does
  (`lessons/tracking-categories/dated-maintenance-cat-missing-monthly-cats.md`).

## 6. Edit summary

Since the task runs as MamouriBot, core adds the request link in front with
`withBrfaLink(15, …)`. Under `--as-me` there is no prefix. The body is content-only Persian
in the first person, and never mentions a bot, a script or automation (parent
`AGENTS.md`).

- `افزودن الگوی {{بدون منبع}}: مقاله هیچ منبعی ندارد (یادکرد-ویکی منبع به‌شمار نمی‌آید)`
- `افزودن الگوی {{بدون منبع زنده}}: زندگی‌نامهٔ فرد زنده بدون منبع`
- `حذف الگوی {{بدون منبع}}: مقاله اکنون منبع دارد`

For the narrow tiers the summary gives the measured numbers, e.g. «… ۲ منبع برای ۱٬۲۰۰
واژه», so an editor who disagrees can see the rule and argue with that.

## 7. Scale and running (decision 3: no phases)

- Everything in §0.3 ships together. Volume is controlled by `--limit`, not by phases.
- **Trial:** about 1000 edits planned under `--as-me`, built up gradually: 10, then 50,
  then a few hundred at a time, auditing the diffs and the renders between runs. Targets
  are shuffled with a fixed seed, so a run mixes topics instead of being 50 footballers in
  a row.
- Full-scale numbers: about 99k بدون منبع, ~19k بدون منبع زنده (included in the 99k), ~3k
  narrow tiers, ~2.1k removals.
- Flooding watchlists is the main social cost of the full run.

**Iranian village articles are excluded (decision 5).** Many آبادی stubs cite only en.wiki
(قهوه‌خانه/اجرایی/بایگانی ۵۸, 2025). In that thread Huji suggested deleting them after
checking census data, and وظیفهٔ ۱۴ is adding a census box sourced through Wikidata to the
same pages. Every page with `{{جعبه اطلاعات روستای ایران}}` is skipped.

## 8. Consensus and the permission request

This is the background I had when deciding (decision 8). The request has since been
approved.
- No fa bot had added these tags before. The only related bot task, HujiBot وظیفه ۷,
  removed them.
- The 2019 thread (قهوه‌خانه/گوناگون/بایگانی ۸۷) has editors asking for
  یادکرد-ویکی-only articles to be found by query and tagged. That supports this task, but
  the thread is old.
- At full scale, about 99k banners change what one in eleven articles looks like. A
  reviewer was likely to ask for a قهوه‌خانه/اجرایی thread first, and the 2025 village
  discussion shows the "en.wiki-only" question is contested.
- The plan was:
  1. A short قهوه‌خانه post asking one question, with the measured number: should articles
     whose only source is the en.wiki page carry {{بدون منبع}}?
  2. The BRFA, linking the thread and the trial's numbers.
- Both had to be short. Huji has asked for brevity, and long messages are part of why the
  task 14 thread failed (`TODO.md` §7b).

## 9. Open questions

The last one was answered on ۱۲ اکتبر ۲۰۲۶: یک منبع, بخش بدون منبع and اصلاح ترجمه stay
report-only. So the task edits for §3.1, §3.2, §3.3, §3.4 and §3.9 only. The number
articles question under [Where it stands](#where-it-stands) is still open.

## 10. Out of scope

- گسترش از زبان (decision 6).
- Dead-link detection (§1.4).
- Swapping بدون منبع → بدون منبع زنده on the 371 BLPs (decision 4).
- Iranian آبادی articles (decision 5).

## 11. Verification

- `transform` is pure:
  - it inserts one banner, removes one stale tag, or refuses with a reason;
  - `verify` checks that the diff is exactly that one line, or the one line inside
    `{{مشکلات متعدد}}` when merging.
- **Pre-save render** (`action=parse` on the new text, as task 10's `verify` does):
  - **add:** the page gains the expected category (§12.2), allowing for the stray U+200F;
  - **remove:** the page leaves `مقاله‌های بدون منبع` and its dated subcategory;
  - the page is not in `مقاله‌های دارای پارامتر تاریخ نادرست در الگو`;
  - no new errors (`خطا`, `scribunto-error`, `class="error"`). This compares with the
    current render, so errors the article already had don't block the edit («جنگ کره»);
  - **add بدون منبع / بدون منبع زنده:** the render still shows 0 `cite_note-`, in case a
    ref was missed in the wikitext;
  - gate delta: `checkWikitext` on the old and new text, failing on any new problem (as in
    task 14).
- **Report page** `کاربر:MamouriBot/وظیفه ۱۵/گزارش`: refusal counts per reason, the
  report-only lists for §3.5–§3.7, pages refused for banner crowding, and removals that
  would leave a single-item مشکلات متعدد. It is republished on every run.
- **Tests** (`source-tags.test.ts`, offline) have a fixture for each of:
  - each source kind in §3.0;
  - a یادکرد-ویکی-only ref, and a bare یادکرد-ویکی;
  - a `<ref>` inside a comment (not a source);
  - `{{منبع|بخش}}` / `{{بدون منبع|بخش}}` (section uses: no removal);
  - the مشکلات متعدد merge;
  - hatnote / توصیف کوتاه / حص ordering before the infobox;
  - the U+200F category name;
  - dab, list, year page, village infobox: all refused;
  - an existing banner under a redirect name: refused;
  - stale removal, both standalone and inside مشکلات متعدد;
  - date written vs omitted, depending on whether the category exists.

To check the live edits independently of the bot's own `verify`, use
`scripts/archive/task15-audit-live-edits.py` in the parent repo.

## 12. How the source detector works

### 12.1 Source detection, from the prototype (`archive/task-15-research/classify.py`)

The prototype's logic, recorded here so the TypeScript code doesn't depend on the archive:
- **First strip** `<!-- … -->`. Template names are matched as
  `\{\{\s*([^{}|\n]+?)\s*(?:\||\}\})`, with `_` normalised to a space.
- **Refs:** `<ref[\s>]` counts openings. The bodies are `<ref(?:\s[^>]*)?>(.*?)</ref>`
  (dotall). A body is **یادکرد-ویکی-only** if it matches `یادکرد-ویکی|cite wikipedia` and
  contains neither `http` nor another `{{یادکرد …`/`{{cite …`. Real refs = bodies −
  ykw-only. A named reuse `<ref name=…/>` is not a source.
- **Citation templates outside refs:** names matching `^(یادکرد|cite|citation)`
  (case-insensitive), except یادکرد-ویکی / cite wikipedia.
- **sfn family:** `^(پک|sfn|harv)`; `{{پک}}` is a redirect to `پانویس کوتاه‌شده`.
- **URLs:** `https?://` anywhere.
- **ISBN:** `ISBN|شابک`.
- **Sections:** split on `^(==+)\s*(.+?)\s*\1\s*$`. A references-type heading matches
  `منابع|منبع|پانویس|یادداشت|کتاب‌?شناسی|کتابنامه|پیوند به بیرون|پیوندهای بیرونی|جستارهای وابسته|مطالعه بیشتر|برای مطالعه|ارجاع|References|Notes|Bibliography|External|Further|See also|Sources`.
  A **general reference** is a `^\*` line in such a section, longer than 15 characters,
  that is not یادکرد-ویکی.
  - `جستارهای وابسته` / See also is in that regex, but a see-also bullet is a wikilink, not
    a source. The port requires the line to hold something other than `[[…]]` links, or an
    internal see-also list would block a correct بدون منبع.
- **STRICT unsourced** = 0 `<ref`, 0 sfn, 0 cite templates outside refs, 0 URLs, 0
  general-ref lines, no ISBN, and not a `فهرست*` title.
- **Prose words:** the port uses task 10's `extractProse`/`countWords`, not the prototype.
  The prototype stripped templates at any depth, galleries, math/poem/blockquote, refs,
  tables, file/category links and list lines, then counted `[\u0600-\u06FF\u200c]+`.
- **Render check** (`render_check.py`): `action=parse`, `prop=text|externallinks`.
  - Count `id="cite_note-` in the HTML. The prototype matched this literally, which finds
    nothing: MediaWiki escapes the underscore, so the real markup is
    `id="cite&#95;note-1"`. The port's `countRenderedRefs()` decodes first (§13 build log).
  - Ignore external links whose host matches
    `wikidata.org|wikimedia.org|wikipedia.org|geohack|toolforge|wmflabs|viaf.org|d-nb.info|id.loc.gov|isni|orcid|worldcat.org/identities|idref|bnf.fr|catalogo.bne|nla.gov.au|snaccooperative|nkp.cz|nlg.gr|ndl.go.jp|nukat|kb.nl|nli.org|libris|trove|musicbrainz|openstreetmap|geonames`.
  - Also ignore the «یافتن منابع» search links (Google search etc.).
  - Any other link means refuse. The list was missing bibliotheken.nl, nsk.hr and
    kulturnav. Refusing on those is safe, so the list only needs extending if it costs
    volume.

Since the «مولکول» fix the detector also has a second set of fields (`refs_sourcing`,
`cite_outside_sourcing`, `http_external`, `genref_sourcing`) that leave out the فرهنگستان
word list and links to other Wikipedias. Every decision and tier threshold uses those.
The original fields are unchanged, so `source-detect.replay.ts` still checks the port
against the prototype.

### 12.2 Categories each banner should produce

| banner | category | note |
|---|---|---|
| بدون منبع | `مقاله‌های بدون منبع` (+ `… از <ماه سال>`) | |
| بدون منبع زنده | `زندگی‌نامه زندگان بدون منبع` and `همه مقاله‌های زندگی‌نامه زندگان بدون منبع‏‏` | the second ends in a stray U+200F |
| منبع زنده | `مقاله‌های زندگی‌نامه زندگان بدون منبع` | |
| بهبود منبع / یک منبع / بخش بدون منبع | `مقاله‌های نیازمند ارجاع‌های اضافی` | |
| (bad date) | `مقاله‌های دارای پارامتر تاریخ نادرست در الگو` | must never appear |

`بخش بدون منبع` is itself `{{بدون منبع|بخش|name=بخش بدون منبع}}`.

### 12.3 Redirects (live, ۱۰ اکتبر ۲۰۲۶)

The full lists are in `docs/data/task-15/template-survey.json`. The bot resolves them live
at the start of a run (`list=backlinks&blfilterredir=redirects&blnamespace=10`) rather than
relying on this list.
- **بدون منبع** (11): درخواست یادکرد منبع, ذکر منبع, بدون مرجع, نیاز به منبع, بی منبع,
  درخواست یادکرد منابع, منبع کم, Unreferenced, بی‌منبع, منبع, فاقد منبع.
- **پک** → `پانویس کوتاه‌شده`.
- **in-use** `ویرایش` ← در دست ویرایش, In use, در حال تکمیل, …
- **under construction** `در دست ساخت` ← Under construction.
- **speedy** `حذف سریع` ← حس, Delete, Db, SD, …
- **AfD** `نظرخواهی برای حذف` ← پیشنهاد حذف, Afd, نبح.
- **short description** `توصیف کوتاه` ← Short description, شرح مختصر.
- **protection** `حص` ← محافظت, Pp*.
- **dab** `ابهام‌زدایی` ← Disambig, Dab, رفع ابهام, … `pageprops.disambiguation` is
  preferred.
- `بهبود منبع بخش` ← More citations needed section; `بخش بدون منبع زنده` ← BLP unsourced
  section.
- **Do not exist on fa:** `کوتاه‌نوشت`, `کنترل مرجعیت`, `ح`, `چند مشکل`, any article
  dead-link banner.

### 12.4 Data files

- `random-2000.json`: per-page features for the 2,000-article random sample (§2.2), using
  the field names of `classify.py`: `refs`, `refs_real`, `refs_ykw_only`, `ykw`,
  `cite_outside`, `sfn`, `http`, `genref_lines`, `isbn`, `fa_words`, `blp`, `tags`,
  `infobox`, `big_unsourced_secs`, `latin_secs`. These make good regression fixtures: the
  TypeScript detector should agree with the `strict` classification here.
- `strict-unsourced-rendered.json`: the render check of the 212 STRICT pages, with
  `rendered_refs`, `ext`, `src_ext`.
- `template-survey.json`: use counts and redirect lists for every template involved.

## 13. Trial log

One entry per live run: date, `--limit`, edits made, kinds (add / remove / tier),
refusals by reason, bugs found and fixed.

### Build, ۱۲ اکتبر ۲۰۲۶ (dry runs only)

`npm test` passed all 29 suites, the bundler checks passed, and `source-detect.replay.ts`
passed on 1,988 of the 2,000 measured pages (12 had been edited since the fixture was taken
and are skipped by timestamp).

The build found four defects, none of which would have raised an error:

1. **JavaScript's `\b` only understands ASCII**, so `/^یادکرد\b/`, `/\bشابک\b/`,
   `/^فهرست\b/` and `=بخش\b` match nothing in Persian, while the Python prototype they came
   from matched correctly. The first made every Persian citation template invisible, so a
   fully sourced article read as having no sources and would have got a false
   {{بدون منبع}}. It came up three times in this task. Check for `\b` next to a Persian
   literal in any regex here.
2. **`id="cite_note-` counts zero on every page.** MediaWiki escapes the underscore in id
   attributes, so the real markup is `id="cite&#95;note-1"`. «جنگ کره» renders 46
   references and matched none. Removals were only refused because of it, but on the add
   path it turned off the render's check for references the wikitext scan missed, while
   the external-link half kept working and made the check look alive.
   `countRenderedRefs()` now decodes first.
3. **A `<ref>` whose body is `<nowiki>`-escaped was read as empty**, losing a real source.
   «پری» cites `<ref><nowiki>https://sid.ir/…</nowiki></ref>`. The detector now keeps two
   views of the text of the same length: tags are found in the view with escaped text
   blanked, so `<nowiki><ref>…</ref></nowiki>` correctly cites nothing, and bodies are read
   from the view with only comments blanked. `refs_real` feeds the §3.3/§3.4 thresholds, so
   an undercount there would put a wrong {{بهبود منبع}} on a properly cited article.
4. **Date pages are not just bare numbers.** The first dry run proposed tagging «۴ تیر» and
   «سده پنجم (میلادی)». HujiBot وظیفهٔ ۷ removed this banner from date pages, so adding it
   back would reverse a community decision. Day, month, century, decade and millennium
   forms are now all excluded. The ordinal requirement keeps real places such as «سده
   لنجان» out.

The port differs from the prototype on purpose in a few places, each checked page by page:
the prototype counted see-also wikilinks as general references, counted citation templates
inside `<ref>` a second time as "outside", missed a `{{شابک}}` inside a ref body, and used a
case-sensitive URL regex that missed `Http://`. The replay compares the decision (no page
may be called unsourced that the prototype called sourced), not the intermediate counts.

### Run 1: ۱۲ اکتبر ۲۰۲۶, `--as-me --live --limit 10`

8 edits: **5 adds** ({{بدون منبع}}: مس سرچشمه، زمان استاندارد هند، ساعت رسمی پاکستان،
کدهای پرواز، روستا (ایالات متحده آمریکا)) and **3 removals** (زبان تامیلی، نوگرایی، مولکول).
2 deferred for review.

One edit was wrong and I reverted it. «مولکول» had one reference, `{{یادکرد فرهنگستان}}`,
the Academy's approved-terms dictionary. That sources what the Persian word should be, not
anything the article says, so the article was still unsourced. The other two removals were
correct: «زبان تامیلی» has 12 sourcing references (Stein, Zvelebil, Ethnologue, Hart) and
«نوگرایی» has 18. All five adds were genuinely unsourced; four of them had only a
`{{یادکرد-ویکی}}`.

I fixed it with a rule: a reference that cites only the فرهنگستان word list, or only
another Wikipedia, does not source the article's content (the `*_sourcing` fields in
§12.1). On the measured sample, 421 of 1,987 pages that the prototype called sourced are
now strictly unsourced. The ones I sampled all had a `{{یادکرد-ویکی}}` holding an
`en.wikipedia.org` URL as their only «source». They don't change the live volume, because
the add query already has `-insource:"http"`, but they would if that filter were ever
dropped.

The fixtures found a second defect. `bannerCount` counted every template in the first 600
characters, so an article whose first sentence had two `<ref>{{یادکرد کتاب}}</ref>`
citations was read as having two maintenance banners and refused as "crowded". That was
12 of the first dry run's 22 refusals. It now counts only the run of templates at the
start (§4).

### Run 2: ۱۲ اکتبر ۲۰۲۶, `--as-me --live --limit 12`, after the fixes

**8 edits, all correct**, each checked. 2 removals («شوشتر», 40 sourcing references;
«حزب خلق اتریش», 2 `{{یادکرد وب}}` citing ISNA) and 6 adds, all genuinely unsourced; four
had only a `{{یادکرد-ویکی}}`. 1 deferred for review.

Both fixes show in the output: «سیاستمدار مستقل», refused as "banner crowding" in run 1,
was tagged correctly, and no فرهنگستان-only page was touched.

Trial total at this point: 16 edits, 1 wrong (reverted, cause fixed and covered by tests).

### Run 3: ۱۲ اکتبر ۲۰۲۶, `--as-me --live --limit 100`

**118 edits** (102 adds, 16 removals), which I asked for, bringing the trial to 134 edits.
I checked each one against the live wikitext.

| | adds | removals | wrong |
|---|---|---|---|
| runs 1–2, before the فرهنگستان fix | 11 | 5 | 1 («مولکول», reverted) |
| runs 3, after it | 102 | 16 | **17, see below** |

**Hijri day pages.** fa has day pages in three calendars and `DATE_PAGE` covered only two,
so «۱ محرم», «۲۷ رمضان», «۱۶ شعبان» and 14 others were tagged. §3.1 excludes date pages
because HujiBot وظیفهٔ ۷ removed this banner from them. I reverted all 17 with
`scripts/archive/task15-revert-hijri-date-tags.py`, which refuses any page whose top line
is no longer the banner it added, and added the months to the rule and the tests. Unit
tests could not have caught this: the title pattern is the only thing that marks a date
page, and I had listed two calendars out of three.

Everything else was right. The 113 adds were checked against the rebuilt source features:
none were wrongly called unsourced. Of the 21 removals, only the already-reverted
«مولکول» was wrong. In the renders I checked there were no errors, and no page landed in
`رده:مقاله‌های دارای پارامتر تاریخ نادرست در الگو`, so the undated banners behaved as
decision 7 intended. The report page had 23 items in three kinds (ناسازگاری متن و نمایش
۲۰، شلوغی بنر ۲، یک منبع ۱).

«چه کسی یهودی است؟» looked like a sourced page tagged by mistake, but the edit was
`{{بهبود منبع}}`, a §3.3 tier tag, where 3 sources for 2,318 words is the reason for the
tag. The audit script had only stripped `{{بدون منبع}}` and judged it by the wrong rule.

### Pacing, measured ۱۲ اکتبر ۲۰۲۶

I wanted 4 edits a minute for the trial. `PACE_LO` / `PACE_HI` (seconds) override my
account's 30–120 s range for one run; with neither set, the default applies. The default
is there so that edits from my account look like a person's, and since it is my account,
relaxing it is my decision
(`lessons/api-and-permissions/pacing-is-the-users-call-not-a-constant.md`).

The setting is the sleep, not the time between edits. `PACE_LO=12 PACE_HI=18` measured
**2.5 edits/min**, with gaps of 21–32 s, because each edit also takes about 9 s of API
work: the pre-save render, `verify`'s own `action=parse`, the stop-page check before every
write, and the check after saving. For 4/min, set `PACE_LO=4 PACE_HI=8`.

`Mamouri` does not have `noratelimit`, so a faster pace can still hit a server-side
throttle. Core sleeps and retries on `ratelimited`, so that costs a pause, not an edit.

**`getTargets` takes about 20 minutes before the first edit** at `--limit 100`, because it
renders candidates until it has enough. So restarting a run to change the pace is usually
slower than letting it finish. A frozen candidate list on disk, as وظیفهٔ ۱۴ keeps, would
remove that wait.
