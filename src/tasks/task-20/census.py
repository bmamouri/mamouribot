#!/usr/bin/env python3
"""وظیفهٔ ۲۰ census: every infobox parameter value in a fawiki dump that shows English.

Reads the pages-articles multistream dump, finds every infobox-like template call in every
main-namespace article, and writes one row per parameter whose reader-visible text contains
Latin letters. A second pass aggregates the rows into per-template, per-parameter and
per-value counts, which decide what the dictionary covers first and which parameters are
fixed-choice fields to be handled in the template instead.

Standard library only, so it runs in the Toolforge python3.13 image without a venv.

    python3 census.py scan      --dump DIR --out DIR [--workers 3] [--max-streams N]
    python3 census.py aggregate --out DIR

The parser is deliberately simple: brace matching plus top-level pipe splitting, after
comments, refs and nowiki-like blocks are masked. It is a census, not an editor; the bot's
edits go through its own parser with its own tests. What it must not do is lose rows
silently, so it counts every infobox it could not split (`unbalanced`) instead of skipping.
"""
import argparse, bz2, collections, glob, gzip, html, json, multiprocessing as mp, os, re, sys, time

INFOBOX_NAME = re.compile(
    r'^(infobox|جعبه[ ‌]?اطلاعات|جعبه[ ‌]|taxobox|speciesbox|automatic taxobox|subspeciesbox|'
    r'chembox|drugbox|geobox|football club infobox|خانه اطلاعات)', re.I)

MASK_BLOCK = re.compile(
    r'<!--.*?(?:-->|$)'
    r'|<ref\b[^>]*/>'
    r'|<ref\b[^>]*>.*?</ref\s*>'
    r'|<(nowiki|pre|math|syntaxhighlight|source|score|chem|ce|templatedata|gallery)\b[^>]*>.*?</\1\s*>',
    re.S | re.I)
REF_SENTINEL = '\x01'
FILE_PREFIX = re.compile(r'^\s*:?\s*(file|image|پرونده|تصویر|رسانه|media|category|رده)\s*:', re.I)
FILE_VALUE = re.compile(r'^[^|\n]*\.(jpe?g|png|svg|gif|tiff?|webp|webm|ogg|ogv|oga|mp3|mp4|pdf|djvu|xcf|bmp)$', re.I)
SIZE_VALUE = re.compile(r'^(?:\d+|[۰-۹]+)?\s*(?:x\s*(?:\d+|[۰-۹]+))?\s*px$', re.I)
URL = re.compile(r'(?:https?:)?//\S+|\bwww\.\S+', re.I)
LATIN = re.compile(r'[A-Za-z]{2,}')
LATIN_LINK = re.compile(r'\[\[\s*(?!:?\s*(?:file|image|پرونده|تصویر|رده|category|[a-z]{2,3}(?:-[a-z]+)?\s*:))[^\]|]*[A-Za-z][^\]|]*(?:\|[^\]]*)?\]\]', re.I)


def mask(text):
    """Remove comments, and replace refs and nowiki-like blocks with a sentinel, so pipes
    and braces inside them cannot split a template."""
    return MASK_BLOCK.sub(lambda m: '' if m.group(0).startswith('<!--') else REF_SENTINEL, text)


def template_spans(text):
    """(start, end) of every {{…}} call, outermost and nested, in order of their end.
    Triple-brace parameters are skipped as a unit. Unclosed openers are dropped."""
    spans, stack, i, n = [], [], 0, len(text)
    while i < n:
        c = text[i]
        if c == '{' and text.startswith('{{', i):
            if text.startswith('{{{', i) and not text.startswith('{{{{', i):
                j = text.find('}}}', i + 3)
                if j != -1 and '{{' not in text[i + 3:j]:
                    i = j + 3
                    continue
            stack.append(i)
            i += 2
        elif c == '}' and text.startswith('}}', i) and stack:
            spans.append((stack.pop(), i + 2))
            i += 2
        else:
            i += 1
    return spans


