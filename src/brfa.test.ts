/**
 * Unit tests for the permission link in edit summaries. No network.
 *
 *   npx tsx src/brfa.test.ts
 *
 * The convention and the live sampling behind it are documented in src/brfa.ts.
 */
import { brfaPage, faDigits, fitsSummaryLimit, withBrfaLink } from './brfa.js';

let pass = 0;
const fails: string[] = [];
function ok(what: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ✓ ${what}`); }
  else { fails.push(`${what}${detail ? ` — ${detail}` : ''}`); console.log(`  ✗ ${what}\n      ${detail}`); }
}

console.log('== the page title uses Persian digits ==');
ok('single digit', faDigits(3) === '۳', faDigits(3));
ok('two digits', faDigits(13) === '۱۳', faDigits(13));
// A Latin-digit title is a different page, and a different page here means a red link in
// every summary the run produces.
ok('the page title is the real one',
   brfaPage(3) === 'ویکی‌پدیا:سیاست ربات‌رانی/درخواست مجوز/MamouriBot/وظیفه ۳', brfaPage(3));
ok('and never carries Latin digits', !/\d/.test(brfaPage(12)), brfaPage(12));

console.log('\n== the summary matches what fa and en bots actually emit ==');
{
  const s = withBrfaLink(3, 'هم‌سان‌سازی نام پارامترهای بایگانی یادکردها');
  ok('the linked word is «ربات»', s.startsWith('[[') && s.includes('|ربات]]: '), s);
  ok('the link targets the permission page', s.includes(brfaPage(3)), s);
  ok('the content summary survives intact', s.endsWith('هم‌سان‌سازی نام پارامترهای بایگانی یادکردها'), s);
}

console.log('\n== a summary that already says «ربات:» does not say it twice ==');
{
  // وظیفهٔ ۷ is written that way; without this it would read «[[…|ربات]]: ربات: …»
  const s = withBrfaLink(7, 'ربات: به‌روز کردن نام پارامترهای جعبه اطلاعات نرم‌افزار');
  ok('the duplicate prefix is removed', !s.includes('ربات]]: ربات'), s);
  ok('and the rest is untouched', s.endsWith('به‌روز کردن نام پارامترهای جعبه اطلاعات نرم‌افزار'), s);
}
{
  const s = withBrfaLink(7, '  ربات :  چیزی');
  ok('spacing variants of the prefix are handled too', !s.includes('ربات]]: ربات'), s);
}

console.log('\n== the length guard ==');
ok('a normal summary fits', fitsSummaryLimit(withBrfaLink(3, 'خلاصهٔ معمولی')));
ok('the longest real summary fits',
   fitsSummaryLimit(withBrfaLink(7, 'ربات: ' + 'به‌روز کردن نام پارامترهای جعبه اطلاعات نرم‌افزار به نام‌های کنونی و فارسی')));
{
  // Counted in CODE POINTS, not UTF-16 units: Persian is outside the BMP-safe assumptions
  // `String.length` makes for some scripts, and a byte count would reject valid summaries.
  const long = 'ا'.repeat(600);
  ok('an over-long summary is rejected', !fitsSummaryLimit(long));
  ok('exactly at the limit is accepted', fitsSummaryLimit('ا'.repeat(500)));
  ok('one past the limit is not', !fitsSummaryLimit('ا'.repeat(501)));
}

console.log(`\n${pass} گذشت، ${fails.length} افتاد`);
if (fails.length) { console.error('failing:\n  - ' + fails.join('\n  - ')); process.exit(1); }
