/** Unit tests for the citation-param normalizer.  npx tsx src/tasks/task-03/normalize-cite-params.test.ts */
import { normalizeCiteParams, buildReview } from './normalize-cite-params.js';

let pass = 0, fail = 0;
function t(name: string, input: string, check: (r: ReturnType<typeof normalizeCiteParams>) => string | null) {
  const r = normalizeCiteParams(input);
  const err = check(r);
  if (err) { fail++; console.log(`✗ ${name}\n    ${err}\n    got: ${JSON.stringify(r.text.slice(0, 240))}`); }
  else { pass++; console.log(`✓ ${name}`); }
}
const has = (r: any, s: string) => r.text.includes(s) ? null : `expected to contain ${JSON.stringify(s)}`;
const lacks = (r: any, s: string) => !r.text.includes(s) ? null : `expected NOT to contain ${JSON.stringify(s)}`;

t('dedup English+Persian archive with equal values → keep Persian, drop English',
  '{{یادکرد وب|عنوان=خ|archive-url=http://a|archive-date=2018|نشانی بایگانی=http://a|تاریخ بایگانی=2018}}',
  r => lacks(r, 'archive-url=') || lacks(r, 'archive-date=') || has(r, '|پیوند بایگانی=http://a') || (r.changed ? null : 'should change'));

t('rename a lone English archive alias to the Persian canonical',
  '{{یادکرد وب|عنوان=خ|archive-url=http://b|archive-date=2019}}',
  r => has(r, '|پیوند بایگانی=http://b') || has(r, '|تاریخ بایگانی=2019') || lacks(r, 'archive-url'));

t('Persian↔Persian duplicate (پیوند+نشانی، same value) → keep پیوند، drop نشانی (the یاور همدانی case)',
  '{{یادکرد وب|نشانی بایگانی=http://c|پیوند بایگانی=http://c|تاریخ بایگانی=2020}}',
  r => lacks(r, 'نشانی بایگانی=') || has(r, '|پیوند بایگانی=http://c'));

t('genuine value conflict → leave untouched + manual review',
  '{{cite web|archive-url=http://x|پیوند بایگانی=http://y}}',
  r => (!r.changed && r.manualReview) ? null : 'should be left for manual review');

t('archiveurl (no hyphen) is recognized too',
  '{{یادکرد وب|archiveurl=http://d}}',
  r => has(r, '|پیوند بایگانی=http://d'));

t('non-citation template is not touched',
  '{{جعبه اطلاعات|archive-url=http://z}}',
  r => r.changed ? 'must not touch non-citations' : null);

t('preserves other params and value with spaces',
  '{{یادکرد وب | عنوان = t | archive-url = http://e | ناشر = p }}',
  r => has(r, 'عنوان = t') || has(r, 'ناشر = p'));

t('empty English alias alongside filled Persian → drop empty, keep Persian',
  '{{یادکرد وب|archive-url=|نشانی بایگانی=http://f}}',
  r => lacks(r, 'archive-url=') || has(r, '|پیوند بایگانی=http://f'));

t('url-status: lone dead-url=yes → چگونگی پیوند=مرده (value-mapped to Persian)',
  '{{یادکرد وب|dead-url=yes|archive-url=http://g}}',
  r => has(r, '|چگونگی پیوند=مرده') || lacks(r, 'dead-url='));

t('url-status: dead-url=no → چگونگی پیوند=زنده',
  '{{cite web|deadurl=no}}',
  r => has(r, '|چگونگی پیوند=زنده'));

t('url-status: dead-url=yes + url-status=dead (equal after map) → keep چگونگی پیوند=dead, drop dead-url',
  '{{یادکرد وب|url-status=dead|dead-url=yes}}',
  r => lacks(r, 'dead-url=') || has(r, '|چگونگی پیوند=dead'));

t('url-status: dead-url=yes + url-status=live (dead≠live) → conflict, leave + manual review',
  '{{cite web|url-status=live|dead-url=yes}}',
  r => (!r.changed && r.manualReview) ? null : 'should be manual review');

t('url-status: پیوند مرده=bot: unknown → چگونگی پیوند=bot: unknown (pass-through value)',
  '{{یادکرد وب|پیوند مرده=bot: unknown}}',
  r => has(r, '|چگونگی پیوند=bot: unknown'));


// --- |ref=harv: approved scope, and the bit that is easy to get catastrophically wrong.
// A |ref= with any other value is the anchor that short footnotes link to. Dropping one
// breaks every sfn pointing at it, and breaks it SILENTLY: the citation still renders
// and only the footnote link goes nowhere.

