#!/usr/bin/env python3
"""Fixtures for scripts/lib/gates.py — every gate must FIRE and must NOT misfire.

Run: python3 scripts/lib/test_gates.py

Each gate gets two fixtures: text it must flag, and near-miss text it must
leave alone. The second half matters as much as the first. A gate with a false
positive gets switched off by the next person who hits it, and this repo has
already shipped both failure modes:

  * a nested-template strip regex that deleted the whole citation, so a broken
    page reported zero defects
  * a BSicon regex `^[a-z]*[A-Z]` that flagged any capitalised word, so real
    labels were dropped from extraction AND from the scan that was supposed to
    catch the omission

Where a fixture is a real defect, the comment names the page or batch it
shipped on, so nobody "simplifies" the check back into the bug.
"""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gates  # noqa: E402

FAILS = 0


def expect(name, fn, text, should_fire, note=''):
    global FAILS
    hits = fn(text)
    fired = bool(hits)
    ok = fired == should_fire
    if not ok:
        FAILS += 1
    verb = 'FIRE' if should_fire else 'stay quiet'
    print('%-4s %-28s must %-10s %s%s' % (
        'ok' if ok else 'FAIL', name, verb,
        note, '' if ok else '   <-- got %r' % (hits[:2],)))


# ---------------------------------------------------------------- braces
# `f"{{یادکرد}}"` in Python emits a SINGLE brace; 21 dead templates shipped
# this way, including a whole کتاب‌نامه, with no error of any kind.
expect('braces', gates.audit_braces, 'متن {یادکرد وب|عنوان=x} متن', True, 'single brace')
expect('braces', gates.audit_braces, '{{{param}}} leak', True, 'triple brace')
expect('braces', gates.audit_braces, 'متن {{یادکرد وب|عنوان=x}} متن', False, 'normal call')
expect('braces', gates.audit_braces, '{{عنوان|{{پک|حافظ|ص=۱}}}}', False, 'nested call')

# ---------------------------------------------------------------- comments
expect('comments', lambda t: [] if gates.audit_comments(t) else ['x'],
       'a <!-- note --> b', False, 'balanced')
expect('comments', lambda t: [] if gates.audit_comments(t) else ['x'],
       'a <!-- از "تصویر" b', True, 'unclosed eats params')

# ---------------------------------------------------------------- signature
# Deleting a Routemap label between two `~~` collapses them into `~~~~`, and
# MediaWiki bakes «Mamouri (بحث) …» into the template on save.
expect('signature', gates.audit_signature, 'BS|uHST~~ایستگاه~~~~متن', True, 'collapsed ~~')
expect('signature', gates.audit_signature, 'BS|uHST~~ایستگاه~~ ~~متن', False, 'spaced ~~')

# ---------------------------------------------------------------- dashes
expect('dashes', gates.audit_dashes, 'او — که شاعر بود — رفت', True, 'em dash U+2014')
expect('dashes', gates.audit_dashes, 'سال‌های ۱۸۵۸–۱۸۶۴ و قزوینی–غنی', False,
       'en dash in ranges/compounds is CORRECT')

# ---------------------------------------------------------------- harakat title
# fa AbuseFilter 89 is a DISALLOW, so the re-submit trick does nothing.
expect('harakat_title', gates.audit_harakat_title, 'فتّان', True, 'shadda in title')
expect('harakat_title', gates.audit_harakat_title, 'فتان', False, 'bare title')

# ---------------------------------------------------------------- dup refnames
expect('dup_refnames', gates.audit_dup_refnames,
       '<ref name="a">ص ۱۲</ref> x <ref name="a">ص ۹۹</ref>', True, 'differing content')
expect('dup_refnames', gates.audit_dup_refnames,
       '<ref name="a">ص ۱۲</ref> x <ref name="a"/>', False, 'definition + reuse')

