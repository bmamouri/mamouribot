# وظیفهٔ ۱۹: completing bare-URL references and repairing citation URLs

Many fa references are only an address: `<ref>http://…</ref>`, or a citation template whose
URL is broken or whose title is missing. This task turns them into full citations, built
from the cited page's own metadata, and repairs the URL problems that can be repaired
without judgement.

## Status

- **Not filed yet.** Code, tests and Toolforge jobs are ready. Nothing runs live.
- Request page, when filed: `ویکی‌پدیا:سیاست ربات‌رانی/درخواست مجوز/MamouriBot/وظیفه ۱۹`.
- Task id `cite-urls`. Directory `src/tasks/task-19/`. Jobs in `toolforge/task-19-cite-urls/`.

## What it changes

| kind | before | after |
|---|---|---|
| `bare-ref` | `<ref>http://www.nobelprize.org/…?id=4486</ref>` | `<ref>{{یادکرد وب |نشانی=… |عنوان=Nomination archive: Kazenizade H Iranschär |وبگاه=NobelPrize.org |زبان=en |تاریخ بازبینی=…}}</ref>` |
| `bare-ref` | `<ref>[https://x/a]</ref>` | the same, from the bracketed URL |
| `title` | `{{cite web|url=…|title=Archived copy|archive-url=…}}` | the title read from the archived snapshot |
| `title` | `{{یادکرد وب|نشانی=…|وبگاه=…}}` with no `عنوان` | `|عنوان=` added from the page |
| `title` | `عنوان=نسخه آرشیو شده` (the Persian placeholder; CS1 does not flag it) | the title from the snapshot |
| `redirector` | `وبگاه=www.google.com` beside an unwrapped Google link | the real site name |
| `scheme` | `نشانی=www.shahbazi.org/pages/x.htm` | `نشانی=http://www.shahbazi.org/pages/x.htm` |
| `scheme` | `https//`, `http:/`, `http:///`, `http://https://` | one correct scheme |
| `redirector` | `google.com/url?…url=X`, `google.com/amp/s/X`, the dead Google cache, Facebook `l.php?u=X` | `X` |
| `qmark` | `page.php؟id=5` (Persian question mark) | `page.php?id=5` |
| `tracking` | `?utm_source=…`, `fbclid`, `gclid`, … | removed |
| `decode` | `…/263705/%D8%AF%D8%B1%D8%A8%D8%A7%D8%B1%D9%87-…` | `…/263705/درباره-…` |

`tracking` and `decode` change nothing a reader sees, so they are **minor**: they ride along
on a page that gets a real change and never cause an edit by themselves
(`T19_MINOR_ALONE=1` overrides this, for a run that has been approved for it).

`[URL label]` references (`labelled-ref`) are implemented and off by default
(`T19_LABELLED=1`): the label is the editor's words, and whether to replace it with the
page's own title is a decision for the request.

When a bare URL is dead and Wayback has a capture, the new citation gets `پیوند بایگانی`,
`تاریخ بایگانی` and `چگونگی پیوند=مرده`, with the title from the snapshot.

## What it never touches

- anything inside comments, `<nowiki>`, `<pre>`, `<syntaxhighlight>`, `<math>`, `<gallery>`
- a URL inside `[[…]]` (file captions, wikilinks)
- an archive URL (Wayback, archive.today, WebCite, …). The captured URL is the archive's key.
- any text after an unclosed `{{`
- a page with `{{در دست ویرایش}}` or `{{inuse}}`
- a citation with positional arguments
- a citation that already has a real title
- PDFs and other files, Wikipedia and sister projects, social media, YouTube, Google Books
  and Maps. They need `{{یادکرد}}` variants this task does not write, or are not sources.
- a URL whose metadata is not good enough (next section). It stays bare and is listed on
  `کاربر:MamouriBot/وظیفه ۱۹/گزارش`.

## Metadata quality

