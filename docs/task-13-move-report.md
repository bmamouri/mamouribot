# وظیفهٔ ۱۳ — ویکی‌پدیا:گزارش دیتابیس/مقاله‌های نیازمند تغییرنام

## This task owns every database report, not just one

One task, one entry (`reports-cli.ts --report move|portals|featured|prefs|all`), one
bundle (`toolforge/task-13-reports.mjs`):

| report | source | frequency |
|---|---|---|
| مقاله‌های نیازمند تغییرنام | fawiki replica | daily, `mr-daily` |
| رده‌های نیازمند تغییرنام | fawiki replica, ns 14 | daily, `mr-daily` |
| الگوهای نیازمند تغییرنام | fawiki replica, ns 10 | daily, `mr-daily` |
| صفحه‌های ویکی‌پدیای نیازمند تغییرنام | fawiki replica, ns 4 | daily, `mr-daily` |
| راهنماهای نیازمند تغییرنام | fawiki replica, ns 12 | daily, `mr-daily` |
| پربازدیدترین درگاه‌ها | fawiki replica + AQS pageviews | daily, `pr-daily` |
| درگاه‌های انگلیسی برای ترجمه | **enwiki** replica + AQS + fa existence check | daily, `pr-daily` |
| کاربران بر پایه تعداد محتوای برگزیده | three hand-maintained گزیدن pages | weekly, `fc-weekly` |
| ترجیحات کاربران | fawiki replica, `user_properties` | weekly, `up-weekly` |

They have almost nothing in common in their data. They are the same **job**: propose
something on a page, never touch an article, need no permission, go out unflagged so
people see them. Splitting them across task numbers would have meant a second permission
conversation about work the BAG has already said needs none.

### Latin digits and commas: anchored on words, never on the character

Asked for on the report's talk page. A blanket "Persianise every Latin digit" rule would
have been wrong far more often than right, and the measurement is why it was not written:
**1,219** ns0 titles carry a Latin digit, only **152** also carry Persian letters, and
nearly all of those are identifiers where the Latin digit *is* the name — «افلاتوکسین B1»,
«ویروس آنفلوانزای نوع A زیرگروه H5N1», «ژن TCOF1», «(BWV 870)», «نوکیا X2-02»,
«الگوریتم C4.5», «مسیر SEA-ME-WE-3».

So `latin-year` is anchored on the word: a year following «سال», «زاده» or «متولد».
«درگذشته», «دههٔ», «زادهٔ», «مرگ» and «قرن» were measured too and match **nothing**, so
they have no rule — a rule with no members is a liability, not caution.

`latin-comma` came out of the same sample. A Latin comma is *correct* inside a chemical
name, and every such title has a **Latin letter immediately before it** — «N,N-…»,
«(R,R)-…», «سولفید آهن (II, III)», «(۸z,۶z,۴z,۲z)-تیونین». That is exactly what separates
them from a disambiguator comma typed on the wrong keyboard, «(بازیکن فوتبال, زاده ۱۹۹۲)».

**A gap worth remembering:** «متولد» was missed on the first pass, and the published
report then proposed «ژائو پدرو (بازیکن فوتبال، متولد 1993)» — comma fixed, year still
Latin. The fixed-point check did not catch it, because a rule that never fires is
trivially stable. Checking the *output* for titles that are still wrong is a different
test from checking that the rules have settled.

### The user-preferences report

**Its empty table was not a dead bot.** «منطقه زمانی» had been blank since بهمن ۱۴۰۲ and
looked like a job that had stopped. The query still runs and still returns nothing:
`timecorrection` is no longer in the public replicas. Measured ۱۱ اکتبر ۱۴۰۵,
`user_properties` exposes exactly **four** properties — `gender`, `nickname`, `fancysig`,
`disablemail` — while `timecorrection`, `skin`, `language`, `variant` and `thumbsize` all
return **0 rows**. Timezone, skin and interface language cannot be reported from the
replicas by anyone. The section was **removed**, not kept with a note explaining itself:
a heading whose only content is "we cannot report this" is noise on a report page. This
paragraph is the record instead, and the selftest asserts the section does not come
back.

Two things make the remaining numbers mean something:

- `user_properties` stores a row only when a preference is changed **away from its
  default**, so every count is "users who changed this", never a total.
- 1.57M accounts exist against 536k with a single edit, so a bare count is mostly dormant
  registrations. Each property is split by activity, which is the report's actual
  content: *29,507 set a gender; 627 of them have a thousand edits.*

«جنسیت» stays a transclusion of `/جنسیت`, which **another operator's bot maintains** and
updated as recently as ۱۷ مهر ۱۴۰۵. Generating it here too would put two bots on the same
numbers.

### The featured-content report

Users ranked by featured articles, good articles and featured lists they brought through
review. The previous maintainer's run had stopped and the page had not moved since
شهریور ۱۴۰۴.

