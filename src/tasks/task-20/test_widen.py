#!/usr/bin/env python3
"""Offline test of widen.py: every class on a synthetic census, langlinks, page, page_props."""
import gzip, json, os, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
fails = []

ROWS = [
    # title, template, param, flags, visible, raw
    ('a', 'Infobox x', 'bgcolour', '', '#ffffc0', '#ffffc0'),                    # control (param)
    ('a', 'Infobox x', 'note', '', 'yes', 'yes'),                                 # control (value)
    ('b', 'Infobox x', 'birth_place', 'L', 'Tehran', '[[Tehran]]'),              # link_fa
    ('c', 'Infobox x', 'birth_place', 'L', 'Nowhere', '[[Nowhere Town]]'),       # link_none
    ('d', 'Infobox x', 'known_for', 'L', 'Ethernet', '[[اترنت|Ethernet]]'),      # label_rule
    ('e', 'Infobox x', 'known_for', 'L', 'Corbyn', '[[جرمی کوربین|Corbyn]]'),    # label_other
    ('f', 'Infobox x', 'spouse', '', 'Tehran', 'Tehran'),                         # name_exact
    ('g', 'Infobox x', 'spouse', '', 'Mercury', 'Mercury'),                       # dab → not name_exact
    ('h', 'Infobox x', 'spouse', '', 'Old Name', 'Old Name'),                     # redirect → not name_exact
] + [(f'v{i}', 'Infobox x', 'genre', '', 'Pop rock', 'Pop rock') for i in range(5)] + [
    ('t', 'Infobox x', 'genre', '', 'Some rare phrase', 'Some rare phrase'),      # tail
]
WANT = {'control': 2, 'link_fa': 1, 'link_none': 1, 'label_rule': 1, 'label_other': 1,
        'name_exact': 1, 'vocab': 5, 'tail': 3}

with tempfile.TemporaryDirectory() as T:
    os.makedirs(f'{T}/census'); os.makedirs(f'{T}/fa'); os.makedirs(f'{T}/out')
    with gzip.open(f'{T}/census/rows-0.tsv.gz', 'wt') as f:
        for r in ROWS:
            f.write('\t'.join(r) + '\n')
    # fa pages: 1 تهران, 2 اترنت, 3 جرمی کوربین, 4 مرکوری (dab), 5 نام کهنه (redirect)
    with gzip.open(f'{T}/fa/x-page.sql.gz', 'wt') as f:
        f.write("INSERT INTO `page` VALUES\n")
        for pid, t, r in [(1, 'تهران', 0), (2, 'اترنت', 0), (3, 'جرمی_کوربین', 0), (4, 'مرکوری', 0), (5, 'نام_کهنه', 1)]:
            f.write(f"({pid},0,'{t}',{r},0,0.5,'20261102174018','20261102174022',1,1,'wikitext',NULL),\n")
    with gzip.open(f'{T}/fa/x-langlinks.sql.gz', 'wt') as f:
        f.write("INSERT INTO `langlinks` VALUES (1,'en','Tehran'),(2,'en','Ethernet'),(3,'en','Jeremy Corbyn'),"
                "(4,'en','Mercury'),(5,'en','Old Name'),(1,'de','Teheran');\n")
    with gzip.open(f'{T}/fa/x-page_props.sql.gz', 'wt') as f:
        f.write("INSERT INTO `page_props` VALUES\n(4,'disambiguation','',NULL),\n")
    subprocess.run([sys.executable, f'{HERE}/widen.py', '--census', f'{T}/census', '--fa-dump', f'{T}/fa',
                    '--out', f'{T}/out'], check=True, capture_output=True)
    s = json.load(open(f'{T}/out/widen-summary.json'))
    got = {k: v[0] for k, v in s['by_class'].items()}
    if got != WANT:
        fails.append(f'classes: got {got}, want {WANT}')

if fails:
    print('\n'.join(fails)); sys.exit(1)
print('widen: ok')