def split_top(body):
    """Split a template body at pipes outside nested {{…}} and [[…]]."""
    parts, depth_t, depth_l, start, i, n = [], 0, 0, 0, 0, len(body)
    while i < n:
        if body.startswith('{{', i):
            depth_t += 1; i += 2; continue
        if body.startswith('}}', i) and depth_t:
            depth_t -= 1; i += 2; continue
        if body.startswith('[[', i):
            depth_l += 1; i += 2; continue
        if body.startswith(']]', i) and depth_l:
            depth_l -= 1; i += 2; continue
        if body[i] == '|' and not depth_t and not depth_l:
            parts.append(body[start:i]); start = i + 1
        i += 1
    parts.append(body[start:])
    return parts


def norm_name(name):
    name = re.sub(r'[\s_]+', ' ', name).strip()
    name = re.sub(r'^(template|الگو)\s*:\s*', '', name, flags=re.I)
    return name[:1].upper() + name[1:] if name else name


def strip_nested(value):
    """Remove every nested {{…}} from a value. Returns (text, had_template)."""
    spans = template_spans(value)
    if not spans:
        return value, False
    outer, last = [], -1
    for s, e in sorted(spans):
        if s >= last:
            outer.append((s, e)); last = e
    out, pos = [], 0
    for s, e in outer:
        out.append(value[pos:s]); pos = e
    out.append(value[pos:])
    return ''.join(out), True


def visible(value):
    """Roughly what a reader sees of a value: link labels kept, link targets, files,
    templates, refs, URLs and markup dropped."""
    text, had_tpl = strip_nested(value)
    text = text.replace(REF_SENTINEL, ' ')
    text = re.sub(r'\{\{\{[^{}|]*\|?([^{}]*)\}\}\}', r'\1', text)

    def link(m):
        inner = m.group(1)
        target, _, label = inner.partition('|')
        if FILE_PREFIX.match(target):
            return ' '
        return label if label else target.lstrip(':')
    for _ in range(3):  # a link inside a file caption: innermost first
        new = re.sub(r'\[\[([^\[\]]*)\]\]', link, text)
        if new == text:
            break
        text = new
    text = re.sub(r'\[(?:https?:)?//\S+\s*([^\]]*)\]', r'\1', text)
    text = URL.sub(' ', text)
    text = re.sub(r'<[^>]+>', ' ', text)
    text = text.replace("'''", '').replace("''", '')
    text = html.unescape(text)
    return re.sub(r'\s+', ' ', text).strip(), had_tpl


def infobox_rows(title, wikitext):
    """Yield (template, param, kind, visible, raw) for every filled infobox parameter, and
    count totals. kind is 'latin', 'file', 'clean' or 'empty'."""
    text = mask(wikitext)
    for s, e in template_spans(text):
        body = text[s + 2:e - 2]
        parts = split_top(body)
        name = norm_name(parts[0])
        if not INFOBOX_NAME.match(name):
            continue
        yield ('__box__', name, None, None, None)
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
                yield (name, k, 'empty', '', '')
                continue
            vis, had_tpl = visible(raw)
            if not vis:
                yield (name, k, 'clean', '', '')
                continue
            if FILE_VALUE.match(vis) or SIZE_VALUE.match(vis):
                yield (name, k, 'file', '', '')
                continue
            if LATIN.search(vis):
                flags = ('L' if LATIN_LINK.search(raw) else '') + ('T' if had_tpl else '') + \
                        ('R' if REF_SENTINEL in raw else '')
                yield (name, k, 'latin:' + flags, vis[:200], raw[:300])
            else:
                yield (name, k, 'clean', '', '')


PAGE = re.compile(r'<page>(.*?)</page>', re.S)
TITLE = re.compile(r'<title>(.*?)</title>')
NS = re.compile(r'<ns>(\d+)</ns>')
TEXT = re.compile(r'<text\b[^>]*?(?:/>|>(.*?)</text>)', re.S)


def pages_in(xml):
    for m in PAGE.finditer(xml):
        p = m.group(1)
        ns = NS.search(p)
        if not ns or ns.group(1) != '0' or '<redirect' in p:
            continue
        t = TEXT.search(p)
        yield html.unescape(TITLE.search(p).group(1)), html.unescape(t.group(1) or '') if t else ''


