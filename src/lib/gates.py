#!/usr/bin/env python3
"""Publish gates for fa.wikipedia wikitext — the shared, project-agnostic battery.

WHY THIS EXISTS
---------------
Every check below corresponds to a defect that shipped to a live page at least
once, and in several cases shipped again AFTER being written down as a lesson:
the em dash was corrected three times, `[[رمل]]` went out twice after
remediation, `{{بت}}` shipped in two distinct variants across ~30 navboxes.

The pattern in the lessons corpus is blunt: a rule kept as prose recurs, and
the same rule promoted to an assert stops recurring. Instructions are advisory
and get skipped under load; a check in code does not.

What unites these defects is that **none of them raises an error.** No CS1
error, no cite error, no Lua error, no tracking category, no red link. Several
render perfectly and are simply wrong — a blue link to the wrong subject, a
citation whose page number silently vanished, a template printed as literal
text. They cannot be found by testing; only by a gate that knows to look.

The Hafez pipeline (`scripts/hafez/hafezlib.py`) grew the first version of
this battery. These are the checks that are not specific to that project,
extracted so any one-off script can import them instead of rediscovering the
defect. Project-specific audits stay with their project.

USAGE
-----
    import sys; sys.path.insert(0, 'scripts/lib')
    from gates import check_wikitext

    problems = check_wikitext(title, text)
    if problems:
        raise SystemExit('GATE FAILED:\\n  - ' + '\\n  - '.join(problems))

Each audit returns a list of offending snippets (empty = clean), so callers can
gate, warn, or report as they choose. Nothing here touches the network unless
you pass an `api` callable.
"""

from __future__ import annotations

import re

# --------------------------------------------------------------------------
# template-call parsing
# --------------------------------------------------------------------------

#: Regions whose contents the parser does not read as wikitext. A template call
#: inside one of these is display text, not a transclusion.
_OPAQUE_RE = re.compile(
    r'<!--.*?-->'
    r'|<nowiki\b[^>]*>.*?</nowiki\s*>'
    r'|<pre\b[^>]*>.*?</pre\s*>'
    r'|<source\b[^>]*>.*?</source\s*>'
    r'|<syntaxhighlight\b[^>]*>.*?</syntaxhighlight\s*>'
    r'|<templatedata\b[^>]*>.*?</templatedata\s*>'
    r'|<graph\b[^>]*>.*?</graph\s*>'
    r'|<timeline\b[^>]*>.*?</timeline\s*>',
    re.S | re.I,
)


def mask_opaque(text: str, filler: str = '\x00') -> str:
    """Return a copy of `text` with parser-opaque regions overwritten.

    The copy is the SAME LENGTH as the input, so every offset found by scanning
    it is a valid offset into the original. That is the whole point: a scanner
    that strips these regions instead of masking them reports offsets into a
    shortened string, and splicing at them corrupts the page.

    Newlines are preserved so line-oriented checks still see the right shape.

    Every scanner that reads wikitext needs this. A commented-out template is
    not a transclusion, and treating it as one means "fixing" or removing text
    the reader never sees — the failure recorded in
    lessons/wikitext-and-params/alias-precedence-and-comment-opaque-parsing.md
    and, at 5,000-edit scale, in
    lessons/scripts-and-batch/unclosed-comment-audit-after-5k-edits.md.
    """
    out = list(text)
    for m in _OPAQUE_RE.finditer(text):
        for k in range(m.start(), m.end()):
            if out[k] != '\n':
                out[k] = filler
    return ''.join(out)


def iter_template_calls(text: str, name: str | None = None,
                        top_level_only: bool = False, mask: bool = False):
    """Yield (start, end, template_name, [raw_args]) for each template call.

    Brace-depth aware, so a nested call inside an argument does not end the
    outer one. Written because the naive `\\{\\{X\\|[^}]*\\}\\}` shape has bitten
    this repo twice: `[^}]*` matches across NEWLINES and swallows the following
    template, and a value-capture regex eats the closing braces of an inline
    template. Do not replace this with a one-line regex.

    `top_level_only=True` yields only calls at page depth 1. By default the scan
    restarts just inside each call it finds, so a template nested in another
    template's argument is yielded too — correct for auditing, wrong for editing:
    excising a `{{X-خرد}}` that sits inside `{{جعبه اطلاعات}}` edits the
    infobox's argument, not the page's stub tag.

    `mask=True` ignores calls inside comments, <nowiki> and the other
    parser-opaque regions. Offsets remain offsets into the ORIGINAL `text`, so
    the caller can splice directly.
    """
    scan = mask_opaque(text) if mask else text
    i, n = 0, len(scan)
    while i < n:
        j = scan.find('{{', i)
        if j < 0:
            return
        # Structural decisions read `scan` (so masked regions are invisible);
        # captured characters come from `text`, so a name or argument is never
        # contaminated by filler. Both strings have the same length by
        # construction, so one index is valid in both.
        depth, k, parts, cur = 0, j, [], []
        while k < n:
            if scan.startswith('{{', k):
                depth += 1
                if depth > 1:
                    cur.append('{{')
                k += 2
                continue
            if scan.startswith('}}', k):
                depth -= 1
                if depth == 0:
                    parts.append(''.join(cur))
                    k += 2
                    break
                cur.append('}}')
                k += 2
                continue
            if scan[k] == '|' and depth == 1:
                parts.append(''.join(cur))
                cur = []
                k += 1
                continue
            cur.append(text[k])
            k += 1
        else:
            return  # unclosed
        if parts:
            tname = parts[0].strip()
            if name is None or tname == name:
                yield j, k, tname, parts[1:]
        # Restarting just inside the call descends into its arguments; skipping
        # past it keeps the scan at page depth 1.
        i = k if top_level_only else j + 2