t('ref=harv is removed (now the default, and the module errors on it)',
  '{{یادکرد کتاب|عنوان=خ|ref=harv}}',
  r => lacks(r, 'ref=harv') || (r.changed ? null : 'should change'));

t('ref=harv removed with whitespace and other params around it',
  '{{یادکرد کتاب|عنوان=خ| ref = harv |ناشر=ن}}',
  r => lacks(r, 'harv') || has(r, 'عنوان=خ') || has(r, 'ناشر=ن'));

// The module tests `'harv' == ref` case-sensitively, so |ref=HARV is not the
// deprecated form. Matching that exactly beats being helpful.
t('SAFETY: |ref=HARV is a different value and is left alone',
  '{{یادکرد کتاب|عنوان=خ|ref=HARV}}',
  r => has(r, 'ref=HARV'));

t('SAFETY: |ref={{Sfn...}} is a real anchor and is NOT touched (the زبان انگلیسی case)',
  '{{یادکرد کتاب|عنوان=خ|ref={{Sfnref|الف|۱۳۹۰}}}}',
  r => has(r, 'ref={{Sfnref|الف|۱۳۹۰}}'));

t('SAFETY: |ref=CITEREFfoo is a custom anchor and is NOT touched',
  '{{یادکرد کتاب|عنوان=خ|ref=CITEREFfoo1990}}',
  r => has(r, 'ref=CITEREFfoo1990'));

t('SAFETY: |ref=none deliberately suppresses the anchor and is NOT touched',
  '{{یادکرد کتاب|عنوان=خ|ref=none}}',
  r => has(r, 'ref=none'));

t('SAFETY: a bare |ref= is NOT touched',
  '{{یادکرد کتاب|عنوان=خ|ref=|ناشر=ن}}',
  r => has(r, 'ref=') );

t('SAFETY: ref=harv outside a citation template is NOT touched',
  '{{جعبه اطلاعات کتاب|ref=harv}}',
  r => has(r, 'ref=harv') || (r.changed ? 'must not change a non-citation template' : null));

t('ref=harv and an archive rename in one citation both happen',
  '{{یادکرد کتاب|archive-url=http://z|ref=harv}}',
  r => lacks(r, 'ref=harv') || has(r, '|پیوند بایگانی=http://z'));


// --- Letterform-equal values. Found by the live trial on «کیکو آبه»: the bot edited
// the page, left the duplicate-parameter error standing, and so produced an article
// that looks handled and is not.

t('values differing only in Arabic kaf vs Persian keheh are the SAME value',
  '{{یادکرد وب|archivedate=۳۱ اکتبر ۲۰۱۴|تاریخ بایگانی=۳۱ اكتبر ۲۰۱۴}}',
  r => (r.changed ? null : 'should merge, not treat as a conflict')
       || lacks(r, 'archivedate=') || has(r, 'تاریخ بایگانی='));

t('and the Persian letterform is the one kept',
  '{{یادکرد وب|archivedate=۳۱ اکتبر ۲۰۱۴|تاریخ بایگانی=۳۱ اكتبر ۲۰۱۴}}',
  r => r.text.includes('اكتبر') ? 'kept the Arabic-kaf spelling' : has(r, 'اکتبر'));

t('Persian is kept whichever side it is written on',
  '{{یادکرد وب|archivedate=۳۱ اكتبر ۲۰۱۴|تاریخ بایگانی=۳۱ اکتبر ۲۰۱۴}}',
  r => r.text.includes('اكتبر') ? 'kept the Arabic-kaf spelling' : has(r, 'اکتبر'));

t('yeh and alef maksura fold the same way',
  '{{یادکرد وب|archive-date=ژانویه ۲۰۱۰|تاریخ بایگانی=ژانویه ۲۰۱۰}}',
  r => (r.changed ? null : 'should merge') || lacks(r, 'archive-date='));

t('SAFETY: a genuinely different date is still a conflict',
  '{{یادکرد وب|archivedate=۳۱ اکتبر ۲۰۱۴|تاریخ بایگانی=۱ نوامبر ۲۰۱۴}}',
  r => (!r.changed && r.manualReview) ? null : 'two real dates must stay for a human');


// --- The Persian boolean vocabulary. The value map used to bail out for every alias
// except dead-url/deadurl, so «پیوند مرده=خیر» became «چگونگی پیوند=خیر» and the module
// rejected the value: the bot ADDED a visible error. Caught on آب‌انبار سردار بزرگ.

