/**
 * Offline tests for the وظیفهٔ ۱۵ source detector.
 *
 * Every case here is the boundary, not the happy path, and most assert that something is
 * NOT read as unsourced. A false "no sources" becomes a {{بدون منبع}} banner on a page
 * that cites its work, which is the one outcome §3 is built to avoid.
 *
 * The port's agreement with the research prototype is checked separately and over real
 * pages by `source-detect.replay.ts`; that one needs the network and is excluded from
 * `npm test` by its name.
 */
import { sourceFeatures, isStrictUnsourced, isGeneralReference, templateNames } from './source-detect.js';

let pass = 0;
const fails: string[] = [];
const check = (name: string, cond: boolean, detail = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else fails.push(`${name}${detail ? ': ' + detail : ''}`);
};

const unsourced = (name: string, text: string) =>
  check(name, isStrictUnsourced(sourceFeatures(text)), JSON.stringify(sourceFeatures(text)));
const sourced = (name: string, text: string) =>
  check(name, !isStrictUnsourced(sourceFeatures(text)), JSON.stringify(sourceFeatures(text)));

// ---- each source kind in §3.0 must be recognised -------------------------------------
sourced('a plain ref', 'متن.<ref>کتابی، تهران ۱۳۹۰</ref>');
sourced('a citation template inside a ref', 'متن.<ref>{{یادکرد کتاب|عنوان=الف}}</ref>');
sourced('a citation template outside a ref', 'متن.\n{{یادکرد خبر|عنوان=الف}}');
sourced('an sfn', 'متن.{{پک|نویسنده|۱۳۹۰|ص=۱۲}}');
sourced('a bare URL', 'متن. https://example.com/x');
sourced('an ISBN', 'متن. شابک ۹۷۸-۳-۱۶-۱۴۸۴۱۰-۰');
sourced('a general reference under منابع',
  'متن.\n\n== منابع ==\n* نویسنده، «عنوان مقاله»، نشریه، ۱۳۹۰، ص ۱۲.\n');

// ---- §1.9: یادکرد-ویکی is not a source -----------------------------------------------
unsourced('a ref containing only یادکرد-ویکی', 'متن.<ref>{{یادکرد-ویکی|عنوان=X|زبان=en}}</ref>');
unsourced('a bare یادکرد-ویکی outside a ref', 'متن.\n{{یادکرد-ویکی|عنوان=X|زبان=en}}');
unsourced('یادکرد-ویکی as the only general reference',
  'متن.\n\n== منابع ==\n* {{یادکرد-ویکی|عنوان=X|زبان=en}}\n');
sourced('a ref holding یادکرد-ویکی AND a real citation',
  'متن.<ref>{{یادکرد-ویکی|عنوان=X}} و {{یادکرد کتاب|عنوان=ی}}</ref>');
sourced('a ref holding یادکرد-ویکی and a URL',
  'متن.<ref>{{یادکرد-ویکی|عنوان=X}} https://example.com</ref>');

// ---- things that look like sources but are not ---------------------------------------
unsourced('a ref inside an HTML comment', 'متن.<!-- <ref>کتاب</ref> -->');
unsourced('a URL inside an HTML comment', 'متن.<!-- https://example.com -->');
unsourced('a ref inside nowiki', 'متن.<nowiki><ref>کتاب</ref></nowiki>');
// Counted as a source even though it is sample code, on purpose: URLs are read from
// the comment-stripped text so that a nowiki-escaped URL inside a <ref> is not lost
// («پری»). The cost is skipping a page whose only URL is in a code block; the cost of
// the other choice is a false {{بدون منبع}}.
sourced('a URL inside syntaxhighlight is counted, conservatively',
  'متن.<syntaxhighlight lang="js">fetch("https://example.com")</syntaxhighlight>');

// ---- see-also must not be read as a general reference --------------------------------
unsourced('a see-also list of wikilinks',
  'متن.\n\n== جستارهای وابسته ==\n* [[الف]]\n* [[ب]] — [[ج]]\n');
check('isGeneralReference rejects a pure wikilink bullet under See also',
  !isGeneralReference('* [[الف بسیار طولانی و دراز]]', 'جستارهای وابسته'));
check('isGeneralReference accepts a real citation under پیوند به بیرون',
  isGeneralReference('* نویسنده، عنوان کتاب، انتشارات، ۱۳۹۰', 'پیوند به بیرون'));
