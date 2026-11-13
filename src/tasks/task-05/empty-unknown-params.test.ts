/**
 * وظیفهٔ ۵ — offline tests.
 *
 *   npx tsx src/tasks/task-05/empty-unknown-params.test.ts
 *
 * A faithful port of the original Python test suite (test_empty_unknown_params.py,
 * deleted; see git history) — every one of its 27 assertions, same fixtures, same
 * names. Ported rather than rewritten because a regex can behave differently in another
 * language, and the only trustworthy proof of a port is the identical test passing
 * against the identical input (`docs/BUILDING-A-TASK.md` §4).
 */
import {
  argNamed, citeCore, findCiteTemplates, flaggedParams, splitTopPipes, stripTemplate,
} from './empty-unknown-params.js';

let pass = 0;
const fails: string[] = [];
function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log((ok ? '  ok  ' : ' FAIL ') + name);
  if (!ok) { console.log('        got :', JSON.stringify(got)); console.log('        want:', JSON.stringify(want)); fails.push(name); }
}
function checkTrue(name: string, cond: boolean) {
  console.log((cond ? '  ok  ' : ' FAIL ') + name);
  if (!cond) fails.push(name);
}

console.log('== split_top_pipes: pipes inside [[]] / {{}} must NOT split ==');
check('link pipe not split', splitTopPipes('عنوان=[[a|b]]|ناشر=x'), ['عنوان=[[a|b]]', 'ناشر=x']);
check('nested template not split', splitTopPipes('عنوان={{و|x|y}}|ص=۵'), ['عنوان={{و|x|y}}', 'ص=۵']);
check('plain split', splitTopPipes('a=1|b=2|c=3'), ['a=1', 'b=2', 'c=3']);

console.log('== arg_named: = inside [[]] must not be read as the separator ==');
check('named simple', argNamed('عنوان=خبر'), ['عنوان', 'خبر']);
check('positional -> null', argNamed('صرفاً متن'), null);
check('= inside link', argNamed('نشانی=http://a.com/x?a=b'), ['نشانی', 'http://a.com/x?a=b']);

console.log('== find_cite_templates: which template names match ==');
function names(text: string): string[] {
  return findCiteTemplates(text).map(([a, b]) => text.slice(a, b).split('|')[0].slice(2).trim());
}
check('cite web (en) matched', names('x {{cite web|title=t}} y'), ['cite web']);
check('یادکرد وب (space) matched', names('{{یادکرد وب|عنوان=t}}'), ['یادکرد وب']);
check('یادکرد-وب (hyphen) matched', names('{{یادکرد-وب|عنوان=t}}'), ['یادکرد-وب']);
check('citation matched', names('{{citation|title=t}}'), ['citation']);
checkTrue('یادکرد-ویکی EXCLUDED', names('{{یادکرد-ویکی|عنوان=t}}').length === 0);
checkTrue('non-cite template ignored', names('{{جعبه اطلاعات|نام=x}}').length === 0);
checkTrue('two cites found', findCiteTemplates('{{cite web|t=1}}{{یادکرد کتاب|عنوان=2}}').length === 2);
checkTrue('nested braces balance', findCiteTemplates('{{cite web|title={{lang|en|X}}|url=u}}').length === 1);