# --------------------------------------------------------------------------
# generic wikitext audits
# --------------------------------------------------------------------------

def audit_braces(text: str, title: str = ''):
    """Every template-ish brace run must be exactly 2. Catches 1, 3 and 4 alike.

    A single brace is the f-string signature: building wikitext with
    `f"{{یادکرد}}"` halves every `{{` so the template never expands and prints
    as body text — 21 dead templates shipped this way, including a whole
    کتاب‌نامه, with no CS1/cite/tracking-category signal. Three braces is the
    unexpanded-parameter leak (`{{{1}}}`) and the over-eager repair regex that
    promotes a correct `{{x}}`.

    In Template namespace a TRIPLE brace is the point of the page - `{{{inline|}}}`
    is how a wrapper forwards a parameter - so three is allowed there.

    Module namespace is NOT wikitext at all: it is Lua, where `local p = {` and
    `["x"] = {}` are ordinary syntax. The whole check is meaningless there.
    """
    ns = title.split(':', 1)[0] if ':' in title else ''
    if ns in ('پودمان', 'Module'):
        return []
    tpl_ns = ns in ('الگو', 'Template')
    # `<templatedata>` holds JSON, where `{` and `}` are the syntax, and <nowiki>/<pre>
    # hold literal examples. Masking them is what `mask_opaque` is for; not calling it
    # made every ported template with a TemplateData block fail on `"params": {}`.
    text = mask_opaque(text)
    bad = []
    for m in re.finditer(r'(\{+)\s*([^\s{}|=\[\]]+)', text):
        n, nm = len(m.group(1)), m.group(2)
        if n == 2 or nm.startswith('{'):
            continue
        if n == 3 and tpl_ns:
            continue
        bad.append((n, nm))
    return bad


def audit_broken_file_link(text: str):
    """Flag a File/Image link that a link sweep has mangled.

    Two shapes, both of which print the image's OPTIONS as body text instead of showing
    the image, and neither of which raises an error or changes any bracket count:

      * `[[:en:File:X.svg|20px|link=Y]]` — an :en: prefix makes it an interwiki to the
        file's DESCRIPTION page, so MediaWiki stops parsing `20px`/`link=` as options.
      * `20px|link=Y` with no enclosing brackets — what is left after a sweep strips the
        `[[پرونده:…]]` wrapper it mistook for an ordinary wikilink.

    Both shipped from this repo: the first across 9 Adjacent-stations modules, the second
    across the Toronto one, where it broke every line name-plate icon. A dead-link sweep
    must exclude the File/Image/پرونده and Category/رده namespaces.
    """
    bad = []
    for m in re.finditer(r'\[\[\s*:[a-z-]{2,12}\s*:\s*(?:File|Image|پرونده)\s*:', text, re.I):
        bad.append(text[m.start():m.start() + 48])
    for m in re.finditer(r'(?<!\|)(?<!\[)\b\d{1,3}px\s*\|\s*link\s*=', text):
        seg = text[max(0, m.start() - 60):m.start()]
        if '[[' not in seg.rsplit(']]', 1)[-1]:
            bad.append(text[m.start():m.start() + 48])
    return bad


def audit_whitespace_tail(text: str):
    """Flag blank-line damage left behind by a splice.

    Any task that removes a whole line can strand a blank tail, open the page
    with a blank line, or leave a three-blank-line gap where two elements used to
    sit. None of it raises an error, none of it shows in a tracking category, and
    it renders almost invisibly — but it lands in every diff the batch produces
    and reads as carelessness on thousands of pages.

    Generic on purpose: it belongs to the act of splicing, not to any one task.

    Deliberately NOT checked here: trailing spaces at the end of a line. They
    are pre-existing noise in ordinary article wikitext — 6 of 12 random
    fa articles have them — so gating on it would block half of every batch for
    a condition the edit did not create. A gate that fires on things the caller
    cannot fix is a gate the next person switches off, which is the failure this
    module's own test fixtures exist to prevent. The three checks below fired on
    0 of those 12.
    """
    bad = []
    if text.endswith('\n\n'):
        bad.append('صفحه با سطر خالی پایان می‌یابد')
    if text.startswith('\n'):
        bad.append('صفحه با سطر خالی آغاز می‌شود')
    if '\n\n\n\n' in text:
        bad.append('سه سطر خالی پشت سر هم')
    return bad


def audit_comments(text: str) -> bool:
    """True when <!-- --> are balanced. An unclosed comment eats real params."""
    return text.count('<!--') == text.count('-->')


def audit_signature(text: str):
    """`~~~~` anywhere means MediaWiki will bake a signature into the page.

    Two ways in: typing it, and — the one that actually happened — deleting a
    Routemap label between two `~~` separators, which collapses them into
    `~~~~` and lands `Mamouri (بحث) …` inside the template. When removing a
    label slot, drop one adjacent `~~` or replace the slot with `~~ ~~`.
    """
    return ['~~~~'] if '~~~~' in text else []