t('پیوند مرده=خیر becomes چگونگی پیوند=زنده, not the raw «خیر»',
  '{{یادکرد وب|پیوند مرده=خیر}}',
  r => has(r, '|چگونگی پیوند=زنده') || lacks(r, 'خیر'));

t('پیوند مرده=بله becomes مرده',
  '{{یادکرد وب|پیوند مرده=بله}}',
  r => has(r, '|چگونگی پیوند=مرده'));

t('آری also means dead',
  '{{یادکرد وب|پیوند مرده=آری}}',
  r => has(r, '|چگونگی پیوند=مرده'));

t('زنده passes through as itself',
  '{{یادکرد وب|پیوند مرده=زنده}}',
  r => has(r, '|چگونگی پیوند=زنده'));

t('the English aliases still map',
  '{{یادکرد وب|dead-url=no}}',
  r => has(r, '|چگونگی پیوند=زنده'));

t('SAFETY: a value the module already accepts passes through untouched',
  '{{یادکرد وب|پیوند مرده=usurped}}',
  r => has(r, '|چگونگی پیوند=usurped'));

t('SAFETY: bot: unknown passes through',
  '{{یادکرد وب|پیوند مرده=bot: unknown}}',
  r => has(r, '|چگونگی پیوند=bot: unknown'));

t('SAFETY: an unrecognised value is never guessed at',
  '{{یادکرد وب|پیوند مرده=شاید}}',
  r => has(r, '|چگونگی پیوند=شاید'));


// --- Digits, not just letterforms. «پریمیرا لیگا ۲۰–۲۰۱۹» carried
// archive-date="3 فوریه 2021" against تاریخ بایگانی="۳ فوریه ۲۰۲۱"; normalizeVal folds
// digits so they compare equal, and keeping the Latin-digit one wrote a date the module
// cannot parse — one visible error traded for another.

// Latin digits in a date are NOT a defect — probed against the live module, «3 اکتبر
// 2020» parses exactly as «۳ اکتبر ۲۰۲۰» does. So digits must not sway the choice; only
// the Arabic letterform does, because that is what actually breaks the date parser.
t('digits do not decide: the first value is kept when only digits differ',
  '{{یادکرد وب|archive-date=3 فوریه 2021|تاریخ بایگانی=۳ فوریه ۲۰۲۱}}',
  r => ((r.text.match(/فوریه/g) ?? []).length === 1) ? null : 'should keep exactly one');

// Neither candidate here is ideal: one has a Persian keheh but Latin digits, the other
// Persian digits but an Arabic kaf, and the perfect «۳ اکتبر ۲۰۲۰» exists in neither.
// The bot must NOT synthesise a third value — it renames parameters, it does not
// rewrite content — so it keeps the lesser evil, and the lesser evil is the one the
// module can still parse as a date. The Arabic kaf is an orthography nit; Latin digits
// are a visible error.
// «۳ اكتبر ۲۰۲۰» has an Arabic kaf and the module cannot read it as a date;
// «3 اکتبر 2020» has Latin digits and parses fine. Keep the one that renders.
t('the Arabic-kaf date loses to the Latin-digit one, because only one of them parses',
  '{{یادکرد وب|archive-date=3 اکتبر 2020|تاریخ بایگانی=۳ اكتبر ۲۰۲۰}}',
  r => r.text.includes('اكتبر') ? 'kept the unparseable Arabic-kaf date' : has(r, '3 اکتبر 2020'));

t('SAFETY: a URL is full of ASCII digits and is NOT penalised for it',
  '{{یادکرد وب|archive-url=https://web.archive.org/web/20150924131830/http://a.example|نشانی بایگانی=https://web.archive.org/web/20150924131830/http://a.example}}',
  r => has(r, 'https://web.archive.org/web/20150924131830/http://a.example'));

t('SAFETY: identical values still collapse to one',
  '{{یادکرد وب|archive-date=۳ فوریه ۲۰۲۱|تاریخ بایگانی=۳ فوریه ۲۰۲۱}}',
  r => ((r.text.match(/۳ فوریه ۲۰۲۱/g) ?? []).length === 1) ? null : 'should keep exactly one copy');


// --- The canonical must be a name the CS1 configuration DECLARES. «نشانی بایگانی» was
// picked on style grounds and is declared nowhere — not in Configuration, /en, /fa or
// either whitelist — which is how two trial pages ended up with
// «|archive-date= نیازمند |archive-url= است». Keep this test: it is the only thing
// stopping the canonical drifting back to whatever reads nicest.

