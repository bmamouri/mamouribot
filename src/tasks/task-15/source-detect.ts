/**
 * وظیفهٔ ۱۵ — "does this article cite anything?", decided from wikitext alone.
 *
 * This is a port of the research prototype (`archive/task-15-research/classify.py`),
 * whose logic is recorded in §12.1 of `docs/task-15-source-tags.md` because the archive
 * is git-ignored and exists on one machine. The field names below deliberately match the
 * prototype's, so `source-detect.replay.ts` can diff this against the 2,000-page
 * measurement in `docs/data/task-15/random-2000.json` page by page. Unit tests would not
 * catch a regex that anchors differently between Python and JavaScript, which is the
 * failure mode `docs/BUILDING-A-TASK.md` §4 warns about for ports.
 *
 * THE ONE THING THIS FILE MUST NEVER DO IS OVERCOUNT ZERO. Everything downstream keys on
 * "no source of any kind": a page that really has a reference but is read as having none
 * gets a {{بدون منبع}} banner that is simply false, and that is the cost the whole task
 * is designed around (§3, asymmetric refusal). So every ambiguous construct is resolved
 * in favour of "this is a source": a line we cannot classify counts, a template we half
 * recognise counts. The render check in the task is the second, independent opinion.
 */

/** Feature counts, named as in the prototype so the two can be diffed directly. */
export interface SourceFeatures {
  /** `<ref` openings, including self-closing reuses */
  refs: number;
  /** paired `<ref>…</ref>` whose body is a real citation */
  refs_real: number;
  /** paired refs whose body is only a یادکرد-ویکی */
  refs_ykw_only: number;
  /** یادکرد-ویکی transclusions anywhere */
  ykw: number;
  /** citation templates OUTSIDE any ref */
  cite_outside: number;
  /** پک / sfn / harv family */
  sfn: number;
  /** http(s) URLs */
  http: number;
  /** bulleted general references under a references-type heading */
  genref_lines: number;
  isbn: boolean;

  // ---- the fields the DECISION uses. The ones above exist to be diffed against the
  // research prototype; these apply the narrower "does it source the content" rule that
  // the مولکول revert established, and they are not comparable with it.
  /** ref bodies that actually support a claim */
  refs_sourcing: number;
  /** citation templates outside refs, minus the non-sourcing ones */
  cite_outside_sourcing: number;
  /** URLs that are not wiki links */
  http_external: number;
  /** general-reference lines that are not just a non-sourcing template */
  genref_sourcing: number;
}

/**
 * Blank a span while keeping every later offset where it was.
 *
 * Length-preserving on purpose: `sourceFeatures` locates `<ref>` tags in one version of
 * the text and reads their bodies out of another, and that only works if the two stay
 * index-for-index aligned.
 */
const blank = (text: string, re: RegExp) =>
  text.replace(re, (m) => ' '.repeat(m.length));

/** Comments are never page content, in any reading. */
const blankComments = (text: string) => blank(text, /<!--[\s\S]*?-->/g);

/**
 * Additionally blank nowiki/pre/syntaxhighlight spans.
 *
 * Used only to find `<ref>` TAGS: a `<ref>` written inside `<nowiki>` renders as visible
 * text and is not a citation. It is deliberately NOT used to read a ref's body — see
 * `sourceFeatures`.
 */
const blankEscaped = (text: string) =>
  blank(
    blank(
      blank(blankComments(text), /<nowiki[^>]*>[\s\S]*?<\/nowiki>/gi),
      /<pre[^>]*>[\s\S]*?<\/pre>/gi),
    /<(syntaxhighlight|source)[^>]*>[\s\S]*?<\/(?:syntaxhighlight|source)>/gi);

/** Every `{{name` in the text, lowercased, `_` normalised to a space. */
export function templateNames(text: string): string[] {
  const out: string[] = [];
  const re = /\{\{\s*([^{}|\n]+?)\s*(?:\||\}\})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push(m[1].replace(/_/g, ' ').trim().toLowerCase());
  return out;
}

const isYadkardWiki = (name: string) =>
  /^(یادکرد-ویکی|یادکرد ویکی|cite wikipedia)$/.test(name);

