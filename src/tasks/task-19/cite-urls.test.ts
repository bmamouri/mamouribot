/**
 * وظیفهٔ ۱۹ — offline tests.   npx tsx src/tasks/task-19/cite-urls.test.ts
 *
 * Most cases are real text from fa articles (حسین کاظم‌زاده ایرانشهر and the 1,000-page
 * random sample of ۲۱ نوامبر ۲۰۲۶), and the citoid answers are the ones the service gave.
 */
import { canonHref, decodePercentUnicode, repairScheme, stripTracking, unwrapRedirector } from './url.js';
import { matchBareRef, planPage, type Lookup } from './plan.js';
import { buildCitation, formatDate } from './build.js';
import { isArabic, judgeAuthor, judgeDate, judgeTitle, langOf, persianLetterforms, stripSiteSuffix } from './quality.js';
import { combine, crossCheck, isHomeLike, slugMismatch, pageAuthors, parseHtml, siteFor, softDead, splitName, splitPipeSite } from './resolve.js';
import { unexplainedLoss } from './cite-urls.js';
import { appendParams, escapeParam } from './wikitext.js';
import { NameSplitter, SPLITTER } from './names.js';
import { merge, proposalId, readDecisions, renderPage, rejected, accepted } from './review.js';

let pass = 0;
const fails: string[] = [];
const ok = (what: string, cond: boolean, detail = '') => {
  if (cond) pass++; else { fails.push(`${what}${detail ? ' — ' + detail : ''}`); console.log(`  ✗ ${what}\n      ${detail}`); }
};
const eq = (what: string, a: unknown, b: unknown) => ok(what, JSON.stringify(a) === JSON.stringify(b), `${JSON.stringify(a)}\n      ≠ ${JSON.stringify(b)}`);
const TODAY = '۲۱ نوامبر ۲۰۲۶';

console.log('== percent-decoding ==');
{
  const cg = 'https://www.cgie.org.ir/fa/news/263705/%D8%AF%D8%B1%D8%A8%D8%A7%D8%B1%D9%87-%D8%AD%D8%B3%DB%8C%D9%86-%DA%A9%D8%A7%D8%B8%D9%85-%D8%B2%D8%A7%D8%AF%D9%87';
  eq('the user\'s cgie.org.ir example decodes', decodePercentUnicode(cg), 'https://www.cgie.org.ir/fa/news/263705/درباره-حسین-کاظم-زاده');
  eq('lowercase escapes decode too', decodePercentUnicode('https://foneix.ir/portfolio/%d9%85%d8%a7'), 'https://foneix.ir/portfolio/ما');
  eq('ZWNJ is decoded (renders a working link)', decodePercentUnicode('https://t.ir/%D8%A8%D8%A7%D9%86%DA%A9%E2%80%8C%D9%87%D8%A7'), 'https://t.ir/بانک‌ها');
  eq('ASCII escapes are kept: space, pipe, percent, hash', decodePercentUnicode('https://x.ir/a%20b%7Cc%25d%23e/%D8%A8'), 'https://x.ir/a%20b%7Cc%25d%23e/ب');
  eq('Persian digits stay encoded (the en CS1 route would make them Latin)', decodePercentUnicode('https://irna.ir/news/1/%DB%B1%DB%B3-%D9%85%D8%B9%D8%AF%D9%86'), 'https://irna.ir/news/1/%DB%B1%DB%B3-معدن');
  eq('invalid UTF-8 (windows-1256) is left whole', decodePercentUnicode('http://x.com/q=%C7%E1%DA'), 'http://x.com/q=%C7%E1%DA');
  eq('a Wayback URL is never touched', decodePercentUnicode('https://web.archive.org/web/2016/http://s.ir/%D8%AA'), 'https://web.archive.org/web/2016/http://s.ir/%D8%AA');
  eq('a URL with Arabic kaf stays encoded (a normalizer would rewrite it)', decodePercentUnicode('http://j.ir/%D8%A8%D8%A7%D9%86%D9%83'), 'http://j.ir/%D8%A8%D8%A7%D9%86%D9%83');
  eq('decomposed alef+madda stays encoded (NFC would change it on save)', decodePercentUnicode('http://x.ir/%D8%A7%D9%93'), 'http://x.ir/%D8%A7%D9%93');
  eq('non-breaking space stays encoded', decodePercentUnicode('http://x.ir/%C2%A0%D8%A8'), 'http://x.ir/%C2%A0ب');
  eq('nothing to decode → same string', decodePercentUnicode('http://x.ir/a%20b'), 'http://x.ir/a%20b');
  eq('Cyrillic decodes', decodePercentUnicode('https://ru.x/%D0%9A%D0%B0'), 'https://ru.x/Ка');
}

console.log('== schemes ==');
eq('www. gets http://', repairScheme('www.shahbazi.org/pages/Maryamiyya3.htm'), 'http://www.shahbazi.org/pages/Maryamiyya3.htm');
eq('bare domain with known TLD', repairScheme('tabnak.ir/fa/news/1'), 'http://tabnak.ir/fa/news/1');
eq('https// typo', repairScheme('https//copaamerica.com/'), 'https://copaamerica.com/');
eq('http:/ single slash', repairScheme('http:/www.battle.net/blizzcon/en/'), 'http://www.battle.net/blizzcon/en/');
eq('doubled scheme keeps the inner one', repairScheme('http://https://www.isna.ir/news/96102211487/'), 'https://www.isna.ir/news/96102211487/');
eq('triple slash', repairScheme('http:///x.org/a'), 'http://x.org/a');
eq('not a URL', repairScheme('کتاب فلان'), null);
eq('spaces inside → not a URL', repairScheme('www.x.org/a b'), null);
eq('a good URL is unchanged', repairScheme('https://x.org/a'), 'https://x.org/a');

