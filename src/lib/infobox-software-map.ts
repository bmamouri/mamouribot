// legacy/variant parameter name -> current canonical Persian name for
// الگو:جعبه اطلاعات نرم‌افزار
//
// Derived from the template's own pre-migration revision 28649917 (۴ آوریل ۲۰۲۰),
// which is the last version that still accepted the Persian names now found in
// articles. Revisions 28696525 (۲۰۲۰) and 39450131 (۲۰۲۴) dropped them without
// converting the call sites, which is why ~۸۴۰ articles silently lost infobox rows.

export const RENAME: Record<string, string> = {
  // انتشار اولیه (released)
  'انتشار ابتدایی': 'انتشار اولیه',
  'اولین نسخه': 'انتشار اولیه',
  'نگارش ابتدایی': 'انتشار اولیه',
  'تاریخ اولین نسخه': 'انتشار اولیه',
  'اولین خروجی': 'انتشار اولیه',
  'انتشار': 'انتشار اولیه',
  'انتشار نخست': 'انتشار اولیه',
  'تاریخ انتشار': 'انتشار اولیه',
  'تاریخ_انتشار': 'انتشار اولیه',

  // نسخه آخرین انتشار (latest release version)
  'آخرین نسخه پایدار': 'نسخه آخرین انتشار',
  'آخرین_نسخه_پایدار': 'نسخه آخرین انتشار',
  'نگارش آخرین انتشار': 'نسخه آخرین انتشار',
  'آخرین نسخه': 'نسخه آخرین انتشار',
  'آخرین_نسخه': 'نسخه آخرین انتشار',
  'واپسین نگارش': 'نسخه آخرین انتشار',
  'آخرین انتشار': 'نسخه آخرین انتشار',
  'نسخه پایدار': 'نسخه آخرین انتشار',
  'انتشار پایدار': 'نسخه آخرین انتشار',
  'آخرین نسخه منتشرشده': 'نسخه آخرین انتشار',
  'آخرین نسخه ارائه شده': 'نسخه آخرین انتشار',
  'بالا ترین نسخه منتشر شده': 'نسخه آخرین انتشار',
  'نسخه جاری': 'نسخه آخرین انتشار',

  // تاریخ آخرین انتشار (latest release date)
  'تاریخ انتشار آخرین نسخه پایدار': 'تاریخ آخرین انتشار',
  'تاریخ آخرین نسخه پایدار': 'تاریخ آخرین انتشار',
  'تاریخ انتشار آخرین نسخه': 'تاریخ آخرین انتشار',
  'تاریخ آخرین نسخه': 'تاریخ آخرین انتشار',
  'تاریخ_آخرین_نسخه': 'تاریخ آخرین انتشار',
  'تاریخ واپسین نگارش': 'تاریخ آخرین انتشار',
  'تاریخ انتشار اولین نسخه پایدار': 'تاریخ آخرین انتشار',

  // آخرین نسخه آزمایشی (latest preview version)
  'نگارش آخرین پیش‌نمایش': 'آخرین نسخه آزمایشی',
  'آخرین نسخه پیش‌نمایش': 'آخرین نسخه آزمایشی',
  'نسخه پیشنمایش': 'آخرین نسخه آزمایشی',
  'نسخه پیش نمایش': 'آخرین نسخه آزمایشی',
  'آخرین نسخه نمایشی': 'آخرین نسخه آزمایشی',

  // تاریخ آخرین نسخه آزمایشی (latest preview date)
  'تاریخ انتشار آخرین نسخه آزمایشی': 'تاریخ آخرین نسخه آزمایشی',
  'تاریخ نگارش آخرین پیش‌نمایش': 'تاریخ آخرین نسخه آزمایشی',
  'تاریخ آخرین پیش‌نمایش': 'تاریخ آخرین نسخه آزمایشی',
  'تاریخ آخرین نسخه نمایشی': 'تاریخ آخرین نسخه آزمایشی',

  // زبان برنامه‌نویسی (programming language)
  'زبان‌های برنامه‌نویسی': 'زبان برنامه‌نویسی',
  'زبان‌های_برنامه‌نویسی': 'زبان برنامه‌نویسی',
  'زبان برنامه نویسی': 'زبان برنامه‌نویسی',
  'written in': 'زبان برنامه‌نویسی',
  'نوشته شده با': 'زبان برنامه‌نویسی',
  'نوشته‌شده با': 'زبان برنامه‌نویسی',
  'Written in': 'زبان برنامه‌نویسی',

  // سیستم‌عامل (operating system)
  'سیستم عامل': 'سیستم‌عامل',
  'سیستم‌های عامل': 'سیستم‌عامل',
  'سیستم استفاده': 'سیستم‌عامل',
  'سیستم کاربری': 'سیستم‌عامل',
  'Operating system': 'سیستم‌عامل',
  'os': 'سیستم‌عامل',

  // ژانر (genre / type)
  'گونه': 'ژانر',
  'نوع': 'ژانر',
  'رسته': 'ژانر',
  'type': 'ژانر',
  // «استفاده» was already deprecated in rev 28649917 (it only emitted a
  // deprecated-parameter category and displayed nothing). Its ۶۴ non-empty
  // values are all genre values (ضدویروس، مرورگر وب، ویرایشگر متن…), so they
  // fold into ژانر rather than being dropped.
  'استفاده': 'ژانر',

  // وبگاه (website)
  'وب‌گاه': 'وبگاه',
  'وب گاه': 'وبگاه',
  'وب‌سایت': 'وبگاه',
  'صفحه وب': 'وبگاه',

  // تا تاریخ (AsOf)
  'از تاریخ': 'تا تاریخ',

  // زبان (language list) — the template's «زبان‌های در دسترس» is the COUNT
  'زبان‌های قابل دسترس': 'زبان',
  'زبان های قابل دسترس': 'زبان',
  'زبان‌های نسخه موجود': 'زبان',
  'در دسترس': 'زبان',
  'پشتیبانی از زبان': 'زبان',

  // زبان‌های در دسترس (language count)
  'تعداد زبان‌ها': 'زبان‌های در دسترس',
  'شمار زبان': 'زبان‌های در دسترس',

  // توسعه‌دهنده (developer)
  'توسعه دهنده': 'توسعه‌دهنده',
  'توسعه_دهنده': 'توسعه‌دهنده',
  'توسعه‌دهنده(ها)': 'توسعه‌دهنده',
  'توسعه‌دهندهٔ اصلی': 'توسعه‌دهنده',
  'سازنده': 'توسعه‌دهنده',
  'تولید کننده': 'توسعه‌دهنده',
  'ارائه کننده': 'توسعه‌دهنده',
  'پدیدآور': 'نویسنده',
  'برنامه‌نویس': 'نویسنده',
  'designer': 'نویسنده',

  // سکو (platform)
  'پلتفرم': 'سکو',
  'بسترهای_پشتیبانی‌شده': 'سکو',
  'بسترهای نرم‌افزاری': 'سکو',
  'محیط': 'سکو',
  'also_available_for': 'سکو',

  // موتور (engine)
  'هسته': 'موتور',
  'موتور چیدمان': 'موتور',

  // images / misc
  'اندازه_تصویر': 'اندازه تصویر',
  'image_size': 'اندازه تصویر',
  'اندازه': 'اندازه تصویر',
  'تصویر صفحه': 'نماگرفت',
  'نماد': 'نشان',
  'شرح نشان': 'توضیح نشان',
  'شرح_تصویر': 'توضیح تصویر',
  'شرح تصویر': 'توضیح تصویر',
  'توضیح تصویری': 'توضیح تصویر',
  'توضیح': 'توضیح تصویر',
  'logo_upright': 'logo upright',
  'screenshot_upright': 'screenshot upright',

  // other
  'مخزن نرم‌افزاری': 'مخزن',
  'included_with': 'همراه با',
  'لایسنس': 'مجوز',
  'نام اصلی': 'نام‌های دیگر',
  'نام لاتین': 'نام‌های دیگر',
  'نام بومی': 'نام‌های دیگر',
  'مالک': 'توسعه‌دهنده',
  'پایان کار': 'discontinued',
  'متوقف‌شده': 'discontinued',
};