# ---------------------------------------------------------------- orphan ref reuse
# The defect any split creates: 223 of 224 reuses in the فهرست کشته‌شدگان خیزش
# ۱۴۰۴ ایران table resolve to a definition in a different row, so cutting the
# table anywhere strands them. `hanahr148` is orphaned on the live page today.
expect('orphan_refnames', gates.audit_orphan_refnames,
       'الف<ref name="hanahr148"/> ب', True, 'reuse, no definition')
expect('orphan_refnames', gates.audit_orphan_refnames,
       'الف<ref name="a">منبع</ref> ب<ref name="a"/>', False, 'definition present')
expect('orphan_refnames', gates.audit_orphan_refnames,
       "الف<ref name=a>منبع</ref> ب<ref name='a' /> ج<ref name=\"a\"/>", False,
       'all three quotings are the same name')
expect('orphan_refnames', gates.audit_orphan_refnames,
       'الف<ref name="a"/>{{پانویس|۲|منابع=<ref name="a">منبع</ref>}}', False,
       'list-defined reference defines the name')
expect('orphan_refnames', gates.audit_orphan_refnames,
       'الف<ref>منبع</ref> ب<ref name="a">منبع</ref>', False,
       'anonymous ref is not a reuse')
expect('orphan_refnames', gates.audit_orphan_refnames,
       'الف<ref name="a" group="ع"/> ب<ref name="a" group="ع">منبع</ref>', False,
       'name= is not the first attribute')

# ---------------------------------------------------------------- positional after 1=
# Shipped across ~30 generated navboxes: renders [[ترکی]], a blue link to an
# unrelated article, with no error and no tracking category.
expect('positional_after_named', gates.audit_positional_after_named,
       '{{بت|1=فهرست دسرهای ترکی|en=List of Turkish desserts|ترکی}}', True,
       'bare label after 1=')
expect('positional_after_named', gates.audit_positional_after_named,
       '{{بت|۱=برچسب|en=Title}}', True, 'Persian-digit ۱= is not param 1')
expect('positional_after_named', gates.audit_positional_after_named,
       '{{بت|1=فهرست دسرهای ترکی|2=ترکی|en=List of Turkish desserts}}', False,
       'correct explicit 2=')
expect('positional_after_named', gates.audit_positional_after_named,
       '{{بت|فرانسه|en=France}}', False, 'plain positional, no named 1=')

# ---------------------------------------------------------------- en interwiki
# The porter :en:-prefixed targets that were ALREADY fa titles. An interwiki is
# never red, has no error class and no tracking category.
expect('en_interwiki_persian', gates.audit_en_interwiki_persian,
       '[[:en:کالیفرنیا زفیر|کالیفرنیا زفیر]]', True, 'persian TARGET')
expect('en_interwiki_persian', gates.audit_en_interwiki_persian,
       '[[:en:California Zephyr|کالیفرنیا زفیر]]', False,
       'english target + persian LABEL is the correct shape')

# Shipped on [[کلرانتاسه]] and its four genus articles, 2026-10-02: the link
# targets were localized to the new Persian titles and the display labels were
# left Latin, so every rank row and every prose mention still read «Sarcandra»
# to the reader while the preflight reported zero red links. The user caught it,
# not the gate — which is why it is a gate now and not a third prose lesson.
expect('latin_display_label', gates.audit_latin_display_label,
       "گونه‌های ''[[سارکاندرا|Sarcandra]]'' درختچه‌اند", True,
       'persian target, latin label')
expect('latin_display_label', gates.audit_latin_display_label,
       '[[سارکاندرا]] و [[کلرانتوس]]', False, 'unpiped persian links')
expect('latin_display_label', gates.audit_latin_display_label,
       '[[رابرت براون (گیاه‌شناس)|R.Br.]]', False,
       'naming-authority abbreviation stays Latin by convention')
expect('latin_display_label', gates.audit_latin_display_label,
       '[[آسکارینا|J.R.Forst. & G.Forst.]]', False,
       'multi-author authority abbreviation')
expect('latin_display_label', gates.audit_latin_display_label,
       '[[رده:کلرانتاسه| ]]', False, 'category sortkey is not a label')
