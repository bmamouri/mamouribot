# وظیفهٔ ۱۲: English links left behind by mass imports

Many articles came into fa.wikipedia in bulk imports with links that were never translated.
They point at English titles like `[[Antelope Valley]]`, which are red here, or at interwiki
targets that look blue but go somewhere wrong. This task fixes those links, and red links
whose Persian article exists under a different name.

## Status

- **Approved** for article links (`latin_target`, `persian_digit_target`) in the main namespace.
- **Waiting for review:** red links whose Persian article has another name,
  `{{پیوند با میان‌ویکی}}` and `{{بت}}` calls, citation `*-link` parameters, and templates.
  Posted on the request page with a 97-edit trial (rev 44966592). Until it is approved these
  run only under `--as-me`, in a dry run, or with `LINKFIX_EXTENSION=1`.

Request page: `ویکی‌پدیا:سیاست ربات‌رانی/درخواست مجوز/MamouriBot/وظیفه ۱۲`.

## What it looks for

| kind | example | what happens |
|---|---|---|
| `latin_target` | `[[Antelope Valley]]` | link to the fa article if there is one, else `[[:en:Antelope Valley|دره آنتلوپ]]` |
| `persian_digit_target` | `[[Area code ۳۲۳]]`, red on fa and missing on en | map it to the Latin form first, then the same as above |
| `latin_display` | `[[منطقه زمانی اقیانوس آرام|PST]]` | counted, never changed |
| `{{پیوند با میان‌ویکی}}` / `{{بت}}` | `{{بت|می ۶۸|en=May 68}}`, red | `[[مه ۶۸|می ۶۸]]` when the en title has an fa article |
| citation `*-link` parameter | `|author-link=Gardner, Martin` | `|author-link=مارتین گاردنر` |

`latin_display` is left alone on purpose: the right label depends on the row, and `PST` may be
better left as a symbol (`lessons/persian-conventions/units-persian-name-latin-symbol-bdi.md`).

`{{پیوند با میان‌ویکی}}` is also matched under its redirects `پبم`, `پم`, `Link-interwiki` and
`Pam`.

## How it decides

1. If there is an fa article, link to it.
2. If there is only an en article, use `[[:en:Title|فارسی]]`.
3. If there is neither, leave plain Persian text.

The only evidence accepted for step 1 is a Wikidata link from the en article to an fa
article. Similar names, transliteration and search results don't count. The fa article must
exist, must not be a disambiguation page, and must be on the same Wikidata item as the en page.

The bot never makes up a Persian name. For steps 2 and 3 the name has to be in
`data/names.json`, which I maintain by hand. Otherwise the link is left alone and goes on the
review list.

`data/names.json` sections:

- `fa`: the fa article title
- `en`: a Persian label for an interwiki link
- `plain`: Persian text where no article exists anywhere
- `remap`: a Persian-digit title and its Latin form
- `by_old_display`: `"Target||Old label"` → label, for one target that means two things

### Labels

- **In article text and infoboxes** the label becomes Persian, unless it is already Persian.
- **In citations** the label stays as the source printed it, and only the target changes:
  `[[Prometheus Books]]` → `[[کتاب‌های پرومتئوس|Prometheus Books]]`,
  `[[George O. Abell|Abell, George O.]]` → `[[جرج آبل|Abell, George O.]]`. A citation is a
  `<ref>` or a `{{cite …}}`/`{{یادکرد …}}` whose text is English, or an English line in a
  `{{چپ‌چین}}` block or under a heading like «منابع» or «کتاب‌شناسی». The definition is
  `foreign_text_spans` in `gates.py`, which the publish check also uses. Inside a citation only
  the fa repoint is made; interwiki and plain-text repairs go to review.
