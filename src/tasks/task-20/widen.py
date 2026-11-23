#!/usr/bin/env python3
"""وظیفهٔ ۲۰: classify EVERY English infobox value in the census, not just the head.

The first dictionary came from the top 400 parameters with strict thresholds and left
English links out. This pass takes all census rows and asks, for each one, which route
could make it Persian with evidence, and how many articles that route reaches:

    control     a value the template reads as a setting (colour, size, yes/no, map key)
    link_fa     [[English target|…]] whose target has an fa article (direct sitelink)
    link_none   [[English target|…]] with no fa article
    label_rule  [[Persian article|English label]], label = the article's exact en title
    label_other [[Persian article|English label]], anything else
    name_exact  plain text equal to the exact en title of an article that has an fa
                article that is not a disambiguation page (a candidate, never automatic)
    vocab       plain text repeated >= VOCAB_MIN times under the same template+parameter
    tail        everything else (one-off names, phrases)

Standard library only (Toolforge python3.13). Reads the census of one dump and that dump's
langlinks, page and page_props tables.

    python3 widen.py --census DIR --fa-dump DIR --out DIR [--canon canon.json]
"""
import argparse, collections, csv, glob, gzip, json, os, re, sys

VOCAB_MIN = 5
TUPLE_LL = re.compile(r"\((\d+),'en','((?:[^'\\]|\\.)*)'\)")
TUPLE_PAGE = re.compile(r"\((\d+),0,'((?:[^'\\]|\\.)*)',([01]),")
TUPLE_PP = re.compile(r"\((\d+),'disambiguation',")
LINK = re.compile(r'\[\[([^\[\]|]+)(?:\|([^\[\]]*))?\]\]')
NOT_ARTICLE = re.compile(r'^\s*:?\s*(file|image|پرونده|تصویر|رده|category|template|الگو|wikipedia|ویکی‌پدیا|help|راهنما|[a-z]{2,3}(-[a-z]+)?)\s*:', re.I)
PERSIAN = re.compile(r'[\u0600-\u06FF]')
LATIN2 = re.compile(r'[A-Za-z]{2,}')
CONTROL_PARAM = re.compile(
    r'(unit_pref|pushpin|density|colou?r|^bg|style|^show|^status|status_system|background|_lang$|^lang$|'
    r'coordinates|coord|mapsize|map_?type|^map$|^image|logo|flag|seal|size|^border$|parts_style|display|format|'
    r'embed|module|nocat|translit_lang|website|url|iata|icao|smiles|cas|inchi|chembl|pubchem|drugbank|unii|kegg|'
    r'chebi|atc|_code$|^code|postcode_|grid|_ref$|^ref|footnote|^id$|_id$|isbn|issn|oclc|doi|^stat|class$|'
    r'^type$|caption_align|alt$|label_position|mark|marker|relief|^nickname_lang|^data\d|^rank$|mapframe|zoom|'
    r'^iso|^fips|^gnis|area_code$|^blank\d*_info|^bodystyle|width|height_ref|^child$|^embedded$|^collapsible$)', re.I)
CONTROL_VALUE = re.compile(r'^(#?[0-9a-f]{3,8}|\d+\s*(px|em|%)|yes|no|y|n|true|false|auto|none|on|off|left|right|'
                           r'center|centre|top|bottom|above|below|hide|show|collapsed|plain|inline|title|dms|dec|imperial|'
                           r'metric|us|uk|frameless|upright|thumb|nan|-)$', re.I)


def unsql(s):
    return re.sub(r'\\(.)', r'\1', s)


def norm_title(t):
    t = t.replace('_', ' ').strip()
    t = re.sub(r'\s+', ' ', t).split('#')[0].strip()
    return t[:1].upper() + t[1:] if t else t


def load_sql(path, rx, keep):
    out = 0
    with gzip.open(path, 'rt', encoding='utf-8', errors='replace') as f:
        for line in f:
            if 'INSERT' not in line[:20] and not line.startswith('('):
                continue
            for m in rx.finditer(line):
                keep(m); out += 1
    return out