expect('latin_display_label', gates.audit_latin_display_label,
       '[[Sarcandra|سارکاندرا]]', False,
       'latin target + persian label is the correct shape')

# A bot-task code subpage (کاربر:MamouriBot/کد/وظیفه N) posts its own source,
# whose string literals and test fixtures contain example links. Inside
# <syntaxhighlight> the parser never reads them as links, so flagging them made
# the publish gate fire on code that was doing nothing wrong — and the tempting
# fix was `skip=`, i.e. switching a real check off. The audits mask
# parser-opaque regions instead.
expect('latin_display_label', gates.audit_latin_display_label,
       '<syntaxhighlight lang="python">x = "[[سارکاندرا|Sarcandra]]"</syntaxhighlight>',
       False, 'example link inside posted source code is not a link')
expect('latin_display_label', gates.audit_latin_display_label,
       '<nowiki>[[سارکاندرا|Sarcandra]]</nowiki>', False, 'nowiki example')

# Reported as a defect on [[دیوان حافظ (نسخه خلخالی)]] and
# [[دیوان حافظ (نسخه پژمان بختیاری)]], 2026-10-06, and it was not one: in a
# citation to an ENGLISH source the work's title belongs in English, and
# linking the fa article behind it is the best of both. A false positive that
# looks like a true positive is expensive — it nearly bought two needless edits
# to already-correct articles.
expect('latin_display_label', gates.audit_latin_display_label,
       '{{یادکرد دانشنامه |نام خانوادگی=Wickens |مقاله=Ḥāfiẓ '
       '|دانشنامه=[[دانشنامه اسلام|Encyclopaedia of Islam]] |ناشر=E. J. Brill '
       '|سال=1986 |زبان=en}}', False,
       'work title in a زبان=en citation is correctly Latin')
# The exemption must stay keyed on زبان: a Persian-language citation carrying a
# Latin label really is porting residue, so it has to keep firing.
expect('latin_display_label', gates.audit_latin_display_label,
       '{{یادکرد کتاب |عنوان=[[سارکاندرا|Sarcandra]] |ناشر=نشر نی '
       '|سال=۱۳۹۰ |زبان=fa}}', True,
       'latin label in a Persian-language citation is still residue')
expect('latin_display_label', gates.audit_latin_display_label,
       '{{یادکرد کتاب |عنوان=[[سارکاندرا|Sarcandra]] |ناشر=نشر نی}}', True,
       'citation with no زبان at all is not exempted')
# The exemption is scoped to the call, not to the rest of the page.
expect('latin_display_label', gates.audit_latin_display_label,
       '{{یادکرد وب |عنوان=[[دانشنامه اسلام|Encyclopaedia of Islam]] |زبان=en}}'
       " و گونه‌های ''[[سارکاندرا|Sarcandra]]'' درختچه‌اند", True,
       'defect outside the exempt citation still fires')
expect('en_interwiki_persian', gates.audit_en_interwiki_persian,
       '<syntaxhighlight lang="python">x = "[[:en:ایستگاه ریور]]"</syntaxhighlight>',
       False, 'dead-interwiki example inside posted source code')
expect('en_interwiki_persian', gates.audit_en_interwiki_persian,
       '[[:en:ایستگاه ریور]]', True, 'the real defect still fires')
expect('dashes', gates.audit_dashes,
       '<syntaxhighlight lang="python"># note — an English comment\n</syntaxhighlight>',
       False, 'em dash in posted source code is not Persian prose')
expect('dashes', gates.audit_dashes, 'متن — دیگر', True,
       'em dash in running Persian prose still fires')

# ---------------------------------------------------------------- bare {{پک}}
# fa's {{پک}} emits only the citation TEXT; unwrapped it prints into the prose
# while CS1, cite errors, tracking cats and CITEREF resolution all pass.
expect('bare_pak', gates.audit_bare_pak, 'متن {{پک|حافظ|۱۳۷۵|ص=۱۲}} متن', True, 'unwrapped')
expect('bare_pak', gates.audit_bare_pak,
       'متن <ref>{{پک|حافظ|۱۳۷۵|ص=۱۲}}</ref>', False, 'plain <ref>')
