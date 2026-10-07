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
];
let pass=0, fail=0;
for (const [name, input, want] of cases) {
  const {text, changed} = removeUseDmyDates(input);
  const ok = text === want;
  const changedOk = name==='absent (no-op)' ? !changed : changed;
  if (ok && changedOk) pass++;
  else { fail++; console.log(`FAIL ${name}\n  got : ${JSON.stringify(text)}\n  want: ${JSON.stringify(want)} changed=${changed}`); }
}
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
