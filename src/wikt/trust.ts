/**
 * Trust tiers. fa.wiktionary's autoconfirmed is 4 days and ZERO edits (the WMF default;
 * no local override in wmf-config), so it cannot be what separates "may be reverted" from
 * "may not". These tiers can.
 *
 *   T0  IP or temporary account                      → revert, tag, report
 *   T1  registered, < 30 days old OR < 50 local edits → revert, tag, report
 *   T2  everyone else without a trusted group         → report only, never revert
 *   T3  sysop / rollbacker / patroller / autopatrolled / bot / interface-admin → ignored
 *
 * A current block on fa.wikipedia or a global lock moves a T1/T2 account to T0. That is
 * the cross-wiki signal The.shahab's essay describes: of 54 named creators of pages deleted
 * here since late August, 19 are active on fa.wikipedia, 5 are blocked there, 1 is locked.
 */
import { T1_MAX_AGE_DAYS, T1_MAX_EDITS, TRUSTED_GROUPS } from './config.js';

export type Tier = 'T0' | 'T1' | 'T2' | 'T3';

export interface UserFacts {
  name: string;
  /** null for an IP. */
  userid: number | null;
  temp: boolean;
  groups: string[];
  editcount: number;
  registration: string | null;   // ISO
  blockedLocally: boolean;
  blockedOnFawiki: boolean;
  locked: boolean;
}

export function tierOf(u: UserFacts, now: Date = new Date()): Tier {
  if (!u.userid || u.temp) return 'T0';
  if (u.groups.some(g => TRUSTED_GROUPS.includes(g))) return 'T3';
  if (u.blockedLocally || u.blockedOnFawiki || u.locked) return 'T0';
  const ageDays = u.registration
    ? (now.getTime() - Date.parse(u.registration)) / 86_400_000
    : Infinity;   // accounts from before 2005 have no registration date
  if (u.editcount < T1_MAX_EDITS || ageDays < T1_MAX_AGE_DAYS) return 'T1';
  return 'T2';
}

/** The tier as the model sees it. No username: names should not move the verdict. */
export function tierLabel(t: Tier): string {
  return {
    T0: 'unregistered or temporary account',
    T1: 'new account (under 30 days or under 50 edits)',
    T2: 'established account',
    T3: 'trusted account',
  }[t];
}

export const isTempName = (name: string) => name.startsWith('~');
export const isIpName = (name: string) =>
  /^\d{1,3}(\.\d{1,3}){3}$/.test(name) || /^[0-9a-f:]+:[0-9a-f:]*$/i.test(name);