expect('bare_pak', gates.audit_bare_pak,
       'متن <ref name="سپهر۷۴">{{پک|حافظ|۱۳۷۵|ص=۱۲}}</ref>', False,
       'NAMED ref is also correct')

# ---------------------------------------------------------------- {{پک}} page param
# Only «ص=» is read. صص=/صفحه=/صفحات= drop the page SILENTLY.
expect('pak_page_param', gates.audit_pak_page_param,
       '<ref>{{پک|حافظ|۱۳۷۵|صص=۱۲-۱۴}}</ref>', True, 'صص= is dropped')
expect('pak_page_param', gates.audit_pak_page_param,
       '<ref>{{پک|حافظ|۱۳۷۵|صفحه=۱۲}}</ref>', True, 'صفحه= is dropped')
expect('pak_page_param', gates.audit_pak_page_param,
       '<ref>{{پک|حافظ|۱۳۷۵|ص=۱۲}}</ref>', False, 'correct ص=')

# ---------------------------------------------------------------- cite web params
# «وبگاه» has NO zero-width non-joiner; the half-space spelling prints a
# visible «Unknown parameter» error and is invisible in a diff.
expect('cite_web_params', gates.audit_cite_web_params,
       '{{یادکرد وب|عنوان=x|وب‌گاه=y}}', True, 'ZWNJ spelling rejected')
expect('cite_web_params', gates.audit_cite_web_params,
       '{{یادکرد وب|عنوان=x|وبگاه=y}}', False, 'correct وبگاه')

# ---------------------------------------------------------------- {{نشانی}}
expect('url_template', gates.audit_url_template, '{{نشانی|http://x.com}}', True,
       'emits a permalink to the current page')
expect('url_template', gates.audit_url_template, '{{نشانی وب|http://x.com}}', False,
       'the real URL template')

# ---------------------------------------------------------------- language templates
# Three near-identical names; a one-character ZWNJ difference is invisible.
expect('lang_template', gates.audit_lang_template, '{{به انگلیسی}}', True,
       'no text arg leaks {{{1}}}')
expect('lang_template', gates.audit_lang_template, '{{به زبان|de}}', True,
       'space form needs named params')
expect('lang_template', gates.audit_lang_template, '{{به‌زبان|de|en}}', False,
       'ZWNJ form is the real {{in lang}}')
expect('lang_template', gates.audit_lang_template, '{{به انگلیسی|Hafez}}', False,
       'lang-xx WITH its text arg')

# ---------------------------------------------------------------- parser itself
# `[^}]*` matches across NEWLINES and swallows the next template; a
# value-capture regex eats the closing braces of an inline template. Both
# shipped. The parser must be brace-aware, not regex.
print()
calls = list(gates.iter_template_calls('{{a|x={{b|y}}|z}}\n{{c|w}}'))
names = [c[2] for c in calls]
ok = names == ['a', 'b', 'c']
FAILS += 0 if ok else 1
print('%-4s %-28s nested + newline-separated calls parsed: %r'
      % ('ok' if ok else 'FAIL', 'iter_template_calls', names))

outer = [c for c in calls if c[2] == 'a'][0]
ok = outer[3] == ['x={{b|y}}', 'z']
FAILS += 0 if ok else 1
print('%-4s %-28s nested arg kept whole: %r'
      % ('ok' if ok else 'FAIL', 'iter_template_calls', outer[3]))

# top_level_only: an editing caller must not be handed a call that lives inside
# another call's argument. Excising `{{b}}` from `{{a|x={{b|y}}}}` edits a's
# argument, not the page.
top = [c[2] for c in gates.iter_template_calls('{{a|x={{b|y}}|z}}\n{{c|w}}',
                                               top_level_only=True)]
ok = top == ['a', 'c']
FAILS += 0 if ok else 1
print('%-4s %-28s top_level_only skips nested calls: %r'
      % ('ok' if ok else 'FAIL', 'iter_template_calls', top))

