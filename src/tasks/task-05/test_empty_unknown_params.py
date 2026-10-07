#!/usr/bin/env python3
# Unit tests for MamouriBot Task 5 (empty-unknown-params). Pure logic, no network / no creds.
# Run:  python3 src/tasks/task-05/test_empty_unknown_params.py
import importlib.util, os, sys
_p=os.path.join(os.path.dirname(os.path.abspath(__file__)),'empty-unknown-params.py')
spec=importlib.util.spec_from_file_location('euparams',_p); M=importlib.util.module_from_spec(spec); spec.loader.exec_module(M)

fails=[]
def check(name, got, want):
    ok = got==want
    print(('  ok  ' if ok else ' FAIL ')+name)
    if not ok:
        print('        got :',repr(got)); print('        want:',repr(want)); fails.append(name)
def check_true(name, cond):
    print(('  ok  ' if cond else ' FAIL ')+name)
    if not cond: fails.append(name)

print('== split_top_pipes: pipes inside [[]] / {{}} must NOT split ==')
check('link pipe not split', M.split_top_pipes('عنوان=[[a|b]]|ناشر=x'), ['عنوان=[[a|b]]','ناشر=x'])
check('nested template not split', M.split_top_pipes('عنوان={{و|x|y}}|ص=۵'), ['عنوان={{و|x|y}}','ص=۵'])
check('plain split', M.split_top_pipes('a=1|b=2|c=3'), ['a=1','b=2','c=3'])

print('== arg_named: = inside [[]] must not be read as the separator ==')
check('named simple', M.arg_named('عنوان=خبر'), ('عنوان','خبر'))
check('positional -> None', M.arg_named('صرفاً متن'), None)
check('= inside link', M.arg_named('نشانی=http://a.com/x?a=b'), ('نشانی','http://a.com/x?a=b'))

print('== find_cite_templates: which template names match ==')
def names(text):
    return [text[a:b].split('|')[0][2:].strip() for (a,b) in M.find_cite_templates(text)]
check('cite web (en) matched', names('x {{cite web|title=t}} y'), ['cite web'])
check('یادکرد وب (space) matched', names('{{یادکرد وب|عنوان=t}}'), ['یادکرد وب'])
check('یادکرد-وب (hyphen) matched', names('{{یادکرد-وب|عنوان=t}}'), ['یادکرد-وب'])
check('citation matched', names('{{citation|title=t}}'), ['citation'])
check_true('یادکرد-ویکی EXCLUDED', names('{{یادکرد-ویکی|عنوان=t}}')==[])
check_true('non-cite template ignored', names('{{جعبه اطلاعات|نام=x}}')==[])
check_true('two cites found', len(M.find_cite_templates('{{cite web|t=1}}{{یادکرد کتاب|عنوان=2}}'))==2)
check_true('nested braces balance', len(M.find_cite_templates('{{cite web|title={{lang|en|X}}|url=u}}'))==1)

print('== strip_template: SAFETY — remove only empty+flagged; never touch valued params ==')
def strip(tpl, fn, fp):
    return M.strip_template(tpl, set(fn), set(fp))