def main(a):
    os.makedirs(a.out, exist_ok=True)
    fa = a.fa_dump
    # fa page id -> en title; en title -> fa page id
    id_en, en_id = {}, {}
    def ll(m):
        en = norm_title(unsql(m.group(2)))
        pid = int(m.group(1))
        id_en[pid] = en; en_id.setdefault(en, pid)
    load_sql(glob.glob(f'{fa}/*-langlinks.sql.gz')[0], TUPLE_LL, ll)
    print(f'{len(id_en)} fa→en sitelinks', flush=True)
    # ns0 pages: title -> (id, is_redirect)
    title_id, id_title, redirect = {}, {}, set()
    def pg(m):
        pid, t, r = int(m.group(1)), unsql(m.group(2)).replace('_', ' '), m.group(3) == '1'
        title_id[t] = pid; id_title[pid] = t
        if r: redirect.add(pid)
    load_sql(glob.glob(f'{fa}/*-page.sql.gz')[0], TUPLE_PAGE, pg)
    dab = set()
    load_sql(glob.glob(f'{fa}/*-page_props.sql.gz')[0], TUPLE_PP, lambda m: dab.add(int(m.group(1))))
    print(f'{len(title_id)} ns0 pages, {len(redirect)} redirects, {len(dab)} disambiguation', flush=True)
    canon = json.load(open(a.canon)) if a.canon and os.path.exists(a.canon) else {}
    C = lambda t: canon.get(t) or t
    fam = lambda p: re.sub(r'\d+', '#', p)

    def fa_of_en(en):
        pid = en_id.get(norm_title(en))
        if pid is None or pid in redirect or pid in dab:
            return None
        return id_title.get(pid)

    # pass 1: value frequency per (template, family) for the vocab class
    freq = collections.Counter()
    rows_files = sorted(glob.glob(f'{a.census}/rows-*.tsv.gz'))
    for p in rows_files:
        for line in gzip.open(p, 'rt', encoding='utf-8'):
            title, t, k, flags, vis, raw = line.rstrip('\n').split('\t')
            freq[(C(t), fam(k), vis.strip().lower())] += 1

    cls = collections.Counter()
    by_tpl = collections.defaultdict(collections.Counter)
    link_fa = collections.Counter()        # (en target) -> occurrences
    link_fa_fa = {}
    link_none = collections.Counter()
    label_rule = collections.Counter()      # (fa target, label)
    name_exact = collections.defaultdict(collections.Counter)  # (t, fam) -> value counts
    name_exact_fa = {}
    vocab = collections.Counter()
    articles = collections.defaultdict(set)  # class -> articles
    for p in rows_files:
        for line in gzip.open(p, 'rt', encoding='utf-8'):
            title, t, k, flags, vis, raw = line.rstrip('\n').split('\t')
            t, f = C(t), fam(k)
            v = vis.strip()
            if CONTROL_PARAM.search(k) or CONTROL_VALUE.match(v):
                c = 'control'
            else:
                links = [(norm_title(x), y) for x, y in LINK.findall(raw) if not NOT_ARTICLE.match(x)]
                en_links = [(x, y) for x, y in links if not PERSIAN.search(x) and LATIN2.search(x)]
                fa_en_label = [(x, y) for x, y in links if PERSIAN.search(x) and y and not PERSIAN.search(y) and LATIN2.search(y)]
                if en_links:
                    hit = [(x, fa_of_en(x)) for x, _ in en_links]
                    if any(h for _, h in hit):
                        c = 'link_fa'
                        for x, h in hit:
                            if h: link_fa[x] += 1; link_fa_fa[x] = h
                    else:
                        c = 'link_none'
                        for x, _ in en_links: link_none[x] += 1
                elif fa_en_label:
                    ok = False
                    for x, y in fa_en_label:
                        pid = title_id.get(x)
                        if pid is not None and pid not in redirect and pid not in dab and id_en.get(pid) == y.strip():
                            ok = True; label_rule[(x, y.strip())] += 1
                    c = 'label_rule' if ok else 'label_other'
                elif not links and fa_of_en(v) and len(v) <= 80:
                    c = 'name_exact'
                    name_exact[(t, f)][v] += 1; name_exact_fa[v] = fa_of_en(v)
                elif not links and freq[(t, f, v.lower())] >= VOCAB_MIN:
                    c = 'vocab'; vocab[(t, f, v.lower())] += 1
                else:
                    c = 'tail'
            cls[c] += 1
            by_tpl[t][c] += 1
            articles[c].add(title)

    total = sum(cls.values())
    summary = {'rows': total, 'by_class': {c: [n, round(n / total * 100, 1), len(articles[c])] for c, n in cls.most_common()}}
    json.dump(summary, open(f'{a.out}/widen-summary.json', 'w'), ensure_ascii=False, indent=1)
    print(json.dumps(summary, ensure_ascii=False, indent=1), flush=True)

    with open(f'{a.out}/widen-templates.tsv', 'w') as fo:
        keys = ['control', 'link_fa', 'link_none', 'label_rule', 'label_other', 'name_exact', 'vocab', 'tail']
        fo.write('template\ttotal\t' + '\t'.join(keys) + '\n')
        for t, c in sorted(by_tpl.items(), key=lambda kv: -sum(kv[1].values())):
            fo.write(f"{t}\t{sum(c.values())}\t" + '\t'.join(str(c[k]) for k in keys) + '\n')
    with open(f'{a.out}/widen-vocab.tsv', 'w') as fo:
        fo.write('count\ttemplate\tfamily\tvalue\n')
        for (t, f, v), n in vocab.most_common():
            fo.write(f'{n}\t{t}\t{f}\t{v}\n')
    with open(f'{a.out}/widen-link-fa.tsv', 'w') as fo:
        fo.write('count\ten_target\tfa_title\n')
        for x, n in link_fa.most_common():
            fo.write(f'{n}\t{x}\t{link_fa_fa[x]}\n')
    with open(f'{a.out}/widen-label-rule.tsv', 'w') as fo:
        fo.write('count\tfa_target\tlabel\n')
        for (x, y), n in label_rule.most_common():
            fo.write(f'{n}\t{x}\t{y}\n')
    with open(f'{a.out}/widen-name-exact.tsv', 'w') as fo:
        fo.write('count\ttemplate\tfamily\tvalue\tfa_title\n')
        rows = [(n, t, f, v) for (t, f), c in name_exact.items() for v, n in c.items()]
        for n, t, f, v in sorted(rows, reverse=True):
            fo.write(f'{n}\t{t}\t{f}\t{v}\t{name_exact_fa[v]}\n')
    print('done', flush=True)


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--census', required=True)
    ap.add_argument('--fa-dump', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--canon')
    main(ap.parse_args())
