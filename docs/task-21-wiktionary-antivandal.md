# وظیفهٔ ۲۱: fa.wiktionary anti-vandalism patrol

Status: **built, not approved, never run live.** Dry runs and the backtest only. The plan
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

‹Filled in from `~/wikt-research/backtest-report.md`.›

## Before going live

1. The backtest meets the bar: precision ≥ 0.97 for revert and for tag, zero actions on T2.
2. Shadow mode (`wikt-shadow`) for 3–4 weeks: ≥ 30 would-be actions, ≥ 95% agreeing with
   what humans did.
3. Request filed and approved (`drafts/fawikt-antivandal/08-bot-request.wiki`), bot flag
   from stewards (no local bureaucrats), `کاربر:MamouriBot/ادامه` created with «بله».
4. Trial: 5 writes a day, each one checked the same day.
