# وظیفهٔ ۱۵: source maintenance banners (add, and remove when stale)

> **Status (۱۰ اکتبر ۲۰۲۶): plan approved by the operator, ready to build. No code yet,
> no edits made, nothing filed.**
>
> **Start with §0 (handover).** It lists every decision the operator made and the build
> steps in order. §1–§2 are the research behind those decisions. §3–§6 are the rules,
> already updated to match the decisions. §12 records how the source detector worked in
> the research prototype.

| | |
|---|---|
| Code (to write) | `src/tasks/task-15/source-tags.ts` (+ `.test.ts`) |
| Task id | `source-tags` |
| Task number | **۱۵** (confirmed by the operator) |
| Measurements | `docs/data/task-15/random-2000.json`, `strict-unsourced-rendered.json`, `template-survey.json` |
| Measurement scripts | `archive/task-15-research/` is git-ignored and exists only on the operator's machine. §12 records the logic, so the build does not depend on those scripts. |
| Measured on | ۱۰ اکتبر ۲۰۲۶ (2026-10-10). ns0 has 1,096,839 articles. |

## 0. Handover: decisions and what to build

### 0.1 The request
The operator asked for a bot that adds these banners at the top of fa articles, only
when it is confident: بدون منبع, بهبود منبع, بخش بدون منبع, بدون منبع زنده, منبع زنده,
یک منبع, اصلاح ترجمه, گسترش از زبان. The constraints:
- Follow each template's own documented criteria.
- `{{یادکرد-ویکی}}` is **not** a source.
- Bailing out on doubt is fine. The result must not look like spam.

### 0.2 Decisions (the operator's answers to the old §9, ۱۰ اکتبر ۲۰۲۶)

| # | Question | Decision |
|---|---|---|
| 1 | Task number | **۱۵** |
| 2 | بدون منبع زنده | Use it in its real sense (a BLP with no sources). It is **optional**: «we don't need to do it if it is too much work or we are not confident about it». |
| 3 | Scope / phases | **No phases.** «Let's do everything at once. We test and we update regularly.» Every tag the plan allows to be placed, ships in one task (§3). |
| 4 | 371 BLPs already tagged with plain بدون منبع | **Leave them alone.** No swap to بدون منبع زنده. |
| 5 | Iranian آبادی articles | **Exclude.** Skip any page carrying `{{جعبه اطلاعات روستای ایران}}` (55,680 pages). |
| 6 | گسترش از زبان | **Dropped.** Not in this task. |
| 7 | Date parameter | Write the date **only if the monthly category exists**. Otherwise write no date. Never create the categories. |
| 8 | Consensus / BRFA | **No قهوه‌خانه thread and no BRFA for now.** Build it, run it under the operator's own account (`--as-me`) for a while, fix bugs, then decide. Do not draft or post anything on-wiki about the task. |
| 9 | Pilot | About **1000 edits** under `--as-me`, built up gradually and paced like a human (`--as-me` already gives the 30–120 s random pause). |
| 10 | Thresholds | Starting values accepted (§3.3–§3.4). |
| — | Stale tags | **In scope, same task.** Remove بدون منبع / بدون منبع زنده from articles that now have real refs (§3.9). |
| — | Dead links | Dropped (no fa banner exists, §1.4). |

**Still unconfirmed:** whether "everything at once" also means *tagging* یک منبع, بخش
بدون منبع and اصلاح ترجمه. The plan keeps them **report-only** (§3.5–§3.7). Ask the
operator before turning any of them into tags. Do not infer it.

### 0.3 What the task does, in one list
1. **Add `{{بدون منبع}}`**: zero sources of any kind, in both the wikitext and the
   render (§3.0, §3.1).
2. **Add `{{بدون منبع زنده}}`** (optional, decision 2): the same test on a page in
   `رده:افراد زنده` (§3.2). If it adds risk or work, skip it and leave BLPs untouched.
3. **Add `{{بهبود منبع}}`**, narrow tier (§3.3).
4. **Add `{{منبع زنده}}`**, narrow tier (§3.4).
5. **Remove stale `{{بدون منبع}}` / `{{بدون منبع زنده}}`** (§3.9).
6. **Report only:** یک منبع, بخش بدون منبع, اصلاح ترجمه candidates; pages refused for
   banner crowding (§4); anything doubtful. The report goes to
   `کاربر:MamouriBot/وظیفه ۱۵/گزارش`.

### 0.4 Build steps, in order
1. Read `docs/BUILDING-A-TASK.md` and `src/core.ts`: the `BotTask` interface, `Bot`,
   `--as-me`, and the `prepare`/`verify`/`report` hooks. Copy patterns from:
   - `src/tasks/task-14/population-box.ts`: template insertion, `findTemplate`,
     `reportWikitext`, the gate-delta check in `verify`.
   - `src/tasks/task-10/destub.ts` and `destub-classify.ts`: the exported
     `extractProse`/`countWords` (Persian prose words), and the
     parse-and-check-categories pattern in `verify`.
