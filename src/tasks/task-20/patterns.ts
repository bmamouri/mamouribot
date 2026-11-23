/**
 * وظیفهٔ ۲۰ — pattern values: a number (or range) and a unit, no free words.
 *
 * `18 to 159 days` and `24 hours` cannot be dictionary rows; every number is different.
 * They are still mechanical: the shape is fixed and the only words are unit names. These
 * rules rewrite exactly that shape and nothing else, in the house style measured on 200 fa
 * drug articles that editors wrote by hand (۲۳ نوامبر ۲۰۲۶): Persian digits, «٫» decimal
 * separator, en dash for a range or «تا» where the source says `to`, unit as a Persian word.
 *
 *   elimination_half-life = 18 to 159 days   →  ۱۸ تا ۱۵۹ روز
 *   elimination_half-life = 5–7 days         →  ۵–۷ روز
 *   elimination_half-life = 24 hours         →  ۲۴ ساعت
 *   molecular_weight      = 320.04 g/mol     →  ۳۲۰٫۰۴ گرم بر مول
 *
 * Anything with an extra word, a second clause, a qualifier in parentheses, a ref inside the
 * core, or an approximate sign the rule does not know is left alone: «1-2 hours, active
 * metabolite 3 hours» and «563.638 g/mol (citrate salt)» are prose and go to review.
 *
 * Not used by the bot until a pattern row is approved for it: each rule is keyed to the
 * (template, parameter) pairs listed in PATTERN_PARAMS, and the request scope is amended
 * before they run.
 */

const DIGITS = '۰۱۲۳۴۵۶۷۸۹';
export const faDigits = (s: string) => s.replace(/\d/g, d => DIGITS[Number(d)]).replace(/(?<=[۰-۹])\.(?=[۰-۹])/g, '٫');

const TIME_UNITS: Record<string, string> = {
  seconds: 'ثانیه', second: 'ثانیه', sec: 'ثانیه', s: 'ثانیه',
  minutes: 'دقیقه', minute: 'دقیقه', mins: 'دقیقه', min: 'دقیقه',
  hours: 'ساعت', hour: 'ساعت', hrs: 'ساعت', hr: 'ساعت', h: 'ساعت',
  days: 'روز', day: 'روز', d: 'روز',
  weeks: 'هفته', week: 'هفته', wk: 'هفته',
  months: 'ماه', month: 'ماه',
  years: 'سال', year: 'سال', yr: 'سال',
};
const NUM = String.raw`\d+(?:\.\d+)?`;
const TIME = new RegExp(
  String.raw`^(~|≈|<|>|≤|≥)?\s*(${NUM})(?:\s*(–|-|—|to)\s*(${NUM}))?\s*(${Object.keys(TIME_UNITS).sort((a, b) => b.length - a.length).join('|')})\.?$`, 'i');
const MOLAR = new RegExp(String.raw`^(${NUM})\s*(?:g\s*/\s*mol(?:e)?|g\s*[·.]?\s*mol\s*[−-]\s*1)$`, 'i');

/** Which rule applies where. A parameter not here is never pattern-rewritten. */
export const PATTERN_PARAMS: Record<string, Record<string, 'time' | 'molar'>> = {
  'جعبه اطلاعات دارو': {
    'elimination_half-life': 'time', 'duration_of_action': 'time', 'onset': 'time',
    'molecular_weight': 'molar',
  },
};

/** Rewrite one whole value, or return null when it is not exactly the shape. */
export function rewritePattern(kind: 'time' | 'molar', value: string): string | null {
  const v = value.trim();
  if (kind === 'time') {
    const m = TIME.exec(v);
    if (!m) return null;
    const [, sign, a, sep, b, unit] = m;
    const signFa = sign ? ({ '~': '~', '≈': '≈', '<': 'کمتر از ', '>': 'بیش از ', '≤': '≤', '≥': '≥' } as Record<string, string>)[sign] : '';
    const range = b === undefined ? faDigits(a)
      : `${faDigits(a)}${sep.toLowerCase() === 'to' ? ' تا ' : '–'}${faDigits(b)}`;
    return `${signFa}${range} ${TIME_UNITS[unit.toLowerCase()]}`;
  }
  const m = MOLAR.exec(v);
  return m ? `${faDigits(m[1])} گرم بر مول` : null;
}
