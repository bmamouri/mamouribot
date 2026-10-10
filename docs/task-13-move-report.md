# وظیفهٔ ۱۳ — ویکی‌پدیا:گزارش دیتابیس/مقاله‌های نیازمند تغییرنام

## Renamed ۱۰ اکتبر ۲۰۲۶ — «برای انتقال مقاله» → «مقاله‌های نیازمند تغییرنام»

fa.wikipedia has been replacing the word «انتقال» with «تغییرنام», and Huji asked for this
report to follow: «لطفاً تغییرمسیر را در زمان تغییرنام حفظ کنید، سپس وپ:گد را ویرایش کنید و
ربات‌تان را هم اصلاح کنید که در نشانی جدید تغییراتش را ثبت کند».

Everything that moved, each leaving a redirect, because he asked for them and because
other editors link these:

| | |
|---|---|
| the report | `…/برای انتقال مقاله` → `…/مقاله‌های نیازمند تغییرنام` |
| 4 subpages | `/فهرست سفید`, `/تغییرمسیر`, `/پرانتز`, `/امضا` |

**Each subpage was moved by its own `action=move`.** `movesubpages=1` is not available to
this bot password and fails *silently* — see
`lessons/api-and-permissions/bot-password-move-not-subpages.md`. Two of those subpages,
`/تغییرمسیر` and `/پرانتز`, are Sunfyre's own working lists rather than anything this task
writes; they moved so nothing is orphaned under a redirect title, and the redirects mean a
script of his that writes by the old name still lands.

**The four sibling reports were renamed the same way** on the operator's instruction, so
the nav bar is not half one wording and half the other: `الگوهای نیازمند تغییرنام`,
`رده‌های نیازمند تغییرنام`, `راهنماهای نیازمند تغییرنام`,
`صفحه‌های ویکی‌پدیای نیازمند تغییرنام` — 12 more moves with their `/فهرست سفید` and
`/امضا`, all leaving redirects. None of them is this task's; all four have been dead since
2017–2020. `Mamouri` is **not** `noratelimit`, unlike the bot, and the move throttle bites
after about eight in a minute — the mover sleeps 65s on `ratelimited` and skips a target
that already exists, so it is re-runnable from wherever it stopped.

The وپ:گد section heading became «نیازمند تغییرنام» too. That is safe because the
`وپ:برای انتقال` shortcut targets an anchor emitted by `{{میان‌بر}}`, not the heading
text — check that before renaming a section someone links to.

Also updated, since a rename nobody can find is not finished:

- `الگو:گزارش دیتابیس/صفحه برای انتقال` — the nav bar: our link retargeted and its label
  changed to «تغییرنام مقاله». The four sibling reports still read «انتقال …», so the bar
  is briefly inconsistent; that is Huji's call, not ours, and is flagged to him.
- `ویکی‌پدیا:گزارش دیتابیس` (وپ:گد) — the row still credited **rezabot**, **هفتگی** and
  `{{خیر|غیرفعال}}`, all three untrue since this task took the report over. Now MamouriBot,
  روزانه, `{{بله|فعال}}`. The section heading lost its `({{قرمز|غیرفعال}})` marker and its
  stat line went from «کاملاً غیرفعال» to `{{/الگوی آمار|۱|بخش|فعال}}`, matching how every
  other partially-active section on that page is written.

`REPORT_PAGE` is the single constant that decides where the daily run writes;
`WHITELIST_PAGE` derives from it, so both moved together.


## It needs no permission, and its edits are deliberately UNFLAGGED

The permission request was **declined as unnecessary** on ۹ اکتبر ۲۰۲۶. Huji:

> «چنین رباتی مجوز نمی‌خواهد و **ویرایش‌هایش را بدون پرچم ربات انجام دهد بهتر است**. پرچم
> ربات برای ویرایش‌های متعدد است تا از شلوغ شدن تغییرات اخیر و فهرست پی‌گیری جلوگیری کند.
> رباتی که روزی یکبار یک صفحهٔ گزارش را به‌روز می‌کند نیازی به مجوز و پرچم ندارد.»

