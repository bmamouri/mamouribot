/**
 * وظیفهٔ ۱۹ — split a Persian byline into given name and family name, or say it cannot.
 *
 * No library does this (research/persian-names/README.md in the companion repository).
 * What exists is name DATA, so this is a dictionary splitter that abstains:
 *
 *   1. strip honorifics and titles («سید», «دکتر», «حجت‌الاسلام», «مهندس»)
 *   2. take the longest run of leading words that are all known given names, so
 *      «علی اکبر دهخدا» → «علی اکبر» | «دهخدا», and «محمد رضا» joins as one given name
 *   3. split only if the remainder is non-empty, is NOT itself a known given name, and
 *      is at most three words. Otherwise: no split.
 *
 * «حسین علی» (two given names) and «مهسا فردحسینی» with an unknown «مهسا» both abstain.
 * Abstaining is cheap: the caller writes the whole name to `نویسنده=`, which CS1 renders
 * exactly as a byline. A wrong split is not cheap: «نام خانوادگی=اکبر دهخدا» sorts and
 * anchors the citation under the wrong word.
 *
 * The given-name list is data/given-names.json: Wikidata's Persian given-name labels plus
 * the given names fa editors themselves wrote in `|نام=` (research/persian-names/).
 */
import givenData from './data/given-names.json' with { type: 'json' };

const TITLES = new Set([
  'سید', 'سیده', 'سيد', 'میر', 'دکتر', 'دكتر', 'مهندس', 'استاد', 'پروفسور', 'حاج', 'حاجی', 'آقای', 'آقا', 'خانم',
  'شیخ', 'ملا', 'سید‌', 'آیت‌الله', 'آیت', 'الله', 'حجت‌الاسلام', 'حجت', 'الاسلام', 'والمسلمین', 'آیت‌الله‌العظمی', 'شهید', 'مرحوم',
]);

export function normName(s: string): string {
  return s.replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/ى/g, 'ی').replace(/[\u064b-\u065f\u0670]/g, '')
    .replace(/\u200c/g, '\u200c').replace(/\s+/g, ' ').trim();
}

/** Word forms: «علی‌اکبر» counts as one word, and so do its parts when written apart. */
function wordsOf(s: string): string[] {
  return normName(s).split(' ').filter(Boolean);
}

export class NameSplitter {
  private given: Set<string>;
  constructor(given: Iterable<string>) {
    this.given = new Set([...given].map(normName).filter(Boolean));
  }
  isGiven(w: string): boolean {
    const n = normName(w);
    return this.given.has(n) || this.given.has(n.replace(/\u200c/g, ' ')) || this.given.has(n.replace(/\u200c/g, ''));
  }
  /**
   * `[given, family]`, or null when unsure. A name with titles keeps the title out of
   * both parts: CS1 has no title field, and «سید» is not a given name.
   */
  split(full: string): [string, string] | null {
    if (/[،,؛;:()«»"]/.test(full)) return null;                 // «X، روزنامه‌نگار», lists, quotes
    let ws = wordsOf(full);
    while (ws.length && TITLES.has(ws[0])) ws = ws.slice(1);
    if (ws.length < 2 || ws.length > 5) return null;
    if (ws.some(w => NOT_A_PERSON.test(w))) return null;

    // Patronymic chains: «احمد بن محمد ابن خلکان» → «احمد بن محمد» | «ابن خلکان».
    // «ابن» after the first word starts the family name; «بن» joins the given-name chain.
    const ibn = ws.findIndex((w, i) => i > 0 && (w === 'ابن' || w === 'بن') && ws[i - 1] !== 'بن' && i === ws.lastIndexOf(w) && w === 'ابن');
    if (ibn > 0) return ibn < ws.length - 1 ? [ws.slice(0, ibn).join(' '), ws.slice(ibn).join(' ')] : null;
    if (ws.includes('بن') || ws.includes('بنت')) {
      const last = Math.max(ws.lastIndexOf('بن'), ws.lastIndexOf('بنت'));
      if (last >= ws.length - 2) return null;                   // «حسین بن حمدان خصیبی» needs the chain end
      return [ws.slice(0, last + 2).join(' '), ws.slice(last + 2).join(' ')];
    }

    let k = 0;
    while (k < ws.length - 1 && !TITLES.has(ws[k])
      && (this.isGiven(ws[k]) || this.isGiven(ws.slice(0, k + 1).join(' ')) || this.isGiven(ws.slice(0, k + 1).join('\u200c')))) k++;
    if (k === 0) return null;
    const family = ws.slice(k);
    if (family.length > 3) return null;
    if (family.length === 1 && this.isGiven(family[0])) return null;
    // A family part that starts with a title word («شیخ رضایی») is a family name; one that
    // starts with ANOTHER given name («هنری هینز», «مصدق کاتوزیان») is ambiguous: a
    // second given name or a two-word family name. Abstain.
    if (family.length >= 2 && !TITLES.has(family[0]) && this.isGiven(family[0])) return null;
    // A two- or three-word remainder after ONE given name is usually a second given name
    // the list does not know («آرتور اوگین», «جمشید گرشاسب», «محمد فواد»). Trust it only
    // when it is shaped like a compound family name: a title word in front («شیخ رضایی»,
    // «میر …») or a family-name suffix written apart («ملک زاده», «کریمی نسب»).
    if (family.length >= 2 && !TITLES.has(family[0])
      && !FAMILY_SUFFIX.test(family[family.length - 1])) return null;
    return [ws.slice(0, k).join(' '), family.join(' ')];
  }
}

/** The tail of a compound family name written with a space: «ملک زاده», «کریمی نسب». */
const FAMILY_SUFFIX = /^(?:زاده|پور|نژاد|نیا|فر|راد|کیا|نسب|منش|وند|لو|خانی|آبادی|ی‌پور)$/;

/** Words that make a byline an organisation, not a person. */
const NOT_A_PERSON = /^(?:موسسه|مؤسسه|پایگاه|تحریریه|خبرگزاری|سایت|وبگاه|روزنامه|گروه|مرکز|سازمان|انتشارات|دانشگاه|بنیاد|شرکت|دفتر|کانون|انجمن|اداره|وزارت|نشریه|مجله)$/;

export const SPLITTER = new NameSplitter((givenData as { given: string[] }).given);
