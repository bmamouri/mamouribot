# وظیفهٔ ۱۳ — ویکی‌پدیا:گزارش دیتابیس/برای انتقال مقاله

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