t('the archive-url canonical is «پیوند بایگانی», the declared alias',
  '{{یادکرد وب|archive-url=http://a|تاریخ بایگانی=۱۳۹۰}}',
  r => has(r, '|پیوند بایگانی=http://a') || lacks(r, 'نشانی بایگانی'));

t('«نشانی بایگانی» is now a legacy alias and gets renamed off the page',
  '{{یادکرد وب|نشانی بایگانی=http://b|تاریخ بایگانی=۱۳۹۰}}',
  r => (r.changed ? null : 'should rename') || has(r, '|پیوند بایگانی=http://b') || lacks(r, 'نشانی بایگانی'));

t('a page the earlier trial wrote «نشانی بایگانی» to is repaired in one pass',
  '{{یادکرد وب|عنوان=خ|نشانی بایگانی=http://c|تاریخ بایگانی=۱۴ مه ۲۰۱۳|چگونگی پیوند=dead}}',
  r => has(r, '|پیوند بایگانی=http://c') || has(r, '|تاریخ بایگانی=۱۴ مه ۲۰۱۳') || has(r, '|چگونگی پیوند=dead'));


// --- Persian values. «مرده»/«زنده» were added to the CS1 keywords table in every config
// on 2026-10-07, so they are now accepted spellings. The bot writes Persian where it is
// translating anyway, and leaves a value the module already accepts exactly as written:
// rewriting every existing «=dead» would be hundreds of edits changing nothing a reader
// sees.

t('NO CHURN: a lone, already-valid چگونگی پیوند=dead is left completely alone',
  '{{یادکرد وب|عنوان=خ|چگونگی پیوند=dead}}',
  r => r.changed ? 'must not rewrite a value the module already accepts' : null);

t('NO CHURN: چگونگی پیوند=live is left alone too',
  '{{یادکرد وب|عنوان=خ|چگونگی پیوند=live}}',
  r => r.changed ? 'must not rewrite an accepted value' : null);

t('NO CHURN: usurped stays English — no Persian term is in use for it',
  '{{یادکرد وب|عنوان=خ|چگونگی پیوند=usurped}}',
  r => r.changed ? 'must not touch usurped' : null);

t('a legacy alias holding an already-valid value keeps the value, only the key moves',
  '{{یادکرد وب|پیوند مرده=dead}}',
  r => has(r, '|چگونگی پیوند=dead') || lacks(r, 'پیوند مرده'));

t('«بله» and an existing «dead» are the same statement, not a conflict',
  '{{یادکرد وب|dead-url=بله|چگونگی پیوند=dead}}',
  r => (r.changed && !r.manualReview) ? (lacks(r, 'dead-url') || has(r, '|چگونگی پیوند=dead')) : 'should merge, keeping the already-valid spelling');


// --- The manual-review page. The bot leaving a conflict alone is correct; leaving it
// INVISIBLE is not. «ندا آقاسلطان» carried four, one pair fifteen years apart, and the
// only trace was «معوق=۴» in a job log nobody else reads.

t('a conflict is reported with BOTH values, so a human can decide without the wikitext',
  '{{یادکرد وب|archive-date=۳ فوریه ۲۰۲۱|تاریخ بایگانی=۹ مارس ۲۰۲۲}}',
  r => {
    if (!r.conflicts?.length) return 'should record the conflict';
    const c = r.conflicts[0];
    if (c.field !== 'archive-date') return `field was ${c.field}`;
    const vals = c.values.map(v => v.value);
    return vals.includes('۳ فوریه ۲۰۲۱') && vals.includes('۹ مارس ۲۰۲۲') ? null : JSON.stringify(c);
  });

t('a citation the bot CAN fix records no conflict',
  '{{یادکرد وب|archive-date=۳ فوریه ۲۰۲۱|تاریخ بایگانی=۳ فوریه ۲۰۲۱}}',
  r => r.conflicts?.length ? 'should record nothing' : null);