def audit_dashes(text: str):
    """Flag the LONG em dash «—» (U+2014).

    Persian does have a خط تیره — used in pairs for a جملهٔ معترضه, for ranges,
    for compounds, in dialogue and lists — but the Persian mark is the SHORT
    dash, not the long English one. U+2014 is itself the English-habit tell.
    Restructure, or use کمانک ( ), a colon, «؛», or the short dash.

    The en dash «–» is NOT flagged: correct in numeric ranges («۱۸۵۸–۱۸۶۴»),
    name compounds («قزوینی–غنی») and wikilink titles.

    An em dash inside a link TARGET is not flagged either, for the same reason
    the en dash is exempt in titles: it is not a style choice but part of the
    page's actual name. `[[DuPont—Lakeland Line|…]]` is how en spells that
    article, and "correcting" the dash turns a working link into a red one.
    Only the DISPLAY side of a piped link, and running prose, are judged.
    """
    # Parser-opaque regions first: an em dash inside posted SOURCE CODE on a
    # bot-task subpage is a comment in English, not an English habit in Persian
    # prose, and rewriting working code to satisfy a prose rule is the wrong fix.
    masked = re.sub(r'\[\[([^\]|]*)(\||\]\])',
                    lambda m: '[[' + m.group(1).replace('—', ' ') + m.group(2),
                    mask_opaque(text))
    return [text[max(0, m.start() - 45):m.start() + 45].replace('\n', ' ')
            for m in re.finditer('—', masked)]


#: U+0654 ARABIC HAMZA ABOVE, the ezafe mark that rides on a final ه («خانهٔ من»)
_EZAFE_HAMZA = 'ٔ'
#: word-final = followed by a space, ZWNJ, punctuation, a bracket, or the end
_HAMZA_TITLE_RE = re.compile('ه' + _EZAFE_HAMZA + r'(?=$|[\s‌،؛/()\[\]|])')


def audit_hamza_title(title: str):
    """fa's naming policy disallows a word-final «هٔ» in a TITLE.

    وپ:قواعد نام‌گذاری § نویسه‌های غیرمجاز. «منطقهٔ حمل‌ونقل …» must be
    «منطقه حمل‌ونقل …». The ezafe hamza is correct and expected in the BODY; it
    is only the title that may not carry it.

    This is invisible to every other check. The page is created, renders fine,
    and is then quietly MOVED by another editor — which is how it was first met
    here, as a rename campaign over the Hafez ghazals
    (`scripts/archive/follow_article_moves.py`) that looked like one editor's
    taste rather than the policy it actually was. The cost is not the move: it
    is that every langlink, navbox cell and data-module entry still names the
    old title, so a sitelink resolves to a page that no longer exists and the
    link goes red with nothing reporting it.

    Only the title is judged, so a body full of correct ezafe hamzas is fine.
    """
    return [title] if _HAMZA_TITLE_RE.search(title) else []


def audit_harakat_title(title: str):
    """fa AbuseFilter 89 «اعراب‌گذاری در عنوان» DISALLOWS harakat in a TITLE.

    A disallow, not a warn, so the re-submit trick does nothing. Strip the
    vowel marks from the title and keep them in the body. Invisible to every
    body-text and rendered-HTML gate, so it surfaces only as a mid-batch write
    error after siblings have already shipped.
    """
    return [title] if re.search(r'[ً-ْٰ]', title) else []


_REF_TAG = re.compile(r'<ref(\s[^>]*?)?(/?)>', re.I)


def _ref_name(attrs: str | None):
    """The `name` attribute of a <ref> tag, in any of the three quotings."""
    m = re.search(r'\bname\s*=\s*(?:"([^"]*)"|\'([^\']*)\'|([^\s"\'<>/]+))',
                  attrs or '', re.I)
    if not m:
        return None
    return (m.group(1) or m.group(2) or m.group(3) or '').strip() or None


def audit_orphan_refnames(text: str):
    """`<ref name="X"/>` reuse whose `<ref name="X">…</ref>` definition is absent.

    The failure mode of every split, section move and table re-sort: the reuse
    travels, the definition stays behind, and the new page renders a red
    «خطای یادکرد: برچسب <ref> نامعتبر؛ متنی برای یادکردهای با نام X وارد نشده
    است». Wikitext that was valid as one page is invalid the moment it is cut,
    so nothing upstream of the split can catch this — the cut itself creates it.

    Found on فهرست کشته‌شدگان خیزش ۱۴۰۴ ایران: 223 of 224 reuses in the table
    resolve to a definition in a DIFFERENT row, up to 581 rows away.
    """
    defined, used = set(), {}
    for m in _REF_TAG.finditer(text):
        nm = _ref_name(m.group(1))
        if not nm:
            continue
        if m.group(2):          # self-closing -> a reuse
            used.setdefault(nm, True)
        else:                   # has a body -> a definition
            defined.add(nm)
    return sorted(nm for nm in used if nm not in defined)


def audit_dup_refnames(text: str):
    """Two <ref name="X"> definitions whose CONTENT differs.

    MediaWiki keeps the first and silently discards the rest, so a page number
    vanishes. The footnote-marker count does not change.
    """
    seen, bad = {}, []
    for m in re.finditer(r'<ref\s+name\s*=\s*"([^"]+)"\s*>(.*?)</ref>', text, re.S):
        nm, body = m.group(1), m.group(2).strip()
        if nm in seen and seen[nm] != body:
            bad.append(nm)
        seen.setdefault(nm, body)
    return sorted(set(bad))


# --------------------------------------------------------------------------
# link-shape audits
# --------------------------------------------------------------------------