**The database cannot answer this.** The category says an article is featured; it does not
say whose work it was. That attribution exists only on three hand-maintained pages, one
per content type, so those are the source. Only ★ counts — ☆ is content demoted at
review, and a report titled "by amount of featured content" that counted demoted work
answers a different question.

**The parsing trap.** A user's entries are not one table row. The good-article page wraps
at twenty per row and continues on rows whose first cell is empty, so the obvious
`split('|-')` truncates every prolific contributor to exactly 20 — and looks entirely
plausible doing it. Entries are accumulated from a user's line until the NEXT user line.
That bug was caught, not reasoned about: the featured-list page states each user's own
total in a «تعداد» column, which is a free positive control, and parsed against it **64 of
65 rows agree**. The one that does not is the source being stale about itself.

The run refuses to publish if it finds fewer than 50 users, because a broken parser
returns a short list rather than an error, and this writes over a live page.

### The two portal reports

Ported from `scripts/archive/portal-popularity/`, which produced the hand-run versions
from a Quarry run plus a local script. The Quarry queries are now inlined as
`FA_PORTALS_SQL` and `EN_PORTALS_SQL`, so no human has to press run, and the report no
longer links Quarry — a reader of a report does not need the plumbing.

**Pageviews, not inbound links.** The two disagree and that is the point: درگاه:جغرافیا
has the most inbound article links of any fa portal and little traffic. Inbound links
measure how thoroughly *editors* wired a portal up; the question is which portal a
*reader* opens. Pageviews are not in the replicas, so structure comes from the database
and traffic from the AQS API.

**«No fa interwiki» is not «fa does not have it».** Only ~90 of ~590 en portal roots
carry a fa langlink while fa has ~200 portals, so filtering on the interwiki alone
recommends creating portals that already exist. Every candidate is re-checked by
resolving the topic's Persian name through the *article*'s langlink and asking fa whether
درگاه:<name> exists. Every portal that already exists is dropped from the candidates,
redirects included. Example: درگاه:زبان‌شناسی redirects to درگاه:زبان, which is
already linked to Portal:Language.

The report used to list the existing portals in a section of their own, «در فارسی هست
ولی پیوند میان‌ویکی ندارد». It was removed on ۱۱ اکتبر ۲۰۲۶. The operator had linked
all of them on Wikidata except one: a redirect, which Wikidata cannot link separately.
New cases will be rare, and redirects would make most of them false alarms.

**The exclusion is by exact title.** `EXCLUDED_EN_PORTALS` holds «Erotica and
pornography» and «Nudity», ranks 1 and 2 by traffic, on the operator's instruction.
Never match «sex» as a substring: it is inside **East Sussex** and **West Sussex**, and
such a filter would drop two geography portals while appearing to work. «Sex work» is
deliberately not excluded.

`queryRows()` in `src/lib/replica.ts` was added for these — multi-column rows, and a
per-wiki host, because the candidates report reads enwiki. `articleTitles()` became a
thin wrapper over it so the move report's behaviour did not move.


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

## The four sibling namespaces, taken over from `rezabot` (۱۱ اکتبر ۲۰۲۶)

رده‌ها، الگوها، صفحه‌های ویکی‌پدیا and راهنماها were the same report in four other
namespaces, generated by `rezabot` and stale. One rules engine now writes all five:
`TARGETS` in `move-report.ts` carries the namespace, the title prefix, and the leading
`:` that namespace 14 needs so a row **links to** a category instead of filing the
report into it. `--ns <name>` runs one; the default runs every one.

Two things were learnt doing it, and both are asserted in the selftest:

- **Namespace 4 ignores subpages.** The first dry run produced **3,312** suggestions
  against 100 for categories and 15 for templates, on a namespace a tenth the size, and
  none were real: 2,744 were `آیا می‌دانستید که...؟` archives, 360 were
  `یادبودهای برگزیده/۱۱ شوّال/رویدادها` pages **transcluded by exact title**, 154 were
  closed `نظرخواهی برای حذف` discussions — which keep the title they were nominated
  under — and 44 were `اشتباه‌یاب/موارد درست`, the typo-finder's whitelist, whose entries
  *are* article titles and break the tool if "corrected". Exactly 2 of the 3,312 were
  top-level pages. `topLevelOnly` skips anything with a `/`, rather than growing a list
  of excluded trees that would need an entry per project and rot silently.
- **The old رده report had 754 rows; this one has 100.** Nearly all of the difference is
  a legacy spacing-around-initials rule (`آر.ک.ئو پیکچرز` → `آر.ک. ئو پیکچرز`) that this
  engine deliberately does not have — `کی. پی. کانداسامی → null` is a selftest case. The
  drop is the point, not a regression.

On وپ:گد, «وضعیت به‌روزرسانی» is **not** a parameter of `{{گزارش دیتابیس}}`, which
renders only four cells. It is a fifth cell written by hand on the line *after* the row.
Updating the row alone left all four reading «غیرفعال» next to a timestamp from minutes
earlier. `scripts/archive/db-index-rename-report-runners.py` takes both lines.

