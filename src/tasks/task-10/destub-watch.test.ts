/**
 * Unit tests for the de-stub watcher's pure logic. No network.
 *
 *   npx tsx src/tasks/task-10/destub-watch.test.ts
 */
import { dedupeCandidates, nextCheckpoint, laterCheckpoint, type RcEntry, type WatchCheckpoint } from './destub-watch-lib.js';

let fail = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a === b) { console.log(`  ✓ ${label}`); return; }
  console.log(`  ✗ ${label}\n      انتظار: ${b}\n      حاصل  : ${a}`);
  fail++;
}

const e = (title: string, rcid: number, timestamp: string, newlen = 1000, user = 'someone'): RcEntry =>
  ({ title, rcid, timestamp, newlen, user });
const cp0: WatchCheckpoint = { timestamp: '2026-10-01T00:00:00Z', rcid: 100 };

console.log('dedupeCandidates — the boundary');
// rcstart is INCLUSIVE, so the exact entry the checkpoint already points at
// must not come back — otherwise every poll reclassifies it forever.
eq(dedupeCandidates([e('آ', 100, '2026-10-01T00:00:00Z')], cp0), [],
  'the checkpoint entry itself is excluded');
eq(dedupeCandidates([e('آ', 99, '2026-10-01T00:00:00Z')], cp0), [],
  'same timestamp, lower rcid (already behind the checkpoint) is excluded');
eq(dedupeCandidates([e('آ', 101, '2026-10-01T00:00:00Z')], cp0).map(x => x.title), ['آ'],
  'same timestamp, higher rcid is a new entry');
eq(dedupeCandidates([e('آ', 1, '2026-09-30T00:00:00Z')], cp0), [],
  'a timestamp before the checkpoint is excluded');
eq(dedupeCandidates([e('آ', 5, '2026-10-02T00:00:00Z')], cp0).map(x => x.title), ['آ'],
  'a timestamp after the checkpoint is a new entry');

console.log('dedupeCandidates — self-edits');
eq(dedupeCandidates([e('آ', 200, '2026-10-02T00:00:00Z', 1000, 'MamouriBot')], cp0), [],
  "the bot's own edit never re-triggers itself");

console.log('dedupeCandidates — one candidate per title');
eq(dedupeCandidates([
  e('آ', 200, '2026-10-02T00:00:00Z', 1000),
  e('آ', 201, '2026-10-02T00:05:00Z', 1500),
], cp0).length, 1, 'two edits to the same title collapse to one candidate');
eq(dedupeCandidates([
  e('آ', 200, '2026-10-02T00:00:00Z', 1000),
  e('آ', 201, '2026-10-02T00:05:00Z', 1500),
], cp0)[0].newlen, 1500, 'the LATEST size wins, not the first');
eq(dedupeCandidates([
  e('آ', 201, '2026-10-02T00:05:00Z', 1500),   // later edit listed first
  e('آ', 200, '2026-10-02T00:00:00Z', 1000),
], cp0)[0].newlen, 1500, 'latest wins regardless of input order');
eq(dedupeCandidates([e('آ', 200, '2026-10-02T00:00:00Z'), e('ب', 201, '2026-10-02T00:00:00Z')], cp0)
  .map(x => x.title).sort(), ['آ', 'ب'], 'distinct titles both survive');

console.log('nextCheckpoint');
eq(nextCheckpoint([], cp0), cp0, 'no entries: checkpoint unchanged');
eq(nextCheckpoint([e('آ', 150, '2026-10-02T00:00:00Z')], cp0),
  { timestamp: '2026-10-02T00:00:00Z', rcid: 150 }, 'advances to the single entry');
eq(nextCheckpoint([
  e('آ', 150, '2026-10-02T00:00:00Z'),
  e('ب', 160, '2026-10-02T00:10:00Z'),
  e('پ', 140, '2026-10-01T23:00:00Z'),   // out of order, earlier than the others
], cp0), { timestamp: '2026-10-02T00:10:00Z', rcid: 160 },
  'advances to the LATEST entry, not the last one in the array');
// Same timestamp, higher rcid still counts as later — the same rule
// dedupeCandidates uses for the boundary, so the two stay consistent.
eq(nextCheckpoint([
  e('آ', 150, '2026-10-02T00:00:00Z'),
  e('ب', 151, '2026-10-02T00:00:00Z'),
], cp0), { timestamp: '2026-10-02T00:00:00Z', rcid: 151 },
  'same timestamp: higher rcid wins');
// The pagination-cap case: nextCheckpoint only ever sees what was fetched, so
// a truncated poll naturally stops the checkpoint at the fetched edge instead
// of jumping to "now" and silently dropping the rest of the backlog.
eq(nextCheckpoint([e('آ', 150, '2026-10-02T00:00:00Z')], cp0).timestamp < '2026-12-01T00:00:00Z', true,
  'checkpoint only ever reflects fetched entries, never "now"');

console.log('laterCheckpoint');
// This is the fix for a real bug caught on the first live Toolforge run: two
// consecutive polls each found zero recentchanges entries and NEITHER ever
// wrote a checkpoint file, because nextCheckpoint() has nothing to derive from
// when `entries` is empty. Without advancing to "now" in that case, every
// future poll re-derives its own "now" from scratch and silently loses
// whatever real edits happened in the gap between polls.
eq(laterCheckpoint(cp0, { timestamp: '2026-10-02T00:00:00Z', rcid: 0 }),
  { timestamp: '2026-10-02T00:00:00Z', rcid: 0 }, 'a later timestamp wins even with rcid 0');
eq(laterCheckpoint(cp0, { timestamp: '2026-09-01T00:00:00Z', rcid: 999 }), cp0,
  'an earlier timestamp loses even with a huge rcid');
eq(laterCheckpoint(cp0, { timestamp: cp0.timestamp, rcid: cp0.rcid - 1 }), cp0,
  'same timestamp, lower rcid: the original wins');
eq(laterCheckpoint(cp0, { timestamp: cp0.timestamp, rcid: cp0.rcid + 1 }),
  { timestamp: cp0.timestamp, rcid: cp0.rcid + 1 }, 'same timestamp, higher rcid wins');
eq(laterCheckpoint(cp0, cp0), cp0, 'identical checkpoints: either one, unchanged');

console.log(fail === 0 ? '\nهمهٔ آزمون‌ها موفق.' : `\n${fail} آزمون ناموفق.`);
process.exit(fail === 0 ? 0 : 1);
