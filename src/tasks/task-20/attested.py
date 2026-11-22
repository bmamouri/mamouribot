#!/usr/bin/env python3
"""وظیفهٔ ۲۰: dictionary candidates from translations fa editors already made.

For every fa article with an en sitelink, pair each infobox parameter whose fa value is
Persian with the same parameter in the en article's infobox. Counting (fa template,
parameter, en value) → fa value over the whole wiki gives the Persian that editors chose
for each English value, and how often they agree. That count is the evidence a dictionary
entry is proposed from; nothing here invents a translation.

Standard library only (Toolforge python3.13 image).

    python3 attested.py fa   --fa-dump DIR --census DIR --out DIR
    python3 attested.py en   --en-dump DIR --out DIR
    python3 attested.py join --census DIR --out DIR

Disk: rows are bucketed by en title so the join never holds more than 1/64 in memory.
"""
import argparse, bz2, collections, csv, glob, gzip, html, json, multiprocessing as mp, os, re, sys, time, zlib
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from census import (mask, template_spans, split_top, norm_name, visible, stream_offsets, tsv,
                    INFOBOX_NAME, LATIN, FILE_VALUE, SIZE_VALUE, REF_SENTINEL)

BUCKETS = 64
MIN_LATIN = 20       # a census key with fewer English rows than this is not worth a dictionary entry
PAGE = re.compile(r'<page>(.*?)</page>', re.S)
TITLE = re.compile(r'<title>(.*?)</title>')
NS = re.compile(r'<ns>(\d+)</ns>')
ID = re.compile(r'<id>(\d+)</id>')
TEXT = re.compile(r'<text\b[^>]*?(?:/>|>(.*?)</text>)', re.S)
TUPLE = re.compile(r"\((\d+),'((?:[^'\\]|\\.)*)','((?:[^'\\]|\\.)*)'\)")


def unsql(s):
    return re.sub(r'\\(.)', r'\1', s)


def bucket(en_title):
    return zlib.crc32(en_title.encode()) % BUCKETS


def norm_value(v):
    return re.sub(r'\s+', ' ', v).strip().lower()


def infobox_params(text):
    """(template, param, visible, raw) for every filled infobox parameter; raw is the
    wikitext with comments removed and refs replaced by the sentinel."""
    t = mask(text)
    for s, e in template_spans(t):
        parts = split_top(t[s + 2:e - 2])
        name = norm_name(parts[0])
        if not INFOBOX_NAME.match(name):
            continue
        pos = 0
        for part in parts[1:]:
            if '=' in part:
                k, _, v = part.partition('=')
                k = k.strip()
            else:
                pos += 1
                k, v = str(pos), part
            raw = v.strip()
            if not raw:
                continue
            vis, _ = visible(raw)
            if not vis or FILE_VALUE.match(vis) or SIZE_VALUE.match(vis):
                continue
            yield name, k, vis, raw


def langlinks(fa_dump_dir):
    path = glob.glob(f'{fa_dump_dir}/*-langlinks.sql.gz')[0]
    out = {}
    with gzip.open(path, 'rt', encoding='utf-8', errors='replace') as f:
        for line in f:
            if not line.startswith('INSERT') and not line.startswith('('):
                continue
            for m in TUPLE.finditer(line):
                if m.group(2) == 'en':
                    out[int(m.group(1))] = unsql(m.group(3)).replace('_', ' ')
    return out


def census_keys(census_dir):
    csv.field_size_limit(10**9)
    keys = set()
    for r in csv.DictReader(open(f'{census_dir}/params.tsv'), delimiter='\t', quoting=csv.QUOTE_NONE):
        if int(r['latin']) >= MIN_LATIN:
            keys.add((r['template'], r['param']))
    return keys


def partition(ranges, n):
    total = sum(e - s for s, e in ranges)
    chunks, cur, acc, per = [], [], 0, total / n
    for r in ranges:
        cur.append(r); acc += r[1] - r[0]
        if acc >= per and len(chunks) < n - 1:
            chunks.append(cur); cur, acc = [], 0
    chunks.append(cur)
    return chunks


