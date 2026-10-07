# Missing notes lists (MamouriBot, وظیفه ۶)

Running continuously on Toolforge since 2026-10-02. **Approved** — the reviewer posted
`{{مجوز دارد}}` on the request 2026-09-20. (The request page's
`{{ربات جدید|MamouriBot|}}` status param was never filled in, so the page still
*reads* as open; the approval is in its `===بحث===` section.)

## Why

Articles translated from en carry explanatory notes that were `{{efn}}` there.
The translation turns them into raw `<ref group="…">` and then drops, mis-names,
or misplaces the list that displays them. The consequence is not a visible error
message — **the note text never reaches the reader at all.** One article
([[شانگهای]]) was hiding 112 notes.

~1,400 articles were fixed by hand and with one-off scripts before this task
existed (see `scripts/archive/notelist-sweep.ts` and the sibling `fix-notelist-*`
and `convert-rawref-to-efn` scripts). The category keeps gaining members because
translation from en continues, which is why this is a **continuous** task rather
than a one-off sweep.

The category itself (`رده:صفحه‌های دارای یادداشت که فهرست یادداشت‌ها در آنها جا
افتاده است`) only exists because the error routing was mis-wired: all Cite
errors pass through `{{broken ref}}` → `{{broken ref/cat}}`, and
`مدیاویکی:Cite error group refs without references` was passing a `cat=`
parameter that `{{broken ref}}` never implemented, so every one of these pages
fell to `#default` and was invisible among 16k generic cite errors. A template
editor fixed
the two messages on 2026-09-15.

## The five classes

Three are fixed mechanically; two are reported and never touched.

| class | what it is | fix |
|---|---|---|
| `missing-container` | notes exist, no list for their group | insert `{{یادداشت‌ها}}` / `{{پانویس|گروه=X}}` under a notes heading, or a new section above `منابع` |
| `misplaced-container` | the list sits *above* the notes it should collect (a translation artifact — it lands above the lead). Cite only collects refs that precede the list, so this errors exactly like a missing one while looking present to every wikitext check | strip the stranded list, re-plan it into the right place |
| `nested-ref` | `{{sfn}}`/`{{پک}}` inside a raw `<ref group="…">`. The inner template expands to a `<ref>`, and a `<ref>` inside a `<ref>` breaks that group's list. **en.wikipedia errors identically — this is standard Cite behaviour, not an fa defect** (an earlier claim that it was an fa bug was wrong; the detector only matched Persian error text, so en merely *looked* clean) | convert the notes to `{{یادچپ}}` (fa's `{{efn}}`), which routes through `{{#tag:ref}}` and tolerates `{{sfn}}` inside |
| `malformed` | `group=` holds something that was never a group name — a pasted URL, a sentence, a bare number, a lone diacritic. Real examples: a full ISNA URL, `ایج، فارس، ایران`, `3`, `ْ` | **never auto-fixed** — adding a list would enshrine the typo. Reported. |
| `unknown` | renders broken but the rules can't explain it | **never auto-fixed.** Reported. |

Container choice matters: `{{یادداشت‌ها}}` only honours eight whitelisted group
names (`note, یادداشت, upper-alpha, upper-roman, persian-alpha, lower-alpha,
lower-greek, lower-roman`) and **silently falls back to persian-alpha** for
anything else — which hides the notes again. `{{پانویس}}` passes `group=`
straight to `<references>`, so it is the right container for the long tail
(`nb`, `n`, `fn`, `پاورقی`, `نکته`, `Anm.`, …). That bug shipped once and needed
a 22-article repair pass.

## Finding the targets — do not trust the category

`list=categorymembers` and the rendered category page are **both stale, in both
directions**. Measured: once `0` members reported while 35 articles were
genuinely broken; later `41` while 64 were. CirrusSearch `incategory:` lags too,
differently. The user found articles twice after I declared the category empty.

So `getTargets` takes the **union** of `categorymembers` and `incategory:`, then
**re-renders every candidate from its own wikitext** (`action=parse` with
`text=`, not `page=` — the page render is served from a parser cache that can be
days stale) and keeps only those that still emit «برای گروهی به نام «…»».
Rendering the article is the only ground truth.