2. Write `src/tasks/task-15/source-tags.ts` (`id: 'source-tags'`, `taskNumber: 15`):
   - **`getTargets`** enumerates with CirrusSearch (§0.5). Cap the walk from
     `bot.opts.limit`, as tasks 12 and 13 do, and accept `TARGET_TITLES` /
     `TARGET_FILE` / `TARGET_CAP` env selectors as they do. `transform` must be pure
     and synchronous, so do every network check here, cached per title:
     - the render (`action=parse`, `prop=text|externallinks|categories`),
     - `pageprops` (dab), `revisions` (last edit time), categories,
     - monthly-category existence (§5).
   - **`transform`**: insert, merge into `{{مشکلات متعدد}}`, or remove the stale tag.
     Otherwise refuse, with a reason.
   - **`verify`** (before save): see §11.
   - **`report`**: write the report page.
3. Write `source-tags.test.ts`, offline (fixtures listed in §11).
4. Register the task in `src/run.ts` `TASKS`.
5. Run `npm test` and `npm run typecheck`. `npm test` also checks that the vendored
   `src/lib/` files still match the parent repo's `scripts/lib/`.
6. Dry run: `npx tsx src/run.ts source-tags --limit 20`. Read **every** diff, then
   repeat with ~200.
7. Live under the operator's account:
   `npx tsx src/run.ts source-tags --as-me --live --limit N`. Start small (10, then 50,
   then 100s) and audit the diffs and renders between runs, up to ~1000 edits in total.
   Fix bugs as they show up. Keep a short trial log in this doc (§13).
8. Do not commit unless asked. When you do commit, commit in `bots/` first, then bump
   the submodule pointer in the parent repo. Stage explicit paths only.

### 0.5 Target queries (counts from ۱۰ اکتبر ۲۰۲۶)
- **Add, unsourced:** `-insource:"<ref" -insource:"http" -hastemplate:"بدون منبع"
  -hastemplate:"جعبه اطلاعات روستای ایران"`, minus dabs, gives **231,803**.
  - That includes یادکرد-ویکی-only pages, which is intended (§1.9).
  - The prefilter is only a candidate source. Every page still goes through the full
    §3.0 test and the render check. After that, about 99k pass (§2.2).
- **Add, narrow tiers:** prefilter by size. ≥300 prose words means roughly ≥3.8 KB, and
  ≥800 words roughly ≥9.3 KB. Use `insource:"<ref"` plus a size floor, then count refs
  locally.
  - Avoid regex repetition such as `insource:/(<ref.*){4}/`. CirrusSearch returns
    `cirrussearch-regex-syntax-error`.
- **Remove, stale:** `hastemplate:"بدون منبع" insource:"<ref"` gives **2,152**.
  `hastemplate:"بدون منبع زنده" insource:"<ref"` gives **8**.
