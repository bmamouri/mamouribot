#!/usr/bin/env python3
"""وظیفهٔ ۲۰ navbox census: English left in navbox and sidebar templates.

An infobox's English sits in each article; a navbox's sits in the template page, and one
edit there fixes every article that shows it. So this pass reads the Template namespace
for navbox-family calls, splits each visible parameter into items, and classifies every
item. A second pass over the articles counts how often each navbox is called, so the
report can rank navboxes by reach.

    python3 navbox_census.py scan      --dump DIR --out DIR [--workers 3]
    python3 navbox_census.py aggregate --out DIR

Item classes (what the reader sees, and what it would take to fix):
    en_link       [[English target|English label]] or [[English target]]   task 12 / names
    fa_link_en    [[Persian target|English label]]   label can become the Persian title
    en_text       plain English text, no link        dictionary
    en_target     [[English target|Persian label]]   reads Persian; link is task 12's
    fa            nothing English visible
"""
import argparse, bz2, collections, glob, gzip, html, json, multiprocessing as mp, os, re, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from census import (mask, template_spans, split_top, norm_name, visible, stream_offsets, tsv,
                    LATIN, FILE_PREFIX, REF_SENTINEL)

# Canonical fa names and their redirects, resolved 2026-11-22.
NAVBOX_FAMILY = {n.lower() for n in [
    'Navbox', 'پیوندان', 'پیونددان', 'ناوبری تاشو', 'Horror navbox', 'ناوبری', 'راهبری',
    'جعبه گشتن پویا با عکس', 'ناوباکس', 'جعبه گشتن', 'Footer', 'جعبه ناوبری',
    'Navbox with collapsible groups', 'Navbox with collapsible sections',
    'Navbox with columns', 'جعبه ناوبر با ستون',
    'Navbox subgroup', 'Navbox generic subgroup', 'Navbox subgroups', 'زیرگروه ناوجعبه',
    'Navbox musical artist', 'Navbox Musical artist', 'Military navigation',
    'Sidebar', 'نوار کناری', 'نوار جانبی',
    'Sidebar with collapsible lists', 'Sidebar with collapsible groups']}
SIDEBAR = {n.lower() for n in ['Sidebar', 'نوار کناری', 'نوار جانبی', 'Sidebar with collapsible lists',
                                'Sidebar with collapsible groups']}
# Parameters a reader sees. Everything else (name, state, *style, bodyclass, image) is a
# control key or not text.
LABEL_PARAM = re.compile(r'^(title|above|below|pretitle|group\d+|heading\d+|sect\d+|section\d+|'
                         r'col\d+header|col\d+footer|caption)$')
LIST_PARAM = re.compile(r'^(list\d+|content\d+|col\d+)$')
# Wrappers whose positional arguments are list items, so their content must be kept, not
# dropped as "a template".
LIST_WRAPPERS = {n.lower() for n in [
    'فهرست افقی', 'Hlist', 'Dotlist', 'Horizontal list', 'فهرست یک‌دست', 'Flatlist', 'Flat list',
    'آغاز فهرست یک‌دست', 'Startflatlist', 'فهرست یکدست', 'Flt', 'فهرست ساده', 'Plainlist',
    'Plain list', 'Startplainlist', 'فس', 'PL', 'لیست ساده', 'Plist', 'فهرست ناگلوله‌ای',
    'Unbulleted list', 'Ubl', 'فنگ', 'ناگلوله', 'Unordered list', 'Ublist', 'Vunblist',
    'Unbulletedlist', 'UBL', 'فهرست بی‌نقطه', 'فهرست گلوله‌ای', 'Bulleted list', 'فهرست نامرتب',
    'Blist', 'Bulletedlist', 'Ulist', 'Bulletlist', 'Nowrap', 'Nobr', 'J', 'No wrap', 'Nobreak',
    'Nowr', 'Collapsible list', 'فهرست جمع شدنی', 'List collapsed', 'لیست تاشو', 'Clist',
    'آغاز کوچک', 'آغاز ریز', 'Small', 'ریز', 'کوچک', 'ک', 'Nobold', 'Nowrap begin', 'Big', 'بزرگ']}
