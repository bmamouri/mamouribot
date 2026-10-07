#!/usr/bin/env python3
# MamouriBot — Task 5: remove EMPTY, module-flagged-UNKNOWN parameters from CS1 citations.
# Clears رده:خطاهای CS1: پارامترهای نامعلوم خالی («یادکرد پارامتر ناشناختهٔ خالی دارد»).
#
# On-wiki request : ویکی‌پدیا:سیاست ربات‌رانی/درخواست مجوز/MamouriBot/وظیفه ۵
# On-wiki code copy: کاربر:MamouriBot/کد/وظیفه ۵
#
# Safety: only removes a param that is BOTH empty AND flagged unknown by the module
# (detected from the module's own error span, not guessed); every edit is gated on a
# render-identity check (each <cite>'s content byte-identical before/after except the
# cleared error) and skipped otherwise. Credentials come from .env only.
#
# Usage:  python3 empty-unknown-params.py            # DRY-RUN (default; prints WOULD SAVE)
#         python3 empty-unknown-params.py --run       # live edits (30–120s pacing, resumable)
#         python3 empty-unknown-params.py --run --limit=10   # live pilot
import urllib.request, urllib.parse, json, time, re, os
from collections import Counter
# Self-identifying UA, Pywikibot-shaped: a bot must not pose as a browser (asked for
# on the Task-9 permission request). ASCII only — HTTP headers cannot carry Persian.
import platform
UA=('MamouriBot/1.0 (wikipedia:fa; User:MamouriBot; https://fa.wikipedia.org/wiki/User:MamouriBot) '
    f'mamouribot-empty-unknown-params/1.0 Python/{platform.python_version()}')
import threading
_last_req=[0.0]; _req_lock=threading.Lock(); _MIN_INTERVAL=float(os.environ.get('MIN_INTERVAL','3.7'))  # 3.7s = home-IP burst limit; Toolforge sets MIN_INTERVAL=1.0 (60 req/min, polite serial ceiling; maxlag+Retry-After backoff still protect)
def _pace_request():
    with _req_lock:
        dt=time.time()-_last_req[0]
        if dt < _MIN_INTERVAL: time.sleep(_MIN_INTERVAL-dt)
        _last_req[0]=time.time()

def _backoff(exc, attempt):
    # honor Retry-After on 429/503; else gentle progressive backoff (not a flat 12s)
    ra=None
    try: ra=exc.headers.get('Retry-After')
    except Exception: ra=None
    time.sleep(float(ra) if (ra and str(ra).isdigit()) else min(1.5+attempt, 8))

def api(params, post=False, tries=8):
    for a in range(tries):
        _pace_request()
        try:
            if post: req=urllib.request.Request('https://fa.wikipedia.org/w/api.php',data=urllib.parse.urlencode(params).encode(),headers={'User-Agent':UA})
            else: req=urllib.request.Request('https://fa.wikipedia.org/w/api.php?'+urllib.parse.urlencode(params),headers={'User-Agent':UA})
            return json.load(urllib.request.urlopen(req,timeout=55))
        except Exception as e:
            if a==tries-1: raise
            _backoff(e, a)
def parse_fresh(wt, title):
    return api({'action':'parse','contentmodel':'wikitext','text':wt,'prop':'text','format':'json','formatversion':'2','title':title}, post=True)['parse']['text']

_DIGITS=str.maketrans('۰۱۲۳۴۵۶۷۸۹','0123456789')  # module reports positional keys in Persian digits; wikitext may use Latin
def _numkey(s): return s.translate(_DIGITS)
EMPTY_NAME_FLAG='(empty string)'  # verbatim-en CS1 placeholder shown for a stray `|=` (empty parameter name)
def _canon(s):  # match wikitext key to the module's DISPLAYED name: it shows _ as space and Persian digits as Latin
    return re.sub(r'\s+',' ', s.replace('_',' ').translate(_DIGITS)).strip()

def flagged_params(html):
    named=set(); pos=set()
    for span in re.findall(r'<span class="cs1-visible-error[^"]*">\s*یادکرد پارامتر ناشناختهٔ خالی دارد.*?</span>', html, re.S):
        for pm in re.findall(r'<code class="cs1-code">(?:&#124;|\|)([^=<]+)=</code>', span):  # pipe renders as entity OR literal
            pm=pm.strip()
            # positional keys -> Latin digits ('|3=' vs «۳»); named keys -> canonical (module shows _ as space, Persian digits as Latin)
            (pos.add(_numkey(pm)) if re.fullmatch(r'[۰-۹0-9]+',pm) else named.add(_canon(pm)))
    return named, pos