// Parameters with no row in either the fa or the en template. Removed only when
// empty (or comment-only); a non-empty value routes the page to manual review,
// except where handled specially below.
export const DEAD = new Set([
  'فهرست زبان‌ها',        // never a parameter — it was a literal Hidden-begin title
  'اغلب به روز می‌شود',
  'frequently updated',
  'frequently_updated',
  'الکسا',                // Alexa shut down 2022; en deleted the row
  'alexa',
  'ابزارها',
  'tools',
  'paradigm',
  'source',
  'source_model',
  'requirements',
  'related_components',
  'service_description',
  'slogan',
  'founder',
  'key_people',
  'مدیر عامل',
  'مدیر توسعه دهنده ایرانی',
  'مدخل توسعه‌دهنده‌ها',
  'پروژه‌های وابسته',
  'ثبت شده',
  'فارسی',
  'توضیحات',
  'نویسنده_لاتین',
  'نام Marmay',
  'وبگاه در ایران به صورت رسمی',
  'وبگاه ترفند و آموزش',
  'وب‌گاه رسمی در ایران',
  'انتشار پیشین',
  'تاریخ انتشار پیشین',
  // parameters of الگو:جعبه اطلاعات زبان برنامه‌نویسی that leaked into calls of
  // this template — they have no row here and none on en's Infobox software
  'typing',
  'scope',
  'family',
  'dialects',
  'implementations',
  'influenced',
  'influenced by',
  'graphical interface',
]);