SEP_TEMPLATES = {n.lower() for n in ['·', '•', 'Dot', 'Middot', '!', 'نقطه', 'Ndash', 'Spaces', 'سخ', 'Br']}
SKIP_SUBPAGE = re.compile(r'/(توضیحات|تمرین|آزمایشی|آزمایش|موردهای[ \u200c]?آزمون|مورد آزمون|doc|sandbox|testcases)(/|$)', re.I)
NOINCLUDE = re.compile(r'<noinclude>.*?(</noinclude>|$)', re.S | re.I)
INCLUDE_TAGS = re.compile(r'</?(includeonly|onlyinclude)>', re.I)
LINK = re.compile(r'\[\[([^\[\]]*)\]\]')
INTERWIKI = re.compile(r'^\s*:?\s*[a-z]{2,3}(?:-[a-z]+)?\s*:', re.I)


def unwrap(text):
    """Replace list-wrapper and separator templates by their content, innermost first, so
    that what is left of a list value is wikitext items."""
    for _ in range(6):
        changed = False
        for s, e in template_spans(text):
            parts = split_top(text[s + 2:e - 2])
            name = norm_name(parts[0]).lower()
            if name in SEP_TEMPLATES:
                rep = '\n'
            elif name in LIST_WRAPPERS:
                pos = [p for p in parts[1:] if '=' not in p.split('[[')[0].split('{{')[0]]
                rep = '\n' + '\n'.join(pos) + '\n'
            else:
                continue
            text = text[:s] + rep + text[e:]
            changed = True
            break
        if not changed:
            return text
    return text


def drop_nested_navboxes(value):
    """A child/subgroup navbox inside a list is counted as its own call; remove it here so
    its items are not counted twice."""
    spans = [(s, e) for s, e in template_spans(value)
             if norm_name(split_top(value[s + 2:e - 2])[0]).lower() in NAVBOX_FAMILY]
    for s, e in sorted(spans, reverse=True):
        if not any(s2 <= s and e <= e2 and (s2, e2) != (s, e) for s2, e2 in spans):
            value = value[:s] + '\n' + value[e:]
    return value


def join_template_lines(value):
    """A template or parser function left in a list after unwrapping is one item even when
    it spans lines; without this, its lines are split into fragments of code."""
    spans = sorted(template_spans(value))
    outer, last = [], -1
    for s, e in spans:
        if s >= last:
            outer.append((s, e)); last = e
    for s, e in reversed(outer):
        value = value[:s] + value[s:e].replace('\n', ' ') + value[e:]
    return value


def items_of(value):
    """Split a list value into items: one per bullet line, and inside a line, one per
    middot/bullet separator."""
    value = unwrap(drop_nested_navboxes(value))
    value = join_template_lines(value)
    out = []
    for line in value.split('\n'):
        line = re.sub(r'^[*#:;]+', '', line).strip()
        if not line:
            continue
        for piece in re.split(r'\s+[·•]\s+|&nbsp;[·•]\s*|\s*&#183;\s*|\s+-\s+(?=\[\[)', line):
            piece = piece.strip(' ,،;؛')
            if piece:
                out.append(piece)
    return out


def drop_files(text):
    """Remove [[File:…]] links with their (possibly linked) captions, by bracket depth."""
    out, i = [], 0
    while i < len(text):
        m = re.compile(r'\[\[\s*:?\s*(file|image|پرونده|تصویر|رسانه|media)\s*:', re.I).search(text, i)
        if not m:
            out.append(text[i:]); break
        out.append(text[i:m.start()])
        depth, j = 0, m.start()
        while j < len(text):
            if text.startswith('[[', j): depth += 1; j += 2
            elif text.startswith(']]', j):
                depth -= 1; j += 2
                if depth == 0: break
            else: j += 1
        i = j
    return ''.join(out)