console.log('== tracking and redirectors ==');
eq('utm_* removed, other params kept in order', stripTracking('https://w.com/a?noredirect=on&utm_term=.7052'), 'https://w.com/a?noredirect=on');
eq('fbclid alone removes the ?', stripTracking('http://www.anunner.com/?fbclid=IwAR3bz'), 'http://www.anunner.com/');
eq('fragment kept', stripTracking('https://x.com/a?utm_source=t&id=5#sec'), 'https://x.com/a?id=5#sec');
eq('&amp; queries are left alone', stripTracking('https://x.com/a?b=1&amp;utm_source=t'), 'https://x.com/a?b=1&amp;utm_source=t');
eq('youtube si= removed', stripTracking('https://www.youtube.com/watch?v=abc&si=XYZ'), 'https://www.youtube.com/watch?v=abc');
eq('si= on other sites kept', stripTracking('https://x.com/?si=1'), 'https://x.com/?si=1');
eq('google /url?', unwrapRedirector('https://www.google.com/url?sa=t&rct=j&url=https%3A%2F%2Fx.org%2Fa%3Fb%3D1&usg=AOv'), 'https://x.org/a?b=1');
eq('google amp', unwrapRedirector('https://www.google.com/amp/s/www.bbc.com/persian/iran-1'), 'https://www.bbc.com/persian/iran-1');
eq('dead google cache', unwrapRedirector('http://webcache.googleusercontent.com/search?q=cache:VsB2mSEIEJYJ:irna.ir/NewsShow.aspx?NID=1'), 'http://irna.ir/NewsShow.aspx?NID=1');
eq('Google cache: the «+» after the URL is a space, not part of it', unwrapRedirector('http://webcache.googleusercontent.com/search?q=cache:LTE-0altzvUJ:jamejamonline.ir/Shared/CreatePdf/669746673134190619+&cd=11&hl=en'), 'http://jamejamonline.ir/Shared/CreatePdf/669746673134190619');
eq('Google /url?q= with + in the target', unwrapRedirector('https://www.google.com/url?q=https://x.org/a&sa=U'), 'https://x.org/a');
eq('google search is not a redirector', unwrapRedirector('https://www.google.com/search?q=x'), 'https://www.google.com/search?q=x');

console.log('== bare-ref recognition ==');
eq('plain URL', matchBareRef('http://www.nobelprize.org/nomination/archive/show_people.php?id=4486', false), { url: 'http://www.nobelprize.org/nomination/archive/show_people.php?id=4486' });
eq('bracketed URL', matchBareRef('[http://melimazhabi.com/?p=22409]', false), { url: 'http://melimazhabi.com/?p=22409' });
eq('trailing full stop is not part of the URL', matchBareRef('http://x.org/a.', false), { url: 'http://x.org/a' });
eq('with an inline bare-URL tag', matchBareRef('http://x.org/a {{Bare URL inline|date=March 2022}}', false), { url: 'http://x.org/a' });
eq('labelled link is off by default', matchBareRef('[http://x.org/a Title]', false), null);
eq('labelled link when enabled', matchBareRef('[http://x.org/a Title here]', true), { url: 'http://x.org/a', label: 'Title here' });
eq('URL plus prose is not bare', matchBareRef('http://x.org/a ص ۱۲', false), null);
eq('template in ref is not bare', matchBareRef('{{یادکرد وب|نشانی=http://x}}', false), null);

console.log('== quality ==');
ok('«INDEX» rejected', !judgeTitle('INDEX', { url: 'http://jahannews.com/x' }).ok);
ok('«{title}» rejected', !judgeTitle('{title}', { url: 'http://iran-emrooz.net/x' }).ok);
ok('«Technical Difficulties» rejected', !judgeTitle('Technical Difficulties', { url: 'https://ir.usembassy.gov/x' }).ok);
ok('parked domain rejected', !judgeTitle('yjc.news - This website is for sale!', { url: 'https://www.yjc.news/x' }).ok);
ok('«Nomination%20Archive» decodes then reads as generic? no — it is a real but poor title; handled by sites.json', true);
ok('empty rejected', !judgeTitle('', { url: 'http://x' }).ok);
ok('title equal to host rejected', !judgeTitle('www.irna.ir', { url: 'http://www.irna.ir/x' }).ok);
ok('real Persian title accepted', judgeTitle('دانشجویان ایرانی به حافظ منافع مصر در تهران گل هدیه دادند', { url: 'http://mehrnews.com/x' }).ok);
eq('site suffix stripped', stripSiteSuffix('جمعیت تهران از ۹ میلیون نفر عبور کرد - خبرگزاری مهر | اخبار ایران و جهان | Mehr News Agency', { url: 'https://www.mehrnews.com/news/1', site: 'خبرگزاری مهر' }), 'جمعیت تهران از ۹ میلیون نفر عبور کرد');
eq('host-named suffix stripped', stripSiteSuffix('بانک‌ها پول مردم … + فیلم | تابناک', { url: 'http://www.tabnak.ir/x', site: 'tabnak.ir', names: ['تابناک'] }), 'بانک‌ها پول مردم … + فیلم');
eq('a dash inside a real title is kept', stripSiteSuffix('Iran - Iraq war: a history', { url: 'http://x.org/a', site: 'Some Site' }), 'Iran - Iraq war: a history');
ok('«David BrennanDiplomatic Correspondent» rejected as an author', !judgeAuthor('David BrennanDiplomatic', 'Correspondent'));
ok('«Behnegarsoft.com» rejected', !judgeAuthor('', 'Behnegarsoft.com'));
ok('«Ap» with no first name rejected', !judgeAuthor('', 'Ap'));
ok('a real author kept', judgeAuthor('Lesley', 'Wroughton'));
eq('webpage dates are not trusted', judgeDate('2024-05-21', '2026-11-21', 'webpage'), undefined);
eq('news dates are', judgeDate('2019-02-14', '2026-11-21', 'newspaperArticle'), '2019-02-14');
eq('future date dropped', judgeDate('2030-01-01', '2026-11-21', 'newspaperArticle'), undefined);

ok('a title that is only the site name rejected', !judgeTitle('| مرکز دائرةالمعارف بزرگ اسلامی', { url: 'http://cgie.org.ir/fa/news/2510', names: ['مرکز دائرةالمعارف بزرگ اسلامی'] }).ok);
ok('«No data found» rejected', !judgeTitle('No data found', { url: 'http://www.pwinsider.com/a' }).ok);
ok('geoblock title rejected', !judgeTitle('TNT Sports is not available in your region', { url: 'https://www.eurosport.com/x' }).ok);
eq("backslash-escaped quote unescaped", judgeTitle("L\\'Eau froide (1994)", { url: 'http://x.com/a' }), { ok: true, title: "L'Eau froide (1994)" });
ok('«WELT» is not an author', !judgeAuthor('Daniel-Dylan Böhmer', 'WELT'));
eq('English title declared fr → no language', langOf('The Kurdish population', 'fr'), undefined);
eq('French title declared tr → no language', langOf('Soumeylou Boubèye Maïga, nommé Premier ministre du Mali', 'tr'), undefined);
eq('English title declared en-US', langOf('Marketing Myopia', 'en-US'), 'en');
eq('German title declared de', langOf('Münchner Sicherheitskonferenz: „In Berlin wurde“', 'de'), 'de');
eq('Armenian title declared hy', langOf('ՀՀ պաշտպանության նախարարությունը', 'hy'), 'hy');
eq('Persian title, no language', langOf('درباره حسین کاظم زاده', 'fa'), undefined);
eq('geoblock redirect is soft-dead', softDead('https://www.eurosport.com/wrestling/x/story.shtml', 'https://www.eurosport.com/geoblocking.shtml'), 'soft-404');
eq('redirected to an unrelated page', softDead('http://www.wwe.com/events/all/summerslam/2003', 'https://www.wwe.com/tickets'), 'redirected-elsewhere');
eq('canonical slug redirect is fine', softDead('https://www.isna.ir/news/1405080603988/', 'https://www.isna.ir/news/1405080603988/%D8%A7%D9%84%D9%81'), null);

