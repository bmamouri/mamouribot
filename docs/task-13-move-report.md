# وظیفهٔ ۱۳: ویکی‌پدیا:گزارش دیتابیس/مقاله‌های نیازمند تغییرنام

This task publishes every database report MamouriBot writes. It started as the report of
article titles whose spelling or punctuation does not match fa.wikipedia convention.
Rezabot published that daily until October 2021 and the page had been frozen since;
Reza1615 has retired. Sunfyre raised it again on
[قهوه‌خانه/فنی](https://fa.wikipedia.org/wiki/ویکی‌پدیا:قهوه‌خانه/فنی) in September 2026.

The task proposes. It writes report pages and never edits an article.

## Where it stands

All the reports below run on Toolforge as MamouriBot. The permission request was declined
as unnecessary on ۹ اکتبر ۲۰۲۶, and the edits go out without the bot flag (see
[below](#it-needs-no-permission-and-its-edits-are-deliberately-unflagged)).

There is one entry (`reports-cli.ts --report move|portals|featured|prefs|neighbors|acmoves|ecmoves|usermoves|iranica|all`)
and one bundle (`toolforge/task-13-reports.mjs`):

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
| مقالاتی که در ویکی‌عربی هست و در ویکی‌فا نیست | **wikidatawiki** replica, `wb_items_per_site` + ar/en existence checks | daily, `nb-daily` |
| مقالاتی که در ویکی‌کردی هست و در ویکی‌فا نیست | همان، ckbwiki | daily, `nb-daily` |
| مقالاتی که در ویکی‌مازندرانی هست و در ویکی‌فا نیست | همان، mznwiki | daily, `nb-daily` |
| مقالاتی که در ویکی‌های خاورمیانه (عربی، ترکی، عبری) هست و در ویکی‌فا نیست | همان، ar+tr+he merged | daily, `nb-daily` |
| تغییرنام‌های کاربران تأییدشده خودکار | fawiki replica `logging` + rights-log replay + **centralauth_p** | daily, `moves-daily` |
| تغییرنام‌های کاربران تأییدشده پایدار بدون گشت خودکار (+ five monthly subpages) | same pass as above | daily, `moves-daily` |
| مقاله‌هایی که با دانشنامه ایرانیکا می‌شود گسترش داد (+ six subpages) | iranicaonline.org (or Wayback) + frozen match file + fa/en API + WDQS | weekly, `ir-weekly` |

Their data has almost nothing in common, but the job is the same: propose something on a
page, never touch an article, need no permission, and go out unflagged so people see the
edits. Splitting them across task numbers would have meant a second permission discussion
about work Huji had already said needs none.

The move report on its own:

```sh
npx tsx src/tasks/task-13/move-report-cli.ts                   # dry run, prints the wikitext
npx tsx src/tasks/task-13/move-report-cli.ts --selftest        # rules + gate, no network
npx tsx src/tasks/task-13/move-report-cli.ts --live --refresh  # publish
```

## It needs no permission, and its edits are deliberately unflagged

Huji declined the permission request as unnecessary on ۹ اکتبر ۲۰۲۶:

> «چنین رباتی مجوز نمی‌خواهد و **ویرایش‌هایش را بدون پرچم ربات انجام دهد بهتر است**. پرچم
> ربات برای ویرایش‌های متعدد است تا از شلوغ شدن تغییرات اخیر و فهرست پی‌گیری جلوگیری کند.
> رباتی که روزی یکبار یک صفحهٔ گزارش را به‌روز می‌کند نیازی به مجوز و پرچم ندارد.»

The bot flag is there to keep floods of edits out of recent changes. A task that writes one
page a day should show up in recent changes and on watchlists, which is where someone who
disagrees with a rule will see it.

### This does not mean running as my account

That would mean putting `Mamouri`'s password on Toolforge, and it isn't needed: `bot=1` is
a parameter of each edit, not a property of the account. I checked this on fa on
۹ اکتبر ۲۰۲۶ with two consecutive edits from MamouriBot, which is in the `bot` group:

| edit | `bot=1` sent | `list=recentchanges` reports |
|---|---|---|
| 44682766 | no | **`bot: false`** |
| 44682767 | yes | `bot: true` |

With `formatversion=2` the `bot` key is present and `false` on an unflagged change, so
`'bot' in change` is true either way. Read the value.

So the task stays on MamouriBot and passes `flagEdits: false`. `RunOptions` now carries that
separately from `identity`. Before this, `identityConfig()` bundled account, User-Agent and
flag together.

If a task ever does need my account on Toolforge, no code is needed: `core.ts` reads
`WIKIPEDIA_USERNAME` / `WIKIPEDIA_PASSWORD` for `identity: 'human'`, and
`toolforge/README.md` already lists both. It is `toolforge envvars create WIKIPEDIA_USERNAME`
once, stored encrypted on the tool, never in a file in this repository. I'd rather not: one
credential to rotate is better than two, and an unflagged bot edit says honestly who made
it, which an edit from my account while I'm asleep does not.

## The move report

### Why the old report was distrusted

The thread opened with an editor objecting to the report's very first row,
«کی. پی. کانداسامی» → «کی.پی. کانداسامی». He was right, and the problem went further.

The old report's `سجاوندی` section rewrote Latin initials in both directions on different
pages, with no settled convention behind either. Its `سایر` section joined pairs of words
with a ZWNJ using a general heuristic and no word list, which produced

| it proposed | why that is wrong |
|---|---|
| «کمیته ملیون ایرانی» → «کمیته میلیون ایرانی» | ملیون is the correct word; میلیون is a different one |
| «مینامی نو تسوبانه» → «می‌نامی نو تسوبانه» | Minami is a Japanese name, not a compound |
| «دانشگاه اند ونزوئلا» → «دانشگاه‌اند ونزوئلا» | "and" is part of the name |
| «کوه هها» → «کوه ه‌ها» | not a word in either form |
| «باد برخاسته است» → «باد برخاسته‌است» | was the convention once; is not now |

The 1,179 entries on `/فهرست سفید` are editors overruling the bot, one title at a time,
over nine years.

### The rules

Every rule is one of two kinds:

1. a **character-class substitution** that needs no knowledge of the word. An Arabic `ي`
   is never correct in a Persian title, wherever it appears.
2. an **exact phrase** from a short table in the source.

There is no inferred ZWNJ insertion, no dictionary, no initial-spacing rule and no ezafe
removal. Editors act on this page without checking the reasoning again, so each rule has to
be able to state exactly what it covers.

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

Each section has a one-line explanation on the published page, so an editor who disagrees
with a rule can argue about that section instead of discarding the whole page.

### Guards

I added each of these after reading rows the task actually produced on the live wiki.

- **Chemical commas.** «کبالت(II،III) اکسید», «N،N-دی‌متیل‌آمینومتیل‌فروسن». The separator
  in a chemical name is a tight Latin comma, and the whitelist already records
  «منگنز (II, III) اکسید» as the settled title. A Latin letter beside the comma suppresses
  the rule.
- **Polymer brackets.** «پلی(متیل متاکریلات)», «۴٬۴-آزوبیس(۴-سیانوپنتانویک اسید)». The
  bracket is tight on purpose and full of Persian letters, so the oxidation-state guard
  cannot see it. A table of multiplier prefixes suppresses it.
- **Stray characters before a bracket.** «شط‌(ولاشان)», «واتربوری.(ورمونت)»,
  «سلولز سنتاز -(تشکیل UDP)». Inserting a space leaves the ZWNJ, dot or dash behind, so the
  proposed title would still be wrong. The character before the bracket must be a letter, a
  digit or a closing bracket.
- **Plural suffixes.** In «آدم‌کش(ها)» the bracket is the plural, not a qualifier.
- **Thousands separator.** «۱،۵۰۰» is not a missing space. The digit class names the Persian
  and Arabic-Indic digits explicitly, because `\d` only matches ASCII digits and a guard
  written with it would do nothing here.
- **Idempotence.** A proposal must not be changed again by the same rules. Otherwise today's
  report invites a move that tomorrow's report proposes moving again.
- **Occupied targets.** If an article already sits on the proposed title, the row is
  dropped: that is a merge question, not a move. A target that is a redirect is listed and
  labelled.

«۴۰۱(کی)» and «پنتسر ۳۵(تی)» are 401(k) and Panzer 35(t), written tight in the source
language, and no mechanical guard can tell them from a qualifier. They are what the
whitelist is for, and the page says so.

### Latin digits and commas

Requested on the report's talk page. Persianising every Latin digit would have been wrong
far more often than right: **1,219** ns0 titles have a Latin digit, only **152** of them
also have Persian letters, and nearly all of those are identifiers where the Latin digit is
part of the name: «افلاتوکسین B1», «ویروس آنفلوانزای نوع A زیرگروه H5N1», «ژن TCOF1»,
«(BWV 870)», «نوکیا X2-02», «الگوریتم C4.5», «مسیر SEA-ME-WE-3».

So `latin-year` only fires on a year following «سال», «زاده» or «متولد». I also measured
«درگذشته», «دههٔ», «زادهٔ», «مرگ» and «قرن». They match nothing, so they have no rule.

`latin-comma` came out of the same sample. A Latin comma is correct inside a chemical name,
and every such title has a Latin letter immediately before it: «N,N-…», «(R,R)-…»,
«سولفید آهن (II, III)», «(۸z,۶z,۴z,۲z)-تیونین». That separates them from a disambiguator
comma typed on the wrong keyboard, «(بازیکن فوتبال, زاده ۱۹۹۲)».

«متولد» was missed on the first pass, and the published report proposed
«ژائو پدرو (بازیکن فوتبال، متولد 1993)», with the comma fixed and the year still Latin. The
idempotence check did not catch it, because a rule that never fires never changes anything.
Checking the output for titles that are still wrong is a separate test from checking that
the rules have settled.

### The ZWNJ rules (۱۱ اکتبر ۲۰۲۶)

These cover titles written with a space where Persian wants a نیم‌فاصله: «زینت السادات» →
«زینت‌السادات», «خامنه ای» → «خامنه‌ای», «می شود» → «می‌شود». The report went from 88 rows
to 478. The word lists come from fa.wikipedia's own **ابرابزار**
(`src/tasks/task-13/zwnj-lists.ts` names the three gadget pages). When I picked verb stems
by hand, the rule fired on «میس می آی», the band Miss May I.

After «ا آ د ذ ر ز ژ و» the letters are already separate, so a ZWNJ is unnecessary, and
**AbuseFilter 27 refuses to create a title containing an unnecessary one**. After those
letters the space is simply deleted: «استاندارد های» → «استانداردهای», but «آزمون های» →
«آزمون‌های». Getting this wrong means a blocked move, not just a bad suggestion, so it is
asserted in the bundler-gated `selfTest()` as well as the unit tests. See
`lessons/api-and-permissions/zwnj-acronym-title-abusefilter-27.md`.

| section | hits | the guard that makes it usable |
|---|---|---|
| نیم‌فاصله پیش از «ها» | 219 | «های»/«هایی» may not END a title; East-Asian syllables |
| نیم‌فاصله پیش از «ای» | 57 | only after a word ending in «ه» |
| نیم‌فاصله در فعل | 10 | «می» + a *conjugated* verb |
| نیم‌فاصله در لقب‌های عربی | 136 | first element from a list; Arabic-phrase guard |

I measured each guard over all 1,096,968 ns0 titles, after reading the unguarded results
and finding them wrong:

- **«های» cannot end a title.** It is plural + ezafe and needs a following noun. Every ns0
  title ending in one was a transliterated English «High» or Vietnamese «Hai»:
  «رینبو های» (Rainbow High), «مانستر های», «پایونیر های», «ناوچه کلاس-نینگ های»,
  «اپیک های». Bare «ها» is a complete plural and may end a title («گلوتامات ها»), so the
  restriction is on the ezafe forms only. Restricting the rule to the end of the title would
  make it worse, because that is where the false positives are.
- **«ای» only after «ه».** Unrestricted, it fires on 365 titles, nearly all English middle
  initials: «مایکل ای مان» is Michael A. Mann. The nisba attaches to stems ending in ه
  (منطقه‌ای، هسته‌ای، حرفه‌ای). Requiring that cuts 365 to 57 and takes precision from near
  zero to ~۹۶٪. The ابرابزار dropped «ای» from its own suffix list for the same reason, in a
  comment: «به دلیل تشابه با حرف ندا «اِی» و ام انگلیسی».
- **Present stems need a personal ending, past stems do not.** A bare past stem is the
  third person singular («چه می شد اگر…»). A bare present stem after «می» is never a verb.
  This takes the verb rule from 187 raw hits to 10, all real, and the gadget draws the line
  the same way.
- **The first element of an honorific comes from a list.** Matching any word before «الله»
  fires on 378 titles whose commonest first elements are all wrong: «موتور الله» ×۱۰،
  «تپه الله» ×۶، «چاه الله» ×۶، «قنات الله» ×۵. In those, «الله» begins the next name
  (الله‌یار، الله‌وردی، الله‌نظر) and must stay separate from the well or hill before it;
  joining them gives «چاه موتورالله یار». «ناحیه الدین» ×۵ is Dean, Hand County. The gadget
  has no generic «ال» rule either.

These were measured, read, and given no rule at all, because telling the real cases apart
would mean knowing the title is a transliterated foreign name, and nothing in the title
says so:

| suffix | hits | what they actually are |
|---|---|---|
| اند | 463 | English "and" — «پرت اند ویتنی», «گلف اند وسترن» |
| ام | 430 | German "am" — «فرانکفورت ام ماین» |
| ای (unrestricted) | 365 | English middle initials |
| تر / ترین | 45 | Dutch «ter» — «فریتس تر مر»; «چاه تر» is a wet well |
| اش | 39 | "Ash" — «میک اش» |
| بی | 314 | Azerbaijani «بی باغلی», German «bei» |
| هایش | 1 | Bernard Haisch |

The gadget does have «تر»/«ترین» rules, limited to a curated adjective list, and a bare
«ها» rule with no name guard. I ported neither. The gadget edits article text, where a
wrong join is one edit to undo. This report publishes a public proposal to rename a page.

Remaining false positives are left to the whitelist: the vocative «ای» («مژده ای دل که…»,
which only a reader can tell is a line of poetry), «لیتنستون های رود» (High Road, where
«های» is not at the end), and a few East-Asian names whose syllables are also ordinary
Persian words and so cannot be listed («یون» is an ion, «مین» is a landmine).

### The four sibling namespaces, taken over from `rezabot` (۱۱ اکتبر ۲۰۲۶)

رده‌ها، الگوها، صفحه‌های ویکی‌پدیا and راهنماها were the same report in four other
namespaces, generated by `rezabot` and out of date. One rules engine now writes all five.
`TARGETS` in `move-report.ts` holds the namespace, the title prefix, and the leading `:`
that namespace 14 needs so a row links to a category instead of putting the report in it.
`--ns <name>` runs one; the default runs all of them.

Both of the following are asserted in the selftest:

- **Namespace 4 skips subpages.** The first dry run produced **3,312** suggestions, against
  100 for categories and 15 for templates, on a namespace a tenth the size. None were real:
  2,744 were `آیا می‌دانستید که...؟` archives, 360 were
  `یادبودهای برگزیده/۱۱ شوّال/رویدادها` pages **transcluded by exact title**, 154 were
  closed `نظرخواهی برای حذف` discussions (which keep the title they were nominated under),
  and 44 were `اشتباه‌یاب/موارد درست`, the typo-finder's whitelist, whose entries are
  article titles and break the tool if "corrected". Exactly 2 of the 3,312 were top-level
  pages. `topLevelOnly` skips anything with a `/`. A list of excluded trees would need an
  entry for every project and would go out of date without anyone noticing.
- **The old رده report had 754 rows; this one has 100.** Nearly all of the difference is an
  old spacing-around-initials rule (`آر.ک.ئو پیکچرز` → `آر.ک. ئو پیکچرز`) that this engine
  does not have on purpose. `کی. پی. کانداسامی → null` is a selftest case. The drop is
  intended.

On وپ:گد, «وضعیت به‌روزرسانی» is not a parameter of `{{گزارش دیتابیس}}`, which renders only
four cells. It is a fifth cell written by hand on the line after the row. Updating the row
alone left all four reading «غیرفعال» next to a timestamp from minutes earlier.
`scripts/archive/db-index-rename-report-runners.py` updates both lines.

### Renamed ۱۰ اکتبر ۲۰۲۶: «برای انتقال مقاله» → «مقاله‌های نیازمند تغییرنام»

fa.wikipedia has been replacing the word «انتقال» with «تغییرنام», and Huji asked for this
report to follow: «لطفاً تغییرمسیر را در زمان تغییرنام حفظ کنید، سپس وپ:گد را ویرایش کنید و
ربات‌تان را هم اصلاح کنید که در نشانی جدید تغییراتش را ثبت کند».

Everything that moved left a redirect, because he asked for it and because other editors
link these pages:

| | |
|---|---|
| the report | `…/برای انتقال مقاله` → `…/مقاله‌های نیازمند تغییرنام` |
| 4 subpages | `/فهرست سفید`, `/تغییرمسیر`, `/پرانتز`, `/امضا` |

**Each subpage was moved with its own `action=move`.** `movesubpages=1` is not available to
this bot password and fails without an error (see
`lessons/api-and-permissions/bot-password-move-not-subpages.md`). Two of the subpages,
`/تغییرمسیر` and `/پرانتز`, are Sunfyre's own working lists, not something this task writes.
I moved them so nothing is left behind under a redirect title, and the redirects mean a
script of his that writes to the old name still lands in the right place.

I renamed the four sibling reports the same way, so the nav bar does not mix the two
wordings: `الگوهای نیازمند تغییرنام`, `رده‌های نیازمند تغییرنام`,
`راهنماهای نیازمند تغییرنام`, `صفحه‌های ویکی‌پدیای نیازمند تغییرنام`. That was 12 more moves
with their `/فهرست سفید` and `/امضا`, all leaving redirects. At the time none of them
belonged to this task, and all four had been dead since 2017–2020. Unlike the bot, `Mamouri`
does not have `noratelimit`, and the move limit kicks in after about eight in a minute. The
mover sleeps 65s on `ratelimited` and skips a target that already exists, so it can be
re-run from wherever it stopped.

The وپ:گد section heading became «نیازمند تغییرنام» too. That was safe because the
`وپ:برای انتقال` shortcut points at an anchor written by `{{میان‌بر}}`, not at the heading
text. Check this before renaming a section someone links to.

I also updated:

- `الگو:گزارش دیتابیس/صفحه برای انتقال`, the nav bar: our link retargeted and its label
  changed to «تغییرنام مقاله». The four sibling reports still read «انتقال …», so the bar
  was briefly inconsistent. That was Huji's decision to make, and I pointed it out to him.
- `ویکی‌پدیا:گزارش دیتابیس` (وپ:گد): the row still credited **rezabot**, **هفتگی** and
  `{{خیر|غیرفعال}}`, none of which had been true since this task took the report over. It
  now says MamouriBot, روزانه, `{{بله|فعال}}`. The section heading lost its
  `({{قرمز|غیرفعال}})` marker and its stat line went from «کاملاً غیرفعال» to
  `{{/الگوی آمار|۱|بخش|فعال}}`, matching the other partly active sections on that page.

`REPORT_PAGE` is the one constant that decides where the daily run writes.
`WHITELIST_PAGE` is derived from it, so both moved together.

### Where the titles come from

The replica (`fawiki_p`): one query, about sixteen seconds for 1,095,979 titles. I tried two
alternatives and rejected them (the reasons are also in `src/lib/replica.ts`):

- `list=allpages` caps at 50 titles per request for a client without apihighlimits. That is
  21,000 requests and roughly seven hours.
- `intitle:/regex/` is **not** enabled on fa.wikipedia, and nothing says so. It quietly
  falls back to a fuzzy term match: `intitle:/فرآیند/` returns 157 "hits" whose first result
  is «فرگشت», which does not contain the word. A detector built on it would fire on
  everything and look as if it worked.

`replica.ts` exposes no WHERE clause on purpose. Pushing each rule into SQL as a `LIKE`
prefilter would mean proving the prefilter matches at least everything the TypeScript rule
does, or the report quietly loses rows. That is two copies of one rule that drift apart. It
returns every title, and the rules engine alone decides.

### Checks done before the permission request

- 86 unit tests, no network. Most are negative: the old report's mistakes, asserted to
  produce no suggestion.
- A full live run: 1,095,979 titles → 287 proposals → 10 suppressed by the whitelist,
  4 dropped for an occupied target → 283 rows published.
- I read all 283 rows by hand. That is where the guards above came from; they removed 18
  false positives from an earlier run.
- I ran the **bundle** end to end and its 283 rows were byte-identical to the source run.
  That caught `gates.py` being unreachable from inside a bundle, which would have disabled
  the publish check on Toolforge and nowhere else.

## The user-preferences report

The «منطقه زمانی» table had been empty since بهمن ۱۴۰۲, which looked like a job that had
stopped. It hadn't: the query still runs and returns nothing, because `timecorrection` is no
longer in the public replicas. Measured ۱۱ اکتبر ۱۴۰۵, `user_properties` exposes exactly
**four** properties (`gender`, `nickname`, `fancysig`, `disablemail`), while
`timecorrection`, `skin`, `language`, `variant` and `thumbsize` all return **0 rows**. Nobody
can report timezone, skin or interface language from the replicas. I removed the section
rather than leaving a heading that only says it can't be reported. This paragraph is the
record, and the selftest checks that the section doesn't come back.

Two things to know when reading the numbers:

- `user_properties` only stores a row when a preference is changed away from its default,
  so every count is "users who changed this", never a total.
- There are 1.57M accounts and 536k of them have a single edit, so a bare count is mostly
  dormant registrations. Each property is split by activity, and that split is what the
  report is for: *29,507 set a gender; 627 of them have a thousand edits.*

«جنسیت» stays a transclusion of `/جنسیت`, which **another operator's bot maintains**; it was
updated as recently as ۱۷ مهر ۱۴۰۵. Generating it here as well would put two bots on the
same numbers.

## The featured-content report

Users ranked by the featured articles, good articles and featured lists they brought through
review. The previous maintainer's run had stopped, and the page had not changed since
شهریور ۱۴۰۴.

The database cannot answer this. The category says an article is featured, not whose work it
was. That information only exists on three hand-maintained pages, one per content type, so
those are the source. Only ★ counts. ☆ is content demoted at review, and counting it would
answer a different question from the report's title.

A user's entries are not one table row. The good-article page wraps at twenty per row and
continues on rows whose first cell is empty, so splitting on `|-` cuts every prolific
contributor off at exactly 20, and the result still looks plausible. Entries are collected
from a user's line until the next user's line. I caught this by comparing against the
featured-list page, which gives each user's own total in a «تعداد» column: **64 of 65 rows
agree**, and the one that doesn't is the source page being out of date about itself.

The run refuses to publish if it finds fewer than 50 users. A broken parser returns a short
list, not an error, and this writes over a live page.

## The two portal reports

Ported from `scripts/archive/portal-popularity/`, which produced the hand-run versions from
a Quarry run plus a local script. The Quarry queries are now inlined as `FA_PORTALS_SQL` and
`EN_PORTALS_SQL`, so nobody has to press run, and the report no longer links to Quarry,
which a reader doesn't need.

**Popularity is pageviews, not inbound links.** The two disagree: درگاه:جغرافیا has the most
inbound article links of any fa portal and little traffic. Inbound links show how thoroughly
editors connected a portal; the report is about which portals readers open. Pageviews are not
in the replicas, so structure comes from the database and traffic from the AQS API.

**Having no fa interwiki doesn't mean fa has no such portal.** Only ~90 of ~590 en portal
roots have a fa langlink, while fa has ~200 portals, so filtering on the interwiki alone
recommends creating portals that already exist. Every candidate is checked again by finding
the topic's Persian name through the article's langlink and asking fa whether
درگاه:<name> exists. Every portal that already exists is dropped from the candidates,
redirects included. For example, درگاه:زبان‌شناسی redirects to درگاه:زبان, which is already
linked to Portal:Language.

The report used to list those existing portals in their own section, «در فارسی هست ولی پیوند
میان‌ویکی ندارد». I removed it on ۱۱ اکتبر ۲۰۲۶ after linking all of them on Wikidata except
one, a redirect, which Wikidata cannot link separately. New cases will be rare, and redirects
would make most of them false alarms.

**Exclusions are by exact title.** `EXCLUDED_EN_PORTALS` holds «Erotica and pornography» and
«Nudity», ranks 1 and 2 by traffic, which I asked to leave out. Don't match «sex» as a
substring: it is inside **East Sussex** and **West Sussex**, and that filter would quietly drop
two geography portals. «Sex work» is not excluded, on purpose.

`queryRows()` in `src/lib/replica.ts` was added for these reports: it returns rows with
several columns and takes a host per wiki, because the candidates report reads enwiki.
`articleTitles()` became a thin wrapper over it, so the move report's behaviour stayed the
same.

## The four «ویکی‌های همسایه» reports (۱۳ اکتبر ۲۰۲۶)

Four pages I asked MamouriBot to take over. Three different editors (Ladsgroup, Yamaha5,
Hamid Hassani) ran them by hand between 2014 and 2019, and they had been frozen since
۱۷ آوریل ۲۰۲۱:

| page | source wiki(s) |
|---|---|
| مقالاتی که در ویکی‌عربی هست و در ویکی‌فا نیست | ar |
| مقالاتی که در ویکی‌کردی هست و در ویکی‌فا نیست | ckb (سورانی) |
| مقالاتی که در ویکی‌مازندرانی هست و در ویکی‌فا نیست | mzn |
| مقالاتی که در ویکی‌های خاورمیانه هست و در ویکی‌فا نیست | ar + tr + he, merged |

**Rows are sorted by Wikidata sitelinks.** The old pages read each foreign wiki's own
`langlinks` table, a number that meant something before Wikidata took over interlanguage
links and has drifted since. This version uses one number for all four reports: how many
Wikimedia sites have a sitelink to the item (`wb_items_per_site` on `wikidatawiki_p`), the
same count Wikidata's item page shows. Rows sort by it, highest first, which is the simplest
reading of what I asked for when the bot took these over: sort by whichever is most
notable or connected.

**The SQL is inlined, as with the درگاه reports.** It is a named constant run through
`queryRows()`, not a call to the Quarry web service. Quarry queues jobs on a shared pool
behind a login with no promise about when a run finishes; it is built for a person to press
run and read the result, not for a daily job. `wikidatawiki_p` joins the same way
`fawiki_p`/`enwiki_p` already did. `replica.ts` only needed its table of hosts per wiki
extended (`wikidata`, `ar`, `ckb`, `mzn`, `tr`, `he`).

**Non-article pages are filtered out twice.** A plain top-N by sitelink count is dominated by
cross-wiki infrastructure: `قالب:Wikitext talk page converted to Flow` has 503 sitelinks,
`تصنيف:مستخدم zh-Hant` 304, `وحدة:Navbar/configuration` 127, and none of them is an article
anyone could translate. On عربی on ۱۳ اکتبر ۲۰۲۶, only 3 of the top 30 candidates by raw
sitelink count were real articles.

1. A SQL prefilter, `ips_site_page NOT LIKE '%:%'`. It is cheap and speeds things up (fewer
   rows reach the per-item sitelink-count subquery), but it can let through pages that
   aren't articles.
2. The check that decides whether a row ships: querying the source wiki's own `page` table
   for `page_namespace = 0 AND page_is_redirect = 0` on what is left. Nothing ships on the
   prefilter alone. This follows the rule in `replica.ts`'s header for the other reports:
   SQL stays simple, and the rules that decide what ships are in TypeScript.

**The «ویکی‌های خاورمیانه» merge happens in TypeScript.** A single query across all three site
IDs with a correlated per-item sitelink-count subquery and a `GROUP BY` timed out after 90
seconds on `wikidatawiki_p`. Three separate single-site queries, the same shape that already
runs in ~45s for each of the other three reports, take well under a minute each.
`mergeCandidates()` then combines them by item. It keeps the larger sitelink count, never a
sum, because the two wikis' copies of `wb_items_per_site` can be a few minutes apart in
replication and the larger number is the newer one. It also records which source wikis had
the item.

**Single-letter English titles.** A few en.wikipedia articles are titled with a single
Perso-Arabic letter, for example «ب», the counterpart of «Ñ»/«Š», which `move-report.ts`'s
own rules already treat as real titles. `[[:en:ب]]` is byte-identical to the mistake
`gates.py`'s `audit_en_interwiki_persian` exists to catch (`:en:` put in front of a title
that is already Persian), so the publish check correctly refused it. Instead of loosening the
check, the en-title lookup drops any title containing a Perso-Arabic letter. The link to the
source wiki already shows the reader the subject, so leaving that cell blank loses nothing.

### The redirect bug (۱۳ اکتبر ۲۰۲۶)

The report had been live for less than a day when I found false positives in it. مازندرانی
«صنعت» was listed as missing from fa, but «تولید (صنعت)» already covers it. عربی «هواء» was
the same, against «اتمسفر زمین».

Checking that the item has no fa sitelink is correct for that item, but it can be the wrong
item. مازندرانی «صنعت» is on Wikidata item Q8148 ("Industry (manufacturing)"), and Q8148
really has no fa sitelink. But Q8148's own enwiki sitelink, "Industry (manufacturing)", is a
local `#REDIRECT` on en.wikipedia to "Manufacturing", which belongs to a **different** item,
Q187939, and Q187939 has fa:«تولید (صنعت)». A check on one item can never see that. «هواء» is
the same with one more step: Q7391292 ("Air") → enwiki redirect → "Atmosphere of Earth" →
Q3230 → fa:«اتمسفر زمین».

The fix follows en.wikipedia's own redirects, as `faTopics()` in `portal-reports-run.ts`
already does for a different reason (finding a candidate's Persian name). One
`action=query&redirects=1&prop=langlinks&lllang=fa` call on en.wikipedia is enough, and it
resolves the **whole** chain on the server, not just one step. I tested it on a two-step case
from `Special:DoubleRedirects` ("Woody weedkiller" → "2,4-Dichlorophenoxyacetic acid" →
"2,4-D"); it came back fully resolved in one response, with every step listed and the final
page's langlinks attached. So a candidate is dropped whenever its own enwiki sitelink,
followed wherever it redirects, already has an fa langlink, whichever Wikidata item the final
page belongs to. `resolveRedirectChain()` follows the API's own `from → to` pairs instead of
assuming there is exactly one step, since an unchecked assumption is how the bug got in. A
redirect loop ends instead of spinning.

The cost is one extra batch of en.wikipedia API calls (50 titles per request, the same cap
`unverifiedEnTargets` in `linkfix.ts` uses), run once per site and shared by every report that
reads that site. The mideast report does not check عربی, ترکی and عبری again on top of the
three standalone reports.

## تغییرنام‌های کاربران تأییدشده خودکار (۲۸ اکتبر ۲۰۲۶)

Sunfyre asked for this on قهوه‌خانه/فنی («درخواست کوئری»): the نظرخواهی to raise the move
threshold to extendedconfirmed was not heading for consensus, so the idea was to review the
moves instead. Huji's Quarry query 110612 (`LEFT JOIN user_groups … IS NULL`) was the
starting point. The report lists every move into or out of ns 0 whose author had nothing
beyond (auto)confirmed **at the time of the move**. Code: `ac-moves-report.ts` (pure),
`-run.ts`, `.selftest.ts`.

What I decided:

- The window follows calendar months: four whole months plus the current partial one, never
  "the last N days". A rolling window loses its first day every day, so a reviewer could not
  work through it.
- Users whose only explicit group is `confirmed` are included, because that group is given to
  new accounts and grants the same move right.
- Moves into ns 0 from user or draft space count too. Talk-page moves that go along with an
  article are not listed.
- The title has no ezafe hamza, matching the policy page
  «ویکی‌پدیا:کاربران تأییدشده خودکار» (the publish check refuses a word-final «هٔ»).

Each of the following would have made the simple version wrong without any error:

- **Current groups are not the mover's groups.** 19 accounts that moved as autoconfirmed-only
  since June are extendedconfirmed now (Che1985: moved ۲۷ سپتامبر, promoted ۲۶ اکتبر).
  Reading today's groups drops a month's rows on the day the author is promoted, which
  defeats the fixed window. Groups are replayed from `rights` and `autopromote` log entries up
  to each move, including expiry of temporary groups. `log_params` is PHP-serialized with
  string lengths in **bytes**, so it is parsed with a real unserializer, not a regex. A group
  held today with no log entry (granted on meta) is assumed to have always been held, which
  errs on the safe side.
- **Abolished groups stay in the log.** fa's old «uploader» group was removed by a config
  change, which writes no rights entry, so the replay made dozens of 2014 to 2018 editors
  uploaders for ever. Groups are filtered against `siprop=usergroups`.
- **`mysql --batch` prints NULL as «NULL».** `GROUP_CONCAT` over no groups read as a group
  literally called «NULL», and the first dev run published 70 rows instead of 451.
  `replica.ts`'s ssh backend now maps it to `''`, like the direct backend. `queryRows` also
  gained `allowEmpty` for lookups where an empty answer is meaningful.
- **Edit summaries are quoted as they are.** They are printed as wikitext so their links
  work, and `safeComment()` neutralises anything that would act on the page: templates,
  categories and files, signatures, tags and cell pipes. The publish check runs on the page
  with summaries blanked. One summary contained an em dash, and changing someone else's words
  to satisfy a style rule would misquote them.
- Global groups come from `centralauth_p` as of today, because it keeps no history. Bots (by
  current group) are excluded in SQL. The run refuses to publish under 20 rows, because a
  broken replay produces a short list, not an error.

First run on ۲۸ اکتبر ۲۰۲۶: 10,186 moves → 9,955 touching ns 0 → **451 rows**
(۴۸، ۶۸، ۹۹، ۱۱۲، ۱۲۴ by month). The output on Toolforge was byte-identical to the dev
(ssh-backend) output. Listed on وپ:گد under «گشت‌زنی، دسترسی‌ها و حساب‌ها».

## تغییرنام‌های کاربران تأییدشده پایدار بدون گشت خودکار (۲۸ اکتبر ۲۰۲۶)

Sunfyre asked for this once the autoconfirmed report went live. It covers moves by users who
were **extendedconfirmed at the time** but held **no group with the `autopatrol` right**.
extendedconfirmed comes from edit count alone; autopatrolled is granted by an admin who has
read the work. The two reports never overlap, since the first requires "nothing beyond
(auto)confirmed". Together they give the نظرخواهی the comparison it was arguing about
without data. Code: `ec-moves-report.ts`, `-run.ts`, `.selftest.ts`.

- **One pass for both.** `collectMoves()` in `ac-moves-report-run.ts` does the replica reads
  and the rights-log replay once and returns each move with the groups held at the time.
  Each report filters that. `--report usermoves` runs both and is what the job calls. After
  the refactor I checked the autoconfirmed report's 451 rows row by row against the live
  page, and they were identical.
- **Which groups count as autopatrol** is read from `siprop=usergroups&sigprop=rights` at run
  time (sysop, autopatrolled, eliminator, bot today), not listed in code. rollbacker does not
  carry it, so EC + rollbacker stays in; that is 26 rows. The run refuses to publish if
  `autopatrolled` ever stops carrying the right, because the report would then mean nothing.
- **The size decided the layout.** First run: **2,916 rows** from 135 users over five months,
  against 451 for the first report. Two users account for 1,319 of them. One page would be
  about 1.1 MB, so the main page has the monthly totals and a per-user table (moves, reverted,
  % reverted, deleted, months), and each month's rows go on `/۲۰۲۶-۱۰` and so on, 84 to 272 kB
  each. Subpages are written first, so the main page never links to one that doesn't exist
  yet. They have no category and no `/امضا`.

## مقاله‌هایی که با دانشنامه ایرانیکا می‌شود گسترش داد (۲۹ اکتبر ۲۰۲۶)

Every Encyclopædia Iranica Online entry compared against fa and en: fa articles that are
short where Iranica is long, and Iranica subjects with no fa article. It started as a one-off
survey (`scripts/archive/iranica_survey/` in the companion repo), which also put 40 cards on
`کاربر:Mamouri/درخواست مقاله`, and I then moved it here to run regularly. Code:
`iranica-report.ts` (pure), `-run.ts`, `.selftest.ts`, and `data/iranica-match.json`.
`--report iranica` is not part of `all`.

**Iranica directly, Wayback if refused.** From some networks iranicaonline.org answers
scripted requests with a Cloudflare challenge: a 403 HTML page, never a readable error. From
my laptop every URL got it. From a Toolforge job the site answered 200 with the real XML
(measured ۲۹ اکتبر ۲۰۲۶). `IranicaClient` tries the site, recognises the challenge **by its
body** (behind a proxy it is sometimes served as 200), and after that reads
`web.archive.org/web/2026id_/…`, the newest raw copy. Two Wayback problems came up:

- a file the site served gzipped is archived as **the gzip bytes**, labelled `text/xml` with
  no `Content-Encoding`, so `fetch` does not decompress it. Check for `1f 8b` and gunzip.
- the archived **sitemap index** can be older than the archived sitemaps. One listed
  `articles-sitemap10.xml`, which the live site no longer has (404). The live set is
  **8,652** entries (nine files); the survey's archived set was 8,814. `MIN_ENTRIES = 8000`
  is the sanity check: a challenge page parses as zero entries and a half-read sitemap set
  as a few thousand, and both stop the run instead of publishing a short report. A listed
  sitemap that yields nothing throws for the same reason.

**The matches are fixed; the grades are live.** Working out which fa/en article an entry is
about took hours of API time (P3021, pages that cite the entry, title and full-text search on
both wikis, Persian transliteration of the headword), and I then removed about forty wrong
matches **by reading them**: «Armor (film)», «Crown Lands (band)», a Jahrom village for
«aubergine», the month بهمن for Vohu Manah, «Dariush» for Darius I, «(actor)» pages. No rule
caught those, so recomputing daily would bring them back. The selftest asserts that four of
them stay out. The run only ever adds to the frozen file, from Wikidata's live P3021 claims
and the en article's current fa langlink. It also drops a frozen fa title that no longer
exists, which turns the row back into a candidate for creation.

The rejected matches are kept as `rejected` in the survey's `match.json`, and every search
pass there now skips them. Before that, the English full-text pass found 30 matches again
that an earlier filter had removed, and only this selftest noticed.

**Grades come from words of prose, not bytes.** «خاندان هخامنشی» is 8,799 bytes and 169 words
of prose; the rest is the infobox, references and old interwiki templates. Bands: خرد (stub
category or < 300 words), آغازین (< 1,000), متوسط (< 2,500), کامل‌تر; خوب and برگزیده from
their categories.

**Entry length is cached and filled in slowly.** robots.txt asks for `Crawl-Delay: 20`, so
8,652 pages would take two days. Each run measures at most 150 entries (about 50 minutes),
those with a fa or en article first, into `~/state/iranica-entries.json`, which was seeded
from the survey (3,038 measured). An unmeasured entry shows «ـ», not an em dash, which the
publish check refuses.

**Layout.** One page would be about 1.3 MB, so the main page has the summary, the method and
two 25-row previews, and six subpages hold the tables (each under ~350 KB; parsed in 0.5 s).
Subpages are written first. Only the main page gets `/امضا`.
