# وظیفهٔ ۲۱: fa.wiktionary anti-vandalism patrol

Status: **approved on fa.wiktionary ۲۳ نوامبر ۲۰۲۶; live trial (`wikt-trial`, ≤ 5 actions a day, unflagged) since ۲۴ نوامبر.** Bot flag requested from stewards. The plan
and the research behind it are in the companion repository:
`docs/FAWIKTIONARY_ANTIVANDAL_PLAN.md` and `docs/FAWIKTIONARY_ANTIVANDAL_PREVENTION.md`.
On-wiki drafts are in `drafts/fawikt-antivandal/`.

The first MamouriBot task on a wiki other than fa.wikipedia. It takes the next MamouriBot
number, ۲۱, like every task, but its approval comes from **fa.wiktionary**
(`ویکی‌واژه:نظرخواهی‌ها/ربات-…/کاربر:MamouriBot برای مجوز ربات`), not from fawiki's
`ویکی‌پدیا:سیاست ربات‌رانی/درخواست مجوز/MamouriBot/وظیفه ۲۱`, which should not be created.

## What it does

Polls fa.wiktionary's recent changes every minute (ns 0, 10, 14; no bots). For each page
whose last editor is not trusted, it waits 90 s, then judges the **cumulative** change from
the revision before that editor's run to the current top:

1. **Trust tier** (`trust.ts`). Autoconfirmed here is 4 days and 0 edits, so it can't be
   the line. T0 is IP or temporary; T1 is under 30 days or under 50 edits; T2 is everyone
   else; T3 is a trusted group. A fawiki block or a global lock drops T1/T2 to T0.
2. **Rules** (`rules.ts`): structure of a new entry, blanking, removed language sections,
   categories or pronunciation, chatbot phrasing, contact details, floods, emoji,
   signatures. Flags are evidence, never an action.
3. **LLM** (`llm.ts`): `llm-qwen38-27b` on LiftWing, `temperature 0`, JSON schema. The diff
   is fenced as untrusted data, and every evidence quote must be found verbatim in the
   changed lines. A second, "skeptic" pass (it must make the good-faith case first) is
   requested only when the first could lead to an action. Not thinking mode: its reasoning
   is unbounded, and in the first backtest it ran out of tokens with no answer.
4. **Ladder** (`decide.ts`): revert, tag, report or log. See the table below.
5. **Act** (`patrol.ts`): reads the stop page before every write. Reverts save the T2/T3
   revision text with `baserevid` set to the suspect top, so a later save conflicts and
   nothing happens. Edits are **not** bot-flagged.

| outcome | needs |
|---|---|
| revert | T0/T1 · both passes actionable ≥ 0.90 with verified evidence · fingerprint pinned · a T2/T3 revision to return to · T1 needs at least one rule flag · not a high-use template · not undoing another low-trust user · not done on this page/user today · not burned · under 10 writes/hour |
| tag `{{حذف سریع|خرابکاری}}` | a creation in ns 0 · the same LLM conditions · a structure flag |
| report | anything suspicious that misses the above, every T2 case, LLM failures with a strong flag |
| log | the rest |

After 3 reverts on one page, or of one user, in 24 h: one post to
`ویکی‌واژه:تابلوی اعلانات مدیران`. The bot cannot protect or block.

A human undoing a bot edit **burns** that page/user pair for good, and the case is logged as
a labelled mistake.

**Never call revertrisk or ORES** for Wiktionary. Given a fawiktionary rev id,
`revertrisk-language-agnostic` silently scores the fawiki revision with the same number. A
test asserts that no such call exists anywhere in `src/tasks/task-21/`.

## Running

```sh
npx tsx src/tasks/task-21/cli.ts patrol --once         # one dry poll, prints decisions
npx tsx src/tasks/task-21/cli.ts patrol                # dry loop (shadow mode)
npx tsx src/tasks/task-21/cli.ts backtest gold.jsonl   # measure; run on Toolforge (LLM rate limit)
npx tsx src/tasks/task-21/wikt.test.ts                 # offline tests (part of npm test)
```

`--live` is refused unless `WIKT_PATROL_APPROVED=1`. Set it only in the job command of
`wikt-patrol-live`, and only after the request is approved.

On Toolforge: `~/wikt-patrol.mjs`, `~/task-21-wiktionary-antivandal/run.sh`, jobs in
`toolforge/task-21-wiktionary-antivandal/jobs.yaml` (`wikt-backtest`, `wikt-shadow`). State:
`~/state/wikt-patrol.json` (checkpoint and action ledger) and
`~/state/wikt-patrol.decisions.jsonl` (every decision).

## Gold set

`src/tasks/task-21/gold.py` builds it from three replica exports (`fawiktionary_p`):