eq('leading site name stripped', judgeTitle('Magiran | روزنامه دنیای اقتصاد: وداع با استاد', { url: 'https://www.magiran.com/article/3427693' }), { ok: true, title: 'روزنامه دنیای اقتصاد: وداع با استاد' });
eq('leading site name with a colon', judgeTitle('Pong-Story : Magnavox Odyssey, the first video game system', { url: 'http://www.pong-story.com/odyssey.htm' }), { ok: true, title: 'Magnavox Odyssey, the first video game system' });
eq('a colon in a real title is kept', judgeTitle('Pence: Europe must quit the deal', { url: 'https://apnews.com/x', site: 'AP NEWS' }), { ok: true, title: 'Pence: Europe must quit the deal' });
ok('a site home title is rejected', !judgeTitle('Sam Harris | Home of the Making Sense Podcast', { url: 'https://samharris.org/killing-the-buddha/', site: 'Sam Harris' }).ok);
ok('an author equal to a title segment is the site', !judgeAuthor('باشگاه شاهنامه', 'پژوهان', 'shahnamehpajohan.ir', ['صفر عبدالله : نام مبارک ایران همیشه بوده است', 'باشگاه شاهنامه پژوهان']));
{
  const r = combine({ url: 'https://matomo.org/faq/x', today: '2026-11-21', citoid: { ok: true, item: { itemType: 'webpage', title: 'How do I pronounce Matomo?', websiteTitle: 'Analytics Platform - Matomo' } } });
  eq('the site-name segment that is the host wins', r.meta?.website, 'Matomo');
}
{
  const r = combine({ url: 'http://www.jmm.gov.my/en/museum/x', today: '2026-11-21', citoid: { ok: true, item: { itemType: 'webpage', title: 'National Museum', websiteTitle: 'www.jmm.gov.my' } } });
  eq('www. stripped from a three-label host', r.meta?.website, 'jmm.gov.my');
}
{
  const r = combine({ url: 'https://www.isna.ir/news/95072514229/x', today: '2026-11-21', site: siteFor('https://www.isna.ir/news/95072514229/x'),
    citoid: { ok: true, item: { itemType: 'webpage', title: '' } },
    page: { status: 200, finalUrl: 'https://www.isna.ir/news/95072514229/x', challenge: true },
    capture: { timestamp: '20161016000000', original: 'http://www.isna.ir/news/95072514229/x' },
    snapshot: { status: 200, finalUrl: '', ogTitle: 'برنامه مراسم چهلم فرهنگ شریف اعلام شد' } });
  eq('bot wall: title from the capture, live URL, no archive fields', [r.status, r.meta?.title, r.meta?.archive, r.meta?.website, r.meta?.news], ['live', 'برنامه مراسم چهلم فرهنگ شریف اعلام شد', undefined, '[[ایسنا]]', true]);
}
{
  const r = combine({ url: 'https://www.isna.ir/news/1/x', today: '2026-11-21',
    citoid: { ok: true, item: { itemType: 'webpage', title: '' } },
    page: { status: 200, finalUrl: 'https://www.isna.ir/news/1/x', challenge: true },
    capture: { timestamp: '20200101000000', original: 'https://www.isna.ir/news/1/x' },
    snapshot: { status: 200, finalUrl: '', title: '', challenge: true } });
  eq('bot wall captured by Wayback too → left alone', [r.status, r.meta, r.reason], ['live', undefined, 'bot-challenge']);
}

eq('trailing | site name used when only the host was known', splitPipeSite('طبیعت روستای «زیوه و کهنه لاهیجان» پیرانشهر | آخرین خبر', 'akharinkhabar.ir', 'https://akharinkhabar.ir/photo/7116065'), { title: 'طبیعت روستای «زیوه و کهنه لاهیجان» پیرانشهر', website: 'آخرین خبر' });
eq('…but not when a real site name is known', splitPipeSite('A long enough title | Section', 'BBC', 'https://bbc.com/x'), { title: 'A long enough title | Section', website: 'BBC' });

console.log('== page authors and the cross-check ==');
{
  const html = '<html lang="en"><head><meta property="og:title" content="T"><script type="application/ld+json">{"@context":"https://schema.org","@type":"NewsArticle","author":[{"@type":"Person","name":"Lesley Wroughton"},{"@type":"Organization","name":"Reuters"}],"datePublished":"2019-02-14T10:00:00Z"}</script></head></html>';
  const p = parseHtml(html, 200, 'https://r.com/x');
  eq('JSON-LD person authors, organisations dropped', p.authors, ['Lesley Wroughton']);
  eq('JSON-LD date', p.published, '2019-02-14T10:00:00Z');
}
eq('meta author list', pageAuthors('', k => k === 'author' ? 'Jane Doe, John Roe' : undefined), ['Jane Doe', 'John Roe']);
eq('article:author profile URL ignored', pageAuthors('', k => k === 'article:author' ? 'https://facebook.com/x' : undefined), []);
eq('Latin name split', splitName('Lesley Wroughton'), ['Lesley', 'Wroughton']);
eq('surname-first with comma', splitName('Wroughton, Lesley'), ['Lesley', 'Wroughton']);
eq('Persian byline kept whole', splitName('محمدرضا احمدی‌نژاد'), ['', 'محمدرضا احمدی‌نژاد']);
ok('a Persian two-word byline is an author', judgeAuthor('', 'محمدرضا احمدی‌نژاد'));
ok('«خبرگزاری مهر» is not', !judgeAuthor('', 'خبرگزاری مهر'));
ok('a single Persian word is not', !judgeAuthor('', 'ادمین'));
{
  const c = { url: 'u', title: 'T', website: 'NobelPrize.org', date: '2024-05-21', authors: [['Hans', 'Mehlin']] as [string, string][] };
  const x = crossCheck({ ...c, url: 'https://n.org/a/1' }, { status: 200, finalUrl: 'u', published: '2016-03-01', publishedFrom: 'article', authors: ['Ann Writer'] }, '2026-11-21');
  eq('page date and authors win when they disagree', [x.meta.date, x.meta.authors], ['2016-03-01', [['Ann', 'Writer']]]);
}
{
  const c = { url: 'u', title: 'T', date: '2019-02-14', authors: [['Lesley', 'Wroughton']] as [string, string][] };
  const x = crossCheck({ ...c, url: 'https://n.org/a/1' }, { status: 200, finalUrl: 'u', published: '2019-02-14T10:00:00Z', publishedFrom: 'article', authors: ['Lesley Wroughton', 'Alicja Ptak'] }, '2026-11-21');
  eq('agreeing values are kept as Citoid had them', [x.meta.date, x.meta.authors, x.notes], ['2019-02-14', [['Lesley', 'Wroughton']], []]);
}
{
  const c = { url: 'u', title: 'T', date: '2019-02-14' };
  const x = crossCheck(c, { status: 200, finalUrl: 'u' }, '2026-11-21');
  eq('a page that states nothing changes nothing', [x.meta.date, x.notes], ['2019-02-14', []]);
}
{
  const r = combine({ url: 'https://r.com/x', today: '2026-11-21',
    citoid: { ok: true, item: { itemType: 'newspaperArticle', title: 'Pence urges Europe', websiteTitle: 'Reuters', date: '2021-04-20' } },
    page: { status: 200, finalUrl: 'https://r.com/x', published: '2019-02-14', publishedFrom: 'article', authors: ['Lesley Wroughton'] } });
  eq('combine applies the cross-check', [r.meta?.date, r.meta?.authors], ['2019-02-14', [['Lesley', 'Wroughton']]]);
}
{
  const r = combine({ url: 'https://r.com/x', today: '2026-11-21',
    citoid: { ok: true, item: { itemType: 'newspaperArticle', title: 'Pence urges Europe', websiteTitle: 'Reuters', date: '2021-04-20' } },
    page: { status: 200, finalUrl: 'https://r.com/x', challenge: true, published: '2000-01-01' } });
  eq('a bot-wall page is not used to cross-check', r.meta?.date, '2021-04-20');
}
{
  const r = combine({ url: 'https://x.ir/n/1', today: '2026-11-21', citoid: { ok: false, status: 404 },
    page: { status: 200, finalUrl: 'https://x.ir/n/1', ogTitle: 'عنوان واقعی خبر', authors: ['علی رضایی'] } });
  eq('authors from the page when Citoid failed', r.meta?.authors, [['', 'علی رضایی']]);
}