{
  const page = buildReview([{ title: 'ندا آقاسلطان', conflicts: [
    { field: 'access-date', values: [{ key: 'تاریخ بازبینی', value: '2024-04-05' }, { key: 'بازبینی', value: '۲۸ ژوئیه ۲۰۰۹' }] },
    { field: 'archive-date', values: [{ key: 'تاریخ بایگانی', value: '2019-09-17' }, { key: 'archive-date', value: '۱۷ سپتامبر ۲۰۰۹' }] },
  ] }], new Date('2026-10-07T00:00:00Z'));
  const need = (s: string) => { if (!page.includes(s)) { fail++; console.log(`✗ review page missing ${JSON.stringify(s)}`); } else pass++; };
  need('[[ندا آقاسلطان]]');
  need('2024-04-05');
  need('۲۸ ژوئیه ۲۰۰۹');
  need('access-date');
  need('۷ اکتبر ۲۰۲۶');
  need('[[:رده:صفحه‌های دارای ارجاع با متغیر تکراری]]');
  need('[[رده:گزارش‌های دیتابیس ویکی‌پدیا]]');
  if (page.includes('—')) { fail++; console.log('✗ review page contains an em dash'); } else pass++;
  const empty = buildReview([]);
  // The page is cumulative (see review-store.ts), so the empty case cannot say «در این
  // اجرا»: it is a statement about the whole worklist, not about one run.
  if (!empty.includes('موردی برای بازبینی ثبت نشده')) { fail++; console.log('✗ empty review page does not say so'); } else pass++;
}

// ---------------------------------------------------------------------------
// The families added after the trial. Alias lists come from the `aliases_add`
// table in «پودمان:Citation/CS1/fa/i18n»; see the comment above FIELDS.
// ---------------------------------------------------------------------------

t('access-date: underscore and space form with the same date → exactly one survives',
  '{{یادکرد وب|عنوان=خ|تاریخ_بازبینی=۱۰ مه ۲۰۲۰|بازبینی=۱۰ مه ۲۰۲۰}}',
  r => (r.changed && (r.text.match(/۱۰ مه ۲۰۲۰/g) ?? []).length === 1)
       ? null : 'one of the two access dates should remain, exactly once');

t('access-date: two genuinely different dates → untouched, reported',
  '{{یادکرد وب|عنوان=خ|تاریخ بازبینی=2024-04-05|بازیابی=۲۸ ژوئیه ۲۰۰۹}}',
  r => (!r.changed && r.manualReview && r.conflicts?.some(c => c.field === 'access-date'))
       ? null : 'should be left for manual review');

t('access-date: digit forms of the same date are recognised as equal',
  '{{یادکرد وب|عنوان=خ|تاریخ بازبینی=۲۰۲۰-۰۵-۱۰|accessdate=2020-05-10}}',
  r => lacks(r, 'accessdate') || has(r, 'تاریخ بازبینی='));

t('language: کد زبان and زبان with the same value → one survives',
  '{{یادکرد وب|عنوان=خ|کد زبان=en|زبان=en}}',
  r => (r.changed && (r.text.match(/=en/g) ?? []).length === 1) ? null : 'exactly one language param');

t('language: a lone lang alias is NOT renamed — it is valid, so touching it is cosmetic',
  '{{یادکرد وب|عنوان=خ|lang=fr}}', r => (!r.changed) ? null : 'a lone valid alias must not be touched');

t('title: کتاب is a Title alias, so an equal pair loses one copy',
  '{{یادکرد کتاب|کتاب=شاهنامه|عنوان=شاهنامه|ناشر=ن}}',
  r => (r.changed && (r.text.match(/شاهنامه/g) ?? []).length === 1) ? null : 'one title should remain');

t('title: a lone |title= is left ALONE, or the bot would churn every citation on the wiki',
  '{{cite web|title=x|url=http://a}}',
  r => (!r.changed) ? null : 'a lone valid |title= must not be renamed');

t('title: different title values are an editorial question, not a bot one',
  '{{یادکرد کتاب|کتاب=شاهنامه|عنوان=بوستان}}',
  r => (!r.changed && r.manualReview) ? null : 'should be left for manual review');

t('pages: صص and صفحات with the same value lose one copy',
  '{{یادکرد کتاب|عنوان=خ|صص=۱۲–۱۴|صفحات=۱۲–۱۴}}',
  r => (r.changed && (r.text.match(/۱۲–۱۴/g) ?? []).length === 1) ? null : 'one pages param should remain');

t('page and pages are DIFFERENT fields and must both survive',
  '{{یادکرد کتاب|عنوان=خ|صفحه=۱۲|صفحات=۱۲–۱۴}}',
  r => (has(r, 'صفحه=۱۲') ?? null) || (has(r, 'صفحات=۱۲–۱۴') ?? null));

