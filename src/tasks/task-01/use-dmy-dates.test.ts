import { removeUseDmyDates } from './use-dmy-dates.js';
const cases: [string,string,string][] = [
  ['own line top',       '{{Use dmy dates|date=March 2024}}\n{{جعبه}}\nمتن', '{{جعبه}}\nمتن'],
  ['inline glued',       '{{درباره|x}}{{Use dmy dates|date=March 2022}}\nمتن', '{{درباره|x}}\nمتن'],
  ['persian date param', '{{Use dmy dates|date=مارس ۲۰۲۱}}\nمتن', 'متن'],
  ['no params',          '{{Use dmy dates}}\nمتن', 'متن'],
  ['lowercase use',      '{{use dmy dates}}\nمتن', 'متن'],
  ['inner spaces',       '{{ Use dmy dates | date=July 2019 }}\nمتن', 'متن'],
  ['leading spaces',     '   {{Use dmy dates|date=X}}   \nمتن', 'متن'],
  ['deep in page',       'الف\nب{{Use dmy dates|date=July 2019}}\nج', 'الف\nب\nج'],
  ['absent (no-op)',     'متن بدون الگو', 'متن بدون الگو'],
  ['two on same line',   '{{Use dmy dates|date=A}}{{Other}}\nم', '{{Other}}\nم'],

  // The English-variant markers, added ۱۳ اکتبر ۲۰۲۶ — same family, same approval.
  ['mdy dates',          '{{Use mdy dates|date=May 2020}}\nمتن', 'متن'],
  ['british english',    '{{Use British English|date=June 2021}}\nمتن', 'متن'],
  ['american english',   '{{Use American English}}\nمتن', 'متن'],
  ['indian english',     '{{Use Indian English|date=April 2019}}\nمتن', 'متن'],
  ['australian english', '{{Use Australian English}}\nمتن', 'متن'],
  ['hong kong english',  '{{Use Hong Kong English}}\nمتن', 'متن'],
  ['engvarB',            '{{EngvarB|date=August 2018}}\nمتن', 'متن'],
  ['engvarb lowercase',  '{{engvarB}}\nمتن', 'متن'],
  // Four of the English names are redirects to a Persian title and a page may call
  // either side. Matching only the English spelling would leave the page in the category.
  ['persian dmy name',   '{{استفاده از تاریخ‌های زمانی|تاریخ=مارس ۲۰۲۱}}\nمتن', 'متن'],
  ['persian mdy name',   '{{استفاده از تاریخ زمانی}}\nمتن', 'متن'],
  ['persian british',    '{{استفاده از انگلیسی بریتانیایی}}\nمتن', 'متن'],
  ['persian american',   '{{استفاده از انگلیسی آمریکایی|تاریخ=مه ۲۰۲۰}}\nمتن', 'متن'],
  ['underscore form',    '{{Use_British_English|date=X}}\nمتن', 'متن'],
  // Two of them on one page come out in ONE edit.
  ['two templates',      '{{Use dmy dates|date=A}}\n{{Use British English}}\nمتن', 'متن'],
  // A removal must not leave the page starting with a blank line (invisible in the
  // render, blocked by the gate). Mid-page paragraph breaks must survive, though.
  ['blank line at top',  '{{Use dmy dates}}\n\nمتن', 'متن'],
  ['paragraph break kept', 'الف\n{{Use dmy dates}}\n\nب', 'الف\n\nب'],

  // Near misses that must NOT match.
  ['unrelated template', '{{Use of force}}\nمتن', '{{Use of force}}\nمتن'],
  ['prose mentioning it', 'الگوی Use dmy dates چیزی نشان نمی‌دهد.', 'الگوی Use dmy dates چیزی نشان نمی‌دهد.'],
  ['nested braces guard', '{{جعبه|پارامتر={{Use dmy dates}}}}\nمتن', '{{جعبه|پارامتر=}}\nمتن'],
];
let pass=0, fail=0;
for (const [name, input, want] of cases) {
  const {text, changed} = removeUseDmyDates(input);
  const ok = text === want;
  // `changed` must agree with whether the text actually moved — derived, not a hard-coded
  // exception for the one no-op case, so every added near-miss checks it too.
  const changedOk = changed === (want !== input);
  if (ok && changedOk) pass++;
  else { fail++; console.log(`FAIL ${name}\n  got : ${JSON.stringify(text)}\n  want: ${JSON.stringify(want)} changed=${changed}`); }
}
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