def audit_positional_after_named(text: str, templates=('بت', 'پیوند میان‌زبانی', 'ill')):
    """A bare positional arg written AFTER `1=` silently OVERWRITES argument 1.

    MediaWiki numbers unnamed args independently of named ones and the later
    definition of a key wins, so
        {{بت|1=فهرست دسرهای ترکی|en=List of Turkish desserts|ترکی}}
    renders `[[ترکی]]` — a blue link to an unrelated article or a dab page,
    with no error, no tracking category and often no red link. It reached ~30
    generated navboxes before a human noticed, and a second variant existed.
    Correct form: write the display label as an explicit `2=`.
    """
    bad = []
    for start, _end, tname, args in iter_template_calls(text):
        if tname not in templates:
            continue
        seen_named_1 = False
        for a in args:
            key = a.split('=', 1)[0].strip() if '=' in a else None
            if key in ('1', '۱'):
                seen_named_1 = True
            elif key is None and a.strip() and seen_named_1:
                bad.append('{{%s|…|%s}}' % (tname, a.strip()[:40]))
        # A PERSIAN-DIGIT «۱=» is not parameter 1: MediaWiki matches param names
        # byte-literally, so this leaks a literal `[[{{{1}}}]] []` with nothing
        # to grep in the source (the braces only exist after expansion).
        if any((a.split('=', 1)[0].strip() if '=' in a else None) == '۱' for a in args):
            bad.append('{{%s}} uses Persian-digit «۱=», which is NOT parameter 1' % tname)
    return bad


def audit_en_interwiki_persian(text: str):
    """`[[:en:<persian title>]]` — a dead interwiki no red-link check can see.

    Produced by a porter that `:en:`-prefixes a target which is ALREADY a fa
    article title. An interwiki is never red, raises no error class and lands
    in no tracking category, so nothing but this assert sees it.
    """
    # Masked: a bot-task code subpage (کاربر:MamouriBot/کد/وظیفه N) posts source
    # whose STRING LITERALS contain example links. Inside <syntaxhighlight> they
    # are display text, not links — see
    # lessons/wikitext-and-params/extension-tag-content-not-expanded.md
    return [m.group(0)[:60] for m in
            re.finditer(r'\[\[:en:[^\]|]*[؀-ۿ][^\]|]*', mask_opaque(text))]


#: `زبان=` values that mean the cited work is in Persian. Anything else — `en`,
#: `fr`, `ar`, `english` — means the citation describes a foreign-language
#: source, and its title, publisher and place are *supposed* to be in that
#: language.
_FA_LANG = {'fa', 'fa-ir', 'per', 'fas', 'فارسی', 'پارسی', 'فا'}


def _foreign_citation_spans(text: str):
    """Spans of `{{یادکرد …}}` calls that declare a non-Persian `زبان`.

    A Latin link label inside one of these is correct and must not be reported:
    `|دانشنامه=[[دانشنامه اسلام|Encyclopaedia of Islam]]` in a `زبان=en`
    citation links the fa article while printing the work's real title, which is
    exactly what a citation to an English source should do. Flagging it sent a
    true-positive-looking report about two already-correct articles.

    Conditioned on `زبان` rather than on the parameter name: `|عنوان=` holding
    an English label in a citation to a *Persian* source really is residue, so
    the exemption has to be evidence-based and stay narrow.
    """
    spans = []
    for s, e, name, args in iter_template_calls(text, mask=True):
        if not (name or '').startswith('یادکرد'):
            continue
        for a in args:
            k, sep, v = a.partition('=')
            if sep and k.strip() == 'زبان':
                if v.strip().lower() not in _FA_LANG:
                    spans.append((s, e))
                break
    return spans


def audit_latin_display_label(text: str):
    """`[[سارکاندرا|Sarcandra]]` — Persian target, Latin display text.

    The link is BLUE, so no red-link check, no tracking category and no error
    class ever fires, yet the reader still reads English on a Persian article.
    This is the classic porting residue: the target got localized and the label
    did not.

    Deliberately NOT flagged, because they are nomenclature rather than words
    the reader is meant to read as English:
      - botanical/zoological author abbreviations: «R.Br.», «Sw.», «L.»,
        «J.R.Forst. & G.Forst.» — standard-form citation of the naming authority
      - a label that is only digits, punctuation or a roman numeral
      - anything inside a `{{یادکرد …}}` call that declares a non-Persian
        `زبان`: there the Latin IS the source's own title, see below
    """
    AUTHOR = re.compile(r'^[A-Z][A-Za-z.\'’\- ]*\.$|^[A-Z][A-Za-z.\-]*\.?'
                        r'(\s*&\s*[A-Z][A-Za-z.\-]*\.?)+$')
    #: a Category's second field is a SORT KEY and a File's fields are options, not
    #: display text — Latin in either is correct and must not be reported. A link to a
    #: Template or Module is the same: `[[الگو:Amtrak Lincoln Service|Amtrak Lincoln
    #: Service]]` displays the page's actual name, which IS English.
    NOT_A_LABEL = re.compile(r'^\s*(?:رده|Category|پرونده|File|Image|الگو|Template|'
                             r'پودمان|Module|کاربر|User|'
                             r'بحث کاربر|User talk)\s*:', re.I)
    out = []
    foreign = _foreign_citation_spans(text)
    # Masked for the same reason as audit_en_interwiki_persian: example links in
    # posted source code are not links.
    for m in re.finditer(r'\[\[([^\]\|\n]+)\|([^\]\n]+)\]\]', mask_opaque(text)):
        if any(s <= m.start() < e for s, e in foreign):
            continue                      # source's own title, correctly Latin
        target, label = m.group(1).strip(), m.group(2).strip()
        if not re.search(r'[؀-ۿ]', target):
            continue                      # target is not a Persian title
        if NOT_A_LABEL.match(target):
            continue
        # A label that IS markup is not display text: a route badge is
        # `[[متروی آمستردام|<span style="color:#fff;…">■</span>]]`, where the only Latin is
        # the CSS. Strip the tags and judge what is left — but a SHORT UPPERCASE code left
        # inside such a badge («HC» for Heritage Corridor, «MDN» for Milwaukee District
        # North) is the route's own designation, printed on the badge by design.
        # A plain label is still flagged: `[[درایو فرکانس-متغیر|VVVF]]` has no markup and
        # really does leave English in the reader's way.
        # A COMPUTED label cannot be judged from the wikitext at all: what
        # `{{#if:{{{4|}}}|<span …>T1</span>}}` displays depends on the caller, and the only
        # Latin in it is CSS. The render audit is the right tool for those; this check is
        # for a literal label.
        if '{{' in label:
            continue
        styled = '<' in label
        label = re.sub(r'<[^>]*>', '', label)
        if styled and re.fullmatch(r'[A-Z0-9]{1,4}', label.strip()):
            continue
        bare = label.strip("'’\" ")
        if not bare or re.search(r'[؀-ۿ]', bare):
            continue                      # label already has Persian
        if not re.search(r'[A-Za-z]', bare):
            continue                      # digits/punctuation only
        if AUTHOR.match(bare):
            continue                      # naming authority, keep Latin
        out.append(m.group(0)[:60])
    return out