def tsv(s):
    return s.replace('\t', ' ').replace('\n', '\\n').replace('\r', '')


def worker(args):
    wid, dump, ranges, out = args
    rows_f = gzip.open(f'{out}/rows-{wid}.tsv.gz', 'wt', encoding='utf-8')
    stats = collections.Counter()
    tpl = collections.Counter()           # template → infobox calls
    tpl_art = collections.Counter()       # template → articles
    tpl_latin_art = collections.Counter()  # template → articles with ≥1 latin row
    par = collections.defaultdict(collections.Counter)  # (template, param) → kind counts
    with open(dump, 'rb') as f:
        for start, end in ranges:
            f.seek(start)
            data = f.read(end - start) if end else f.read()
            try:
                xml = bz2.decompress(data).decode('utf-8')
            except Exception:
                stats['bad_stream'] += 1
                continue
            for title, text in pages_in(xml):
                stats['articles'] += 1
                seen, latin_seen = set(), set()
                for name, k, kind, vis, raw in infobox_rows(title, text):
                    if name == '__box__':
                        tpl[k] += 1; seen.add(k)
                        continue
                    par[(name, k)][kind.split(':')[0]] += 1
                    if kind.startswith('latin'):
                        latin_seen.add(name)
                        rows_f.write('\t'.join((tsv(title), tsv(name), tsv(k), kind[6:], tsv(vis), tsv(raw))) + '\n')
                        stats['latin_rows'] += 1
                if seen:
                    stats['articles_with_infobox'] += 1
                if latin_seen:
                    stats['articles_with_latin'] += 1
                for n in seen: tpl_art[n] += 1
                for n in latin_seen: tpl_latin_art[n] += 1
            stats['streams'] += 1
    rows_f.close()
    json.dump({'stats': stats, 'tpl': tpl, 'tpl_art': tpl_art, 'tpl_latin_art': tpl_latin_art,
               'par': [[k[0], k[1], dict(v)] for k, v in par.items()]},
              open(f'{out}/part-{wid}.json', 'w'), ensure_ascii=False)
    return wid, dict(stats)


def stream_offsets(dump_dir):
    idx = glob.glob(f'{dump_dir}/*-pages-articles-multistream-index.txt.bz2')[0]
    dump = idx.replace('-index.txt.bz2', '.xml.bz2')
    offs = sorted({int(line.split(b':', 1)[0]) for line in bz2.open(idx, 'rb')})
    size = os.path.getsize(dump)
    return dump, [(o, offs[i + 1] if i + 1 < len(offs) else size) for i, o in enumerate(offs)]


def scan(a):
    os.makedirs(a.out, exist_ok=True)
    t0 = time.time()
    dump, ranges = stream_offsets(a.dump)
    if a.max_streams:
        ranges = ranges[:a.max_streams]
    total = sum(e - s for s, e in ranges)
    chunks, cur, acc, per = [], [], 0, total / a.workers
    for r in ranges:
        cur.append(r); acc += r[1] - r[0]
        if acc >= per and len(chunks) < a.workers - 1:
            chunks.append(cur); cur, acc = [], 0
    chunks.append(cur)
    print(f'{len(ranges)} streams, {total/1e9:.2f} GB, {len(chunks)} workers', flush=True)
    with mp.Pool(len(chunks)) as pool:
        for wid, st in pool.imap_unordered(worker, [(i, dump, c, a.out) for i, c in enumerate(chunks)]):
            print(f'worker {wid} done {st} at {time.time()-t0:.0f}s', flush=True)
    json.dump({'dump': os.path.basename(dump), 'workers': len(chunks), 'seconds': round(time.time() - t0)},
              open(f'{a.out}/scan.json', 'w'))


def value_key(v):
    return re.sub(r'\s+', ' ', v).strip().lower()