- **In template calls** the label is `عنوان=` (or `{{بت}}`'s second parameter) if set,
  otherwise the Persian title the editor wrote in the call.

No English redirects are created. وپ:تغن says non-Persian redirects «عموماً نباید ایجاد
شوند», and this task does not create pages.

### English redirects

A link that reaches its fa article through an en redirect is followed only when the redirect
is clearly the same subject:

- the redirect is an exact `Last, First` reversal of its target (`Gardner, Martin` →
  `Martin Gardner`), or
- it carries a same-subject redirect category: moves, modifications, short, long, full,
  former or alternative names, capitalisation, spelling, diacritics.

Any category saying the subject differs blocks it: possibilities, merges, members, subtopics,
related words, adjectives, eponyms, sections or anchors, ambiguous terms, works, people, or
"connected to a Wikidata item". So does a redirect to a section, and an entry redirecting into
a `List of …`. A redirect with no category goes to review. `Acquanetta Warren` redirects to the
city she is mayor of and is never followed. The rules are `sameSubjectRedirect` in `resolve.ts`.

### `{{بت}}`

I made `{{بت}}` and I am retiring it in favour of `{{پیوند با میان‌ویکی}}`. On a page the bot
is editing for a real fix, every other `{{بت}}` call is replaced too. A page is never edited
only for this, and such edits get their own summary.

| `{{بت}}` | `{{پیوند با میان‌ویکی}}` |
|---|---|
| `{{بت\|X\|en=Y}}` | `{{پیوند با میان‌ویکی\|X\|Y}}` |
| `{{بت\|X\|L\|en=Y}}` | `{{پیوند با میان‌ویکی\|X\|Y\|عنوان=L}}` |

Both render the same article text. `{{پیوند با میان‌ویکی}}` also adds the hidden category
«رده:مقاله‌های دارای پیوند با میان‌ویکی» on articles and a small «(en)» on a template's own page.

### What is left alone

Each of these has a test.

| case | example |
|---|---|
| the call's label and `en=` name two different things | `{{بت\|Walt Disney Records\|en=Hollywood Records}}` |
| the fa article is a disambiguation page | `BA` |
| the en page is missing or a disambiguation page | |
| the Wikidata link outlived the fa article | `جولیا برونلی` |
| the redirect changes the subject | `Homeric` → `هومر` |
| a fa title with Persian digits inside a template | an English `{{cite}}` turns the digits Latin and the link goes red |
| the fa article has the same title as the link | `[[R\|Ʀʀ]]` |
| a link in an untranslated English sentence | `This user is a [[Citizenship\|citizen]] of …` |
| links inside `<nowiki>`, comments and `<pre>` | |
| file, category, project and help links | `[[Template:X\|X]]`, `[[Help:IPA]]` |
| `{{بت}}` with `۲=` or `display=`, which it ignores | |
| `{{بت}}` / `{{پیوند با میان‌ویکی}}` with no en title, nested markup, unknown parameters, a non-en `زبان`, or a title starting with a namespace | `{{بت\|رده:…}}` |
| template documentation and sandbox subpages | `/توضیحات`, `/تمرین`, `/آزمایشی`, `/doc`, `/sandbox`, `/testcases` |

It also does not create or rename pages, reword a label that is already Persian, or edit
modules. English that a template writes out by itself (`{{Representative|cacd|26}}` gives
`Julia Brownley`) cannot be seen in the wikitext and is out of scope.

## Running it

```sh
npx tsx src/tasks/task-12/linkfix.test.ts          # offline tests
npx tsx src/tasks/task-12/templates.test.ts

TARGET_CATEGORY='رده:شهرهای کالیفرنیا' npx tsx src/run.ts linkfix --limit 20
TARGET_TRANSCLUDING='الگو:…'           npx tsx src/run.ts linkfix
TARGET_FILE=/tmp/titles.json           npx tsx src/run.ts linkfix --live --as-me
TARGET_NAMESPACE='0|10' TARGET_FILE=…  npx tsx src/run.ts linkfix --live --as-me
```

Pages are selected through environment variables, because the shell mangles Persian titles
passed as arguments. `TARGET_FILE` takes a JSON list or one title per line.

| variable | effect |
|---|---|
| `TARGET_TITLES`, `TARGET_FILE`, `TARGET_CATEGORY`, `TARGET_TRANSCLUDING` | which pages to read |
| `TARGET_NAMESPACE` | `0` (default) or `0\|10` to include templates |
| `LINKFIX_EXTENSION` | `1` turns on the parts waiting for review for a bot run; `0` turns them off in a dry run, to see exactly what the bot does now |
| `LINKFIX_NAMES` | a different name table for one run |
| `LINKFIX_REPORT` | where the review list goes (default `$BOT_STATE_DIR/linkfix-review.json`) |

Deployment is `toolforge/task-12-linkfix/` (jobs `lf-check`, `lf-dry`, `lf-trial`). When the
extension is approved, set `LINKFIX_EXTENSION=1` in its `run.sh`.

## The review list

Every run writes each target it could not resolve, why, and which pages it was on. I add names
to `data/names.json` and run again.

```sh
python3 -c "import json;r=json.load(open('.state/linkfix-review.json'));\
print(r['review_count']);[print(k,'—',v['reason']) for k,v in list(r['review'].items())[:20]]"
```

The list is a local file, not a page on the wiki.

## Safety checks

- Nothing is written without `--live`.
- Every `:en:` target is checked on en before writing, because an interwiki link to a missing
  page still shows blue. One bad target stops the whole run.
- Every fa target is checked on fa, for existence, disambiguation and Wikidata item.
- Before each save the page is rendered with the change. If content red links would go up,
  the edit is not saved.
- The publish check (`gates.py`) compares how many times each check fires before and after,
  so only problems the edit adds can block it.
- Pacing, maxlag, the stop page, `{{nobots}}` and resuming come from `core.ts`. Under
  `--as-me` the pause between edits is 30–120 seconds.

## Code

| file | what |
|---|---|
| `src/tasks/task-12/linkfix.ts` | the task: page selection, `getTargets`, `repairPage`, edit summaries, the red-link check |
| `src/tasks/task-12/detect.ts` | finding English links in wikitext |
| `src/tasks/task-12/resolve.ts` | deciding where a target goes; redirect rules; en and fa lookups |
| `src/tasks/task-12/rewrite.ts` | rewriting links, labels in citations, the publish check on the diff |
| `src/tasks/task-12/templates.ts` | `{{پیوند با میان‌ویکی}}`, `{{بت}}` and citation `*-link` parameters |
| `src/tasks/task-12/data/names.json` | the hand-maintained name table |
| `src/lib/gates.py` (copy of `scripts/lib/gates.py`) | `foreign_text_spans`, `audit_counts` |
| `src/lib/gates.ts` | `foreignSpans`, `linkContext`, `auditCounts` |