G = {}   # filled before the pool forks, shared copy-on-write


def fa_worker(args):
    wid, dump, ranges, out = args
    ll, keys = G['ll'], G['keys']
    files = [gzip.open(f'{out}/fa-{b:02d}-{wid}.tsv.gz', 'wt', encoding='utf-8') for b in range(BUCKETS)]
    st = collections.Counter()
    with open(dump, 'rb') as f:
        for start, end in ranges:
            f.seek(start)
            try:
                xml = bz2.decompress(f.read(end - start)).decode('utf-8')
            except Exception:
                st['bad_stream'] += 1; continue
            for m in PAGE.finditer(xml):
                p = m.group(1)
                if NS.search(p).group(1) != '0' or '<redirect' in p:
                    continue
                en = ll.get(int(ID.search(p).group(1)))
                if not en:
                    continue
                t = TEXT.search(p)
                text = html.unescape(t.group(1) or '') if t else ''
                st['fa_pages_with_en'] += 1
                for name, k, vis, raw in infobox_params(text):
                    if (name, k) not in keys:
                        continue
                    lat = '1' if LATIN.search(vis) else '0'
                    files[bucket(en)].write('\t'.join((tsv(en), tsv(name), tsv(k), lat, tsv(vis[:150]),
                                                       tsv(raw.replace(REF_SENTINEL, '')[:300]))) + '\n')
                    st['fa_rows'] += 1
    for f in files: f.close()
    return wid, dict(st)


def en_worker(args):
    wid, dump, ranges, out = args
    wanted, params = G['wanted'], G['params']
    files = [gzip.open(f'{out}/en-{b:02d}-{wid}.tsv.gz', 'wt', encoding='utf-8') for b in range(BUCKETS)]
    st = collections.Counter()
    with open(dump, 'rb') as f:
        for start, end in ranges:
            f.seek(start)
            try:
                xml = bz2.decompress(f.read(end - start)).decode('utf-8')
            except Exception:
                st['bad_stream'] += 1; continue
            for m in PAGE.finditer(xml):
                p = m.group(1)
                title = html.unescape(TITLE.search(p).group(1))
                if title not in wanted:
                    continue
                if NS.search(p).group(1) != '0' or '<redirect' in p:
                    continue
                t = TEXT.search(p)
                text = html.unescape(t.group(1) or '') if t else ''
                st['en_pages'] += 1
                for name, k, vis, raw in infobox_params(text):
                    if k not in params:
                        continue
                    files[bucket(title)].write('\t'.join((tsv(title), tsv(k), tsv(vis[:150]))) + '\n')
                    st['en_rows'] += 1
            st['streams'] += 1
    for f in files: f.close()
    return wid, dict(st)


def run_pool(fn, dump, out, workers):
    t0 = time.time()
    dump, ranges = stream_offsets(dump)
    chunks = partition(ranges, workers)
    print(f'{os.path.basename(dump)}: {len(ranges)} streams, {len(chunks)} workers', flush=True)
    tot = collections.Counter()
    with mp.get_context('fork').Pool(len(chunks)) as pool:
        for wid, st in pool.imap_unordered(fn, [(i, dump, c, out) for i, c in enumerate(chunks)]):
            tot.update(st)
            print(f'worker {wid} {st} at {time.time()-t0:.0f}s', flush=True)
    return tot


def cmd_fa(a):
    os.makedirs(a.out, exist_ok=True)
    G['ll'] = langlinks(a.fa_dump)
    G['keys'] = census_keys(a.census)
    print(f"{len(G['ll'])} fa→en sitelinks, {len(G['keys'])} census keys", flush=True)
    st = run_pool(fa_worker, a.fa_dump, a.out, a.workers)
    wanted, params = set(), set()
    for p in glob.glob(f'{a.out}/fa-*.tsv.gz'):
        for line in gzip.open(p, 'rt', encoding='utf-8'):
            en, name, k, lat, vis, raw = line.rstrip('\n').split('\t')
            if lat == '0':
                wanted.add(en); params.add(k)
    json.dump({'wanted': sorted(wanted), 'params': sorted(params), 'stats': st},
              open(f'{a.out}/fa-wanted.json', 'w'), ensure_ascii=False)
    print(f'{len(wanted)} en titles wanted, {len(params)} parameter names', flush=True)