So the bot flag is **flood control**, and a task that writes one page a day should not use
it — the edit ought to be visible in recent changes and on watchlists, which is where
someone who disagrees with a rule will see it.

### This does NOT mean running as the operator's account

The obvious reading is "use `--as-me`", which would mean putting `Mamouri`'s password on
Toolforge. It is not necessary: **`bot=1` is a per-edit parameter, not a property of the
account.** Verified on fa ۹ اکتبر ۲۰۲۶ with two consecutive edits from MamouriBot, which
is in the `bot` group:

| edit | `bot=1` sent | `list=recentchanges` reports |
|---|---|---|
| 44682766 | no | **`bot: false`** |
| 44682767 | yes | `bot: true` |

(Beware the measurement trap: with `formatversion=2` the `bot` key is *present and
`false`* on an unflagged change, so `'bot' in change` is true either way. Read the value.)

So the task stays on MamouriBot and passes `flagEdits: false`, which `RunOptions` now
carries separately from `identity`. The two were conflated in `identityConfig()` —
account, User-Agent and flag in one bundle — and this answer is what pulled them apart.

**If a task ever genuinely does need the human account on Toolforge**, the mechanism
already exists and needs no code: `core.ts` reads `WIKIPEDIA_USERNAME` /
`WIKIPEDIA_PASSWORD` for `identity: 'human'`, and `toolforge/README.md` already lists both
as expected names. It is `toolforge envvars create WIKIPEDIA_USERNAME` once, stored
encrypted on the tool, never in a file in this repository. Prefer not to: one credential
to rotate is better than two, and an unflagged bot edit is honest about who made it in a
way an edit from the operator's account while he sleeps is not.