# --------------------------------------------------------------------------
# citation audits
# --------------------------------------------------------------------------

def audit_bare_pak(text: str):
    """fa's `{{پک}}` is NOT en's `{{sfn}}` — it emits only the short-citation
    TEXT and must be wrapped in `<ref>…</ref>`.

    Unwrapped, the citation prints into the running prose while CS1, the error
    classes, cite errors, tracking categories and CITEREF anchor resolution all
    still pass. A NAMED opening tag counts as wrapped — `<ref name="x">{{پک|…}}`
    is the right shape when one page is cited from several places, and an
    exact-`<ref>` test wrongly rejects it.
    """
    bare = []
    open_tag = re.compile(r'<ref(\s[^>/]*)?>$')
    for m in re.finditer(r'\{\{پک\|', text):
        if not open_tag.search(text[:m.start()].rstrip()):
            bare.append(text[m.start():m.start() + 60])
    return bare


def audit_pak_page_param(text: str):
    """In `{{پک}}` only **`ص=`** exists. `صص=` / `صفحه=` / `صفحات=` are dropped
    SILENTLY — the citation renders normally, minus the page number.

    Also flags a `{{پک}}` with no page parameter at all, which is usually the
    same mistake one step earlier.
    """
    bad = []
    for _s, _e, tname, args in iter_template_calls(text, 'پک'):
        keys = [a.split('=', 1)[0].strip() for a in args if '=' in a]
        wrong = [k for k in keys if k in ('صص', 'صفحه', 'صفحات')]
        if wrong:
            bad.append('{{پک}} uses %s — only «ص=» is read; the page is dropped'
                       % '/'.join(wrong))
        elif 'ص' not in keys:
            bad.append('{{پک}} with no «ص=» page parameter')
    return bad


def audit_cite_web_params(text: str):
    """`{{یادکرد وب}}`'s website parameter is `وبگاه` — NO zero-width non-joiner.

    The natural half-space spellings `وب‌گاه` and `وب‌سایت` are rejected as
    unknown parameters and print a visible «Unknown parameter … ignored» error
    to the reader. A one-character ZWNJ difference is invisible in a diff.
    """
    bad = []
    for _s, _e, tname, args in iter_template_calls(text):
        if not tname.startswith('یادکرد'):
            continue
        for a in args:
            if '=' not in a:
                continue
            k = a.split('=', 1)[0].strip()
            if k in ('وب‌گاه', 'وب‌سایت', 'وبسایت'):
                bad.append('{{%s}} param %r — the accepted name is «وبگاه» (no ZWNJ)'
                           % (tname, k))
    return bad


def audit_url_template(text: str):
    """`{{نشانی}}` is NOT the fa `{{URL}}`.

    It emits a permalink to the CURRENT page and silently ignores its argument.
    Use `{{نشانی وب}}` or `{{وبگاه رسمی}}`.
    """
    return ['{{نشانی}} ignores its argument; use {{نشانی وب}} / {{وبگاه رسمی}}'
            for _s, _e, t, _a in iter_template_calls(text, 'نشانی')]


def audit_lang_template(text: str):
    """`{{به زبان}}` (space) ≠ `{{به‌زبان}}` (ZWNJ) ≠ `{{به <language>}}`.

    The ZWNJ form is the real `{{in lang}}`. `{{به <language>}}` is `{{lang-xx}}`
    and REQUIRES its text argument — a bare `{{به انگلیسی}}` leaks `{{{1}}}` to
    the reader. The SPACE form is a base template needing named
    `پیوند زبان`/`نام زبان` and otherwise prints raw markup.
    """
    bad = []
    for _s, _e, tname, args in iter_template_calls(text):
        if tname == 'به زبان':
            keys = [a.split('=', 1)[0].strip() for a in args if '=' in a]
            if 'پیوند زبان' not in keys or 'نام زبان' not in keys:
                bad.append('{{به زبان}} (space form) without «پیوند زبان»/«نام زبان» '
                           '— did you mean {{به‌زبان}} with a ZWNJ?')
        elif tname.startswith('به ') and not args:
            bad.append('{{%s}} with no text argument leaks {{{1}}} to the reader' % tname)
    return bad


# --------------------------------------------------------------------------
# network-backed audits (pass your own api callable)
# --------------------------------------------------------------------------