console.log('== strip_template: SAFETY — remove only empty+flagged; never touch valued params ==');
function strip(tpl: string, fn: string[], fp: string[]) {
  return stripTemplate(tpl, new Set(fn), new Set(fp));
}
// empty flagged-named removed, valued param kept, empty NON-flagged param kept
{
  const t = '{{یادکرد وب|عنوان=خبر|ماه=|ناشر=بی‌بی‌سی|coauthors=|تاریخ بازدید=}}';
  const { out: newText, removed: rem } = strip(t, ['ماه', 'coauthors'], []);
  checkTrue('removed exactly ماه+coauthors', JSON.stringify(rem.slice().sort()) === JSON.stringify(['|coauthors=', '|ماه='].sort()));
  checkTrue('kept valued عنوان/ناشر', newText.includes('عنوان=خبر') && newText.includes('ناشر=بی‌بی‌سی'));
  checkTrue('kept NON-flagged empty تاریخ بازدید (SAFETY)', newText.includes('تاریخ بازدید='));
}
// never remove a flagged param that HAS a value
{
  const t2 = '{{یادکرد وب|عنوان=x|ماه=مه}}';
  const { out: new2, removed: rem2 } = strip(t2, ['ماه'], []);
  checkTrue('valued flagged param NOT removed (SAFETY)', rem2.length === 0 && new2 === t2);
}
// empty bare positional removed only when a positional is flagged (fpos is Latin-normalized, see flaggedParams)
{
  const t3 = '{{یادکرد وب|عنوان=x||ناشر=y}}';
  const { removed: r3 } = strip(t3, [], ['1']);
  checkTrue('empty bare positional removed when flagged', r3.includes('|<pos>'));
  const { out: n3 } = strip(t3, [], ['1']);
  checkTrue('empty bare positional removed — عنوان/ناشر survive', n3.includes('عنوان=x') && n3.includes('ناشر=y'));
  const { removed: r3b } = strip(t3, [], []);
  checkTrue('empty bare positional KEPT when no positional flagged (SAFETY)', r3b.length === 0);
}
// explicit numeric-named empty removed when flagged (Persian-digit wikitext key vs Latin-normalized flag set)
{
  const t4 = '{{یادکرد وب|عنوان=x|۶=}}';
  const { out: n4, removed: r4 } = strip(t4, [], ['6']);
  checkTrue('empty |۶= removed when flagged', r4.includes('|۶=') && n4.includes('عنوان=x'));
}
// REGRESSION: Latin-digit wikitext key |3= flagged by the module as Persian «۳» must still match
{
  const t4b = '{{یادکرد وب|عنوان=x|3=}}';
  const { out: n4b, removed: r4b } = strip(t4b, [], ['3']);
  checkTrue('empty |3= (Latin key) removed when flagged as «۳»', r4b.includes('|3=') && n4b.includes('عنوان=x'));
}
// REGRESSION: stray |= (empty NAME) rendered as «(empty string)» placeholder must be removed
{
  const t4c = '{{یادکرد|نویسنده=x|=|ناشر=y}}';
  const { out: n4c, removed: r4c } = strip(t4c, ['(empty string)'], []);
  checkTrue('empty-name |= removed when flagged «(empty string)»',
    r4c.includes('|=') && n4c.includes('نویسنده=x') && n4c.includes('ناشر=y'));
  // SAFETY: |= must NOT be removed when the empty-name placeholder is not flagged
  const { removed: r4d } = strip(t4c, [], []);
  checkTrue('empty-name |= KEPT when not flagged (SAFETY)', r4d.length === 0);
}
// REGRESSION: underscore key |unused_data= flagged by the module as «unused data» (space) must match
{
  const t4e = '{{cite news|title=x|unused_data=|publisher=y}}';
  const { out: n4e, removed: r4e } = strip(t4e, ['unused data'], []);
  checkTrue('empty |unused_data= removed when flagged «unused data»',
    r4e.includes('|unused_data=') && n4e.includes('title=x'));
}
// SAFETY: a comment value is NOT empty -> must be KEPT even when the name is flagged
{
  const t4f = '{{cite news|title=x|unused_data=<!--accessdate=2010-->}}';
  const { removed: r4f } = strip(t4f, ['unused data'], []);
  checkTrue('|unused_data=<!--comment--> KEPT (value not empty)', r4f.length === 0);
}
// nothing flagged -> no change
{
  const { removed: r5 } = strip('{{یادکرد وب|عنوان=x|ماه=}}', [], []);
  checkTrue('no flags -> no removal', r5.length === 0);
}

console.log('== flagged_params: PRECISE — only from the error span, never neighbouring text ==');
{
  const htmlMixed = '<cite class="citation web">... بازبینی‌شده در ۱ ژانویه ۲۰۲۰ ...</cite>'
    + '<span class="cs1-visible-error citation-comment">یادکرد پارامتر ناشناختهٔ خالی داردs: '
    + '<code class="cs1-code">&#124;۱=</code>، <code class="cs1-code">&#124;ماه=</code>، و '
    + '<code class="cs1-code">&#124;editors=</code> (<a href="/x#param_unknown_empty">کمک</a></span>';
  const { named: n, pos: p } = flaggedParams(htmlMixed);
  check('named exactly {editors,ماه}', [...n].sort(), ['editors', 'ماه'].sort());
  check('positional exactly {1} (Latin-normalized)', [...p].sort(), ['1']);
}
{
  // a valid access-date rendered nearby must NOT be captured
  const htmlValid = '<cite class="citation web">بازبینی‌شده در ۱ ژانویه ۲۰۲۰. |تاریخ بازدید= text</cite>';
  const { named: n2, pos: p2 } = flaggedParams(htmlValid);
  checkTrue('no false positive from normal text (تاریخ بازدید)', n2.size === 0 && p2.size === 0);
}
{
  // REGRESSION: the pipe in cs1-code can render as a LITERAL '|' (not only &#124;) — must still parse
  const htmlLitpipe = '<span class="cs1-visible-error citation-comment">یادکرد پارامتر ناشناختهٔ خالی دارد: '
    + '<code class="cs1-code">|۱=</code>، <code class="cs1-code">|coauthors=</code> (<a href="/x#param_unknown_empty">کمک</a></span>';
  const { named: n3, pos: p3 } = flaggedParams(htmlLitpipe);
  check('literal-pipe named {coauthors}', [...n3].sort(), ['coauthors']);
  check('literal-pipe positional {1}', [...p3].sort(), ['1']);
}

console.log('== cite_core: gate compares citation content minus cs1 spans ==');
{
  const hBefore = '<cite class="citation web" id="A">متن یادکرد.<span class="cs1-visible-error">خطا</span></cite>';
  const hAfter = '<cite class="citation web" id="B">متن یادکرد.</cite>';
  checkTrue('core identical after error removed', JSON.stringify(citeCore(hBefore)) === JSON.stringify(citeCore(hAfter)));
  const hChanged = '<cite class="citation web">متن دیگری.</cite>';
  checkTrue('core differs when content changes (gate would BLOCK)', JSON.stringify(citeCore(hBefore)) !== JSON.stringify(citeCore(hChanged)));
}

console.log();
if (fails.length) {
  console.log(`RESULT: ${fails.length} FAILED -> ${JSON.stringify(fails)}`);
  process.exit(1);
}
console.log('RESULT: ALL TESTS PASSED');
