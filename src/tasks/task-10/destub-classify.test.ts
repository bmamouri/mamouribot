/**
 * Unit tests for the de-stub prose metric. No network.
 *
 *   npx tsx src/tasks/task-10/destub-classify.test.ts
 *
 * The fixtures are cut down from real fa.wikipedia parser output (دلتا ۲,
 * پری دریایی), not invented, because the failure this metric exists to prevent
 * is counting infobox and stub-banner text as prose — and both live in markup
 * shapes you would not guess.
 */
import { extractProse, countWords, score, parseWorklist } from './destub-classify.js';

const ZWNJ = '‌';
let fail = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a === b) { console.log(`  ✓ ${label}`); return; }
  console.log(`  ✗ ${label}\n      انتظار: ${b}\n      حاصل  : ${a}`);
  fail++;
}
const words = (html: string) => {
  const { proseText, listText } = extractProse(html);
  const p = countWords(proseText), l = countWords(listText);
  return { p: p.total, l: l.total, weighted: p.total + Math.floor(l.total / 2) };
};

console.log('countWords');
eq(countWords('یک دو سه چهار').total, 4, 'plain Persian words');
// The load-bearing case: ZWNJ joins a compound into ONE word. Splitting on it
// inflates every Persian count in the direction that destubs a stub.
eq(countWords(`می${ZWNJ}رود`).total, 1, `«می${ZWNJ}رود» is one word, not two`);
eq(countWords(`کتاب${ZWNJ}های دانشگاه${ZWNJ}های ایران`).total, 3, 'three ZWNJ compounds');
eq(countWords('یک، دو؛ سه. چهار!').total, 4, 'Persian punctuation is not a word');
eq(countWords('«نقل» (قول)').total, 2, 'quotes and parens are not words');
eq(countWords('سال ۱۳۸۹ و 1989').total, 4, 'numbers count as words');
eq(countWords('').total, 0, 'empty text');
eq(countWords(`${ZWNJ} - — …`).total, 0, 'punctuation-only tokens are not words');
eq(countWords('Delta II راکت').latin, 2, 'Latin tokens are counted separately');
eq(countWords('Delta II راکت').total, 3, 'Latin tokens still count toward the total');

console.log('extractProse — what counts');
eq(words('<p>یک دو سه</p>'), { p: 3, l: 0, weighted: 3 }, 'paragraph text counts at 1.0');
eq(words('<ul><li>یک دو سه چهار</li></ul>'), { p: 0, l: 4, weighted: 2 }, 'list text counts at 0.5');
eq(words('<div>یک دو سه</div>'), { p: 0, l: 0, weighted: 0 }, 'bare div text is not counted');
eq(words('<p>یک دو</p><p>سه چهار</p>'), { p: 4, l: 0, weighted: 4 }, 'two paragraphs add up');
eq(words('<dl><dd>یک دو</dd></dl>'), { p: 0, l: 2, weighted: 1 }, 'definition text counts at 0.5');
// A <p> nested in an <li> must be counted once, at the list weight of its
// nearest counted container — not once as prose and again as list.
eq(words('<ul><li><p>یک دو</p></li></ul>'), { p: 2, l: 0, weighted: 2 },
  'the innermost counted container decides the weight');

console.log('extractProse — what is dropped');
eq(words('<table><tr><td><p>یک دو سه</p></td></tr></table>'), { p: 0, l: 0, weighted: 0 },
  'paragraph inside a table is dropped');
// The reason this is a depth-aware walk and not a regex: a non-greedy
// <table>…</table> closes on the INNER </table> and lets the rest be counted.
eq(words('<table><tr><td><table><tr><td>درون</td></tr></table>' +
  '<p>یک دو سه چهار پنج</p></td></tr></table>'), { p: 0, l: 0, weighted: 0 },
  'nested tables do not leak the outer table\'s prose');
eq(words('<div class="infobox"><p>یک دو سه</p></div>'), { p: 0, l: 0, weighted: 0 },
  'infobox is dropped by class');
// fa's stub banner is a div, not a table, and its own text sits in a <p>.
eq(words('<div role="note" class="metadata plainlinks asbox stub"><table role="presentation">' +
  '<tbody><tr><td><p class="asbox-body">این یک مقالهٔ خرد است می‌توانید با گسترش آن کمک کنید</p>' +
  '</td></tr></tbody></table></div>'), { p: 0, l: 0, weighted: 0 },
  'the stub banner does not count itself as prose');
eq(words('<div class="reflist"><ol class="references"><li>یک دو سه</li></ol></div>'),
  { p: 0, l: 0, weighted: 0 }, 'reference list is dropped');
eq(words('<p>متن<sup class="reference">[۱]</sup> ادامه</p>'), { p: 2, l: 0, weighted: 2 },
  'footnote markers are dropped but surrounding prose survives');
eq(words('<h2>عنوان بخش</h2><p>یک دو</p>'), { p: 2, l: 0, weighted: 2 },
  'headings are not counted');
eq(words('<style>.mw-parser-output .asbox{position:relative}</style><p>یک دو</p>'),
  { p: 2, l: 0, weighted: 2 }, 'CSS in a style block is not prose');
eq(words('<div class="thumb"><div class="thumbcaption">شرح تصویر طولانی</div></div><p>یک دو</p>'),
  { p: 2, l: 0, weighted: 2 }, 'image captions are dropped');