# empty flagged-named removed, valued param kept, empty NON-flagged param kept
t='{{یادکرد وب|عنوان=خبر|ماه=|ناشر=بی‌بی‌سی|coauthors=|تاریخ بازدید=}}'
new,rem=strip(t, ['ماه','coauthors'], [])
check_true('removed exactly ماه+coauthors', sorted(rem)==sorted(['|ماه=','|coauthors=']))
check_true('kept valued عنوان/ناشر', 'عنوان=خبر' in new and 'ناشر=بی‌بی‌سی' in new)
check_true('kept NON-flagged empty تاریخ بازدید (SAFETY)', 'تاریخ بازدید=' in new)
# never remove a flagged param that HAS a value
t2='{{یادکرد وب|عنوان=x|ماه=مه}}'
new2,rem2=strip(t2, ['ماه'], [])
check_true('valued flagged param NOT removed (SAFETY)', rem2==[] and new2==t2)
# empty bare positional removed only when a positional is flagged (fpos is Latin-normalized, see flagged_params)
t3='{{یادکرد وب|عنوان=x||ناشر=y}}'
n3,r3=strip(t3, [], ['1'])
check_true('empty bare positional removed when flagged', '|<pos>' in r3 and 'عنوان=x' in n3 and 'ناشر=y' in n3)
n3b,r3b=strip(t3, [], [])
check_true('empty bare positional KEPT when no positional flagged (SAFETY)', r3b==[])
# explicit numeric-named empty removed when flagged (Persian-digit wikitext key vs Latin-normalized flag set)
t4='{{یادکرد وب|عنوان=x|۶=}}'
n4,r4=strip(t4, [], ['6'])
check_true('empty |۶= removed when flagged', '|۶=' in r4 and 'عنوان=x' in n4)
# REGRESSION: Latin-digit wikitext key |3= flagged by the module as Persian «۳» must still match
t4b='{{یادکرد وب|عنوان=x|3=}}'
n4b,r4b=strip(t4b, [], ['3'])
check_true('empty |3= (Latin key) removed when flagged as «۳»', '|3=' in r4b and 'عنوان=x' in n4b)
# REGRESSION: stray |= (empty NAME) rendered as «(empty string)» placeholder must be removed
t4c='{{یادکرد|نویسنده=x|=|ناشر=y}}'
n4c,r4c=strip(t4c, ['(empty string)'], [])
check_true('empty-name |= removed when flagged «(empty string)»', '|=' in r4c and 'نویسنده=x' in n4c and 'ناشر=y' in n4c)
# SAFETY: |= must NOT be removed when the empty-name placeholder is not flagged
n4d,r4d=strip(t4c, [], [])
check_true('empty-name |= KEPT when not flagged (SAFETY)', r4d==[])
# REGRESSION: underscore key |unused_data= flagged by the module as «unused data» (space) must match
t4e='{{cite news|title=x|unused_data=|publisher=y}}'
n4e,r4e=strip(t4e, ['unused data'], [])
check_true('empty |unused_data= removed when flagged «unused data»', '|unused_data=' in r4e and 'title=x' in n4e)
# SAFETY: a comment value is NOT empty -> must be KEPT even when the name is flagged
t4f='{{cite news|title=x|unused_data=<!--accessdate=2010-->}}'
n4f,r4f=strip(t4f, ['unused data'], [])
check_true('|unused_data=<!--comment--> KEPT (value not empty)', r4f==[])
# nothing flagged -> no change
n5,r5=strip('{{یادکرد وب|عنوان=x|ماه=}}', [], [])
check_true('no flags -> no removal', r5==[])

print('== flagged_params: PRECISE — only from the error span, never neighbouring text ==')
html_mixed=('<cite class="citation web">... بازبینی‌شده در ۱ ژانویه ۲۰۲۰ ...</cite>'
 '<span class="cs1-visible-error citation-comment">یادکرد پارامتر ناشناختهٔ خالی داردs: '
 '<code class="cs1-code">&#124;۱=</code>، <code class="cs1-code">&#124;ماه=</code>، و '
 '<code class="cs1-code">&#124;editors=</code> (<a href="/x#param_unknown_empty">کمک</a></span>')
n,p=M.flagged_params(html_mixed)
check('named exactly {editors,ماه}', sorted(n), ['editors','ماه'])
check('positional exactly {1} (Latin-normalized)', sorted(p), ['1'])
# a valid access-date rendered nearby must NOT be captured
html_valid='<cite class="citation web">بازبینی‌شده در ۱ ژانویه ۲۰۲۰. |تاریخ بازدید= text</cite>'
n2,p2=M.flagged_params(html_valid)
check_true('no false positive from normal text (تاریخ بازدید)', n2==set() and p2==set())
# REGRESSION: the pipe in cs1-code can render as a LITERAL '|' (not only &#124;) — must still parse
html_litpipe=('<span class="cs1-visible-error citation-comment">یادکرد پارامتر ناشناختهٔ خالی دارد: '
 '<code class="cs1-code">|۱=</code>، <code class="cs1-code">|coauthors=</code> (<a href="/x#param_unknown_empty">کمک</a></span>')
n3,p3=M.flagged_params(html_litpipe)
check('literal-pipe named {coauthors}', sorted(n3), ['coauthors'])
check('literal-pipe positional {1}', sorted(p3), ['1'])

print('== cite_core: gate compares citation content minus cs1 spans ==')
h_before='<cite class="citation web" id="A">متن یادکرد.<span class="cs1-visible-error">خطا</span></cite>'
h_after ='<cite class="citation web" id="B">متن یادکرد.</cite>'
check_true('core identical after error removed', M.cite_core(h_before)==M.cite_core(h_after))
h_changed='<cite class="citation web">متن دیگری.</cite>'
check_true('core differs when content changes (gate would BLOCK)', M.cite_core(h_before)!=M.cite_core(h_changed))

print()
if fails:
    print(f'RESULT: {len(fails)} FAILED -> {fails}'); sys.exit(1)
print('RESULT: ALL TESTS PASSED')