// Dropped even when non-empty. الکسا/alexa: Alexa is defunct and en deleted the
// row (user decision). frequently updated: not a parameter on en either — it is
// a hint for en's release-version bot, carries nothing reader-facing, and its
// only values here are yes/no. Every other DEAD name must be empty to be removed.
export const DROP_EVEN_IF_SET = new Set([
  'الکسا', 'alexa', 'frequently updated', 'frequently_updated', 'اغلب به روز می‌شود',
]);

// status-like parameters. The row was deleted from the fa template in ۲۰۲۰ and
// en's Infobox software has never had one. en expresses the same information
// through `discontinued`, so:
//   - "active"-like values are the en default -> the parameter is simply removed
//   - "discontinued"-like values become discontinued=yes
//   - anything else (dated prose, refs) -> manual review, page left untouched
export const STATUS_PARAMS = new Set([
  'status', 'وضعیت', 'وضعیت توسعه', 'وضعیت_توسعه',
  'current_status', 'working state', 'support_status', 'وضعیت پشتیبانی',
]);

const ACTIVE = [
  'فعال', 'در جریان', 'active', 'در حال توسعه', 'درحال توسعه', 'current',
  'پایدار', 'بسیار فعال', 'در حال پشتیبانی', 'ادامه دارد', 'جاری',
  'در حال اجرا', 'منتشر شده', 'released', 'stable', 'maintained', 'در دست توسعه',
];
const DISCONTINUED = [
  'discontinued', 'متوقف شده', 'متوقف‌شده', 'متوقف', 'غیرفعال', 'غیر فعال',
  'لغو شده', 'خوابیده', 'رهاشده', 'رها شده', 'abandoned', 'dead', 'inactive',
  'پایان یافته', 'منسوخ', 'بایگانی شده',
];

export type StatusVerdict = 'active' | 'discontinued' | 'manual';

export function classifyStatus(raw: string): StatusVerdict {
  let v = raw
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/[ً-ْٰ]/g, '') // harakat: «فعّال» is «فعال»
    .trim()
    .toLowerCase();
  if (!v) return 'active'; // empty -> just remove
  // a value that is nothing but a wikilink, e.g. [[Discontinued]]
  const bare = /^\[\[([^\]|]+)\]\]$/.exec(v);
  if (bare) v = bare[1].trim();
  // Anything carrying a ref, a template call or a date is prose, not a state.
  if (/<ref|\{\{|\[\[|\d{4}|۱۳|۲۰/.test(v)) return 'manual';
  if (DISCONTINUED.some((d) => v === d.toLowerCase() || v.startsWith(d.toLowerCase()))) return 'discontinued';
  if (ACTIVE.some((a) => v === a.toLowerCase() || v.startsWith(a.toLowerCase()))) return 'active';
  return 'manual';
}