eq(words('<div class="navbox"><ul><li>یک</li><li>دو</li></ul></div><p>سه چهار</p>'),
  { p: 2, l: 0, weighted: 2 }, 'navbox list items are dropped');

console.log('extractProse — malformed markup');
// MediaWiki emits some unbalanced markup; a stray close must not unwind the
// stack and silently start counting infobox text as prose.
eq(words('<table><tr><td></p><p>یک دو سه</p></td></tr></table>'), { p: 0, l: 0, weighted: 0 },
  'a stray closing tag does not pop the dropped table');
eq(words('<p>یک دو<br/>سه چهار</p>'), { p: 4, l: 0, weighted: 4 }, 'void tags do not break the walk');
eq(words('<p>یک <a href="/wiki/x" title="a > b">دو</a> سه</p>'), { p: 3, l: 0, weighted: 3 },
  'a > inside a quoted attribute does not end the tag');
eq(words('<p>متن &amp; &nbsp; &#۱۲۳; پایان</p>').p, 3, 'entities decode without inventing words');

console.log('score — tiers');
const base = { bytes: 12000, wikitext: '<ref>x</ref>', isDisambig: false, tagReadded: false };
const para = (n: number) => `<p>${Array.from({ length: n }, (_, i) => `واژه${i}`).join(' ')}</p>`;
eq(score({ ...base, title: 'آ', html: para(500) }).tier, 'auto-remove', '500 prose words auto-removes');
eq(score({ ...base, title: 'آ', html: para(300) }).tier, 'needs-human', '300 words needs a human');
eq(score({ ...base, title: 'آ', html: para(40) }).tier, 'leave-alone', '40 words is still a stub');
// The measured false positive: 12 KB of infobox, 44 words of prose.
eq(score({ ...base, title: 'دلتا ۲', html: '<div class="infobox">' + para(3000) + '</div>' + para(44) }).tier,
  'leave-alone', 'a long infobox does not destub a 44-word article');

console.log('score — refusals');
const long = para(500);
eq(score({ ...base, title: 'فهرست موشک‌ها', html: long }).flags.length > 0, true,
  'a فهرست title is never auto-removed');
eq(score({ ...base, title: 'آ', html: long, isDisambig: true }).flags.length > 0, true,
  'a disambiguation page is never auto-removed');
eq(score({ ...base, title: 'آ', html: long, tagReadded: true }).flags.length > 0, true,
  'a tag a human restored is never re-removed');
eq(score({ ...base, title: 'آ', html: long, wikitext: 'بدون منبع' }).flags.length > 0, true,
  'no <ref> at all is never auto-removed');
eq(score({ ...base, title: 'آ', html: long + '<p>{{{نام}}}</p>' }).flags.length > 0, true,
  'a leaked template parameter blocks removal');
eq(score({ ...base, title: 'آ', html: long + '<span class="scribunto-error">خطا</span>' }).flags.length > 0, true,
  'a Lua error blocks removal');
eq(score({ ...base, title: 'آ', html: long, bytes: 500000 }).flags.length > 0, true,
  'page bytes far exceeding its prose blocks removal');
eq(score({ ...base, title: 'آ', html: `<ul>${'<li>یک دو سه چهار</li>'.repeat(200)}</ul>` + para(200) })
  .flags.some(f => f.includes('فهرست')), true, 'a mostly-list article is flagged');
// The one class the word count REWARDS: untranslated English still counts.
eq(score({ ...base, title: 'آ',
  html: `<p>${'English words here '.repeat(150)}</p>` + para(200) }).flags.some(f => f.includes('لاتین')),
  true, 'a high Latin share is flagged as untranslated');

console.log('score — CS1 errors are recorded, not blocking');
// Five of the first six articles sampled had one. Blocking on it would have
// destroyed the yield in exchange for no protection against a wrong removal.
const cs1 = score({ ...base, title: 'آ',
  html: long + '<span class="cs1-visible-error citation-comment">خطای یادکرد</span>' });
eq(cs1.tier, 'auto-remove', 'a CS1 citation error does not block removal');
eq(cs1.notes, ['خطای یادکرد CS1'], 'but it is recorded on the verdict');
// The phantom this replaced: the CSS rule naming the class, present on every
// page that cites anything.
eq(score({ ...base, title: 'آ',
  html: '<style>.mw-parser-output .cs1-visible-error{color:red}</style>' + long }).notes, [],
  'the TemplateStyles rule naming the class is not an error');
eq(score({ ...base, title: 'آ',
  html: '<style>.mw-parser-output .error{color:red}</style>' + long }).flags, [],
  'nor is a CSS rule naming .error');

console.log('parseWorklist');
eq(parseWorklist(
  '| {{formatnum:1}} || [[جورج_راسل_(اتومبیل‌ران)]] || {{formatnum:77366}}\n|-\n' +
  '| {{formatnum:2}} || [[طبق‌زنی]] || {{formatnum:60429}}'),
  [{ title: 'جورج راسل (اتومبیل‌ران)', bytes: 77366 }, { title: 'طبق‌زنی', bytes: 60429 }],
  'reads titles and byte sizes, underscores normalised');
eq(parseWorklist('آخرین به روز رسانی: ۲۵ سپتامبر ۲۰۲۶\n{| class="wikitable sortable"\n!ردیف'), [],
  'ignores the report header');

console.log(fail === 0 ? '\nهمهٔ آزمون‌ها موفق.' : `\n${fail} آزمون ناموفق.`);
process.exit(fail === 0 ? 0 : 1);
