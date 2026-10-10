/**
 * Unit tests for وظیفهٔ ۱۳. No network.
 *
 *   npx tsx src/tasks/task-13/move-report.test.ts
 *
 * Most of these are NEGATIVE: the real titles the old report proposed moving and was
 * wrong about. A rule engine for this job is judged by what it declines to suggest,
 * because a wrong row here becomes a wrong page move that someone has to undo.
 */
import { suggest, parseWhitelist, buildReport, RULES, type Row } from './move-report.js';

let pass = 0;
const fails: string[] = [];

function ok(what: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ✓ ${what}`); }
  else { fails.push(`${what}${detail ? ` — ${detail}` : ''}`); console.log(`  ✗ ${what} ${detail}`); }
}

function proposes(title: string, expected: string) {
  const s = suggest(title);
  ok(`${title} → ${expected}`, s?.target === expected, s ? `got «${s.target}»` : 'got no suggestion');
}

function silent(title: string, why: string) {
  const s = suggest(title);
  ok(`سکوت: ${title} (${why})`, s === null, s ? `proposed «${s.target}»` : '');
}

console.log('== rules fire on what they are for ==');
proposes('الكساندر ميلينكويچ', 'الکساندر میلینکویچ');
proposes('سفيه', 'سفیه');
proposes('رزكان', 'رزکان');
proposes('اول آمدند ...', 'اول آمدند…');
proposes('...و عدالت برای همه', '…و عدالت برای همه');
proposes('چه می‌شود اگر...؟ (مجموعه تلویزیونی)', 'چه می‌شود اگر…؟ (مجموعه تلویزیونی)');
proposes('من می‌کشم‌، تو می‌کشی', 'من می‌کشم، تو می‌کشی');
proposes('جیمز هپبورن ، ارل چهارم بوفول', 'جیمز هپبورن، ارل چهارم بوفول');
proposes('افا،کرسیکا', 'افا، کرسیکا');
proposes('مارک(ناحیه)', 'مارک (ناحیه)');
proposes('خیرون(بازیگر)', 'خیرون (بازیگر)');
proposes('دهستان قلعه نو(زهک)', 'دهستان قلعه نو (زهک)');
proposes('فرآیند شل–پاک', 'فرایند شل–پاک');
proposes('مدل در فرآیند ریخته‌گری', 'مدل در فرایند ریخته‌گری');
proposes('فدراسیون بین المللی سامبو', 'فدراسیون بین‌المللی سامبو');
proposes('توربو (نرم افزار)', 'توربو (نرم‌افزار)');

console.log('\n== the old report\'s mistakes are NOT repeated ==');
// Initial spacing: the objection that opened the thread. The rule is gone entirely,
// so neither direction is proposed.
silent('کی. پی. کانداسامی', 'فاصله‌گذاری حروف اختصاری قاعده‌ای ندارد');
silent('بی.براون', 'همان');
silent('کی.جی.اف: بخش ۱', 'همان');
silent('تریپ.کام', 'همان');
// The سایر section's ZWNJ heuristic, which could not tell a name from a compound.
silent('کمیته ملیون ایرانی', '«ملیون» درست است و «میلیون» نیست');
silent('مینامی نو تسوبانه', 'نام ژاپنی، نه ترکیب فارسی');
silent('دانشگاه اند ونزوئلا', '«اند» بخشی از نام است');
silent('بومه اند مرسیه', 'همان');
silent('جانفرانکو ترین', 'نام، نه ترکیب');
silent('هنریکا بوخنیارز', 'املای نام را حدس نمی‌زنیم');
silent('کوه هها', 'قاعدهٔ «ها» نتیجهٔ بی‌معنا می‌داد');
// Ezafe: contested, so not a rule.
silent('پایگاه دادهٔ شیمیایی', 'حذف کسرهٔ اضافه قاعدهٔ این گزارش نیست');
silent('مسئله‌ی یک‌ریختی گراف', 'همان');
// «شده است» → «شده‌است» was the old rule and is not today's convention.
silent('باد برخاسته است', '«برخاسته است» درست است');

console.log('\n== guards ==');
// Tanwin is spelling, not decoration: stripping it would corrupt a correct title.
silent('آووکادوی کاملاً سرخ‌شده', 'تنوین برداشته نمی‌شود');
proposes('درست‌نویسي‌یِ خطِ فارسي', 'درست‌نویسی‌ی خط فارسی');
// Chemistry writes the oxidation state tight against the element, and the whitelist
// is full of editors saying so. No Persian letter inside the parenthesis → no rule.
silent('۲-اتیل‌هگزانوئات قلع(II)', 'پرانتز شیمی، بدون حرف فارسی');
silent('نقره(I,III) اکسید', 'همان');
silent('اچ‌ام‌اس تمز(۱۷۵۸)', 'پرانتز بدون حرف فارسی');
// The thousands separator is not a missing space.
silent('۱،۵۰۰ (آلبوم)', 'ویرگول میان رقم‌ها');
silent('سال ۱،۰۰۰', 'همان');

console.log('\n== false positives found by auditing a full live run ==');
// A chemical name separates oxidation states with a Latin comma written tight, and the
// whitelist already records «منگنز (II, III) اکسید» as the settled title. Adding a
// space after the Persian comma would propose a title that is wrong twice.
silent('کبالت(II،III) اکسید', 'ویرگول درون نام شیمیایی');
silent('طلا(I،III) کلرید', 'همان');
silent("N'،N-دی سیکلو هگزیل کربودی ایمید", 'همان، با حرف لاتین');
silent('N،N-دی‌متیل‌آمینومتیل‌فروسن', 'همان');
// ... but a Persian comma between two Persian words is still a missing space.
proposes('گوزن شمالی،جگوار،عقاب سر سفید', 'گوزن شمالی، جگوار، عقاب سر سفید');
proposes('تیاب (منوجان،شمال)', 'تیاب (منوجان، شمال)');
// Polymer and bridged names: bracket tight against a multiplier prefix, and the
// bracket is full of Persian letters, so the oxidation-state guard cannot see it.
silent('پلی(متیل متاکریلات)', 'نام بسپار');
silent('پلی(اتیل متاکریلات)', 'همان');
silent('۴٬۴-آزوبیس(۴-سیانوپنتانویک اسید)', 'همان');
silent('سیکلوبیس(پاراکوات-پی-فنیلن)', 'همان');
// Inserting a space after a ZWNJ, a dot or a dash leaves the stray character behind,
// so the proposal would still be a wrong title.
silent('شط‌(ولاشان)', 'نیم‌فاصله پیش از پرانتز');
silent('پلی‌(پی-فنیلن اکسید)', 'همان');
silent('میانگین‌گیری گروهی‌(یادگیری ماشین)', 'همان');
silent('واتربوری.(ورمونت)', 'نقطه پیش از پرانتز');
silent('سلولز سنتاز -(تشکیل UDP)', 'خط تیره پیش از پرانتز');
// The bracket is a plural suffix, not a qualifier.
silent('آدم‌کش(ها)', '«ها» پسوند است، نه ابهام‌زدا');
// A space just inside the bracket is the same defect and closes in the same move.
proposes('داوود باقری( فوتسال)', 'داوود باقری (فوتسال)');
proposes('والکور (کبک)(شهرک)', 'والکور (کبک) (شهرک)');
// Nothing to do.
silent('تهران', 'عنوان درست است');
silent('فرایند شل–پاک', 'از پیش درست است');

console.log('\n== cumulative rules, and idempotence ==');
{
  const s = suggest('الكساندر ميلينكويچ ...');
  ok('two rules compose', s?.target === 'الکساندر میلینکویچ…', s ? `got «${s.target}»` : 'none');
  ok('both rules are recorded', JSON.stringify(s?.rules) === '["arabic-letters","ellipsis"]',
     JSON.stringify(s?.rules));
}
{
  // Every proposal must be a fixed point: re-running the rules on the target changes
  // nothing. Otherwise today's report invites a move that tomorrow's report undoes.
  const samples = ['الكساندر ميلينكويچ', 'اول آمدند ...', 'افا،کرسیکا', 'مارک(ناحیه)',
                   'فرآیند شل–پاک', 'توربو (نرم افزار)', 'من می‌کشم‌، تو می‌کشی'];
  let stable = true;
  for (const t of samples) {
    const a = suggest(t)!;
    if (suggest(a.target) !== null) { stable = false; console.log(`     unstable: ${t} → ${a.target}`); }
  }
  ok('no proposal is itself movable', stable);
}
{
  // A rule that produced an illegal title would otherwise reach the page as a redlink
  // nobody can move to.
  const s = suggest('فرآیند [عجیب]');
  ok('illegal characters are refused', s === null, s ? `proposed «${s.target}»` : '');
}

console.log('\n== whitelist parsing: the page is 1,179 hand-written lines ==');
{
  const w = parseWhitelist([
    "'''لطفاً در این صفحه از ابرابزار استفاده نکنید.'''",
    '*(جی)آیدل',
    '* خفه‌گی (فیلم)',
    '*اگر....',
    '* سولفید آهن (II, III)',
    '** مینامی، توکوشیما',
    '*[[کینک.کام]]',
    '*[[گفت‌وگو|گفتگو]]',
    '*عنوان_با_زیرخط',
    'یک خط معمولی که مورد فهرست نیست',
    '== بخش ==',
  ].join('\n'));
  ok('bare entry without a space', w.has('(جی)آیدل'));
  ok('entry with a leading space', w.has('خفه‌گی (فیلم)'));
  ok('entry with trailing dots', w.has('اگر....'));
  ok('chemistry entry', w.has('سولفید آهن (II, III)'));
  ok('nested bullet', w.has('مینامی، توکوشیما'));
  ok('wikilink entry', w.has('کینک.کام'));
  ok('piped wikilink keeps the target', w.has('گفت‌وگو'));
  ok('underscores become spaces', w.has('عنوان با زیرخط'));
  ok('prose is not an entry', !w.has('یک خط معمولی که مورد فهرست نیست'), [...w].join(' | '));
  ok('heading is not an entry', ![...w].some(e => e.includes('بخش')));
  ok('bold markup is stripped from a whole-line entry', !w.has("'''لطفاً"));
}

console.log('\n== report rendering ==');
{
  const rows: Row[] = [
    { title: 'سفيه', target: 'سفیه', rules: ['arabic-letters'], targetState: 'free' },
    { title: 'رزكان', target: 'رزکان', rules: ['arabic-letters'], targetState: 'redirect' },
    { title: 'اول آمدند ...', target: 'اول آمدند…', rules: ['ellipsis'], targetState: 'free' },
    { title: 'الكساندر ...', target: 'الکساندر…', rules: ['arabic-letters', 'ellipsis'], targetState: 'free' },
  ];
  const text = buildReport(rows, { scanned: 1_070_000, whitelisted: 12, occupied: 3 },
                           new Date('2026-10-04T00:00:00Z'));
  ok('header template is transcluded', text.includes('{{گزارش دیتابیس/صفحه برای انتقال}}'));
  ok('whitelist is advertised', text.includes('/فهرست سفید|فهرست سفید]]'));
  ok('digits are Persian', text.includes('۴ اکتبر ۲۰۲۶') && !/\d/.test(text.split('آخرین')[1].split('\n')[0]));
  ok('one section per firing rule', (text.match(/^== /gm) ?? []).length === 2,
     JSON.stringify(text.match(/^== /gm)));
  ok('each rule explains itself', text.includes(RULES[0].explain));
  ok('row carries a move link', text.includes('Special:MovePage/%D8%B3%D9%81%D9%8A%D9%87'));
  ok('redirect target is flagged', text.includes('(مقصد تغییرمسیر است)'));
  ok('second rule is noted on the row', text.includes('<small>(سه‌نقطه)</small>'));
  ok('categorised', text.trimEnd().endsWith('[[رده:گزارش‌های دیتابیس ویکی‌پدیا]]'));
  // An article already sitting on the target is a merge question, not a move.
  const occupied = buildReport(
    [{ title: 'دخمه زرتشتيان (ابهام‌زدایی)', target: 'دخمه زرتشتیان (ابهام‌زدایی)',
       rules: ['arabic-letters'], targetState: 'article' }],
    { scanned: 10, whitelisted: 0, occupied: 1 });
  ok('occupied target is not listed', !occupied.includes('دخمه زرتشتيان'));
  ok('empty report says so', occupied.includes('موردی یافت نشد'));
}
{
  // Titles with characters that are special in a URL must still produce a usable link.
  // An ASCII «?» inside a title would otherwise end the URL path and swallow the
  // wpNewTitleMain parameter, so the move link would open the wrong form.
  const ascii = buildReport(
    [{ title: 'اگر? ...', target: 'اگر?…', rules: ['ellipsis'], targetState: 'free' }],
    { scanned: 1, whitelisted: 0, occupied: 0 });
  ok('ASCII question mark is escaped', ascii.includes('%3F'));
  ok('only one real «?» in the URL', (ascii.match(/MovePage\/[^ ]+/)![0].match(/\?/g) ?? []).length === 1,
     ascii.match(/MovePage\/[^ ]+/)![0]);
  // The Persian «؟» is a different character and encodeURI handles it as a normal
  // non-ASCII letter; it must not be left raw either.
  const persian = buildReport(
    [{ title: 'چه می‌شود اگر...؟ (الف)', target: 'چه می‌شود اگر…؟ (الف)',
       rules: ['ellipsis'], targetState: 'free' }],
    { scanned: 1, whitelisted: 0, occupied: 0 });
  ok('Persian question mark is percent-encoded', persian.includes('%D8%9F') && !persian.includes('؟_(الف)'));
}


console.log('\n== ellipsis spacing, the three rules Huji gave ==');
{
  // «سه‌نقطه‌ای که وسط یا پایان عبارت است باید به بخش قبلی بچسبد. سه‌نقطه که وسط عبارت
  //  است باید بعدش فاصله باشد. سه‌نقطه‌ای که در ابتدای عبارت است نباید بعدش فاصله باشد.»
  // وظیفهٔ ۱۳ request page, ۹ اکتبر ۲۰۲۶. His own two worked examples first.
  proposes('... اما جداً', '…اما جداً');
  proposes('دوستت دارم...آقای هنرمند!', 'دوستت دارم… آقای هنرمند!');

  // start: nothing after it
  proposes('... و عدالت برای همه', '…و عدالت برای همه');
  silent('…عزیزم یک بار دیگر', 'already correct at the start');

  // end: attaches, nothing after
  proposes('تا نفس هست ...', 'تا نفس هست…');
  silent('خانه‌ام ابری است…', 'already correct at the end');

  // middle: attaches, exactly one space after
  proposes('سکوت ... شب ترس', 'سکوت… شب ترس');
  proposes('می‌ره...می‌ره...رفت!', 'می‌ره… می‌ره… رفت!');
  silent('گاهی برمی‌گردند… دوباره', 'already correct in the middle');

  // closing punctuation takes no space before it; an OPENING bracket does
  proposes('من متهم می‌کنم...!', 'من متهم می‌کنم…!');
  silent('چه می‌شود اگر…؟ (مجموعه تلویزیونی)', 'question mark closes, bracket opens');
  silent('سکس (من یک…)', 'tight inside a bracket is correct');
  silent('۱۹۸۳… (دریامردی که باید به آن تبدیل شوم)', 'space before an opening bracket stays');

  // the character is already right but the spacing is not — invisible to the old rule,
  // which only ever replaced three dots
  proposes('سکوت … شب ترس', 'سکوت… شب ترس');
  proposes('تا نفس هست …', 'تا نفس هست…');

  // the comma rule must not push the ellipsis away from what it just attached to
  proposes('یک، دو، سه،... پنج', 'یک، دو، سه،… پنج');

  // four dots used to become «….» — an ellipsis plus a stray dot
  proposes('قانون....', 'قانون…');

  // a series ellipsis is a TERM, not punctuation: «+…» is wrong in maths typography
  silent('۱ − ۲ + ۳ − ۴ + …', 'the ellipsis is a term in the series');
  proposes('... + ۴ + ۳ + ۲ + ۱', '… + ۴ + ۳ + ۲ + ۱');   // dots fixed, spacing left alone
}

console.log('\n== Latin digits and commas, measured against the live corpus ==');
{
  // Asked for on the report's talk page. The population was measured before any rule was
  // written: 1,219 ns0 titles carry a Latin digit, only 152 also carry Persian letters,
  // and nearly all of those are identifiers where the Latin digit IS the name. So the
  // rule is anchored on «سال»/«زاده», never on the digits.
  proposes('فهرست فروش فیلم‌های ایرانی در سال 1368', 'فهرست فروش فیلم‌های ایرانی در سال ۱۳۶۸');
  proposes('برایان مک لاولین (بازیکن فوتبال, زاده 1974)', 'برایان مک لاولین (بازیکن فوتبال، زاده ۱۹۷۴)');

  silent('افلاتوکسین B1', 'a chemical designator');
  silent('ویروس آنفلوانزای نوع A زیرگروه H5N1', 'a virus subtype');
  silent('ژن TCOF1', 'a gene symbol');
  silent('پرلود و فوگ در دو ماژور (BWV 870)', 'a catalogue number');
  silent('نوکیا X2-02', 'a model number');
  silent('الگوریتم C4.5', 'an algorithm name');
  silent('مسیر SEA-ME-WE-3', 'a cable name');
  // «متولد» was missing at first and the live report proposed a title that still had a
  // Latin year in it. Both halves must fire on the same title.
  proposes('ژائو پدرو (بازیکن فوتبال, متولد 1993)', 'ژائو پدرو (بازیکن فوتبال، متولد ۱۹۹۳)');

  // A Latin comma is correct inside a chemical name, and every such title has a LATIN
  // letter immediately before it — which is what separates them from a disambiguator
  // comma typed on the wrong keyboard.
  proposes('چارلی دیکسون (زاده ۱۸۹۱, بازیکن فوتبال اهل انگلستان)',
           'چارلی دیکسون (زاده ۱۸۹۱، بازیکن فوتبال اهل انگلستان)');
  silent('N,N-دی‌ایزوپروپیل‌آمینو اتانول', 'locants in a chemical name');
  silent('(R,R)-تترا هیدروکریزن', 'stereodescriptors');
  silent('سولفید آهن (II, III)', 'oxidation states');
  silent('(۸z,۶z,۴z,۲z)-تیونین', 'locants: Persian digits but Latin letters');

  // Measured and deliberately given NO rule: «درگذشته», «دهه» and «قرن» match no title,
  // and the only Latin «?» and «;» titles are intentional.
  silent('¿¡انقلاب!?', 'Spanish punctuation, deliberate');
  silent('اموتیکون ;)', 'an emoticon article');
}

console.log(`\n${pass} گذشت، ${fails.length} افتاد`);
if (fails.length) { console.error('failing:\n  - ' + fails.join('\n  - ')); process.exit(1); }