def classify(item):
    vis, _ = visible(item)
    links = [l for l in LINK.findall(drop_files(item)) if not FILE_PREFIX.match(l.split('|')[0])]
    en_target = any(LATIN.search(l.split('|')[0]) and not INTERWIKI.match(l) for l in links)
    if not vis:
        return None, vis
    if not LATIN.search(vis):
        return ('en_target' if en_target else 'fa'), vis
    if not links:
        return 'en_text', vis
    if en_target:
        return 'en_link', vis
    return 'fa_link_en', vis


REDIRECT = re.compile(r'<redirect title="([^"]*)"')
PAGE = re.compile(r'<page>(.*?)</page>', re.S)
TITLE = re.compile(r'<title>(.*?)</title>')
NS = re.compile(r'<ns>(\d+)</ns>')
TEXT = re.compile(r'<text\b[^>]*?(?:/>|>(.*?)</text>)', re.S)


def worker(args):
    wid, dump, ranges, out = args
    rows_f = gzip.open(f'{out}/nav-rows-{wid}.tsv.gz', 'wt', encoding='utf-8')
    stats = collections.Counter()
    calls = collections.Counter()     # ns0: template name → articles calling it
    redirects = {}                    # ns10 redirect → target
    per_nav = {}
    with open(dump, 'rb') as f:
        for start, end in ranges:
            f.seek(start)
            try:
                xml = bz2.decompress(f.read(end - start)).decode('utf-8')
            except Exception:
                stats['bad_stream'] += 1
                continue
            for m in PAGE.finditer(xml):
                p = m.group(1)
                ns = NS.search(p).group(1)
                title = html.unescape(TITLE.search(p).group(1))
                t = TEXT.search(p)
                text = html.unescape(t.group(1) or '') if t else ''
                if ns == '0':
                    if '<redirect' in p:
                        continue
                    names = set()
                    mt = mask(text)
                    for s, e in template_spans(mt):
                        names.add(norm_name(re.split(r'[|}\n]', mt[s + 2:min(e - 2, s + 200)], maxsplit=1)[0]))
                    for n in names:
                        calls[n] += 1
                    continue
                if ns != '10':
                    continue
                short = title.split(':', 1)[1]
                rd = REDIRECT.search(p)
                if rd:
                    redirects[short] = html.unescape(rd.group(1)).split(':', 1)[-1]
                    continue
                if SKIP_SUBPAGE.search(short) or short.lower() in NAVBOX_FAMILY:
                    continue
                src = INCLUDE_TAGS.sub('', NOINCLUDE.sub('', text))
                src = mask(src)
                found = False
                for s, e in template_spans(src):
                    parts = split_top(src[s + 2:e - 2])
                    name = norm_name(parts[0]).lower()
                    if name not in NAVBOX_FAMILY:
                        continue
                    found = True
                    kindbox = 'sidebar' if name in SIDEBAR else 'navbox'
                    nav = per_nav.setdefault(short, collections.Counter(kind=0))
                    nav['kind'] = 1 if kindbox == 'sidebar' else 0
                    for part in parts[1:]:
                        if '=' not in part:
                            if part.strip().lower() in ('child', 'subgroup'):
                                continue
                            continue
                        k, _, v = part.partition('=')
                        k, v = k.strip(), v.strip()
                        if not v:
                            continue
                        if LABEL_PARAM.match(k):
                            vals = [('label', v)]
                        elif LIST_PARAM.match(k):
                            # a nested navbox (child/subgroup) is counted on its own
                            vals = [('item', it) for it in items_of(v)]
                        else:
                            continue
                        for role, it in vals:
                            if role == 'label':
                                vis, _ = visible(it)
                                if not vis:
                                    continue
                                cls = 'label_en' if LATIN.search(vis) else 'label_fa'
                            else:
                                cls, vis = classify(it)
                                if not cls:
                                    continue
                            nav[cls] += 1
                            stats[cls] += 1
                            if cls not in ('fa', 'label_fa', 'en_target'):
                                rows_f.write('\t'.join((tsv(short), kindbox, tsv(re.sub(r'\d+', 'N', k)), cls,
                                                        tsv(vis[:200]), tsv(it.strip()[:300]))) + '\n')
                if found:
                    stats['navbox_pages'] += 1
            stats['streams'] += 1
    rows_f.close()
    json.dump({'stats': stats, 'calls': calls, 'redirects': redirects, 'per_nav': per_nav},
              open(f'{out}/nav-part-{wid}.json', 'w'), ensure_ascii=False)
    return wid, dict(stats)


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
    print(f'{len(ranges)} streams, {len(chunks)} workers', flush=True)
    with mp.Pool(len(chunks)) as pool:
        for wid, st in pool.imap_unordered(worker, [(i, dump, c, a.out) for i, c in enumerate(chunks)]):
            print(f'worker {wid} done {st} at {time.time()-t0:.0f}s', flush=True)