/**
 * یادکرد … / cite … / citation …, but never یادکرد-ویکی.
 *
 * NOT `\b`. JavaScript's word boundary is defined on `[A-Za-z0-9_]`, so between the «د»
 * of «یادکرد» and the following space there is no boundary at all and `/^یادکرد\b/`
 * matches nothing — while the Python prototype this is ported from matched happily.
 * Every Persian citation template was therefore invisible, and a fully sourced article
 * read as having no sources. The boundary is spelled out instead.
 */
const isCitationTemplate = (name: string) =>
  /^(یادکرد|cite|citation)([\s-]|$)/.test(name) && !isYadkardWiki(name);

/**
 * Cites something, but not the article's CONTENT.
 *
 * `{{یادکرد فرهنگستان}}` is the Academy's approved-terms dictionary: it is a source for
 * what the Persian WORD should be, not for anything the article says. «مولکول»'s only
 * reference was one of these, and the first trial run removed its {{بدون منبع}} on that
 * basis — an edit the operator reverted. 2,441 articles carry it.
 *
 * A reference to another Wikipedia is the same class of non-source and is already
 * excluded as `یادکرد-ویکی`; `WIKI_URL` below catches it written as a bare link instead.
 */
const isNotSourcingTemplate = (name: string) =>
  isYadkardWiki(name) || name === 'یادکرد فرهنگستان';

/** A URL that points at a wiki is not a source for a wiki. */
const WIKI_URL =
  /https?:\/\/[^\s|\]}]*\b(wikipedia|wikidata|wikimedia|wiktionary|wikisource|wikibooks|wikiquote|wikivoyage|wikinews|wikiversity)\.org/i;

/**
 * Does this reference body actually support a claim?
 *
 * True for a citation template, an sfn, a non-wiki URL, or enough free text to be a
 * hand-written citation — «نوگرایی» cites several of those as quoted prose, and they are
 * real. False when everything in the body is a non-sourcing template or a wiki link.
 */
export function citesContent(body: string): boolean {
  const names = templateNames(body);
  if (names.some(n => isCitationTemplate(n) && !isNotSourcingTemplate(n))) return true;
  if (names.some(isSfnTemplate)) return true;
  const urls = body.match(/https?:\/\/\S+/gi) ?? [];
  if (urls.some(u => !WIKI_URL.test(u))) return true;
  // Nothing here points anywhere but a wiki. Free text does not rescue that: a line
  // reading «https://en.wikipedia.org/… برگرفته از ویکی‌پدیای انگلیسی» describes where
  // the text came from, which is the opposite of citing a source for it.
  const wikiOnly = urls.length > 0 || names.some(isNotSourcingTemplate);
  if (wikiOnly) return false;
  // Free text, with templates and links taken out.
  const bare = body
    .replace(/\{\{[\s\S]*?\}\}/g, ' ')
    .replace(/\[\[[^\]]*\]\]/g, ' ')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/[\s،.؛:«»"'()\[\]|=-]+/g, '');
  return bare.length > 10;
}

const isSfnTemplate = (name: string) =>
  /^(پک|sfn|harv|یادکرد پک|پانویس کوتاه)/.test(name);

/**
 * Headings under which a bulleted line is a general reference.
 *
 * `جستارهای وابسته` / `See also` is in the prototype's list and must be treated
 * carefully: a see-also bullet is a wikilink, not a source, so counting it would block a
 * correct {{بدون منبع}} on any stub that happens to have a see-also list. §12.1 flags
 * this; `isGeneralReference` below requires content beyond the links.
 */
const REF_HEADING =
  /(منابع|منبع|پانویس|یادداشت|کتاب‌?شناسی|کتابنامه|پیوند به بیرون|پیوندهای بیرونی|جستارهای وابسته|مطالعه بیشتر|برای مطالعه|ارجاع|References|Notes|Bibliography|External|Further|See also|Sources)/i;

/** Headings where a bullet is a wikilink rather than a citation. */
const LINK_ONLY_HEADING = /(جستارهای وابسته|See also)/i;

/**
 * Is this bulleted line, under this heading, a general reference?
 *
 * A line of nothing but wikilinks is a see-also entry. Strip the links and the
 * punctuation; if what remains is substantial, somebody wrote a citation by hand.
 */