check('isGeneralReference rejects a short bullet',
  !isGeneralReference('* کوتاه', 'منابع'));

// ---- a bullet outside a references heading is not a general reference -----------------
unsourced('a bulleted list under an ordinary heading',
  'متن.\n\n== زندگی ==\n* او در سال ۱۳۲۰ زاده شد و در تهران درس خواند.\n');

// ---- the reuse trap -------------------------------------------------------------------
sourced('a named reuse means a reference is defined somewhere',
  'متن.<ref name="a"/> و متن دیگر.');

// ---- feature counts, for the replay to key on ----------------------------------------
const f = sourceFeatures(
  'آ.<ref>{{یادکرد کتاب|عنوان=۱}}</ref> ب.<ref>{{یادکرد-ویکی|عنوان=۲}}</ref> ' +
  '{{یادکرد خبر|عنوان=۳}} {{پک|x|۱۳۹۰}} https://example.com شابک ۹۷۸' +
  '\n\n== منابع ==\n* نویسنده، عنوان، نشر، ۱۳۹۰، ص ۱۲.\n');
check('refs counted', f.refs === 2, String(f.refs));
check('real refs counted', f.refs_real === 1, String(f.refs_real));
check('یادکرد-ویکی-only refs counted', f.refs_ykw_only === 1, String(f.refs_ykw_only));
check('loose citation templates counted, ref bodies excluded',
  f.cite_outside === 1, String(f.cite_outside));
check('sfn counted', f.sfn === 1, String(f.sfn));
check('urls counted', f.http === 1, String(f.http));
check('general references counted', f.genref_lines === 1, String(f.genref_lines));
check('isbn seen', f.isbn);

check('templateNames normalises underscores and case',
  templateNames('{{Cite_Book|a=1}}')[0] === 'cite book', templateNames('{{Cite_Book|a=1}}')[0]);

// ---- a source for the WORD is not a source for the article ---------------------------
// «مولکول» had exactly one reference, {{یادکرد فرهنگستان}}, and the first trial run
// removed its {{بدون منبع}} on the strength of it. The Academy's approved-terms
// dictionary says what the Persian word should be; it supports no claim in the article.
unsourced('a ref holding only یادکرد فرهنگستان',
  'متن.<ref>{{یادکرد فرهنگستان | مصوب=مولکول | بیگانه=molecule | حوزه=شیمی}}</ref>');
unsourced('a bare یادکرد فرهنگستان outside a ref',
  'متن.\n{{یادکرد فرهنگستان|مصوب=الف|بیگانه=a}}');
sourced('…but فرهنگستان alongside a real citation still counts',
  'متن.<ref>{{یادکرد فرهنگستان|مصوب=الف}} {{یادکرد کتاب|عنوان=ب}}</ref>');

// A reference to another Wikipedia is not a source either, however it is written.
unsourced('a ref whose only content is a wikipedia URL',
  'متن.<ref>https://en.wikipedia.org/wiki/Molecule</ref>');
unsourced('a bare wikipedia URL in منابع',
  'متن.\n\n== منابع ==\n* https://en.wikipedia.org/wiki/Molecule برگرفته از ویکی‌پدیای انگلیسی\n');
sourced('a non-wiki URL is still a source',
  'متن.<ref>https://www.britannica.com/science/molecule</ref>');

// «نوگرایی» cites several references as hand-written prose; those are real.
sourced('a hand-written prose citation counts',
  'متن.<ref>زوِلِبیل، کامیل (۱۹۹۲). «همراه مطالعات تاریخ ادبیات تامیل». انتشارات بریل.</ref>');

// ---- the two views must stay aligned -------------------------------------------------
// A ref whose body is nowiki-escaped is still a citation («پری», «برت مایر»); a ref that
// is ITSELF inside nowiki is markup on display and cites nothing. Both at once:
const mixed = sourceFeatures(
  'آ.<ref><nowiki>https://sid.ir/paper/1</nowiki></ref> ب.<nowiki><ref>کتاب</ref></nowiki>');
check('an escaped URL inside a ref still counts as a real ref',
  mixed.refs_real === 1, JSON.stringify(mixed));
check('a ref inside nowiki is not a ref at all',
  mixed.refs === 1, JSON.stringify(mixed));

console.log(`\n${pass} گذشت، ${fails.length} افتاد`);
if (fails.length) { console.error('failing:\n  - ' + fails.join('\n  - ')); process.exit(1); }