Measured on the bare URLs of a 1,000-article random sample (۲۱ نوامبر ۲۰۲۶), Citoid gives a
usable title for about 85% of reachable URLs. The rest is where the damage would come from,
and every rule in `quality.ts` is one of these real answers:

| what Citoid or the page said | rule |
|---|---|
| `INDEX`, `{title}`, `Technical Difficulties`, `Press Releases`, `No data found` | generic-title list (a superset of CS1's own) |
| `yjc.news - This website is for sale!` | parked domain |
| `Nomination%20Archive` (every NobelPrize archive page) | per-site rule in `data/sites.json`: title from `<h2>` |
| `| مرکز دائرةالمعارف بزرگ اسلامی` | title is only the site name |
| an empty title on irna.ir / isna.ir: ArvanCloud's "transferring to the website" page | `bot-challenge`, left alone, never called dead |
| Hans Mehlin as the author of a Nobel archive page (the web editor) | site rule; authors also checked for shape |
| `David BrennanDiplomatic, Correspondent`, `Ap`, `Behnegarsoft.com`, `WELT` | author shape rules |
| a "webpage" date that is the template's modified date | dates only from news, journal, blog items |
| an English page declared `fr`, a French page declared `tr` | `زبان` only when the title's script and letters agree |
| `…عبور کرد - خبرگزاری مهر | اخبار ایران و جهان | Mehr News Agency` | cut at the first segment that names the site |

A 403, a timeout, a DNS failure or a challenge page is **never** evidence that a page is dead
(`lessons/verification-and-gates/citation-403-is-not-a-dead-link.md`). Dead means 404/410,
a redirect to the home page or an unrelated page, or a suspended/parked host.

### Where the metadata comes from

1. Citoid (`/api/rest_v1/data/citation/mediawiki/<url>`), 3 s apart, `Retry-After` obeyed.
2. The page itself, when Citoid's answer fails a rule or a site rule asks for it.
3. For a dead page, the newest Wayback capture with status 200 (CDX), and the snapshot's
   title. The archive URL is built from the **captured** URL the CDX row returns
   (`lessons/citations/wayback-archive-url-must-be-the-captured-url.md`).

The cache (`$BOT_STATE_DIR/cite-urls.evidence.json`, 30 days) holds the **fetched evidence**,
not the verdict, so a stricter rule applies to everything already fetched without asking
any server again.

### Site names

`data/sites.json` maps about 100 hosts to their fa article, for `وبگاه=[[…]]`. Every entry
was checked with `prop=pageprops` on ۲۱ نوامبر ۲۰۲۶, and each run checks them again: an
entry that is missing or a disambiguation page (تابناک is one) is printed unlinked. Hosts
not in the file get Citoid's site name, or the host.

## Percent-decoding

`%D8%AF%D8%B1` becomes `در`. MediaWiki itself does this when it renders a link, and
ابرابزار's `wikiUrlMinifier` does it in the editor. The rules differ from ابرابزار's in four
places, each measured:

- **Persian digits stay encoded.** `پودمان:Citation/CS1/en`, the route for any citation with
  `زبان=en`, passes its whole output through `to_western`, hrefs included. Rendered on fa:
  `{{یادکرد وب|نشانی=https://x.ir/a/۱۳|زبان=en}}` links to `https://x.ir/a/13`. Of 20 real
  URLs, asrturkiye.com answered 404 to the Latin-digit form. Encoded, the digits survive.
- **ASCII escapes are never decoded** (`%20`, `%7C`, `%25`, `%23`, …), so nothing about how
  the URL parses can change.
- **Invalid UTF-8 is left whole.** Some old Iranian sites use windows-1256 escapes.
- **The result must be NFC-stable** and contain no letter a Persian normalizer rewrites
  (ي ك ى ة ە). MediaWiki normalizes saved text to NFC, and a later ابرابزار run would
  "correct" an Arabic kaf in a readable URL and break it.

## Safety checks

`verify()` runs before every save:

1. The publish gate on the **diff**: an audit whose count rose blocks the edit.
2. Both versions are rendered. Every external link on the old page must be on the new page,
   or be one this plan rewrote (compared in canonical form, Persian digits folded).
3. No new `cs1-visible-error` or `class="error"` marker.
4. The number of references is unchanged. (The selector matches `cite&#95;note`, which is
   how fa writes the id; `cite_note` alone matches nothing, and the check would pass
   everything.)

Then `core.ts` does its own render check after saving and reverts its own edit on a
regression.

`transform()` uses only the cache. A URL the cache does not know is left alone, so a page
edited between `getTargets` and the save cannot get a citation for a URL nobody looked up.

## Targets

CirrusSearch, random order, up to `TARGET_CAP`, split across:

| key | search | pages, ۲۱ نوامبر ۲۰۲۶ |
|---|---|---|
| `bareRef` | `<ref>URL</ref>` and `<ref>[URL]</ref>` | 13,069 |
| `bareTracking` | `رده:صفحه‌های دارای ارجاعی که پیوند اینترنتی‌شان برهنه است` | 3,491 |
| `noTitle` | `رده:صفحه‌های دارای یادکرد بدون عنوان یادکرد` | 4,732 |
| `archivedCopy` | `رده:نگهداری یادکرد:عنوان آرشیو به جای عنوان` | 2,009 |
| `badUrl` | `رده:صفحه‌هایی که نشانی اینترنتی‌شان خطا دارد` | 5,337 |
| `archivedCopyFa` | `عنوان=نسخه آرشیو شده` (CS1 only knows the English placeholder, so no category) | 8,356 |
| `redirector` | Google `/url?`, cache, AMP | ~90 |
| `googleSite` | `وبگاه=www.google.com` and the like, left by a pasted redirector | 450 |

`TARGET_TITLES` / `TARGET_FILE` override the searches. `T19_QUERIES` picks a subset.

**A foundational gap worth fixing on the wiki:** `پودمان:Citation/CS1/Configuration`
has `special_case_translation.archived_copy['local'] = nil`. Setting it to
`'^نسخهٔ? (?:آرشیو|بایگانی)[‌ ]?شده$'` would put the 8,356 Persian-placeholder pages into
`نگهداری یادکرد:عنوان آرشیو به جای عنوان` with the English ones. That is a module edit
for an edit request, not part of this task.

There is no other tracking category to build first: CS1 already files every case this task
fixes inside a template, and `bareRef` is the one search the module cannot do for us. What
fa lacks is a dated `{{Bare URL inline}}`/`{{نشانی‌های وب عریان}}` practice (124 and 22
transclusions); this task removes those tags with the URL they mark, and does not add any.

## Running it

```sh
npx tsx src/tasks/task-19/cite-urls.test.ts                              # offline tests
TARGET_TITLES='حسین کاظم‌زاده ایرانشهر' npx tsx src/run.ts cite-urls       # dry run, one page
T19_QUERIES=bareRef TARGET_CAP=60 npx tsx src/run.ts cite-urls --limit 60  # dry run, a sample
npx tsx src/run.ts cite-urls --live --as-me --limit 30                    # trial, my account
```

| variable | default | |
|---|---|---|
| `T19_MAX_LOOKUPS` | `limit × 8` | metadata lookups per run |
| `T19_LABELLED` | off | also complete `<ref>[URL label]</ref>` |
| `T19_MINOR_ALONE` | off | let decode/tracking cause an edit on their own |
| `T19_CACHE_DAYS` | 30 | evidence cache lifetime |
| `T19_CITOID_GAP_MS` / `T19_WEB_GAP_MS` / `T19_WAYBACK_GAP_MS` | 3000 / 1500 / 2000 | request gaps |
| `T19_SAVE_WORK` | | write the pages a dry run would edit to this JSON file |

Edit summary, per page: `تکمیل ۲ یادکرد نشانی عریان، اصلاح نشانی منبع، خواناکردن نشانی‌های درصدی`.
