#!/usr/bin/env python3
"""Offline tests for navbox_census.py: item splitting and classification."""
import os, sys
sys.path.insert(0, os.path.dirname(__file__))
from navbox_census import items_of, classify, unwrap

fails = []


def check(name, got, want):
    if got != want:
        fails.append(f'{name}: got {got!r}, want {want!r}')


def classes(value):
    return [c for c in (classify(i)[0] for i in items_of(value)) if c]


check('bullets', items_of('\n* [[الف]]\n* [[ب|پ]]\n'), ['[[الف]]', '[[ب|پ]]'])
check('middot', items_of('[[الف]] · [[ب]] • [[ج]]'), ['[[الف]]', '[[ب]]', '[[ج]]'])
check('hlist', items_of('{{فهرست افقی|[[الف]]|[[ب]]}}'), ['[[الف]]', '[[ب]]'])
check('Hlist redirect', items_of('{{Hlist|[[A]]|[[B]]|class=x}}'), ['[[A]]', '[[B]]'])
check('sep template', items_of('[[الف]]{{·}}[[ب]]'), ['[[الف]]', '[[ب]]'])
# the four visible classes
check('en_link', classes('* [[Big Stone Beach, Delaware|Big Stone Beach]]'), ['en_link'])
check('en_link bare', classes('* [[Antelope Valley]]'), ['en_link'])
check('fa_link_en', classes('* [[ایالات متحده آمریکا|United States]]'), ['fa_link_en'])
check('en_text', classes('* Kosikhinsky District'), ['en_text'])
check('en_target', classes('* [[Big Stone Beach, Delaware|بیگ استون بیچ]]'), ['en_target'])
check('fa', classes('* [[تهران]]'), ['fa'])
# interwiki to en with a Persian label reads Persian and is not an English target
check('interwiki', classes('* [[:en:Foo|فو]]'), ['fa'])
# a nested child navbox is not counted inside the parent's list
check('child', items_of('{{Navbox|child|list1=* [[Foo]]}}'), [])
# files are not items with English
check('file', classes('* [[پرونده:Flag of X.svg|20px]] [[ایران]]'), ['fa'])
# {{بت}}-style helper with Persian label: template dropped, nothing visible to classify
check('helper', classes('* {{پیوند با میان‌ویکی|فو|Foo}}'), [])
# single-letter abbreviations are not English text
check('letter', classes('* الف · ب · C'), ['fa', 'fa', 'fa'])
check('unwrap nested', unwrap('{{Flatlist|\n* {{Nowrap|[[A]]}}\n}}').split(), ['*', '[[A]]'])

check('multiline parser fn', classes('* [[الف]]\n* {{#if:{{{x|}}}|\nFoo bar\n|}}'), ['fa'])
check('file caption link', classes('* [[پرونده:A.svg|12px|link=[[Foo]]]] [[ب]]'), ['fa'])
from navbox_census import SKIP_SUBPAGE
check('testcases fa', bool(SKIP_SUBPAGE.search('ناوبری/موردهای‌آزمون')), True)

if fails:
    print('\n'.join(fails))
    sys.exit(1)
print('navbox census: ok')