def audit_dab_links(text: str, api, batch: int = 40):
    """Wikilinks whose target is a DISAMBIGUATION page.

    A red-link check cannot see these: they are blue, raise no error and carry
    no tracking category, but they send the reader to a list instead of the
    subject. A sweep of one 270-article category found 15 dab targets on 22
    pages.

    Does NOT catch the other half of the family: a link that is blue, not a dab
    page, and still the wrong subject. Only reading the target catches those.

    `api` is any callable taking a params dict and returning the parsed JSON.
    """
    targets = set()
    for m in re.finditer(r'\[\[([^\]|#]+)', text):
        t = m.group(1).strip()
        if t and ':' not in t and not t.startswith('/'):
            targets.add(t)
    bad, tl = [], sorted(targets)
    for i in range(0, len(tl), batch):
        r = api({'action': 'query', 'titles': '|'.join(tl[i:i + batch]),
                 'prop': 'pageprops', 'ppprop': 'disambiguation', 'redirects': '1'})
        for pg in (r.get('query', {}) or {}).get('pages', []) or []:
            if 'disambiguation' in (pg.get('pageprops') or {}):
                bad.append(pg['title'])
    return bad


def audit_missing_templates(text: str, api, batch: int = 40):
    """Template calls whose `الگو:<name>` page DOES NOT EXIST.

    A call to a nonexistent template renders as a RED LINK to the template
    page. Nothing else fires: no error, no tracking category, and the page
    body often looks fine, so it survives a read of the render.

    This is a recurrence, which is why it is code and not prose. The corpus
    already had `redirect-category-template-az-prefix` — "resolve the exact fa
    name, don't guess" — and the same mistake shipped again on a one-line
    redirect page: `{{تغییر مسیر از نام دیگر}}` for what is really
    `{{تغییرمسیر از نام جایگزین}}` (no space in تغییرمسیر, and «جایگزین» not
    «دیگر»). A plausible Persian rendering of an English template name is a
    guess, and guesses in this family are usually wrong.

    Skipped: parser functions (`{{#if:`), magic words, `subst:`/`safesubst:`,
    `{{{param}}}` leftovers, and bare `{{!}}`-style punctuation templates are
    still checked (they exist), but anything beginning with `#` or matching an
    ALL-CAPS magic word is not a template lookup.

    `api` is any callable taking a params dict and returning the parsed JSON.
    """
    MAGIC = re.compile(r'^[A-Z_]+(:.*)?$')
    names = set()
    for _s, _e, name, _args in iter_template_calls(text, mask=True):
        n = (name or '').strip()
        if not n or n.startswith('#') or n.startswith('{'):
            continue
        n = re.sub(r'^(safe)?subst\s*:\s*', '', n, flags=re.I).strip()
        if not n or n.startswith('#') or MAGIC.match(n):
            continue
        if n.startswith(':'):          # {{:Article}} is a page transclusion
            continue
        if ':' in n and n.split(':', 1)[0].strip() in ('الگو', 'Template'):
            n = n.split(':', 1)[1].strip()
        elif ':' in n:                 # another namespace, not a template
            continue
        if n:
            names.add(n)

    bad, nl = [], sorted(names)
    for i in range(0, len(nl), batch):
        r = api({'action': 'query',
                 'titles': '|'.join('الگو:' + n for n in nl[i:i + batch]),
                 'prop': 'info', 'redirects': '1'})
        for pg in (r.get('query', {}) or {}).get('pages', []) or []:
            if 'missing' in pg:
                bad.append(pg['title'])
    return bad


# --------------------------------------------------------------------------
# aggregator
# --------------------------------------------------------------------------

#: audit name -> (callable(text) -> list, message template)
#: fa aliases that take a NUMBER the parser or TemplateStyles must read back.
#: `پک` is NOT among them — it is not a size alias at all; see the audit below.
_PX_ALIASES = ('px', 'پیکسل')


def audit_persian_digit_number(text: str):
    """Persian digits where the parser needs a Latin number, and «پک».

    Measured on fa (2026-10-06), parsing `[[پرونده:X.svg|…|پیوند=]]`:

        14px, 14پیکسل, 14x14px → honoured (14×14)
        ۱۴px, ۱۴پیکسل, ۱۴پک, ۱۴ پیکسل → IGNORED, image renders at NATIVE size

    So a Persian-digit size is silently dropped and a 512px icon lands in a
    heading at full size. There is no error, no tracking category and no
    bracket-count change — the only symptom is the render, and the wikitext
    reads correct to a Persian speaker, which is why it survives review.

    `پک` deserves its own mention: it is not an alias for `px` in any form, so
    `۱۴پک` becomes the image's TOOLTIP («title="۱۴پک"») rather than its size.
    Note `{{پک}}` is a real and unrelated citation template, so only the
    image-size position is judged, never the template call.

    `{{div col|۳}}` fails the same way one layer out: the parameter is pasted
    into the class name, producing `column-count-۳`, which no TemplateStyles
    rule matches, so the list silently renders as a single column.
    """
    masked = mask_opaque(text)
    hits = []
    for m in re.finditer(r'\[\[\s*:?(?:پرونده|تصویر|File|Image)\s*:', masked):
        # Scan this file link's own options only, to its matching `]]`.
        depth, i = 0, m.start()
        while i < len(masked):
            if masked.startswith('[[', i):
                depth += 1; i += 2
            elif masked.startswith(']]', i):
                depth -= 1; i += 2
                if depth == 0:
                    break
            else:
                i += 1
        link = masked[m.start():i]
        # Strip the closing `]]` first, or the LAST option still carries it and
        # `۱۴px]]` fails to match the size pattern — which would silently let
        # the final option, the common place for a size, through the gate.
        for opt in re.sub(r'\]\]\s*$', '', link).split('|')[1:]:
            opt = opt.strip()
            if re.fullmatch(r'[۰-۹٠-٩]+\s*(?:x\s*[۰-۹٠-٩]+)?\s*(?:px|پیکسل|پک)',
                            opt) or re.fullmatch(r'\d+\s*(?:x\s*\d+)?\s*پک', opt):
                hits.append(opt + '  in  ' + link[:60])
    for m in re.finditer(r'\{\{\s*(?:div col|ستون)\s*\|\s*([۰-۹٠-٩]+)\s*[|}]',
                         masked):
        hits.append('{{div col|%s}}' % m.group(1))
    return hits