# ---------------------------------------------------------------- masking
# A commented-out template is display text, not a transclusion. Acting on one
# removes text the reader never sees.
print()
masked_src = 'پیش <!-- {{a|x}} --> میان {{b}} پس'
seen = [c[2] for c in gates.iter_template_calls(masked_src, mask=True)]
ok = seen == ['b']
FAILS += 0 if ok else 1
print('%-4s %-28s must stay quiet call inside <!-- --> ignored: %r'
      % ('ok' if ok else 'FAIL', 'mask_opaque', seen))

seen = [c[2] for c in gates.iter_template_calls('<nowiki>{{a}}</nowiki> {{b}}', mask=True)]
ok = seen == ['b']
FAILS += 0 if ok else 1
print('%-4s %-28s must stay quiet call inside <nowiki> ignored: %r'
      % ('ok' if ok else 'FAIL', 'mask_opaque', seen))

# The load-bearing property: masking preserves length, so a reported offset is
# still a valid offset into the ORIGINAL text. Stripping instead of masking
# yields offsets into a shortened string and splices at the wrong place.
ok = len(gates.mask_opaque(masked_src)) == len(masked_src)
FAILS += 0 if ok else 1
print('%-4s %-28s mask preserves length (offsets stay valid)'
      % ('ok' if ok else 'FAIL', 'mask_opaque'))

s, e, nm, _ = list(gates.iter_template_calls(masked_src, mask=True))[0]
ok = masked_src[s:e] == '{{b}}'
FAILS += 0 if ok else 1
print('%-4s %-28s offset slices the original text: %r'
      % ('ok' if ok else 'FAIL', 'mask_opaque', masked_src[s:e]))

# A masked region must not contaminate a captured name or argument.
got = list(gates.iter_template_calls('{{a|x<!-- ن -->y}}', mask=True))
ok = got and got[0][3] == ['x<!-- ن -->y']
FAILS += 0 if ok else 1
print('%-4s %-28s captured arg comes from the original: %r'
      % ('ok' if ok else 'FAIL', 'mask_opaque', got[0][3] if got else None))

# ---------------------------------------------------------------- whitespace
print()
for label, txt, want in [
    ('trailing blank line', 'متن\n\n', True),
    ('leading blank line', '\nمتن\n', True),
    ('three blank lines', 'الف\n\n\n\nب\n', True),
    ('normal page', 'الف\n\nب\n', False),
    ('two blank lines before a tag', 'الف\n\n\n{{خرد}}\n', False),
    # 6 of 12 random fa articles carry trailing spaces. Gating on them would
    # block half of every batch for something the edit did not cause.
    ('pre-existing trailing space', 'الف   \nب\n', False),
]:
    hits = gates.audit_whitespace_tail(txt)
    ok = bool(hits) == want
    FAILS += 0 if ok else 1
    print('%-4s %-28s %s %s' % ('ok' if ok else 'FAIL', 'whitespace_tail',
                                'must FIRE      ' if want else 'must stay quiet', label))

# ------------------------------------------------- missing_templates (network)
# Stubbed, not live: a unit test must not depend on the wiki being reachable.
# The fake knows only these template pages exist.
print()
_EXISTING = {'الگو:تغییرمسیر از نام جایگزین', 'الگو:نام علمی', 'الگو:یادکرد وب',
             'الگو:!', 'الگو:پانویس'}


def _fake_api(params):
    titles = params['titles'].split('|')
    return {'query': {'pages': [
        ({'title': t} if t in _EXISTING else {'title': t, 'missing': True})
        for t in titles]}}


def _missing(text):
    return gates.audit_missing_templates(text, _fake_api)


# The exact text that shipped to [[کلاد]] on 2026-10-03: a plausible Persian
# rendering of {{R from alternative name}} that does not exist. Red link, no
# error. The corpus already had the prose lesson; it recurred anyway.
expect('missing_templates', _missing,
       '#تغییر_مسیر [[تبارشاخه]]\n{{تغییر مسیر از نام دیگر}}\n',
       True, 'guessed rcat template name')