def aggregate(a):
    stats, tpl, tpl_art, tpl_latin_art = (collections.Counter() for _ in range(4))
    par = collections.defaultdict(collections.Counter)
    for p in sorted(glob.glob(f'{a.out}/part-*.json')):
        d = json.load(open(p))
        stats.update(d['stats']); tpl.update(d['tpl']); tpl_art.update(d['tpl_art'])
        tpl_latin_art.update(d['tpl_latin_art'])
        for t, k, v in d['par']:
            par[(t, k)].update(v)

    vals = collections.Counter()
    examples = collections.defaultdict(list)
    linkish = collections.Counter()
    for p in sorted(glob.glob(f'{a.out}/rows-*.tsv.gz')):
        for line in gzip.open(p, 'rt', encoding='utf-8'):
            title, t, k, flags, vis, raw = line.rstrip('\n').split('\t')
            key = (t, k, value_key(vis))
            vals[key] += 1
            if 'L' in flags:
                linkish[(t, k)] += 1
            if len(examples[key]) < 3:
                examples[key].append(title)

    per_param = collections.defaultdict(lambda: {'distinct': 0, 'singletons': 0, 'repeated5': 0, 'top': []})
    for (t, k, v), n in vals.items():
        pp = per_param[(t, k)]
        pp['distinct'] += 1
        if n == 1: pp['singletons'] += 1
        if n >= 5: pp['repeated5'] += n
        pp['top'].append((n, v))
    with open(f'{a.out}/params.tsv', 'w') as f:
        f.write('template\tparam\tfilled\tlatin\tlatin_with_link\tdistinct\tsingletons\tshare_in_values_seen_5plus\ttop_values\n')
        for (t, k), c in sorted(par.items(), key=lambda x: -x[1]['latin']):
            if not c['latin']:
                continue
            pp = per_param[(t, k)]
            top = sorted(pp['top'], reverse=True)[:8]
            filled = c['latin'] + c['clean'] + c['file']
            f.write(f"{tsv(t)}\t{tsv(k)}\t{filled}\t{c['latin']}\t{linkish[(t, k)]}\t{pp['distinct']}\t"
                    f"{pp['singletons']}\t{pp['repeated5'] / c['latin']:.2f}\t"
                    f"{' ¦ '.join(f'{v}={n}' for n, v in top)}\n")
    with open(f'{a.out}/templates.tsv', 'w') as f:
        f.write('template\tcalls\tarticles\tarticles_with_latin\tlatin_values\n')
        lat = collections.Counter()
        for (t, k), c in par.items(): lat[t] += c['latin']
        for t, n in tpl_art.most_common():
            f.write(f'{tsv(t)}\t{tpl[t]}\t{n}\t{tpl_latin_art[t]}\t{lat[t]}\n')
    with gzip.open(f'{a.out}/values.tsv.gz', 'wt', encoding='utf-8') as f:
        f.write('count\ttemplate\tparam\tvalue\texamples\n')
        for (t, k, v), n in vals.most_common():
            if n < 2:
                break
            f.write(f"{n}\t{tsv(t)}\t{tsv(k)}\t{tsv(v)}\t{' | '.join(examples[(t, k, v)])}\n")
    rep = sum(n for n in vals.values() if n >= 2)
    summary = dict(stats, distinct_values=len(vals), rows_in_values_seen_twice=rep,
                   rows_in_values_seen_5plus=sum(n for n in vals.values() if n >= 5),
                   templates_with_latin=sum(1 for t in tpl_latin_art if tpl_latin_art[t]),
                   params_with_latin=sum(1 for c in par.values() if c['latin']))
    json.dump(summary, open(f'{a.out}/summary.json', 'w'), indent=1)
    print(json.dumps(summary, indent=1))


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest='cmd', required=True)
    s = sub.add_parser('scan')
    s.add_argument('--dump', required=True)
    s.add_argument('--out', required=True)
    s.add_argument('--workers', type=int, default=3)
    s.add_argument('--max-streams', type=int, default=0)
    g = sub.add_parser('aggregate')
    g.add_argument('--out', required=True)
    a = ap.parse_args()
    scan(a) if a.cmd == 'scan' else aggregate(a)
