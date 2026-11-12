# وظیفهٔ ۱۲: English links left behind by mass imports

A lot of articles came into fa.wikipedia in bulk imports, and many of their links were never
translated. They point at English titles like `[[Antelope Valley]]`, which are red here, or
worse, at interwiki targets that look blue but go somewhere wrong. This task fixes those links.

## Where it stands

The task was approved on ۹ اکتبر ۲۰۲۶, after a 50-edit trial.

In November I extended it to cover red links whose Persian article exists under a different
name. I ran a 97-edit trial of that under my own account and posted the results on the
request page. It is waiting for review. Until it is approved, the new parts only run when I
run them myself (`--as-me`). See [the extension](#extension-red-links-whose-persian-article-has-another-name)
below.

## How the permission went

I filed the request on ۳ اکتبر ۲۰۲۶. Huji answered the same day. He said he would hold the
permission back «تا بهانه‌ای باشد» to ask me for three things:

1. Move the Python bots onto pywikibot instead of solving problems it already solves. He
   pointed at the random 30–120 second pause in this task as an example, since pywikibot
   takes its delay from what the server reports.
2. Keep the code on GitHub instead of on the wiki. He suggested the
   [PersianWikipedia/fawikibot](https://github.com/PersianWikipedia/fawikibot) project.
3. Run the bot from Toolforge, and give other maintainers access so they can fix things
   there.

I told him that some of my bots are TypeScript and that I would move the Python ones. He
confirmed that this was what he meant («برای همین گفتم که وقتش است که **ربات‌های پایتون**
خود را …») and added that the GitHub point applies to the TypeScript bots as well.

So I ported this task from Python to TypeScript, on the same framework as the other tasks.
That answers the first point, because it is no longer a Python bot. The code is public in
this repository, and the bot runs from `tools.mamouribot` (see `docs/TOOLFORGE.md`).

The random pause is not what keeps the bot polite to the servers. Every write sends
`maxlag`, and `core.ts` backs off and retries when the API reports lag, which is what Huji
was pointing at.

He then asked for a second 50-edit trial because the code had changed so much. I ran it,
reported it, and he approved the task.

The background research and the original request are in the companion repository:
`research/english-link-sweep-automation.md` and `drafts/brfa-mamouribot-linkfix.wiki`.

## What it looks for

| kind | example | what happens |
|---|---|---|
| `latin_target` | `[[Antelope Valley]]` | link to the fa article if there is one, else `[[:en:Antelope Valley|دره آنتلوپ]]` |
| `persian_digit_target` | `[[Area code ۳۲۳]]`, red on fa and missing on en | map it to the Latin form first, then the same as above |
| `latin_display` | `[[منطقه زمانی اقیانوس آرام|PST]]` | counted, never changed |

I leave `latin_display` alone on purpose. It is on 13,204 articles, and the right label
depends on the row. `PST` may well be better left as a symbol (see
`lessons/persian-conventions/units-persian-name-latin-symbol-bdi.md`).

## How it decides

The order comes from `lessons/persian-conventions/useful-redlink-repoint-not-strip.md`:

1. If there is an fa article, link to it with a Persian label.
2. If there is only an en article, use `[[:en:Title|فارسی]]`.
3. If there is neither, leave plain Persian text.

The bot never makes up a Persian name. The name has to be in `data/names.json`, which I
maintain by hand. Otherwise the link is left as it is and goes on the review list. In a
random sample of 80 articles that meant about 45% of links could be fixed automatically and
about 55% went to review. I said so in the request rather than letting the bot transliterate.

`data/names.json` started with 357 names from the 185 pages I fixed by hand on
۴ اکتبر ۲۰۲۶. Its sections are:

- `fa`: the fa article title
- `en`: a Persian label for an interwiki link
- `plain`: Persian text where no article exists anywhere
- `remap`: a Persian-digit title and its Latin form
- `by_old_display`: `"Target||Old label"` → label, for one target that means two things

## Running it

```sh
npx tsx src/tasks/task-12/linkfix.test.ts          # offline tests, no network

TARGET_CATEGORY='رده:شهرهای کالیفرنیا' npx tsx src/run.ts linkfix --limit 20
TARGET_TRANSCLUDING='الگو:…'           npx tsx src/run.ts linkfix
TARGET_FILE=/tmp/titles.json           npx tsx src/run.ts linkfix --live --as-me
```

Page selection goes through environment variables, not arguments, because the shell mangles
Persian titles. During testing a 30-page run turned into 41 pages that way. `TARGET_FILE`
takes a JSON list or one title per line.

`LINKFIX_NAMES=/path/names.json` replaces the name table for one run, and `LINKFIX_REPORT`
sets where the review list is written (by default `$BOT_STATE_DIR/linkfix-review.json`).

## The review list

Every run writes down each link it could not name, why, and which pages it was on. I add the
names to `data/names.json` and run again. That is how the task is meant to work, not a
fallback.

```sh
python3 -c "import json;r=json.load(open('.state/linkfix-review.json'));\
print(r['review_count']);[print(k,'—',v['reason']) for k,v in list(r['review'].items())[:20]]"
```

The list is a local file, not a page on the wiki. Report pages that build up over many runs
are easy to get wrong (وظیفهٔ ۳ once blanked its own, see `docs/task-03-trial-state.md`).

## Safety checks, and why each is there

- **Nothing is written without `--live`.** Until a scope is approved I run it as myself with
  `--as-me`.
- **Every `:en:` target is checked on en before writing.** An interwiki link to a missing
  page still shows blue. `:en:San Pedro station` went to a station in the Philippines. One
  bad target stops the whole run, because it means the data is wrong, not just one page.
- **Every fa target is checked on fa.** A Wikidata link can outlive the article it points to
  (`جولیا برونلی`).
- **An fa article reached through an English redirect is not used automatically.**
  `Acquanetta Warren` redirects to the city she is mayor of. Following it would give a blue
  link to the wrong subject, and no red-link check would notice.
- **File, category and sister-project links are never touched**
  (`lessons/routemap/link-sweep-must-exclude-file-namespace.md`).
- **The publish check only looks at what the edit changes.** These pages carry thousands of
  old problems. If the check looked at the whole page it would block every edit, and someone
  would end up switching it off.
- **An edit that would add a red link is not saved.** That is the main risk of this task, and
  the framework's own check only counts CS1 and Lua errors.
- **Pacing and resuming come from the shared framework.** Under `--as-me` the pauses are
  30–120 seconds, and an interrupted run picks up where it stopped.

## What it does not do

It does not create or rename pages, and it does not reword a label that is already Persian.
Until the extension below, it also did not edit templates or modules. English that a
template produces itself (`{{Representative|cacd|26}}` gives `Julia Brownley` on 3,840
articles) cannot be seen in the wikitext. That needs a separate fix in the template's data
module, like the one done for `Adjacent stations`.

## Porting from Python

This replaced `scripts/linkfix/` (`detect.py`, `resolve.py`, `rewrite.py`, `run.py` and 23
tests), which I deleted in the same commit. Keeping both would have meant two copies of the
task and two copies of the name table.

I compared the port against the Python on 120 real articles, with the network replaced by
fixed test data so that every path was exercised:

| part | result |
|---|---|
| finding links | 827 links, all 120 pages identical |
| deciding | all 133 targets identical, including the reasons |
| rewriting | 202 links changed, all 120 pages identical |

The comparison scripts are in `archive/` (not in git): `diff-against-python.ts`,
`diff-resolve-against-python.ts` and `diff-rewrite-against-python.ts`. They need the Python
code, which is gone, so the numbers are written down here.

### What I changed on purpose

- **The red-link check happens before saving.** The Python version saved first, checked
  afterwards, and stopped the run if things got worse, which left the bad edit on the page.
- **Links are looked up in `getTargets()`.** Looking them up needs the network and is much
  faster in batches. `getTargets` reads all the pages, looks up each target once, and returns
  only the pages that have something to fix. `transform` then needs no network, which is what
  makes the offline tests possible.
- **A page that fails the publish check is skipped, not the whole run.** The Python version
  stopped at the first one.
- **`names.json` is imported rather than read from disk**, so it ends up inside the single
  file that runs on Toolforge.
- **Identity, pacing, maxlag, the stop page and `{{nobots}}`** come from `core.ts` instead of
  being written again, which was most of what `run.py` did.

---

## Extension: red links whose Persian article has another name

**Status:** built and trialled on ۱۲ نوامبر ۲۰۲۶ (97 edits under my account). I posted the
results on the request page (rev 44966592), with no pings, and it is waiting for review.

### Why

«ایمانوئل ولیکوفسکی» has 23 red links. Two of them are `[[Prometheus Books]]` and
`[[American Association for the Advancement of Science]]`, but `کتاب‌های پرومتئوس` and
`انجمن پیشبرد علوم آمریکا` both exist and are on the same Wikidata items. The approved code
already found them. It just produced the wrong result inside citations, and it did not look
inside templates at all.

### The rules I set

1. **No false positives.** If the bot is not sure, it leaves the link alone and puts it on
   the review list. Similar names, transliteration and search results don't count as
   evidence. Only a Wikidata link from the en article to an fa article that exists does.
2. **A citation stays in its own language.** Only the target changes and the label stays:
   `[[Prometheus Books]]` becomes `[[کتاب‌های پرومتئوس|Prometheus Books]]`. I decided against
   creating English redirects instead. وپ:تغن says non-Persian redirects «عموماً نباید ایجاد
   شوند», this task does not create pages, and every redirect is another page to look after.
3. Use `{{پیوند با میان‌ویکی}}` and `{{بت}}` to find the English name.
4. I made `{{بت}}` and I want to retire it, so it gets replaced with
   `{{پیوند با میان‌ویکی}}`. That only happens on pages the bot is already editing to fix
   something real. I didn't want edits whose only change is swapping one template for another.
5. Cover article text, infoboxes, templates and citations.

### What changes

I listed these as separate items so each can be accepted or dropped on its own.

| # | case | before | after |
|---|---|---|---|
| ۱ | **labels in citations** | `[[George O. Abell\|Abell, George O.]]` became `[[جرج آبل]]`, so the author's name in an English reference turned Persian. This was a mistake in the approved behaviour. | Inside a `<ref>`, a `{{cite …}}`/`{{یادکرد …}}`, a `{{چپ‌چین}}` block, or a list line under «منابع», «کتاب‌شناسی» and similar headings, the English label stays: `[[جرج آبل\|Abell, George O.]]`. Article text and infoboxes work as before. Citations don't need an entry in names.json, so more links can be fixed without me. |
| ۲ | **English redirects** | Any fa article reached through an en redirect went to review. | Followed when the redirect is clearly the same subject: an exact `Last, First` reversal, or one of the en redirect categories for a move, a short or long name, another spelling or capitalisation. Any category that says the subject differs (subtopic, member, adjective, eponym, related word, section, possibilities) blocks it, and so does a redirect to a section. `Homeric` → Homer is blocked ("from adjectives"); `John Wiley & Sons` goes through ("from long names"). |
| ۳ | **citation link parameters** | not looked at | `\|author-link=X` and the other `*-link` parameters hold a bare title. Only that value changes; the visible author name does not. |
| ۴ | **`{{پیوند با میان‌ویکی}}`** (also `پبم`, `پم`, `Link-interwiki`, `Pam`; 7,397 articles) | not touched | If the fa title in the call is red but the en title leads to an existing fa article, the call becomes `[[that article\|label]]`. The label is `عنوان=` if set, otherwise the Persian title the editor wrote. |
| ۵ | **`{{بت}}`** (2,161 articles, 678 templates) | not touched | Same as ۴, using `1=` and `en=`. Other `{{بت}}` calls on a page being edited are replaced with `{{پیوند با میان‌ویکی}}`. |
| ۶ | **templates** | left out of the approved request | Navboxes and similar templates, under the same rules. Documentation and sandbox subpages are skipped. I listed this one separately because it goes past what was approved. |

Infoboxes need nothing special, because a link in an infobox is ordinary wikitext. English
that a template writes out by itself is still out of scope.

### Replacing `{{بت}}`

I rendered both templates side by side on ۱۲ نوامبر ۲۰۲۶ and the article text came out the same:

| `{{بت}}` | `{{پیوند با میان‌ویکی}}` |
|---|---|
| `{{بت\|X\|en=Y}}` (83% of 2,618 calls I sampled) | `{{پیوند با میان‌ویکی\|X\|Y}}` |
| `{{بت\|X\|L\|en=Y}}` (17%) | `{{پیوند با میان‌ویکی\|X\|Y\|عنوان=L}}` |
| with `1=`/`2=` written out | the same |

Where they differ:

- `{{پیوند با میان‌ویکی}}` puts articles in the hidden category
  «رده:مقاله‌های دارای پیوند با میان‌ویکی», and on a template's own page it shows a small
  «(en)». Both are what the template is meant to do.
- Some calls are left alone and go to review:
  - calls with `۲=` (Persian digit) or `display=`. `{{بت}}` ignores both today, so converting
    them would show a label nobody has seen (6 of 2,618).
  - calls with no `en=` (3 of 2,618).
  - calls whose title starts with a namespace such as `رده:`. `{{بت}}` adds a leading colon
    and `{{پیوند با میان‌ویکی}}` does not, so the page would end up in the category.
    An ordinary colon in a title («لیگ عدالت: نفرین») is fine.
- Most calls are written over several lines with spaces (`| 1 = …`). Anything with
  templates or links nested inside goes to review.
- If the fa title in the call is already blue, it only becomes a plain link when it is the
  same Wikidata item as the en title. `{{بت|Walt Disney Records|en=Hollywood Records}}` is
  blue and names two different companies.

### Cases that must not change

Each of these has a test.

| case | where I found it |
|---|---|
| the label and `en=` name two different things | `{{بت\|Walt Disney Records\|en=Hollywood Records}}` («شبکه دیزنی») |
| the fa article is a disambiguation page | `BA` («ریچارد بنتلی») |
| the redirect changes the subject | `Homeric` → `هومر`, `historical philology` → `زبان‌شناسی تاریخی` |
| the redirect goes to a section | any redirect with `#` |
| the en page is missing or a disambiguation page | 21 of 272 `{{پیوند با میان‌ویکی}}` calls in the sample |
| the Wikidata link outlived the fa article | `جولیا برونلی` |
| file and category links, image captions | as before |
| an English citation label turned Persian | the Abell line |

On top of that, the fa article has to be on the same Wikidata item as the en page. A
langlink can be out of date, and the fa article is what the reader actually lands on.

### How many links this can fix

From 100 pages: 60 random pages with `{{پیوند با میان‌ویکی}}` and 40 with `{{بت}}`.

| | calls | already blue | red, fixable | red, fixable through a redirect | red, no fa article | en page missing |
|---|---|---|---|---|---|---|
| `{{پیوند با میان‌ویکی}}` | 272 | 24 | 5 | 4 | 214 | 21 |
| `{{بت}}` | 1,047 | 112 | 25 | 7 | 890 | 12 |

So only about 2.5% of the red calls can be fixed, but there are a lot of them. The script is
`archive/task12-ill-bt-sample.py` (local only).

I also sorted links in three larger samples by where they sit and what they lead to
(`archive/task12-ext-measure.py`):

| sample | pages | red English links | fixable | extra through redirects | inside citations |
|---|---|---|---|---|---|
| random articles | 400 | 401 targets on 127 pages | 69 | 18 | 35 of 495 links (7%) |
| articles with `{{چپ‌چین}}` and an English link | 300 | 837 targets on 106 pages | 129 | 26 | 288 of 1,048 (27%) |
| random templates | 400 | 1,404 targets on 58 pages | 187 | 33 | 3 of 1,459 |

- **Citations.** In a random article only 7% of English links are inside citations. In
  articles with an English bibliography it is 27%, and that is where the Persian author names
  were coming from. In the second sample, 22 of the 63 fixable citation links had a label the
  old code would have translated.
- **Redirects** add about 20% more fixes. Every redirect accepted in these samples was a
  move, a modification, a short name or a capitalisation. The rejected ones were "related
  words" and "subtopics" (Finnish paganism → Baltic Finnic paganism, Odinism → Heathenry).
  Between 5 and 14 redirects per sample have no category at all, so they stay on the review
  list (`Canadian Albums Chart` → `Billboard Canadian Albums`). Some of them are the same
  subject, but nothing says so. I also tried Wikidata aliases as evidence and dropped the
  idea, because `Finnish paganism` is listed as an alias of the item it should not go to.
- **Templates** fix the most per edit. 58 of 400 templates had a red English link, with
  about 3.8 fixable links each, and a navbox fix shows up on every article that uses it.

### How it was built

1. **Labels in citations.** `foreign_text_spans` in `gates.py` decides where an English
   label belongs to the source. Both the publish check and the bot use it, so they can't
   disagree. It now covers a citation template with a non-Persian language (or no language
   and English-only values), a `<ref>` whose text is English, and an English line in a
   `{{چپ‌چین}}` block or a bibliography list. I compared it with the old check on 400 live
   pages: hits went from 1,324 to 974, nothing new was flagged, and the 30 newly accepted
   hits I looked at were all labels in English references. Inside those places only the fa
   repoint is used and the label is kept; anything else goes to review. On «ایمانوئل
   ولیکوفسکی», `[[George O. Abell|Abell, George O.]]` becomes `[[جرج آبل|Abell, George O.]]`
   and `[[Prometheus Books]]` becomes `[[کتاب‌های پرومتئوس|Prometheus Books]]`.
2. **Redirects** (`sameSubjectRedirect` in `resolve.ts`). I tried it on 300 bibliography pages
   and 465 templates: 108 accepted, 149 rejected. I read every accepted one. Two were wrong
   and are now blocked and tested: `Trout Lake Airport (Washington)` → `List of airports in
   Washington` (an entry is not the list), and a redirect to a disambiguation page. Every
   target, redirect or not, is now also checked for disambiguation pages on both wikis and
   for a matching Wikidata item.
3. **Template calls and citation parameters** (`templates.ts`). A red call is replaced by a
   plain link with the editor's label. All the cases above are refused. `{{بت}}` is only
   replaced on pages that have at least one real fix, and the edit summary says so.
4. **Templates** (`TARGET_NAMESPACE=0|10`). The namespace comes from the API, not from the
   title, since a colon in a title is not a namespace. The first dry run on 465 templates
   turned up three problems, all fixed and tested:
   - `[[Template:X|X]]`, `[[Help:…]]` and `[[Wikipedia:…]]` were treated as article links.
   - A link inside `<nowiki>` in a documentation example was changed.
   - A link in an untranslated English sentence (`This user is a [[Citizenship|citizen]] of
     the …`) was given a Persian target in the middle of English text. Those are now left
     for whoever translates the template.

   A protected template needs nothing special: the save fails, that page is skipped and the
   run carries on.
5. **The publish check compared the wrong thing.** It compared the check's messages before
   and after. A message quotes the text around each problem, so fixing a link next to an old
   em dash made the dash look new, and «اریک هابسبام» and «شبکه دیزنی» were refused for no
   reason. It now compares how many times each check fires (`audit_counts` in `gates.py`).
6. **The approved behaviour did not change.** I reran the 49 pages from the October trial with
   the old and new code. 48 came out identical. The one difference is `| format = [[CSV]]`
   in an English citation keeping `CSV` as its label, which is the intended change.
7. **The bot doesn't run the new parts until they are approved.** The Toolforge job `lf-trial`
   runs as MamouriBot, so the new parts only switch on under `--as-me`, in a dry run, or with
   `LINKFIX_EXTENSION=1`. `LINKFIX_EXTENSION=0` shows a dry run of exactly what the bot does
   now. The citation-label fix and the extra checks are always on, because they only make
   edits smaller or stop them.
8. **I rendered all 100 trial pages before and after, before saving anything**
   (`archive/task12-render-check.ts`), and found four more problems:
   - A Persian-digit target inside an English `{{cite}}` turns red, because the citation
     module changes the digits to Latin («انقلاب‌های ۱۸۴۸»). Those are now left alone.
   - A link whose fa article has the same title lost its label (`[[R|Ʀʀ]]`).
   - English text inside the `{{efn}}` around a link was not counted as English.
   - A Latin `{{بت}}` label fell back to the article title instead of the editor's Persian
     title.

   One page that looked like a problem was actually a fix: a multi-line `{{بت}}` in a gallery
   caption was printing `{{بت` as text, and the one-line replacement displays properly.
9. **Live trial on ۱۲ نوامبر ۲۰۲۶**, under my account, on 100 pages: 30 articles with English
   bibliographies, 25 with `{{بت}}`, 20 with `{{پیوند با میان‌ویکی}}` and 25 templates.
   97 pages were edited (23 of them templates, revisions 44965886–44966456). The other three
   had nothing left to fix. Checked afterwards against the wiki
   (`archive/task12-verify-live.py`, `archive/task12-classify-live.py`):
   - Red links went from 9,397 to 9,054. They went down on 89 pages and stayed the same on 8.
     Those 8 had links that were already blue but went through an English redirect, such as
     `[[Associated Press|…]]`. **No page got more red links.**
   - No page got new errors, and nothing was reverted.
   - 120 links in English citations kept their English label, 199 template calls and 23
     citation `*-link` values were fixed, and 1,702 `{{بت}}` were replaced on 39 pages.
     935 targets went to the review list.

   The run data is in `.state/task12-ext-run/` (local only).
10. **I posted the results** on ۱۲ نوامبر ۲۰۲۶ as a new subsection at the end of the request
    page (rev 44966592), without pinging anyone. The text is
    `drafts/brfa-task12-extension-followup.wiki` in the companion repository. Once it is
    approved, set `LINKFIX_EXTENSION=1` in `toolforge/task-12-linkfix/run.sh`, and only then
    let the bot run the new parts.

### Where the code is

| file | what |
|---|---|
| `scripts/lib/gates.py` (copied to `src/lib/gates.py`) | `foreign_text_spans`, `audit_counts`, and the `foreign` and `counts` command-line modes |
| `src/lib/gates.ts` | `foreignSpans`, `linkContext`, `auditCounts` |
| `src/tasks/task-12/resolve.ts` | redirect checks, `mediawikiFaInfo` |
| `src/tasks/task-12/rewrite.ts` | keeping labels in citations, `inEnglishProse`, skipping `<nowiki>`, the count-based publish check |
| `src/tasks/task-12/templates.ts` | `{{پیوند با میان‌ویکی}}` and `{{بت}}` calls, citation `*-link` parameters |
| `src/tasks/task-12/linkfix.ts` | wiring, `TARGET_NAMESPACE`, `repairPage`, edit summaries |