expect('missing_templates', _missing,
       '#تغییر_مسیر [[تبارشاخه]]\n{{تغییرمسیر از نام جایگزین}}\n',
       False, 'the correct rcat template')
# Parser functions and magic words are not template lookups.
expect('missing_templates', _missing,
       '{{#if:{{{a|}}}|x|y}} {{#switch:z|a=1}} {{PAGENAME}} {{CURRENTYEAR}}',
       False, 'parser functions and magic words')
# subst: must be stripped before the lookup, not treated as part of the name.
expect('missing_templates', _missing, '{{subst:یادکرد وب|عنوان=x}}',
       False, 'subst: prefix stripped')
# An explicit الگو: prefix is the same template.
expect('missing_templates', _missing, '{{الگو:نام علمی|Rosa}}',
       False, 'explicit الگو: prefix')
# A nested call in an argument is still a call.
expect('missing_templates', _missing,
       '{{یادکرد وب|عنوان={{الگوی جعلی}}}}', True, 'nested call is audited')
# {{:X}} transcludes an article, not a template.
expect('missing_templates', _missing, '{{:تبارشاخه}}', False,
       'article transclusion, not a template')


# ---------------------------------------------------------------- aggregator
print()
clean = ('عنوان\n\n{{یادکرد وب|عنوان=x|وبگاه=y}}\n'
         '<ref name="a">{{پک|حافظ|۱۳۷۵|ص=۱۲}}</ref>\n'
         '{{بت|1=فهرست دسرها|2=دسرها|en=List of desserts}}\n'
         'سال‌های ۱۸۵۸–۱۸۶۴\n')
p = gates.check_wikitext('غزل ۱', clean)
ok = not p
FAILS += 0 if ok else 1
print('%-4s %-28s a clean page reports 0 problems%s'
      % ('ok' if ok else 'FAIL', 'check_wikitext', '' if ok else '  <-- %r' % p))

dirty = 'متن {یادکرد} — {{پک|ص=۱}} {{بت|1=x|en=y|ز}} ~~~~'
p = gates.check_wikitext('فتّان', dirty)
ok = len(p) >= 5
FAILS += 0 if ok else 1
print('%-4s %-28s a page with 6 planted defects reports %d'
      % ('ok' if ok else 'FAIL', 'check_wikitext', len(p)))
for x in p:
    print('        - %s' % x[:96])


# --- talk-page replies ------------------------------------------------------
# Both prose fixtures are real: the first is the reply he accepted and posted,
# the second is the shape he rejected («too long, remove the headlines»).
reply_ok = (
    ':@[[کاربر:X|ایکس]] گرامی؛ سپاس. حق با شماست.\n'
    ':اول خواستم حذفش کنم. ولی روی ۲۷۶ مقاله که آزمودم، حذف کامل ۳۱ مورد را خراب '
    'می‌کرد و همه هم یادکرد انگلیسی بودند که عدد در آغازشان است.\n'
    ':پس شرط را عوض کردم. نظرتان چیست؟ با احترام ~~~~\n'
)
p = gates.check_talk_reply(reply_ok)
ok = not p
FAILS += 0 if ok else 1
print('%-4s %-28s an accepted reply reports 0 problems%s'
      % ('ok' if ok else 'FAIL', 'check_talk_reply', '' if ok else '  <-- %r' % p))

BOLD_LINE = ":'''این پترن چه کار می‌کند'''"
reply_bad = ':سلام\n\n' + BOLD_LINE + '\n\n:توضیح. ' + ('کلمه ' * 420) + '~~~~\n'
p = gates.check_talk_reply(reply_bad)
ok = any('bold-only' in x for x in p) and any('words of prose' in x for x in p)
FAILS += 0 if ok else 1
print('%-4s %-28s bold pseudo-heading + overlong prose both fire (%d)'
      % ('ok' if ok else 'FAIL', 'check_talk_reply', len(p)))