## The ZWNJ rules (۱۱ اکتبر ۲۰۲۶) — four sections, and six rules deliberately absent

Titles written with a space where Persian wants a نیم‌فاصله: «زینت السادات» →
«زینت‌السادات», «خامنه ای» → «خامنه‌ای», «می شود» → «می‌شود». The report went from 88
rows to 478. Word lists come from fa.wikipedia's own **ابرابزار** rather than from
memory (`src/tasks/task-13/zwnj-lists.ts` names the three gadget pages); hand-picking
verb stems produced a rule that fired on «میس می آی», the band Miss May I.

**Binding a suffix is not "insert a ZWNJ".** After «ا آ د ذ ر ز ژ و» the gap is already
there, the ZWNJ is unnecessary, and **AbuseFilter 27 refuses to create a title
containing an unnecessary one** — so after those letters the space is simply deleted:
«استاندارد های» → «استانداردهای», but «آزمون های» → «آزمون‌های». That is a blocked move
rather than a bad suggestion, so it is asserted in the bundler-gated `selfTest()` and not
only in the unit tests. See
`lessons/api-and-permissions/zwnj-acronym-title-abusefilter-27.md`.

| section | hits | the guard that makes it usable |
|---|---|---|
| نیم‌فاصله پیش از «ها» | 219 | «های»/«هایی» may not END a title; East-Asian syllables |
| نیم‌فاصله پیش از «ای» | 57 | only after a word ending in «ه» |
| نیم‌فاصله در فعل | 10 | «می» + a *conjugated* verb |
| نیم‌فاصله در لقب‌های عربی | 136 | first element from a list; Arabic-phrase guard |

Each guard was measured over all 1,096,968 ns0 titles, and each exists because the
unguarded version was read and found wrong:

- **«های» cannot end a title.** It is plural + ezafe and requires a following noun. Every
  ns0 title that ended in one was a transliterated English «High» or Vietnamese «Hai»:
  «رینبو های» (Rainbow High), «مانستر های», «پایونیر های», «ناوچه کلاس-نینگ های»,
  «اپیک های». Bare «ها» *is* a complete plural and may end a title («گلوتامات ها»), so the
  restriction is on the ezafe forms only. **Restricting the rule to end-of-title — the
  obvious first guess — makes precision worse, not better**, because that position is
  where the false positives live.
- **«ای» only after «ه».** Unrestricted it fires on 365 titles, essentially all English
  middle initials: «مایکل ای مان» is Michael A. Mann. The nisba attaches to ه-final stems
  (منطقه‌ای، هسته‌ای، حرفه‌ای), and requiring that cuts 365 → 57 and takes precision from
  near zero to ~۹۶٪. The ابرابزار dropped «ای» from its own suffix list for the same
  reason, in a comment: «به دلیل تشابه با حرف ندا «اِی» و ام انگلیسی».
- **Present stems need a personal ending, past stems do not.** A bare past stem is the
  third person singular («چه می شد اگر…»); a bare present stem after «می» is never a verb.
  This is the whole precision story for the verb rule — 187 raw hits down to 10, all real
  — and the gadget draws the line the same way.
- **The honorific first element is enumerated, not inferred.** Matching any word before
  «الله» fires on 378 titles whose commonest first elements are all wrong: «موتور الله»
  ×۱۰، «تپه الله» ×۶، «چاه الله» ×۶، «قنات الله» ×۵. In those, «الله» *begins* the next
  name (الله‌یار، الله‌وردی، الله‌نظر) and must stay separate from the well or hill before
  it; binding them yields «چاه موتورالله یار». «ناحیه الدین» ×۵ is Dean, Hand County.
  The gadget has no generic «ال» rule either.

**Measured, read, and given no rule at all.** These are absent rather than guarded,
because separating them needs to know the title is a transliterated foreign name and
nothing in the title says so:

| suffix | hits | what they actually are |
|---|---|---|
| اند | 463 | English "and" — «پرت اند ویتنی», «گلف اند وسترن» |
| ام | 430 | German "am" — «فرانکفورت ام ماین» |
| ای (unrestricted) | 365 | English middle initials |
| تر / ترین | 45 | Dutch «ter» — «فریتس تر مر»; «چاه تر» is a wet well |
| اش | 39 | "Ash" — «میک اش» |
| بی | 314 | Azerbaijani «بی باغلی», German «bei» |
| هایش | 1 | Bernard Haisch |

The gadget does have «تر»/«ترین» rules, gated on a curated adjective list, and a bare
«ها» rule with no name guard at all. Neither is ported: the gadget edits article text,
where a wrong join is one edit to undo, while this report publishes a public proposal to
rename a page.

Residual false positives, left to the whitelist: the vocative «ای» («مژده ای دل که…» —
telling it apart needs to know the line is a poem), «لیتنستون های رود» (High Road, where
«های» is not final), and a handful of East-Asian names whose syllables are also ordinary
Persian words and so cannot be listed — «یون» is an ion, «مین» is a landmine.

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
