/**
 * L3: the decision ladder. Pure: no network, no clock except what is passed in, so every
 * rule here has a test in decide.test.ts.
 *
 * The ladder is deliberately asymmetric. A missed vandal edit costs a patroller one
 * click; a wrong revert costs a new editor, and on a wiki with 24 active users that is
 * not a cheap thing to lose. So every action needs several independent signals to agree,
 * and any doubt lands on the review page instead.
 */
import { ACT_CONFIDENCE, MAX_ACTIONS_PER_DAY, MAX_WRITES_PER_HOUR, REPORT_CONFIDENCE } from './config.js';
import { ACTIONABLE, type LlmVerdict } from './llm.js';
import type { Flag } from './rules.js';
import type { Tier } from './trust.js';

export type Action = 'revert' | 'tag' | 'report' | 'log';

export interface DecisionInput {
  tier: Tier;
  ns: number;
  isCreation: boolean;
  flags: Flag[];
  /** Fast pass (no thinking). Null when the call failed. */
  pass1: LlmVerdict | null;
  /** Skeptic pass. Only requested when pass 1 could lead to an action. */
  pass2: LlmVerdict | null;
  fingerprintTrusted: boolean;
  /** This edit undoes another low-trust user (Shahbaz's guard). */
  revertsLowTrustUser: boolean;
  /** A revision by a T2/T3 user exists to go back to. */
  hasRevertTarget: boolean;
  /** A T2/T3 user has edited the page since the suspect edit. */
  trustedEditedSince: boolean;
  /** Ledger checks. */
  botAlreadyActedOnPairToday: boolean;
  humanUndidBotOnPair: boolean;
  writesInLastHour: number;
  /** Reverts and tags in the last 24 h. */
  actionsToday: number;
  /** The page is a template/module used on many pages: never auto-revert there. */
  highUseTemplate: boolean;
}

export interface Decision { action: Action; reasons: string[] }

const STRUCTURE_FLAGS = new Set(['no-structure', 'encyclopedic', 'no-language-header', 'tiny-page']);

/**
 * Which verdicts may lead to which action. Set from the first backtest (۲۳ نوامبر ۲۰۲۶),
 * see docs/task-21-wiktionary-antivandal.md §Results.
 *
 * Reverts: only vandalism / spam / test / nonsense. The 10 doubtful reverts out of 82 were
 * almost all `ai_paste` and `not_dictionary` on existing entries: long etymology or
 * encyclopedic additions by editors in a content dispute. Those are content questions, so
 * they go to the review page. With that cut, 57 of 59 reverts were right.
 * For T1 (registered), spam also needs a T0 editor or goes to review: a T1 spam call was
 * one of the two left.
 */
const REVERT_VERDICTS: ReadonlySet<string> = new Set(['vandalism', 'spam', 'test', 'nonsense']);
const REVERT_VERDICTS_T1: ReadonlySet<string> = new Set(['vandalism', 'test', 'nonsense']);
/**
 * Tags: `not_dictionary` needs two independent rule flags. With one, five real (if
 * poor) entries were tagged: a dialect word, a coinage, a fruit, a concept. With two, one
 * of 129 tags was wrong. Everything else actionable may tag on any structure flag.
 */
const TAG_NEEDS_TWO_FLAGS: ReadonlySet<string> = new Set(['not_dictionary']);

function strongPass(v: LlmVerdict | null): boolean {
  return !!v && ACTIONABLE.has(v.verdict) && v.confidence >= ACT_CONFIDENCE && v.verifiedEvidence.length > 0;
}

/** Should the careful second pass be requested at all? */
export function wantsSecondPass(tier: Tier, pass1: LlmVerdict | null): boolean {
  return (tier === 'T0' || tier === 'T1')
    && !!pass1 && ACTIONABLE.has(pass1.verdict) && pass1.confidence >= ACT_CONFIDENCE;
}

export function decide(d: DecisionInput): Decision {
  const reasons: string[] = [];
  if (d.tier === 'T3') return { action: 'log', reasons: ['ویرایشگر مورد اعتماد'] };

  const p1 = d.pass1, p2 = d.pass2;
  const suspicious = !!p1 && ACTIONABLE.has(p1.verdict) && p1.confidence >= REPORT_CONFIDENCE;
  const strongFlag = d.flags.some(f => f.strong);
  const reportOr = (why: string): Decision => {
    reasons.push(why);
    return { action: suspicious || strongFlag ? 'report' : 'log', reasons };
  };

  if (!p1) return reportOr('مدل پاسخ نداد');
  if (d.tier === 'T2') return reportOr('ویرایشگر باسابقه؛ ربات واگردانی نمی‌کند');
  if (!d.fingerprintTrusted) return reportOr('نسخهٔ مدل با نسخهٔ آزموده یکی نیست');
  if (d.revertsLowTrustUser) return reportOr('این ویرایش خودش واگردانی ویرایش کاربر تازه‌کار دیگری است');
  if (d.humanUndidBotOnPair) return reportOr('کاربری پیش‌تر کار ربات را روی همین صفحه و کاربر برگردانده است');
  if (d.botAlreadyActedOnPairToday) return reportOr('ربات امروز یک بار روی همین صفحه و کاربر کار کرده است');
  if (d.writesInLastHour >= MAX_WRITES_PER_HOUR) return reportOr('سقف ویرایش ساعتی پر است');
  if (d.actionsToday >= MAX_ACTIONS_PER_DAY) return reportOr('سقف ویرایش روزانهٔ دورهٔ آزمایشی پر است');
  if (d.trustedEditedSince) return reportOr('کاربر مورد اعتماد پس از این ویرایش صفحه را ویرایش کرده است');
  if (!strongPass(p1) || !strongPass(p2)) {
    return reportOr(p2 ? 'دو بررسی مدل هم‌رأی و مطمئن نبودند' : 'اطمینان مدل کافی نیست');
  }

  if (d.isCreation) {
    if (d.ns !== 0) return reportOr('صفحهٔ تازه بیرون از فضای سرواژه');
    if (!d.flags.some(f => STRUCTURE_FLAGS.has(f.id))) return reportOr('نشانهٔ ساختاری برای برچسب حذف نیست');
    if (TAG_NEEDS_TWO_FLAGS.has(p1.verdict) && d.flags.length < 2) {
      return reportOr('برای «سرواژه نیست» دست‌کم دو نشانهٔ قاعده‌محور لازم است');
    }
    reasons.push(`${p1.verdict} (${p1.confidence.toFixed(2)}/${p2!.confidence.toFixed(2)})`);
    return { action: 'tag', reasons };
  }

  const allowed = d.tier === 'T0' ? REVERT_VERDICTS : REVERT_VERDICTS_T1;
  if (!allowed.has(p1.verdict) || !allowed.has(p2!.verdict)) {
    return reportOr(`رأی «${p1.verdict}» در سرواژهٔ موجود موضوع محتوایی است؛ واگردانی با انسان`);
  }
  if (d.highUseTemplate) return reportOr('الگوی پرکاربرد؛ واگردانی با انسان');
  if (!d.hasRevertTarget) return reportOr('نسخهٔ قابل اعتمادی برای بازگشت نیست');
  if (d.tier !== 'T0' && d.flags.length === 0) return reportOr('هیچ نشانهٔ قاعده‌محوری با رأی مدل همراه نیست');
  reasons.push(`${p1.verdict} (${p1.confidence.toFixed(2)}/${p2!.confidence.toFixed(2)})`);
  return { action: 'revert', reasons };
}
