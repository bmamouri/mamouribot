/**
 * وظیفهٔ ۱۳ — ویکی‌پدیا:گزارش دیتابیس/ترجیحات کاربران
 *
 * WHY THE OLD PAGE WAS EMPTY, WHICH IS NOT WHAT IT LOOKED LIKE. The «منطقه زمانی» table
 * had been empty since بهمن ۱۴۰۲ and read as a bot that had stopped. It had not: the
 * query still runs and still returns nothing, because `timecorrection` is no longer in
 * the public replicas. Measured ۱۱ اکتبر ۲۰۲۶, `user_properties` exposes exactly four
 * properties — gender, nickname, fancysig, disablemail — and `timecorrection`, `skin`,
 * `language`, `variant` and `thumbsize` all return **0 rows**. Timezone, skin and
 * interface language cannot be reported from here at all, by anyone. Do not "fix" that
 * section by rewriting the SQL; the data is gone.
 *
 * TWO THINGS THE RAW COUNTS GET WRONG ON THEIR OWN:
 *
 *   `user_properties` stores a row only when a user has changed a preference AWAY from
 *   its default. Every count here is "users who changed this", never a total, and a
 *   preference left alone is invisible. The page says so, because 29,507 looks like a
 *   population until you know that.
 *
 *   Most registered accounts never edit — 1.57M accounts against 536k with a single
 *   edit. A bare count is therefore dominated by dormant registrations, so each property
 *   is broken down by how active the account is. That split is the point of the report:
 *   it is the difference between "29,507 users set a gender" and "627 of them have made
 *   a thousand edits".
 *
 * The «جنسیت» section stays a transclusion of `/جنسیت`, which **another operator's bot
 * maintains and updated as recently as ۱۷ مهر ۱۴۰۵**. Generating it here too would have
 * two bots writing the same numbers to two pages.
 */
export const PREFS_PAGE = 'ویکی‌پدیا:گزارش دیتابیس/ترجیحات کاربران';

export const faDigits = (n: number | string) => String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[+d]);
const num = (v: number) => `data-sort-value="${v}" | {{formatnum:${v}}}`;

/** The four properties the replica actually exposes, with what each one means. */
export const PROPERTIES: Record<string, string> = {
  gender: 'جنسیت دستوری که کاربر برای خطاب‌شدن برگزیده است',
  nickname: 'امضای سفارشی به‌جای امضای پیش‌فرض',
  fancysig: 'امضا به‌عنوان ویکی‌متن خام در نظر گرفته شود',
  disablemail: 'دریافت رایانامه از کاربران دیگر غیرفعال شده است',
};

export interface PrefRow {
  property: string; users: number; edited: number; ge100: number; ge1000: number;
}
export interface Totals { accounts: number; edited: number }

export function buildPrefs(rows: PrefRow[], totals: Totals): string {
  const known = rows.filter(r => PROPERTIES[r.property]);
  const out = [
    'این صفحه نشان می‌دهد چند کاربر هر ترجیح را از حالت پیش‌فرضش بیرون آورده‌اند.',
    '',
    "هر عدد شمار کسانی است که آن ترجیح را '''تغییر داده‌اند'''، نه شمار کل کاربران: "
    + 'پایگاه داده تنها زمانی ردیفی می‌سازد که کاربر مقدار پیش‌فرض را عوض کرده باشد، پس '
    + 'ترجیحی که دست‌نخورده مانده اصلاً دیده نمی‌شود.',
    '',
    `از ${faDigits(totals.accounts)} حساب ثبت‌شده، ${faDigits(totals.edited)} حساب دست‌کم یک `
    + 'ویرایش دارند. چون بیشتر حساب‌ها هرگز ویرایش نمی‌کنند، شمار خام بیشتر بازتاب حساب‌های '
    + 'بی‌کار است؛ به همین دلیل هر ترجیح بر پایهٔ میزان فعالیت حساب هم شکسته شده است.',
    '',
    `آخرین به‌روزرسانی: ~~~~~`,
    '',
    '{| class="wikitable sortable"',
    '! ترجیح !! معنی !! کاربران !! دست‌کم یک ویرایش !! ۱۰۰ ویرایش یا بیشتر !! ۱۰۰۰ ویرایش یا بیشتر',
  ];
  for (const r of known) {
    out.push('|-',
      `| <code dir="ltr">${r.property}</code>`,
      `| ${PROPERTIES[r.property]}`,
      `| ${num(r.users)}`,
      `| ${num(r.edited)}`,
      `| ${num(r.ge100)}`,
      `| ${num(r.ge1000)}`);
  }
  out.push('|}', '',
    '== جنسیت ==',
    '{{/جنسیت}}',
    '',
    '== منطقه زمانی ==',
    'این بخش دیگر ساخته نمی‌شود. ترجیح منطقهٔ زمانی («timecorrection») در پایگاه‌های بدل '
    + 'عمومی در دسترس نیست و پرس‌وجو روی آن هیچ ردیفی برنمی‌گرداند؛ همین‌طور پوسته، زبان '
    + 'رابط و اندازهٔ بندانگشتی. جدول خالی این بخش نشانهٔ از کار افتادن ربات نبود، بلکه '
    + 'نبودِ داده بود.',
    '',
    '[[رده:گزارش‌های دیتابیس ویکی‌پدیا]]');
  return out.join('\n');
}

/** Per property: how many set it, and how active those accounts are. */
export const PREFS_SQL = `
SELECT up_property,
       COUNT(*)                      AS users,
       SUM(u.user_editcount > 0)     AS edited,
       SUM(u.user_editcount >= 100)  AS ge100,
       SUM(u.user_editcount >= 1000) AS ge1000
FROM user_properties p JOIN user u ON u.user_id = p.up_user
GROUP BY up_property
ORDER BY users DESC`;

export const TOTALS_SQL =
  'SELECT COUNT(*) AS accounts, SUM(user_editcount > 0) AS edited FROM user';
