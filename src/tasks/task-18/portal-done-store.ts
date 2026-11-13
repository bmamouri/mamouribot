/**
 * وظیفهٔ ۱۸ — per-portal memory of articles already decided, so the same portal's
 * candidate list is not re-screened from scratch every run forever.
 *
 * One JSON file per portal (`out/bar-<portal>-done.json`, matching the convention
 * `scripts/portals/add-decade-portal-bar.ts` already uses), keyed by article title.
 *
 * WHAT GETS WRITTEN HERE, AND WHEN
 * ---------------------------------
 * Only outcomes that are decided by a READ, never by whether a later write
 * succeeds — see `add-portal-links.ts` for why that sidesteps needing any
 * post-save callback from `core.ts`:
 *
 *   'missing' | 'redirect' | 'dab' | 'not-article'   — structural, cheap to persist
 *   'already'                                        — the portal link is already there
 *   'rejected-by-human:<revid>'                       — PERMANENT: see revert-guard.ts
 *
 * A genuine candidate that still needs the link added is deliberately NOT written here
 * yet. If the edit saves, the NEXT time this portal is screened `hasPortal()` will see it
 * and this file gains an `already` entry then. If the edit fails for any reason (edit
 * conflict, abuse-filter refusal, render regression), leaving it unwritten means it is
 * simply reconsidered next time — which is the correct behaviour for a continuous task:
 * nothing here needs a write-outcome hook because the live page is the source of truth.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname } from 'path';

const STATE_DIR = () => `${process.env.BOT_STATE_DIR ?? '.state'}/task-18/portal-done`;
const fileFor = (portal: string) => `${STATE_DIR()}/${portal.replace(/[ /]/g, '-')}.json`;

export type DoneRecord = Record<string, string>;

export function loadDone(portal: string): DoneRecord {
  const p = fileFor(portal);
  if (!existsSync(p)) return {};
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return {}; }
}

export function saveDone(portal: string, done: DoneRecord) {
  const p = fileFor(portal);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(done, null, 1));
}

/** True for any entry meaning "a human rejected this exact link on this exact article". */
export const isHumanRejected = (status: string | undefined): boolean =>
  !!status && status.startsWith('rejected-by-human');