_TEXT_AUDITS = [
    ('persian_digit_number', audit_persian_digit_number,
     'Persian digits (or «پک») where the parser needs a LATIN number — the '
     'value is SILENTLY IGNORED: an image renders at native size, {{div col}} '
     'collapses to one column. No error, no tracking category: %s'),
    ('braces', audit_braces,
     'brace arity != 2 (single = f-string halving, triple = unexpanded param): %s'),
    ('broken_file_link', audit_broken_file_link,
     'File link mangled by a link sweep — the image options print as body text, '
     'with no error and no bracket-count change: %s'),
    ('signature', audit_signature,
     'signature leak: MediaWiki will bake «Mamouri (بحث) …» into the page: %s'),
    ('dashes', audit_dashes,
     'long em dash «—» (U+2014) — an English habit; restructure or use '
     'کمانک ( ) / a colon / «؛» / the short Persian dash: %s'),
    ('orphan_refnames', audit_orphan_refnames,
     '<ref name=...> REUSE with no definition on this page — a cut, re-sort or '
     'section move left the definition behind, and the page renders a red cite '
     'error: %s'),
    ('dup_refnames', audit_dup_refnames,
     '<ref name=...> defined twice with DIFFERENT content — the later one is '
     'silently discarded and its page number vanishes: %s'),
    ('positional_after_named', audit_positional_after_named,
     'bare positional arg AFTER «1=» overwrites argument 1 — renders a blue '
     'link to the WRONG subject with no error: %s'),
    ('en_interwiki_persian', audit_en_interwiki_persian,
     '[[:en:<persian title>]] is a dead interwiki no red-link check can see: %s'),
    ('latin_display_label', audit_latin_display_label,
     'Persian link target with a LATIN display label — blue, so no red-link '
     'check sees it, but the reader still reads English: %s'),
    ('bare_pak', audit_bare_pak,
     'bare {{پک}} not wrapped in <ref> — the citation prints into the prose '
     'while every automated check still passes: %s'),
    ('pak_page_param', audit_pak_page_param,
     '{{پک}} page parameter problem — only «ص=» is read: %s'),
    ('cite_web_params', audit_cite_web_params,
     'citation param rejected as unknown, printing a visible error: %s'),
    ('url_template', audit_url_template,
     '{{نشانی}} ignores its argument: %s'),
    ('lang_template', audit_lang_template,
     'language-template form leaks raw markup to the reader: %s'),
    ('whitespace_tail', audit_whitespace_tail,
     'blank-line damage left by a splice — invisible in the render, visible in '
     'every diff of the batch: %s'),
]


#: A reply this long has stopped being a reply. The one he accepted ran 317 words.
_REPLY_WORD_CAP = 400
#: Sentence lengths that barely vary read as generated. His accepted reply: 0.68.
_REPLY_MIN_CV = 0.35


def _reply_prose(text: str) -> str:
    """Strip the parts of a reply that are evidence rather than prose.

    Tables and code blocks are not what makes a reply feel long — burying the
    point in paragraphs is — so they must not count toward the word budget or
    distort the sentence-length spread.
    """
    text = re.sub(r'<syntaxhighlight.*?</syntaxhighlight>', ' ', text, flags=re.S | re.I)
    text = re.sub(r'<pre.*?</pre>|<code.*?</code>|<nowiki.*?</nowiki>', ' ', text, flags=re.S | re.I)
    # A wikitable, with or without the leading indent colons.
    text = re.sub(r'^[:*#]*\s*\{\|.*?^[:*#]*\s*\|\}', ' ', text, flags=re.S | re.M)
    text = re.sub(r'\[\[[^\]|]*\|', ' ', text)                       # keep link labels
    text = re.sub(r'<[^>]+>|\[\[|\]\]|\{\{[^{}]*\}\}|~~~~', ' ', text)
    return re.sub(r'\s+', ' ', text).strip()


def audit_talk_reply(text: str):
    """Report furniture and robotic rhythm in a talk-page reply.

    Recorded as prose in lessons/agent-prompts/long-report-when-he-asked-for-the-fix.md
    on 2026-10-04 and corrected AGAIN on 2026-10-05 («too long, remove the
    headlines, make it sound more natural»), so per AGENTS.md it belongs in code:
    an instruction that has already recurred will recur again.

    The decisive signal is a line that is nothing but bold text. On a talk page
    that is a section header in disguise — the exact «report furniture» he has
    now objected to twice. Real `==` headings inside a reply are the same fault,
    and they additionally break the thread.
    """
    problems = []
    for m in re.finditer(r"^[:*#]*\s*'''[^'\n]{2,}'''\s*$", text, re.M):
        problems.append(f'bold-only line (a heading in disguise): {m.group(0).strip()!r}')
    for m in re.finditer(r'^\s*={2,}.+?={2,}\s*$', text, re.M):
        problems.append(f'section heading inside a reply: {m.group(0).strip()!r}')

    prose = _reply_prose(text)
    words = len(prose.split())
    if words > _REPLY_WORD_CAP:
        problems.append(f'{words} words of prose (cap {_REPLY_WORD_CAP}) — cut it, '
                        'or move the evidence to a repo file and name the path once')

    lengths = [len(s.split()) for s in re.split(r'[.؟!؛]', prose) if len(s.split()) >= 3]
    if len(lengths) >= 6:
        mean = sum(lengths) / len(lengths)
        var = sum((n - mean) ** 2 for n in lengths) / (len(lengths) - 1)
        cv = (var ** 0.5) / mean if mean else 0
        if cv < _REPLY_MIN_CV:
            problems.append(f'sentence lengths barely vary (cv={cv:.2f} < {_REPLY_MIN_CV}) — '
                            'reads as generated; let some sentences be short')
    return problems