// --- the never-rename rule ---
t('periodical: an equal وبگاه/اثر pair dedups but the editor name is KEPT',
  '{{یادکرد وب|عنوان=خ|وبگاه=بی‌بی‌سی|اثر=بی‌بی‌سی}}',
  r => (r.text.includes('|وبگاه=بی‌بی‌سی') && !r.text.includes('اثر='))
       ? null : 'should keep وبگاه and drop اثر, renaming neither');

t('periodical: وبگاه is NEVER renamed to نشریه, because that changes what the citation claims',
  '{{یادکرد وب|عنوان=خ|وبگاه=بی‌بی‌سی}}',
  r => (!r.changed && !r.text.includes('نشریه')) ? null : 'a lone وبگاه must not be touched at all');

t('periodical: a lone English website alias is not renamed either',
  '{{cite web|title=x|website=BBC}}',
  r => (!r.changed && r.text.includes('website=BBC')) ? null : 'website and title must both be left alone');

t('chapter: equal فصل/بخش pair dedups, keeping the editor name',
  '{{یادکرد کتاب|عنوان=خ|فصل=سه|بخش=سه}}',
  r => (r.text.includes('|فصل=سه') && !r.text.includes('بخش=')) ? null : 'keep فصل, drop بخش');

t('chapter: مقاله is not renamed to فصل',
  '{{یادکرد کتاب|عنوان=خ|مقاله=درآمد}}',
  r => (!r.changed) ? null : 'a lone مقاله must not be touched');

t('publisher: equal ناشر/انتشارات pair dedups, and no NEW name is introduced',
  '{{یادکرد کتاب|عنوان=خ|انتشارات=سمت|ناشر=سمت}}',
  r => (r.changed && (r.text.match(/سمت/g) ?? []).length === 1
        && (r.text.includes('انتشارات=سمت') || r.text.includes('ناشر=سمت')))
       ? null : 'exactly one of the two original names should remain');

t('publisher: a lone institution is left alone (cite thesis uses it for the university)',
  '{{cite thesis|title=x|institution=MIT}}',
  r => (!r.changed) ? null : 'institution must not be renamed to ناشر');

// A citation can carry several of these at once; each is handled independently.
t('several families in one citation: each handled independently',
  '{{یادکرد وب|عنوان=خ|کد زبان=en|زبان=en|تاریخ بازبینی=2020-01-01|بازیابی=2021-01-01|archive-url=http://a}}',
  r => ((r.text.match(/=en/g) ?? []).length === 1
        && r.text.includes('تاریخ بازبینی=2020-01-01') && r.text.includes('بازیابی=2021-01-01')
        && r.text.includes('پیوند بایگانی=http://a'))
       ? null : 'language dedups, the clashing access dates stay, archive-url still renames');

// --- which copy survives a dedup, now that these families never rename ---
t('dedup keeps the PERSIAN alias, not the English one that happened to come first',
  '{{یادکرد وب|عنوان=خ|accessdate=۱۴ ژوئن ۲۰۲۰|بازبینی=۱۴ ژوئن ۲۰۲۰}}',
  r => (r.text.includes('بازبینی=۱۴ ژوئن ۲۰۲۰') && !r.text.includes('accessdate'))
       ? null : 'the Persian-named parameter should be the survivor');

t('dedup keeps the Persian-DIGIT value when both spellings are the same date (the .eu case)',
  '{{یادکرد وب|عنوان=خ|accessdate=14 ژوئن 2020|بازبینی=۱۴ ژوئن ۲۰۲۰}}',
  r => (r.text.includes('بازبینی=۱۴ ژوئن ۲۰۲۰') && !r.text.includes('14 ژوئن 2020'))
       ? null : 'the Persian-digit value should survive');

t('the letterform rule still outranks the digit preference',
  // Persian digits but an ARABIC kaf, versus Latin digits and a correct keheh. The
  // module cannot read the first, so the second must win despite the Latin digits.
  '{{یادکرد وب|عنوان=خ|تاریخ بایگانی=۳ اكتبر ۲۰۲۰|archive-date=3 اکتبر 2020}}',
  r => r.text.includes('اکتبر') && !r.text.includes('اكتبر') ? null : 'the Arabic kaf must not survive');

t('a canonical name still beats a Persian alias when both are present',
  '{{یادکرد وب|عنوان=خ|بازبینی=۱۴ ژوئن ۲۰۲۰|تاریخ بازبینی=۱۴ ژوئن ۲۰۲۰}}',
  r => (r.text.includes('تاریخ بازبینی=') && !r.text.includes('|بازبینی='))
       ? null : 'تاریخ بازبینی is the canonical and should survive');

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
