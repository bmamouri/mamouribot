# وظیفهٔ ۱۶: removing browser text-fragment directives (`#:~:text=`) and tracking parameters

This task removes the `#:~:text=…` highlight that browsers add to copied links, from URLs and
links in fa articles. Chrome and Edge add it when someone arrives from a Google search snippet
or uses "Copy Link to Highlight". It only tells the browser what to highlight; cutting the URL
at the directive always gives the same page. It also carries a quoted excerpt of the source
into the citation.

Since ۲۴ نوامبر ۲۰۲۶ it also removes the tracking parameters that Facebook,
Instagram, YouTube, X, TikTok, Spotify, LinkedIn and ad clicks append to a shared link. See
«Tracking parameters» below.

## Status

- **Approved.** Request page:
  `ویکی‌پدیا:سیاست ربات‌رانی/درخواست مجوز/MamouriBot/وظیفه ۱۶`.
- Runs as MamouriBot, job `tf-daily`, daily at 06:50 UTC (`50 6 * * *`), at most 1,000 edits
  per run with `--delay 15` (200 until ۲۴ نوامبر ۲۰۲۶, raised with the tracking-parameter
  extension; announced on the request page).
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

Edit summary, per page, by what was found:

- both: `حذف برچسب برجسته‌سازی مرورگر (#:~:text=) و پارامترهای ردیابی از نشانی منبع`
- fragment only: `حذف برچسب برجسته‌سازی مرورگر (#:~:text=) از نشانی منبع`
- tracking only: `حذف پارامترهای ردیابی (مانند fbclid، utm_source و si) از نشانی منبع`

## Tracking parameters

`tracking-params.ts`, run after the fragment strip (`cleanUrls`). A parameter goes only if it
is on the list; every other parameter keeps its place and bytes.

| host | removed | kept (examples) |
|---|---|---|
| any | `utm_*`, `fbclid`, `gclid`, `gclsrc`, `dclid`, `gbraid`, `wbraid`, `msclkid`, `yclid`, `igshid`, `mibextid`, `srsltid`, `ttclid`, `twclid`, `li_fat_id`, `mc_cid`, `mc_eid`, `_hsenc`, `_hsmi`, `mkt_tok`, `gad_source`, `_gl` | |
| facebook.com, fb.watch | `mibextid`, `__tn__`, `__xts__*`, `__cft__*`, `paipv`, `eav`, `rdid`, `_rdr`, `fref`, `ref`, `refsrc`, `notif_t`, `notif_id`, `comment_tracking`, `sfnsn`, `extid`, `hc_ref`, `hc_location`, `acontext` | `fbid`, `set`, `id`, `story_fbid`, `type`, `v` |
| instagram.com | `igsh`, `igshid`, `ig_mid` | `hl`, `img_index` |
| youtube.com, youtu.be | `si`, `feature`, `ab_channel`, `pp`, `embeds_*`, `source_ve_path`, `src_vid`, `annotation_id` | `v`, `list`, `index`, `t` |
| twitter.com, x.com | `ref_src`, `ref_url`; `s` and `t` on `/status/` only | `lang` |
| tiktok.com | `_r`, `_t`, `is_from_webapp`, `sender_device`, share ids | |
| spotify.com | `si` | |
| linkedin.com | `trk`, `trackingId`, `refId`, `lipi`, `midToken`, `midSig` | |

Left alone: archive URLs (the captured URL is the archive's key), a query written with HTML
entities, a `#/route?…` hash route, anything in a comment or `<nowiki>`/`<pre>`/…, and a URL
whose last parameter would go when it is followed by sentence punctuation (a citation
parameter would keep the `.`).

Measured on a 456-page sample of the candidate searches (۲۴ نوامبر ۲۰۲۶): 392 pages change, no
change to the count of `{{`, `}}`, `[[`, `]]`, `<ref`, `|` or URLs on any page, and a second
pass changes nothing.

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

- It only deletes substrings. No HTTP requests and no guessing at the real URL, so the same
  input always gives the same result.
- It never takes a trailing `]`, `|`, `<ref>` close or template brace.
- No template fields are added or renamed and no prose is touched.
- `verify()` runs `cleanUrls` again on the old text and requires a byte-for-byte match with
  the new text, checks the change with `checkWikitext` (old against new, never the whole page),
  and checks that nothing is left to remove.
- The built-in render-error check runs as for every task.

## Targets

CirrusSearch `insource:/\#\:~\:text\=/` first, then `TRACKING_QUERIES` in
`tracking-params.ts` (`fbclid` 6,363 hits, `__tn__` 2,257, `utm_source` 1,099, YouTube
`feature` 466, …), namespace 0, 50 at a time up to the 10,000-offset limit, with duplicates
removed (offset paging repeats titles). Collection stops at `--limit × 6`; `--limit` splits the
work into runs. Many `__tn__`/`fbclid` hits are inside archive URLs and come back as no-change.

## Running it

```sh
npx tsx src/tasks/task-16/strip-text-fragment.test.ts        # offline tests
npx tsx src/tasks/task-16/tracking-params.test.ts
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
| `src/tasks/task-16/strip-text-fragment.ts` | the task (`strip-text-fragment`): `getTargets`, `stripTextFragments`, `debrisAfter`, `cleanUrls`, `verify` |
| `src/tasks/task-16/tracking-params.ts` | the tracking-parameter list, `cleanUrl`, `stripTrackingParams`, `TRACKING_QUERIES` |
| `src/tasks/task-16/strip-text-fragment.test.ts`, `tracking-params.test.ts` | offline tests |
| `src/tasks/task-16/corpus-check.replay.ts` | replay over the 200-page sample |
| `toolforge/task-16-text-fragment/` | `run.sh`, `jobs.yaml` |
| `research/google-text-fragment-links.md` in the parent repo | the research behind the task |
