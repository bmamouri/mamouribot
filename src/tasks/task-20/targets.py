#!/usr/bin/env python3
"""وظیفهٔ ۲۰ target list: pages the bot can change, from the census of one dump.

  - articles whose infobox has a value matching a row of the dictionary (template, parameter
    family, value), read from the same wikitext the bot pins;
  - navbox templates with at least one [[Persian article|English label]] item.

The bot re-reads every page and decides for itself; this file only says where to look.
Articles first, ordered by matches; then navboxes ordered by articles that call them.

    python3 targets.py --census DIR --dict FILE.wiki --canon canon.json --out targets.json
"""
import argparse, collections, csv, glob, gzip, json, re, sys

csv.field_size_limit(10**9)


def norm_value(v):
    v = re.sub(r'<!--.*?-->', '', v, flags=re.S)
    v = re.sub(r"^('{2,3})(.*)\1$", r'\2', v.strip(), flags=re.S)
    return re.sub(r'[\s\u00a0_]+', ' ', v).strip().lower()


def norm_template(t):
    t = re.sub(r'[\s_]+', ' ', t).strip()
    t = re.sub(r'^(template|الگو)\s*:\s*', '', t, flags=re.I)
    return t[:1].upper() + t[1:] if t else t


fam = lambda p: re.sub(r'\d+', '#', p.strip())

# Mirrors patterns.ts: which (template, parameter) takes which number+unit rule, and the
# shapes. The bot re-checks every value with the TypeScript rule; this only finds pages.
PATTERN_PARAMS = {'جعبه اطلاعات دارو': {'elimination_half-life': 'time', 'duration_of_action': 'time',
                                       'onset': 'time', 'molecular_weight': 'molar'}}
_NUM = r'\d+(?:\.\d+)?'
_TIME = re.compile(r'^(~|≈|<|>|≤|≥)?\s*' + _NUM + r'(?:\s*(–|-|—|to)\s*' + _NUM + r')?\s*'
                   r'(seconds|second|sec|s|minutes|minute|mins|min|hours|hour|hrs|hr|h|days|day|d|weeks|week|wk|'
                   r'months|month|years|year|yr)\.?$', re.I)
_MOLAR = re.compile(r'^' + _NUM + r'\s*(?:g\s*/\s*mol(?:e)?|g\s*[·.]?\s*mol\s*[−-]\s*1)$', re.I)


def pattern_hit(template, param, value):
    rule = PATTERN_PARAMS.get(template, {}).get(param.strip())
    v = value.strip()
    return bool(rule) and bool((_TIME if rule == 'time' else _MOLAR).match(v))


def dictionary(path):
    body = re.search(r'\{\|.*?\n\|\}', open(path, encoding='utf-8').read(), re.S).group(0)
    keys = set()
    for row in re.split(r'\n\|-[^\n]*', body)[1:]:
        row = re.sub(r'\n\|\}\s*$', '', row).strip()
        if not row.startswith('|'):
            continue
        cells = [c.strip() for c in re.split(r'\s*\|\|\s*|\n\|\s*', row[1:])]
        if len(cells) == 5:
            keys.add((norm_template(cells[0]), fam(cells[1]), norm_value(cells[2])))
    return keys


def main(a):
    keys = dictionary(a.dict)
    canon = json.load(open(a.canon))
    C = lambda t: norm_template(canon.get(t) or t)
    hits = collections.Counter()
    for p in sorted(glob.glob(f'{a.census}/rows-*.tsv.gz')):
        for line in gzip.open(p, 'rt', encoding='utf-8'):
            title, t, k, flags, vis, raw = line.rstrip('\n').split('\t')
            if 'T' in flags or 'L' in flags:
                continue
            if (C(t), fam(k), norm_value(vis)) in keys or pattern_hit(C(t), k, vis):
                hits[title] += 1
    navs = {}
    for r in csv.DictReader(open(f'{a.census}/navboxes.tsv'), delimiter='\t', quoting=csv.QUOTE_NONE):
        if int(r['fa_link_en']) > 0:
            navs['الگو:' + r['navbox']] = int(r['articles_calling'])
    out = [t for t, _ in hits.most_common()] + sorted(navs, key=lambda t: -navs[t])
    json.dump(out, open(a.out, 'w'), ensure_ascii=False)
    print(f'{len(keys)} dictionary keys; {len(hits)} articles ({sum(hits.values())} values); '
          f'{len(navs)} navboxes; {len(out)} targets')


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--census', required=True)
    ap.add_argument('--dict', required=True)
    ap.add_argument('--canon', required=True)
    ap.add_argument('--out', required=True)
    main(ap.parse_args())