def check_talk_reply(text: str) -> list[str]:
    """Gate a drafted talk-page reply. Returns problems ([] = clean).

    Separate from `check_wikitext` because the rules invert: a reply MUST carry
    `~~~~`, which on an article page is a defect. Run both — `check_wikitext`
    still catches the em dashes and the markup faults.
    """
    problems = audit_talk_reply(text)
    if '~~~~' not in text:
        problems.append('no ~~~~ — a talk-page reply has to be signed')
    # Colons on a table row or inside <syntaxhighlight> break both, silently.
    for m in re.finditer(r'^[:*#]+\s*(\||!|\|-|\|\})', text, re.M):
        problems.append('indent colons on a table row — only the opening «{|» may '
                        f'carry them, or the table collapses: {m.group(0).strip()!r}')
    body = re.findall(r'<syntaxhighlight[^>]*>(.*?)</syntaxhighlight>', text, re.S | re.I)
    for b in body:
        if re.search(r'^[:*#]+', b, re.M):
            problems.append('indent colons INSIDE <syntaxhighlight> — the content is '
                            'verbatim, so they render as part of the code')
    return problems


def check_wikitext(title: str, text: str, api=None, skip=()) -> list[str]:
    """Run the battery. Returns a list of human-readable problems ([] = clean).

    Deliberately returns rather than raises, so a caller can gate a publish,
    warn during a sweep, or collect across a batch. `skip` takes audit names
    for the rare case where one genuinely does not apply — prefer fixing the
    text over skipping the check.
    """
    problems = []
    for name, fn, msg in _TEXT_AUDITS:
        if name in skip:
            continue
        hits = fn(text, title) if name == 'braces' else fn(text)
        if hits:
            problems.append(msg % (hits[:6],))
    if 'comments' not in skip and not audit_comments(text):
        problems.append('unbalanced <!-- --> comments — an unclosed comment '
                        'silently eats the parameters after it')
    if title and 'harakat_title' not in skip and audit_harakat_title(title):
        problems.append('harakat in the TITLE %r — fa AbuseFilter 89 DISALLOWS '
                        'this (a disallow, so re-submitting does not clear it); '
                        'strip the vowel marks from the title, keep them in the '
                        'body' % title)
    if title and 'hamza_title' not in skip and audit_hamza_title(title):
        problems.append('word-final «هٔ» in the TITLE %r — disallowed by '
                        'وپ:قواعد نام‌گذاری § نویسه‌های غیرمجاز. Use the plain «ه» '
                        'in the title and keep the ezafe hamza in the body; '
                        'otherwise the page gets moved later and every langlink, '
                        'navbox cell and module entry still names the old title'
                        % title)
    if api is not None and 'dab_links' not in skip:
        dab = audit_dab_links(text, api)
        if dab:
            problems.append('link(s) point at a DISAMBIGUATION page — blue, so no '
                            'redlink check sees them: %s' % dab[:6])
    if api is not None and 'missing_templates' not in skip:
        gone = audit_missing_templates(text, api)
        if gone:
            problems.append('template call(s) to a page that DOES NOT EXIST — '
                            'renders as a red link, raises no error: %s' % gone[:6])
    return problems


# --------------------------------------------------------------------------
# CLI — so the TypeScript one-offs use this implementation, not a copy of it
# --------------------------------------------------------------------------
# Most scripts in this repo are .ts, not .py. A second implementation in
# TypeScript would drift from this one, and the corpus already records what
# happens when two copies of the same check disagree. So there is one
# implementation and the TS side shells out to it (see gates.ts).
#
#   echo '{"title":"...","text":"..."}' | python3 scripts/lib/gates.py
#   -> {"problems": ["...", ...]}          exit 1 if any, 0 if clean
#
# The same door serves the brace-aware scanner, so a TS caller that needs to
# LOCATE template calls (rather than audit them) also gets this implementation
# instead of a hand-rolled regex:
#
#   echo '{"mode":"calls","text":"...","top_level_only":true}' | python3 scripts/lib/gates.py
#   -> {"calls": [{"start":0,"end":9,"name":"خرد","args":[]}, ...]}   exit 0

def _cli_calls(payload) -> dict:
    calls = [
        {'start': s, 'end': e, 'name': nm, 'args': args}
        for s, e, nm, args in iter_template_calls(
            payload.get('text', ''),
            name=payload.get('name'),
            top_level_only=bool(payload.get('top_level_only', False)),
            mask=bool(payload.get('mask', True)),
        )
    ]
    return {'calls': calls}


if __name__ == '__main__':
    import json as _json
    import sys as _sys
    try:
        _payload = _json.load(_sys.stdin)
    except Exception as e:  # noqa: BLE001
        print(_json.dumps({'problems': ['gate input was not valid JSON: %s' % e]}))
        _sys.exit(2)
    if _payload.get('mode') == 'calls':
        print(_json.dumps(_cli_calls(_payload), ensure_ascii=False))
        _sys.exit(0)
    _p = check_wikitext(_payload.get('title', ''), _payload.get('text', ''),
                        skip=tuple(_payload.get('skip', ())))
    print(_json.dumps({'problems': _p}, ensure_ascii=False))
    _sys.exit(1 if _p else 0)
