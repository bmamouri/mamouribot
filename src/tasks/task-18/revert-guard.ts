/**
 * وظیفهٔ ۱۸ — refuse to (re-)add a portal link to an article where a human has already
 * reverted that exact link, whether the adding edit was ours or someone else's.
 *
 * WHY THIS EXISTS
 * ----------------
 * A bot that re-proposes an edit a human explicitly undid is the single fastest way to
 * lose a BRFA, whatever the edit itself looks like in isolation. «avoid false positives
 * completely, even at the cost of missing some articles» (the standing instruction for
 * this task) has to include "an editor already looked at this exact link on this exact
 * article and removed it" — that is a stronger signal than anything the scope heuristic
 * in `portal-scope.ts` can produce, and it overrides it.
 *
 * WHAT COUNTS AS "REVERTED", AND WHY NOT A BROADER TEST
 * -------------------------------------------------------
 * The naive test — "the portal was present in some past revision and is absent now" — has
 * too many innocent causes (an unrelated rewrite, a page blanked and recreated, a dab fix
 * that happened to touch the same line) to be the signal. What this checks instead is
 * narrower and more precise: find a revision that is ITSELF a revert action (MediaWiki's
 * own `mw-manual-revert`/`mw-undo`/`mw-rollback` tags, or an edit summary shaped like one),
 * and confirm that THAT SPECIFIC revision's content lost the portal link relative to its
 * own parent. A revert that undid something else on the same page, leaving our portal link
 * untouched, must not block us — `confirmed` below checks exactly that with the real
 * content, not just the tag.
 *
 * `mw-reverted` (the tag MediaWiki retroactively applies to the revision that GOT
 * reverted) is deliberately not used as a trigger: the revision carrying it is the
 * ADDITION, not the removal, and the removing edit should carry one of the three action
 * tags itself. Relying on `mw-reverted` alone would also fire on reverts of edits that
 * never touched the portal at all.
 *
 * COST
 * ----
 * One metadata-only revision-history GET per candidate (cheap, and the common case —
 * no revert-shaped revision in the window — stops right there). The two content GETs
 * below run only for the rare candidate that actually has a revert-shaped revision in its
 * recent history.
 */
import type { Bot } from '../../core.js';
import { hasPortal } from '../../lib/portal-bar.js';

/** Tags MediaWiki (or Twinkle/Huggle, which fa editors use) applies to a REVERTING edit. */
const REVERT_ACTION_TAGS = new Set(['mw-manual-revert', 'mw-undo', 'mw-rollback']);

/** Summaries shaped like a revert, for editors whose revert tool does not tag the edit. */
const REVERT_SUMMARY_RE = /واگردان|برگردان(?:ده|انده|ید)?|\bundo:|\brv\b|\brvv\b|خنثی‌سازی/i;

/** How far back to look. Older history is not re-examined; see the module header. */
export const HISTORY_WINDOW = 100;

interface RevisionMeta {
  revid: number;
  parentid?: number;
  timestamp: string;
  user?: string;
  comment?: string;
  tags?: string[];
}

export const looksLikeRevertAction = (rev: RevisionMeta): boolean =>
  (rev.tags ?? []).some(t => REVERT_ACTION_TAGS.has(t)) || REVERT_SUMMARY_RE.test(rev.comment ?? '');

export interface RevertFinding {
  blocked: boolean;
  revid?: number;
  timestamp?: string;
  user?: string;
  /** Persian, ready to go straight into a report line. */
  detail?: string;
}

async function revisionContent(bot: Bot, revid: number): Promise<string | null> {
  const r = await bot.apiGet({
    action: 'query', revids: String(revid), prop: 'revisions',
    rvprop: 'content', rvslots: 'main',
  });
  const pg = r.query?.pages?.[0];
  if (!pg || pg.missing || !pg.revisions?.length) return null;
  return pg.revisions[0].slots?.main?.content ?? null;
}

/**
 * Has anyone, at any point in `title`'s recent history, undone a revision that added
 * `portal` (under its canonical name or a redirect)? If so, the portal must not be
 * (re-)proposed on this article — permanently, not just for this run.
 */
export async function portalWasRevertedHere(
  bot: Bot, title: string, portal: string, aliases: string[] = [],
  historyLimit = HISTORY_WINDOW,
): Promise<RevertFinding> {
  const r = await bot.apiGet({
    action: 'query', prop: 'revisions', titles: title,
    rvprop: 'ids|timestamp|user|comment|tags', rvlimit: String(historyLimit),
  });
  const pg = r.query?.pages?.[0];
  if (!pg || pg.missing) return { blocked: false };
  const revs: RevisionMeta[] = pg.revisions ?? [];

  const candidates = revs.filter(looksLikeRevertAction).filter(rev => rev.parentid);
  if (!candidates.length) return { blocked: false };

  for (const rev of candidates) {
    const [after, before] = await Promise.all([
      revisionContent(bot, rev.revid),
      revisionContent(bot, rev.parentid!),
    ]);
    if (before === null || after === null) continue;
    if (hasPortal(before, portal, aliases) && !hasPortal(after, portal, aliases)) {
      return {
        blocked: true, revid: rev.revid, timestamp: rev.timestamp, user: rev.user,
        detail: `ویرایش ${rev.revid}${rev.user ? ` به‌دست ${rev.user}` : ''} ` +
          `پیوند درگاه «${portal}» را از این مقاله برداشته — دیگر پیشنهاد نمی‌شود`,
      };
    }
  }
  return { blocked: false };
}
