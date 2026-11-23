"""Build the backtest gold set for the fa.wiktionary patrol from replica exports.

Inputs (TSV, produced on Toolforge by tools/wikt-gold.sh from the fawiktionary_p replica):
  g1.tsv  every revert (mw-undo / mw-rollback / mw-manual-revert) in ns 0/10/14, with the
          exact reverted range MediaWiki stores in change_tag.ct_params
  g2.tsv  every non-bot, non-trusted revision in ns 0/10/14 with the author's prior edits
  g3.tsv  every deletion in ns 0/10/14, with the reason text

Output: gold.jsonl, one case per line:
  {"kind": "edit", "rev_id", "parent_id", "page", "ns", "label": 1|0, "why", "tier", ...}
  {"kind": "creation", "page", "snippet", "label": 1|0, "why"}

Labels (Shahbaz's build_data.py rules, plus what the replica lets us do exactly):
  edit 1  reverted by a trusted user (sysop / rollbacker / patroller / autopatrolled /
          interface-admin), the revert itself not reverted, reverter != author
  edit 0  never reverted, page still exists, at least 30 days old
  drop    self-reverts, disputed reverts, reverts by untrusted users

  creation 1  deleted with a vandalism/scope reason; the log carries the first ~200
              characters as «محتوای صفحه این بود: «…»»
  creation 0  ns-0 pages created by low-trust users that still exist (sampled by the
              backtest, which fetches their first revision)

The gold set is used to MEASURE, not to train the model, and the cases a reviewer has
hand-checked carry "checked": true.
"""
import csv
import json
import re
import sys
from collections import Counter

csv.field_size_limit(10 ** 8)
TRUSTED = ('sysop', 'rollbacker', 'patroller', 'autopatrolled', 'interface-admin')
SNIPPET = re.compile(r'محتوای صفحه این بود: «(.*?)»(?: و تنها مشارکت‌کننده «\[\[(?:Special:Contributions|ویژه:مشارکت‌ها)/([^|\]]+))?')
# Reasons that mean "this should never have been created". Not: broken redirect,
# duplicate, moved, author request, unused template/category.
VANDAL_REASON = re.compile(
    r'^(خرابکاری|خارج از محدودهٔ پروژه|فاقد محتوای لازم|صفحهٔ آزمایشی|مطالب کاملاً نامفهوم|'
    r'Test page|Vandalism|No useful content|Out(side)? (of )?(the )?project.?s? scope|spam|'
    r'Deleting entries for made up|out of project scope|no useful content)', re.I)
NOT_VANDAL = re.compile(r'(تغییر ?مسیر|redirect|تکراری|duplicate|منتقل|درخواست نویسنده|author request|استفاده نشده|unused|بحث یتیم)', re.I)


def rd(path):
    with open(path, encoding='utf8') as f:
        return list(csv.DictReader(f, delimiter='\t', quoting=csv.QUOTE_NONE))


def tier(e):
    if e['actor_user'] in ('NULL', '') or e['actor_name'].startswith('~'):
        return 'T0'
    return 'T1' if int(e['prior_edits']) < 50 else 'T2'


def main(d='.'):
    g1, g2, g3 = rd(f'{d}/g1.tsv'), rd(f'{d}/g2.tsv'), rd(f'{d}/g3.tsv')
    by_page = {}
    for e in g2:
        by_page.setdefault(e['rev_page'], []).append(e)
    reverted, dropped = {}, Counter()
    for r in g1:
        if r['oldest'] in ('NULL', '', None):
            continue
        lo, hi = int(r['oldest']), int(r['newest'])
        trusted = any(g in (r['reverter_groups'] or '') for g in TRUSTED)
        for e in by_page.get(r['rev_page'], []):
            if not lo <= int(e['rev_id']) <= hi:
                continue
            if e['actor_name'] == r['reverter']:
                dropped['self-revert'] += 1
            elif r['revert_was_reverted'] == '1':
                dropped['disputed'] += 1
                reverted[e['rev_id']] = None
            elif not trusted:
                dropped['untrusted-reverter'] += 1
                reverted.setdefault(e['rev_id'], None)
            else:
                reverted[e['rev_id']] = r['reverter']
    out, n = [], Counter()
    newest = max(e['rev_timestamp'] for e in g2)
    for e in g2:
        rid = e['rev_id']
        base = {'kind': 'edit', 'rev_id': int(rid), 'parent_id': int(e['rev_parent_id']),
                'page': e['page_title'].replace('_', ' '), 'ns': int(e['page_namespace']),
                'user': e['actor_name'], 'tier': tier(e), 'ts': e['rev_timestamp'],
                'tags': (e['tags'] if e['tags'] != 'NULL' else '').split(',')}
        if rid in reverted:
            if reverted[rid] is None:
                continue
            out.append({**base, 'label': 1, 'why': f'reverted by {reverted[rid]}'})
            n['edit+'] += 1
        elif e['rev_timestamp'] < str(int(newest[:8]) - 100) + newest[8:] and e['rev_parent_id'] != '0':
            out.append({**base, 'label': 0, 'why': 'survived'})
            n['edit-'] += 1
    for r in g3:
        m = SNIPPET.search(r['comment_text'])
        if not m or int(r['log_namespace']) != 0:
            continue
        reason = r['comment_text']
        if NOT_VANDAL.search(reason.split('محتوای صفحه')[0]):
            continue
        snippet = re.sub(r'\{\{\s*(حذف[_ ]سریع|delete|db)[^}]*\}\}', '', m.group(1)).strip()
        if len(snippet) < 3:
            continue
        label = 1 if VANDAL_REASON.search(reason) or reason.startswith('محتوای صفحه') else 0
        if not label:
            continue
        out.append({'kind': 'creation', 'page': r['log_title'].replace('_', ' '), 'ns': 0,
                    'snippet': snippet, 'creator': m.group(2), 'deleter': r['deleter'],
                    'ts': r['log_timestamp'], 'label': 1, 'why': reason.split(':')[0][:60]})
        n['creation+'] += 1
    with open(f'{d}/gold.jsonl', 'w', encoding='utf8') as f:
        for row in out:
            f.write(json.dumps(row, ensure_ascii=False) + '\n')
    print(dict(n), 'dropped', dict(dropped), file=sys.stderr)


if __name__ == '__main__':
    main(*(sys.argv[1:2] or ['.']))