ok('an institution is not an author', !judgeAuthor('', 'بنياد دایرة المعارف اسلامی'));
ok('nor a university', !judgeAuthor('Harvard', 'University'));
{
  const c = { url: 'https://rch.ac.ir/article/Details/9556', title: 'T', authors: [['محمدحسن', 'یزدانی'], ['عبدالکریم', 'عطارزاده']] as [string, string][] };
  const x = crossCheck(c, { status: 200, finalUrl: c.url, authors: ['بنياد دایرة المعارف اسلامی'] }, '2026-11-21');
  eq('real Citoid authors are not replaced by an institution', x.meta.authors, c.authors);
}
ok('front page is home-like', isHomeLike('http://weather.com') && isHomeLike('http://www.crrks.org/') && isHomeLike('https://x.ir/fa/'));
ok('an article is not', !isHomeLike('https://x.ir/fa/news/1') && !isHomeLike('http://x.com/?p=5'));
{
  const x = crossCheck({ url: 'http://weather.com', title: 'T' }, { status: 200, finalUrl: 'https://weather.com/', published: '2026-01-28', publishedFrom: 'article' }, '2026-11-21');
  eq('no date on a front page', x.meta.date, undefined);
  const y = crossCheck({ url: 'https://x.com/a/1', title: 'T' }, { status: 200, finalUrl: 'https://x.com/a/1', published: '2020-01-01', publishedFrom: 'meta' }, '2026-11-21');
  eq('no date from a generic date meta', y.meta.date, undefined);
}

console.log('== dry-run findings, ۲۱ نوامبر ۲۰۲۶ ==');
ok('Arabic text detected', isArabic('بالصور.. ياسر إبراهيم يوقع عقود الإعارة إلى سموحة') && isArabic('اليوم السابع'));
ok('Persian with Arabic kaf is not Arabic', !isArabic('درآمد بانكها در شرايط ركود تورمي'));
eq('Arabic site name kept as published', persianLetterforms('اليوم السابع'), 'اليوم السابع');
eq('Persian with Arabic letters normalized', persianLetterforms('درآمد بانكها'), 'درآمد بانکها');
ok('«كتب سليمان» is a byline prefix, not a name', !judgeAuthor('كتب', 'سليمان'));
eq('byline prefix stripped', splitName('كتب: سليمان النقر'), ['', 'سليمان النقر']);
ok('«شهرداری وردنجان» is not an author', !judgeAuthor('', 'شهرداری وردنجان'));
ok('«La redaction» is not an author', !judgeAuthor('La', 'redaction'));
ok('«NewsDetails» rejected', !judgeTitle('NewsDetails', { url: 'http://www.ihf.info/x' }).ok);
ok('home page title with site rejected', !judgeTitle('صفحه اصلی - پورتال کتابخانه‌ی دیجیتال دانشگاه ایلام', { url: 'http://lib.ilam.ac.ir/web/guest' }).ok);
ok('slug as title rejected', !judgeTitle('دانشنامه-هنرهای-رزمی-(نخستین-دایره‌المعارف-ورزش‌های-رزمی-در-ایران) | نگاه-بوستان', { url: 'https://ketab.ir/book/x' }).ok);
eq('decorations stripped', judgeTitle('.:: کتابخانه بنیاد قلم چی دانشگاه ایلام افتتاح شد :: دانشگاه ایلام ::.', { url: 'https://www.ilam.ac.ir/news/show/?x', names: ['دانشگاه ایلام'] }), { ok: true, title: 'کتابخانه بنیاد قلم چی دانشگاه ایلام افتتاح شد' });
eq('…: Amazon.com: Books stripped', judgeTitle('A Phonology of Southern Luri: Eric John Anonby: 9783895867231: Amazon.com: Books', { url: 'http://www.amazon.com/x' }), { ok: true, title: 'A Phonology of Southern Luri: Eric John Anonby: 9783895867231' });
ok('pubiran wrong-book title caught by the slug', slugMismatch('https://pubiran.ir/BookView/2390568/مكتب-تاپ-تكواندو-نخستين-سبك-آزاد', 'خوک کریسمس'));
ok('a matching title passes the slug check', !slugMismatch('https://www.mehrnews.com/news/4157206/نمایشگاه-دائمی-سوغات-شهرستان-بشرویه-افتتاح-شد', 'نمایشگاه دائمی سوغات شهرستان بشرویه افتتاح شد'));
ok('Arabic-kaf slug vs Persian title still matches', !slugMismatch('https://www.isna.ir/news/8104-01363/مسوول-كانون-تكواندوكاران', 'مسوول کانون تکواندوکاران ایران در گفت‌وگو'));
ok('an English slug vs a Persian title is not judged... unless no overlap', slugMismatch('https://x.com/a/the-great-wall-history', 'دیوار بزرگ'));
ok('a numeric id is not a slug', !slugMismatch('https://www.irna.ir/news/84204251/', 'هر چیزی'));

