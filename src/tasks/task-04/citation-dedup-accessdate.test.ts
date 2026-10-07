/**
 * Unit tests for the Task-4 addition (citation-dedup-accessdate).
 *   npx tsx src/tasks/task-04/citation-dedup-accessdate.test.ts
 */
import { dedupAccessDate, findCitationSpans } from './citation-dedup-accessdate.js';

type Case = { name: string; in: string; want: string; changed: boolean };
const C: Case[] = [
  {
    name: 'reported: تاریخ_بازبینی + بازبینی, same date (Western vs Persian digits) → keep بازبینی',
    in: '{{یادکرد وب |عنوان=x |نشانی=http://e.com |تاریخ_بازبینی=5 دسامبر 2025 |بازبینی=۵ دسامبر ۲۰۲۵}}',
    want: '{{یادکرد وب |عنوان=x |نشانی=http://e.com |بازبینی=۵ دسامبر ۲۰۲۵}}',
    changed: true,
  },
  {
    name: 'underscore + space of SAME alias, same value → keep space form',
    in: '{{یادکرد کتاب|عنوان=x|تاریخ_بازبینی=۱ ژانویه ۲۰۲۰|تاریخ بازبینی=۱ ژانویه ۲۰۲۰}}',
    want: '{{یادکرد کتاب|عنوان=x|تاریخ بازبینی=۱ ژانویه ۲۰۲۰}}',
    changed: true,
  },
  {
    name: 'genuinely different dates → collision, left untouched',
    in: '{{یادکرد کتاب|عنوان=x|تاریخ_بازبینی=۷ سپتامبر ۲۰۱۲|تاریخ بازبینی=۴ ژوئیه ۲۰۲۶}}',
    want: '{{یادکرد کتاب|عنوان=x|تاریخ_بازبینی=۷ سپتامبر ۲۰۱۲|تاریخ بازبینی=۴ ژوئیه ۲۰۲۶}}',
    changed: false,
  },
  {
    name: 'same day different CALENDAR (Jalali vs Gregorian) → treated as conflict, untouched',
    in: '{{یادکرد وب|عنوان=x|نشانی=u|تاریخ_بازبینی=28 بهمن 1404|بازبینی=۱۶ فوریه ۲۰۲۶}}',
    want: '{{یادکرد وب|عنوان=x|نشانی=u|تاریخ_بازبینی=28 بهمن 1404|بازبینی=۱۶ فوریه ۲۰۲۶}}',
    changed: false,
  },
  {
    name: 'one empty + one filled (same field) → keep filled',
    in: '{{یادکرد وب|عنوان=x|نشانی=u|تاریخ بازبینی=|بازبینی=۵ دسامبر ۲۰۲۵}}',
    want: '{{یادکرد وب|عنوان=x|نشانی=u|بازبینی=۵ دسامبر ۲۰۲۵}}',
    changed: true,
  },
  {
    name: 'single access-date → no change',
    in: '{{یادکرد وب|عنوان=x|نشانی=u|تاریخ_بازبینی=۵ دسامبر ۲۰۲۵}}',
    want: '{{یادکرد وب|عنوان=x|نشانی=u|تاریخ_بازبینی=۵ دسامبر ۲۰۲۵}}',
    changed: false,
  },
  {
    name: 'three aliases same value → keep first non-underscore (بازبینی)',
    in: '{{یادکرد وب|عنوان=x|نشانی=u|بازبینی=۱ ژانویه ۲۰۲۰|تاریخ_بازبینی=۱ ژانویه ۲۰۲۰|تاریخ بازبینی=۱ ژانویه ۲۰۲۰}}',
    want: '{{یادکرد وب|عنوان=x|نشانی=u|بازبینی=۱ ژانویه ۲۰۲۰}}',
    changed: true,
  },
  {
    name: 'non-citation template with like-named params is NOT touched',
    in: '{{جعبه اطلاعات مکان|بازبینی=الف|تاریخ بازبینی=ب}}',
    want: '{{جعبه اطلاعات مکان|بازبینی=الف|تاریخ بازبینی=ب}}',
    changed: false,
  },
  {
    name: 'other params + alignment preserved, value with link untouched',
    in: '{{یادکرد خبر\n| عنوان = [[الف|ب]]\n| تاریخ_بازبینی = ۵ دسامبر ۲۰۲۵\n| بازبینی      = ۵ دسامبر ۲۰۲۵\n| ناشر = پ\n}}',
    want: '{{یادکرد خبر\n| عنوان = [[الف|ب]]\n| بازبینی      = ۵ دسامبر ۲۰۲۵\n| ناشر = پ\n}}',
    changed: true,
  },
  {
    name: 'per-citation: fix safe one, leave conflicting one (article still changed)',
    in: 'الف{{یادکرد وب|عنوان=a|نشانی=u|تاریخ_بازبینی=۵ دسامبر ۲۰۲۵|بازبینی=۵ دسامبر ۲۰۲۵}}ب{{یادکرد کتاب|عنوان=b|تاریخ_بازبینی=۲۰۱۲|تاریخ بازبینی=۲۰۲۶}}',
    want: 'الف{{یادکرد وب|عنوان=a|نشانی=u|بازبینی=۵ دسامبر ۲۰۲۵}}ب{{یادکرد کتاب|عنوان=b|تاریخ_بازبینی=۲۰۱۲|تاریخ بازبینی=۲۰۲۶}}',
    changed: true,
  },
  {
    name: 'nested template inside a value is not mis-split',
    in: '{{یادکرد وب|عنوان={{عبارت|بازبینی=نه}}|تاریخ_بازبینی=۵ دی ۱۴۰۰|بازبینی=۵ دی ۱۴۰۰}}',
    want: '{{یادکرد وب|عنوان={{عبارت|بازبینی=نه}}|بازبینی=۵ دی ۱۴۰۰}}',
    changed: true,
  },
  {
    name: 'no citation → no-op',
    in: 'یک مقاله بدون یادکرد',
    want: 'یک مقاله بدون یادکرد',
    changed: false,
  },
  {
    name: 'English cite + access-date alias mix, same value → dedup',
    in: '{{cite web|title=x|url=u|access-date=5 December 2025|تاریخ بازبینی=5 December 2025}}',
    want: '{{cite web|title=x|url=u|access-date=5 December 2025}}',
    changed: true,
  },
];

let pass = 0, fail = 0;
for (const c of C) {
  const r = dedupAccessDate(c.in);
  const ok = r.text === c.want && r.changed === c.changed;
  if (ok) pass++;
  else {
    fail++;
    console.log(`FAIL ${c.name}\n  got : ${JSON.stringify(r.text)} changed=${r.changed}\n  want: ${JSON.stringify(c.want)} changed=${c.changed}${r.note ? '\n  note: ' + r.note : ''}`);
  }
}
// span finder sanity
const spans = findCitationSpans('x{{یادکرد وب|a=1}}y{{cite book|b=2}}z{{جعبه اطلاعات شرکت|c=3}}');
if (spans.length !== 2) { fail++; console.log(`FAIL span count: got ${spans.length} (want 2)`); } else pass++;

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