Rebuilds the database report of article titles whose spelling or punctuation does not
match fa.wikipedia convention. Rezabot published it daily until October 2021 and the
page has been frozen since; Reza1615 has retired. Raised again on
[قهوه‌خانه/فنی](https://fa.wikipedia.org/wiki/ویکی‌پدیا:قهوه‌خانه/فنی) by Sunfyre in
September 2026.

The task **proposes**. It writes one page and never edits an article.

```sh
npx tsx src/tasks/task-13/move-report-cli.ts                   # dry run, prints the wikitext
npx tsx src/tasks/task-13/move-report-cli.ts --selftest        # rules + gate, no network
npx tsx src/tasks/task-13/move-report-cli.ts --live --refresh  # publish
```

## Why the old report was distrusted

The thread opened with an editor objecting to the report's very first row,
«کی. پی. کانداسامی» → «کی.پی. کانداسامی». He was right, and the objection generalises.

The old report's `سجاوندی` section rewrote Latin initials in both directions on
different pages, with no settled convention behind either. Its `سایر` section was
worse: a general "join these two words with a ZWNJ" heuristic with no word list, which
produced

| it proposed | why that is wrong |
|---|---|
| «کمیته ملیون ایرانی» → «کمیته میلیون ایرانی» | ملیون is the correct word; میلیون is a different one |
| «مینامی نو تسوبانه» → «می‌نامی نو تسوبانه» | Minami is a Japanese name, not a compound |
| «دانشگاه اند ونزوئلا» → «دانشگاه‌اند ونزوئلا» | "and" is part of the name |
| «کوه هها» → «کوه ه‌ها» | not a word in either form |
| «باد برخاسته است» → «باد برخاسته‌است» | was the convention once; is not now |

That is what 1,179 entries on `/فهرست سفید` are: editors overruling the bot, one title
at a time, for nine years.

## The rules

Every rule is one of two kinds, and nothing else is allowed in:

1. a **character-class substitution** needing no knowledge of the word — an Arabic
   `ي` is never correct in a Persian title, wherever it appears;
2. an **exact phrase** from a short table in the source.

There is no inferred ZWNJ insertion, no dictionary, no initial-spacing rule and no
ezafe removal. A rule that cannot state its own scope does not belong on a page that
editors act on without re-deriving it.

| section | rule | rows, Oct 2026 |
|---|---|---|
| حرف‌های عربی | `ي`, `ى`, `ك` → `ی`, `ک` | ۱۳ |
| اعراب | strip vowel marks, but **not** tanwin: «کاملاً» is spelled that way | ۲ |
| سه‌نقطه | `...` → `…` | ۵۶ |
| فاصله پیش از ویرگول | drop a space or ZWNJ before `،` | ۲۴ |
| نبود فاصله پس از ویرگول | add a space after `،` between two Persian words | ۸ |
| نبود فاصله پیش از پرانتز | add a space before a disambiguating bracket | ۱۰۴ |
| آ و ا | «فرآیند» → «فرایند» | ۱۸ |
| نیم‌فاصله | four exact compounds (بین المللی, نرم افزار, سخت افزار, سیستم عامل) | ۵۸ |

Each section carries its own one-line explanation on the published page, so an editor
who disagrees with a rule can argue about that section instead of discarding the page.

## Guards, and where they came from

Every guard below was added after reading rows this task actually produced against the
live wiki — not from imagining what might go wrong.

- **chemical commas.** «کبالت(II،III) اکسید», «N،N-دی‌متیل‌آمینومتیل‌فروسن». The
  separator in a chemical name is a tight Latin comma, and the whitelist already
  records «منگنز (II, III) اکسید» as the settled title. A Latin letter beside the
  comma now suppresses the rule.
- **polymer brackets.** «پلی(متیل متاکریلات)», «۴٬۴-آزوبیس(۴-سیانوپنتانویک اسید)».
  The bracket is tight on purpose and is full of Persian letters, so the
  oxidation-state guard cannot see it. A table of multiplier prefixes suppresses it.
- **stray characters before a bracket.** «شط‌(ولاشان)», «واتربوری.(ورمونت)»,
  «سلولز سنتاز -(تشکیل UDP)». Inserting a space leaves the ZWNJ, dot or dash behind,
  i.e. proposes a title that is still wrong. The character before the bracket must be
  a letter, a digit or a closing bracket.
- **plural suffixes.** «آدم‌کش(ها)» — the bracket is the plural, not a qualifier.
- **thousands separator.** «۱،۵۰۰» is not a missing space. The digit class names the
  Persian and Arabic-Indic digits explicitly; `\d` is ASCII only, so a guard written
  with it is no guard at all here.
- **idempotence.** A proposal must be a fixed point of the same rules. Otherwise
  today's report invites a move that tomorrow's report proposes moving again.
- **occupied targets.** If an article already sits on the proposed title the row is
  dropped, not listed: that is a merge question, not a move. A target that is a
  redirect is listed and labelled.

«۴۰۱(کی)» and «پنتسر ۳۵(تی)» are 401(k) and Panzer 35(t), written tight in the source
language, and no mechanical guard distinguishes them from a qualifier. They are what
the whitelist is for, and the page says so.

## Where the titles come from

The replica (`fawiki_p`), one query, about sixteen seconds for 1,095,979 titles. The
two alternatives were tried and rejected, and the reasons are in `src/lib/replica.ts`:

- `list=allpages` caps at 50 titles per request for a client without apihighlimits,
  which is 21,000 requests and roughly seven hours;
- `intitle:/regex/` is **not** enabled on fa.wikipedia and does not say so. It
  silently degrades to a fuzzy term match: `intitle:/فرآیند/` returns 157 "hits" whose
  first result is «فرگشت», which does not contain the word. A detector built on it
  would fire on everything and look like it was working.

`replica.ts` deliberately exposes no WHERE clause. Pushing each rule into SQL as a
`LIKE` prefilter means that prefilter has to be a proven superset of the TypeScript
rule, or the report silently loses rows — two implementations of one rule, drifting.
It returns every title and the rule engine is the only authority.

## Verification done before the permission request

- 86 unit tests, no network. Most are negative: the old report's mistakes, asserted to
  produce no suggestion.
- A full live run: 1,095,979 titles → 287 proposals → 10 suppressed by the whitelist,
  4 dropped for an occupied target → 283 rows published.
- All 283 rows read by hand. That audit is what produced the guards above; it removed
  18 false positives from an earlier run.
- The **bundle** was run end to end and its 283 rows are byte-identical to the
  source run. That is what caught `gates.py` being unreachable from inside a bundle,
  which would have killed the publish gate on Toolforge and nowhere else.