def find_cite_templates(text):
    spans=[]; i=0; n=len(text)
    while True:
        j=text.find('{{', i)
        if j<0: break
        head=text[j+2:j+40]; mn=re.match(r'\s*([^\|\}\n]+)', head)
        name=(mn.group(1).strip() if mn else ''); namel=name.lower().replace('_',' ').strip()
        is_cite=((name.startswith('یادکرد') and name!='یادکرد-ویکی') or namel.startswith('cite') or namel=='citation')
        if is_cite:
            depth=0; k=j
            while k<n-1:
                two=text[k:k+2]
                if two=='{{': depth+=1; k+=2; continue
                if two=='}}':
                    depth-=1; k+=2
                    if depth==0: break
                    continue
                k+=1
            spans.append((j,k)); i=k
        else: i=j+2
    return spans

def split_top_pipes(inner):
    parts=[]; buf=''; depth=0; i=0; n=len(inner)
    while i<n:
        two=inner[i:i+2]
        if two in ('{{','[['): depth+=1; buf+=two; i+=2; continue
        if two in ('}}',']]'): depth-=1; buf+=two; i+=2; continue
        if inner[i]=='|' and depth==0: parts.append(buf); buf=''; i+=1; continue
        buf+=inner[i]; i+=1
    parts.append(buf); return parts

def arg_named(arg):
    depth=0
    for idx,ch in enumerate(arg):
        if arg[idx:idx+2] in ('{{','[['): depth+=1
        elif arg[idx:idx+2] in ('}}',']]'): depth-=1
        elif ch=='=' and depth==0: return (arg[:idx].strip(), arg[idx+1:])
    return None

def _strip_nested(text, fnamed, fpos):
    """Strip empty flagged params from any cite templates NESTED inside `text` (e.g. a full
    citation placed in another cite's عنوان= value). Rebuilds right-to-left so spans stay valid."""
    spans=find_cite_templates(text); removed=[]
    for (a,b) in sorted(spans, key=lambda x:-x[0]):
        nc,rem=strip_template(text[a:b], fnamed, fpos)
        if rem: text=text[:a]+nc+text[b:]; removed+=rem
    return text, removed

def strip_template(tpl, fnamed, fpos):
    inner=tpl[2:-2]; parts=split_top_pipes(inner); name=parts[0]; args=parts[1:]; removed=[]; kept=[]
    for arg in args:
        arg,rem=_strip_nested(arg, fnamed, fpos)   # handle citations nested inside this arg's value
        removed+=rem
        nm=arg_named(arg)
        if nm:
            key,val=nm
            # empty-NAMED param: a stray `|=` (empty key) renders as the module's «(empty string)» placeholder
            empty_name = (key=='' and EMPTY_NAME_FLAG in fnamed)
            if val.strip()=='' and (_canon(key) in fnamed or empty_name or (re.fullmatch(r'[۰-۹0-9]+',key) and _numkey(key) in fpos)):
                removed.append('|'+key+'='); continue
            kept.append(arg)
        else:
            if arg.strip()=='' and fpos:   # empty bare positional; only when article flags a positional
                removed.append('|<pos>'); continue
            kept.append(arg)
    if not removed: return tpl, []
    return '{{'+'|'.join([name]+kept)+'}}', removed

def cite_core(html):
    """text of each <cite>, with ALL cs1 spans removed -> the real citation content"""
    out=[]
    for c in re.findall(r'<cite\b[^>]*>(.*?)</cite>', html, re.S):
        c=re.sub(r'<span class="cs1-[^"]*">.*?</span>','',c,flags=re.S)
        c=re.sub(r'<[^>]+>','',c); out.append(re.sub(r'\s+',' ',c).strip())
    return out

