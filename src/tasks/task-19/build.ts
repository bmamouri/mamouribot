/**
 * وظیفهٔ ۱۹ — write a citation template from page metadata. Pure.
 *
 * Every parameter name below was rendered on fa before use (docs/task-19-cite-urls.md
 * § Parameter names). The CS1 overlay `پودمان:Citation/CS1/fa/i18n` declares them:
 * URL «نشانی», Title «عنوان», Periodical «وبگاه», Date «تاریخ», AccessDate «تاریخ بازبینی»,
 * Language «زبان», ArchiveURL «پیوند بایگانی», ArchiveDate «تاریخ بایگانی», UrlStatus
 * «چگونگی پیوند», and «نام خانوادگی»/«نام» with numbered forms.
 */
import { escapeParam } from './wikitext.js';

export interface Meta {
  url: string;
  title: string;
  /** false when the title came from the editor's own link label */
  titleFromSite?: boolean;
  /** plain site name, or `[[Article]]` / `[[Article|label]]` when verified */
  website?: string;
  date?: string;            // ISO `YYYY`, `YYYY-MM` or `YYYY-MM-DD`, Gregorian or Jalali
  authors?: [string, string][];   // [first, last]
  language?: string;        // two-letter code, only when not Persian
  news?: boolean;
  archive?: { url: string; date: string };
}

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
export const faDigits = (s: string | number) => String(s).replace(/[0-9]/g, d => FA_DIGITS[Number(d)]);
const GREG = ['ژانویه', 'فوریه', 'مارس', 'آوریل', 'مه', 'ژوئن', 'ژوئیه', 'اوت', 'سپتامبر', 'اکتبر', 'نوامبر', 'دسامبر'];
const JALALI = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];

/**
 * `2019-02-14` → «۱۴ فوریه ۲۰۱۹», `1392-03-29` → «۲۹ خرداد ۱۳۹۲», `2019-02` → «فوریه ۲۰۱۹».
 * A year from 1200 to 1450 is a Jalali year (some Iranian sites put the Jalali date in
 * their metadata, banki.ir does). Returns undefined for anything it cannot read.
 * `۲۰۱۹-۰۲` is rejected by the module, so the month form is always written out.
 */
export function formatDate(iso: string | undefined): string | undefined {
  if (!iso) return undefined;
  const m = /^(\d{4})(?:-(\d{1,2})(?:-(\d{1,2}))?)?/.exec(iso.trim());
  if (!m) return undefined;
  const y = Number(m[1]), mo = m[2] ? Number(m[2]) : 0, d = m[3] ? Number(m[3]) : 0;
  const jalali = y >= 1200 && y <= 1450;
  if (!jalali && (y < 1500 || y > 2100)) return undefined;
  if (mo && (mo < 1 || mo > 12)) return undefined;
  if (d && (d < 1 || d > 31)) return undefined;
  const months = jalali ? JALALI : GREG;
  if (!mo) return faDigits(y);
  if (!d) return `${months[mo - 1]} ${faDigits(y)}`;
  return `${faDigits(d)} ${months[mo - 1]} ${faDigits(y)}`;
}

/** Today's date as the access date: «۲۱ نوامبر ۲۰۲۶». */
export function todayFa(now = new Date()): string {
  return `${faDigits(now.getUTCDate())} ${GREG[now.getUTCMonth()]} ${faDigits(now.getUTCFullYear())}`;
}

/** `{{یادکرد وب|…}}` or `{{یادکرد خبر|…}}`, on one line, Persian parameter names. */
export function buildCitation(meta: Meta, opt: { today: string }): string {
  const p: [string, string][] = [];
  p.push(['نشانی', meta.url]);
  p.push(['عنوان', escapeParam(meta.title)]);
  (meta.authors ?? []).slice(0, 9).forEach(([first, last], i) => {
    const n = i === 0 ? '' : faDigits(i + 1);
    p.push([`نام خانوادگی${n}`, escapeParam(last)]);
    if (first) p.push([`نام${n}`, escapeParam(first)]);
  });
  if (meta.website) p.push(['وبگاه', meta.website.startsWith('[[') ? meta.website : escapeParam(meta.website)]);
  const date = formatDate(meta.date);
  if (date) p.push(['تاریخ', date]);
  if (meta.language) p.push(['زبان', meta.language]);
  if (meta.archive) {
    const ad = formatDate(meta.archive.date);
    if (ad) {
      p.push(['پیوند بایگانی', meta.archive.url]);
      p.push(['تاریخ بایگانی', ad]);
      p.push(['چگونگی پیوند', 'مرده']);
    }
  }
  p.push(['تاریخ بازبینی', opt.today]);
  const name = meta.news ? 'یادکرد خبر' : 'یادکرد وب';
  return `{{${name} |${p.map(([k, v]) => `${k}=${v}`).join(' |')}}}`;
}
