/**
 * وظیفهٔ ۲۰ pattern rules — offline tests, from the four articles in the user's report
 * (میتوتان، آستمیزول، تریامترن اچ، تاموکسیفن) and the census of ۱ نوامبر ۲۰۲۶.
 *
 *   npx tsx src/tasks/task-20/patterns.test.ts
 */
import { rewritePattern, faDigits } from './patterns.js';

let pass = 0;
const fails: string[] = [];
const eq = (what: string, a: unknown, b: unknown) => {
  if (JSON.stringify(a) === JSON.stringify(b)) { pass++; console.log(`  ✓ ${what}`); }
  else { fails.push(what); console.log(`  ✗ ${what}\n      ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`); }
};

console.log('== time ==');
eq('18 to 159 days (میتوتان)', rewritePattern('time', '18 to 159 days'), '۱۸ تا ۱۵۹ روز');
eq('24 hours (آستمیزول)', rewritePattern('time', '24 hours'), '۲۴ ساعت');
eq('5–7 days (تاموکسیفن)', rewritePattern('time', '5–7 days'), '۵–۷ روز');
eq('hyphen range becomes en dash', rewritePattern('time', '11-25 hours'), '۱۱–۲۵ ساعت');
eq('decimal', rewritePattern('time', '61.3 minutes'), '۶۱٫۳ دقیقه');
eq('abbreviation', rewritePattern('time', '2–2.5 hr'), '۲–۲٫۵ ساعت');
eq('less than', rewritePattern('time', '<1 hour'), 'کمتر از ۱ ساعت');
eq('second clause stays (تریامترن اچ)', rewritePattern('time', '1-2 hours, active metabolite 3 hours'), null);
eq('trailing word stays', rewritePattern('time', '3–5 hours Papac'), null);
eq('parenthesis stays', rewritePattern('time', '7–13 hours (up to 20 hours)'), null);
eq('two units stay', rewritePattern('time', '0.5-1.6h (fast acetylators), 2-5h (slow acetylators)'), null);
eq('a word stays', rewritePattern('time', 'Unknown'), null);
eq('already Persian stays', rewritePattern('time', '۲۱–۶۱ ساعت'), null);

console.log('== molar mass ==');
eq('320.04 g/mol (میتوتان)', rewritePattern('molar', '320.04 g/mol'), '۳۲۰٫۰۴ گرم بر مول');
eq('371.515 g/mol (تاموکسیفن)', rewritePattern('molar', '371.515 g/mol'), '۳۷۱٫۵۱۵ گرم بر مول');
eq('g·mol−1', rewritePattern('molar', '748.984 g·mol −1'), '۷۴۸٫۹۸۴ گرم بر مول');
eq('salt qualifier stays (تاموکسیفن)', rewritePattern('molar', '563.638 g/mol (citrate salt)'), null);
eq('a range stays', rewritePattern('molar', '12000–15000 g/mol'), null);
eq('a label stays', rewritePattern('molar', 'base: 474.6 g/mol'), null);
eq('bare number stays (the template already handles it)', rewritePattern('molar', '370.577'), null);

console.log('== digits ==');
eq('faDigits', faDigits('12.5'), '۱۲٫۵');

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) process.exit(1);