# The markup faults that actually shipped to قهوه‌خانه/فنی on 2026-10-05: `:::`
# on every line collapsed the table to one cell and printed `:::` inside the code.
reply_markup = (
    ':::<syntaxhighlight lang="javascript" dir="ltr">foo:\n'
    ':::  /bar/g,</syntaxhighlight>\n'
    ':::{| class="wikitable"\n:::! ا !! ب\n:::|-\n:::| ۱ || ۲\n:::|}\n'
    ':::باشد. ~~~~\n'
)
p = gates.check_talk_reply(reply_markup)
ok = any('table row' in x for x in p) and any('INSIDE <syntaxhighlight>' in x for x in p)
FAILS += 0 if ok else 1
print('%-4s %-28s colons on table rows and inside the code block both fire'
      % ('ok' if ok else 'FAIL', 'check_talk_reply'))

# Near miss: a CORRECTLY indented table and code block must not be flagged, or
# the next person switches the gate off.
reply_fine_markup = (
    ':<syntaxhighlight lang="javascript" dir="ltr">foo: /bar/g,\n</syntaxhighlight>\n'
    ':{| class="wikitable"\n! ا !! ب\n|-\n| ۱ || ۲\n|}\n'
    ':کوتاه. ولی این یکی بلندتر است و چند کلمهٔ دیگر هم دارد. باشد؟ ~~~~\n'
)
p = gates.check_talk_reply(reply_fine_markup)
ok = not p
FAILS += 0 if ok else 1
print('%-4s %-28s correct table/code indentation is left alone%s'
      % ('ok' if ok else 'FAIL', 'check_talk_reply', '' if ok else '  <-- %r' % p))

print()

print('FAILURES: %d' % FAILS)
sys.exit(1 if FAILS else 0)


# ------------------------------------------------- persian digits in numbers
# Measured on fa 2026-10-06: a Persian-digit image size is SILENTLY DROPPED
# and the image renders at native resolution. Shipped a 512px paw icon into
# eleven portal headings before the render was looked at.
_PD = gates.audit_persian_digit_number
expect('persian_digit_number', _PD, '[[پرونده:X.svg|۱۴پک|پیوند=]]', True,
       '«پک» is not a size alias at all; becomes the tooltip')
expect('persian_digit_number', _PD, '[[پرونده:X.svg|۱۴پیکسل]]', True,
       'persian digits with the right alias still ignored')
expect('persian_digit_number', _PD, '[[پرونده:X.svg|۱۴px]]', True,
       'last option, the usual place for a size')
expect('persian_digit_number', _PD, '[[پرونده:X.svg|14پک]]', True,
       'latin digits do not rescue «پک»')
expect('persian_digit_number', _PD,
       '[[پرونده:X.svg|بندانگشتی|۳۱۲x۳۱۲پیکسل|caption [[a]] b]]', True,
       'WxH form, with a wikilink in the caption')
expect('persian_digit_number', _PD, '[[پرونده:X.svg|14پیکسل|پیوند=]]', False,
       'latin + پیکسل is the correct form')
expect('persian_digit_number', _PD, '[[پرونده:X.svg|120پیکسل|چپ|گربه]]', False,
       'correct form with more options after it')
expect('persian_digit_number', _PD, '[[پرونده:X.svg|14x14px]]', False, 'latin WxH')
expect('persian_digit_number', _PD, '{{div col|۳}}', True,
       'pasted into the class name as column-count-۳, matches no rule')
expect('persian_digit_number', _PD, '{{div col|3}}', False, 'latin column count')
expect('persian_digit_number', _PD, '{{پک|حافظ|ص=۱۴}}', False,
       '{{پک}} is an unrelated citation template, not an image size')
expect('persian_digit_number', _PD, '[[پرونده:X.svg|بندانگشتی|متن ۱۴ سال]]',
       False, 'persian digits in a CAPTION are correct')
expect('persian_digit_number', _PD, '<nowiki>[[پرونده:X.svg|۱۴پک]]</nowiki>',
       False, 'parser-opaque region')