def process(title):
    rev=api({'action':'query','prop':'revisions','rvprop':'content|ids|timestamp','rvslots':'main','titles':title,'format':'json','formatversion':'2'})['query']['pages'][0]['revisions'][0]
    wt=rev['slots']['main']['content']
    spans=find_cite_templates(wt)
    if not spans:
        return dict(title=title, note='no-citations', changed=False)
    cites=[wt[a:b] for (a,b) in spans]
    # The empty-unknown-param error is SELF-CONTAINED per citation, so parse ONLY the
    # citations (cheap) rather than the whole article (expensive server-side parse).
    h0=parse_fresh('\n\n'.join(cites), title)
    fnamed,fpos=flagged_params(h0)
    if not fnamed and not fpos:
        return dict(title=title, note='no-flagged-params-detected', changed=False)
    newcites=[]; removed=[]
    for c in cites:
        nc,rem=strip_template(c, fnamed, fpos)
        newcites.append(nc); removed+=rem
    if not removed:
        return dict(title=title, note='flagged-but-nothing-removed', changed=False)
    h1=parse_fresh('\n\n'.join(newcites), title)
    core_same = cite_core(h0)==cite_core(h1)             # citation content identical except cleared error
    n0,p0=flagged_params(h0); n1,p1=flagged_params(h1)
    err_cleared = (not n1 and not p1)
    err_reduced = (len(n1)+len(p1)) < (len(n0)+len(p0))
    gate_pass = core_same and err_reduced
    newwt=wt                                              # apply the strips back into the full wikitext, right-to-left
    for (a,b),nc in sorted(zip(spans,newcites), key=lambda x:-x[0][0]):
        newwt=newwt[:a]+nc+newwt[b:]
    return dict(title=title, changed=True, removed=Counter(removed), core_same=core_same,
                err_cleared=err_cleared, err_reduced=err_reduced,
                residual=(sorted(n1),sorted(p1)), gate_pass=gate_pass,
                newwt=newwt, base_revid=rev['revid'], base_timestamp=rev['timestamp'])

import os, random, http.cookiejar
ROOT='/Users/baqer/dev/homelab/wikipedia'
def _load_env():
    for line in open(os.path.join(ROOT,'.env')):
        m=line.strip()
        if '=' in m and not m.startswith('#'):
            k,v=m.split('=',1); os.environ.setdefault(k,v)
_cj=http.cookiejar.CookieJar(); _op=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(_cj))
def wcall(params, post=None):
    params.setdefault('format','json'); params.setdefault('formatversion','2')
    data=urllib.parse.urlencode(post).encode() if post else None
    req=urllib.request.Request('https://fa.wikipedia.org/w/api.php?'+urllib.parse.urlencode(params),data=data,headers={'User-Agent':UA})
    for a in range(6):
        _pace_request()
        try: return json.load(_op.open(req,timeout=60))
        except Exception as e:
            if a==5: raise
            _backoff(e, a)
def login():
    # runs under the APPROVED bot account MamouriBot (وظیفه ۵ approved); creds from .env only
    t=wcall({'action':'query','meta':'tokens','type':'login'})['query']['tokens']['logintoken']
    r=wcall({'action':'login'}, post={'lgname':os.environ['WIKIPEDIA_BOT_USERNAME'],'lgpassword':os.environ['WIKIPEDIA_BOT_PASSWORD'],'lgtoken':t})
    assert r['login']['result']=='Success', r
    who=wcall({'action':'query','meta':'userinfo'})['query']['userinfo']['name']
    assert who=='MamouriBot', 'IDENTITY GATE: '+who
    global CSRF; CSRF=wcall({'action':'query','meta':'tokens'})['query']['tokens']['csrftoken']
    print('logged in as', who, flush=True)

SUMMARY='حذف پارامترهای خالی ناشناخته از یادکردها (رفع خطای «پارامتر ناشناختهٔ خالی»)'

def _process_safe(t):
    try: return process(t)
    except Exception as e: return dict(title=t, changed=False, note='exc:%s'%e)