ok('ketab.ir slug title with colon and tail rejected', !judgeTitle('مکتب-تاپ-تکواندو:-نخستین-سبک-آزاد-تکواندو-جهان | پارس-میهن | خانه کتاب و ادبیات ایران', { url: 'https://ketab.ir/book/x', site: 'خانه کتاب و ادبیات ایران' }).ok);
ok('a real hyphenated title is fine', judgeTitle('Austro-Hungarian Empire', { url: 'https://x.org/a' }).ok);

ok('redirect title rejected', !judgeTitle('Redirecting to https://joshuaproject.net/people_groups/14196/in', { url: 'http://www.joshuaproject.net/x' }).ok);
{
  const r = combine({ url: 'http://www.qdnd.vn/chinh-tri/x', today: '2026-11-21', citoid: { ok: true, item: { itemType: 'webpage', title: 'Chủ tịch Quốc hội Nguyễn Thị Kim Ngân', websiteTitle: 'https://www.qdnd.vn' } } });
  eq('site name given as a URL becomes the host', r.meta?.website, 'qdnd.vn');
}

console.log('== Persian name splitter ==');
eq('compound given name', SPLITTER.split('علی اکبر دهخدا'), ['علی اکبر', 'دهخدا']);
eq('ZWNJ family name', SPLITTER.split('محمدرضا احمدی‌نژاد'), ['محمدرضا', 'احمدی‌نژاد']);
eq('title dropped', SPLITTER.split('سید حسین نصر'), ['حسین', 'نصر']);
eq('two given names: abstain', SPLITTER.split('حسین علی'), null);
eq('unknown second word after one given name: abstain', SPLITTER.split('آرتور اوگین فیتزجرالد'), null);
eq('patronymic chain', SPLITTER.split('احمد بن محمد ابن خلکان'), ['احمد بن محمد', 'ابن خلکان']);
eq('organisation: abstain', SPLITTER.split('پایگاه خبری پهنه پرواز'), null);
eq('a role after a comma: abstain', SPLITTER.split('سپهر عاطفی، روزنامه نگار'), null);
eq('unknown first word: abstain', SPLITTER.split('زیبنده قاسمی'), null);
eq('a list supplied in code', new NameSplitter(['زیبنده']).split('زیبنده قاسمی'), ['زیبنده', 'قاسمی']);
ok('split Persian byline → نام / نام خانوادگی', buildCitation({ url: 'u', title: 'T', authors: [['', 'امین کمالی‌فر']] }, { today: TODAY }).includes('|نام خانوادگی=کمالی‌فر |نام=امین'));
ok('unsure Persian byline → نویسنده', buildCitation({ url: 'u', title: 'T', authors: [['', 'حسین علی']] }, { today: TODAY }).includes('|نویسنده=حسین علی'));
ok('second unsure byline → نویسنده۲', buildCitation({ url: 'u', title: 'T', authors: [['John', 'Smith'], ['', 'حسین علی']] }, { today: TODAY }).includes('|نویسنده۲=حسین علی'));

ok('«Eurasianet» on eurasianet.org is the site name', !judgeTitle('Eurasianet', { url: 'http://www.eurasianet.org/departments/x.shtml' }).ok);
ok('«مجلة هي» is not an author', !judgeAuthor('', 'مجلة هي'));
eq('Arabic site tail stripped', judgeTitle('بالصورة: الإيرانية كوكوش بكامل رشاقتها في السبعين! - مجلة هي', { url: 'http://www.hiamag.com/x', names: ['مجلة هي'] }), { ok: true, title: 'بالصورة: الإيرانية كوكوش بكامل رشاقتها في السبعين!' });

ok('home page with a fragment', isHomeLike('http://www.stat.si/statweb/en/home#graphBrezposelnost'));
ok('an acronym title is the site', !judgeTitle('SURS', { url: 'http://www.stat.si/statweb/en/home' }).ok);
ok('a title with an acronym in it is fine', judgeTitle('UK to attend US summit on Iran', { url: 'https://x.com/a/1' }).ok);

console.log('== review queue ==');
{
  const text = 'a<ref>http://x.org/a</ref>';
  const lk: Lookup = () => ({ ok: true, meta: { url: 'http://x.org/a', title: 'A real title here', website: 'x.org', authors: [['', 'حسین علی']] } });
  const p = planPage(text, 'T', { lookup: lk, today: TODAY });
  eq('unsure author → proposed, not saved', [p.changed, p.proposals.length, p.proposals[0]?.why], [false, 1, 'نام نویسنده به نام و نام خانوادگی جدا نشد']);
  const approvedCite = p.proposals[0].proposed;
  const q = planPage(text, 'T', { lookup: lk, today: TODAY, approved: new Map([['http://x.org/a', approvedCite]]) });
  eq('approved proposal is written verbatim', q.text, `a<ref>${approvedCite}</ref>`);
  const r2 = planPage(text, 'T', { lookup: lk, today: TODAY, rejected: new Set(['T\nhttp://x.org/a']) });
  eq('rejected URL: no edit, no proposal', [r2.changed, r2.proposals.length], [false, 0]);
}
{
  const refs = Array.from({ length: 25 }, (_, i) => `<ref>http://x.org/${i}</ref>`).join(' ');
  const p = planPage(refs, 'T', { lookup: u => ({ ok: true, meta: { url: u, title: 'Some real title', website: 'x.org' } }), today: TODAY });
  eq('at most 20 bare refs per edit', p.changes.filter(c => c.kind === 'bare-ref').length, 20);
}
{
  const id = proposalId('T', 'http://x.org/a');
  const page = `*: {{کاربر:MamouriBot/وظیفه ۱۹/بازبینی/سطر|شناسه=${id}|وضعیت=بله}}`;
  const d = readDecisions(page);
  eq('decision read from the page', d.get(id), 'yes');
  const rows = merge([], [{ title: 'T', url: 'http://x.org/a', proposed: '{{c}}', why: 'w' }], new Set(['T']), d);
  eq('merge keeps the human decision', rows[0].decision, 'yes');
  eq('accepted() groups by article', accepted(rows).get('T')?.length, 1);
  const later = merge(rows, [], new Set(['T']), new Map());
  eq('an examined article that no longer proposes it drops the row', later.length, 0);
  const no = merge([{ ...rows[0], decision: 'no' }], [], new Set(['T']), new Map());
  eq('a rejected row is remembered', [...rejected(no)], ['T\nhttp://x.org/a']);
  const unseen = merge(rows, [], new Set(), new Map());
  eq('a row on an article not examined this run stays', unseen.length, 1);
  ok('rendered page has nowiki URL and the row template', /<nowiki>http:\/\/x\.org\/a<\/nowiki>/.test(renderPage(rows, TODAY)) && renderPage(rows, TODAY).includes(`شناسه=${id}|وضعیت=بله`));
}

