/**
 * L1: deterministic signals. Cheap, explainable, and never an action on their own.
 *
 * Each flag is evidence handed to the LLM and to the decision ladder. A flag is named for
 * what it SAW, not for what it concludes, so a reviewer reading the log can check it
 * against the diff in seconds.
 *
 * Measured on 500 random fa.wiktionary entries (۲۳ نوامبر ۲۰۲۶): 492 have a `==زبان==`
 * header, 411 have a `#` definition line. So "no header and no definition" on a new main-
 * namespace page is rare among real entries and common among the deleted bios and ads.
 */

export interface Flag { id: string; detail: string; strong: boolean }

export interface EditFacts {
  ns: number;
  isCreation: boolean;
  oldText: string;          // '' for a creation
  newText: string;
  added: string[];          // added lines (line diff)
  removed: string[];        // removed lines
  summary: string;
  tags: string[];
}

const L2 = /^==\s*[^=\n]+?\s*==\s*$/m;
const DEF_LINE = /^#[^#:*]/m;
const REDIRECT = /^\s*#\s*(redirect|تغییر[_ ]?مسیر)/i;

export const REVERT_TAGS = ['mw-undo', 'mw-rollback', 'mw-manual-revert'];

/** Phrases a chatbot answer carries and a dictionary entry never does. */
const CHATBOT = [
  /تحلیل شما/, /در ادامه،?\s*(یک|به)\s*(بررسی|توضیح)/, /امیدوارم\s*(این|که|مفید)/,
  /اگر\s*(سؤال|سوال)\s*(دیگری|بیشتری)/, /به\s*عنوان\s*یک\s*(مدل|هوش)/,
  /\*\*[^*\n]{2,}\*\*/, /^#{2,}\s/m,
];
/** A sentence about a person, a place or a business. */
const ENCYCLOPEDIC = /(متولد|زادهٔ?\s|درگذشت|واقع\s*در|روستای|شهرستان|استان|فروشگاه|شرکت|کارشناس|هنرمند|خواننده|بازیکن|شاعر)/;
const CONTACT = /(\b0?9\d{9}\b|\+98\s?\d{3}|[\w.+-]+@[\w-]+\.\w+|instagram\.com|t\.me\/|wa\.me\/|telegram\.me)/i;
const EXT_LINK = /https?:\/\/[^\s\]|}]+/g;
const FLOOD = /(.)\1{5,}/u;
const EMOJI = /\p{Extended_Pictographic}/u;
const SIGNATURE = /\[\[(کاربر|User):[^\]]+\]\].{0,40}\d{1,2}\s*[:٫]\s*\d{2}/;

export function flags(f: EditFacts): Flag[] {
  const out: Flag[] = [];
  const add = (id: string, detail: string, strong = false) => out.push({ id, detail, strong });
  const addedText = f.added.join('\n');
  const removedText = f.removed.join('\n');

  // --- new pages ---
  if (f.isCreation && f.ns === 0 && !REDIRECT.test(f.newText)) {
    const hasL2 = L2.test(f.newText), hasDef = DEF_LINE.test(f.newText);
    if (!hasL2 && !hasDef) add('no-structure', 'سرواژهٔ تازه بی سرفصل زبان و بی سطر تعریف', true);
    else if (!hasL2) add('no-language-header', 'سرواژهٔ تازه بی سرفصل زبان');
    if (ENCYCLOPEDIC.test(f.newText) && !hasDef) add('encyclopedic', 'متن دانشنامه‌ای یا زندگی‌نامه‌ای', true);
    if (f.newText.trim().length < 40) add('tiny-page', `صفحهٔ ${f.newText.trim().length} نویسه‌ای`);
  }

  // --- removals ---
  const oldLen = f.oldText.length, newLen = f.newText.length;
  if (!f.isCreation && oldLen > 300 && newLen < 50 && !REDIRECT.test(f.newText)) {
    add('blanking', `${oldLen} → ${newLen} نویسه`, true);
  } else if (!f.isCreation && oldLen > 500 && newLen < oldLen * 0.5) {
    add('large-removal', `${Math.round(100 * (1 - newLen / oldLen))}٪ متن برداشته شد`);
  }
  const l2Gone = (f.oldText.match(new RegExp(L2.source, 'gm')) ?? []).length
               - (f.newText.match(new RegExp(L2.source, 'gm')) ?? []).length;
  if (l2Gone > 0) add('language-section-removed', `${l2Gone} بخش زبان برداشته شد`);
  const catsBefore = (f.oldText.match(/\[\[(رده|Category):/gi) ?? []).length;
  const catsAfter = (f.newText.match(/\[\[(رده|Category):/gi) ?? []).length;
  if (catsBefore > 0 && catsAfter === 0) add('all-categories-removed', `${catsBefore} رده برداشته شد`);
  // Pronunciation: the header, an IPA/SAMPA template, or a bulleted /…/ or […] transcription.
  // A bare /…/ pair is NOT enough: every URL has one.
  const PRON = /===+\s*(آوایش|تلفظ)\s*===+|\{\{\s*(IPA|SAMPA|آوا)|^\*\s*[/[][^/\]\n]{1,40}[/\]]\s*$/m;
  const pronBefore = f.oldText.match(new RegExp(PRON.source, 'gm'))?.length ?? 0;
  const pronAfter = f.newText.match(new RegExp(PRON.source, 'gm'))?.length ?? 0;
  if (pronAfter < pronBefore) add('pronunciation-removed', 'آوایش برداشته شد');

  // --- insertions ---
  for (const re of CHATBOT) {
    const m = addedText.match(re);
    if (m) { add('chatbot-phrasing', m[0].slice(0, 60)); break; }
  }
  const newLinks = (addedText.match(EXT_LINK) ?? []).filter(u => !removedText.includes(u));
  if (newLinks.length) add('external-link', newLinks.slice(0, 3).join(' '));
  const contact = addedText.match(CONTACT);
  if (contact) add('contact-details', contact[0], true);
  const flood = addedText.match(FLOOD);
  if (flood) add('char-flood', flood[0].slice(0, 20));
  if (EMOJI.test(addedText)) add('emoji', 'شکلک در متن');
  if (SIGNATURE.test(addedText) && f.ns === 0) add('signature', 'امضا در سرواژه');
  if (f.ns === 0 && !f.isCreation && /[A-Za-z]{4,}/.test(addedText)
      && !/[\u0600-\u06FF]/.test(addedText) && !/==\s*[^=]+==/.test(addedText)
      && !/[{}[\]|]/.test(addedText)) {
    add('latin-prose', 'متن لاتین بی قالب و بی سرفصل');
  }
  return out;
}

/**
 * Shahbaz's guard, kept for the same reason: an edit that undoes another low-trust user
 * is most often someone removing vandalism, and reverting it restores the vandalism.
 * Most of Shahbaz's mistake reports were exactly this.
 */
export function isRevertOf(tags: string[]): boolean {
  return tags.some(t => REVERT_TAGS.includes(t));
}
