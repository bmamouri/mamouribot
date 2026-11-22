#!/usr/bin/env python3
"""End-to-end test of attested.py on a synthetic fa dump, en dump and langlinks table.

What it pins: a pair is counted only when the fa value is Persian and the en article (by
sitelink) has the same parameter in English; case and comments do not split a key; an fa
article whose value is still English contributes nothing; agreement is reported, not
resolved.
"""
import bz2, csv, gzip, html, os, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
fails = []


def dump(d, prefix, pages):
    xml = ''.join(f'<page><title>{html.escape(t)}</title><ns>0</ns><id>{i}</id><revision>'
                  f'<text xml:space="preserve">{html.escape(x)}</text></revision></page>' for i, t, x in pages)
    open(f'{d}/{prefix}-pages-articles-multistream.xml.bz2', 'wb').write(bz2.compress(xml.encode()))
    open(f'{d}/{prefix}-pages-articles-multistream-index.txt.bz2', 'wb').write(bz2.compress(b'0:1:x'))


with tempfile.TemporaryDirectory() as T:
    for d in ('fa', 'en', 'census', 'out'):
        os.makedirs(f'{T}/{d}')
    dump(f'{T}/fa', 'fawiki-x', [
        (1, 'الف', '{{Infobox ecoregion|conservation=بحرانی/در معرض خطر|elevation=sea level}}'),
        (2, 'ب', '{{Infobox ecoregion|conservation=بحرانی/در معرض خطر}}'),
        (3, 'پ', '{{Infobox ecoregion|conservation=آسیب‌پذیر}}'),
        (4, 'ت', '{{Infobox ecoregion|conservation=در معرض خطر}}'),
        (5, 'ث', '{{Infobox ecoregion|conservation=Vulnerable}}'),
        (6, 'ج', '{{Infobox ecoregion|conservation=آسیب‌پذیر}}'),     # no sitelink
    ])
    dump(f'{T}/en', 'enwiki-x', [
        (1, 'A', '{{Infobox ecoregion|conservation=Critical/endangered}}'),
        (2, 'B', '{{Infobox ecoregion|conservation=Critical/Endangered <!-- x -->}}'),
        (3, 'C', '{{Infobox ecoregion|conservation=Vulnerable}}'),
        (4, 'D', '{{Infobox ecoregion|conservation=Vulnerable}}'),
        (5, 'E', '{{Infobox ecoregion|conservation=Vulnerable}}'),
    ])
    with gzip.open(f'{T}/fa/fawiki-x-langlinks.sql.gz', 'wt') as f:
        f.write("INSERT INTO `langlinks` VALUES (1,'en','A'),(2,'en','B'),(3,'en','C'),(4,'en','D'),"
                "(5,'en','E'),(1,'de','Q');\n")
    open(f'{T}/census/params.tsv', 'w').write(
        'template\tparam\tfilled\tlatin\tlatin_with_link\tdistinct\tsingletons\tshare_in_values_seen_5plus\ttop_values\n'
        'Infobox ecoregion\tconservation\t99\t99\t0\t3\t0\t1\tx\n')
    with gzip.open(f'{T}/census/values.tsv.gz', 'wt') as f:
        f.write('count\ttemplate\tparam\tvalue\texamples\n49\tInfobox ecoregion\tconservation\tcritical/endangered\tx\n')
    run = lambda *a: subprocess.run([sys.executable, f'{HERE}/attested.py', *a], check=True, capture_output=True)
    run('fa', '--fa-dump', f'{T}/fa', '--census', f'{T}/census', '--out', f'{T}/out', '--workers', '1')
    run('en', '--en-dump', f'{T}/en', '--out', f'{T}/out', '--workers', '1')
    run('join', '--census', f'{T}/census', '--out', f'{T}/out')
    rows = {r['en_value']: r for r in csv.DictReader(open(f'{T}/out/candidates.tsv'), delimiter='\t')}

if set(rows) != {'critical/endangered', 'vulnerable'}:
    fails.append(f'keys: {sorted(rows)}')
else:
    c = rows['critical/endangered']
    if (c['fa_value'], c['attested'], c['share'], c['still_english']) != ('بحرانی/در معرض خطر', '2', '1.00', '49'):
        fails.append(f'critical: {c}')
    v = rows['vulnerable']
    if (v['attested'], v['share']) != ('2', '0.50'):     # ث is still English, ج has no sitelink
        fails.append(f'vulnerable: {v}')

if fails:
    print('\n'.join(fails)); sys.exit(1)
print('attested: ok')
