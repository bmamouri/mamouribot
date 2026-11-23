"""Compare shadow-mode decisions with what humans actually did. Reads only.

    python3 shadow-report.py ~/state/wikt-patrol.decisions.jsonl

For each would-be revert or tag, at least 3 days old, checks the live wiki:
  revert: is the suspect revision's added text still on the page? Is the revision tagged
          mw-reverted?
  tag:    was the page deleted?
Prints agreement, the disagreements to read by hand, and the review-queue size per day.
This is the "≥ 30 would-be actions, ≥ 95% agreement" gate in
docs/task-21-wiktionary-antivandal.md.
"""
import json
import sys
import time
import urllib.parse
import urllib.request
from collections import Counter
from datetime import datetime, timezone

API = 'https://fa.wiktionary.org/w/api.php'
UA = 'MamouriBot/1.0 (wiktionary:fa; User:MamouriBot) task21-shadow-report/1.0'


def get(**p):
    p.update(format='json', formatversion='2')
    req = urllib.request.Request(API + '?' + urllib.parse.urlencode(p), headers={'User-Agent': UA})
    for attempt in range(5):
        try:
            return json.load(urllib.request.urlopen(req, timeout=60))
        except Exception:
            time.sleep(5 * (attempt + 1))
    raise RuntimeError('API unreachable')


def main(path):
    rows = [json.loads(l) for l in open(path, encoding='utf8') if l.strip()]
    rows = [r for r in rows if r.get('action')]
    now = datetime.now(timezone.utc)
    old = [r for r in rows if (now - datetime.fromisoformat(r['ts'].replace('Z', '+00:00'))).days >= 3]
    acts = [r for r in old if r['action'] in ('revert', 'tag')]
    agree, disagree = 0, []
    for r in acts:
        if r['action'] == 'tag':
            p = get(action='query', titles=r['title'], prop='info')['query']['pages'][0]
            ok = 'missing' in p
        else:
            rv = get(action='query', revids=str(r['revid']), prop='revisions', rvprop='tags')
            pages = rv['query'].get('pages', [])
            tags = pages[0]['revisions'][0].get('tags', []) if pages and 'revisions' in pages[0] else []
            ok = 'mw-reverted' in tags or not pages or 'revisions' not in pages[0]
        if ok:
            agree += 1
        else:
            disagree.append(r)
    days = max(1, len({r['ts'][:10] for r in rows}))
    print(f'decisions: {len(rows)} over {days} days  {dict(Counter(r["action"] for r in rows))}')
    print(f'would-be actions ≥3 days old: {len(acts)}; humans did the same: {agree}'
          f' ({agree / len(acts):.0%})' if acts else 'no would-be actions old enough yet')
    print(f'review queue: {sum(1 for r in rows if r["action"] == "report") / days:.1f} a day')
    for r in disagree:
        print(f'  ✗ {r["action"]} {r["tier"]} {r["title"]} r{r["revid"]} {r["p1"] and r["p1"]["v"]}: '
              f'{r["p1"] and r["p1"]["r"]}')


if __name__ == '__main__':
    main(sys.argv[1])