def _write(r, done, results):
    """serial writer (main thread only). Returns 'saved' | 'skip' | 'stale'.
    Uses process()'s already-computed newwt + baserevid guard; no re-processing."""
    t=r['title']
    payload={'title':t,'text':r['newwt'],'summary':SUMMARY,'token':CSRF,'nocreate':'1',
             'baserevid':str(r['base_revid']),'basetimestamp':r['base_timestamp'],'bot':'1','maxlag':'5'}
    for attempt in range(6):
        res=wcall({'action':'edit'}, post=payload)
        code=res.get('error',{}).get('code')
        if code=='badtoken':                           # CSRF token expires mid-run -> refresh session token and retry
            login(); payload['token']=CSRF; continue
        if code=='ratelimited':                        # per-user EDIT throttle (distinct from HTTP 429) -> wait it out
            time.sleep(60); continue
        if code in ('abusefilter-warning','maxlag'):   # ack warning / wait out replica lag, then retry
            time.sleep(5); continue
        break
    if 'error' in res:
        code=res['error']['code']
        if code in ('editconflict','articleexists','nocreate-missing'):  # page changed/gone under us -> safe to skip
            return 'stale'
        print('EDIT-ERR', t, res['error'], flush=True); return 'skip'
    nrev=res['edit'].get('newrevid')
    print('SAVED', t, '-> rev', nrev, flush=True)
    open(done,'a').write(t+'\n')
    open(results,'a').write(f"{t}\t{nrev}\t{'؛'.join(sorted(dict(r['removed'])))}\n")
    return 'saved'

def run(limit=None, dry=True, fast=False, workers=1, namespaces='0', redo=False):
    # SERIAL loop: the fa API rate-limits per IP (~16 req/min burst then a 36s penalty),
    # so concurrency only triggers 429 storms. The global _pace_request() keeps us just
    # under the burst limit; that IP cap — not the code — is the real throughput ceiling.
    # namespaces: pipe/comma-joined ns numbers. Default '0' (articles). A wider sweep can pass
    # e.g. '0|4|10|118' (article/project/template/draft). ns2 (User) is intentionally omitted —
    # editing others' sandboxes is intrusive — and /تمرین,/آزمایشی testcases are skipped below.
    if not dry: _load_env(); login()
    d0=os.path.dirname(os.path.abspath(__file__))
    done=os.path.join(d0,'empty-unknown-params.done.txt'); results=os.path.join(d0,'task5-trial-results.tsv')
    # redo=True ignores the done-file so pages already edited once (but still flagged — e.g. a second
    # residual param, or fixable only after a later bot improvement) get reprocessed. The done-file was
    # a resume aid for the initial ~7k backlog; for keep-clean maintenance the live category is small.
    seen=set() if redo else (set(open(done).read().split('\n')) if os.path.exists(done) else set())
    members=[]; cont=None
    while True:
        p={'action':'query','list':'categorymembers','cmtitle':'رده:خطاهای CS1: پارامترهای نامعلوم خالی','cmlimit':'500','cmnamespace':namespaces.replace(',','|'),'format':'json','formatversion':'2'}
        if cont: p['cmcontinue']=cont
        dd=wcall(p); members+=[m['title'] for m in dd['query']['categorymembers']]
        if 'continue' in dd: cont=dd['continue']['cmcontinue']
        else: break
    todo=[t for t in members if t and t not in seen and not (t.endswith('/تمرین') or t.endswith('/آزمایشی'))]
    print(f'category size: {len(members)}  to-do: {len(todo)}', flush=True)
    saved=skipped=stale=0; _t0=time.time()
    for i,t in enumerate(todo):
        if i and i%25==0:   # heartbeat: prove progress + show rate even during long skip runs
            el=time.time()-_t0
            print(f'HB processed={i}/{len(todo)} saved={saved} skipped={skipped} stale={stale} rate={i/el*60:.1f}/min at={t}', flush=True)
        r=_process_safe(t)
        if not r.get('changed') or not r.get('gate_pass'):
            skipped+=1
        elif dry:
            print('WOULD SAVE', t, dict(r['removed']), 'cleared=%s'%r['err_cleared'], flush=True); saved+=1
        else:
            outcome=_write(r, done, results)
            if outcome=='saved':
                saved+=1
                if not fast: time.sleep(30+random.random()*90)   # slow mode; fast mode relies on the global pacer
            elif outcome=='stale': stale+=1
            else: skipped+=1
        if limit and saved>=limit: break
    print(f'DONE saved={saved} skipped={skipped} stale={stale}', flush=True)

if __name__=='__main__':
    import sys
    dry = '--run' not in sys.argv
    fast = '--fast' in sys.argv
    lim = None; wk = 1; ns = '0'; redo = '--all' in sys.argv
    for a in sys.argv:
        if a.startswith('--limit='): lim=int(a.split('=')[1])
        if a.startswith('--workers='): wk=int(a.split('=')[1])
        if a.startswith('--ns='): ns=a.split('=',1)[1]
    run(limit=lim, dry=dry, fast=fast, workers=wk, namespaces=ns, redo=redo)