- **Enumeration limits:** CirrusSearch hard-errors past offset 10,000
  (`cirrussearch-offset-too-large`; see task 3's frozen list). For a large walk, slice
  the query (e.g. `prefix:` by first letter, or by `incategory:`). Alternatively,
  harvest a frozen list once, shuffle it with a fixed seed, and feed it with
  `TARGET_FILE`.
- **Rate limits:** heavy reads hit HTTP 429. Honour `Retry-After`. Core's GET gate is
  1.2 s.

---

## 0b. Research summary

1. **Two of the eight requested templates do not do what the request assumes.**
   - **بدون منبع زنده is not a dead-link banner.** It is fa's copy of en
     `{{BLP unreferenced}}`: a living person's biography with **no sources at all**. fa
     has no article-level dead-link banner (§1.4).
   - **گسترش از زبان does not mean "contains English".** It means "a longer article
     exists in another language, so translate more of it". fa also says never to use it
     directly; you must use a language wrapper (§1.8).
2. **The real population is enormous, and most of it is sub-stubs.** About 11% of
   articles have nothing citation-like at all. After a render check, 9.1% (about
   99,000) are cleanly unsourced. 31% have exactly one source (about 345,000). Applying the templates as literally requested would tag
   hundreds of thousands of pages. That is the spam outcome the request rules out.
3. **Only two templates have a test a bot can decide with confidence:** بدون منبع and
   بدون منبع زنده. Both require "no source of any kind", which is checkable. The other
   templates turn on "too few", "big" or "untranslated". The docs leave those to editor
   judgement, so the bot can apply them only under conditions narrow enough to be
   uncontroversial (§3).
4. **Untranslated text is rare.** In 2,000 random articles, with templates and
   galleries stripped, the count is **zero**. The candidates a detector finds are mostly
   airline-destination tables, bibliographies and song lyrics, which are correctly left
   in the original language. A bot should report candidates, not tag them (§3.7).
5. **Dated tags will mis-categorise themselves this month** unless the bot checks
   first (§5).
6. **At this scale, a village-pump consensus is very likely needed before a BRFA**
   (§8). The operator has deferred that question until after the `--as-me` trial
   (decision 8).

---

## 1. What each template actually means

All sources and /توضیحات were fetched on 2026-10-10, along with the en equivalents. The
criteria below are quoted or paraphrased from those docs. Redirect lists are in
`docs/data/task-15/template-survey.json`.

### 1.1 `{{بدون منبع}}` ← en `{{Unreferenced}}`
- **Use only when the article has no citations or references of any kind.**
- The en doc rules it out if there is even one general reference, bare URL or footnote.
  Sources listed under «پیوند به بیرون» can count as references.
- When sources are listed but there are no inline citations, the right tag is
  `{{بدون پانویس}}`, not this one.
- Params: `تاریخ`/`date`. The template self-substs (`#درخواست:Unsubst`) and stamps a date.
- Category: `مقاله‌های بدون منبع` (dated monthly subcategories).
- Placement: top of the article.
- 11 redirects, including `{{منبع}}`, `{{بی‌منبع}}` and `{{Unreferenced}}`.
- **Trap:** `{{منبع|بخش}}` is a legacy section use of the same template. In a sample of
  40 tagged pages, 14 were section uses.
- Live: 5,783 articles. 2,152 of those now contain `<ref`, i.e. stale tags. Removing
  them is **in scope** (§3.9).

### 1.2 `{{بهبود منبع}}` ← en `{{More citations needed}}`
- **Use only when there are some citations, but too few.**
- The fa doc notes that some editors think it is unnecessary on stubs.
- The en doc says to use `{{منبع زنده}}` instead on BLPs.
- Category: `مقاله‌های نیازمند ارجاع‌های اضافی`.
- Live: 6,913.
- 10 redirects, including `{{Refimprove}}` and `{{Verify}}`.

### 1.3 `{{بخش بدون منبع}}` ← en `{{Unreferenced section}}`
- **Use only when the section has no references at all.** For sections with some but too
  few, use `{{بهبود منبع بخش}}`.
- **It goes at the top of the section, not the top of the article.** The request asked
  for top-of-article placement, which does not apply to this template (§4).
- Live: 459.

### 1.4 `{{بدون منبع زنده}}` ← en `{{BLP unreferenced}}`: **not dead links**
- Banner text: «زندگی‌نامهٔ فرد زنده … دربرگیرنده هیچ مرجع یا منبعی نیست». It adds that
  unsourced material about living people «باید به‌سرعت حذف شوند».
- Categories: `زندگی‌نامه زندگان بدون منبع` and `همه مقاله‌های زندگی‌نامه زندگان بدون منبع‏‏`.
  The second contains a stray U+200F. This is harmless to transclusion, but a bot
  that checks category membership by exact name must allow for it.
- The en doc says pages that warrant deletion should get `{{prod blp}}` instead.
- Live: **only 19 uses**, against 371 BLPs tagged with plain بدون منبع. On fa, editors put
  plain بدون منبع on unsourced BLPs, so this template is effectively unused.
- Section variant: `{{بخش بدون منبع زنده}}`.
- **Dead links:** `{{پیوند مرده}}` is the inline marker after a single URL. No banner
  exists: پیوندهای مرده, Dead links and Cleanup link rot are all missing on fa. Checking
  that external URLs are alive is a different task, and a much heavier one (HTTP to
  thousands of third-party hosts, archive lookups, false deaths from bot-blocking). It
  is dropped (decision 2).

### 1.5 `{{منبع زنده}}` ← en `{{BLP sources}}`
- A living-person biography that **needs more** references. It **must not** be used on
  unsourced BLPs; those take `{{بدون منبع زنده}}`.
- The en doc says to consider not adding it to very short articles.
- Live: 102.

### 1.6 `{{یک منبع}}` ← en `{{One source}}`
- The article relies largely or entirely on one source. The doc says that is **not a
  policy violation**.
- The en doc says to consider not adding it:
  - to stubs,
  - to articles that are being actively expanded,
  - where there is no apparent problem.
- `{{BLP one source}}` does not exist on fa.
- Live: 239.

### 1.7 `{{اصلاح ترجمه}}` ← en `{{Not English}}`
- Text written in a non-Persian language. Param 1 is the language; param 2 = `بخش` for
  section use. 15 redirects.
- **Heavy tag.** Unless `listed=yes`/`فهرست‌شده`, the banner:
  - tells the reader the page will be **nominated for deletion within two weeks**,
  - asks the tagger to list it at `ویکی‌پدیا:صفحه‌های نیازمند ترجمه به فارسی` via
    `{{اعلان صنت}}`.

  A bot that tags without listing leaves a false threat. A bot that lists also creates
  a public queue entry per page.
- Live: 1,290.

### 1.8 `{{گسترش از زبان}}` ← en `{{Expand language}}`
- Meaning: «این مقاله را می‌توان با ترجمهٔ مقالهٔ متناظر در ویکی‌پدیای X گسترش داد». It is
  an **expansion invitation**. It **does not** mean the page contains untranslated text.
- **Do not use it directly.** Use the wrappers instead, e.g. `{{گسترش از زبان انگلیسی}}`
  (750 uses), عربی, فرانسوی or آلمانی. Params: `1`/`مقاله دیگر`, `تاریخ`.
- Wrapper total: 1,160.
- **Mapping the request onto the templates:** "many English sections" calls for اصلاح
  ترجمه, not this. This template would fit a different job: a short fa article whose en
  interwiki is many times longer (§3.8; dropped, decision 6).

### 1.9 `{{یادکرد-ویکی}}`: not a source
- Its own TemplateData says using it in place of the original sources is wrong.
- It adds `رده:مقاله‌های دارای الگوی یادکرد-ویکی` (502,966 pages).
- **Rule for this task:** a `<ref>` whose only content is یادکرد-ویکی (or its four
  redirects, or `Cite wikipedia`) counts as **zero** sources. The same applies to a bare
  یادکرد-ویکی outside any ref.
- **Consequence:** an article whose only "source" is the en.wiki page it was translated
  from **is unsourced** for بدون منبع. This is the crux of the task, and also where most
  of the volume comes from (§2).

### 1.10 `{{مشکلات متعدد}}`
- The multiple-issues wrapper (`چند مشکل` does not exist).
- Existing usage wraps only a handful of these tags: 1, 4 and 8 of 40 sampled pages for
  بهبود منبع, منبع زنده and یک منبع.

---

## 2. Measured population

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

Drawn with `list=random` (non-redirect, ns0); 33 were dabs, which leaves **1,967**.
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
- Persian prose (lead + body, templates and tables stripped) has a **median of about 24
  words**. 19 in 20 are under about 130 words.
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
  link, which rules out بدون منبع. The safe rule is to **refuse any page whose render has
  a non-authority external link**.
- That leaves **181 of 2,000 = 9.1% ≈ 99k articles**.
  - 35 are BLPs, about 19k wiki-wide.
  - 148 cite only en.wiki (یادکرد-ویکی).
- The 31 refused pages are 15% of the STRICT group. That is the margin the render check
  buys.

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

**Big unsourced sections:** 18 articles had a non-references section of ≥250 Persian
words with no `<ref>`/پک in it, in an article that does have refs. 5 of those sections
are plot summaries (داستان / خلاصه داستان), which by convention are sourced to the work
itself. That leaves **13 (0.66%, ≈7k)**. Examples:
- توپ (جنگ‌افزار): «پیشینه», 503 words
- آرتور شوپنهاور: «تحصیلات», 888 words
- نیروی هوایی لهستان: «دهه ۱۹۳۰» and «جنگ سرد»

### 2.3 Untranslated text

- **Random sample: 0 of 1,967.** The count is for content sections where Latin words are
  ≥40 and outnumber Persian words, measured after stripping templates at any depth,
  `<gallery>`, math, tables and list lines.
- A first, naive pass found 45 cases. All of them were infobox parameters (drugbox IUPAC
  names, `official_name`) or gallery captions. **A template-unaware detector is wrong
  every time.**
- **Targeted search:** `insource:/\. The [a-z]+ … /` without اصلاح ترجمه gives 1,807
  articles. The same detector flags **49** of them. Reading the list, most are correct
  to leave in English:
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
- **Conclusion:** genuine cases number in the low hundreds wiki-wide, and the detector's
  precision is around 15–20%. That is not good enough for a bot to place a tag that
  threatens deletion.

---

## 3. Per-template rules

The principle throughout is **asymmetric refusal**, as in وظیفهٔ ۱۰:
- the bot tags only when every test passes,
- every doubtful page goes to the report page for a human,
- a missed page costs nothing; a wrong tag costs trust in the bot.

### 3.0 Shared: what counts as a source

Count a **source** for each of:
1. a `<ref>…</ref>` whose body contains anything other than یادکرد-ویکی / `Cite wikipedia`
   and whitespace. A named reuse `<ref name=x/>` is not a new source.
2. `{{پک}}`/`{{sfn}}`/`{{harv*}}`/`{{یادکرد پک}}`, plus every redirect resolved from the
   live redirect list.
3. a citation template (`یادکرد *`, `cite *`, `citation`) **outside** `<ref>`, other than
   یادکرد-ویکی.
4. **general references**: any non-empty bulleted line under a references-type heading
   (منابع, پانویس, کتاب‌شناسی, کتابنامه, برای مطالعهٔ بیشتر, پیوند به بیرون, …,
   en equivalents). Exception: a line whose only content is یادکرد-ویکی.
5. any external URL, in the wikitext **or in the render**, that is not a
   wiki/authority-control host. This includes an infobox `website`.
6. an ISBN / شابک.

**Before deciding, render the page.** Templates can emit refs and links. Infoboxes pull
Wikidata references, some navboxes add footnotes, and authority-control templates emit URLs.
The rendered HTML must agree that there are **zero** `cite_note-` anchors and no
non-authority external links. If the wikitext and the render disagree, refuse.

### 3.1 بدون منبع: **tag**

Tag when all of these hold:
- §3.0 source count = 0 in both wikitext and render.
- Not a dab (`pageprops.disambiguation`), not a list (`فهرست*`), not a year/date page.
  HujiBot وظیفه ۷ *removed* بدون منبع from date pages, so that consensus is explicit.
- Not a redirect, not a set-index, not a soft redirect.
- No source/verification banner already present. Check every redirect of: بدون منبع,
  بدون منبع زنده, بهبود منبع, منبع زنده, یک منبع, بدون پانویس, مدرک (8,765 uses),
  and the same names inside `{{مشکلات متعدد}}`.
- Not a BLP. BLPs go to §3.2 instead. If §3.2 is not built, skip BLPs.
- Not an Iranian village: no `{{جعبه اطلاعات روستای ایران}}` (decision 5).
- The render has no non-authority external link (§3.0 item 5).
- Not edited in the last 7 days. This follows the en "actively expanded" caution and
  avoids hitting new articles mid-creation.
- Not `{{nobots}}`/`{{bots|deny}}`. `core.ts` already handles this.

**Prose floor: none.** "No sources" is binary, and a 20-word unsourced stub is as
unsourced as a 2,000-word one. That makes the volume about 99k after the render check,
so §7 is where the spam question gets answered.

### 3.2 بدون منبع زنده: **tag (optional, decision 2)**

- Same test as §3.1, plus `رده:افراد زنده` on the page.
- That category is set by humans or by `{{جعبه اطلاعات شخص}}` logic. It is the
  authoritative BLP marker on fa.
- If the page already has plain `{{بدون منبع}}`, **do not** swap it (decision 4: leave
  the 371 alone). Do not list them on the report either.
- About 19k candidates wiki-wide by extrapolation (35 of the 181 that pass the render check).

### 3.3 بهبود منبع: **narrow tag** (thresholds accepted, decision 10)

The "too few" test is editorial judgement, so the bot needs a rule far from the margin:
- ≥ **800** Persian prose words **and** ≤ **2** real sources; or
- ≥ **2,000** words **and** ≤ **3** sources.

Beyond that:
- Not a BLP (use §3.4 instead).
- Not when the page already has §3.1–§3.6 tags.

In the sample this matches 4 pages (≈2k wiki-wide). The density rule is not in the
template doc. It is an operating choice, and it must be stated as one in the BRFA.

### 3.4 منبع زنده: **narrow tag** (thresholds accepted, decision 10)
- BLP, 1–2 real sources, ≥ **300** Persian prose words. That is 2 in the sample (≈1k).
- Never with 0 sources (that is §3.2).

### 3.5 یک منبع: **report only (recommended)**, or a very narrow tag
- Exactly one real source, ≥ **300** words, and the source is not the article's own
  subject site. That is 13 in the sample (≈7k).
- The doc itself calls it "not a policy violation" and advises against stubs, so a bot
  campaign looks like exactly the drive-by tagging the doc warns about.
- Recommendation: list candidates on the report page and do not tag.

### 3.6 بخش بدون منبع: **report only (recommended)**
- Section ≥250 words, zero refs inside it, the article has refs elsewhere, the heading
  is not a plot/synopsis/references/gallery/discography/works list, and the section is
  not the lead. That is ≈7k pages.
- The tag goes at the top of the section, not the top of the article.
- Why report only:
  - A section can be sourced by the next section's citation, or by a general reference.
  - Heading semantics (plot, works, discography) need a curated exclusion list that
    will always be incomplete.

### 3.7 اصلاح ترجمه: **report only**
- Precision is about 15–20% (§2.3), and the banner threatens deletion. A bot must not
  place it.
- The report lists candidate sections with Latin/Persian word counts, for a human to
  judge.

### 3.8 گسترش از زبان: **dropped (decision 6)**
- The request's intent ("many English sections") is اصلاح ترجمه, not this.
- A size-ratio job ("fa is under 10% of the en article") would be a separate task.
  Size ratio is a weak signal, and the tag is a soft invitation that editors often
  find noisy.

### 3.9 Remove stale بدون منبع / بدون منبع زنده: **edit**
- **Targets:** `hastemplate:"بدون منبع" insource:"<ref"` (2,152) and
  `hastemplate:"بدون منبع زنده" insource:"<ref"` (8).
- **Remove only when all of these hold:**
  - The page has **at least one real source** under §3.0: a `<ref>` that is not
    یادکرد-ویکی-only, a sfn/پک, or a citation template. Matches inside `<!-- -->`,
    `<nowiki>` and `<pre>` do not count.
  - The render agrees: it has ≥1 `cite_note-`.
  - The tag is the **article-level** use. Skip the section forms `{{منبع|بخش}}` and
    `{{بدون منبع|بخش}}` (any positional `بخش`/`section`), and
    `{{بدون منبع|...|name=بخش بدون منبع}}`. These were 14 of 40 sampled tagged pages.
  - Not on a page edited in the last 7 days. Someone may be mid-cleanup.
- **The edit:**
  - If the tag stands alone, delete it with its trailing newline.
  - If it is inside `{{مشکلات متعدد}}`, delete that line. If only one banner is then
    left inside the wrapper, leave the wrapper as it is: unwrapping is a judgement
    edit, so the page goes on the report instead.
  - Never touch anything else.
- **Do not downgrade.** Replacing the tag with بهبود منبع or یک منبع is a judgement
  call. If the page would qualify for §3.3/§3.4, add that banner in the same edit,
  under §3.3/§3.4's own rules. Otherwise remove the tag and do nothing more.
- **Summary:** `حذف الگوی {{بدون منبع}}: مقاله اکنون منبع دارد`.
- **verify:** the page leaves `مقاله‌های بدون منبع` (and its dated subcategory), and the
  gate shows no new problems.

---

## 4. Placement

- **Article-level banners** (§3.1–§3.5) go at the top of the article, after the
  top-of-page furniture. That furniture is:
  - hatnotes (`{{تغییرمسیر}}`, `{{دیگر کاربردها}}`, `{{برای}}`, …),
  - `{{DISPLAYTITLE}}`, `{{عنوان مقاله}}`, `{{توصیف کوتاه}}` (and its redirects
    Short description, شرح مختصر),
  - protection icons (`{{حص}}` and its redirects محافظت, Pp*).
  - `{{کوتاه‌نوشت}}` does not exist on fa, so ignore it.

  Banners go **before** the infobox. That is how existing tagged pages look in the
  40-page samples, and what en MOS:ORDER specifies.
- **Merge into an existing `{{مشکلات متعدد}}`** if the page has one; add a line inside
  it rather than a second banner above it.
- If the page already has **two or more** other maintenance banners, the bot does not
  add a third standalone. Report it instead; wrapping is a judgement edit.
- **Refuse outright** on pages carrying in-use, under-construction, speedy-deletion or
  AfD templates. The redirect lists are in §12.3.
- **Section banners** (§3.6, report-only): if they are ever enabled, they go on the
  first line under the heading.
- Insertion is pure text with one newline after the template. No other whitespace
  changes, as in وظیفهٔ ۱۴.

## 5. The date parameter

- Banners carry `تاریخ=<ماه میلادی به فارسی> <سال>` with Persian digits, e.g.
  `{{بدون منبع|تاریخ=اکتبر ۲۰۲۶}}`. That is what `{{جا:بدون منبع}}` produces (its
  PST output uses `date=`; either name works).
- Month names: ژانویه فوریه مارس آوریل مه ژوئن ژوئیه اوت سپتامبر اکتبر نوامبر دسامبر.
- **Trap:** `پودمان:Message box` builds the dated category as `<cat> از <date>` and
  checks whether that `رده:` page exists, e.g. `رده:مقاله‌های بدون منبع از اکتبر ۲۰۲۶`.
  If it does not, the module adds the page to
  `رده:مقاله‌های دارای پارامتر تاریخ نادرست در الگو` (723 pages now).
- Those monthly categories are created **after the fact** by Jeeputer / «Jeeputer's Cat».
  On 2026-10-10 they existed up to about ژوئیه ۲۰۲۶; September and October 2026 did not.
- **Decided (decision 7):** in `getTargets`, check the monthly category each banner
  would use (cache it once per run):
  - If it exists, write the date.
  - If not, **write no date**. The page is still categorised under the undated parent,
    and Jeeputer's normal date-fixing pass dates it later.
  - Never create the categories.

## 6. Edit summary

The run is under `--as-me`, so there is **no BRFA link prefix**; core handles this
already. If the task later runs as MamouriBot, the prefix becomes
`withBrfaLink(15, …)`. Body, per template, is first-person content-only Persian. Never
mention a bot, a script or automation (parent `AGENTS.md`).

- `افزودن الگوی {{بدون منبع}}: مقاله هیچ منبعی ندارد (یادکرد-ویکی منبع به‌شمار نمی‌آید)`
- `افزودن الگوی {{بدون منبع زنده}}: زندگی‌نامهٔ فرد زنده بدون منبع`
- `حذف الگوی {{بدون منبع}}: مقاله اکنون منبع دارد`

For the narrow tiers, the summary states the measured numbers, e.g. «… ۲ منبع برای
۱٬۲۰۰ واژه». An editor who disagrees can see the rule and argue with the rule, not with
the bot.

## 7. Scale and running (decision 3: no phases)

- Everything in §0.3 ships together. Volume is controlled by `--limit`, not by phases.
- **Trial:** about 1000 edits under `--as-me`, built up gradually: 10, then 50, then a
  few hundred at a time. Audit the diffs **and the renders** between runs. Mix topics
  rather than walking one category. Shuffle the targets so a run is not 50 footballers
  in a row, which looks like a bot.
- After the trial, the operator decides about the قهوه‌خانه thread and the BRFA (§8).
- Full-scale numbers for later: about 99k بدون منبع, ~19k بدون منبع زنده (included in
  the 99k), ~3k narrow tiers, ~2.1k removals.
- Watchlist flooding is the main social cost of the full run.

**Iranian village articles: excluded (decision 5).** Many آبادی stubs cite only en.wiki
(قهوه‌خانه/اجرایی/بایگانی ۵۸, 2025). In that thread, Huji suggested *deleting* them
after checking census data, and وظیفهٔ ۱۴ is adding a census box sourced through
Wikidata to the same pages. Skip every page with `{{جعبه اطلاعات روستای ایران}}`.

## 8. Consensus and the permission request: **deferred (decision 8)**

Do nothing on-wiki about this for now. This section is background for when the
operator decides.
- No fa bot has added these tags before. The only related bot task, HujiBot وظیفه ۷,
  removed them.
- The 2019 thread (قهوه‌خانه/گوناگون/بایگانی ۸۷) contains editors *asking* for
  یادکرد-ویکی-only articles to be found by query and tagged. That supports this task,
  but the thread is old.
- At full scale, about 99k banners will change what one in eleven articles looks like.
  A BRFA reviewer is likely to ask for a قهوه‌خانه/اجرایی thread first, and the 2025
  village discussion shows the "en.wiki-only" question is contested.
- **If and when:**
  1. A short قهوه‌خانه post asking one question, with the measured number: should
     articles whose only source is the en.wiki page carry {{بدون منبع}}?
  2. The BRFA, linking the thread and the trial's numbers.
- Keep both short. Huji has asked for brevity, and the long messages are part of why
  the task 14 thread failed (`TODO.md` §7b).

## 9. Open questions

Answered ۱۰ اکتبر ۲۰۲۶; the answers are in §0.2. One question is still open:
- Should یک منبع / بخش بدون منبع / اصلاح ترجمه be **tagged**, or stay report-only?
  The plan says report-only. Ask the operator; do not infer it from "everything at once".

## 10. Out of scope

- گسترش از زبان (decision 6).
- Dead-link detection (§1.4).
- Swapping بدون منبع → بدون منبع زنده on the 371 BLPs (decision 4).
- Iranian آبادی articles (decision 5).

## 11. Verification design

- `transform` is pure:
  - it inserts one banner, or removes one stale tag, or refuses with a reason;
  - `verify` asserts the diff is exactly that one line, or the one line inside
    `{{مشکلات متعدد}}` when merging.
- **Pre-save render** (`action=parse` on the new text, as task 10's `verify` does):
  - **add:** the page gains the expected category (§12.2), allowing for the stray
    U+200F;
  - **remove:** the page loses `مقاله‌های بدون منبع` and its dated subcategory;
  - it is **not** in `مقاله‌های دارای پارامتر تاریخ نادرست در الگو`;
  - no new errors (`خطا`, `scribunto-error`, `class="error"`);
  - **add بدون منبع / بدون منبع زنده:** the render still shows 0 `cite_note-`. This
    guards against a ref that the wikitext parse missed;
  - gate delta: `checkWikitext` on the old and new text, and fail on any new problem
    (task 14 pattern).
- **Report page** `کاربر:MamouriBot/وظیفه ۱۵/گزارش`: per-reason refusal counts, the
  report-only lists for §3.5–§3.7, pages refused for banner crowding, and removals that
  left a single-item مشکلات متعدد.
- **Tests** (`source-tags.test.ts`, offline), with a fixture for each of:
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
  - date written vs omitted, depending on category existence.

## 12. Reference for the implementer

### 12.1 Source detection, as prototyped (`archive/task-15-research/classify.py`)

The prototype's logic, so a TypeScript port does not need the archive:
- **First strip** `<!-- … -->`. Template names are matched as
  `\{\{\s*([^{}|\n]+?)\s*(?:\||\}\})`, with `_` normalised to a space.
- **Refs:** `<ref[\s>]` counts openings. The bodies are
  `<ref(?:\s[^>]*)?>(.*?)</ref>` (dotall). A body is **یادکرد-ویکی-only** if it matches
  `یادکرد-ویکی|cite wikipedia` and contains neither `http` nor another
  `{{یادکرد …`/`{{cite …`. Real refs = bodies − ykw-only. A named reuse
  `<ref name=…/>` is not a source.
- **Citation templates outside refs:** names matching `^(یادکرد|cite|citation)`
  (case-insensitive), except یادکرد-ویکی / cite wikipedia.
- **sfn family:** `^(پک|sfn|harv)`; `{{پک}}` is a redirect to `پانویس کوتاه‌شده`.
- **URLs:** `https?://` anywhere.
- **ISBN:** `ISBN|شابک`.
- **Sections:** split on `^(==+)\s*(.+?)\s*\1\s*$`. A references-type heading matches
  `منابع|منبع|پانویس|یادداشت|کتاب‌?شناسی|کتابنامه|پیوند به بیرون|پیوندهای بیرونی|جستارهای وابسته|مطالعه بیشتر|برای مطالعه|ارجاع|References|Notes|Bibliography|External|Further|See also|Sources`.
  A **general reference** is a `^\*` line in such a section, longer than 15
  characters, that is not یادکرد-ویکی.
  - Note: `جستارهای وابسته` / See also is in that regex, but a see-also bullet is a
    wikilink, not a source. The port should require the line to hold something other
    than `[[…]]` links. Otherwise an internal see-also list would block a correct
    بدون منبع.
- **STRICT unsourced** = 0 `<ref`, 0 sfn, 0 cite templates outside refs, 0 URLs, 0
  general-ref lines, no ISBN, and not a `فهرست*` title.
- **Prose words:** use task 10's `extractProse`/`countWords`, not the prototype. The
  prototype stripped templates at any depth, galleries, math/poem/blockquote, refs,
  tables, file/category links and list lines, then counted `[\u0600-\u06FF\u200c]+`.
- **Render check** (`render_check.py`): `action=parse`, `prop=text|externallinks`.
  - Count `id="cite_note-` in the HTML.
  - Ignore external links whose host matches
    `wikidata.org|wikimedia.org|wikipedia.org|geohack|toolforge|wmflabs|viaf.org|d-nb.info|id.loc.gov|isni|orcid|worldcat.org/identities|idref|bnf.fr|catalogo.bne|nla.gov.au|snaccooperative|nkp.cz|nlg.gr|ndl.go.jp|nukat|kb.nl|nli.org|libris|trove|musicbrainz|openstreetmap|geonames`.
  - Also ignore the «یافتن منابع» search links (Google search etc.).
  - Any other link means refuse. The list was missing bibliotheken.nl, nsk.hr and
    kulturnav; refusing on those is safe, so extend the list only if it costs volume.

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

The full lists are in `docs/data/task-15/template-survey.json`. Resolve them live at run
start (`list=backlinks&blfilterredir=redirects&blnamespace=10`) rather than trusting
this table.
- **بدون منبع** (11): درخواست یادکرد منبع, ذکر منبع, بدون مرجع, نیاز به منبع, بی منبع,
  درخواست یادکرد منابع, منبع کم, Unreferenced, بی‌منبع, منبع, فاقد منبع.
- **پک** → `پانویس کوتاه‌شده`.
- **in-use** `ویرایش` ← در دست ویرایش, In use, در حال تکمیل, …
- **under construction** `در دست ساخت` ← Under construction.
- **speedy** `حذف سریع` ← حس, Delete, Db, SD, …
- **AfD** `نظرخواهی برای حذف` ← پیشنهاد حذف, Afd, نبح.
- **short description** `توصیف کوتاه` ← Short description, شرح مختصر.
- **protection** `حص` ← محافظت, Pp*.
- **dab** `ابهام‌زدایی` ← Disambig, Dab, رفع ابهام, … Prefer `pageprops.disambiguation`.
- `بهبود منبع بخش` ← More citations needed section; `بخش بدون منبع زنده` ← BLP
  unsourced section.
- **Do not exist on fa:** `کوتاه‌نوشت`, `کنترل مرجعیت`, `ح`, `چند مشکل`, any article
  dead-link banner.

### 12.4 Data files

- `random-2000.json`: per-page features for the 2,000-article random sample (§2.2),
  using the field names of `classify.py`: `refs`, `refs_real`, `refs_ykw_only`, `ykw`,
  `cite_outside`, `sfn`, `http`, `genref_lines`, `isbn`, `fa_words`, `blp`, `tags`,
  `infobox`, `big_unsourced_secs`, `latin_secs`. **Good regression fixtures:** the
  TypeScript detector should agree with the `strict` classification here.
- `strict-unsourced-rendered.json`: the render check of the 212 STRICT pages, with
  `rendered_refs`, `ext`, `src_ext`.
- `template-survey.json`: use counts and redirect lists for every template involved.

## 13. Trial log

Empty. Append one line per live run: date, `--limit`, edits made, kinds (add / remove /
tier), refusals by reason, bugs found and fixed.
