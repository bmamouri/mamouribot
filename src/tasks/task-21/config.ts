/**
 * وظیفهٔ ۲۱: fa.wiktionary anti-vandalism patrol. Every tunable in one place.
 *
 * The design and the measurements behind each number are in
 * docs/task-21-wiktionary-antivandal.md. Change a threshold here, then re-run the backtest
 * (`wikt backtest`) before deploying: the thresholds are only as good as the last
 * backtest that used them.
 */

/** Namespaces the patrol looks at: entries, templates, categories. Never user/talk/project pages. */
export const NAMESPACES = [0, 10, 14] as const;

/** Wait this long after a user's last save on a page before judging it. Editors fix their own edits. */
export const SETTLE_MS = 90_000;

/** Poll interval for list=recentchanges. ~12 edits/day, so a minute is plenty. */
export const POLL_MS = 60_000;

/** Trust tiers (§3.2 of the plan). Autoconfirmed means nothing here: 4 days, 0 edits. */
export const T1_MAX_EDITS = 50;
export const T1_MAX_AGE_DAYS = 30;
/** Groups that make an editor T3: never scored, and a safe revert target. */
export const TRUSTED_GROUPS = ['sysop', 'rollbacker', 'patroller', 'autopatrolled', 'bot', 'interface-admin', 'bureaucrat'];

/** LLM confidence an action needs, in BOTH passes. Report-only below it. */
export const ACT_CONFIDENCE = 0.9;
export const REPORT_CONFIDENCE = 0.6;

/** Hard limits, whatever the score. */
export const MAX_WRITES_PER_HOUR = 10;
/**
 * Reverts and tags per 24 h. The request (ویکی‌واژه:نظرخواهی‌ها/ربات-۲۰۲۶-۱۱/…) promised a
 * trial of at most 5 a day, each checked the same day. Raise it only after reporting the
 * trial there.
 */
export const MAX_ACTIONS_PER_DAY = Number(process.env.WIKT_MAX_ACTIONS_PER_DAY ?? 5);
/** Rebuild the review page at most this often, and only when something new was reported. */
export const REVIEW_PUBLISH_MS = 30 * 60_000;
export const REVIEW_KEEP_DAYS = 7;
export const REVERTS_BEFORE_PROTECT_REPORT = 3;   // same page, 24 h → ask an admin to protect
export const REVERTS_BEFORE_USER_REPORT = 3;      // same user, 24 h → report the user
export const HISTORY_DEPTH = 30;

/** LiftWing. The model id is pinned; the fingerprint is logged and checked. */
export const LLM_MODEL = 'llm-qwen38-27b';
export const LLM_URL =
  `https://api.wikimedia.org/service/lw/inference/v1/models/${LLM_MODEL}/openai/v1/chat/completions`;
/**
 * The serving build the thresholds were validated against. A different fingerprint means
 * different weights or a different vLLM, so the patrol drops to report-only until the
 * backtest is re-run and this is updated. Empty = not pinned yet (dry runs only).
 */
export const LLM_FINGERPRINT = process.env.WIKT_LLM_FINGERPRINT ?? 'vllm-0.32.0-68758053';
export const LLM_TIMEOUT_MS = 60_000;
/** Diffs bigger than this (characters) are not sent to the model; report only. */
export const LLM_MAX_DIFF_CHARS = 24_000;

/** On-wiki pages. NOT created yet: summaries link to them only once they exist. */
export const SYSTEM_PAGE = 'کاربر:MamouriBot/ضدخرابکاری';
export const REPORT_MISTAKE_PAGE = 'کاربر:MamouriBot/ضدخرابکاری/گزارش اشتباه';
export const REVIEW_PAGE = 'کاربر:MamouriBot/ضدخرابکاری/بازبینی';
export const ADMIN_BOARD = 'ویکی‌واژه:تابلوی اعلانات مدیران';

export const SUMMARY_REVERT =
  `واگردانی ویرایش مشکوک به خرابکاری؛ اگر اشتباه است در [[${REPORT_MISTAKE_PAGE}|این صفحه]] بگویید`;
