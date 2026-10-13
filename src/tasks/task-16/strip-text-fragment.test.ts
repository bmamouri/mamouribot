/**
 * وظیفهٔ ۱۶ — offline tests.
 *
 *   npx tsx src/tasks/task-16/strip-text-fragment.test.ts
 *
 * Fixtures are drawn from the 200-article / 328-occurrence sample measured against live
 * fa.wikipedia text (research/google-text-fragment-links.md in the companion repo), plus
 * the user's own worked example (کامفیروز).
 */
import { stripTextFragments } from './strip-text-fragment.js';

let pass = 0;
const fails: string[] = [];
function ok(what: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ✓ ${what}`); }
  else { fails.push(`${what}${detail ? ` — ${detail}` : ''}`); console.log(`  ✗ ${what}\n      ${detail}`); }
}
const eq = (what: string, a: unknown, b: unknown) =>
  ok(what, JSON.stringify(a) === JSON.stringify(b), `${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);

console.log('== the exact user-reported example (کامفیروز) ==');
{
  const input =
    'http://www.tamashanewspaper.ir/news-details/10835-مسئولان-دولتی-توجه-بیشتری-به-فرش-استان-فارس-داشته-باشند' +
    '#:~:text=مهندس%20بهرام%20شکوهی%3A%20شهرداری%20کامفیروز%20زیر%20پای%20سرمایه‌گذار%20فرش%20قرمز%20پهن%20می‌کند،' +
    '-سیده%20ناهید%20تقویان&text=کامفیروز%20علاوه%20بر%20حاصلخیزی،%20به،بزرگ%20و%20اثرگذار%20انجام%20داد.';
  const r = stripTextFragments(input);
  ok('changed', r.changed);
  eq('strips to the bare article URL, nothing more and nothing less', r.text,
     'http://www.tamashanewspaper.ir/news-details/10835-مسئولان-دولتی-توجه-بیشتری-به-فرش-استان-فارس-داشته-باشند');
}

console.log('\n== inside a citation template (the common case, 50% of the sample) ==');
{
  const t = '{{یادکرد وب|نشانی=https://example.com/a#:~:text=hello%20world|عنوان=الف}}';
  const r = stripTextFragments(t);
  eq('only the fragment is removed; the rest of the template is untouched', r.text,
     '{{یادکرد وب|نشانی=https://example.com/a|عنوان=الف}}');
}

console.log('\n== bare <ref> link (12% of the sample) ==');
{
  const t = 'متن.<ref>[https://example.com/b#:~:text=foo%20bar توضیح]</ref>';
  const r = stripTextFragments(t);
  eq('strips inside bracket-link syntax too', r.text,
     'متن.<ref>[https://example.com/b توضیح]</ref>');
}

console.log('\n== URL followed directly by template braces, no pipe (رضا پهلوی / هلیوم / کربن shape) ==');
{
  // The bug this guards: an early draft's delimiter set did not exclude `{`/`}`, so the
  // match ate into "}}" and left the article with an unbalanced brace. Measured on 9/328
  // real occurrences (اکسیژن، رضا پهلوی، زبان کشمیری، هلیوم×۳، کربن×۲، کنستانتین بزرگ).
  const t = '{{Webarchive|url=https://example.com/c#:~:text=some,thing}}';
  const r = stripTextFragments(t);
  eq('the closing "}}" is never consumed by the match', r.text,
     '{{Webarchive|url=https://example.com/c}}');
}

console.log('\n== chained &text= segments (28/200 sampled pages had more than one) ==');
{
  const t = 'https://example.com/d#:~:text=first,highlight&text=second,highlight';
  const r = stripTextFragments(t);
  eq('both segments of the SAME directive are removed together', r.text,
     'https://example.com/d');
}

console.log('\n== a real section anchor is never touched ==');
{
  const t = 'نشانی=https://example.com/e#بخش-واقعی|عنوان=ب';
  const r = stripTextFragments(t);
  ok('no text-fragment directive present → unchanged', !r.changed);
  eq('the real anchor survives byte-for-byte', r.text, t);
}

console.log('\n== a URL that has BOTH a real section id and the directive ==');
{
  const t = 'https://example.com/f#section:~:text=hello';
  const r = stripTextFragments(t);
  eq('the real anchor is kept; only the directive after it is stripped', r.text,
     'https://example.com/f#section');
}

console.log('\n== an internal wikilink carrying a pasted Google URL (۹ articles in the sample) ==');
{
  const t = "[[عبدالقیوم قویم#:~:text=دکتر عبدالقیوم قویم,زبان و ادب فارسی می‌باشد.|عبدالقیوم قویم]]";
  const r = stripTextFragments(t);
  eq('becomes a plain, section-less link to the same article', r.text,
     '[[عبدالقیوم قویم|عبدالقیوم قویم]]');
}

console.log('\n== a literal, un-encoded apostrophe inside the directive must NOT truncate it ==');
{
  // Real bug, found during the live dry-run (not by any offline fixture): an early
  // draft excluded "'" from the URL delimiter set, which truncated this directive right
  // after "Israel" and left "s,developed...}}</ref>" dangling in the article as stray
  // prose. MediaWiki's own EXT_LINK_URL_CLASS does not exclude "'" either.
  const t = "https://example.com/h#:~:text=The%20life%20expectancy%20of%20Israel's,average%20of%2081.6.|title=x}}";
  const r = stripTextFragments(t);
  eq('the apostrophe does not end the fragment scan early', r.text,
     'https://example.com/h|title=x}}');
}

console.log('\n== the %7e-encoded tilde variant ==');
{
  const t = 'https://example.com/g#:%7e:text=encoded%20tilde';
  const r = stripTextFragments(t);
  ok('the percent-encoded form is recognised too', r.changed);
  eq('strips the same way as the literal tilde', r.text, 'https://example.com/g');
}

console.log('\n== a page with no fragment at all ==');
{
  const r = stripTextFragments('مقاله‌ای معمولی بدون هیچ نشانی مشکل‌داری.');
  ok('reports changed:false rather than guessing', !r.changed);
}

console.log('\n== a near-miss that must NOT match: an unrelated query string containing "text=" ==');
{
  // Real example from the sample (یکتاپرستی): a Perseus Digital Library URL whose own
  // query happens to contain "%3Atext%3A", nothing to do with the browser directive.
  const t = 'https://example.edu/cgi-bin/ptext?doc=Perseus%3Atext%3A1999.04.0057%3Aentry%3D123';
  const r = stripTextFragments(t);
  ok('a URL with "text=" in its OWN query string but no "#:~:" is left untouched', !r.changed);
}

console.log('\n== the directive continued past a literal space (live in «کازرون» ×3) ==');
{
  // The paster turned Google's `,` separator into «، » — Persian comma plus a real space —
  // so the encoded tail of the highlight sits AFTER the space, outside MediaWiki's URL
  // class. Stripping only to the space leaves `هجری- دین%2520…شد.` in the parameter.
  const t = '{{یادکرد وب |نشانی=https://example.ir/a-b-#:~:text=شیخ%2520ابواسحاق%2520ساخت، '
    + 'دین%2520اسلام%2520در%2520کازرون%2520شد. |وبگاه=پرتال}}';
  const r = stripTextFragments(t);
  eq('the continued tail goes with the directive', r.text,
     '{{یادکرد وب |نشانی=https://example.ir/a-b- |وبگاه=پرتال}}');
  ok('leaves no percent-encoded debris', !/%25/.test(r.text));
}
{
  const t = 'https://example.com/x#:~:text=a%20b مرکز%2520مشغول%2520فعالیت%2520می%2520باشند. |وبگاه=ب';
  eq('several debris tokens in a row are all taken', stripTextFragments(t).text,
     'https://example.com/x |وبگاه=ب');
}

console.log('\n== what the debris rule must NOT eat ==');
{
  const t = 'متن مقاله https://example.com/x#:~:text=a%20b و سپس ادامهٔ جملهٔ فارسی.';
  eq('ordinary prose after the URL is untouched (no percent escape in it)',
     stripTextFragments(t).text, 'متن مقاله https://example.com/x و سپس ادامهٔ جملهٔ فارسی.');
}
{
  const t = '{{یادکرد وب |نشانی=https://example.com/x#:~:text=a%20b |عنوان=نام%20صفحه}}';
  eq('the next template parameter is not debris, even percent-encoded',
     stripTextFragments(t).text,
     '{{یادکرد وب |نشانی=https://example.com/x |عنوان=نام%20صفحه}}');
}
{
  const t = 'دو نشانی: https://example.com/x#:~:text=a%20b https://example.org/y%20z';
  eq('a following URL is never swallowed', stripTextFragments(t).text,
     'دو نشانی: https://example.com/x https://example.org/y%20z');
}
{
  const t = '[[صفحه#:~:text=متن برجسته، بخش دوم جمله.|برچسب]] و %20 بعد از آن';
  eq('the wikilink context is unaffected by the debris rule', stripTextFragments(t).text,
     '[[صفحه|برچسب]] و %20 بعد از آن');
}

console.log('\n== a gate complaint that only CHANGES WORDING is not a fresh defect ==');
{
  // «شماره استاندارد بین‌المللی پیایند», first live batch: the gate's Latin-display-label
  // rule quoted the wikilink, and the directive was inside the quote — so the same
  // pre-existing defect read as new after the strip and the page was refused. `verify`
  // normalises each problem string through this same transform before comparing, so the
  // two spellings of one complaint must collapse to the identical string.
  const before = "Persian link target with a LATIN display label: ['[[شماره استاندارد بین\u200cالمللی پیایند#:~:text=ISSN%20is,a%20serial|ISSN]]']";
  const after = "Persian link target with a LATIN display label: ['[[شماره استاندارد بین\u200cالمللی پیایند|ISSN]]']";
  eq('the before-complaint normalises to the after-complaint',
     stripTextFragments(before).text, after);
}

console.log(`\n${pass} گذشت، ${fails.length} افتاد`);
if (fails.length) { console.error('failing:\n  - ' + fails.join('\n  - ')); process.exit(1); }