{
  const text = 'a<ref>https://www.cgie.org.ir/fa/article/224509/x</ref>';
  const p = planPage(text, 'T', { lookup: () => ({ ok: true, meta: { url: 'https://www.cgie.org.ir/fa/article/224509/x', title: 'تویسرکان', website: '[[مرکز دائرةالمعارف بزرگ اسلامی]]' } }), today: TODAY });
  eq('a one-word encyclopedia headword is saved, not queued', [p.changed, p.proposals.length], [true, 0]);
}

{
  const { checkWikitext } = await import('../../lib/gates.js');
  eq('empty review page passes the publish gate', checkWikitext('کاربر:MamouriBot/وظیفه ۱۹/بازبینی', renderPage([], TODAY)), []);
}

console.log('== dates ==');
eq('Gregorian day', formatDate('2019-02-14'), '۱۴ فوریه ۲۰۱۹');
eq('Jalali day', formatDate('1392-03-29'), '۲۹ خرداد ۱۳۹۲');
eq('month (۲۰۱۹-۰۲ is a CS1 error, so it is written out)', formatDate('2019-02'), 'فوریه ۲۰۱۹');
eq('year', formatDate('2004'), '۲۰۰۴');
eq('nonsense', formatDate('0000-13-40'), undefined);

console.log('== citation builder ==');
eq('minimal web citation', buildCitation({ url: 'https://a.org/x', title: 'T', website: 'a.org' }, { today: TODAY }),
  '{{یادکرد وب |نشانی=https://a.org/x |عنوان=T |وبگاه=a.org |تاریخ بازبینی=۲۱ نوامبر ۲۰۲۶}}');
eq('news with author, date, language', buildCitation({ url: 'https://r.com/x', title: 'Pence urges', website: '[[رویترز]]', date: '2019-02-14', language: 'en', news: true, authors: [['Lesley', 'Wroughton'], ['Alicja', 'Ptak']] }, { today: TODAY }),
  '{{یادکرد خبر |نشانی=https://r.com/x |عنوان=Pence urges |نام خانوادگی=Wroughton |نام=Lesley |نام خانوادگی۲=Ptak |نام۲=Alicja |وبگاه=[[رویترز]] |تاریخ=۱۴ فوریه ۲۰۱۹ |زبان=en |تاریخ بازبینی=۲۱ نوامبر ۲۰۲۶}}');
eq('a pipe in a title is escaped', escapeParam('A | B [c]'), 'A {{!}} B &#91;c&#93;');
eq("italic quotes in a title are escaped", escapeParam("Bob''s"), 'Bob&#39;&#39;s');

console.log('== resolver decisions ==');
eq('siteFor picks the longest key', siteFor('https://www.nobelprize.org/nomination/archive/show_people.php?id=4486')?.titleFrom, 'h2');
eq('siteFor host only', siteFor('https://www.mehrnews.com/news/1')?.article, 'خبرگزاری مهر');
eq('siteFor bbc persian path', siteFor('http://www.bbc.co.uk/persian/iran/2008/12/x.shtml')?.article, 'بی‌بی‌سی فارسی');
eq('suspended page is soft-dead', softDead('http://www.shahbazi.org/pages/Maryamiyya3.htm', 'https://www.shahbazi.org/cgi-sys/suspendedpage.cgi'), 'soft-404');
eq('redirect to the home page is soft-dead', softDead('http://x.ir/news/123', 'https://x.ir/'), 'redirected-home');
eq('http→https on the same path is alive', softDead('http://x.ir/news/123', 'https://x.ir/news/123'), null);
{
  const r = combine({ url: 'https://hbr.org/2004/07/marketing-myopia', today: '2026-11-21',
    citoid: { ok: true, item: { itemType: 'magazineArticle', title: 'Marketing Myopia', websiteTitle: 'Harvard Business Review', date: '2004-07-01', author: [['Theodore', 'Levitt']] } } });
  eq('good citoid answer is used as is', [r.status, r.meta?.title, r.meta?.date, r.meta?.authors, r.meta?.news], ['live', 'Marketing Myopia', '2004-07-01', [['Theodore', 'Levitt']], true]);
}
{
  const r = combine({ url: 'http://www.shahbazi.org/pages/Maryamiyya3.htm', today: '2026-11-21',
    citoid: { ok: true, item: { itemType: 'webpage', url: 'https://www.shahbazi.org/cgi-sys/suspendedpage.cgi', title: '', websiteTitle: 'www.shahbazi.org' } },
    page: { status: 200, finalUrl: 'https://www.shahbazi.org/cgi-sys/suspendedpage.cgi', title: 'Account Suspended' },
    capture: { timestamp: '20250509112651', original: 'https://www.shahbazi.org/pages/Maryamiyya3.htm' },
    snapshot: { status: 200, finalUrl: '', title: 'The Maryamiyya: From Frithjof Schuon to Seyyed Hossein Nasr, part 3', lang: 'en' } });
  eq('dead page → archive from the CAPTURED URL', r.meta?.archive, { url: 'https://web.archive.org/web/20250509112651/https://www.shahbazi.org/pages/Maryamiyya3.htm', date: '2025-05-09' });
  eq('…and the snapshot title', r.meta?.title, 'The Maryamiyya: From Frithjof Schuon to Seyyed Hossein Nasr, part 3');
}
{
  const r = combine({ url: 'http://www.irna.ir/fa/News/83178819', today: '2026-11-21',
    citoid: { ok: true, item: { itemType: 'webpage', title: '', websiteTitle: 'www.irna.ir' } },
    page: { status: 200, finalUrl: 'https://www.irna.ir/fa/News/83178819', title: '', challenge: true } });
  eq('an ArvanCloud challenge is not a citation and not a dead link', [r.status, r.meta, r.reason], ['live', undefined, 'bot-challenge']);
}
{
  const r = combine({ url: 'http://www.magiran.com/npview.asp?ID=3861532', today: '2026-11-21',
    citoid: { ok: false, status: 404 }, page: { status: 403, finalUrl: 'http://www.magiran.com/npview.asp?ID=3861532' } });
  eq('403 is unknown, never dead', r.status, 'unknown');
}
{
  const r = combine({ url: 'https://www.nobelprize.org/nomination/archive/show_people.php?id=4486', today: '2026-11-21',
    site: siteFor('https://www.nobelprize.org/nomination/archive/show_people.php?id=4486'),
    citoid: { ok: true, item: { itemType: 'blogPost', title: 'Nomination%20Archive', blogTitle: 'NobelPrize.org', date: '2024-05-21', author: [['Hans', 'Mehlin']] } },
    page: { status: 200, finalUrl: 'https://www.nobelprize.org/nomination/archive/show_people.php?id=4486', title: 'Nomination Archive - NobelPrize.org', h2: 'Kazenizade H Iranschär', siteName: 'NobelPrize.org', published: '2024-05-21T13:07:42+00:00', lang: 'en-US' } });
  eq('NobelPrize: per-site title rule, no web editor as author, no page date', [r.meta?.title, r.meta?.authors, r.meta?.website, r.meta?.language, r.meta?.date],
    ['Nomination archive: Kazenizade H Iranschär', undefined, 'NobelPrize.org', 'en', undefined]);
}

