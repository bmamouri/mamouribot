#!/usr/bin/env python3
"""Articles whose infobox has an English link to a subject that has an fa article.

Feeds وظیفهٔ ۱۲ (linkfix), which is approved for exactly these links but finds its pages
by sampling a CirrusSearch query. Reads the task-20 census rows and the dump's langlinks,
page and page_props tables; writes one title per line, the articles with the most such
links first, so a capped run fixes the most per edit.

    python3 link_targets.py --census DIR --fa-dump DIR --out FILE
"""
import argparse, collections, glob, gzip, json, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from widen import (TUPLE_LL, TUPLE_PAGE, TUPLE_PP, LINK, NOT_ARTICLE, PERSIAN, LATIN2,
                   unsql, norm_title, load_sql)


def main(a):
    fa = a.fa_dump
    en_id, redirect, dab, id_title = {}, set(), set(), {}

    def ll(m):
        en_id.setdefault(norm_title(unsql(m.group(2))), int(m.group(1)))
    load_sql(glob.glob(f'{fa}/*-langlinks.sql.gz')[0], TUPLE_LL, ll)

    def pg(m):
        pid = int(m.group(1))
        id_title[pid] = unsql(m.group(2)).replace('_', ' ')
        if m.group(3) == '1':
            redirect.add(pid)
    load_sql(glob.glob(f'{fa}/*-page.sql.gz')[0], TUPLE_PAGE, pg)
    load_sql(glob.glob(f'{fa}/*-page_props.sql.gz')[0], TUPLE_PP, lambda m: dab.add(int(m.group(1))))

    def fixable(en):
        pid = en_id.get(norm_title(en))
        return pid is not None and pid not in redirect and pid not in dab and pid in id_title

    per = collections.Counter()
    for p in sorted(glob.glob(f'{a.census}/rows-*.tsv.gz')):
        for line in gzip.open(p, 'rt', encoding='utf-8'):
            title, t, k, flags, vis, raw = line.rstrip('\n').split('\t')
            if 'L' not in flags:
                continue
            for target, _ in LINK.findall(raw):
                if NOT_ARTICLE.match(target) or PERSIAN.search(target) or not LATIN2.search(target):
                    continue
                if fixable(target):
                    per[title] += 1
    titles = [t for t, _ in per.most_common()]
    with open(a.out, 'w', encoding='utf-8') as f:
        f.write('\n'.join(titles) + '\n')
    json.dump({'articles': len(titles), 'links': sum(per.values()),
               'top10': per.most_common(10)}, open(a.out + '.json', 'w'), ensure_ascii=False, indent=1)
    print(len(titles), 'articles', sum(per.values()), 'links', flush=True)


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--census', required=True)
    ap.add_argument('--fa-dump', required=True)
    ap.add_argument('--out', required=True)
    main(ap.parse_args())