- **reverted edits**: revisions inside the range MediaWiki records in
  `change_tag.ct_params` (`oldestRevertedRevId`..`newestRevertedRevId`) of a revert by a
  trusted user, where the revert was not itself reverted. These labels are exact, not
  guessed from sha1s.
- **surviving edits**: non-bot, non-trusted revisions never reverted and at least ~30 days
  old.
- **deleted creations**: the deletion reason carries the first ~200 characters
  («محتوای صفحه این بود: «…»»), so creations are judged on that snippet. Surviving creations
  are cut to the same length.

As built on ۲۳ نوامبر ۲۰۲۶ (2023-11 onward): 423 reverted edits (56 T0, 100 T1, 267 T2),
5,757 surviving edits, 1,033 deleted creations. One account accounts for 278 of the
reverted edits, a long ethnonationalist content dispute. Those are T2 and mostly content
disputes, which is why T2 is report-only.

## Results

First run ۲۳ نوامبر ۲۰۲۶ on Toolforge: 1,056 cases, 6 workers, ~100 minutes, one LLM error.
Raw rows: `~/wikt-research/backtest-results.jsonl` (keep it: the rules can be re-scored from it
without calling the model again, as below).

### The gold labels undercount vandalism

Of the 53 "false" reverts in the first run, **25 had been removed by someone later**, by an
ordinary edit with no revert tag, and **26 are still on the page today**: «جهت ارتباط درواتساپ
9127527819» in `جادو`, «بهترین خاله ی دنیا.» in `شمیم`, «نو ایت ایزنت» in `نو`, keyboard
mashing in `پژند`. They were labelled good because no *tagged* revert by a trusted user
covered them, and fa.wiktionary has had too few patrollers for "nobody reverted it" to
mean "it was fine". Each of the 53 was read by hand: 43 are vandalism, 10 are doubtful
(long etymology or encyclopedic additions, mostly `ai_paste` and `not_dictionary`). The
numbers below use that reading. The strict gold-label figure is given too, because it is
the one a reviewer can reproduce without trusting the reading.

The 26 still on the page are a cleanup list for a human, not for the bot (the bot only ever
judges new edits).

### Revert

| rules | reverts | right | wrong |
|---|---|---|---|
| as first built (every actionable verdict) | 82 | 72 | 10 |
| **as now: vandalism/spam/test/nonsense only, and no spam for T1** | **56** | **55** | 1 (`فیلم`: a T0 user's heading «اسم فیلم انگلیسی», poor but not vandalism) |

Strict gold labels for the current rules: 17 of 56. Recall against the labelled positives is
low (29 of 156 T0/T1 positives as first built). Most of the misses are the model saying
`good_faith_problem` (64) on the long content dispute that dominates the positives, which is
the intended behaviour: those go to the review page or to a human, not to an automatic
revert.

### Speedy tag

| rules | tags | right | wrong |
|---|---|---|---|
| as first built | 205 | 200 | 5 |
| **as now: `not_dictionary` needs two rule flags** | **129** | **128** | 1 (`پرادارت`, a coinage page) |

Two of the 7 surviving creations it tagged (`Alitd/علی تی دی`, a YouTuber bio; `Usitea`, a
brand) are out of scope and still live; they are counted as right. Recall: 127 of 300
deleted creations.

### Other

- Zero actions on T2, as required.
- 247 cases went to the review queue, 180 of them positive. That is about one a day at
  normal volume.
- Fingerprint throughout: `vllm-0.32.0-68758053`.
- Thinking mode was dropped for the second pass: one case used all 1,500 tokens reasoning
  and returned no answer after 44 s. The second pass is now a "skeptic" prompt, also
  non-thinking (~1 s).

### Not yet measured

The current rules were re-scored from the recorded verdicts, not re-run. The skeptic second
pass is new, so the next run (or shadow mode) is the first real measurement of it.

## Before going live

1. The backtest meets the bar: precision ≥ 0.97 for revert and for tag, zero actions on T2.
2. Shadow mode (`wikt-shadow`, running since ۲۳ نوامبر ۲۰۲۶) for 3–4 weeks: ≥ 30 would-be
   actions, ≥ 95% agreeing with what humans did. Check with
   `python3 ~/task-21-wiktionary-antivandal/shadow-report.py ~/state/wikt-patrol.decisions.jsonl`.
   Read every disagreement: the backtest showed humans here often leave vandalism in place,
   so "humans did not revert it" is not proof the bot was wrong.
3. Request filed and approved (`drafts/fawikt-antivandal/08-bot-request.wiki`), bot flag
   from stewards (no local bureaucrats), `کاربر:MamouriBot/ادامه` created with «بله».
4. Trial: 5 writes a day, each one checked the same day.