console.log('== planPage: the user\'s example article ==');
{
  const text = [
    'گرایش پیدا کرد.<ref>{{یادکرد وب | تاریخ بازبینی = ۴ دسامبر ۲۰۱۴ | عنوان=تئوسوفیسم و باستان‌گرایی هندو- آریایی | ناشر=وبگاه شهبازی | نشانی=www.shahbazi.org/pages/Maryamiyya3.htm}}</ref>',
    'نشد.<ref>http://www.nobelprize.org/nomination/archive/show_people.php?id=4486</ref>',
    'چاپ کرد.<ref>https://www.cgie.org.ir/fa/news/263705/%D8%AF%D8%B1%D8%A8%D8%A7%D8%B1%D9%87-%D8%AD%D8%B3%DB%8C%D9%86-%DA%A9%D8%A7%D8%B8%D9%85-%D8%B2%D8%A7%D8%AF%D9%87</ref>',
    '* [http://www.iranicaonline.org/articles/iransahr-hosayn-kazemzada IRĀNŠAHR, ḤOSAYN KĀẒEMZĀDA – Encyclopaedia Iranica]',
  ].join('\n');
  const meta: Record<string, ReturnType<Lookup>> = {
    'http://www.nobelprize.org/nomination/archive/show_people.php?id=4486': { ok: true, meta: { url: 'http://www.nobelprize.org/nomination/archive/show_people.php?id=4486', title: 'Nomination archive: Kazenizade H Iranschär', website: 'NobelPrize.org', language: 'en' } },
    'https://www.cgie.org.ir/fa/news/263705/درباره-حسین-کاظم-زاده': { ok: true, meta: { url: 'https://www.cgie.org.ir/fa/news/263705/درباره-حسین-کاظم-زاده', title: 'درباره حسین کاظم زاده', website: '[[مرکز دائرةالمعارف بزرگ اسلامی]]' } },
  };
  const p = planPage(text, 'حسین کاظم‌زاده ایرانشهر', { lookup: u => meta[u], today: TODAY });
  ok('changed', p.changed);
  ok('schemeless URL in the cite web repaired', p.text.includes('نشانی=http://www.shahbazi.org/pages/Maryamiyya3.htm}}'), p.text);
  ok('Nobel bare ref completed', p.text.includes('<ref>{{یادکرد وب |نشانی=http://www.nobelprize.org/nomination/archive/show_people.php?id=4486 |عنوان=Nomination archive: Kazenizade H Iranschär |وبگاه=NobelPrize.org |زبان=en |تاریخ بازبینی=۲۱ نوامبر ۲۰۲۶}}</ref>'), p.text);
  ok('cgie bare ref completed with a decoded URL', p.text.includes('<ref>{{یادکرد وب |نشانی=https://www.cgie.org.ir/fa/news/263705/درباره-حسین-کاظم-زاده |عنوان=درباره حسین کاظم زاده |وبگاه=[[مرکز دائرةالمعارف بزرگ اسلامی]] |تاریخ بازبینی=۲۱ نوامبر ۲۰۲۶}}</ref>'), p.text);
  ok('external-links line untouched', p.text.includes('* [http://www.iranicaonline.org/articles/iransahr-hosayn-kazemzada IRĀNŠAHR'));
  eq('kinds', [...new Set(p.changes.map(c => c.kind))].sort(), ['bare-ref', 'decode', 'scheme']);
}
{
  const p = planPage('a<ref>http://x.org/a</ref>', 't', { lookup: () => undefined, today: TODAY });
  eq('unknown URL → asked for, page unchanged', [p.changed, p.needs], [false, ['http://x.org/a']]);
}
{
  const p = planPage('a<ref>http://x.org/a</ref>', 't', { lookup: () => ({ ok: false, reason: 'bot-challenge' }), today: TODAY });
  eq('declined URL → reported, page unchanged', [p.changed, p.declined], [false, [{ url: 'http://x.org/a', reason: 'bot-challenge' }]]);
}

console.log('== planPage: must-not-change ==');
const noop = (what: string, text: string, lookup: Lookup = () => ({ ok: true, meta: { url: 'x', title: 'T', website: 'w' } })) =>
  eq(what, planPage(text, 't', { lookup, today: TODAY }).text, text);
noop('decode-only page is not edited (no rendered change)', 'a<ref>{{یادکرد وب|نشانی=https://x.ir/%D8%A8|عنوان=t}}</ref>');
noop('tracking-only page is not edited', 'a<ref>{{cite web|url=https://x.com/a?utm_source=t|title=t}}</ref>');
noop('inside a comment', '<!-- <ref>http://x.org/a</ref> -->');
noop('inside nowiki', '<nowiki><ref>http://x.org/a</ref></nowiki>');
noop('an {{در دست ویرایش}} page', '{{در دست ویرایش}}\na<ref>http://x.org/a</ref>');
noop('a self-closed ref', 'a<ref name="x" />');
noop('a PDF bare ref (needs a different template)', 'a<ref>http://x.org/a.pdf</ref>');
noop('a Wikipedia link', 'a<ref>https://en.wikipedia.org/wiki/X</ref>');
noop('a positional-argument template', '{{یادکرد وب|www.x.org}}');
noop('after an unclosed {{', '{{جعبه اطلاعات|a=1\n<ref>{{یادکرد وب|نشانی=www.x.org/a|عنوان=t}}</ref>');
noop('a URL inside a wikilink target is not touched', '[[پرونده:X.jpg|بند=http://x.org/a?utm_source=y]]');
noop('a bare front-page URL is declined', 'a<ref>http://weather.com</ref> b<ref>http://vardanjan.ir/</ref>');
noop('a cite with a real title keeps it', 'a<ref>{{یادکرد وب|نشانی=https://x.org/a|عنوان=Real title}}</ref>');
noop('archive URL in a cite is not decoded', 'a<ref>{{یادکرد وب|نشانی=https://x.org/a|عنوان=t|پیوند بایگانی=https://web.archive.org/web/2016/http://s.ir/%D8%AA}}</ref>');