The group name comes from Cite's own error message, not from a wikitext scan,
because an article can inherit `<ref group="nb">` from a **transcluded template**
— its own source then contains no grouped ref at all and looks clean. Two
articles in the first batch were exactly this. `transform()` is pure and
synchronous, so `getTargets` stashes the rendered verdict in a module-level map
that `transform` reads (`seedBrokenGroups` is the test seam for the same path).

## Re-checking: `recheckAfterDays: 30`

The resume checkpoint used to be two bare arrays of titles, which meant a title
could never come back: a page fixed once was filtered out of every later batch,
so a **re-broken page would sit in the category being skipped forever** while
the run reported "nothing to do". Same for a page deferred for review — it
stayed deferred even after the code learned to handle it.

`scripts/lib/checkpoint.ts` now stores `title → timestamp`, and this task sets
`recheckAfterDays: 30`. **Expiry is opt-in per task and only this task opts in** —
turning it on globally would make `company-deprecated-params` re-sweep 12,276
pages on its next run, and those tasks are separately approved. Legacy array
state migrates by stamping entries with *now*, not by treating them as expired,
so upgrading cannot trigger a surprise re-sweep. 19 tests in
`scripts/lib/checkpoint.test.ts` cover the TTL boundary, the no-opt-in path,
corrupt stamps, and the `markDone`-must-clear-`deferred` transition.

## Files

- `src/tasks/task-06/notelist-missing.ts` — the task (targets + pure transform)
- `scripts/lib/notelist.ts` — all detection and repair rules, **shared** with the
  interactive `scripts/archive/notelist-sweep.ts` so the two cannot drift
- `src/tasks/notelist-missing.test.ts` — replay harness: re-fetches the
  **pre-fix** revision of articles this project already fixed and asserts the task
  still diagnoses and repairs them. The category is empty most of the time, so a
  live dry run proves nothing. Last result: **120 replayed → 114 repaired, 6
  correctly deferred, 0 missed.**
- `scripts/lib/checkpoint.ts` + `.test.ts` — the timestamped resume state
- `drafts/mamouribot/brfa-وظیفه-۶.txt` — the filed request
- on-wiki code copy for reviewers: `کاربر:MamouriBot/کد/وظیفه ۶`

## How to run

```sh
npx tsx src/run.ts notelist-missing                 # dry run
npx tsx src/run.ts notelist-missing --live --delay 12
npx tsx src/tasks/notelist-missing.test.ts --limit=120   # replay test
```

⚠️ Bundle for Toolforge **only** with `npm run bundle` —
never esbuild by hand. See the warning in `TOOLFORGE.md`; a hand-rolled bundle
makes every `isMain()` guard fire, and `destub-report`'s main publishes a report
page when `--live` is in argv.

Toolforge: tool `tools.mamouribot` (the only tool), job `notelist-daily`,
`23 4 * * *` UTC, `--delay 12` (the BRFA promises ≥10s between edits).
Definition saved at `~/bot/jobs.yaml` for `toolforge jobs load`.

## Status

Backlog drained 2026-10-02: **185 edited, 7 deferred, 4 already fine** out of 196.
Verified by rendering 17 of them — 17/17 clean, 206 note-list items restored.

### The 7 awaiting a human

Five are typo'd group names (`پ` ×2, `ی` ×2, `8`) where a list must not be added.
Plus:

- **مهاواکیه‌ها** — `misplaced-container` the code could not safely relocate.
- **جایزه بفتای بهترین بازیگر نقش اول زن** — the framework's render guard
  refused the edit because it would have taken the page from 1 render error to
  **10**. Worth diagnosing before trusting the `nested-ref` path on
  award-table articles.

They become eligible again 30 days after their last touch (≈2026-11-02). If the
code is improved for them sooner, clear their entries from
`~/bot/.state/notelist-missing.json` on the box so they are retried immediately.

## Known gaps

- **No alerting.** A failed run leaves `~/notelist-daily.err` on the box and
  nothing else; a silent zero-work run looks identical to a healthy one. Watch
  the category size: climbing while the job reports no work means something
  broke.
- The code on Toolforge is a **snapshot**. Local changes need a rebuild and
  re-upload; nothing deploys itself.
- Pages whose category membership is stale but which render fine are re-examined
  every run (4 such on 2026-10-02) — they are never marked done, by design.