export function isGeneralReference(line: string, heading: string): boolean {
  const body = line.replace(/^\*+\s*/, '').trim();
  if (body.length <= 15) return false;
  if (/^\{\{\s*(یادکرد-ویکی|یادکرد ویکی|cite wikipedia)\s*[|}]/i.test(body)) return false;
  if (LINK_ONLY_HEADING.test(heading)) {
    const withoutLinks = body
      .replace(/\[\[[^\]]*\]\]/g, ' ')
      .replace(/\{\{[^}]*\}\}/g, ' ')
      .replace(/[\s،.؛:–—-]+/g, '');
    if (withoutLinks.length <= 15) return false;
  }
  return true;
}

/**
 * Count the citation features of an article's wikitext.
 *
 * Ref bodies are removed before citation templates are counted, so a `{{یادکرد کتاب}}`
 * inside a `<ref>` is counted once as a ref and not again as a loose citation.
 */
export function sourceFeatures(wikitext: string): SourceFeatures {
  /**
   * Two views of the same bytes, the same length, so offsets are interchangeable.
   *
   *   `loose` — comments gone. What something CITES is read from here.
   *   `text`  — nowiki/pre/syntaxhighlight gone too. Where a tag IS is read from here.
   *
   * The split exists because both halves have a real case. `<nowiki><ref>…</ref></nowiki>`
   * shows a reader the markup and cites nothing, so the tag must not be found. But
   * «پری» cites `<ref><nowiki>https://sid.ir/…</nowiki></ref>` and «برت مایر» does the
   * same: a genuine reference whose URL is escaped. Reading that body from the
   * nowiki-blanked view made it empty, dropping a real source from `refs_real` — and
   * `refs_real` is what the §3.3/§3.4 thresholds count, so an undercount there is a
   * wrong {{بهبود منبع}} on a properly cited page.
   */
  const loose = blankComments(wikitext);
  const text = blankEscaped(wikitext);

  const refs = (text.match(/<ref[\s>]/gi) ?? []).length;

  let refs_real = 0, refs_ykw_only = 0, refs_sourcing = 0;
  const bodyRe = /<ref(?:\s[^>]*)?>([\s\S]*?)<\/ref\s*>/gi;
  let m: RegExpExecArray | null;
  while ((m = bodyRe.exec(text))) {
    // Same span, unescaped view.
    const start = m.index + m[0].indexOf('>') + 1;
    const body = loose.slice(start, start + m[1].length);
    // `refs_real` / `refs_ykw_only` keep the prototype's exact definition so the replay
    // stays a real check; `refs_sourcing` is the stricter rule the decision uses.
    const mentionsYkw = /یادکرد-ویکی|یادکرد ویکی|cite wikipedia/i.test(body);
    const hasOther = /https?:\/\//i.test(body) ||
      templateNames(body).some(isCitationTemplate) ||
      templateNames(body).some(isSfnTemplate);
    if (mentionsYkw && !hasOther) refs_ykw_only++;
    else if (body.trim()) refs_real++;
    if (citesContent(body)) refs_sourcing++;
  }
  const withoutRefBodies = text.replace(bodyRe, ' ');

  const namesOutside = templateNames(withoutRefBodies);
  const cite_outside = namesOutside.filter(isCitationTemplate).length;
  const cite_outside_sourcing =
    namesOutside.filter(n => isCitationTemplate(n) && !isNotSourcingTemplate(n)).length;
  const http_external = (loose.match(/https?:\/\/\S*/gi) ?? [])
    .filter(u => !WIKI_URL.test(u)).length;
  const sfn = namesOutside.filter(isSfnTemplate).length;
  const ykw = templateNames(text).filter(isYadkardWiki).length;
  const http = (loose.match(/https?:\/\//gi) ?? []).length;
  const isbn = /\bISBN\b/i.test(loose) || /شابک/.test(loose);

  // General references: bulleted lines under a references-type heading.
  let genref_lines = 0, genref_sourcing = 0;
  let heading = '';
  for (const raw of text.split('\n')) {
    const h = /^(==+)\s*(.+?)\s*\1\s*$/.exec(raw.trim());
    if (h) { heading = h[2]; continue; }
    if (!heading || !REF_HEADING.test(heading)) continue;
    if (!/^\*/.test(raw.trim())) continue;
    if (!isGeneralReference(raw.trim(), heading)) continue;
    genref_lines++;
    if (citesContent(raw.trim().replace(/^\*+\s*/, ''))) genref_sourcing++;
  }

  return { refs, refs_real, refs_ykw_only, ykw, cite_outside, sfn, http, genref_lines, isbn,
    refs_sourcing, cite_outside_sourcing, http_external, genref_sourcing };
}

/**
 * STRICT unsourced: nothing on the page supports anything it says (§3.0).
 *
 * This uses the `*_sourcing` fields, not the prototype-comparable ones, and the
 * difference is the مولکول revert: its single reference was `{{یادکرد فرهنگستان}}`, the
 * Academy's approved-terms dictionary, which sources the WORD «مولکول» and not one claim
 * in the article. A reference to another Wikipedia is the same kind of non-source.
 *
 * `refs` is still consulted for the ones with no readable body at all: a bare
 * `<ref name=x/>` reuse means a reference is defined somewhere, and reading that as
 * unsourced would be the overcount-zero failure this file exists to avoid.
 */
export function isStrictUnsourced(f: SourceFeatures): boolean {
  // Every ref either cites nothing usable, or has no body to read (a reuse).
  const reuses = f.refs - (f.refs_real + f.refs_ykw_only);
  const noUsefulRefs = f.refs_sourcing === 0 && reuses === 0;
  return noUsefulRefs &&
    f.cite_outside_sourcing === 0 && f.sfn === 0 && f.http_external === 0 &&
    f.genref_sourcing === 0 && !f.isbn;
}

// ---------------------------------------------------------------------------
// "sourced enough to take the banner off" — citation DENSITY, inline only
// ---------------------------------------------------------------------------

/**
 * How many words of prose one inline citation is allowed to carry.
 *
 * Calibrated on وظیفهٔ ۱۵'s own first-day removals, which is the only population that
 * matters here — the articles the bot actually judged sourced. Genuinely-sourced ones came
 * in at 27–95 words per citation («کازرون» 27, «روی» 37, «ترابری ریلی» 79, «نوگرایی» 63,
 * «کمونالیسم» 95, and the shortest, «کتاب مستطاب آشپزی», 77). The two the operator
 * rejected were «هدهد» at 564 and «وسترن» at 1,128. 250 sits in the empty gap between the
 * groups with a wide margin on both sides, and is roughly one citation per paragraph.
 *
 * Erring high is the safe direction: the only cost of refusing is that a maintenance
 * banner stays on an article for another day, while the cost of removing wrongly is a
 * false claim published in an edit summary over the operator's bot.
 */
export const WORDS_PER_CITATION = 250;

/**
 * No article is "sourced" on a single footnote, however short it is. A two-sentence stub
 * with one citation is an article with one citation; the banner is not wrong enough to be
 * worth a bot edit either way, so it stays and a human can judge.
 */
export const MIN_INLINE_CITATIONS = 2;

/** The least number of inline citations an article of this length must carry. */
export function citationFloor(proseWords: number): number {
  return Math.max(MIN_INLINE_CITATIONS, Math.ceil(proseWords / WORDS_PER_CITATION));
}

/**
 * Inline citations only — the ones attached to a sentence.
 *
 * `cite_outside_sourcing` (a citation template sitting loose in the page) and
 * `genref_sourcing` (a bullet under «منابع») are deliberately NOT counted. They are a
 * reading list: nothing ties them to a particular claim, so they cannot be verified
 * against one, and «هدهد» had seven of them while one of the seven was the English
 * Wikipedia article on the same bird. They still count in `isStrictUnsourced`, because
 * that test guards ADDING a banner and there every doubt must block.
 *
 * `renderedRefs` is the number of footnote items the page actually renders, and it is the
 * second, independent opinion: the wikitext count can be fooled by a ref inside a
 * template or a malformed tag. The smaller of the two wins, so a disagreement always
 * resolves towards refusing.
 */
export function inlineCitations(f: SourceFeatures, renderedRefs: number): number {
  // A `<ref name="x"/>` reuse has no body to classify, so it is not in `refs_sourcing`;
  // it is still a citation attached to a sentence. Count it.
  const reuses = Math.max(0, f.refs - (f.refs_real + f.refs_ykw_only));
  const fromWikitext = f.refs_sourcing + f.sfn + reuses;
  return Math.min(fromWikitext, renderedRefs);
}