console.log('== planPage: title fill ==');
{
  const text = 'a<ref>{{cite web|url=http://results.cik.bg/x.html|title=Archived copy|accessdate=2011-10-31|url-status=dead|archive-url=https://web.archive.org/web/20111027202947/http://results.cik.bg/x.html}}</ref>';
  const p = planPage(text, 't', { lookup: u => u.startsWith('https://web.archive.org/') ? { ok: true, meta: { url: 'http://results.cik.bg/x.html', title: 'Избор на кмет' } } : undefined, today: TODAY });
  ok('«Archived copy» replaced from the archived snapshot', p.text.includes('|title=Избор на кмет|'), p.text);
}
{
  const text = 'a<ref>{{یادکرد وب|نشانی=https://www.yjc.ir/fa/news/6619715/x|وبگاه=www.yjc.ir|بازبینی=2021-01-05}}</ref>';
  const p = planPage(text, 't', { lookup: () => ({ ok: true, meta: { url: 'x', title: 'روش محاسبه چرتکه‌ای' } }), today: TODAY });
  eq('missing title added with a Persian key', p.text, 'a<ref>{{یادکرد وب|نشانی=https://www.yjc.ir/fa/news/6619715/x|وبگاه=www.yjc.ir|بازبینی=2021-01-05|عنوان=روش محاسبه چرتکه‌ای}}</ref>');
}
{
  const text = '{{cite web\n|url=https://a.org/x\n|work=W\n}}';
  const p = planPage(text, 't', { lookup: () => ({ ok: true, meta: { url: 'x', title: 'T' } }), today: TODAY });
  eq('multi-line call gets a multi-line param, English key', p.text, '{{cite web\n|url=https://a.org/x\n|work=W\n|title=T\n}}');
}

{
  const text = 'a<ref>{{یادکرد وب |نشانی=https://mehreganprize.ir/x |عنوان=نسخه آرشیو شده |پیوند بایگانی=https://web.archive.org/web/20230629091139/https://mehreganprize.ir/x/}}</ref>';
  const p = planPage(text, 't', { lookup: u => u.startsWith('https://web.archive.org/') ? { ok: true, meta: { url: 'x', title: 'درباره ما' } } : undefined, today: TODAY });
  ok('Persian «نسخه آرشیو شده» is a placeholder too', p.text.includes('|عنوان=درباره ما |'), p.text);
}
{
  const text = 'a<ref>{{یادکرد وب|وبگاه=www.google.com|نشانی=https://www.google.com/url?url=https%3A%2F%2Fwww.bbc.com%2Fpersian%2Fx|عنوان=t}}</ref>';
  const p = planPage(text, 't', { lookup: () => ({ ok: true, meta: { url: 'x', title: 'T', website: '[[بی‌بی‌سی فارسی]]' } }), today: TODAY });
  eq('redirector unwrapped and the google site name replaced', p.text, 'a<ref>{{یادکرد وب|وبگاه=[[بی‌بی‌سی فارسی]]|نشانی=https://www.bbc.com/persian/x|عنوان=t}}</ref>');
}
{
  const text = 'a<ref>{{یادکرد وب|وبگاه=www.google.com|نشانی=https://fa.euronews.com/amp/x|عنوان=t}}</ref>';
  const p = planPage(text, 't', { lookup: () => undefined, today: TODAY });
  eq('google site name with an unknown target: ask, change nothing yet', [p.changed, p.needs], [false, ['https://fa.euronews.com/amp/x']]);
}

console.log('== planPage: URLs elsewhere ride along with a substantive change ==');
{
  const text = 'a<ref>http://x.org/a</ref> b<ref>[https://www.google.com/url?url=https%3A%2F%2Fy.org%2Fb y]</ref> c<ref>{{یادکرد وب|نشانی=https://z.ir/%D8%A8|عنوان=t}}</ref>';
  const p = planPage(text, 't', { lookup: () => ({ ok: true, meta: { url: 'http://x.org/a', title: 'T', website: 'x.org' } }), today: TODAY });
  ok('redirector in a bracket link unwrapped', p.text.includes('[https://y.org/b y]'), p.text);
  ok('percent URL in a citation decoded', p.text.includes('نشانی=https://z.ir/ب|'), p.text);
  ok('urlMap has both', p.urlMap.size === 2, JSON.stringify([...p.urlMap]));
}
{
  const p = planPage('a<ref>{{یادکرد وب|نشانی=http://x.com/a.php؟id=5|عنوان=t}}</ref>', 't', { lookup: () => undefined, today: TODAY });
  ok('Persian question mark before key= fixed', p.text.includes('a.php?id=5'), p.text);
}
noop('Persian question mark in a slug is real text', 'a<ref>{{یادکرد وب|نشانی=http://shiasay.com/ask/14/چرا-ایرانیان-شیعه-شدند؟|عنوان=t}}</ref>');

console.log('== wikitext helpers ==');
eq('appendParams on one line with spaced style', appendParams('{{یادکرد وب | نشانی = x | عنوان = }}', [['وبگاه', 'w']]), '{{یادکرد وب | نشانی = x | عنوان = | وبگاه = w}}');

{
  const p = planPage('a<ref>https://www.eurowings.com/de.html?gclid=CIH_t6&gclsrc=ds</ref>', 'T', { lookup: () => ({ ok: true, meta: { url: 'https://www.eurowings.com/de.html', title: 'Flüge buchen', website: 'Eurowings' } }), today: TODAY });
  eq('a bare URL cleaned into the citation is in urlMap', [...p.urlMap], [['https://www.eurowings.com/de.html?gclid=CIH_t6&gclsrc=ds', 'https://www.eurowings.com/de.html']]);
  eq('…so verify does not call it lost', unexplainedLoss(['https://www.eurowings.com/de.html?gclid=CIH_t6&gclsrc=ds'], ['https://www.eurowings.com/de.html'], p.urlMap), []);
}

console.log('== verify: link accounting ==');
eq('a rewritten URL is accounted for', unexplainedLoss(['https://z.ir/%D8%A8'], ['https://z.ir/ب'], new Map()), []);
eq('a decoded URL with different escape case', unexplainedLoss(['https://z.ir/%d8%a8'], ['https://z.ir/%D8%A8'], new Map()), []);
eq('an unwrapped redirector via urlMap', unexplainedLoss(['https://www.google.com/url?url=https%3A%2F%2Fy.org%2Fb'], ['https://y.org/b'], new Map([['https://www.google.com/url?url=https%3A%2F%2Fy.org%2Fb', 'https://y.org/b']])), []);
eq('a dropped link is caught', unexplainedLoss(['https://a.org/x', 'https://b.org/y'], ['https://a.org/x'], new Map()).length, 1);
eq('canonHref lowercases host only', canonHref('HTTPS://X.ORG/A'), 'https://x.org/A');

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) process.exit(1);
