/**
 * Linking every edit back to the permission that authorises it.
 *
 * THE CONVENTION, AND WHERE IT COMES FROM
 * ---------------------------------------
 * A reader who sees a bot edit should be able to find out, in one click, which approval
 * allowed it. Both wikis solve that the same way, and it is NOT by printing a task
 * number: the word «ربات» / "Bot" at the start of the summary is itself a WIKILINK to the
 * page that authorises the edit.
 *
 * Sampled from live recent changes on ۸ اکتبر ۲۰۲۶:
 *
 *   en.wikipedia, 500 bot edits   →   0 wrote "Task N" as text
 *                                   211 linked the approval, e.g.
 *       [[Wikipedia:Bots/Requests for approval/VWF bot 6|Bot]]: Delink 'Country' in …
 *
 *   fa.wikipedia, same shape:
 *       [[ویکی‌پدیا:رده‌دهی مقالات همسنگ|ربات]]: افزودن رده‌های همسنگ      (HujiBot)
 *       [[وپ:دار|ربات: انتقال رده]] به درخواست …                          (Dexbot)
 *
 * A bare number would be worse than useless to a reader who does not already know the
 * bot: «وظیفه ۳» means nothing without the page it refers to. A link means everything,
 * and costs the same.
 *
 * fa's own bot policy asks only that bots «اطلاع دهند که چه می‌کنند», which this
 * satisfies more completely than prose can.
 *
 * WHY THIS IS CHECKED AT RUNTIME
 * ------------------------------
 * A summary that links a page which does not exist shows a RED LINK on every single edit,
 * and no red-link check in this framework looks at summaries. وظیفهٔ ۱۳ and ۱۴ have no
 * request page yet (verified ۸ اکتبر ۲۰۲۶), so the prefix cannot simply be assumed from
 * the task number. `Bot.brfaPrefix()` asks the API once per run and falls back to no
 * prefix, loudly, when the page is missing.
 */

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

/** 13 → «۱۳». Page titles use Persian digits, so a Latin-digit title is a red link. */
export function faDigits(n: number): string {
  return String(n).replace(/\d/g, d => FA_DIGITS[Number(d)]);
}

/** The permission request page for a task number. */
export function brfaPage(taskNumber: number): string {
  return `ویکی‌پدیا:سیاست ربات‌رانی/درخواست مجوز/MamouriBot/وظیفه ${faDigits(taskNumber)}`;
}

/**
 * Prefix a task's summary with a link to its permission.
 *
 * A task whose own summary already opens with «ربات:» loses that word, so the result
 * reads «[[…|ربات]]: …» once rather than «[[…|ربات]]: ربات: …» — وظیفهٔ ۷ is written that
 * way and would otherwise say it twice.
 */
export function withBrfaLink(taskNumber: number, summary: string): string {
  const body = summary.replace(/^\s*ربات\s*:\s*/, '');
  return `[[${brfaPage(taskNumber)}|ربات]]: ${body}`;
}

/**
 * Edit summaries are capped at 500 characters by MediaWiki; past that the API silently
 * truncates, which would cut the summary mid-sentence rather than drop the link. The
 * longest task summary here comes to 184 characters with the prefix, so this is a guard
 * against a future task rather than a live concern.
 */
export const SUMMARY_LIMIT = 500;

export function fitsSummaryLimit(s: string): boolean {
  return [...s].length <= SUMMARY_LIMIT;
}