def aggregate(a):
    stats, calls = collections.Counter(), collections.Counter()
    redirects, per_nav = {}, {}
    for p in sorted(glob.glob(f'{a.out}/nav-part-*.json')):
        d = json.load(open(p))
        stats.update(d['stats']); calls.update(d['calls']); redirects.update(d['redirects'])
        for k, v in d['per_nav'].items():
            per_nav.setdefault(k, collections.Counter()).update(v)
    reach = collections.Counter()
    for n, c in calls.items():
        tgt = redirects.get(n, n)
        if tgt in per_nav:
            reach[tgt] += c

    classes = ['en_link', 'fa_link_en', 'en_text', 'label_en', 'en_target', 'fa', 'label_fa']
    with open(f'{a.out}/navboxes.tsv', 'w') as f:
        f.write('navbox\tkind\tarticles_calling\t' + '\t'.join(classes) + '\tvisible_en\n')
        rows = []
        for n, c in per_nav.items():
            ven = c['en_link'] + c['fa_link_en'] + c['en_text'] + c['label_en']
            rows.append((ven * max(reach[n], 1), n, c, ven))
        for _, n, c, ven in sorted(rows, reverse=True):
            f.write(f"{tsv(n)}\t{'sidebar' if c['kind'] else 'navbox'}\t{reach[n]}\t" +
                    '\t'.join(str(c[k]) for k in classes) + f'\t{ven}\n')

    vals = collections.Counter(); ex = {}
    for p in sorted(glob.glob(f'{a.out}/nav-rows-*.tsv.gz')):
        for line in gzip.open(p, 'rt', encoding='utf-8'):
            nav, kindbox, k, cls, vis, raw = line.rstrip('\n').split('\t')
            key = (cls, 'label' if cls == 'label_en' else 'item', re.sub(r'\s+', ' ', vis).strip().lower())
            vals[key] += 1
            ex.setdefault(key, nav)
    with gzip.open(f'{a.out}/nav-values.tsv.gz', 'wt', encoding='utf-8') as f:
        f.write('count\tclass\trole\tvalue\texample_navbox\n')
        for (cls, role, v), n in vals.most_common():
            f.write(f'{n}\t{cls}\t{role}\t{tsv(v)}\t{tsv(ex[(cls, role, v)])}\n')

    navs = len(per_nav)
    with_en = sum(1 for c in per_nav.values() if c['en_link'] + c['fa_link_en'] + c['en_text'] + c['label_en'])
    summary = dict(stats, navbox_templates=navs, navboxes_with_visible_english=with_en,
                   article_calls_to_navboxes=sum(reach.values()),
                   article_calls_to_navboxes_with_english=sum(
                       reach[n] for n, c in per_nav.items()
                       if c['en_link'] + c['fa_link_en'] + c['en_text'] + c['label_en']),
                   distinct_values=len(vals))
    json.dump(summary, open(f'{a.out}/nav-summary.json', 'w'), indent=1)
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