def cmd_en(a):
    w = json.load(open(f'{a.out}/fa-wanted.json'))
    G['wanted'], G['params'] = set(w['wanted']), set(w['params'])
    st = run_pool(en_worker, a.en_dump, a.out, a.workers)
    json.dump(st, open(f'{a.out}/en-stats.json', 'w'))


def cmd_join(a):
    csv.field_size_limit(10**9)
    # how many fa articles still show each English value: the reach of an entry
    still = collections.Counter()
    for line in gzip.open(f'{a.census}/values.tsv.gz', 'rt', encoding='utf-8'):
        if line.startswith('count\t'):
            continue
        n, t, k, v, _ = line.rstrip('\n').split('\t', 4)
        still[(t, k, v)] = int(n)
    pairs = collections.defaultdict(collections.Counter)   # (t, k, en) → fa visible counts
    raws = collections.defaultdict(collections.Counter)    # (t, k, en, fa visible) → raw counts
    ex = {}
    st = collections.Counter()
    for b in range(BUCKETS):
        en = collections.defaultdict(list)
        for p in glob.glob(f'{a.out}/en-{b:02d}-*.tsv.gz'):
            for line in gzip.open(p, 'rt', encoding='utf-8'):
                title, k, vis = line.rstrip('\n').split('\t')
                en[(title, k)].append(vis)
        for p in glob.glob(f'{a.out}/fa-{b:02d}-*.tsv.gz'):
            for line in gzip.open(p, 'rt', encoding='utf-8'):
                title, t, k, lat, vis, raw = line.rstrip('\n').split('\t')
                if lat != '0':
                    continue
                ev = en.get((title, k))
                if not ev:
                    st['no_en_value'] += 1; continue
                if len(set(ev)) != 1:
                    st['ambiguous_en'] += 1; continue   # the param appears twice on en
                env = norm_value(ev[0])
                if not LATIN.search(env):
                    continue
                key = (t, k, env)
                pairs[key][vis] += 1
                raws[key + (vis,)][raw] += 1
                ex.setdefault(key + (vis,), title)
                st['pairs'] += 1
    with open(f'{a.out}/candidates.tsv', 'w') as f:
        f.write('template\tparam\ten_value\tstill_english\tattested\tfa_value\tagree\tshare\tfa_raw\talternatives\texample_en_title\n')
        rows = []
        for key, c in pairs.items():
            total = sum(c.values())
            fa, n = c.most_common(1)[0]
            raw = raws[key + (fa,)].most_common(1)[0][0]
            alts = ' ¦ '.join(f'{v}={m}' for v, m in c.most_common(4)[1:])
            rows.append((still.get(key, 0), key, total, fa, n, raw, alts, ex[key + (fa,)]))
        for s, (t, k, env), total, fa, n, raw, alts, e in sorted(rows, key=lambda r: (-r[0], -r[2])):
            f.write(f'{tsv(t)}\t{tsv(k)}\t{tsv(env)}\t{s}\t{total}\t{tsv(fa)}\t{n}\t{n/total:.2f}\t{tsv(raw)}\t{tsv(alts)}\t{tsv(e)}\n')
    st['keys'] = len(pairs)
    json.dump(st, open(f'{a.out}/join-stats.json', 'w'))
    print(dict(st))


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest='cmd', required=True)
    s = sub.add_parser('fa'); s.add_argument('--fa-dump', required=True); s.add_argument('--census', required=True)
    s.add_argument('--out', required=True); s.add_argument('--workers', type=int, default=3)
    s = sub.add_parser('en'); s.add_argument('--en-dump', required=True); s.add_argument('--out', required=True)
    s.add_argument('--workers', type=int, default=3)
    s = sub.add_parser('join'); s.add_argument('--census', required=True); s.add_argument('--out', required=True)
    a = ap.parse_args()
    {'fa': cmd_fa, 'en': cmd_en, 'join': cmd_join}[a.cmd](a)
