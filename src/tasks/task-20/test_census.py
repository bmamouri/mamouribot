#!/usr/bin/env python3
"""Offline tests for census.py: what must be counted as English, and what must not."""
import os, sys
sys.path.insert(0, os.path.dirname(__file__))
from census import infobox_rows, visible, mask, template_spans, split_top

fails = []


def rows(text):
    return [r for r in infobox_rows('T', text) if r[0] != '__box__']


def latin(text):
    return {(r[1], r[3]) for r in rows(text) if r[2].startswith('latin')}


def check(name, got, want):
    if got != want:
        fails.append(f'{name}: got {got!r}, want {want!r}')


# the two articles from the request
eco = '''{{Infobox ecoregion
|name=مانگروهای گینه
|image=File:Saloum.gif
|caption=مانگروها در [[دلتای سالوم]]، سنگال
|map=File:AT1403 map.png
|biome=[[مانگرو]]
|border2=[[پاره‌چین ساوانا–جنگلی گینه]],
|area=۲۲٬۱۶۵
|conservation=Vulnerable
|protected=5,289 km² (۲۴
|protected_ref=)
|elevation=sea level
}}'''
check('ecoregion', latin(eco), {('conservation', 'Vulnerable'), ('protected', '5,289 km² (۲۴'), ('elevation', 'sea level')})

# files, image names without a prefix, URLs and empty values are not English text
check('files', latin('{{Infobox x|image=Saloum.gif|map=[[File:A b.png|200px]]|website=https://example.org|url=[https://a.org]|x=}}'), set())
check('sizes', latin('{{Infobox x|image_size=155px|flag_size=100x67px|s=۲۰۰px|caption=Town centre}}'), {('caption', 'Town centre')})
# a Persian label on an English link target is what the reader sees: not English
check('persian label', latin('{{Infobox x|clubs1=[[Fulham L.F.C.|فولام]]}}'), set())
# an English link with an English label is English, and flagged as a link
r = [x for x in rows('{{Infobox x|clubs1=[[Fulham L.F.C.|Fulham]]}}') if x[1] == 'clubs1']
check('english link', (r[0][2], r[0][3]), ('latin:L', 'Fulham'))
# an English link with no label shows its target
check('bare link', latin('{{Infobox x|discipline=[[BMX racing]]}}'), {('discipline', 'BMX racing')})
# English inside a ref or a comment is not visible
check('ref', latin('{{Infobox x|pop=۱۲۳<ref>{{cite web|title=Census}}</ref>|a=۱<!-- English note -->}}'), set())
# a pipe inside a ref must not split the infobox
check('ref pipe', latin('{{Infobox x|pop=۱۲<ref name=a>a|b</ref>|type=Village}}'), {('type', 'Village')})
# nested templates are dropped from the visible text, but flagged
r = [x for x in rows('{{Infobox x|country={{پرچم|BRA}} Brazil}}') if x[1] == 'country']
check('nested', (r[0][2], r[0][3]), ('latin:T', 'Brazil'))
check('only template', latin('{{Infobox x|country={{BRA}}}}'), set())
# a {{{param}}} placeholder does not open a template
check('triple', latin('{{Infobox x|name={{{name|Foo}}}|type=Town}}'), {('type', 'Town'), ('name', 'Foo')})
# non-infobox templates are ignored, and nested infoboxes (embedded) are found
check('not infobox', latin('{{Navbox|title=Foo bar}}{{Cite web|title=English}}'), set())
check('embedded', latin('{{Infobox person|name=علی|module={{Infobox sportsperson|sport=Football}}}}'), {('sport', 'Football')})
# Persian infobox names count too
check('persian name', latin('{{جعبه اطلاعات شهر|نوع=Village}}'), {('نوع', 'Village')})
# a single Latin letter (a grade, an axis) is not English
check('single letter', latin('{{Infobox x|grade=A|class=B۲}}'), set())
# bold/italic markup does not hide text
check('italic', latin("{{Infobox x|caption=''Torii'' gate}}"), {('caption', 'Torii gate')})
# helpers
check('spans', template_spans('a{{b|{{c}}}}'), [(5, 10), (1, 12)])
check('split', split_top('a|[[b|c]]|{{d|e}}|f'), ['a', '[[b|c]]', '{{d|e}}', 'f'])
check('mask comment', mask('a<!--x|y-->b'), 'ab')
check('visible', visible("[[A|B]] [[C]] [[File:x.png|y]]")[0], 'B C')

if fails:
    print('\n'.join(fails))
    sys.exit(1)
print('census: ok')
