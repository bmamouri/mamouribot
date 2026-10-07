/** Proves the audit's comparators FLAG corruption. npx tsx src/tasks/task-08/audit.test.ts */
import { valueKey, outsideBoxes } from './audit.js';
import { fixMusicianParams } from './musician-params.js';

let pass = 0, fail = 0;
const check = (name: string, cond: boolean) => cond ? (pass++, console.log(`✓ ${name}`)) : (fail++, console.log(`✗ ${name}`));

const base = '{{جعبه اطلاعات هنرمند موسیقی\n|نام = الف\n|جایزه = گرمی\n|سایت = a.com\n}}\nمتن مقاله';
const good = fixMusicianParams(base).text;

check('legit rename keeps every value',        valueKey(base) === valueKey(good));
check('legit rename leaves prose untouched',   outsideBoxes(base) === outsideBoxes(good));
check('CHANGED value is detected',             valueKey(base) !== valueKey(good.replace('گرمی', 'اسکار')));
check('DROPPED value is detected',             valueKey(base) !== valueKey(good.replace('|جوایز = گرمی\n', '')));
check('INVENTED value is detected',            valueKey(base) !== valueKey(good.replace('|جوایز = گرمی', '|جوایز = گرمی\n|ژانر = پاپ')));
check('prose edit outside the box is detected', outsideBoxes(base) !== outsideBoxes(good.replace('متن مقاله', 'متن دستکاری‌شده')));

// regression: a SINGLE-LINE infobox call must still be masked, or every such
// article is falsely reported as "prose outside the box changed"
const oneLine = '{{Infobox musical artist|Name=X|سایت=a.com}}\nمتن';
const oneLineFixed = fixMusicianParams(oneLine).text;
check('single-line call is masked (no false prose alarm)', outsideBoxes(oneLine) === outsideBoxes(oneLineFixed));
check('single-line call: real prose change still detected',
  outsideBoxes(oneLine) !== outsideBoxes(oneLineFixed.replace('متن', 'متن دیگر')));

console.log(`\n${pass} گذشت، ${fail} افتاد`);
process.exit(fail ? 1 : 0);
